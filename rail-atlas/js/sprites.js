/* =========================================================
   Artes originais em SVG: locomotivas vistas de lado (uma
   silhueta por categoria) e retratos de maquinistas.
   ========================================================= */

const wheel = (cx, r, cy = 50) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1f2937" stroke="#94a3b8" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="${r * .3}" fill="#cbd5e1"/>`;
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
};

const SHAPES = {
  vapor: (b, t) => `
    <rect x="18" y="20" width="56" height="20" rx="9" fill="${b}"/>
    <rect x="18" y="27" width="56" height="3" fill="${t}"/>
    <rect x="22" y="10" width="7" height="12" rx="1.5" fill="#27272a"/><rect x="20" y="8" width="11" height="4" rx="1.5" fill="#3f3f46"/>
    <circle cx="44" cy="19" r="4" fill="${t}"/>
    <rect x="70" y="10" width="26" height="32" rx="3" fill="${shade(b, -.25)}"/><rect x="68" y="8" width="30" height="5" rx="2" fill="#27272a"/>
    <rect x="76" y="16" width="14" height="10" rx="2" fill="#bae6fd" opacity=".9"/>
    <path d="M18 40 L8 46 L18 46Z" fill="#52525b"/>
    <rect x="14" y="40" width="86" height="4" fill="#3f3f46"/>
    <rect x="102" y="24" width="34" height="18" rx="3" fill="${shade(b, -.4)}"/><rect x="104" y="20" width="30" height="6" rx="2" fill="#44403c"/>
    ${wheel(26, 6)}${wheel(44, 9, 47)}${wheel(66, 9, 47)}${wheel(88, 6)}${wheel(112, 5)}${wheel(128, 5)}
    <rect x="40" y="45" width="30" height="2.5" rx="1" fill="#cbd5e1"/>`,
  diesel: (b, t) => `
    <path d="M14 20 Q14 14 22 14 H118 Q126 14 130 22 V44 H14Z" fill="${b}"/>
    <rect x="14" y="30" width="116" height="4" fill="${t}"/>
    <rect x="98" y="18" width="22" height="10" rx="2" fill="#bae6fd" opacity=".9"/>
    <rect x="24" y="18" width="60" height="8" rx="2" fill="${shade(b, -.2)}"/>
    ${[30, 40, 50, 60, 70].map(x => `<rect x="${x}" y="19" width="5" height="6" rx="1" fill="${shade(b, -.4)}"/>`).join('')}
    <rect x="10" y="44" width="124" height="4" fill="#3f3f46"/>
    ${wheel(28, 6)}${wheel(44, 6)}${wheel(100, 6)}${wheel(116, 6)}
    <rect x="22" y="47" width="28" height="4" rx="1" fill="#52525b"/><rect x="94" y="47" width="28" height="4" rx="1" fill="#52525b"/>`,
  eletrica: (b, t) => `
    <path d="M60 14 L48 4 H82 L70 14" fill="none" stroke="#475569" stroke-width="2"/><path d="M48 4 H82" stroke="#64748b" stroke-width="2"/>
    <path d="M12 22 Q14 14 24 14 H120 Q130 14 132 22 V44 H12Z" fill="${b}"/>
    <path d="M12 34 H132" stroke="${t}" stroke-width="5"/>
    <rect x="16" y="18" width="16" height="10" rx="3" fill="#bae6fd" opacity=".9"/><rect x="112" y="18" width="16" height="10" rx="3" fill="#bae6fd" opacity=".9"/>
    ${[40, 56, 72, 88].map(x => `<rect x="${x}" y="19" width="12" height="7" rx="1.5" fill="${shade(b, .35)}" opacity=".7"/>`).join('')}
    <rect x="10" y="44" width="124" height="4" fill="#334155"/>
    ${wheel(28, 6)}${wheel(44, 6)}${wheel(100, 6)}${wheel(116, 6)}`,
  pesada: (b, t) => `
    <rect x="10" y="16" width="124" height="28" rx="4" fill="${b}"/>
    <rect x="10" y="16" width="124" height="6" rx="3" fill="${shade(b, -.3)}"/>
    <path d="M10 38 H134" stroke="${t}" stroke-width="3" stroke-dasharray="8 6"/>
    <rect x="112" y="22" width="16" height="10" rx="2" fill="#bae6fd" opacity=".9"/><rect x="16" y="22" width="16" height="10" rx="2" fill="#bae6fd" opacity=".9"/>
    ${[40, 52, 64, 76, 88, 100].map(x => `<rect x="${x}" y="24" width="7" height="9" rx="1" fill="${shade(b, -.35)}"/>`).join('')}
    <rect x="6" y="44" width="132" height="4" fill="#27272a"/>
    ${wheel(22, 5.5)}${wheel(36, 5.5)}${wheel(50, 5.5)}${wheel(94, 5.5)}${wheel(108, 5.5)}${wheel(122, 5.5)}`,
  rapida: (b, t) => `
    <path d="M8 44 Q10 22 40 16 H124 Q134 16 136 26 V44Z" fill="${b}"/>
    <path d="M12 36 Q30 30 136 32" stroke="${t}" stroke-width="4" fill="none"/>
    <path d="M24 26 Q34 19 48 18 V27Z" fill="#bae6fd" opacity=".9"/>
    ${[58, 74, 90, 106].map(x => `<rect x="${x}" y="20" width="12" height="7" rx="2" fill="#e0f2fe" opacity=".75"/>`).join('')}
    <rect x="8" y="44" width="128" height="3" fill="#334155"/>
    ${wheel(34, 5)}${wheel(48, 5)}${wheel(108, 5)}${wheel(122, 5)}`,
  premium: (b, t) => `
    <path d="M6 44 Q8 18 44 14 H126 Q136 14 138 24 V44Z" fill="${b}"/>
    <path d="M10 38 Q40 26 138 28" stroke="${t}" stroke-width="3" fill="none"/><path d="M14 41 Q44 31 138 33" stroke="${shade(t, -.2)}" stroke-width="1.5" fill="none"/>
    <path d="M22 26 Q32 17 50 16 V26Z" fill="#fde68a" opacity=".85"/>
    ${[60, 78, 96, 114].map(x => `<rect x="${x}" y="18" width="14" height="6" rx="2" fill="${t}" opacity=".55"/>`).join('')}
    <rect x="6" y="44" width="132" height="3" fill="#18181b"/>
    ${wheel(30, 5)}${wheel(44, 5)}${wheel(108, 5)}${wheel(122, 5)}`
};

