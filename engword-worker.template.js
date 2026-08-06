/*
 * 매일 영단어 — 온라인 서버 (Cloudflare Worker + D1 + Google Gemini AI)
 * ──────────────────────────────────────────────────────────
 * 초등 1~6학년 · 중등 · 고등 학생이 매일 영단어를 공부하는 앱입니다.
 * 매일 레벨당 20개를 AI(Gemini)가 자동으로 만들어 D1에 저장하고
 * 반 전체가 같은 단어를 공유합니다. 학생은 그중 하루에 몇 개(10/15/20)
 * 할지 스스로 고를 수 있습니다.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-engword-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(engword-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Storage & Databases → D1 → Create Database (이름 예: engword-30)
 *  2. Workers & Pages → Create → Worker 생성 (이름 예: engword-30)
 *  3. 이 파일(engword-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  4. Worker → Settings → Bindings → Add → D1 Database
 *     - Variable name: DB  (반드시 이 이름 그대로!)
 *     - D1 database: 위에서 만든 engword-30 선택
 *  5. Worker → Settings → Variables and Secrets → Add
 *     - Type: Secret / Name: GEMINI_API_KEY / Value: (Google AI Studio에서 발급받은 Gemini API 키)
 *     ※ 키가 없으면 학생이 오늘의 영단어를 받을 수 없어요.
 *  6. (AI 생성 시 "User location is not supported" 오류가 나면) AI Gateway 경유 설정:
 *     - AI → AI Gateway → Create Gateway (이름 예: engword-30)
 *     - Worker → Settings → Variables 에 아래 둘 추가 (Text 로):
 *         CF_AIG_ACCOUNT_ID = (대시보드 우측의 Account ID)
 *         CF_AIG_GATEWAY    = (위에서 만든 Gateway 이름)
 *     ※ 한국 일부 통신망이 홍콩 데이터센터로 라우팅될 때 Gemini 가 막는 문제를 우회합니다.
 *  7. 배포 주소를 학생 태블릿 홈 화면에 추가하면 끝!
 *
 * 학생은 회원가입 없이 [반 선택 → 별명] 만으로 시작합니다. (개인정보 제로)
 * 이후엔 그 기기에서 별명 입력 없이 자동으로 이어서 학습하며, 별명은 "나의 기록" 화면에서 바꿀 수 있습니다.
 */

const APP_HTML = __APP_HTML__;

