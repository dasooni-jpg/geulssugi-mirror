/*
 * 학급은행 규칙 자동 점검 (적금 · 대출 · 기부 · 주식 소수점 결제)
 *   실행:  node bank-app/_test.mjs      ← bank-worker.js 를 그대로 불러와 검사합니다
 * 가짜 D1(메모리)에 붙여서 실제 API를 호출하므로, 배포 전에 한 번 돌려 보면 안심입니다.
 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../bank-worker.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;

// ── 아주 작은 가짜 D1 (bank_state 한 줄만 다룬다) ──
let row = null;
const DB = {
  prepare(sql) {
    const st = { sql, args: [] };
    st.bind = (...a) => { st.args = a; return st; };
    st.run = async () => {
      if (sql.startsWith("CREATE")) return {};
      if (sql.startsWith("INSERT")) { if (row) throw new Error("dup"); row = { version: 1, data: st.args[0] }; return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE")) {
        if (row && row.version === st.args[1]) { row = { version: row.version + 1, data: st.args[0] }; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      }
      return {};
    };
    st.first = async () => (row ? { version: row.version, data: row.data } : null);
    return st;
  },
};
const env = { DB };
const state = () => JSON.parse(row.data);
const setState = s => { row = { version: row.version, data: JSON.stringify(s) }; };

async function post(path, body) {
  const res = await worker.fetch(new Request("https://x" + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), env);
  return await res.json();
}
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}

const T = { auth: { id: "teacher", pw: "0000" } };
const S1 = { classCode: "6-1", number: 1, pin: "1111" };
const S2 = { classCode: "6-1", number: 2, pin: "2222" };

console.log("\n== 기본 준비 ==");
check("교사 로그인", (await post("/api/login", { role: "teacher", id: "teacher", pw: "0000" })).ok);
async function setCooldown(sec) {   // 다른 항목을 건드리지 않도록 현재 설정을 그대로 두고 한 값만 바꾼다
  const cur = (await post("/api/teacher/settings", { ...T })).settings;
  return await post("/api/teacher/settings/save", { ...T, settings: { ...cur, teacherPw: "", tradeCooldown: sec } });
}
await setCooldown(0);   // 기능 점검 동안에는 연타 제한 없이 진행
await post("/api/teacher/students/save", { ...T, students: [
  { number: 1, nickname: "가", pin: "1111", jobId: 1, group: 1, active: true },
  { number: 2, nickname: "나", pin: "2222", jobId: 2, group: 1, active: true },
]});
check("학생 로그인", (await post("/api/login", { role: "student", ...S1 })).ok);
await post("/api/teacher/adjust", { ...T, studentIds: state().students.map(s => s.id), amount: 1000, memo: "시작 자금" });
let home = await post("/api/student/home", { auth: S1 });
check("잔액 1000", home.balance === 1000, home.balance);
check("은행 탭 켜짐", home.bank.enabled === true);

console.log("\n== 주식: 3.66짜리는 3.66만 결제 ==");
await post("/api/teacher/stocks/save", { ...T, stock: { name: "카카오", price: 3.66 } });
const sid = state().stocks.find(x => x.name === "카카오").id;
let r = await post("/api/student/stock/buy", { auth: S1, stockId: sid, qty: 1 });
home = await post("/api/student/home", { auth: S1 });
check("1주 매수 후 잔액 996.34 (예전엔 996)", home.balance === 996.34, home.balance);
r = await post("/api/student/stock/buy", { auth: S1, stockId: sid, qty: 3 });
home = await post("/api/student/home", { auth: S1 });
check("3주 더 매수 → 985.36", home.balance === 985.36, home.balance);
check("보유 주식 평가액 14.64", home.myStocks[0].value === 14.64, home.myStocks[0]);
r = await post("/api/student/stock/sell", { auth: S1, stockId: sid, qty: 4 });
home = await post("/api/student/home", { auth: S1 });
check("4주 매도 → 다시 1000", home.balance === 1000, home.balance);

console.log("\n== 적금 ==");
check("250 초과 예치 거부", !(await post("/api/student/bank/deposit", { auth: S1, amount: 251 })).ok);
check("250 예치 성공", (await post("/api/student/bank/deposit", { auth: S1, amount: 250 })).ok);
check("추가 예치 거부(한도 소진)", !(await post("/api/student/bank/deposit", { auth: S1, amount: 1 })).ok);
home = await post("/api/student/home", { auth: S1 });
check("예치 후 현금 750", home.balance === 750, home.balance);
check("재산 합계 1000 유지", home.bank.assets.total === 1000, home.bank.assets);
const depId = home.bank.savings.deposits[0].id;
check("10일 잠금 표시", home.bank.savings.deposits[0].locked === true && home.bank.savings.deposits[0].daysLeft === 10, home.bank.savings.deposits[0]);
check("잠금 중 일반 해지 거부", !(await post("/api/student/bank/withdraw", { auth: S1, depositId: depId })).ok);
// 8일 전에 넣은 것으로 되돌려 본다 → 이자 1회(5%)는 붙었지만 아직 잠금(10일) 중
let s = state(); s.deposits[0].createdAt = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 19).replace("T", " "); setState(s);
home = await post("/api/student/home", { auth: S1 });
check("8일차 평가액 262.5 (복리 1회)", home.bank.savings.deposits[0].value === 262.5, home.bank.savings.deposits[0]);
r = await post("/api/student/bank/withdraw", { auth: S1, depositId: depId, early: true });
check("부득이한 해약 → 원금 250만", r.ok && r.received === 250 && r.interest === 0, r);
// 다시 넣고 15일 지난 상태로
await post("/api/student/bank/deposit", { auth: S1, amount: 250 });
s = state(); const d2 = s.deposits.find(x => x.status === "예치중");
d2.createdAt = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 19).replace("T", " "); setState(s);
home = await post("/api/student/home", { auth: S1 });
check("15일차 평가액 275.63 (복리 2회)", home.bank.savings.deposits[0].value === 275.63, home.bank.savings.deposits[0].value);
r = await post("/api/student/bank/withdraw", { auth: S1, depositId: d2.id });
check("만기 해지 → 원금+이자 275.63", r.ok && r.received === 275.63 && r.interest === 25.63, r);

console.log("\n== 대출 ==");
home = await post("/api/student/home", { auth: S1 });
check("한도 = 주급 40 × 2 = 80", home.bank.loan.limit === 80 && home.bank.loan.weeklyPay === 40, home.bank.loan);
check("한도 초과 대출 거부", !(await post("/api/student/bank/loan", { auth: S1, amount: 81 })).ok);
check("80 대출 성공", (await post("/api/student/bank/loan", { auth: S1, amount: 80 })).ok);
check("연속 대출 거부", !(await post("/api/student/bank/loan", { auth: S1, amount: 10 })).ok);
let before = (await post("/api/student/home", { auth: S1 })).balance;
// 일주일이 지난 것으로 되돌린다 → 접속하면 이자 4(=80의 5%)가 자동 차감
s = state(); const loan = s.loans.find(l => l.status === "상환중");
loan.lastInterestAt = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace("T", " "); setState(s);
home = await post("/api/student/home", { auth: S1 });
check("일주일 뒤 이자 4 자동 차감", home.balance === before - 4, { before, after: home.balance });
check("낸 이자 4로 기록", home.bank.loan.current.interestPaid === 4, home.bank.loan.current);
check("초과 상환 거부", !(await post("/api/student/bank/repay", { auth: S1, amount: 81 })).ok);
r = await post("/api/student/bank/repay", { auth: S1, amount: 30 });
check("30 상환 → 남은 원금 50", r.ok && r.principal === 50, r);
r = await post("/api/student/bank/repay", { auth: S1, amount: 50 });
check("완납 처리", r.ok && r.cleared === true, r);
check("완납 후 재대출 가능", (await post("/api/student/bank/loan", { auth: S1, amount: 10 })).ok);

console.log("\n== 기부 ==");
home = await post("/api/student/home", { auth: S1 });
check("목표 150", home.bank.donation.threshold === 150);
r = await post("/api/student/bank/donate", { auth: S1, amount: 100 });
check("100 기부 (아직 나눔 없음)", r.ok && r.granted === false && r.pool === 100, r);
const a1 = state().students.map(x => ({ n: x.number, t: 0 }));
r = await post("/api/student/bank/donate", { auth: S1, amount: 50.5 });
check("150 넘으면 즉시 나눔 실행", r.ok && r.granted === true && r.grantAmount === 150.5, r);
const bank = await post("/api/teacher/bank", { ...T });
check("가장 재산이 적은 학생이 받음", bank.grants[0].number === bank.assets[bank.assets.length - 1].number || bank.grants.length === 1, { grant: bank.grants[0], poorest: bank.assets[bank.assets.length - 1] });
check("기부 후 모인 금액 0", bank.totals.donationPool === 0, bank.totals);
check("교사 은행 화면 정상", bank.ok && Array.isArray(bank.deposits) && Array.isArray(bank.loans) && Array.isArray(bank.assets));

console.log("\n== 연타 방지 (느린 인터넷에서 중복 주문 막기) ==");
await setCooldown(3);
const wait3 = () => new Promise(r => setTimeout(r, 3100));   // 앞 검사에서 방금 거래했으므로 제한이 풀릴 때까지 기다린다
const sid2 = state().stocks.find(x => x.name === "카카오").id;
await wait3();
r = await post("/api/student/stock/buy", { auth: S1, stockId: sid2, qty: 1 });
check("첫 매수는 성공", r.ok, r);
r = await post("/api/student/stock/buy", { auth: S1, stockId: sid2, qty: 1 });
check("바로 이어서 누르면 거절", !r.ok && r.error.includes("너무 빨라요"), r);
r = await post("/api/student/stock/sell", { auth: S1, stockId: sid2, qty: 1 });
check("바로 파는 것도 거절", !r.ok, r);
// 인터넷이 느려 [사기]를 8번 연타한 상황 (요청 8개가 동시에 도착)
const before2 = (await post("/api/student/home", { auth: S1 })).balance;
const many = await Promise.all(Array.from({ length: 8 }, () => post("/api/student/stock/buy", { auth: S2, stockId: sid2, qty: 1 })));
const okCount = many.filter(x => x.ok).length;
check("동시에 8번 눌러도 1건만 체결", okCount === 1, many.map(x => x.ok ? "성공" : x.error));
const s2home = await post("/api/student/home", { auth: S2 });
check("체결된 만큼만 돈이 빠짐", s2home.myStocks.reduce((a, m) => a + m.qty, 0) === 1, s2home.myStocks);
await wait3();
r = await post("/api/student/bank/donate", { auth: S1, amount: 1 });
check("은행 거래도 연타 제한 적용", r.ok, r);
r = await post("/api/student/bank/donate", { auth: S1, amount: 1 });
check("연달아 기부하면 거절", !r.ok && r.error.includes("너무 빨라요"), r);
await setCooldown(0);

console.log("\n== 세금은 은행 거래에 붙지 않는다 ==");
s = state();
const types = new Set(s.transactions.map(t => t.type));
check("거래 유형 기록", ["적금", "적금해지", "대출", "대출상환", "대출이자", "기부", "기부금"].every(t => types.has(t)), [...types]);

console.log(`\n결과: ${pass} 통과 / ${fail} 실패\n`);
process.exit(fail ? 1 : 0);
