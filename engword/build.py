#!/usr/bin/env python3
# ─────────────────────────────────────────────────────────────
#  매일 영단어 30 — 윈도우가 아닌 곳에서 쓰는 빌드 스크립트
#  engword-app/app.html + engword-worker.template.js → engword-worker.js
#  build-engword-worker.ps1 과 바이트까지 같은 결과를 낸다.
#  실행:  python3 build.py
# ─────────────────────────────────────────────────────────────
import pathlib, shutil

root = pathlib.Path(__file__).resolve().parent
app = (root / "engword-app" / "app.html").read_text(encoding="utf-8")
tpl = (root / "engword-worker.template.js").read_text(encoding="utf-8")

# JS 템플릿 리터럴 안에 넣기 위한 escape
app = app.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

out = tpl.replace("__APP_HTML__", "`" + app + "`")
dest = root / "engword-worker.js"
dest.write_text(out, encoding="utf-8", newline="")
shutil.copyfile(dest, root / "engword-app" / "_worker.js")   # 브라우저 테스트용 사본
print(f"OK: {dest.name} ({dest.stat().st_size:,} bytes)")
print("-> 이 파일 전체를 Cloudflare Worker 편집기에 붙여넣고 Deploy")
