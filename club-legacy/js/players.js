/* Jogadores: geração procedural, overall por posição, valor de mercado e evolução. */
import { RNG, clamp } from './util.js';

export const ATTRS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'pos', 'sta'];
export const GK_ATTRS = ['div', 'han', 'ref'];
export const ATTR_LABEL = { pac: 'Velocidade', sho: 'Finalização', pas: 'Passe', dri: 'Drible', def: 'Defesa', phy: 'Físico', pos: 'Posicionamento', sta: 'Resistência', div: 'Elasticidade', han: 'Mãos', ref: 'Reflexos' };
export const ATTR_SHORT = { pac: 'VEL', sho: 'FIN', pas: 'PAS', dri: 'DRI', def: 'DEF', phy: 'FIS', pos: 'POS', sta: 'RES', div: 'ELA', han: 'MÃO', ref: 'REF' };

// Pesos do overall por função — o overall muda conforme a posição em que o atleta joga
export const WEIGHTS = {
  GK: { div: .3, han: .25, ref: .3, pos: .15 },
  CB: { def: .4, phy: .25, pos: .2, pac: .1, pas: .05 },
  LB: { def: .3, pac: .25, pas: .15, phy: .15, pos: .1, dri: .05 },
  RB: { def: .3, pac: .25, pas: .15, phy: .15, pos: .1, dri: .05 },
  DM: { def: .3, pas: .25, pos: .2, phy: .15, sta: .1 },
  CM: { pas: .35, dri: .15, pos: .15, def: .15, sta: .1, sho: .1 },
  AM: { pas: .35, dri: .25, sho: .2, pos: .15, pac: .05 },
  LW: { pac: .3, dri: .3, pas: .15, sho: .15, pos: .1 },
  RW: { pac: .3, dri: .3, pas: .15, sho: .15, pos: .1 },
  ST: { sho: .4, pos: .25, pac: .15, phy: .1, dri: .1 }
};
// posições próximas sofrem penalidade menor
const NEAR = { LB: ['RB'], RB: ['LB'], LW: ['RW', 'ST'], RW: ['LW', 'ST'], DM: ['CM', 'CB'], CM: ['DM', 'AM'], AM: ['CM', 'ST'], ST: ['AM', 'LW', 'RW'], CB: ['DM'] };

export function ratingAt(p, role) {
  const w = WEIGHTS[role]; let s = 0;
  for (const k in w) s += (p.a[k] ?? 30) * w[k];
  if (role !== p.pos) {
    if (role === 'GK' || p.pos === 'GK') s *= 0.35;
    else if (!(NEAR[p.pos] || []).includes(role)) s *= 0.88;
    else s *= 0.96;
  }
  return Math.round(s);
}
export const overall = p => ratingAt(p, p.pos);

export function marketValue(p) {
  let v = 0.4 * Math.pow(1.18, p.ovr - 60);
  if (p.age <= 23) v *= 1 + Math.max(0, p.pot - p.ovr) * 0.045;
  if (p.age >= 30) v *= Math.pow(0.82, p.age - 29);
  if (p.contract <= 1) v *= 0.75;
  return Math.max(0.05, Math.round(v * 100) / 100);
}
export const wageFor = p => Math.max(0.008, Math.round(marketValue(p) * 0.011 * 1000) / 1000 + (p.ovr > 75 ? (p.ovr - 75) * 0.006 : 0));

