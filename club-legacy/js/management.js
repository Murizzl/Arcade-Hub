/* =========================================================
   Gestão avançada (fase 3): janelas de transferência, negociação
   de contratos com o agente, multas rescisórias, empréstimos,
   pré-contratos, olheiros, lesões, moral/promessas, pedidos à
   diretoria e mercado entre clubes da IA.
   ========================================================= */
import { RNG, hashSeed, clamp, money } from './util.js';
import { marketValue, wageFor } from './players.js';
import * as C from './career.js';

const S = () => C.S;
const round3 = v => Math.round(v * 1000) / 1000;
const round1 = v => Math.round(v * 10) / 10;

/* ---------- migração de saves antigos ---------- */
export function migrate(s) {
  for (const p of Object.values(s.players)) {
    if (p.clause == null) p.clause = round1(Math.max(1, p.value * 3));
    if (!p.role) p.role = 'rotation';
  }
  s.scout ||= { tasks: [], known: {} };
  s.transfers ||= [];
  s.talkBlock ||= {};
  for (const c of Object.values(s.clubs)) { c.youthLevel ||= 1; c.country ||= 'BR'; }
  s.honours ||= [];
}

/* ---------- janelas de transferência ---------- */
// dias da temporada (0 = início, 10 de abril): pré-temporada e meio do ano
const WINDOWS = [[0, 41, 'Janela de abertura'], [98, 140, 'Janela do meio do ano']];
export function windowState(day = S().day) {
  const w = WINDOWS.find(([a, b]) => day >= a && day <= b);
  if (w) return { open: true, label: `${w[2]} aberta`, until: w[1], days: w[1] - day };
  const next = WINDOWS.find(([a]) => a > day);
  return { open: false, label: next ? 'Janela fechada' : 'Janela fechada até a próxima temporada', from: next?.[0], days: next ? next[0] - day : null };
}

/* ---------- papéis no elenco ---------- */
export const ROLES = { key: 'Titular absoluto', rotation: 'Rotação', prospect: 'Jovem promessa', backup: 'Reserva' };
const ROLE_RANK = { key: 3, rotation: 2, prospect: 1, backup: 0 };
const ROLE_MINUTES = { key: 0.7, rotation: 0.4, prospect: 0.15, backup: 0.08 };
export function expectedRole(p, clubId) {
  const c = S().clubs[clubId];
  const top = C.squadOf(c).filter(x => x.id !== p.id).sort((a, b) => b.ovr - a.ovr).slice(0, 14);
  const avg = top.reduce((s, x) => s + x.ovr, 0) / (top.length || 1);
  if (p.ovr >= avg + 2) return 'key';
  if (p.ovr >= avg - 3) return 'rotation';
  if (p.age <= 21 && p.pot >= avg + 2) return 'prospect';
  return 'backup';
}

/* ---------- negociação de contrato com o agente ---------- */
// type: 'sign' (contratação), 'renew' (renovação) ou 'pre' (pré-contrato)
export function demands(p, type, clubId) {
  const base = type === 'renew' ? C.renewDemand(p) : C.wageDemand(p, clubId) * (type === 'pre' ? 1.08 : 1);
  const role = expectedRole(p, clubId);
  const years = p.age <= 23 ? [3, 5] : p.age <= 29 ? [2, 4] : [1, 2];
  return {
    wage: round3(base), bonus: round3(base * (type === 'renew' ? 2 : 4)), years, role,
    clauseMax: round1(Math.max(2, marketValue(p) * (2.2 + (p.ambition || 0.5)))) // o jogador quer uma multa que permita sair
  };
}

export function startTalks(p, type, fee = 0) {
  const s = S();
  if ((s.talkBlock[p.id] || -1) > s.day && s.talkBlock[p.id + ':y'] === s.year) return { error: `${p.name} não quer conversar por enquanto.` };
  const clubId = s.coach.clubId;
  return { pid: p.id, type, fee, round: 0, patience: 3, dem: demands(p, type, clubId), last: null };
}

