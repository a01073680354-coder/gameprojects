"""Old Swordsman v3: the same part-based animation as v2, re-dressed heavier
and grimmer. A weathered, scarred head with a long beard (tools/hero3_head.py),
broad shoulders under a ragged mantle, a long black coat with a torn hem,
a blood-red sash, bandaged forearms and plain iron fittings.

Frames are 96x80. Original sprite coordinates are offset by (16, 16):
feet rest on row 77, body centre at x 46.
"""
import json
import math
from PIL import Image

FW, FH = 96, 80
OX, OY = 16, 16

OUT = (4, 3, 2, 255)


def C(r, g, b, a=255):
    return (r, g, b, a)


ROBE = {"dk": C(12, 13, 18), "sh": C(22, 24, 31), "md": C(30, 33, 41), "bs": C(38, 41, 51), "hi": C(56, 61, 74), "hi2": C(78, 84, 100)}
MANTLE = {"dk": C(40, 34, 31), "sh": C(62, 54, 48), "bs": C(88, 77, 67), "hi": C(118, 105, 90), "hi2": C(146, 132, 114)}
COLLAR = [C(150, 140, 126), C(96, 88, 80)]
SASH = {"dk": C(48, 10, 14), "bs": C(86, 20, 24), "hi": C(124, 36, 36), "strap": C(104, 92, 80)}
SKIN = {"hi": C(206, 152, 120), "bs": C(172, 116, 90), "sh": C(128, 80, 64), "dk": C(88, 52, 46)}
CUFF = [C(196, 186, 164), C(132, 122, 106)]
SHEATH = {"dk": C(10, 9, 11), "bs": C(26, 24, 28), "hi": C(58, 54, 60)}
GOLD = [C(182, 184, 190), C(122, 124, 132), C(72, 74, 82)]   # iron fittings
WRAP = [C(108, 28, 32), C(36, 12, 14)]
BLADE = {"edge": C(255, 255, 255), "bs": C(200, 210, 222), "mid": C(150, 162, 180), "back": C(84, 92, 110)}
PANT = [C(30, 30, 36), C(48, 48, 56)]
BOOT = {"D": C(26, 20, 20), "M": C(46, 36, 32), "H": C(70, 56, 48)}
LEGWRAP = [C(150, 140, 124), C(96, 88, 78)]
SMEAR = [C(236, 252, 255, 235), C(150, 220, 245, 170)]

import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from hero3_head import head_image, knot_image  # noqa: E402

HEAD = head_image()
BUN = knot_image()


def shade(c, k):
    return (int(c[0] * k), int(c[1] * k), int(c[2] * k), c[3])


class Layer:
    def __init__(self):
        self.px = {}

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < FW and 0 <= y < FH:
            self.px[(x, y)] = c

    def outline(self):
        add = []
        for (x, y) in list(self.px.keys()):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if (x + dx, y + dy) not in self.px:
                    add.append((x + dx, y + dy))
        for p in add:
            if 0 <= p[0] < FW and 0 <= p[1] < FH:
                self.px[p] = OUT
        return self

    def paste(self, img):
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)


def poly_fill(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    out = []
    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            cx, cy = x + 0.5, y + 0.5
            inside = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > cy) != (yj > cy) and cx < (xj - xi) * (cy - yi) / (yj - yi + 1e-9) + xi:
                    inside = not inside
                j = i
            if inside:
                out.append((x, y))
    return out


def capsule(x0, y0, x1, y1, r):
    out = []
    for y in range(int(min(y0, y1) - r - 1), int(max(y0, y1) + r + 2)):
        for x in range(int(min(x0, x1) - r - 1), int(max(x0, x1) + r + 2)):
            px_, py_ = x + 0.5, y + 0.5
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy or 1e-9
            t = max(0, min(1, ((px_ - x0) * dx + (py_ - y0) * dy) / L2))
            qx, qy = x0 + dx * t, y0 + dy * t
            if (px_ - qx) ** 2 + (py_ - qy) ** 2 <= r * r:
                out.append((x, y))
    return out


