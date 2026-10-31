/* =========================================================
   Cidades e estações. Uma cidade ganha estação quando um
   trecho da companhia chega até ela. Cada estação tem
   melhorias (data/station-upgrades.json) com efeitos reais.
   ========================================================= */
import { state, DB, emit, log } from './game-state.js';
import { spend, fmt } from './economy.js';

export const hasStation = id => !!state.stations[id];

export function openStation(id, now = Date.now()) {
  if (state.stations[id]) return false;
  state.stations[id] = { level: 1, openedAt: now, upgrades: {} };
  state.nextRefresh[id] = now; // gera cargas imediatamente
  return true;
}

export const upgradeLevel = (id, key) => state.stations[id]?.upgrades?.[key] || 0;
const effect = (id, key) => DB.upgrades[key].levels[upgradeLevel(id, key)].value;

export function stationInfo(id) {
  const st = state.stations[id];
  if (!st) return null;
  const total = Object.values(st.upgrades || {}).reduce((s, n) => s + n, 0);
  return {
    ...st,
    level: 1 + Math.floor(total / 3),
    storage: effect(id, 'armazem'),
    stored: storedSlots(id),
    contractSlots: effect(id, 'escritorio'),
    refreshMult: 1 - upgradeLevel(id, 'escritorio') * 0.12,
    dwellMult: effect(id, 'plataforma'),
    fuelDiscount: effect(id, 'posto'),
    workshop: effect(id, 'oficina'), // null = sem oficina
    yard: effect(id, 'patio')
  };
}

// Vagas ocupadas por cargas deixadas no armazém (baldeação)
export function storedSlots(id) {
  return Object.values(state.contracts).filter(c => c.stored && c.status === 'open' && c.at === id).reduce((s, c) => s + c.slots, 0);
}

export function upgradeCost(id, key) {
  const next = DB.upgrades[key].levels[upgradeLevel(id, key) + 1];
  return next ? next.cost : null;
}

export function canUpgrade(id, key) {
  if (!state.stations[id]) return { ok: false, reason: 'Sem estação aqui.' };
  const lvl = upgradeLevel(id, key), next = DB.upgrades[key].levels[lvl + 1];
  if (!next) return { ok: false, reason: 'Nível máximo.' };
  if (state.company.level < lvl + 1) return { ok: false, reason: `Exige companhia nível ${lvl + 1}.` };
  if (state.credits < next.cost) return { ok: false, reason: `Faltam ${fmt(next.cost - state.credits)} créditos.`, cost: next.cost };
  return { ok: true, cost: next.cost };
}

export function buyUpgrade(id, key) {
  const chk = canUpgrade(id, key);
  if (!chk.ok) return chk;
  if (!spend(chk.cost, 'upgrade')) return { ok: false, reason: 'Créditos insuficientes.' };
  const ups = state.stations[id].upgrades ||= {};
  ups[key] = (ups[key] || 0) + 1;
  state.stations[id].level = stationInfo(id).level;
  log('hammer', `${DB.upgrades[key].name} de ${city(id).name} chegou ao nível ${ups[key]} (−${fmt(chk.cost)} cr).`, 'success');
  emit('stations', { id, key });
  return { ok: true, level: ups[key] };
}

export const city = id => DB.cityById[id];
export const stationIds = () => Object.keys(state.stations);

export function cityStatus(id) {
  if (state.stations[id]) return 'station';
  // vizinha da rede: pode ser conectada com um único trecho
  if (DB.adj[id].some(l => state.stations[l.a] || state.stations[l.b])) return 'frontier';
  return 'locked';
}

// Cidades a até `maxHops` trechos (malha completa, comprada ou não)
export function reachable(fromId, maxHops) {
  const seen = { [fromId]: 0 }, q = [fromId];
  while (q.length) {
    const c = q.shift();
    if (seen[c] >= maxHops) continue;
    DB.adj[c].forEach(l => {
      const o = l.a === c ? l.b : l.a;
      if (seen[o] == null) { seen[o] = seen[c] + 1; q.push(o); }
    });
  }
  delete seen[fromId];
  return seen;
}

export const trainsAt = id => state.trains.filter(t => t.status === 'idle' && t.at === id);
