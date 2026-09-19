/*
 * 다람쌤 장기 한판 — 온라인 주소로 열기 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 화면 하나짜리 정적 앱이라 서버가 하는 일은 index.html 을 내려 주는 것뿐임.
 * 데이터베이스·비밀키·설정이 필요 없음.
 *
 *   - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-janggi-worker.mjs 가 만든 자동 생성본임.
 *    화면(janggi/index.html)을 고친 뒤에는 빌드 스크립트를 다시 실행할 것.
 *
 * 올리는 법 (Cloudflare 대시보드에서 한 번만):
 *  1. Workers & Pages → Create → Worker 만들기 (이름 예: janggi)
 *  2. 이 파일(janggi-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. 끝. 주소는 https://janggi.<계정이름>.workers.dev
 */

const APP_HTML = __APP_HTML__;

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    return new Response(APP_HTML, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache'
      }
    });
  }
};