def d(a):
    r = math.radians(a)
    return math.cos(r), math.sin(r)


# --------------------------------------------------------------- parts

TOP = 26     # shoulder line (v2: 29) - a taller, broader trunk
HEM = 54     # coat hem (v2: 51) - a longer, heavier coat


def draw_torso(P):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    ys = TOP + b
    hem = HEM + min(b, 2) - P.get("hemLift", 0)
    hb = P.get("hemBack", 0)
    hf = P.get("hemFront", 0)
    pts = [
        (23 + ln, ys + 1), (39.5 + ln, ys + 1),
        (40 + ln * 0.85, ys + 6), (38.5 + ln * 0.45, ys + 13),
        (40.5 + hf, hem - 1), (39.5 + hf, hem + 0.5),
        (30, hem + 1), (21 - hb, hem + 0.5 - hb * 0.3),
        (21.5 - hb * 0.6, ys + 15), (22 + ln * 0.5, ys + 4),
    ]
    pts = [(x + OX, y + OY) for x, y in pts]
    fill = poly_fill(pts)
    rows = {}
    for x, y in fill:
        rows.setdefault(y, []).append(x)
    sash_y = ys + 13 + OY
    bottom = max(rows)
    for x, y in fill:
        xs = rows[y]
        # torn hem: notches bitten out of the last rows
        if y >= bottom - 2 and ((x * 5 + bottom) % 7) < (y - bottom + 3) - 1:
            continue
        t = (x - min(xs)) / max(1, (max(xs) - min(xs)))
        c = ROBE["sh"] if t < 0.3 else ROBE["hi"] if t > 0.86 else ROBE["bs"]
        if y >= bottom - 1:
            c = ROBE["dk"]
        if y > sash_y + 2 and (x - min(xs)) % 5 == 2 and t < 0.9:
            c = ROBE["sh"]  # coat folds
        if y > sash_y + 2 and (x - min(xs)) % 5 == 3 and t < 0.86:
            c = ROBE["md"]
        if t > 0.94:
            c = ROBE["hi2"]
        L.put(x, y, c)
    # front opening of the coat, dark inner layer
    for i in range(13):
        x = 36 + ln - i * 0.3 + OX
        y = ys + 2 + i + OY
        L.put(x, y, ROBE["dk"])
    # sash: deep red, wide, knotted at the back with long tails
    for y in range(sash_y, sash_y + 4):
        for x in rows.get(y, []):
            L.put(x, y, SASH["hi"] if y == sash_y else SASH["dk"] if y == sash_y + 3 else SASH["bs"])
    kx = min(rows.get(sash_y, [22 + OX])) - 1
    tail = P.get("tail", 0)
    for i in range(8):
        L.put(kx - (i * tail) / 4, sash_y + 1 + i, SASH["bs"] if i < 6 else SASH["dk"])
        L.put(kx + 1 - (i * tail) / 4, sash_y + 1 + i, SASH["hi"] if i < 2 else SASH["bs"] if i < 7 else SASH["dk"])
    return L.outline()


def draw_mantle(P):
    """A ragged shoulder cape over the coat; its back edge streams with motion."""
    L = Layer()
    b, ln = P["bob"], P["lean"]
    ys = TOP + b
    hb = P.get("hemBack", 0)
    fl = P.get("tail", 0)
    pts = [(23 + ln, ys - 1), (38 + ln, ys - 1), (42 + ln * 0.9, ys + 4), (41 + ln * 0.8, ys + 11),
           (35 + ln * 0.6, ys + 12), (27 - hb * 0.8 - fl * 0.3, ys + 13 - hb * 0.3), (20 - hb * 1.1 - fl * 0.5, ys + 9 - hb * 0.3),
           (21 + ln * 0.5, ys + 1)]
    pts = [(x + OX, y + OY) for x, y in pts]
    fill = poly_fill(pts)
    rows = {}
    for x, y in fill:
        rows.setdefault(x, []).append(y)
    for x, y in fill:
        ys_ = rows[x]
        u = (y - min(ys_)) / max(1, max(ys_) - min(ys_))
        # tattered lower edge: uneven strips
        if u > 0.75 and (x * 3) % 4 == 0:
            continue
        c = MANTLE["hi"] if u < 0.2 else MANTLE["bs"] if u < 0.6 else MANTLE["sh"]
        if x > max(p[0] for p in pts) - 2:
            c = MANTLE["hi2"] if u < 0.5 else MANTLE["bs"]
        if (x - OX) % 4 == 1 and u > 0.3:
            c = MANTLE["sh"] if c != MANTLE["sh"] else MANTLE["dk"]
        L.put(x, y, c)
    return L.outline()


