/*
 * 다람 원정대 — 온라인 주소로 열기 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 화면 하나짜리 정적 게임이라 서버가 하는 일은 index.html 과 마스코트 그림을 내려 주는 것뿐임.
 * 데이터베이스·비밀키·설정이 필요 없음. 학생 정보는 서버로 오지 않음(기록은 학생 기기에만 남음).
 *
 *   - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-daram-squad-worker.mjs 가 만든 자동 생성본임.
 *    화면(daram-squad/index.html)을 고친 뒤에는 빌드 스크립트를 다시 실행할 것.
 *
 * 올리는 법 (Cloudflare 대시보드에서 한 번만):
 *  1. Workers & Pages → Create → Worker 만들기 (이름 예: daram-squad)
 *  2. 이 파일(daram-squad-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. 끝. 주소는 https://daram-squad.<계정이름>.workers.dev
 */

const APP_HTML = __APP_HTML__;
const MASCOT_B64 = "__MASCOT_B64__";

function b64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (url.pathname === '/mascot.png') {
      return new Response(b64ToBytes(MASCOT_B64), {
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' }
      });
    }
    return new Response(APP_HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache'
      }
    });
  }
};
