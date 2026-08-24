"use strict";
/* ══════════════════════════════════════════════════════════
   우리 반 교실 꾸미기 — 아이소메트릭 합치기(머지) 게임
   화면·모양은 index.html, 게임 규칙과 그리기는 이 파일(game.js)
   오프라인 동작 · 진행 상황은 브라우저(localStorage)에만 저장

   ┌ 차례 ────────────────────────────────────────────────┐
   │  1. 자료(아이템 사슬 / 생산기 / 꾸미기)               │
   │  2. 상태 만들기 · 저장 · 불러오기                     │
   │  3. 주문 만들기        4. 소리                        │
   │  5. 캔버스 · 화면 계산 6. 애니메이션 · 캐릭터         │
   │  7. 그리기             8. 입력(끌기 · 톡 누르기)      │
   │  9. 경험치 · 레벨     10. UI 갱신                     │
   │ 11. 상점 · 도감 · 모달 12. 시작 · 루프                │
   └──────────────────────────────────────────────────────┘
   ══════════════════════════════════════════════════════════ */

/* ── 1. 자료(아이템 사슬 / 생산기 / 꾸미기) ───────────────── */
const CHAINS = {
  pen:   {name:'필기구', color:'#f0b429', items:[
    ['몽당연필','✏️'],['색연필','🖍️'],['볼펜','🖊️'],['붓','🖌️'],['만년필','🖋️'],['필기구 세트','🧰']]},
  book:  {name:'책',     color:'#4c8dff', items:[
    ['종이','📄'],['학습지','📝'],['공책','📓'],['교과서','📗'],['책더미','📚'],['독서왕 트로피','🏆']]},
  clean: {name:'청소',   color:'#4aa972', items:[
    ['휴지','🧻'],['스펀지','🧽'],['세제','🧴'],['빗자루','🧹'],['대걸레통','🪣'],['청소 로봇','🤖']]},
  food:  {name:'급식',   color:'#ef767a', items:[
    ['우유','🥛'],['과자','🍪'],['사과','🍎'],['샌드위치','🥪'],['급식판','🍱'],['생일 케이크','🎂']]},
};
const CHAIN_KEYS = Object.keys(CHAINS);
const MAXL = 6;

const GENS = {
  drawer: {name:'사물함',    emoji:'🗄️', chain:'pen',   cost:1, lv:1},
  shelf:  {name:'책꽂이',    emoji:'🗃️', chain:'book',  cost:1, lv:1},
  broom:  {name:'청소함',    emoji:'🧺', chain:'clean', cost:1, lv:1},
  cart:   {name:'급식 카트', emoji:'🍽️', chain:'food',  cost:2, lv:3},
};

/* 꾸미기 물건: wall(벽걸이) 은 벽 위치 t(0~1), floor(바닥) 는 교실 가장자리 칸 */
const DECOR = [
  {id:'clock',   name:'벽시계',    em:'🕰️', price:60,  wall:'right', t:0.72, h:78, sz:30},
  {id:'flag',    name:'태극기',    em:'🇰🇷', price:90,  wall:'right', t:0.10, h:84, sz:30},
  {id:'tv',      name:'텔레비전',  em:'📺', price:220, wall:'right', t:0.88, h:76, sz:32},
  {id:'notice',  name:'학급 게시판',em:'📋', price:120, wall:'left',  t:0.30, h:80, sz:30},
  {id:'frame',   name:'그림 액자', em:'🖼️', price:150, wall:'left',  t:0.66, h:82, sz:30},
  {id:'motto',   name:'급훈 족자', em:'📜', price:180, wall:'left',  t:0.06, h:86, sz:30},
  {id:'plant',   name:'화분',      em:'🪴', price:50,  cell:[-1,1],  sz:34},
  {id:'sun',     name:'해바라기',  em:'🌻', price:80,  cell:[-1,4],  sz:32},
  {id:'fish',    name:'어항',      em:'🐠', price:200, cell:[-1,6],  sz:34},
  {id:'piano',   name:'풍금',      em:'🎹', price:320, cell:[0,-1],  sz:38},
  {id:'doll',    name:'인형 자리', em:'🧸', price:110, cell:[3,-1],  sz:32},
  {id:'hamster', name:'햄스터 우리',em:'🐹', price:260, cell:[5,-1],  sz:32},
  {id:'ball',    name:'공 바구니', em:'🏀', price:130, cell:[6,-1],  sz:32},
  {id:'easel',   name:'그림 이젤', em:'🎨', price:170, cell:[-1,0],  sz:34},
  {id:'curtain', name:'창문 커튼', em:'🪟', price:140, special:'curtain'},
  {id:'rug',     name:'모둠 깔개', em:'🟧', price:240, special:'rug'},
];

