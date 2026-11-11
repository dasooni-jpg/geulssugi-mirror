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

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#3a2616" />
<meta name="description" content="다람 대장과 친구들이 도토리 숲을 되찾는 3D 원정 게임" />
<title>🌰 다람 원정대</title>
<style>
/* ══════════════════════════════════════════════════════════
   다람 원정대 — 화면 스타일
   외부 라이브러리·CDN·글꼴을 전혀 쓰지 않습니다(학교 망 차단 대비).
   ══════════════════════════════════════════════════════════ */
:root{
  --ink:#3a2616;          /* 글자: 짙은 밤색 */
  --ink-2:#6b4a2f;
  --cream:#fff6e0;
  --panel:#fffaf0;
  --line:#e6cf9c;
  --brand:#8a5cf5;        /* 다람쌤 후드티 보라 */
  --brand-d:#6a3fd6;
  --acorn:#c9813a;
  --gold:#ffc533;
  --green:#4fb364;
  --red:#ff6b5e;
  --radius:20px;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;height:100%;overflow:hidden;overscroll-behavior:none}
body{
  word-break:keep-all;
  font-family:"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,-apple-system,sans-serif;
  background:#2c3b24; color:var(--ink);
  -webkit-font-smoothing:antialiased; touch-action:none;
  -webkit-user-select:none; user-select:none;
  font-variant-numeric:tabular-nums;
}
button{font-family:inherit;cursor:pointer;color:inherit}
button:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
.hidden{display:none !important}

/* ─────────── 3D 화면 ─────────── */
#stage{position:fixed;inset:0;background:#2c3b24}
#gl,#ov{position:absolute;inset:0;display:block;width:100%;height:100%}
#ov{pointer-events:none}

/* 화면이 준비되지 않았을 때(웹지엘 미지원) */
#nogl{
  position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:14px;text-align:center;padding:30px;background:#3a2616;color:#fff6e0;z-index:99
}
#nogl h2{margin:0;font-size:22px}
#nogl p{margin:0;font-size:15px;line-height:1.7;max-width:420px;opacity:.85}

/* ══════════════ HUD (놀이 중 화면 표시) ══════════════ */
#hud{position:fixed;inset:0;pointer-events:none;z-index:10;
  padding-top:calc(10px + env(safe-area-inset-top, 0px));padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px));
  padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));
  font-weight:900}
#hud.off{display:none}
.hud-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.pill{
  display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 16px 0 10px;
  background:rgba(255,250,240,.94);border:3px solid #7a5230;border-radius:999px;
  box-shadow:0 4px 0 rgba(58,38,22,.35);font-size:22px;color:var(--ink);white-space:nowrap
}
.pill svg{width:28px;height:28px;flex:none}
.pill.sm{height:38px;font-size:16px;padding:0 12px 0 9px;border-width:2.5px;gap:5px}
.pill.sm svg{width:20px;height:20px}
.pill.bump{animation:bump .28s ease-out}
@keyframes bump{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
.hud-right{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.rbtn{
  pointer-events:auto;width:40px;height:40px;border-radius:50%;border:2.5px solid #7a5230;
  background:rgba(255,250,240,.94);font-size:18px;line-height:1;padding:0;
  box-shadow:0 3px 0 rgba(58,38,22,.35)
}
.rbtn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(58,38,22,.35)}

/* 가운데 위: 원정 진행도 (진지 → 둥지 … → 대장) */
#track{
  display:flex;align-items:center;gap:0;height:38px;padding:0 12px;margin-top:3px;
  background:rgba(58,38,22,.55);border-radius:999px;backdrop-filter:blur(3px)
}
#track .nd{
  width:24px;height:24px;border-radius:50%;background:#5d4a3a;border:2.5px solid #2c1d10;
  display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;color:#fff
}
#track .nd.on{background:var(--green);border-color:#fff}
#track .nd.now{background:var(--gold);border-color:#fff;animation:pulse 1s ease-in-out infinite}
#track .nd.boss{width:30px;height:30px;font-size:16px}
#track .ln{width:18px;height:5px;background:#5d4a3a}
#track .ln.on{background:var(--green)}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}

/* 우두머리 체력 막대 */
#boss{position:absolute;left:50%;top:calc(62px + env(safe-area-inset-top, 0px));transform:translateX(-50%);
  width:min(440px,70vw);text-align:center}
#boss .bn{font-size:15px;color:#fff;text-shadow:0 2px 0 #3a2616,0 0 6px rgba(0,0,0,.6);margin-bottom:3px}
#boss .bbar{height:16px;border-radius:999px;background:rgba(40,20,40,.75);border:2.5px solid #fff;overflow:hidden}
#boss .bbar i{display:block;height:100%;width:100%;background:linear-gradient(#ff8a7a,#e8433a);transition:width .15s linear}

/* 알림(가운데 위에서 내려오는 띠) */
#toast{position:absolute;left:50%;top:calc(104px + env(safe-area-inset-top, 0px));transform:translateX(-50%);
  display:flex;flex-direction:column;align-items:center;gap:6px;width:calc(100% - 32px);pointer-events:none}
.toast{
  padding:9px 20px;border-radius:999px;background:rgba(58,38,22,.9);color:#fff6e0;font-size:17px;
  border:2.5px solid #ffd77a;box-shadow:0 4px 12px rgba(0,0,0,.3);text-align:center;
  animation:toastIn .3s cubic-bezier(.2,1.4,.4,1) both
}
.toast.big{font-size:24px;padding:12px 28px;background:linear-gradient(#9b6bff,#6a3fd6);border-color:#fff}
.toast.out{animation:toastOut .35s ease-in both}
@keyframes toastIn{from{opacity:0;transform:translateY(-16px) scale(.8)}to{opacity:1;transform:none}}
@keyframes toastOut{to{opacity:0;transform:translateY(-10px)}}

/* 아래쪽 도움말 */
#hint{position:absolute;left:50%;bottom:calc(26px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);
  max-width:calc(100% - 32px);width:max-content;padding:10px 20px;border-radius:16px;background:rgba(255,250,240,.93);
  border:3px solid #7a5230;font-size:17px;text-align:center;line-height:1.35;
  box-shadow:0 4px 0 rgba(58,38,22,.3);transition:opacity .3s}
#hint.off{opacity:0}

/* 쓰러졌을 때 */
#down{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(40,25,60,.45);backdrop-filter:blur(2px)}
#down div{padding:18px 30px;border-radius:22px;background:var(--panel);border:4px solid #7a5230;
  font-size:22px;text-align:center;line-height:1.5;box-shadow:0 6px 0 rgba(58,38,22,.35)}
#down small{display:block;font-size:15px;color:var(--ink-2);font-weight:700}

