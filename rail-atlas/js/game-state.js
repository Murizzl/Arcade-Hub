/* =========================================================
   Estado do jogo + banco de dados estático (cidades, trechos,
   cargas e locomotivas carregados de /data).
   A lógica nunca toca no DOM: as telas assinam eventos.
   ========================================================= */

export const SAVE_VERSION = 4;

// Dados de configuração (somente leitura depois de carregados)
export const DB = {
  cities: [], cityById: {},
  links: [], linkById: {}, adj: {},
  linkTypes: {},
  cargo: [], cargoById: {}, itemById: {},
  models: [], modelById: {},
  upgrades: {}, achievements: []
};

const R = 6371;
const rad = d => d * Math.PI / 180;
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Ferrovias não são linha reta: fator de traçado sobre a distância geodésica
const TRACK_FACTOR = 1.18;

export async function loadData(base = 'data/') {
  const get = f => fetch(base + f).then(r => { if (!r.ok) throw new Error(f + ': ' + r.status); return r.json(); });
  const [cities, conn, cargo, models, ups] = await Promise.all([
    get('cities.json'), get('connections.json'), get('cargo-types.json'), get('train-models.json'), get('station-upgrades.json')
  ]);
  DB.upgrades = ups.upgrades;
  DB.achievements = await get('achievements.json');
  DB.cities = cities;
  cities.forEach(c => { c.size ||= 3; DB.cityById[c.id] = c; DB.adj[c.id] = []; });
  DB.linkTypes = conn.types;
  DB.links = conn.links.map(([a, b, type = 'standard']) => {
    const ca = DB.cityById[a], cb = DB.cityById[b];
    if (!ca || !cb) throw new Error(`Trecho inválido: ${a} — ${b}`);
    const id = [a, b].sort().join('~');
    const t = DB.linkTypes[type];
    const link = {
      id, a, b, type,
      km: Math.round(haversine(ca, cb) * TRACK_FACTOR),
      speedLimit: t.speedLimit, capacity: t.capacity, minLevel: t.minLevel,
      international: ca.country !== cb.country
    };
    DB.linkById[id] = link;
    DB.adj[a].push(link); DB.adj[b].push(link);
    return link;
  });
  DB.cargo = cargo; cargo.forEach(c => { DB.cargoById[c.id] = c; c.items.forEach(i => { DB.itemById[i.id] = { ...i, cargo: c.id }; }); });
  DB.models = models; models.forEach(m => { DB.modelById[m.id] = m; });
}

export const other = (link, cityId) => link.a === cityId ? link.b : link.a;

// ---------- Estado mutável da partida ----------
export let state = null;
export function setState(s) { state = s; }

export function nextId(kind) {
  state.counters[kind] = (state.counters[kind] || 0) + 1;
  return `${kind}_${state.counters[kind].toString(36)}_${state.seed}`;
}

export function freshState({ companyName, color, homeCityId, now = Date.now() }) {
  return {
    v: SAVE_VERSION,
    seed: Math.random().toString(36).slice(2, 8),
    createdAt: now,
    lastUpdate: now,
    company: { name: companyName, color, level: 1, xp: 0, home: homeCityId },
    credits: 0,
    stations: {},       // cityId -> { level, openedAt }
    owned: {},          // linkId -> { lineId, boughtAt }
    lines: [],          // { id, name, color }
    trains: [],
    drivers: [],
    contracts: {},      // id -> contrato
    trips: {},          // id -> viagem em andamento
    stats: { deliveries: 0, tons: 0, earned: 0, spent: 0, km: 0, international: 0, special: 0, transfers: 0, onTime: 0, byCity: {} },
    reports: { hourly: {}, lines: {} }, // receita/custo por hora e lucro por linha
    achievements: {},   // id -> timestamp
    counters: {},
    log: [],            // avisos operacionais (mais novo primeiro)
    tutorial: { step: 0, done: false },
    nextRefresh: {},    // cityId -> timestamp da próxima geração de contratos
    arcade: { reported: 0 }
  };
}

// ---------- Eventos ----------
const listeners = {};
export function on(type, fn) { (listeners[type] ||= new Set()).add(fn); return () => listeners[type].delete(fn); }
export function emit(type, payload) {
  listeners[type]?.forEach(fn => fn(payload));
  if (type !== '*') listeners['*']?.forEach(fn => fn({ type, payload }));
}

export function log(icon, text, kind = 'info') {
  state.log.unshift({ t: Date.now(), icon, text, kind });
  state.log = state.log.slice(0, 60);
  emit('log', state.log[0]);
}
