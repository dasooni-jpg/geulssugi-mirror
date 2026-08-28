"use strict";
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
