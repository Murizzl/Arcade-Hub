/* =========================================================
   Partida assistida: o motor avança em passos fixos de tempo
   simulado; o campo 2D só desenha o estado (com interpolação).
   Velocidade = quantos segundos simulados por segundo real —
   nunca muda as probabilidades, só a pressa de chegar lá.
   ========================================================= */
import { esc, ic, POS_LABEL, clamp } from './util.js';
import { DT, HALF, STYLES, PRESS, LINES, MENTALITY } from './engine.js';
import { ratingAt } from './players.js';
import { PitchRenderer, kitsFor } from './render.js';
import * as C from './career.js';
import { crest } from './art.js';
import { modal, closeModal, toast } from './main.js';
import { compName } from './cups.js';

// duração de cada tempo em 1x, em minutos reais (preferência de cada usuário; padrão 2 min)
export const HALF_OPTIONS = [1, 2, 3, 5, 8];
export function prefs() { try { return { halfMinutes: 2, ...JSON.parse(localStorage.getItem('clublegacy.prefs') || '{}') }; } catch (e) { return { halfMinutes: 2 }; } }
export function setPrefs(p) { try { localStorage.setItem('clublegacy.prefs', JSON.stringify({ ...prefs(), ...p })); } catch (e) { /* */ } }
// segundos simulados por segundo real: em 1x, um tempo dura `halfMinutes` minutos reais
const SPEED_KEYS = [1, 2, 4, 8];
const speedRate = k => HALF / (prefs().halfMinutes * 60) * k;
const root = document.getElementById('match');
const icons = () => window.lucide?.createIcons();

