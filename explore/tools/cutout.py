# 흰 배경 스프라이트 → 투명 WebP
# 사용: python tools/cutout.py raw img (가장자리에서 흰색 영역 flood fill)
import sys, os, numpy as np
from PIL import Image, ImageFilter
from collections import deque

def cutout(src, dst, thr=34, scale=2):
    im = Image.open(src).convert('RGB')
    im = im.resize((im.width*scale, im.height*scale), Image.LANCZOS)
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    dist = 255*3 - a.sum(axis=2)            # 흰색에서 얼마나 먼가
    sat = a.max(axis=2) - a.min(axis=2)
    bgish = (dist < thr*3) & (sat < 30)
    mask = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h-1):
            if bgish[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if bgish[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and bgish[ny, nx]:
                mask[ny, nx] = True; q.append((ny, nx))
    alpha = Image.fromarray(np.where(mask, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA'); out.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    if bbox: out = out.crop(bbox)
    out.save(dst, 'WEBP', quality=86, method=6)
    print(os.path.basename(dst), out.size)

def greenkey(src, dst):
    im = Image.open(src).convert('RGB'); im = im.resize((im.width*2, im.height*2), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    g = a[:,:,1] - np.maximum(a[:,:,0], a[:,:,2])      # 초록 우세 정도
    alpha = np.clip(255 - (g - 20) * 4, 0, 255)
    rgb = a.copy(); spill = np.clip(g, 0, None)
    rgb[:,:,1] -= spill * 0.9                             # 초록 번짐 제거
    rgb = np.clip(rgb, 0, 255)
    out = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8), 'RGBA')
    out = out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    out.save(dst, 'WEBP', quality=86, method=6); print(os.path.basename(dst), out.size)

if __name__ == '__main__':
    raw, outdir = sys.argv[1], sys.argv[2]
    keep = {'avatar'}   # 배경 유지
    for f in sorted(os.listdir(raw)):
        n = os.path.splitext(f)[0]
        if n == 'cloud':
            greenkey(os.path.join(raw, f), os.path.join(outdir, n+'.webp')); continue
        if n.startswith('t_'):   # 바닥 텍스처: 거울 반복으로 이음새 없는 타일 제작
            im = Image.open(os.path.join(raw, f)).convert('RGB')
            w, h = im.size; t = Image.new('RGB', (w*2, h*2))
            t.paste(im, (0,0)); t.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (w,0))
            t.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0,h)); t.paste(im.transpose(Image.ROTATE_180), (w,h))
            t.save(os.path.join(outdir, n+'.webp'), 'WEBP', quality=86, method=6); print(n, t.size); continue
        if n in keep:
            Image.open(os.path.join(raw, f)).convert('RGB').resize((256,256), Image.LANCZOS).save(os.path.join(outdir, n+'.webp'), 'WEBP', quality=86, method=6); continue
        cutout(os.path.join(raw, f), os.path.join(outdir, n+'.webp'))
