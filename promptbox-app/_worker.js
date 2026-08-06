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

const APP_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>선생님 도구상자</title>
<style>
  :root{
    --bg:#f4f1ea; --panel:#fffdf7; --ink:#2b2b2b; --sub:#6b6459;
    --line:#e3ddce; --blue:#2f5fa6; --blue-d:#254c85; --accent:#c9622f;
    --ok:#2f7a4d; --err:#c2483b; --chip:#efe9dc; --shadow:0 1px 0 rgba(0,0,0,.04);
    --radius:14px;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--bg); color:var(--ink);
    font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic","맑은 고딕",system-ui,sans-serif;
    line-height:1.6; -webkit-text-size-adjust:100%;
  }
  .wrap{max-width:900px;margin:0 auto;padding:20px 16px 64px}
  header.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 2px 18px}
  header.top img.mascot{width:44px;height:44px;object-fit:contain;flex:0 0 auto}
  header.top .titles{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  header.top h1{font-size:22px;margin:0;letter-spacing:-.02em}
  header.top .tag{color:var(--sub);font-size:13px}
  .hint{color:var(--sub);font-size:13px;margin:0 2px 16px}

  /* ── 메뉴(도구 목록) ── */
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media (max-width:620px){ .grid{grid-template-columns:1fr} }
  .card{
    background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);
    padding:14px 15px;cursor:pointer;text-align:left;display:flex;gap:12px;align-items:flex-start;
    box-shadow:var(--shadow);transition:border-color .12s,transform .06s;
  }
  .card:hover{border-color:var(--blue)}
  .card:active{transform:translateY(1px)}
  .num{
    flex:0 0 auto;width:30px;height:30px;border-radius:9px;background:var(--blue);
    color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:15px;
  }
  .card h3{margin:0 0 3px;font-size:15px;letter-spacing:-.01em}
  .card p{margin:0;color:var(--sub);font-size:12.5px}

  /* ── 도구 화면 ── */
  .view{display:none}
  .view.on{display:block}
  .back{
    display:inline-flex;align-items:center;gap:6px;
    background:#fff;border:1px solid var(--line);border-radius:10px;
    color:var(--blue);font-size:15px;font-weight:700;cursor:pointer;
    padding:9px 16px;margin-bottom:14px;box-shadow:var(--shadow);
  }
  .back:hover{border-color:var(--blue);background:var(--chip)}
  .back:active{transform:translateY(1px)}
  .toolhead{display:flex;gap:12px;align-items:flex-start;margin-bottom:6px}
  .toolhead .num{width:34px;height:34px;font-size:16px}
  .toolhead h2{margin:0;font-size:19px;letter-spacing:-.01em}
  .meta{background:var(--chip);border-radius:10px;padding:9px 12px;font-size:12.5px;color:var(--sub);margin:10px 0 18px}
  .meta b{color:var(--ink);font-weight:600}

  form .field{margin-bottom:14px}
  label{display:block;font-size:13.5px;font-weight:600;margin-bottom:5px}
  label .req{color:var(--err);margin-left:3px}
  input[type=text],input[type=number],textarea{
    width:100%;border:1px solid var(--line);border-radius:10px;background:#fff;
    padding:10px 12px;font:inherit;font-size:14px;color:var(--ink);resize:vertical;
  }
  input:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px rgba(47,95,166,.12)}
  textarea{min-height:88px;line-height:1.55}

  .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:4px}
  button.primary{
    background:var(--blue);color:#fff;border:none;border-radius:10px;padding:11px 20px;
    font:inherit;font-size:15px;font-weight:700;cursor:pointer;
  }
  button.primary:hover{background:var(--blue-d)}
  button.primary:disabled{opacity:.55;cursor:default}
  button.ghost{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 16px;font:inherit;font-size:14px;cursor:pointer;color:var(--ink)}
  button.ghost:hover{border-color:var(--blue);color:var(--blue)}

  .msg{font-size:13.5px;margin-top:12px}
  .msg.err{color:var(--err)}
  .spinner{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px;margin-right:7px}
  @keyframes spin{to{transform:rotate(360deg)}}

  .result{margin-top:22px;display:none}
  .result.on{display:block}
  .result .rhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px}
  .result .rhead h3{margin:0;font-size:15px}
  .result textarea{min-height:280px;background:#fffdf7;font-size:13.5px;line-height:1.65;
    font-family:"Pretendard","Malgun Gothic",monospace}
  .copied{color:var(--ok);font-size:13px;font-weight:600}
  .warn{color:var(--accent);font-size:12.5px;margin-top:8px}
  footer{margin-top:40px;color:var(--sub);font-size:11.5px;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <img class="mascot" src="/mascot.png" alt="다람쌤 마스코트">
    <span class="titles">
      <h1 id="appName">선생님 도구상자</h1>
      <span class="tag">· 다람쌤과 함께하는 업무 도우미 10</span>
    </span>
  </header>

  <!-- 메뉴 -->
  <section id="menu">
    <p class="hint">필요한 도구를 골라 입력칸만 채우면 AI가 결과를 만들어 드려요. 결과는 복사해서 그대로 쓰시면 됩니다.</p>
    <div class="grid" id="grid"></div>
  </section>

  <!-- 도구 화면 -->
  <section id="tool" class="view">
    <button class="back" id="back">← 목록으로</button>
    <div class="toolhead">
      <div class="num" id="tNum">1</div>
      <h2 id="tName"></h2>
    </div>
    <div class="meta">
      <div><b>언제</b> · <span id="tTrigger"></span></div>
      <div><b>사용법</b> · <span id="tUsage"></span></div>
    </div>

    <form id="form" autocomplete="off"></form>

    <div class="actions">
      <button type="button" class="primary" id="gen">생성하기</button>
      <span class="msg" id="msg"></span>
    </div>

    <div class="result" id="result">
      <div class="rhead">
        <h3>결과</h3>
        <div>
          <button class="ghost" id="copy">📋 복사</button>
          <button class="ghost" id="regen">다시 생성</button>
          <span class="copied" id="copied" style="display:none">복사됨!</span>
        </div>
      </div>
      <textarea id="out" spellcheck="false"></textarea>
      <div class="warn" id="warn" style="display:none">⚠️ 응답이 길어 중간에 잘렸을 수 있어요. '다시 생성'을 누르거나 입력을 줄여 보세요.</div>
    </div>
  </section>

  <footer>결과는 초안이에요. 사용 전 반드시 한 번 검토하세요 · 학생 실명 등 개인정보는 입력하지 마세요.</footer>
</div>

<script>
"use strict";
const $ = s => document.querySelector(s);
let TOOLS = [];
let current = null;

async function api(path, data){
  const r = await fetch(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data||{})});
  return r.json();
}