export function openMatch(f, { onCommit, onClose, friendly = null }) {
  const S = C.S;
  // amistoso multiplayer: partida e clubes vêm prontos e nada é gravado na carreira
  const m = friendly ? friendly.match : C.createMatch(f, { record: true, assistant: false });
  const me = friendly ? null : C.myClub();
  const side = friendly ? friendly.userSide : f.home === me.id ? 0 : 1;
  const clubOf = id => friendly?.clubs[id] || S.clubs[id];
  const H = clubOf(f.home), A = clubOf(f.away);
  const kits = kitsFor(H, A);
  const posBefore = friendly ? null : C.position(me.id);
  let speed = 1, running = true, acc = 0, last = performance.now(), raf = 0, tab = 'log';
  let banner = null, labels = [], sel = null, committed = false, ffwd = false, lastLogLen = -1;
  let prevBall = { x: m.ball.x, y: m.ball.y, z: 0 };
  let trail = [];
  // plano de jogo do adversário anunciado antes do apito
  const oppT = m.teams[1 - side];
  if (oppT.plan) m.say(`${oppT.club.short} entra em campo: ${oppT.plan.toLowerCase()} (${oppT.tactics.formation}).`, 1 - side, 'tactic');

  root.hidden = false;
  root.innerHTML = `
    <div class="scorebar">
      <div class="tm">${crest(H, 42)}<b>${esc(H.short)}</b></div>
      <div class="sc"><div class="score" id="mScore">0 - 0</div><div class="clock" id="mClock">00:00</div></div>
      <div class="tm away">${crest(A, 42)}<b>${esc(A.short)}</b></div>
    </div>
    <div class="match-body">
      <div class="field-wrap" id="fieldWrap"><canvas id="pitch"></canvas><div id="mBanner"></div></div>
      <aside class="side-panel"><div class="tabs"><button data-mtab="log" class="on">Lances</button><button data-mtab="stats">Estatísticas</button><button data-mtab="stars">Destaques</button><button data-mtab="team">Time</button></div><div class="pane" id="mPane"></div></aside>
    </div>
    <div class="controls">
      <button class="btn btn-primary btn-icon" id="mPlay" title="Pausar / continuar">${ic('pause')}</button>
      <div class="seg" id="mSpeed">${SPEED_KEYS.map(k => `<button data-speed="${k}" class="${+k === speed ? 'on' : ''}">${k}x</button>`).join('')}</div>
      <button class="btn" data-mact="tactics">${ic('clipboard-list')}<span class="lbl-sm">Táticas</span></button>
      <button class="btn" data-mact="subs">${ic('repeat')}<span class="lbl-sm">Substituições</span> <span class="tag" id="mSubs">0/5</span></button>
      <button class="btn" data-mact="stats">${ic('bar-chart-3')}<span class="lbl-sm">Estatísticas</span></button>
      <button class="btn" data-mact="replays">${ic('rotate-ccw')}<span class="lbl-sm">Replays</span></button>
      <button class="btn right" data-mact="finish">${ic('fast-forward')}<span class="lbl-sm">Simular restante</span></button>
    </div>`;
  icons();
  const canvas = root.querySelector('#pitch');
  const R = new PitchRenderer(canvas);
  const onResize = () => R.resize();
  window.addEventListener('resize', onResize);

  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) * R.dpr - R.ox) / R.s, y = ((e.clientY - r.top) * R.dpr - R.oy) / R.s;
    let best = null, bd = 4;
    for (const T of m.teams) for (const p of T.on) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
    sel = best ? best.p.id : null;
  });

  /* ---------- eventos do motor ---------- */
  // modo ao vivo (anfitrião): comandos do convidado e presença
  const live = friendly?.live, gSide = live?.guestSide ?? 1;
  let guestReady = false, teamT = 0;
  const sendTeam = () => live?.room.send('team', live.room.teamOf(m, gSide));
  if (live) {
    live.room.on('cmd', d => {
      if (d.k === 'sub') { const r = m.substitute(gSide, d.out, d.in); if (r.ok) toast('Adversário fez uma substituição.', true, 'repeat'); else live.room.send('toast', r.msg); sendTeam(); live.room.pushState(m, true); }
      if (d.k === 'tac') { m.applyTactics(gSide, d.tac); toast('Adversário mudou a tática.', true, 'clipboard-list'); sendTeam(); }
      if (d.k === 'pause') { pause(); toast('Adversário pausou a partida.', true, 'pause'); }
      if (d.k === 'resume') { resume(); }
      if (d.k === 'ready') { guestReady = true; const el = document.getElementById('guestReady'); if (el) el.innerHTML = '<span class="pos">Adversário pronto ✓</span>'; }
      if (d.k === 'hello') { sendTeam(); live.room.pushState(m, true); live.room.send('pz', { running }); }
    });
    live.room.on('peer-leave', () => { m.teams[gSide].ai = true; toast('O adversário saiu. A IA assume o time dele.', false, 'wifi-off'); });
    live.room.on('peer-join', () => { m.teams[gSide].ai = false; toast('Adversário de volta à sala.', true, 'wifi'); sendTeam(); });
  }

  m.onEvent = ev => {
    if (live && !['stoppage'].includes(ev.type)) live.room.send('ev', { type: ev.type, side: ev.side, name: ev.name, min: ev.min, assistName: ev.assistName, card: ev.card, second: ev.second, kind: ev.kind, big: ev.big, outcome: ev.outcome, player: ev.player });
    if (ffwd && ev.type !== 'fulltime') return;
    if (ev.type === 'goal') {
      showBanner(`<div class="big">GOL!</div><div class="who"><b>${esc(ev.name)} · ${ev.min}</b><small>${ev.assistName ? `Assistência: ${esc(ev.assistName)}` : (ev.kind === 'penalty' ? 'De pênalti' : 'Jogada individual')}</small></div>`, 4200, 'goal');
      flashScore();
      if (ev.side === side) confetti(kits[side].fill);
      labels.push({ id: ev.player, until: m.total + 10 });
    } else if (ev.type === 'card') {
      showBanner(`<div class="big">${ev.card === 'red' ? 'VERMELHO' : 'AMARELO'}</div><div class="who"><b>${esc(ev.name)} · ${ev.min}</b><small>${esc(m.teams[ev.side].club.short)}${ev.second ? ' · segundo amarelo' : ''}</small></div>`, 2600, `card ${ev.card === 'red' ? 'red' : ''}`);
      labels.push({ id: ev.player, until: m.total + 6 });
    } else if (ev.type === 'injury') {
      labels.push({ id: ev.player, until: m.total + 8 });
      if (ev.side === side) { pause(); toast(`${ev.name} se machucou. Faça uma substituição.`, false, 'cross'); setTimeout(subsPanel, 50); }
    } else if (ev.type === 'shot') {
      labels.push({ id: ev.player, until: m.total + 3 });
      if (ev.big && ev.outcome !== 'goal') { /* grande chance: destaque leve no lance */ }
    } else if (ev.type === 'penalty') {
      showBanner(`<div class="big" style="font-size:44px">PÊNALTI!</div><div class="who"><b>${esc(m.teams[ev.side].club.short)}</b><small>Falta em ${esc(ev.name)} dentro da área</small></div>`, 2600, 'card');
    } else if (ev.type === 'freekick') {
      showBanner(`<div class="big" style="font-size:30px">FALTA PERIGOSA</div>`, 1600, 'card');
    } else if (ev.type === 'offside') {
      labels.push({ id: ev.player, until: m.total + 3 });
    } else if (ev.type === 'halftime') { pause(); setTimeout(halftime, 60); }
    else if (ev.type === 'fulltime') { pause(); finish(); }
  };

  function showBanner(html, ms, cls) {
    const el = root.querySelector('#mBanner');
    el.innerHTML = `<div class="banner ${cls}">${html}</div>`;
    clearTimeout(banner); banner = setTimeout(() => { el.innerHTML = ''; }, ms / Math.sqrt(speed));
  }
  function flashScore() { const s = root.querySelector('#mScore'); s.classList.add('flash'); setTimeout(() => s.classList.remove('flash'), 1800); }
  function confetti(color) {
    const w = root.querySelector('#fieldWrap'); const c = document.createElement('div'); c.className = 'confetti';
    for (let i = 0; i < 40; i++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = i % 3 ? color : '#a3e635'; p.style.animationDelay = Math.random() * 0.6 + 's'; c.append(p); }
    w.append(c); setTimeout(() => c.remove(), 2600);
  }

  /* ---------- laço de renderização ---------- */
  function frame(now) {
    const realDt = Math.min(0.25, (now - last) / 1000); last = now;
    if (running && m.phase === 'live') {
      acc += realDt * speedRate(speed);
      let steps = 0;
      while (acc >= DT && steps++ < 300 && running && m.phase === 'live') {
        prevBall = { x: m.ball.x, y: m.ball.y, z: m.ball.z };
        m.tick(); acc -= DT;
        // saltos (bola recolocada no centro, reinícios) não são interpolados
        if (Math.hypot(m.ball.x - prevBall.x, m.ball.y - prevBall.y) > 12) { prevBall = { x: m.ball.x, y: m.ball.y, z: m.ball.z }; trail = []; }
      }
    }
    if (live) { live.room.pushState(m); if (now - teamT > 1000) { teamT = now; sendTeam(); } }
    const a = running ? clamp(acc / DT, 0, 1) : 1;
    draw(a);
    hud();
    raf = requestAnimationFrame(frame);
  }
  function draw(a) {
    const players = [];
    const lb = new Set(labels.filter(l => l.until > m.total).map(l => l.id));
    labels = labels.filter(l => l.until > m.total);
    const owner = m.ball.owner;
    for (const T of m.teams) for (const p of T.on) players.push({
      x: p.px + (p.x - p.px) * a, y: p.py + (p.y - p.py) * a, side: T.side, num: p.p.num, gk: p.role === 'GK', dive: p.dive ? p.dive * (T.side === 0 ? 1 : 1) : 0,
      ball: p === owner, sel: p.p.id === sel, label: (lb.has(p.p.id) || p.p.id === sel || (p === owner && m.ball.owner?.r && false)) ? p.p.name.split(' ').slice(-1)[0] : null
    });
    const b = m.ball;
    const ball = { x: prevBall.x + (b.x - prevBall.x) * a, y: prevBall.y + (b.y - prevBall.y) * a, z: prevBall.z + (b.z - prevBall.z) * a };
    const fl = b.flight;
    if (fl && fl.kind === 'shot') { trail.push({ x: ball.x, y: ball.y }); if (trail.length > 10) trail.shift(); } else if (trail.length) trail.shift();
    R.draw({ players, ball, kits, trail, pass: fl && fl.kind !== 'shot' ? { sx: fl.sx, sy: fl.sy, ex: fl.ex, ey: fl.ey } : null });
  }
  let hudT = 0;
  function hud() {
    const now = performance.now(); if (now - hudT < 150) return; hudT = now;
    root.querySelector('#mScore').textContent = `${m.score[0]} - ${m.score[1]}`;
    const ck = m.clock();
    const extra = m.stoppage[m.half - 1];
    root.querySelector('#mClock').innerHTML = `${m.phase === 'HT' ? 'Intervalo' : m.phase === 'FT' ? 'Encerrado' : ck.text}${extra && m.phase === 'live' ? `<span class="extra">+${extra}</span>` : ''}`;
    root.querySelector('#mSubs').textContent = `${m.teams[side].subs}/5`;
    if (tab === 'log' && m.log.length !== lastLogLen) { lastLogLen = m.log.length; pane(); }
    else if (tab !== 'log') pane();
  }
  function pane() {
    const el = root.querySelector('#mPane');
    if (tab === 'log') el.innerHTML = m.log.slice().reverse().slice(0, 120).map(l => `<div class="log-item ${l.kind}"><span class="m">${l.min}</span><span>${esc(l.text)}</span></div>`).join('') || '<p class="faint small">A bola vai rolar…</p>';
    else if (tab === 'stats') el.innerHTML = statsHtml(m.stats, m);
    else if (tab === 'stars') el.innerHTML = starsHtml();
    else el.innerHTML = teamHtml();
  }
  // destaques individuais ao vivo: notas parciais calculadas pelo motor
  function starsHtml() {
    const live = m.liveRatings();
    const rc = v => v >= 8 ? 'r4' : v >= 7 ? 'r3' : v >= 6 ? 'r2' : 'r1';
    const row = x => { const r = x.m.r; const bits = [r.goals && `${r.goals} gol${r.goals > 1 ? 's' : ''}`, r.assists && `${r.assists} assist.`, r.key && `${r.key} passe${r.key > 1 ? 's' : ''}-chave`, r.saves && `${r.saves} defesa${r.saves > 1 ? 's' : ''}`, r.tackles && `${r.tackles} desarme${r.tackles > 1 ? 's' : ''}`, r.shots && `${r.shots} chute${r.shots > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      return `<div class="sub-row"><span class="posb">${POS_LABEL[x.m.role]}</span><span class="grow small"><b>${esc(x.m.p.name)}</b><br><span class="faint">${esc(m.teams[x.side].club.short)}${bits ? ' · ' + bits : ''}</span></span><span class="rating ${rc(x.rating)}">${x.rating.toFixed(1)}</span></div>`; };
    const mine = live.filter(x => x.side === side);
    return `<small class="faint">Melhores em campo</small>${live.slice(0, 5).map(row).join('')}
      <small class="faint" style="display:block;margin-top:10px">Seu time</small>${mine.map(row).join('')}`;
  }
  function teamHtml() {
    const T = m.teams[side];
    return `<p class="faint small" style="margin-top:0">${esc(T.club.short)} · ${T.tactics.formation} · ${MENTALITY[T.tactics.mentality]} · pressão ${PRESS[T.tactics.press].label.toLowerCase()}</p>` +
      T.on.map(p => `<div class="sub-row"><span class="posb">${POS_LABEL[p.role]}</span><span class="grow small">${p.p.num}. ${esc(p.p.name)}${p.yellow ? ' 🟨' : ''}${p.injured ? ' ✚' : ''}</span>${energyBar(p.energy)}</div>`).join('');
  }

  /* ---------- controles ---------- */
  function pause() { running = false; setPlayIcon(); live?.room.send('pz', { running: false }); }
  function resume() { if (m.phase !== 'live') return; running = true; last = performance.now(); setPlayIcon(); live?.room.send('pz', { running: true }); }
  function setPlayIcon() { const b = root.querySelector('#mPlay'); b.innerHTML = ic(running ? 'pause' : 'play'); icons(); }
  root.onclick = e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'mPlay') return running ? pause() : resume();
    if (t.dataset.speed) { speed = +t.dataset.speed; root.querySelectorAll('#mSpeed button').forEach(b => b.classList.toggle('on', b === t)); return; }
    if (t.dataset.mtab) { tab = t.dataset.mtab; root.querySelectorAll('[data-mtab]').forEach(b => b.classList.toggle('on', b === t)); lastLogLen = -1; return pane(); }
    const a = t.dataset.mact;
    if (a === 'tactics') { pause(); tacticsPanel(); }
    if (a === 'subs') { pause(); subsPanel(); }
    if (a === 'stats') { tab = 'stats'; root.querySelectorAll('[data-mtab]').forEach(b => b.classList.toggle('on', b.dataset.mtab === 'stats')); pane(); }
    if (a === 'replays') { pause(); replaysPanel(); }
    if (a === 'finish') {
      if (m.phase === 'FT') return;
      if (!confirm('Simular o restante da partida? O auxiliar técnico fará as trocas necessárias.')) return;
      ffwd = true; m.assistant = true; m.runToEnd();
    }
    if (a === 'close') close();
  };

  function tacticsPanel(after) {
    const T = m.teams[side]; const t = { ...T.tactics };
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(t[key]) === String(v) ? 'on' : ''}" data-mt="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const render = () => {
      modal(`<div class="modal-head"><h2>${ic('clipboard-list')} Táticas · ${m.minuteLabel()}</h2><button class="btn btn-icon btn-ghost x" data-mclose>${ic('x')}</button></div>
        <div class="grid" style="gap:12px">
          <div class="opt-group"><small>Formação</small>${seg('formation', Object.keys(C.DB.formations).map(f => [f, f]))}</div>
          <div class="opt-group"><small>Mentalidade</small>${seg('mentality', [[-2, 'Muito def.'], [-1, 'Defensiva'], [0, 'Equilibrada'], [1, 'Ofensiva'], [2, 'Muito of.']])}</div>
          <div class="opt-group"><small>Estilo</small>${seg('style', Object.entries(STYLES).map(([k, v]) => [k, v.label]))}</div>
          <div class="grid g2"><div class="opt-group"><small>Pressão</small>${seg('press', Object.entries(PRESS).map(([k, v]) => [k, v.label]))}</div><div class="opt-group"><small>Linha defensiva</small>${seg('line', Object.entries(LINES).map(([k, v]) => [k, v.label]))}</div></div>
          <p class="faint small" style="margin:0">As mudanças valem para os próximos lances; nada do que já aconteceu é alterado.</p>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" data-mclose>Cancelar</button><button class="btn btn-primary" data-mapply>${ic('check')} Aplicar e continuar</button></div>`, { locked: true });
      const el = document.getElementById('modal');
      el.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.mt) { t[b.dataset.mt] = b.dataset.mt === 'mentality' ? +b.dataset.v : b.dataset.v; return render(); }
        if (b.dataset.mclose !== undefined) { closeModal(); return after ? after() : resume(); }
        if (b.dataset.mapply !== undefined) { m.applyTactics(side, t); closeModal(); return after ? after() : resume(); }
      };
    };
    render();
  }

  function subsPanel(after) {
    const T = m.teams[side];
    let out = null, inn = null;
    const render = () => {
      const role = out ? (T.on.find(p => p.p.id === out)?.role) : null;
      modal(`<div class="modal-head"><h2>${ic('repeat')} Substituições <span class="tag">${T.subs}/5</span></h2><button class="btn btn-icon btn-ghost x" data-mclose>${ic('x')}</button></div>
        <div class="grid g2">
          <div><small class="faint">Em campo — condição física</small>${T.on.map(p => `<div class="sub-row ${out === p.p.id ? 'sel' : ''}" data-out="${p.p.id}"><span class="posb">${POS_LABEL[p.role]}</span><span class="grow small">${esc(p.p.name)}${p.yellow ? ' 🟨' : ''}${p.injured ? ' <b class="neg">lesionado</b>' : ''}</span>${energyBar(p.energy)}<span class="small mono">${Math.round(p.energy)}%</span></div>`).join('')}</div>
          <div><small class="faint">Banco</small>${T.bench.map(p => `<div class="sub-row ${inn === p.id ? 'sel' : ''} ${p.injury ? 'off' : ''}" data-in="${p.id}"><span class="posb">${POS_LABEL[p.pos]}</span><span class="grow small">${esc(p.name)}</span><span class="ovr ${p.ovr >= 72 ? 'o4' : 'o3'}">${role ? ratingAt(p, role) : p.ovr}</span></div>`).join('') || '<p class="faint small">Sem reservas disponíveis.</p>'}</div>
        </div>
        ${T.off.length ? `<p class="faint small">Expulsos: ${T.off.map(x => esc(x.p.name)).join(', ')}</p>` : ''}
        <div class="modal-foot"><button class="btn btn-ghost" data-mclose>Fechar</button><button class="btn btn-primary" data-mdo ${out && inn && T.subs < 5 ? '' : 'disabled'}>${ic('repeat')} Confirmar troca</button></div>`, { locked: true });
      const el = document.getElementById('modal');
      el.onclick = e => {
        const b = e.target.closest('[data-out],[data-in],button'); if (!b) return;
        if (b.dataset.out) { out = b.dataset.out; return render(); }
        if (b.dataset.in) { if (!b.classList.contains('off')) inn = b.dataset.in; return render(); }
        if (b.dataset.mclose !== undefined) { closeModal(); return after ? after() : resume(); }
        if (b.dataset.mdo !== undefined) { const r = m.substitute(side, out, inn); if (!r.ok) toast(r.msg, false); out = inn = null; return render(); }
      };
    };
    render();
  }

  function replaysPanel(after) {
    const list = m.replays;
    modal(`<div class="modal-head"><h2>${ic('rotate-ccw')} Replays</h2><button class="btn btn-icon btn-ghost x" data-mclose>${ic('x')}</button></div>
      ${list.length ? `<canvas class="replay-canvas" id="rpC"></canvas>
        <div class="row-wrap" style="margin-top:8px"><button class="btn btn-sm" data-rpctl="pause">${ic('pause')} Pausar</button><div class="seg"><button data-rpspd="0.5">0,5x</button><button data-rpspd="1" class="on">1x</button><button data-rpspd="2">2x</button></div><div class="seg"><button data-rpcam="1" class="on">${ic('zoom-in')} Câmera</button><button data-rpcam="0">Campo todo</button></div></div>
        <div class="row-wrap" style="margin-top:10px">${list.map((r, i) => `<button class="btn btn-sm" data-rp="${i}">${{ goal: '⚽', save: '🧤', red: '🟥', miss: '❌' }[r.kind] || '•'} ${esc(r.ev.min)} ${esc(r.ev.name || r.ev.shooter || '')}</button>`).join('')}</div>
        <p class="faint small">Reprodução das posições gravadas pelo motor durante o lance — nada é inventado.</p>` : '<p class="muted">Nenhum lance importante gravado ainda (gols, grandes defesas, pênaltis e expulsões aparecem aqui).</p>'}
      <div class="modal-foot"><button class="btn" data-mclose>Fechar</button></div>`, { wide: true, locked: true });
    const el = document.getElementById('modal');
    let rr = null, rpRaf = 0, rpSpeed = 1, rpCam = true, rpPaused = false, cur = -1, k = 0, lastT = 0, cam = null;
    // protagonista do lance (número + lado) para exibir o nome
    const who = rp => { const id = rp.ev.player; for (const T of m.teams) for (const x of T.used) if (x.p.id === id) return { side: T.side, num: x.p.num, name: x.p.name.split(' ').slice(-1)[0] }; return null; };
    const play = i => {
      cancelAnimationFrame(rpRaf);
      const rp = list[i], c = el.querySelector('#rpC');
      rr = rr || new PitchRenderer(c); rr.resize();
      cur = i; k = 0; lastT = performance.now(); cam = null;
      const star = who(rp);
      const loop = now => {
        const dt = (now - lastT) / 1000; lastT = now;
        if (!rpPaused) k += dt * 3.2 * rpSpeed; // cada quadro = 0,5 s simulados
        const i0 = Math.min(rp.frames.length - 1, Math.floor(k)), i1 = Math.min(rp.frames.length - 1, i0 + 1), a = Math.min(1, k - i0);
        const f0 = rp.frames[i0], f1 = rp.frames[i1];
        const players = f0.p.map((p, j) => { const q = f1.p[j] && f1.p[j][3] === p[3] && f1.p[j][2] === p[2] ? f1.p[j] : p; return { x: p[0] + (q[0] - p[0]) * a, y: p[1] + (q[1] - p[1]) * a, side: p[2], num: p[3], gk: false, label: star && p[2] === star.side && p[3] === star.num ? star.name : null }; });
        const ball = { x: f0.b[0] + (f1.b[0] - f0.b[0]) * a, y: f0.b[1] + (f1.b[1] - f0.b[1]) * a, z: f0.b[2] + (f1.b[2] - f0.b[2]) * a };
        // câmera suave que acompanha a bola
        cam = cam ? { x: cam.x + (ball.x - cam.x) * 0.08, y: cam.y + (ball.y - cam.y) * 0.08 } : { x: ball.x, y: ball.y };
        rr.draw({ players, kits, ball, cam: rpCam ? { x: Math.max(26, Math.min(79, cam.x)), y: Math.max(17, Math.min(51, cam.y)), zoom: 1.9 } : null });
        if (k >= rp.frames.length + 3) { k = 0; cam = null; } // repete o lance
        rpRaf = requestAnimationFrame(loop);
      };
      rpRaf = requestAnimationFrame(loop);
    };
    if (list.length) setTimeout(() => play(list.length - 1), 30);
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rp) return play(+b.dataset.rp);
      if (b.dataset.rpspd) { rpSpeed = +b.dataset.rpspd; el.querySelectorAll('[data-rpspd]').forEach(x => x.classList.toggle('on', x === b)); return; }
      if (b.dataset.rpcam) { rpCam = b.dataset.rpcam === '1'; el.querySelectorAll('[data-rpcam]').forEach(x => x.classList.toggle('on', x === b)); return; }
      if (b.dataset.rpctl) { rpPaused = !rpPaused; b.innerHTML = `${ic(rpPaused ? 'play' : 'pause')} ${rpPaused ? 'Continuar' : 'Pausar'}`; icons(); return; }
      if (b.dataset.mclose !== undefined) { cancelAnimationFrame(rpRaf); closeModal(); return after ? after() : (m.phase === 'live' ? resume() : null); }
    };
  }

  function halftime() {
    if (ffwd) return;
    const T = m.teams[side];
    modal(`<div class="modal-head"><h2>${ic('coffee')} Intervalo · ${esc(H.short)} ${m.score[0]} x ${m.score[1]} ${esc(A.short)}</h2></div>
      ${statsHtml(m.halfStats, m)}
      ${live ? `<p class="small" id="guestReady">${guestReady ? '<span class="pos">Adversário pronto ✓</span>' : '<span class="faint">Aguardando o adversário ajustar o time…</span>'}</p>` : ''}
      <p class="faint small">Ajuste a equipe antes do segundo tempo. ${T.subs}/5 substituições usadas.</p>
      <div class="modal-foot"><button class="btn" data-ht="tactics">${ic('clipboard-list')} Táticas</button><button class="btn" data-ht="subs">${ic('repeat')} Substituições</button><button class="btn btn-primary" data-ht="go">${ic('play')} Começar 2º tempo</button></div>`, { locked: true });
    document.getElementById('modal').onclick = e => {
      const b = e.target.closest('[data-ht]'); if (!b) return;
      if (b.dataset.ht === 'tactics') tacticsPanel(halftime);
      if (b.dataset.ht === 'subs') subsPanel(halftime);
      if (b.dataset.ht === 'go') { closeModal(); m.startSecondHalf(); guestReady = false; resume(); live?.room.pushState(m, true); }
    };
  }

  // fim: grava o resultado uma única vez, simula a rodada e mostra a súmula
  async function finish() {
    if (committed) return; committed = true;
    hud(); draw(1);
    if (friendly) { friendly.onFinish(m); live?.room.send('end', { score: f.score, user: f.user }); }
    else { C.commitResult(f, m, true); C.save(); }
    await onCommit?.();
    const posAfter = friendly ? null : C.position(me.id);
    const extra = { posBefore, posAfter, replays: m.replays.length, clubs: friendly?.clubs };
    modal(resultModalHtml(f, S, extra), { wide: true, locked: true });
    const el = document.getElementById('modal');
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rpopen !== undefined) return replaysPanel(() => modal(resultModalHtml(f, S, extra), { wide: true, locked: true }));
      if (b.dataset.close !== undefined || b.dataset.mclose !== undefined) { closeModal(); close(); }
    };
  }

  function close() {
    if (live) { live.room.send('bye', {}); live.room.close(); }
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    root.hidden = true; root.innerHTML = ''; root.onclick = null;
    if (!committed) { /* partida não terminada não é gravada: volta ao estado seguro anterior */ }
    onClose?.();
  }

  requestAnimationFrame(t => { last = t; R.resize(); raf = requestAnimationFrame(frame); });
  pane();
}

