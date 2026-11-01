/* =========================================================
   Carreira: criação, calendário, rodadas, finanças, diretoria,
   fim de temporada (acesso e rebaixamento) e salvamento.
   Todo o estado mora em `S` (serializável) e é salvo em pontos seguros.
   ========================================================= */
import { RNG, hashSeed, clamp, dateOf, fmtDate, money } from './util.js';
import { makeSquad, makePlayer, numberSquad, ratingAt, marketValue, wageFor, trainPlayer, seasonAging, setIdCounter, getIdCounter, FOCUS } from './players.js';
import { Match } from './engine.js';
import { Arcade } from './arcade.js';
import * as M from './management.js';
import * as Cups from './cups.js';
import * as Y from './youth.js';
import * as Social from './social.js';
import { Cloud } from './cloud.js';

const SAVE_KEY = 'clublegacy.save.v1';
export let DB = null;   // dados configuráveis (JSON)
export let S = null;    // estado da carreira

export async function loadData() {
  const [league, formations] = await Promise.all([
    fetch(`data/league-br.json?v=${globalThis.APP_VERSION || ''}`).then(r => r.json()),
    fetch(`data/formations.json?v=${globalThis.APP_VERSION || ''}`).then(r => r.json())
  ]);
  delete formations._doc;
  DB = { ...league, formations };
  return DB;
}

/* ---------- salvamento ---------- */
export function save() {
  if (!S) return;
  S.idc = getIdCounter();
  S.savedAt = Date.now();
  Social.check();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { console.warn('Falha ao salvar', e); }
  const summary = Arcade.publish(S, publicExtra());
  Cloud.schedule(S, summary);
}
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    S = JSON.parse(raw);
    setIdCounter(S.idc || 0);
    M.migrate(S);
    if (myClub()) Y.ensureYouth(myClub());
    return S;
  } catch (e) { return null; }
}
// dados públicos da carreira (perfil, ranking e comparação no Arcade Social)
function publicExtra() {
  const me = myClub();
  return {
    score: Social.coachScore(S), club: me ? me.short : null, league: me ? leagueShort(me.division) : null,
    trophies: S.coach.titles.map(t => [t.name, t.year]).slice(-20), achievements: Object.keys(S.ach || {}).length, achievementsTotal: Social.ACHIEVEMENTS.length,
    record: [S.coach.w, S.coach.d, S.coach.l], seasons: S.season, rep: Math.round(S.coach.rep)
  };
}
// substitui o save local por uma carreira vinda da nuvem
export function adopt(state) {
  S = state; setIdCounter(S.idc || 0); M.migrate(S);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* */ }
}

export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
export function deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } S = null; }

/* ---------- acesso ---------- */
export const club = id => S.clubs[id];
export const P = id => S.players[id];
export const myClub = () => S.coach.clubId ? S.clubs[S.coach.clubId] : null;
export const leagueOf = clubId => S.clubs[clubId].division;
export const currentDate = () => dateOf(S.startISO, S.day);
export const dateLabel = (d = S.day, wd = true) => fmtDate(dateOf(S.startISO, d), wd);
export const squadOf = c => c.squad.map(id => S.players[id]).filter(Boolean);

export const AI_TACTICS = {
  balanced:   { style: 'balanced',   mentality: 0,  press: 'normal', line: 'normal' },
  possession: { style: 'possession', mentality: 0,  press: 'normal', line: 'normal' },
  highpress:  { style: 'balanced',   mentality: 0,  press: 'high',   line: 'high' },
  counter:    { style: 'counter',    mentality: -1, press: 'normal', line: 'normal' },
  defensive:  { style: 'counter',    mentality: -1, press: 'low',    line: 'low' },
  direct:     { style: 'direct',     mentality: 0,  press: 'normal', line: 'normal' },
  wings:      { style: 'wings',      mentality: 0,  press: 'normal', line: 'normal' }
};
export const STYLE_LABEL = { balanced: 'Equilibrado', possession: 'Posse de bola', highpress: 'Pressão alta', counter: 'Contra-ataque', defensive: 'Defensivo', direct: 'Jogo direto', wings: 'Pelas laterais' };

/* ---------- nova carreira ---------- */
export function newCareer({ coach, clubId, customClub }) {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const rng = new RNG(seed);
  setIdCounter(0);
  const clubs = {}, players = {};
  let defs = DB.clubs.map(c => ({ ...c }));
  if (customClub) {
    // o clube criado entra no lugar de um clube da divisão escolhida
    const repl = customClub.replaces || defs.filter(c => c.division === customClub.division).sort((a, b) => a.rating - b.rating)[0].id;
    const base = defs.find(c => c.id === repl);
    const strength = customClub.division === 'A' ? { rating: 66, budget: 16, wageBudget: 2.1, prestige: 2, capacity: 25000 } : { rating: 59, budget: 6, wageBudget: 0.9, prestige: 1, capacity: 15000 };
    const cc = { ...base, ...strength, ...customClub, id: 'usr', custom: true, titles: 0, founded: 2027, away: [customClub.colors[1], customClub.colors[0]], formation: '4-3-3', style: 'balanced' };
    defs = defs.map(c => c.id === repl ? cc : c);
    clubId = 'usr';
  }
  for (const d of defs) {
    const squad = makeSquad(rng, namesFor(d.country), d);
    squad.forEach(p => { players[p.id] = p; p.club = d.id; });
    clubs[d.id] = {
      ...d, squad: squad.map(p => p.id), balance: d.budget, wageBudget: d.wageBudget,
      tactics: { formation: d.formation, ...AI_TACTICS[d.style] || AI_TACTICS.balanced, lineup: [], bench: [] },
      history: [], trophies: []
    };
  }
  // agentes livres
  const free = [];
  for (let i = 0; i < 40; i++) {
    const pos = rng.pick(['GK', 'CB', 'CB', 'LB', 'RB', 'DM', 'CM', 'CM', 'AM', 'LW', 'RW', 'ST', 'ST']);
    const p = makePlayer(rng, DB.names, pos, rng.int(52, 66));
    p.club = null; p.contract = 0; players[p.id] = p; free.push(p.id);
  }
  S = {
    v: 1, seed, startISO: DB.country.seasonStart, year: 2027, season: 1, day: 0,
    coach: { ...coach, clubId, rep: 30, level: 1, matches: 0, w: 0, d: 0, l: 0, titles: [], history: [{ club: clubId, from: 2027, to: null, w: 0, d: 0, l: 0 }], achievements: {} },
    clubs, players, free,
    leagues: {}, news: [], inbox: [], board: null, ledger: [], seasons: [],
    seasonWins: 0, matchesPlayed: 0, offers: [], idc: 0, pendingSale: [],
    firedFrom: null
  };
  M.migrate(S);
  setupSeason(rng);
  const me = myClub();
  autoLineup(me);
  Y.ensureYouth(me, rng);
  addNews(`${coach.first} ${coach.last} é o novo treinador do ${me.name}`, `A diretoria apresentou o novo comandante para a temporada ${S.year} da ${leagueName(me.division)}.`, 'user-plus');
  inbox('Diretoria', `Bem-vindo ao ${me.short}`, `Nossa meta para ${S.year}: ${S.board.objective.text}. Orçamento de transferências: ${money(me.balance)}. Folha salarial máxima: ${money(me.wageBudget)}/mês.`, 'board');
  save();
  return S;
}