const NAMES = ['지우','하윤','서준','민서','도윤','예린','시우','수아','건우','채원','유진','태윤','나은','현서'];
const FACES = ['🧒','👦','👧','🧑','👶'];
const SAYS = [
  '수업 준비물이 없어서 그래…','모둠 활동에 꼭 필요해!','내일 발표에 쓸 거야.',
  '선생님이 챙겨 오래.','같이 쓰면 좋겠다!','급하게 필요해 ㅠㅠ','내 것을 잃어버렸어…',
  '동아리 시간에 쓸 거야.','청소 시간에 필요해!','짝꿍이랑 같이 쓸래.'
];

/* ── 2. 상태 ─────────────────────────────────────────────── */
const GRID = 7;                 // 교실 바닥 7×7
const SAVE_KEY = 'classroom-merge-v1';
const REGEN_MS = 9000;          // 기운 1 회복 시간
let state = null;

function energyMax(){ return Math.min(60, 26 + state.level * 2); }
function xpNeed(l){ return 40 + (l - 1) * 35; }
function unlockedN(){ return state.level >= 6 ? 7 : state.level >= 3 ? 6 : 5; }
function idx(x,y){ return y * GRID + x; }
function inGrid(x,y){ return x >= 0 && y >= 0 && x < GRID && y < GRID; }
function isOpen(x,y){ const n = unlockedN(); return inGrid(x,y) && x < n && y < n; }
function popularity(){ return state.decor.length * 3; }   // 교실 인기(%)

function newState(){
  const s = {
    v:1, coins:30, energy:20, eAt:Date.now(), level:1, xp:0,
    board:new Array(GRID*GRID).fill(null),
    decor:[], orders:[], seen:{}, sound:true, merges:0, done:0
  };
  state = s;
  put(1,1,{g:'drawer'}); put(3,1,{g:'shelf'}); put(1,3,{g:'broom'});
  put(2,2,{k:'pen',l:1}); put(3,2,{k:'pen',l:1});
  put(2,3,{k:'book',l:1}); put(3,3,{k:'clean',l:1});
  put(0,4,{b:1});
  for(let i=0;i<3;i++) s.orders.push(makeOrder());
  return s;
}
function put(x,y,it){ state.board[idx(x,y)] = it; if(it && it.k) discover(it.k, it.l); }
function discover(k,l){ if(!state.seen[k] || state.seen[k] < l) state.seen[k] = l; }
function cellAt(x,y){ return inGrid(x,y) ? state.board[idx(x,y)] : null; }

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
    state.decor = state.decor || []; state.orders = state.orders || []; state.seen = state.seen || {};
    if(typeof state.sound !== 'boolean') state.sound = true;
    // 꺼져 있는 동안의 기운 회복
    const now = Date.now(), gained = Math.floor((now - (state.eAt||now)) / REGEN_MS);
    if(gained > 0){
      state.energy = Math.min(energyMax(), state.energy + gained);
      state.eAt = state.energy >= energyMax() ? now : (state.eAt + gained * REGEN_MS);
    }
    state.energy = Math.max(0, Math.min(energyMax(), state.energy));
    while(state.orders.length < 3) state.orders.push(makeOrder());
    return true;
  }catch(e){ return false; }
}

/* ── 3. 주문 만들기 ──────────────────────────────────────── */
function openChains(){
  return CHAIN_KEYS.filter(k => k !== 'food' || state.level >= 3);
}
function makeOrder(){
  const keys = openChains().slice().sort(()=>Math.random()-0.5);
  const kinds = (Math.random() < 0.32 && keys.length > 1) ? 2 : 1;
  const topL = Math.min(5, 2 + Math.floor(state.level / 2));
  const need = [];
  for(let i=0;i<kinds;i++){
    const k = keys[i];
    const l = 2 + Math.floor(Math.random() * (topL - 1));
    const cnt = l <= 2 ? (Math.random() < 0.35 ? 2 : 1) : 1;
    need.push({k, l, cnt});
  }
  let coins = 0, xp = 0;
  need.forEach(n => { coins += n.cnt * (n.l * n.l * 4 + 8); xp += n.cnt * (n.l * 4 + 3); });
  return {
    id: Math.random().toString(36).slice(2,9),
    who: NAMES[(Math.random()*NAMES.length)|0],
    face: FACES[(Math.random()*FACES.length)|0],
    say: SAYS[(Math.random()*SAYS.length)|0],
    need, coins, xp, box: Math.random() < 0.2
  };
}
function countOn(k,l){
  let c = 0;
  for(const it of state.board) if(it && it.k === k && it.l === l) c++;
  return c;
}
function orderReady(o){ return o.need.every(n => countOn(n.k, n.l) >= n.cnt); }

/* ── 4. 소리 ─────────────────────────────────────────────── */
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
  pick(){ beep(440,.04,'sine',.03); },
  drop(){ beep(330,.05,'sine',.035); },
  gen(){ beep(520,.06,'square',.03); },
  coin(){ beep(880,.06,'triangle',.05); setTimeout(()=>beep(1180,.10,'triangle',.05),60); },
  levelup(){ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.14,'triangle',.06), i*90)); },
  no(){ beep(180,.10,'sawtooth',.03); },
};

