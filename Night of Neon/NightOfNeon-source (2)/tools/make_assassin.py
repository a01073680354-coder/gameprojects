"""The Assassin (암살자), stage 2 boss: a slim cyber-ninja on the hero's
part-based rig. Graphite suit with violet light lines, a hooded mask with
a single visor slit, a long white scarf, a violet-edged ninjato.

Frames are 96x96 (taller than the hero's 96x80 so rotated wall-cling
frames fit). Every anim stores its own origin: floor poses stand on the
feet, cling poses are centred on the body.
"""
import json
import sys
from PIL import Image

sys.path.insert(0, "tools")
import make_hero2 as H  # noqa: E402

C = H.C
H.ROBE = {"dk": C(22, 22, 32), "sh": C(38, 38, 54), "md": C(50, 50, 70), "bs": C(62, 62, 86), "hi": C(102, 96, 140), "hi2": C(170, 150, 230)}
H.COLLAR = [C(200, 140, 255), C(130, 70, 210)]
H.SASH = {"dk": C(18, 18, 26), "bs": C(120, 70, 220), "hi": C(200, 160, 255), "strap": C(150, 150, 170)}
H.SKIN = {"hi": C(86, 86, 104), "bs": C(56, 56, 70), "sh": C(36, 36, 48), "dk": C(22, 22, 30)}
H.CUFF = [C(190, 150, 255), C(100, 60, 170)]
H.BLADE = {"edge": C(255, 255, 255), "bs": C(222, 205, 255), "mid": C(160, 120, 240), "back": C(60, 40, 110)}
H.PANT = [C(34, 34, 46), C(58, 58, 76)]
H.BOOT = {"D": C(18, 18, 24), "M": C(40, 40, 52), "H": C(70, 70, 88)}
H.SHEATH = {"dk": C(10, 10, 14), "bs": C(26, 24, 34), "hi": C(70, 60, 100)}
H.GOLD = [C(220, 190, 255), C(150, 100, 230), C(80, 40, 140)]
H.WRAP = [C(40, 40, 54), C(16, 16, 22)]
H.SMEAR = [C(245, 235, 255, 235), C(170, 110, 255, 175)]

O = (4, 3, 6, 255)


def outline_put(im, px):
    for (x, y) in list(px.keys()):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in px:
                px[(x + dx, y + dy)] = O
    for (x, y), c in px.items():
        if 0 <= x < 64 and 0 <= y < 64:
            im.putpixel((x, y), c)


def make_head():
    """Hood drawn to a point at the back, a smooth mask, one violet visor slit."""
    im = Image.new("RGBA", (64, 64))
    px = {}
    cx, cy = 30, 16
    for y in range(3, 31):
        for x in range(12, 46):
            r = ((x + 0.5 - cx) / 13) ** 2 + ((y + 0.5 - cy) / 12.5) ** 2
            hood_tail = x < cx - 6 and y > 6 and (cx - x) * 0.5 + (y - 8) * 0.25 < 9 and y < 26
            if r <= 1 or hood_tail:
                t = ((x - cx) * -0.6 + (y - cy) * -0.8) / 13
                c = C(92, 88, 120) if t > 0.5 else C(64, 62, 88) if t > -0.05 else C(44, 42, 62) if t > -0.55 else C(28, 26, 40)
                px[(x, y)] = c
    # mask: a smooth pale plate on the face side
    for y in range(9, 28):
        for x in range(31, 45):
            if (x, y) in px and (x - 31) + abs(y - 18) * 0.4 < 13:
                px[(x, y)] = C(96, 94, 116) if y < 15 else C(74, 72, 94) if y < 22 else C(52, 50, 68)
    # the visor slit
    for x in range(31, 45):
        if (x, 16) in px:
            px[(x, 15)] = O
            px[(x, 16)] = C(210, 160, 255) if x < 43 else O
            if x > 34 and x < 43:
                px[(x, 17)] = C(120, 60, 220)
            if (x, 17) not in px or px[(x, 17)] != C(120, 60, 220):
                px[(x, 17)] = O
    px[(40, 16)] = C(250, 240, 255)
    px[(41, 16)] = C(250, 240, 255)
    # hood rim highlight
    for x in range(18, 30):
        if (x, 5) in px:
            px[(x, 5)] = C(90, 84, 120)
    outline_put(im, px)
    return im


def make_scarf():
    """A long white scarf from the neck: two broad ribbons streaming behind."""
    import math
    im = Image.new("RGBA", (64, 64))
    px = {}
    for tail, (drop, length, width, phase) in enumerate(((0.28, 21, 4, 0.0), (0.62, 16, 3, 1.7))):
        for i in range(length):
            u = i / length
            x = 21 - i
            y = 21 + i * drop + math.sin(u * 5 + phase) * 1.6
            w = max(2, round(width * (1 - 0.45 * u)))
            for k in range(w):
                c = C(244, 242, 252) if k == 0 else C(214, 210, 232) if k < w - 1 else C(160, 154, 190)
                if tail == 1:
                    c = (c[0] - 26, c[1] - 26, c[2] - 16, 255)
                px[(int(x), int(round(y)) + k)] = c
        # violet hem at the tip
        tx = 21 - length + 1
        ty = int(round(21 + (length - 1) * drop))
        for k in range(2):
            px[(tx, ty + k)] = C(180, 120, 255)
            px[(tx + 1, ty + k)] = C(140, 80, 230)
    # the knot at the throat
    for (x, y) in ((21, 20), (22, 20), (21, 21), (22, 21), (23, 21)):
        px[(x, y)] = C(230, 226, 242)
    outline_put(im, px)
    return im


