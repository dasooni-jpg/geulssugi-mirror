/*
 * 다람 탐험대 빌드 스크립트 (Node, 윈도우/맥/리눅스 공통)
 *   index.html + img/*.webp → dist/index.html  (그림을 넣은 한 파일짜리)
 *   dist/index.html + explore-worker.template.js → explore-worker.js
 *
 * 실행:  node build-explore.mjs   (explore 폴더 안에서)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const kb = (p) => Math.round(statSync(p).size / 1024) + " KB";

// 1) 그림을 data: 주소로 바꿔 IMG_DATA 로 넣기
const imgs = {};
for (const f of readdirSync(join(root, "img")).filter((f) => f.endsWith(".webp")).sort()) {
  imgs[f.replace(/\.webp$/, "")] = "data:image/webp;base64," + readFileSync(join(root, "img", f)).toString("base64");
}
let html = read("index.html");
const anchor = "<script>\n'use strict';";
if (!html.includes(anchor)) throw new Error("index.html 에서 본 스크립트 시작 부분을 찾지 못했습니다.");
html = html.replace(anchor, `<script>window.IMG_DATA=${JSON.stringify(imgs)};</script>\n` + anchor);
mkdirSync(join(root, "dist"), { recursive: true });
const single = join(root, "dist", "index.html");
writeFileSync(single, html, "utf8");

// 2) 워커 파일 만들기 (템플릿 리터럴 안에 안전하게 넣기)
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
let out = read("explore-worker.template.js");
if (!out.includes("__APP_HTML__")) throw new Error("템플릿에 __APP_HTML__ 자리가 없습니다.");
out = out.replace("__APP_HTML__", () => "`" + esc(html) + "`");
const dest = join(root, "explore-worker.js");
writeFileSync(dest, out, "utf8");

console.log(`OK: 그림 ${Object.keys(imgs).length}장`);
console.log(`OK: ${single} (${kb(single)})`);
console.log(`OK: ${dest} (${kb(dest)})`);