def sheath_frame(P):
    b, ln = P["bob"], P["lean"]
    pull = P.get("pull", 0)  # hilt tipped forward/down while gripping
    mx, my = 35.5 + ln * 0.45 + OX, 40 + b + OY  # scabbard mouth at the left hip
    ang = -24 + pull  # grip direction: forward, slightly up
    return mx, my, d(ang)


def draw_scabbard(P):
    """Scabbard body, worn through the sash and sticking out behind the back."""
    L = Layer()
    mx, my, (hx, hy) = sheath_frame(P)
    sag = P.get("sheathSag", 0)
    for i in range(0, 23):
        x, y = mx - hx * i, my - hy * i + (i * i) * 0.004 * sag
        L.put(x, y, SHEATH["bs"])
        L.put(x, y - 1, SHEATH["hi"] if i % 6 else GOLD[1])
        L.put(x, y + 1, SHEATH["dk"])
    x, y = mx - hx * 23, my - hy * 23
    L.put(x, y, GOLD[2])
    L.put(x, y - 1, GOLD[1])
    return L.outline()


def draw_sheath(P, with_hilt=True):
    L = Layer()
    mx, my, (hx, hy) = sheath_frame(P)
    for dx_, dy_ in ((0, 0), (0, -1), (0, 1)):
        L.put(mx + dx_, my + dy_, GOLD[1])
    if with_hilt:
        tx, ty = mx + hx * 1.5, my + hy * 1.5
        for o in (-2, -1, 0, 1, 2):
            L.put(tx + hy * o, ty - hx * o, GOLD[0] if o < 1 else GOLD[1])
        for i in range(2, 9):
            x, y = mx + hx * i, my + hy * i
            L.put(x, y, WRAP[i % 2])
            L.put(x + 1, y, WRAP[(i + 1) % 2])
        L.put(mx + hx * 9, my + hy * 9, GOLD[0])
        L.put(mx + hx * 9 + 1, my + hy * 9, GOLD[1])
    return L.outline()


def draw_blade(hand, ang, length=29):
    L = Layer()
    hx, hy = hand
    ux, uy = d(ang)
    nx, ny = -uy, ux
    for i in range(-7, 0):
        L.put(hx + ux * i, hy + uy * i, WRAP[i % 2])
        L.put(hx + ux * i + nx * 0.8, hy + uy * i + ny * 0.8, WRAP[(i + 1) % 2])
    L.put(hx - ux * 8, hy - uy * 8, GOLD[0])
    for o in (-2, -1, 0, 1, 2):
        L.put(hx + ux * 2 + nx * o, hy + uy * 2 + ny * o, GOLD[0] if o > -1 else GOLD[1])
    for i in range(3, length):
        x, y = hx + ux * i, hy + uy * i
        tip = i > length - 3
        L.put(x, y, BLADE["bs"] if not tip else BLADE["edge"])
        if not tip:
            L.put(x + nx, y + ny, BLADE["edge"])
            L.put(x - nx * 0.9, y - ny * 0.9, BLADE["back"] if i % 6 else BLADE["mid"])
    return L.outline()


