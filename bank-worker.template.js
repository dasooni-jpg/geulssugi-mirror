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

const STUDENT_HTML = __STUDENT_HTML__;
const TEACHER_HTML = __TEACHER_HTML__;
// 다람쌤 마스코트 (build 스크립트가 bank-app/mascot.png 를 base64 로 넣어 줌)
const MASCOT_PNG_B64 = "__MASCOT_B64__";

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