// ── 레벨(섹션) 정의 — 영단어 난이도 기준 ──
const SECTIONS = {
  g1: {
    name: "1학년",
    desc: "초등학교 1학년 수준의 아주 쉬운 생활 영단어. 알파벳과 함께 배우는 색깔, 숫자(1~10), 동물, 가족 호칭, 인사말처럼 그림으로 바로 떠올릴 수 있는 단어 위주. 철자 3~5자의 짧고 발음하기 쉬운 단어만 쓴다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 2학년 수준의 살짝 어려운 단어를 섞는다.",
  },
  g2: {
    name: "2학년",
    desc: "초등학교 2학년 수준의 쉬운 생활 영단어. 1학년보다 조금 넓혀 학용품, 음식, 몸의 부분, 요일, 기본 동작 동사(가다·먹다·보다 등)를 포함한다. 여전히 짧고 쉬운 단어 위주. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 3학년 수준의 단어를 섞는다.",
  },
  g3: {
    name: "3학년",
    desc: "초등학교 3학년 정규 영어 교과가 시작되는 수준. 인사·자기소개·교실 표현에 나오는 기본 명사·동사·형용사, 3~6자의 쉬운 단어 위주. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 4학년 수준의 단어를 섞는다.",
  },
  g4: {
    name: "4학년",
    desc: "초등학교 4학년 교과서 수준. 취미, 날씨, 시간, 장소를 나타내는 어휘와 기본 형용사·부사를 포함해 3학년보다 폭을 넓힌다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 5학년 수준의 단어를 섞는다.",
  },
  g5: {
    name: "5학년",
    desc: "초등학교 5학년 교과서 수준. 계획·경험·감정을 표현하는 데 쓰이는 동사·형용사와 조금 더 추상적인 생활 어휘를 포함한다. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 6학년 수준의 단어를 섞는다.",
  },
  g6: {
    name: "6학년",
    desc: "초등학교 6학년이 배우는 기초 영단어. 교육부 권장 초등 필수 영단어 위주, 실생활에서 자주 쓰는 쉬운 명사·동사·형용사 중심(가족, 학교, 음식, 취미, 감정, 날씨 등). 철자와 발음이 어렵지 않은 단어. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 한 단계 위인 중학교 초반 수준의 약간 어려운 단어를 섞어 도전 의식을 준다.",
  },
  middle: {
    name: "중등",
    desc: "중학교 교과서와 내신·모의고사에 자주 나오는 영단어. 중학 필수 영단어 위주, 교과서 지문에 반복적으로 등장하는 단어와 기본적인 숙어 표현 포함. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 초등 고학년 복습 수준의 쉬운 단어와 고등학교 입문 수준의 어려운 단어를 함께 섞어 난이도 폭을 넓힌다.",
  },
  high: {
    name: "고등",
    desc: "고등학교 교과서와 수능·모의고사 영어 지문에 자주 나오는 영단어. 수능 필수 영단어 위주, 추상적 개념어와 시사·학술 어휘 포함. 대부분(80% 정도)은 이 수준으로 하되, 나머지 20% 정도는 중학교 심화 수준의 비교적 쉬운 단어를 섞어 난이도 폭을 넓힌다.",
  },
};
const WORDS_PER_DAY = 20; // 하루에 AI가 만드는 개수(반 공유 최대치) — 학생은 이 중 몇 개(10/15/20) 할지 스스로 고름
const DAILY_GOALS = [10, 15, 20]; // 학생이 고를 수 있는 하루 목표
const DEFAULT_DAILY_GOAL = 20;
const APP_NAME = "매일 영단어";

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
      pronunciation: String(w.pronunciation || "").trim().slice(0, 60),
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
    totalLearned: 0,    // 누적 학습 단어 수
    days: {},           // { "2026-07-15": {sets:[..], quiz:{done,correct,total}, done} }
    wrong: [],          // 오답 노트 [{word,pronunciation,meaning,example,synonym,antonym,day,miss,hit}]
    friends: [],        // 함께 공부하는 친구 [{section, id}]
    cheers: [],         // 친구에게 받은 응원 [{fromId, fromNick, day}]
    messages: [],       // 친구에게 받은 쪽지 [{id, fromSection, fromId, fromNick, text, day}]
  };
}
// 오래된 날짜 기록 정리 (최근 60일만 보관)
function pruneStudent(data) {
  const days = Object.keys(data.days || {}).sort();
  while (days.length > 60) delete data.days[days.shift()];
  if (Array.isArray(data.wrong) && data.wrong.length > 300)
    data.wrong = data.wrong.slice(-300);
  if (Array.isArray(data.cheers) && data.cheers.length > MAX_CHEERS)
    data.cheers = data.cheers.slice(-MAX_CHEERS);
  if (Array.isArray(data.messages) && data.messages.length > MAX_MESSAGES)
    data.messages = data.messages.slice(-MAX_MESSAGES);
  return data;
}

// ── 친구 ──
const MAX_FRIENDS = 30;
const MAX_CHEERS = 100;
const MAX_MESSAGES = 50;      // 쪽지함에 보관하는 최대 개수(꽉 차면 오래된 것부터 지움)
const MSG_MAX_LEN = 60;       // 쪽지 한 통 최대 글자 수
const MSG_DAILY_LIMIT = 5;    // 같은 친구에게 하루에 보낼 수 있는 쪽지 수(도배 방지)
function cleanMessageText(t) { return String(t || "").trim().slice(0, MSG_MAX_LEN); }
function genId() {
  try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
}
// 그 날 얼마나 공부했는지 요약 (친구 목록에 보여 줄 값만 추림 — 남의 오답/단어는 보이지 않는다)
function dayStatus(data, day) {
  const t = ((data && data.days) || {})[day] || {};
  const sets = Array.isArray(t.sets) ? t.sets : [];
  return {
    done: !!t.done,
    setsDone: sets.filter(Boolean).length,
    setsTotal: sets.length,
    quizDone: !!(t.quiz && t.quiz.done),
  };
}
function sameStudent(a, b) { return a.section === b.section && a.id === b.id; }

// ── D1 접근 ──
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS vocab_days (day TEXT NOT NULL, section TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (day, section))").run();
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

