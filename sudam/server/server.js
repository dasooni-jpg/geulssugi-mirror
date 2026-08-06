/* ─────────────────────────────────────────────────────────
   수담(數談) v2 — 교사 백엔드 (교실 안 노트북에서 실행)
   같은 학급 학생들이 한 토론방에 함께 들어오게 해 줍니다.

   · 외부 프레임워크·라이브러리를 쓰지 않습니다(C8). Node 기본 기능만 사용합니다.
     → npm install 이 필요 없습니다. node server.js 만 하면 됩니다.
   · 학생 기기는 생성형 AI를 직접 부르지 않습니다(C3). 이 서버가 대신 호출합니다.
   · 저장하는 것은 출석번호·별명·주장·근거뿐입니다(C2). 실명·연락처 필드는 없습니다.
   · 방 정보는 이 서버의 메모리에만 있습니다. 서버를 끄면 사라집니다.
   · 로그에 학생 발화 내용을 남기지 않습니다.

   실행:  node server.js
   설정:  같은 폴더의 .env 파일(선택). 없으면 기본값으로 동작합니다.
────────────────────────────────────────────────────────── */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

// ── .env 를 직접 읽음 (dotenv 라이브러리 대신, C8) ──
function loadEnv() {
  const f = path.join(__dirname, ".env");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 3000);
const CLASS_CODE = String(process.env.CLASS_CODE || "0000").trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const CF_AIG_ACCOUNT_ID = process.env.CF_AIG_ACCOUNT_ID || "";
const CF_AIG_GATEWAY = process.env.CF_AIG_GATEWAY || "";
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

// ── 반례 카드 지침 (C5: 결론·정답 금지, 질문만) ──
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

// ── 방 저장소 (메모리 전용) ──
// rooms: code → { room, responses: Map("seat|round"→obj), counters: [], problems: [] }
const rooms = new Map();
function getRoom(code) { return rooms.get(String(code)); }

function logSafe(route, note) {
  console.log(`[${new Date().toISOString()}] ${route} | ${note}`);
}

// ── 응답 도우미 ──
function sendJson(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(s)
  });
  res.end(s);
}
function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(new Error("too_large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readJson(req) {
  try { return JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
  catch { return {}; }
}
function checkCode(code) { return String(code || "").trim() === CLASS_CODE; }

// ── multipart/form-data 에서 오디오와 필드를 뽑아냄 (multer 대신, C8) ──
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) return null;
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const parts = []; let start = buf.indexOf(boundary);
  if (start < 0) return null;
  start += boundary.length;
  while (true) {
    if (buf.slice(start, start + 2).toString() === "--") break;   // 끝 표시
    start += 2;                                                   // CRLF
    const next = buf.indexOf(boundary, start);
    if (next < 0) break;
    const chunk = buf.slice(start, next - 2);                     // 앞의 CRLF 제거
    const sep = chunk.indexOf("\r\n\r\n");
    if (sep > 0) {
      const header = chunk.slice(0, sep).toString("utf8");
      const body = chunk.slice(sep + 4);
      const nameM = /name="([^"]*)"/i.exec(header);
      const typeM = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      const fileM = /filename="([^"]*)"/i.exec(header);
      parts.push({
        name: nameM ? nameM[1] : "",
        isFile: !!fileM,
        contentType: typeM ? typeM[1].trim() : "",
        data: body
      });
    }
    start = next + boundary.length;
  }
  return parts;
}