def draw_smear(center, r0, r1, a_from, a_to):
    """Thin crescent trailing the blade on the strike frame (two flat tones)."""
    L = Layer()
    cx, cy = center
    span = abs(a_to - a_from)
    steps = max(10, int(span * r1 / 40))
    for s in range(steps + 1):
        u = s / steps
        a = a_from + (a_to - a_from) * u
        ca, sa = d(a)
        thick = 1 + (r1 - r0) * (u ** 1.6)
        for k in range(int(thick) + 1):
            r = r1 - k
            edge = k <= 1
            c = SMEAR[0] if edge else SMEAR[1]
            if u < 0.25 and not edge:
                continue
            L.put(cx + ca * r, cy + sa * r, c)
    return L


def draw_arm(P, back=False):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    a1, a2 = (P["barm"] if back else P["arm"])
    sx, sy = 30 + ln * 0.8 + OX + (-2 if back else 0), TOP + 3 + b + OY
    ex, ey = sx + d(a1)[0] * 8, sy + d(a1)[1] * 8
    wx, wy = ex + d(a1 + a2)[0] * 6, ey + d(a1 + a2)[1] * 6
    hx, hy = ex + d(a1 + a2)[0] * 9, ey + d(a1 + a2)[1] * 9
    k = 0.62 if back else 1.0
    dr = P.get("droop", (0, 1))
    droop = 5
    sleeve = set(capsule(sx, sy, ex, ey, 4.0)) | set(capsule(ex, ey, wx, wy, 3.3))
    hang = poly_fill([(sx, sy), (ex, ey), (wx, wy),
                      (wx + dr[0] * droop, wy + dr[1] * droop),
                      (ex + dr[0] * (droop + 1), ey + dr[1] * (droop + 1)),
                      (sx + dr[0] * 2, sy + dr[1] * 2)])
    sleeve |= set(hang)
    for (x, y) in sleeve:
        vx, vy = x - sx, y - sy
        side = vx * dr[0] + vy * dr[1]
        c = ROBE["sh"] if side > 5 else ROBE["md"] if side > 2.5 else ROBE["bs"] if side > 1 else ROBE["hi"]
        if not back and side < -0.5:
            c = ROBE["hi2"]
        L.put(x, y, shade(c, k))
    ux, uy = d(a1 + a2)
    for i, t in enumerate((0.0, 1.0, 2.0)):
        for o in (-1.5, -0.5, 0.5, 1.5):
            c = CUFF[(i + (1 if o > 0 else 0)) % 2]
            L.put(wx + ux * t + -uy * o, wy + uy * t + ux * o, shade(c, k))
    fist = capsule(hx - ux * 0.5, hy - uy * 0.5, hx + ux * 1.2, hy + uy * 1.2, 2.1)
    for (x, y) in fist:
        lx, ly = x - hx, y - hy
        c = SKIN["hi"] if ly < -1 else SKIN["sh"] if ly > 0.8 else SKIN["bs"]
        L.put(x, y, shade(c, k))
    L.outline()
    return L, (hx, hy), (sx, sy)


BOOTS = {
    "flat": [".OOOOO...", "ODMMMDO..", "ODMMHDO..", "ODMMHDO..", "ODMMMMDO.", "ODMMMMMDO", "OODDDDDDO", ".OOOOOOO."],
    "lift": [".OOOOO..", "ODMMMDO.", "ODMMHDO.", "ODMMMMDO", "ODMMMMDO", ".ODDDDDO", "..OOOOO."],
}


