// 未知律 — words for goals, laws and observations.

const COLOR_THING = { red: '赤いもの', blue: '青いもの', yellow: '黄色いもの' };
const COLOR_NAME = { red: '赤', blue: '青', yellow: '黄' };
const SHAPE_NAME = { circle: '丸', triangle: '三角', square: '四角', diamond: 'ひし形' };

export const selText = sel => (sel.type === 'color' ? COLOR_THING[sel.value] : SHAPE_NAME[sel.value]);

export function goalText(goal) {
  const s = selText(goal.sel);
  if (goal.type === 'count') return `${s}を ${goal.k}つ以上にする`;
  if (goal.type === 'none') return `${s}を すべて無くす`;
  return `祭壇${goal.k}か所すべてに ${s}を置く`;
}

function effectText(e) {
  switch (e.type) {
    case 'recolor': return `${COLOR_NAME[e.value]}色に変わる`;
    case 'reshape': return `${SHAPE_NAME[e.value]}になる`;
    case 'repel': return 'はじき飛ばされる';
    case 'pull': return 'あなたに引き寄せられる';
    case 'swap': return 'あなたと位置が入れ替わる';
    case 'split': return '分裂して増える';
    case 'vanish': return '消える';
    case 'hurt': return 'あなたが傷つく';
    case 'light': return '消えて灯になる';
    case 'merge': return '合体して形が進む';
    default: return '';
  }
}

export function lawText(law) {
  const s = selText(law.sel);
  const t = law.trigger;
  const eff = effectText(law.effect);
  if (t.type === 'period') {
    if (law.effect.type === 'hurt') return `${t.n}ターンごとに、隣にいる${s}があなたを傷つける`;
    return `${t.n}ターンごとに、${s}は${eff}`;
  }
  const when = t.type === 'touch' ? `${s}に触れると` : t.type === 'adj' ? `${s}の隣に立つと` : `${s}どうしが接すると`;
  if (law.effect.type === 'hurt') return `${when}、${eff}`;
  return `${when}、それは${eff}`;
}

// What the player saw happen, before the law is decoded.
export function observationText(obs) {
  if (!obs) return '';
  switch (obs.extra) {
    case 'hurt': return '傷を負った';
    case 'light': return '灯になった';
    case 'gone': return '消えた';
    case 'copy': return '増えた';
    case 'moved': return '動いた';
    case 'swap': return '入れ替わった';
    case 'merge': return '合体した';
  }
  if (obs.before && obs.after) {
    if (obs.before.kind !== obs.after.kind) return '物に変わった';
    if (obs.before.color !== obs.after.color) return '色が変わった';
    return '形が変わった';
  }
  return '';
}