export function evaluateOffer(sess, o) {
  const p = S().players[sess.pid], d = sess.dem;
  const w = o.wage / d.wage;
  const b = d.bonus ? Math.min(1.5, o.bonus / d.bonus) : 1;
  const y = o.years >= d.years[0] && o.years <= d.years[1] ? 1 : 0.9;
  const cf = o.clause <= d.clauseMax ? 1 : clamp(1 - (o.clause - d.clauseMax) / d.clauseMax, 0.6, 1);
  const roleDiff = ROLE_RANK[o.role] - ROLE_RANK[d.role];
  const roleAdj = roleDiff < 0 ? roleDiff * 0.08 : roleDiff * 0.025;
  const total = 0.6 * Math.min(1.25, w) + 0.2 * b + 0.1 * y + 0.1 * cf + roleAdj;
  return { total, w, b, y, cf, roleDiff, p };
}

// resposta do agente: aceita, contrapropõe (dizendo o que falta) ou encerra
export function propose(sess, offer) {
  const s = S();
  const ev = evaluateOffer(sess, offer);
  sess.round++;
  sess.last = offer;
  if (ev.total >= 0.985) return { kind: 'accept', msg: 'Temos um acordo. O jogador está satisfeito com os termos.' };
  sess.patience -= ev.total < 0.85 ? 2 : 1;
  if (sess.patience <= 0) {
    s.talkBlock[sess.pid] = s.day + 10; s.talkBlock[sess.pid + ':y'] = s.year;
    return { kind: 'walk', msg: 'O agente encerrou as conversas. Tente novamente daqui a alguns dias.' };
  }
  const asks = [];
  const d = sess.dem;
  if (ev.w < 0.98) asks.push(`salário de ${money(round3(d.wage * (1 + 0.03 * (3 - sess.patience))))}/mês`);
  if (ev.b < 0.9) asks.push(`luvas de ${money(d.bonus)}`);
  if (ev.y < 1) asks.push(`contrato de ${d.years[0]} a ${d.years[1]} temporadas`);
  if (ev.cf < 1) asks.push(`multa rescisória de no máximo ${money(d.clauseMax)}`);
  if (ev.roleDiff < 0) asks.push(`garantia de papel: ${ROLES[d.role].toLowerCase()}`);
  if (!asks.length) asks.push('um pequeno ajuste no salário');
  return { kind: 'counter', msg: `O agente pede ${asks.join(', ')}.`, patience: sess.patience };
}

export function finalize(sess, offer) {
  const s = S(), p = s.players[sess.pid], me = C.myClub();
  if (sess.type === 'renew') {
    if (C.payroll(me) - p.wage + offer.wage > me.wageBudget) return { ok: false, msg: 'A folha ultrapassaria o limite.' };
    if (offer.bonus > me.balance) return { ok: false, msg: 'Sem caixa para as luvas.' };
    me.balance -= offer.bonus; if (offer.bonus) C.ledger(`Luvas da renovação de ${p.name}`, -offer.bonus);
    applyTerms(p, offer, me.id);
    p.morale = clamp(p.morale + 8, 0, 100);
    C.save();
    return { ok: true };
  }
  if (sess.type === 'pre') {
    p.precontract = { club: me.id, ...offer };
    C.inbox('Mercado', `Pré-contrato assinado: ${p.name}`, `${p.name} chega ao ${me.short} ao fim da temporada, quando seu contrato com o ${s.clubs[p.club].short} terminar.`, 'report');
    C.addNews(`${me.short} acerta pré-contrato com ${p.name}`, `O jogador chega sem custos de transferência em ${s.year + 1}.`, 'pen-line');
    C.save();
    return { ok: true };
  }
  const r = C.completeSigning(p, sess.fee, offer.wage, offer.years, offer.bonus);
  if (!r.ok) return r;
  applyTerms(p, offer, me.id);
  C.save();
  return { ok: true };
}

function applyTerms(p, o, clubId) {
  p.wage = o.wage; p.contract = o.years; p.clause = o.clause;
  p.role = o.role;
  const exp = expectedRole(p, clubId);
  p.promise = ROLE_RANK[o.role] > ROLE_RANK[exp] ? { role: o.role, since: S().matchesPlayed, year: S().year } : null;
}

/* ---------- multa rescisória ---------- */
export function payClause(p) {
  const s = S(), me = C.myClub(), from = s.clubs[p.club];
  if (!windowState().open) return { ok: false, msg: 'A janela de transferências está fechada.' };
  if (p.clause > me.balance) return { ok: false, msg: 'Caixa insuficiente para pagar a multa.' };
  return { ok: true, fee: p.clause, from };
}

