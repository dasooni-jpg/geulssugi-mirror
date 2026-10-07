# 다람 탐험대 지역 지도 설계 도구
# 사용: python tools/maps_regions.py           → 검증 + tools/maps.json 저장
#       python tools/maps_regions.py preview   → 위 + previews/<지역>.png (아이소 미리보기)
#
# 지도 글자(24×24, 왼쪽 위가 화면 맨 위 꼭짓점)
#   #  절벽(지나갈 수 없음)        ^  높은 절벽
#   T  울창한 숲(지나갈 수 없음)    ~  물·용암·낭떠러지(지역마다 다름)   %  두 번째 물(오아시스 등)
#   .  장애물 땅(80% 확률로 지역 장애물)   o  반드시 장애물   h  무거운 장애물(에너지 많이)
#   -  빈 땅   ,  흙길(가끔 가벼운 장애물)
#   S  출발점   A  탐험 텐트   1 2  수리 지점(이야기 미션 순서)
#   R  룬 석판   C  보물 상자   B  거대한 바위(다이너마이트)
# 화면 좌표: s = x+y (위→아래, 0~46), d = x-y (왼쪽→오른쪽, -23~23)
import json, os, sys, math

N = 24
WALL = set('#^T~%')
LAND = set('.o-,hCRB')
REPAIRS = {
  'canyon':('bridge','well'), 'nest':('fence','well'), 'windmill':('fence','bridge'), 'snow':('bridge','well'),
  'beach':('bridge','well'), 'swamp':('fence','bridge'), 'desert':('well','bridge'), 'volcano':('bridge','fence'),
  'bamboo':('bridge','well'), 'cave':('fence','bridge'), 'jungle':('bridge','well'), 'maple':('fence','bridge'),
  'sky':('bridge','well'), 'fairy':('fence','bridge'), 'pirate':('bridge','well'), 'glacier':('fence','bridge'),
  'honey':('bridge','well'), 'dino':('fence','bridge'), 'candy':('bridge','well'), 'clock':('fence','bridge'),
  'fest':('stage',),
}
GATE = {'bridge', 'fence'}


class Map:
    def __init__(self, name, fill='.'):
        self.name = name
        self.g = [[fill] * N for _ in range(N)]

    def ok(self, x, y):
        return 0 <= x < N and 0 <= y < N

    def get(self, x, y):
        return self.g[y][x] if self.ok(x, y) else None

    def set(self, x, y, c, only=None):
        if self.ok(x, y) and (only is None or self.g[y][x] in only):
            self.g[y][x] = c

    def cells(self):
        for y in range(N):
            for x in range(N):
                yield x, y

    # ── 격자 기준 도형 ──
    def rect(self, c, x0, y0, x1, y1, only=None):
        for y in range(min(y0, y1), max(y0, y1) + 1):
            for x in range(min(x0, x1), max(x0, x1) + 1):
                self.set(x, y, c, only)

    def disc(self, c, cx, cy, r, only=None):
        for x, y in self.cells():
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                self.set(x, y, c, only)

    def ring(self, c, cx, cy, r0, r1, only=None):
        for x, y in self.cells():
            d = math.hypot(x - cx, y - cy)
            if r0 < d <= r1:
                self.set(x, y, c, only)

    def line(self, c, pts, r=0, only=None):
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            for x, y in bres(ax, ay, bx, by):
                if r <= 0:
                    self.set(x, y, c, only)
                else:
                    self.disc(c, x, y, r, only)

    def path(self, pts):
        """흙길: 가로·세로로만 꺾여 이어짐(빈 땅·장애물 땅에만)"""
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            x, y = ax, ay
            self.set(x, y, ',', LAND - set('CRB'))
            k = 0
            while (x, y) != (bx, by):
                if x != bx and (y == by or k % 2 == 0):
                    x += 1 if bx > x else -1
                else:
                    y += 1 if by > y else -1
                k += 1
                self.set(x, y, ',', set('.o-h'))

    def tunnel(self, pts, c='.', w=1):
        """가로·세로로만 꺾이는 굴(폭 w)을 파서 4방향으로 이어지게 함"""
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            x, y = ax, ay
            cells = [(x, y)]
            k = 0
            while (x, y) != (bx, by):
                if x != bx and (y == by or k % 2 == 0):
                    x += 1 if bx > x else -1
                else:
                    y += 1 if by > y else -1
                k += 1
                cells.append((x, y))
            for x, y in cells:
                for dx in range(w):
                    for dy in range(w):
                        self.set(x + dx, y + dy, c)

    # ── 화면 기준 도형(s = x+y 아래로, d = x-y 오른쪽으로) ──
    def sband(self, c, s0, s1, d0=-99, d1=99, only=None):
        for x, y in self.cells():
            if s0 <= x + y <= s1 and d0 <= x - y <= d1:
                self.set(x, y, c, only)

    def sdisc(self, c, s, d, r, only=None):
        """화면에서 둥글게 보이는 원(r: 가로 칸 단위)"""
        for x, y in self.cells():
            if ((x + y - s) / 2) ** 2 + (x - y - d) ** 2 <= r * r:
                self.set(x, y, c, only)

    def at(self, s, d, c):
        x, y = (s + d) // 2, (s - d) // 2
        assert (s + d) % 2 == 0, f'{self.name}: s={s} d={d} 홀짝이 맞지 않음'
        self.set(x, y, c)
        return x, y

    def frame(self, back='^', front=None, back2=None):
        for i in range(N):
            self.set(i, 0, back); self.set(0, i, back)
            if back2:
                self.set(i, 1, back2, set('.o-h')); self.set(1, i, back2, set('.o-h'))
            if front:
                self.set(i, N - 1, front); self.set(N - 1, i, front)

    def put(self, c, *pts):
        for x, y in pts:
            self.set(x, y, c)

    def clear(self, x, y, r=1.5, c='-'):
        self.disc(c, x, y, r, set('.oh'))

    def rows(self):
        return [''.join(r) for r in self.g]


