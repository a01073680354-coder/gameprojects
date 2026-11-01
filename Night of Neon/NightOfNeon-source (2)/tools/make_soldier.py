"""Villain soldier sprites, drawn procedurally to match the chibi hero.

Body sheet (64x64 frames, no arms) + a separate arm/weapon sprite that the
engine rotates toward the aim point. Variants: rifleman, burst gunner,
heavy (slug cannon).
"""
import json
from PIL import Image

FW = FH = 64
O = (7, 5, 15, 255)


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


VARIANTS = {
    "rifle": {
        "helm": ["#4a5578", "#353e5c", "#252b42", "#171b2b"],
        "armor": ["#58617f", "#3c4460", "#2a3048", "#1c2134"],
        "accent": "#ff2a6d",
        "visor": ["#ffd0e0", "#ff4f8b", "#c0144f", "#5a0a26"],
        "pants": ["#2c3044", "#1f2233"],
        "boot": ["#3a3a46", "#22222c", "#121218"],
        "bulk": 0,
    },
    "burst": {
        "helm": ["#6b5a3a", "#4e4128", "#36301e", "#221d12"],
        "armor": ["#6a6250", "#4c4638", "#353126", "#221f18"],
        "accent": "#ffb347",
        "visor": ["#fff1c8", "#ffb347", "#c06a14", "#5a2f0a"],
        "pants": ["#34302a", "#24211c"],
        "boot": ["#3a3a46", "#22222c", "#121218"],
        "bulk": 2,
    },
    "heavy": {
        "helm": ["#5a4f6e", "#3e3552", "#2a2338", "#1a1524"],
        "armor": ["#5e5670", "#433c54", "#2e283c", "#1d1928"],
        "accent": "#b967ff",
        "visor": ["#f0dcff", "#c77dff", "#7a2fc0", "#3a1260"],
        "pants": ["#2a2634", "#1c1924"],
        "boot": ["#3a3a46", "#22222c", "#121218"],
        "bulk": 5,
        "cannon": True,
    },
}


class Canvas:
    def __init__(self, w=FW, h=FH):
        self.w, self.h = w, h
        self.px = {}

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[(x, y)] = c

    def get(self, x, y):
        return self.px.get((x, y))

    def image(self):
        im = Image.new("RGBA", (self.w, self.h))
        for (x, y), c in self.px.items():
            im.putpixel((x, y), c)
        return im


def shape(cv, pts, tones, light=(-0.6, -0.8)):
    """Fill a pixel set with 4-tone shading from a top-left light, then outline."""
    pts = set(pts)
    if not pts:
        return pts
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    rx = max(1, (max(xs) - min(xs)) / 2)
    ry = max(1, (max(ys) - min(ys)) / 2)
    for (x, y) in pts:
        nx, ny = (x - cx) / rx, (y - cy) / ry
        dd = nx * light[0] + ny * light[1]
        t = tones[0] if dd > 0.55 else tones[1] if dd > -0.1 else tones[2] if dd > -0.6 else tones[3]
        cv.put(x, y, hexc(t))
    for (x, y) in pts:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in pts and cv.get(x + dx, y + dy) is None:
                cv.put(x + dx, y + dy, O)
    return pts


def ellipse_pts(cx, cy, rx, ry, clip=None):
    pts = []
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                if clip is None or clip(x, y):
                    pts.append((x, y))
    return pts


def rect_pts(x0, y0, x1, y1, round_=1):
    pts = []
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            corner = (x - x0 < round_ or x1 - x < round_) and (y - y0 < round_ or y1 - y < round_)
            if not corner:
                pts.append((x, y))
    return pts


def draw_leg(cv, v, hip_x, hip_y, foot_dx, lift, far=False):
    k = 0.6 if far else 1.0
    sh = lambda h: tuple(int(c * k) for c in hexc(h)[:3]) + (255,)
    ground = 61
    bh = 6 if lift < 2 else 5
    by = ground - bh + 1 - lift
    bx = hip_x + foot_dx - 3
    for y in range(hip_y, by + 1):
        t = 0 if by == hip_y else (y - hip_y) / (by - hip_y)
        cx = round(hip_x + (bx + 1 - hip_x) * t)
        cv.put(cx, y, O)
        cv.put(cx + 1, y, sh(v["pants"][1]))
        cv.put(cx + 2, y, sh(v["pants"][0]))
        cv.put(cx + 3, y, sh(v["pants"][1]))
        cv.put(cx + 4, y, O)
    for j in range(bh):
        for i in range(8 if j >= bh - 3 else 6):
            c = v["boot"][0] if j == 0 else v["boot"][1]
            if j == bh - 1:
                c = v["boot"][2]
            cv.put(bx + i, by + j, sh(c))
    for i in range(-1, 9):
        cv.put(bx + i, by + bh, O)
    for j in range(-1, bh):
        cv.put(bx - 1, by + j, O)
    for j in range(bh - 3, bh):
        cv.put(bx + 8, by + j, O)
    for j in range(-1, bh - 3):
        cv.put(bx + 6, by + j, O)
    for i in range(-1, 7):
        cv.put(bx + i, by - 1, O)
    cv.put(bx + 7, by + bh - 4, O)


