/* =========================================================
   Jogos por fases e arcade: Porcas e Parafusos, Saia da Vaga,
   Torre Espiral e Sudoku. Seguem o mesmo contrato de AH.engines.
   ========================================================= */
(function () {
  const { ic, esc } = AH.ui;
  const K = AH.sortKit;

  /* ---------- utilidades compartilhadas ---------- */
  const tierIndex = (tiers, lvl) => tiers.reduce((t, x, i) => lvl >= x.from ? i : t, 0);
  const unlockedOf = id => AH.store.user?.stats[id]?.unlocked || 1;

  // Cabeçalho + rodapé no estilo escuro das fases (mesmo visual do Separar Poções)
  function levelShell({ duel, board, footLeft, footRight, center }) {
    return `<div class="pz">
      <div class="pz-head">
        ${duel ? '<span></span>' : `<button class="pz-round" data-levels aria-label="Escolher fase">${ic('layout-grid')}</button>`}
        <div class="pz-title"><span class="pz-tier" data-tier></span><b data-level></b></div>
        <button class="pz-round" data-restart aria-label="Reiniciar">${ic('rotate-ccw')}</button>
      </div>
      ${board}
      <p class="pz-msg" data-msg aria-live="polite"></p>
      <div class="pz-foot">${footLeft}${center || '<span class="pz-moves"><small>Jogadas</small><b data-moves>0</b></span>'}${footRight}</div>
    </div>`;
  }
  function setTitle(el, tier, label) {
    const t = el.querySelector('[data-tier]');
    t.textContent = tier.name.toUpperCase(); t.style.background = tier.color;
    el.querySelector('[data-level]').textContent = label;
  }
  /* ---------- progresso por dificuldade ---------- */
  // Cada dificuldade tem a sua própria contagem de fases. As fases 1–20 são fixas (sempre o mesmo tabuleiro);
  // depois delas cada fase é gerada na hora, sem fim. Número interno = dificuldade * 1000 + semente.
  const localOf = new Map();
  const virt = (t, n) => { const v = t * 1000 + (n <= 20 ? n : 21 + Math.floor(Math.random() * 970)); localOf.set(v, n); return v; };
  const numOf = v => localOf.get(v) ?? (v % 1000);
  const statOf = id => AH.store.user.stats[id];
  const ensureStat = id => { const u = AH.store.user; return u.stats[id] || (u.stats[id] = { played: 0, wins: 0, best: null, last: 0 }); };
  const curTier = id => statOf(id)?.tierSel || 0;
  const progOf = (id, t) => statOf(id)?.prog?.[t] || 1;
  const startLevel = id => virt(curTier(id), progOf(id, curTier(id)));
  function advance(id, t, v) {
    const s = ensureStat(id);
    s.prog = s.prog || {}; s.prog[t] = Math.max(s.prog[t] || 1, numOf(v) + 1);
    return Object.values(s.prog).reduce((a, x) => a + x - 1, 0); // total de fases vencidas = recorde
  }
  function tierModal(id, tiers, sub, onPick, first) {
    const cur = curTier(id);
    AH.ui.modal({
      title: 'Escolha a dificuldade', dismissable: !first,
      body: `<div class="stack">${tiers.map((t, i) => `<button class="pz-tierpick ${i === cur ? 'cur' : ''}" data-pick="${i}"><span class="pz-tier" style="background:${t.color}">${t.name.toUpperCase()}</span><small class="faint">${sub(t)}</small><b>Fase ${progOf(id, i)}</b></button>`).join('')}
        <p class="faint">As 20 primeiras fases de cada dificuldade são fixas; depois disso elas são geradas na hora, sem fim.</p>
        ${first ? `<a class="btn btn-ghost" href="#/game/${id}">${ic('arrow-left')} Voltar</a>` : ''}</div>`,
      onMount: m => m.addEventListener('click', e => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        ensureStat(id).tierSel = +b.dataset.pick; AH.store.save(); AH.ui.close(); onPick();
      })
    });
  }
  // Abre a escolha de dificuldade uma vez por visita à tela; "próxima fase" continua na mesma dificuldade
  const begin = (ctx, id, tiers, sub, start) => {
    if (ctx.mode === 'duel') return start();
    const go = () => start(startLevel(id));
    if (ctx.chosen) return go();
    ctx.chosen = true; tierModal(id, tiers, sub, go, true);
  };
  const actionBtn = (attr, icon, label, badge) => `<button class="pz-action" ${attr}><span>${ic(icon)}${badge ? `<i class="pz-badge" ${badge}>3</i>` : ''}</span>${label}</button>`;

  /* =====================================================
     PORCAS E PARAFUSOS
     ===================================================== */
  const NUT_TIERS = [
    { name: 'Fácil', from: 1, colors: 3, color: '#1fb37a' },
    { name: 'Médio', from: 1001, colors: 5, color: '#2a8bd8' },
    { name: 'Difícil', from: 2001, colors: 6, color: '#f2a516' },
    { name: 'Muito difícil', from: 3001, colors: 8, color: '#ff7a45' },
    { name: 'Extra difícil', from: 4001, colors: 9, color: '#ef4565' }
  ];
  function buildNuts(level) {
    const n = NUT_TIERS[tierIndex(NUT_TIERS, level)].colors;
    for (let a = 0; a < 40; a++) {
      const rnd = K.rng(level * 15485863 + a * 7907 + 31);
      const pool = []; for (let c = 0; c < n; c++) for (let k = 0; k < 4; k++) pool.push(c);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const st = Array.from({ length: n }, (_, i) => pool.slice(i * 4, i * 4 + 4)).concat([[], []]);
      if (st.some(K.solved)) continue;
      if (K.solve(st, 40000)) return st;
    }
  }

  AH.engines.porcas = {
    mount(el, ctx) {
      const COLORS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#a3e635'];
      const duel = ctx.mode === 'duel';
      let level = duel ? AH.duelLevel(NUT_TIERS, ctx.difficulty ?? 1, ctx.seed) : startLevel('porcas');
      let bolts, sel, moves, undo, hints, done, arrived = null;
      el.innerHTML = levelShell({
        duel, board: '<div class="nb-board" role="group" aria-label="Parafusos"></div>',
        footLeft: actionBtn('data-undo', 'undo-2', 'Desfazer'), footRight: actionBtn('data-hint', 'lightbulb', 'Dica', 'data-hints')
      });
      const board = el.querySelector('.nb-board');
      const $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };
      const topRun = t => { let k = 0; while (k < t.length && t[t.length - 1 - k] === t[t.length - 1]) k++; return k; };

      function start(lvl = level) {
        level = lvl; bolts = buildNuts(level); sel = null; moves = 0; undo = []; hints = 3; done = false; arrived = null;
        setTitle(el, NUT_TIERS[tierIndex(NUT_TIERS, level)], `Nível ${numOf(level)}`);
        msg('Toque num parafuso para soltar a porca do topo.'); draw();
      }
      function draw() {
        board.style.setProperty('--cols', bolts.length <= 8 ? 4 : 5);
        board.innerHTML = bolts.map((t, i) => {
          const run = sel === i ? topRun(t) : 0;
          return `<button class="nb-bolt ${K.solved(t) ? 'full' : ''} ${sel === i ? 'sel' : ''}" data-b="${i}" aria-label="Parafuso ${i + 1}: ${t.length} porcas${K.solved(t) ? ', completo' : ''}">
            <span class="nb-rod"></span><span class="nb-base"></span>
            <span class="nb-nuts">${t.map((c, k) => `<span class="nb-nut ${k >= t.length - run ? 'lift' : ''} ${arrived && arrived[0] === i && k >= t.length - arrived[1] ? 'arrive' : ''}" style="--c:${COLORS[c]}"></span>`).join('')}</span>
          </button>`;
        }).join('');
        $('[data-moves]').textContent = moves;
        $('[data-undo]').disabled = !undo.length || done;
        $('[data-hint]').disabled = !hints || done;
        $('[data-hints]').textContent = hints;
        arrived = null;
      }
      board.onclick = e => {
        const b = e.target.closest('[data-b]'); if (!b || done) return;
        const i = +b.dataset.b;
        if (sel === null) { if (bolts[i].length && !K.solved(bolts[i])) { sel = i; msg(''); draw(); } return; }
        if (sel === i) { sel = null; draw(); return; }
        const a = bolts[sel], d = bolts[i], c = a[a.length - 1];
        if (d.length >= 4) { msg('Esse parafuso está cheio.'); sel = null; draw(); return; }
        if (d.length && d[d.length - 1] !== c) { msg('Só dá para rosquear sobre uma porca da mesma cor.'); sel = null; draw(); return; }
        undo.push(bolts.map(t => [...t]));
        const before = d.length;
        bolts = K.apply(bolts, sel, i);
        arrived = [i, bolts[i].length - before];
        sel = null; moves++; msg(''); draw();
        if (K.done(bolts)) {
          done = true; draw(); board.classList.add('win');
          const tier = tierIndex(NUT_TIERS, level);
          setTimeout(() => ctx.end({ result: 'win', score: duel ? numOf(level) : advance('porcas', tier, level), extra: { tier }, summary: `Nível ${numOf(level)} · ${NUT_TIERS[tier].name} · ${moves} jogadas`, next: duel ? null : 'Próxima fase' }), 700);
        }
      };
      $('[data-undo]').onclick = () => { if (undo.length && !done) { bolts = undo.pop(); sel = null; draw(); } };
      $('[data-restart]').onclick = () => start(level);
      $('[data-hint]').onclick = () => {
        if (!hints || done) return;
        const sol = K.solve(bolts, 80000);
        if (!sol) return msg('Sem saída daqui. Desfaça algumas jogadas.');
        hints--; sel = null; draw();
        const [i, j] = sol[0];
        board.querySelector(`[data-b="${i}"]`).classList.add('hint'); board.querySelector(`[data-b="${j}"]`).classList.add('hint');
        msg(`Dica: mova do parafuso ${i + 1} para o ${j + 1}.`);
      };
      el.querySelector('[data-levels]')?.addEventListener('click', () => tierModal('porcas', NUT_TIERS, t => `${t.colors} cores`, () => start(startLevel('porcas'))));
      begin(ctx, 'porcas', NUT_TIERS, t => `${t.colors} cores`, start);
      return () => {};
    }
  };

  /* =====================================================
     SAIA DA VAGA (deslizar carros num estacionamento 6×6)
     ===================================================== */
  const CAR_TIERS = [
    { name: 'Fácil', from: 1, cars: 7, min: 3, max: 6, color: '#1fb37a' },
    { name: 'Médio', from: 1001, cars: 9, min: 7, max: 11, color: '#2a8bd8' },
    { name: 'Difícil', from: 2001, cars: 11, min: 12, max: 17, color: '#f2a516' },
    { name: 'Expert', from: 3001, cars: 12, min: 18, max: 60, color: '#ef4565' }
  ];
  const N = 6, EXIT_ROW = 2;
  function occ(cars, skip) {
    const g = Array.from({ length: N }, () => Array(N).fill(-1));
    cars.forEach((c, i) => { if (i === skip) return; for (let k = 0; k < c.len; k++) g[c.h ? c.r : c.r + k][c.h ? c.c + k : c.c] = i; });
    return g;
  }
  function range(cars, i) {
    const c = cars[i], g = occ(cars, i);
    let lo = c.h ? c.c : c.r, hi = lo;
    if (c.h) { while (lo > 0 && g[c.r][lo - 1] < 0) lo--; while (hi + c.len < N && g[c.r][hi + c.len] < 0) hi++; }
    else { while (lo > 0 && g[lo - 1][c.c] < 0) lo--; while (hi + c.len < N && g[hi + c.len][c.c] < 0) hi++; }
    return [lo, hi];
  }
  // Busca em largura: menor número de deslizes até o carro vermelho chegar na saída.
  function solveCars(cars0, cap = 120000) {
    const key = cs => cs.map(c => c.h ? c.c : c.r).join('');
    const start = cars0.map(c => ({ ...c }));
    const seen = new Map([[key(start), null]]);
    let q = [start];
    while (q.length) {
      const next = [];
      for (const cs of q) {
        if (cs[0].c === N - 2) {
          const path = []; let k = key(cs);
          while (seen.get(k)) { const [pk, mv] = seen.get(k); path.unshift(mv); k = pk; }
          return path;
        }
        const k0 = key(cs);
        for (let i = 0; i < cs.length; i++) {
          const [lo, hi] = range(cs, i), cur = cs[i].h ? cs[i].c : cs[i].r;
          for (let p = lo; p <= hi; p++) {
            if (p === cur) continue;
            const ns = cs.map(c => ({ ...c })); ns[i][ns[i].h ? 'c' : 'r'] = p;
            const k = key(ns);
            if (seen.has(k)) continue;
            seen.set(k, [k0, [i, p]]);
            if (seen.size > cap) return null;
            next.push(ns);
          }
        }
      }
      q = next;
    }
    return null;
  }
  const carCache = new Map(), carDepth = new Map();
  AH.carDepth = carDepth; // movimentos mínimos de cada fase gerada (útil para ajustar)
  // Gera um estacionamento aleatório, mapeia todas as posições alcançáveis a partir
  // dele e escolhe a posição mais distante da saída dentro da faixa da dificuldade.
  function buildCars(level) {
    // Banco pré-gerado (tools/gen_cars.py): fases instantâneas com dificuldade garantida.
    const bank = AH.carLevels;
    if (bank && bank.length) {
      // cada dificuldade usa as fases do banco dentro da sua faixa de movimentos (repete se acabar)
      const ti = tierIndex(CAR_TIERS, level), t = CAR_TIERS[ti];
      const pool = bank.map((_, i) => i).filter(i => AH.carLevelMoves[i] >= t.min && AH.carLevelMoves[i] <= t.max);
      if (pool.length) {
        const i = pool[(level - t.from) % pool.length];
        carDepth.set(level, AH.carLevelMoves[i]);
        return bank[i].map(([r, c, len, h]) => ({ r, c, len, h: !!h }));
      }
    }
    if (carCache.has(level)) return carCache.get(level).map(c => ({ ...c }));
    const t = CAR_TIERS[tierIndex(CAR_TIERS, level)];
    const key = cs => cs.map(c => c.h ? c.c : c.r).join('');
    let best = null, bestD = -1;
    const t0 = performance.now();
    for (let a = 0; a < 60 && performance.now() - t0 < 450; a++) {
      const rnd = K.rng(level * 2654435 + a * 97 + 7);
      const cars = [{ r: EXIT_ROW, c: Math.floor(rnd() * 5), len: 2, h: true }];
      for (let tries = 0; cars.length < t.cars && tries < 200; tries++) {
        const h = rnd() < 0.45, len = rnd() < 0.3 ? 3 : 2;
        const r = h ? Math.floor(rnd() * N) : Math.floor(rnd() * (N - len + 1));
        const c = h ? Math.floor(rnd() * (N - len + 1)) : Math.floor(rnd() * N);
        if (h && r === EXIT_ROW) continue; // não pode haver carro deitado na fila da saída
        const g = occ(cars);
        let ok = true; for (let k = 0; k < len; k++) if (g[h ? r : r + k][h ? c + k : c] >= 0) ok = false;
        if (ok) cars.push({ r, c, len, h });
      }
      // 1) todas as posições alcançáveis (cada deslize vale 1 movimento)
      const states = new Map(), adj = new Map();
      const q = [cars]; states.set(key(cars), cars);
      for (let qi = 0; qi < q.length && states.size < 12000; qi++) {
        const cs = q[qi], k0 = key(cs), list = [];
        for (let i = 0; i < cs.length; i++) {
          const [lo, hi] = range(cs, i), cur = cs[i].h ? cs[i].c : cs[i].r;
          for (let p = lo; p <= hi; p++) {
            if (p === cur) continue;
            const ns = cs.map(c => ({ ...c })); ns[i][ns[i].h ? 'c' : 'r'] = p;
            const k = key(ns); list.push(k);
            if (!states.has(k)) { states.set(k, ns); q.push(ns); }
          }
        }
        adj.set(k0, list);
      }
      // 2) distância de cada posição até a saída (BFS a partir das posições vencedoras)
      const dist = new Map(); let frontier = [];
      states.forEach((cs, k) => { if (cs[0].c === N - 2) { dist.set(k, 0); frontier.push(k); } });
      if (!frontier.length) continue;
      while (frontier.length) {
        const nx = [];
        for (const k of frontier) for (const n of adj.get(k) || []) if (!dist.has(n)) { dist.set(n, dist.get(k) + 1); nx.push(n); }
        frontier = nx;
      }
      // 3) escolhe a posição mais difícil que ainda cabe na dificuldade
      let pick = null, pd = -1;
      dist.forEach((d, k) => { if (d <= t.max && d > pd) { pd = d; pick = k; } });
      if (pick && pd > bestD) { best = states.get(pick); bestD = pd; }
      if (bestD >= t.min) break;
    }
    if (!best) best = [{ r: EXIT_ROW, c: 0, len: 2, h: true }, { r: 0, c: 3, len: 3, h: false }];
    carCache.set(level, best); carDepth.set(level, bestD);
    return best.map(c => ({ ...c }));
  }

  AH.engines.carros = {
    mount(el, ctx) {
      const PAL = ['#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#eab308', '#0ea5e9'];
      const duel = ctx.mode === 'duel';
      let level = duel ? AH.duelLevel(CAR_TIERS, ctx.difficulty ?? 1, ctx.seed) : startLevel('carros');
      let cars, moves, undo, hints, done, focusCar = 0;
      el.innerHTML = levelShell({
        duel, board: `<div class="ub-wrap"><div class="ub-board" tabindex="-1" aria-label="Estacionamento 6 por 6. Arraste os veículos ou selecione e use as setas."><span class="ub-exit" aria-hidden="true">${ic('arrow-right')}</span></div></div>`,
        footLeft: actionBtn('data-undo', 'undo-2', 'Desfazer'), footRight: actionBtn('data-hint', 'lightbulb', 'Dica', 'data-hints')
      });
      const board = el.querySelector('.ub-board');
      const $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };

      function start(lvl = level) {
        level = lvl; cars = buildCars(level); moves = 0; undo = []; hints = 3; done = false;
        setTitle(el, CAR_TIERS[tierIndex(CAR_TIERS, level)], `Nível ${numOf(level)}`);
        msg('Arraste os veículos para liberar a saída do carro vermelho.');
        build(); sync();
      }
      function build() {
        board.querySelectorAll('.ub-car').forEach(n => n.remove());
        cars.forEach((c, i) => {
          const b = document.createElement('button');
          b.className = `ub-car ${c.h ? 'h' : 'v'} ${i === 0 ? 'hero' : ''} len${c.len}`;
          b.dataset.car = i;
          b.style.setProperty('--c', i === 0 ? '#ef4444' : PAL[i % PAL.length]);
          b.setAttribute('aria-label', i === 0 ? 'Carro vermelho' : `${c.len === 3 ? 'Caminhão' : 'Carro'} ${c.h ? 'horizontal' : 'vertical'}`);
          b.innerHTML = '<span class="ub-body"><span class="ub-glass"></span><span class="ub-glass back"></span></span>';
          board.appendChild(b);
        });
      }
      function sync() {
        cars.forEach((c, i) => {
          const b = board.querySelector(`[data-car="${i}"]`);
          b.style.left = `${c.c * 100 / N}%`; b.style.top = `${c.r * 100 / N}%`;
          b.style.width = `${(c.h ? c.len : 1) * 100 / N}%`; b.style.height = `${(c.h ? 1 : c.len) * 100 / N}%`;
          b.style.transform = '';
        });
        $('[data-moves]').textContent = moves;
        $('[data-undo]').disabled = !undo.length || done;
        $('[data-hint]').disabled = !hints || done;
        $('[data-hints]').textContent = hints;
      }
      function commit(i, p) {
        const c = cars[i], cur = c.h ? c.c : c.r;
        if (p === cur) return sync();
        undo.push(cars.map(x => ({ ...x })));
        c[c.h ? 'c' : 'r'] = p; moves++; msg('');
        board.querySelectorAll('.hint').forEach(n => n.classList.remove('hint'));
        sync();
        if (cars[0].c === N - 2) win();
      }
      function win() {
        done = true; sync();
        const hero = board.querySelector('[data-car="0"]');
        hero.classList.add('leaving');
        const tier = tierIndex(CAR_TIERS, level);
        msg('Saiu da vaga!');
        setTimeout(() => ctx.end({ result: 'win', score: duel ? numOf(level) : advance('carros', tier, level), extra: { tier }, summary: `Nível ${numOf(level)} · ${CAR_TIERS[tier].name} · ${moves} movimentos`, next: duel ? null : 'Próxima fase' }), 800);
      }

      // Arrastar com mouse ou dedo, encaixando nas casas
      let drag = null;
      board.addEventListener('pointerdown', e => {
        const b = e.target.closest('.ub-car'); if (!b || done) return;
        const i = +b.dataset.car, c = cars[i];
        focusCar = i;
        const [lo, hi] = range(cars, i), cell = board.clientWidth / N;
        drag = { i, b, x: e.clientX, y: e.clientY, lo, hi, cell, cur: c.h ? c.c : c.r, delta: 0 };
        try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('drag');
      });
      board.addEventListener('pointermove', e => {
        if (!drag) return;
        const c = cars[drag.i];
        let d = c.h ? e.clientX - drag.x : e.clientY - drag.y;
        d = Math.max((drag.lo - drag.cur) * drag.cell, Math.min((drag.hi - drag.cur) * drag.cell, d));
        drag.delta = d;
        drag.b.style.transform = c.h ? `translateX(${d}px)` : `translateY(${d}px)`;
      });
      const endDrag = () => {
        if (!drag) return;
        const { i, b, cur, delta, cell } = drag; drag = null;
        b.classList.remove('drag');
        commit(i, cur + Math.round(delta / cell));
      };
      board.addEventListener('pointerup', endDrag);
      board.addEventListener('pointercancel', endDrag);
      // Teclado: Tab seleciona o veículo, setas movem uma casa
      board.addEventListener('keydown', e => {
        const b = e.target.closest('.ub-car'); if (!b || done) return;
        const i = +b.dataset.car, c = cars[i];
        const dir = { ArrowLeft: c.h ? -1 : 0, ArrowRight: c.h ? 1 : 0, ArrowUp: c.h ? 0 : -1, ArrowDown: c.h ? 0 : 1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const [lo, hi] = range(cars, i), cur = c.h ? c.c : c.r;
        const p = Math.max(lo, Math.min(hi, cur + dir));
        commit(i, p);
        board.querySelector(`[data-car="${i}"]`).focus();
      });

      $('[data-undo]').onclick = () => { if (undo.length && !done) { cars = undo.pop(); sync(); } };
      $('[data-restart]').onclick = () => start(level);
      $('[data-hint]').onclick = () => {
        if (!hints || done) return;
        const sol = solveCars(cars, 200000);
        if (!sol || !sol.length) return msg('Não encontrei um caminho. Tente desfazer.');
        hints--; sync();
        const [i, p] = sol[0], c = cars[i], cur = c.h ? c.c : c.r;
        board.querySelector(`[data-car="${i}"]`).classList.add('hint');
        msg(`Dica: mova o veículo destacado ${p > cur ? (c.h ? 'para a direita' : 'para baixo') : (c.h ? 'para a esquerda' : 'para cima')}.`);
      };
      el.querySelector('[data-levels]')?.addEventListener('click', () => tierModal('carros', CAR_TIERS, t => `${t.min}+ movimentos`, () => start(startLevel('carros'))));
      begin(ctx, 'carros', CAR_TIERS, t => `${t.min}+ movimentos`, start);
      return () => {};
    }
  };

  /* =====================================================
     TORRE ESPIRAL (estilo Helix Jump) — canvas
     Rodadas com plataforma de chegada, cores novas a cada rodada,
     câmera próxima e bolinha com física "de borracha".
     ===================================================== */
  const HX_THEMES = [
    { bg: ['#7dd3fc', '#e0f2fe'], pole: '#f8fafc', plat: '#0284c7', ball: '#f97316' },
    { bg: ['#f9a8d4', '#fdf2f8'], pole: '#fff7fb', plat: '#db2777', ball: '#7c3aed' },
    { bg: ['#86efac', '#f0fdf4'], pole: '#fafffb', plat: '#16a34a', ball: '#e11d48' },
    { bg: ['#c4b5fd', '#f5f3ff'], pole: '#fbfaff', plat: '#7c3aed', ball: '#f59e0b' },
    { bg: ['#fdba74', '#fff7ed'], pole: '#fffaf5', plat: '#ea580c', ball: '#0ea5e9' },
    { bg: ['#1e1b4b', '#4338ca'], pole: '#c7d2fe', plat: '#22d3ee', ball: '#facc15' },
    { bg: ['#fde047', '#fefce8'], pole: '#fffef5', plat: '#0d9488', ball: '#dc2626' },
    { bg: ['#0f172a', '#334155'], pole: '#94a3b8', plat: '#f43f5e', ball: '#a3e635' }
  ];
  AH.engines.helix = {
    mount(el, ctx) {
      const best0 = AH.store.user?.stats.helix?.best || 0;
      const skTower = AH.store.skin('helix', 'tower').fx.theme, skBall = AH.store.skin('helix', 'ball').fx.ball; // cosméticos da loja
      el.innerHTML = `<div class="hx">
        <div class="hx-top" aria-hidden="true"><span class="hx-lv" data-cur>1</span><span class="hx-bar"><i data-bar></i></span><span class="hx-lv next" data-next>2</span></div>
        <div class="hx-score" data-score aria-live="off">0</div>
        <div class="hx-banner" data-banner></div>
        <canvas class="hx-canvas" tabindex="0" aria-label="Torre Espiral. Arraste para os lados ou use as setas para girar a torre."></canvas>
        <div class="hx-overlay" data-overlay>
          <b>Torre Espiral</b>
          <span>Arraste para girar a torre.<br>Caia pelos buracos e evite o vermelho!<br>Caia 3 andares seguidos para pegar fogo e quebrar tudo.</span>
          ${best0 ? `<small>Recorde: ${AH.ui.fmt(best0)}</small>` : ''}
          <button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button>
        </div>
      </div>`;
      const cv = el.querySelector('canvas'), g = cv.getContext('2d');
      const $ = s => el.querySelector(s);
      const SEG = 12, SPACING = 200;
      let W, H, R, RI, K3, TH, BR, raf, running = false, dead = false;
      let rot, ballY, vy, camY, plats, score, combo, rng, splats, parts, trail, pops, squash, lastT;
      let round, theme, passedInRound, gen;

      const roundLen = r => Math.min(30, 9 + r * 2);
      function size() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        W = cv.clientWidth; H = cv.clientHeight;
        cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
        R = Math.min(W * 0.47, 240); RI = R * 0.2; K3 = 0.46; TH = R * 0.12; BR = Math.max(11, R * 0.072);
      }
      // Gera plataformas em sequência; a última de cada rodada é a chegada.
      function makePlat() {
        const r = gen.round, isFinish = gen.idx === roundLen(r);
        const segs = Array(SEG).fill(isFinish ? 3 : 0);
        if (!isFinish) {
          const gap = 2 + (rng() < 0.35 ? 1 : 0), s0 = Math.floor(rng() * SEG);
          for (let k = 0; k < gap; k++) segs[(s0 + k) % SEG] = 1;
          const danger = gen.idx < 1 && r === 1 ? 0 : Math.min(5, Math.floor(r / 2) + 1 + (rng() < 0.4 ? 1 : 0));
          for (let d = 0, tries = 0; d < danger && tries < 60; tries++) {
            const k = Math.floor(rng() * SEG);
            if (segs[k] === 0 && segs[(k + 1) % SEG] !== 1 && segs[(k + SEG - 1) % SEG] !== 1) { segs[k] = 2; d++; }
          }
        }
        const p = { y: gen.y, segs, round: r, finish: isFinish, broken: 0, passed: false };
        gen.y += SPACING;
        if (isFinish) { gen.round++; gen.idx = 0; } else gen.idx++;
        return p;
      }
      const segAt = a => Math.floor(((((a - rot) % 360) + 360) % 360) / (360 / SEG));
      function reset() {
        size();
        rng = K.rng((Date.now() & 0xffffff) + 1);
        round = 1; theme = themeOf(1); passedInRound = 0;
        gen = { round: 1, idx: 0, y: 300 };
        rot = 0; ballY = 160; vy = 0; camY = 0; score = 0; combo = 0; squash = 0;
        splats = []; parts = []; trail = []; pops = [];
        plats = []; for (let i = 0; i < 8; i++) plats.push(makePlat());
        plats[0].segs[segAt(90)] = 0; // começa sobre chão firme
        plats[0].segs[segAt(90) + 1 < SEG ? segAt(90) + 1 : 0] = plats[0].segs[segAt(90) + 1] === 2 ? 0 : plats[0].segs[segAt(90) + 1];
        dead = false; hud(); render();
      }
      function hud() {
        $('[data-score]').textContent = AH.ui.fmt(score);
        $('[data-cur]').textContent = round; $('[data-next]').textContent = round + 1;
        $('[data-bar]').style.width = Math.min(100, passedInRound / roundLen(round) * 100) + '%';
        const t = themeOf(round);
        el.querySelector('.hx').style.setProperty('--hx', t.plat);
      }
      function banner(text) {
        const b = $('[data-banner]'); b.textContent = text;
        b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
      }
      const themeOf = r => skTower || HX_THEMES[(r - 1) % HX_THEMES.length];
      const ballColor = () => skBall || theme.ball;
      const burst = (x, y, color, n, power = 1) => {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 3) * power;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2 * power, life: 1, color, r: 2 + Math.random() * 3 });
        }
      };

      function step(dt) {
        const prev = ballY;
        vy = Math.min(vy + 0.5 * dt, 17);
        ballY += vy * dt;
        squash = Math.max(0, squash - 0.09 * dt);
        trail.push({ y: ballY, fire: combo >= 3 }); if (trail.length > 10) trail.shift();
        for (const p of plats) {
          if (p.broken || p.passed) continue;
          if (prev + BR <= p.y && ballY + BR >= p.y) {
            const s = p.segs[segAt(90)];
            const bx = W / 2, by = p.y - camY + midR() * K3;
            if (p.finish) {
              p.passed = true; p.broken = 1;
              score += 50 * round; round++; passedInRound = 0; combo = 0;
              burst(bx, by, '#fde047', 40, 1.6); burst(bx, by, themeOf(round).plat, 30, 1.3);
              banner(`Rodada ${round}!`); hud();
              continue;
            }
            if (s === 1 || combo >= 3) {
              p.passed = true;
              if (s !== 1) { // pegando fogo: quebra a plataforma
                p.broken = 1; burst(bx, by, themeOf(p.round).plat, 34, 1.4);
                ballY = p.y - BR; vy = -6; squash = 1; combo = 0;
                pops.push({ x: bx, y: by - 30, text: 'QUEBROU!', life: 1 });
              } else {
                combo++;
                const pts = 10 * combo;
                pops.push({ x: bx + (Math.random() - 0.5) * 40, y: by - 20, text: '+' + pts, life: 1 });
                score += pts;
                if (combo === 3) banner('Pegando fogo!');
              }
              passedInRound++; hud();
            } else if (s === 2) { return die(bx, p.y - camY + midR() * K3 - BR); }
            else {
              ballY = p.y - BR; vy = -10.6; squash = 1; combo = 0;
              splats.push({ y: p.y, a: 90 - rot, c: ballColor(), life: 1, s: 0.7 + Math.random() * 0.5 });
              burst(bx, by - 2, ballColor(), 6, 0.6);
            }
          }
        }
        // câmera só desce, sempre mostrando a bolinha no terço de cima
        const target = ballY - H * 0.34;
        if (target > camY) camY += (target - camY) * Math.min(1, 0.18 * dt);
        // a bolinha nunca sai da parte de cima da tela (nem no pulo mais alto)
        if (ballY - camY < H * 0.2) camY = ballY - H * 0.2;
        // tema acompanha a rodada atual com transição suave
        theme = mix(theme, themeOf(round), 0.06 * dt);
        while (plats[plats.length - 1].y < camY + H + SPACING * 3) plats.push(makePlat());
        plats = plats.filter(p => p.y > camY - SPACING * 2);
        plats.forEach(p => { if (p.broken && p.broken < 30) p.broken += dt; });
        splats = splats.filter(s => (s.life -= 0.0025 * dt) > 0);
        parts = parts.filter(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.25 * dt; return (q.life -= 0.025 * dt) > 0; });
        pops = pops.filter(q => { q.y -= 0.8 * dt; return (q.life -= 0.02 * dt) > 0; });
      }
      const midR = () => RI + (R - RI) * 0.42;
      function die(x, y) {
        dead = true; running = false;
        burst(x, y, ballColor(), 40, 1.8);
        if (navigator.vibrate) navigator.vibrate(80);
        const end = performance.now();
        const fx = t => { const dt = Math.min(2.5, (t - (lastT || t)) / 16.67); lastT = t;
          parts = parts.filter(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.25 * dt; return (q.life -= 0.025 * dt) > 0; });
          render(); if (t - end < 700) raf = requestAnimationFrame(fx); };
        raf = requestAnimationFrame(fx);
        setTimeout(() => ctx.end({ result: 'complete', score, extra: { round }, summary: `Rodada ${round} · ${AH.ui.fmt(score)} pontos` }), 750);
      }

      // ----- desenho -----
      const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
      const rgb = a => `rgb(${a.map(v => Math.round(v)).join(',')})`;
      const shade = (h, amt) => rgb(hex(h).map(c => Math.max(0, Math.min(255, c + (amt > 0 ? (255 - c) * amt : c * amt)))));
      function mix(a, b, t) {
        if (a === b) return a;
        const m = (x, y) => '#' + hex(x).map((v, i) => Math.round(v + (hex(y)[i] - v) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
        const out = { bg: [m(a.bg[0], b.bg[0]), m(a.bg[1], b.bg[1])], pole: m(a.pole, b.pole), plat: m(a.plat, b.plat), ball: m(a.ball, b.ball) };
        return out.bg[0] === b.bg[0] && out.plat === b.plat ? b : out;
      }
      function ring(cx, cy, rOut, rIn, a0, a1) {
        g.beginPath(); g.ellipse(cx, cy, rOut, rOut * K3, 0, a0, a1); g.ellipse(cx, cy, rIn, rIn * K3, 0, a1, a0, true); g.closePath();
      }
      function render() {
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, theme.bg[0]); bg.addColorStop(1, theme.bg[1]);
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const cx = W / 2, rad = d => d * Math.PI / 180, st = 360 / SEG;
        const vis = plats.filter(p => p.y - camY > -TH * 3 && p.y - camY < H + 60);
        const drawPlat = (p, front) => {
          const fade = p.broken ? Math.max(0, 1 - p.broken / 14) : 1;
          if (!fade) return;
          const y = p.y - camY + (p.broken ? p.broken * 3 : 0);
          const base = p.finish ? '#fde047' : themeOf(p.round).plat;
          g.globalAlpha = fade;
          p.segs.forEach((s, i) => {
            if (s === 1) return;
            const a0 = ((i * st + rot) % 360 + 360) % 360, a1 = a0 + st + 0.4, mid = rad(a0 + st / 2);
            if ((Math.sin(mid) > 0) !== front) return;
            const col = s === 2 ? '#ef4444' : base;
            const spread = p.broken ? p.broken * 2 : 0; // pedaços se afastando ao quebrar
            const ox = Math.cos(mid) * spread, oy = Math.sin(mid) * spread * K3;
            if (front) { // espessura só na borda externa (a interna ficava escura perto do poste)
              g.fillStyle = shade(col, -0.22);
              g.beginPath(); g.ellipse(cx + ox, y + oy, R, R * K3, 0, rad(a0), rad(a1));
              g.ellipse(cx + ox, y + oy + TH, R, R * K3, 0, rad(a1), rad(a0), true); g.closePath(); g.fill();
            }
            // paredes laterais onde o segmento encosta num buraco (deixa a borda do buraco bem visível)
            const face = ang => {
              const c = Math.cos(rad(ang)), sn = Math.sin(rad(ang)) * K3;
              g.fillStyle = shade(col, -0.38);
              g.beginPath();
              g.moveTo(cx + ox + c * RI, y + oy + sn * RI); g.lineTo(cx + ox + c * R, y + oy + sn * R);
              g.lineTo(cx + ox + c * R, y + oy + sn * R + TH); g.lineTo(cx + ox + c * RI, y + oy + sn * RI + TH);
              g.closePath(); g.fill();
            };
            // só as paredes voltadas para a câmera: a do lado de menor ângulo aparece na metade esquerda, a outra na direita
            if (p.segs[(i + SEG - 1) % SEG] === 1 && Math.cos(rad(a0)) < 0) face(a0);
            if (p.segs[(i + 1) % SEG] === 1 && Math.cos(rad(a0 + st)) > 0) face(a0 + st);
            g.fillStyle = s === 2 ? '#f87171' : p.finish && i % 2 ? '#facc15' : col;
            ring(cx + ox, y + oy, R, RI, rad(a0), rad(a1)); g.fill();
            // fio claro na beirada do buraco, por cima do topo
            const edge = ang => { const c = Math.cos(rad(ang)), sn = Math.sin(rad(ang)) * K3; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + ox + c * RI, y + oy + sn * RI); g.lineTo(cx + ox + c * R, y + oy + sn * R); g.stroke(); };
            if (p.segs[(i + SEG - 1) % SEG] === 1) edge(a0);
            if (p.segs[(i + 1) % SEG] === 1) edge(a0 + st);
            if (s === 2) { g.fillStyle = 'rgba(255,255,255,.18)'; ring(cx + ox, y + oy, R * 0.98, R * 0.8, rad(a0 + 2), rad(a1 - 2)); g.fill(); }
          });
          g.globalAlpha = 1;
        };
        // metades de trás, poste, metades da frente
        for (let i = vis.length - 1; i >= 0; i--) drawPlat(vis[i], false);
        const pg = g.createLinearGradient(cx - RI, 0, cx + RI, 0);
        pg.addColorStop(0, shade(theme.pole, -0.12)); pg.addColorStop(0.35, theme.pole); pg.addColorStop(1, shade(theme.pole, -0.22));
        g.fillStyle = pg; g.fillRect(cx - RI * 0.92, 0, RI * 1.84, H);
        const drawSplats = py => splats.forEach(s => {
          if (s.y !== py) return;
          const a = rad((((s.a + rot) % 360) + 360) % 360); if (Math.sin(a) <= 0.05) return;
          const r = midR(), x = cx + Math.cos(a) * r, y = s.y - camY + Math.sin(a) * r * K3;
          g.globalAlpha = Math.min(1, s.life * 1.6) * 0.85; g.fillStyle = s.c;
          g.beginPath(); g.ellipse(x, y, BR * 1.5 * s.s, BR * 0.55 * s.s, 0, 0, Math.PI * 2); g.fill();
          for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.7) * BR * 1.6 * s.s, y + Math.sin(k * 1.7) * BR * 0.5, BR * 0.22, 0, Math.PI * 2); g.fill(); }
          g.globalAlpha = 1;
        });
        const drawBall = () => {
        // bolinha: rastro, sombra, corpo com squash & stretch, brilho
        const bx = cx, by = ballY - camY + midR() * K3;
        if (!dead) {
          trail.forEach((t, i) => {
            const f = i / trail.length;
            g.globalAlpha = f * (t.fire ? 0.55 : 0.28);
            g.fillStyle = t.fire ? (i % 2 ? '#f97316' : '#fde047') : ballColor();
            g.beginPath(); g.arc(bx, t.y - camY + midR() * K3, BR * (0.4 + f * 0.55), 0, Math.PI * 2); g.fill();
          });
          g.globalAlpha = 1;
          const stretch = vy > 2 ? Math.min(0.28, vy / 45) : 0;
          const sx = 1 + squash * 0.38 - stretch * 0.5, sy = 1 - squash * 0.32 + stretch;
          if (combo >= 3) {
            const glow = g.createRadialGradient(bx, by, BR * 0.5, bx, by, BR * 2.6);
            glow.addColorStop(0, 'rgba(253,224,71,.85)'); glow.addColorStop(1, 'rgba(249,115,22,0)');
            g.fillStyle = glow; g.beginPath(); g.arc(bx, by, BR * 2.6, 0, Math.PI * 2); g.fill();
            if (Math.random() < 0.6) parts.push({ x: bx + (Math.random() - 0.5) * BR, y: by, vx: (Math.random() - 0.5) * 1.5, vy: -1 - Math.random() * 2, life: 0.7, color: Math.random() < 0.5 ? '#f97316' : '#fde047', r: 2 + Math.random() * 3 });
          }
          g.save();
          g.translate(bx, by + BR); g.scale(sx, sy); g.translate(0, -BR);
          const body = g.createRadialGradient(-BR * 0.35, -BR * 0.4, BR * 0.15, 0, 0, BR);
          body.addColorStop(0, shade(combo >= 3 ? '#f97316' : ballColor(), 0.55)); body.addColorStop(1, combo >= 3 ? '#ea580c' : ballColor());
          g.fillStyle = body; g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-BR * 0.38, -BR * 0.42, BR * 0.28, BR * 0.18, -0.6, 0, Math.PI * 2); g.fill();
          g.restore();
        }
        };
        // da plataforma mais baixa para a mais alta; a bolinha entra antes das plataformas que já ficaram acima dela,
        // senão ela aparece por cima do topo de uma plataforma pela qual acabou de cair
        let ballDone = false;
        for (let i = vis.length - 1; i >= 0; i--) {
          if (!ballDone && vis[i].y < ballY) { drawBall(); ballDone = true; }
          drawPlat(vis[i], true); drawSplats(vis[i].y);
        }
        if (!ballDone) drawBall();
        // partículas e pontos flutuantes
        parts.forEach(q => { g.globalAlpha = Math.max(0, q.life); g.fillStyle = q.color; g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.fill(); });
        g.globalAlpha = 1;
        g.font = `700 ${Math.round(BR * 1.2)}px Fredoka, sans-serif`; g.textAlign = 'center';
        pops.forEach(q => { g.globalAlpha = Math.max(0, q.life); g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 4; g.strokeText(q.text, q.x, q.y); g.fillText(q.text, q.x, q.y); });
        g.globalAlpha = 1;
      }
      function loop(t) {
        const dt = Math.min(2.5, lastT ? (t - lastT) / 16.67 : 1); lastT = t;
        if (running) step(dt);
        if (running) { render(); raf = requestAnimationFrame(loop); }
      }
      function go() {
        $('[data-overlay]').hidden = true;
        reset(); running = true; lastT = 0; raf = requestAnimationFrame(loop);
        cv.focus({ preventScroll: true });
      }

      // Controles: arrastar (mouse/dedo) ou setas
      let dragX = null;
      cv.addEventListener('pointerdown', e => { dragX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
      cv.addEventListener('pointermove', e => { if (dragX == null) return; rot += (e.clientX - dragX) * 0.75; dragX = e.clientX; if (!running && !dead) render(); });
      const up = () => { dragX = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      const keys = new Set();
      const onKey = e => {
        if (!['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key) || document.getElementById('modalRoot').classList.contains('open')) return;
        e.preventDefault(); e.type === 'keydown' ? keys.add(e.key) : keys.delete(e.key);
      };
      const spin = setInterval(() => { if (keys.has('ArrowLeft') || keys.has('a')) rot -= 4.5; if (keys.has('ArrowRight') || keys.has('d')) rot += 4.5; }, 16);
      document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (!dead) { running = false; dead = true; ctx.end({ result: 'complete', score, extra: { round }, summary: `Rodada ${round} · ${AH.ui.fmt(score)} pontos` }); } };
      const onResize = () => { size(); render(); };
      window.addEventListener('resize', onResize);
      reset();
      if (ctx.mode === 'duel') go();
      return () => { cancelAnimationFrame(raf); running = false; clearInterval(spin); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     SUDOKU — 4 dificuldades, solução única garantida
     ===================================================== */
  const SUDOKU_TIERS = [
    { id: 'facil', name: 'Fácil', clues: 40, color: '#1fb37a' },
    { id: 'medio', name: 'Médio', clues: 32, color: '#2a8bd8' },
    { id: 'dificil', name: 'Difícil', clues: 27, color: '#f2a516' },
    { id: 'expert', name: 'Expert', clues: 23, color: '#ef4565' }
  ];
  const BOX = i => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
  // Resolve com bitmasks escolhendo sempre a casa com menos opções; conta até `limit` soluções.
  function countSolutions(grid, limit = 2) {
    const g = grid.slice(), row = Array(9).fill(0), col = Array(9).fill(0), box = Array(9).fill(0);
    for (let i = 0; i < 81; i++) if (g[i]) { const b = 1 << g[i]; row[(i / 9) | 0] |= b; col[i % 9] |= b; box[BOX(i)] |= b; }
    let count = 0, solution = null;
    const rec = () => {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ~(row[(i / 9) | 0] | col[i % 9] | box[BOX(i)]) & 0x3fe;
        let n = 0; for (let x = m; x; x &= x - 1) n++;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) { count++; if (!solution) solution = g.slice(); return count >= limit; }
      if (!bestN) return false;
      const r = (best / 9) | 0, c = best % 9, bx = BOX(best);
      for (let v = 1; v <= 9; v++) {
        if (!(bestMask & (1 << v))) continue;
        const b = 1 << v;
        g[best] = v; row[r] |= b; col[c] |= b; box[bx] |= b;
        if (rec()) return true;
        g[best] = 0; row[r] &= ~b; col[c] &= ~b; box[bx] &= ~b;
      }
      return false;
    };
    rec();
    return { count, solution };
  }
  function makeSudoku(tier, rnd = Math.random) {
    // grade completa aleatória
    const full = Array(81).fill(0);
    const fill = i => {
      if (i === 81) return true;
      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rnd() - 0.5);
      for (const v of nums) {
        let ok = true;
        for (let k = 0; k < 81 && ok; k++) if (full[k] === v && ((k / 9 | 0) === (i / 9 | 0) || k % 9 === i % 9 || BOX(k) === BOX(i))) ok = false;
        if (ok) { full[i] = v; if (fill(i + 1)) return true; full[i] = 0; }
      }
      return false;
    };
    fill(0);
    const puzzle = full.slice();
    const order = [...Array(81).keys()].sort(() => rnd() - 0.5);
    let clues = 81;
    for (const i of order) {
      if (clues <= SUDOKU_TIERS[tier].clues) break;
      const keep = puzzle[i]; puzzle[i] = 0;
      if (countSolutions(puzzle, 2).count !== 1) puzzle[i] = keep; else clues--;
    }
    return { puzzle, solution: full };
  }

  AH.engines.sudoku = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      let tier = duel ? (ctx.difficulty ?? 0) : 1, puzzle, solution, cells, notes, given, sel, notesMode, mistakes, hints, undo, secs, timer, done;
      el.innerHTML = `
        ${duel ? '' : `<div class="tabs" role="tablist" aria-label="Dificuldade" style="margin-bottom:12px">${SUDOKU_TIERS.map((t, i) => `<button class="tab ${i === tier ? 'active' : ''}" data-tier-i="${i}" role="tab" aria-selected="${i === tier}" style="flex:1;justify-content:center">${t.name}</button>`).join('')}</div>`}
        <div class="score-row">
          <div class="score-box"><small>Tempo</small><b data-time>0:00</b></div>
          <div class="score-box"><small>Erros</small><b data-err>0/3</b></div>
          <button class="btn" data-restart aria-label="Novo jogo">${ic('rotate-ccw')}</button>
        </div>
        <div class="game-surface sd-surface">
          <div class="sd-grid" role="grid" aria-label="Tabuleiro de Sudoku"></div>
          <div class="sd-tools">
            <button class="sd-tool" data-undo>${ic('undo-2')}<span>Desfazer</span></button>
            <button class="sd-tool" data-erase>${ic('eraser')}<span>Apagar</span></button>
            <button class="sd-tool" data-notes aria-pressed="false">${ic('pencil')}<span>Notas</span></button>
            <button class="sd-tool" data-hint>${ic('lightbulb')}<span>Dica (<b data-hints>3</b>)</span></button>
          </div>
          <div class="sd-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}" aria-label="Número ${n}">${n}<small data-left="${n}"></small></button>`).join('')}</div>
        </div>`;
      const grid = el.querySelector('.sd-grid');
      const $ = s => el.querySelector(s);
      const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

      function start(t = tier) {
        tier = t; clearInterval(timer);
        grid.innerHTML = `<div class="sd-loading">${ic('loader-2')} Gerando tabuleiro…</div>`; AH.ui.refreshIcons();
        setTimeout(() => {
          const s = makeSudoku(tier, ctx.seed != null ? K.rng(ctx.seed) : Math.random);
          puzzle = s.puzzle; solution = s.solution;
          cells = puzzle.slice(); given = puzzle.map(Boolean); notes = Array.from({ length: 81 }, () => new Set());
          sel = cells.findIndex(v => !v); notesMode = false; mistakes = 0; hints = 3; undo = []; secs = 0; done = false; timer = null;
          $('[data-notes]').setAttribute('aria-pressed', 'false');
          $('[data-time]').textContent = '0:00';
          timer = setInterval(() => { if (!done) { secs++; $('[data-time]').textContent = fmtT(secs); } }, 1000);
          draw();
        }, 30);
      }
      function draw() {
        const sv = cells[sel], sr = (sel / 9) | 0, sc = sel % 9, sb = BOX(sel);
        grid.innerHTML = cells.map((v, i) => {
          const r = (i / 9) | 0, c = i % 9;
          const cls = ['sd-cell', given[i] ? 'given' : '', i === sel ? 'sel' : '', i !== sel && (r === sr || c === sc || BOX(i) === sb) ? 'peer' : '',
            v && sv && v === sv && i !== sel ? 'same' : '', v && !given[i] && v !== solution[i] ? 'wrong' : '',
            c % 3 === 2 && c < 8 ? 'br' : '', r % 3 === 2 && r < 8 ? 'bb' : ''].filter(Boolean).join(' ');
          const inner = v ? v : notes[i].size ? `<span class="sd-notes">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<i>${notes[i].has(n) ? n : ''}</i>`).join('')}</span>` : '';
          return `<button class="${cls}" data-i="${i}" role="gridcell" aria-label="Linha ${r + 1}, coluna ${c + 1}: ${v || 'vazia'}">${inner}</button>`;
        }).join('');
        $('[data-err]').textContent = `${mistakes}/3`;
        $('[data-hints]').textContent = hints;
        $('[data-hint]').disabled = !hints || done;
        $('[data-undo]').disabled = !undo.length || done;
        for (let n = 1; n <= 9; n++) {
          const left = 9 - cells.filter((v, i) => v === n && v === solution[i]).length;
          const b = el.querySelector(`[data-n="${n}"]`); b.disabled = !left || done;
          el.querySelector(`[data-left="${n}"]`).textContent = left || '';
        }
      }
      function put(n) {
        if (done || given[sel]) return;
        if (notesMode && n) {
          if (cells[sel]) return;
          undo.push([sel, cells[sel], new Set(notes[sel])]);
          notes[sel].has(n) ? notes[sel].delete(n) : notes[sel].add(n);
          return draw();
        }
        if (cells[sel] === n) return;
        undo.push([sel, cells[sel], new Set(notes[sel])]);
        cells[sel] = n; notes[sel].clear();
        if (n && n !== solution[sel]) {
          mistakes++;
          if (mistakes >= 3) { done = true; clearInterval(timer); draw(); return setTimeout(() => ctx.end({ result: 'loss', summary: 'Três erros — fim de jogo' }), 400); }
        } else if (n) {
          // remove a nota desse número das casas vizinhas
          const r = (sel / 9) | 0, c = sel % 9, b = BOX(sel);
          notes.forEach((s, i) => { if ((i / 9 | 0) === r || i % 9 === c || BOX(i) === b) s.delete(n); });
        }
        draw();
        if (n && n === solution[sel]) {
          grid.querySelector(`[data-i="${sel}"]`)?.classList.add('pop');
          const r = (sel / 9) | 0, c = sel % 9, bx = BOX(sel);
          const units = [[...Array(9)].map((_, k) => r * 9 + k), [...Array(9)].map((_, k) => k * 9 + c), [...Array(81).keys()].filter(i => BOX(i) === bx)];
          units.filter(u => u.every(i => cells[i] === solution[i])).forEach((u, ui) => u.forEach((i, k) => setTimeout(() => grid.querySelector(`[data-i="${i}"]`)?.classList.add('flash'), k * 35 + ui * 80)));
        }
        checkWin();
      }
      function checkWin() {
        if (done || !cells.every((v, i) => v === solution[i])) return;
        done = true; clearInterval(timer); draw(); grid.classList.add('win');
        setTimeout(() => ctx.end({ result: 'win', score: secs, extra: { tier }, summary: `${SUDOKU_TIERS[tier].name} em ${fmtT(secs)} · ${mistakes} erro(s)` }), 600);
      }
      grid.onclick = e => { const b = e.target.closest('[data-i]'); if (b) { sel = +b.dataset.i; draw(); grid.querySelector(`[data-i="${sel}"]`).focus(); } };
      el.querySelector('.sd-pad').onclick = e => { const b = e.target.closest('[data-n]'); if (b) put(+b.dataset.n); };
      $('[data-erase]').onclick = () => put(0);
      $('[data-notes]').onclick = () => { notesMode = !notesMode; $('[data-notes]').setAttribute('aria-pressed', notesMode); };
      $('[data-undo]').onclick = () => { const u = undo.pop(); if (!u || done) return; [sel, cells[u[0]]] = [u[0], u[1]]; notes[u[0]] = u[2]; draw(); };
      $('[data-hint]').onclick = () => {
        if (!hints || done) return;
        let i = !given[sel] && cells[sel] !== solution[sel] ? sel : cells.findIndex((v, k) => v !== solution[k]);
        hints--; sel = i; undo = undo.filter(u => u[0] !== i);
        cells[i] = solution[i]; given[i] = true; notes[i].clear();
        draw(); checkWin();
      };
      $('[data-restart]').onclick = () => start(tier);
      el.querySelectorAll('[data-tier-i]').forEach(t => t.onclick = () => {
        el.querySelectorAll('[data-tier-i]').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
        start(+t.dataset.tierI);
      });
      const onKey = e => {
        if (done || !cells || document.getElementById('modalRoot').classList.contains('open') || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        if (/^[1-9]$/.test(e.key)) { e.preventDefault(); put(+e.key); }
        else if (['Backspace', 'Delete', '0'].includes(e.key)) { e.preventDefault(); put(0); }
        else if (e.key.toLowerCase() === 'n') $('[data-notes]').click();
        else {
          const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
          if (d === undefined) return;
          e.preventDefault();
          const n = sel + d;
          if (n >= 0 && n < 81 && !(Math.abs(d) === 1 && ((n / 9) | 0) !== ((sel / 9) | 0))) { sel = n; draw(); grid.querySelector(`[data-i="${sel}"]`).focus(); }
        }
      };
      document.addEventListener('keydown', onKey);
      start(tier);
      return () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };
    }
  };
  AH.levelKit = { levelShell, setTitle, tierModal, begin, startLevel, advance, numOf, actionBtn, tierIndex, unlockedOf };
})();
