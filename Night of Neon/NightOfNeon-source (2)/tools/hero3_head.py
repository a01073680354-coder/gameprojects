"""Grim head for the Old Swordsman v3, facing right.

Built from three masks (hair, face, beard) shaded by rule, then the features
are placed by hand: a heavy brow, a narrowed eye, a scar, a hooked nose.
"""
from PIL import Image

O = (6, 5, 6)
HAIR = [(232, 229, 222), (192, 188, 184), (148, 144, 142), (104, 100, 102), (70, 66, 70)]
SKIN = {"hi": (206, 152, 120), "bs": (172, 116, 90), "sh": (128, 80, 64), "dk": (88, 52, 46)}
BEARD = [(236, 232, 226), (196, 192, 188), (150, 146, 144), (104, 100, 102)]
EYE = (18, 12, 12)
GLINT = (240, 228, 206)
SCAR = (224, 168, 146)
CORD = [(132, 30, 34), (70, 14, 18)]


def poly(pts):
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    out = set()
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            cx, cy = x + 0.5, y + 0.5
            ins = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]; xj, yj = pts[j]
                if (yi > cy) != (yj > cy) and cx < (xj - xi) * (cy - yi) / (yj - yi + 1e-9) + xi:
                    ins = not ins
                j = i
            if ins:
                out.add((x, y))
    return out


# local coordinates; face looks to +x
HAIR_M = poly([(9, 3), (15, 2.6), (19, 3.6), (21.5, 6), (21, 8), (18, 8.5), (16.5, 10.5), (15, 15), (13.5, 18),
               (11, 21), (9.5, 25.5), (7.5, 24), (6.5, 21), (5, 17), (5, 11), (6, 6)])
FACE_M = poly([(17, 7.5), (21.5, 7.5), (22.5, 10), (22.5, 12), (24.5, 14.5), (23.5, 15.5), (22.5, 16.5),
               (17, 17), (14.5, 15), (15.5, 11)])
BEARD_M = poly([(13.5, 13), (16, 16.2), (23.5, 16), (24.5, 17.5), (23, 21), (21.5, 25), (19.5, 29.5), (18, 31),
                (16.5, 28), (14.5, 25), (12.5, 21), (12, 17)])
KNOT_M = poly([(7, 0.5), (9.8, 0.5), (10, 3.5), (7, 3.6)])


