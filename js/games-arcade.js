/* =========================================================
   Jogos de ação: Snake, Pássaro Saltitante, Pong, Blocos Caindo
   e Cálculo Rápido. Mesmo contrato dos outros motores:
   AH.engines[id].mount(el, ctx) -> cleanup.
   Nos duelos de "corrida" (ctx.mode === 'duel') a partida começa
   sozinha e ctx.finish() encerra quando o tempo do duelo acabar.
   ========================================================= */
(function () {
  const { ic, esc, fmt } = AH.ui;
  const isModalOpen = () => document.getElementById('modalRoot').classList.contains('open');
  const best0 = id => AH.store.user?.stats[id]?.best || 0;
  const VEC = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
  const accentOf = id => AH.store.skin(id, 'theme').fx.accent || null;
  const tint = (g, W, H, acc, a = 0.16) => { if (!acc) return; g.globalAlpha = a; g.fillStyle = acc; g.fillRect(0, 0, W, H); g.globalAlpha = 1; };
  const OPP = { left: 'right', right: 'left', up: 'down', down: 'up' };
  const KEYDIR = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
  const rnd = n => (Math.random() * n) | 0;

  function fitCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, W, H };
  }
  function onSwipe(target, cb) {
    let sx = null, sy = null;
    target.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
    target.addEventListener('pointerup', e => {
      if (sx == null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    });
  }
  // Moldura comum: placar no topo, canvas e tela inicial
  const shell = (name, help, id, ratio = 1) => `<div class="ar" style="--ratio:${ratio}">
    <div class="ar-top"><span class="tr-chip"><small>Pontos</small><b data-score>0</b></span><span class="tr-chip"><small>Recorde</small><b>${fmt(best0(id))}</b></span></div>
    <canvas class="ar-canvas" tabindex="0" aria-label="${esc(name)}"></canvas>
    <div class="hx-overlay" data-overlay><b>${esc(name)}</b><span>${help}</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div></div>`;

  /* =====================================================
     SNAKE
     ===================================================== */
  AH.engines.snake = {
    mount(el, ctx) {
      const N = 20, duel = ctx.mode === 'duel';
      const sk = AH.store.skin('snake', 'skin').fx, fd = AH.store.skin('snake', 'food').fx;
      el.innerHTML = shell('Snake', 'Deslize (ou use as setas) para guiar a cobrinha.<br>As paredes são portais: saia de um lado e volte pelo outro.<br>Coma as frutas e não bata em você mesma!', 'snake');
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, cell, snake, dir, nextDir, food, score, timer, running = false, over = false;
      const size = () => { ({ g, W, H } = fitCanvas(cv)); cell = W / N; };
      const hit = (r, c, skipTail) => snake.some((p, i) => p[0] === r && p[1] === c && !(skipTail && i === snake.length - 1));
      function placeFood() { do { food = [rnd(N), rnd(N)]; } while (hit(food[0], food[1])); }
      function reset() {
        size(); snake = [[10, 10], [10, 9], [10, 8]]; dir = nextDir = 'right'; score = 0; over = false; placeFood();
        $('[data-score]').textContent = '0'; draw();
      }
      const delay = () => Math.max(65, 135 - score * 0.35);
      function step() {
        if (!running) return;
        dir = nextDir;
        const [dr, dc] = VEC[dir], r = (snake[0][0] + dr + N) % N, c = (snake[0][1] + dc + N) % N; // sai por um lado e volta pelo outro
        const eat = r === food[0] && c === food[1];
        if (hit(r, c, !eat)) return die();
        snake.unshift([r, c]);
        if (eat) { score += 10; $('[data-score]').textContent = fmt(score); placeFood(); } else snake.pop();
        draw();
        timer = setTimeout(step, delay());
      }
      function summary() { return `${score / 10} fruta${score === 10 ? '' : 's'} · ${fmt(score)} pontos`; }
      function die() {
        running = false; over = true; draw(true);
        if (navigator.vibrate) navigator.vibrate(60);
        setTimeout(() => ctx.end({ result: 'complete', score, summary: summary() }), 600);
      }
      function draw(dead) {
        for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { g.fillStyle = (r + c) % 2 ? '#a7d96c' : '#b5e47a'; g.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5); }
        tint(g, W, H, accentOf('snake'), 0.28);
        g.font = `${Math.round(cell * 0.85)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(fd.emoji || '🍎', (food[1] + 0.5) * cell, (food[0] + 0.55) * cell);
        const len = snake.length;
        for (let i = len - 1; i >= 0; i--) {
          const [r, c] = snake[i], t = len > 1 ? i / (len - 1) : 0;
          g.fillStyle = sk.rainbow ? `hsl(${(i * 24) % 360} 80% 55%)` : mixHex(sk.a || '#22a45d', sk.b || '#5bd18b', t);
          if (dead) g.globalAlpha = 0.55;
          const pad = cell * (i === 0 ? 0.04 : 0.1), x = c * cell + pad, y = r * cell + pad, s = cell - pad * 2;
          g.beginPath(); g.roundRect(x, y, s, s, cell * 0.28); g.fill(); g.globalAlpha = 1;
        }
        const [hr, hc] = snake[0], [dr, dc] = VEC[dir], cx = (hc + 0.5) * cell, cy = (hr + 0.5) * cell;
        g.fillStyle = '#fff';
        [-1, 1].forEach(sgn => { g.beginPath(); g.arc(cx + dc * cell * 0.15 - dr * sgn * cell * 0.22, cy + dr * cell * 0.15 + dc * sgn * cell * 0.22, cell * 0.13, 0, 7); g.fill(); });
        g.fillStyle = '#1e293b';
        [-1, 1].forEach(sgn => { g.beginPath(); g.arc(cx + dc * cell * 0.2 - dr * sgn * cell * 0.22, cy + dr * cell * 0.2 + dc * sgn * cell * 0.22, cell * 0.06, 0, 7); g.fill(); });
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; timer = setTimeout(step, 300); cv.focus({ preventScroll: true }); }
      const turn = d => { if (running && d !== OPP[dir]) nextDir = d; };
      onSwipe(cv, turn);
      const onKey = e => { if (isModalOpen()) return; const d = KEYDIR[e.key]; if (d) { e.preventDefault(); turn(d); } };
      document.addEventListener('keydown', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (over) return; over = true; running = false; clearTimeout(timer); ctx.end({ result: 'complete', score, summary: summary() }); };
      const onResize = () => { size(); if (snake) draw(over); };
      window.addEventListener('resize', onResize);
      reset();
      if (duel) go();
      return () => { running = false; clearTimeout(timer); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    }
  };
  function mixHex(a, b, t) {
    const h = x => [1, 3, 5].map(k => parseInt(x.slice(k, k + 2), 16)), A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  /* =====================================================
     PÁSSARO SALTITANTE
     ===================================================== */
  AH.engines.flappy = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      const bird = AH.store.skin('flappy', 'bird').fx.color || '#fde047', sky = AH.store.skin('flappy', 'sky').fx;
      el.innerHTML = shell('Pássaro Saltitante', 'Toque (ou use espaço/seta para cima) para bater as asas.<br>Passe entre os canos sem encostar!', 'flappy', 0.75);
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, raf, running = false, over = false, lastT = 0;
      let y, vy, pipes, score, spawnIn, scroll;
      const R = () => W * 0.045, GAP = () => H * 0.27, SPEED = () => W * 0.0042;
      const size = () => { ({ g, W, H } = fitCanvas(cv)); };
      function reset() { size(); y = H * 0.45; vy = 0; pipes = []; score = 0; spawnIn = 40; scroll = 0; over = false; $('[data-score]').textContent = '0'; draw(); }
      function flap() { if (running) vy = -H * 0.0105; }
      function step(dt) {
        vy += H * 0.00052 * dt; y += vy * dt; scroll += SPEED() * dt;
        spawnIn -= dt;
        if (spawnIn <= 0) { spawnIn = 95; pipes.push({ x: W + 20, top: H * 0.12 + Math.random() * (H - GAP() - H * 0.3), passed: false }); }
        pipes.forEach(p => { p.x -= SPEED() * dt; });
        pipes = pipes.filter(p => p.x > -W * 0.2);
        const r = R(), bx = W * 0.28;
        if (y + r > H * 0.93 || y - r < 0) return die();
        for (const p of pipes) {
          const pw = W * 0.16;
          if (bx + r > p.x && bx - r < p.x + pw && (y - r < p.top || y + r > p.top + GAP())) return die();
          if (!p.passed && p.x + pw < bx) { p.passed = true; score++; $('[data-score]').textContent = fmt(score); }
        }
      }
      function die() {
        running = false; over = true; draw();
        if (navigator.vibrate) navigator.vibrate(60);
        setTimeout(() => ctx.end({ result: 'complete', score, summary: `${score} cano${score === 1 ? '' : 's'}` }), 600);
      }
      function draw() {
        const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, (sky.bg || ['#7dd3fc', '#e0f2fe'])[0]); bg.addColorStop(1, (sky.bg || ['#7dd3fc', '#e0f2fe'])[1]);
        g.fillStyle = bg; g.fillRect(0, 0, W, H); tint(g, W, H, accentOf('flappy'), 0.22);
        if (sky.night) { g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 24; i++) g.fillRect((i * 97 + 13) % W, (i * 53 + 7) % (H * 0.8), 2, 2); }
        else { g.fillStyle = 'rgba(255,255,255,.7)'; [[0.2, 0.15], [0.65, 0.28], [0.9, 0.1]].forEach(([a, b], i) => { const x = ((a * W - scroll * 0.2 * (i + 1)) % (W + 120) + W + 120) % (W + 120) - 60; g.beginPath(); g.ellipse(x, b * H, 38, 16, 0, 0, 7); g.fill(); }); }
        const pw = W * 0.16;
        pipes.forEach(p => {
          g.fillStyle = '#22a45d'; g.fillRect(p.x, 0, pw, p.top); g.fillRect(p.x, p.top + GAP(), pw, H);
          g.fillStyle = '#16813f'; g.fillRect(p.x - 4, p.top - 22, pw + 8, 22); g.fillRect(p.x - 4, p.top + GAP(), pw + 8, 22);
          g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(p.x + 6, 0, 6, p.top - 22); g.fillRect(p.x + 6, p.top + GAP() + 22, 6, H);
        });
        g.fillStyle = '#d9a441'; g.fillRect(0, H * 0.93, W, H * 0.07);
        g.fillStyle = '#7bc043'; g.fillRect(0, H * 0.93, W, 8);
        const r = R(), bx = W * 0.28;
        g.save(); g.translate(bx, y); g.rotate(Math.max(-0.5, Math.min(1.1, vy / (H * 0.02))));
        g.fillStyle = bird; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.beginPath(); g.ellipse(-r * 0.25, r * 0.25, r * 0.6, r * 0.4, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(r * 0.35, -r * 0.25, r * 0.34, 0, 7); g.fill();
        g.fillStyle = '#1e293b'; g.beginPath(); g.arc(r * 0.45, -r * 0.25, r * 0.15, 0, 7); g.fill();
        g.fillStyle = '#f97316'; g.beginPath(); g.moveTo(r * 0.8, -r * 0.05); g.lineTo(r * 1.5, r * 0.15); g.lineTo(r * 0.8, r * 0.4); g.fill();
        g.restore();
      }
      function loop(t) {
        if (!running) return;
        const dt = Math.min(2.4, lastT ? (t - lastT) / 16.67 : 1); lastT = t;
        step(dt); if (running) { draw(); raf = requestAnimationFrame(loop); }
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; lastT = 0; vy = -H * 0.008; raf = requestAnimationFrame(loop); cv.focus({ preventScroll: true }); }
      cv.addEventListener('pointerdown', e => { e.preventDefault(); flap(); });
      const onKey = e => { if (isModalOpen()) return; if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); flap(); } };
      document.addEventListener('keydown', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (over) return; over = true; running = false; cancelAnimationFrame(raf); ctx.end({ result: 'complete', score, summary: `${score} canos` }); };
      const onResize = () => { size(); if (pipes) draw(); };
      window.addEventListener('resize', onResize);
      reset();
      if (duel) go();
      return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     PONG — contra a CPU, primeiro a 5 pontos
     ===================================================== */
  AH.engines.pong = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel', opp = ctx.opponent?.username || 'CPU', WIN = 5;
      const pc = AH.store.skin('pong', 'paddle').fx.color || '#ffffff', bc = AH.store.skin('pong', 'ball').fx.color || '#ffffff';
      el.innerHTML = `<div class="ar" style="--ratio:0.75">
        <div class="ar-top"><span class="tr-chip"><small>${esc(opp)}</small><b data-cpu>0</b></span><span class="tr-chip"><small>Você</small><b data-me>0</b></span></div>
        <canvas class="ar-canvas" tabindex="0" aria-label="Pong. Arraste ou use as setas para mover a raquete."></canvas>
        <div class="hx-overlay" data-overlay><b>Pong</b><span>Arraste (ou use ← →) para mover sua raquete, embaixo.<br>O primeiro a marcar ${WIN} pontos vence.</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div></div>`;
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, raf, running = false, over = false, lastT = 0, me, cpu, px, cx, ball, serve = 0;
      const PW = () => W * 0.22, PH = () => H * 0.02, PAD = () => H * 0.05;
      const diff = [0.55, 0.75, 0.95][ctx.difficulty ?? 1] || 0.75;
      const size = () => { ({ g, W, H } = fitCanvas(cv)); };
      function launch(dir) { const a = (Math.random() * 0.8 - 0.4); ball = { x: W / 2, y: H / 2, vx: Math.sin(a) * H * 0.0075, vy: dir * Math.cos(a) * H * 0.0075 }; serve = 40; }
      function reset() { size(); me = cpu = 0; px = cx = W / 2; launch(1); over = false; hud(); draw(); }
      function hud() { $('[data-me]').textContent = me; $('[data-cpu]').textContent = cpu; }
      function point(mine) {
        if (mine) me++; else cpu++;
        hud();
        if (me >= WIN || cpu >= WIN) return finish();
        launch(mine ? -1 : 1);
      }
      function finish() {
        running = false; over = true; draw();
        const res = me > cpu ? 'win' : 'loss';
        setTimeout(() => ctx.end({ result: res, summary: `${me} × ${cpu} contra ${opp}` }), 500);
      }
      function step(dt) {
        if (serve > 0) { serve -= dt; } else {
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          const br = W * 0.02;
          if (ball.x < br || ball.x > W - br) { ball.vx *= -1; ball.x = Math.max(br, Math.min(W - br, ball.x)); }
          // raquete do jogador (embaixo) e da CPU (em cima)
          const by = H - PAD() - PH(), ty = PAD();
          if (ball.vy > 0 && ball.y + br >= by && ball.y - br <= by + PH() && Math.abs(ball.x - px) < PW() / 2 + br) {
            ball.vy = -Math.min(H * 0.017, Math.abs(ball.vy) * 1.06); ball.vx += ((ball.x - px) / (PW() / 2)) * H * 0.006; ball.y = by - br;
          }
          if (ball.vy < 0 && ball.y - br <= ty + PH() && ball.y + br >= ty && Math.abs(ball.x - cx) < PW() / 2 + br) {
            ball.vy = Math.min(H * 0.017, Math.abs(ball.vy) * 1.06); ball.vx += ((ball.x - cx) / (PW() / 2)) * H * 0.006; ball.y = ty + PH() + br;
          }
          const lim = H * 0.0125; ball.vx = Math.max(-lim, Math.min(lim, ball.vx));
          if (ball.y < 0) return point(true);
          if (ball.y > H) return point(false);
        }
        // CPU persegue a bola com velocidade limitada (erra um pouco)
        const target = ball.vy < 0 ? ball.x : W / 2, sp = W * 0.0056 * diff * dt;
        cx += Math.max(-sp, Math.min(sp, target - cx));
        cx = Math.max(PW() / 2, Math.min(W - PW() / 2, cx));
        const kd = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
        if (kd) px = Math.max(PW() / 2, Math.min(W - PW() / 2, px + kd * W * 0.0105 * dt));
      }
      function draw() {
        g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, H); tint(g, W, H, accentOf('pong'), 0.3);
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.setLineDash([10, 12]); g.lineWidth = 3; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#ef4565'; g.beginPath(); g.roundRect(cx - PW() / 2, PAD(), PW(), PH(), PH() / 2); g.fill();
        g.fillStyle = pc; g.beginPath(); g.roundRect(px - PW() / 2, H - PAD() - PH(), PW(), PH(), PH() / 2); g.fill();
        if (ball) { g.fillStyle = bc; g.beginPath(); g.arc(ball.x, ball.y, W * 0.02, 0, 7); g.fill(); }
      }
      const keys = new Set();
      function loop(t) {
        if (!running) return;
        const dt = Math.min(2.4, lastT ? (t - lastT) / 16.67 : 1); lastT = t;
        step(dt); if (running) { draw(); raf = requestAnimationFrame(loop); }
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; lastT = 0; raf = requestAnimationFrame(loop); cv.focus({ preventScroll: true }); }
      const move = e => { if (!running) return; const r = cv.getBoundingClientRect(); px = Math.max(PW() / 2, Math.min(W - PW() / 2, (e.clientX - r.left) / r.width * W)); };
      cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
      const onKey = e => { if (isModalOpen() || !['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) return; e.preventDefault(); e.type === 'keydown' ? keys.add(e.key) : keys.delete(e.key); };
      document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (!over) { over = true; running = false; cancelAnimationFrame(raf); ctx.end({ result: me > cpu ? 'win' : 'loss', summary: `${me} × ${cpu}` }); } };
      const onResize = () => { size(); if (ball) draw(); };
      window.addEventListener('resize', onResize);
      reset();
      if (duel) go();
      return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     BLOCOS CAINDO
     ===================================================== */
  const PIECES = [
    [[1, 1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 1], [1, 1, 0]], [[0, 1, 0], [1, 1, 1]], [[1, 1, 0], [0, 1, 1]]
  ];
  const TCOLORS = ['#06b6d4', '#3b82f6', '#f59e0b', '#eab308', '#22c55e', '#a855f7', '#ef4444'];
  AH.engines.tetra = {
    mount(el, ctx) {
      const C = 10, R = 20, duel = ctx.mode === 'duel';
      const pal = AH.store.skin('tetra', 'blocks').fx.pal || TCOLORS;
      el.innerHTML = `<div class="ar tt" style="--ratio:0.5">
        <div class="ar-top"><span class="tr-chip"><small>Pontos</small><b data-score>0</b></span><span class="tr-chip"><small>Nível</small><b data-lv>1</b></span><span class="tr-chip"><small>Linhas</small><b data-lines>0</b></span></div>
        <canvas class="ar-canvas" tabindex="0" aria-label="Blocos Caindo. Setas movem, seta para cima gira."></canvas>
        <div class="hx-overlay" data-overlay><b>Blocos Caindo</b><span>← → movem · ↑ gira · ↓ acelera · espaço derruba.<br>Complete linhas para pontuar.</span><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div></div>
        <div class="tt-pad" aria-label="Controles">
          <button class="btn" data-k="left" aria-label="Esquerda">${ic('arrow-left')}</button><button class="btn" data-k="rot" aria-label="Girar">${ic('rotate-cw')}</button><button class="btn" data-k="right" aria-label="Direita">${ic('arrow-right')}</button><button class="btn" data-k="down" aria-label="Descer">${ic('arrow-down')}</button><button class="btn btn-primary" data-k="drop" aria-label="Derrubar">${ic('chevrons-down')}</button>
        </div>`;
      const cv = el.querySelector('canvas'), $ = s => el.querySelector(s);
      let g, W, H, cs, board, cur, next, score, lines, level, timer, running = false, over = false;
      const size = () => { ({ g, W, H } = fitCanvas(cv)); cs = W / C; };
      const bag = []; const take = () => { if (!bag.length) { bag.push(0, 1, 2, 3, 4, 5, 6); bag.sort(() => Math.random() - 0.5); } return bag.pop(); };
      const mk = k => ({ k, m: PIECES[k].map(r => r.slice()), r: 0, c: Math.floor((C - PIECES[k][0].length) / 2) });
      const fits = (m, r, c) => m.every((row, i) => row.every((v, j) => !v || (r + i >= 0 && r + i < R && c + j >= 0 && c + j < C && !board[r + i][c + j] && true)));
      const rot = m => m[0].map((_, j) => m.map(row => row[j]).reverse());
      function reset() { size(); board = Array.from({ length: R }, () => Array(C).fill(0)); score = 0; lines = 0; level = 1; over = false; next = mk(take()); spawn(); hud(); draw(); }
      function spawn() { cur = next; next = mk(take()); if (!fits(cur.m, cur.r, cur.c)) die(); }
      function hud() { $('[data-score]').textContent = fmt(score); $('[data-lv]').textContent = level; $('[data-lines]').textContent = lines; }
      const delay = () => Math.max(90, 700 - (level - 1) * 55);
      function tick() { if (!running) return; if (!move(1, 0)) lock(); timer = setTimeout(tick, delay()); }
      function move(dr, dc) { if (!running) return false; if (fits(cur.m, cur.r + dr, cur.c + dc)) { cur.r += dr; cur.c += dc; draw(); return true; } return false; }
      function rotate() {
        if (!running) return; const m = rot(cur.m);
        for (const k of [0, -1, 1, -2, 2]) if (fits(m, cur.r, cur.c + k)) { cur.m = m; cur.c += k; draw(); return; }
      }
      function lock() {
        cur.m.forEach((row, i) => row.forEach((v, j) => { if (v && cur.r + i >= 0) board[cur.r + i][cur.c + j] = cur.k + 1; }));
        let cleared = 0;
        for (let r = R - 1; r >= 0; r--) if (board[r].every(Boolean)) { board.splice(r, 1); board.unshift(Array(C).fill(0)); cleared++; r++; }
        if (cleared) { score += [0, 100, 300, 500, 800][cleared] * level; lines += cleared; level = 1 + Math.floor(lines / 10); }
        score += 4; hud(); spawn(); draw();
      }
      function drop() { if (!running) return; let n = 0; while (fits(cur.m, cur.r + 1, cur.c)) { cur.r++; n++; } score += n * 2; lock(); clearTimeout(timer); if (running) timer = setTimeout(tick, delay()); }
      function die() {
        running = false; over = true; clearTimeout(timer); draw(true);
        setTimeout(() => ctx.end({ result: 'complete', score, extra: { lines }, summary: `${lines} linha${lines === 1 ? '' : 's'} · nível ${level}` }), 600);
      }
      function block(x, y, color, a = 1) {
        g.globalAlpha = a; g.fillStyle = color; g.beginPath(); g.roundRect(x + 1, y + 1, cs - 2, cs - 2, cs * 0.18); g.fill();
        g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x + 3, y + 3, cs - 6, cs * 0.22); g.globalAlpha = 1;
      }
      function draw(dead) {
        g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, H); tint(g, W, H, accentOf('tetra'), 0.3);
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
        for (let i = 1; i < C; i++) { g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, H); g.stroke(); }
        for (let i = 1; i < R; i++) { g.beginPath(); g.moveTo(0, i * cs); g.lineTo(W, i * cs); g.stroke(); }
        board.forEach((row, r) => row.forEach((v, c) => v && block(c * cs, r * cs, dead ? '#64748b' : pal[v - 1])));
        if (cur && !dead) {
          let gr = cur.r; while (fits(cur.m, gr + 1, cur.c)) gr++;
          cur.m.forEach((row, i) => row.forEach((v, j) => v && block((cur.c + j) * cs, (gr + i) * cs, pal[cur.k], 0.22)));
          cur.m.forEach((row, i) => row.forEach((v, j) => v && block((cur.c + j) * cs, (cur.r + i) * cs, pal[cur.k])));
        }
      }
      function go() { $('[data-overlay]').hidden = true; reset(); running = true; timer = setTimeout(tick, delay()); cv.focus({ preventScroll: true }); }
      const act = { left: () => move(0, -1), right: () => move(0, 1), down: () => { if (move(1, 0)) { score += 1; hud(); } }, rot: rotate, drop };
      const onKey = e => {
        if (isModalOpen()) return;
        const m = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowDown: 'down', s: 'down', ArrowUp: 'rot', w: 'rot', ' ': 'drop' }[e.key];
        if (m) { e.preventDefault(); act[m](); }
      };
      document.addEventListener('keydown', onKey);
      el.querySelector('.tt-pad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) act[b.dataset.k](); });
      // gestos no tabuleiro: toque gira, arrastar move/desce
      let sx = 0, sy = 0, lx = 0, moved = false;
      cv.addEventListener('pointerdown', e => { sx = lx = e.clientX; sy = e.clientY; moved = false; });
      cv.addEventListener('pointermove', e => {
        if (e.buttons === 0 && e.pointerType === 'mouse') return;
        const step = cs * 0.9;
        while (e.clientX - lx > step) { act.right(); lx += step; moved = true; }
        while (lx - e.clientX > step) { act.left(); lx -= step; moved = true; }
      });
      cv.addEventListener('pointerup', e => {
        if (e.clientY - sy > cs * 3 && Math.abs(e.clientX - sx) < cs * 2) return act.drop();
        if (!moved && Math.abs(e.clientY - sy) < 10) act.rot();
      });
      $('[data-go]').onclick = go;
      ctx.finish = () => { if (over) return; over = true; running = false; clearTimeout(timer); ctx.end({ result: 'complete', score, extra: { lines }, summary: `${lines} linhas` }); };
      const onResize = () => { size(); if (board) draw(over); };
      window.addEventListener('resize', onResize);
      reset();
      if (duel) go();
      return () => { running = false; clearTimeout(timer); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     CÁLCULO RÁPIDO — 60 segundos
     ===================================================== */
  AH.engines.calculo = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel', TIME = 60;
      el.innerHTML = `<div class="score-row">
          <div class="score-box"><small>Pontos</small><b data-score>0</b></div>
          <div class="score-box"><small>Tempo</small><b data-time>${TIME}</b></div>
          <div class="score-box"><small>Sequência</small><b data-streak>0</b></div></div>
        <div class="game-surface cq">
          <div class="progress sm" style="margin-bottom:18px"><span data-bar style="width:100%"></span></div>
          <div class="cq-q" data-q aria-live="polite">—</div>
          <div class="cq-opts" data-opts></div>
          <div class="hx-overlay" data-overlay><b>Cálculo Rápido</b><span>Resolva o máximo de contas em ${TIME} segundos.<br>Acertos em sequência valem mais pontos!</span><small>Recorde: ${fmt(best0('calculo'))}</small><button class="btn btn-primary btn-lg" data-go>${ic('play')} Começar</button></div>
        </div>`;
      const $ = s => el.querySelector(s);
      let score, streak, left, timer, ans, running = false, over = false, asked, right;
      const pick = (a, b) => a + rnd(b - a + 1);
      function question() {
        const lvl = Math.min(4, Math.floor(asked / 5));
        const k = rnd(lvl >= 2 ? 4 : 3);
        let a, b, text, v;
        if (k === 0) { a = pick(2, 12 + lvl * 12); b = pick(2, 12 + lvl * 12); v = a + b; text = `${a} + ${b}`; }
        else if (k === 1) { a = pick(5, 20 + lvl * 15); b = pick(2, a); v = a - b; text = `${a} − ${b}`; }
        else if (k === 2) { a = pick(2, 9 + lvl); b = pick(2, 9 + lvl); v = a * b; text = `${a} × ${b}`; }
        else { b = pick(2, 9); v = pick(2, 10 + lvl * 2); a = b * v; text = `${a} ÷ ${b}`; }
        const set = new Set([v]);
        while (set.size < 4) { const d = v + (rnd(2) ? 1 : -1) * pick(1, Math.max(3, Math.round(v * 0.25))); if (d >= 0 && d !== v) set.add(d); }
        ans = v; asked++;
        $('[data-q]').textContent = text + ' = ?';
        $('[data-opts]').innerHTML = [...set].sort(() => Math.random() - 0.5).map(o => `<button class="btn btn-lg cq-opt" data-v="${o}">${o}</button>`).join('');
      }
      function hud() { $('[data-score]').textContent = fmt(score); $('[data-streak]').textContent = streak; $('[data-time]').textContent = Math.max(0, Math.ceil(left)); $('[data-bar]').style.width = Math.max(0, left / TIME * 100) + '%'; }
      function answer(v, btn) {
        if (!running) return;
        if (v === ans) { streak++; right++; score += 10 + Math.min(20, streak * 2); btn.classList.add('ok'); }
        else { streak = 0; left = Math.max(0, left - 2); btn.classList.add('bad'); }
        hud();
        setTimeout(() => { if (running) question(); }, 160);
      }
      function finish() {
        if (over) return; over = true; running = false; clearInterval(timer);
        $('[data-opts]').innerHTML = '';
        ctx.end({ result: 'complete', score, extra: { right }, summary: `${right} acerto${right === 1 ? '' : 's'}` });
      }
      function go() {
        $('[data-overlay]').hidden = true; score = 0; streak = 0; left = TIME; asked = 0; right = 0; over = false; running = true;
        let last = Date.now();
        question(); hud();
        timer = setInterval(() => { const now = Date.now(); left -= (now - last) / 1000; last = now; hud(); if (left <= 0) finish(); }, 200);
      }
      $('[data-opts]').onclick = e => { const b = e.target.closest('[data-v]'); if (b) answer(+b.dataset.v, b); };
      const onKey = e => { if (isModalOpen() || !running) return; const n = +e.key; if (n >= 1 && n <= 4) { const b = $('[data-opts]').children[n - 1]; if (b) b.click(); } };
      document.addEventListener('keydown', onKey);
      $('[data-go]').onclick = go;
      ctx.finish = finish;
      if (duel) go();
      return () => { running = false; clearInterval(timer); document.removeEventListener('keydown', onKey); };
    }
  };
})();
