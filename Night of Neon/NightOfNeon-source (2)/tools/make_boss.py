"""Crimson Oni (홍귀): the stage-1 boss. Its own part-based rig, bigger than
the hero: horned kabuto with an oni menpo, lacquered do, huge sode, a
tasset skirt, a tattered cape and a two-handed odachi (arms solved by IK
so both hands stay on the grip).

Frames are 160x128. Facing right. Feet rest on row 122, body centre x 70.
"""
import json
import math
import sys
from PIL import Image

sys.path.insert(0, "tools")
import make_hero2 as H  # noqa: E402

FW, FH = 160, 128
H.FW, H.FH = FW, FH  # Layer bounds
CX, G = 70, 122
C = H.C
OUT = (6, 3, 5, 255)

ARM = {"dk": C(14, 12, 20), "sh": C(28, 26, 38), "bs": C(44, 40, 58), "md": C(58, 52, 74), "hi": C(86, 80, 108), "hi2": C(130, 122, 152)}
LACE = {"dk": C(84, 10, 30), "bs": C(168, 26, 54), "hi": C(232, 66, 92)}
IRON = {"dk": C(20, 19, 27), "sh": C(38, 37, 50), "bs": C(60, 59, 76), "hi": C(98, 98, 120), "hi2": C(156, 156, 178)}
GOLD = [C(255, 206, 120), C(216, 150, 62), C(140, 88, 32)]
NEON = {"core": C(255, 42, 109), "hot": C(255, 222, 232), "dim": C(160, 20, 60)}
CAPE = {"dk": C(48, 8, 20), "bs": C(104, 16, 38), "hi": C(160, 34, 58)}
BLADE = {"back": C(56, 54, 70), "bs": C(150, 148, 170), "hi": C(214, 212, 230), "edge": C(255, 80, 116), "tip": C(255, 232, 240)}
WRAP = [C(40, 10, 18), C(150, 30, 50)]
SMEAR = [C(255, 210, 222, 235), C(255, 50, 96, 165)]
H.SMEAR = SMEAR

Layer = H.Layer
poly_fill = H.poly_fill
capsule = H.capsule
d = H.d


def outlined(L):
    add = []
    for (x, y) in list(L.px.keys()):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in L.px:
                add.append((x + dx, y + dy))
    for p in add:
        if 0 <= p[0] < FW and 0 <= p[1] < FH:
            L.px[p] = OUT
    return L


def shade(c, k):
    return (int(c[0] * k), int(c[1] * k), int(c[2] * k), c[3])


# ----------------------------------------------------------------- IK

def ik(sx, sy, tx, ty, l1, l2, bend):
    """Two-bone IK. bend = +1 elbow below the line, -1 above."""
    dx, dy = tx - sx, ty - sy
    dist = math.hypot(dx, dy)
    dist = max(1e-3, min(dist, l1 + l2 - 0.01))
    a = math.atan2(dy, dx)
    cos_e = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
    e = math.acos(max(-1, min(1, cos_e)))
    ea = a + e * bend
    ex, ey = sx + math.cos(ea) * l1, sy + math.sin(ea) * l1
    hx, hy = sx + math.cos(a) * dist, sy + math.sin(a) * dist
    return (ex, ey), (hx, hy)


# ---------------------------------------------------------------- parts

def draw_cape(P):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    sx, sy = CX - 7 + ln, G - 68 + b
    flow = P["cape"]  # degrees the cape trails behind (0 = hangs down)
    wave = P["wave"]
    length = 46
    sa, ca = math.sin(math.radians(flow)), math.cos(math.radians(flow))
    pts_l, pts_r = [], []
    for i in range(length + 1):
        u = i / length
        x = sx - i * sa * (0.35 + 0.65 * u) + math.sin(u * 5 + wave) * 2 * u
        y = sy + i * ca * (0.55 + 0.45 * (1 - u)) + math.cos(u * 6 + wave) * 1.5 * u
        w = 9 + 9 * u
        pts_l.append((x - w * 0.5 * ca - 1, y - w * 0.5 * sa * 0.3))
        pts_r.append((x + w * 0.5 * ca + 1, y + w * 0.5 * sa * 0.3))
    poly = pts_l + list(reversed(pts_r))
    fill = set(poly_fill(poly))
    if not fill:
        return L
    # tattered hem: ragged strips at the far end
    for (x, y) in list(fill):
        dist = math.hypot(x - sx, y - sy)
        if dist > length - 9 and ((x + y * 3 + int(wave * 4)) % 7) < 3 + (dist > length - 4) * 2:
            fill.discard((x, y))
    for (x, y) in fill:
        dist = math.hypot(x - sx, y - sy) / length
        fold = (int((x - sx) * ca + (y - sy) * sa * 0.2 + wave * 3) % 7)
        c = CAPE["hi"] if fold == 0 and dist < 0.7 else CAPE["dk"] if fold in (4, 5) or dist > 0.85 else CAPE["bs"]
        L.put(x, y, c)
    return outlined(L)


