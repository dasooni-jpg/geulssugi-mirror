# 이 저장소에서 Claude가 지킬 규칙

## 1. 모든 앱은 Cloudflare 배포 파일까지 만들어야 완료임
- 새 앱을 만들거나 기존 앱을 고치면 `build-cloudflare.mjs` 의 `APPS` 목록에 등록하고 다시 실행함.
  ```
  node build-cloudflare.mjs          # 전체
  node build-cloudflare.mjs <폴더>   # 한 앱만
  ```
- 결과물 `cloudflare/<폴더>-cloudflare.zip` 을 함께 커밋함. zip 안에는 다음이 들어감.
  - `1-읽어보세요.txt` (비전공자용 올리는 순서)
  - `방법A-페이지스에-올리기/index.html` (그림·스크립트를 모두 품은 한 파일)
  - `방법B-워커에-붙여넣기/<폴더>-worker.js` (대시보드 편집기에 붙여넣기)
- JS가 경로를 조립해 그림을 부르는 앱은 `inlineDir` 를 지정하고, 앱 코드에서 `window.<inlineVar>[경로] || 경로` 로 읽게 만듦 (예: `merge/index.html` 의 `A()` 함수).
- 서버(DB·실시간 방)가 필요한 앱은 화면용 zip 과 별도로 Worker 파일·`wrangler.toml` 을 만들고 README 에 배포 순서를 적음.
- 검증: 워커 파일 `node --check`, 방법A 파일을 브라우저로 열어 깨진 그림 0개 확인.

## 2. 새 폴더는 `.gitignore` 허용목록에 추가
`.gitignore` 가 `/*` 로 전부 막고 `!/폴더/` 로 여는 방식임. 새 폴더를 만들면 반드시 `!/폴더/` 를 추가함.

## 3. 학생 개인정보 저장 금지
실명·사진·연락처를 저장하지 않음. 식별은 별명(또는 출석번호)만. 기록은 기기 브라우저에만 저장.
