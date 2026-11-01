/* Arte procedural: escudos dos clubes e avatar 2D do treinador (SVG). */
import { esc } from './util.js';

// Brasões: formato + padrão + emblema. Sem escolha explícita, deriva de forma estável do id do clube.
export const CREST_SHAPES = [['shield', 'Clássico'], ['round', 'Redondo'], ['diamond', 'Losango'], ['heater', 'Gótico'], ['hex', 'Hexagonal'], ['badge', 'Brasão']];
export const CREST_PATTERNS = [['plain', 'Liso'], ['stripes', 'Listras'], ['sash', 'Faixa'], ['halves', 'Metades'], ['chevron', 'Chevron'], ['hoops', 'Aros'], ['quarters', 'Quartos']];
export const CREST_EMBLEMS = [['none', 'Nenhum'], ['star', 'Estrela'], ['ball', 'Bola'], ['crown', 'Coroa'], ['wings', 'Asas'], ['anchor', 'Âncora'], ['bolt', 'Raio']];
const SHAPE_PATH = {
  shield: 'M50 4 L92 16 V48 C92 74 72 90 50 97 C28 90 8 74 8 48 V16 Z',
  round: 'M50 4 A46 46 0 1 1 49.9 4 Z',
  diamond: 'M50 3 L95 50 L50 97 L5 50 Z',
  heater: 'M10 6 H90 V40 C90 70 72 88 50 97 C28 88 10 70 10 40 Z',
  hex: 'M50 3 L91 26 V74 L50 97 L9 74 V26 Z',
  badge: 'M50 3 L62 12 L80 10 L86 28 L96 40 L90 58 L92 76 L74 84 L60 96 L50 90 L40 96 L26 84 L8 76 L10 58 L4 40 L14 28 L20 10 L38 12 Z'
};
const hashId = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
function patternSvg(pat, a, b, id) {
  switch (pat) {
    case 'stripes': return [0, 1, 2, 3, 4, 5, 6].filter(i => i % 2).map(i => `<rect x="${i * 14.3}" y="0" width="14.3" height="100" fill="${b}"/>`).join('');
    case 'sash': return `<path d="M-10 20 L20 -10 L110 80 L80 110 Z" fill="${b}"/>`;
    case 'halves': return `<rect x="50" y="0" width="50" height="100" fill="${b}"/>`;
    case 'chevron': return `<path d="M0 30 L50 62 L100 30 V52 L50 84 L0 52 Z" fill="${b}"/>`;
    case 'hoops': return [1, 3, 5].map(i => `<rect x="0" y="${i * 14.3}" width="100" height="14.3" fill="${b}"/>`).join('');
    case 'quarters': return `<rect x="50" y="0" width="50" height="50" fill="${b}"/><rect x="0" y="50" width="50" height="50" fill="${b}"/>`;
    default: return '';
  }
}
function emblemSvg(em, color) {
  const g = (d) => `<path d="${d}" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`;
  switch (em) {
    case 'star': return g('M50 12 L54 23 L66 23 L56 30 L60 41 L50 34 L40 41 L44 30 L34 23 L46 23 Z');
    case 'ball': return `<circle cx="50" cy="27" r="11" fill="#fff" stroke="#111" stroke-width="1.5"/><path d="M50 21 L55 25 L53 31 L47 31 L45 25 Z" fill="#111"/>`;
    case 'crown': return g('M36 34 L36 20 L43 27 L50 16 L57 27 L64 20 L64 34 Z');
    case 'wings': return g('M50 30 C42 18 30 18 24 22 C32 24 36 28 38 32 Z') + g('M50 30 C58 18 70 18 76 22 C68 24 64 28 62 32 Z');
    case 'anchor': return `<g fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"><path d="M50 15 V40"/><path d="M42 21 H58"/><path d="M38 33 C40 40 46 42 50 42 C54 42 60 40 62 33"/></g>`;
    case 'bolt': return g('M54 12 L40 32 L49 32 L45 44 L60 24 L51 24 Z');
    default: return '';
  }
}
export function crest(c, size = 40) {
  const [a, b] = c.colors; const t = c.kitText || '#fff';
  const ab = esc(c.abbr || '?');
  const h = hashId(c.id || c.abbr || c.name);
  const shape = SHAPE_PATH[c.crest] ? c.crest : 'shield';
  const pat = c.pattern || CREST_PATTERNS[h % CREST_PATTERNS.length][0];
  const em = c.emblem || CREST_EMBLEMS[(h >> 3) % CREST_EMBLEMS.length][0];
  const uid = `cr${h.toString(36)}${shape}${pat}`;
  const hasEm = em !== 'none';
  return `<svg class="crest" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><clipPath id="${uid}"><path d="${SHAPE_PATH[shape]}"/></clipPath></defs>
    <g clip-path="url(#${uid})"><rect width="100" height="100" fill="${a}"/>${patternSvg(pat, a, b, uid)}</g>
    <path d="${SHAPE_PATH[shape]}" fill="none" stroke="${b}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${SHAPE_PATH[shape]}" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5" transform="translate(50 50) scale(.86) translate(-50 -50)"/>
    ${hasEm ? emblemSvg(em, b === a ? t : (pat === 'plain' ? b : t)) : ''}
    <rect x="22" y="${hasEm ? 46 : 38}" width="56" height="24" rx="6" fill="rgba(0,0,0,.28)"/>
    <text x="50" y="${hasEm ? 64 : 56}" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="${ab.length > 3 ? 17 : 21}" fill="#fff">${ab}</text>
  </svg>`;
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