def draw_body(v, bob=0, lean=0, legs=((5, 0), (-4, 0)), visor_on=True, head_dy=0):
    cv = Canvas()
    b = v["bulk"]
    hip_x, hip_y = 28, 50 + max(0, bob)
    (ndx, nl), (fdx, fl) = legs
    draw_leg(cv, v, hip_x + 2, hip_y, fdx, fl, far=True)
    draw_leg(cv, v, hip_x - 1, hip_y, ndx, nl)

    top = Canvas()
    oy = bob
    lx = lambda y: round(lean * (50 - y) / 40)
    torso = rect_pts(20 - b, 31 + oy, 36 + b, 50 + oy, round_=2)
    torso = [(x + lx(y), y) for x, y in torso]
    shape(top, torso, v["armor"])
    for y in range(34 + oy, 46 + oy):
        top.put(29 + lx(y), y, hexc(v["armor"][3]))
    for y in range(36 + oy, 41 + oy):
        top.put(33 + b + lx(y), y, hexc(v["accent"]))
        top.put(34 + b + lx(y), y, hexc(v["accent"], 160))
    for x in range(20 - b, 37 + b):
        top.put(x + lx(46 + oy), 46 + oy, hexc("#14151f"))
        top.put(x + lx(47 + oy), 47 + oy, hexc("#2a2c3a"))
    for px_ in (23 - b, 31):
        for y in range(45 + oy, 50 + oy):
            for x in range(px_, px_ + 4):
                top.put(x + lx(y), y, hexc(v["armor"][2]))
            top.put(px_ + lx(y), y, O)
            top.put(px_ + 4 + lx(y), y, O)
    pad = ellipse_pts(21 - b + lx(33 + oy), 34 + oy, 5 + b * 0.5, 4)
    shape(top, pad, v["armor"])
    for y in range(33 + oy, 46 + oy):
        top.put(18 - b + lx(y), y, hexc(v["armor"][3]))
        top.put(17 - b + lx(y), y, O)

    hy = 4 + oy + head_dy
    hx = 2 + lean
    dome = ellipse_pts(28 + hx, 17 + hy, 13.5, 13.5, clip=lambda x, y: y <= 24 + hy)
    shape(top, dome, v["helm"])
    rim_y = 14 + hy
    for x in range(16 + hx, 31 + hx):
        if top.get(x, rim_y) not in (None, O):
            top.put(x, rim_y, hexc(v["helm"][3]))
        if top.get(x, rim_y + 1) not in (None, O):
            top.put(x, rim_y + 1, hexc(v["helm"][2]))
    for (gx, gy) in ((22, 8), (23, 8), (21, 9), (22, 9), (24, 7)):
        top.put(gx + hx, gy + hy, hexc(v["helm"][0]))
    top.put(23 + hx, 7 + hy, hexc("#ffffff", 200))
    eg = ellipse_pts(23 + hx, 21 + hy, 4, 4.5)
    shape(top, eg, v["helm"])
    top.put(23 + hx, 21 + hy, hexc(v["accent"]))
    jaw = rect_pts(25 + hx, 24 + hy, 37 + hx, 29 + hy, round_=1)
    shape(top, jaw, ["#5a5d70", "#44475a", "#30323f", "#20212b"])
    for x in range(31 + hx, 37 + hx, 2):
        top.put(x, 26 + hy, O)
        top.put(x, 27 + hy, O)
    vis_y = 15 + hy
    for y in range(vis_y, vis_y + 6):
        for x in range(30 + hx, 43 + hx):
            top.put(x, y, O)
    for y in range(vis_y + 1, vis_y + 5):
        for x in range(31 + hx, 42 + hx):
            if not visor_on:
                c = hexc("#1a1020")
            else:
                r = y - vis_y
                c = hexc(v["visor"][1]) if r in (2, 3) else hexc(v["visor"][2]) if r == 4 else hexc(v["visor"][1])
                if r == 1 and x > 33 + hx:
                    c = hexc(v["visor"][0])
            top.put(x, y, c)
    if visor_on:
        top.put(40 + hx, vis_y + 2, hexc("#ffffff"))
    for x in range(22 + hx, 31 + hx):
        if top.get(x, 6 + hy) not in (None, O):
            top.put(x, 6 + hy, hexc(v["helm"][0]))
    for y in range(1 + hy, 6 + hy):
        top.put(19 + hx, y, hexc(v["helm"][3]))
    top.put(19 + hx, hy, hexc(v["accent"]))

    for k_, c in top.px.items():
        cv.put(k_[0], k_[1], c)
    return cv.image()


