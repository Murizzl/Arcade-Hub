/* =========================================================
   Club Legacy — interface e navegação da carreira.
   ========================================================= */
import { esc, ic, money, clamp, POS_LABEL, POS_GROUP, POS_ORDER, dateOf, fmtDate } from './util.js';
import { ATTRS, GK_ATTRS, ATTR_LABEL, ATTR_SHORT, PLANS, ratingAt } from './players.js';
import { STYLES, PRESS, LINES, MENTALITY } from './engine.js';
import * as C from './career.js';
import { crest, avatar, LOOK } from './art.js';
import { openMatch, resultModalHtml } from './match.js';
import { Arcade } from './arcade.js';
import * as M from './management.js';
import * as Cups from './cups.js';
import * as Y from './youth.js';

const app = document.getElementById('app');
const modalEl = document.getElementById('modal');
const S = () => C.S;
let view = 'central';
const ui = { squadSort: 'pos', squadDir: 1, compTab: null, compRound: null, tSlot: null, tPick: null, mk: { pos: '', name: '', ageMin: 16, ageMax: 40, ovrMin: 0, potMin: 0, price: 0, wage: 0, nat: '', tab: 'search' } };

/* ---------- utilidades de UI ---------- */
const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 2 } });
export function toast(text, ok = true, icon) {
  const el = document.createElement('div');
  el.className = `toast ${ok ? 'ok' : 'bad'}`;
  el.innerHTML = `${ic(icon || (ok ? 'check-circle-2' : 'alert-circle'))}<span>${esc(text)}</span>`;
  document.getElementById('toasts').append(el); icons();
  setTimeout(() => el.remove(), 3600);
}
export function modal(html, opts = {}) {
  modalEl.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  modalEl.hidden = false; icons();
  modalEl.onclick = e => { if (e.target === modalEl && !opts.locked) closeModal(); };
  return modalEl.firstElementChild;
}
export function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ''; }
let progEl = null;
function progress(text, frac = 0) {
  if (!progEl) { progEl = document.createElement('div'); progEl.className = 'progress'; document.body.append(progEl); }
  progEl.innerHTML = `<div class="spinner"></div><b>${esc(text)}</b><div class="meter"><i style="width:${Math.round(frac * 100)}%"></i></div>`;
}
function progressEnd() { progEl?.remove(); progEl = null; }
const ovrCls = v => v >= 80 ? 'o5' : v >= 72 ? 'o4' : v >= 64 ? 'o3' : v >= 56 ? 'o2' : 'o1';
const ovrB = v => `<span class="ovr ${ovrCls(v)}">${v}</span>`;
const posB = pos => `<span class="posb ${POS_GROUP[pos]}">${POS_LABEL[pos]}</span>`;
const stars = n => `<span class="stars" title="Prestígio ${n}/5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
const potEst = p => M.potRange(p);
const energyBar = v => `<span class="energy ${v < 50 ? 'vlow' : v < 70 ? 'low' : ''}" title="Condição ${Math.round(v)}%"><i style="width:${v}%"></i></span>`;
const statusTags = p => `${p.injury ? `<span class="tag tag-red" title="${esc(p.injuryType || 'Lesão')}">${ic('cross')} ${p.injury}d</span>` : ''}${p.loan ? `<span class="tag tag-blue">${ic('repeat')} ${p.loan.to === S().coach.clubId ? 'Emprestado' : 'Cedido'}</span>` : ''}${p.precontract ? '<span class="tag tag-lime">Pré-contrato</span>' : ''}${p.wantsOut ? '<span class="tag tag-red">Quer sair</span>' : ''}${p.forLoan ? '<span class="tag">Para empréstimo</span>' : ''}${p.suspended ? '<span class="tag tag-red">Suspenso</span>' : ''}${p.forSale ? `<span class="tag tag-yellow">${ic('tag')} À venda</span>` : ''}${p.contract <= 1 ? '<span class="tag">Fim de contrato</span>' : ''}`;

/* ---------- boot ---------- */
async function boot() {
  try {
    await C.loadData();
    C.load();
    document.getElementById('boot').remove();
    if (S()) renderShell(); else renderStart();
  } catch (e) {
    console.error(e);
    document.getElementById('boot').innerHTML = `<p>Não foi possível carregar os dados do jogo.<br><small class="faint">Abra por um servidor HTTP local (ex.: <code>python -m http.server</code>).</small></p>`;
  }
  // tempo de jogo para o perfil do Arcade Social (blocos de 1 minuto)
  let last = Date.now();
  setInterval(() => { if (document.hidden) { last = Date.now(); return; } const s = (Date.now() - last) / 1000; last = Date.now(); Arcade.playtime(s); }, 60000);
}

/* =========================================================
   Tela inicial e criação de carreira
   ========================================================= */
const W = { step: 1, coach: { first: '', last: '', nat: 'Brasil', age: 38, style: 'balanced', look: { skin: LOOK.skin[1], hair: 'short', hairColor: LOOK.hairColor[0], outfit: 'suit', outfitColor: LOOK.outfitColor[0] } }, mode: 'pick', clubId: null, div: 'A', sort: 'prestige', custom: { name: '', short: '', abbr: '', city: '', state: '', stadium: '', colors: ['#a3e635', '#111827'], kitText: '#111827', crest: 'shield', division: 'B', replaces: '' } };
const COACH_STYLES = { balanced: ['Equilibrado', 'Sem pontos fracos.'], attacking: ['Ofensivo', 'Times começam com mentalidade ofensiva.'], defensive: ['Retranqueiro', 'Times começam mais compactos.'], youth: ['Formador', 'Jovens evoluem 15% mais rápido.'], motivator: ['Motivador', 'Moral do elenco se recupera mais rápido.'] };
const NATS = ['Brasil', 'Portugal', 'Argentina', 'Uruguai', 'Colômbia', 'Paraguai', 'Chile', 'Espanha', 'Itália', 'Alemanha', 'França', 'Inglaterra'];

function renderStart() {
  view = 'start';
  const has = C.hasSave();
  app.innerHTML = `<div class="hero"><div class="hero-card" style="max-width:520px">
    <div class="hero-title"><span class="logo-lg">${ic('shield-half')}</span><h1>Club Legacy</h1><p>Simulador de carreira de treinador · Liga Brasil Séries A e B</p></div>
    <div class="card" style="display:grid;gap:10px">
      ${has ? `<button class="btn btn-primary btn-lg" data-act="continue">${ic('play')} Continuar carreira</button>` : ''}
      <button class="btn ${has ? '' : 'btn-primary'} btn-lg" data-act="wizard">${ic('user-plus')} Nova carreira</button>
      <a class="btn btn-ghost" href="../index.html#/persistent">${ic('chevron-left')} Voltar ao Arcade Hub</a>
      <p class="faint small center" style="margin:6px 0 0">${Arcade.profile() ? `Conectado ao Arcade Social como <b>${esc(Arcade.profile().username)}</b>. Conquistas rendem XP no perfil.` : 'Entre no Arcade Hub para ganhar XP de perfil com sua carreira.'}</p>
    </div></div></div>`;
  icons();
}

function renderWizard() {
  view = 'wizard';
  const st = W.step;
  app.innerHTML = `<div class="hero"><div class="hero-card">
    <div class="hero-title" style="margin-bottom:14px"><h1>Nova carreira</h1></div>
    <div class="steps"><span class="${st === 1 ? 'on' : ''}">1 · Treinador</span><span class="${st === 2 ? 'on' : ''}">2 · Clube</span></div>
    <div class="card">${st === 1 ? wizCoach() : wizClub()}</div></div></div>`;
  icons();
  bindWizard();
}

function wizCoach() {
  const c = W.coach, l = c.look;
  const sw = (key, list) => `<div class="swatches">${list.map(v => `<button class="sw ${l[key] === v ? 'on' : ''}" style="background:${v}" data-look="${key}" data-v="${v}" aria-label="${key} ${v}"></button>`).join('')}</div>`;
  const seg = (key, list) => `<div class="seg">${list.map(([v, t]) => `<button class="${l[key] === v ? 'on' : ''}" data-look="${key}" data-v="${v}">${t}</button>`).join('')}</div>`;
  return `<div class="coach-grid">
    <div class="av-preview"><div class="av" id="avPrev">${avatar(l, 180)}</div><b id="coachName">${esc(c.first || 'Seu')} ${esc(c.last || 'Nome')}</b><small class="faint">${COACH_STYLES[c.style][0]}</small></div>
    <div class="grid" style="gap:12px">
      <div class="grid g2">
        <label class="field">Nome<input class="input" id="cFirst" maxlength="20" value="${esc(c.first)}" placeholder="Ex.: Carla"></label>
        <label class="field">Sobrenome<input class="input" id="cLast" maxlength="24" value="${esc(c.last)}" placeholder="Ex.: Monteiro"></label>
        <label class="field">Nacionalidade<select class="input" id="cNat">${NATS.map(n => `<option ${n === c.nat ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field">Idade<input class="input" id="cAge" type="number" min="28" max="75" value="${c.age}"></label>
      </div>
      <div class="opt-group"><small>Tom de pele</small>${sw('skin', LOOK.skin)}</div>
      <div class="opt-group"><small>Penteado</small>${seg('hair', LOOK.hair)}</div>
      <div class="opt-group"><small>Cor do cabelo</small>${sw('hairColor', LOOK.hairColor)}</div>
      <div class="opt-group"><small>Roupa</small>${seg('outfit', LOOK.outfit)}${sw('outfitColor', LOOK.outfitColor)}</div>
      <div class="opt-group"><small>Estilo de treinador</small><div class="seg">${Object.entries(COACH_STYLES).map(([k, [t]]) => `<button class="${c.style === k ? 'on' : ''}" data-cstyle="${k}">${t}</button>`).join('')}</div><span class="faint small">${COACH_STYLES[c.style][1]}</span></div>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn btn-ghost" data-act="home">Cancelar</button><button class="btn btn-primary" data-act="wiz-next">Escolher clube ${ic('arrow-right')}</button></div>
    </div></div>`;
}

function difficulty(c) { return c.prestige >= 4 ? ['Fácil', 'd1'] : c.prestige >= 2 ? ['Média', 'd2'] : ['Difícil', 'd3']; }

function wizClub() {
  const D = C.DB;
  const modeSeg = `<div class="seg" style="margin-bottom:14px"><button class="${W.mode === 'pick' ? 'on' : ''}" data-wmode="pick">${ic('list')} Escolher clube</button><button class="${W.mode === 'create' ? 'on' : ''}" data-wmode="create">${ic('sparkles')} Criar meu clube</button></div>`;
  if (W.mode === 'create') return modeSeg + wizCreate();
  let list = D.clubs.filter(c => c.division === W.div);
  const sorters = { prestige: (a, b) => b.prestige - a.prestige || b.budget - a.budget, budget: (a, b) => b.budget - a.budget, name: (a, b) => a.name.localeCompare(b.name), diff: (a, b) => a.prestige - b.prestige };
  list.sort(sorters[W.sort]);
  const sel = D.clubs.find(c => c.id === W.clubId);
  return modeSeg + `<div class="club-pick">
    <div>
      <div class="row-wrap" style="margin-bottom:10px">
        <div class="seg">${D.leagues.map(L => `<button class="${W.div === L.id ? 'on' : ''}" data-wdiv="${L.id}">${D.countries[L.country].flag} ${esc(L.short)}</button>`).join('')}</div>
        <span class="tag">${ic('globe-2')} ${esc(D.countries[C.leagueCfg(W.div).country].continent)}</span>
        <select class="input" style="width:auto" id="wSort"><option value="prestige" ${W.sort === 'prestige' ? 'selected' : ''}>Prestígio</option><option value="budget" ${W.sort === 'budget' ? 'selected' : ''}>Orçamento</option><option value="diff" ${W.sort === 'diff' ? 'selected' : ''}>Dificuldade</option><option value="name" ${W.sort === 'name' ? 'selected' : ''}>Nome</option></select>
      </div>
      <div class="club-list">${list.map(c => { const [dt, dc] = difficulty(c); return `<button class="club-row ${c.id === W.clubId ? 'on' : ''}" data-wclub="${c.id}">${crest(c, 34)}<div class="grow"><b>${esc(c.name)}</b><div class="faint small">${esc(c.city)}/${c.state} · ${money(c.budget)}</div></div>${stars(c.prestige)}<span class="diff ${dc}">${dt}</span></button>`; }).join('')}</div>
    </div>
    <div>${sel ? clubPreview(sel) : `<div class="card center muted" style="padding:40px 16px">${ic('mouse-pointer-click')}<p>Selecione um clube para ver elenco, objetivos e orçamento.</p></div>`}</div>
  </div>
  <div class="row" style="justify-content:space-between;margin-top:14px"><button class="btn btn-ghost" data-act="wiz-back">${ic('arrow-left')} Voltar</button><button class="btn btn-primary" data-act="wiz-start" ${sel ? '' : 'disabled'}>${ic('pen-line')} Assinar contrato</button></div>`;
}

function clubPreview(c) {
  const [dt, dc] = difficulty(c);
  const goal = c.division === 'A' ? (c.prestige >= 5 ? 'Conquistar o título' : c.prestige >= 4 ? 'Terminar no G4' : c.prestige >= 3 ? 'Primeira metade da tabela' : 'Evitar o rebaixamento') : (c.prestige >= 2 ? 'Conquistar o acesso' : 'Campanha segura');
  return `<div class="card" style="background:linear-gradient(160deg, ${c.colors[0]}22, var(--surface))">
    <div class="row" style="margin-bottom:12px">${crest(c, 56)}<div><h3>${esc(c.name)}</h3><small class="muted">${esc(c.city)} · fundado em ${c.founded}</small></div></div>
    <div class="grid g2" style="gap:10px;margin-bottom:12px">
      <div class="stat"><small>Liga</small><b style="font-size:15px">${C.DB.countries[c.country].flag} ${esc(C.leagueShort(c.division))}</b></div>
      <div class="stat"><small>Dificuldade</small><b style="font-size:15px"><span class="diff ${dc}">${dt}</span></b></div>
      <div class="stat"><small>Orçamento</small><b style="font-size:15px">${money(c.budget)}</b></div>
      <div class="stat"><small>Folha máxima</small><b style="font-size:15px">${money(c.wageBudget)}/mês</b></div>
      <div class="stat"><small>Estádio</small><b style="font-size:13px">${esc(c.stadium)}</b></div>
      <div class="stat"><small>Títulos nacionais</small><b style="font-size:15px">${c.titles}</b></div>
    </div>
    <p class="small"><b>Objetivo da diretoria:</b> ${goal}</p>
    <p class="small muted">Estilo: ${C.STYLE_LABEL[c.style]} · Formação ${c.formation} · Força média ${c.rating}</p>
    <p class="faint small">O elenco de 26 atletas fictícios é gerado ao assinar o contrato.</p>
  </div>`;
}

function wizCreate() {
  const k = W.custom;
  const prev = { ...k, abbr: k.abbr || (k.short || k.name || 'NOV').replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 3).toUpperCase() || 'NOV' };
  const pal = ['#a3e635', '#16a34a', '#0ea5e9', '#1d4ed8', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#facc15', '#f8fafc', '#111827', '#475569'];
  const sw = (i) => `<div class="swatches">${pal.map(v => `<button class="sw ${k.colors[i] === v ? 'on' : ''}" style="background:${v}" data-ccolor="${i}" data-v="${v}"></button>`).join('')}</div>`;
  const repl = C.DB.clubs.filter(c => c.division === k.division).sort((a, b) => a.rating - b.rating);
  return `<div class="coach-grid">
    <div class="av-preview"><div class="av" id="crestPrev">${crest(prev, 150)}</div><b>${esc(k.name || 'Seu clube')}</b><small class="faint">${esc(k.city || 'Cidade')}</small></div>
    <div class="grid" style="gap:12px">
      <div class="grid g2">
        <label class="field">Nome do clube<input class="input" id="kName" maxlength="32" value="${esc(k.name)}" placeholder="Ex.: Atlético Litorâneo"></label>
        <label class="field">Nome curto<input class="input" id="kShort" maxlength="16" value="${esc(k.short)}" placeholder="Ex.: Litorâneo"></label>
        <label class="field">Sigla (3 letras)<input class="input" id="kAbbr" maxlength="3" value="${esc(k.abbr)}" placeholder="LIT"></label>
        <label class="field">Estádio<input class="input" id="kStadium" maxlength="30" value="${esc(k.stadium)}" placeholder="Ex.: Arena do Povo"></label>
        <label class="field">Cidade<input class="input" id="kCity" maxlength="24" value="${esc(k.city)}" placeholder="Ex.: Santos"></label>
        <label class="field">Estado (UF)<input class="input" id="kState" maxlength="2" value="${esc(k.state)}" placeholder="SP"></label>
      </div>
      <div class="opt-group"><small>Cor principal</small>${sw(0)}</div>
      <div class="opt-group"><small>Cor secundária</small>${sw(1)}</div>
      <div class="opt-group"><small>Escudo</small><div class="seg">${[['shield', 'Clássico'], ['round', 'Redondo'], ['diamond', 'Losango']].map(([v, t]) => `<button class="${k.crest === v ? 'on' : ''}" data-ccrest="${v}">${t}</button>`).join('')}</div></div>
      <div class="opt-group"><small>Divisão inicial</small><div class="seg"><button class="${k.division === 'B' ? 'on' : ''}" data-cdiv="B">Série B (recomendado)</button><button class="${k.division === 'A' ? 'on' : ''}" data-cdiv="A">Série A</button></div>
        <span class="faint small">Clube novo começa com elenco modesto (${k.division === 'A' ? 'força 66, R$ 16 mi' : 'força 59, R$ 6 mi'}) e ocupa a vaga de um clube da divisão.</span></div>
      <label class="field">Substitui o clube<select class="input" id="kRepl">${repl.map(c => `<option value="${c.id}" ${k.replaces === c.id ? 'selected' : ''}>${esc(c.name)} (força ${c.rating})</option>`).join('')}</select></label>
      <div class="row" style="justify-content:space-between"><button class="btn btn-ghost" data-act="wiz-back">${ic('arrow-left')} Voltar</button><button class="btn btn-primary" data-act="wiz-create">${ic('sparkles')} Fundar clube e começar</button></div>
    </div></div>`;
}

function bindWizard() {
  const val = id => document.getElementById(id)?.value.trim();
  const live = () => {
    if (W.step === 1) { W.coach.first = val('cFirst'); W.coach.last = val('cLast'); W.coach.nat = val('cNat'); W.coach.age = clamp(+val('cAge') || 38, 28, 75); const n = document.getElementById('coachName'); if (n) n.textContent = `${W.coach.first || 'Seu'} ${W.coach.last || 'Nome'}`; }
    if (W.step === 2 && W.mode === 'create') {
      const k = W.custom; k.name = val('kName'); k.short = val('kShort'); k.abbr = (val('kAbbr') || '').toUpperCase(); k.city = val('kCity'); k.state = (val('kState') || '').toUpperCase(); k.stadium = val('kStadium'); k.replaces = val('kRepl');
      const prev = { ...k, abbr: k.abbr || (k.short || k.name || 'NOV').replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 3).toUpperCase() || 'NOV' };
      const el = document.getElementById('crestPrev'); if (el) el.innerHTML = crest(prev, 150);
    }
  };
  app.querySelectorAll('input,select').forEach(i => i.addEventListener('input', live));
  app.querySelector('#wSort')?.addEventListener('change', e => { W.sort = e.target.value; renderWizard(); });
  app.onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    live();
    if (t.dataset.look) { W.coach.look[t.dataset.look] = t.dataset.v; return renderWizard(); }
    if (t.dataset.cstyle) { W.coach.style = t.dataset.cstyle; return renderWizard(); }
    if (t.dataset.wmode) { W.mode = t.dataset.wmode; return renderWizard(); }
    if (t.dataset.wdiv) { W.div = t.dataset.wdiv; return renderWizard(); }
    if (t.dataset.wclub) { W.clubId = t.dataset.wclub; return renderWizard(); }
    if (t.dataset.ccolor) { W.custom.colors[+t.dataset.ccolor] = t.dataset.v; W.custom.kitText = isLight(W.custom.colors[0]) ? '#111827' : '#ffffff'; return renderWizard(); }
    if (t.dataset.ccrest) { W.custom.crest = t.dataset.ccrest; return renderWizard(); }
    if (t.dataset.cdiv) { W.custom.division = t.dataset.cdiv; W.custom.replaces = ''; return renderWizard(); }
  };
}
const isLight = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8 & 255) * 587) + ((n & 255) * 114)) / 1000 > 150; };

