"""The White Night recovery squad (STAGE 1), on the hero's part-based rig.

  grunt  회수반원: a bleached-yellow hazmat suit with reflective bands, a hood
         and respirator, a shock baton. Same animation layout as the blade
         cyborg (assets/blade.json), so it shares that renderer.
  chief  차승호: the squad leader, on the broader v3 rig: a grey-white suit
         with an orange captain's band, a half-face respirator, the
         incinerator tank on his back, a baton; extra poses for the
         overhead smash, the flame spray and kneeling, disarmed.

Writes assets/grunt.png, assets/chief.png (+ .json) and previews in scratch/.
"""
import json
import math
import sys
import importlib
from PIL import Image

sys.path.insert(0, "tools")

O = (6, 5, 6, 255)


def C(r, g, b, a=255):
    return (r, g, b, a)


def outline_into(im, px):
    out = dict(px)
    for (x, y) in px:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in px:
                out[(x + dx, y + dy)] = O
    for (x, y), c in out.items():
        if 0 <= x < 64 and 0 <= y < 64:
            im.putpixel((x, y), c)
    return im


def hood_head(cx, cy, rx, ry, suit, visor, band=None, mask_col=C(58, 62, 70)):
    """A hazmat hood seen from the side: suit-coloured, a dark visor with a
    warm reflection, a respirator canister at the front."""
    im = Image.new("RGBA", (64, 64))
    px = {}
    for y in range(cy - ry - 1, cy + ry + 2):
        for x in range(cx - rx - 1, cx + rx + 2):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                t = ((x - cx) * 0.5 + (y - cy) * -0.85) / max(rx, ry)
                px[(x, y)] = suit[0] if t > 0.4 else suit[1] if t > -0.15 else suit[2] if t > -0.6 else suit[3]
    # the visor: a slanted dark window at the front, a hot glint from the fires
    vx0 = cx + rx // 3
    for y in range(cy - ry // 2, cy + ry // 4):
        for x in range(vx0 - (y - cy) // 3, cx + rx + 1):
            if (x, y) in px:
                px[(x, y)] = visor[0] if y < cy - ry // 2 + 2 else visor[1]
    gx = cx + rx - 2
    px[(gx, cy - ry // 2 + 1)] = visor[2]
    px[(gx - 1, cy - ry // 2 + 1)] = visor[2]
    # respirator: a grey snout with a filter can
    for y in range(cy + ry // 4, cy + ry + 1):
        for x in range(cx + 1, cx + rx + 3):
            if (x - cx) + (y - cy) * 0.4 < rx + 2:
                px[(x, y)] = mask_col if (x + y) % 3 else C(40, 42, 48)
    for y in range(cy + ry // 2, cy + ry + 2):
        px[(cx + rx + 3, y)] = C(90, 94, 102)
        px[(cx + rx + 4, y)] = C(60, 62, 70)
    if band:
        for x in range(cx - rx, cx + rx // 3):
            if (x, cy - ry // 3) in px:
                px[(x, cy - ry // 3)] = band[0]
                px[(x, cy - ry // 3 + 1)] = band[1]
    return outline_into(im, px)


def empty():
    return Image.new("RGBA", (64, 64))


def baton_painter(H, tip=C(160, 230, 255), glow=C(230, 250, 255)):
    """A shock baton in the hand instead of a sword."""
    def draw(hand, ang, length=16):
        L = H.Layer()
        hx, hy = hand
        ux, uy = H.d(ang)
        nx, ny = -uy, ux
        for i in range(-4, 1):
            L.put(hx + ux * i, hy + uy * i, C(30, 28, 32))
        for o in (-1, 0, 1):
            L.put(hx + ux * 1 + nx * o, hy + uy * 1 + ny * o, C(90, 90, 100))
        for i in range(2, length):
            x, y = hx + ux * i, hy + uy * i
            L.put(x, y, C(70, 74, 84) if i % 4 else C(110, 114, 124))
            L.put(x + nx * 0.8, y + ny * 0.8, C(40, 42, 50))
        for i in range(length, length + 3):
            L.put(hx + ux * i, hy + uy * i, tip if i < length + 2 else glow)
        return L.outline()
    return draw


def nozzle_painter(H):
    """The incinerator's spray lance, held out for the flame."""
    def draw(hand, ang, length=18):
        L = H.Layer()
        hx, hy = hand
        ux, uy = H.d(ang)
        nx, ny = -uy, ux
        for i in range(-3, length):
            x, y = hx + ux * i, hy + uy * i
            L.put(x, y, C(60, 62, 70))
            L.put(x + nx, y + ny, C(36, 38, 44))
            if i % 5 == 0:
                L.put(x - nx, y - ny, C(242, 196, 58))
        for o in (-2, -1, 0, 1, 2):
            L.put(hx + ux * length + nx * o, hy + uy * length + ny * o, C(30, 30, 34))
        L.put(hx + ux * (length + 1), hy + uy * (length + 1), C(232, 200, 255))
        return L.outline()
    return draw


# ------------------------------------------------------------------- grunt

def make_grunt():
    H = importlib.import_module("make_hero2")
    importlib.reload(H)
    H.ROBE = {"dk": C(70, 64, 34), "sh": C(104, 96, 52), "md": C(126, 116, 64), "bs": C(150, 138, 76), "hi": C(184, 170, 96), "hi2": C(212, 200, 120)}
    H.COLLAR = [C(220, 224, 230), C(150, 154, 160)]         # reflective band at the neck
    H.SASH = {"dk": C(30, 30, 34), "bs": C(52, 52, 58), "hi": C(200, 210, 220), "strap": C(90, 90, 98)}  # utility belt, reflective strip
    H.SKIN = {"hi": C(70, 70, 78), "bs": C(50, 50, 58), "sh": C(36, 36, 42), "dk": C(24, 24, 30)}     # rubber gloves
    H.CUFF = [C(220, 224, 230), C(150, 154, 160)]
    H.PANT = [C(84, 78, 44), C(110, 102, 58)]
    H.BOOT = {"D": C(20, 20, 24), "M": C(36, 36, 42), "H": C(56, 56, 64)}
    H.SMEAR = [C(220, 245, 255, 235), C(120, 200, 255, 160)]
    H.HEAD = hood_head(30, 16, 12, 12,
                       [C(196, 182, 104), C(160, 148, 82), C(124, 114, 62), C(90, 82, 44)],
                       [C(24, 20, 26), C(36, 30, 36), C(255, 170, 90)])
    H.BUN = empty()
    H.draw_blade = baton_painter(H)
    H.draw_sheath = lambda P, with_hilt=True: H.Layer()
    H.draw_scabbard = lambda P: H.Layer()
    # same poses and order as the blade cyborg, so BLADE_ANIMS fits
    blade = importlib.import_module("make_blade_poses")
    frames, anims = blade.build(H)
    return H, frames, anims


# ------------------------------------------------------------------- chief

def make_chief():
    H = importlib.import_module("make_hero3")
    importlib.reload(H)
    H.ROBE = {"dk": C(54, 56, 62), "sh": C(92, 96, 104), "md": C(118, 122, 130), "bs": C(144, 148, 156), "hi": C(178, 182, 190), "hi2": C(210, 214, 220)}
    H.MANTLE = {"dk": C(150, 70, 20), "sh": C(190, 92, 28), "bs": C(230, 118, 40), "hi": C(255, 150, 70), "hi2": C(255, 186, 120)}
    H.COLLAR = [C(230, 118, 40), C(190, 92, 28)]
    H.SASH = {"dk": C(26, 26, 30), "bs": C(44, 44, 50), "hi": C(220, 224, 230), "strap": C(90, 90, 98)}
    H.SKIN = {"hi": C(64, 64, 72), "bs": C(46, 46, 54), "sh": C(32, 32, 40), "dk": C(22, 22, 28)}
    H.CUFF = [C(230, 118, 40), C(170, 80, 24)]
    H.PANT = [C(70, 72, 80), C(96, 98, 106)]
    H.LEGWRAP = [C(220, 224, 230), C(150, 154, 160)]
    H.BOOT = {"D": C(20, 20, 24), "M": C(36, 36, 42), "H": C(56, 56, 64)}
    H.SMEAR = [C(220, 245, 255, 235), C(120, 200, 255, 160)]
    head = hood_head(32, 18, 9, 10,
                     [C(206, 210, 216), C(170, 174, 182), C(132, 136, 144), C(98, 100, 108)],
                     [C(24, 20, 26), C(40, 34, 40), C(255, 160, 80)],
                     band=[C(230, 118, 40), C(170, 80, 24)])
    H.HEAD = head
    H.BUN = empty()
    # the shoulder cape becomes a short orange hi-vis tabard
    orig_mantle = H.draw_mantle

    def tabard(P):
        P2 = dict(P)
        P2["hemBack"] = min(P.get("hemBack", 0), 2)
        P2["tail"] = 0
        return orig_mantle(P2)
    H.draw_mantle = tabard

    # the incinerator tank on his back, where a scabbard would be
    def tank(P):
        L = H.Layer()
        b, ln = P["bob"], P["lean"]
        x0, y0 = 18 + ln * 0.4 + H.OX, H.TOP + 4 + b + H.OY
        for y in range(y0, y0 + 20):
            for x in range(int(x0), int(x0) + 8):
                t = (x - x0) / 7
                L.put(x, y, C(242, 196, 58) if t > 0.7 else C(206, 160, 40) if t > 0.3 else C(150, 112, 28))
        for x in range(int(x0), int(x0) + 8):
            L.put(x, y0, C(255, 220, 120))
            L.put(x, y0 + 7, C(40, 34, 30))
            L.put(x, y0 + 14, C(40, 34, 30))
        L.put(x0 + 3, y0 - 1, C(90, 90, 98))
        L.put(x0 + 4, y0 - 2, C(90, 90, 98))
        return L.outline()
    H.draw_scabbard = tank
    H.draw_sheath = lambda P, with_hilt=True: H.Layer()
    baton = baton_painter(H)
    nozzle = nozzle_painter(H)
    H.draw_blade = baton

    frames, anims = [], {}

    def anim(name, fps, loop, *fs):
        s = len(frames)
        frames.extend(fs)
        anims[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}

    F = H.frame
    G = dict(arm=(20, -40), sword=("held", -30), legs=((7, 0), (-6, 0)), lean=1, tail=0)

    def g(**kw):
        dd = dict(G)
        dd.update(kw)
        return F(**dd)

    anim("guard", 4, True, g(), g(bob=1), g(bob=1, headDy=1), g())
    WALK = [((7, 0), (-5, 0)), ((4, 2), (-3, 0)), ((2, 3), (-1, 0)), ((5, 0), (-5, 2)), ((7, 0), (-4, 3)), ((6, 0), (-6, 0))]
    anim("walk", 8, True, *[g(legs=WALK[i], bob=1 if i % 3 == 0 else 0, lean=2) for i in range(6)])
    anim("windup", 9, False,
         F(lean=-1, legs=((7, 0), (-7, 0)), arm=(-80, -35), sword=("held", -110), droop=(0.2, 1)),
         F(bob=2, lean=-3, legs=((8, 0), (-8, 0)), arm=(-120, -20), sword=("held", -150), droop=(0.3, 1)))
    anim("strike", 24, False,
         F(bob=2, lean=5, legs=((11, 0), (-8, 0)), arm=(10, 0), sword=("held", 30), smear=(-140, 30), hemBack=3),
         F(bob=2, lean=4, legs=((11, 0), (-8, 0)), arm=(45, -6), sword=("held", 75), smear=(10, 75), hemBack=2),
         F(bob=1, lean=3, legs=((10, 0), (-7, 0)), arm=(50, -24), sword=("held", 55), hemBack=1))
    anim("strike2", 24, False,
         F(bob=1, lean=5, legs=((11, 0), (-9, 0)), arm=(-16, 0), sword=("held", -46), smear=(110, -46), hemBack=3),
         F(bob=0, lean=4, legs=((11, 0), (-9, 1)), arm=(-66, -4), sword=("held", -110), smear=(-30, -110), hemBack=2),
         F(bob=1, lean=2, legs=((10, 0), (-8, 0)), arm=(-50, -24), sword=("held", -80), hemBack=1))
    anim("recover", 5, False,
         F(bob=2, lean=2, legs=((9, 0), (-7, 0)), arm=(50, -28), sword=("held", 55)),
         F(bob=1, lean=1, legs=((8, 0), (-7, 0)), arm=(30, -34), sword=("held", 0)))
    # the red "!": both hands high over the helmet, then down
    anim("heavy", 6, True,
         F(bob=0, lean=-3, headDy=-1, legs=((8, 0), (-8, 0)), arm=(-100, -40), sword=("held", -150), droop=(0.3, 1)),
         F(bob=0, lean=-4, headDy=-1, legs=((8, 0), (-8, 0)), arm=(-104, -42), sword=("held", -156), droop=(0.3, 1)))
    anim("smash", 20, False,
         F(bob=4, lean=7, legs=((12, 0), (-9, 0)), arm=(30, 10), sword=("held", 80), smear=(-120, 80), hemBack=4),
         F(bob=5, lean=7, headDy=1, legs=((12, 0), (-9, 0)), arm=(55, 10), sword=("held", 95), hemBack=3),
         F(bob=4, lean=5, legs=((11, 0), (-9, 0)), arm=(55, -10), sword=("held", 90), hemBack=2))
    # the purple 危: the spray lance comes up and aims at the floor ahead
    H.draw_blade = nozzle
    anim("flamewind", 6, True,
         F(bob=2, lean=2, legs=((9, 0), (-8, 0)), arm=(30, -10), sword=("held", 30), droop=(0, 1)),
         F(bob=2, lean=2, legs=((9, 0), (-8, 0)), arm=(32, -10), sword=("held", 32), droop=(0, 1)))
    anim("flame", 10, True,
         F(bob=3, lean=3, legs=((10, 0), (-9, 0)), arm=(36, -6), sword=("held", 34), droop=(0, 1), hemBack=2),
         F(bob=3, lean=3, legs=((10, 0), (-9, 0)), arm=(38, -6), sword=("held", 36), droop=(0, 1), hemBack=3))
    H.draw_blade = baton
    anim("block", 10, False, F(lean=-1, legs=((7, 0), (-8, 0)), arm=(-45, -25), sword=("held", -95), droop=(0.2, 1)))
    anim("recoil", 10, False, F(lean=-4, headDy=-1, legs=((6, 1), (-8, 0)), arm=(-150, 15), sword=("held", -160), droop=(0.6, 0.6), hemFront=2))
    stag = F(bob=6, lean=-2, headDy=2, legs=((6, 0), (-3, 0)), arm=(100, -5), sword=("held", 105), droop=(0, 1), hemLift=-1)
    anim("stagger", 3, True, stag, F(bob=6, lean=-1, headDy=3, legs=((6, 0), (-3, 0)), arm=(95, -5), sword=("held", 100), droop=(0, 1), hemLift=-1))
    anim("hurt", 10, False, F(lean=-4, headDy=-1, legs=((6, 2), (-6, 0)), arm=(-60, -20), sword=("held", -60), droop=(0.6, 0.6), hemFront=2))
    # subdued: on his knees, empty-handed, the hose cut
    H.draw_blade = lambda hand, ang, length=16: H.Layer()
    kneel = F(bob=9, lean=4, headDy=2, legs=((7, 0), (-2, 0)), arm=(95, -20), sword=("held", 0), droop=(0, 1), hemLift=-1)
    anim("kneel", 2, True, kneel, F(bob=9, lean=4, headDy=3, legs=((7, 0), (-2, 0)), arm=(95, -18), sword=("held", 0), droop=(0, 1), hemLift=-1))
    return H, frames, anims


def save(H, frames, anims, name, cols=16):
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGBA", (H.FW * cols, H.FH * rows))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * H.FW, (i // cols) * H.FH))
    sheet.save(f"assets/{name}.png")
    json.dump({"anims": anims}, open(f"assets/{name}.json", "w"), indent=1)
    S = 3
    prev = Image.new("RGBA", (8 * H.FW * S, ((len(frames) + 7) // 8) * H.FH * S), (40, 30, 60, 255))
    for i, f in enumerate(frames):
        prev.alpha_composite(f.resize((H.FW * S, H.FH * S), Image.NEAREST), ((i % 8) * H.FW * S, (i // 8) * H.FH * S))
    prev.save(f"scratch/{name}_preview.png")
    print(name, len(frames), "frames")


if __name__ == "__main__":
    H, fr, an = make_grunt()
    save(H, fr, an, "grunt")
    H, fr, an = make_chief()
    save(H, fr, an, "chief")