/* ── 5. 캔버스 · 화면 ────────────────────────────────────── */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const stage = document.getElementById('stage');
const TW = 92, TH = 46, WALLH = 132;          // 타일 폭·높이, 벽 높이
const OX = (GRID + 2) * TW / 2, OY = WALLH + 62;
const WORLD_W = (GRID + 2) * TW, WORLD_H = OY + (GRID - 1) * TH + 96;
const view = {z:1, px:0, py:0, fit:1, tx:0, ty:0, user:false};
let CW = 0, CH = 0, DPR = 1;

function iso(x,y){ return {x: OX + (x - y) * TW/2, y: OY + (x + y) * TH/2}; }
function unIso(wx,wy){
  const a = (wx - OX) / (TW/2), b = (wy - OY) / (TH/2);
  return {x: (b + a) / 2, y: (b - a) / 2};
}
function resize(){
  const r = stage.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = Math.max(200, r.width); CH = Math.max(200, r.height);
  cv.width = CW * DPR; cv.height = CH * DPR;
  view.fit = Math.min(CW / WORLD_W, CH / WORLD_H);
  // 세로 여백이 남으면 조금 더 크게 보여 주기(직접 확대한 적이 없을 때만)
  if(!view.user){
    const playW = (unlockedN() + 1) * TW;                 // 쓸 수 있는 자리의 가로 폭
    const zW = (CW - 24) / (playW * view.fit);            // 놀이 자리는 다 보이게
    const zH = (CH - 16) / (WORLD_H * view.fit);          // 교실 높이는 넘지 않게
    view.z = Math.max(1, Math.min(1.8, zW, zH));
  }
  clampPan();
}
function scale(){ return view.fit * view.z; }
function clampPan(){
  const s = scale();
  view.tx = (CW - WORLD_W * s) / 2 + view.px;
  view.ty = (CH - WORLD_H * s) / 2 + view.py;
  const mx = Math.max(0, (WORLD_W * s - CW) / 2 + 40);
  const my = Math.max(0, (WORLD_H * s - CH) / 2 + 40);
  view.px = Math.max(-mx, Math.min(mx, view.px));
  view.py = Math.max(-my, Math.min(my, view.py));
  view.tx = (CW - WORLD_W * s) / 2 + view.px;
  view.ty = (CH - WORLD_H * s) / 2 + view.py;
}
function screenToWorld(sx,sy){ const s = scale(); return {x:(sx - view.tx)/s, y:(sy - view.ty)/s}; }

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';
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

/* ── 6. 애니메이션 · 캐릭터 ─────────────────────────────── */
let anims = [];                 // {type,x,y,t0,dur,...}
let now = 0;
function addPop(x,y){ anims.push({type:'pop', x, y, t0:now, dur:420}); }
function addFloat(x,y,txt,color){ anims.push({type:'float', x, y, txt, color, t0:now, dur:1000}); }
function addSpark(x,y){
  for(let i=0;i<8;i++){
    const a = Math.random()*Math.PI*2, sp = 40 + Math.random()*60;
    anims.push({type:'spark', x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp - 30, t0:now, dur:600});
  }
}
const hero = {x:3, y:3, tx:3, ty:3, wait:0, say:'', sayT:0};
function heroStep(dt){
  const dx = hero.tx - hero.x, dy = hero.ty - hero.y;
  const d = Math.hypot(dx, dy);
  if(d < 0.05){
    hero.wait -= dt;
    if(hero.wait <= 0){
      const n = unlockedN();
      hero.tx = Math.floor(Math.random() * n);
      hero.ty = Math.floor(Math.random() * n);
      hero.wait = 900 + Math.random() * 2600;
      if(Math.random() < 0.35){
        hero.say = ['교실이 예뻐지고 있어!','합치면 더 좋아져~','오늘 급식 뭐지?','알림장 확인했어?','청소 시간이다!','우리 반 최고!'][(Math.random()*6)|0];
        hero.sayT = now + 2600;
      }
    }
  }else{
    const sp = 1.6 * dt / 1000;
    hero.x += dx / d * Math.min(sp, d);
    hero.y += dy / d * Math.min(sp, d);
  }
}

