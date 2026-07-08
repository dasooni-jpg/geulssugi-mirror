/*
 * 어린이 체스 교실 — 온라인 대결 방 서버 (Cloudflare Worker + Workers KV)
 * ──────────────────────────────────────────────────────────
 * 선생님 컴퓨터를 켜두지 않아도, 학생들이 아무 때나 접속해서
 * 온라인 대결을 할 수 있도록 방 정보를 Cloudflare에 저장합니다.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Workers & Pages → Create → Worker 생성 (이름 예: chess-rooms)
 *  2. 이 파일 내용을 그대로 붙여넣고 Deploy
 *  3. Workers KV → Create a namespace (이름 예: CHESS_ROOMS) 생성
 *  4. Worker → Settings → Bindings → Add → KV Namespace
 *     - Variable name: ROOMS_KV  (반드시 이 이름 그대로!)
 *     - KV namespace: 위에서 만든 CHESS_ROOMS 선택
 *  5. 배포된 Worker 주소(예: https://chess-rooms.내계정.workers.dev)를
 *     chess/index.html 맨 위쪽의 CHESS_API_BASE 상수에 붙여넣기
 *
 * ✅ 무료: 읽기 하루 10만 회, 쓰기 하루 1,000회 — 교실 수업에 충분!
 * 방 정보는 30분간 활동이 없으면 자동으로 사라집니다(KV TTL).
 */

const ALLOWED_ORIGINS = [
  "https://dasooni-jpg.github.io",
  "http://localhost:5100",
];
const ROOM_TTL_SECONDS = 1800; // 30분

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) },
  });
}

function roomDto(room) {
  return {
    roomCode: room.roomCode,
    status: room.status,
    hostName: room.hostName,
    guestName: room.guestName,
    moves: room.moves,
    currentTurn: room.currentTurn,
    result: room.result,
    winner: room.winner,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

async function generateRoomCode(kv) {
  for (let i = 0; i < 8; i++) {
    const code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    const existing = await kv.get(code);
    if (!existing) return code;
  }
  throw new Error("방 번호를 만들지 못했어요. 다시 시도해 주세요.");
}

async function saveRoom(kv, room) {
  room.updatedAt = new Date().toISOString();
  await kv.put(room.roomCode, JSON.stringify(room), { expirationTtl: ROOM_TTL_SECONDS });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\//, "");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }
    if (!env.ROOMS_KV) {
      return json({ ok: false, reason: "kv_not_bound" }, request, 500);
    }

    try {
      if (route === "createRoom" && request.method === "POST") {
        const body = await request.json();
        const roomCode = await generateRoomCode(env.ROOMS_KV);
        const now = new Date().toISOString();
        const room = {
          roomCode, status: "waiting",
          hostName: String(body.hostName || "기사님"), guestName: null,
          moves: "[]", currentTurn: "white",
          result: null, winner: null,
          createdAt: now, updatedAt: now,
        };
        await saveRoom(env.ROOMS_KV, room);
        return json(roomDto(room), request);
      }

      if (route === "joinRoom" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.roomCode || "");
        const raw = await env.ROOMS_KV.get(code);
        if (!raw) return json(null, request);
        const room = JSON.parse(raw);
        if (room.status !== "waiting") return json(null, request);
        room.guestName = String(body.guestName || "친구");
        room.status = "playing";
        await saveRoom(env.ROOMS_KV, room);
        return json(roomDto(room), request);
      }

      if (route === "makeMove" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.roomCode || "");
        const raw = await env.ROOMS_KV.get(code);
        if (!raw) return json(null, request);
        const room = JSON.parse(raw);
        room.moves = String(body.moves || "[]");
        room.currentTurn = String(body.nextTurn || room.currentTurn);
        if (body.finished) {
          room.status = "finished";
          room.result = String(body.finished.result || "");
          room.winner = body.finished.winner ? String(body.finished.winner) : null;
        }
        await saveRoom(env.ROOMS_KV, room);
        return json(roomDto(room), request);
      }

      if (route === "resign" && request.method === "POST") {
        const body = await request.json();
        const code = String(body.roomCode || "");
        const raw = await env.ROOMS_KV.get(code);
        if (!raw) return json(null, request);
        const room = JSON.parse(raw);
        room.status = "finished";
        room.result = "resign";
        room.winner = body.color === "white" ? "black" : "white";
        await saveRoom(env.ROOMS_KV, room);
        return json(roomDto(room), request);
      }

      if (route === "getRoom" && request.method === "GET") {
        const code = url.searchParams.get("roomCode") || "";
        const raw = await env.ROOMS_KV.get(code);
        return json(raw ? roomDto(JSON.parse(raw)) : null, request);
      }

      return json({ ok: false, reason: "unknown_route" }, request, 404);
    } catch (e) {
      return json({ ok: false, reason: "exception", detail: e.message }, request, 500);
    }
  },
};
