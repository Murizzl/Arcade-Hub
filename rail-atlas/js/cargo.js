/* =========================================================
   Cargas — cada estação oferece cargas avulsas. Uma carga é
   um item (ex.: placas de vídeo) que ocupa N vagas no trem e
   paga ao chegar no destino. Existem no estado do jogo e só
   pagam uma vez (status 'delivered' é final).
   ========================================================= */
import { state, DB, emit, nextId, haversine } from './game-state.js';
import { ECONOMY, contractReward, companyXpFor } from './economy.js';
import { stationIds, stationInfo, reachable, hasStation, city } from './cities.js';
import { findRoute } from './railways.js';

const EVENT_CHANCE = 0.05;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function pickRarity() {
  const entries = Object.entries(ECONOMY.rarity);
  let r = Math.random() * entries.reduce((s, [, v]) => s + v.weight, 0);
  for (const [id, v] of entries) { if ((r -= v.weight) <= 0) return id; }
  return 'comum';
}

// Tipo do evento enviado ao Arcade Social (o hub decide o XP real)
export function arcadeKind(c) {
  if (c.rarity === 'especial' || c.cargo === 'especiais') return 'special';
  if (c.international) return 'international';
  if (c.km >= 250) return 'medium';
  return 'common';
}

export function estimateKm(a, b) {
  // distância pela malha comprada, se existir; senão, estimativa geográfica
  const r = findRoute(a, b, 9999);
  return r ? r.km : Math.round(haversine(city(a), city(b)) * 1.25);
}

export function makeContract(originId, opts = {}, now = Date.now()) {
  const o = city(originId);
  let dests = Object.keys(reachable(originId, opts.hops || 5));
  if (!dests.length) return null;
  // na maior parte das vezes o destino já é atendido pela rede (carga aceitável agora)
  const served = dests.filter(hasStation);
  if (served.length && (opts.served || Math.random() < 0.65)) dests = served;
  const destId = opts.dest || pick(dests);
  const d = city(destId);
  const pool = o.produces.filter(c => d.demands.includes(c));
  const cargo = opts.cargo || pick(pool.length && Math.random() < 0.7 ? pool : o.produces);
  const items = DB.cargoById[cargo].items.filter(i => !opts.maxSlots || i.slots <= opts.maxSlots);
  const item = pick(items.length ? items : DB.cargoById[cargo].items);
  let rarity = opts.rarity || pickRarity();
  if (cargo === 'especiais' && rarity === 'comum') rarity = 'incomum';
  const km = estimateKm(originId, destId);
  const international = o.country !== d.country;
  const slots = item.slots;
  const c = {
    id: nextId('ctr'),
    origin: originId, at: originId, dest: destId, cargo, item: item.id, slots, km, rarity, international,
    reward: contractReward({ km, slots, cargo, rarity, international }),
    xp: companyXpFor({ km, slots, rarity, international }),
    deadline: null, // prazo opcional — reservado para cargas de evento
    createdAt: now,
    expiresAt: now + ECONOMY.contractTtlMs * (rarity === 'comum' ? 1 : 1.5),
    status: 'open', trainId: null, tutorial: !!opts.tutorial
  };
  c.arcadeKind = arcadeKind(c);
  state.contracts[c.id] = c;
  return c;
}

// cargas esperando numa estação: as geradas lá e as deixadas no armazém (c.at)
export const contractsAt = cityId => Object.values(state.contracts).filter(c => (c.at || c.origin) === cityId && c.status === 'open');
const freshAt = cityId => contractsAt(cityId).filter(c => !c.stored);
export const activeContracts = () => Object.values(state.contracts).filter(c => c.status === 'in_transit');
export const openContracts = () => Object.values(state.contracts).filter(c => c.status === 'open');

/** Expira cargas velhas e repõe vagas nas estações cujo relógio venceu. */
export function refreshContracts(now = Date.now()) {
  let changed = false;
  for (const c of Object.values(state.contracts)) {
    if (c.status === 'open' && c.expiresAt <= now && !c.tutorial && !c.stored) { c.status = 'expired'; changed = true; }
  }
  // remove histórico antigo para o save não crescer sem limite
  const old = Object.values(state.contracts).filter(c => c.status === 'expired' || c.status === 'delivered')
    .sort((a, b) => (b.doneAt || b.expiresAt) - (a.doneAt || a.expiresAt));
  old.slice(80).forEach(c => { delete state.contracts[c.id]; });

  for (const id of stationIds()) {
    if ((state.nextRefresh[id] || 0) > now) continue;
    const info = stationInfo(id);
    const slots = info.contractSlots;
    let have = freshAt(id).length;
    while (have < slots) { if (!makeContract(id, {}, now)) break; have++; changed = true; }
    // contrato de evento: raro, valioso e com prazo (entregue atrasado, paga metade)
    if (Math.random() < EVENT_CHANCE && !freshAt(id).some(c => c.deadline)) {
      const c = makeContract(id, { rarity: 'especial', served: true }, now);
      if (c) { c.reward *= 2; c.deadline = now + ECONOMY.eventMinutes * 60e3; c.expiresAt = c.deadline; c.event = true; changed = true; }
    }
    state.nextRefresh[id] = now + ECONOMY.refreshMs * info.refreshMult;
  }
  if (changed) emit('contracts');
  return changed;
}

// Existe rota própria entre origem e destino?
export const routable = c => !!findRoute(c.at || c.origin, c.dest, 9999);
export const cargoOf = c => DB.cargoById[c.cargo];
export const itemOf = c => DB.itemById[c.item];
