// Headless balance check for シャーレ: does planning beat random play by a wide margin?
import * as P from '../petri/js/sim.js';

const RUNS = Number(process.argv[2] || 40);
if (process.argv[3]) Object.assign(P.TUNE, JSON.parse(process.argv[3]));
if (process.argv[4]) P.TARGET.splice(0, 7, ...JSON.parse(process.argv[4]));
let fills = [];

function candidates(day, k, g) {
  const out = [];
  for (let i = 0; i < P.N; i++) if (!day.env.bubble[i]) out.push(i);
  return P.shuffle(g, out).slice(0, k);
}

// greedy: try every card at sampled cells, simulate the drop a couple of times, keep the best mean share
function greedyMove(day, g) {
  let best = null, bestScore = -1;
  for (const id of day.hand) for (const i of candidates(day, 14, g)) {
    let score = 0;
    for (let t = 0; t < 2; t++) {
      const c = P.clone(day);
      c.rng = (day.rng + t * 9973) >>> 0;
      P.playDrop(c, id, i);
      const sh = P.shares(c);
      score += sh.mine - 0.5 * sh.theirs;
    }
    if (score > bestScore) { bestScore = score; best = [id, i]; }
  }
  return best;
}
function randomMove(day, g) {
  return [P.pick(g, day.hand), candidates(day, 1, g)[0]];
}

function playRun(seed, policy) {
  const run = P.newRun(seed);
  const g = { rng: seed ^ 0x5bd1e995 };
  const sharesSeen = [];
  for (run.day = 0; run.day < P.DAYS; run.day++) {
    const day = P.startDay(run);
    while (!P.dayOver(day)) {
      const [id, i] = policy(day, g);
      P.playDrop(day, id, i);
      P.dealHand(day, run);
    }
    const sh = P.shares(day);
    sharesSeen.push(sh.mine);
    fills.push(sh.mine + sh.theirs);
    if (!P.dayPassed(day)) return { days: run.day, sharesSeen };
    const offers = P.offerRewards(run);
    if (offers.length) P.applyReward(run, P.pick(g, offers));
  }
  return { days: P.DAYS, sharesSeen };
}

for (const [name, pol] of [['random', randomMove], ['greedy', greedyMove]]) {
  const t0 = performance.now();
  const res = [];
  const perDay = Array.from({ length: P.DAYS }, () => []);
  for (let r = 0; r < RUNS; r++) {
    const out = playRun(5000 + r * 13, pol);
    res.push(out.days);
    out.sharesSeen.forEach((v, d) => perDay[d].push(v));
  }
  const wins = res.filter(d => d === P.DAYS).length;
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  console.log(`${name.padEnd(7)} wins ${wins}/${RUNS}  mean days cleared ${mean.toFixed(2)}  (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('   share by day (mean):', perDay.map((a, d) => a.length ? `${d + 1}:${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)}` : `${d + 1}:-`).join('  '));
  console.log('   mean fill at day end', (fills.reduce((a, b) => a + b, 0) / fills.length).toFixed(2)); fills = [];
  console.log('   target            :', P.TARGET.map((t, d) => `${d + 1}:${t.toFixed(2)}`).join('  '));
}

// finale invariants: a failed dish ends with no colony of yours, a passed dish ends invader-free
{
  const { finaleFrames } = await import('../petri/js/finale.js');
  let bad = 0, n = 0;
  for (let s = 0; s < 200; s++) {
    const run = P.newRun(s * 977 + 3);
    run.day = s % P.DAYS;
    const day = P.startDay(run);
    const g = { rng: s };
    while (!P.dayOver(day)) { P.playDrop(day, P.pick(g, day.hand), P.randInt(g, P.N)); P.dealHand(day, run); }
    const passed = P.dayPassed(day);
    const last = finaleFrames(day, passed, s).at(-1).cells;
    const mine = [...last].some(id => id >= 0 && day.strains.get(id).owner === 'p');
    const ink = [...last].some(id => id === day.invader.id);
    if (passed ? ink || !mine : mine) bad++;
    n++;
  }
  console.log(`finale endings: ${n - bad}/${n} correct`);
}

// 今日の培養 invariants: the same day is the same dish everywhere, and the day turns over at 00:00 Japan time
{
  const D = await import('../petri/js/daily.js');
  let bad = 0;
  const t = (ok, msg) => { if (!ok) { bad++; console.log('  daily FAIL:', msg); } };
  t(D.dailyId(Date.UTC(2026, 9, 28, 14, 59, 59)) === '2026-10-28' && D.dailyId(Date.UTC(2026, 9, 28, 15, 0, 0)) === '2026-10-29', 'the day changes at 00:00 JST');
  t(D.prevId('2028-03-01') === '2028-02-29' && D.prevId('2027-01-01') === '2026-12-31', 'previous-day arithmetic across leap years and year ends');
  t(D.nextStreak('2026-10-27', '2026-10-28', 3) === 4 && D.nextStreak('2026-10-25', '2026-10-28', 3) === 1, 'streaks continue on consecutive days and restart after a gap');
  const sig = id => {
    const run = P.newRun(D.dailySeed(id)); run.day = 0;
    const day = P.startDay(run);
    return JSON.stringify([run.library.map(s => s.traits), [...day.env.light], [...day.env.nutrient], [...day.env.anti], [...day.env.bubble], day.invader.traits, day.entries]);
  };
  t(sig('2026-10-28') === sig('2026-10-28'), 'a day always produces the same dish');
  const distinct = new Set();
  for (let n = 0; n < 60; n++) distinct.add(sig(new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10)));
  t(distinct.size >= 55, `different days give different dishes (${distinct.size} distinct of 60)`);
  t(D.dailyScore([0.5, 0.4, 0.3]) === 226, 'score = 100 per cleared day + points above the target');
  console.log(`daily challenge invariants: ${bad ? bad + ' FAILED' : 'all hold'}`);
}
