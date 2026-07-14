/*
 * 우리 반 아이디어 보드 — 온라인 서버 (Cloudflare Worker + D1)
 * ──────────────────────────────────────────────────────────
 * 와우아이디어스처럼 교사가 게시판을 만들고, 학생들이 글·그림·파일을
 * 자유롭게 올리는 학급 게시판입니다. 학생은 주소만 열면 바로 접속됩니다.
 *  - 학생용:  https://<워커주소>/
 *  - 교사용:  https://<워커주소>/teacher.html  (같은 화면, 교사 탭이 먼저 열림)
 *
 * ※ 이 파일은 build-ideaboard-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(ideaboard-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: idea-board)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: idea-board)
 *  3. 이 파일(ideaboard-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 idea-board 선택
 *  5. 배포 주소를 학생 태블릿 홈 화면에 추가하면 끝!
 *
 * 초기 계정: 교사 teacher / 0000, 학급 코드 6-1 (설정에서 변경하세요)
 *
 * ✅ 사진은 학생 기기에서 자동 압축(최대 1280px)되어 올라갑니다.
 * ✅ 일반 파일 첨부는 1개당 1MB 까지입니다. (D1 무료 용량 보호)
 * ✅ 쪽지는 최근 600개까지 보관되고 오래된 읽은 쪽지부터 정리됩니다.
 */

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>우리 반 아이디어 보드</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #f1f3f8; color: #2d3436; -webkit-tap-highlight-color: transparent;
  }
  button { font-family: inherit; cursor: pointer; border: none; background: none; font-size: 14px; }
  input, textarea, select { font-family: inherit; font-size: 15px; }
  [hidden] { display: none !important; }

  /* ── 로그인 ── */
  #scr-login {
    min-height: 100%; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #7c4dff 0%, #448aff 55%, #00bcd4 100%); padding: 20px;
  }
  .login-card {
    background: #fff; border-radius: 22px; padding: 34px 30px; width: 360px; max-width: 94vw;
    box-shadow: 0 18px 50px rgba(20, 20, 60, .35); text-align: center;
  }
  .login-card h1 { font-size: 24px; margin-bottom: 4px; }
  .login-card .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  .role-tabs { display: flex; gap: 6px; background: #eef0f6; border-radius: 12px; padding: 5px; margin-bottom: 18px; }
  .role-tabs button { flex: 1; padding: 9px 0; border-radius: 9px; font-weight: 700; color: #777; }
  .role-tabs button.on { background: #fff; color: #5b48e0; box-shadow: 0 2px 6px rgba(0,0,0,.12); }
  .login-card input {
    width: 100%; padding: 12px 14px; margin-bottom: 10px; border: 2px solid #e3e6ef;
    border-radius: 11px; outline: none;
  }
  .login-card input:focus { border-color: #7c4dff; }
  .btn-primary {
    background: linear-gradient(135deg, #7c4dff, #448aff); color: #fff; font-weight: 700;
    padding: 13px; border-radius: 12px; width: 100%; font-size: 16px;
  }
  .login-err { color: #e74c3c; font-size: 13px; min-height: 18px; margin-bottom: 8px; }

  /* ── 상단바 ── */
  header {
    position: sticky; top: 0; z-index: 30; color: #fff;
    background: linear-gradient(135deg, #7c4dff, #448aff);
    display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    box-shadow: 0 3px 12px rgba(60, 60, 130, .25);
  }
  header .title { font-size: 18px; font-weight: 800; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header .who { font-size: 13px; background: rgba(255,255,255,.22); padding: 5px 12px; border-radius: 99px; white-space: nowrap; }
  .icon-btn { position: relative; font-size: 20px; color: #fff; padding: 5px 7px; border-radius: 9px; }
  .icon-btn:hover { background: rgba(255,255,255,.18); }
  .badge {
    position: absolute; top: -2px; right: -2px; background: #ff5252; color: #fff;
    font-size: 10px; font-weight: 800; border-radius: 99px; padding: 1px 5px; min-width: 16px;
  }

  main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 60px; }

  /* ── 게시판 카드 그리드 ── */
  .board-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
  .board-card {
    border-radius: 18px; padding: 20px 18px; min-height: 130px; cursor: pointer;
    display: flex; flex-direction: column; gap: 6px; position: relative;
    box-shadow: 0 4px 14px rgba(50, 50, 100, .1); transition: transform .12s;
    border: none; text-align: left;
  }
  .board-card:hover { transform: translateY(-3px); }
  .board-card .b-title { font-size: 17px; font-weight: 800; word-break: keep-all; }
  .board-card .b-desc { font-size: 13px; color: rgba(0,0,0,.55); flex: 1; word-break: keep-all; }
  .board-card .b-count { font-size: 12px; font-weight: 700; color: rgba(0,0,0,.45); }
  .board-card .b-tools { position: absolute; top: 10px; right: 10px; display: flex; gap: 2px; }
  .board-card .b-tools button { font-size: 14px; padding: 4px 6px; border-radius: 8px; }
  .board-card .b-tools button:hover { background: rgba(255,255,255,.6); }
  .board-new {
    border: 3px dashed #b9c0d8; background: transparent; color: #8a92ad; font-weight: 800;
    align-items: center; justify-content: center; font-size: 15px; box-shadow: none;
  }
  .board-new:hover { border-color: #7c4dff; color: #7c4dff; }
  .empty-note { text-align: center; color: #99a; padding: 60px 10px; font-size: 15px; }

  /* ── 게시판 화면 ── */
  .board-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .board-head h2 { font-size: 21px; }
  .board-head .desc { color: #778; font-size: 13px; width: 100%; }
  .btn-back { font-size: 20px; background: #fff; border-radius: 10px; padding: 6px 11px; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
  .btn-write {
    margin-left: auto; background: linear-gradient(135deg, #ff9048, #ff5e7e); color: #fff;
    font-weight: 800; padding: 10px 18px; border-radius: 12px; font-size: 15px;
    box-shadow: 0 4px 12px rgba(255, 100, 100, .35);
  }
  .posts { columns: 300px; column-gap: 14px; }
  .post {
    background: #fff; border-radius: 16px; padding: 15px; margin-bottom: 14px;
    break-inside: avoid; box-shadow: 0 3px 12px rgba(50, 50, 100, .09);
  }
  .post.notice { border: 2.5px solid #ffc93c; background: #fffcf0; }
  .chip-notice { background: #ffc93c; color: #6b4b00; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 99px; }
  .tag-teacher { background: #ece4ff; color: #5b48e0; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; margin-left: 4px; }
  .p-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .avatar {
    width: 32px; height: 32px; border-radius: 50%; color: #fff; font-weight: 800; font-size: 14px;
    display: flex; align-items: center; justify-content: center; flex: none;
  }
  .p-who { flex: 1; min-width: 0; }
  .p-name { font-size: 14px; font-weight: 700; }
  .p-time { font-size: 11px; color: #99a; }
  .p-tools { display: flex; gap: 2px; }
  .p-tools button { font-size: 13px; padding: 3px 5px; border-radius: 7px; color: #888; }
  .p-tools button:hover { background: #f0f1f7; }
  .p-text { font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
  .p-text a { color: #3b6cff; word-break: break-all; }
  .p-img { width: 100%; border-radius: 10px; margin-bottom: 8px; cursor: zoom-in; display: block; background: #f4f4f8; }
  .p-file {
    display: flex; align-items: center; gap: 7px; background: #f2f4fb; border-radius: 10px;
    padding: 8px 11px; margin-bottom: 8px; font-size: 13px; color: #445; text-decoration: none;
    word-break: break-all;
  }
  .p-file:hover { background: #e7ebfa; }
  .p-foot { display: flex; align-items: center; gap: 4px; border-top: 1px solid #f0f1f6; padding-top: 8px; }
  .p-foot button { font-size: 13px; color: #778; padding: 5px 9px; border-radius: 9px; font-weight: 700; }
  .p-foot button:hover { background: #f4f5fa; }
  .p-foot .liked { color: #ff4d6d; }
  .comments { margin-top: 8px; border-top: 1px dashed #e7e9f2; padding-top: 8px; }
  .cmt { display: flex; gap: 7px; margin-bottom: 7px; font-size: 13px; }
  .cmt .c-body { flex: 1; background: #f5f6fb; border-radius: 10px; padding: 6px 10px; }
  .cmt .c-name { font-weight: 700; font-size: 12px; margin-right: 4px; }
  .cmt .c-time { color: #aab; font-size: 10px; margin-left: 5px; }
  .cmt .c-del { color: #bbc; font-size: 12px; }
  .cmt-input { display: flex; gap: 6px; margin-top: 4px; }
  .cmt-input input { flex: 1; border: 1.5px solid #e3e6ef; border-radius: 9px; padding: 7px 10px; font-size: 13px; outline: none; }
  .cmt-input input:focus { border-color: #7c4dff; }
  .cmt-input button { background: #7c4dff; color: #fff; border-radius: 9px; padding: 0 13px; font-weight: 700; }

  /* ── 모달 공통 ── */
  .overlay {
    position: fixed; inset: 0; background: rgba(25, 25, 60, .45); z-index: 100;
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
  .modal {
    background: #fff; border-radius: 18px; width: 520px; max-width: 96vw; max-height: 92vh;
    display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 70px rgba(10,10,40,.4);
  }
  .m-head { display: flex; align-items: center; padding: 15px 18px 12px; font-size: 17px; font-weight: 800; }
  .m-head .x { margin-left: auto; font-size: 19px; color: #99a; padding: 3px 8px; border-radius: 8px; }
  .m-head .x:hover { background: #f0f1f7; }
  .m-body { padding: 4px 18px 18px; overflow-y: auto; }
  .m-body label { display: block; font-size: 13px; font-weight: 700; color: #667; margin: 10px 0 5px; }
  .m-body input[type=text], .m-body input[type=password], .m-body input[type=number],
  .m-body textarea, .m-body select {
    width: 100%; border: 2px solid #e3e6ef; border-radius: 11px; padding: 10px 12px; outline: none;
  }
  .m-body input:focus, .m-body textarea:focus, .m-body select:focus { border-color: #7c4dff; }
  .m-body textarea { min-height: 110px; resize: vertical; }
  .m-actions { display: flex; gap: 8px; margin-top: 15px; }
  .m-actions .grow { flex: 1; }
  .btn2 { background: #eef0f6; color: #556; font-weight: 700; padding: 11px 16px; border-radius: 11px; }
  .btn2:hover { background: #e3e6f0; }

  /* ── 글쓰기 첨부 ── */
  .attach-btns { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .attach-btns button { background: #f2f4fb; border-radius: 10px; padding: 9px 13px; font-weight: 700; color: #445; }
  .attach-btns button:hover { background: #e7ebfa; }
  .attach-list { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .att {
    position: relative; border-radius: 10px; overflow: hidden; background: #f2f4fb;
    font-size: 12px; color: #556;
  }
  .att img { width: 74px; height: 74px; object-fit: cover; display: block; }
  .att .att-file { padding: 10px 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
  .att .rm {
    position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,.55); color: #fff;
    border-radius: 50%; width: 20px; height: 20px; font-size: 11px; line-height: 20px; text-align: center;
  }
  .check-row { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 14px; font-weight: 700; color: #556; }
  .check-row input { width: 17px; height: 17px; }

  /* ── 그리기 ── */
  .draw-modal { width: 1020px; }
  #draw-canvas {
    width: 100%; border: 2px solid #e3e6ef; border-radius: 12px; touch-action: none;
    display: block; background: #fff; cursor: crosshair;
  }
  .draw-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
  .draw-tools .dot { width: 26px; height: 26px; border-radius: 50%; border: 3px solid transparent; }
  .draw-tools .dot.on { border-color: #2d3436; transform: scale(1.15); }
  .draw-tools .szbtn { background: #f2f4fb; border-radius: 9px; padding: 5px 10px; font-weight: 700; color: #445; }
  .draw-tools .szbtn.on { background: #7c4dff; color: #fff; }
  .draw-tools .sep { width: 1px; height: 24px; background: #e3e6ef; margin: 0 4px; }

  /* ── 쪽지 ── */
  .msg-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .msg-tabs button { flex: 1; background: #eef0f6; border-radius: 10px; padding: 9px; font-weight: 700; color: #778; }
  .msg-tabs button.on { background: #7c4dff; color: #fff; }
  .msg-item { background: #f6f7fc; border-radius: 12px; padding: 10px 13px; margin-bottom: 8px; }
  .msg-item.unread { background: #fff3f5; border: 1.5px solid #ffd3dc; }
  .msg-meta { font-size: 12px; color: #889; margin-bottom: 3px; display: flex; gap: 6px; }
  .msg-meta b { color: #445; }
  .msg-text { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  .msg-compose { border-top: 1px solid #eef0f6; padding-top: 12px; margin-top: 6px; }

  /* ── 새 쪽지 팝업 ── */
  .popup-modal { width: 430px; border-top: 6px solid #ff5e7e; }
  .popup-modal .m-head { font-size: 18px; }

  /* ── 학생 관리 표 ── */
  .stu-table { width: 100%; border-collapse: collapse; }
  .stu-table th { font-size: 12px; color: #889; text-align: left; padding: 4px 6px; }
  .stu-table td { padding: 3px 3px; }
  .stu-table input { width: 100%; border: 1.5px solid #e3e6ef; border-radius: 8px; padding: 7px 9px; font-size: 14px; outline: none; }
  .stu-table input:focus { border-color: #7c4dff; }
  .stu-table .del { color: #e74c3c; font-size: 15px; padding: 4px 7px; }

  /* ── 사진 크게 보기 ── */
  #lightbox { background: rgba(10, 10, 30, .88); cursor: zoom-out; }
  #lightbox img { max-width: 96vw; max-height: 92vh; border-radius: 8px; }

  /* ── 알림 토스트 ── */
  #toast {
    position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%);
    background: #2d3436; color: #fff; padding: 11px 20px; border-radius: 99px;
    font-size: 14px; z-index: 300; opacity: 0; transition: opacity .25s; pointer-events: none;
    max-width: 90vw;
  }
  #toast.show { opacity: 1; }

  /* ── 포트폴리오 ── */
  .stu-table .pf { color: #5b48e0; font-size: 15px; padding: 4px 7px; }
  .pf-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .pf-stat { background: #f2f4fb; border-radius: 12px; padding: 8px 14px; text-align: center; flex: 1; min-width: 72px; }
  .pf-stat b { display: block; font-size: 20px; color: #5b48e0; }
  .pf-stat span { font-size: 12px; color: #778; }
  .pf-section-title { font-size: 15px; font-weight: 800; margin: 16px 0 8px; color: #445; }
  .pf-item { border: 1.5px solid #eef0f6; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
  .pf-item .pf-meta { font-size: 12px; color: #889; margin-bottom: 6px; }
  .pf-item .pf-meta b { color: #5b48e0; }
  .pf-item .pf-text { font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
  .pf-item img { max-width: 220px; max-height: 220px; border-radius: 8px; margin: 4px 6px 4px 0; border: 1px solid #eee; vertical-align: top; }
  .pf-item .pf-file { display: inline-block; background: #f2f4fb; border-radius: 8px; padding: 5px 10px; font-size: 13px; color: #445; text-decoration: none; margin: 2px 4px 2px 0; }
  .pf-item .pf-badge { font-size: 12px; color: #889; }
  .pf-cmts { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #eef0f6; font-size: 13px; }
  .pf-cmts .pf-c { color: #556; margin-bottom: 3px; }
  .pf-cmts .pf-c b { color: #445; }
  .pf-empty { color: #99a; font-size: 13px; padding: 8px 0; }

  /* ── 인쇄(PDF 저장) 전용 ── */
  #print-area { display: none; }
  @media print {
    body { background: #fff; }
    body > *:not(#print-area) { display: none !important; }
    #print-area { display: block !important; padding: 0; color: #000; }
    #print-area .pf-print-head { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 16px; }
    #print-area .pf-print-head h1 { font-size: 22px; margin-bottom: 4px; }
    #print-area .pf-print-head .sub { font-size: 13px; color: #333; }
    #print-area .pf-stats { display: flex; gap: 10px; margin-bottom: 16px; }
    #print-area .pf-stat { border: 1px solid #ccc; }
    #print-area .pf-stat b { color: #000; }
    #print-area .pf-section-title { border-bottom: 1px solid #999; }
    #print-area .pf-item { border: 1px solid #bbb; page-break-inside: avoid; }
    #print-area .pf-item img { max-width: 260px; max-height: 260px; }
    @page { margin: 14mm; }
  }

  @media (max-width: 560px) {
    header .who { display: none; }
    main { padding: 14px 10px 60px; }
    .posts { columns: 1; }
  }
</style>
</head>
<body>

<!-- ═══════════ 로그인 ═══════════ -->
<div id="scr-login">
  <div class="login-card">
    <h1>💡 우리 반 아이디어 보드</h1>
    <div class="sub">글 · 그림 · 사진 · 파일로 아이디어를 나눠요</div>
    <div class="role-tabs">
      <button id="tab-student" class="on" onclick="IB.setRole('student')">🧑‍🎓 학생</button>
      <button id="tab-teacher" onclick="IB.setRole('teacher')">🧑‍🏫 선생님</button>
    </div>
    <div id="login-student">
      <input id="in-class" type="text" placeholder="학급 코드 (예: 6-1)" autocomplete="off">
      <input id="in-number" type="number" placeholder="번호" min="1">
      <input id="in-pin" type="password" placeholder="PIN (숫자 4자리)" inputmode="numeric" maxlength="4">
    </div>
    <div id="login-teacher" hidden>
      <input id="in-tid" type="text" placeholder="교사 아이디" value="teacher" autocomplete="off">
      <input id="in-tpw" type="password" placeholder="비밀번호">
    </div>
    <div class="login-err" id="login-err"></div>
    <button class="btn-primary" onclick="IB.login()">들어가기</button>
  </div>
</div>

<!-- ═══════════ 앱 본체 ═══════════ -->
<div id="scr-app" hidden>
  <header>
    <div class="title" id="hd-title">우리 반 아이디어 보드</div>
    <span class="who" id="hd-who"></span>
    <button class="icon-btn" title="쪽지" onclick="IB.openMsgs()">✉️<span class="badge" id="hd-badge" hidden></span></button>
    <button class="icon-btn" id="hd-students" title="학생 관리" onclick="IB.openStudents()" hidden>👥</button>
    <button class="icon-btn" id="hd-teachers" title="선생님 계정 관리" onclick="IB.openTeachers()" hidden>🧑‍🏫</button>
    <button class="icon-btn" id="hd-settings" title="설정" onclick="IB.openSettings()" hidden>⚙️</button>
    <button class="icon-btn" title="나가기" onclick="IB.logout()">🚪</button>
  </header>

  <!-- 홈: 게시판 목록 -->
  <main id="view-home">
    <div class="board-grid" id="board-grid"></div>
    <div class="empty-note" id="home-empty" hidden>아직 게시판이 없어요.<br>선생님이 게시판을 만들면 여기에 나타나요! 🌱</div>
  </main>

  <!-- 게시판: 글 목록 -->
  <main id="view-board" hidden>
    <div class="board-head">
      <button class="btn-back" onclick="IB.goHome()">←</button>
      <h2 id="bd-title"></h2>
      <button class="btn-write" onclick="IB.openComposer()">✏️ 아이디어 올리기</button>
      <div class="desc" id="bd-desc"></div>
    </div>
    <div class="posts" id="post-list"></div>
    <div class="empty-note" id="bd-empty" hidden>아직 올라온 아이디어가 없어요.<br>첫 번째 아이디어를 올려 볼까요? ✨</div>
  </main>
</div>

<!-- ═══════════ 글쓰기 모달 ═══════════ -->
<div class="overlay" id="md-compose" hidden>
  <div class="modal">
    <div class="m-head">✏️ 아이디어 올리기 <button class="x" onclick="IB.closeComposer()">✕</button></div>
    <div class="m-body">
      <textarea id="cmp-text" placeholder="생각을 자유롭게 써 보세요. 링크를 붙여 넣으면 자동으로 연결돼요!"></textarea>
      <div class="attach-btns">
        <button onclick="document.getElementById('cmp-photo').click()">📷 사진</button>
        <button onclick="IB.openDraw()">🎨 그림 그리기</button>
        <button onclick="document.getElementById('cmp-file').click()">📎 파일</button>
      </div>
      <input id="cmp-photo" type="file" accept="image/*" multiple hidden>
      <input id="cmp-file" type="file" multiple hidden>
      <div class="attach-list" id="cmp-attach"></div>
      <div class="check-row" id="cmp-notice-row" hidden>
        <input type="checkbox" id="cmp-notice"><label for="cmp-notice" style="margin:0">📌 공지로 고정하기</label>
      </div>
      <div class="m-actions">
        <button class="btn-primary grow" id="cmp-submit" onclick="IB.submitPost()">올리기</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 그리기 모달 ═══════════ -->
<div class="overlay" id="md-draw" hidden>
  <div class="modal draw-modal">
    <div class="m-head">🎨 그림 그리기 <button class="x" onclick="IB.closeDraw()">✕</button></div>
    <div class="m-body">
      <div class="draw-tools" id="draw-colors"></div>
      <div class="draw-tools">
        <button class="szbtn" data-sz="4" onclick="IB.drawSize(4,this)">가는 붓</button>
        <button class="szbtn on" data-sz="9" onclick="IB.drawSize(9,this)">보통 붓</button>
        <button class="szbtn" data-sz="20" onclick="IB.drawSize(20,this)">굵은 붓</button>
        <span class="sep"></span>
        <button class="szbtn" id="draw-eraser" onclick="IB.drawEraser(this)">🧽 지우개</button>
        <button class="szbtn" onclick="IB.drawUndo()">↩️ 되돌리기</button>
        <button class="szbtn" onclick="IB.drawClear()">🗑 모두 지우기</button>
      </div>
      <canvas id="draw-canvas" width="960" height="600"></canvas>
      <div class="m-actions">
        <button class="btn2" onclick="IB.closeDraw()">취소</button>
        <button class="btn-primary grow" onclick="IB.finishDraw()">✅ 그림 붙이기</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 쪽지함 모달 ═══════════ -->
<div class="overlay" id="md-msgs" hidden>
  <div class="modal">
    <div class="m-head">✉️ 쪽지 <button class="x" onclick="IB.hide('md-msgs')">✕</button></div>
    <div class="m-body">
      <div class="msg-tabs">
        <button id="mt-recv" class="on" onclick="IB.msgTab('recv')">받은 쪽지</button>
        <button id="mt-sent" onclick="IB.msgTab('sent')">보낸 쪽지</button>
      </div>
      <div id="msg-list"></div>
      <div class="msg-compose">
        <label id="msg-to-label">선생님께 쪽지 보내기 (고민 상담, 하고 싶은 말 무엇이든!)</label>
        <select id="msg-to" hidden></select>
        <textarea id="msg-text" style="min-height:70px" placeholder="쪽지 내용을 써 주세요"></textarea>
        <div class="m-actions">
          <button class="btn-primary grow" onclick="IB.sendMsg()">보내기 💌</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 새 쪽지 팝업 ═══════════ -->
<div class="overlay" id="md-popup" hidden>
  <div class="modal popup-modal">
    <div class="m-head">💌 새 쪽지가 도착했어요!</div>
    <div class="m-body">
      <div id="popup-list"></div>
      <div class="m-actions">
        <button class="btn-primary grow" onclick="IB.ackPopup()">확인했어요 👍</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 게시판 만들기/고치기 (교사) ═══════════ -->
<div class="overlay" id="md-board" hidden>
  <div class="modal">
    <div class="m-head" id="mb-title">새 게시판 <button class="x" onclick="IB.hide('md-board')">✕</button></div>
    <div class="m-body">
      <label>게시판 이름</label>
      <input type="text" id="mb-name" placeholder="예: 5/27 실과 바느질 작품">
      <label>안내 (선택)</label>
      <input type="text" id="mb-desc" placeholder="예: 완성한 작품 사진과 소감을 올려 주세요">
      <div class="m-actions">
        <button class="btn-primary grow" onclick="IB.saveBoard()">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 학생 관리 (교사) ═══════════ -->
<div class="overlay" id="md-students" hidden>
  <div class="modal">
    <div class="m-head">👥 학생 관리 <button class="x" onclick="IB.hide('md-students')">✕</button></div>
    <div class="m-body">
      <div style="font-size:13px;color:#889;margin-bottom:8px">
        학생은 <b>학급 코드 + 번호 + PIN</b> 으로 로그인해요. PIN은 숫자 4자리입니다.
      </div>
      <table class="stu-table">
        <thead><tr><th style="width:56px">번호</th><th>이름</th><th style="width:74px">PIN</th><th style="width:70px"></th></tr></thead>
        <tbody id="stu-rows"></tbody>
      </table>
      <div class="m-actions">
        <button class="btn2" onclick="IB.addStudentRow()">+ 학생 추가</button>
        <button class="btn-primary grow" onclick="IB.saveStudents()">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 학생 포트폴리오 (교사) ═══════════ -->
<div class="overlay" id="md-portfolio" hidden>
  <div class="modal" style="width:720px">
    <div class="m-head"><span id="pf-title">📁 포트폴리오</span>
      <button class="x" onclick="IB.hide('md-portfolio')">✕</button></div>
    <div class="m-body">
      <div id="pf-content"></div>
      <div class="m-actions">
        <button class="btn2" onclick="IB.hide('md-portfolio')">닫기</button>
        <button class="btn-primary grow" onclick="IB.printPortfolio()">📄 PDF로 저장 / 인쇄</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 선생님 계정 관리 (교사) ═══════════ -->
<div class="overlay" id="md-teachers" hidden>
  <div class="modal">
    <div class="m-head">🧑‍🏫 선생님 계정 관리 <button class="x" onclick="IB.hide('md-teachers')">✕</button></div>
    <div class="m-body">
      <div style="font-size:13px;color:#889;margin-bottom:8px">
        여러 선생님이 <b>각자 아이디·비밀번호</b>로 로그인해요. 글·쪽지에 이름이 따로 표시됩니다.<br>
        (옆 반·전담·보결 선생님을 추가해 보세요. 비밀번호는 4자 이상)
      </div>
      <table class="stu-table">
        <thead><tr><th>이름</th><th>아이디</th><th style="width:90px">비밀번호</th><th style="width:36px"></th></tr></thead>
        <tbody id="tch-rows"></tbody>
      </table>
      <div class="m-actions">
        <button class="btn2" onclick="IB.addTeacherRow()">+ 선생님 추가</button>
        <button class="btn-primary grow" onclick="IB.saveTeachers()">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 설정 (교사) ═══════════ -->
<div class="overlay" id="md-settings" hidden>
  <div class="modal">
    <div class="m-head">⚙️ 설정 <button class="x" onclick="IB.hide('md-settings')">✕</button></div>
    <div class="m-body">
      <label>우리 반 이름 (화면 맨 위에 표시)</label>
      <input type="text" id="set-classname">
      <label>학급 코드 (학생 로그인용)</label>
      <input type="text" id="set-classcode">
      <label>내 비밀번호 바꾸기 (바꾸지 않으려면 비워 두세요)</label>
      <input type="password" id="set-newpw" placeholder="4자 이상 — 지금 로그인한 선생님 계정">
      <div class="m-actions">
        <button class="btn-primary grow" onclick="IB.saveSettings()">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 사진 크게 보기 ═══════════ -->
<div class="overlay" id="lightbox" hidden onclick="IB.hide('lightbox')">
  <img id="lightbox-img" alt="">
</div>

<!-- 인쇄(PDF 저장) 전용 영역 — 평소엔 숨김 -->
<div id="print-area"></div>

<div id="toast"></div>

<script>
"use strict";
window.IB = (() => {
  // ── 상태 ──
  const LS_KEY = "ideaboard_auth";
  let AUTH = null;          // {role:"student", classCode, number, pin} | {role:"teacher", id, pw}
  let ME = null;            // {type, id, name}
  let HOME = null;          // /api/home 응답
  let BOARD = null;         // 현재 게시판 {board, posts}
  let loginRole = "student";
  let attachments = [];     // 글쓰기 첨부 [{name, mime, data(dataURL), isImage}]
  let popupIds = [];        // 팝업에 떠 있는 쪽지 id
  let pollTimer = null;
  let msgTabName = "recv";
  let msgCache = [];

  const $ = id => document.getElementById(id);
  const BOARD_COLORS = ["#ffe3ea", "#fff3c4", "#d7f5e2", "#dbeafe", "#f3e8ff", "#ffe8d6", "#d4f6f2"];
  const AVATAR_COLORS = ["#ff8fa3", "#ffb347", "#59c98f", "#5aa2ff", "#a980ff", "#ff8b66", "#38c1b8", "#e6739f"];

  // ── 도우미 ──
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function linkify(s) {
    return esc(s).replace(/(https?:\\/\\/[^\\s<]+)/g,
      u => '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>");
  }
  function fmtTime(s) {
    if (!s) return "";
    // "2026-07-13 14:22:33" → "7/13 14:22"
    const mo = Number(s.slice(5, 7)), da = Number(s.slice(8, 10));
    return mo + "/" + da + " " + s.slice(11, 16);
  }
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }
  function avatarHtml(author) {
    const ch = author.type === "teacher" ? "🧑‍🏫" : esc(String(author.name || "?").charAt(0));
    const color = author.type === "teacher" ? "#5b48e0"
      : AVATAR_COLORS[Number(author.id) % AVATAR_COLORS.length];
    return '<span class="avatar" style="background:' + color + '">' + ch + "</span>";
  }
  // 글쓴이 이름 (선생님이면 이름 옆에 '선생님' 표시)
  function authorLabel(author) {
    return esc(author.name) + (author.type === "teacher" ? ' <span class="tag-teacher">선생님</span>' : "");
  }
  function isMine(author) {
    return ME && author.type === ME.type && Number(author.id) === Number(ME.id);
  }

  async function api(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ auth: AUTH }, body || {})),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { throw new Error("서버 응답 오류"); }
    if (!data.ok) {
      if (res.status === 401 && path !== "/api/login") { doLogout(); }
      throw new Error(data.error || "오류가 발생했어요");
    }
    return data;
  }
  function guard(fn) { return fn.catch(e => toast(e.message)); }

  // ── 로그인 ──
  function setRole(r) {
    loginRole = r;
    $("tab-student").classList.toggle("on", r === "student");
    $("tab-teacher").classList.toggle("on", r === "teacher");
    $("login-student").hidden = r !== "student";
    $("login-teacher").hidden = r !== "teacher";
    $("login-err").textContent = "";
  }
  async function login() {
    $("login-err").textContent = "";
    let auth;
    if (loginRole === "teacher") {
      auth = { role: "teacher", id: $("in-tid").value.trim(), pw: $("in-tpw").value };
    } else {
      auth = {
        role: "student",
        classCode: $("in-class").value.trim(),
        number: Number($("in-number").value),
        pin: $("in-pin").value.trim(),
      };
    }
    try {
      const body = Object.assign({}, auth);
      delete body.auth;
      const r = await api("/api/login", body);
      AUTH = auth;
      localStorage.setItem(LS_KEY, JSON.stringify(auth));
      if (loginRole === "student") localStorage.setItem("ideaboard_class", auth.classCode);
      await enterApp();
    } catch (e) {
      $("login-err").textContent = e.message;
    }
  }
  async function enterApp() {
    hide("scr-login");
    show("scr-app");
    await loadHome();
    startPoll();
  }
  function doLogout() {
    AUTH = null; ME = null; HOME = null; BOARD = null;
    localStorage.removeItem(LS_KEY);
    stopPoll();
    show("scr-login");
    hide("scr-app");
  }
  function logout() { doLogout(); }

  // ── 홈 (게시판 목록) ──
  async function loadHome() {
    const r = await api("/api/home");
    HOME = r;
    ME = r.me;
    $("hd-title").textContent = r.className;
    document.title = r.className;
    $("hd-who").textContent = (ME.type === "teacher" ? "🧑‍🏫 " : "🧑‍🎓 ") + ME.name;
    $("hd-students").hidden = ME.type !== "teacher";
    $("hd-teachers").hidden = ME.type !== "teacher";
    $("hd-settings").hidden = ME.type !== "teacher";
    setBadge(r.unread);
    renderBoards();
    show("view-home");
    hide("view-board");
  }
  function renderBoards() {
    const g = $("board-grid");
    const isT = ME.type === "teacher";
    let html = "";
    HOME.boards.forEach((b, i) => {
      const color = BOARD_COLORS[i % BOARD_COLORS.length];
      html += '<div class="board-card" style="background:' + color + '" onclick="IB.openBoard(' + b.id + ')">' +
        (isT ? '<span class="b-tools">' +
          '<button title="이름 고치기" onclick="event.stopPropagation();IB.editBoard(' + b.id + ')">✏️</button>' +
          '<button title="게시판 지우기" onclick="event.stopPropagation();IB.deleteBoard(' + b.id + ')">🗑</button></span>' : "") +
        '<span class="b-title">' + esc(b.title) + "</span>" +
        '<span class="b-desc">' + esc(b.desc || "") + "</span>" +
        '<span class="b-count">💡 아이디어 ' + b.postCount + "개</span></div>";
    });
    if (isT)
      html += '<div class="board-card board-new" onclick="IB.newBoard()">＋ 새 게시판 만들기</div>';
    g.innerHTML = html;
    $("home-empty").hidden = !(HOME.boards.length === 0 && !isT);
  }
  function goHome() { guard(loadHome()); }

  // ── 게시판 ──
  async function openBoard(id) {
    const r = await api("/api/board", { boardId: id });
    BOARD = r;
    ME = r.me;
    $("bd-title").textContent = r.board.title;
    $("bd-desc").textContent = r.board.desc || "";
    renderPosts();
    hide("view-home");
    show("view-board");
    window.scrollTo(0, 0);
  }
  function renderPosts() {
    const isT = ME.type === "teacher";
    const wrap = $("post-list");
    let html = "";
    for (const p of BOARD.posts) {
      html += '<div class="post' + (p.isNotice ? " notice" : "") + '" id="post-' + p.id + '">';
      html += '<div class="p-head">' + avatarHtml(p.author) +
        '<div class="p-who"><div class="p-name">' + authorLabel(p.author) +
        (p.isNotice ? ' <span class="chip-notice">📌 공지</span>' : "") +
        '</div><div class="p-time">' + fmtTime(p.createdAt) + "</div></div>" +
        '<div class="p-tools">' +
        (isT ? '<button title="공지 고정" onclick="IB.toggleNotice(' + p.id + ',' + (p.isNotice ? "false" : "true") + ')">📌</button>' : "") +
        ((isT || isMine(p.author)) ? '<button title="지우기" onclick="IB.deletePost(' + p.id + ')">🗑</button>' : "") +
        "</div></div>";
      if (p.text) html += '<div class="p-text">' + linkify(p.text) + "</div>";
      for (const f of p.files) {
        if (f.isImage)
          html += '<img class="p-img" loading="lazy" src="/api/file/' + f.id + '" alt="' + esc(f.name) + '" onclick="IB.zoom(\\'' + f.id + "')\\">";
        else
          html += '<a class="p-file" href="/api/file/' + f.id + '">📎 ' + esc(f.name) + "</a>";
      }
      html += '<div class="p-foot">' +
        '<button class="' + (p.liked ? "liked" : "") + '" onclick="IB.toggleLike(' + p.id + ')">' +
        (p.liked ? "❤️" : "🤍") + ' <span id="likec-' + p.id + '">' + p.likeCount + "</span></button>" +
        '<button onclick="IB.toggleComments(' + p.id + ')">💬 ' + p.comments.length + "</button></div>";
      // 댓글
      html += '<div class="comments" id="cmts-' + p.id + '" hidden>';
      for (const c of p.comments) {
        html += '<div class="cmt"><div class="c-body"><span class="c-name">' + authorLabel(c.author) + "</span>" +
          esc(c.text) + '<span class="c-time">' + fmtTime(c.createdAt) + "</span>" +
          ((isT || isMine(c.author)) ? ' <button class="c-del" onclick="IB.deleteComment(' + c.id + ')">✕</button>' : "") +
          "</div></div>";
      }
      html += '<div class="cmt-input"><input id="ci-' + p.id + '" maxlength="500" placeholder="댓글 쓰기..." ' +
        'onkeydown="if(event.key===\\'Enter\\')IB.addComment(' + p.id + ')">' +
        '<button onclick="IB.addComment(' + p.id + ')">등록</button></div></div>';
      html += "</div>";
    }
    wrap.innerHTML = html;
    $("bd-empty").hidden = BOARD.posts.length > 0;
  }
  async function refreshBoard() {
    if (BOARD) await openBoard(BOARD.board.id);
  }

  function toggleComments(pid) {
    const el = $("cmts-" + pid);
    el.hidden = !el.hidden;
    if (!el.hidden) { const i = $("ci-" + pid); if (i) i.focus(); }
  }
  function toggleLike(pid) {
    guard((async () => {
      await api("/api/like/toggle", { postId: pid });
      await refreshBoard();
    })());
  }
  function addComment(pid) {
    const inp = $("ci-" + pid);
    const text = inp.value.trim();
    if (!text) return;
    guard((async () => {
      await api("/api/comment/create", { postId: pid, text });
      await refreshBoard();
      const el = $("cmts-" + pid);
      if (el) el.hidden = false;
    })());
  }
  function deleteComment(cid) {
    if (!confirm("이 댓글을 지울까요?")) return;
    guard((async () => {
      await api("/api/comment/delete", { commentId: cid });
      await refreshBoard();
    })());
  }
  function deletePost(pid) {
    if (!confirm("이 글을 지울까요? 붙어 있는 사진·파일도 함께 지워져요.")) return;
    guard((async () => {
      await api("/api/post/delete", { postId: pid });
      await refreshBoard();
      toast("글을 지웠어요");
    })());
  }
  function toggleNotice(pid, on) {
    guard((async () => {
      await api("/api/post/notice", { postId: pid, isNotice: on });
      await refreshBoard();
    })());
  }
  function zoom(fileId) {
    $("lightbox-img").src = "/api/file/" + fileId;
    show("lightbox");
  }

  // ── 글쓰기 ──
  function openComposer() {
    attachments = [];
    $("cmp-text").value = "";
    $("cmp-notice").checked = false;
    $("cmp-notice-row").hidden = ME.type !== "teacher";
    renderAttach();
    show("md-compose");
    $("cmp-text").focus();
  }
  function closeComposer() { hide("md-compose"); }
  function renderAttach() {
    const w = $("cmp-attach");
    let html = "";
    attachments.forEach((a, i) => {
      html += '<div class="att">' +
        (a.isImage ? '<img src="' + a.data + '" alt="">'
          : '<span class="att-file">📎 ' + esc(a.name) + "</span>") +
        '<button class="rm" onclick="IB.removeAttach(' + i + ')">✕</button></div>';
    });
    w.innerHTML = html;
  }
  function removeAttach(i) { attachments.splice(i, 1); renderAttach(); }

  // 사진: 기기에서 자동 압축 (최대 1280px, JPEG)
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1280;
        let w = img.width, h = img.height;
        if (Math.max(w, h) > MAX) {
          const k = MAX / Math.max(w, h);
          w = Math.round(w * k); h = Math.round(h * k);
        }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const cx = cv.getContext("2d");
        cx.fillStyle = "#fff";
        cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 읽을 수 없어요")); };
      img.src = url;
    });
  }
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("파일을 읽을 수 없어요"));
      r.readAsDataURL(file);
    });
  }
  async function onPhotoPick(ev) {
    for (const f of ev.target.files) {
      if (attachments.length >= 4) { toast("첨부는 4개까지예요"); break; }
      try {
        const data = await compressImage(f);
        attachments.push({ name: f.name || "사진.jpg", mime: "image/jpeg", data, isImage: true });
      } catch (e) { toast(e.message); }
    }
    ev.target.value = "";
    renderAttach();
  }
  async function onFilePick(ev) {
    for (const f of ev.target.files) {
      if (attachments.length >= 4) { toast("첨부는 4개까지예요"); break; }
      if (f.size > 1024 * 1024) { toast('"' + f.name + '" 는 1MB가 넘어서 올릴 수 없어요'); continue; }
      try {
        if (f.type.startsWith("image/")) {
          const data = await compressImage(f);
          attachments.push({ name: f.name, mime: "image/jpeg", data, isImage: true });
        } else {
          const data = await readFileAsDataURL(f);
          attachments.push({ name: f.name, mime: f.type || "application/octet-stream", data, isImage: false });
        }
      } catch (e) { toast(e.message); }
    }
    ev.target.value = "";
    renderAttach();
  }
  function submitPost() {
    const text = $("cmp-text").value.trim();
    if (!text && attachments.length === 0) { toast("내용을 쓰거나 사진·그림·파일을 붙여 주세요"); return; }
    const btn = $("cmp-submit");
    btn.disabled = true; btn.textContent = "올리는 중...";
    guard((async () => {
      try {
        await api("/api/post/create", {
          boardId: BOARD.board.id,
          text,
          files: attachments.map(a => ({ name: a.name, data: a.data })),
          isNotice: $("cmp-notice").checked,
        });
        closeComposer();
        await refreshBoard();
        toast("아이디어를 올렸어요! 🎉");
      } finally {
        btn.disabled = false; btn.textContent = "올리기";
      }
    })());
  }

  // ── 그리기 캔버스 ──
  const DRAW_COLORS = ["#2d3436", "#e74c3c", "#ff9f1a", "#f9ca24", "#2ecc71", "#3498db", "#9b59b6", "#e84393", "#8d6e63"];
  let drawCtx = null, strokes = [], curStroke = null, drawColor = DRAW_COLORS[0], drawWidth = 9, eraserOn = false;
  function initDraw() {
    const cv = $("draw-canvas");
    drawCtx = cv.getContext("2d");
    const colorWrap = $("draw-colors");
    colorWrap.innerHTML = DRAW_COLORS.map((c, i) =>
      '<button class="dot' + (i === 0 ? " on" : "") + '" style="background:' + c + '" data-c="' + c + '" onclick="IB.drawColor(this)"></button>').join("");
    const pos = ev => {
      const r = cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height };
    };
    cv.addEventListener("pointerdown", ev => {
      ev.preventDefault();
      try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
      curStroke = { color: eraserOn ? "#ffffff" : drawColor, width: eraserOn ? drawWidth * 3 : drawWidth, pts: [pos(ev)] };
    });
    cv.addEventListener("pointermove", ev => {
      if (!curStroke) return;
      curStroke.pts.push(pos(ev));
      redraw();
      paintStroke(curStroke);
    });
    const up = () => {
      if (!curStroke) return;
      strokes.push(curStroke);
      curStroke = null;
      redraw();
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
  }
  function paintStroke(s) {
    drawCtx.strokeStyle = s.color;
    drawCtx.lineWidth = s.width;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";
    drawCtx.beginPath();
    s.pts.forEach((p, i) => i === 0 ? drawCtx.moveTo(p.x, p.y) : drawCtx.lineTo(p.x, p.y));
    if (s.pts.length === 1) drawCtx.lineTo(s.pts[0].x + .01, s.pts[0].y);
    drawCtx.stroke();
  }
  function redraw() {
    const cv = $("draw-canvas");
    drawCtx.fillStyle = "#ffffff";
    drawCtx.fillRect(0, 0, cv.width, cv.height);
    for (const s of strokes) paintStroke(s);
  }
  function openDraw() {
    if (attachments.length >= 4) { toast("첨부는 4개까지예요"); return; }
    strokes = []; curStroke = null; eraserOn = false;
    $("draw-eraser").classList.remove("on");
    if (!drawCtx) initDraw();
    redraw();
    show("md-draw");
  }
  function closeDraw() { hide("md-draw"); }
  function drawColorPick(btn) {
    drawColor = btn.dataset.c;
    eraserOn = false;
    $("draw-eraser").classList.remove("on");
    document.querySelectorAll("#draw-colors .dot").forEach(d => d.classList.toggle("on", d === btn));
  }
  function drawSize(sz, btn) {
    drawWidth = sz;
    document.querySelectorAll(".szbtn[data-sz]").forEach(b => b.classList.toggle("on", b === btn));
  }
  function drawEraser(btn) {
    eraserOn = !eraserOn;
    btn.classList.toggle("on", eraserOn);
  }
  function drawUndo() { strokes.pop(); redraw(); }
  function drawClear() { strokes = []; redraw(); }
  function finishDraw() {
    if (strokes.length === 0) { toast("아직 아무것도 그리지 않았어요"); return; }
    const data = $("draw-canvas").toDataURL("image/png");
    attachments.push({ name: "그림.png", mime: "image/png", data, isImage: true });
    renderAttach();
    hide("md-draw");
    toast("그림을 붙였어요! 🎨");
  }

  // ── 쪽지 ──
  function setBadge(n) {
    const b = $("hd-badge");
    b.hidden = !n;
    b.textContent = n > 99 ? "99+" : n;
  }
  function openMsgs() {
    const sel = $("msg-to");
    if (ME.type === "teacher") {
      // 교사: 받을 학생 선택
      $("msg-to-label").textContent = "쪽지 보내기 — 받을 사람";
      sel.hidden = false;
      sel.innerHTML = '<option value="all">📢 전체 학생</option>' +
        (HOME.students || []).map(s => '<option value="' + s.id + '">' + s.number + "번 " + esc(s.name) + "</option>").join("");
    } else {
      // 학생: 선생님이 여러 명이면 받을 선생님 선택, 한 명이면 자동
      const teachers = HOME.teacherList || [];
      if (teachers.length > 1) {
        $("msg-to-label").textContent = "쪽지 보낼 선생님을 골라 주세요 (고민 상담, 하고 싶은 말 무엇이든!)";
        sel.hidden = false;
        sel.innerHTML = teachers.map(t => '<option value="' + t.id + '">' + esc(t.name) + " 선생님</option>").join("");
      } else {
        $("msg-to-label").textContent = "선생님께 쪽지 보내기 (고민 상담, 하고 싶은 말 무엇이든!)";
        sel.hidden = true;
      }
    }
    $("msg-text").value = "";
    show("md-msgs");
    guard(loadMsgs());
  }
  async function loadMsgs() {
    const r = await api("/api/msg/list");
    msgCache = r.messages;
    renderMsgs();
    // 받은쪽지 탭을 열면 읽음 처리
    const unreadIds = msgCache.filter(m => m.received && !m.read).map(m => m.id);
    if (unreadIds.length) {
      await api("/api/msg/read", { ids: unreadIds });
      setBadge(0);
    }
  }
  function msgTab(t) {
    msgTabName = t;
    $("mt-recv").classList.toggle("on", t === "recv");
    $("mt-sent").classList.toggle("on", t === "sent");
    renderMsgs();
  }
  function renderMsgs() {
    const list = msgCache.filter(m => msgTabName === "recv" ? m.received : !m.received);
    $("msg-list").innerHTML = list.length === 0
      ? '<div style="text-align:center;color:#aab;padding:20px 0;font-size:13px">쪽지가 없어요</div>'
      : list.map(m => {
        const fromName = m.from.name + (m.from.type === "teacher" ? " 선생님" : "");
        const toName = m.toName + (m.toType === "teacher" ? " 선생님" : "");
        return '<div class="msg-item' + (m.received && !m.read ? " unread" : "") + '">' +
          '<div class="msg-meta">' +
          (msgTabName === "recv" ? "<b>" + esc(fromName) + "</b> 님이 보냄" : "<b>" + esc(toName) + "</b> 님에게 보냄") +
          "<span>" + fmtTime(m.createdAt) + "</span></div>" +
          '<div class="msg-text">' + esc(m.text) + "</div></div>";
      }).join("");
  }
  function sendMsg() {
    const text = $("msg-text").value.trim();
    if (!text) { toast("쪽지 내용을 써 주세요"); return; }
    guard((async () => {
      const body = { text };
      // 교사는 항상, 학생은 선생님 선택칸이 보일 때(선생님 여러 명)만 받는 사람을 넣음
      if (!$("msg-to").hidden) body.to = $("msg-to").value;
      await api("/api/msg/send", body);
      $("msg-text").value = "";
      toast("쪽지를 보냈어요 💌");
      await loadMsgs();
      msgTab("sent");
    })());
  }

  // ── 새 쪽지 팝업 (주기 확인) ──
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(poll, 15000);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  async function poll() {
    if (!AUTH) return;
    try {
      const r = await api("/api/poll");
      setBadge(r.unread);
      // 쪽지함이 열려 있으면 팝업 대신 목록 갱신
      if (r.messages.length && $("md-msgs").hidden && $("md-popup").hidden) {
        popupIds = r.messages.map(m => m.id);
        $("popup-list").innerHTML = r.messages.map(m => {
          const fromName = m.from.name + (m.from.type === "teacher" ? " 선생님" : "");
          return '<div class="msg-item unread"><div class="msg-meta"><b>' + esc(fromName) +
            "</b> 님이 보냄 <span>" + fmtTime(m.createdAt) + "</span></div>" +
            '<div class="msg-text">' + esc(m.text) + "</div></div>";
        }).join("");
        show("md-popup");
      }
    } catch (e) { /* 네트워크 일시 오류는 조용히 넘어감 */ }
  }
  function ackPopup() {
    guard((async () => {
      await api("/api/msg/read", { ids: popupIds });
      popupIds = [];
      hide("md-popup");
      setBadge(0);
    })());
  }

  // ── 교사: 게시판 관리 ──
  let editingBoardId = null;
  function newBoard() {
    editingBoardId = null;
    $("mb-title").firstChild.textContent = "새 게시판 ";
    $("mb-name").value = "";
    $("mb-desc").value = "";
    show("md-board");
    $("mb-name").focus();
  }
  function editBoard(id) {
    const b = HOME.boards.find(x => x.id === id);
    if (!b) return;
    editingBoardId = id;
    $("mb-title").firstChild.textContent = "게시판 고치기 ";
    $("mb-name").value = b.title;
    $("mb-desc").value = b.desc || "";
    show("md-board");
  }
  function saveBoard() {
    guard((async () => {
      const title = $("mb-name").value.trim();
      const desc = $("mb-desc").value.trim();
      if (editingBoardId) await api("/api/teacher/board/update", { boardId: editingBoardId, title, desc });
      else await api("/api/teacher/board/create", { title, desc });
      hide("md-board");
      await loadHome();
      toast("저장했어요");
    })());
  }
  function deleteBoard(id) {
    const b = HOME.boards.find(x => x.id === id);
    if (!b) return;
    if (!confirm('"' + b.title + '" 게시판을 지울까요?\\n안에 있는 글과 사진이 모두 지워져요!')) return;
    guard((async () => {
      await api("/api/teacher/board/delete", { boardId: id });
      await loadHome();
      toast("게시판을 지웠어요");
    })());
  }

  // ── 교사: 학생 관리 ──
  function openStudents() {
    const rows = (HOME.students || []).map(s =>
      studentRowHtml(s.id, s.number, s.name, s.pin)).join("");
    $("stu-rows").innerHTML = rows;
    if (!rows) addStudentRow();
    show("md-students");
  }
  function studentRowHtml(id, number, name, pin) {
    return '<tr data-id="' + (id || "") + '">' +
      '<td><input type="number" class="st-no" min="1" value="' + (number || "") + '"></td>' +
      '<td><input type="text" class="st-name" maxlength="20" value="' + esc(name || "") + '"></td>' +
      '<td><input type="text" class="st-pin" maxlength="4" inputmode="numeric" value="' + esc(pin || "0000") + '"></td>' +
      '<td style="white-space:nowrap">' +
      (id ? '<button class="pf" title="포트폴리오 보기" onclick="IB.openPortfolio(' + id + ')">📁</button>' : "") +
      '<button class="del" onclick="this.closest(\\'tr\\').remove()">🗑</button></td></tr>';
  }
  function addStudentRow() {
    const tbody = $("stu-rows");
    const nums = [...tbody.querySelectorAll(".st-no")].map(i => Number(i.value) || 0);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    tbody.insertAdjacentHTML("beforeend", studentRowHtml("", next, "", "0000"));
    tbody.lastElementChild.querySelector(".st-name").focus();
  }
  function saveStudents() {
    const rows = [...$("stu-rows").querySelectorAll("tr")];
    const students = rows.map(tr => ({
      id: tr.dataset.id ? Number(tr.dataset.id) : undefined,
      number: Number(tr.querySelector(".st-no").value),
      name: tr.querySelector(".st-name").value.trim(),
      pin: tr.querySelector(".st-pin").value.trim(),
    }));
    guard((async () => {
      const r = await api("/api/teacher/students/save", { students });
      hide("md-students");
      await loadHome();
      toast("학생 " + r.count + "명을 저장했어요");
    })());
  }

  // ── 교사: 학생 포트폴리오 + PDF ──
  let portfolio = null;
  function openPortfolio(studentId) {
    guard((async () => {
      const r = await api("/api/teacher/portfolio", { studentId });
      portfolio = r;
      $("pf-title").textContent = "📁 " + r.student.number + "번 " + r.student.name + " 포트폴리오";
      $("pf-content").innerHTML = portfolioHtml(r, false);
      show("md-portfolio");
    })());
  }
  function portfolioHtml(r, forPrint) {
    const s = r.stats;
    let h = "";
    if (forPrint) {
      h += '<div class="pf-print-head"><h1>' + esc(r.student.number + "번 " + r.student.name) + " 포트폴리오</h1>" +
        '<div class="sub">' + esc(r.className) + " · 출력일 " + fmtTime(r.generatedAt) + "</div></div>";
    }
    h += '<div class="pf-stats">' +
      '<div class="pf-stat"><b>' + s.postCount + '</b><span>올린 글</span></div>' +
      '<div class="pf-stat"><b>' + s.fileCount + '</b><span>사진·파일</span></div>' +
      '<div class="pf-stat"><b>' + s.likeTotal + '</b><span>받은 좋아요</span></div>' +
      '<div class="pf-stat"><b>' + s.commentCount + '</b><span>쓴 댓글</span></div></div>';

    h += '<div class="pf-section-title">📝 올린 글 (' + r.posts.length + ")</div>";
    if (r.posts.length === 0) h += '<div class="pf-empty">아직 올린 글이 없어요.</div>';
    for (const p of r.posts) {
      h += '<div class="pf-item"><div class="pf-meta"><b>' + esc(p.boardTitle) + "</b> · " +
        fmtTime(p.createdAt) + (p.isNotice ? " · 📌공지" : "") + " · ❤️ " + p.likeCount + "</div>";
      if (p.text) h += '<div class="pf-text">' + (forPrint ? esc(p.text) : linkify(p.text)) + "</div>";
      for (const f of p.files) {
        if (f.isImage) h += '<img loading="lazy" src="/api/file/' + f.id + '" alt="' + esc(f.name) + '">';
        else h += '<a class="pf-file" href="/api/file/' + f.id + '">📎 ' + esc(f.name) + "</a>";
      }
      if (p.comments.length) {
        h += '<div class="pf-cmts">';
        for (const c of p.comments) {
          const cn = c.author.name + (c.author.type === "teacher" ? " 선생님" : "");
          h += '<div class="pf-c"><b>' + esc(cn) + ":</b> " + esc(c.text) + "</div>";
        }
        h += "</div>";
      }
      h += "</div>";
    }

    if (r.comments.length) {
      h += '<div class="pf-section-title">💬 다른 친구 글에 쓴 댓글 (' + r.comments.length + ")</div>";
      for (const c of r.comments) {
        h += '<div class="pf-item"><div class="pf-meta"><b>' + esc(c.onBoard) + "</b> · " +
          fmtTime(c.createdAt) + ' · "' + esc(c.onPost) + '" 글에</div>' +
          '<div class="pf-text">' + esc(c.text) + "</div></div>";
      }
    }
    return h;
  }
  function printPortfolio() {
    if (!portfolio) return;
    $("print-area").innerHTML = portfolioHtml(portfolio, true);
    // 인쇄 대화상자에서 "PDF로 저장"을 고르면 파일로 저장됩니다
    setTimeout(() => window.print(), 150);
  }

  // ── 교사: 선생님 계정 관리 ──
  function openTeachers() {
    const rows = (HOME.teachers || []).map(t =>
      teacherRowHtml(t.id, t.name, t.loginId, t.pw)).join("");
    $("tch-rows").innerHTML = rows;
    if (!rows) addTeacherRow();
    show("md-teachers");
  }
  function teacherRowHtml(id, name, loginId, pw) {
    return '<tr data-id="' + (id || "") + '">' +
      '<td><input type="text" class="tc-name" maxlength="20" value="' + esc(name || "") + '" placeholder="예: 김담임"></td>' +
      '<td><input type="text" class="tc-login" maxlength="30" value="' + esc(loginId || "") + '" placeholder="예: kim" autocomplete="off"></td>' +
      '<td><input type="text" class="tc-pw" value="' + esc(pw || "") + '" placeholder="4자 이상"></td>' +
      '<td><button class="del" onclick="this.closest(\\'tr\\').remove()">🗑</button></td></tr>';
  }
  function addTeacherRow() {
    const tbody = $("tch-rows");
    tbody.insertAdjacentHTML("beforeend", teacherRowHtml("", "", "", ""));
    tbody.lastElementChild.querySelector(".tc-name").focus();
  }
  function saveTeachers() {
    const rows = [...$("tch-rows").querySelectorAll("tr")];
    if (rows.length === 0) { toast("선생님은 최소 한 명은 있어야 해요"); return; }
    const teachers = rows.map(tr => ({
      id: tr.dataset.id ? Number(tr.dataset.id) : undefined,
      name: tr.querySelector(".tc-name").value.trim(),
      loginId: tr.querySelector(".tc-login").value.trim(),
      pw: tr.querySelector(".tc-pw").value.trim(),
    }));
    guard((async () => {
      const r = await api("/api/teacher/teachers/save", { teachers });
      hide("md-teachers");
      // 내 계정 정보(비번 등)가 바뀌었을 수 있으니, 지금 로그인 정보가 아직 유효한지 확인
      try {
        await loadHome();
        toast("선생님 " + r.count + "명을 저장했어요");
      } catch (e) {
        toast("내 로그인 정보가 바뀌었어요. 다시 로그인해 주세요.");
        doLogout();
      }
    })());
  }

  // ── 교사: 설정 ──
  function openSettings() {
    $("set-classname").value = HOME.className || "";
    $("set-classcode").value = HOME.classCode || "";
    $("set-newpw").value = "";
    show("md-settings");
  }
  function saveSettings() {
    guard((async () => {
      await api("/api/teacher/settings/save", {
        className: $("set-classname").value.trim(),
        classCode: $("set-classcode").value.trim(),
        newPw: $("set-newpw").value.trim(),
      });
      hide("md-settings");
      await loadHome();
      toast("설정을 저장했어요");
    })());
  }

  // ── 시작 ──
  function boot() {
    $("cmp-photo").addEventListener("change", onPhotoPick);
    $("cmp-file").addEventListener("change", onFilePick);
    $("in-class").value = localStorage.getItem("ideaboard_class") || "6-1";
    // /teacher.html 로 들어오면 교사 탭 먼저
    if (location.pathname.indexOf("teacher") >= 0) setRole("teacher");
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try { AUTH = JSON.parse(saved); } catch (e) { AUTH = null; }
      if (AUTH) {
        enterApp().catch(() => { doLogout(); });
        return;
      }
    }
  }
  document.addEventListener("DOMContentLoaded", boot);

  return {
    setRole, login, logout, goHome, openBoard,
    toggleComments, toggleLike, addComment, deleteComment, deletePost, toggleNotice, zoom,
    openComposer, closeComposer, removeAttach, submitPost,
    openDraw, closeDraw, drawColor: drawColorPick, drawSize, drawEraser, drawUndo, drawClear, finishDraw,
    openMsgs, msgTab, sendMsg, ackPopup,
    newBoard, editBoard, saveBoard, deleteBoard,
    openStudents, addStudentRow, saveStudents,
    openPortfolio, printPortfolio,
    openTeachers, addTeacherRow, saveTeachers,
    openSettings, saveSettings,
    hide,
  };
})();
</script>
</body>
</html>
`;

// ── 기본 데이터 ──
function defaultState() {
  return {
    seq: 100,
    settings: {
      classCode: "6-1",
      className: "우리 반 아이디어 보드",
    },
    // 선생님 계정(여러 명 가능). 각자 아이디·비밀번호·이름으로 로그인해 글·쪽지가 구분됨
    teachers: [{ id: 1, loginId: "teacher", pw: "0000", name: "선생님" }],
    students: [],  // {id, number, name, pin, active}
    boards: [],    // {id, title, desc, createdAt}
    posts: [],     // {id, boardId, author:{type,id,name}, text, files:[{id,name,mime,isImage}], isNotice, createdAt}
    comments: [],  // {id, postId, author:{type,id,name}, text, createdAt}
    likes: [],     // {postId, key}   key = "t<교사id>" | "s<학생id>"
    messages: [],  // {id, from:{type,id,name}, toType:"student"|"teacher", toId, text, createdAt, read}
  };
}

// 예전(교사 1명) 데이터를 새 구조(teachers 배열)로 맞춰 줌
function migrate(st) {
  if (!Array.isArray(st.teachers) || st.teachers.length === 0) {
    const s = st.settings || {};
    st.teachers = [{ id: 1, loginId: s.teacherId || "teacher", pw: s.teacherPw || "0000", name: "선생님" }];
  }
  if (st.settings) { delete st.settings.teacherId; delete st.settings.teacherPw; }
  if ((st.seq | 0) < 100) st.seq = 100;
  return st;
}

// ── 한국 시간 (Worker 는 UTC 로 돌므로 반드시 서울 기준으로 변환) ──
function kst() {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date());
  return { date: s.slice(0, 10), time: s.slice(11, 16), datetime: s };
}

// ── 공통 도우미 ──
function nextId(st) { st.seq = (st.seq | 0) + 1; return st.seq; }
function randId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += b.toString(16).padStart(2, "0");
  return s;
}
function findTeacher(st, auth) {
  if (!auth) return null;
  return (st.teachers || []).find(t =>
    String(t.loginId) === String(auth.id) && String(t.pw) === String(auth.pw)) || null;
}
function authStudent(st, auth) {
  if (!auth) return null;
  if (String(auth.classCode) !== String(st.settings.classCode)) return null;
  return st.students.find(s =>
    Number(s.number) === Number(auth.number) && String(s.pin) === String(auth.pin) && s.active) || null;
}
// 요청의 auth 로 행위자(교사/학생)를 판별
function getActor(st, auth) {
  if (!auth) return null;
  if (auth.role === "teacher") {
    const t = findTeacher(st, auth);
    return t ? { type: "teacher", id: t.id, name: t.name } : null;
  }
  const s = authStudent(st, auth);
  return s ? { type: "student", id: s.id, name: s.name, number: s.number } : null;
}
function likeKey(actor) { return (actor.type === "teacher" ? "t" : "s") + actor.id; }
function sameAuthor(actor, author) {
  return author && author.type === actor.type && Number(author.id) === Number(actor.id);
}

// ── 첨부 파일 검사 (data URL → {id,name,mime,isImage,dataB64}) ──
const MAX_FILES = 4;            // 글 1개당 첨부 수
const MAX_B64 = 1500000;        // 파일 1개당 base64 길이 (~1.1MB 원본)
const MAX_TOTAL_B64 = 4000000;  // 글 1개당 합계
function parseFiles(list) {
  if (!Array.isArray(list) || list.length === 0) return { files: [] };
  if (list.length > MAX_FILES) return { error: "첨부는 한 번에 " + MAX_FILES + "개까지예요." };
  const files = [];
  let total = 0;
  for (const f of list) {
    const m = /^data:([^;,]+);base64,(.+)$/s.exec(String(f && f.data || ""));
    if (!m) return { error: "첨부 파일 형식이 올바르지 않아요." };
    if (m[2].length > MAX_B64) return { error: "파일이 너무 커요. 1MB 이하만 올릴 수 있어요." };
    total += m[2].length;
    if (total > MAX_TOTAL_B64) return { error: "첨부 파일이 전부 합쳐서 너무 커요." };
    const mime = m[1].toLowerCase();
    files.push({
      id: randId(),
      name: String(f.name || "파일").slice(0, 120),
      mime,
      isImage: mime.startsWith("image/"),
      dataB64: m[2],
    });
  }
  return { files };
}

// ── 용량 관리 ──
function prune(st) {
  if (st.messages.length > 600) {
    let excess = st.messages.length - 600;
    st.messages = st.messages.filter(m => {
      if (excess > 0 && m.read) { excess--; return false; }
      return true;
    });
    if (st.messages.length > 800) st.messages = st.messages.slice(-800);
  }
}

// ── API 처리 ──
function fail(msg, status = 400) { return { status, body: { ok: false, error: msg } }; }
function ok(obj) { return { status: 200, body: Object.assign({ ok: true }, obj) }; }

function unreadOf(st, actor) {
  return st.messages.filter(m => !m.read &&
    (actor.type === "teacher"
      ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
      : (m.toType === "student" && Number(m.toId) === Number(actor.id))));
}

function postView(st, p, actor) {
  const likes = st.likes.filter(l => l.postId === p.id);
  return {
    id: p.id, boardId: p.boardId, author: p.author, text: p.text,
    files: p.files, isNotice: !!p.isNotice, createdAt: p.createdAt,
    likeCount: likes.length,
    liked: likes.some(l => l.key === likeKey(actor)),
    comments: st.comments.filter(c => c.postId === p.id)
      .map(c => ({ id: c.id, author: c.author, text: c.text, createdAt: c.createdAt })),
  };
}

function handleApi(st, path, method, d) {
  if (method !== "POST") return fail("없는 주소입니다.", 404);

  // ══════════ 로그인 ══════════
  if (path === "/api/login") {
    if (d.role === "teacher") {
      const t = findTeacher(st, { id: d.id, pw: d.pw });
      if (t) return ok({ id: t.id, name: t.name });
      return fail("아이디 또는 비밀번호가 맞지 않습니다.", 401);
    }
    const stu = authStudent(st, { classCode: d.classCode, number: d.number, pin: d.pin });
    if (stu) return ok({ id: stu.id, number: stu.number, name: stu.name });
    return fail("학급 코드, 번호, PIN을 다시 확인하세요.", 401);
  }

  const actor = getActor(st, d.auth);
  if (!actor) return fail("로그인이 필요합니다.", 401);
  const isTeacher = actor.type === "teacher";

  // ══════════ 홈 (게시판 목록) ══════════
  if (path === "/api/home") {
    const boards = st.boards.map(b => ({
      id: b.id, title: b.title, desc: b.desc, createdAt: b.createdAt,
      postCount: st.posts.filter(p => p.boardId === b.id).length,
    }));
    const res = {
      className: st.settings.className,
      me: { type: actor.type, id: actor.id, name: actor.name },
      boards, unread: unreadOf(st, actor).length,
      // 이름·id만 (비밀번호 제외) — 학생이 쪽지 받을 선생님을 고를 때 사용
      teacherList: st.teachers.map(t => ({ id: t.id, name: t.name })),
    };
    if (isTeacher) {
      res.students = st.students.filter(s => s.active)
        .map(s => ({ id: s.id, number: s.number, name: s.name, pin: s.pin }))
        .sort((a, b) => a.number - b.number);
      res.classCode = st.settings.classCode;
      // 선생님 계정 관리용 (교사에게만 비밀번호 포함)
      res.teachers = st.teachers.map(t => ({ id: t.id, loginId: t.loginId, name: t.name, pw: t.pw }));
    }
    return ok(res);
  }

  // ══════════ 게시판 글 목록 ══════════
  if (path === "/api/board") {
    const b = st.boards.find(x => x.id === Number(d.boardId));
    if (!b) return fail("없는 게시판입니다.", 404);
    const posts = st.posts.filter(p => p.boardId === b.id)
      .sort((a, x) => (!!x.isNotice - !!a.isNotice) || (a.createdAt < x.createdAt ? 1 : -1) || (x.id - a.id))
      .map(p => postView(st, p, actor));
    return ok({
      board: { id: b.id, title: b.title, desc: b.desc },
      me: { type: actor.type, id: actor.id, name: actor.name },
      posts,
    });
  }

  // ══════════ 글 쓰기 ══════════
  if (path === "/api/post/create") {
    const b = st.boards.find(x => x.id === Number(d.boardId));
    if (!b) return fail("없는 게시판입니다.", 404);
    const text = String(d.text || "").trim().slice(0, 3000);
    const pf = parseFiles(d.files);
    if (pf.error) return fail(pf.error);
    if (!text && pf.files.length === 0) return fail("내용을 쓰거나 사진·그림·파일을 붙여 주세요.");
    const post = {
      id: nextId(st), boardId: b.id,
      author: { type: actor.type, id: actor.id, name: actor.name },
      text,
      files: pf.files.map(f => ({ id: f.id, name: f.name, mime: f.mime, isImage: f.isImage })),
      isNotice: isTeacher && !!d.isNotice,
      createdAt: kst().datetime,
    };
    st.posts.push(post);
    return Object.assign(ok({ post: postView(st, post, actor) }),
      { mutated: true, saveFiles: pf.files });
  }

  // ══════════ 글 지우기 (본인 또는 교사) ══════════
  if (path === "/api/post/delete") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, p.author)) return fail("자기가 쓴 글만 지울 수 있어요.", 403);
    const fileIds = p.files.map(f => f.id);
    st.posts = st.posts.filter(x => x.id !== p.id);
    st.comments = st.comments.filter(c => c.postId !== p.id);
    st.likes = st.likes.filter(l => l.postId !== p.id);
    return Object.assign(ok({}), { mutated: true, deleteFiles: fileIds });
  }

  // ══════════ 공지 고정 (교사) ══════════
  if (path === "/api/post/notice") {
    if (!isTeacher) return fail("선생님만 할 수 있어요.", 403);
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    p.isNotice = !!d.isNotice;
    return Object.assign(ok({ isNotice: p.isNotice }), { mutated: true });
  }

  // ══════════ 댓글 ══════════
  if (path === "/api/comment/create") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    const text = String(d.text || "").trim().slice(0, 500);
    if (!text) return fail("댓글 내용을 써 주세요.");
    const c = {
      id: nextId(st), postId: p.id,
      author: { type: actor.type, id: actor.id, name: actor.name },
      text, createdAt: kst().datetime,
    };
    st.comments.push(c);
    return Object.assign(ok({ comment: c }), { mutated: true });
  }
  if (path === "/api/comment/delete") {
    const c = st.comments.find(x => x.id === Number(d.commentId));
    if (!c) return fail("없는 댓글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, c.author)) return fail("자기가 쓴 댓글만 지울 수 있어요.", 403);
    st.comments = st.comments.filter(x => x.id !== c.id);
    return Object.assign(ok({}), { mutated: true });
  }

  // ══════════ 좋아요 ══════════
  if (path === "/api/like/toggle") {
    const p = st.posts.find(x => x.id === Number(d.postId));
    if (!p) return fail("없는 글입니다.", 404);
    const key = likeKey(actor);
    const has = st.likes.some(l => l.postId === p.id && l.key === key);
    if (has) st.likes = st.likes.filter(l => !(l.postId === p.id && l.key === key));
    else st.likes.push({ postId: p.id, key });
    return Object.assign(ok({
      liked: !has,
      likeCount: st.likes.filter(l => l.postId === p.id).length,
    }), { mutated: true });
  }

  // ══════════ 쪽지 ══════════
  if (path === "/api/msg/send") {
    const text = String(d.text || "").trim().slice(0, 1000);
    if (!text) return fail("쪽지 내용을 써 주세요.");
    const from = { type: actor.type, id: actor.id, name: actor.name };
    const now = kst().datetime;
    if (isTeacher) {
      if (d.to === "all") {
        const targets = st.students.filter(s => s.active);
        if (targets.length === 0) return fail("등록된 학생이 없어요.");
        for (const s of targets)
          st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      } else {
        const s = st.students.find(x => x.id === Number(d.to) && x.active);
        if (!s) return fail("받을 학생을 찾을 수 없어요.", 404);
        st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      }
    } else {
      // 학생 → 선생님. 받는 사람은 반드시 선생님(학생끼리 쪽지 불가).
      // 선생님이 여러 명이면 고른 선생님, 지정이 없거나 잘못됐고 선생님이 한 명뿐이면 그 선생님에게 자동 전송
      let target = null;
      if (d.to) target = st.teachers.find(t => t.id === Number(d.to));
      if (!target && st.teachers.length === 1) target = st.teachers[0];
      if (!target) return fail("쪽지를 보낼 선생님을 골라 주세요.", 400);
      st.messages.push({ id: nextId(st), from, toType: "teacher", toId: target.id, text, createdAt: now, read: false });
    }
    return Object.assign(ok({}), { mutated: true });
  }
  if (path === "/api/msg/list") {
    const teacherName = id => (st.teachers.find(t => t.id === Number(id)) || { name: "선생님" }).name;
    const toName = m => m.toType === "teacher" ? teacherName(m.toId)
      : (st.students.find(s => s.id === Number(m.toId)) || { name: "?" }).name;
    const receivedBy = m => actor.type === "teacher"
      ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
      : (m.toType === "student" && Number(m.toId) === Number(actor.id));
    const sentBy = m => m.from.type === actor.type && Number(m.from.id) === Number(actor.id);
    const mine = st.messages.filter(m => receivedBy(m) || sentBy(m))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1) || (b.id - a.id))
      .slice(0, 200)
      .map(m => ({
        id: m.id, from: m.from, toType: m.toType, toId: m.toId, toName: toName(m),
        text: m.text, createdAt: m.createdAt, read: !!m.read,
        received: receivedBy(m),
      }));
    return ok({ messages: mine });
  }
  if (path === "/api/msg/read") {
    const ids = Array.isArray(d.ids) ? d.ids.map(Number) : [];
    let changed = false;
    for (const m of st.messages) {
      const isMine = actor.type === "teacher"
        ? (m.toType === "teacher" && Number(m.toId) === Number(actor.id))
        : (m.toType === "student" && Number(m.toId) === Number(actor.id));
      if (isMine && !m.read && ids.includes(m.id)) { m.read = true; changed = true; }
    }
    if (!changed) return ok({});
    return Object.assign(ok({}), { mutated: true });
  }
  // 새 쪽지 확인 (학생·교사 화면이 주기적으로 호출 → 팝업 표시)
  if (path === "/api/poll") {
    const unread = unreadOf(st, actor)
      .sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
      .slice(0, 10)
      .map(m => ({ id: m.id, from: m.from, text: m.text, createdAt: m.createdAt }));
    return ok({ unread: unreadOf(st, actor).length, messages: unread });
  }

  // ══════════ 교사 전용 ══════════
  if (path.startsWith("/api/teacher/")) {
    if (!isTeacher) return fail("선생님만 할 수 있어요.", 403);

    if (path === "/api/teacher/board/create") {
      const title = String(d.title || "").trim().slice(0, 60);
      if (!title) return fail("게시판 이름을 써 주세요.");
      const b = { id: nextId(st), title, desc: String(d.desc || "").trim().slice(0, 200), createdAt: kst().datetime };
      st.boards.push(b);
      return Object.assign(ok({ board: b }), { mutated: true });
    }
    if (path === "/api/teacher/board/update") {
      const b = st.boards.find(x => x.id === Number(d.boardId));
      if (!b) return fail("없는 게시판입니다.", 404);
      const title = String(d.title || "").trim().slice(0, 60);
      if (!title) return fail("게시판 이름을 써 주세요.");
      b.title = title;
      b.desc = String(d.desc || "").trim().slice(0, 200);
      return Object.assign(ok({}), { mutated: true });
    }
    if (path === "/api/teacher/board/delete") {
      const b = st.boards.find(x => x.id === Number(d.boardId));
      if (!b) return fail("없는 게시판입니다.", 404);
      const posts = st.posts.filter(p => p.boardId === b.id);
      const fileIds = [];
      for (const p of posts) for (const f of p.files) fileIds.push(f.id);
      const postIds = new Set(posts.map(p => p.id));
      st.boards = st.boards.filter(x => x.id !== b.id);
      st.posts = st.posts.filter(p => p.boardId !== b.id);
      st.comments = st.comments.filter(c => !postIds.has(c.postId));
      st.likes = st.likes.filter(l => !postIds.has(l.postId));
      return Object.assign(ok({}), { mutated: true, deleteFiles: fileIds });
    }

    // 학생 명단 일괄 저장 (전달된 목록으로 교체)
    if (path === "/api/teacher/students/save") {
      if (!Array.isArray(d.students)) return fail("목록이 올바르지 않아요.");
      const seen = new Set();
      const next = [];
      for (const s of d.students) {
        const number = Number(s.number);
        const name = String(s.name || "").trim().slice(0, 20);
        const pin = String(s.pin || "").trim();
        if (!number || number < 1 || !name) return fail("번호와 이름을 모두 채워 주세요.");
        if (!/^\d{4}$/.test(pin)) return fail(number + "번 " + name + ": PIN은 숫자 4자리여야 해요.");
        if (seen.has(number)) return fail("번호 " + number + "가 겹쳐요.");
        seen.add(number);
        next.push({ id: s.id ? Number(s.id) : nextId(st), number, name, pin, active: true });
      }
      st.students = next.sort((a, b) => a.number - b.number);
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    // 학생 포트폴리오: 한 학생이 올린 글·자료·댓글을 모두 모아서 반환
    if (path === "/api/teacher/portfolio") {
      const stu = st.students.find(s => s.id === Number(d.studentId));
      if (!stu) return fail("학생을 찾을 수 없어요.", 404);
      const boardTitle = id => (st.boards.find(b => b.id === Number(id)) || { title: "(지워진 게시판)" }).title;
      const isMe = a => a && a.type === "student" && Number(a.id) === Number(stu.id);
      // 이 학생이 쓴 글 (오래된 → 최신)
      const posts = st.posts.filter(p => isMe(p.author))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(p => ({
          id: p.id, boardId: p.boardId, boardTitle: boardTitle(p.boardId),
          text: p.text, files: p.files, isNotice: !!p.isNotice, createdAt: p.createdAt,
          likeCount: st.likes.filter(l => l.postId === p.id).length,
          comments: st.comments.filter(c => c.postId === p.id)
            .map(c => ({ author: c.author, text: c.text, createdAt: c.createdAt })),
        }));
      // 이 학생이 남긴 댓글 (다른 사람 글에)
      const comments = st.comments.filter(c => isMe(c.author))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(c => {
          const p = st.posts.find(x => x.id === c.postId);
          return {
            text: c.text, createdAt: c.createdAt,
            onBoard: p ? boardTitle(p.boardId) : "(지워진 글)",
            onPost: p ? (p.text ? p.text.slice(0, 40) : "(사진/파일 글)") : "(지워진 글)",
          };
        });
      const fileCount = posts.reduce((n, p) => n + p.files.length, 0);
      const likeTotal = posts.reduce((n, p) => n + p.likeCount, 0);
      return ok({
        className: st.settings.className,
        student: { id: stu.id, number: stu.number, name: stu.name },
        posts, comments,
        stats: { postCount: posts.length, fileCount, likeTotal, commentCount: comments.length },
        generatedAt: kst().datetime,
      });
    }

    // 선생님 계정 명단 일괄 저장 (여러 명 등록 가능)
    if (path === "/api/teacher/teachers/save") {
      if (!Array.isArray(d.teachers)) return fail("목록이 올바르지 않아요.");
      const seen = new Set();
      const next = [];
      for (const t of d.teachers) {
        const loginId = String(t.loginId || "").trim().slice(0, 30);
        const name = String(t.name || "").trim().slice(0, 20);
        const pw = String(t.pw || "").trim();
        if (!loginId || !name) return fail("아이디와 이름을 모두 채워 주세요.");
        if (pw.length < 4) return fail(name + " 선생님: 비밀번호는 4자 이상이어야 해요.");
        if (seen.has(loginId)) return fail("아이디 '" + loginId + "'가 겹쳐요.");
        seen.add(loginId);
        next.push({ id: t.id ? Number(t.id) : nextId(st), loginId, pw, name });
      }
      if (next.length === 0) return fail("선생님은 최소 한 명은 있어야 해요.");
      st.teachers = next;
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    if (path === "/api/teacher/settings/save") {
      const classCode = String(d.classCode || "").trim().slice(0, 20);
      const className = String(d.className || "").trim().slice(0, 40);
      if (!classCode || !className) return fail("학급 코드와 이름을 채워 주세요.");
      st.settings.classCode = classCode;
      st.settings.className = className;
      if (d.newPw) {
        const pw = String(d.newPw).trim();
        if (pw.length < 4) return fail("새 비밀번호는 4자 이상이어야 해요.");
        const me = st.teachers.find(t => t.id === actor.id);  // 지금 로그인한 선생님 본인 비밀번호
        if (me) me.pw = pw;
      }
      return Object.assign(ok({}), { mutated: true });
    }
  }

  return fail("없는 주소입니다.", 404);
}

// ── D1 저장 (버전 잠금: 동시에 여러 명이 써도 기록이 사라지지 않음) ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS board_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, data TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS board_files (id TEXT PRIMARY KEY, name TEXT, mime TEXT, data TEXT NOT NULL)").run();
  schemaReady = true;
}
async function loadState(db) {
  const row = await db.prepare("SELECT version, data FROM board_state WHERE id = 1").first();
  if (!row) return { version: 0, state: defaultState() };
  return { version: row.version, state: migrate(JSON.parse(row.data)) };
}
async function saveState(db, version, state) {
  prune(state);
  const json = JSON.stringify(state);
  if (version === 0) {
    try {
      await db.prepare("INSERT INTO board_state (id, version, data) VALUES (1, 1, ?)").bind(json).run();
      return true;
    } catch (e) { return false; }
  }
  const r = await db.prepare("UPDATE board_state SET version = version + 1, data = ? WHERE id = 1 AND version = ?").bind(json, version).run();
  return r.meta && r.meta.changes === 1;
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
      if (path === "/" || path === "/index.html" || path === "/teacher.html")
        return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    // ── 첨부 파일 내려주기 (주소는 무작위 24자리라 추측 불가) ──
    if (method === "GET" && path.startsWith("/api/file/")) {
      try {
        await ensureSchema(env.DB);
        const id = path.slice("/api/file/".length);
        const row = await env.DB.prepare("SELECT name, mime, data FROM board_files WHERE id = ?").bind(id).first();
        if (!row) return new Response("404", { status: 404 });
        const bytes = Uint8Array.from(atob(row.data), c => c.charCodeAt(0));
        const headers = {
          "Content-Type": row.mime || "application/octet-stream",
          "Cache-Control": "public, max-age=31536000, immutable",
        };
        if (!(row.mime || "").startsWith("image/"))
          headers["Content-Disposition"] = "attachment; filename*=UTF-8''" + encodeURIComponent(row.name || "file");
        return new Response(bytes, { headers });
      } catch (e) {
        return new Response("파일 오류", { status: 500 });
      }
    }

    if (!path.startsWith("/api/")) return new Response("404", { status: 404 });

    let d = {};
    if (method === "POST") {
      try { d = await request.json(); } catch (e) { d = {}; }
    }

    try {
      await ensureSchema(env.DB);
      // 버전 충돌 시 다시 읽어 재시도 (최대 5회)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { version, state } = await loadState(env.DB);
        const r = handleApi(state, path, method, d);
        if (!r.mutated) return jsonResponse(r.body, r.status);
        if (await saveState(env.DB, version, state)) {
          // 상태 저장 성공 후 첨부 파일 반영 (재시도마다 id가 새로 나므로 마지막 것만 사용)
          if (r.saveFiles)
            for (const f of r.saveFiles)
              await env.DB.prepare("INSERT INTO board_files (id, name, mime, data) VALUES (?, ?, ?, ?)")
                .bind(f.id, f.name, f.mime, f.dataB64).run();
          if (r.deleteFiles)
            for (const id of r.deleteFiles)
              await env.DB.prepare("DELETE FROM board_files WHERE id = ?").bind(id).run();
          return jsonResponse(r.body, r.status);
        }
      }
      return jsonResponse({ ok: false, error: "저장이 겹쳤어요. 다시 시도해 주세요." }, 503);
    } catch (e) {
      return jsonResponse({ ok: false, error: "서버 오류: " + (e && e.message ? e.message : e) }, 500);
    }
  },
};
