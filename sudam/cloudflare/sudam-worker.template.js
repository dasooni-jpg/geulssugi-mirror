/*
 * 수담(數談) v2 — 논쟁 지속형 수학 토론 소프트웨어 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 학생 화면(index.html)과 교사 백엔드 API(/api/*)를 이 워커 하나가 함께 제공합니다.
 * 학생 기기는 생성형 AI를 직접 호출하지 않고(C3), 이 워커가 대신 Google Gemini를 호출합니다.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-sudam-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(sudam/index.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Workers & Pages → Create → Worker 생성 (이름 예: sudam)
 *  2. 이 파일(sudam-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 미리 만들어 둔 데이터베이스 선택 (이름 예: sudam)
 *     ※ D1 을 연결해야 여러 기기가 같은 토론방에 함께 들어갈 수 있습니다.
 *       연결하지 않으면 화면은 열리지만 방 공유가 되지 않습니다.
 *  4. Worker → Settings → Variables and Secrets → Add (Type: Secret)
 *     - GEMINI_API_KEY = (Google AI Studio 에서 발급받은 Gemini 키)
 *     ※ 키는 서버에만 저장되고 학생 화면으로 절대 전달되지 않습니다(C3).
 *       키가 없어도 토론 기능은 모두 동작하며, 반례 카드만 사전 준비본을 씁니다.
 *  5. (선택) Type: Text 로 아래 값 추가
 *     - CLASS_CODE   = 4자리 교실 코드 (기본 0000, 외부 오남용 차단)
 *     - GEMINI_MODEL = gemini-flash-lite-latest (기본값)
 *     - CF_AIG_ACCOUNT_ID / CF_AIG_GATEWAY : AI Gateway 경유가 필요할 때만
 *
 * 개인정보: 실명·사진·연락처 필드 없음(출석번호+별명만, C2).
 *          로그에 학생 발화 내용을 남기지 않음. 음성 원본은 저장하지 않음.
 */

const APP_HTML = __APP_HTML__;

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const GEMINI_MODEL_DEFAULT = "gemini-flash-lite-latest";

// ===== 반례 카드 생성 지침 (C5: 결론·정답 금지, 질문만) =====
const COUNTER_SYSTEM = [
  "너는 초등학교 6학년 수학 토론 수업에서 교사를 돕는 '반례 카드' 작성자다.",
  "학생들의 토론이 한쪽으로 쏠려 일찍 끝나려 할 때, 다시 생각하게 만드는 질문을 만든다.",
  "",
  "반드시 지킬 규칙:",
  "1) 정답·결론·풀이를 절대 담지 마라. 오직 '질문'만 쓴다.",
  "2) 어느 편이 옳다고 암시하지 마라. 양쪽 모두를 흔드는 질문이어야 한다.",
  "3) 초등학교 6학년이 이해할 수 있는 짧고 쉬운 문장으로 쓴다.",
  "4) 한 장에 한 질문. 두 문장을 넘기지 마라.",
  "5) 학생들이 놓친 조건이나 경계 사례를 건드려라.",
  "6) 서술형 단정문('~이다', '~해야 한다')으로 끝내지 마라. 물음으로 끝내라."
].join("\n");

