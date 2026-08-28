# 안전교육 문구 복사기

주간학습안내를 만들 때 안전교육 문구를 매번 손으로 바꾸는 번거로움을 없애기 위한 도구입니다.
주차(1~42주)를 고르면 [구글시트](https://docs.google.com/spreadsheets/d/1sC7x0KuTgRVybVoCzeHoJr0lcEGc1RCwCQYoX8TcJgA)의 최신 안전교육 문구 6개 항목을 표로 보여주고, 복사 버튼으로 바로 복사해서 한글 표에 붙여넣을 수 있습니다.

## 구조

- `safety-edu-app/app.html` — 화면 (프론트엔드)
- `safety-edu-worker.template.js` — Cloudflare Worker 소스 템플릿 (`__APP_HTML__` 자리에 app.html이 끼워짐)
- `safety-edu-worker.js` — 빌드된 실제 배포 파일 (Cloudflare Worker에 이 파일이 그대로 올라감)
- `build-safety-edu-worker.ps1` — app.html을 고친 뒤 위 두 파일을 합쳐 `safety-edu-worker.js`를 다시 만드는 스크립트 (Windows PowerShell 필요)
- `wrangler.toml` — Cloudflare Workers 배포 설정

## 배포 (Cloudflare Workers, GitHub 연동)

Cloudflare 대시보드 → Workers & Pages → Create → "Import a repository" 에서 이 저장소를 연결하면,
`main` 브랜치에 푸시할 때마다 `wrangler.toml` 설정대로 자동 배포됩니다. 별도 빌드 명령 없이 `safety-edu-worker.js`를 그대로 올립니다.

## 화면(app.html)을 고칠 때

1. `safety-edu-app/app.html` 수정
2. `powershell -ExecutionPolicy Bypass -File build-safety-edu-worker.ps1` 실행 → `safety-edu-worker.js` 갱신
3. 커밋 후 `main`에 푸시 → 자동 재배포