export const leagueName = id => DB.leagues.find(l => l.id === id).name;
export const leagueShort = id => DB.leagues.find(l => l.id === id)?.short || id;
// nomes gerados conforme o país do clube
export const namesFor = country => (country && DB.namesBy?.[country]) ? DB.namesBy[country] : DB.names;
export const leagueCfg = id => DB.leagues.find(l => l.id === id);

/* ---------- temporada ---------- */
function setupSeason(rng = new RNG(hashSeed(S.seed, S.year))) {
  for (const L of DB.leagues) {
    const ids = Object.values(S.clubs).filter(c => c.division === L.id).map(c => c.id);
    rng.shuffle(ids);
    S.leagues[L.id] = { id: L.id, fixtures: roundRobin(ids, L.id) };
  }
  for (const c of Object.values(S.clubs)) for (const p of squadOf(c)) { p.st = { apps: 0, goals: 0, assists: 0, mins: 0, rating: 0, yc: 0, rc: 0, motm: 0 }; p.cst = { apps: 0, goals: 0, assists: 0 }; p.ovrStart = p.ovr; p.gains = {}; }
  Cups.setupCups(rng);
  setBoard();
}

function roundRobin(ids, lg) {
  const n = ids.length, half = n / 2, arr = ids.slice();
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      games.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(games);
    arr.splice(1, 0, arr.pop());
  }
  const fx = [];
  const step = DB.country.daysBetweenRounds;
  rounds.forEach((g, r) => g.forEach(([h, a], i) => fx.push({ id: `${S.year}${lg}${r + 1}-${i}`, round: r + 1, day: r * step, home: h, away: a, played: false })));
  rounds.forEach((g, r) => g.forEach(([h, a], i) => fx.push({ id: `${S.year}${lg}${r + n}-${i}`, round: r + n, day: (r + n - 1) * step, home: a, away: h, played: false })));
  return fx;
}

export function table(lg) {
  const rows = {};
  for (const c of Object.values(S.clubs)) if (c.division === lg) rows[c.id] = { id: c.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  for (const f of S.leagues[lg].fixtures) {
    if (!f.played) continue;
    const h = rows[f.home], a = rows[f.away]; if (!h || !a) continue;
    const [x, y] = f.score;
    h.p++; a.p++; h.gf += x; h.ga += y; a.gf += y; a.ga += x;
    if (x > y) { h.w++; a.l++; h.pts += 3; h.form.push('V'); a.form.push('D'); }
    else if (x < y) { a.w++; h.l++; a.pts += 3; h.form.push('D'); a.form.push('V'); }
    else { h.d++; a.d++; h.pts++; a.pts++; h.form.push('E'); a.form.push('E'); }
  }
  return Object.values(rows).map(r => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) }))
    .sort((a, b) => b.pts - a.pts || b.w - a.w || b.gd - a.gd || b.gf - a.gf || S.clubs[a.id].name.localeCompare(S.clubs[b.id].name));
}
export const position = (clubId) => table(leagueOf(clubId)).findIndex(r => r.id === clubId) + 1;

export function fixturesOf(clubId) { return S.leagues[leagueOf(clubId)].fixtures.filter(f => f.home === clubId || f.away === clubId).sort((a, b) => a.day - b.day); }
// liga + copas, em ordem de data
export function allFixturesOf(clubId) { return [...fixturesOf(clubId), ...Cups.cupFixturesOf(clubId)].sort((a, b) => a.day - b.day); }
export function nextFixture(clubId = S.coach.clubId) { return clubId ? allFixturesOf(clubId).find(f => !f.played) : null; }
export function todayFixture() { const f = nextFixture(); return f && f.day === S.day ? f : null; }
export function lastRoundDay() { return Math.max(Cups.lastCupDay(), ...Object.values(S.leagues).flatMap(l => l.fixtures.map(f => f.day))); }

