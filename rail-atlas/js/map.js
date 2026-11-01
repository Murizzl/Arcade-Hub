/* =========================================================
   Mapa-múndi em SVG: países, malha ferroviária, cidades e
   trens animados. Zoom (roda, botões, pinça) e arrastar.
   Só desenha — quem decide o que acontece é o main.js.
   ========================================================= */
import { state, DB } from './game-state.js';
import { cityStatus } from './cities.js';
import { lineOf } from './railways.js';
import { contractsAt } from './cargo.js';
import { trainPosition, modelOf } from './trains.js';

const W = 2000, H = 1000;
export const project = (lon, lat) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
// Litoral em alta resolução só onde a malha é densa (América do Sul), carregado depois
const LAND_HD_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json';
const HD_IDS = ['076', '032', '858', '600', '152', '068', '604'];

// ---------- TopoJSON → caminhos SVG (sem dependências) ----------
function topoToPaths(topo, objectName, only) {
  const { scale, translate } = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * scale[0] + translate[0], y * scale[1] + translate[1]]; });
  });
  const ring = idxs => {
    const pts = [];
    idxs.forEach(i => {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      a.forEach((p, k) => { if (k > 0 || !pts.length) pts.push(p); });
    });
    return pts;
  };
  const ringD = pts => {
    let d = '', prev = null;
    for (const [lon, lat] of pts) {
      const [x, y] = project(lon, lat);
      d += (!prev || Math.abs(lon - prev) > 180 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
      prev = lon;
    }
    return d + 'Z';
  };
  return topo.objects[objectName].geometries
    .filter(g => g.id !== '010' && g.arcs && (!only || only.includes(g.id))) // sem Antártida
    .map(g => {
      const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
      return { id: g.id, name: g.properties?.name, d: polys.map(p => p.map(r => ringD(ring(r))).join('')).join('') };
    });
}

