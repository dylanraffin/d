# Photos de démonstration : portraits dessinés, sans visage (aucune personne réelle).
# Style « miel » : aplats clairs et chauds, lumière de jour, quelques fonds miel. Elles tiennent la place des vraies photos.
#   python3 tools/demo/avatars.py server/seed-assets
import random, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 2                      # dessin à double taille, réduit ensuite : bords nets
W, H = 600 * S, 800 * S
BACKGROUNDS = [(255, 219, 91), (243, 243, 243), (246, 239, 224), (234, 217, 189), (255, 243, 134), (220, 214, 204), (237, 201, 172), (59, 59, 59),
               (232, 232, 232), (250, 232, 180), (226, 205, 178), (255, 219, 91)]
SKINS = [(241, 201, 165), (224, 172, 134), (198, 142, 99), (168, 115, 74), (138, 90, 56), (107, 66, 38), (246, 215, 189), (212, 154, 106)]
HAIRS = [(32, 32, 32), (59, 42, 32), (90, 61, 40), (42, 42, 42), (122, 90, 58), (176, 138, 90), (138, 138, 138)]
SHIRTS = [(32, 32, 32), (255, 255, 255), (207, 207, 207), (59, 59, 59), (246, 239, 224), (87, 86, 86)]


def shade(color, k):
    return tuple(max(0, min(255, int(c * k))) for c in color)


def light(size, center, radius, strength):
    """Halo clair et doux : la lumière de jour qui vient d'un côté."""
    layer = Image.new('L', size, 0)
    cx, cy = center
    ImageDraw.Draw(layer).ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=int(255 * strength))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.5))


