"""캔바로 만든 아이콘 시트를 아이콘 한 장씩 잘라 assets/ 에 저장함.

사용법: python3 tools/slice_sheets.py <시트폴더>
시트 파일 이름(확장자 png/jpg 무관): q01 ~ q30 (2×2 시트), bg (배경)
각 시트에 들어갈 아이콘은 아래 SHEETS 표에 있음
흰 배경을 투명하게 바꾸고, 격자 칸마다 물체를 찾아 정사각형 PNG로 저장함.
"""
import sys, os, glob, json
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('ART_OUT') or os.path.join(HERE, '..', 'assets')
SIZE = 144

def seq(chain, n, start=1):
    return [f'{chain}-{i}' for i in range(start, start + n)]

def q(*names):
    return (2, 2, list(names))

# 캔바 시트 한 장 = 아이콘 4개 (2×2). 미리보기(200px)로도 아이콘당 약 90px 확보
SHEETS = {
    'q01': q(*seq('fruit', 4)),            'q02': q(*seq('fruit', 4, 5)),
    'q03': q(*seq('drink', 4)),            'q04': q('drink-5', 'drink-6', 'gem-1', 'gem-2'),
    'q05': q(*seq('bread', 4)),            'q06': q(*seq('bread', 4, 5)),
    'q07': q('bread-9', 'gem-3', 'gem-4', 'avatar'),
    'q08': q(*seq('dessert', 4)),          'q09': q(*seq('dessert', 4, 5)),
    'q10': q(*seq('flower', 4)),           'q11': q(*seq('flower', 4, 5)),
    'q12': q('flower-9', 'cat-1', 'cat-2', 'cat-3'),
    'q13': q(*seq('mixer', 4)),            'q14': q('mixer-5', 'mixer-6', 'oven-1', 'oven-2'),
    'q15': q(*seq('oven', 4, 3)),          'q16': q(*seq('cart', 4)),
    'q17': q('cart-5', 'cart-6', 'energy-1', 'energy-2'),
    'q18': q('energy-3', 'energy-4', 'energy-5', 'coin-1'),
    'q19': q(*seq('coin', 4, 2)),
    'q20': q(*seq('face', 4)),             'q21': q(*seq('face', 4, 5)),   'q22': q(*seq('face', 4, 9)),
    'q23': q(*seq('butterfly', 4)),        'q24': q(*seq('butterfly', 4, 5)),
    'q25': q(*seq('accessory', 4)),        'q26': q(*seq('accessory', 4, 5)),
    'q27': q(*seq('craft', 4)),            'q28': q('craft-5', 'craft-6', 'btn-store', 'btn-house'),
    'q29': q('decor-balloon', 'decor-plant', 'decor-lamp', 'decor-clock'),
    'q30': q('decor-art', 'decor-music', 'decor-sofa', 'decor-tree'),
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
        canvas.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{name}.webp'), quality=88, method=6)
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
            chain, _, lvl = name.rpartition('-')
            if lvl.isdigit():
                art[chain] = max(art.get(chain, 0), int(lvl))
            else:
                art[name] = 1   # avatar, decor-*, btn-* 같은 단독 그림
    if 'bg' in found:
        im = Image.open(found['bg']).convert('RGB')
        im.thumbnail((960, 960))
        im.save(os.path.join(OUT, 'bg.webp'), quality=85)
        art['bg'] = 1
    # 등급은 1부터 빠짐없이 있어야 하므로 연속 구간만 인정
    for chain in list(art):
        if art[chain] == 1 and not os.path.exists(os.path.join(OUT, f'{chain}-1.webp')):
            continue
        n = 0
        while os.path.exists(os.path.join(OUT, f'{chain}-{n + 1}.webp')):
            n += 1
        art[chain] = n
    with open(os.path.join(OUT, 'manifest.js'), 'w', encoding='utf-8') as f:
        f.write('// 캔바 그림 목록 (tools/slice_sheets.py 가 자동 생성)\n')
        f.write('window.MERGE_ART = ' + json.dumps(art, ensure_ascii=False) + ';\n')
    print('manifest:', art)

if __name__ == '__main__':
    main()
