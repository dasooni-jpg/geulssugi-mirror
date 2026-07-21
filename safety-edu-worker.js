/*
 * 안전교육 문구 복사기 — 온라인 서버 (Cloudflare Worker)
 * ──────────────────────────────────────────────────────────
 * 주간학습안내를 만들 때 안전교육 문구를 매번 손으로 바꾸는 번거로움을 없애기 위한 도구.
 * 주차를 고르면 구글시트 최신 내용을 표로 보여주고 복사 버튼으로 복사 → 한글 표에 붙여넣기.
 *  - 주소: https://<워커주소>/
 *
 * ※ 이 파일은 build-safety-edu-worker.ps1 이 만든 자동 생성본입니다.
 *    화면(safety-edu-app/app.html)을 고친 뒤에는 빌드 스크립트를 다시 실행하세요.
 *
 * 설정 (Cloudflare 대시보드에서 1회만):
 *  1. Workers & Pages → Create → Worker 생성 (이름 예: safety-edu)
 *  2. 이 파일(safety-edu-worker.js) 내용을 그대로 붙여넣고 Deploy
 *  3. 별도 DB/시크릿 설정 필요 없음 — 구글시트가 "링크 있으면 누구나 보기"로 공개되어 있어야 함.
 */

const APP_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>안전교육 문구 복사기</title>
<style>
  :root {
    --main: #3d7a5c;
    --main-light: #eaf5ee;
    --accent: #e08a3c;
    --text: #2b2b2b;
    --sub: #6b6b6b;
    --border: #dbe6df;
    --bg: #f7faf8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 24px;
  }
  .wrap {
    max-width: 720px;
    margin: 0 auto;
  }
  h1 {
    font-size: 22px;
    margin: 0 0 4px;
    color: var(--main);
  }
  .desc {
    color: var(--sub);
    font-size: 14px;
    margin-bottom: 20px;
  }
  .card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .controls {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  select {
    font-size: 15px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #fff;
  }
  .refresh-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: var(--sub);
    cursor: pointer;
  }
  .refresh-btn:hover { background: var(--main-light); }
  .status {
    font-size: 12px;
    color: var(--sub);
    margin-left: auto;
  }
  label.toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--sub);
    margin-top: 14px;
    cursor: pointer;
  }
  .output-box {
    margin-top: 14px;
  }
  textarea {
    width: 100%;
    min-height: 160px;
    font-size: 15px;
    line-height: 1.7;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    resize: vertical;
    font-family: inherit;
    background: var(--main-light);
  }
  .copy-btn {
    margin-top: 10px;
    width: 100%;
    background: var(--main);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 13px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .copy-btn:hover { background: #2f6249; }
  .copy-btn.copied { background: var(--accent); }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin-top: 4px;
  }
  td {
    padding: 8px 6px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  td.label {
    color: var(--main);
    font-weight: 600;
    width: 130px;
    white-space: nowrap;
  }
  .error {
    color: #c0392b;
    font-size: 14px;
  }
  .hint {
    font-size: 12px;
    color: var(--sub);
    margin-top: 6px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>🛡️ 안전교육 문구 복사기</h1>
  <div class="desc">주차를 고르면 스프레드시트 최신 안전교육 문구를 불러와요. 복사해서 한글 주간학습안내 표에 붙여넣으세요.</div>

  <div class="card">
    <div class="controls">
      <select id="weekSelect"></select>
      <button class="refresh-btn" id="refreshBtn">↻ 최신 내용 다시 불러오기</button>
      <span class="status" id="statusText">불러오는 중...</span>
    </div>

    <div id="content"></div>

    <label class="toggle">
      <input type="checkbox" id="labelToggle" checked>
      항목 이름(성 안전, 교통 안전 등) 포함해서 복사하기
    </label>

    <div class="output-box">
      <textarea id="output" readonly></textarea>
      <button class="copy-btn" id="copyBtn">복사하기</button>
      <div class="hint">복사 후 한글 표의 안전교육 칸에 붙여넣기(Ctrl+V) 하세요.</div>
    </div>
  </div>
</div>

<script>
const SEMESTERS = [
  { label: "1학기", start: 1, end: 22 },
  { label: "2학기", start: 23, end: 42 }
];
const CATEGORY_KEYS = ["성 안전", "신변 안전", "교통 안전", "학교생활 안전", "학교폭력·사이버 예방", "계절·행사 안전"];

let weekData = {};

function showError(msg) {
  document.getElementById("statusText").textContent = "오류";
  document.getElementById("content").innerHTML = '<div class="error">' + msg + '</div>';
}

async function loadAll(forceRefresh) {
  weekData = {};
  document.getElementById("statusText").textContent = "불러오는 중...";
  document.getElementById("content").innerHTML = "";
  try {
    const url = "/api/data" + (forceRefresh ? "?refresh=1" : "");
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) {
      showError("스프레드시트를 불러오지 못했어요: " + json.error);
      return;
    }
    weekData = json;
    onAllLoaded();
  } catch (e) {
    showError("서버에서 데이터를 가져오지 못했어요. 서버가 켜져 있는지 확인해주세요.");
  }
}

function onAllLoaded() {
  const now = new Date();
  document.getElementById("statusText").textContent =
    "업데이트: " + now.getHours() + ":" + String(now.getMinutes()).padStart(2, "0");
  renderWeek();
}

function buildWeekOptions() {
  const sel = document.getElementById("weekSelect");
  sel.innerHTML = "";
  SEMESTERS.forEach(sem => {
    const group = document.createElement("optgroup");
    group.label = sem.label;
    for (let w = sem.start; w <= sem.end; w++) {
      const opt = document.createElement("option");
      opt.value = w;
      opt.textContent = w + "주";
      group.appendChild(opt);
    }
    sel.appendChild(group);
  });
}

function renderWeek() {
  const week = parseInt(document.getElementById("weekSelect").value, 10);
  const item = weekData[week];
  const contentEl = document.getElementById("content");
  if (!item) {
    contentEl.innerHTML = '<div class="error">해당 주차 데이터가 없어요.</div>';
    document.getElementById("output").value = "";
    return;
  }
  let html = "<table>";
  CATEGORY_KEYS.forEach(key => {
    html += "<tr><td class='label'>" + key + "</td><td>" + (item[key] || "") + "</td></tr>";
  });
  html += "</table>";
  contentEl.innerHTML = html;
  updateOutput();
}

function updateOutput() {
  const week = parseInt(document.getElementById("weekSelect").value, 10);
  const item = weekData[week];
  if (!item) return;
  const withLabel = document.getElementById("labelToggle").checked;
  const lines = CATEGORY_KEYS.map(key => {
    const val = item[key] || "";
    return withLabel ? (key + ": " + val) : val;
  });
  document.getElementById("output").value = lines.join("\\n");
}

document.getElementById("weekSelect").addEventListener("change", renderWeek);
document.getElementById("labelToggle").addEventListener("change", updateOutput);
document.getElementById("refreshBtn").addEventListener("click", () => loadAll(true));
document.getElementById("copyBtn").addEventListener("click", async function () {
  const output = document.getElementById("output");
  output.select();
  let ok = true;
  try {
    await navigator.clipboard.writeText(output.value);
  } catch (e) {
    try {
      ok = document.execCommand("copy");
    } catch (e2) {
      ok = false;
    }
  }
  const btn = document.getElementById("copyBtn");
  const original = btn.textContent;
  btn.textContent = ok ? "복사됨!" : "복사 실패 - 직접 드래그해서 복사해주세요";
  btn.classList.toggle("copied", ok);
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("copied");
  }, 1500);
});

