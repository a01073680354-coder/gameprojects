"""Blade cyborg ("검귀"): reuses the hero's part-based rig with a new
palette, a masked head and a red scarf in place of the hair bun."""
import json
import sys
from PIL import Image

sys.path.insert(0, "tools")
import make_hero2 as H  # noqa: E402

C = H.C
H.ROBE = {"dk": C(28, 16, 24), "sh": C(46, 24, 36), "md": C(58, 30, 44), "bs": C(70, 36, 52), "hi": C(102, 50, 70), "hi2": C(140, 64, 88)}
H.COLLAR = [C(200, 60, 80), C(140, 30, 50)]
H.SASH = {"dk": C(40, 10, 16), "bs": C(150, 24, 46), "hi": C(220, 60, 80), "strap": C(180, 170, 170)}
H.SKIN = {"hi": C(96, 96, 110), "bs": C(60, 60, 72), "sh": C(38, 38, 48), "dk": C(22, 22, 28)}
H.CUFF = [C(150, 150, 160), C(80, 80, 92)]
H.BLADE = {"edge": C(255, 225, 235), "bs": C(255, 110, 140), "mid": C(210, 40, 84), "back": C(96, 20, 44)}
H.PANT = [C(30, 26, 36), C(48, 44, 56)]
H.BOOT = {"D": C(28, 28, 34), "M": C(52, 52, 62), "H": C(84, 84, 98)}
H.SHEATH = {"dk": C(16, 12, 16), "bs": C(34, 26, 32), "hi": C(70, 50, 60)}
H.GOLD = [C(255, 120, 140), C(200, 50, 80), C(120, 20, 50)]
H.WRAP = [C(60, 60, 70), C(20, 20, 26)]
H.SMEAR = [C(255, 200, 215, 235), C(255, 60, 100, 170)]

O = (4, 3, 2, 255)


def outline_put(im, px):
    for (x, y) in list(px.keys()):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in px:
                px[(x + dx, y + dy)] = O
    for (x, y), c in px.items():
        if 0 <= x < 64 and 0 <= y < 64:
            im.putpixel((x, y), c)


def make_head():
    """Hooded helm with a red visor slit and a respirator, original coords."""
    im = Image.new("RGBA", (64, 64))
    px = {}
    cx, cy = 30, 15
    for y in range(3, 29):
        for x in range(14, 46):
            if ((x + 0.5 - cx) / 13.5) ** 2 + ((y + 0.5 - cy) / 12.5) ** 2 <= 1:
                t = ((x - cx) * -0.6 + (y - cy) * -0.8) / 13
                c = C(78, 70, 92) if t > 0.45 else C(56, 50, 68) if t > -0.1 else C(38, 34, 48) if t > -0.6 else C(26, 22, 34)
                px[(x, y)] = c
    for y in range(17, 28):
        for x in range(31, 44):
            if ((x - 31) + (27 - y) * 0.3 < 13 and (x, y) in px) or (x >= 33 and y <= 26):
                px[(x, y)] = C(70, 70, 82) if y < 22 else C(50, 50, 60)
    for x in range(35, 44, 2):
        px[(x, 23)] = O
        px[(x, 25)] = O
    for x in range(29, 45):
        px[(x, 14)] = O
        px[(x, 15)] = C(255, 60, 90) if x < 43 else O
        px[(x, 16)] = C(200, 20, 60) if x < 43 else O
        px[(x, 17)] = O
    px[(41, 15)] = C(255, 220, 230)
    for x in range(20, 30):
        if (x, 5) in px:
            px[(x, 5)] = C(110, 100, 130)
    outline_put(im, px)
    return im


def make_scarf():
    """Red scarf tails knotted at the back of the head (lags like the bun)."""
    im = Image.new("RGBA", (64, 64))
    px = {}
    for i in range(12):
        y = 13 + i * 0.55
        x = 17 - i
        for w in range(3 if i < 8 else 2):
            px[(int(x), int(y + w))] = C(220, 40, 70) if w == 0 else C(150, 20, 46)
    for i in range(9):
        y = 16 + i * 0.8
        x = 17 - i * 0.8
        px[(int(x), int(y) + 2)] = C(190, 30, 60)
        px[(int(x), int(y) + 3)] = C(120, 16, 40)
    outline_put(im, px)
    return im


H.HEAD = make_head()
H.BUN = make_scarf()

frames, ANIMS = [], {}


def anim(name, fps, loop, *fs):
    s = len(frames)
    frames.extend(fs)
    ANIMS[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}


F = H.frame
GUARD = dict(arm=(15, -30), sword=("held", -40), legs=((8, 0), (-7, 0)), lean=1, tail=2)


def g(**kw):
    dd = dict(GUARD)
    dd.update(kw)
    return F(**dd)


