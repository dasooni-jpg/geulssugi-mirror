/*
 * ebook-worker.js 빌드 스크립트 (Node, 윈도우/맥/리눅스 공통)
 *   ebook/index.html + ebook-worker.template.js → ebook-worker.js
 *
 * 실행:  node build-ebook-worker.mjs   (ebook 폴더 안에서)
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// 템플릿 리터럴(백틱 문자열) 안에 안전하게 넣기 위한 이스케이프
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let out = read("ebook-worker.template.js");
const token = "__APP_HTML__";
if (!out.includes(token)) throw new Error(`템플릿에 ${token} 자리가 없습니다.`);
// 함수 형태로 바꿔 넣어야 본문의 $$·$& 같은 글자가 특수 기호로 해석되지 않음
out = out.replace(token, () => "`" + esc(read("index.html")) + "`");

const dest = join(root, "ebook-worker.js");
writeFileSync(dest, out, "utf8");
console.log(`OK: ${dest} (${Math.round(statSync(dest).size / 1024)} KB)`);
