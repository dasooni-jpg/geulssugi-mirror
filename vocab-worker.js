/*
 * 매일 어휘 — 온라인 서버 (Cloudflare Worker + D1 + Google Gemini AI)
 * ──────────────────────────────────────────────────────────
 * 6학년 · 중등 · 고등 학생이 매일 어휘를 공부하는 앱입니다.
 * 매일 레벨당 20개를 AI(Gemini)가 자동으로 만들어 D1에 저장하고
 * 반 전체가 같은 어휘를 공유합니다. 학생은 그중 하루에 몇 개(10/15/20)
 * 할지 스스로 고를 수 있습니다.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-vocab-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(vocab-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: vocab-40)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: vocab-40)
 *  3. 이 파일(vocab-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 vocab-40 선택
 *  5. Worker → Settings → Variables and Secrets → Add
 *     - Type: Secret / Name: GEMINI_API_KEY / Value: (Google AI Studio에서 발급받은 Gemini API 키)
 *     ※ 키가 없으면 학생이 오늘의 어휘를 받을 수 없어요.
 *  6. (AI 생성 시 "User location is not supported" 오류가 나면) AI Gateway 경유 설정:
 *     - AI → AI Gateway → Create Gateway (이름 예: vocab-40)
 *     - Worker → Settings → Variables 에 아래 둘 추가 (Text 로):
 *         CF_AIG_ACCOUNT_ID = (대시보드 우측의 Account ID)
 *         CF_AIG_GATEWAY    = (위에서 만든 Gateway 이름)
 *     ※ 한국 일부 통신망이 홍콩 데이터센터로 라우팅될 때 Gemini 가 막는 문제를 우회합니다.
 *  7. 배포 주소를 학생 태블릿 홈 화면에 추가하면 끝!
 *
 * 학생은 회원가입 없이 [반 선택 → 별명] 만으로 시작합니다. (개인정보 제로)
 * 이후엔 그 기기에서 별명 입력 없이 자동으로 이어서 학습하며, 별명은 "나의 기록" 화면에서 바꿀 수 있습니다.
 */

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>매일 어휘</title>
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
  .sec-btn { width: 100%; background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 18px; text-align: left; margin-bottom: 12px; display: flex; align-items: center; gap: 14px; border: 1.5px solid var(--line); }
  .sec-btn.on { border-color: var(--blue); background: var(--blue-soft); }
  .sec-btn .ico { font-size: 28px; }
  .sec-btn .nm { font-size: 18px; font-weight: 800; }
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
  .study-card .hint { color: var(--sub); font-size: 13.5px; margin-top: 16px; }
  .study-card .meaning { font-size: 21px; font-weight: 700; line-height: 1.5; }
  .study-card .example { margin-top: 14px; color: var(--ink); line-height: 1.6; background: var(--bg); border-radius: 8px; padding: 10px 14px; font-size: 15.5px; }
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
</style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>

<script>
"use strict";
/* ═══════════════════════════════════════════════════════════
   매일 어휘 — 화면 (학생용 단일 파일)
   서버: vocab-worker.js (Cloudflare Worker + D1 + Google Gemini AI)
   ═══════════════════════════════════════════════════════════ */

const $app = document.getElementById("app");
const LS_LOGIN = "vocab40.login";
const LS_DEVICE = "vocab40.device";
const SET_SIZE = 10;          // 한 세트 = 10개
const QUIZ_COUNT = 20;        // 확인모드 문항 수
const MINI_COUNT = 3;         // 세트 끝 미니 확인 문항 수
const WRONG_MIX = 6;          // 확인모드에 섞는 오답 노트 어휘 수
const WRONG_GRADUATE = 2;     // 오답 재시험에서 이만큼 맞히면 졸업

const DAILY_GOALS = [10, 15, 20]; // 하루에 몇 개 할지 학생이 고르는 선택지(서버 상수와 일치시킬 것)
const S = {                   // 앱 전체 상태
  appName: "매일 어휘",
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
}
function addWrong(w) {
  const found = S.data.wrong.find(x => x.word === w.word);
  if (found) { found.miss = (found.miss | 0) + 1; found.hit = 0; }
  else S.data.wrong.push({ word: w.word, meaning: w.meaning, example: w.example || "", synonym: w.synonym || "", antonym: w.antonym || "", day: S.today, miss: 1, hit: 0 });
}