H.HEAD = make_head()
H.BUN = make_scarf()

FW, FH = 96, 96
frames, ANIMS = [], {}


def up(img):
    """96x80 rig frame -> 96x96, feet kept at row 94."""
    out = Image.new("RGBA", (FW, FH))
    out.alpha_composite(img, (0, 16))
    return out


def centred(img, rot):
    """Rotate a crouch about its body centre (wall cling = feet toward the wall)."""
    bbox = img.getbbox()
    crop = img.crop(bbox)
    rr = crop.rotate(rot, expand=True, resample=Image.NEAREST)
    out = Image.new("RGBA", (FW, FH))
    out.alpha_composite(rr, (FW // 2 - rr.width // 2, FH // 2 - rr.height // 2))
    return out


def anim(name, fps, loop, fs, origin):
    s = len(frames)
    frames.extend(fs)
    ANIMS[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop, "ox": origin[0], "oy": origin[1]}


F = H.frame
FEET = (46, 94)
MID = (48, 48)

stand = [F(sword=("held", 140), arm=(80, -30), legs=((7, 0), (-6, 0)), bun=(0, b % 2), bob=b % 2, tail=2) for b in range(4)]
anim("stand", 5, True, [up(f) for f in stand], FEET)
crouch = [F(bob=9, lean=4, headDy=1, legs=((10, 0), (-9, 0)), arm=(150, 10), sword=("held", 170), droop=(-0.5, 1), bun=(-2, b), hemBack=3, tail=4)
          for b in range(2)]
aimf = [F(bob=10, lean=6, headDy=2, legs=((11, 0), (-10, 0)), arm=(160, 20), sword=("held", 178), droop=(-0.6, 1), bun=(-3, b), hemBack=4, tail=5)
        for b in range(2)]
dash = [F(bob=3, lean=10, legs=((-6, 3), (-12, 3)), arm=(5, 0), sword=("held", 0), droop=(-1, 0.2), hemBack=9, tail=9, bun=(-6, k))
        for k in range(2)]
cut1 = [F(bob=3, lean=8, legs=((-4, 3), (-11, 3)), arm=(10, 0), sword=("held", 35), smear=(-130, 35), hemBack=7, tail=8, bun=(-5, 0)),
        F(bob=3, lean=7, legs=((-4, 3), (-11, 3)), arm=(45, -10), sword=("held", 70), hemBack=6, tail=7, bun=(-5, 1))]
cut2 = [F(bob=3, lean=8, legs=((-4, 3), (-11, 3)), arm=(-10, 0), sword=("held", -40), smear=(110, -40), hemBack=7, tail=8, bun=(-5, -1)),
        F(bob=3, lean=7, legs=((-4, 3), (-11, 3)), arm=(-50, -10), sword=("held", -85), hemBack=6, tail=7, bun=(-5, -1))]

# wall cling (feet on the left wall, looking into the room); the renderer mirrors it for the right wall
anim("cling", 4, True, [centred(f, -90) for f in crouch], MID)
anim("clingAim", 14, True, [centred(f, -90) for f in aimf], MID)
anim("ceil", 4, True, [centred(f, 180).transpose(Image.FLIP_LEFT_RIGHT) for f in crouch], MID)
anim("ceilAim", 14, True, [centred(f, 180).transpose(Image.FLIP_LEFT_RIGHT) for f in aimf], MID)
anim("dash", 20, True, [centred(f, 0) for f in dash], MID)
anim("cut1", 30, False, [centred(f, 0) for f in cut1], MID)
anim("cut2", 30, False, [centred(f, 0) for f in cut2], MID)
anim("recoil", 10, False, [centred(F(lean=-5, headDy=-1, legs=((6, 1), (-8, 0)), arm=(-150, 15), sword=("held", -160), droop=(0.6, 0.6), hemFront=2, tail=-2, bun=(3, -1)), 0)], MID)
stun = F(bob=8, lean=-2, headDy=3, legs=((7, 0), (-3, 0)), arm=(100, -5), sword=("held", 100), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 2))
anim("stun", 3, True, [up(stun), up(F(bob=8, lean=-1, headDy=4, legs=((7, 0), (-3, 0)), arm=(95, -5), sword=("held", 98), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 3)))], FEET)
anim("fall", 8, True, [up(F(lean=-3, legs=((4, 2), (-3, 3)), arm=(-150, 10), sword=("held", -150), droop=(0.3, -1), hemLift=3, tail=-3, bun=(0, -2)))], FEET)
anim("land", 12, False, [up(f) for f in crouch[:1]], FEET)
anim("dead", 1, False, [up(H.lying(stun))], FEET)

COLS = 16
rows = (len(frames) + COLS - 1) // COLS
sheet = Image.new("RGBA", (FW * COLS, FH * rows))
for i, f in enumerate(frames):
    sheet.paste(f, ((i % COLS) * FW, (i // COLS) * FH))
sheet.save("assets/assassin.png")
json.dump({"anims": ANIMS}, open("assets/assassin.json", "w"), indent=1)
S = 3
prev = Image.new("RGBA", (8 * FW * S, ((len(frames) + 7) // 8) * FH * S), (40, 30, 60, 255))
for i, f in enumerate(frames):
    prev.alpha_composite(f.resize((FW * S, FH * S), Image.NEAREST), ((i % 8) * FW * S, (i // 8) * FH * S))
prev.save("scratch/assassin_preview.png")
print(len(frames), "assassin frames")
