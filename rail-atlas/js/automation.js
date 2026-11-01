/* =========================================================
   Automação de despacho. Cada locomotiva tem um modo:
   - manual: o jogador planeja cada viagem;
   - semi (rota fixa): percorre sempre as mesmas paradas, ida e
     volta, levando as cargas cujo destino está no caminho;
   - auto: escolhe sozinha as cargas mais lucrativas da estação
     onde está e faz o trajeto completo.
   Regras opcionais: ficar numa linha, lucro mínimo, voltar à
   base sem carga e revisão automática na oficina.
   ========================================================= */
import { state, emit, log } from './game-state.js';
import { planTrip, dispatch, modelOf, repairQuote, repairTrain, trainById, aboardOf } from './trains.js';
import { contractsAt, routable } from './cargo.js';
import { lineCities } from './railways.js';
import { findRoute } from './railways.js';
import { city } from './cities.js';

export const MODES = { manual: 'Manual', semi: 'Rota fixa', auto: 'Automático' };
export const MODE_LEVEL = { manual: 1, semi: 2, auto: 3 }; // nível da companhia exigido

export const defaultAuto = () => ({ route: [], lineId: null, minProfit: 0, returnHome: true, base: state.company.home, autoRepair: true });

export function setMode(trainId, mode, cfg = {}) {
  const t = trainById(trainId);
  if (!t || !MODES[mode]) return { ok: false, reason: 'Modo inválido.' };
  if (state.company.level < MODE_LEVEL[mode]) return { ok: false, reason: `${MODES[mode]} libera no nível ${MODE_LEVEL[mode]}.` };
  t.auto = { ...defaultAuto(), ...t.auto, ...cfg };
  if (mode === 'semi' && !t.auto.route.length) return { ok: false, reason: 'Defina as paradas da rota fixa.' };
  t.mode = mode;
  emit('trains', t);
  return { ok: true };
}

/** Escolhe cargas por valor/vaga até encher o trem (opcionalmente só para certos destinos). */
export function bestLoadFor(train, allow) {
  const cap = modelOf(train).slots - aboardOf(train).reduce((s, c) => s + c.slots, 0);
  const pool = contractsAt(train.at).filter(c => routable(c) && (!allow || allow(c))).sort((a, b) => b.reward / b.slots - a.reward / a.slots);
  const ids = []; let used = 0;
  for (const c of pool) if (used + c.slots <= cap) { ids.push(c.id); used += c.slots; }
  return ids;
}

// Rota fixa: [início, ...paradas]; no fim, volta pelo mesmo caminho
function fixedLeg(t) {
  const loop = [t.auto.start || t.at, ...t.auto.route];
  const i = loop.indexOf(t.at);
  if (i === 0) return loop.slice(1);
  if (i === loop.length - 1) return loop.slice(0, -1).reverse();
  return i > 0 ? loop.slice(i + 1) : [loop[0]];
}

function runOne(t, now) {
  const a = t.auto || defaultAuto();
  if (a.autoRepair && t.condition < 55 && repairQuote(t).ok && state.credits > 500) repairTrain(t.id);
  if (t.mode === 'semi') {
    const wps = fixedLeg(t);
    const base = wps.length && planTrip(t.id, [], wps);
    if (!base?.ok) return false;
    const ids = bestLoadFor(t, c => base.path.indexOf(c.dest, 1) >= 0);
    if (!ids.length && !aboardOf(t).length) return false; // espera aparecer carga para o trecho
    const p = planTrip(t.id, ids, wps);
    return p.ok && p.profit >= a.minProfit && dispatch(t.id, ids, wps, now).ok;
  }
  // automático
  const allowed = a.lineId ? new Set(lineCities(a.lineId)) : null;
  const ids = bestLoadFor(t, allowed ? c => allowed.has(c.dest) : null);
  if (ids.length || aboardOf(t).length) {
    const p = planTrip(t.id, ids, []);
    if (p.ok && p.profit >= a.minProfit) return dispatch(t.id, ids, [], now).ok;
  }
  // sem carga boa: volta para a base (uma vez), onde costuma haver mais carga
  if (a.returnHome && a.base && t.at !== a.base && !ids.length && t.lastAuto !== 'home' && findRoute(t.at, a.base, 9999)) {
    const r = dispatch(t.id, [], [a.base], now);
    if (r.ok) { t.lastAuto = 'home'; log('bot', `${t.name} voltou para a base em ${city(a.base).name} por falta de carga.`); return true; }
  }
  return false;
}

/** Chamado a cada ciclo (e na simulação offline): despacha locomotivas automáticas ociosas. */
export function runAutomation(now = Date.now()) {
  let n = 0;
  for (const t of state.trains) {
    if (t.mode === 'manual' || t.status !== 'idle') continue;
    if (t.at === t.auto?.base) t.lastAuto = null;
    if (runOne(t, now)) n++;
  }
  return n;
}
