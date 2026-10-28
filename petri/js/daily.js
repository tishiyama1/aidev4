// シャーレ — 今日の培養: the daily challenge. Pure functions (no DOM, no storage) so they can be tested in Node.
//
// Everyone gets the same dish on the same day: same starting strains, same plates, same invaders.
// A "day" runs from 00:00 to 24:00 Japan time (UTC+9), so the whole world changes dishes at the same moment.
// The first run of the day is the scored one; later runs are practice. Knowing the dish makes a retry
// easier, so only the first attempt counts and it is shareable on equal terms.
import { hashSeed, TARGET, DAYS } from './sim.js';
import { DAY_NAME } from './text.js';

const JST = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const validId = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// 'YYYY-MM-DD' for the Japan-time day that contains `now` (ms since the epoch).
export const dailyId = (now = Date.now()) => fmt(new Date(now + JST));

export const prevId = id => fmt(new Date(Date.parse(`${id}T00:00:00Z`) - DAY_MS));

// Milliseconds until the next dish arrives.
export const msUntilNext = (now = Date.now()) => DAY_MS - ((now + JST) % DAY_MS);

export const dailySeed = id => hashSeed(`petri-daily:${id}`);

export const shortDate = id => `${Number(id.slice(5, 7))}/${Number(id.slice(8, 10))}`;

// Each cleared day is worth 100, plus a point for every percent by which the dish beat its target.
// A lost day is worth nothing, so depth matters most and dominance breaks ties.
export function dailyScore(history, targets = TARGET) {
  let score = 0;
  history.forEach((share, d) => {
    if (share >= targets[d]) score += 100 + Math.round((share - targets[d]) * 100);
  });
  return score;
}

// Consecutive days with a finished scored attempt.
export function nextStreak(lastId, id, streak) {
  if (lastId === id) return streak;
  return lastId === prevId(id) ? streak + 1 : 1;
}

export function makeRecord(id, history, { abandoned = false, now = Date.now() } = {}) {
  const cleared = history.filter((s, d) => s >= TARGET[d]).length;
  return {
    id, history: [...history], days: cleared, won: cleared >= DAYS && !abandoned,
    score: dailyScore(history), abandoned, at: now,
  };
}

// A short, spoiler-free summary for sharing: one mark per day, then how far it went.
export function shareText(rec) {
  const marks = Array.from({ length: DAYS }, (_, d) => {
    const s = rec.history[d];
    return s === undefined ? '⬜' : s >= TARGET[d] ? '🟨' : '🟪';
  }).join('');
  const outcome = rec.won ? '七日間、守り抜いた' : `${DAY_NAME[Math.min(DAYS - 1, rec.history.length - 1)]}で途絶えた`;
  return `シャーレ 今日の培養 ${rec.id}\n${marks}\n${outcome}\nスコア ${rec.score}`;
}

export function countdownText(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}時間${m % 60}分` : `${m}分`;
}