/* ---------- empréstimos ---------- */
export function loanTerms(p) {
  const c = S().clubs[p.club];
  const same = C.squadOf(c).filter(x => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr);
  const rank = same.indexOf(p);
  const available = !p.loan && (rank >= 2 || (p.age <= 23 && rank >= 1));
  const minShare = clamp(0.5 + (p.ovr - 65) / 60, 0.4, 1);
  return { available, minShare: Math.round(minShare * 20) / 20, rank };
}
export function requestLoan(p, share) {
  const s = S(), me = C.myClub();
  if (!windowState().open) return { ok: false, msg: 'Empréstimos só durante a janela.' };
  const t = loanTerms(p);
  if (!t.available) return { ok: false, msg: `O ${s.clubs[p.club].short} conta com ${p.name} e não o empresta.` };
  if (share < t.minShare) return { ok: false, msg: `O clube exige que você pague ao menos ${Math.round(t.minShare * 100)}% do salário.` };
  if (C.payroll(me) + p.wage * share > me.wageBudget) return { ok: false, msg: 'A folha ultrapassaria o limite.' };
  if (me.squad.length >= 32) return { ok: false, msg: 'Elenco cheio.' };
  const from = p.club;
  C.moveTo(p, me.id);
  p.loan = { from, to: me.id, share, until: s.year };
  p.role = expectedRole(p, me.id);
  logTransfer(p, from, me.id, 0, 'empréstimo');
  C.addNews(`${me.short} acerta empréstimo de ${p.name}`, `O jogador fica até o fim de ${s.year}; o ${me.short} paga ${Math.round(share * 100)}% do salário.`, 'repeat');
  C.save();
  return { ok: true };
}
export function acceptLoanOut(msg) {
  const s = S(), o = msg.offer, p = s.players[o.player], me = C.myClub(), to = s.clubs[o.club];
  if (!p || p.club !== me.id || p.loan) { msg.done = 'expirada'; return { ok: false, msg: 'A proposta não é mais válida.' }; }
  if (me.squad.length <= 16) return { ok: false, msg: 'Elenco mínimo de 16 jogadores.' };
  C.moveTo(p, to.id);
  p.loan = { from: me.id, to: to.id, share: o.share, until: s.year };
  p.forLoan = false;
  msg.done = 'aceita';
  logTransfer(p, me.id, to.id, 0, 'empréstimo');
  C.save();
  return { ok: true };
}
// custo salarial considerando empréstimos (quem recebe paga a parte combinada)
export function wageCost(c) {
  let w = 0;
  for (const p of C.squadOf(c)) w += p.loan && p.loan.to === c.id ? p.wage * p.loan.share : p.wage;
  for (const p of Object.values(S().players)) if (p.loan && p.loan.from === c.id) w += p.wage * (1 - p.loan.share);
  return w;
}
export function returnLoans() {
  for (const p of Object.values(S().players)) {
    if (!p.loan) continue;
    const from = p.loan.from, wasMine = from === S().coach.clubId || p.loan.to === S().coach.clubId;
    delete p.loan;
    C.moveTo(p, from);
    if (wasMine) C.inbox('Elenco', `Fim do empréstimo: ${p.name}`, `${p.name} voltou ao ${S().clubs[from].short}. Jogou ${p.st.apps} partidas na temporada.`, 'report');
  }
}

/* ---------- pré-contrato ---------- */
export const canPrecontract = p => p.club && p.club !== S().coach.clubId && p.contract <= 1 && S().day >= 133 && !p.precontract && !p.loan;
export function executePrecontract(p) {
  const pc = p.precontract; delete p.precontract;
  const from = p.club;
  C.moveTo(p, pc.club);
  applyTerms(p, pc, pc.club);
  logTransfer(p, from, pc.club, 0, 'pré-contrato');
  if (pc.club === S().coach.clubId) C.inbox('Mercado', `${p.name} se apresenta`, `${p.name} chegou pelo pré-contrato assinado na temporada passada.`, 'report');
}

