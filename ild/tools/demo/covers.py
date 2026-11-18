# Couvertures de démonstration pour les plans à plusieurs : ambiances abstraites (lumières floues, sans personne).
# python3 tools/demo/covers.py  ->  server/seed-assets/plan-1.jpg … plan-3.jpg
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path

W, H = 1280, 720
OUT = Path(__file__).resolve().parents[2] / 'server' / 'seed-assets'

def scene(seed, base_top, base_bottom, lights, n, size, floor=None):
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, H)[:, None, None]
    img = (np.array(base_top) * (1 - y) + np.array(base_bottom) * y) * np.ones((H, W, 3))
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.zeros((H, W, 3))
    for _ in range(n):
        cx, cy = rng.uniform(-0.05, 1.05) * W, rng.uniform(0.05, 0.75) * H
        r = rng.uniform(*size)
        col = np.array(lights[rng.integers(len(lights))]) * rng.uniform(0.35, 1.0)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
        disk = np.clip(1.15 - d, 0, 1) ** 0.6 * (d < 1.05)
        glow += disk[..., None] * col * 0.55
        glow += np.exp(-(d ** 2) * 0.6)[..., None] * col * 0.08
    img = img + glow
    if floor is not None:  # comptoir ou banquette : le bas de l'image s'assombrit en douceur
        top = H * floor
        mask = 1 / (1 + np.exp(-(np.arange(H) - top) / 18))
        img *= (1 - 0.7 * mask)[:, None, None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    im = Image.fromarray(img).filter(ImageFilter.GaussianBlur(1.2))
    noise = (rng.normal(0, 6, (H, W, 1)) * np.ones((1, 1, 3)))
    arr = np.clip(np.asarray(im).astype(float) + noise, 0, 255).astype(np.uint8)
    # vignette
    v = 1 - 0.55 * (((xx / W - 0.5) ** 2 + (yy / H - 0.5) ** 2) * 2.2)
    arr = np.clip(arr * v[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

scenes = [
    # salon tamisé : lampes ambrées
    dict(seed=11, base_top=(26, 18, 14), base_bottom=(10, 8, 8), lights=[(255, 170, 90), (255, 210, 150), (220, 120, 70)], n=26, size=(18, 70), floor=0.78),
    # club : néons bleus et violets
    dict(seed=23, base_top=(8, 10, 26), base_bottom=(4, 4, 10), lights=[(120, 150, 255), (170, 110, 255), (90, 200, 255)], n=34, size=(14, 60), floor=0.82),
    # chambre d'hôtel : ville de nuit derrière la fenêtre
    dict(seed=37, base_top=(14, 16, 24), base_bottom=(8, 8, 12), lights=[(255, 200, 140), (200, 210, 255), (255, 150, 110)], n=60, size=(6, 26), floor=0.7),
]
for i, s in enumerate(scenes, 1):
    scene(**s).save(OUT / f'plan-{i}.jpg', quality=84)
    print(OUT / f'plan-{i}.jpg')