anim("guard", 5, True, g(), g(bob=1, bun=(0, 1)), g(bob=1, bun=(-1, 1)), g(bun=(-1, 0)))
WALK = [((8, 0), (-6, 0)), ((5, 2), (-4, 0)), ((3, 3), (-2, 0)), ((6, 0), (-6, 2)), ((8, 0), (-5, 3)), ((7, 0), (-7, 0))]
anim("walk", 10, True, *[g(legs=WALK[i], bob=1 if i % 3 == 0 else 0, bun=(-2, i % 2), lean=2, tail=3) for i in range(6)])
# anticipation: rise, then coil deep with the blade cocked behind the head
anim("windup", 9, False,
     F(lean=-1, legs=((7, 0), (-7, 0)), arm=(-80, -35), sword=("held", -110), droop=(0.2, 1), bun=(1, 0), tail=1),
     F(bob=2, lean=-4, legs=((8, 0), (-9, 0)), arm=(-125, -20), sword=("held", -160), droop=(0.3, 1), bun=(2, -1), tail=-1, hemFront=1),
     F(bob=3, lean=-5, headDy=1, legs=((8, 0), (-10, 0)), arm=(-135, -12), sword=("held", -172), droop=(0.3, 1), bun=(2, -2), tail=-2, hemFront=2))
# first cut: diagonal downward slash with a lunging step and a full crescent
anim("strike", 26, False,
     F(bob=3, lean=7, legs=((13, 0), (-9, 0)), arm=(8, 0), sword=("held", 28), smear=(-150, 28), hemBack=5, tail=6, bun=(-3, 1)),
     F(bob=3, lean=6, legs=((13, 0), (-9, 0)), arm=(48, -4), sword=("held", 80), smear=(10, 80), hemBack=4, tail=5, bun=(-3, 2)),
     F(bob=2, lean=4, legs=((12, 0), (-8, 0)), arm=(55, -22), sword=("held", 62), hemBack=2, tail=3, bun=(-2, 1)))
# second cut: a rising reverse slash
anim("strike2", 26, False,
     F(bob=1, lean=6, legs=((12, 0), (-10, 0)), arm=(-18, 0), sword=("held", -48), smear=(110, -48), hemBack=4, tail=5, bun=(-3, -1)),
     F(bob=0, lean=5, legs=((12, 0), (-10, 1)), arm=(-72, -4), sword=("held", -118), smear=(-30, -118), hemBack=3, tail=4, bun=(-2, -2)),
     F(bob=1, lean=3, legs=((11, 0), (-9, 0)), arm=(-55, -24), sword=("held", -85), hemBack=2, tail=2, bun=(-1, -1)))
anim("recover", 6, False,
     F(bob=2, lean=3, legs=((10, 0), (-7, 0)), arm=(50, -28), sword=("held", 55), tail=3),
     F(bob=1, lean=2, legs=((9, 0), (-7, 0)), arm=(38, -30), sword=("held", 20), tail=2),
     F(bob=1, lean=1, legs=((8, 0), (-7, 0)), arm=(25, -30), sword=("held", -10), tail=2))
# iai stance before the "!" lunge: very low, blade drawn back along the hip
anim("heavy", 8, True,
     F(bob=6, lean=5, headDy=1, legs=((12, 0), (-11, 0)), arm=(155, 22), sword=("held", 176), droop=(-0.5, 1), hemBack=3, tail=5, bun=(-3, 1)),
     F(bob=6, lean=5, headDy=2, legs=((12, 0), (-11, 0)), arm=(157, 24), sword=("held", 178), droop=(-0.5, 1), hemBack=4, tail=6, bun=(-4, 1)))
# the lunge: horizontal draw-cut at full stretch, then follow-through
anim("lunge", 18, False,
     F(bob=3, lean=9, legs=((14, 0), (-13, 2)), arm=(2, 0), sword=("held", -2), smear=(165, -2), hemBack=9, tail=9, bun=(-5, 0)),
     F(bob=3, lean=9, legs=((14, 0), (-14, 3)), arm=(-6, 0), sword=("held", -10), hemBack=9, tail=9, bun=(-5, 0)),
     F(bob=2, lean=6, legs=((13, 0), (-11, 1)), arm=(28, -8), sword=("held", 38), smear=(-10, 38), hemBack=6, tail=6, bun=(-4, 1)))
anim("block", 10, False, F(lean=-1, legs=((7, 0), (-8, 0)), arm=(-45, -25), sword=("held", -95), droop=(0.2, 1), tail=1))
anim("recoil", 10, False,
     F(lean=-4, headDy=-1, legs=((6, 1), (-8, 0)), arm=(-150, 15), sword=("held", -160), droop=(0.6, 0.6), hemFront=2, tail=-2, bun=(2, -1)))
stag = F(bob=7, lean=-2, headDy=2, legs=((6, 0), (-3, 0)), arm=(100, -5), sword=("held", 105), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 2))
anim("stagger", 3, True, stag, F(bob=7, lean=-1, headDy=3, legs=((6, 0), (-3, 0)), arm=(95, -5), sword=("held", 100), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 3)))
anim("hurt", 10, False, F(lean=-4, headDy=-1, legs=((6, 2), (-6, 0)), arm=(-60, -20), sword=("held", -60), droop=(0.6, 0.6), hemFront=2, bun=(2, -1)))
anim("dead", 1, False, H.lying(stag))

H.save_sheet(frames, "assets/blade.png")
json.dump({"anims": ANIMS}, open("assets/blade.json", "w"), indent=1)
S = 3
prev = Image.new("RGBA", (8 * H.FW * S, ((len(frames) + 7) // 8) * H.FH * S), (40, 30, 60, 255))
for i, f in enumerate(frames):
    prev.alpha_composite(f.resize((H.FW * S, H.FH * S), Image.NEAREST), ((i % 8) * H.FW * S, (i // 8) * H.FH * S))
prev.save("scratch/blade_preview.png")
print(len(frames), "blade frames")
