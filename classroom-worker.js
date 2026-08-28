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

const HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#f0a35e" />
<title>우리 반 교실 꾸미기 — 합치기 게임</title>
<style>
  :root{
    --bg:#fdf6ec; --card:#ffffff; --ink:#3a2f28; --muted:#8b7d72;
    --brand:#e8894a; --brand-d:#c76c31; --brand-l:#fbe4d1;
    --green:#4aa972; --green-bg:#e6f6ec;
    --blue:#4c8dff; --blue-bg:#eaf1ff; --gold:#f0b429; --purple:#8b6cd6;
    --line:#f0e3d5; --radius:20px; --shadow:0 8px 26px rgba(160,110,60,.16);
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{margin:0;height:100%;overscroll-behavior:none}
  body{
    font-family:"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif;
    background:var(--bg); color:var(--ink); line-height:1.45;
    -webkit-font-smoothing:antialiased; overflow:hidden; user-select:none;
  }
  .app{height:100%;display:flex;flex-direction:column;max-width:1100px;margin:0 auto}

  /* ── 헤더 ── */
  header.top{display:flex;align-items:center;gap:9px;padding:7px 11px 5px}
  .mascot{width:34px;height:34px;object-fit:contain;border-radius:10px;flex:none}
  .title h1{margin:0;font-size:16px;font-weight:800;letter-spacing:-.5px;white-space:nowrap}
  .title p{margin:0;font-size:11px;color:var(--muted);white-space:nowrap}
  .hud{margin-left:auto;display:flex;align-items:center;gap:6px}
  .pill{
    display:flex;align-items:center;gap:5px;background:var(--card);border:1.5px solid var(--line);
    border-radius:999px;padding:5px 11px;font-weight:800;font-size:14px;box-shadow:0 2px 8px rgba(160,110,60,.08)
  }
  .lvbox{min-width:112px}
  .lvbar{height:6px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:3px}
  .lvbar i{display:block;height:100%;background:linear-gradient(90deg,#f7c66b,var(--brand));border-radius:99px;transition:width .3s}
  .lvbox .row{display:flex;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--muted);font-weight:700;white-space:nowrap}
  .lvbox .row b{color:var(--ink);font-size:13px}

  /* ── 무대(캔버스) ── */
  .stage{position:relative;flex:1;margin:2px 8px 0;border-radius:var(--radius);overflow:hidden;
    background:linear-gradient(#eaf3ff,#f3f7ec);box-shadow:var(--shadow)}
  canvas{display:block;width:100%;height:100%;touch-action:none}
  .float{position:absolute;display:flex;gap:6px}
  .float.tl{top:8px;left:8px;flex-direction:column;align-items:flex-start}
  .float.tr{top:8px;right:8px}
  .float.br{bottom:8px;right:8px;flex-direction:column}
  .fbtn{
    border:none;background:rgba(255,255,255,.94);color:var(--ink);font-weight:800;font-size:12.5px;
    padding:7px 11px;border-radius:13px;box-shadow:0 3px 10px rgba(120,80,40,.18);cursor:pointer;
    display:flex;align-items:center;gap:5px;font-family:inherit;position:relative
  }
  .fbtn.icon{padding:7px 9px;font-size:15px}
  .fbtn:active{transform:scale(.95)}
  .fbtn.main{background:linear-gradient(180deg,#fbb36a,var(--brand));color:#fff}
  .fbtn .dot{position:absolute;top:-4px;right:-4px;background:#e05a5a;color:#fff;font-size:10px;
    min-width:17px;height:17px;border-radius:99px;display:flex;align-items:center;justify-content:center;padding:0 4px}
  .hint{
    position:absolute;left:50%;bottom:8px;transform:translateX(-50%);
    background:rgba(58,47,40,.86);color:#fff;font-size:12.5px;font-weight:700;padding:7px 14px;
    border-radius:999px;opacity:0;transition:opacity .25s;pointer-events:none;max-width:92%;text-align:center;z-index:3
  }
  .hint.on{opacity:1}

  /* 선택한 아이템 정보 바 */
  .infobar{
    position:absolute;left:8px;right:8px;bottom:8px;display:none;align-items:center;gap:9px;
    background:rgba(255,255,255,.97);border:1.5px solid var(--line);border-radius:16px;
    padding:7px 10px;box-shadow:0 6px 18px rgba(120,80,40,.18);z-index:4
  }
  .infobar.on{display:flex}
  .infobar .ie{font-size:26px;line-height:1}
  .infobar .it{min-width:0;flex:1}
  .infobar .it b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .infobar .it small{display:block;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .infobar button{
    border:none;border-radius:11px;padding:7px 10px;font-size:12px;font-weight:800;font-family:inherit;
    background:var(--brand-l);color:var(--brand-d);cursor:pointer;white-space:nowrap
  }
  .infobar button.gold{background:#fdf0cf;color:#a9781a}
  .infobar button.gray{background:var(--line);color:var(--muted);padding:7px 9px}
  .infobar button:active{transform:scale(.95)}

  /* ── 아래 판(주문 · 프로젝트) ── */
  .dock{padding:6px 8px 9px}
  .tabs{display:flex;gap:6px;margin-bottom:6px}
  .tab{
    border:1.5px solid var(--line);background:var(--card);color:var(--muted);font-weight:800;font-size:12px;
    padding:5px 12px;border-radius:999px;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:5px
  }
  .tab.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .tab .n{background:var(--brand);color:#fff;border-radius:99px;font-size:10px;padding:0 5px;min-width:16px;text-align:center}
  .tab.on .n{background:var(--brand)}
  .pane{display:none}
  .pane.on{display:block}

  .orders{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
  .orders::-webkit-scrollbar{display:none}
  .orders{align-items:stretch}
  .order{
    flex:0 0 auto;width:172px;background:var(--card);border:1.5px solid var(--line);border-radius:16px;
    padding:8px 10px 9px;box-shadow:0 3px 12px rgba(160,110,60,.08);position:relative;
    display:flex;flex-direction:column
  }
  .order .bottom{margin-top:auto}
  .order .needs{min-height:30px}
  .order.ready{border-color:#bfe6cd;background:linear-gradient(180deg,#fff,#f3fbf6)}
  .order .who{font-size:12px;font-weight:800;display:flex;align-items:center;gap:4px}
  .order .who span.face{font-size:15px}
  .order .say{font-size:11px;color:var(--muted);margin:0 0 6px;height:15px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .needs{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px}
  .need{display:flex;align-items:center;gap:3px;background:#faf4ec;border:1.5px solid var(--line);
    border-radius:11px;padding:2px 6px;font-size:11.5px;font-weight:800}
  .need .em{font-size:17px}
  .need .lv{font-size:9px;color:var(--muted)}
  .need.ok{background:var(--green-bg);border-color:#bfe6cd;color:var(--green)}
  .order .bottom{display:flex;align-items:center;gap:6px;flex-wrap:nowrap}
  .reward{font-size:11px;font-weight:800;color:var(--gold);line-height:1.25}
  .reward b{color:var(--blue)}
  .give{
    margin-left:auto;border:none;border-radius:11px;padding:6px 11px;font-size:12px;font-weight:800;
    background:var(--line);color:#b0a196;font-family:inherit;cursor:not-allowed;white-space:nowrap;flex:none
  }
  .give.on{background:linear-gradient(180deg,#63c48c,var(--green));color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(74,169,114,.35)}
  .give.on:active{transform:scale(.95)}
  .skip{position:absolute;top:4px;right:5px;border:none;background:none;color:#cbbcae;font-size:13px;cursor:pointer;padding:2px 4px;font-family:inherit}

  /* 프로젝트 카드 */
  .project{background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:9px 12px 10px;
    box-shadow:0 3px 12px rgba(160,110,60,.08);display:flex;gap:11px;align-items:center}
  .project .pem{font-size:30px;flex:none}
  .project .pbody{flex:1;min-width:0}
  .project .pt{font-size:13px;font-weight:800;display:flex;align-items:center;gap:6px}
  .project .pt small{font-size:10.5px;color:var(--muted);font-weight:700}
  .project .pd{font-size:11px;color:var(--muted);margin-bottom:5px}
  .project .pr{font-size:10.5px;color:var(--purple);font-weight:800;margin-top:4px}
  .project .done{font-size:13px;font-weight:800;color:var(--green);text-align:center;padding:6px 0}

  /* ── 모달 ── */
  .modal{position:fixed;inset:0;background:rgba(58,47,40,.45);display:none;align-items:flex-end;justify-content:center;z-index:40}
  .modal.on{display:flex}
  .sheet{
    background:var(--bg);width:100%;max-width:560px;max-height:88vh;border-radius:24px 24px 0 0;
    padding:14px 16px calc(18px + env(safe-area-inset-bottom));overflow:auto;animation:up .22s ease
  }
  @keyframes up{from{transform:translateY(30px);opacity:.4}to{transform:none;opacity:1}}
  .sheet h3{margin:2px 0 2px;font-size:18px;display:flex;align-items:center;gap:7px}
  .sheet .sub{margin:0 0 12px;font-size:12.5px;color:var(--muted)}
  .x{margin-left:auto;border:none;background:var(--line);border-radius:999px;width:30px;height:30px;font-size:15px;cursor:pointer;font-family:inherit}
  .shopgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:9px}
  .shopitem{background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:9px 7px;text-align:center}
  .shopitem .em{font-size:30px;line-height:1.2}
  .shopitem .nm{font-size:12px;font-weight:800;margin-top:1px}
  .shopitem button{
    margin-top:6px;width:100%;border:none;border-radius:10px;padding:6px 0;font-size:12px;font-weight:800;
    background:linear-gradient(180deg,#fbb36a,var(--brand));color:#fff;font-family:inherit;cursor:pointer
  }
  .shopitem button:disabled{background:var(--line);color:#b0a196;cursor:default}
  .shopitem.owned{border-color:#bfe6cd;background:var(--green-bg)}

  /* 창고 */
  .storegrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px}
  .slot{aspect-ratio:1;border:2px dashed var(--line);border-radius:14px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;background:var(--card);position:relative}
  .slot.full{border-style:solid;cursor:pointer}
  .slot .em{font-size:26px;line-height:1}
  .slot .lv{position:absolute;right:4px;bottom:3px;font-size:10px;font-weight:800;color:#fff;
    background:var(--brand);border-radius:99px;padding:0 5px}

  /* 도감 */
  .chainbox{background:var(--card);border:1.5px solid var(--line);border-radius:14px;padding:8px 10px;margin:7px 0}
  .chainbox .cn{font-size:12px;font-weight:800;color:var(--muted);display:flex;justify-content:space-between}
  .chainbox .cl{font-size:19px;letter-spacing:1px;margin-top:3px;line-height:1.5;word-break:break-all}
  .help p{font-size:13.5px;margin:8px 0}
  .help ul{padding-left:18px;margin:6px 0;font-size:13.5px}
  .help li{margin:5px 0}
  .danger{width:100%;margin-top:12px;border:1.5px solid #f0cfc4;background:#fff3ef;color:#c9563c;
    border-radius:12px;padding:10px;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer}

  .toast{
    position:fixed;left:50%;top:56px;transform:translate(-50%,-24px);z-index:60;
    background:#fff;border:2px solid var(--brand-l);color:var(--ink);font-weight:800;font-size:13.5px;
    padding:9px 16px;border-radius:999px;box-shadow:var(--shadow);opacity:0;transition:.25s;pointer-events:none;
    max-width:92%;text-align:center
  }
  .toast.on{opacity:1;transform:translate(-50%,0)}

  @media (max-width:420px){
    .title p{display:none}
    .lvbox{min-width:78px}
    .pill{padding:4px 9px;font-size:13px}
    .order{width:158px}
  }
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <img class="mascot" src="mascot.png" alt="" onerror="this.style.display='none'" />
    <div class="title">
      <h1>우리 반 교실 꾸미기</h1>
      <p>합치고 · 모으고 · 우리 교실을 꾸며요</p>
    </div>
    <div class="hud">
      <div class="pill" title="동전"><span>🪙</span><span id="coins">0</span></div>
      <div class="pill lvbox">
        <div style="flex:1">
          <div class="row"><span>Lv <b id="lv">1</b></span><span id="xptxt">0/50</span></div>
          <div class="lvbar"><i id="xpbar" style="width:0%"></i></div>
        </div>
      </div>
    </div>
  </header>

  <div class="stage" id="stage">
    <canvas id="cv"></canvas>
    <div class="float tl">
      <button class="fbtn main" id="btnShop">🎀 교실 꾸미기</button>
      <button class="fbtn" id="btnStore">🎒 창고 <span class="dot" id="storeDot">0</span></button>
      <button class="fbtn" id="btnGuide">📖 도감</button>
    </div>
    <div class="float tr">
      <button class="fbtn icon" id="btnSound" title="소리">🔊</button>
      <button class="fbtn icon" id="btnHelp" title="도움말">❓</button>
    </div>
    <div class="float br">
      <button class="fbtn icon" id="btnZoomIn">➕</button>
      <button class="fbtn icon" id="btnZoomOut">➖</button>
      <button class="fbtn icon" id="btnFit">🎯</button>
    </div>
    <div class="infobar" id="infobar">
      <span class="ie" id="infoEm">✏️</span>
      <div class="it"><b id="infoName">—</b><small id="infoSub">—</small></div>
      <button id="infoStore">🎒 넣기</button>
      <button class="gold" id="infoSell">🪙 팔기</button>
      <button class="gray" id="infoClose">✕</button>
    </div>
    <div class="hint" id="hint"></div>
  </div>

  <div class="dock">
    <div class="tabs">
      <button class="tab on" data-pane="paneOrders">📋 알림장 <span class="n" id="orderReadyN">0</span></button>
      <button class="tab" data-pane="paneProject">🎯 학급 프로젝트 <span class="n" id="projN">1</span></button>
    </div>
    <div class="pane on" id="paneOrders"><div class="orders" id="orders"></div></div>
    <div class="pane" id="paneProject"><div id="projectBox"></div></div>
  </div>
</div>

<!-- 상점 -->
<div class="modal" id="mShop"><div class="sheet">
  <h3>🎀 교실 꾸미기 <button class="x" data-close="mShop">✕</button></h3>
  <p class="sub">동전으로 교실을 꾸며요. 꾸민 물건마다 <b>교실 인기</b>가 올라 주문 보상이 많아져요.</p>
  <div class="shopgrid" id="shopGrid"></div>
</div></div>

<!-- 창고 -->
<div class="modal" id="mStore"><div class="sheet">
  <h3>🎒 창고 <button class="x" data-close="mStore">✕</button></h3>
  <p class="sub">교실 자리가 모자랄 때 물건을 넣어 두세요. 칸을 누르면 교실로 다시 꺼냅니다.
    <span id="storeCap"></span></p>
  <div class="storegrid" id="storeGrid"></div>
</div></div>

<!-- 도감 -->
<div class="modal" id="mGuide"><div class="sheet">
  <h3>📖 아이템 도감 <button class="x" data-close="mGuide">✕</button></h3>
  <p class="sub">같은 물건 둘을 겹치면 다음 단계로 자라요. 회색은 아직 못 만든 물건이에요.</p>
  <div id="guideBox"></div>
</div></div>

<!-- 도움말 -->
<div class="modal" id="mHelp"><div class="sheet help">
  <h3>❓ 놀이 방법 <button class="x" data-close="mHelp">✕</button></h3>
  <p class="sub">저장은 이 기기(브라우저)에만 됩니다. 서버로 보내지 않아요.</p>
  <ul>
    <li><b>합치기</b> — 같은 물건 둘을 끌어다 겹치면 다음 단계가 돼요. 사슬은 갈래마다 <b>8~9단계</b>까지 있어요.</li>
    <li><b>생산기(🗄️🗃️🧺…)</b> — 톡 누르면 물건이 나와요. 생산기마다 <b>충전 ⚡</b>이 있고 시간이 지나면 저절로 채워져요.</li>
    <li><b>생산기도 합쳐져요!</b> — 같은 생산기 둘을 겹치면 <b>Ⅱ → Ⅲ 단계</b>로 커져서, 충전이 많아지고 더 좋은 물건이 나와요.</li>
    <li><b>상자(🎁📦🎊)</b> — 톡 누르면 물건이 쏟아져요. 상자끼리도 합쳐서 더 큰 상자가 됩니다.</li>
    <li><b>포장(🎀)</b> — 리본이 묶인 물건은 여러 번 톡톡 누르면 풀려요.</li>
    <li><b>알림장 주문</b> — 친구가 부탁한 물건을 만들어 두고 <b>주기</b>를 누르면 동전·경험치를 받아요. (창고 물건도 함께 셉니다)</li>
    <li><b>학급 프로젝트</b> — 한 해 동안의 큰 목표예요. 완성할 때마다 <b>새 생산기·자리 확장·교실 장식</b>이 열려요.</li>
    <li><b>창고(🎒)</b> — 자리가 모자랄 때 물건을 넣어 두는 곳. 레벨이 오르면 칸이 늘어나요.</li>
    <li><b>팔기</b> — 물건을 눌러 아래 정보 바에서 동전으로 바꿀 수 있어요.</li>
    <li><b>콤보·행운</b> — 빠르게 이어 합치면 <b>콤보 보너스</b>, 가끔 <b>행운 합치기</b>로 결과가 2개 나와요!</li>
    <li>빈 곳을 끌면 화면이 움직이고, ➕ ➖ 🎯 으로 크게·작게·처음 크기로 볼 수 있어요.</li>
  </ul>
  <button class="danger" id="btnReset">🗑 처음부터 다시 시작하기</button>
</div></div>

<div class="toast" id="toast"></div>

<script src="game.js" defer></script>
</body>
</html>
`;
const GAME_JS = `"use strict";
/* ══════════════════════════════════════════════════════════
   우리 반 교실 꾸미기 — 아이소메트릭 합치기(머지) 게임  v2
   화면·모양은 index.html, 게임 규칙과 그리기는 이 파일(game.js)
   오프라인 동작 · 진행 상황은 브라우저(localStorage)에만 저장

   ┌ 차례 ────────────────────────────────────────────────┐
   │  1. 자료 (사슬 · 생산기 · 상자 · 꾸미기 · 프로젝트)   │
   │  2. 상태 · 저장 · 불러오기                            │
   │  3. 생산기(충전) · 아이템 만들기                      │
   │  4. 합치기 · 콤보 · 행운                              │
   │  5. 주문 · 프로젝트 · 창고 · 팔기                     │
   │  6. 소리                                              │
   │  7. 캔버스 · 화면 계산                                │
   │  8. 애니메이션 · 캐릭터                               │
   │  9. 그리기                                            │
   │ 10. 입력(끌기 · 톡 누르기 · 화면 이동)                │
   │ 11. 경험치 · 레벨                                     │
   │ 12. UI 갱신 (HUD · 주문 · 프로젝트 · 창고 · 상점)     │
   │ 13. 시작 · 루프                                       │
   └──────────────────────────────────────────────────────┘
   ══════════════════════════════════════════════════════════ */

/* ══ 1. 자료 ══════════════════════════════════════════════ */

/* 합치기 사슬: 갈래마다 8~9단계 */
const CHAINS = {
  pen:  {name:'필기구', color:'#f0b429', items:[
    ['몽당연필','✏️'],['색연필','🖍️'],['볼펜','🖊️'],['만년필','🖋️'],['자','📏'],
    ['삼각자','📐'],['가위와 풀','✂️'],['학용품 세트','🧰'],['멋진 책가방','🎒']]},
  book: {name:'공부',   color:'#4c8dff', items:[
    ['종이','📄'],['학습지','📝'],['공책','📓'],['알림장','📔'],['교과서','📗'],
    ['책더미','📚'],['학습 자료함','🗂️'],['우등상장','🏅'],['졸업 앨범','🎓']]},
  clean:{name:'청소',   color:'#4aa972', items:[
    ['휴지','🧻'],['스펀지','🧽'],['세제','🧴'],['물통','🪣'],['빗자루','🧹'],
    ['비누 세트','🧼'],['분리수거함','♻️'],['청소 로봇','🤖']]},
  food: {name:'급식',   color:'#ef767a', items:[
    ['우유','🥛'],['과자','🍪'],['사과','🍎'],['샌드위치','🥪'],['밥','🍚'],
    ['급식판','🍱'],['컵케이크','🧁'],['생일 잔치상','🎂']]},
  sport:{name:'체육',   color:'#e8894a', items:[
    ['요요','🪀'],['탁구채','🏓'],['배드민턴','🏸'],['축구공','⚽'],['농구공','🏀'],
    ['배구공','🏐'],['금메달','🥇'],['우승컵','🏆']]},
  art:  {name:'예술',   color:'#8b6cd6', items:[
    ['실','🧵'],['털실','🧶'],['붓','🖌️'],['그림','🖼️'],['가면','🎭'],
    ['손풍금','🪗'],['노래 마이크','🎤'],['학예회 무대','🎪']]},
};
const CHAIN_KEYS = Object.keys(CHAINS);

/* 생산기: 톡 누르면 사슬 1~5단계 물건이 나온다. 생산기끼리도 합쳐진다(Ⅰ→Ⅱ→Ⅲ) */
const GENS = {
  pen:   {em:'🗄️', base:'사물함',      chain:'pen'},
  book:  {em:'🗃️', base:'학급문고',    chain:'book'},
  clean: {em:'🧺', base:'청소함',      chain:'clean'},
  food:  {em:'🍽️', base:'급식 카트',   chain:'food'},
  sport: {em:'🎽', base:'체육 창고',   chain:'sport'},
  art:   {em:'🎨', base:'미술 준비실', chain:'art'},
};
const GEN_TIERS = [
  {cap: 8, sec:45, pre:'작은 ', ring:'#cd8f4a', mark:'Ⅰ'},
  {cap:13, sec:34, pre:'',      ring:'#a9adba', mark:'Ⅱ'},
  {cap:20, sec:25, pre:'큰 ',   ring:'#e6b422', mark:'Ⅲ'},
];
/* 단계별로 나오는 물건의 수준 (확률) */
const DROPS = [
  [[1,.60],[2,.28],[3,.12]],
  [[1,.32],[2,.34],[3,.24],[4,.10]],
  [[2,.32],[3,.33],[4,.23],[5,.12]],
];

/* 상자: 톡 누르면 물건이 쏟아진다. 상자끼리도 합쳐진다 */
const BOXES = [null,
  {name:'선물 상자', em:'🎁', n:3, lo:1, hi:3},
  {name:'큰 상자',   em:'📦', n:4, lo:2, hi:4},
  {name:'파티 상자', em:'🎊', n:5, lo:3, hi:5},
];

/* 교실 꾸미기 (동전으로 사거나 프로젝트 보상으로 설치) */
const DECOR = [
  {id:'clock',   name:'벽시계',      em:'🕰️', price:60,  wall:'right', t:0.72, h:78, sz:30},
  {id:'flag',    name:'태극기',      em:'🇰🇷', price:90,  wall:'right', t:0.10, h:84, sz:30},
  {id:'tv',      name:'텔레비전',    em:'📺', price:220, wall:'right', t:0.88, h:76, sz:32},
  {id:'notice',  name:'학급 게시판', em:'📋', price:120, wall:'left',  t:0.30, h:80, sz:30},
  {id:'frame',   name:'풍경 액자',   em:'🏞️', price:150, wall:'left',  t:0.66, h:82, sz:30},
  {id:'motto',   name:'급훈 족자',   em:'📜', price:180, wall:'left',  t:0.06, h:86, sz:30},
  {id:'plant',   name:'화분',        em:'🪴', price:50,  cell:[-1,1],  sz:34},
  {id:'sun',     name:'해바라기',    em:'🌻', price:80,  cell:[-1,4],  sz:32},
  {id:'fish',    name:'어항',        em:'🐠', price:200, cell:[-1,6],  sz:34},
  {id:'piano',   name:'풍금',        em:'🎹', price:320, cell:[0,-1],  sz:38},
  {id:'doll',    name:'인형 자리',   em:'🧸', price:110, cell:[3,-1],  sz:32},
  {id:'hamster', name:'햄스터 우리', em:'🐹', price:260, cell:[5,-1],  sz:32},
  {id:'ball',    name:'공 바구니',   em:'⚾', price:130, cell:[6,-1],  sz:32},
  {id:'party',   name:'파티 장식',   em:'🪅', price:170, cell:[-1,0],  sz:34},
  {id:'curtain', name:'창문 커튼',   em:'🪟', price:140, special:'curtain'},
  {id:'rug',     name:'모둠 깔개',   em:'🟧', price:240, special:'rug'},
];

/* 학급 프로젝트: 한 해의 큰 목표. 차례대로 열린다 */
const PROJECTS = [
  {em:'🧹', name:'첫날 교실 정리',   desc:'새 학기 첫날, 교실을 말끔히 정리해요.',
   need:[{c:'pen',l:3,n:2},{c:'book',l:3,n:1}],
   gen:'clean', size:6, box:1, xp:40, note:'🧺 청소함이 생기고 교실 자리가 넓어져요'},
  {em:'📚', name:'학급문고 만들기',   desc:'친구들이 함께 읽을 책을 모아요.',
   need:[{c:'book',l:5,n:1},{c:'pen',l:4,n:2}],
   decor:'clock', box:2, xp:70, note:'🕰️ 벽시계를 걸어요'},
  {em:'🍽️', name:'급식 준비 당번',   desc:'급식실에서 쓸 물건을 챙겨요.',
   need:[{c:'clean',l:5,n:1},{c:'book',l:4,n:2}],
   gen:'food', box:2, xp:110, note:'🍽️ 급식 카트가 생겨요'},
  {em:'♻️', name:'깨끗한 우리 교실', desc:'분리수거를 배우고 교실을 넓게 써요.',
   need:[{c:'clean',l:6,n:1},{c:'food',l:4,n:2}],
   decor:'notice', size:7, xp:160, note:'📋 게시판이 생기고 교실이 가장 넓어져요'},
  {em:'⚽', name:'가을 체육대회',     desc:'우리 반 응원 도구와 간식을 준비해요.',
   need:[{c:'food',l:6,n:1},{c:'pen',l:6,n:1}],
   gen:'sport', box:2, xp:220, note:'🎽 체육 창고가 생겨요'},
  {em:'📰', name:'학급 신문 만들기', desc:'한 학기 이야기를 신문으로 남겨요.',
   need:[{c:'book',l:7,n:1},{c:'sport',l:4,n:2}],
   decor:'tv', box:2, xp:300, note:'📺 텔레비전이 생겨요'},
  {em:'🎭', name:'겨울 학예회 준비', desc:'무대에 올릴 작품을 만들어요.',
   need:[{c:'sport',l:6,n:1},{c:'clean',l:6,n:1}],
   gen:'art', box:3, xp:400, note:'🎨 미술 준비실이 생겨요'},
  {em:'🖼️', name:'우리 반 전시회',   desc:'그림과 작품을 교실에 걸어요.',
   need:[{c:'art',l:6,n:1},{c:'food',l:7,n:1}],
   decor:'piano', store:4, xp:520, note:'🎹 풍금이 생기고 창고가 4칸 늘어요'},
  {em:'🎓', name:'졸업 앨범 만들기', desc:'한 해의 추억을 앨범에 담아요. 마지막 프로젝트!',
   need:[{c:'art',l:7,n:1},{c:'book',l:8,n:1},{c:'sport',l:7,n:1}],
   box:3, xp:800, note:'🏫 우리 반 이야기가 완성돼요'},
];

const NAMES = ['지우','하윤','서준','민서','도윤','예린','시우','수아','건우','채원','유진','태윤','나은','현서','주원'];
const FACES = ['🧒','👦','👧','🧑','👶'];
const SAYS = [
  '수업 준비물이 없어서 그래…','모둠 활동에 꼭 필요해!','내일 발표에 쓸 거야.',
  '선생님이 챙겨 오래.','같이 쓰면 좋겠다!','급하게 필요해 ㅠㅠ','내 것을 잃어버렸어…',
  '동아리 시간에 쓸 거야.','청소 시간에 필요해!','짝꿍이랑 같이 쓸래.','오늘 꼭 필요한데…',
];

/* ══ 2. 상태 · 저장 ═══════════════════════════════════════ */
const GRID = 7;                       // 교실은 최대 7×7
const SAVE_KEY = 'classroom-merge-v2';
const OLD_KEY  = 'classroom-merge-v1';
const ORDER_N  = 4;                   // 알림장 주문 칸 수
let state = null;

function chainMax(c){ return CHAINS[c].items.length; }
function value(l){ return 5 * Math.pow(2, l - 1); }          // 물건의 값어치
function sellPrice(it){
  if(it.c) return Math.round(value(it.l) * 0.5);
  if(it.b) return 30 * it.b * it.b;
  return 0;
}
function xpNeed(l){ return 50 + (l - 1) * 40; }
function storeMax(){ return Math.min(24, 12 + Math.floor(state.level / 4) * 2 + (state.storeBonus || 0)); }
function popularity(){ return state.decor.length * 3; }
function idx(x,y){ return y * GRID + x; }
function inGrid(x,y){ return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function isOpen(x,y){ return inGrid(x,y) && x < state.size && y < state.size; }
function cellAt(x,y){ return inGrid(x,y) ? state.board[idx(x,y)] : null; }
function openChains(){ return state.gens.slice(); }

function newState(){
  state = {
    v:2, coins:40, level:1, xp:0, size:5,
    board:new Array(GRID*GRID).fill(null),
    store:[], storeBonus:0,
    gens:['pen','book'],                 // 열린 생산기(=열린 사슬)
    decor:[], orders:[], seen:{}, proj:0,
    sound:true, tut:{}, merges:0, done:0
  };
  put(1,1,newGen('pen'));
  put(3,1,newGen('book'));
  put(2,2,{c:'pen',l:1});  put(3,2,{c:'pen',l:1});
  put(2,3,{c:'book',l:1}); put(1,3,{c:'book',l:2});
  put(0,4,{b:1});
  for(let i=0;i<ORDER_N;i++) state.orders.push(makeOrder());
  return state;
}
function newGen(k, t){
  const tier = t || 1;
  return {g:k, t:tier, ch:GEN_TIERS[tier-1].cap, at:Date.now()};
}
function put(x,y,it){
  state.board[idx(x,y)] = it;
  if(it && it.c) discover(it.c, it.l);
}
function discover(c,l){ if(!state.seen[c] || state.seen[c] < l) state.seen[c] = l; }

function save(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){}
}
function load(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const s = JSON.parse(raw);
    if(!s || !Array.isArray(s.board) || s.board.length !== GRID*GRID) return false;
    state = s;
    state.store = state.store || []; state.decor = state.decor || [];
    state.orders = state.orders || []; state.seen = state.seen || {};
    state.gens = state.gens || ['pen','book']; state.tut = state.tut || {};
    state.size = Math.max(5, Math.min(GRID, state.size || 5));
    state.proj = state.proj || 0; state.storeBonus = state.storeBonus || 0;
    if(typeof state.sound !== 'boolean') state.sound = true;
    while(state.orders.length < ORDER_N) state.orders.push(makeOrder());
    state.board.forEach(it => { if(it && it.g) regen(it); });
    return true;
  }catch(e){ return false; }
}

/* ══ 3. 생산기(충전) · 아이템 만들기 ═════════════════════ */
function genSpec(it){ return GEN_TIERS[it.t - 1]; }
function genName(it){ return genSpec(it).pre + GENS[it.g].base; }
function regen(g){                                     // 시간이 지난 만큼 충전 채우기
  const spec = genSpec(g), step = spec.sec * 1000, now = Date.now();
  if(g.ch >= spec.cap){ g.at = now; return; }
  while(g.ch < spec.cap && now - g.at >= step){ g.ch++; g.at += step; }
  if(g.ch >= spec.cap) g.at = now;
}
function regenAll(){ for(const it of state.board) if(it && it.g) regen(it); }
function nextChargeSec(g){
  const spec = genSpec(g);
  if(g.ch >= spec.cap) return 0;
  return Math.max(0, Math.ceil((spec.sec * 1000 - (Date.now() - g.at)) / 1000));
}
function rollDrop(t){
  let r = Math.random();
  for(const [l,p] of DROPS[t-1]){ r -= p; if(r <= 0) return l; }
  return 1;
}
function nearestEmpty(x,y){
  if(isOpen(x,y) && !state.board[idx(x,y)]) return idx(x,y);
  for(let r=1;r<state.size+2;r++){
    const cand = [];
    for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if(isOpen(nx,ny) && !state.board[idx(nx,ny)]) cand.push(idx(nx,ny));
    }
    if(cand.length) return cand[(Math.random()*cand.length)|0];
  }
  return -1;
}
function spawn(item, fromX, fromY){                    // 빈 자리에 물건 놓기
  const spot = nearestEmpty(fromX, fromY);
  if(spot < 0) return -1;
  state.board[spot] = item;
  if(item.c) discover(item.c, item.l);
  addPop(spot % GRID, (spot / GRID) | 0);
  return spot;
}
function useGen(i, g){
  regen(g);
  if(g.ch <= 0){
    sfx.no();
    say('⚡ 충전이 다 됐어요. ' + nextChargeSec(g) + '초 뒤에 하나 채워져요!');
    return;
  }
  const x = i % GRID, y = (i / GRID) | 0;
  if(nearestEmpty(x,y) < 0){
    sfx.no(); say('교실이 꽉 찼어요! 합치거나 창고(🎒)에 넣어 자리를 만들어요.');
    return;
  }
  if(g.ch >= genSpec(g).cap) g.at = Date.now();
  g.ch--;
  const chain = GENS[g.g].chain;
  const lv = Math.min(chainMax(chain), rollDrop(g.t));
  spawn({c:chain, l:lv}, x, y);
  sfx.gen();
  say(genName(g) + '에서 ' + CHAINS[chain].items[lv-1][1] + ' ' + CHAINS[chain].items[lv-1][0] + ' 이(가) 나왔어요!');
  if(!state.tut.merge){ state.tut.merge = 1; setTimeout(() => say('같은 물건 둘을 끌어다 겹치면 합쳐져요!'), 1800); }
  save();
}
function openBox(i, box){
  const x = i % GRID, y = (i / GRID) | 0;
  const spec = BOXES[box.b];
  state.board[i] = null;
  let made = 0;
  for(let j=0;j<spec.n;j++){
    const keys = openChains();
    const c = keys[(Math.random()*keys.length)|0];
    let l = spec.lo + Math.floor(Math.random() * (spec.hi - spec.lo + 1));
    l = Math.min(chainMax(c), l);
    const it = {c, l};
    if(Math.random() < 0.22){ it.w = 2; it.l = Math.min(chainMax(c), l + 1); }   // 가끔 포장된 좋은 물건
    if(spawn(it, x, y) < 0) break;
    made++;
  }
  addSpark(x,y); sfx.coin();
  say('🎁 ' + spec.name + '에서 물건 ' + made + '개가 나왔어요!');
  save();
}

/* ══ 4. 합치기 · 콤보 · 행운 ═════════════════════════════ */
let comboN = 0, comboAt = 0;
function canMerge(a,b){
  if(!a || !b) return false;
  if(a.w || b.w) return false;
  if(a.c && b.c) return a.c === b.c && a.l === b.l && a.l < chainMax(a.c);
  if(a.g && b.g) return a.g === b.g && a.t === b.t && a.t < GEN_TIERS.length;
  if(a.b && b.b) return a.b === b.b && a.b < BOXES.length - 1;
  return false;
}
function doMerge(from, to){
  const a = state.board[from], b = state.board[to];
  const tx = to % GRID, ty = (to / GRID) | 0;
  state.board[from] = null;
  state.merges++;

  if(a.c){                                            // 물건 합치기
    const nl = a.l + 1;
    state.board[to] = {c:a.c, l:nl};
    discover(a.c, nl);
    // 콤보
    const now2 = Date.now();
    comboN = (now2 - comboAt < 2600) ? comboN + 1 : 1;
    comboAt = now2;
    let gain = Math.round(value(nl) * 0.25);
    if(comboN >= 3){ gain = Math.round(gain * 1.5); }
    state.coins += gain;
    addXp(nl * 2);
    addPop(tx,ty); addSpark(tx,ty);
    addFloat(tx, ty, '+' + gain + '🪙', '#f0b429');
    sfx.merge();
    const nm = CHAINS[a.c].items[nl-1];
    if(Math.random() < 0.12 && nl < chainMax(a.c)){    // 행운 합치기: 하나 더!
      if(spawn({c:a.c, l:nl}, tx, ty) >= 0){
        addFloat(tx, ty, '행운! 하나 더', '#8b6cd6');
        toast('🍀 행운 합치기! ' + nm[0] + ' 이(가) 하나 더 생겼어요');
        sfx.lucky();
      }
    }
    if(comboN >= 3){ toast('🔥 콤보 x' + comboN + '! 동전을 더 받았어요'); }
    say(nl === chainMax(a.c)
      ? '🎉 ' + nm[1] + ' ' + nm[0] + ' 완성! 마지막 단계예요!'
      : nm[1] + ' ' + nm[0] + ' 이(가) 되었어요!');
    if(!state.tut.order){ state.tut.order = 1; setTimeout(() => say('📋 아래 알림장에서 친구들의 부탁을 확인해 보세요!'), 2200); }

  }else if(a.g){                                      // 생산기 합치기
    const nt = a.t + 1;
    const ng = {g:a.g, t:nt, ch:0, at:Date.now()};
    ng.ch = Math.min(GEN_TIERS[nt-1].cap, (a.ch||0) + (b.ch||0) + 3);
    state.board[to] = ng;
    addPop(tx,ty); addSpark(tx,ty);
    addXp(nt * 12);
    sfx.levelup();
    toast('⭐ ' + genName(ng) + ' (' + GEN_TIERS[nt-1].mark + ') 이(가) 되었어요! 충전 ' + GEN_TIERS[nt-1].cap + '칸');
    say('생산기가 커졌어요! 더 좋은 물건이 더 많이 나와요.');

  }else if(a.b){                                      // 상자 합치기
    const nb = a.b + 1;
    state.board[to] = {b:nb};
    addPop(tx,ty); addSpark(tx,ty);
    sfx.merge();
    say(BOXES[nb].em + ' ' + BOXES[nb].name + ' 이(가) 되었어요! 톡 눌러 열어 보세요.');
  }
  save();
}

/* ══ 5. 주문 · 프로젝트 · 창고 · 팔기 ════════════════════ */
function makeOrder(){
  const keys = openChains().slice().sort(() => Math.random() - 0.5);
  const kinds = (Math.random() < 0.3 && keys.length > 1) ? 2 : 1;
  const topL = Math.min(7, 2 + Math.floor(state.level / 2));
  const need = [];
  for(let i=0;i<kinds;i++){
    const c = keys[i];
    let l = 2 + Math.floor(Math.random() * (topL - 1));
    l = Math.min(chainMax(c) - 1, l);
    const n = l <= 2 ? (Math.random() < 0.4 ? 2 : 1) : 1;
    need.push({c, l, n});
  }
  let coins = 0, xp = 0;
  need.forEach(q => { coins += value(q.l) * q.n; xp += q.l * 5 * q.n; });
  const roll = Math.random();
  return {
    id: Math.random().toString(36).slice(2,9),
    who: NAMES[(Math.random()*NAMES.length)|0],
    face: FACES[(Math.random()*FACES.length)|0],
    say: SAYS[(Math.random()*SAYS.length)|0],
    need,
    coins: Math.round(coins * 0.8),
    xp,
    box: roll < 0.18 ? (Math.random() < 0.3 ? 2 : 1) : 0,
    charge: roll >= 0.18 && roll < 0.32,
  };
}
function countHave(c, l){                              // 교실 + 창고에서 세기
  let n = 0;
  for(const it of state.board) if(it && it.c === c && it.l === l && !it.w) n++;
  for(const it of state.store) if(it && it.c === c && it.l === l && !it.w) n++;
  return n;
}
function consume(c, l, n){                             // 교실 먼저, 모자라면 창고에서
  let left = n;
  for(let i=0;i<state.board.length && left>0;i++){
    const it = state.board[i];
    if(it && it.c === c && it.l === l && !it.w){ state.board[i] = null; addPop(i % GRID, (i/GRID)|0); left--; }
  }
  for(let i=state.store.length-1;i>=0 && left>0;i--){
    const it = state.store[i];
    if(it && it.c === c && it.l === l && !it.w){ state.store.splice(i,1); left--; }
  }
}
function orderReady(o){ return o.need.every(q => countHave(q.c, q.l) >= q.n); }
function orderCoins(o){ return Math.round(o.coins * (1 + popularity() / 100)); }
function deliver(o){
  if(!orderReady(o)){ sfx.no(); say('아직 물건이 모자라요. 합쳐서 만들어 보세요!'); return; }
  o.need.forEach(q => consume(q.c, q.l, q.n));
  const c = orderCoins(o);
  state.coins += c; state.done++;
  addFloat(Math.floor(state.size/2), Math.floor(state.size/2), '+' + c + '🪙', '#f0b429');
  if(o.box) spawn({b:o.box}, 2, 2);
  if(o.charge){
    let n = 0;
    for(const it of state.board) if(it && it.g){ const cap = genSpec(it).cap; if(it.ch < cap){ it.ch = Math.min(cap, it.ch + 4); n++; } }
    if(n) toast('⚡ 생산기 충전을 받았어요!');
  }
  addXp(o.xp);
  sfx.coin();
  say(o.who + ' 이(가) 고마워해요! 🪙' + c + ' 을(를) 받았어요.');
  state.orders[state.orders.indexOf(o)] = makeOrder();
  save(); refresh();
}
function skipOrder(o){
  const cost = 15;
  if(state.coins < cost){ sfx.no(); say('주문을 바꾸려면 🪙' + cost + ' 이 필요해요.'); return; }
  state.coins -= cost;
  state.orders[state.orders.indexOf(o)] = makeOrder();
  sfx.drop(); save(); refresh();
}

function curProject(){ return state.proj < PROJECTS.length ? PROJECTS[state.proj] : null; }
function projectReady(p){ return p.need.every(q => countHave(q.c, q.l) >= q.n); }
function finishProject(){
  const p = curProject();
  if(!p) return;
  if(!projectReady(p)){ sfx.no(); say('아직 준비물이 모자라요!'); return; }
  p.need.forEach(q => consume(q.c, q.l, q.n));
  state.proj++;
  if(p.gen && !state.gens.includes(p.gen)){
    state.gens.push(p.gen);
    const g = newGen(p.gen);
    if(spawn(g, 3, 3) < 0) state.store.push(g);
  }
  if(p.size) state.size = Math.max(state.size, p.size);
  if(p.decor && !state.decor.includes(p.decor)) state.decor.push(p.decor);
  if(p.store) state.storeBonus += p.store;
  if(p.box) spawn({b:p.box}, 2, 2);
  addXp(p.xp);
  sfx.levelup();
  toast('🎉 프로젝트 완성! ' + p.name + ' — ' + p.note);
  if(!view.user) resize();
  if(state.proj >= PROJECTS.length) setTimeout(() => toast('🏫 모든 프로젝트를 끝냈어요! 우리 반 최고!'), 2600);
  save(); refresh();
}

function toStore(i){
  const it = state.board[i];
  if(!it) return;
  if(state.store.length >= storeMax()){ sfx.no(); say('창고가 가득 찼어요! 먼저 꺼내거나 팔아 보세요.'); return; }
  state.store.push(it);
  state.board[i] = null;
  select(null);
  sfx.drop(); say('🎒 창고에 넣었어요. (' + state.store.length + '/' + storeMax() + ')');
  save(); refresh();
}
function fromStore(k){
  const it = state.store[k];
  if(!it) return;
  const half = Math.floor(state.size / 2);
  if(nearestEmpty(half, half) < 0){ sfx.no(); say('교실에 빈 자리가 없어요!'); return; }
  state.store.splice(k,1);
  spawn(it, half, half);
  sfx.drop(); say('창고에서 꺼냈어요!');
  save(); refresh(); renderStore();
}
function sellAt(i){
  const it = state.board[i];
  if(!it || it.g) return;
  const p = sellPrice(it);
  state.coins += p;
  state.board[i] = null;
  select(null);
  addFloat(i % GRID, (i/GRID)|0, '+' + p + '🪙', '#f0b429');
  sfx.coin(); say('🪙 ' + p + ' 을(를) 받고 팔았어요.');
  save(); refresh();
}

/* ══ 6. 소리 ══════════════════════════════════════════════ */
let actx = null;
function beep(freq, dur=0.09, type='sine', vol=0.05){
  if(!state.sound) return;
  try{
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol; o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  }catch(e){}
}
const sfx = {
  merge(){ beep(660,.07,'triangle',.06); setTimeout(()=>beep(990,.10,'triangle',.06),70); },
  lucky(){ [784,988,1175].forEach((f,i)=>setTimeout(()=>beep(f,.10,'triangle',.05), i*70)); },
  pick(){ beep(440,.04,'sine',.03); },
  drop(){ beep(330,.05,'sine',.035); },
  gen(){ beep(520,.06,'square',.03); },
  coin(){ beep(880,.06,'triangle',.05); setTimeout(()=>beep(1180,.10,'triangle',.05),60); },
  levelup(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.14,'triangle',.06), i*90)); },
  no(){ beep(180,.10,'sawtooth',.03); },
  tap(){ beep(300,.05,'square',.025); },
};

/* ══ 7. 캔버스 · 화면 계산 ═══════════════════════════════ */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stage = document.getElementById('stage');
const TW = 92, TH = 46, WALLH = 132;
const OX = (GRID + 2) * TW / 2, OY = WALLH + 62;
const WORLD_W = (GRID + 2) * TW, WORLD_H = OY + (GRID - 1) * TH + 96;
const view = {z:1, px:0, py:0, fit:1, tx:0, ty:0, user:false};
let CW = 0, CH = 0, DPR = 1;

function iso(x,y){ return {x: OX + (x - y) * TW/2, y: OY + (x + y) * TH/2}; }
function unIso(wx,wy){
  const a = (wx - OX) / (TW/2), b = (wy - OY) / (TH/2);
  return {x:(b + a) / 2, y:(b - a) / 2};
}
function resize(){
  const r = stage.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = Math.max(200, r.width); CH = Math.max(200, r.height);
  cv.width = CW * DPR; cv.height = CH * DPR;
  view.fit = Math.min(CW / WORLD_W, CH / WORLD_H);
  if(!view.user){
    const playW = (state.size + 1) * TW;
    const zW = (CW - 24) / (playW * view.fit);
    const zH = (CH - 16) / (WORLD_H * view.fit);
    view.z = Math.max(1, Math.min(1.8, zW, zH));
  }
  clampPan();
}
function scale(){ return view.fit * view.z; }
function clampPan(){
  const s = scale();
  const mx = Math.max(0, (WORLD_W * s - CW) / 2 + 40);
  const my = Math.max(0, (WORLD_H * s - CH) / 2 + 40);
  view.px = Math.max(-mx, Math.min(mx, view.px));
  view.py = Math.max(-my, Math.min(my, view.py));
  view.tx = (CW - WORLD_W * s) / 2 + view.px;
  view.ty = (CH - WORLD_H * s) / 2 + view.py;
}
function screenToWorld(sx,sy){ const s = scale(); return {x:(sx - view.tx)/s, y:(sy - view.ty)/s}; }

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';
const UI_FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
function emoji(ch, x, y, size){
  ctx.font = size + 'px ' + EMOJI_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(ch, x, y);
}
function diamond(x,y,w,h){
  ctx.beginPath();
  ctx.moveTo(x, y - h/2); ctx.lineTo(x + w/2, y); ctx.lineTo(x, y + h/2); ctx.lineTo(x - w/2, y);
  ctx.closePath();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

/* ══ 8. 애니메이션 · 캐릭터 ══════════════════════════════ */
let anims = [], now = 0;
function addPop(x,y){ anims.push({type:'pop', x, y, t0:now, dur:420}); }
function addFloat(x,y,txt,color){ anims.push({type:'float', x, y, txt, color, t0:now, dur:1050}); }
function addSpark(x,y){
  for(let i=0;i<9;i++){
    const a = Math.random()*Math.PI*2, sp = 40 + Math.random()*60;
    anims.push({type:'spark', x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 30, t0:now, dur:620});
  }
}
const hero = {x:2, y:2, tx:2, ty:2, wait:0, say:'', sayT:0};
function heroStep(dt){
  const dx = hero.tx - hero.x, dy = hero.ty - hero.y, d = Math.hypot(dx,dy);
  if(d < 0.05){
    hero.wait -= dt;
    if(hero.wait <= 0){
      hero.tx = Math.floor(Math.random() * state.size);
      hero.ty = Math.floor(Math.random() * state.size);
      hero.wait = 900 + Math.random() * 2800;
      if(Math.random() < 0.3){
        const lines = ['교실이 예뻐지고 있어!','합치면 더 좋아져~','오늘 급식 뭐지?','알림장 확인했어?','청소 시간이다!','우리 반 최고!','프로젝트 같이 하자!'];
        hero.say = lines[(Math.random()*lines.length)|0];
        hero.sayT = now + 2600;
      }
    }
  }else{
    const sp = 1.6 * dt / 1000;
    hero.x += dx / d * Math.min(sp, d);
    hero.y += dy / d * Math.min(sp, d);
  }
}

/* ══ 9. 그리기 ═══════════════════════════════════════════ */
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  const g = ctx.createLinearGradient(0,0,0,CH);
  g.addColorStop(0,'#e9f2ff'); g.addColorStop(.55,'#eef6ea'); g.addColorStop(1,'#e3eddc');
  ctx.fillStyle = g; ctx.fillRect(0,0,CW,CH);
  const s = scale();
  ctx.setTransform(DPR*s,0,0,DPR*s, view.tx*DPR, view.ty*DPR);

  drawSky();
  drawGround();
  drawWall('right'); drawWall('left');
  drawFloor();

  const list = [];
  DECOR.forEach(d => {
    if(!d.cell || !state.decor.includes(d.id)) return;
    const p = iso(d.cell[0], d.cell[1]);
    list.push({d:d.cell[0] + d.cell[1] - 0.4, f:() => { shadow(p.x,p.y,30); emoji(d.em, p.x, p.y + 8, d.sz); }});
  });
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    const it = state.board[idx(x,y)];
    if(!it) continue;
    if(drag && drag.from === idx(x,y) && drag.moved) continue;
    const p = iso(x,y);
    list.push({d:x + y, f:() => drawItem(p.x, p.y, it, popScale(x,y))});
  }
  {
    const p = iso(hero.x, hero.y);
    list.push({d:hero.x + hero.y + 0.1, f:() => {
      const moving = Math.hypot(hero.tx - hero.x, hero.ty - hero.y) > .05;
      const bob = Math.abs(Math.sin(now/160)) * (moving ? 4 : 1.2);
      shadow(p.x, p.y, 26);
      emoji('🧑‍🎓', p.x, p.y + 6 - bob, 40);
      if(hero.sayT > now) bubble(p.x, p.y - 48 - bob, hero.say);
    }});
  }
  list.sort((a,b) => a.d - b.d);
  list.forEach(o => o.f());

  drawYard();
  drawLocks();
  drawAnims();
  if(drag && drag.moved) drawDragGhost();
}
function drawSky(){
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  [[120,-58,60,19],[420,-116,80,23],[700,-30,52,16]].forEach(([x,y,w,h]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, w*0.6, h, 0, 0, Math.PI*2);
    ctx.ellipse(x - w*0.55, y + h*0.35, w*0.42, h*0.75, 0, 0, Math.PI*2);
    ctx.ellipse(x + w*0.55, y + h*0.35, w*0.46, h*0.8, 0, 0, Math.PI*2);
    ctx.fill();
  });
  ctx.restore();
}
function drawYard(){
  const em = ['🌼','🌿','🌷','🌿','🌻','🌿'];
  let i = 0;
  for(let y=-0.5;y<=GRID-0.4;y+=0.62){ const p = iso(GRID+0.18, y); emoji(em[i++ % em.length], p.x, p.y + 6, 18); }
  for(let x=GRID-0.4;x>=-0.5;x-=0.62){ const p = iso(x, GRID+0.18); emoji(em[i++ % em.length], p.x, p.y + 6, 18); }
}
function drawGround(){
  const c = iso((GRID-1)/2, (GRID-1)/2);
  ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = '#dbe7cf';
  diamond(c.x, c.y + 18, (GRID + 3.4) * TW, (GRID + 3.4) * TH); ctx.fill();
  ctx.restore();
}
function drawWall(side){
  const a = side === 'right' ? iso(-0.5,-0.5) : iso(-0.5, GRID - 0.5);
  const b = side === 'right' ? iso(GRID - 0.5, -0.5) : iso(-0.5, -0.5);
  const grd = ctx.createLinearGradient(0, a.y - WALLH, 0, Math.max(a.y, b.y));
  if(side === 'right'){ grd.addColorStop(0,'#fdf3e2'); grd.addColorStop(1,'#f2e0c6'); }
  else { grd.addColorStop(0,'#f6e9d6'); grd.addColorStop(1,'#e9d6b8'); }
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(b.x, b.y - WALLH); ctx.lineTo(a.x, a.y - WALLH);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = side === 'right' ? '#e7cfa9' : '#dcc39b';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - WALLH); ctx.lineTo(b.x, b.y - WALLH);
  ctx.lineTo(b.x, b.y - WALLH - 9); ctx.lineTo(a.x, a.y - WALLH - 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(150,110,70,.22)';
  ctx.beginPath();
  ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(b.x, b.y - 12); ctx.lineTo(a.x, a.y - 12);
  ctx.closePath(); ctx.fill();

  if(side === 'right') drawBlackboard(a,b); else drawWindows(a,b);

  DECOR.forEach(d => {
    if(d.wall !== side || !state.decor.includes(d.id)) return;
    const px = a.x + (b.x - a.x) * d.t, py = a.y + (b.y - a.y) * d.t;
    emoji(d.em, px, py - d.h, d.sz);
  });
}
function drawBlackboard(a,b){
  const t0 = 0.26, t1 = 0.62;
  const p0 = {x:a.x + (b.x-a.x)*t0, y:a.y + (b.y-a.y)*t0};
  const p1 = {x:a.x + (b.x-a.x)*t1, y:a.y + (b.y-a.y)*t1};
  const top = 104, bot = 34;
  ctx.fillStyle = '#7b5a35';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y - bot + 6); ctx.lineTo(p1.x, p1.y - bot + 6);
  ctx.lineTo(p1.x, p1.y - top - 6); ctx.lineTo(p0.x, p0.y - top - 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2f6b4f';
  ctx.beginPath();
  ctx.moveTo(p0.x + 5, p0.y - bot); ctx.lineTo(p1.x - 5, p1.y - bot);
  ctx.lineTo(p1.x - 5, p1.y - top); ctx.lineTo(p0.x + 5, p0.y - top);
  ctx.closePath(); ctx.fill();
  ctx.save();
  const mx = (p0.x + p1.x)/2, my = (p0.y + p1.y)/2 - (top + bot)/2;
  ctx.translate(mx,my);
  ctx.rotate(Math.atan2(p1.y - p0.y, p1.x - p0.x));
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = '700 17px ' + UI_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const p = curProject();
  ctx.fillText(p ? p.em + ' ' + p.name : '🏫 우리 반 이야기 완성!', 0, -12);
  ctx.font = '700 13px ' + UI_FONT;
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.fillText('Lv.' + state.level + '  인기 ' + popularity() + '%', 0, 10);
  ctx.restore();
}
function drawWindows(a,b){
  const has = state.decor.includes('curtain');
  for(let i=0;i<3;i++){
    const t0 = 0.16 + i*0.26, t1 = t0 + 0.17;
    const p0 = {x:a.x + (b.x-a.x)*t0, y:a.y + (b.y-a.y)*t0};
    const p1 = {x:a.x + (b.x-a.x)*t1, y:a.y + (b.y-a.y)*t1};
    const top = 108, bot = 44;
    ctx.fillStyle = '#cfd9e8';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y - bot); ctx.lineTo(p1.x, p1.y - bot);
    ctx.lineTo(p1.x, p1.y - top); ctx.lineTo(p0.x, p0.y - top);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bfe0f5';
    ctx.beginPath();
    ctx.moveTo(p0.x + 4, p0.y - bot - 4); ctx.lineTo(p1.x - 4, p1.y - bot - 4);
    ctx.lineTo(p1.x - 4, p1.y - top + 4); ctx.lineTo(p0.x + 4, p0.y - top + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo((p0.x+p1.x)/2, (p0.y+p1.y)/2 - bot - 4);
    ctx.lineTo((p0.x+p1.x)/2, (p0.y+p1.y)/2 - top + 4);
    ctx.stroke();
    if(has){
      ctx.fillStyle = 'rgba(240,140,110,.75)';
      ctx.beginPath();
      ctx.moveTo(p0.x + 2, p0.y - top + 2); ctx.lineTo(p0.x + 16, p0.y - top + 8);
      ctx.lineTo(p0.x + 16, p0.y - bot - 2); ctx.lineTo(p0.x + 2, p0.y - bot - 8);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(p1.x - 2, p1.y - top + 2); ctx.lineTo(p1.x - 16, p1.y - top + 8);
      ctx.lineTo(p1.x - 16, p1.y - bot - 2); ctx.lineTo(p1.x - 2, p1.y - bot - 8);
      ctx.closePath(); ctx.fill();
    }
  }
}
function drawFloor(){
  const f0 = iso(-0.5, GRID - 0.5), f1 = iso(GRID - 0.5, GRID - 0.5), f2 = iso(GRID - 0.5, -0.5);
  ctx.fillStyle = '#d8b98d';
  ctx.beginPath();
  ctx.moveTo(f0.x,f0.y); ctx.lineTo(f1.x,f1.y); ctx.lineTo(f2.x,f2.y);
  ctx.lineTo(f2.x, f2.y + 13); ctx.lineTo(f1.x, f1.y + 13); ctx.lineTo(f0.x, f0.y + 13);
  ctx.closePath(); ctx.fill();

  const rug = state.decor.includes('rug');
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    const p = iso(x,y), open = x < state.size && y < state.size;
    let col = ((x + y) % 2 === 0) ? '#f6e4c6' : '#efd8b3';
    if(!open) col = ((x + y) % 2 === 0) ? '#e0d5c4' : '#d8ccba';
    if(rug && open && x >= 1 && x <= 3 && y >= 1 && y <= 3) col = ((x+y)%2===0) ? '#f2b98a' : '#eaa877';
    ctx.fillStyle = col;
    diamond(p.x, p.y, TW, TH); ctx.fill();
    ctx.strokeStyle = open ? 'rgba(160,120,70,.16)' : 'rgba(90,80,70,.18)';
    ctx.lineWidth = 1; ctx.stroke();
  }
  if(sel !== null && sel >= 0 && state.board[sel]){          // 고른 물건 표시
    const p = iso(sel % GRID, (sel / GRID) | 0);
    ctx.save();
    ctx.strokeStyle = '#e8894a'; ctx.lineWidth = 3;
    ctx.setLineDash([7,5]); ctx.lineDashOffset = -now/60;
    diamond(p.x, p.y, TW - 6, TH - 3); ctx.stroke();
    ctx.restore();
  }
  if(drag && drag.moved && drag.over && isOpen(drag.over.x, drag.over.y)){
    const p = iso(drag.over.x, drag.over.y);
    const can = canMerge(drag.item, cellAt(drag.over.x, drag.over.y));
    ctx.save();
    ctx.fillStyle = can ? 'rgba(74,169,114,.35)' : 'rgba(232,137,74,.28)';
    diamond(p.x, p.y, TW - 4, TH - 2); ctx.fill();
    ctx.strokeStyle = can ? '#4aa972' : '#e8894a'; ctx.lineWidth = 2.5;
    diamond(p.x, p.y, TW - 4, TH - 2); ctx.stroke();
    ctx.restore();
  }
}
function drawLocks(){
  const n = state.size;
  if(n >= GRID) return;
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    if(x < n && y < n) continue;
    if((x === n && y <= n) || (y === n && x <= n)){
      const p = iso(x,y);
      ctx.globalAlpha = .55; emoji('🔒', p.x, p.y + 8, 19); ctx.globalAlpha = 1;
    }
  }
}
function shadow(x,y,w){
  ctx.save();
  ctx.fillStyle = 'rgba(120,90,60,.20)';
  ctx.beginPath(); ctx.ellipse(x, y + 9, w/2, w/5.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}
function popScale(x,y){
  let sc = 1;
  for(const a of anims){
    if(a.type === 'pop' && a.x === x && a.y === y){
      const t = (now - a.t0) / a.dur;
      if(t >= 0 && t <= 1) sc = 1 + Math.sin(t * Math.PI) * 0.42;
    }
  }
  return sc;
}
function drawItem(cx, cy, it, sc){
  sc = sc || 1;
  ctx.save();
  ctx.translate(cx,cy); ctx.scale(sc,sc); ctx.translate(-cx,-cy);
  if(it.g){                                         // ── 생산기
    const G = GENS[it.g], spec = genSpec(it);
    const ready = it.ch > 0;
    shadow(cx, cy, 48);
    ctx.fillStyle = ready ? 'rgba(255,255,255,.88)' : 'rgba(228,222,214,.85)';
    diamond(cx, cy + 4, TW - 14, TH - 8); ctx.fill();
    ctx.strokeStyle = spec.ring;
    ctx.lineWidth = 2.4 + (ready ? Math.abs(Math.sin(now/420)) * 1.6 : 0);
    diamond(cx, cy + 4, TW - 14, TH - 8); ctx.stroke();
    emoji(G.em, cx, cy + 6, 40);
    badge(cx + 20, cy - 15, '⚡' + it.ch, ready ? '#3a2f28' : '#b0a196');
    badge(cx - 21, cy - 15, spec.mark, spec.ring);
    if(!ready){
      ctx.font = '700 11px ' + UI_FONT;
      ctx.textAlign = 'center'; ctx.fillStyle = '#8b7d72';
      ctx.fillText(nextChargeSec(it) + '초', cx, cy + 24);
    }
  }else if(it.b){                                   // ── 상자
    const spec = BOXES[it.b];
    shadow(cx, cy, 42);
    const bob = Math.sin(now/300) * 3;
    emoji(spec.em, cx, cy + 6 + bob, 40);
    badge(cx + 18, cy - 13, String(it.b), '#8b6cd6');
  }else if(it.c){                                   // ── 물건
    const C = CHAINS[it.c], info = C.items[it.l - 1];
    shadow(cx, cy, 36);
    if(it.w){                                       // 포장된 물건
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      diamond(cx, cy + 4, TW - 20, TH - 12); ctx.fill();
      emoji('🎀', cx, cy + 10, 34);
      badge(cx + 16, cy - 12, '톡 ' + it.w, '#e05a5a');
    }else{
      emoji(info[1], cx, cy + 7, 36);
      badge(cx + 17, cy - 12, String(it.l), C.color);
    }
  }
  ctx.restore();
}
function badge(x, y, txt, color){
  ctx.font = '700 11px ' + UI_FONT;
  const w = Math.max(17, ctx.measureText(txt).width + 9);
  ctx.fillStyle = color;
  roundRect(x - w/2, y - 8, w, 16, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y + 1);
  ctx.textBaseline = 'alphabetic';
}
function bubble(x, y, txt){
  ctx.font = '700 13px ' + UI_FONT;
  const w = ctx.measureText(txt).width + 20;
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  roundRect(x - w/2, y - 26, w, 26, 13); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 1); ctx.lineTo(x, y + 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2f28'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y - 13);
  ctx.textBaseline = 'alphabetic';
}
function drawAnims(){
  anims = anims.filter(a => now - a.t0 < a.dur);
  for(const a of anims){
    const t = (now - a.t0) / a.dur;
    if(a.type === 'float'){
      const p = iso(a.x, a.y);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.font = '800 17px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(a.txt, p.x, p.y - 22 - t * 36);
      ctx.fillStyle = a.color;
      ctx.fillText(a.txt, p.x, p.y - 22 - t * 36);
      ctx.restore();
    }else if(a.type === 'spark'){
      const p = iso(a.x, a.y), tt = t * a.dur / 1000;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffd873';
      ctx.beginPath();
      ctx.arc(p.x + a.vx*tt, p.y - 6 + a.vy*tt + 120*tt*tt, 3.4*(1-t) + 1, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}
function drawDragGhost(){
  const w = screenToWorld(drag.sx, drag.sy);
  ctx.save(); ctx.globalAlpha = .92;
  drawItem(w.x, w.y - 14, drag.item, 1.16);
  ctx.restore();
}

/* ══ 10. 입력 ════════════════════════════════════════════ */
let drag = null, pan = null, sel = null;
function pointerCell(ev){
  const r = cv.getBoundingClientRect();
  const w = screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
  const c = unIso(w.x, w.y);
  return {x:Math.round(c.x), y:Math.round(c.y), sx:ev.clientX - r.left, sy:ev.clientY - r.top};
}
cv.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  try{ cv.setPointerCapture(ev.pointerId); }catch(e){}
  const c = pointerCell(ev);
  const it = isOpen(c.x, c.y) ? cellAt(c.x, c.y) : null;
  if(it) drag = {from:idx(c.x,c.y), item:it, sx:c.sx, sy:c.sy, x0:c.sx, y0:c.sy, moved:false, over:{x:c.x,y:c.y}};
  else pan = {sx:ev.clientX, sy:ev.clientY, px:view.px, py:view.py};
});
cv.addEventListener('pointermove', ev => {
  if(drag){
    const c = pointerCell(ev);
    drag.sx = c.sx; drag.sy = c.sy; drag.over = {x:c.x, y:c.y};
    if(!drag.moved && Math.hypot(c.sx - drag.x0, c.sy - drag.y0) > 7){ drag.moved = true; sfx.pick(); }
  }else if(pan){
    view.px = pan.px + (ev.clientX - pan.sx);
    view.py = pan.py + (ev.clientY - pan.sy);
    clampPan();
  }
});
function endPointer(){
  if(drag){
    const d = drag; drag = null;
    if(!d.moved) tapCell(d.from, d.item);
    else if(d.over && isOpen(d.over.x, d.over.y)) dropOn(d, idx(d.over.x, d.over.y));
    refresh();
  }else if(pan){
    // 빈 곳을 눌렀으면 고른 물건 해제
    if(Math.abs(view.px - pan.px) < 4 && Math.abs(view.py - pan.py) < 4) select(null);
  }
  pan = null;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  view.user = true;
  view.z = Math.max(0.7, Math.min(2.4, view.z * (e.deltaY < 0 ? 1.1 : 0.9)));
  clampPan();
}, {passive:false});

function dropOn(d, to){
  if(to === d.from) return;
  const a = d.item, b = state.board[to];
  if(!b){ state.board[to] = a; state.board[d.from] = null; sfx.drop(); if(sel === d.from) select(to); }
  else if(canMerge(a,b)){ doMerge(d.from, to); select(null); }
  else { state.board[to] = a; state.board[d.from] = b; sfx.drop(); select(null); }
  save();
}
function tapCell(i, it){
  if(it.g){ useGen(i, it); select(null); return; }
  if(it.b){ openBox(i, it); select(null); return; }
  if(it.w){                                          // 포장 풀기
    it.w--;
    sfx.tap(); addPop(i % GRID, (i/GRID)|0);
    if(it.w <= 0){
      delete it.w;
      discover(it.c, it.l);
      addSpark(i % GRID, (i/GRID)|0); sfx.coin();
      const info = CHAINS[it.c].items[it.l-1];
      say('🎀 포장을 풀었어요 — ' + info[1] + ' ' + info[0] + '!');
    }else say('톡톡! ' + it.w + '번 더 누르면 풀려요.');
    save(); return;
  }
  select(i);
  sfx.pick();
}
function select(i){
  sel = (i === null || i === undefined) ? null : i;
  renderInfo();
}

/* ══ 11. 경험치 · 레벨 ═══════════════════════════════════ */
function addXp(n){
  state.xp += n;
  while(state.xp >= xpNeed(state.level)){
    state.xp -= xpNeed(state.level);
    state.level++;
    onLevelUp();
  }
}
function onLevelUp(){
  sfx.levelup();
  let msg = '🎉 레벨 ' + state.level + ' 이 되었어요!';
  for(const it of state.board) if(it && it.g){ const cap = genSpec(it).cap; it.ch = Math.min(cap, it.ch + 5); }
  msg += ' 생산기 충전을 받았어요.';
  if(state.level % 4 === 0) msg += ' 🎒 창고가 넓어졌어요!';
  if(spawn({b: state.level >= 8 ? 2 : 1}, 2, 2) >= 0) msg += ' 선물 상자도 받았어요!';
  toast(msg); say(msg);
}

/* ══ 12. UI 갱신 ═════════════════════════════════════════ */
const $ = id => document.getElementById(id);
function refresh(){
  $('coins').textContent = state.coins;
  $('lv').textContent = state.level;
  $('xptxt').textContent = state.xp + '/' + xpNeed(state.level);
  $('xpbar').style.width = Math.min(100, state.xp / xpNeed(state.level) * 100) + '%';
  $('storeDot').textContent = state.store.length;
  $('storeDot').style.display = state.store.length ? 'flex' : 'none';
  renderOrders();
  renderProject();
  renderInfo();
}
function renderOrders(){
  const box = $('orders');
  box.innerHTML = '';
  let ready = 0;
  state.orders.forEach(o => {
    const ok = orderReady(o);
    if(ok) ready++;
    const el = document.createElement('div');
    el.className = 'order' + (ok ? ' ready' : '');
    const needs = o.need.map(q => {
      const have = countHave(q.c, q.l), done = have >= q.n;
      const info = CHAINS[q.c].items[q.l-1];
      return '<div class="need' + (done ? ' ok' : '') + '" title="' + info[0] + '">' +
             '<span class="em">' + info[1] + '</span>' +
             '<span>' + Math.min(have, q.n) + '/' + q.n + '</span>' +
             '<span class="lv">Lv' + q.l + '</span></div>';
    }).join('');
    el.innerHTML =
      '<button class="skip" title="다른 주문으로 바꾸기(🪙15)">✕</button>' +
      '<div class="who"><span class="face">' + o.face + '</span>' + o.who + '</div>' +
      '<div class="say">' + o.say + '</div>' +
      '<div class="needs">' + needs + '</div>' +
      '<div class="bottom"><div class="reward">🪙' + orderCoins(o) + ' · <b>+' + o.xp + 'xp</b>' +
      (o.box ? ' ' + BOXES[o.box].em : '') + (o.charge ? ' ⚡' : '') + '</div>' +
      '<button class="give' + (ok ? ' on' : '') + '">주기</button></div>';
    el.querySelector('.give').onclick = () => deliver(o);
    el.querySelector('.skip').onclick = () => skipOrder(o);
    box.appendChild(el);
  });
  $('orderReadyN').textContent = ready;
  $('orderReadyN').style.display = ready ? 'inline-block' : 'none';
}
function renderProject(){
  const box = $('projectBox');
  const p = curProject();
  $('projN').textContent = Math.min(state.proj + 1, PROJECTS.length);
  if(!p){
    box.innerHTML = '<div class="project"><div class="pem">🏫</div><div class="pbody">' +
      '<div class="pt">모든 프로젝트 완성!</div>' +
      '<div class="pd">우리 반 한 해 이야기를 모두 마쳤어요. 이제 마음껏 교실을 꾸며 보세요!</div>' +
      '</div></div>';
    return;
  }
  const ok = projectReady(p);
  const needs = p.need.map(q => {
    const have = countHave(q.c, q.l), done = have >= q.n;
    const info = CHAINS[q.c].items[q.l-1];
    return '<div class="need' + (done ? ' ok' : '') + '"><span class="em">' + info[1] + '</span>' +
           '<span>' + Math.min(have, q.n) + '/' + q.n + '</span><span class="lv">Lv' + q.l + '</span></div>';
  }).join('');
  box.innerHTML =
    '<div class="project"><div class="pem">' + p.em + '</div><div class="pbody">' +
    '<div class="pt">' + p.name + ' <small>' + (state.proj + 1) + ' / ' + PROJECTS.length + '</small></div>' +
    '<div class="pd">' + p.desc + '</div>' +
    '<div class="needs">' + needs + '</div>' +
    '<div class="bottom"><div class="pr">🎁 ' + p.note + ' · +' + p.xp + 'xp</div>' +
    '<button class="give' + (ok ? ' on' : '') + '" id="projBtn">완성하기</button></div>' +
    '</div></div>';
  const btn = $('projBtn');
  if(btn) btn.onclick = finishProject;
}
function renderInfo(){
  const bar = $('infobar');
  const it = (sel !== null && sel >= 0) ? state.board[sel] : null;
  if(!it || it.g){ bar.classList.remove('on'); return; }
  bar.classList.add('on');
  if(it.c){
    const C = CHAINS[it.c], info = C.items[it.l-1];
    $('infoEm').textContent = it.w ? '🎀' : info[1];
    $('infoName').textContent = info[0] + ' (Lv.' + it.l + ' / ' + chainMax(it.c) + ')';
    $('infoSub').textContent = it.w
      ? '리본을 ' + it.w + '번 더 톡톡 누르면 풀려요'
      : (it.l < chainMax(it.c)
          ? '둘을 합치면 → ' + C.items[it.l][1] + ' ' + C.items[it.l][0]
          : C.name + ' 사슬의 마지막 단계예요!');
  }else if(it.b){
    const spec = BOXES[it.b];
    $('infoEm').textContent = spec.em;
    $('infoName').textContent = spec.name;
    $('infoSub').textContent = '톡 누르면 물건 ' + spec.n + '개가 나와요';
  }
  $('infoSell').textContent = '🪙 ' + sellPrice(it);
}
function renderStore(){
  const g = $('storeGrid');
  const cap = storeMax();
  $('storeCap').textContent = '(' + state.store.length + '/' + cap + '칸)';
  g.innerHTML = '';
  for(let i=0;i<cap;i++){
    const it = state.store[i];
    const el = document.createElement('div');
    el.className = 'slot' + (it ? ' full' : '');
    if(it){
      let em = '❔', lv = '';
      if(it.c){ em = it.w ? '🎀' : CHAINS[it.c].items[it.l-1][1]; lv = 'Lv' + it.l; }
      else if(it.b){ em = BOXES[it.b].em; lv = '상자'; }
      else if(it.g){ em = GENS[it.g].em; lv = genSpec(it).mark; }
      el.innerHTML = '<span class="em">' + em + '</span><span class="lv">' + lv + '</span>';
      el.onclick = () => fromStore(i);
    }
    g.appendChild(el);
  }
}
function renderShop(){
  const g = $('shopGrid');
  g.innerHTML = '';
  DECOR.slice().sort((a,b) => a.price - b.price).forEach(d => {
    const owned = state.decor.includes(d.id);
    const can = state.coins >= d.price;
    const el = document.createElement('div');
    el.className = 'shopitem' + (owned ? ' owned' : '');
    el.innerHTML = '<div class="em">' + d.em + '</div><div class="nm">' + d.name + '</div>' +
      '<button ' + (owned || !can ? 'disabled' : '') + '>' + (owned ? '설치됨 ✓' : '🪙 ' + d.price) + '</button>';
    if(!owned && can) el.querySelector('button').onclick = () => buy(d);
    g.appendChild(el);
  });
}
function buy(d){
  if(state.coins < d.price || state.decor.includes(d.id)) return;
  state.coins -= d.price;
  state.decor.push(d.id);
  sfx.coin();
  toast(d.em + ' ' + d.name + ' 을(를) 교실에 놓았어요! 인기 +3%');
  save(); refresh(); renderShop();
}
function bestSeen(c){
  let best = state.seen[c] || 0;
  for(const it of state.board) if(it && it.c === c && !it.w) best = Math.max(best, it.l);
  for(const it of state.store) if(it && it.c === c && !it.w) best = Math.max(best, it.l);
  return best;
}
function renderGuide(){
  const g = $('guideBox');
  g.innerHTML = '';
  CHAIN_KEYS.forEach(c => {
    const C = CHAINS[c], best = bestSeen(c), open = state.gens.includes(c);
    const line = C.items.map((it,i) => '<span style="opacity:' + (i < best ? 1 : .2) + '">' + it[1] + '</span>').join('');
    const el = document.createElement('div');
    el.className = 'chainbox';
    el.innerHTML =
      '<div class="cn"><span>' + C.name + (open ? '' : ' 🔒 아직 안 열림') + '</span>' +
      '<span>' + Math.max(best,0) + ' / ' + C.items.length + '단계</span></div>' +
      '<div class="cl">' + line + '</div>' +
      '<div class="cn" style="font-weight:700;margin-top:3px">' +
      C.items.map((it,i) => (i < best ? it[0] : '???')).join(' › ') + '</div>';
    g.appendChild(el);
  });
  const st = document.createElement('p');
  st.className = 'sub'; st.style.marginTop = '10px';
  st.innerHTML = '합친 횟수 <b>' + state.merges + '</b>번 · 들어준 부탁 <b>' + state.done + '</b>개 · ' +
    '끝낸 프로젝트 <b>' + state.proj + '</b>개 · 꾸민 물건 <b>' + state.decor.length + '</b>개';
  g.appendChild(st);
}

/* 안내 문구 · 알림 */
let hintT = 0, toastT = 0;
function say(txt){
  const h = $('hint');
  h.textContent = txt; h.classList.add('on');
  clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.remove('on'), 2600);
}
function toast(txt){
  const t = $('toast');
  t.textContent = txt; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2800);
}

/* 모달 · 버튼 */
function openModal(id){ $(id).classList.add('on'); }
function closeModal(id){ $(id).classList.remove('on'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
document.querySelectorAll('.modal').forEach(m => m.onclick = e => { if(e.target === m) m.classList.remove('on'); });
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === t.dataset.pane));
});
$('btnShop').onclick  = () => { renderShop(); openModal('mShop'); };
$('btnStore').onclick = () => { renderStore(); openModal('mStore'); };
$('btnGuide').onclick = () => { renderGuide(); openModal('mGuide'); };
$('btnHelp').onclick  = () => openModal('mHelp');
$('btnSound').onclick = () => {
  state.sound = !state.sound;
  $('btnSound').textContent = state.sound ? '🔊' : '🔇';
  if(state.sound) sfx.pick();
  save();
};
$('btnZoomIn').onclick  = () => { view.user = true; view.z = Math.min(2.4, view.z * 1.25); clampPan(); };
$('btnZoomOut').onclick = () => { view.user = true; view.z = Math.max(0.7, view.z / 1.25); clampPan(); };
$('btnFit').onclick     = () => { view.user = false; view.px = 0; view.py = 0; resize(); };
$('infoStore').onclick  = () => { if(sel !== null) toStore(sel); };
$('infoSell').onclick   = () => { if(sel !== null) sellAt(sel); };
$('infoClose').onclick  = () => select(null);
$('btnReset').onclick = () => {
  if(!confirm('정말 처음부터 다시 시작할까요? 지금까지 꾸민 교실이 모두 사라져요.')) return;
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  newState(); save(); closeModal('mHelp');
  select(null); if(!view.user) resize();
  refresh(); toast('새 교실을 시작했어요!');
};

/* ══ 13. 시작 · 루프 ═════════════════════════════════════ */
let hadOld = false;
try{ hadOld = !!localStorage.getItem(OLD_KEY); }catch(e){}
if(!load()){
  newState();
  if(hadOld){
    try{ localStorage.removeItem(OLD_KEY); }catch(e){}
    setTimeout(() => toast('게임이 크게 새로워졌어요! 새 교실에서 다시 시작해요 🎉'), 900);
  }
}
save();
$('btnSound').textContent = state.sound ? '🔊' : '🔇';
resize();
if(window.ResizeObserver) new ResizeObserver(resize).observe(stage);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

let last = performance.now(), tick = 0;
function loop(t){
  now = t;
  const dt = Math.min(64, t - last); last = t;
  regenAll();
  heroStep(dt);
  draw();
  tick += dt;
  if(tick > 450){ tick = 0; refresh(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
refresh();
setInterval(save, 10000);
document.addEventListener('visibilitychange', () => { if(document.hidden) save(); });
window.addEventListener('pagehide', save);
setTimeout(() => say('🗄️ 사물함을 톡 눌러 물건을 꺼내 보세요!'), 700);
`;
const MASCOT_B64 = "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";

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