def draw_leg(L, hip_x, hip_y, foot_dx, lift, far=False, ground=77):
    k = 0.62 if far else 1.0
    boot = BOOTS["lift" if lift >= 2 else "flat"]
    bh = len(boot)
    by = ground - bh + 1 - lift
    bx = hip_x + foot_dx - 3
    top, bot = hip_y, by + 1
    for y in range(int(top), int(bot) + 1):
        t = 0 if bot == top else (y - top) / (bot - top)
        cx = round(hip_x + (bx + 1 - hip_x) * t)
        L.put(cx, y, OUT)
        wrap = y > bot - 6 and (y % 2 == 0)
        L.put(cx + 1, y, shade(LEGWRAP[1] if wrap else PANT[0], k))
        L.put(cx + 2, y, shade(LEGWRAP[0] if wrap else PANT[1], k))
        L.put(cx + 3, y, shade(LEGWRAP[1] if wrap else PANT[0], k))
        L.put(cx + 4, y, OUT)
    for j, row in enumerate(boot):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            c = OUT if ch == "O" else shade(BOOT[ch], k)
            L.put(bx + i, by + j, c)


def paste_img(img, src, dx, dy):
    tmp = Image.new("RGBA", (FW, FH))
    tmp.paste(src, (dx + OX, dy + OY))
    img.alpha_composite(tmp)


# --------------------------------------------------------------- frame

DEF = dict(bob=0, lean=0, headDy=0, bun=(0, 0), legs=((5, 0), (-4, 0)), arm=(62, -52), barm=(100, -20),
           droop=(0, 1), sword="sheath", hemBack=0, hemLift=0, hemFront=0, tail=1, pull=0, smear=None, showBack=False)


def frame(**kw):
    P = dict(DEF)
    P.update(kw)
    img = Image.new("RGBA", (FW, FH))
    b = P["bob"]
    legs = Layer()
    (ndx, nl), (fdx, fl) = P["legs"]
    hip_y = 51 + OY + max(0, b)
    hip_x = 28 + OX
    draw_leg(legs, hip_x + 2, hip_y, fdx, fl, far=True)
    draw_leg(legs, hip_x, hip_y, ndx, nl)
    if P["showBack"]:
        bl, _, _ = draw_arm(P, back=True)
        bl.paste(img)
    legs.paste(img)
    draw_scabbard(P).paste(img)
    draw_torso(P).paste(img)
    draw_mantle(P).paste(img)
    sw = P["sword"]
    held = isinstance(sw, tuple)
    draw_sheath(P, with_hilt=not held).paste(img)
    paste_img(img, HEAD, P["lean"], b + P["headDy"])
    bx, by = P["bun"]
    paste_img(img, BUN, P["lean"] + bx, b + P["headDy"] + by)
    arm, hand, shoulder = draw_arm(P)
    if held:
        if P["smear"]:
            a0, a1 = P["smear"]
            draw_smear(shoulder, 28, 33, a0, a1).paste(img)
        draw_blade(hand, sw[1]).paste(img)
    arm.paste(img)
    if P.get("vial"):
        # the nano ampoule glowing in his fist
        vx, vy = int(round(hand[0])), int(round(hand[1]))
        V = Layer()
        for dy in range(-4, 2):
            V.put(vx + 1, vy + dy, C(125, 255, 200) if dy > -3 else C(220, 255, 240))
            V.put(vx + 2, vy + dy, C(60, 200, 160) if dy > -3 else C(170, 240, 220))
        V.put(vx + 1, vy - 5, C(200, 200, 210))
        V.put(vx + 2, vy - 5, C(140, 140, 150))
        V.outline().paste(img)
    return img


def lying(img):
    """Rotate a crouched frame onto its back and re-seat it on the floor."""
    bbox = img.getbbox()
    crop = img.crop(bbox)
    rot = crop.rotate(90, expand=True, resample=Image.NEAREST)
    out = Image.new("RGBA", (FW, FH))
    x = 46 - rot.width // 2
    y = 78 - rot.height
    out.alpha_composite(rot, (x, y))
    return out


