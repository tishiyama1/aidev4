// シャーレ — line icons (SVG, currentColor). One visual language for traits, environment and UI.

const svg = (body, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const TRAIT_ICON = {
  // a colony budding off two daughters
  grow: svg('<circle cx="10" cy="13" r="5.5"/><circle cx="17.5" cy="8" r="2.6"/><circle cx="18.5" cy="15.5" r="1.8"/>'),
  // a cell with teeth
  prey: svg('<circle cx="12" cy="12" r="5"/><path d="M12 3.2v3M12 17.8v3M3.2 12h3M17.8 12h3M5.8 5.8l2.1 2.1M16.1 16.1l2.1 2.1M18.2 5.8l-2.1 2.1M7.9 16.1l-2.1 2.1"/>'),
  // a droplet with a dark core
  toxic: svg('<path d="M12 3.5c3.6 4.4 5.8 7.6 5.8 10.4a5.8 5.8 0 0 1-11.6 0c0-2.8 2.2-6 5.8-10.4z"/><circle cx="12" cy="14.2" r="1.8" fill="currentColor"/>'),
  // a cell flinging spores
  spore: svg('<circle cx="9" cy="14" r="4.5"/><circle cx="16.5" cy="7" r="1.3" fill="currentColor"/><circle cx="19.5" cy="12" r="1" fill="currentColor"/><circle cx="14.5" cy="3.8" r=".9" fill="currentColor"/>'),
  // two overlapping colonies
  symbio: svg('<circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2"/>'),
  // a crescent: asleep
  dormant: svg('<path d="M15.5 4.5a7.5 7.5 0 1 0 4 12.5 6 6 0 0 1-4-12.5z"/>'),
  // a leaf
  photo: svg('<path d="M5 19c0-8 5-13.5 14-14-0.5 9-6 14-14 14z"/><path d="M5 19l8-8"/>'),
  // a hexagonal shell
  shell: svg('<path d="M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6z"/><path d="M12 7.2l4 2.3v5L12 16.8l-4-2.3v-5z"/>'),
};

export const ENV_ICON = {
  light: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>'),
  nutrient: svg('<circle cx="7" cy="8" r="1.6" fill="currentColor"/><circle cx="14" cy="6" r="1.2" fill="currentColor"/><circle cx="11" cy="13" r="1.8" fill="currentColor"/><circle cx="17.5" cy="12.5" r="1.3" fill="currentColor"/><circle cx="8" cy="17.5" r="1.2" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/>'),
  anti: svg('<path d="M4 18L9 6l3 7 3-9 5 14"/><path d="M8 9.5l2 1M14 7.5l2 1"/>'),
  bubble: svg('<circle cx="12" cy="12" r="7.5"/><path d="M8.5 9a4.5 4.5 0 0 1 3.5-2.6"/>'),
  toxin: svg('<path d="M4 15c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1"/><path d="M4 10c2-2 4-2 6 0s4 2 6 0 3-1.5 4-1"/>'),
  invader: svg('<path d="M12 3c4 3 7 5.5 7 9.5a7 7 0 0 1-14 0C5 8.5 8 6 12 3z"/><path d="M9 12.5c1 1.2 2 1.7 3 1.7s2-.5 3-1.7"/>'),
};

export const UI_ICON = {
  menu: svg('<path d="M5 7h14M5 12h14M5 17h14"/>'),
  notes: svg('<path d="M6 3.5h9.5L19 7v13.5H6z"/><path d="M9 10h7M9 13.5h7M9 17h4"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  sound: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  muted: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  drop: svg('<path d="M12 3.5c3.4 4.2 5.5 7.3 5.5 10a5.5 5.5 0 0 1-11 0c0-2.7 2.1-5.8 5.5-10z" fill="currentColor" stroke="none"/>'),
  fast: svg('<path d="M4 6l7 6-7 6zM12 6l7 6-7 6z" fill="currentColor" stroke="none"/>'),
};