def draw_leg(L, hip_x, hip_y, foot_dx, lift, far=False):
    k = 0.6 if far else 1.0
    fx = hip_x + foot_dx
    fy = G - lift
    # knee pushed forward a little
    kx = (hip_x + fx) / 2 + 2 + (2 if lift else 0)
    ky = (hip_y + fy) / 2 - (lift * 0.5)
    thigh = capsule(hip_x, hip_y, kx, ky, 4.4)
    shin = capsule(kx, ky, fx, fy - 5, 3.9)
    for (x, y) in thigh:
        L.put(x, y, shade(IRON["sh"] if (x - kx) < -1 else IRON["bs"], k))
    for (x, y) in shin:
        rel = x - (kx + (fx - kx) * max(0, min(1, (y - ky) / max(1, fy - 5 - ky))))
        c = IRON["hi"] if rel > 1.2 else IRON["bs"] if rel > -1.2 else IRON["sh"]
        L.put(x, y, shade(c, k))
    # shin-guard plate and knee cap
    for i in range(3):
        L.put(kx + 1, ky + 3 + i * 4, shade(GOLD[1], k))
    for (x, y) in capsule(kx, ky, kx + 1, ky, 3.0):
        L.put(x, y, shade(LACE["bs"] if y < ky else LACE["dk"], k))
    # sabaton
    for y in range(int(fy) - 5, int(fy) + 1):
        for x in range(int(fx) - 5, int(fx) + 8):
            if y == int(fy) - 5 and x > fx + 4:
                continue
            c = IRON["dk"] if y >= fy - 1 else IRON["hi"] if y == int(fy) - 5 else IRON["bs"]
            L.put(x, y, shade(c, k))


def draw_legs(P):
    L = Layer()
    b = P["bob"]
    hip_y = G - 32 + max(0, b)
    (ndx, nl), (fdx, fl) = P["legs"]
    draw_leg(L, CX - 5, hip_y, fdx, fl, far=True)
    draw_leg(L, CX + 3, hip_y, ndx, nl)
    return outlined(L)


