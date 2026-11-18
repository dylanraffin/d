# Photos de démonstration : portraits de nuit à l'allure photographique, sans visage (aucune personne réelle).
# Silhouette en contre-jour devant les lumières floues d'un bar ou d'une rue, grain : comme beaucoup de profils discrets.
# Les visages restent dans l'ombre. Elles tiennent la place des vraies photos.
#   python3 tools/demo/avatars.py server/seed-assets
import random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 600, 800
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)

SKINS = [(232, 190, 160), (214, 160, 122), (190, 132, 96), (160, 104, 70), (128, 82, 54), (98, 62, 42), (240, 205, 180), (205, 150, 108)]
HAIRS = [(18, 14, 12), (34, 24, 18), (52, 36, 26), (24, 22, 22), (80, 58, 40), (120, 96, 70), (90, 90, 92)]
CLOTHES = [(16, 16, 18), (26, 26, 30), (44, 44, 50), (120, 116, 110), (30, 36, 52), (54, 40, 34), (86, 84, 82)]
# Lumières de nuit : ambre de bar, blanc de vitrine, bleu de néon froid, rose de club, sodium de rue.
LIGHTS = [(255, 168, 88), (255, 226, 190), (128, 156, 255), (230, 120, 160), (255, 140, 60), (170, 190, 255)]


def blur(a, r):
    """Flou gaussien d'un tableau 2D (0..1) via Pillow."""
    im = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32) / 255


def blur_rgb(a, r):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.GaussianBlur(r))
    return np.asarray(im).astype(np.float32)


def background(rng):
    """Fond flou d'une rue ou d'un bar la nuit : dégradé sombre et disques de lumière hors champ."""
    base_top = np.array(rng.choice([(26, 20, 18), (16, 18, 28), (22, 16, 22), (12, 14, 16), (28, 22, 16)]), np.float32)
    base_bot = base_top * 0.35
    t = (YY / H)[..., None]
    img = base_top * (1 - t) + base_bot * t
    lights = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(lights)
    palette = rng.sample(LIGHTS, 3)
    for _ in range(rng.randint(10, 22)):
        x = rng.uniform(-40, W + 40)
        y = rng.uniform(-60, H * 0.62)
        r = rng.uniform(14, 62)
        c = palette[rng.randrange(3)]
        k = rng.uniform(0.18, 0.62)
        d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v * k) for v in c))
    lights = np.asarray(lights.filter(ImageFilter.GaussianBlur(5))).astype(np.float32)
    glow = blur_rgb(lights, 40) * 0.9
    img = img + lights * 0.85 + glow
    return img, palette


