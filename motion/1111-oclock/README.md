# 11:11 Masterclass O'clock — motion reel (15 s)

Showreel motion design 1920×1080, 60 fps, rendu avec HyperFrames (HTML + GSAP → MP4).

| Temps | Scène |
|---|---|
| 0–3 s | Split-flap 3D qui défile jusqu'à 11:11, la rangée passe en or |
| 3–6 s | Volet circulaire, horloge qui se dessine, aiguilles jusqu'à 11:11:11 |
| 6–9,5 s | Typo cinétique « IT'S / ELEVEN / ELEVEN / o'clock », puis marquee incliné |
| 9,5–11 s | Ciel étoilé, « make a wish. », étoile filante |
| 11–15 s | Lockup logo 11:11 MASTERCLASS o'clock + 1111masterclass.com |

- `index.html` : la composition (timeline GSAP unique, déterministe).
- `build-audio.mjs` : sound design synthétisé (flips, impacts, cloches, riser, reverb), calé sur les mêmes timestamps.
- `renders/1111-oclock.mp4` : le rendu final.

```bash
npm i && node build-audio.mjs
export HYPERFRAMES_BROWSER_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell  # cloud uniquement
npm run render
```
