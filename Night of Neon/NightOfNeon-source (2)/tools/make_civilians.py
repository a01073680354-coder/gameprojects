"""The people of the undercity market (STAGE 2), on the hero's thin rig.

None of them fight. Each gets an idle and, where the story needs it, one
gesture: the noodle seller stirs, the parts dealer tinkers, the woman at the
name wall writes with chalk, 강만식 hammers, the shopkeeper beckons, the
young man points. Heads are painted here (3/4 view facing right, the same
size and placement as the hero's), bodies come from the rig with each
person's own clothes.

Writes assets/civ.png (+ civ.json: anims keyed "<who>_<anim>") and a preview
in scratch/civ_preview.png.
"""
import json
import importlib
import sys
from PIL import Image

sys.path.insert(0, "tools")
H = importlib.import_module("make_hero2")

O = (6, 5, 8, 255)


def C(r, g, b, a=255):
    return (r, g, b, a)


def shade(c, k):
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))), max(0, min(255, int(c[2] * k))), c[3])


# ------------------------------------------------------------------ heads

def ell(cx, cy, rx, ry):
    out = set()
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                out.add((x, y))
    return out


def head(skin, hair, style, eye=C(28, 24, 34), beard=None, extra=None, age=0, female=False, hood=None):
    """A head in 3/4 view facing right, on a 64x64 canvas placed like the hero's
    (face centred near (30, 19))."""
    px = {}
    cx, cy = 30, 19
    face = ell(cx, cy, 8.5, 9.5)
    if hood:
        # a hood around the head, the face showing at the front
        for (x, y) in ell(cx - 2, cy - 1, 12, 12):
            t = (x - cx) * 0.4 - (y - cy) * 0.6
            px[(x, y)] = hood[0] if t > 3 else hood[1] if t > -3 else hood[2]
    for (x, y) in face:
        t = (x - cx) * 0.55 - (y - cy) * 0.5
        px[(x, y)] = skin[0] if t > 3 else skin[1] if t > -2 else skin[2]
    if hood:
        # the hood's rim comes over the brow and the back of the head
        for (x, y) in ell(cx - 2, cy - 1, 12, 12):
            if y < cy - 4 + max(0, (x - cx - 2)) * 0.5 or x < cx - 4:
                t = (x - cx) * 0.4 - (y - cy) * 0.6
                px[(x, y)] = hood[0] if t > 3 else hood[1] if t > -3 else hood[2]
        for x in range(cx - 3, cx + 9):
            if (x, cy - 4 + max(0, (x - cx - 2)) * 0.5) in px:
                pass
    # jaw shadow and the ear
    for x in range(cx - 6, cx + 6):
        if (x, cy + 9) in px:
            px[(x, cy + 9)] = skin[2]
    if not hood:
        for (x, y) in ell(cx - 5, cy + 1, 2, 2.6):
            px[(x, y)] = skin[2] if x < cx - 5 else skin[1]
    # the nose: a bump at the front
    px[(cx + 9, cy + 1)] = skin[1]
    px[(cx + 9, cy + 2)] = skin[2]
    # eye, brow, mouth
    ex, ey = cx + 4, cy - 1
    px[(ex, ey)] = eye
    px[(ex + 1, ey)] = eye
    px[(ex, ey + 1)] = eye
    px[(ex + 1, ey + 1)] = C(220, 220, 230) if not age else eye
    brow = shade(hair[1], 0.8) if hair else C(120, 110, 100)
    px[(ex - 1, ey - 2)] = brow
    px[(ex, ey - 2)] = brow
    px[(ex + 1, ey - 2)] = brow
    if age:
        px[(ex - 1, ey + 3)] = skin[2]  # a crease under the eye
        px[(cx + 6, cy + 5)] = skin[2]
    px[(cx + 5, cy + 6)] = shade(skin[2], 0.8)
    px[(cx + 6, cy + 6)] = shade(skin[2], 0.8)
    if female:
        px[(cx + 6, cy + 6)] = C(170, 80, 80)
        px[(ex + 2, ey)] = eye  # lashes
    # hair
    if style in ("short", "long", "bun", "perm", "headband", "goggles", "beanie", "cap", "scarf"):
        top = ell(cx - 2, cy - 4, 10, 8)
        for (x, y) in top:
            # stop at the forehead: a fringe line slanting down toward the back
            if x > cx + 4 and y > cy - 6 + (x - cx - 4) * 0.2:
                continue
            if x > cx - 3 and y > cy - 3:
                continue
            t = (x - cx) * 0.3 - (y - cy) * 0.7
            px[(x, y)] = hair[0] if t > 6 else hair[1] if t > 1 else hair[2]
        # sideburn and the back of the head
        for y in range(cy - 4, cy + 4):
            for x in range(cx - 9, cx - 5):
                if (x, y) in px or (x - cx + 9) < 3:
                    px[(x, y)] = hair[2] if x < cx - 7 else hair[1]
    if style in ("long", "scarf"):
        for y in range(cy - 2, cy + 15):
            for x in range(cx - 11, cx - 3 + (1 if y < cy + 6 else 0)):
                if x + (y - cy) * 0.15 < cx - 3:
                    px[(x, y)] = hair[2] if x < cx - 8 else hair[1]
    if style == "bun":
        for (x, y) in ell(cx - 9, cy - 9, 3.5, 3.5):
            px[(x, y)] = hair[1] if x > cx - 9 else hair[2]
    if style == "perm":
        for (x, y) in ell(cx - 3, cy - 6, 12, 8):
            if (x, y) not in face and ((x + y) % 2 == 0 or (x, y) not in px):
                if not (x > cx + 3 and y > cy - 5):
                    px[(x, y)] = hair[1] if (x * 3 + y) % 4 else hair[0]
    if style == "bald":
        # a fringe of grey around the back, the crown bare
        for (x, y) in ell(cx - 3, cy - 1, 9, 8):
            if x < cx - 5 and y > cy - 6:
                px[(x, y)] = hair[1] if x > cx - 8 else hair[2]
        px[(cx - 1, cy - 8)] = skin[0]
        px[(cx, cy - 8)] = skin[0]
    if style == "headband":
        for x in range(cx - 9, cx + 9):
            for y in (cy - 5, cy - 4):
                if (x, y) in px:
                    px[(x, y)] = C(220, 220, 214) if y == cy - 5 else C(170, 168, 160)
        px[(cx - 10, cy - 4)] = C(220, 220, 214)
        px[(cx - 11, cy - 3)] = C(170, 168, 160)
    if style in ("goggles",) or (extra and "goggles" in extra):
        for x in range(cx - 9, cx + 8):
            if (x, cy - 6) in px or (x, cy - 5) in px:
                px[(x, cy - 6)] = C(60, 50, 40)
        for (x, y) in ell(cx + 3, cy - 7, 2.5, 2):
            px[(x, y)] = C(120, 200, 210) if x > cx + 3 else C(60, 110, 120)
        px[(cx + 2, cy - 8)] = C(220, 250, 255)
    if style == "beanie":
        for (x, y) in ell(cx - 1, cy - 6, 10, 7):
            if y <= cy - 3:
                px[(x, y)] = hair[1] if (x + y) % 3 else hair[2]
        for x in range(cx - 10, cx + 9):
            if (x, cy - 3) in px:
                px[(x, cy - 3)] = hair[0]
                px[(x, cy - 2)] = hair[0] if x < cx + 5 else px.get((x, cy - 2), hair[0])
        for (x, y) in ell(cx - 4, cy - 14, 2.2, 2.2):
            px[(x, y)] = C(240, 240, 240)
    if style == "cap":
        for (x, y) in ell(cx - 1, cy - 6, 9.5, 6):
            if y <= cy - 4:
                px[(x, y)] = hair[1] if x < cx + 4 else hair[0]
        for x in range(cx + 3, cx + 13):
            px[(x, cy - 5)] = hair[2]
            px[(x, cy - 4)] = shade(hair[2], 0.7)
    if beard:
        for (x, y) in ell(cx + 2, cy + 6, 8, 6):
            if y >= cy + 3 and x > cx - 6:
                px[(x, y)] = beard[0] if (x + y) % 3 else beard[1]
        px[(cx + 5, cy + 5)] = shade(skin[2], 0.7)  # the mouth in the beard
        px[(cx + 6, cy + 5)] = shade(skin[2], 0.7)
    if style == "scarf" or (extra and "scarf" in extra):
        sc = (extra or {}).get("scarf", [C(170, 50, 50), C(120, 30, 34)])
        for y in range(cy + 9, cy + 14):
            for x in range(cx - 7, cx + 6):
                px[(x, y)] = sc[0] if (x + y) % 4 else sc[1]
        for y in range(cy + 13, cy + 19):
            px[(cx - 8, y)] = sc[1]
            px[(cx - 7, y)] = sc[0]
    im = Image.new("RGBA", (64, 64))
    out = dict(px)
    for (x, y) in px:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in px:
                out[(x + dx, y + dy)] = O
    for (x, y), c in out.items():
        if 0 <= x < 64 and 0 <= y < 64:
            im.putpixel((x, y), c)
    return im


