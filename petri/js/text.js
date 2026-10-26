// シャーレ — words: traits, environment, day names, and the illustrated rules.
import { TARGET, DAYS, DROPS, GENS } from './sim.js';
import { TRAIT_ICON, ENV_ICON } from './icons.js';

export const TRAIT = {
  grow: { name: '増殖', desc: '隣の空きマスへ広がりやすい。' },
  prey: { name: '捕食', desc: '隣の別の菌を食べて自分に変える。自分の別の株も食べる。' },
  toxic: { name: '毒', desc: '死ぬと周りを毒で汚す。毒の上では休眠以外が死にやすく、何も広がれない。' },
  spore: { name: '胞子', desc: 'ときどき2〜3マス先へ飛んで広がる。' },
  symbio: { name: '共生', desc: '自分の別の株と隣り合うと、増えやすく死ににくくなる。' },
  dormant: { name: '休眠', desc: '毒と抗生物質が効かない。ただし広がるのが遅い。' },
  photo: { name: '光合成', desc: '明るい場所でよく広がり、暗い場所ではほとんど広がらない。' },
  shell: { name: '殻', desc: '捕食されにくい。' },
};

export const ENV = {
  light: { name: '光', desc: '皿の片側が明るく、反対側は暗い。光合成の菌は明るい側でよく育つ。' },
  nutrient: { name: '栄養', desc: '茶色の粒の場所。広がりやすく、死ににくい。' },
  anti: { name: '抗生物質', desc: '青白い結晶の筋。休眠以外の菌はここで死にやすい。' },
  bubble: { name: '気泡', desc: 'ガラス玉のような泡。何も置けず、広がれない。' },
  toxin: { name: '毒', desc: '紫のもや。毒の菌が死ぬと残り、しばらく消えない。' },
};

export const DAY_NAME = ['第一日', '第二日', '第三日', '第四日', '第五日', '第六日', '第七日'];
export const pct = x => `${Math.round(x * 100)}%`;
export const traitNames = st => st.traits.map(t => TRAIT[t].name).join('・');

export const traitLine = t => `<div class="trait-line">${TRAIT_ICON[t]}<span><b>${TRAIT[t].name}</b>${TRAIT[t].desc}</span></div>`;
export const envLine = k => `<div class="trait-line">${ENV_ICON[k]}<span><b>${ENV[k].name}</b>${ENV[k].desc}</span></div>`;

export function rulesHTML() {
  const fig = (icon, html) => `<div class="fig">${icon}<div>${html}</div></div>`;
  return `
<h2>遊び方</h2>
<h3>目的</h3>
<p>${DAYS}日間、自分の菌で皿を守り抜く。毎日、皿の決まった割合以上を自分の菌で占めればその日はクリアで、<b>あなたの菌が侵入株を食い尽くす</b>。届かなければ<b>皿は侵入株に呑まれ</b>、培養はそこで終わる。</p>
<div class="bar-demo"><i style="width:28%;background:#c44e3a"></i><i style="width:16%;background:#3a5ca8"></i><em style="left:${Math.round(TARGET[0] * 100)}%"></em><i style="margin-left:auto;width:22%;background:#30203c"></i></div>
<p class="muted-note">画面下のバー：色の帯が自分の菌、右の暗い帯が侵入株、白い線が目標。線を超えると金色になる。</p>
<h3>一日の流れ</h3>
<ol class="steps">
  <li>手札（下の3枚）から菌を選ぶ。カードには名前と<b>特徴</b>が書いてある。</li>
  <li><b>皿を押すと落ちる場所が光り、離すと一滴落ちる。</b>菌はその場所と周りの空きマスに置かれる。</li>
  <li>その後${GENS}世代、菌は勝手に増え、食べ合い、死ぬ。見守るしかない（押すと早送り）。</li>
  <li>これを${DROPS}回くり返したら判定。</li>
</ol>
<h3>侵入株「墨」</h3>
${fig(ENV_ICON.invader, '紫に光る縁から、滴下のたびに入り込んでくる。侵入株にも特徴があり、日が進むほど強くなる。<b>最終日の侵入株は、あなたの菌がよく持つ特徴に対抗してくる。</b>')}
<h3>菌の特徴</h3>
${Object.keys(TRAIT).map(traitLine).join('')}
<h3>皿の環境（毎日変わる）</h3>
${['light', 'nutrient', 'anti', 'bubble', 'toxin'].map(envLine).join('')}
<h3>日と日の間</h3>
<p>3つから1つ選ぶ。<b>新しい株</b>を手札の候補に加えるか、今の株に<b>特徴を接ぎ木</b>する。</p>
<h3>記録</h3>
<p>進行は滴下のたびに自動で保存され、タイトルの「つづきから」で再開できる。培養が終わると、最後の皿が<b>標本棚</b>に残る。</p>`;
}
