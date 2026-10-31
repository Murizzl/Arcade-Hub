/* =========================================================
   Rail Atlas — inicialização, ciclo do jogo e telas.
   ========================================================= */
import { DB, state, setState, freshState, loadData, on, log, nextId } from './game-state.js';
import { ECONOMY, fmt, segmentCost, spend } from './economy.js';
import { createMap } from './map.js';
import { city, cityStatus, hasStation, openStation, stationInfo, stationIds, trainsAt, upgradeLevel, canUpgrade, buyUpgrade } from './cities.js';
import { canBuy, buySegment, editLine, moveSegment, isOwned, lineOf, lineSegments, lineCities, LINE_COLORS, ownedLinks, findRoute, trafficOn } from './railways.js';
import { contractsAt, makeContract, refreshContracts, activeContracts, openContracts, routable, cargoOf, itemOf } from './cargo.js';
import { addTrain, buyTrain, customizeTrain, planTrip, dispatch, processArrivals, trainById, modelOf, driverOf, tripProgress, trainPosition, autoWaypoints, repairQuote, repairTrain, effectiveSpeed, hireDriver, editDriver, assignDriver, driverBonus } from './trains.js';
import { levelInfo, maxLines, maxTrains, UNLOCKS, checkAchievements, achievementMetrics } from './progression.js';
import { runAutomation, bestLoadFor, setMode, MODES, MODE_LEVEL, defaultAuto } from './automation.js';
import { loadSave, writeSave, deleteSave, migrateSave, CloudSync } from './save-system.js';
import { ArcadeIntegration } from './arcade-integration.js';
import { locoSVG, driverSVG, randomDriver, DRIVER_OPTIONS } from './sprites.js';
import { $, $$, ic, esc, refreshIcons, duration, toast, modal, closeModal, COUNTRY, CONTINENT, flag } from './ui.js';

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const COMPANY_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316'];
let userId = null, map = null;
let panel = { view: 'welcome', id: null, tab: 'contracts' };

/* ==================== INICIALIZAÇÃO ==================== */
async function boot() {
  try { await loadData('data/'); }
  catch (e) {
    $('#boot').innerHTML = `<div class="boot-card"><h2>Não foi possível carregar os dados</h2><p>Abra o Rail Atlas por um servidor (ex.: GitHub Pages ou <code>npx serve</code>), não pelo arquivo direto.</p><small>${esc(e.message)}</small></div>`;
    return;
  }
  const prof = ArcadeIntegration.profile();
  userId = prof?.id || null;
  $('#hubUser').innerHTML = prof ? `${ic('user-round')} ${esc(prof.username)}` : `${ic('user-round-x')} Convidado`;
  $('#hubUser').title = prof ? 'Conta do Arcade Hub — entregas rendem XP no seu perfil' : 'Entre no Arcade Hub para ganhar XP de perfil';

  map = createMap($('#map'), {
    onCity: id => { if (!state) return pickStart(id); if (planning && panel.view === 'plan') return addStop(id); if (routePick && panel.view === 'train') return addFixedStop(id); openPanel('city', id); },
    onLink: id => state && openPanel('link', id),
    onTrain: id => openPanel('train', id),
    onBackground: () => state && panel.view !== 'welcome' && window.innerWidth < 900 && closePanel(),
    onHover: showTip, onHoverMove: moveTip
  });
  map.loadLand();
  bindChrome();

  let saved = loadSave(userId);
  // nuvem: fica com o save mais recente entre este aparelho e o servidor
  if (userId && await CloudSync.init()) {
    const remote = migrateSave(await CloudSync.pull());
    if (remote && (!saved || remote.lastUpdate > saved.lastUpdate)) saved = remote;
  }
  $('#boot').remove();
  if (saved) { setState(saved); resume(); }
  else setupScreen();
}

/* ==================== NOVO JOGO ==================== */
let setup = { name: '', color: COMPANY_COLORS[0], city: null, continent: 'sa' };
function setupScreen() {
  document.body.classList.add('in-setup');
  map.renderNetwork();
  map.focus(-48, -22, 60, false);
  const box = $('#setup');
  box.hidden = false;
  const starters = DB.cities.filter(c => DB.adj[c.id].length);
  const draw = () => {
    box.innerHTML = `
      <div class="setup-card">
        <div class="setup-brand">${ic('train-front')}<div><h1>Rail Atlas</h1><p>Funde sua companhia ferroviária e construa um império sobre trilhos.</p></div></div>
        <label class="field"><span>1 · Nome da companhia</span>
          <input id="sName" maxlength="28" placeholder="Ex.: Expresso Atlântico" value="${esc(setup.name)}" autocomplete="off"></label>
        <div class="field"><span>2 · Cor da companhia</span>
          <div class="swatches">${COMPANY_COLORS.map(c => `<button class="sw ${c === setup.color ? 'on' : ''}" style="--c:${c}" data-color="${c}" aria-label="Cor ${c}"></button>`).join('')}
            <label class="sw custom" title="Outra cor"><input type="color" id="sColor" value="${setup.color}">${ic('pipette')}</label></div></div>
        <div class="field"><span>3 · Cidade inicial</span>
          <div class="tabs small">${Object.entries(CONTINENT).map(([k, v]) => `<button class="tab ${k === setup.continent ? 'on' : ''}" data-cont="${k}">${v}</button>`).join('')}</div>
          <input class="input" id="sFind" placeholder="Buscar cidade…" value="${esc(setup.find || '')}" autocomplete="off" style="margin-top:8px">
          <div class="start-list">${starters.filter(c => setup.find ? norm(c.name).includes(norm(setup.find)) : c.continent === setup.continent).sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)).map(c => {
            const n = DB.adj[c.id].length;
            return `<button class="start-city ${setup.city === c.id ? 'on' : ''}" data-start="${c.id}"><span class="flag">${flag(c.country)}</span><b>${esc(c.name)}</b><small>${esc(COUNTRY[c.country])} · ${n} conexões</small></button>`;
          }).join('')}</div>
          <small class="hint">${ic('mouse-pointer-click')} Qualquer cidade pode ser sede — clique nela no mapa ou escolha aqui.</small></div>
        <button class="btn primary big" id="sGo" ${setup.name.trim() && setup.city ? '' : 'disabled'}>${ic('flag')} Fundar companhia</button>
      </div>`;
    refreshIcons();
    const name = $('#sName');
    name.oninput = () => { setup.name = name.value; $('#sGo').disabled = !(setup.name.trim() && setup.city); };
    $('#sFind').oninput = e => { setup.find = e.target.value; const pos = e.target.selectionStart; draw(); const f = $('#sFind'); f.focus(); f.setSelectionRange(pos, pos); };
    $('#sColor').oninput = e => { setup.color = e.target.value; $$('.sw[data-color]').forEach(b => b.classList.remove('on')); };
  };
  box.onclick = e => {
    const c = e.target.closest('[data-color]'); if (c) { setup.color = c.dataset.color; draw(); }
    const t = e.target.closest('[data-cont]'); if (t) { setup.continent = t.dataset.cont; const first = starters.find(s => s.continent === setup.continent); focusCity(first.id, 400); draw(); }
    const s = e.target.closest('[data-start]'); if (s) pickStart(s.dataset.start);
    if (e.target.closest('#sGo')) startGame();
  };
  pickStart._draw = draw;
  draw();
}
function pickStart(id) {
  const c = city(id);
  if (!DB.adj[id].length) return toast(`${esc(c.name)} ainda não tem trilhos possíveis.`, 'warn', 'map-pin');
  setup.city = id; setup.continent = c.continent;
  map.select('city', id);
  focusCity(id, 30);
  pickStart._draw?.();
}

function startGame() {
  const now = Date.now();
  const s = freshState({ companyName: setup.name.trim().slice(0, 28), color: setup.color, homeCityId: setup.city, now });
  setState(s);
  s.credits = ECONOMY.startCredits;
  openStation(setup.city, now);
  s.stations[setup.city].upgrades.oficina = 1; // a sede já começa com oficina
  // acesso inicial: as duas cidades vizinhas mais próximas, na primeira linha
  const near = [...DB.adj[setup.city]].sort((a, b) => a.km - b.km).slice(0, 2);
  const first = buySegment(near[0].id, { name: 'Linha 1', color: setup.color }, { free: true, now });
  near.slice(1).forEach(l => buySegment(l.id, { lineId: first.line.id }, { free: true, now }));
  const d = { id: nextId('drv'), ...randomDriver('Ana Trilhos') };
  s.drivers.push(d);
  addTrain('vapor-pioneira', setup.city, { name: 'Pioneira 01', driverId: d.id });
  // contrato do tutorial: cabe na locomotiva inicial e vai para a vizinha mais próxima
  const hc = city(setup.city), nb = city(near[0].a === setup.city ? near[0].b : near[0].a);
  makeContract(setup.city, { dest: nb.id, cargo: hc.produces.find(x => nb.demands.includes(x)) || hc.produces[0], rarity: 'comum', maxSlots: 3, tutorial: true }, now);
  refreshContracts(now);
  log('flag', `${s.company.name} foi fundada em ${hc.name}!`, 'success');
  $('#setup').hidden = true;
  document.body.classList.remove('in-setup');
  save();
  resume(true);
}

/* ==================== CICLO ==================== */
// Trechos que saíram dos dados (malha redesenhada) viram o caminho equivalente, na mesma linha
function repairNetwork() {
  for (const id of Object.keys(state.owned)) {
    if (DB.linkById[id]) continue;
    const [a, b] = id.split('~'), lineId = state.owned[id].lineId;
    delete state.owned[id];
    if (!DB.cityById[a] || !DB.cityById[b]) continue;
    const prev = { [a]: null }, q = [a];
    while (q.length && !(b in prev)) { const u = q.shift(); DB.adj[u].forEach(l => { const v = l.a === u ? l.b : l.a; if (!(v in prev)) { prev[v] = l; q.push(v); } }); }
    for (let c = b; prev[c]; c = prev[c].a === c ? prev[c].b : prev[c].a) {
      state.owned[prev[c].id] ||= { lineId, boughtAt: Date.now() };
      openStation(prev[c].a); openStation(prev[c].b);
    }
  }
}

/**
 * Avança o mundo de `from` até `to` sem simular quadro a quadro: pula de evento
 * em evento (entregas, chegadas, reposição de cargas) e deixa a automação agir em
 * cada um. A automação só roda nas primeiras N horas de ausência (offlineCapHours).
 */
function nextEventAfter(t) {
  let n = Infinity;
  for (const tr of Object.values(state.trips)) {
    if (tr.arriveAt > t) n = Math.min(n, tr.arriveAt);
    for (const st of tr.stops) if ((st.drop || st.store) && !st.done && st.t > t) n = Math.min(n, st.t);
  }
  for (const r of Object.values(state.nextRefresh)) if (r > t) n = Math.min(n, r);
  return n;
}
function simulate(from, to) {
  const cap = from + ECONOMY.offlineCapHours * 3600e3, done = [];
  let t = from, guard = 0;
  while (guard++ < 30000) {
    const next = nextEventAfter(t);
    if (!(next <= to)) break;
    t = next;
    done.push(...processArrivals(t));
    refreshContracts(t);
    if (t <= cap) runAutomation(t);
  }
  done.push(...processArrivals(to));
  refreshContracts(to);
  if (to <= cap) runAutomation(to);
  checkAchievements(reportAchievement);
  return done;
}