SKIN_A = [C(250, 208, 180), C(232, 176, 146), C(196, 134, 112)]
SKIN_B = [C(236, 190, 156), C(212, 156, 122), C(172, 114, 92)]
SKIN_OLD = [C(238, 196, 170), C(214, 162, 136), C(178, 122, 104)]


# ------------------------------------------------------------------ tools held

def nothing(hand, ang, length=0):
    return H.Layer()


def ladle(hand, ang, length=14):
    L = H.Layer()
    hx, hy = hand
    ux, uy = H.d(ang)
    for i in range(-2, length):
        L.put(hx + ux * i, hy + uy * i, C(150, 120, 80))
    ex, ey = hx + ux * length, hy + uy * length
    for dx in (-1, 0, 1):
        for dy in (0, 1):
            L.put(ex + dx, ey + dy, C(170, 174, 182))
    return L.outline()


def hammer(hand, ang, length=12):
    L = H.Layer()
    hx, hy = hand
    ux, uy = H.d(ang)
    nx, ny = -uy, ux
    for i in range(-1, length):
        L.put(hx + ux * i, hy + uy * i, C(110, 80, 50))
    ex, ey = hx + ux * length, hy + uy * length
    for o in range(-3, 4):
        for k in (0, 1, 2):
            L.put(ex + nx * o + ux * k, ey + ny * o + uy * k, C(90, 94, 104) if k < 2 else C(140, 144, 154))
    return L.outline()


