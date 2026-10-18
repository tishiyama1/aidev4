# aidev4 — Roguelike Experiments (Vol. 4)

Two first-version prototypes, built from the Vol. 4 proposals. Static files only (no build step), playable on GitHub Pages.

- `index.html`: picks one of the two games
- `michiritsu/`: **未知律 — The Unwritten Laws**
- `petri/`: **シャーレ — PETRI**

There are no in-game instructions, by design. The notes below are for developers.

## 未知律

Every run draws 6 hidden laws of the form *trigger × selector × effect*:

- triggers: touch, step next to, two things meet, every N turns
- selectors: a colour or a shape
- effects: recolour, reshape, repel, pull, swap, split, vanish, hurt, light, merge

You descend 5 strata. Each stratum's seal opens when its hidden condition is met (count / none-left / objects on altars), and the lamps on the seal show progress toward it.

- When a law fires, its glyph appears and a line links cause and effect. The field notes keep the last thing each glyph did. Click a note to pin it.
- Periodic laws pulse one turn before they fire. Harmful things tremble when you get close.
- From stratum 4, one law changes and its glyph cracks.
- When a run ends, every law is revealed as pictograms.
- Every stratum is generated and then checked with a solver, so it is always openable.
- Controls: arrows/WASD (or tap toward a cell), space to wait. URL options: `?seed=...` for a fixed run, `?daily` for the date's run.

## シャーレ

Each day you get three drops onto a hex dish (127 cells). Every drop is followed by 8 generations of cellular simulation.

- Strains are defined by traits (grow, prey, toxic, spore, symbio, dormant, photo, shell), and each trait is drawn on the colony.
- Each day brings a random environment: light gradient, nutrients, an antibiotic streak, bubbles. An invader strain enters from the marked rim.
- At the end of a day, your share of the dish must reach the notch on the ring.
- Between days you either add a strain or graft a trait.
- Day 7's invader counters the traits your library leans on.
- Controls: 1/2/3 or click to choose a card, then click the dish. A click during culture fast-forwards it.

## Tools (headless verification)

```
node tools/michiritsu-sim.mjs 30   # generation speed, solution lengths, solver vs law-blind random agent
node tools/petri-sim.mjs 60        # random vs 1-ply greedy agent: wins, days cleared, share by day
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