/* ---------- diretoria ---------- */
function clubRating(c) {
  const sq = squadOf(c).sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  return sq.reduce((s, p) => s + p.ovr, 0) / (sq.length || 1);
}
export { clubRating };
function setBoard() {
  const me = myClub(); if (!me) { S.board = null; return; }
  const lg = me.division;
  const ranked = Object.values(S.clubs).filter(c => c.division === lg).sort((a, b) => clubRating(b) - clubRating(a));
  const exp = ranked.findIndex(c => c.id === me.id) + 1;
  let objective;
  const L = leagueCfg(lg), n = ranked.length;
  if (L.relegate) objective = exp <= 2 ? { kind: 'title', pos: 1, text: `Conquistar o título da ${L.short}` } : exp <= 6 ? { kind: 'top', pos: 4, text: 'Terminar entre os quatro primeiros' } : exp <= 12 ? { kind: 'top', pos: 10, text: 'Terminar na primeira metade da tabela' } : { kind: 'top', pos: n - L.relegate, text: 'Evitar o rebaixamento' };
  else if (!L.promote) objective = exp <= 2 ? { kind: 'title', pos: 1, text: `Conquistar o título da ${L.short}` } : exp <= 5 ? { kind: 'top', pos: 4, text: 'Terminar entre os quatro primeiros' } : exp <= 10 ? { kind: 'top', pos: Math.round(n / 2), text: 'Terminar na primeira metade da tabela' } : { kind: 'top', pos: n - 3, text: 'Fugir das últimas posições' };
  else objective = exp <= 6 ? { kind: 'top', pos: 4, text: 'Conquistar o acesso à Série A' } : exp <= 12 ? { kind: 'top', pos: 8, text: 'Brigar pelo acesso (top 8)' } : { kind: 'top', pos: 16, text: 'Fazer uma campanha segura na Série B' };
  S.board = { confidence: S.board?.confidence ?? 60, objective, expected: exp, youth: true };
}

/* ---------- avançar o tempo ---------- */
export function canAdvanceDay() {
  if (!S.coach.clubId) return { ok: true };
  const f = todayFixture();
  if (f) return { ok: false, msg: 'Há uma partida hoje. Jogue ou simule antes de avançar.' };
  return { ok: true };
}

export function advanceDay() {
  const chk = canAdvanceDay(); if (!chk.ok) return chk;
  // rodadas de outros dias sem jogo do usuário (ex.: desempregado) são simuladas aqui
  playAIFixturesOn(S.day);
  S.day++;
  const rng = new RNG(hashSeed(S.seed, S.year, S.day));
  dailyUpdate(rng);
  if (S.day > lastRoundDay()) { endSeason(); }
  save();
  return { ok: true };
}

export async function advanceToNextMatch(onProgress) {
  let guard = 0;
  while (guard++ < 400) {
    if (todayFixture()) return { ok: true };
    const before = S.year;
    const r = advanceDay();
    if (!r.ok) return r;
    if (S.year !== before) return { ok: true, seasonEnded: true };
    if (onProgress && guard % 3 === 0) { onProgress(); await new Promise(r => setTimeout(r)); }
    if (!S.coach.clubId && S.inbox.some(m => m.offer && !m.done)) return { ok: true };
  }
  return { ok: true };
}

function dailyUpdate(rng) {
  const me = myClub();
  const d = currentDate();
  for (const c of Object.values(S.clubs)) {
    const intensity = c.id === S.coach.clubId ? (S.training?.intensity ?? 1) : 0.9;
    for (const p of squadOf(c)) {
      p.cond = Math.min(100, p.cond + (p.injury ? 3 : 7 * (S.training?.intensity === 1.3 && c.id === S.coach.clubId ? 0.8 : 1)));
      if (p.injury > 0) { p.injury--; if (!p.injury && c.id === S.coach.clubId) inbox('Departamento médico', `${p.name} está recuperado`, `${p.name} voltou a treinar normalmente e está disponível.`, 'medical'); }
      const mine = c.id === S.coach.clubId;
      trainPlayer(p, intensity * (mine && S.coach.style === 'youth' && p.age <= 21 ? 1.15 : 1), rng.next(), mine ? FOCUS[S.training?.focus || 'balanced']?.attrs : null);
      const base = mine && S.coach.style === 'motivator' ? 76 : 70;
      p.morale = clamp(p.morale + (base - p.morale) * (mine && S.coach.style === 'motivator' ? 0.035 : 0.02), 20, 100);
    }
  }
  // virada de mês: salários, patrocínio e custos
  if (d.getUTCDate() === 1) monthly();
  // propostas por jogadores à venda do usuário
  if (me && M.windowState().open) incomingOffers(rng, me);
  M.daily(rng);
  Y.youthDaily(rng);
  // clubes da IA completam elencos com agentes livres
  if (S.day % 10 === 0) aiMarket(rng);
}

function monthly() {
  for (const c of Object.values(S.clubs)) {
    const wages = M.wageCost(c);
    const lg = leagueCfg(c.division);
    const sponsor = lg.sponsorMonthly * (0.6 + c.prestige * 0.35);
    const ops = 0.05 + c.prestige * 0.04;
    c.balance = Math.round((c.balance - wages + sponsor - ops) * 1000) / 1000;
    if (c.id === S.coach.clubId) {
      ledger('Salários do elenco', -wages); ledger('Patrocínio master', sponsor); ledger('Despesas operacionais', -ops);
      if (c.balance < 0) { S.board.confidence = clamp(S.board.confidence - 4, 0, 100); inbox('Diretoria', 'Caixa no vermelho', `O clube está com saldo negativo (${money(c.balance)}). Equilibre as finanças: venda atletas ou reduza a folha.`, 'board'); }
    }
  }
}

export function ledger(label, amount) {
  S.ledger.push({ day: S.day, year: S.year, label, amount: Math.round(amount * 1000) / 1000 });
  if (S.ledger.length > 300) S.ledger.shift();
}

/* ---------- partidas ---------- */
export function sideFor(c, isUser, tactics) {
  const t = tactics || c.tactics;
  const slots = DB.formations[t.formation];
  const avail = squadOf(c).filter(p => !p.injury && !p.suspended);
  let lineup = [];
  if (isUser && t.lineup?.length === 11) lineup = t.lineup.map(id => avail.find(p => p.id === id) || null);
  const used = new Set(lineup.filter(Boolean).map(p => p.id));
  slots.forEach((s, i) => {
    if (lineup[i]) return;
    const best = avail.filter(p => !used.has(p.id)).sort((a, b) => (ratingAt(b, s.r) * (0.75 + b.cond / 400)) - (ratingAt(a, s.r) * (0.75 + a.cond / 400)))[0];
    lineup[i] = best || null; if (best) used.add(best.id);
  });
  lineup = lineup.filter(Boolean);
  let bench = [];
  if (isUser && t.bench?.length) bench = t.bench.map(id => avail.find(p => p.id === id && !used.has(id))).filter(Boolean);
  if (bench.length < 9) {
    const rest = avail.filter(p => !used.has(p.id) && !bench.includes(p)).sort((a, b) => b.ovr - a.ovr);
    // garante um goleiro reserva
    const gk = rest.find(p => p.pos === 'GK');
    if (gk && !bench.some(p => p.pos === 'GK')) bench.push(gk);
    for (const p of rest) { if (bench.length >= 9) break; if (!bench.includes(p)) bench.push(p); }
  }
  const avgMorale = squadOf(c).reduce((s, p) => s + p.morale, 0) / Math.max(1, c.squad.length) / 100;
  return { club: c, lineup, bench: bench.slice(0, 9), tactics: { formation: t.formation, mentality: t.mentality, style: t.style, press: t.press, line: t.line, instr: isUser ? (t.instr || {}) : {} }, ai: !isUser, morale: 0.7 + avgMorale * 0.5 };
}