/* ---------- componentes compartilhados ---------- */
function energyBar(v) { return `<span class="energy ${v < 50 ? 'vlow' : v < 70 ? 'low' : ''}"><i style="width:${v}%"></i></span>`; }

function statsHtml(st, m) {
  const tot = (st[0].poss + st[1].poss) || 1;
  const rows = [
    ['Posse de bola', Math.round(st[0].poss / tot * 100) + '%', Math.round(st[1].poss / tot * 100) + '%', st[0].poss, st[1].poss],
    ['Finalizações', st[0].shots, st[1].shots], ['No gol', st[0].onTarget, st[1].onTarget], ['xG', st[0].xg.toFixed(2), st[1].xg.toFixed(2), st[0].xg, st[1].xg],
    ['Passes certos', `${st[0].passesOk}/${st[0].passes}`, `${st[1].passesOk}/${st[1].passes}`, st[0].passesOk, st[1].passesOk],
    ['Desarmes', st[0].tackles, st[1].tackles], ['Interceptações', st[0].interceptions, st[1].interceptions],
    ['Escanteios', st[0].corners, st[1].corners], ['Impedimentos', st[0].offsides, st[1].offsides], ['Faltas', st[0].fouls, st[1].fouls], ['Amarelos', st[0].yellows, st[1].yellows], ['Vermelhos', st[0].reds, st[1].reds], ['Defesas', st[0].saves, st[1].saves]
  ];
  return rows.map(([l, a, b, x = +a, y = +b]) => { const t = (x + y) || 1; return `<div class="sbar"><span class="v">${a}</span><span class="lbl">${l}</span><span class="v">${b}</span><div class="dual"><i style="width:${x / t * 100}%"></i><i style="width:${y / t * 100}%"></i></div></div>`; }).join('');
}