def chalk(hand, ang, length=3):
    L = H.Layer()
    hx, hy = hand
    ux, uy = H.d(ang)
    for i in range(1, length + 1):
        L.put(hx + ux * i, hy + uy * i, C(250, 248, 240))
    return L


def card(hand, ang, length=0):
    L = H.Layer()
    hx, hy = hand
    for dx in range(0, 4):
        for dy in range(-3, 0):
            L.put(hx + dx, hy + dy, C(220, 214, 190) if dy > -3 else C(150, 60, 50))
    return L.outline()


# ------------------------------------------------------------------ people

def dress(robe, collar, sash, pant, boot, skin=SKIN_A, cuff=None):
    H.ROBE = {"dk": shade(robe, 0.45), "sh": shade(robe, 0.7), "md": shade(robe, 0.85), "bs": robe, "hi": shade(robe, 1.18), "hi2": shade(robe, 1.35)}
    H.COLLAR = collar
    H.SASH = {"dk": shade(sash, 0.6), "bs": sash, "hi": shade(sash, 1.3), "strap": shade(sash, 1.1)}
    H.SKIN = {"hi": skin[0], "bs": skin[1], "sh": skin[2], "dk": shade(skin[2], 0.85)}
    H.CUFF = cuff or [shade(robe, 1.2), shade(robe, 0.8)]
    H.PANT = pant
    H.BOOT = {"D": shade(boot, 0.55), "M": boot, "H": shade(boot, 1.3)}
    H.draw_sheath = lambda P, with_hilt=True: H.Layer()
    H.draw_scabbard = lambda P: H.Layer()
    H.BUN = Image.new("RGBA", (64, 64))
    H.draw_blade = nothing


