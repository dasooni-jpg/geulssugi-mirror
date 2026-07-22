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
  /* ═══════════════════════════════════════════════════════════
     🎨 디자인(색) 설정 — 여기 값만 바꾸면 앱 전체 색이 바뀝니다!
     · --brand-1, --brand-2 : 상단 바·버튼의 그라데이션 두 색
     · --brand-3            : 로그인 배경 아래쪽 색
     · --accent            : 강조 글자색(이름·아이콘)
     · --action-1, -2       : '아이디어 올리기' 버튼 그라데이션
     · --page-bg           : 전체 배경색
     예) 초록 테마로: --brand-1:#2ecc71; --brand-2:#16a085; --accent:#0e8f6e;
     예) 분홍 테마로: --brand-1:#ff6aa2; --brand-2:#ff8f6b; --accent:#e0468a;
     ═══════════════════════════════════════════════════════════ */
  :root {
    --brand-1: #7c4dff;
    --brand-2: #448aff;
    --brand-3: #00bcd4;
    --accent:  #5b48e0;
    --action-1: #ff9048;
    --action-2: #ff5e7e;
    --page-bg: #f1f3f8;
    --ink: #2d3436;
    --brand-grad: linear-gradient(135deg, var(--brand-1), var(--brand-2));
    /* 반투명 유리(glass) 표면 — 카드·헤더·모달이 이 값을 함께 씀 */
    --glass: color-mix(in srgb, #ffffff 62%, transparent);
    --glass-strong: color-mix(in srgb, #ffffff 84%, transparent);
    --glass-border: color-mix(in srgb, #ffffff 55%, transparent);
    --glass-blur: blur(16px) saturate(160%);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: var(--page-bg); color: var(--ink); -webkit-tap-highlight-color: transparent;
    position: relative;
  }
  /* 반투명 카드 뒤로 은은하게 비치는 색 배경(블롭) */
  body::before {
    content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: .3;
    background:
      radial-gradient(720px circle at 6% -8%, var(--brand-1), transparent 60%),
      radial-gradient(680px circle at 102% 8%, var(--brand-3), transparent 55%),
      radial-gradient(620px circle at 25% 105%, var(--action-1), transparent 55%),
      radial-gradient(560px circle at 92% 98%, var(--action-2), transparent 55%);
  }
  button { font-family: inherit; cursor: pointer; border: none; background: none; font-size: 14px; }
  input, textarea, select { font-family: inherit; font-size: 15px; }
  [hidden] { display: none !important; }

  /* ── 로그인 ── */
  #scr-login {
    min-height: 100%; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--brand-1) 0%, var(--brand-2) 55%, var(--brand-3) 100%); padding: 20px;
  }
  .login-card {
    background: var(--glass-strong); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: 22px; padding: 34px 30px; width: 360px; max-width: 94vw;
    box-shadow: 0 18px 50px rgba(20, 20, 60, .35); text-align: center;
  }
  .login-mascot { width: 104px; height: 104px; object-fit: contain; display: block; margin: -8px auto 2px; filter: drop-shadow(0 5px 10px rgba(92,46,13,.22)); }
  .login-card h1 { font-size: 24px; margin-bottom: 4px; }
  .login-card .sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  .role-tabs { display: flex; gap: 6px; background: #eef0f6; border-radius: 12px; padding: 5px; margin-bottom: 18px; }
  .role-tabs button { flex: 1; padding: 9px 0; border-radius: 9px; font-weight: 700; color: #777; }
  .role-tabs button.on { background: #fff; color: var(--accent); box-shadow: 0 2px 6px rgba(0,0,0,.12); }
  .login-card input {
    width: 100%; padding: 12px 14px; margin-bottom: 10px; border: 2px solid #e3e6ef;
    border-radius: 11px; outline: none;
  }
  .login-card input:focus { border-color: var(--brand-1); }
  .btn-primary {
    background: var(--brand-grad); color: #fff; font-weight: 700;
    padding: 13px; border-radius: 12px; width: 100%; font-size: 16px;
  }
  .login-err { color: #e74c3c; font-size: 13px; min-height: 18px; margin-bottom: 8px; }
  .link-btn { display: block; width: 100%; margin-top: 12px; font-size: 13px; color: #778; text-decoration: underline; }
  .link-btn:hover { color: var(--accent); }
  .reg-tabs { display: flex; gap: 6px; background: #eef0f6; border-radius: 12px; padding: 5px; margin: 10px 0 14px; }
  .reg-tabs button { flex: 1; padding: 9px 0; border-radius: 9px; font-weight: 700; color: #777; font-size: 13px; }
  .reg-tabs button.on { background: #fff; color: var(--accent); box-shadow: 0 2px 6px rgba(0,0,0,.12); }
  .invite-box { background: #f2f4fb; border-radius: 12px; padding: 14px; text-align: center; margin-top: 8px; }
  .invite-box .code { font-size: 22px; font-weight: 800; letter-spacing: 3px; color: var(--accent); margin: 6px 0; }
  .invite-box .hint { font-size: 12px; color: #889; }

  /* ── 상단바 ── */
  header {
    position: sticky; top: 0; z-index: 30; color: #fff;
    background: linear-gradient(135deg,
      color-mix(in srgb, var(--brand-1) 82%, transparent),
      color-mix(in srgb, var(--brand-2) 82%, transparent));
    backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: 1px solid color-mix(in srgb, #fff 30%, transparent);
    display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    box-shadow: 0 3px 12px rgba(60, 60, 130, .25);
    text-shadow: 0 1px 3px rgba(0,0,0,.15);
  }
  .hd-mascot { width: 36px; height: 36px; object-fit: contain; flex: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.2)); }
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
    background: color-mix(in srgb, var(--board-tint, #fff) 45%, var(--glass) 55%);
    backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid color-mix(in srgb, var(--board-tint, #fff) 65%, white 20%);
    border-radius: 18px; padding: 20px 18px; min-height: 130px; cursor: pointer;
    display: flex; flex-direction: column; gap: 6px; position: relative;
    box-shadow: 0 4px 14px rgba(50, 50, 100, .1); transition: transform .12s;
    text-align: left;
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
  .board-new:hover { border-color: var(--brand-1); color: var(--brand-1); }
  .empty-note { text-align: center; color: #99a; padding: 40px 10px; font-size: 15px; }
  .empty-mascot { width: 120px; height: 120px; object-fit: contain; display: block; margin: 0 auto 12px; opacity: .92; }

  /* ── 게시판 화면 ── */
  .board-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
  .board-head h2 { font-size: 21px; }
  .board-head .desc { color: #778; font-size: 13px; width: 100%; }
  .btn-back {
    font-size: 20px; background: var(--glass-strong); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: 10px; padding: 6px 11px; box-shadow: 0 2px 8px rgba(0,0,0,.08);
  }
  .board-head-actions { margin-left: auto; display: flex; gap: 8px; }
  .btn-pdf {
    background: var(--glass-strong); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); color: var(--accent); font-weight: 800; padding: 10px 16px;
    border-radius: 12px; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,.08); white-space: nowrap;
  }
  .btn-write {
    background: linear-gradient(135deg, var(--action-1), var(--action-2)); color: #fff;
    font-weight: 800; padding: 10px 18px; border-radius: 12px; font-size: 15px;
    box-shadow: 0 4px 12px rgba(255, 100, 100, .35); white-space: nowrap;
  }
  .posts { columns: 300px; column-gap: 14px; }
  .post {
    background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: 16px; padding: 15px; margin-bottom: 14px;
    break-inside: avoid; box-shadow: 0 3px 12px rgba(50, 50, 100, .09);
  }
  .post.notice { border: 2.5px solid #ffc93c; background: color-mix(in srgb, #fffcf0 70%, transparent); }
  .chip-notice { background: #ffc93c; color: #6b4b00; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 99px; }
  .tag-teacher { background: #ece4ff; color: var(--accent); font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 99px; margin-left: 4px; }
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
  .p-time .edited { color: #b7bccb; font-size: 10px; }
  .like-adjust { display: inline-flex; align-items: center; gap: 2px; }
  .like-adjust button { font-size: 12px; color: var(--accent); padding: 4px 7px; border-radius: 8px; font-weight: 800; }
  .like-adjust .like-badge { font-size: 13px; font-weight: 700; color: #ff4d6d; padding: 0 3px; }
  .like-readonly { font-size: 13px; font-weight: 700; color: #ff8fa3; padding: 5px 9px; }
  .comments { margin-top: 8px; border-top: 1px dashed #e7e9f2; padding-top: 8px; }
  .cmt { display: flex; gap: 7px; margin-bottom: 7px; font-size: 13px; }
  .cmt .c-body { flex: 1; background: #f5f6fb; border-radius: 10px; padding: 6px 10px; }
  .cmt .c-name { font-weight: 700; font-size: 12px; margin-right: 4px; }
  .cmt .c-time { color: #aab; font-size: 10px; margin-left: 5px; }
  .cmt .c-del { color: #bbc; font-size: 12px; }
  .cmt-input { display: flex; gap: 6px; margin-top: 4px; }
  .cmt-input input { flex: 1; border: 1.5px solid #e3e6ef; border-radius: 9px; padding: 7px 10px; font-size: 13px; outline: none; }
  .cmt-input input:focus { border-color: var(--brand-1); }
  .cmt-input button { background: var(--brand-1); color: #fff; border-radius: 9px; padding: 0 13px; font-weight: 700; }

  /* ── 모달 공통 ── */
  .overlay {
    position: fixed; inset: 0; background: rgba(25, 25, 60, .45); z-index: 100;
    display: flex; align-items: center; justify-content: center; padding: 16px;
  }
  .modal {
    background: var(--glass-strong); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--glass-border); border-radius: 18px; width: 520px; max-width: 96vw; max-height: 92vh;
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
  .m-body input:focus, .m-body textarea:focus, .m-body select:focus { border-color: var(--brand-1); }
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
  .draw-tools .szbtn.on { background: var(--brand-1); color: #fff; }
  .draw-tools .sep { width: 1px; height: 24px; background: #e3e6ef; margin: 0 4px; }

  /* ── 쪽지 ── */
  .msg-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .msg-tabs button { flex: 1; background: #eef0f6; border-radius: 10px; padding: 9px; font-weight: 700; color: #778; }
  .msg-tabs button.on { background: var(--brand-1); color: #fff; }
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
  .stu-table .st-no { text-align: center; font-weight: 700; -moz-appearance: textfield; }
  .stu-table .st-no::-webkit-outer-spin-button, .stu-table .st-no::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .stu-table input:focus { border-color: var(--brand-1); }
  .stu-table .del { color: #e74c3c; font-size: 15px; padding: 4px 7px; }
  .add-n { display: inline-flex; align-items: center; border: 2px solid #e3e6ef; border-radius: 11px; overflow: hidden; }
  .add-n input { width: 46px; text-align: center; border: none; padding: 9px 0; outline: none; font-weight: 700; -moz-appearance: textfield; }
  .add-n input::-webkit-outer-spin-button, .add-n input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .add-n-btn { width: 34px; padding: 9px 0; font-size: 18px; font-weight: 800; color: var(--accent); background: #f5f6fb; }
  .add-n-btn:hover { background: #e9ebf6; }

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
  .stu-table .pf { color: var(--accent); font-size: 15px; padding: 4px 7px; }
  .pf-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .pf-stat { background: #f2f4fb; border-radius: 12px; padding: 8px 14px; text-align: center; flex: 1; min-width: 72px; }
  .pf-stat b { display: block; font-size: 20px; color: var(--accent); }
  .pf-stat span { font-size: 12px; color: #778; }
  .pf-section-title { font-size: 15px; font-weight: 800; margin: 16px 0 8px; color: #445; }
  .pf-item { border: 1.5px solid #eef0f6; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
  .pf-item .pf-meta { font-size: 12px; color: #889; margin-bottom: 6px; }
  .pf-item .pf-meta b { color: var(--accent); }
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
    <img class="login-mascot" src="/mascot.png" alt="다람쌤 마스코트">
    <h1>우리 반 아이디어 보드</h1>
    <div class="sub">다람쌤과 함께 글 · 그림 · 사진 · 파일로 아이디어를 나눠요</div>
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
    <button class="link-btn" id="btn-register" onclick="IB.openRegister()" hidden>선생님이 처음이신가요? 계정 만들기</button>
  </div>
</div>

<!-- ═══════════ 앱 본체 ═══════════ -->
<div id="scr-app" hidden>
  <header>
    <img class="hd-mascot" src="/mascot.png" alt="다람쌤">
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
    <div class="empty-note" id="home-empty" hidden><img class="empty-mascot" src="/mascot.png" alt="다람쌤">아직 게시판이 없어요.<br>선생님이 게시판을 만들면 여기에 나타나요! 🌱</div>
  </main>

  <!-- 게시판: 글 목록 -->
  <main id="view-board" hidden>
    <div class="board-head">
      <button class="btn-back" onclick="IB.goHome()">←</button>
      <h2 id="bd-title"></h2>
      <div class="board-head-actions">
        <button class="btn-pdf" onclick="IB.printBoard()">📄 PDF 저장</button>
        <button class="btn-write" onclick="IB.openComposer()">✏️ 아이디어 올리기</button>
      </div>
      <div class="desc" id="bd-desc"></div>
    </div>
    <div class="posts" id="post-list"></div>
    <div class="empty-note" id="bd-empty" hidden><img class="empty-mascot" src="/mascot.png" alt="다람쌤">아직 올라온 아이디어가 없어요.<br>첫 번째 아이디어를 올려 볼까요? ✨</div>
  </main>
</div>

<!-- ═══════════ 글쓰기 모달 ═══════════ -->
<div class="overlay" id="md-compose" hidden>
  <div class="modal">
    <div class="m-head"><span id="cmp-head">✏️ 아이디어 올리기</span> <button class="x" onclick="IB.closeComposer()">✕</button></div>
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
      <div class="check-row"><input type="checkbox" id="mb-likes" checked><label for="mb-likes" style="margin:0">❤️ 좋아요 사용하기</label></div>
      <div class="check-row"><input type="checkbox" id="mb-comments" checked><label for="mb-comments" style="margin:0">💬 댓글 사용하기</label></div>
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
        <thead><tr><th style="width:76px">번호</th><th>이름</th><th style="width:74px">PIN</th><th style="width:64px"></th></tr></thead>
        <tbody id="stu-rows"></tbody>
      </table>
      <div class="m-actions" style="align-items:center;flex-wrap:wrap">
        <div class="add-n">
          <button class="add-n-btn" onclick="IB.stepAddCount(-1)">−</button>
          <input type="number" id="stu-addn" min="1" max="50" value="5" onchange="IB.clampAddCount()">
          <button class="add-n-btn" onclick="IB.stepAddCount(1)">+</button>
        </div>
        <button class="btn2" onclick="IB.addStudentRows()">명 추가 👥</button>
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
        <b>우리 반을 같이 보는</b> 선생님 계정만 여기서 관리해요(같은 반의 학생·게시판을 공유).<br>
        완전히 다른 반을 새로 만들 선생님은 로그인 화면의 "계정 만들기"를 이용해 주세요.
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
      <div class="invite-box">
        <div class="hint">다른 선생님이 우리 반에 함께 들어오려면 이 코드로 초대하세요</div>
        <div class="code" id="set-invite">------</div>
        <div class="hint">계정 만들기 화면 → "참여 코드로 합류"에 입력</div>
      </div>
      <div class="m-actions">
        <button class="btn-primary grow" onclick="IB.saveSettings()">저장</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════════ 선생님 계정 만들기 (로그인 전) ═══════════ -->
<div class="overlay" id="md-register" hidden>
  <div class="modal">
    <div class="m-head">🧑‍🏫 선생님 계정 만들기 <button class="x" onclick="IB.hide('md-register')">✕</button></div>
    <div class="m-body">
      <div class="reg-tabs">
        <button id="reg-tab-new" class="on" onclick="IB.regSetMode('new')">🌱 새 반 만들기</button>
        <button id="reg-tab-join" onclick="IB.regSetMode('join')">🤝 참여 코드로 합류</button>
      </div>
      <label>이름</label>
      <input type="text" id="reg-name" placeholder="예: 김다솜">
      <label>아이디</label>
      <input type="text" id="reg-id" placeholder="로그인에 쓸 아이디" autocomplete="off">
      <label>비밀번호</label>
      <input type="password" id="reg-pw" placeholder="4자 이상">
      <div id="reg-new-fields">
        <label>우리 반 이름</label>
        <input type="text" id="reg-classname" placeholder="예: 6학년 1반 아이디어 보드">
        <label>학급 코드 (학생 로그인용, 다른 반과 겹치면 안 돼요)</label>
        <input type="text" id="reg-classcode" placeholder="예: 6-1">
      </div>
      <div id="reg-join-fields" hidden>
        <label>참여 코드 (초대한 선생님에게 받은 코드)</label>
        <input type="text" id="reg-invitecode" placeholder="예: AB12CD34" style="text-transform:uppercase">
      </div>
      <div class="login-err" id="reg-err"></div>
      <div class="m-actions">
        <button class="btn-primary grow" id="reg-submit" onclick="IB.submitRegister()">계정 만들고 시작하기</button>
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
  let attachments = [];     // 글쓰기 첨부 (새 파일 {name,mime,data,isImage} | 기존 파일 {existing:true,id,name,isImage})
  let editingPostId = null; // 글 수정 중이면 그 글 id, 새 글이면 null
  let popupIds = [];        // 팝업에 떠 있는 쪽지 id
  let pollTimer = null;
  let boardTimer = null;
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
  function nowStr() {
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
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
    const color = author.type === "teacher" ? "var(--accent)"
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
    $("btn-register").hidden = r !== "teacher";
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

  // ── 선생님 계정 만들기 (새 반 / 참여 코드로 합류) ──
  let regMode = "new";
  function openRegister() {
    regMode = "new";
    regSetMode("new");
    $("reg-name").value = ""; $("reg-id").value = ""; $("reg-pw").value = "";
    $("reg-classname").value = ""; $("reg-classcode").value = ""; $("reg-invitecode").value = "";
    $("reg-err").textContent = "";
    show("md-register");
  }
  function regSetMode(m) {
    regMode = m;
    $("reg-tab-new").classList.toggle("on", m === "new");
    $("reg-tab-join").classList.toggle("on", m === "join");
    $("reg-new-fields").hidden = m !== "new";
    $("reg-join-fields").hidden = m !== "join";
  }
  function submitRegister() {
    $("reg-err").textContent = "";
    const body = {
      name: $("reg-name").value.trim(),
      loginId: $("reg-id").value.trim(),
      pw: $("reg-pw").value,
      mode: regMode,
    };
    if (regMode === "new") {
      body.className = $("reg-classname").value.trim();
      body.classCode = $("reg-classcode").value.trim();
    } else {
      body.inviteCode = $("reg-invitecode").value.trim();
    }
    const btn = $("reg-submit");
    btn.disabled = true; btn.textContent = "만드는 중...";
    guard((async () => {
      try {
        const r = await api("/api/teacher/register", body);
        AUTH = { role: "teacher", id: body.loginId, pw: body.pw };
        localStorage.setItem(LS_KEY, JSON.stringify(AUTH));
        hide("md-register");
        await enterApp();
        if (regMode === "new")
          toast("반이 만들어졌어요! 참여 코드(설정에서 확인): " + r.inviteCode);
        else
          toast(r.classCode + "반에 합류했어요! 🎉");
      } catch (e) {
        $("reg-err").textContent = e.message;
      } finally {
        btn.disabled = false; btn.textContent = "계정 만들고 시작하기";
      }
    })());
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
      html += '<div class="board-card" style="--board-tint:' + color + '" onclick="IB.openBoard(' + b.id + ')">' +
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
    const allowLikes = BOARD.board.allowLikes !== false;
    const allowComments = BOARD.board.allowComments !== false;
    const wrap = $("post-list");
    let html = "";
    for (const p of BOARD.posts) {
      const isTeacherPost = p.author.type === "teacher";
      html += '<div class="post' + (p.isNotice ? " notice" : "") + '" id="post-' + p.id + '">';
      html += '<div class="p-head">' + avatarHtml(p.author) +
        '<div class="p-who"><div class="p-name">' + authorLabel(p.author) +
        (p.isNotice ? ' <span class="chip-notice">📌 공지</span>' : "") +
        '</div><div class="p-time">' + fmtTime(p.createdAt) +
        (p.editedAt ? ' <span class="edited">(수정됨)</span>' : "") + "</div></div>" +
        '<div class="p-tools">' +
        (isT ? '<button title="공지 고정" onclick="IB.toggleNotice(' + p.id + ',' + (p.isNotice ? "false" : "true") + ')">📌</button>' : "") +
        (p.canEdit ? '<button title="고치기" onclick="IB.editPost(' + p.id + ')">✏️</button>' : "") +
        (p.canEdit ? '<button title="지우기" onclick="IB.deletePost(' + p.id + ')">🗑</button>' : "") +
        "</div></div>";
      if (p.text) html += '<div class="p-text">' + linkify(p.text) + "</div>";
      for (const f of p.files) {
        if (f.isImage)
          html += '<img class="p-img" loading="lazy" src="/api/file/' + f.id + '" alt="' + esc(f.name) + '" onclick="IB.zoom(\\'' + f.id + "')\\">";
        else
          html += '<a class="p-file" href="/api/file/' + f.id + '">📎 ' + esc(f.name) + "</a>";
      }
      // 발(좋아요/댓글) — 게시판 설정에 따라 표시
      if (allowLikes || allowComments) {
        html += '<div class="p-foot">';
        if (allowLikes) {
          if (isT) {
            // 교사: 좋아요 수를 직접 늘리거나 줄임
            html += '<span class="like-adjust"><button title="좋아요 줄이기" onclick="IB.adjustLike(' + p.id + ',-1)">➖</button>' +
              '<span class="like-badge">❤️ <span id="likec-' + p.id + '">' + p.likeCount + '</span></span>' +
              '<button title="좋아요 늘리기" onclick="IB.adjustLike(' + p.id + ',1)">➕</button></span>';
          } else if (isTeacherPost) {
            // 학생이 보는 교사 글: 좋아요는 누를 수 없고 개수만 표시
            html += '<span class="like-readonly">❤️ <span id="likec-' + p.id + '">' + p.likeCount + '</span></span>';
          } else {
            html += '<button class="' + (p.liked ? "liked" : "") + '" onclick="IB.toggleLike(' + p.id + ')">' +
              (p.liked ? "❤️" : "🤍") + ' <span id="likec-' + p.id + '">' + p.likeCount + "</span></button>";
          }
        }
        if (allowComments)
          html += '<button onclick="IB.toggleComments(' + p.id + ')">💬 ' + p.comments.length + "</button>";
        html += "</div>";
      }
      // 댓글
      if (allowComments) {
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
      }
      html += "</div>";
    }
    wrap.innerHTML = html;
    $("bd-empty").hidden = BOARD.posts.length > 0;
  }
  function adjustLike(pid, delta) {
    guard((async () => {
      const r = await api("/api/like/adjust", { postId: pid, delta });
      const el = $("likec-" + pid);
      if (el) el.textContent = r.likeCount;
      const bp = BOARD && BOARD.posts.find(x => x.id === pid);
      if (bp) bp.likeCount = r.likeCount;
    })());
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

  // ── 글쓰기 / 글 수정 ──
  function openComposer() {
    editingPostId = null;
    attachments = [];
    $("cmp-head").textContent = "✏️ 아이디어 올리기";
    $("cmp-submit").textContent = "올리기";
    $("cmp-text").value = "";
    $("cmp-notice").checked = false;
    $("cmp-notice-row").hidden = ME.type !== "teacher";
    renderAttach();
    show("md-compose");
    $("cmp-text").focus();
  }
  function editPost(pid) {
    const p = BOARD.posts.find(x => x.id === pid);
    if (!p) return;
    editingPostId = pid;
    // 기존 첨부는 서버에 있는 파일이므로 existing 표시로 담아 둠
    attachments = p.files.map(f => ({ existing: true, id: f.id, name: f.name, isImage: f.isImage }));
    $("cmp-head").textContent = "✏️ 아이디어 고치기";
    $("cmp-submit").textContent = "수정 저장";
    $("cmp-text").value = p.text || "";
    $("cmp-notice-row").hidden = true; // 공지 고정은 📌 버튼으로 따로
    renderAttach();
    show("md-compose");
    $("cmp-text").focus();
  }
  function closeComposer() { hide("md-compose"); }
  function renderAttach() {
    const w = $("cmp-attach");
    let html = "";
    attachments.forEach((a, i) => {
      const src = a.existing ? "/api/file/" + a.id : a.data;
      html += '<div class="att">' +
        (a.isImage ? '<img src="' + src + '" alt="">'
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
    const editing = editingPostId;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = editing ? "저장 중..." : "올리는 중...";
    const newFiles = attachments.filter(a => !a.existing).map(a => ({ name: a.name, data: a.data }));
    guard((async () => {
      try {
        if (editing) {
          await api("/api/post/update", {
            postId: editing,
            text,
            keepFileIds: attachments.filter(a => a.existing).map(a => a.id),
            files: newFiles,
          });
          closeComposer();
          await refreshBoard();
          toast("아이디어를 고쳤어요! ✏️");
        } else {
          await api("/api/post/create", {
            boardId: BOARD.board.id,
            text,
            files: newFiles,
            isNotice: $("cmp-notice").checked,
          });
          closeComposer();
          await refreshBoard();
          toast("아이디어를 올렸어요! 🎉");
        }
      } finally {
        btn.disabled = false; btn.textContent = label;
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

  // ── 새 쪽지 팝업 + 게시판 자동 새로고침 (주기 확인) ──
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(poll, 15000);
    boardTimer = setInterval(pollBoard, 8000);  // 다른 사람이 올린 글이 바로 보이도록
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (boardTimer) { clearInterval(boardTimer); boardTimer = null; }
  }
  // 현재 보고 있는 게시판을 조용히 다시 불러와, 바뀐 게 있으면 새로 그림
  function boardSignature(b) {
    return JSON.stringify((b.posts || []).map(p =>
      [p.id, p.text, p.likeCount, p.editedAt, p.isNotice, p.files.length,
       p.comments.map(c => c.id + ":" + c.text)]));
  }
  async function pollBoard() {
    if (!AUTH || !BOARD) return;
    if ($("view-board").hidden) return;                 // 게시판 화면일 때만
    if (!$("md-compose").hidden || !$("md-draw").hidden) return;  // 글 쓰는 중이면 방해 안 함
    // 댓글을 입력 중(글자가 있음)이면 이번 차례는 건너뜀
    const act = document.activeElement;
    if (act && act.closest && act.closest(".cmt-input") && act.value) return;
    try {
      const r = await api("/api/board", { boardId: BOARD.board.id });
      if ($("view-board").hidden) return;
      if (boardSignature(r) === boardSignature(BOARD)) return;   // 변화 없으면 그대로 둠
      // 입력·펼침·스크롤 상태 보존
      const openCmts = [...document.querySelectorAll(".comments")].filter(el => !el.hidden).map(el => el.id.slice(5));
      const drafts = {};
      document.querySelectorAll(".cmt-input input").forEach(i => { if (i.value) drafts[i.id] = i.value; });
      const focusId = document.activeElement ? document.activeElement.id : null;
      const scrollY = window.scrollY;
      BOARD = r; ME = r.me;
      $("bd-title").textContent = r.board.title;
      $("bd-desc").textContent = r.board.desc || "";
      renderPosts();
      for (const pid of openCmts) { const el = $("cmts-" + pid); if (el) el.hidden = false; }
      for (const id in drafts) { const i = $(id); if (i) i.value = drafts[id]; }
      if (focusId) { const el = $(focusId); if (el && el.focus) { el.focus(); if (el.select) el.select(); } }
      window.scrollTo(0, scrollY);
    } catch (e) { /* 일시 오류는 조용히 넘어감 */ }
  }
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
    $("mb-likes").checked = true;
    $("mb-comments").checked = true;
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
    $("mb-likes").checked = b.allowLikes !== false;
    $("mb-comments").checked = b.allowComments !== false;
    show("md-board");
  }
  function saveBoard() {
    guard((async () => {
      const title = $("mb-name").value.trim();
      const desc = $("mb-desc").value.trim();
      const allowLikes = $("mb-likes").checked;
      const allowComments = $("mb-comments").checked;
      if (editingBoardId) await api("/api/teacher/board/update", { boardId: editingBoardId, title, desc, allowLikes, allowComments });
      else await api("/api/teacher/board/create", { title, desc, allowLikes, allowComments });
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
  function addStudentRow() { addStudentRows(1); }
  // 원하는 인원수만큼 한 번에 추가 (번호는 이어서 자동 매김)
  function addStudentRows(n) {
    const tbody = $("stu-rows");
    if (typeof n !== "number") n = clampAddCount();
    const nums = [...tbody.querySelectorAll(".st-no")].map(i => Number(i.value) || 0);
    let next = nums.length ? Math.max(...nums) + 1 : 1;
    let firstNew = null;
    for (let i = 0; i < n; i++) {
      tbody.insertAdjacentHTML("beforeend", studentRowHtml("", next++, "", "0000"));
      if (!firstNew) firstNew = tbody.lastElementChild;
    }
    if (firstNew) firstNew.querySelector(".st-name").focus();
  }
  function clampAddCount() {
    const el = $("stu-addn");
    let v = Math.round(Number(el.value) || 1);
    v = Math.max(1, Math.min(50, v));
    el.value = v;
    return v;
  }
  function stepAddCount(delta) {
    $("stu-addn").value = clampAddCount() + delta;
    clampAddCount();
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

  // ── 게시판 통째로 PDF 저장 ──
  function boardPrintHtml(b) {
    const posts = b.posts;
    const subParts = [];
    if (b.board.desc) subParts.push(b.board.desc);
    if (HOME && HOME.className) subParts.push(HOME.className);
    subParts.push("출력일 " + nowStr());
    let h = '<div class="pf-print-head"><h1>' + esc(b.board.title) + "</h1>" +
      '<div class="sub">' + esc(subParts.join(" · ")) + "</div></div>";
    h += '<div class="pf-stats">' +
      '<div class="pf-stat"><b>' + posts.length + '</b><span>올라온 글</span></div>' +
      '<div class="pf-stat"><b>' + posts.reduce((n, p) => n + p.files.length, 0) + '</b><span>사진·파일</span></div>' +
      '<div class="pf-stat"><b>' + posts.reduce((n, p) => n + p.likeCount, 0) + '</b><span>좋아요 합계</span></div>' +
      '<div class="pf-stat"><b>' + posts.reduce((n, p) => n + p.comments.length, 0) + '</b><span>댓글 합계</span></div></div>';
    if (posts.length === 0) h += '<div class="pf-empty">아직 올라온 아이디어가 없어요.</div>';
    for (const p of posts) {
      const authorName = p.author.name + (p.author.type === "teacher" ? " 선생님" : "");
      h += '<div class="pf-item"><div class="pf-meta"><b>' + esc(authorName) + "</b> · " + fmtTime(p.createdAt) +
        (p.isNotice ? " · 📌공지" : "") + (p.editedAt ? " · (수정됨)" : "") +
        (b.board.allowLikes !== false ? " · ❤️ " + p.likeCount : "") + "</div>";
      if (p.text) h += '<div class="pf-text">' + esc(p.text) + "</div>";
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
    return h;
  }
  function printBoard() {
    if (!BOARD) return;
    $("print-area").innerHTML = boardPrintHtml(BOARD);
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
    $("set-invite").textContent = HOME.inviteCode || "------";
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
  // 학생 명단에서 ↑/↓ 화살표로 위/아래 학생 줄로 이동
  function stuNav(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const input = e.target;
    const cls = ["st-no", "st-name", "st-pin"].find(c => input.classList && input.classList.contains(c));
    if (!cls) return;
    const tr = input.closest("tr");
    const sib = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
    if (sib) {
      const t = sib.querySelector("." + cls);
      if (t) { e.preventDefault(); t.focus(); if (t.select) t.select(); }
    }
  }
  function boot() {
    $("cmp-photo").addEventListener("change", onPhotoPick);
    $("cmp-file").addEventListener("change", onFilePick);
    $("stu-rows").addEventListener("keydown", stuNav);
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
    setRole, login, logout, goHome, openBoard, printBoard,
    openRegister, regSetMode, submitRegister,
    toggleComments, toggleLike, adjustLike, addComment, deleteComment, deletePost, editPost, toggleNotice, zoom,
    openComposer, closeComposer, removeAttach, submitPost,
    openDraw, closeDraw, drawColor: drawColorPick, drawSize, drawEraser, drawUndo, drawClear, finishDraw,
    openMsgs, msgTab, sendMsg, ackPopup,
    newBoard, editBoard, saveBoard, deleteBoard,
    openStudents, addStudentRow, addStudentRows, stepAddCount, clampAddCount, saveStudents,
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
// 다람쌤 마스코트 (build 스크립트가 ideaboard-app/mascot.png 를 base64 로 넣어 줌)
const MASCOT_PNG_B64 = "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";

// ── 기본 데이터 ──
// "공간(space)" = 독립된 반 하나(학급 코드·이름·참여코드 + 그 반의 학생·게시판).
// 선생님을 새로 만들면 기본적으로 자기만의 새 공간이 생기고, 참여 코드를 입력하면
// 기존 공간(담임+전담처럼 같은 반을 같이 보는 경우)에 합류할 수도 있다.
function defaultState() {
  return {
    seq: 100,
    spaces: [{ id: 1, classCode: "6-1", className: "우리 반 아이디어 보드", inviteCode: "DEMO0001" }],
    // 선생님 계정(여러 명 가능). 각자 아이디·비밀번호·이름으로 로그인해 글·쪽지가 구분됨
    teachers: [{ id: 1, spaceId: 1, loginId: "teacher", pw: "0000", name: "선생님" }],
    students: [],  // {id, spaceId, number, name, pin, active}
    boards: [],    // {id, spaceId, title, desc, allowLikes, allowComments, createdAt}
    posts: [],     // {id, boardId, author:{type,id,name}, text, files:[{id,name,mime,isImage}], isNotice, likeAdjust, createdAt, editedAt}
    comments: [],  // {id, postId, author:{type,id,name}, text, createdAt}
    likes: [],     // {postId, key}   key = "t<교사id>" | "s<학생id>"
    messages: [],  // {id, from:{type,id,name}, toType:"student"|"teacher", toId, text, createdAt, read}
  };
}
function genCode(len) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 글자(0,O,1,I) 제외
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += chars[b % chars.length];
  return s;
}

// 예전(공간 분리 이전) 데이터를 새 구조(spaces 배열)로 맞춰 줌
function migrate(st) {
  if (!Array.isArray(st.teachers) || st.teachers.length === 0) {
    const s = st.settings || {};
    st.teachers = [{ id: 1, loginId: s.teacherId || "teacher", pw: s.teacherPw || "0000", name: "선생님" }];
  }
  if (!Array.isArray(st.spaces) || st.spaces.length === 0) {
    const s = st.settings || {};
    st.spaces = [{ id: 1, classCode: s.classCode || "6-1", className: s.className || "우리 반 아이디어 보드", inviteCode: genCode(8) }];
  }
  const legacySpaceId = st.spaces[0].id;
  for (const t of st.teachers) if (t.spaceId === undefined) t.spaceId = legacySpaceId;
  for (const s of st.students || []) if (s.spaceId === undefined) s.spaceId = legacySpaceId;
  for (const b of st.boards || []) if (b.spaceId === undefined) b.spaceId = legacySpaceId;
  delete st.settings;
  if ((st.seq | 0) < 100) st.seq = 100;
  // 게시판 기능 플래그 기본값(예전 데이터 보정)
  for (const b of st.boards || []) {
    if (b.allowLikes === undefined) b.allowLikes = true;
    if (b.allowComments === undefined) b.allowComments = true;
  }
  for (const p of st.posts || []) {
    if (p.likeAdjust === undefined) p.likeAdjust = 0;
  }
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
function getSpace(st, spaceId) {
  return st.spaces.find(s => s.id === Number(spaceId)) || null;
}
function findSpaceByClassCode(st, classCode) {
  return st.spaces.find(s => String(s.classCode) === String(classCode)) || null;
}
function authStudent(st, auth) {
  if (!auth) return null;
  const sp = findSpaceByClassCode(st, auth.classCode);
  if (!sp) return null;
  return st.students.find(s =>
    s.spaceId === sp.id && Number(s.number) === Number(auth.number) && String(s.pin) === String(auth.pin) && s.active) || null;
}
// 요청의 auth 로 행위자(교사/학생)를 판별. spaceId 를 붙여 돌려주고, 이후 모든 API 가 이걸로 접근 범위를 가른다.
function getActor(st, auth) {
  if (!auth) return null;
  if (auth.role === "teacher") {
    const t = findTeacher(st, auth);
    return t ? { type: "teacher", id: t.id, name: t.name, spaceId: t.spaceId } : null;
  }
  const s = authStudent(st, auth);
  return s ? { type: "student", id: s.id, name: s.name, number: s.number, spaceId: s.spaceId } : null;
}
function likeKey(actor) { return (actor.type === "teacher" ? "t" : "s") + actor.id; }
function sameAuthor(actor, author) {
  return author && author.type === actor.type && Number(author.id) === Number(actor.id);
}
// 글이 실제로 이 사람의 반(공간) 소속인지 확인 (다른 반 글 id 를 추측해 접근하는 것 방지)
function findOwnPost(st, actor, postId) {
  const p = st.posts.find(x => x.id === Number(postId));
  if (!p) return null;
  const b = st.boards.find(x => x.id === p.boardId);
  if (!b || b.spaceId !== actor.spaceId) return null;
  return p;
}
function findOwnBoard(st, actor, boardId) {
  const b = st.boards.find(x => x.id === Number(boardId));
  return (b && b.spaceId === actor.spaceId) ? b : null;
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

function postLikeCount(st, p) {
  const base = st.likes.filter(l => l.postId === p.id).length;
  return Math.max(0, base + (p.likeAdjust | 0));
}
function postView(st, p, actor) {
  const likes = st.likes.filter(l => l.postId === p.id);
  return {
    id: p.id, boardId: p.boardId, author: p.author, text: p.text,
    files: p.files, isNotice: !!p.isNotice, createdAt: p.createdAt, editedAt: p.editedAt || null,
    likeCount: Math.max(0, likes.length + (p.likeAdjust | 0)),
    liked: likes.some(l => l.key === likeKey(actor)),
    canEdit: actor.type === "teacher" || sameAuthor(actor, p.author),
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

  // ══════════ 선생님 계정 만들기 (아직 로그인 전 — 새 반 만들기 또는 참여 코드로 합류) ══════════
  if (path === "/api/teacher/register") {
    const loginId = String(d.loginId || "").trim().slice(0, 30);
    const name = String(d.name || "").trim().slice(0, 20);
    const pw = String(d.pw || "").trim();
    if (!loginId || !name) return fail("아이디와 이름을 모두 채워 주세요.");
    if (pw.length < 4) return fail("비밀번호는 4자 이상이어야 해요.");
    if (st.teachers.some(t => t.loginId === loginId)) return fail("이미 쓰고 있는 아이디예요.", 409);

    let space;
    if (d.mode === "join") {
      const code = String(d.inviteCode || "").trim().toUpperCase();
      space = st.spaces.find(s => s.inviteCode === code);
      if (!space) return fail("참여 코드를 다시 확인해 주세요.", 404);
    } else {
      const className = String(d.className || "").trim().slice(0, 40) || "우리 반 아이디어 보드";
      const classCode = String(d.classCode || "").trim().slice(0, 20);
      if (!classCode) return fail("학급 코드를 정해 주세요.");
      if (st.spaces.some(s => String(s.classCode) === classCode)) return fail("이 학급 코드는 이미 쓰고 있어요. 다른 코드로 정해 주세요.", 409);
      space = { id: nextId(st), classCode, className, inviteCode: genCode(8) };
      st.spaces.push(space);
    }
    const teacher = { id: nextId(st), spaceId: space.id, loginId, pw, name };
    st.teachers.push(teacher);
    return Object.assign(ok({ id: teacher.id, name: teacher.name, classCode: space.classCode, inviteCode: space.inviteCode }),
      { mutated: true });
  }

  const actor = getActor(st, d.auth);
  if (!actor) return fail("로그인이 필요합니다.", 401);
  const isTeacher = actor.type === "teacher";

  // ══════════ 홈 (게시판 목록) ══════════
  if (path === "/api/home") {
    const space = getSpace(st, actor.spaceId);
    if (!space) return fail("소속된 반을 찾을 수 없어요.", 404);
    const boards = st.boards.filter(b => b.spaceId === actor.spaceId).map(b => ({
      id: b.id, title: b.title, desc: b.desc, createdAt: b.createdAt,
      allowLikes: b.allowLikes !== false, allowComments: b.allowComments !== false,
      postCount: st.posts.filter(p => p.boardId === b.id).length,
    }));
    const spaceTeachers = st.teachers.filter(t => t.spaceId === actor.spaceId);
    const res = {
      className: space.className,
      me: { type: actor.type, id: actor.id, name: actor.name },
      boards, unread: unreadOf(st, actor).length,
      // 이름·id만 (비밀번호 제외) — 학생이 쪽지 받을 선생님을 고를 때 사용
      teacherList: spaceTeachers.map(t => ({ id: t.id, name: t.name })),
    };
    if (isTeacher) {
      res.students = st.students.filter(s => s.spaceId === actor.spaceId && s.active)
        .map(s => ({ id: s.id, number: s.number, name: s.name, pin: s.pin }))
        .sort((a, b) => a.number - b.number);
      res.classCode = space.classCode;
      res.inviteCode = space.inviteCode; // 다른 선생님을 같은 반에 초대할 때 공유하는 코드
      // 선생님 계정 관리용 (교사에게만 비밀번호 포함) — 내 반 소속 선생님만
      res.teachers = spaceTeachers.map(t => ({ id: t.id, loginId: t.loginId, name: t.name, pw: t.pw }));
    }
    return ok(res);
  }

  // ══════════ 게시판 글 목록 ══════════
  if (path === "/api/board") {
    const b = st.boards.find(x => x.id === Number(d.boardId));
    if (!b || b.spaceId !== actor.spaceId) return fail("없는 게시판입니다.", 404);
    const posts = st.posts.filter(p => p.boardId === b.id)
      .sort((a, x) => (!!x.isNotice - !!a.isNotice) || (a.createdAt < x.createdAt ? 1 : -1) || (x.id - a.id))
      .map(p => postView(st, p, actor));
    return ok({
      board: { id: b.id, title: b.title, desc: b.desc, allowLikes: b.allowLikes !== false, allowComments: b.allowComments !== false },
      me: { type: actor.type, id: actor.id, name: actor.name },
      posts,
    });
  }

  // ══════════ 글 쓰기 ══════════
  if (path === "/api/post/create") {
    const b = findOwnBoard(st, actor, d.boardId);
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
      likeAdjust: 0,
      createdAt: kst().datetime,
    };
    st.posts.push(post);
    return Object.assign(ok({ post: postView(st, post, actor) }),
      { mutated: true, saveFiles: pf.files });
  }

  // ══════════ 글 수정 (본인 또는 교사) ══════════
  if (path === "/api/post/update") {
    const p = findOwnPost(st, actor, d.postId);
    if (!p) return fail("없는 글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, p.author)) return fail("자기가 쓴 글만 고칠 수 있어요.", 403);
    const text = String(d.text || "").trim().slice(0, 3000);
    // 남길 기존 첨부(keepFileIds)만 유지, 나머지는 삭제. 새 첨부는 추가.
    const keep = Array.isArray(d.keepFileIds) ? d.keepFileIds.map(String) : p.files.map(f => f.id);
    const keptFiles = p.files.filter(f => keep.includes(String(f.id)));
    const removedFileIds = p.files.filter(f => !keep.includes(String(f.id))).map(f => f.id);
    const pf = parseFiles(d.files);
    if (pf.error) return fail(pf.error);
    if (keptFiles.length + pf.files.length > MAX_FILES) return fail("첨부는 " + MAX_FILES + "개까지예요.");
    if (!text && keptFiles.length === 0 && pf.files.length === 0)
      return fail("내용을 쓰거나 사진·그림·파일을 붙여 주세요.");
    p.text = text;
    p.files = keptFiles.concat(pf.files.map(f => ({ id: f.id, name: f.name, mime: f.mime, isImage: f.isImage })));
    p.editedAt = kst().datetime;
    return Object.assign(ok({ post: postView(st, p, actor) }),
      { mutated: true, saveFiles: pf.files, deleteFiles: removedFileIds });
  }

  // ══════════ 글 지우기 (본인 또는 교사) ══════════
  if (path === "/api/post/delete") {
    const p = findOwnPost(st, actor, d.postId);
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
    const p = findOwnPost(st, actor, d.postId);
    if (!p) return fail("없는 글입니다.", 404);
    p.isNotice = !!d.isNotice;
    return Object.assign(ok({ isNotice: p.isNotice }), { mutated: true });
  }

  // ══════════ 댓글 ══════════
  if (path === "/api/comment/create") {
    const p = findOwnPost(st, actor, d.postId);
    if (!p) return fail("없는 글입니다.", 404);
    const cb = st.boards.find(x => x.id === p.boardId);
    if (cb && cb.allowComments === false) return fail("이 게시판은 댓글을 쓸 수 없어요.", 403);
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
    if (!c || !findOwnPost(st, actor, c.postId)) return fail("없는 댓글입니다.", 404);
    if (!isTeacher && !sameAuthor(actor, c.author)) return fail("자기가 쓴 댓글만 지울 수 있어요.", 403);
    st.comments = st.comments.filter(x => x.id !== c.id);
    return Object.assign(ok({}), { mutated: true });
  }

  // ══════════ 좋아요 ══════════
  if (path === "/api/like/toggle") {
    const p = findOwnPost(st, actor, d.postId);
    if (!p) return fail("없는 글입니다.", 404);
    const lb = st.boards.find(x => x.id === p.boardId);
    if (lb && lb.allowLikes === false) return fail("이 게시판은 좋아요를 쓸 수 없어요.", 403);
    if (p.author.type === "teacher") return fail("선생님이 쓴 글에는 좋아요를 누를 수 없어요.", 403);
    const key = likeKey(actor);
    const has = st.likes.some(l => l.postId === p.id && l.key === key);
    if (has) st.likes = st.likes.filter(l => !(l.postId === p.id && l.key === key));
    else st.likes.push({ postId: p.id, key });
    return Object.assign(ok({
      liked: !has,
      likeCount: postLikeCount(st, p),
    }), { mutated: true });
  }
  // 교사 전용: 좋아요 수를 직접 올리거나 내림 (delta = +1 / -1)
  if (path === "/api/like/adjust") {
    if (!isTeacher) return fail("선생님만 할 수 있어요.", 403);
    const p = findOwnPost(st, actor, d.postId);
    if (!p) return fail("없는 글입니다.", 404);
    const lb = st.boards.find(x => x.id === p.boardId);
    if (lb && lb.allowLikes === false) return fail("이 게시판은 좋아요를 쓸 수 없어요.", 403);
    const delta = Number(d.delta) > 0 ? 1 : -1;
    // 내려서 총합이 0 밑으로 가지 않게 (표시 개수는 항상 0 이상)
    if (delta < 0 && postLikeCount(st, p) <= 0) return ok({ likeCount: 0 });
    p.likeAdjust = (p.likeAdjust | 0) + delta;
    return Object.assign(ok({ likeCount: postLikeCount(st, p) }), { mutated: true });
  }

  // ══════════ 쪽지 ══════════
  if (path === "/api/msg/send") {
    const text = String(d.text || "").trim().slice(0, 1000);
    if (!text) return fail("쪽지 내용을 써 주세요.");
    const from = { type: actor.type, id: actor.id, name: actor.name };
    const now = kst().datetime;
    if (isTeacher) {
      if (d.to === "all") {
        const targets = st.students.filter(s => s.spaceId === actor.spaceId && s.active);
        if (targets.length === 0) return fail("등록된 학생이 없어요.");
        for (const s of targets)
          st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      } else {
        const s = st.students.find(x => x.id === Number(d.to) && x.spaceId === actor.spaceId && x.active);
        if (!s) return fail("받을 학생을 찾을 수 없어요.", 404);
        st.messages.push({ id: nextId(st), from, toType: "student", toId: s.id, text, createdAt: now, read: false });
      }
    } else {
      // 학생 → 선생님. 받는 사람은 반드시 같은 반 선생님(학생끼리, 다른 반 선생님에게 쪽지 불가).
      // 선생님이 여러 명이면 고른 선생님, 지정이 없거나 잘못됐고 선생님이 한 명뿐이면 그 선생님에게 자동 전송
      const spaceTeachers = st.teachers.filter(t => t.spaceId === actor.spaceId);
      let target = null;
      if (d.to) target = spaceTeachers.find(t => t.id === Number(d.to));
      if (!target && spaceTeachers.length === 1) target = spaceTeachers[0];
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
      const b = {
        id: nextId(st), spaceId: actor.spaceId, title, desc: String(d.desc || "").trim().slice(0, 200),
        allowLikes: d.allowLikes !== false, allowComments: d.allowComments !== false,
        createdAt: kst().datetime,
      };
      st.boards.push(b);
      return Object.assign(ok({ board: b }), { mutated: true });
    }
    if (path === "/api/teacher/board/update") {
      const b = findOwnBoard(st, actor, d.boardId);
      if (!b) return fail("없는 게시판입니다.", 404);
      const title = String(d.title || "").trim().slice(0, 60);
      if (!title) return fail("게시판 이름을 써 주세요.");
      b.title = title;
      b.desc = String(d.desc || "").trim().slice(0, 200);
      b.allowLikes = d.allowLikes !== false;
      b.allowComments = d.allowComments !== false;
      return Object.assign(ok({}), { mutated: true });
    }
    if (path === "/api/teacher/board/delete") {
      const b = findOwnBoard(st, actor, d.boardId);
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

    // 학생 명단 일괄 저장 (내 반 학생만 전달된 목록으로 교체, 다른 반 학생은 그대로 둠)
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
        // 기존 학생의 id 가 들어오면 반드시 내 반 소속인지 확인(다른 반 학생 id 도용 방지)
        let id = null;
        if (s.id) {
          const existing = st.students.find(x => x.id === Number(s.id));
          if (!existing || existing.spaceId !== actor.spaceId) return fail("잘못된 학생 정보예요.", 403);
          id = existing.id;
        }
        next.push({ id: id || nextId(st), spaceId: actor.spaceId, number, name, pin, active: true });
      }
      st.students = st.students.filter(x => x.spaceId !== actor.spaceId)
        .concat(next.sort((a, b) => a.number - b.number));
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    // 학생 포트폴리오: 한 학생이 올린 글·자료·댓글을 모두 모아서 반환
    if (path === "/api/teacher/portfolio") {
      const stu = st.students.find(s => s.id === Number(d.studentId));
      if (!stu || stu.spaceId !== actor.spaceId) return fail("학생을 찾을 수 없어요.", 404);
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
        className: getSpace(st, actor.spaceId).className,
        student: { id: stu.id, number: stu.number, name: stu.name },
        posts, comments,
        stats: { postCount: posts.length, fileCount, likeTotal, commentCount: comments.length },
        generatedAt: kst().datetime,
      });
    }

    // 선생님 계정 명단 일괄 저장 — 내 반 소속 선생님만 교체(다른 반 선생님은 안 건드림)
    if (path === "/api/teacher/teachers/save") {
      if (!Array.isArray(d.teachers)) return fail("목록이 올바르지 않아요.");
      const others = st.teachers.filter(t => t.spaceId !== actor.spaceId);
      const seenIds = new Set();
      const next = [];
      for (const t of d.teachers) {
        const loginId = String(t.loginId || "").trim().slice(0, 30);
        const name = String(t.name || "").trim().slice(0, 20);
        const pw = String(t.pw || "").trim();
        if (!loginId || !name) return fail("아이디와 이름을 모두 채워 주세요.");
        if (pw.length < 4) return fail(name + " 선생님: 비밀번호는 4자 이상이어야 해요.");
        // 아이디는 전체 서비스에서 유일해야 함(로그인할 때 반 구분 없이 아이디+비번만 확인하므로)
        const dup = others.find(o => o.loginId === loginId) ||
          next.find(o => o.loginId === loginId);
        if (dup) return fail("아이디 '" + loginId + "'는 이미 다른 곳에서 쓰고 있어요.", 409);
        const id = t.id ? Number(t.id) : nextId(st);
        seenIds.add(id);
        next.push({ id, spaceId: actor.spaceId, loginId, pw, name });
      }
      if (next.length === 0) return fail("선생님은 최소 한 명은 있어야 해요.");
      if (!seenIds.has(actor.id)) return fail("본인 계정은 목록에서 지울 수 없어요.", 400);
      st.teachers = others.concat(next);
      return Object.assign(ok({ count: next.length }), { mutated: true });
    }

    // 우리 반 만들기: 참여 코드를 발급해 다른 선생님을 초대할 수 있음
    if (path === "/api/teacher/settings/save") {
      const classCode = String(d.classCode || "").trim().slice(0, 20);
      const className = String(d.className || "").trim().slice(0, 40);
      if (!classCode || !className) return fail("학급 코드와 이름을 채워 주세요.");
      const dup = st.spaces.find(s => s.id !== actor.spaceId && String(s.classCode) === classCode);
      if (dup) return fail("이 학급 코드는 다른 반에서 이미 쓰고 있어요.", 409);
      const space = getSpace(st, actor.spaceId);
      space.classCode = classCode;
      space.className = className;
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
      if (path === "/mascot.png") {
        const bytes = Uint8Array.from(atob(MASCOT_PNG_B64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
      }
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
