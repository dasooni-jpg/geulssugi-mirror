# 안전교육 문구 복사기 + 라운드 좋아요

워커 하나에 수업 도구 두 개가 들어 있습니다.

## 바로 가기 주소

| 도구 | 주소 |
|------|------|
| 안전교육 문구 복사기 | https://safety-edu-copier.dasooni.workers.dev/ |
| 라운드 좋아요 — 교사용 | https://safety-edu-copier.dasooni.workers.dev/vote/teacher |
| 라운드 좋아요 — 학생용 | https://safety-edu-copier.dasooni.workers.dev/vote |

## 안전교육 문구 복사기

주간학습안내를 만들 때 안전교육 문구를 매번 손으로 바꾸는 번거로움을 없애기 위한 도구입니다.
주차(1~42주)를 고르면 [구글시트](https://docs.google.com/spreadsheets/d/1sC7x0KuTgRVybVoCzeHoJr0lcEGc1RCwCQYoX8TcJgA)의 최신 안전교육 문구 6개 항목을 표로 보여주고, 복사 버튼으로 바로 복사해서 한글 표에 붙여넣을 수 있습니다.

## 라운드 좋아요 (수업용 투표)

한 라운드에 학생 한 명이 좋아요를 한 번만 누를 수 있고,
**선생님이 "결과 보기"를 눌렀을 때만** 그 라운드의 좋아요 개수가 화면에 나옵니다(실시간 표시 아님).

### 쓰는 순서

1. 선생님이 교사용 주소를 열고 **라운드 개수(1~20)** 를 정한 뒤 [수업 시작하기]를 누름
2. 화면에 **숫자 4자리 참여 코드**와 **QR**이 뜸. QR을 누르면 전체화면으로 커져 TV·빔에 띄우기 좋음
3. 학생은 QR을 카메라로 찍거나, 학생용 주소에서 코드를 넣고 큰 하트 버튼을 한 번 누름
4. 선생님이 [이번 라운드 결과 보기]를 누르면 그 순간의 좋아요 개수가 크게 표시됨
5. [다음 라운드로] → 학생 화면의 하트가 3초 안에 자동으로 다시 켜짐
6. [수업 끝내기] → 라운드별 결과와 합계가 표로 정리됨

### 알아 둘 점

- **개인정보를 저장하지 않음.** 이름·번호·사진을 받지 않고, 중복 클릭을 막기 위한 임의의 기기 번호만 씁니다.
- 공개한 개수는 **누른 그 시점으로 고정**됩니다. 그 뒤에 학생이 더 눌러도 숫자가 저절로 오르지 않고,
  [지금 개수로 다시 세기]를 눌러야 갱신됩니다.
- 학생 화면에는 개수가 절대 내려가지 않습니다(서버 응답에도 포함하지 않음).
- 방(참여 코드)은 **12시간 뒤 자동으로 사라집니다.** 매 차시 새로 만들어 쓰면 됩니다.
- 교사용 버튼(결과 보기·다음 라운드·끝내기)은 수업을 만든 그 기기에서만 눌립니다.
- QR은 외부 라이브러리 없이 앱 안에서 직접 만듭니다. 학교망에서 CDN이 막혀 있어도 그려집니다.
- 학생 화면은 3초마다 서버에 상태를 물어봅니다. 30명이 40분 수업을 하면 대략 2만~3만 요청으로,
  Cloudflare 무료 플랜 한도(하루 10만 요청) 안에서 하루 서너 차시 정도 쓸 수 있습니다.

## 구조

- `safety-edu-app/app.html` — 안전교육 문구 복사기 화면
- `vote-app/app.html` — 라운드 좋아요 화면 (교사용·학생용이 한 파일). 의존성 없는 QR 생성기(`qrMatrix`)도 여기 있음
- `safety-edu-worker.template.js` — Worker 소스 템플릿 (`__APP_HTML__`, `__VOTE_HTML__` 자리에 위 두 화면이 끼워짐).
  좋아요를 어긋남 없이 세기 위한 Durable Object(`VoteRoom`)도 이 파일 안에 있음
- `safety-edu-worker.js` — 빌드된 실제 배포 파일 (Cloudflare Worker에 이 파일이 그대로 올라감)
- `build-safety-edu-worker.ps1` — 화면을 고친 뒤 위 파일들을 합쳐 `safety-edu-worker.js`를 다시 만드는 스크립트 (Windows PowerShell)
- `build-safety-edu-worker.mjs` — 같은 일을 하는 Node 버전 (`node build-safety-edu-worker.mjs`)
- `wrangler.toml` — Cloudflare Workers 배포 설정 (Durable Object 바인딩 포함)

## 배포 (Cloudflare Workers, GitHub 연동)

이 폴더는 원래 `safety-edu-copier`라는 별도 저장소였고, 지금은 `geulssugi-mirror` 안으로 들어와 있습니다.
`main` 브랜치의 `safety-edu/` 아래가 바뀔 때만 Cloudflare가 자동 배포합니다.

Worker의 **Settings → Builds** 설정값입니다. 나중에 다시 손볼 일이 있으면 이 표와 맞는지 확인하세요.

| 항목 | 값 |
|------|-----|
| Git repository | `dasooni-jpg/geulssugi-mirror` |
| Root directory | `safety-edu` ← 비우면 `wrangler.toml`을 못 찾습니다 |
| Build command | (비움) |
| Deploy command | `npx wrangler deploy` ← `versions upload`이면 빌드는 성공해도 화면이 안 바뀝니다 |
| Production branch | `main` (Builds for non-production branches 해제) |
| Build watch paths → Include | `safety-edu/**` ← 하위 폴더(`vote-app/`)까지 감지하려면 별 두 개 |

`package.json`이 없어 빌드 단계는 없고, 커밋된 `safety-edu-worker.js`를 그대로 올립니다.
Worker 이름은 `wrangler.toml`의 `name = "safety-edu-copier"`로 고정돼 있어 **접속 주소는 바뀌지 않습니다.**

> **Durable Object 안내** — 라운드 좋아요가 들어가면서 `wrangler.toml`에 Durable Object(`VoteRoom`) 설정이
> 추가되었습니다. 대시보드에서는 '새' Durable Object 클래스를 만들 수 없고 `npx wrangler deploy`로만
> 만들어집니다. Deploy command가 위 표대로 `npx wrangler deploy`이면 첫 배포 때 자동으로 생성됩니다.

## 화면을 고칠 때

1. `safety-edu-app/app.html`(안전교육) 또는 `vote-app/app.html`(라운드 좋아요) 수정
2. `powershell -ExecutionPolicy Bypass -File build-safety-edu-worker.ps1` 실행 → `safety-edu-worker.js` 갱신
   (Node가 있으면 `node build-safety-edu-worker.mjs` 로도 같은 결과)
3. 커밋 후 `geulssugi-mirror`의 `main`에 푸시 → 자동 재배포