export function autoLineup(c) {
  const side = sideFor(c, false, c.tactics);
  c.tactics.lineup = side.lineup.map(p => p.id);
  c.tactics.bench = side.bench.map(p => p.id);
}

export function createMatch(f, { record = false, assistant = true } = {}) {
  const H = S.clubs[f.home], A = S.clubs[f.away];
  const uid = S.coach.clubId;
  const home = sideFor(H, H.id === uid), away = sideFor(A, A.id === uid);
  const m = new Match({ home, away, seed: hashSeed(S.seed, f.id), formations: DB.formations, record, userSide: H.id === uid ? 0 : A.id === uid ? 1 : -1, assistant });
  m.fixture = f;
  return m;
}

// simula todos os jogos da IA de um dia (mesmo motor, sem gráficos)
const dayFixtures = day => [...Object.values(S.leagues).flatMap(L => L.fixtures), ...Cups.cupFixtures()].filter(f => f.day === day);
export function playAIFixturesOn(day, exceptId) {
  const out = [];
  for (const f of dayFixtures(day)) {
    if (f.day !== day || f.played || f.id === exceptId) continue;
    if (S.coach.clubId && (f.home === S.coach.clubId || f.away === S.coach.clubId)) continue;
    const m = createMatch(f);
    m.runToEnd();
    commitResult(f, m, false);
    out.push(f);
  }
  Cups.progress();
  return out;
}

export async function playAIFixturesAsync(day, onProgress) {
  const list = [];
  for (const f of dayFixtures(day)) if (!f.played && !(S.coach.clubId && (f.home === S.coach.clubId || f.away === S.coach.clubId))) list.push(f);
  let i = 0;
  for (const f of list) {
    const m = createMatch(f); m.runToEnd(); commitResult(f, m, false);
    onProgress?.(++i, list.length);
    await new Promise(r => setTimeout(r));
  }
  Cups.progress();
}

// grava o resultado UMA vez (o id da partida garante que não se repete)
export function commitResult(f, m, isUser) {
  if (f.played) return null;
  const r = m.result();
  f.played = true; f.score = r.score;
  if (f.comp) {
    if (r.score[0] === r.score[1]) { const so = Cups.shootout(f, m); f.pens = so.score; f.winner = so.score[0] > so.score[1] ? f.home : f.away; }
    else f.winner = r.score[0] > r.score[1] ? f.home : f.away;
  }
  f.goals = r.events.filter(e => e.type === 'goal').map(e => ({ side: e.side, name: e.name, min: e.min, player: e.player }));
  const H = S.clubs[f.home], A = S.clubs[f.away];
  // estatísticas individuais e efeitos pós-jogo
  const sides = [H, A];
  for (const T of m.teams) {
    const c = sides[T.side];
    const won = r.score[T.side] > r.score[1 - T.side], lost = r.score[T.side] < r.score[1 - T.side];
    for (const mp of T.used) {
      const p = S.players[mp.p.id]; if (!p) continue;
      const rt = r.ratings.find(x => x.id === p.id);
      if (f.comp) { p.cst ||= { apps: 0, goals: 0, assists: 0 }; p.cst.apps++; p.cst.goals += mp.r.goals; p.cst.assists += mp.r.assists; }
      else {
        p.st.apps++; p.st.mins += rt?.mins || 0;
        p.st.goals += mp.r.goals; p.st.assists += mp.r.assists;
        p.st.rating = Math.round(((p.st.rating * (p.st.apps - 1)) + (rt?.rating || 6)) / p.st.apps * 100) / 100;
      }
      p.cond = Math.round(mp.energy);
      p.morale = clamp(p.morale + (won ? 6 : lost ? -5 : 1) + ((rt?.rating || 6) - 6.5) * 3, 15, 100);
      if (mp.yellow) { p.st.yc++; p.yellowAcc++; if (p.yellowAcc >= 3) { p.suspended = 1; p.yellowAcc = 0; } }
      if (mp.off && !mp.injured && mp.minOut != null && T.off.includes(mp)) { p.st.rc++; p.suspended = 1; }
      if (mp.injured) { p.injury = Math.max(p.injury, mp.injuryDays || 7); p.injuryType = M.injuryName(p.injury); p.treated = false; }
    }
    // quem não jogou cumpre suspensão
    for (const p of squadOf(c)) if (p.suspended && !T.used.some(x => x.p.id === p.id)) p.suspended = 0;
  }
  if (r.motm) { const p = S.players[r.motm.id]; if (p) p.st.motm++; }
  // bilheteria do mandante
  const lg = leagueCfg(H.division);
  const fill = clamp(0.45 + H.prestige * 0.07 + (S.board && H.id === S.coach.clubId ? (S.board.confidence - 50) / 400 : 0), 0.3, 0.98);
  const gate = H.capacity * fill * lg.ticket;
  H.balance = Math.round((H.balance + gate) * 1000) / 1000;
  f.attendance = Math.round(H.capacity * fill);
  if (H.id === S.coach.clubId) ledger(`Bilheteria x ${A.short}`, gate);
  if (isUser) userMatchDone(f, m, r);
  else aiNews(f, r);
  return r;
}

