/*
 * 클라우드플레어 배포 파일 일괄 제작 (Node 18+, 추가 설치 없음)
 * ─────────────────────────────────────────────────────────
 * 정적 앱 폴더마다 아래 파일을 만들어 cloudflare/ 폴더에 넣음.
 *
 *   cloudflare/<폴더>-cloudflare.zip
 *     ├─ 1-읽어보세요.txt
 *     ├─ 방법A-페이지스에-올리기/index.html   ← 그림·스크립트를 모두 품은 한 파일
 *     └─ 방법B-워커에-붙여넣기/<폴더>-worker.js ← 대시보드 편집기에 그대로 붙여넣기
 *
 * 실행:  node build-cloudflare.mjs            (전체)
 *        node build-cloudflare.mjs merge      (한 앱만)
 *
 * 새 앱을 만들면 아래 APPS 목록에 한 줄 추가하고 다시 실행하면 됨.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));

// dir: 앱 폴더 · title: 앱 이름 · worker: 워커 이름(영문 소문자) · inlineDir: JS가 경로로 부르는 그림 폴더
const APPS = [
  { dir: 'merge',       title: '다람 머지 카페',        worker: 'daram-merge', inlineDir: 'assets', inlineVar: 'MERGE_INLINE' },
  { dir: 'typing-rain', title: '타자 연습 (낱말 비)',     worker: 'typing-rain' },
  { dir: 'omok',        title: '다람쌤 오목 대회',        worker: 'daram-omok' },
  { dir: 'chess',       title: '어린이 체스 교실',        worker: 'kids-chess',  note: '온라인 대국 서버(chess-online-worker.js)는 따로 배포해야 함' },
  { dir: 'kart',        title: '우리 반 카트 그랑프리',   worker: 'kart-game',   note: '친구들과 달리기 서버(kart-online-worker.js)는 따로 배포해야 함. 이 워커 이름을 kart 로 하면 서버와 겹치니 다른 이름을 쓸 것' },
  { dir: 'janggi',      title: '다람쌤 장기 한판',        worker: 'janggi' },
];

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const isLocal = (u) => u && !/^(https?:|data:|blob:|#|\/\/|mailto:|javascript:)/i.test(u);
const dataUri = (file) => `data:${MIME[extname(file).toLowerCase()] || 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

// ── HTML 한 파일로 합치기 ──
function inlineApp(app) {
  const base = join(root, app.dir);
  let html = readFileSync(join(base, 'index.html'), 'utf8');
  const missing = [];
  const fileOf = (u) => { const f = join(base, decodeURI(u.split(/[?#]/)[0])); if (!existsSync(f)) { missing.push(u); return null; } return f; };

  // <script src="로컬">
  html = html.replace(/<script([^>]*?)\ssrc=["']([^"']+)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
    if (!isLocal(src)) return m;
    const f = fileOf(src); if (!f) return m;
    return `<script${a}${b}>\n${readFileSync(f, 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  // <link rel="stylesheet" href="로컬">
  html = html.replace(/<link([^>]*?)href=["']([^"']+\.css)["']([^>]*)>/gi, (m, a, href) => {
    if (!isLocal(href)) return m;
    const f = fileOf(href); return f ? `<style>\n${readFileSync(f, 'utf8')}\n</style>` : m;
  });
  // src="로컬 그림" / href="로컬 아이콘"
  html = html.replace(/(\s(?:src|href|poster))=(["'])([^"'${}]+\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg))\2/gi, (m, attr, q, u) => {
    if (!isLocal(u)) return m;
    const f = fileOf(u); return f ? `${attr}=${q}${dataUri(f)}${q}` : m;
  });
  // CSS url(로컬)
  html = html.replace(/url\((["']?)([^)"']+\.(?:png|jpe?g|webp|gif|svg|woff2?|ttf))\1\)/gi, (m, q, u) => {
    if (!isLocal(u)) return m;
    const f = fileOf(u); return f ? `url("${dataUri(f)}")` : m;
  });
  // JS가 경로로 부르는 그림 폴더 → window.<inlineVar> 표
  if (app.inlineDir) {
    const dir = join(base, app.inlineDir), map = {};
    for (const name of readdirSync(dir)) {
      if (!MIME[extname(name).toLowerCase()]) continue;
      map[`${app.inlineDir}/${name}`] = dataUri(join(dir, name));
    }
    const tag = `<script>window.${app.inlineVar} = ${JSON.stringify(map)};</script>\n`;
    html = html.replace(/<script/i, tag + '<script');
  }
  if (missing.length) console.warn(`  ! ${app.dir}: 찾지 못한 파일 ${missing.join(', ')}`);
  return html;
}

// ── 워커 파일 ──
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
function workerJs(app, html) {
  return `/*
 * ${app.title} — Cloudflare Worker (자동 생성본: build-cloudflare.mjs)
 * ──────────────────────────────────────────────
 * 화면 하나짜리 앱이라 이 워커는 화면(HTML)을 내려 주기만 함.
 * 데이터베이스·비밀키·설정이 필요 없음. 학생 기록은 각 기기에만 저장됨.
 *
 * 올리는 법:
 *  1. Cloudflare 대시보드 → Workers & Pages → Create → Worker 만들기 (이름 예: ${app.worker})
 *  2. Edit code 를 눌러 기존 내용을 모두 지우고 이 파일 내용을 그대로 붙여넣기 → Deploy
 *  3. 주소: https://${app.worker}.<계정이름>.workers.dev
 */

