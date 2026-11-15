# Photos de démonstration : silhouettes anonymes éclairées par une lumière de nuit (aucune personne réelle).
import math, random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = 600, 800
LIGHTS = [(61, 125, 255), (150, 95, 255), (255, 95, 150), (255, 150, 70), (40, 200, 190), (255, 205, 110), (90, 170, 255), (220, 80, 255)]

def gradient(top, bottom):
    img = Image.new('RGB', (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img

def glow(center, radius, color, strength=1.0):
    layer = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=tuple(int(c * strength) for c in color))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.55))

def figure_mask(rng, kind):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    cx = W / 2 + rng.uniform(-45, 45)
    if kind == 'torso':   # buste sans visage : le haut du corps sort du cadre
        top = rng.uniform(-140, -60)
        sw = rng.uniform(250, 300)
        d.ellipse([cx - 62, top - 40, cx + 62, top + 150], fill=255)                       # cou
        d.rounded_rectangle([cx - sw, top + 110, cx + sw, H + 200], radius=150, fill=255)  # épaules et torse
        d.polygon([(cx - sw + 40, top + 420), (cx - sw + 90, H + 10), (cx + sw - 90, H + 10), (cx + sw - 40, top + 420)], fill=255)
    else:
        hy = rng.uniform(250, 330) if kind == 'portrait' else rng.uniform(190, 250)
        rx = rng.uniform(88, 104)
        ry = rx * rng.uniform(1.2, 1.32)
        sw = rng.uniform(215, 275)
        d.ellipse([cx - rx, hy - ry, cx + rx, hy + ry], fill=255)                             # tête
        if rng.random() < 0.6:                                                               # cheveux
            d.ellipse([cx - rx * 1.06, hy - ry * 1.12, cx + rx * 1.06, hy - ry * 0.1], fill=255)
        if rng.random() < 0.45:                                                              # barbe
            d.ellipse([cx - rx * 0.92, hy + ry * 0.25, cx + rx * 0.92, hy + ry * 1.16], fill=255)
        d.rectangle([cx - rx * 0.48, hy + ry * 0.7, cx + rx * 0.48, hy + ry * 1.5], fill=255)  # cou
        sy = hy + ry * 1.28
        d.rounded_rectangle([cx - sw, sy, cx + sw, H + 220], radius=int(rng.uniform(110, 160)), fill=255)
    return m.filter(ImageFilter.GaussianBlur(2.2)), cx

def make(seed, kind, path):
    rng = random.Random(seed)
    light = LIGHTS[seed % len(LIGHTS)]
    second = LIGHTS[(seed * 3 + 2) % len(LIGHTS)]
    base = gradient((8, 13, 28), (4, 6, 14))
    side = rng.choice([-1, 1])
    base = ImageChops.screen(base, glow((W / 2 + side * rng.uniform(150, 260), rng.uniform(140, 330)), rng.uniform(260, 360), light, 0.95))
    base = ImageChops.screen(base, glow((W / 2 - side * rng.uniform(170, 280), rng.uniform(520, 760)), rng.uniform(200, 300), second, 0.45))
    mask, cx = figure_mask(rng, kind)
    # corps : sombre, modelé par la lumière qui vient du côté
    body = gradient((16, 22, 40), (7, 10, 20))
    shade = glow((cx + side * 170, 330), 330, light, 0.5)
    body = ImageChops.screen(body, shade)
    # liseré de lumière du côté de la source
    rim = ImageChops.subtract(mask, ImageChops.offset(mask, int(side * 9), 5)).filter(ImageFilter.GaussianBlur(3))
    rim_color = Image.new('RGB', (W, H), tuple(min(255, int(c * 1.15) + 25) for c in light))
    img = Image.composite(body, base, mask)
    img = Image.composite(rim_color, img, rim.point(lambda v: min(255, int(v * 1.5))))
    # grain et vignette
    noise = Image.effect_noise((W, H), 16).convert('RGB')
    img = Image.blend(img, ImageChops.overlay(img, noise), 0.35)
    vig = Image.new('L', (W, H), 0)
    ImageDraw.Draw(vig).ellipse([-140, -120, W + 140, H + 160], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(img, Image.new('RGB', (W, H), (3, 5, 11)), vig)
    img.resize((450, 600), Image.LANCZOS).save(path, 'JPEG', quality=82)

out = sys.argv[1]
kinds = ['portrait', 'closer', 'portrait', 'portrait', 'closer']
for i in range(1, 41):
    make(100 + i * 7, kinds[i % len(kinds)], f'{out}/profile-{i:02d}.jpg')
for i in range(1, 7):
    make(900 + i * 13, 'closer' if i % 2 else 'portrait', f'{out}/album-{i}.jpg')
print('ok')