// ── Gemini 호출 ──
function geminiEndpoint(model) {
  return (CF_AIG_ACCOUNT_ID && CF_AIG_GATEWAY)
    ? `https://gateway.ai.cloudflare.com/v1/${CF_AIG_ACCOUNT_ID}/${CF_AIG_GATEWAY}/google-ai-studio/v1beta/models/${model}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}
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
async function generateCounterCards(ctx) {
  if (!GEMINI_API_KEY) throw new Error("ai_unconfigured");
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

  const res = await fetch(geminiEndpoint(GEMINI_MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: COUNTER_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: userMsg }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: COUNTER_SCHEMA,
        maxOutputTokens: 1024
        // thinkingConfig 는 넣지 않음(모델 갱신 시 400 유발 사례가 있어 생략).
      }
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error("ai_http_" + res.status);
  const cand = body.candidates && body.candidates[0];
  if (!cand) throw new Error("ai_empty");
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION") throw new Error("ai_refused");
  const text = ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("");
  const cards = parseCards(text);
  if (!cards.length) throw new Error("ai_empty");
  return cards;
}
async function transcribe(buffer, mimetype) {
  if (!GEMINI_API_KEY) throw new Error("stt_unconfigured");
  const res = await fetch(geminiEndpoint(GEMINI_MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: mimetype || "audio/webm", data: buffer.toString("base64") } },
        { text: "이 음성을 한국어로 정확히 받아써라. 초등학생의 발화다. 설명 없이 받아쓴 문장만 출력하라." }
      ]}],
      generationConfig: { maxOutputTokens: 512 }
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error("stt_http_" + res.status);
  const cand = body.candidates && body.candidates[0];
  if (!cand) throw new Error("stt_empty");
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION") throw new Error("stt_refused");
  return ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("").trim();
}

// ── 라우트 ──
async function route(req, res, url) {
  const p = url.pathname;

  if (req.method === "GET" && p === "/api/health") {
    return sendJson(res, 200, { ok: true, db: true, ai: !!GEMINI_API_KEY, rooms: rooms.size });
  }

  if (req.method === "GET" && p === "/api/room") {
    const code = url.searchParams.get("code");
    const r = getRoom(code);
    if (!r) return sendJson(res, 404, { ok: false, reason: "not_found" });
    return sendJson(res, 200, {
      ok: true, room: r.room,
      responses: [...r.responses.values()],
      counters: r.counters, problems: r.problems
    });
  }

  if (req.method !== "POST") return sendJson(res, 404, { ok: false, reason: "not_found" });

  // 음성 받아쓰기 (multipart)
  if (p === "/api/stt") {
    let buf;
    try { buf = await readBody(req); }
    catch { return sendJson(res, 413, { ok: false, reason: "audio_too_large" }); }
    const parts = parseMultipart(buf, req.headers["content-type"]);
    if (!parts) return sendJson(res, 400, { ok: false, reason: "bad_form" });
    const codePart = parts.find(x => x.name === "classCode");
    if (!checkCode(codePart ? codePart.data.toString("utf8") : "")) {
      return sendJson(res, 403, { ok: false, reason: "bad_class_code" });
    }
    const audio = parts.find(x => x.name === "audio" && x.isFile);
    if (!audio || !audio.data.length) return sendJson(res, 400, { ok: false, reason: "no_audio" });
    if (audio.data.length > MAX_AUDIO_BYTES) return sendJson(res, 413, { ok: false, reason: "audio_too_large" });
    logSafe("/api/stt", `audio ${audio.data.length} bytes`);   // 발화 내용은 기록하지 않음
    try {
      const text = await transcribe(audio.data, audio.contentType);
      return sendJson(res, 200, { ok: true, text });
    } catch (e) {
      logSafe("/api/stt", `failed: ${e.message}`);
      return sendJson(res, 502, { ok: false, reason: "stt_failed" });
    }
  }

  const d = await readJson(req);
  if (!checkCode(d.classCode)) return sendJson(res, 403, { ok: false, reason: "bad_class_code" });

  if (p === "/api/room/create") {
    const room = d.room || {};
    if (!room.code) return sendJson(res, 400, { ok: false, reason: "no_code" });
    rooms.set(String(room.code), { room, responses: new Map(), counters: [], problems: [] });
    logSafe("/api/room/create", `room=${room.code} lesson=${room.lesson} type=${room.taskType}`);
    return sendJson(res, 200, { ok: true, code: room.code });
  }

  const r = getRoom(d.code);
  if (!r && p.startsWith("/api/room/")) return sendJson(res, 404, { ok: false, reason: "not_found" });

  if (p === "/api/room/respond") {
    const x = d.response || {};
    if (!x.seatNo || !x.round) return sendJson(res, 400, { ok: false, reason: "bad_request" });
    const key = `${x.seatNo}|${x.round}`;
    const prev = r.responses.get(key);
    r.responses.set(key, prev ? { ...prev, ...x } : x);   // 반응 수(동의·반론)는 보존
    logSafe("/api/room/respond", `room=${d.code} seat=${x.seatNo} round=${x.round} stance=${x.stance}`);
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/room/react") {
    const key = `${d.seatNo}|${d.round}`;
    const target = r.responses.get(key);
    if (!target) return sendJson(res, 404, { ok: false, reason: "not_found" });
    const kind = d.kind === "object" ? "object" : "agree";
    target[kind] = (target[kind] || 0) + 1;
    if (kind === "object" && d.fromSeatNo) {   // 반론을 건 학생 쪽에도 기록
      for (const [k, v] of r.responses) {
        if (v.seatNo === d.fromSeatNo) v.objectMade = (v.objectMade || 0) + 1;
      }
    }
    return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/room/phase") { r.room.phase = d.phase; return sendJson(res, 200, { ok: true }); }
  if (p === "/api/room/counter") {
    if (!d.text) return sendJson(res, 400, { ok: false, reason: "bad_request" });
    r.counters.push(d.text); return sendJson(res, 200, { ok: true });
  }
  if (p === "/api/room/problem") {
    if (!d.problem) return sendJson(res, 400, { ok: false, reason: "bad_request" });
    r.problems.push(d.problem); return sendJson(res, 200, { ok: true });
  }

  if (p === "/api/counter-card") {
    try {
      const cards = await generateCounterCards(d);
      logSafe("/api/counter-card", `ok (${cards.length} cards)`);
      return sendJson(res, 200, { ok: true, cards });
    } catch (e) {
      logSafe("/api/counter-card", `failed: ${e.message}`);
      // 실패해도 수업이 멈추지 않도록, 화면이 준비된 카드로 대신하게 함
      return sendJson(res, 200, { ok: true, cards: [], demo: true });
    }
  }

  return sendJson(res, 404, { ok: false, reason: "not_found" });
}

// ── 정적 화면 (index.html) ──
function serveIndex(res) {
  const f = path.join(__dirname, "..", "index.html");
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end("index.html 을 찾지 못했습니다."); return; }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }
  if ((req.method === "GET" || req.method === "HEAD") &&
      (url.pathname === "/" || url.pathname === "/index.html")) {
    return serveIndex(res);
  }
  try { await route(req, res, url); }
  catch (e) {
    logSafe(url.pathname, `server_error: ${e && e.message}`);
    if (!res.headersSent) sendJson(res, 500, { ok: false, reason: "server_error" });
  }
});

server.listen(PORT, () => {
  console.log("──────────────────────────────────────────");
  console.log("  수담(數談) 교사 서버 시작");
  console.log(`  같은 기기:   http://localhost:${PORT}`);
  console.log(`  학생 태블릿: http://<이 컴퓨터의 IP>:${PORT}`);
  console.log(`  교실 코드:   ${CLASS_CODE}`);
  console.log(`  AI 반례 카드(Gemini): ${GEMINI_API_KEY ? "설정됨" : "미설정 — 준비된 카드로 동작"}`);
  console.log("  ※ 방 정보는 메모리에만 있습니다. 서버를 끄면 사라집니다.");
  console.log("──────────────────────────────────────────");
});
