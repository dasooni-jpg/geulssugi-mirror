# 🪞 글쓰기 거울 (AI 글쓰기 피드백 수업 앱)

초등 6학년 국어 **「자신의 글쓰기 과정을 살펴봐요」**(2022 개정 교육과정) 수업에서
학생이 *자신의 글쓰기 과정을 스스로 점검·조정*하도록 돕는 패드용 웹앱입니다.

AI는 **글을 대신 고쳐 주지 않습니다.** 잘한 점을 칭찬하고, 스스로 생각할 질문만 던집니다.

## ✨ 주요 기능
- **글쓰기 4단계 여정**: 계획하기 → 초고 쓰기 → AI 피드백 → 돌아보기
- **3색 피드백 카드**: 🟢 잘한 점 / 🟡 다시 볼 곳 / 🔵 생각해 볼 질문
- **고쳐쓰기 + "왜 고쳤나" 메모**, 초고 ↔ 수정본 나란히 비교
- **자기평가 체크리스트 · 성장 배지**
- **교사용 대시보드**: 학급 진행 현황, 학생별 글·피드백 보기, CSV 내보내기

## 🗂 구성
| 파일 | 설명 |
|------|------|
| `app/index.html` | 학생용 화면 |
| `app/teacher.html` | 교사용 대시보드 |
| `server.ps1` | Windows PowerShell 내장 서버 + Claude API 프록시 |
| `apikey.txt.example` | API 키 설정 안내 |

## ▶️ 실행 방법 (Windows)
1. 이 폴더에서 PowerShell로 다음을 실행:
   ```powershell
   powershell -ExecutionPolicy Bypass -File server.ps1
   ```
2. 브라우저에서 접속:
   - 학생용: http://localhost:4173/
   - 교사용: http://localhost:4173/teacher.html

## 🤖 실제 AI 피드백 켜기 (선택)
- `apikey.txt.example` 안내대로 이 폴더에 `apikey.txt`를 만들고 Anthropic API 키를 넣으세요.
- 키가 없으면 자동으로 **규칙 기반 오프라인 피드백**으로 작동합니다.
- 모델은 `server.ps1`의 `$MODEL`에서 바꿀 수 있습니다(기본 `claude-opus-4-8`, 비용 절감은 `claude-haiku-4-5`).

## 🔒 개인정보 보호
- 학생 제출물(`data/`)과 API 키(`apikey.txt`)는 **GitHub에 올라가지 않습니다**(`.gitignore`로 제외).
- 학생은 별명만 입력하며, 개인정보를 수집하지 않습니다.
