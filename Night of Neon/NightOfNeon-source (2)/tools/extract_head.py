"""Cut the head (face, beard, hair) and the hair bun out of the PixelLab
east-facing frame. Everything below them is redrawn by make_hero2.py."""
from PIL import Image

src = Image.open("assets/east.png").convert("RGBA")


def gray(p):
    r, g, b, a = p
    return a > 0 and abs(r - g) < 14 and abs(g - b) < 14 and r > 95


head = Image.new("RGBA", (64, 64))
bun = Image.new("RGBA", (64, 64))
for y in range(64):
    for x in range(64):
        p = src.getpixel((x, y))
        if p[3] == 0:
            continue
        # beard tip continues a few rows below the collar on the face side
        if y <= 28 or (y <= 33 and x >= 34 and (gray(p) or (p[0] < 20 and p[1] < 20))):
            if y <= 9 and x <= 24:
                bun.putpixel((x, y), p)
            else:
                head.putpixel((x, y), p)

# drop stray dark pixels under the beard that are not touching beard hair
px = head.load()
rm = []
for y in range(29, 34):
    for x in range(34, 64):
        p = px[x, y]
        if p[3] > 0 and not gray(p):
            if not any(gray(px[x + dx, y + dy]) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < 64 and 0 <= y + dy < 64):
                rm.append((x, y))
for x, y in rm:
    px[x, y] = (0, 0, 0, 0)
head.save("assets/hero_head.png")
bun.save("assets/hero_bun.png")
print("head + bun extracted, removed", len(rm))
