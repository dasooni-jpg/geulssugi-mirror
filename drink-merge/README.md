# 🥤 다람쌤 음료 카페 (잔 합치기 퍼즐)

테이블 아래에서 잔을 밀어 넣어 같은 음료끼리 붙이면 한 단계 위 음료로 합쳐지는 쉬는시간 게임입니다.
주문서와 같은 음료를 만들면 배달되고 코인을 받습니다.

## 파일

| 파일 | 설명 |
|------|------|
| `index.html` | 게임 전체 (HTML·CSS·JS·그림이 모두 이 한 파일에 들어 있음) |
| `mascot.png` | 화면 왼쪽 위 마스코트 |
| `wrangler.toml` | Cloudflare Workers 자동배포용 설정 (드래그 업로드 시에는 불필요) |
| `.assetsignore` | 배포할 때 위 두 설정 파일을 웹에 올리지 않도록 제외 |

외부 서버·데이터베이스·API 키가 전혀 필요 없는 **완전 정적 페이지**입니다.
인터넷 연결은 글꼴(Google Fonts)에만 쓰이고, 연결이 없으면 기본 글꼴로 자동 대체됩니다.

## 그냥 해보기 (배포 없이)

`index.html`을 더블클릭하면 브라우저에서 바로 실행됩니다.

## Cloudflare에 올리기

### 방법 A — 드래그 앤 드롭 (권장, 계정만 있으면 2분)

1. Cloudflare 대시보드 → **Workers & Pages → Create → Pages → Upload assets**
2. 프로젝트 이름 입력 (예: `drink-merge`)
3. **`drink-merge` 폴더를 통째로 끌어다 놓기** (또는 폴더를 zip으로 압축해 올리기)
4. Deploy → `프로젝트이름.pages.dev` 주소가 나옴

> 파일을 고칠 때마다 같은 화면에서 새로 올리면 됩니다. git 설정이 필요 없습니다.

### 방법 B — GitHub 연동 자동배포 (`safety-edu`와 같은 방식)

`main` 브랜치의 `drink-merge/` 아래가 바뀔 때 자동 배포됩니다.
Worker의 **Settings → Builds** 값을 아래와 같이 맞춥니다.

| 항목 | 값 |
|------|-----|
| Git repository | `dasooni-jpg/geulssugi-mirror` |
| Root directory | `drink-merge` ← 비우면 `wrangler.toml`을 못 찾습니다 |
| Build command | (비움) |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |
| Build watch paths → Include | `drink-merge/*` ← 다른 도구를 고칠 때 빌드가 도는 것을 막습니다 |

- 접속 주소는 `wrangler.toml`의 `name = "drink-merge"`를 따릅니다. 주소를 바꾸려면 이 이름을 바꿉니다.
- `safety-edu` Worker는 watch paths가 `safety-edu/*`이므로 이 폴더를 고쳐도 함께 배포되지 않습니다.
