/*
 * 매일 영단어 — 온라인 서버 (Cloudflare Worker + D1 + Google Gemini AI)
 * ──────────────────────────────────────────────────────────
 * 초등 1~6학년 · 중등 · 고등 학생이 매일 영단어를 공부하는 앱입니다.
 * 매일 레벨당 20개를 AI(Gemini)가 자동으로 만들어 D1에 저장하고
 * 반 전체가 같은 단어를 공유합니다. 학생은 그중 하루에 몇 개(10/15/20)
 * 할지 스스로 고를 수 있습니다.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-engword-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(engword-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: engword-30)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: engword-30)
 *  3. 이 파일(engword-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 engword-30 선택
 *  5. Worker → Settings → Variables and Secrets → Add
 *     - Type: Secret / Name: GEMINI_API_KEY / Value: (Google AI Studio에서 발급받은 Gemini API 키)
 *     ※ 키가 없으면 학생이 오늘의 영단어를 받을 수 없어요.
 *  6. (AI 생성 시 "User location is not supported" 오류가 나면) AI Gateway 경유 설정:
 *     - AI → AI Gateway → Create Gateway (이름 예: engword-30)
 *     - Worker → Settings → Variables 에 아래 둘 추가 (Text 로):
 *         CF_AIG_ACCOUNT_ID = (대시보드 우측의 Account ID)
 *         CF_AIG_GATEWAY    = (위에서 만든 Gateway 이름)
 *     ※ 게이트웨이도 같은 데이터센터에서 나가기 때문에 이것만으로는 안 될 수 있습니다.
 *  7. (그래도 "User location is not supported" 가 나면) AI 호출을 북미로 고정:
 *     ※ Durable Object 는 대시보드만으로는 만들 수 없습니다. 네임스페이스를 만들려면
 *       설정 파일에 선언해서 한 번 배포해야 하므로, 중계 전용 미니 워커를 따로 둡니다.
 *     7-1. 이 저장소의 engword-ai-proxy 폴더에서 (한 번만):
 *            npx wrangler login
 *            npx wrangler deploy
 *     7-2. engword 워커 → Settings → Bindings → Add → Durable Object
 *            Variable name: AI_PROXY        (반드시 이 이름 그대로!)
 *            Durable Object: AIProxy        (engword-ai-proxy 에서 옴)
 *     ※ 이 바인딩이 있으면 Gemini 호출만 북미(enam)에 고정된 Durable Object 안에서
 *       나가므로, 학생이 홍콩(HKG) 데이터센터로 붙어도 지역 차단에 걸리지 않습니다.
 *       바인딩이 없으면 지금까지처럼 Worker 에서 바로 호출합니다(설정 안 해도 동작).
 *     ※ 아래 AIProxy 클래스는 engword-ai-proxy 에도 같은 내용으로 들어 있습니다.
 *       이 워커 자체를 wrangler 로 배포한다면 미니 워커 없이 이 클래스를 바로 써도 됩니다.
 *  8. 배포 주소를 학생 태블릿 홈 화면에 추가하면 끝!
 *
 * 학생은 회원가입 없이 [반 선택 → 별명] 만으로 시작합니다. (개인정보 제로)
 * 이후엔 그 기기에서 별명 입력 없이 자동으로 이어서 학습하며, 별명은 "나의 기록" 화면에서 바꿀 수 있습니다.
 */

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>매일 영단어</title>
<style>
  /* ═══ 공책 아날로그 테마 ═══ 종이 질감 바탕 + 만년필 남색·빨간 색연필 포인트 */
  :root {
    --bg: #f3efe3;
    --card: #fffef7;
    --ink: #2e3947;
    --sub: #8d8878;
    --line: #ddd5bf;
    --blue: #1f4e8c;
    --blue-soft: #e9f0f7;
    --green: #3e7d5c;
    --green-soft: #ecf3ee;
    --red: #c2483b;
    --red-soft: #fdeeec;
    --amber: #b3822d;
    --amber-soft: #f8f1df;
    --radius: 10px;
    --shadow: 0 2px 0 rgba(46, 57, 71, .12);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; }
  body {
    font-family: "Nanum Myeongjo", "Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif;
    background: var(--bg); color: var(--ink); font-size: 16px;
    background-image: repeating-linear-gradient(0deg, transparent 0 33px, rgba(46, 57, 71, .05) 33px 34px);
  }
  #app { max-width: 760px; margin: 0 auto; padding: 14px 14px 60px; }
  .hidden { display: none !important; }
  button { font: inherit; cursor: pointer; border: none; border-radius: 8px; }
  input, select, textarea { font: inherit; color: inherit; }

  /* ── 공통 부품 ── */
  .card { background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; margin-bottom: 14px; }
  .btn { background: var(--blue); color: #fff; padding: 13px 20px; font-weight: 700; font-size: 16px; }
  .btn:disabled { opacity: .45; cursor: default; }
  .btn.ghost { background: var(--blue-soft); color: var(--blue); }
  .btn.gray { background: #ece6d6; color: var(--sub); }
  .btn.red { background: var(--red-soft); color: var(--red); }
  .btn.green { background: var(--green); color: #fff; }
  .btn.gold { background: linear-gradient(135deg,#f7c948,#e0a018); color: #4a3200; }
  .btn.big { width: 100%; padding: 16px; font-size: 17px; border-radius: 10px; }
  .row { display: flex; gap: 10px; align-items: center; }
  .row.wrap { flex-wrap: wrap; }
  .grow { flex: 1; }
  .title { font-size: 20px; font-weight: 800; }
  .sub { color: var(--sub); font-size: 13.5px; }
  .field { width: 100%; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 8px; background: var(--card); font-size: 16px; }
  .field:focus { outline: none; border-color: var(--blue); }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 12.5px; font-weight: 700; }
  .badge.blue { background: var(--blue-soft); color: var(--blue); }
  .badge.green { background: var(--green-soft); color: var(--green); }
  .badge.amber { background: var(--amber-soft); color: var(--amber); }
  .badge.red { background: var(--red-soft); color: var(--red); }
  .topbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .topbar .back { background: var(--card); border: 1.5px solid var(--line); color: var(--sub); width: 40px; height: 40px; border-radius: 8px; box-shadow: var(--shadow); font-size: 18px; flex: none; }
  .topbar .t { font-size: 18px; font-weight: 800; }

  /* ── 시작 화면 ── */
  .logo { text-align: center; padding: 34px 0 22px; }
  .logo .big { font-size: 30px; font-weight: 900; letter-spacing: -1px; }
  .logo .big em { color: var(--blue); font-style: normal; }
  .sec-btn { width: 100%; background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 14px; text-align: left; display: flex; align-items: center; gap: 10px; border: 1.5px solid var(--line); }
  .sec-btn.on { border-color: var(--blue); background: var(--blue-soft); }
  .sec-btn[data-k="adult"] { border-color: #b3822d; background: var(--amber-soft); }
  .sec-btn[data-k="adult"].on { border-color: var(--amber); background: #f5ead0; }
  .sec-btn[data-k="teacher"] { border-color: #6a9b6f; background: var(--green-soft); }
  .sec-btn[data-k="teacher"].on { border-color: var(--green); background: #d9ecd9; }
  .sec-btn .ico { font-size: 22px; }
  .sec-btn .nm { font-size: 16px; font-weight: 800; }
  .goal-row { display: flex; gap: 8px; }
  .goal-btn { flex: 1; background: var(--card); border: 1.5px solid var(--line); border-radius: 8px; padding: 12px 4px; text-align: center; font-weight: 800; font-size: 15px; color: var(--sub); }
  .goal-btn.on { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }

  /* ── 요일 탭 ── */
  .week-tabs { display: flex; gap: 6px; margin-bottom: 14px; }
  .wtab { flex: 1; background: var(--card); border: 1.5px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); padding: 9px 2px; text-align: center; font-size: 13px; font-weight: 800; color: var(--sub); display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .wtab.sel { background: var(--blue); color: #fff; border-color: var(--blue); }
  .wtab.done:not(.sel) { background: var(--green-soft); color: var(--green); }
  .wtab.lock { opacity: .5; }
  .wtab .mk { font-size: 11px; }

  /* ── 홈 ── */
  .home-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .streak { font-weight: 800; color: var(--amber); }
  .prog-wrap { background: #ece6d6; height: 14px; border-radius: 8px; overflow: hidden; margin: 10px 0 6px; }
  .prog-bar { height: 100%; background: var(--blue); border-radius: 8px; transition: width .4s; }
  .menu-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .menu-btn { background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px 16px; text-align: left; }
  .menu-btn .ico { font-size: 26px; display: block; margin-bottom: 8px; }
  .menu-btn .nm { font-weight: 800; font-size: 16.5px; }
  .menu-btn .st { color: var(--sub); font-size: 12.5px; margin-top: 3px; }
  .done-stamp { color: var(--green); font-weight: 800; }

  /* ── 공부모드 세트 목록 ── */
  .set-row { display: flex; align-items: center; gap: 12px; background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; margin-bottom: 10px; width: 100%; text-align: left; }
  .set-row .no { width: 44px; height: 44px; border-radius: 8px; background: var(--blue-soft); color: var(--blue); font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 17px; flex: none; }
  .set-row.done .no { background: var(--green-soft); color: var(--green); }

  /* ── 낱말 카드 ── */
  .study-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 26px 20px; cursor: pointer; user-select: none; }
  .study-card .word { font-size: 40px; font-weight: 900; letter-spacing: -1px; }
  .study-card .pron { color: var(--sub); font-size: 16px; margin-top: 6px; }
  .study-card .hint { color: var(--sub); font-size: 13.5px; margin-top: 16px; }
  .tts-btn { background: var(--blue-soft); color: var(--blue); width: 42px; height: 42px; border-radius: 50%; font-size: 18px; flex: none; border: 1.5px solid var(--line); }
  .study-card .meaning { font-size: 21px; font-weight: 700; line-height: 1.5; }
  .study-card .example { margin-top: 14px; color: var(--ink); line-height: 1.6; background: var(--bg); border-radius: 8px; padding: 10px 14px; font-size: 15.5px; }
  /* 예문 단계: 문장만 크게 보여 준다 (기본 예문 글씨의 2~2.5배) */
  .study-card .example.big { margin-top: 0; font-size: clamp(26px, 5.6vw, 38px); font-weight: 700; line-height: 1.45; padding: 20px 22px; }
  .study-card .syn { margin-top: 12px; font-size: 14px; color: var(--sub); }
  .card-nav { display: flex; gap: 10px; margin-top: 14px; }
  .card-count { text-align: center; color: var(--sub); font-weight: 700; margin-bottom: 10px; }

  /* ── 퀴즈 ── */
  .q-text { font-size: 19px; font-weight: 800; line-height: 1.55; margin-bottom: 6px; }
  .q-sub { color: var(--sub); font-size: 14px; margin-bottom: 14px; }
  .choice { display: block; width: 100%; text-align: left; background: var(--card); border: 1.5px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; font-size: 16.5px; font-weight: 600; }
  .choice.correct { border-color: var(--green); background: var(--green-soft); color: var(--green); }
  .choice.wrong { border-color: var(--red); background: var(--red-soft); color: var(--red); }
  .choice:disabled { cursor: default; }
  .feedback { border-radius: 8px; padding: 14px 16px; margin-top: 6px; line-height: 1.6; font-size: 15px; }
  .feedback.good { background: var(--green-soft); color: var(--green); font-weight: 800; }
  .feedback.bad { background: var(--red-soft); color: #8f2f24; }
  .q-prog { height: 8px; background: #ece6d6; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
  .q-prog i { display: block; height: 100%; background: var(--blue); transition: width .3s; }

  /* ── 결과 ── */
  .result-big { text-align: center; padding: 24px 0 10px; }
  .result-big .score { font-size: 46px; font-weight: 900; color: var(--blue); }
  .wrong-item { border-bottom: 1px dashed var(--line); padding: 12px 2px; }
  .wrong-item:last-child { border-bottom: none; }
  .wrong-item .w { font-weight: 800; font-size: 17px; }
  .wrong-item .p { color: var(--sub); font-size: 13px; margin-left: 4px; }
  .wrong-item .m { color: var(--ink); font-size: 14.5px; margin-top: 3px; line-height: 1.5; }

  /* ── 기록 ── */
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat-box { background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px 10px; text-align: center; }
  .stat-box .v { font-size: 24px; font-weight: 900; color: var(--blue); }
  .stat-box .k { color: var(--sub); font-size: 12.5px; margin-top: 4px; }
  .day-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 12px; }
  .day-cell { aspect-ratio: 1; border-radius: 6px; background: #ece6d6; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; color: var(--sub); }
  .day-cell.done { background: var(--green-soft); color: var(--green); font-weight: 800; }

  /* ── 스피너 / 토스트 ── */
  .spinner { width: 34px; height: 34px; border: 4px solid var(--blue-soft); border-top-color: var(--blue); border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-box { text-align: center; padding: 40px 16px; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: var(--ink); color: #fff; padding: 11px 20px; border-radius: 8px; font-size: 14px; opacity: 0; pointer-events: none; transition: opacity .3s; z-index: 99; max-width: 90%; text-align: center; }
  #toast.show { opacity: 1; }

  /* ── 스티커북 / 도감 ── */
  .sticker-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; }
  .coin-pill { background:var(--amber-soft); color:var(--amber); border:1.5px solid #e4cf9b; border-radius:999px; padding:7px 12px; font-weight:900; white-space:nowrap; }
  .sticker-cats { display:grid; grid-template-columns:1fr; gap:10px; margin-bottom:14px; }
  .sticker-cat { background:var(--card); border:1.5px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); padding:14px; text-align:left; }
  .sticker-cat.complete { background:var(--green-soft); border-color:var(--green); }
  .sticker-cat .ico { font-size:28px; }
  .sticker-cat .nm { font-weight:900; margin-top:4px; }
  .sticker-cat .pr { color:var(--sub); font-size:12px; margin-top:5px; }
  .sticker-progress { height:7px; background:#ece6d6; border-radius:8px; overflow:hidden; margin-top:8px; }
  .sticker-progress i { display:block; height:100%; background:var(--blue); border-radius:8px; transition:width .3s; }
  .sticker-cat.complete .sticker-progress i { background:var(--green); }
  .sticker-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .sticker-card { position:relative; min-width:0; aspect-ratio:1/1.18; background:var(--card); border:1.5px solid var(--line); border-radius:10px; box-shadow:var(--shadow); display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:6px; overflow:hidden; }
  .sticker-card.locked { background:#e2dfd5; color:#777; }
  .sticker-card.complete { border-color:var(--green); background:var(--green-soft); }
  .sticker-card .pic { flex:1 1 auto; width:100%; min-height:0; display:flex; align-items:center; justify-content:center; }
  .sticker-card img { width:100%; height:100%; object-fit:contain; }
  .sticker-card .emo { font-size:56px; line-height:1; }
  .sticker-card.locked .pic { filter:grayscale(1); opacity:.16; }
  .sticker-card .lock { position:absolute; top:4px; right:5px; font-size:13px; }
  .sticker-card .num { position:absolute; top:5px; left:6px; font-size:10px; color:var(--sub); font-weight:800; }
  .sticker-card .sn { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10.5px; font-weight:800; margin-top:3px; }
  .sticker-card .price { color:var(--amber); font-size:10px; font-weight:900; margin-top:2px; }
  .sticker-tools { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }
  .sticker-tools .btn { font-size:13px; padding:12px 8px; }
  .sticker-mileage { margin-top:8px; padding:9px 11px; border-radius:8px; background:var(--blue-soft); color:var(--blue); font-size:12px; font-weight:800; }
  .sticker-modal-bg { position:fixed; inset:0; z-index:1000; background:rgba(20,25,30,.62); display:flex; align-items:center; justify-content:center; padding:18px; }
  .sticker-modal { width:min(430px,100%); background:var(--card); border:1.5px solid var(--line); border-radius:16px; box-shadow:0 15px 50px rgba(0,0,0,.3); padding:18px; text-align:center; animation:stickerIn .2s ease-out; }
  @keyframes stickerIn { from{opacity:0;transform:scale(.92) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
  .sticker-flip { width:150px; height:180px; margin:8px auto 14px; perspective:800px; }
  .sticker-flip-inner { width:100%; height:100%; position:relative; transform-style:preserve-3d; transition:transform .65s ease; }
  .sticker-flip.show .sticker-flip-inner { transform:rotateY(180deg); }
  .sticker-face { position:absolute; inset:0; backface-visibility:hidden; border:2px solid var(--line); border-radius:18px; display:flex; align-items:center; justify-content:center; }
  .sticker-front { background:repeating-linear-gradient(45deg,#d9d4c6 0 8px,#e7e2d6 8px 16px); font-size:48px; }
  .sticker-back { transform:rotateY(180deg); background:#fff; flex-direction:column; }
  .sticker-back .emo { font-size:72px; }
  .sticker-back img { width:100px; height:100px; object-fit:contain; }
  @keyframes stickerPop { from{opacity:0;transform:scale(.7)} to{opacity:1;transform:scale(1)} }
  .pack-viewer { margin:12px 0; }
  .pack-track { display:flex; gap:10px; overflow-x:auto; overscroll-behavior-x:contain; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
  .pack-track::-webkit-scrollbar { display:none; }
  .pack-item { flex:0 0 100%; box-sizing:border-box; scroll-snap-align:center; border:1.5px solid var(--line); border-radius:12px; padding:10px 8px; background:#fff; animation:stickerPop .35s ease-out both; }
  .pack-item .pic { width:min(52vw,190px); aspect-ratio:1/1.28; margin:0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  .pack-item .pic img { width:100%; height:100%; object-fit:contain; }
  .pack-item .emo { font-size:66px; line-height:1; }
  .pack-item .nm { font-size:14px; font-weight:900; margin-top:7px; }
  .pack-item .dup { color:var(--amber); font-size:12px; font-weight:900; margin-top:3px; }
  .pack-nav { display:flex; align-items:center; justify-content:center; gap:12px; margin-top:9px; }
  .pack-arrow { width:34px; height:34px; border:1.5px solid var(--line); background:#fff; border-radius:50%; font-size:17px; font-weight:900; color:var(--ink); padding:0; line-height:1; }
  .pack-arrow:disabled { opacity:.3; }
  .pack-dots { display:flex; align-items:center; gap:6px; }
  .pack-dots i { display:block; width:8px; height:8px; border-radius:50%; background:#d8d2c2; transition:all .2s; }
  .pack-dots i.on { background:var(--blue); width:20px; border-radius:8px; }

  /* ── 스티커 확대 보기 ── */
  .st-view .big { width:min(64vw,230px); aspect-ratio:1/1.28; margin:12px auto 0; border:2px solid var(--line); border-radius:16px; background:#fff; box-shadow:0 8px 22px rgba(0,0,0,.14); overflow:hidden; }
  .st-view .big .pic { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  .st-view .big img { width:100%; height:100%; object-fit:contain; }
  .st-view .big .emo { font-size:86px; line-height:1; }
  .st-view .big.locked .pic { filter:grayscale(1); opacity:.22; }
  .st-view .nm { font-size:20px; font-weight:900; margin-top:12px; }
  .st-view .meta { color:var(--sub); font-size:13px; margin-top:4px; }
  .st-actions { display:grid; gap:8px; margin-top:14px; }
  .st-actions .btn { width:100%; font-size:15px; padding:13px 10px; border-radius:10px; }
  .ticket-note { font-size:12px; font-weight:800; color:#a5761a; background:#fff6da; border:1.5px solid #f0e0b6; border-radius:8px; padding:9px 11px; }
  .ticket-bar { margin-top:8px; padding:9px 11px; border-radius:8px; background:#fff6da; color:#a5761a; font-size:12px; font-weight:800; border:1.5px solid #f0e0b6; }
  @media (min-width:600px) { .sticker-cats{grid-template-columns:repeat(3,1fr)} .sticker-grid{gap:11px} .sticker-card .emo{font-size:64px} }


  /* ── 단어 게임 ── */
  .game-list { display: grid; gap: 12px; }
  .game-btn { width: 100%; background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; text-align: left; display: flex; align-items: center; gap: 14px; }
  .game-btn .ico { font-size: 30px; flex: none; }
  .game-btn .nm { font-weight: 900; font-size: 17px; }
  .game-btn .de { color: var(--sub); font-size: 13px; margin-top: 3px; line-height: 1.45; }
  .game-btn .best { color: var(--amber); font-size: 12.5px; font-weight: 800; margin-top: 5px; }
  .game-hud { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .game-hud .pill { background: var(--card); border: 1.5px solid var(--line); border-radius: 999px; padding: 7px 14px; font-weight: 900; font-size: 14px; box-shadow: var(--shadow); }
  .game-hud .pill.time { color: var(--blue); }
  .game-hud .pill.time.hurry { color: var(--red); border-color: var(--red); background: var(--red-soft); }
  .game-hud .pill.score { color: var(--green); }
  .game-flash { text-align: center; font-weight: 900; font-size: 15px; min-height: 22px; margin-top: 10px; }
  .game-flash.good { color: var(--green); }
  .game-flash.bad { color: var(--red); }

  /* 짝 맞추기 */
  .match-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .match-card { aspect-ratio: 1/1.1; border: 1.5px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 6px; font-size: 14px; font-weight: 800; line-height: 1.3; text-align: center; word-break: break-word; display: flex; align-items: center; justify-content: center; background: repeating-linear-gradient(45deg, #d9d4c6 0 8px, #e7e2d6 8px 16px); color: transparent; transition: background .15s, color .15s; }
  .match-card.open { background: var(--card); color: var(--ink); border-color: var(--blue); }
  .match-card.miss { background: var(--red-soft); color: var(--red); border-color: var(--red); }
  .match-card.gone { background: var(--green-soft); color: var(--green); border-color: var(--green); }
  .match-card.gone, .match-card.open { cursor: default; }

  /* 철자 완성 */
  .spell-word { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 16px 0 4px; }
  .spell-slot { width: 34px; height: 44px; border-bottom: 3px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; }
  .spell-slot.filled { border-bottom-color: var(--blue); }
  .spell-slot.ok { border-bottom-color: var(--green); color: var(--green); }
  .spell-slot.no { border-bottom-color: var(--red); color: var(--red); }
  .letter-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 18px; }
  .letter-btn { width: 44px; height: 46px; border: 1.5px solid var(--line); border-radius: 8px; background: var(--card); box-shadow: var(--shadow); font-size: 21px; font-weight: 900; color: var(--ink); }
  .letter-btn.used { opacity: .25; }
  .letter-btn:disabled { cursor: default; }

</style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>

<script>
"use strict";
/* ═══════════════════════════════════════════════════════════
   매일 영단어 — 화면 (학생용 단일 파일)
   서버: engword-worker.js (Cloudflare Worker + D1 + Google Gemini AI)
   ═══════════════════════════════════════════════════════════ */

const $app = document.getElementById("app");
const LS_LOGIN = "engword30.login";
const LS_DEVICE = "engword30.device";
const SET_SIZE = 10;          // 한 세트 = 10개
const QUIZ_COUNT = 20;        // 확인모드 문항 수
const MINI_COUNT = 3;         // 세트 끝 미니 확인 문항 수
const WRONG_MIX = 6;          // 확인모드에 섞는 오답 노트 단어 수
const WRONG_GRADUATE = 2;     // 오답 재시험에서 이만큼 맞히면 졸업

const DAILY_GOALS = [10, 15, 20]; // 하루에 몇 개 할지 학생이 고르는 선택지(서버 상수와 일치시킬 것)
const SEC_ICON = { g1: "1️⃣", g2: "2️⃣", g3: "3️⃣", g4: "4️⃣", g5: "5️⃣", g6: "6️⃣", middle: "🌿", high: "🌳", adult: "💼", teacher: "🏫" };
const MSG_MAX_LEN = 60;       // 쪽지 한 통 최대 글자 수(서버 MSG_MAX_LEN 과 일치시킬 것)
const STICKER_TICKET_NEED = 10; // 같은 스티커 이만큼 모으면 골드티켓 1장(서버 STICKER_TICKET_NEED 와 일치)
const STICKER_TICKET_KEEP = 1;  // 교환 뒤 도감에 남는 장수(서버 STICKER_TICKET_KEEP 과 일치)

const STICKER_CATEGORIES = [
  { id:"animal", name:"동물 친구들", emoji:"🐾" },
  { id:"dinosaur", name:"공룡 대탐험", emoji:"🦖" },
  { id:"ocean", name:"바다 속 세상", emoji:"🌊" },
];
// ✏️ 내가 만든 스티커를 넣을 때: 아래 배열에 [카테고리, 이름, 이모지]를 추가하세요.
// 이미지가 있다면 image_url을 아래 map 이후 원하는 URL로 바꾸면 됩니다.
// 예: ["mycat","우리집 고양이","🐱"]
const STICKER_CATALOG = [
  ["animal","강아지","🐶"],["animal","고양이","🐱"],["animal","토끼","🐰"],["animal","다람쥐","🐿️"],["animal","곰","🐻"],["animal","판다","🐼"],["animal","사자","🦁"],["animal","코끼리","🐘"],["animal","코알라","🐨"],["animal","원숭이","🐵"],["animal","펭귄","🐧"],["animal","호랑이","🐯"],
  ["dinosaur","티라노사우루스","🦖"],["dinosaur","트리케라톱스","🦕"],["dinosaur","브라키오사우루스","🦕"],["dinosaur","스테고사우루스","🦕"],["dinosaur","벨로시랩터","🦖"],["dinosaur","안킬로사우루스","🦕"],["dinosaur","스피노사우루스","🦖"],["dinosaur","파키케팔로사우루스","🦕"],["dinosaur","이구아노돈","🦕"],["dinosaur","프로토케라톱스","🦕"],["dinosaur","파라사우롤로푸스","🦕"],["dinosaur","알로사우루스","🦖"],
  ["ocean","고래","🐋"],["ocean","돌고래","🐬"],["ocean","문어","🐙"],["ocean","상어","🦈"],["ocean","거북이","🐢"],["ocean","해파리","🪼"],["ocean","가오리","🐟"],["ocean","복어","🐡"],["ocean","새우","🦐"],["ocean","꽃게","🦀"],["ocean","불가사리","⭐"],["ocean","물고기","🐠"]
].map((x,i)=>({sticker_id:x[0]+"_"+String(i%12+1).padStart(2,"0"),category:x[0],name:x[1],emoji:x[2],image_url:"/assets/stickers/"+x[0]+"_"+String(i%12+1).padStart(2,"0")+".png",price:60+(i%12)*20}));

const S = {                   // 앱 전체 상태
  appName: "매일 영단어",
  sections: [],               // [{key,name}]
  login: null,                // {section, id, nickname}
  data: null,                 // 서버에 저장되는 학생 데이터
  today: "",                  // 지금 보고 있는 날짜 "2026-07-15" (미리 학습이면 실제 오늘보다 미래일 수 있음)
  realToday: "",               // 실제(달력) 오늘 날짜 — 요일 탭 기준
  fullWords: [],               // 서버가 그날 만든 전체 단어(최대 20개, 반 공유)
  words: [],                  // 그중 학생이 오늘 하기로 한 만큼(dailyGoal개)만 잘라낸 것 — 화면은 이걸 씀
};

/* ── 공통 도우미 ── */
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// 기기별 고유 id: 처음 접속할 때 한 번 만들어 저장하고, 그 뒤로는 이 값으로 같은 학생임을 알아본다.
function deviceId() {
  let id = localStorage.getItem(LS_DEVICE);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
    localStorage.setItem(LS_DEVICE, id);
  }
  return id;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove("show"), 2600);
}
async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  let j; try { j = await r.json(); } catch (e) { j = { ok: false, error: "서버 응답이 이상해요." }; }
  return j;
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.85;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function secName(key) { const s = S.sections.find(x => x.key === key); return s ? s.name : key; }
function yesterdayOf(day) {
  const d = new Date(day + "T12:00:00+09:00");
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}
function addDays(day, n) {
  const d = new Date(day + "T12:00:00+09:00");
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
}
const WD_SHORT = ["월", "화", "수", "목", "금", "토", "일"];
const WD_FULL = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];
function weekdayIdx(day) { // 0=월 ... 6=일 (day 문자열 자체로 계산 — 실행 환경 시간대와 무관)
  const dow = new Date(day + "T00:00:00Z").getUTCDay(); // 0=일 ... 6=토
  return (dow + 6) % 7;
}
function weekDatesOf(day) {
  const monday = addDays(day, -weekdayIdx(day));
  const out = [];
  for (let i = 0; i < 7; i++) out.push(addDays(monday, i));
  return out;
}
function dayLabel(day) { return day === S.realToday ? "오늘" : WD_FULL[weekdayIdx(day)]; }
// 실제 오늘(또는 과거)이면 언제나 열림. 미래 날짜는 바로 전날 학습을 끝내야 열림(하루씩 앞당기기).
function dayUnlocked(day) {
  if (day <= S.realToday) return true;
  const rec = S.data.days[addDays(day, -1)];
  return !!(rec && rec.done);
}

/* ── 학생 데이터 접근 ── */
function todayRec() {
  const n = Math.max(1, Math.ceil(S.words.length / SET_SIZE));
  let t = S.data.days[S.today];
  if (!t) { t = { sets: Array(n).fill(false), quiz: { done: false, correct: 0, total: 0 }, done: false }; S.data.days[S.today] = t; }
  while (t.sets.length < n) t.sets.push(false);
  if (t.sets.length > n) t.sets = t.sets.slice(0, n);
  return t;
}
function checkDayDone() {
  const t = todayRec();
  if (t.done) return false;
  if (t.sets.every(Boolean) && t.quiz.done) {
    t.done = true;
    S.data.totalLearned = (S.data.totalLearned | 0) + S.words.length;
    S.data.streak = (S.data.lastDoneDay === yesterdayOf(S.today)) ? (S.data.streak | 0) + 1 : 1;
    S.data.lastDoneDay = S.today;
    return true;
  }
  return false;
}
async function saveStudent() {
  if (!S.login || !S.data) return;
  const r = await api("/api/student/save", Object.assign({}, S.login, { data: S.data }));
  if (!r.ok) toast(r.error || "저장에 실패했어요.");
  else if (r.data) { S.data = r.data; ensureStickerClientData(); }
}
function addWrong(w) {
  const found = S.data.wrong.find(x => x.word === w.word);
  if (found) { found.miss = (found.miss | 0) + 1; found.hit = 0; }
  else S.data.wrong.push({ word: w.word, pronunciation: w.pronunciation || "", meaning: w.meaning, example: w.example || "", synonym: w.synonym || "", antonym: w.antonym || "", day: S.today, miss: 1, hit: 0 });
}

/* ── 문제 만들기 (모두 화면에서 생성 — 단어 데이터만 서버에서 받음) ── */
function pickOthers(pool, answer, n, keyFn) {
  const vals = [];
  for (const p of shuffle(pool)) {
    const v = keyFn(p);
    if (!v || v === answer || vals.includes(v)) continue;
    vals.push(v);
    if (vals.length >= n) break;
  }
  return vals;
}
// type: m(뜻 고르기) w(단어 고르기) b(빈칸) s(유의어)
function makeQuestion(w, pool, type) {
  if (type === "b" && !(w.example && w.example.includes(w.word))) type = "m";
  if (type === "s" && !w.synonym) type = "w";
  let q;
  if (type === "m") {
    const others = pickOthers(pool, w.meaning, 3, x => x.meaning);
    if (others.length < 3) return null;
    q = { type, text: "'" + w.word + "'의 뜻으로 알맞은 것은?", answer: w.meaning, choices: shuffle(others.concat([w.meaning])) };
  } else if (type === "w") {
    const others = pickOthers(pool, w.word, 3, x => x.word);
    if (others.length < 3) return null;
    q = { type, text: "다음 뜻에 알맞은 단어는?", sub: w.meaning, answer: w.word, choices: shuffle(others.concat([w.word])) };
  } else if (type === "b") {
    const others = pickOthers(pool, w.word, 3, x => x.word);
    if (others.length < 3) return null;
    const idx = w.example.indexOf(w.word);
    const blanked = w.example.slice(0, idx) + "◯".repeat(Math.min(w.word.length, 4)) + w.example.slice(idx + w.word.length);
    q = { type, text: "빈칸에 알맞은 단어는?", sub: blanked, answer: w.word, choices: shuffle(others.concat([w.word])) };
  } else { // s
    const others = pickOthers(pool, w.synonym, 3, x => x.synonym || x.word);
    if (others.length < 3) return null;
    q = { type, text: "'" + w.word + "'와 뜻이 비슷한 말은?", answer: w.synonym, choices: shuffle(others.concat([w.synonym])) };
  }
  q.word = w;
  return q;
}
function buildQuiz(words, wrongList) {
  const pool = words.length >= 4 ? words : words.concat(wrongList);
  const types = ["m", "w", "b", "s"];
  const qs = [];
  // 오답 노트 단어 먼저 섞어 넣기 (재출현) — 오늘 단어와 겹치면 한 번만 출제
  const wrongPick = shuffle(wrongList).slice(0, WRONG_MIX);
  const picked = new Set(wrongPick.map(w => w.word));
  const fresh = shuffle(words).filter(w => !picked.has(w.word)).slice(0, Math.max(0, QUIZ_COUNT - wrongPick.length));
  const targets = shuffle(wrongPick.concat(fresh));
  targets.forEach((w, i) => {
    const q = makeQuestion(w, pool, types[i % 4]);
    if (q) qs.push(q);
  });
  return qs.slice(0, QUIZ_COUNT);
}
// 테스트에서 쓸 수 있게 공개
window.VQ = { buildQuiz, makeQuestion };

/* ═══════════════ 화면 그리기 ═══════════════ */
function render(html) { $app.innerHTML = html; window.scrollTo(0, 0); }
function topbar(title, onBack) {
  return \`<div class="topbar"><button class="back" onclick="\${onBack}()">←</button><div class="t">\${esc(title)}</div></div>\`;
}

/* ── 시작 화면 ── */
let pickedSection = "";
let pickedGoal = 20;
function viewStart() {
  const saved = JSON.parse(localStorage.getItem(LS_LOGIN) || "null");
  pickedSection = (saved && saved.section) || "";
  render(\`
    <div class="logo">
      <div class="big">🔤 <em>\${esc(S.appName)}</em></div>
      <div class="sub" style="margin-top:8px">내 수준과 하루 목표에 맞는 영단어 공부</div>
      <div style="margin-top:8px"><span class="badge amber">💼 성인 모드에서는 직장·여행·뉴스·비즈니스 어휘를 공부할 수 있어요.</span></div>
      <div style="margin-top:6px"><span class="badge green">🏫 교실영어(교사) 모드는 수업·학급운영에서 바로 쓰는 표현을 익혀요.</span></div>
    </div>
    <div class="sub" style="margin:4px 2px 10px;font-weight:700">1. 나의 단계를 골라요</div>
    <div id="secList" class="menu-grid">\${S.sections.map(s => \`
      <button class="sec-btn \${s.key === pickedSection ? "on" : ""}" data-k="\${s.key}">
        <span class="ico">\${SEC_ICON[s.key] || "📖"}</span>
        <span><span class="nm">\${esc(s.name)}</span></span>
      </button>\`).join("")}
    </div>
    <div class="sub" style="margin:14px 2px 10px;font-weight:700">2. 하루에 몇 개 할지 골라요</div>
    <div class="goal-row" id="goalRow">\${DAILY_GOALS.map(n => \`<button class="goal-btn \${n === pickedGoal ? "on" : ""}" data-g="\${n}">\${n}개</button>\`).join("")}</div>
    <div class="sub" style="margin:14px 2px 10px;font-weight:700">3. 별명을 적어요 <span style="font-weight:400">(실명은 쓰지 않아요)</span></div>
    <div class="card">
      <input id="inNick" class="field" maxlength="12" placeholder="별명 (예: 파란고래)" value="\${saved ? esc(saved.nickname) : ""}">
      <button class="btn big" id="btnJoin" style="margin-top:12px">시작하기</button>
    </div>
    <div class="row" style="justify-content:center;gap:8px;margin-top:16px">
      <button class="btn gray" id="btnLinkOpen" style="font-size:12.5px;padding:8px 12px">🔗 다른 기기에서 이어하기</button>
      <button class="btn gray" id="btnParent" style="font-size:12.5px;padding:8px 12px">👀 부모·보호자용</button>
    </div>
    <div id="linkBox" class="card hidden" style="margin-top:12px">
      <div class="sub" style="margin-bottom:8px">이 아이가 다른 기기에서 이미 쓰고 있다면, "나의 기록"에서 확인한 코드를 넣어 주세요.</div>
      <input id="inCode" class="field" maxlength="6" placeholder="코드 6자리" style="text-transform:uppercase;letter-spacing:3px;text-align:center;font-weight:800">
      <button class="btn big" id="btnLink" style="margin-top:10px">이어하기</button>
    </div>
  \`);
  document.querySelectorAll(".sec-btn").forEach(b => b.onclick = () => {
    pickedSection = b.dataset.k;
    document.querySelectorAll(".sec-btn").forEach(x => x.classList.toggle("on", x.dataset.k === pickedSection));
  });
  document.querySelectorAll(".goal-btn").forEach(b => b.onclick = () => {
    pickedGoal = Number(b.dataset.g);
    document.querySelectorAll(".goal-btn").forEach(x => x.classList.toggle("on", Number(x.dataset.g) === pickedGoal));
  });
  document.getElementById("btnJoin").onclick = doJoin;
  document.getElementById("inNick").onkeydown = e => { if (e.key === "Enter") doJoin(); };
  document.getElementById("btnLinkOpen").onclick = () => document.getElementById("linkBox").classList.toggle("hidden");
  document.getElementById("btnLink").onclick = doLink;
  document.getElementById("inCode").onkeydown = e => { if (e.key === "Enter") doLink(); };
  document.getElementById("btnParent").onclick = viewParentEntry;
}
async function doJoin() {
  const nickname = document.getElementById("inNick").value.trim();
  if (!pickedSection) return toast("단계를 먼저 골라 주세요.");
  if (!nickname) return toast("별명을 입력해 주세요.");
  const btn = document.getElementById("btnJoin");
  btn.disabled = true; btn.textContent = "확인 중...";
  const id = deviceId();
  const r = await api("/api/student/join", { section: pickedSection, id, nickname, dailyGoal: pickedGoal });
  if (!r.ok) { btn.disabled = false; btn.textContent = "시작하기"; return toast(r.error); }
  S.login = { section: pickedSection, id, nickname: r.data.nickname };
  localStorage.setItem(LS_LOGIN, JSON.stringify(S.login));
  S.data = r.data; S.today = r.today;
  await loadTodayThenHome();
}
// 다른 기기에서 코드로 같은 학생 이어하기 — 이 기기의 로그인 정보를 그 학생 것으로 덮어씀
async function doLink() {
  const code = document.getElementById("inCode").value.trim().toUpperCase();
  if (!code) return toast("코드를 입력해 주세요.");
  const btn = document.getElementById("btnLink");
  btn.disabled = true; btn.textContent = "확인 중...";
  const r = await api("/api/student/link", { code });
  if (!r.ok) { btn.disabled = false; btn.textContent = "이어하기"; return toast(r.error); }
  S.login = { section: r.section, id: r.id, nickname: r.data.nickname };
  localStorage.setItem(LS_LOGIN, JSON.stringify(S.login));
  S.data = r.data; S.today = r.today;
  await loadTodayThenHome();
}

/* ═══════════════ 부모·보호자용 (읽기전용) ═══════════════ */
function viewParentEntry() {
  render(\`
    \${topbar("👀 부모·보호자용", "viewStartGo")}
    <div class="card">
      <div class="sub" style="margin-bottom:10px">아이의 "나의 기록" 화면에 있는 코드를 넣으면 학습 현황을 볼 수 있어요. (수정은 할 수 없어요)</div>
      <input id="inPCode" class="field" maxlength="6" placeholder="코드 6자리" style="text-transform:uppercase;letter-spacing:3px;text-align:center;font-weight:800">
      <button class="btn big" id="btnPView" style="margin-top:12px">확인하기</button>
    </div>
  \`);
  window.viewStartGo = viewStart;
  const go = async () => {
    const code = document.getElementById("inPCode").value.trim().toUpperCase();
    if (!code) return toast("코드를 입력해 주세요.");
    const btn = document.getElementById("btnPView");
    btn.disabled = true; btn.textContent = "확인 중...";
    const r = await api("/api/parent/view", { code });
    if (!r.ok) { btn.disabled = false; btn.textContent = "확인하기"; return toast(r.error); }
    viewParentReport(r);
  };
  document.getElementById("btnPView").onclick = go;
  document.getElementById("inPCode").onkeydown = e => { if (e.key === "Enter") go(); };
}
function viewParentReport(r) {
  const data = r.data;
  const days = [];
  let d = r.today;
  for (let i = 0; i < 14; i++) { days.unshift(d); d = yesterdayOf(d); }
  const rec = data.days[r.today];
  const done = !!(rec && rec.done);
  const setsDone = rec ? rec.sets.filter(Boolean).length : 0;
  const setsTotal = rec ? rec.sets.length : 0;
  render(\`
    \${topbar("👀 " + esc(data.nickname) + " 학습 현황", "viewParentEntryGo")}
    <div class="card" style="text-align:center">
      <div class="sub">\${esc(r.sectionName)} · \${esc(r.today)}</div>
      <div style="font-size:20px;font-weight:900;margin-top:4px">\${done ? "오늘 학습 완료! 🎉" : setsTotal ? \`오늘 진행 중 (\${setsDone}/\${setsTotal}세트)\` : "오늘은 아직 시작 전이에요"}</div>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="v">🔥\${data.streak | 0}</div><div class="k">연속 학습일</div></div>
      <div class="stat-box"><div class="v">\${data.totalLearned | 0}</div><div class="k">누적 학습 단어</div></div>
      <div class="stat-box"><div class="v">\${data.wrong.length}</div><div class="k">오답 노트</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <b>최근 2주 학습</b>
      <div class="day-grid">
        \${days.map(day => {
          const dr = data.days[day];
          const dd = dr && dr.done;
          return \`<div class="day-cell \${dd ? "done" : ""}"><span>\${day.slice(8)}</span>\${dd ? "✓" : ""}</div>\`;
        }).join("")}
      </div>
    </div>
    <button class="btn gray big" id="btnPBack" style="margin-top:14px">다른 코드 보기</button>
  \`);
  window.viewParentEntryGo = viewParentEntry;
  document.getElementById("btnPBack").onclick = viewParentEntry;
}

// 서버가 준 전체 목록(최대 20개, 반 공유)을 학생의 하루 목표만큼 잘라서 화면에 쓴다.
function applyWords(list) {
  S.fullWords = list;
  const goal = DAILY_GOALS.includes(S.data.dailyGoal) ? S.data.dailyGoal : 20;
  S.words = list.slice(0, goal);
}
/* ── 오늘의 영단어 불러오기 (없으면 서버의 AI가 생성 — 시간이 걸릴 수 있음) ── */
async function loadTodayThenHome() {
  render(\`<div class="loading-box card" style="margin-top:70px">
    <div class="spinner"></div>
    <div style="font-weight:800;font-size:17px">오늘의 영단어를 준비하고 있어요</div>
    <div class="sub" style="margin-top:8px">오늘 처음 접속했다면 AI 선생님이 새 영단어 20개를<br>만드는 중이에요. 1~2분 정도 걸릴 수 있어요 ⏳</div>
  </div>\`);
  const r = await api("/api/today", { section: S.login.section });
  if (!r.ok) {
    render(\`<div class="loading-box card" style="margin-top:70px">
      <div style="font-size:34px">😢</div>
      <div style="font-weight:800;margin-top:8px">오늘의 영단어를 준비하지 못했어요</div>
      <div class="sub" style="margin-top:8px">\${esc(r.error)}</div>
      <button class="btn" style="margin-top:16px" onclick="location.reload()">다시 시도</button>
      <div style="margin-top:10px"><button class="btn gray" id="btnOut2" style="font-size:13px;padding:8px 14px">처음으로</button></div>
    </div>\`);
    document.getElementById("btnOut2").onclick = logout;
    return;
  }
  S.today = r.day; S.realToday = r.day; applyWords(r.words);
  viewHome();
}
// 요일 탭에서 다른 날짜를 골랐을 때 (미리 학습 포함) — 잠겨 있으면 안내만 하고 멈춘다.
async function switchToDay(day) {
  if (day === S.today) return;
  if (!dayUnlocked(day)) { toast("아직 열리지 않았어요. 그 전날 학습을 먼저 끝내 주세요."); return; }
  render(\`<div class="loading-box card" style="margin-top:70px">
    <div class="spinner"></div>
    <div style="font-weight:800;font-size:17px">\${esc(dayLabel(day))} 영단어를 준비하고 있어요</div>
    <div class="sub" style="margin-top:8px">처음 여는 날짜라면 AI 선생님이 새 영단어를 만드는 중이에요.<br>1~2분 정도 걸릴 수 있어요 ⏳</div>
  </div>\`);
  const r = await api("/api/today", { section: S.login.section, day });
  if (!r.ok) { toast(r.error); return viewHome(); }
  S.today = r.day; applyWords(r.words);
  viewHome();
}
function logout() {
  localStorage.removeItem(LS_LOGIN);
  S.login = null; S.data = null;
  viewStart();
}

/* ── 요일 탭 (이번 주 월~일, 실제 달력 기준) ── */
function weekTabsHtml() {
  const dates = weekDatesOf(S.realToday);
  return \`<div class="week-tabs">\${dates.map((d, i) => {
    const isToday = d === S.realToday;
    const isSel = d === S.today;
    const rec = S.data.days[d];
    const done = !!(rec && rec.done);
    const locked = !dayUnlocked(d);
    return \`<button class="wtab \${isSel ? "sel" : ""} \${done ? "done" : ""} \${locked ? "lock" : ""}" data-d="\${d}" \${locked ? "disabled" : ""}>
      <span class="wd">\${WD_SHORT[i]}</span>
      <span class="mk">\${locked ? "🔒" : done ? "✓" : (isToday ? "•" : "")}</span>
    </button>\`;
  }).join("")}</div>\`;
}

/* ── 학생 홈 ── */
function viewHome() {
  const t = todayRec();
  const setsDone = t.sets.filter(Boolean).length;
  const studied = Math.min(setsDone * SET_SIZE, S.words.length);
  const pct = Math.round(((studied + (t.quiz.done ? S.words.length : 0)) / (S.words.length * 2)) * 100);
  const wrongCount = S.data.wrong.length;
  const label = dayLabel(S.today);
  // 오늘 친구들에게 받은 응원 (보낸 사람 이름만 모아서 한 줄로)
  const cheerNames = [...new Set((S.data.cheers || []).filter(c => c.day === S.today).map(c => c.fromNick))];
  render(\`
    <div class="home-head">
      <div>
        <div class="title">안녕, \${esc(S.data.nickname)}! 👋</div>
        <div class="sub">\${esc(secName(S.login.section))} · \${esc(S.today)}</div>
      </div>
      <button class="btn gray" id="btnOut" style="padding:8px 13px;font-size:13px">나가기</button>
    </div>
    \${weekTabsHtml()}
    \${cheerNames.length ? \`<div class="card" style="background:var(--green-soft);border-color:var(--green)">
      📣 <b>\${esc(cheerNames.join(", "))}</b> 님이 응원을 보냈어요!
    </div>\` : ""}
    \${(S.data.messages || []).length ? \`<button class="card" id="btnMsgBanner" style="width:100%;text-align:left;background:var(--blue-soft);border-color:var(--blue)">
      📮 친구에게 받은 쪽지가 <b>\${(S.data.messages || []).length}통</b> 있어요! 눌러서 확인해 보세요.
    </button>\` : ""}
    <div class="card">
      <div class="row">
        <div class="grow">
          <b>\${esc(label)}의 단어 \${S.words.length}개</b>
          \${t.done ? \` <span class="badge green">\${esc(label)} 완료! 🎉</span>\` : ""}
        </div>
        <div class="streak">🔥 \${S.data.streak | 0}일 연속</div>
      </div>
      <div class="prog-wrap"><div class="prog-bar" style="width:\${pct}%"></div></div>
      <div class="sub">공부 \${setsDone}/\${t.sets.length}세트 · 확인 \${t.quiz.done ? "완료 (" + t.quiz.correct + "/" + t.quiz.total + ")" : "전"}</div>
    </div>
    <div class="menu-grid">
      <button class="menu-btn" id="mnStudy"><span class="ico">📖</span><span class="nm">공부모드</span><div class="st">\${setsDone}/\${t.sets.length}세트 완료</div></button>
      <button class="menu-btn" id="mnQuiz"><span class="ico">✏️</span><span class="nm">확인모드</span><div class="st">\${t.quiz.done ? '<span class="done-stamp">' + t.quiz.correct + "/" + t.quiz.total + " 맞힘</span>" : "문제 풀고 점검하기"}</div></button>
      <button class="menu-btn" id="mnWrong"><span class="ico">📕</span><span class="nm">오답 노트</span><div class="st">\${wrongCount ? wrongCount + "개 복습 기다리는 중" : "비어 있어요"}</div></button>
      <button class="menu-btn" id="mnReview"><span class="ico">🔁</span><span class="nm">오늘 복습</span><div class="st">\${setsDone ? "배운 단어 다시 보기" : "먼저 공부해 보세요"}</div></button>
      <button class="menu-btn" id="mnFriends"><span class="ico">👫</span><span class="nm">친구</span><div class="st">\${(S.data.friends || []).length ? (S.data.friends || []).length + "명과 함께 공부해요" : "친구를 초대해 보세요"}</div></button>
      <button class="menu-btn" id="mnStats"><span class="ico">📊</span><span class="nm">나의 기록</span><div class="st">누적 \${S.data.totalLearned | 0}개 학습</div></button>
      <button class="menu-btn" id="mnGame"><span class="ico">🎮</span><span class="nm">단어 게임</span><div class="st">\${(S.data.gameBest && S.data.gameBest.speed) ? "스피드 최고 " + S.data.gameBest.speed + "개" : "오늘 단어로 놀아요!"}</div></button>
      <button class="menu-btn" id="mnSticker"><span class="ico">📚</span><span class="nm">스티커 도감</span><div class="st">🪙 \${Number(S.data.coins || 0)}코인 · 모으기!</div></button>
    </div>
  \`);
  document.getElementById("btnOut").onclick = logout;
  document.getElementById("mnStudy").onclick = viewSets;
  document.getElementById("mnQuiz").onclick = startQuiz;
  document.getElementById("mnWrong").onclick = viewWrong;
  document.getElementById("mnReview").onclick = startReview;
  document.getElementById("mnFriends").onclick = viewFriends;
  document.getElementById("mnStats").onclick = viewStats;
  document.getElementById("mnGame").onclick = viewGames;
  document.getElementById("mnSticker").onclick = viewStickerBook;
  const msgBanner = document.getElementById("btnMsgBanner");
  if (msgBanner) msgBanner.onclick = viewFriends;
  document.querySelectorAll(".wtab").forEach(b => b.onclick = () => switchToDay(b.dataset.d));
}

/* ── 공부모드: 세트 목록 ── */
function viewSets() {
  const t = todayRec();
  render(\`
    \${topbar("📖 공부모드", "viewHomeGo")}
    <div class="sub" style="margin:0 2px 12px">한 번에 10개씩! 카드를 눌러 뜻과 발음을 확인하며 익혀요.</div>
    \${t.sets.map((done, i) => {
      const from = i * SET_SIZE, to = Math.min((i + 1) * SET_SIZE, S.words.length);
      return \`<button class="set-row \${done ? "done" : ""}" data-i="\${i}">
        <span class="no">\${done ? "✓" : (i + 1)}</span>
        <span class="grow"><b>세트 \${i + 1}</b> <span class="sub">(\${from + 1}~\${to}번 단어)</span></span>
        <span class="badge \${done ? "green" : "blue"}">\${done ? "완료" : "학습하기"}</span>
      </button>\`;
    }).join("")}
  \`);
  window.viewHomeGo = viewHome;
  document.querySelectorAll(".set-row").forEach(b => b.onclick = () => startSet(Number(b.dataset.i)));
}

/* ── 공부모드: 카드 넘기기 (3단계: ① 단어 → ② 영어 예문 → ③ 뜻) ── */
const study = { setIdx: 0, cardIdx: 0, stage: 0, cards: [], review: false, hands: false, _timer: null };
function clearHandsTimer(){ if(study._timer){ clearTimeout(study._timer); study._timer=null; } }
// 핸즈프리: 지금 단계에 맞춰 잠시 뒤 자동으로 다음으로 넘어간다.
function scheduleHandsNext(){
  clearHandsTimer();
  if(!study.hands) return;
  var st=study.stage;
  var delay = st===0 ? 2600 : st===1 ? 4200 : 3600;   // 단어 / 예문 / 뜻
  study._timer=setTimeout(function(){
    if(!study.hands) return;
    if(study.stage<2){ nextStage(); return; }          // 다음 단계(goStage가 다시 예약)
    if(study.cardIdx < study.cards.length-1){ study.cardIdx++; goStage(0); return; }  // 다음 카드
    // 마지막 카드의 뜻까지 끝 → 자동 멈춤
    study.hands=false; clearHandsTimer();
    if(study.review){ finishReviewReward(); }
    else { goStage(2); }                                // 마지막 뜻에서 멈춰 버튼 보이기
  }, delay);
}
function startSet(i) {
  study.hands = false; clearHandsTimer();
  study.setIdx = i;
  study.review = false;
  study.cards = S.words.slice(i * SET_SIZE, (i + 1) * SET_SIZE);
  study.cardIdx = 0;
  goStage(0);
}
// 복습: 오늘 배운 단어 전체를 같은 카드로 다시 넘겨 본다.
// 기록(세트 완료·미니 확인)에는 영향을 주지 않는 '그냥 다시 보기' 모드.
function startReview() {
  if (!S.words.length) return toast("복습할 단어가 아직 없어요.");
  study.hands = false; clearHandsTimer();
  study.review = true;
  study.cards = S.words.slice();
  study.cardIdx = 0;
  goStage(0);
}
// 오늘 복습을 끝내면 오늘 날짜에 reviewed 플래그를 켜서 저장한다.
// 서버가 이 플래그를 보고 하루 1번 복습 보상 코인을 준다.
async function finishReviewReward(){
  const t = todayRec();
  const already = !!t.reviewed;
  t.reviewed = true;
  await saveStudent();
  toast(already ? "복습 끝! 잘했어요 👏" : "복습 끝! 코인 30개를 받았어요 🪙");
  viewHome();
}
// 단계를 바꾸면서 그 단계에 맞는 영어 소리를 자동으로 들려준다.
// (뜻 단계는 한국어라 자동 재생하지 않는다)
function goStage(n) {
  clearHandsTimer();
  study.stage = n;
  viewCard();
  const w = study.cards[study.cardIdx];
  if (n === 0) speak(w.word);
  else if (n === 1) speak(w.example);
  if (study.hands) scheduleHandsNext();
}
function nextStage() {
  const w = study.cards[study.cardIdx];
  let n = study.stage + 1;
  if (n === 1 && !w.example) n = 2;   // 예문이 없는 단어는 곧바로 뜻으로
  goStage(n);
}
// 예문 안에서 오늘 배우는 단어를 굵게 보여 준다 (escape 된 문자열만 다룬다)
function highlightWord(example, word) {
  const e = esc(example), t = esc(word);
  const i = e.toLowerCase().indexOf(t.toLowerCase());
  if (i < 0) return e;
  return e.slice(0, i) + "<b>" + e.slice(i, i + t.length) + "</b>" + e.slice(i + t.length);
}
function viewCard() {
  const w = study.cards[study.cardIdx];
  const last = study.cardIdx === study.cards.length - 1;
  const st = study.stage;
  render(\`
    \${topbar(study.review ? "🔁 오늘 복습" : "세트 " + (study.setIdx + 1) + " 학습", "viewSetsGo")}
    <div style="text-align:center;margin-bottom:8px"><button class="btn \${study.hands?'':'ghost'}" id="btnHands" style="padding:8px 16px;font-size:13.5px">\${study.hands?'⏸ 자동넘김 멈춤':'🙌 자동넘김(핸즈프리)'}</button></div>
    <div class="card-count">\${study.cardIdx + 1} / \${study.cards.length}</div>
    <div class="study-card" id="theCard">
      \${st === 0 ? \`
        <div class="row" style="justify-content:center">
          <div class="word">\${esc(w.word)}</div>
          <button class="tts-btn" id="btnTts">🔊</button>
        </div>
        \${w.pronunciation ? \`<div class="pron">[\${esc(w.pronunciation)}]</div>\` : ""}
        <div class="hint">카드를 누르면 예문이 나와요</div>
      \` : st === 1 ? \`
        <div class="example big">\${highlightWord(w.example, w.word)}</div>
        <button class="tts-btn" id="btnTts" style="margin-top:16px">🔊</button>
        <div class="hint">카드를 누르면 뜻이 나와요</div>
      \` : \`
        <div class="row" style="justify-content:center;margin-bottom:4px">
          <div style="font-size:19px;font-weight:800;color:var(--blue)">\${esc(w.word)}</div>
          <button class="tts-btn" id="btnTts" style="width:34px;height:34px;font-size:15px">🔊</button>
        </div>
        \${w.pronunciation ? \`<div class="pron" style="margin-top:0;margin-bottom:10px">[\${esc(w.pronunciation)}]</div>\` : ""}
        <div class="meaning">\${esc(w.meaning)}</div>
        \${w.example ? \`<div class="example">📝 \${highlightWord(w.example, w.word)}</div>\` : ""}
        \${(w.synonym || w.antonym) ? \`<div class="syn">\${w.synonym ? "비슷한말: <b>" + esc(w.synonym) + "</b>" : ""}\${w.synonym && w.antonym ? " · " : ""}\${w.antonym ? "반대말: <b>" + esc(w.antonym) + "</b>" : ""}</div>\` : ""}
      \`}
    </div>
    <div class="card-nav">
      <button class="btn ghost grow" id="btnPrev" \${study.cardIdx === 0 ? "disabled" : ""}>← 이전</button>
      <button class="btn grow" id="btnNext">\${last && st === 2 ? (study.review ? "복습 끝내기 ✅" : "미니 확인 풀기 ✏️") : "다음 →"}</button>
    </div>
  \`);
  window.viewSetsGo = function(){ study.hands=false; clearHandsTimer(); (study.review ? viewHome : viewSets)(); };
  document.getElementById("theCard").onclick = () => { if (study.stage < 2) nextStage(); };
  // 🔊 는 지금 화면에 보이는 것(단어 또는 예문)을 다시 읽어 준다.
  document.getElementById("btnTts").onclick = e => { e.stopPropagation(); speak(study.stage === 1 ? w.example : w.word); };
  document.getElementById("btnPrev").onclick = () => { study.cardIdx--; goStage(0); };
  document.getElementById("btnHands").onclick = () => {
    study.hands = !study.hands;
    toast(study.hands ? "핸즈프리 시작 — 저절로 넘어가요 🙌" : "핸즈프리 멈춤");
    goStage(study.stage);   // 다시 그리며(라벨 갱신) 켜졌으면 자동 예약
  };
  document.getElementById("btnNext").onclick = () => {
    if (study.stage < 2) return nextStage();
    if (last) {
      if (study.review) { finishReviewReward(); return; }
      return startMiniCheck();
    }
    study.cardIdx++; goStage(0);
  };
}

/* ── 세트 끝 미니 확인 (3문제) ── */
const mini = { qs: [], idx: 0, correct: 0 };
function startMiniCheck() {
  const picks = shuffle(study.cards).slice(0, MINI_COUNT);
  mini.qs = picks.map(w => makeQuestion(w, S.words, "m")).filter(Boolean);
  if (mini.qs.length === 0) return finishSet();
  mini.idx = 0; mini.correct = 0;
  viewMiniQ();
}
function viewMiniQ() {
  const q = mini.qs[mini.idx];
  renderQuestion({
    title: "세트 " + (study.setIdx + 1) + " 미니 확인",
    progress: [mini.idx, mini.qs.length],
    q,
    onAnswer(isCorrect) { if (isCorrect) mini.correct++; else addWrong(q.word); },
    onNext() {
      mini.idx++;
      if (mini.idx < mini.qs.length) viewMiniQ();
      else finishSet();
    },
    onBack: viewSets,
  });
}
async function finishSet() {
  const t = todayRec();
  const first = !t.sets[study.setIdx];
  t.sets[study.setIdx] = true;
  const dayJustDone = checkDayDone();
  saveStudent();
  render(\`
    <div class="loading-box card" style="margin-top:60px">
      <div style="font-size:44px">\${first ? "🎉" : "👍"}</div>
      <div style="font-weight:900;font-size:20px;margin-top:10px">세트 \${study.setIdx + 1} 완료!</div>
      \${mini.qs.length ? \`<div class="sub" style="margin-top:6px">미니 확인 \${mini.correct}/\${mini.qs.length} 맞혔어요</div>\` : ""}
      \${dayJustDone ? \`<div class="badge amber" style="margin-top:12px">\${esc(dayLabel(S.today))} \${S.words.length}개 모두 끝! 🔥 연속 \${S.data.streak}일</div>\` : ""}
      <button class="btn big" style="margin-top:18px" id="btnGoSets">다음 세트로</button>
      <div style="margin-top:8px"><button class="btn gray" id="btnGoHome" style="padding:9px 16px;font-size:13.5px">홈으로</button></div>
    </div>
  \`);
  document.getElementById("btnGoSets").onclick = viewSets;
  document.getElementById("btnGoHome").onclick = viewHome;
}

/* ── 문제 화면 공통 (즉시 피드백) ── */
function renderQuestion(opt) {
  const { q, progress, title } = opt;
  render(\`
    \${topbar(title, "qBack")}
    <div class="q-prog"><i style="width:\${Math.round(progress[0] / progress[1] * 100)}%"></i></div>
    <div class="card">
      <div class="sub" style="margin-bottom:6px">\${progress[0] + 1} / \${progress[1]} 문제</div>
      <div class="q-text">\${esc(q.text)}</div>
      \${q.sub ? \`<div class="q-sub" style="font-size:16px;color:#4d5e78;background:var(--bg);border-radius:10px;padding:10px 13px">\${esc(q.sub)}</div>\` : ""}
      <div id="choices" style="margin-top:12px">
        \${q.choices.map(c => \`<button class="choice" data-v="\${esc(c)}">\${esc(c)}</button>\`).join("")}
      </div>
      <div id="fb"></div>
      <button class="btn big hidden" id="btnQNext" style="margin-top:12px">다음 →</button>
    </div>
  \`);
  window.qBack = opt.onBack;
  let answered = false;
  document.querySelectorAll(".choice").forEach(b => b.onclick = () => {
    if (answered) return;
    answered = true;
    const val = b.dataset.v;
    const isCorrect = val === q.answer;
    document.querySelectorAll(".choice").forEach(x => {
      x.disabled = true;
      if (x.dataset.v === q.answer) x.classList.add("correct");
      else if (x === b && !isCorrect) x.classList.add("wrong");
    });
    const fb = document.getElementById("fb");
    if (isCorrect) fb.innerHTML = \`<div class="feedback good">🎯 정답이에요!</div>\`;
    else fb.innerHTML = \`<div class="feedback bad"><b>정답: \${esc(q.answer)}</b><br>
      <b>\${esc(q.word.word)}</b>\${q.word.pronunciation ? " [" + esc(q.word.pronunciation) + "]" : ""} — \${esc(q.word.meaning)}
      \${q.word.example ? "<br>📝 " + esc(q.word.example) : ""}</div>\`;
    opt.onAnswer(isCorrect);
    document.getElementById("btnQNext").classList.remove("hidden");
    document.getElementById("btnQNext").onclick = opt.onNext;
  });
}

/* ── 확인모드 (혼합 문제 + 오답 재출현) ── */
const quiz = { qs: [], idx: 0, correct: 0, wrongs: [] };
function startQuiz() {
  const t = todayRec();
  if (!t.sets.some(Boolean)) { toast("먼저 공부모드에서 1세트 이상 공부해 주세요!"); return; }
  quiz.qs = buildQuiz(S.words, S.data.wrong);
  if (quiz.qs.length === 0) return toast("문제를 만들 단어가 부족해요.");
  quiz.idx = 0; quiz.correct = 0; quiz.wrongs = [];
  viewQuizQ();
}
function viewQuizQ() {
  const q = quiz.qs[quiz.idx];
  renderQuestion({
    title: "✏️ 확인모드",
    progress: [quiz.idx, quiz.qs.length],
    q,
    onAnswer(isCorrect) {
      if (isCorrect) quiz.correct++;
      else { quiz.wrongs.push(q.word); addWrong(q.word); }
    },
    onNext() {
      quiz.idx++;
      if (quiz.idx < quiz.qs.length) viewQuizQ();
      else finishQuiz();
    },
    onBack: viewHome,
  });
}
function finishQuiz() {
  const t = todayRec();
  t.quiz = { done: true, correct: quiz.correct, total: quiz.qs.length };
  // 맞힌 오답 노트 단어는 hit 올리기 (졸업 처리)
  for (const q of quiz.qs) {
    if (quiz.wrongs.includes(q.word)) continue;
    const f = S.data.wrong.find(x => x.word === q.word.word);
    if (f) { f.hit = (f.hit | 0) + 1; }
  }
  S.data.wrong = S.data.wrong.filter(x => (x.hit | 0) < WRONG_GRADUATE);
  const dayJustDone = checkDayDone();
  saveStudent();
  render(\`
    \${topbar("결과", "viewHomeGo")}
    <div class="card">
      <div class="result-big">
        <div class="score">\${quiz.correct} / \${quiz.qs.length}</div>
        <div class="sub" style="margin-top:6px">\${quiz.correct === quiz.qs.length ? "완벽해요! 🏆" : quiz.correct >= quiz.qs.length * 0.7 ? "잘했어요! 조금만 더! 💪" : "틀린 단어는 오답 노트로 갔어요. 다시 만나요! 📕"}</div>
        \${dayJustDone ? \`<div class="badge amber" style="margin-top:12px">\${esc(dayLabel(S.today))} 학습 완료! 🔥 연속 \${S.data.streak}일</div>\` : ""}
      </div>
    </div>
    \${quiz.wrongs.length ? \`<div class="card">
      <b>이번에 틀린 단어 \${quiz.wrongs.length}개</b>
      <div style="margin-top:8px">\${quiz.wrongs.map(w => \`
        <div class="wrong-item"><span class="w">\${esc(w.word)}</span>\${w.pronunciation ? \`<span class="p">[\${esc(w.pronunciation)}]</span>\` : ""}<div class="m">\${esc(w.meaning)}</div></div>\`).join("")}
      </div>
    </div>\` : ""}
    <button class="btn big" id="btnHome2">홈으로</button>
  \`);
  window.viewHomeGo = viewHome;
  document.getElementById("btnHome2").onclick = viewHome;
}

/* ── 오답 노트 ── */
function viewWrong() {
  const list = S.data.wrong;
  render(\`
    \${topbar("📕 오답 노트", "viewHomeGo")}
    \${list.length === 0 ? \`<div class="card loading-box"><div style="font-size:36px">🎈</div>
      <div style="font-weight:800;margin-top:8px">오답 노트가 비어 있어요!</div>
      <div class="sub" style="margin-top:6px">확인모드에서 틀린 단어가 여기에 모여요.</div></div>\`
    : \`
    <div class="row" style="margin-bottom:12px">
      <div class="sub grow">틀린 단어 \${list.length}개 · 재시험에서 \${WRONG_GRADUATE}번 맞히면 졸업해요</div>
      <button class="btn" id="btnRetest" style="padding:10px 16px">재시험 보기</button>
    </div>
    <div class="card">
      \${list.map(w => \`<div class="wrong-item">
        <span class="w">\${esc(w.word)}</span>\${w.pronunciation ? \`<span class="p">[\${esc(w.pronunciation)}]</span>\` : ""}
        <span class="badge \${w.hit ? "green" : "red"}" style="margin-left:6px">\${w.hit ? "맞힘 " + w.hit + "/" + WRONG_GRADUATE : "틀림 " + (w.miss | 0) + "번"}</span>
        <div class="m">\${esc(w.meaning)}\${w.example ? "<br>📝 " + esc(w.example) : ""}</div>
      </div>\`).join("")}
    </div>\`}
  \`);
  window.viewHomeGo = viewHome;
  const bt = document.getElementById("btnRetest");
  if (bt) bt.onclick = startRetest;
}
const retest = { qs: [], idx: 0, correct: 0 };
function startRetest() {
  const targets = shuffle(S.data.wrong).slice(0, 10);
  const pool = S.words.length >= 4 ? S.words.concat(S.data.wrong) : S.data.wrong;
  retest.qs = targets.map((w, i) => makeQuestion(w, pool, i % 2 ? "w" : "m")).filter(Boolean);
  if (retest.qs.length === 0) return toast("재시험 문제를 만들 단어가 부족해요.");
  retest.idx = 0; retest.correct = 0;
  viewRetestQ();
}
function viewRetestQ() {
  const q = retest.qs[retest.idx];
  renderQuestion({
    title: "📕 오답 재시험",
    progress: [retest.idx, retest.qs.length],
    q,
    onAnswer(isCorrect) {
      const f = S.data.wrong.find(x => x.word === q.word.word);
      if (isCorrect) { retest.correct++; if (f) f.hit = (f.hit | 0) + 1; }
      else if (f) { f.miss = (f.miss | 0) + 1; f.hit = 0; }
    },
    onNext() {
      retest.idx++;
      if (retest.idx < retest.qs.length) viewRetestQ();
      else {
        const graduated = S.data.wrong.filter(x => (x.hit | 0) >= WRONG_GRADUATE).length;
        S.data.wrong = S.data.wrong.filter(x => (x.hit | 0) < WRONG_GRADUATE);
        saveStudent();
        toast(\`재시험 \${retest.correct}/\${retest.qs.length} 맞힘\${graduated ? " · " + graduated + "개 졸업 🎓" : ""}\`);
        viewWrong();
      }
    },
    onBack: viewWrong,
  });
}

/* ── 친구: 초대 · 오늘 공부했는지 확인 · 응원 보내기 ── */
async function viewFriends() {
  render(\`\${topbar("👫 친구", "viewHomeGo")}<div class="loading-box"><div class="spinner"></div></div>\`);
  window.viewHomeGo = viewHome;
  const r = await api("/api/friend/list", { section: S.login.section, id: S.login.id });
  if (!r.ok) {
    render(\`\${topbar("👫 친구", "viewHomeGo")}<div class="card">\${esc(r.error)}</div>\`);
    window.viewHomeGo = viewHome;
    return;
  }
  // 서버가 알려 준 '오늘 받은 응원'과 쪽지함을 내 기록에도 반영해 둔다 (홈 화면 안내문에 쓰임)
  S.data.cheers = (S.data.cheers || []).filter(c => c.day !== r.day).concat(r.cheersToday || []);
  S.data.friends = r.friends.map(f => ({ section: f.section, id: f.id }));
  const messages = r.messages || [];
  S.data.messages = messages;

  render(\`
    \${topbar("👫 친구", "viewHomeGo")}
    <div class="card">
      <b>내 초대 코드</b>
      <div class="sub" style="margin-top:4px">친구에게 이 코드를 알려주면 친구가 나를 추가할 수 있어요.</div>
      <div style="margin-top:10px;text-align:center;font-size:30px;font-weight:900;letter-spacing:4px;background:var(--bg);border-radius:10px;padding:12px">\${esc(r.myCode || "-")}</div>
    </div>
    <div class="card">
      <b>친구 코드로 추가하기</b>
      <div class="row" style="margin-top:10px">
        <input id="inFriendCode" class="field grow" maxlength="6" placeholder="예: K7M2QP" style="text-transform:uppercase;letter-spacing:3px;font-weight:800">
        <button class="btn" id="btnAddFriend" style="padding:12px 16px">추가</button>
      </div>
    </div>
    <div class="card">
      <b>📮 받은 쪽지함 \${messages.length ? "(" + messages.length + ")" : ""}</b>
      <div style="margin-top:10px">
        \${messages.length === 0 ? \`<div class="sub">아직 받은 쪽지가 없어요.</div>\` : messages.map(m => \`<div class="wrong-item">
          <div class="row">
            <div class="grow">
              <span class="w">\${esc(m.fromNick)}</span> <span class="sub">\${esc(m.day)}</span>
              <div class="m">\${esc(m.text)}</div>
            </div>
            <button class="mini-x" data-delmsg="\${esc(m.id)}" title="쪽지 지우기">✕</button>
          </div>
        </div>\`).join("")}
      </div>
    </div>
    \${r.friends.length === 0 ? \`<div class="card loading-box">
      <div style="font-size:36px">👋</div>
      <div style="font-weight:800;margin-top:8px">아직 친구가 없어요</div>
      <div class="sub" style="margin-top:6px">친구의 코드를 받아 위에 넣어 보세요.<br>서로 오늘 공부했는지 보고 응원하거나 쪽지를 보낼 수 있어요!</div>
    </div>\` : \`
    <div class="card">
      <b>친구 \${r.friends.length}명 · \${esc(r.day)}</b>
      <div style="margin-top:10px">
        \${r.friends.map(f => \`<div class="wrong-item">
          <div class="row">
            <div class="grow">
              <span class="w">\${esc(f.nickname)}</span>
              <span class="badge \${f.todayDone ? "green" : f.todaySets ? "blue" : "red"}" style="margin-left:6px">\${f.todayDone ? "오늘 완료 🎉" : f.todaySets ? f.todaySets + "세트 공부 중" : "아직 안 했어요"}</span>
              <div class="m">\${esc(f.sectionName)} · 🔥 \${f.streak}일 연속\${f.todayQuiz ? " · 확인모드 완료" : ""}</div>
            </div>
            <button class="btn \${f.cheeredByMe ? "gray" : "ghost"}" data-cheer="\${esc(f.id)}" data-sec="\${esc(f.section)}" data-nick="\${esc(f.nickname)}" \${f.cheeredByMe ? "disabled" : ""} style="padding:9px 13px;font-size:13.5px">\${f.cheeredByMe ? "응원함 💌" : "응원하기 📣"}</button>
            <button class="btn ghost" data-msgopen="\${esc(f.id)}" style="padding:9px 12px;font-size:13.5px">✉️</button>
            <button class="mini-x" data-del="\${esc(f.id)}" data-dsec="\${esc(f.section)}" data-dnick="\${esc(f.nickname)}" title="친구 삭제">✕</button>
          </div>
          <div id="msgBox-\${esc(f.id)}" class="hidden row" style="margin-top:10px">
            <input class="field grow" data-msgtext="\${esc(f.id)}" maxlength="\${MSG_MAX_LEN}" placeholder="짧은 쪽지를 보내 보세요 (\${MSG_MAX_LEN}자 이내)">
            <button class="btn" data-msgsend="\${esc(f.id)}" data-sec="\${esc(f.section)}" data-nick="\${esc(f.nickname)}" style="padding:12px 16px">보내기</button>
          </div>
        </div>\`).join("")}
      </div>
    </div>\`}
  \`);
  window.viewHomeGo = viewHome;

  const codeInput = document.getElementById("inFriendCode");
  const addFriend = async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 6) return toast("코드 6자리를 정확히 넣어 주세요.");
    const btn = document.getElementById("btnAddFriend");
    btn.disabled = true; btn.textContent = "확인 중";
    const rr = await api("/api/friend/add", { section: S.login.section, id: S.login.id, code });
    if (!rr.ok) { btn.disabled = false; btn.textContent = "추가"; return toast(rr.error); }
    toast(\`'\${rr.nickname}' 님과 친구가 됐어요! 🎉\`);
    viewFriends();
  };
  document.getElementById("btnAddFriend").onclick = addFriend;
  codeInput.onkeydown = e => { if (e.key === "Enter") addFriend(); };

  document.querySelectorAll("[data-cheer]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    const rr = await api("/api/friend/cheer", { section: S.login.section, id: S.login.id, toSection: b.dataset.sec, toId: b.dataset.cheer });
    if (!rr.ok) { b.disabled = false; return toast(rr.error); }
    toast(\`'\${b.dataset.nick}' 님에게 응원을 보냈어요 📣\`);
    viewFriends();
  });
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm(\`'\${b.dataset.dnick}' 님을 친구 목록에서 지울까요?\`)) return;
    const rr = await api("/api/friend/remove", { section: S.login.section, id: S.login.id, toSection: b.dataset.dsec, toId: b.dataset.del });
    if (!rr.ok) return toast(rr.error);
    toast("친구를 지웠어요.");
    viewFriends();
  });
  document.querySelectorAll("[data-msgopen]").forEach(b => b.onclick = () => {
    const box = document.getElementById("msgBox-" + b.dataset.msgopen);
    box.classList.remove("hidden");
    box.querySelector("input").focus();
  });
  const sendMessage = async b => {
    const input = document.querySelector(\`[data-msgtext="\${b.dataset.msgsend}"]\`);
    const text = input.value.trim();
    if (!text) return toast("쪽지 내용을 입력해 주세요.");
    b.disabled = true;
    const rr = await api("/api/friend/message/send", { section: S.login.section, id: S.login.id, toSection: b.dataset.sec, toId: b.dataset.msgsend, text });
    b.disabled = false;
    if (!rr.ok) return toast(rr.error);
    toast(\`'\${b.dataset.nick}' 님에게 쪽지를 보냈어요 ✉️\`);
    input.value = "";
    document.getElementById("msgBox-" + b.dataset.msgsend).classList.add("hidden");
  };
  document.querySelectorAll("[data-msgsend]").forEach(b => b.onclick = () => sendMessage(b));
  document.querySelectorAll("[data-msgtext]").forEach(inp => inp.onkeydown = e => {
    if (e.key === "Enter") document.querySelector(\`[data-msgsend="\${inp.dataset.msgtext}"]\`).click();
  });
  document.querySelectorAll("[data-delmsg]").forEach(b => b.onclick = async () => {
    const rr = await api("/api/friend/message/delete", { section: S.login.section, id: S.login.id, messageId: b.dataset.delmsg });
    if (!rr.ok) return toast(rr.error);
    viewFriends();
  });
}

/* ── 📚 스티커 도감 ── */
function ensureStickerClientData() {
  if (!S.data.stickerBook || typeof S.data.stickerBook !== "object") S.data.stickerBook = {};
  if (!S.data.stickerBook.stickers || typeof S.data.stickerBook.stickers !== "object") S.data.stickerBook.stickers = {};
  if (!S.data.stickerBook.completedPages || typeof S.data.stickerBook.completedPages !== "object") S.data.stickerBook.completedPages = {};
  if (!Array.isArray(S.data.stickerBook.badges)) S.data.stickerBook.badges = [];
  if (!Number.isFinite(Number(S.data.stickerBook.mileage))) S.data.stickerBook.mileage = 0;
  if (!Number.isFinite(Number(S.data.stickerBook.goldTickets))) S.data.stickerBook.goldTickets = 0;
}
function stickerHas(id) { ensureStickerClientData(); return Number(S.data.stickerBook.stickers[id] || 0) > 0; }
function stickerCount(cat) { return STICKER_CATALOG.filter(function(x){return x.category===cat;}).filter(function(x){return stickerHas(x.sticker_id);}).length; }
function stickerById(id) { return STICKER_CATALOG.find(function(x){return x.sticker_id===id;}); }
function stickerQty(id) { ensureStickerClientData(); return Number(S.data.stickerBook.stickers[id] || 0); }
function goldTickets() { ensureStickerClientData(); return Number(S.data.stickerBook.goldTickets || 0); }
function stickerPic(st) {
  return '<div class="pic"><img src="' + esc(st.image_url) + '" alt="' + esc(st.name) + '" onerror="this.style.display=&quot;none&quot;;this.nextElementSibling.style.display=&quot;block&quot;"><span class="emo" style="display:none">' + st.emoji + '</span></div>';
}
function closeStickerModal(){ var e=document.getElementById("stickerModal"); if(e)e.remove(); }
function stickerModal(html){
  closeStickerModal();
  document.body.insertAdjacentHTML("beforeend", '<div id="stickerModal" class="sticker-modal-bg"><div class="sticker-modal">' + html + '</div></div>');
  document.getElementById("stickerModal").onclick=function(e){if(e.target.id==="stickerModal")closeStickerModal();};
}
function showStickerReveal(st, title, sub, onDone){
  var html = '<div style="font-size:19px;font-weight:900">' + esc(title) + '</div>' +
    '<div class="sticker-flip" id="stFlip"><div class="sticker-flip-inner"><div class="sticker-face sticker-front">🎁</div><div class="sticker-face sticker-back">' + stickerPic(st) + '<div style="font-weight:900">' + esc(st.name) + '</div></div></div></div>' +
    '<div class="sub">' + esc(sub || "") + '</div><button class="btn big" id="stClose" style="margin-top:12px">확인</button>';
  stickerModal(html);
  setTimeout(function(){var f=document.getElementById("stFlip");if(f)f.classList.add("show");},120);
  var done=function(){ closeStickerModal(); if(onDone) onDone(); };
  var b=document.getElementById("stClose"); if(b) b.onclick=done;
}
async function buySticker(id){
  var st=stickerById(id); if(!st) return;
  if(stickerHas(id)) return toast("이미 가지고 있는 스티커예요.");
  if(Number(S.data.coins||0)<st.price) return toast("코인이 부족해요. 오늘 학습·복습을 하면 코인을 받을 수 있어요!");
  if(!confirm(st.name + " 스티커를 " + st.price + "코인으로 구매할까요?")) return;
  var r=await api("/api/sticker/buy",{section:S.login.section,id:S.login.id,stickerId:id});
  if(!r.ok)return toast(r.error||"구매에 실패했어요.");
  S.data=r.data; ensureStickerClientData();
  showStickerReveal(st,"새 스티커를 획득했어요! 🎉","현재 코인 " + Number(S.data.coins||0) + "개",viewStickerBook);
}

/* 🔍 스티커 한 장 확대해서 보기
   - 보유한 스티커: 크게 감상 + (10장 이상이면) 골드티켓으로 교환
   - 아직 없는 스티커: 코인으로 구매하거나 골드티켓으로 바로 받기 */
function openStickerDetail(id){
  ensureStickerClientData();
  var st=stickerById(id); if(!st) return;
  var qty=stickerQty(id), owned=qty>0, tickets=goldTickets();
  var cat=STICKER_CATEGORIES.find(function(x){return x.id===st.category;});
  var acts="";
  if(owned){
    if(qty>=STICKER_TICKET_NEED)
      acts+='<button class="btn gold" id="stMakeTicket">🎟️ 골드티켓 1장으로 바꾸기</button>' +
        '<div class="ticket-note">같은 스티커 ' + STICKER_TICKET_NEED + '장을 내고 골드티켓 1장을 받아요. 도감 보관용 ' + STICKER_TICKET_KEEP + '장은 남겨 둡니다.</div>';
    else
      acts+='<div class="ticket-note">🎟️ 같은 스티커를 ' + STICKER_TICKET_NEED + '장 모으면 골드티켓 1장으로 바꿀 수 있어요. (' + qty + '/' + STICKER_TICKET_NEED + '장)</div>';
  } else {
    if(tickets>0) acts+='<button class="btn gold" id="stUseTicket">🎟️ 골드티켓으로 받기 (남은 티켓 ' + tickets + '장)</button>';
    acts+='<button class="btn" id="stBuyNow">🪙 ' + st.price + '코인으로 사기</button>';
  }
  acts+='<button class="btn gray" id="stCloseView">닫기</button>';
  stickerModal('<div class="st-view">' +
    '<div class="big ' + (owned?"":"locked") + '">' + (owned ? stickerPic(st) : '<div class="pic"><span class="emo">' + st.emoji + '</span></div>') + '</div>' +
    '<div class="nm">' + esc(st.name) + (owned?"":" 🔒") + '</div>' +
    '<div class="meta">' + esc(cat?cat.name:"") + ' · ' + (owned ? ("보유 " + qty + "장") : ("아직 없어요 · 🪙 " + st.price)) + '</div>' +
    '<div class="st-actions">' + acts + '</div></div>');
  var $=function(x){return document.getElementById(x);};
  if($("stCloseView")) $("stCloseView").onclick=closeStickerModal;
  if($("stBuyNow")) $("stBuyNow").onclick=function(){closeStickerModal();buySticker(id);};
  if($("stMakeTicket")) $("stMakeTicket").onclick=function(){makeGoldTicket(id);};
  if($("stUseTicket")) $("stUseTicket").onclick=function(){useGoldTicket(id);};
}
// 같은 스티커 10장 → 골드티켓 1장
async function makeGoldTicket(id){
  var st=stickerById(id); if(!st) return;
  if(stickerQty(id)<STICKER_TICKET_NEED) return toast("같은 스티커 " + STICKER_TICKET_NEED + "장이 필요해요.");
  if(!confirm(st.name + " 스티커 " + STICKER_TICKET_NEED + "장을 골드티켓 1장으로 바꿀까요?\\n(도감 보관용 " + STICKER_TICKET_KEEP + "장은 남아요)")) return;
  var r=await api("/api/sticker/ticket/make",{section:S.login.section,id:S.login.id,stickerId:id});
  if(!r.ok)return toast(r.error||"교환에 실패했어요.");
  S.data=r.data; ensureStickerClientData();
  closeStickerModal(); viewStickerBook();
  toast("🎟️ 골드티켓 " + goldTickets() + "장! 갖고 싶은 스티커를 눌러 사용해 보세요.");
}
// 골드티켓 1장 → 원하는 스티커 1장 (가격 상관없음)
async function useGoldTicket(id){
  var st=stickerById(id); if(!st) return;
  if(goldTickets()<1) return toast("골드티켓이 없어요.");
  if(stickerHas(id)) return toast("이미 가지고 있는 스티커예요.");
  if(!confirm("골드티켓 1장으로 " + st.name + " 스티커를 받을까요? (코인은 들지 않아요)")) return;
  var r=await api("/api/sticker/ticket/use",{section:S.login.section,id:S.login.id,stickerId:id});
  if(!r.ok)return toast(r.error||"사용에 실패했어요.");
  S.data=r.data; ensureStickerClientData();
  var extra=r.pageRewards && r.pageRewards.length ? " · 🏆 도감 완성 보상 +" + r.pageRewards.reduce(function(a,x){return a+x.reward;},0) + "코인" : "";
  showStickerReveal(st,"골드티켓으로 획득! 🎟️","남은 골드티켓 " + goldTickets() + "장" + extra,viewStickerBook);
}
/* 뽑은 스티커를 한 장씩 좌우로 넘겨 보는 뷰어
   (예전에는 3칸 그리드라 모바일에서 카드가 겹쳐 보였다) */
function packResultsHtml(results){
  var items=results.map(function(x){
    var st=stickerById(x.sticker_id) || {name:x.name,emoji:x.emoji,image_url:x.image_url};
    return '<div class="pack-item">' + stickerPic(st) + '<div class="nm">' + esc(x.name) + '</div>' +
      (x.duplicate ? '<div class="dup">중복 · 마일리지 +' + (x.mileage||40) + '</div>' : '<div class="dup" style="color:var(--green)">NEW!</div>') +
      '</div>';
  }).join("");
  var dots=results.map(function(_,i){return '<i class="' + (i===0?"on":"") + '"></i>';}).join("");
  return '<div class="pack-viewer">' +
    '<div class="pack-track" id="packTrack">' + items + '</div>' +
    '<div class="pack-nav"><button class="pack-arrow" id="packPrev">‹</button><div class="pack-dots" id="packDots">' + dots + '</div><button class="pack-arrow" id="packNext">›</button></div>' +
    '<div class="sub" style="font-size:12px;margin-top:6px">← 옆으로 넘겨서 ' + results.length + '장을 모두 볼 수 있어요 →</div></div>';
}
// 뷰어 좌우 넘기기 + 점(dot) 표시 연결
function bindPackViewer(){
  var track=document.getElementById("packTrack"); if(!track) return;
  var dots=document.getElementById("packDots");
  var prev=document.getElementById("packPrev"), next=document.getElementById("packNext");
  var kids=track.children, last=kids.length-1;
  function step(){ return kids.length>1 ? (kids[1].offsetLeft-kids[0].offsetLeft) : (track.clientWidth||1); }
  function cur(){ return Math.max(0,Math.min(last,Math.round(track.scrollLeft/step()))); }
  function sync(){
    var i=cur();
    if(dots) Array.prototype.forEach.call(dots.children,function(dot,k){ dot.classList.toggle("on",k===i); });
    if(prev) prev.disabled=(i<=0);
    if(next) next.disabled=(i>=last);
  }
  track.onscroll=sync;
  function go(dir){ track.scrollTo({left:(cur()+dir)*step(),behavior:"smooth"}); }
  if(prev) prev.onclick=function(){go(-1);};
  if(next) next.onclick=function(){go(1);};
  sync();
}
async function buyStickerPack(){
  if(Number(S.data.coins||0)<80) return toast("코인이 부족해요.");
  if(!confirm("80코인으로 랜덤 스티커 3장을 뽑을까요? (중복은 마일리지로 받아요)")) return;
  var r=await api("/api/sticker/pack",{section:S.login.section,id:S.login.id});
  if(!r.ok)return toast(r.error||"뽑기에 실패했어요.");
  S.data=r.data; ensureStickerClientData();
  var rewardText = r.pageRewards && r.pageRewards.length ? '<div class="sticker-mileage" style="background:var(--green-soft);color:var(--green);border-color:var(--green)">🏆 도감 완성! +' + r.pageRewards.reduce(function(a,x){return a+x.reward;},0) + '코인</div>' : '';
  var resultHtml = '<div style="font-size:20px;font-weight:900">스티커 팩 결과 🎉</div>' +
    packResultsHtml(r.results) + rewardText +
    '<div class="sub">현재 코인 ' + Number(S.data.coins||0) + '개 · 마일리지 ' + Number(S.data.stickerBook.mileage||0) + '</div>' +
    '<button class="btn big" id="packDone" style="margin-top:12px">확인</button>';
  stickerModal(resultHtml);
  bindPackViewer();
  document.getElementById("packDone").onclick=function(){closeStickerModal();viewStickerBook();};
}
// 마일리지로 랜덤 1장 뽑기
async function drawByMileage(){
  ensureStickerClientData();
  if(Number(S.data.stickerBook.mileage||0)<100) return toast("마일리지가 부족해요. 랜덤팩에서 중복이 나오면 마일리지가 쌓여요!");
  if(!confirm("마일리지 100으로 랜덤 스티커 1장을 뽑을까요?")) return;
  var r=await api("/api/sticker/draw",{section:S.login.section,id:S.login.id});
  if(!r.ok)return toast(r.error||"뽑기에 실패했어요.");
  S.data=r.data; ensureStickerClientData();
  var st=stickerById(r.result.sticker_id);
  var sub=r.result.duplicate
    ? ("중복! 마일리지 +" + (r.result.mileageBack||0) + " · 남은 마일리지 " + Number(S.data.stickerBook.mileage||0))
    : ("남은 마일리지 " + Number(S.data.stickerBook.mileage||0));
  showStickerReveal(st, r.result.duplicate?"또 나왔어요!":"새 스티커 획득! 🎉", sub, viewStickerBook);
}
function viewStickerBook(){
  ensureStickerClientData();
  var cats = STICKER_CATEGORIES.map(function(c){
    var n=stickerCount(c.id);
    return '<button class="sticker-cat ' + (n===12?"complete":"") + '" data-cat="' + c.id + '"><span class="ico">' + c.emoji + '</span><div class="nm">' + c.name + ' ' + (n===12?"🏆":"") + '</div><div class="pr">' + n + '/12 수집 · 완성 보상 500코인</div><div class="sticker-progress"><i style="width:' + (n/12*100) + '%"></i></div></button>';
  }).join("");
  var active=(S._stickerCat&&STICKER_CATEGORIES.some(function(x){return x.id===S._stickerCat;}))?S._stickerCat:"animal";
  S._stickerCat=active;
  var list=STICKER_CATALOG.filter(function(x){return x.category===active;});
  var grid=list.map(function(st,i){
    var own=stickerHas(st.sticker_id);
    var visual=own?stickerPic(st):'<div class="pic"><span class="emo">' + st.emoji + '</span></div>';
    return '<button class="sticker-card ' + (own?"unlocked":"locked") + '" data-sticker="' + st.sticker_id + '"><span class="num">' + (i+1) + '</span>' + visual + '<span class="lock">' + (own?"":"🔒") + '</span><span class="sn">' + esc(st.name) + '</span>' + (own?'<span class="price">보유 ' + Number(S.data.stickerBook.stickers[st.sticker_id]||0) + '장</span>':'<span class="price">🪙 ' + st.price + '</span>') + '</button>';
  }).join("");
  var completeBanner=stickerCount(active)===12?'<div class="sticker-mileage" style="margin-top:12px;background:var(--green-soft);color:var(--green);border-color:var(--green)">🏆 페이지 완성! 500코인 보상을 받았어요.</div>':'';
  render(topbar("📚 스티커 도감","viewHomeGo") +
    '<div class="sticker-head"><div><div class="title">스티커 도감</div><div class="sub">모으고 또 모아 보세요!</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><div class="coin-pill">🪙 ' + Number(S.data.coins||0) + '</div>' + (goldTickets()>0?'<div class="coin-pill" style="background:#fff6da;color:#a5761a;border-color:#e8cf90">🎟️ ' + goldTickets() + '</div>':'') + '</div></div>' +
    '<div class="sticker-cats">' + cats + '</div>' +
    '<div class="card"><div class="sticker-head"><div><b>' + esc(STICKER_CATEGORIES.find(function(x){return x.id===active;}).name) + '</b><div class="sub" style="margin-top:3px">스티커를 누르면 크게 볼 수 있어요. 잠긴 스티커는 뒤로 갈수록 비싸요.</div></div></div>' +
    '<div class="sticker-tools"><button class="btn" id="stPack">🎁 랜덤팩 80코인·3장</button><button class="btn green" id="stDraw">⭐ 마일리지 뽑기 100</button></div>' +
    '<div class="sticker-mileage">⭐ 마일리지: ' + Number(S.data.stickerBook.mileage||0) + ' · 랜덤팩에서 중복이 나오면 마일리지로 쌓이고, 마일리지 100으로 한 장 더 뽑을 수 있어요.</div>' +
    '<div class="ticket-bar">🎟️ 골드티켓: ' + goldTickets() + '장 · 같은 스티커를 ' + STICKER_TICKET_NEED + '장 모으면 골드티켓 1장으로 바꿀 수 있고, 티켓 1장이면 가격에 상관없이 원하는 스티커를 받아요.</div>' +
    '<div style="margin-top:8px"><button class="btn gray" id="stRefresh" style="font-size:12.5px;padding:8px 12px">🔄 새로고침</button></div>' +
    '<div class="sticker-grid" style="margin-top:12px">' + grid + '</div>' + completeBanner + '</div>');
  window.viewHomeGo=viewHome;
  document.querySelectorAll("[data-cat]").forEach(function(b){b.onclick=function(){S._stickerCat=b.dataset.cat;viewStickerBook();};});
  document.querySelectorAll("[data-sticker]").forEach(function(b){b.onclick=function(){openStickerDetail(b.dataset.sticker);};});
  document.getElementById("stPack").onclick=buyStickerPack;
  var stDrawBtn=document.getElementById("stDraw"); if(stDrawBtn) stDrawBtn.onclick=drawByMileage;
  document.getElementById("stRefresh").onclick=async function(){var r=await api("/api/student/join",S.login);if(r.ok){S.data=r.data;viewStickerBook();}};
}

/* ═══════════════ 단어 게임 ═══════════════
   오늘(또는 요일 탭에서 고른 날) 배운 단어로 노는 미니 게임 3종.
   공부/확인 기록에는 영향을 주지 않고, 하루 1번 완주 코인만 준다. */
// 🐍 뱀 대격돌 주소 — 배포한 워커 주소로 바꿔 주세요 (snake-online/README 참고)
const SNAKE_URL = "https://snake-clash.dasooni.workers.dev";
const GAME_REWARD = 20;      // 하루 1번 게임을 끝내면 주는 코인(서버 GAME_REWARD 와 일치시킬 것)
const SNAKE_TICKET_PRICE = 50;  // 뱀 대격돌 입장권 값(서버 SNAKE_TICKET_PRICE 와 일치시킬 것)
const SNAKE_TICKET_PLAYS = 3;   // 입장권 1장으로 하는 판 수(서버 SNAKE_TICKET_PLAYS 와 일치시킬 것)
const GAME_SPEED_SEC = 60;   // 스피드 퀴즈 제한 시간(초)
const GAME_MATCH_PAIRS = 6;  // 짝 맞추기에 쓰는 단어 수(카드 12장)
const GAME_SPELL_COUNT = 8;  // 철자 완성 문제 수

let gameTimer = null;
function clearGameTimer() { if (gameTimer) { clearInterval(gameTimer); gameTimer = null; } }
function gameBest() {
  if (!S.data.gameBest || typeof S.data.gameBest !== "object") S.data.gameBest = { speed: 0, match: 0, spell: 0 };
  return S.data.gameBest;
}
// 한 판 끝 — 최고 기록을 갱신하고, 오늘 첫 판이면 true (코인은 서버가 하루 1번만 준다)
function finishGame(kind, score, isBetter) {
  const b = gameBest();
  if (isBetter) b[kind] = score;
  const t = todayRec();
  const first = !t.gamePlayed;
  t.gamePlayed = true;
  saveStudent();               // 결과 화면은 저장을 기다리지 않는다
  return first;
}
// 게임 3종이 함께 쓰는 결과 화면
function gameResult(opt) {
  clearGameTimer();
  render(\`
    \${topbar(opt.title, "viewGamesGo")}
    <div class="card">
      <div class="result-big">
        <div style="font-size:44px">\${opt.emoji}</div>
        <div class="score" style="font-size:38px;margin-top:4px">\${esc(opt.score)}</div>
        <div class="sub" style="margin-top:8px">\${esc(opt.msg)}</div>
        \${opt.newBest ? \`<div class="badge amber" style="margin-top:12px">🏅 최고 기록을 새로 세웠어요!</div>\` : ""}
        \${opt.coin ? \`<div class="badge green" style="margin-top:12px">🪙 오늘 첫 게임 완주! 코인 \${GAME_REWARD}개</div>\` : ""}
      </div>
    </div>
    <button class="btn big" id="btnAgain">한 판 더! 🔁</button>
    <div style="margin-top:8px"><button class="btn gray big" id="btnGameHub">다른 게임 고르기</button></div>
  \`);
  window.viewGamesGo = viewGames;
  document.getElementById("btnAgain").onclick = opt.again;
  document.getElementById("btnGameHub").onclick = viewGames;
}

/* ── 게임 고르기 ── */
/* 뱀 대격돌 열기 — 오늘의 단어를 주소 조각(#)에 실어 넘긴다.
   조각은 서버로 전송되지 않으므로 단어 목록이 서버 기록에 남지 않는다.
   별도 앱이라 이 게임은 하루 1회 코인 보상 대상이 아니다(게임 자체 점수로 스킨을 연다). */
function snakeWordList() {
  return (S.words || [])
    .map(w => [String(w.word || "").trim(), String(w.meaning || "").trim()])
    .filter(p => p[0] && p[1]);
}
// 입장권(토큰 + 판 수)을 단어와 함께 실어 새 창으로 넘긴다.
function snakeUrlFor(ticket) {
  const payload = {
    n: (S.login && S.login.nickname) || "",
    d: dayLabel(S.today),
    w: snakeWordList(),
    tk: ticket.token,          // 1회용 입장권 번호 (뱀 게임이 남은 판을 기억할 때 쓰는 열쇠)
    p: ticket.plays | 0,       // 이 입장권으로 할 수 있는 판 수
  };
  return SNAKE_URL + "#eng=" + encodeURIComponent(JSON.stringify(payload));
}
// 새 창은 클릭 처리 안에서 미리 열어 둔다. (구매 응답을 기다린 뒤 열면 팝업 차단에 걸린다)
async function buySnakeTicket() {
  if (snakeWordList().length < 4) return toast("게임할 단어가 부족해요.");
  const have = Number(S.data.coins || 0);
  if (have < SNAKE_TICKET_PRICE)
    return toast("코인이 " + (SNAKE_TICKET_PRICE - have) + "개 모자라요. 공부하고 다시 와요!");
  if (!confirm("코인 " + SNAKE_TICKET_PRICE + "개로 입장권을 살까요?\\n(뱀 대격돌 " + SNAKE_TICKET_PLAYS + "판)")) return;
  const win = window.open("about:blank", "_blank");
  const r = await api("/api/game/snake-ticket", S.login);
  if (!r.ok) { if (win) win.close(); return toast(r.error); }
  S.data = r.data; ensureStickerClientData();
  if (win) win.location = snakeUrlFor(r.ticket);
  else toast("새 창이 막혔어요. 팝업을 허용한 뒤 '입장권으로 열기'를 눌러 주세요.");
  viewGames();
}
// 방금 산 입장권으로 다시 열기 (창을 실수로 닫았을 때). 이미 쓴 판은 되살아나지 않는다.
function reopenSnakeGame() {
  const t = S.data && S.data.snakeTicket;
  if (!t || !t.token) return toast("가지고 있는 입장권이 없어요.");
  if (snakeWordList().length < 4) return toast("게임할 단어가 부족해요.");
  const win = window.open(snakeUrlFor(t), "_blank", "noopener");
  if (!win) toast("새 창이 막혔어요. 브라우저에서 팝업을 허용해 주세요.");
}

function viewGames() {
  clearGameTimer();
  const b = gameBest();
  const t = todayRec();
  const n = S.words.length;
  render(\`
    \${topbar("🎮 단어 게임", "viewHomeGo")}
    <div class="sub" style="margin:0 2px 12px">\${esc(dayLabel(S.today))}의 단어 \${n}개로 놀면서 익혀요.
      \${t.gamePlayed ? "오늘 게임 보상은 이미 받았어요 ✓" : \`한 판만 끝내도 코인 \${GAME_REWARD}개를 받아요! 🪙\`}</div>
    \${n < 4 ? \`<div class="card loading-box"><div style="font-size:36px">🕹️</div>
      <div style="font-weight:800;margin-top:8px">아직 게임할 단어가 부족해요</div>
      <div class="sub" style="margin-top:6px">단어를 먼저 불러온 다음에 놀 수 있어요.</div></div>\`
    : \`<div class="game-list">
      <button class="game-btn" id="gnSpeed">
        <span class="ico">⚡</span>
        <span class="grow"><span class="nm">스피드 퀴즈</span>
          <div class="de">\${GAME_SPEED_SEC}초 동안 몇 개나 맞힐 수 있을까? 빠르게 뜻과 단어를 골라요.</div>
          <div class="best">최고 기록: \${(b.speed | 0) ? (b.speed | 0) + "개" : "아직 없어요"}</div></span>
      </button>
      <button class="game-btn" id="gnMatch">
        <span class="ico">🃏</span>
        <span class="grow"><span class="nm">짝 맞추기</span>
          <div class="de">뒤집힌 카드에서 단어와 뜻을 짝지어요. 시간이 짧을수록 좋아요.</div>
          <div class="best">최고 기록: \${(b.match | 0) ? (b.match | 0) + "초" : "아직 없어요"}</div></span>
      </button>
      <button class="game-btn" id="gnSpell">
        <span class="ico">🔤</span>
        <span class="grow"><span class="nm">철자 완성</span>
          <div class="de">뜻을 보고 흩어진 알파벳을 순서대로 눌러 단어를 만들어요.</div>
          <div class="best">최고 기록: \${(b.spell | 0) ? (b.spell | 0) + "개" : "아직 없어요"}</div></span>
      </button>
      <button class="game-btn" id="gnSnake">
        <span class="ico">🐍</span>
        <span class="grow"><span class="nm">뱀 대격돌 <span class="badge amber" style="margin-left:4px">입장권 \${SNAKE_TICKET_PRICE}코인</span></span>
          <div class="de">뜻이 맞는 단어를 먹으면 뱀이 쑥쑥 자라요. 입장권 1장으로 \${SNAKE_TICKET_PLAYS}판 할 수 있어요.</div>
          <div class="best">🪙 지금 \${Number(S.data.coins || 0)}코인 · 오늘의 단어 \${n}개를 가져가요</div></span>
      </button>
      \${(S.data && S.data.snakeTicket && S.data.snakeTicket.token) ? \`<button class="btn ghost" id="gnSnakeAgain" style="width:100%;padding:11px;font-size:14px">🎟️ 방금 산 입장권으로 다시 열기</button>\` : ""}
    </div>\`}
  \`);
  window.viewHomeGo = viewHome;
  if (n >= 4) {
    document.getElementById("gnSpeed").onclick = startSpeed;
    document.getElementById("gnMatch").onclick = startMatch;
    document.getElementById("gnSpell").onclick = startSpell;
    document.getElementById("gnSnake").onclick = buySnakeTicket;
    const snakeAgain = document.getElementById("gnSnakeAgain");
    if (snakeAgain) snakeAgain.onclick = reopenSnakeGame;
  }
}

/* ── 게임 1: ⚡ 스피드 퀴즈 (제한 시간 안에 최대한 많이) ── */
const gSpeed = { qs: [], idx: 0, score: 0, left: 0, over: false };
// 시간이 남는 동안 계속 낼 수 있도록 오늘 단어를 여러 바퀴 돌려 문제를 미리 만들어 둔다.
function makeSpeedQuestions() {
  const types = ["m", "w", "b", "m", "w", "s"];
  const qs = [];
  for (let round = 0; round < 4; round++) {
    shuffle(S.words).forEach((w, i) => {
      const q = makeQuestion(w, S.words, types[(round + i) % types.length]);
      if (q) qs.push(q);
    });
  }
  return qs;
}
function startSpeed() {
  if (S.words.length < 4) return toast("게임할 단어가 부족해요.");
  clearGameTimer();
  gSpeed.qs = makeSpeedQuestions();
  if (!gSpeed.qs.length) return toast("문제를 만들 단어가 부족해요.");
  gSpeed.idx = 0; gSpeed.score = 0; gSpeed.left = GAME_SPEED_SEC; gSpeed.over = false;
  render(\`
    \${topbar("⚡ 스피드 퀴즈", "viewGamesGo")}
    <div class="game-hud">
      <div class="pill time" id="gTime">⏱ \${GAME_SPEED_SEC}초</div>
      <div class="pill score" id="gScore">⭐ 0개</div>
    </div>
    <div class="card" id="gStage"></div>
  \`);
  window.viewGamesGo = viewGames;
  speedStage();
  gameTimer = setInterval(() => {
    const el = document.getElementById("gTime");
    if (!el) return clearGameTimer();          // 화면을 벗어났으면 타이머도 멈춘다
    gSpeed.left--;
    el.textContent = "⏱ " + Math.max(0, gSpeed.left) + "초";
    if (gSpeed.left <= 10) el.classList.add("hurry");
    if (gSpeed.left <= 0) { clearGameTimer(); finishSpeed(); }
  }, 1000);
}
function speedStage() {
  const st = document.getElementById("gStage");
  if (!st || gSpeed.over) return;
  const q = gSpeed.qs[gSpeed.idx];
  st.innerHTML = \`
    <div class="q-text">\${esc(q.text)}</div>
    \${q.sub ? \`<div class="q-sub" style="font-size:16px;color:#4d5e78;background:var(--bg);border-radius:10px;padding:10px 13px">\${esc(q.sub)}</div>\` : ""}
    <div style="margin-top:12px">\${q.choices.map(c => \`<button class="choice" data-v="\${esc(c)}">\${esc(c)}</button>\`).join("")}</div>
    <div class="game-flash" id="gFlash"></div>\`;
  let answered = false;
  st.querySelectorAll(".choice").forEach(btn => btn.onclick = () => {
    if (answered || gSpeed.over) return;
    answered = true;
    const isCorrect = btn.dataset.v === q.answer;
    st.querySelectorAll(".choice").forEach(x => {
      x.disabled = true;
      if (x.dataset.v === q.answer) x.classList.add("correct");
      else if (x === btn) x.classList.add("wrong");
    });
    const flash = document.getElementById("gFlash");
    if (isCorrect) {
      gSpeed.score++;
      const sc = document.getElementById("gScore");
      if (sc) sc.textContent = "⭐ " + gSpeed.score + "개";
      if (flash) { flash.className = "game-flash good"; flash.textContent = "🎯 좋아요!"; }
    } else {
      addWrong(q.word);                        // 게임에서 틀린 단어도 오답 노트로 보낸다
      if (flash) { flash.className = "game-flash bad"; flash.textContent = "정답: " + q.answer; }
    }
    setTimeout(() => {
      if (gSpeed.over) return;
      gSpeed.idx++;
      if (gSpeed.idx >= gSpeed.qs.length) return finishSpeed();
      speedStage();
    }, isCorrect ? 330 : 1100);
  });
}
function finishSpeed() {
  if (gSpeed.over) return;
  gSpeed.over = true;
  clearGameTimer();
  const best = gameBest().speed | 0;
  const newBest = gSpeed.score > best;
  const coin = finishGame("speed", gSpeed.score, newBest);
  gameResult({
    title: "⚡ 스피드 퀴즈",
    emoji: gSpeed.score >= 15 ? "🏆" : gSpeed.score >= 8 ? "😃" : "💪",
    score: gSpeed.score + "개",
    msg: GAME_SPEED_SEC + "초 동안 " + gSpeed.score + "개를 맞혔어요" + (newBest ? "" : " (최고 기록 " + best + "개)"),
    newBest, coin,
    again: startSpeed,
  });
}

/* ── 게임 2: 🃏 짝 맞추기 (단어 카드 ↔ 뜻 카드) ── */
const gMatch = { cards: [], open: [], done: 0, tries: 0, sec: 0, over: false };
function startMatch() {
  const pairs = Math.min(GAME_MATCH_PAIRS, S.words.length);
  if (pairs < 3) return toast("게임할 단어가 부족해요.");
  clearGameTimer();
  const picks = shuffle(S.words).slice(0, pairs);
  const cards = [];
  picks.forEach((w, i) => {
    cards.push({ id: i, kind: "w", text: w.word, w });
    cards.push({ id: i, kind: "m", text: w.meaning, w });
  });
  gMatch.cards = shuffle(cards);
  gMatch.open = []; gMatch.done = 0; gMatch.tries = 0; gMatch.sec = 0; gMatch.over = false;
  render(\`
    \${topbar("🃏 짝 맞추기", "viewGamesGo")}
    <div class="game-hud">
      <div class="pill time" id="gTime">⏱ 0초</div>
      <div class="pill score" id="gScore">✅ 0/\${pairs}</div>
    </div>
    <div class="sub" style="margin:0 2px 10px">카드를 눌러 <b>단어</b>와 <b>뜻</b>을 짝지어 주세요.</div>
    <div class="match-grid">\${gMatch.cards.map((c, i) => \`<button class="match-card" data-i="\${i}"></button>\`).join("")}</div>
  \`);
  window.viewGamesGo = viewGames;
  document.querySelectorAll(".match-card").forEach(btn => btn.onclick = () => matchTap(Number(btn.dataset.i)));
  gameTimer = setInterval(() => {
    const el = document.getElementById("gTime");
    if (!el) return clearGameTimer();
    gMatch.sec++;
    el.textContent = "⏱ " + gMatch.sec + "초";
  }, 1000);
}
function matchCardEl(i) { return document.querySelector('.match-card[data-i="' + i + '"]'); }
function matchTap(i) {
  if (gMatch.over || gMatch.open.length >= 2) return;   // 두 장을 판정하는 중에는 못 누른다
  const el = matchCardEl(i);
  if (!el || el.classList.contains("gone") || el.classList.contains("open")) return;
  el.classList.add("open");
  el.textContent = gMatch.cards[i].text;                // 뒤집을 때 비로소 글자를 넣는다(미리 보기 방지)
  gMatch.open.push(i);
  if (gMatch.open.length < 2) return;
  gMatch.tries++;
  const [a, b] = gMatch.open;
  const ca = gMatch.cards[a], cb = gMatch.cards[b];
  if (ca.id === cb.id && ca.kind !== cb.kind) {
    [a, b].forEach(k => { const e = matchCardEl(k); if (e) { e.classList.remove("open"); e.classList.add("gone"); } });
    gMatch.open = [];
    gMatch.done++;
    speak(ca.w.word);                                   // 짝을 찾으면 단어를 읽어 준다
    const sc = document.getElementById("gScore");
    if (sc) sc.textContent = "✅ " + gMatch.done + "/" + (gMatch.cards.length / 2);
    if (gMatch.done >= gMatch.cards.length / 2) finishMatch();
  } else {
    [a, b].forEach(k => { const e = matchCardEl(k); if (e) e.classList.add("miss"); });
    setTimeout(() => {
      [a, b].forEach(k => { const e = matchCardEl(k); if (e) { e.classList.remove("open", "miss"); e.textContent = ""; } });
      gMatch.open = [];
    }, 750);
  }
}
function finishMatch() {
  if (gMatch.over) return;
  gMatch.over = true;
  clearGameTimer();
  const best = gameBest().match | 0;
  const newBest = !best || gMatch.sec < best;           // 짝 맞추기는 시간이 짧을수록 좋은 기록
  const coin = finishGame("match", gMatch.sec, newBest);
  const pairs = gMatch.cards.length / 2;
  gameResult({
    title: "🃏 짝 맞추기",
    emoji: gMatch.tries <= pairs + 2 ? "🏆" : "🎉",
    score: gMatch.sec + "초",
    msg: "카드를 " + gMatch.tries + "번 뒤집어 " + pairs + "쌍을 모두 찾았어요" + (!best || newBest ? "" : " (최고 기록 " + best + "초)"),
    newBest, coin,
    again: startMatch,
  });
}

/* ── 게임 3: 🔤 철자 완성 (뜻을 보고 알파벳 순서 맞히기) ── */
const gSpell = { list: [], idx: 0, score: 0, picked: [] };
// 알파벳으로만 된 낱말만 고른다(띄어쓰기가 든 표현은 철자 게임에 맞지 않음).
function spellTargets() {
  return S.words.filter(w => /^[A-Za-z][A-Za-z'-]{1,11}$/.test(String(w.word || "").trim()));
}
function startSpell() {
  const pool = spellTargets();
  if (pool.length < 3) return toast("철자 게임에 쓸 만한 단어가 부족해요.");
  clearGameTimer();
  gSpell.list = shuffle(pool).slice(0, GAME_SPELL_COUNT);
  gSpell.idx = 0; gSpell.score = 0;
  viewSpellQ();
}
function viewSpellQ() {
  const w = gSpell.list[gSpell.idx];
  const letters = shuffle(w.word.split(""));
  gSpell.picked = [];
  render(\`
    \${topbar("🔤 철자 완성", "viewGamesGo")}
    <div class="game-hud">
      <div class="pill">\${gSpell.idx + 1} / \${gSpell.list.length}</div>
      <div class="pill score" id="gScore">⭐ \${gSpell.score}개</div>
    </div>
    <div class="card">
      <div class="q-text" style="text-align:center">\${esc(w.meaning)}</div>
      \${w.pronunciation ? \`<div class="sub" style="text-align:center">[\${esc(w.pronunciation)}]</div>\` : ""}
      <div class="spell-word" id="gSlots">\${w.word.split("").map((c, i) => \`<span class="spell-slot" data-s="\${i}"></span>\`).join("")}</div>
      <div class="letter-row" id="gLetters">\${letters.map((ch, i) => \`<button class="letter-btn" data-i="\${i}">\${esc(ch)}</button>\`).join("")}</div>
      <div class="game-flash" id="gFlash"></div>
      <div class="row" style="margin-top:14px">
        <button class="btn ghost grow" id="btnUndo">← 지우기</button>
        <button class="btn gray grow" id="btnGiveUp">모르겠어요</button>
      </div>
    </div>
  \`);
  window.viewGamesGo = viewGames;
  document.querySelectorAll(".letter-btn").forEach(btn => btn.onclick = () => spellPick(Number(btn.dataset.i), btn.textContent));
  document.getElementById("btnUndo").onclick = spellUndo;
  document.getElementById("btnGiveUp").onclick = () => spellJudge(true);
}
function spellSlots() { return document.querySelectorAll(".spell-slot"); }
function spellPick(i, ch) {
  const w = gSpell.list[gSpell.idx];
  if (gSpell.picked.length >= w.word.length) return;
  const btn = document.querySelector('.letter-btn[data-i="' + i + '"]');
  if (!btn || btn.disabled) return;
  btn.disabled = true; btn.classList.add("used");
  gSpell.picked.push({ i, ch });
  const slot = spellSlots()[gSpell.picked.length - 1];
  if (slot) { slot.textContent = ch; slot.classList.add("filled"); }
  if (gSpell.picked.length === w.word.length) spellJudge(false);
}
function spellUndo() {
  const last = gSpell.picked.pop();
  if (!last) return;
  const btn = document.querySelector('.letter-btn[data-i="' + last.i + '"]');
  if (btn) { btn.disabled = false; btn.classList.remove("used"); }
  const slot = spellSlots()[gSpell.picked.length];
  if (slot) { slot.textContent = ""; slot.classList.remove("filled"); }
}
function spellJudge(gaveUp) {
  const w = gSpell.list[gSpell.idx];
  const typed = gSpell.picked.map(p => p.ch).join("");
  const isCorrect = !gaveUp && typed === w.word;
  document.querySelectorAll(".letter-btn").forEach(b => b.disabled = true);
  document.getElementById("btnUndo").disabled = true;
  document.getElementById("btnGiveUp").disabled = true;
  spellSlots().forEach((s, i) => {
    s.textContent = w.word[i];
    s.classList.remove("filled");
    s.classList.add(isCorrect ? "ok" : "no");
  });
  const flash = document.getElementById("gFlash");
  if (isCorrect) {
    gSpell.score++;
    const sc = document.getElementById("gScore");
    if (sc) sc.textContent = "⭐ " + gSpell.score + "개";
    if (flash) { flash.className = "game-flash good"; flash.textContent = "🎯 정답! " + w.word; }
  } else {
    addWrong(w);
    if (flash) { flash.className = "game-flash bad"; flash.textContent = "아쉬워요! 정답: " + w.word; }
  }
  speak(w.word);
  setTimeout(() => {
    gSpell.idx++;
    if (gSpell.idx < gSpell.list.length) viewSpellQ();
    else finishSpell();
  }, isCorrect ? 1000 : 1700);
}
function finishSpell() {
  const best = gameBest().spell | 0;
  const newBest = gSpell.score > best;
  const coin = finishGame("spell", gSpell.score, newBest);
  gameResult({
    title: "🔤 철자 완성",
    emoji: gSpell.score === gSpell.list.length ? "🏆" : gSpell.score >= gSpell.list.length / 2 ? "😃" : "💪",
    score: gSpell.score + " / " + gSpell.list.length,
    msg: gSpell.list.length + "문제 중 " + gSpell.score + "개를 맞혔어요" + (newBest ? "" : " (최고 기록 " + best + "개)"),
    newBest, coin,
    again: startSpell,
  });
}

/* ── 나의 기록 ── */
function viewStats() {
  const days = [];
  let d = S.realToday;
  for (let i = 0; i < 14; i++) { days.unshift(d); d = yesterdayOf(d); }
  const todayDone = !!(S.data.days[S.realToday] && S.data.days[S.realToday].done);
  render(\`
    \${topbar("📊 나의 기록", "viewHomeGo")}
    <div class="card" style="text-align:center">
      <div class="sub">\${esc(S.realToday)}</div>
      <div style="font-size:21px;font-weight:900;margin-top:4px">\${todayDone ? "오늘 학습 완료! 🎉" : "오늘 학습 진행 중"}</div>
    </div>
    <div class="card">
      <div class="row">
        <div class="grow">
          <div class="sub">별명</div>
          <div id="nickView" style="font-size:18px;font-weight:800;margin-top:2px">\${esc(S.data.nickname)}</div>
        </div>
        <button class="btn ghost" id="btnEditNick" style="padding:9px 14px;font-size:13.5px">✏️ 별명 바꾸기</button>
      </div>
      <div id="nickEdit" class="hidden row" style="margin-top:10px">
        <input id="inNewNick" class="field grow" maxlength="12" value="\${esc(S.data.nickname)}">
        <button class="btn" id="btnSaveNick" style="padding:12px 16px">저장</button>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="v">🔥\${S.data.streak | 0}</div><div class="k">연속 학습일</div></div>
      <div class="stat-box"><div class="v">\${S.data.totalLearned | 0}</div><div class="k">누적 학습 단어</div></div>
      <div class="stat-box"><div class="v">\${S.data.wrong.length}</div><div class="k">오답 노트</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="sub" style="margin-bottom:8px">하루 목표</div>
      <div class="goal-row">\${DAILY_GOALS.map(n => \`<button class="goal-btn \${n === S.data.dailyGoal ? "on" : ""}" data-g="\${n}">\${n}개</button>\`).join("")}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="row">
        <div class="grow">
          <div class="sub">나의 단계</div>
          <div style="font-size:18px;font-weight:800;margin-top:2px">\${SEC_ICON[S.login.section] || "📖"} \${esc(secName(S.login.section))}</div>
        </div>
        <button class="btn ghost" id="btnEditSection" style="padding:9px 14px;font-size:13.5px">🔁 단계 바꾸기</button>
      </div>
      <div id="sectionEdit" class="hidden" style="margin-top:12px">
        <div class="sub" style="margin-bottom:8px">단계를 바꿔도 코인·스티커·연속 학습일 등 지금까지 모은 것은 그대로 남아요.</div>
        <div class="menu-grid">\${S.sections.filter(function(s){return s.key!==S.login.section;}).map(function(s){
          return '<button class="sec-btn" data-newsec="' + s.key + '"><span class="ico">' + (SEC_ICON[s.key]||"📖") + '</span><span><span class="nm">' + esc(s.name) + '</span></span></button>';
        }).join("")}</div>
      </div>
    </div>
    <div class="card" style="margin-top:14px;text-align:center">
      <div class="sub">나만의 코드</div>
      <div style="font-size:26px;font-weight:900;letter-spacing:4px;margin-top:4px">\${esc(S.data.code || "------")}</div>
      <div class="sub" style="margin-top:6px">다른 기기(태블릿·휴대폰)의 첫 화면 "다른 기기에서 이어하기"에 이 코드를 넣으면 이어서 공부할 수 있어요. 부모님도 이 코드로 학습 현황을 볼 수 있어요.</div>
    </div>
    <div class="card" style="margin-top:14px">
      <b>최근 2주 학습</b>
      <div class="day-grid">
        \${days.map(day => {
          const rec = S.data.days[day];
          const done = rec && rec.done;
          return \`<div class="day-cell \${done ? "done" : ""}"><span>\${day.slice(8)}</span>\${done ? "✓" : ""}</div>\`;
        }).join("")}
      </div>
    </div>
  \`);
  window.viewHomeGo = viewHome;
  document.querySelectorAll(".goal-btn").forEach(b => b.onclick = async () => {
    const n = Number(b.dataset.g);
    if (n === S.data.dailyGoal) return;
    S.data.dailyGoal = n;
    applyWords(S.fullWords);
    await saveStudent();
    toast("하루 목표를 " + n + "개로 바꿨어요.");
    viewStats();
  });
  document.getElementById("btnEditNick").onclick = () => {
    document.getElementById("nickEdit").classList.remove("hidden");
    document.getElementById("inNewNick").focus();
  };
  document.getElementById("btnSaveNick").onclick = async () => {
    const nickname = document.getElementById("inNewNick").value.trim();
    if (!nickname) return toast("별명을 입력해 주세요.");
    const btn = document.getElementById("btnSaveNick");
    btn.disabled = true;
    const r = await api("/api/student/rename", { section: S.login.section, id: S.login.id, nickname });
    if (!r.ok) { btn.disabled = false; return toast(r.error); }
    S.data.nickname = r.data.nickname;
    S.login.nickname = r.data.nickname;
    localStorage.setItem(LS_LOGIN, JSON.stringify(S.login));
    toast("별명을 바꿨어요.");
    viewStats();
  };
  document.getElementById("btnEditSection").onclick = () => {
    document.getElementById("sectionEdit").classList.toggle("hidden");
  };
  document.querySelectorAll("[data-newsec]").forEach(b => b.onclick = () => changeSection(b.dataset.newsec));
}
// 단계 다시 선택 — 코인·스티커·연속 학습일 등은 그대로 새 단계로 옮겨진다(서버가 처리).
async function changeSection(newSection) {
  const name = secName(newSection);
  if (!confirm("'" + name + "' 단계로 옮길까요? 코인·스티커·기록은 그대로 유지돼요.")) return;
  const r = await api("/api/student/changeSection", { section: S.login.section, id: S.login.id, newSection });
  if (!r.ok) return toast(r.error);
  S.login.section = r.section;
  localStorage.setItem(LS_LOGIN, JSON.stringify(S.login));
  S.data = r.data;
  toast("'" + r.sectionName + "' 단계로 옮겼어요.");
  await loadTodayThenHome();
}

/* ═══════════════ 시작 ═══════════════ */
async function boot() {
  const info = await api("/api/info", {});
  if (info.ok) { S.appName = info.appName; S.sections = info.sections; }
  else S.sections = [{ key: "g1", name: "1학년" }, { key: "g2", name: "2학년" }, { key: "g3", name: "3학년" }, { key: "g4", name: "4학년" }, { key: "g5", name: "5학년" }, { key: "g6", name: "6학년" }, { key: "middle", name: "중등" }, { key: "high", name: "고등" }, { key: "adult", name: "성인" }, { key: "teacher", name: "교실영어(교사)" }];
  document.title = S.appName;

  const saved = JSON.parse(localStorage.getItem(LS_LOGIN) || "null");
  if (saved && saved.section && saved.id) {
    const r = await api("/api/student/join", saved);
    if (r.ok) {
      S.login = Object.assign({}, saved, { nickname: r.data.nickname });
      localStorage.setItem(LS_LOGIN, JSON.stringify(S.login));
      S.data = r.data; S.today = r.today;
      return loadTodayThenHome();
    }
  }
  viewStart();
}
boot();

// 화면을 벗어날 때(탭 전환 등) 진행 상황 저장
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && S.login && S.data) {
    try { navigator.sendBeacon && navigator.sendBeacon("/api/student/save", new Blob([JSON.stringify(Object.assign({}, S.login, { data: S.data }))], { type: "application/json" })); } catch (e) {}
  }
});
</script>
</body>
</html>
`;

// ── 레벨(섹션) 정의 — 영단어 난이도 기준 ──
const SECTIONS = {
  g1: {
    name: "1학년",
    desc: "초등학교 1학년 수준의 아주 쉬운 생활 영단어. 알파벳과 함께 배우는 색깔, 숫자(1~10), 동물, 가족 호칭, 인사말처럼 그림으로 바로 떠올릴 수 있는 단어 위주. 철자 3~5자의 짧고 발음하기 쉬운 단어만 쓴다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 2학년 수준의 살짝 어려운 단어를 섞는다.",
  },
  g2: {
    name: "2학년",
    desc: "초등학교 2학년 수준의 쉬운 생활 영단어. 1학년보다 조금 넓혀 학용품, 음식, 몸의 부분, 요일, 기본 동작 동사(가다·먹다·보다 등)를 포함한다. 여전히 짧고 쉬운 단어 위주. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 3학년 수준의 단어를 섞는다.",
  },
  g3: {
    name: "3학년",
    desc: "초등학교 3학년 정규 영어 교과가 시작되는 수준. 인사·자기소개·교실 표현에 나오는 기본 명사·동사·형용사, 3~6자의 쉬운 단어 위주. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 4학년 수준의 단어를 섞는다.",
  },
  g4: {
    name: "4학년",
    desc: "초등학교 4학년 교과서 수준. 취미, 날씨, 시간, 장소를 나타내는 어휘와 기본 형용사·부사를 포함해 3학년보다 폭을 넓힌다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 5학년 수준의 단어를 섞는다.",
  },
  g5: {
    name: "5학년",
    desc: "초등학교 5학년 교과서 수준. 계획·경험·감정을 표현하는 데 쓰이는 동사·형용사와 조금 더 추상적인 생활 어휘를 포함한다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 6학년 수준의 단어를 섞는다.",
  },
  g6: {
    name: "6학년",
    desc: "초등학교 6학년이 배우는 기초 영단어. 교육부 권장 초등 필수 영단어 위주, 실생활에서 자주 쓰는 쉬운 명사·동사·형용사 중심(가족, 학교, 음식, 취미, 감정, 날씨 등). 철자와 발음이 어렵지 않은 단어. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 한 단계 위인 중학교 초반 수준의 약간 어려운 단어를 섞어 도전 의식을 준다.",
  },
  middle: {
    name: "중등",
    desc: "중학교 교과서와 내신·모의고사에 자주 나오는 영단어. 중학 필수 영단어 위주, 교과서 지문에 반복적으로 등장하는 단어와 기본적인 숙어 표현 포함. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 초등 고학년 복습 수준의 쉬운 단어와 고등학교 입문 수준의 어려운 단어를 함께 섞어 난이도 폭을 넓힌다.",
  },
  high: {
    name: "고등",
    desc: "고등학교 교과서와 수능·모의고사 영어 지문에 자주 나오는 영단어. 수능 필수 영단어 위주, 추상적 개념어와 시사·학술 어휘 포함. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 중학교 심화 수준의 비교적 쉬운 단어를 섞어 난이도 폭을 넓힌다.",
  },
  adult: {
    name: "성인",
    audience: "성인 학습자",
    desc: "성인 학습자를 위한 실용·비즈니스 영어 어휘. 직장, 회의, 이메일, 여행, 금융, 뉴스, 사회·문화, 자기계발 등 실제 성인 생활에서 자주 접하는 단어를 중심으로 한다. CEFR B1~C1 범위를 기본으로 하되 너무 전문적인 전공용어는 피하고, 업무와 일상에서 바로 활용할 수 있는 표현을 우선한다. 명사·동사·형용사·부사를 고르게 섞고, 같은 단어라도 실제 문맥에서 쓰이는 자연스러운 예문을 제공한다.",
  },
  // 학교에서 수업·학급운영에 바로 쓰는 '교실영어' 성인 모드(선생님용).
  // 예문(example)이 곧 교실에서 그대로 말할 수 있는 표현이 되도록 지시한다.
  teacher: {
    name: "교실영어(교사)",
    audience: "학교에서 영어로 수업하는 선생님",
    desc: "교사가 학교 수업과 학급 운영에서 실제로 쓰는 교실영어(Classroom English) 어휘. 수업 시작·마무리 인사, 출석과 날짜 확인, 지시하기(줄 서기·자리 정리·조용히 하기·차례 지키기), 활동 안내(짝 활동·모둠·발표·역할놀이·게임·학습지), 칭찬과 격려, 주의 주기와 규칙 안내, 준비물·과제·평가 안내, 안전 지도와 이동 수업, 학교 행사(현장학습·학예회·상담주간), 학부모 상담과 교직 업무(생활기록·회의·통지표)에서 자주 쓰이는 단어를 중심으로 한다. CEFR A2~B2 범위의 실용 어휘로, 선생님이 수업 중 바로 입 밖으로 낼 수 있는 쉬운 단어를 우선하고 교육학 전문용어나 시험용 추상 어휘는 피한다. example 예문은 반드시 선생님이 교실에서 학생에게 말하듯 쓴 완전한 문장(그대로 따라 쓸 수 있는 교실영어 표현)으로 만든다. 예: \"Please line up quietly at the door.\", \"Take out your workbook and turn to page ten.\"",
  },
};
const WORDS_PER_DAY = 20; // 하루에 AI가 만드는 개수(반 공유 최대치) — 학생은 이 중 몇 개(10/15/20) 할지 스스로 고름
const DAILY_GOALS = [10, 15, 20]; // 학생이 고를 수 있는 하루 목표
const DEFAULT_DAILY_GOAL = 20;
const APP_NAME = "매일 영단어";

// ── 한국 시간 (Worker 는 UTC 로 돌므로 반드시 서울 기준으로 변환) ──
function kst() {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
  return { date: s.slice(0, 10), time: s.slice(11, 16), datetime: s };
}

// ── 공통 도우미 ──
function fail(msg, status = 400) { return { status, body: { ok: false, error: msg } }; }
function ok(obj) { return { status: 200, body: Object.assign({ ok: true }, obj) }; }

function validSection(sec) { return Object.prototype.hasOwnProperty.call(SECTIONS, sec); }
function cleanNickname(n) { return String(n || "").trim().slice(0, 12); }
function validId(id) { const s = String(id || "").trim(); return s.length >= 8 && s.length <= 64 ? s : null; }
// 요청받은 날짜가 유효한 형식이고 허용 범위(과거 60일 ~ 앞으로 6일) 안인지 확인.
// 앞으로 며칠 미리 볼 수 있게 해 주되, 아무 날짜나 마구 생성하지 못하게 막는다.
function validDay(day) {
  if (!day) return null;
  const s = String(day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const today = kst().date;
  const min = new Date(today + "T12:00:00+09:00"); min.setDate(min.getDate() - 60);
  const max = new Date(today + "T12:00:00+09:00"); max.setDate(max.getDate() + 6);
  const d = new Date(s + "T12:00:00+09:00");
  if (isNaN(d.getTime()) || d < min || d > max) return null;
  return s;
}

// 단어 목록 정리: 필수 필드 확인 + 중복 제거
function sanitizeWords(list, max) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const w of list) {
    if (!w) continue;
    const word = String(w.word || "").trim().slice(0, 30);
    const meaning = String(w.meaning || "").trim().slice(0, 200);
    if (!word || !meaning || seen.has(word)) continue;
    seen.add(word);
    out.push({
      word,
      pronunciation: String(w.pronunciation || "").trim().slice(0, 60),
      meaning,
      example: String(w.example || "").trim().slice(0, 200),
      synonym: String(w.synonym || "").trim().slice(0, 30),
      antonym: String(w.antonym || "").trim().slice(0, 30),
    });
    if (out.length >= max) break;
  }
  return out;
}


// ── 스티커북 ──
const STICKER_PACK_PRICE = 80;      // 랜덤팩(코인) 가격 — 3장
const STICKER_DUP_MILEAGE = 40;     // 중복이 나오면 코인 대신 '마일리지'로만 보상
const STICKER_DRAW_COST = 100;      // 마일리지로 랜덤 1장 뽑기
const STICKER_DRAW_DUP_BACK = 30;   // 마일리지 뽑기에서 중복이면 마일리지 일부 환급
const STICKER_PAGE_REWARD = 500;    // 한 페이지(12장) 완성 보상(코인)
const STICKER_TICKET_NEED = 10;     // 같은 스티커를 이만큼 모으면 '골드티켓' 1장으로 교환 가능
const STICKER_TICKET_KEEP = 1;      // 교환 뒤 도감에 남겨 두는 장수(도감에서 사라지지 않도록)
const REVIEW_REWARD = 30;           // '오늘 복습'을 끝내면 주는 코인(하루 1번)
const GAME_REWARD = 20;             // '단어 게임'을 한 판 끝내면 주는 코인(하루 1번)
const SNAKE_TICKET_PRICE = 50;      // 뱀 대격돌 입장권 1장 값(코인)
const SNAKE_TICKET_PLAYS = 3;       // 입장권 1장으로 할 수 있는 판 수
// 스티커 가격: 도감에서 뒤로 갈수록(카테고리 내 위치가 뒤일수록) 비싸진다.
function stickerPriceByPos(pos){ return 60 + pos * 20; }   // 1~12번 → 60,80,…,280
// 뽑기 확률 가중치: 비쌀수록(뒤 번호) 낮게 → 희귀
function stickerWeight(price){ return Math.max(20, 300 - price); }
// 가격 가중치로 스티커 1장 뽑기
function pickWeightedSticker(){
  let total = 0; for (const s of SERVER_STICKERS) total += stickerWeight(s.price);
  let r = Math.random() * total;
  for (const s of SERVER_STICKERS){ r -= stickerWeight(s.price); if (r <= 0) return s; }
  return SERVER_STICKERS[SERVER_STICKERS.length - 1];
}
// ✏️ 스티커를 실제 구매/뽑기 서버에 추가할 때도 같은 항목을 아래 배열에 추가하세요.
// 클라이언트 STICKER_CATALOG와 SERVER_STICKERS의 목록을 동일하게 유지해야 합니다.
const SERVER_STICKERS = [
  ["animal","강아지","🐶"],["animal","고양이","🐱"],["animal","토끼","🐰"],["animal","다람쥐","🐿️"],["animal","곰","🐻"],["animal","판다","🐼"],["animal","사자","🦁"],["animal","코끼리","🐘"],["animal","코알라","🐨"],["animal","원숭이","🐵"],["animal","펭귄","🐧"],["animal","호랑이","🐯"],
  ["dinosaur","티라노사우루스","🦖"],["dinosaur","트리케라톱스","🦕"],["dinosaur","브라키오사우루스","🦕"],["dinosaur","스테고사우루스","🦕"],["dinosaur","벨로시랩터","🦖"],["dinosaur","안킬로사우루스","🦕"],["dinosaur","스피노사우루스","🦖"],["dinosaur","파키케팔로사우루스","🦕"],["dinosaur","이구아노돈","🦕"],["dinosaur","프로토케라톱스","🦕"],["dinosaur","파라사우롤로푸스","🦕"],["dinosaur","알로사우루스","🦖"],
  ["ocean","고래","🐋"],["ocean","돌고래","🐬"],["ocean","문어","🐙"],["ocean","상어","🦈"],["ocean","거북이","🐢"],["ocean","해파리","🪼"],["ocean","가오리","🐟"],["ocean","복어","🐡"],["ocean","새우","🦐"],["ocean","꽃게","🦀"],["ocean","불가사리","⭐"],["ocean","물고기","🐠"]
].map((x,i)=>({sticker_id:x[0]+"_"+String(i%12+1).padStart(2,"0"),category:x[0],name:x[1],emoji:x[2],image_url:"/assets/stickers/"+x[0]+"_"+String(i%12+1).padStart(2,"0")+".png",price:stickerPriceByPos(i%12)}));
const STICKER_MAP = Object.fromEntries(SERVER_STICKERS.map(x=>[x.sticker_id,x]));
function ensureStickerData(data){
  if(!data || typeof data!=="object") return data;
  data.coins = Number.isFinite(Number(data.coins)) ? Math.max(0,Math.floor(Number(data.coins))) : 300;
  if(!data.stickerBook || typeof data.stickerBook!=="object") data.stickerBook={};
  if(!data.stickerBook.stickers || typeof data.stickerBook.stickers!=="object") data.stickerBook.stickers={};
  if(!data.stickerBook.completedPages || typeof data.stickerBook.completedPages!=="object") data.stickerBook.completedPages={};
  if(!Array.isArray(data.stickerBook.badges)) data.stickerBook.badges=[];
  if(!Number.isFinite(Number(data.stickerBook.mileage))) data.stickerBook.mileage=0;
  data.stickerBook.mileage=Math.max(0,Math.floor(Number(data.stickerBook.mileage)));
  if(!Number.isFinite(Number(data.stickerBook.goldTickets))) data.stickerBook.goldTickets=0;
  data.stickerBook.goldTickets=Math.max(0,Math.floor(Number(data.stickerBook.goldTickets)));
  if(!data.rewardHistory || typeof data.rewardHistory!=="object") data.rewardHistory={};
  return data;
}
function stickerCollected(data,category){ return SERVER_STICKERS.filter(x=>x.category===category).filter(x=>Number(data.stickerBook.stickers[x.sticker_id]||0)>0).length; }
function checkStickerRewards(data){
  const rewards=[];
  for(const cat of ["animal","dinosaur","ocean"]){
    if(stickerCollected(data,cat)>=12 && !data.stickerBook.completedPages[cat]){
      data.stickerBook.completedPages[cat]=true;
      const badge="sticker_page_"+cat;
      if(!data.stickerBook.badges.includes(badge)) data.stickerBook.badges.push(badge);
      data.coins += STICKER_PAGE_REWARD;
      rewards.push({category:cat,reward:STICKER_PAGE_REWARD,badge});
    }
  }
  return rewards;
}
function stickerPayload(data){
  ensureStickerData(data);
  return SERVER_STICKERS.map(x=>Object.assign({},x,{is_unlocked:Number(data.stickerBook.stickers[x.sticker_id]||0)>0,quantity:Number(data.stickerBook.stickers[x.sticker_id]||0)}));
}

// ── 새 학생 데이터 ──
function newStudentData(nickname, dailyGoal) {
  return {
    nickname,
    dailyGoal: DAILY_GOALS.includes(dailyGoal) ? dailyGoal : DEFAULT_DAILY_GOAL, // 하루에 몇 개 할지(10/15/20)
    createdAt: kst().date,
    streak: 0,          // 연속 학습일
    lastDoneDay: "",    // 마지막으로 목표를 다 끝낸 날
    totalLearned: 0,    // 누적 학습 단어 수
    days: {},           // { "2026-07-15": {sets:[..], quiz:{done,correct,total}, done} }
    wrong: [],          // 오답 노트 [{word,pronunciation,meaning,example,synonym,antonym,day,miss,hit}]
    friends: [],        // 함께 공부하는 친구 [{section, id}]
    cheers: [],         // 친구에게 받은 응원 [{fromId, fromNick, day}]
    messages: [],       // 친구에게 받은 쪽지 [{id, fromSection, fromId, fromNick, text, day}]
    coins: 300,
    stickerBook: { stickers: {}, mileage: 0, goldTickets: 0, badges: [], completedPages: {} },
    rewardHistory: {},
  };
}
// 오래된 날짜 기록 정리 (최근 60일만 보관)
function pruneStudent(data) {
  const days = Object.keys(data.days || {}).sort();
  while (days.length > 60) delete data.days[days.shift()];
  if (Array.isArray(data.wrong) && data.wrong.length > 300)
    data.wrong = data.wrong.slice(-300);
  if (Array.isArray(data.cheers) && data.cheers.length > MAX_CHEERS)
    data.cheers = data.cheers.slice(-MAX_CHEERS);
  if (Array.isArray(data.messages) && data.messages.length > MAX_MESSAGES)
    data.messages = data.messages.slice(-MAX_MESSAGES);
  return data;
}

// ── 친구 ──
const MAX_FRIENDS = 30;
const MAX_CHEERS = 100;
const MAX_MESSAGES = 50;      // 쪽지함에 보관하는 최대 개수(꽉 차면 오래된 것부터 지움)
const MSG_MAX_LEN = 60;       // 쪽지 한 통 최대 글자 수
const MSG_DAILY_LIMIT = 5;    // 같은 친구에게 하루에 보낼 수 있는 쪽지 수(도배 방지)
function cleanMessageText(t) { return String(t || "").trim().slice(0, MSG_MAX_LEN); }
function genId() {
  try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}
// 그 날 얼마나 공부했는지 요약 (친구 목록에 보여 줄 값만 추림 — 남의 오답/단어는 보이지 않는다)
function dayStatus(data, day) {
  const t = ((data && data.days) || {})[day] || {};
  const sets = Array.isArray(t.sets) ? t.sets : [];
  return {
    done: !!t.done,
    setsDone: sets.filter(Boolean).length,
    setsTotal: sets.length,
    quizDone: !!(t.quiz && t.quiz.done),
  };
}
function sameStudent(a, b) { return a.section === b.section && a.id === b.id; }

// ── D1 접근 ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS vocab_days (day TEXT NOT NULL, section TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (day, section))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS vocab_students2 (section TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (section, id))").run();
  // 다른 기기 이어하기 / 부모모드 열람용 짧은 코드 → (section, id)
  await db.prepare("CREATE TABLE IF NOT EXISTS vocab_codes (code TEXT PRIMARY KEY, section TEXT NOT NULL, id TEXT NOT NULL)").run();
  schemaReady = true;
}
async function getDaySet(db, day, section) {
  const row = await db.prepare("SELECT data FROM vocab_days WHERE day = ? AND section = ?").bind(day, section).first();
  return row ? JSON.parse(row.data) : null;
}
async function putDaySet(db, day, section, words) {
  const json = JSON.stringify(words);
  try {
    await db.prepare("INSERT INTO vocab_days (day, section, data) VALUES (?, ?, ?)").bind(day, section, json).run();
    return true;
  } catch (e) { return false; } // 이미 있음 (다른 학생이 먼저 생성)
}
async function recentDaySets(db, section, limit) {
  const r = await db.prepare("SELECT day, data FROM vocab_days WHERE section = ? ORDER BY day DESC LIMIT ?").bind(section, limit).all();
  return (r.results || []).map(row => ({ day: row.day, words: JSON.parse(row.data) }));
}
async function getStudent(db, section, id) {
  const row = await db.prepare("SELECT data FROM vocab_students2 WHERE section = ? AND id = ?").bind(section, id).first();
  return row ? ensureStickerData(JSON.parse(row.data)) : null;
}
async function putStudent(db, section, id, data) {
  ensureStickerData(data);
  await db.prepare("INSERT OR REPLACE INTO vocab_students2 (section, id, data) VALUES (?, ?, ?)").bind(section, id, JSON.stringify(pruneStudent(data))).run();
}

// ── 다른 기기 이어하기 / 부모모드 열람용 코드 ──
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I/L 은 뺌
function genCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
// 학생 데이터에 코드가 없으면 새로 만들어 붙여 준다 (기존 학생도 다음 접속 때 자동으로 생김)
async function assignCode(db, section, id, data) {
  if (data.code) return data.code;
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    try {
      await db.prepare("INSERT INTO vocab_codes (code, section, id) VALUES (?, ?, ?)").bind(code, section, id).run();
      data.code = code;
      await putStudent(db, section, id, data);
      return code;
    } catch (e) { /* 코드 겹침 — 다시 시도 */ }
  }
  return null;
}
async function lookupByCode(db, code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(c)) return null;
  const row = await db.prepare("SELECT section, id FROM vocab_codes WHERE code = ?").bind(c).first();
  if (!row) return null;
  const data = await getStudent(db, row.section, row.id);
  if (!data) return null;
  return { section: row.section, id: row.id, data };
}

// ── AI 영단어 생성 (서버가 호출 — 학생이 직접 AI를 호출하지 않음) ──
// Worker 가 Google Gemini API 를 호출해 레벨에 맞는 오늘의 30개를 만들어 D1에 저장.
// 반 전체가 같은 세트를 쓰므로 하루에 레벨당 1번만 호출됩니다.
// flash-lite 계열: 빠르고 저렴하며 무료 한도가 넉넉해 매일 30개 생성에 적합.
// (flash 계열은 무료 요청 한도가 낮아 429 quota 오류가 잘 남)
// "-latest" 별칭이라 새 모델이 나와도 자동으로 최신 stable 로 갱신됨.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const WORD_SCHEMA = {
  type: "OBJECT",
  properties: {
    words: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING", description: "영단어 원형(기본형)" },
          pronunciation: { type: "STRING", description: "국제음성기호(IPA) 발음. 대괄호 없이 기호만. 예: bəˈnænə" },
          meaning: { type: "STRING", description: "학생 눈높이의 한글 뜻풀이(간결하게)" },
          example: { type: "STRING", description: "단어가 원형 그대로 들어간 자연스러운 영어 예문 한 문장" },
          synonym: { type: "STRING", description: "영어 유의어 1개, 없으면 빈 문자열" },
          antonym: { type: "STRING", description: "영어 반의어 1개, 없으면 빈 문자열" },
        },
        required: ["word", "pronunciation", "meaning", "example", "synonym", "antonym"],
      },
    },
  },
  required: ["words"],
};

// ── Gemini 호출 경로 ──
// 한국 통신망 일부는 Cloudflare 홍콩(HKG) 데이터센터로 붙는다. 그러면 Worker→Google 요청이
// 홍콩에서 나가고, Gemini 가 "User location is not supported" (400) 로 막아 버린다.
// AI Gateway 를 경유해도 게이트웨이 역시 같은 데이터센터에서 나가기 때문에 이 문제는 남는다.
// 확실한 방법은 '허용 지역에 고정된 Durable Object' 를 한 번 거쳐 나가는 것이다.
// (Durable Object 는 만들어질 때 정해진 지역에 계속 머물고, 그 안에서 부른 fetch 도 그 지역에서 나간다.)
const AI_PROXY_REGION = "enam";   // 북미 동부. wnam(북미 서부)·weur(서유럽) 로 바꿔도 된다.

// AI_PROXY 바인딩이 붙어 있을 때만 쓰이는, Gemini 호출 전용 중계 객체.
// 바깥으로 열려 있지 않고(라우트 없음) 이 Worker 만 바인딩으로 부를 수 있다.
export class AIProxy {
  constructor(state, env) { this.env = env; }
  async fetch(request) {
    let call;
    try { call = await request.json(); } catch (e) { call = null; }
    if (!call || !call.endpoint) return new Response(JSON.stringify({ error: { message: "중계 요청이 잘못됐어요." } }), { status: 400 });
    const res = await fetch(call.endpoint, {
      method: "POST",
      // 키는 부르는 쪽이 같이 넘겨 준다. (이 클래스를 별도 워커에 올린 경우
      //  그 워커에 GEMINI_API_KEY 를 또 넣지 않아도 되게)
      headers: { "Content-Type": "application/json", "x-goog-api-key": call.apiKey || this.env.GEMINI_API_KEY || "" },
      body: JSON.stringify(call.payload),
    });
    return new Response(res.body, { status: res.status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
}
// Gemini 를 한 번 호출한다. AI_PROXY 가 있으면 그 지역에서, 없으면 지금 있는 곳에서.
function geminiFetch(env, endpoint, payload) {
  if (env.AI_PROXY) {
    // 이름을 지역으로 두면, 나중에 지역을 바꿨을 때 새 객체가 그 지역에 새로 만들어진다.
    // (locationHint 는 객체가 처음 만들어질 때만 반영되기 때문)
    const stub = env.AI_PROXY.get(env.AI_PROXY.idFromName(AI_PROXY_REGION), { locationHint: AI_PROXY_REGION });
    return stub.fetch("https://ai-proxy.internal/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, payload, apiKey: env.GEMINI_API_KEY }),
    });
  }
  return fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify(payload),
  });
}

async function generateWords(env, section, avoidWords, cf) {
  if (!env.GEMINI_API_KEY)
    return { error: "AI 키(GEMINI_API_KEY)가 아직 설정되지 않았어요. 선생님께 알려 주세요." };

  const lv = SECTIONS[section];
  const avoid = avoidWords.slice(0, 800).join(", ");
  const who = lv.audience || (lv.name + " 학생");   // 성인·교사 모드는 '학생'이 아니다
  const prompt =
    `대상: ${who} (한국 학습자가 배우는 영어 어휘).\n난이도 기준: ${lv.desc}\n\n` +
    `위 기준에 맞는 영단어를 정확히 ${WORDS_PER_DAY + 4}개 만들어 주세요.\n` +
    `규칙:\n` +
    `- word: 영단어 원형(기본형). 굴절되지 않은 사전 표제어 형태로.\n` +
    `- pronunciation: 국제음성기호(IPA)로 읽는 법. 대괄호나 슬래시 없이 기호만.\n` +
    `- meaning: ${who}이(가) 바로 이해할 한글 뜻(품사 표시 없이 간결하게).\n` +
    `- example: 그 단어가 반드시 원형 그대로(형태를 바꾸지 말고) 한 번 들어간 자연스러운 영어 예문 한 문장. (빈칸 문제로 쓰입니다)\n` +
    `- synonym / antonym: 각각 영단어 1개, 마땅한 것이 없으면 빈 문자열.\n` +
    `- 명사·동사·형용사를 골고루 섞고, 쉬운 것과 어려운 것을 골고루.\n` +
    (avoid ? `- 다음 단어와 겹치면 안 됩니다: ${avoid}\n` : "");

  // ── 호출 주소 결정 ──
  // 한국 통신망 일부가 Cloudflare 무료 플랜에서 홍콩(HKG) 데이터센터로 라우팅되면,
  // Worker→Google 요청이 홍콩에서 나가 Gemini 가 "User location is not supported" 로 막는다.
  // Cloudflare AI Gateway 를 경유하면(Worker→Gateway 는 Cloudflare 내부망)
  // 실제 Google 호출이 Cloudflare 중앙망(허용 지역)에서 나가 이 문제를 우회한다.
  //   설정: Worker → Settings → Variables 에 CF_AIG_ACCOUNT_ID, CF_AIG_GATEWAY 추가.
  const useGateway = env.CF_AIG_ACCOUNT_ID && env.CF_AIG_GATEWAY;
  const endpoint = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_AIG_ACCOUNT_ID}/${env.CF_AIG_GATEWAY}/google-ai-studio/v1beta/models/${GEMINI_MODEL}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  // 그래도 드물게 실패할 수 있어 위치·서버 오류는 몇 번 재시도한다.
  const MAX_TRIES = 3;
  let res, body, lastError;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      res = await geminiFetch(env, endpoint, {
        system_instruction: { parts: [{ text: "당신은 한국 학습자를 위한 영어 어휘 교육 전문가입니다. 요청받은 대상과 수준에 딱 맞는 영단어 목록을 만듭니다." }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: WORD_SCHEMA,
          maxOutputTokens: 8192,
          // ※ thinkingConfig 는 넣지 않는다.
          //    예전엔 속도·비용을 아끼려고 thinkingConfig:{thinkingBudget:0} 을 넣었지만,
          //    "-latest" 별칭이 Gemini 3.x 로 자동 갱신되면서 숫자형 thinkingBudget 이 폐기(→ thinkingLevel)되어
          //    이 필드가 있으면 "400 Request contains an invalid argument" 로 생성이 전부 실패한다.
          //    구조화(responseSchema) 단순 생성이라 기본 설정으로도 충분히 빠르고 저렴하다.
        },
      });
    } catch (e) {
      lastError = "AI 서버에 연결하지 못했어요.";
      continue;
    }
    try { body = await res.json(); } catch (e) { body = null; }
    if (res.ok && body) { lastError = null; break; }
    lastError = "AI 호출 실패 (" + res.status + "): " + (body && body.error && body.error.message ? body.error.message : "알 수 없는 오류");
    // 지역 차단은 몇 번을 다시 걸어도 같은 데이터센터에서 나가므로 재시도가 소용없다.
    // (해결책은 AI_PROXY 바인딩 — 파일 맨 위 설정 7번)
    if (body && body.error && /location/i.test(body.error.message || "")) {
      lastError = env.AI_PROXY
        ? "AI 서버가 지금 지역에서 막혔어요. 선생님께 알려 주세요. (AI_PROXY 지역 확인 필요)"
        : "AI 서버가 이 지역에서는 막혀 있어요. 선생님께 알려 주세요. (설정 7번: AI_PROXY 바인딩)";
      break;
    }
    if (res.status < 500) break;   // 키 오류 등은 바로 반환, 서버 오류(5xx)만 재시도
  }
  if (lastError) {
    const loc = cf ? ` [colo:${cf.colo || "?"} country:${cf.country || "?"} gw:${useGateway ? "on" : "off"} proxy:${env.AI_PROXY ? AI_PROXY_REGION : "off"}]` : "";
    return { error: lastError + " 잠시 후 다시 시도해 주세요." + loc };
  }

  const cand = body.candidates && body.candidates[0];
  if (!cand) {
    const reason = body.promptFeedback && body.promptFeedback.blockReason;
    return { error: reason ? "AI가 이 요청을 만들 수 없다고 했어요. (" + reason + ") 다시 시도해 주세요." : "AI 응답이 비어 있어요. 다시 시도해 주세요." };
  }
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION")
    return { error: "AI가 이 요청을 만들 수 없다고 했어요. 다시 시도해 주세요." };
  if (cand.finishReason === "MAX_TOKENS")
    return { error: "AI 응답이 중간에 잘렸어요. 다시 시도해 주세요." };

  const text = ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("");
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) {
    return { error: "AI 응답을 해석하지 못했어요. 다시 시도해 주세요." };
  }
  const rawWords = Array.isArray(parsed.words) ? parsed.words : [];
  const avoidSet = new Set(avoidWords.map(w => String(w || "").trim().toLowerCase()).filter(Boolean));

  // AI가 최근 단어를 일부 섞어 내더라도 전체 생성 실패로 만들지 않는다.
  // 먼저 최근 단어와 겹치지 않는 것만 고르고, 부족하면 중복이 아닌 새 단어를
  // 추가로 한 번 생성한 뒤 합쳐서 20개를 확보한다.
  const fresh = rawWords.filter(w => {
    const key = String(w && w.word || "").trim().toLowerCase();
    return key && !avoidSet.has(key);
  });
  let words = sanitizeWords(fresh, WORDS_PER_DAY);

  // 모델이 최근 단어를 너무 많이 반복한 경우: 첫 응답의 새 단어는 보존하고
  // 짧은 재요청으로 부족분을 채운다.
  if (words.length < WORDS_PER_DAY - 4) {
    const usedNow = words.map(w => w.word.toLowerCase());
    const extraAvoid = Array.from(new Set(avoidWords.concat(usedNow))).slice(0, 500);
    const retryPrompt =
      `앞서 생성한 단어 중 이미 사용된 단어가 많았습니다.\n` +
      `${WORDS_PER_DAY - words.length + 8}개의 새로운 영단어를 만들어 주세요.\n` +
      `절대로 다음 단어를 다시 사용하지 마세요: ${extraAvoid.join(", ")}\n` +
      `각 항목은 word, pronunciation, meaning, example, synonym, antonym 필드를 가진 객체여야 합니다.\n` +
      `JSON 객체 {"words":[...]}만 반환하세요.`;

    try {
      const retryRes = await geminiFetch(env, endpoint, {
        system_instruction: { parts: [{ text: "당신은 한국 학생을 위한 영어 어휘 교육 전문가입니다. 새로운 영단어만 정확한 JSON 형식으로 만듭니다." }] },
        contents: [{ role: "user", parts: [{ text: retryPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: WORD_SCHEMA,
          maxOutputTokens: 8192,
        },
      });
      const retryBody = await retryRes.json();
      if (retryRes.ok && retryBody && retryBody.candidates && retryBody.candidates[0]) {
        const retryText = ((retryBody.candidates[0].content && retryBody.candidates[0].content.parts) || []).map(p => p.text || "").join("");
        try {
          const retryParsed = JSON.parse(retryText);
          const retryFresh = (Array.isArray(retryParsed.words) ? retryParsed.words : []).filter(w => {
            const key = String(w && w.word || "").trim().toLowerCase();
            return key && !avoidSet.has(key) && !usedNow.includes(key);
          });
          words = sanitizeWords(words.concat(retryFresh), WORDS_PER_DAY);
        } catch (e) {}
      }
    } catch (e) {}
  }

  if (words.length < WORDS_PER_DAY - 4) {
    const rawCount = rawWords.length;
    const overlapCount = rawWords.filter(w => avoidSet.has(String(w && w.word || "").trim().toLowerCase())).length;
    return { error: `AI가 새 단어를 충분히 만들지 못했어요(${words.length}개 확보 / AI 응답 ${rawCount}개 중 최근 단어 ${overlapCount}개 중복). 다시 시도해 주세요.` };
  }
  return { words };
}

// 해당 날짜 세트가 없으면 AI로 만들어 저장하고 돌려줌 (day 를 안 주면 오늘)
async function ensureTodaySet(env, db, section, day, cf) {
  const existing = await getDaySet(db, day, section);
  if (existing) return { day, words: existing };
  // 최근 15일치 단어와 겹치지 않게
  const recent = await recentDaySets(db, section, 15);
  const avoid = [];
  for (const s of recent) for (const w of s.words) avoid.push(w.word);
  const g = await generateWords(env, section, avoid, cf);
  if (g.error) {
    // 동시에 다른 요청이 먼저 만들어 놨을 수도 있으니 한 번 더 확인
    const again = await getDaySet(db, day, section);
    if (again) return { day, words: again };
    return { day, error: g.error };
  }
  const inserted = await putDaySet(db, day, section, g.words);
  if (!inserted) {
    const again = await getDaySet(db, day, section);
    if (again) return { day, words: again };
  }
  return { day, words: g.words };
}

// ── API 라우팅 ──
async function handleApi(env, db, path, d, cf) {
  // ── 앱 기본 정보 (시작 화면용) ──
  if (path === "/api/info") {
    return ok({ appName: APP_NAME, sections: Object.keys(SECTIONS).map(k => ({ key: k, name: SECTIONS[k].name })) });
  }

  // ── 학생: 시작하기 (등록 겸 로그인 — 기기별 id + 별명만, 개인정보 제로) ──
  if (path === "/api/student/join") {
    if (!validSection(d.section)) return fail("반(레벨)을 선택해 주세요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.");
    let data = await getStudent(db, d.section, id);
    if (!data) {
      const nickname = cleanNickname(d.nickname);
      if (!nickname) return fail("별명을 입력해 주세요.");
      data = newStudentData(nickname, Number(d.dailyGoal));
      await putStudent(db, d.section, id, data);
    }
    if (!DAILY_GOALS.includes(data.dailyGoal)) data.dailyGoal = DEFAULT_DAILY_GOAL; // 기존 학생 보정
    await assignCode(db, d.section, id, data); // 기존 학생도 코드가 없으면 이번에 발급
    return ok({ data, dailyGoals: DAILY_GOALS, today: kst().date });
  }

  // ── 학생: 다른 기기에서 코드로 이어하기 ──
  if (path === "/api/student/link") {
    const found = await lookupByCode(db, d.code);
    if (!found) return fail("코드를 찾을 수 없어요. 다시 확인해 주세요.");
    return ok({ section: found.section, id: found.id, data: found.data, today: kst().date });
  }

  // ── 부모/보호자: 코드로 학습 현황 읽기전용 열람 ──
  if (path === "/api/parent/view") {
    const found = await lookupByCode(db, d.code);
    if (!found) return fail("코드를 찾을 수 없어요. 다시 확인해 주세요.");
    return ok({ section: found.section, sectionName: SECTIONS[found.section].name, data: found.data, today: kst().date });
  }

  // ── 뱀 대격돌: 입장권 사기 (코인은 서버가 주인이므로 차감도 서버에서) ──
  // 입장권 = 1회용 토큰 + 판 수. 남은 판을 세는 것은 뱀 게임 쪽(별도 워커)이 맡는다.
  // 토큰을 저장해 두는 이유: 창을 실수로 닫아도 같은 입장권으로 다시 열 수 있게 하려는 것.
  // (이미 다 쓴 토큰은 뱀 게임이 기억하고 있어서 다시 열어도 판이 늘지 않는다)
  if (path === "/api/game/snake-ticket") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db, d.section, id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    if (data.coins < SNAKE_TICKET_PRICE)
      return fail("코인이 " + (SNAKE_TICKET_PRICE - data.coins) + "개 모자라요. 공부하고 다시 와요!");
    data.coins -= SNAKE_TICKET_PRICE;
    data.snakeTicket = { token: genId(), plays: SNAKE_TICKET_PLAYS, day: kst().date };
    await putStudent(db, d.section, id, data);
    return ok({ data, ticket: data.snakeTicket });
  }

  // ── 스티커: 도감 조회 ──
  if (path === "/api/sticker/book") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    return ok({data, stickers: stickerPayload(data)});
  }

  // ── 스티커: 원하는 스티커 1장 구매 ──
  if (path === "/api/sticker/buy") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    const sticker = STICKER_MAP[String(d.stickerId||"")];
    if (!sticker) return fail("존재하지 않는 스티커예요.");
    if (Number(data.stickerBook.stickers[sticker.sticker_id]||0)>0) return fail("이미 가지고 있는 스티커예요.");
    if (data.coins < sticker.price) return fail("코인이 부족해요.");
    data.coins -= sticker.price;
    data.stickerBook.stickers[sticker.sticker_id]=1;
    const pageRewards=checkStickerRewards(data);
    await putStudent(db,d.section,id,data);
    return ok({data,sticker,pageRewards});
  }

  // ── 스티커: 랜덤 팩 3장 (코인) — 중복은 '마일리지'로만 보상 ──
  if (path === "/api/sticker/pack") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    if (data.coins < STICKER_PACK_PRICE) return fail("코인이 부족해요.");
    data.coins -= STICKER_PACK_PRICE;
    const results=[];
    for(let i=0;i<3;i++){
      const sticker=pickWeightedSticker();                 // 비쌀수록 덜 나옴
      const before=Number(data.stickerBook.stickers[sticker.sticker_id]||0);
      data.stickerBook.stickers[sticker.sticker_id]=before+1;
      if(before>0) data.stickerBook.mileage += STICKER_DUP_MILEAGE;   // 중복 → 마일리지만
      results.push({sticker_id:sticker.sticker_id,name:sticker.name,emoji:sticker.emoji,image_url:sticker.image_url,duplicate:before>0,mileage:before>0?STICKER_DUP_MILEAGE:0});
    }
    const pageRewards=checkStickerRewards(data);
    await putStudent(db,d.section,id,data);
    return ok({data,results,pageRewards});
  }

  // ── 스티커: 마일리지로 랜덤 1장 뽑기 ──
  if (path === "/api/sticker/draw") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    if (data.stickerBook.mileage < STICKER_DRAW_COST) return fail("마일리지가 부족해요.");
    data.stickerBook.mileage -= STICKER_DRAW_COST;
    const sticker=pickWeightedSticker();                   // 비쌀수록 덜 나옴
    const before=Number(data.stickerBook.stickers[sticker.sticker_id]||0);
    data.stickerBook.stickers[sticker.sticker_id]=before+1;
    if(before>0) data.stickerBook.mileage += STICKER_DRAW_DUP_BACK;   // 중복이면 일부 환급
    const pageRewards=checkStickerRewards(data);
    await putStudent(db,d.section,id,data);
    return ok({data,result:{sticker_id:sticker.sticker_id,name:sticker.name,emoji:sticker.emoji,image_url:sticker.image_url,duplicate:before>0,mileageBack:before>0?STICKER_DRAW_DUP_BACK:0},pageRewards});
  }

  // ── 스티커: 같은 스티커 10장 → 골드티켓 1장으로 교환 ──
  //    (도감에서 사라지지 않도록 STICKER_TICKET_KEEP 장은 남기고 나머지를 소모한다)
  if (path === "/api/sticker/ticket/make") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    const sticker = STICKER_MAP[String(d.stickerId||"")];
    if (!sticker) return fail("존재하지 않는 스티커예요.");
    const have = Number(data.stickerBook.stickers[sticker.sticker_id]||0);
    if (have < STICKER_TICKET_NEED) return fail("같은 스티커를 " + STICKER_TICKET_NEED + "장 모아야 골드티켓으로 바꿀 수 있어요.");
    data.stickerBook.stickers[sticker.sticker_id] = have - (STICKER_TICKET_NEED - STICKER_TICKET_KEEP);
    data.stickerBook.goldTickets += 1;
    await putStudent(db,d.section,id,data);
    return ok({data,sticker,goldTickets:data.stickerBook.goldTickets,left:data.stickerBook.stickers[sticker.sticker_id]});
  }

  // ── 스티커: 골드티켓으로 원하는 스티커 1장 받기 (가격 상관없이 무료) ──
  if (path === "/api/sticker/ticket/use") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id); if (!id) return fail("기기 정보가 없어요.");
    const data = await getStudent(db,d.section,id); if (!data) return fail("등록되지 않은 학생이에요.");
    ensureStickerData(data);
    const sticker = STICKER_MAP[String(d.stickerId||"")];
    if (!sticker) return fail("존재하지 않는 스티커예요.");
    if (data.stickerBook.goldTickets < 1) return fail("골드티켓이 없어요.");
    if (Number(data.stickerBook.stickers[sticker.sticker_id]||0) > 0) return fail("이미 가지고 있는 스티커예요. 아직 없는 스티커에 사용해 보세요.");
    data.stickerBook.goldTickets -= 1;
    data.stickerBook.stickers[sticker.sticker_id] = 1;
    const pageRewards = checkStickerRewards(data);
    await putStudent(db,d.section,id,data);
    return ok({data,sticker,pageRewards,goldTickets:data.stickerBook.goldTickets});
  }

  // ── 학생: 별명 변경 ──
  if (path === "/api/student/rename") {
    if (!validSection(d.section)) return fail("반(레벨)을 선택해 주세요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보를 확인하지 못했어요.");
    const nickname = cleanNickname(d.nickname);
    if (!nickname) return fail("별명을 입력해 주세요.");
    const data = await getStudent(db, d.section, id);
    if (!data) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    data.nickname = nickname;
    await putStudent(db, d.section, id, data);
    return ok({ data });
  }

  // ── 학생: 단계(레벨) 다시 선택 — 코인·스티커·기록은 그대로 새 단계로 옮긴다 ──
  //    (예전에는 "나가기" 뒤 다른 단계로 다시 시작하면 그 단계용 새 학생이 만들어져
  //     지금까지 모은 것이 전부 사라지는 것처럼 보였다. 같은 데이터를 section만 바꿔 옮긴다.)
  if (path === "/api/student/changeSection") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    if (!validSection(d.newSection)) return fail("옮길 단계를 선택해 주세요.");
    if (d.newSection === d.section) return fail("지금과 같은 단계예요.");
    const data = await getStudent(db, d.section, id);
    if (!data) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    const already = await getStudent(db, d.newSection, id);
    if (already) return fail("이 기기는 이미 '" + SECTIONS[d.newSection].name + "' 단계에 등록되어 있어요. 그 단계 화면에서 '다른 기기에서 이어하기'로 내 코드를 넣어 이어가 주세요.");

    // 친구 쪽에서 나를 가리키는 참조(section)도 함께 바꿔 준다.
    // 안 바꾸면 내가 단계를 옮긴 뒤 친구 목록에서 조용히 사라진다.
    for (const f of (data.friends || [])) {
      const you = await getStudent(db, f.section, f.id);
      if (!you || !Array.isArray(you.friends)) continue;
      let changed = false;
      you.friends = you.friends.map(ref => {
        if (ref.section === d.section && ref.id === id) { changed = true; return { section: d.newSection, id }; }
        return ref;
      });
      if (changed) await putStudent(db, f.section, f.id, you);
    }

    await putStudent(db, d.newSection, id, data);
    await db.prepare("DELETE FROM vocab_students2 WHERE section = ? AND id = ?").bind(d.section, id).run();
    if (data.code) await db.prepare("UPDATE vocab_codes SET section = ? WHERE code = ?").bind(d.newSection, data.code).run();
    return ok({ data, section: d.newSection, sectionName: SECTIONS[d.newSection].name, today: kst().date });
  }

  // ── 학생: 진행 상황 저장 ──
  if (path === "/api/student/save") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const cur = await getStudent(db, d.section, id);
    if (!cur) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    if (!d.data || typeof d.data !== "object") return fail("저장할 내용이 없어요.");
    if (JSON.stringify(d.data).length > 300000) return fail("저장 내용이 너무 커요.");
    // 아래 값들은 서버가 주인이다. 특히 friends/cheers/messages 는 '친구가' 바꾸는 값이라
    // 학생 기기가 들고 있던 옛 사본으로 덮어쓰면 받은 응원·쪽지가 사라진다.
    d.data.nickname = cur.nickname; // 별명은 /api/student/rename 을 통해서만 바뀜
    d.data.code = cur.code;
    d.data.friends = Array.isArray(cur.friends) ? cur.friends : [];
    d.data.cheers = Array.isArray(cur.cheers) ? cur.cheers : [];
    d.data.messages = Array.isArray(cur.messages) ? cur.messages : [];
    ensureStickerData(cur); ensureStickerData(d.data);
    d.data.coins = cur.coins;
    d.data.stickerBook = cur.stickerBook;
    d.data.rewardHistory = cur.rewardHistory || {};
    d.data.snakeTicket = cur.snakeTicket || null;   // 입장권도 서버가 주인 (화면에서 못 늘린다)
    const oldTodayDone = !!(cur.days && cur.days[kst().date] && cur.days[kst().date].done);
    const newTodayDone = !!(d.data.days && d.data.days[kst().date] && d.data.days[kst().date].done);
    const dailyKey = "daily_complete_" + kst().date;
    if (!oldTodayDone && newTodayDone && !d.data.rewardHistory[dailyKey]) {
      d.data.rewardHistory[dailyKey] = true;
      d.data.coins += 100;
    }
    // '오늘 복습' 완료 보상 (하루 1번) — days[오늘].reviewed 플래그는 화면(클라이언트)이 켠다
    const reviewKey = "review_" + kst().date;
    const todayRecSrv = d.data.days && d.data.days[kst().date];
    if (todayRecSrv && todayRecSrv.reviewed && !d.data.rewardHistory[reviewKey]) {
      d.data.rewardHistory[reviewKey] = true;
      d.data.coins += REVIEW_REWARD;
    }
    // '단어 게임' 완주 보상 (하루 1번) — days[오늘].gamePlayed 플래그는 화면(클라이언트)이 켠다
    const gameKey = "game_" + kst().date;
    if (todayRecSrv && todayRecSrv.gamePlayed && !d.data.rewardHistory[gameKey]) {
      d.data.rewardHistory[gameKey] = true;
      d.data.coins += GAME_REWARD;
    }
    await putStudent(db, d.section, id, d.data);
    return ok({ data: d.data });
  }

  // ── 친구: 코드로 친구 맺기 (서로 친구가 된다) ──
  if (path === "/api/friend/add") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    const found = await lookupByCode(db, d.code);
    if (!found) return fail("코드를 찾을 수 없어요. 친구에게 코드를 다시 물어보세요.");
    const meRef = { section: d.section, id };
    const friendRef = { section: found.section, id: found.id };
    if (sameStudent(meRef, friendRef)) return fail("내 코드예요. 친구의 코드를 넣어 주세요.");
    me.friends = Array.isArray(me.friends) ? me.friends : [];
    if (me.friends.some(f => sameStudent(f, friendRef)))
      return fail("'" + found.data.nickname + "' 님과는 이미 친구예요.");
    if (me.friends.length >= MAX_FRIENDS) return fail("친구는 " + MAX_FRIENDS + "명까지 추가할 수 있어요.");

    const you = found.data;
    you.friends = Array.isArray(you.friends) ? you.friends : [];
    me.friends.push(friendRef);
    if (!you.friends.some(f => sameStudent(f, meRef)) && you.friends.length < MAX_FRIENDS)
      you.friends.push(meRef); // 서로 친구로 (친구도 나를 응원할 수 있게)
    await putStudent(db, d.section, id, me);
    await putStudent(db, found.section, found.id, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 목록 + 오늘 공부했는지 ──
  if (path === "/api/friend/list") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    const day = kst().date;
    const list = [];
    for (const f of (me.friends || [])) {
      const data = await getStudent(db, f.section, f.id);
      if (!data) continue; // 기록이 지워진 친구는 건너뜀
      const st = dayStatus(data, day);
      list.push({
        section: f.section, id: f.id,
        nickname: data.nickname,
        sectionName: (SECTIONS[f.section] || {}).name || f.section,
        streak: data.streak | 0,
        todayDone: st.done, todaySets: st.setsDone, todaySetsTotal: st.setsTotal, todayQuiz: st.quizDone,
        // 오늘 내가 이미 응원했는지 (하루에 한 번만 보낼 수 있음)
        cheeredByMe: (data.cheers || []).some(c => c.fromId === id && c.day === day),
      });
    }
    list.sort((a, b) => (b.todayDone - a.todayDone) || a.nickname.localeCompare(b.nickname, "ko"));
    // 내가 오늘 받은 응원
    const myCheers = (me.cheers || []).filter(c => c.day === day);
    // 내 쪽지함 (최신 순)
    const messages = (me.messages || []).slice().reverse();
    return ok({ day, friends: list, myCode: me.code || "", cheersToday: myCheers, messages });
  }

  // ── 친구: 쪽지 보내기 ──
  if (path === "/api/friend/message/send") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("쪽지 받을 친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    if (!(me.friends || []).some(f => sameStudent(f, friendRef)))
      return fail("친구 목록에 없는 친구예요.");
    const text = cleanMessageText(d.text);
    if (!text) return fail("쪽지 내용을 입력해 주세요.");
    const you = await getStudent(db, d.toSection, toId);
    if (!you) return fail("친구의 기록을 찾을 수 없어요.");
    const day = kst().date;
    you.messages = Array.isArray(you.messages) ? you.messages : [];
    const todayCount = you.messages.filter(m => m.fromId === id && m.day === day).length;
    if (todayCount >= MSG_DAILY_LIMIT) return fail("오늘은 이 친구에게 쪽지를 충분히 보냈어요. 내일 또 보내 주세요!");
    you.messages.push({ id: genId(), fromSection: d.section, fromId: id, fromNick: me.nickname, text, day });
    await putStudent(db, d.toSection, toId, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 받은 쪽지 지우기 ──
  if (path === "/api/friend/message/delete") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const msgId = String(d.messageId || "");
    if (!msgId) return fail("지울 쪽지 정보가 없어요.");
    me.messages = (me.messages || []).filter(m => m.id !== msgId);
    await putStudent(db, d.section, id, me);
    return ok({});
  }

  // ── 친구: 응원 보내기 (하루 한 번) ──
  if (path === "/api/friend/cheer") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("응원할 친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    if (!(me.friends || []).some(f => sameStudent(f, friendRef)))
      return fail("친구 목록에 없는 친구예요.");
    const you = await getStudent(db, d.toSection, toId);
    if (!you) return fail("친구의 기록을 찾을 수 없어요.");
    const day = kst().date;
    you.cheers = Array.isArray(you.cheers) ? you.cheers : [];
    if (you.cheers.some(c => c.fromId === id && c.day === day))
      return fail("오늘은 이미 응원했어요. 내일 또 보내 주세요!");
    you.cheers.push({ fromId: id, fromNick: me.nickname, day });
    await putStudent(db, d.toSection, toId, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 삭제 (양쪽에서 지운다) ──
  if (path === "/api/friend/remove") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    const meRef = { section: d.section, id };
    me.friends = (me.friends || []).filter(f => !sameStudent(f, friendRef));
    await putStudent(db, d.section, id, me);
    const you = await getStudent(db, d.toSection, toId);
    if (you) {
      you.friends = (you.friends || []).filter(f => !sameStudent(f, meRef));
      await putStudent(db, d.toSection, toId, you);
    }
    return ok({});
  }

  // ── 오늘(또는 이번 주 특정 날짜)의 영단어 (없으면 AI가 생성) ──
  // day 를 안 주면 오늘. 주면 미리 학습(하루 앞당겨 보기)용 — 과거 60일~앞으로 6일만 허용.
  if (path === "/api/today") {
    if (!validSection(d.section)) return fail("반(레벨)을 선택해 주세요.");
    let day = kst().date;
    if (d.day) {
      const v = validDay(d.day);
      if (!v) return fail("날짜가 이상해요.");
      day = v;
    }
    const r = await ensureTodaySet(env, db, d.section, day, cf);
    if (r.error) return fail(r.error, 503);
    return ok({ day: r.day, words: r.words });
  }

  return fail("없는 주소입니다.", 404);
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;

    // ── 정적 화면 ──
    if (method === "GET" || method === "HEAD") {
      if (path === "/" || path === "/index.html")
        return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

      // ── 스티커 이미지: KV(STICKER_KV)에서 꺼내 준다. 없으면 404 → 화면은 이모지로 대체 ──
      if (path.startsWith("/assets/stickers/")) {
        const key = path.slice("/assets/stickers/".length);
        if (env.STICKER_KV) {
          const buf = await env.STICKER_KV.get(key, "arrayBuffer");
          if (buf) {
            const ext = (key.split(".").pop() || "").toLowerCase();
            const ct = ext === "png" ? "image/png"
              : (ext === "jpg" || ext === "jpeg") ? "image/jpeg"
              : ext === "webp" ? "image/webp"
              : ext === "gif" ? "image/gif"
              : ext === "svg" ? "image/svg+xml"
              : "application/octet-stream";
            return new Response(buf, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" } });
          }
        }
        return new Response("Not found", { status: 404 });
      }
    }

    if (!path.startsWith("/api/")) return new Response("404", { status: 404 });
    if (method !== "POST") return jsonResponse({ ok: false, error: "POST 로 요청해 주세요." }, 405);

    let d = {};
    try { d = await request.json(); } catch (e) { d = {}; }

    try {
      await ensureSchema(env.DB);
      const r = await handleApi(env, env.DB, path, d, request.cf);
      return jsonResponse(r.body, r.status);
    } catch (e) {
      return jsonResponse({ ok: false, error: "서버 오류: " + (e && e.message ? e.message : e) }, 500);
    }
  },
};