def bres(x0, y0, x1, y1):
    out = []
    dx, sx = abs(x1 - x0), 1 if x0 < x1 else -1
    dy, sy = -abs(y1 - y0), 1 if y0 < y1 else -1
    e = dx + dy
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * e
        if e2 >= dy:
            e += dy; x0 += sx
        if e2 <= dx:
            e += dx; y0 += sy
    return out


# ══════════════════ 검증 ══════════════════
def find(rows, ch):
    return [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == ch]


def reach(rows, start, open_spots=(), rock=False):
    seen = {start}; q = [start]
    while q:
        x, y = q.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < N and 0 <= ny < N) or (nx, ny) in seen:
                continue
            c = rows[ny][nx]
            if c in WALL or c == 'A':
                continue
            if c in '12' and c not in open_spots:
                continue
            if c == 'B' and not rock:
                continue
            seen.add((nx, ny)); q.append((nx, ny))
    return seen


def near(p, area):
    x, y = p
    return any((x + dx, y + dy) in area for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))


def around(rows, p, chars):
    x, y = p; n = 0
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if (dx or dy) and 0 <= x + dx < N and 0 <= y + dy < N and rows[y + dy][x + dx] in chars:
                n += 1
    return n


def validate(name, rows):
    err, info = [], {}
    if len(rows) != N or any(len(r) != N for r in rows):
        return [f'크기 오류 {len(rows)}x{set(len(r) for r in rows)}'], info
    bad = set(''.join(rows)) - set('#^T~%.o-,hBCRSA12')
    if bad:
        err.append(f'모르는 글자 {bad}')
    cnt = lambda ch: sum(r.count(ch) for r in rows)
    kinds = REPAIRS[name]
    need = {'S': 1, 'A': 1, '1': 1}
    if len(kinds) > 1:
        need['2'] = 1
    for ch, n in need.items():
        if cnt(ch) != n:
            err.append(f"'{ch}' {cnt(ch)}개(필요 {n})")
    if name != 'fest' and cnt('R') != 3:
        err.append(f'룬 {cnt("R")}개(필요 3)')
    if cnt('C') < 4:
        err.append(f'상자 {cnt("C")}개(4개 이상)')
    if err:
        return err, info
    S = find(rows, 'S')[0]
    sp = {k: find(rows, k)[0] for k in '12' if cnt(k)}
    R0 = reach(rows, S)
    info['A'] = R0
    if not near(sp['1'], R0):
        err.append('수리 지점 1에 닿을 수 없음')
    k0 = kinds[0]
    o1 = {'1'} if k0 in GATE else set()
    R1 = reach(rows, S, o1)
    info['B'] = R1 - R0
    if k0 in GATE and len(R1 - R0) < 25:
        err.append(f'수리 지점 1({k0})이 길을 거의 막지 않음(+{len(R1 - R0)}칸)')
    if k0 == 'bridge' and around(rows, sp['1'], '~%') < 2:
        err.append('다리 1 주변에 물이 없음')
    if k0 == 'fence' and around(rows, sp['1'], '#^T') < 2:
        err.append('울타리 1 주변에 벽이 없음')
    if name == 'fest':
        R3 = reach(rows, S, {'1'}, True)
        info['C'] = set()
    else:
        k1 = kinds[1]
        if not near(sp['2'], R1):
            err.append('수리 지점 2에 닿을 수 없음(1을 고친 뒤에도)')
        o2 = o1 | ({'2'} if k1 in GATE else set())
        R2 = reach(rows, S, o2)
        R3 = reach(rows, S, o2, True)
        if k1 in GATE:
            info['C'] = R2 - R1
            if len(R2 - R1) < 20:
                err.append(f'수리 지점 2({k1})가 길을 거의 막지 않음(+{len(R2 - R1)}칸)')
            if k1 == 'bridge' and around(rows, sp['2'], '~%') < 2:
                err.append('다리 2 주변에 물이 없음')
            if k1 == 'fence' and around(rows, sp['2'], '#^T') < 2:
                err.append('울타리 2 주변에 벽이 없음')
            late = [r for r in find(rows, 'R') if r not in R1]
        else:
            info['C'] = R3 - R2
            if len(R3 - R2) < 12:
                err.append(f'바위 너머 마지막 구역이 너무 작음({len(R3 - R2)}칸)')
            late = [r for r in find(rows, 'R') if r not in R2]
        if len(late) < 2:
            err.append(f'마지막 구역의 룬이 {len(late)}개(2개 이상 필요)')
        if sum(1 for r in find(rows, 'R') if r in R0) > 1:
            err.append('첫 구역에 룬이 2개 이상')
    for ch in 'RC':
        for p in find(rows, ch):
            if p not in R3:
                err.append(f"닿을 수 없는 '{ch}' {p}")
    land = [(x, y) for x, y in ((x, y) for y in range(N) for x in range(N)) if rows[y][x] in LAND]
    lost = [p for p in land if p not in R3]
    if lost:
        info['lost'] = lost
    if len([p for p in R0 if rows[p[1]][p[0]] in '.oh']) < 45:
        err.append(f'첫 구역 장애물 땅이 적음({len([p for p in R0 if rows[p[1]][p[0]] in ".oh"])})')
    sx, sy = S
    if rows[sy][sx - 2] != 'A':
        err.append('텐트(A)는 출발점 왼쪽 두 칸(x-2)에 둘 것')
    info['R3'] = R3
    return err, info


