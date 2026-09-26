# 사용: python save.py 이름=파일경로=미디어ID ...  → raw/ 복사 + canva-assets.json 기록
import sys, json, shutil, os
base = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(base)
man = os.path.join(base, 'canva-assets.json'); d = json.load(open(man, encoding='utf-8'))
for a in sys.argv[1:]:
    n, f, mid = a.split('=')
    shutil.copy(f, os.path.join(root, 'raw', n + '.jpg')); d[n] = mid
json.dump(d, open(man, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(d) - 1, 'assets')