const APP_HTML = \`${esc(html)}\`;

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
    return new Response(APP_HTML, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' }
    });
  }
};
`;
}

function readme(app, kb) {
  return `${app.title} — 클라우드플레어에 올리기
==========================================

이 압축 파일에는 같은 앱이 두 가지 방법으로 들어 있음. 편한 쪽 하나만 쓰면 됨.
그림·소리·스크립트가 모두 파일 하나에 들어 있어 따로 올릴 파일이 없음. (크기 약 ${kb} KB)

[방법 A] Pages 에 올리기 (가장 쉬움, 권장)
 1. https://dash.cloudflare.com 로그인
 2. Workers & Pages → Create → Pages 탭 → "Upload assets"(직접 업로드)
 3. 프로젝트 이름 입력 (예: ${app.worker})
 4. "방법A-페이지스에-올리기" 폴더를 통째로 끌어다 놓기 → Deploy
 5. 주소: https://${app.worker}.pages.dev
 ※ 고친 뒤에는 같은 프로젝트에서 "Create new deployment" 로 다시 올리면 됨

[방법 B] Worker 에 붙여넣기
 1. Workers & Pages → Create → Worker 만들기 (이름 예: ${app.worker}) → Deploy
 2. Edit code 클릭 → 기존 코드를 모두 지우기
 3. "방법B-워커에-붙여넣기" 폴더의 ${app.dir}-worker.js 내용을 전부 붙여넣기 → Deploy
 4. 주소: https://${app.worker}.<계정이름>.workers.dev

[확인]
 - 주소를 열었을 때 앱 첫 화면이 보이면 성공
 - 학생 기록은 각 기기(브라우저)에만 저장되며 서버로 보내지 않음
${app.note ? `\n[참고]\n - ${app.note}\n` : ''}
이 파일은 저장소의 build-cloudflare.mjs 가 자동으로 만든 것임.
앱을 고친 뒤에는 "node build-cloudflare.mjs ${app.dir}" 로 다시 만들 것.
`;
}

// ── 아주 작은 ZIP 작성기 (한글 파일 이름 UTF-8) ──
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(entries) {
  const parts = [], central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8'), raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const comp = deflateRawSync(raw, { level: 9 }), crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cenBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}

// ── 실행 ──
const only = process.argv.slice(2);
const outDir = join(root, 'cloudflare');
mkdirSync(outDir, { recursive: true });
for (const app of APPS) {
  if (only.length && !only.includes(app.dir)) continue;
  if (!existsSync(join(root, app.dir, 'index.html'))) { console.warn(`건너뜀: ${app.dir}/index.html 없음`); continue; }
  const html = inlineApp(app), worker = workerJs(app, html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  if (Buffer.byteLength(worker) > 2.8 * 1024 * 1024) console.warn(`  ! ${app.dir}: 워커 파일이 커서 무료 요금제 한도(3MB)에 가까움 → 방법 A 권장`);
  const folder = `${app.dir}-클라우드플레어에-올리기`;
  const file = join(outDir, `${app.dir}-cloudflare.zip`);
  writeFileSync(file, zip([
    { name: `${folder}/1-읽어보세요.txt`, data: readme(app, kb) },
    { name: `${folder}/방법A-페이지스에-올리기/index.html`, data: html },
    { name: `${folder}/방법B-워커에-붙여넣기/${app.dir}-worker.js`, data: worker },
  ]));
  console.log(`OK  ${app.dir.padEnd(12)} → cloudflare/${app.dir}-cloudflare.zip  (화면 ${kb} KB, zip ${Math.round(statSync(file).size / 1024)} KB)`);
}