def build():
    ANIMS = {}
    frames = []

    def anim(name, fps, loop, *fs):
        s = len(frames)
        frames.extend(fs)
        ANIMS[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}

    anim("idle", 6, True,
         frame(), frame(), frame(bob=1, bun=(0, 1)), frame(bob=1, headDy=1, bun=(0, 1)), frame(bob=1), frame(bun=(0, -1)))

    RUN_LEGS = [((7, 0), (-6, 0)), ((3, 0), (-2, 3)), ((0, 0), (2, 5)), ((-3, 0), (5, 2)),
                ((-6, 0), (7, 0)), ((-2, 3), (3, 0)), ((2, 5), (0, 0)), ((5, 2), (-3, 0))]
    RUN_BOB = [1, 0, -1, 0, 1, 0, -1, 0]
    RUN_ARM = [(20, -50), (45, -45), (80, -30), (115, -15), (140, -10), (110, -20), (70, -35), (35, -50)]
    anim("run", 14, True, *[
        frame(bob=RUN_BOB[i], lean=3, headDy=1 if RUN_BOB[i] < 0 else 0, legs=RUN_LEGS[i], arm=RUN_ARM[i],
              barm=(RUN_ARM[(i + 4) % 8][0], -20), showBack=True, droop=(-0.6, 0.8),
              bun=(-1, 1 if RUN_BOB[i] < 0 else -1 if RUN_BOB[i] > 0 else 0),
              hemBack=2 + (i % 2), tail=3 + (i % 2), pull=4)
        for i in range(8)])
    anim("skid", 12, False,
         frame(bob=2, lean=-3, legs=((9, 0), (-3, 0)), arm=(-10, -30), droop=(0.6, 0.8), hemFront=2, tail=-2, bun=(1, 0)),
         frame(bob=2, lean=-2, legs=((8, 0), (-3, 0)), arm=(0, -35), droop=(0.6, 0.8), hemFront=1, tail=-1))
    anim("jump", 12, False,
         frame(bob=-2, lean=1, legs=((3, 0), (-2, 1)), arm=(125, -15), droop=(-0.5, 0.9), bun=(0, 2), hemLift=0, tail=-1),
         frame(bob=-1, lean=1, legs=((5, 4), (-1, 3)), arm=(110, -25), droop=(-0.4, 1), bun=(0, 1), hemLift=1, tail=-1))
    anim("apex", 10, False,
         frame(bob=0, lean=0, legs=((5, 4), (-2, 3)), arm=(25, -35), droop=(0, 1), hemLift=2, tail=-1))
    anim("fall", 10, True,
         frame(bob=0, lean=-1, legs=((4, 1), (-3, 3)), arm=(-150, 15), droop=(0.3, -1), bun=(0, -2), hemLift=3, hemBack=1, tail=-3),
         frame(bob=0, lean=-1, legs=((4, 2), (-3, 2)), arm=(-158, 10), droop=(0.3, -1), bun=(0, -1), hemLift=4, hemBack=2, tail=-4))
    anim("land", 16, False,
         frame(bob=5, lean=2, headDy=1, legs=((8, 0), (-7, 0)), arm=(40, -30), bun=(0, 2), hemBack=2, tail=1),
         frame(bob=2, lean=1, legs=((6, 0), (-5, 0)), arm=(55, -45), bun=(0, 1), hemBack=1))
    anim("dash", 20, True,
         frame(bob=2, lean=6, legs=((-4, 3), (-8, 2)), arm=(170, 10), droop=(-1, 0.2), hemBack=6, tail=6, bun=(-2, 0), pull=10),
         frame(bob=2, lean=6, legs=((-5, 3), (-9, 3)), arm=(175, 5), droop=(-1, 0.1), hemBack=7, tail=7, bun=(-3, 0), pull=10))
    anim("hurt", 10, False,
         frame(bob=0, lean=-4, headDy=-1, legs=((6, 2), (-5, 0)), arm=(-150, 20), droop=(1, 0.5), hemFront=2, tail=-2, bun=(2, -1)),
         frame(bob=1, lean=-3, legs=((6, 1), (-5, 0)), arm=(-170, 30), droop=(1, 0.5), hemFront=1, tail=-1, bun=(1, 0)))

    # iai draw-slash parries; A is the slash direction
    def parry_frames(A, air):
        legs_g = [((8, 0), (-7, 0)), ((9, 0), (-8, 0)), ((9, 0), (-8, 0)), ((8, 0), (-7, 0)), ((6, 0), (-5, 0))]
        legs_a = [((4, 3), (-3, 2)), ((5, 4), (-4, 1)), ((5, 3), (-4, 2)), ((4, 2), (-3, 3)), ((4, 2), (-3, 3))]
        Lg = legs_a if air else legs_g
        bob = [2, 1, 1, 1, 1] if not air else [0, 0, 0, 0, 0]
        return [
            frame(bob=bob[0], lean=3, legs=Lg[0], arm=(75, -70), pull=14, droop=(0, 1), hemBack=1, tail=1, bun=(0, 1)),
            frame(bob=bob[1], lean=5, legs=Lg[1], arm=(A, 0), droop=(-0.4, 0.9), sword=("held", A - 8),
                  smear=(A + 78, A - 8), hemBack=3, tail=3, bun=(-2, 0)),
            frame(bob=bob[2], lean=4, legs=Lg[2], arm=(A - 35, -10), droop=(-0.3, 1), sword=("held", A - 55),
                  smear=(A + 10, A - 55), hemBack=2, tail=2, bun=(-1, 0)),
            frame(bob=bob[3], lean=3, legs=Lg[3], arm=(A - 30, -25), droop=(0, 1), sword=("held", A - 78), hemBack=1, tail=1),
            frame(bob=bob[4], lean=1, legs=Lg[4], arm=(50, -45), droop=(0, 1), sword=("held", 120), hemBack=0, tail=1),
        ]

    for name, A in (("fwd", 0), ("up", -50), ("down", 42)):
        anim(f"parry_{name}", 26, False, *parry_frames(A, False))
        anim(f"parry_{name}_air", 26, False, *parry_frames(A, True))

    # offensive cuts (left click). A tilts the whole motion.
    def slash_frames(A, air, combo):
        lg = [((8, 0), (-7, 0)), ((10, 0), (-6, 0)), ((9, 0), (-6, 0)), ((7, 0), (-6, 0))]
        la = [((4, 3), (-3, 2)), ((5, 2), (-4, 3)), ((5, 3), (-4, 2)), ((4, 2), (-3, 3))]
        Lg = la if air else lg
        bob = [0, 2, 2, 1] if not air else [0, 0, 0, 0]
        if combo == 1:  # overhead cut, forward and down
            return [
                frame(bob=bob[0], lean=-1, legs=Lg[0], arm=(A - 125, -25), droop=(0.3, 1), sword=("held", A - 160), hemBack=0, bun=(1, 0), tail=0),
                frame(bob=bob[1], lean=5, legs=Lg[1], arm=(A + 12, 0), droop=(-0.3, 1), sword=("held", A + 32), smear=(A - 80, A + 32), hemBack=3, tail=3, bun=(-2, 1)),
                frame(bob=bob[2], lean=4, legs=Lg[2], arm=(A + 45, -5), droop=(0, 1), sword=("held", A + 72), smear=(A + 10, A + 72), hemBack=2, tail=2, bun=(-1, 1)),
                frame(bob=bob[3], lean=2, legs=Lg[3], arm=(A + 40, -30), droop=(0, 1), sword=("held", A + 35), hemBack=1, tail=1),
            ]
        return [  # rising cut
            frame(bob=bob[1], lean=2, legs=Lg[0], arm=(A + 115, 10), droop=(0, 1), sword=("held", A + 150), hemBack=1, bun=(0, 1), tail=1),
            frame(bob=bob[0], lean=4, legs=Lg[1], arm=(A - 25, 0), droop=(-0.3, 1), sword=("held", A - 48), smear=(A + 62, A - 48), hemBack=3, tail=3, bun=(-2, -1)),
            frame(bob=bob[0], lean=3, legs=Lg[2], arm=(A - 65, -5), droop=(0, 1), sword=("held", A - 100), smear=(A - 20, A - 100), hemBack=2, tail=2, bun=(-1, -1)),
            frame(bob=bob[3], lean=2, legs=Lg[3], arm=(A - 30, -25), droop=(0, 1), sword=("held", A - 45), hemBack=1, tail=1),
        ]

    for name, A in (("fwd", 0), ("up", -45), ("down", 35)):
        for combo in (1, 2):
            anim(f"slash{combo}_{name}", 28, False, *slash_frames(A, False, combo))
            anim(f"slash{combo}_{name}_air", 28, False, *slash_frames(A, True, combo))

    # nano ampoule: pull it from the sash, jab it into the neck, shudder
    anim("heal", 10, False,
         frame(bob=1, lean=1, legs=((6, 0), (-5, 0)), arm=(75, -120), droop=(0, 1), bun=(0, 1), pull=4, vial=True),
         frame(bob=1, lean=-1, headDy=0, legs=((6, 0), (-5, 0)), arm=(30, -165), droop=(0.2, 1), bun=(1, 0), vial=True),
         frame(bob=2, lean=-2, headDy=1, legs=((6, 0), (-5, 0)), arm=(22, -172), droop=(0.3, 1), bun=(1, 1), hemFront=1, vial=True),
         frame(bob=2, lean=-2, headDy=1, legs=((6, 0), (-5, 0)), arm=(24, -170), droop=(0.3, 1), bun=(2, 1), hemFront=1),
         frame(bob=1, lean=0, legs=((6, 0), (-5, 0)), arm=(60, -110), droop=(0, 1), bun=(0, 0)))
    # death: stagger, drop to a knee, collapse
    kneel = frame(bob=9, lean=4, headDy=1, legs=((7, 0), (-2, 0)), arm=(90, -10), droop=(0, 1), hemLift=-1, tail=0)
    anim("death", 8, False,
         frame(bob=0, lean=-4, headDy=-1, legs=((6, 2), (-5, 0)), arm=(-150, 20), droop=(1, 0.5), hemFront=2, bun=(2, -1)),
         frame(bob=4, lean=-2, legs=((7, 0), (-4, 0)), arm=(120, -10), droop=(0, 1), bun=(0, 1)),
         kneel,
         frame(bob=10, lean=6, headDy=2, legs=((7, 0), (-2, 0)), arm=(100, 0), droop=(0, 1), hemLift=-1, bun=(1, 2)))
    ANIMS["death"]["end"] += 1
    frames.append(lying(kneel))
    anim("dead", 1, False, frames[-1])
    ANIMS["parry"] = ANIMS["parry_fwd"]
    ANIMS["wall"] = ANIMS["fall"]  # wall slide parked; lookups never fail
    return frames, ANIMS


