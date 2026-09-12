# 매일 영단어 30 (engvoca10) — 소스 미러

초등 1~6학년 · 중등 · 고등 · 성인 · 교실영어(교사) 학생이 매일 영단어를 공부하는 웹앱.
배포 주소: <https://engvoca10.dasooni.workers.dev/>

Cloudflare Worker + D1 + Google Gemini 로 돌아간다.
원본 작업 폴더는 로컬(구글드라이브 `claude-code/engword`)에 있고,
이 저장소에는 **워커를 빌드·배포·검증하는 데 필요한 파일**만 담았다.
스티커 그림(`engword-app/card/`)은 워커에 심지 않으므로 로컬 폴더에만 있다.

## 구성

| 파일 | 설명 |
|------|------|
| `engword-app/app.html` | 앱 화면 전체 (단일 파일) |
| `engword-worker.template.js` | Cloudflare Worker 원본 (D1 + AI + 친구/쪽지 API) |
| `engword-worker.js` | 빌드 결과 — **이 파일 전체를 Cloudflare Worker 편집기에 붙여넣고 Deploy** |
| `engword-app/_worker.js` | 위 파일의 사본 (브라우저 테스트용) |
| `engword-app/_test.html` | 서버 API 자동 테스트 (가짜 D1·가짜 AI) |
| `engword-app/_ui.html` | 배포 없이 화면만 보는 미리보기 |
| `build-engword-worker.ps1` | 윈도우용 빌드 스크립트 |
| `build.py` | 윈도우가 아닌 곳에서 쓰는 빌드 스크립트 (결과 동일) |
| `engword-server.ps1` | 테스트·미리보기용 로컬 정적 서버 (포트 4220) |

## 빌드

화면(`engword-app/app.html`)이나 서버 코드(`engword-worker.template.js`)를 고친 뒤:

```powershell
powershell -ExecutionPolicy Bypass -File build-engword-worker.ps1
```

```bash
python3 build.py          # 윈도우가 아닌 곳
```

두 방식은 **바이트까지 같은 결과**를 낸다(검증 완료).

## 검증

```powershell
powershell -ExecutionPolicy Bypass -File engword-server.ps1
```

- <http://localhost:4220/_test.html> — 서버 API 자동 테스트. **전부 PASS 여야 한다.**
- <http://localhost:4220/_ui.html> — 배포 없이 화면만 눌러 보기.

## ⚠️ 빌드 결과와 템플릿이 어긋나지 않게

`engword-worker.js` 는 `engword-worker.template.js` 에서 만들어진다.
Cloudflare 편집기에서 직접 고치고 템플릿에 반영하지 않으면 **다음 빌드 때 그 수정이 사라진다.**
고칠 일이 생기면 반드시 템플릿을 고치고 다시 빌드한다.