# ══════════════════ 미리보기 ══════════════════
COL = {'#': (150, 112, 70), '^': (118, 84, 52), 'T': (40, 96, 40), '~': (70, 150, 220), '%': (110, 190, 230),
       '.': (150, 196, 100), 'o': (130, 180, 90), '-': (176, 214, 120), ',': (205, 170, 110), 'h': (120, 160, 80),
       'B': (130, 130, 130), 'C': (240, 200, 60), 'R': (255, 230, 60), 'S': (240, 80, 200), 'A': (170, 110, 60),
       '1': (230, 60, 60), '2': (230, 60, 60)}


def preview(name, rows, info, path):
    from PIL import Image, ImageDraw
    tw, th = 28, 14
    W, H = tw * N + 40, th * N + 60
    im = Image.new('RGB', (W, H), (200, 225, 245)); dr = ImageDraw.Draw(im)
    ox, oy = W // 2, 40
    tint = {}
    for p in info.get('A', ()): tint[p] = (0, 30, 0)
    for p in info.get('B', ()): tint[p] = (40, 30, -20)
    for p in info.get('C', ()): tint[p] = (50, -10, 30)
    order = sorted(((x, y) for y in range(N) for x in range(N)), key=lambda p: p[0] + p[1])
    for x, y in order:
        c = rows[y][x]
        cx, cy = ox + (x - y) * tw // 2, oy + (x + y) * th // 2
        col = COL[c]
        t = tint.get((x, y), (0, 0, 0))
        col = tuple(max(0, min(255, a + b)) for a, b in zip(col, t))
        hgt = {'#': 8, '^': 16, 'T': 10}.get(c, 0)
        top = [(cx, cy - th // 2 - hgt), (cx + tw // 2, cy - hgt), (cx, cy + th // 2 - hgt), (cx - tw // 2, cy - hgt)]
        if hgt:
            dr.polygon([(cx - tw // 2, cy - hgt), (cx, cy + th // 2 - hgt), (cx, cy + th // 2), (cx - tw // 2, cy)], fill=tuple(int(v * .7) for v in col))
            dr.polygon([(cx + tw // 2, cy - hgt), (cx, cy + th // 2 - hgt), (cx, cy + th // 2), (cx + tw // 2, cy)], fill=tuple(int(v * .55) for v in col))
        dr.polygon(top, fill=col, outline=tuple(int(v * .85) for v in col))
        if c in '.oh':
            r = 3 if c != 'h' else 4
            dr.ellipse([cx - r, cy - r - 2, cx + r, cy + r - 2], fill=(70, 110, 40) if c != 'h' else (90, 60, 30))
        if c in 'CRSA12B':
            dr.text((cx - 3, cy - 7), {'C': '▣', 'R': '★', 'S': 'S', 'A': 'A', '1': '1', '2': '2', 'B': 'B'}[c].replace('▣', 'C').replace('★', 'R'), fill=(20, 20, 20))
    for p in info.get('lost', []):
        x, y = p; cx, cy = ox + (x - y) * tw // 2, oy + (x + y) * th // 2
        dr.line([cx - 4, cy - 4, cx + 4, cy + 4], fill=(200, 0, 0), width=2)
    dr.text((8, 8), name, fill=(0, 0, 0))
    im.save(path)


# ══════════════════ 지역 지도 ══════════════════
MAPS = {}


def region(f):
    MAPS[f.__name__] = f
    return f


PREVIEW_DIR = os.environ.get('MAP_PREVIEW_DIR', os.path.join(os.path.dirname(__file__), '..', 'previews'))


def show(rows):
    """화면에서 보이는 모양(마름모)으로 글자 지도를 출력"""
    for s in range(2 * N - 1):
        line = ''
        for d in range(-(N - 1), N):
            x, y = (s + d) // 2, (s - d) // 2
            line += rows[y][x] if (s + d) % 2 == 0 and 0 <= x < N and 0 <= y < N else ' '
        print(f'{s:2d} ' + line.rstrip())


def fill_lost(rows, info):
    """끝내 갈 수 없는 땅은 옆의 벽 글자로 메움(쓸모없는 칸 없애기)"""
    g = [list(r) for r in rows]
    for x, y in info.get('lost', []):
        if g[y][x] in 'CRB':
            continue
        nb = [g[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < N and 0 <= y + dy < N and g[y + dy][x + dx] in WALL]
        g[y][x] = max(set(nb), key=nb.count) if nb else '#'
    return [''.join(r) for r in g]


def save_all(do_preview=False, only=None, text=False):
    out, ok = {}, True
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    for name, f in MAPS.items():
        m = f()
        rows = m.rows()
        err, info = validate(name, rows)
        if not err and info.get('lost'):
            rows = fill_lost(rows, info)
            err, info = validate(name, rows)
        lost = len(info.get('lost', []))
        a, b, c = len(info.get('A', ())), len(info.get('B', ())), len(info.get('C', ()))
        print(f"{name:9s} {'OK ' if not err else '✗  '} 구역 {a}/{b}/{c}칸" + (f' · 못 가는 땅 {lost}' if lost else '') + ('' if not err else '\n   - ' + '\n   - '.join(err)))
        ok = ok and not err
        out[name] = rows
        if text and (only is None or name in only):
            show(rows)
        if do_preview and (only is None or name in only):
            preview(name, rows, info, os.path.join(PREVIEW_DIR, name + '.png'))
    with open(os.path.join(os.path.dirname(__file__), 'maps.json'), 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=0)
    if ok and only is None:
        inject(out)
    return ok


def inject(out):
    """게임 파일(index.html)의 LAYOUTS 자료를 새 지도로 바꿔 끼움(표시 줄 사이만)"""
    path = os.path.join(os.path.dirname(__file__), '..', 'index.html')
    html = open(path, encoding='utf-8').read()
    a, b = '/* LAYOUTS-BEGIN', '/* LAYOUTS-END */'
    if a not in html or b not in html:
        print('index.html에 LAYOUTS 표시가 없어 건너뜀')
        return
    body = 'const LAYOUTS = {\n' + ',\n'.join(
        f'  {k}:[' + ','.join(f"'{r}'" for r in rows) + ']' for k, rows in out.items()) + '\n};\n'
    i, j = html.index(a), html.index(b)
    i = html.index('*/', i) + 3
    html = html[:i] + body + html[j:]
    open(path, 'w', encoding='utf-8').write(html)
    print('index.html LAYOUTS 갱신:', len(out), '곳')


# 실행은 tools/maps_regions.py 에서(지역별 설계가 들어 있음)