def make(seed, kind, path):
    rng = random.Random(seed)
    bg = BACKGROUNDS[seed % len(BACKGROUNDS)]
    skin = SKINS[(seed * 5 + 1) % len(SKINS)]
    hair = HAIRS[(seed * 3 + 2) % len(HAIRS)]
    shirts = [c for c in SHIRTS if sum(abs(c[i] - bg[i]) for i in range(3)) > 90]
    shirt = shirts[(seed * 7) % len(shirts)]
    img = Image.new('RGB', (W, H), bg)
    side = rng.choice([-1, 1])
    # fond : un halo plus clair d'un côté, un peu plus dense en bas
    img = Image.composite(Image.new('RGB', (W, H), shade(bg, 1.1)), img, light((W, H), (W / 2 + side * 260 * S, 200 * S), 420 * S, 0.5))
    img = Image.composite(Image.new('RGB', (W, H), shade(bg, 0.9)), img, light((W, H), (W / 2 - side * 220 * S, 820 * S), 380 * S, 0.45))

    d = ImageDraw.Draw(img)
    cx = W / 2 + rng.uniform(-36, 36) * S
    close = kind == 'closer'
    hy = (rng.uniform(300, 340) if close else rng.uniform(330, 380)) * S
    rx = (rng.uniform(112, 126) if close else rng.uniform(92, 104)) * S
    ry = rx * rng.uniform(1.2, 1.3)
    sw = (rng.uniform(290, 330) if close else rng.uniform(235, 275)) * S
    sy = hy + ry * 1.3
    neck = rx * 0.46
    # épaules et haut du corps
    d.rounded_rectangle([cx - sw, sy, cx + sw, H + 260 * S], radius=int(rng.uniform(120, 170) * S), fill=shirt)
    # encolure
    d.ellipse([cx - neck * 1.5, sy - neck * 0.7, cx + neck * 1.5, sy + neck * 1.1], fill=skin)
    # cou, avec l'ombre du menton
    d.rectangle([cx - neck, hy + ry * 0.55, cx + neck, sy + neck * 0.3], fill=skin)
    d.ellipse([cx - neck, hy + ry * 0.62, cx + neck, hy + ry * 1.22], fill=shade(skin, 0.86))
    # oreilles, tête
    ear = rx * 0.16
    d.ellipse([cx - rx - ear * 0.7, hy - ear, cx - rx + ear * 1.2, hy + ear * 1.6], fill=shade(skin, 0.94))
    d.ellipse([cx + rx - ear * 1.2, hy - ear, cx + rx + ear * 0.7, hy + ear * 1.6], fill=shade(skin, 0.94))
    d.ellipse([cx - rx, hy - ry, cx + rx, hy + ry], fill=skin)
    head = Image.new('L', (W, H), 0)
    ImageDraw.Draw(head).ellipse([cx - rx, hy - ry, cx + rx, hy + ry], fill=255)
    # barbe : le bas du visage, dans la couleur des cheveux
    style = rng.choice(['short', 'short', 'cap', 'buzz', 'bald'])
    if rng.random() < 0.45:
        beard = Image.new('L', (W, H), 0)
        bd = ImageDraw.Draw(beard)
        bd.ellipse([cx - rx * 1.04, hy + ry * 0.08, cx + rx * 1.04, hy + ry * 1.5], fill=255)
        bd.ellipse([cx - rx * 0.62, hy - ry * 0.3, cx + rx * 0.62, hy + ry * 0.5], fill=0)
        img.paste(Image.new('RGB', (W, H), hair if style != 'bald' else shade(hair, 1.25)), (0, 0), ImageChops.multiply(beard, head))
        d = ImageDraw.Draw(img)
    # cheveux
    if style != 'bald':
        cap = Image.new('L', (W, H), 0)
        cd = ImageDraw.Draw(cap)
        depth = {'short': 0.42, 'cap': 0.56, 'buzz': 0.34}[style]
        over = {'short': 1.07, 'cap': 1.1, 'buzz': 1.0}[style]
        cd.ellipse([cx - rx * over, hy - ry * (over + 0.06), cx + rx * over, hy + ry * 0.9], fill=255)
        cd.rectangle([0, hy - ry * depth, W, H], fill=0)
        if style != 'buzz':   # la ligne des cheveux n'est pas droite : une mèche d'un côté
            cd.ellipse([cx + side * rx * 0.05 - rx * 0.75, hy - ry * (depth + 0.38), cx + side * rx * 0.05 + rx * 0.75, hy - ry * (depth - 0.2)], fill=255)
            cd.ellipse([cx - side * rx * 0.55 - rx * 0.5, hy - ry * (depth + 0.05), cx - side * rx * 0.55 + rx * 0.5, hy - ry * (depth - 0.34)], fill=0)
        color = hair if style != 'buzz' else tuple(int(hair[i] * 0.55 + skin[i] * 0.45) for i in range(3))
        img.paste(Image.new('RGB', (W, H), color), (0, 0), cap)
    # lumière sur la silhouette, du même côté que celle du fond
    img = Image.composite(Image.new('RGB', (W, H), (255, 255, 255)), img, light((W, H), (cx + side * rx * 0.9, hy - ry * 0.2), rx * 1.5, 0.16))
    img = Image.composite(Image.new('RGB', (W, H), (32, 32, 32)), img, light((W, H), (cx - side * sw * 0.8, sy + 360 * S), 300 * S, 0.14))
    img = img.resize((450, 600), Image.LANCZOS)
    grain = Image.effect_noise((450, 600), 9).convert('RGB')
    img = Image.blend(img, ImageChops.overlay(img, grain), 0.22)
    img.save(path, 'JPEG', quality=86)


out = sys.argv[1]
kinds = ['portrait', 'closer', 'portrait', 'portrait', 'closer']
for i in range(1, 41):
    make(100 + i * 7, kinds[i % len(kinds)], f'{out}/profile-{i:02d}.jpg')
for i in range(1, 7):
    make(900 + i * 13, 'closer' if i % 2 else 'portrait', f'{out}/album-{i}.jpg')
print('ok')