function startCareer(custom) {
  const c = W.coach;
  if (!c.first || !c.last) { W.step = 1; renderWizard(); return toast('Informe nome e sobrenome do treinador.', false); }
  let customClub = null;
  if (custom) {
    const k = W.custom;
    if (!k.name || k.name.length < 3) return toast('Dê um nome ao clube (mínimo 3 letras).', false);
    customClub = { name: k.name, short: k.short || k.name.split(' ').slice(0, 2).join(' '), abbr: (k.abbr || k.name.replace(/[^A-Za-zÀ-ú]/g, '').slice(0, 3)).toUpperCase(), city: k.city || 'São Paulo', state: k.state || 'SP', stadium: k.stadium || `Arena ${k.city || 'Municipal'}`, colors: k.colors.slice(), kitText: k.kitText, crest: k.crest, division: k.division, replaces: k.replaces || undefined };
  }
  progress('Gerando elencos e calendário…', 0.5);
  setTimeout(() => {
    C.newCareer({ coach: { first: c.first, last: c.last, nat: c.nat, age: c.age, style: c.style, look: { ...c.look } }, clubId: W.clubId, customClub });
    // estilo do treinador define a tática inicial
    const me = C.myClub();
    if (c.style === 'attacking') me.tactics.mentality = 1;
    if (c.style === 'defensive') { me.tactics.mentality = -1; me.tactics.line = 'low'; }
    C.save();
    progressEnd();
    view = 'central'; renderShell();
    toast(`Bem-vindo ao ${me.short}!`, true, 'handshake');
  }, 30);
}

/* =========================================================
   Shell (menu lateral + topo)
   ========================================================= */
const NAV = [
  ['central', 'layout-dashboard', 'Central'], ['squad', 'users', 'Elenco'], ['tactics', 'clipboard-list', 'Táticas'], ['calendar', 'calendar-days', 'Calendário'],
  ['comps', 'trophy', 'Competições'], ['transfers', 'arrow-left-right', 'Transferências'], ['training', 'dumbbell', 'Treinamentos'], ['finance', 'wallet', 'Finanças'],
  ['board', 'landmark', 'Diretoria'], ['career', 'contact', 'Carreira']
];
const NEEDS_CLUB = new Set(['squad', 'tactics', 'calendar', 'transfers', 'training', 'finance', 'board']);

