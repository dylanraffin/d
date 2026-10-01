# Who Killed Mary: quest-book trailer (15 s, 9:16)

Vertical 1080×1920, 60 fps motion design trailer, rendered with HyperFrames (HTML + GSAP → MP4).

| Time | Scene |
|---|---|
| 0–2.5 s | Typewriter: "Mary is dead." / "You're the detective.", camera flash |
| 2.5–4.6 s | Four strips of yellow "SOLVE IT YOURSELF" crime-scene tape |
| 4.6–9.6 s | "CHOOSE YOUR LEAD.": three Polaroid clues cropped from the cover (lily, sequins, prints) with a page to turn to, red string, marker circle around the chosen lead, dive into the prints |
| 9.6–12.3 s | Blood smears, then WHO / KILLED / MARY? slam on cover yellow, "You choose. You solve." |
| 12.3–15 s | 3D book, "A QUEST BOOK", stamp "AVAILABLE IN OCTOBER" |

- `index.html`: the composition (single deterministic GSAP timeline).
- `build-audio.mjs`: synthesised sound design (drone, heartbeat, typewriter, flashbulb, tape, pins, marker, impacts, stamp), on the same timestamps.
- `assets/img/cover.webp`: the cover supplied by the user; the clues are crops of it.
- `renders/who-killed-mary-9x16.mp4`: the final render.

The page numbers (27, 54, 81) are placeholders: replace them with the real ones from the book in `index.html` (`cards` array) and `build-audio.mjs` (labels).

```bash
npm i && node build-audio.mjs
export HYPERFRAMES_BROWSER_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell  # cloud only
npm run render
```
