# 그림(캔바) 교체 방법

게임 그림은 캔바 AI 이미지로 제작함(모두 새로 만든 그림). `tools/sheets/` 에 시트를 두고 아래 명령으로 잘라 씀.

```
pip install pillow numpy scipy
python3 tools/slice_sheets.py tools/sheets
node ../build-cloudflare.mjs merge     # Cloudflare 배포 파일 다시 만들기
```

- 시트 한 장 = 아이콘 4개(2×2). 어떤 아이콘이 들어가는지는 `slice_sheets.py` 의 `SHEETS` 표에 있음
- 결과: `assets/*.webp` 와 `assets/manifest.js`. 그림이 없는 아이템은 자동으로 이모지로 표시됨
- 작업 환경 네트워크가 캔바 원본 다운로드를 막아, 시트는 미리보기(200px)를 씀. 아이콘 하나당 약 90px임

## 더 선명하게 바꾸려면
캔바에서 아래 이미지를 원본으로 내려받아 같은 이름(q01.jpg …)으로 `tools/sheets/` 에 덮어쓰고 명령을 다시 실행함.

| 시트 | 캔바 | 시트 | 캔바 | 시트 | 캔바 |
|---|---|---|---|---|---|
| q01 | MAHXFv_QCUo | q11 | MAHXFp5tcBw | q21 | MAHXF_7CijI |
| q02 | MAHXFjCnONY | q12 | MAHXFtVunKM | q22 | MAHXFxloPjU |
| q03 | MAHXFl56ubQ | q13 | MAHXF9wwspU | q23 | MAHXF2mV6Og |
| q04 | MAHXFgQrOO0 | q14 | MAHXFxPUWHM | q24 | MAHXF7Wj78E |
| q05 | MAHXFhTVDGU | q15 | MAHXF0LJffI | q25 | MAHXFz7yy_c |
| q06 | MAHXFqsN-OA | q16 | MAHXF_8fc9Q | q26 | MAHXF87NAdY |
| q07 | MAHXFk3oXOo | q17 | MAHXF4An1n4 | q27 | MAHXF9YR7kQ |
| q08 | MAHXFjzhHbE | q18 | MAHXF-jpows | q28 | MAHXF57O0nE |
| q09 | MAHXFiNnvNY | q19 | MAHXF2GBB18 | q29 | MAHXF_g_Cpo |
| q10 | MAHXFl9LibQ | q20 | MAHXF3PyDHk | q30 | MAHXF1lh29Y |
| bg | MAHXFqFuXEY | | | | |

주소 형식: `https://www.canva.com/M/<캔바 ID>`
