# aidev4 — Roguelike Experiments (Vol. 4)

Two first-version prototypes, built from the Vol. 4 proposals. Static files only (no build step), playable on GitHub Pages.

- `index.html`: picks one of the two games
- `michiritsu/`: **未知律 — The Unwritten Laws**
- `petri/`: **シャーレ — PETRI**

Interface actions are not explained in-game, but each game's own rules are: a rules sheet (the 「遊び方」 button on the title screen, or ? in the HUD) opens automatically before the first run. The goal and the numbers that matter are always on screen.

## 未知律

Every run draws 6 hidden laws of the form *trigger × selector × effect*:

- triggers: touch, step next to, two things meet, every N turns
- selectors: a colour or a shape
- effects: recolour, reshape, repel, pull, swap, split, vanish, hurt, light, merge

You descend 5 strata. Each stratum's seal opens when its stated condition is met (count / none-left / objects on altars), and the lamps on the seal show progress toward it. The laws you can use to meet it are the hidden part.

- When a law fires, its glyph appears and a line links cause and effect. The field notes describe what each glyph did, and after 3 sightings (1 for a law that hurts you) they show the law's full wording.
- The current stratum's goal is shown in words above the board.
- Periodic laws pulse one turn before they fire. Harmful things tremble when you get close.
- From stratum 4, one law changes and its glyph cracks.
- When a run ends, every law is revealed as pictograms and in words.
- Every stratum is generated and then checked with a solver, so it is always openable.
- Controls: arrows/WASD (or tap toward a cell), space to wait. URL options: `?seed=...` for a fixed run, `?daily` for the date's run.

## シャーレ — release version

A seven-day culture roguelike. Each day you get three drops onto a hex dish (127 cells), and every drop is followed by 8 generations of cellular simulation. At the end of a day, your share of the dish must reach the day's target. Between days you either add a strain or graft a trait. Day 7's invader counters the traits your library leans on.

The design rationale (analysis, three directions, the chosen one and the plan) is in [`docs/petri-release.md`](docs/petri-release.md).

**Look and sound**
- The dish is drawn by a WebGL shader as watercolour colonies on lit agar, and each trait shows in the colony's texture. If WebGL is unavailable, or with `?nogl`, a 2D canvas renderer is used instead. Render resolution drops automatically on slow GPUs.
- Strains carry traditional pigment names (茜, 群青, 山吹, …). The invader is 墨.
- All sound is generated: an ambient pad with glass bells, a drone that swells with the invader's share, and effects for drops, growth, predation, arrival and judgement.

**Screens and features**
- Title screen with a live demo dish, a four-step tutorial on the first run, and an illustrated rules sheet.
- A pause menu and settings: volume, music, effects, culture speed, reduced motion, and data reset.
- Progress is saved after every drop, so 「つづきから」 resumes mid-day or at the reward choice.
- Run stats, and a specimen shelf that keeps the final dish of every run.

**Controls**
- Pick a card (or press 1/2/3).
- Press on the dish to aim and release to drop. Arrow keys plus Enter work too.
- Tap during culture, or press Space, to fast-forward. Esc pauses.

**Code layout** (`petri/js/`)
- `sim.js`: rules
- `dish.js`: renderer
- `main.js`: flow
- `store.js`: saving
- `audio.js`: sound
- `palette.js`, `icons.js`, `text.js`: names, icons and wording

## Tools (headless verification)

```
node tools/michiritsu-sim.mjs 30   # generation speed, solution lengths, solver vs law-blind random agent
node tools/petri-sim.mjs 60        # random vs 1-ply greedy agent: wins, days cleared, share by day
node tools/petri-e2e.mjs http://localhost:8080/petri/ <outdir>   # full browser run: tutorial, run to the end, phone, resume, 2D fallback
# tools/dish-lab.html renders a sample dish for tuning the shader (?day=&drops=&seed=&nogl&ghost)
node tools/shot.mjs <url> <outdir> '<steps json>'   # Playwright screenshots + console errors
```

Results at the time of writing:

- **未知律**: every generated stratum is solvable. The solver path averages about 18 turns. A law-blind random walker cleared 0 of 60 runs, with a median depth of 1.
- **シャーレ**: the greedy agent cleared 4.15 days on average and won 19%. The random agent cleared 0.66 days and won 0%.

## Local play

```
npx http-server -c-1 .
```

Then open http://localhost:8080. ES modules and Web Workers need http, so opening the files directly from disk won't work.
