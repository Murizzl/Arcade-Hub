/* =========================================================
   Copas (fase 4): Copa Nacional (mata-mata dos clubes brasileiros)
   e Copa Continental (clubes dos três países). Jogos únicos às
   quartas-feiras; empate vai para os pênaltis. Também guarda o
   histórico de campeões de todas as competições.
   ========================================================= */
import { RNG, hashSeed, clamp, money } from './util.js';
import * as C from './career.js';
import { Arcade } from './arcade.js';

const S = () => C.S;
const ROUND_NAME = { 32: '16 avos de final', 16: 'Oitavas de final', 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final' };
// quartas-feiras que não coincidem: Copa Nacional e Continental se alternam a cada duas semanas
const DAYS = { CN: [17, 45, 73, 101, 129], CC: [31, 59, 87, 115] };

export const cupCfg = id => C.DB.cups.find(c => c.id === id);

export function setupCups(rng) {
  const s = S();
  s.cups = {};
  for (const cfg of C.DB.cups) {
    const teams = cfg.type === 'national' ? nationalField(cfg) : continentalField(cfg);
    rng.shuffle(teams);
    const cup = { id: cfg.id, rounds: [], champion: null, runnerUp: null, teams: teams.slice() };
    cup.rounds.push(makeRound(cup, teams, 0));
    s.cups[cfg.id] = cup;
  }
}

function nationalField(cfg) {
  const all = Object.values(S().clubs).filter(c => c.country === cfg.country);
  const top = all.filter(c => c.division === 'A').map(c => c.id);
  const rest = all.filter(c => c.division !== 'A').sort((a, b) => C.clubRating(b) - C.clubRating(a)).map(c => c.id);
  return [...top, ...rest].slice(0, cfg.teams);
}
function continentalField(cfg) {
  const s = S(), out = [];
  for (const [lg, n] of Object.entries(cfg.qualify)) {
    const prev = s.lastSeason?.tables?.[lg];
    const ids = prev ? prev.map(r => r.id).filter(id => s.clubs[id]?.division === lg || s.clubs[id]) : Object.values(s.clubs).filter(c => c.division === lg).sort((a, b) => C.clubRating(b) - C.clubRating(a)).map(c => c.id);
    out.push(...ids.slice(0, n));
  }
  return out.slice(0, cfg.teams);
}

function makeRound(cup, ids, r) {
  const day = DAYS[cup.id][r];
  const ties = [];
  for (let i = 0; i < ids.length; i += 2) ties.push({ id: `${S().year}${cup.id}${r + 1}-${i / 2}`, comp: cup.id, round: r + 1, roundName: ROUND_NAME[ids.length], day, home: ids[i], away: ids[i + 1], played: false });
  return { name: ROUND_NAME[ids.length], day, ties };
}

export function cupFixtures() { return Object.values(S().cups || {}).flatMap(c => c.rounds.flatMap(r => r.ties)); }
export function cupFixturesOf(clubId) { return cupFixtures().filter(f => f.home === clubId || f.away === clubId); }
export function lastCupDay() { return Math.max(0, ...Object.values(DAYS).flat()); }
export const compName = f => f.friendly ? 'Amistoso multiplayer' : f.comp ? `${cupCfg(f.comp).short} · ${f.roundName}` : `${f.round}ª rodada`;

// disputa de pênaltis determinística a partir dos jogadores que terminaram em campo
export function shootout(f, m) {
  const rng = new RNG(hashSeed(S().seed, f.id, 'pens'));
  const kickers = m.teams.map(T => T.on.filter(x => !x.off && x.role !== 'GK').sort((a, b) => b.a.sho - a.a.sho));
  const gks = m.teams.map(T => T.on.find(x => x.role === 'GK'));
  const goals = [0, 0], log = [[], []];
  const kick = (side, i) => {
    const k = kickers[side][i % kickers[side].length], gk = gks[1 - side];
    const p = clamp(0.74 + (k.a.sho - 65) / 250 - ((gk?.a.div || 60) - 65) / 300 - (k.energy < 50 ? 0.05 : 0), 0.55, 0.9);
    const ok = rng.chance(p); if (ok) goals[side]++; log[side].push(ok);
  };
  for (let i = 0; i < 5; i++) {
    kick(0, i); if (decided(goals, log, 5)) break;
    kick(1, i); if (decided(goals, log, 5)) break;
  }
  let i = 5;
  while (goals[0] === goals[1] && i < 30) { kick(0, i); kick(1, i); i++; }
  return { score: goals, log };
}
function decided(g, log, n) {
  const left = [n - log[0].length, n - log[1].length];
  return g[0] + left[0] < g[1] || g[1] + left[1] < g[0];
}

// fecha rodadas completas, sorteia a próxima e premia o campeão
export function progress() {
  const s = S();
  for (const cup of Object.values(s.cups || {})) {
    if (cup.champion) continue;
    const cur = cup.rounds[cup.rounds.length - 1];
    if (!cur.ties.every(t => t.played)) continue;
    const winners = cur.ties.map(t => t.winner);
    const cfg = cupCfg(cup.id);
    // quem caiu recebe a premiação da fase
    const stage = cup.rounds.length; // 1 = primeira fase
    const totalRounds = Math.log2(cup.teams.length);
    for (const t of cur.ties) {
      const loser = t.winner === t.home ? t.away : t.home;
      const prize = cfg.prize[totalRounds - stage + 1] || 0;
      pay(loser, prize, `${cfg.short}: eliminado na ${cur.name.toLowerCase()}`);
    }
    if (winners.length === 1) {
      cup.champion = winners[0];
      cup.runnerUp = cur.ties[0].winner === cur.ties[0].home ? cur.ties[0].away : cur.ties[0].home;
      pay(cup.champion, cfg.prize[0], `${cfg.short}: campeão`);
      const champ = s.clubs[cup.champion];
      champ.trophies.push({ year: s.year, name: cfg.name });
      honour(cfg.name, cup.champion, cup.runnerUp);
      C.addNews(`${champ.short} conquista a ${cfg.name}!`, `Na final, venceu o ${s.clubs[cup.runnerUp].short}.`, 'trophy');
      if (cup.champion === s.coach.clubId) {
        s.coach.titles.push({ year: s.year, name: cfg.name, club: cup.champion });
        Arcade.report(cfg.type === 'continental' ? 'continental_title' : 'cup_title', `${s.seed}-${s.year}-${cfg.id}`);
        s.coach.rep = clamp(s.coach.rep + (cfg.type === 'continental' ? 12 : 6), 0, 100);
      }
      continue;
    }
    const r = cup.rounds.length;
    if (!DAYS[cup.id][r]) continue;
    const rng = new RNG(hashSeed(s.seed, s.year, cup.id, r));
    rng.shuffle(winners);
    cup.rounds.push(makeRound(cup, winners, r));
    const me = s.coach.clubId;
    if (winners.includes(me)) {
      const t = cup.rounds[r].ties.find(x => x.home === me || x.away === me);
      const opp = s.clubs[t.home === me ? t.away : t.home];
      C.inbox('Competições', `${cfg.short}: sorteio da ${cup.rounds[r].name.toLowerCase()}`, `Adversário: ${opp.name}, ${t.home === me ? 'em casa' : 'fora'}, em ${C.dateLabel(t.day, false)}.`, 'report');
    }
  }
}
function pay(clubId, prize, label) {
  if (!prize) return;
  const c = S().clubs[clubId]; c.balance += prize;
  if (clubId === S().coach.clubId) C.ledger(label, prize);
}
export function honour(comp, winner, runnerUp) {
  const s = S();
  s.honours ||= [];
  s.honours.unshift({ year: s.year, comp, winner, runnerUp });
}

// rótulo do adversário da semana
export function cupStatus(clubId) {
  const out = [];
  for (const cup of Object.values(S().cups || {})) {
    const cfg = cupCfg(cup.id);
    if (!cup.teams.includes(clubId)) continue;
    if (cup.champion === clubId) { out.push(`${cfg.short}: campeão`); continue; }
    const alive = cup.rounds[cup.rounds.length - 1].ties.some(t => (t.home === clubId || t.away === clubId) && (!t.played || t.winner === clubId));
    const lastTie = cupFixturesOf(clubId).filter(t => t.played).pop();
    out.push(`${cfg.short}: ${alive ? cup.rounds[cup.rounds.length - 1].name.toLowerCase() : `eliminado (${(lastTie?.roundName || '').toLowerCase()})`}`);
  }
  return out;
}
