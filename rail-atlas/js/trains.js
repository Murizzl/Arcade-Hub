/* =========================================================
   Locomotivas e viagens. O jogador carrega várias cargas na
   estação onde o trem está (até encher as vagas) e escolhe as
   paradas. Cada carga é entregue na primeira vez que o trem
   passa pelo destino dela. A viagem é uma linha do tempo
   calculada pela distância, velocidade e limite dos trilhos;
   as chegadas são processadas pelo relógio, mesmo com o jogo fechado.
   ========================================================= */
import { state, DB, emit, log, nextId } from './game-state.js';
import { ECONOMY, tripCost, spend, earn, fmt } from './economy.js';
import { findRoute, edgeHours, trafficOn } from './railways.js';
import { city, openStation, stationInfo } from './cities.js';
import { addCompanyXp, maxTrains } from './progression.js';
import { itemOf } from './cargo.js';
import { ArcadeIntegration } from './arcade-integration.js';
import { randomDriver } from './sprites.js';

const DRIVER_NAMES = ['Bia Ferreira', 'Caio Trilho', 'Duda Santos', 'Edu Moreira', 'Fê Lima', 'Gabi Rocha', 'Hugo Prado', 'Íris Campos', 'Juca Vilela', 'Lia Nunes', 'Mário Brito', 'Nina Couto', 'Otto Ramos', 'Paula Reis', 'Rafa Costa', 'Sol Andrade'];

export const modelOf = t => DB.modelById[t.model];
export const trainById = id => state.trains.find(t => t.id === id);
export const driverOf = t => state.drivers.find(d => d.id === t.driverId);
// Cargas que continuam no trem depois de uma viagem (destino ainda não visitado)
export const aboardOf = t => Object.values(state.contracts).filter(c => c.status === 'aboard' && c.trainId === t.id);

export function addTrain(modelId, at, { name, driverId } = {}) {
  const m = DB.modelById[modelId];
  const n = state.trains.length + 1;
  const t = {
    id: nextId('trn'), model: modelId,
    name: name || `${m.name} ${String(n).padStart(2, '0')}`,
    body: m.body, trim: m.trim,
    at, status: 'idle', tripId: null,
    condition: 100, upgrade: 0, driverId: driverId || null,
    lineId: null, mode: 'manual', // 'manual' | 'semi' | 'auto' (fase 3)
    stats: { trips: 0, km: 0, earned: 0 }
  };
  state.trains.push(t);
  emit('trains', t);
  return t;
}

export function buyTrain(modelId, at) {
  const m = DB.modelById[modelId];
  if (!m) return { ok: false, reason: 'Modelo inexistente.' };
  if (state.company.level < m.unlockLevel) return { ok: false, reason: `Disponível no nível ${m.unlockLevel}.` };
  if (state.trains.length >= maxTrains()) return { ok: false, reason: `Seu nível permite até ${maxTrains()} locomotivas.` };
  if (!state.stations[at]) return { ok: false, reason: 'Escolha uma estação da sua rede.' };
  if (!spend(m.price, 'train')) return { ok: false, reason: `Faltam ${fmt(m.price - state.credits)} créditos.` };
  const t = addTrain(modelId, at);
  t.driverId = hireDriver().id; // toda locomotiva nova vem com maquinista
  log('train-front', `Nova locomotiva ${t.name} entregue em ${city(at).name} (−${fmt(m.price)} cr).`, 'success');
  return { ok: true, train: t };
}

// Desgaste: locomotiva gasta anda mais devagar (até −30% com 0% de condição)
export const effectiveSpeed = t => Math.round(modelOf(t).speed * (0.7 + 0.3 * t.condition / 100) * (1 + driverBonus(t) * 0.005));
const dwellAt = id => ECONOMY.dwellSeconds * (stationInfo(id)?.dwellMult ?? 1);
const linkCap = l => l.capacity + Math.max(stationInfo(l.a)?.yard || 0, stationInfo(l.b)?.yard || 0);