/* ---------- olheiros ---------- */
export function potRange(p) {
  const s = S();
  const exact = s.scout?.known?.[p.id] || p.club === s.coach.clubId;
  const e = s.scout?.known?.[p.id] ? 0 : p.club === s.coach.clubId ? 2 : 6;
  if (exact && e === 0) return `${p.pot}`;
  return `${Math.max(p.ovr, p.pot - e)}–${Math.min(99, p.pot + e)}`;
}
export function scout(p) {
  const s = S();
  if (s.scout.known[p.id]) return { ok: false, msg: 'Você já tem um relatório completo deste jogador.' };
  if (s.scout.tasks.some(t => t.pid === p.id)) return { ok: false, msg: 'Um olheiro já está observando este jogador.' };
  if (s.scout.tasks.length >= 3) return { ok: false, msg: 'Seus 3 olheiros estão ocupados.' };
  const days = 4 + (p.club ? 3 : 0) + (hashSeed(p.id) % 3);
  s.scout.tasks.push({ pid: p.id, until: s.day + days, year: s.year });
  C.save();
  return { ok: true, days };
}
function scoutDaily() {
  const s = S();
  s.scout.tasks = s.scout.tasks.filter(t => {
    if (t.year === s.year && t.until > s.day) return true;
    const p = s.players[t.pid]; if (!p) return false;
    s.scout.known[p.id] = 1;
    const me = C.myClub();
    const stars = p.pot >= 85 ? 5 : p.pot >= 78 ? 4 : p.pot >= 72 ? 3 : p.pot >= 66 ? 2 : 1;
    const fit = me ? (p.ovr >= C.clubRating(me) + 2 ? 'seria titular no seu time' : p.pot >= C.clubRating(me) + 4 ? 'pode virar titular em breve' : 'seria reserva no seu time') : '';
    C.inbox('Olheiro', `Relatório: ${p.name}`, `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} · Overall ${p.ovr}, potencial ${p.pot}. ${p.age} anos, ${p.nat}. Valor justo ${money(p.value)}. Conclusão: ${fit}.`, 'report', { player: p.id });
    return false;
  });
}

/* ---------- lesões ---------- */
const INJURIES = [['Pancada no tornozelo', 0, 7], ['Estiramento muscular', 7, 14], ['Lesão na coxa', 14, 24], ['Entorse no joelho', 24, 40], ['Fratura no pé', 40, 999]];
export const injuryName = days => INJURIES.find(([, a, b]) => days > a && days <= b)?.[0] || INJURIES[0][0];
export function treatCost(p) { return round3(0.015 * p.injury * (1 + S().clubs[p.club].prestige * 0.25)); }
export function treat(p) {
  const me = C.myClub(), cost = treatCost(p);
  if (!p.injury || p.treated) return { ok: false, msg: 'Tratamento já aplicado ou jogador saudável.' };
  if (cost > me.balance) return { ok: false, msg: 'Caixa insuficiente.' };
  me.balance -= cost; C.ledger(`Tratamento de ${p.name}`, -cost);
  p.injury = Math.max(1, Math.round(p.injury * 0.65)); p.treated = true;
  C.save();
  return { ok: true };
}

/* ---------- moral: minutos x papel prometido ---------- */
export function happiness(p) {
  if (p.wantsOut) return ['Quer sair', 'neg'];
  if (p.morale >= 80) return ['Muito feliz', 'pos'];
  if (p.morale >= 62) return ['Satisfeito', 'pos'];
  if (p.morale >= 45) return ['Neutro', ''];
  return ['Insatisfeito', 'warn'];
}
function moraleWeekly() {
  const s = S(), me = C.myClub(); if (!me) return;
  const played = C.fixturesOf(me.id).filter(f => f.played).length;
  if (played < 5) return;
  for (const p of C.squadOf(me)) {
    if (p.injury) continue;
    const share = p.st.mins / (played * 90);
    const want = ROLE_MINUTES[p.promise?.role || p.role || 'rotation'];
    if (share < want * 0.55) p.morale = clamp(p.morale - (p.promise ? 6 : 3), 10, 100);
    else if (share >= want) p.morale = clamp(p.morale + 2, 10, 100);
    // promessa quebrada depois de 8 jogos: pede para sair
    const broken = p.promise && s.matchesPlayed - p.promise.since >= 8 && share < ROLE_MINUTES[p.promise.role] * 0.6;
    if (!p.wantsOut && (broken || p.morale < 30)) {
      p.wantsOut = true;
      C.inbox(p.name, `${p.name} pede para sair`, broken ? `"Você me prometeu ser ${ROLES[p.promise.role].toLowerCase()}, mas quase não jogo." O que responder?` : '"Não estou feliz no clube e quero ser negociado." O que responder?', 'request', { offer: { kind: 'request', player: p.id } });
    }
  }
}
export function answerRequest(msg, promise) {
  const p = S().players[msg.offer.player]; msg.done = promise ? 'prometido' : 'à venda';
  if (!p) return;
  if (promise) {
    if (p.brokenTwice) { p.forSale = true; msg.done = 'à venda (não acreditou)'; C.inbox(p.name, 'Promessa recusada', `${p.name} não acredita mais em promessas e foi listado para venda.`, 'report'); }
    else { p.brokenTwice = !!p.promise; p.promise = { role: p.role === 'key' ? 'key' : 'rotation', since: S().matchesPlayed, year: S().year }; p.wantsOut = false; p.morale = clamp(p.morale + 12, 0, 100); }
  } else { p.forSale = true; p.morale = clamp(p.morale + 5, 0, 100); }
  C.save();
}

