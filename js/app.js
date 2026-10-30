/* =========================================================
   App — roteador por hash, shell (navegação/cabeçalho),
   tema e eventos globais.
   ========================================================= */
(function () {
  const S = AH.store, U = AH.ui, V = AH.views;
  const { ic, esc, fmt, avatar } = U;
  const main = document.getElementById('main');

  const NAV = [
    { r: 'home', label: 'Início', icon: 'house', mobile: 'Início' },
    { r: 'games', label: 'Explorar Jogos', icon: 'layout-grid', mobile: 'Jogos' },
    { r: 'duels', label: 'Duelos', icon: 'swords', mobile: 'Duelos' },
    { r: 'rankings', label: 'Rankings', icon: 'trophy' },
    { r: 'friends', label: 'Amigos', icon: 'users', mobile: 'Amigos' },
    { r: 'achievements', label: 'Conquistas', icon: 'award' },
    { r: 'shop', label: 'Loja', icon: 'shopping-bag' },
    { r: 'profile', label: 'Perfil', icon: 'circle-user-round', mobile: 'Perfil' }
  ];

  const ROUTES = {
    home: V.home, games: V.games, game: V.game, play: V.play,
    duels: (el, p, q) => ({ search: V.duelSearch, lobby: V.duelLobby, result: V.duelResult }[p[0]] || V.duels)(el, p, q),
    rankings: V.rankings, friends: V.friends, achievements: V.achievements,
    shop: V.shop, profile: V.profile, user: V.user, prestige: V.prestige, settings: V.settings,
    login: V.login, register: V.register, recover: V.recover
  };
  const PUBLIC = ['login', 'register', 'recover'];
  const TITLES = { home: 'Início', games: 'Explorar jogos', game: 'Jogo', play: 'Jogando', duels: 'Duelos', rankings: 'Rankings', friends: 'Amigos', achievements: 'Conquistas', shop: 'Loja', profile: 'Perfil', user: 'Jogador', prestige: 'Prestígio', settings: 'Configurações', login: 'Entrar', register: 'Criar conta', recover: 'Recuperar senha' };

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '') || 'home';
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'home', params: parts.slice(1).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs || '')) };
  }

  let cleanup = null, current = null;
  function render() {
    const { name, params, query } = parse();
    const loggedIn = !!(S.state.session && S.user);
    if (!loggedIn && !PUBLIC.includes(name)) { location.replace('#/login'); return; }
    if (loggedIn && PUBLIC.includes(name)) { location.replace('#/home'); return; }

    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    if (document.getElementById('modalRoot').classList.contains('open')) U.close();

    document.getElementById('app').classList.toggle('auth-mode', !loggedIn);
    const view = ROUTES[name] || V.notFound;
    const el = document.createElement('div');
    el.className = 'view-inner';
    main.replaceChildren(el);
    const res = view(el, params, query);
    if (typeof res === 'function') cleanup = res;
    document.title = `${TITLES[name] || 'Arcade Hub'} · Arcade Hub`;
    if (current !== name + params.join('/')) { window.scrollTo(0, 0); current = name + params.join('/'); }
    renderShell(name);
    U.refreshIcons();
  }

  function renderShell(active) {
    if (!S.user || !S.state.session) return;
    const u = S.user;
    const map = { game: 'games', play: 'games', user: 'friends', prestige: 'profile' };
    const act = map[active] || active;
    const unread = S.state.notifications.filter(n => !n.read).length;
    const reqs = S.state.requests.length;

    document.getElementById('sideNav').innerHTML = NAV.map(n => `<a href="#/${n.r}" class="side-link ${act === n.r ? 'active' : ''}" ${act === n.r ? 'aria-current="page"' : ''}>${ic(n.icon)}<span>${n.label}</span>${n.r === 'friends' && reqs ? '<span class="badge-dot" aria-label="solicitações pendentes"></span>' : ''}</a>`).join('');
    document.querySelector('.side-footer .side-link').classList.toggle('active', act === 'settings');
    document.getElementById('bottomNav').innerHTML = NAV.filter(n => n.mobile).map(n => `<a href="#/${n.r}" class="${act === n.r ? 'active' : ''}" ${act === n.r ? 'aria-current="page"' : ''}>${ic(n.icon)}<span>${n.mobile}</span></a>`).join('');
    document.getElementById('topActions').innerHTML = `
      <button class="icon-btn mobile-search" data-act="search" aria-label="Buscar">${ic('search')}</button>
      <button class="coin-pill" data-act="coins" aria-label="${fmt(u.coins)} moedas — abrir loja"><span class="coin">${ic('star')}</span>${fmt(u.coins)}</button>
      <button class="icon-btn" data-act="notifs" aria-label="Notificações${unread ? `, ${unread} não lidas` : ''}">${ic('bell')}${unread ? `<span class="count">${unread}</span>` : ''}</button>
      <button class="user-chip" data-act="me" aria-label="Meu perfil">${avatar(u, 'sm')}<span class="uc-name">${esc(u.username)}<small>Nível ${u.level}</small></span></button>`;
  }

  function applyTheme() {
    const t = S.state.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function openNotifications() {
    const list = () => S.state.notifications.length
      ? S.state.notifications.map(n => `<a class="notif-item ${n.read ? '' : 'unread'}" href="${n.link || '#'}" data-nid="${n.id}"><span class="tl-ic">${ic(n.icon)}</span><div><div>${esc(n.text)}</div><small>${U.timeAgo(n.t)}</small></div></a>`).join('')
      : U.empty('bell-off', 'Tudo em dia', 'Você não tem notificações.');
    U.modal({
      title: 'Notificações', body: `<div class="stack" style="gap:4px">${list()}</div>`,
      actions: S.state.notifications.length ? [
        { label: 'Limpar tudo', cls: 'btn-ghost', icon: 'trash-2', onClick: () => { S.state.notifications = []; S.save(); renderShell(parse().name); U.refreshIcons(); } },
        { label: 'Marcar como lidas', cls: 'btn-primary', icon: 'check-check', onClick: () => { S.state.notifications.forEach(n => n.read = true); S.save(); renderShell(parse().name); U.refreshIcons(); } }] : [],
      onMount: m => m.addEventListener('click', e => {
        const a = e.target.closest('[data-nid]'); if (!a) return;
        const n = S.state.notifications.find(x => x.id === a.dataset.nid); if (n) { n.read = true; S.save(); }
        if (!n?.link) e.preventDefault();
        U.close();
      })
    });
  }

  function openCoins() {
    U.modal({
      title: `${fmt(S.user.coins)} moedas`, icon: 'star', iconColor: 'var(--coin)',
      body: `<p class="muted">Moedas cosméticas são ganhas jogando, completando desafios e vencendo duelos. Elas não têm valor real e servirão para desbloquear temas, molduras e efeitos.</p>
        <div class="xp-rules" style="margin-top:14px">
          <div class="xp-rule"><span>Completar partida</span><span>+${AH.config.coinRules.complete}</span></div>
          <div class="xp-rule"><span>Vencer partida</span><span>+${AH.config.coinRules.win}</span></div>
          <div class="xp-rule"><span>Vencer duelo</span><span>+${AH.config.coinRules.duelWin}</span></div>
          <div class="xp-rule"><span>Desafios</span><span>+15 a +120</span></div></div>`,
      actions: [{ label: 'Ver desafios', cls: 'btn-primary', icon: 'calendar-check', onClick: () => { location.hash = '#/achievements'; } }]
    });
  }

  // ---------- Eventos globais ----------
  document.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault(); e.stopPropagation();
      const g = S.game(fav.dataset.fav);
      const on = S.toggleFavorite(g.id);
      U.toast(on ? `${esc(g.name)} adicionado aos favoritos` : `${esc(g.name)} removido dos favoritos`, on ? 'success' : 'info', 'heart');
      // Atualiza todos os botões desse jogo sem re-renderizar a tela
      document.querySelectorAll(`.fav-btn[data-fav="${g.id}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Remover dos favoritos' : 'Adicionar aos favoritos'); });
      if (!fav.classList.contains('fav-btn')) render();
      return;
    }
    const claim = e.target.closest('[data-claim]');
    if (claim) {
      const r = S.claimChallenge(claim.dataset.claim);
      if (r) { U.rewardToasts({ ...r }); U.confetti(40); render(); }
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && act.closest('#topActions')) {
      const a = act.dataset.act;
      if (a === 'notifs') openNotifications();
      if (a === 'coins') location.hash = '#/shop';
      if (a === 'me') location.hash = '#/profile';
      if (a === 'search') { document.getElementById('topbar').classList.add('search-open'); document.getElementById('searchInput').focus(); }
    }
  });

  const searchInput = document.getElementById('searchInput');
  document.getElementById('searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const q = searchInput.value.trim();
    document.getElementById('topbar').classList.remove('search-open');
    location.hash = '#/games' + (q ? '?q=' + encodeURIComponent(q) : '');
    searchInput.value = '';
    searchInput.blur();
  });
  searchInput.addEventListener('blur', () => setTimeout(() => document.getElementById('topbar').classList.remove('search-open'), 150));
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.getElementById('modalRoot').classList.contains('open')) {
      e.preventDefault();
      if (matchMedia('(max-width: 860px)').matches) document.getElementById('topbar').classList.add('search-open');
      searchInput.focus();
    }
  });
  window.addEventListener('scroll', () => document.getElementById('topbar').classList.toggle('scrolled', scrollY > 4), { passive: true });
  window.addEventListener('hashchange', render);

  // Atualiza o cabeçalho quando o estado muda (moedas, nível, notificações)
  S.subscribe(() => { if (S.state.session) { renderShell(parse().name); U.refreshIcons(); } });

  AH.app = { render, applyTheme };
  applyTheme();
  render();
})();