const SQUAD = ['GK', 'GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'LB', 'RB', 'RB', 'DM', 'DM', 'CM', 'CM', 'CM', 'CM', 'AM', 'AM', 'LW', 'LW', 'RW', 'RW', 'ST', 'ST', 'ST'];

let uid = 0;
export function setIdCounter(n) { uid = n; }
export function getIdCounter() { return uid; }

export function makePlayer(rng, names, pos, target, opts = {}) {
  const age = opts.age ?? clamp(Math.round(rng.gauss(26, 4.5)), 17, 35);
  const a = {};
  const w = WEIGHTS[pos];
  for (const k of [...ATTRS, ...GK_ATTRS]) {
    const isGk = GK_ATTRS.includes(k);
    let base;
    if (pos === 'GK') base = isGk || k === 'pos' ? target + rng.gauss(0, 4) : (k === 'phy' || k === 'sta' ? target - 12 + rng.gauss(0, 6) : 25 + rng.gauss(0, 8));
    else if (isGk) base = 10 + rng.int(0, 12);
    else base = w[k] ? target + rng.gauss(0, 5) + (w[k] >= .3 ? 2 : 0) : target - 10 + rng.gauss(0, 8);
    a[k] = clamp(Math.round(base), 10, 96);
  }
  const foreign = rng.chance(opts.foreignChance ?? 0.12) ? rng.pick(names.foreign) : null;
  const useNick = !foreign && rng.chance(0.14);
  const name = useNick ? rng.pick(names.nick) : `${rng.pick(names.first)} ${rng.pick(names.last)}`;
  const home = names.nat || ['Brasil', 'BR'];
  const p = {
    id: 'p' + (++uid).toString(36),
    name, nat: foreign ? foreign[0] : home[0], natCode: foreign ? foreign[1] : home[1],
    age, pos, a, num: 0,
    morale: 70, cond: 100, injury: 0, suspended: 0, yellowAcc: 0,
    contract: rng.int(1, 4), forSale: false, plan: 'auto',
    st: { apps: 0, goals: 0, assists: 0, mins: 0, rating: 0, yc: 0, rc: 0, motm: 0 },
    xp: 0 // treinamento acumulado (vira atributo)
  };
  p.ovr = overall(p);
  const room = Math.max(0, 27 - age);
  p.pot = clamp(Math.round(p.ovr + room * rng.range(0.4, 1.6) + rng.gauss(0, 2)), p.ovr, 94);
  p.value = marketValue(p);
  p.wage = wageFor(p);
  return p;
}

export function makeSquad(rng, names, club) {
  const squad = [];
  SQUAD.forEach((pos, i) => {
    // primeiros de cada posição são titulares (mais fortes), depois reservas e jovens
    const sameBefore = SQUAD.slice(0, i).filter(x => x === pos).length;
    const tier = sameBefore === 0 ? 2 : sameBefore === 1 ? (pos === 'CB' || pos === 'CM' ? 2 : -2) : sameBefore === 2 ? -5 : -7;
    const young = sameBefore >= 2 && rng.chance(0.5);
    const p = makePlayer(rng, names, pos, club.rating + tier + rng.gauss(0, 2.5), young ? { age: rng.int(17, 20) } : {});
    squad.push(p);
  });
  numberSquad(squad);
  return squad;
}

export function numberSquad(squad) {
  const used = new Set(squad.map(p => p.num).filter(Boolean));
  const pref = { GK: [1, 12, 23], CB: [3, 4, 14, 15], LB: [6, 16], RB: [2, 13], DM: [5, 15, 25], CM: [8, 18, 20], AM: [10, 22], LW: [11, 17], RW: [7, 19], ST: [9, 21, 26] };
  for (const p of squad) {
    if (p.num && !squad.some(o => o !== p && o.num === p.num)) continue;
    let n = (pref[p.pos] || []).find(x => !used.has(x));
    if (!n) { n = 27; while (used.has(n)) n++; }
    p.num = n; used.add(n);
  }
}

// treino diário: jovens com potencial evoluem mais; minutos e moral ajudam
export function trainPlayer(p, intensity, rngVal) {
  if (p.injury > 0) return;
  const ageF = p.age <= 21 ? 1.5 : p.age <= 24 ? 1.1 : p.age <= 28 ? 0.6 : p.age <= 31 ? 0.15 : -0.35;
  const room = (p.pot - p.ovr) / 10;
  const minsF = 0.7 + Math.min(1, p.st.mins / 900) * 0.6;
  const moraleF = 0.8 + p.morale / 250;
  const gain = (ageF > 0 ? ageF * Math.max(0.05, room) : ageF * 0.6) * intensity * minsF * moraleF * (0.6 + rngVal * 0.8);
  p.xp += gain * 0.11;
  if (p.xp >= 1 || p.xp <= -1) {
    const step = p.xp >= 1 ? 1 : -1; p.xp -= step;
    const focus = planAttrs(p);
    const k = focus[Math.floor(rngVal * focus.length) % focus.length];
    p.a[k] = clamp(p.a[k] + step, 10, 97);
    p.ovr = overall(p);
    if (p.ovr > p.pot) p.pot = p.ovr;
  }
}

export const PLANS = {
  auto: { label: 'Automático (pela posição)' },
  finishing: { label: 'Finalização', attrs: ['sho', 'pos'] },
  passing: { label: 'Passe e visão', attrs: ['pas', 'dri'] },
  defending: { label: 'Marcação', attrs: ['def', 'pos'] },
  physical: { label: 'Físico e resistência', attrs: ['phy', 'sta', 'pac'] },
  goalkeeping: { label: 'Goleiro', attrs: ['div', 'han', 'ref'] }
};
function planAttrs(p) {
  const plan = PLANS[p.plan];
  if (plan?.attrs) return plan.attrs;
  return Object.entries(WEIGHTS[p.pos]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
}

export function seasonAging(p, rng) {
  p.age++;
  if (p.age >= 31) {
    const drop = rng.int(0, p.age >= 34 ? 4 : 2);
    for (let i = 0; i < drop; i++) { const k = rng.pick(['pac', 'sta', 'phy', 'pac', 'div', 'ref']); p.a[k] = Math.max(10, p.a[k] - 1); }
    p.ovr = overall(p);
  }
  if (p.age >= 30) p.pot = p.ovr;
  p.value = marketValue(p);
}

export function newRngForPlayers(seed) { return new RNG(seed); }