/* ── 7. 그리기 ───────────────────────────────────────────── */
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  // 배경(복도·창밖 느낌)
  const g = ctx.createLinearGradient(0,0,0,CH);
  g.addColorStop(0,'#e9f2ff'); g.addColorStop(.55,'#eef6ea'); g.addColorStop(1,'#e3eddc');
  ctx.fillStyle = g; ctx.fillRect(0,0,CW,CH);
  ctx.save();
  const s = scale();
  ctx.setTransform(DPR*s,0,0,DPR*s, view.tx*DPR, view.ty*DPR);

  drawSky();
  drawGround();
  drawWall('right'); drawWall('left');
  drawFloor();

  // 깊이 순 정렬해서 그리기
  const list = [];
  // 꾸미기(바닥)
  DECOR.forEach(d => {
    if(!d.cell || !state.decor.includes(d.id)) return;
    const p = iso(d.cell[0], d.cell[1]);
    list.push({d: d.cell[0] + d.cell[1] - 0.4, f: () => {
      shadow(p.x, p.y, 30);
      emoji(d.em, p.x, p.y + 8, d.sz);
    }});
  });
  // 보드 아이템
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    const it = state.board[idx(x,y)];
    if(!it) continue;
    if(drag && drag.from === idx(x,y) && drag.moved) continue;
    const p = iso(x,y);
    list.push({d: x + y, f: () => drawItem(p.x, p.y, it, popScale(x,y))});
  }
  // 학생 캐릭터
  {
    const p = iso(hero.x, hero.y);
    list.push({d: hero.x + hero.y + 0.1, f: () => {
      const bob = Math.abs(Math.sin(now/160)) * (Math.hypot(hero.tx-hero.x, hero.ty-hero.y) > .05 ? 4 : 1.2);
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
  ctx.restore();
}

function drawSky(){
  // 교실 위쪽 하늘의 뭉게구름
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
  // 교실 앞 화단
  const em = ['🌼','🌿','🌷','🌿','🌻','🌿'];
  let i = 0;
  for(let y=-0.5; y<=GRID-0.4; y+=0.62){ const p = iso(GRID + 0.18, y); emoji(em[i++ % em.length], p.x, p.y + 6, 18); }
  for(let x=GRID-0.4; x>=-0.5; x-=0.62){ const p = iso(x, GRID + 0.18); emoji(em[i++ % em.length], p.x, p.y + 6, 18); }
}
function drawGround(){
  // 교실 바깥(복도) 바닥 느낌의 넓은 판
  const c = iso((GRID-1)/2, (GRID-1)/2);
  ctx.save();
  ctx.globalAlpha = .55;
  ctx.fillStyle = '#dbe7cf';
  diamond(c.x, c.y + 18, (GRID + 3.4) * TW, (GRID + 3.4) * TH);
  ctx.fill();
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
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.lineTo(b.x, b.y - WALLH); ctx.lineTo(a.x, a.y - WALLH);
  ctx.closePath(); ctx.fill();
  // 벽 위 테두리
  ctx.fillStyle = side === 'right' ? '#e7cfa9' : '#dcc39b';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - WALLH); ctx.lineTo(b.x, b.y - WALLH);
  ctx.lineTo(b.x, b.y - WALLH - 9); ctx.lineTo(a.x, a.y - WALLH - 9);
  ctx.closePath(); ctx.fill();
  // 걸레받이
  ctx.fillStyle = 'rgba(150,110,70,.22)';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - 12); ctx.lineTo(a.x, a.y - 12);
  ctx.closePath(); ctx.fill();

  if(side === 'right') drawBlackboard(a, b);
  else drawWindows(a, b);

  // 벽걸이 꾸미기
  DECOR.forEach(d => {
    if(d.wall !== side || !state.decor.includes(d.id)) return;
    const px = a.x + (b.x - a.x) * d.t, py = a.y + (b.y - a.y) * d.t;
    emoji(d.em, px, py - d.h, d.sz);
  });
}

function drawBlackboard(a,b){
  // 칠판(기본 설치)
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
  // 분필 글씨
  ctx.save();
  const mx = (p0.x + p1.x)/2, my = (p0.y + p1.y)/2 - (top + bot)/2;
  ctx.translate(mx, my);
  ctx.rotate(Math.atan2(p1.y - p0.y, p1.x - p0.x));
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.font = '700 17px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('우리 반 교실', 0, -12);
  ctx.font = '700 13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
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
  const n = unlockedN();
  // 바닥 두께
  const f0 = iso(-0.5, GRID - 0.5), f1 = iso(GRID - 0.5, GRID - 0.5), f2 = iso(GRID - 0.5, -0.5);
  ctx.fillStyle = '#d8b98d';
  ctx.beginPath();
  ctx.moveTo(f0.x, f0.y); ctx.lineTo(f1.x, f1.y); ctx.lineTo(f2.x, f2.y);
  ctx.lineTo(f2.x, f2.y + 13); ctx.lineTo(f1.x, f1.y + 13); ctx.lineTo(f0.x, f0.y + 13);
  ctx.closePath(); ctx.fill();

  const rug = state.decor.includes('rug');
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    const p = iso(x,y), open = x < n && y < n;
    let col = ((x + y) % 2 === 0) ? '#f6e4c6' : '#efd8b3';
    if(!open) col = ((x + y) % 2 === 0) ? '#e0d5c4' : '#d8ccba';
    if(rug && open && x >= 1 && x <= 3 && y >= 1 && y <= 3) col = ((x+y)%2===0) ? '#f2b98a' : '#eaa877';
    ctx.fillStyle = col;
    diamond(p.x, p.y, TW, TH); ctx.fill();
    ctx.strokeStyle = open ? 'rgba(160,120,70,.16)' : 'rgba(90,80,70,.18)';
    ctx.lineWidth = 1; ctx.stroke();
  }
  // 끌기 대상 칸 강조
  if(drag && drag.moved && drag.over && isOpen(drag.over.x, drag.over.y)){
    const p = iso(drag.over.x, drag.over.y);
    const tgt = cellAt(drag.over.x, drag.over.y);
    const can = tgt && drag.item.k && tgt.k === drag.item.k && tgt.l === drag.item.l && tgt.l < MAXL;
    ctx.save();
    ctx.fillStyle = can ? 'rgba(74,169,114,.35)' : 'rgba(232,137,74,.28)';
    diamond(p.x, p.y, TW - 4, TH - 2); ctx.fill();
    ctx.strokeStyle = can ? '#4aa972' : '#e8894a'; ctx.lineWidth = 2.5;
    diamond(p.x, p.y, TW - 4, TH - 2); ctx.stroke();
    ctx.restore();
  }
}