function resume(fresh) {
  repairNetwork();
  const now = Date.now();
  const away = now - (state.lastUpdate || now);
  const before = state.credits;
  const done = simulate(state.lastUpdate || now, now);
  if (!fresh && done.length && away > 30e3) offlineSummary(done, away, state.credits - before);
  save();
  renderAll();
  focusCity(state.company.home, 9, false);
  if (fresh || panel.view === 'welcome') openPanel('city', state.company.home);
  setInterval(logicTick, 1000);
  requestAnimationFrame(frame);
}

function logicTick() {
  const now = Date.now();
  const done = processArrivals(now);
  const changed = refreshContracts(now);
  const auto = runAutomation(now);
  if (done.length || changed || auto) save();
  arrivalToasts(done);
  if (done.length) checkAchievements(reportAchievement);
}

function frame() {
  const now = Date.now();
  map.tick(now);
  $$('[data-trip]').forEach(n => {
    const tr = state.trips[n.dataset.trip];
    if (!tr) return;
    const p = tripProgress(tr, now);
    const bar = n.querySelector('.bar > span'); if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    const eta = n.querySelector('.eta'); if (eta) eta.textContent = duration((tr.arriveAt - now) / 1000);
  });
  requestAnimationFrame(frame);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeSave(userId, state);
    const summary = { company: state.company.name, level: state.company.level, stations: stationIds().length, deliveries: state.stats.deliveries,
      achievements: Object.keys(state.achievements).length, achievementsTotal: DB.achievements.length, username: ArcadeIntegration.profile()?.username };
    ArcadeIntegration.publishSummary(summary);
    queueCloud(summary);
  }, 400);
}
// envia à nuvem no máximo a cada 20 s (e ao sair da página)
let cloudTimer = null, cloudSummary = null;
function queueCloud(summary) {
  if (!CloudSync.enabled) return;
  cloudSummary = summary;
  if (!cloudTimer) cloudTimer = setTimeout(() => { cloudTimer = null; CloudSync.push(state, cloudSummary); }, 20000);
}
function reportAchievement(a) {
  ArcadeIntegration.reportEvent({ eventType: 'achievement_unlocked', gameId: 'rail-atlas', contractId: a.id, kind: 'achievement' });
  toast(`<b>Conquista: ${esc(a.name)}</b><br>${esc(a.desc)} · <span class="pos">+${fmt(a.reward)} cr</span>`, 'success', 'award', 6000);
}
const saveNow = () => { if (state) { clearTimeout(saveTimer); writeSave(userId, state); } };
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveNow(); if (state && cloudSummary) CloudSync.push(state, cloudSummary); } });

// Reações a mudanças de estado: redesenha só o necessário (agrupado por quadro)
let dirty = new Set(), rafQueued = false;
function invalidate(...parts) {
  parts.forEach(p => dirty.add(p));
  if (rafQueued) return;
  rafQueued = true;
  requestAnimationFrame(() => {
    rafQueued = false;
    const d = dirty; dirty = new Set();
    if (!state) return;
    if (d.has('map')) { map.renderNetwork(); map.syncTrains(); }
    if (d.has('top')) renderTop();
    if (d.has('ticker')) renderTicker();
    if (d.has('panel')) renderPanel();
    renderTutorial();
    refreshIcons();
  });
}
on('*', ({ type }) => {
  if (!state) return;
  const map_ = ['network', 'lines', 'contracts', 'trains', 'trips', 'delivered', 'stations'].includes(type);
  invalidate('top', 'ticker', ...(map_ ? ['map'] : []), ...(type === 'log' && panel.view !== 'settings' ? [] : ['panel']));
  if (type !== 'log' && type !== 'credits') save();
});
on('credits', () => save());
['network', 'stations', 'trains', 'lines', 'levelup'].forEach(ev => on(ev, () => state && setTimeout(() => checkAchievements(reportAchievement))));
on('levelup', lvl => { toast(`<b>Companhia nível ${lvl}!</b><br>Novos desbloqueios disponíveis.`, 'success', 'trending-up', 6000); });

function renderAll() { invalidate('map', 'top', 'ticker', 'panel'); }

/* ==================== CABEÇALHO E RODAPÉ ==================== */
function renderTop() {
  const li = levelInfo(), c = state.company;
  const moving = Object.keys(state.trips).length;
  $('#company').innerHTML = `
    <span class="co-mark" style="--c:${c.color}">${ic('train-front')}</span>
    <div class="co-info"><b>${esc(c.name)}</b>
      <div class="co-lvl"><span>Nv ${li.level}</span><div class="bar sm"><span style="width:${li.pct}%"></span></div><small>${fmt(li.xp)}/${fmt(li.need)}</small></div></div>`;
  $('#stats').innerHTML = `
    <div class="stat credits" title="Créditos Ferroviários">${ic('coins')}<b>${fmt(state.credits)}</b><small>créditos</small></div>
    <div class="stat" title="Locomotivas">${ic('train-front')}<b>${state.trains.length}</b><small>trens</small></div>
    <div class="stat" title="Entregas em andamento">${ic('package')}<b>${moving}</b><small>em rota</small></div>
    <div class="stat xp" title="${userId ? 'XP enviado ao seu perfil do Arcade Hub hoje' : 'Entre no Arcade Hub para ganhar XP de perfil'}">${ic('sparkles')}<b>${userId ? fmt(ArcadeIntegration.grantedToday()) : '—'}</b><small>XP Arcade hoje</small></div>`;
}

function renderTicker() {
  const trips = Object.values(state.trips).sort((a, b) => a.arriveAt - b.arriveAt);
  $('#ticker').innerHTML = `
    <div class="tk-trips">${trips.length ? trips.map(tr => {
      const t = trainById(tr.trainId);
      return `<button class="tk-trip" data-trip="${tr.id}" data-open-train="${t.id}">
        <span class="tk-dot" style="background:${t.body}"></span>
        <span class="tk-txt"><b>${esc(t.name)}</b> ${esc(city(tr.stops[0].city).name)} → ${esc(city(tr.dest).name)}</span>
        <span class="bar xs"><span></span></span><span class="eta"></span></button>`;
    }).join('') : `<span class="tk-empty">${ic('moon')} Nenhum trem em viagem — carregue cargas numa estação.</span>`}</div>
    <div class="tk-log">${state.log.slice(0, 3).map(l => `<span class="tk-log-item ${l.kind}">${ic(l.icon)} ${esc(l.text)}</span>`).join('')}</div>`;
}

/* ==================== TUTORIAL ==================== */
const TUTORIAL = [
  { icon: 'star', text: 'Clique na sua <b>estação principal</b> (estrela) para ver os contratos de carga.' },
  { icon: 'package-plus', text: 'Toque em <b>Carregar</b> na <b>Primeira carga</b>, clique na cidade de destino no mapa e toque em <b>Fazer rota</b>.' },
  null,
  { icon: 'train-front', text: 'Seu trem está a caminho! Acompanhe o ícone pelos trilhos — a entrega é automática.' },
  { icon: 'route', text: 'Recompensa recebida! Agora <b>expanda a rede</b>: clique numa linha tracejada saindo de uma estação sua.' }
];
function renderTutorial() {
  const tut = state.tutorial, el = $('#tutorial');
  if (tut.done || !TUTORIAL[tut.step]) { el.hidden = true; return; }
  const s = TUTORIAL[tut.step];
  el.hidden = false;
  el.innerHTML = `<span class="tut-ic">${ic(s.icon)}</span><p>${s.text}</p><small>Tutorial ${[1, 2, 3, 3, 4][tut.step]}/4</small><button class="icon-btn" data-skip-tut aria-label="Pular tutorial">${ic('x')}</button>`;
}
function tutorialAt(step, next) { if (!state.tutorial.done && state.tutorial.step === step) { state.tutorial.step = next; if (next >= TUTORIAL.length) state.tutorial.done = true; invalidate('panel'); save(); } }