function userMatchDone(f, m, r) {
  const me = myClub();
  const side = f.home === me.id ? 0 : 1;
  const opp = S.clubs[side === 0 ? f.away : f.home];
  const gf = r.score[side], ga = r.score[1 - side];
  const res = gf > ga ? 'w' : gf < ga ? 'l' : 'd';
  const co = S.coach, hist = co.history[co.history.length - 1];
  co.matches++; co[res]++; hist[res]++;
  S.matchesPlayed++;
  f.user = { side, stats: r.stats, ratings: r.ratings, motm: r.motm, events: r.events, tactics: r.tactics };
  // confiança da diretoria: resultado x expectativa
  const myR = clubRating(me), opR = clubRating(opp) + (side === 1 ? 1.5 : -1.5);
  const expPts = clamp(1.4 + (myR - opR) * 0.12, 0.3, 2.6);
  const pts = res === 'w' ? 3 : res === 'd' ? 1 : 0;
  S.board.confidence = clamp(Math.round(S.board.confidence + (pts - expPts) * 3.2), 0, 100);
  co.rep = clamp(co.rep + (pts - expPts) * 0.6, 0, 100);
  // notícias baseadas no que aconteceu
  const late = r.events.filter(e => e.type === 'goal' && e.side === side && parseInt(e.min) >= 88);
  if (res === 'w' && late.length && gf - ga === 1) addNews(`${me.short} vence nos acréscimos`, `Gol de ${late[late.length - 1].name} aos ${late[late.length - 1].min} garantiu a vitória por ${gf} a ${ga} sobre o ${opp.short}.`, 'timer');
  else if (res === 'w' && gf - ga >= 3) addNews(`Goleada: ${me.short} ${gf} x ${ga} ${opp.short}`, `Atuação dominante da equipe de ${co.first} ${co.last}.`, 'flame');
  else if (res === 'l' && ga - gf >= 3) addNews(`${me.short} é goleado pelo ${opp.short}`, `Derrota por ${ga} a ${gf} preocupa a torcida.`, 'trending-down');
  else addNews(`${S.clubs[f.home].short} ${f.score[0]} x ${f.score[1]} ${S.clubs[f.away].short}${f.pens ? ` (${f.pens[0]}–${f.pens[1]} pên.)` : ''}`, `${f.comp ? Cups.compName(f) : `${f.round}ª rodada da ${leagueName(me.division)}`}. Melhor em campo: ${r.motm?.name || '—'}.`, 'goal');
  if (f.comp && f.pens) addNews(f.winner === me.id ? `${me.short} avança nos pênaltis` : `${me.short} cai nos pênaltis`, `${Cups.compName(f)}: ${f.pens[0]} a ${f.pens[1]} na disputa.`, f.winner === me.id ? 'party-popper' : 'frown');
  const braces = {};
  r.events.filter(e => e.type === 'goal' && e.side === side).forEach(e => { braces[e.player] = (braces[e.player] || 0) + 1; });
  for (const [pid, n] of Object.entries(braces)) {
    const p = S.players[pid];
    if (p && n >= 2 && p.age <= 21) addNews(`Joia de ${p.age} anos brilha com ${n} gols`, `${p.name} chamou atenção ao marcar ${n} vezes contra o ${opp.short}.`, 'star');
    else if (p && n >= 3) addNews(`Hat-trick de ${p.name}!`, `${p.name} marcou ${n} gols contra o ${opp.short}.`, 'star');
  }
  const last3 = fixturesOf(me.id).filter(x => x.played && x.user).slice(-3);
  if (last3.length === 3 && last3.every(x => x.score[x.user.side] < x.score[1 - x.user.side])) addNews('Diretoria perde confiança após sequência negativa', `Três derrotas seguidas deixam ${co.first} ${co.last} pressionado. Confiança: ${S.board.confidence}%.`, 'alert-triangle');
  // Arcade Social (eventos únicos, sem valor de XP definido pelo jogo)
  Arcade.report('match_complete', `${S.seed}-${f.id}`);
  if (res === 'w') {
    if (!co.achievements.firstWin) { co.achievements.firstWin = S.year; Arcade.report('first_win', `${S.seed}`, 'first'); }
    S.seasonWins++;
    if (S.seasonWins <= 15) Arcade.report('match_win', `${S.seed}-${f.id}`);
  }
  if (S.matchesPlayed % 5 === 0) Arcade.report('five_matches', `${S.seed}-${S.matchesPlayed}`);
  Social.afterUserMatch(f, r, side);
  checkFired();
}

function aiNews(f, r) {
  // apenas destaques do jogo do líder da Série A, para não poluir
  const lead = table(leagueOf(f.home))[0];
  if (lead && (f.home === lead.id || f.away === lead.id) && Math.abs(r.score[0] - r.score[1]) >= 4) {
    addNews(`${S.clubs[f.home].short} ${r.score[0]} x ${r.score[1]} ${S.clubs[f.away].short}`, `Placar elástico na ${f.round}ª rodada.`, 'newspaper');
  }
}

function checkFired() {
  const me = myClub();
  if (!me || S.board.confidence > 8) return;
  const played = fixturesOf(me.id).filter(f => f.played).length;
  if (played < 8) return;
  fire('A diretoria decidiu encerrar seu trabalho após a sequência de maus resultados.');
}

export function fire(reason, resigned = false) {
  const me = myClub();
  const co = S.coach;
  co.history[co.history.length - 1].to = S.year;
  co.history[co.history.length - 1].left = resigned ? 'Pediu demissão' : 'Demitido';
  S.firedFrom = me.id;
  addNews(resigned ? `${co.first} ${co.last} deixa o ${me.short}` : `${me.short} demite ${co.first} ${co.last}`, reason, resigned ? 'door-open' : 'user-x');
  co.clubId = null;
  co.rep = clamp(co.rep - (resigned ? 3 : 8), 0, 100);
  S.board = null;
  makeJobOffers(true);
}

