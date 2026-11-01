/* Categorias de base (fase 4): elenco sub-20 do clube do usuário,
   captação anual conforme o nível da base, promoção e dispensa. */
import { RNG, clamp } from './util.js';
import { makePlayer, trainPlayer, seasonAging, numberSquad } from './players.js';
import * as C from './career.js';

const S = () => C.S;
const POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST'];
export const youthOf = c => (c.youth || []).map(id => S().players[id]).filter(Boolean);

function prospect(rng, c, age) {
  const lvl = c.youthLevel || 1;
  const p = makePlayer(rng, C.namesFor(c.country), rng.pick(POS), C.clubRating(c) - 20 + rng.int(0, 6) + lvl, { age, foreignChance: 0.03 });
  p.pot = clamp(p.ovr + rng.int(8, 18) + lvl * 3, p.ovr, 93);
  p.club = c.id; p.youth = true; p.contract = 2; p.wage = 0.004; p.num = 0;
  S().players[p.id] = p;
  return p;
}

export function ensureYouth(c, rng = new RNG(Date.now() >>> 0)) {
  if (c.youth?.length) return;
  c.youth = [];
  for (let i = 0; i < 8; i++) c.youth.push(prospect(rng, c, rng.int(15, 18)).id);
}

export function youthDaily(rng) {
  const me = C.myClub(); if (!me) return;
  for (const p of youthOf(me)) trainPlayer(p, 1.25 + (me.youthLevel - 1) * 0.15, rng.next());
}

export function promote(p) {
  const me = C.myClub();
  if (me.squad.length >= 32) return { ok: false, msg: 'Elenco principal cheio (máx. 32).' };
  if (p.age < 16) return { ok: false, msg: 'Só a partir dos 16 anos.' };
  me.youth = me.youth.filter(id => id !== p.id);
  delete p.youth;
  me.squad.push(p.id);
  p.wage = Math.max(0.01, p.wage); p.contract = 3; p.role = 'prospect';
  numberSquad(C.squadOf(me));
  S().promotedYouth = (S().promotedYouth || 0) + 1;
  C.addNews(`${me.short} promove ${p.name} da base`, `${p.name}, ${p.age} anos, sobe ao time principal.`, 'sprout');
  C.save();
  return { ok: true };
}
export function release(p) {
  const me = C.myClub();
  me.youth = me.youth.filter(id => id !== p.id);
  delete S().players[p.id];
  C.save();
  return { ok: true };
}

// fim de temporada: envelhece, dispensa quem passou da idade e recebe a nova geração
export function youthSeasonEnd(rng) {
  const me = C.myClub(); if (!me) return;
  ensureYouth(me, rng);
  const out = [];
  for (const p of youthOf(me)) {
    seasonAging(p, rng);
    if (p.age >= 20) { out.push(p.name); me.youth = me.youth.filter(id => id !== p.id); delete S().players[p.id]; }
  }
  if (out.length) C.inbox('Categorias de base', 'Fim do ciclo na base', `Saíram por idade (20 anos): ${out.join(', ')}. Promova antes os que interessarem.`, 'youth');
  const n = 2 + (me.youthLevel || 1) * 2;
  const fresh = [];
  for (let i = 0; i < n; i++) fresh.push(prospect(rng, me, rng.int(15, 16)));
  me.youth.push(...fresh.map(p => p.id));
  const best = fresh.sort((a, b) => b.pot - a.pot)[0];
  C.inbox('Categorias de base', `Nova geração: ${n} garotos`, `Destaque da peneira: ${best.name} (${best.pos}, ${best.age} anos). Veja na aba Base do elenco.`, 'youth');
}
