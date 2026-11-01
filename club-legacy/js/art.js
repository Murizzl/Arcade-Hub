/* Arte procedural: escudos dos clubes e avatar 2D do treinador (SVG). */
import { esc } from './util.js';

export function crest(c, size = 40) {
  const [a, b] = c.colors; const t = c.kitText || '#fff';
  const ab = esc(c.abbr || '?');
  let shape;
  if (c.crest === 'round') shape = `<circle cx="50" cy="50" r="46" fill="${a}" stroke="${b}" stroke-width="6"/><path d="M50 4 A46 46 0 0 1 50 96 Z" fill="${b}" opacity=".35"/>`;
  else if (c.crest === 'diamond') shape = `<path d="M50 3 L95 50 L50 97 L5 50 Z" fill="${a}" stroke="${b}" stroke-width="6" stroke-linejoin="round"/><path d="M50 3 L95 50 L50 50 Z" fill="${b}" opacity=".35"/>`;
  else shape = `<path d="M50 4 L92 16 V48 C92 74 72 90 50 97 C28 90 8 74 8 48 V16 Z" fill="${a}" stroke="${b}" stroke-width="6" stroke-linejoin="round"/><path d="M50 4 L92 16 V48 C92 60 88 70 82 78 L50 4" fill="${b}" opacity=".3"/>`;
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${shape}<text x="50" y="${c.crest === 'diamond' ? 58 : 60}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="${ab.length > 3 ? 20 : 25}" fill="${t}" stroke="rgba(0,0,0,.35)" stroke-width=".8">${ab}</text></svg>`;
}

export const LOOK = {
  skin: ['#f5d0b5', '#e8b48f', '#c98e64', '#a46a43', '#7a4b2c', '#4f3020'],
  hairColor: ['#1c1917', '#4a2c17', '#7c4a24', '#b7833f', '#d6c08a', '#9ca3af', '#e5e7eb', '#b91c1c'],
  hair: [['short', 'Curto'], ['buzz', 'Raspado'], ['side', 'Lateral'], ['curly', 'Cacheado'], ['long', 'Longo'], ['bun', 'Coque'], ['bald', 'Careca']],
  outfit: [['suit', 'Terno'], ['track', 'Agasalho'], ['polo', 'Camisa polo'], ['coat', 'Sobretudo']],
  outfitColor: ['#111827', '#1e3a8a', '#14532d', '#7f1d1d', '#374151', '#a3e635']
};

export function avatar(look = {}, size = 120) {
  const skin = look.skin || LOOK.skin[1], hc = look.hairColor || LOOK.hairColor[0], oc = look.outfitColor || LOOK.outfitColor[0];
  const hair = look.hair || 'short', outfit = look.outfit || 'suit';
  const hairs = {
    short: `<path d="M30 46 C30 24 70 24 70 46 C66 36 34 36 30 46 Z" fill="${hc}"/>`,
    buzz: `<path d="M31 44 C32 27 68 27 69 44 C64 38 36 38 31 44 Z" fill="${hc}" opacity=".7"/>`,
    side: `<path d="M29 48 C27 22 73 20 71 44 C62 34 44 30 36 40 C33 42 31 45 29 48 Z" fill="${hc}"/>`,
    curly: `<g fill="${hc}"><circle cx="34" cy="38" r="8"/><circle cx="44" cy="31" r="9"/><circle cx="56" cy="31" r="9"/><circle cx="66" cy="38" r="8"/><circle cx="30" cy="47" r="6"/><circle cx="70" cy="47" r="6"/></g>`,
    long: `<path d="M28 50 C24 20 76 20 72 50 L74 74 C70 70 68 62 68 52 C62 38 38 38 32 52 C32 62 30 70 26 74 Z" fill="${hc}"/>`,
    bun: `<g fill="${hc}"><circle cx="50" cy="20" r="8"/><path d="M30 46 C30 24 70 24 70 46 C66 36 34 36 30 46 Z"/></g>`,
    bald: ''
  };
  const outfits = {
    suit: `<path d="M18 112 C20 88 34 80 50 80 C66 80 80 88 82 112 Z" fill="${oc}"/><path d="M42 80 L50 100 L58 80 Z" fill="#f8fafc"/><path d="M48 84 L50 100 L52 84 Z" fill="#a3e635"/>`,
    track: `<path d="M18 112 C20 88 34 80 50 80 C66 80 80 88 82 112 Z" fill="${oc}"/><path d="M50 80 V112" stroke="#f8fafc" stroke-width="2"/><path d="M30 92 L26 112 M70 92 L74 112" stroke="#a3e635" stroke-width="3"/>`,
    polo: `<path d="M18 112 C20 88 34 80 50 80 C66 80 80 88 82 112 Z" fill="${oc}"/><path d="M42 80 L50 90 L58 80" fill="none" stroke="#f8fafc" stroke-width="3"/><circle cx="50" cy="96" r="1.6" fill="#f8fafc"/>`,
    coat: `<path d="M16 112 C18 86 34 79 50 79 C66 79 82 86 84 112 Z" fill="${oc}"/><path d="M40 80 L50 112 L60 80" fill="#e5e7eb"/><path d="M44 80 L50 96 L56 80 Z" fill="#111827"/>`
  };
  return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 100 112" aria-hidden="true">
    <circle cx="50" cy="56" r="50" fill="rgba(163,230,53,.08)"/>
    ${hair === 'long' ? hairs.long : ''}
    <rect x="43" y="66" width="14" height="16" rx="5" fill="${skin}"/>
    ${outfits[outfit] || outfits.suit}
    <ellipse cx="50" cy="50" rx="20" ry="23" fill="${skin}"/>
    <circle cx="30" cy="52" r="4" fill="${skin}"/><circle cx="70" cy="52" r="4" fill="${skin}"/>
    ${hair !== 'long' ? hairs[hair] || '' : `<path d="M30 46 C30 24 70 24 70 46 C66 36 34 36 30 46 Z" fill="${hc}"/>`}
    <circle cx="42" cy="51" r="2.3" fill="#1f2937"/><circle cx="58" cy="51" r="2.3" fill="#1f2937"/>
    <path d="M38 45 Q42 43 46 45 M54 45 Q58 43 62 45" stroke="${hc}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M44 62 Q50 66 56 62" stroke="#7c2d12" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}
