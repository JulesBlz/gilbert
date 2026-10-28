# Sa poubelle (la benne verte ouverte) : tirée de tools/dumpster-source.bmp (32 bits, fond transparent),
# ramenée à sa vraie grille de pixels (31 x 33 : une case = 17,3 px de l'image), puis déclinée en
# assets/dumpster.png (la grille agrandie 8 fois, pour l'écran), assets/bin.png (l'icône du bureau,
# 512 px, chaque case = 13 px) et assets/bin.ico (Windows).
# Usage : python3 tools/make-dumpster.py   (les mesures sont reprises dans src/shared/dumpster.ts)
import struct, zlib

d = open('tools/dumpster-source.bmp', 'rb').read()
off = struct.unpack('<I', d[10:14])[0]
w, h = struct.unpack('<ii', d[18:26])
H = abs(h)
def px(x, y):
    o = off + ((H - 1 - y) if h > 0 else y) * w * 4 + x * 4
    return d[o + 2], d[o + 1], d[o], d[o + 3]

X0, Y0, CELL = 431, 299, 17.3  # le coin de la benne dans l'image, et la taille d'une case (mesurées)
COLS, ROWS = 31, 33
cw = ch = CELL
grid = []
for r in range(ROWS):
    row = []
    for c in range(COLS):
        # la couleur la plus fréquente au milieu de la case
        votes = {}
        for fx in (0.35, 0.5, 0.65):
            for fy in (0.35, 0.5, 0.65):
                p = px(int(X0 + (c + fx) * cw), int(Y0 + (r + fy) * ch))
                votes[p] = votes.get(p, 0) + 1
        p = max(votes, key=votes.get)
        row.append((p[0], p[1], p[2], 255) if p[3] > 128 else (0, 0, 0, 0))
    grid.append(row)
cw, ch = COLS, ROWS

def blow(pix, k):
    return [[p for p in r for _ in range(k)] for r in pix for _ in range(k)]

def png(path, pix):
    hh, ww = len(pix), len(pix[0])
    raw = b''.join(b'\x00' + bytes(v for p in r for v in p) for r in pix)
    chunk = lambda t, b: struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', ww, hh, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    return open(path, 'rb').read()

def scale(pix, nw, nh):
    """Moyenne par zones (couleurs pondérées par la transparence)"""
    ow, oh = len(pix[0]), len(pix)
    out = []
    for y in range(nh):
        ya, yb = y * oh / nh, (y + 1) * oh / nh
        r = []
        for x in range(nw):
            xa, xb = x * ow / nw, (x + 1) * ow / nw
            sr = sg = sb = sa = wt = 0.0
            for yy in range(int(ya), min(oh, int(yb) + 1)):
                fy = min(yb, yy + 1) - max(ya, yy)
                for xx in range(int(xa), min(ow, int(xb) + 1)):
                    f = fy * (min(xb, xx + 1) - max(xa, xx))
                    if f <= 0: continue
                    p = pix[yy][xx]
                    sr += p[0] * p[3] * f; sg += p[1] * p[3] * f; sb += p[2] * p[3] * f; sa += p[3] * f; wt += f
            r.append((round(sr / sa), round(sg / sa), round(sb / sa), round(sa / wt)) if sa > 0 else (0, 0, 0, 0))
        out.append(r)
    return out

png('assets/dumpster.png', blow(grid, 8))

# l'icône : chaque case fait 13 px, la benne est centrée
N, K = 512, 13
art = blow(grid, K)
ah, aw = len(art), len(art[0])
icon = [[(0, 0, 0, 0)] * N for _ in range(N)]
top, left = (N - ah) // 2, (N - aw) // 2
for y in range(ah):
    icon[top + y][left:left + aw] = art[y]
big = png('assets/bin.png', icon)

sizes = [256, 128, 64, 48, 32, 16]
imgs = [png('/tmp/_ico.png', scale(icon, s, s)) for s in sizes]
hdr = struct.pack('<HHH', 0, 1, len(sizes))
pos = 6 + 16 * len(sizes)
ent = b''
for s, b in zip(sizes, imgs):
    ent += struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(b), pos)
    pos += len(b)
open('assets/bin.ico', 'wb').write(hdr + ent + b''.join(imgs))
print('ok', cw, ch, aw, ah, top, left)