def draw_cannon(v):
    """Heavy slug cannon, pivot (4, 7). Muzzle at x=44."""
    W, H = 48, 16
    cv = Canvas(W, H)
    g = ["#6a6478", "#4a4458", "#33303e", "#1e1c26"]
    body = rect_pts(9, 3, 30, 11, round_=2)
    shape(cv, body, g)
    drum = ellipse_pts(20, 12, 4.5, 3.5)
    shape(cv, drum, g)
    for x in range(31, 44):
        for y in range(5, 10):
            cv.put(x, y, hexc(g[1] if y in (6, 7) else g[2]))
        cv.put(x, 4, O)
        cv.put(x, 10, O)
        if x % 3 == 0:
            cv.put(x, 7, hexc(v["accent"]))
    for y in range(4, 11):
        cv.put(44, y, O)
        cv.put(43, y, hexc(g[0]))
    arm = rect_pts(1, 4, 10, 10, round_=2)
    shape(cv, arm, v["armor"])
    glove = rect_pts(13, 9, 18, 13, round_=1)
    shape(cv, glove, ["#3a3a46", "#2a2a34", "#1c1c24", "#121218"])
    return cv.image()


def draw_arm(v):
    """Arm + rifle, pivot at the shoulder = (4, 6). Muzzle at the right end."""
    if v.get("cannon"):
        return draw_cannon(v)
    W, H = 44, 16
    cv = Canvas(W, H)
    b = v["bulk"]
    g = ["#5a5e70", "#3c3f4e", "#2a2c38", "#1a1b24"]
    body = rect_pts(10, 4, 30 + b, 9, round_=1)
    shape(cv, body, g)
    for x in range(31 + b, 41 + b if b else 41):
        cv.put(x, 6, hexc(g[1]))
        cv.put(x, 7, hexc(g[2]))
        cv.put(x, 5, O)
        cv.put(x, 8, O)
    e = 41 + (b if b else 0)
    for y in (5, 6, 7, 8):
        cv.put(e, y, O)
    mag = rect_pts(20, 10, 23 + b, 14, round_=0)
    shape(cv, mag, g)
    sc = rect_pts(15, 1, 24, 3, round_=1)
    shape(cv, sc, g)
    cv.put(25, 2, hexc(v["accent"]))
    cv.put(27 + b, 6, hexc(v["accent"]))
    cv.put(28 + b, 6, hexc(v["accent"]))
    st = rect_pts(5, 5, 10, 10, round_=1)
    shape(cv, st, g)
    arm = rect_pts(1, 4, 9, 9, round_=2)
    shape(cv, arm, v["armor"])
    glove = rect_pts(14, 8, 18, 12, round_=1)
    shape(cv, glove, ["#3a3a46", "#2a2a34", "#1c1c24", "#121218"])
    return cv.image()


def build(name, v):
    frames, anims = [], {}

    def anim(key, fps, loop, *fs):
        s = len(frames)
        frames.extend(fs)
        anims[key] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}

    anim("idle", 5, True,
         draw_body(v, 0), draw_body(v, 0), draw_body(v, 1), draw_body(v, 1))
    WALK = [(1, ((5, 0), (-4, 0))), (0, ((3, 0), (-2, 2))), (0, ((0, 0), (1, 3))), (0, ((-2, 0), (4, 1))),
            (1, ((-4, 0), (5, 0))), (0, ((-2, 2), (3, 0))), (0, ((1, 3), (0, 0))), (0, ((4, 1), (-2, 0)))]
    anim("walk", 10, True, *[draw_body(v, bb, 1, l) for bb, l in WALK])
    anim("aim", 6, True, draw_body(v, 1, 0, ((6, 0), (-5, 0))), draw_body(v, 1, 0, ((6, 0), (-5, 0))))
    anim("hurt", 10, False, draw_body(v, 0, -3, ((6, 1), (-5, 0)), head_dy=-1))
    anim("dead", 10, False, draw_body(v, 0, -3, ((6, 1), (-5, 0)), visor_on=False, head_dy=-1))

    sheet = Image.new("RGBA", (FW * len(frames), FH))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * FW, 0))
    sheet.save(f"assets/soldier_{name}.png")
    draw_arm(v).save(f"assets/arm_{name}.png")
    return frames, anims


SHOULDER = (27, 37)
meta = {}
prev_rows = []
for name, v in VARIANTS.items():
    frames, anims = build(name, v)
    meta[name] = anims
    prev_rows.append((frames, draw_arm(v)))
with open("assets/soldier.json", "w") as fh:
    json.dump({"anims": meta, "shoulder": SHOULDER, "armPivot": [4, 6],
               "armPivots": {"rifle": [4, 6], "burst": [4, 6], "heavy": [4, 7]}, "muzzle": [41, 6]}, fh, indent=1)

S = 4
n = max(len(f) for f, _ in prev_rows)
prev = Image.new("RGBA", (n * FW * S, len(prev_rows) * FH * S), (40, 30, 60, 255))
for r, (frames, arm) in enumerate(prev_rows):
    for c, f in enumerate(frames):
        im = f.copy()
        if c < 14:
            im.alpha_composite(arm, (SHOULDER[0] - 4, SHOULDER[1] - 6))
        prev.alpha_composite(im.resize((FW * S, FH * S), Image.NEAREST), (c * FW * S, r * FH * S))
prev.save("scratch/soldier_preview.png")
print("soldiers ok", list(meta))
