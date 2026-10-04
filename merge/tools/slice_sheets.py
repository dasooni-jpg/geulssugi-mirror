"""캔바로 만든 아이콘 시트를 아이콘 한 장씩 잘라 assets/ 에 저장함.

사용법: python3 tools/slice_sheets.py <시트폴더>
시트 파일 이름(확장자 png/jpg 무관): fruit, drink, bread, dessert, flower,
mixer, oven, cart, res, catgem, faces, bg
흰 배경을 투명하게 바꾸고, 격자 칸마다 물체를 찾아 정사각형 PNG로 저장함.
"""
import sys, os, glob, json
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('ART_OUT') or os.path.join(HERE, '..', 'assets')
SIZE = 128

def seq(chain, n, start=1):
    return [f'{chain}-{i}' for i in range(start, start + n)]

SHEETS = {
    'fruit':   (4, 2, seq('fruit', 8)),
    'drink':   (3, 2, seq('drink', 6)),
    'bread':   (3, 3, seq('bread', 9)),
    'dessert': (4, 2, seq('dessert', 8)),
    'flower':  (3, 3, seq('flower', 9)),
    'mixer':   (3, 2, seq('mixer', 6)),
    'oven':    (3, 2, seq('oven', 6)),
    'cart':    (3, 2, seq('cart', 6)),
    'res':     (5, 2, seq('energy', 5) + seq('coin', 5)),
    'catgem':  (4, 2, seq('cat', 3) + ['avatar'] + seq('gem', 4)),
    'faces':   (4, 3, seq('face', 12)),
}

def cut_background(rgb):
    """테두리와 이어진 흰색 영역만 투명 처리 (물체 안의 흰색은 유지)."""
    a = rgb.astype(int)
    white = (a.min(axis=2) > 232) & ((a.max(axis=2) - a.min(axis=2)) < 22)
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg = ndimage.binary_opening(bg, iterations=1)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # 가장자리 부드럽게
    soft = ndimage.gaussian_filter(alpha.astype(float), 0.8)
    return np.clip(soft, 0, 255).astype(np.uint8)

def slice_sheet(path, cols, rows, names):
    im = Image.open(path).convert('RGB')
    rgb = np.array(im)
    H, W = rgb.shape[:2]
    alpha = cut_background(rgb)
    fg = alpha > 40
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(fg, lab, range(1, n + 1))
    cells = {}
    min_area = (W * H) / (cols * rows) * 0.004
    for k, sl in enumerate(objs):
        if sl is None or sizes[k] < min_area:
            continue
        cy, cx = ndimage.center_of_mass(fg, lab, k + 1)
        ci = min(cols - 1, int(cx / W * cols)) + cols * min(rows - 1, int(cy / H * rows))
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if ci in cells:
            a = cells[ci]
            cells[ci] = [min(a[0], y0), max(a[1], y1), min(a[2], x0), max(a[3], x1), a[4] + [k + 1]]
        else:
            cells[ci] = [y0, y1, x0, x1, [k + 1]]
    rgba = np.dstack([rgb, alpha])
    made = []
    for ci, name in enumerate(names):
        if ci in cells:
            y0, y1, x0, x1, labels = cells[ci]
            crop = rgba[y0:y1, x0:x1].copy()
            keep = np.isin(lab[y0:y1, x0:x1], labels)
            crop[..., 3] = np.where(keep, crop[..., 3], 0)
        else:
            # 물체끼리 붙어 있으면 격자 칸을 그대로 잘라 씀
            r, c = divmod(ci, cols)
            y0, y1 = r * H // rows, (r + 1) * H // rows
            x0, x1 = c * W // cols, (c + 1) * W // cols
            crop = rgba[y0:y1, x0:x1].copy()
            ys, xs = np.nonzero(crop[..., 3] > 40)
            if len(ys) == 0:
                print(f'  ! {name}: 물체를 찾지 못함')
                continue
            crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            print(f'  · {name}: 격자 칸으로 잘라 냄')
        h, w = crop.shape[:2]
        side = int(max(h, w) * 1.06)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(Image.fromarray(crop, 'RGBA'), ((side - w) // 2, (side - h) // 2))
        canvas.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{name}.png'), optimize=True)
        made.append(name)
    return made

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(OUT, exist_ok=True)
    art = {}
    found = {os.path.splitext(os.path.basename(p))[0]: p for p in glob.glob(os.path.join(src, '*')) if p.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))}
    for key, (cols, rows, names) in SHEETS.items():
        if key not in found:
            continue
        print(f'{key}: {found[key]}')
        for name in slice_sheet(found[key], cols, rows, names):
            if name == 'avatar':
                art['avatar'] = 1
                continue
            chain, lvl = name.rsplit('-', 1)
            art[chain] = max(art.get(chain, 0), int(lvl))
    if 'bg' in found:
        im = Image.open(found['bg']).convert('RGB')
        im.thumbnail((960, 960))
        im.save(os.path.join(OUT, 'bg.jpg'), quality=85)
        art['bg'] = 1
    # 등급은 1부터 빠짐없이 있어야 하므로 연속 구간만 인정
    for chain in list(art):
        if chain in ('bg', 'avatar'):
            continue
        n = 0
        while os.path.exists(os.path.join(OUT, f'{chain}-{n + 1}.png')):
            n += 1
        art[chain] = n
    with open(os.path.join(OUT, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write('// 캔바 그림 목록 (tools/slice_sheets.py 가 자동 생성)\n')
        f.write('window.MERGE_ART = ' + json.dumps(art, ensure_ascii=False) + ';\n')
    print('manifest:', art)

if __name__ == '__main__':
    main()
