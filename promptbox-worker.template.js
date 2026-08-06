/*
 * 선생님 도구상자 — 온라인 서버 (Cloudflare Worker + Google Gemini AI)
 * ──────────────────────────────────────────────────────────
 * 초등 교사의 반복 업무(평가문장·행특·창체·문장교정·활동지·안내문·순화·
 * 사실기록지·지도안·개발명세서) 10가지를 메뉴에서 골라 입력칸만 채우면
 * AI(Gemini)가 결과를 만들어 주는 도구 모음입니다.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-promptbox.ps1 이 만든 자동 생성본입니다.
 *    화면(promptbox-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *    (promptbox-worker.js 를 직접 고치지 마세요.)
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Workers & Pages → Create → Worker 생성 (이름 예: promptbox)
 *  2. 이 파일(promptbox-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. Worker → Settings → Variables and Secrets → Add
 *     - Type: Secret / Name: GEMINI_API_KEY / Value: (Google AI Studio에서 발급받은 Gemini API 키)
 *     ※ 키가 없으면 결과를 만들 수 없어요.
 *  4. (AI 생성 시 "User location is not supported" 오류가 나면) AI Gateway 경유 설정:
 *     - AI → AI Gateway → Create Gateway (이름 예: promptbox)
 *     - Worker → Settings → Variables 에 아래 둘 추가 (Text 로):
 *         CF_AIG_ACCOUNT_ID = (대시보드 우측의 Account ID)
 *         CF_AIG_GATEWAY    = (위에서 만든 Gateway 이름)
 *     ※ 한국 일부 통신망이 홍콩 데이터센터로 라우팅될 때 Gemini 가 막는 문제를 우회합니다.
 *
 * 이 앱은 저장하는 데이터가 없습니다(D1 불필요). 입력→생성→복사만 합니다.
 * 학생 개인정보는 다루지 않으며, 교사가 직접 쓰는 도구입니다.
 */

const APP_HTML = __APP_HTML__;
const APP_NAME = "선생님 도구상자";
// 다람쌤 마스코트 (build 스크립트가 promptbox-app/mascot.png 를 base64 로 넣어 줌)
const MASCOT_PNG_B64 = "__MASCOT_B64__";

// ── 모델 ──
// flash-lite 계열: 무료 요청 한도가 넉넉해 429 quota 오류가 잘 나지 않습니다.
// (flash 계열은 무료 분당 한도가 낮아 여러 명이 동시에 쓰면 429 가 자주 났음 → lite 로 전환)
// 품질을 다시 높이고 싶고 429 가 안 나면 "gemini-flash-latest" 로 되돌려도 됩니다.
// "-latest" 별칭이라 새 모델이 나와도 자동으로 최신 stable 로 갱신됩니다.
const GEMINI_MODEL = "gemini-flash-lite-latest";