HANG = dict(arm=(96, -6), barm=(100, -10), droop=(0, 1), legs=((4, 0), (-3, 0)), tail=0)


def stand(**kw):
    d = dict(HANG)
    d.update(kw)
    return H.frame(**d)


def idle_set(lean=0, legs=((4, 0), (-3, 0)), arm=(96, -6), **kw):
    return [stand(lean=lean, legs=legs, arm=arm, **kw), stand(lean=lean, legs=legs, arm=arm, bob=1, **kw),
            stand(lean=lean, legs=legs, arm=arm, bob=1, headDy=1, **kw), stand(lean=lean, legs=legs, arm=arm, **kw)]


SHEET = []
ANIMS = {}


def anim(name, fps, loop, frames):
    s = len(SHEET)
    SHEET.extend(frames)
    ANIMS[name] = {"start": s, "end": len(SHEET) - 1, "fps": fps, "loop": loop}


def small(frames, k=0.74):
    """A child: the same rig, scaled down, standing on the same floor."""
    out = []
    for f in frames:
        w, h = int(f.width * k), int(f.height * k)
        s = f.resize((w, h), Image.NEAREST)
        im = Image.new("RGBA", (f.width, f.height))
        im.alpha_composite(s, (46 - int(46 * k), 78 - int(78 * k)))
        out.append(im)
    return out