def figure(rng, kind):
    """Masques de la silhouette : corps, peau, cheveux. Épaules en pente douce, tête un peu inclinée."""
    body = Image.new('L', (W, H), 0)
    skin = Image.new('L', (W, H), 0)
    hair = Image.new('L', (W, H), 0)
    db, dh = ImageDraw.Draw(body), ImageDraw.Draw(hair)
    cx = W / 2 + rng.uniform(-70, 70)
    close = kind == 'closer'
    hy = rng.uniform(300, 350) if close else rng.uniform(240, 300)
    rx = rng.uniform(100, 114) if close else rng.uniform(80, 94)
    ry = rx * rng.uniform(1.24, 1.34)
    sw = rx * rng.uniform(2.3, 2.65)
    neck = rx * rng.uniform(0.5, 0.58)
    sy = hy + ry * 1.18
    # Buste : cou qui s'élargit vers les trapèzes, épaules arrondies, bras qui tombent hors du cadre.
    pts = [(cx - neck, hy + ry * 0.5), (cx - neck * 1.08, sy - 4), (cx - sw * 0.5, sy + ry * 0.14), (cx - sw * 0.8, sy + ry * 0.3),
           (cx - sw * 0.96, sy + ry * 0.62), (cx - sw * 1.0, sy + ry * 1.1), (cx - sw * 1.02, H + 80), (cx + sw * 1.02, H + 80),
           (cx + sw * 1.0, sy + ry * 1.1), (cx + sw * 0.96, sy + ry * 0.62), (cx + sw * 0.8, sy + ry * 0.3), (cx + sw * 0.5, sy + ry * 0.14),
           (cx + neck * 1.08, sy - 4), (cx + neck, hy + ry * 0.5)]
    db.polygon(pts, fill=255)
    body = body.filter(ImageFilter.GaussianBlur(17)).point(lambda v: 255 if v > 128 else 0)
    # Peau visible : le cou et l'encolure (col rond ou en V).
    sk = ImageDraw.Draw(skin)
    sk.rectangle([cx - neck, hy + ry * 0.4, cx + neck, sy + 10], fill=255)
    if rng.random() < 0.4:
        sk.polygon([(cx - neck * 1.3, sy - 4), (cx + neck * 1.3, sy - 4), (cx, sy + ry * 0.55)], fill=255)
    else:
        sk.ellipse([cx - neck * 1.35, sy - neck * 0.6, cx + neck * 1.35, sy + neck * 0.7], fill=255)
    # Tête : un œuf (crâne plus large que le menton), oreilles discrètes, légèrement inclinée.
    head = Image.new('L', (W, H), 0)
    dhd = ImageDraw.Draw(head)
    dhd.ellipse([cx - rx, hy - ry, cx + rx, hy + ry * 0.55], fill=255)
    dhd.ellipse([cx - rx * 0.8, hy - ry * 0.2, cx + rx * 0.8, hy + ry], fill=255)
    dhd.ellipse([cx - rx - 5, hy + 4, cx - rx + 9, hy + 34], fill=255)
    dhd.ellipse([cx + rx - 9, hy + 4, cx + rx + 5, hy + 34], fill=255)
    style = rng.choice(['short', 'short', 'cap', 'buzz', 'curly', 'bald', 'short'])
    if style == 'cap':
        dh.chord([cx - rx * 1.06, hy - ry * 1.08, cx + rx * 1.06, hy + ry * 0.12], 180, 360, fill=255)
        side = rng.choice([-1, 1])
        dh.ellipse([cx + side * rx * 0.25 - rx * 1.12, hy - ry * 0.5, cx + side * rx * 0.25 + rx * 1.12, hy - ry * 0.2], fill=255)
    elif style == 'curly':
        for _ in range(30):
            ang = rng.uniform(np.pi * 1.02, np.pi * 1.98)
            rr = rng.uniform(0.88, 1.04)
            x, y = cx + np.cos(ang) * rx * rr, hy + np.sin(ang) * ry * rr
            q = rx * rng.uniform(0.18, 0.28)
            dh.ellipse([x - q, y - q, x + q, y + q], fill=255)
        dh.chord([cx - rx, hy - ry, cx + rx, hy + ry * 0.05], 180, 360, fill=255)
    elif style in ('short', 'buzz'):
        # Ligne des cheveux arrondie, dégagée aux tempes (pas un trait droit).
        low = 0.42 if style == 'short' else 0.2
        dh.ellipse([cx - rx * 1.04, hy - ry * 1.08, cx + rx * 1.04, hy + ry * low], fill=255)
        dh.ellipse([cx - rx * 0.78, hy - ry * (0.62 if style == 'short' else 0.74), cx + rx * 0.78, hy + ry * 1.2], fill=0)
    if rng.random() < 0.5:
        dh.ellipse([cx - rx * 0.86, hy + ry * 0.15, cx + rx * 0.86, hy + ry * 1.02], fill=255)
        dh.ellipse([cx - rx * 0.52, hy - ry * 0.3, cx + rx * 0.52, hy + ry * 0.45], fill=0)
    tilt = rng.uniform(-7, 7)
    head = head.rotate(tilt, center=(cx, hy + ry * 0.6), resample=Image.BICUBIC)
    hair = hair.rotate(tilt, center=(cx, hy + ry * 0.6), resample=Image.BICUBIC)
    skin.paste(255, (0, 0), head)
    m_body = np.asarray(body.filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32) / 255
    m_skin = np.asarray(skin.filter(ImageFilter.GaussianBlur(1.4))).astype(np.float32) / 255
    m_hair = np.asarray(hair.filter(ImageFilter.GaussianBlur(2.0))).astype(np.float32) / 255
    if style != 'cap':
        m_hair = m_hair * m_skin
    return m_body, m_skin, m_hair, (cx, hy, rx, ry, style)


