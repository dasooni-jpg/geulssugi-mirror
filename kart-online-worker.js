/*
 * 우리 반 카트 그랑프리 — 온라인 방 서버 (Cloudflare Worker + Durable Object)
 * ─────────────────────────────────────────────────────────────────────────
 * ★ Cloudflare에 올릴 파일은 이 파일 하나입니다. ★
 *   (게임 화면 kart/index.html 은 Cloudflare에 올리지 않습니다.
 *    GitHub Pages가 대신 보여 줍니다.)
 *
 * 선생님 컴퓨터를 켜 두지 않아도, 학생들이 방 번호 6자리만으로
 * 같은 경기장에서 실시간으로 함께 달릴 수 있게 해 줍니다.
 *
 * ■ 서버 없이도 되는 것
 *   혼자 달리기 · 둘이 나눠 달리기 · 기록 도전은 이 서버가 없어도 그대로 작동합니다.
 *   이 서버는 "친구들과 함께 달리기"(최대 8명) 하나만을 위한 것입니다.
 *
 * ■ 배포 방법 (Cloudflare 대시보드에서 한 번만)
 *   1. Workers & Pages → Create → Worker 만들기 (이름 예: kart-rooms)
 *   2. 이 파일 내용을 편집기에 그대로 붙여넣기
 *   3. Settings → Durable Objects 바인딩 추가
 *        - Variable name : KART_ROOM   (반드시 이 이름 그대로)
 *        - Class name    : KartRoom
 *      ※ 무료 요금제에서는 SQLite 방식 Durable Object만 됩니다.
 *        대시보드에서 마이그레이션을 물어보면 "new_sqlite_classes"를 고르세요.
 *        wrangler로 배포한다면 wrangler.toml에 아래를 넣습니다.
 *
 *        [[durable_objects.bindings]]
 *        name = "KART_ROOM"
 *        class_name = "KartRoom"
 *
 *        [[migrations]]
 *        tag = "v1"
 *        new_sqlite_classes = ["KartRoom"]
 *
 *   4. Deploy 후 나온 주소(예: https://kart-rooms.내계정.workers.dev)를
 *      게임 화면의 [친구들과 함께 달리기 → 접속 서버] 칸에 넣고 "주소 저장"
 *      (또는 kart/index.html 의 DEFAULT_SERVER 상수에 미리 적어 두면
 *       학생은 주소를 입력할 필요가 없습니다.)
 *
 * ■ 잘 됐는지 확인하는 법
 *   브라우저 주소창에  https://내주소.workers.dev/api/health  를 넣었을 때
 *   {"ok":true, ...} 가 보이면 성공입니다.
 *
 * ■ 주고받는 것
 *   별명 · 카트 색 · 카트의 위치와 속도뿐입니다.
 *   실명·사진·연락처 같은 개인정보는 받지도, 저장하지도 않습니다.
 *   방은 모두가 나가면 즉시 사라지며, 어떤 기록도 남기지 않습니다.
 */

const MAX_PLAYERS = 8;
const COLOR_COUNT = 8;

