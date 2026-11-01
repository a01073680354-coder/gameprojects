"""Surveillance drone: hovering disc with twin rotors. 40x32 frames.
The eye lens is drawn by the engine so it can track the aim."""
import json
from PIL import Image

W, H = 40, 32
O = (7, 5, 15, 255)


def hx(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


BODY = ["#6b7390", "#4a5170", "#323852", "#1f2338"]


def frame(rot, dead=False, tilt=0):
    im = Image.new("RGBA", (W, H))
    px = {}

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[(x, y)] = c

    cx, cy = 20, 17
    for side in (-1, 1):
        ax = cx + side * 9
        for x in range(min(cx, ax), max(cx, ax) + 1):
            put(x, cy - 5 + (tilt * side if dead else 0), hx(BODY[2]))
        pod_x = cx + side * 12
        for dx in range(-2, 3):
            for dy in range(-2, 2):
                put(pod_x + dx, cy - 6 + dy, hx(BODY[1] if dy < 0 else BODY[2]))
        if not dead:
            span = [7, 4, 1, 4][rot % 4]
            for dx in range(-span, span + 1):
                put(pod_x + dx, cy - 9, hx("#c8d2ff", 150 if abs(dx) < span else 90))
    for y in range(cy - 4, cy + 6):
        rx = 10 - abs(y - (cy + 1)) * 0.9
        for x in range(int(cx - rx), int(cx + rx) + 1):
            t = (y - (cy - 4)) / 10
            c = BODY[0] if t < 0.2 else BODY[1] if t < 0.55 else BODY[2] if t < 0.85 else BODY[3]
            put(x, y, hx(c))
    for y in range(cy - 2, cy + 4):
        for x in range(cx - 3, cx + 4):
            if (x - cx) ** 2 + (y - cy - 1) ** 2 <= 10:
                put(x, y, hx("#0b0812"))
    put(cx - 8, cy + 1, hx("#ff2a6d") if not dead else hx("#401020"))
    put(cx + 8, cy + 1, hx("#2de2e6") if not dead else hx("#103038"))
    if not dead:
        for dy in range(0, 3):
            for dx in range(-2 + dy, 3 - dy):
                put(cx + dx, cy + 7 + dy, hx("#7ff6ff", 220 - dy * 60))
    for (x, y) in list(px.keys()):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q not in px and 0 <= q[0] < W and 0 <= q[1] < H and px[(x, y)][3] == 255:
                px[q] = O
    for (x, y), c in px.items():
        im.putpixel((x, y), c)
    return im


frames = [frame(i) for i in range(4)] + [frame(0, dead=True, tilt=2)]
sheet = Image.new("RGBA", (W * len(frames), H))
for i, f in enumerate(frames):
    sheet.paste(f, (i * W, 0))
sheet.save("assets/drone.png")
json.dump({"hover": [0, 3], "dead": 4, "w": W, "h": H}, open("assets/drone.json", "w"))
print("drone ok")