buildWeekOptions();
loadAll();
</script>
</body>
</html>
`;

const SHEET_ID = "1sC7x0KuTgRVybVoCzeHoJr0lcEGc1RCwCQYoX8TcJgA";
const SEMESTERS = [
  { gid: "808634812", label: "1학기" },
  { gid: "1239717373", label: "2학기" },
];
const CATEGORY_KEYS = ["성 안전", "신변 안전", "교통 안전", "학교생활 안전", "학교폭력·사이버 예방", "계절·행사 안전"];
const CACHE_SECONDS = 300;

// ── 아주 단순한 RFC4180 CSV 파서 (따옴표로 감싼 콤마 포함 필드 처리) ──
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

async function fetchSemester(sem, weeks) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sem.gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${sem.label} 시트를 불러오지 못했어요 (HTTP ${res.status})`);
  let text = await res.text();
  text = text.replace(/^﻿/, "");
  const allRows = parseCsv(text);

  const headerIdx = allRows.findIndex(r => r[0] === "주차");
  if (headerIdx === -1) return;
  const header = allRows[headerIdx];
  const colIdx = {};
  header.forEach((h, i) => { colIdx[h] = i; });

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const r = allRows[i];
    const weekRaw = r[0];
    if (!weekRaw) continue;
    const m = weekRaw.match(/\d+/);
    if (!m) continue;
    const weekNum = parseInt(m[0], 10);
    const item = {};
    CATEGORY_KEYS.forEach(key => {
      const idx = colIdx[key];
      item[key] = (idx != null && r[idx] != null) ? r[idx].trim() : "";
    });
    weeks[weekNum] = item;
  }
}

async function getWeekData() {
  const weeks = {};
  for (const sem of SEMESTERS) {
    await fetchSemester(sem, weeks);
  }
  return weeks;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const method = request.method;

    if ((method === "GET" || method === "HEAD") && (path === "/" || path === "/app.html" || path === "/index.html")) {
      return new Response(APP_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    if (path === "/api/data" && method === "GET") {
      const forceRefresh = url.searchParams.get("refresh") === "1";
      const cache = caches.default;
      const cacheKey = new Request(url.origin + "/api/data-cache-key");

      if (!forceRefresh) {
        const cached = await cache.match(cacheKey);
        if (cached) return cached;
      }

      try {
        const weeks = await getWeekData();
        const response = new Response(JSON.stringify(weeks), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
          },
        });
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
      } catch (e) {
        return new Response(JSON.stringify({ error: e && e.message ? e.message : String(e) }), {
          status: 502,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    }

    return new Response("404", { status: 404 });
  },
};