/* ---------- pedidos à diretoria ---------- */
export function boardRequest(kind) {
  const s = S(), me = C.myClub(), b = s.board;
  b.requests ||= {};
  const key = `${s.year}:${kind}`;
  if (b.requests[key]) return { ok: false, msg: 'Você já fez este pedido nesta temporada.' };
  b.requests[key] = true;
  if (kind === 'budget') {
    if (b.confidence < 60) { b.confidence = clamp(b.confidence - 3, 0, 100); C.save(); return { ok: false, msg: 'A diretoria recusou: "Mostre resultados primeiro."' }; }
    const g = round1(clamp(me.budget * 0.25, 2, 25)); me.balance += g; C.ledger('Aporte extra da diretoria', g); C.save();
    return { ok: true, msg: `A diretoria liberou ${money(g)} para reforços.` };
  }
  if (kind === 'wages') {
    if (b.confidence < 55) { b.confidence = clamp(b.confidence - 3, 0, 100); C.save(); return { ok: false, msg: 'A diretoria recusou aumentar a folha.' }; }
    me.wageBudget = round3(me.wageBudget * 1.12); C.save();
    return { ok: true, msg: `Folha máxima ampliada para ${money(me.wageBudget)}/mês.` };
  }
  if (kind === 'youth') {
    if (me.youthLevel >= 3) return { ok: false, msg: 'As categorias de base já estão no nível máximo.' };
    const cost = 2 * me.youthLevel * (me.division === 'A' ? 1.5 : 1);
    if (me.balance < cost || b.confidence < 50) { delete b.requests[key]; return { ok: false, msg: `É preciso confiança ≥ 50% e ${money(cost)} em caixa.` }; }
    me.balance -= cost; C.ledger('Investimento nas categorias de base', -cost); me.youthLevel++; C.save();
    return { ok: true, msg: `Base melhorada para o nível ${me.youthLevel}: jovens promovidos terão mais potencial.` };
  }
}
export const youthCost = me => 2 * me.youthLevel * (me.division === 'A' ? 1.5 : 1);

/* ---------- mercado e rotina diária ---------- */
export function logTransfer(p, from, to, fee, kind = 'compra') {
  const s = S();
  s.transfers.unshift({ day: s.day, year: s.year, pid: p.id, name: p.name, pos: p.pos, ovr: p.ovr, from, to, fee, kind });
  s.transfers = s.transfers.slice(0, 80);
}

export function daily(rng) {
  const s = S(), me = C.myClub(), win = windowState();
  scoutDaily();
  if (s.day % 7 === 0) moraleWeekly();
  if (win.open) {
    if (s.day % 3 === 0) aiTransfers(rng);
    if (me) { loanOffers(rng, me); clauseRaids(rng, me); }
  }
  // virada de janela: aviso
  if (WINDOWS.some(([a]) => a === s.day) && s.day > 0) C.inbox('Mercado', 'Janela de transferências aberta', `Você pode negociar até ${C.dateLabel(win.until, false)}.`, 'report');
  if (WINDOWS.some(([, b]) => b + 1 === s.day)) C.inbox('Mercado', 'Janela de transferências fechada', 'Até a próxima janela, só agentes livres e renovações.', 'report');
  // propostas de emprego no meio da temporada para quem vai bem
  if (me && s.day % 30 === 15 && s.coach.rep >= 50 && C.position(me.id) <= 3 && rng.chance(0.5)) C.makeJobOffers();
}