// ── 도구 10종 정의 ──
// 각 도구: id/num/name/desc/usage/trigger/fields(입력칸) + system(역할·규칙·형식) + user(입력값 조립)
// system 프롬프트는 사용자의 원본 지시문을 그대로 사용합니다.
const TOOLS = [
  {
    id: "eval", num: 1,
    name: "성취기준 → 평가문장 배치 생성기",
    desc: "성취기준 하나로 평가문장 뱅크를 한 번에 만들어요.",
    usage: "성취기준 원문과 개수만 채워 생성.",
    trigger: "학기말 종합의견·세특·평가문장 뱅크가 필요할 때. 성취기준 하나당 한 번.",
    fields: [
      { key: "standard", label: "성취기준 원문", type: "textarea", required: true, placeholder: "예) [6국01-04] 자료를 정리하여 말할 내용을 체계적으로 구성한다." },
      { key: "count", label: "개수", type: "number", default: "24", placeholder: "기본 24" },
      { key: "level", label: "수준 (선택)", type: "text", placeholder: "상/중/하 구분이 필요하면 기재. 비우면 상 수준 단일" },
    ],
    user(v) {
      return `- 성취기준: ${v.standard}\n- 개수: ${v.count || 24}\n- 수준: ${v.level || "구분 없음 (상 수준 단일로 생성)"}`;
    },
    system: `# 역할
너는 대한민국 초등학교 학교생활기록부 평가문장 생성 도구다. 아래 성취기준에 대한 평가문장을 추가 질문 없이 즉시 생성한다.

# 입력
- 성취기준: [성취기준 원문]
- 개수: [숫자. 기본 24]
- 수준: [상/중/하 구분이 필요하면 기재. 없으면 '상' 수준 단일로 생성]

# 출력 규칙
1. 번호를 붙여 정확히 위 개수만큼 생성한다. 중간에 멈추거나 '이하 생략'하지 않는다.
2. 어미는 '~함.', '~음.', '~임.', '~됨.'으로 끝낸다. 능력의 전이를 강조할 때만 '~할 수 있음.'을 쓰되 전체의 20%를 넘기지 않는다. '~합니다', '~한다', '~했다'는 금지한다.
3. 한 문장에는 내용 요소(활동, 태도, 결과)를 2개까지만 담는다. 3개 이상이 되면 내용을 줄인다.
4. 초등학생과 학부모가 바로 이해하는 쉬운 어휘를 쓴다. 예: 인지함→알고 있음, 역지사지→상대방의 입장에서 생각함, 함양함→기름, 도출함→이끌어 냄.
5. 문장의 첫 어절이 3회 이상 반복되지 않게 한다. 마지막 서술어(예: 정리함, 발표함)는 바로 앞 문장과 겹치지 않게 한다.
6. 문장마다 관찰 장면(발표, 토의, 글쓰기, 학습지 정리, 모둠활동, 작품 제작, 질문하기 등)을 다르게 설정해 서로 변별되게 한다.
7. 성취기준의 지식·기능·태도 요소가 전체 문장에 고루 나타나게 한다.

# 하지 말 것
- 학생 이름, 성별 표현, 역할 직함(반장, 모둠장 등) 금지
- 과장 미사여구(탁월한, 경이로운, 눈부신 등) 금지
- 성취기준 원문을 그대로 복사해 어미만 바꾼 문장 금지. 어휘의 절반 이상을 바꿔 쓴다.

# 출력 형식
1. (문장)
2. (문장)
(끝까지 번호로 이어감)
— 총 [개수]개 생성 완료
(마지막 줄은 반드시 위 문구로 마친다. 실제 개수와 다르면 부족한 문장을 추가한 뒤 이 줄을 다시 쓴다.)`,
  },

  {
    id: "haengteuk", num: 2,
    name: "행특(행동특성 및 종합의견) 생성기",
    desc: "학생 특성 키워드만 넣으면 행특 문장으로 바꿔 줘요.",
    usage: "키워드만 입력. 여러 학생은 \"학생1: 키워드 / 학생2: 키워드\" 형태로 한 번에.",
    trigger: "학기말·학년말 행특 시즌. 학생 특성 키워드가 메모돼 있을 때.",
    fields: [
      { key: "keywords", label: "학생 특성 키워드", type: "textarea", required: true, placeholder: "예) 학생1: 발표를 잘함, 친구를 잘 도움 / 학생2: 산만함, 호기심 많음" },
    ],
    user(v) { return `${v.keywords}`; },
    system: `# 역할
너는 대한민국 초등학교 교사의 학교생활기록부 '행동특성 및 종합의견' 작성을 돕는 전문 보조 도구다. 학생 특성 키워드를 입력받으면 추가 질문 없이 즉시 문장을 생성한다.

# 입력
[학생1: 키워드, 키워드 / 학생2: 키워드, 키워드 ...]

# 출력 규칙
1. 한 학생당 3~4문장으로 구성한다. 절대 5문장을 넘기지 않는다.
2. 모든 문장은 '~함.', '~음.', '~임.', '~됨.'으로 끝낸다. '~합니다', '~한다', '~했다'는 금지한다.
3. 학부모와 학생이 읽었을 때 쉽게 이해되는 일상적 어휘를 쓴다. 한자어·추상어(이타심 발현, 역지사지 등)는 풀어서 쓴다.
4. '관찰된 특성 → 구체적 행동이나 상황 → 결과 또는 주변에 미친 영향 → 성장 가능성'의 흐름으로 쓴다. 형용사 나열을 피한다.
5. 부정적 키워드(산만함, 고집이 셈, 느림 등)는 거부하지 말고 긍정적·발전적 표현으로 순화해 쓴다.
   - 산만함 → 호기심이 많고 다양한 활동에 관심을 보임
   - 고집이 셈 → 자신의 생각이 분명하고 소신이 있음
   - 느림 → 신중하고 차분하게 과제를 끝까지 해냄
   - 내성적임 → 차분하고 사려 깊으며 깊이 생각함
   - 말이 많음 → 표현력이 풍부하고 생각을 적극적으로 나눔
6. 마지막 문장이 항상 '~기대됨.'으로 끝나지 않게 한다. 발전 전망형(~기대됨, ~성장할 것으로 보임), 현재 사실형(~태도가 돋보임, ~모습이 바람직함), 영향형(~학급의 좋은 본보기가 됨)을 섞는다. 여러 학생을 쓸 때 학생 간 마무리 어미가 겹치지 않게 한다.
7. 같은 단어를 반복하지 않고 문장마다 다른 어휘로 변주한다.

# 하지 말 것
- 학생 실명, 특정 사건 고유명, 질병·가정사 등 민감 정보 금지
- 성별 표현, 역할 직함 금지
- 과장된 미사여구 금지

# 출력 형식
학생1
(3~4문장)

학생2
(3~4문장)`,
  },

  {
    id: "changche", num: 3,
    name: "창체 자율활동 특기사항 생성기",
    desc: "활동 사실과 관찰 키워드로 특기사항 문장을 만들어요.",
    usage: "활동 사실과 관찰 키워드를 채워 생성. 글자 수 제한이 있으면 기재.",
    trigger: "창의적 체험활동(자율·동아리·봉사·진로) 특기사항 입력 시즌.",
    fields: [
      { key: "activity", label: "활동명과 내용", type: "textarea", required: true, placeholder: "예) 학급 다모임(4.10.) - 학급 규칙 정하기 토의" },
      { key: "keywords", label: "학생 관찰 키워드", type: "textarea", required: true, placeholder: "예) 의견을 논리적으로 말함, 친구 의견 경청" },
      { key: "limit", label: "문장 수 / 글자 수 제한 (선택)", type: "text", placeholder: "예) 2~3문장 / 공백 포함 200자 이내. 비우면 2~3문장" },
    ],
    user(v) {
      return `- 활동명과 내용: ${v.activity}\n- 학생 관찰 키워드: ${v.keywords}\n- 문장 수 또는 글자 수 제한: ${v.limit || "2~3문장"}`;
    },
    system: `# 역할
너는 대한민국 초등학교 학교생활기록부 '창의적 체험활동 특기사항' 작성 도구다. 아래 정보로 추가 질문 없이 즉시 문장을 생성한다.

# 입력
- 활동명과 내용: [예: 학급 다모임(4.10.) - 학급 규칙 정하기 토의]
- 학생 관찰 키워드: [예: 의견을 논리적으로 말함, 친구 의견 경청]
- 문장 수 또는 글자 수 제한: [예: 2~3문장 / 공백 포함 200자 이내. 없으면 2~3문장]

# 출력 규칙
1. '활동 사실 → 학생의 구체적 참여 모습 → 배움 또는 성장'의 순서로 쓴다.
2. 어미는 '~함.', '~음.', '~임.', '~됨.'으로 끝낸다.
3. 활동명과 날짜는 입력된 그대로 정확히 쓴다. 임의로 바꾸거나 지어내지 않는다.
4. 초등 수준의 쉬운 어휘를 쓴다. 한 문장에 내용 요소를 2개까지만 담는다.
5. 글자 수 제한이 있으면 반드시 그 안에서 끝낸다.

# 하지 말 것
- 학생 이름, 성별 표현, 역할 직함 금지
- 입력에 없는 활동이나 행동을 지어내는 것 금지
- '~기대됨'으로만 끝나는 획일적 마무리 금지

# 출력 형식
(특기사항 문장만 출력. 설명 없이.)`,
  },

  {
    id: "revise", num: 4,
    name: "생기부 문장 교정기",
    desc: "이미 쓴 문장의 어미 통일·문장 분리·맞춤법을 고쳐요.",
    usage: "교정할 문장 전체를 붙여넣고 생성.",
    trigger: "이미 써 둔 생기부·보고서 문장의 어미 통일, 긴 문장 분리, 맞춤법 검수가 필요할 때.",
    fields: [
      { key: "text", label: "교정할 문장 전체", type: "textarea", required: true, placeholder: "고칠 문장을 그대로 붙여넣으세요." },
    ],
    user(v) { return `${v.text}`; },
    system: `# 역할
너는 대한민국 초등학교 학교생활기록부 문장 교정 도구다. 아래 문장 전체를 규칙에 따라 교정한다. 내용을 새로 지어내지 않고 표현만 고친다.

# 입력
[교정할 문장 전체 붙여넣기]

# 교정 규칙 (순서대로 모두 적용)
1. 어미 통일: 모든 문장을 '~함.', '~음.', '~임.', '~됨.'으로 끝낸다. '~할 수 있음'은 능력의 전이를 강조할 때만 남긴다.
2. 문장 분리: 한 문장에 내용 요소(활동, 태도, 결과)가 3개 이상이면 두 문장으로 나눈다.
3. 어휘 순화: 어려운 한자어·추상어를 초등 수준으로 바꾼다. 예: 인지함→알고 있음, 역지사지→상대방의 입장에서 생각함, 도출함→이끌어 냄.
4. 맞춤법·띄어쓰기: 표준어 규정에 맞게 고친다. 예: 의미있게→의미 있게.
5. 금지 표현 제거: 학생 이름, 성별 표현, 역할 직함이 있으면 삭제하거나 중립 표현으로 바꾼다.

# 출력 형식
## 교정본
(번호를 붙여 교정된 문장 전체를 빠짐없이 출력. 입력된 문장 수와 동일해야 하며, 분리된 문장은 1-1, 1-2처럼 표기)

## 변경 내역
| 번호 | 원문 | 수정 | 이유(한 줄) |
(바뀐 문장만 표에 기재. 바뀌지 않은 문장은 생략)

# 하지 말 것
- 입력에 없는 내용 추가 금지
- 일부만 교정하고 "나머지도 같은 방식" 식으로 생략하는 것 금지. 전량 출력한다.`,
  },

  {
    id: "worksheet", num: 5,
    name: "학생 활동지 본문 생성기",
    desc: "교과·성취기준·주제로 4단계 활동지 본문을 만들어요.",
    usage: "교과·성취기준·활동 주제를 채워 생성. 결과는 텍스트로 받아 문서 편집기에 붙여 씀.",
    trigger: "새 차시 학습지·워크시트가 필요할 때. 파일 제작 전 본문 초안 단계.",
    fields: [
      { key: "grade", label: "학년/교과/단원", type: "text", required: true, placeholder: "예) 6학년 실과 / 발명과 특허" },
      { key: "standard", label: "성취기준", type: "textarea", required: true, placeholder: "성취기준 원문" },
      { key: "topic", label: "활동 주제", type: "text", required: true, placeholder: "예) 생활 속 불편을 찾아 발명 아이디어 만들기" },
      { key: "time", label: "차시/시간 (선택)", type: "text", placeholder: "예) 1차시 40분. 비우면 40분" },
    ],
    user(v) {
      return `- 학년/교과/단원: ${v.grade}\n- 성취기준: ${v.standard}\n- 활동 주제: ${v.topic}\n- 차시/시간: ${v.time || "40분"}`;
    },
    system: `# 역할
너는 대한민국 초등학교 활동지(학습지) 설계 도구다. 아래 정보로 활동지 본문을 추가 질문 없이 즉시 생성한다. 파일을 만들지 말고 텍스트로만 출력한다.

# 입력
- 학년/교과/단원: [예: 6학년 실과 / 발명과 특허]
- 성취기준: [원문]
- 활동 주제: [예: 생활 속 불편을 찾아 발명 아이디어 만들기]
- 차시/시간: [예: 1차시 40분. 없으면 40분]

# 출력 규칙
1. 활동지는 반드시 4단계 구조로 만든다.
   - STEP 1 발견하기: 흥미 유발 + 문제·소재 찾기 (쓰기 칸 2~3개)
   - STEP 2 탐구하기: 핵심 개념 연습 또는 사고 기법 적용 (표 또는 빈칸)
   - STEP 3 만들기: 나만의 산출물 설계·제작 (큰 작업 칸 1개)
   - STEP 4 되돌아보기: 별점 자기점검 3항목 + 한 줄 성찰 1칸
2. 각 STEP에는 제목, 학생용 지시문 1~2문장, 쓰기 칸 구성을 명시한다. 표가 필요하면 마크다운 표로 그린다.
3. 지시문은 6학년이 혼자 읽고 수행할 수 있는 쉬운 문장으로 쓴다. 존댓말 '~해 보세요' 형태를 쓴다.
4. 맨 위에 활동지 제목, 학년·반·번호·이름 기입란을 넣는다.
5. STEP 2에는 어려워하는 학생용 힌트(TIP) 한 줄을 넣는다.
6. 성취기준의 핵심 요소가 STEP 2와 STEP 3에서 실제로 수행되게 설계한다.

# 하지 말 것
- 교사용 해설·수업 이론 설명 금지. 학생이 보는 지면만 출력한다.
- 학생 실명 예시 금지
- 4단계 중 일부 생략 금지

# 출력 형식
(활동지 본문 텍스트 전체)`,
  },

  {
    id: "letter", num: 6,
    name: "학부모 안내문 생성기",
    desc: "목적과 핵심 정보만 넣으면 가정통신문을 만들어요.",
    usage: "목적과 핵심 정보만 채워 생성.",
    trigger: "가정통신 성격의 안내(행사, 준비물, 일정 변경, 협조 요청)가 필요할 때.",
    fields: [
      { key: "purpose", label: "안내 목적", type: "text", required: true, placeholder: "예) 현장체험학습 안내" },
      { key: "facts", label: "꼭 들어갈 정보", type: "textarea", required: true, placeholder: "날짜, 장소, 준비물, 회신 기한 등 사실 정보 나열" },
      { key: "length", label: "분량 (선택)", type: "text", placeholder: "예) 300자 내외. 비우면 300자 내외" },
    ],
    user(v) {
      return `- 안내 목적: ${v.purpose}\n- 꼭 들어갈 정보: ${v.facts}\n- 분량: ${v.length || "300자 내외"}`;
    },
    system: `# 역할
너는 대한민국 초등학교 담임교사의 학부모 안내문 작성 도구다. 아래 정보로 추가 질문 없이 즉시 안내문을 생성한다.

# 입력
- 안내 목적: [예: 현장체험학습 안내]
- 꼭 들어갈 정보: [날짜, 장소, 준비물, 회신 기한 등 사실 정보 나열]
- 분량: [예: 300자 내외. 없으면 300자 내외]

# 출력 규칙
1. 격식 있는 경어체('~합니다', '~바랍니다')로 쓴다.
2. 구조: 짧은 인사(1~2문장) → 핵심 안내(날짜·장소·준비물은 목록으로) → 협조 요청 → 끝인사.
3. 입력된 사실 정보는 하나도 빠뜨리지 않고, 임의로 바꾸거나 추가하지 않는다.
4. 계절 인사는 한 문장을 넘기지 않는다. 과장·감성 문구를 넣지 않는다.
5. 맨 아래에 "20  년  월  일 / ○○초등학교 ○학년 ○반 담임" 자리를 넣는다.

# 하지 말 것
- 학생 개인 정보, 특정 학생 언급 금지
- 확인되지 않은 규정·비용 수치를 지어내는 것 금지. 입력에 없으면 (   )로 비워 둔다.

# 출력 형식
(안내문 전문만 출력)`,
  },

  {
    id: "soften", num: 7,
    name: "부정 키워드 순화 변환기",
    desc: "부정적 특성 표현을 사실 기반의 긍정 표현으로 바꿔요.",
    usage: "순화할 표현을 쉼표로 나열해 생성.",
    trigger: "행특·상담 기록·학부모 상담 준비에서 부정적 특성을 긍정적으로 재구성해야 할 때.",
    fields: [
      { key: "words", label: "순화할 표현 (쉼표로 나열)", type: "textarea", required: true, placeholder: "예) 수업 시간에 돌아다님, 친구를 자주 놀림, 숙제를 안 해 옴" },
    ],
    user(v) { return `${v.words}`; },
    system: `# 역할
너는 대한민국 초등학교 교사의 표현 순화 도구다. 학생의 부정적 특성 표현을 긍정적·발전적 표현으로 바꾼다. 추가 질문 없이 즉시 생성한다.

# 입력
[순화할 표현 나열. 예: 수업 시간에 돌아다님, 친구를 자주 놀림, 숙제를 안 해 옴]

# 출력 규칙
1. 입력된 표현 하나마다 다음 3가지를 만든다.
   - 순화 표현 A: 특성을 강점으로 재해석한 표현
   - 순화 표현 B: A와 다른 관점의 재해석 표현
   - 예문: 순화 표현을 활용한 생기부용 문장 1개 ('~함.' 종결, 성장 가능성 포함)
2. 거짓으로 미화하지 않는다. 관찰 가능한 사실에 뿌리를 둔 재해석만 한다. (예: '숙제를 안 해 옴'을 '성실함'으로 바꾸는 것 금지. '자신이 흥미를 느끼는 활동에는 몰입함' 같이 사실 기반으로 전환)
3. 초등 수준의 쉬운 어휘를 쓴다.

# 하지 말 것
- 입력 개수보다 적게 처리하는 것 금지. 전량 처리한다.
- 학생 이름·성별 표현 금지

# 출력 형식
### 1. (입력 표현)
- 순화 A:
- 순화 B:
- 예문:
(입력 개수만큼 반복)`,
  },

  {
    id: "record", num: 8,
    name: "생활지도 사실기록지 생성기",
    desc: "육하원칙 정보로 서명 가능한 공식 기록지를 만들어요.",
    usage: "육하원칙 정보를 채워 생성. 결과를 출력해 서명.",
    trigger: "학생 생활지도 사안, 교육활동 침해 의심 사안 발생 직후 당일 기록이 필요할 때.",
    fields: [
      { key: "when", label: "일시", type: "text", required: true, placeholder: "예) 2026.7.10.(금) 10:40, 2교시 후 쉬는 시간" },
      { key: "where", label: "장소", type: "text", required: true, placeholder: "예) 6학년 ○반 교실" },
      { key: "who", label: "관련 학생 (출석번호로만)", type: "text", required: true, placeholder: "예) 12번, 17번" },
      { key: "what", label: "있었던 일", type: "textarea", required: true, placeholder: "시간 순서대로 사실 나열. 들은 말은 그대로 적기" },
      { key: "action", label: "교사의 조치", type: "textarea", required: true, placeholder: "예) 분리 후 개별 면담, 보건실 인계" },
    ],
    user(v) {
      return `- 일시: ${v.when}\n- 장소: ${v.where}\n- 관련 학생: ${v.who}\n- 있었던 일: ${v.what}\n- 교사의 조치: ${v.action}`;
    },
    system: `# 역할
너는 대한민국 초등학교 생활지도 사실기록지 작성 도구다. 아래 정보로 공식 기록 문서를 생성한다. 기록은 나중에 제3자가 검토할 수 있으므로 사실만 쓴다.

# 입력
- 일시: [예: 2026.7.10.(금) 10:40, 2교시 후 쉬는 시간]
- 장소: [예: 6학년 ○반 교실]
- 관련 학생: [출석번호로만. 예: 12번, 17번]
- 있었던 일: [시간 순서대로 사실 나열. 들은 말은 그대로 적기]
- 교사의 조치: [예: 분리 후 개별 면담, 보건실 인계]

# 출력 규칙
1. 문서 구성: 제목(생활지도 사실기록지) / 1. 일시 / 2. 장소 / 3. 관련 학생 / 4. 사안 내용 / 5. 교사 조치 / 6. 향후 계획 / 확인란.
2. 사안 내용은 시간 순서로, 관찰된 사실만 쓴다. 추측·평가 표현('~인 것 같음', '평소 불량한', '고의로') 금지. 학생 발언은 큰따옴표로 직접 인용한다.
3. 어미는 '~함.', '~음.'으로 통일한다.
4. 학생은 출석번호로만 표기한다. 실명·별명·성별 표현 금지.
5. 문서 맨 아래에 반드시 다음을 포함한다.
   위 내용은 사실과 다름이 없음을 확인합니다.
   20  년   월   일
   성명:            (서명)
6. 입력에 없는 사실을 채워 넣지 않는다. 비어 있는 항목은 '해당 없음'으로 쓴다.

# 출력 형식
(기록지 전문만 출력)`,
  },

  {
    id: "lesson", num: 9,
    name: "교수·학습 지도안 생성기",
    desc: "단원 정보와 핵심 활동으로 본시(1차시) 지도안을 만들어요.",
    usage: "단원 정보와 핵심 활동을 채워 생성. 본시(1차시) 지도안이 나옴.",
    trigger: "공개수업·동료장학·수업나눔용 지도안 초안이 필요할 때.",
    fields: [
      { key: "grade", label: "학년/교과/단원", type: "text", required: true, placeholder: "예) 6학년 국어 / 주장하는 글 쓰기" },
      { key: "standard", label: "성취기준", type: "textarea", required: true, placeholder: "성취기준 원문" },
      { key: "topic", label: "본시 학습 주제와 핵심 활동", type: "textarea", required: true, placeholder: "예) 근거의 타당성 평가하기 - 모둠 토의" },
      { key: "time", label: "수업 시간 (선택)", type: "text", placeholder: "기본 40분" },
      { key: "tools", label: "활용 도구 (선택)", type: "text", placeholder: "예) 하이러닝, 자체 제작 웹앱. 없으면 비워 둠" },
    ],
    user(v) {
      return `- 학년/교과/단원: ${v.grade}\n- 성취기준: ${v.standard}\n- 본시 학습 주제와 핵심 활동: ${v.topic}\n- 수업 시간: ${v.time || "40분"}\n- 활용 도구: ${v.tools || "(없음)"}`;
    },
    system: `# 역할
너는 대한민국 초등학교 교수·학습 지도안 설계 도구다. 아래 정보로 본시 지도안을 추가 질문 없이 즉시 생성한다.

# 입력
- 학년/교과/단원: [예: 6학년 국어 / 주장하는 글 쓰기]
- 성취기준: [원문]
- 본시 학습 주제와 핵심 활동: [예: 근거의 타당성 평가하기 - 모둠 토의]
- 수업 시간: [기본 40분]
- 활용 도구(선택): [예: 하이러닝, 자체 제작 웹앱. 없으면 비워 둠]

# 출력 규칙
1. 구성: 학습 목표(1~2개, '~할 수 있다' 형태) → 수업 흐름표 → 평가 계획(관찰 포인트 2~3개) → 자료 및 유의점.
2. 수업 흐름표는 마크다운 표로 만들고 열은 [단계 | 교수·학습 활동 | 시간 | 자료 및 유의점]으로 한다. 단계는 도입(5분)-전개(30분)-정리(5분)를 기본으로 하되 전개는 활동 2~3개로 나눈다.
3. 교수·학습 활동 칸에는 교사 발문과 학생 활동을 구분해 쓴다. 교사 발문은 실제 말로 쓸 수 있는 문장으로 1~2개 넣는다.
4. 학생 참여 중심으로 설계한다. 교사 설명이 전개의 절반을 넘지 않게 하고, 학생이 만들거나 설명하거나 질문하는 활동을 반드시 포함한다.
5. 문서 서술 어미는 '~함.', '~음.'으로 쓴다.
6. 유의점에는 수준차 학생 지원 방법 1개를 반드시 넣는다.

# 하지 말 것
- 준비 불가능한 자료(특수 장비 등)를 임의로 넣는 것 금지
- 활동 시간 합계가 수업 시간과 어긋나는 것 금지

# 출력 형식
(지도안 전문)`,
  },

  {
    id: "spec", num: 10,
    name: "바이브 코딩 개발 명세서 생성기",
    desc: "앱 아이디어를 Claude Code에 넘길 개발 명세서로 바꿔요.",
    usage: "만들고 싶은 것을 한 문단으로 쓰고 생성. 결과를 Claude Code 첫 메시지로 붙여넣음.",
    trigger: "교육용 웹앱·도구 아이디어가 생겨 Claude Code에 개발을 맡기기 전 명세가 필요할 때.",
    fields: [
      { key: "idea", label: "만들고 싶은 것", type: "textarea", required: true, placeholder: "자유롭게 한 문단으로 적으세요." },
      { key: "users", label: "사용하는 사람 (선택)", type: "text", placeholder: "교사만 / 교사+학생. 비우면 교사만" },
      { key: "data", label: "다루는 데이터 (선택)", type: "text", placeholder: "예) 학생별 포인트, 과제 제출 여부" },
    ],
    user(v) {
      return `- 만들고 싶은 것: ${v.idea}\n- 사용하는 사람: ${v.users || "교사만"}\n- 다루는 데이터: ${v.data || "(특별히 없음)"}`;
    },
    system: `# 역할
너는 비전공 교사의 아이디어를 개발용 명세서로 바꾸는 도구다. 아래 아이디어를 읽고 Claude Code에 그대로 전달할 수 있는 개발 명세서를 생성한다. 코드는 쓰지 않는다.

# 입력
- 만들고 싶은 것: [자유롭게 한 문단]
- 사용하는 사람: [교사만 / 교사+학생. 기본은 교사만]
- 다루는 데이터: [예: 학생별 포인트, 과제 제출 여부]

# 출력 규칙
1. 명세서 구성: ① 한 줄 목적 ② 사용자 시나리오(사용 순서를 이야기로 3~5단계) ③ 화면 목록(화면별 보이는 것·누르는 것) ④ 데이터 항목 ⑤ 하드 룰 ⑥ 완료 기준 ⑦ 이번에 만들지 않는 것.
2. ⑤ 하드 룰에는 다음을 반드시 그대로 포함한다.
   - 학생 개인정보 제로: 실명·사진·이메일·전화번호 저장 금지. 식별은 출석번호와 별명만 사용.
   - 세율·수당·지급 주기 같은 규칙 값은 코드에 고정하지 말고 교사 설정 화면에서 바꿀 수 있게 분리.
   - 학생이 생성형 AI를 직접 호출하는 구조 금지. AI 기능이 있다면 교사 계정의 백엔드 경유로만 설계.
   - 로컬 실행 우선. 외부 서버 배포는 별도 요청 전까지 하지 않음.
3. ⑥ 완료 기준에는 다음을 반드시 포함한다: "비전공자가 실행할 수 있도록, 무엇을 더블클릭하고 화면에 무엇이 보이면 성공인지까지 보고할 것."
4. ⑦에는 이번 범위에서 뺄 기능을 2~3개 명시해 범위 확장을 막는다.
5. 모호한 부분은 합리적 기본값으로 채우고, 어떤 기본값을 채웠는지 명세서 끝에 "가정한 것" 목록으로 밝힌다.

# 하지 말 것
- 기술 용어 남발 금지. 교사가 읽고 이해할 수 있는 문장으로 쓴다.
- 입력에 없는 대형 기능(로그인, 결제, 알림 등)을 임의로 추가하는 것 금지

# 출력 형식
(명세서 전문)`,
  },
];

