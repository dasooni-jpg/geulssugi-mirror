# 사용: python split.py 원본.jpg 열수 행수 이름1 이름2 ...  → raw/이름.jpg (칸마다 한 장)
# 한 장에 여러 아이콘을 받아 나눌 때 씀(Canva 생성 횟수 절약). 왼쪽 위부터 가로로 차례대로.
import sys, os
from PIL import Image
base = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(base)
src, cols, rows, names = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
im = Image.open(src).convert('RGB'); W, H = im.size; cw, ch = W // cols, H // rows
for k, n in enumerate(names):
    c, r = k % cols, k // cols
    cell = im.crop((c*cw, r*ch, (c+1)*cw, (r+1)*ch))
    cell.save(os.path.join(root, 'raw', n + '.jpg'), quality=95); print(n, cell.size)
