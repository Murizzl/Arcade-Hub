/* Utilidades: gerador pseudoaleatório com semente, formatação e datas. */

// mulberry32 — determinístico, rápido e serializável (o estado é um inteiro)
export class RNG {
  constructor(seed) { this.s = seed >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  // distribuição aproximadamente normal (soma de 3 uniformes)
  gauss(mean = 0, sd = 1) { return mean + sd * ((this.next() + this.next() + this.next()) - 1.5) * 2; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
}

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;

// dinheiro em milhões de reais
export function money(mi, signed = false) {
  const s = signed && mi > 0 ? '+' : '';
  const a = Math.abs(mi);
  if (a >= 1) return `${s}${mi < 0 ? '-' : ''}R$ ${a.toFixed(a >= 100 ? 0 : 1).replace('.', ',')} mi`;
  return `${s}${mi < 0 ? '-' : ''}R$ ${Math.round(a * 1000)} mil`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export function dateOf(startISO, day) {
  const d = new Date(startISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d;
}
export function fmtDate(d, withWeekday = false) {
  return `${withWeekday ? WDAYS[d.getUTCDay()] + ', ' : ''}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const POS_LABEL = { GK: 'GOL', CB: 'ZAG', LB: 'LE', RB: 'LD', DM: 'VOL', CM: 'MC', AM: 'MEI', LW: 'PE', RW: 'PD', ST: 'ATA' };
export const POS_GROUP = { GK: 'GOL', CB: 'DEF', LB: 'DEF', RB: 'DEF', DM: 'MEI', CM: 'MEI', AM: 'MEI', LW: 'ATA', RW: 'ATA', ST: 'ATA' };
export const POS_ORDER = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];