export function makeJobOffers(force = false) {
  const co = S.coach;
  const rng = new RNG(hashSeed(S.seed, S.year, S.day, 'job'));
  const maxPrestige = co.rep >= 75 ? 5 : co.rep >= 60 ? 4 : co.rep >= 45 ? 3 : co.rep >= 30 ? 2 : 1;
  const pool = Object.values(S.clubs).filter(c => c.id !== co.clubId && c.id !== S.firedFrom && c.prestige <= maxPrestige);
  rng.shuffle(pool);
  const n = force ? 3 : 1;
  pool.slice(0, n).forEach(c => inbox(c.name, `Proposta de emprego: ${c.short}`, `O ${c.name} (${leagueName(c.division)}) quer você como treinador. Prestígio ${'★'.repeat(c.prestige)}. Orçamento ${money(c.balance)}.`, 'job', { offer: { kind: 'job', club: c.id } }));
}

export function acceptJob(clubId) {
  const co = S.coach;
  if (co.clubId) {
    const h = co.history[co.history.length - 1]; h.to = S.year; h.left = 'Aceitou proposta';
  }
  co.clubId = clubId;
  co.history.push({ club: clubId, from: S.year, to: null, w: 0, d: 0, l: 0 });
  S.firedFrom = null;
  S.board = { confidence: 60 };
  setBoard();
  autoLineup(myClub());
  Y.ensureYouth(myClub());
  addNews(`${co.first} ${co.last} assume o ${S.clubs[clubId].short}`, `Novo desafio na ${leagueName(S.clubs[clubId].division)}. Meta: ${S.board.objective.text}.`, 'handshake');
  save();
}

/* ---------- mercado ---------- */
function incomingOffers(rng, me) {
  for (const id of me.squad) {
    const p = S.players[id];
    const want = p.forSale ? 0.07 : (p.ovr >= 72 && p.age <= 24 ? 0.004 : 0);
    if (!want || !rng.chance(want)) continue;
    if (S.inbox.some(m => m.offer && !m.done && m.offer.player === id)) continue;
    const buyers = Object.values(S.clubs).filter(c => c.id !== me.id && c.balance > p.value * 0.9 && c.squad.length < 32);
    if (!buyers.length) continue;
    const b = rng.pick(buyers);
    const fee = Math.round(p.value * rng.range(p.forSale ? 0.75 : 1.05, p.forSale ? 1.1 : 1.45) * 100) / 100;
    if (fee > b.balance) continue;
    inbox(b.name, `Proposta por ${p.name}`, `O ${b.short} oferece ${money(fee)} por ${p.name} (${p.ovr}, ${p.age} anos).`, 'offer', { offer: { kind: 'sale', player: id, buyer: b.id, fee } });
  }
}

export function acceptSale(msg) {
  const o = msg.offer; const p = S.players[o.player]; const b = S.clubs[o.buyer]; const me = myClub();
  if (!p || p.club !== me.id || b.balance < o.fee) { msg.done = 'expirada'; save(); return { ok: false, msg: 'A proposta não é mais válida.' }; }
  if (me.squad.length <= 16) return { ok: false, msg: 'Elenco mínimo de 16 jogadores.' };
  M.logTransfer(p, me.id, b.id, o.fee);
  moveTo(p, b.id);
  b.balance -= o.fee; me.balance += o.fee;
  ledger(`Venda de ${p.name}`, o.fee);
  if (o.fee >= 20) S.bigSale = true;
  msg.done = 'aceita';
  addNews(`${me.short} aceita proposta ${o.fee >= 10 ? 'milionária ' : ''}por ${p.name}`, `${p.name} se transfere para o ${b.short} por ${money(o.fee)}.`, 'banknote');
  save();
  return { ok: true };
}

export function moveTo(p, clubId) {
  if (p.club) { const from = S.clubs[p.club]; from.squad = from.squad.filter(x => x !== p.id); from.tactics.lineup = (from.tactics.lineup || []).filter(x => x !== p.id); from.tactics.bench = (from.tactics.bench || []).filter(x => x !== p.id); if (from.tactics.lineup.length !== 11 && from.id !== S.coach.clubId) autoLineup(from); }
  else S.free = S.free.filter(x => x !== p.id);
  if (clubId) { const to = S.clubs[clubId]; to.squad.push(p.id); p.club = clubId; numberSquad(squadOf(to)); }
  else { p.club = null; S.free.push(p.id); }
  p.forSale = false;
}

