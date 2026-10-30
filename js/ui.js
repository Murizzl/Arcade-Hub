/* =========================================================
   UI — componentes reutilizáveis (funções que retornam HTML)
   e utilitários de interação (toast, modal, confetti).
   ========================================================= */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, attrs = '') => `<i data-lucide="${name}" ${attrs}></i>`;
  const fmt = n => Number(n || 0).toLocaleString('pt-BR');

  function timeAgo(t) {
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'agora mesmo';
    const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24); if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`;
    return new Date(t).toLocaleDateString('pt-BR');
  }
  const dateBR = d => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

  function avatar(p, size = 'md', opts = {}) {
    const a = p.avatar || {};
    const frame = a.frame && a.frame !== 'none' ? ' frame-' + a.frame : '';
    let status = '';
    if (opts.status && p !== AH.store.user) status = `<span class="status ${p.online ? (p.playing ? 'play' : 'on') : ''}" aria-hidden="true"></span>`;
    return `<span class="avatar av-${size}${frame}" style="--av:${a.color}" role="img" aria-label="Avatar de ${esc(p.username)}">${a.photo ? `<img src="${esc(a.photo)}" alt="">` : ic(a.icon || 'user')}${status}</span>`;
  }

  function emblem(n, size = '') {
    const pr = AH.store.prestigeOf(n);
    return `<span class="emblem ${size}" style="--c:${pr.color}" title="Prestígio ${n} · ${esc(pr.name)}" aria-label="Prestígio ${n}">${n > 0 ? ic(pr.icon) : ic('shield')}</span>`;
  }

  function thumb(g, label = '') {
    return `<div class="thumb" style="--c1:${g.c1};--c2:${g.c2};--pat:${g.pat};--ps:${g.patSize}">
      <span class="thumb-art" aria-hidden="true">${ic(g.icon)}</span>${label}
    </div>`;
  }

  function gameStat(g) {
    const s = AH.store.user?.stats[g.id];
    if (!g.playable) return `<span class="gc-stat">${ic('hammer')}<span>Em breve</span></span>`;
    if (s && s.best != null) return `<span class="gc-stat">${ic('trophy')}<span>${esc(g.scoreLabel)}: ${fmt(s.best)}</span></span>`;
    if (s) return `<span class="gc-stat">${ic('gamepad-2')}<span>${s.played} partidas</span></span>`;
    return `<span class="gc-stat">${ic('users')}<span>${fmt(g.players)}</span></span>`;
  }

  function gameCard(g) {
    const fav = AH.store.user?.favorites.includes(g.id);
    const cat = AH.categories.find(c => c.id === g.cats[0]);
    const label = !g.playable ? `<span class="thumb-label tag">${ic('hammer')} <span class="lbl-long">Em desenvolvimento</span><span class="lbl-short">Em breve</span></span>`
      : g.isNew ? `<span class="thumb-label tag tag-warning">Novo</span>` : '';
    return `<article class="game-card" data-game="${g.id}">
      <a class="gc-open" href="#/game/${g.id}" aria-label="Abrir ${esc(g.name)}"></a>
      ${thumb(g, label)}
      <button class="fav-btn ${fav ? 'on' : ''}" data-fav="${g.id}" aria-pressed="${!!fav}" aria-label="${fav ? 'Remover dos' : 'Adicionar aos'} favoritos">${ic('heart')}</button>
      <div class="gc-body">
        <div class="gc-title">${esc(g.name)}</div>
        <div class="gc-meta">${ic(cat.icon)} ${esc(cat.name)}${g.duel ? `<span class="gc-duel"> · ${ic('swords')} Duelo</span>` : ''}</div>
        <div class="gc-foot">
          ${gameStat(g)}
          ${g.playable
            ? `<a class="btn btn-primary btn-sm" href="#/play/${g.id}">${ic('play')} Jogar</a>`
            : `<a class="btn btn-sm" href="#/game/${g.id}">Ver</a>`}
        </div>
      </div>
    </article>`;
  }

  function empty(icon, title, text, action = '') {
    return `<div class="empty"><div class="empty-ic">${ic(icon)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action ? `<div style="margin-top:16px">${action}</div>` : ''}</div>`;
  }

  function skeletonGrid(n = 8) {
    return `<div class="game-grid" aria-busy="true" aria-label="Carregando">${Array.from({ length: n }, () => '<div class="skeleton sk-card"></div>').join('')}</div>`;
  }

  // ---------- Toast ----------
  function toast(msg, type = 'info', icon) {
    const root = document.getElementById('toasts');
    const el = document.createElement('div');
    const icons = { info: 'info', success: 'check-circle-2', error: 'alert-circle', xp: 'zap' };
    el.className = 'toast ' + type;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="t-ic">${ic(icon || icons[type])}</span><span>${msg}</span>`;
    root.appendChild(el);
    refreshIcons(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, type === 'xp' ? 3200 : 2800);
    while (root.children.length > 4) root.firstChild.remove();
  }

  function rewardToasts(r) {
    if (!r) return;
    if (r.xp) toast(`<b>+${r.xp} XP</b> &nbsp;·&nbsp; +${r.coins} moedas`, 'xp', 'zap');
    if (r.record) toast('Novo recorde pessoal!', 'success', 'trophy');
    (r.levelUps || []).forEach(e => toast(`Subiu para o nível <b>${e.level}</b>!`, 'success', 'trending-up'));
    (r.achievements || []).forEach(a => toast(`Conquista: <b>${esc(a.name)}</b>`, 'success', 'award'));
    if ((r.levelUps || []).length) { confetti(70); levelBurst(r.levelUps[r.levelUps.length - 1].level); }
  }

  // Comemoração grande ao subir de nível
  function levelBurst(level) {
    const el = document.createElement('div');
    el.className = 'lvl-burst'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="lb-card"><i class="lb-rays"></i><small>SUBIU DE NÍVEL</small><b>${level}</b><span>Continue assim!</span></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // Números "contando" até o valor final (estatísticas e cartões)
  function countUp(root) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.qs b, .stat-box b, .kv b').forEach(b => {
      const m = b.textContent.trim().match(/^([\d.]+)(%?)$/);
      if (!m || b.children.length) return;
      const target = parseInt(m[1].replace(/\./g, ''), 10);
      if (!target || target < 3) return;
      const t0 = performance.now(), dur = 700;
      const step = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        b.textContent = fmt(Math.round(target * e)) + m[2];
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- Modal ----------
  let lastFocus = null;
  function modal({ title, body, actions = [], wide = false, icon, iconColor, onMount, dismissable = true }) {
    const root = document.getElementById('modalRoot');
    lastFocus = document.activeElement;
    root.innerHTML = `<div class="modal-backdrop" data-close></div>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        ${icon ? `<div class="modal-ic" style="background:${iconColor || 'var(--primary-soft)'};color:${iconColor ? '#fff' : 'var(--primary)'}">${ic(icon)}</div>` : ''}
        <div class="modal-head"><h2 id="modalTitle">${title}</h2>${dismissable ? `<button class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button>` : ''}</div>
        <div class="modal-body">${body || ''}</div>
        ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-act="${i}">${a.icon ? ic(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
      </div>`;
    root.classList.add('open');
    document.body.style.overflow = 'hidden';
    refreshIcons(root);
    const m = root.querySelector('.modal');
    root.onclick = e => {
      if (e.target.closest('[data-close]') && dismissable) return close();
      const b = e.target.closest('[data-act]');
      if (b) { const a = actions[+b.dataset.act]; const keep = a.onClick && a.onClick(m) === false; if (!keep && root.contains(m)) close(); }
    };
    root.onkeydown = e => {
      if (e.key === 'Escape' && dismissable) close();
      if (e.key === 'Tab') { // focus trap
        const f = [...m.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    onMount && onMount(m);
    const first = m.querySelector('input, .modal-foot .btn:last-child, button');
    first && first.focus();
    return m;
  }
  function close() {
    const root = document.getElementById('modalRoot');
    root.classList.remove('open'); root.innerHTML = '';
    document.body.style.overflow = '';
    lastFocus && document.contains(lastFocus) && lastFocus.focus();
  }
  function confirm({ title, text, okLabel = 'Confirmar', danger = false, icon = 'alert-triangle', onOk }) {
    modal({
      title, icon, iconColor: danger ? 'var(--danger)' : undefined,
      body: `<p class="muted">${text}</p>`,
      actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: onOk }]
    });
  }

  function confetti(n = 80) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = document.createElement('div'); el.className = 'confetti';
    const colors = ['#6c4cf5', '#ff8a3d', '#1fb37a', '#ef4565', '#f5b524', '#2a8bd8'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
      p.style.animationDelay = Math.random() * .4 + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      el.appendChild(p);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function refreshIcons(root) {
    if (window.lucide) lucide.createIcons({ attrs: { 'aria-hidden': 'true' }, nameAttr: 'data-lucide' });
  }

  // ---------- Listas roláveis (carrosséis de jogos e chips) ----------
  // No desktop não há como "deslizar": mostramos setas e deixamos arrastar com o mouse.
  let drag = null, suppressClick = false;
  function enhanceScrollers(root = document) {
    root.querySelectorAll('.game-row:not([data-scroller]), .chips:not([data-scroller])').forEach(el => {
      el.dataset.scroller = '1';
      const wrap = document.createElement('div');
      wrap.className = 'scroller';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
      const btn = dir => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sc-btn ' + dir; b.tabIndex = -1;
        b.setAttribute('aria-label', dir === 'prev' ? 'Rolar para a esquerda' : 'Rolar para a direita');
        b.innerHTML = ic(dir === 'prev' ? 'chevron-left' : 'chevron-right');
        b.onclick = () => el.scrollBy({ left: (dir === 'prev' ? -1 : 1) * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' });
        return b;
      };
      wrap.append(btn('prev'), btn('next'));
      const update = () => {
        const max = el.scrollWidth - el.clientWidth;
        wrap.classList.toggle('can-prev', el.scrollLeft > 4);
        wrap.classList.toggle('can-next', el.scrollLeft < max - 4);
      };
      el.addEventListener('scroll', update, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(update).observe(el); else addEventListener('resize', update);
      update();
    });
    refreshIcons();
  }
  const scrollerOf = t => t.closest?.('.scroller > .game-row, .scroller > .chips');
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollerOf(e.target);
    if (el && el.scrollWidth > el.clientWidth) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false };
  });
  document.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; drag.el.classList.add('dragging'); }
    if (drag.moved) drag.el.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); }
    drag.el.classList.remove('dragging'); drag = null;
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
  document.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('dragstart', e => { if (scrollerOf(e.target)) e.preventDefault(); });

  AH.ui = { enhanceScrollers, levelBurst, countUp, esc, ic, fmt, timeAgo, dateBR, avatar, emblem, thumb, gameCard, empty, skeletonGrid, toast, rewardToasts, modal, close, confirm, confetti, refreshIcons };
})();