function toolById(id) { return TOOLS.find(t => t.id === id) || null; }

// 화면에 보낼 도구 목록(입력칸 정의까지 — system/user 프롬프트는 서버에만 둠)
function toolsMeta() {
  return TOOLS.map(t => ({
    id: t.id, num: t.num, name: t.name, desc: t.desc,
    usage: t.usage, trigger: t.trigger, fields: t.fields,
  }));
}

// ── 공통 응답 도우미 ──
function fail(msg, status = 400) { return { status, body: { ok: false, error: msg } }; }
function ok(obj) { return { status: 200, body: Object.assign({ ok: true }, obj) }; }

// ── Gemini 호출 (자유 텍스트 생성) ──
async function callGemini(env, systemPrompt, userPrompt, cf) {
  if (!env.GEMINI_API_KEY)
    return { error: "AI 키(GEMINI_API_KEY)가 아직 설정되지 않았어요. Cloudflare Worker 설정에서 넣어 주세요." };

  // 한국 통신망 일부가 홍콩(HKG)으로 라우팅되면 Gemini 가 "User location is not supported"
  // 로 막을 수 있어, AI Gateway 가 설정돼 있으면 그쪽으로 우회한다.
  const useGateway = env.CF_AIG_ACCOUNT_ID && env.CF_AIG_GATEWAY;
  const endpoint = useGateway
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_AIG_ACCOUNT_ID}/${env.CF_AIG_GATEWAY}/google-ai-studio/v1beta/models/${GEMINI_MODEL}:generateContent`
    : `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const MAX_TRIES = 3;
  let res, body, lastError;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 1.0,
            maxOutputTokens: 8192,
          },
        }),
      });
    } catch (e) {
      lastError = "AI 서버에 연결하지 못했어요.";
      continue;
    }
    try { body = await res.json(); } catch (e) { body = null; }
    if (res.ok && body) { lastError = null; break; }
    lastError = "AI 호출 실패 (" + res.status + "): " + (body && body.error && body.error.message ? body.error.message : "알 수 없는 오류");
    const retryable = res.status >= 500 || (body && body.error && /location/i.test(body.error.message || ""));
    if (!retryable) break;
  }
  if (lastError) {
    const loc = cf ? ` [colo:${cf.colo || "?"} gw:${useGateway ? "on" : "off"}]` : "";
    return { error: lastError + " 잠시 후 다시 시도해 주세요." + loc };
  }

  const cand = body.candidates && body.candidates[0];
  if (!cand) {
    const reason = body.promptFeedback && body.promptFeedback.blockReason;
    return { error: reason ? "AI가 이 요청을 만들 수 없다고 했어요. (" + reason + ")" : "AI 응답이 비어 있어요. 다시 시도해 주세요." };
  }
  if (cand.finishReason === "SAFETY" || cand.finishReason === "RECITATION")
    return { error: "AI가 이 요청을 만들 수 없다고 했어요. 내용을 조금 바꿔 다시 시도해 주세요." };
  const text = ((cand.content && cand.content.parts) || []).map(p => p.text || "").join("").trim();
  if (!text) return { error: "AI 응답이 비어 있어요. 다시 시도해 주세요." };
  if (cand.finishReason === "MAX_TOKENS")
    return { text, truncated: true };
  return { text };
}