/** Reparo na oficina da estação onde o trem está parado. */
export function repairQuote(t) {
  const w = stationInfo(t.at)?.workshop;
  if (w == null) return { ok: false, reason: 'Esta estação não tem oficina.' };
  if (t.status !== 'idle') return { ok: false, reason: 'Locomotiva em viagem.' };
  const wear = 100 - t.condition;
  if (wear < 1) return { ok: false, reason: 'Locomotiva em perfeito estado.' };
  const rate = 2 + modelOf(t).price / 4000;
  return { ok: true, cost: Math.max(5, Math.round(wear * rate * (1 - w))) };
}
export function repairTrain(id) {
  const t = trainById(id), q = t && repairQuote(t);
  if (!q?.ok) return q || { ok: false, reason: 'Locomotiva inexistente.' };
  if (!spend(q.cost, 'repair')) return { ok: false, reason: `Reparo custa ${fmt(q.cost)} cr.` };
  t.condition = 100;
  log('wrench', `${t.name} revisada na oficina de ${city(t.at).name} (−${fmt(q.cost)} cr).`, 'success');
  emit('trains', t);
  return { ok: true, cost: q.cost };
}

// ---------- Maquinistas ----------
export function hireDriver(name) {
  const used = new Set(state.drivers.map(d => d.name));
  const d = { id: nextId('drv'), ...randomDriver(name || DRIVER_NAMES.find(n => !used.has(n)) || `Maquinista ${state.drivers.length + 1}`) };
  state.drivers.push(d);
  emit('drivers', d);
  return d;
}
export function editDriver(id, data) {
  const d = state.drivers.find(x => x.id === id); if (!d) return false;
  ['skin', 'hair', 'hairColor', 'hat', 'uniformColor', 'accessory'].forEach(k => { if (data[k] != null) d[k] = data[k]; });
  if ('photo' in data) d.photo = data.photo || null; // foto enviada pelo jogador (já reduzida)
  if (data.name && data.name.trim()) d.name = data.name.trim().slice(0, 22);
  emit('drivers', d);
  return true;
}
/** Troca o maquinista de locomotiva (quem estava nela fica livre). Só com o trem parado. */
export function assignDriver(driverId, trainId) {
  const t = trainById(trainId); if (!t || t.status !== 'idle') return { ok: false, reason: 'A locomotiva precisa estar parada.' };
  const prev = state.trains.find(x => x.driverId === driverId);
  if (prev && prev.status !== 'idle') return { ok: false, reason: 'Esse maquinista está em viagem.' };
  if (prev) prev.driverId = null;
  t.driverId = driverId;
  emit('trains', t);
  return { ok: true };
}
// Bônus de experiência: +0,5% de velocidade e −1% de combustível por nível (até o nível 10)
export const driverBonus = t => Math.min(10, (driverOf(t)?.level || 1) - 1);