export function renderShell() {
  const s = S(); const me = C.myClub();
  if (!me && NEEDS_CLUB.has(view)) view = 'central';
  const unread = s.inbox.filter(m => !m.read).length;
  app.innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="brand"><span class="logo">${ic('shield-half')}</span><div>Club Legacy<small>Temporada ${s.year}</small></div></div>
      ${NAV.map(([k, i, t], n) => `<button class="nav-btn ${view === k ? 'on' : ''}" data-nav="${k}" ${!me && NEEDS_CLUB.has(k) ? 'disabled style="opacity:.35"' : ''}><span class="num">${n + 1}</span>${ic(i)}<span>${t}</span>${k === 'central' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('')}
      <a class="back" href="../index.html#/persistent">${ic('chevron-left')} Arcade Hub</a>
    </aside>
    <header class="top">
      <button class="btn btn-icon btn-ghost menu-toggle" data-act="menu" aria-label="Menu">${ic('menu')}</button>
      <div class="club">${me ? crest(me, 36) : `<span class="tag">${ic('briefcase')} Desempregado</span>`}<div style="min-width:0"><b>${me ? esc(me.name) : esc(`${s.coach.first} ${s.coach.last}`)}</b><small>${me ? `${esc(C.leagueShort(me.division))} · ${C.position(me.id)}º lugar` : 'Procurando clube'}</small></div></div>
      <div class="chips">
        <span class="chip">${ic('calendar')} ${C.dateLabel(s.day)}</span>
        <span class="chip hide-sm" title="${M.windowState().days != null ? `${M.windowState().open ? 'Fecha' : 'Abre'} em ${M.windowState().days} dias` : ''}">${ic(M.windowState().open ? 'door-open' : 'lock')} ${M.windowState().open ? 'Janela aberta' : 'Janela fechada'}</span>
        ${me ? `<span class="chip hide-sm ${me.balance < 0 ? 'neg' : ''}">${ic('wallet')} ${money(me.balance)}</span><span class="chip hide-sm">${ic('landmark')} ${s.board.confidence}%</span>` : ''}
      </div>
    </header>
    <main class="main" id="main"></main>
  </div>`;
  renderView();
  if (s.showSeasonSummary) showSeasonSummary();
}

function renderView() {
  const main = document.getElementById('main'); if (!main) return;
  const fn = VIEWS[view] || VIEWS.central;
  main.innerHTML = fn();
  icons();
  AFTER[view]?.(main);
}
function refresh() { renderShell(); }

/* =========================================================
   1. Central
   ========================================================= */
function vCentral() {
  const s = S(), me = C.myClub();
  if (!me) return vUnemployed();
  const f = C.nextFixture();
  const today = C.todayFixture();
  const pos = C.position(me.id);
  const tbl = C.table(me.division);
  const row = tbl.find(r => r.id === me.id);
  const conf = s.board.confidence;
  const played = C.fixturesOf(me.id).filter(x => x.played).slice(-5).reverse();
  const scorersClub = C.squadOf(me).filter(p => p.st.goals).sort((a, b) => b.st.goals - a.st.goals).slice(0, 5);
  const scorersLg = C.topScorers(me.division, 5);
  let nextHtml;
  if (f) {
    const H = s.clubs[f.home], A = s.clubs[f.away];
    const days = f.day - s.day;
    nextHtml = `<div class="card next-match">
      <div class="card-head"><h3>${ic('calendar-clock')} Próxima partida</h3><span class="right faint">${f.comp ? esc(Cups.compName(f)) : `${f.round}ª rodada · ${esc(C.leagueShort(me.division))}`}</span></div>
      <div class="versus">
        <div class="team">${crest(H, 64)}<b>${esc(H.short)}</b><small class="faint">${C.position(H.id)}º</small></div>
        <div class="vs"><b>VS</b>${C.dateLabel(f.day)}<br><span class="tag ${days === 0 ? 'tag-lime' : ''}">${days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `em ${days} dias`}</span></div>
        <div class="team">${crest(A, 64)}<b>${esc(A.short)}</b><small class="faint">${C.position(A.id)}º</small></div>
      </div>
      <p class="center faint small" style="margin:0 0 8px">${esc(H.stadium)} · ${f.home === me.id ? 'em casa' : 'fora de casa'}${f.comp ? ' · mata-mata: empate vai para os pênaltis' : ''}</p>
      <div class="row-wrap" style="justify-content:center;margin-bottom:12px">${Cups.cupStatus(me.id).map(t => `<span class="tag">${ic('trophy')} ${esc(t)}</span>`).join('')}</div>
      <div class="actions">
        <button class="btn btn-primary btn-lg" data-act="play" ${today ? '' : 'disabled'}>${ic('monitor-play')} Jogar Partida</button>
        <button class="btn btn-lg" data-act="sim" ${today ? '' : 'disabled'}>${ic('fast-forward')} Simular Partida</button>
        <button class="btn" data-act="day" ${today ? 'disabled' : ''}>${ic('sun')} Avançar Dia</button>
        <button class="btn" data-act="tonext" ${today ? 'disabled' : ''}>${ic('skip-forward')} Avançar Até Próxima Partida</button>
      </div>
    </div>`;
  } else nextHtml = `<div class="card next-match"><h3>${ic('flag')} Temporada encerrada para o clube</h3><p class="muted">Avance os dias para concluir a temporada.</p><div class="actions"><button class="btn btn-primary" data-act="day">${ic('sun')} Avançar Dia</button><button class="btn" data-act="toend">${ic('skip-forward')} Ir para o fim da temporada</button></div></div>`;

  const unreadMsgs = s.inbox.slice(0, 6);
  return `<div class="page-head"><div><h1>Central</h1><p>${C.dateLabel(s.day)} · Temporada ${s.year}</p></div></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card stat"><small>Classificação</small><b>${pos}º <span class="faint" style="font-size:13px">${row.pts} pts</span></b><span class="faint small">${row.w}V ${row.d}E ${row.l}D · saldo ${row.gd > 0 ? '+' : ''}${row.gd}</span></div>
    <div class="card stat"><small>Orçamento</small><b class="${me.balance < 0 ? 'neg' : ''}">${money(me.balance)}</b><span class="faint small">Folha ${money(C.payroll(me))} / ${money(me.wageBudget)}</span></div>
    <div class="card stat"><small>Confiança da diretoria</small><b>${conf}%</b><div class="meter ${conf < 30 ? 'bad' : conf < 50 ? 'warn' : ''}"><i style="width:${conf}%"></i></div></div>
    <div class="card stat"><small>Objetivo</small><b style="font-size:14px">${esc(s.board.objective.text)}</b><span class="faint small">${pos <= s.board.objective.pos ? '<span class="pos">Dentro da meta</span>' : '<span class="warn">Fora da meta</span>'}</span></div>
  </div>
  <div class="grid" style="grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:14px" id="centralGrid">
    <div class="grid" style="align-content:start">
      ${nextHtml}
      <div class="card"><div class="card-head"><h3>${ic('history')} Últimos resultados</h3></div>
        ${played.length ? `<div class="list">${played.map(x => { const sd = x.home === me.id ? 0 : 1; const o = s.clubs[sd ? x.home : x.away]; const gf = x.score[sd], ga = x.score[1 - sd]; const r = gf > ga ? 'V' : gf < ga ? 'D' : 'E'; return `<div class="li click" data-fx="${x.id}" style="cursor:pointer"><span class="form"><i class="${r}">${r}</i></span>${crest(o, 24)}<span class="grow">${sd ? 'em ' : 'x '}${esc(o.short)}</span><b class="mono">${x.score[0]} – ${x.score[1]}</b><span class="faint small">${x.round}ª</span></div>`; }).join('')}</div>` : '<p class="faint">Nenhuma partida disputada ainda.</p>'}
      </div>
      <div class="card"><div class="card-head"><h3>${ic('newspaper')} Notícias</h3></div>
        ${s.news.slice(0, 6).map(n => `<div class="news-item"><span class="ic">${ic(n.icon)}</span><div><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small class="faint">${C.dateLabel(n.day, false)}</small></div></div>`).join('') || '<p class="faint">Sem notícias.</p>'}
      </div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><h3>${ic('inbox')} Mensagens</h3><button class="btn btn-sm btn-ghost right" data-act="readall">Marcar como lidas</button></div>
        ${unreadMsgs.map(msgHtml).join('') || '<p class="faint">Caixa de entrada vazia.</p>'}
      </div>
      <div class="card"><div class="card-head"><h3>${ic('list-ordered')} Classificação</h3><button class="btn btn-sm btn-ghost right" data-nav="comps">Ver tabela</button></div>${miniTable(me.division, me.id)}</div>
      <div class="card"><div class="card-head"><h3>${ic('target')} Artilheiros</h3></div>
        <div class="grid g2" style="gap:10px"><div><small class="faint">Do clube</small>${scorersClub.map(p => `<div class="li"><span class="grow">${esc(p.name)}</span><b>${p.st.goals}</b></div>`).join('') || '<p class="faint small">—</p>'}</div>
        <div><small class="faint">Da liga</small>${scorersLg.map(p => `<div class="li"><span class="grow" title="${esc(s.clubs[p.club].short)}">${esc(p.name)}</span><b>${p.st.goals}</b></div>`).join('') || '<p class="faint small">—</p>'}</div></div>
      </div>
    </div>
  </div>`;
}

function msgHtml(m) {
  const off = m.offer && !m.done;
  return `<div class="msg ${m.read ? '' : 'unread'}" data-msg="${m.id}"><span class="news-item" style="padding:0"><span class="ic">${ic({ board: 'landmark', offer: 'banknote', job: 'briefcase', medical: 'cross', youth: 'sprout', report: 'file-text', request: 'message-circle-warning' }[m.kind] || 'mail')}</span></span>
    <div class="grow"><b class="small">${esc(m.title)}</b><p class="small muted" style="margin:2px 0">${esc(m.body)}</p><small class="faint">${esc(m.from)} · ${C.dateLabel(m.day, false)}</small>
    ${off ? `<div class="row-wrap" style="margin-top:8px"><button class="btn btn-sm btn-primary" data-offer-yes="${m.id}">${ic('check')} ${m.offer.kind === 'request' ? 'Prometer mais minutos' : 'Aceitar'}</button><button class="btn btn-sm" data-offer-no="${m.id}">${m.offer.kind === 'request' ? 'Colocar à venda' : 'Recusar'}</button></div>` : m.offer ? `<span class="tag" style="margin-top:6px">${esc(String(m.done))}</span>` : ''}</div></div>`;
}

function miniTable(lg, myId) {
  const t = C.table(lg);
  const i = t.findIndex(r => r.id === myId);
  const from = clamp(i - 3, 0, t.length - 7);
  return `<table class="t"><tbody>${t.slice(from, from + 7).map((r, k) => `<tr class="${r.id === myId ? 'me' : ''}"><td class="num" style="width:26px">${from + k + 1}</td><td>${crest(S().clubs[r.id], 18)} ${esc(S().clubs[r.id].short)}</td><td class="num">${r.p}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>`;
}

function vUnemployed() {
  const s = S();
  const offers = s.inbox.filter(m => m.offer?.kind === 'job' && !m.done);
  return `<div class="page-head"><div><h1>Central</h1><p>${C.dateLabel(s.day)} · Você está sem clube</p></div></div>
  <div class="grid g2">
    <div class="card"><div class="card-head"><h3>${ic('briefcase')} Propostas de emprego</h3></div>
      ${offers.map(msgHtml).join('') || '<p class="muted">Nenhuma proposta no momento. Avance os dias: clubes procuram treinadores conforme sua reputação.</p>'}
      <div class="row-wrap" style="margin-top:12px"><button class="btn btn-primary" data-act="day">${ic('sun')} Avançar Dia</button><button class="btn" data-act="jobhunt">${ic('search')} Procurar clubes</button></div>
    </div>
    <div class="card"><div class="card-head"><h3>${ic('newspaper')} Notícias</h3></div>${s.news.slice(0, 6).map(n => `<div class="news-item"><span class="ic">${ic(n.icon)}</span><div><b>${esc(n.title)}</b><p>${esc(n.body)}</p></div></div>`).join('')}</div>
  </div>`;
}

/* =========================================================
   2. Elenco
   ========================================================= */
const SORTS = {
  pos: (a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr, name: (a, b) => a.name.localeCompare(b.name), age: (a, b) => a.age - b.age, ovr: (a, b) => a.ovr - b.ovr, pot: (a, b) => a.pot - b.pot,
  cond: (a, b) => a.cond - b.cond, morale: (a, b) => a.morale - b.morale, value: (a, b) => a.value - b.value, wage: (a, b) => a.wage - b.wage, contract: (a, b) => a.contract - b.contract,
  apps: (a, b) => a.st.apps - b.st.apps, goals: (a, b) => a.st.goals - b.st.goals, assists: (a, b) => a.st.assists - b.st.assists, rating: (a, b) => a.st.rating - b.st.rating
};
function vSquad() {
  const me = C.myClub();
  if (ui.squadTab === 'youth') return vYouth(me);
  const list = C.squadOf(me).sort((a, b) => SORTS[ui.squadSort](a, b) * (ui.squadSort === 'pos' || ui.squadSort === 'name' ? ui.squadDir : -ui.squadDir));
  const lineup = new Set(me.tactics.lineup), bench = new Set(me.tactics.bench);
  const th = (k, t, cls = '') => `<th class="sortable ${cls}" data-sort="${k}">${t}${ui.squadSort === k ? (ui.squadDir > 0 ? ' ▾' : ' ▴') : ''}</th>`;
  return `<div class="page-head"><div><h1>Elenco</h1><p>${me.squad.length} jogadores · média ${Math.round(C.clubRating(me))} · folha ${money(C.payroll(me))}/mês</p></div>
    <div class="right row-wrap"><div class="seg"><button class="on" data-sqtab="main">Profissional</button><button data-sqtab="youth">${ic('sprout')} Base</button></div><button class="btn" data-act="compare">${ic('git-compare')} Comparar</button><button class="btn" data-nav="tactics">${ic('clipboard-list')} Escalação</button></div></div>
  <div class="card" style="padding:6px"><div class="table-wrap"><table class="t">
    <thead><tr>${th('pos', 'Pos')}<th>#</th>${th('name', 'Nome')}${th('age', 'Idade', 'num')}${th('ovr', 'OVR', 'num')}${th('pot', 'Pot.', 'num')}${th('cond', 'Cond.')}${th('morale', 'Moral', 'num')}${th('value', 'Valor', 'num')}${th('wage', 'Salário', 'num')}${th('contract', 'Contr.', 'num')}${th('apps', 'J', 'num')}${th('goals', 'G', 'num')}${th('assists', 'A', 'num')}${th('rating', 'Nota', 'num')}<th>Humor</th></tr></thead>
    <tbody>${list.map(p => `<tr class="click" data-player="${p.id}"><td>${posB(p.pos)}</td><td class="faint">${p.num}</td><td><b>${esc(p.name)}</b> ${lineup.has(p.id) ? '<span class="tag tag-lime">Titular</span>' : bench.has(p.id) ? '<span class="tag tag-blue">Reserva</span>' : ''} ${statusTags(p)}</td><td class="num">${p.age}</td><td class="num">${ovrB(p.ovr)}</td><td class="num faint">${potEst(p)}</td><td>${energyBar(p.cond)}</td><td class="num">${Math.round(p.morale)}</td><td class="num">${money(p.value)}</td><td class="num">${money(p.wage)}</td><td class="num">${p.contract}a</td><td class="num">${p.st.apps}</td><td class="num">${p.st.goals}</td><td class="num">${p.st.assists}</td><td class="num">${p.st.apps ? p.st.rating.toFixed(1) : '–'}</td><td><span class="small ${M.happiness(p)[1]}">${M.happiness(p)[0]}</span></td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

function vYouth(me) {
  Y.ensureYouth(me);
  const list = Y.youthOf(me).sort((a, b) => b.pot - a.pot);
  return `<div class="page-head"><div><h1>Categorias de base</h1><p>Nível da base ${me.youthLevel}/3 · ${list.length} garotos · nova geração a cada fim de temporada (${2 + me.youthLevel * 2} jovens). Aos 20 anos, quem não for promovido sai.</p></div>
    <div class="right row-wrap"><div class="seg"><button data-sqtab="main">Profissional</button><button class="on" data-sqtab="youth">${ic('sprout')} Base</button></div><button class="btn" data-nav="board">${ic('landmark')} Investir na base</button></div></div>
  <div class="card" style="padding:6px"><div class="table-wrap"><table class="t"><thead><tr><th>Pos</th><th>Nome</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">Potencial</th><th>Evolução</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${posB(p.pos)}</td><td><b>${esc(p.name)}</b> <span class="faint small">${p.natCode !== 'BR' ? p.natCode : ''}</span></td><td class="num">${p.age}</td><td class="num">${ovrB(p.ovr)}</td><td class="num"><b>${M.potRange(p)}</b></td><td><span class="meter" style="width:80px;display:inline-block"><i style="width:${Math.round(Math.max(0, p.xp) * 100)}%"></i></span></td>
      <td class="num"><button class="btn btn-sm btn-primary" data-promote="${p.id}" ${p.age < 16 ? 'disabled title="A partir dos 16 anos"' : ''}>${ic('arrow-up')} Promover</button> <button class="btn btn-sm btn-ghost" data-yrelease="${p.id}">Dispensar</button></td></tr>`).join('') || '<tr><td colspan="7" class="faint">Nenhum jovem na base.</td></tr>'}
  </tbody></table></div></div>`;
}

function playerModal(id) {
  const s = S(), p = s.players[id]; if (!p) return;
  const mine = p.club === s.coach.clubId;
  const club = p.club ? s.clubs[p.club] : null;
  const attrs = p.pos === 'GK' ? [...GK_ATTRS, 'pos', 'phy', 'pas', 'sta'] : ATTRS;
  modal(`<div class="modal-head">${club ? crest(club, 40) : `<span class="tag">${ic('user')} Livre</span>`}<div><h2>${esc(p.name)}</h2><small class="muted">${POS_LABEL[p.pos]} · ${p.age} anos · ${esc(p.nat)} · ${club ? esc(club.short) : 'sem clube'}</small></div><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
    <div class="grid g4" style="gap:8px;margin-bottom:14px">
      <div class="stat"><small>Overall</small><b>${ovrB(p.ovr)}</b></div><div class="stat"><small>Potencial</small><b style="font-size:15px">${potEst(p)}</b></div>
      <div class="stat"><small>Valor</small><b style="font-size:15px">${money(p.value)}</b></div><div class="stat"><small>Salário</small><b style="font-size:15px">${money(p.wage)}<span class="faint small">/mês</span></b></div>
    </div>
    <div class="grid g2" style="gap:16px">
      <div>${attrs.map(k => `<div class="attr"><span>${ATTR_LABEL[k]}</span><span class="bar"><i style="width:${p.a[k]}%"></i></span><b>${p.a[k]}</b></div>`).join('')}</div>
      <div>
        <div class="row-wrap" style="margin-bottom:8px">${statusTags(p)}</div>
        <div class="li"><span class="grow faint">Contrato</span><b>${p.contract} temporada(s)</b></div>
        <div class="li"><span class="grow faint">Multa rescisória</span><b>${p.clause ? money(p.clause) : '—'}</b></div>
        ${mine ? `<div class="li"><span class="grow faint">Papel no elenco</span><b>${M.ROLES[p.role] || '—'}${p.promise ? ' <span class="tag tag-yellow">prometido</span>' : ''}</b></div><div class="li"><span class="grow faint">Humor</span><b class="${M.happiness(p)[1]}">${M.happiness(p)[0]}</b></div>` : ''}
        ${p.loan ? `<div class="li"><span class="grow faint">Empréstimo</span><b>${esc(S().clubs[p.loan.from].short)} → ${esc(S().clubs[p.loan.to].short)} (${Math.round(p.loan.share * 100)}% do salário)</b></div>` : ''}
        ${p.injury ? `<div class="li"><span class="grow faint">Lesão</span><b class="neg">${esc(p.injuryType || 'Lesão')} · ${p.injury} dias${p.treated ? ' (em tratamento)' : ''}</b></div>` : ''}
        <div class="li"><span class="grow faint">Condição física</span><b>${Math.round(p.cond)}%</b></div>
        <div class="li"><span class="grow faint">Moral</span><b>${Math.round(p.morale)}</b></div>
        <div class="li"><span class="grow faint">Jogos · Gols · Assist.</span><b>${p.st.apps} · ${p.st.goals} · ${p.st.assists}</b></div>
        <div class="li"><span class="grow faint">Nota média</span><b>${p.st.apps ? p.st.rating.toFixed(2) : '–'}</b></div>
        <div class="li"><span class="grow faint">Overall por posição</span><span class="small">${['CB', 'CM', 'AM', 'ST', 'LW'].filter(r => r !== p.pos).map(r => `${POS_LABEL[r]} ${ratingAt(p, r)}`).join(' · ')}</span></div>
        ${mine ? `<label class="field" style="margin-top:8px">Plano de treinamento<select class="input" id="pPlan">${Object.entries(PLANS).map(([k, v]) => `<option value="${k}" ${p.plan === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>` : ''}
      </div>
    </div>
    ${playerHistory(p)}
    <div class="modal-foot">${playerActions(p, mine)}
    </div>`, { wide: true });
  modalEl.querySelector('#pPlan')?.addEventListener('change', e => { p.plan = e.target.value; C.save(); toast(`Plano de ${p.name}: ${PLANS[p.plan].label}`); });
}

function playerHistory(p) {
  const s = S();
  const rows = [...(p.hist || []), ...(p.st?.apps || p.cst?.apps ? [{ y: s.year, club: p.club, apps: p.st.apps, goals: p.st.goals, assists: p.st.assists, rating: p.st.rating, capps: p.cst?.apps || 0, cgoals: p.cst?.goals || 0, now: true }] : [])];
  if (!rows.length) return '';
  return `<h3 style="margin:14px 0 6px">${ic('history')} Histórico por temporada</h3><div class="table-wrap"><table class="t"><thead><tr><th>Ano</th><th>Clube</th><th class="num">Jogos</th><th class="num">Gols</th><th class="num">Assist.</th><th class="num">Nota</th><th class="num">Copas (J/G)</th></tr></thead><tbody>
    ${rows.slice().reverse().map(h => `<tr><td>${h.y}${h.now ? ' <span class="tag tag-lime">atual</span>' : ''}</td><td>${s.clubs[h.club] ? `${crest(s.clubs[h.club], 16)} ${esc(s.clubs[h.club].short)}` : '—'}</td><td class="num">${h.apps}</td><td class="num">${h.goals}</td><td class="num">${h.assists}</td><td class="num">${h.apps ? (+h.rating).toFixed(2) : '–'}</td><td class="num">${h.capps}/${h.cgoals}</td></tr>`).join('')}</tbody></table></div>`;
}

function playerActions(p, mine) {
  const s = S(), win = M.windowState();
  if (mine && p.loan && p.loan.to === s.coach.clubId) return `<span class="faint small">Emprestado pelo ${esc(s.clubs[p.loan.from].short)} até o fim de ${p.loan.until}.</span>`;
  if (mine) return `${p.injury && !p.treated ? `<button class="btn" data-treat="${p.id}">${ic('cross')} Tratamento (${money(M.treatCost(p))})</button>` : ''}
    <button class="btn btn-danger" data-release="${p.id}">${ic('user-x')} Rescindir</button>
    <button class="btn" data-forloan="${p.id}">${ic('repeat')} ${p.forLoan ? 'Tirar do empréstimo' : 'Disponível p/ empréstimo'}</button>
    <button class="btn" data-sale="${p.id}">${ic('tag')} ${p.forSale ? 'Tirar da venda' : 'Colocar à venda'}</button>
    <button class="btn btn-primary" data-renew="${p.id}">${ic('file-signature')} Renovar contrato</button>`;
  if (!p.club) return `<button class="btn" data-scout="${p.id}">${ic('scan-search')} Observar</button><button class="btn btn-primary" data-bid="${p.id}">${ic('hand-coins')} Oferecer contrato</button>`;
  const lt = M.loanTerms(p);
  return `<button class="btn" data-scout="${p.id}">${ic('scan-search')} Observar</button>
    ${M.canPrecontract(p) ? `<button class="btn" data-pre="${p.id}">${ic('calendar-check')} Pré-contrato</button>` : ''}
    ${lt.available ? `<button class="btn" data-loan="${p.id}" ${win.open ? '' : 'disabled title="Janela fechada"'}>${ic('repeat')} Pedir empréstimo</button>` : ''}
    <button class="btn" data-clause="${p.id}" ${win.open ? '' : 'disabled title="Janela fechada"'}>${ic('banknote')} Pagar multa (${money(p.clause)})</button>
    <button class="btn btn-primary" data-bid="${p.id}" ${win.open ? '' : 'disabled title="Janela fechada"'}>${ic('hand-coins')} Fazer proposta</button>`;
}

function identityModal() {
  const me = C.myClub();
  const k = { colors: me.colors.slice(), away: (me.away || [me.colors[1], me.colors[0]]).slice(), kitText: me.kitText, crest: me.crest };
  const pal = ['#a3e635', '#16a34a', '#0ea5e9', '#1d4ed8', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#facc15', '#f8fafc', '#111827', '#475569', '#7f1d1d', '#0f766e'];
  const render = () => {
    const prev = { ...me, ...k };
    modal(`<div class="modal-head"><h2>${ic('palette')} Uniforme e escudo</h2><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
      <div class="row" style="gap:20px;align-items:flex-start;flex-wrap:wrap">
        <div style="display:grid;justify-items:center;gap:8px">${crest(prev, 120)}
          <svg width="120" height="70" viewBox="0 0 120 70"><circle cx="30" cy="35" r="24" fill="${k.colors[0]}" stroke="${k.colors[1]}" stroke-width="4"/><text x="30" y="42" text-anchor="middle" font-weight="700" font-size="20" fill="${k.kitText}">10</text><circle cx="90" cy="35" r="24" fill="${k.away[0]}" stroke="${k.away[1]}" stroke-width="4"/><text x="90" y="42" text-anchor="middle" font-weight="700" font-size="20" fill="${k.away[1]}">10</text></svg>
          <small class="faint">Titular · Reserva</small></div>
        <div class="grid grow" style="gap:10px">
          ${[['Cor principal', 'colors', 0], ['Cor secundária', 'colors', 1], ['Reserva: camisa', 'away', 0], ['Reserva: detalhes', 'away', 1], ['Número (titular)', 'kitText', -1]].map(([l, key, i]) => `<div class="opt-group"><small>${l}</small><div class="swatches">${pal.map(v => `<button class="sw ${(i < 0 ? k[key] : k[key][i]) === v ? 'on' : ''}" style="background:${v}" data-kc="${key}" data-ki="${i}" data-v="${v}"></button>`).join('')}</div></div>`).join('')}
          <div class="opt-group"><small>Escudo</small><div class="seg">${[['shield', 'Clássico'], ['round', 'Redondo'], ['diamond', 'Losango']].map(([v, t]) => `<button class="${k.crest === v ? 'on' : ''}" data-kcrest="${v}">${t}</button>`).join('')}</div></div>
        </div></div>
      <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="kSave">${ic('check')} Salvar identidade</button></div>`);
    modalEl.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.kc) { if (+b.dataset.ki < 0) k[b.dataset.kc] = b.dataset.v; else k[b.dataset.kc][+b.dataset.ki] = b.dataset.v; return render(); }
      if (b.dataset.kcrest) { k.crest = b.dataset.kcrest; return render(); }
      if (b.id === 'kSave') { Object.assign(me, k); C.save(); closeModal(); toast('Nova identidade do clube salva.', true, 'palette'); return refresh(); }
      if (b.dataset.close !== undefined || e.target === modalEl) closeModal();
    };
  };
  render();
}

function compareModal(a, b) {
  const me = C.myClub(); const sq = C.squadOf(me).sort((x, y) => POS_ORDER.indexOf(x.pos) - POS_ORDER.indexOf(y.pos));
  a = a || sq[0].id; b = b || sq[1].id;
  const A = S().players[a], B = S().players[b];
  const opt = sel => sq.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} (${POS_LABEL[p.pos]} ${p.ovr})</option>`).join('');
  const keys = ['ovr', ...ATTRS, ...GK_ATTRS];
  const v = (p, k) => k === 'ovr' ? p.ovr : p.a[k];
  modal(`<div class="modal-head"><h2>${ic('git-compare')} Comparar jogadores</h2><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
    <div class="grid g2" style="margin-bottom:12px"><select class="input" id="cmpA">${opt(a)}</select><select class="input" id="cmpB">${opt(b)}</select></div>
    ${keys.map(k => `<div class="cmp"><span class="l ${v(A, k) > v(B, k) ? 'better' : ''}">${v(A, k)}</span><span class="c">${k === 'ovr' ? 'Overall' : ATTR_LABEL[k]}</span><span class="${v(B, k) > v(A, k) ? 'better' : ''}">${v(B, k)}</span></div>`).join('')}
    <div class="cmp" style="margin-top:6px"><span class="l">${A.age}</span><span class="c">Idade</span><span>${B.age}</span></div>
    <div class="cmp"><span class="l">${A.st.goals}/${A.st.apps}</span><span class="c">Gols/Jogos</span><span>${B.st.goals}/${B.st.apps}</span></div>
    <div class="cmp"><span class="l">${money(A.wage)}</span><span class="c">Salário</span><span>${money(B.wage)}</span></div>`, { wide: false });
  modalEl.querySelector('#cmpA').onchange = e => compareModal(e.target.value, b);
  modalEl.querySelector('#cmpB').onchange = e => compareModal(a, e.target.value);
}

function renewModal(id) { negotiationModal(S().players[id], 'renew', 0); }

// negociação com o agente: salário, luvas, duração, multa rescisória e papel no elenco
function negotiationModal(p, type, fee) {
  const sess = M.startTalks(p, type, fee);
  if (sess.error) return toast(sess.error, false);
  const d = sess.dem, me = C.myClub();
  const offer = sess.last || { wage: d.wage, bonus: Math.round(d.bonus * 0.6 * 100) / 100, years: d.years[0] + 1 > d.years[1] ? d.years[1] : d.years[0] + 1, clause: Math.round(d.clauseMax * 1.3 * 10) / 10, role: d.role };
  const title = { sign: `Contrato de ${p.name}`, renew: `Renovação com ${p.name}`, pre: `Pré-contrato com ${p.name}` }[type];
  let agreed = false, reply = '';
  const render = () => {
    modal(`<div class="modal-head"><h2>${ic('file-signature')} ${esc(title)}</h2><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
      <p class="muted small">${fee ? `Transferência acertada por <b>${money(fee)}</b>. ` : type === 'pre' ? 'Ele chega de graça ao fim da temporada. ' : type === 'sign' ? 'Agente livre: sem custo de transferência. ' : ''}O agente sinaliza cerca de <b>${money(d.wage)}</b>/mês, luvas perto de <b>${money(d.bonus)}</b>, ${d.years[0]}–${d.years[1]} temporadas e papel de <b>${M.ROLES[d.role].toLowerCase()}</b>.</p>
      <div class="grid g2">
        <label class="field">Salário mensal (R$ mil)<input class="input" id="nWage" type="number" min="1" value="${Math.round(offer.wage * 1000)}"></label>
        <label class="field">Luvas (R$ mi)<input class="input" id="nBonus" type="number" min="0" step="0.05" value="${offer.bonus}"></label>
        <label class="field">Duração<select class="input" id="nYears">${[1, 2, 3, 4, 5].map(y => `<option value="${y}" ${y === offer.years ? 'selected' : ''}>${y} temporada(s)</option>`).join('')}</select></label>
        <label class="field">Multa rescisória (R$ mi)<input class="input" id="nClause" type="number" min="0.5" step="0.5" value="${offer.clause}"></label>
        <label class="field" style="grid-column:1/-1">Papel prometido<select class="input" id="nRole">${Object.entries(M.ROLES).map(([k, v]) => `<option value="${k}" ${k === offer.role ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <p class="faint small">Multa alta protege o clube, mas o jogador quer uma saída possível. Prometer um papel maior agrada agora, mas ele cobrará os minutos. Folha atual ${money(C.payroll(me))} de ${money(me.wageBudget)}.</p>
      <div class="row" style="gap:8px"><small class="faint">Paciência do agente</small><div class="meter ${sess.patience <= 1 ? 'bad' : sess.patience === 2 ? 'warn' : ''}" style="flex:1"><i style="width:${sess.patience / 3 * 100}%"></i></div></div>
      ${reply ? `<div class="msg ${agreed ? 'unread' : ''}" style="margin-top:10px"><div class="grow small">${esc(reply)}</div></div>` : ''}
      <div class="modal-foot"><button class="btn btn-ghost" data-close>Desistir</button>${agreed ? `<button class="btn btn-primary" id="nSign">${ic('check')} Assinar</button>` : `<button class="btn btn-primary" id="nGo" ${sess.patience <= 0 ? 'disabled' : ''}>${ic('send')} Enviar proposta</button>`}</div>`);
    const read = () => ({ wage: (+modalEl.querySelector('#nWage').value || 0) / 1000, bonus: Math.max(0, +modalEl.querySelector('#nBonus').value || 0), years: +modalEl.querySelector('#nYears').value, clause: Math.max(0.5, +modalEl.querySelector('#nClause').value || 0), role: modalEl.querySelector('#nRole').value });
    modalEl.querySelector('#nGo')?.addEventListener('click', () => { Object.assign(offer, read()); const r = M.propose(sess, offer); reply = r.msg; agreed = r.kind === 'accept'; render(); });
    modalEl.querySelector('#nSign')?.addEventListener('click', () => { const r = M.finalize(sess, offer); if (!r.ok) return toast(r.msg, false); closeModal(); toast(type === 'renew' ? `${p.name} renovou até ${S().year + p.contract}.` : type === 'pre' ? 'Pré-contrato assinado.' : `${p.name} é o novo reforço!`, true, 'pen-line'); refresh(); });
  };
  render();
}

function loanModal(id) {
  const p = S().players[id], t = M.loanTerms(p);
  modal(`<div class="modal-head"><h2>${ic('repeat')} Empréstimo de ${esc(p.name)}</h2><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
    <p class="muted small">Até o fim da temporada ${S().year}. Salário ${money(p.wage)}/mês. O ${esc(S().clubs[p.club].short)} quer que você pague parte do salário.</p>
    <label class="field">Parte do salário paga por você: <b id="lPct">${Math.round(Math.max(t.minShare, 0.5) * 100)}%</b><input type="range" id="lShare" min="40" max="100" step="5" value="${Math.round(Math.max(t.minShare, 0.5) * 100)}"></label>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="lGo">${ic('send')} Propor</button></div>`);
  const r = modalEl.querySelector('#lShare'); r.oninput = () => { modalEl.querySelector('#lPct').textContent = r.value + '%'; };
  modalEl.querySelector('#lGo').onclick = () => { const res = M.requestLoan(p, +r.value / 100); if (!res.ok) return toast(res.msg, false); closeModal(); toast(`${p.name} chega emprestado.`, true, 'repeat'); refresh(); };
}

/* =========================================================
   3. Táticas
   ========================================================= */
function ensureLineup(me) {
  const t = me.tactics;
  const valid = (t.lineup || []).length === 11 && t.lineup.every(id => me.squad.includes(id)) && new Set(t.lineup).size === 11;
  if (!valid) C.autoLineup(me);
  t.bench = (t.bench || []).filter(id => me.squad.includes(id) && !t.lineup.includes(id)).slice(0, 9);
}
function vTactics() {
  const me = C.myClub(); ensureLineup(me);
  const t = me.tactics, slots = C.DB.formations[t.formation];
  const P = S().players;
  const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(t[key]) === String(v) ? 'on' : ''}" data-tac="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const inLine = new Set(t.lineup), inBench = new Set(t.bench);
  const sq = C.squadOf(me).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || b.ovr - a.ovr);
  const slotsHtml = slots.map((s, i) => {
    const p = P[t.lineup[i]];
    const top = 6 + (1 - s.x) * 88, left = 6 + s.y * 88;
    const bad = p && (p.injury || p.suspended);
    const r = p ? ratingAt(p, s.r) : 0;
    return `<div class="slot ${ui.tSlot === i ? 'picked' : ''} ${p ? '' : 'empty'}" style="top:${top}%;left:${left}%" data-slot="${i}" draggable="true">
      <span class="rl">${POS_LABEL[s.r]}</span><span class="dot">${p ? p.num : '+'}</span><span class="nm">${p ? esc(p.name.split(' ').slice(-1)[0]) : 'vazio'} ${p ? `· ${r}` : ''}</span>${bad ? `<span class="warnd" title="Indisponível">${ic('alert-triangle')}</span>` : ''}</div>`;
  }).join('');
  const listRow = p => {
    const inL = inLine.has(p.id), inB = inBench.has(p.id);
    const slotRole = ui.tSlot != null ? slots[ui.tSlot].r : null;
    return `<div class="pl-row ${inL ? 'in' : ''} ${inB ? 'bench' : ''}" data-pick="${p.id}" draggable="true">${posB(p.pos)}<span class="grow"><b class="small">${esc(p.name)}</b> ${statusTags(p)}</span>${energyBar(p.cond)}${ovrB(slotRole ? ratingAt(p, slotRole) : p.ovr)}
      ${inL ? '<span class="tag tag-lime">XI</span>' : `<button class="btn btn-sm ${inB ? '' : 'btn-ghost'}" data-bench="${p.id}" title="${inB ? 'Tirar do banco' : 'Colocar no banco'}">${inB ? 'Banco ✓' : '+ Banco'}</button>`}</div>`;
  };
  return `<div class="page-head"><div><h1>Táticas</h1><p>Clique num posto e depois num atleta — ou arraste. Força do XI: <b>${Math.round(t.lineup.reduce((s, id, i) => s + ratingAt(P[id], slots[i].r), 0) / 11)}</b></p></div>
    <div class="right row-wrap"><button class="btn" data-act="autopick">${ic('wand-2')} Escalar automaticamente</button></div></div>
  <div class="tactics-layout">
    <div class="card">
      <div class="opt-group" style="margin-bottom:10px"><small>Formação</small>${seg('formation', Object.keys(C.DB.formations).map(f => [f, f]))}</div>
      <div class="pitch-board" id="board"><div class="box top"></div><div class="box bot"></div>${slotsHtml}</div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card grid" style="gap:12px">
        <div class="opt-group"><small>Mentalidade</small>${seg('mentality', [[-2, 'Muito def.'], [-1, 'Defensiva'], [0, 'Equilibrada'], [1, 'Ofensiva'], [2, 'Muito of.']])}</div>
        <div class="opt-group"><small>Estilo</small>${seg('style', Object.entries(STYLES).map(([k, v]) => [k, v.label]))}</div>
        <div class="grid g2"><div class="opt-group"><small>Pressão</small>${seg('press', Object.entries(PRESS).map(([k, v]) => [k, v.label]))}</div>
        <div class="opt-group"><small>Linha defensiva</small>${seg('line', Object.entries(LINES).map(([k, v]) => [k, v.label]))}</div></div>
        <p class="faint small" style="margin:0">${tacticHint(t)}</p>
      </div>
      <div class="card"><div class="card-head"><h3>${ic('users')} Jogadores</h3><span class="right faint">Banco: ${t.bench.length}/9</span></div>
        <div class="pick-list">${sq.map(listRow).join('')}</div></div>
    </div>
  </div>`;
}
function tacticHint(t) {
  const h = [];
  if (t.mentality >= 1) h.push('Mais jogadores no ataque e mais finalizações, mas espaços atrás.');
  if (t.mentality <= -1) h.push('Bloco recuado: sofre menos chances, cria menos.');
  if (t.press === 'high') h.push('Pressão alta recupera a bola mais à frente e cansa mais rápido.');
  if (t.press === 'low') h.push('Pressão baixa poupa energia.');
  if (t.line === 'high') h.push('Linha alta compacta o time, mas expõe bolas nas costas.');
  if (t.style === 'wings') h.push('Pontas abertos e mais cruzamentos.');
  if (t.style === 'counter') h.push('Ataques rápidos após recuperar a bola.');
  if (t.style === 'possession') h.push('Passes seguros e paciência.');
  return h.join(' ') || 'Equilíbrio entre ataque e defesa.';
}
function assignToSlot(me, slot, pid) {
  const t = me.tactics;
  const cur = t.lineup.indexOf(pid);
  const prev = t.lineup[slot];
  if (cur >= 0) { t.lineup[cur] = prev; t.lineup[slot] = pid; }
  else { t.lineup[slot] = pid; t.bench = t.bench.filter(x => x !== pid); if (prev && t.bench.length < 9) t.bench.push(prev); }
  C.save();
}
function afterTactics(main) {
  const me = C.myClub();
  let drag = null;
  main.querySelectorAll('[draggable]').forEach(el => {
    el.addEventListener('dragstart', e => { drag = el.dataset.pick ? { pid: el.dataset.pick } : { slot: +el.dataset.slot }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', '1'); });
  });
  main.querySelectorAll('.slot').forEach(el => {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drop'); if (!drag) return;
      const to = +el.dataset.slot;
      if (drag.pid) assignToSlot(me, to, drag.pid);
      else if (drag.slot !== to) { const l = me.tactics.lineup; [l[drag.slot], l[to]] = [l[to], l[drag.slot]]; C.save(); }
      drag = null; ui.tSlot = null; renderView();
    });
  });
}

/* =========================================================
   4. Calendário
   ========================================================= */
function vCalendar() {
  const s = S(), me = C.myClub();
  const fx = C.allFixturesOf(me.id);
  return `<div class="page-head"><div><h1>Calendário</h1><p>${fx.length} partidas em ${s.year}: ${esc(C.leagueName(me.division))}${fx.some(f => f.comp) ? ' e copas' : ''}</p></div></div>
  <div class="card" style="padding:6px"><div class="table-wrap"><table class="t"><thead><tr><th>Competição</th><th>Data</th><th>Local</th><th>Adversário</th><th class="num">Placar</th><th></th></tr></thead><tbody>
  ${fx.map(f => { const sd = f.home === me.id ? 0 : 1; const o = s.clubs[sd ? f.home : f.away]; let res = ''; if (f.played) { const gf = f.score[sd], ga = f.score[1 - sd]; res = f.comp && f.pens ? (f.winner === me.id ? 'V' : 'D') : gf > ga ? 'V' : gf < ga ? 'D' : 'E'; }
    return `<tr class="${f.played ? 'click' : ''} ${f.day === s.day && !f.played ? 'me' : ''}" ${f.played ? `data-fx="${f.id}"` : ''}><td>${f.comp ? `<span class="tag tag-yellow">${ic('trophy')} ${esc(Cups.compName(f))}</span>` : `${f.round}ª rodada`}</td><td>${C.dateLabel(f.day)}</td><td>${sd ? '<span class="tag">Fora</span>' : '<span class="tag tag-lime">Casa</span>'}</td><td>${crest(o, 20)} ${esc(o.name)}</td><td class="num"><b>${f.played ? `${f.score[0]} – ${f.score[1]}${f.pens ? ` <span class="faint">(${f.pens[0]}–${f.pens[1]} p)</span>` : ''}` : '–'}</b></td><td>${res ? `<span class="form"><i class="${res}">${res}</i></span>` : f.day === s.day ? '<span class="tag tag-lime">Hoje</span>' : ''}</td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}

/* =========================================================
   5. Competições
   ========================================================= */
function compTabs(cur) {
  const D = C.DB;
  return `<div class="right seg">${D.leagues.map(L => `<button class="${cur === L.id ? 'on' : ''}" data-comp="${L.id}">${D.countries[L.country].flag} ${esc(L.short)}</button>`).join('')}${D.cups.map(c => `<button class="${cur === c.id ? 'on' : ''}" data-comp="${c.id}">${ic('trophy')} ${esc(c.short)}</button>`).join('')}<button class="${cur === 'hist' ? 'on' : ''}" data-comp="hist">${ic('history')} Histórico</button></div>`;
}
function vComps() {
  const s = S(), me = C.myClub();
  const lg = ui.compTab || (me ? me.division : 'A');
  if (lg === 'hist') return vHistory();
  if (Cups.cupCfg(lg)) return vCup(lg);
  const L = C.leagueCfg(lg);
  const t = C.table(lg);
  const fx = s.leagues[lg].fixtures;
  const rounds = Math.max(...fx.map(f => f.round));
  const maxPlayed = Math.max(1, ...fx.filter(f => f.played).map(f => f.round), 1);
  const round = ui.compRound && ui.compRound[lg] ? ui.compRound[lg] : maxPlayed;
  const cont = C.DB.cups.find(c => c.type === 'continental')?.qualify?.[lg] || 0;
  const zone = i => L.promote && i < L.promote ? 'z-up' : L.relegate && i >= t.length - L.relegate ? 'z-down' : i < cont ? 'z-lib' : '';
  const legend = [cont ? `<span class="lime">■</span> ${cont} primeiros vão à Copa Continental` : '', L.promote ? `<span class="pos">■</span> ${L.promote} primeiros sobem` : '', L.relegate ? `<span class="neg">■</span> ${L.relegate} últimos caem` : ''].filter(Boolean).join(' · ');
  return `<div class="page-head"><div><h1>Competições</h1><p>${esc(L.name)} ${s.year} · ${t.length} clubes · ${rounds} rodadas</p></div>${compTabs(lg)}</div>
  <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px" id="compGrid">
    <div class="card" style="padding:6px"><div class="table-wrap"><table class="t"><thead><tr><th class="zone"></th><th>#</th><th>Clube</th><th class="num">P</th><th class="num">J</th><th class="num">V</th><th class="num">E</th><th class="num">D</th><th class="num">GP</th><th class="num">GC</th><th class="num">SG</th><th>Forma</th></tr></thead><tbody>
      ${t.map((r, i) => `<tr class="${me && r.id === me.id ? 'me' : ''}"><td class="zone ${zone(i)}"></td><td class="num">${i + 1}</td><td>${crest(s.clubs[r.id], 20)} <b>${esc(s.clubs[r.id].short)}</b></td><td class="num"><b>${r.pts}</b></td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}</td><td class="num">${r.ga}</td><td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td><span class="form">${r.form.map(x => `<i class="${x}">${x}</i>`).join('')}</span></td></tr>`).join('')}
    </tbody></table></div>
    <p class="faint small" style="padding:6px 10px;margin:0">${legend}${legend ? '. ' : ''}Desempate: pontos, vitórias, saldo, gols pró.</p></div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><h3>${ic('list')} Rodada ${round}</h3><div class="right row"><button class="btn btn-sm btn-icon" data-round="${Math.max(1, round - 1)}">${ic('chevron-left')}</button><button class="btn btn-sm btn-icon" data-round="${Math.min(rounds, round + 1)}">${ic('chevron-right')}</button></div></div>
        ${fx.filter(f => f.round === round).map(f => matchLine(f)).join('')}
        <p class="faint small center" style="margin:6px 0 0">${C.dateLabel(fx.find(f => f.round === round)?.day ?? 0)}</p></div>
      <div class="card"><div class="card-head"><h3>${ic('target')} Artilharia</h3></div>
        ${C.topScorers(lg, 10).map((p, i) => `<div class="li"><span class="faint" style="width:18px">${i + 1}</span>${crest(s.clubs[p.club], 18)}<span class="grow">${esc(p.name)}</span><span class="faint small">${p.st.assists} assist.</span><b>${p.st.goals}</b></div>`).join('') || '<p class="faint">Ninguém marcou ainda.</p>'}</div>
    </div>
  </div>`;
}
function matchLine(f) {
  const s = S();
  return `<div class="li ${f.played ? 'click' : ''}" ${f.played && f.user ? `data-fx="${f.id}"` : ''}><span class="grow" style="text-align:right;${f.winner && f.winner === f.home ? 'font-weight:700' : ''}">${esc(s.clubs[f.home].short)} ${crest(s.clubs[f.home], 18)}</span><b class="mono" style="min-width:48px;text-align:center">${f.played ? `${f.score[0]} – ${f.score[1]}` : 'x'}${f.pens ? `<br><small class="faint">${f.pens[0]}–${f.pens[1]} pên.</small>` : ''}</b><span class="grow" style="${f.winner && f.winner === f.away ? 'font-weight:700' : ''}">${crest(s.clubs[f.away], 18)} ${esc(s.clubs[f.away].short)}</span></div>`;
}
function vCup(id) {
  const s = S(), cfg = Cups.cupCfg(id), cup = s.cups?.[id], me = C.myClub();
  if (!cup) return `<div class="page-head"><div><h1>${esc(cfg.name)}</h1></div>${compTabs(id)}</div><p class="muted">A competição começa na próxima temporada.</p>`;
  return `<div class="page-head"><div><h1>${esc(cfg.name)}</h1><p>${cup.teams.length} clubes · jogo único, empate decidido nos pênaltis · ${cup.champion ? `campeão: <b>${esc(s.clubs[cup.champion].short)}</b>` : `prêmio ao campeão ${money(cfg.prize[0])}`}</p></div>${compTabs(id)}</div>
    ${me && cup.teams.includes(me.id) ? `<p><span class="tag tag-lime">${ic('trophy')} ${esc(Cups.cupStatus(me.id).find(x => x.startsWith(cfg.short)) || '')}</span></p>` : ''}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
      ${cup.rounds.map(r => `<div class="card"><div class="card-head"><h3>${esc(r.name)}</h3><span class="right faint">${C.dateLabel(r.day, false)}</span></div>${r.ties.map(matchLine).join('')}</div>`).join('')}
    </div>`;
}
function vHistory() {
  const s = S();
  const hs = s.honours || [];
  const years = [...new Set(hs.map(h => h.year))];
  const count = {};
  hs.forEach(h => { count[h.winner] = (count[h.winner] || 0) + 1; });
  const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return `<div class="page-head"><div><h1>Histórico</h1><p>Campeões de todas as competições desde o início da sua carreira.</p></div>${compTabs('hist')}</div>
  ${hs.length ? `<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px" id="compGrid">
    <div class="grid" style="align-content:start">${years.map(y => `<div class="card"><div class="card-head"><h3>${ic('calendar')} ${y}</h3></div>${hs.filter(h => h.year === y).map(h => `<div class="li small"><span class="grow">${esc(h.comp)}</span>${crest(s.clubs[h.winner], 18)}<b>${esc(s.clubs[h.winner]?.short || '?')}</b><span class="faint">vice: ${esc(s.clubs[h.runnerUp]?.short || '—')}</span></div>`).join('')}</div>`).join('')}</div>
    <div class="card"><div class="card-head"><h3>${ic('trophy')} Maiores campeões</h3></div>${top.map(([id, n]) => `<div class="li">${crest(s.clubs[id], 20)}<span class="grow">${esc(s.clubs[id]?.short || id)}</span><b>${n}</b></div>`).join('')}</div>
  </div>` : '<p class="muted">Os campeões aparecem aqui ao fim de cada competição.</p>'}`;
}

/* =========================================================
   6. Transferências
   ========================================================= */
function vTransfers() {
  const s = S(), me = C.myClub(), f = ui.mk;
  const T = [['search', 'search', 'Buscar'], ['free', 'user', 'Livres'], ['market', 'line-chart', 'Mercado'], ['scout', 'scan-search', 'Olheiros'], ['loans', 'repeat', 'Empréstimos'], ['sell', 'tag', 'Minhas vendas']];
  const tabs = `<div class="seg">${T.map(([k, i, l]) => `<button class="${f.tab === k ? 'on' : ''}" data-mktab="${k}">${ic(i)} ${l}</button>`).join('')}</div>`;
  const win = M.windowState();
  const head = `<div class="page-head"><div><h1>Transferências</h1><p>Caixa ${money(me.balance)} · folha ${money(C.payroll(me))} de ${money(me.wageBudget)}/mês · elenco ${me.squad.length}/32</p>
    <p><span class="tag ${win.open ? 'tag-lime' : 'tag-red'}">${ic(win.open ? 'door-open' : 'lock')} ${esc(win.label)}${win.days != null ? ` · ${win.open ? 'fecha' : 'abre'} em ${win.days} dias` : ''}</span></p></div><div class="right">${tabs}</div></div>`;
  const pRow = (p, extra = '') => `<div class="li click" data-player="${p.id}" style="cursor:pointer">${posB(p.pos)}<span class="grow"><b>${esc(p.name)}</b> <span class="faint small">${p.club ? esc(s.clubs[p.club].short) : 'livre'} · ${p.age} anos</span></span>${extra}${ovrB(p.ovr)}</div>`;
  if (f.tab === 'market') {
    const tr = s.transfers.slice(0, 25);
    const expiring = Object.values(s.players).filter(p => p.club && p.club !== me.id && p.contract <= 1 && !p.precontract).sort((a, b) => b.ovr - a.ovr).slice(0, 10);
    const bargains = Object.values(s.players).filter(p => p.club && p.club !== me.id && !p.loan).sort((a, b) => (b.ovr - b.value * 0.8) - (a.ovr - a.value * 0.8)).slice(0, 8);
    return head + `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>${ic('arrow-left-right')} Últimas transferências</h3></div>${tr.map(t => `<div class="li small"><span class="faint" style="width:70px">${C.dateLabel(t.day, false)}</span><span class="grow"><b>${esc(t.name)}</b> <span class="faint">${t.from ? esc(s.clubs[t.from]?.short || '—') : 'livre'} → ${esc(s.clubs[t.to]?.short || '—')}</span></span><span class="tag">${esc(t.kind)}</span><b>${t.fee ? money(t.fee) : '—'}</b></div>`).join('') || '<p class="faint">Nenhuma movimentação ainda.</p>'}</div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-head"><h3>${ic('calendar-check')} Contratos terminando</h3></div><p class="faint small" style="margin-top:0">A partir da metade da temporada dá para assinar pré-contrato e trazê-los de graça.</p>${expiring.map(p => pRow(p)).join('') || '<p class="faint">—</p>'}</div>
        <div class="card"><div class="card-head"><h3>${ic('badge-percent')} Melhor custo-benefício</h3></div>${bargains.map(p => pRow(p, `<span class="small">${money(p.value)}</span>`)).join('')}</div>
      </div></div>`;
  }
  if (f.tab === 'scout') {
    const known = Object.keys(s.scout.known).map(id => s.players[id]).filter(Boolean).sort((a, b) => b.pot - a.pot);
    return head + `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>${ic('scan-search')} Olheiros em campo</h3><span class="right faint">${s.scout.tasks.length}/3</span></div>
        ${s.scout.tasks.map(t => { const p = s.players[t.pid]; return p ? pRow(p, `<span class="tag">relatório em ${Math.max(0, t.until - s.day)}d</span>`) : ''; }).join('') || '<p class="faint">Nenhum olheiro ocupado. Abra um jogador e toque em “Observar” para revelar o potencial exato.</p>'}</div>
      <div class="card"><div class="card-head"><h3>${ic('file-text')} Relatórios concluídos</h3></div>${known.slice(0, 30).map(p => pRow(p, `<span class="small">pot. <b>${p.pot}</b></span>`)).join('') || '<p class="faint">—</p>'}</div></div>`;
  }
  if (f.tab === 'loans') {
    const inL = C.squadOf(me).filter(p => p.loan);
    const outL = Object.values(s.players).filter(p => p.loan && p.loan.from === me.id);
    const avail = C.squadOf(me).filter(p => p.forLoan);
    const offers = s.inbox.filter(m => m.offer?.kind === 'loanout');
    return head + `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>${ic('log-in')} Emprestados para você</h3></div>${inL.map(p => pRow(p, `<span class="small">${Math.round(p.loan.share * 100)}% do salário</span>`)).join('') || '<p class="faint">Nenhum. Peça empréstimo abrindo um jogador reserva de outro clube.</p>'}
        <div class="card-head" style="margin-top:14px"><h3>${ic('log-out')} Cedidos por você</h3></div>${outL.map(p => pRow(p, `<span class="small">${p.st.apps} jogos</span>`)).join('') || '<p class="faint">Nenhum.</p>'}</div>
      <div class="card"><div class="card-head"><h3>${ic('repeat')} Disponíveis para empréstimo</h3></div>${avail.map(p => pRow(p)).join('') || '<p class="faint">Marque jovens com poucos minutos como “Disponível p/ empréstimo” para que joguem e evoluam.</p>'}
        <div class="card-head" style="margin-top:14px"><h3>${ic('mail')} Propostas</h3></div>${offers.map(msgHtml).join('') || '<p class="faint">Nenhuma proposta.</p>'}</div></div>`;
  }
  if (f.tab === 'sell') {
    const sale = C.squadOf(me).filter(p => p.forSale);
    const offers = s.inbox.filter(m => m.offer?.kind === 'sale');
    return head + `<div class="grid g2"><div class="card"><div class="card-head"><h3>${ic('tag')} Jogadores à venda</h3></div>${sale.map(p => `<div class="li click" data-player="${p.id}" style="cursor:pointer">${posB(p.pos)}<span class="grow">${esc(p.name)}</span>${ovrB(p.ovr)}<span class="small">${money(p.value)}</span></div>`).join('') || '<p class="faint">Nenhum atleta listado. Abra um jogador no Elenco e coloque-o à venda.</p>'}</div>
      <div class="card"><div class="card-head"><h3>${ic('banknote')} Propostas recebidas</h3></div>${offers.map(msgHtml).join('') || '<p class="faint">Nenhuma proposta.</p>'}</div></div>`;
  }
  let pool = Object.values(s.players).filter(p => p.club !== me.id && !p.youth && (f.tab === 'free' ? !p.club : true));
  if (f.name) pool = pool.filter(p => p.name.toLowerCase().includes(f.name.toLowerCase()));
  if (f.pos) pool = pool.filter(p => p.pos === f.pos);
  if (f.nat) pool = pool.filter(p => p.nat === f.nat);
  pool = pool.filter(p => p.age >= f.ageMin && p.age <= f.ageMax && p.ovr >= f.ovrMin && p.pot >= f.potMin && (!f.price || p.value <= f.price) && (!f.wage || p.wage <= f.wage / 1000));
  pool.sort((a, b) => b.ovr - a.ovr || b.pot - a.pot);
  const total = pool.length; pool = pool.slice(0, 80);
  const nats = [...new Set(Object.values(s.players).map(p => p.nat))].sort();
  return head + `<div class="card" style="margin-bottom:12px"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px">
    <label class="field">Nome<input class="input" data-mk="name" value="${esc(f.name)}" placeholder="Buscar…"></label>
    <label class="field">Posição<select class="input" data-mk="pos"><option value="">Todas</option>${POS_ORDER.map(p => `<option value="${p}" ${f.pos === p ? 'selected' : ''}>${POS_LABEL[p]}</option>`).join('')}</select></label>
    <label class="field">País<select class="input" data-mk="nat"><option value="">Todos</option>${nats.map(n => `<option ${f.nat === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field">Idade mín./máx.<div class="row"><input class="input" type="number" data-mk="ageMin" value="${f.ageMin}"><input class="input" type="number" data-mk="ageMax" value="${f.ageMax}"></div></label>
    <label class="field">Overall mín.<input class="input" type="number" data-mk="ovrMin" value="${f.ovrMin}"></label>
    <label class="field">Potencial mín.<input class="input" type="number" data-mk="potMin" value="${f.potMin}"></label>
    <label class="field">Preço máx. (mi)<input class="input" type="number" step="0.5" data-mk="price" value="${f.price || ''}" placeholder="—"></label>
    <label class="field">Salário máx. (mil)<input class="input" type="number" data-mk="wage" value="${f.wage || ''}" placeholder="—"></label>
  </div></div>
  <div class="card" style="padding:6px"><div class="table-wrap"><table class="t"><thead><tr><th>Pos</th><th>Nome</th><th>Clube</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">Pot. est.</th><th class="num">Valor</th><th class="num">Salário</th><th class="num">Contr.</th></tr></thead><tbody>
    ${pool.map(p => `<tr class="click" data-player="${p.id}"><td>${posB(p.pos)}</td><td><b>${esc(p.name)}</b> ${p.forSale ? '<span class="tag tag-yellow">À venda</span>' : ''} <span class="faint small">${p.natCode !== 'BR' ? p.natCode : ''}</span></td><td>${p.club ? `${crest(s.clubs[p.club], 18)} ${esc(s.clubs[p.club].short)}` : '<span class="tag">Livre</span>'}</td><td class="num">${p.age}</td><td class="num">${ovrB(p.ovr)}</td><td class="num faint">${potEst(p)}</td><td class="num">${money(p.value)}</td><td class="num">${money(p.wage)}</td><td class="num">${p.contract}a</td></tr>`).join('')}
  </tbody></table></div><p class="faint small" style="padding:6px 10px;margin:0">${total > 80 ? `Mostrando 80 de ${total}. Refine os filtros.` : `${total} jogador(es).`}</p></div>`;
}

function bidModal(id) {
  const s = S(), p = s.players[id], me = C.myClub();
  s.bidBlock ||= {};
  if (s.bidBlock[id] > s.day) return toast(`O ${s.clubs[p.club]?.short} não quer negociar por alguns dias.`, false);
  if (!p.club) return contractModal(p, 0);
  modal(`<div class="modal-head">${crest(s.clubs[p.club], 36)}<div><h2>Proposta por ${esc(p.name)}</h2><small class="muted">${esc(s.clubs[p.club].name)} · valor de mercado ${money(p.value)}</small></div><button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button></div>
    <label class="field">Valor da proposta (R$ milhões)<input class="input" id="bFee" type="number" min="0" step="0.1" value="${p.value.toFixed(1)}"></label>
    <p class="faint small">Seu orçamento: ${money(me.balance)}. A IA avalia valor, importância do atleta no elenco e as necessidades do clube.</p>
    <div id="bRes"></div>
    <div class="modal-foot"><button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="bGo">${ic('send')} Enviar proposta</button></div>`);
  modalEl.querySelector('#bGo').onclick = () => {
    const fee = Math.round((+modalEl.querySelector('#bFee').value || 0) * 100) / 100;
    if (fee > me.balance) return toast('Você não tem orçamento para essa proposta.', false);
    const ev = C.evaluateBid(p, fee);
    const out = modalEl.querySelector('#bRes');
    if (ev.kind === 'accept') { closeModal(); toast(ev.clause ? `Multa paga: o ${s.clubs[p.club].short} é obrigado a liberar. Negocie com o jogador.` : `${s.clubs[p.club].short} aceitou ${money(fee)}. Agora negocie o contrato.`); contractModal(p, fee); }
    else if (ev.kind === 'counter') { out.innerHTML = `<div class="msg unread"><div class="grow"><b>Contraproposta</b><p class="small muted">O ${esc(s.clubs[p.club].short)} libera por <b>${money(ev.ask)}</b>.</p><button class="btn btn-sm btn-primary" id="bCounter" ${ev.ask > me.balance ? 'disabled' : ''}>Aceitar ${money(ev.ask)}</button></div></div>`; icons(); modalEl.querySelector('#bCounter').onclick = () => { closeModal(); contractModal(p, ev.ask); }; }
    else { s.bidBlock[id] = s.day + 3; C.save(); out.innerHTML = `<div class="msg"><div class="grow"><b class="neg">Proposta recusada</b><p class="small muted">O clube considera o atleta fundamental. Tente de novo em alguns dias com um valor maior.</p></div></div>`; modalEl.querySelector('#bGo').disabled = true; }
  };
}

function contractModal(p, fee) { negotiationModal(p, 'sign', fee); }

/* =========================================================
   7. Treinamentos
   ========================================================= */
function vTraining() {
  const s = S(), me = C.myClub();
  s.training ||= { intensity: 1 };
  const sq = C.squadOf(me).sort((a, b) => a.age - b.age);
  return `<div class="page-head"><div><h1>Treinamentos</h1><p>A evolução considera idade, potencial, minutos jogados, moral e o plano de cada atleta.</p></div></div>
  <div class="grid g3" style="margin-bottom:14px">
    <div class="card"><div class="card-head"><h3>${ic('gauge')} Intensidade</h3></div><div class="seg">${[[0.7, 'Leve'], [1, 'Normal'], [1.3, 'Intensa']].map(([v, l]) => `<button class="${s.training.intensity === v ? 'on' : ''}" data-intensity="${v}">${l}</button>`).join('')}</div>
      <p class="faint small">${s.training.intensity > 1 ? 'Mais evolução, recuperação física mais lenta.' : s.training.intensity < 1 ? 'Recuperação plena, evolução menor.' : 'Equilíbrio entre evolução e recuperação.'}</p></div>
    <div class="card stat"><small>Jovens (≤ 21)</small><b>${sq.filter(p => p.age <= 21).length}</b><span class="faint small">${S().coach.style === 'youth' ? 'Treinador formador: +15% de evolução' : 'Mais minutos = mais evolução'}</span></div>
    <div class="card"><div class="card-head"><h3>${ic('cross')} Departamento médico</h3><span class="right faint">${sq.filter(p => p.injury).length} lesionado(s)</span></div>${sq.filter(p => p.injury).map(p => `<div class="li small"><span class="grow"><b>${esc(p.name)}</b><br><span class="faint">${esc(p.injuryType || 'Lesão')} · ${p.injury} dias</span></span>${p.treated ? '<span class="tag">Em tratamento</span>' : `<button class="btn btn-sm" data-treat="${p.id}">Tratar (${money(M.treatCost(p))})</button>`}</div>`).join('') || '<p class="faint small">Elenco saudável.</p>'}</div>
  </div>
  <div class="card" style="padding:6px"><div class="table-wrap"><table class="t"><thead><tr><th>Pos</th><th>Nome</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">Pot. est.</th><th class="num">Min.</th><th>Progresso</th><th>Plano individual</th></tr></thead><tbody>
    ${sq.map(p => `<tr><td>${posB(p.pos)}</td><td><b>${esc(p.name)}</b></td><td class="num">${p.age}</td><td class="num">${ovrB(p.ovr)}</td><td class="num faint">${potEst(p)}</td><td class="num">${p.st.mins}</td><td><span class="meter" style="width:80px;display:inline-block"><i style="width:${Math.round(Math.max(0, p.xp) * 100)}%"></i></span></td><td><select class="input" style="height:30px;width:auto" data-plan="${p.id}">${Object.entries(PLANS).map(([k, v]) => `<option value="${k}" ${p.plan === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* =========================================================
   8. Finanças
   ========================================================= */
function vFinance() {
  const s = S(), me = C.myClub();
  const pay = C.payroll(me);
  const L = C.leagueCfg(me.division);
  const sponsor = L.sponsorMonthly * (0.6 + me.prestige * 0.35);
  const led = s.ledger.filter(x => x.year === s.year).slice().reverse();
  const inc = led.filter(x => x.amount > 0).reduce((a, x) => a + x.amount, 0), out = led.filter(x => x.amount < 0).reduce((a, x) => a + x.amount, 0);
  return `<div class="page-head"><div><h1>Finanças</h1><p>Valores em reais. Salários e patrocínio são lançados no dia 1º de cada mês.</p></div></div>
  <div class="grid g4" style="margin-bottom:14px">
    <div class="card stat"><small>Caixa / orçamento de transferências</small><b class="${me.balance < 0 ? 'neg' : ''}">${money(me.balance)}</b></div>
    <div class="card stat"><small>Folha salarial</small><b>${money(pay)}<span class="faint" style="font-size:12px">/mês</span></b><div class="meter ${pay > me.wageBudget * 0.95 ? 'bad' : pay > me.wageBudget * 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, pay / me.wageBudget * 100)}%"></i></div><span class="faint small">Limite ${money(me.wageBudget)}</span></div>
    <div class="card stat"><small>Patrocínio master</small><b>${money(sponsor)}<span class="faint" style="font-size:12px">/mês</span></b></div>
    <div class="card stat"><small>Balanço da temporada</small><b class="${inc + out >= 0 ? 'pos' : 'neg'}">${money(inc + out, true)}</b><span class="faint small">Entradas ${money(inc)} · saídas ${money(-out)}</span></div>
  </div>
  <div class="grid g2">
    <div class="card"><div class="card-head"><h3>${ic('receipt')} Lançamentos de ${s.year}</h3></div>${led.slice(0, 40).map(x => `<div class="li"><span class="faint small" style="width:84px">${C.dateLabel(x.day, false)}</span><span class="grow">${esc(x.label)}</span><b class="${x.amount >= 0 ? 'pos' : 'neg'}">${money(x.amount, true)}</b></div>`).join('') || '<p class="faint">Sem lançamentos ainda.</p>'}</div>
    <div class="card"><div class="card-head"><h3>${ic('info')} Fontes de receita</h3></div>
      <div class="li"><span class="grow">Bilheteria (jogos em casa)</span><b>${esc(me.stadium)} · ${me.capacity.toLocaleString('pt-BR')} lugares</b></div>
      <div class="li"><span class="grow">Premiação por colocação</span><b>1º: ${money(L.prizeByPosition[0])} · 20º: ${money(L.prizeByPosition[19])}</b></div>
      <div class="li"><span class="grow">Patrocínio</span><b>Mensal, cresce com o prestígio</b></div>
      <div class="li"><span class="grow">Venda de atletas</span><b>Propostas na caixa de entrada</b></div>
      <div class="li"><span class="grow">Despesas operacionais</span><b>${money(0.05 + me.prestige * 0.04)}/mês</b></div>
    </div>
  </div>`;
}

/* =========================================================
   9. Diretoria
   ========================================================= */
function vBoard() {
  const s = S(), me = C.myClub(), b = s.board;
  const pos = C.position(me.id);
  const msgs = s.inbox.filter(m => m.kind === 'board' || m.kind === 'job');
  return `<div class="page-head"><div><h1>Diretoria</h1><p>Presidente e conselho do ${esc(me.name)}</p></div></div>
  <div class="grid g2" style="margin-bottom:14px">
    <div class="card"><div class="card-head"><h3>${ic('landmark')} Confiança</h3><b class="right" style="font-size:20px">${b.confidence}%</b></div><div class="meter ${b.confidence < 30 ? 'bad' : b.confidence < 50 ? 'warn' : ''}"><i style="width:${b.confidence}%"></i></div>
      <p class="muted small">${b.confidence >= 70 ? 'A diretoria está muito satisfeita com o trabalho.' : b.confidence >= 45 ? 'A diretoria confia no projeto, mas cobra resultados.' : b.confidence >= 25 ? 'O cargo está ameaçado. Resultados imediatos são necessários.' : 'Sua permanência está por um fio.'}</p></div>
    <div class="card"><div class="card-head"><h3>${ic('target')} Objetivos da temporada</h3></div>
      <div class="li"><span class="grow">Campeonato</span><b>${esc(b.objective.text)}</b></div>
      <div class="li"><span class="grow">Posição atual</span><b class="${pos <= b.objective.pos ? 'pos' : 'warn'}">${pos}º</b></div>
      <div class="li"><span class="grow">Finanças</span><b class="${me.balance >= 0 ? 'pos' : 'neg'}">${me.balance >= 0 ? 'Caixa positivo' : 'Caixa negativo'}</b></div>
      <div class="li"><span class="grow">Desenvolver jovens</span><b>${C.squadOf(me).filter(p => p.age <= 21 && p.st.apps >= 5).length} jovens com 5+ jogos</b></div>
      <div class="li"><span class="grow">Expectativa pela força do elenco</span><b>${b.expected}º</b></div></div>
  </div>
  <div class="card" style="margin-bottom:14px"><div class="card-head"><h3>${ic('palette')} Identidade do clube</h3><button class="btn btn-sm right" data-identity="1">${ic('pencil')} Personalizar uniforme e escudo</button></div>
    <div class="row">${crest(me, 56)}<div><b>${esc(me.name)}</b><p class="faint small" style="margin:2px 0">Cores ${me.colors.join(' / ')} · escudo ${({ shield: 'clássico', round: 'redondo', diamond: 'losango' })[me.crest] || me.crest}</p></div></div></div>
  <div class="card" style="margin-bottom:14px"><div class="card-head"><h3>${ic('hand')} Pedidos à diretoria</h3><span class="right faint">um de cada por temporada</span></div>
    <div class="grid g3">
      <div><b>Verba para reforços</b><p class="faint small">Aporte extra no caixa. Exige confiança ≥ 60%.</p><button class="btn btn-sm" data-board="budget" ${b.requests?.[`${s.year}:budget`] ? 'disabled' : ''}>${ic('banknote')} Pedir verba</button></div>
      <div><b>Aumento da folha</b><p class="faint small">+12% no limite salarial. Exige confiança ≥ 55%.</p><button class="btn btn-sm" data-board="wages" ${b.requests?.[`${s.year}:wages`] ? 'disabled' : ''}>${ic('wallet')} Pedir aumento</button></div>
      <div><b>Categorias de base · nível ${me.youthLevel}/3</b><p class="faint small">Jovens promovidos com mais potencial. Custa ${money(M.youthCost(me))}.</p><button class="btn btn-sm" data-board="youth" ${me.youthLevel >= 3 || b.requests?.[`${s.year}:youth`] ? 'disabled' : ''}>${ic('sprout')} Investir</button></div>
    </div></div>
  <div class="card"><div class="card-head"><h3>${ic('mail')} Comunicações</h3><button class="btn btn-sm btn-danger right" data-act="resign">${ic('door-open')} Pedir demissão</button></div>${msgs.slice(0, 10).map(msgHtml).join('') || '<p class="faint">Sem mensagens.</p>'}</div>`;
}

/* =========================================================
   10. Carreira
   ========================================================= */
function vCareer() {
  const s = S(), co = s.coach, me = C.myClub();
  const level = 1 + Math.floor(co.matches / 20) + co.titles.length * 2;
  return `<div class="page-head"><div><h1>Carreira</h1><p>${esc(co.first)} ${esc(co.last)} · ${esc(co.nat)} · ${co.age + s.season - 1} anos</p></div></div>
  <div class="grid" style="grid-template-columns:280px minmax(0,1fr);gap:14px" id="careerGrid">
    <div class="card center"><div style="display:grid;justify-items:center">${avatar(co.look, 160)}</div><h2 style="margin-top:6px">${esc(co.first)} ${esc(co.last)}</h2><p class="muted small">${COACH_STYLES[co.style]?.[0] || 'Treinador'} · Nível ${level}</p>
      <div class="opt-group" style="text-align:left;margin-top:10px"><small>Reputação ${Math.round(co.rep)}/100</small><div class="meter"><i style="width:${co.rep}%"></i></div></div>
      <div class="grid g3" style="margin-top:14px;gap:6px"><div class="stat"><small>Vitórias</small><b>${co.w}</b></div><div class="stat"><small>Empates</small><b>${co.d}</b></div><div class="stat"><small>Derrotas</small><b>${co.l}</b></div></div>
      <p class="faint small" style="margin-top:12px">${co.matches} partidas · aproveitamento ${co.matches ? Math.round((co.w * 3 + co.d) / (co.matches * 3) * 100) : 0}%</p>
      <div class="row-wrap" style="justify-content:center;margin-top:10px"><button class="btn btn-sm btn-danger" data-act="wipe">${ic('trash-2')} Apagar carreira</button></div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card"><div class="card-head"><h3>${ic('trophy')} Títulos</h3></div>${co.titles.map(t => `<div class="li">${ic('trophy', 'lime')}<span class="grow">${esc(t.name)}</span><b>${t.year}</b><span class="faint small">${esc(s.clubs[t.club]?.short || '')}</span></div>`).join('') || '<p class="faint">Nenhum título ainda. A primeira taça vale 100 XP no Arcade Social.</p>'}</div>
      <div class="card"><div class="card-head"><h3>${ic('briefcase')} Histórico de clubes</h3></div><table class="t"><thead><tr><th>Clube</th><th>Período</th><th class="num">V</th><th class="num">E</th><th class="num">D</th><th>Saída</th></tr></thead><tbody>
        ${co.history.slice().reverse().map(h => `<tr><td>${crest(s.clubs[h.club], 18)} ${esc(s.clubs[h.club]?.short || h.club)}</td><td>${h.from}–${h.to || 'atual'}</td><td class="num">${h.w}</td><td class="num">${h.d}</td><td class="num">${h.l}</td><td class="faint small">${esc(h.left || '')}</td></tr>`).join('')}</tbody></table></div>
      ${me && me.history.length ? `<div class="card"><div class="card-head"><h3>${ic('line-chart')} Campanhas do ${esc(me.short)}</h3></div>${me.history.slice().reverse().map(h => `<div class="li"><b>${h.year}</b><span class="grow">${esc(C.leagueShort(h.division))}</span><b>${h.pos}º</b></div>`).join('')}</div>` : ''}
      <div class="card"><div class="card-head"><h3>${ic('sparkles')} Arcade Social</h3></div>${Arcade.profile() ? `<p class="small">Conectado como <b>${esc(Arcade.profile().username)}</b>. Vitórias, temporadas e títulos são relatados ao hub, que valida e concede o XP.</p>` : '<p class="small muted">Entre no Arcade Hub para que suas conquistas rendam XP no perfil global.</p>'}
        <div class="row-wrap">${xpRules().map(([l, v]) => `<span class="tag">${esc(l)} · +${v} XP</span>`).join('')}</div></div>
    </div>
  </div>`;
}
function xpRules() {
  const r = window.AH?.config?.persistentXp?.['club-legacy'];
  if (!r) return [];
  return Object.entries(r).filter(([k]) => k !== 'labels').map(([k, v]) => [r.labels?.[k] || k, Object.values(v).join(' / ')]);
}

/* =========================================================
   Ações
   ========================================================= */
const VIEWS = { central: vCentral, squad: vSquad, tactics: vTactics, calendar: vCalendar, comps: vComps, transfers: vTransfers, training: vTraining, finance: vFinance, board: vBoard, career: vCareer };
const AFTER = {
  tactics: afterTactics,
  transfers: main => main.querySelectorAll('[data-mk]').forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'change', () => { const k = el.dataset.mk; ui.mk[k] = el.type === 'number' ? (+el.value || 0) : el.value; renderView(); })),
  training: main => main.querySelectorAll('[data-plan]').forEach(el => el.addEventListener('change', () => { S().players[el.dataset.plan].plan = el.value; C.save(); toast('Plano atualizado.'); }))
};

async function afterUserMatch(f) {
  progress('Simulando os outros jogos da rodada…', 0);
  await C.playAIFixturesAsync(f.day, (i, n) => progress(`Simulando os outros jogos da rodada… ${i}/${n}`, i / n));
  C.save();
  progressEnd();
}

async function simulateUserMatch() {
  const f = C.todayFixture(); if (!f) return;
  progress('Simulando a partida…', 0.1);
  await new Promise(r => setTimeout(r, 20));
  const m = C.createMatch(f, { assistant: true });
  m.runToEnd();
  C.commitResult(f, m, true);
  C.save();
  await afterUserMatch(f);
  refresh();
  showResult(f);
}

function showResult(f) {
  modal(resultModalHtml(f, S()), { wide: true });
}

function showSeasonSummary() {
  const s = S(), x = s.lastSeason; if (!x) return;
  s.showSeasonSummary = false; C.save();
  const u = x.user;
  const nm = (id) => esc(s.clubs[id]?.short || id);
  modal(`<div class="modal-head"><h2>${ic('flag')} Fim da temporada ${x.year}</h2></div>
    ${u ? `<div class="card" style="margin-bottom:12px"><div class="row">${crest(s.clubs[u.club], 44)}<div class="grow"><b>${nm(u.club)} terminou em ${u.pos}º na ${esc(C.leagueShort(u.division))}</b><p class="small muted" style="margin:2px 0">Meta: ${esc(u.objective)} — ${u.met ? '<span class="pos">cumprida</span>' : '<span class="neg">não cumprida</span>'}</p></div></div></div>` : ''}
    <div class="grid g2">
      <div><h3 style="margin-bottom:6px">${ic('trophy', 'lime')} Campeões</h3>${(s.honours || []).filter(h => h.year === x.year).map(h => `<div class="li small"><span class="grow">${esc(h.comp)}</span><b>${nm(h.winner)}</b></div>`).join('')}
        <h3 style="margin:12px 0 6px">Artilheiros</h3>${Object.keys(x.scorers).map(l => x.scorers[l][0] ? `<div class="li small">${esc(C.leagueShort(l))}<span class="grow" style="text-align:right">${esc(x.scorers[l][0].name)} (${esc(x.scorers[l][0].club)})</span><b>${x.scorers[l][0].goals}</b></div>` : '').join('')}</div>
      <div><h3 style="margin-bottom:6px">${ic('arrow-up-circle', 'pos')} Sobem</h3><p class="small">${x.promoted.map(nm).join(', ')}</p><h3 style="margin:10px 0 6px">${ic('arrow-down-circle', 'neg')} Caem</h3><p class="small">${x.relegated.map(nm).join(', ')}</p></div>
    </div>
    <p class="faint small">Jogadores envelheceram, alguns se aposentaram e a base revelou novos talentos. Novo calendário da temporada ${s.year} gerado.</p>
    <div class="modal-foot"><button class="btn btn-primary" data-close>${ic('play')} Começar temporada ${s.year}</button></div>`, { wide: true });
}

const ACT = {
  continue: () => { view = 'central'; renderShell(); },
  wizard: () => { W.step = 1; renderWizard(); },
  home: () => renderStart(),
  'wiz-next': () => { if (!W.coach.first || !W.coach.last) return toast('Informe nome e sobrenome.', false); W.step = 2; renderWizard(); },
  'wiz-back': () => { W.step = 1; renderWizard(); },
  'wiz-start': () => { if (C.hasSave() && !confirm('Isso substitui a carreira salva. Continuar?')) return; startCareer(false); },
  'wiz-create': () => { if (C.hasSave() && !confirm('Isso substitui a carreira salva. Continuar?')) return; startCareer(true); },
  menu: () => document.getElementById('side')?.classList.toggle('open'),
  day: () => { const r = C.advanceDay(); if (!r.ok) return toast(r.msg, false); refresh(); },
  tonext: async () => { progress('Avançando o calendário…', 0.3); const r = await C.advanceToNextMatch(() => progress('Avançando o calendário…', 0.6)); progressEnd(); if (!r.ok) toast(r.msg, false); refresh(); },
  toend: async () => { progress('Concluindo a temporada…', 0.5); const y = S().year; let g = 0; while (S().year === y && g++ < 200) { const r = C.advanceDay(); if (!r.ok) break; if (g % 4 === 0) await new Promise(r => setTimeout(r)); } progressEnd(); refresh(); },
  sim: () => simulateUserMatch(),
  play: () => {
    const f = C.todayFixture(); if (!f) return;
    ensureLineup(C.myClub());
    openMatch(f, {
      onCommit: async () => { await afterUserMatch(f); },
      onClose: () => { refresh(); }
    });
  },
  readall: () => { S().inbox.forEach(m => m.read = true); C.save(); refresh(); },
  autopick: () => { C.autoLineup(C.myClub()); C.save(); renderView(); toast('Escalação automática aplicada.'); },
  compare: () => compareModal(),
  resign: () => { if (!confirm('Pedir demissão? Seu progresso pessoal é mantido e você poderá procurar outro clube.')) return; C.fire('O treinador pediu para sair.', true); C.save(); view = 'central'; refresh(); },
  jobhunt: () => { C.makeJobOffers(true); C.save(); refresh(); },
  wipe: () => { if (!confirm('Apagar a carreira salva permanentemente?')) return; C.deleteSave(); renderStart(); }
};

document.addEventListener('click', e => {
  if (view === 'wizard' && app.contains(e.target) && !e.target.closest('[data-act]')) return; // o assistente trata os próprios cliques
  const t = e.target.closest('[data-act],[data-sqtab],[data-promote],[data-yrelease],[data-identity],[data-nav],[data-player],[data-sort],[data-close],[data-treat],[data-forloan],[data-scout],[data-pre],[data-loan],[data-clause],[data-board],[data-tac],[data-slot],[data-pick],[data-bench],[data-comp],[data-round],[data-fx],[data-mktab],[data-bid],[data-renew],[data-sale],[data-release],[data-offer-yes],[data-offer-no],[data-intensity],[data-msg]');
  if (!t || document.getElementById('match').contains(t)) return;
  const d = t.dataset;
  if (d.act) return ACT[d.act]?.(t);
  if (d.close !== undefined) return closeModal();
  if (d.nav) { if (t.disabled) return; view = d.nav; document.getElementById('side')?.classList.remove('open'); ui.tSlot = null; return renderShell(); }
  if (d.sqtab) { ui.squadTab = d.sqtab; return renderView(); }
  if (d.promote) { const r = Y.promote(S().players[d.promote]); toast(r.ok ? 'Promovido ao time principal!' : r.msg, r.ok, 'sprout'); return renderView(); }
  if (d.yrelease) { const p = S().players[d.yrelease]; if (!confirm(`Dispensar ${p.name} da base?`)) return; Y.release(p); return renderView(); }
  if (d.identity) return identityModal();
  if (d.bid) { closeModal(); return bidModal(d.bid); }
  if (d.treat) { const r = M.treat(S().players[d.treat]); toast(r.ok ? 'Tratamento intensivo iniciado: recuperação mais rápida.' : r.msg, r.ok); closeModal(); return refresh(); }
  if (d.forloan) { const p = S().players[d.forloan]; p.forLoan = !p.forLoan; C.save(); closeModal(); toast(p.forLoan ? `${p.name} disponível para empréstimo. Propostas chegam na janela.` : 'Removido da lista de empréstimos.'); return renderView(); }
  if (d.scout) { const r = M.scout(S().players[d.scout]); toast(r.ok ? `Olheiro designado. Relatório em ${r.days} dias.` : r.msg, r.ok, 'scan-search'); return; }
  if (d.pre) { closeModal(); return negotiationModal(S().players[d.pre], 'pre', 0); }
  if (d.loan) { closeModal(); return loanModal(d.loan); }
  if (d.clause) { const p = S().players[d.clause]; const r = M.payClause(p); if (!r.ok) return toast(r.msg, false); if (!confirm(`Pagar a multa de ${money(r.fee)} ao ${r.from.short}? O clube é obrigado a liberar ${p.name}.`)) return; closeModal(); return contractModal(p, r.fee); }
  if (d.board) { const r = M.boardRequest(d.board); toast(r.msg, r.ok, 'landmark'); return refresh(); }
  if (d.renew) { return renewModal(d.renew); }
  if (d.sale) { const p = S().players[d.sale]; p.forSale = !p.forSale; C.save(); closeModal(); toast(p.forSale ? `${p.name} está à venda. Aguarde propostas na caixa de entrada.` : `${p.name} saiu da lista de vendas.`); return renderView(); }
  if (d.release) { const p = S().players[d.release]; const comp = Math.round(p.wage * Math.max(1, p.contract) * 6 * 1000) / 1000; if (!confirm(`Rescindir com ${p.name}? Multa: ${money(comp)}.`)) return; const r = C.releasePlayer(p); closeModal(); toast(r.ok ? `${p.name} foi dispensado.` : r.msg, r.ok); return refresh(); }
  if (d.offerYes || d.offerNo) {
    const m = S().inbox.find(x => x.id === (d.offerYes || d.offerNo)); if (!m) return;
    m.read = true;
    if (d.offerNo && m.offer.kind !== 'request') { m.done = 'recusada'; C.save(); return refresh(); }
    if (m.offer.kind === 'request') { M.answerRequest(m, !!d.offerYes); return refresh(); }
    if (m.offer.kind === 'sale') { const r = C.acceptSale(m); toast(r.ok ? 'Venda concluída.' : r.msg, r.ok); return refresh(); }
    if (m.offer.kind === 'loanout') { const r = M.acceptLoanOut(m); toast(r.ok ? 'Empréstimo acertado.' : r.msg, r.ok); return refresh(); }
    if (m.offer.kind === 'job') { if (C.myClub() && !confirm(`Deixar o ${C.myClub().short} e assumir o ${S().clubs[m.offer.club].short}?`)) return; m.done = 'aceita'; C.acceptJob(m.offer.club); view = 'central'; return refresh(); }
    return;
  }
  if (d.msg) { const m = S().inbox.find(x => x.id === d.msg); if (m && !m.read) { m.read = true; C.save(); } return; }
  if (d.player && !e.target.closest('[data-bench]')) {
    if (view === 'tactics') return;
    return playerModal(d.player);
  }
  if (d.sort) { if (ui.squadSort === d.sort) ui.squadDir *= -1; else { ui.squadSort = d.sort; ui.squadDir = 1; } return renderView(); }
  if (d.tac) {
    const me = C.myClub(); const k = d.tac; let v = d.v;
    if (k === 'mentality') v = +v;
    me.tactics[k] = v;
    if (k === 'formation') { const ids = me.tactics.lineup.slice(); C.autoLineup(me); /* reaproveita quem já era titular quando possível */ me.tactics.lineup = reorderForFormation(me, ids); }
    C.save(); return renderView();
  }
  if (d.slot !== undefined && view === 'tactics') {
    const i = +d.slot;
    if (ui.tPick) { assignToSlot(C.myClub(), i, ui.tPick); ui.tPick = null; ui.tSlot = null; }
    else if (ui.tSlot === i) ui.tSlot = null;
    else if (ui.tSlot != null) { const l = C.myClub().tactics.lineup; [l[ui.tSlot], l[i]] = [l[i], l[ui.tSlot]]; ui.tSlot = null; C.save(); }
    else ui.tSlot = i;
    return renderView();
  }
  if (d.bench) {
    const me = C.myClub(); const b = me.tactics.bench;
    if (b.includes(d.bench)) me.tactics.bench = b.filter(x => x !== d.bench);
    else if (b.length >= 9) return toast('O banco aceita no máximo 9 reservas.', false);
    else b.push(d.bench);
    C.save(); return renderView();
  }
  if (d.pick && view === 'tactics') {
    if (ui.tSlot != null) { assignToSlot(C.myClub(), ui.tSlot, d.pick); ui.tSlot = null; }
    else { toast('Agora clique no posto do campo para escalar o jogador.', true, 'mouse-pointer-click'); ui.tPick = d.pick; }
    return renderView();
  }
  if (d.comp) { ui.compTab = d.comp; return renderView(); }
  if (d.round) { ui.compRound ||= {}; ui.compRound[ui.compTab || C.myClub()?.division || 'A'] = +d.round; return renderView(); }
  if (d.fx) { const f = Object.values(S().leagues).flatMap(l => l.fixtures).find(x => x.id === d.fx); if (f?.user) showResult(f); else if (f) toast(`${S().clubs[f.home].short} ${f.score[0]} x ${f.score[1]} ${S().clubs[f.away].short}`); return; }
  if (d.mktab) { ui.mk.tab = d.mktab; return renderView(); }
  if (d.intensity) { S().training.intensity = +d.intensity; C.save(); return renderView(); }
});

// troca de formação: mantém os mesmos titulares, redistribuídos pelos novos postos
function reorderForFormation(me, ids) {
  const slots = C.DB.formations[me.tactics.formation];
  const P = S().players;
  const pool = ids.filter(id => P[id] && me.squad.includes(id));
  if (pool.length !== 11) return me.tactics.lineup;
  const out = new Array(11); const used = new Set();
  const gk = pool.find(id => P[id].pos === 'GK');
  if (gk) { out[0] = gk; used.add(gk); }
  for (let i = 0; i < 11; i++) {
    if (out[i]) continue;
    const best = pool.filter(id => !used.has(id)).sort((a, b) => ratingAt(P[b], slots[i].r) - ratingAt(P[a], slots[i].r))[0];
    out[i] = best; used.add(best);
  }
  return out;
}

window.addEventListener('resize', () => { /* layout responsivo via CSS */ });
boot();

export { refresh };