def draw_skirt(P):
    """Kusazuri: three rows of black lacquer lames laced with crimson cord."""
    L = Layer()
    b, ln = P["bob"], P["lean"]
    top = G - 50 + b
    bot = G - 27 + min(b, 3) - P["hemLift"]
    hb, hf = P["hemBack"], P["hemFront"]
    x0, x1 = CX - 15 + ln * 0.4, CX + 15 + ln * 0.4
    pts = [(x0 + 1, top), (x1 - 1, top), (x1 + 5 + hf, bot), (CX + 3, bot + 1), (x0 - 6 - hb, bot - hb * 0.4)]
    fill = poly_fill(pts)
    rh = (bot - top + 1) / 3
    rows = {}
    for x, y in fill:
        rows.setdefault(y, []).append(x)
    for (x, y) in fill:
        xs = rows[y]
        t = (x - min(xs)) / max(1, max(xs) - min(xs))
        ly = (y - top) % max(1, int(rh))
        c = ARM["sh"] if t < 0.25 else ARM["hi"] if t > 0.85 else ARM["bs"]
        if ly == 0:
            c = LACE["hi"] if t > 0.6 else LACE["bs"]
        elif ly == 1:
            c = LACE["dk"] if (x % 3 == 0) else ARM["md"]
        elif ly == int(rh) - 1:
            c = ARM["dk"]
        if (x - int(x0) + int((y - top) // rh) * 4) % 9 == 0 and ly > 1:
            c = ARM["dk"]
        L.put(x, y, c)
    return outlined(L)


def draw_torso(P):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    ys = G - 70 + b
    yw = G - 48 + b
    pts = [(CX - 13 + ln, ys), (CX + 13 + ln, ys), (CX + 15 + ln * 0.8, ys + 9),
           (CX + 12 + ln * 0.5, yw), (CX - 12 + ln * 0.4, yw), (CX - 14 + ln * 0.9, ys + 7)]
    fill = poly_fill(pts)
    rows = {}
    for x, y in fill:
        rows.setdefault(y, []).append(x)
    for (x, y) in fill:
        xs = rows[y]
        t = (x - min(xs)) / max(1, max(xs) - min(xs))
        c = ARM["sh"] if t < 0.2 else ARM["hi"] if t > 0.82 else ARM["bs"]
        if t > 0.93:
            c = ARM["hi2"]
        lame = (y - ys) % 5
        if y > ys + 8:
            if lame == 0:
                c = LACE["bs"] if t > 0.15 else LACE["dk"]
            elif lame == 4:
                c = ARM["dk"]
        if y <= ys + 1:
            c = GOLD[0] if t > 0.55 else GOLD[1]
        L.put(x, y, c)
    # glowing reactor core in the breastplate
    cx, cy = CX + 5 + ln * 0.8, ys + 6
    for dy in range(-3, 4):
        w = 3 - abs(dy)
        for dx in range(-w, w + 1):
            L.put(cx + dx, cy + dy, NEON["hot"] if abs(dx) + abs(dy) <= 1 else NEON["core"])
    # obi
    for y in range(yw - 2, yw + 1):
        for x in rows.get(y, []):
            L.put(x, y, LACE["dk"] if y == yw else LACE["bs"])
    return outlined(L)


def draw_sode(P, front=True):
    """Shoulder plate hanging from the shoulder, tilting with the upper arm."""
    L = Layer()
    b, ln = P["bob"], P["lean"]
    sx, sy = (CX + 8 + ln, G - 69 + b) if front else (CX - 9 + ln, G - 69 + b)
    tilt = P["_sodeTilt" if front else "_sodeTiltB"]
    ux, uy = d(90 + tilt)  # hangs downward
    nx, ny = -uy, ux
    w, hgt = (10, 19) if front else (8, 16)
    pts = [(sx + nx * -w * 0.6 - ux, sy + ny * -w * 0.6 - uy), (sx + nx * w - ux, sy + ny * w - uy),
           (sx + nx * (w + 1) + ux * hgt, sy + ny * (w + 1) + uy * hgt), (sx + nx * -w * 0.7 + ux * hgt, sy + ny * -w * 0.7 + uy * hgt)]
    fill = poly_fill(pts)
    k = 1.0 if front else 0.55
    for (x, y) in fill:
        along = (x - sx) * ux + (y - sy) * uy
        across = (x - sx) * nx + (y - sy) * ny
        c = ARM["bs"] if across < w - 3 else ARM["hi"]
        if across < -w * 0.4:
            c = ARM["sh"]
        if int(along) % 5 == 0:
            c = LACE["hi"] if across > w - 4 else LACE["bs"]
        if along < 1.2:
            c = GOLD[1]
        if along > hgt - 1.5:
            c = ARM["dk"]
        L.put(x, y, shade(c, k))
    return outlined(L)


def draw_head(P):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    hx, hy = CX + 3 + ln * 1.1, G - 80 + b + P["headDy"]
    broken = P["broken"]
    # shikoro: neck guard flaring down and back, laced like the armor
    for i in range(3):
        y0 = hy + 4 + i * 3
        for x in range(int(hx - 17 - i * 3), int(hx + 3)):
            for y in range(int(y0), int(y0) + 3):
                c = LACE["bs"] if y == int(y0) else ARM["bs"] if y == int(y0) + 1 else ARM["sh"]
                L.put(x, y, c)
    # bowl
    for y in range(int(hy - 15), int(hy + 4)):
        for x in range(int(hx - 15), int(hx + 15)):
            if ((x + 0.5 - hx) / 14.5) ** 2 + ((y + 0.5 - hy + 1) / 13.5) ** 2 <= 1:
                t = ((x - hx) * -0.5 + (y - hy) * -0.85) / 13
                c = IRON["hi"] if t > 0.55 else IRON["bs"] if t > 0.05 else IRON["sh"] if t > -0.5 else IRON["dk"]
                if (x - int(hx) + 1) % 6 == 0 and y < hy - 3:
                    c = IRON["dk"] if t < 0.5 else IRON["bs"]  # riveted ribs
                L.put(x, y, c)
    # brim (mabizashi)
    for x in range(int(hx - 10), int(hx + 17)):
        L.put(x, hy - 3, IRON["dk"])
        L.put(x, hy - 2, IRON["sh"] if x < hx + 15 else OUT)
    # menpo: iron oni face plate with lacquered cheeks
    mx = hx + 3
    for y in range(int(hy - 1), int(hy + 14)):
        for x in range(int(mx - 3), int(mx + 14)):
            if x - mx > 12 - max(0, y - hy - 8) * 1.5:
                continue
            c = IRON["bs"] if y < hy + 4 else LACE["dk"] if x - mx < 4 else LACE["bs"]
            if x - mx > 10 and y < hy + 6:
                c = IRON["hi"]
            L.put(x, y, c)
    # nose ridge
    for y in range(int(hy + 2), int(hy + 7)):
        L.put(mx + 12 - (y - hy - 2) * 0.2, y, IRON["hi2"])
    if not broken:
        # burning eye under a scowling brow
        for x in range(int(mx + 1), int(mx + 11)):
            L.put(x, hy + 1, OUT)
            L.put(x, hy + 2, NEON["core"])
            L.put(x, hy + 3, OUT if x < mx + 3 or x > mx + 8 else NEON["dim"])
        for x in (mx + 6, mx + 7, mx + 8):
            L.put(x, hy + 2, NEON["hot"])
        for i in range(8):
            L.put(mx + 2 + i, hy - 0.6 - i * 0.45, IRON["hi2"])
    else:
        # the left half of the mask is gone: a naked cyber eye glares out
        for (x, y) in list(L.px.keys()):
            if x > mx and y < hy + 7 and y > hy - 8 and (x - mx) * 0.9 + (hy + 7 - y) * 0.7 > 7:
                L.px.pop((x, y), None)
        for (x, y) in capsule(mx + 7, hy + 1, mx + 7, hy + 1, 3.2):
            L.put(x, y, IRON["dk"])
        for (x, y) in capsule(mx + 7, hy + 1, mx + 7, hy + 1, 2.0):
            L.put(x, y, NEON["core"])
        L.put(mx + 7, hy + 1, NEON["hot"])
        L.put(mx + 8, hy, NEON["hot"])
        for i in range(5):  # torn wiring
            L.put(mx + 3 + i, hy + 5 + (i % 2), NEON["dim"] if i % 2 else IRON["hi"])
    # fangs under a grille mouth
    for x in range(int(mx + 3), int(mx + 13)):
        L.put(x, hy + 9, OUT)
    for i in range(5):
        x = mx + 4 + i * 2
        L.put(x, hy + 10, C(240, 232, 218))
        if i in (0, 4):
            L.put(x, hy + 11, C(240, 232, 218))
            L.put(x, hy + 12, C(200, 190, 176))
    # crest (maedate) between the horns
    for (x, y) in capsule(hx + 4, hy - 8, hx + 4, hy - 8, 2.3):
        L.put(x, y, GOLD[0] if y < hy - 8 else GOLD[2])
    L.put(hx + 4, hy - 8, NEON["core"])
    return outlined(L), (hx, hy)


def draw_horns(P, hx, hy):
    """Two great horns in a V: the far one sweeps back, the near one up and forward."""
    L = Layer()
    for far in (True, False):
        k = 0.6 if far else 1.0
        bx = hx + (-4 if far else 8)
        by = hy - (11 if far else 9)
        n = 22
        for i in range(n + 1):
            u = i / n
            if far:
                x = bx - u * 10 - (u ** 2) * 8
                y = by - u * 22 + (u ** 3) * 2
            else:
                x = bx + u * 6 - (u ** 2) * 9
                y = by - u * 26 + (u ** 3) * 3
            r = 3.6 * (1 - u) ** 0.8 + 0.5
            for (qx, qy) in capsule(x, y, x, y, r):
                rel = qx - x
                c = IRON["hi"] if rel > 0.6 else IRON["bs"] if rel > -1 else IRON["sh"]
                if u > 0.8:
                    c = NEON["hot"] if u > 0.92 else NEON["core"]
                elif i % 5 == 0 and u > 0.2:
                    c = LACE["bs"]
                L.put(qx, qy, shade(c, k))
    return outlined(L)


def draw_pods(P):
    """Phase two: twin gun pods unfolded from the back plate, over the shoulders."""
    L = Layer()
    b, ln = P["bob"], P["lean"]
    bx, by = CX - 30 + ln, G - 93 + b
    # mounting struts down to the back plate
    for t in range(12):
        L.put(bx + 9 + t * 0.4, by + 7 + t, IRON["sh"])
        L.put(bx + 10 + t * 0.4, by + 7 + t, IRON["dk"])
    for i, (ox, oy) in enumerate(((0, 0), (-4, 8))):
        k = 1.0 if i == 0 else 0.6
        x0, y0 = bx + ox, by + oy
        for y in range(int(y0), int(y0) + 7):
            for x in range(int(x0), int(x0) + 12):
                c = IRON["hi"] if y == int(y0) else IRON["sh"] if y >= int(y0) + 5 else IRON["bs"]
                L.put(x, y, shade(c, k))
        for x in range(int(x0) + 2, int(x0) + 10, 3):
            L.put(x, y0 + 3, shade(LACE["bs"], k))
        # barrels angled up and forward
        for j in range(8):
            for o in (0, 2):
                L.put(x0 + 11 + j * 0.9, y0 + 1 + o - j * 0.45, shade(IRON["dk"] if o else IRON["hi"], k))
        L.put(x0 + 18.5, y0 - 2.2, shade(NEON["core"], k))
        L.put(x0 + 18.5, y0 - 0.2, shade(NEON["core"], k))
    return outlined(L)


def draw_blade(hand, ang, length=52, curve=3):
    L = Layer()
    hx, hy = hand
    ux, uy = d(ang)
    nx, ny = -uy, ux
    # grip (tsuka) extends back past the second hand
    for i in range(-13, 0):
        for o in (-0.6, 0.6):
            L.put(hx + ux * i + nx * o, hy + uy * i + ny * o, WRAP[(i + (o > 0)) % 2])
    L.put(hx - ux * 14, hy - uy * 14, GOLD[0])
    L.put(hx - ux * 14 + nx, hy - uy * 14 + ny, GOLD[1])
    # tsuba
    for o in range(-3, 4):
        L.put(hx + ux * 1 + nx * o, hy + uy * 1 + ny * o, GOLD[0] if o < 1 else GOLD[2])
        L.put(hx + ux * 2 + nx * o, hy + uy * 2 + ny * o, GOLD[1])
    # habaki
    L.put(hx + ux * 3, hy + uy * 3, GOLD[0])
    for i in range(3, length):
        u = i / length
        bend = curve * u * u  # sori bends toward the back of the blade
        x, y = hx + ux * i - nx * bend, hy + uy * i - ny * bend
        tip = i > length - 3
        if tip:
            L.put(x, y, BLADE["tip"])
            continue
        L.put(x, y, BLADE["hi"])
        L.put(x + nx, y + ny, BLADE["edge"])
        L.put(x - nx, y - ny, BLADE["bs"])
        if i < length - 8:
            L.put(x - nx * 1.9, y - ny * 1.9, BLADE["back"])
    return outlined(L)


def draw_smear(center, r0, r1, a_from, a_to):
    L = Layer()
    cx, cy = center
    span = abs(a_to - a_from)
    steps = max(14, int(span * r1 / 30))
    for s in range(steps + 1):
        u = s / steps
        a = a_from + (a_to - a_from) * u
        ca, sa = d(a)
        thick = 1 + (r1 - r0) * (u ** 1.4)
        for k in range(int(thick) + 1):
            r = r1 - k
            edge = k <= 1
            if u < 0.2 and not edge:
                continue
            L.put(cx + ca * r, cy + sa * r, SMEAR[0] if edge else SMEAR[1])
    return L


def draw_arm(P, front):
    L = Layer()
    b, ln = P["bob"], P["lean"]
    sx, sy = (CX + 8 + ln, G - 66 + b) if front else (CX - 9 + ln, G - 66 + b)
    tx, ty = P["_handF"] if front else P["_handB"]
    (ex, ey), (hx, hy) = ik(sx, sy, tx, ty, 13, 12, 1)
    k = 1.0 if front else 0.6
    for (x, y) in capsule(sx, sy, ex, ey, 3.8):
        L.put(x, y, shade(LACE["dk"] if y > (sy + ey) / 2 + 1 else LACE["bs"], k))
    for (x, y) in capsule(ex, ey, hx, hy, 3.0):
        L.put(x, y, shade(IRON["bs"] if (x + y) % 5 else IRON["hi"], k))
    # gold bands on the kote
    mx, my = (ex + hx) / 2, (ey + hy) / 2
    L.put(mx, my, shade(GOLD[1], k))
    L.put(ex, ey, shade(GOLD[0], k))
    for (x, y) in capsule(hx, hy, hx, hy, 2.5):
        L.put(x, y, shade(IRON["dk"] if y > hy + 0.5 else IRON["sh"], k))
    # the upper arm angle tilts the sode
    ua = math.degrees(math.atan2(ey - sy, ex - sx))
    return outlined(L), ua


DEF = dict(bob=0, lean=0, headDy=0, legs=((7, 0), (-6, 0)), hand=(12, 8), sword=-35, two=True, backHand=None,
           smear=None, hemBack=0, hemFront=0, hemLift=0, cape=25, wave=0.0, broken=False, smearR=(40, 47))


def frame(**kw):
    P = dict(DEF)
    P.update(kw)
    b, ln = P["bob"], P["lean"]
    hcx, hcy = CX + ln, G - 58 + b
    hf = (hcx + P["hand"][0], hcy + P["hand"][1])
    ux, uy = d(P["sword"])
    if P["two"]:
        hb = (hf[0] - ux * 7, hf[1] - uy * 7)
    else:
        bh = P["backHand"] or (2, 10)
        hb = (hcx + bh[0], hcy + bh[1])
    P["_handF"], P["_handB"] = hf, hb
    img = Image.new("RGBA", (FW, FH))
    armB, uaB = draw_arm(P, front=False)
    armF, uaF = draw_arm(P, front=True)
    P["_sodeTilt"] = max(-55, min(55, (uaF - 90) * 0.35))
    P["_sodeTiltB"] = max(-55, min(55, (uaB - 90) * 0.3))
    draw_cape(P).paste(img)
    if P["broken"]:
        draw_pods(P).paste(img)
    armB.paste(img)
    draw_sode(P, front=False).paste(img)
    draw_legs(P).paste(img)
    draw_skirt(P).paste(img)
    draw_torso(P).paste(img)
    head, (hx, hy) = draw_head(P)
    draw_horns(P, hx, hy).paste(img)
    head.paste(img)
    if P["smear"]:
        a0, a1 = P["smear"]
        sx, sy = CX + 4 + ln, G - 64 + b
        r0, r1 = P["smearR"]
        draw_smear((sx, sy), r0, r1, a0, a1).paste(img)
    blade = draw_blade(hf, P["sword"])
    behind = 100 < (P["sword"] % 360) < 260 and not P["two"]
    if behind:
        blade.paste(img)
    draw_sode(P, front=True).paste(img)
    if not behind:
        blade.paste(img)
    armF.paste(img)
    return img


def lying(img):
    bbox = img.getbbox()
    crop = img.crop(bbox)
    rot = crop.rotate(90, expand=True, resample=Image.NEAREST)
    out = Image.new("RGBA", (FW, FH))
    out.alpha_composite(rot, (CX - rot.width // 2, G + 1 - rot.height))
    return out


def build():
    frames, ANIMS = [], {}

    def anim(name, fps, loop, *fs):
        s = len(frames)
        frames.extend(fs)
        ANIMS[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}

    GUARD = dict(hand=(13, 6), sword=-38, legs=((8, 0), (-8, 0)), lean=1, cape=22)

    def g(**kw):
        dd = dict(GUARD)
        dd.update(kw)
        return frame(**dd)

    anim("guard", 5, True, g(wave=0), g(bob=1, wave=0.8, hand=(13, 7)), g(bob=1, wave=1.6, hand=(13, 7)), g(wave=2.4))
    WALK = [((9, 0), (-8, 0)), ((5, 3), (-5, 0)), ((2, 4), (-2, 0)), ((7, 0), (-8, 3)), ((9, 0), (-6, 4)), ((8, 0), (-9, 0))]
    anim("walk", 9, True, *[g(legs=WALK[i], bob=1 if i % 3 == 0 else 0, lean=2, cape=30, wave=i * 0.9) for i in range(6)])
    anim("intro", 4, True,
         frame(hand=(6, 0), sword=-150, legs=((7, 0), (-7, 0)), cape=12, wave=0.3),
         frame(bob=1, hand=(6, 1), sword=-151, legs=((7, 0), (-7, 0)), cape=14, wave=1.3))
    # combo: overhead -> diagonal down, rising cut, delayed great cleave
    anim("windup", 8, False,
         frame(lean=-1, hand=(2, -16), sword=-120, legs=((8, 0), (-9, 0)), cape=18, wave=0.4),
         frame(bob=1, lean=-3, hand=(-2, -22), sword=-150, legs=((8, 0), (-10, 0)), cape=14, wave=0.9, hemFront=2))
    anim("strike", 24, False,
         frame(bob=3, lean=6, hand=(20, 2), sword=20, smear=(-140, 20), legs=((14, 0), (-10, 0)), hemBack=4, cape=48, wave=1.5),
         frame(bob=3, lean=6, hand=(18, 10), sword=58, smear=(-40, 58), legs=((14, 0), (-10, 0)), hemBack=3, cape=44, wave=2.0),
         frame(bob=2, lean=4, hand=(16, 12), sword=62, legs=((13, 0), (-9, 0)), hemBack=2, cape=36, wave=2.4))
    anim("strike2", 24, False,
         frame(bob=2, lean=5, hand=(18, 4), sword=-30, smear=(80, -30), legs=((13, 0), (-11, 0)), hemBack=4, cape=46, wave=1.0),
         frame(bob=1, lean=5, hand=(14, -12), sword=-80, smear=(0, -80), legs=((13, 0), (-11, 0)), hemBack=3, cape=42, wave=1.6),
         frame(bob=1, lean=3, hand=(12, -14), sword=-95, legs=((12, 0), (-10, 0)), hemBack=2, cape=34, wave=2.0))
    # the delayed third: coil far back and hold (it trembles), then cleave
    anim("delay", 10, True,
         frame(bob=2, lean=-5, hand=(-10, -16), sword=-168, legs=((9, 0), (-12, 0)), cape=10, wave=0.2, hemFront=3),
         frame(bob=2, lean=-5, hand=(-11, -16), sword=-170, legs=((9, 0), (-12, 0)), cape=10, wave=0.5, hemFront=3))
    anim("strike3", 22, False,
         frame(bob=4, lean=9, hand=(24, -2), sword=-4, smear=(-170, -4), smearR=(42, 52), legs=((16, 0), (-13, 1)), hemBack=7, cape=62, wave=1.2),
         frame(bob=4, lean=8, hand=(22, 6), sword=38, smear=(-60, 38), smearR=(42, 52), legs=((16, 0), (-13, 1)), hemBack=6, cape=58, wave=1.8),
         frame(bob=3, lean=6, hand=(18, 12), sword=70, legs=((15, 0), (-12, 0)), hemBack=4, cape=48, wave=2.2))
    anim("recover", 5, False,
         frame(bob=4, lean=4, hand=(16, 12), sword=68, legs=((12, 0), (-9, 0)), cape=34, wave=2.6),
         frame(bob=3, lean=3, hand=(15, 11), sword=62, legs=((11, 0), (-9, 0)), cape=30, wave=3.2),
         frame(bob=2, lean=2, hand=(14, 9), sword=20, legs=((10, 0), (-9, 0)), cape=26, wave=3.8))
    # iai stance: very low, blade drawn back along the hip; then the dash cut
    anim("heavy", 8, True,
         frame(bob=8, lean=6, headDy=1, hand=(-6, 12), sword=176, two=False, backHand=(10, 6), legs=((15, 0), (-14, 0)), hemBack=4, cape=40, wave=0.3),
         frame(bob=8, lean=6, headDy=2, hand=(-7, 12), sword=178, two=False, backHand=(10, 7), legs=((15, 0), (-14, 0)), hemBack=5, cape=42, wave=0.9))
    anim("lunge", 18, False,
         frame(bob=4, lean=11, hand=(28, 0), sword=-2, smear=(172, -2), smearR=(40, 50), legs=((17, 0), (-17, 3)), hemBack=10, cape=80, wave=1.0, two=False, backHand=(-14, 4)),
         frame(bob=4, lean=11, hand=(28, 1), sword=-6, legs=((17, 0), (-18, 4)), hemBack=10, cape=82, wave=1.6, two=False, backHand=(-15, 4)),
         frame(bob=3, lean=8, hand=(22, 8), sword=40, smear=(-6, 40), legs=((16, 0), (-14, 2)), hemBack=7, cape=66, wave=2.2, two=False, backHand=(-10, 6)))
    # low sweep (unparryable, jump it)
    anim("sweepWind", 8, True,
         frame(bob=12, lean=-2, headDy=1, hand=(-12, 18), sword=165, legs=((14, 0), (-12, 0)), hemFront=3, cape=16, wave=0.4),
         frame(bob=12, lean=-2, headDy=2, hand=(-13, 18), sword=167, legs=((14, 0), (-12, 0)), hemFront=3, cape=16, wave=1.0))
    anim("sweep", 22, False,
         frame(bob=12, lean=8, hand=(24, 22), sword=8, smear=(150, 8), smearR=(44, 52), legs=((17, 0), (-13, 0)), hemBack=8, cape=70, wave=1.2),
         frame(bob=12, lean=7, hand=(22, 22), sword=-12, smear=(60, -12), smearR=(44, 52), legs=((17, 0), (-13, 0)), hemBack=7, cape=66, wave=1.8),
         frame(bob=10, lean=5, hand=(18, 16), sword=-40, legs=((15, 0), (-12, 0)), hemBack=5, cape=50, wave=2.4))
    # leap + smash
    anim("leapWind", 10, False,
         frame(bob=10, lean=3, hand=(2, -14), sword=-110, legs=((11, 0), (-10, 0)), cape=20, wave=0.3),
         frame(bob=12, lean=4, headDy=1, hand=(0, -18), sword=-120, legs=((12, 0), (-11, 0)), cape=18, wave=0.6))
    anim("air", 6, True,
         frame(bob=-2, lean=0, hand=(2, -24), sword=-100, legs=((6, 8), (-4, 6)), hemLift=3, cape=-30, wave=0.5),
         frame(bob=-2, lean=0, hand=(3, -25), sword=-98, legs=((6, 9), (-4, 7)), hemLift=4, cape=-36, wave=1.2))
    anim("fall", 6, True,
         frame(bob=0, lean=4, hand=(8, -18), sword=-140, legs=((8, 4), (-6, 3)), hemLift=4, cape=-60, wave=0.5))
    anim("smash", 20, False,
         frame(bob=10, lean=7, hand=(18, 14), sword=78, smear=(-110, 78), smearR=(40, 50), legs=((15, 0), (-13, 0)), hemBack=4, cape=10, wave=1.0),
         frame(bob=12, lean=7, hand=(18, 18), sword=84, legs=((15, 0), (-13, 0)), hemBack=3, cape=14, wave=1.6),
         frame(bob=11, lean=6, hand=(17, 18), sword=84, legs=((15, 0), (-13, 0)), hemBack=2, cape=20, wave=2.2))
    anim("block", 10, False, frame(lean=-2, hand=(10, -6), sword=-82, legs=((8, 0), (-10, 0)), cape=16, wave=0.3))
    # braced for the shoulder guns: blade lowered back, chest thrown out
    anim("brace", 12, True,
         frame(bob=3, lean=-3, hand=(4, 12), sword=150, two=False, backHand=(12, 6), legs=((11, 0), (-12, 0)), hemFront=2, cape=10, wave=0.4),
         frame(bob=3, lean=-3, headDy=1, hand=(4, 13), sword=151, two=False, backHand=(12, 7), legs=((11, 0), (-12, 0)), hemFront=2, cape=12, wave=0.9))
    anim("recoil", 10, False,
         frame(lean=-6, headDy=-1, hand=(-2, -12), sword=-132, legs=((7, 1), (-11, 0)), hemFront=3, cape=8, wave=0.6))
    stag = frame(bob=14, lean=4, headDy=3, hand=(16, 20), sword=86, legs=((12, 0), (-6, 0)), hemLift=-1, cape=8, wave=0.2)
    anim("stagger", 3, True, stag,
         frame(bob=15, lean=4, headDy=4, hand=(16, 21), sword=86, legs=((12, 0), (-6, 0)), hemLift=-1, cape=8, wave=0.7))
    anim("hurt", 10, False, frame(lean=-4, headDy=-1, hand=(8, 2), sword=-60, legs=((7, 2), (-9, 0)), hemFront=2, cape=12, wave=0.5))
    kneel = frame(bob=18, lean=6, headDy=4, hand=(18, 22), sword=88, legs=((13, 0), (-4, 0)), hemLift=-2, cape=6, wave=0.4)
    anim("kneel", 2, True, kneel,
         frame(bob=18, lean=6, headDy=5, hand=(18, 22), sword=88, legs=((13, 0), (-4, 0)), hemLift=-2, cape=6, wave=1.0))
    anim("dead", 1, False, lying(kneel))
    return frames, ANIMS


def build_all():
    frames, ANIMS = build()
    # phase-two variants: the helmet is cracked open
    global DEF
    base = dict(DEF)
    DEF = dict(base, broken=True)
    f2, A2 = build()
    DEF = base
    off = len(frames)
    for k, a in A2.items():
        ANIMS[k + "_b"] = {"start": a["start"] + off, "end": a["end"] + off, "fps": a["fps"], "loop": a["loop"]}
    return frames + f2, ANIMS


if __name__ == "__main__":
    frames, ANIMS = build_all()
    COLS = 16
    rows_n = (len(frames) + COLS - 1) // COLS
    sheet = Image.new("RGBA", (FW * COLS, FH * rows_n))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % COLS) * FW, (i // COLS) * FH))
    sheet.save("assets/boss.png")
    json.dump({"frameWidth": FW, "frameHeight": FH, "originX": CX, "originY": G, "anims": ANIMS}, open("assets/boss.json", "w"), indent=1)
    S = 2
    n = len(frames) // 2
    cols = 8
    prev = Image.new("RGBA", (cols * FW * S, ((n + cols - 1) // cols) * FH * S), (40, 30, 60, 255))
    for i in range(n):
        prev.alpha_composite(frames[i].resize((FW * S, FH * S), Image.NEAREST), ((i % cols) * FW * S, (i // cols) * FH * S))
    prev.save("scratch/boss_preview.png")
    print(len(frames), "boss frames,", sheet.size)
