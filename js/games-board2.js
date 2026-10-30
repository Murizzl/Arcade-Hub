/* =========================================================
   Jogos de tabuleiro e cartas (lote 2): Dominó, Mahjong Solitário,
   Paciência, Xadrez e Gamão. Mesmo contrato dos outros motores.
   Os confrontos diretos (Dominó, Xadrez, Gamão) são contra a CPU.
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
  const clock = el => {
    let t0 = Date.now(), id = null;
    const secs = () => Math.floor((Date.now() - t0) / 1000);
    const draw = () => { const n = el.querySelector('[data-time]'); if (n) n.textContent = secs(); };
    return { start() { t0 = Date.now(); clearInterval(id); draw(); id = setInterval(draw, 500); }, stop() { clearInterval(id); draw(); return secs(); } };
  };

  /* =====================================================
     DOMINÓ — duplo-seis, você contra a CPU
     ===================================================== */
  const PIPS = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  const half = n => `<i class="dm-h">${Array.from({ length: 9 }, (_, k) => `<b class="${PIPS[n].includes(k) ? 'on' : ''}"></b>`).join('')}</i>`;
  const tileHtml = (t, attrs = '', cls = '') => `<span class="dm-t ${t.a === t.b ? 'dbl' : ''} ${cls}" ${attrs}>${half(t.a)}${half(t.b)}</span>`;
  AH.engines.domino = {
    mount(el, ctx) {
      const opp = ctx.opponent?.username || 'CPU';
      let hand, cpu, stock, chain, turn, passes, done, pending;
      el.innerHTML = `<div class="game-surface dm">
        <div class="dm-info"><span data-cpuinfo></span><span data-stockinfo></span></div>
        <div class="dm-chain" data-chain aria-label="Mesa"></div>
        <p data-status style="text-align:center;font-weight:700;margin:10px 0" aria-live="polite"></p>
        <div class="dm-hand" data-hand></div>
        <div class="row-wrap" style="justify-content:center;margin-top:12px"><button class="btn" data-draw>${ic('layers')} Comprar</button><button class="btn" data-pass>${ic('skip-forward')} Passar</button></div>
        <p class="faint" style="text-align:center;margin-top:10px">Encaixe uma pedra com o mesmo número numa das pontas. Sem jogada? Compre ou passe.</p></div>`;
      const $ = s => el.querySelector(s), status = $('[data-status]');
      const ends = () => chain.length ? [chain[0].a, chain[chain.length - 1].b] : [null, null];
      const can = (t, side) => { const [l, r] = ends(); if (!chain.length) return true; return side === 'l' ? (t.a === l || t.b === l) : (t.a === r || t.b === r); };
      const playable = h => h.filter(t => can(t, 'l') || can(t, 'r'));
      const sum = h => h.reduce((s, t) => s + t.a + t.b, 0);
      function put(t, side) {
        if (!chain.length) { chain.push({ a: t.a, b: t.b }); return; }
        if (side === 'l') chain.unshift(t.b === chain[0].a ? { a: t.a, b: t.b } : { a: t.b, b: t.a });
        else chain.push(t.a === chain[chain.length - 1].b ? { a: t.a, b: t.b } : { a: t.b, b: t.a });
      }
      function start() {
        const all = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push({ a, b });
        shuffle(all); hand = all.slice(0, 7); cpu = all.slice(7, 14); stock = all.slice(14); chain = []; passes = 0; done = false; pending = null;
        const best = h => Math.max(-1, ...h.filter(t => t.a === t.b).map(t => t.a));
        turn = best(hand) >= best(cpu) ? 'me' : 'cpu';
        const first = turn === 'me' ? best(hand) : best(cpu);
        if (first < 0) turn = 'me';
        draw();
        if (turn === 'cpu') { status.textContent = `${opp} começa…`; setTimeout(cpuPlay, 800); }
        else status.textContent = first >= 0 ? 'Você começa (maior carroça)' : 'Sua vez';
      }
      function draw() {
        $('[data-chain]').innerHTML = chain.map(t => tileHtml(t)).join('') || '<span class="faint">A mesa está vazia</span>';
        const ch = $('[data-chain]'); ch.scrollLeft = (ch.scrollWidth - ch.clientWidth) / 2;
        $('[data-cpuinfo]').textContent = `${opp}: ${cpu.length} pedra${cpu.length === 1 ? '' : 's'}`;
        $('[data-stockinfo]').textContent = `Monte: ${stock.length}`;
        const mine = turn === 'me' && !done, ok = new Set(playable(hand).map(t => `${t.a}${t.b}`));
        $('[data-hand]').innerHTML = hand.map((t, i) => tileHtml(t, `role="button" tabindex="0" data-i="${i}" aria-label="Pedra ${t.a} e ${t.b}"`, `${mine && ok.has(`${t.a}${t.b}`) ? 'can' : ''} ${pending === i ? 'sel' : ''}`)).join('');
        const noPlay = mine && !playable(hand).length;
        $('[data-draw]').disabled = !(noPlay && stock.length); $('[data-pass]').disabled = !(noPlay && !stock.length);
      }
      function afterMove(who) {
        passes = 0;
        if (!(who === 'me' ? hand : cpu).length) return finish(who === 'me' ? 'win' : 'loss', who === 'me' ? 'Você bateu!' : `${opp} bateu.`);
        turn = who === 'me' ? 'cpu' : 'me'; pending = null; draw();
        if (turn === 'cpu') { status.textContent = `${opp} está pensando…`; setTimeout(cpuPlay, 700 + Math.random() * 400); } else status.textContent = 'Sua vez';
      }
      function pass(who) {
        passes++;
        if (passes >= 2) { const a = sum(hand), b = sum(cpu); return finish(a < b ? 'win' : a > b ? 'loss' : 'draw', `Jogo trancado: ${a} × ${b} pontos`); }
        turn = who === 'me' ? 'cpu' : 'me'; draw();
        if (turn === 'cpu') { status.textContent = 'Você passou.'; setTimeout(cpuPlay, 700); } else status.textContent = `${opp} passou. Sua vez`;
      }
      function finish(res, msg) { done = true; status.textContent = msg; draw(); setTimeout(() => ctx.end({ result: res, summary: msg }), 900); }
      function cpuPlay() {
        if (done) return;
        let opts = playable(cpu);
        while (!opts.length && stock.length) { cpu.push(stock.pop()); opts = playable(cpu); }
        if (!opts.length) return pass('cpu');
        const t = opts.sort((x, y) => (y.a === y.b) - (x.a === x.b) || (y.a + y.b) - (x.a + x.b))[0];
        const side = !chain.length ? 'r' : can(t, 'r') ? 'r' : 'l';
        cpu.splice(cpu.indexOf(t), 1); put(t, side); draw(); afterMove('cpu');
      }
      function playMine(i, side) {
        const t = hand[i]; hand.splice(i, 1); put(t, side); pending = null; draw(); afterMove('me');
      }
      $('[data-hand]').addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b || turn !== 'me' || done) return;
        const i = +b.dataset.i, t = hand[i], l = can(t, 'l'), r = can(t, 'r');
        if (!chain.length || (l && !r)) return playMine(i, chain.length ? 'l' : 'r');
        if (r && !l) return playMine(i, 'r');
        if (l && r) { pending = i; draw(); status.innerHTML = 'Em qual ponta? <button class="btn btn-sm" data-side="l">Esquerda</button> <button class="btn btn-sm" data-side="r">Direita</button>'; }
      });
      status.addEventListener('click', e => { const s = e.target.closest('[data-side]'); if (s && pending != null) playMine(pending, s.dataset.side); });
      $('[data-draw]').onclick = () => { if (turn === 'me' && stock.length) { hand.push(stock.pop()); draw(); status.textContent = playable(hand).length ? 'Sua vez' : 'Ainda sem jogada…'; } };
      $('[data-pass]').onclick = () => pass('me');
      start();
      return () => { done = true; };
    }
  };

  /* =====================================================
     MAHJONG SOLITÁRIO — pares de peças livres
     ===================================================== */
  const MJ_SYMBOLS = ['🀄', '🌸', '🍀', '🐉', '🎋', '🌙', '⭐', '🔥', '💧', '🌿', '🎴', '🍎'];
  const MJ_LAYOUT = (() => {
    const p = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) p.push({ c, r, z: 0 });
    for (let r = 1; r <= 2; r++) for (let c = 1; c <= 4; c++) p.push({ c, r, z: 1 });
    p.push({ c: 2, r: 1, z: 2 }, { c: 3, r: 1, z: 2 });
    return p;
  })();
  AH.engines.mahjong = {
    mount(el, ctx) {
      let tiles, sel, done, hint;
      const clk = clock(el);
      el.innerHTML = `<div class="score-row"><div class="score-box"><small>Tempo</small><b data-time>0</b></div><div class="score-box"><small>Peças</small><b data-left>0</b></div>
          <button class="btn" data-hint aria-label="Dica">${ic('lightbulb')}</button><button class="btn" data-restart aria-label="Novo jogo">${ic('rotate-ccw')}</button></div>
        <div class="game-surface"><div class="mj" aria-label="Mahjong solitário"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Toque em duas peças livres iguais para removê-las. Livre = nada em cima e um dos lados vazio.</p>`;
      const board = el.querySelector('.mj'), $ = s => el.querySelector(s);
      const at = (list, c, r, z) => list.find(t => t.c === c && t.r === r && t.z === z);
      const isFree = (list, t) => !at(list, t.c, t.r, t.z + 1) && (!at(list, t.c - 1, t.r, t.z) || !at(list, t.c + 1, t.r, t.z));
      // dá símbolos tirando pares livres de trás para frente: o resultado sempre tem solução
      function assign(positions) {
        for (let attempt = 0; attempt < 50; attempt++) {
          let rest = positions.map(p => ({ ...p })), out = [], n = 0, ok = true;
          const syms = shuffle(MJ_SYMBOLS.slice()), total = positions.length / 2;
          const pairSyms = Array.from({ length: total }, (_, i) => syms[i % syms.length]);
          while (rest.length) {
            const free = rest.filter(t => isFree(rest, t));
            if (free.length < 2) { ok = false; break; }
            const [a, b] = shuffle(free.slice()).slice(0, 2), s = pairSyms[n++];
            out.push({ ...a, s }, { ...b, s });
            rest = rest.filter(t => t !== a && t !== b);
          }
          if (ok) return out;
        }
        return positions.map((p, i) => ({ ...p, s: MJ_SYMBOLS[(i >> 1) % 12] }));
      }
      function start() {
        clk.stop(); tiles = assign(MJ_LAYOUT).map((t, i) => ({ ...t, id: i })); sel = null; done = false; hint = null;
        board.innerHTML = tiles.map(t => `<button class="mj-t" data-id="${t.id}" style="--c:${t.c};--r:${t.r};--z:${t.z}" aria-label="Peça ${t.s}"><span>${t.s}</span></button>`).join('');
        layout(); refresh(); clk.start();
      }
      function layout() { const u = board.clientWidth / 13; board.style.setProperty('--u', u + 'px'); board.style.height = (u * 2.6 * 4 + u * 0.8) + 'px'; }
      function refresh() {
        $('[data-left]').textContent = tiles.length;
        board.querySelectorAll('[data-id]').forEach(b => {
          const t = tiles.find(x => x.id === +b.dataset.id);
          b.hidden = !t; if (!t) return;
          b.classList.toggle('free', isFree(tiles, t)); b.classList.toggle('sel', sel === t.id); b.classList.toggle('hint', hint && hint.includes(t.id));
        });
      }
      function pairs() {
        const free = tiles.filter(t => isFree(tiles, t)), out = [];
        free.forEach((a, i) => free.slice(i + 1).forEach(b => { if (a.s === b.s) out.push([a.id, b.id]); }));
        return out;
      }
      function afterRemove() {
        hint = null;
        if (!tiles.length) { done = true; refresh(); const s = clk.stop(); setTimeout(() => ctx.end({ result: 'win', score: s, summary: `Tabuleiro limpo em ${s}s` }), 500); return; }
        if (!pairs().length) { // sem jogadas: embaralha o que sobrou, sempre com solução
          const re = assign(tiles.map(({ c, r, z }) => ({ c, r, z })));
          tiles.forEach((t, i) => { const m = re.find(x => x.c === t.c && x.r === t.r && x.z === t.z); t.s = m.s; });
          board.querySelectorAll('[data-id]').forEach(b => { const t = tiles.find(x => x.id === +b.dataset.id); if (t) { b.firstChild.textContent = t.s; b.setAttribute('aria-label', 'Peça ' + t.s); } });
          AH.ui.toast('Sem jogadas — peças embaralhadas', 'info', 'shuffle');
        }
        refresh();
      }
      board.addEventListener('click', e => {
        const b = e.target.closest('[data-id]'); if (!b || done) return;
        const t = tiles.find(x => x.id === +b.dataset.id); if (!t || !isFree(tiles, t)) return;
        hint = null;
        if (sel == null) { sel = t.id; return refresh(); }
        if (sel === t.id) { sel = null; return refresh(); }
        const o = tiles.find(x => x.id === sel);
        if (o.s === t.s) { tiles = tiles.filter(x => x !== o && x !== t); sel = null; afterRemove(); } else { sel = t.id; refresh(); }
      });
      $('[data-hint]').onclick = () => { const p = pairs(); if (p.length) { hint = p[rnd(p.length)]; refresh(); } };
      $('[data-restart]').onclick = start;
      const onResize = () => layout();
      window.addEventListener('resize', onResize);
      start();
      return () => { clk.stop(); window.removeEventListener('resize', onResize); };
    }
  };

  /* =====================================================
     PACIÊNCIA — Klondike, uma carta por vez
     ===================================================== */
  AH.engines.paciencia = {
    mount(el, ctx) {
      const SU = ['♠', '♥', '♦', '♣'], RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
      let stock, waste, found, tab, sel, done;
      const clk = clock(el);
      el.innerHTML = `<div class="score-row"><div class="score-box"><small>Tempo</small><b data-time>0</b></div><div class="score-box"><small>Nas bases</small><b data-found>0</b></div><button class="btn" data-restart aria-label="Novo jogo">${ic('rotate-ccw')}</button></div>
        <div class="game-surface pk"><div class="pk-top"></div><div class="pk-tab"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Toque numa carta e depois no destino. Toque de novo na carta para mandá-la para a base.</p>`;
      const top = el.querySelector('.pk-top'), tabEl = el.querySelector('.pk-tab'), $ = s => el.querySelector(s);
      const red = c => c.s === 1 || c.s === 2;
      const cardHtml = (c, extra = '', style = '') => c.up
        ? `<button class="pk-c ${red(c) ? 'red' : ''} ${extra}" style="${style}" data-card="${c.id}"><b>${RK[c.r]}</b><i>${SU[c.s]}</i></button>`
        : `<span class="pk-c back" style="${style}" data-card="${c.id}"></span>`;
      function start() {
        clk.stop(); done = false; sel = null;
        const deck = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push({ s, r, up: false, id: s * 13 + r });
        shuffle(deck);
        tab = Array.from({ length: 7 }, (_, i) => deck.splice(0, i + 1)); tab.forEach(col => { col[col.length - 1].up = true; });
        stock = deck; waste = []; found = [[], [], [], []]; draw(); clk.start();
      }
      function locate(id) {
        for (let c = 0; c < 7; c++) { const i = tab[c].findIndex(x => x.id === id); if (i >= 0) return { kind: 'tab', c, i }; }
        const w = waste.findIndex(x => x.id === id); if (w === waste.length - 1 && w >= 0) return { kind: 'waste' };
        for (let f = 0; f < 4; f++) if (found[f].length && found[f][found[f].length - 1].id === id) return { kind: 'found', f };
        return null;
      }
      const cardsOf = loc => loc.kind === 'tab' ? tab[loc.c].slice(loc.i) : loc.kind === 'waste' ? [waste[waste.length - 1]] : [found[loc.f][found[loc.f].length - 1]];
      const fits = (cards, col) => { const top = col[col.length - 1], c = cards[0]; return top ? top.up && red(top) !== red(c) && top.r === c.r + 1 : c.r === 12; };
      const toFound = (c, f) => { const t = found[f][found[f].length - 1]; return t ? t.s === c.s && c.r === t.r + 1 : c.r === 0; };
      function remove(loc) {
        if (loc.kind === 'tab') { const moved = tab[loc.c].splice(loc.i); const last = tab[loc.c][tab[loc.c].length - 1]; if (last) last.up = true; return moved; }
        if (loc.kind === 'waste') return [waste.pop()];
        return [found[loc.f].pop()];
      }
      function draw() {
        const w = waste[waste.length - 1];
        top.innerHTML = `<button class="pk-slot" data-stock aria-label="Monte">${stock.length ? '<span class="pk-c back"></span>' : '<span class="pk-redo">↻</span>'}</button>
          <div class="pk-slot">${w ? cardHtml(w, sel?.id === w.id ? 'sel' : '') : ''}</div><div></div>
          ${found.map((f, i) => `<div class="pk-slot found" data-found="${i}">${f.length ? cardHtml(f[f.length - 1], sel?.id === f[f.length - 1].id ? 'sel' : '') : `<span class="pk-ph">${SU[i]}</span>`}</div>`).join('')}`;
        tabEl.innerHTML = tab.map((col, c) => `<div class="pk-col" data-col="${c}">${col.map((card, i) => cardHtml(card, sel?.id === card.id ? 'sel' : '', `top:${col.slice(0, i).reduce((s, x) => s + (x.up ? 1 : 0.42), 0) * 1.7}em`)).join('')}</div>`).join('');
        const fs = parseFloat(getComputedStyle(tabEl).fontSize) || 16;
        tabEl.querySelectorAll('.pk-col').forEach((colEl, c) => { const n = tab[c].slice(0, -1).reduce((s, x) => s + (x.up ? 1 : 0.42), 0); colEl.style.minHeight = (colEl.clientWidth * 1.4 + n * 1.7 * fs) + 'px'; });
        $('[data-found]').textContent = found.reduce((s, f) => s + f.length, 0);
        if (found.every(f => f.length === 13)) win();
      }
      function win() {
        if (done) return; done = true; const s = clk.stop();
        setTimeout(() => ctx.end({ result: 'win', score: s, summary: `Paciência completa em ${s}s` }), 600);
      }
      function tryMove(loc, target) {
        const cards = cardsOf(loc);
        if (target.kind === 'col' && fits(cards, tab[target.c]) && !(loc.kind === 'tab' && loc.c === target.c)) { tab[target.c].push(...remove(loc)); return true; }
        if (target.kind === 'found' && cards.length === 1 && toFound(cards[0], target.f)) { found[target.f].push(...remove(loc)); return true; }
        return false;
      }
      el.addEventListener('click', e => {
        if (done) return;
        if (e.target.closest('[data-stock]')) { if (stock.length) { const c = stock.pop(); c.up = true; waste.push(c); } else { stock = waste.reverse().map(c => ({ ...c, up: false })); waste = []; } sel = null; return draw(); }
        const cardEl = e.target.closest('[data-card]'), colEl = e.target.closest('[data-col]'), foundEl = e.target.closest('[data-found]');
        const loc = cardEl ? locate(+cardEl.dataset.card) : null;
        const clicked = cardEl ? (loc && cardsOf(loc)[0].up !== false ? loc : null) : null;
        if (sel) {
          const from = locate(sel.id);
          if (from) {
            // clicar de novo na mesma carta tenta a base
            if (clicked && cardEl && +cardEl.dataset.card === sel.id) {
              const c = cardsOf(from);
              if (c.length === 1) for (let f = 0; f < 4; f++) if (toFound(c[0], f)) { found[f].push(...remove(from)); sel = null; return draw(); }
              sel = null; return draw();
            }
            let target = null;
            if (foundEl) target = { kind: 'found', f: +foundEl.dataset.found };
            else if (colEl) target = { kind: 'col', c: +colEl.dataset.col };
            else if (clicked && clicked.kind === 'found') target = { kind: 'found', f: clicked.f };
            if (target && tryMove(from, target)) { sel = null; return draw(); }
          }
          sel = null;
        }
        if (clicked && cardEl.classList.contains('pk-c') && !cardEl.classList.contains('back')) { const c = cardsOf(clicked)[0]; if (c.up) sel = c; }
        draw();
      });
      $('[data-restart]').onclick = start;
      start();
      return () => clk.stop();
    }
  };

  /* =====================================================
     XADREZ — você de brancas contra a CPU (roque, en passant e promoção)
     ===================================================== */
  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  AH.engines.xadrez = {
    mount(el, ctx) {
      const opp = ctx.opponent?.username || 'CPU';
      let diff = ctx.mode === 'duel' ? (ctx.difficulty ?? 1) : 1, st, sel, legalNow, done, last = [], plies = 0;
      el.innerHTML = `${ctx.mode === 'solo' ? diffTabs(['Fácil', 'Médio', 'Difícil'], diff) : ''}
        <p data-status style="text-align:center;font-weight:700;margin-bottom:10px" aria-live="polite"></p>
        <div class="game-surface"><div class="ch" role="grid" aria-label="Tabuleiro de xadrez"></div></div>
        <p class="faint" style="text-align:center;margin-top:12px">Você joga com as brancas (embaixo). Toque na peça e depois na casa de destino.</p>`;
      const grid = el.querySelector('.ch'), status = el.querySelector('[data-status]');
      const col = p => p ? p[0] : '';
      const inb = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
      const initial = () => {
        const b = Array(64).fill(''), back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
        for (let c = 0; c < 8; c++) { b[c] = 'b' + back[c]; b[8 + c] = 'bP'; b[48 + c] = 'wP'; b[56 + c] = 'w' + back[c]; }
        return { b, turn: 'w', cas: { wK: 1, wQ: 1, bK: 1, bQ: 1 }, ep: -1 };
      };
      const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
      const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
      const DG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ST = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      function attacked(b, sq, by) {
        const r = (sq / 8) | 0, c = sq % 8, pd = by === 'w' ? 1 : -1; // peão branco ataca "para cima": vem de baixo
        for (const dc of [-1, 1]) { const y = r + pd, x = c + dc; if (inb(y, x) && b[y * 8 + x] === by + 'P') return true; }
        for (const [dy, dx] of KN) { const y = r + dy, x = c + dx; if (inb(y, x) && b[y * 8 + x] === by + 'N') return true; }
        for (const [dy, dx] of KG) { const y = r + dy, x = c + dx; if (inb(y, x) && b[y * 8 + x] === by + 'K') return true; }
        for (const [dirs, kinds] of [[DG, 'BQ'], [ST, 'RQ']]) for (const [dy, dx] of dirs) {
          let y = r + dy, x = c + dx;
          while (inb(y, x)) { const p = b[y * 8 + x]; if (p) { if (col(p) === by && kinds.includes(p[1])) return true; break; } y += dy; x += dx; }
        }
        return false;
      }
      const kingSq = (b, side) => b.indexOf(side + 'K');
      const inCheck = (b, side) => attacked(b, kingSq(b, side), side === 'w' ? 'b' : 'w');
      function pseudo(s, side) {
        const { b } = s, out = [], foe = side === 'w' ? 'b' : 'w';
        for (let i = 0; i < 64; i++) {
          const p = b[i]; if (col(p) !== side) continue;
          const r = (i / 8) | 0, c = i % 8, k = p[1], add = (to, extra) => out.push({ from: i, to, ...extra });
          if (k === 'P') {
            const dir = side === 'w' ? -1 : 1, start = side === 'w' ? 6 : 1, last = side === 'w' ? 0 : 7;
            const push = to => { if (((to / 8) | 0) === last) add(to, { promo: 'Q' }); else add(to); };
            if (inb(r + dir, c) && !b[(r + dir) * 8 + c]) { push((r + dir) * 8 + c); if (r === start && !b[(r + 2 * dir) * 8 + c]) add((r + 2 * dir) * 8 + c, { dbl: true }); }
            for (const dc of [-1, 1]) {
              const y = r + dir, x = c + dc; if (!inb(y, x)) continue; const t = y * 8 + x;
              if (col(b[t]) === foe) push(t); else if (t === s.ep) add(t, { ep: true });
            }
          } else if (k === 'N' || k === 'K') {
            for (const [dy, dx] of (k === 'N' ? KN : KG)) { const y = r + dy, x = c + dx; if (inb(y, x) && col(b[y * 8 + x]) !== side) add(y * 8 + x); }
            if (k === 'K' && !attacked(b, i, foe)) {
              const row = side === 'w' ? 56 : 0;
              if (i === row + 4) {
                if (s.cas[side + 'K'] && !b[row + 5] && !b[row + 6] && b[row + 7] === side + 'R' && !attacked(b, row + 5, foe) && !attacked(b, row + 6, foe)) add(row + 6, { castle: 'K' });
                if (s.cas[side + 'Q'] && !b[row + 3] && !b[row + 2] && !b[row + 1] && b[row] === side + 'R' && !attacked(b, row + 3, foe) && !attacked(b, row + 2, foe)) add(row + 2, { castle: 'Q' });
              }
            }
          } else {
            for (const [dy, dx] of (k === 'B' ? DG : k === 'R' ? ST : DG.concat(ST))) {
              let y = r + dy, x = c + dx;
              while (inb(y, x)) { const q = b[y * 8 + x]; if (col(q) === side) break; add(y * 8 + x); if (q) break; y += dy; x += dx; }
            }
          }
        }
        return out;
      }
      function make(s, m) {
        const b = s.b.slice(), p = b[m.from], side = col(p), cas = { ...s.cas };
        b[m.to] = m.promo ? side + m.promo : p; b[m.from] = '';
        if (m.ep) b[m.to + (side === 'w' ? 8 : -8)] = '';
        if (m.castle) { const row = side === 'w' ? 56 : 0; if (m.castle === 'K') { b[row + 5] = side + 'R'; b[row + 7] = ''; } else { b[row + 3] = side + 'R'; b[row] = ''; } }
        if (p[1] === 'K') { cas[side + 'K'] = 0; cas[side + 'Q'] = 0; }
        [[56, 'wQ'], [63, 'wK'], [0, 'bQ'], [7, 'bK']].forEach(([sq, k]) => { if (m.from === sq || m.to === sq) cas[k] = 0; });
        return { b, turn: side === 'w' ? 'b' : 'w', cas, ep: m.dbl ? (m.from + m.to) / 2 : -1 };
      }
      const legal = (s, side) => pseudo(s, side).filter(m => !inCheck(make(s, m).b, side));
      function evalS(s) {
        let v = 0;
        for (let i = 0; i < 64; i++) {
          const p = s.b[i]; if (!p) continue;
          const r = (i / 8) | 0, c = i % 8, k = p[1], sgn = p[0] === 'b' ? 1 : -1;
          let x = VAL[k];
          const cen = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5)) + 0.5;
          if (k === 'N' || k === 'B') x += cen * 9; else if (k === 'P') x += (p[0] === 'b' ? r : 7 - r) * 6 + (c > 1 && c < 6 ? cen * 3 : 0); else if (k === 'Q') x += cen * 2;
          v += sgn * x;
        }
        return v; // + = bom para as pretas (CPU)
      }
      function search(s, depth, alpha, beta) {
        const side = s.turn, ms = legal(s, side);
        if (!ms.length) return inCheck(s.b, side) ? (side === 'b' ? -90000 - depth : 90000 + depth) : 0;
        if (!depth) return evalS(s);
        ms.sort((a, c) => (s.b[c.to] ? VAL[s.b[c.to][1]] : 0) - (s.b[a.to] ? VAL[s.b[a.to][1]] : 0));
        let best = side === 'b' ? -Infinity : Infinity;
        for (const m of ms) {
          const v = search(make(s, m), depth - 1, alpha, beta);
          if (side === 'b') { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
          if (beta <= alpha) break;
        }
        return best;
      }
      function cpuMove() {
        const ms = legal(st, 'b'), depth = [1, 2, 3][diff] || 2;
        let best = -Infinity, pick = ms[0];
        for (const m of shuffle(ms.slice())) {
          const v = search(make(st, m), depth - 1, -Infinity, Infinity) + (diff === 0 ? Math.random() * 180 : Math.random() * 6);
          if (v > best) { best = v; pick = m; }
        }
        return pick;
      }
      function start() { st = initial(); sel = null; done = false; last = []; plies = 0; legalNow = legal(st, 'w'); draw(); status.textContent = 'Sua vez (brancas)'; }
      function draw() {
        const dests = new Set(sel != null ? legalNow.filter(m => m.from === sel).map(m => m.to) : []);
        const chk = !done && inCheck(st.b, st.turn) ? kingSq(st.b, st.turn) : -1;
        grid.innerHTML = st.b.map((p, i) => {
          const dark = ((((i / 8) | 0) + i % 8) % 2) === 1;
          return `<button class="ch-s ${dark ? 'dk' : 'lt'} ${last.includes(i) ? 'last' : ''} ${sel === i ? 'sel' : ''} ${dests.has(i) ? (p ? 'cap' : 'dest') : ''} ${chk === i ? 'chk' : ''}" data-i="${i}" aria-label="Casa ${'abcdefgh'[i % 8]}${8 - ((i / 8) | 0)}${p ? ' ' + p : ''}">${p ? `<span class="ch-p ${p[0]}">${GLYPH[p[1]]}︎</span>` : ''}</button>`;
        }).join('');
      }
      function after() {
        plies++;
        legalNow = legal(st, st.turn);
        const chk = inCheck(st.b, st.turn);
        if (!legalNow.length) {
          done = true; draw();
          if (chk) { const won = st.turn === 'b'; status.textContent = won ? 'Xeque-mate! Você venceu!' : `Xeque-mate. ${opp} venceu.`; return setTimeout(() => ctx.end({ result: won ? 'win' : 'loss', summary: status.textContent }), 900); }
          status.textContent = 'Empate por afogamento.'; return setTimeout(() => ctx.end({ result: 'draw', summary: status.textContent }), 900);
        }
        if (plies >= 240) { done = true; status.textContent = 'Empate por limite de lances.'; return setTimeout(() => ctx.end({ result: 'draw', summary: status.textContent }), 700); }
        draw();
        if (st.turn === 'b') { status.textContent = `${opp} está pensando…${chk ? '' : ''}`; setTimeout(() => { if (done) return; const m = cpuMove(); st = make(st, m); last = [m.from, m.to]; sel = null; after(); }, 350); }
        else status.textContent = chk ? 'Xeque! Sua vez' : 'Sua vez';
      }
      grid.addEventListener('click', e => {
        const b = e.target.closest('[data-i]'); if (!b || done || st.turn !== 'w') return;
        const i = +b.dataset.i, m = sel != null ? legalNow.find(x => x.from === sel && x.to === i) : null;
        if (m) { st = make(st, m); last = [m.from, m.to]; sel = null; return after(); }
        sel = col(st.b[i]) === 'w' && legalNow.some(x => x.from === i) ? (sel === i ? null : i) : null; draw();
      });
      bindDiff(el, i => { diff = i; start(); });
      start();
      return () => { done = true; };
    }
  };

  /* =====================================================
     GAMÃO — você (brancas, de 24 a 1) contra a CPU
     Pontos 0..23; positivo = suas peças, negativo = da CPU.
     Você anda para índices menores e tira as peças abaixo de 0; a CPU anda para os maiores.
     ===================================================== */
  AH.engines.gamao = {
    mount(el, ctx) {
      const opp = ctx.opponent?.username || 'CPU';
      let S, turn, dice, used, sel, done, rolled, msgTimer;
      el.innerHTML = `<div class="game-surface gm">
        <div class="gm-info"><span>${esc(opp)}: <b data-cpuoff>0</b> fora · <b data-cpubar>0</b> na barra</span></div>
        <div class="gm-board" data-board></div>
        <div class="gm-info"><span>Você: <b data-meoff>0</b> fora</span><button class="btn btn-sm" data-bar hidden>${ic('log-in')} Entrar da barra (<b data-mebar>0</b>)</button><button class="btn btn-sm" data-off hidden>${ic('log-out')} Tirar peça</button></div>
        <div class="gm-dice" data-dice></div>
        <p data-status style="text-align:center;font-weight:700;margin:10px 0" aria-live="polite"></p>
        <div class="row-wrap" style="justify-content:center"><button class="btn btn-lg btn-primary" data-roll>${ic('dices')} Rolar dados</button></div>
        <p class="faint" style="text-align:center;margin-top:10px">Mova todas as suas peças (brancas) para o canto inferior direito e retire-as. Toque na peça e no destino.</p></div>`;
      const $ = s => el.querySelector(s), status = $('[data-status]');
      const init = () => { const pts = Array(24).fill(0); pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5; pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5; return { pts, bar: { 1: 0, '-1': 0 }, off: { 1: 0, '-1': 0 } }; };
      const clone = s => ({ pts: s.pts.slice(), bar: { ...s.bar }, off: { ...s.off } });
      // sentido de cada lado: você (1) vai de 23 para 0; a CPU (-1) de 0 para 23
      const entry = (side, d) => side === 1 ? 24 - d : d - 1;
      const home = (s, side) => s.bar[side] === 0 && s.pts.every((v, i) => !(v * side > 0) || (side === 1 ? i <= 5 : i >= 18));
      const mine = (v, side) => v * side > 0;
      function moves(s, side, d) {
        const out = [];
        if (s.bar[side] > 0) { const t = entry(side, d); if (s.pts[t] * side >= -1) out.push({ from: 'bar', to: t }); return out; }
        const allHome = home(s, side);
        for (let i = 0; i < 24; i++) {
          if (!mine(s.pts[i], side)) continue;
          const t = i - d * side;
          if (t >= 0 && t < 24) { if (s.pts[t] * side >= -1) out.push({ from: i, to: t }); continue; }
          if (allHome) {
            const need = side === 1 ? i + 1 : 24 - i;
            const behind = s.pts.some((v, k) => mine(v, side) && (side === 1 ? k > i : k < i));
            if (d === need || (d > need && !behind)) out.push({ from: i, to: 'off' });
          }
        }
        return out;
      }
      function apply(s, side, m) {
        const t = clone(s);
        if (m.from === 'bar') t.bar[side]--; else t.pts[m.from] -= side;
        if (m.to === 'off') t.off[side]++;
        else { if (t.pts[m.to] * side === -1) { t.pts[m.to] = 0; t.bar[-side]++; } t.pts[m.to] += side; }
        return t;
      }
      const dieFor = (side, m) => m.from === 'bar' ? (side === 1 ? 24 - m.to : m.to + 1) : m.to === 'off' ? null : Math.abs(m.from - m.to);
      function anyMoves(s, side, rem) { return rem.some(d => moves(s, side, d).length); }
      // ---- CPU: testa todas as sequências possíveis dos dados e escolhe a melhor posição final
      function heur(s) {
        let v = (s.off[-1] - s.off[1]) * 30 + (s.bar[1] - s.bar[-1]) * 25;
        const pipMe = s.pts.reduce((a, x, i) => a + (x > 0 ? x * (i + 1) : 0), 0) + s.bar[1] * 25;
        const pipCpu = s.pts.reduce((a, x, i) => a + (x < 0 ? -x * (24 - i) : 0), 0) + s.bar[-1] * 25;
        v += (pipMe - pipCpu) * 1.2;
        s.pts.forEach((x, i) => { if (x === -1) v -= 9 + (s.pts.some((y, k) => y > 0 && k > i) ? 6 : 0); if (x <= -2) v += 5; if (x === 1) v += 5; });
        return v;
      }
      function cpuPlan(s, dc) {
        let best = { score: -Infinity, seq: [] };
        const rec = (st, rem, seq) => {
          let any = false;
          new Set(rem).forEach(d => {
            moves(st, -1, d).forEach(m => { any = true; const r = rem.slice(); r.splice(r.indexOf(d), 1); rec(apply(st, -1, m), r, [...seq, m]); });
          });
          if (!any) { const sc = heur(st) + seq.length * 1000; if (sc > best.score) best = { score: sc, seq }; }
        };
        rec(s, dc, []);
        return best.seq;
      }
      function draw() {
        const b = $('[data-board]'), sels = sel != null ? targets() : [];
        const cell = (i) => {
          const v = S.pts[i], n = Math.abs(v), cls = v > 0 ? 'w' : 'b', dest = sels.some(m => m.to === i);
          const stack = Array.from({ length: Math.min(n, 5) }, () => `<i class="gm-c ${cls}"></i>`).join('') + (n > 5 ? `<em>${n}</em>` : '');
          return `<button class="gm-p ${i % 2 ? 'odd' : 'even'} ${dest ? 'dest' : ''} ${sel === i ? 'sel' : ''}" data-p="${i}" aria-label="Ponto ${i + 1}: ${n} peça${n === 1 ? '' : 's'}">${stack}</button>`;
        };
        const topIdx = Array.from({ length: 12 }, (_, k) => 12 + k), botIdx = Array.from({ length: 12 }, (_, k) => 11 - k);
        b.innerHTML = `<div class="gm-row top">${topIdx.map(cell).join('')}</div><div class="gm-row bottom">${botIdx.map(cell).join('')}</div>`;
        $('[data-cpuoff]').textContent = S.off[-1]; $('[data-cpubar]').textContent = S.bar[-1]; $('[data-meoff]').textContent = S.off[1]; $('[data-mebar]').textContent = S.bar[1];
        $('[data-bar]').hidden = !(turn === 1 && rolled && S.bar[1] > 0);
        $('[data-bar]').classList.toggle('btn-primary', sel === 'bar');
        $('[data-off]').hidden = !(sel != null && sels.some(m => m.to === 'off'));
        $('[data-dice]').innerHTML = dice.map((d, i) => `<span class="gm-die ${used[i] ? 'used' : ''}">${d}</span>`).join('');
        $('[data-roll]').hidden = !(turn === 1 && !rolled && !done);
      }
      const remaining = () => dice.filter((_, i) => !used[i]);
      function targets() { const rem = [...new Set(remaining())]; return rem.flatMap(d => moves(S, 1, d).filter(m => m.from === sel)); }
      function say(t) { status.textContent = t; }
      function newGame() { S = init(); turn = 1; dice = []; used = []; sel = null; done = false; rolled = false; draw(); say('Role os dados para começar'); }
      function roll(side) {
        const a = 1 + rnd(6), b = 1 + rnd(6);
        dice = a === b ? [a, a, a, a] : [a, b]; used = dice.map(() => false); rolled = true; sel = null;
      }
      function endTurnIfStuck() {
        if (checkWin()) return;
        if (turn === 1) {
          if (!remaining().length) return cpuTurn();
          if (!anyMoves(S, 1, remaining())) { say('Sem jogadas possíveis — vez da CPU.'); draw(); msgTimer = setTimeout(cpuTurn, 1100); return; }
          say(S.bar[1] ? 'Você está na barra: entre com uma peça' : 'Sua vez — escolha uma peça'); draw();
        }
      }
      function checkWin() {
        if (S.off[1] === 15 || S.off[-1] === 15) {
          done = true; const won = S.off[1] === 15; say(won ? 'Você tirou todas as peças!' : `${opp} tirou todas as peças.`); draw();
          setTimeout(() => ctx.end({ result: won ? 'win' : 'loss', summary: status.textContent }), 900); return true;
        }
        return false;
      }
      function cpuTurn() {
        if (done) return; turn = -1; rolled = false; sel = null; draw(); say(`${opp} está jogando…`);
        msgTimer = setTimeout(() => {
          roll(-1); const rolledNow = dice.slice(); draw();
          const seq = cpuPlan(S, dice.slice());
          const step = i => {
            if (done) return;
            if (i >= seq.length) { if (!seq.length) say(`${opp} não tem jogada.`); return msgTimer = setTimeout(() => { turn = 1; rolled = false; dice = []; used = []; draw(); say('Role os dados'); }, 900); }
            S = apply(S, -1, seq[i]); const d = dieFor(-1, seq[i]);
            const k = d == null ? used.findIndex((u, j) => !u && dice[j] >= 1) : used.findIndex((u, j) => !u && dice[j] === d); if (k >= 0) used[k] = true; else used[used.findIndex(u => !u)] = true;
            draw(); if (checkWin()) return; msgTimer = setTimeout(() => step(i + 1), 520);
          };
          msgTimer = setTimeout(() => step(0), 700);
        }, 700);
      }
      function doMove(m) {
        let d = dieFor(1, m), k;
        if (d == null) { // tirar peça: usa o menor dado que serve
          const need = m.from + 1, cands = used.map((u, j) => (!u && dice[j] >= need ? j : -1)).filter(j => j >= 0).sort((x, y) => dice[x] - dice[y]);
          k = cands[0];
        } else k = used.findIndex((u, j) => !u && dice[j] === d);
        if (k < 0 || k == null) return;
        used[k] = true; S = apply(S, 1, m); sel = null; endTurnIfStuck();
      }
      $('[data-roll]').onclick = () => { roll(1); sel = null; draw(); endTurnIfStuck(); };
      $('[data-bar]').onclick = () => { sel = 'bar'; draw(); };
      $('[data-off]').onclick = () => { const m = targets().find(x => x.to === 'off'); if (m) doMove(m); };
      $('[data-board]').addEventListener('click', e => {
        const p = e.target.closest('[data-p]'); if (!p || turn !== 1 || !rolled || done) return;
        const i = +p.dataset.p;
        if (sel != null) { const m = targets().find(x => x.to === i); if (m) return doMove(m); }
        if (S.bar[1] > 0) { sel = 'bar'; draw(); return; }
        const rem = [...new Set(remaining())];
        sel = mine(S.pts[i], 1) && rem.some(d => moves(S, 1, d).some(m => m.from === i)) ? (sel === i ? null : i) : null; draw();
      });
      newGame();
      return () => { done = true; clearTimeout(msgTimer); };
    }
  };
})();
