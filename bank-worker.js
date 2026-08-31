/*
 * 학급은행 — 온라인 서버 (Cloudflare Worker + D1)
 * ──────────────────────────────────────────────────────────
 * 선생님 컴퓨터를 켜두지 않아도, 학생들이 주소만 열면 바로 접속됩니다.
 *  - 학생용:  https://<워커주소>/
 *  - 교사용:  https://<워커주소>/teacher.html
 *
 * ※ 이 파일은 build-bank-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(bank-app/*.html)을 고친 뒤에는 build-bank-worker.ps1 을 다시 실행하세요.
 *
 * [2026-08-28 주식 연동 수정]
 *  - 한국주식 학급가격 = 실제 원화 주가 / 10,000
 *  - 미국주식 학급가격 = 실제 달러 주가 × USD/KRW 환율 / 10,000
 *  - 실제 등락률은 가격 계산에 사용하지 않고 참고용으로만 표시
 *
 * [2026-08-31 은행 탭 추가]
 *  - 🐷 적금: 1인 최대 250까지, 7일마다 5% 복리. 넣고 10일 동안은 해약 불가이며
 *    부득이하게 해약하면 이자 없이 원금만 돌려받습니다.
 *  - 🏦 대출: 대출이 있는 상태에서는 다시 받을 수 없고, 금리는 일주일에 5%,
 *    한도는 자신의 주급(직업 수당)의 2배. 이자는 일주일이 지날 때마다 자동 차감됩니다.
 *  - 💝 기부: 모인 기부금이 150 이상이 되면 학급에서 남은 재산이 가장 적은 학생에게
 *    전액 전달합니다. 남은 재산 = 현금 + 적금 현재 평가액 + 주식 현재 평가액.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: class-bank)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: class-bank)
 *  3. 이 파일(bank-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 class-bank 선택
 *  5. 배포 주소(예: https://class-bank.내계정.workers.dev)를 학생 태블릿
 *     홈 화면에 추가해 두면 끝!
 *
 * ✅ 무료 한도(하루 10만 요청, D1 500MB)로 학급 운영에 충분합니다.
 * ✅ 데이터는 D1에 저장됩니다. 백업은 교사 화면의 CSV 내보내기를 이용하세요.
 *    (오래된 거래·출근 기록은 용량 관리를 위해 자동 정리되므로
 *     매주 금요일 CSV 백업 루틴을 꼭 지켜 주세요)
 */