def build():
    # 국수 장수: a white apron over a dark shirt, a headband, rubber boots
    dress(C(214, 206, 188), [C(60, 62, 70), C(40, 42, 50)], C(200, 196, 180), [C(50, 52, 60), C(70, 72, 80)], C(40, 60, 90), SKIN_B)
    H.HEAD = head(SKIN_B, [C(60, 56, 54), C(40, 36, 36), C(26, 24, 26)], "headband", age=1)
    anim("noodle_idle", 4, True, idle_set(arm=(70, -40)))
    H.draw_blade = ladle
    anim("noodle_work", 6, True, [stand(arm=(40, -20), sword=("held", 70), lean=2), stand(arm=(55, -25), sword=("held", 85), lean=2, bob=1),
                                  stand(arm=(65, -20), sword=("held", 95), lean=2, bob=1), stand(arm=(50, -15), sword=("held", 80), lean=2)])
    # 부품상: an old man in a brown work vest, goggles on his forehead
    dress(C(104, 78, 54), [C(150, 140, 120), C(110, 100, 86)], C(60, 44, 30), [C(60, 58, 54), C(84, 80, 72)], C(80, 50, 30), SKIN_OLD)
    H.HEAD = head(SKIN_OLD, [C(200, 200, 196), C(160, 160, 158), C(120, 120, 120)], "goggles", age=1)
    anim("parts_idle", 3, True, idle_set(lean=1, arm=(80, -30)))
    anim("parts_work", 5, True, [stand(lean=3, arm=(30, -10), bob=1), stand(lean=3, arm=(36, -16), bob=1), stand(lean=3, arm=(28, -8), bob=1), stand(lean=3, arm=(34, -12), bob=1)])
    # the queue for the power ration: a grey raincoat, a green parka, a woman with a bun
    dress(C(110, 116, 124), [C(80, 84, 92), C(60, 64, 70)], C(90, 94, 102), [C(50, 50, 56), C(70, 70, 78)], C(36, 36, 44), SKIN_A)
    H.HEAD = head(SKIN_A, None, "hood", hood=[C(140, 146, 154), C(110, 116, 124), C(80, 84, 92)])
    H.draw_blade = card
    anim("queueA_idle", 2, True, idle_set(arm=(60, -50), sword=("held", 0)))
    H.draw_blade = nothing
    dress(C(62, 84, 66), [C(180, 170, 140), C(140, 130, 104)], C(50, 66, 54), [C(40, 40, 46), C(60, 60, 66)], C(30, 30, 36), SKIN_B)
    H.HEAD = head(SKIN_B, None, "hood", hood=[C(84, 110, 88), C(62, 84, 66), C(44, 60, 48)], age=1)
    anim("queueB_idle", 2, True, idle_set(lean=-1))
    dress(C(120, 54, 64), [C(200, 190, 170), C(160, 150, 130)], C(90, 40, 48), [C(40, 36, 44), C(60, 54, 64)], C(50, 30, 34), SKIN_A)
    H.HEAD = head(SKIN_A, [C(70, 50, 44), C(50, 34, 30), C(34, 24, 22)], "bun", female=True)
    anim("queueC_idle", 2, True, idle_set(arm=(85, -40)))
    # the woman at the name wall: a long beige coat, a red scarf, chalk in hand
    dress(C(176, 158, 128), [C(170, 50, 50), C(120, 30, 34)], C(130, 110, 86), [C(44, 42, 50), C(64, 62, 70)], C(50, 40, 36), SKIN_A)
    H.HEAD = head(SKIN_A, [C(56, 40, 36), C(40, 28, 26), C(26, 18, 18)], "scarf", female=True, age=1)
    H.draw_blade = chalk
    anim("chalk_write", 5, True, [stand(arm=(-18, -8), sword=("held", -40), lean=2), stand(arm=(-14, -14), sword=("held", -40), lean=2),
                                  stand(arm=(-10, -18), sword=("held", -36), lean=2, bob=1), stand(arm=(-16, -10), sword=("held", -42), lean=2)])
    anim("chalk_idle", 3, True, idle_set(arm=(75, -60), sword=("held", -90)))
    H.draw_blade = nothing
    # a child in a yellow raincoat and a blue beanie
    dress(C(222, 186, 60), [C(240, 220, 120), C(200, 170, 60)], C(190, 156, 50), [C(60, 70, 110), C(80, 92, 130)], C(160, 50, 50), SKIN_A)
    H.HEAD = head(SKIN_A, [C(90, 130, 200), C(60, 96, 170), C(40, 66, 130)], "beanie")
    anim("kid_idle", 4, True, small(idle_set()))
    anim("kid_look", 3, True, small([stand(lean=-2, headDy=-1, arm=(110, -10)), stand(lean=-2, headDy=-1, bob=1, arm=(110, -10))]))
    # Eden's queue: tired people, stooped
    dress(C(110, 80, 130), [C(220, 210, 220), C(180, 170, 180)], C(80, 60, 96), [C(50, 46, 56), C(70, 66, 76)], C(50, 44, 50), SKIN_OLD)
    H.HEAD = head(SKIN_OLD, [C(230, 228, 232), C(200, 198, 204), C(160, 158, 166)], "perm", female=True, age=1)
    anim("edenA_idle", 2, True, idle_set(lean=3, arm=(100, -4)))
    dress(C(80, 110, 140), [C(200, 210, 220), C(160, 170, 180)], C(60, 84, 110), [C(46, 50, 60), C(66, 70, 80)], C(40, 40, 46), SKIN_B)
    H.HEAD = head(SKIN_B, [C(80, 80, 84), C(60, 60, 64), C(40, 40, 44)], "short", age=1)
    anim("edenB_idle", 2, True, idle_set(lean=4, arm=(105, -2)))
    dress(C(90, 92, 102), [C(110, 112, 122), C(80, 82, 92)], C(70, 72, 80), [C(40, 40, 48), C(60, 60, 68)], C(36, 36, 42), SKIN_A)
    H.HEAD = head(SKIN_A, [C(40, 32, 30), C(30, 22, 22), C(20, 14, 14)], "long", female=True)
    anim("edenC_idle", 2, True, idle_set(lean=2, arm=(95, -20)))
    # 강만식: a leather apron, sleeves rolled, bald with a grey beard, goggles up
    dress(C(110, 74, 46), [C(70, 64, 60), C(50, 46, 44)], C(70, 50, 34), [C(54, 52, 56), C(76, 74, 80)], C(60, 40, 28), SKIN_OLD, cuff=[SKIN_OLD[1], SKIN_OLD[2]])
    H.HEAD = head(SKIN_OLD, [C(210, 210, 206), C(170, 170, 168), C(130, 130, 130)], "bald",
                  beard=[C(206, 204, 200), C(160, 158, 156)], extra={"goggles": True}, age=1)
    anim("kang_idle", 3, True, idle_set(lean=1, arm=(70, -50)))
    H.draw_blade = hammer
    anim("kang_work", 7, True, [stand(lean=0, arm=(-70, -40), sword=("held", -120), legs=((5, 0), (-4, 0))),
                                stand(lean=-1, arm=(-95, -40), sword=("held", -150), legs=((5, 0), (-4, 0))),
                                stand(lean=3, bob=1, arm=(40, -10), sword=("held", 60), legs=((6, 0), (-4, 0))),
                                stand(lean=2, bob=1, arm=(30, -20), sword=("held", 40), legs=((6, 0), (-4, 0)))])
    H.draw_blade = nothing
    # the shopkeeper who hides him: a flowered blouse, an apron, a perm
    dress(C(170, 110, 110), [C(230, 200, 180), C(190, 160, 140)], C(220, 210, 190), [C(60, 50, 56), C(80, 70, 76)], C(60, 40, 40), SKIN_B)
    H.HEAD = head(SKIN_B, [C(100, 66, 50), C(76, 48, 36), C(54, 32, 24)], "perm", female=True, age=1)
    anim("hider_idle", 3, True, idle_set(arm=(80, -50)))
    anim("hider_beckon", 6, True, [stand(lean=-1, arm=(15, -30)), stand(lean=-1, arm=(15, -110)), stand(lean=-1, arm=(15, -40)), stand(lean=-1, arm=(15, -115))])
    # the young man who gives him away: a grey-blue hoodie, a cap
    dress(C(70, 84, 104), [C(90, 104, 124), C(60, 72, 90)], C(60, 72, 90), [C(50, 60, 84), C(70, 82, 110)], C(200, 200, 204), SKIN_A)
    H.HEAD = head(SKIN_A, [C(60, 60, 66), C(40, 40, 46), C(26, 26, 30)], "cap")
    anim("youth_idle", 3, True, idle_set(lean=1, arm=(100, -20)))
    anim("youth_point", 4, True, [stand(lean=2, arm=(-5, 0), legs=((6, 0), (-5, 0))), stand(lean=2, arm=(-3, -2), legs=((6, 0), (-5, 0)), bob=1)])
    RUN_LEGS = [((7, 0), (-6, 0)), ((3, 0), (-2, 3)), ((0, 0), (2, 5)), ((-3, 0), (5, 2)), ((-6, 0), (7, 0)), ((-2, 3), (3, 0))]
    anim("youth_run", 12, True, [stand(lean=4, legs=RUN_LEGS[i], arm=(60 + 40 * (i % 3), -30), bob=i % 2) for i in range(6)])


def save(cols=16):
    FW, FH = H.FW, H.FH
    rows = (len(SHEET) + cols - 1) // cols
    sheet = Image.new("RGBA", (FW * cols, FH * rows))
    for i, f in enumerate(SHEET):
        sheet.paste(f, ((i % cols) * FW, (i // cols) * FH))
    sheet.save("assets/civ.png")
    json.dump({"anims": ANIMS}, open("assets/civ.json", "w"), indent=1)
    S = 2
    firsts = [ANIMS[k]["start"] for k in ANIMS]
    prev = Image.new("RGBA", (len(firsts) * 52 * S, FH * S), (46, 36, 66, 255))
    for i, fi in enumerate(firsts):
        f = SHEET[fi].crop((20, 0, 72, 80))
        prev.alpha_composite(f.resize((52 * S, FH * S), Image.NEAREST), (i * 52 * S, 0))
    prev.save("scratch/civ_preview.png")
    print(len(SHEET), "frames,", len(ANIMS), "anims")


if __name__ == "__main__":
    build()
    save()
