/* =========================================================
   Mais jogos: Pinte o Labirinto, Empilhar, Prateleiras,
   Copinhos de Cor, Batalha de Cores e Território.
   Seguem o contrato AH.engines[id].mount(el, ctx) -> cleanup.
   ========================================================= */
(function () {
  const { ic, esc, fmt } = AH.ui;
  const L = AH.levelKit, K = AH.sortKit;
  const rngOf = seed => K.rng(seed);
  const isModalOpen = () => document.getElementById('modalRoot').classList.contains('open');
  // Canvas nítido em telas retina
  function fitCanvas(cv, maxDpr = 2) {
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, W, H };
  }
  // Direção de um gesto de deslizar (dedo ou mouse)
  function onSwipe(target, cb) {
    let sx = null, sy = null;
    target.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    target.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  }
  const KEYDIR = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  const VEC = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };

  /* =====================================================
     PINTE O LABIRINTO — a bolinha desliza até a parede
     ===================================================== */
  const MAZE_TIERS = [
    { name: 'Fácil', from: 1, size: 7, color: '#1fb37a' },
    { name: 'Médio', from: 1001, size: 9, color: '#2a8bd8' },
    { name: 'Difícil', from: 2001, size: 11, color: '#f2a516' },
    { name: 'Expert', from: 3001, size: 13, color: '#ef4565' }
  ];
  function slide(grid, n, pos, dir) {
    const [dr, dc] = VEC[dir]; let r = (pos / n) | 0, c = pos % n; const path = [];
    while (true) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || !grid[nr * n + nc]) break;
      r = nr; c = nc; path.push(r * n + c);
    }
    return path;
  }
  // Cava um labirinto por deslizes e só aceita se todas as casas puderem ser pintadas
  // e se de qualquer posição alcançável der para voltar ao início (nunca trava).
  function buildMaze(level) {
    const t = MAZE_TIERS[L.tierIndex(MAZE_TIERS, level)], n = t.size;
    for (let a = 0; a < 400; a++) {
      const rnd = rngOf(level * 92821 + a * 131 + 5);
      const grid = new Array(n * n).fill(0), block = new Set();
      const start = ((rnd() * n) | 0) * n + ((rnd() * n) | 0);
      grid[start] = 1; let pos = start;
      const steps = n * 2 + ((rnd() * n) | 0);
      for (let k = 0; k < steps; k++) {
        const dir = ['left', 'right', 'up', 'down'][(rnd() * 4) | 0], [dr, dc] = VEC[dir];
        const len = 1 + ((rnd() * (n - 1)) | 0);
        let r = (pos / n) | 0, c = pos % n;
        for (let i = 0; i < len; i++) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= n || nc >= n || block.has(nr * n + nc)) break;
          r = nr; c = nc; grid[r * n + c] = 1;
        }
        pos = r * n + c;
        const br = r + dr, bc = c + dc;
        if (br >= 0 && bc >= 0 && br < n && bc < n && !grid[br * n + bc]) block.add(br * n + bc);
      }
      const open = grid.reduce((s, v) => s + v, 0);
      if (open < n * n * 0.42) continue;
      // posições alcançáveis e pintura total possível
      const seen = new Set([start]), q = [start], painted = new Set([start]), edges = new Map();
      while (q.length) {
        const p = q.shift(), out = [];
        for (const dir in VEC) {
          const path = slide(grid, n, p, dir); if (!path.length) continue;
          path.forEach(x => painted.add(x));
          const end = path[path.length - 1]; out.push(end);
          if (!seen.has(end)) { seen.add(end); q.push(end); }
        }
        edges.set(p, out);
      }
      if (painted.size !== open) continue;
      // toda posição alcançável consegue voltar ao início
      const rev = new Map(); edges.forEach((outs, p) => outs.forEach(o => { if (!rev.has(o)) rev.set(o, []); rev.get(o).push(p); }));
      const back = new Set([start]), q2 = [start];
      while (q2.length) { const p = q2.shift(); (rev.get(p) || []).forEach(x => { if (!back.has(x)) { back.add(x); q2.push(x); } }); }
      if ([...seen].some(p => !back.has(p))) continue;
      return { grid, n, start };
    }
    // reserva: um corredor simples
    const n0 = 5, grid = new Array(25).fill(0); for (let i = 0; i < 5; i++) { grid[i] = 1; grid[20 + i] = 1; grid[i * 5] = 1; grid[i * 5 + 4] = 1; }
    return { grid, n: n0, start: 0 };
  }

  AH.engines.labirinto = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      const HUES = ['#ff5a7a', '#a855f7', '#22c55e', '#f59e0b', '#06b6d4', '#ef4444', '#3b82f6'];
      let level = duel ? AH.duelLevel(MAZE_TIERS, ctx.difficulty ?? 1, ctx.seed) : L.startLevel('labirinto');
      let mz, ball, painted, moves, busy, done, color;
      el.innerHTML = L.levelShell({
        duel, board: '<div class="mz-wrap"><div class="mz-board" tabindex="0" aria-label="Labirinto. Deslize ou use as setas."></div></div>',
        footLeft: '<span></span>', footRight: '<span></span>',
        center: '<span class="pz-moves"><small>Pintado</small><b data-moves>0%</b></span>'
      });
      const board = el.querySelector('.mz-board'), $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };
      function start(lvl = level) {
        level = lvl; mz = buildMaze(level); ball = mz.start; painted = new Set([ball]); moves = 0; busy = false; done = false;
        color = AH.store.skin('labirinto', 'paint').fx.paint || HUES[(level - 1) % HUES.length];
        L.setTitle(el, MAZE_TIERS[L.tierIndex(MAZE_TIERS, level)], `Nível ${L.numOf(level)}`);
        msg('Deslize para os lados para mover a bolinha.');
        build();
      }
      function build() {
        const n = mz.n;
        board.style.setProperty('--n', n); board.style.setProperty('--paint', color);
        const bs = AH.store.skin('labirinto', 'ball').fx;
        board.style.setProperty('--ball-mid', bs.mid || '#e2e8f0'); board.style.setProperty('--ball-dark', bs.dark || '#94a3b8');
        board.innerHTML = mz.grid.map((v, i) => `<span class="mz-cell ${v ? 'open' : 'wall'} ${painted.has(i) ? 'on' : ''}" data-c="${i}"></span>`).join('') + '<span class="mz-ball"></span>';
        placeBall(false); progress();
      }
      function placeBall(anim, dist = 1) {
        const n = mz.n, b = board.querySelector('.mz-ball');
        b.style.transition = anim ? `left ${0.05 * dist}s linear, top ${0.05 * dist}s linear` : 'none'; // 50 ms por casa, igual ao tempo da tinta
        b.style.left = `${(ball % n) * 100 / n}%`; b.style.top = `${((ball / n) | 0) * 100 / n}%`;
      }
      function progress() {
        const open = mz.grid.reduce((s, v) => s + v, 0);
        $('[data-moves]').textContent = Math.round(painted.size / open * 100) + '%';
        return painted.size === open;
      }
      function move(dir) {
        if (busy || done) return;
        const path = slide(mz.grid, mz.n, ball, dir);
        if (!path.length) return;
        busy = true; moves++;
        ball = path[path.length - 1]; placeBall(true, path.length);
        path.forEach((c, i) => setTimeout(() => { painted.add(c); board.querySelector(`[data-c="${c}"]`)?.classList.add('on'); }, 50 * i + 25));
        setTimeout(() => {
          busy = false; msg('');
          board.querySelector('.mz-ball').classList.remove('bump'); void board.offsetWidth; board.querySelector('.mz-ball').classList.add('bump');
          if (progress()) {
            done = true; board.classList.add('win'); msg('Labirinto pintado!');
            const tier = L.tierIndex(MAZE_TIERS, level);
            setTimeout(() => ctx.end({ result: 'win', score: duel ? L.numOf(level) : L.advance('labirinto', tier, level), extra: { tier }, summary: `Nível ${L.numOf(level)} · ${MAZE_TIERS[tier].name} · ${moves} movimentos`, next: duel ? null : 'Próxima fase' }), 700);
          }
        }, 50 * path.length + 70);
      }
      onSwipe(board, move);
      const onKey = e => { if (isModalOpen()) return; const d = KEYDIR[e.key]; if (d) { e.preventDefault(); move(d); } };
      document.addEventListener('keydown', onKey);
      $('[data-restart]').onclick = () => start(level);
      el.querySelector('[data-levels]')?.addEventListener('click', () => L.tierModal('labirinto', MAZE_TIERS, t => `${t.size}×${t.size}`, () => start(L.startLevel('labirinto'))));
      L.begin(ctx, 'labirinto', MAZE_TIERS, t => `${t.size}×${t.size}`, start);
      return () => document.removeEventListener('keydown', onKey);
    }
  };

  /* =====================================================
     EMPILHAR — torre isométrica
     ===================================================== */
  AH.engines.empilhar = {
    mount(el, ctx) {
      const best0 = AH.store.user?.stats.empilhar?.best || 0;
      el.innerHTML = `<div class="st">
        <div class="st-top"><span class="st-chip"><small>Recorde</small><b>${fmt(best0)}</b></span></div>
        <div class="st-score" data-score>0</div>
        <div class="st-perfect" data-perfect></div>
        <canvas class="st-canvas" tabindex="0" aria-label="Empilhar. Toque, clique ou aperte espaço para soltar o bloco."></canvas>
        <div class="hx-overlay" data-overlay><b>Empilhar</b><span>Toque para soltar o bloco.<br>Acerte em cheio para não perder tamanho!</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div>
      </div>`;
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, raf, running = false, over = false, lastT = 0;
      const BH = 10, BASE = 100;
      let stack, cur, dir, speed, camY, debris, perfectStreak, hue0, score, ripples = [];
      function size() { ({ g, W, H } = fitCanvas(cv)); }
      function reset() {
        size();
        hue0 = Math.random() * 360;
        stack = [{ x: 0, z: 0, w: BASE, d: BASE }];
        for (let i = 1; i < 4; i++) stack.push({ x: 0, z: 0, w: BASE, d: BASE });
        score = 0; speed = 1.6; perfectStreak = 0; debris = []; camY = 0; over = false;
        spawn(); $('[data-score]').textContent = 0; render();
      }
      function spawn() {
        const top = stack[stack.length - 1];
        dir = stack.length % 2 ? 'x' : 'z';
        cur = { ...top, t: 0 };
        cur[dir] = -130;
      }
      const colorAt = i => `hsl(${(hue0 + i * 7) % 360} 70% 62%)`;
      function drop() {
        if (!running || over) return;
        const top = stack[stack.length - 1], sz = dir === 'x' ? 'w' : 'd';
        const delta = cur[dir] - top[dir];
        if (Math.abs(delta) <= 3) { // em cheio!
          cur[dir] = top[dir]; perfectStreak++;
          if (perfectStreak >= 3) cur[sz] = Math.min(BASE, cur[sz] + 6); // recompensa: cresce de volta
          const p = $('[data-perfect]'); p.textContent = perfectStreak > 1 ? `Perfeito ×${perfectStreak}!` : 'Perfeito!';
          p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
          ripples.push({ b: { ...cur }, y: stack.length, t: 0 });
        } else {
          perfectStreak = 0;
          const overlap = cur[sz] - Math.abs(delta);
          if (overlap <= 0) { // errou tudo: o bloco cai
            debris.push({ ...cur, vy: 0, y: stack.length, c: colorAt(stack.length), rot: 0 });
            return gameOver();
          }
          // pedaço que sobra cai
          const cut = { ...cur, y: stack.length, vy: 0, c: colorAt(stack.length), rot: 0 };
          cut[sz] = Math.abs(delta);
          cut[dir] = delta > 0 ? cur[dir] + overlap : cur[dir];
          debris.push(cut);
          cur[sz] = overlap;
          if (delta < 0) cur[dir] = top[dir];
        }
        stack.push({ x: cur.x, z: cur.z, w: cur.w, d: cur.d });
        score++; $('[data-score]').textContent = score;
        speed = Math.min(4.2, 1.6 + score * 0.06);
        spawn();
      }
      function gameOver() {
        over = true; running = false;
        let t0 = performance.now();
        const fall = t => { stepDebris(1); render(); if (t - t0 < 900) raf = requestAnimationFrame(fall); };
        raf = requestAnimationFrame(fall);
        setTimeout(() => ctx.end({ result: 'complete', score, summary: `${score} blocos empilhados` }), 950);
      }
      function stepDebris(dt) { debris.forEach(b => { b.vy += 0.6 * dt; b.y -= b.vy * dt * 0.12; b.rot += 0.02 * dt; }); debris = debris.filter(b => b.y > stack.length - 40); }
      // projeção isométrica
      function iso(x, y, z, s, ox, oy) { return [ox + (x - z) * 0.866 * s, oy + (x + z) * 0.5 * s - y * s]; }
      function box(b, yIdx, color, s, ox, oy) {
        const y = yIdx * BH, x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        const P = (x, yy, z) => iso(x, yy, z, s, ox, oy);
        const poly = (pts, fill) => { g.fillStyle = fill; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.fill(); };
        poly([P(x0, y + BH, z1), P(x1, y + BH, z1), P(x1, y, z1), P(x0, y, z1)], shade(color, -0.12)); // frente esquerda
        poly([P(x1, y + BH, z0), P(x1, y + BH, z1), P(x1, y, z1), P(x1, y, z0)], shade(color, -0.28)); // frente direita
        poly([P(x0, y + BH, z0), P(x1, y + BH, z0), P(x1, y + BH, z1), P(x0, y + BH, z1)], color);   // topo
      }
      const shade = (c, a) => c.replace(/(\d+)%\)$/, (m, l) => `${Math.max(0, Math.min(100, +l + a * 100))}%)`);
      function render() {
        const top = stack.length;
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, `hsl(${(hue0 + top * 7 + 200) % 360} 45% 80%)`); bg.addColorStop(1, `hsl(${(hue0 + top * 7 + 230) % 360} 45% 30%)`);
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        const s = Math.min(W, 520) / 260;
        camY += ((top * BH * s) - camY) * 0.1;
        const ox = W / 2, oy = H * 0.55 + camY;
        const from = Math.max(0, top - 30);
        for (let i = from; i < stack.length; i++) box(stack[i], i, colorAt(i), s, ox, oy);
        if (running && cur) box(cur, stack.length, colorAt(stack.length), s, ox, oy);
        // contorno que se expande quando o bloco cai em cheio
        ripples.forEach(r => {
          r.t += 0.04; const grow = 1 + r.t * 0.5, b = r.b, y = (r.y) * BH + BH;
          const x0 = b.x - b.w / 2 * grow, x1 = b.x + b.w / 2 * grow, z0 = b.z - b.d / 2 * grow, z1 = b.z + b.d / 2 * grow;
          const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => iso(x, y, z, s, ox, oy));
          g.strokeStyle = `rgba(255,255,255,${Math.max(0, 1 - r.t)})`; g.lineWidth = 3;
          g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); g.stroke();
        });
        ripples = ripples.filter(r => r.t < 1);
        debris.forEach(b => { g.globalAlpha = Math.max(0, Math.min(1, (b.y - (stack.length - 30)) / 10)); box(b, b.y, b.c, s, ox, oy); g.globalAlpha = 1; });
      }
      function loop(t) {
        const dt = Math.min(2.5, lastT ? (t - lastT) / 16.67 : 1); lastT = t;
        if (running) {
          cur.t += dt * speed;
          cur[dir] = Math.sin(cur.t / 40 - Math.PI / 2) * 130 * -1 + (dir === 'x' ? 0 : 0);
          stepDebris(dt); render();
          raf = requestAnimationFrame(loop);
        }
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; lastT = 0; raf = requestAnimationFrame(loop); cv.focus({ preventScroll: true }); }
      cv.addEventListener('pointerdown', e => { e.preventDefault(); drop(); });
      const onKey = e => { if (isModalOpen()) return; if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement?.tagName === 'BUTTON') return; e.preventDefault(); drop(); } };
      document.addEventListener('keydown', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (!over) { over = true; running = false; ctx.end({ result: 'complete', score, summary: `${score} blocos empilhados` }); } };
      const onResize = () => { size(); render(); };
      window.addEventListener('resize', onResize);
      reset();
      if (ctx.mode === 'duel') go();
      return () => { cancelAnimationFrame(raf); running = false; document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     PRATELEIRAS — junte 3 produtos iguais
     ===================================================== */
  const SHELF_TIERS = [
    { name: 'Fácil', from: 1, shelves: 6, types: 5, layers: 2, color: '#1fb37a' },
    { name: 'Médio', from: 1001, shelves: 8, types: 8, layers: 3, color: '#2a8bd8' },
    { name: 'Difícil', from: 2001, shelves: 9, types: 11, layers: 3, color: '#f2a516' },
    { name: 'Expert', from: 3001, shelves: 12, types: 15, layers: 3, color: '#ef4565' }
  ];
  const GOODS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🥑', '🍉', '🍒', '🥥', '🍋', '🍑', '🥕', '🌽', '🍩', '🧁', '🍪', '🧃', '🍿', '🥐', '🧀'];
  function buildShelves(level) {
    const t = SHELF_TIERS[L.tierIndex(SHELF_TIERS, level)];
    const rnd = rngOf(level * 4421 + 17);
    const cells = t.shelves * 3 * t.layers, empties = Math.max(4, Math.round(t.shelves * 0.7));
    const triples = Math.floor((cells - empties) / 3);
    const pool = []; for (let i = 0; i < triples; i++) { const ty = i % t.types; pool.push(ty, ty, ty); }
    for (let i = pool.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // camadas de trás cheias, a da frente com os espaços vazios
    const shelves = Array.from({ length: t.shelves }, () => ({ front: [null, null, null], back: [] }));
    let k = 0;
    for (let l = 1; l < t.layers; l++) shelves.forEach(s => { const layer = [pool[k++], pool[k++], pool[k++]]; s.back.push(layer.map(x => x ?? null)); });
    const frontSlots = []; shelves.forEach((s, si) => [0, 1, 2].forEach(j => frontSlots.push([si, j])));
    for (let i = frontSlots.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [frontSlots[i], frontSlots[j]] = [frontSlots[j], frontSlots[i]]; }
    frontSlots.forEach(([si, j]) => { if (k < pool.length) shelves[si].front[j] = pool[k++]; });
    // evita trinca pronta logo no começo
    shelves.forEach(s => { const f = s.front; if (f[0] != null && f[0] === f[1] && f[1] === f[2]) { const o = shelves.find(x => x !== s && x.front.some(v => v != null && v !== f[0])); if (o) { const j = o.front.findIndex(v => v != null && v !== f[0]); [f[2], o.front[j]] = [o.front[j], f[2]]; } } });
    return { shelves, total: pool.length, limit: 45 + pool.length * 2 };
  }

  AH.engines.prateleiras = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      let level = duel ? AH.duelLevel(SHELF_TIERS, ctx.difficulty ?? 1, ctx.seed) : L.startLevel('prateleiras');
      let st, sel, left, secs, timer, done, combo;
      el.innerHTML = L.levelShell({
        duel, board: '<div class="sh-board" role="group" aria-label="Prateleiras"></div>',
        footLeft: '<span class="pz-moves"><small>Tempo</small><b data-time>0:00</b></span>',
        footRight: '<span class="pz-moves"><small>Combo</small><b data-combo>×0</b></span>',
        center: '<span class="pz-moves"><small>Restam</small><b data-moves>0</b></span>'
      });
      const board = el.querySelector('.sh-board'), $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };
      const fmtT = s => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
      function start(lvl = level) {
        level = lvl; st = buildShelves(level); sel = null; left = st.total; done = false; combo = 0;
        secs = duel ? 9999 : st.limit;
        L.setTitle(el, SHELF_TIERS[L.tierIndex(SHELF_TIERS, level)], `Nível ${L.numOf(level)}`);
        msg('Toque num produto e depois numa prateleira com espaço.');
        clearInterval(timer);
        timer = setInterval(() => {
          if (done) return;
          secs--; $('[data-time]').textContent = duel ? '—' : fmtT(secs);
          if (!duel && secs <= 10) $('[data-time]').style.color = '#f87171';
          if (!duel && secs <= 0) { done = true; clearInterval(timer); msg('O tempo acabou!'); setTimeout(() => ctx.end({ result: 'loss', summary: `Nível ${L.numOf(level)} · faltaram ${left} produtos` }), 500); }
        }, 1000);
        $('[data-time]').textContent = duel ? '—' : fmtT(secs); $('[data-time]').style.color = '';
        draw();
      }
      function draw(pop) {
        board.style.setProperty('--cols', st.shelves.length <= 6 ? 2 : 3);
        board.innerHTML = st.shelves.map((s, si) => `<div class="sh-shelf ${sel && sel[0] === si ? 'from' : ''}" data-s="${si}">
            <div class="sh-back">${(s.back[0] || []).map(v => `<span>${v != null ? GOODS[v] : ''}</span>`).join('')}</div>
            <div class="sh-front">${s.front.map((v, j) => `<button class="sh-item ${v == null ? 'empty' : ''} ${sel && sel[0] === si && sel[1] === j ? 'sel' : ''} ${pop === si ? 'pop' : ''}" data-s="${si}" data-j="${j}" aria-label="${v == null ? 'Espaço vazio' : 'Produto ' + GOODS[v]}">${v != null ? GOODS[v] : ''}</button>`).join('')}</div>
            ${s.back.length > 1 ? `<i class="sh-layers">+${s.back.length}</i>` : s.back.length ? '<i class="sh-layers">+1</i>' : ''}
          </div>`).join('');
        $('[data-moves]').textContent = left;
        $('[data-combo]').textContent = '×' + combo;
      }
      function settle(si) {
        const s = st.shelves[si], f = s.front;
        if (f[0] != null && f[0] === f[1] && f[1] === f[2]) {
          s.front = [null, null, null]; left -= 3; combo++;
          if (combo > 1) msg(`Combo ×${combo}!`); else msg('');
          draw(si);
          setTimeout(() => { if (!s.front.some(v => v != null) && s.back.length) { s.front = s.back.shift(); draw(); } check(); }, 260);
          return true;
        }
        if (!f.some(v => v != null) && s.back.length) { s.front = s.back.shift(); }
        return false;
      }
      function check() {
        if (left > 0 || done) return;
        done = true; clearInterval(timer); msg('Prateleiras arrumadas!');
        const tier = L.tierIndex(SHELF_TIERS, level);
        setTimeout(() => ctx.end({ result: 'win', score: duel ? L.numOf(level) : L.advance('prateleiras', tier, level), extra: { tier }, summary: `Nível ${L.numOf(level)} · ${SHELF_TIERS[tier].name} · sobrou ${fmtT(secs)}`, next: duel ? null : 'Próxima fase' }), 500);
      }
      board.onclick = e => {
        if (done) return;
        const it = e.target.closest('[data-j]'), sh = e.target.closest('[data-s]'); if (!sh) return;
        const si = +sh.dataset.s, j = it ? +it.dataset.j : null;
        const v = j != null ? st.shelves[si].front[j] : null;
        // sem seleção: pega o produto tocado
        if (!sel) { if (v != null) { sel = [si, j]; draw(); } return; }
        // tocou no mesmo produto: solta
        if (sel[0] === si && sel[1] === j) { sel = null; return draw(); }
        // tocou noutro produto da mesma prateleira, ou numa prateleira cheia: troca a seleção
        if (v != null && (sel[0] === si || !st.shelves[si].front.includes(null))) { sel = [si, j]; return draw(); }
        if (sel[0] === si) return;
        const dst = st.shelves[si];
        let slot = j != null && dst.front[j] == null ? j : dst.front.indexOf(null);
        if (slot < 0) { msg('Essa prateleira está cheia.'); return; }
        const src = st.shelves[sel[0]];
        dst.front[slot] = src.front[sel[1]]; src.front[sel[1]] = null;
        const from = sel[0]; sel = null;
        const cleared = settle(si);
        if (!cleared) { combo = 0; settle(from); draw(); board.querySelector(`[data-s="${si}"] [data-j="${slot}"]`)?.classList.add('land'); }
        else settle(from);
        check();
      };
      $('[data-restart]').onclick = () => start(level);
      el.querySelector('[data-levels]')?.addEventListener('click', () => L.tierModal('prateleiras', SHELF_TIERS, t => `${t.types} produtos`, () => start(L.startLevel('prateleiras'))));
      L.begin(ctx, 'prateleiras', SHELF_TIERS, t => `${t.types} produtos`, start);
      return () => clearInterval(timer);
    }
  };

  /* =====================================================
     COPINHOS DE COR — pinte o pixel art de baixo para cima
     ===================================================== */
  const ART = [
    { name: 'Coração', pal: { r: '#ef4444', p: '#f9a8d4' }, rows: ['.rr...rr.', 'rrrr.rrrr', 'rrprrrrrr', 'rpprrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'] },
    { name: 'Cogumelo', pal: { r: '#dc2626', w: '#f8fafc', b: '#d6a77a' }, rows: ['...rrrr...', '..rrwwrr..', '.rrwwwwrr.', 'rrrrwwrrrr', 'rwwrrrrwwr', 'rwwrrrrwwr', '..bbbbbb..', '..bbbbbb..', '..bbbbbb..'] },
    { name: 'Peixe', pal: { o: '#f97316', y: '#facc15', k: '#1e293b', b: '#38bdf8' }, rows: ['bbbbbbbbbb', 'bbbooooobb', 'obooooookb', 'oooyyooobb', 'oooyyooobb', 'obooooooob', 'bbbooooobb', 'bbbbbbbbbb'] },
    { name: 'Casinha', pal: { r: '#b91c1c', y: '#fde68a', b: '#92400e', g: '#22c55e' }, rows: ['....r.....', '...rrr....', '..rrrrr...', '.rrrrrrr..', '..yyyyy...', '..ybyby...', '..yybyy...', '..yybyy...', 'gggggggggg'] },
    { name: 'Árvore', pal: { g: '#16a34a', l: '#4ade80', b: '#78350f', s: '#bae6fd' }, rows: ['ssssgsssss', 'sssgggssss', 'ssgglggsss', 'sgggggggss', 'ggglgggggs', 'sgggggglgs', 'ssssbbssss', 'ssssbbssss', 'llllllllll'] },
    { name: 'Fantasma', pal: { w: '#e0e7ff', k: '#1e1b4b', p: '#a78bfa' }, rows: ['ppppppppp', 'ppwwwwwpp', 'pwwwwwwwp', 'pwkwwwkwp', 'pwwwwwwwp', 'pwwwwwwwp', 'pwwwwwwwp', 'pwpwpwpwp', 'ppppppppp'] },
    { name: 'Sorvete', pal: { p: '#f472b6', c: '#fef3c7', b: '#d97706', s: '#a5f3fc' }, rows: ['sssppsss', 'sspppps', 'spppppps', 'spcppcps', 'sppppppps'.slice(0, 8), 'ssbbbbss', 'ssbbbbss', 'sssbbsss', 'sssbbsss'] },
    { name: 'Gato', pal: { o: '#fb923c', w: '#fff7ed', k: '#1c1917', g: '#a3e635' }, rows: ['o......o.', 'oo....oo.', 'ooooooooo', 'okoooooko', 'ooowwwooo', 'oowwkwwoo', '.ooooooo.', 'ggggggggg'] },
    { name: 'Foguete', pal: { w: '#e2e8f0', r: '#ef4444', b: '#60a5fa', n: '#0f172a', y: '#fbbf24' }, rows: ['nnnnwnnnn', 'nnnwwwnnn', 'nnnwbwnnn', 'nnnwwwnnn', 'nnrwwwrnn', 'nrrwwwrrn', 'nnnyyynnn', 'nnnnynnnn'] }
  ];
  const CUP_TIERS = [
    { name: 'Fácil', from: 1, belt: 6, cap: 10, color: '#1fb37a' },
    { name: 'Médio', from: 1001, belt: 5, cap: 8, color: '#2a8bd8' },
    { name: 'Difícil', from: 2001, belt: 4, cap: 6, color: '#f2a516' },
    { name: 'Expert', from: 3001, belt: 3, cap: 5, color: '#ef4565' }
  ];
  function buildCups(level) {
    const t = CUP_TIERS[L.tierIndex(CUP_TIERS, level)], art = ART[(level - 1) % ART.length];
    const rnd = rngOf(level * 7349 + 3);
    const w = Math.max(...art.rows.map(r => r.length));
    const pix = [];
    art.rows.forEach((row, r) => [...row.padEnd(w, '.')].forEach((ch, c) => { if (ch !== '.') pix.push({ r, c, color: art.pal[ch], done: false }); }));
    const count = {}; pix.forEach(p => count[p.color] = (count[p.color] || 0) + 1);
    const cups = [];
    Object.entries(count).forEach(([color, n]) => { while (n > 0) { const a = Math.min(t.cap, n); cups.push({ color, amount: a }); n -= a; } });
    for (let i = cups.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cups[i], cups[j]] = [cups[j], cups[i]]; }
    const cols = [[], [], [], []]; cups.forEach((c, i) => cols[i % 4].push(c));
    return { art, w, h: art.rows.length, pix, cols, belt: t.belt };
  }

  AH.engines.copinhos = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      let level = duel ? AH.duelLevel(CUP_TIERS, ctx.difficulty ?? 1, ctx.seed) : L.startLevel('copinhos');
      let lv, belt, tick, done, stall;
      el.innerHTML = L.levelShell({
        duel, board: `<div class="cp-wrap"><div class="cp-art"></div><div class="cp-belt"><span class="cp-count" data-belt>0/5</span><div class="cp-slots"></div></div><div class="cp-cols"></div></div>`,
        footLeft: '<span></span>', footRight: '<span></span>',
        center: '<span class="pz-moves"><small>Pintado</small><b data-moves>0%</b></span>'
      });
      const art = el.querySelector('.cp-art'), slots = el.querySelector('.cp-slots'), colsEl = el.querySelector('.cp-cols'), $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };
      const cupHTML = (c, attrs = '') => `<button class="cp-cup" style="--c:${c.color}" ${attrs}><b>${c.amount}</b></button>`;
      // só pode pintar um pixel se tudo abaixo dele (na mesma coluna) já foi pintado
      const paintable = p => !p.done && lv.pix.every(q => q.c !== p.c || q.r <= p.r || q.done);
      function start(lvl = level) {
        level = lvl; lv = buildCups(level); belt = []; done = false; stall = 0;
        L.setTitle(el, CUP_TIERS[L.tierIndex(CUP_TIERS, level)], `Nível ${L.numOf(level)} · ${lv.art.name}`);
        msg('Toque nos copinhos da frente para mandá-los para a esteira.');
        art.style.setProperty('--w', lv.w);
        art.innerHTML = Array.from({ length: lv.w * lv.h }, (_, i) => {
          const r = (i / lv.w) | 0, c = i % lv.w, p = lv.pix.find(q => q.r === r && q.c === c);
          return `<span class="cp-px ${p ? '' : 'none'}" data-px="${i}" ${p ? `style="--c:${p.color}"` : ''}></span>`;
        }).join('');
        draw();
        clearInterval(tick); tick = setInterval(step, 110);
      }
      function draw() {
        slots.innerHTML = Array.from({ length: lv.belt }, (_, i) => belt[i] ? cupHTML(belt[i], 'disabled') : '<span class="cp-slot"></span>').join('');
        $('[data-belt]').textContent = `${belt.length}/${lv.belt}`;
        colsEl.innerHTML = lv.cols.map((col, ci) => `<div class="cp-col">${col.slice(0, 4).map((c, k) => k === 0 ? cupHTML(c, `data-col="${ci}" aria-label="Copinho com ${c.amount} doses"`) : `<span class="cp-cup back" style="--c:${c.color}"><b>${c.amount}</b></span>`).join('')}${col.length > 4 ? `<small>+${col.length - 4}</small>` : ''}</div>`).join('');
        const pct = Math.round(lv.pix.filter(p => p.done).length / lv.pix.length * 100);
        $('[data-moves]').textContent = pct + '%';
      }
      function step() {
        if (done) return;
        let progressed = false;
        belt.forEach(cup => {
          if (!cup.amount) return;
          const p = lv.pix.filter(q => q.color === cup.color && paintable(q)).sort((a, b) => b.r - a.r)[0];
          if (!p) return;
          p.done = true; cup.amount--; progressed = true;
          const node = art.querySelector(`[data-px="${p.r * lv.w + p.c}"]`); node.classList.add('on');
        });
        const before = belt.length;
        belt = belt.filter(c => c.amount > 0);
        if (progressed || belt.length !== before) { stall = 0; draw(); }
        if (lv.pix.every(p => p.done)) {
          done = true; clearInterval(tick); art.classList.add('win'); msg(`${lv.art.name} completo!`);
          const tier = L.tierIndex(CUP_TIERS, level);
          return setTimeout(() => ctx.end({ result: 'win', score: duel ? L.numOf(level) : L.advance('copinhos', tier, level), extra: { tier }, summary: `Nível ${L.numOf(level)} · ${CUP_TIERS[tier].name} · ${lv.art.name}`, next: duel ? null : 'Próxima fase' }), 700);
        }
        // esteira lotada e ninguém consegue pintar: fim de jogo
        if (!progressed && belt.length >= lv.belt) {
          if (++stall > 14) { done = true; clearInterval(tick); msg('A esteira travou!'); setTimeout(() => ctx.end({ result: 'loss', summary: `Nível ${L.numOf(level)} · a esteira lotou` }), 600); }
          else if (stall === 3) msg('Esteira cheia! Nenhum copinho consegue pintar agora…');
        }
      }
      colsEl.onclick = e => {
        const b = e.target.closest('[data-col]'); if (!b || done) return;
        if (belt.length >= lv.belt) { msg('A esteira está cheia. Espere um copinho esvaziar.'); return; }
        const col = lv.cols[+b.dataset.col];
        belt.push(col.shift()); msg(''); draw();
      };
      $('[data-restart]').onclick = () => start(level);
      el.querySelector('[data-levels]')?.addEventListener('click', () => L.tierModal('copinhos', CUP_TIERS, t => `esteira ${t.belt}`, () => start(L.startLevel('copinhos'))));
      L.begin(ctx, 'copinhos', CUP_TIERS, t => `esteira ${t.belt}`, start);
      return () => clearInterval(tick);
    }
  };

  /* =====================================================
     BATALHA DE CORES — azul (você) contra vermelho (CPU)
     ===================================================== */
  AH.engines.cores = {
    mount(el, ctx) {
      const COLS = 18, ROWS = 26, MATCH = 75;
      const BLUE = '#3b82f6', RED = '#ef4444';
      const CARDS = [
        { id: 'bolas', name: 'Rajada', icon: 'circle-dot', cost: 3 },
        { id: 'serra', name: 'Serra', icon: 'disc-3', cost: 4 },
        { id: 'laser', name: 'Laser', icon: 'zap', cost: 5 },
        { id: 'bomba', name: 'Bomba', icon: 'bomb', cost: 6 }
      ];
      const opp = ctx.opponent?.username || 'CPU';
      const me = AH.store.user;
      el.innerHTML = `<div class="cw">
        <div class="cw-top">
          <span class="cw-p">${AH.ui.avatar(me, 'sm')}<b>Você</b></span>
          <span class="cw-bar"><i data-blue style="width:50%"></i></span>
          <span class="cw-p right"><b>${esc(opp)}</b>${ctx.opponent ? AH.ui.avatar(ctx.opponent, 'sm') : `<span class="avatar av-sm" style="--av:${RED}">${ic('bot')}</span>`}</span>
        </div>
        <div class="cw-time" data-time>1:15</div>
        <canvas class="cw-canvas" aria-label="Campo da batalha. Escolha uma carta e toque no campo."></canvas>
        <div class="cw-hand">${CARDS.map(c => `<button class="cw-card" data-card="${c.id}" aria-label="${c.name}, custa ${c.cost}">${ic(c.icon)}<span>${c.name}</span><i>${c.cost}</i></button>`).join('')}</div>
        <div class="cw-energy"><b data-en>3</b><span class="cw-en"><i data-enbar></i></span></div>
        <div class="hx-overlay" data-overlay><b>Batalha de Cores</b><span>Escolha uma carta e toque no campo para lançar.<br>Quem pintar mais até o fim vence!</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div>
      </div>`;
      AH.ui.refreshIcons();
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, cell, ox, oy, raf, running = false, over = false, lastT = 0;
      let grid, shots, saws, lasers, flashes, energy, cpuEnergy, time, sel, cannonT;
      function size() {
        ({ g, W, H } = fitCanvas(cv));
        cell = Math.floor(Math.min(W / COLS, H / ROWS)); ox = (W - cell * COLS) / 2; oy = (H - cell * ROWS) / 2;
      }
      function reset() {
        size();
        grid = Array.from({ length: ROWS }, (_, r) => Array(COLS).fill(r >= ROWS / 2 ? 0 : 1)); // 0 azul, 1 vermelho
        shots = []; saws = []; lasers = []; flashes = []; energy = 3; cpuEnergy = 3; time = MATCH; sel = null; cannonT = 0; over = false;
        hud(); render();
      }
      const owner = (r, c) => grid[r]?.[c];
      const fx = new Map(); // casa -> momento em que mudou de cor
      function paint(r, c, team) { if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return false; if (grid[r][c] === team) return false; grid[r][c] = team; fx.set(r * COLS + c, performance.now()); return true; }
      function fireBalls(team, col, n = 8) {
        const y = team === 0 ? ROWS - 0.5 : 0.5, dirY = team === 0 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const a = (-0.55 + 1.1 * i / (n - 1)) + (Math.random() - 0.5) * 0.1;
          shots.push({ x: col + 0.5, y, vx: Math.sin(a) * 0.32, vy: Math.cos(a) * 0.32 * dirY, team, life: 7 });
        }
      }
      function deploy(team, card, r, c) {
        if (card === 'bolas') fireBalls(team, c);
        if (card === 'serra') saws.push({ x: c + 0.5, y: r + 0.5, vx: (Math.random() < 0.5 ? -1 : 1) * 0.22, vy: (team === 0 ? -1 : 1) * 0.24, team, t: 360 });
        if (card === 'laser') lasers.push({ c, team, t: 0, row: team === 0 ? ROWS - 1 : 0 });
        if (card === 'bomba') { for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.abs(dr) + Math.abs(dc) <= 3) paint(r + dr, c + dc, team); flashes.push({ r, c, t: 1, team }); }
      }
      function step(dt) {
        time -= dt / 60;
        energy = Math.min(10, energy + dt / 60 * 0.9); cpuEnergy = Math.min(10, cpuEnergy + dt / 60 * 0.85);
        // canhões automáticos de cada lado
        cannonT += dt;
        if (cannonT > 95) { cannonT = 0; [3, COLS - 4].forEach(col => { fireBalls(0, col, 2); fireBalls(1, col, 2); }); }
        shots.forEach(s => {
          for (let k = 0; k < 2; k++) {
            s.x += s.vx * dt / 2; s.y += s.vy * dt / 2;
            if (s.x < 0.2 || s.x > COLS - 0.2) { s.vx *= -1; s.x = Math.max(0.2, Math.min(COLS - 0.2, s.x)); }
            if (s.y < 0.2 || s.y > ROWS - 0.2) { s.vy *= -1; s.y = Math.max(0.2, Math.min(ROWS - 0.2, s.y)); s.life -= 2; }
            const r = s.y | 0, c = s.x | 0;
            if (owner(r, c) !== undefined && owner(r, c) !== s.team) { paint(r, c, s.team); s.life--; s.vy *= -1; s.vx += (Math.random() - 0.5) * 0.1; }
          }
        });
        shots = shots.filter(s => s.life > 0);
        saws.forEach(s => {
          s.x += s.vx * dt; s.y += s.vy * dt; s.t -= dt;
          if (s.x < 1 || s.x > COLS - 1) s.vx *= -1;
          if (s.y < 1 || s.y > ROWS - 1) s.vy *= -1;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) paint((s.y | 0) + dr, (s.x | 0) + dc, s.team);
        });
        saws = saws.filter(s => s.t > 0);
        lasers.forEach(l => {
          l.t += dt;
          const reach = Math.min(ROWS, Math.floor(l.t / 2.2));
          for (let k = 0; k < reach; k++) { const r = l.team === 0 ? ROWS - 1 - k : k; paint(r, l.c, l.team); paint(r, l.c + 1, l.team); }
        });
        lasers = lasers.filter(l => l.t < 2.2 * ROWS + 25);
        flashes.forEach(f => f.t -= dt * 0.04); flashes = flashes.filter(f => f.t > 0);
        // CPU: joga quando tem energia, mirando onde o azul está forte
        if (cpuEnergy >= 3 && Math.random() < 0.02 * dt) {
          const opts = CARDS.filter(c => c.cost <= cpuEnergy);
          const card = opts[(Math.random() * opts.length) | 0];
          let best = 0, bc = (Math.random() * COLS) | 0;
          for (let c = 0; c < COLS; c++) { let b = 0; for (let r = 0; r < ROWS; r++) if (grid[r][c] === 0) b++; if (b > best + Math.random() * 3) { best = b; bc = c; } }
          let br = 0; for (let r = 0; r < ROWS; r++) if (grid[r][bc] === 0) { br = r; break; }
          cpuEnergy -= card.cost; deploy(1, card.id, Math.min(ROWS - 1, br + 2), bc);
        }
        if (time <= 0) end();
      }
      const blueShare = () => { let b = 0; grid.forEach(row => row.forEach(v => { if (!v) b++; })); return b / (ROWS * COLS); };
      function hud() {
        const pct = blueShare();
        $('[data-blue]').style.width = (pct * 100).toFixed(1) + '%';
        $('[data-time]').textContent = `${Math.floor(Math.max(0, time) / 60)}:${String(Math.ceil(Math.max(0, time)) % 60).padStart(2, '0')}`;
        $('[data-en]').textContent = Math.floor(energy);
        $('[data-enbar]').style.width = (energy / 10 * 100) + '%';
        el.querySelectorAll('[data-card]').forEach(b => { const c = CARDS.find(x => x.id === b.dataset.card); b.disabled = energy < c.cost; b.classList.toggle('sel', sel === c.id); });
      }
      function end() {
        if (over) return; over = true; running = false;
        const pct = Math.round(blueShare() * 100);
        const result = pct > 50 ? 'win' : pct < 50 ? 'loss' : 'draw';
        render();
        setTimeout(() => ctx.end({ result, score: pct, summary: `Você ${pct}% × ${100 - pct}% ${opp}` }), 500);
      }
      function render() {
        g.fillStyle = '#1e293b'; g.fillRect(0, 0, W, H);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const x = ox + c * cell, y = oy + r * cell;
          g.fillStyle = grid[r][c] ? RED : BLUE; g.fillRect(x, y, cell, cell);
          const age = performance.now() - (fx.get(r * COLS + c) || -1e9);
          if (age < 320) { const k = 1 - age / 320; g.fillStyle = `rgba(255,255,255,${0.7 * k})`; const pad = cell * 0.5 * (1 - k); g.fillRect(x + pad / 2, y + pad / 2, cell - pad, cell - pad); }
          g.fillStyle = grid[r][c] ? 'rgba(127,29,29,.35)' : 'rgba(30,58,138,.35)'; g.fillRect(x, y + cell - 2, cell, 2); g.fillRect(x + cell - 2, y, 2, cell);
        }
        lasers.forEach(l => {
          const reach = Math.min(ROWS, Math.floor(l.t / 2.2)), x = ox + l.c * cell, col = l.team ? '#fecaca' : '#bfdbfe';
          const y0 = l.team === 0 ? oy + (ROWS - reach) * cell : oy, h = reach * cell;
          g.fillStyle = col; g.globalAlpha = 0.85; g.fillRect(x + cell * 0.55, y0, cell * 0.9, h); g.globalAlpha = 1;
        });
        flashes.forEach(f => { g.globalAlpha = f.t; g.fillStyle = '#fff'; g.beginPath(); g.arc(ox + (f.c + 0.5) * cell, oy + (f.r + 0.5) * cell, cell * 3 * (1.2 - f.t), 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; });
        shots.forEach(s => { g.fillStyle = s.team ? '#fee2e2' : '#dbeafe'; g.beginPath(); g.arc(ox + s.x * cell, oy + s.y * cell, cell * 0.32, 0, Math.PI * 2); g.fill(); g.fillStyle = s.team ? RED : BLUE; g.beginPath(); g.arc(ox + s.x * cell, oy + s.y * cell, cell * 0.18, 0, Math.PI * 2); g.fill(); });
        saws.forEach(s => {
          const x = ox + s.x * cell, y = oy + s.y * cell, R = cell * 1.3;
          g.save(); g.translate(x, y); g.rotate(performance.now() / 80);
          g.fillStyle = s.team ? '#fca5a5' : '#7dd3fc';
          g.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? R : R * 0.75; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
          g.fillStyle = s.team ? RED : BLUE; g.beginPath(); g.arc(0, 0, R * 0.3, 0, Math.PI * 2); g.fill(); g.restore();
        });
        g.strokeStyle = '#f8fafc'; g.lineWidth = 3; g.strokeRect(ox - 1.5, oy - 1.5, cell * COLS + 3, cell * ROWS + 3);
      }
      function loop(t) {
        const dt = Math.min(2.5, lastT ? (t - lastT) / 16.67 : 1); lastT = t;
        if (!running) return;
        step(dt); render(); hud();
        raf = requestAnimationFrame(loop);
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; lastT = 0; raf = requestAnimationFrame(loop); }
      el.querySelector('.cw-hand').onclick = e => {
        const b = e.target.closest('[data-card]'); if (!b || b.disabled || !running) return;
        sel = sel === b.dataset.card ? null : b.dataset.card; hud();
      };
      cv.addEventListener('pointerdown', e => {
        if (!running || !sel) return;
        const rect = cv.getBoundingClientRect();
        const c = Math.floor((e.clientX - rect.left - ox) / cell), r = Math.floor((e.clientY - rect.top - oy) / cell);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
        const card = CARDS.find(x => x.id === sel);
        if (energy < card.cost) return;
        energy -= card.cost; deploy(0, sel, r, c); sel = null; hud();
      });
      $('[data-go]').onclick = go;
      ctx.finish = end;
      const onResize = () => { size(); render(); };
      window.addEventListener('resize', onResize);
      reset();
      if (ctx.mode === 'duel') go();
      return () => { cancelAnimationFrame(raf); running = false; window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     TERRITÓRIO — estilo paper.io contra robôs
     ===================================================== */
  AH.engines.territorio = {
    mount(el, ctx) {
      const N = 56, MATCH = 120, TICK = 115;
      const BOTS = [['Robô Azul', '#3b82f6'], ['Robô Rosa', '#ec4899'], ['Robô Verde', '#22c55e'], ['Robô Roxo', '#a855f7']];
      el.innerHTML = `<div class="tr">
        <div class="tr-top"><span class="tr-chip"><small>Sua área</small><b data-pct>0%</b></span><span class="tr-chip"><small>Tempo</small><b data-time>2:00</b></span><span class="tr-chip"><small>Posição</small><b data-rank>—</b></span></div>
        <canvas class="tr-canvas" tabindex="0" aria-label="Território. Deslize ou use as setas para mudar de direção."></canvas>
        <div class="hx-overlay" data-overlay><b>Território</b><span>Deslize (ou use as setas) para mudar de direção.<br>Saia da sua área e volte para conquistar o espaço.<br>Não deixe ninguém cortar seu rastro!</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div>
      </div>`;
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, raf, timer, running = false, over = false;
      let own, trail, players, time, acc, lastT, kills, lastHud = 0, dirty = true;
      let glow = []; // [casa, momento da conquista] das conquistas recentes (brilho rápido)
      // O mapa inteiro vira uma imagem N×N que só é refeita quando algo muda; cada quadro apenas a estica na tela.
      const layer = document.createElement('canvas'); layer.width = layer.height = N;
      const lg = layer.getContext('2d'), layerImg = lg.createImageData(N, N);
      const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
      const idx = (r, c) => r * N + c;
      function size() { ({ g, W, H } = fitCanvas(cv, 1.5)); dirty = true; }
      function bake() {
        const d = layerImg.data;
        for (let k = 0; k < N * N; k++) {
          const o = own[k], c = o ? players[o - 1].rgb : (((k / N) | 0) + (k % N)) % 2 ? [238, 242, 247] : [248, 250, 252];
          d[k * 4] = c[0]; d[k * 4 + 1] = c[1]; d[k * 4 + 2] = c[2]; d[k * 4 + 3] = 255;
        }
        lg.putImageData(layerImg, 0, 0);
        dirty = false;
      }
      function spawn(p) {
        for (let tries = 0; tries < 50; tries++) {
          const r = 3 + ((Math.random() * (N - 6)) | 0), c = 3 + ((Math.random() * (N - 6)) | 0);
          let free = true; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (own[idx(r + dr, c + dc)] && own[idx(r + dr, c + dc)] !== p.id) free = false;
          if (!free) continue;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) own[idx(r + dr, c + dc)] = p.id;
          Object.assign(p, { r, c, pr: r, pc: c, dir: ['up', 'down', 'left', 'right'][(Math.random() * 4) | 0], next: null, alive: true, trail: [], out: 6 + ((Math.random() * 10) | 0) });
          dirty = true;
          return;
        }
      }
      function reset() {
        size();
        own = new Int8Array(N * N); trail = new Int8Array(N * N);
        const me = AH.store.user;
        players = [{ id: 1, name: 'Você', color: AH.store.skin('territorio', 'color').fx.color || me?.avatar?.color || '#ff8a3d', me: true }].concat(BOTS.map((b, i) => ({ id: i + 2, name: b[0], color: b[1] })));
        players.forEach(p => { p.rgb = rgbOf(p.color); });
        glow = [];
        if (ctx.opponent) players[1].name = ctx.opponent.username;
        players.forEach(spawn);
        time = MATCH; acc = 0; kills = 0; over = false; hud(); render();
      }
      function kill(p) {
        p.alive = false; dirty = true;
        for (let i = 0; i < N * N; i++) { if (own[i] === p.id) own[i] = 0; if (trail[i] === p.id) trail[i] = 0; }
        p.trail = [];
        if (p.me) return finish();
        setTimeout(() => { if (running) spawn(p); }, 2500);
      }
      // fecha o rastro: tudo que ficou cercado vira do jogador
      function capture(p) {
        p.trail.forEach(i => { own[i] = p.id; trail[i] = 0; });
        p.trail = [];
        const outside = new Uint8Array(N * N), q = [];
        for (let i = 0; i < N; i++) [idx(0, i), idx(N - 1, i), idx(i, 0), idx(i, N - 1)].forEach(k => { if (own[k] !== p.id && !outside[k]) { outside[k] = 1; q.push(k); } });
        while (q.length) {
          const k = q.pop(), r = (k / N) | 0, c = k % N;
          [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
            if (nr < 0 || nc < 0 || nr >= N || nc >= N) return;
            const nk = idx(nr, nc); if (!outside[nk] && own[nk] !== p.id) { outside[nk] = 1; q.push(nk); }
          });
        }
        const t0 = performance.now(); dirty = true;
        for (let k = 0; k < N * N; k++) if (!outside[k] && own[k] !== p.id) {
          glow.push([k, t0]);
          if (trail[k]) { const v = players.find(x => x.id === trail[k]); if (v && v !== p) kill(v); }
          own[k] = p.id;
        }
      }
      const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
      function botThink(p) {
        // casa mais próxima da área do robô (para voltar e fechar o rastro)
        let home = -1, hd = 1e9;
        for (let k = 0; k < N * N; k++) if (own[k] === p.id) { const d = Math.abs(((k / N) | 0) - p.r) + Math.abs((k % N) - p.c); if (d < hd) { hd = d; home = k; } }
        const homeCells = home >= 0 ? [home] : [];
        const outside = own[idx(p.r, p.c)] !== p.id;
        const options = ['up', 'down', 'left', 'right'].filter(d => d !== OPP[p.dir]).filter(d => {
          const [dr, dc] = VEC[d], nr = p.r + dr, nc = p.c + dc;
          return nr >= 1 && nc >= 1 && nr < N - 1 && nc < N - 1 && trail[idx(nr, nc)] !== p.id;
        });
        if (!options.length) return;
        if (outside && p.trail.length > p.out && homeCells.length) {
          const h = homeCells[0], hr = (h / N) | 0, hc = h % N;
          options.sort((a, b) => { const da = Math.abs(p.r + VEC[a][0] - hr) + Math.abs(p.c + VEC[a][1] - hc), db = Math.abs(p.r + VEC[b][0] - hr) + Math.abs(p.c + VEC[b][1] - hc); return da - db; });
          p.dir = options[0];
        } else if (!options.includes(p.dir) || Math.random() < 0.12) p.dir = options[(Math.random() * options.length) | 0];
        if (!outside) p.out = 5 + ((Math.random() * 12) | 0);
      }
      function tick() {
        players.forEach(p => {
          if (!p.alive) return;
          p.pr = p.r; p.pc = p.c;
          if (!p.me) botThink(p);
          else if (p.next && p.next !== OPP[p.dir]) { p.dir = p.next; p.next = null; }
          const [dr, dc] = VEC[p.dir]; const nr = p.r + dr, nc = p.c + dc;
          if (nr < 0 || nc < 0 || nr >= N || nc >= N) return kill(p);
          const k = idx(nr, nc);
          if (trail[k] === p.id) return kill(p);
          if (trail[k]) { const v = players.find(x => x.id === trail[k]); if (v && v.alive) { kill(v); if (p.me) kills++; } }
          p.r = nr; p.c = nc; dirty = true;
          if (own[k] === p.id) { if (p.trail.length) capture(p); }
          else { trail[k] = p.id; p.trail.push(k); }
        });
        // colisão de cabeças: os dois perdem
        for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
          const a = players[i], b = players[j];
          if (a.alive && b.alive && a.r === b.r && a.c === b.c) { kill(a); kill(b); }
        }
      }
      const share = id => { let n = 0; for (let k = 0; k < N * N; k++) if (own[k] === id) n++; return n / (N * N); };
      function hud() {
        const mine = share(1);
        $('[data-pct]').textContent = (mine * 100).toFixed(1) + '%';
        $('[data-time]').textContent = `${Math.floor(Math.max(0, time) / 60)}:${String(Math.ceil(Math.max(0, time)) % 60).padStart(2, '0')}`;
        const rank = 1 + players.filter(p => p.id !== 1 && share(p.id) > mine).length;
        $('[data-rank]').textContent = `${rank}º`;
      }
      function finish() {
        if (over) return; over = true; running = false; clearInterval(timer);
        const me = players[0], mine = share(1), pct = Math.round(mine * 1000) / 10;
        const top = players.every(p => p.id === 1 || share(p.id) <= mine);
        const result = me.alive && top ? 'win' : me.alive ? 'complete' : 'loss';
        render();
        setTimeout(() => ctx.end({ result, score: Math.round(mine * 1000), summary: me.alive ? `${pct}% do mapa${top ? ' · maior território!' : ''}` : `Seu rastro foi cortado · ${pct}% do mapa` }), 500);
      }
      function render() {
        const me = players[0];
        if (dirty) bake();
        const cs = Math.max(14, Math.min(26, Math.min(W, H) / 22));
        const f = running ? Math.min(1, acc / TICK) : 1; // fração do passo atual: move suave entre as casas
        const px = p => (p.pc + (p.c - p.pc) * f) * cs, py = p => (p.pr + (p.r - p.pr) * f) * cs;
        const camX = px(me) - W / 2 + cs / 2, camY = py(me) - H / 2 + cs / 2;
        g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, W, H);
        g.imageSmoothingEnabled = false;
        g.drawImage(layer, -camX, -camY, N * cs, N * cs);
        const now = performance.now();
        if (glow.length) {
          glow = glow.filter(([, t0]) => now - t0 < 600);
          glow.forEach(([k, t0]) => { g.fillStyle = `rgba(255,255,255,${0.55 * (1 - (now - t0) / 600)})`; g.fillRect((k % N) * cs - camX, ((k / N) | 0) * cs - camY, cs + 0.5, cs + 0.5); });
        }
        players.forEach(p => {
          g.globalAlpha = 0.5; g.fillStyle = p.color;
          p.trail.forEach(k => g.fillRect((k % N) * cs - camX + cs * 0.15, ((k / N) | 0) * cs - camY + cs * 0.15, cs * 0.7, cs * 0.7));
          g.globalAlpha = 1;
        });
        g.strokeStyle = '#94a3b8'; g.lineWidth = 3; g.strokeRect(-camX, -camY, N * cs, N * cs);
        players.forEach(p => {
          if (!p.alive) return;
          const x = px(p) - camX, y = py(p) - camY;
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 2, y + 4, cs, cs);
          g.fillStyle = p.color; g.fillRect(x - 1, y - 1, cs + 2, cs + 2);
          g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y, cs, cs * 0.3);
          g.fillStyle = '#fff'; g.beginPath(); g.arc(x + cs * 0.32, y + cs * 0.45, cs * 0.14, 0, 7); g.arc(x + cs * 0.68, y + cs * 0.45, cs * 0.14, 0, 7); g.fill();
          g.font = `700 ${Math.round(cs * 0.6)}px Fredoka, sans-serif`; g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(p.name, x + cs / 2, y - cs * 0.35); g.fillStyle = '#1e293b'; g.fillText(p.name, x + cs / 2, y - cs * 0.35);
        });
      }
      function loop(t) {
        if (!running) return;
        const dt = lastT ? t - lastT : 16; lastT = t;
        time -= dt / 1000; acc += Math.min(dt, 120); // aba em segundo plano não pode disparar dezenas de passos de uma vez
        while (acc >= TICK && running) { acc -= TICK; tick(); }
        if (time <= 0) return finish();
        render();
        if (t - lastHud > 250) { lastHud = t; hud(); }
        raf = requestAnimationFrame(loop);
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; lastT = 0; raf = requestAnimationFrame(loop); cv.focus({ preventScroll: true }); }
      const turn = d => { if (running) players[0].next = d; };
      onSwipe(cv, turn);
      const onKey = e => { if (isModalOpen()) return; const d = KEYDIR[e.key]; if (d && running) { e.preventDefault(); turn(d); } };
      document.addEventListener('keydown', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = finish;
      const onResize = () => { size(); render(); };
      window.addEventListener('resize', onResize);
      reset();
      if (ctx.mode === 'duel') go();
      return () => { cancelAnimationFrame(raf); clearInterval(timer); running = false; document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    }
  };
})();