export function customizeTrain(id, { name, body, trim }) {
  const t = trainById(id); if (!t) return false;
  if (name && name.trim()) t.name = name.trim().slice(0, 24);
  if (/^#[0-9a-f]{6}$/i.test(body || '')) t.body = body;
  if (/^#[0-9a-f]{6}$/i.test(trim || '')) t.trim = trim;
  emit('trains', t);
  return true;
}

/** Ordena destinos pelo vizinho mais próximo (rota automática "trajeto completo"). */
export function autoWaypoints(from, dests, speed) {
  const left = [...new Set(dests)].filter(d => d !== from), out = [];
  let cur = from;
  while (left.length) {
    let best = -1, bh = Infinity;
    left.forEach((d, i) => { const r = findRoute(cur, d, speed); if (r && r.hours < bh) { bh = r.hours; best = i; } });
    if (best < 0) break;
    cur = left.splice(best, 1)[0];
    out.push(cur);
  }
  return out;
}

/**
 * Simula a viagem sem alterar nada (tela de planejamento e despacho).
 * contractIds: cargas a carregar na estação atual do trem.
 * waypoints: paradas na ordem; vazio = trajeto completo automático.
 */
export function planTrip(trainId, contractIds = [], waypoints = [], { storeRest = false } = {}) {
  const t = trainById(trainId);
  if (!t) return { ok: false, reason: 'Locomotiva inexistente.' };
  const m = modelOf(t);
  if (t.status !== 'idle') return { ok: false, reason: 'Locomotiva em viagem.' };
  if (!driverOf(t)) return { ok: false, reason: 'Locomotiva sem maquinista. Escale alguém em Maquinistas.' };
  const aboard = aboardOf(t), aboardIds = new Set(aboard.map(c => c.id));
  const loading = contractIds.filter(id => !aboardIds.has(id)).map(id => state.contracts[id]);
  if (loading.some(c => !c || c.status !== 'open')) return { ok: false, reason: 'Alguma carga não está mais disponível.' };
  if (loading.some(c => (c.at || c.origin) !== t.at)) return { ok: false, reason: 'Só dá para carregar cargas da estação onde o trem está.' };
  const cs = [...aboard, ...loading]; // o que já está no trem sempre viaja junto
  const used = cs.reduce((s, c) => s + c.slots, 0);
  if (used > m.slots) return { ok: false, reason: `Cargas ocupam ${used} vagas; o trem tem ${m.slots}.`, used };
  const speed = effectiveSpeed(t);
  const wps = waypoints.length ? waypoints : autoWaypoints(t.at, cs.map(c => c.dest), speed);
  if (!wps.length) return { ok: false, reason: cs.length ? 'Sem rota para os destinos.' : 'Escolha cargas ou um destino.', used };

  // caminho completo: trem.at → parada 1 → parada 2 …
  const path = [t.at], links = [];
  let hours = 0, km = 0, cur = t.at;
  for (const wp of wps) {
    const r = findRoute(cur, wp, speed);
    if (!r) return { ok: false, reason: `Sem trilhos entre ${city(cur).name} e ${city(wp).name}.`, used };
    path.push(...r.path.slice(1)); links.push(...r.links);
    hours += r.hours; km += r.km; cur = wp;
  }
  // cada carga sai na primeira passagem pelo destino; as demais seguem a bordo
  // (ou, se pedido, ficam no armazém da última parada para outro trem levar)
  const deliverAt = {}, store = [], keep = [];
  const last = path[path.length - 1];
  for (const c of cs) {
    const i = path.indexOf(c.dest, 1);
    if (i >= 0) { deliverAt[c.id] = i; continue; }
    (storeRest ? store : keep).push(c);
  }
  if (store.length) {
    const info = stationInfo(last);
    if (!info) return { ok: false, reason: `${city(last).name} não tem estação para guardar cargas.`, used };
    const need = store.reduce((a, c) => a + c.slots, 0);
    if (info.stored + need > info.storage) return { ok: false, reason: `Armazém de ${city(last).name} cheio (${info.stored}/${info.storage} vagas; precisa de ${need}).`, used };
  }
  const stopsWithDrop = new Set(Object.values(deliverAt));
  if (store.length) stopsWithDrop.add(path.length - 1);
  const jam = links.reduce((s, id) => s + Math.max(0, trafficOn(id) + 1 - linkCap(DB.linkById[id])), 0);
  const slow = 1 + jam * 0.15;
  const secs = hours * ECONOMY.secondsPerGameHour * slow + (loading.length ? dwellAt(t.at) : 0) + [...stopsWithDrop].reduce((a, i) => a + dwellAt(path[i]), 0);
  const discount = stationInfo(t.at)?.fuelDiscount || 0;
  const cost = Math.round(tripCost(m, km) * (1 - discount) * (1 - driverBonus(t) * 0.01));
  const revenue = cs.filter(c => deliverAt[c.id] != null).reduce((s, c) => s + c.reward, 0);
  return { ok: true, train: t, model: m, speed, contracts: cs, loading, aboard, keep, store, waypoints: wps, path, links, km, secs, cost, discount, revenue, profit: revenue - cost, used, jam, slow, deliverAt };
}

export function dispatch(trainId, contractIds, waypoints, now = Date.now(), opts = {}) {
  const p = planTrip(trainId, contractIds, waypoints, opts);
  if (!p.ok) return p;
  const { train: t, model: m, path, contracts: cs } = p;
  const dwell = id => dwellAt(id) * 1000;
  const sph = ECONOMY.secondsPerGameHour * 1000 * p.slow;

  // Linha do tempo: [{ city, t, drop:[ids] }]. Paradas com entrega ganham uma
  // segunda entrada na mesma cidade (o trem fica parado descarregando).
  const drops = {};
  cs.forEach(c => { if (p.deliverAt[c.id] != null) (drops[p.deliverAt[c.id]] ||= []).push(c.id); });
  const lastI = path.length - 1;
  let clock = now;
  const stops = [{ city: path[0], t: clock }];
  if (p.loading.length) { clock += dwell(path[0]); stops.push({ city: path[0], t: clock, loading: true }); }
  for (let i = 1; i < path.length; i++) {
    clock += edgeHours(DB.linkById[p.links[i - 1]], p.speed) * sph;
    const store = i === lastI && p.store.length ? p.store.map(c => c.id) : null;
    stops.push({ city: path[i], t: clock, drop: drops[i] || null, store });
    if (drops[i] || store) { clock += dwell(path[i]); stops.push({ city: path[i], t: clock, unloading: true }); }
  }
  const trip = {
    id: nextId('trip'), trainId: t.id, contractIds: cs.map(c => c.id),
    stops, links: p.links, km: p.km, cost: p.cost,
    startAt: now, arriveAt: clock, dest: path[path.length - 1]
  };
  state.trips[trip.id] = trip;
  t.status = 'moving'; t.tripId = trip.id;
  cs.forEach(c => { c.status = 'in_transit'; c.trainId = t.id; c.tripId = trip.id; c.at = null; });
  log('train-front', cs.length
    ? `${t.name} partiu de ${city(path[0]).name} com ${cs.length} carga(s) (${p.used}/${m.slots} vagas) rumo a ${city(trip.dest).name}.`
    : `${t.name} seguiu vazio para ${city(trip.dest).name}.`);
  emit('trips', trip);
  return { ok: true, trip };
}

// Relatório por hora (últimas 48 horas)
export function record(at, field, amount) {
  const h = Math.floor(at / 3600e3), R = state.reports.hourly;
  (R[h] ||= { revenue: 0, cost: 0, deliveries: 0 })[field] += amount;
  Object.keys(R).filter(k => k < h - 48).forEach(k => delete R[k]);
}

function deliver(c, trip, t, at) {
  // contratos de evento entregues fora do prazo pagam metade
  if (c.deadline && at > c.deadline && !c.late) { c.late = true; c.reward = Math.round(c.reward / 2); }
  if (c.deadline && !c.late) state.stats.onTime++;
  c.status = 'delivered'; c.doneAt = at; c.at = c.dest; c.stored = false;
  earn(c.reward, 'delivery');
  addCompanyXp(c.xp);
  const s = state.stats;
  s.deliveries++; s.tons += c.slots; if (c.international) s.international++;
  if (c.arcadeKind === 'special') s.special++;
  trip.revenue = (trip.revenue || 0) + c.reward;
  record(at, 'revenue', c.reward); record(at, 'deliveries', 1);
  (s.byCity[c.dest] ||= { in: 0, out: 0, revenue: 0 }).in++;
  (s.byCity[c.origin] ||= { in: 0, out: 0, revenue: 0 }).out++;
  s.byCity[c.origin].revenue += c.reward;
  if (t) t.stats.earned += c.reward;
  openStation(c.dest, at);
  if (state.tutorial.step === 3) state.tutorial.step = 4;
  if (ArcadeIntegration.reportEvent({ eventType: 'cargo_delivered', gameId: 'rail-atlas', contractId: c.id, kind: c.arcadeKind, at })) state.arcade.reported++;
  log('package-check', `${itemOf(c).name} entregue em ${city(c.dest).name}: +${fmt(c.reward)} cr, +${c.xp} XP.`, 'success');
}

/**
 * Processa entregas e chegadas cujo horário já passou, em ordem cronológica.
 * Retorna as entregas feitas: [{ contract, trip, train }].
 */
export function processArrivals(now = Date.now()) {
  const events = [];
  for (const trip of Object.values(state.trips)) {
    trip.stops.forEach(st => { if ((st.drop || st.store) && !st.done && st.t <= now) events.push({ t: st.t, trip, st }); });
    if (trip.arriveAt <= now) events.push({ t: trip.arriveAt + 0.5, trip, end: true });
  }
  events.sort((a, b) => a.t - b.t);
  const done = [];
  for (const ev of events) {
    const { trip } = ev, t = trainById(trip.trainId);
    if (ev.end) {
      delete state.trips[trip.id];
      if (t) {
        t.status = 'idle'; t.tripId = null; t.at = trip.dest;
        // o que não foi entregue nem guardado continua no trem
        trip.contractIds.forEach(id => { const c = state.contracts[id]; if (c?.status === 'in_transit') Object.assign(c, { status: 'aboard', tripId: null, at: null }); });
        t.condition = Math.max(25, t.condition - 0.6 - trip.km / 100);
        t.stats.trips++; t.stats.km += trip.km; t.stats.earned -= trip.cost;
        const d = driverOf(t);
        if (d) { d.xp += Math.round(trip.km / 10); while (d.xp >= d.level * 150) { d.xp -= d.level * 150; d.level++; } }
      }
      state.stats.km += trip.km;
      // custo operacional sai no fim da viagem (o saldo nunca fica negativo)
      spend(Math.min(trip.cost, state.credits), 'operation');
      record(trip.arriveAt, 'cost', trip.cost);
      // lucro por linha: receita e custo divididos pelos km percorridos em cada linha
      const byLine = {};
      trip.links.forEach(id => { const ln = state.owned[id]?.lineId; if (ln) byLine[ln] = (byLine[ln] || 0) + DB.linkById[id].km; });
      Object.entries(byLine).forEach(([ln, km]) => {
        const r = state.reports.lines[ln] ||= { revenue: 0, cost: 0, trips: 0 }, k = km / (trip.km || 1);
        r.revenue += (trip.revenue || 0) * k; r.cost += trip.cost * k; r.trips++;
      });
      openStation(trip.dest, trip.arriveAt);
      continue;
    }
    ev.st.done = true; // marca antes de pagar: a recompensa nunca é creditada duas vezes
    // baldeação: a carga fica no armazém esperando outro trem (sem prazo de validade)
    for (const id of ev.st.store || []) {
      const c = state.contracts[id];
      if (!c || c.status !== 'in_transit') continue;
      Object.assign(c, { status: 'open', at: ev.st.city, stored: true, trainId: null, tripId: null });
      state.stats.transfers++;
      log('warehouse', `${itemOf(c).name} guardada no armazém de ${city(ev.st.city).name} (vai para ${city(c.dest).name}).`);
      emit('contracts');
    }
    for (const id of ev.st.drop || []) {
      const c = state.contracts[id];
      if (!c || c.status !== 'in_transit') continue;
      deliver(c, trip, t, ev.t);
      done.push({ contract: c, trip, train: t });
      emit('delivered', { contract: c, trip, train: t });
    }
  }
  if (events.length) emit('trips');
  return done;
}

/** Posição do trem no instante `now`: { lon, lat, moving, stage } */
export function trainPosition(t, now = Date.now()) {
  const trip = t.tripId && state.trips[t.tripId];
  const c0 = city(t.at);
  if (!trip) return { lon: c0.lon, lat: c0.lat, moving: false };
  const st = trip.stops;
  if (now <= st[0].t) return { lon: city(st[0].city).lon, lat: city(st[0].city).lat, moving: false, stage: 'Preparando' };
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    if (now > b.t) continue;
    const A = city(a.city), B = city(b.city);
    if (a.city === b.city) return { lon: B.lon, lat: B.lat, moving: false, stage: b.unloading ? `Descarregando em ${B.name}` : 'Carregando', from: A, to: B };
    const k = (now - a.t) / (b.t - a.t);
    const aboard = trip.contractIds.filter(id => state.contracts[id]?.status === 'in_transit').length;
    return { lon: A.lon + (B.lon - A.lon) * k, lat: A.lat + (B.lat - A.lat) * k, moving: true, from: A, to: B, loaded: aboard > 0, stage: aboard ? `A caminho de ${B.name} · ${aboard} carga(s)` : `Seguindo para ${city(trip.dest).name}` };
  }
  const L = city(st[st.length - 1].city);
  return { lon: L.lon, lat: L.lat, moving: false, stage: 'Chegou' };
}

export const tripProgress = (trip, now = Date.now()) => Math.max(0, Math.min(1, (now - trip.startAt) / (trip.arriveAt - trip.startAt)));