const COUNTER_SCHEMA = {
  type: "OBJECT",
  properties: { cards: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["cards"]
};

// ═══════════════ 공통 도우미 ═══════════════
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
function classCode(env) { return String(env.CLASS_CODE || "0000").trim(); }
function checkCode(env, code) { return String(code || "").trim() === classCode(env); }
// 학생 발화 내용은 남기지 않는 안전 로그
function logSafe(route, note) {
  console.log(`[${new Date().toISOString()}] ${route} | ${note}`);
}

// ═══════════════ D1 저장소 ═══════════════
// 방 상태는 서버에 두어야 여러 기기가 같은 화면을 봅니다.
// 저장하는 것은 출석번호·별명·주장·근거뿐이며 실명·연락처는 받지 않습니다(C2).
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady || !db) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS responses (
    code TEXT NOT NULL, seat_no INTEGER NOT NULL, round INTEGER NOT NULL,
    data TEXT NOT NULL, PRIMARY KEY (code, seat_no, round))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS counters (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, text TEXT NOT NULL)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS problems (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, data TEXT NOT NULL)`).run();
  schemaReady = true;
}
async function getRoom(db, code) {
  const row = await db.prepare("SELECT data FROM rooms WHERE code = ?").bind(code).first();
  return row ? JSON.parse(row.data) : null;
}
async function putRoom(db, room) {
  await db.prepare("INSERT OR REPLACE INTO rooms (code, data, updated_at) VALUES (?, ?, ?)")
    .bind(room.code, JSON.stringify(room), new Date().toISOString()).run();
}
async function listResponses(db, code) {
  const r = await db.prepare("SELECT data FROM responses WHERE code = ? ORDER BY seat_no, round")
    .bind(code).all();
  return (r.results || []).map(x => JSON.parse(x.data));
}
async function listCounters(db, code) {
  const r = await db.prepare("SELECT text FROM counters WHERE code = ? ORDER BY id").bind(code).all();
  return (r.results || []).map(x => x.text);
}
async function listProblems(db, code) {
  const r = await db.prepare("SELECT data FROM problems WHERE code = ? ORDER BY id").bind(code).all();
  return (r.results || []).map(x => JSON.parse(x.data));
}

// ═══════════════ Gemini (반례 카드 · 음성 인식) ═══════════════
function geminiEndpoint(env, model) {
  const useGateway = env.CF_AIG_ACCOUNT_ID && env.CF_AIG_GATEWAY;
  return useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_AIG_ACCOUNT_ID}/${env.CF_AIG_GATEWAY}/google-ai-studio/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
// 모델 응답에서 카드 목록을 안전하게 뽑아냄
function parseCards(raw) {
  let s = String(raw || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const o = JSON.parse(s);
    if (o && Array.isArray(o.cards)) {
      const out = o.cards.map(x => String(x).trim()).filter(Boolean).slice(0, 3);
      if (out.length) return out;
    }
    if (Array.isArray(o)) {
      const out = o.map(x => String(x).trim()).filter(Boolean).slice(0, 3);
      if (out.length) return out;
    }
  } catch { /* 줄 단위 폴백 */ }
  return s.split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'\s]+|["'\s]+$/g, "").trim())
    .filter(Boolean).slice(0, 3);
}

async function generateCounterCards(env, ctx) {
  if (!env.GEMINI_API_KEY) throw new Error("ai_unconfigured");
  const model = env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
  const claims = (ctx.claims || []).slice(0, 12)
    .map((c, i) => `${i + 1}) [${c.stance}] ${String(c.reason || "").slice(0, 80)}`).join("\n");
  const userMsg = [
    ctx.unit ? `단원: ${ctx.unit}` : "",
    ctx.typeName ? `과제 유형: ${ctx.typeName}` : "",
    `오늘의 논제: ${ctx.prompt}`,
    ctx.issue ? `예상 쟁점: ${ctx.issue}` : "",
    claims ? `\n학생들이 낸 근거:\n${claims}` : "",
    "",
    "위 토론이 한쪽으로 쏠려 끝나지 않도록, 학생들이 다시 생각하게 만드는 반례 질문 2개를 만들어라.",
    "답을 알려 주지 말고 질문만 써라."
  ].filter(Boolean).join("\n");

  let res, body;
  try {
    res = await fetch(geminiEndpoint(env, model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: COUNTER_SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userMsg }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: COUNTER_SCHEMA,
          maxOutputTokens: 1024
          // thinkingConfig 는 넣지 않음: -latest 별칭이 새 모델로 갱신될 때
          // 숫자형 thinkingBudget 이 400 오류를 유발한 사례가 있어 생략함.
        }
      })
    });
  } catch { throw new Error("ai_network"); }
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body) throw new Error("ai_http_" + res.status);
  const cand = body.candidates && body.candidates[0];
  if (!cand) throw new Error("ai_empty");
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION") throw new Error("ai_refused");
  const text = ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("");
  const cards = parseCards(text);
  if (!cards.length) throw new Error("ai_empty");
  return cards;
}

async function transcribe(env, audioBlob) {
  if (!env.GEMINI_API_KEY) throw new Error("stt_unconfigured");
  const model = env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
  const mimeType = audioBlob.type || "audio/webm";
  const b64 = bufferToBase64(await audioBlob.arrayBuffer());   // 음성은 저장하지 않고 그대로 전달
  let res, body;
  try {
    res = await fetch(geminiEndpoint(env, model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inline_data: { mime_type: mimeType, data: b64 } },
          { text: "이 음성을 한국어로 정확히 받아써라. 초등학생의 발화다. 설명 없이 받아쓴 문장만 출력하라." }
        ]}],
        generationConfig: { maxOutputTokens: 512 }
      })
    });
  } catch { throw new Error("stt_network"); }
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok || !body) throw new Error("stt_http_" + res.status);
  const cand = body.candidates && body.candidates[0];
  if (!cand) throw new Error("stt_empty");
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION") throw new Error("stt_refused");
  return ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("").trim();
}

// ═══════════════ 라우트 ═══════════════
async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function handleRoomCreate(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  const room = d.room || {};
  if (!room.code) return json({ ok: false, reason: "no_code" }, 400);
  await putRoom(env.DB, room);
  logSafe("/api/room/create", `room=${room.code} lesson=${room.lesson} type=${room.taskType}`);
  return json({ ok: true, code: room.code });
}

async function handleRoomGet(env, url) {
  const code = url.searchParams.get("code");
  if (!code) return json({ ok: false, reason: "no_code" }, 400);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  const room = await getRoom(env.DB, code);
  if (!room) return json({ ok: false, reason: "not_found" }, 404);
  const [responses, counters, problems] = await Promise.all([
    listResponses(env.DB, code), listCounters(env.DB, code), listProblems(env.DB, code)
  ]);
  return json({ ok: true, room, responses, counters, problems });
}

async function handleRespond(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  const r = d.response || {};
  if (!d.code || !r.seatNo || !r.round) return json({ ok: false, reason: "bad_request" }, 400);
  // 기존 반응 수(동의·반론)는 보존하고 본문만 갱신함
  const prev = await env.DB.prepare(
    "SELECT data FROM responses WHERE code = ? AND seat_no = ? AND round = ?")
    .bind(d.code, r.seatNo, r.round).first();
  const merged = prev ? { ...JSON.parse(prev.data), ...r } : r;
  await env.DB.prepare(
    "INSERT OR REPLACE INTO responses (code, seat_no, round, data) VALUES (?, ?, ?, ?)")
    .bind(d.code, r.seatNo, r.round, JSON.stringify(merged)).run();
  logSafe("/api/room/respond", `room=${d.code} seat=${r.seatNo} round=${r.round} stance=${r.stance}`);
  return json({ ok: true });
}

async function handleReact(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  const row = await env.DB.prepare(
    "SELECT data FROM responses WHERE code = ? AND seat_no = ? AND round = ?")
    .bind(d.code, d.seatNo, d.round).first();
  if (!row) return json({ ok: false, reason: "not_found" }, 404);
  const obj = JSON.parse(row.data);
  const kind = d.kind === "object" ? "object" : "agree";
  obj[kind] = (obj[kind] || 0) + 1;
  await env.DB.prepare("UPDATE responses SET data = ? WHERE code = ? AND seat_no = ? AND round = ?")
    .bind(JSON.stringify(obj), d.code, d.seatNo, d.round).run();
  // 반론을 건 학생 쪽에도 기록함(수집 양식의 반론제기수)
  if (kind === "object" && d.fromSeatNo) {
    const mine = await env.DB.prepare("SELECT seat_no, round, data FROM responses WHERE code = ? AND seat_no = ?")
      .bind(d.code, d.fromSeatNo).all();
    for (const m of (mine.results || [])) {
      const o = JSON.parse(m.data);
      o.objectMade = (o.objectMade || 0) + 1;
      await env.DB.prepare("UPDATE responses SET data = ? WHERE code = ? AND seat_no = ? AND round = ?")
        .bind(JSON.stringify(o), d.code, m.seat_no, m.round).run();
    }
  }
  return json({ ok: true });
}

async function handlePhase(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  const room = await getRoom(env.DB, d.code);
  if (!room) return json({ ok: false, reason: "not_found" }, 404);
  room.phase = d.phase;
  await putRoom(env.DB, room);
  return json({ ok: true });
}

async function handleCounter(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  if (!d.code || !d.text) return json({ ok: false, reason: "bad_request" }, 400);
  await env.DB.prepare("INSERT INTO counters (code, text) VALUES (?, ?)").bind(d.code, d.text).run();
  return json({ ok: true });
}

async function handleProblem(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  if (!env.DB) return json({ ok: false, reason: "no_db" }, 503);
  if (!d.code || !d.problem) return json({ ok: false, reason: "bad_request" }, 400);
  await env.DB.prepare("INSERT INTO problems (code, data) VALUES (?, ?)")
    .bind(d.code, JSON.stringify(d.problem)).run();
  return json({ ok: true });
}

// 반례 카드 생성 — 교사만 요청함(학생 기기는 AI를 직접 부르지 않음, C3)
async function handleCounterCard(env, request) {
  const d = await readJson(request);
  if (!checkCode(env, d.classCode)) return json({ ok: false, reason: "bad_class_code" }, 403);
  try {
    const cards = await generateCounterCards(env, d);
    logSafe("/api/counter-card", `ok (${cards.length} cards)`);
    return json({ ok: true, cards });
  } catch (err) {
    logSafe("/api/counter-card", `failed: ${err.message}`);
    // 실패해도 수업이 멈추지 않도록 화면이 준비된 카드로 대신하게 함
    return json({ ok: true, cards: [], demo: true });
  }
}

// 음성 받아쓰기 (보조 입력)
async function handleStt(env, request) {
  let form;
  try { form = await request.formData(); } catch { return json({ ok: false, reason: "bad_form" }, 400); }
  if (!checkCode(env, form.get("classCode"))) return json({ ok: false, reason: "bad_class_code" }, 403);
  const audio = form.get("audio");
  if (!audio || typeof audio.arrayBuffer !== "function" || audio.size === 0) {
    return json({ ok: false, reason: "no_audio" }, 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) return json({ ok: false, reason: "audio_too_large" }, 413);
  logSafe("/api/stt", `audio ${audio.size} bytes`);   // 발화 내용은 기록하지 않음
  try {
    const text = await transcribe(env, audio);
    return json({ ok: true, text });
  } catch (err) {
    logSafe("/api/stt", `failed: ${err.message}`);
    return json({ ok: false, reason: "stt_failed" }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type" } });
    }

    if ((method === "GET" || method === "HEAD") && (path === "/" || path === "/index.html")) {
      return new Response(APP_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    try {
      if (env.DB) await ensureSchema(env.DB);

      if (path === "/api/health" && method === "GET") {
        return json({ ok: true, db: !!env.DB, ai: !!env.GEMINI_API_KEY });
      }
      if (path === "/api/room" && method === "GET") return handleRoomGet(env, url);
      if (method === "POST") {
        if (path === "/api/room/create")   return handleRoomCreate(env, request);
        if (path === "/api/room/respond")  return handleRespond(env, request);
        if (path === "/api/room/react")    return handleReact(env, request);
        if (path === "/api/room/phase")    return handlePhase(env, request);
        if (path === "/api/room/counter")  return handleCounter(env, request);
        if (path === "/api/room/problem")  return handleProblem(env, request);
        if (path === "/api/counter-card")  return handleCounterCard(env, request);
        if (path === "/api/stt")           return handleStt(env, request);
      }
      return json({ ok: false, reason: "not_found" }, 404);
    } catch (e) {
      logSafe(path, `server_error: ${e && e.message}`);
      return json({ ok: false, reason: "server_error" }, 500);
    }
  }
};
