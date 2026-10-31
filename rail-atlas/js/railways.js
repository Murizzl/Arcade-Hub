/* =========================================================
   Ferrovias — compra de trechos, linhas operacionais e
   cálculo de rotas (Dijkstra) sobre a malha da companhia.
   ========================================================= */
import { state, DB, emit, log, nextId, other } from './game-state.js';
import { segmentCost, spend, fmt } from './economy.js';
import { hasStation, openStation, city } from './cities.js';
import { maxLines } from './progression.js';

export const LINE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#eab308', '#6366f1'];

export const isOwned = linkId => !!state.owned[linkId];
export const ownedLinks = () => DB.links.filter(l => state.owned[l.id]);

export function canBuy(linkId) {
  const l = DB.linkById[linkId];
  if (!l) return { ok: false, reason: 'Trecho inexistente.' };
  if (state.owned[linkId]) return { ok: false, reason: 'Você já possui este trecho.' };
  if (!hasStation(l.a) && !hasStation(l.b)) return { ok: false, reason: 'O trecho precisa partir de uma estação da sua rede.' };
  if (state.company.level < l.minLevel) return { ok: false, reason: `${DB.linkTypes[l.type].name} exige companhia nível ${l.minLevel}.` };
  const cost = segmentCost(l);
  if (state.credits < cost) return { ok: false, reason: `Faltam ${fmt(cost - state.credits)} créditos.`, cost };
  return { ok: true, cost };
}

/** lineChoice: { lineId } para uma linha existente ou { name, color } para criar uma nova */
export function buySegment(linkId, lineChoice, { free = false, now = Date.now() } = {}) {
  const l = DB.linkById[linkId];
  if (!free) {
    const chk = canBuy(linkId);
    if (!chk.ok) return chk;
  } else if (state.owned[linkId]) return { ok: false, reason: 'Já possui.' };

  let line = lineChoice?.lineId && state.lines.find(x => x.id === lineChoice.lineId);
  if (!line) {
    if (state.lines.length >= maxLines()) return { ok: false, reason: `Seu nível permite até ${maxLines()} linhas. Use uma linha existente.` };
    line = createLine(lineChoice?.name, lineChoice?.color);
  }
  const cost = free ? 0 : segmentCost(l);
  if (!free && !spend(cost, 'segment')) return { ok: false, reason: 'Créditos insuficientes.' };
  state.owned[linkId] = { lineId: line.id, boughtAt: now };
  const opened = [l.a, l.b].filter(c => openStation(c, now));
  if (!free) log('route', `Trecho ${city(l.a).name} — ${city(l.b).name} adquirido para a ${line.name} (−${fmt(cost)} cr).${opened.length ? ' Nova estação: ' + opened.map(c => city(c).name).join(', ') + '.' : ''}`, 'success');
  emit('network', { linkId, opened });
  return { ok: true, cost, line, opened };
}

export function createLine(name, color) {
  const n = state.lines.length;
  const line = {
    id: nextId('line'),
    name: (name || '').trim().slice(0, 28) || `Linha ${n + 1}`,
    color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : LINE_COLORS[n % LINE_COLORS.length],
    createdAt: Date.now()
  };
  state.lines.push(line);
  emit('lines', line);
  return line;
}

export function editLine(id, { name, color }) {
  const line = state.lines.find(x => x.id === id); if (!line) return false;
  if (name != null && name.trim()) line.name = name.trim().slice(0, 28);
  if (color && /^#[0-9a-f]{6}$/i.test(color)) line.color = color;
  emit('lines', line);
  return true;
}

export function moveSegment(linkId, lineId) {
  if (!state.owned[linkId] || !state.lines.some(l => l.id === lineId)) return false;
  state.owned[linkId].lineId = lineId;
  emit('lines', null);
  return true;
}

export const lineSegments = lineId => ownedLinks().filter(l => state.owned[l.id].lineId === lineId);
export function lineCities(lineId) {
  const set = new Set();
  lineSegments(lineId).forEach(l => { set.add(l.a); set.add(l.b); });
  return [...set];
}
export const lineOf = linkId => state.lines.find(x => x.id === state.owned[linkId]?.lineId);

// Velocidade efetiva no trecho: limitada pelo trilho
export const edgeHours = (link, speed) => link.km / Math.min(speed, link.speedLimit);

/**
 * Menor tempo entre duas cidades usando apenas trechos próprios.
 * Retorna { path:[cityIds], links:[linkIds], km, hours } ou null.
 */
export function findRoute(from, to, speed) {
  if (from === to) return { path: [from], links: [], km: 0, hours: 0 };
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  const open = [from];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const u = open.splice(bi, 1)[0];
    if (u === to) break;
    if (done.has(u)) continue;
    done.add(u);
    for (const l of DB.adj[u]) {
      if (!state.owned[l.id]) continue;
      const v = other(l, u), d = dist[u] + edgeHours(l, speed);
      if (dist[v] == null || d < dist[v]) { dist[v] = d; prev[v] = { u, l }; open.push(v); }
    }
  }
  if (dist[to] == null) return null;
  const path = [to], links = [];
  let c = to;
  while (c !== from) { links.unshift(prev[c].l.id); c = prev[c].u; path.unshift(c); }
  return { path, links, km: links.reduce((s, id) => s + DB.linkById[id].km, 0), hours: dist[to] };
}

// Tráfego atual por trecho (viagens que ainda passarão por ele)
export function trafficOn(linkId) {
  return Object.values(state.trips).filter(t => t.links.includes(linkId)).length;
}
