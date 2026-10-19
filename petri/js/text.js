// シャーレ — names and one-line effects for traits, plus the rules sheet.
import { TARGET, DAYS, DROPS, GENS } from './sim.js';

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

export const traitNames = st => st.traits.map(t => TRAIT[t].name).join('・');

export const pct = x => `${Math.round(x * 100)}%`;

export function rulesHTML(swatch) {
  const traits = Object.entries(TRAIT)
    .map(([k, v]) => `<li><span class="sw">${swatch(k)}</span><b>${v.name}</b>：${v.desc}</li>`).join('');
  return `
<h2>シャーレの遊び方</h2>
<section><h3>目的</h3>
<p>${DAYS}日間、自分の菌で皿を守り抜く。1日に${DROPS}回菌を落とし、その日の終わりに<b>皿の目標％以上が自分の菌</b>ならクリア（1日目は${pct(TARGET[0])}）。届かなければそこで終わり。</p>
<p>皿の外側のリングが現在の割合：<b>クリーム色＝自分</b>、<b>紫＝侵入株</b>、<b>白い目盛り＝目標</b>（超えると金色になる）。</p></section>
<section><h3>1回の手番</h3>
<p>下の3枚から菌を1つ選び、皿に落とす（押すと落ちる位置が出て、離すと落ちる）。菌は落とした場所とその周りの空きマスに置かれ、その後${GENS}世代ぶん勝手に増えたり死んだりする。途中で皿を押すと早送り。</p></section>
<section><h3>侵入株</h3>
<p>紫の印のある縁から、毎回の手番で紫の菌が入り込む。侵入株にも特徴があり、日が進むほど強くなる。最終日の侵入株は、あなたの菌の特徴に対抗してくる。</p></section>
<section><h3>菌の特徴</h3>
<p>どの菌も少しずつ広がり、たまに死ぬ。特徴は模様で表され、カードにも名前が書いてある。</p>
<ul class="traits">${traits}</ul></section>
<section><h3>皿の環境（毎日変わる）</h3>
<ul><li><b>明るい場所</b>（黄色く光る側）と<b>暗い場所</b>（影）：光合成に影響</li>
<li><b>栄養</b>（茶色の粒）：広がりやすく、死ににくい</li>
<li><b>抗生物質</b>（青い結晶の線）：休眠以外の菌が死にやすい</li>
<li><b>気泡</b>：何も置けない・広がれない</li>
<li><b>紫のもや</b>：毒。しばらく残る</li></ul></section>
<section><h3>日と日の間</h3>
<p>3つから1つ選ぶ：<b>新しい株</b>を手に入れるか、今の株に<b>特徴を接ぎ木</b>する。</p></section>
<button class="close">閉じる</button>`;
}