function drawLocks(){
  const n = unlockedN();
  if(n >= GRID) return;
  for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++){
    if(x < n && y < n) continue;
    if((x === n && y <= n) || (y === n && x <= n)){
      const p = iso(x,y);
      ctx.globalAlpha = .55;
      emoji('🔒', p.x, p.y + 8, 19);
      ctx.globalAlpha = 1;
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
  if(it.g){                                   // 생산기
    const G = GENS[it.g];
    const ready = state.energy >= G.cost;
    shadow(cx, cy, 46 * sc);
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    ctx.fillStyle = ready ? 'rgba(255,255,255,.85)' : 'rgba(230,225,218,.8)';
    diamond(cx, cy + 4, TW - 14, TH - 8); ctx.fill();
    ctx.strokeStyle = ready ? '#e8894a' : '#c3b8ac';
    ctx.lineWidth = 2 + (ready ? Math.abs(Math.sin(now/420)) * 1.6 : 0);
    diamond(cx, cy + 4, TW - 14, TH - 8); ctx.stroke();
    emoji(G.emoji, cx, cy + 6, 40);
    ctx.globalAlpha = ready ? 1 : .45;
    badge(cx + 19, cy - 16, '⚡' + G.cost, '#3a2f28');
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  if(it.b){                                   // 선물 상자
    shadow(cx, cy, 40 * sc);
    const bob = Math.sin(now/300) * 3;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    emoji('🎁', cx, cy + 6 + bob, 40);
    ctx.restore();
    return;
  }
  const C = CHAINS[it.k];
  if(!C) return;
  const info = C.items[it.l - 1];
  shadow(cx, cy, 36 * sc);
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  emoji(info[1], cx, cy + 7, 36);
  badge(cx + 17, cy - 12, String(it.l), C.color);
  ctx.restore();
}
function badge(x, y, txt, color){
  ctx.font = '700 11px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  const w = Math.max(17, ctx.measureText(txt).width + 9);
  ctx.fillStyle = color;
  roundRect(x - w/2, y - 8, w, 16, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, x, y + 1);
  ctx.textBaseline = 'alphabetic';
}
function bubble(x, y, txt){
  ctx.font = '700 13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
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
      ctx.font = '800 17px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(a.txt, p.x, p.y - 22 - t * 34);
      ctx.fillStyle = a.color;
      ctx.fillText(a.txt, p.x, p.y - 22 - t * 34);
      ctx.restore();
    }else if(a.type === 'spark'){
      const p = iso(a.x, a.y);
      const tt = t * a.dur / 1000;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffd873';
      ctx.beginPath();
      ctx.arc(p.x + a.vx * tt, p.y - 6 + a.vy * tt + 120 * tt * tt, 3.4 * (1 - t) + 1, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}
function drawDragGhost(){
  const w = screenToWorld(drag.sx, drag.sy);
  ctx.save();
  ctx.globalAlpha = .92;
  drawItem(w.x, w.y - 14, drag.item, 1.16);
  ctx.restore();
}

/* ── 8. 입력(끌기 · 톡 누르기 · 화면 이동) ──────────────── */
let drag = null, pan = null;
function pointerCell(ev){
  const r = cv.getBoundingClientRect();
  const w = screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
  const c = unIso(w.x, w.y);
  return {x: Math.round(c.x), y: Math.round(c.y), sx: ev.clientX - r.left, sy: ev.clientY - r.top};
}
cv.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  cv.setPointerCapture(ev.pointerId);
  const c = pointerCell(ev);
  const it = isOpen(c.x, c.y) ? cellAt(c.x, c.y) : null;
  if(it){
    drag = {from: idx(c.x,c.y), item: it, sx: c.sx, sy: c.sy, x0: c.sx, y0: c.sy, moved: false, over: {x:c.x, y:c.y}};
  }else{
    pan = {sx: ev.clientX, sy: ev.clientY, px: view.px, py: view.py};
  }
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
function endPointer(ev){
  if(drag){
    const d = drag; drag = null;
    if(!d.moved) tapCell(d.from, d.item);
    else if(d.over && isOpen(d.over.x, d.over.y)) dropOn(d, idx(d.over.x, d.over.y));
    refresh();
  }
  pan = null;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());

function dropOn(d, to){
  if(to === d.from) return;
  const a = d.item, b = state.board[to];
  if(!b){                                     // 빈 칸으로 옮기기
    state.board[to] = a; state.board[d.from] = null; sfx.drop();
  }else if(a.k && b.k && a.k === b.k && a.l === b.l && a.l < MAXL){
    doMerge(d.from, to, a);
  }else{                                      // 자리 바꾸기
    state.board[to] = a; state.board[d.from] = b; sfx.drop();
  }
  save();
}
function doMerge(from, to, a){
  const nl = a.l + 1;
  state.board[to] = {k: a.k, l: nl};
  discover(a.k, nl);
  state.board[from] = null;
  state.merges++;
  const gain = nl * nl * 2 + 3;
  state.coins += gain;
  addXp(nl * 3);
  const tx = to % GRID, ty = (to / GRID) | 0;
  addPop(tx, ty); addSpark(tx, ty);
  addFloat(tx, ty, '+' + gain + '🪙', '#f0b429');
  sfx.merge();
  const nm = CHAINS[a.k].items[nl-1][0];
  say(nl === MAXL ? '🎉 ' + nm + ' 완성! 최고 단계예요!' : CHAINS[a.k].items[nl-1][1] + ' ' + nm + ' 이(가) 되었어요!');
}
function tapCell(i, it){
  const x = i % GRID, y = (i / GRID) | 0;
  if(trashMode){                              // 정리 모드: 물건 하나 버리기
    if(it.g){ sfx.no(); say('사물함 · 책꽂이 같은 상자는 버릴 수 없어요.'); return; }
    state.board[i] = null;
    addSpark(x, y); sfx.drop();
    setTrash(false);
    say('물건 하나를 정리했어요. 자리가 생겼어요!');
    save(); return;
  }
  if(it.g){
    const G = GENS[it.g];
    if(state.energy < G.cost){ sfx.no(); say('⚡ 기운이 부족해요. 조금 기다리면 채워져요!'); return; }
    const spot = nearestEmpty(x, y);
    if(spot < 0){ sfx.no(); say('교실이 꽉 찼어요! 같은 것끼리 합쳐 자리를 만들어요.'); return; }
    spendEnergy(G.cost);
    const lv = Math.random() < 0.18 ? 2 : 1;
    state.board[spot] = {k: G.chain, l: lv};
    discover(G.chain, lv);
    addPop(spot % GRID, (spot / GRID) | 0);
    sfx.gen();
    say(GENS[it.g].name + '에서 ' + CHAINS[G.chain].items[lv-1][0] + ' 이(가) 나왔어요!');
    save(); return;
  }
  if(it.b){
    state.board[i] = null;
    const n = 3;
    let made = 0;
    for(let j=0;j<n;j++){
      const spot = j === 0 ? i : nearestEmpty(x, y);
      if(spot < 0) break;
      const keys = openChains();
      const k = keys[(Math.random()*keys.length)|0];
      const lv = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
      const nl = Math.min(4, lv);
      state.board[spot] = {k, l: nl};
      discover(k, nl);
      addPop(spot % GRID, (spot / GRID) | 0);
      made++;
    }
    addSpark(x, y); sfx.coin();
    say('🎁 선물 상자에서 물건 ' + made + '개가 나왔어요!');
    save(); return;
  }
  const C = CHAINS[it.k], info = C.items[it.l-1];
  if(it.l < MAXL) say(info[1] + ' ' + info[0] + ' — 같은 것끼리 겹치면 ' + C.items[it.l][0] + ' 이(가) 돼요!');
  else say(info[1] + ' ' + info[0] + ' — 가장 좋은 단계예요! 주문에 쓰거나 자랑해요.');
  sfx.pick();
}
function nearestEmpty(x, y){
  const n = unlockedN();
  if(isOpen(x,y) && !state.board[idx(x,y)]) return idx(x,y);
  for(let r=1;r<n+2;r++){
    const cand = [];
    for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++){
      if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if(isOpen(nx,ny) && !state.board[idx(nx,ny)]) cand.push(idx(nx,ny));
    }
    if(cand.length) return cand[(Math.random()*cand.length)|0];
  }
  return -1;
}
function spendEnergy(c){
  if(state.energy >= energyMax()) state.eAt = Date.now();
  state.energy -= c;
}

/* ── 9. 경험치 · 레벨 ────────────────────────────────────── */
function addXp(n){
  state.xp += n;
  while(state.xp >= xpNeed(state.level)){
    state.xp -= xpNeed(state.level);
    state.level++;
    onLevelUp();
  }
}
function onLevelUp(){
  state.energy = Math.min(energyMax(), state.energy + 10);
  sfx.levelup();
  let msg = '🎉 레벨 ' + state.level + ' 이 되었어요!';
  if(state.level === 3){
    const spot = nearestEmpty(3, 3);
    if(spot >= 0){ state.board[spot] = {g:'cart'}; msg += ' 🍽️ 급식 카트가 생겼어요!'; }
  }
  if(state.level === 3 || state.level === 6){
    msg += ' 🔓 교실 자리가 넓어졌어요!';
    if(!view.user) resize();                 // 넓어진 자리에 맞춰 화면 크기 다시 맞추기
  }
  const spot2 = nearestEmpty(2, 2);
  if(spot2 >= 0) state.board[spot2] = {b:1};
  toast(msg);
  say(msg);
}

/* ── 10. UI 갱신 ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
function refresh(){
  $('coins').textContent = state.coins;
  $('energy').textContent = state.energy + '/' + energyMax();
  $('lv').textContent = state.level;
  $('xptxt').textContent = state.xp + '/' + xpNeed(state.level);
  $('xpbar').style.width = Math.min(100, state.xp / xpNeed(state.level) * 100) + '%';
  $('popTxt').textContent = state.decor.length ? '교실 인기 +' + popularity() + '%' : '';
  renderOrders();
}
function renderEnergyTimer(){
  const max = energyMax();
  if(state.energy >= max){ $('energyNext').textContent = ''; return; }
  const left = Math.max(0, REGEN_MS - (Date.now() - state.eAt));
  const s = Math.ceil(left / 1000);
  $('energyNext').textContent = s + '초';
}
function renderOrders(){
  const box = $('orders');
  box.innerHTML = '';
  state.orders.forEach(o => {
    const ready = orderReady(o);
    const el = document.createElement('div');
    el.className = 'order';
    const needs = o.need.map(n => {
      const has = countOn(n.k, n.l), ok = has >= n.cnt;
      const info = CHAINS[n.k].items[n.l-1];
      return '<div class="need' + (ok ? ' ok' : '') + '"><span class="em">' + info[1] + '</span>' +
             '<span>' + Math.min(has, n.cnt) + '/' + n.cnt + '</span></div>';
    }).join('');
    el.innerHTML =
      '<button class="skip" title="다른 주문으로 바꾸기">✕</button>' +
      '<div class="who"><span class="face">' + o.face + '</span>' + o.who + '</div>' +
      '<div class="say">' + o.say + '</div>' +
      '<div class="needs">' + needs + '</div>' +
      '<div class="bottom"><div class="reward">🪙' + rewardCoins(o) + ' · <b>+' + o.xp + 'xp</b>' +
      (o.box ? ' 🎁' : '') + '</div>' +
      '<button class="give' + (ready ? ' on' : '') + '">주기</button></div>';
    el.querySelector('.give').onclick = () => deliver(o);
    el.querySelector('.skip').onclick = () => skipOrder(o);
    box.appendChild(el);
  });
}
function rewardCoins(o){ return Math.round(o.coins * (1 + popularity() / 100)); }
function deliver(o){
  if(!orderReady(o)){ sfx.no(); say('아직 물건이 모자라요. 합쳐서 만들어 보세요!'); return; }
  o.need.forEach(n => {
    let left = n.cnt;
    for(let i=0;i<state.board.length && left>0;i++){
      const it = state.board[i];
      if(it && it.k === n.k && it.l === n.l){ state.board[i] = null; left--; addPop(i % GRID, (i/GRID)|0); }
    }
  });
  const c = rewardCoins(o);
  state.coins += c;
  state.done++;
  addFloat(3, 3, '+' + c + '🪙', '#f0b429');
  if(o.box){
    const spot = nearestEmpty(3, 3);
    if(spot >= 0) state.board[spot] = {b:1};
  }
  addXp(o.xp);
  sfx.coin();
  say(o.who + ' 이(가) 고마워해요! 🪙' + c + ' 을(를) 받았어요.');
  state.orders[state.orders.indexOf(o)] = makeOrder();
  save(); refresh();
}
function skipOrder(o){
  const cost = 10;
  if(state.coins < cost){ sfx.no(); say('주문을 바꾸려면 🪙' + cost + ' 이 필요해요.'); return; }
  state.coins -= cost;
  state.orders[state.orders.indexOf(o)] = makeOrder();
  sfx.drop(); save(); refresh();
}

/* 안내 문구 */
let hintT = 0;
function say(txt){
  const h = $('hint');
  h.textContent = txt; h.classList.add('on');
  clearTimeout(hintT);
  hintT = setTimeout(() => h.classList.remove('on'), 2600);
}
let toastT = 0;
function toast(txt){
  const t = $('toast');
  t.textContent = txt; t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2400);
}

/* ── 11. 상점 · 도감 · 모달 ─────────────────────────────── */
function openModal(id){ $(id).classList.add('on'); }
function closeModal(id){ $(id).classList.remove('on'); }
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
document.querySelectorAll('.modal').forEach(m => m.onclick = e => { if(e.target === m) m.classList.remove('on'); });

function renderShop(){
  const g = $('shopGrid');
  g.innerHTML = '';
  DECOR.slice().sort((a,b) => a.price - b.price).forEach(d => {
    const owned = state.decor.includes(d.id);
    const can = state.coins >= d.price;
    const el = document.createElement('div');
    el.className = 'shopitem' + (owned ? ' owned' : '');
    el.innerHTML =
      '<div class="em">' + d.em + '</div><div class="nm">' + d.name + '</div>' +
      '<button ' + (owned || !can ? 'disabled' : '') + '>' +
      (owned ? '설치됨 ✓' : '🪙 ' + d.price) + '</button>';
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
function renderGuide(){
  const g = $('guideBox');
  g.innerHTML = '';
  CHAIN_KEYS.forEach(k => {
    const C = CHAINS[k];
    const best = bestSeen(k);
    const line = C.items.map((it, i) =>
      '<span style="opacity:' + (i < best ? 1 : .22) + '">' + it[1] + '</span>'
    ).join('<span style="font-size:12px;color:#c3b8ac"> › </span>');
    const el = document.createElement('div');
    el.className = 'chainbox';
    el.innerHTML = '<div class="cn">' + C.name + ' — ' +
      C.items.map((it,i) => (i < best ? it[0] : '???')).join(' › ') + '</div><div class="cl">' + line + '</div>';
    g.appendChild(el);
  });
  const st = document.createElement('p');
  st.className = 'sub';
  st.style.marginTop = '10px';
  st.innerHTML = '지금까지 합친 횟수 <b>' + state.merges + '</b>번 · 들어준 부탁 <b>' + state.done + '</b>개 · 꾸민 물건 <b>' + state.decor.length + '</b>개';
  g.appendChild(st);
}
function bestSeen(k){
  let best = state.seen[k] || 1;
  for(const it of state.board) if(it && it.k === k) best = Math.max(best, it.l);
  return Math.max(best, 1);
}

$('btnShop').onclick = () => { renderShop(); openModal('mShop'); };
$('btnGuide').onclick = () => { renderGuide(); openModal('mGuide'); };
$('btnHelp').onclick = () => openModal('mHelp');
$('btnSound').onclick = () => {
  state.sound = !state.sound;
  $('btnSound').textContent = state.sound ? '🔊' : '🔇';
  if(state.sound) sfx.pick();
  save();
};
let trashMode = false;
function setTrash(on){
  trashMode = on;
  $('btnTrash').style.background = on ? 'linear-gradient(180deg,#f2938a,#d95f52)' : '';
  $('btnTrash').style.color = on ? '#fff' : '';
}
$('btnTrash').onclick = () => {
  setTrash(!trashMode);
  if(trashMode) say('🗑️ 버릴 물건을 톡 누르세요. (한 개만 버려져요)');
};
$('btnZoomIn').onclick = () => { view.user = true; view.z = Math.min(2.4, view.z * 1.25); clampPan(); };
$('btnZoomOut').onclick = () => { view.user = true; view.z = Math.max(0.7, view.z / 1.25); clampPan(); };
$('btnFit').onclick = () => { view.user = false; view.z = 1; view.px = 0; view.py = 0; resize(); };
$('btnReset').onclick = () => {
  if(!confirm('정말 처음부터 다시 시작할까요? 지금까지 꾸민 교실이 모두 사라져요.')) return;
  try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  newState(); save(); closeModal('mHelp'); refresh();
  toast('새 교실을 시작했어요!');
};
cv.addEventListener('wheel', e => {
  e.preventDefault();
  view.user = true;
  view.z = Math.max(0.7, Math.min(2.4, view.z * (e.deltaY < 0 ? 1.1 : 0.9)));
  clampPan();
}, {passive:false});

/* ── 12. 시작 · 루프 ─────────────────────────────────────── */
if(!load()) newState();
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
  // 기운 회복
  const max = energyMax();
  if(state.energy < max){
    while(state.energy < max && Date.now() - state.eAt >= REGEN_MS){
      state.energy++; state.eAt += REGEN_MS;
    }
    if(state.energy >= max) state.eAt = Date.now();
  }else{
    state.eAt = Date.now();
  }
  heroStep(dt);
  draw();
  tick += dt;
  if(tick > 400){ tick = 0; refresh(); renderEnergyTimer(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
refresh();
setInterval(save, 10000);
document.addEventListener('visibilitychange', () => { if(document.hidden) save(); });
window.addEventListener('pagehide', save);
setTimeout(() => say('같은 물건 둘을 끌어다 겹쳐 보세요! 🗄️사물함을 톡 누르면 물건이 나와요.'), 700);