def shade(mask, light, rim_side):
    """Volume approché (hauteur tirée du masque flouté) pour une lumière principale faible, et liseré net
    du contre-jour : seuls les bords tournés vers la lumière arrière s'allument."""
    h = blur(mask, 46) * mask
    gy, gx = np.gradient(h)
    n = np.stack([-gx * 26, -gy * 26, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    key = np.clip((n * np.array(light, np.float32)).sum(-1), 0, 1)
    m2 = blur(mask, 2.2)
    ey, ex = np.gradient(m2)
    mag = np.sqrt(ex ** 2 + ey ** 2) + 1e-6
    facing = np.clip((-ex * rim_side[0] - ey * rim_side[1]) / mag, 0, 1)
    edge = np.clip(mag * 9, 0, 1) * facing
    rim = blur(edge, 1.6) * 1.6 + blur(edge, 6) * 0.9
    return key, np.clip(rim, 0, 1.4) * mask


def make(seed, kind, path):
    rng = random.Random(seed)
    img, palette = background(rng)
    m_body, m_skin, m_hair, head = figure(rng, kind)
    side = rng.choice([-1, 1])
    key_col = np.array(rng.choice([palette[0], (255, 196, 150), (255, 214, 180)]), np.float32) / 255
    rim_col = np.array(rng.choice(palette[1:]), np.float32) / 255
    key_dir = np.array([side * 0.8, -0.3, 0.22], np.float32)
    key_dir /= np.linalg.norm(key_dir)
    rim_side = (-side * 0.92, -0.38)
    mask = np.clip(m_body + m_skin, 0, 1)
    key, rim = shade(mask, key_dir, rim_side)
    skin_col = np.array(SKINS[rng.randrange(len(SKINS))], np.float32)
    cloth_col = np.array(CLOTHES[rng.randrange(len(CLOTHES))], np.float32)
    hair_col = np.array(HAIRS[rng.randrange(len(HAIRS))], np.float32)
    albedo = cloth_col * (1 - m_skin[..., None]) + skin_col * m_skin[..., None]
    albedo = albedo * (1 - m_hair[..., None]) + hair_col * m_hair[..., None]
    # Contre-jour : le visage reste sombre, la lumière principale est faible et rasante.
    key_strength = rng.uniform(0.16, 0.34)
    lit = albedo * (0.05 + key_strength * key[..., None] ** 1.4 * key_col * 1.6)
    lit += rim[..., None] * rim_col * 255 * rng.uniform(0.7, 0.95) * (0.6 + 0.4 * albedo / 255)
    fig = np.clip(lit, 0, 255)
    fig = blur_rgb(fig, 0.9)
    out = img * (1 - mask[..., None]) + fig * mask[..., None]
    # Halo de lumière autour du contour (diffusion de l'objectif).
    bloom = blur_rgb(np.clip(out - 150, 0, 255), 18) * 0.55
    out = out + bloom
    # Vignette, grain, courbe de film.
    r = np.sqrt(((XX - W / 2) / (W * 0.62)) ** 2 + ((YY - H * 0.45) / (H * 0.62)) ** 2)
    out *= np.clip(1.15 - r * 0.55, 0.35, 1)[..., None]
    out += np.random.default_rng(seed).normal(0, 7.5, (H, W, 1)).astype(np.float32)
    out = 255 * (1 - np.exp(-np.clip(out, 0, None) / 205)) / (1 - np.exp(-255 / 205))
    out = out * 0.94 + np.array([10, 9, 12], np.float32)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB').resize((450, 600), Image.LANCZOS).save(path, 'JPEG', quality=86)


out = sys.argv[1]
kinds = ['portrait', 'closer', 'portrait', 'closer', 'portrait']
for i in range(1, 41):
    make(100 + i * 7, kinds[i % len(kinds)], f'{out}/profile-{i:02d}.jpg')
for i in range(1, 7):
    make(900 + i * 13, 'closer' if i % 2 else 'portrait', f'{out}/album-{i}.jpg')
print('ok')