def build():
    px = {}
    for (x, y) in HAIR_M:
        # light from the upper front, in flat bands
        light = (x - 5) / 17 * 0.8 - (y - 3) / 22 * 1.2
        k = 0 if light > 0.42 else 1 if light > 0.0 else 2 if light > -0.5 else 3
        px[(x, y)] = HAIR[k]
    # a few strands swept back from the hairline
    for line in (((19, 5), (14, 5), (9, 7), (7, 11)), ((18, 7), (13, 8), (9, 12), (8, 17)),
                 ((16, 10), (12, 13), (10, 18), (9, 23)), ((14, 4), (10, 4), (7, 6))):
        for (a, b) in zip(line, line[1:]):
            n = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
            for i in range(n + 1):
                q = (round(a[0] + (b[0] - a[0]) * i / n), round(a[1] + (b[1] - a[1]) * i / n))
                if q in px:
                    j = HAIR.index(px[q]) if px[q] in HAIR else 1
                    px[q] = HAIR[min(4, j + 1)]
    for (x, y) in FACE_M:
        c = SKIN["bs"]
        if y < 10 and x > 18:
            c = SKIN["hi"]
        if x < 17:
            c = SKIN["sh"]
        px[(x, y)] = c
    for (x, y) in BEARD_M:
        edge = 13 + (y - 16) * 0.35
        k = 0 if x > edge + 3 else 1 if x > edge + 1 else 2
        px[(x, y)] = BEARD[k]
    # clumps parting down the beard
    for line in (((22, 18), (21, 22), (19, 27)), ((19, 17), (18, 21), (17, 25))):
        for (a, b) in zip(line, line[1:]):
            n = max(abs(b[0] - a[0]), abs(b[1] - a[1]))
            for i in range(n + 1):
                q = (round(a[0] + (b[0] - a[0]) * i / n), round(a[1] + (b[1] - a[1]) * i / n))
                if q in px:
                    px[q] = BEARD[2]
    # ear tucked behind the hair, a sideburn into the beard
    for (x, y), c in {(15, 12): SKIN["sh"], (15, 13): SKIN["dk"], (14, 12): SKIN["dk"], (16, 12): SKIN["bs"]}.items():
        px[(x, y)] = c
    # brow: heavy and slanting down toward the nose (a permanent scowl)
    for x in range(17, 20):
        px[(x, 10)] = HAIR[2]
        px[(x, 11)] = HAIR[3]
    for x in range(20, 24):
        px[(x, 11)] = HAIR[2] if x < 22 else HAIR[3]
    px[(22, 12)] = HAIR[3]
    px[(19, 9)] = SKIN["sh"]; px[(20, 9)] = SKIN["sh"]   # furrow
    # eye: a narrow slit in shadow
    px[(19, 12)] = SKIN["dk"]; px[(20, 12)] = EYE; px[(21, 12)] = EYE
    px[(21, 13)] = GLINT if False else SKIN["sh"]
    px[(20, 13)] = SKIN["sh"]
    px[(22, 12)] = SKIN["sh"]
    # scar from the brow down across the eye
    for p in ((21, 8), (21, 9), (21, 10), (20, 11), (20, 13), (19, 14), (19, 15)):
        px[p] = SCAR
    px[(21, 12)] = GLINT
    # nose: hooked, with a nostril
    px[(23, 13)] = SKIN["hi"]; px[(24, 14)] = SKIN["bs"]; px[(23, 15)] = SKIN["dk"]; px[(22, 15)] = SKIN["sh"]
    # cheek hollow
    px[(17, 14)] = SKIN["dk"]; px[(18, 15)] = SKIN["sh"]; px[(17, 15)] = SKIN["sh"]
    # mustache drooping over the mouth
    for p in ((20, 16), (21, 16), (22, 16), (23, 16), (24, 17), (23, 17)):
        px[p] = BEARD[0] if p[0] > 21 else BEARD[1]
    # the face, placed by hand over the masks (cols 13..25, rows 6..17)
    key = {"a": HAIR[0], "b": HAIR[1], "c": HAIR[2], "d": HAIR[3], "f": HAIR[4],
           "s": SKIN["hi"], "t": SKIN["bs"], "u": SKIN["sh"], "v": SKIN["dk"],
           "e": EYE, "g": GLINT, "x": SCAR, "w": BEARD[0], "y": BEARD[1], "z": BEARD[2]}
    drop, force = set(), set()
    for j, row in enumerate(FACE):
        for i, ch in enumerate(row):
            q = (13 + i, 6 + j)
            if ch == "-":
                continue
            if ch in ".O":
                px.pop(q, None)
                (drop if ch == "." else force).add(q)
            else:
                px[q] = key[ch]
    # outline
    out = dict(px)
    for (x, y) in px:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in px:
                out[q] = O
    for q in drop:
        out.pop(q, None)
    for q in force:
        out[q] = O
    return out


FACE = [
    # 13 ... 25
    "bbbbaaaO.....",  # 6
    "cbbbassssO...",  # 7
    "ccbbsssxssO..",  # 8
    "cbbutuuxstO..",  # 9
    "ccbutffxtttO.",  # 10
    "cccvttdfffffO",  # 11
    "cccvutveguuO.",  # 12
    "ccbutuuxutssO",  # 13
    "dccuttxttttsO",  # 14
    "dccuuttxtuvO.",  # 15
    "ddyuutwwwwwwO",  # 16
    "ddzywwwywwwwO",  # 17
]


def knot():
    """The topknot, tied with a red cord; drawn as its own layer so it can bob."""
    px = {}
    for (x, y) in KNOT_M:
        px[(x, y)] = HAIR[1] if (x < 9 and y < 2) else HAIR[2] if x < 9 else HAIR[3]
    for x in range(7, 11):
        px[(x, 3)] = CORD[0] if x < 9 else CORD[1]
    px[(7, 4)] = CORD[0]; px[(6, 5)] = CORD[1]   # cord end hanging behind
    out = dict(px)
    for (x, y) in px:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in px and (x + dx, y + dy) not in HAIR_M:
                out[(x + dx, y + dy)] = O
    return out


def _img(px, gx, gy):
    img = Image.new("RGBA", (64, 64))
    for (x, y), c in px.items():
        if 0 <= gx + x < 64 and 0 <= gy + y < 64:
            img.putpixel((gx + x, gy + y), c + (255,))
    return img


GX, GY = 15, 4


def knot_image():
    return _img(knot(), GX, GY)


def head_image(gx=GX, gy=GY):
    img = Image.new("RGBA", (64, 64))
    for (x, y), c in build().items():
        if 0 <= gx + x < 64 and 0 <= gy + y < 64:
            img.putpixel((gx + x, gy + y), c + (255,))
    return img


if __name__ == "__main__":
    im = head_image()
    im.alpha_composite(knot_image())
    im.crop((10, 0, 50, 40)).resize((400, 400), Image.NEAREST).save("scratch/head3.png")
