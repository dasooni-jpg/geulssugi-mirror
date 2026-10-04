# 그림(캔바) 교체 방법

게임 그림은 캔바 AI 이미지로 제작함. `tools/sheets/` 에 시트 원본을 두고 아래 명령으로 잘라 씀.

```
python3 tools/slice_sheets.py tools/sheets
```

- 결과: `assets/<계열>-<등급>.png`, `assets/face-N.png`, `assets/avatar.png`, `assets/bg.jpg`, `assets/manifest.js`
- 그림이 없는 아이템은 자동으로 이모지로 표시됨
- 필요: `pip install pillow numpy scipy`

## 현재 시트는 미리보기 해상도(약 200px)임
작업 환경 네트워크가 캔바 다운로드를 막아 미리보기 크기로 잘라 넣었음.
캔바에서 아래 이미지를 원본 크기로 내려받아 같은 파일 이름으로 `tools/sheets/` 에 덮어쓴 뒤
명령을 다시 실행하면 선명한 그림으로 바뀜.

| 파일 이름 | 내용 | 캔바 이미지 |
|---|---|---|
| fruit | 과일 8단계 | https://www.canva.com/M/MAHXFh_K8Mk |
| drink | 음료 6단계 | https://www.canva.com/M/MAHXFgv1LsE |
| bread | 빵 9단계 | https://www.canva.com/M/MAHXFiQK1eI |
| dessert | 디저트 8단계 | https://www.canva.com/M/MAHXFkzEV_Q |
| flower | 꽃 9단계 | https://www.canva.com/M/MAHXFgqsAwg |
| mixer | 믹서 생성기 6단계 | https://www.canva.com/M/MAHXFs6boFk |
| oven | 오븐 생성기 6단계 | https://www.canva.com/M/MAHXFmDpcBE |
| cart | 꽃 수레 6단계 | https://www.canva.com/M/MAHXFnfcHgQ |
| res | 번개 5 + 동전 5 | https://www.canva.com/M/MAHXFkOqgsA |
| catgem | 고양이 3 + 다람쥐 + 보석 4 | https://www.canva.com/M/MAHXFo7t8J8 |
| faces | 손님 12명 | https://www.canva.com/M/MAHXFoq8fJQ |
| bg | 카페 배경 | https://www.canva.com/M/MAHXFqFuXEY |
