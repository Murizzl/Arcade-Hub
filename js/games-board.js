/* =========================================================
   Jogos de tabuleiro e puzzle (lote 1): Campo Minado, Quebra-cabeça
   Deslizante, Apaga Luzes, Conecta 4, Vinte e Um, Damas, Batalha Naval
   e Kakuro. Mesmo contrato dos outros motores.
   Nos jogos de confronto direto o adversário é sempre a CPU.
   ========================================================= */
(function () {
  const { ic, esc, fmt } = AH.ui;
  const isModalOpen = () => document.getElementById('modalRoot').classList.contains('open');
  const rnd = n => (Math.random() * n) | 0;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const diffTabs = (names, cur) => `<div class="tabs" role="tablist" aria-label="Dificuldade" style="margin-bottom:14px">${names.map((n, i) => `<button class="tab ${i === cur ? 'active' : ''}" role="tab" aria-selected="${i === cur}" data-diff="${i}">${n}</button>`).join('')}</div>`;
  const bindDiff = (el, set) => el.querySelectorAll('[data-diff]').forEach(t => t.onclick = () => {
    el.querySelectorAll('[data-diff]').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
    set(+t.dataset.diff);
  });
  const clock = (el, sel = '[data-time]') => {
    let t0 = Date.now(), id = null;
    const secs = () => Math.floor((Date.now() - t0) / 1000);
    const draw = () => { const n = el.querySelector(sel); if (n) n.textContent = secs(); };
    return { start() { t0 = Date.now(); clearInterval(id); draw(); id = setInterval(draw, 500); }, stop() { clearInterval(id); draw(); return secs(); }, secs };
  };

  /* =====================================================
     CAMPO MINADO
     ===================================================== */
  const MS = [{ n: 'Fácil', r: 8, c: 8, m: 10 }, { n: 'Médio', r: 10, c: 10, m: 18 }, { n: 'Difícil', r: 12, c: 12, m: 34 }];
  AH.engines.minado = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      let tier = duel ? (ctx.difficulty ?? 0) : 0, cells, started, over, flagMode = false, press = null;
      const clk = clock(el);
      el.innerHTML = `${duel ? '' : diffTabs(MS.map(x => x.n), tier)}
        <div class="score-row"><div class="score-box"><small>Minas</small><b data-mines>0</b></div><div class="score-box"><small>Tempo</small><b data-time>0</b></div>
          <button class="btn" data-flag aria-pressed="false" aria-label="Modo bandeira">${ic('flag')}</button><button class="btn" data-restart aria-label="Reiniciar">${ic('rotate-ccw')}</button></div>
        <div class="game-surface"><div class="ms-grid" role="grid" aria-label="Campo minado"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Toque para abrir · segure (ou use o botão de bandeira) para marcar uma mina.</p>`;
      const grid = el.querySelector('.ms-grid'), $ = s => el.querySelector(s);
      const T = () => MS[tier];
      const nb = i => { const { r, c } = T(), y = (i / c) | 0, x = i % c, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if ((dy || dx) && y + dy >= 0 && y + dy < r && x + dx >= 0 && x + dx < c) out.push((y + dy) * c + x + dx); } return out; };
      function start() {
        clk.stop(); over = false; started = false;
        cells = Array.from({ length: T().r * T().c }, () => ({ m: false, n: 0, open: false, flag: false }));
        $('[data-time]').textContent = '0'; draw();
      }
      function place(safe) {
        const ban = new Set([safe, ...nb(safe)]), pool = cells.map((_, i) => i).filter(i => !ban.has(i));
        shuffle(pool).slice(0, T().m).forEach(i => { cells[i].m = true; });
        cells.forEach((cl, i) => { cl.n = nb(i).filter(j => cells[j].m).length; });
      }
      function draw() {
        grid.style.setProperty('--c', T().c);
        grid.innerHTML = cells.map((cl, i) => {
          let cls = 'ms-c', txt = '';
          if (cl.open) { cls += ' open' + (cl.m ? ' boom' : ''); txt = cl.m ? '✹' : cl.n ? `<b class="n${cl.n}">${cl.n}</b>` : ''; }
          else if (over && cl.m) { cls += ' open mine'; txt = '✹'; }
          else if (cl.flag) { cls += ' flag'; txt = '⚑'; }
          return `<button class="${cls}" data-i="${i}" role="gridcell" aria-label="Casa ${i + 1}">${txt}</button>`;
        }).join('');
        $('[data-mines]').textContent = T().m - cells.filter(x => x.flag).length;
      }
      function open(i) {
        if (over || cells[i].flag || cells[i].open) return;
        if (!started) { started = true; place(i); clk.start(); }
        const q = [i];
        while (q.length) {
          const k = q.pop(), cl = cells[k];
          if (cl.open || cl.flag) continue;
          cl.open = true;
          if (cl.m) return lose(k);
          if (!cl.n) nb(k).forEach(j => { if (!cells[j].open) q.push(j); });
        }
        draw();
        if (cells.every(cl => cl.open || cl.m)) win();
      }
      function toggleFlag(i) { if (over || cells[i].open) return; cells[i].flag = !cells[i].flag; if (navigator.vibrate) navigator.vibrate(15); draw(); }
      function lose() {
        over = true; const s = clk.stop(); draw();
        setTimeout(() => ctx.end({ result: 'loss', summary: `Você pisou numa mina · ${s}s` }), 700);
      }
      function win() {
        over = true; const s = clk.stop(); cells.forEach(c => { if (c.m) c.flag = true; }); draw();
        setTimeout(() => ctx.end({ result: 'win', score: s, extra: { tier }, summary: `${T().n} em ${s}s` }), 600);
      }
      grid.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        if (e.button === 2) { toggleFlag(+b.dataset.i); press = null; return; }
        const p = press = { i: +b.dataset.i, long: false };
        p.t = setTimeout(() => { p.long = true; toggleFlag(p.i); }, 380);
      });
      const endPress = e => { if (!press) return; clearTimeout(press.t); const p = press; press = null; if (e.type === 'pointerup' && !p.long) (flagMode ? toggleFlag : open)(p.i); };
      grid.addEventListener('pointerup', endPress); grid.addEventListener('pointercancel', endPress); grid.addEventListener('pointerleave', e => { if (press) { clearTimeout(press.t); press = null; } });
      grid.addEventListener('contextmenu', e => e.preventDefault());
      $('[data-flag]').onclick = e => { flagMode = !flagMode; e.currentTarget.setAttribute('aria-pressed', flagMode); e.currentTarget.classList.toggle('btn-primary', flagMode); };
      $('[data-restart]').onclick = start;
      bindDiff(el, i => { tier = i; start(); });
      start();
      return () => clk.stop();
    }
  };

  /* =====================================================
     QUEBRA-CABEÇA DESLIZANTE
     ===================================================== */
  AH.engines.deslizante = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel', SIZES = [3, 4, 5];
      let tier = duel ? (ctx.difficulty ?? 1) : 1, n, pos, moves, done;
      const clk = clock(el);
      el.innerHTML = `${duel ? '' : diffTabs(SIZES.map(s => `${s}×${s}`), tier)}
        <div class="score-row"><div class="score-box"><small>Movimentos</small><b data-moves>0</b></div><div class="score-box"><small>Tempo</small><b data-time>0</b></div><button class="btn" data-restart aria-label="Embaralhar de novo">${ic('shuffle')}</button></div>
        <div class="game-surface"><div class="sl-board" tabindex="0" aria-label="Quebra-cabeça deslizante"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Toque numa peça (ou use as setas) para deslizá-la até o espaço vazio.</p>`;
      const board = el.querySelector('.sl-board'), $ = s => el.querySelector(s);
      // pos[v] = índice da casa onde está a peça v (v = 0 é o vazio)
      function start() {
        n = SIZES[tier]; clk.stop(); done = false; moves = 0;
        pos = Array.from({ length: n * n }, (_, v) => v === 0 ? n * n - 1 : v - 1); // peça v na casa v-1; vazio na última
        let prev = -1;
        for (let k = 0; k < n * n * 25; k++) {
          const b = pos[0], opts = [b - n, b + n, b % n ? b - 1 : -1, (b + 1) % n ? b + 1 : -1].filter(x => x >= 0 && x < n * n && x !== prev);
          const t = opts[rnd(opts.length)], v = pos.indexOf(t); pos[v] = b; pos[0] = t; prev = b;
        }
        if (solved()) return start();
        board.style.setProperty('--n', n);
        board.innerHTML = Array.from({ length: n * n - 1 }, (_, i) => `<button class="sl-t" data-v="${i + 1}" aria-label="Peça ${i + 1}">${i + 1}</button>`).join('');
        $('[data-moves]').textContent = '0'; clk.start(); place();
      }
      const solved = () => pos.every((p, v) => v === 0 || p === v - 1);
      function place() { board.querySelectorAll('[data-v]').forEach(t => { const p = pos[+t.dataset.v]; t.style.left = (p % n) * 100 / n + '%'; t.style.top = ((p / n) | 0) * 100 / n + '%'; }); }
      function slide(v) {
        if (done) return;
        const p = pos[v], b = pos[0], pr = (p / n) | 0, pc = p % n, br = (b / n) | 0, bc = b % n;
        if (pr !== br && pc !== bc) return;
        const dr = Math.sign(br - pr), dc = Math.sign(bc - pc), line = [];
        for (let r = pr, c = pc; r !== br || c !== bc;) { line.push(r * n + c); r += dr; c += dc; }
        // do mais perto do vazio para o mais longe
        line.reverse().forEach(from => { const w = pos.indexOf(from); pos[w] = pos[0]; pos[0] = from; });
        moves++; $('[data-moves]').textContent = moves; place();
        if (solved()) {
          done = true; const s = clk.stop(); board.classList.add('win');
          setTimeout(() => ctx.end({ result: 'win', score: moves, extra: { tier }, summary: `${n}×${n} em ${moves} movimentos · ${s}s` }), 600);
        }
      }
      board.addEventListener('click', e => { const t = e.target.closest('[data-v]'); if (t) slide(+t.dataset.v); });
      const onKey = e => {
        if (isModalOpen()) return;
        const d = { ArrowLeft: [0, 1], ArrowRight: [0, -1], ArrowUp: [1, 0], ArrowDown: [-1, 0] }[e.key]; if (!d) return;
        e.preventDefault(); // a seta indica para onde a peça vai: vem da casa do lado oposto
        const b = pos[0], r = ((b / n) | 0) + d[0], c = (b % n) + d[1];
        if (r >= 0 && c >= 0 && r < n && c < n) slide(pos.indexOf(r * n + c));
      };
      document.addEventListener('keydown', onKey);
      $('[data-restart]').onclick = () => { board.classList.remove('win'); start(); };
      bindDiff(el, i => { tier = i; board.classList.remove('win'); start(); });
      start();
      return () => { clk.stop(); document.removeEventListener('keydown', onKey); };
    }
  };

  /* =====================================================
     APAGA LUZES
     ===================================================== */
  AH.engines.lights = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel', SIZES = [3, 4, 5];
      let tier = duel ? (ctx.difficulty ?? 1) : 1, n, L, moves, done;
      const clk = clock(el);
      el.innerHTML = `${duel ? '' : diffTabs(SIZES.map(s => `${s}×${s}`), tier)}
        <div class="score-row"><div class="score-box"><small>Movimentos</small><b data-moves>0</b></div><div class="score-box"><small>Tempo</small><b data-time>0</b></div><button class="btn" data-restart aria-label="Novo tabuleiro">${ic('rotate-ccw')}</button></div>
        <div class="game-surface"><div class="lo-board" role="grid" aria-label="Apaga Luzes"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Cada toque inverte a luz e as vizinhas (cima, baixo, lados). Apague todas!</p>`;
      const board = el.querySelector('.lo-board'), $ = s => el.querySelector(s);
      const press = i => { const r = (i / n) | 0, c = i % n; [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { const y = r + dr, x = c + dc; if (y >= 0 && y < n && x >= 0 && x < n) L[y * n + x] ^= 1; }); };
      function start() {
        n = SIZES[tier]; clk.stop(); done = false; moves = 0; L = Array(n * n).fill(0);
        do { for (let k = 0; k < n * n; k++) if (Math.random() < 0.45) press(k); } while (L.every(v => !v));
        board.style.setProperty('--n', n); $('[data-moves]').textContent = '0'; clk.start(); draw();
      }
      function draw() { board.innerHTML = L.map((v, i) => `<button class="lo-c ${v ? 'on' : ''}" data-i="${i}" role="gridcell" aria-label="Luz ${i + 1} ${v ? 'acesa' : 'apagada'}"></button>`).join(''); }
      board.addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b || done) return;
        press(+b.dataset.i); moves++; $('[data-moves]').textContent = moves; draw();
        if (L.every(v => !v)) { done = true; const s = clk.stop(); board.classList.add('win'); setTimeout(() => ctx.end({ result: 'win', score: moves, extra: { tier }, summary: `${n}×${n} em ${moves} toques · ${s}s` }), 600); }
      });
      $('[data-restart]').onclick = () => { board.classList.remove('win'); start(); };
      bindDiff(el, i => { tier = i; board.classList.remove('win'); start(); });
      start();
      return () => clk.stop();
    }
  };

  /* =====================================================
     CONECTA 4 — contra a CPU (minimax com poda)
     ===================================================== */
  AH.engines.conecta4 = {
    mount(el, ctx) {
      const R = 6, C = 7, opp = ctx.opponent?.username || 'CPU';
      const sk = AH.store.skin('conecta4', 'discs').fx;
      const colA = sk.a || '#dc2626', colB = sk.b || '#f6c23e';
      let diff = ctx.mode === 'duel' ? (ctx.difficulty ?? 1) : 1, b, turn, done, busy;
      el.innerHTML = `${ctx.mode === 'solo' ? diffTabs(['Fácil', 'Médio', 'Difícil'], diff) : ''}
        <p data-status style="text-align:center;font-weight:700;margin-bottom:10px" aria-live="polite"></p>
        <div class="game-surface"><div class="c4" style="--a:${colA};--b:${colB}"></div></div>`;
      const board = el.querySelector('.c4'), status = el.querySelector('[data-status]');
      const win4 = (s, p) => {
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          if (s[r * C + c] !== p) continue;
          for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
            const line = [];
            for (let k = 0; k < 4; k++) { const y = r + dr * k, x = c + dc * k; if (y < 0 || y >= R || x < 0 || x >= C || s[y * C + x] !== p) break; line.push(y * C + x); }
            if (line.length === 4) return line;
          }
        }
        return null;
      };
      const drop = (s, c, p) => { for (let r = R - 1; r >= 0; r--) if (!s[r * C + c]) { s[r * C + c] = p; return r; } return -1; };
      const cols = s => [3, 2, 4, 1, 5, 0, 6].filter(c => !s[c]);
      function score(s) {
        let v = 0; const w = (cells) => { const a = cells.filter(x => x === 2).length, h = cells.filter(x => x === 1).length; if (a && h) return 0; return a ? [0, 1, 4, 30][a] || 0 : -([0, 1, 4, 40][h] || 0); };
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const cells = []; for (let k = 0; k < 4; k++) { const y = r + dr * k, x = c + dc * k; if (y < 0 || y >= R || x < 0 || x >= C) break; cells.push(s[y * C + x]); }
          if (cells.length === 4) v += w(cells);
        }
        for (let r = 0; r < R; r++) if (s[r * C + 3] === 2) v += 3; else if (s[r * C + 3] === 1) v -= 3;
        return v;
      }
      function search(s, depth, alpha, beta, max) {
        if (win4(s, 2)) return 100000 + depth; if (win4(s, 1)) return -100000 - depth;
        const cs = cols(s); if (!cs.length) return 0; if (!depth) return score(s);
        let best = max ? -Infinity : Infinity;
        for (const c of cs) {
          const t = s.slice(); drop(t, c, max ? 2 : 1);
          const v = search(t, depth - 1, alpha, beta, !max);
          if (max) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
          if (beta <= alpha) break;
        }
        return best;
      }
      function cpuCol() {
        const cs = cols(b), depth = [1, 3, 5][diff] || 3;
        if (diff === 0 && Math.random() < 0.35) return cs[rnd(cs.length)];
        let best = -Infinity, pick = cs[0];
        for (const c of cs) { const t = b.slice(); drop(t, c, 2); const v = search(t, depth - 1, -Infinity, Infinity, false) + Math.random() * 0.5; if (v > best) { best = v; pick = c; } }
        return pick;
      }
      function start() { b = Array(R * C).fill(0); turn = 1; done = false; busy = false; status.textContent = 'Sua vez — escolha uma coluna'; draw(); }
      function draw(line = [], last = -1) {
        board.innerHTML = Array.from({ length: C }, (_, c) => `<button class="c4-col" data-c="${c}" ${done || busy || b[c] ? 'disabled' : ''} aria-label="Coluna ${c + 1}">${Array.from({ length: R }, (_, r) => { const i = r * C + c, v = b[i]; return `<i class="c4-d ${v === 1 ? 'a' : v === 2 ? 'b' : ''} ${line.includes(i) ? 'win' : ''} ${i === last ? 'drop' : ''}"></i>`; }).join('')}</button>`).join('');
      }
      function play(c, p) {
        const r = drop(b, c, p), i = r * C + c, line = win4(b, p);
        if (line) { done = true; draw(line, i); const res = p === 1 ? 'win' : 'loss'; status.textContent = p === 1 ? 'Você venceu!' : `${opp} venceu.`; return setTimeout(() => ctx.end({ result: res, summary: status.textContent }), 900); }
        if (!cols(b).length) { done = true; draw([], i); status.textContent = 'Empate!'; return setTimeout(() => ctx.end({ result: 'draw', summary: 'Tabuleiro cheio' }), 700); }
        turn = p === 1 ? 2 : 1; busy = turn === 2; draw([], i);
        status.textContent = turn === 1 ? 'Sua vez' : `${opp} está pensando…`;
        if (turn === 2) setTimeout(() => { if (!done) { busy = false; play(cpuCol(), 2); } }, 450 + Math.random() * 300);
      }
      board.addEventListener('click', e => { const col = e.target.closest('[data-c]'); if (col && !done && !busy && turn === 1) play(+col.dataset.c, 1); });
      bindDiff(el, i => { diff = i; start(); });
      start();
      return () => { done = true; };
    }
  };

  /* =====================================================
     VINTE E UM — contra a banca
     ===================================================== */
  AH.engines.blackjack = {
    mount(el, ctx) {
      const SU = ['♠', '♥', '♦', '♣'], RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      let deck, me, bank, state, doubled;
      el.innerHTML = `<div class="game-surface bj">
        <div class="bj-hand"><div class="bj-label">Banca <b data-bv></b></div><div class="bj-cards" data-bank></div></div>
        <p data-status style="text-align:center;font-weight:700;margin:14px 0" aria-live="polite"></p>
        <div class="bj-hand"><div class="bj-label">Você <b data-mv></b></div><div class="bj-cards" data-me></div></div>
        <div class="row-wrap" style="justify-content:center;margin-top:18px">
          <button class="btn btn-lg btn-primary" data-act="hit">${ic('plus')} Pedir</button>
          <button class="btn btn-lg" data-act="stand">${ic('hand')} Parar</button>
          <button class="btn btn-lg btn-accent" data-act="double">${ic('x')} Dobrar</button></div>
        <p class="faint" style="text-align:center;margin-top:12px">Chegue o mais perto de 21 sem passar. A banca para no 17. Dobrar: pede só mais uma carta.</p></div>`;
      const $ = s => el.querySelector(s), status = $('[data-status]');
      const val = h => { let t = 0, a = 0; h.forEach(c => { const r = c.r; t += r === 0 ? 11 : r >= 10 ? 10 : r + 1; if (r === 0) a++; }); while (t > 21 && a-- > 0) t -= 10; return t; };
      const card = (c, hide) => hide ? '<span class="bj-card back"></span>' : `<span class="bj-card ${c.s === 1 || c.s === 2 ? 'red' : ''}"><b>${RK[c.r]}</b><i>${SU[c.s]}</i></span>`;
      function draw() {
        $('[data-me]').innerHTML = me.map(c => card(c)).join(''); $('[data-mv]').textContent = val(me);
        const hide = state === 'play';
        $('[data-bank]').innerHTML = bank.map((c, i) => card(c, hide && i === 1)).join(''); $('[data-bv]').textContent = hide ? val([bank[0]]) : val(bank);
        el.querySelectorAll('[data-act]').forEach(b => { b.disabled = state !== 'play' || (b.dataset.act === 'double' && me.length > 2); });
      }
      function deal() {
        deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ s, r }); shuffle(deck);
        me = [deck.pop(), deck.pop()]; bank = [deck.pop(), deck.pop()]; state = 'play'; doubled = false;
        status.textContent = 'Sua vez'; draw();
        if (val(me) === 21) finish();
      }
      function finish() {
        state = 'done';
        while (val(bank) < 17 && val(me) <= 21) bank.push(deck.pop());
        draw();
        const m = val(me), b = val(bank), bj = m === 21 && me.length === 2;
        let res, msg;
        if (m > 21) { res = 'loss'; msg = `Você estourou com ${m}.`; }
        else if (b > 21) { res = 'win'; msg = `A banca estourou com ${b}!`; }
        else if (m > b) { res = 'win'; msg = bj ? 'Vinte e um de cara!' : `Você ${m} × ${b} banca`; }
        else if (m < b) { res = 'loss'; msg = `Banca ${b} × ${m} você`; }
        else { res = 'draw'; msg = `Empate em ${m}`; }
        status.textContent = msg;
        setTimeout(() => ctx.end({ result: res, summary: msg }), 900);
      }
      el.addEventListener('click', e => {
        const a = e.target.closest('[data-act]')?.dataset.act; if (!a || state !== 'play') return;
        if (a === 'hit') { me.push(deck.pop()); draw(); if (val(me) >= 21) finish(); }
        if (a === 'stand') finish();
        if (a === 'double') { me.push(deck.pop()); draw(); finish(); }
      });
      deal();
      return () => { state = 'done'; };
    }
  };

  /* =====================================================
     DAMAS — regras brasileiras (8×8, damas voadoras, captura obrigatória)
     Tabuleiro: 64 casas; 1/2 = homem/dama branca (jogador), −1/−2 = preta (CPU).
     ===================================================== */
  AH.engines.damas = {
    mount(el, ctx) {
      const opp = ctx.opponent?.username || 'CPU';
      let diff = ctx.mode === 'duel' ? (ctx.difficulty ?? 1) : 1, b, turn, sel, moves, done, quiet, lastMove = [];
      el.innerHTML = `${ctx.mode === 'solo' ? diffTabs(['Fácil', 'Médio', 'Difícil'], diff) : ''}
        <p data-status style="text-align:center;font-weight:700;margin-bottom:10px" aria-live="polite"></p>
        <div class="game-surface"><div class="ck" role="grid" aria-label="Tabuleiro de damas"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Você joga com as brancas. A captura é obrigatória; as damas andam várias casas.</p>`;
      const grid = el.querySelector('.ck'), status = el.querySelector('[data-status]');
      const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      const own = (v, side) => side === 1 ? v > 0 : v < 0;
      const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
      // todas as sequências de captura a partir de uma casa (a peça sai da origem durante o lance)
      function captures(s, from, side) {
        const out = [], piece = s[from], king = Math.abs(piece) === 2;
        const rec = (r, c, taken, path) => {
          let more = false;
          for (const [dr, dc] of DIRS) {
            let y = r + dr, x = c + dc;
            if (king) while (inside(y, x) && (s[y * 8 + x] === 0 || y * 8 + x === from)) { y += dr; x += dc; }
            if (!inside(y, x)) continue;
            const t = y * 8 + x, v = s[t];
            if (!v || own(v, side) || taken.includes(t)) continue;
            let ly = y + dr, lx = x + dc;
            while (inside(ly, lx) && (s[ly * 8 + lx] === 0 || ly * 8 + lx === from)) {
              more = true; rec(ly, lx, [...taken, t], [...path, ly * 8 + lx]);
              if (!king) break; ly += dr; lx += dc;
            }
          }
          if (!more && taken.length) out.push({ from, to: path[path.length - 1], caps: taken });
        };
        rec((from / 8) | 0, from % 8, [], []);
        return out;
      }
      function plain(s, from, side) {
        const out = [], king = Math.abs(s[from]) === 2, r = (from / 8) | 0, c = from % 8;
        for (const [dr, dc] of DIRS) {
          if (!king && dr !== (side === 1 ? -1 : 1)) continue;
          let y = r + dr, x = c + dc;
          while (inside(y, x) && s[y * 8 + x] === 0) { out.push({ from, to: y * 8 + x, caps: [] }); if (!king) break; y += dr; x += dc; }
        }
        return out;
      }
      function legal(s, side) {
        let caps = [], all = [];
        for (let i = 0; i < 64; i++) if (own(s[i], side)) { caps = caps.concat(captures(s, i, side)); all = all.concat(plain(s, i, side)); }
        return caps.length ? caps : all;
      }
      function apply(s, m) {
        const t = s.slice(), v = t[m.from]; t[m.from] = 0; m.caps.forEach(i => { t[i] = 0; });
        const row = (m.to / 8) | 0;
        t[m.to] = (v === 1 && row === 0) ? 2 : (v === -1 && row === 7) ? -2 : v;
        return t;
      }
      const evalB = s => { let v = 0; for (let i = 0; i < 64; i++) { const p = s[i]; if (!p) continue; const adv = Math.abs(p) === 1 ? (p > 0 ? 7 - ((i / 8) | 0) : (i / 8) | 0) * 0.08 : 0; v += (p > 0 ? 1 : -1) * ((Math.abs(p) === 2 ? 3.2 : 1) + adv); } return -v; }; // + = bom para a CPU (pretas)
      function search(s, depth, alpha, beta, cpuTurn) {
        const ms = legal(s, cpuTurn ? -1 : 1);
        if (!ms.length) return cpuTurn ? -1000 - depth : 1000 + depth;
        if (!depth) return evalB(s);
        let best = cpuTurn ? -Infinity : Infinity;
        for (const m of ms) {
          const v = search(apply(s, m), depth - 1, alpha, beta, !cpuTurn);
          if (cpuTurn) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
          if (beta <= alpha) break;
        }
        return best;
      }
      function cpuMove() {
        const ms = legal(b, -1);
        if (diff === 0 && Math.random() < 0.4) return ms[rnd(ms.length)];
        const depth = [1, 3, 5][diff] || 3; let best = -Infinity, pick = ms[0];
        for (const m of shuffle(ms.slice())) { const v = search(apply(b, m), depth - 1, -Infinity, Infinity, false); if (v > best) { best = v; pick = m; } }
        return pick;
      }
      function start() {
        b = Array(64).fill(0);
        for (let i = 0; i < 64; i++) { const r = (i / 8) | 0, c = i % 8; if ((r + c) % 2) { if (r < 3) b[i] = -1; else if (r > 4) b[i] = 1; } }
        turn = 1; sel = null; done = false; quiet = 0; lastMove = []; refresh(); draw();
      }
      function refresh() { moves = legal(b, turn); }
      function draw() {
        const movable = new Set(turn === 1 && !done ? moves.map(m => m.from) : []);
        const dests = new Set(sel != null ? moves.filter(m => m.from === sel).map(m => m.to) : []);
        grid.innerHTML = b.map((v, i) => {
          const dark = ((((i / 8) | 0) + i % 8) % 2) === 1;
          const cls = `ck-s ${dark ? 'dk' : 'lt'} ${dests.has(i) ? 'dest' : ''} ${lastMove.includes(i) ? 'last' : ''}`;
          const piece = v ? `<span class="ck-p ${v > 0 ? 'w' : 'b'} ${Math.abs(v) === 2 ? 'k' : ''} ${sel === i ? 'sel' : ''} ${movable.has(i) ? 'can' : ''}">${Math.abs(v) === 2 ? '♛' : ''}</span>` : '';
          return `<button class="${cls}" data-i="${i}" ${dark ? '' : 'disabled'} aria-label="Casa ${i + 1}">${piece}</button>`;
        }).join('');
        const mustCap = turn === 1 && moves.some(m => m.caps.length);
        status.textContent = done ? status.textContent : turn === 1 ? (mustCap ? 'Sua vez — captura obrigatória!' : 'Sua vez') : `${opp} está pensando…`;
      }
      function commit(m) {
        quiet = m.caps.length || Math.abs(b[m.from]) === 1 ? 0 : quiet + 1;
        b = apply(b, m); lastMove = [m.from, m.to]; sel = null; turn = -turn; refresh();
        const mine = b.filter(v => v > 0).length, theirs = b.filter(v => v < 0).length;
        if (!moves.length || !mine || !theirs) {
          done = true; const won = turn === -1;
          status.textContent = won ? 'Você venceu!' : `${opp} venceu.`; draw();
          return setTimeout(() => ctx.end({ result: won ? 'win' : 'loss', summary: status.textContent }), 800);
        }
        if (quiet >= 40) { done = true; status.textContent = 'Empate por inatividade.'; draw(); return setTimeout(() => ctx.end({ result: 'draw', summary: status.textContent }), 700); }
        draw();
        if (turn === -1) setTimeout(() => { if (!done) commit(cpuMove()); }, 550 + Math.random() * 350);
      }
      grid.addEventListener('click', e => {
        const s = e.target.closest('[data-i]'); if (!s || done || turn !== 1) return;
        const i = +s.dataset.i, m = sel != null ? moves.find(x => x.from === sel && x.to === i) : null;
        if (m) return commit(m);
        sel = moves.some(x => x.from === i) ? (sel === i ? null : i) : null; draw();
      });
      bindDiff(el, i => { diff = i; start(); });
      start();
      return () => { done = true; };
    }
  };

  /* =====================================================
     BATALHA NAVAL — 8×8, frota aleatória, contra a CPU
     ===================================================== */
  AH.engines.batalha = {
    mount(el, ctx) {
      const N = 8, FLEET = [4, 3, 3, 2, 2], opp = ctx.opponent?.username || 'CPU';
      let mine, theirs, shotsMe, shotsCpu, turn, done, cpuQueue;
      el.innerHTML = `<p data-status style="text-align:center;font-weight:700;margin-bottom:10px" aria-live="polite"></p>
        <div class="game-surface bn"><h3 class="bn-h">Águas inimigas <small class="faint" data-left></small></h3><div class="bn-grid" data-enemy role="grid" aria-label="Águas inimigas"></div>
          <h3 class="bn-h" style="margin-top:16px">Sua frota</h3><div class="bn-grid small" data-mine></div>
          <div class="row-wrap" style="justify-content:center;margin-top:14px"><button class="btn" data-shuffle>${ic('shuffle')} Embaralhar minha frota</button></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Toque numa casa das águas inimigas para atirar. Afunde todos os navios antes da CPU.</p>`;
      const status = el.querySelector('[data-status]'), $ = s => el.querySelector(s);
      function place() {
        const g = Array(N * N).fill(0), ships = [];
        FLEET.forEach((len, id) => {
          for (let tries = 0; tries < 500; tries++) {
            const h = rnd(2), r = rnd(N - (h ? 0 : len - 1)), c = rnd(N - (h ? len - 1 : 0)), cells = [];
            for (let k = 0; k < len; k++) cells.push((r + (h ? 0 : k)) * N + c + (h ? k : 0));
            if (cells.some(i => g[i])) continue;
            // sem encostar em outro navio
            if (cells.some(i => [-9, -8, -7, -1, 1, 7, 8, 9].some(d => { const j = i + d; return j >= 0 && j < N * N && Math.abs((j % N) - (i % N)) <= 1 && g[j]; }))) continue;
            cells.forEach(i => { g[i] = id + 1; }); ships.push({ id: id + 1, cells }); break;
          }
        });
        return { g, ships };
      }
      const sunk = (f, shots, ship) => ship.cells.every(i => shots.has(i));
      const left = (f, shots) => f.ships.filter(s => !sunk(f, shots, s)).length;
      function start() {
        mine = place(); theirs = place(); shotsMe = new Set(); shotsCpu = new Set(); turn = 1; done = false; cpuQueue = [];
        status.textContent = 'Sua vez — atire!'; draw();
      }
      function cell(f, shots, i, showShips) {
        const hit = shots.has(i), v = f.g[i], s = v && f.ships.find(x => x.id === v);
        let cls = 'bn-c';
        if (hit) cls += v ? ' hit' : ' miss';
        if (hit && s && sunk(f, shots, s)) cls += ' sunk';
        if (showShips && v && !hit) cls += ' ship';
        if (!showShips && !hit && done && v) cls += ' reveal';
        return `<button class="${cls}" data-i="${i}" ${showShips || hit || done ? 'disabled' : ''} aria-label="Casa ${i + 1}${hit ? (v ? ' acertou' : ' água') : ''}">${hit ? (v ? '✹' : '•') : ''}</button>`;
      }
      function draw() {
        $('[data-enemy]').style.setProperty('--n', N); $('[data-mine]').style.setProperty('--n', N);
        $('[data-enemy]').innerHTML = Array.from({ length: N * N }, (_, i) => cell(theirs, shotsMe, i, false)).join('');
        $('[data-mine]').innerHTML = Array.from({ length: N * N }, (_, i) => cell(mine, shotsCpu, i, true)).join('');
        $('[data-left]').textContent = `· ${left(theirs, shotsMe)} navios restantes`;
        $('[data-shuffle]').hidden = shotsMe.size > 0;
      }
      function cpuShoot() {
        let i;
        while (cpuQueue.length) { i = cpuQueue.shift(); if (!shotsCpu.has(i)) break; i = null; }
        if (i == null) { const pool = []; for (let k = 0; k < N * N; k++) if (!shotsCpu.has(k) && ((k / N | 0) + k % N) % 2 === 0) pool.push(k); const all = pool.length ? pool : []; if (!all.length) for (let k = 0; k < N * N; k++) if (!shotsCpu.has(k)) all.push(k); i = all[rnd(all.length)]; }
        shotsCpu.add(i);
        if (mine.g[i]) { const r = (i / N) | 0, c = i % N; [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, x]) => { if (y >= 0 && y < N && x >= 0 && x < N && !shotsCpu.has(y * N + x)) cpuQueue.push(y * N + x); }); }
        const s = mine.g[i] && mine.ships.find(x => x.id === mine.g[i]);
        if (s && sunk(mine, shotsCpu, s)) { cpuQueue = []; s.cells.forEach(k => [-9, -8, -7, -1, 1, 7, 8, 9].forEach(d => { const j = k + d; if (j >= 0 && j < N * N && !mine.g[j] && Math.abs((j % N) - (k % N)) <= 1) shotsCpu.add(j); })); }
        draw();
        if (!left(mine, shotsCpu)) return finish(false);
        if (mine.g[i]) { status.textContent = `${opp} acertou! Joga de novo…`; return setTimeout(cpuShoot, 650); }
        turn = 1; status.textContent = 'Sua vez — atire!';
      }
      function finish(won) {
        done = true; status.textContent = won ? 'Você afundou toda a frota!' : `${opp} afundou sua frota.`; draw();
        setTimeout(() => ctx.end({ result: won ? 'win' : 'loss', summary: status.textContent }), 900);
      }
      $('[data-enemy]').addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b || done || turn !== 1) return;
        const i = +b.dataset.i; if (shotsMe.has(i)) return;
        shotsMe.add(i); draw();
        if (!left(theirs, shotsMe)) return finish(true);
        if (theirs.g[i]) { const s = theirs.ships.find(x => x.id === theirs.g[i]); status.textContent = sunk(theirs, shotsMe, s) ? 'Navio afundado! Atire de novo.' : 'Acertou! Atire de novo.'; return; }
        turn = 2; status.textContent = `${opp} está mirando…`; setTimeout(cpuShoot, 700);
      });
      $('[data-shuffle]').onclick = () => { mine = place(); draw(); };
      start();
      return () => { done = true; };
    }
  };

  /* =====================================================
     KAKURO — gerado na hora; vale qualquer solução que respeite as somas
     ===================================================== */
  const KK = [{ n: 'Fácil', s: 5 }, { n: 'Médio', s: 6 }, { n: 'Difícil', s: 7 }];
  AH.engines.kakuro = {
    mount(el, ctx) {
      const duel = ctx.mode === 'duel';
      let tier = duel ? (ctx.difficulty ?? 0) : 0, S, white, vals, runs, sel, done, notesOn = false;
      const clk = clock(el);
      el.innerHTML = `${duel ? '' : diffTabs(KK.map(x => x.n), tier)}
        <div class="score-row"><div class="score-box"><small>Tempo</small><b data-time>0</b></div><button class="btn" data-restart aria-label="Novo jogo">${ic('rotate-ccw')}</button></div>
        <div class="game-surface"><div class="kk" role="grid" aria-label="Kakuro"></div>
          <div class="sd-pad" style="margin-top:12px">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-n="${n}" aria-label="Número ${n}">${n}</button>`).join('')}</div>
          <div class="row-wrap" style="justify-content:center;margin-top:10px"><button class="btn" data-erase>${ic('eraser')} Apagar</button></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Preencha com 1–9 sem repetir dentro de cada sequência; a soma tem que bater com a dica.</p>`;
      const grid = el.querySelector('.kk'), $ = s => el.querySelector(s);
      function build() {
        S = KK[tier].s;
        for (let attempt = 0; attempt < 200; attempt++) {
          white = Array.from({ length: S * S }, (_, i) => (i % S > 0 && ((i / S) | 0) > 0) && Math.random() > 0.2);
          let changed = true;
          const runLen = (i, horiz) => {
            const r = (i / S) | 0, c = i % S; let n = 1;
            if (horiz) { for (let x = c - 1; x >= 0 && white[r * S + x]; x--) n++; for (let x = c + 1; x < S && white[r * S + x]; x++) n++; }
            else { for (let y = r - 1; y >= 0 && white[y * S + c]; y--) n++; for (let y = r + 1; y < S && white[y * S + c]; y++) n++; }
            return n;
          };
          while (changed) { changed = false; for (let i = 0; i < S * S; i++) if (white[i] && (runLen(i, true) < 2 || runLen(i, false) < 2)) { white[i] = false; changed = true; } }
          if (white.filter(Boolean).length < S * S * 0.42) continue;
          // sequências
          runs = [];
          for (let i = 0; i < S * S; i++) {
            if (white[i]) continue;
            const r = (i / S) | 0, c = i % S;
            for (const horiz of [true, false]) {
              const cells = []; let j = horiz ? i + 1 : i + S;
              while (j < S * S && white[j] && (!horiz || ((j / S) | 0) === r)) { cells.push(j); j += horiz ? 1 : S; }
              if (cells.length >= 2) runs.push({ clue: i, horiz, cells });
            }
          }
          // preenche com dígitos 1-9 distintos em cada sequência (retrocesso)
          const sol = Array(S * S).fill(0), cellRuns = new Map();
          runs.forEach(r => r.cells.forEach(c => { if (!cellRuns.has(c)) cellRuns.set(c, []); cellRuns.get(c).push(r); }));
          const order = [...cellRuns.keys()].sort((a, b) => a - b);
          let budget = 20000;
          const fill = k => {
            if (k === order.length) return true; if (!budget--) return false;
            const c = order[k], used = new Set(); cellRuns.get(c).forEach(r => r.cells.forEach(x => { if (sol[x]) used.add(sol[x]); }));
            for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) { if (used.has(d)) continue; sol[c] = d; if (fill(k + 1)) return true; sol[c] = 0; }
            return false;
          };
          if (order.length && white.every((w, i) => !w || cellRuns.has(i)) && fill(0)) { runs.forEach(r => { r.sum = r.cells.reduce((s, c) => s + sol[c], 0); }); return; }
        }
      }
      function start() {
        clk.stop(); build(); vals = Array(S * S).fill(0); sel = null; done = false;
        grid.style.setProperty('--n', S); draw(); clk.start();
      }
      const clueOf = (i, horiz) => runs.find(r => r.clue === i && r.horiz === horiz)?.sum;
      function bad(i) { return runs.some(r => r.cells.includes(i) && (r.cells.filter(c => vals[c] === vals[i]).length > 1)); }
      function draw() {
        grid.innerHTML = Array.from({ length: S * S }, (_, i) => {
          if (!white[i]) { const h = clueOf(i, true), v = clueOf(i, false); return `<span class="kk-b">${h ? `<em class="h">${h}</em>` : ''}${v ? `<em class="v">${v}</em>` : ''}</span>`; }
          return `<button class="kk-c ${sel === i ? 'sel' : ''} ${vals[i] && bad(i) ? 'wrong' : ''}" data-i="${i}" role="gridcell">${vals[i] || ''}</button>`;
        }).join('');
      }
      function check() {
        if (white.some((w, i) => w && !vals[i])) return;
        if (runs.every(r => r.cells.reduce((s, c) => s + vals[c], 0) === r.sum && new Set(r.cells.map(c => vals[c])).size === r.cells.length)) {
          done = true; const s = clk.stop(); grid.classList.add('win');
          setTimeout(() => ctx.end({ result: 'win', score: s, extra: { tier }, summary: `${KK[tier].n} em ${s}s` }), 600);
        }
      }
      function put(n) { if (done || sel == null) return; vals[sel] = n; draw(); if (n) check(); }
      grid.addEventListener('click', e => { const c = e.target.closest('[data-i]'); if (c) { sel = +c.dataset.i; draw(); } });
      el.querySelector('.sd-pad').onclick = e => { const b = e.target.closest('[data-n]'); if (b) put(+b.dataset.n); };
      $('[data-erase]').onclick = () => put(0);
      const onKey = e => { if (isModalOpen()) return; if (/^[1-9]$/.test(e.key)) put(+e.key); else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') put(0); };
      document.addEventListener('keydown', onKey);
      $('[data-restart]').onclick = () => { grid.classList.remove('win'); start(); };
      bindDiff(el, i => { tier = i; grid.classList.remove('win'); start(); });
      start();
      return () => { clk.stop(); document.removeEventListener('keydown', onKey); };
    }
  };
})();