// ── AI 영단어 생성 (서버가 호출 — 학생이 직접 AI를 호출하지 않음) ──
// Worker 가 Google Gemini API 를 호출해 레벨에 맞는 오늘의 30개를 만들어 D1에 저장.
// 반 전체가 같은 세트를 쓰므로 하루에 레벨당 1번만 호출됩니다.
// flash-lite 계열: 빠르고 저렴하며 무료 한도가 넉넉해 매일 30개 생성에 적합.
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
          word: { type: "STRING", description: "영단어 원형(기본형)" },
          pronunciation: { type: "STRING", description: "국제음성기호(IPA) 발음. 대괄호 없이 기호만. 예: bəˈnænə" },
          meaning: { type: "STRING", description: "학생 눈높이의 한글 뜻풀이(간결하게)" },
          example: { type: "STRING", description: "단어가 원형 그대로 들어간 자연스러운 영어 예문 한 문장" },
          synonym: { type: "STRING", description: "영어 유의어 1개, 없으면 빈 문자열" },
          antonym: { type: "STRING", description: "영어 반의어 1개, 없으면 빈 문자열" },
        },
        required: ["word", "pronunciation", "meaning", "example", "synonym", "antonym"],
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
    `대상: ${lv.name} 학생 (한국 학생이 배우는 영어 어휘).\n난이도 기준: ${lv.desc}\n\n` +
    `위 기준에 맞는 영단어를 정확히 ${WORDS_PER_DAY + 4}개 만들어 주세요.\n` +
    `규칙:\n` +
    `- word: 영단어 원형(기본형). 굴절되지 않은 사전 표제어 형태로.\n` +
    `- pronunciation: 국제음성기호(IPA)로 읽는 법. 대괄호나 슬래시 없이 기호만.\n` +
    `- meaning: ${lv.name} 학생이 바로 이해할 한글 뜻(품사 표시 없이 간결하게).\n` +
    `- example: 그 단어가 반드시 원형 그대로(형태를 바꾸지 말고) 한 번 들어간 자연스러운 영어 예문 한 문장. (빈칸 문제로 쓰입니다)\n` +
    `- synonym / antonym: 각각 영단어 1개, 마땅한 것이 없으면 빈 문자열.\n` +
    `- 명사·동사·형용사를 골고루 섞고, 쉬운 것과 어려운 것을 골고루.\n` +
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
            system_instruction: { parts: [{ text: "당신은 한국 학생을 위한 영어 어휘 교육 전문가입니다. 학년 수준에 딱 맞는 영단어 목록을 만듭니다." }] },
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
    return { error: "AI가 단어를 충분히 만들지 못했어요(" + words.length + "개). 다시 시도해 주세요." };
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
    // 아래 값들은 서버가 주인이다. 특히 friends/cheers/messages 는 '친구가' 바꾸는 값이라
    // 학생 기기가 들고 있던 옛 사본으로 덮어쓰면 받은 응원·쪽지가 사라진다.
    d.data.nickname = cur.nickname; // 별명은 /api/student/rename 을 통해서만 바뀜
    d.data.code = cur.code;
    d.data.friends = Array.isArray(cur.friends) ? cur.friends : [];
    d.data.cheers = Array.isArray(cur.cheers) ? cur.cheers : [];
    d.data.messages = Array.isArray(cur.messages) ? cur.messages : [];
    await putStudent(db, d.section, id, d.data);
    return ok({});
  }

  // ── 친구: 코드로 친구 맺기 (서로 친구가 된다) ──
  if (path === "/api/friend/add") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    const found = await lookupByCode(db, d.code);
    if (!found) return fail("코드를 찾을 수 없어요. 친구에게 코드를 다시 물어보세요.");
    const meRef = { section: d.section, id };
    const friendRef = { section: found.section, id: found.id };
    if (sameStudent(meRef, friendRef)) return fail("내 코드예요. 친구의 코드를 넣어 주세요.");
    me.friends = Array.isArray(me.friends) ? me.friends : [];
    if (me.friends.some(f => sameStudent(f, friendRef)))
      return fail("'" + found.data.nickname + "' 님과는 이미 친구예요.");
    if (me.friends.length >= MAX_FRIENDS) return fail("친구는 " + MAX_FRIENDS + "명까지 추가할 수 있어요.");

    const you = found.data;
    you.friends = Array.isArray(you.friends) ? you.friends : [];
    me.friends.push(friendRef);
    if (!you.friends.some(f => sameStudent(f, meRef)) && you.friends.length < MAX_FRIENDS)
      you.friends.push(meRef); // 서로 친구로 (친구도 나를 응원할 수 있게)
    await putStudent(db, d.section, id, me);
    await putStudent(db, found.section, found.id, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 목록 + 오늘 공부했는지 ──
  if (path === "/api/friend/list") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요. 처음 화면에서 다시 시작해 주세요.");
    const day = kst().date;
    const list = [];
    for (const f of (me.friends || [])) {
      const data = await getStudent(db, f.section, f.id);
      if (!data) continue; // 기록이 지워진 친구는 건너뜀
      const st = dayStatus(data, day);
      list.push({
        section: f.section, id: f.id,
        nickname: data.nickname,
        sectionName: (SECTIONS[f.section] || {}).name || f.section,
        streak: data.streak | 0,
        todayDone: st.done, todaySets: st.setsDone, todaySetsTotal: st.setsTotal, todayQuiz: st.quizDone,
        // 오늘 내가 이미 응원했는지 (하루에 한 번만 보낼 수 있음)
        cheeredByMe: (data.cheers || []).some(c => c.fromId === id && c.day === day),
      });
    }
    list.sort((a, b) => (b.todayDone - a.todayDone) || a.nickname.localeCompare(b.nickname, "ko"));
    // 내가 오늘 받은 응원
    const myCheers = (me.cheers || []).filter(c => c.day === day);
    // 내 쪽지함 (최신 순)
    const messages = (me.messages || []).slice().reverse();
    return ok({ day, friends: list, myCode: me.code || "", cheersToday: myCheers, messages });
  }

  // ── 친구: 쪽지 보내기 ──
  if (path === "/api/friend/message/send") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("쪽지 받을 친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    if (!(me.friends || []).some(f => sameStudent(f, friendRef)))
      return fail("친구 목록에 없는 친구예요.");
    const text = cleanMessageText(d.text);
    if (!text) return fail("쪽지 내용을 입력해 주세요.");
    const you = await getStudent(db, d.toSection, toId);
    if (!you) return fail("친구의 기록을 찾을 수 없어요.");
    const day = kst().date;
    you.messages = Array.isArray(you.messages) ? you.messages : [];
    const todayCount = you.messages.filter(m => m.fromId === id && m.day === day).length;
    if (todayCount >= MSG_DAILY_LIMIT) return fail("오늘은 이 친구에게 쪽지를 충분히 보냈어요. 내일 또 보내 주세요!");
    you.messages.push({ id: genId(), fromSection: d.section, fromId: id, fromNick: me.nickname, text, day });
    await putStudent(db, d.toSection, toId, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 받은 쪽지 지우기 ──
  if (path === "/api/friend/message/delete") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const msgId = String(d.messageId || "");
    if (!msgId) return fail("지울 쪽지 정보가 없어요.");
    me.messages = (me.messages || []).filter(m => m.id !== msgId);
    await putStudent(db, d.section, id, me);
    return ok({});
  }

  // ── 친구: 응원 보내기 (하루 한 번) ──
  if (path === "/api/friend/cheer") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("응원할 친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    if (!(me.friends || []).some(f => sameStudent(f, friendRef)))
      return fail("친구 목록에 없는 친구예요.");
    const you = await getStudent(db, d.toSection, toId);
    if (!you) return fail("친구의 기록을 찾을 수 없어요.");
    const day = kst().date;
    you.cheers = Array.isArray(you.cheers) ? you.cheers : [];
    if (you.cheers.some(c => c.fromId === id && c.day === day))
      return fail("오늘은 이미 응원했어요. 내일 또 보내 주세요!");
    you.cheers.push({ fromId: id, fromNick: me.nickname, day });
    await putStudent(db, d.toSection, toId, you);
    return ok({ nickname: you.nickname });
  }

  // ── 친구: 삭제 (양쪽에서 지운다) ──
  if (path === "/api/friend/remove") {
    if (!validSection(d.section)) return fail("반(레벨) 정보가 없어요.");
    const id = validId(d.id);
    if (!id) return fail("기기 정보가 없어요.");
    const me = await getStudent(db, d.section, id);
    if (!me) return fail("등록되지 않은 학생이에요.");
    const toId = validId(d.toId);
    if (!validSection(d.toSection) || !toId) return fail("친구 정보가 없어요.");
    const friendRef = { section: d.toSection, id: toId };
    const meRef = { section: d.section, id };
    me.friends = (me.friends || []).filter(f => !sameStudent(f, friendRef));
    await putStudent(db, d.section, id, me);
    const you = await getStudent(db, d.toSection, toId);
    if (you) {
      you.friends = (you.friends || []).filter(f => !sameStudent(f, meRef));
      await putStudent(db, d.toSection, toId, you);
    }
    return ok({});
  }

  // ── 오늘(또는 이번 주 특정 날짜)의 영단어 (없으면 AI가 생성) ──
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
