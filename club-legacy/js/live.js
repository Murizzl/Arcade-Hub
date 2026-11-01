/* =========================================================
   Partida ao vivo — tela do convidado. Não roda o motor: desenha
   o estado transmitido pelo anfitrião (com interpolação) e envia
   comandos de substituição, tática e pausa.
   ========================================================= */
import { esc, ic, POS_LABEL } from './util.js';
import { STYLES, PRESS, LINES, INSTR } from './engine.js';
import { PitchRenderer, kitsFor, teamColors } from './render.js';
import { crest } from './art.js';
import * as C from './career.js';
import { modal, closeModal, toast, ask } from './main.js';
import { resultModalHtml, statsHtml } from './match.js';
import { Arcade } from './arcade.js';

const root = document.getElementById('match');
const icons = () => window.lucide?.createIcons();

export function openLiveGuest(room, { home, away, mySide = 1, oppName, onClose }) {
  const clubs = { 'mp-h': { id: 'mp-h', ...home.club }, 'mp-a': { id: 'mp-a', ...away.club } };
  const H = clubs['mp-h'], A = clubs['mp-a'];
  const kits = kitsFor(H, A);
  let prev = null, cur = null, recvAt = 0, team = null, log = [], tab = 'log', running = true, raf = 0, ended = false, banner = 0;

  root.hidden = false;
  root.innerHTML = `
    <div class="scorebar">
      <div class="tm">${crest(H, 42)}<b>${esc(H.short)}</b></div>
      <div class="sc"><div class="score" id="lScore">0 - 0</div><div class="clock" id="lClock">00:00</div></div>
      <div class="tm away">${crest(A, 42)}<b>${esc(A.short)}</b></div>
    </div>
    <div class="match-body">
      <div class="field-wrap" id="lWrap"><canvas id="lPitch"></canvas><div id="lBanner"></div></div>
      <aside class="side-panel"><div class="tabs"><button data-ltab="log" class="on">Lances</button><button data-ltab="stats">Estatísticas</button><button data-ltab="team">Meu time</button></div><div class="pane" id="lPane"></div></aside>
    </div>
    <div class="controls">
      <span class="tag tag-lime">${ic('radio')} Ao vivo · sala ${esc(room.code)}</span>
      <button class="btn btn-icon" id="lPlay" title="Pausar / continuar">${ic('pause')}</button>
      <button class="btn" data-lact="tactics">${ic('clipboard-list')}<span class="lbl-sm">Táticas</span></button>
      <button class="btn" data-lact="subs">${ic('repeat')}<span class="lbl-sm">Substituições</span> <span class="tag" id="lSubs">0/5</span></button>
      <button class="btn right btn-ghost" data-lact="leave">${ic('log-out')}<span class="lbl-sm">Sair da sala</span></button>
    </div>`;
  icons();
  const canvas = root.querySelector('#lPitch');
  const R = new PitchRenderer(canvas);
  const onResize = () => R.resize();
  window.addEventListener('resize', onResize);

  room.on('st', d => { prev = cur; cur = d; recvAt = performance.now(); if (d.l?.length) { log.push(...d.l); if (tab === 'log') pane(); } hud(); });
  room.on('team', d => { team = d; if (tab === 'team') pane(); const el = root.querySelector('#lSubs'); if (el) el.textContent = `${d.subs}/5`; });
  room.on('pz', d => { running = d.running; setPlay(); });
  room.on('toast', msg => toast(msg, false));
  room.on('ev', ev => {
    if (ev.type === 'goal') showBanner(`<div class="big">GOL!</div><div class="who"><b>${esc(ev.name)} · ${ev.min}</b><small>${ev.assistName ? `Assistência: ${esc(ev.assistName)}` : ''}</small></div>`, 3500);
    else if (ev.type === 'card') showBanner(`<div class="big" style="font-size:32px;color:${ev.card === 'red' ? 'var(--neg)' : '#fde047'}">${ev.card === 'red' ? 'VERMELHO' : 'AMARELO'}</div><div class="who"><b>${esc(ev.name)} · ${ev.min}</b></div>`, 2200);
    else if (ev.type === 'injury' && ev.side === mySide) { toast(`${ev.name} se machucou. Faça uma substituição.`, false, 'cross'); subsPanel(); }
    else if (ev.type === 'halftime') halftime();
    else if (ev.type === 'secondhalf') closeModal();
  });
  room.on('end', d => finish(d));
  room.on('bye', () => { if (!ended) { toast('O anfitrião encerrou a sala.', false, 'wifi-off'); close(); } });
  room.on('peer-leave', () => { if (!ended) toast('Conexão com o anfitrião perdida…', false, 'wifi-off'); });
  room.send('cmd', { k: 'hello' });

  function showBanner(html, ms) {
    const el = root.querySelector('#lBanner'); el.innerHTML = `<div class="banner">${html}</div>`;
    clearTimeout(banner); banner = setTimeout(() => { el.innerHTML = ''; }, ms);
  }
  function setPlay() { const b = root.querySelector('#lPlay'); if (b) { b.innerHTML = ic(running ? 'pause' : 'play'); icons(); } }

  function frame(now) {
    if (cur) {
      const a = prev ? Math.min(1, (now - recvAt) / 125) : 1;
      const P = (i, j) => prev && prev.p[i] && prev.p[i][3] === cur.p[i][3] && prev.p[i][2] === cur.p[i][2] ? prev.p[i][j] + (cur.p[i][j] - prev.p[i][j]) * a : cur.p[i][j];
      const players = cur.p.map((p, i) => ({ x: P(i, 0) / 10, y: P(i, 1) / 10, side: p[2], num: p[3], gk: !!p[4], dive: p[5], ball: !!p[6] }));
      const bp = prev?.b || cur.b, bj = Math.hypot(cur.b[0] - bp[0], cur.b[1] - bp[1]) > 120;
      const ball = { x: (bj ? cur.b[0] : bp[0] + (cur.b[0] - bp[0]) * a) / 10, y: (bj ? cur.b[1] : bp[1] + (cur.b[1] - bp[1]) * a) / 10, z: cur.b[2] / 10 };
      R.draw({ players, ball, kits, pass: cur.pass ? { sx: cur.pass[0], sy: cur.pass[1], ex: cur.pass[2], ey: cur.pass[3] } : null });
    }
    raf = requestAnimationFrame(frame);
  }
  function hud() {
    if (!cur) return;
    root.querySelector('#lScore').textContent = `${cur.sc[0]} - ${cur.sc[1]}`;
    root.querySelector('#lClock').innerHTML = `${cur.ph === 'HT' ? 'Intervalo' : cur.ph === 'FT' ? 'Encerrado' : cur.c}${cur.x && cur.ph === 'live' ? `<span class="extra">+${cur.x}</span>` : ''}`;
    if (tab === 'stats') pane();
  }
  function pane() {
    const el = root.querySelector('#lPane'); if (!el) return;
    if (tab === 'log') el.innerHTML = log.slice().reverse().slice(0, 120).map(l => `<div class="log-item ${l.kind}"><span class="m">${l.min}</span><span>${esc(l.text)}</span></div>`).join('') || '<p class="faint small">Aguardando o apito…</p>';
    else if (tab === 'stats') el.innerHTML = cur ? statsHtml(cur.st, teamColors(kits)) : '';
    else el.innerHTML = team ? team.on.map(p => `<div class="sub-row"><span class="posb">${POS_LABEL[p.role]}</span><span class="grow small">${p.num}. ${esc(p.name)}${p.yellow ? ' 🟨' : ''}${p.injured ? ' ✚' : ''}</span><span class="energy ${p.energy < 50 ? 'vlow' : p.energy < 70 ? 'low' : ''}"><i style="width:${p.energy}%"></i></span></div>`).join('') : '<p class="faint small">Carregando…</p>';
  }
  function tacticsPanel() {
    if (!team) return toast('Aguardando dados do time…', false);
    const t = { ...team.tactics };
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(t[key]) === String(v) ? 'on' : ''}" data-lt="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const render = () => {
      modal(`<div class="modal-head"><h2>${ic('clipboard-list')} Táticas</h2><button class="btn btn-icon btn-ghost x" data-lclose>${ic('x')}</button></div>
        <div class="grid" style="gap:12px">
          <div class="opt-group"><small>Formação</small>${seg('formation', Object.keys(C.DB.formations).map(f => [f, f]))}</div>
          <div class="opt-group"><small>Mentalidade</small>${seg('mentality', [[-2, 'Muito def.'], [-1, 'Defensiva'], [0, 'Equilibrada'], [1, 'Ofensiva'], [2, 'Muito of.']])}</div>
          <div class="opt-group"><small>Estilo</small>${seg('style', Object.entries(STYLES).map(([k, v]) => [k, v.label]))}</div>
          <div class="grid g2"><div class="opt-group"><small>Pressão</small>${seg('press', Object.entries(PRESS).map(([k, v]) => [k, v.label]))}</div><div class="opt-group"><small>Linha</small>${seg('line', Object.entries(LINES).map(([k, v]) => [k, v.label]))}</div></div>
          <p class="faint small" style="margin:0">A mudança é enviada ao anfitrião e vale a partir do próximo lance.</p>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" data-lclose>Cancelar</button><button class="btn btn-primary" data-lapply>${ic('send')} Enviar</button></div>`, { locked: true });
      document.getElementById('modal').onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.lt) { t[b.dataset.lt] = b.dataset.lt === 'mentality' ? +b.dataset.v : b.dataset.v; return render(); }
        if (b.dataset.lclose !== undefined) return closeModal();
        if (b.dataset.lapply !== undefined) { const { instr, ...tac } = t; room.send('cmd', { k: 'tac', tac }); closeModal(); toast('Tática enviada.', true, 'send'); }
      };
    };
    render();
  }
  function subsPanel() {
    if (!team) return toast('Aguardando dados do time…', false);
    let out = null, inn = null;
    const render = () => {
      modal(`<div class="modal-head"><h2>${ic('repeat')} Substituições <span class="tag">${team.subs}/5</span></h2><button class="btn btn-icon btn-ghost x" data-lclose>${ic('x')}</button></div>
        <div class="grid g2">
          <div><small class="faint">Em campo</small>${team.on.map(p => `<div class="sub-row ${out === p.id ? 'sel' : ''}" data-lout="${p.id}"><span class="posb">${POS_LABEL[p.role]}</span><span class="grow small">${esc(p.name)}${p.injured ? ' <b class="neg">lesionado</b>' : ''}</span><span class="small mono">${p.energy}%</span></div>`).join('')}</div>
          <div><small class="faint">Banco</small>${team.bench.map(p => `<div class="sub-row ${inn === p.id ? 'sel' : ''}" data-lin="${p.id}"><span class="posb">${POS_LABEL[p.pos]}</span><span class="grow small">${esc(p.name)}</span><span class="ovr o3">${p.ovr}</span></div>`).join('')}</div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" data-lclose>Fechar</button><button class="btn btn-primary" data-ldo ${out && inn && team.subs < 5 ? '' : 'disabled'}>${ic('send')} Confirmar troca</button></div>`, { locked: true });
      document.getElementById('modal').onclick = e => {
        const b = e.target.closest('[data-lout],[data-lin],button'); if (!b) return;
        if (b.dataset.lout) { out = b.dataset.lout; return render(); }
        if (b.dataset.lin) { inn = b.dataset.lin; return render(); }
        if (b.dataset.lclose !== undefined) return closeModal();
        if (b.dataset.ldo !== undefined) { room.send('cmd', { k: 'sub', out, in: inn }); toast('Substituição enviada.', true, 'repeat'); closeModal(); }
      };
    };
    render();
  }
  function halftime() {
    modal(`<div class="modal-head"><h2>${ic('coffee')} Intervalo</h2></div>
      <p class="muted">${cur ? `${esc(H.short)} ${cur.sc[0]} x ${cur.sc[1]} ${esc(A.short)}` : ''}. Ajuste seu time; o anfitrião começa o segundo tempo.</p>
      <div class="modal-foot"><button class="btn" data-hl="tac">${ic('clipboard-list')} Táticas</button><button class="btn" data-hl="subs">${ic('repeat')} Substituições</button><button class="btn btn-primary" data-hl="ready">${ic('check')} Estou pronto</button></div>`, { locked: true });
    document.getElementById('modal').onclick = e => {
      const b = e.target.closest('[data-hl]'); if (!b) return;
      if (b.dataset.hl === 'tac') tacticsPanel();
      if (b.dataset.hl === 'subs') subsPanel();
      if (b.dataset.hl === 'ready') { room.send('cmd', { k: 'ready' }); b.disabled = true; b.textContent = 'Aguardando o anfitrião…'; }
    };
  }
  function finish(d) {
    if (ended) return; ended = true;
    const f = { id: 'fr-live', friendly: true, home: 'mp-h', away: 'mp-a', played: true, score: d.score, user: { ...d.user, side: mySide }, attendance: 0 };
    const s = C.S;
    const gf = d.score[mySide], ga = d.score[1 - mySide];
    s.friendlies = [{ at: Date.now(), opp: oppName, oppId: null, score: d.score, side: mySide, live: true, res: gf > ga ? 'V' : gf < ga ? 'D' : 'E' }, ...(s.friendlies || [])].slice(0, 40);
    if (gf > ga) Arcade.report('friendly_win', `${oppName}-${new Date().toISOString().slice(0, 10)}`);
    C.save();
    modal(resultModalHtml(f, s, { clubs }), { wide: true, locked: true });
    document.getElementById('modal').onclick = e => { if (e.target.closest('[data-close]')) { closeModal(); close(); } };
  }
  function close() {
    cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
    root.hidden = true; root.innerHTML = ''; root.onclick = null;
    room.close();
    onClose?.();
  }
  root.onclick = async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'lPlay') { room.send('cmd', { k: running ? 'pause' : 'resume' }); return; }
    if (t.dataset.ltab) { tab = t.dataset.ltab; root.querySelectorAll('[data-ltab]').forEach(b => b.classList.toggle('on', b === t)); return pane(); }
    if (t.dataset.lact === 'tactics') tacticsPanel();
    if (t.dataset.lact === 'subs') subsPanel();
    if (t.dataset.lact === 'leave' && await ask('Sair da sala? A IA assume o seu time.')) close();
  };
  requestAnimationFrame(() => { R.resize(); raf = requestAnimationFrame(frame); });
  pane();
}
