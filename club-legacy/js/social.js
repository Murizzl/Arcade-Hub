/* =========================================================
   Arcade Social (fase 5): conquistas da carreira e desafio
   semanal da comunidade. O jogo só relata eventos com ID único;
   quem concede o XP é o hub (ou o servidor, com a nuvem ligada).
   ========================================================= */
import { hashSeed } from './util.js';
import * as C from './career.js';
import { Arcade } from './arcade.js';

const S = () => C.S;
const fx = () => Object.values(S().leagues || {}).flatMap(l => l.fixtures);
const userGames = () => S().userGames || [];
const titles = re => S().coach.titles.filter(t => re.test(t.name));

export const ACHIEVEMENTS = [
  { id: 'first_win', icon: 'party-popper', name: 'Primeira vitória', desc: 'Vença sua primeira partida.', test: s => s.coach.w >= 1 },
  { id: 'wins_10', icon: 'trophy', name: 'Dez vitórias', desc: 'Some 10 vitórias na carreira.', test: s => s.coach.w >= 10 },
  { id: 'wins_50', icon: 'trophy', name: 'Cinquentão', desc: 'Some 50 vitórias na carreira.', test: s => s.coach.w >= 50 },
  { id: 'wins_100', icon: 'crown', name: 'Centenário', desc: 'Some 100 vitórias na carreira.', test: s => s.coach.w >= 100 },
  { id: 'matches_100', icon: 'calendar-check', name: 'Cem jogos', desc: 'Dirija 100 partidas.', test: s => s.coach.matches >= 100 },
  { id: 'big_win', icon: 'flame', name: 'Goleada', desc: 'Vença por 4 gols de diferença ou mais.', test: () => userGames().some(g => g.gf - g.ga >= 4) },
  { id: 'comeback', icon: 'rotate-ccw', name: 'Virada', desc: 'Vença um jogo em que esteve perdendo.', test: () => userGames().some(g => g.comeback) },
  { id: 'giant_killer', icon: 'swords', name: 'Matador de gigantes', desc: 'Vença um adversário muito mais forte.', test: () => userGames().some(g => g.gf > g.ga && g.gap >= 5) },
  { id: 'clean_10', icon: 'shield', name: 'Muralha', desc: 'Termine 10 jogos sem sofrer gols.', test: () => userGames().filter(g => g.ga === 0).length >= 10 },
  { id: 'unbeaten_10', icon: 'zap', name: 'Invicto', desc: 'Fique 10 jogos seguidos sem perder.', test: () => { let run = 0, best = 0; for (const g of userGames()) { run = g.gf >= g.ga || g.pensWin ? run + 1 : 0; best = Math.max(best, run); } return best >= 10; } },
  { id: 'penalties', icon: 'target', name: 'Frieza', desc: 'Vença uma disputa de pênaltis.', test: () => userGames().some(g => g.pensWin) },
  { id: 'promotion', icon: 'arrow-up-circle', name: 'Acesso', desc: 'Suba da Série B para a Série A.', test: s => (s.seasons || []).some(x => x.promoted?.includes(x.user?.club)) },
  { id: 'title', icon: 'trophy', name: 'Campeão', desc: 'Conquiste um campeonato nacional.', test: () => titles(/Liga|Série/).length >= 1 },
  { id: 'title_a', icon: 'medal', name: 'Rei do Brasil', desc: 'Conquiste a Série A.', test: () => titles(/Série A/).length >= 1 },
  { id: 'title_abroad', icon: 'globe-2', name: 'Carreira internacional', desc: 'Seja campeão na Argentina ou em Portugal.', test: () => titles(/Argentina|Portugal/).length >= 1 },
  { id: 'cup', icon: 'award', name: 'Copeiro', desc: 'Conquiste a Copa Nacional.', test: () => titles(/Copa Nacional/).length >= 1 },
  { id: 'continental', icon: 'star', name: 'Glória continental', desc: 'Conquiste a Copa Continental.', test: () => titles(/Continental/).length >= 1 },
  { id: 'double', icon: 'gem', name: 'Dobradinha', desc: 'Liga e copa na mesma temporada.', test: s => { const by = {}; s.coach.titles.forEach(t => { (by[t.year] ||= new Set()).add(/Copa/.test(t.name) ? 'cup' : 'league'); }); return Object.values(by).some(x => x.size === 2); } },
  { id: 'own_club_title', icon: 'sparkles', name: 'Do zero ao topo', desc: 'Seja campeão com o clube que você criou.', test: s => s.coach.titles.some(t => t.club === 'usr') },
  { id: 'youth', icon: 'sprout', name: 'Formador', desc: 'Promova 3 jovens da base.', test: s => (s.promotedYouth || 0) >= 3 },
  { id: 'big_buy', icon: 'hand-coins', name: 'Contratação de peso', desc: 'Contrate um jogador por R$ 20 mi ou mais.', test: s => s.transfers.some(t => t.to === s.coach.clubId && t.fee >= 20) || (s.bigBuy || false) },
  { id: 'big_sale', icon: 'banknote', name: 'Vendedor', desc: 'Venda um jogador por R$ 20 mi ou mais.', test: s => (s.bigSale || false) },
  { id: 'seasons_3', icon: 'calendar', name: 'Projeto de longo prazo', desc: 'Complete 3 temporadas.', test: s => (s.seasons || []).length >= 3 },
  { id: 'seasons_10', icon: 'landmark', name: 'Lenda do banco', desc: 'Complete 10 temporadas.', test: s => (s.seasons || []).length >= 10 },
  { id: 'hopper', icon: 'briefcase', name: 'Rodado', desc: 'Treine 3 clubes diferentes.', test: s => new Set(s.coach.history.map(h => h.club)).size >= 3 }
];