// avaliação da IA: valor, importância no elenco, contrato e caixa
export function evaluateBid(p, fee) {
  const c = S.clubs[p.club];
  if (!c) return { kind: 'accept' };
  const samePos = squadOf(c).filter(x => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const rank = samePos.indexOf(p);
  const importance = rank === 0 ? 0.45 : rank === 1 ? 0.2 : 0;
  const short = samePos.length <= 2 ? 0.25 : 0;
  const ask = Math.round(p.value * (1 + importance + short) * (p.contract <= 1 ? 0.85 : 1) * (c.balance < 0 ? 0.85 : 1) * 100) / 100;
  if (p.clause && fee >= p.clause) return { kind: 'accept', ask, clause: true };
  if (p.forSale && fee >= p.value * 0.9) return { kind: 'accept', ask };
  if (fee >= ask) return { kind: 'accept', ask };
  if (fee >= ask * 0.75) return { kind: 'counter', ask };
  return { kind: 'reject', ask };
}
export function wageDemand(p, toClub) {
  const c = S.clubs[toClub];
  const base = wageFor(p);
  return Math.round(base * (1.15 + (p.club ? 0.1 : -0.1) - c.prestige * 0.02) * 1000) / 1000;
}
export function payroll(c) { return M.wageCost(c); }

export function completeSigning(p, fee, wage, years, bonus = 0) {
  const me = myClub();
  if (fee + bonus > me.balance) return { ok: false, msg: 'Orçamento insuficiente para a transferência e as luvas.' };
  if (fee > 0 && !M.windowState().open) return { ok: false, msg: 'A janela de transferências está fechada (agentes livres podem ser contratados).' };
  if (payroll(me) + wage > me.wageBudget) return { ok: false, msg: 'A folha salarial ultrapassaria o limite da diretoria.' };
  if (me.squad.length >= 32) return { ok: false, msg: 'Elenco cheio (máx. 32).' };
  const from = p.club ? S.clubs[p.club] : null;
  if (from) { from.balance += fee; }
  me.balance -= fee + bonus;
  M.logTransfer(p, p.club, me.id, fee);
  moveTo(p, me.id);
  p.wage = wage; p.contract = years; p.morale = 80;
  if (fee) ledger(`Contratação de ${p.name}`, -fee);
  if (fee >= 20) S.bigBuy = true;
  if (bonus) ledger(`Luvas de ${p.name}`, -bonus);
  addNews(`${me.short} contrata ${p.name}`, `${p.name} (${p.ovr}, ${p.age} anos) chega ${from ? `do ${from.short} por ${money(fee)}` : 'sem custos de transferência'}.`, 'pen-line');
  save();
  return { ok: true };
}

export function renewContract(p, wage, years) {
  const demand = Math.round(wageFor(p) * (p.age >= 31 ? 0.95 : 1.1) * 1000) / 1000;
  const me = myClub();
  if (wage < demand * 0.95) return { ok: false, msg: `${p.name} recusou. Pede ao menos ${money(demand)}/mês.`, demand };
  if (payroll(me) - p.wage + wage > me.wageBudget) return { ok: false, msg: 'A folha ultrapassaria o limite.' };
  p.wage = wage; p.contract = years; p.morale = clamp(p.morale + 8, 0, 100);
  save();
  return { ok: true };
}
export const renewDemand = p => Math.round(wageFor(p) * (p.age >= 31 ? 0.95 : 1.1) * 1000) / 1000;

export function releasePlayer(p) {
  const me = myClub();
  const comp = Math.round(p.wage * Math.max(1, p.contract) * 6 * 1000) / 1000;
  if (comp > me.balance) return { ok: false, msg: 'Sem caixa para pagar a rescisão.' };
  me.balance -= comp; ledger(`Rescisão de ${p.name}`, -comp);
  moveTo(p, null); p.contract = 0;
  save(); return { ok: true };
}

function aiMarket(rng) {
  for (const c of Object.values(S.clubs)) {
    if (c.id === S.coach.clubId) continue;
    const sq = squadOf(c);
    if (sq.length >= 23) continue;
    const need = ['GK', 'CB', 'CM', 'ST', 'LB', 'RB'].find(pos => sq.filter(p => p.pos === pos).length < (pos === 'GK' ? 2 : pos === 'CB' || pos === 'CM' ? 3 : 2)) || rng.pick(['CM', 'ST', 'CB']);
    const cand = S.free.map(id => S.players[id]).filter(p => p.pos === need).sort((a, b) => b.ovr - a.ovr)[0];
    if (cand) { moveTo(cand, c.id); cand.contract = rng.int(1, 3); cand.wage = wageFor(cand); }
  }
  // repõe agentes livres
  while (S.free.length < 30) {
    const p = makePlayer(rng, DB.names, rng.pick(['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST']), rng.int(50, 64));
    p.club = null; p.contract = 0; S.players[p.id] = p; S.free.push(p.id);
  }
}

/* ---------- fim de temporada ---------- */
function endSeason() {
  const rng = new RNG(hashSeed(S.seed, S.year, 'end'));
  const me = myClub();
  const summary = { year: S.year, tables: {}, champion: {}, promoted: [], relegated: [] };
  for (const L of DB.leagues) {
    const t = table(L.id);
    summary.tables[L.id] = t.map(r => ({ id: r.id, name: S.clubs[r.id].short, pts: r.pts, gd: r.gd }));
    summary.champion[L.id] = t[0].id;
    // premiação
    t.forEach((r, i) => {
      const prize = L.prizeByPosition[i] || 0;
      S.clubs[r.id].balance += prize;
      if (r.id === S.coach.clubId) ledger(`Premiação: ${i + 1}º na ${L.short}`, prize);
    });
    const champ = S.clubs[t[0].id];
    champ.titles = (champ.titles || 0) + (L.division === 1 ? 1 : 0);
    champ.trophies.push({ year: S.year, name: L.name });
    Cups.honour(L.name, t[0].id, t[1].id);
    if (L.relegate) summary.relegated = t.slice(-L.relegate).map(r => r.id);
    if (L.promote) summary.promoted = t.slice(0, L.promote).map(r => r.id);
  }
  // artilheiros
  const scorers = {};
  for (const L of DB.leagues) scorers[L.id] = Object.values(S.players).filter(p => p.club && S.clubs[p.club].division === L.id && p.st.goals).sort((a, b) => b.st.goals - a.st.goals).slice(0, 3).map(p => ({ name: p.name, club: S.clubs[p.club].short, goals: p.st.goals }));
  summary.scorers = scorers;

  // usuário: objetivos, títulos, conquistas
  if (me) {
    const lg = me.division;
    const pos = summary.tables[lg].findIndex(r => r.id === me.id) + 1;
    summary.user = { club: me.id, division: lg, pos };
    const obj = S.board.objective;
    const met = pos <= obj.pos;
    S.board.confidence = clamp(S.board.confidence + (met ? 22 : -28), 0, 100);
    summary.user.objective = obj.text; summary.user.met = met;
    S.coach.rep = clamp(S.coach.rep + (met ? 6 : -4) + (pos === 1 ? 10 : 0), 0, 100);
    Arcade.report('season_complete', `${S.seed}-${S.year}`);
    if (pos === 1) {
      S.coach.titles.push({ year: S.year, name: leagueName(lg), club: me.id });
      addNews(`${me.short} é campeão da ${leagueShort(lg)}!`, `${S.coach.first} ${S.coach.last} conquista ${S.coach.titles.length === 1 ? 'o primeiro título da carreira' : `o ${S.coach.titles.length}º título da carreira`}.`, 'trophy');
      Arcade.report('league_title', `${S.seed}-${S.year}-${lg}`, lg === 'A' ? 'serie_a' : lg === 'B' ? 'serie_b' : 'foreign');
    }
    if (summary.promoted.includes(me.id)) { addNews(`${me.short} conquista o acesso à Série A!`, 'Festa da torcida: o clube volta à elite.', 'arrow-up-circle'); Arcade.report('promotion', `${S.seed}-${S.year}`); }
    if (summary.relegated.includes(me.id)) addNews(`${me.short} é rebaixado para a Série B`, 'Temporada para esquecer.', 'arrow-down-circle');
  }
  // acesso e rebaixamento
  summary.relegated.forEach(id => { S.clubs[id].division = 'B'; S.clubs[id].prestige = Math.max(1, S.clubs[id].prestige - (S.clubs[id].prestige >= 3 ? 1 : 0)); });
  summary.promoted.forEach(id => { S.clubs[id].division = 'A'; });

  // histórico por temporada de cada jogador (antes de zerar as estatísticas)
  for (const p of Object.values(S.players)) if (p.club && (p.st?.apps || p.cst?.apps)) (p.hist ||= []).push({ y: S.year, club: p.club, apps: p.st.apps, goals: p.st.goals, assists: p.st.assists, rating: p.st.rating, mins: p.st.mins, capps: p.cst?.apps || 0, cgoals: p.cst?.goals || 0 });
  for (const c of Object.values(S.clubs)) if (c.id !== S.coach.clubId) { const L = summary.tables[c.division]; if (L) c.history.push({ year: S.year, division: c.division, pos: L.findIndex(r => r.id === c.id) + 1 }); }
  M.seasonEnd();
  Y.youthSeasonEnd(rng);
  // evolução, aposentadorias, contratos e novas gerações
  for (const c of Object.values(S.clubs)) {
    for (const p of squadOf(c)) {
      seasonAging(p, rng);
      p.contract--;
      p.wage = p.wage; p.value = marketValue(p);
      const retire = p.age >= 37 || (p.age >= 34 && rng.chance((p.age - 33) * 0.22));
      if (retire) {
        c.squad = c.squad.filter(x => x !== p.id); delete S.players[p.id];
        if (c.id === S.coach.clubId) inbox('Elenco', `${p.name} se aposenta`, `Aos ${p.age} anos, ${p.name} pendurou as chuteiras.`, 'report');
        continue;
      }
      if (p.contract <= 0 && p.precontract) { M.executePrecontract(p); continue; }
      if (p.contract <= 0) {
        if (c.id === S.coach.clubId) { moveTo(p, null); inbox('Elenco', `Contrato encerrado: ${p.name}`, `${p.name} deixou o clube como agente livre.`, 'report'); }
        else if (rng.chance(p.ovr >= c.rating - 4 ? 0.85 : 0.45)) p.contract = rng.int(1, 3);
        else moveTo(p, null);
      }
    }
    // base: jovens gerados para repor
    let guard = 0;
    while (c.squad.length < 22 && guard++ < 12) {
      const pos = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].find(x => squadOf(c).filter(p => p.pos === x).length < (x === 'GK' ? 2 : x === 'CB' || x === 'CM' ? 3 : 1)) || rng.pick(['CM', 'ST', 'CB', 'LW']);
      const p = makePlayer(rng, namesFor(c.country), pos, c.rating - 12 + rng.int(0, 6), { age: rng.int(17, 19) });
      p.pot = clamp(p.pot + rng.int(2, 10) + ((c.youthLevel || 1) - 1) * 3, p.ovr, 94);
      p.club = c.id; S.players[p.id] = p; c.squad.push(p.id);
      if (c.id === S.coach.clubId) inbox('Categorias de base', `Promovido da base: ${p.name}`, `${p.name}, ${p.age} anos, ${p.pos}. Potencial estimado: ${p.pot - 3}–${p.pot + 3}.`, 'youth');
    }
    numberSquad(squadOf(c));
    // força do clube acompanha o elenco
    c.rating = Math.round(clubRating(c));
  }
  // jogadores livres também envelhecem
  for (const id of S.free.slice()) { const p = S.players[id]; seasonAging(p, rng); if (p.age >= 35) { S.free = S.free.filter(x => x !== id); delete S.players[id]; } }

  S.seasons.push(summary);
  S.lastSeason = summary;
  if (me) {
    me.history.push({ year: S.year, division: summary.user.division, pos: summary.user.pos });
    if (S.board.confidence <= 12) fire('A diretoria não renovou após uma temporada abaixo do esperado.');
  }
  // nova temporada
  S.year++; S.season++; S.day = 0; S.seasonWins = 0;
  S.startISO = `${S.year}-04-10`;
  setupSeason(rng);
  const nm = myClub();
  if (nm) {
    autoLineupKeep(nm);
    inbox('Diretoria', `Temporada ${S.year}`, `Meta: ${S.board.objective.text}. Caixa: ${money(nm.balance)}. Folha máxima: ${money(nm.wageBudget)}/mês.`, 'board');
  }
  for (const c of Object.values(S.clubs)) if (c.id !== S.coach.clubId) autoLineup(c);
  if (S.coach.rep >= 55) makeJobOffers();
  S.showSeasonSummary = true;
}

function autoLineupKeep(c) {
  const valid = (c.tactics.lineup || []).filter(id => c.squad.includes(id));
  if (valid.length !== 11) autoLineup(c);
}

/* ---------- notícias e caixa de entrada ---------- */
export function addNews(title, body, icon = 'newspaper') {
  S.news.unshift({ id: 'n' + S.day + '-' + S.news.length + '-' + S.year, title, body, icon, day: S.day, year: S.year });
  S.news = S.news.slice(0, 60);
}
export function inbox(from, title, body, kind = 'info', extra = {}) {
  S.inbox.unshift({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from, title, body, kind, day: S.day, year: S.year, read: false, ...extra });
  S.inbox = S.inbox.slice(0, 80);
}

/* ---------- artilharia ---------- */
export function topScorers(lg, n = 10) {
  return Object.values(S.players).filter(p => p.club && S.clubs[p.club].division === lg && p.st.goals > 0).sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists).slice(0, n);
}
