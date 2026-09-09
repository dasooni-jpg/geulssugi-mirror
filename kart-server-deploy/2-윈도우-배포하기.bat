@echo off
title 카트 그랑프리 방 서버 올리기
cd /d "%~dp0"

echo.
echo ==========================================================
echo    우리 반 카트 그랑프리 - 방 서버 올리기
echo ==========================================================
echo.
echo  이 창은 끄지 마세요. 다 끝나면 알려 드립니다.
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

echo  [1/2] 클라우드플레어 로그인 창을 엽니다.
echo        브라우저가 열리면 파란 [Allow] 단추를 눌러 주세요.
echo        (이미 로그인되어 있으면 그냥 지나갑니다)
echo.
call npx --yes wrangler@latest login
if errorlevel 1 goto fail

echo.
echo  [2/2] 서버를 올립니다. 1~2분 걸립니다. 기다려 주세요.
echo.
call npx --yes wrangler@latest deploy
if errorlevel 1 goto fail

echo.
echo ==========================================================
echo    끝났습니다!
echo.
echo    위에 보이는 https://kart.OOOO.workers.dev 주소를 복사해
echo    뒤에  /api/health  를 붙여 브라우저에 넣어 보세요.
echo.
echo    예) https://kart.dasooni.workers.dev/api/health
echo.
echo    {"ok":true ...} 가 보이면 성공입니다.
echo ==========================================================
echo.
pause
exit /b 0

:nonode
echo.
echo  [!] 이 컴퓨터에 Node.js 가 없습니다.
echo.
echo      https://nodejs.org  에 들어가서 왼쪽 초록 단추(LTS)를 눌러
echo      설치한 뒤, 이 파일을 다시 두 번 누르세요.
echo      설치할 때 나오는 선택은 모두 [Next] 로 두면 됩니다.
echo.
pause
exit /b 1

:fail
echo.
echo  [!] 도중에 멈췄습니다.
echo      이 창에 보이는 글자를 그대로 복사해서 알려 주세요.
echo      (마우스로 긁고 엔터를 누르면 복사됩니다)
echo.
pause
exit /b 1