export function locoSVG(category, body, trim, { cls = '' } = {}) {
  const shape = SHAPES[category] || SHAPES.diesel;
  return `<svg class="loco ${cls}" viewBox="0 0 144 58" aria-hidden="true"><rect x="0" y="54" width="144" height="2" fill="#64748b" opacity=".6"/>${shape(body, trim)}</svg>`;
}

// ---------- Maquinistas ----------
export const DRIVER_OPTIONS = {
  skin: ['#f6d3b3', '#e8b48a', '#c98b5e', '#9a6440', '#6b4128'],
  hair: ['curto', 'longo', 'coque', 'careca'],
  hairColor: ['#1f1a17', '#5b3a24', '#a0522d', '#d8b36a', '#9ca3af'],
  hat: ['quepe', 'boné', 'nenhum'],
  uniformColor: ['#1e3a8a', '#7f1d1d', '#14532d', '#374151', '#9a3412', '#6d28d9', '#0f766e'],
  accessory: ['nenhum', 'óculos', 'bigode']
};

export function driverSVG(d, size = 64) {
  if (d.photo) return `<img class="portrait photo" src="${d.photo}" width="${size}" height="${size}" alt="">`;
  const sk = d.skin, hc = d.hairColor, uc = d.uniformColor;
  const hair = {
    curto: `<path d="M18 26 Q18 12 32 12 Q46 12 46 26 Q42 18 32 18 Q22 18 18 26Z" fill="${hc}"/>`,
    longo: `<path d="M16 40 Q14 12 32 12 Q50 12 48 40 L44 40 Q46 20 32 19 Q18 20 20 40Z" fill="${hc}"/>`,
    coque: `<circle cx="32" cy="10" r="6" fill="${hc}"/><path d="M18 26 Q18 13 32 13 Q46 13 46 26 Q42 19 32 19 Q22 19 18 26Z" fill="${hc}"/>`,
    careca: ''
  }[d.hair] || '';
  const hat = {
    quepe: `<path d="M17 20 Q32 8 47 20 Z" fill="${uc}"/><rect x="15" y="19" width="34" height="4" rx="2" fill="#111827"/><circle cx="32" cy="15" r="2" fill="#fbbf24"/>`,
    'boné': `<path d="M18 22 Q18 10 32 10 Q46 10 46 22Z" fill="${uc}"/><path d="M40 21 H54 Q52 25 44 24Z" fill="${uc}"/>`,
    nenhum: ''
  }[d.hat] || '';
  return `<svg class="portrait" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <rect width="64" height="64" rx="14" fill="#1e293b"/>
    <path d="M10 64 Q12 46 32 46 Q52 46 54 64Z" fill="${uc}"/>
    <path d="M27 46 L32 54 L37 46Z" fill="#f8fafc"/><circle cx="24" cy="56" r="1.6" fill="#fbbf24"/><circle cx="40" cy="56" r="1.6" fill="#fbbf24"/>
    <rect x="28" y="38" width="8" height="9" fill="${shade(sk, -.12)}"/>
    <ellipse cx="32" cy="29" rx="13" ry="14" fill="${sk}"/>
    ${hair}
    <circle cx="27" cy="30" r="1.6" fill="#111827"/><circle cx="37" cy="30" r="1.6" fill="#111827"/>
    <path d="M28 36 Q32 39 36 36" stroke="#7c2d12" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    ${d.accessory === 'óculos' ? '<g fill="none" stroke="#111827" stroke-width="1.3"><circle cx="27" cy="30" r="3.5"/><circle cx="37" cy="30" r="3.5"/><path d="M30.5 30 H33.5"/></g>' : ''}
    ${d.accessory === 'bigode' ? `<path d="M26 34.5 Q32 31 38 34.5 Q32 33.5 26 34.5Z" fill="${hc}"/>` : ''}
    ${hat}
  </svg>`;
}

export function randomDriver(name) {
  const r = a => a[Math.floor(Math.random() * a.length)];
  const o = DRIVER_OPTIONS;
  return { name, skin: r(o.skin), hair: r(o.hair), hairColor: r(o.hairColor), hat: r(['quepe', 'boné']), uniformColor: r(o.uniformColor), accessory: r(['nenhum', 'nenhum', 'óculos', 'bigode']), xp: 0, level: 1 };
}
