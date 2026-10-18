// Headless checks for 未知律: generation speed/success, solution lengths,
// and how far a law-blind random agent gets compared with the solver.
import { newRun, startLayer, descend, step, clone, solve, ACTIONS, MAX_DEPTH } from '../michiritsu/js/core.js';

const RUNS = Number(process.argv[2] || 30);
const expand = { u: 'up', d: 'down', l: 'left', r: 'right', w: 'wait' };

function stats(arr) {
  if (!arr.length) return 'n/a';
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `mean ${mean.toFixed(1)}  min ${s[0]}  med ${s[s.length >> 1]}  max ${s[s.length - 1]}`;
}

const genTimes = [], solLens = [], attempts = [], goalTypes = {};
let failures = 0;
// Agent A: follows the solver's path for each layer (perfect knowledge) — light budget sanity check.
// Agent B: random walker that never reasons about laws.
let solverDepth = [], randomDepth = [];

for (let r = 0; r < RUNS; r++) {
  const seed = 1000 + r * 7;
  // perfect-knowledge agent, re-solving each layer so it accounts for its own hp/light
  try {
    const run = newRun(seed);
    const t0 = performance.now();
    let s = startLayer(run);
    genTimes.push(performance.now() - t0);
    let depth = 1;
    for (;;) {
      solLens.push(s.solution.length);
      attempts.push(s.attempts);
      goalTypes[s.goal.type] = (goalTypes[s.goal.type] || 0) + 1;
      for (const ch of s.solution) step(s, expand[ch]);
      if (s.status !== 'descend') break;
      const t1 = performance.now();
      s = descend(run, s);
      genTimes.push(performance.now() - t1);
      if (!s) { depth = MAX_DEPTH + 1; break; }
      depth = run.depth;
    }
    solverDepth.push(depth);
  } catch (e) {
    failures++;
    console.error('seed', seed, e.message);
  }
  // random agent
  for (let k = 0; k < 3; k++) {
    const run = newRun(seed);
    let s = startLayer(run);
    let rngState = { v: seed * 31 + k };
    const rnd = () => ((rngState.v = (rngState.v * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let t = 0; t < 2000 && s; t++) {
      if (s.status === 'descend') { s = descend(run, s); continue; }
      if (s.status !== 'play') break;
      // walk toward the seal once open, otherwise wander
      let a = ACTIONS[Math.floor(rnd() * 5)];
      if (s.sealOpen) {
        const dx = s.seal.x - s.player.x, dy = s.seal.y - s.player.y;
        a = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (rnd() < 0.3) a = ACTIONS[Math.floor(rnd() * 4)];
      }
      step(s, a);
    }
    randomDepth.push(s ? run.depth : MAX_DEPTH + 1);
  }
}

console.log(`runs ${RUNS}, generation failures ${failures}`);
console.log('layer gen ms     ', stats(genTimes.map(Math.round)));
console.log('gen attempts     ', stats(attempts));
console.log('solution length  ', stats(solLens));
console.log('goal types       ', goalTypes);
console.log('solver depth     ', stats(solverDepth), ' (6 = cleared)');
console.log('random depth     ', stats(randomDepth), ' cleared', randomDepth.filter(d => d > MAX_DEPTH).length, '/', randomDepth.length);
