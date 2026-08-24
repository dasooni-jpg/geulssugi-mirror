/*
 * 우리 반 교실 꾸미기 — 웹 배포용 Cloudflare Worker (틀 파일)
 * ──────────────────────────────────────────────────────────
 * ⚠️ 이 파일은 '틀'입니다. 붙여넣을 파일은 classroom-worker.js 입니다.
 *    (classroom/index.html · classroom/game.js · classroom/mascot.png 을
 *     이 틀에 끼워 넣어 classroom-worker.js 를 만듭니다)
 *
 *  만드는 법 (Windows PowerShell):
 *      powershell -ExecutionPolicy Bypass -File build-classroom-worker.ps1
 *
 *  올리는 법 (Cloudflare 대시보드에서 1회):
 *   1. Workers & Pages → Create → Worker 만들기 (이름 예: classroom)
 *   2. 만들어진 classroom-worker.js 전체를 편집기에 붙여넣고 Deploy
 *   3. 주소(예: https://classroom.내계정.workers.dev)를 학생들에게 알려 주기
 *
 *  ✅ 데이터베이스·KV 없이 동작합니다. 게임 진행 상황은 학생 각자의
 *     브라우저(localStorage)에만 저장되고 서버로 전송되지 않습니다.
 */

const HTML = __APP_HTML__;
const GAME_JS = __GAME_JS__;
const MASCOT_B64 = "__MASCOT_B64__";

let mascotBytes = null;
function mascot() {
  if (!mascotBytes) {
    const bin = atob(MASCOT_B64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    mascotBytes = arr;
  }
  return mascotBytes;
}

function send(body, type, cache) {
  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    switch (path) {
      case "/":
      case "/index.html":
        return send(HTML, "text/html; charset=utf-8", "no-cache");
      case "/game.js":
        return send(GAME_JS, "application/javascript; charset=utf-8", "no-cache");
      case "/mascot.png":
        return send(mascot(), "image/png", "public, max-age=86400");
      case "/health":
        return send("ok", "text/plain; charset=utf-8", "no-store");
      default:
        // 그 밖의 주소는 게임 첫 화면으로 보냄
        return Response.redirect(new URL("/", url).toString(), 302);
    }
  },
};