/* ══════════════ 메뉴 화면 ══════════════ */
.screen{
  position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;
  padding-top:calc(14px + env(safe-area-inset-top, 0px));padding-bottom:calc(14px + env(safe-area-inset-bottom, 0px));
  padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px));
  overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y
}
#title{background:linear-gradient(rgba(58,38,22,.25),rgba(58,38,22,.62))}
#pause,#result{background:rgba(40,25,14,.6);backdrop-filter:blur(3px)}
.card{
  width:min(760px,100%);max-height:100%;overflow:auto;background:var(--panel);
  border:4px solid #7a5230;border-radius:26px;box-shadow:0 8px 0 rgba(58,38,22,.4),0 20px 50px rgba(0,0,0,.35);
  padding:20px 22px 22px;text-align:center
}
.card.narrow{width:min(430px,100%)}
.logo-row{display:flex;align-items:center;justify-content:center;gap:10px}
.logo-row img{width:112px;height:auto;flex:none;margin:-14px -8px -10px -14px}
.logo{margin:0;font-size:clamp(34px,7.4vw,56px);line-height:1.08;font-weight:900;letter-spacing:-1px;color:#fffdf5;
  /* 글자 테두리는 그림자를 여러 방향으로 겹쳐서 만듦(기기마다 똑같이 보이게) */
  text-shadow:-2px -2px 0 #5a3a1c,2px -2px 0 #5a3a1c,-2px 2px 0 #5a3a1c,2px 2px 0 #5a3a1c,
              0 -3px 0 #5a3a1c,3px 0 0 #5a3a1c,-3px 0 0 #5a3a1c,0 3px 0 #5a3a1c,
              0 6px 0 #5a3a1c,2px 6px 0 #5a3a1c,-2px 6px 0 #5a3a1c,0 9px 14px rgba(0,0,0,.28)}
.logo b{color:#ffd24a;font-weight:900}
.sub{margin:4px 0 0;font-size:16px;font-weight:800;color:var(--ink-2)}
.stages{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0 12px}
.stg{
  position:relative;border:3.5px solid #c9a56a;border-radius:18px;background:#fff;padding:10px 8px 10px;
  text-align:center;font-weight:800;transition:transform .12s
}
.stg .em{font-size:34px;line-height:1.1}
.stg .nm{font-size:17px;font-weight:900;margin-top:2px}
.stg .ds{font-size:12.5px;color:var(--ink-2);margin-top:3px;line-height:1.35;min-height:34px}
.stg .rc{font-size:13px;margin-top:6px;color:#8a6a45}
.stg .st{font-size:15px;letter-spacing:1px;color:#d9c7a3}
.stg .st b{color:var(--gold)}
.stg .cont{display:inline-block;padding:2px 9px;border-radius:999px;background:var(--brand);color:#fff;font-size:12px;font-weight:900}
.stg{width:100%;font-family:inherit;color:inherit;cursor:pointer}
.stg.sel{border-color:var(--brand);background:#f4edff;transform:translateY(-3px);box-shadow:0 5px 0 #c9b3ff}
.stg.lock{opacity:.55;filter:grayscale(.7)}
.stg.lock::after{content:"🔒";position:absolute;right:8px;top:6px;font-size:18px}
.big-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:230px;height:60px;padding:0 30px;
  border:none;border-radius:999px;background:linear-gradient(#a97dff,#7a4be8);color:#fff;font-size:24px;font-weight:900;
  box-shadow:0 6px 0 #4f2bb3,0 10px 20px rgba(80,40,160,.35)
}
.big-btn:active{transform:translateY(4px);box-shadow:0 2px 0 #4f2bb3}
.big-btn.alt{background:linear-gradient(#fff,#f3e6c8);color:var(--ink);box-shadow:0 6px 0 #b79763}
.big-btn.alt:active{box-shadow:0 2px 0 #b79763}
.big-btn.sm{min-width:150px;height:50px;font-size:19px}
.btn-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.how{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;text-align:center}
.how div{background:#fff3d6;border-radius:14px;padding:8px 6px;font-size:12.5px;font-weight:800;line-height:1.35;color:var(--ink-2)}
.how div b{display:block;font-size:22px;line-height:1.2}
.foot{margin-top:12px;font-size:12px;color:#a08a68;font-weight:700}
.opt-row{display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap}
.chip{border:2.5px solid #c9a56a;background:#fff;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:800}
.chip.on{border-color:var(--brand);background:#f4edff;color:var(--brand-d)}
h2.ttl{margin:0 0 4px;font-size:30px;font-weight:900}
.stars{font-size:46px;letter-spacing:6px;color:#e3d3b0;margin:6px 0 2px;line-height:1}
.stars b{color:var(--gold);text-shadow:0 3px 0 #c98a12}
.stat{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 2px}
.stat div{background:#fff3d6;border-radius:14px;padding:9px 8px;font-size:13px;font-weight:800;color:var(--ink-2)}
.stat div b{display:block;font-size:22px;color:var(--ink);font-weight:900}
.newrec{display:inline-block;margin-top:8px;padding:4px 14px;border-radius:999px;background:var(--red);color:#fff;font-size:14px;font-weight:900}
#loading{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;
  background:#3a2616;color:#fff6e0;font-size:22px;font-weight:900;flex-direction:column;gap:14px}
#loading i{font-style:normal;font-size:46px;animation:pulse 1s ease-in-out infinite}

/* 기기에서 '움직임 줄이기'를 켠 경우: 깜빡이는 꾸밈과 화면 흔들림을 끔 */
@media (prefers-reduced-motion:reduce){
  .toast,.pill.bump,#track .nd.now,#loading i{animation:none}
}
@media (max-width:640px){
  .stages{grid-template-columns:1fr;gap:8px}
  .stg{display:grid;grid-template-columns:54px 1fr;text-align:left;column-gap:8px;padding:8px 10px}
  .stg .em{grid-row:1 / span 3;align-self:center;text-align:center}
  .stg .ds{min-height:0}
  .stg .rc{margin-top:2px}
  .how{grid-template-columns:repeat(2,1fr)}
  .logo-row img{width:84px}
  .pill{height:38px;font-size:18px;padding:0 12px 0 8px}
  .pill svg{width:22px;height:22px}
  #track{display:none}
}
@media (max-height:520px){
  .card{padding:12px 16px 14px}
  .how{display:none}
  .logo-row img{width:70px;margin:-8px -6px -6px -10px}
  .stages{margin:10px 0 8px}
  .stg .ds{display:none}
  .big-btn{height:50px;font-size:21px}
}
</style>
</head>
<body>

<div id="stage">
  <canvas id="gl"></canvas>
  <canvas id="ov"></canvas>
</div>

<!-- ══════════════ 놀이 중 화면 표시 ══════════════ -->
<div id="hud" class="off">
  <div class="hud-top">
    <div class="pill" id="pAcorn">
      <svg viewBox="0 0 24 24"><path d="M12 22c-4.4 0-7-3.4-7-8h14c0 4.6-2.6 8-7 8z" fill="#d89a4a" stroke="#5a3a1c" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 12.6c0-3.6 3.2-6 8-6s8 2.4 8 6c0 .9-.6 1.4-1.4 1.4H5.4C4.6 14 4 13.5 4 12.6z" fill="#7a4a22" stroke="#5a3a1c" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.6V3.2" stroke="#5a3a1c" stroke-width="2" stroke-linecap="round"/></svg>
      <b id="acornN">0</b>
    </div>
    <div id="track"></div>
    <div class="hud-right">
      <div class="pill sm" id="pSquad">🐿️ <b id="squadN">0</b></div>
      <div class="pill sm">⏱ <b id="timeN">0:00</b></div>
      <button class="rbtn" id="btnSnd" aria-label="소리">🔊</button>
      <button class="rbtn" id="btnPause" aria-label="잠깐 멈춤">⏸</button>
    </div>
  </div>
  <div id="boss" class="hidden"><div class="bn">👑 <span id="bossName"></span></div><div class="bbar"><i id="bossFill"></i></div></div>
  <div id="toast"></div>
  <div id="hint" class="off"></div>
  <div id="down" class="hidden"><div>😵 다람 대장이 지쳤어요!<small>진지에서 기운을 차리고 다시 출발해요…</small></div></div>
</div>

<!-- ══════════════ 첫 화면 ══════════════ -->
<div id="title" class="screen">
  <div class="card">
    <div class="logo-row">
      <img src="mascot.png" alt="" onerror="this.style.display='none'">
      <div>
        <h1 class="logo">다람 <b>원정대</b></h1>
        <p class="sub">끈적 슬라임이 가져간 도토리 숲을 되찾아요!</p>
      </div>
    </div>
    <div class="stages" id="stages"></div>
    <div class="btn-row" style="margin-top:0;align-items:center">
      <button class="big-btn" id="btnStart">▶ 원정 출발!</button>
      <button class="big-btn alt sm hidden" id="btnFresh">↻ 처음부터</button>
    </div>
    <div class="how">
      <div><b>👆</b>화면을 끌어서<br>다람 대장 이동</div>
      <div><b>🌰</b>도토리를 주워<br>발판 위에 서기</div>
      <div><b>🐿️</b>친구를 불러<br>원정대 키우기</div>
      <div><b>🏴</b>슬라임 둥지를<br>모두 무너뜨리기</div>
    </div>
    <div class="opt-row">
      <button class="chip" id="chipSnd">🔊 소리 켜짐</button>
      <button class="chip" id="chipFull">⛶ 전체 화면</button>
    </div>
    <div class="foot">이름·사진 같은 개인정보는 묻지도 저장하지도 않아요 · 기록은 이 기기에만 남아요</div>
  </div>
</div>

<!-- ══════════════ 잠깐 멈춤 ══════════════ -->
<div id="pause" class="screen hidden">
  <div class="card narrow">
    <h2 class="ttl">⏸ 잠깐 멈춤</h2>
    <p class="sub" id="pauseInfo"></p>
    <div class="btn-row" style="flex-direction:column;align-items:center">
      <button class="big-btn" id="btnResume">▶ 이어서 하기</button>
      <button class="big-btn alt sm" id="btnRetry">↻ 처음부터 다시</button>
      <button class="big-btn alt sm" id="btnQuit">🏠 첫 화면으로</button>
    </div>
  </div>
</div>

<!-- ══════════════ 결과 ══════════════ -->
<div id="result" class="screen hidden">
  <div class="card narrow">
    <h2 class="ttl">🎉 숲을 되찾았어요!</h2>
    <p class="sub" id="resStage"></p>
    <div class="stars" id="resStars"></div>
    <div id="resNew"></div>
    <div class="stat">
      <div>걸린 시간<b id="resTime">0:00</b></div>
      <div>이 길 최고 기록<b id="resBest">-</b></div>
      <div>모은 도토리<b id="resAcorn">0</b></div>
      <div>물리친 슬라임<b id="resKill">0</b></div>
    </div>
    <p class="sub" id="resTip" style="font-size:13px;margin-top:8px"></p>
    <div class="btn-row">
      <button class="big-btn" id="btnNext">다음 길로 ▶</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="big-btn alt sm" id="btnAgain">↻ 다시 도전</button>
      <button class="big-btn alt sm" id="btnHome">🏠 첫 화면</button>
    </div>
  </div>
</div>

<div id="loading"><i>🌰</i><span>숲을 준비하고 있어요…</span></div>

<div id="nogl" class="hidden">
  <h2>이 기기에서는 3D 화면을 켤 수 없어요 😢</h2>
  <p>크롬·엣지·사파리 최신 버전에서 다시 열어 주세요.<br>학교 기기라면 선생님께 “하드웨어 가속(WebGL)”이 켜져 있는지 여쭤보세요.</p>
</div>

<script>
/* ══════════════════════════════════════════════════════════════════
   다람 원정대
   ──────────────────────────────────────────────────────────────────
   · 외부 라이브러리를 하나도 쓰지 않는 순수 WebGL 3D 게임입니다.
     (학교 인터넷이 CDN을 막아도 이 파일 하나만 있으면 그대로 작동합니다.)
   · 학생 개인정보는 묻지도 저장하지도 않습니다. 기록은 기기 안에만 남습니다.
   · 고치고 싶은 값은 대부분 「4. 놀이 규칙 값」 한곳에 모여 있습니다.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

/* ═════════ 0. 자잘한 도우미 ═════════ */
const $  = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp  = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/** 각도를 -π ~ +π 범위로 접어 넣음 */
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
/** 프레임 시간에 영향받지 않는 부드러운 접근(감쇠) */
function damp(a, b, rate, dt) { return lerp(a, b, 1 - Math.exp(-rate * dt)); }
/** 각도 a 를 b 쪽으로 최대 step 만큼 돌림 */
function turnTo(a, b, step) {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}
/** 0→1 구간을 부드럽게 */
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
/** 튀어 오르며 커지는 등장 곡선 (0→1, 중간에 1을 살짝 넘음) */
function popCurve(t) {
  t = clamp(t, 0, 1);
  const s = 1.70158 * 1.4;
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
}

/** 시드가 있는 난수 — 같은 길은 언제나 똑같은 모양으로 만들어짐 */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * Math.random();

/** '#rrggbb' → [r,g,b] (0~1) */
function C(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function cssC(c, a) {
  const f = (v) => Math.round(clamp(v, 0, 1) * 255);
  return a == null ? 'rgb(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ')'
                   : 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + a + ')';
}
/** 1:23 꼴로 시간 표시 */
function fmtTime(sec) {
  if (sec == null || !isFinite(sec) || sec < 0) return '-';
  const t = Math.floor(sec);
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

/* ═════════ 1. 행렬 수학 ═════════
   · 카메라: 4×4 (열 우선, WebGL 표준)
   · 물체:   3×4 아핀 행렬 12칸 (행 우선) — 인스턴스 하나당 이것만 넘김 */
const M4 = {
  create() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  /** o = a * b */
  mul(o, a, b) {
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3], a10=a[4],a11=a[5],a12=a[6],a13=a[7],
          a20=a[8],a21=a[9],a22=a[10],a23=a[11], a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for (let i = 0; i < 4; i++) {
      const b0=b[i*4], b1=b[i*4+1], b2=b[i*4+2], b3=b[i*4+3];
      o[i*4]   = b0*a00 + b1*a10 + b2*a20 + b3*a30;
      o[i*4+1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
      o[i*4+2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
      o[i*4+3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    }
    return o;
  },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;
    o[4]=0;o[5]=f;o[6]=0;o[7]=0;
    o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;
    o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0;
    return o;
  },
  lookAt(o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    let zx=ex-cx, zy=ey-cy, zz=ez-cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx/=l; zy/=l; zz/=l;
    let xx=uy*zz-uz*zy, xy=uz*zx-ux*zz, xz=ux*zy-uy*zx;
    l = Math.hypot(xx, xy, xz);
    if (l < 1e-6) { xx=1; xy=0; xz=0; } else { xx/=l; xy/=l; xz/=l; }
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;
    o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;
    o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;
    o[12]=-(xx*ex+xy*ey+xz*ez);
    o[13]=-(yx*ex+yy*ey+yz*ez);
    o[14]=-(zx*ex+zy*ey+zz*ez);
    o[15]=1;
    return o;
  },
};

/** 3×4 아핀 행렬 (행 우선 12칸: [r00 r01 r02 tx | r10 r11 r12 ty | r20 r21 r22 tz]) */
const A3 = {
  create() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0]); },
  /** 이동 → Y회전(yaw) → X회전(pitch, +면 앞으로 숙임) → Z회전(roll) → 크기.
      모형의 +Z 가 앞, +X 가 오른쪽, +Y 가 위 */
  compose(o, x, y, z, pitch, yaw, roll, sx, sy, sz) {
    const cy=Math.cos(yaw), sy0=Math.sin(yaw);
    const cp=Math.cos(pitch), sp=Math.sin(pitch);
    const cr=Math.cos(roll), sr=Math.sin(roll);
    o[0]=(cy*cr + sy0*sp*sr)*sx;  o[1]=(-cy*sr + sy0*sp*cr)*sy; o[2]=(sy0*cp)*sz;  o[3]=x;
    o[4]=(cp*sr)*sx;              o[5]=(cp*cr)*sy;              o[6]=(-sp)*sz;     o[7]=y;
    o[8]=(-sy0*cr + cy*sp*sr)*sx; o[9]=(sy0*sr + cy*sp*cr)*sy;  o[10]=(cy*cp)*sz;  o[11]=z;
    return o;
  },
  /** o = a * b */
  mul(o, a, b) {
    for (let i = 0; i < 12; i += 4) {
      const a0=a[i], a1=a[i+1], a2=a[i+2], a3=a[i+3];
      o[i]   = a0*b[0] + a1*b[4] + a2*b[8];
      o[i+1] = a0*b[1] + a1*b[5] + a2*b[9];
      o[i+2] = a0*b[2] + a1*b[6] + a2*b[10];
      o[i+3] = a0*b[3] + a1*b[7] + a2*b[11] + a3;
    }
    return o;
  },
};

/* ═════════ 2. WebGL 렌더러 ═════════
   · 같은 모형(다람쥐 몸, 슬라임…)은 '인스턴싱'으로 한 번에 그립니다.
     → 캐릭터가 수십 마리여도 그리기 명령은 모형 종류 수만큼만 나갑니다.
   · 그림자는 모형을 땅에 납작하게 눌러 그리는 평면 그림자입니다(스텐실로 겹침 방지). */

/* 물체 공통 정점 처리 — 인스턴스 행렬 적용 + 풍경의 바람 흔들림 */
const VS_COMMON = \`
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec4 aCol;      /* rgb=색, a=(캐릭터) 색 입히기를 받는 정도 / (풍경) 바람에 흔들리는 정도 */
attribute vec4 aR0;       /* 인스턴스 행렬 1~3행 */
attribute vec4 aR1;
attribute vec4 aR2;
attribute vec4 aTint;     /* rgb=입힐 색, a=투명도 */
attribute vec4 aFx;       /* x=맞았을 때 하얗게 번쩍, y=스스로 빛남 */
uniform mat4 uVP;
uniform float uTime;
uniform float uSway;      /* 풍경을 그릴 때만 1 */
vec3 worldPos(){
  vec4 p = vec4(aPos, 1.0);
  vec3 w = vec3(dot(aR0, p), dot(aR1, p), dot(aR2, p));
  float s = uSway * aCol.a;
  w.x += sin(uTime * 1.3 + w.x * 0.35 + w.z * 0.27) * 0.10 * s;
  w.z += cos(uTime * 1.1 + w.x * 0.31 - w.z * 0.40) * 0.07 * s;
  return w;
}\`;

const VS_MAIN = VS_COMMON + \`
varying vec3 vNrm;
varying vec3 vCol;
varying vec3 vFx;
void main(){
  vec3 w = worldPos();
  vNrm = vec3(dot(aR0.xyz, aNrm), dot(aR1.xyz, aNrm), dot(aR2.xyz, aNrm));
  vCol = mix(aCol.rgb, aCol.rgb * aTint.rgb, aCol.a * (1.0 - uSway));
  vFx = vec3(aFx.x, aFx.y, aTint.a);
  gl_Position = uVP * vec4(w, 1.0);
}\`;

const FS_MAIN = \`
precision mediump float;
varying vec3 vNrm;
varying vec3 vCol;
varying vec3 vFx;
uniform vec3 uLightDir;     /* 빛이 오는 방향(정규화) */
uniform vec3 uSun;
uniform vec3 uAmbSky;       /* 위에서 오는 환경광 */
uniform vec3 uAmbGround;    /* 땅에서 반사되는 환경광 */
void main(){
  vec3 n = normalize(vNrm);
  /* 살짝 감싸는 빛 — 둥글둥글한 모형이 부드럽게 보임 */
  float diff = clamp(dot(n, uLightDir) * 0.72 + 0.28, 0.0, 1.0);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  vec3 c = vCol * (amb + uSun * diff);
  c = mix(c, vCol * 1.12, vFx.y);
  c = mix(c, vec3(1.0), vFx.x);
  gl_FragColor = vec4(c, vFx.z);
}\`;

/* 그림자 — 빛 방향으로 땅(y=0)에 눌러 붙임 */
const VS_SHADOW = VS_COMMON + \`
uniform vec3 uLightDir;
void main(){
  vec3 w = worldPos();
  float k = max(w.y, 0.0) / uLightDir.y;
  gl_Position = uVP * vec4(w.x - uLightDir.x * k, 0.05, w.z - uLightDir.z * k, 1.0);
}\`;
const FS_SHADOW = \`
precision mediump float;
uniform vec4 uShadow;
void main(){ gl_FragColor = uShadow; }\`;

/* 땅·발판 — 그림 한 장을 땅 위 네모에 입힘 */
const VS_TEX = \`
attribute vec2 aPos;        /* -0.5 ~ 0.5 */
uniform mat4 uVP;
uniform vec4 uRect;         /* 가운데 x,z · 가로,세로 크기 */
uniform float uY;
uniform vec2 uSnap;         /* 무늬 좌표를 작게 유지하려고 빼는 값 */
varying vec2 vUv;
varying vec2 vW;
void main(){
  vec2 w = uRect.xy + aPos * uRect.zw;
  vUv = aPos + 0.5;
  vW = w - uSnap;
  gl_Position = uVP * vec4(w.x, uY, w.y, 1.0);
}\`;
const FS_TEX = \`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
varying vec2 vW;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform vec4 uColor;
uniform float uDetail;      /* 1이면 잔무늬를 섞음(땅) */
void main(){
  vec4 t = texture2D(uTex, vUv);
  float n = texture2D(uNoise, vW * 0.125).r * 0.55 + texture2D(uNoise, vW * 0.375).r * 0.45;
  t.rgb *= mix(1.0, 0.86 + 0.28 * n, uDetail);
  gl_FragColor = t * uColor;
}\`;

/** 정점을 모아 하나의 메시로 굽는 도구. 정점 = 위치3 + 법선3 + 색4 */
class MB {
  constructor() { this.v = []; this.i = []; this.n = 0; this.m = null; }

  /** 변환(이동·회전·크기)을 걸고 fn 안에서 만든 도형에 적용 */
  at(x, y, z, pitch, yaw, roll, s, fn) {
    const loc = A3.compose(A3.create(), x, y, z, pitch || 0, yaw || 0, roll || 0, s || 1, s || 1, s || 1);
    const prev = this.m;
    this.m = prev ? A3.mul(A3.create(), prev, loc) : loc;
    fn(this);
    this.m = prev;
    return this;
  }
  vert(x, y, z, nx, ny, nz, c, a) {
    const m = this.m;
    if (m) {
      const wx = m[0]*x + m[1]*y + m[2]*z + m[3];
      const wy = m[4]*x + m[5]*y + m[6]*z + m[7];
      const wz = m[8]*x + m[9]*y + m[10]*z + m[11];
      const ax = m[0]*nx + m[1]*ny + m[2]*nz;
      const ay = m[4]*nx + m[5]*ny + m[6]*nz;
      const az = m[8]*nx + m[9]*ny + m[10]*nz;
      const l = Math.hypot(ax, ay, az) || 1;
      x = wx; y = wy; z = wz; nx = ax / l; ny = ay / l; nz = az / l;
    }
    this.v.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], a || 0);
    return this.n++;
  }
  /** 네 점으로 사각면 하나(앞에서 봤을 때 반시계 순서). 법선은 자동 계산 */
  quad(p0, p1, p2, p3, col, a, both) {
    const ux=p1[0]-p0[0], uy=p1[1]-p0[1], uz=p1[2]-p0[2];
    const vx=p3[0]-p0[0], vy=p3[1]-p0[1], vz=p3[2]-p0[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx/=l; ny/=l; nz/=l;
    const A = this.vert(p0[0],p0[1],p0[2], nx,ny,nz, col, a);
    const B = this.vert(p1[0],p1[1],p1[2], nx,ny,nz, col, a);
    const Cc = this.vert(p2[0],p2[1],p2[2], nx,ny,nz, col, a);
    const D = this.vert(p3[0],p3[1],p3[2], nx,ny,nz, col, a);
    this.i.push(A, B, Cc, A, Cc, D);
    if (both) this.i.push(A, Cc, B, A, D, Cc);     // 뒷면도 보이게(깃발·잎)
    return this;
  }
  /** 삼각면 하나 (평평한 법선) */
  tri(p0, p1, p2, col, a, both) {
    const ux=p1[0]-p0[0], uy=p1[1]-p0[1], uz=p1[2]-p0[2];
    const vx=p2[0]-p0[0], vy=p2[1]-p0[1], vz=p2[2]-p0[2];
    let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx/=l; ny/=l; nz/=l;
    const A = this.vert(p0[0],p0[1],p0[2], nx,ny,nz, col, a);
    const B = this.vert(p1[0],p1[1],p1[2], nx,ny,nz, col, a);
    const Cc = this.vert(p2[0],p2[1],p2[2], nx,ny,nz, col, a);
    this.i.push(A, B, Cc);
    if (both) this.i.push(A, Cc, B);
    return this;
  }
  /** 축에 정렬된 상자 (중심 / 반크기) */
  box(cx, cy, cz, hx, hy, hz, col, a, colTop) {
    const x0=cx-hx, x1=cx+hx, y0=cy-hy, y1=cy+hy, z0=cz-hz, z1=cz+hz;
    const t = colTop || col;
    this.quad([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], t, a);     // 윗면
    this.quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], col, a);   // 아랫면
    this.quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], col, a);   // 앞
    this.quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], col, a);   // 뒤
    this.quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], col, a);   // 오른
    this.quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], col, a);   // 왼
    return this;
  }
  /** 타원체(둥근 법선). col 은 [r,g,b] 또는 (x,y,z 단위구 좌표)=>[r,g,b(,a)].
      floorY 를 주면 그보다 아래 정점을 눌러 바닥을 평평하게 만듦(슬라임) */
  ell(cx, cy, cz, rx, ry, rz, su, sv, col, a, floorY) {
    a = a || 0;
    const fn = typeof col === 'function' ? col : null;
    const rows = [];
    for (let j = 0; j <= sv; j++) {
      const th = Math.PI * j / sv, y = Math.cos(th), r = Math.sin(th);
      const cnt = (j === 0 || j === sv) ? 1 : su;
      const row = [];
      for (let i = 0; i < cnt; i++) {
        const ph = TAU * i / su;
        const ux = r * Math.cos(ph), uz = r * Math.sin(ph);
        let nx = ux / rx, ny = y / ry, nz = uz / rz;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const c = fn ? fn(ux, y, uz) : col;
        let py = cy + y * ry;
        if (floorY != null && py < floorY) py = floorY;
        row.push(this.vert(cx + ux * rx, py, cz + uz * rz, nx, ny, nz, c, c.length > 3 ? c[3] : a));
      }
      rows.push(row);
    }
    for (let j = 0; j < sv; j++) {
      const r0 = rows[j], r1 = rows[j + 1];
      for (let i = 0; i < su; i++) {
        const i2 = (i + 1) % su;
        const A = r0[r0.length === 1 ? 0 : i],  D = r0[r0.length === 1 ? 0 : i2];
        const B = r1[r1.length === 1 ? 0 : i],  Cc = r1[r1.length === 1 ? 0 : i2];
        if (j > 0) this.i.push(A, D, Cc);
        if (j < sv - 1) this.i.push(A, Cc, B);
      }
    }
    return this;
  }
  /** Y축 원뿔대: 아래 반지름 r0(높이 y0) → 위 반지름 r1(높이 y0+h). 원기둥·원뿔 겸용 */
  tube(cx, y0, cz, r0, r1, h, seg, col, a, capT, capB, colTop) {
    a = a || 0;
    const y1 = y0 + h, ct = colTop || col;
    const sl = Math.atan2(r0 - r1, h), ny = Math.sin(sl), nr = Math.cos(sl);
    const bot = [], top = [];
    for (let i = 0; i < seg; i++) {
      const ph = TAU * i / seg, dx = Math.cos(ph), dz = Math.sin(ph);
      bot.push(this.vert(cx + dx*r0, y0, cz + dz*r0, dx*nr, ny, dz*nr, col, a));
      top.push(this.vert(cx + dx*r1, y1, cz + dz*r1, dx*nr, ny, dz*nr, ct, a));
    }
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.i.push(top[i], top[j], bot[j],  top[i], bot[j], bot[i]);
    }
    if (capT && r1 > 0.001) {
      const c = this.vert(cx, y1, cz, 0, 1, 0, ct, a), ring = [];
      for (let i = 0; i < seg; i++) { const ph = TAU*i/seg; ring.push(this.vert(cx + Math.cos(ph)*r1, y1, cz + Math.sin(ph)*r1, 0,1,0, ct, a)); }
      for (let i = 0; i < seg; i++) this.i.push(c, ring[(i+1)%seg], ring[i]);
    }
    if (capB && r0 > 0.001) {
      const c = this.vert(cx, y0, cz, 0, -1, 0, col, a), ring = [];
      for (let i = 0; i < seg; i++) { const ph = TAU*i/seg; ring.push(this.vert(cx + Math.cos(ph)*r0, y0, cz + Math.sin(ph)*r0, 0,-1,0, col, a)); }
      for (let i = 0; i < seg; i++) this.i.push(c, ring[i], ring[(i+1)%seg]);
    }
    return this;
  }
  /** 각진 바위 — 울퉁불퉁한 공을 평평한 면으로 */
  rock(cx, cy, cz, rx, ry, rz, rng, col, colTop) {
    const su = 6, sv = 4, pts = [];
    for (let j = 0; j <= sv; j++) {
      const th = Math.PI * j / sv, y = Math.cos(th), r = Math.sin(th), row = [];
      const cnt = (j === 0 || j === sv) ? 1 : su;
      for (let i = 0; i < cnt; i++) {
        const ph = TAU * (i + (j % 2) * 0.5) / su, k = 0.78 + rng() * 0.44;
        row.push([cx + r * Math.cos(ph) * rx * k, Math.max(0, cy + y * ry * k), cz + r * Math.sin(ph) * rz * k]);
      }
      pts.push(row);
    }
    const pick = (row, i) => row[row.length === 1 ? 0 : i % su];
    const face = (p, q, r) => {
      const ny = ((q[2]-p[2])*(r[0]-p[0]) - (q[0]-p[0])*(r[2]-p[2]));
      this.tri(p, q, r, ny > 0 ? (colTop || col) : col, 0);
    };
    for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) {
      const A = pick(pts[j], i), D = pick(pts[j], i + 1), B = pick(pts[j+1], i), Cc = pick(pts[j+1], i + 1);
      if (j > 0) face(A, D, Cc);
      if (j < sv - 1) face(A, Cc, B);
    }
    return this;
  }
}

/** 렌더러 — 셰이더·상태·그리기 담당 */
class Renderer {
  constructor(canvas) {
    const opts = { antialias:true, alpha:false, depth:true, stencil:true,
                   powerPreference:'high-performance', failIfMajorPerformanceCaveat:false };
    let gl = null;
    try { gl = canvas.getContext('webgl2', opts); } catch (e) {}
    this.gl2 = !!gl;
    if (!gl) { try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) {} }
    if (!gl) { this.ok = false; return; }
    this.ok = true;
    this.gl = gl;
    this.canvas = canvas;

    // 인스턴싱: WebGL2 는 기본, WebGL1 은 확장. 둘 다 없으면 하나씩 그리는 방식으로 대체
    if (this.gl2) {
      this.divisor = (l, d) => gl.vertexAttribDivisor(l, d);
      this.drawInst = (n, type, cnt) => gl.drawElementsInstanced(gl.TRIANGLES, n, type, 0, cnt);
      this.hasInst = true;
      this.uint = true;
    } else {
      const ext = gl.getExtension('ANGLE_instanced_arrays');
      this.hasInst = !!ext;
      if (ext) {
        this.divisor = (l, d) => ext.vertexAttribDivisorANGLE(l, d);
        this.drawInst = (n, type, cnt) => ext.drawElementsInstancedANGLE(gl.TRIANGLES, n, type, 0, cnt);
      }
      this.uint = !!gl.getExtension('OES_element_index_uint');
    }

    const ATTR = ['aPos', 'aNrm', 'aCol', 'aR0', 'aR1', 'aR2', 'aTint', 'aFx'];
    this.pMain = this._program(VS_MAIN, FS_MAIN, ATTR);
    this.uMain = this._uniforms(this.pMain, ['uVP','uTime','uSway','uLightDir','uSun','uAmbSky','uAmbGround']);
    this.pShadow = this._program(VS_SHADOW, FS_SHADOW, ATTR);
    this.uShadow = this._uniforms(this.pShadow, ['uVP','uTime','uSway','uLightDir','uShadow']);
    this.pTex = this._program(VS_TEX, FS_TEX, ['aPos']);
    this.uTex = this._uniforms(this.pTex, ['uVP','uRect','uY','uSnap','uTex','uNoise','uColor','uDetail']);

    // 땅·발판용 네모
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,-0.5, 0.5,0.5, -0.5,0.5]), gl.STATIC_DRAW);

    this.proj = M4.create(); this.view = M4.create(); this.vp = M4.create();
    this.time = 0;
    this.env = null;
    this.calls = 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('셰이더 오류:', gl.getShaderInfoLog(s));
      throw new Error('shader');
    }
    return s;
  }
  _program(vs, fs, attrs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    attrs.forEach((n, i) => gl.bindAttribLocation(p, i, n));     // 모든 셰이더가 같은 번호를 쓰게 고정
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('프로그램 연결 오류:', gl.getProgramInfoLog(p));
      throw new Error('program');
    }
    return p;
  }
  _uniforms(p, names) {
    const u = {};
    names.forEach((k) => { u[k] = this.gl.getUniformLocation(p, k); });
    return u;
  }

  /** 빌더 → GPU 메시 */
  mesh(b) {
    const gl = this.gl;
    const m = { count: b.i.length, vbo: gl.createBuffer(), ibo: gl.createBuffer(), type: gl.UNSIGNED_SHORT };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(b.v), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    if (b.n > 65535) {
      if (!this.uint) console.warn('메시가 너무 큼:', b.n);
      m.type = gl.UNSIGNED_INT;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(b.i), gl.STATIC_DRAW);
    } else {
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(b.i), gl.STATIC_DRAW);
    }
    return m;
  }
  freeMesh(m) { if (m) { this.gl.deleteBuffer(m.vbo); this.gl.deleteBuffer(m.ibo); m.count = 0; } }

  /** 2D 캔버스 → 텍스처 */
  texture(canvas, repeat, mip) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    // mip: 멀리서 작게 보일 때 글자가 자글거리지 않게(가로세로가 2의 거듭제곱인 그림만)
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    return t;
  }
  updateTexture(t, canvas, mip) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  }
  freeTexture(t) { if (t) this.gl.deleteTexture(t); }

  /** 인스턴스 묶음 하나 만들기 */
  batch(mesh, cap, shadow, blend) {
    return { mesh, cap, data: new Float32Array(cap * 20), n: 0, buf: this.gl.createBuffer(),
             shadow: shadow !== false, blend: !!blend, up: false };
  }

  /** 캔버스 크기를 화면(및 픽셀 비율)에 맞춤 */
  resize(scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * (scale || 1);
    const w = Math.max(2, Math.round(this.canvas.clientWidth  * dpr));
    const h = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = w; this.h = h;
  }

  begin(clear) {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.depthMask(true);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    this.calls = 0;
  }
  setCamera(fov, aspect, near, far, eye, target) {
    M4.perspective(this.proj, fov, aspect, near, far);
    M4.lookAt(this.view, eye[0], eye[1], eye[2], target[0], target[1], target[2], 0, 1, 0);
    M4.mul(this.vp, this.proj, this.view);
  }

  /* ── 그림(텍스처) 네모: 땅과 발판 ── */
  texBegin(noiseTex, snapX, snapZ) {
    const gl = this.gl, u = this.uTex;
    gl.useProgram(this.pTex);
    for (let i = 1; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.uVP, false, this.vp);
    gl.uniform2f(u.uSnap, snapX, snapZ);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1i(u.uNoise, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noiseTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.CULL_FACE);
  }
  texQuad(tex, cx, cz, sx, sz, y, r, g, b, a, detail) {
    const gl = this.gl, u = this.uTex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform4f(u.uRect, cx, cz, sx, sz);
    gl.uniform1f(u.uY, y);
    gl.uniform4f(u.uColor, r, g, b, a);
    gl.uniform1f(u.uDetail, detail ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.calls++;
  }
  texEnd() { this.gl.enable(this.gl.CULL_FACE); }

  /* ── 물체 그리기 공통 ── */
  _use(shadow) {
    const gl = this.gl, e = this.env;
    if (shadow) {
      const u = this.uShadow;
      gl.useProgram(this.pShadow);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform3fv(u.uLightDir, e.lightDir);
      gl.uniform4fv(u.uShadow, e.shadow);
      this.uCur = u;
    } else {
      const u = this.uMain;
      gl.useProgram(this.pMain);
      gl.uniformMatrix4fv(u.uVP, false, this.vp);
      gl.uniform1f(u.uTime, this.time);
      gl.uniform3fv(u.uLightDir, e.lightDir);
      gl.uniform3fv(u.uSun, e.sun);
      gl.uniform3fv(u.uAmbSky, e.ambSky);
      gl.uniform3fv(u.uAmbGround, e.ambGround);
      this.uCur = u;
    }
  }
  _bindMesh(m) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
  }
  _instOff() {
    const gl = this.gl;
    for (let i = 3; i < 8; i++) { gl.disableVertexAttribArray(i); if (this.hasInst) this.divisor(i, 0); }
  }
  /** 이미 제자리에 구워진 풍경 메시 (인스턴스 값은 고정) */
  drawStatic(m) {
    if (!m || !m.count) return;
    const gl = this.gl;
    this._instOff();
    gl.vertexAttrib4f(3, 1, 0, 0, 0); gl.vertexAttrib4f(4, 0, 1, 0, 0); gl.vertexAttrib4f(5, 0, 0, 1, 0);
    gl.vertexAttrib4f(6, 1, 1, 1, 1); gl.vertexAttrib4f(7, 0, 0, 0, 0);
    gl.uniform1f(this.uCur.uSway, 1);
    this._bindMesh(m);
    gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
    this.calls++;
  }
  /** 인스턴스 자료를 GPU로 (프레임당 한 번) */
  upload(b) {
    if (!b.n) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    gl.bufferData(gl.ARRAY_BUFFER, b.data.subarray(0, b.n * 20), gl.DYNAMIC_DRAW);
  }
  drawBatch(b) {
    if (!b.n || !b.mesh.count) return;
    const gl = this.gl, m = b.mesh;
    gl.uniform1f(this.uCur.uSway, 0);
    this._bindMesh(m);
    if (this.hasInst) {
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      for (let i = 0; i < 5; i++) {
        gl.enableVertexAttribArray(3 + i);
        gl.vertexAttribPointer(3 + i, 4, gl.FLOAT, false, 80, i * 16);
        this.divisor(3 + i, 1);
      }
      this.drawInst(m.count, m.type, b.n);
      this.calls++;
    } else {
      // 인스턴싱이 안 되는 아주 오래된 기기: 하나씩 그림
      const d = b.data;
      for (let k = 0; k < b.n; k++) {
        const o = k * 20;
        for (let i = 0; i < 5; i++) gl.vertexAttrib4f(3 + i, d[o + i*4], d[o + i*4 + 1], d[o + i*4 + 2], d[o + i*4 + 3]);
        gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
        this.calls++;
      }
    }
  }

  /** 월드 좌표 → 화면 좌표(0~1). 카메라 뒤면 null */
  project(x, y, z) {
    const v = this.vp;
    const cx = v[0]*x + v[4]*y + v[8]*z + v[12];
    const cy = v[1]*x + v[5]*y + v[9]*z + v[13];
    const cw = v[3]*x + v[7]*y + v[11]*z + v[15];
    if (cw <= 0.02) return null;
    return [(cx / cw) * 0.5 + 0.5, 1 - ((cy / cw) * 0.5 + 0.5)];
  }
}

/** 인스턴스 하나를 묶음에 추가. m=3×4 행렬, (r,g,b,a)=입힐 색·투명도 */
function inst(b, m, r, g, b2, a, flash, emis) {
  if (b.n >= b.cap) return;
  const d = b.data, o = b.n * 20;
  d[o]=m[0]; d[o+1]=m[1]; d[o+2]=m[2]; d[o+3]=m[3];
  d[o+4]=m[4]; d[o+5]=m[5]; d[o+6]=m[6]; d[o+7]=m[7];
  d[o+8]=m[8]; d[o+9]=m[9]; d[o+10]=m[10]; d[o+11]=m[11];
  d[o+12]=r; d[o+13]=g; d[o+14]=b2; d[o+15]=a;
  d[o+16]=flash; d[o+17]=emis; d[o+18]=0; d[o+19]=0;
  b.n++;
}

/* ═════════ 3. 모형 만들기 ═════════
   그림 파일 없이 공·원기둥·상자를 이어 붙여 캐릭터와 풍경을 만듭니다.
   모형의 앞은 +Z, 위는 +Y, 발바닥 가운데가 원점입니다. */
const K = {
  white:[1,1,1], black:C('#2b1d14'), fur:C('#eda653'), furD:C('#cf7f2e'), cream:C('#fff1d2'), pink:C('#ff9fb2'),
  nose:C('#7a3b2a'), wood:C('#a8733f'), woodD:C('#7a4f28'), woodL:C('#cf9d62'), stone:C('#b1aea6'), stoneD:C('#8b877e'),
  nut:C('#dd9d4c'), cap:C('#7b4a23'), furL:C('#f9d49c'), gold:C('#ffcf3f'), red:C('#e8503f'), leaf:C('#6fbf4a'), mouth:C('#5a2030'),
};
const shade = (c, k) => [c[0]*k, c[1]*k, c[2]*k];

/* ── 다람쥐 ── */
function mChipBody() {
  const b = new MB();
  // 후드티 몸통 (a=1 → 부대마다 다른 색을 입힘)
  b.ell(0, 0.50, 0, 0.36, 0.40, 0.31, 12, 8, (x, y) => { const s = 0.90 + y * 0.10; return [s, s, s]; }, 1);
  b.ell(0, 0.88, -0.19, 0.27, 0.15, 0.18, 10, 5, [0.86, 0.86, 0.86], 1);          // 목 뒤로 넘긴 모자
  b.ell(0, 0.40, 0.26, 0.16, 0.08, 0.07, 8, 4, [0.80, 0.80, 0.80], 1);            // 앞주머니
  // 머리
  b.ell(0, 1.13, 0.04, 0.42, 0.37, 0.38, 18, 12, (x, y, z) => {
    const ax = Math.abs(x);
    if (z > 0.25 && y < 0.30 - ax * 0.25) return K.cream;                         // 얼굴 아래쪽은 크림색
    if (y > 0.30 && z > -0.8 && (ax < 0.085 || (ax > 0.25 && ax < 0.40))) return K.furD;   // 이마 줄무늬
    return K.fur;
  });
  for (const s of [-1, 1]) {
    b.ell(s * 0.27, 1.47, 0.0, 0.12, 0.13, 0.08, 8, 6, (x, y, z) => (z > 0.35 ? K.pink : K.fur));   // 귀
    b.ell(s * 0.155, 1.19, 0.385, 0.055, 0.065, 0.04, 8, 6, K.black);             // 눈
    b.ell(s * 0.155 + 0.018, 1.215, 0.42, 0.018, 0.02, 0.012, 5, 4, K.white);     // 눈 반짝임
    b.ell(s * 0.26, 1.07, 0.31, 0.075, 0.05, 0.035, 8, 4, K.pink);                // 볼
  }
  b.ell(0, 1.105, 0.415, 0.04, 0.03, 0.03, 6, 4, K.nose);                         // 코
  return b;
}
function mChipTail() {       // 뿌리가 원점 — 살랑살랑 흔들 수 있게 따로 둠
  const b = new MB();
  const col = (x, y, z) => (Math.abs(x) < 0.33 && z < 0.1 ? K.furD : K.fur);
  b.ell(0, 0.20, -0.10, 0.15, 0.26, 0.16, 8, 6, col);
  b.ell(0, 0.58, -0.24, 0.21, 0.34, 0.22, 10, 7, col);
  b.ell(0, 0.98, -0.14, 0.20, 0.24, 0.21, 10, 7, (x, y, z) => (y > 0.25 ? K.furL : col(x, y, z)));
  return b;
}
function mChipArm() {        // 어깨가 원점, 아래로 늘어뜨린 팔
  const b = new MB();
  b.ell(0, -0.15, 0, 0.095, 0.20, 0.10, 8, 6, [0.88, 0.88, 0.88], 1);
  b.ell(0, -0.36, 0.01, 0.085, 0.08, 0.085, 8, 5, K.fur);
  return b;
}
function mChipFoot() {
  const b = new MB();
  b.ell(0, 0.07, 0.04, 0.12, 0.08, 0.18, 8, 5, K.furD);
  return b;
}
function mAcornHat() {       // 대장이 쓰는 도토리 깍정이 모자
  const b = new MB();
  b.ell(0, 1.40, 0.03, 0.36, 0.22, 0.34, 14, 6, (x, y, z) => {
    const k = (Math.floor((Math.atan2(z, x) / TAU + 1) * 10 + y * 3) % 2) ? 0.86 : 1.0;
    return shade(K.cap, k);
  }, 0, 1.39);
  b.tube(0, 1.60, 0.03, 0.045, 0.03, 0.13, 6, K.woodD, 0, true);
  return b;
}
/* 위에서 내려다보는 게임이라 머리가 가장 잘 보임 → 모자 모양과 색으로 누구인지 알아봄 */
function mLeafHat() {        // 새총 다람의 뾰족 모자 (색을 입힘)
  const b = new MB();
  b.tube(0, 1.38, 0.02, 0.44, 0.40, 0.05, 12, [0.78, 0.78, 0.78], 1, true, true);
  b.tube(0, 1.43, 0.02, 0.31, 0.0, 0.50, 12, [1, 1, 1], 1);
  b.ell(0, 1.94, 0.02, 0.07, 0.07, 0.07, 6, 4, K.white);
  return b;
}
function mBeanie() {         // 도토리 다람의 털모자 (색을 입힘)
  const b = new MB();
  b.ell(0, 1.40, 0.03, 0.38, 0.27, 0.36, 14, 6, (x, y) => { const s = 0.9 + y * 0.12; return [s, s, s]; }, 1, 1.39);
  b.tube(0, 1.34, 0.03, 0.395, 0.395, 0.09, 14, [0.74, 0.74, 0.74], 1, true, true);
  b.ell(0, 1.71, 0.03, 0.10, 0.10, 0.10, 8, 5, K.white);
  return b;
}
function mHelmet() {         // 방패 다람의 투구 (색을 입힘)
  const b = new MB();
  b.ell(0, 1.40, 0.03, 0.40, 0.30, 0.38, 14, 6, (x, y) => { const s = 0.92 + y * 0.12; return [s, s, s]; }, 1, 1.39);
  b.tube(0, 1.33, 0.03, 0.43, 0.43, 0.08, 14, K.stone, 0, true, true);
  b.box(0, 1.66, 0.0, 0.05, 0.11, 0.30, K.stone);
  return b;
}
function mShield() {         // 방패 다람의 둥근 나무 방패 (가운데가 원점, 앞을 봄)
  const b = new MB();
  b.at(0, 0, 0, Math.PI / 2, 0, 0, 1, (q) => {
    q.tube(0, -0.04, 0, 0.36, 0.36, 0.08, 14, K.woodD, 0, true, true, K.wood);
    q.tube(0, 0.04, 0, 0.27, 0.27, 0.012, 14, K.woodL, 0, true, false);
    q.ell(0, 0.06, 0, 0.11, 0.07, 0.11, 8, 4, K.stone);
  });
  return b;
}
function mSling() {          // 새총 (손잡이 아래가 원점)
  const b = new MB();
  b.tube(0, 0, 0, 0.035, 0.035, 0.22, 6, K.woodD, 0, true, true);
  b.at(0, 0.2, 0, 0, 0, 0.55, 1, (q) => q.tube(0, 0, 0, 0.03, 0.025, 0.2, 6, K.woodD, 0, true));
  b.at(0, 0.2, 0, 0, 0, -0.55, 1, (q) => q.tube(0, 0, 0, 0.03, 0.025, 0.2, 6, K.woodD, 0, true));
  return b;
}

/* ── 슬라임 (몸통은 흰색으로 만들고 종류마다 색을 입힘) ── */
function mSlime(kind) {
  const b = new MB();
  b.ell(0, 0.34, 0, 0.52, 0.46, 0.52, 16, 10, (x, y) => { const s = 0.84 + 0.22 * clamp(y + 0.25, 0, 1); return [s, s, s]; }, 1, 0.0);
  b.at(-0.2, 0.63, 0.2, 0.5, 0, 0.5, 1, (q) => q.ell(0, 0, 0, 0.10, 0.035, 0.065, 6, 4, K.white));   // 윤기
  for (const s of [-1, 1]) {
    b.ell(s * 0.19, 0.44, 0.43, 0.115, 0.13, 0.07, 10, 6, K.white);               // 눈
    b.ell(s * 0.19, 0.43, 0.485, 0.055, 0.07, 0.03, 8, 5, K.black);
    if (kind !== 'basic' && kind !== 'spit')                                      // 사나운 눈썹
      b.at(s * 0.2, 0.61, 0.47, 0, 0, -s * 0.5, 1, (q) => q.box(0, 0, 0, 0.12, 0.028, 0.03, K.black));
  }
  if (kind === 'spit') {
    // 뿜뿜 슬라임: 대롱 입
    b.at(0, 0.25, 0.45, Math.PI / 2, 0, 0, 1, (q) => q.tube(0, 0, 0, 0.12, 0.15, 0.2, 10, [0.8, 0.8, 0.8], 1, true, false, K.mouth));
  } else {
    b.ell(0, 0.25, 0.50, 0.07, 0.035, 0.03, 8, 4, K.mouth);                       // 입
  }
  if (kind === 'basic') {
    // 머리 위 새싹
    b.tube(0, 0.78, 0, 0.025, 0.02, 0.14, 5, K.leaf);
    b.at(0.09, 0.93, 0, 0, 0, -0.5, 1, (q) => q.ell(0, 0, 0, 0.11, 0.025, 0.06, 6, 4, K.leaf));
    b.at(-0.09, 0.93, 0, 0, 0, 0.5, 1, (q) => q.ell(0, 0, 0, 0.11, 0.025, 0.06, 6, 4, C('#8fd45f')));
  }
  if (kind === 'spiky') {
    // 가시: 위·뒤쪽에 뾰족뿔
    const dirs = [[0, 1, 0], [0.6, 0.75, 0], [-0.6, 0.75, 0], [0, 0.75, -0.62], [0.5, 0.6, -0.6], [-0.5, 0.6, -0.6],
                  [0.8, 0.35, -0.45], [-0.8, 0.35, -0.45], [0, 0.35, -0.92]];
    for (const d of dirs) {
      const l = Math.hypot(d[0], d[1], d[2]), dx = d[0] / l, dy = d[1] / l, dz = d[2] / l;
      b.at(dx * 0.46, 0.34 + dy * 0.40, dz * 0.46, Math.acos(dy), Math.atan2(dx, dz), 0, 1,
        (q) => q.tube(0, 0, 0, 0.09, 0, 0.26, 6, [1.05, 1.05, 1.05], 1, false, false, K.cream));
    }
  }
  if (kind === 'brute') {
    for (const s of [-1, 1])
      b.at(s * 0.26, 0.70, 0.05, 0, 0, -s * 0.5, 1, (q) => q.tube(0, 0, 0, 0.08, 0, 0.24, 6, K.cream));   // 작은 뿔
  }
  if (kind === 'king') {
    // 왕관
    b.tube(0, 0.72, 0, 0.30, 0.34, 0.13, 12, K.gold, 0, false, false);
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6;
      b.tube(Math.cos(a) * 0.32, 0.84, Math.sin(a) * 0.32, 0.075, 0, 0.17, 5, K.gold);
    }
    b.ell(0, 0.79, 0.33, 0.05, 0.05, 0.03, 6, 4, K.red);
    b.ell(0, 0.78, 0, 0.29, 0.06, 0.29, 10, 4, C('#b23a48'));
  }
  return b;
}

/* ── 뿜뿜 버섯 (움직이지 않고 포자를 쏘는 지킴이) ── */
function mTurret() {
  const b = new MB();
  b.tube(0, 0, 0, 0.50, 0.40, 0.88, 12, K.cream, 0, false, false, shade(K.cream, 0.94));
  const dots = [[0, 1, 0], [0.7, 0.6, 0.3], [-0.6, 0.55, 0.5], [0.2, 0.5, -0.8], [-0.75, 0.5, -0.35], [0.1, 0.35, 0.93], [0.9, 0.3, -0.3]];
  b.ell(0, 0.92, 0, 0.98, 0.66, 0.98, 18, 9, (x, y, z) => {
    for (const d of dots) {
      const l = Math.hypot(d[0], d[1], d[2]);
      if (Math.hypot(x - d[0] / l, y - d[1] / l, z - d[2] / l) < 0.24) return K.cream;
    }
    return [1, 1, 1, 1];        // 갓은 색을 입힘
  }, 0, 0.84);
  for (const s of [-1, 1]) {
    b.ell(s * 0.16, 0.52, 0.40, 0.085, 0.10, 0.05, 8, 5, K.white);
    b.ell(s * 0.16, 0.51, 0.44, 0.04, 0.055, 0.025, 6, 4, K.black);
    b.at(s * 0.17, 0.66, 0.43, 0, 0, -s * 0.45, 1, (q) => q.box(0, 0, 0, 0.10, 0.024, 0.025, K.black));
  }
  b.ell(0, 0.28, 0.46, 0.10, 0.10, 0.04, 10, 5, K.mouth);     // 포자가 나오는 동그란 입
  return b;
}

/* ── 슬라임 둥지 ── */
function mNest() {
  const b = new MB();
  b.ell(0, 0.15, 0, 2.05, 1.65, 2.05, 20, 10, (x, y, z) => {
    const n = Math.sin(x * 9 + z * 4) * Math.sin(z * 8 - y * 5);
    const s = 0.78 + 0.2 * clamp(y + 0.2, 0, 1) + (n > 0.45 ? -0.14 : 0);
    return [s, s, s];
  }, 1, 0.0);
  // 굴 입구 세 개
  for (const a of [0, 2.2, 4.1]) {
    const dx = Math.sin(a), dz = Math.cos(a);
    b.ell(dx * 1.72, 0.52, dz * 1.72, 0.55 * Math.abs(dz) + 0.22, 0.52, 0.55 * Math.abs(dx) + 0.22, 10, 6, shade(K.mouth, 0.7));
  }
  // 굴뚝과 방울
  b.tube(0, 1.5, 0, 0.5, 0.36, 0.55, 10, [0.9, 0.9, 0.9], 1, false, false);
  b.ell(0, 2.03, 0, 0.36, 0.08, 0.36, 10, 3, shade(K.mouth, 0.7));
  const bub = [[1.2, 1.05, 0.9, 0.3], [-1.3, 0.95, 0.5, 0.36], [-0.5, 1.5, -1.0, 0.28], [0.9, 1.35, -0.9, 0.34], [-1.0, 1.2, 1.1, 0.24], [0.3, 1.72, 0.7, 0.2]];
  for (const p of bub) b.ell(p[0], p[1], p[2], p[3], p[3], p[3], 8, 6, [1.1, 1.1, 1.1], 1);
  return b;
}

/* ── 도토리 (동전·던지는 것) ── */
function mAcorn() {
  const b = new MB();
  b.ell(0, 0, 0, 0.15, 0.20, 0.15, 8, 6, (x, y) => shade(K.nut, 0.9 + y * 0.12), 1);
  b.ell(0, 0.06, 0, 0.175, 0.14, 0.175, 8, 4, K.cap, 0, 0.05);
  b.tube(0, 0.19, 0, 0.03, 0.02, 0.07, 5, K.woodD, 0, true);
  return b;
}
function mPuff() { const b = new MB(); b.ell(0, 0, 0, 0.5, 0.5, 0.5, 8, 6, K.white, 1); return b; }
function mLeaf() {
  const b = new MB();
  b.quad([0, 0, 0.5], [0.28, 0.04, 0], [0, 0, -0.5], [-0.28, 0.04, 0], K.white, 1, true);
  return b;
}

/* ── 진지 건물 ── */
function mTent() {           // 훈련 텐트
  const b = new MB();
  const w = 1.35, h = 2.0, d = 1.4, cr = C('#fff3cf'), og = C('#f6a13a');
  for (const s of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const t0 = k / 4, t1 = (k + 1) / 4, c = k % 2 ? cr : og;
      b.quad([s*w*(1-t0), h*t0, d], [s*w*(1-t0), h*t0, -d], [s*w*(1-t1), h*t1, -d], [s*w*(1-t1), h*t1, d], c, 0, true);
    }
  }
  b.tri([-w, 0, d], [w, 0, d], [0, h, d], shade(cr, 0.93), 0, true);          // 앞
  b.tri([w, 0, -d], [-w, 0, -d], [0, h, -d], shade(cr, 0.85), 0, true);       // 뒤
  b.tri([-0.5, 0, d + 0.02], [0.5, 0, d + 0.02], [0, 1.25, d + 0.02], C('#5b3d24'), 0, true);   // 입구
  b.tube(0, h - 0.05, d - 0.05, 0.04, 0.04, 0.75, 5, K.woodD, 0, true);
  b.tri([0, h + 0.68, d - 0.05], [0, h + 0.36, d - 0.05], [0.55, h + 0.52, d - 0.05], C('#ffd24a'), 0, true);
  return b;
}
function mHut() {            // 방패 오두막
  const b = new MB();
  for (let k = 0; k < 4; k++) b.box(0, 0.19 + k * 0.38, 0, 1.25 - (k % 2) * 0.05, 0.19, 1.15 - (k % 2) * 0.05, k % 2 ? K.wood : K.woodL);
  const r = 1.75, y0 = 1.5, y1 = 2.55, bl = C('#4f93e6'), bd = C('#3c79c9');
  b.tri([-r, y0, r], [r, y0, r], [0, y1, 0], bl, 0, true);
  b.tri([r, y0, r], [r, y0, -r], [0, y1, 0], bd, 0, true);
  b.tri([r, y0, -r], [-r, y0, -r], [0, y1, 0], bd, 0, true);
  b.tri([-r, y0, -r], [-r, y0, r], [0, y1, 0], bl, 0, true);
  b.box(0, 0.5, 1.16, 0.34, 0.5, 0.02, C('#5b3d24'));                          // 문
  b.at(0, 1.25, 1.2, 0, 0, 0, 0.62, (q) => {                                   // 방패 간판
    q.at(0, 0, 0, Math.PI / 2, 0, 0, 1, (p) => {
      p.tube(0, -0.04, 0, 0.36, 0.36, 0.08, 12, C('#3c79c9'), 0, true, true, C('#7db4f5'));
      p.ell(0, 0.06, 0, 0.12, 0.07, 0.12, 8, 4, K.gold);
    });
  });
  return b;
}
function mTree() {           // 새총 나무집
  const b = new MB();
  const bark = C('#9b6b43');
  b.tube(0, 0, 0, 1.2, 0.98, 1.7, 12, bark, 0, true, false, C('#d9b27c'));
  for (let i = 0; i < 5; i++) { const a = TAU * i / 5 + 0.3; b.ell(Math.cos(a) * 1.15, 0.12, Math.sin(a) * 1.15, 0.32, 0.2, 0.32, 6, 4, shade(bark, 0.9)); }
  b.tube(0, 1.62, 0, 1.5, 0.0, 1.25, 12, C('#f27fa5'), 0, false, true, C('#ff9fc0'));
  b.ell(0, 2.9, 0, 0.1, 0.1, 0.1, 6, 4, K.gold);
  b.ell(0, 0.55, 1.1, 0.34, 0.55, 0.06, 10, 6, C('#5b3d24'));                  // 문
  b.ell(0.62, 1.15, 0.83, 0.2, 0.2, 0.05, 10, 5, C('#ffe27a'));                // 창
  return b;
}
function mFire() {           // 모닥불 받침(돌·장작)
  const b = new MB(), rng = makeRng(77);
  for (let i = 0; i < 8; i++) { const a = TAU * i / 8; b.rock(Math.cos(a) * 0.72, 0.1, Math.sin(a) * 0.72, 0.22, 0.2, 0.22, rng, K.stoneD, K.stone); }
  for (let i = 0; i < 3; i++)
    b.at(0, 0.14, 0, Math.PI / 2 - 0.25, TAU * i / 3, 0, 1, (q) => q.tube(0, -0.5, 0, 0.09, 0.09, 1.0, 6, K.woodD, 0, true, true, K.woodL));
  return b;
}
function mFlame() {
  const b = new MB();
  b.tube(0, 0.1, 0, 0.36, 0, 1.0, 7, C('#ff8a2a'));
  b.ell(0, 0.22, 0, 0.36, 0.2, 0.36, 7, 4, C('#ff8a2a'));
  b.tube(0, 0.16, 0, 0.2, 0, 0.62, 6, C('#ffe066'));
  return b;
}
function mFlagPole() {
  const b = new MB();
  b.tube(0, 0, 0, 0.08, 0.06, 3.6, 6, K.woodL, 0, true);
  b.ell(0, 3.66, 0, 0.11, 0.11, 0.11, 6, 4, K.gold);
  b.tube(0, 0, 0, 0.26, 0.2, 0.16, 8, K.stoneD, 0, true);
  return b;
}
function mFlagCloth() {      // 깃대 쪽 모서리가 원점. 색을 입힘
  const b = new MB();
  b.tri([0, 0.42, 0], [0, -0.42, 0], [1.25, 0, 0], K.white, 1, true);
  b.tri([0, 0.16, 0.01], [0, -0.16, 0.01], [0.5, 0, 0.01], [1.4, 1.4, 1.4], 1, true);
  return b;
}

/* ── 풍경 소품: 주어진 빌더에 제자리로 구워 넣음 ── */
function pTree(b, x, z, s, col, trunk, rng) {
  b.tube(x, 0, z, 0.24 * s, 0.15 * s, 1.5 * s, 6, trunk);
  const grad = (c) => (ux, uy) => shade(c, 0.86 + 0.2 * clamp(uy + 0.4, 0, 1));
  b.ell(x, 2.25 * s, z, 1.28 * s, 1.06 * s, 1.28 * s, 8, 5, grad(col), 1);
  const a = rng() * TAU;
  b.ell(x + Math.cos(a) * 0.7 * s, 1.75 * s, z + Math.sin(a) * 0.7 * s, 0.82 * s, 0.7 * s, 0.82 * s, 7, 4, grad(shade(col, 0.93)), 0.8);
  if (rng() < 0.6) b.ell(x - Math.cos(a) * 0.55 * s, 2.85 * s, z - Math.sin(a) * 0.55 * s, 0.7 * s, 0.62 * s, 0.7 * s, 7, 4, grad(shade(col, 1.06)), 1);
}
function pPine(b, x, z, s, col, trunk) {
  b.tube(x, 0, z, 0.2 * s, 0.14 * s, 0.9 * s, 6, trunk);
  b.tube(x, 0.7 * s, z, 1.15 * s, 0.0, 1.5 * s, 7, shade(col, 0.88), 0.5, false, true);
  b.tube(x, 1.55 * s, z, 0.9 * s, 0.0, 1.35 * s, 7, col, 0.8, false, true);
  b.tube(x, 2.35 * s, z, 0.62 * s, 0.0, 1.15 * s, 7, shade(col, 1.1), 1, false, true);
}
function pBush(b, x, z, s, col, rng) {
  b.ell(x, 0.42 * s, z, 0.75 * s, 0.55 * s, 0.75 * s, 7, 4, (ux, uy) => shade(col, 0.85 + 0.2 * clamp(uy + 0.4, 0, 1)), 0.4, 0);
  const a = rng() * TAU;
  b.ell(x + Math.cos(a) * 0.55 * s, 0.32 * s, z + Math.sin(a) * 0.55 * s, 0.5 * s, 0.4 * s, 0.5 * s, 6, 4, shade(col, 0.92), 0.4, 0);
}
function pStump(b, x, z, s) {
  b.tube(x, 0, z, 0.6 * s, 0.5 * s, 0.55 * s, 9, C('#8b5e3a'), 0, true, false, C('#dcb77f'));
  b.tube(x, 0.551 * s, z, 0.26 * s, 0.26 * s, 0.002, 9, C('#c79a62'), 0, true);
}
function pMush(b, x, z, s, col) {
  b.tube(x, 0, z, 0.09 * s, 0.07 * s, 0.26 * s, 6, K.cream);
  b.ell(x, 0.27 * s, z, 0.25 * s, 0.17 * s, 0.25 * s, 8, 4, col, 0, 0.25 * s);
}
function pFlower(b, x, z, s, col) {
  b.tube(x, 0, z, 0.025, 0.02, 0.3 * s, 4, C('#5fa544'));
  b.ell(x, 0.32 * s, z, 0.14 * s, 0.05 * s, 0.14 * s, 6, 3, col, 0.3);
  b.ell(x, 0.35 * s, z, 0.05 * s, 0.04 * s, 0.05 * s, 5, 3, K.gold, 0.3);
}
function pTuft(b, x, z, s, col, rng) {
  for (let i = 0; i < 3; i++) {
    const a = rng() * TAU, r = 0.1 * s;
    b.tube(x + Math.cos(a) * r, 0, z + Math.sin(a) * r, 0.07 * s, 0, (0.3 + rng() * 0.25) * s, 4, col, 0.5);
  }
}
function pPumpkin(b, x, z, s) {
  b.ell(x, 0.3 * s, z, 0.42 * s, 0.32 * s, 0.42 * s, 12, 6, (ux, uy, uz) => {
    const k = Math.abs(Math.sin(Math.atan2(uz, ux) * 4)) > 0.3 ? 1 : 0.84;
    return shade(C('#f08a24'), k);
  }, 0, 0);
  b.tube(x, 0.58 * s, z, 0.05 * s, 0.035 * s, 0.14 * s, 5, C('#4f8a3a'), 0, true);
}
function pLog(b, x, z, yaw, s) {
  b.at(x, 0.24 * s, z, Math.PI / 2, yaw, 0, s, (q) => {
    q.tube(0, -0.9, 0, 0.24, 0.24, 1.8, 8, C('#8b5e3a'), 0, true, true, C('#dcb77f'));
  });
}
function pLantern(b, x, z, glow) {
  b.tube(x, 0, z, 0.07, 0.06, 1.5, 5, K.woodD, 0, true);
  b.box(x, 1.72, z, 0.2, 0.22, 0.2, glow);
  b.tube(x, 1.94, z, 0.3, 0.0, 0.22, 4, K.woodD);
}
function pFence(b, x, z, yaw) {
  b.at(x, 0, z, 0, yaw, 0, 1, (q) => {
    q.tube(-0.75, 0, 0, 0.09, 0.07, 0.95, 5, K.wood, 0, true);
    q.tube(0.75, 0, 0, 0.09, 0.07, 0.95, 5, K.wood, 0, true);
    q.box(0, 0.62, 0, 0.8, 0.06, 0.035, K.woodL);
    q.box(0, 0.32, 0, 0.8, 0.06, 0.035, K.woodL);
  });
}

/* ══════════════════════════════════════════════════════════════════
   4. 놀이 규칙 값 — 게임의 세기·값·길 모양은 모두 여기서 고칩니다
   ══════════════════════════════════════════════════════════════════ */

/** 후드티 색 */
const HOOD = { hero: C('#9a66f0'), thrower: C('#ffcf4a'), guard: C('#4f93e6'), slinger: C('#f27fa5') };

/** 등장하는 모든 캐릭터.
    hp=체력, speed=초당 이동 거리, r=몸 반지름, range=공격 거리, dmg=한 번 공격의 세기, cd=공격 간격(초),
    coins=쓰러뜨리면 나오는 도토리 */
const UNITS = {
  /* ── 우리 편 ── */
  hero:    { team:0, name:'다람 대장',  hp:160, speed:6.4, r:0.55, range:7.2,  dmg:9,  cd:0.55, proj:'acorn',  scale:1.22, hood:HOOD.hero },
  thrower: { team:0, name:'도토리 다람', hp:46,  speed:6.9, r:0.40, range:6.6,  dmg:6,  cd:0.85, proj:'acorn',  scale:0.88, hood:HOOD.thrower, leash:3.4 },
  guard:   { team:0, name:'방패 다람',  hp:140, speed:6.9, r:0.46, range:0.45, dmg:9,  cd:0.75, melee:true,    scale:0.98, hood:HOOD.guard,   leash:6.5 },
  slinger: { team:0, name:'새총 다람',  hp:38,  speed:6.9, r:0.40, range:10.5, dmg:18, cd:1.50, proj:'pebble', scale:0.88, hood:HOOD.slinger, leash:1.6 },
  /* ── 슬라임 ── */
  slime:   { team:1, name:'초록 슬라임', mesh:'slimeBasic', col:C('#7fdc58'), hp:45,  speed:3.4, r:0.50, range:0.35, dmg:5,  cd:1.10, melee:true, hop:0.50, coins:2 },
  spitter: { team:1, name:'뿜뿜 슬라임', mesh:'slimeSpit',  col:C('#b684f5'), hp:36,  speed:2.7, r:0.50, range:6.8,  dmg:6,  cd:1.90, proj:'goo', hop:0.60, coins:3 },
  spiky:   { team:1, name:'가시 슬라임', mesh:'slimeSpiky', col:C('#ffa03c'), hp:30,  speed:5.3, r:0.44, range:0.30, dmg:4,  cd:0.70, melee:true, hop:0.32, scale:0.85, coins:2 },
  brute:   { team:1, name:'덩치 슬라임', mesh:'slimeBrute', col:C('#55b8f2'), hp:420, speed:2.1, r:1.10, range:0.50, dmg:16, cd:1.70, melee:true, hop:0.80, scale:2.2, coins:12 },
  turret:  { team:1, name:'뿜뿜 버섯',  mesh:'turret',     col:C('#e9523f'), hp:220, speed:0,   r:0.80, range:9.5,  dmg:9,  cd:1.90, proj:'spore', fixed:true, coins:8 },
  nest:    { team:1, name:'슬라임 둥지', mesh:'nest',       col:C('#9d6edb'), hp:700, speed:0,   r:2.05, fixed:true, building:true, coins:30 },
  king:    { team:1, name:'슬라임 대왕', mesh:'slimeKing',  col:C('#c561e6'), hp:2600, speed:2.3, r:1.90, range:0.90, dmg:24, cd:2.40, melee:true, hop:0.90, scale:3.6,
             boss:true, slam:4.4, coins:80 },
};

/** 날아가는 것들. homing=끝까지 따라가 반드시 맞음, splash=떨어진 자리 둘레 피해 반지름 */
const PROJ = {
  acorn:  { speed:19, arc:1.0,  size:1.0,  homing:true },
  pebble: { speed:30, arc:0.35, size:0.34, homing:true, col:C('#c9c5ba') },
  goo:    { speed:10, arc:1.7,  size:0.5,  col:C('#b684f5'), splash:0.95, hits:1 },
  spore:  { speed:9,  arc:0.9,  size:0.62, col:C('#ff7a5e'), splash:1.3,  hits:2 },
  bomb:   { speed:8,  arc:3.2,  size:0.9,  col:C('#c561e6'), splash:2.2,  hits:3 },
};

/** 진지의 발판. costs[n] = n단계→n+1단계로 올리는 값(도토리).
    u,v = 진지 가운데에서 본 자리(u: 오른쪽+, v: 길 앞쪽+). bu,bv = 건물 자리 */
const PADS = {
  tent: { name:'훈련 텐트',  sub:'도토리 다람', icon:'tent',   unit:'thrower', caps:[0,3,4,5,6,8,10], costs:[5,10,16,24,34,46], train:3.0,
          u:-6.5, v:6.5, bu:-10.9, bv:7.3, tip:'도토리를 던지는 친구가 찾아와요' },
  hut:  { name:'방패 오두막', sub:'방패 다람',  icon:'shield', unit:'guard',   caps:[0,1,2,3,4],      costs:[24,30,42,56],      train:5.0, need:'guard',
          u:6.5, v:6.5, bu:10.9, bv:7.3, tip:'앞에서 막아 주는 튼튼한 친구' },
  tree: { name:'새총 나무집', sub:'새총 다람',  icon:'sling',  unit:'slinger', caps:[0,1,2,3,4],      costs:[32,38,50,64],      train:5.0, need:'slinger',
          u:-6.5, v:0.0, bu:-10.9, bv:0.6, tip:'멀리서 세게 쏘는 친구' },
  atk:  { name:'도토리 힘',  sub:'공격력',     icon:'atk',    costs:[12,20,30,44,60], per:0.25, u:6.5, v:0.0, tip:'모두의 공격이 세져요' },
  hp:   { name:'튼튼 간식',  sub:'체력',       icon:'hp',     costs:[12,20,30,44,60], per:0.25, u:-6.5, v:-6.3, tip:'모두가 더 오래 버텨요' },
};
const PAD_ORDER = ['tent', 'hut', 'tree', 'atk', 'hp'];
const PAD_R = 1.5;              // 발판(둥근 판) 반지름
const HEAL_R = 5.2;             // 모닥불 곁에서 기운을 차리는 범위
const CAMP_WIDE = 13.8;         // 진지 자리의 길 반폭
const PATH_WIDE = 8.6;          // 보통 길의 반폭

/** 길의 분위기(색·빛) */
function mkTheme(o) {
  const l = Math.hypot(o.lightDir[0], o.lightDir[1], o.lightDir[2]);
  o.lightDir = new Float32Array([o.lightDir[0] / l, o.lightDir[1] / l, o.lightDir[2] / l]);
  return o;
}
const THEMES = {
  autumn: mkTheme({
    forest:C('#4d6130'), grassA:C('#a5c556'), grassB:C('#c6d36c'), trail:C('#e0c48e'), trailD:C('#c9a873'), camp:C('#ead6a6'), goo:C('#a77be0'),
    canopy:[C('#f28c2c'), C('#e85a30'), C('#f7c43c'), C('#d8472c'), C('#9dbb3c'), C('#f4a83c')], pine:C('#41804a'), pineP:0.16,
    trunk:C('#7a5332'), bush:[C('#8fb640'), C('#cba43c'), C('#da6a30')], tuft:C('#8db647'),
    flower:[C('#ffffff'), C('#ffd24a'), C('#ff8fa8')], fall:[C('#f28c2c'), C('#e85a30'), C('#f7c43c')], mush:C('#e9523f'), pumpkin:true,
    lightDir:[-0.42, 0.80, 0.42], sun:[0.62, 0.56, 0.46], ambSky:[0.60, 0.61, 0.60], ambGround:[0.46, 0.41, 0.34], shadow:[0.14, 0.13, 0.22, 0.30],
  }),
  spring: mkTheme({
    forest:C('#3f7a4e'), grassA:C('#8fd472'), grassB:C('#b4e38a'), trail:C('#f0dcc0'), trailD:C('#dcc3a2'), camp:C('#f6e8d2'), goo:C('#7bc8e0'),
    canopy:[C('#ffb3cd'), C('#ff8fb5'), C('#ffd3e2'), C('#ffa0c2'), C('#fff0f5'), C('#8fd46a')], pine:C('#4a9a62'), pineP:0.10,
    trunk:C('#6b4a3a'), bush:[C('#6fc45a'), C('#ffa9c6'), C('#9fe07a')], tuft:C('#6fc45a'),
    flower:[C('#ffffff'), C('#ffe45c'), C('#ff7fa8'), C('#b08cff')], fall:[C('#ffc2d6'), C('#ffe0ea'), C('#ff9fc0')], mush:C('#ff8a5e'),
    lightDir:[0.40, 0.82, 0.40], sun:[0.60, 0.58, 0.54], ambSky:[0.62, 0.66, 0.70], ambGround:[0.44, 0.46, 0.40], shadow:[0.12, 0.18, 0.26, 0.28],
  }),
  night: mkTheme({
    forest:C('#1d3350'), grassA:C('#3f7f8f'), grassB:C('#4f95a0'), trail:C('#9fb4cc'), trailD:C('#8198b4'), camp:C('#b5c6da'), goo:C('#5fe0b0'),
    canopy:[C('#2f6f8f'), C('#3b84a0'), C('#2a5f86'), C('#4a9ab0'), C('#356f7a'), C('#5a7fc0')], pine:C('#2a5f70'), pineP:0.30,
    trunk:C('#3d3a52'), bush:[C('#2f7f86'), C('#3f8f9a'), C('#4a6fb0')], tuft:C('#4f9aa0'),
    flower:[C('#bff6ff'), C('#fff6a8'), C('#d8b6ff')], fall:[C('#fff6a8'), C('#bff6ff'), C('#ffe9a0')], mush:C('#7ff0e0'), glow:true,
    lightDir:[-0.30, 0.86, 0.40], sun:[0.42, 0.50, 0.66], ambSky:[0.50, 0.58, 0.78], ambGround:[0.30, 0.36, 0.50], shadow:[0.04, 0.06, 0.18, 0.34],
  }),
};

/** 원정 길 3개.
    pts   = 길 조종점 [x, z] (위쪽=앞은 z가 줄어드는 방향)
    home  = 출발 진지 자리(길을 따라 잰 거리)
    camps = 슬라임 둥지들. s=자리, nest=둥지 체력 배율, guards=지키는 슬라임, turrets=뿜뿜 버섯 수, unlock=무너뜨리면 열리는 건물
    patrols = 길 중간에 돌아다니는 무리
    mult  = 이 길의 슬라임 체력·공격 배율, par = 별 3개/2개 기준 시간(초) */
const STAGES = [
  { id:'autumn', name:'가을 숲길', emoji:'🍂', desc:'처음 떠나는 원정.\\n둥지 3개와 슬라임 대왕!', theme:'autumn', seed:11,
    pts:[[0,16],[0,0],[2,-20],[9,-40],[9,-58],[-2,-76],[-10,-96],[-6,-116],[5,-134],[9,-154],[2,-174],[0,-194],[0,-214]],
    home:16,
    camps:[
      { s:64,  nest:1.0, guards:{ slime:6 }, turrets:0, unlock:'guard' },
      { s:114, nest:1.4, guards:{ slime:6, spitter:3 }, turrets:1, unlock:'slinger' },
      { s:164, nest:1.9, guards:{ slime:5, spitter:3, spiky:4, brute:1 }, turrets:2 },
      { s:212, boss:{ hp:1.0, summon:'slime' }, guards:{ slime:4, spitter:2 }, turrets:2 },
    ],
    patrols:[ { s:40, units:{ slime:3 } }, { s:90, units:{ slime:2, spiky:2 } }, { s:140, units:{ spitter:2, slime:3 } }, { s:188, units:{ spiky:4 } } ],
    mult:{ hp:1, dmg:1 }, par:[250, 390] },

  { id:'spring', name:'벚꽃 언덕', emoji:'🌸', desc:'가시 슬라임이 우글우글.\\n대왕은 끈적 폭탄을 던져요.', theme:'spring', seed:23,
    pts:[[0,16],[0,0],[-6,-20],[-12,-40],[-4,-60],[8,-76],[12,-96],[4,-114],[-8,-130],[-10,-150],[-2,-168],[2,-188],[0,-208],[0,-226]],
    home:16,
    camps:[
      { s:62,  nest:1.1, guards:{ slime:5, spiky:4 }, turrets:0, unlock:'guard' },
      { s:114, nest:1.5, guards:{ slime:5, spitter:4, spiky:3 }, turrets:2, unlock:'slinger' },
      { s:168, nest:2.0, guards:{ slime:4, spitter:4, spiky:5, brute:2 }, turrets:3 },
      { s:224, boss:{ hp:1.3, summon:'spiky', barrage:8 }, guards:{ spitter:3, spiky:5 }, turrets:2 },
    ],
    patrols:[ { s:38, units:{ spiky:4 } }, { s:88, units:{ slime:3, spitter:2 } }, { s:141, units:{ brute:1, spiky:4 } }, { s:196, units:{ spiky:4, spitter:2 } } ],
    mult:{ hp:1.25, dmg:1.2 }, par:[370, 560] },

  { id:'night', name:'달빛 호숫가', emoji:'🌙', desc:'가장 긴 밤의 원정.\\n둥지 4개와 왕 중의 왕!', theme:'night', seed:37,
    pts:[[0,16],[0,0],[6,-18],[12,-38],[4,-56],[-8,-70],[-12,-90],[-2,-108],[10,-122],[12,-142],[2,-160],[-10,-176],[-10,-196],[0,-214],[4,-234],[0,-254],[0,-272]],
    home:16,
    camps:[
      { s:60,  nest:1.2, guards:{ slime:6, spitter:3 }, turrets:1, unlock:'guard' },
      { s:110, nest:1.6, guards:{ slime:5, spitter:4, spiky:4 }, turrets:2, unlock:'slinger' },
      { s:162, nest:2.0, guards:{ slime:5, spitter:4, spiky:5, brute:1 }, turrets:2 },
      { s:214, nest:2.5, guards:{ slime:4, spitter:5, spiky:6, brute:2 }, turrets:3 },
      { s:272, boss:{ hp:1.5, summon:'spitter', barrage:12 }, guards:{ spitter:4, spiky:4, brute:1 }, turrets:3 },
    ],
    patrols:[ { s:36, units:{ slime:4 } }, { s:85, units:{ spiky:5 } }, { s:136, units:{ spitter:3, slime:3 } }, { s:188, units:{ brute:1, spiky:4 } },
              { s:243, units:{ spitter:4, spiky:3 } } ],
    mult:{ hp:1.5, dmg:1.35 }, par:[460, 700] },
];

/* ═════════ 5. 소리 (파일 없이 그 자리에서 만들어 냄) ═════════ */
const SND = {
  ctx: null, on: true, master: null, sfx: null, mus: null, last: {}, noiseBuf: null,
  musTimer: null, step: 0, nextT: 0, fast: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? 1 : 0; this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.55; this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = 0.11; this.mus.connect(this.master);
      const n = c.sampleRate, buf = c.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 1 : 0; },

  /** 음 하나: freq→slide 로 미끄러지며 dur 초 */
  tone(freq, dur, type, vol, slide, delay, out) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx);
    o.start(t); o.stop(t + dur + 0.03);
  },
  /** 바람 소리 같은 잡음 한 조각 */
  noise(dur, vol, freq, kind, delay) {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t = c.currentTime + (delay || 0);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = kind || 'highpass'; f.frequency.value = freq || 1500;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  /** 효과음. 같은 소리가 너무 촘촘히 겹치지 않게 간격을 둠 */
  play(name, k) {
    if (!this.ctx || !this.on) return;
    const now = performance.now(), gap = { throw:70, hit:55, pop:60, coin:45, pay:40, hurt:160, spit:120, join:120 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const T = (f, d, ty, v, sl, dl) => this.tone(f, d, ty, v, sl, dl);
    switch (name) {
      case 'throw': this.noise(0.06, 0.10, 2200); T(520, 0.07, 'sine', 0.05, 300); break;
      case 'hit':   T(330, 0.05, 'square', 0.05, 170); break;
      case 'pop':   T(520, 0.14, 'sine', 0.22, 120); this.noise(0.05, 0.08, 900); break;
      case 'coin':  T(1320, 0.05, 'triangle', 0.10); T(1760, 0.09, 'triangle', 0.10, 0, 0.045); break;
      case 'pay':   T(520 + (k || 0) * 26, 0.05, 'triangle', 0.09); break;
      case 'build': [523, 659, 784, 1047].forEach((f, i) => T(f, 0.16, 'triangle', 0.18, 0, i * 0.075)); this.noise(0.12, 0.06, 3000); break;
      case 'up':    [659, 880, 1109, 1319].forEach((f, i) => T(f, 0.14, 'triangle', 0.16, 0, i * 0.06)); break;
      case 'join':  T(880, 0.06, 'triangle', 0.09); T(1175, 0.09, 'triangle', 0.09, 0, 0.055); break;
      case 'hurt':  T(190, 0.12, 'sawtooth', 0.10, 90); break;
      case 'spit':  T(240, 0.10, 'sine', 0.07, 430); break;
      case 'down':  [440, 370, 294, 220].forEach((f, i) => T(f, 0.2, 'triangle', 0.18, 0, i * 0.15)); break;
      case 'camp':  [392, 523, 659, 784].forEach((f, i) => T(f, 0.14, 'square', 0.09, 0, i * 0.11));
                    T(1047, 0.5, 'square', 0.10, 0, 0.44); T(784, 0.5, 'triangle', 0.12, 0, 0.44); break;
      case 'slam':  this.noise(0.45, 0.5, 220, 'lowpass'); T(95, 0.4, 'sine', 0.4, 40); break;
      case 'warn':  T(220, 0.22, 'sawtooth', 0.08); T(220, 0.22, 'sawtooth', 0.08, 0, 0.28); break;
      case 'win':   [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => T(f, 0.22, 'triangle', 0.18, 0, i * 0.1)); break;
      case 'ui':    T(700, 0.04, 'triangle', 0.08); break;
    }
  },

  /* ── 배경 음악: 8마디짜리 짧은 행진곡을 되풀이 ── */
  MEL: [67,0,72,0,76,0,79,0,  81,0,79,0,76,-1,-1,0,  77,0,81,0,84,0,81,0,  79,-1,-1,0,74,-1,-1,0,
        76,0,79,0,84,0,83,0,  81,0,76,0,81,-1,-1,0,  77,0,76,0,74,0,79,0,  72,-1,-1,-1,-1,0,0,0],
  BASS: [48,48, 48,48, 41,41, 43,43, 48,48, 45,45, 41,43, 48,48],
  startMusic() {
    if (!this.ctx || this.musTimer) return;
    this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    this.musTimer = setInterval(() => this._tick(), 110);
  },
  stopMusic() { if (this.musTimer) { clearInterval(this.musTimer); this.musTimer = null; } },
  _tick() {
    const c = this.ctx; if (!c || !this.on) { if (c) this.nextT = c.currentTime + 0.1; return; }
    const beat = this.fast ? 0.215 : 0.265, tr = this.fast ? -2 : 0;
    const hz = (m) => 440 * Math.pow(2, (m - 69 + tr) / 12);
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.3) {
      const i = this.step % 64, m = this.MEL[i], dl = this.nextT - c.currentTime;
      if (m > 0) {
        let len = 1; while (this.MEL[(i + len) % 64] === -1 && len < 8) len++;
        this.tone(hz(m), beat * len * 0.95, 'triangle', 0.5, 0, dl, this.mus);
      }
      if (i % 2 === 0) {
        const root = this.BASS[Math.floor(i / 4)];
        this.tone(hz(i % 4 === 0 ? root : root + 7), beat * 0.9, 'sine', 0.75, 0, dl, this.mus);
      }
      this.nextT += beat; this.step++;
    }
  },
};

/* ══════════════════════════════════════════════════════════════════
   6. 길과 풍경 만들기
   조종점 → 부드러운 곡선 → 1칸 간격 표본. 표본 번호가 곧 '길을 따라 잰 거리'입니다.
   캐릭터는 길 둘레의 통로(반폭 hw) 안에서만 움직이고, 통로 밖은 빽빽한 숲입니다.
   ══════════════════════════════════════════════════════════════════ */
const CHUNK = 32;               // 풍경을 이 길이(z)마다 한 덩어리로 묶음 — 안 보이는 덩어리는 그리지 않음

function buildWorld(st, R) {
  const th = THEMES[st.theme];
  const W = { st, th, x: [], z: [], hw: [], tx: [], tz: [], cols: [], chunks: [], campsS: [] };

  /* ── 길 곡선 ── */
  const P = st.pts, raw = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 20; k++) {
      const t = k / 20, t2 = t * t, t3 = t2 * t;
      raw.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * t2 + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * t2 + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * t3),
      ]);
    }
  }
  raw.push(P[P.length - 1]);
  let prev = raw[0], need = 1;
  W.x.push(prev[0]); W.z.push(prev[1]);
  for (let i = 1; i < raw.length; i++) {
    const cur = raw[i];
    let seg = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (seg >= need) {
      const t = need / seg;
      prev = [lerp(prev[0], cur[0], t), lerp(prev[1], cur[1], t)];
      W.x.push(prev[0]); W.z.push(prev[1]);
      seg -= need; need = 1;
    }
    need -= seg; prev = cur;
  }
  const n = W.n = W.x.length;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = W.x[b] - W.x[a], dz = W.z[b] - W.z[a], l = Math.hypot(dx, dz) || 1;
    W.tx.push(dx / l); W.tz.push(dz / l);
  }
  /* ── 통로 반폭: 진지 자리는 넓게 ── */
  W.campsS = [st.home].concat(st.camps.map((c) => c.s));
  for (let i = 0; i < n; i++) {
    let w = PATH_WIDE + Math.sin(i * 0.21) * 0.7;
    for (const cs of W.campsS) {
      const d = Math.abs(i - cs);
      w = Math.max(w, lerp(CAMP_WIDE, PATH_WIDE, smooth((d - 12) / 9)));
    }
    W.hw.push(w);
  }

  /** 길 위의 자리: s=거리, u=오른쪽으로, v=앞으로 → [x, z] */
  W.at = (s, u, v) => {
    const i = clamp(Math.round(s + (v || 0)), 0, n - 1), j = clamp(Math.round(s), 0, n - 1);
    return [W.x[i] - W.tz[j] * (u || 0), W.z[i] + W.tx[j] * (u || 0)];
  };
  /** (x,z)에서 가장 가까운 길 표본 번호. hint 가 있으면 그 둘레만 찾음 */
  W.near = (x, z, hint) => {
    let best = 0, bd = 1e9, a = 0, b = n - 1;
    if (hint != null && hint >= 0) { a = Math.max(0, hint - 12); b = Math.min(n - 1, hint + 12); }
    for (let i = a; i <= b; i++) {
      const dx = x - W.x[i], dz = z - W.z[i], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  /** 통로 가장자리까지의 거리(안쪽이면 음수) */
  W.edge = (x, z) => {
    let e = 1e9;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(x - W.x[i], z - W.z[i]) - W.hw[i];
      if (d < e) e = d;
    }
    return e;
  };

  /* ── 땅 그림의 범위 ── */
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, W.x[i]); maxX = Math.max(maxX, W.x[i]);
    minZ = Math.min(minZ, W.z[i]); maxZ = Math.max(maxZ, W.z[i]);
  }
  W.minX = Math.floor(minX - 56); W.maxX = Math.ceil(maxX + 56);
  W.minZ = Math.floor(minZ - 52); W.maxZ = Math.ceil(maxZ + 40);
  const gw = W.maxX - W.minX, gh = W.maxZ - W.minZ;
  const maxTex = Math.min(R.gl.getParameter(R.gl.MAX_TEXTURE_SIZE) || 2048, 4096);
  W.ppu = Math.min(8, (maxTex - 2) / gh, (maxTex - 2) / gw);

  W.groundTex = R.texture(paintGround(W, st, th));
  buildScenery(W, st, th, R);

  W.dispose = () => {
    R.freeTexture(W.groundTex);
    for (const c of W.chunks) if (c) R.freeMesh(c.mesh);
    W.chunks = [];
  };
  return W;
}

/** 땅 그림(풀밭·길·진지 마당)을 2D 캔버스에 그림 */
function paintGround(W, st, th) {
  const ppu = W.ppu, cw = Math.round((W.maxX - W.minX) * ppu), ch = Math.round((W.maxZ - W.minZ) * ppu);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d');
  const rng = makeRng(st.seed * 31 + 5);
  const X = (x) => (x - W.minX) * ppu, Z = (z) => (z - W.minZ) * ppu;
  const n = W.n;

  /** 작은 캔버스에 그린 뒤 크게 늘려 붙임 → 가장자리가 부드럽게 번짐 */
  const soft = (sc, draw, alpha) => {
    const s = document.createElement('canvas');
    s.width = Math.ceil(cw / sc); s.height = Math.ceil(ch / sc);
    const q = s.getContext('2d');
    q.scale(1 / sc, 1 / sc);
    draw(q);
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(s, 0, 0, s.width * sc, s.height * sc);
    g.restore();
  };
  const disc = (q, x, z, r) => { q.beginPath(); q.arc(X(x), Z(z), r * ppu, 0, TAU); q.fill(); };

  // 숲 바닥
  g.fillStyle = cssC(th.forest); g.fillRect(0, 0, cw, ch);
  soft(10, (q) => {
    for (let k = 0; k < 420; k++) {
      q.fillStyle = cssC(rng() < 0.5 ? shade(th.forest, 0.84) : shade(th.forest, 1.14), 0.5);
      disc(q, W.minX + rng() * (W.maxX - W.minX), W.minZ + rng() * (W.maxZ - W.minZ), 3 + rng() * 7);
    }
  });
  // 풀밭 (통로)
  soft(10, (q) => {
    q.fillStyle = cssC(th.grassA);
    for (let i = 0; i < n; i += 2) disc(q, W.x[i], W.z[i], W.hw[i] + 1.6);
  });
  soft(8, (q) => {
    for (let k = 0; k < n * 2.2; k++) {
      const i = Math.floor(rng() * n), a = rng() * TAU, d = rng() * W.hw[i] * 0.9;
      q.fillStyle = cssC(rng() < 0.6 ? th.grassB : shade(th.grassA, 0.9), 0.55);
      disc(q, W.x[i] + Math.cos(a) * d, W.z[i] + Math.sin(a) * d, 1.2 + rng() * 2.6);
    }
  });
  // 진지 마당
  soft(8, (q) => {
    for (const cs of W.campsS) {
      const i = clamp(cs, 0, n - 1);
      q.fillStyle = cssC(th.camp, 0.55); disc(q, W.x[i], W.z[i], 12.5);
      q.fillStyle = cssC(th.camp, 0.9);  disc(q, W.x[i], W.z[i], 9.2);
    }
  });
  // 흙길
  const stroke = (q, w, col) => {
    q.strokeStyle = col; q.lineWidth = w * ppu; q.lineCap = 'round'; q.lineJoin = 'round';
    q.beginPath(); q.moveTo(X(W.x[0]), Z(W.z[0]));
    for (let i = 1; i < n; i++) q.lineTo(X(W.x[i]), Z(W.z[i]));
    q.stroke();
  };
  soft(4, (q) => { stroke(q, 4.4, cssC(th.trailD, 0.9)); });
  soft(3, (q) => { stroke(q, 3.1, cssC(th.trail)); });
  // 슬라임 둥지 둘레의 끈적 자국
  soft(6, (q) => {
    for (const c of st.camps) {
      const i = clamp(c.s, 0, n - 1);
      q.fillStyle = cssC(th.goo, 0.4); disc(q, W.x[i], W.z[i], 5.2);
      for (let k = 0; k < 16; k++) {
        const a = rng() * TAU, d = 3 + rng() * 8;
        q.fillStyle = cssC(th.goo, 0.45);
        disc(q, W.x[i] + Math.cos(a) * d, W.z[i] + Math.sin(a) * d, 0.6 + rng() * 1.5);
      }
    }
  });
  // 길 위 자갈
  for (let k = 0; k < n * 5; k++) {
    const i = Math.floor(rng() * n), a = rng() * TAU, d = rng() * 1.5;
    g.fillStyle = cssC(shade(th.trailD, 0.8 + rng() * 0.3), 0.7);
    g.beginPath(); g.arc(X(W.x[i] + Math.cos(a) * d), Z(W.z[i] + Math.sin(a) * d), (0.06 + rng() * 0.1) * ppu, 0, TAU); g.fill();
  }
  return cv;
}

/** 나무·덤불·바위·꽃 같은 풍경을 덩어리 메시로 굽고, 부딪히는 것은 W.cols 에 모음 */
function buildScenery(W, st, th, R) {
  const rng = makeRng(st.seed * 7919 + 13);
  const n = W.n;
  const chunkOf = (z) => {
    const k = clamp(Math.floor((z - W.minZ) / CHUNK), 0, 99);
    if (!W.chunks[k]) W.chunks[k] = { mb: new MB(), z0: W.minZ + k * CHUNK - 6, z1: W.minZ + (k + 1) * CHUNK + 6 };
    return W.chunks[k].mb;
  };
  const nearCamp = (i) => { for (const cs of W.campsS) if (Math.abs(i - cs) < 14) return true; return false; };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const cell = 2.5;
  for (let z = W.minZ + 2; z < W.maxZ - 2; z += cell) {
    for (let x = W.minX + 2; x < W.maxX - 2; x += cell) {
      const px = x + (rng() - 0.5) * cell * 0.8, pz = z + (rng() - 0.5) * cell * 0.8;
      // 통로 가장자리까지의 거리와 가장 가까운 길 표본
      let edge = 1e9, bi = 0, bd = 1e9;
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(px - W.x[i], pz - W.z[i]);
        if (d - W.hw[i] < edge) edge = d - W.hw[i];
        if (d < bd) { bd = d; bi = i; }
      }
      const r0 = rng(), b = chunkOf(pz);
      if (edge > 1.3) {
        // ── 숲 ──
        if (edge > 24) continue;
        const p = edge < 4 ? 0.82 : edge < 11 ? 0.64 : 0.5;
        if (r0 > p) continue;
        const s = 0.85 + rng() * 0.5 + (edge > 6 ? 0.18 : 0);
        if (rng() < th.pineP) pPine(b, px, pz, s * 1.05, shade(th.pine, 0.9 + rng() * 0.2), th.trunk);
        else pTree(b, px, pz, s, shade(pick(th.canopy), 0.94 + rng() * 0.12), th.trunk, rng);
      } else if (edge > 0.2) {
        // ── 통로 가장자리: 덤불과 바위가 울타리처럼 ──
        if (r0 < 0.42) pBush(b, px, pz, 0.8 + rng() * 0.5, pick(th.bush), rng);
        else if (r0 < 0.54) b.rock(px, 0.3, pz, 0.5 + rng() * 0.4, 0.45 + rng() * 0.3, 0.5 + rng() * 0.4, rng, K.stoneD, K.stone);
        else if (r0 < 0.62 && th.glow) pMush(b, px, pz, 1.6 + rng(), shade(th.mush, 2.2));
      } else if (edge < -1.0 && bd > 2.9 && !nearCamp(bi)) {
        // ── 통로 안: 밟고 지나가는 작은 꾸밈 ──
        if (r0 < 0.24) pTuft(b, px, pz, 0.8 + rng() * 0.6, shade(th.tuft, 0.9 + rng() * 0.25), rng);
        else if (r0 < 0.33) pFlower(b, px, pz, 0.8 + rng() * 0.5, pick(th.flower));
        else if (r0 < 0.36) pMush(b, px, pz, 0.8 + rng() * 0.7, th.glow ? shade(th.mush, 2.2) : th.mush);
        else if (r0 < 0.375 && th.pumpkin) pPumpkin(b, px, pz, 0.7 + rng() * 0.5);
        else if (r0 < 0.395 && edge > -3.6) {
          // 부딪히는 바위·그루터기는 벽 가까이에만
          if (rng() < 0.5) { const rr0 = 0.6 + rng() * 0.35; b.rock(px, 0.35, pz, rr0, 0.55, rr0, rng, K.stoneD, K.stone); W.cols.push({ x: px, z: pz, r: rr0 * 0.9 }); }
          else { pStump(b, px, pz, 1); W.cols.push({ x: px, z: pz, r: 0.62 }); }
        }
      }
      // 떨어진 잎(땅에 붙은 작은 조각)
      if (edge < 3 && rng() < 0.3) {
        const c = mixC(pick(th.fall), th.grassA, 0.3), a = rng() * TAU, s = 0.08 + rng() * 0.09, lx = px + rng() * 1.2, lz = pz + rng() * 1.2;
        const ca = Math.cos(a) * s, sa = Math.sin(a) * s, y = 0.03;
        b.quad([lx - sa * 1.7, y, lz + ca * 1.7], [lx + ca, y, lz + sa], [lx + sa * 1.7, y, lz - ca * 1.7], [lx - ca, y, lz - sa], th.glow ? shade(c, 0.9) : c, 0, true);
      }
    }
  }

  /* ── 출발 진지 꾸밈 ── */
  {
    const hs = st.home, bH = chunkOf(W.z[hs]);
    const fyaw = Math.atan2(-W.tx[hs], -W.tz[hs]);      // 울타리를 길과 직각으로
    for (let k = -4; k <= 4; k++) {            // 뒤쪽 울타리
      const p = W.at(hs, k * 1.75, -12.6);
      pFence(bH, p[0], p[1], fyaw);
    }
    const l1 = W.at(hs, -2.4, -1.6), l2 = W.at(hs, 2.5, -1.2);
    pLog(bH, l1[0], l1[1], 0.5, 0.8); pLog(bH, l2[0], l2[1], -0.6, 0.8);
    W.cols.push({ x: l1[0], z: l1[1], r: 0.6 }, { x: l2[0], z: l2[1], r: 0.6 });
    if (th.pumpkin) { const p = W.at(hs, -3.2, -10.5); pPumpkin(bH, p[0], p[1], 1.2); const q = W.at(hs, -2.2, -11.0); pPumpkin(bH, q[0], q[1], 0.8); }
  }
  /* ── 대왕의 마당: 돌기둥 ── */
  {
    const bs = st.camps[st.camps.length - 1].s, i0 = clamp(bs, 0, n - 1);
    for (let k = 0; k < 12; k++) {
      const a = TAU * k / 12 + 0.26, px = W.x[i0] + Math.cos(a) * 12.4, pz = W.z[i0] + Math.sin(a) * 12.4;
      if (Math.abs(Math.cos(a) * W.tx[i0] + Math.sin(a) * W.tz[i0]) > 0.86) continue;     // 길목은 비워 둠
      const b = chunkOf(pz);
      b.tube(px, 0, pz, 0.62, 0.5, 2.5 + (k % 3) * 0.5, 7, K.stoneD, 0, true, false, K.stone);
      W.cols.push({ x: px, z: pz, r: 0.75 });
    }
  }
  /* ── 밤길의 등불 ── */
  if (th.glow) {
    for (let s = 6; s < n - 4; s += 13) {
      if (nearCamp(s)) continue;
      const side = (Math.floor(s / 13) % 2) ? 1 : -1, p = W.at(s, side * 2.7, 0);
      pLantern(chunkOf(p[1]), p[0], p[1], [2.6, 2.3, 1.3]);
      W.cols.push({ x: p[0], z: p[1], r: 0.3 });
    }
  }

  for (const c of W.chunks) if (c) { c.mesh = R.mesh(c.mb); c.mb = null; }
}

/* ══════════════════════════════════════════════════════════════════
   7. 놀이 진행 — 판 만들기, 캐릭터, 싸움, 도토리, 발판
   ══════════════════════════════════════════════════════════════════ */
let R = null;                    // 렌더러
const MESH = {}, BAT = {};       // 모형과 인스턴스 묶음
let G = null;                    // 지금 하고 있는 판
const INPUT = { x: 0, z: 0, jx: 0, jz: 0, joy: null, keys: {} };
const CAM = { x: 0, z: 0, k: 1, kT: 1, fov: 38 * Math.PI / 180, eye: [0, 0, 0], tgt: [0, 0, 0] };
const UI = {};                   // 화면 표시 쪽에서 채우는 함수들 (toast, hud …)

function newGame(si, demo, cp) {
  if (G) disposeGame();
  const st = STAGES[si], W = buildWorld(st, R);
  G = {
    si, st, W, th: W.th, demo: !!demo, t: 0, won: false, winT: 0, startT: 0,
    acorns: 0, earned: 0, kills: 0, downs: 0, cleared: 0,
    allies: [], enemies: [], act: [], projs: [], coins: [], parts: [], pads: [], rings: [], floats: [],
    camps: [], base: -1, unlocked: {},
    lv: { tent: 0, hut: 0, tree: 0, atk: 0, hp: 0 },
    paid: { tent: 0, hut: 0, tree: 0, atk: 0, hp: 0 },
    trainT: { tent: 0, hut: 0, tree: 0 },
    fire: [0, 0], dyn: [], fh: [0, -1], hero: null,
    moved: false, shake: 0, leaves: [], bossOn: false, flagPop: 1, hudT: 0, payFx: 0, gate: 1e9, wallT: -99,
  };
  const hp = W.at(st.home, 0, 1.5);
  const h = G.hero = mkUnit('hero', hp[0], hp[1]);
  h.pop = 1; h.down = 0;
  G.allies.push(h);
  layoutBase(true);

  if (!demo) {
    st.camps.forEach((c, i) => spawnCamp(c, i));
    for (const p of st.patrols) spawnPatrol(p);
    // 출발 진지 둘레에 떨어져 있는 도토리 (첫 텐트 값)
    for (let k = 0; k < 9; k++) {
      const a = TAU * k / 9 + 0.4, p = W.at(st.home, Math.cos(a) * 3.4, 8.5 + Math.sin(a) * 2.2);
      G.coins.push({ x: p[0], z: p[1], y: 0.24, vx: 0, vy: 0, vz: 0, v: 1, t: 1, rest: true, spin: rnd() * TAU, mag: false });
    }
    if (cp) applyCheckpoint(cp);
    G.gate = gateS();
  } else {
    // 첫 화면 뒤 배경: 진지에 친구들이 모여 있는 모습
    G.lv.tent = 2; G.lv.hut = 1; G.lv.tree = 1; G.unlocked.guard = G.unlocked.slinger = true;
    layoutBase(true);
    ['thrower', 'thrower', 'thrower', 'guard', 'slinger', 'thrower'].forEach((k, i) => {
      const p = W.at(st.home, -3 + i * 1.2, 0.5 - (i % 2) * 1.4);
      const u = spawnAlly(k, p[0], p[1], true); u.pop = 1;
    });
  }
  // 흩날리는 잎(꽃잎·반딧불)
  for (let k = 0; k < 46; k++) G.leaves.push({ x: rr(-22, 22), y: rr(0.5, 9), z: rr(-26, 12), ph: rnd() * TAU, sp: rr(0.6, 1.3), c: G.th.fall[k % G.th.fall.length] });

  CAM.x = h.x; CAM.z = h.z - 3.2; CAM.k = demo ? 0.8 : 1.5; CAM.kT = demo ? 0.8 : 1;
  SND.fast = false;
  return G;
}
/* ── 이어서 하기: 마지막으로 차지한 진지와 그때의 건물·도토리를 기기에 적어 둠 ──
   (수업 시간이나 이용권 시간이 끝나 창이 닫혀도 다음에 그 진지에서 다시 출발) */
function saveCheckpoint() {
  if (!G || G.demo || G.won) return;
  SAVE.cp = { si: G.si, base: G.base, lv: G.lv, paid: G.paid, acorns: G.acorns, t: Math.round(G.t),
              earned: G.earned, kills: G.kills, downs: G.downs };
  writeSave();
}
function applyCheckpoint(cp) {
  const W = G.W, h = G.hero, num = (v) => (isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const base = clamp(cp.base | 0, -1, G.st.camps.length - 2);       // 대왕의 마당은 진지가 될 수 없음
  for (const id of PAD_ORDER) {
    G.lv[id] = clamp(num(cp.lv && cp.lv[id]), 0, PADS[id].costs.length);
    const cost = PADS[id].costs[G.lv[id]];
    G.paid[id] = cost == null ? 0 : clamp(num(cp.paid && cp.paid[id]), 0, cost - 1);
  }
  G.acorns = num(cp.acorns); G.t = num(cp.t); G.earned = num(cp.earned); G.kills = num(cp.kills); G.downs = num(cp.downs);
  if (base >= 0) {
    const bs = G.camps[base].s;
    for (const c of G.camps) {
      if (c.patrol ? c.s < bs : c.i <= base) {
        c.cleared = true; c.units = [];
        if (c.def.unlock) G.unlocked[c.def.unlock] = true;
      }
    }
    G.enemies = G.enemies.filter((e) => !(e.camp && e.camp.cleared));
    G.cleared = base + 1; G.base = base; G.coins = [];
  }
  layoutBase(true);
  const p = W.at(baseS(), 0, 1.5);
  h.x = p[0]; h.z = p[1]; h.pi = W.near(h.x, h.z, -1);
  h.maxHp = h.hp = allyHp('hero');
  // 건물에 있던 친구들도 함께 다시 모임
  let k = 0;
  for (const id of ['tent', 'hut', 'tree']) {
    const pd = PADS[id];
    for (let i = 0; i < pd.caps[G.lv[id]]; i++) {
      const q = W.at(baseS(), -3 + (k % 6) * 1.2, -1.2 - Math.floor(k / 6) * 1.2); k++;
      spawnAlly(pd.unit, q[0], q[1], true).pop = 1;
    }
  }
  G.moved = true;
}
function disposeGame() {
  if (!G) return;
  for (const p of G.pads) R.freeTexture(p.tex);
  G.W.dispose();
  G = null;
}

/* ── 캐릭터 만들기 ── */
function mkUnit(kind, x, z) {
  const d = UNITS[kind];
  return {
    kind, d, team: d.team, x, z, y: 0, vx: 0, vz: 0, kx: 0, kz: 0, yaw: d.team ? 0 : Math.PI,
    r: d.r, hp: d.hp, maxHp: d.hp, cd: rnd() * (d.cd || 1), tgt: null, think: rnd() * 0.3,
    flash: 0, walk: rnd() * TAU, mv: 0, atk: 0, hop: Math.floor(rnd() * 8), pop: 0, seed: rnd() * 100,
    dead: false, pi: G.W.near(x, z, -1), hitT: -99, sx: x, sz: z, si: 0,
  };
}
const allyHp  = (kind) => UNITS[kind].hp * (1 + PADS.hp.per * G.lv.hp);
const allyDmg = (u) => u.d.dmg * (1 + PADS.atk.per * G.lv.atk);
function spawnAlly(kind, x, z, quiet) {
  const u = mkUnit(kind, x, z);
  u.maxHp = u.hp = allyHp(kind);
  G.allies.push(u);
  if (!quiet) { SND.play('join'); puff(x, 0.6, z, 6, [1, 1, 1], 0.5); }
  return u;
}
function countAllies(kind) { let n = 0; for (const u of G.allies) if (u.kind === kind && !u.dead) n++; return n; }

function mkEnemy(kind, x, z, camp) {
  const e = mkUnit(kind, x, z), m = G.st.mult;
  e.maxHp = e.hp = e.d.hp * m.hp;
  e.hx = x; e.hz = z; e.wx = x; e.wz = z; e.wT = rnd() * 3; e.camp = camp || null; e.pop = 1;
  if (camp) e.yaw = Math.atan2(-G.W.tx[camp.s], -G.W.tz[camp.s]) + rr(-0.5, 0.5);
  G.enemies.push(e);
  return e;
}
function expand(o) { const a = []; for (const k in o) for (let i = 0; i < o[k]; i++) a.push(k); return a; }

/** 둥지 하나와 그 지킴이들을 배치 */
function spawnCamp(c, i) {
  const W = G.W, m = G.st.mult, p = W.at(c.s, 0, 0);
  const camp = { i, s: c.s, x: p[0], z: p[1], def: c, cleared: false, alert: 0, units: [], nest: null, boss: null,
                 spawnT: 5, comp: expand(c.guards), max: 0 };
  camp.max = camp.comp.length;
  G.camps.push(camp);
  if (c.boss) {
    const k = mkEnemy('king', p[0], p[1], camp);
    k.maxHp = k.hp = UNITS.king.hp * c.boss.hp * m.hp;
    k.slamT = 0; k.sq = 0; k.sumT = 6; k.barT = 4; k.rage = false;
    k.coinsN = UNITS.king.coins + 20 * G.si;
    camp.boss = k;
  } else {
    const nst = mkEnemy('nest', p[0], p[1], camp);
    nst.maxHp = nst.hp = UNITS.nest.hp * c.nest * m.hp;
    nst.coinsN = UNITS.nest.coins + 10 * i;          // 뒤쪽 둥지일수록 도토리를 더 많이 숨겨 둠
    camp.nest = nst;
  }
  // 지킴이: 출발 진지 쪽을 향한 부채꼴로
  const N = camp.comp.length;
  camp.comp.forEach((kind, k) => {
    const a = N > 1 ? lerp(-1.9, 1.9, k / (N - 1)) : 0, rad = (c.boss ? 6.5 : 4.6) + (k % 3) * 1.7;
    const q = W.at(c.s, Math.sin(a) * rad, -Math.cos(a) * rad * 0.9 - 1.2);
    camp.units.push(mkEnemy(kind, q[0], q[1], camp));
  });
  const tp = [[-5.8, -7], [5.8, -7], [0, 6.2]];
  for (let k = 0; k < (c.turrets || 0); k++) {
    const q = W.at(c.s, tp[k % 3][0], tp[k % 3][1]);
    mkEnemy('turret', q[0], q[1], camp);
  }
}
/** 길 중간을 어슬렁거리는 무리 */
function spawnPatrol(p) {
  const list = expand(p.units), W = G.W;
  const grp = { i: -1, s: p.s, x: W.x[p.s], z: W.z[p.s], def: {}, cleared: false, alert: 0, units: [], patrol: true };
  G.camps.push(grp);
  list.forEach((kind, k) => {
    const a = TAU * k / list.length, q = W.at(p.s, Math.cos(a) * 2.6, Math.sin(a) * 2.2);
    grp.units.push(mkEnemy(kind, q[0], q[1], grp));
  });
}

/** 끈적 벽: 아직 무너뜨리지 않은 둥지 바로 뒤를 가로막음 → 둥지를 건너뛰고 지나갈 수 없음.
    돌려주는 값은 우리 편이 갈 수 있는 가장 먼 자리(길을 따라 잰 거리) */
function gateS() {
  for (const c of G.camps) if (!c.patrol && !c.cleared && !c.def.boss) return Math.min(G.W.n - 1, c.s + 15);
  return 1e9;
}
function popWall(g) {
  const W = G.W;
  if (g > W.n - 1) return;
  for (let lat = -W.hw[g]; lat <= W.hw[g]; lat += 1.3)
    puff(W.x[g] - W.tz[g] * lat, 0.7, W.z[g] + W.tx[g] * lat, 3, G.th.goo, 0.8, 3);
}
/** 지금 진지의 자리(길을 따라 잰 거리) */
function baseS() { return G.base < 0 ? G.st.home : G.camps[G.base].s; }

/** 지금 진지에 발판·건물·모닥불을 놓음 (진지를 옮길 때마다 다시 부름) */
function layoutBase(first) {
  const W = G.W, s = baseS();
  const old = {};
  for (const p of G.pads) old[p.id] = p;
  const pads = [];
  for (const id of PAD_ORDER) {
    const p = PADS[id];
    if (p.need && !G.unlocked[p.need]) continue;
    const q = W.at(s, p.u, p.v);
    const pad = old[id] || { id, p, stay: 0, payT: 0, pulse: 0, tex: null, cv: null, dirty: true, isNew: !first, bpop: 0, drawnT: -1 };
    pad.x = q[0]; pad.z = q[1]; pad.dirty = true;
    if (p.unit) { const bq = W.at(s, p.bu, p.bv); pad.bx = bq[0]; pad.bz = bq[1]; if (G.lv[id] > 0 && !first) pad.bpop = 0; else if (first) pad.bpop = G.lv[id] > 0 ? 1 : 0; }
    pads.push(pad);
  }
  G.pads = pads;
  G.fire = W.at(s, 0, 0);
  G.flagPop = first ? 1 : 0;
  // 부딪히는 것: 모닥불과 지어진 건물
  G.dyn = [{ x: G.fire[0], z: G.fire[1], r: 0.95 }];
  for (const pad of pads) if (pad.p.unit && G.lv[pad.id] > 0) G.dyn.push({ x: pad.bx, z: pad.bz, r: 1.55 });
}

/* ── 작은 효과들 ── */
function puff(x, y, z, n, col, size, spd, emis) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 320) G.parts.shift();
    const a = rnd() * TAU, s = (spd || 2.2) * (0.4 + rnd() * 0.8);
    G.parts.push({ kind: 0, x, y, z, vx: Math.cos(a) * s, vy: rr(0.6, 2.4), vz: Math.sin(a) * s, life: 0, max: rr(0.35, 0.6),
                   s0: (size || 0.5) * rr(0.5, 0.9), s1: (size || 0.5) * rr(1.1, 1.7), c: col, a: 0.85, g: -1.5, emis: emis || 0 });
  }
}
function confetti(x, y, z, n, cols, spd) {
  for (let i = 0; i < n; i++) {
    if (G.parts.length > 320) G.parts.shift();
    const a = rnd() * TAU, s = (spd || 4) * (0.4 + rnd() * 0.9);
    G.parts.push({ kind: 1, x, y, z, vx: Math.cos(a) * s, vy: rr(4, 9), vz: Math.sin(a) * s, life: 0, max: rr(0.9, 1.6),
                   s0: rr(0.35, 0.6), s1: 0.3, c: cols[i % cols.length], a: 1, g: 14, rot: rnd() * TAU, vr: rr(-9, 9), emis: 0.4 });
  }
}
function ring(x, z, r, dur, col) { G.rings.push({ x, z, r, t: 0, dur, col }); }
function floatText(x, y, z, txt, col) { G.floats.push({ x, y, z, txt, col: col || '#fff', t: 0 }); }

/* ── 싸움 ── */
/** u 가 t 를 때릴 수 있는 거리까지 남은 틈 (0 이하면 닿음) */
function gap(u, t) {
  return Math.hypot(t.x - u.x, t.z - u.z) - t.r - (u.d.melee ? u.r : 0) - u.d.range;
}
/** 우리 편이 노릴 슬라임 고르기: 가까운 순, 둥지는 조금 뒤로 미룸 */
function pickFoe(u, reach) {
  let best = null, bs = 1e9;
  for (const e of G.act) {
    if (e.dead || e.fuse != null) continue;
    const d = Math.hypot(e.x - u.x, e.z - u.z) - e.r;
    if (d > reach) continue;
    const sc = d + (e.d.building ? 2.5 : 0) + (e === u.tgt ? -0.8 : 0);
    if (sc < bs) { bs = sc; best = e; }
  }
  return best;
}
function fire(u, t, kind, dmg) {
  const p = PROJ[kind], sc = u.d.scale || 1;
  const ox = u.x + Math.sin(u.yaw) * 0.3 * sc, oz = u.z + Math.cos(u.yaw) * 0.3 * sc, oy = (u.d.fixed ? 0.5 : 0.95) * sc;
  let tx = t.x, tz = t.z;
  if (!p.homing) { tx += t.vx * 0.25; tz += t.vz * 0.25; }        // 살짝 앞을 겨냥 — 계속 움직이면 피할 수 있음
  const d = Math.hypot(tx - ox, tz - oz);
  G.projs.push({ kind, p, team: u.team, x: ox, y: oy, z: oz, sx: ox, sy: oy, sz: oz, tx, tz, ty: p.homing ? 0.45 * (t.d.scale || 1) : 0.2,
                 tgt: p.homing ? t : null, t: 0, dur: Math.max(0.12, d / p.speed), dmg, spin: rnd() * TAU, src: u });
}
function hurt(t, dmg, sx, sz) {
  if (t.dead || G.won) return;
  if (t === G.hero && t.down > 0) return;
  t.hp -= dmg; t.flash = 1; t.hitT = G.t;
  if (t.team === 1) {
    if (t.camp) t.camp.alert = 8;
    if (!t.d.fixed && sx != null) {
      const dx = t.x - sx, dz = t.z - sz, l = Math.hypot(dx, dz) || 1, k = 2.4 / Math.max(1, t.r * 2.2);
      t.kx += dx / l * k; t.kz += dz / l * k;
    }
    SND.play('hit');
  } else if (t === G.hero) SND.play('hurt');
  if (t.hp <= 0) kill(t);
}
function kill(t) {
  if (t.dead) return;
  t.dead = true; t.hp = 0;
  if (t.team === 1) {
    const d = t.d, sc = d.scale || 1;
    G.kills += d.building ? 0 : 1;
    dropCoins(t.x, t.z, t.coinsN != null ? t.coinsN : d.coins, t.r);
    puff(t.x, 0.5 * sc, t.z, d.building || d.boss ? 22 : 8, d.col, 0.7 * Math.min(2.2, sc), 3.2 * Math.min(2, sc));
    SND.play('pop');
    const c = t.camp;
    if (c) {
      const k = c.units.indexOf(t); if (k >= 0) c.units.splice(k, 1);
      if (c.patrol && !c.units.length) c.cleared = true;
      if (t === c.nest || t === c.boss) liberate(c);
    }
  } else if (t === G.hero) {
    heroDown();
  } else {
    puff(t.x, 0.6, t.z, 7, t.d.hood, 0.55);
    confetti(t.x, 0.8, t.z, 4, G.th.fall, 2.5);
  }
}
/** 도토리 떨구기. 많이 나올 때는 5개짜리 황금 도토리로 묶음 */
function dropCoins(x, z, n, r) {
  while (n > 0) {
    const v = n >= 8 ? 5 : 1; n -= v;
    const a = rnd() * TAU, s = rr(1.5, 4.2) + (r || 0);
    if (G.coins.length > 260) { const o = G.coins.shift(); G.acorns += o.v; G.earned += o.v; }
    G.coins.push({ x, z, y: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rr(5, 9), v, t: 0, rest: false, spin: rnd() * TAU, mag: false });
  }
}

/** 둥지를 무너뜨림 → 진지를 옮기고 새 건물을 엶 */
function liberate(c) {
  c.cleared = true; G.cleared++;
  for (const e of G.enemies) if (e.camp === c && !e.dead) e.fuse = 0.12 + rnd() * 0.7;      // 남은 슬라임은 차례로 펑
  G.shake = Math.max(G.shake, 0.7);
  confetti(c.x, 1.5, c.z, 40, [G.th.goo, [1, 1, 1], K.gold], 6);
  for (const co of G.coins) co.mag = true;                                                  // 흩어진 도토리는 한꺼번에 모임
  if (c.def.boss) { win(); return; }
  SND.play('camp');
  if (c.def.unlock) G.unlocked[c.def.unlock] = true;
  G.base = c.i;
  popWall(G.gate); G.gate = gateS();                 // 길을 막던 끈적 벽이 터지며 다음 길이 열림
  layoutBase(false);
  for (const u of G.allies) { u.hp = u.maxHp; u.cheer = 1.6; }
  UI.toast('🏴 둥지를 무너뜨렸어요! 진지를 옮겨요', true);
  if (c.def.unlock === 'guard') UI.toast('🛡️ 새 건물: 방패 오두막');
  if (c.def.unlock === 'slinger') UI.toast('🎯 새 건물: 새총 나무집');
  UI.track();
  saveCheckpoint();
}
function heroDown() {
  const h = G.hero;
  h.dead = false; h.hp = 0; h.down = 3.0; h.vx = h.vz = 0; h.tgt = null;
  G.downs++;
  SND.play('down');
  puff(h.x, 0.8, h.z, 14, [1, 1, 1], 0.7);
  // 친구들은 먼저 진지로 돌아가 기다림
  const W = G.W, s = baseS();
  let k = 0;
  for (const u of G.allies) {
    if (u === h) continue;
    puff(u.x, 0.6, u.z, 4, u.d.hood, 0.5);
    const p = W.at(s, -3 + (k % 6) * 1.2, -4.5 - Math.floor(k / 6) * 1.2); k++;
    u.x = p[0]; u.z = p[1]; u.pi = W.near(u.x, u.z, -1); u.hp = u.maxHp; u.tgt = null; u.vx = u.vz = 0;
  }
  for (const c of G.camps) c.alert = 0;
  for (const e of G.enemies) e.tgt = null;
  UI.down(true);
}
function respawn() {
  const h = G.hero, p = G.W.at(baseS(), 0, -2.5);
  h.x = p[0]; h.z = p[1]; h.pi = G.W.near(h.x, h.z, -1); h.hp = h.maxHp; h.down = 0; h.pop = 0; h.flash = 0;
  CAM.x = h.x; CAM.z = h.z - 3.2;
  puff(h.x, 0.8, h.z, 12, HOOD.hero, 0.7);
  UI.down(false);
}
function win() {
  G.won = true; G.winT = 0;
  SND.stopMusic(); SND.play('win');
  for (const u of G.allies) u.hp = u.maxHp;
  UI.toast('🎉 숲을 되찾았어요!', true);
  UI.track();
  if (SAVE.cp && SAVE.cp.si === G.si) { SAVE.cp = null; writeSave(); }      // 다 깼으니 이어하기 기록은 지움
}

/* ── 매 프레임 진행 ── */
function step(dt) {
  const h = G.hero;
  if (!G.won && !G.demo && h.down <= 0) G.t += dt;
  if (G.won) G.winT += dt;
  G.startT += dt;

  // 대장 근처의 슬라임만 깨워서 움직임
  G.act.length = 0;
  for (const e of G.enemies) if (!e.dead && Math.abs(e.z - h.z) < 48 && Math.abs(e.x - h.x) < 48) G.act.push(e);

  updHero(dt);
  layoutSlots();
  for (const u of G.allies) if (u !== h) updFollower(u, dt);
  for (let i = 0; i < G.act.length; i++) updEnemy(G.act[i], dt);
  collide(dt);
  updProjs(dt);
  updCoins(dt);
  updPads(dt);
  updCamps(dt);
  updFx(dt);

  // 쓰러진 것 치우기
  let dirty = false;
  for (const e of G.enemies) if (e.dead) { dirty = true; break; }
  if (dirty) G.enemies = G.enemies.filter((e) => !e.dead);
  dirty = false;
  for (const u of G.allies) if (u.dead) { dirty = true; break; }
  if (dirty) G.allies = G.allies.filter((u) => !u.dead);

  updCamera(dt);
}

function regen(u, dt) {
  if (u.hp >= u.maxHp) return;
  if (Math.hypot(u.x - G.fire[0], u.z - G.fire[1]) < HEAL_R) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.30 * dt);   // 모닥불 곁
  else if (G.t - u.hitT > 4) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.06 * dt);                                 // 한동안 안 맞았을 때
}

function updHero(dt) {
  const h = G.hero, d = h.d;
  if (h.pop < 1) h.pop = Math.min(1, h.pop + dt * 3);
  h.flash = Math.max(0, h.flash - dt * 6);
  if (h.down > 0) { h.down -= dt; if (h.down <= 0) respawn(); return; }
  let ix = INPUT.x, iz = INPUT.z;
  if (G.demo) { ix = Math.cos(G.startT * 0.5) * 0.4; iz = Math.sin(G.startT * 0.5) * 0.4; }
  if (G.won) ix = iz = 0;
  if ((ix || iz) && !G.demo) G.moved = true;
  h.vx = damp(h.vx, ix * d.speed, 14, dt); h.vz = damp(h.vz, iz * d.speed, 14, dt);
  h.x += h.vx * dt; h.z += h.vz * dt;
  const v = Math.hypot(h.vx, h.vz);
  h.mv = damp(h.mv, v > 0.5 ? 1 : 0, 12, dt);
  h.walk += v * dt * 2.3;

  h.think -= dt;
  if (h.think <= 0) { h.think = 0.12; h.tgt = pickFoe(h, d.range); }
  if (h.tgt && (h.tgt.dead || h.tgt.fuse != null)) h.tgt = null;

  // 몸 방향과 대형이 바라보는 방향
  let fx = G.fh[0], fz = G.fh[1];
  if (v > 1.2) {
    h.yaw = turnTo(h.yaw, Math.atan2(h.vx, h.vz), 12 * dt);
    fx = damp(fx, h.vx / v, 4, dt); fz = damp(fz, h.vz / v, 4, dt);
  } else if (h.tgt) {
    const a = Math.atan2(h.tgt.x - h.x, h.tgt.z - h.z);
    h.yaw = turnTo(h.yaw, a, 10 * dt);
    fx = damp(fx, Math.sin(a), 2.5, dt); fz = damp(fz, Math.cos(a), 2.5, dt);
  }
  const fl = Math.hypot(fx, fz) || 1; G.fh[0] = fx / fl; G.fh[1] = fz / fl;

  h.cd -= dt; h.atk = Math.max(0, h.atk - dt * 3.4);
  if (h.tgt && h.cd <= 0 && gap(h, h.tgt) <= 0.3) {
    h.cd = d.cd; h.atk = 1;
    fire(h, h.tgt, d.proj, allyDmg(h)); SND.play('throw');
  }
  regen(h, dt);
}

/** 원정대 대형: 방패는 앞줄, 도토리는 뒤로 줄지어, 새총은 맨 뒤 */
function layoutSlots() {
  const h = G.hero, fx = G.fh[0], fz = G.fh[1], rx = -fz, rz = fx;
  let ng = 0, nt = 0, ns = 0;
  for (const u of G.allies) {
    if (u === h) continue;
    if (u.kind === 'guard') u.si = ng++; else if (u.kind === 'thrower') u.si = nt++; else u.si = ns++;
  }
  const rowsT = Math.ceil(nt / 5);
  for (const u of G.allies) {
    if (u === h) continue;
    let f, s;
    const row = Math.floor(u.si / 5), col = u.si % 5;
    if (u.kind === 'guard') {
      const cnt = Math.min(5, ng - row * 5);
      f = 2.0 + row * 1.2; s = (col - (cnt - 1) / 2) * 1.3;
    } else if (u.kind === 'thrower') {
      const cnt = Math.min(5, nt - row * 5);
      f = -1.5 - row * 1.2; s = (col - (cnt - 1) / 2) * 1.2;
    } else {
      const cnt = Math.min(5, ns - row * 5);
      f = -1.5 - (rowsT + row) * 1.2; s = (col - (cnt - 1) / 2) * 1.2;
    }
    u.sx = h.x + fx * f + rx * s; u.sz = h.z + fz * f + rz * s;
  }
}

function updFollower(u, dt) {
  const d = u.d, h = G.hero, W = G.W;
  if (u.pop < 1) u.pop = Math.min(1, u.pop + dt * 3);
  u.flash = Math.max(0, u.flash - dt * 6);
  if (u.cheer > 0) u.cheer -= dt;
  u.cd -= dt; u.atk = Math.max(0, u.atk - dt * 3.4);
  u.think -= dt;
  if (u.think <= 0) { u.think = 0.16 + rnd() * 0.1; u.tgt = pickFoe(u, d.melee ? 6.2 : d.range + 1.0); }
  let t = u.tgt;
  if (t && (t.dead || t.fuse != null)) t = u.tgt = null;

  let gx = u.sx, gz = u.sz;
  if (h.down > 0 || G.won) { gx = u.x; gz = u.z; t = null; }
  else if (Math.abs(u.pi - h.pi) > 16) {
    // 대장과 멀리 떨어진 친구(막 훈련을 마침): 길을 따라 달려감
    const j = clamp(u.pi + (h.pi > u.pi ? 5 : -5), 0, W.n - 1);
    gx = W.x[j]; gz = W.z[j]; t = null;
  } else if (t) {
    const dx = t.x - u.x, dz = t.z - u.z, dd = Math.hypot(dx, dz) || 1, g = gap(u, t);
    if (g > -0.15) {
      // 닿을 만큼 다가감 — 다만 제자리에서 leash 넘게 벗어나지는 않음
      const want = dd - g - 0.3;
      let px = t.x - dx / dd * want, pz = t.z - dz / dd * want;
      const ox = px - u.sx, oz = pz - u.sz, ol = Math.hypot(ox, oz);
      if (ol > d.leash) { px = u.sx + ox / ol * d.leash; pz = u.sz + oz / ol * d.leash; }
      gx = px; gz = pz;
    } else {
      // 닿는 거리 안: 자리를 지키되, 대장에게서 너무 멀어지면 따라감
      const ox = u.x - u.sx, oz = u.z - u.sz, ol = Math.hypot(ox, oz);
      if (ol > d.leash) { gx = u.sx + ox / ol * d.leash; gz = u.sz + oz / ol * d.leash; } else { gx = u.x; gz = u.z; }
    }
  }
  const mx = gx - u.x, mz = gz - u.z, ml = Math.hypot(mx, mz);
  const sp = d.speed * (Math.hypot(h.x - u.x, h.z - u.z) > 7 ? 1.5 : 1.08);
  let tvx = 0, tvz = 0;
  if (ml > 0.1) { const k = Math.min(1, ml / 0.7) * sp; tvx = mx / ml * k; tvz = mz / ml * k; }
  u.vx = damp(u.vx, tvx, 12, dt); u.vz = damp(u.vz, tvz, 12, dt);
  u.x += u.vx * dt; u.z += u.vz * dt;
  const v = Math.hypot(u.vx, u.vz);
  u.mv = damp(u.mv, v > 0.5 ? 1 : 0, 12, dt);
  u.walk += v * dt * 2.6;

  if (t) u.yaw = turnTo(u.yaw, Math.atan2(t.x - u.x, t.z - u.z), 12 * dt);
  else if (v > 1) u.yaw = turnTo(u.yaw, Math.atan2(u.vx, u.vz), 12 * dt);
  else u.yaw = turnTo(u.yaw, h.yaw, 5 * dt);

  if (t && u.cd <= 0 && gap(u, t) <= 0.3) {
    u.cd = d.cd * rr(0.92, 1.08); u.atk = 1;
    if (d.melee) hurt(t, allyDmg(u), u.x, u.z);
    else { fire(u, t, d.proj, allyDmg(u)); SND.play('throw'); }
  }
  regen(u, dt);
}

function updEnemy(e, dt) {
  const d = e.d, camp = e.camp, m = G.st.mult, h = G.hero;
  e.flash = Math.max(0, e.flash - dt * 6);
  if (e.pop < 1) e.pop = Math.min(1, e.pop + dt * 2.6);
  if (e.fuse != null) { e.fuse -= dt; e.flash = 0.6; if (e.fuse <= 0) kill(e); return; }
  if (d.building) return;
  e.cd -= dt; e.atk = Math.max(0, e.atk - dt * 3);

  // 누구를 노릴지: 가까운 우리 편. 집에서 너무 멀리까지는 쫓아가지 않음
  e.think -= dt;
  if (e.think <= 0) {
    e.think = 0.22 + rnd() * 0.16;
    const alert = camp && camp.alert > 0;
    const ag = d.fixed ? d.range + 0.5 : alert ? 15 : d.boss ? 12 : 8.5;
    const leash = d.boss ? 15 : 19;
    let best = null, bs = 1e9;
    if (h.down <= 0 && !G.won) for (const a of G.allies) {
      if (a.dead) continue;
      const dd = Math.hypot(a.x - e.x, a.z - e.z) - a.r;
      if (dd > ag) continue;
      if (!d.fixed && Math.hypot(a.x - e.hx, a.z - e.hz) > leash) continue;
      const sc = dd + (a === e.tgt ? -1 : 0) + (a.kind === 'guard' ? -1.2 : 0);     // 방패 다람이 눈길을 끎
      if (sc < bs) { bs = sc; best = a; }
    }
    if (best && camp) camp.alert = Math.max(camp.alert, 5);
    e.tgt = best;
  }
  let t = e.tgt;
  if (t && t.dead) t = e.tgt = null;

  if (d.fixed) {                // 뿜뿜 버섯: 돌아보고 쏘기만 함
    if (t) {
      e.yaw = turnTo(e.yaw, Math.atan2(t.x - e.x, t.z - e.z), 4 * dt);
      if (e.cd <= 0 && gap(e, t) <= 0) { e.cd = d.cd; e.atk = 1; fire(e, t, d.proj, d.dmg * m.dmg); SND.play('spit'); }
    }
    return;
  }
  if (d.boss) bossBrain(e, dt);
  const busy = d.boss && e.slamT > 0;

  let gx = e.x, gz = e.z, moving = false, sp = d.speed * (e.rage ? 1.35 : 1);
  if (t && !busy) {
    const g = gap(e, t);
    if (g > (d.melee ? -0.05 : -d.range * 0.15)) { gx = t.x; gz = t.z; moving = true; }
    if (g <= 0.25 && e.cd <= 0) {
      e.cd = d.cd * (e.rage ? 0.7 : 1);
      if (d.boss) { e.slamT = 0.9; ring(e.x, e.z, d.slam, 0.9, [1, 0.35, 0.3]); SND.play('warn'); }
      else if (d.melee) { e.atk = 1; hurt(t, d.dmg * m.dmg, e.x, e.z); }
      else { e.atk = 1; fire(e, t, d.proj, d.dmg * m.dmg); SND.play('spit'); }
    }
  } else if (!busy) {
    const dh = Math.hypot(e.hx - e.x, e.hz - e.z);
    if (dh > 2.2) { gx = e.hx; gz = e.hz; moving = true; }
    else if (!d.boss) {
      e.wT -= dt;
      if (e.wT <= 0) { e.wT = rr(2, 5); e.wx = e.hx + rr(-1.3, 1.3); e.wz = e.hz + rr(-1.3, 1.3); }
      if (Math.hypot(e.wx - e.x, e.wz - e.z) > 0.4) { gx = e.wx; gz = e.wz; moving = true; sp *= 0.45; }
    }
    // 싸움이 끝나면 스스로 낫는다. 대왕은 아주 천천히 → 물러났다 다시 와도 깎아 둔 체력이 거의 그대로
    if (!(camp && camp.alert > 0) && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (d.boss ? 0.006 : 0.10) * dt);
  }

  // 통통 뛰며 이동: 공중에 떠 있는 동안만 나아감
  let tvx = 0, tvz = 0;
  if (moving) {
    e.hop += dt / d.hop;
    const ph = e.hop % 1, k = (ph > 0.12 && ph < 0.88) ? 1.28 : 0.12;
    const mx = gx - e.x, mz = gz - e.z, ml = Math.hypot(mx, mz) || 1;
    tvx = mx / ml * sp * k; tvz = mz / ml * sp * k;
    e.yaw = turnTo(e.yaw, Math.atan2(mx, mz), 7 * dt);
  } else {
    const nx = e.hop + dt / d.hop;
    if (e.hop % 1 > 0.001) e.hop = Math.floor(nx) > Math.floor(e.hop) ? Math.floor(nx) : nx;      // 뛰던 걸음은 마저 착지
    if (t) e.yaw = turnTo(e.yaw, Math.atan2(t.x - e.x, t.z - e.z), 7 * dt);
  }
  e.vx = damp(e.vx, tvx, 16, dt); e.vz = damp(e.vz, tvz, 16, dt);
  e.kx = damp(e.kx, 0, 9, dt); e.kz = damp(e.kz, 0, 9, dt);
  e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
}

/** 슬라임 대왕: 내려찍기(빨간 원이 미리 보임) · 부하 부르기 · 끈적 폭탄 */
function bossBrain(e, dt) {
  const d = e.d, c = e.camp, m = G.st.mult, bd = c.def.boss, alert = c.alert > 0;
  if (e.sq > 0) e.sq -= dt;
  if (alert && !G.bossOn) { G.bossOn = true; SND.fast = true; UI.boss(true); UI.toast('👑 슬라임 대왕이 나타났어요!', true); }
  if (!e.rage && e.hp < e.maxHp * 0.4) { e.rage = true; UI.toast('😡 슬라임 대왕이 화났어요!'); }
  if (e.slamT > 0) {
    e.slamT -= dt;
    if (e.slamT <= 0) {
      e.sq = 0.3; G.shake = Math.max(G.shake, 0.9); SND.play('slam');
      puff(e.x, 0.4, e.z, 24, [1, 1, 1], 0.9, 6);
      for (const a of G.allies)
        if (!a.dead && Math.hypot(a.x - e.x, a.z - e.z) < d.slam + a.r) hurt(a, d.dmg * m.dmg * (a === G.hero ? 1 : 0.6), e.x, e.z);
    }
  }
  if (!alert) return;
  e.sumT -= dt;
  if (e.sumT <= 0 && e.hp < e.maxHp * 0.8) {
    e.sumT = e.rage ? 8 : 11;
    if (c.units.length < 10) {
      for (let k = 0; k < 3; k++) {
        const a = rnd() * TAU, s = mkEnemy(bd.summon, e.x + Math.cos(a) * 3.4, e.z + Math.sin(a) * 3.4, c);
        s.pop = 0; c.units.push(s);
        puff(s.x, 0.5, s.z, 5, s.d.col, 0.6);
      }
      SND.play('spit');
    }
  }
  if (bd.barrage) {
    e.barT -= dt;
    if (e.barT <= 0) {
      e.barT = e.rage ? 4.5 : 6.5; e.atk = 1; SND.play('spit');
      for (let k = 0; k < bd.barrage; k++) {
        let tx, tz;
        if (k % 2 === 0) { const a = G.allies[Math.floor(rnd() * G.allies.length)]; tx = a.x + rr(-1.2, 1.2); tz = a.z + rr(-1.2, 1.2); }
        else { const a = TAU * k / bd.barrage + rnd(), rad = rr(5, 10); tx = e.x + Math.cos(a) * rad; tz = e.z + Math.sin(a) * rad; }
        const dur = 1.3 + rnd() * 0.4;
        G.projs.push({ kind: 'bomb', p: PROJ.bomb, team: 1, x: e.x, y: 3, z: e.z, sx: e.x, sy: 3, sz: e.z, tx, tz, ty: 0.2,
                       tgt: null, t: 0, dur, dmg: d.dmg * 0.55 * m.dmg, spin: 0, src: e });
        ring(tx, tz, PROJ.bomb.splash, dur, [0.85, 0.4, 1]);
      }
    }
  }
}

/** 겹침 풀기 · 바위/건물 · 통로 벽 */
const _all = [];
const massOf = (u) => (u.d.fixed ? 1e6 : u.d.boss ? 40 : u.kind === 'hero' ? 6 : u.kind === 'brute' ? 6 : u.kind === 'guard' ? 2 : 1);
function collide(dt) {
  const W = G.W, h = G.hero;
  _all.length = 0;
  for (const u of G.allies) if (!u.dead && !(u === h && h.down > 0)) _all.push(u);
  for (const e of G.act) if (!e.dead) _all.push(e);
  const n = _all.length;
  for (let i = 0; i < n; i++) {
    const a = _all[i];
    for (let j = i + 1; j < n; j++) {
      const b = _all[j];
      const dx = b.x - a.x, dz = b.z - a.z, rs = (a.r + b.r) * 0.92, d2 = dx * dx + dz * dz;
      if (d2 >= rs * rs) continue;
      if (a.d.fixed && b.d.fixed) continue;
      const dd = Math.sqrt(d2) || 0.001, push = rs - dd, nx = d2 < 1e-6 ? 1 : dx / dd, nz = d2 < 1e-6 ? 0 : dz / dd;
      const wa = massOf(a), wb = massOf(b), tot = wa + wb;
      a.x -= nx * push * (wb / tot); a.z -= nz * push * (wb / tot);
      b.x += nx * push * (wa / tot); b.z += nz * push * (wa / tot);
    }
  }
  for (let i = 0; i < n; i++) {
    const u = _all[i];
    if (u.d.fixed) continue;
    for (let k = 0; k < 2; k++) {
      const list = k ? G.dyn : W.cols;
      for (const c of list) {
        const dx = u.x - c.x, dz = u.z - c.z, rs = u.r + c.r;
        if (Math.abs(dx) > rs || Math.abs(dz) > rs) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rs * rs) continue;
        const dd = Math.sqrt(d2) || 0.001, nx = dx / dd, nz = dz / dd;
        u.x = c.x + nx * rs; u.z = c.z + nz * rs;
        // 장애물을 정면으로 들이받고 있으면 옆으로 미끄러져 돌아감 (모닥불·바위에 걸려 멈추지 않게)
        const sp = Math.hypot(u.vx, u.vz);
        if (sp > 0.5) {
          const into = -(u.vx * nx + u.vz * nz) / sp;
          if (into > 0.6) {
            let side = -u.vx * nz + u.vz * nx;                       // 이미 기울어 있는 쪽으로
            if (Math.abs(side) < 0.08 * sp) side = (u.seed % 2 < 1) ? 1 : -1;
            const kk = Math.sign(side) * sp * dt * into;
            u.x += -nz * kk; u.z += nx * kk;
          }
        }
      }
    }
    // 통로 밖(숲)으로는 못 나감
    let pi = u.pi = W.near(u.x, u.z, u.pi);
    if (u.team === 0 && pi > G.gate) {
      // 끈적 벽 너머로는 못 감: 옆자리는 그대로 두고 벽 앞으로 되돌림
      const g = G.gate, lat = (u.x - W.x[pi]) * -W.tz[pi] + (u.z - W.z[pi]) * W.tx[pi];
      u.x = W.x[g] - W.tz[g] * lat; u.z = W.z[g] + W.tx[g] * lat;
      pi = u.pi = g;
      if (u === h) G.wallT = G.t;
    }
    const dx = u.x - W.x[pi], dz = u.z - W.z[pi], dd = Math.hypot(dx, dz), lim = W.hw[pi] - u.r;
    if (dd > lim) { u.x = W.x[pi] + dx / dd * lim; u.z = W.z[pi] + dz / dd * lim; }
  }
}

function updProjs(dt) {
  let dead = false;
  for (const p of G.projs) {
    p.t += dt / p.dur; p.spin += dt * 14;
    if (p.tgt) { if (p.tgt.dead) p.tgt = null; else { p.tx = p.tgt.x; p.tz = p.tgt.z; } }
    const k = Math.min(1, p.t);
    p.x = lerp(p.sx, p.tx, k); p.z = lerp(p.sz, p.tz, k);
    p.y = lerp(p.sy, p.ty, k) + p.p.arc * 4 * k * (1 - k);
    if (p.t < 1) continue;
    p.dead = dead = true;
    if (p.p.homing) {
      if (p.tgt) hurt(p.tgt, p.dmg, p.sx, p.sz);
      puff(p.x, p.y, p.z, 2, K.nut, 0.25, 1.4);
    } else {
      // 떨어진 자리 둘레의 우리 편이 맞음 (한 번에 맞는 수는 p.hits 까지, 대장이 아닌 친구는 폭탄을 절반만 아프게 맞음)
      let left = p.p.hits || 1;
      for (const a of G.allies) {
        if (a.dead || Math.hypot(a.x - p.x, a.z - p.z) > p.p.splash + a.r * 0.5) continue;
        hurt(a, p.dmg * (p.kind === 'bomb' && a !== G.hero ? 0.5 : 1), p.x, p.z);
        if (--left <= 0) break;
      }
      puff(p.x, 0.3, p.z, p.kind === 'bomb' ? 12 : 5, p.p.col, 0.45 + p.p.splash * 0.25, 2.5);
      if (p.kind === 'bomb') { G.shake = Math.max(G.shake, 0.25); SND.play('pop'); }
    }
  }
  if (dead) G.projs = G.projs.filter((p) => !p.dead);
}

function updCoins(dt) {
  const h = G.hero, W = G.W, alive = h.down <= 0;
  let got = false;
  for (const c of G.coins) {
    c.t += dt; c.spin += dt * 3;
    if (!c.rest) {
      c.vy -= 24 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      if (c.y <= 0.24) {
        c.y = 0.24; c.vy = -c.vy * 0.45; c.vx *= 0.55; c.vz *= 0.55;
        if (Math.abs(c.vy) < 1.2) {
          c.rest = true; c.vx = c.vz = 0;
          const pi = W.near(c.x, c.z, -1), dx = c.x - W.x[pi], dz = c.z - W.z[pi], dd = Math.hypot(dx, dz), lim = W.hw[pi] - 0.9;
          if (dd > lim) { c.x = W.x[pi] + dx / dd * lim; c.z = W.z[pi] + dz / dd * lim; }      // 숲 속으로 굴러간 건 길로 되돌림
        }
      }
    }
    if (!alive) continue;
    const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz);
    if (c.t > 0.4 && d < 3.6) c.mag = true;
    if (c.mag && c.t > 0.4) {
      c.rest = true;
      const sp = 13 + c.t * 4 + (d > 12 ? 30 : 0), mv = Math.min(d, sp * dt);
      if (d > 0.001) { c.x += dx / d * mv; c.z += dz / d * mv; }
      c.y = damp(c.y, 0.9, 10, dt);
      if (d < 0.75) { c.dead = true; got = true; G.acorns += c.v; G.earned += c.v; }
    }
  }
  if (got) { G.coins = G.coins.filter((c) => !c.dead); SND.play('coin'); UI.bump(); }
}

/** 발판: 올라서 있으면 도토리가 하나씩 들어가고, 다 차면 건물이 서거나 힘이 세짐 */
function updPads(dt) {
  const h = G.hero;
  G.payFx -= dt;
  for (const pad of G.pads) {
    const id = pad.id, p = pad.p, lv = G.lv[id], cost = p.costs[lv];
    pad.pulse = Math.max(0, pad.pulse - dt * 3);
    if (pad.bpop < 1 && lv > 0 && p.unit) pad.bpop = Math.min(1, pad.bpop + dt * 2.2);
    const on = !G.demo && h.down <= 0 && Math.hypot(h.x - pad.x, h.z - pad.z) < PAD_R;
    pad.on = on;
    if (!on) { pad.stay = 0; continue; }
    pad.isNew = false;
    if (cost == null) continue;
    pad.stay += dt;
    if (pad.stay < 0.3 || G.acorns <= 0) continue;
    pad.payT -= dt;
    const gapT = clamp(1.3 / cost, 0.02, 0.085);
    while (pad.payT <= 0 && G.acorns > 0 && G.paid[id] < cost) {
      pad.payT += gapT;
      G.acorns--; G.paid[id]++; pad.dirty = true; pad.pulse = 0.5;
      if (G.payFx <= 0) {
        G.payFx = 0.05;
        G.projs.push({ kind: 'acorn', p: { arc: 1.6, homing: true }, team: 2, x: h.x, y: 1, z: h.z, sx: h.x, sy: 1.1, sz: h.z,
                       tx: pad.x + rr(-0.5, 0.5), tz: pad.z + rr(-0.5, 0.5), ty: 0.1, tgt: null, t: 0, dur: 0.32, dmg: 0, spin: 0, src: h, fx: true });
        SND.play('pay', G.paid[id] / cost * 14);
      }
    }
    if (pad.payT < -0.2) pad.payT = 0;
    if (G.paid[id] >= cost) {
      G.paid[id] = 0; G.lv[id] = lv + 1; pad.dirty = true; pad.pulse = 1; pad.stay = -0.4;
      padLevelUp(pad, lv + 1);
    }
  }
  // 훈련: 건물이 서 있고 자리가 남으면 일정 시간마다 친구가 한 마리씩 찾아옴
  if (G.demo) return;
  for (const pad of G.pads) {
    const p = pad.p, lv = G.lv[pad.id];
    if (!p.unit || !lv) continue;
    if (countAllies(p.unit) < p.caps[lv]) {
      G.trainT[pad.id] += dt;
      if (G.trainT[pad.id] >= p.train) {
        G.trainT[pad.id] = 0;
        spawnAlly(p.unit, pad.bx + rr(-0.4, 0.4), pad.bz + 2.0);
      }
    } else G.trainT[pad.id] = 0;
  }
}
function padLevelUp(pad, lv) {
  const p = pad.p;
  confetti(pad.x, 0.6, pad.z, 16, [K.gold, [1, 1, 1], HOOD.hero], 3.5);
  if (p.unit) {
    if (lv === 1) {
      pad.bpop = 0; SND.play('build');
      G.dyn.push({ x: pad.bx, z: pad.bz, r: 1.55 });
      puff(pad.bx, 1, pad.bz, 14, [1, 1, 1], 0.9, 3);
      G.trainT[pad.id] = p.train - 0.5;
      UI.toast('🏕️ ' + p.name + ' 완성! ' + p.sub + '이 찾아와요');
    } else {
      SND.play('up');
      UI.toast('🐿️ ' + p.sub + ' 정원 ' + p.caps[lv] + '마리');
    }
  } else {
    SND.play('up');
    if (pad.id === 'hp') {
      for (const u of G.allies) { const nm = allyHp(u.kind), k = nm / u.maxHp; u.maxHp = nm; u.hp = Math.min(nm, u.hp * k + nm * 0.2); }
      UI.toast('❤️ 체력 ' + lv + '단계 — 모두가 더 튼튼해졌어요');
    } else UI.toast('💥 공격력 ' + lv + '단계 — 도토리가 더 매워졌어요');
    for (const u of G.allies) u.cheer = 0.8;
  }
}

/** 둥지: 싸움이 벌어지면 지킴이를 다시 낳고, 조용해지면 스스로 낫는다 */
function updCamps(dt) {
  const h = G.hero;
  for (const c of G.camps) {
    if (c.cleared) continue;
    if (c.alert > 0) c.alert -= dt;
    if (!c.nest || Math.abs(c.s - h.pi) > 60) continue;
    if (c.units.length < c.max) {
      c.spawnT -= dt;
      if (c.spawnT <= 0) {
        c.spawnT = (c.alert > 0 ? 5.0 : 3.5) * G.st.mult.hp;      // 센 길일수록 조금 천천히 낳음
        const a = rnd() * TAU, kind = c.comp[Math.floor(rnd() * c.comp.length)];
        const e = mkEnemy(kind, c.x + Math.cos(a) * 3, c.z + Math.sin(a) * 3, c);
        e.pop = 0; e.hx = c.x + Math.cos(a) * 5.5; e.hz = c.z + Math.sin(a) * 5.5;
        c.units.push(e);
        puff(e.x, 0.5, e.z, 4, e.d.col, 0.5);
      }
    }
    if (c.alert <= 0 && c.nest.hp < c.nest.maxHp) c.nest.hp = Math.min(c.nest.maxHp, c.nest.hp + c.nest.maxHp * 0.015 * dt);
  }
}

function updFx(dt) {
  let dead = false;
  for (const p of G.parts) {
    p.life += dt;
    if (p.life >= p.max) { p.dead = dead = true; continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.kind === 0) { p.vx *= 1 - 3 * dt; p.vz *= 1 - 3 * dt; }
    else { p.rot += p.vr * dt; if (p.y < 0.05) { p.y = 0.05; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; p.vr *= 0.8; } }
  }
  if (dead) G.parts = G.parts.filter((p) => !p.dead);
  for (const r of G.rings) r.t += dt;
  if (G.rings.length && G.rings[0].t > G.rings[0].dur + 0.25) G.rings = G.rings.filter((r) => r.t <= r.dur + 0.25);
  for (const f of G.floats) f.t += dt;
  if (G.floats.length && G.floats[0].t > 1.1) G.floats.shift();
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2.2);
  if (G.flagPop < 1) G.flagPop = Math.min(1, G.flagPop + dt * 1.6);
  // 흩날리는 잎
  for (const l of G.leaves) {
    l.ph += dt * l.sp;
    if (G.th.glow) { l.y += Math.sin(l.ph * 1.3) * 0.25 * dt; l.x += Math.cos(l.ph * 0.7) * 0.5 * dt; l.z += Math.sin(l.ph * 0.5) * 0.5 * dt; }
    else { l.y -= l.sp * 1.3 * dt; l.x += (0.9 + Math.sin(l.ph) * 0.8) * dt; if (l.y < 0) { l.y = 9; l.x = rr(-24, 20); l.z = rr(-26, 12); } }
    if (l.x > 24) l.x -= 48;
  }
  if (G.won && G.winT < 2.6 && rnd() < dt * 22) {
    const h = G.hero;
    confetti(h.x + rr(-7, 7), rr(3, 6), h.z + rr(-7, 4), 3, [K.gold, HOOD.hero, HOOD.guard, HOOD.slinger, [1, 1, 1]], 2.5);
  }
}

function updCamera(dt) {
  const h = G.hero;
  // 평소엔 조금 앞을 내다보고, 진지 안에서는 둘레의 발판이 다 보이게 가운데를 봄
  const la = lerp(1.0, 3.2, smooth((Math.hypot(h.x - G.fire[0], h.z - G.fire[1]) - 7) / 6));
  const tx = h.x, tz = h.z - la;
  CAM.x = damp(CAM.x, tx, 5, dt); CAM.z = damp(CAM.z, tz, 5, dt);
  if (G.won) CAM.kT = 0.78;
  CAM.k = damp(CAM.k, CAM.kT, 2.2, dt);
}

/* ══════════════════════════════════════════════════════════════════
   8. 화면 그리기
   ══════════════════════════════════════════════════════════════════ */
const QUAL = { scale: 1, shadow: true, slow: 0, ms: 16 };
const CALM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);   // 움직임 줄이기
let NOISE = null, RINGTEX = null, DISCTEX = null;
const OPAQUE = [], BLEND = [];

function initMeshes() {
  const mk = (name, mb, cap, shadow, blend) => {
    MESH[name] = R.mesh(mb);
    const b = BAT[name] = R.batch(MESH[name], cap, shadow, blend);
    (blend ? BLEND : OPAQUE).push(b);
  };
  mk('chipBody', mChipBody(), 48); mk('chipTail', mChipTail(), 48); mk('chipArm', mChipArm(), 96); mk('chipFoot', mChipFoot(), 96);
  mk('hatAcorn', mAcornHat(), 2); mk('hatLeaf', mLeafHat(), 12); mk('hatBeanie', mBeanie(), 24); mk('hatHelmet', mHelmet(), 12);
  mk('shield', mShield(), 12); mk('sling', mSling(), 12);
  mk('slimeBasic', mSlime('basic'), 110); mk('slimeSpit', mSlime('spit'), 80); mk('slimeSpiky', mSlime('spiky'), 80);
  mk('slimeBrute', mSlime('brute'), 20); mk('slimeKing', mSlime('king'), 2);
  mk('turret', mTurret(), 20); mk('nest', mNest(), 8);
  mk('acorn', mAcorn(), 420); mk('ball', mPuff(), 140);
  mk('tent', mTent(), 2); mk('hut', mHut(), 2); mk('tree', mTree(), 2);
  mk('fire', mFire(), 2); mk('flame', mFlame(), 4, false); mk('pole', mFlagPole(), 2); mk('cloth', mFlagCloth(), 2);
  mk('puff', mPuff(), 360, false, true); mk('leaf', mLeaf(), 440, false, true);

  // 땅의 잔무늬(되풀이되는 얼룩)
  const nc = document.createElement('canvas'); nc.width = nc.height = 64;
  const ng = nc.getContext('2d'), img = ng.createImageData(64, 64), rng = makeRng(99), raw = [];
  for (let i = 0; i < 4096; i++) raw.push(rng());
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += raw[((y + dy + 64) % 64) * 64 + (x + dx + 64) % 64];
    const v = Math.round(clamp((s / 9 - 0.5) * 2.2 + 0.5, 0, 1) * 255), o = (y * 64 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  NOISE = R.texture(nc, true);

  // 예고 표시용 고리와 원판
  const mkc = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return R.texture(c, false, true); };
  RINGTEX = mkc((g) => {
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.setLineDash([16, 9]);
    g.beginPath(); g.arc(64, 64, 56, 0, TAU); g.stroke();
  });
  DISCTEX = mkc((g) => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
  });
}

/* ── 발판 그림 (땅에 깔리는 둥근 나무 판) ── */
const FONT = '"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",system-ui,sans-serif';
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function acornIcon(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 24, s / 24); g.translate(-12, -12);
  g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#5a3a1c';
  g.fillStyle = '#e0a04f'; g.beginPath(); g.moveTo(5, 14); g.lineTo(19, 14); g.bezierCurveTo(19, 19, 16, 22, 12, 22); g.bezierCurveTo(8, 22, 5, 19, 5, 14); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#7a4a22'; g.beginPath(); g.moveTo(4, 12.6); g.bezierCurveTo(4, 9, 7.2, 6.6, 12, 6.6); g.bezierCurveTo(16.8, 6.6, 20, 9, 20, 12.6); g.bezierCurveTo(20, 13.5, 19.4, 14, 18.6, 14);
  g.lineTo(5.4, 14); g.bezierCurveTo(4.6, 14, 4, 13.5, 4, 12.6); g.closePath(); g.fill(); g.stroke();
  g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(12, 6.6); g.lineTo(12, 3.4); g.stroke();
  g.restore();
}
/** 발판 아이콘 — 갈색 테두리의 색칠 그림 */
function padIcon(g, kind, cx, cy, s) {
  const INK = '#5a3a1c';
  g.save(); g.translate(cx, cy);
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 5;
  if (kind === 'tent') {
    g.fillStyle = '#fff6da';
    g.beginPath(); g.moveTo(-s, s * 0.72); g.lineTo(0, -s * 0.78); g.lineTo(s, s * 0.72); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = INK; g.beginPath(); g.moveTo(-s * 0.3, s * 0.72); g.lineTo(0, -s * 0.02); g.lineTo(s * 0.3, s * 0.72); g.closePath(); g.fill();
    g.fillStyle = '#ffb83a'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(0, -s * 0.78); g.lineTo(0, -s * 1.16); g.lineTo(s * 0.46, -s * 0.97); g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'shield') {
    g.fillStyle = '#4f93e6';
    g.beginPath(); g.moveTo(-s * 0.8, -s * 0.8); g.lineTo(s * 0.8, -s * 0.8); g.lineTo(s * 0.8, 0);
    g.bezierCurveTo(s * 0.8, s * 0.55, s * 0.3, s * 0.85, 0, s); g.bezierCurveTo(-s * 0.3, s * 0.85, -s * 0.8, s * 0.55, -s * 0.8, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(0, -s * 0.08, s * 0.28, 0, TAU); g.fill();
  } else if (kind === 'sling') {
    g.lineWidth = s * 0.3;
    g.beginPath(); g.moveTo(0, s); g.lineTo(0, s * 0.1); g.lineTo(-s * 0.62, -s * 0.72); g.moveTo(0, s * 0.1); g.lineTo(s * 0.62, -s * 0.72); g.stroke();
    g.lineWidth = s * 0.13; g.strokeStyle = '#f0558a';
    g.beginPath(); g.moveTo(-s * 0.62, -s * 0.72); g.quadraticCurveTo(0, -s * 0.05, s * 0.62, -s * 0.72); g.stroke();
  } else if (kind === 'atk') {
    g.fillStyle = '#ff9a3c';
    g.beginPath();
    for (let i = 0; i < 16; i++) { const a = TAU * i / 16 - Math.PI / 2, r = i % 2 ? s * 0.58 : s * 1.05; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill(); g.stroke();
    acornIcon(g, 0, 0, s * 0.9);
  } else if (kind === 'hp') {
    g.fillStyle = '#ff6b7d';
    g.beginPath(); g.moveTo(0, s * 0.92);
    g.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.75, -s * 1.15, 0, -s * 0.38);
    g.bezierCurveTo(s * 0.75, -s * 1.15, s * 1.5, -s * 0.1, 0, s * 0.92); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(-s * 0.34, -s * 0.1, s * 0.68, s * 0.2); g.fillRect(-s * 0.1, -s * 0.34, s * 0.2, s * 0.68);
  }
  g.restore();
}
/** 발판 그림: 나무 그루터기를 잘라 만든 둥근 판. 도토리를 낸 만큼 테두리가 금빛으로 차오름 */
const PAD_FACE = { tent: '#ffe9a6', hut: '#cfe2ff', tree: '#ffd5e4', atk: '#ffdcb8', hp: '#ffd9d9' };
function drawPadTex(pad) {
  const S = 256, C0 = 128, p = pad.p, lv = G.lv[pad.id], cost = p.costs[lv], paid = G.paid[pad.id];
  if (!pad.cv) { pad.cv = document.createElement('canvas'); pad.cv.width = pad.cv.height = S; }
  const g = pad.cv.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#6a4322'; g.beginPath(); g.arc(C0, C0 + 5, 120, 0, TAU); g.fill();        // 판의 두께
  g.fillStyle = '#8f5f37'; g.beginPath(); g.arc(C0, C0, 120, 0, TAU); g.fill();            // 나무껍질 테두리
  g.lineWidth = 12;
  if (cost != null) {
    g.strokeStyle = 'rgba(58,34,14,0.5)'; g.beginPath(); g.arc(C0, C0, 110, 0, TAU); g.stroke();
    if (paid > 0) {
      g.strokeStyle = '#ffd24a'; g.lineCap = 'round';
      g.beginPath(); g.arc(C0, C0, 110, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, paid / cost)); g.stroke();
    }
  } else { g.strokeStyle = '#ffd24a'; g.beginPath(); g.arc(C0, C0, 110, 0, TAU); g.stroke(); }
  g.fillStyle = pad.on ? '#fffbe6' : PAD_FACE[pad.id]; g.beginPath(); g.arc(C0, C0, 101, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(143,95,55,0.20)'; g.lineWidth = 3;                                  // 나이테
  for (const r of [86, 66]) { g.beginPath(); g.arc(C0, C0, r, 0, TAU); g.stroke(); }

  padIcon(g, p.icon, C0, 88, 34);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 29px ' + FONT; g.fillStyle = '#4a3018';
  g.fillText(p.name, C0, 149);
  if (cost != null) {
    const txt = String(cost - paid);
    g.font = '900 34px ' + FONT;
    const pw = g.measureText(txt).width + 60, x0 = C0 - pw / 2;
    g.fillStyle = '#5a3a1c'; rrect(g, x0, 170, pw, 42, 21); g.fill();
    acornIcon(g, x0 + 23, 190, 30);
    g.fillStyle = '#ffd24a'; g.textAlign = 'left'; g.fillText(txt, x0 + 42, 192);
  } else {
    g.fillStyle = '#4fb364'; rrect(g, C0 - 58, 170, 116, 42, 21); g.fill();
    g.font = '900 25px ' + FONT; g.fillStyle = '#fff'; g.fillText('최고 단계', C0, 192);
  }
  // 단계 점
  const max = p.costs.length, gapX = 14, x1 = C0 - (max - 1) * gapX / 2;
  for (let i = 0; i < max; i++) {
    g.beginPath(); g.arc(x1 + i * gapX, 45, 4.6, 0, TAU);
    g.fillStyle = i < lv ? '#e8930c' : 'rgba(90,58,28,0.22)'; g.fill();
  }
  if (pad.isNew) {
    g.save(); g.translate(58, 56); g.rotate(-0.45);
    rrect(g, -34, -15, 68, 30, 12); g.fillStyle = '#ff5a4e'; g.fill();
    g.font = '900 20px ' + FONT; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('NEW', 0, 1);
    g.restore();
  }
  if (!pad.tex) pad.tex = R.texture(pad.cv, false, true); else R.updateTexture(pad.tex, pad.cv, true);
  pad.dirty = false; pad.drawnOn = pad.on;
}

/* ── 캐릭터를 인스턴스로 풀어 넣기 ── */
const _R = A3.create(), _L = A3.create(), _M = A3.create();
function part(b, px, py, pz, pitch, yaw, roll, s, r, g, bl, flash, emis) {
  A3.compose(_L, px, py, pz, pitch, yaw, roll, s, s, s);
  A3.mul(_M, _R, _L);
  inst(b, _M, r, g, bl, 1, flash, emis || 0);
}
function drawChip(u, t) {
  const d = u.d, sc = d.scale * (u.pop < 1 ? Math.max(0.01, popCurve(u.pop)) : 1);
  const mb = u.mv, ph = u.walk, hood = d.hood, fl = u.flash * 0.75;
  const cheer = (G.won || u.cheer > 0) ? Math.abs(Math.sin(t * 8 + u.seed)) * 0.55 : 0;
  const bob = Math.abs(Math.sin(ph)) * 0.11 * mb + cheer;
  const breath = 1 + Math.sin(t * 2.4 + u.seed) * 0.022 * (1 - mb);
  const a = u.atk > 0 ? 1 - u.atk : 1;                 // 공격 동작 진행도 0→1
  const lunge = (d.melee && u.atk > 0) ? Math.sin(u.atk * Math.PI) * 0.38 : 0;
  const lean = 0.2 * mb + (u.atk > 0 ? Math.sin(a * Math.PI) * 0.16 : 0);
  A3.compose(_R, u.x + Math.sin(u.yaw) * lunge, u.y + bob, u.z + Math.cos(u.yaw) * lunge, lean, u.yaw, 0, sc, sc * breath, sc);
  inst(BAT.chipBody, _R, hood[0], hood[1], hood[2], 1, fl, 0);
  // 꼬리 살랑
  part(BAT.chipTail, 0, 0.30, -0.24, -0.22 + Math.sin(t * 3.1 + u.seed) * 0.09 - mb * 0.18 + Math.sin(ph * 2) * 0.1 * mb, 0,
       Math.sin(t * 2.3 + u.seed * 1.7) * 0.13 + Math.sin(ph) * 0.2 * mb, 1, 1, 1, 1, fl);
  // 팔: 달릴 때 앞뒤로, 던질 때 오른팔을 머리 위로 들었다 내리뻗음
  const sw = Math.sin(ph) * 0.9 * mb;
  let aR = sw, aL = -sw;
  if (u.atk > 0 && !d.melee) aR = a < 0.3 ? lerp(0, -3.0, a / 0.3) : a < 0.6 ? lerp(-3.0, -1.0, (a - 0.3) / 0.3) : lerp(-1.0, 0, (a - 0.6) / 0.4);
  if (cheer) { aR = -2.8; aL = -2.8; }
  if (u.kind === 'guard') aL = -1.25;
  if (u.kind === 'slinger' && !cheer) aL = u.atk > 0 ? -1.5 : -0.9;
  part(BAT.chipArm, -0.39, 0.80, 0.02, aR, 0, -0.12, 1, hood[0], hood[1], hood[2], fl);
  part(BAT.chipArm, 0.39, 0.80, 0.02, aL, 0, 0.12, 1, hood[0], hood[1], hood[2], fl);
  // 발
  const st = Math.sin(ph) * 0.2 * mb, c0 = Math.cos(ph);
  part(BAT.chipFoot, -0.17, Math.max(0, c0) * 0.1 * mb, 0.02 + st, 0, 0, 0, 1, 1, 1, 1, fl);
  part(BAT.chipFoot, 0.17, Math.max(0, -c0) * 0.1 * mb, 0.02 - st, 0, 0, 0, 1, 1, 1, 1, fl);
  if (u.kind === 'hero') inst(BAT.hatAcorn, _R, 1, 1, 1, 1, fl, 0);
  else if (u.kind === 'thrower') inst(BAT.hatBeanie, _R, hood[0], hood[1], hood[2], 1, fl, 0);
  else if (u.kind === 'slinger') { inst(BAT.hatLeaf, _R, hood[0], hood[1], hood[2], 1, fl, 0); part(BAT.sling, 0.40, 0.52, 0.36, 0.25, 0, 0, 1, 1, 1, 1, fl); }
  else if (u.kind === 'guard') { inst(BAT.hatHelmet, _R, hood[0], hood[1], hood[2], 1, fl, 0); part(BAT.shield, 0.22, 0.60, 0.40, 0, -0.2, 0, 1.05, 1, 1, 1, fl); }
}
function drawEnemy(e, t) {
  const d = e.d, th = G.th;
  let sc = (d.scale || 1) * (e.pop < 1 ? Math.max(0.01, popCurve(e.pop)) : 1);
  let y = 0, sy = 1, sxz = 1, lunge = 0, col = d.col;
  const fl = e.flash * 0.7, emis = th.glow ? 0.35 : 0.06;
  if (d.building) {
    sy = 1 + Math.sin(t * 2 + e.seed) * 0.025 + e.flash * 0.05; sxz = 1 - e.flash * 0.03;
    if (e.fuse != null) { sy *= 1.1; sxz *= 1.08; }
  } else if (d.fixed) {
    const k = e.atk > 0 ? Math.sin(e.atk * Math.PI) : 0;
    sy = 1 - k * 0.2 + Math.sin(t * 2.2 + e.seed) * 0.02; sxz = 1 + k * 0.12;
  } else {
    const ph = e.hop % 1;
    if (ph > 0.001) { const a = Math.sin(Math.PI * ph); y = a * 0.55 * Math.min(1.6, 0.6 + d.hop); sy = 0.9 + a * 0.28; }
    else sy = 1 + Math.sin(t * 3 + e.seed) * 0.045;
    if (e.atk > 0) {
      const k = Math.sin(e.atk * Math.PI);
      if (d.melee) { lunge = k * 0.5; sy *= 1 - k * 0.15; } else sy *= 1 + k * 0.22;
    }
    if (d.boss) {
      if (e.slamT > 0) { const k = 1 - e.slamT / 0.9; y += k * 1.6; sy *= 1 + k * 0.25; }
      if (e.sq > 0) sy *= 1 - (e.sq / 0.3) * 0.45;
      if (e.rage) col = mixC(d.col, [1, 0.25, 0.2], 0.45 + Math.sin(t * 9) * 0.15);
    }
    sxz = 1 / Math.sqrt(sy);
    sxz *= 1 + e.flash * 0.1;
  }
  if (e.fuse != null) sc *= 1 + Math.sin(t * 40) * 0.05;
  A3.compose(_R, e.x + Math.sin(e.yaw) * lunge, y * (d.scale || 1), e.z + Math.cos(e.yaw) * lunge, 0, e.yaw, 0, sc * sxz, sc * sy, sc * sxz);
  inst(BAT[d.mesh], _R, col[0], col[1], col[2], 1, fl, emis);
}

function collectScene(t, zf, zn) {
  const h = G.hero, th = G.th;
  for (const u of G.allies) {
    if (u === h && h.down > 0) continue;
    if (u.z < zf || u.z > zn) continue;
    drawChip(u, t);
  }
  for (const e of G.enemies) {
    if (e.dead || e.z < zf || e.z > zn) continue;
    drawEnemy(e, t);
  }
  for (const p of G.projs) {
    if (p.kind === 'acorn') {
      A3.compose(_R, p.x, p.y, p.z, p.spin, p.spin * 0.7, 0, 1, 1, 1);
      inst(BAT.acorn, _R, 1, 1, 1, 1, 0, 0.1);
    } else {
      const s = p.p.size, c = p.p.col;
      A3.compose(_R, p.x, p.y, p.z, 0, 0, 0, s, s, s);
      inst(BAT.ball, _R, c[0], c[1], c[2], 1, 0, 0.6);
    }
  }
  for (const c of G.coins) {
    if (c.z < zf || c.z > zn) continue;
    const big = c.v > 1, s = big ? 1.75 : 1.2;
    A3.compose(_R, c.x, c.y + (c.rest ? Math.sin(t * 3 + c.spin) * 0.06 : 0), c.z, 0.4, c.spin + t * 2, 0, s, s, s);
    if (big) inst(BAT.acorn, _R, 1.3, 1.08, 0.42, 1, 0, 0.6); else inst(BAT.acorn, _R, 1, 1, 1, 1, 0, 0.18);
  }
  // 끈적 벽: 둥지 뒤를 가로막은 방울 줄
  if (G.gate < G.W.n - 1 && !G.demo) {
    const W = G.W, g = G.gate, hw = W.hw[g], cnt = Math.floor(hw * 2 / 1.25), goo = th.goo;
    if (W.z[g] > zf && W.z[g] < zn) {
      for (let k = 0; k <= cnt; k++) {
        const lat = -hw + k * (2 * hw / cnt), s = 1.3 + Math.sin(k * 1.7) * 0.28;
        const x = W.x[g] - W.tz[g] * lat + W.tx[g] * 1.1, z = W.z[g] + W.tx[g] * lat + W.tz[g] * 1.1;
        A3.compose(_R, x, 0.42 * s, z, 0, k, 0, s, s * (1 + Math.sin(t * 2.6 + k * 1.3) * 0.09), s);
        inst(BAT.ball, _R, goo[0], goo[1], goo[2], 1, 0, th.glow ? 0.45 : 0.2);
      }
    }
  }
  // 진지: 건물·모닥불·깃발
  for (const pad of G.pads) {
    if (!pad.p.unit || !G.lv[pad.id]) continue;
    const k = popCurve(pad.bpop), busy = G.trainT[pad.id] > 0 ? Math.sin(t * 9) * 0.02 : 0;
    A3.compose(_R, pad.bx, 0, pad.bz, 0, 0, 0, k * (1 - busy), k * (1 + busy), k * (1 - busy));
    inst(BAT[pad.id], _R, 1, 1, 1, 1, 0, th.glow ? 0.2 : 0);
  }
  const fx = G.fire[0], fz = G.fire[1];
  A3.compose(_R, fx, 0, fz, 0, 0, 0, 1, 1, 1);
  inst(BAT.fire, _R, 1, 1, 1, 1, 0, 0);
  for (let i = 0; i < 2; i++) {
    const w = 1 + Math.sin(t * (9 + i * 4) + i) * 0.16;
    A3.compose(_R, fx, 0.05, fz, 0, t * (2 + i) + i * 2, 0, 1 - i * 0.3, w * (1 - i * 0.2), 1 - i * 0.3);
    inst(BAT.flame, _R, 1, 1, 1, 1, 0, 1);
  }
  const fk = popCurve(G.flagPop), px = fx + 1.9, pz = fz - 1.5;
  A3.compose(_R, px, 0, pz, 0, 0, 0, 1, fk, 1);
  inst(BAT.pole, _R, 1, 1, 1, 1, 0, 0);
  A3.compose(_R, px, 3.12 * fk, pz, 0, 0.25 + Math.sin(t * 2.2) * 0.3, Math.sin(t * 3.3) * 0.07, 1, 1, 1);
  inst(BAT.cloth, _R, HOOD.hero[0], HOOD.hero[1], HOOD.hero[2], 1, 0, 0.25);

  // 입자
  for (const p of G.parts) {
    const k = p.life / p.max;
    if (p.kind === 0) {
      const s = lerp(p.s0, p.s1, k);
      A3.compose(_R, p.x, p.y, p.z, 0, 0, 0, s, s, s);
      inst(BAT.puff, _R, p.c[0], p.c[1], p.c[2], p.a * (1 - k) * (1 - k), 0, 0.5 + p.emis);
    } else {
      A3.compose(_R, p.x, p.y, p.z, p.rot, p.rot * 1.3, p.rot * 0.7, p.s0, p.s0, p.s0);
      inst(BAT.leaf, _R, p.c[0], p.c[1], p.c[2], Math.min(1, (p.max - p.life) * 3), 0, p.emis);
    }
  }
  // 흩날리는 잎 / 밤에는 반딧불
  for (const l of G.leaves) {
    const x = CAM.x + l.x, z = CAM.z + l.z;
    if (th.glow) {
      const s = 0.16 + Math.sin(l.ph * 2) * 0.05;
      A3.compose(_R, x, 0.8 + l.y * 0.35, z, 0, 0, 0, s, s, s);
      inst(BAT.puff, _R, l.c[0], l.c[1], l.c[2], 0.55 + Math.sin(l.ph * 3) * 0.35, 0, 1);
    } else {
      A3.compose(_R, x, l.y, z, l.ph * 1.7, l.ph, l.ph * 0.6, 0.5, 0.5, 0.5);
      inst(BAT.leaf, _R, l.c[0], l.c[1], l.c[2], 0.95, 0, 0.3);
    }
  }
}

function render(t) {
  const gl = R.gl, W = G.W, th = G.th;
  R.resize(QUAL.scale);
  R.env = th; R.time = t;
  R.begin(th.forest);

  // 카메라: 비스듬히 내려다봄. 세로로 긴 화면일수록 더 멀리서 봄
  const aspect = R.w / R.h;
  const k = CAM.k * clamp(1.3 / aspect, 1, 2.1);
  const sh = CALM ? 0 : G.shake * G.shake * 0.6;
  const cx = CAM.x + (sh ? rr(-sh, sh) : 0), cz = CAM.z + (sh ? rr(-sh, sh) : 0);
  if (G.demo) {
    const a = t * 0.1;
    CAM.eye = [cx + Math.sin(a) * 8, 12 * k, cz + 19 * k]; CAM.tgt = [cx, 0.8, cz - 1];
  } else {
    CAM.eye = [cx, 21 * k, cz + 14.8 * k]; CAM.tgt = [cx, 0.6, cz];
  }
  R.setCamera(CAM.fov, aspect, 1, 260, CAM.eye, CAM.tgt);
  const zf = CAM.z - 62 * k, zn = CAM.z + 30 * k;

  // ① 땅 → 발판·예고 표시
  R.texBegin(NOISE, Math.floor(CAM.x / 8) * 8, Math.floor(CAM.z / 8) * 8);
  R.texQuad(W.groundTex, (W.minX + W.maxX) / 2, (W.minZ + W.maxZ) / 2, W.maxX - W.minX, W.maxZ - W.minZ, 0, 1, 1, 1, 1, true);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const pad of G.pads) {
    if (pad.dirty || pad.drawnOn !== pad.on) drawPadTex(pad);
    const s = PAD_R * 2.2 * (1 + pad.pulse * 0.07);
    R.texQuad(pad.tex, pad.x, pad.z, s, s, 0.02, 1, 1, 1, 1, false);
  }
  if (!G.demo) {
    // 모닥불 쉼터 범위
    R.texQuad(RINGTEX, G.fire[0], G.fire[1], HEAL_R * 2, HEAL_R * 2, 0.025, 1, 0.82, 0.4, 0.22 + Math.sin(t * 2) * 0.05, false);
  }
  for (const r of G.rings) {
    const kk = clamp(r.t / r.dur, 0, 1), fade = r.t > r.dur ? clamp(1 - (r.t - r.dur) / 0.25, 0, 1) : 1;
    R.texQuad(RINGTEX, r.x, r.z, r.r * 2, r.r * 2, 0.03, r.col[0], r.col[1], r.col[2], 0.9 * fade, false);
    R.texQuad(DISCTEX, r.x, r.z, r.r * 2 * kk, r.r * 2 * kk, 0.035, r.col[0], r.col[1], r.col[2], 0.5 * fade, false);
  }
  gl.depthMask(true); gl.disable(gl.BLEND);
  R.texEnd();

  // ② 인스턴스 모으기
  for (const b of OPAQUE) b.n = 0;
  for (const b of BLEND) b.n = 0;
  collectScene(t, zf, zn);
  for (const b of OPAQUE) R.upload(b);
  for (const b of BLEND) R.upload(b);

  // ③ 그림자 (스텐실로 한 번만 어두워지게)
  if (QUAL.shadow) {
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, 0, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    R._use(true);
    for (const c of W.chunks) if (c && c.z1 > zf && c.z0 < zn) R.drawStatic(c.mesh);
    for (const b of OPAQUE) if (b.shadow) R.drawBatch(b);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  }
  // ④ 풍경과 캐릭터
  R._use(false);
  for (const c of W.chunks) if (c && c.z1 > zf && c.z0 < zn) R.drawStatic(c.mesh);
  for (const b of OPAQUE) R.drawBatch(b);
  // ⑤ 반투명 입자
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  for (const b of BLEND) R.drawBatch(b);
  gl.depthMask(true); gl.disable(gl.BLEND);
  R._instOff();

  drawOverlay(t);
}

/* ═════════ 9. 3D 화면 위에 덧그리는 것 (체력 막대·말풍선·화살표·조이스틱) ═════════ */
const OV = { cv: null, g: null, w: 0, h: 0, dpr: 1 };
function resizeOverlay() {
  const cv = OV.cv, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth, h = cv.clientHeight, pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  OV.w = w; OV.h = h; OV.dpr = dpr;
}
function bubble(g, x, y, lines, cols) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let bw = 0;
  lines.forEach((s, i) => { g.font = (i ? '700 13px ' : '900 16px ') + FONT; bw = Math.max(bw, g.measureText(s).width); });
  bw += 26;
  const bh = 16 + lines.length * 20, bx = clamp(x - bw / 2, 6, OV.w - bw - 6), by = Math.max(70, y - bh - 12);
  g.fillStyle = 'rgba(255,250,240,0.96)'; g.strokeStyle = '#7a5230'; g.lineWidth = 3;
  rrect(g, bx, by, bw, bh, 12); g.fill(); g.stroke();
  lines.forEach((s, i) => {
    g.font = (i ? '700 13px ' : '900 16px ') + FONT;
    g.fillStyle = (cols && cols[i]) || (i ? '#6b4a2f' : '#3a2616');
    g.fillText(s, bx + bw / 2, by + 18 + i * 20);
  });
}
function drawOverlay(t) {
  resizeOverlay();
  const g = OV.g, w = OV.w, hh = OV.h;
  g.setTransform(OV.dpr, 0, 0, OV.dpr, 0, 0);
  g.clearRect(0, 0, w, hh);
  if (G.demo) return;
  const h = G.hero;
  const P = (x, y, z) => { const p = R.project(x, y, z); return p ? [p[0] * w, p[1] * hh] : null; };
  const bar = (u, y, bw, col, always) => {
    if (!always && u.hp >= u.maxHp - 0.5) return;
    const p = P(u.x, y, u.z); if (!p) return;
    const k = clamp(u.hp / u.maxHp, 0, 1), bh = bw > 50 ? 9 : 6, x = p[0] - bw / 2, yy = p[1] - bh;
    g.fillStyle = 'rgba(40,25,14,0.78)'; rrect(g, x - 2, yy - 2, bw + 4, bh + 4, (bh + 4) / 2); g.fill();
    if (k > 0.02) { g.fillStyle = col; rrect(g, x, yy, Math.max(bh, bw * k), bh, bh / 2); g.fill(); }
  };

  /* 체력 막대: 다친 캐릭터만. 둥지와 대장(다람)은 늘 보임 */
  for (const e of G.act) {
    if (e.dead || e.d.boss || e.fuse != null) continue;
    const sc = e.d.scale || 1;
    if (e.d.building) bar(e, 3.4, 86, '#c98bff', true);
    else bar(e, (e.d.fixed ? 2.0 : 1.25) * sc, e.r > 0.9 ? 54 : 30, '#ff6b5e', false);
  }
  for (const u of G.allies) if (u !== h) bar(u, 1.9 * u.d.scale, 28, '#6fdc6a', false);
  if (h.down <= 0) {
    const k = h.hp / h.maxHp;
    bar(h, 2.6, 60, k > 0.5 ? '#5fe06a' : k > 0.25 ? '#ffc533' : '#ff5a4e', true);
  }

  /* 건물 위: 지금 몇 마리 / 정원, 훈련 진행 고리 */
  for (const pad of G.pads) {
    const p = pad.p, lv = G.lv[pad.id];
    if (!p.unit || !lv || pad.bpop < 1) continue;
    const q = P(pad.bx, 3.5, pad.bz); if (!q) continue;
    const have = countAllies(p.unit), cap = p.caps[lv], txt = have + '/' + cap;
    g.font = '900 14px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tw = g.measureText(txt).width + 34;
    g.fillStyle = 'rgba(40,25,14,0.78)'; rrect(g, q[0] - tw / 2, q[1] - 13, tw, 26, 13); g.fill();
    g.fillStyle = cssC(UNITS[p.unit].hood); g.beginPath(); g.arc(q[0] - tw / 2 + 14, q[1], 7, 0, TAU); g.fill();
    if (have < cap) {
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath();
      g.arc(q[0] - tw / 2 + 14, q[1], 10, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(G.trainT[pad.id] / p.train, 0, 1)); g.stroke();
    }
    g.fillStyle = '#fff'; g.fillText(txt, q[0] + 10, q[1] + 1);
  }

  /* 발판 설명 말풍선: 대장이 가까이 갔을 때 */
  let near = null, nd = 4.4;
  for (const pad of G.pads) { const d = Math.hypot(h.x - pad.x, h.z - pad.z); if (d < nd) { nd = d; near = pad; } }
  if (near && h.down <= 0) {
    const p = near.p, lv = G.lv[near.id], cost = p.costs[lv];
    const q = P(near.x, 0.2, near.z - PAD_R);
    if (q) {
      const lines = [p.name + (lv ? ' ' + lv + '단계' : '')], cols = [null];
      if (cost == null) { lines.push('끝까지 올렸어요!'); cols.push('#c98a12'); }
      else if (p.unit) { lines.push(lv ? '정원 ' + p.caps[lv] + ' → ' + p.caps[lv + 1] + '마리' : p.tip); cols.push(null); }
      else { lines.push(p.sub + ' +' + Math.round(lv * p.per * 100) + '% → +' + Math.round((lv + 1) * p.per * 100) + '%'); cols.push(null); }
      if (near.on && cost != null && G.acorns <= 0) { lines.push('도토리가 ' + (cost - G.paid[near.id]) + '개 더 필요해요'); cols.push('#e0483c'); }
      else if (!near.on && cost != null) { lines.push('발판 위에 서 있으면 도토리가 들어가요'); cols.push('#8a5cf5'); }
      bubble(g, q[0], q[1], lines, cols);
    }
  }
  /* 처음 한 번: 텐트 발판을 가리키는 화살표 */
  if (G.lv.tent === 0 && G.moved && (!near || near.id !== 'tent')) {
    const pad = G.pads[0], q = P(pad.x, 0.3, pad.z);
    if (q) {
      const by = q[1] - 54 - Math.abs(Math.sin(t * 5)) * 14;
      g.fillStyle = '#ffd24a'; g.strokeStyle = '#5a3a1c'; g.lineWidth = 3; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(q[0] - 16, by); g.lineTo(q[0] + 16, by); g.lineTo(q[0], by + 24); g.closePath(); g.fill(); g.stroke();
    }
  }

  /* 다음 둥지를 가리키는 화살표 (화면 밖에 있을 때만) */
  let goal = null;
  for (const c of G.camps) if (!c.cleared && !c.patrol) { goal = c; break; }
  if (goal && !G.won && h.down <= 0 && (G.lv.tent > 0 || G.cleared > 0)) {
    const q = P(goal.x, 1.5, goal.z), m = 46, top = 118;
    if (!q || q[0] < 0 || q[0] > w || q[1] < 56 || q[1] > hh) {
      let dx = goal.x - h.x, dz = goal.z - h.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const kx = dx ? (w / 2 - m) / Math.abs(dx) : 1e9, kz = dz ? (dz < 0 ? hh / 2 - top : hh / 2 - m) / Math.abs(dz) : 1e9, k = Math.min(kx, kz);
      const ax = w / 2 + dx * k, ay = hh / 2 + dz * k, ang = Math.atan2(dz, dx);
      g.save(); g.translate(ax, ay);
      g.fillStyle = goal.def.boss ? '#e8433a' : '#8a5cf5'; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, 21, 0, TAU); g.fill(); g.stroke();
      g.rotate(ang); g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -9); g.lineTo(-6, 9); g.closePath(); g.fill();
      g.restore();
      g.font = '900 13px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      const txt = (goal.def.boss ? '대왕 ' : '둥지 ') + Math.round(l) + '걸음';
      const tw = g.measureText(txt).width + 14, ty = ay + (dz < -0.3 ? 34 : -34);
      g.fillStyle = 'rgba(40,25,14,0.8)'; rrect(g, clamp(ax - tw / 2, 4, w - tw - 4), ty - 11, tw, 22, 11); g.fill();
      g.fillStyle = '#fff'; g.fillText(txt, clamp(ax, 4 + tw / 2, w - tw / 2 - 4), ty + 1);
    }
  }

  /* 떠오르는 글자 */
  for (const f of G.floats) {
    const q = P(f.x, f.y + f.t * 1.6, f.z); if (!q) continue;
    g.globalAlpha = clamp(1.1 - f.t, 0, 1);
    g.font = '900 18px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = '#3a2616'; g.strokeText(f.txt, q[0], q[1]);
    g.fillStyle = f.col; g.fillText(f.txt, q[0], q[1]);
    g.globalAlpha = 1;
  }

  /* 조이스틱 */
  const j = INPUT.joy;
  if (j && STATE === 'play') {
    g.fillStyle = 'rgba(255,255,255,0.20)'; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
    g.beginPath(); g.arc(j.ox, j.oy, 58, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(j.ox + j.x * 58, j.oy + j.y * 58, 25, 0, TAU); g.fill();
  }
}

/* ═════════ 10. 조작 ═════════ */
let STATE = 'title';             // title · play · pause · result
function initInput() {
  const st = $('#stage'), JR = 58;
  const end = (e) => { if (INPUT.joy && e.pointerId === INPUT.joy.id) { INPUT.joy = null; INPUT.jx = INPUT.jz = 0; } };
  st.addEventListener('pointerdown', (e) => {
    SND.init(); SND.resume();
    if (STATE !== 'play' || INPUT.joy) return;
    INPUT.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    try { st.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  st.addEventListener('pointermove', (e) => {
    const j = INPUT.joy;
    if (!j || e.pointerId !== j.id) return;
    let dx = e.clientX - j.ox, dy = e.clientY - j.oy, l = Math.hypot(dx, dy);
    if (l > JR * 1.5) {            // 손가락을 멀리 끌면 조이스틱이 따라옴
      const k = (l - JR * 1.5) / l;
      j.ox += dx * k; j.oy += dy * k;
      dx = e.clientX - j.ox; dy = e.clientY - j.oy; l = JR * 1.5;
    }
    const m = clamp(l / JR, 0, 1), out = m < 0.14 ? 0 : Math.min(1, m * 1.35);
    j.x = l > 0 ? dx / l * m : 0; j.y = l > 0 ? dy / l * m : 0;
    INPUT.jx = l > 0 ? dx / l * out : 0; INPUT.jz = l > 0 ? dy / l * out : 0;
  });
  st.addEventListener('pointerup', end);
  st.addEventListener('pointercancel', end);
  st.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { INPUT.joy = null; INPUT.jx = INPUT.jz = 0; INPUT.keys = {}; });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { if (STATE === 'play') pauseGame(); else if (STATE === 'pause') resumeGame(); return; }
    INPUT.keys[e.code] = true;
    if (STATE === 'play' && e.code.indexOf('Arrow') === 0) e.preventDefault();
    SND.init(); SND.resume();
  });
  window.addEventListener('keyup', (e) => { INPUT.keys[e.code] = false; });
  document.addEventListener('visibilitychange', () => {
    // 다른 창으로 가면 멈추고 소리도 끔 (교실에서 소리만 계속 나는 일 방지)
    if (document.hidden) {
      if (STATE === 'play' && !G.won) pauseGame();
      if (SND.ctx && SND.ctx.state === 'running') SND.ctx.suspend().catch(() => {});
    } else SND.resume();
  });
}
function readInput() {
  const k = INPUT.keys;
  let x = INPUT.jx + ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
  let z = INPUT.jz + ((k.ArrowDown || k.KeyS) ? 1 : 0) - ((k.ArrowUp || k.KeyW) ? 1 : 0);
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  INPUT.x = x; INPUT.z = z;
}

/* ═════════ 11. 화면 흐름 (첫 화면 · HUD · 멈춤 · 결과) ═════════ */
const SAVE_KEY = 'daramSquad.v1';
let SAVE = { snd: true, best: {}, done: 0 };      // 기기에만 남는 기록(개인정보 없음)
let SEL = 0;
function loadSave() {
  try { const r = JSON.parse(localStorage.getItem(SAVE_KEY)); if (r && typeof r === 'object') SAVE = Object.assign(SAVE, r); } catch (e) {}
  if (!SAVE.best || typeof SAVE.best !== 'object') SAVE.best = {};
  SAVE.done = clamp(SAVE.done | 0, 0, STAGES.length);
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {} }
const starsFor = (st, sec) => (sec <= st.par[0] ? 3 : sec <= st.par[1] ? 2 : 1);
const starHtml = (n) => '<b>' + '★'.repeat(n) + '</b>' + '★'.repeat(3 - n);
const show = (sel, on) => $(sel).classList.toggle('hidden', !on);

UI.toast = (msg, big) => {
  const box = $('#toast'), el = document.createElement('div');
  el.className = 'toast' + (big ? ' big' : '');
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('out'), big ? 2300 : 2000);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, big ? 2700 : 2400);
};
UI.track = () => {
  if (!G || G.demo) return;
  let html = '<div class="nd on">⛺</div>', now = true;
  for (const c of G.camps) {
    if (c.patrol) continue;
    const cls = c.cleared ? ' on' : now ? ' now' : '';
    html += '<div class="ln' + (c.cleared ? ' on' : '') + '"></div><div class="nd' + cls + (c.def.boss ? ' boss' : '') + '">' + (c.def.boss ? '👑' : c.cleared ? '✓' : '') + '</div>';
    if (!c.cleared) now = false;
  }
  $('#track').innerHTML = html;
};
UI.down = (on) => show('#down', on);
UI.boss = (on) => { show('#boss', on); if (on) $('#bossName').textContent = UNITS.king.name; };
UI.bump = () => { const el = $('#pAcorn'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
UI.last = { acorn: -1, squad: '', time: '', hint: '', boss: -1 };
UI.hud = (dt) => {
  G.hudT -= dt;
  if (G.hudT > 0) return;
  G.hudT = 0.1;
  const L = UI.last, h = G.hero;
  if (L.acorn !== G.acorns) { L.acorn = G.acorns; $('#acornN').textContent = G.acorns; }
  let cap = 0;
  for (const id of ['tent', 'hut', 'tree']) cap += PADS[id].caps[G.lv[id]];
  const sq = (G.allies.length - 1) + '/' + cap;
  if (L.squad !== sq) { L.squad = sq; $('#squadN').textContent = sq; }
  const tm = fmtTime(G.t);
  if (L.time !== tm) { L.time = tm; $('#timeN').textContent = tm; }
  if (G.bossOn) {
    const b = G.camps.find((c) => c.boss);
    const k = b && b.boss && !b.boss.dead ? Math.round(clamp(b.boss.hp / b.boss.maxHp, 0, 1) * 100) : 0;
    if (L.boss !== k) { L.boss = k; $('#bossFill').style.width = k + '%'; }
    if (G.won) UI.boss(false);
  }
  // 아래쪽 도움말
  let hint = '';
  if (G.won || h.down > 0) hint = '';
  else if (!G.moved) hint = '👆 화면을 끌어서(또는 방향키로) 다람 대장을 움직여요';
  else if (G.lv.tent === 0) hint = (G.acorns + G.paid.tent >= PADS.tent.costs[0]) ? '🏕️ 화살표가 가리키는 발판 위에 서 있어 보세요' : '🌰 바닥의 도토리를 주워요';
  else if (G.cleared === 0 && G.t < 50 && G.kills === 0) hint = '🐿️ 친구가 모이면 길을 따라 슬라임 둥지로 가요!';
  else if (G.t - G.wallT < 2.5) hint = '🫧 끈적 벽이에요! 이 둥지를 무너뜨리면 길이 열려요';
  else if (h.hp < h.maxHp * 0.35) hint = '🔥 모닥불 곁으로 돌아가면 금방 나아요';
  if (L.hint !== hint) {
    L.hint = hint;
    const el = $('#hint');
    if (hint) { el.textContent = hint; el.classList.remove('off'); } else el.classList.add('off');
  }
};

function buildStageCards() {
  const box = $('#stages');
  box.innerHTML = '';
  STAGES.forEach((st, i) => {
    const el = document.createElement('button'), locked = i > SAVE.done, best = SAVE.best[st.id];
    el.className = 'stg' + (i === SEL ? ' sel' : '') + (locked ? ' lock' : '');
    const cp = cpFor(i);
    el.innerHTML = '<div class="em">' + st.emoji + '</div><div class="nm">' + (i + 1) + '. ' + st.name + '</div>' +
      '<div class="ds">' + st.desc.replace('\\n', '<br>') + '</div><div class="rc">' +
      (cp ? '<span class="cont">🏴 둥지 ' + (cp.base + 1) + '/' + st.camps.length + '에서 이어하기</span>'
          : best ? '<span class="st">' + starHtml(starsFor(st, best)) + '</span> ' + fmtTime(best) : locked ? '앞 길을 먼저 되찾아요' : '첫 도전!') + '</div>';
    el.onclick = () => {
      SND.init(); SND.resume(); SND.play('ui');
      if (locked || i === SEL) return;
      SEL = i; buildStageCards();
      setTimeout(() => { if (STATE === 'title') newGame(SEL, true); }, 30);      // 뒤 배경도 그 길의 풍경으로
    };
    box.appendChild(el);
  });
  const cur = cpFor(SEL);
  $('#btnStart').textContent = cur ? '▶ 이어서 하기' : '▶ 원정 출발!';
  show('#btnFresh', !!cur);
}
/** 이 길에 남아 있는 이어하기 기록 (둥지를 하나 이상 무너뜨린 것만) */
function cpFor(si) {
  const cp = SAVE.cp;
  return cp && cp.si === si && cp.base >= 0 && cp.base < STAGES[si].camps.length - 1 ? cp : null;
}
function startStage(si, fresh) {
  SND.init(); SND.resume();
  show('#loading', true);
  const cp = fresh ? null : cpFor(si);
  if (fresh && SAVE.cp && SAVE.cp.si === si) { SAVE.cp = null; writeSave(); }
  setTimeout(() => {
    newGame(si, false, cp);
    STATE = 'play';
    show('#title', false); show('#result', false); show('#pause', false); show('#loading', false);
    $('#hud').classList.remove('off');
    $('#toast').innerHTML = '';
    UI.last = { acorn: -1, squad: '', time: '', hint: '', boss: -1 };
    UI.boss(false); UI.down(false); UI.track();
    SND.startMusic();
    UI.toast(cp ? '🏴 지난번 진지에서 다시 출발!' : G.st.emoji + ' ' + G.st.name + ' — 원정 출발!', true);
  }, 40);
}
function pauseGame() {
  if (STATE !== 'play') return;
  STATE = 'pause';
  INPUT.joy = null; INPUT.jx = INPUT.jz = 0;
  let total = 0; for (const c of G.camps) if (!c.patrol) total++;
  $('#pauseInfo').textContent = G.st.emoji + ' ' + G.st.name + ' · ' + fmtTime(G.t) + ' · 둥지 ' + G.cleared + '/' + total;
  show('#pause', true);
  SND.stopMusic();
  saveCheckpoint();
}
function resumeGame() {
  if (STATE !== 'pause') return;
  STATE = 'play'; show('#pause', false);
  if (!G.won) SND.startMusic();
}
function toTitle() {
  STATE = 'title';
  SND.stopMusic();
  show('#pause', false); show('#result', false);
  $('#hud').classList.add('off');
  SEL = Math.min(SAVE.done, STAGES.length - 1);
  buildStageCards();
  show('#title', true);
  show('#loading', true);
  setTimeout(() => { newGame(SEL, true); show('#loading', false); }, 40);
}
function showResult() {
  STATE = 'result';
  const st = G.st, sec = G.t, prev = SAVE.best[st.id], better = !prev || sec < prev;
  if (better) SAVE.best[st.id] = Math.round(sec * 10) / 10;
  SAVE.done = Math.max(SAVE.done, G.si + 1);
  writeSave();
  const n = starsFor(st, sec);
  $('#resStage').textContent = st.emoji + ' ' + st.name;
  $('#resStars').innerHTML = starHtml(n);
  $('#resNew').innerHTML = (better && prev) ? '<span class="newrec">🏆 새 기록!</span>' : '';
  $('#resTime').textContent = fmtTime(sec);
  $('#resBest').textContent = fmtTime(SAVE.best[st.id]);
  $('#resAcorn').textContent = G.earned;
  $('#resKill').textContent = G.kills;
  $('#resTip').textContent = (n === 3 ? '별 3개! 완벽한 원정이었어요.' : '별 3개는 ' + fmtTime(st.par[0]) + ' 안에 끝내면 받아요.') +
    (G.downs ? ' (지쳐서 쉰 횟수 ' + G.downs + '번)' : '');
  show('#btnNext', G.si + 1 < STAGES.length);
  $('#hud').classList.add('off');
  show('#result', true);
}
function setSound(on) {
  SAVE.snd = on; writeSave();
  SND.init(); SND.setOn(on); SND.resume();
  $('#btnSnd').textContent = on ? '🔊' : '🔇';
  $('#chipSnd').textContent = on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
  $('#chipSnd').classList.toggle('on', on);
}
function bindUI() {
  $('#btnStart').onclick = () => startStage(SEL, false);
  $('#btnFresh').onclick = () => startStage(SEL, true);
  $('#btnPause').onclick = () => pauseGame();
  $('#btnResume').onclick = () => resumeGame();
  $('#btnRetry').onclick = () => startStage(G.si, true);
  $('#btnQuit').onclick = () => { saveCheckpoint(); toTitle(); };
  $('#btnAgain').onclick = () => startStage(G.si, true);
  $('#btnHome').onclick = () => toTitle();
  $('#btnNext').onclick = () => startStage(Math.min(G.si + 1, STAGES.length - 1));
  $('#btnSnd').onclick = () => setSound(!SND.on);
  $('#chipSnd').onclick = () => { setSound(!SND.on); SND.play('ui'); };
  const de = document.documentElement, canFull = !!(de.requestFullscreen || de.webkitRequestFullscreen);
  if (!canFull) show('#chipFull', false);
  $('#chipFull').onclick = () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
    } catch (e) {}
  };
  for (const id of ['#btnSnd', '#btnPause']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
}

/* ═════════ 12. 매 프레임 · 시작 ═════════ */
let lastT = 0, saveT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - lastT) / 1000 || 0.016;
  lastT = now;
  const dt = Math.min(0.1, raw);
  if (!G) return;
  readInput();
  // 화면이 느린 기기에서도 놀이 속도는 그대로: 한 프레임의 시간을 작은 걸음 여러 번으로 나눠 계산
  if (STATE !== 'pause') { let left = dt; while (left > 0.0005) { const d = Math.min(left, 0.034); step(d); left -= d; } }
  render(now / 1000);
  if (STATE === 'play') {
    UI.hud(dt);
    if (G.won && G.winT > 3.2) showResult();
    // 몇 초마다 자동 저장 (창이 갑자기 닫혀도 산 건물과 도토리는 남음)
    saveT += raw;
    if (saveT > 4) { saveT = 0; if (G.hero.down <= 0) saveCheckpoint(); }
  }
  // 기기가 버거워하면 화면 해상도를 조금씩 낮춤 (그래도 느리면 그림자를 끔)
  if (!QUAL.lock && raw < 0.5) {
    QUAL.ms = lerp(QUAL.ms, raw * 1000, 0.05);
    if (QUAL.ms > 27) {
      QUAL.slow += raw;
      if (QUAL.slow > 2.5) { QUAL.slow = 0; if (QUAL.scale > 0.61) QUAL.scale = Math.max(0.6, QUAL.scale - 0.2); else QUAL.shadow = false; }
    } else QUAL.slow = Math.max(0, QUAL.slow - raw);
  }
}
function init() {
  loadSave();
  SND.on = SAVE.snd !== false;
  const cv = $('#gl');
  R = new Renderer(cv);
  if (!R.ok) { show('#nogl', true); show('#loading', false); show('#title', false); return; }
  cv.addEventListener('webglcontextlost', (e) => e.preventDefault());
  cv.addEventListener('webglcontextrestored', () => location.reload());
  OV.cv = $('#ov'); OV.g = OV.cv.getContext('2d');
  initMeshes();
  initInput();
  bindUI();
  $('#btnSnd').textContent = SND.on ? '🔊' : '🔇';
  $('#chipSnd').textContent = SND.on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
  $('#chipSnd').classList.toggle('on', SND.on);
  SEL = Math.min(SAVE.done, STAGES.length - 1);
  buildStageCards();
  newGame(SEL, true);
  show('#loading', false);
  requestAnimationFrame(frame);
}
/* 점검용 손잡이 (콘솔에서 __dq.G 로 지금 판을 들여다볼 수 있음) */
window.__dq = { get G() { return G; }, get STATE() { return STATE; }, step, startStage, kill, hurt, INPUT, CAM, QUAL, STAGES, UNITS, PADS, SAVE: () => SAVE };
try { init(); } catch (e) { console.error(e); show('#loading', false); show('#nogl', true); }
</script>
</body>
</html>
`;
const MASCOT_B64 = "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";

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