/* 교실에서 쓰기 편하도록 어느 주소에서 열어도 되게 둡니다.
   오가는 값이 별명과 카트 좌표뿐이라 민감한 정보가 없습니다. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

/** 별명을 안전하게 다듬음 (길이 제한 + 꺾쇠 제거) */
function cleanName(s) {
  return String(s || '')
    .replace(/[<>&"'\\]/g, '')
    .trim()
    .slice(0, 8) || '이름없음';
}

/* ══════════════════════════════════════════════════════════════
   방 하나 = Durable Object 하나
   ══════════════════════════════════════════════════════════════ */
export class KartRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];        // {ws, id, name, color}
    this.track = 'snow';
    this.laps = 3;
    this.seq = 0;
    this.racing = false;
  }

  players() {
    const hostId = this.sessions.length ? this.sessions[0].id : null;
    return this.sessions.map(s => ({
      id: s.id, name: s.name, color: s.color, host: s.id === hostId,
    }));
  }
  hostId() { return this.sessions.length ? this.sessions[0].id : null; }

  broadcast(obj, exceptId) {
    const msg = JSON.stringify(obj);
    for (const s of this.sessions) {
      if (exceptId && s.id === exceptId) continue;
      try { s.ws.send(msg); } catch (e) { /* 끊어진 소켓은 close에서 정리됨 */ }
    }
  }
  sendPlayers() {
    this.broadcast({ t: 'players', players: this.players(), host: this.hostId(),
                     track: this.track, laps: this.laps });
  }

  /** 아직 아무도 안 쓰는 카트 색 고르기 */
  pickColor(want) {
    const used = new Set(this.sessions.map(s => s.color));
    const w = Number(want);
    if (Number.isInteger(w) && w >= 0 && w < COLOR_COUNT && !used.has(w)) return w;
    for (let c = 0; c < COLOR_COUNT; c++) if (!used.has(c)) return c;
    return 0;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // 방 번호가 이미 쓰이는지 확인 (방 만들 때 겹치지 않게)
    if (url.pathname === '/probe') {
      return json({ used: this.sessions.length > 0 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('웹소켓 연결이 필요합니다.', { status: 426, headers: CORS });
    }

    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();

    if (this.sessions.length >= MAX_PLAYERS) {
      server.send(JSON.stringify({ t: 'full' }));
      try { server.close(1000, 'full'); } catch (e) {}
      return new Response(null, { status: 101, webSocket: client });
    }

    const me = {
      ws: server,
      id: 'p' + (++this.seq),
      name: cleanName(url.searchParams.get('name')),
      color: this.pickColor(url.searchParams.get('color')),
    };
    this.sessions.push(me);

    server.send(JSON.stringify({
      t: 'room', you: me.id, host: this.hostId(),
      players: this.players(), track: this.track, laps: this.laps,
    }));
    this.broadcast({ t: 'players', players: this.players(), host: this.hostId(),
                     track: this.track, laps: this.laps }, me.id);

    server.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      const isHost = this.hostId() === me.id;

      switch (m.t) {
        // 위치 알림 — 가장 자주 오가는 메시지. 그대로 다른 사람들에게 넘김
        case 's':
          this.broadcast({
            t: 's', id: me.id,
            x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, h: +m.h || 0,
            v: +m.v || 0, r: +m.r || 0, l: m.l | 0, p: +m.p || 0, f: m.f | 0,
          }, me.id);
          break;

        // 아이템 사용
        case 'i':
          this.broadcast({ t: 'i', id: me.id, k: String(m.k || '').slice(0, 12),
                           x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, h: +m.h || 0 }, me.id);
          break;

        // 완주
        case 'fin':
          this.broadcast({ t: 'fin', id: me.id, ms: m.ms | 0, best: m.best | 0 }, me.id);
          break;

        // 방장이 경기장·바퀴 수를 고름
        case 'setup':
          if (!isHost) break;
          this.track = String(m.track || 'snow').slice(0, 16);
          this.laps = Math.min(9, Math.max(1, m.laps | 0 || 3));
          this.broadcast({ t: 'setup', track: this.track, laps: this.laps });
          break;

        // 방장이 출발 신호
        case 'go':
          if (!isHost) break;
          this.track = String(m.track || this.track).slice(0, 16);
          this.laps = Math.min(9, Math.max(1, m.laps | 0 || this.laps));
          this.racing = true;
          this.broadcast({ t: 'go', track: this.track, laps: this.laps,
                           seed: m.seed | 0, players: this.players() });
          break;

        // 대기실로 돌아감
        case 'back':
          this.racing = false;
          this.broadcast({ t: 'back', id: me.id }, me.id);
          break;
      }
    });

    const bye = () => {
      const i = this.sessions.indexOf(me);
      if (i < 0) return;
      this.sessions.splice(i, 1);
      this.sendPlayers();
    };
    server.addEventListener('close', bye);
    server.addEventListener('error', bye);

    return new Response(null, { status: 101, webSocket: client });
  }
}

/* ══════════════════════════════════════════════════════════════
   입구 — 방 만들기 · 방 접속 · 상태 확인
   ══════════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    if (url.pathname === '/api/health') {
      return json({ ok: true, name: '우리 반 카트 그랑프리 방 서버', max: MAX_PLAYERS });
    }
    if (!env.KART_ROOM) {
      return json({ ok: false, reason: 'durable_object_not_bound',
                    hint: 'Worker 설정에서 KART_ROOM 이름으로 KartRoom 클래스를 연결해 주세요.' }, 500);
    }

    // 아직 아무도 안 쓰는 방 번호 하나 만들어 주기
    if (url.pathname === '/api/new') {
      for (let i = 0; i < 10; i++) {
        const code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        const stub = env.KART_ROOM.get(env.KART_ROOM.idFromName(code));
        const r = await stub.fetch('https://kart/probe');
        const j = await r.json().catch(() => ({ used: true }));
        if (!j.used) return json({ room: code });
      }
      return json({ ok: false, reason: '방 번호를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 503);
    }

    // 방에 들어가기 (웹소켓)
    if (url.pathname === '/api/ws') {
      const room = String(url.searchParams.get('room') || '');
      if (!/^\d{4,8}$/.test(room)) {
        return json({ ok: false, reason: '방 번호는 숫자 4~8자리여야 합니다.' }, 400);
      }
      const stub = env.KART_ROOM.get(env.KART_ROOM.idFromName(room));
      return stub.fetch(request);
    }

    return json({ ok: false, reason: 'unknown_route' }, 404);
  },
};
