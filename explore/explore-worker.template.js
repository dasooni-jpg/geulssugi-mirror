/*
 * 다람 탐험대 — 온라인 주소로 열기 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 화면 하나짜리 정적 게임이라 서버가 하는 일은 게임 화면을 내려 주는 것뿐임.
 * 그림 73장이 모두 이 파일 안에 들어 있음(img 폴더를 따로 올릴 필요 없음).
 * 데이터베이스·비밀키·설정이 필요 없음.
 *
 * ※ 이 파일은 build-explore.mjs 가 만든 자동 생성본임.
 *    화면(explore/index.html)이나 그림(explore/img)을 고친 뒤에는 빌드 스크립트를 다시 실행할 것.
 *
 * 올리는 법 (Cloudflare 대시보드에서):
 *  1. Workers & Pages → 만들어 둔 Worker(예: daram-explore) → Edit code
 *  2. 편집기 내용을 모두 지우고 이 파일(explore-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. 주소: https://<워커이름>.<계정이름>.workers.dev
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
        'cache-control': 'no-cache',
      },
    });
  },
};