/* ── 문제 만들기 (모두 화면에서 생성 — 어휘 데이터만 서버에서 받음) ── */
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
  // 오답 노트 어휘 먼저 섞어 넣기 (재출현) — 오늘 어휘와 겹치면 한 번만 출제
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
      <div class="big">📚 <em>\${esc(S.appName)}</em></div>
      <div class="sub" style="margin-top:8px">내 수준과 하루 목표에 맞는 어휘 공부</div>
    </div>
    <div class="sub" style="margin:4px 2px 10px;font-weight:700">1. 나의 단계를 골라요</div>
    <div id="secList">\${S.sections.map(s => \`
      <button class="sec-btn \${s.key === pickedSection ? "on" : ""}" data-k="\${s.key}">
        <span class="ico">\${{ elem: "🌱", middle: "🌿", high: "🌳" }[s.key] || "📖"}</span>
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
      <div class="stat-box"><div class="v">\${data.totalLearned | 0}</div><div class="k">누적 학습 어휘</div></div>
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

/* ── 오늘의 어휘 불러오기 (없으면 서버의 AI가 생성 — 시간이 걸릴 수 있음) ── */
// 서버가 준 전체 목록(최대 20개, 반 공유)을 학생의 하루 목표만큼 잘라서 화면에 쓴다.
function applyWords(list) {
  S.fullWords = list;
  const goal = DAILY_GOALS.includes(S.data.dailyGoal) ? S.data.dailyGoal : 20;
  S.words = list.slice(0, goal);
}
async function loadTodayThenHome() {
  render(\`<div class="loading-box card" style="margin-top:70px">
    <div class="spinner"></div>
    <div style="font-weight:800;font-size:17px">오늘의 어휘를 준비하고 있어요</div>
    <div class="sub" style="margin-top:8px">오늘 처음 접속했다면 AI 선생님이 새 어휘 20개를<br>만드는 중이에요. 1~2분 정도 걸릴 수 있어요 ⏳</div>
  </div>\`);
  const r = await api("/api/today", { section: S.login.section });
  if (!r.ok) {
    render(\`<div class="loading-box card" style="margin-top:70px">
      <div style="font-size:34px">😢</div>
      <div style="font-weight:800;margin-top:8px">오늘의 어휘를 준비하지 못했어요</div>
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
    <div style="font-weight:800;font-size:17px">\${esc(dayLabel(day))} 어휘를 준비하고 있어요</div>
    <div class="sub" style="margin-top:8px">처음 여는 날짜라면 AI 선생님이 새 어휘를 만드는 중이에요.<br>1~2분 정도 걸릴 수 있어요 ⏳</div>
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
  render(\`
    <div class="home-head">
      <div>
        <div class="title">안녕, \${esc(S.data.nickname)}! 👋</div>
        <div class="sub">\${esc(secName(S.login.section))} · \${esc(S.today)}</div>
      </div>
      <button class="btn gray" id="btnOut" style="padding:8px 13px;font-size:13px">나가기</button>
    </div>
    \${weekTabsHtml()}
    <div class="card">
      <div class="row">
        <div class="grow">
          <b>\${esc(label)}의 어휘 \${S.words.length}개</b>
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
      <button class="menu-btn" id="mnStats"><span class="ico">📊</span><span class="nm">나의 기록</span><div class="st">누적 \${S.data.totalLearned | 0}개 학습</div></button>
    </div>
  \`);
  document.getElementById("btnOut").onclick = logout;
  document.getElementById("mnStudy").onclick = viewSets;
  document.getElementById("mnQuiz").onclick = startQuiz;
  document.getElementById("mnWrong").onclick = viewWrong;
  document.getElementById("mnStats").onclick = viewStats;
  document.querySelectorAll(".wtab").forEach(b => b.onclick = () => switchToDay(b.dataset.d));
}

/* ── 공부모드: 세트 목록 ── */
function viewSets() {
  const t = todayRec();
  render(\`
    \${topbar("📖 공부모드", "viewHomeGo")}
    <div class="sub" style="margin:0 2px 12px">한 번에 10개씩! 카드를 눌러 뜻을 확인하며 익혀요.</div>
    \${t.sets.map((done, i) => {
      const from = i * SET_SIZE, to = Math.min((i + 1) * SET_SIZE, S.words.length);
      return \`<button class="set-row \${done ? "done" : ""}" data-i="\${i}">
        <span class="no">\${done ? "✓" : (i + 1)}</span>
        <span class="grow"><b>세트 \${i + 1}</b> <span class="sub">(\${from + 1}~\${to}번 어휘)</span></span>
        <span class="badge \${done ? "green" : "blue"}">\${done ? "완료" : "학습하기"}</span>
      </button>\`;
    }).join("")}
  \`);
  window.viewHomeGo = viewHome;
  document.querySelectorAll(".set-row").forEach(b => b.onclick = () => startSet(Number(b.dataset.i)));
}

/* ── 공부모드: 카드 넘기기 ── */
const study = { setIdx: 0, cardIdx: 0, flipped: false, cards: [] };
function startSet(i) {
  study.setIdx = i;
  study.cards = S.words.slice(i * SET_SIZE, (i + 1) * SET_SIZE);
  study.cardIdx = 0; study.flipped = false;
  viewCard();
}
function viewCard() {
  const w = study.cards[study.cardIdx];
  const last = study.cardIdx === study.cards.length - 1;
  render(\`
    \${topbar("세트 " + (study.setIdx + 1) + " 학습", "viewSetsGo")}
    <div class="card-count">\${study.cardIdx + 1} / \${study.cards.length}</div>
    <div class="study-card" id="theCard">
      \${!study.flipped ? \`
        <div class="word">\${esc(w.word)}</div>
        <div class="hint">카드를 누르면 뜻이 나와요</div>
      \` : \`
        <div style="font-size:19px;font-weight:800;color:var(--blue);margin-bottom:10px">\${esc(w.word)}</div>
        <div class="meaning">\${esc(w.meaning)}</div>
        \${w.example ? \`<div class="example">📝 \${esc(w.example)}</div>\` : ""}
        \${(w.synonym || w.antonym) ? \`<div class="syn">\${w.synonym ? "비슷한말: <b>" + esc(w.synonym) + "</b>" : ""}\${w.synonym && w.antonym ? " · " : ""}\${w.antonym ? "반대말: <b>" + esc(w.antonym) + "</b>" : ""}</div>\` : ""}
      \`}
    </div>
    <div class="card-nav">
      <button class="btn ghost grow" id="btnPrev" \${study.cardIdx === 0 ? "disabled" : ""}>← 이전</button>
      <button class="btn grow" id="btnNext">\${last && study.flipped ? "미니 확인 풀기 ✏️" : "다음 →"}</button>
    </div>
  \`);
  window.viewSetsGo = viewSets;
  document.getElementById("theCard").onclick = () => { study.flipped = !study.flipped; viewCard(); };
  document.getElementById("btnPrev").onclick = () => { study.cardIdx--; study.flipped = false; viewCard(); };
  document.getElementById("btnNext").onclick = () => {
    if (last) { if (study.flipped) return startMiniCheck(); study.flipped = true; viewCard(); return; }
    if (!study.flipped) { study.flipped = true; viewCard(); return; }
    study.cardIdx++; study.flipped = false; viewCard();
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
      <b>\${esc(q.word.word)}</b> — \${esc(q.word.meaning)}
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
  if (quiz.qs.length === 0) return toast("문제를 만들 어휘가 부족해요.");
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
      <b>이번에 틀린 어휘 \${quiz.wrongs.length}개</b>
      <div style="margin-top:8px">\${quiz.wrongs.map(w => \`
        <div class="wrong-item"><span class="w">\${esc(w.word)}</span><div class="m">\${esc(w.meaning)}</div></div>\`).join("")}
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
      <div class="sub" style="margin-top:6px">확인모드에서 틀린 어휘가 여기에 모여요.</div></div>\`
    : \`
    <div class="row" style="margin-bottom:12px">
      <div class="sub grow">틀린 어휘 \${list.length}개 · 재시험에서 \${WRONG_GRADUATE}번 맞히면 졸업해요</div>
      <button class="btn" id="btnRetest" style="padding:10px 16px">재시험 보기</button>
    </div>
    <div class="card">
      \${list.map(w => \`<div class="wrong-item">
        <span class="w">\${esc(w.word)}</span>
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
  if (retest.qs.length === 0) return toast("재시험 문제를 만들 어휘가 부족해요.");
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
      <div class="stat-box"><div class="v">\${S.data.totalLearned | 0}</div><div class="k">누적 학습 어휘</div></div>
      <div class="stat-box"><div class="v">\${S.data.wrong.length}</div><div class="k">오답 노트</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="sub" style="margin-bottom:8px">하루 목표</div>
      <div class="goal-row">\${DAILY_GOALS.map(n => \`<button class="goal-btn \${n === S.data.dailyGoal ? "on" : ""}" data-g="\${n}">\${n}개</button>\`).join("")}</div>
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
}

/* ═══════════════ 시작 ═══════════════ */
async function boot() {
  const info = await api("/api/info", {});
  if (info.ok) { S.appName = info.appName; S.sections = info.sections; }
  else S.sections = [{ key: "elem", name: "6학년" }, { key: "middle", name: "중등" }, { key: "high", name: "고등" }];
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

// ── 레벨(섹션) 정의 ──
const SECTIONS = {
  elem: {
    name: "6학년",
    desc: "초등학교 6학년 교과서와 교육과정에 나오는 기본 어휘. 국어·사회·과학·수학 교과 개념어, 기초 한자어, 자주 쓰는 관용 표현을 골고루 섞고, 초등 고학년 눈높이의 쉬운 뜻풀이를 쓴다. 대부분(80% 정도)은 6학년 수준으로 하되, 나머지 20% 정도는 한 단계 위인 중학교 초반 수준의 약간 어려운 단어를 섞어 도전 의식을 준다.",
  },
  middle: {
    name: "중등",
    desc: "중학교 교과서와 독서 자료 수준의 표준 어휘. 교과 개념어와 한자어 중심으로 하되, 중학생이 글을 읽다 자주 막히는 추상어도 섞는다. 대부분(80% 정도)은 중등 수준으로 하되, 나머지 20% 정도는 초등 고학년 복습 수준의 쉬운 단어와 고등학교 입문 수준의 어려운 단어를 함께 섞어 난이도 폭을 넓힌다.",
  },
  high: {
    name: "고등",
    desc: "고등학교 교과서와 수능·모의고사 지문 수준의 개념어·추상어. 한자어 비중을 높게 하고, 인문·사회·과학·예술 지문에 두루 나오는 어휘를 섞는다. 대부분(80% 정도)은 고등 수준으로 하되, 나머지 20% 정도는 중학교 심화 수준의 비교적 쉬운 단어를 섞어 난이도 폭을 넓힌다.",
  },
};
const WORDS_PER_DAY = 20; // 하루에 AI가 만드는 개수(반 공유 최대치) — 학생은 이 중 몇 개(10/15/20) 할지 스스로 고름
const DAILY_GOALS = [10, 15, 20]; // 학생이 고를 수 있는 하루 목표
const DEFAULT_DAILY_GOAL = 20;
const APP_NAME = "매일 어휘";

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
      meaning,
      example: String(w.example || "").trim().slice(0, 200),
      synonym: String(w.synonym || "").trim().slice(0, 30),
      antonym: String(w.antonym || "").trim().slice(0, 30),
    });
    if (out.length >= max) break;
  }
  return out;
}

// ── 새 학생 데이터 ──
function newStudentData(nickname, dailyGoal) {
  return {
    nickname,
    dailyGoal: DAILY_GOALS.includes(dailyGoal) ? dailyGoal : DEFAULT_DAILY_GOAL, // 하루에 몇 개 할지(10/15/20)
    createdAt: kst().date,
    streak: 0,          // 연속 학습일
    lastDoneDay: "",    // 마지막으로 목표를 다 끝낸 날
    totalLearned: 0,    // 누적 학습 어휘 수
    days: {},           // { "2026-07-15": {sets:[..], quiz:{done,correct,total}, done} }
    wrong: [],          // 오답 노트 [{word,meaning,example,synonym,antonym,day,miss,hit}]
  };
}
// 오래된 날짜 기록 정리 (최근 60일만 보관)
function pruneStudent(data) {
  const days = Object.keys(data.days || {}).sort();
  while (days.length > 60) delete data.days[days.shift()];
  if (Array.isArray(data.wrong) && data.wrong.length > 300)
    data.wrong = data.wrong.slice(-300);
  return data;
}

// ── D1 접근 ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS vocab_days (day TEXT NOT NULL, section TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (day, section))").run();
  // v2: 출석번호 대신 기기별 고유 id 로 학생을 식별 (구버전 vocab_students 테이블은 더 이상 쓰지 않음)
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
  return row ? JSON.parse(row.data) : null;
}
async function putStudent(db, section, id, data) {
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

// ── AI 어휘 생성 (서버가 호출 — 학생이 직접 AI를 호출하지 않음) ──
// Worker 가 Google Gemini API 를 호출해 레벨에 맞는 오늘의 40개를 만들어 D1에 저장.
// 반 전체가 같은 세트를 쓰므로 하루에 레벨당 1번만 호출됩니다.
// flash-lite 계열: 빠르고 저렴하며 무료 한도가 넉넉해 매일 40개 생성에 적합.
// (flash 계열은 무료 요청 한도가 낮아 429 quota 오류가 잘 남)
// "-latest" 별칭이라 새 모델이 나와도 자동으로 최신 stable 로 갱신됨.
const GEMINI_MODEL = "gemini-flash-lite-latest";
const WORD_SCHEMA = {
  type: "OBJECT",
  properties: {
    words: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING", description: "표제어(단어)" },
          meaning: { type: "STRING", description: "학생 눈높이의 뜻풀이 한 문장" },
          example: { type: "STRING", description: "단어가 원형 그대로 들어간 예문 한 문장" },
          synonym: { type: "STRING", description: "유의어 1개, 없으면 빈 문자열" },
          antonym: { type: "STRING", description: "반의어 1개, 없으면 빈 문자열" },
        },
        required: ["word", "meaning", "example", "synonym", "antonym"],
      },
    },
  },
  required: ["words"],
};

async function generateWords(env, section, avoidWords, cf) {
  if (!env.GEMINI_API_KEY)
    return { error: "AI 키(GEMINI_API_KEY)가 아직 설정되지 않았어요. 선생님께 알려 주세요." };

  const lv = SECTIONS[section];
  const avoid = avoidWords.slice(0, 800).join(", ");
  const prompt =
    `대상: ${lv.name} 학생.\n어휘 기준: ${lv.desc}\n\n` +
    `위 기준에 맞는 한국어 학습 어휘를 정확히 ${WORDS_PER_DAY + 4}개 만들어 주세요.\n` +
    `규칙:\n` +
    `- word: 표제어. meaning: ${lv.name} 학생이 바로 이해할 뜻풀이 한 문장.\n` +
    `- example: 그 단어가 반드시 원형 그대로(형태를 바꾸지 말고) 한 번 들어간 자연스러운 예문 한 문장. (빈칸 문제로 쓰입니다)\n` +
    `- synonym / antonym: 각각 1개, 마땅한 것이 없으면 빈 문자열.\n` +
    `- 명사·개념어 위주로 하되 동사·형용사·관용 표현도 조금 섞고, 쉬운 것과 어려운 것을 골고루.\n` +
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
      res = await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: "당신은 한국 학교 어휘 교육 전문가입니다. 학년 수준에 딱 맞는 어휘 목록을 만듭니다." }] },
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
          }),
        }
      );
    } catch (e) {
      lastError = "AI 서버에 연결하지 못했어요.";
      continue;
    }
    try { body = await res.json(); } catch (e) { body = null; }
    if (res.ok && body) { lastError = null; break; }
    lastError = "AI 호출 실패 (" + res.status + "): " + (body && body.error && body.error.message ? body.error.message : "알 수 없는 오류");
    // 위치 제한처럼 colo 를 바꾸면 나아질 수 있는 오류만 재시도, 그 외(키 오류 등)는 바로 반환
    const retryable = res.status >= 500 || (body && body.error && /location/i.test(body.error.message || ""));
    if (!retryable) break;
  }
  if (lastError) {
    const loc = cf ? ` [colo:${cf.colo || "?"} country:${cf.country || "?"} gw:${useGateway ? "on" : "off"}]` : "";
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
  const avoidSet = new Set(avoidWords);
  const words = sanitizeWords((parsed.words || []).filter(w => w && !avoidSet.has(String(w.word || "").trim())), WORDS_PER_DAY);
  if (words.length < WORDS_PER_DAY - 4)
    return { error: "AI가 어휘를 충분히 만들지 못했어요(" + words.length + "개). 다시 시도해 주세요." };
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

  // ── 학생: 진행 상황 저장 ──
  if (path === "/api/student/save") {
    if (!validSection(d.section)) return fail("반 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const cur = await getStudent(db, d.section, id);
    if (!cur) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    if (!d.data || typeof d.data !== "object") return fail("저장할 내용이 없어요.");
    if (JSON.stringify(d.data).length > 300000) return fail("저장 내용이 너무 커요.");
    d.data.nickname = cur.nickname; // 별명은 /api/student/rename 을 통해서만 바뀜
    await putStudent(db, d.section, id, d.data);
    return ok({});
  }

  // ── 오늘(또는 이번 주 특정 날짜)의 어휘 (없으면 AI가 생성) ──
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