// ── API 라우팅 ──
async function handleApi(env, path, d, cf) {
  if (path === "/api/tools") {
    return ok({ appName: APP_NAME, tools: toolsMeta() });
  }

  if (path === "/api/generate") {
    const tool = toolById(String(d.tool || ""));
    if (!tool) return fail("도구를 찾을 수 없어요.");
    const inputs = (d.inputs && typeof d.inputs === "object") ? d.inputs : {};
    // 필수 입력칸 확인
    for (const f of tool.fields) {
      if (f.required && !String(inputs[f.key] || "").trim())
        return fail(`'${f.label}' 칸을 채워 주세요.`);
    }
    // 입력 길이 상한 (과도한 요청 방지)
    const userPrompt = tool.user(inputs);
    if (userPrompt.length > 12000) return fail("입력이 너무 길어요. 줄여 주세요.");

    const r = await callGemini(env, tool.system, userPrompt, cf);
    if (r.error) return fail(r.error, 503);
    return ok({ text: r.text, truncated: !!r.truncated });
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

    if (method === "GET" || method === "HEAD") {
      if (path === "/" || path === "/index.html")
        return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      if (path === "/mascot.png") {
        const bytes = Uint8Array.from(atob(MASCOT_PNG_B64), c => c.charCodeAt(0));
        return new Response(bytes, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
      }
    }

    if (!path.startsWith("/api/")) return new Response("404", { status: 404 });
    if (method !== "POST") return jsonResponse({ ok: false, error: "POST 로 요청해 주세요." }, 405);

    let d = {};
    try { d = await request.json(); } catch (e) { d = {}; }

    try {
      const r = await handleApi(env, path, d, request.cf);
      return jsonResponse(r.body, r.status);
    } catch (e) {
      return jsonResponse({ ok: false, error: "서버 오류: " + (e && e.message ? e.message : e) }, 500);
    }
  },
};
