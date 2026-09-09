#!/bin/bash
# 우리 반 카트 그랑프리 — 방 서버 올리기 (맥용)
# 이 파일을 두 번 누르면 터미널이 열리고 자동으로 진행됩니다.

cd "$(dirname "$0")"

echo ""
echo "=========================================================="
echo "   우리 반 카트 그랑프리 - 방 서버 올리기"
echo "=========================================================="
echo ""
echo " 이 창은 끄지 마세요. 다 끝나면 알려 드립니다."
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo " [!] 이 컴퓨터에 Node.js 가 없습니다."
  echo ""
  echo "     https://nodejs.org  에 들어가서 초록 단추(LTS)를 눌러"
  echo "     설치한 뒤, 이 파일을 다시 두 번 누르세요."
  echo ""
  read -n 1 -s -r -p " 아무 키나 누르면 닫힙니다..."
  exit 1
fi

echo " [1/2] 클라우드플레어 로그인 창을 엽니다."
echo "       브라우저가 열리면 파란 [Allow] 단추를 눌러 주세요."
echo ""
if ! npx --yes wrangler@latest login; then
  echo ""
  echo " [!] 로그인에서 멈췄습니다. 이 창의 글자를 복사해 알려 주세요."
  read -n 1 -s -r -p " 아무 키나 누르면 닫힙니다..."
  exit 1
fi

echo ""
echo " [2/2] 서버를 올립니다. 1~2분 걸립니다. 기다려 주세요."
echo ""
if ! npx --yes wrangler@latest deploy; then
  echo ""
  echo " [!] 올리는 중에 멈췄습니다. 이 창의 글자를 복사해 알려 주세요."
  read -n 1 -s -r -p " 아무 키나 누르면 닫힙니다..."
  exit 1
fi

echo ""
echo "=========================================================="
echo "   끝났습니다!"
echo ""
echo "   위에 보이는 https://kart.OOOO.workers.dev 주소를 복사해"
echo "   뒤에  /api/health  를 붙여 브라우저에 넣어 보세요."
echo ""
echo "   예) https://kart.dasooni.workers.dev/api/health"
echo ""
echo '   {"ok":true ...} 가 보이면 성공입니다.'
echo "=========================================================="
echo ""
read -n 1 -s -r -p " 아무 키나 누르면 닫힙니다..."
echo ""
