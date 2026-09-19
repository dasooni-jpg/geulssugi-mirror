/*
 * janggi-worker.js 빌드 스크립트 (Node, 윈도우/맥/리눅스 공통)
 *   janggi/index.html + janggi-worker.template.js → janggi-worker.js
 *
 * 실행:  node build-janggi-worker.mjs   (janggi 폴더 안에서)
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// 템플릿 리터럴(백틱 문자열) 안에 안전하게 넣기 위한 이스케이프
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let out = read("janggi-worker.template.js");
const token = "__APP_HTML__";
if (!out.includes(token)) throw new Error(`템플릿에 ${token} 자리가 없습니다.`);
out = out.replace(token, "`" + esc(read("index.html")) + "`");

const dest = join(root, "janggi-worker.js");
writeFileSync(dest, out, "utf8");
console.log(`OK: ${dest} (${Math.round(statSync(dest).size / 1024)} KB)`);