export function createMap(svg, handlers = {}) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <radialGradient id="ocean" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#11233d"/><stop offset="1" stop-color="#081322"/></radialGradient>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#1a3150" stroke-width=".6"/></pattern>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>`;
  el('rect', { x: -W, y: -H, width: W * 3, height: H * 3, fill: 'url(#ocean)' }, svg);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#grid)', opacity: .7 }, svg);
  const gLand = el('g', { class: 'land' }, svg);
  const gRails = el('g', { class: 'rails' }, svg);
  const gCities = el('g', { class: 'cities' }, svg);
  const gFx = el('g', { class: 'fx' }, svg);
  const gTrains = el('g', { class: 'trains' }, svg);

  // ---------- Câmera ----------
  const view = { x: 0, y: 80, w: W, h: H * 0.78 };
  const minW = 1.2, maxW = W * 1.1; // minW: ~0,2° de largura (municípios vizinhos)
  let unitPerPx = 1;
  function applyView() {
    const r = svg.getBoundingClientRect();
    const aspect = (r.width || 1) / (r.height || 1);
    view.h = view.w / aspect;
    view.x = Math.max(-W * 0.05, Math.min(W * 1.05 - view.w, view.x));
    view.y = Math.max(-H * 0.05, Math.min(H * 1.02 - view.h, view.y));
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    unitPerPx = view.w / (r.width || 1);
    // camadas de rótulos: cidades grandes sempre; médias e pequenas conforme o zoom
    svg.classList.toggle('zoom-far', unitPerPx > 0.6);
    svg.classList.toggle('zoom-mid', unitPerPx < 0.06);
    svg.classList.toggle('zoom-near', unitPerPx < 0.018);
    scaleMarkers();
  }
  function toWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return [view.x + (clientX - r.left) / r.width * view.w, view.y + (clientY - r.top) / r.height * view.h];
  }
  function zoomAt(factor, clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2, cy = clientY ?? r.top + r.height / 2;
    const [wx, wy] = toWorld(cx, cy);
    const nw = Math.max(minW, Math.min(maxW, view.w * factor));
    const k = nw / view.w;
    view.x = wx - (wx - view.x) * k;
    view.y = wy - (wy - view.y) * k;
    view.w = nw;
    applyView();
  }
  let anim = null;
  function focus(lon, lat, width = 320, animate = true) {
    const [x, y] = project(lon, lat);
    const r = svg.getBoundingClientRect();
    if (r.width && r.width < 600) width *= 1.7; // celular: mostra mais vizinhos ao centralizar
    const h = width / ((r.width || 1) / (r.height || 1));
    const target = { x: x - width / 2, y: y - h / 2, w: width };
    cancelAnimationFrame(anim);
    if (!animate) { Object.assign(view, target); applyView(); return; }
    const from = { ...view }, t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      view.x = from.x + (target.x - from.x) * e; view.y = from.y + (target.y - from.y) * e; view.w = from.w + (target.w - from.w) * e;
      applyView();
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  // ---------- Arrastar, pinça e roda ----------
  const pointers = new Map();
  let drag = null, moved = false, pinch = null;
  svg.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = false; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: view.w };
      drag = null;
    }
  });
  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.w * pinch.d / d) / view.w, (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = true;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); handlers.onHover?.(null); }
    const r = svg.getBoundingClientRect();
    view.x = drag.vx - dx / r.width * view.w;
    view.y = drag.vy - dy / r.height * view.h;
    applyView();
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) { drag = null; svg.classList.remove('dragging'); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  new ResizeObserver(applyView).observe(svg);

  // ---------- Cliques e dicas ----------
  const target = e => e.target.closest('[data-kind]');
  svg.addEventListener('click', e => {
    if (moved) { moved = false; return; }
    const t = target(e);
    if (!t) return handlers.onBackground?.();
    const { kind, id } = t.dataset;
    if (kind === 'city') handlers.onCity?.(id);
    if (kind === 'link') handlers.onLink?.(id);
    if (kind === 'train') handlers.onTrain?.(id);
  });
  svg.addEventListener('pointerover', e => {
    if (drag && moved) return;
    const t = target(e);
    handlers.onHover?.(t ? { kind: t.dataset.kind, id: t.dataset.id, x: e.clientX, y: e.clientY } : null);
  });
  svg.addEventListener('pointermove', e => { if (!moved && target(e)) handlers.onHoverMove?.(e.clientX, e.clientY); });
  svg.addEventListener('pointerleave', () => handlers.onHover?.(null));

  // ---------- Terra ----------
  async function loadLand() {
    try {
      const topo = await fetch(LAND_URL).then(r => r.json());
      const frag = document.createDocumentFragment();
      topoToPaths(topo, 'countries').forEach(c => {
        const p = el('path', { d: c.d, class: 'country', 'data-cid': c.id || '' });
        if (c.name) el('title', {}, p).textContent = c.name;
        frag.appendChild(p);
      });
      gLand.appendChild(frag);
      fetch(LAND_HD_URL).then(r => r.json()).then(hd => {
        topoToPaths(hd, 'countries', HD_IDS).forEach(c => gLand.querySelector(`[data-cid="${c.id}"]`)?.setAttribute('d', c.d));
      }).catch(() => { /* fica com o contorno simples */ });
    } catch (e) {
      console.warn('Mapa base indisponível (offline?)', e);
      svg.classList.add('no-land');
    }
  }

  // ---------- Ferrovias e cidades ----------
  let selected = { kind: null, id: null }, highlight = null, markers = [];
  function renderNetwork() {
    gRails.innerHTML = ''; gCities.innerHTML = ''; markers = [];
    const setup = !state;
    for (const l of DB.links) {
      const [x1, y1] = project(DB.cityById[l.a].lon, DB.cityById[l.a].lat);
      const [x2, y2] = project(DB.cityById[l.b].lon, DB.cityById[l.b].lat);
      const d = `M${x1} ${y1}L${x2} ${y2}`;
      const owned = !setup && state.owned[l.id];
      const frontier = !setup && !owned && (state.stations[l.a] || state.stations[l.b]);
      const g = el('g', { class: `rail ${owned ? 'owned' : frontier ? 'frontier' : 'possible'} type-${l.type} ${selected.kind === 'link' && selected.id === l.id ? 'selected' : ''} ${highlight?.links?.includes(l.id) ? 'route' : ''}` }, gRails);
      if (owned) {
        el('path', { d, class: 'casing' }, g);
        el('path', { d, class: 'line', stroke: lineOf(l.id)?.color || state.company.color }, g);
        el('path', { d, class: 'ties' }, g);
      } else el('path', { d, class: 'line' }, g);
      el('path', { d, class: 'hit', 'data-kind': 'link', 'data-id': l.id }, g);
    }
    for (const c of DB.cities) {
      const [x, y] = project(c.lon, c.lat);
      const status = setup ? 'frontier' : cityStatus(c.id); // na criação, qualquer cidade pode ser sede
      const home = !setup && state.company.home === c.id;
      const g = el('g', { class: `city s${c.size} ${status} ${home ? 'home' : ''} ${selected.kind === 'city' && selected.id === c.id ? 'selected' : ''} ${highlight?.cities?.includes(c.id) ? 'hl' : ''}`, 'data-kind': 'city', 'data-id': c.id }, gCities);
      const inner = el('g', { class: 'mk' }, g);
      el('circle', { r: 13, class: 'halo' }, inner);
      el('circle', { r: status === 'station' || status === 'starter' ? 6 : status === 'frontier' ? 4.6 : 3.2, class: 'dot' }, inner);
      if (home) el('path', { d: 'M0 -3.4L1 -1 3.4 -1 1.5 .5 2.2 3 0 1.5 -2.2 3 -1.5 .5 -3.4 -1 -1 -1Z', class: 'star' }, inner);
      const label = el('text', { x: 9, y: 4, class: 'label' }, inner);
      label.textContent = c.name;
      if (!setup && status === 'station') {
        const n = contractsAt(c.id).length;
        if (n) {
          const b = el('g', { class: 'badge', transform: 'translate(-7 -9)' }, inner);
          el('circle', { r: 5.5 }, b);
          el('text', { y: 2.4 }, b).textContent = n;
        }
      }
      markers.push({ g: inner, x, y });
    }
    scaleMarkers();
  }
  function scaleMarkers() {
    const s = Math.min(1.6, unitPerPx);
    markers.forEach(m => m.g.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${s})`));
    trainEls.forEach(t => { t.s = s; });
  }

  // ---------- Trens ----------
  const trainEls = new Map();
  function syncTrains() {
    if (!state) { gTrains.innerHTML = ''; trainEls.clear(); return; }
    const ids = new Set(state.trains.map(t => t.id));
    for (const [id, o] of trainEls) if (!ids.has(id)) { o.g.remove(); trainEls.delete(id); }
    for (const t of state.trains) {
      let o = trainEls.get(t.id);
      if (!o) {
        const g = el('g', { class: 'train', 'data-kind': 'train', 'data-id': t.id }, gTrains);
        const inner = el('g', {}, g);
        el('circle', { r: 11, class: 'halo' }, inner);
        el('rect', { x: -9, y: -4.2, width: 18, height: 8.4, rx: 3, class: 'body' }, inner);
        el('rect', { x: -9, y: -1, width: 18, height: 2, class: 'trim' }, inner);
        el('rect', { x: 3.5, y: -3, width: 4, height: 2.4, rx: .6, class: 'cab' }, inner);
        el('circle', { r: 1.5, cx: 9, class: 'lamp' }, inner);
        o = { g, inner, s: 1, angle: 0 };
        trainEls.set(t.id, o);
      }
      o.inner.querySelector('.body').setAttribute('fill', t.body);
      o.inner.querySelector('.trim').setAttribute('fill', t.trim);
      o.g.classList.toggle('selected', selected.kind === 'train' && selected.id === t.id);
    }
  }
  function tick(now = Date.now()) {
    if (!state) return;
    // trens parados na mesma estação ficam lado a lado
    const parked = {};
    for (const t of state.trains) {
      const o = trainEls.get(t.id); if (!o) continue;
      const p = trainPosition(t, now);
      let [x, y] = project(p.lon, p.lat);
      if (p.moving) {
        const [ax, ay] = project(p.from.lon, p.from.lat), [bx, by] = project(p.to.lon, p.to.lat);
        o.angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
      } else {
        const k = `${x}|${y}`, n = parked[k] = (parked[k] || 0) + 1;
        y += (n * 13 - 4) * o.s; x -= 0;
        o.angle = 0;
      }
      const flip = Math.abs(o.angle) > 90 ? ' scale(1 -1)' : '';
      o.g.setAttribute('transform', `translate(${x} ${y}) scale(${o.s}) rotate(${o.angle})${flip}`);
      o.g.classList.toggle('moving', !!p.moving);
      // fumaça: só vapor em movimento, um sopro a cada ~350 ms
      if (p.moving && modelOf(t).category === 'vapor' && now - (o.puff || 0) > 350) {
        o.puff = now;
        const c = el('circle', { cx: x, cy: y, r: 3.2 * o.s, class: 'puff' }, gFx);
        setTimeout(() => c.remove(), 1400);
      }
      o.g.classList.toggle('loaded', !!p.loaded);
    }
  }

  function select(kind, id) { selected = { kind, id }; renderNetwork(); syncTrains(); }
  function setHighlight(h) { highlight = h; renderNetwork(); }

  applyView();
  return {
    loadLand, renderNetwork, syncTrains, tick, focus, select, setHighlight,
    zoomIn: () => zoomAt(1 / 1.4), zoomOut: () => zoomAt(1.4),
    reset: () => focus(10, 15, W * 0.95)
  };
}
