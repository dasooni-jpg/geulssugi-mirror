/*
 * daram-squad-worker.js 빌드 스크립트 (Node, 윈도우/맥/리눅스 공통)
 *   index.html + mascot.png + daram-squad-worker.template.js → daram-squad-worker.js
 *
 * 실행:  node build-daram-squad-worker.mjs   (daram-squad 폴더 안에서)
 */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

// 템플릿 리터럴(백틱 문자열) 안에 안전하게 넣기 위한 이스케이프
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let out = read("daram-squad-worker.template.js");
for (const token of ["__APP_HTML__", "__MASCOT_B64__"]) {
  if (!out.includes(token)) throw new Error(`템플릿에 ${token} 자리가 없습니다.`);
}
// 치환할 내용 안의 `$` 가 특수 문자로 해석되지 않도록 함수 꼴로 넣음
out = out.replace("__APP_HTML__", () => "`" + esc(read("index.html")) + "`");
out = out.replace("__MASCOT_B64__", () => readFileSync(join(root, "mascot.png")).toString("base64"));

const dest = join(root, "daram-squad-worker.js");
writeFileSync(dest, out, "utf8");
console.log(`OK: ${dest} (${Math.round(statSync(dest).size / 1024)} KB)`);