// registra o jogo do usuário para conquistas e desafio semanal
export function afterUserMatch(f, r, side) {
  const s = S();
  const gf = r.score[side], ga = r.score[1 - side];
  const me = C.myClub();
  const opp = s.clubs[side === 0 ? f.away : f.home];
  let comeback = false, diff = 0;
  for (const e of r.events.filter(e => e.type === 'goal')) { diff += e.side === side ? 1 : -1; if (diff < 0) comeback = true; }
  const g = { id: f.id, gf, ga, home: side === 0, comeback: comeback && gf > ga, gap: Math.round(C.clubRating(opp) - C.clubRating(me)), pensWin: !!(f.pens && f.winner === me.id), comp: f.comp || null };
  s.userGames = [...(s.userGames || []), g].slice(-400);
  weeklyProgress(g);
}

export function check() {
  const s = S(); if (!s) return [];
  s.ach ||= {};
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (s.ach[a.id]) continue;
    let ok = false; try { ok = a.test(s); } catch (e) { ok = false; }
    if (!ok) continue;
    s.ach[a.id] = { year: s.year, day: s.day };
    fresh.push(a);
    Arcade.report('achievement_unlocked', `${s.seed}-${a.id}`, 'achievement');
    C.addNews(`Conquista: ${a.name}`, a.desc, a.icon);
  }
  return fresh;
}

/* ---------- desafio semanal da comunidade ----------
   Escolhido pela semana do calendário real: todo mundo recebe o mesmo desafio. */
export const WEEKLY = [
  { id: 'wins3', name: 'Vença 3 partidas', goal: 3, inc: g => g.gf > g.ga || g.pensWin ? 1 : 0 },
  { id: 'goals8', name: 'Marque 8 gols', goal: 8, inc: g => g.gf },
  { id: 'away2', name: 'Vença 2 jogos fora de casa', goal: 2, inc: g => !g.home && g.gf > g.ga ? 1 : 0 },
  { id: 'clean2', name: 'Termine 2 jogos sem sofrer gols', goal: 2, inc: g => g.ga === 0 ? 1 : 0 },
  { id: 'unbeaten4', name: 'Fique 4 jogos sem perder', goal: 4, inc: (g, w) => (g.gf >= g.ga || g.pensWin) ? 1 : -w.progress },
  { id: 'big1', name: 'Vença por 3 gols de diferença', goal: 1, inc: g => g.gf - g.ga >= 3 ? 1 : 0 },
  { id: 'cup1', name: 'Vença um jogo de copa', goal: 1, inc: g => g.comp && (g.gf > g.ga || g.pensWin) ? 1 : 0 }
];
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-S${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}
export function weekly() {
  const s = S(); if (!s) return null;
  const wk = weekId();
  if (!s.weekly || s.weekly.week !== wk) {
    const tpl = WEEKLY[hashSeed('club-legacy-weekly', wk) % WEEKLY.length];
    s.weekly = { week: wk, id: tpl.id, progress: 0, done: false };
  }
  const tpl = WEEKLY.find(w => w.id === s.weekly.id);
  return { ...s.weekly, name: tpl.name, goal: tpl.goal };
}
function weeklyProgress(g) {
  const w = weekly(); if (!w || w.done) return;
  const s = S(), tpl = WEEKLY.find(x => x.id === w.id);
  s.weekly.progress = Math.max(0, s.weekly.progress + tpl.inc(g, s.weekly));
  if (s.weekly.progress >= tpl.goal) {
    s.weekly.done = true;
    Arcade.report('weekly_challenge', `${w.week}`, 'common');
    C.inbox('Arcade Social', `Desafio da semana concluído!`, `"${tpl.name}" — recompensa enviada ao seu perfil do Arcade Social.`, 'report');
  }
}

// pontuação de treinador (ranking): vitórias, títulos e conquistas
export function coachScore(s = S()) {
  const t = s.coach.titles;
  const tw = n => /Continental/.test(n) ? 150 : /Série A|Argentina|Portugal/.test(n) ? 100 : /Copa/.test(n) ? 70 : 50;
  return s.coach.w * 3 + s.coach.d + t.reduce((a, x) => a + tw(x.name), 0) + Object.keys(s.ach || {}).length * 10;
}