function loanOffers(rng, me) {
  for (const id of me.squad) {
    const p = s_().players[id];
    if (!p.forLoan || p.loan || !rng.chance(0.08)) continue;
    if (s_().inbox.some(m => m.offer && !m.done && m.offer.player === id)) continue;
    const clubs = Object.values(s_().clubs).filter(c => c.id !== me.id && c.squad.length < 30 && C.clubRating(c) <= p.ovr + 4);
    if (!clubs.length) continue;
    const c = rng.pick(clubs), share = Math.round(rng.range(0.5, 1) * 20) / 20;
    C.inbox(c.name, `Proposta de empréstimo: ${p.name}`, `O ${c.short} quer ${p.name} emprestado até o fim da temporada, pagando ${Math.round(share * 100)}% do salário. Ele teria mais minutos para evoluir.`, 'offer', { offer: { kind: 'loanout', player: id, club: c.id, share } });
  }
}
const s_ = S;

// clubes podem pagar a multa de jogadores do usuário
function clauseRaids(rng, me) {
  if (!rng.chance(0.06)) return;
  const cands = C.squadOf(me).filter(p => !p.loan && p.clause && p.clause < p.value * 1.8 && p.ovr >= 68);
  if (!cands.length) return;
  const p = rng.pick(cands);
  const buyers = Object.values(s_().clubs).filter(c => c.id !== me.id && c.balance >= p.clause * 1.1 && c.prestige >= me.prestige && c.squad.length < 30);
  if (!buyers.length || me.squad.length <= 16) return;
  const b = rng.pick(buyers);
  C.moveTo(p, b.id); b.balance -= p.clause; me.balance += p.clause;
  C.ledger(`Multa rescisória de ${p.name}`, p.clause);
  logTransfer(p, me.id, b.id, p.clause, 'multa');
  C.inbox('Mercado', `${b.short} pagou a multa de ${p.name}`, `O ${b.name} depositou ${money(p.clause)} e ${p.name} deixou o clube. Multas baixas deixam o elenco vulnerável.`, 'offer');
  C.addNews(`${b.short} paga multa e tira ${p.name} do ${me.short}`, `Negócio de ${money(p.clause)}.`, 'banknote');
}

// clubes da IA reforçam a posição mais fraca comprando de outros clubes da IA
function aiTransfers(rng) {
  const s = s_();
  const clubs = Object.values(s.clubs).filter(c => c.id !== s.coach.clubId && c.balance > 3);
  rng.shuffle(clubs);
  const wKey = `${s.year}:${s.day < 70 ? 0 : 1}`;
  for (const buyer of clubs.slice(0, 2)) {
    buyer.buys ||= {};
    if ((buyer.buys[wKey] || 0) >= 2) continue; // no máximo 2 reforços por janela
    const sq = C.squadOf(buyer);
    const byPos = {};
    for (const p of sq) (byPos[p.pos] ||= []).push(p);
    const weakest = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].map(pos => ({ pos, best: (byPos[pos] || []).reduce((m, p) => Math.max(m, p.ovr), 0) })).sort((a, b) => a.best - b.best)[0];
    const pool = Object.values(s.players).filter(p => p.club && !p.youth && p.club !== buyer.id && p.club !== s.coach.clubId && !p.loan && !p.precontract && p.pos === weakest.pos && p.ovr >= weakest.best + 3 && p.age <= 31 && p.value * 1.25 <= buyer.balance * 0.6 && p.ovr <= weakest.best + 10);
    if (!pool.length) continue;
    const p = pool.sort((a, b) => b.ovr - a.ovr)[Math.floor(rng.next() * Math.min(3, pool.length))];
    const seller = s.clubs[p.club];
    const sellerBest = C.squadOf(seller).filter(x => x.pos === p.pos).sort((a, b) => b.ovr - a.ovr)[0];
    const fee = round1(p.value * (sellerBest === p ? 1.6 : 1.2));
    if (fee > buyer.balance * 0.7 || seller.squad.length <= 18) continue;
    buyer.buys[wKey] = (buyer.buys[wKey] || 0) + 1;
    C.moveTo(p, buyer.id); buyer.balance -= fee; seller.balance += fee;
    p.wage = wageFor(p); p.contract = rng.int(2, 4); p.clause = round1(p.value * 3);
    logTransfer(p, seller.id, buyer.id, fee);
    if (fee >= 6) C.addNews(`${buyer.short} contrata ${p.name}`, `Negócio de ${money(fee)} com o ${seller.short}.`, 'arrow-left-right');
  }
}

export function seasonEnd() { returnLoans(); }