const STUDENT_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>학급은행</title>
<style>
  :root{
    --bg:#f6f4ee; --card:#ffffff; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
    --line:#e1e0d9; --brand:#2a78d6; --brand-dark:#1c5cab; --good:#0ca30c; --bad:#d03b3b;
    --gold:#eda100;
  }
  *{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;background:var(--bg);color:var(--ink);min-height:100vh}
  button{font-family:inherit;cursor:pointer;border:none}
  .hidden{display:none!important}

  /* ── 로그인 ── */
  #loginView{max-width:440px;margin:0 auto;padding:32px 20px}
  .logo{text-align:center;margin:28px 0 24px}
  .logo .mascot{width:96px;height:96px;object-fit:contain;display:block;margin:0 auto 4px;filter:drop-shadow(0 5px 10px rgba(11,11,11,.15))}
  .logo h1{font-size:32px;margin-top:8px}
  .logo p{color:var(--ink2);font-size:16px;margin-top:4px}
  .field{margin-bottom:16px}
  .field label{display:block;font-size:16px;font-weight:700;margin-bottom:6px}
  .field input{width:100%;font-size:24px;padding:14px 16px;border:2px solid var(--line);border-radius:14px;background:var(--card);text-align:center}
  .field input:focus{outline:none;border-color:var(--brand)}
  .field select{width:100%;font-size:18px;padding:14px 16px;border:2px solid var(--line);border-radius:14px;background:var(--card)}
  .field select:focus{outline:none;border-color:var(--brand)}
  .btn-big{width:100%;padding:18px;font-size:22px;font-weight:800;border-radius:16px;background:var(--brand);color:#fff}
  .btn-big:active{background:var(--brand-dark)}
  .err{color:var(--bad);text-align:center;font-size:16px;font-weight:700;margin:12px 0;min-height:20px}

  /* ── 앱 공통 ── */
  #appView{max-width:520px;margin:0 auto;padding:14px 14px 96px}
  .topbar{display:flex;justify-content:space-between;align-items:center;padding:6px 4px 14px}
  .topbar .who{font-size:18px;font-weight:800}
  .topbar .who small{display:block;font-size:13px;color:var(--muted);font-weight:400}
  .topbar button{background:none;color:var(--muted);font-size:14px;text-decoration:underline}
  .card{background:var(--card);border-radius:20px;padding:20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(11,11,11,.06);border:1px solid rgba(11,11,11,.05)}
  .card h3{font-size:15px;color:var(--ink2);margin-bottom:10px}
  .tabs{position:fixed;bottom:0;left:0;right:0;background:var(--card);border-top:1px solid var(--line);display:flex;max-width:520px;margin:0 auto}
  .tabs button{flex:1;padding:10px 0 12px;background:none;font-size:12px;color:var(--muted);font-weight:700}
  .tabs button .ico{display:block;font-size:24px;margin-bottom:2px}
  .tabs button.on{color:var(--brand)}

  /* ── 지갑 ── */
  .balance-card{background:linear-gradient(135deg,#2a78d6,#1c5cab);color:#fff;text-align:center;padding:28px 20px}
  .balance-card .label{font-size:15px;opacity:.85}
  .balance-card .amount{font-size:46px;font-weight:900;margin-top:4px}
  .balance-card .amount small{font-size:22px;font-weight:700;margin-left:4px}
  .payrow{display:flex;justify-content:space-between;padding:9px 0;font-size:17px;border-bottom:1px dashed var(--line)}
  .payrow:last-child{border-bottom:none}
  .payrow .k{color:var(--ink2)}
  .payrow .v{font-weight:800;font-variant-numeric:tabular-nums}
  .payrow.total{border-top:2px solid var(--ink);margin-top:4px;padding-top:12px}
  .payrow.total .v{color:var(--brand);font-size:20px}
  .payrow .v.minus{color:var(--bad)}
  .txrow{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid var(--line)}
  .txrow:last-child{border-bottom:none}
  .txrow .memo{font-size:16px;font-weight:600}
  .txrow .date{font-size:12px;color:var(--muted);margin-top:2px}
  .txrow .amt{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
  .amt.plus{color:var(--good)} .amt.minus{color:var(--bad)}
  .empty{color:var(--muted);text-align:center;padding:16px 0;font-size:15px}

  /* ── 출근 ── */
  .checkin-wrap{text-align:center;padding:28px 0 10px}
  .checkin-btn{width:210px;height:210px;border-radius:50%;background:var(--brand);color:#fff;font-size:30px;font-weight:900;box-shadow:0 8px 20px rgba(42,120,214,.35);transition:transform .1s}
  .checkin-btn:active{transform:scale(.95)}
  .checkin-btn:disabled{background:#c9c8c1;box-shadow:none;cursor:default}
  .checkin-btn .sub{display:block;font-size:15px;font-weight:600;margin-top:6px;opacity:.9}
  .deadline-note{color:var(--ink2);font-size:15px;margin-top:18px}
  /* 도장 애니메이션 */
  .stamp{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,11,11,.35);z-index:50}
  .stamp .seal{width:230px;height:230px;border-radius:50%;border:10px solid #d03b3b;color:#d03b3b;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;transform:rotate(-12deg);animation:stampIn .45s cubic-bezier(.2,2.5,.4,1) both}
  .stamp .seal .big{font-size:40px}
  .stamp .seal .small{font-size:17px;margin-top:6px;color:var(--ink2)}
  @keyframes stampIn{0%{transform:scale(2.6) rotate(-12deg);opacity:0}60%{transform:scale(.92) rotate(-12deg);opacity:1}100%{transform:scale(1) rotate(-12deg)}}
  /* 행운 버튼 */
  .lucky-btn{width:160px;height:160px;border-radius:50%;font-size:52px;font-weight:900;color:#fff;
    background:linear-gradient(135deg,#3ec46d,#0ca30c);box-shadow:0 8px 20px rgba(12,163,12,.32);transition:transform .1s}
  .lucky-btn:active{transform:scale(.94)}
  .lucky-btn .sub{display:block;font-size:15px;font-weight:800;margin-top:2px}
  .lucky-btn:disabled{background:#c9c8c1;box-shadow:none;cursor:default}
  .lucky-btn.nope{animation:nope .45s ease}
  @keyframes nope{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(9px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}

  /* ── 상점 ── */
  .item{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
  .item:last-child{border-bottom:none}
  .item .name{font-size:18px;font-weight:800}
  .item .meta{font-size:13px;color:var(--muted);margin-top:3px}
  .buy-btn{background:var(--gold);color:#fff;font-size:16px;font-weight:800;padding:12px 18px;border-radius:12px;white-space:nowrap}
  .buy-btn:disabled{background:#c9c8c1}
  .coupon{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px dashed var(--line)}
  .coupon:last-child{border-bottom:none}
  .coupon .name{font-size:17px;font-weight:700}
  .coupon .date{font-size:12px;color:var(--muted);margin-top:2px}
  .badge{font-size:13px;font-weight:800;padding:5px 12px;border-radius:99px}
  .badge.hold{background:#e7f1fc;color:var(--brand)}
  .badge.used{background:#efeeea;color:var(--muted)}
  .badge.lock{background:#fdeeee;color:var(--bad)}
  .badge.ready{background:#e7f8ea;color:#0a7a26}

  /* ── 은행 (적금·대출·기부) ── */
  .asset-card{background:linear-gradient(135deg,#0ca30c,#0a7a26);color:#fff;text-align:center;padding:24px 20px}
  .asset-card .label{font-size:15px;opacity:.88}
  .asset-card .amount{font-size:40px;font-weight:900;margin-top:2px}
  .asset-card .amount small{font-size:20px;font-weight:700;margin-left:4px}
  .asset-card .parts{font-size:13px;opacity:.92;margin-top:10px;line-height:1.5}
  .bank-row{display:flex;gap:6px;align-items:center;margin-top:10px}
  .bank-row input{flex:1;min-width:0;font-size:18px;padding:12px;border:2px solid var(--line);border-radius:12px;text-align:center}
  .bank-row input:focus{outline:none;border-color:var(--brand)}
  .bank-row button{padding:12px 18px;border-radius:12px;font-size:16px;font-weight:800;color:#fff;background:var(--brand);white-space:nowrap}
  .bank-row button:disabled{background:#c9c8c1}
  .btn-gold{background:var(--gold)!important}
  .btn-green{background:var(--good)!important}
  .dep{padding:12px 0;border-bottom:1px solid var(--line)}
  .dep:last-child{border-bottom:none}
  .dep-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .dep .nm{font-size:17px;font-weight:800}
  .dep .sub{font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5}
  .dep .val{font-size:19px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
  .dep .val small{display:block;font-size:12px;font-weight:700;color:var(--good)}
  .dep-act{display:flex;gap:6px;margin-top:8px}
  .dep-act button{flex:1;padding:10px 0;border-radius:10px;font-size:15px;font-weight:800;color:#fff}
  .btn-take{background:var(--good)} .btn-break{background:#a9a7a0}
  .bar{height:16px;border-radius:99px;background:#efeeea;overflow:hidden;margin:12px 0 6px}
  .bar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#eda100,#e07b00);transition:width .4s}
  .rule{font-size:13px;color:var(--ink2);background:var(--bg);border-radius:12px;padding:11px 13px;margin-top:12px;line-height:1.6}
  .rule b{color:var(--ink)}

  /* ── 주식 ── */
  .stk{padding:12px 0;border-bottom:1px solid var(--line)}
  .stk:last-child{border-bottom:none}
  .stk-top{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
  .stk .nm{font-size:17px;font-weight:800}
  .stk .sub{font-size:12px;color:var(--muted);margin-top:2px}
  .stk .pr{font-size:19px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
  .stk .chg{font-size:13px;font-weight:800;margin-left:6px}
  .up{color:var(--bad)} .down{color:var(--brand)} .flat{color:var(--muted)}
  .stk-act{display:flex;gap:6px;align-items:center;margin-top:8px}
  .stk-act input{width:64px;font-size:16px;padding:8px;border:2px solid var(--line);border-radius:10px;text-align:center}
  .stk-act button{flex:1;padding:10px 0;border-radius:10px;font-size:15px;font-weight:800;color:#fff}
  .btn-buy{background:var(--bad)} .btn-sell{background:var(--brand)}
  .stk-act button:disabled{background:#c9c8c1}
  .spark{display:block;margin-top:6px}

  /* ── 내 정보 ── */
  .mate-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
  .mate-row:last-child{border-bottom:none}
  .mate-row .who{font-weight:700;font-size:16px}
  .mate-row .job{color:var(--ink2);font-size:13px;margin-top:2px}
  .mate-row .grp{font-size:12px;font-weight:700;color:var(--ink2);background:var(--bg);padding:4px 10px;border-radius:99px;white-space:nowrap}

  /* ── 선생님 감사 카드 ── */
  .thanks-card{background:linear-gradient(135deg,#fff6e6,#ffeccf);border:1px solid #f2d9a8}
  .thanks-card .msg{font-size:16px;font-weight:700;line-height:1.5;color:#6b4a12}
  .thanks-card .sub{font-size:13px;color:#9a7a3d;margin-top:8px}

  /* ── 쿠폰 뽑기 ── */
  .draw-cost{font-size:15px;color:var(--ink2);margin-bottom:12px}
  .draw-btn{width:100%;padding:18px;font-size:20px;font-weight:900;border-radius:16px;
    background:linear-gradient(135deg,#eda100,#e07b00);color:#fff;box-shadow:0 6px 16px rgba(224,123,0,.3)}
  .draw-btn:active{transform:scale(.98)}
  .draw-btn:disabled{background:#c9c8c1;box-shadow:none}

  /* 행운 뽑기 — 카드 고르기 */
  .scratch-wrap{position:fixed;inset:0;background:rgba(11,11,11,.55);display:flex;align-items:center;justify-content:center;z-index:70;padding:20px}
  .scratch-box{background:var(--card);border-radius:24px;padding:24px 20px;width:100%;max-width:380px;text-align:center;position:relative}
  .scratch-box h4{font-size:20px;margin-bottom:4px}
  .scratch-box .hint{font-size:14px;color:var(--ink2);margin-bottom:16px;min-height:20px}
  .cards{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
  .pcard{width:96px;height:132px;perspective:800px;cursor:pointer;background:none;padding:0}
  .pcard-inner{position:relative;width:100%;height:100%;transition:transform .55s cubic-bezier(.4,.2,.2,1);transform-style:preserve-3d}
  .pcard.flipped .pcard-inner{transform:rotateY(180deg)}
  .pcard-back,.pcard-front{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;
    border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px}
  .pcard-back{background:linear-gradient(150deg,#2a78d6,#1c5cab);border:3px solid #fff;box-shadow:0 4px 12px rgba(28,92,171,.35)}
  .pcard-back img{width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
  .pcard-back .lucky{color:#fff;font-size:13px;font-weight:800;margin-top:6px;letter-spacing:1px}
  .pcard:not(.done):active .pcard-inner{transform:scale(.95)}
  .pcard-front{transform:rotateY(180deg);background:linear-gradient(150deg,#fff3d6,#ffe2a8);border:3px solid var(--gold)}
  .pcard-front .pname{font-size:15px;font-weight:900;color:#b06a00;word-break:keep-all;line-height:1.25}
  .pcard-front .ptag{font-size:11px;color:#9a7a3d;margin-top:6px}
  .pcard.miss .pcard-front{background:#f1f0ec;border-color:var(--line);opacity:.65}
  .pcard.miss .pcard-front .pname{color:var(--muted);font-weight:700}
  .pcard.win{animation:winPop .5s cubic-bezier(.2,2,.4,1) .55s both}
  @keyframes winPop{0%{transform:scale(1)}50%{transform:scale(1.14)}100%{transform:scale(1.06)}}
  /* 상점 쿠폰 랜덤 지급 — 돌아가는 화면 */
  .slot{margin-top:16px;border-radius:16px;padding:18px 12px;background:linear-gradient(150deg,#fff3d6,#ffe2a8);border:3px solid var(--gold);overflow:hidden}
  .slot .cap{font-size:13px;color:#9a7a3d;font-weight:700}
  .slot .name{font-size:22px;font-weight:900;color:#b06a00;margin-top:6px;min-height:30px;word-break:keep-all;line-height:1.25}
  .slot.spin .name{animation:slotBlur .12s linear infinite}
  @keyframes slotBlur{0%{opacity:.45;transform:translateY(-8px)}50%{opacity:1;transform:translateY(0)}100%{opacity:.45;transform:translateY(8px)}}
  .slot.done{background:linear-gradient(150deg,#e7f8ea,#c8f0d2);border-color:var(--good)}
  .slot.done .name{color:#0a7a26;animation:slotPop .5s cubic-bezier(.2,2,.4,1) both}
  @keyframes slotPop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
  /* 50% 할인권 */
  .discount-box{background:#e7f1fc;border:1px solid #b9d6f5;border-radius:14px;padding:12px 14px;margin-bottom:12px}
  .discount-box label{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:var(--brand-dark)}
  .discount-box input{width:20px;height:20px}
  .discount-box .sub{font-size:13px;color:var(--ink2);margin-top:6px}
  .price-was{font-size:12px;color:var(--muted);text-decoration:line-through;display:block}
  .scratch-close{margin-top:18px;width:100%;padding:14px;font-size:17px;font-weight:800;border-radius:14px;background:var(--brand);color:#fff}
  .confetti{position:fixed;inset:0;pointer-events:none;z-index:80}

  /* 요청을 보내는 중에는 버튼이 눌린 듯 흐려진다 (연타 방지) */
  body.busy .stk-act button, body.busy .bank-row button, body.busy .dep-act button,
  body.busy .buy-btn, body.busy .btn-big, body.busy .draw-btn, body.busy .checkin-btn{opacity:.55}
  body.busy{cursor:progress}

  /* 토스트 */
  #toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 22px;border-radius:99px;font-size:16px;font-weight:700;z-index:60;white-space:nowrap}
</style>
</head>
<body>

<!-- 로그인 -->
<div id="loginView" class="hidden">
  <div class="logo">
    <img class="mascot" src="mascot.png" alt="다람쌤">
    <h1>학급은행</h1>
    <p>번호와 PIN으로 로그인하세요</p>
  </div>
  <div class="field"><label>학급 코드</label><input id="inCode" placeholder="예: 6-1"></div>
  <div class="field"><label>출석번호</label><input id="inNum" type="number" inputmode="numeric" placeholder="예: 7"></div>
  <div class="field"><label>PIN (4자리)</label><input id="inPin" type="password" inputmode="numeric" maxlength="4" placeholder="****"></div>
  <div class="err" id="loginErr"></div>
  <button class="btn-big" onclick="doLogin()">로그인</button>
</div>

<!-- 앱 -->
<div id="appView" class="hidden">
  <div class="topbar">
    <div class="who"><span id="whoName"></span><small id="whoJob"></small></div>
    <button onclick="logout()">로그아웃</button>
  </div>

  <!-- 탭 1: 내 지갑 -->
  <div id="tab-wallet">
    <div class="card balance-card">
      <div class="label">내 잔액</div>
      <div class="amount"><span id="balance">0</span><small id="curName1"></small></div>
    </div>
    <div class="card">
      <h3>💰 이번 주 급여 미리보기</h3>
      <div id="previewBox"></div>
    </div>
    <div class="card">
      <h3>🧾 이번 주 세금</h3>
      <div id="taxBox"></div>
    </div>
    <div class="card" id="payslipCard">
      <h3>📄 지난 주급 명세서</h3>
      <div id="payslipBox"></div>
    </div>
    <div class="card hidden" id="payAuthorityCard">
      <h3>🧮 우리 모둠에 칭찬 지급하기</h3>
      <p class="limitNote" id="payLimitNote" style="font-size:13px;color:var(--ink2);margin-bottom:10px"></p>
      <div class="field"><label>받을 사람 (나도 고를 수 있어요)</label><select id="payTarget"></select></div>
      <div class="field"><label>금액</label><input id="payAmount" type="number" step="0.01" inputmode="decimal" placeholder="예: 20"></div>
      <div class="field"><label>이유 (안 써도 돼요)</label><input id="payMemo" placeholder="예: 청소를 열심히 도와줘서"></div>
      <div class="err" id="payErr"></div>
      <button class="btn-big" onclick="doGroupPay()">지급하기</button>
    </div>
    <div class="card thanks-card">
      <div class="msg" id="thanksMsg"></div>
      <div class="sub">우리 반 학급은행은 선생님께서 직접 만들어 운영해 주시는 거예요.</div>
    </div>
    <div class="card">
      <h3>🧾 최근 거래 5건</h3>
      <div id="recentBox"></div>
    </div>
  </div>

  <!-- 탭 2: 출근 -->
  <div id="tab-checkin" class="hidden">
    <div class="card">
      <div class="checkin-wrap">
        <button class="checkin-btn" id="checkinBtn" onclick="doCheckin()">출근하기<span class="sub" id="checkinSub"></span></button>
        <div class="deadline-note" id="deadlineNote"></div>
      </div>
    </div>
    <div class="card hidden" id="luckyCard">
      <div class="checkin-wrap" style="padding:6px 0 4px">
        <button class="lucky-btn" id="luckyBtn" onclick="doLucky()">🍀<span class="sub">행운 버튼</span></button>
        <div class="deadline-note" id="luckyMsg">하루에 한 번, <b>행운의 순간</b>에 누르면 선물이 있어요!</div>
      </div>
    </div>
  </div>

  <!-- 탭 3: 상점 -->
  <div id="tab-shop" class="hidden">
    <div class="card hidden" id="drawCard">
      <h3>🍀 행운 뽑기 <span style="color:var(--muted);font-weight:400">— 상점 쿠폰과 별개예요</span></h3>
      <div class="draw-cost" id="drawCost"></div>
      <button class="draw-btn" id="drawBtn" onclick="doDraw()">뽑기!</button>
      <p style="font-size:13px;color:var(--muted);margin-top:12px;text-align:center">
        무엇이 나올지는 뽑아야 알 수 있어요 🤫</p>
    </div>
    <div class="card">
      <h3>🎟️ 쿠폰 상점 <span style="float:right;color:var(--muted);font-weight:400" id="shopBalance"></span></h3>
      <div class="discount-box hidden" id="discountBox">
        <label><input type="checkbox" id="useDiscount" onchange="render()">🎟️ 50% 할인권 쓰기 (<span id="discountCount"></span>장 있음)</label>
        <div class="sub">켜고 쿠폰을 사면 <b>반값</b>에 살 수 있어요. 한 번 사면 할인권 한 장이 없어져요.</div>
      </div>
      <div id="itemsBox"></div>
    </div>
    <div class="card">
      <h3>🎫 내 보유 쿠폰</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:8px">쿠폰을 쓸 때는 선생님이나 마트 직원에게 말씀드리세요.</p>
      <div id="myCouponsBox"></div>
    </div>
    <div class="card hidden" id="couponAuthorityCard">
      <h3>🏪 마트 직원 업무: 사용 대기 쿠폰 처리</h3>
      <div id="pendingCouponsBox"></div>
    </div>
  </div>

  <!-- 탭 4: 은행 (적금·대출·기부) -->
  <div id="tab-bank" class="hidden">
    <div class="card asset-card">
      <div class="label">내 전체 재산</div>
      <div class="amount"><span id="assetTotal">0</span><small id="curName2"></small></div>
      <div class="parts" id="assetParts"></div>
    </div>

    <!-- 적금 -->
    <div class="card" id="savingsCard">
      <h3>🐷 적금 <span style="float:right;color:var(--muted);font-weight:400" id="savingsSummary"></span></h3>
      <div class="bank-row">
        <input id="depAmount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="넣을 금액">
        <button class="btn-green" id="depBtn" onclick="doDeposit()">적금 넣기</button>
      </div>
      <div class="rule" id="savingsRule"></div>
      <div id="myDepositsBox" style="margin-top:6px"></div>
    </div>

    <!-- 대출 -->
    <div class="card" id="loanCard">
      <h3>🏦 대출</h3>
      <div id="loanBox"></div>
      <div class="rule" id="loanRule"></div>
    </div>

    <!-- 기부 -->
    <div class="card" id="donateCard">
      <h3>💝 기부</h3>
      <div id="donateBox"></div>
      <div class="bank-row">
        <input id="donAmount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="기부할 금액">
        <button class="btn-gold" id="donBtn" onclick="doDonate()">기부하기</button>
      </div>
      <div class="rule" id="donateRule"></div>
      <div id="donateHistBox" style="margin-top:6px"></div>
    </div>
  </div>

  <!-- 탭 5: 주식 -->
  <div id="tab-stock" class="hidden">
    <div class="card">
      <h3>📊 내 주식 <span style="float:right;color:var(--muted);font-weight:400" id="stockSummary"></span></h3>
      <div id="myStocksBox"></div>
    </div>
    <div class="card">
      <h3>💹 주식 시장 <span style="float:right;color:var(--muted);font-weight:400" id="stockBalance"></span></h3>
      <div id="stockListBox"></div>
      <p style="font-size:13px;color:var(--muted);margin-top:10px" id="stockNote">
        값이 오를지 내릴지는 선생님이 정해요. 싸게 사서 비싸게 팔면 이득이에요!</p>
    </div>
  </div>

  <!-- 탭 6: 내 정보 -->
  <div id="tab-info" class="hidden">
    <div class="card">
      <h3>👤 내 정보</h3>
      <div class="payrow"><span class="k">번호</span><span class="v" id="infoNumber"></span></div>
      <div class="payrow"><span class="k">직업</span><span class="v" id="infoJob"></span></div>
      <div class="field" style="margin-top:14px;margin-bottom:8px">
        <label>내 별명 (내가 바꿀 수 있어요)</label>
        <input id="nickInput" maxlength="10" placeholder="예: 초코">
      </div>
      <div class="err" id="nickErr" style="min-height:0;margin:0 0 10px"></div>
      <button class="btn-big" onclick="doSetNickname()">별명 바꾸기</button>
    </div>
    <div class="card">
      <h3>🧑‍🤝‍🧑 내 모둠</h3>
      <p id="groupHint" style="font-size:14px;color:var(--ink2);margin-bottom:10px"></p>
      <div class="field" style="margin-bottom:0">
        <select id="groupSelect" onchange="doSetGroup(this.value)"></select>
      </div>
    </div>
    <div class="card">
      <h3>📋 우리 반 직업 현황</h3>
      <div id="classmatesBox"></div>
    </div>
  </div>

  <div class="tabs">
    <button id="tabBtn-wallet" class="on" onclick="showTab('wallet')"><span class="ico">👛</span>내 지갑</button>
    <button id="tabBtn-checkin" onclick="showTab('checkin')"><span class="ico">✅</span>출근</button>
    <button id="tabBtn-shop" onclick="showTab('shop')"><span class="ico">🛒</span>상점</button>
    <button id="tabBtn-bank" onclick="showTab('bank')"><span class="ico">🏦</span>은행</button>
    <button id="tabBtn-stock" onclick="showTab('stock')"><span class="ico">📈</span>주식</button>
    <button id="tabBtn-info" onclick="showTab('info')"><span class="ico">👤</span>내 정보</button>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
let state = null;
let cur = "";

function auth(){ try{ return JSON.parse(localStorage.getItem("bankAuth")); }catch(e){ return null; } }
async function api(path, body){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body||{})});
  return await r.json();
}
function fmt(n){ return Number(n).toLocaleString("ko-KR", {maximumFractionDigits:2}); }
function fmtStock(n){ return Number(n).toLocaleString("ko-KR", {minimumFractionDigits:2, maximumFractionDigits:2}); }
function money(n){ return Math.round((Number(n)||0)*100)/100; }
function toast(msg){
  const t = document.createElement("div"); t.id = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(), 2200);
}

// ══════════ 연타 방지 ══════════
// 인터넷이 느리면 "눌렀는데 아무 반응이 없네?" 하고 여러 번 누르게 되고,
// 그 요청이 모두 서버에 도착해 같은 주문이 여러 건 체결된다.
// ① 요청이 끝나기 전에는 다음 요청을 아예 보내지 않는다.
// ② 주식은 서버가 정한 시간(기본 3초)이 지나야 다시 사고팔 수 있다.
let acting = false;                 // 지금 서버에 요청을 보내는 중인가?
let tradeReadyAt = 0;               // 이 시각(ms)이 지나야 다시 사고팔 수 있다
let tradeTimer = null;
function tradeWaitLeft(){ return Math.max(0, Math.ceil((tradeReadyAt - Date.now())/1000)); }
function startTradeTimer(){
  if(tradeTimer) return;
  tradeTimer = setInterval(()=>{
    if(state) renderStocks();
    if(tradeWaitLeft() <= 0){ clearInterval(tradeTimer); tradeTimer = null; }
  }, 1000);
}
function markTraded(){
  const cool = Number((state && state.tradeCooldown) || 0);
  if(cool > 0){ tradeReadyAt = Date.now() + cool*1000; startTradeTimer(); }
}

// ── 로그인 ──
async function doLogin(){
  const a = { classCode:$("inCode").value.trim(), number:$("inNum").value.trim(), pin:$("inPin").value.trim() };
  if(!a.classCode || !a.number || !a.pin){ $("loginErr").textContent = "모든 칸을 채워 주세요."; return; }
  const r = await api("/api/login", {role:"student", ...a});
  if(r.ok){ localStorage.setItem("bankAuth", JSON.stringify(a)); load(); }
  else $("loginErr").textContent = r.error || "로그인 실패";
}
function logout(){ localStorage.removeItem("bankAuth"); location.reload(); }

// ── 데이터 로드 & 렌더 ──
async function load(){
  const a = auth();
  if(!a){ showLogin(); return; }
  const r = await api("/api/student/home", {auth:a});
  if(!r.ok){ showLogin(); return; }
  state = r; cur = r.currencyName;
  if(Number(r.tradeWait) > 0){ tradeReadyAt = Math.max(tradeReadyAt, Date.now() + Number(r.tradeWait)*1000); startTradeTimer(); }
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  render();
}
function showLogin(){
  $("appView").classList.add("hidden");
  $("loginView").classList.remove("hidden");
  const a = auth(); if(a) $("inCode").value = a.classCode;
}
function render(){
  $("whoName").textContent = \`\${state.number}번 \${state.nickname}\`;
  $("whoJob").textContent = \`직업: \${state.jobName}\`;
  $("balance").textContent = fmt(state.balance);
  $("curName1").textContent = cur;
  // 급여 미리보기
  const p = state.preview;
  $("previewBox").innerHTML = p.days === 0
    ? \`<div class="empty">이번 주에 아직 출근 기록이 없어요.</div>\`
    : \`<div class="payrow"><span class="k">출근 일수</span><span class="v">\${p.days}일\${p.late?\` (지각 \${p.late}일)\`:""}</span></div>
       <div class="payrow"><span class="k">일급 (출근할 때 이미 받음)</span><span class="v">\${fmt(p.base)} \${cur}</span></div>
       <div class="payrow total"><span class="k">주급으로 받을 직업 수당</span><span class="v">\${fmt(p.net)} \${cur}</span></div>
       <p style="font-size:13px;color:var(--muted);margin-top:8px">직업 수당은 한 주에 받는 정해진 금액이에요.</p>\`;
  // 이번 주 세금 (정해진 요일·시각에 자동 차감)
  const DAYS = ["","월","화","수","목","금","토","일"];
  const when = \`\${DAYS[state.taxWeekday]||"금"}요일 \${state.taxTime||"09:00"}\`;
  $("taxBox").innerHTML =
    \`<div class="payrow"><span class="k">이번 주에 번 돈</span><span class="v">\${fmt(state.weekIncome)} \${cur}</span></div>
     <div class="payrow"><span class="k">세율</span><span class="v">\${state.taxRate}%</span></div>
     <div class="payrow total"><span class="k">낼 세금</span><span class="v minus">- \${fmt(state.weekTax)} \${cur}</span></div>
     <p style="font-size:13px;color:var(--muted);margin-top:10px">\${when}에 자동으로 빠져나가요. 그때까지 더 벌면 세금도 늘어나요!</p>\`;
  // 지난 명세서
  const s = state.lastPayslip;
  if(s && s.paidAt){
    $("payslipCard").classList.remove("hidden");
    $("payslipBox").innerHTML =
      \`<div class="payrow"><span class="k">지급일</span><span class="v">\${s.paidAt.substring(0,10)}</span></div>
       <div class="payrow"><span class="k">일급 (\${s.days}일, 출근할 때 받음)</span><span class="v">\${fmt(s.base)} \${cur}</span></div>
       <div class="payrow total"><span class="k">받은 직업 수당</span><span class="v">\${fmt(s.net)} \${cur}</span></div>\`;
  } else $("payslipCard").classList.add("hidden");
  // 모둠 회계사: 지급 권한
  if(state.payAuthority){
    $("payAuthorityCard").classList.remove("hidden");
    const remain = Math.max(0, state.payLimitPerDay - state.paidToday);
    $("payLimitNote").textContent = \`1회 최대 \${fmt(state.payLimitPerTx)} \${cur} · 오늘 남은 한도 \${fmt(remain)} \${cur}\`;
    $("payTarget").innerHTML = state.groupmates.length === 0
      ? \`<option value="">먼저 [내 정보]에서 모둠을 정해 주세요</option>\`
      : state.groupmates.map(g=>\`<option value="\${g.id}">\${g.number}번 \${esc(g.nickname)}\${g.isMe?" (나)":""}</option>\`).join("");
  } else {
    $("payAuthorityCard").classList.add("hidden");
  }
  // 최근 거래
  $("recentBox").innerHTML = state.recent.length === 0
    ? \`<div class="empty">아직 거래가 없어요.</div>\`
    : state.recent.map(t=>{
        const plus = t.amount >= 0;
        return \`<div class="txrow"><div><div class="memo">\${esc(t.memo)}</div><div class="date">\${t.createdAt.substring(0,16)}</div></div>
          <div class="amt \${plus?"plus":"minus"}">\${plus?"+":""}\${fmt(t.amount)}</div></div>\`;
      }).join("");
  // 출근
  const btn = $("checkinBtn");
  if(state.today.checked){
    btn.disabled = true;
    btn.innerHTML = \`출근 완료<span class="sub">\${state.today.time} · \${state.today.status}</span>\`;
  } else {
    btn.disabled = false;
    btn.innerHTML = \`출근하기<span class="sub">오늘 아직 안 했어요</span>\`;
  }
  $("deadlineNote").textContent = \`⏰ \${state.deadline} 이후 체크하면 지각 처리돼요.\`;
  // 행운 버튼
  $("luckyCard").classList.toggle("hidden", state.luckyEnabled === false);
  if(state.luckyEnabled !== false){
    const done = !!state.luckyDoneToday;
    $("luckyBtn").disabled = done;
    $("luckyMsg").innerHTML = done
      ? "오늘은 이미 행운을 받았어요! 내일 또 눌러 보세요 😊"
      : "하루에 한 번, <b>행운의 순간</b>에 누르면 선물이 있어요!";
  }
  // 상점
  $("shopBalance").textContent = \`잔액 \${fmt(state.balance)} \${cur}\`;
  // 50% 할인권
  const tickets = Number(state.discountTickets)||0;
  $("discountBox").classList.toggle("hidden", tickets === 0);
  if(tickets === 0) $("useDiscount").checked = false;
  $("discountCount").textContent = tickets;
  const useDc = tickets > 0 && $("useDiscount").checked;
  $("itemsBox").innerHTML = state.items.length === 0
    ? \`<div class="empty">아직 등록된 쿠폰이 없어요.</div>\`
    : state.items.map(it=>{
        const price = useDc ? money(it.price/2) : money(it.price);
        const soldout = it.stock <= 0;
        const poor = state.balance < price;
        return \`<div class="item"><div><div class="name">\${esc(it.name)}</div><div class="meta">남은 수량 \${it.stock}개</div></div>
          <button class="buy-btn" \${soldout||poor?"disabled":""} onclick="doBuy(\${it.id},'\${esc(it.name)}',\${price})">
          \${soldout?"품절":\`\${useDc?\`<span class="price-was">\${fmt(it.price)}</span>\`:""}\${fmt(price)} \${cur}\`}</button></div>\`;
      }).join("");
  $("myCouponsBox").innerHTML = state.myPurchases.length === 0
    ? \`<div class="empty">보유한 쿠폰이 없어요.</div>\`
    : state.myPurchases.map(p=>
        \`<div class="coupon"><div><div class="name">\${esc(p.name)}</div><div class="date">\${p.createdAt.substring(0,10)} 구매</div></div>
         <span class="badge \${p.status==="보유"?"hold":"used"}">\${p.status}</span></div>\`).join("");
  // 행운 뽑기 (선생님이 꺼 두면 카드 자체가 보이지 않음)
  $("drawCard").classList.toggle("hidden", state.drawEnabled === false);
  if(state.drawEnabled !== false){
    const cost = Number(state.drawCost)||0;
    $("drawCost").innerHTML = cost>0
      ? \`뽑기 한 번 · <b>\${fmt(cost)} \${cur}</b> &nbsp;|&nbsp; 내 잔액 \${fmt(state.balance)} \${cur}\`
      : \`지금은 <b>무료</b>로 뽑을 수 있어요!\`;
    const has = state.drawAvailable === true;
    $("drawBtn").disabled = !(has && state.balance >= cost);
    $("drawBtn").textContent = !has ? "아직 뽑기 상품이 없어요"
      : (state.balance < cost ? "돈이 모자라요" : "뽑기!");
  }
  // 마트 직원: 쿠폰 사용 처리 권한
  if(state.couponAuthority){
    $("couponAuthorityCard").classList.remove("hidden");
    $("pendingCouponsBox").innerHTML = state.pendingCoupons.length === 0
      ? \`<div class="empty">사용 대기 중인 쿠폰이 없어요.</div>\`
      : state.pendingCoupons.map(p=>
          \`<div class="item"><div><div class="name">\${esc(p.itemName)}</div><div class="meta">\${p.number}번 \${esc(p.nickname)} · \${p.createdAt.substring(5,16)}</div></div>
           <button class="buy-btn" onclick="doUseCoupon(\${p.id})">처리</button></div>\`).join("");
  } else {
    $("couponAuthorityCard").classList.add("hidden");
  }
  renderInfo();
  renderThanks();
  renderStocks();
  renderBank();
}

// ══════════ 은행 (적금 · 대출 · 기부) ══════════
function renderBank(){
  const b = state.bank;
  const on = !!(b && b.enabled);
  $("tabBtn-bank").classList.toggle("hidden", !on);
  if(!on){
    if(!$("tab-bank").classList.contains("hidden")) showTab("wallet");
    return;
  }
  // 내 전체 재산 = 현금 + 적금 평가액 + 주식 평가액
  $("curName2").textContent = cur;
  $("assetTotal").textContent = fmt(b.assets.total);
  $("assetParts").innerHTML =
    \`현금 \${fmt(b.assets.cash)} + 적금 \${fmt(b.assets.savings)} + 주식 \${fmt(b.assets.stock)}\`
    + (b.loan.current ? \`<br>※ 아직 갚지 않은 대출 \${fmt(b.loan.current.principal)} \${cur}\` : "");

  // ── 적금 ──
  const sv = b.savings;
  $("savingsCard").classList.toggle("hidden", !sv.enabled);
  if(sv.enabled){
    const room = money(Math.max(0, sv.max - sv.principal));
    $("savingsSummary").innerHTML = sv.deposits.length === 0 ? "" :
      \`원금 \${fmt(sv.principal)} · 평가액 <b>\${fmt(sv.value)}</b> \${cur}\`;
    $("depBtn").disabled = !(room > 0 && state.balance > 0);
    $("depAmount").placeholder = room > 0 ? \`넣을 금액 (최대 \${fmt(Math.min(room, state.balance))})\` : "더 넣을 수 없어요";
    $("savingsRule").innerHTML =
      \`· 한 사람이 넣을 수 있는 적금은 모두 합쳐 <b>\${fmt(sv.max)} \${cur}</b>까지예요. (지금 더 넣을 수 있는 금액 \${fmt(room)} \${cur})<br>
       · 이자는 <b>\${sv.periodDays}일마다 \${sv.rate}%</b>씩 <b>복리</b>로 불어나요. (이자에 또 이자가 붙어요!)<br>
       · 넣고 <b>\${sv.lockDays}일</b> 동안은 해약할 수 없어요. 부득이하게 해약하면 <b>이자 없이 원금만</b> 돌려받아요.\`;
    $("myDepositsBox").innerHTML = sv.deposits.length === 0
      ? \`<div class="empty">아직 넣은 적금이 없어요.</div>\`
      : sv.deposits.map(d=>\`<div class="dep">
          <div class="dep-top">
            <div><div class="nm">원금 \${fmt(d.amount)} \${cur}</div>
              <div class="sub">\${d.createdAt.substring(0,10)} 시작 · 이자 \${d.periods}번 붙음<br>
                \${d.locked
                  ? \`<span class="badge lock">🔒 \${d.daysLeft}일 남음</span> \${d.matureAt.substring(0,10)}부터 이자까지 받을 수 있어요\`
                  : \`<span class="badge ready">✅ 찾을 수 있어요</span> 이자까지 함께 받아요\`}</div></div>
            <div class="val">\${fmt(d.value)}<small>이자 +\${fmt(d.interest)}</small></div>
          </div>
          <div class="dep-act">
            \${d.locked
              ? \`<button class="btn-break" onclick="doWithdraw(\${d.id},true)">부득이하게 해약 (원금만)</button>\`
              : \`<button class="btn-take" onclick="doWithdraw(\${d.id},false)">이자까지 찾기</button>\`}
          </div></div>\`).join("");
  }

  // ── 대출 ──
  const ln = b.loan;
  $("loanCard").classList.toggle("hidden", !ln.enabled);
  if(ln.enabled){
    if(ln.current){
      const c = ln.current;
      $("loanBox").innerHTML =
        \`<div class="payrow"><span class="k">아직 갚지 않은 원금</span><span class="v minus">\${fmt(c.principal)} \${cur}</span></div>
         <div class="payrow"><span class="k">빌린 날</span><span class="v">\${c.createdAt.substring(0,10)}</span></div>
         <div class="payrow"><span class="k">한 주 이자 (\${ln.rate}%)</span><span class="v minus">\${fmt(c.weekInterest)} \${cur}</span></div>
         <div class="payrow"><span class="k">다음 이자 빠지는 날</span><span class="v">\${c.nextInterestAt.substring(0,10)} (\${c.daysToInterest}일 뒤)</span></div>
         <div class="payrow total"><span class="k">지금까지 낸 이자</span><span class="v minus">\${fmt(c.interestPaid)} \${cur}</span></div>
         <div class="bank-row">
           <input id="repayAmount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="갚을 금액 (최대 \${fmt(c.principal)})">
           <button class="btn-green" onclick="doRepay()">갚기</button>
         </div>\`;
    } else {
      const canBorrow = ln.limit > 0;
      $("loanBox").innerHTML =
        \`<div class="payrow"><span class="k">내 주급 (직업 수당)</span><span class="v">\${fmt(ln.weeklyPay)} \${cur}</span></div>
         <div class="payrow total"><span class="k">빌릴 수 있는 최대 금액</span><span class="v">\${fmt(ln.limit)} \${cur}</span></div>
         <div class="bank-row">
           <input id="loanAmount" type="number" step="0.01" min="0.01" inputmode="decimal" placeholder="\${canBorrow?\`빌릴 금액 (최대 \${fmt(ln.limit)})\`:"직업이 없으면 빌릴 수 없어요"}" \${canBorrow?"":"disabled"}>
           <button \${canBorrow?"":"disabled"} onclick="doLoan()">대출 받기</button>
         </div>\`;
    }
    $("loanRule").innerHTML =
      \`· 대출은 <b>한 번에 하나</b>만 받을 수 있어요. 다 갚기 전에는 또 빌릴 수 없어요.<br>
       · 이자는 <b>일주일에 \${ln.rate}%</b>이고, 일주일이 지날 때마다 <b>자동으로 잔액에서 빠져나가요.</b><br>
       · 빌릴 수 있는 돈은 <b>내 주급의 \${ln.multiplier}배</b>까지예요. 원금을 갚기 전까지 이자는 계속 나가요!\`;
  }

  // ── 기부 ──
  const dn = b.donation;
  $("donateCard").classList.toggle("hidden", !dn.enabled);
  if(dn.enabled){
    const pct = Math.min(100, Math.round(dn.pool / Math.max(1, dn.threshold) * 100));
    $("donateBox").innerHTML =
      \`<div class="bar"><span style="width:\${pct}%"></span></div>
       <div class="payrow"><span class="k">지금까지 모인 기부금</span><span class="v">\${fmt(dn.pool)} / \${fmt(dn.threshold)} \${cur}</span></div>
       <div class="payrow"><span class="k">목표까지</span><span class="v">\${fmt(Math.max(0, dn.threshold - dn.pool))} \${cur}</span></div>
       <div class="payrow total"><span class="k">내가 기부한 금액</span><span class="v">\${fmt(dn.myTotal)} \${cur}</span></div>\`;
    $("donBtn").disabled = state.balance <= 0;
    $("donateRule").innerHTML =
      \`· 기부는 <b>마음이 있는 사람만</b> 하면 돼요. 얼마든지 괜찮아요.<br>
       · 모인 기부금이 <b>\${fmt(dn.threshold)} \${cur}</b>이 되면, 우리 반에서 <b>남은 재산이 가장 적은 친구</b>에게 모두 전해져요.<br>
       · 남은 재산은 <b>현금 + 적금 평가액 + 주식 평가액</b>으로 계산해요.\`;
    $("donateHistBox").innerHTML = dn.recent.length === 0
      ? \`<div class="empty">아직 나눔이 이루어진 적이 없어요.</div>\`
      : \`<h3 style="margin-top:14px">🤝 우리 반 나눔 기록</h3>\` + dn.recent.map(g=>
          \`<div class="txrow"><div><div class="memo">\${g.number}번 \${esc(g.nickname)} 에게</div>
            <div class="date">\${g.createdAt.substring(0,16)}</div></div>
           <div class="amt plus">+\${fmt(g.amount)}</div></div>\`).join("");
  }
}
async function doDeposit(){
  const amount = money($("depAmount").value);
  if(amount < 0.01){ toast("넣을 금액을 적어 주세요."); return; }
  const sv = state.bank.savings;
  if(!confirm(\`\${fmt(amount)} \${cur}을(를) 적금에 넣을까요?\\n\\n· \${sv.periodDays}일마다 \${sv.rate}% 복리로 이자가 붙어요.\\n· \${sv.lockDays}일 안에 해약하면 이자 없이 원금만 돌려받아요.\`)) return;
  const r = await api("/api/student/bank/deposit", {auth:auth(), amount});
  if(r.ok){ toast(\`적금에 \${fmt(amount)} \${cur} 넣었어요! 🐷\`); $("depAmount").value=""; load(); }
  else toast(r.error || "적금에 넣지 못했어요.");
}
async function doWithdraw(depositId, early){
  const q = early
    ? "아직 기간이 안 됐어요.\\n\\n부득이하게 해약하면 이자는 받지 못하고 원금만 돌려받아요.\\n정말 해약할까요?"
    : "적금을 찾을까요? 원금과 이자를 모두 받아요 🎉";
  if(!confirm(q)) return;
  const r = await api("/api/student/bank/withdraw", {auth:auth(), depositId, early:!!early});
  if(r.ok){ toast(\`\${fmt(r.received)} \${cur} 받았어요!\${r.interest>0?\` (이자 \${fmt(r.interest)})\`:" (원금만)"}\`); load(); }
  else toast(r.error || "해지하지 못했어요.");
}
async function doLoan(){
  const amount = money(($("loanAmount")||{}).value);
  if(amount < 0.01){ toast("빌릴 금액을 적어 주세요."); return; }
  const ln = state.bank.loan;
  if(!confirm(\`\${fmt(amount)} \${cur}을(를) 빌릴까요?\\n\\n· 이자는 일주일에 \${ln.rate}%이고 자동으로 빠져나가요.\\n· 다 갚기 전에는 또 빌릴 수 없어요.\`)) return;
  const r = await api("/api/student/bank/loan", {auth:auth(), amount});
  if(r.ok){ toast(\`\${fmt(amount)} \${cur} 빌렸어요. 꼭 갚기로 약속! 🏦\`); load(); }
  else toast(r.error || "대출을 받지 못했어요.");
}
async function doRepay(){
  const amount = money(($("repayAmount")||{}).value);
  if(amount < 0.01){ toast("갚을 금액을 적어 주세요."); return; }
  const r = await api("/api/student/bank/repay", {auth:auth(), amount});
  if(r.ok){ toast(r.cleared ? "대출을 모두 갚았어요! 🎉" : \`\${fmt(amount)} \${cur} 갚았어요. 남은 원금 \${fmt(r.principal)}\`); load(); }
  else toast(r.error || "갚지 못했어요.");
}
async function doDonate(){
  const amount = money($("donAmount").value);
  if(amount < 0.01){ toast("기부할 금액을 적어 주세요."); return; }
  if(!confirm(\`\${fmt(amount)} \${cur}을(를) 기부할까요?\\n\\n기부한 돈은 돌려받을 수 없어요.\\n모인 돈은 우리 반에서 가장 어려운 친구에게 전해져요.\`)) return;
  const r = await api("/api/student/bank/donate", {auth:auth(), amount});
  if(r.ok){
    $("donAmount").value="";
    if(r.granted) { toast(\`나눔 완료! \${r.grantTo}에게 \${fmt(r.grantAmount)} \${cur}이 전해졌어요 💝\`); confetti(); playWinSound(); }
    else toast(\`\${fmt(amount)} \${cur} 기부했어요. 고마워요 💝\`);
    load();
  }
  else toast(r.error || "기부하지 못했어요.");
}

// ── 주식 ──
function chgHtml(c){
  const cls = c > 0 ? "up" : (c < 0 ? "down" : "flat");
  const mark = c > 0 ? "▲" : (c < 0 ? "▼" : "―");
  return \`<span class="chg \${cls}">\${mark} \${Math.abs(c)}%</span>\`;
}
function sparkline(hist){
  const h = (hist||[]).map(Number).filter(n=>!isNaN(n));
  if(h.length < 2) return "";
  const W = 96, H = 26, min = Math.min(...h), max = Math.max(...h), span = (max-min) || 1;
  const pts = h.map((v,i)=>\`\${(W*i/(h.length-1)).toFixed(1)},\${(H - (v-min)/span*(H-4) - 2).toFixed(1)}\`).join(" ");
  const rising = h[h.length-1] >= h[0];
  return \`<svg class="spark" width="\${W}" height="\${H}" viewBox="0 0 \${W} \${H}">
    <polyline points="\${pts}" fill="none" stroke="\${rising?"#d03b3b":"#2a78d6"}" stroke-width="2" stroke-linejoin="round"/></svg>\`;
}
function renderStocks(){
  const on = state.stockEnabled !== false;
  $("tabBtn-stock").classList.toggle("hidden", !on);
  if(!on) return;
  const mine = state.myStocks || [];
  const totalValue = mine.reduce((a,m)=>a+m.value, 0);
  const totalProfit = mine.reduce((a,m)=>a+m.profit, 0);
  $("stockSummary").innerHTML = mine.length===0 ? "" :
    \`평가액 \${fmt(totalValue)} \${cur} · <span class="\${totalProfit>0?"up":(totalProfit<0?"down":"flat")}">\${totalProfit>0?"+":""}\${fmt(totalProfit)}</span>\`;
  const noteEl = $("stockNote");
  if(noteEl) noteEl.innerHTML = Number(state.tradeCooldown) > 0
    ? \`값이 오를지 내릴지는 선생님이 정해요. 싸게 사서 비싸게 팔면 이득이에요!<br>
       ⏳ 너무 빠른 거래를 막기 위해 <b>\${state.tradeCooldown}초에 한 번만</b> 사고팔 수 있어요.\`
    : "값이 오를지 내릴지는 선생님이 정해요. 싸게 사서 비싸게 팔면 이득이에요!";
  $("myStocksBox").innerHTML = mine.length===0
    ? \`<div class="empty">아직 가진 주식이 없어요. 아래에서 사 보세요!</div>\`
    : mine.map(m=>\`<div class="stk"><div class="stk-top">
        <div><div class="nm">\${esc(m.name)} <span style="font-size:13px;color:var(--muted)">\${m.qty}주</span></div>
          <div class="sub">산 값 평균 \${fmtStock(m.avgCost)} → 지금 \${fmtStock(m.price)}</div></div>
        <div style="text-align:right"><div class="pr">\${fmt(m.value)}</div>
          <div class="sub \${m.profit>0?"up":(m.profit<0?"down":"flat")}" style="font-weight:800">\${m.profit>0?"+":""}\${fmt(m.profit)}</div></div>
      </div></div>\`).join("");
  $("stockBalance").textContent = \`잔액 \${fmt(state.balance)} \${cur}\`;
  const wait = tradeWaitLeft();   // 연타 방지: 남은 대기 시간(초)
  const list = state.stocks || [];
  $("stockListBox").innerHTML = list.length===0
    ? \`<div class="empty">선생님이 주식 종목을 만들면 보여요.</div>\`
    : list.map(x=>{
        const held = mine.find(m=>m.stockId===x.id);
        const own = held ? held.qty : 0;
        return \`<div class="stk">
          <div class="stk-top">
            <div><div class="nm">\${esc(x.name)}</div>
              <div class="sub">\${own>0?\`내가 \${own}주 보유\`:"보유 없음"}</div>
              \${sparkline(x.history)}</div>
            <div class="pr">\${fmtStock(x.price)}\${chgHtml(x.change)}</div>
          </div>
          <div class="stk-act">
            <input id="q-\${x.id}" type="number" inputmode="numeric" min="1" value="1">
            <button class="btn-buy" \${(wait>0 || state.balance < x.price) ? "disabled":""} onclick="doStockBuy(\${x.id},'\${esc(x.name)}')">\${wait>0?wait+"초":"사기"}</button>
            <button class="btn-sell" \${(wait>0 || own===0)?"disabled":""} onclick="doStockSell(\${x.id},'\${esc(x.name)}')">\${wait>0?wait+"초":"팔기"}</button>
          </div></div>\`;
      }).join("");
}
async function doStockBuy(stockId, name){
  const qty = Number(($("q-"+stockId)||{}).value)||0;
  if(tradeWaitLeft() > 0){ toast(\`\${tradeWaitLeft()}초 뒤에 다시 눌러 주세요 ⏳\`); return; }
  const r = await api("/api/student/stock/buy", {auth:auth(), stockId, qty});
  if(r.ok){ markTraded(); toast(\`\${name} \${qty}주 샀어요! 📈\`); load(); }
  else toast(r.error || "매수 실패");
}
async function doStockSell(stockId, name){
  const qty = Number(($("q-"+stockId)||{}).value)||0;
  if(tradeWaitLeft() > 0){ toast(\`\${tradeWaitLeft()}초 뒤에 다시 눌러 주세요 ⏳\`); return; }
  const r = await api("/api/student/stock/sell", {auth:auth(), stockId, qty});
  if(r.ok){ markTraded(); toast(\`\${name} \${qty}주 팔았어요! 💰\`); load(); }
  else toast(r.error || "매도 실패");
}

// ── 선생님께 감사한 마음 ──
const THANKS = [
  "우리 반 학급은행은 선생님이 밤늦게까지 준비해 주신 거예요. 고맙습니다 💛",
  "오늘 받은 돈은 선생님이 우리를 위해 만들어 주신 기회예요.",
  "선생님이 매일 우리 출근을 챙겨 주셔서 은행이 돌아가요. 감사합니다!",
  "돈을 벌 수 있는 건 선생님이 직업을 만들어 주셨기 때문이에요.",
  "선생님, 우리 반을 위해 애써 주셔서 고맙습니다 🙇",
  "학급은행은 선생님의 선물이에요. 오늘 '감사합니다' 한마디 어때요?",
  "선생님 덕분에 우리는 돈과 세금을 직접 배우고 있어요.",
  "쿠폰도 상점도 모두 선생님이 하나하나 준비하신 거랍니다.",
  "선생님이 우리를 믿어 주셔서 우리 손으로 은행을 운영할 수 있어요.",
  "오늘도 우리 반을 위해 힘써 주시는 선생님, 정말 감사합니다 ✨",
];
function renderThanks(){
  $("thanksMsg").textContent = THANKS[Math.floor(Math.random()*THANKS.length)];
}
function renderInfo(){
  $("infoNumber").textContent = \`\${state.number}번\`;
  $("infoJob").textContent = state.jobName;
  if(document.activeElement !== $("nickInput")) $("nickInput").value = state.nickname;
  $("nickErr").textContent = "";
  const g = Number(state.group) || 0;
  $("groupHint").textContent = g
    ? \`지금은 \${g}모둠이에요. 바꾸려면 아래에서 다시 골라 주세요.\`
    : "아직 모둠이 정해지지 않았어요. 우리 모둠을 골라 주세요!";
  $("groupSelect").innerHTML = \`<option value="">모둠을 골라 주세요</option>\`
    + [1,2,3,4,5,6].map(n=>\`<option value="\${n}" \${n===g?"selected":""}>\${n}모둠</option>\`).join("");
  $("classmatesBox").innerHTML = state.classmates.length===0
    ? \`<div class="empty">등록된 학생이 없어요.</div>\`
    : state.classmates.map(c=>\`<div class="mate-row"><div><div class="who">\${c.number}번 \${esc(c.nickname)}</div><div class="job">\${esc(c.jobName)}</div></div><span class="grp">\${c.group?c.group+"모둠":"모둠 미정"}</span></div>\`).join("");
}
async function doSetNickname(){
  const nickname = $("nickInput").value.trim();
  $("nickErr").textContent = "";
  if(!nickname){ $("nickErr").textContent = "별명을 입력해 주세요."; return; }
  if(nickname === state.nickname){ toast("지금 별명과 같아요."); return; }
  const r = await api("/api/student/setNickname", {auth:auth(), nickname});
  if(r.ok){ toast(\`별명을 '\${r.nickname}'(으)로 바꿨어요! ✨\`); load(); }
  else $("nickErr").textContent = r.error || "별명 변경 실패";
}
async function doSetGroup(g){
  if(!g){ return; }
  const r = await api("/api/student/setGroup", {auth:auth(), group:Number(g)});
  if(r.ok){ toast(\`\${g}모둠으로 정했어요! 🎉\`); load(); }
  else { toast(r.error || "모둠 설정 실패"); load(); }
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

// ── 탭 ──
function showTab(name){
  for(const t of ["wallet","checkin","shop","bank","stock","info"]){
    $("tab-"+t).classList.toggle("hidden", t!==name);
    $("tabBtn-"+t).classList.toggle("on", t===name);
  }
}

// ── 출근 ──
async function doCheckin(){
  const r = await api("/api/student/checkin", {auth:auth()});
  if(!r.ok){ toast(r.error || "출근 체크 실패"); return; }
  const wrap = document.createElement("div");
  wrap.className = "stamp";
  wrap.innerHTML = \`<div class="seal"><div class="big">출근<br>완료!</div><div class="small">\${r.time} · \${r.status}<br>일급 +\${fmt(r.pay)} \${cur} 받았어요!</div></div>\`;
  document.body.appendChild(wrap);
  setTimeout(()=>{ wrap.remove(); load(); }, 1600);
}

// ── 구매 ──
async function doBuy(itemId, name, price){
  const useDiscount = (Number(state.discountTickets)||0) > 0 && $("useDiscount").checked;
  const q = useDiscount ? \`'\${name}' 쿠폰을 50% 할인권으로 \${fmt(price)} \${cur}에 살까요?\\n(할인권 한 장이 사용됩니다)\`
                        : \`'\${name}' 쿠폰을 \${fmt(price)} \${cur}에 살까요?\`;
  if(!confirm(q)) return;
  const r = await api("/api/student/buy", {auth:auth(), itemId, useDiscount});
  if(r.ok){ toast(useDiscount ? "반값에 샀어요! 🎉" : "구매 완료! 🎉"); $("useDiscount").checked = false; load(); }
  else toast(r.error || "구매 실패");
}

// ── 모둠 회계사: 지급 ──
async function doGroupPay(){
  const targetId = Number($("payTarget").value);
  const amount = Number($("payAmount").value);
  const memo = $("payMemo").value.trim();
  $("payErr").textContent = "";
  if(!targetId){ $("payErr").textContent = "지급할 모둠원을 선택하세요."; return; }
  const r = await api("/api/student/pay", {auth:auth(), targetId, amount, memo});
  if(r.ok){ toast("지급 완료! 💰"); $("payAmount").value=""; $("payMemo").value=""; load(); }
  else $("payErr").textContent = r.error || "지급 실패";
}

// ── 마트 직원: 쿠폰 사용 처리 ──
async function doUseCoupon(purchaseId){
  const r = await api("/api/student/useCoupon", {auth:auth(), purchaseId});
  if(r.ok){ toast("처리 완료! ✅"); load(); }
  else toast(r.error || "처리 실패");
}

// ══════════ 행운 버튼 ══════════
async function doLucky(){
  const btn = $("luckyBtn");
  btn.disabled = true;
  const r = await api("/api/student/lucky", {auth:auth()});
  if(!r.ok){ toast(r.error || "행운 버튼을 쓸 수 없어요."); btn.disabled = false; return; }
  if(r.won){
    $("luckyMsg").innerHTML = \`🎉 <b>행운 당첨! +\${fmt(r.reward)} \${cur}</b>\`;
    playWinSound(); confetti();
    setTimeout(load, 1600);
  } else if(r.reason === "already"){
    $("luckyMsg").textContent = "오늘은 이미 행운을 받았어요! 내일 또 눌러 보세요 😊";
  } else {
    // 시간이 아니면 정말 아무 일도 일어나지 않는다 (살짝 흔들리기만)
    btn.disabled = false;
    btn.classList.remove("nope"); void btn.offsetWidth; btn.classList.add("nope");
    $("luckyMsg").textContent = "아무 일도 일어나지 않았어요… 다음에 또 눌러 보세요!";
  }
}

// ══════════ 행운 뽑기 ══════════
async function doDraw(){
  $("drawBtn").disabled = true;
  const r = await api("/api/student/draw", {auth:auth()});
  if(!r.ok){ toast(r.error || "뽑기 실패"); $("drawBtn").disabled = false; return; }
  showPick(r);
}

// 카드 여러 장 중 하나를 골라 뒤집는다 (결과는 이미 정해져 있고, 고른 자리에 놓인다)
function showPick(res){
  const n = Math.max(2, Math.min(6, Number(res.cardCount) || 3));
  const wrap = document.createElement("div");
  wrap.className = "scratch-wrap";
  wrap.innerHTML =
    \`<div class="scratch-box">
       <h4>🍀 행운 뽑기</h4>
       <div class="hint" id="pickHint">마음에 드는 카드를 한 장 골라 보세요!</div>
       <div class="cards" id="pickCards"></div>
       <button class="scratch-close hidden" id="pickClose">확인</button>
     </div>\`;
  document.body.appendChild(wrap);

  const holder = wrap.querySelector("#pickCards");
  for(let i=0; i<n; i++){
    const c = document.createElement("button");
    c.className = "pcard";
    c.innerHTML =
      \`<div class="pcard-inner">
         <div class="pcard-back"><img src="mascot.png" alt="다람쌤"><div class="lucky">행운</div></div>
         <div class="pcard-front"><div class="pname"></div><div class="ptag"></div></div>
       </div>\`;
    c.onclick = ()=>choose(i);
    holder.appendChild(c);
  }

  let picked = false;
  function choose(idx){
    if(picked) return;
    picked = true;
    const cards = [...holder.children];
    cards.forEach((c, i)=>{
      const isWin = i === idx;
      c.classList.add("done");
      // 고르지 않은 카드는 무엇이었는지 알려 주지 않는다 (상품 구성이 새어 나가지 않도록)
      c.querySelector(".pname").textContent = isWin ? res.name : "…";
      c.querySelector(".ptag").textContent = isWin ? "당첨!" : "아쉬워요";
      if(isWin){ c.classList.add("win"); }
      else { c.classList.add("miss"); }
      // 고른 카드가 먼저, 나머지는 조금 뒤에 뒤집힌다
      setTimeout(()=>c.classList.add("flipped"), isWin ? 0 : 500 + i*90);
    });
    setTimeout(()=>{
      const hint = wrap.querySelector("#pickHint");
      if(res.effect === "randomShop"){
        // 상점 쿠폰 하나가 무작위로 정해지는 화면을 돌린다
        hint.innerHTML = \`<b>\${esc(res.name)}</b> 당첨! 어떤 상점 쿠폰일까요?\`;
        spinShopPrize(wrap, res.bonusName, ()=>{
          hint.innerHTML = \`<b>\${esc(res.bonusName)}</b> 획득! [내 보유 쿠폰]에 들어갔어요 🎉\`;
          wrap.querySelector("#pickClose").classList.remove("hidden");
        });
      } else if(res.effect === "discount50"){
        hint.innerHTML = \`<b>\${esc(res.name)}</b> 당첨! 🎟️<br>상점에서 <b>아무 쿠폰이나 반값</b>에 살 수 있어요.\`;
        wrap.querySelector("#pickClose").classList.remove("hidden");
        playWinSound(); confetti();
      } else {
        hint.innerHTML = \`<b>\${esc(res.name)}</b> 당첨! [내 보유 쿠폰]에 들어갔어요 🎉\`;
        wrap.querySelector("#pickClose").classList.remove("hidden");
        playWinSound(); confetti();
      }
    }, 560);
  }
  wrap.querySelector("#pickClose").onclick = ()=>{ wrap.remove(); load(); };
}

// 상점 쿠폰 이름이 촤르륵 돌아가다가 하나에서 멈춘다
function spinShopPrize(wrap, finalName, onDone){
  const box = document.createElement("div");
  box.className = "slot spin";
  box.innerHTML = \`<div class="cap">🎰 상점 쿠폰 뽑는 중…</div><div class="name"></div>\`;
  wrap.querySelector(".scratch-box").insertBefore(box, wrap.querySelector("#pickClose"));
  const nameEl = box.querySelector(".name");
  // 상점에 있는 이름들로 돌린다 (없으면 결과만 보여 준다)
  const names = (state.items||[]).map(i=>i.name).filter(Boolean);
  const reel = names.length ? names.slice() : [finalName];
  let i = Math.floor(Math.random()*reel.length), elapsed = 0, delay = 55;
  (function tick(){
    nameEl.textContent = reel[i++ % reel.length];
    elapsed += delay;
    if(elapsed < 1900){
      delay = 55 + Math.pow(elapsed/1900, 3) * 260;   // 점점 느려진다
      setTimeout(tick, delay);
    } else {
      box.classList.remove("spin"); box.classList.add("done");
      box.querySelector(".cap").textContent = "🎉 이 쿠폰을 받았어요!";
      nameEl.textContent = finalName;
      playWinSound(); confetti();
      onDone && onDone();
    }
  })();
}

// 당첨 효과음 (파일 없이 브라우저가 직접 소리를 만든다)
function playWinSound(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const ac = new AC();
    [0, .12, .24, .40].forEach((t, i)=>{
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = "triangle";
      o.frequency.value = [523.25, 659.25, 783.99, 1046.5][i];   // 도-미-솔-높은도
      gn.gain.setValueAtTime(0.0001, ac.currentTime + t);
      gn.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + t + .03);
      gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t + .35);
      o.connect(gn); gn.connect(ac.destination);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .4);
    });
    setTimeout(()=>ac.close(), 1500);
  }catch(e){}
}

// 색종이 이펙트
function confetti(){
  const cv = document.createElement("canvas");
  cv.className = "confetti";
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  const colors = ["#eda100","#2a78d6","#0ca30c","#d03b3b","#9b59b6","#ff7ab6"];
  const bits = Array.from({length:120}, ()=>({
    x: innerWidth/2 + (Math.random()-.5)*160, y: innerHeight/2,
    vx: (Math.random()-.5)*11, vy: Math.random()*-13 - 4,
    s: 6 + Math.random()*7, a: Math.random()*Math.PI,
    va: (Math.random()-.5)*.3, c: colors[Math.floor(Math.random()*colors.length)],
  }));
  let frames = 0;
  (function tick(){
    ctx.clearRect(0, 0, cv.width, cv.height);
    for(const b of bits){
      b.vy += 0.42; b.x += b.vx; b.y += b.vy; b.a += b.va;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.fillStyle = b.c; ctx.fillRect(-b.s/2, -b.s/2, b.s, b.s*0.6);
      ctx.restore();
    }
    if(++frames < 150) requestAnimationFrame(tick); else cv.remove();
  })();
}

// 아래 동작들은 앞의 요청이 끝나기 전에는 다시 실행되지 않는다 (연타·중복 주문 방지)
for(const name of ["doStockBuy","doStockSell","doDeposit","doWithdraw","doLoan","doRepay",
                   "doDonate","doBuy","doCheckin","doDraw","doGroupPay","doUseCoupon","doLucky"]){
  const fn = window[name];
  window[name] = async function(...args){
    if(acting){ toast("잠시만요, 처리 중이에요 ⏳"); return; }
    acting = true; document.body.classList.add("busy");
    try { return await fn.apply(this, args); }
    catch(e){ toast("인터넷이 불안정해요. 잠시 뒤 다시 해 주세요."); }
    finally { acting = false; document.body.classList.remove("busy"); }
  };
}

load();
</script>
</body>
</html>
`;
const TEACHER_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>학급은행 · 교사</title>
<style>
  :root{
    --bg:#f9f9f7; --card:#fcfcfb; --ink:#0b0b0b; --ink2:#52514e; --muted:#898781;
    --line:#e1e0d9; --axis:#c3c2b7; --brand:#2a78d6; --brand-dark:#1c5cab;
    --good:#0ca30c; --bad:#d03b3b; --gold:#eda100;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;background:var(--bg);color:var(--ink)}
  button{font-family:inherit;cursor:pointer;border:none}
  input,select{font-family:inherit;font-size:15px;padding:8px 10px;border:1.5px solid var(--line);border-radius:8px;background:#fff}
  input:focus,select:focus{outline:none;border-color:var(--brand)}
  .hidden{display:none!important}

  /* 로그인 */
  #loginView{max-width:380px;margin:80px auto;padding:0 20px;text-align:center}
  #loginView .login-mascot{width:88px;height:88px;object-fit:contain;display:block;margin:0 auto 6px;filter:drop-shadow(0 4px 8px rgba(11,11,11,.15))}
  #loginView h1{font-size:26px;margin-bottom:20px}
  #loginView input{width:100%;font-size:18px;padding:12px;margin-bottom:12px;text-align:center}
  #loginView button{width:100%;padding:14px;font-size:18px;font-weight:800;border-radius:10px;background:var(--brand);color:#fff}
  .err{color:var(--bad);font-weight:700;margin:10px 0;min-height:20px}

  /* 레이아웃 */
  #appView{display:flex;min-height:100vh}
  .side{width:200px;background:#fff;border-right:1px solid var(--line);padding:20px 12px;flex-shrink:0}
  .side .logo{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:900;padding:0 10px 18px}
  .side .logo .hd-mascot{width:28px;height:28px;object-fit:contain;flex:none}
  .side button{display:block;width:100%;text-align:left;padding:12px 14px;border-radius:10px;background:none;font-size:15px;font-weight:600;color:var(--ink2);margin-bottom:4px}
  .side button.on{background:#e7f1fc;color:var(--brand);font-weight:800}
  .main{flex:1;padding:26px 30px;max-width:1100px}
  .main h2{font-size:22px;margin-bottom:18px}
  .card{background:var(--card);border:1px solid rgba(11,11,11,.08);border-radius:14px;padding:20px;margin-bottom:18px}
  .card h3{font-size:15px;color:var(--ink2);margin-bottom:12px}
  .grid{display:grid;gap:18px}
  .grid.c2{grid-template-columns:1fr 1fr}
  .grid.c4{grid-template-columns:repeat(4,1fr)}
  @media(max-width:900px){.grid.c2,.grid.c4{grid-template-columns:1fr 1fr}}

  /* 스탯 타일 */
  .tile .k{font-size:13px;color:var(--ink2)}
  .tile .v{font-size:30px;font-weight:900;margin-top:6px}
  .tile .v small{font-size:15px;font-weight:600;color:var(--muted);margin-left:3px}

  /* 테이블 */
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{color:var(--muted);font-weight:600;text-align:left;padding:8px 10px;border-bottom:1px solid var(--axis);white-space:nowrap}
  td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:none}
  .plus{color:var(--good);font-weight:700} .minus{color:var(--bad);font-weight:700}

  .btn{padding:10px 18px;border-radius:9px;font-size:15px;font-weight:700;background:var(--brand);color:#fff}
  .btn:active{background:var(--brand-dark)}
  .btn.gray{background:#efeeea;color:var(--ink2)}
  .btn.red{background:var(--bad)}
  .btn.gold{background:var(--gold)}
  .btn.sm{padding:6px 12px;font-size:13px}
  .btn:disabled{background:#c9c8c1;cursor:default}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .note{font-size:13px;color:var(--muted);margin-top:8px}
  .badge{font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px;white-space:nowrap}
  .badge.hold{background:#e7f1fc;color:var(--brand)}
  .badge.used{background:#efeeea;color:var(--muted)}
  .badge.late{background:#fdeeee;color:var(--bad)}
  .badge.lock{background:#fdeeee;color:var(--bad)}
  .badge.ready{background:#e7f8ea;color:#0a7a26}

  /* 차트 */
  .chart-wrap{position:relative}
  .chart-tip{position:absolute;pointer-events:none;background:var(--ink);color:#fff;font-size:12px;padding:6px 10px;border-radius:7px;white-space:nowrap;transform:translate(-50%,-120%);display:none;z-index:5}
  svg text{font-family:inherit}

  #toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 24px;border-radius:99px;font-size:15px;font-weight:700;z-index:60}
  label.chk{display:inline-flex;align-items:center;gap:5px;font-size:14px;margin:3px 8px 3px 0;padding:6px 10px;border:1.5px solid var(--line);border-radius:8px;cursor:pointer;background:#fff}
  label.chk.sel{border-color:var(--brand);background:#e7f1fc;font-weight:700}
</style>
</head>
<body>

<div id="loginView" class="hidden">
  <img class="login-mascot" src="mascot.png" alt="다람쌤">
  <h1>🏦 학급은행 · 교사 관리</h1>
  <input id="tId" placeholder="아이디">
  <input id="tPw" type="password" placeholder="비밀번호" onkeydown="if(event.key==='Enter')doLogin()">
  <div class="err" id="loginErr"></div>
  <button onclick="doLogin()">로그인</button>
  <p class="note">최초 아이디/비밀번호: teacher / 0000 (설정에서 변경하세요)</p>
</div>

<div id="appView" class="hidden">
  <div class="side">
    <div class="logo"><img class="hd-mascot" src="mascot.png" alt="다람쌤">학급은행</div>
    <button id="nav-dash" class="on" onclick="show('dash')">📊 대시보드</button>
    <button id="nav-pay" onclick="show('pay')">💰 지급 관리</button>
    <button id="nav-stu" onclick="show('stu')">👥 학생 관리</button>
    <button id="nav-job" onclick="show('job')">💼 직업 관리</button>
    <button id="nav-shop" onclick="show('shop')">🎟️ 상점 관리</button>
    <button id="nav-fine" onclick="show('fine')">⚖️ 벌금 관리</button>
    <button id="nav-bank" onclick="show('bank')">🏦 은행 (적금·대출·기부)</button>
    <button id="nav-stock" onclick="show('stock')">📈 주식 관리</button>
    <button id="nav-tax" onclick="show('tax')">🧾 세금</button>
    <button id="nav-set" onclick="show('set')">⚙️ 설정</button>
    <button style="margin-top:24px;color:var(--muted)" onclick="logout()">로그아웃</button>
  </div>
  <div class="main">

    <!-- 대시보드 -->
    <section id="sec-dash">
      <h2>대시보드</h2>
      <div class="grid c4">
        <div class="card tile"><div class="k">오늘 출근</div><div class="v" id="dToday">-</div></div>
        <div class="card tile"><div class="k">총 유통량</div><div class="v" id="dTotal">-</div></div>
        <div class="card tile"><div class="k">학급 평균 잔액</div><div class="v" id="dAvg">-</div></div>
        <div class="card tile"><div class="k">사용 대기 쿠폰</div><div class="v" id="dPending">-</div></div>
      </div>
      <div class="grid c2">
        <div class="card"><h3>총 유통량 추이</h3><div id="chartCirc" class="chart-wrap"></div></div>
        <div class="card"><h3>주간 소비 총액</h3><div id="chartWeek" class="chart-wrap"></div></div>
      </div>
      <div class="card"><h3>최근 거래 20건</h3><div id="dashTx"></div></div>
    </section>

    <!-- 지급 관리 -->
    <section id="sec-pay" class="hidden">
      <h2>지급 관리</h2>
      <div class="card">
        <h3>주급 미리보기 — 지급할 학생을 체크하고 [주급 일괄 지급]을 누르세요</h3>
        <div id="payTable"></div>
        <div class="row" style="margin-top:14px">
          <button class="btn" onclick="loadPayroll()">🔄 새로고침</button>
          <button class="btn gold" id="payBtn" onclick="doPay()">💸 주급 일괄 지급</button>
          <button class="btn gray" onclick="doUndoPay()">↩ 마지막 주급 지급 취소</button>
        </div>
        <p class="note"><b>일급은 학생이 출근 체크를 누르는 즉시 자동 지급</b>됩니다(위 표의 '일급(지급완료)'은 이미 받은 금액이라 참고용).
          따라서 주급으로 정산하는 것은 <b>직업 수당</b>이며, 수당은 <b>한 주에 받는 정액</b>이라 출근 일수를 곱하지 않습니다.
          출근 기록이 없는 학생(0일)도 체크해서 지급할 수 있고, 기본 체크는 출근한 학생만 되어 있습니다.
          세금은 여기서 떼지 않고, <b>매주 정해진 시각(기본 금요일 09:00)에 그 주 수입 전체에서 자동으로</b> 빠져나갑니다(설정에서 변경).</p>
        <p class="note">수당은 <b>지급하는 시점의 현재 직업</b>으로 계산되므로, 출근 체크를 먼저 하고 나중에 직업을 배정해도 제대로 반영됩니다.
          모든 학생이 <b>0일</b>이면 정산할 출근 기록이 없다는 뜻입니다. 잘못 지급했다면 [마지막 주급 지급 취소]로 되돌린 뒤 다시 지급하세요.</p>
      </div>
      <div class="card">
        <h3>수동 지급 / 차감</h3>
        <div id="adjStudents" style="margin-bottom:10px"></div>
        <div class="row">
          <button class="btn sm gray" onclick="adjSelectAll(true)">전체 선택</button>
          <button class="btn sm gray" onclick="adjSelectAll(false)">전체 해제</button>
          <input id="adjMemo" placeholder="사유 (선택)" style="width:260px">
          <input id="adjAmount" type="number" step="0.01" placeholder="금액 (차감은 -)" style="width:150px">
          <button class="btn" onclick="doAdjust()">실행</button>
        </div>
      </div>
      <div class="card">
        <h3>전체 거래 내역 <span id="txCountLabel" class="note" style="margin:0"></span></h3>
        <div class="row" style="margin-bottom:12px">
          <button class="btn sm" onclick="loadAllTx(300)">최근 300건</button>
          <button class="btn sm gray" onclick="loadAllTx(0)">📜 전체 내역 보기</button>
          <button class="btn sm gray" onclick="exportCsv('transactions')">📥 엑셀(CSV)로 백업</button>
          <span style="flex:1"></span>
          <button class="btn sm red" onclick="doPurge(30)">🗑 한 달 이전 정리</button>
          <button class="btn sm red" onclick="doPurge(7)">🗑 일주일 이전 정리</button>
        </div>
        <p class="note" style="margin-top:0">정리해도 <b>학생 잔액은 그대로</b>입니다. 지운 내역은 학생별 <b>이월</b> 거래 한 줄로 합쳐서 남습니다.
          되돌릴 수 없으니 정리 전에 [엑셀(CSV)로 백업]을 먼저 눌러 주세요.</p>
        <div id="allTx"></div>
      </div>
    </section>

    <!-- 학생 관리 -->
    <section id="sec-stu" class="hidden">
      <h2>학생 관리</h2>
      <div class="grid c4">
        <div class="card tile"><div class="k">우리 반 총 통화량</div><div class="v" id="sTotalMoney">-</div></div>
        <div class="card tile"><div class="k">학생 수</div><div class="v" id="sStudentCount">-</div></div>
        <div class="card tile"><div class="k">평균 잔액</div><div class="v" id="sAvgMoney">-</div></div>
        <div class="card tile"><div class="k">가장 많이 가진 학생</div><div class="v" id="sTopStudent" style="font-size:20px">-</div></div>
      </div>
      <div class="card hidden" id="quickPayCard">
        <h3>💸 <span id="quickPayWho"></span>에게 바로 지급하기</h3>
        <div class="row">
          <input id="quickPayMemo" placeholder="사유 (선택)" style="width:260px">
          <input id="quickPayAmount" type="number" step="0.01" placeholder="금액 (차감은 -)" style="width:150px">
          <button class="btn" onclick="doQuickPay()">지급</button>
          <button class="btn gray" onclick="closeQuickPay()">취소</button>
        </div>
      </div>
      <div class="card">
        <h3>학생 명단 — 별명·PIN·직업을 고친 뒤 [저장]을 누르세요 (PIN 초기화 = PIN 칸에 새 4자리 입력 후 저장)</h3>
        <div class="row" style="margin-bottom:12px">
          <span>일괄 생성:</span>
          <input id="bulkCount" type="number" value="24" style="width:70px"> 명
          <button class="btn sm" onclick="bulkRows()">빈 줄 만들기</button>
          <span class="note" style="margin:0">이미 있는 번호는 그대로 두고 없는 번호만 추가됩니다.</span>
        </div>
        <div class="row" style="margin-bottom:12px">
          <button class="btn sm" onclick="autoAssignGroups()">🔀 모둠 자동 배정</button>
          <span class="note" style="margin:0">별명을 다 채운 뒤 눌러 주세요. 번호 순서대로 1~6모둠을 반복 배정합니다(배정 후에도 각 줄에서 직접 수정 가능).</span>
        </div>
        <div id="stuTable"></div>
        <div class="row" style="margin-top:14px"><button class="btn" onclick="saveStudents()">💾 저장</button></div>
      </div>
    </section>

    <!-- 직업 관리 -->
    <section id="sec-job" class="hidden">
      <h2>직업 관리</h2>
      <div class="card">
        <h3>직업 목록 — 수당은 <b>한 주에 받는 금액(정액)</b>입니다 (출근 일수를 곱하지 않음)</h3>
        <p class="note" style="margin-top:0">추천 직업 예시 — 클릭하면 바로 목록에 추가됩니다.</p>
        <div class="row" id="jobPresets" style="margin-bottom:14px"></div>
        <div id="jobTable"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm gray" onclick="addJobRow()">+ 직업 추가</button>
          <button class="btn" onclick="saveJobs()">💾 직업 저장</button>
          <button class="btn gray" onclick="exportCsv('jobs')">📥 직업 현황 엑셀(CSV)</button>
        </div>
        <p class="note">현재 직업별 설정, 배정 인원 수, 배정된 학생 목록을 내려받습니다.</p>
      </div>
    </section>

    <!-- 상점 -->
    <section id="sec-shop" class="hidden">
      <h2>상점 관리</h2>
      <div class="card">
        <h3>쿠폰 등록</h3>
        <div class="row">
          <input id="newItemName" placeholder="쿠폰 이름 (예: 숙제 1회 연기권)" style="width:260px">
          <input id="newItemPrice" type="number" step="0.01" placeholder="가격" style="width:110px">
          <input id="newItemStock" type="number" placeholder="재고" style="width:110px">
          <button class="btn" onclick="addItem()">등록</button>
        </div>
      </div>
      <div class="card"><h3>판매 중인 쿠폰</h3><div id="itemTable"></div></div>
      <div class="card">
        <h3>🍀 행운 뽑기 — 학생이 <b>돈을 내고 사는 상점 쿠폰과는 별개로</b> 운영되는 확률 뽑기입니다</h3>
        <div class="row" style="margin-bottom:12px">
          <label class="chk" id="drawEnabledLabel">
            <input type="checkbox" id="drawEnabledInput" style="width:auto" onchange="saveDrawSettings()">행운 뽑기 사용
          </label>
          <span>뽑기 1회 비용:</span>
          <input id="drawCostInput" type="number" step="0.01" style="width:100px">
          <span>카드 장수:</span>
          <select id="drawCardCountInput" style="width:90px">
            <option value="2">2장</option><option value="3">3장</option><option value="4">4장</option>
            <option value="5">5장</option><option value="6">6장</option>
          </select>
          <button class="btn sm" onclick="saveDrawSettings()">설정 저장</button>
        </div>
        <p class="note" style="margin-top:0">체크를 풀면 학생 화면에서 행운 뽑기가 아예 사라집니다(상점은 그대로).
          비용을 0으로 두면 무료로 뽑을 수 있습니다. 학생은 뒷면에 다람쌤이 그려진 카드 중 한 장을 골라 뒤집습니다.</p>
        <div class="row" style="margin-bottom:12px">
          <input id="newDrawName" placeholder="행운 뽑기 상품 이름 (예: 숙제 면제권)" style="width:240px">
          <input id="newDrawWeight" type="number" placeholder="확률 가중치" style="width:120px">
          <select id="newDrawEffect" style="width:210px">
            <option value="">일반 (이름 그대로 쿠폰 지급)</option>
            <option value="discount50">🎟️ 상점 50% 할인권</option>
            <option value="randomShop">🎰 상점 쿠폰 랜덤 지급</option>
          </select>
          <button class="btn" onclick="addDrawItem()">추가</button>
        </div>
        <div id="drawTable"></div>
        <p class="note">확률(%)은 가중치를 전체 합으로 나눈 값이라 자동으로 계산됩니다.
          <b>학생에게는 상품 목록과 확률이 보이지 않습니다</b>(선생님만 볼 수 있어요).
          뽑은 쿠폰은 학생의 [내 보유 쿠폰]에 들어가고, 사용 처리는 상점 쿠폰과 똑같습니다.</p>
        <p class="note"><b>특별 효과</b> —
          🎟️ <b>상점 50% 할인권</b>: 학생이 상점에서 아무 쿠폰이나 골라 <b>반값</b>에 살 수 있는 티켓을 받습니다(한 번 쓰면 없어짐).
          🎰 <b>상점 쿠폰 랜덤 지급</b>: 상점 쿠폰 중 하나가 <b>즉시 무작위로</b> 지급됩니다(재고가 1 줄어듭니다).
          학생 화면에서는 이름이 촤르륵 돌아가다 멈추는 연출이 나옵니다. 상점에 재고 있는 쿠폰이 하나도 없으면 이 상품은 뽑히지 않습니다.</p>
      </div>
      <div class="card"><h3>🔔 사용 대기 쿠폰 — 학생이 쿠폰을 쓰겠다고 하면 [사용 처리]</h3><div id="pendingTable"></div></div>
      <div class="card"><h3>쿠폰 사용 이력</h3><div id="usedTable"></div></div>
    </section>

    <!-- 벌금 관리 -->
    <section id="sec-fine" class="hidden">
      <h2>벌금 관리</h2>
      <div class="card">
        <h3>벌금 부과 — 학생을 고른 뒤 벌금 항목을 선택하고 [벌금 부과]를 누르세요</h3>
        <div id="fineStudents" style="margin-bottom:10px"></div>
        <div class="row">
          <button class="btn sm gray" onclick="fineSelectAll(true)">전체 선택</button>
          <button class="btn sm gray" onclick="fineSelectAll(false)">전체 해제</button>
          <select id="fineSelect" style="width:240px"></select>
          <input id="fineMemo" placeholder="메모 (선택)" style="width:220px">
          <button class="btn red" onclick="doApplyFine()">⚖️ 벌금 부과</button>
        </div>
        <p class="note">부과하면 선택한 학생의 잔액에서 즉시 차감되고, 학생 화면 거래 내역에 <b>벌금</b>으로 표시됩니다.
          잔액이 모자라도 부과되어 잔액이 음수가 될 수 있으니 금액을 확인하고 눌러 주세요.</p>
      </div>
      <div class="card">
        <h3>벌금 항목 (금액은 차감할 금액을 양수로 적으세요)</h3>
        <p class="note" style="margin-top:0">추천 항목 — 클릭하면 바로 목록에 추가됩니다.</p>
        <div class="row" id="finePresets" style="margin-bottom:14px"></div>
        <div id="fineTable"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm gray" onclick="addFineRow()">+ 항목 추가</button>
          <button class="btn" onclick="saveFines()">💾 항목 저장</button>
        </div>
      </div>
      <div class="card"><h3>벌금 부과 내역 (최근 100건)</h3><div id="fineHistory"></div></div>
    </section>

    <!-- 은행: 적금 · 대출 · 기부 -->
    <section id="sec-bank" class="hidden">
      <h2>은행 (적금 · 대출 · 기부)</h2>
      <div class="grid c4">
        <div class="card tile"><div class="k">적금에 들어 있는 원금</div><div class="v" id="bDepPrincipal">-</div></div>
        <div class="card tile"><div class="k">적금 현재 평가액</div><div class="v" id="bDepValue">-</div></div>
        <div class="card tile"><div class="k">빌려준 돈 (남은 원금)</div><div class="v" id="bLoanTotal">-</div></div>
        <div class="card tile"><div class="k">모인 기부금</div><div class="v" id="bDonPool">-</div></div>
      </div>

      <div class="card">
        <h3>은행 규칙 — 고친 뒤 [은행 설정 저장]을 누르세요</h3>
        <div class="row" style="margin-bottom:12px">
          <label class="chk" id="bankEnabledLabel"><input type="checkbox" id="bankEnabledInput" style="width:auto">🏦 은행 탭 사용</label>
          <span class="note" style="margin:0">체크를 풀면 학생 화면에서 은행 탭이 사라집니다(이미 넣은 적금·대출 기록은 그대로 남습니다).</span>
        </div>
        <table style="max-width:760px">
          <tr><td style="width:150px"><b>🐷 적금</b></td><td>
            <label class="chk" id="savingsEnabledLabel"><input type="checkbox" id="savingsEnabledInput" style="width:auto">사용</label>
            1인 최대 <input id="savingsMaxInput" type="number" step="0.01" style="width:90px">
            · 이자 <input id="savingsRateInput" type="number" step="0.1" style="width:70px">%
            (<input id="savingsPeriodInput" type="number" style="width:60px">일마다 복리)
            · 해약 제한 <input id="savingsLockInput" type="number" style="width:60px">일
          </td></tr>
          <tr><td><b>🏦 대출</b></td><td>
            <label class="chk" id="loanEnabledLabel"><input type="checkbox" id="loanEnabledInput" style="width:auto">사용</label>
            금리 <input id="loanRateInput" type="number" step="0.1" style="width:70px">%
            (<input id="loanPeriodInput" type="number" style="width:60px">일마다 자동 차감)
            · 한도 = 주급 × <input id="loanMultiplierInput" type="number" step="0.1" style="width:70px">배
          </td></tr>
          <tr><td><b>💝 기부</b></td><td>
            <label class="chk" id="donationEnabledLabel"><input type="checkbox" id="donationEnabledInput" style="width:auto">사용</label>
            모인 기부금이 <input id="donationThresholdInput" type="number" step="0.01" style="width:90px"> 이상이 되면
            <b>남은 재산이 가장 적은 학생</b>에게 전액 지급
          </td></tr>
        </table>
        <div class="row" style="margin-top:14px"><button class="btn" onclick="saveBankSettings()">💾 은행 설정 저장</button></div>
        <p class="note"><b>적금</b>은 만든 날부터 <b>해약 제한 일수</b> 동안 해약할 수 없고, 부득이하게 해약하면 이자 없이 원금만 돌려받습니다.
          제한 기간이 지나면 원금 + 복리 이자를 함께 받습니다. 이자는 <b>기간이 한 번 채워질 때마다</b> 붙습니다(예: 7일마다 5% 복리).</p>
        <p class="note"><b>대출</b>은 한 학생이 <b>동시에 하나만</b> 받을 수 있고, 다 갚기 전에는 다시 받을 수 없습니다.
          이자는 정해진 기간이 지날 때마다 <b>남은 원금 기준</b>으로 자동 차감되며, 잔액이 모자라면 잔액이 음수가 될 수 있습니다.</p>
        <p class="note"><b>기부</b>에서 말하는 남은 재산은 <b>현금 + 적금 현재 평가액 + 주식 현재 평가액</b>입니다(대출은 빼지 않습니다).
          같은 금액이면 번호가 빠른 학생이 받습니다.</p>
      </div>

      <div class="card">
        <h3>🐷 적금 현황</h3>
        <div id="bankDepositTable"></div>
      </div>

      <div class="card">
        <h3>🏦 대출 현황</h3>
        <div id="bankLoanTable"></div>
        <p class="note">[탕감]은 남은 원금을 <b>갚지 않아도 되는 것으로 처리</b>합니다(학생 잔액은 그대로, 거래 내역에 '대출탕감'으로 남습니다).</p>
      </div>

      <div class="card">
        <h3>💝 기부 현황</h3>
        <div id="bankDonateBox"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn gold" onclick="doGrantNow()">🤝 지금 바로 나눔 실행</button>
          <span class="note" style="margin:0">목표 금액에 도달하지 않아도, 모인 기부금 전액을 지금 재산이 가장 적은 학생에게 전달합니다.</span>
        </div>
        <div id="bankDonateHist" style="margin-top:14px"></div>
      </div>

      <div class="card">
        <h3>💰 학생 재산 순위 (현금 + 적금 + 주식) — 기부금은 맨 아래 학생에게 갑니다</h3>
        <div id="bankAssetTable"></div>
        <div class="row" style="margin-top:12px">
          <button class="btn gray" onclick="exportCsv('bank')">📥 은행 현황 엑셀(CSV)</button>
        </div>
      </div>
    </section>

    <!-- 주식 관리 -->
    <section id="sec-stock" class="hidden">
      <h2>주식 관리</h2>
      <div class="card">
        <h3>종목과 가격 — <b>직접 조정하거나 실제 주식의 등락률을 따라가게 할 수 있습니다</b></h3>
        <div class="row" style="margin-bottom:12px">
          <label class="chk" id="stockEnabledLabel">
            <input type="checkbox" id="stockEnabledInput" style="width:auto" onchange="saveStockEnabled()">주식 사용
          </label>
          <span class="note" style="margin:0">체크를 풀면 학생 화면에서 주식 탭이 사라지고 사고팔 수 없게 됩니다(보유 주식은 그대로 남습니다).</span>
        </div>
        <div style="padding:14px;background:#f7fafc;border-radius:12px;margin-bottom:14px">
          <h3 style="margin-top:0">🌐 실제 주식 자동 연동</h3>
          <div class="row" style="align-items:flex-end">
            <div><div class="note" style="margin-bottom:4px">🇰🇷 한국투자증권 App Key</div><input id="kisAppKey" type="password" placeholder="KIS App Key" style="width:240px"></div>
            <div><div class="note" style="margin-bottom:4px">🇰🇷 한국투자증권 App Secret</div><input id="kisAppSecret" type="password" placeholder="KIS App Secret" style="width:240px"></div>
            <div><div class="note" style="margin-bottom:4px">🇺🇸 Twelve Data API Key (미국주식용)</div><input id="stockApiKey" type="password" placeholder="Twelve Data API 키" style="width:240px"></div>
          </div>
          <div class="row" style="margin-top:10px">
            <label class="chk"><input id="stockAutoSync" type="checkbox" style="width:auto"> 평일 오후 4시 이후 하루 한 번 자동 반영</label>
            <button class="btn sm gray" onclick="saveStockConfig()">연동 설정 저장</button>
            <button class="btn sm" onclick="syncStocksNow(event)">🔄 지금 시세 반영</button>
          </div>
          <p class="note" id="stockSyncStatus">한국 주식은 한국투자증권 Open API, 미국 주식은 Twelve Data로 연결합니다.</p>
          <p class="note">한국 주식 예시: 종목코드 <b>005930</b>, 거래소 <b>KRX</b> · 미국 주식 예시: 종목코드 <b>AAPL</b>, 거래소 <b>NASDAQ</b>. <b>한국주식은 실제 원화 주가 ÷ 10,000</b>, <b>미국주식은 실제 달러 주가 × USD/KRW 환율 ÷ 10,000</b>으로 학급 주가를 정합니다. 학급 주가는 소수점 둘째 자리까지 표시하고, 실제 등락률은 참고용으로만 보여 줍니다. <b>매수·매도 금액도 소수점 둘째 자리까지 그대로 결제</b>됩니다(3.66짜리 1주는 3.66만 빠져나갑니다).</p>
        </div>
        <div class="row" style="margin-bottom:12px">
          <input id="newStockName" placeholder="학급 종목 이름 (예: 다람전자)" style="width:240px">
          <input id="newStockPrice" type="number" placeholder="학급 시작 가격" style="width:130px">
          <button class="btn" onclick="addStock()">종목 추가</button>
        </div>
        <div id="stockTable"></div>
        <p class="note">연결 방식이 <b>수동</b>이면 가격과 ± 버튼을 사용합니다. <b>실제 연동</b>이면 실제 현재가를 기준으로 학급 가격을 직접 계산합니다. 자동 반영은 평일 오후 4시 이후 하루 한 번 실행되며, [지금 시세 반영] 버튼으로 언제든 다시 확인할 수 있습니다.</p>
      </div>
      <div class="card">
        <h3>학생 보유 현황</h3>
        <div id="holdingTable"></div>
      </div>
    </section>

    <!-- 세금 -->
    <section id="sec-tax" class="hidden">
      <h2>세금</h2>
      <div class="grid c4">
        <div class="card tile"><div class="k">지금까지 걷은 세금</div><div class="v" id="taxGrand">-</div></div>
        <div class="card tile"><div class="k">세율</div><div class="v" id="taxRateTile">-</div></div>
        <div class="card tile"><div class="k">징수 시각</div><div class="v" id="taxWhen" style="font-size:20px">-</div></div>
        <div class="card tile"><div class="k">마지막 징수</div><div class="v" id="taxLast" style="font-size:18px">-</div></div>
      </div>
      <div class="card">
        <h3>학생별 낸 세금 (누적)</h3>
        <div id="taxTotals"></div>
      </div>
      <div class="card">
        <h3>세금 징수 내역 (최근 200건)</h3>
        <div id="taxHistory"></div>
      </div>
    </section>

    <!-- 설정 -->
    <section id="sec-set" class="hidden">
      <h2>설정</h2>
      <div class="card">
        <h3>경제 규칙</h3>
        <table style="max-width:560px">
          <tr><td>학급 코드</td><td><input id="sCode" style="width:140px"></td></tr>
          <tr><td>화폐 이름</td><td><input id="sCur" style="width:140px"></td></tr>
          <tr><td>기본 일급</td><td><input id="sBase" type="number" step="0.01" style="width:140px"></td></tr>
          <tr><td>지각 일급</td><td><input id="sLate" type="number" step="0.01" style="width:140px"></td></tr>
          <tr><td>소득세율 (%)</td><td><input id="sTax" type="number" style="width:140px"></td></tr>
          <tr><td>세금 징수 시각</td><td>
            <select id="sTaxDay" style="width:90px">
              <option value="1">월요일</option><option value="2">화요일</option><option value="3">수요일</option>
              <option value="4">목요일</option><option value="5">금요일</option><option value="6">토요일</option><option value="7">일요일</option>
            </select>
            <input id="sTaxTime" type="time" style="width:110px">
          </td></tr>
          <tr><td>출근 마감 시각</td><td><input id="sDeadline" type="time" style="width:140px"></td></tr>
          <tr><td>연속 거래 방지 (초)</td><td><input id="sCooldown" type="number" min="0" style="width:140px"></td></tr>
          <tr><td>회계사 1회 지급 한도</td><td><input id="sPayTx" type="number" step="0.01" style="width:140px"></td></tr>
          <tr><td>회계사 하루 누적 한도</td><td><input id="sPayDay" type="number" step="0.01" style="width:140px"></td></tr>
          <tr><td>🍀 행운 버튼</td><td>
            <label class="chk" id="sLuckyLabel"><input type="checkbox" id="sLucky" style="width:auto">사용</label>
            <input id="sLuckyStart" type="time" style="width:110px"> ~
            <input id="sLuckyEnd" type="time" style="width:110px">
            &nbsp;보너스 <input id="sLuckyReward" type="number" step="0.01" style="width:80px">
          </td></tr>
          <tr><td>교사 비밀번호 변경</td><td><input id="sPw" type="password" placeholder="바꿀 때만 입력" style="width:180px"></td></tr>
        </table>
        <p class="note">행운 버튼: 학생 [출근] 화면의 출근 버튼 아래에 생깁니다. <b>정해진 시각 사이에 누른 학생만</b> 보너스를 받고,
          다른 시간에 누르면 아무 일도 일어나지 않습니다. <b>하루 한 번</b>만 받을 수 있어 시간대 안에서 여러 번 눌러도 한 번만 지급됩니다.
          학생에게는 정확한 시각을 알려 주지 않아 "언제 눌러볼까?" 하는 재미를 줄 수 있습니다.</p>
        <p class="note"><b>연속 거래 방지</b>: 학생이 [사기]·[팔기]나 은행 버튼을 연달아 누를 때, 마지막 거래로부터 이 시간이 지나야 다음 거래가 됩니다.
          인터넷이 느려 "눌러도 반응이 없네?" 하고 여러 번 누르면 같은 주문이 여러 건 체결되던 문제를 막아 줍니다.
          <b>0으로 두면 제한이 없어집니다</b>(권장 3초).</p>
        <p class="note">회계사 지급 한도: [학생·직업] 메뉴에서 "모둠원 지급 권한"을 가진 직업(예: 모둠 회계사)이 학생 화면에서 같은 모둠원에게 줄 수 있는 금액의 상한입니다.</p>
        <p class="note"><b>소득세는 정해진 요일·시각(기본 금요일 09:00)에 자동으로 빠져나갑니다.</b>
          그 주에 번 돈(일급 + 주급 수당 + 칭찬 지급 + 교사 수동 지급)을 모두 더해 세율만큼 한 번에 차감하며,
          거래 내역에 <b>세금</b>으로 남습니다. 그 시각에 서버가 꺼져 있어도 다음에 누군가 접속하면 자동으로 밀린 세금을 징수합니다.
          적금·대출·기부로 오간 돈은 <b>수입으로 보지 않아 세금을 매기지 않습니다.</b></p>
        <div class="row" style="margin-top:14px"><button class="btn" onclick="saveSettings()">💾 저장</button></div>
      </div>
      <div class="card">
        <h3>CSV 내보내기 (매주 금요일 주급 지급 후 백업 권장)</h3>
        <div class="row">
          <button class="btn gray" onclick="exportCsv('transactions')">📥 거래 내역 엑셀(CSV)</button>
          <button class="btn gray" onclick="exportCsv('balances')">📥 잔액 현황 엑셀(CSV)</button>
          <button class="btn gray" onclick="exportCsv('bank')">📥 은행(적금·대출·기부) 엑셀(CSV)</button>
        </div>
        <p class="note">전체 백업은 서버 폴더의 <b>bank-data.json</b> 파일을 복사해 두면 됩니다.</p>
      </div>
    </section>

  </div>
</div>

<script>
const $ = id => document.getElementById(id);
let CUR = "";
function auth(){ try{ return JSON.parse(localStorage.getItem("bankTeacher")); }catch(e){ return null; } }
async function api(path, body){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({auth:auth(), ...(body||{})})});
  return await r.json();
}
function fmt(n){ return Number(n).toLocaleString("ko-KR", {maximumFractionDigits:2}); }
function fmtStock(n){ return Number(n).toLocaleString("ko-KR", {minimumFractionDigits:2, maximumFractionDigits:2}); }
function esc(s){ return String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function toast(msg){ const t=document.createElement("div"); t.id="toast"; t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),2200); }

async function doLogin(){
  const a = { id:$("tId").value.trim(), pw:$("tPw").value };
  const r = await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({role:"teacher",...a})}).then(r=>r.json());
  if(r.ok){ localStorage.setItem("bankTeacher", JSON.stringify(a)); boot(); }
  else $("loginErr").textContent = r.error || "로그인 실패";
}
function logout(){ localStorage.removeItem("bankTeacher"); location.reload(); }

async function boot(){
  if(!auth()){ $("loginView").classList.remove("hidden"); return; }
  const r = await api("/api/teacher/overview");
  if(!r.ok){ localStorage.removeItem("bankTeacher"); $("loginView").classList.remove("hidden"); return; }
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  renderDash(r);
}

function show(name){
  for(const s of ["dash","pay","stu","job","shop","fine","bank","stock","tax","set"]){
    $("sec-"+s).classList.toggle("hidden", s!==name);
    $("nav-"+s).classList.toggle("on", s===name);
  }
  if(name==="dash") api("/api/teacher/overview").then(r=>r.ok&&renderDash(r));
  if(name==="pay"){ loadPayroll(); loadAdjustList(); loadAllTx(300); }
  if(name==="stu") loadStudents();
  if(name==="job") loadStudents();
  if(name==="shop") loadShop();
  if(name==="fine") loadFines();
  if(name==="bank") loadBank();
  if(name==="stock") loadStocks();
  if(name==="tax") loadTaxes();
  if(name==="set") loadSettings();
}

// ══════════ 대시보드 ══════════
function renderDash(r){
  CUR = r.currencyName;
  $("dToday").innerHTML = \`\${r.todayCount}<small>/ \${r.totalStudents}명</small>\`;
  $("dTotal").innerHTML = \`\${fmt(r.totalBalance)}<small>\${CUR}</small>\`;
  $("dAvg").innerHTML = \`\${fmt(r.avgBalance)}<small>\${CUR}</small>\`;
  $("dPending").innerHTML = \`\${r.pendingCoupons}<small>건</small>\`;
  drawLineChart($("chartCirc"), r.circulation.map(d=>({x:d.date.substring(5), y:d.total, full:d.date})), CUR);
  drawBarChart($("chartWeek"), r.weeklySpend.map(d=>({x:d.week.substring(5)+"~", y:d.total, full:d.week+" 주"})), CUR);
  $("dashTx").innerHTML = txTable(r.recentTx);
}
function txTable(rows){
  if(!rows || rows.length===0) return \`<p class="note">거래가 없습니다.</p>\`;
  return \`<div style="overflow-x:auto"><table><tr><th>일시</th><th>학생</th><th>유형</th><th class="num">금액</th><th>사유</th></tr>\`+
    rows.map(t=>\`<tr><td>\${t.createdAt.substring(0,16)}</td><td>\${t.number}번 \${esc(t.nickname)}</td><td>\${t.type}</td>
      <td class="num \${t.amount>=0?"plus":"minus"}">\${t.amount>=0?"+":""}\${fmt(t.amount)}</td><td>\${esc(t.memo)}</td></tr>\`).join("")+\`</table></div>\`;
}

// ── 차트 (단일 계열: 파랑 #2a78d6, 2px 선 / 얇은 막대, 호버 툴팁) ──
function chartFrame(box, data, draw){
  if(!data || data.length===0){ box.innerHTML = \`<p class="note">아직 데이터가 없습니다.</p>\`; return; }
  const W=460, H=220, L=52, R=12, T=14, B=30;
  const maxY = Math.max(...data.map(d=>d.y), 1);
  const niceMax = Math.ceil(maxY/4)*4 || 4;
  const sx = i => data.length===1 ? L+(W-L-R)/2 : L + (W-L-R)*i/(data.length-1);
  const sy = v => T + (H-T-B)*(1 - v/niceMax);
  let g = "";
  for(let k=0;k<=4;k++){
    const v = niceMax*k/4, y = sy(v);
    g += \`<line x1="\${L}" y1="\${y}" x2="\${W-R}" y2="\${y}" stroke="#e1e0d9" stroke-width="1"/>\`;
    g += \`<text x="\${L-8}" y="\${y+4}" text-anchor="end" font-size="11" fill="#898781">\${fmt(v)}</text>\`;
  }
  const step = Math.max(1, Math.ceil(data.length/6));
  data.forEach((d,i)=>{ if(i%step===0 || i===data.length-1)
    g += \`<text x="\${sx(i)}" y="\${H-8}" text-anchor="middle" font-size="11" fill="#898781">\${esc(d.x)}</text>\`; });
  g += \`<line x1="\${L}" y1="\${sy(0)}" x2="\${W-R}" y2="\${sy(0)}" stroke="#c3c2b7" stroke-width="1"/>\`;
  box.innerHTML = \`<svg viewBox="0 0 \${W} \${H}" style="width:100%;display:block">\${g}\${draw(sx,sy,W,H,L,R,T,B)}</svg><div class="chart-tip"></div>\`;
  const tip = box.querySelector(".chart-tip"), svg = box.querySelector("svg");
  svg.addEventListener("mousemove", e=>{
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX-rect.left)*W/rect.width;
    let best=0, bd=1e9;
    data.forEach((d,i)=>{ const dd=Math.abs(sx(i)-mx); if(dd<bd){bd=dd;best=i;} });
    const d = data[best];
    tip.textContent = \`\${d.full} · \${fmt(d.y)} \${CUR}\`;
    tip.style.left = (sx(best)*rect.width/W)+"px";
    tip.style.top = (sy(d.y)*rect.height/H)+"px";
    tip.style.display = "block";
    svg.querySelectorAll(".hovpt").forEach(el=>el.remove());
    const ns = "http://www.w3.org/2000/svg";
    const c = document.createElementNS(ns,"circle");
    c.setAttribute("class","hovpt"); c.setAttribute("cx",sx(best)); c.setAttribute("cy",sy(d.y));
    c.setAttribute("r",5); c.setAttribute("fill","#2a78d6"); c.setAttribute("stroke","#fcfcfb"); c.setAttribute("stroke-width",2);
    svg.appendChild(c);
  });
  svg.addEventListener("mouseleave", ()=>{ tip.style.display="none"; svg.querySelectorAll(".hovpt").forEach(el=>el.remove()); });
}
function drawLineChart(box, data){
  chartFrame(box, data, (sx,sy)=>{
    const pts = data.map((d,i)=>\`\${sx(i)},\${sy(d.y)}\`).join(" ");
    return data.length===1
      ? \`<circle cx="\${sx(0)}" cy="\${sy(data[0].y)}" r="4" fill="#2a78d6"/>\`
      : \`<polyline points="\${pts}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round"/>\`;
  });
}
function drawBarChart(box, data){
  chartFrame(box, data, (sx,sy,W,H,L,R,T,B)=>{
    const bw = Math.min(36, (W-L-R)/data.length*0.55);
    return data.map((d,i)=>{
      const x = sx(i)-bw/2, y = sy(d.y), h = Math.max(0, sy(0)-y);
      return \`<path d="M\${x},\${y+4} a4,4 0 0 1 4,-4 h\${bw-8} a4,4 0 0 1 4,4 v\${Math.max(0,h-4)} h\${-bw} z" fill="#2a78d6"/>\`;
    }).join("");
  });
}

// ══════════ 지급 관리 ══════════
let adjList = [];
async function loadPayroll(){
  const r = await api("/api/teacher/payroll/preview");
  if(!r.ok) return;
  const rows = r.rows.filter(x=>true);
  const anyDays = rows.some(x=>x.days>0);
  $("payBtn").disabled = !anyDays;
  $("payTable").innerHTML = rows.length===0 ? \`<p class="note">등록된 학생이 없습니다. [학생·직업] 메뉴에서 먼저 등록하세요.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th><input type="checkbox" checked onchange="payToggleAll(this.checked)"></th>
     <th>번호</th><th>별명</th><th>직업</th><th class="num">출근</th><th class="num">지각</th>
     <th class="num">일급(지급완료)</th><th class="num">지급할 주급(수당)</th></tr>\`+
    rows.map(x=>\`<tr><td><input type="checkbox" class="paychk" value="\${x.studentId}" \${x.days>0?"checked":""}></td>
      <td>\${x.number}</td><td>\${esc(x.nickname)}</td><td>\${esc(x.jobName)}</td>
      <td class="num">\${x.days}일</td><td class="num">\${x.late>0?\`<span class="badge late">\${x.late}일</span>\`:"-"}</td>
      <td class="num" style="color:var(--muted)">\${fmt(x.base)}</td>
      <td class="num"><b>\${fmt(x.net)}</b></td></tr>\`).join("")+
    \`</table></div>\`;
}
function payToggleAll(on){ document.querySelectorAll(".paychk").forEach(c=>c.checked=on); }
async function doPay(){
  const ids = [...document.querySelectorAll(".paychk:checked")].map(c=>Number(c.value));
  if(!ids.length){ toast("지급할 학생을 선택하세요."); return; }
  if(!confirm(\`체크한 \${ids.length}명에게 주급(직업 수당)을 지급할까요?\\n(지급 후 그 학생들의 출근 기록은 정산 완료로 표시됩니다)\`)) return;
  const r = await api("/api/teacher/payroll/pay", {studentIds:ids});
  if(r.ok){ toast(\`✅ \${r.paidCount}명에게 총 \${fmt(r.totalNet)} \${CUR} 지급 완료\`); loadPayroll(); loadAllTx(); }
  else toast(r.error||"지급 실패");
}
async function doUndoPay(){
  if(!confirm("가장 최근에 지급한 주급을 취소할까요?\\n\\n· 지급했던 금액이 학생 잔액에서 다시 빠집니다(거래 내역에 '주급취소'로 남음)\\n· 그때 정산된 출근 기록이 '미지급'으로 되돌아가 다시 지급할 수 있게 됩니다")) return;
  const r = await api("/api/teacher/payroll/undo");
  if(r.ok){ toast(\`↩ \${r.count}명 주급 지급 취소 완료 (출근 기록 \${r.restored}건 복구)\`); loadPayroll(); loadAllTx(); }
  else toast(r.error||"취소 실패");
}
async function loadAdjustList(){
  const r = await api("/api/teacher/students");
  if(!r.ok) return;
  adjList = r.students.filter(s=>s.active);
  $("adjStudents").innerHTML = adjList.map(s=>
    \`<label class="chk" id="adj-\${s.id}"><input type="checkbox" value="\${s.id}" onchange="this.parentNode.classList.toggle('sel',this.checked)" style="width:auto">\${s.number}번 \${esc(s.nickname)}\${s.group?\` <span style="color:var(--muted)">(\${s.group}모둠)</span>\`:""}</label>\`).join("");
}
function adjSelectAll(on){
  document.querySelectorAll("#adjStudents input").forEach(c=>{ c.checked=on; c.parentNode.classList.toggle("sel",on); });
}
async function doAdjust(){
  const ids = [...document.querySelectorAll("#adjStudents input:checked")].map(c=>Number(c.value));
  const amount = Number($("adjAmount").value), memo = $("adjMemo").value.trim();
  const r = await api("/api/teacher/adjust", {studentIds:ids, amount, memo});
  if(r.ok){ toast(\`✅ \${ids.length}명에게 \${amount>0?"+":""}\${fmt(amount)} 처리 완료\`); $("adjAmount").value=""; $("adjMemo").value=""; adjSelectAll(false); loadAllTx(); }
  else toast(r.error||"실패");
}
async function loadAllTx(limit){
  const r = await api("/api/teacher/transactions", {limit: limit===undefined ? 300 : limit});
  if(!r.ok) return;
  $("allTx").innerHTML = txTable(r.rows);
  $("txCountLabel").textContent = \`— 전체 \${fmt(r.total)}건 중 \${fmt(r.rows.length)}건 표시\`;
}
async function doPurge(days){
  const label = days>=30 ? "한 달" : "일주일";
  if(!confirm(\`\${label} 이전(\${days}일 지난) 거래 내역을 지울까요?\\n\\n· 학생 잔액은 그대로 유지됩니다(지운 내역은 '이월' 한 줄로 합쳐집니다)\\n· 되돌릴 수 없습니다. 먼저 [엑셀(CSV)로 백업]을 하셨나요?\`)) return;
  const r = await api("/api/teacher/transactions/purge", {days});
  if(r.ok){ toast(\`🗑 \${fmt(r.removed)}건 정리 완료 (이월 \${r.carried}명)\`); loadAllTx(300); }
  else toast(r.error||"정리 실패");
}

// ══════════ 학생·직업 ══════════
let stuData = [], jobData = [];
async function loadStudents(){
  const r = await api("/api/teacher/students");
  if(!r.ok) return;
  stuData = r.students; jobData = r.jobs;
  renderStuTable(); renderJobTable(); renderStuStats();
}
function renderStuStats(){
  const act = stuData.filter(s=>s.active && s.id);
  const total = act.reduce((a,s)=>a+(Number(s.balance)||0), 0);
  const avg = act.length ? Math.round(total/act.length) : 0;
  const top = act.slice().sort((a,b)=>(Number(b.balance)||0)-(Number(a.balance)||0))[0];
  $("sTotalMoney").innerHTML = \`\${fmt(total)}<small>\${CUR}</small>\`;
  $("sStudentCount").innerHTML = \`\${act.length}<small>명</small>\`;
  $("sAvgMoney").innerHTML = \`\${fmt(avg)}<small>\${CUR}</small>\`;
  $("sTopStudent").textContent = top ? \`\${top.number}번 \${top.nickname} (\${fmt(top.balance)})\` : "-";
}

// ── 학생에게 바로 지급 ──
let quickPayId = null;
function openQuickPay(i){
  const s = stuData[i];
  if(!s.id){ toast("먼저 [저장]을 눌러 학생을 등록하세요."); return; }
  quickPayId = s.id;
  $("quickPayWho").textContent = \`\${s.number}번 \${s.nickname}\`;
  $("quickPayCard").classList.remove("hidden");
  $("quickPayAmount").value = ""; $("quickPayMemo").value = "";
  $("quickPayMemo").focus();
  $("quickPayCard").scrollIntoView({behavior:"smooth", block:"center"});
}
function closeQuickPay(){ quickPayId = null; $("quickPayCard").classList.add("hidden"); }
async function doQuickPay(){
  const amount = Number($("quickPayAmount").value), memo = $("quickPayMemo").value.trim();
  if(!quickPayId){ toast("학생을 먼저 고르세요."); return; }
  const r = await api("/api/teacher/adjust", {studentIds:[quickPayId], amount, memo});
  if(r.ok){ toast(\`✅ \${amount>0?"+":""}\${fmt(amount)} \${CUR} 지급 완료\`); closeQuickPay(); loadStudents(); }
  else toast(r.error||"실패");
}
function jobOptions(sel){
  return \`<option value="">미배정</option>\`+jobData.map(j=>\`<option value="\${j.id}" \${j.id==sel?"selected":""}>\${esc(j.name)} (+\${j.allowance})</option>\`).join("");
}
function groupOptions(sel){
  let o = \`<option value="">-</option>\`;
  for(let g=1; g<=6; g++) o += \`<option value="\${g}" \${g==sel?"selected":""}>\${g}모둠</option>\`;
  return o;
}
function handleNickKey(e, i){
  if(e.key === "ArrowDown"){ e.preventDefault(); const el = $("nick-"+(i+1)); if(el) el.focus(); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); const el = $("nick-"+(i-1)); if(el) el.focus(); }
}
function renderStuTable(){
  $("stuTable").innerHTML = \`<div style="overflow-x:auto"><table><tr><th>번호</th><th>별명</th><th>PIN(4자리)</th><th>모둠</th><th>직업</th><th class="num">잔액</th><th>재학</th><th>바로 지급</th></tr>\`+
    stuData.map((s,i)=>\`<tr>
      <td>\${s.number}</td>
      <td><input id="nick-\${i}" value="\${esc(s.nickname)}" style="width:120px" oninput="stuData[\${i}].nickname=this.value" onkeydown="handleNickKey(event,\${i})"></td>
      <td><input value="\${esc(s.pin)}" maxlength="4" style="width:80px" oninput="stuData[\${i}].pin=this.value"></td>
      <td><select style="width:90px" onchange="stuData[\${i}].group=this.value?Number(this.value):null">\${groupOptions(s.group)}</select></td>
      <td><select style="width:230px;max-width:100%" onchange="stuData[\${i}].jobId=this.value?Number(this.value):null">\${jobOptions(s.jobId)}</select></td>
      <td class="num"><b>\${s.balance===undefined?"-":fmt(s.balance)}</b></td>
      <td><input type="checkbox" \${s.active?"checked":""} onchange="stuData[\${i}].active=this.checked"></td>
      <td><button class="btn sm" onclick="openQuickPay(\${i})">💸 지급</button></td>
    </tr>\`).join("")+\`</table></div>\`;
}
function bulkRows(){
  const n = Number($("bulkCount").value)||24;
  const have = new Set(stuData.map(s=>Number(s.number)));
  for(let i=1;i<=n;i++){
    if(!have.has(i)) stuData.push({id:null, number:i, nickname:"", pin:String(1000+Math.floor(Math.random()*9000)), jobId:null, group:null, active:true});
  }
  stuData.sort((a,b)=>a.number-b.number);
  renderStuTable();
  toast("빈 줄을 만들었어요. 별명을 채우고 저장하세요. (PIN은 무작위로 미리 채움. 모둠은 비워 두었으니 학생이 [내 정보]에서 스스로 고르거나, 아래 [모둠 자동 배정]으로 한 번에 넣어도 됩니다)");
}
function autoAssignGroups(){
  const rows = stuData.slice().sort((a,b)=>a.number-b.number);
  rows.forEach((s,i)=>{ s.group = (i%6)+1; });
  renderStuTable();
  toast("모둠을 번호 순서대로 1~6모둠 반복 배정했어요. 확인 후 저장하세요.");
}
async function saveStudents(){
  const bad = stuData.filter(s=>!/^\\d{4}$/.test(String(s.pin)));
  if(bad.length){ toast(\`PIN은 4자리 숫자여야 합니다 (\${bad[0].number}번 확인)\`); return; }
  const r = await api("/api/teacher/students/save", {students:stuData});
  if(r.ok){ toast("✅ 저장 완료"); loadStudents(); } else toast(r.error||"실패");
}
function renderJobTable(){
  $("jobTable").innerHTML = \`<div style="overflow-x:auto"><table><tr><th>직업 이름</th><th>등급</th><th class="num">주급 수당</th><th>모둠원 지급 권한</th><th>쿠폰 처리 권한</th><th></th></tr>\`+
    jobData.map((j,i)=>\`<tr>
      <td><input value="\${esc(j.name)}" style="width:160px" oninput="jobData[\${i}].name=this.value"></td>
      <td><select onchange="jobData[\${i}].tier=this.value">
        <option \${j.tier==="책임직"?"selected":""}>책임직</option>
        <option \${j.tier==="경량직"?"selected":""}>경량직</option></select></td>
      <td class="num"><input type="number" step="0.01" value="\${j.allowance}" style="width:90px;text-align:right" oninput="jobData[\${i}].allowance=Number(this.value)"></td>
      <td style="text-align:center"><input type="checkbox" \${j.canPay?"checked":""} onchange="jobData[\${i}].canPay=this.checked"></td>
      <td style="text-align:center"><input type="checkbox" \${j.canUseCoupon?"checked":""} onchange="jobData[\${i}].canUseCoupon=this.checked"></td>
      <td><button class="btn sm red" onclick="removeJobRow(\${i})">🗑 삭제</button></td>
    </tr>\`).join("")+\`</table></div>
    <p class="note">수당은 <b>주급 정액</b>입니다(예: 30이면 주급 지급 때 30을 받음). 학생이 빌릴 수 있는 <b>대출 한도(주급의 몇 배)</b>도 이 수당을 기준으로 계산됩니다. 모둠원 지급 권한: 학생 화면에서 같은 모둠원에게 소액을 직접 지급할 수 있어요(지급만 가능, 한도는 [설정]에서 조정). 쿠폰 처리 권한: 학생 화면에서 전체 학생의 사용 대기 쿠폰을 직접 처리할 수 있어요.</p>\`;
  renderJobPresets();
}
function addJobRow(){ jobData.push({id:null, name:"", tier:"경량직", allowance:20, canPay:false, canUseCoupon:false}); renderJobTable(); }
function removeJobRow(i){
  const j = jobData[i];
  const used = j.id ? stuData.filter(s=>Number(s.jobId)===Number(j.id)).length : 0;
  const who = used>0 ? \`\\n\\n⚠️ 이 직업을 맡은 학생 \${used}명은 '미배정'이 됩니다.\` : "";
  if(!confirm(\`'\${j.name||"이름 없는 직업"}' 직업을 목록에서 지울까요?\${who}\\n\\n지운 뒤 [직업 저장]을 눌러야 실제로 반영됩니다.\`)) return;
  jobData.splice(i,1);
  renderJobTable();
}

// ── 추천 직업 예시 (클릭하면 바로 추가) ──
const JOB_PRESETS = [
  {name:"모둠 회계사",     tier:"책임직", allowance:40, canPay:true,  canUseCoupon:false},
  {name:"마트 직원",       tier:"경량직", allowance:20, canPay:false, canUseCoupon:true},
  {name:"학급 신문기자",    tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"칠판 관리부장",    tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"우유급식 도우미",  tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"환경 미화부장",    tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"도서 사서",       tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"정보통신 도우미",  tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"음악 선곡 도우미", tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"체육부장",        tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"급식 도우미",     tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"실내화 관리부장",  tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"우체부",         tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"식물 재배사",     tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"안전 지킴이",     tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
  {name:"줄서기 반장",     tier:"경량직", allowance:20, canPay:false, canUseCoupon:false},
];
function renderJobPresets(){
  const have = new Set(jobData.map(j=>String(j.name).trim()));
  const remain = JOB_PRESETS.filter(p=>!have.has(p.name));
  $("jobPresets").innerHTML = remain.length===0 ? \`<span class="note">추천 직업을 모두 추가했어요.</span>\` :
    remain.map(p=>\`<button type="button" class="btn sm gray" onclick="addPresetJob('\${esc(p.name)}')">+ \${esc(p.name)}</button>\`).join("");
}
function addPresetJob(name){
  if(jobData.some(j=>String(j.name).trim()===name)){ toast("이미 추가되어 있어요."); return; }
  const preset = JOB_PRESETS.find(p=>p.name===name);
  if(!preset) return;
  jobData.push({id:null, name:preset.name, tier:preset.tier, allowance:preset.allowance, canPay:preset.canPay, canUseCoupon:preset.canUseCoupon});
  renderJobTable();
}
async function saveJobs(){
  const r = await api("/api/teacher/jobs/save", {jobs:jobData.filter(j=>String(j.name).trim())});
  if(r.ok){ toast("✅ 직업 저장 완료"); loadStudents(); } else toast(r.error||"실패");
}

// ══════════ 상점 ══════════
let shopItems = [];
async function loadShop(){
  const r = await api("/api/teacher/shop");
  if(!r.ok) return;
  shopItems = r.items;
  const shopOnly = shopItems.filter(it=>it.kind!=="draw");
  const drawOnly = shopItems.filter(it=>it.kind==="draw");
  const idx = it => shopItems.indexOf(it);
  $("itemTable").innerHTML = shopOnly.length===0 ? \`<p class="note">등록된 쿠폰이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>이름</th><th class="num">가격</th><th class="num">재고</th><th>판매</th><th></th></tr>\`+
    shopOnly.map(it=>\`<tr>
      <td><input value="\${esc(it.name)}" style="width:220px" oninput="shopItems[\${idx(it)}].name=this.value"></td>
      <td class="num"><input type="number" step="0.01" value="\${it.price}" style="width:90px;text-align:right" oninput="shopItems[\${idx(it)}].price=Number(this.value)"></td>
      <td class="num"><input type="number" value="\${it.stock}" style="width:80px;text-align:right" oninput="shopItems[\${idx(it)}].stock=Number(this.value)"></td>
      <td><input type="checkbox" \${it.active?"checked":""} onchange="shopItems[\${idx(it)}].active=this.checked"></td>
      <td class="row"><button class="btn sm gray" onclick="saveItem(\${idx(it)})">저장</button>
        <button class="btn sm red" onclick="deleteItem(\${idx(it)})">🗑</button></td>
    </tr>\`).join("")+\`</table></div>\`;
  // 뽑기 상품
  const wsum = drawOnly.filter(it=>it.active).reduce((a,it)=>a+(Number(it.weight)||0),0);
  $("drawTable").innerHTML = drawOnly.length===0 ? \`<p class="note">등록된 뽑기 상품이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>이름</th><th>특별 효과</th><th class="num">확률 가중치</th><th class="num">실제 확률</th><th>사용</th><th></th></tr>\`+
    drawOnly.map(it=>\`<tr>
      <td><input value="\${esc(it.name)}" style="width:200px" oninput="shopItems[\${idx(it)}].name=this.value"></td>
      <td><select style="width:200px" onchange="shopItems[\${idx(it)}].effect=this.value">
        <option value="" \${!it.effect?"selected":""}>일반 (이름 그대로)</option>
        <option value="discount50" \${it.effect==="discount50"?"selected":""}>🎟️ 상점 50% 할인권</option>
        <option value="randomShop" \${it.effect==="randomShop"?"selected":""}>🎰 상점 쿠폰 랜덤 지급</option>
      </select></td>
      <td class="num"><input type="number" value="\${it.weight||0}" style="width:90px;text-align:right" oninput="shopItems[\${idx(it)}].weight=Number(this.value)"></td>
      <td class="num"><b>\${it.active&&wsum>0 ? (Math.round((Number(it.weight)||0)/wsum*1000)/10)+"%" : "-"}</b></td>
      <td><input type="checkbox" \${it.active?"checked":""} onchange="shopItems[\${idx(it)}].active=this.checked"></td>
      <td class="row"><button class="btn sm gray" onclick="saveItem(\${idx(it)})">저장</button>
        <button class="btn sm red" onclick="deleteItem(\${idx(it)})">🗑</button></td>
    </tr>\`).join("")+\`</table></div>\`;
  api("/api/teacher/settings").then(s=>{
    if(!s.ok) return;
    const on = s.settings.drawEnabled !== false;
    $("drawCostInput").value = s.settings.drawCost ?? 50;
    $("drawEnabledInput").checked = on;
    $("drawEnabledLabel").classList.toggle("sel", on);
    $("drawCardCountInput").value = String(s.settings.drawCardCount ?? 3);
  });
  const pend = r.purchases.filter(p=>p.status==="보유");
  const used = r.purchases.filter(p=>p.status!=="보유").slice(0,30);
  $("pendingTable").innerHTML = pend.length===0 ? \`<p class="note">사용 대기 중인 쿠폰이 없습니다.</p>\` :
    \`<table><tr><th>구매일</th><th>학생</th><th>쿠폰</th><th></th></tr>\`+
    pend.map(p=>\`<tr><td>\${p.createdAt.substring(0,16)}</td><td>\${p.number}번 \${esc(p.nickname)}</td><td><b>\${esc(p.itemName)}</b></td>
      <td class="row"><button class="btn sm" onclick="usePurchase(\${p.id})">✅ 사용 처리</button>
      <button class="btn sm red" onclick="cancelPurchase(\${p.id})">↩ 구매 취소(환불)</button></td></tr>\`).join("")+\`</table>\`;
  $("usedTable").innerHTML = used.length===0 ? \`<p class="note">이력이 없습니다.</p>\` :
    \`<table><tr><th>학생</th><th>쿠폰</th><th>상태</th><th>처리일</th></tr>\`+
    used.map(p=>\`<tr><td>\${p.number}번 \${esc(p.nickname)}</td><td>\${esc(p.itemName)}</td>
      <td><span class="badge used">\${p.status}</span></td><td>\${(p.usedAt||p.createdAt||"").substring(0,16)}</td></tr>\`).join("")+\`</table>\`;
}
async function addItem(){
  const item = { name:$("newItemName").value.trim(), price:Number($("newItemPrice").value), stock:Number($("newItemStock").value)||0 };
  const r = await api("/api/teacher/shop/save", {item});
  if(r.ok){ toast("✅ 등록 완료"); $("newItemName").value=""; $("newItemPrice").value=""; $("newItemStock").value=""; loadShop(); }
  else toast(r.error||"실패");
}
async function saveItem(i){
  const r = await api("/api/teacher/shop/save", {item:shopItems[i]});
  if(r.ok){ toast("✅ 저장 완료"); loadShop(); } else toast(r.error||"실패");
}
async function deleteItem(i){
  const it = shopItems[i];
  if(!confirm(\`'\${it.name}' 쿠폰을 삭제할까요?\\n(학생이 이미 뽑거나 산 쿠폰은 그대로 남습니다)\`)) return;
  const r = await api("/api/teacher/shop/delete", {itemId:it.id});
  if(r.ok){ toast("🗑 삭제 완료"); loadShop(); } else toast(r.error||"실패");
}
async function addDrawItem(){
  const item = { name:$("newDrawName").value.trim(), weight:Number($("newDrawWeight").value),
                 kind:"draw", effect:$("newDrawEffect").value };
  const r = await api("/api/teacher/shop/save", {item});
  if(r.ok){ toast("✅ 행운 뽑기 상품 추가"); $("newDrawName").value=""; $("newDrawWeight").value=""; $("newDrawEffect").value=""; loadShop(); }
  else toast(r.error||"실패");
}
async function saveDrawSettings(){
  const cur = (await api("/api/teacher/settings")).settings;
  const on = $("drawEnabledInput").checked;
  $("drawEnabledLabel").classList.toggle("sel", on);
  const r = await api("/api/teacher/settings/save", {settings:{...cur, teacherPw:"",
    drawEnabled:on, drawCost:Number($("drawCostInput").value), drawCardCount:Number($("drawCardCountInput").value)}});
  if(r.ok) toast(on ? "✅ 행운 뽑기 설정 저장 (사용 중)" : "✅ 행운 뽑기를 껐습니다");
  else toast(r.error||"실패");
}
async function usePurchase(id){
  const r = await api("/api/teacher/purchase/use", {purchaseId:id});
  if(r.ok){ toast("✅ 사용 처리 완료"); loadShop(); } else toast(r.error||"실패");
}
async function cancelPurchase(id){
  if(!confirm("이 구매를 취소하고 환불할까요?")) return;
  const r = await api("/api/teacher/purchase/cancel", {purchaseId:id});
  if(r.ok){ toast("✅ 환불 완료"); loadShop(); } else toast(r.error||"실패");
}

// ══════════ 벌금 관리 ══════════
const FINE_PRESETS = [
  {name:"지각",           amount:10},
  {name:"숙제 미제출",     amount:20},
  {name:"수업 중 떠들기",  amount:10},
  {name:"준비물 미지참",   amount:15},
  {name:"자리 정리 안 함", amount:10},
  {name:"복도에서 뛰기",   amount:10},
  {name:"급식 남기기",     amount:10},
  {name:"친구 놀리기",     amount:30},
  {name:"거짓말",         amount:30},
  {name:"쓰레기 무단 투기", amount:20},
];
let fineData = [], fineStuList = [];
async function loadFines(){
  const r = await api("/api/teacher/fines");
  if(!r.ok) return;
  fineData = r.fines || [];
  renderFineTable();
  renderFineHistory(r.history || []);
  const rs = await api("/api/teacher/students");
  if(rs.ok){
    fineStuList = rs.students.filter(s=>s.active);
    $("fineStudents").innerHTML = fineStuList.map(s=>
      \`<label class="chk"><input type="checkbox" value="\${s.id}" onchange="this.parentNode.classList.toggle('sel',this.checked)" style="width:auto">\${s.number}번 \${esc(s.nickname)}\${s.group?\` <span style="color:var(--muted)">(\${s.group}모둠)</span>\`:""}</label>\`).join("");
  }
}
function renderFineTable(){
  $("fineSelect").innerHTML = fineData.filter(f=>f.active!==false && f.id).length===0
    ? \`<option value="">먼저 벌금 항목을 저장하세요</option>\`
    : fineData.filter(f=>f.active!==false && f.id).map(f=>\`<option value="\${f.id}">\${esc(f.name)} (-\${fmt(f.amount)})</option>\`).join("");
  $("fineTable").innerHTML = fineData.length===0 ? \`<p class="note">등록된 벌금 항목이 없습니다. 위 추천 항목을 눌러 추가하세요.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>벌금 이름</th><th class="num">금액</th><th>사용</th></tr>\`+
    fineData.map((f,i)=>\`<tr>
      <td><input value="\${esc(f.name)}" style="width:220px" oninput="fineData[\${i}].name=this.value"></td>
      <td class="num"><input type="number" step="0.01" value="\${f.amount}" style="width:100px;text-align:right" oninput="fineData[\${i}].amount=Number(this.value)"></td>
      <td style="text-align:center"><input type="checkbox" \${f.active!==false?"checked":""} onchange="fineData[\${i}].active=this.checked"></td>
    </tr>\`).join("")+\`</table></div>\`;
  renderFinePresets();
}
function renderFinePresets(){
  const have = new Set(fineData.map(f=>String(f.name).trim()));
  const remain = FINE_PRESETS.filter(p=>!have.has(p.name));
  $("finePresets").innerHTML = remain.length===0 ? \`<span class="note">추천 항목을 모두 추가했어요.</span>\` :
    remain.map(p=>\`<button type="button" class="btn sm gray" onclick="addPresetFine('\${esc(p.name)}')">+ \${esc(p.name)} (-\${p.amount})</button>\`).join("");
}
function addPresetFine(name){
  const p = FINE_PRESETS.find(x=>x.name===name);
  if(!p || fineData.some(f=>String(f.name).trim()===name)){ toast("이미 추가되어 있어요."); return; }
  fineData.push({id:null, name:p.name, amount:p.amount, active:true});
  renderFineTable();
}
function addFineRow(){ fineData.push({id:null, name:"", amount:10, active:true}); renderFineTable(); }
async function saveFines(){
  const r = await api("/api/teacher/fines/save", {fines:fineData.filter(f=>String(f.name).trim())});
  if(r.ok){ toast("✅ 벌금 항목 저장 완료"); loadFines(); } else toast(r.error||"실패");
}
function fineSelectAll(on){
  document.querySelectorAll("#fineStudents input").forEach(c=>{ c.checked=on; c.parentNode.classList.toggle('sel',on); });
}
async function doApplyFine(){
  const ids = [...document.querySelectorAll("#fineStudents input:checked")].map(c=>Number(c.value));
  const fineId = Number($("fineSelect").value);
  const fine = fineData.find(f=>f.id===fineId);
  if(!ids.length){ toast("학생을 선택하세요."); return; }
  if(!fine){ toast("벌금 항목을 선택하세요. (항목을 먼저 저장했는지 확인하세요)"); return; }
  if(!confirm(\`\${ids.length}명에게 '\${fine.name}' 벌금 \${fmt(fine.amount)}을(를) 부과할까요?\`)) return;
  const r = await api("/api/teacher/fines/apply", {studentIds:ids, fineId, memo:$("fineMemo").value});
  if(r.ok){ toast(\`⚖️ \${r.count}명에게 \${fmt(r.amount)} 벌금 부과 완료\`); $("fineMemo").value=""; fineSelectAll(false); loadFines(); }
  else toast(r.error||"실패");
}
function renderFineHistory(rows){
  $("fineHistory").innerHTML = (!rows || rows.length===0) ? \`<p class="note">벌금 부과 내역이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>일시</th><th>학생</th><th class="num">금액</th><th>사유</th></tr>\`+
    rows.map(t=>\`<tr><td>\${t.createdAt.substring(0,16)}</td><td>\${t.number}번 \${esc(t.nickname)}</td>
      <td class="num minus">\${fmt(t.amount)}</td><td>\${esc(t.memo)}</td></tr>\`).join("")+\`</table></div>\`;
}

// ══════════ 은행 (적금 · 대출 · 기부) ══════════
let bankData = null;
async function loadBank(){
  const r = await api("/api/teacher/bank");
  if(!r.ok){ toast(r.error||"은행 정보를 불러오지 못했습니다."); return; }
  bankData = r;
  CUR = r.currencyName || CUR;
  const s = r.settings, t = r.totals;
  $("bDepPrincipal").innerHTML = \`\${fmt(t.depositPrincipal)}<small>\${CUR}</small>\`;
  $("bDepValue").innerHTML = \`\${fmt(t.depositValue)}<small>\${CUR}</small>\`;
  $("bLoanTotal").innerHTML = \`\${fmt(t.loanPrincipal)}<small>\${CUR}</small>\`;
  $("bDonPool").innerHTML = \`\${fmt(t.donationPool)}<small>/ \${fmt(s.donationThreshold)}</small>\`;

  // 설정 입력칸
  const flags = [["bankEnabled","bankEnabledInput","bankEnabledLabel"],
                 ["savingsEnabled","savingsEnabledInput","savingsEnabledLabel"],
                 ["loanEnabled","loanEnabledInput","loanEnabledLabel"],
                 ["donationEnabled","donationEnabledInput","donationEnabledLabel"]];
  for(const [key, input, label] of flags){
    const on = s[key] !== false;
    $(input).checked = on;
    $(label).classList.toggle("sel", on);
  }
  $("savingsMaxInput").value = s.savingsMax;
  $("savingsRateInput").value = s.savingsRate;
  $("savingsPeriodInput").value = s.savingsPeriodDays;
  $("savingsLockInput").value = s.savingsLockDays;
  $("loanRateInput").value = s.loanRate;
  $("loanPeriodInput").value = s.loanPeriodDays;
  $("loanMultiplierInput").value = s.loanMultiplier;
  $("donationThresholdInput").value = s.donationThreshold;

  // 적금 현황
  $("bankDepositTable").innerHTML = r.deposits.length===0 ? \`<p class="note">아직 적금을 넣은 학생이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>학생</th><th class="num">원금</th><th>시작일</th><th>상태</th>
      <th class="num">붙은 이자</th><th class="num">현재 평가액</th></tr>\`+
    r.deposits.map(d=>\`<tr><td>\${d.number}번 \${esc(d.nickname)}</td>
      <td class="num">\${fmt(d.amount)}</td><td>\${d.createdAt.substring(0,10)}</td>
      <td>\${d.locked?\`<span class="badge lock">🔒 \${d.daysLeft}일 남음</span>\`:\`<span class="badge ready">찾을 수 있음</span>\`}
        <span class="note" style="margin:0">이자 \${d.periods}회</span></td>
      <td class="num plus">+\${fmt(d.interest)}</td><td class="num"><b>\${fmt(d.value)}</b></td></tr>\`).join("")+\`</table></div>\`;

  // 대출 현황
  $("bankLoanTable").innerHTML = r.loans.length===0 ? \`<p class="note">대출 중인 학생이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>학생</th><th class="num">남은 원금</th><th class="num">처음 빌린 금액</th>
      <th>빌린 날</th><th>다음 이자일</th><th class="num">한 주 이자</th><th class="num">지금까지 낸 이자</th><th></th></tr>\`+
    r.loans.map(l=>\`<tr><td>\${l.number}번 \${esc(l.nickname)}</td>
      <td class="num minus">\${fmt(l.principal)}</td><td class="num">\${fmt(l.original)}</td>
      <td>\${l.createdAt.substring(0,10)}</td><td>\${l.nextInterestAt.substring(0,10)} (\${l.daysToInterest}일 뒤)</td>
      <td class="num">\${fmt(l.weekInterest)}</td><td class="num minus">\${fmt(l.interestPaid)}</td>
      <td><button class="btn sm red" onclick="doForgiveLoan(\${l.id},'\${esc(l.nickname)}',\${l.principal})">탕감</button></td></tr>\`).join("")+\`</table></div>\`;

  // 기부 현황
  const pct = Math.min(100, Math.round(t.donationPool / Math.max(1, s.donationThreshold) * 100));
  $("bankDonateBox").innerHTML =
    \`<div class="row"><b style="font-size:22px">\${fmt(t.donationPool)} \${CUR}</b>
      <span class="note" style="margin:0">/ 목표 \${fmt(s.donationThreshold)} \${CUR} (\${pct}%)</span></div>
     <div style="height:14px;border-radius:99px;background:#efeeea;overflow:hidden;margin:10px 0 4px">
       <span style="display:block;height:100%;width:\${pct}%;background:linear-gradient(90deg,#eda100,#e07b00)"></span></div>\`;
  $("bankDonateHist").innerHTML =
    \`<div class="grid c2">
      <div><h3>기부한 학생 (최근 50건)</h3>\${r.donations.length===0 ? \`<p class="note">아직 기부가 없습니다.</p>\` :
        \`<div style="overflow-x:auto"><table><tr><th>일시</th><th>학생</th><th class="num">금액</th></tr>\`+
        r.donations.map(x=>\`<tr><td>\${x.createdAt.substring(0,16)}</td><td>\${x.number}번 \${esc(x.nickname)}</td>
          <td class="num">\${fmt(x.amount)}</td></tr>\`).join("")+\`</table></div>\`}</div>
      <div><h3>나눔 기록 (기부금 전달)</h3>\${r.grants.length===0 ? \`<p class="note">아직 나눔이 없습니다.</p>\` :
        \`<div style="overflow-x:auto"><table><tr><th>일시</th><th>받은 학생</th><th class="num">금액</th></tr>\`+
        r.grants.map(x=>\`<tr><td>\${x.createdAt.substring(0,16)}</td><td>\${x.number}번 \${esc(x.nickname)}</td>
          <td class="num plus">+\${fmt(x.amount)}</td></tr>\`).join("")+\`</table></div>\`}</div>
     </div>\`;

  // 학생 재산 순위 (많은 순 → 맨 아래가 기부금 받을 학생)
  $("bankAssetTable").innerHTML = r.assets.length===0 ? \`<p class="note">등록된 학생이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>순위</th><th>학생</th><th class="num">현금</th><th class="num">적금 평가액</th>
      <th class="num">주식 평가액</th><th class="num">합계</th><th class="num">대출 잔액</th></tr>\`+
    r.assets.map((a,i)=>\`<tr\${i===r.assets.length-1?' style="background:#fff6e6"':""}>
      <td>\${i+1}</td><td>\${a.number}번 \${esc(a.nickname)}\${i===r.assets.length-1?' 💝':""}</td>
      <td class="num">\${fmt(a.cash)}</td><td class="num">\${fmt(a.savings)}</td><td class="num">\${fmt(a.stock)}</td>
      <td class="num"><b>\${fmt(a.total)}</b></td>
      <td class="num \${a.loan>0?"minus":""}">\${a.loan>0?fmt(a.loan):"-"}</td></tr>\`).join("")+\`</table></div>\`;
}
async function saveBankSettings(){
  const cur = (await api("/api/teacher/settings")).settings;
  const settings = {...cur, teacherPw:"",
    bankEnabled:$("bankEnabledInput").checked,
    savingsEnabled:$("savingsEnabledInput").checked,
    savingsMax:Number($("savingsMaxInput").value),
    savingsRate:Number($("savingsRateInput").value),
    savingsPeriodDays:Number($("savingsPeriodInput").value),
    savingsLockDays:Number($("savingsLockInput").value),
    loanEnabled:$("loanEnabledInput").checked,
    loanRate:Number($("loanRateInput").value),
    loanPeriodDays:Number($("loanPeriodInput").value),
    loanMultiplier:Number($("loanMultiplierInput").value),
    donationEnabled:$("donationEnabledInput").checked,
    donationThreshold:Number($("donationThresholdInput").value)};
  const r = await api("/api/teacher/settings/save", {settings});
  if(r.ok){ toast("✅ 은행 설정 저장 완료"); loadBank(); } else toast(r.error||"실패");
}
async function doGrantNow(){
  if(!bankData) return;
  if(bankData.totals.donationPool <= 0){ toast("모인 기부금이 없습니다."); return; }
  if(!confirm(\`모인 기부금 \${fmt(bankData.totals.donationPool)} \${CUR}을(를) 지금 바로 전달할까요?\\n\\n남은 재산(현금+적금+주식)이 가장 적은 학생에게 전액 지급됩니다.\`)) return;
  const r = await api("/api/teacher/bank/grant");
  if(r.ok){ toast(\`💝 \${r.to}에게 \${fmt(r.amount)} \${CUR} 전달 완료\`); loadBank(); }
  else toast(r.error||"실패");
}
async function doForgiveLoan(loanId, who, principal){
  if(!confirm(\`\${who} 학생의 남은 대출 원금 \${fmt(principal)} \${CUR}을(를) 탕감할까요?\\n\\n· 학생 잔액은 그대로이고, 갚을 의무만 사라집니다.\\n· 이자도 더 이상 빠져나가지 않습니다.\`)) return;
  const r = await api("/api/teacher/bank/loan/forgive", {loanId});
  if(r.ok){ toast("✅ 대출 탕감 완료"); loadBank(); } else toast(r.error||"실패");
}

// ══════════ 주식 관리 ══════════
let stockData = [], stockConfig = {};
async function loadStocks(){
  const r = await api("/api/teacher/stocks");
  if(!r.ok) return;
  stockData = r.stocks;
  stockConfig = r.stockConfig || {};
  $("stockAutoSync").checked = !!stockConfig.autoSync;
  $("kisAppKey").placeholder = stockConfig.hasKisAppKey ? "KIS App Key 저장됨 (변경할 때만 입력)" : "KIS App Key";
  $("kisAppSecret").placeholder = stockConfig.hasKisAppSecret ? "KIS App Secret 저장됨 (변경할 때만 입력)" : "KIS App Secret";
  $("stockApiKey").placeholder = stockConfig.hasApiKey ? "Twelve Data 키 저장됨 (변경할 때만 입력)" : "Twelve Data API 키 (미국주식용)";
  $("stockSyncStatus").textContent = (stockConfig.lastSyncAt ? "마지막 확인: "+stockConfig.lastSyncAt+" · " : "") + (stockConfig.lastMessage || "아직 시세를 반영하지 않았습니다.");
  $("stockEnabledInput").checked = r.stockEnabled;
  $("stockEnabledLabel").classList.toggle("sel", r.stockEnabled);
  $("stockTable").innerHTML = stockData.length===0 ? \`<p class="note">등록된 종목이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>학급 종목</th><th class="num">현재가</th><th class="num">직전 대비</th><th>연결 방식 / 실제 종목</th><th>수동 가격 조정</th><th>사용</th><th></th></tr>\`+
    stockData.map((x,i)=>\`<tr>
      <td><input value="\${esc(x.name)}" style="width:150px" oninput="stockData[\${i}].name=this.value"></td>
      <td class="num"><input type="number" step="0.01" min="0.01" id="sp-\${x.id}" value="\${Number(x.price).toFixed(2)}" style="width:90px;text-align:right" oninput="stockData[\${i}].price=Number(this.value)"></td>
      <td class="num \${x.change>0?"plus":(x.change<0?"minus":"")}">\${x.change>0?"▲":(x.change<0?"▼":"―")} \${Math.abs(x.change)}%</td>
      <td>
        <select style="width:105px" onchange="stockData[\${i}].linkMode=this.value;stockModeHint(\${i})">
          <option value="manual" \${x.linkMode!=="market"?"selected":""}>교사 수동</option>
          <option value="market" \${x.linkMode==="market"?"selected":""}>실제 연동</option>
        </select>
        <input value="\${esc(x.symbol||"")}" placeholder="종목코드" style="width:95px" oninput="stockData[\${i}].symbol=this.value">
        <input value="\${esc(x.exchange||"")}" placeholder="거래소" style="width:85px" oninput="stockData[\${i}].exchange=this.value">
        \${x.lastMarketDate?\`<div class="note">\${x.lastMarketDate} 실제 \${x.lastMarketChange>0?"+":""}\${x.lastMarketChange}%</div>\`:""}
      </td>
      <td class="row">
        <button class="btn sm gray" onclick="bumpStock(\${i},-10)">−10%</button>
        <button class="btn sm gray" onclick="bumpStock(\${i},10)">+10%</button>
      </td>
      <td><input type="checkbox" \${x.active!==false?"checked":""} onchange="stockData[\${i}].active=this.checked"></td>
      <td class="row"><button class="btn sm" onclick="saveStock(\${i})">저장</button>
        <button class="btn sm red" onclick="deleteStock(\${i})">🗑</button></td>
    </tr>\`).join("")+\`</table></div>\`;
  $("holdingTable").innerHTML = (!r.holdings || r.holdings.length===0) ? \`<p class="note">아직 주식을 가진 학생이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>학생</th><th>종목</th><th class="num">수량</th><th class="num">평균 매입가</th><th class="num">평가액</th></tr>\`+
    r.holdings.map(h=>\`<tr><td>\${h.number}번 \${esc(h.nickname)}</td><td>\${esc(h.stock)}</td>
      <td class="num">\${h.qty}주</td><td class="num">\${fmtStock(h.avgCost)}</td><td class="num"><b>\${fmt(h.value)}</b></td></tr>\`).join("")+\`</table></div>\`;
}
function isKoreanStockRow(x){
  const ex = String(x.exchange || "").trim().toUpperCase();
  const sym = String(x.symbol || "").trim();
  return ["KRX","KOSPI","KOSDAQ","SEOUL"].includes(ex) || (!ex && /^\\d{6}$/.test(sym));
}
function stockModeHint(i){ toast(stockData[i].linkMode==="market" ? "종목코드와 거래소를 입력한 뒤 저장하세요." : "교사가 직접 가격을 조정합니다."); }
async function saveStockConfig(){
  const config = {
    autoSync:$("stockAutoSync").checked,
    apiKey:$("stockApiKey").value.trim(),
    kisAppKey:$("kisAppKey").value.trim(),
    kisAppSecret:$("kisAppSecret").value.trim()
  };
  const r = await api("/api/teacher/stocks/config", {config});
  if(r.ok){
    $("stockApiKey").value=""; $("kisAppKey").value=""; $("kisAppSecret").value="";
    toast("✅ 실제 주식 연동 설정 저장"); loadStocks();
  } else toast(r.error||"실패");
}
async function syncStocksNow(ev){
  const btn=ev.currentTarget; btn.disabled=true; btn.textContent="시세 확인 중...";
  const r=await api("/api/teacher/stocks/sync");
  btn.disabled=false; btn.textContent="🔄 지금 시세 반영";
  if(r.ok){ toast("✅ "+(r.message||"시세 반영 완료")); loadStocks(); } else toast(r.error||"시세 반영 실패");
}
async function saveStock(i){
  const r = await api("/api/teacher/stocks/save", {stock:stockData[i]});
  if(r.ok){ toast("✅ 저장 완료"); loadStocks(); } else toast(r.error||"실패");
}
async function bumpStock(i, pct){
  const x = stockData[i];
  const next = Math.max(0.01, Math.round(Number(x.price) * (1 + pct/100) * 100) / 100);
  const r = await api("/api/teacher/stocks/save", {stock:{...x, price:next}});
  if(r.ok){ toast(\`\${x.name} \${fmt(x.price)} → \${fmt(next)} (\${pct>0?"+":""}\${pct}%)\`); loadStocks(); }
  else toast(r.error||"실패");
}
async function addStock(){
  const stock = { name:$("newStockName").value.trim(), price:Number($("newStockPrice").value) };
  const r = await api("/api/teacher/stocks/save", {stock});
  if(r.ok){ toast("✅ 종목 추가"); $("newStockName").value=""; $("newStockPrice").value=""; loadStocks(); }
  else toast(r.error||"실패");
}
async function deleteStock(i){
  const x = stockData[i];
  if(!confirm(\`'\${x.name}' 종목을 삭제할까요?\\n(이 종목을 가진 학생이 있으면 삭제되지 않습니다)\`)) return;
  const r = await api("/api/teacher/stocks/delete", {stockId:x.id});
  if(r.ok){ toast("🗑 삭제 완료"); loadStocks(); } else toast(r.error||"실패");
}
async function saveStockEnabled(){
  const on = $("stockEnabledInput").checked;
  $("stockEnabledLabel").classList.toggle("sel", on);
  const cur = (await api("/api/teacher/settings")).settings;
  const r = await api("/api/teacher/settings/save", {settings:{...cur, teacherPw:"", stockEnabled:on}});
  if(r.ok) toast(on ? "✅ 주식 사용 중" : "✅ 주식을 껐습니다"); else toast(r.error||"실패");
}

// ══════════ 세금 ══════════
async function loadTaxes(){
  const r = await api("/api/teacher/taxes");
  if(!r.ok) return;
  const DAYS = ["","월","화","수","목","금","토","일"];
  $("taxGrand").innerHTML = \`\${fmt(r.grandTotal)}<small>\${CUR}</small>\`;
  $("taxRateTile").innerHTML = \`\${r.taxRate}<small>%</small>\`;
  $("taxWhen").textContent = \`\${DAYS[r.taxWeekday]||"금"}요일 \${r.taxTime}\`;
  $("taxLast").textContent = r.lastTaxAt ? String(r.lastTaxAt).substring(0,16) : "아직 없음";
  $("taxTotals").innerHTML = (!r.totals || r.totals.length===0) ? \`<p class="note">학생이 없습니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>번호</th><th>별명</th><th class="num">낸 세금 합계</th></tr>\`+
    r.totals.map(t=>\`<tr><td>\${t.number}</td><td>\${esc(t.nickname)}</td>
      <td class="num \${t.total>0?"minus":""}">\${t.total>0?fmt(t.total):"-"}</td></tr>\`).join("")+\`</table></div>\`;
  $("taxHistory").innerHTML = (!r.history || r.history.length===0) ?
    \`<p class="note">아직 걷힌 세금이 없습니다. \${DAYS[r.taxWeekday]||"금"}요일 \${r.taxTime}이 지나면 자동으로 징수됩니다.</p>\` :
    \`<div style="overflow-x:auto"><table><tr><th>일시</th><th>학생</th><th class="num">세금</th><th>계산 내용</th></tr>\`+
    r.history.map(t=>\`<tr><td>\${t.createdAt.substring(0,16)}</td><td>\${t.number}번 \${esc(t.nickname)}</td>
      <td class="num minus">\${fmt(t.amount)}</td><td>\${esc(t.memo)}</td></tr>\`).join("")+\`</table></div>\`;
}

// ══════════ 설정 ══════════
async function loadSettings(){
  const r = await api("/api/teacher/settings");
  if(!r.ok) return;
  const s = r.settings;
  $("sCode").value = s.classCode; $("sCur").value = s.currencyName;
  $("sBase").value = s.basePay; $("sLate").value = s.latePay;
  $("sTax").value = s.taxRate; $("sDeadline").value = s.deadline; $("sPw").value = "";
  $("sPayTx").value = s.payLimitPerTx ?? 50; $("sPayDay").value = s.payLimitPerDay ?? 100;
  $("sTaxDay").value = String(s.taxWeekday ?? 5); $("sTaxTime").value = s.taxTime ?? "09:00";
  $("sCooldown").value = s.tradeCooldown ?? 3;
  const lucky = s.luckyEnabled !== false;
  $("sLucky").checked = lucky; $("sLuckyLabel").classList.toggle("sel", lucky);
  $("sLuckyStart").value = s.luckyStart ?? "12:53";
  $("sLuckyEnd").value = s.luckyEnd ?? "12:57";
  $("sLuckyReward").value = s.luckyReward ?? 2;
}
async function saveSettings(){
  const settings = {
    classCode:$("sCode").value, currencyName:$("sCur").value,
    basePay:Number($("sBase").value), latePay:Number($("sLate").value),
    taxRate:Number($("sTax").value), deadline:$("sDeadline").value, teacherPw:$("sPw").value,
    payLimitPerTx:Number($("sPayTx").value), payLimitPerDay:Number($("sPayDay").value),
    taxWeekday:Number($("sTaxDay").value), taxTime:$("sTaxTime").value,
    tradeCooldown:Number($("sCooldown").value),
    luckyEnabled:$("sLucky").checked, luckyStart:$("sLuckyStart").value,
    luckyEnd:$("sLuckyEnd").value, luckyReward:Number($("sLuckyReward").value)
  };
  const r = await api("/api/teacher/settings/save", {settings});
  if(r.ok){
    toast("✅ 설정 저장 완료");
    if(settings.teacherPw){ const a = auth(); a.pw = settings.teacherPw; localStorage.setItem("bankTeacher", JSON.stringify(a)); }
    loadSettings();
  } else toast(r.error||"실패");
}
function exportCsv(kind){
  const a = auth();
  location.href = \`/api/export/\${kind}?id=\${encodeURIComponent(a.id)}&pw=\${encodeURIComponent(a.pw)}\`;
}

boot();
</script>
</body>
</html>
`;
// 다람쌤 마스코트 (build 스크립트가 bank-app/mascot.png 를 base64 로 넣어 줌)
const MASCOT_PNG_B64 = "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";

// ── 기본 데이터 (로컬판 bank-server.ps1 과 동일 구조) ──
function defaultState() {
  return {
    seq: 100,
    settings: {
      classCode: "6-1", currencyName: "미소",
      taxRate: 10, basePay: 100, latePay: 80, deadline: "09:00",
      teacherId: "teacher", teacherPw: "0000",
      payLimitPerTx: 50, payLimitPerDay: 100,
      // 소득세 자동 징수: 매주 금요일(5) 09:00 에 그 주 수입의 taxRate% 를 한 번에 뺀다
      taxWeekday: 5, taxTime: "09:00", lastTaxAt: null,
      // 행운 뽑기 (상점에서 사는 쿠폰과는 별개로 운영)
      drawEnabled: true, drawCost: 50, drawCardCount: 3, drawSeeded: true,
      // 행운 버튼 — 정해진 몇 분 사이에 누르면 보너스, 하루 한 번만
      luckyEnabled: true, luckyStart: "12:53", luckyEnd: "12:57", luckyReward: 2,
      // 주식 — 수동 조정 또는 실제 종목의 일간 등락률 연동
      stockEnabled: true, stockSeeded: true, stockAutoSync: false,
      stockMaxChange: 15, stockApiKey: "",
      // 국내주식: 한국투자증권 Open API (KIS)
      kisAppKey: "", kisAppSecret: "", kisAccessToken: "", kisTokenExpiresAt: 0,
      lastStockSyncAt: null, lastStockSyncMessage: "", lastStockSyncAttemptDate: null,
      // 은행 — 적금 / 대출 / 기부
      bankEnabled: true,
      savingsEnabled: true, savingsMax: 250, savingsRate: 5, savingsPeriodDays: 7, savingsLockDays: 10,
      loanEnabled: true, loanRate: 5, loanPeriodDays: 7, loanMultiplier: 2,
      donationEnabled: true, donationThreshold: 150,
      // 연타·느린 인터넷으로 같은 주문이 여러 번 나가는 것을 막는 최소 간격(초)
      tradeCooldown: 3,
    },
    // 주식 종목 (history: 가격 변동 기록, 최근 30개만 보관)
    stocks: [
      { id: 71, name: "다람전자", price: 100, active: true, history: [100] },
      { id: 72, name: "미소식품", price: 60, active: true, history: [60] },
      { id: 73, name: "학교문구", price: 40, active: true, history: [40] },
    ],
    holdings: [],   // { id, studentId, stockId, qty, avgCost }
    // 은행 기록
    deposits: [],        // { id, studentId, amount, createdAt, status, closedAt, received, interest }
    loans: [],           // { id, studentId, principal, original, createdAt, lastInterestAt, interestPaid, status, closedAt }
    donations: [],       // { id, studentId, amount, createdAt }
    donationGrants: [],  // { id, studentId, amount, createdAt }
    donationPool: 0,
    // 모둠 6개 · 마트 직원 3~4명 · 그 외 1인1역 — 총 24명 배정 기준 추천 직업 목록
    jobs: [
      { id: 1,  name: "모둠 회계사",     tier: "책임직", allowance: 40, canPay: true,  canUseCoupon: false },
      { id: 2,  name: "마트 직원",       tier: "경량직", allowance: 20, canPay: false, canUseCoupon: true },
      { id: 3,  name: "학급 신문기자",    tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 4,  name: "칠판 관리부장",    tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 5,  name: "우유급식 도우미",  tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 6,  name: "환경 미화부장",    tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 7,  name: "도서 사서",       tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 8,  name: "정보통신 도우미",  tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 9,  name: "음악 선곡 도우미", tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 10, name: "체육부장",        tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 11, name: "급식 도우미",     tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 12, name: "실내화 관리부장",  tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 13, name: "우체부",         tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 14, name: "식물 재배사",     tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 15, name: "안전 지킴이",     tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
      { id: 16, name: "줄서기 반장",     tier: "경량직", allowance: 20, canPay: false, canUseCoupon: false },
    ],
    // 벌금 항목 (금액은 양수로 저장하고, 부과할 때 잔액에서 차감)
    fines: [
      { id: 51, name: "지각", amount: 10, active: true },
      { id: 52, name: "숙제 미제출", amount: 20, active: true },
      { id: 53, name: "수업 중 떠들기", amount: 10, active: true },
    ],
    students: [], attendance: [], transactions: [],
    // kind: "shop" = 상점에서 사는 쿠폰, "draw" = 뽑기로만 나오는 쿠폰(weight = 확률 가중치)
    shopItems: [
      { id: 61, name: "숙제 하루 면제권", price: 0, stock: 0, active: true, kind: "draw", weight: 5 },
      { id: 62, name: "자리 바꾸기 쿠폰", price: 0, stock: 0, active: true, kind: "draw", weight: 15 },
      { id: 63, name: "음악 선곡권", price: 0, stock: 0, active: true, kind: "draw", weight: 30 },
      { id: 64, name: "칭찬 스티커", price: 0, stock: 0, active: true, kind: "draw", weight: 50 },
    ],
    purchases: [], payslips: [],
  };
}

// 이전 버전 데이터 호환 — 없는 필드 채우기
function migrate(st) {
  if (!Array.isArray(st.fines)) st.fines = defaultState().fines;
  const s = st.settings;
  if (s.taxWeekday == null) s.taxWeekday = 5;
  if (!s.taxTime) s.taxTime = "09:00";
  if (s.lastTaxAt === undefined) s.lastTaxAt = null;
  if (s.drawCost == null) s.drawCost = 50;
  if (s.drawEnabled == null) s.drawEnabled = true;
  if (!(Number(s.drawCardCount) >= 2)) s.drawCardCount = 3;
  if (s.luckyEnabled == null) s.luckyEnabled = true;
  if (!/^\d{2}:\d{2}$/.test(String(s.luckyStart))) s.luckyStart = "12:53";
  if (!/^\d{2}:\d{2}$/.test(String(s.luckyEnd))) s.luckyEnd = "12:57";
  if (s.luckyReward == null) s.luckyReward = 2;
  if (s.stockEnabled == null) s.stockEnabled = true;
  if (s.stockAutoSync == null) s.stockAutoSync = false;
  if (!(Number(s.stockMaxChange) >= 1)) s.stockMaxChange = 15;
  if (s.stockApiKey == null) s.stockApiKey = "";
  if (s.kisAppKey == null) s.kisAppKey = "";
  if (s.kisAppSecret == null) s.kisAppSecret = "";
  if (s.kisAccessToken == null) s.kisAccessToken = "";
  if (!(Number(s.kisTokenExpiresAt) >= 0)) s.kisTokenExpiresAt = 0;
  if (s.lastStockSyncAt === undefined) s.lastStockSyncAt = null;
  if (s.lastStockSyncMessage == null) s.lastStockSyncMessage = "";
  if (s.lastStockSyncAttemptDate === undefined) s.lastStockSyncAttemptDate = null;
  // 은행 (적금·대출·기부)
  if (s.bankEnabled == null) s.bankEnabled = true;
  if (s.savingsEnabled == null) s.savingsEnabled = true;
  if (!(Number(s.savingsMax) >= 1)) s.savingsMax = 250;
  if (!(Number(s.savingsRate) >= 0)) s.savingsRate = 5;
  if (!(Number(s.savingsPeriodDays) >= 1)) s.savingsPeriodDays = 7;
  if (!(Number(s.savingsLockDays) >= 0)) s.savingsLockDays = 10;
  if (s.loanEnabled == null) s.loanEnabled = true;
  if (!(Number(s.loanRate) >= 0)) s.loanRate = 5;
  if (!(Number(s.loanPeriodDays) >= 1)) s.loanPeriodDays = 7;
  if (!(Number(s.loanMultiplier) > 0)) s.loanMultiplier = 2;
  if (s.donationEnabled == null) s.donationEnabled = true;
  if (!(Number(s.donationThreshold) >= 1)) s.donationThreshold = 150;
  if (!(Number(s.tradeCooldown) >= 0)) s.tradeCooldown = 3;
  if (!Array.isArray(st.deposits)) st.deposits = [];
  if (!Array.isArray(st.loans)) st.loans = [];
  if (!Array.isArray(st.donations)) st.donations = [];
  if (!Array.isArray(st.donationGrants)) st.donationGrants = [];
  if (!(Number(st.donationPool) >= 0)) st.donationPool = 0;
  if (!Array.isArray(st.holdings)) st.holdings = [];
  if (!Array.isArray(st.stocks)) st.stocks = [];
  if (!s.stockSeeded) {   // 기본 종목은 딱 한 번만 (교사가 다 지우면 되살아나지 않도록)
    if (!st.stocks.length) for (const x of defaultState().stocks) st.stocks.push(x);
    s.stockSeeded = true;
  }
  for (const x of st.stocks) {
    if (!Array.isArray(x.history)) x.history = [Number(x.price) || 0];
    if (!x.linkMode) x.linkMode = "manual";
    if (x.symbol == null) x.symbol = "";
    if (x.exchange == null) x.exchange = "";
  }
  // 옛 쿠폰에는 kind 가 없다 → 상점용으로 본다
  for (const it of st.shopItems) { if (!it.kind) it.kind = "shop"; if (it.effect == null) it.effect = ""; }
  // 기본 뽑기 상품은 '딱 한 번만' 넣는다.
  // (매번 넣으면 교사가 뽑기 상품을 모두 지웠을 때 지운 것이 되살아난다)
  if (!s.drawSeeded) {
    if (!st.shopItems.some(i => i.kind === "draw")) {
      for (const it of defaultState().shopItems) st.shopItems.push(it);
    }
    s.drawSeeded = true;
  }
  return st;
}

// ── 한국 시간 (Worker 는 UTC 로 돌므로 반드시 서울 기준으로 변환) ──
function kst() {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date()); // "2026-07-08 10:04:05"
  return { date: s.slice(0, 10), time: s.slice(11, 16), datetime: s };
}
function kstDaysAgo(n) {      // n일 전의 한국 시간 (yyyy-MM-dd HH:mm:ss)
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(Date.now() - n * 86400000));
}
// "yyyy-MM-dd HH:mm:ss" 문자열끼리의 날짜 계산 (모두 한국 시간 기준이라 그대로 빼면 된다)
function dtMs(s) { return Date.parse(String(s).replace(" ", "T") + "Z"); }
function dtShift(s, days) { return new Date(dtMs(s) + days * 86400000).toISOString().slice(0, 19).replace("T", " "); }
function daysBetween(a, b) { return (dtMs(b) - dtMs(a)) / 86400000; }
function weekStart(dateStr) { // 월요일 시작
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

// ── 소득세 자동 징수 ────────────────────────────────────────
// 세금은 '누가 접속할 때마다' 검사해서, 지난 징수 시각 이후로 정해진 요일·시각을
// 지났으면 그때 한 번에 뺀다. (서버가 금요일 9시에 꺼져 있어도 나중에 자동으로 따라잡음)
// 적금·대출·기부로 오간 돈은 수입으로 보지 않는다 (원금을 옮기는 것이므로).
const INCOME_TYPES = ["일급", "주급", "모둠지급", "수동"];

function kstWeekday(dateStr) {           // 1=월 ... 7=일
  const w = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}
// 지금 기준으로 '이미 지나간' 가장 최근 징수 시각
function taxCutoff(st) {
  const now = kst();
  const W = Number(st.settings.taxWeekday) || 5;
  const T = /^\d{2}:\d{2}$/.test(String(st.settings.taxTime)) ? String(st.settings.taxTime) : "09:00";
  let back = kstWeekday(now.date) - W;
  if (back < 0) back += 7;
  if (back === 0 && now.time < T) back = 7;   // 오늘이 그 요일이지만 아직 시각 전 → 지난주
  const d = new Date(now.date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10) + " " + T + ":00";
}
function incomeBetween(st, sid, after, until) {
  let sum = 0;
  for (const t of st.transactions) {
    if (t.studentId !== sid || Number(t.amount) <= 0) continue;
    if (INCOME_TYPES.indexOf(t.type) < 0) continue;
    const at = String(t.createdAt);
    if (at > after && (!until || at <= until)) sum += Number(t.amount);
  }
  return money(sum);
}
function runScheduledTax(st) {
  const cutoff = taxCutoff(st);
  const last = st.settings.lastTaxAt;
  // 첫 실행은 기준점만 잡는다 (예전 잔액에 소급 과세하지 않도록)
  if (!last) { st.settings.lastTaxAt = cutoff; return true; }
  if (last >= cutoff) return false;
  const rate = Number(st.settings.taxRate) || 0;
  if (rate > 0) {
    const snapshot = st.transactions.slice();   // 세금 거래를 넣는 동안 원본이 늘어나지 않도록
    for (const s of st.students.filter(x => x.active)) {
      let income = 0;
      for (const t of snapshot) {
        if (t.studentId !== s.id || Number(t.amount) <= 0) continue;
        if (INCOME_TYPES.indexOf(t.type) < 0) continue;
        const at = String(t.createdAt);
        if (at > last && at <= cutoff) income += Number(t.amount);
      }
      const tax = money(income * rate / 100);
      if (tax > 0) addTx(st, s.id, -tax, "세금", `소득세 (한 주 수입 ${income}의 ${rate}%)`);
    }
  }
  st.settings.lastTaxAt = cutoff;
  return true;
}

// ── 도메인 로직 ──
function nextId(st) { st.seq = (st.seq | 0) + 1; return st.seq; }
// 학급화폐는 소수점 둘째 자리까지 쓴다 (주가가 3.66이면 3.66만 결제되도록).
// 더하기·곱하기에서 생기는 부동소수점 찌꺼기(0.30000000000000004)를 여기서 정리한다.
function money(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function getBalance(st, sid) {
  let sum = 0;
  for (const t of st.transactions) if (t.studentId === sid) sum += Number(t.amount);
  return money(sum);
}
function getJob(st, jobId) { return st.jobs.find(j => j.id === jobId) || null; }
function testTeacher(st, auth) {
  if (!auth) return false;
  const s = st.settings;
  return String(auth.id) === String(s.teacherId) && String(auth.pw) === String(s.teacherPw);
}
function authStudent(st, auth) {
  if (!auth) return null;
  if (String(auth.classCode) !== String(st.settings.classCode)) return null;
  return st.students.find(s =>
    Number(s.number) === Number(auth.number) && String(s.pin) === String(auth.pin) && s.active) || null;
}
// ── 쿠폰 뽑기 ──
// effect: ""=이름 그대로인 쿠폰, "discount50"=상점 50% 할인권, "randomShop"=상점 쿠폰 랜덤 지급
function shopStock(st) {   // 학생이 실제로 받을 수 있는 상점 쿠폰
  return st.shopItems.filter(i => i.kind !== "draw" && i.active && Number(i.stock) > 0);
}
function drawPool(st) {
  const canRandom = shopStock(st).length > 0;
  return st.shopItems.filter(i =>
    i.kind === "draw" && i.active && Number(i.weight) > 0 &&
    // 줄 수 있는 상점 쿠폰이 없으면 '랜덤 지급' 상품은 아예 뽑히지 않게 한다
    (i.effect !== "randomShop" || canRandom));
}
function drawPercent(st, item) {
  const total = drawPool(st).reduce((a, i) => a + Number(i.weight), 0);
  return total > 0 ? Math.round(Number(item.weight) / total * 1000) / 10 : 0;   // 소수 첫째자리까지
}

// ── 연타 방지 ────────────────────────────────────────────
// 인터넷이 느리면 학생이 [사기]를 여러 번 누르게 되고, 그 사이 요청이 모두 서버에 도착해
// 같은 주문이 여러 건 체결된다. 마지막 거래로부터 tradeCooldown 초가 지나지 않았으면 거절한다.
// (돈 계산 자체는 저장 단계의 버전 잠금으로 이미 보호되지만, 의도치 않은 중복 주문을 막는다)
const TRADE_TYPES = ["주식매수", "주식매도"];
const BANK_TYPES = ["적금", "적금해지", "대출", "대출상환", "기부"];
function lastActionAt(st, sid, types) {
  let last = "";
  for (const t of st.transactions)
    if (t.studentId === sid && types.indexOf(t.type) >= 0 && String(t.createdAt) > last) last = String(t.createdAt);
  return last;
}
function cooldownLeft(st, sid, types) {
  const cool = Number(st.settings.tradeCooldown) || 0;
  if (cool <= 0) return 0;
  const last = lastActionAt(st, sid, types);
  if (!last) return 0;
  const passed = (dtMs(kst().datetime) - dtMs(last)) / 1000;
  return passed >= cool ? 0 : Math.max(1, Math.ceil(cool - passed));
}

// ══════════ 은행: 적금 · 대출 · 기부 ══════════
// 적금 — 넣은 날부터 '이자 주기'가 한 번 채워질 때마다 복리로 이자가 붙는다.
//        해약 제한 기간(기본 10일) 안에 해약하면 이자 없이 원금만 돌려받는다.
function activeDeposits(st, sid) {
  return st.deposits.filter(d => d.studentId === sid && d.status === "예치중");
}
function depositInfo(st, dep) {
  const s = st.settings;
  const periodDays = Math.max(1, Number(s.savingsPeriodDays) || 7);
  const rate = Number(s.savingsRate) || 0;
  const lockDays = Math.max(0, Number(s.savingsLockDays) || 0);
  const amount = money(dep.amount);
  const elapsed = daysBetween(dep.createdAt, kst().datetime);
  const periods = Math.max(0, Math.floor(elapsed / periodDays));
  const value = money(amount * Math.pow(1 + rate / 100, periods));
  const locked = elapsed < lockDays;
  return {
    amount, periods, value, interest: money(value - amount), locked,
    matureAt: dtShift(dep.createdAt, lockDays),
    daysLeft: Math.max(0, Math.ceil(lockDays - elapsed)),
  };
}
function savingsPrincipal(st, sid) {
  return money(activeDeposits(st, sid).reduce((a, d) => a + money(d.amount), 0));
}
function savingsValue(st, sid) {
  return money(activeDeposits(st, sid).reduce((a, d) => a + depositInfo(st, d).value, 0));
}
// 주식 평가액
function stockValueOf(st, sid) {
  let sum = 0;
  for (const h of st.holdings) {
    if (h.studentId !== sid || Number(h.qty) <= 0) continue;
    const x = st.stocks.find(y => y.id === h.stockId);
    const price = x ? Math.round((Number(x.price) || 0) * 100) / 100 : 0;
    sum += money(price * Number(h.qty));
  }
  return money(sum);
}
// 남은 재산 = 현금 + 적금 현재 평가액 + 주식 현재 평가액 (기부금을 받을 학생을 정하는 기준)
function totalAssets(st, sid) {
  return money(getBalance(st, sid) + savingsValue(st, sid) + stockValueOf(st, sid));
}
// 대출 — 한 사람이 동시에 하나만. 한도는 주급(직업 수당)의 loanMultiplier 배.
function activeLoan(st, sid) {
  return st.loans.find(l => l.studentId === sid && l.status === "상환중") || null;
}
function weeklyPayOf(st, stu) {
  const job = getJob(st, stu.jobId);
  return job ? money(job.allowance) : 0;
}
function loanLimitOf(st, stu) {
  const mult = Number(st.settings.loanMultiplier) > 0 ? Number(st.settings.loanMultiplier) : 2;
  return money(weeklyPayOf(st, stu) * mult);
}
function loanInfo(st, loan) {
  const s = st.settings;
  const periodDays = Math.max(1, Number(s.loanPeriodDays) || 7);
  const rate = Number(s.loanRate) || 0;
  const principal = money(loan.principal);
  const nextAt = dtShift(loan.lastInterestAt, periodDays);
  return {
    id: loan.id, principal, original: money(loan.original),
    createdAt: loan.createdAt, nextInterestAt: nextAt,
    daysToInterest: Math.max(0, Math.ceil(daysBetween(kst().datetime, nextAt))),
    weekInterest: money(principal * rate / 100),
    interestPaid: money(loan.interestPaid),
  };
}
// 이자 자동 차감 — 접속할 때마다 검사해서, 일주일이 지날 때마다 잔액에서 빠져나간다.
// (서버가 그 시각에 꺼져 있어도 다음 접속 때 밀린 만큼 따라잡는다)
function accrueLoanInterest(st) {
  const s = st.settings;
  const periodDays = Math.max(1, Number(s.loanPeriodDays) || 7);
  const rate = Number(s.loanRate) || 0;
  const now = kst().datetime;
  let changed = false;
  for (const ln of st.loans) {
    if (ln.status !== "상환중") continue;
    let guard = 0;
    while (daysBetween(ln.lastInterestAt, now) >= periodDays && guard++ < 60) {
      ln.lastInterestAt = dtShift(ln.lastInterestAt, periodDays);
      const principal = money(ln.principal);
      const interest = money(principal * rate / 100);
      if (interest > 0) {
        addTx(st, ln.studentId, -interest, "대출이자", `대출 이자 (남은 원금 ${principal}의 ${rate}%)`);
        ln.interestPaid = money(money(ln.interestPaid) + interest);
      }
      changed = true;
    }
  }
  return changed;
}
// 기부 — 모인 금액이 목표를 넘으면 남은 재산이 가장 적은 학생에게 전액 전달한다.
function poorestStudent(st) {
  const rows = st.students.filter(s => s.active)
    .map(s => ({ s, total: totalAssets(st, s.id) }))
    .sort((a, b) => (a.total - b.total) || (a.s.number - b.s.number));
  return rows.length ? rows[0].s : null;
}
function grantDonation(st, reason) {
  const pool = money(st.donationPool);
  if (pool <= 0) return null;
  const target = poorestStudent(st);
  if (!target) return null;
  addTx(st, target.id, pool, "기부금", `우리 반 기부금 나눔${reason ? " (" + reason + ")" : ""}`);
  st.donationGrants.push({ id: nextId(st), studentId: target.id, amount: pool, createdAt: kst().datetime });
  st.donationPool = 0;
  return { studentId: target.id, amount: pool, to: `${target.number}번 ${target.nickname}` };
}
function settleDonations(st) {
  if (st.settings.donationEnabled === false) return null;
  const threshold = money(st.settings.donationThreshold) || 150;
  if (money(st.donationPool) < threshold) return null;
  return grantDonation(st, `모인 기부금 ${money(st.donationPool)} 달성`);
}
// 학생 화면에 보낼 은행 정보
function studentBank(st, stu) {
  const s = st.settings;
  const cash = getBalance(st, stu.id);
  const sav = savingsValue(st, stu.id);
  const stk = stockValueOf(st, stu.id);
  const ln = activeLoan(st, stu.id);
  const stuMap = new Map(st.students.map(x => [x.id, x]));
  return {
    enabled: s.bankEnabled !== false,
    assets: { cash, savings: sav, stock: stk, total: money(cash + sav + stk) },
    savings: {
      enabled: s.savingsEnabled !== false,
      max: money(s.savingsMax),
      rate: Number(s.savingsRate) || 0,
      periodDays: Math.max(1, Number(s.savingsPeriodDays) || 7),
      lockDays: Math.max(0, Number(s.savingsLockDays) || 0),
      principal: savingsPrincipal(st, stu.id),
      value: sav,
      deposits: activeDeposits(st, stu.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(d => ({ id: d.id, createdAt: d.createdAt, ...depositInfo(st, d) })),
    },
    loan: {
      enabled: s.loanEnabled !== false,
      rate: Number(s.loanRate) || 0,
      periodDays: Math.max(1, Number(s.loanPeriodDays) || 7),
      multiplier: Number(s.loanMultiplier) > 0 ? Number(s.loanMultiplier) : 2,
      weeklyPay: weeklyPayOf(st, stu),
      limit: loanLimitOf(st, stu),
      current: ln ? loanInfo(st, ln) : null,
    },
    donation: {
      enabled: s.donationEnabled !== false,
      threshold: money(s.donationThreshold) || 150,
      pool: money(st.donationPool),
      myTotal: money(st.donations.filter(x => x.studentId === stu.id).reduce((a, x) => a + Number(x.amount), 0)),
      recent: st.donationGrants.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5)
        .map(g => {
          const who = stuMap.get(g.studentId);
          return { number: who ? who.number : "", nickname: who ? who.nickname : "?", amount: g.amount, createdAt: g.createdAt };
        }),
    },
  };
}

// ── 주식 ──
function stockChange(x) {          // 직전 가격 대비 변동률(%)
  const h = x.history || [];
  if (h.length < 2) return 0;
  const prev = Number(h[h.length - 2]) || 0;
  if (prev <= 0) return 0;
  return Math.round((Number(x.price) - prev) / prev * 10000) / 100;
}
function stockDto(st, x) {
  const marketChange = (x.linkMode === "market" && x.lastMarketDate)
    ? Math.round((Number(x.lastMarketChange) || 0) * 100) / 100
    : stockChange(x);
  return { id: x.id, name: x.name, price: money(x.price), change: marketChange, history: (x.history || []).slice(-20) };
}
function teacherStockDto(st, x) {
  return { ...stockDto(st, x), active: x.active !== false,
    linkMode: x.linkMode === "market" ? "market" : "manual",
    symbol: String(x.symbol || ""), exchange: String(x.exchange || ""),
    lastMarketDate: x.lastMarketDate || null, lastMarketChange: Number(x.lastMarketChange) || 0,
    lastActualPrice: Number(x.lastActualPrice) || 0,
    lastActualPriceWon: Number(x.lastActualPriceWon) || 0,
    lastUsdKrwRate: Number(x.lastUsdKrwRate) || 0 };
}
function publicSettings(st) {
  // 교사 화면에 일반 설정을 보낼 때 API 비밀값/토큰은 절대 브라우저로 돌려보내지 않는다.
  const s = { ...st.settings };
  delete s.stockApiKey;
  delete s.kisAppKey;
  delete s.kisAppSecret;
  delete s.kisAccessToken;
  delete s.kisTokenExpiresAt;
  return s;
}
function stockSyncConfig(st) {
  const s = st.settings;
  return { autoSync: !!s.stockAutoSync,
    hasApiKey: !!String(s.stockApiKey || "").trim(),
    hasKisAppKey: !!String(s.kisAppKey || "").trim(),
    hasKisAppSecret: !!String(s.kisAppSecret || "").trim(),
    lastSyncAt: s.lastStockSyncAt || null, lastMessage: s.lastStockSyncMessage || "" };
}
function isKoreanStock(x) {
  const ex = String(x.exchange || "").trim().toUpperCase();
  const sym = String(x.symbol || "").trim();
  return ["KRX","KOSPI","KOSDAQ","SEOUL"].includes(ex) || (!ex && /^\d{6}$/.test(sym));
}
function hasProviderCredentials(st, x) {
  if (isKoreanStock(x)) return !!String(st.settings.kisAppKey || "").trim() && !!String(st.settings.kisAppSecret || "").trim();
  return !!String(st.settings.stockApiKey || "").trim();
}
function shouldAutoSyncStocks(st) {
  const now = kst(), weekday = kstWeekday(now.date);
  return !!st.settings.stockAutoSync &&
    weekday <= 5 && now.time >= "16:00" && st.settings.lastStockSyncAttemptDate !== now.date &&
    st.stocks.some(x => x.active !== false && x.linkMode === "market" && String(x.symbol || "").trim() && hasProviderCredentials(st, x));
}

async function getKisAccessToken(st) {
  const appKey = String(st.settings.kisAppKey || "").trim();
  const appSecret = String(st.settings.kisAppSecret || "").trim();
  if (!appKey || !appSecret) throw new Error("한국투자증권 App Key와 App Secret을 먼저 저장해 주세요.");

  const now = Date.now();
  const cached = String(st.settings.kisAccessToken || "").trim();
  const expiresAt = Number(st.settings.kisTokenExpiresAt) || 0;
  if (cached && expiresAt > now + 60 * 1000) return cached;

  const response = await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: appKey, appsecret: appSecret })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg1 || data.message || ("KIS 토큰 발급 오류 (" + response.status + ")"));
  }
  const expiresIn = Math.max(300, Number(data.expires_in) || 86400);
  st.settings.kisAccessToken = String(data.access_token);
  st.settings.kisTokenExpiresAt = now + expiresIn * 1000;
  return st.settings.kisAccessToken;
}

async function fetchKisMarketPrice(st, x) {
  const symbol = String(x.symbol || "").trim();
  if (!/^\d{6}$/.test(symbol)) throw new Error("한국 주식 종목코드는 6자리 숫자로 입력해 주세요.");
  const token = await getKisAccessToken(st);
  const u = new URL("https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-daily-price");
  u.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  u.searchParams.set("FID_INPUT_ISCD", symbol);
  u.searchParams.set("FID_PERIOD_DIV_CODE", "D");
  u.searchParams.set("FID_ORG_ADJ_PRC", "1");
  const response = await fetch(u.toString(), { headers: {
    "Accept": "application/json",
    "Content-Type": "application/json; charset=utf-8",
    "authorization": "Bearer " + token,
    "appkey": String(st.settings.kisAppKey || "").trim(),
    "appsecret": String(st.settings.kisAppSecret || "").trim(),
    "tr_id": "FHKST01010400"
  }});
  const data = await response.json();
  if (!response.ok || String(data.rt_cd) !== "0") {
    // 토큰 만료/무효 응답이면 다음 호출에서 새 토큰을 받도록 캐시를 비운다.
    if (String(data.msg_cd || "").includes("EGW00123") || response.status === 401) {
      st.settings.kisAccessToken = ""; st.settings.kisTokenExpiresAt = 0;
    }
    throw new Error(data.msg1 || data.message || ("KIS 시세 조회 오류 (" + response.status + ")"));
  }
  const rows = Array.isArray(data.output) ? data.output : [];
  const row = rows.find(r => Number(r.stck_clpr) > 0 && String(r.stck_bsop_date || "").length >= 8);
  if (!row) throw new Error("최근 국내주식 시세를 받지 못했습니다.");
  const ymd = String(row.stck_bsop_date);
  const actualPrice = Number(row.stck_clpr);
  const change = Number(row.prdy_ctrt);
  if (!(actualPrice > 0)) throw new Error("현재 주가 정보가 올바르지 않습니다.");
  return {
    date: ymd.slice(0,4) + "-" + ymd.slice(4,6) + "-" + ymd.slice(6,8),
    actualPrice,
    change: Number.isFinite(change) ? change : 0
  };
}

async function fetchTwelveMarketPrice(x, apiKey) {
  if (!apiKey) throw new Error("미국주식용 Twelve Data API 키를 먼저 저장해 주세요.");
  const u = new URL("https://api.twelvedata.com/time_series");
  u.searchParams.set("symbol", String(x.symbol).trim());
  if (String(x.exchange || "").trim()) u.searchParams.set("exchange", String(x.exchange).trim());
  u.searchParams.set("interval", "1day");
  u.searchParams.set("outputsize", "2");
  u.searchParams.set("order", "desc");
  u.searchParams.set("apikey", apiKey);
  const response = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
  const data = await response.json();
  if (!response.ok || data.status === "error") throw new Error(data.message || ("Twelve Data 시세 오류 (" + response.status + ")"));
  const values = Array.isArray(data.values) ? data.values : [];
  if (values.length < 1) throw new Error("최근 미국주식 시세를 받지 못했습니다.");
  const latest = Number(values[0].close);
  const previous = values.length >= 2 ? Number(values[1].close) : latest;
  if (!(latest > 0)) throw new Error("미국주식 가격 정보가 올바르지 않습니다.");
  return {
    date: String(values[0].datetime || "").slice(0, 10),
    actualPrice: latest,
    change: previous > 0 ? (latest - previous) / previous * 100 : 0
  };
}

async function fetchUsdKrwRate(apiKey) {
  if (!apiKey) throw new Error("환율 조회를 위해 Twelve Data API 키가 필요합니다.");
  const u = new URL("https://api.twelvedata.com/price");
  u.searchParams.set("symbol", "USD/KRW");
  u.searchParams.set("apikey", apiKey);
  const response = await fetch(u.toString(), { headers: { "Accept": "application/json" } });
  const data = await response.json();
  if (!response.ok || data.status === "error") throw new Error(data.message || ("USD/KRW 환율 조회 오류 (" + response.status + ")"));
  const rate = Number(data.price);
  if (!(rate > 0)) throw new Error("USD/KRW 환율 정보가 올바르지 않습니다.");
  return rate;
}

// KIS 국내주식 호출 제한 보호
// - 국내 종목은 한 번 조회할 때마다 1.2초 간격을 둡니다.
// - "초당 거래건수 초과" 계열 오류가 나면 잠시 기다렸다가 최대 2회 자동 재시도합니다.
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function isKisRateLimitError(err) {
  const m = String(err && err.message ? err.message : err || "").toLowerCase();
  return m.includes("초당 거래건수") || m.includes("거래건수를 초과") ||
         m.includes("rate limit") || m.includes("too many request") ||
         m.includes("too many requests") || m.includes("egw00201");
}

async function fetchKisMarketPriceWithRetry(st, x) {
  const retryWaits = [1500, 2500];
  let lastErr;
  for (let attempt = 0; attempt <= retryWaits.length; attempt++) {
    try {
      return await fetchKisMarketPrice(st, x);
    } catch (e) {
      lastErr = e;
      if (!isKisRateLimitError(e) || attempt >= retryWaits.length) throw e;
      await sleep(retryWaits[attempt]);
    }
  }
  throw lastErr;
}

async function fetchMarketPrice(st, x) {
  if (isKoreanStock(x)) return await fetchKisMarketPriceWithRetry(st, x);
  return await fetchTwelveMarketPrice(x, String(st.settings.stockApiKey || "").trim());
}

async function syncMarketStocks(st) {
  const linked = st.stocks.filter(x => x.active !== false && x.linkMode === "market" && String(x.symbol || "").trim());
  if (!linked.length) return { changed: false, count: 0, errors: ["실제 종목과 연결된 학급 주식이 없습니다."] };

  let count = 0, changed = false;
  const errors = [];
  let lastKisRequestAt = 0;

  // 미국주식이 있으면 환율은 한 번만 조회해서 모든 미국 종목에 공통 적용합니다.
  const hasUsStock = linked.some(x => !isKoreanStock(x));
  let usdKrwRate = null;
  if (hasUsStock) {
    try {
      usdKrwRate = await fetchUsdKrwRate(String(st.settings.stockApiKey || "").trim());
    } catch (e) {
      errors.push("원/달러 환율: " + (e && e.message ? e.message : e));
    }
  }

  for (const x of linked) {
    const korean = isKoreanStock(x);
    try {
      // 직전 국내주식 조회 시작 시점에서 최소 1.2초가 지나도록 기다립니다.
      if (korean && lastKisRequestAt) {
        const wait = Math.max(0, 1200 - (Date.now() - lastKisRequestAt));
        if (wait > 0) await sleep(wait);
      }
      if (korean) lastKisRequestAt = Date.now();

      const market = await fetchMarketPrice(st, x);
      const actualPrice = Number(market.actualPrice);
      if (!(actualPrice > 0)) throw new Error("실제 현재 주가가 올바르지 않습니다.");

      let actualPriceWon, convertedPrice;
      if (korean) {
        // 한국주식: 실제 원화 현재가 ÷ 10,000
        actualPriceWon = actualPrice;
        convertedPrice = actualPrice / 10000;
      } else {
        // 미국주식: 실제 달러 현재가 × USD/KRW 환율 ÷ 10,000
        if (!(Number(usdKrwRate) > 0)) throw new Error("USD/KRW 환율을 가져오지 못했습니다.");
        actualPriceWon = actualPrice * usdKrwRate;
        convertedPrice = actualPriceWon / 10000;
      }

      const oldPrice = Math.max(0.01, Math.round((Number(x.price) || 0.01) * 100) / 100);
      const newPrice = Math.max(0.01, Math.round(convertedPrice * 100) / 100);

      if (newPrice !== oldPrice) {
        x.price = newPrice;
        x.history = (x.history || []).concat(newPrice).slice(-30);
        changed = true;
      }

      // 등락률은 가격 계산에 사용하지 않고 화면 표시용 참고정보로만 저장합니다.
      x.lastMarketDate = market.date;
      x.lastMarketChange = Math.round(Number(market.change || 0) * 100) / 100;
      x.lastActualPrice = actualPrice;                    // 한국=원, 미국=달러
      x.lastActualPriceWon = Math.round(actualPriceWon * 100) / 100;
      x.lastUsdKrwRate = korean ? null : Math.round(Number(usdKrwRate) * 100) / 100;
      delete x.lastMarketApplied;                         // 이전 '등락률 적용값' 필드는 더 이상 사용하지 않음
      count++;
    } catch (e) {
      errors.push(x.name + ": " + (e && e.message ? e.message : e));
    } finally {
      if (korean) lastKisRequestAt = Date.now();
    }
  }

  const now = kst();
  st.settings.lastStockSyncAt = now.datetime;
  st.settings.lastStockSyncAttemptDate = now.date;
  st.settings.lastStockSyncMessage = count
    ? (count + "개 종목 현재가 반영 완료" + (usdKrwRate ? " · USD/KRW " + Number(usdKrwRate).toFixed(2) : "") + (errors.length ? " · 실패 " + errors.length + "개" : ""))
    : (errors[0] || "시세를 반영하지 못했습니다.");
  return { changed: true, count, errors };
}
function holdingOf(st, sid, stockId) {
  return st.holdings.find(h => h.studentId === sid && h.stockId === stockId) || null;
}
function myStocks(st, sid) {
  return st.holdings.filter(h => h.studentId === sid && Number(h.qty) > 0).map(h => {
    const x = st.stocks.find(s2 => s2.id === h.stockId);
    const price = x ? money(x.price) : 0;
    const value = money(price * Number(h.qty));
    const cost = money(Number(h.avgCost) * Number(h.qty));
    return {
      stockId: h.stockId, name: x ? x.name : "?", qty: Number(h.qty),
      avgCost: money(h.avgCost), price, value, profit: money(value - cost),
      change: x ? stockChange(x) : 0,
    };
  });
}
function payLimits(st) {
  const s = st.settings;
  return {
    perTx: money(s.payLimitPerTx) || 50,
    perDay: money(s.payLimitPerDay) || 100,
  };
}
function paidTodayByIssuer(st, issuerId) {
  const today = kst().date;
  let sum = 0;
  for (const t of st.transactions)
    if (t.type === "모둠지급" && t.issuedBy === issuerId && String(t.createdAt).slice(0, 10) === today) sum += Number(t.amount);
  return money(sum);
}
// 일급(기본급)은 출근 체크할 때 이미 즉시 지급된다.
// 주급으로 정산하는 대상은 '직업 수당'(한 주 정액)이며, 세금은 여기서 떼지 않는다
// (소득세는 매주 정해진 요일·시각에 그 주 수입 전체에 대해 따로 징수).
// 수당은 출근 당시 값을 얼려 두지 않고 지급 시점의 '현재 직업'으로 계산한다
// (교사가 출근 체크 뒤에 직업을 배정하거나 수당을 고쳐도 제대로 반영되도록).
function payrollRow(st, stu) {
  const recs = st.attendance.filter(r => r.studentId === stu.id && !r.paid);
  const job = getJob(st, stu.jobId);
  // 직업 수당은 '한 주에 얼마'인 정액이다. 출근 일수를 곱하지 않는다.
  const allow = job ? money(job.allowance) : 0;
  let base = 0, late = 0;
  for (const r of recs) {
    base += money(r.pay);  // 출근할 때 이미 받은 일급 합계 (참고용)
    if (r.status === "지각") late++;
  }
  const gross = allow;
  const tax = 0;   // 세금은 주급이 아니라 매주 소득세로 따로 징수
  return {
    studentId: stu.id, number: stu.number, nickname: stu.nickname,
    jobName: job ? job.name : "-",
    days: recs.length, late, base: money(base), allowance: allow,
    gross, tax, net: money(gross - tax),
  };
}
function addTx(st, sid, amount, type, memo, issuedBy) {
  const tx = {
    id: nextId(st), studentId: sid, amount: money(amount), type, memo: String(memo),
    createdAt: kst().datetime, issuedBy: issuedBy != null ? issuedBy : null,
  };
  st.transactions.push(tx);
  return tx;
}
function txRows(st) {
  const map = new Map(st.students.map(s => [s.id, s]));
  return st.transactions.map(t => {
    const s = map.get(t.studentId);
    return {
      id: t.id, createdAt: t.createdAt,
      number: s ? s.number : "", nickname: s ? s.nickname : "?",
      type: t.type, amount: t.amount, memo: t.memo,
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// ── 용량 관리: 오래된 기록 자동 정리 (CSV 백업이 원본 보관 역할) ──
function prune(st) {
  const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10); // 60일 전
  st.attendance = st.attendance.filter(r => !(r.paid && r.date < cutoff));
  st.purchases = st.purchases.filter(p => !(p.status !== "보유" && String(p.createdAt).slice(0, 10) < cutoff));
  // 은행: 끝난 적금·대출과 오래된 기부 기록만 정리한다 (진행 중인 것은 절대 지우지 않는다)
  st.deposits = st.deposits.filter(d => d.status === "예치중" || String(d.closedAt || d.createdAt).slice(0, 10) >= cutoff);
  st.loans = st.loans.filter(l => l.status === "상환중" || String(l.closedAt || l.createdAt).slice(0, 10) >= cutoff);
  st.donations = st.donations.filter(x => String(x.createdAt).slice(0, 10) >= cutoff);
  st.donationGrants = st.donationGrants.filter(x => String(x.createdAt).slice(0, 10) >= cutoff);
  // 명세서: 60일 지난 것은 정리하되, 학생별 최신 1장은 기간과 무관하게 보존
  const latest = new Map();
  for (const p of st.payslips) {
    const cur = latest.get(p.studentId);
    if (!cur || p.paidAt > cur.paidAt) latest.set(p.studentId, p);
  }
  const keep = new Set([...latest.values()].map(p => p.id));
  st.payslips = st.payslips.filter(p => keep.has(p.id) || String(p.paidAt).slice(0, 10) >= cutoff);
  if (st.transactions.length > 3000) st.transactions = st.transactions.slice(-3000);
}

// ── API 처리 (state 를 바꾸면 mutated:true 반환) ──
function fail(msg, status = 400) { return { status, body: { ok: false, error: msg } }; }
function ok(obj) { return { status: 200, body: Object.assign({ ok: true }, obj) }; }

function handleApi(st, path, method, d) {
  // ══════════ 로그인 ══════════
  if (path === "/api/login" && method === "POST") {
    if (d.role === "teacher") {
      if (testTeacher(st, { id: d.id, pw: d.pw })) return ok({});
      return fail("아이디 또는 비밀번호가 맞지 않습니다.", 401);
    }
    const stu = authStudent(st, { classCode: d.classCode, number: d.number, pin: d.pin });
    if (stu) return ok({ nickname: stu.nickname, number: stu.number });
    return fail("학급 코드, 번호, PIN을 다시 확인하세요.", 401);
  }

  // ══════════ 학생 API ══════════
  if (path === "/api/student/home" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const today = kst().date;
    const att = st.attendance.find(r => r.studentId === stu.id && r.date === today) || null;
    const recent = st.transactions.filter(t => t.studentId === stu.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
    const slips = st.payslips.filter(p => p.studentId === stu.id)
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
    const job = getJob(st, stu.jobId);
    const itemMap = new Map(st.shopItems.map(i => [i.id, i]));
    const myPurchases = st.purchases
      .filter(p => p.studentId === stu.id && p.status !== "취소")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(p => ({ id: p.id, name: itemMap.has(p.itemId) ? itemMap.get(p.itemId).name : "?", status: p.status, createdAt: p.createdAt }));

    // ── 모둠 회계사: 지급 권한 정보 ──
    const payAuthority = !!(job && job.canPay);
    const limits = payLimits(st);
    let groupmates = [];
    let paidToday = 0;
    if (payAuthority) {
      // 자기 자신도 포함한다 (회계사가 스스로에게도 지급할 수 있음)
      groupmates = st.students
        .filter(s => s.active && s.group && stu.group && s.group === stu.group)
        .sort((a, b) => a.number - b.number)
        .map(s => ({ id: s.id, number: s.number, nickname: s.nickname, isMe: s.id === stu.id }));
      paidToday = paidTodayByIssuer(st, stu.id);
    }
    // ── 마트 직원: 쿠폰 사용 처리 권한 정보 ──
    const couponAuthority = !!(job && job.canUseCoupon);
    let pendingCoupons = [];
    if (couponAuthority) {
      const stuMap = new Map(st.students.map(s => [s.id, s]));
      pendingCoupons = st.purchases
        .filter(p => p.status === "보유")
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
        .map(p => {
          const s2 = stuMap.get(p.studentId);
          const it2 = itemMap.get(p.itemId);
          return {
            id: p.id, itemName: it2 ? it2.name : "?",
            number: s2 ? s2.number : "", nickname: s2 ? s2.nickname : "?",
            createdAt: p.createdAt,
          };
        });
    }

    const classmates = st.students.filter(s => s.active).sort((a, b) => a.number - b.number).map(s => {
      const j2 = getJob(st, s.jobId);
      return { number: s.number, nickname: s.nickname, jobName: j2 ? j2.name : "미배정", group: s.group != null ? s.group : null };
    });
    return ok({
      nickname: stu.nickname, number: stu.number,
      jobName: job ? job.name : "미배정",
      currencyName: st.settings.currencyName,
      deadline: st.settings.deadline,
      balance: getBalance(st, stu.id),
      recent,
      today: att ? { checked: true, status: att.status, time: att.time } : { checked: false },
      preview: payrollRow(st, stu),
      lastPayslip: slips.length ? slips[0] : null,
      items: st.shopItems.filter(i => i.active && i.kind !== "draw").sort((a, b) => a.price - b.price),
      myPurchases,
      luckyEnabled: st.settings.luckyEnabled !== false,
      luckyDoneToday: st.transactions.some(t =>
        t.type === "행운" && t.studentId === stu.id && String(t.createdAt).slice(0, 10) === today),
      drawEnabled: st.settings.drawEnabled !== false,
      drawCost: money(st.settings.drawCost),
      drawCardCount: Math.max(2, Math.min(6, Number(st.settings.drawCardCount) || 3)),
      // 상품 목록과 확률은 학생에게 보내지 않는다 (뽑기 전에 알 수 없도록)
      drawAvailable: drawPool(st).length > 0,
      stockEnabled: st.settings.stockEnabled !== false,
      tradeCooldown: Number(st.settings.tradeCooldown) || 0,
      tradeWait: cooldownLeft(st, stu.id, TRADE_TYPES),
      stocks: st.stocks.filter(x => x.active).map(x => stockDto(st, x)),
      myStocks: myStocks(st, stu.id),
      // 은행 (적금 · 대출 · 기부)
      bank: studentBank(st, stu),
      // 안 쓴 50% 할인권 장수
      discountTickets: (() => {
        const ids = new Set(st.shopItems.filter(i => i.effect === "discount50").map(i => i.id));
        return st.purchases.filter(p => p.studentId === stu.id && p.status === "보유" && ids.has(p.itemId)).length;
      })(),
      payAuthority, groupmates,
      payLimitPerTx: limits.perTx, payLimitPerDay: limits.perDay, paidToday,
      couponAuthority, pendingCoupons,
      group: stu.group != null ? stu.group : null,
      classmates,
      // 다음 소득세 징수 예고 (금요일 9시)
      weekIncome: incomeBetween(st, stu.id, st.settings.lastTaxAt || taxCutoff(st), null),
      weekTax: Math.round(incomeBetween(st, stu.id, st.settings.lastTaxAt || taxCutoff(st), null) * (Number(st.settings.taxRate) || 0) / 100),
      taxRate: Number(st.settings.taxRate) || 0,
      taxWeekday: Number(st.settings.taxWeekday) || 5,
      taxTime: st.settings.taxTime || "09:00",
    });
  }
  if (path === "/api/student/checkin" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const now = kst();
    if (st.attendance.some(r => r.studentId === stu.id && r.date === now.date))
      return fail("오늘은 이미 출근 체크를 했어요!");
    const set = st.settings;
    const status = now.time > String(set.deadline) ? "지각" : "정상";
    const pay = money(status === "지각" ? set.latePay : set.basePay);
    const job = getJob(st, stu.jobId);
    const allow = job ? money(job.allowance) : 0;
    st.attendance.push({ id: nextId(st), studentId: stu.id, date: now.date, time: now.time, status, pay, allowance: allow, paid: false, paidAt: null });
    // 일급은 출근하는 즉시 지급한다 (직업 수당은 주급 때 따로 정산)
    addTx(st, stu.id, pay, "일급", `출근 일급 (${status})`);
    return { mutated: true, ...ok({ status, time: now.time, pay, allowance: allow, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/buy" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const item = st.shopItems.find(i => i.id === Number(d.itemId) && i.active && i.kind !== "draw");
    if (!item) return fail("판매 중인 상품이 아닙니다.");
    if (Number(item.stock) <= 0) return fail("품절되었습니다.");
    const wait = cooldownLeft(st, stu.id, ["구매"]);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    // 50% 할인권을 쓰겠다고 하면, 안 쓴 할인권 한 장을 찾아 값을 반으로 깎는다
    let ticket = null;
    if (d.useDiscount) {
      const ids = new Set(st.shopItems.filter(i => i.effect === "discount50").map(i => i.id));
      ticket = st.purchases.find(p => p.studentId === stu.id && p.status === "보유" && ids.has(p.itemId));
      if (!ticket) return fail("쓸 수 있는 50% 할인권이 없어요.");
    }
    const price = ticket ? money(Number(item.price) / 2) : money(item.price);
    if (getBalance(st, stu.id) < price) return fail("잔액이 부족합니다.");
    addTx(st, stu.id, -price, "구매",
      ticket ? `쿠폰 구매(50% 할인): ${item.name}` : "쿠폰 구매: " + item.name);
    if (ticket) { ticket.status = "사용완료"; ticket.usedAt = kst().datetime; }
    item.stock = Number(item.stock) - 1;
    st.purchases.push({ id: nextId(st), studentId: stu.id, itemId: item.id, status: "보유", createdAt: kst().datetime, usedAt: null });
    return { mutated: true, ...ok({ balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/pay" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const job = getJob(st, stu.jobId);
    if (!job || !job.canPay) return fail("지급 권한이 없습니다.");
    // 자기 자신도 대상이 될 수 있다 (같은 모둠이기만 하면 됨)
    const target = st.students.find(s => s.id === Number(d.targetId) && s.active && stu.group && s.group === stu.group);
    const amount = money(d.amount);
    const memo = String(d.memo || "").trim() || "칭찬 지급";   // 사유는 선택 사항
    const limits = payLimits(st);
    if (!target) return fail("같은 모둠의 학생만 선택할 수 있어요.");
    if (amount <= 0) return fail("지급 금액은 1 이상이어야 해요.");
    if (amount > limits.perTx) return fail(`1회 지급은 최대 ${limits.perTx}까지 가능해요.`);
    const paidToday = paidTodayByIssuer(st, stu.id);
    if (money(paidToday + amount) > limits.perDay) return fail(`오늘 지급 가능한 금액을 모두 썼어요. (하루 한도 ${limits.perDay})`);
    const who = target.id === stu.id ? "스스로 지급" : `${stu.number}번 ${stu.nickname} 지급`;
    addTx(st, target.id, amount, "모둠지급", `(${who}) ${memo}`, stu.id);
    return { mutated: true, ...ok({ paidToday: money(paidToday + amount) }) };
  }
  if (path === "/api/student/useCoupon" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const job = getJob(st, stu.jobId);
    if (!job || !job.canUseCoupon) return fail("쿠폰 처리 권한이 없습니다.");
    const p = st.purchases.find(x => x.id === Number(d.purchaseId));
    if (!p || p.status !== "보유") return fail("처리할 수 없는 쿠폰입니다.");
    p.status = "사용완료"; p.usedAt = kst().datetime;
    return { mutated: true, ...ok({}) };
  }

  // ══════════ 학생 은행 API (적금 · 대출 · 기부) ══════════
  if (path === "/api/student/bank/deposit" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const s = st.settings;
    if (s.bankEnabled === false || s.savingsEnabled === false) return fail("지금은 적금을 넣을 수 없어요.");
    const wait = cooldownLeft(st, stu.id, BANK_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    const amount = money(d.amount);
    if (amount < 0.01) return fail("넣을 금액을 적어 주세요.");
    if (getBalance(st, stu.id) < amount) return fail("잔액이 부족해요.");
    const max = money(s.savingsMax);
    const have = savingsPrincipal(st, stu.id);
    if (money(have + amount) > max) return fail(`적금은 모두 합쳐 ${max}까지만 넣을 수 있어요. (지금 더 넣을 수 있는 금액 ${Math.max(0, max - have)})`);
    const rate = Number(s.savingsRate) || 0;
    const periodDays = Math.max(1, Number(s.savingsPeriodDays) || 7);
    addTx(st, stu.id, -amount, "적금", `적금 예치 (${periodDays}일마다 ${rate}% 복리)`);
    st.deposits.push({
      id: nextId(st), studentId: stu.id, amount, createdAt: kst().datetime,
      status: "예치중", closedAt: null, received: 0, interest: 0,
    });
    return { mutated: true, ...ok({ balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/bank/withdraw" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const dep = st.deposits.find(x => x.id === Number(d.depositId) && x.studentId === stu.id && x.status === "예치중");
    if (!dep) return fail("찾을 수 있는 적금이 없어요.");
    const wait = cooldownLeft(st, stu.id, BANK_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    const info = depositInfo(st, dep);
    // 해약 제한 기간 안에는 '부득이한 해약'만 가능하고, 이자 없이 원금만 돌려받는다
    if (info.locked && !d.early) return fail(`아직 ${info.daysLeft}일 남았어요. 그래도 해약하려면 [부득이하게 해약]을 눌러 주세요.`);
    const received = info.locked ? info.amount : info.value;
    const interest = money(received - info.amount);
    addTx(st, stu.id, received, "적금해지",
      info.locked ? `적금 중도 해약 (원금만 ${info.amount})` : `적금 찾기 (원금 ${info.amount} + 이자 ${interest})`);
    dep.status = info.locked ? "중도해약" : "만기해지";
    dep.closedAt = kst().datetime;
    dep.received = received;
    dep.interest = interest;
    return { mutated: true, ...ok({ received, interest, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/bank/loan" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const s = st.settings;
    if (s.bankEnabled === false || s.loanEnabled === false) return fail("지금은 대출을 받을 수 없어요.");
    if (activeLoan(st, stu.id)) return fail("이미 받은 대출이 있어요. 다 갚아야 다시 빌릴 수 있어요.");
    const wait = cooldownLeft(st, stu.id, BANK_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    const amount = money(d.amount);
    const limit = loanLimitOf(st, stu);
    if (limit <= 0) return fail("아직 직업(주급)이 없어서 빌릴 수 없어요. 선생님께 여쭤보세요.");
    if (amount < 0.01) return fail("빌릴 금액을 적어 주세요.");
    if (amount > limit) return fail(`빌릴 수 있는 최대 금액은 ${limit}이에요. (주급 ${weeklyPayOf(st, stu)}의 ${Number(s.loanMultiplier) || 2}배)`);
    const now = kst().datetime;
    const rate = Number(s.loanRate) || 0;
    const periodDays = Math.max(1, Number(s.loanPeriodDays) || 7);
    addTx(st, stu.id, amount, "대출", `대출 (${periodDays}일마다 이자 ${rate}%)`);
    st.loans.push({
      id: nextId(st), studentId: stu.id, principal: amount, original: amount,
      createdAt: now, lastInterestAt: now, interestPaid: 0, status: "상환중", closedAt: null,
    });
    return { mutated: true, ...ok({ balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/bank/repay" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const ln = activeLoan(st, stu.id);
    if (!ln) return fail("갚을 대출이 없어요.");
    const wait = cooldownLeft(st, stu.id, BANK_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    const amount = money(d.amount);
    if (amount < 0.01) return fail("갚을 금액을 적어 주세요.");
    if (amount > money(ln.principal)) return fail(`남은 원금은 ${money(ln.principal)}이에요.`);
    if (getBalance(st, stu.id) < amount) return fail("잔액이 부족해요.");
    ln.principal = money(money(ln.principal) - amount);
    const done = ln.principal <= 0;
    addTx(st, stu.id, -amount, "대출상환", done ? "대출 상환 (모두 갚음)" : `대출 상환 (남은 원금 ${ln.principal})`);
    if (done) { ln.principal = 0; ln.status = "완납"; ln.closedAt = kst().datetime; }
    return { mutated: true, ...ok({ cleared: done, principal: ln.principal, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/bank/donate" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const s = st.settings;
    if (s.bankEnabled === false || s.donationEnabled === false) return fail("지금은 기부를 받지 않아요.");
    const wait = cooldownLeft(st, stu.id, BANK_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요.`);
    const amount = money(d.amount);
    if (amount < 0.01) return fail("기부할 금액을 적어 주세요.");
    if (getBalance(st, stu.id) < amount) return fail("잔액이 부족해요.");
    addTx(st, stu.id, -amount, "기부", "우리 반 기부");
    st.donations.push({ id: nextId(st), studentId: stu.id, amount, createdAt: kst().datetime });
    st.donationPool = money(money(st.donationPool) + amount);
    // 목표 금액을 넘으면 그 자리에서 가장 재산이 적은 학생에게 전액 전달
    const grant = settleDonations(st);
    return { mutated: true, ...ok({
      pool: money(st.donationPool),
      granted: !!grant, grantTo: grant ? grant.to : null, grantAmount: grant ? grant.amount : 0,
      balance: getBalance(st, stu.id),
    }) };
  }
  if (path === "/api/student/stock/buy" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    if (st.settings.stockEnabled === false) return fail("지금은 주식을 사고팔 수 없어요.");
    const wait = cooldownLeft(st, stu.id, TRADE_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요. (주식은 ${Number(st.settings.tradeCooldown)}초에 한 번만 사고팔 수 있어요)`);
    const x = st.stocks.find(s2 => s2.id === Number(d.stockId) && s2.active);
    if (!x) return fail("거래할 수 있는 주식이 아니에요.");
    const qty = Math.floor(Number(d.qty) || 0);
    if (qty < 1) return fail("몇 주를 살지 1 이상으로 적어 주세요.");
    const price = money(x.price);
    const cost = money(price * qty);
    if (cost <= 0) return fail("살 수 없는 가격이에요.");
    if (getBalance(st, stu.id) < cost) return fail("잔액이 부족해요.");
    addTx(st, stu.id, -cost, "주식매수", `${x.name} ${qty}주 매수 (주당 ${price.toFixed(2)}, 결제 ${cost})`);
    let h = holdingOf(st, stu.id, x.id);
    if (!h) { h = { id: nextId(st), studentId: stu.id, stockId: x.id, qty: 0, avgCost: 0 }; st.holdings.push(h); }
    const total = Number(h.avgCost) * Number(h.qty) + cost;
    h.qty = Number(h.qty) + qty;
    h.avgCost = total / h.qty;   // 평균 매입가는 계산 정확도를 위해 반올림하지 않는다
    return { mutated: true, ...ok({ qty: h.qty, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/stock/sell" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    if (st.settings.stockEnabled === false) return fail("지금은 주식을 사고팔 수 없어요.");
    const wait = cooldownLeft(st, stu.id, TRADE_TYPES);
    if (wait > 0) return fail(`너무 빨라요! ${wait}초 뒤에 다시 눌러 주세요. (주식은 ${Number(st.settings.tradeCooldown)}초에 한 번만 사고팔 수 있어요)`);
    const x = st.stocks.find(s2 => s2.id === Number(d.stockId));
    if (!x) return fail("없는 주식이에요.");
    const h = holdingOf(st, stu.id, x.id);
    const qty = Math.floor(Number(d.qty) || 0);
    if (qty < 1) return fail("몇 주를 팔지 1 이상으로 적어 주세요.");
    if (!h || Number(h.qty) < qty) return fail("가지고 있는 주식이 모자라요.");
    const price = money(x.price);
    const gain = money(price * qty);
    addTx(st, stu.id, gain, "주식매도", `${x.name} ${qty}주 매도 (주당 ${price.toFixed(2)}, 정산 ${gain})`);
    h.qty = Number(h.qty) - qty;
    if (h.qty === 0) st.holdings = st.holdings.filter(y => y !== h);
    return { mutated: true, ...ok({ qty: h.qty, balance: getBalance(st, stu.id) }) };
  }
  // 행운 버튼 — 정해진 시각 사이에 누르면 보너스. 그 밖에는 아무 일도 일어나지 않는다.
  if (path === "/api/student/lucky" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const s = st.settings;
    if (s.luckyEnabled === false) return fail("지금은 행운 버튼을 쓰지 않는 기간이에요.");
    const now = kst();
    // 하루 한 번만 (열린 시간 동안 계속 눌러 받는 것을 막는다)
    const already = st.transactions.some(t =>
      t.type === "행운" && t.studentId === stu.id && String(t.createdAt).slice(0, 10) === now.date);
    if (already) return ok({ won: false, reason: "already" });
    if (!(now.time >= String(s.luckyStart) && now.time <= String(s.luckyEnd)))
      return ok({ won: false, reason: "time" });
    const reward = money(s.luckyReward);
    if (reward <= 0) return ok({ won: false, reason: "time" });
    addTx(st, stu.id, reward, "행운", `행운 버튼 당첨 (${now.time})`);
    return { mutated: true, ...ok({ won: true, reward, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/draw" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    if (st.settings.drawEnabled === false) return fail("지금은 행운 뽑기를 하지 않는 기간이에요.");
    const pool = drawPool(st);
    if (!pool.length) return fail("아직 행운 뽑기 상품이 없어요. 선생님께 말씀드리세요.");
    const cost = money(st.settings.drawCost);
    if (cost > 0 && getBalance(st, stu.id) < cost) return fail(`행운 뽑기를 하려면 ${cost}이 필요해요.`);
    // 가중치 뽑기
    const total = pool.reduce((a, i) => a + Number(i.weight), 0);
    let r = Math.random() * total;
    let won = pool[pool.length - 1];
    for (const i of pool) { r -= Number(i.weight); if (r <= 0) { won = i; break; } }
    if (cost > 0) addTx(st, stu.id, -cost, "뽑기", `행운 뽑기 → ${won.name}`);
    const effect = won.effect || "";
    let bonusName = null;
    if (effect === "randomShop") {
      // 상점 쿠폰 하나를 무작위로 바로 지급 (뽑기권 자체는 보유 쿠폰에 남기지 않는다)
      const avail = shopStock(st);
      const pick = avail[Math.floor(Math.random() * avail.length)];
      pick.stock = Number(pick.stock) - 1;
      st.purchases.push({ id: nextId(st), studentId: stu.id, itemId: pick.id, status: "보유", createdAt: kst().datetime, usedAt: null });
      bonusName = pick.name;
    } else {
      // 일반 쿠폰과 50% 할인권은 보유 쿠폰으로 들어간다
      st.purchases.push({ id: nextId(st), studentId: stu.id, itemId: won.id, status: "보유", createdAt: kst().datetime, usedAt: null });
    }
    // 당첨 상품 이름만 알려 준다. 확률과 다른 상품 목록은 보내지 않는다
    // (뽑기 전에도, 뽑은 뒤에도 학생이 전체 구성을 알 수 없도록)
    const cards = Math.max(2, Math.min(6, Number(st.settings.drawCardCount) || 3));
    return { mutated: true, ...ok({ name: won.name, effect, bonusName, cardCount: cards, balance: getBalance(st, stu.id) }) };
  }
  if (path === "/api/student/setNickname" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const name = String(d.nickname || "").trim();
    if (!name) return fail("별명을 입력해 주세요.");
    if (name.length > 10) return fail("별명은 10글자까지 쓸 수 있어요.");
    if (st.students.some(s => s.id !== stu.id && s.active && String(s.nickname).trim() === name))
      return fail("이미 같은 별명을 쓰는 친구가 있어요. 다른 별명을 지어 보세요.");
    stu.nickname = name;
    return { mutated: true, ...ok({ nickname: name }) };
  }
  if (path === "/api/student/setGroup" && method === "POST") {
    const stu = authStudent(st, d.auth);
    if (!stu) return fail("로그인이 필요합니다.", 401);
    const g = Number(d.group);
    if (!(g >= 1 && g <= 6)) return fail("1~6 중에서 선택해 주세요.");
    stu.group = g;
    return { mutated: true, ...ok({ group: g }) };
  }

  // ══════════ 교사 API ══════════
  if (path.startsWith("/api/teacher/") && method === "POST" && !testTeacher(st, d.auth))
    return fail("교사 로그인이 필요합니다.", 401);

  if (path === "/api/teacher/overview" && method === "POST") {
    const today = kst().date;
    const active = st.students.filter(s => s.active);
    const todayCount = st.attendance.filter(r => r.date === today).length;
    const byDate = {};
    for (const t of st.transactions) {
      const dt = String(t.createdAt).slice(0, 10);
      byDate[dt] = (byDate[dt] || 0) + Number(t.amount);
    }
    let cum = 0;
    const circulation = Object.keys(byDate).sort().map(k => ({ date: k, total: (cum += byDate[k]) }));
    const byWeek = {};
    for (const t of st.transactions) if (t.type === "구매") {
      const wk = weekStart(t.createdAt);
      byWeek[wk] = (byWeek[wk] || 0) + Math.abs(Number(t.amount));
    }
    const weeklySpend = Object.keys(byWeek).sort().map(k => ({ week: k, total: byWeek[k] }));
    let totalBalance = 0;
    for (const s of active) totalBalance += getBalance(st, s.id);
    totalBalance = money(totalBalance);
    const avgBalance = active.length ? money(totalBalance / active.length) : 0;
    return ok({
      todayCount, totalStudents: active.length,
      totalBalance, avgBalance,
      pendingCoupons: st.purchases.filter(p => p.status === "보유").length,
      circulation, weeklySpend,
      currencyName: st.settings.currencyName,
      recentTx: txRows(st).slice(0, 20),
    });
  }
  if (path === "/api/teacher/students" && method === "POST") {
    const rows = st.students.slice().sort((a, b) => a.number - b.number).map(s => {
      const job = getJob(st, s.jobId);
      return {
        id: s.id, number: s.number, nickname: s.nickname, pin: s.pin,
        jobId: s.jobId, jobName: job ? job.name : "미배정",
        group: s.group != null ? s.group : null,
        active: s.active, balance: getBalance(st, s.id),
      };
    });
    return ok({ students: rows, jobs: st.jobs });
  }
  if (path === "/api/teacher/students/save" && method === "POST") {
    for (const row of (d.students || [])) {
      const num = Number(row.number);
      if (!(num >= 1) || !/^\d{4}$/.test(String(row.pin))) continue;
      const grp = row.group ? Number(row.group) : null;
      const ex = st.students.find(s => Number(s.number) === num);
      if (ex) {
        ex.nickname = String(row.nickname); ex.pin = String(row.pin);
        ex.jobId = row.jobId ? Number(row.jobId) : null;
        ex.group = grp;
        ex.active = !!row.active;
      } else {
        st.students.push({ id: nextId(st), number: num, nickname: String(row.nickname), pin: String(row.pin), jobId: row.jobId ? Number(row.jobId) : null, group: grp, active: true });
      }
    }
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/jobs/save" && method === "POST") {
    st.jobs = (d.jobs || []).map(j => ({
      id: j.id ? Number(j.id) : nextId(st),
      name: String(j.name), tier: String(j.tier), allowance: money(j.allowance),
      canPay: !!j.canPay, canUseCoupon: !!j.canUseCoupon,
    }));
    return { mutated: true, ...ok({ jobs: st.jobs }) };
  }
  if (path === "/api/teacher/adjust" && method === "POST") {
    if (!d.studentIds || !d.studentIds.length) return fail("학생을 선택하세요.");
    const amount = money(d.amount);
    if (!amount) return fail("0이 아닌 금액을 입력하세요.");
    // 사유는 선택 사항 — 비워 두면 기본 문구를 남긴다
    const memo = String(d.memo || "").trim() || (amount > 0 ? "선생님 지급" : "선생님 차감");
    for (const sid of d.studentIds) addTx(st, Number(sid), amount, "수동", memo);
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/payroll/preview" && method === "POST") {
    const rows = st.students.filter(s => s.active).sort((a, b) => a.number - b.number).map(s => payrollRow(st, s));
    return ok({ rows, taxRate: st.settings.taxRate });
  }
  if (path === "/api/teacher/payroll/pay" && method === "POST") {
    let paidCount = 0, totalNet = 0;
    const now = kst().datetime;
    // studentIds 를 주면 그 학생들에게만 지급 (안 주면 전원)
    const only = Array.isArray(d.studentIds) && d.studentIds.length ? new Set(d.studentIds.map(Number)) : null;
    for (const s of st.students.filter(x => x.active)) {
      if (only && !only.has(s.id)) continue;
      const row = payrollRow(st, s);
      // 출근 기록이 없어도 교사가 직접 고르면 지급한다 (수당은 정액이라 일수와 무관).
      // 다만 아무도 고르지 않은 '전원 지급'일 때는 출근한 학생만 대상으로 한다.
      if (row.days === 0 && !only) continue;
      if (row.net === 0) continue;   // 직업이 없으면 줄 수당이 없음
      addTx(st, s.id, row.net, "주급",
        row.days > 0 ? `주급 수당 (${row.jobName}, 출근 ${row.days}일)` : `주급 수당 (${row.jobName}, 출근 기록 없음)`);
      st.payslips.push({
        id: nextId(st), studentId: s.id, paidAt: now,
        days: row.days, late: row.late, base: row.base, allowance: row.allowance,
        gross: row.gross, tax: row.tax, net: row.net, taxRate: st.settings.taxRate,
      });
      for (const r of st.attendance) if (r.studentId === s.id && !r.paid) { r.paid = true; r.paidAt = now; }
      paidCount++; totalNet += row.net;
    }
    return { mutated: true, ...ok({ paidCount, totalNet }) };
  }
  if (path === "/api/teacher/payroll/undo" && method === "POST") {
    if (!st.payslips.length) return fail("취소할 주급 지급 기록이 없습니다.");
    const lastAt = st.payslips.map(p => p.paidAt).sort().pop();
    const batch = st.payslips.filter(p => p.paidAt === lastAt);
    // 장부는 지우지 않고 되돌리기 거래를 남긴다 (환불과 같은 방식)
    for (const p of batch) if (Number(p.net) !== 0) addTx(st, p.studentId, -Number(p.net), "주급취소", `주급 지급 취소 (${String(lastAt).slice(0, 16)})`);
    // 출근 기록을 다시 '미지급'으로 되돌려 재지급할 수 있게 한다
    let restored = st.attendance.filter(r => r.paid && r.paidAt === lastAt);
    if (!restored.length) restored = st.attendance.filter(r => r.paid && !r.paidAt); // 지급 시각이 없던 옛 기록 호환
    for (const r of restored) { r.paid = false; delete r.paidAt; }
    st.payslips = st.payslips.filter(p => p.paidAt !== lastAt);
    return { mutated: true, ...ok({ count: batch.length, restored: restored.length }) };
  }
  if (path === "/api/teacher/transactions" && method === "POST") {
    const rows = txRows(st);
    const limit = Number(d.limit);   // 0 이나 없으면 전체
    return ok({ rows: limit > 0 ? rows.slice(0, limit) : rows, total: rows.length });
  }
  // 오래된 거래 정리 — 잔액이 바뀌지 않도록 학생별 '이월' 거래 한 줄로 합쳐서 남긴다
  if (path === "/api/teacher/transactions/purge" && method === "POST") {
    const days = Number(d.days);
    if (!(days > 0)) return fail("정리 기준(일)을 지정하세요.");
    const cutoff = kstDaysAgo(days);
    const olds = st.transactions.filter(t => String(t.createdAt) < cutoff);
    if (!olds.length) return fail(`${days}일 이전 거래 내역이 없습니다.`);
    const carry = new Map();
    for (const t of olds) carry.set(t.studentId, (carry.get(t.studentId) || 0) + Number(t.amount));
    st.transactions = st.transactions.filter(t => String(t.createdAt) >= cutoff);
    let carried = 0;
    for (const [sid, amt] of carry) {
      if (amt === 0) continue;
      st.transactions.push({
        id: nextId(st), studentId: sid, amount: amt, type: "이월",
        memo: `${cutoff.slice(0, 10)} 이전 내역 정리 (이월 잔액)`, createdAt: cutoff, issuedBy: null,
      });
      carried++;
    }
    return { mutated: true, ...ok({ removed: olds.length, carried }) };
  }
  if (path === "/api/teacher/taxes" && method === "POST") {
    const stuMap = new Map(st.students.map(s => [s.id, s]));
    const txs = st.transactions.filter(t => t.type === "세금");
    const history = txs.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 200).map(t => {
      const s = stuMap.get(t.studentId);
      return {
        createdAt: t.createdAt, amount: t.amount, memo: t.memo,
        number: s ? s.number : "", nickname: s ? s.nickname : "?",
      };
    });
    const by = new Map();
    for (const t of txs) by.set(t.studentId, (by.get(t.studentId) || 0) + Math.abs(Number(t.amount)));
    let grandTotal = 0;
    const totals = st.students.filter(s => s.active).sort((a, b) => a.number - b.number).map(s => {
      const total = by.get(s.id) || 0;
      grandTotal += total;
      return { number: s.number, nickname: s.nickname, total };
    });
    return ok({
      history, totals, grandTotal,
      taxRate: Number(st.settings.taxRate) || 0,
      taxWeekday: Number(st.settings.taxWeekday) || 5,
      taxTime: st.settings.taxTime || "09:00",
      lastTaxAt: st.settings.lastTaxAt || null,
    });
  }

  // ══════════ 교사 은행 API ══════════
  if (path === "/api/teacher/bank" && method === "POST") {
    const s = st.settings;
    const stuMap = new Map(st.students.map(x => [x.id, x]));
    const who = sid => {
      const x = stuMap.get(sid);
      return { number: x ? x.number : "", nickname: x ? x.nickname : "?" };
    };
    const deposits = st.deposits.filter(x => x.status === "예치중")
      .map(x => ({ id: x.id, createdAt: x.createdAt, ...who(x.studentId), ...depositInfo(st, x) }))
      .sort((a, b) => (a.number - b.number) || (a.createdAt < b.createdAt ? -1 : 1));
    const loans = st.loans.filter(x => x.status === "상환중")
      .map(x => ({ ...loanInfo(st, x), ...who(x.studentId) }))
      .sort((a, b) => a.number - b.number);
    const assets = st.students.filter(x => x.active).map(x => {
      const cash = getBalance(st, x.id), sav = savingsValue(st, x.id), stk = stockValueOf(st, x.id);
      const ln = activeLoan(st, x.id);
      return {
        number: x.number, nickname: x.nickname, cash, savings: sav, stock: stk,
        total: money(cash + sav + stk), loan: ln ? money(ln.principal) : 0,
      };
    }).sort((a, b) => (b.total - a.total) || (a.number - b.number));
    return ok({
      currencyName: s.currencyName,
      settings: {
        bankEnabled: s.bankEnabled !== false,
        savingsEnabled: s.savingsEnabled !== false,
        savingsMax: money(s.savingsMax),
        savingsRate: Number(s.savingsRate) || 0,
        savingsPeriodDays: Math.max(1, Number(s.savingsPeriodDays) || 7),
        savingsLockDays: Math.max(0, Number(s.savingsLockDays) || 0),
        loanEnabled: s.loanEnabled !== false,
        loanRate: Number(s.loanRate) || 0,
        loanPeriodDays: Math.max(1, Number(s.loanPeriodDays) || 7),
        loanMultiplier: Number(s.loanMultiplier) > 0 ? Number(s.loanMultiplier) : 2,
        donationEnabled: s.donationEnabled !== false,
        donationThreshold: money(s.donationThreshold) || 150,
      },
      totals: {
        depositPrincipal: money(deposits.reduce((a, x) => a + x.amount, 0)),
        depositValue: money(deposits.reduce((a, x) => a + x.value, 0)),
        loanPrincipal: money(loans.reduce((a, x) => a + x.principal, 0)),
        donationPool: money(st.donationPool),
      },
      deposits, loans, assets,
      donations: st.donations.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50)
        .map(x => ({ amount: x.amount, createdAt: x.createdAt, ...who(x.studentId) })),
      grants: st.donationGrants.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50)
        .map(x => ({ amount: x.amount, createdAt: x.createdAt, ...who(x.studentId) })),
    });
  }
  if (path === "/api/teacher/bank/grant" && method === "POST") {
    if (money(st.donationPool) <= 0) return fail("모인 기부금이 없습니다.");
    const grant = grantDonation(st, "선생님이 바로 전달");
    if (!grant) return fail("전달할 학생이 없습니다.");
    return { mutated: true, ...ok({ to: grant.to, amount: grant.amount }) };
  }
  if (path === "/api/teacher/bank/loan/forgive" && method === "POST") {
    const ln = st.loans.find(x => x.id === Number(d.loanId) && x.status === "상환중");
    if (!ln) return fail("탕감할 대출을 찾을 수 없습니다.");
    const left = money(ln.principal);
    ln.principal = 0; ln.status = "탕감"; ln.closedAt = kst().datetime;
    // 잔액은 그대로 두고, 기록만 남긴다 (돈을 새로 주는 것이 아니라 갚을 의무가 사라지는 것)
    addTx(st, ln.studentId, 0, "대출탕감", `선생님이 남은 대출 원금 ${left} 탕감`);
    return { mutated: true, ...ok({ forgiven: left }) };
  }

  if (path === "/api/teacher/shop" && method === "POST") {
    const itemMap = new Map(st.shopItems.map(i => [i.id, i]));
    const stuMap = new Map(st.students.map(s => [s.id, s]));
    const purchases = st.purchases.slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(p => ({
        id: p.id, status: p.status, createdAt: p.createdAt, usedAt: p.usedAt,
        itemName: itemMap.has(p.itemId) ? itemMap.get(p.itemId).name : "?",
        number: stuMap.has(p.studentId) ? stuMap.get(p.studentId).number : "",
        nickname: stuMap.has(p.studentId) ? stuMap.get(p.studentId).nickname : "?",
      }));
    return ok({ items: st.shopItems, purchases });
  }
  if (path === "/api/teacher/shop/save" && method === "POST") {
    const it = d.item || {};
    const kind = it.kind === "draw" ? "draw" : "shop";
    if (!String(it.name || "").trim()) return fail("쿠폰 이름을 입력하세요.");
    if (kind === "shop" && !(Number(it.price) > 0)) return fail("이름과 1 이상의 가격을 입력하세요.");
    if (kind === "draw" && !(Number(it.weight) > 0)) return fail("뽑기 확률(가중치)은 1 이상이어야 합니다.");
    if (it.id) {
      const ex = st.shopItems.find(x => x.id === Number(it.id));
      if (ex) {
        ex.name = String(it.name); ex.active = !!it.active;
        if (kind === "draw") {
          ex.weight = Math.round(Number(it.weight) || 0);
          ex.effect = ["discount50", "randomShop"].indexOf(it.effect) >= 0 ? it.effect : "";
        }
        else { ex.price = Number(it.price); ex.stock = Number(it.stock) || 0; }
      }
    } else {
      st.shopItems.push({
        id: nextId(st), name: String(it.name), kind, active: true,
        price: kind === "shop" ? Number(it.price) : 0,
        stock: kind === "shop" ? (Number(it.stock) || 0) : 0,
        weight: kind === "draw" ? Math.round(Number(it.weight) || 0) : 0,
        effect: kind === "draw" && ["discount50", "randomShop"].indexOf(it.effect) >= 0 ? it.effect : "",
      });
    }
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/shop/delete" && method === "POST") {
    const before = st.shopItems.length;
    st.shopItems = st.shopItems.filter(x => x.id !== Number(d.itemId));
    if (st.shopItems.length === before) return fail("삭제할 쿠폰을 찾을 수 없습니다.");
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/purchase/use" && method === "POST") {
    const p = st.purchases.find(x => x.id === Number(d.purchaseId));
    if (!p || p.status !== "보유") return fail("사용 처리할 수 없는 쿠폰입니다.");
    p.status = "사용완료"; p.usedAt = kst().datetime;
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/purchase/cancel" && method === "POST") {
    const p = st.purchases.find(x => x.id === Number(d.purchaseId));
    if (!p || p.status !== "보유") return fail("취소할 수 없는 쿠폰입니다.");
    const it = st.shopItems.find(x => x.id === p.itemId);
    if (it) {
      it.stock = Number(it.stock) + 1;
      addTx(st, p.studentId, Number(it.price), "환불", "쿠폰 구매 취소: " + it.name);
    }
    p.status = "취소";
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/fines" && method === "POST") {
    const stuMap = new Map(st.students.map(s => [s.id, s]));
    const history = st.transactions.filter(t => t.type === "벌금")
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 100)
      .map(t => {
        const s = stuMap.get(t.studentId);
        return {
          createdAt: t.createdAt, amount: t.amount, memo: t.memo,
          number: s ? s.number : "", nickname: s ? s.nickname : "?",
        };
      });
    return ok({ fines: st.fines, history });
  }
  if (path === "/api/teacher/fines/save" && method === "POST") {
    st.fines = (d.fines || [])
      .filter(f => String(f.name || "").trim())
      .map(f => ({
        id: f.id ? Number(f.id) : nextId(st),
        name: String(f.name).trim(),
        amount: money(f.amount),
        active: f.active !== false,
      }));
    return { mutated: true, ...ok({ fines: st.fines }) };
  }
  if (path === "/api/teacher/fines/apply" && method === "POST") {
    const fine = st.fines.find(f => f.id === Number(d.fineId));
    if (!fine) return fail("벌금 항목을 선택하세요.");
    if (!d.studentIds || !d.studentIds.length) return fail("학생을 선택하세요.");
    const amt = money(fine.amount);
    if (amt <= 0) return fail("벌금 금액은 0보다 커야 합니다.");
    const memo = String(d.memo || "").trim();
    for (const sid of d.studentIds) addTx(st, Number(sid), -amt, "벌금", memo ? `${fine.name} - ${memo}` : fine.name);
    return { mutated: true, ...ok({ count: d.studentIds.length, amount: amt }) };
  }
  if (path === "/api/teacher/stocks" && method === "POST") {
    const stuMap = new Map(st.students.map(s => [s.id, s]));
    const rows = st.holdings.filter(h => Number(h.qty) > 0).map(h => {
      const s = stuMap.get(h.studentId);
      const x = st.stocks.find(y => y.id === h.stockId);
      const price = x ? money(x.price) : 0;
      return {
        number: s ? s.number : "", nickname: s ? s.nickname : "?",
        stock: x ? x.name : "?", qty: Number(h.qty),
        avgCost: money(h.avgCost), value: money(price * Number(h.qty)),
      };
    }).sort((a, b) => (a.number - b.number) || String(a.stock).localeCompare(String(b.stock)));
    return ok({ stocks: st.stocks.map(x => teacherStockDto(st, x)), holdings: rows,
      stockEnabled: st.settings.stockEnabled !== false, stockConfig: stockSyncConfig(st) });
  }
  if (path === "/api/teacher/stocks/save" && method === "POST") {
    const it = d.stock || {};
    const name = String(it.name || "").trim();
    const price = Math.max(0.01, Math.round((Number(it.price) || 0) * 100) / 100);
    if (!name) return fail("종목 이름을 입력하세요.");
    if (!(price >= 0.01)) return fail("가격은 0.01 이상이어야 합니다.");
    if (it.id) {
      const ex = st.stocks.find(x => x.id === Number(it.id));
      if (!ex) return fail("없는 종목입니다.");
      ex.name = name;
      ex.active = it.active !== false;
      ex.linkMode = it.linkMode === "market" ? "market" : "manual";
      ex.symbol = String(it.symbol || "").trim();
      ex.exchange = String(it.exchange || "").trim();
      if (Math.round(Number(ex.price) * 100) / 100 !== price) {   // 가격이 0.01 이상 바뀔 때만 기록을 남긴다
        ex.price = price;
        ex.history = (ex.history || []).concat(price).slice(-30);
      }
    } else {
      st.stocks.push({ id: nextId(st), name, price, active: true, history: [price],
        linkMode: it.linkMode === "market" ? "market" : "manual",
        symbol: String(it.symbol || "").trim(), exchange: String(it.exchange || "").trim() });
    }
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/stocks/config" && method === "POST") {
    const cfg = d.config || {};
    st.settings.stockAutoSync = !!cfg.autoSync;
    if (String(cfg.apiKey || "").trim()) st.settings.stockApiKey = String(cfg.apiKey).trim();
    if (String(cfg.kisAppKey || "").trim()) {
      st.settings.kisAppKey = String(cfg.kisAppKey).trim();
      st.settings.kisAccessToken = ""; st.settings.kisTokenExpiresAt = 0;
    }
    if (String(cfg.kisAppSecret || "").trim()) {
      st.settings.kisAppSecret = String(cfg.kisAppSecret).trim();
      st.settings.kisAccessToken = ""; st.settings.kisTokenExpiresAt = 0;
    }
    if (cfg.clearApiKey) st.settings.stockApiKey = "";
    if (cfg.clearKis) {
      st.settings.kisAppKey = ""; st.settings.kisAppSecret = "";
      st.settings.kisAccessToken = ""; st.settings.kisTokenExpiresAt = 0;
    }
    return { mutated: true, ...ok({ config: stockSyncConfig(st) }) };
  }
  if (path === "/api/teacher/stocks/delete" && method === "POST") {
    const id = Number(d.stockId);
    const held = st.holdings.filter(h => h.stockId === id && Number(h.qty) > 0);
    if (held.length) return fail(`아직 이 종목을 가진 학생이 ${held.length}명 있어요. 먼저 '사용'을 꺼서 거래를 막아 주세요.`);
    const before = st.stocks.length;
    st.stocks = st.stocks.filter(x => x.id !== id);
    if (st.stocks.length === before) return fail("삭제할 종목을 찾을 수 없습니다.");
    return { mutated: true, ...ok({}) };
  }
  if (path === "/api/teacher/settings" && method === "POST") {
    return ok({ settings: publicSettings(st) });
  }
  if (path === "/api/teacher/settings/save" && method === "POST") {
    const s = st.settings, ns = d.settings || {};
    if (String(ns.classCode || "").trim()) s.classCode = String(ns.classCode).trim();
    if (String(ns.currencyName || "").trim()) s.currencyName = String(ns.currencyName).trim();
    // 학급 화폐는 소수점 둘째 자리까지 쓴다 (주가가 3.66이면 3.66만 결제되도록)
    s.taxRate = Number(ns.taxRate) || 0;
    s.basePay = money(ns.basePay);
    s.latePay = money(ns.latePay);
    s.payLimitPerTx = money(ns.payLimitPerTx) || 50;
    s.payLimitPerDay = money(ns.payLimitPerDay) || 100;
    if (ns.drawCost != null && String(ns.drawCost) !== "") s.drawCost = Math.max(0, money(ns.drawCost));
    if (ns.drawEnabled != null) s.drawEnabled = !!ns.drawEnabled;
    if (Number(ns.drawCardCount) >= 2) s.drawCardCount = Math.min(6, Math.round(Number(ns.drawCardCount)));
    if (ns.luckyEnabled != null) s.luckyEnabled = !!ns.luckyEnabled;
    if (/^\d{2}:\d{2}$/.test(String(ns.luckyStart))) s.luckyStart = String(ns.luckyStart);
    if (/^\d{2}:\d{2}$/.test(String(ns.luckyEnd))) s.luckyEnd = String(ns.luckyEnd);
    if (ns.luckyReward != null && String(ns.luckyReward) !== "") s.luckyReward = Math.max(0, money(ns.luckyReward));
    if (ns.stockEnabled != null) s.stockEnabled = !!ns.stockEnabled;
    // 은행 (적금 · 대출 · 기부)
    if (ns.bankEnabled != null) s.bankEnabled = !!ns.bankEnabled;
    if (ns.savingsEnabled != null) s.savingsEnabled = !!ns.savingsEnabled;
    if (Number(ns.savingsMax) >= 1) s.savingsMax = money(ns.savingsMax);
    if (Number(ns.savingsRate) >= 0) s.savingsRate = Math.round(Number(ns.savingsRate) * 100) / 100;
    if (Number(ns.savingsPeriodDays) >= 1) s.savingsPeriodDays = Math.round(Number(ns.savingsPeriodDays));
    if (Number(ns.savingsLockDays) >= 0) s.savingsLockDays = Math.round(Number(ns.savingsLockDays));
    if (ns.loanEnabled != null) s.loanEnabled = !!ns.loanEnabled;
    if (Number(ns.loanRate) >= 0) s.loanRate = Math.round(Number(ns.loanRate) * 100) / 100;
    if (Number(ns.loanPeriodDays) >= 1) s.loanPeriodDays = Math.round(Number(ns.loanPeriodDays));
    if (Number(ns.loanMultiplier) > 0) s.loanMultiplier = Math.round(Number(ns.loanMultiplier) * 100) / 100;
    if (ns.donationEnabled != null) s.donationEnabled = !!ns.donationEnabled;
    if (Number(ns.donationThreshold) >= 1) s.donationThreshold = money(ns.donationThreshold);
    if (Number(ns.tradeCooldown) >= 0) s.tradeCooldown = Math.round(Number(ns.tradeCooldown));
    if (/^\d{2}:\d{2}$/.test(String(ns.deadline))) s.deadline = String(ns.deadline);
    if (Number(ns.taxWeekday) >= 1 && Number(ns.taxWeekday) <= 7) s.taxWeekday = Number(ns.taxWeekday);
    if (/^\d{2}:\d{2}$/.test(String(ns.taxTime))) s.taxTime = String(ns.taxTime);
    if (String(ns.teacherPw || "").trim()) s.teacherPw = String(ns.teacherPw).trim();
    return { mutated: true, ...ok({ settings: publicSettings(st) }) };
  }

  // ══════════ CSV 내보내기 (GET, 쿼리로 교사 인증) ══════════
  if (path === "/api/export/transactions" && method === "GET") {
    if (!testTeacher(st, d)) return fail("교사 인증 실패", 401);
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = ["일시,번호,별명,유형,금액,사유"];
    for (const r of txRows(st)) lines.push(`${r.createdAt},${r.number},${q(r.nickname)},${r.type},${r.amount},${q(r.memo)}`);
    return { csv: lines.join("\r\n"), filename: "transactions.csv" };
  }
  if (path === "/api/export/balances" && method === "GET") {
    if (!testTeacher(st, d)) return fail("교사 인증 실패", 401);
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = ["번호,별명,직업,모둠,현금,적금 평가액,주식 평가액,남은 재산,대출 잔액"];
    for (const s of st.students.filter(x => x.active).sort((a, b) => a.number - b.number)) {
      const job = getJob(st, s.jobId);
      const cash = getBalance(st, s.id), sav = savingsValue(st, s.id), stk = stockValueOf(st, s.id);
      const ln = activeLoan(st, s.id);
      lines.push(`${s.number},${q(s.nickname)},${q(job ? job.name : "미배정")},${s.group != null ? s.group : "-"},${cash},${sav},${stk},${money(cash + sav + stk)},${ln ? money(ln.principal) : 0}`);
    }
    return { csv: lines.join("\r\n"), filename: "balances.csv" };
  }
  if (path === "/api/export/bank" && method === "GET") {
    if (!testTeacher(st, d)) return fail("교사 인증 실패", 401);
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const map = new Map(st.students.map(x => [x.id, x]));
    const who = sid => { const x = map.get(sid); return x ? `${x.number}번 ${x.nickname}` : "?"; };
    const lines = ["구분,학생,금액,시작일,상태,비고"];
    for (const x of st.deposits)
      lines.push(`적금,${q(who(x.studentId))},${x.amount},${x.createdAt},${q(x.status)},${q(x.status === "예치중" ? `현재 평가액 ${depositInfo(st, x).value}` : `받은 금액 ${x.received || 0} (이자 ${x.interest || 0})`)}`);
    for (const x of st.loans)
      lines.push(`대출,${q(who(x.studentId))},${x.original},${x.createdAt},${q(x.status)},${q(`남은 원금 ${money(x.principal)} · 낸 이자 ${money(x.interestPaid)}`)}`);
    for (const x of st.donations)
      lines.push(`기부,${q(who(x.studentId))},${x.amount},${x.createdAt},완료,`);
    for (const x of st.donationGrants)
      lines.push(`기부금 전달,${q(who(x.studentId))},${x.amount},${x.createdAt},완료,`);
    lines.push(`모인 기부금,,${money(st.donationPool)},,,${q(`목표 ${money(st.settings.donationThreshold)}`)}`);
    return { csv: lines.join("\r\n"), filename: "bank.csv" };
  }
  if (path === "/api/export/jobs" && method === "GET") {
    if (!testTeacher(st, d)) return fail("교사 인증 실패", 401);
    const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const activeStudents = st.students.filter(x => x.active);
    const lines = ["직업 이름,등급,주급 수당,모둠원 지급 권한,쿠폰 처리 권한,배정 인원,배정 학생"];
    for (const job of st.jobs) {
      const assigned = activeStudents.filter(s => Number(s.jobId) === Number(job.id)).sort((a, b) => a.number - b.number);
      const names = assigned.map(s => `${s.number}번 ${s.nickname}`).join(" / ");
      lines.push(`${q(job.name)},${q(job.tier)},${Number(job.allowance) || 0},${job.canPay ? "있음" : "없음"},${job.canUseCoupon ? "있음" : "없음"},${assigned.length},${q(names)}`);
    }
    const unassigned = activeStudents.filter(s => !getJob(st, s.jobId)).sort((a, b) => a.number - b.number);
    if (unassigned.length) {
      lines.push(`${q("미배정")},,,,,${unassigned.length},${q(unassigned.map(s => `${s.number}번 ${s.nickname}`).join(" / "))}`);
    }
    return { csv: lines.join("\r\n"), filename: "jobs.csv" };
  }

  return fail("없는 주소입니다.", 404);
}

// ── D1 저장 (버전 잠금: 동시에 여러 명이 써도 기록이 사라지지 않음) ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS bank_state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, data TEXT NOT NULL)").run();
  schemaReady = true;
}
async function loadState(db) {
  const row = await db.prepare("SELECT version, data FROM bank_state WHERE id = 1").first();
  if (!row) return { version: 0, state: defaultState() };
  return { version: row.version, state: migrate(JSON.parse(row.data)) };
}
async function saveState(db, version, state) {
  prune(state);
  const json = JSON.stringify(state);
  if (version === 0) {
    try {
      await db.prepare("INSERT INTO bank_state (id, version, data) VALUES (1, 1, ?)").bind(json).run();
      return true;
    } catch (e) { return false; } // 동시에 첫 저장이 겹친 경우
  }
  const r = await db.prepare("UPDATE bank_state SET version = version + 1, data = ? WHERE id = 1 AND version = ?").bind(json, version).run();
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
    // no-store: 새로 배포했는데 브라우저가 옛 화면을 캐시해서 보여주는 일을 막는다
    // (교사·학생 태블릿이 새로고침만 하면 항상 최신 화면을 받도록)
    const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate" };
    if (method === "GET" || method === "HEAD") {
      if (path === "/" || path === "/index.html")
        return new Response(STUDENT_HTML, { headers: htmlHeaders });
      if (path === "/teacher.html")
        return new Response(TEACHER_HTML, { headers: htmlHeaders });
      if (path === "/mascot.png") {
        const bytes = Uint8Array.from(atob(MASCOT_PNG_B64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
      }
    }
    if (!path.startsWith("/api/")) return new Response("404", { status: 404 });

    // ── API ──
    let d = null;
    if (method === "POST") {
      try { d = await request.json(); } catch (e) { d = {}; }
    } else if (method === "GET") {
      d = { id: url.searchParams.get("id"), pw: url.searchParams.get("pw") };
    }

    try {
      await ensureSchema(env.DB);
      // 버전 충돌 시 다시 읽어 재시도 (최대 8회, 조금씩 쉬었다가)
      for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt > 0) await sleep(20 + Math.floor(Math.random() * 60));   // 여러 명이 동시에 몰릴 때 서로 비켜 주기
        const { version, state } = await loadState(env.DB);
        const taxed = runScheduledTax(state);   // 금요일 9시가 지났으면 소득세를 먼저 징수
        const interest = accrueLoanInterest(state);  // 일주일이 지난 대출은 이자를 자동 차감
        const shared = !!settleDonations(state);     // 기부금이 목표에 닿았으면 바로 나눔
        let stockSynced = false, r;
        if (path === "/api/teacher/stocks/sync" && method === "POST") {
          if (!testTeacher(state, d.auth)) r = fail("교사 로그인이 필요합니다.", 401);
          else {
            const sync = await syncMarketStocks(state);
            stockSynced = sync.changed;
            r = sync.count === 0 && sync.errors.length
              ? fail(sync.errors.join("\n"))
              : { mutated: sync.changed, ...ok({ count: sync.count, errors: sync.errors, message: state.settings.lastStockSyncMessage }) };
          }
        } else {
          if (shouldAutoSyncStocks(state)) {
            const sync = await syncMarketStocks(state);
            stockSynced = sync.changed;
          }
          r = handleApi(state, path, method, d);
        }
        if (r.csv !== undefined) {
          const bom = String.fromCharCode(0xFEFF); // 엑셀 한글 호환용 BOM
          return new Response(bom + r.csv, {
            headers: {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename=${r.filename}`,
            },
          });
        }
        if (!r.mutated && !taxed && !interest && !shared && !stockSynced) return jsonResponse(r.body, r.status);
        if (await saveState(env.DB, version, state)) return jsonResponse(r.body, r.status);
      }
      return jsonResponse({ ok: false, error: "저장이 겹쳤어요. 다시 시도해 주세요." }, 503);
    } catch (e) {
      return jsonResponse({ ok: false, error: "서버 오류: " + (e && e.message ? e.message : e) }, 500);
    }
  },
};