export function resultModalHtml(f, S, extra = {}) {
  const H = extra.clubs?.[f.home] || S.clubs[f.home], A = extra.clubs?.[f.away] || S.clubs[f.away], u = f.user;
  if (!u) return `<p>${esc(H.short)} ${f.score[0]} x ${f.score[1]} ${esc(A.short)}</p>`;
  const evs = u.events;
  const goals = evs.filter(e => e.type === 'goal');
  const cards = evs.filter(e => e.type === 'card');
  const st = u.stats;
  const rc = v => v >= 8 ? 'r4' : v >= 7 ? 'r3' : v >= 6 ? 'r2' : 'r1';
  const ratings = side => u.ratings.filter(r => r.side === side).sort((a, b) => b.rating - a.rating);
  const tactics = (u.tactics || []).filter(t => t.side === u.side);
  const res = f.score[u.side] > f.score[1 - u.side] ? 'Vitória' : f.score[u.side] < f.score[1 - u.side] ? 'Derrota' : 'Empate';
  const sts = st.map(s => ({ ...s, poss: s.possPct, xg: +s.xg }));
  return `<div class="modal-head"><h2>${ic('flag')} Fim de jogo · ${res}</h2>${extra.posBefore ? '' : `<button class="btn btn-icon btn-ghost x" data-close>${ic('x')}</button>`}</div>
    <div class="versus" style="padding-top:0">
      <div class="team">${crest(H, 56)}<b>${esc(H.short)}</b></div>
      <div class="vs"><b style="font-size:40px">${f.score[0]} – ${f.score[1]}</b>${f.pens ? `<span class="tag tag-yellow">Pênaltis ${f.pens[0]}–${f.pens[1]}</span><br>` : ''}${esc(compName(f))} · ${(f.attendance || 0).toLocaleString('pt-BR')} torcedores</div>
      <div class="team">${crest(A, 56)}<b>${esc(A.short)}</b></div>
    </div>
    <div class="grid g2" style="gap:14px">
      <div>
        <h3 style="margin-bottom:6px">${ic('goal')} Gols e assistências</h3>
        ${goals.map(g => `<div class="li"><span class="faint mono" style="width:44px">${g.min}</span><span class="grow">${esc(g.name)}${g.assistName ? ` <span class="faint small">(assist. ${esc(g.assistName)})</span>` : ''}</span>${crest(g.side ? A : H, 18)}</div>`).join('') || '<p class="faint small">Sem gols.</p>'}
        ${cards.length ? `<h3 style="margin:10px 0 6px">Cartões</h3>${cards.map(c => `<div class="li"><span class="faint mono" style="width:44px">${c.min}</span><span>${c.card === 'red' ? '🟥' : '🟨'}</span><span class="grow">${esc(c.name)}</span>${crest(c.side ? A : H, 18)}</div>`).join('')}` : ''}
        <h3 style="margin:10px 0 6px">${ic('star')} Melhor em campo</h3><div class="li"><b class="grow">${esc(u.motm?.name || '—')}</b><span class="rating ${rc(u.motm?.rating || 6)}">${u.motm?.rating?.toFixed(1) || '–'}</span></div>
        ${extra.posBefore ? `<h3 style="margin:10px 0 6px">${ic('list-ordered')} Classificação</h3><p class="small">${extra.posBefore}º → <b>${extra.posAfter}º</b> ${extra.posAfter < extra.posBefore ? '<span class="pos">▲</span>' : extra.posAfter > extra.posBefore ? '<span class="neg">▼</span>' : ''}</p>` : ''}
        <h3 style="margin:10px 0 6px">${ic('clipboard-list')} Decisões táticas</h3>${tactics.length ? tactics.map(t => `<div class="li small"><span class="faint mono" style="width:44px">${esc(t.min)}</span><span class="grow">${esc(t.text)}</span></div>`).join('') : '<p class="faint small">Nenhuma mudança durante o jogo.</p>'}
      </div>
      <div>${statsHtml(sts)}</div>
    </div>
    <div class="grid g2" style="gap:14px;margin-top:12px">
      ${[0, 1].map(sd => `<div><h3 style="margin-bottom:6px">${crest(sd ? A : H, 18)} Notas · ${esc((sd ? A : H).short)}</h3>${ratings(sd).map(r => `<div class="li small"><span class="posb">${POS_LABEL[r.role] || ''}</span><span class="grow">${esc(r.name)} ${r.goals ? '⚽'.repeat(r.goals) : ''}${r.assists ? ' 🅰' : ''}${r.yellow ? ' 🟨' : ''}${r.red ? ' 🟥' : ''}${r.injured ? ' ✚' : ''}</span><span class="faint">${r.mins}'</span><span class="rating ${rc(r.rating)}">${r.rating.toFixed(1)}</span></div>`).join('')}</div>`).join('')}
    </div>
    <div class="modal-foot">${extra.replays ? `<button class="btn" data-rpopen>${ic('rotate-ccw')} Ver replays (${extra.replays})</button>` : ''}<button class="btn btn-primary" data-close>${ic('check')} Continuar</button></div>`;
}