function esc(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

// ── 메뉴 그리기 ──
function renderMenu(){
  $("#grid").innerHTML = TOOLS.map(t=>\`
    <button class="card" data-id="\${t.id}">
      <span class="num">\${t.num}</span>
      <span>
        <h3>\${esc(t.name.replace(/ 생성기$| 변환기$| 생성기$/,''))}</h3>
        <p>\${esc(t.desc)}</p>
      </span>
    </button>\`).join("");
  document.querySelectorAll(".card").forEach(c=>{
    c.onclick = ()=> openTool(c.dataset.id);
  });
}

// ── 도구 열기 ──
function openTool(id, fromPopstate){
  const t = TOOLS.find(x=>x.id===id);
  if(!t) return;
  current = t;
  $("#tNum").textContent = t.num;
  $("#tName").textContent = t.name;
  $("#tTrigger").textContent = t.trigger;
  $("#tUsage").textContent = t.usage;

  $("#form").innerHTML = t.fields.map(f=>{
    const req = f.required ? '<span class="req">*</span>' : '';
    const ph = f.placeholder ? \` placeholder="\${esc(f.placeholder)}"\` : '';
    const val = f.default ? esc(f.default) : '';
    if(f.type==="textarea")
      return \`<div class="field"><label>\${esc(f.label)}\${req}</label><textarea data-key="\${f.key}"\${ph}>\${val}</textarea></div>\`;
    const type = f.type==="number" ? "number" : "text";
    return \`<div class="field"><label>\${esc(f.label)}\${req}</label><input type="\${type}" data-key="\${f.key}"\${ph} value="\${val}"></div>\`;
  }).join("");

  $("#msg").textContent = "";
  $("#result").classList.remove("on");
  $("#out").value = "";
  $("#menu").style.display = "none";
  $("#tool").classList.add("on");
  window.scrollTo(0,0);

  // 뒤로가기(브라우저/모바일)를 누르면 이전 웹페이지가 아니라 목록 화면으로 오도록 기록
  if(!fromPopstate) history.pushState({promptboxTool:id}, "", location.href);
}

function backToMenu(fromPopstate){
  $("#tool").classList.remove("on");
  $("#menu").style.display = "";
  current = null;
  window.scrollTo(0,0);
  if(!fromPopstate) history.back();
}

window.addEventListener("popstate", (e)=>{
  if(e.state && e.state.promptboxTool) openTool(e.state.promptboxTool, true);
  else if(current) backToMenu(true);
});

function collectInputs(){
  const inputs = {};
  document.querySelectorAll("#form [data-key]").forEach(el=> inputs[el.dataset.key] = el.value.trim());
  return inputs;
}

let busy = false;
async function generate(){
  if(busy || !current) return;
  const inputs = collectInputs();
  // 필수칸 클라이언트 확인
  for(const f of current.fields){
    if(f.required && !inputs[f.key]){
      showMsg("'"+f.label+"' 칸을 채워 주세요.", true);
      return;
    }
  }
  busy = true;
  $("#gen").disabled = true;
  showMsg('<span class="spinner"></span>AI가 만들고 있어요… (10~30초)', false);
  try{
    const res = await api("/api/generate", {tool: current.id, inputs});
    if(!res.ok){ showMsg(res.error || "생성에 실패했어요.", true); return; }
    $("#out").value = res.text || "";
    $("#warn").style.display = res.truncated ? "" : "none";
    $("#result").classList.add("on");
    showMsg("완료! 아래에서 복사하세요.", false);
    autoGrow($("#out"));
    $("#result").scrollIntoView({behavior:"smooth", block:"nearest"});
  }catch(e){
    showMsg("네트워크 오류예요. 잠시 후 다시 시도해 주세요.", true);
  }finally{
    busy = false;
    $("#gen").disabled = false;
  }
}

function showMsg(html, isErr){
  const m = $("#msg");
  m.innerHTML = html;
  m.className = "msg" + (isErr ? " err" : "");
}

function autoGrow(el){
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 4, 720) + "px";
}

async function copyOut(){
  const text = $("#out").value;
  if(!text) return;
  try{
    await navigator.clipboard.writeText(text);
  }catch(e){
    $("#out").select(); document.execCommand("copy");
  }
  const c = $("#copied");
  c.style.display = "";
  setTimeout(()=> c.style.display="none", 1600);
}

// ── 시작 ──
(async function init(){
  $("#back").onclick = ()=>backToMenu(false);
  $("#gen").onclick = generate;
  $("#regen").onclick = generate;
  $("#copy").onclick = copyOut;
  $("#out").addEventListener("input", ()=>autoGrow($("#out")));
  try{
    const info = await api("/api/tools", {});
    if(info && info.ok){
      TOOLS = info.tools || [];
      if(info.appName){ $("#appName").textContent = info.appName; document.title = info.appName; }
      renderMenu();
    }else{
      $("#grid").innerHTML = '<p class="msg err">도구 목록을 불러오지 못했어요. 새로고침 해 주세요.</p>';
    }
  }catch(e){
    $("#grid").innerHTML = '<p class="msg err">서버에 연결하지 못했어요.</p>';
  }
})();
</script>
</body>
</html>
`;
const APP_NAME = "선생님 도구상자";
// 다람쌤 마스코트 (build 스크립트가 promptbox-app/mascot.png 를 base64 로 넣어 줌)
const MASCOT_PNG_B64 = "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";

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
