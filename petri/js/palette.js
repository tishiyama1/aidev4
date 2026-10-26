// シャーレ — strain identity: traditional Japanese pigment colours, one per strain in the library.

export const PALETTE = [
  { name: '茜', rgb: [196, 78, 58] },
  { name: '若竹', rgb: [74, 152, 104] },
  { name: '山吹', rgb: [222, 160, 36] },
  { name: '群青', rgb: [58, 92, 168] },
  { name: '珊瑚', rgb: [226, 120, 118] },
  { name: '浅葱', rgb: [52, 160, 168] },
  { name: '萌黄', rgb: [140, 176, 52] },
  { name: '鶯', rgb: [128, 126, 60] },
];

export const INVADER = { name: '墨', rgb: [48, 32, 60], glow: [196, 96, 226] };

export const strainName = st => (st.owner === 'x' ? INVADER.name : PALETTE[st.pal % PALETTE.length].name);
export const strainRGB = st => (st.owner === 'x' ? INVADER.rgb : PALETTE[st.pal % PALETTE.length].rgb);
export const css = (rgb, a = 1) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