/* ==================== PAINEL CONTEXTUAL ==================== */
function openPanel(view, id = null, tab) {
  if (view !== 'plan') planning = null;
  if (view !== 'train' || id !== panel.id) routePick = null;
  panel = { view, id, tab: tab || (view === panel.view && id === panel.id ? panel.tab : defaultTab(view)) };
  document.body.classList.add('panel-open');
  $$('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === navOf(view)));
  if (view === 'city') { map.select('city', id); if (id === state.company.home) tutorialAt(0, 1); }
  else if (view === 'link') map.select('link', id);
  else if (view === 'train' || view === 'plan') map.select('train', id);
  else map.select(null, null);
  map.setHighlight(null);
  renderPanel();
  refreshIcons();
  $('#panel').scrollTop = 0;
}
const defaultTab = v => ({ city: 'contracts', trains: 'fleet' }[v] || null);
const navOf = v => ({ city: 'stations', link: 'network', train: 'trains', plan: 'trains', driver: 'drivers' }[v] || v);
function closePanel() { planning = null; routePick = null; document.body.classList.remove('panel-open'); map.select(null, null); map.setHighlight(null); }

function renderPanel() {
  const p = $('#panel');
  // não apaga o que o jogador está digitando
  if (p.contains(document.activeElement) && document.activeElement.matches('input[type=text], input:not([type]), select')) { dirty.add('panel'); return; }
  const views = { reports: reportsPanel, drivers: driversPanel, driver: driverPanel, achievements: achievementsPanel, social: socialPanel, plan: planPanel, city: cityPanel, link: linkPanel, train: trainPanel, contracts: contractsPanel, network: networkPanel, trains: trainsPanel, stations: stationsPanel, settings: settingsPanel, welcome: cityPanel };
  const html = (views[panel.view] || cityPanel)(panel.id || state.company.home);
  p.innerHTML = `<button class="panel-close icon-btn" data-close-panel aria-label="Fechar painel">${ic('chevron-down')}</button>${html}`;
  refreshIcons();
}

const cargoChip = c => { const g = cargoOf(c); return `<span class="cargo-ic" style="--c:${g.color}" title="${esc(g.name)}">${ic(g.icon)}</span>`; };
const rarityTag = c => c.rarity === 'comum' ? '' : `<span class="tag" style="--c:${ECONOMY.rarity[c.rarity].color}">${ECONOMY.rarity[c.rarity].name}</span>`;

const slotPips = (n, color) => `<span class="pips" title="${n} vaga(s)">${Array.from({ length: n }, () => `<i style="background:${color}"></i>`).join('')}</span>`;

function contractCard(c, { showOrigin = false } = {}) {
  const g = cargoOf(c), it = itemOf(c);
  const ok = routable(c);
  const here = trainsAt(c.at || c.origin).filter(t => modelOf(t).slots >= c.slots);
  const status = c.status === 'in_transit' ? `<span class="tag live">${ic('train-front')} Em rota</span>` : c.stored ? `<span class="tag" style="--c:#38bdf8">${ic('warehouse')} No armazém</span>` : '';
  return `<article class="contract ${ok ? '' : 'blocked'} ${c.tutorial ? 'tutorial' : ''}" data-contract="${c.id}">
    <div class="ct-head">${cargoChip(c)}
      <div class="ct-title"><b>${esc(it.name)}</b>
        <small>${showOrigin ? esc(city(c.origin).name) + ' ' : ''}${ic('arrow-right')} ${esc(city(c.dest).name)} ${c.international ? flag(city(c.dest).country) : ''}</small></div>
      <div class="ct-reward">${ic('coins')} ${fmt(c.reward)}<small>+${c.xp} XP</small></div></div>
    <div class="ct-meta">
      ${slotPips(c.slots, g.color)}<span class="meta">${c.slots} vaga${c.slots > 1 ? 's' : ''}</span>
      ${c.tutorial ? `<span class="tag" style="--c:#f59e0b">${ic('graduation-cap')} Primeira carga</span>` : ''}${rarityTag(c)}${c.international ? `<span class="tag" style="--c:#a78bfa">${ic('globe')} Internacional</span>` : ''}${status}
      <span class="meta">${ic('ruler')} ${fmt(c.km)} km</span>
    </div>
    ${c.status !== 'open' ? '' : !ok
      ? `<div class="ct-block">${ic('unplug')} Sem trilhos até ${esc(city(c.dest).name)} — <button class="link" data-route-to="${c.id}">ver o que falta</button></div>`
      : here.length
        ? `<div class="ct-actions"><button class="btn primary sm" data-plan="${here[0].id}|${c.id}">${ic('package-plus')} Carregar${here.length > 1 || state.trains.length > 1 ? ' em ' + esc(here[0].name) : ''}</button></div>`
        : `<div class="ct-block">${ic('train-track')} Nenhum trem livre em ${esc(city(c.at || c.origin).name)}.</div>`}
  </article>`;
}

function cityPanel(id) {
  const c = city(id), status = cityStatus(id), st = stationInfo(id);
  const home = state.company.home === id;
  const head = `<header class="p-head">
      <div class="p-kicker">${flag(c.country)} ${esc(COUNTRY[c.country])} · ${esc(CONTINENT[c.continent])}</div>
      <h2>${home ? ic('star', 'gold') : ''}${esc(c.name)}</h2>
      <div class="p-sub">${status === 'station' ? `<span class="tag" style="--c:${state.company.color}">${ic('warehouse')} Estação nível ${st.level}</span>` : status === 'frontier' ? `<span class="tag" style="--c:#94a3b8">${ic('map-pin')} Ao alcance da rede</span>` : `<span class="tag" style="--c:#64748b">${ic('lock')} Fora da rede</span>`}</div>
    </header>
    <div class="goods"><div><small>Produz</small>${c.produces.map(x => cargoChip({ cargo: x })).join('')}</div><div><small>Procura</small>${c.demands.map(x => cargoChip({ cargo: x })).join('')}</div></div>`;
  const links = DB.adj[id].map(l => {
    const o = city(l.a === id ? l.b : l.a), owned = isOwned(l.id), chk = owned ? null : canBuy(l.id);
    return `<button class="row-btn" data-open-link="${l.id}"><span class="sw-line" style="--c:${owned ? lineOf(l.id).color : '#475569'}"></span><span><b>${esc(o.name)}</b><small>${fmt(l.km)} km · ${esc(DB.linkTypes[l.type].name)}</small></span>
      <span class="rb-end">${owned ? `<span class="tag" style="--c:${lineOf(l.id).color}">${esc(lineOf(l.id).name)}</span>` : `${ic('coins')} ${fmt(segmentCost(l))}${chk.ok ? '' : ' ' + ic('lock', 'dim')}`}</span></button>`;
  }).join('');
  if (status !== 'station') {
    return head + `<section class="p-sec"><h3>${ic('route')} Trechos possíveis</h3><p class="muted">Compre um trecho que chegue até ${esc(c.name)} para abrir uma estação e receber contratos daqui.</p>${links}</section>`;
  }
  const tabs = [['contracts', 'Cargas', 'package'], ['storage', 'Armazém', 'warehouse'], ['upgrades', 'Melhorias', 'hammer'], ['stats', 'Dados', 'bar-chart-3'], ['links', 'Trechos', 'route']];
  const stored = contractsAt(id).filter(c => c.stored);
  const list = contractsAt(id).filter(c => !c.stored).sort((a, b) => b.tutorial - a.tutorial || routable(b) - routable(a) || b.reward - a.reward);
  const here = trainsAt(id);
  const now = Date.now();
  const arrivals = Object.values(state.trips).filter(tr => tr.stops.some(s2 => s2.city === id && s2.t > now)).sort((a, b) => a.arriveAt - b.arriveAt);
  const s = state.stats.byCity[id] || { in: 0, out: 0, revenue: 0 };
  const body = {
      contracts: list.length ? list.map(x => contractCard(x)).join('') + `<p class="muted center sm">Novas cargas chegam a cada ${Math.round(ECONOMY.refreshMs / 1000)}s (até ${st.contractSlots}).</p>`
      : `<div class="empty">${ic('hourglass')}<p>Sem cargas agora.<br>Novas chegam em ${duration(((state.nextRefresh[id] || 0) - Date.now()) / 1000)}.</p></div>`,
    stats: `<div class="kpis">
        <div><b>${s.out}</b><small>cargas despachadas</small></div><div><b>${s.in}</b><small>cargas recebidas</small></div>
        <div><b>${fmt(s.revenue)}</b><small>receita gerada</small></div><div><b>${st.level}</b><small>nível da estação</small></div></div>`,
    storage: `<div class="store-cap"><div class="bar"><span style="width:${st.stored / st.storage * 100}%"></span></div><b>${st.stored}/${st.storage}</b><small>vagas</small></div>
        <p class="muted sm">Baldeação: no planejamento, marque “Guardar no armazém” para deixar aqui cargas que vão para outro lugar. Qualquer trem que passar depois pode levá-las — elas não expiram.</p>
        ${stored.length ? stored.map(x => contractCard(x)).join('') : `<div class="empty">${ic('warehouse')}<p>Armazém vazio.</p></div>`}`,
    upgrades: Object.entries(DB.upgrades).map(([key, u]) => upgradeCard(id, key, u)).join(''),
    links
  }[panel.tab] || '';
  return head + `
    <section class="p-sec"><h3>${ic('train-front')} Na estação</h3>${here.length ? here.map(trainRow).join('') : '<p class="muted sm">Nenhuma locomotiva parada aqui.</p>'}
      ${arrivals.length ? `<h4>Próximas chegadas</h4>${arrivals.map(tr => tripRow(tr)).join('')}` : ''}</section>
    <div class="tabs">${tabs.map(([k, n, i]) => `<button class="tab ${panel.tab === k ? 'on' : ''}" data-tab="${k}">${ic(i)} ${n}${k === 'contracts' && list.length ? ` <span class="count">${list.length}</span>` : ''}${k === 'storage' && stored.length ? ` <span class="count">${stored.length}</span>` : ''}</button>`).join('')}</div>
    <section class="p-sec">${body}</section>`;
}

const fmtEffect = (key, v) => ({
  armazem: `${v} vagas`,
  plataforma: v === 1 ? 'tempo padrão' : `${Math.round((1 - v) * 100)}% mais rápido`,
  escritorio: `${v} cargas`,
  posto: v ? `−${Math.round(v * 100)}% combustível` : 'sem desconto',
  oficina: v == null ? 'sem oficina' : v ? `reparos −${Math.round(v * 100)}%` : 'faz reparos',
  patio: v ? `+${v} trem por trecho` : 'capacidade padrão'
}[key]);

function upgradeCard(id, key, u) {
  const lvl = upgradeLevel(id, key), max = u.levels.length - 1, next = u.levels[lvl + 1];
  const chk = canUpgrade(id, key);
  return `<div class="upg">
    <span class="upg-ic">${ic(u.icon)}</span>
    <div class="upg-main"><b>${esc(u.name)}</b><small>${esc(u.desc)}</small>
      <div class="upg-lv">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}<span>${fmtEffect(key, u.levels[lvl].value)}${next ? ` → <b>${fmtEffect(key, next.value)}</b>` : ''}</span></div></div>
    ${next ? `<button class="btn ${chk.ok ? 'primary' : 'ghost'} sm" data-upgrade="${id}|${key}" ${chk.ok ? '' : 'disabled'} title="${esc(chk.reason || '')}">${state.company.level < lvl + 1 ? `${ic('lock')} Nv ${lvl + 1}` : `${ic('coins')} ${fmt(next.cost)}`}</button>` : `<span class="tag" style="--c:#22c55e">Máx.</span>`}
  </div>`;
}

function trainRow(t) {
  const m = modelOf(t), d = driverOf(t);
  return `<div class="row-btn train-row" data-open-train="${t.id}">
    <span class="tr-art">${locoSVG(m.category, t.body, t.trim)}</span>
    <span><b>${esc(t.name)}</b><small>${m.slots} vagas · ${m.speed} km/h${d ? ' · ' + esc(d.name) : ''}</small></span>
    <span class="rb-end">${t.status === 'idle' ? `<button class="btn primary sm" data-plan="${t.id}">${ic('route')} Planejar</button>` : `<span class="tag live">Em rota</span>`}</span></div>`;
}
function tripRow(tr) {
  const t = trainById(tr.trainId), n = tr.contractIds.filter(id => state.contracts[id]?.status === 'in_transit').length;
  return `<div class="trip-row" data-trip="${tr.id}"><span class="tk-dot" style="background:${t.body}"></span>
    <span><b>${esc(t.name)}</b><small>${n} carga(s) a bordo → ${esc(city(tr.dest).name)}</small></span>
    <span class="eta"></span><span class="bar xs"><span></span></span></div>`;
}

function linkPanel(id) {
  const l = DB.linkById[id], A = city(l.a), B = city(l.b), t = DB.linkTypes[l.type];
  const owned = isOwned(id), line = lineOf(id), chk = canBuy(id), cost = segmentCost(l);
  const traffic = trafficOn(id);
  const lines = state.lines;
  return `<header class="p-head"><div class="p-kicker">${ic('route')} ${esc(t.name)}${l.international ? ' · internacional' : ''}</div>
      <h2>${esc(A.name)} — ${esc(B.name)}</h2>
      <div class="p-sub">${owned ? `<span class="tag" style="--c:${line.color}">${esc(line.name)}</span>` : `<span class="tag" style="--c:#64748b">À venda</span>`}</div></header>
    <div class="kpis">
      <div><b>${fmt(l.km)} km</b><small>distância</small></div><div><b>${l.speedLimit} km/h</b><small>limite de velocidade</small></div>
      <div><b>${owned ? traffic + '/' : ''}${l.capacity}</b><small>${owned ? 'trens em uso / capacidade' : 'trens simultâneos'}</small></div><div><b>${fmt(cost)}</b><small>custo do trecho</small></div></div>
    ${owned ? `<section class="p-sec"><h3>${ic('palette')} Linha</h3><p class="muted sm">Mova este trecho para outra linha (a infraestrutura é compartilhada por todas).</p>
        <select class="input" data-move-seg="${id}">${lines.map(x => `<option value="${x.id}" ${x.id === line.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <button class="btn ghost sm" data-open-line="${line.id}" style="margin-top:8px">${ic('pencil')} Editar ${esc(line.name)}</button></section>`
    : `<section class="p-sec"><h3>${ic('shopping-cart')} Comprar trecho</h3>
        ${!chk.ok ? `<div class="warn">${ic('alert-triangle')} ${esc(chk.reason)}</div>` : ''}
        <label class="field"><span>Adicionar à linha</span>
          <select class="input" id="buyLine">${lines.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}${lines.length < maxLines() ? `<option value="new">+ Nova linha</option>` : ''}</select></label>
        <div id="newLine" hidden>
          <label class="field"><span>Nome da nova linha</span><input id="nlName" maxlength="28" placeholder="Linha ${lines.length + 1}"></label>
          <div class="field"><span>Cor</span><div class="swatches">${LINE_COLORS.map((c, i) => `<button class="sw ${i === lines.length % LINE_COLORS.length ? 'on' : ''}" style="--c:${c}" data-lcolor="${c}"></button>`).join('')}<label class="sw custom"><input type="color" id="nlColor" value="${LINE_COLORS[lines.length % LINE_COLORS.length]}">${ic('pipette')}</label></div></div>
        </div>
        <small class="muted">Linhas: ${lines.length}/${maxLines()} no nível ${state.company.level}.</small>
        <button class="btn primary big" data-buy="${id}" ${chk.ok ? '' : 'disabled'}>${ic('coins')} Comprar por ${fmt(cost)}</button></section>`}`;
}

function trainPanel(id) {
  const t = trainById(id); if (!t) return '<p class="muted">Locomotiva não encontrada.</p>';
  const m = modelOf(t), d = driverOf(t), tr = t.tripId && state.trips[t.tripId];
  const pos = trainPosition(t);
  const aboard = tr ? tr.contractIds.map(cid => state.contracts[cid]).filter(c => c?.status === 'in_transit') : [];
  const here = t.status === 'idle' ? contractsAt(t.at).filter(routable).length : 0;
  return `<header class="p-head"><div class="p-kicker">${ic('train-front')} ${esc(m.name)} · ${esc({ vapor: 'Vapor', diesel: 'Diesel', eletrica: 'Elétrica', pesada: 'Carga pesada', rapida: 'Rápida', premium: 'Premium' }[m.category])} · ${m.era}</div>
      <h2>${esc(t.name)}</h2></header>
    <div class="loco-stage" id="locoStage">${locoSVG(m.category, t.body, t.trim, { cls: 'big' })}</div>
    <div class="kpis">
      <div><b>${effectiveSpeed(t)} km/h</b><small>velocidade${effectiveSpeed(t) < m.speed ? ` (máx. ${m.speed})` : ''}</small></div><div><b>${m.slots}</b><small>vagas de carga</small></div>
      <div><b>${m.costPerKm.toFixed(2)}</b><small>cr por km</small></div><div class="${t.condition < 60 ? 'worn' : ''}"><b>${Math.round(t.condition)}%</b><small>condição</small><div class="bar xs cond"><span style="width:${t.condition}%"></span></div></div></div>
    ${(() => { const q = repairQuote(t); return t.condition < 99.5 ? `<div class="repair">${ic('wrench')}<span>${q.ok ? `Revisão na oficina de ${esc(city(t.at).name)} devolve 100% de condição.` : esc(q.reason) + (t.status === 'idle' ? ' Leve o trem até uma estação com oficina (a sede tem uma).' : '')}</span>${q.ok ? `<button class="btn primary sm" data-repair="${t.id}">${ic('coins')} ${fmt(q.cost)}</button>` : ''}</div>` : ''; })()}
    ${d ? `<div class="driver">${driverSVG(d, 56)}<div><b>${esc(d.name)}</b><small>Maquinista · nível ${d.level}</small><div class="bar xs"><span style="width:${d.xp / (d.level * 150) * 100}%"></span></div></div></div>` : ''}
    <section class="p-sec"><h3>${ic('activity')} Status</h3>
      ${tr ? `<div class="trip-card" data-trip="${tr.id}"><b>${esc(pos.stage || 'Em viagem')}</b><small>Destino final: ${esc(city(tr.dest).name)}</small>
          <div class="bar"><span></span></div><small>Chega em <span class="eta"></span></small></div>
          ${aboard.length ? `<h4>A bordo</h4>${aboard.map(c => `<div class="row-btn static">${cargoChip(c)}<span><b>${esc(itemOf(c).name)}</b><small>${c.slots} vaga(s) → ${esc(city(c.dest).name)}</small></span><span class="rb-end">${fmt(c.reward)}</span></div>`).join('')}` : ''}`
      : `<p>Parada em <button class="link" data-open-city="${t.at}">${esc(city(t.at).name)}</button>, pronta para partir. ${here ? `${here} carga(s) com rota aqui.` : ''}</p>
        <button class="btn primary big" data-plan="${t.id}">${ic('route')} Planejar viagem</button>`}
    </section>
    ${automationSection(t)}
    <section class="p-sec"><h3>${ic('paintbrush')} Personalizar</h3>
      <label class="field"><span>Nome do trem</span><input id="tName" maxlength="24" value="${esc(t.name)}"></label>
      <div class="row2"><label class="field"><span>Carroceria</span><input type="color" id="tBody" value="${t.body}"></label>
      <label class="field"><span>Detalhes</span><input type="color" id="tTrim" value="${t.trim}"></label></div>
      <button class="btn ghost sm" data-save-train="${t.id}">${ic('check')} Salvar aparência</button></section>
    <section class="p-sec"><h3>${ic('bar-chart-3')} Histórico</h3><div class="kpis"><div><b>${t.stats.trips}</b><small>viagens</small></div><div><b>${fmt(t.stats.km)}</b><small>km rodados</small></div><div><b>${fmt(t.stats.earned)}</b><small>lucro líquido</small></div></div></section>`;
}

let cFilter = { dest: '', cargo: '', sort: 'reward', onlyOk: false };
function contractsPanel() {
  const all = openContracts();
  let list = all.filter(c => (!cFilter.dest || c.dest === cFilter.dest) && (!cFilter.cargo || c.cargo === cFilter.cargo) && (!cFilter.onlyOk || routable(c)));
  const sorts = { reward: (a, b) => b.reward - a.reward, km: (a, b) => a.km - b.km, new: (a, b) => b.createdAt - a.createdAt };
  list.sort(sorts[cFilter.sort]);
  const dests = [...new Set(all.map(c => c.dest))].sort((a, b) => city(a).name.localeCompare(city(b).name));
  return `<header class="p-head"><h2>${ic('package')} Cargas</h2><div class="p-sub muted">${all.length} cargas esperando em ${stationIds().length} estações</div></header>
    <div class="filters">
      <select class="input" data-f="dest"><option value="">Todos os destinos</option>${dests.map(d => `<option value="${d}" ${cFilter.dest === d ? 'selected' : ''}>${esc(city(d).name)}</option>`).join('')}</select>
      <select class="input" data-f="cargo"><option value="">Todas as cargas</option>${DB.cargo.map(g => `<option value="${g.id}" ${cFilter.cargo === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
      <select class="input" data-f="sort"><option value="reward" ${cFilter.sort === 'reward' ? 'selected' : ''}>Maior recompensa</option><option value="km" ${cFilter.sort === 'km' ? 'selected' : ''}>Mais curtas</option><option value="new" ${cFilter.sort === 'new' ? 'selected' : ''}>Mais novos</option></select>
      <label class="check"><input type="checkbox" data-f="onlyOk" ${cFilter.onlyOk ? 'checked' : ''}> Só com rota pronta</label>
    </div>
    <section class="p-sec">${list.length ? list.map(c => contractCard(c, { showOrigin: true })).join('') : `<div class="empty">${ic('search-x')}<p>Nenhuma carga com esses filtros.</p></div>`}</section>`;
}

function networkPanel() {
  const owned = ownedLinks(), km = owned.reduce((s, l) => s + l.km, 0);
  return `<header class="p-head"><h2>${ic('route')} Minhas Ferrovias</h2><div class="p-sub muted">${owned.length} trechos · ${fmt(km)} km de trilhos · ${stationIds().length} estações</div></header>
    <section class="p-sec"><h3>Linhas (${state.lines.length}/${maxLines()})</h3>
      ${state.lines.map(line => {
        const segs = lineSegments(line.id), cs = lineCities(line.id);
        const busy = Object.values(state.trips).filter(tr => tr.links.some(l => state.owned[l]?.lineId === line.id)).length;
        const editing = panel.id === line.id;
        return `<div class="line-card ${editing ? 'editing' : ''}" style="--c:${line.color}">
          <div class="lc-head"><span class="sw-line"></span><b>${esc(line.name)}</b><span class="tag ${busy ? 'live' : ''}" style="--c:${busy ? '#22c55e' : '#64748b'}">${busy ? `${busy} em operação` : 'Ociosa'}</span>
            <button class="icon-btn" data-open-line="${line.id}" aria-label="Editar linha">${ic(editing ? 'chevron-up' : 'pencil')}</button></div>
          <small class="muted">${cs.map(c => esc(city(c).name)).join(' · ') || 'sem trechos'} — ${segs.length} trechos, ${fmt(segs.reduce((s, l) => s + l.km, 0))} km</small>
          ${editing ? `<div class="lc-edit"><label class="field"><span>Nome</span><input id="leName" maxlength="28" value="${esc(line.name)}"></label>
            <div class="swatches">${LINE_COLORS.map(c => `<button class="sw ${c === line.color ? 'on' : ''}" style="--c:${c}" data-line-color="${line.id}|${c}"></button>`).join('')}<label class="sw custom"><input type="color" data-line-pick="${line.id}" value="${line.color}">${ic('pipette')}</label></div>
            <button class="btn primary sm" data-save-line="${line.id}">${ic('check')} Salvar nome</button>
            <div class="seg-list">${segs.map(l => `<button class="row-btn" data-open-link="${l.id}"><span>${esc(city(l.a).name)} — ${esc(city(l.b).name)}</span><span class="rb-end">${fmt(l.km)} km</span></button>`).join('')}</div></div>` : ''}
        </div>`;
      }).join('')}
      <p class="muted sm">${ic('info')} Para criar uma linha, compre um trecho e escolha “Nova linha”. Trens usam qualquer trilho seu: as linhas organizam as cores e as estatísticas.</p></section>`;
}

function trainsPanel() {
  const tab = panel.tab || 'fleet';
  const fleet = state.trains.map(t => {
    const m = modelOf(t), d = driverOf(t);
    return `<article class="garage-card" data-open-train="${t.id}">
      <div class="gc-art">${locoSVG(m.category, t.body, t.trim)}</div>
      <div class="gc-body"><b>${esc(t.name)}</b><small>${esc(m.name)} · ${m.speed} km/h · ${m.slots} vagas</small>
        <small>${d ? ic('user-round') + ' ' + esc(d.name) : 'Sem maquinista'} · ${t.status === 'idle' ? 'em ' + esc(city(t.at).name) : 'em viagem'}</small></div>
      <span class="tag ${t.status === 'idle' ? '' : 'live'}" style="--c:${t.status === 'idle' ? '#22c55e' : '#38bdf8'}">${t.status === 'idle' ? 'Livre' : 'Em rota'}</span></article>`;
  }).join('');
  const market = DB.models.filter(m => m.price > 0).map(m => {
    const locked = state.company.level < m.unlockLevel;
    return `<article class="market-card ${locked ? 'locked' : ''}">
      <div class="gc-art">${locoSVG(m.category, m.body, m.trim)}</div>
      <div class="gc-body"><b>${esc(m.name)}</b><small>${m.era} · ${m.speed} km/h · ${m.slots} vagas · ${m.costPerKm.toFixed(2)} cr/km</small><small class="muted">${esc(m.desc)}</small></div>
      ${locked ? `<span class="tag" style="--c:#64748b">${ic('lock')} Nível ${m.unlockLevel}</span>` : `<button class="btn primary sm" data-buy-train="${m.id}" ${state.credits < m.price || state.trains.length >= maxTrains() ? 'disabled' : ''}>${ic('coins')} ${fmt(m.price)}</button>`}</article>`;
  }).join('');
  return `<header class="p-head"><h2>${ic('train-front')} Locomotivas</h2><div class="p-sub muted">${state.trains.length}/${maxTrains()} locomotivas no nível ${state.company.level}</div></header>
    <div class="tabs"><button class="tab ${tab === 'fleet' ? 'on' : ''}" data-tab="fleet">${ic('warehouse')} Garagem</button><button class="tab ${tab === 'market' ? 'on' : ''}" data-tab="market">${ic('store')} Mercado</button></div>
    <section class="p-sec">${tab === 'fleet' ? fleet : `<p class="muted sm">Novas locomotivas são entregues na sua sede (${esc(city(state.company.home).name)}).</p>${market}`}</section>`;
}

function stationsPanel() {
  const ids = stationIds().sort((a, b) => (b === state.company.home) - (a === state.company.home) || city(a).name.localeCompare(city(b).name));
  return `<header class="p-head"><h2>${ic('warehouse')} Estações</h2><div class="p-sub muted">${ids.length} estações na rede</div></header>
    <section class="p-sec">${ids.map(id => {
      const c = city(id), n = contractsAt(id).length, here = trainsAt(id).length;
      return `<button class="row-btn" data-open-city="${id}"><span class="flag">${flag(c.country)}</span><span><b>${id === state.company.home ? ic('star', 'gold') : ''}${esc(c.name)}</b><small>Nível ${state.stations[id].level} · ${here} trem(ns) parado(s)</small></span><span class="rb-end">${n ? `<span class="count">${n}</span> contratos` : ''}</span></button>`;
    }).join('')}</section>`;
}

function settingsPanel() {
  const prof = ArcadeIntegration.profile();
  return `<header class="p-head"><h2>${ic('settings')} Configurações</h2></header>
    <section class="p-sec"><h3>Companhia</h3>
      <label class="field"><span>Nome</span><input id="coName" maxlength="28" value="${esc(state.company.name)}"></label>
      <div class="field"><span>Cor</span><div class="swatches">${COMPANY_COLORS.map(c => `<button class="sw ${c === state.company.color ? 'on' : ''}" style="--c:${c}" data-co-color="${c}"></button>`).join('')}</div></div>
      <button class="btn primary sm" data-save-company>${ic('check')} Salvar</button></section>
    <section class="p-sec"><h3>Nuvem</h3>
      <p class="muted sm">${CloudSync.enabled ? (CloudSync.status === 'missing' ? 'Você está logado, mas o banco ainda não tem a tabela <code>rail_atlas_saves</code> (rode supabase/schema.sql). O progresso fica salvo neste navegador.' : 'Sua companhia é salva na nuvem do Arcade Social e continua em qualquer aparelho em que você entrar com a mesma conta.') : 'Modo local: o progresso fica salvo neste navegador.'}</p></section>
    <section class="p-sec"><h3>Arcade Social</h3>
      <p class="muted sm">${prof ? `Conectado como <b>${esc(prof.username)}</b>. Cada entrega envia um evento ao Arcade Hub, que calcula e limita o XP do seu perfil (sem repetir entregas).` : 'Você está jogando como convidado: o progresso fica salvo neste navegador, mas sem XP de perfil. Entre no Arcade Hub para vincular a companhia à sua conta.'}</p>
      <div class="kpis"><div><b>${state.arcade.reported}</b><small>eventos enviados</small></div><div><b>${fmt(ArcadeIntegration.grantedToday())}</b><small>XP concedido hoje</small></div></div></section>
    <section class="p-sec"><h3>Progresso</h3>
      <div class="unlocks">${UNLOCKS.map(u => `<div class="${state.company.level >= u.level ? 'got' : ''}">${ic(state.company.level >= u.level ? 'check-circle-2' : 'lock')} <b>Nv ${u.level}</b> ${esc(u.text)}</div>`).join('')}</div>
      <div class="kpis"><div><b>${state.stats.deliveries}</b><small>entregas</small></div><div><b>${fmt(state.stats.tons)} t</b><small>transportadas</small></div><div><b>${fmt(state.stats.earned)}</b><small>créditos ganhos</small></div></div></section>
    <section class="p-sec"><h3>Registro de operações</h3><div class="log">${state.log.slice(0, 20).map(l => `<div class="${l.kind}">${ic(l.icon)}<span>${esc(l.text)}</span></div>`).join('')}</div></section>
    <section class="p-sec danger"><h3>Recomeçar</h3><p class="muted sm">Apaga a companhia salva neste navegador e volta à tela inicial.</p><button class="btn danger sm" data-reset>${ic('trash-2')} Apagar companhia</button></section>`;
}

/* ==================== AÇÕES ==================== */
function bindChrome() {
  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b || !state) return;
    const v = b.dataset.view;
    if (v === 'map') { closePanel(); map.focus(city(state.company.home).lon, city(state.company.home).lat, 12); $$('.nav-btn').forEach(x => x.classList.toggle('on', x === b)); return; }
    openPanel(v);
  });
  $('#zoomIn').onclick = () => map.zoomIn();
  $('#zoomOut').onclick = () => map.zoomOut();
  $('#zoomHome').onclick = () => state ? focusCity(state.company.home, 12) : map.reset();
  $('#zoomWorld').onclick = () => map.reset();
  $('#tutorial').addEventListener('click', e => { if (e.target.closest('[data-skip-tut]')) { state.tutorial.done = true; save(); renderTutorial(); } });
  $('#ticker').addEventListener('click', e => { const b = e.target.closest('[data-open-train]'); if (b) openPanel('train', b.dataset.openTrain); });

  const p = $('#panel');
  p.addEventListener('click', e => {
    const q = s => e.target.closest(s);
    let b;
    if (q('[data-close-panel]')) return closePanel();
    if ((b = q('[data-tab]'))) { panel.tab = b.dataset.tab; return renderPanel(); }
    if ((b = q('[data-mode]'))) {
      const [tid, mode] = b.dataset.mode.split('|'), t = trainById(tid);
      if (mode === 'semi') { t.auto = { ...defaultAuto(), ...t.auto, start: t.at, route: [] }; routePick = tid; map.setHighlight({ cities: [t.at] }); return renderPanel(); }
      routePick = null;
      const r = setMode(tid, mode); if (!r.ok) toast(esc(r.reason), 'warn', 'lock'); else if (mode !== 'manual') toast(`${esc(t.name)} agora está no modo ${MODES[mode]}.`, 'success', 'bot');
      return renderPanel();
    }
    if ((b = q('[data-fixed-edit]'))) { const t = trainById(b.dataset.fixedEdit); t.auto = { ...defaultAuto(), ...t.auto, start: t.at, route: [] }; routePick = t.id; return renderPanel(); }
    if ((b = q('[data-fixed-del]'))) { const [tid, i] = b.dataset.fixedDel.split('|'); trainById(tid).auto.route.splice(+i); save(); return renderPanel(); }
    if ((b = q('[data-fixed-cancel]'))) { routePick = null; map.setHighlight(null); return renderPanel(); }
    if ((b = q('[data-fixed-save]'))) { const t = trainById(b.dataset.fixedSave); routePick = null; map.setHighlight(null); const r = setMode(t.id, 'semi'); toast(r.ok ? `Rota fixa ativa: ${esc(t.name)} vai e volta sozinho.` : esc(r.reason), r.ok ? 'success' : 'warn', 'repeat'); return renderPanel(); }
    if ((b = q('[data-open-driver]'))) return openPanel('driver', b.dataset.openDriver);
    if (q('[data-hire]')) { if (!spend(hireCost(), 'driver')) return toast('Créditos insuficientes.', 'warn', 'coins'); const d = hireDriver(); log('user-plus', `${d.name} entrou para a equipe.`, 'success'); return openPanel('driver', d.id); }
    if ((b = q('[data-dv]'))) { const [k, v] = b.dataset.dv.split('|'); editDriver(panel.id, { [k]: v }); return renderPanel(); }
    if ((b = q('[data-dv-name]'))) { editDriver(b.dataset.dvName, { name: $('#dvName').value }); document.activeElement.blur(); toast('Nome salvo.', 'success', 'check'); return; }
    if (planning) {
      if ((b = q('[data-toggle]'))) { const id = b.dataset.toggle; planning.picked.has(id) ? planning.picked.delete(id) : planning.picked.add(id); return renderPanel(); }
      if (q('[data-wp-auto]')) { planning.wps = []; return renderPanel(); }
      if ((b = q('[data-wp-only]'))) { planning.wps = [b.dataset.wpOnly]; return renderPanel(); }
      if ((b = q('[data-wp-del]'))) { planning.wps.splice(+b.dataset.wpDel, 1); return renderPanel(); }
      if (q('[data-store-rest]')) { planning.storeRest = !planning.storeRest; return renderPanel(); }
      if (q('#planGo')) return planning.go && doDispatch(planning.trainId, planning.go, planning.wps, { storeRest: !!planning.storeRest });
      if (q('[data-plan-cancel]')) return openPanel('train', planning.trainId);
    }
    if ((b = q('[data-plan]'))) { e.stopPropagation(); const [t, c] = b.dataset.plan.split('|'); return startPlan(t, c); }
    if ((b = q('[data-open-city]'))) { focusCity(b.dataset.openCity); return openPanel('city', b.dataset.openCity); }
    if ((b = q('[data-open-link]'))) return openPanel('link', b.dataset.openLink);
    if ((b = q('[data-open-train]'))) return openPanel('train', b.dataset.openTrain);
    if ((b = q('[data-open-line]'))) { const id = b.dataset.openLine; panel = { view: 'network', id: panel.view === 'network' && panel.id === id ? null : id }; openPanel('network', panel.id); highlightLine(panel.id); return; }
    if ((b = q('[data-route-to]'))) return showMissing(b.dataset.routeTo);
    if ((b = q('[data-buy]'))) return doBuy(b.dataset.buy);
    if ((b = q('[data-upgrade]'))) { const [cid, key] = b.dataset.upgrade.split('|'); const r = buyUpgrade(cid, key); return toast(r.ok ? `${esc(DB.upgrades[key].name)} nível ${r.level}!` : esc(r.reason), r.ok ? 'success' : 'warn', r.ok ? 'hammer' : 'alert-triangle'); }
    if ((b = q('[data-repair]'))) { const r = repairTrain(b.dataset.repair); return toast(r.ok ? `Locomotiva revisada (−${fmt(r.cost)} cr).` : esc(r.reason), r.ok ? 'success' : 'warn', 'wrench'); }
    if ((b = q('[data-lcolor]'))) { $('#nlColor').value = b.dataset.lcolor; $$('[data-lcolor]').forEach(x => x.classList.toggle('on', x === b)); return; }
    if ((b = q('[data-line-color]'))) { const [id, c] = b.dataset.lineColor.split('|'); editLine(id, { color: c }); return; }
    if ((b = q('[data-save-line]'))) { editLine(b.dataset.saveLine, { name: $('#leName').value }); document.activeElement.blur(); toast('Linha atualizada.', 'success', 'check'); return; }
    if ((b = q('[data-save-train]'))) { customizeTrain(b.dataset.saveTrain, { name: $('#tName').value, body: $('#tBody').value, trim: $('#tTrim').value }); document.activeElement.blur(); toast('Aparência salva.', 'success', 'paintbrush'); return; }
    if ((b = q('[data-buy-train]'))) { const r = buyTrain(b.dataset.buyTrain, state.company.home); if (!r.ok) return toast(esc(r.reason), 'warn', 'alert-triangle'); toast(`${esc(r.train.name)} chegou à garagem!`, 'success', 'train-front'); panel.tab = 'fleet'; return renderPanel(); }
    if ((b = q('[data-co-color]'))) { $$('[data-co-color]').forEach(x => x.classList.toggle('on', x === b)); return; }
    if (q('[data-save-company]')) {
      const name = $('#coName').value.trim(); const color = $('[data-co-color].on')?.dataset.coColor;
      if (name) state.company.name = name.slice(0, 28);
      if (color) state.company.color = color;
      document.activeElement.blur(); save(); invalidate('top', 'map', 'panel'); toast('Companhia atualizada.', 'success', 'check'); return;
    }
    if (q('[data-reset]')) return modal({
      title: 'Apagar companhia?', body: `<p>Toda a rede, trens e créditos de <b>${esc(state.company.name)}</b> serão apagados deste navegador. Isso não pode ser desfeito.</p>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Apagar', cls: 'danger', icon: 'trash-2', onClick: () => { deleteSave(userId); setState(null); location.reload(); } }]
    });
  });
  p.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'buyLine') $('#newLine').hidden = t.value !== 'new';
    if (t.id === 'wpAdd' && t.value && planning) { const v = t.value; t.blur(); return addStop(v); }
    if (t.dataset.auto) {
      const [tid, key] = t.dataset.auto.split('|'), tr = trainById(tid);
      const val = t.type === 'checkbox' ? t.checked : key === 'minProfit' ? Math.max(0, +t.value || 0) : t.value || null;
      tr.auto = { ...defaultAuto(), ...tr.auto, [key]: val }; t.blur(); save(); return renderPanel();
    }
    if (t.dataset.assign && t.value) { const r = assignDriver(t.dataset.assign, t.value); t.blur(); if (!r.ok) toast(esc(r.reason), 'warn', 'alert-triangle'); return renderPanel(); }
    if (t.dataset.moveSeg) { moveSegment(t.dataset.moveSeg, t.value); t.blur(); }
    if (t.dataset.f) { cFilter[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; t.blur(); renderPanel(); }
    if (t.dataset.linePick) editLine(t.dataset.linePick, { color: t.value });
  });
  p.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'tBody' || t.id === 'tTrim') {
      const tr = trainById(panel.id);
      $('#locoStage').innerHTML = locoSVG(modelOf(tr).category, $('#tBody').value, $('#tTrim').value, { cls: 'big' });
    }
  });
  p.addEventListener('focusout', () => setTimeout(() => { if (dirty.has('panel') && !p.contains(document.activeElement)) invalidate('panel'); }, 0));
}

function highlightLine(lineId) {
  if (!lineId) return map.setHighlight(null);
  map.setHighlight({ links: lineSegments(lineId).map(l => l.id), cities: lineCities(lineId) });
}

function doBuy(linkId) {
  const sel = $('#buyLine').value;
  const choice = sel === 'new' ? { name: $('#nlName').value, color: $('#nlColor').value } : { lineId: sel };
  const r = buySegment(linkId, choice);
  if (!r.ok) return toast(esc(r.reason), 'warn', 'alert-triangle');
  const l = DB.linkById[linkId];
  toast(`Trecho comprado! ${r.opened.length ? `Nova estação em <b>${esc(city(r.opened[0]).name)}</b>.` : ''}`, 'success', 'route');
  tutorialAt(4, 5);
  document.activeElement?.blur();
  const nc = r.opened[0] || l.b;
  if (r.opened.length) { focusCity(nc); openPanel('city', nc); } else renderPanel();
}

/* ==================== PLANEJAR VIAGEM ==================== */
// Planejamento acontece no painel lateral: o mapa continua livre para clicar
// nas cidades e montar a rota (no celular, o painel vira a gaveta de baixo).
let planning = null; // { trainId, picked:Set, wps:[], go }
function startPlan(trainId, preselect) {
  const t = trainById(trainId);
  if (!t || t.status !== 'idle') return toast('Esta locomotiva está em viagem.', 'warn', 'train-front');
  planning = { trainId, picked: new Set(preselect && state.contracts[preselect]?.origin === t.at ? [preselect] : []), wps: [], go: null };
  openPanel('plan', trainId);
}

function addStop(id) {
  const t = trainById(planning.trainId), m = modelOf(t);
  const from = planning.wps[planning.wps.length - 1] || t.at;
  if (id === from) return;
  if (!findRoute(from, id, m.speed)) return toast(`Sem trilhos seus entre ${esc(city(from).name)} e ${esc(city(id).name)}.`, 'warn', 'unplug');
  planning.wps.push(id);
  renderPanel();
}

function planPanel(trainId) {
  const t = trainById(trainId), m = modelOf(t), plan = planning;
  if (!plan || t.status !== 'idle') return trainPanel(trainId);
  const cargo = contractsAt(t.at).sort((a, b) => b.tutorial - a.tutorial || routable(b) - routable(a) || b.reward / b.slots - a.reward / a.slots);
  const picked = [...plan.picked].map(id => state.contracts[id]).filter(c => c?.status === 'open');
  const used = picked.reduce((s, c) => s + c.slots, 0), free = m.slots - used;
  // com paradas escolhidas, cargas cujo destino fica fora da rota permanecem na estação
  const base = plan.wps.length ? planTrip(t.id, [], plan.wps) : null;
  const go = base?.ok ? picked.filter(c => base.path.indexOf(c.dest, 1) >= 0) : picked;
  const left = picked.length - go.length;
  // baldeação: levar as cargas fora da rota até o armazém da última parada
  const storing = plan.storeRest && left > 0;
  const sendIds = (storing ? picked : go).map(c => c.id);
  const p = planTrip(t.id, sendIds, plan.wps, { storeRest: storing });
  plan.go = p.ok ? sendIds : null;
  const dests = [...new Set(picked.map(c => c.dest))];
  map.setHighlight(p.ok ? { links: p.links, cities: [t.at, ...p.waypoints] } : { cities: [t.at, ...dests] });
  const pips = Array.from({ length: m.slots }, (_, i) => {
    let acc = 0; const c = picked.find(x => (acc += x.slots) > i);
    return `<i style="${c ? `background:${cargoOf(c).color}` : ''}"></i>`;
  }).join('');
  const stations = stationIds().filter(id => id !== t.at && findRoute(t.at, id, m.speed)).sort((a, b) => city(a).name.localeCompare(city(b).name));
  return `<header class="p-head"><div class="p-kicker">${ic('route')} Planejar viagem</div><h2>${esc(t.name)}</h2>
      <div class="p-sub muted">Saindo de ${esc(city(t.at).name)}</div></header>
    <div class="plan-cap"><div class="cap-pips">${pips}</div><b>${used}/${m.slots}</b><small>vagas</small></div>
    <section class="p-sec"><h3>${ic('package')} 1 · Carregar</h3>
      <div class="plan-list">${cargo.length ? cargo.map(c => {
        const on = plan.picked.has(c.id), can = on || (c.slots <= free && routable(c));
        return `<button class="plan-item ${on ? 'on' : ''}" data-toggle="${c.id}" ${can ? '' : 'disabled'}>
          ${cargoChip(c)}<span class="pi-main"><b>${esc(itemOf(c).name)}</b><small>→ ${esc(city(c.dest).name)} · ${fmt(c.km)} km${c.stored ? ' · do armazém' : ''}${routable(c) ? '' : ' · sem trilhos'}</small></span>
          ${slotPips(c.slots, cargoOf(c).color)}<span class="pi-rw">${fmt(c.reward)}</span><span class="pi-check">${ic(on ? 'check-square' : 'square')}</span></button>`;
      }).join('') : `<p class="muted sm">Nenhuma carga nesta estação agora.</p>`}</div></section>
    <section class="p-sec"><h3>${ic('map-pin')} 2 · Rota</h3>
      <p class="plan-hint">${ic('mouse-pointer-click')} Toque nas cidades do mapa para adicionar paradas, na ordem.</p>
      <div class="route-quick">
        <button class="chip ${!plan.wps.length ? 'on' : ''}" data-wp-auto ${picked.length ? '' : 'disabled'}>${ic('sparkles')} Trajeto completo</button>
        ${dests.map(d => `<button class="chip ${plan.wps.length === 1 && plan.wps[0] === d ? 'on' : ''}" data-wp-only="${d}">Só até ${esc(city(d).name)}</button>`).join('')}
      </div>
      <div class="route-stops"><span class="stop origin">${esc(city(t.at).name)}</span>${(p.ok ? p.waypoints : plan.wps).map((w, i) => `<span class="stop">${esc(city(w).name)}${plan.wps.length ? `<button data-wp-del="${i}" aria-label="Remover parada">${ic('x')}</button>` : ''}</span>`).join('')}</div>
      <select class="input" id="wpAdd" aria-label="Adicionar parada"><option value="">+ Adicionar parada pela lista…</option>${stations.map(id => `<option value="${id}">${esc(city(id).name)}</option>`).join('')}</select>
      ${p.ok ? `<div class="plan-sum">
          <div><small>Percurso</small><b>${esc(p.path.map(c => city(c).name).join(' → '))}</b></div>
          <div class="kpis"><div><b>${duration(p.secs)}</b><small>tempo</small></div><div><b>${fmt(p.km)} km</b><small>distância</small></div>
            <div><b>${fmt(p.revenue)}</b><small>receita</small></div><div><b class="${p.profit >= 0 ? 'pos' : 'neg'}">${p.profit >= 0 ? '+' : ''}${fmt(p.profit)}</b><small>lucro (custo ${fmt(p.cost)})</small></div></div>
          ${p.discount ? `<p class="muted sm">${ic('fuel')} Posto de ${esc(city(t.at).name)}: −${Math.round(p.discount * 100)}% no combustível.</p>` : ''}
          ${p.jam ? `<p class="warn">${ic('traffic-cone')} Trechos congestionados: viagem ${Math.round((p.slow - 1) * 100)}% mais lenta.</p>` : ''}</div>`
        : `<div class="warn">${ic('alert-triangle')} ${esc(p.reason)}</div>`}
      ${left ? `<label class="store-opt"><input type="checkbox" data-store-rest ${plan.storeRest ? 'checked' : ''}><span><b>Guardar no armazém de ${esc(city((p.ok ? p.path : [t.at, ...plan.wps]).slice(-1)[0]).name)}</b><small>${left} carga(s) não passam pelo destino nesta rota. ${plan.storeRest ? 'Elas serão deixadas no armazém para outro trem levar.' : `Sem marcar, ficam em ${esc(city(t.at).name)}.`}</small></span></label>` : ''}
    </section>
    <div class="plan-foot"><button class="btn ghost" data-plan-cancel>Cancelar</button><button class="btn primary" id="planGo" ${p.ok ? '' : 'disabled'}>${ic('play')} Fazer rota</button></div>`;
}

function doDispatch(trainId, contractIds, waypoints, opts = {}) {
  const r = dispatch(trainId, contractIds, waypoints, Date.now(), opts);
  if (!r.ok) return toast(esc(r.reason), 'warn', 'alert-triangle');
  planning = null;
  map.setHighlight(null);
  const t = trainById(trainId);
  toast(`<b>${esc(t.name)}</b> partiu! Chegada em ${duration((r.trip.arriveAt - Date.now()) / 1000)}.`, 'info', 'train-front');
  if (state.tutorial.step <= 2) tutorialAt(state.tutorial.step, 3);
  openPanel('train', trainId);
}

function showMissing(contractId) {
  const c = state.contracts[contractId];
  // menor caminho pela malha completa, para mostrar quais trechos faltam
  const dist = { [c.origin]: 0 }, prev = {}, open = [c.origin], seen = new Set();
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const u = open.shift(); if (u === c.dest) break; if (seen.has(u)) continue; seen.add(u);
    DB.adj[u].forEach(l => { const v = l.a === u ? l.b : l.a, d = dist[u] + (isOwned(l.id) ? 0 : segmentCost(l)); if (dist[v] == null || d < dist[v]) { dist[v] = d; prev[v] = l; open.push(v); } });
  }
  const links = []; let x = c.dest;
  while (x !== c.origin && prev[x]) { links.unshift(prev[x]); x = prev[x].a === x ? prev[x].b : prev[x].a; }
  const missing = links.filter(l => !isOwned(l.id));
  map.setHighlight({ links: links.map(l => l.id), cities: [c.origin, c.dest] });
  modal({
    title: `Rota até ${esc(city(c.dest).name)}`,
    body: `<p class="muted">Faltam ${missing.length} trecho(s), total de <b>${fmt(missing.reduce((s, l) => s + segmentCost(l), 0))} cr</b>. Compre em ordem a partir da sua rede.</p>
      ${missing.map(l => `<button class="row-btn" data-ml="${l.id}"><span><b>${esc(city(l.a).name)} — ${esc(city(l.b).name)}</b><small>${fmt(l.km)} km · ${esc(DB.linkTypes[l.type].name)}${state.company.level < l.minLevel ? ` · nível ${l.minLevel}` : ''}</small></span><span class="rb-end">${ic('coins')} ${fmt(segmentCost(l))}</span></button>`).join('')}`,
    onMount: card => card.addEventListener('click', e => { const b = e.target.closest('[data-ml]'); if (b) { closeModal(); openPanel('link', b.dataset.ml); } })
  });
}

function focusCity(id, width = 14, animate = true) { const c = city(id); map.focus(c.lon, c.lat, width, animate); }

function arrivalToasts(done) {
  const byTrain = new Map();
  done.forEach(d => { const k = d.train?.id || '?'; (byTrain.get(k) || byTrain.set(k, []).get(k)).push(d); });
  for (const list of byTrain.values()) {
    const t = list[0].train, dv = t && driverOf(t), at = city(list[0].contract.dest).name;
    const cr = list.reduce((s, d) => s + d.contract.reward, 0), xp = list.reduce((s, d) => s + d.contract.xp, 0);
    toast(`<div class="arrival">${dv ? driverSVG(dv, 40) : ''}<div><b>${esc(t?.name || 'Trem')} em ${esc(at)}</b><br>${list.length} carga(s) entregue(s) · <span class="pos">+${fmt(cr)} cr</span> · +${xp} XP${userId ? ' · XP Arcade enviado' : ''}</div></div>`, 'success', 'package-check', 5000);
  }
}

function offlineSummary(done, away, gained) {
  const capped = away > ECONOMY.offlineCapHours * 3600e3;
  modal({
    title: `${ic('moon')} Enquanto você esteve fora`,
    body: `<p class="muted">Ausência de ${duration(away / 1000)}${capped ? ` (automação limitada a ${ECONOMY.offlineCapHours}h)` : ''}.</p>
      <div class="kpis"><div><b>${done.length}</b><small>entregas concluídas</small></div><div><b class="pos">+${fmt(gained)}</b><small>créditos</small></div></div>
      ${done.slice(0, 8).map(({ contract: c, train: t }) => `<div class="row-btn static">${cargoChip(c)}<span><b>${esc(itemOf(c).name)}</b><small>${esc(t?.name || '')} → ${esc(city(c.dest).name)}</small></span><span class="rb-end pos">+${fmt(c.reward)}</span></div>`).join('')}`,
    actions: [{ label: 'Continuar', cls: 'primary', icon: 'play' }]
  });
}

/* ==================== AUTOMAÇÃO ==================== */
let routePick = null; // trem cuja rota fixa está sendo desenhada no mapa
function addFixedStop(id) {
  const t = trainById(routePick), a = t.auto;
  const from = a.route[a.route.length - 1] || a.start;
  if (id === from) return;
  if (!findRoute(from, id, 9999)) return toast(`Sem trilhos seus entre ${esc(city(from).name)} e ${esc(city(id).name)}.`, 'warn', 'unplug');
  a.route.push(id);
  map.setHighlight({ cities: [a.start, ...a.route] });
  save(); renderPanel();
}

function automationSection(t) {
  const a = t.auto || defaultAuto(), lvl = state.company.level;
  const modes = Object.entries(MODES).map(([k, n]) => {
    const locked = lvl < MODE_LEVEL[k];
    return `<button class="chip ${t.mode === k ? 'on' : ''}" data-mode="${t.id}|${k}" ${locked ? 'disabled' : ''}>${ic(locked ? 'lock' : { manual: 'hand', semi: 'repeat', auto: 'bot' }[k])} ${n}${locked ? ` · Nv ${MODE_LEVEL[k]}` : ''}</button>`;
  }).join('');
  const st = stationIds().sort((x, y) => city(x).name.localeCompare(city(y).name));
  let body = '';
  if (t.mode === 'manual' && !routePick) body = `<p class="muted sm">Você planeja cada viagem. Na rota fixa, o trem repete um percurso de ida e volta; no automático, escolhe sozinho as cargas mais lucrativas — e ambos continuam rodando com o jogo fechado (até ${ECONOMY.offlineCapHours}h).</p>`;
  if (t.mode === 'semi' || routePick === t.id) {
    const route = [a.start || t.at, ...(a.route || [])];
    body = `<div class="route-stops">${route.map((c, i) => `<span class="stop ${i ? '' : 'origin'}">${esc(city(c).name)}${i ? `<button data-fixed-del="${t.id}|${i - 1}" aria-label="Remover">${ic('x')}</button>` : ''}</span>`).join('')}</div>
      ${routePick === t.id
        ? `<p class="plan-hint">${ic('mouse-pointer-click')} Toque nas cidades do mapa para montar a rota. O trem vai e volta por ela.</p>
           <div class="row-actions"><button class="btn ghost sm" data-fixed-cancel="${t.id}">Cancelar</button><button class="btn primary sm" data-fixed-save="${t.id}" ${a.route.length ? '' : 'disabled'}>${ic('check')} Ativar rota fixa</button></div>`
        : `<button class="btn ghost sm" data-fixed-edit="${t.id}">${ic('pencil')} Redesenhar rota</button>`}`;
  }
  if (t.mode === 'auto') body = `
    <label class="field"><span>Atuar em</span><select class="input" data-auto="${t.id}|lineId"><option value="">Toda a rede</option>${state.lines.map(l => `<option value="${l.id}" ${a.lineId === l.id ? 'selected' : ''}>Só destinos da ${esc(l.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Lucro mínimo por viagem</span><input class="input" type="number" min="0" step="10" data-auto="${t.id}|minProfit" value="${a.minProfit}"></label>
    <label class="field"><span>Base</span><select class="input" data-auto="${t.id}|base">${st.map(c => `<option value="${c}" ${a.base === c ? 'selected' : ''}>${esc(city(c).name)}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" data-auto="${t.id}|returnHome" ${a.returnHome ? 'checked' : ''}> Voltar à base quando não houver carga</label>`;
  return `<section class="p-sec"><h3>${ic('bot')} Despacho</h3><div class="route-quick">${modes}</div>${body}
    ${t.mode !== 'manual' ? `<label class="check"><input type="checkbox" data-auto="${t.id}|autoRepair" ${a.autoRepair ? 'checked' : ''}> Revisão automática na oficina (condição abaixo de 55%)</label>` : ''}</section>`;
}

/* ==================== RELATÓRIOS ==================== */
function reportsPanel() {
  const H = state.reports.hourly, now = Math.floor(Date.now() / 3600e3);
  const hours = Array.from({ length: 12 }, (_, i) => ({ h: now - 11 + i, ...(H[now - 11 + i] || { revenue: 0, cost: 0, deliveries: 0 }) }));
  const max = Math.max(1, ...hours.map(x => Math.max(x.revenue, x.cost)));
  const day = Object.entries(H).filter(([h]) => h > now - 24).reduce((a, [, v]) => ({ revenue: a.revenue + v.revenue, cost: a.cost + v.cost, deliveries: a.deliveries + v.deliveries }), { revenue: 0, cost: 0, deliveries: 0 });
  const bars = hours.map((x, i) => `<g transform="translate(${i * 26 + 4} 0)"><title>${new Date(x.h * 3600e3).getHours()}h: receita ${fmt(x.revenue)}, custo ${fmt(x.cost)}</title>
    <rect x="0" y="${100 - x.revenue / max * 96}" width="10" height="${x.revenue / max * 96}" rx="2" class="b-rev"/><rect x="11" y="${100 - x.cost / max * 96}" width="10" height="${x.cost / max * 96}" rx="2" class="b-cost"/>
    <text x="10.5" y="114">${new Date(x.h * 3600e3).getHours()}h</text></g>`).join('');
  const lines = state.lines.map(l => ({ l, r: state.reports.lines[l.id] || { revenue: 0, cost: 0, trips: 0 } })).sort((a, b) => (b.r.revenue - b.r.cost) - (a.r.revenue - a.r.cost));
  const autos = state.trains.filter(t => t.mode !== 'manual');
  return `<header class="p-head"><h2>${ic('bar-chart-3')} Relatórios</h2><div class="p-sub muted">Últimas 24 horas</div></header>
    <div class="kpis"><div><b class="pos">${fmt(day.revenue)}</b><small>receita</small></div><div><b class="neg">${fmt(day.cost)}</b><small>combustível</small></div>
      <div><b class="${day.revenue - day.cost >= 0 ? 'pos' : 'neg'}">${fmt(day.revenue - day.cost)}</b><small>lucro</small></div><div><b>${day.deliveries}</b><small>entregas</small></div></div>
    <section class="p-sec"><h3>${ic('activity')} Por hora</h3><svg class="chart" viewBox="0 0 316 120">${bars}</svg>
      <div class="legend-row"><span><i class="b-rev"></i>Receita</span><span><i class="b-cost"></i>Custo</span></div></section>
    <section class="p-sec"><h3>${ic('route')} Lucro por linha</h3>${lines.length ? lines.map(({ l, r }) => `<div class="row-btn static"><span class="sw-line" style="--c:${l.color}"></span><span><b>${esc(l.name)}</b><small>${r.trips} viagens · receita ${fmt(r.revenue)} · custo ${fmt(r.cost)}</small></span><span class="rb-end ${r.revenue - r.cost >= 0 ? 'pos' : 'neg'}">${fmt(r.revenue - r.cost)}</span></div>`).join('') : '<p class="muted sm">Sem linhas ainda.</p>'}</section>
    <section class="p-sec"><h3>${ic('bot')} Automação (${autos.length})</h3>${autos.length ? autos.map(t => `<button class="row-btn" data-open-train="${t.id}"><span class="tk-dot" style="background:${t.body}"></span><span><b>${esc(t.name)}</b><small>${MODES[t.mode]} · ${t.status === 'idle' ? 'aguardando carga em ' + esc(city(t.at).name) : 'em viagem'}</small></span></button>`).join('') : '<p class="muted sm">Nenhuma locomotiva automatizada. Ative na tela da locomotiva (rota fixa no nível 2, automático no nível 3).</p>'}</section>
    <section class="p-sec"><h3>${ic('bell')} Avisos operacionais</h3><div class="log">${state.log.slice(0, 25).map(l => `<div class="${l.kind}">${ic(l.icon)}<span>${esc(l.text)}<small> · ${new Date(l.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></span></div>`).join('')}</div></section>`;
}

/* ==================== MAQUINISTAS ==================== */
const hireCost = () => 300 + state.drivers.length * 200;
function driversPanel() {
  const free = state.drivers.filter(d => !state.trains.some(t => t.driverId === d.id));
  return `<header class="p-head"><h2>${ic('user-round')} Maquinistas</h2><div class="p-sub muted">${state.drivers.length} na equipe · ${free.length} livres</div></header>
    <p class="muted sm">Cada nível de experiência dá +0,5% de velocidade e −1% de combustível ao trem (até o nível 10). A aparência é só estilo.</p>
    <section class="p-sec">${state.drivers.map(d => {
      const t = state.trains.find(x => x.driverId === d.id);
      return `<button class="row-btn" data-open-driver="${d.id}">${driverSVG(d, 44)}<span><b>${esc(d.name)}</b><small>Nível ${d.level} · ${t ? 'conduz ' + esc(t.name) : 'livre'}</small><span class="bar xs"><span style="width:${d.xp / (d.level * 150) * 100}%"></span></span></span><span class="rb-end">${ic('pencil')}</span></button>`;
    }).join('')}
    <button class="btn primary big" data-hire ${state.credits < hireCost() ? 'disabled' : ''}>${ic('user-plus')} Contratar maquinista · ${fmt(hireCost())} cr</button></section>`;
}
function driverPanel(id) {
  const d = state.drivers.find(x => x.id === id); if (!d) return driversPanel();
  const t = state.trains.find(x => x.driverId === d.id);
  const O = DRIVER_OPTIONS;
  const sw = (key, list) => `<div class="swatches">${list.map(c => `<button class="sw ${d[key] === c ? 'on' : ''}" style="--c:${c}" data-dv="${key}|${c}" aria-label="${c}"></button>`).join('')}</div>`;
  const chips = (key, list) => `<div class="route-quick">${list.map(v => `<button class="chip ${d[key] === v ? 'on' : ''}" data-dv="${key}|${v}">${esc(v)}</button>`).join('')}</div>`;
  return `<header class="p-head"><div class="p-kicker">${ic('user-round')} Maquinista · nível ${d.level}</div><h2>${esc(d.name)}</h2></header>
    <div class="driver-stage">${driverSVG(d, 120)}</div>
    <section class="p-sec">
      <label class="field"><span>Nome</span><input id="dvName" maxlength="22" value="${esc(d.name)}"></label>
      <div class="field"><span>Tom de pele</span>${sw('skin', O.skin)}</div>
      <div class="field"><span>Penteado</span>${chips('hair', O.hair)}</div>
      <div class="field"><span>Cor do cabelo</span>${sw('hairColor', O.hairColor)}</div>
      <div class="field"><span>Chapéu</span>${chips('hat', O.hat)}</div>
      <div class="field"><span>Cor do uniforme</span>${sw('uniformColor', O.uniformColor)}</div>
      <div class="field"><span>Acessório</span>${chips('accessory', O.accessory)}</div>
      <button class="btn ghost sm" data-dv-name="${d.id}">${ic('check')} Salvar nome</button></section>
    <section class="p-sec"><h3>${ic('train-front')} Escala</h3>
      <select class="input" data-assign="${d.id}"><option value="">${t ? 'Conduzindo ' + esc(t.name) : 'Sem locomotiva'}</option>${state.trains.filter(x => x !== t && x.status === 'idle').map(x => `<option value="${x.id}">Passar para ${esc(x.name)}${x.driverId ? ' (troca)' : ''}</option>`).join('')}</select></section>`;
}

/* ==================== CONQUISTAS ==================== */
function achievementsPanel() {
  const m = achievementMetrics(), got = Object.keys(state.achievements).length;
  return `<header class="p-head"><h2>${ic('award')} Conquistas</h2><div class="p-sub muted">${got}/${DB.achievements.length} desbloqueadas · cada uma rende créditos e XP no Arcade Hub</div></header>
    <section class="p-sec">${DB.achievements.map(a => {
      const done = !!state.achievements[a.id], cur = Math.min(a.goal, m[a.metric] || 0);
      return `<div class="ach ${done ? 'done' : ''}"><span class="ach-ic">${ic(done ? a.icon : 'lock')}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
        ${done ? `<small class="pos">Desbloqueada em ${new Date(state.achievements[a.id]).toLocaleDateString('pt-BR')}</small>` : `<div class="bar xs"><span style="width:${cur / a.goal * 100}%"></span></div><small>${fmt(cur)}/${fmt(a.goal)}</small>`}</div>
        <span class="ach-rw">${ic('coins')} ${fmt(a.reward)}</span></div>`;
    }).join('')}</section>`;
}

/* ==================== SOCIAL ==================== */
let rankCache = null;
const DEMO_RIVALS = [['Trilhos do Sertão', 'MaxMemória', 7, 412, 23], ['Expresso Aurora', 'LunaPixel', 6, 305, 19], ['Ferrovia Bandeirante', 'Joaninha', 4, 158, 11], ['Cia. Vale Verde', 'TioByte', 3, 77, 7], ['Rápido do Litoral', 'NeoGamer', 2, 31, 4]];
function socialPanel() {
  const prof = ArcadeIntegration.profile();
  const me = { company: state.company.name, username: prof?.username || 'Você', level: state.company.level, deliveries: state.stats.deliveries, stations: stationIds().length, me: true };
  if (CloudSync.enabled && !rankCache) CloudSync.ranking().then(r => { rankCache = r || []; if (panel.view === 'social') renderPanel(); });
  const cloud = CloudSync.enabled && rankCache?.length;
  const rows = cloud ? rankCache : [...DEMO_RIVALS.map(([company, username, level, deliveries, stations]) => ({ company, username, level, deliveries, stations })), me].sort((a, b) => b.deliveries - a.deliveries);
  return `<header class="p-head"><h2>${ic('users')} Social</h2><div class="p-sub muted">${prof ? `Conta do Arcade Hub: <b>${esc(prof.username)}</b>` : 'Jogando como convidado'}</div></header>
    <div class="social-card" style="--c:${state.company.color}"><span class="co-mark" style="--c:${state.company.color}">${ic('train-front')}</span><div><b>${esc(state.company.name)}</b><small>Nível ${state.company.level} · ${stationIds().length} estações · ${fmt(state.stats.deliveries)} entregas · ${Object.keys(state.achievements).length} conquistas</small></div></div>
    <p class="muted sm">Este é o cartão que aparece na página de Jogos Persistentes do Arcade Hub.</p>
    <section class="p-sec"><h3>${ic('trophy')} Ranking de entregas</h3>
      ${cloud ? '' : `<p class="muted sm">${CloudSync.enabled ? (CloudSync.status === 'missing' ? 'Ranking online indisponível: falta criar a tabela no banco.' : 'Carregando ranking…') : 'Exemplo com companhias de demonstração. Entre no Arcade Hub com conta online para ver o ranking real.'}</p>`}
      ${rows.map((r, i) => `<div class="rank-row ${r.me ? 'me' : ''}"><span class="rk">${i + 1}</span><span><b>${esc(r.company || '—')}</b><small>${esc(r.username || '')} · nível ${r.level} · ${r.stations} estações</small></span><span class="rb-end">${fmt(r.deliveries)}</span></div>`).join('')}</section>`;
}

/* ==================== DICAS DO MAPA ==================== */
function showTip(h) {
  const tip = $('#tip');
  if (!h) { tip.hidden = true; return; }
  let html = '';
  if (h.kind === 'city') {
    const c = city(h.id);
    const st = state ? cityStatus(h.id) : 'starter';
    const n = state && hasStation(h.id) ? contractsAt(h.id).length : 0;
    html = `<b>${flag(c.country)} ${esc(c.name)}</b><small>${{ station: `Estação · ${n} contrato(s)`, frontier: 'Ao alcance da rede', locked: 'Fora da rede', starter: 'Pode ser sua sede' }[st]}</small>`;
  } else if (h.kind === 'link') {
    const l = DB.linkById[h.id];
    html = `<b>${esc(city(l.a).name)} — ${esc(city(l.b).name)}</b><small>${fmt(l.km)} km · até ${l.speedLimit} km/h · ${state && isOwned(l.id) ? esc(lineOf(l.id).name) : fmt(segmentCost(l)) + ' cr'}</small>`;
  } else if (h.kind === 'train' && state) {
    const t = trainById(h.id); const p = trainPosition(t);
    html = `<b>${esc(t.name)}</b><small>${t.status === 'idle' ? 'Livre em ' + esc(city(t.at).name) : esc(p.stage)}</small>`;
  }
  tip.innerHTML = html; tip.hidden = !html;
  moveTip(h.x, h.y);
}
function moveTip(x, y) { const tip = $('#tip'); tip.style.transform = `translate(${x + 14}px, ${y + 14}px)`; }

boot();
