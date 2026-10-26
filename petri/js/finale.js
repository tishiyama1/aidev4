// シャーレ — the end of a day, played out. The verdict is already decided by the simulation;
// this only shows its consequence: a dish that missed its target is swallowed by the invader,
// a dish that held devours the invader. Display-only frames, never saved or scored.
import * as P from './sim.js';

const MAX_WAVES = 40;

export function finaleFrames(day, passed, seed) {
  const g = { rng: seed >>> 0 };
  const cells = day.cells.slice();
  const toxin = day.toxin.slice();
  const inv = day.invader.id;
  const owner = id => (id < 0 ? null : day.strains.get(id).owner);
  const habitable = i => !day.env.bubble[i];
  const frames = [];

  if (!passed) {
    // ink pours in: from what the invader holds, or from its entry points if it died out
    if (!cells.some(id => id === inv)) {
      for (const e of day.entries) for (const i of [e, ...P.NEIGH[e]]) if (habitable(i)) cells[i] = inv;
      frames.push({ cells: cells.slice(), toxin, eats: 0, wave: 0 });
    }
    for (let w = 1; w <= MAX_WAVES; w++) {
      const next = cells.slice();
      let eats = 0, changed = 0;
      for (let i = 0; i < P.N; i++) {
        if (cells[i] !== inv) continue;
        for (const n of P.NEIGH[i]) {
          if (!habitable(n) || cells[n] === inv || next[n] === inv) continue;
          if (P.rand(g) < 0.72) {
            if (owner(cells[n]) === 'p') eats++;
            next[n] = inv;
            changed++;
          }
        }
      }
      cells.set(next);
      toxin.fill(0);
      frames.push({ cells: cells.slice(), toxin: toxin.slice(), eats, wave: w });
      if (!changed) break;
    }
    // pockets the ink could not reach (walled off by bubbles) wither on their own
    if (cells.some(id => owner(id) === 'p')) {
      for (let i = 0; i < P.N; i++) if (owner(cells[i]) === 'p') cells[i] = -1;
      frames.push({ cells: cells.slice(), toxin, eats: 0, wave: frames.length });
    }
  } else {
    // the colonies turn on the invader and eat it to the last cell, then breathe out a little
    let growWaves = 0;
    for (let w = 1; w <= MAX_WAVES; w++) {
      const next = cells.slice();
      let eats = 0, grew = 0;
      const invaderLeft = cells.some(id => id === inv);
      for (let i = 0; i < P.N; i++) {
        if (owner(cells[i]) !== 'p') continue;
        for (const n of P.NEIGH[i]) {
          if (!habitable(n)) continue;
          if (cells[n] === inv && next[n] === inv && P.rand(g) < 0.75) { next[n] = cells[i]; eats++; }
          else if (!invaderLeft && cells[n] < 0 && next[n] < 0 && P.rand(g) < 0.35) { next[n] = cells[i]; grew++; }
        }
      }
      // invader cells cut off from any colony still die away
      if (invaderLeft && !eats) for (let i = 0; i < P.N; i++) if (cells[i] === inv && P.rand(g) < 0.5) next[i] = -1;
      cells.set(next);
      frames.push({ cells: cells.slice(), toxin, eats, grew, wave: w });
      if (!invaderLeft && ++growWaves >= 3) break;
    }
  }
  return frames;
}
