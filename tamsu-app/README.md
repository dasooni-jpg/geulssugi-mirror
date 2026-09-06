# 🦦 탐수학 — app.html (저장소 사본)

이 폴더는 탐수학 앱의 **화면·게임 로직 전체가 담긴 `app.html`** 사본임.
원본 작업 폴더는 선생님 PC(구글 드라이브 동기화)의 `tamsu-app/` 이며, 이 저장소는
Claude 가 코드를 직접 고칠 수 있도록 `app.html` 만 함께 두는 용도임.

## 이 폴더에 있는 것
| 파일 | 설명 |
|------|------|
| `app.html` | 앱 전체 (단일 파일, 외부 라이브러리 없음) |

## 빌드·배포 (선생님 PC에서 진행)
1. 이 저장소의 `tamsu-app/app.html` 을 PC 작업 폴더의 `tamsu-app/app.html` 자리에 덮어씀
2. `powershell -ExecutionPolicy Bypass -File build-tamsu-worker.ps1` 실행
   → `app.html` + `tamsu-app/items/*` + `tamsu-worker.template.js` 를 합쳐 `tamsu-app/tamsu-worker.js` 생성
3. `tamsu-worker.js` 전체를 Cloudflare Worker 편집기에 붙여넣고 **Deploy**

> `tamsu-worker.js` 는 자동 생성물이므로 직접 고치지 않음.
> 워커 템플릿(`tamsu-worker.template.js`)과 아이템 그림(`tamsu-app/items/`)은 이 저장소에 두지 않았으므로,
> 빌드는 반드시 PC 작업 폴더에서 진행함.

## 검증
- `_test.html` (PC 작업 폴더) 을 로컬 서버로 열어 문제 생성기 회귀 검사를 돌림
