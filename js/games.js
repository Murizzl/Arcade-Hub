/* =========================================================
   Minijogos jogáveis.
   Contrato de um motor de jogo:
     AH.engines[id] = {
       mount(el, ctx) -> cleanup()
     }
   ctx = {
     mode: 'solo' | 'duel',
     opponent: { username } | null,   // em duelo
     end({ result, score, extra })     // 'win' | 'loss' | 'draw' | 'complete'
   }
   Novos jogos só precisam implementar esse contrato.
   ========================================================= */
(function () {
  const { ic, esc, fmt } = AH.ui;
  AH.engines = {};

  /* ---------------- 2048 ---------------- */
  AH.engines['2048'] = {
    mount(el, ctx) {
      const N = 4;
      let tiles, score, nextId, over, won;
      const best = () => AH.store.user?.stats['2048']?.best || 0;
      el.innerHTML = `
        <div class="score-row">
          <div class="score-box"><small>Pontos</small><b data-score>0</b></div>
          <div class="score-box"><small>Recorde</small><b data-best>${fmt(best())}</b></div>
          <button class="btn" data-restart aria-label="Reiniciar">${ic('rotate-ccw')}</button>
        </div>
        <div class="game-surface">
          <div class="g2048" tabindex="0" aria-label="Tabuleiro 2048. Use as setas do teclado ou deslize.">
            ${Array.from({ length: 16 }, () => '<div class="cell"></div>').join('')}
          </div>
        </div>
        <p class="faint" style="text-align:center;margin-top:12px">Use as setas / WASD ou deslize o dedo.</p>`;
      const board = el.querySelector('.g2048');
      const scoreEl = el.querySelector('[data-score]');
      const nodes = new Map();

      const colors = { 2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'], 32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'], 512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#6c4cf5', '#fff'] };

      function start() {
        tiles = []; score = 0; nextId = 1; over = false; won = false;
        nodes.forEach(n => n.remove()); nodes.clear();
        spawn(); spawn(); render();
        board.focus({ preventScroll: true });
      }
      function empties() {
        const occ = new Set(tiles.map(t => t.r * N + t.c));
        const e = []; for (let i = 0; i < N * N; i++) if (!occ.has(i)) e.push(i);
        return e;
      }
      function spawn() {
        const e = empties(); if (!e.length) return;
        const i = e[Math.floor(Math.random() * e.length)];
        tiles.push({ id: nextId++, v: Math.random() < .9 ? 2 : 4, r: Math.floor(i / N), c: i % N, isNew: true });
      }
      function move(dir) {
        if (over) return;
        const vec = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] }[dir];
        tiles.forEach(t => { t.merged = false; t.isNew = false; });
        let moved = false;
        for (let line = 0; line < N; line++) {
          const pos = [];
          for (let k = 0; k < N; k++) {
            const idx = vec[0] + vec[1] > 0 ? N - 1 - k : k;
            pos.push(vec[0] === 0 ? [line, idx] : [idx, line]);
          }
          const lineTiles = pos.map(([r, c]) => tiles.find(t => !t.dead && t.r === r && t.c === c)).filter(Boolean);
          const out = [];
          lineTiles.forEach(t => {
            const last = out[out.length - 1];
            if (last && last.v === t.v && !last.merged) {
              t.dead = true; t.r = last.r; t.c = last.c; last.v *= 2; last.merged = true; score += last.v; moved = true;
            } else {
              const [r, c] = pos[out.length];
              if (t.r !== r || t.c !== c) moved = true;
              t.r = r; t.c = c; out.push(t);
            }
          });
        }
        if (!moved) return;
        render();
        setTimeout(() => {
          tiles = tiles.filter(t => { if (t.dead) { nodes.get(t.id)?.remove(); nodes.delete(t.id); } return !t.dead; });
          spawn(); render();
          if (!won && tiles.some(t => t.v >= 2048)) { won = true; AH.ui.toast('Você chegou ao 2048! Continue para mais pontos.', 'success', 'party-popper'); }
          if (!canMove()) finish();
        }, 110);
      }
      function canMove() {
        if (empties().length) return true;
        return tiles.some(t => tiles.some(o => o.v === t.v && Math.abs(o.r - t.r) + Math.abs(o.c - t.c) === 1));
      }
      function finish() {
        over = true;
        const maxTile = Math.max(...tiles.map(t => t.v));
        ctx.end({ result: maxTile >= 2048 ? 'win' : 'complete', score, extra: { maxTile }, summary: `Maior bloco: ${maxTile}` });
      }
      function render() {
        scoreEl.textContent = fmt(score);
        tiles.forEach(t => {
          let n = nodes.get(t.id);
          if (!n) { n = document.createElement('div'); n.className = 'tile'; board.appendChild(n); nodes.set(t.id, n); }
          const [bg, fg] = colors[t.v] || ['#3c3a32', '#fff'];
          n.style.cssText = `left:calc(var(--gap) + ${t.c} * ((100% - var(--gap)) / 4));top:calc(var(--gap) + ${t.r} * ((100% - var(--gap)) / 4));width:calc((100% - 5 * var(--gap)) / 4);height:calc((100% - 5 * var(--gap)) / 4);background:${bg};color:${fg};font-size:${t.v >= 1024 ? 'clamp(1.1rem,5vw,1.7rem)' : t.v >= 128 ? 'clamp(1.3rem,6vw,2rem)' : 'clamp(1.5rem,7vw,2.4rem)'};z-index:${t.dead ? 1 : 2}`;
          n.textContent = t.v;
          n.classList.toggle('new', !!t.isNew);
          n.classList.remove('merged'); if (t.merged && !t.dead) { void n.offsetWidth; n.classList.add('merged'); }
        });
      }
      const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
      const onKey = e => {
        if (document.getElementById('modalRoot').classList.contains('open')) return;
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        const d = keys[e.key]; if (d) { e.preventDefault(); move(d); }
      };
      let sx, sy;
      board.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
      board.addEventListener('pointerup', e => {
        if (sx == null) return;
        const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      });
      document.addEventListener('keydown', onKey);
      el.querySelector('[data-restart]').onclick = start;
      if (ctx.mode === 'duel') el.querySelector('[data-restart]').hidden = true;
      ctx.finish = () => { if (!over) finish(); }; // usado pelo cronômetro do duelo
      start();
      return () => document.removeEventListener('keydown', onKey);
    }
  };

  /* ---------------- Jogo da Velha ---------------- */
  AH.engines.velha = {
    mount(el, ctx) {
      const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      let b, turn, done, diff = ctx.mode === 'duel' ? ['facil', 'medio', 'dificil'][ctx.difficulty ?? 1] : 'medio';
      const opp = ctx.opponent?.username || 'CPU';
      const tally = { you: 0, opp: 0, draw: 0 };
      el.innerHTML = `
        ${ctx.mode === 'solo' ? `<div class="tabs" role="tablist" aria-label="Dificuldade" style="margin-bottom:14px">
          ${[['facil', 'Fácil'], ['medio', 'Médio'], ['dificil', 'Difícil']].map(([k, l]) => `<button class="tab ${k === diff ? 'active' : ''}" data-diff="${k}" role="tab" aria-selected="${k === diff}">${l}</button>`).join('')}
        </div>` : ''}
        <div class="score-row">
          <div class="score-box"><small>Você (X)</small><b data-t="you">0</b></div>
          <div class="score-box"><small>Empates</small><b data-t="draw">0</b></div>
          <div class="score-box"><small>${esc(opp)} (O)</small><b data-t="opp">0</b></div>
        </div>
        <div class="game-surface">
          <p data-status style="text-align:center;font-weight:700;margin-bottom:12px" aria-live="polite"></p>
          <div class="ttt" role="grid" aria-label="Tabuleiro do Jogo da Velha"></div>
        </div>`;
      const grid = el.querySelector('.ttt');
      const status = el.querySelector('[data-status]');
      const winner = s => { for (const l of LINES) if (s[l[0]] && s[l[0]] === s[l[1]] && s[l[0]] === s[l[2]]) return { p: s[l[0]], line: l }; return s.every(Boolean) ? { p: 'draw' } : null; };

      function minimax(s, player) {
        const w = winner(s);
        if (w) return { score: w.p === 'O' ? 10 : w.p === 'X' ? -10 : 0 };
        const moves = [];
        s.forEach((v, i) => { if (!v) { s[i] = player; const r = minimax(s, player === 'O' ? 'X' : 'O'); moves.push({ i, score: r.score }); s[i] = null; } });
        return moves.reduce((best, m) => (player === 'O' ? m.score > best.score : m.score < best.score) ? m : best);
      }
      function cpuMove() {
        const free = b.map((v, i) => v ? null : i).filter(v => v !== null);
        const smart = diff === 'dificil' ? 1 : diff === 'medio' ? .6 : .15;
        return Math.random() < smart ? minimax([...b], 'O').i : free[Math.floor(Math.random() * free.length)];
      }
      function start() {
        b = Array(9).fill(null); turn = 'X'; done = false;
        status.textContent = 'Sua vez — você é o X';
        draw();
      }
      function draw(line = []) {
        grid.innerHTML = b.map((v, i) => `<button role="gridcell" class="${v ? v.toLowerCase() : ''} ${line.includes(i) ? 'win' : ''}" data-i="${i}" ${v || done || turn !== 'X' ? 'disabled' : ''} aria-label="Casa ${i + 1}${v ? ': ' + v : ' vazia'}">${v ? `<span>${v}</span>` : ''}</button>`).join('');
      }
      function play(i, p) {
        b[i] = p;
        const w = winner(b);
        if (w) {
          done = true;
          const res = w.p === 'X' ? 'win' : w.p === 'O' ? 'loss' : 'draw';
          tally[res === 'win' ? 'you' : res === 'loss' ? 'opp' : 'draw']++;
          el.querySelectorAll('[data-t]').forEach(n => n.textContent = tally[n.dataset.t]);
          status.textContent = { win: 'Você venceu!', loss: `${opp} venceu.`, draw: 'Deu velha!' }[res];
          draw(w.line || []);
          setTimeout(() => ctx.end({ result: res, summary: status.textContent }), 650);
          return;
        }
        turn = p === 'X' ? 'O' : 'X';
        status.textContent = turn === 'X' ? 'Sua vez' : `${opp} está pensando…`;
        draw();
        if (turn === 'O') setTimeout(() => play(cpuMove(), 'O'), 450 + Math.random() * 400);
      }
      grid.onclick = e => { const btn = e.target.closest('[data-i]'); if (btn && !done && turn === 'X' && !b[btn.dataset.i]) play(+btn.dataset.i, 'X'); };
      el.querySelectorAll('[data-diff]').forEach(t => t.onclick = () => {
        diff = t.dataset.diff;
        el.querySelectorAll('[data-diff]').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); });
        start();
      });
      ctx.restart = start;
      start();
      return () => {};
    }
  };

  /* ---------------- Memória ---------------- */
  AH.engines.memoria = {
    mount(el, ctx) {
      const ICONS = [['cat', '#ef4565'], ['rocket', '#2a8bd8'], ['star', '#f2a516'], ['ghost', '#a24cf5'], ['fish', '#0ea5a4'], ['leaf', '#14a37f'], ['crown', '#e0a100'], ['heart', '#d9468f']];
      let deck, open, moves, found, lock, timer, secs;
      el.innerHTML = `
        <div class="score-row">
          <div class="score-box"><small>Jogadas</small><b data-moves>0</b></div>
          <div class="score-box"><small>Pares</small><b data-found>0/8</b></div>
          <div class="score-box"><small>Tempo</small><b data-time>0:00</b></div>
          <button class="btn" data-restart aria-label="Reiniciar">${ic('rotate-ccw')}</button>
        </div>
        <div class="game-surface"><div class="mem" role="grid" aria-label="Cartas da memória"></div></div>`;
      const grid = el.querySelector('.mem');
      const $ = s => el.querySelector(s);
      function start() {
        clearInterval(timer);
        deck = [...ICONS, ...ICONS].map((x, i) => ({ k: x[0], c: x[1], i })).sort(() => Math.random() - .5);
        open = []; moves = 0; found = 0; lock = false; secs = 0; timer = null;
        $('[data-time]').textContent = '0:00';
        grid.innerHTML = deck.map((d, i) => `<button class="mem-card" data-i="${i}" aria-label="Carta ${i + 1}, virada para baixo">
          <span class="mem-inner"><span class="mem-face mem-back">${ic('sparkle')}</span><span class="mem-face mem-front" style="--c:${d.c}">${ic(d.k)}</span></span></button>`).join('');
        AH.ui.refreshIcons();
        upd();
      }
      function upd() { $('[data-moves]').textContent = moves; $('[data-found]').textContent = `${found}/8`; }
      grid.onclick = e => {
        const btn = e.target.closest('.mem-card');
        if (!btn || lock || btn.classList.contains('flip') || btn.classList.contains('done')) return;
        if (!timer) timer = setInterval(() => { secs++; $('[data-time]').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; }, 1000);
        btn.classList.add('flip');
        btn.setAttribute('aria-label', `Carta: ${deck[btn.dataset.i].k}`);
        open.push(btn);
        if (open.length === 2) {
          moves++; lock = true;
          const [a, b2] = open.map(x => deck[x.dataset.i]);
          if (a.k === b2.k) {
            setTimeout(() => {
              open.forEach(x => { x.classList.add('done'); x.classList.remove('flip'); });
              open = []; lock = false; found++; upd();
              if (found === 8) { clearInterval(timer); ctx.end({ result: 'win', score: moves, summary: `${moves} jogadas em ${secs}s` }); }
            }, 300);
          } else {
            setTimeout(() => { open.forEach(x => { x.classList.remove('flip'); x.setAttribute('aria-label', 'Carta virada para baixo'); }); open = []; lock = false; }, 800);
          }
          upd();
        }
      };
      $('[data-restart]').onclick = start;
      start();
      return () => clearInterval(timer);
    }
  };

  /* ---------------- Separar Poções ---------------- */
  // Fases infinitas e determinísticas (mesma fase = mesmo tabuleiro), em 5 dificuldades.
  const POTION_TIERS = [
    { name: 'Fácil',         from: 1,  colors: 4,  color: '#1fb37a' },
    { name: 'Médio',         from: 11, colors: 5,  color: '#2a8bd8' },
    { name: 'Difícil',       from: 26, colors: 7,  color: '#f2a516' },
    { name: 'Muito difícil', from: 46, colors: 9,  color: '#ff7a45' },
    { name: 'Extra difícil', from: 71, colors: 10, color: '#ef4565' }
  ];
  // fase aleatória dentro da dificuldade escolhida no duelo
  const duelLevel = (tiers, i) => { const t = tiers[Math.min(i, tiers.length - 1)], span = (tiers[i + 1]?.from || t.from + 20) - t.from; return t.from + Math.floor(Math.random() * span); };
  AH.duelLevel = duelLevel;
  const tierOf = lvl => POTION_TIERS.reduce((t, x, i) => lvl >= x.from ? i : t, 0);
  AH.potionTiers = POTION_TIERS;

  const PCAP = 4;
  const pSolved = t => t.length === PCAP && t.every(c => c === t[0]);
  const pDone = st => st.every(t => !t.length || pSolved(t));
  function pMoves(st) {
    const out = [];
    st.forEach((a, i) => {
      if (!a.length || pSolved(a)) return;
      const c = a[a.length - 1];
      const uniform = a.every(x => x === c);
      st.forEach((b, j) => {
        if (i === j || b.length >= PCAP) return;
        if (b.length && b[b.length - 1] !== c) return;
        if (!b.length && uniform) return; // mover pilha uniforme para vazio não ajuda
        out.push([i, j, b.length ? 0 : 1]);
      });
    });
    return out.sort((x, y) => x[2] - y[2]); // prefere empilhar sobre a mesma cor
  }
  function pApply(st, i, j) {
    const s = st.map(t => [...t]);
    const c = s[i][s[i].length - 1];
    while (s[i].length && s[i][s[i].length - 1] === c && s[j].length < PCAP) s[j].push(s[i].pop());
    return s;
  }
  // Busca em profundidade com limite de nós; devolve a lista de jogadas ou null.
  function pSolve(start, limit = 60000) {
    const seen = new Set(); let nodes = 0;
    const key = st => st.map(t => t.join('')).sort().join('|');
    const dfs = (st, path) => {
      if (pDone(st)) return path;
      if (++nodes > limit) return null;
      const k = key(st); if (seen.has(k)) return null; seen.add(k);
      for (const [i, j] of pMoves(st)) { const r = dfs(pApply(st, i, j), path.concat([[i, j]])); if (r) return r; }
      return null;
    };
    return dfs(start, []);
  }
  function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // Kit compartilhado com outros jogos de "ordenar" (ex.: Porcas e Parafusos)
  AH.sortKit = { solve: (...a) => pSolve(...a), apply: (...a) => pApply(...a), solved: t => pSolved(t), done: st => pDone(st), rng: s => mulberry(s) };
  function buildLevel(level) {
    const n = POTION_TIERS[tierOf(level)].colors;
    for (let attempt = 0; attempt < 40; attempt++) {
      const rnd = mulberry(level * 7919 + attempt * 104729);
      const pool = []; for (let c = 0; c < n; c++) for (let k = 0; k < PCAP; k++) pool.push(c);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const st = Array.from({ length: n }, (_, i) => pool.slice(i * PCAP, i * PCAP + PCAP)).concat([[], []]);
      if (st.some(pSolved)) continue;
      if (pSolve(st, 40000)) return st;
    }
    return null;
  }

  AH.engines.pocoes = {
    mount(el, ctx) {
      const PALETTE = ['#ef0f3a', '#0a84d8', '#ffd000', '#13a81a', '#ff38d2', '#ff7a00', '#2fe0d0', '#b04a2c', '#a2d20a', '#d9a882'];
      const duel = ctx.mode === 'duel';
      const unlocked = () => AH.store.user?.stats.pocoes?.unlocked || 1;
      let level = duel ? duelLevel(POTION_TIERS, ctx.difficulty ?? 1) : unlocked();
      let tubes, sel, moves, undo, hints, busy, done;

      el.innerHTML = `<div class="pz">
        <div class="pz-head">
          ${duel ? '<span></span>' : `<button class="pz-round" data-levels aria-label="Escolher fase">${ic('layout-grid')}</button>`}
          <div class="pz-title"><span class="pz-tier" data-tier></span><b data-level></b></div>
          <button class="pz-round" data-restart aria-label="Reiniciar fase">${ic('rotate-ccw')}</button>
        </div>
        <div class="pz-board" role="group" aria-label="Frascos de poção"></div>
        <p class="pz-msg" data-msg aria-live="polite"></p>
        <div class="pz-foot">
          <button class="pz-action" data-undo><span>${ic('undo-2')}</span>Desfazer</button>
          <span class="pz-moves"><small>Jogadas</small><b data-moves>0</b></span>
          <button class="pz-action" data-hint><span>${ic('lightbulb')}<i class="pz-badge" data-hints>3</i></span>Dica</button>
        </div>
      </div>`;
      const board = el.querySelector('.pz-board');
      const $ = s => el.querySelector(s);
      const msg = t => { $('[data-msg]').textContent = t || ' '; };

      function start(lvl = level) {
        level = lvl;
        const st = buildLevel(level);
        tubes = st; sel = null; moves = 0; undo = []; hints = 3; busy = false; done = false;
        const t = POTION_TIERS[tierOf(level)];
        $('[data-tier]').textContent = t.name.toUpperCase();
        $('[data-tier]').style.background = t.color;
        $('[data-level]').textContent = `Nível ${level}`;
        msg('Toque em um frasco e depois no frasco de destino.');
        draw();
      }
      const tubeHTML = (t, i) => `<button class="pz-tube ${sel === i ? 'sel' : ''} ${pSolved(t) ? 'full' : ''}" data-t="${i}"
          aria-label="Frasco ${i + 1}: ${t.length ? t.length + ' de 4 doses' : 'vazio'}${pSolved(t) ? ', completo' : ''}" aria-pressed="${sel === i}">
          <span class="pz-glass"><span class="pz-liquid">${t.map(c => `<span style="--c:${PALETTE[c]}"></span>`).join('')}</span></span></button>`;
      function draw() {
        // até 5 frascos por linha, como nas fases do app de referência
        const perRow = tubes.length <= 8 ? 4 : Math.ceil(tubes.length / 3);
        board.style.setProperty('--cols', Math.min(perRow, 5));
        board.innerHTML = tubes.map(tubeHTML).join('');
        $('[data-moves]').textContent = moves;
        $('[data-undo]').disabled = !undo.length || done || busy;
        $('[data-hint]').disabled = !hints || done || busy;
        $('[data-hints]').textContent = hints;
      }

      // Anima o frasco de origem inclinando sobre o destino e derramando.
      function pourAnimated(from, to) {
        busy = true;
        const src = board.querySelector(`[data-t="${from}"]`), dst = board.querySelector(`[data-t="${to}"]`);
        const bR = board.getBoundingClientRect(), sR = src.getBoundingClientRect(), dR = dst.getBoundingClientRect();
        const right = dR.left >= sR.left;
        const dx = (dR.left + dR.width / 2) - (sR.left + sR.width / 2) + (right ? -sR.width * 0.35 : sR.width * 0.35);
        const dy = dR.top - sR.top - sR.height * 0.42;
        const color = PALETTE[tubes[from][tubes[from].length - 1]];
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        src.classList.add('pouring');
        src.style.transform = `translate(${dx}px, ${dy}px) rotate(${right ? 72 : -72}deg)`;
        const stream = document.createElement('span');
        stream.className = 'pz-stream';
        stream.style.cssText = `--c:${color};left:${dR.left - bR.left + dR.width / 2 - 3}px;top:${dR.top - bR.top - sR.height * 0.12}px;--h:${dR.height * 0.95}px`;
        setTimeout(() => {
          board.appendChild(stream);
          tubes = pApply(tubes, from, to);
          dst.outerHTML = tubeHTML(tubes[to], to);
          src.querySelector('.pz-liquid').innerHTML = tubes[from].map(c => `<span style="--c:${PALETTE[c]}"></span>`).join('');
        }, reduce ? 0 : 280);
        setTimeout(() => { stream.remove(); src.style.transform = ''; }, reduce ? 0 : 720);
        setTimeout(() => { src.classList.remove('pouring'); busy = false; afterMove(); }, reduce ? 0 : 1000);
      }
      function tryPour(from, to) {
        const a = tubes[from], b = tubes[to], c = a[a.length - 1];
        if (b.length >= PCAP) { msg('Esse frasco já está cheio.'); return false; }
        if (b.length && b[b.length - 1] !== c) { msg('A cor do topo precisa ser igual (ou o frasco estar vazio).'); return false; }
        undo.push(tubes.map(t => [...t]));
        moves++; msg('');
        pourAnimated(from, to);
        return true;
      }
      function afterMove() {
        draw();
        if (!pDone(tubes)) return;
        done = true; draw();
        const tier = tierOf(level);
        msg('Fase concluída!');
        board.classList.add('win');
        setTimeout(() => ctx.end({
          result: 'win', score: level,
          extra: duel ? { tier } : { tier, unlocked: level + 1 },
          summary: `Nível ${level} · ${POTION_TIERS[tier].name} · ${moves} jogadas`,
          next: duel ? null : 'Próxima fase'
        }), 650);
      }
      board.onclick = e => {
        const b = e.target.closest('[data-t]'); if (!b || busy || done) return;
        const i = +b.dataset.t;
        if (sel === null) { if (tubes[i].length && !pSolved(tubes[i])) { sel = i; draw(); } return; }
        if (sel === i) { sel = null; draw(); return; }
        const from = sel; sel = null;
        board.querySelector(`[data-t="${from}"]`).classList.remove('sel');
        if (!tryPour(from, i)) draw();
      };
      $('[data-undo]').onclick = () => { if (!undo.length || busy || done) return; tubes = undo.pop(); sel = null; msg(''); draw(); };
      $('[data-restart]').onclick = () => { if (!busy) start(level); };
      $('[data-hint]').onclick = () => {
        if (!hints || busy || done) return;
        const sol = pSolve(tubes, 80000);
        if (!sol) { msg('Sem saída daqui. Desfaça algumas jogadas ou reinicie.'); return; }
        hints--; sel = null; draw();
        const [i, j] = sol[0];
        board.querySelector(`[data-t="${i}"]`).classList.add('hint');
        board.querySelector(`[data-t="${j}"]`).classList.add('hint');
        msg(`Dica: despeje o frasco ${i + 1} no frasco ${j + 1}.`);
      };
      const levelsBtn = $('[data-levels]');
      if (levelsBtn) levelsBtn.onclick = () => {
        const max = unlocked();
        const upto = Math.max(max + 4, 90);
        AH.ui.modal({
          title: 'Fases', wide: true,
          body: POTION_TIERS.map((t, ti) => {
            const end = (POTION_TIERS[ti + 1]?.from || upto + 1) - 1;
            const nums = []; for (let n = t.from; n <= Math.min(end, upto); n++) nums.push(n);
            return `<h3 class="pz-sec"><span class="pz-tier" style="background:${t.color}">${t.name.toUpperCase()}</span> <small class="faint">${t.colors} cores</small></h3>
              <div class="pz-levels">${nums.map(n => `<button class="pz-lv ${n === level ? 'cur' : ''} ${n < max ? 'done' : ''}" data-lv="${n}" ${n > max ? 'disabled aria-label="Fase ' + n + ' bloqueada"' : ''}>${n > max ? ic('lock') : n}</button>`).join('')}${end > upto ? '<span class="faint" style="align-self:center">…</span>' : ''}</div>`;
          }).join(''),
          onMount: m => m.addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (b && !b.disabled) { AH.ui.close(); start(+b.dataset.lv); } })
        });
      };
      if (duel) $('[data-restart]').hidden = true;
      start(level);
      return () => {};
    }
  };

  /* ---------------- Pedra, Papel e Tesoura ---------------- */
  AH.engines.ppt = {
    mount(el, ctx) {
      const H = { pedra: '✊', papel: '✋', tesoura: '✌️' };
      const beats = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };
      const opp = ctx.opponent?.username || 'CPU';
      let me, them, busy, done, history;
      el.innerHTML = `
        <div class="score-row">
          <div class="score-box"><small>Você</small><b data-me>0</b></div>
          <div class="score-box"><small>Melhor de 5</small><b>${ic('swords')}</b></div>
          <div class="score-box"><small>${esc(opp)}</small><b data-them>0</b></div>
        </div>
        <div class="game-surface">
          <div class="rps-arena">
            <div><div class="rps-hand" data-hand-me>❔</div><b>Você</b></div>
            <div class="rps-vs">VS</div>
            <div><div class="rps-hand" data-hand-them>❔</div><b>${esc(opp)}</b></div>
          </div>
          <p data-msg style="text-align:center;font-weight:700;margin-bottom:14px" aria-live="polite">Escolha sua jogada</p>
          <div class="rps-choices">
            ${Object.keys(H).map(k => `<button class="btn" data-pick="${k}"><span>${H[k]}</span>${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}
          </div>
        </div>`;
      const $ = s => el.querySelector(s);
      // CPU levemente adaptativa: tende a jogar o que vence sua jogada mais frequente.
      function cpuPick() {
        const keys = Object.keys(H);
        if (history.length > 1 && Math.random() < .4) {
          const freq = {}; history.forEach(h => freq[h] = (freq[h] || 0) + 1);
          const fav = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0];
          return keys.find(k => beats[k] === fav);
        }
        return keys[Math.floor(Math.random() * 3)];
      }
      function start() { me = 0; them = 0; busy = false; done = false; history = []; $('[data-me]').textContent = 0; $('[data-them]').textContent = 0; $('[data-msg]').textContent = 'Escolha sua jogada'; $('[data-hand-me]').textContent = '❔'; $('[data-hand-them]').textContent = '❔'; }
      el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
        if (busy || done) return;
        busy = true;
        const p = b.dataset.pick; const c = cpuPick(); history.push(p);
        const hm = $('[data-hand-me]'), ht = $('[data-hand-them]');
        hm.textContent = '✊'; ht.textContent = '✊';
        hm.classList.add('shake'); ht.classList.add('shake');
        setTimeout(() => {
          hm.classList.remove('shake'); ht.classList.remove('shake');
          hm.textContent = H[p]; ht.textContent = H[c];
          let msg;
          if (p === c) msg = 'Empate na rodada!';
          else if (beats[p] === c) { me++; msg = 'Você levou a rodada!'; }
          else { them++; msg = `${opp} levou a rodada.`; }
          $('[data-me]').textContent = me; $('[data-them]').textContent = them; $('[data-msg]').textContent = msg;
          busy = false;
          if (me === 3 || them === 3) { done = true; setTimeout(() => ctx.end({ result: me === 3 ? 'win' : 'loss', summary: `Placar ${me} × ${them}` }), 600); }
        }, 1000);
      });
      ctx.restart = start;
      start();
      return () => {};
    }
  };
})();