def save_sheet(frames, path):
    COLS = 16  # keep the texture well under 4096 px wide
    rows_n = (len(frames) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (FW * COLS, FH * rows_n))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % COLS) * FW, (i // COLS) * FH))
    sheet.save(path)


if __name__ == "__main__":
    frames, ANIMS = build()
    save_sheet(frames, "assets/hero.png")
    with open("assets/hero.json", "w") as fh:
        json.dump({"frameWidth": FW, "frameHeight": FH, "originX": 46, "originY": 78, "anims": ANIMS}, fh, indent=1)
    order = [k for k in ANIMS if k not in ("parry", "wall") and not k.endswith("_air") and ("slash" not in k or k.endswith("fwd"))]
    S = 3
    maxlen = max(ANIMS[k]["end"] - ANIMS[k]["start"] + 1 for k in order)
    prev = Image.new("RGBA", (maxlen * FW * S, len(order) * FH * S), (40, 30, 60, 255))
    for r, k in enumerate(order):
        a = ANIMS[k]
        for c, idx in enumerate(range(a["start"], a["end"] + 1)):
            prev.alpha_composite(frames[idx].resize((FW * S, FH * S), Image.NEAREST), (c * FW * S, r * FH * S))
    prev.save("scratch/hero3_preview.png")
    print(len(frames), "frames", order)
