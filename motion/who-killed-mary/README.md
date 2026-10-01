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

## Version B: "corrupted tape" (20 s, 9:16)

`b/index.html` (its own project, sharing `assets/` through a symlink) → `renders/who-killed-mary-B-9x16.mp4`. Score: `build-audio-b.mjs` → `assets/audio/score-b.wav`.

| Time | Scene |
|---|---|
| 0–1.4 s | VHS blue screen "▶ PLAY", static |
| 1.4–4.6 s | The cover tears itself apart (RGB split, slices, pixel drag) + LOOK / CLOSER / YOU / MISSED / SOMETHING |
| 4.6–8.2 s | Evidence montage of cover crops (inverted negatives, black frames), "TURN TO PAGE ??" |
| 8.2–11.4 s | "You're the detective." scrambles into "You're the suspect.", NO SIGNAL |
| 11.4–14.6 s | WHO / KILLED / MARY with chromatic aberration, giant red ?, title melts |
| 14.6–20 s | Book on tape + "A QUEST BOOK" → "CAN YOU SOLVE IT?", "AVAILABLE IN OCTOBER", CRT power-off |

Full-frame flashes (inversions, black frames, blue screen) are capped at 3 per second (the WCAG 2.3.1 threshold).

```bash
node build-audio-b.mjs
(cd b && npx hyperframes render --no-browser-gpu --quality delivery --fps 60 --output ../renders/who-killed-mary-B-9x16.mp4)
```
