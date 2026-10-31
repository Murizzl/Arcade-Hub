/* =========================================================
   Views — cada tela é uma função (el, params, query) que
   renderiza e retorna opcionalmente uma função de limpeza.
   ========================================================= */
(function () {
  const S = AH.store, U = AH.ui, C = AH.config;
  const { ic, esc, fmt, avatar, emblem, gameCard, timeAgo, dateBR } = U;
  const V = AH.views = {};
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const lvlTag = p => `<span class="lvl" title="Nível">Nv ${p.level}</span>`;
  const sectionHead = (icon, title, more) => `<div class="section-head"><h2>${ic(icon)} ${title}</h2>${more || ''}</div>`;
  const row = games => games.length ? `<div class="game-row">${games.map(gameCard).join('')}</div>` : '';
  const go = h => { location.hash = h; };
  const diffName = (g, i) => AH.duelDifficulties[g.id] && i != null ? ` · ${esc(AH.duelDifficulties[g.id].names[i])}` : '';
  const themeColor = id => (C.cardThemes.find(t => t.id === id) || C.cardThemes[0]).color;
  const titleName = id => C.titles.find(t => t.id === id)?.name || '';

  /* ==================== INÍCIO ==================== */
  V.home = el => {
    const u = S.user, li = S.levelInfo(u), pr = S.prestigeOf(u.prestige);
    const recent = u.recent.map(S.game).filter(Boolean);
    const popular = [...AH.games].sort((a, b) => b.popularity - a.popularity).slice(0, 10);
    const favCats = new Set(u.favorites.flatMap(id => S.game(id)?.cats || []));
    const recommended = AH.games.filter(g => !u.recent.includes(g.id)).sort((a, b) =>
      (b.playable - a.playable) || ((b.cats.some(c => favCats.has(c))) - (a.cats.some(c => favCats.has(c)))) || b.popularity - a.popularity).slice(0, 10);
    const fresh = AH.games.filter(g => g.isNew);
    const duel = AH.games.filter(g => g.duel);
    const friendsPlaying = S.state.friends.map(S.player).filter(p => p && p.online && p.playing && p.sharePlaying);
    const ch = S.challenges();
    const winRate = u.matches ? Math.round(u.wins / u.matches * 100) : 0;

    el.innerHTML = `
      <section class="hero">
        <div class="card progress-card theme-${u.cardTheme}" style="${cardStyle(u, u.cardTheme)}">
          <span class="deco"></span><span class="deco two"></span>
          <div class="pc-top">
            ${avatar(u, 'lg')}
            <div style="min-width:0">
              <div class="muted" style="font-weight:600">Bem-vindo de volta,</div>
              <div class="pc-name">${esc(u.username)}</div>
              <div class="pc-sub">
                <span class="pill">${ic('trending-up')} Nível ${u.level}</span>
                <span class="pill">${emblem(u.prestige)} Prestígio ${u.prestige} · ${esc(pr.name)}</span>
              </div>
            </div>
          </div>
          <div style="position:relative">
            <div class="pc-xp"><span>${fmt(li.xp)} / ${fmt(li.need)} XP</span><span>${li.maxed ? 'Prestígio disponível!' : `Faltam ${fmt(li.toNext)} XP`}</span></div>
            <div class="progress" role="progressbar" aria-valuenow="${Math.round(li.pct)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso do nível"><span style="width:${li.pct}%"></span></div>
          </div>
          <div class="pc-actions">
            <a class="btn" href="#/profile">${ic('user')} Ver perfil</a>
            ${li.maxed ? `<a class="btn" href="#/prestige">${ic('sparkles')} Ativar prestígio</a>` : `<a class="btn ghosty" href="#/play/${recent[0]?.id || '2048'}">${ic('play')} Jogar agora</a>`}
          </div>
        </div>
        <div class="card daily-card">
          <div class="section-head" style="margin-bottom:6px"><h3>${ic('calendar-check')} Desafios de hoje</h3><a class="link-more" href="#/achievements">Todos ${ic('chevron-right')}</a></div>
          ${AH.challengeTemplates.daily.map(t => challengeRow(t, ch)).join('')}
        </div>
      </section>

      <div class="quick-stats">
        ${[['gamepad-2', '#6c4cf5', fmt(u.matches), 'Partidas'], ['trophy', '#f2a516', fmt(u.wins), 'Vitórias'], ['percent', '#1fb37a', winRate + '%', 'Aproveitamento'], ['award', '#ef4565', Object.keys(u.achievements).length + '/' + AH.achievements.length, 'Conquistas']]
          .map(([i, c, v, l]) => `<div class="qs"><span class="qs-ic" style="background:${c}1f;color:${c}">${ic(i)}</span><div><b>${v}</b><small>${l}</small></div></div>`).join('')}
      </div>

      ${friendsPlaying.length ? `<section class="section">
        ${sectionHead('radio', 'Amigos jogando agora', `<a class="link-more" href="#/friends">Amigos ${ic('chevron-right')}</a>`)}
        <div class="friend-activity">${friendsPlaying.map(p => `<a class="fa-item" href="#/user/${p.id}">${avatar(p, 'sm', { status: true })}<div><b>${esc(p.username)}</b><small>${ic(S.game(p.playing).icon, 'style="width:12px;height:12px"')} ${esc(S.game(p.playing).name)}</small></div></a>`).join('')}</div>
      </section>` : ''}

      ${recent.length ? `<section class="section">${sectionHead('history', 'Continue jogando')}${row(recent)}</section>` : ''}
      <section class="section">${sectionHead('flame', 'Jogos populares', `<a class="link-more" href="#/games?sort=pop">Ver todos ${ic('chevron-right')}</a>`)}${row(popular)}</section>
      <section class="section">${sectionHead('wand-2', 'Recomendados para você')}${row(recommended)}</section>
      <section class="section">${sectionHead('sparkles', 'Novos jogos', `<a class="link-more" href="#/games?sort=new">Ver novos ${ic('chevron-right')}</a>`)}${row(fresh)}</section>
      <section class="section">${sectionHead('swords', 'Jogos para duelar', `<a class="link-more" href="#/duels">Ir para Duelos ${ic('chevron-right')}</a>`)}${row(duel)}</section>
      <section class="section">${sectionHead('layout-grid', `Todos os jogos <span class="tag">${AH.games.length}</span>`, `<a class="link-more" href="#/games">Catálogo ${ic('chevron-right')}</a>`)}
        <div class="game-grid">${AH.games.map(gameCard).join('')}</div>
      </section>`;
  };

  function challengeRow(t, ch) {
    const p = Math.min(ch.progress[t.id] || 0, t.goal), done = p >= t.goal, claimed = !!ch.claimed[t.id];
    return `<div class="challenge">
      <span class="ch-icon ${done ? 'done' : ''}">${ic(claimed ? 'check' : t.icon)}</span>
      <div class="ch-main"><b>${esc(t.name)}</b>
        <div class="row" style="gap:8px;margin-top:4px"><div class="progress sm ${done ? 'success' : ''}" style="flex:1"><span style="width:${p / t.goal * 100}%"></span></div><small class="faint">${p}/${t.goal}</small></div>
      </div>
      ${claimed ? `<span class="tag tag-success">Resgatado</span>`
        : done ? `<button class="btn btn-success btn-sm" data-claim="${t.id}">${ic('gift')} Resgatar</button>`
        : `<div class="ch-reward">+${t.xp} XP<br><span class="faint">+${t.coins} moedas</span></div>`}
    </div>`;
  }
  V.challengeRow = challengeRow;

  /* ==================== CATÁLOGO ==================== */
  let catalogLoaded = false;
  V.games = (el, params, q) => {
    const st = { cat: q.cat || 'todos', q: q.q || '', sort: q.sort || 'pop', only: q.only || '' };
    el.innerHTML = `
      <div class="page-head"><div><h1>Explorar jogos</h1><p>${AH.games.length} jogos · ${AH.games.filter(g => g.playable).length} já jogáveis neste protótipo</p></div></div>
      <div class="row-wrap" style="margin-bottom:12px">
        <div class="search" style="max-width:none;flex:1;min-width:220px">${ic('search')}<input class="input" style="border-radius:999px;padding-left:42px" type="search" id="catSearch" placeholder="Buscar por nome ou categoria" value="${esc(st.q)}" aria-label="Buscar no catálogo"></div>
        <select class="input" id="catSort" style="width:auto" aria-label="Ordenar">
          <option value="pop">Mais populares</option><option value="new">Novos primeiro</option><option value="az">A–Z</option><option value="played">Mais jogados por mim</option>
        </select>
        <button class="chip ${st.only === 'fav' ? 'active' : ''}" data-only="fav" aria-pressed="${st.only === 'fav'}">${ic('heart')} Favoritos</button>
        <button class="chip ${st.only === 'play' ? 'active' : ''}" data-only="play" aria-pressed="${st.only === 'play'}">${ic('play')} Jogáveis</button>
      </div>
      <div class="chips" role="tablist" aria-label="Categorias">${AH.categories.map(c => `<button class="chip ${c.id === st.cat ? 'active' : ''}" role="tab" aria-selected="${c.id === st.cat}" data-cat="${c.id}">${ic(c.icon)} ${c.name}</button>`).join('')}</div>
      <div id="catResults" style="margin-top:12px">${catalogLoaded ? '' : U.skeletonGrid(8)}</div>`;
    el.querySelector('#catSort').value = st.sort;
    const res = el.querySelector('#catResults');
    const draw = () => {
      const term = st.q.trim().toLowerCase();
      let list = AH.games.filter(g =>
        (st.cat === 'todos' || g.cats.includes(st.cat)) &&
        (!term || g.name.toLowerCase().includes(term) || g.cats.some(c => AH.categories.find(x => x.id === c).name.toLowerCase().includes(term))) &&
        (st.only !== 'fav' || S.user.favorites.includes(g.id)) &&
        (st.only !== 'play' || g.playable));
      const sorters = { pop: (a, b) => b.popularity - a.popularity, new: (a, b) => b.isNew - a.isNew || b.popularity - a.popularity, az: (a, b) => a.name.localeCompare(b.name), played: (a, b) => (S.user.stats[b.id]?.played || 0) - (S.user.stats[a.id]?.played || 0) };
      list.sort(sorters[st.sort]);
      res.innerHTML = list.length
        ? `<p class="faint" style="margin-bottom:10px">${list.length} resultado${list.length > 1 ? 's' : ''}</p><div class="game-grid">${list.map(gameCard).join('')}</div>`
        : U.empty(st.only === 'fav' ? 'heart' : 'search-x', st.only === 'fav' ? 'Nenhum favorito aqui' : 'Nenhum jogo encontrado', st.only === 'fav' ? 'Toque no coração de um jogo para guardá-lo nos favoritos.' : 'Tente outro termo ou categoria.', `<button class="btn" data-clear>${ic('rotate-ccw')} Limpar filtros</button>`);
      U.refreshIcons();
      const qs = new URLSearchParams(Object.entries(st).filter(([k, v]) => v && !(k === 'cat' && v === 'todos') && !(k === 'sort' && v === 'pop'))).toString();
      history.replaceState(null, '', '#/games' + (qs ? '?' + qs : ''));
    };
    el.addEventListener('click', e => {
      const c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.dataset.cat; el.querySelectorAll('[data-cat]').forEach(x => { x.classList.toggle('active', x === c); x.setAttribute('aria-selected', x === c); }); draw(); }
      const o = e.target.closest('[data-only]');
      if (o) { st.only = st.only === o.dataset.only ? '' : o.dataset.only; el.querySelectorAll('[data-only]').forEach(x => { const on = x.dataset.only === st.only; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on); }); draw(); }
      if (e.target.closest('[data-clear]')) go('#/games');
    });
    el.querySelector('#catSearch').addEventListener('input', e => { st.q = e.target.value; draw(); });
    el.querySelector('#catSort').addEventListener('change', e => { st.sort = e.target.value; draw(); });
    if (catalogLoaded) draw(); else setTimeout(() => { catalogLoaded = true; draw(); }, 350);
  };

  /* ==================== DETALHE DO JOGO ==================== */
  function gameLeaderboard(g) {
    const pool = AH.online?.enabled ? AH.online.board() : AH.players;
    const people = [...pool, S.user].map(p => {
      let score = p === S.user || p.real ? p.stats?.[g.id]?.best ?? null : null;
      if (score == null && p !== S.user && !p.real) {
        const h = hash(p.id + g.id);
        score = g.scoreDir === 'low' ? 10 + (h % 40) : Math.round((p.level * 120 + (h % 3000)) / 10) * 10;
        if (g.scoreLabel === 'Vitórias') score = Math.round(p.wins * (0.1 + (h % 20) / 100));
      }
      if (score == null && g.scoreLabel === 'Vitórias' && (p === S.user || p.real)) score = p.stats?.[g.id]?.wins || 0;
      return { p, score };
    }).filter(x => x.score != null);
    people.sort((a, b) => g.scoreDir === 'low' ? a.score - b.score : b.score - a.score);
    return people;
  }

  V.game = (el, [id]) => {
    const g = S.game(id);
    if (!g) return V.notFound(el);
    const s = S.user.stats[id] || {};
    const fav = S.user.favorites.includes(id);
    const cats = g.cats.map(c => AH.categories.find(x => x.id === c));
    const relatedAch = AH.achievements.filter(a => a.desc.includes(g.name) || (g.id === '2048' && a.id === 'tile_512') || (g.duel && a.id.startsWith('duel')));
    const lb = gameLeaderboard(g).slice(0, 5);
    el.innerHTML = `
      <a class="link-more" href="#/games" style="margin-bottom:12px">${ic('arrow-left')} Catálogo</a>
      <section class="detail-hero">
        ${U.thumb(g, !g.playable ? `<span class="thumb-label tag">${ic('hammer')} Em desenvolvimento</span>` : '')}
        <div class="detail-info">
          <div class="row-wrap">${cats.map(c => `<a class="tag tag-primary" href="#/games?cat=${c.id}">${ic(c.icon)} ${c.name}</a>`).join('')}${g.duel ? `<span class="tag tag-warning">${ic('swords')} Compatível com duelos</span>` : ''}${g.isNew ? '<span class="tag tag-success">Novo</span>' : ''}</div>
          <h1>${esc(g.name)}</h1>
          <p class="muted">${esc(g.desc)}</p>
          <div class="row-wrap">
            ${g.playable ? `<a class="btn btn-primary btn-lg" href="#/play/${g.id}">${ic('play')} Jogar</a>` : `<a class="btn btn-lg" href="#/play/${g.id}">${ic('eye')} Ver prévia</a>`}
            <button class="btn btn-lg btn-outline" data-fav="${g.id}" aria-pressed="${fav}">${ic('heart', fav ? 'style="fill:var(--danger);color:var(--danger)"' : '')} ${fav ? 'Favoritado' : 'Favoritar'}</button>
            ${g.duel ? `<a class="btn btn-lg btn-accent" href="#/duels?game=${g.id}">${ic('swords')} Duelar</a>` : ''}
            ${g.playable ? `<a class="btn btn-lg btn-outline" href="#/gshop/${g.id}">${ic('shopping-bag')} Loja do jogo</a>` : ''}
          </div>
          <div class="stat-boxes">
            <div class="stat-box"><small>Seu recorde</small><b>${s.best != null ? fmt(s.best) : '—'}</b></div>
            <div class="stat-box"><small>Partidas</small><b>${fmt(s.played || 0)}</b></div>
            ${g.noWins ? '' : `<div class="stat-box"><small>Vitórias</small><b>${fmt(s.wins || 0)}</b></div>`}
            <div class="stat-box"><small>Jogadores</small><b>${fmt(g.players)}</b></div>
          </div>
        </div>
      </section>
      <div class="grid-3 section">
        <div class="card"><h3 style="margin-bottom:12px">${ic('trophy')} Recordes</h3>
          <div class="list">${lb.map((x, i) => `<div class="list-item ${x.p === S.user ? 'rank-me' : ''}"><span class="rank-pos">${i + 1}</span>${avatar(x.p, 'sm')}<div class="li-main"><b>${esc(x.p.username)}</b></div><b>${fmt(x.score)}</b></div>`).join('')}</div>
          <a class="link-more" style="margin-top:8px" href="#/rankings?tab=game&game=${g.id}">Ranking completo ${ic('chevron-right')}</a>
        </div>
        <div class="card"><h3 style="margin-bottom:12px">${ic('zap')} Como ganhar XP</h3>
          <div class="xp-rules">${['complete', 'win', 'record', ...(g.duel ? ['duelWin'] : [])].map(k => `<div class="xp-rule"><span>${C.xpRules[k].label}</span><span>+${C.xpRules[k].xp} XP</span></div>`).join('')}
            ${C.scoreXp[g.id] ? `<div class="xp-rule"><span>${C.scoreXp[g.id].label}</span><span>bônus</span></div>` : ''}</div>
        </div>
        <div class="card"><h3 style="margin-bottom:12px">${ic('award')} Conquistas</h3>
          ${relatedAch.length ? `<div class="list">${relatedAch.map(a => { const un = S.user.achievements[a.id]; return `<div class="list-item"><span class="ch-icon ${un ? 'done' : ''}">${ic(a.icon)}</span><div class="li-main"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>${un ? ic('check-circle-2', 'style="color:var(--success)"') : ''}</div>`; }).join('')}</div>`
            : U.empty('award', 'Sem conquistas específicas', 'Conquistas gerais também contam aqui.')}
        </div>
      </div>`;
  };

  /* ==================== JOGAR ==================== */
  V.play = (el, [id], q) => {
    const g = S.game(id);
    if (!g) return V.notFound(el);
    const duel = q.duel && AH.duel.current;
    if (!g.playable) {
      el.innerHTML = `<div class="play-wrap">
        <div class="play-head"><a class="icon-btn" href="#/game/${g.id}" aria-label="Voltar">${ic('arrow-left')}</a><h1>${esc(g.name)}</h1></div>
        <div class="card wip">${U.thumb(g)}<div style="margin-top:20px"><span class="tag tag-warning">${ic('hammer')} Em desenvolvimento</span><h2 style="margin:12px 0 6px">Este jogo ainda está sendo construído</h2>
        <p class="muted">${esc(g.desc)}</p><p class="faint" style="margin-top:8px">Favorite para ser avisado quando ficar disponível.</p>
        <div class="row-wrap" style="justify-content:center;margin-top:18px"><button class="btn btn-outline" data-fav="${g.id}">${ic('heart')} ${S.user.favorites.includes(g.id) ? 'Nos favoritos' : 'Favoritar'}</button><a class="btn btn-primary" href="#/games?only=play">${ic('play')} Ver jogos disponíveis</a></div></div></div></div>`;
      el.querySelector('.wip .thumb').style.cssText += ';border-radius:20px;max-width:280px;margin:0 auto';
      return;
    }
    const online = !!(duel && duel.online && duel.room);
    const offs = []; // handlers da sala para remover ao sair
    let cleanup = () => {};
    const shared = {}; // sobrevive a cada "próxima fase" (o ctx abaixo é recriado)
    AH.online?.enabled && AH.online.setPlaying(g.id);
    const mount = () => {
      el.innerHTML = `<div class="play-wrap">
        <div class="play-head"><a class="icon-btn" href="${duel ? '#/duels' : '#/game/' + g.id}" aria-label="Sair do jogo">${ic('arrow-left')}</a><h1>${esc(g.name)}</h1>
        ${duel ? `<span class="tag ${online ? 'tag-success' : 'tag-warning'}">${ic(online ? 'wifi' : 'bot')} ${online ? 'Online' : 'CPU'}</span>` : `<a class="icon-btn" href="#/gshop/${g.id}" aria-label="Loja do jogo" title="Loja do jogo">${ic('shopping-bag')}</a><button class="icon-btn" data-fav="${g.id}" aria-label="Favoritar">${ic('heart', S.user.favorites.includes(g.id) ? 'style="fill:var(--danger);color:var(--danger)"' : '')}</button>`}</div>
        ${duel && !online ? `<div class="sim-banner">${ic('bot')} Treino contra a CPU: “${esc(duel.opp.username)}” é controlado pelo computador.</div>` : ''}
        ${race ? '<div class="race-bar" id="race" aria-live="polite"></div>' : ''}
        <div id="engine"></div></div>`;
      U.refreshIcons();
      const host = el.querySelector('#engine');
      // tema comprado na loja do jogo: variáveis CSS na área da partida
      applyGameTheme(el.querySelector('.play-wrap'), g.id);
      let ended = false;
      const finishDuel = (result, summary, score, extra) => {
        if (ended) return; ended = true;
        stopRace();
        const r = S.reportMatch({ gameId: g.id, result, score, extra, duel: { opp: duel.opp.id, mode: duel.modeLabel, ranked: duel.mode === 'ranked' } });
        duel.result = { result, summary, rewards: r }; U.rewardToasts(r); go('#/duels/result');
      };
      const ctx = {
        shared,
        mode: duel ? 'duel' : 'solo', opponent: duel ? duel.opp : null, difficulty: duel ? duel.difficulty : undefined, seed: duel?.seed,
        // jogos de confronto direto online recebem um canal para trocar jogadas
        net: online && g.duelType === 'versus' ? {
          host: duel.host,
          send: (e, p) => duel.room.send('g:' + e, p),
          on: (e, f) => { const off = duel.room.on('g:' + e, f); offs.push(off); return off; }
        } : null,
        end: ({ result, score, extra, summary, next }) => {
          if (race) return raceEnd(score, extra, result);
          if (duel) return finishDuel(result, summary, score, extra);
          const r = S.reportMatch({ gameId: g.id, result, score, extra });
          showResult(result, summary, r, score, g, next);
        }
      };
      if (online) offs.push(duel.room.on('peer-left', () => { if (!ended) { U.toast(`${esc(duel.opp.username)} saiu da partida`, 'info', 'log-out'); finishDuel('win', `${duel.opp.username} desconectou`); } }));
      cleanup = AH.engines[g.id].mount(host, ctx) || (() => {});
      if (duel) host.querySelectorAll('[data-restart]').forEach(b => b.hidden = true);
      if (race) startRace();
      U.refreshIcons();

      /* --- Duelo "corrida": cada um joga sua partida e comparamos o resultado --- */
      function startRace() {
        const metric = g.race.metric, limit = AH.raceLimit(g, duel.difficulty);
        const t0 = Date.now();
        race.elapsed = () => Math.round((Date.now() - t0) / 1000);
        race.mine = null; race.opp = { done: false };
        if (online) {
          offs.push(duel.room.on('race-finish', p => { race.opp = { done: true, ...p }; tick(); resolve(); }));
        } else {
          // CPU: pontuação-alvo ou tempo de conclusão plausíveis
          const myBest = S.user.stats[g.id]?.best;
          race.cpuScore = Math.round(((myBest || 2400) * (0.45 + Math.random() * 0.8)) / 4) * 4;
          race.cpuTime = Math.round(limit * (0.3 + Math.random() * 0.45));
        }
        const bar = el.querySelector('#race');
        const oppText = t => {
          const opp = esc(duel.opp.username);
          if (online) {
            if (!race.opp.done) return `${opp} está jogando…`;
            if (race.opp.failed) return `${opp} <b>não completou</b>`;
            return metric === 'score' ? `${opp} fez <b>${fmt(race.opp.score)}</b> pts` : `${opp} <b>terminou em ${race.opp.t}s</b>`;
          }
          return metric === 'score'
            ? `${opp}: <b>${fmt(Math.round(race.cpuScore * Math.min(1, Math.pow(t / limit, .9)) / 4) * 4)}</b> pts`
            : t >= race.cpuTime ? `${opp} <b>terminou em ${race.cpuTime}s</b>` : `${opp} ainda está jogando…`;
        };
        function tick() {
          const t = race.elapsed(), left = Math.max(0, limit - t);
          bar.innerHTML = `<span class="race-clock ${left <= 15 ? 'low' : ''}">${ic(race.mine ? 'hourglass' : 'timer')} ${race.mine ? 'Aguardando' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>
            <span class="race-goal">${esc(AH.duelLabel(g, duel.difficulty))}${diffName(g, duel.difficulty)}</span><span class="race-opp">${avatar(duel.opp, 'sm')} <span>${oppText(t)}</span></span>`;
          U.refreshIcons();
          if (left <= 0 && !race.mine) {
            if (metric === 'score' && ctx.finish) ctx.finish();
            else raceEnd(undefined, undefined, 'loss');
          }
          // se o adversário sumir, não esperamos para sempre
          if (online && race.mine && !race.opp.done && t > limit + 20) { race.opp = { done: true, failed: true }; resolve(); }
        }
        race.tick = tick;
        tick();
        race.timer = setInterval(tick, 1000);
      }
      function raceEnd(score, extra, outcome) {
        if (race.mine) return;
        const t = race.elapsed();
        race.mine = { score: score ?? 0, t, failed: outcome === 'loss' };
        race.extra = extra;
        if (online) { duel.room.send('race-finish', race.mine); race.tick?.(); return resolve(); }
        // contra a CPU
        if (race.mine.failed) return finishDuel('loss', `Você não completou · ${duel.opp.username} terminou em ${race.cpuTime}s`, undefined, extra);
        let result, summary;
        if (g.race.metric === 'score') {
          result = score > race.cpuScore ? 'win' : score < race.cpuScore ? 'loss' : 'draw';
          summary = `Você ${fmt(score)} × ${fmt(race.cpuScore)} ${duel.opp.username}`;
        } else {
          result = t < race.cpuTime ? 'win' : t > race.cpuTime ? 'loss' : 'draw';
          summary = `Você ${t}s × ${race.cpuTime}s ${duel.opp.username}`;
        }
        finishDuel(result, summary, score, extra);
      }
      // online: decide quando os dois terminaram
      function resolve() {
        const a = race.mine, b = race.opp;
        if (!a || !b.done) return;
        const name = duel.opp.username;
        let result, summary;
        if (g.race.metric === 'score') {
          const bs = b.failed ? 0 : b.score;
          result = a.score > bs ? 'win' : a.score < bs ? 'loss' : 'draw';
          summary = `Você ${fmt(a.score)} × ${fmt(bs)} ${name}`;
        } else if (a.failed && b.failed) { result = 'draw'; summary = 'Ninguém completou a tempo'; }
        else if (a.failed) { result = 'loss'; summary = `${name} terminou em ${b.t}s`; }
        else if (b.failed) { result = 'win'; summary = `Você terminou em ${a.t}s · ${name} não completou`; }
        else { result = a.t < b.t ? 'win' : a.t > b.t ? 'loss' : 'draw'; summary = `Você ${a.t}s × ${b.t}s ${name}`; }
        finishDuel(result, summary, a.failed ? undefined : a.score, race.extra);
      }
    };
    const race = duel && g.duelType === 'race' ? {} : null;
    const stopRace = () => race && clearInterval(race.timer);
    function showResult(result, summary, r, score, g, next) {
      const titles = { win: ['Vitória!', 'trophy', 'var(--success)'], loss: ['Não foi dessa vez', 'frown', 'var(--danger)'], draw: ['Empate', 'equal', 'var(--text-3)'], complete: ['Fim de jogo', 'flag', 'var(--primary)'] };
      const [t, i, c] = titles[result];
      if (result === 'win') U.confetti(60);
      U.modal({
        title: t, icon: i, iconColor: c,
        body: `<p class="muted" style="margin-bottom:14px">${esc(summary || '')}${score != null ? ` · ${esc(g.scoreLabel)}: <b>${fmt(score)}</b>` : ''}</p>
          <div class="xp-rules">${r.rewards.map(([l, x]) => `<div class="xp-rule"><span>${l}</span><span>+${x} XP</span></div>`).join('')}
          <div class="xp-rule"><span>Moedas</span><span style="color:var(--coin)">+${r.coins}</span></div></div>
          ${r.record ? `<p class="tag tag-success" style="margin-top:12px">${ic('trophy')} Novo recorde pessoal!</p>` : ''}`,
        actions: [{ label: 'Sair', cls: 'btn-ghost', onClick: () => go('#/game/' + g.id) }, { label: next || 'Jogar de novo', cls: 'btn-primary', icon: next ? 'arrow-right' : 'rotate-ccw', onClick: () => { cleanup(); mount(); } }]
      });
      U.rewardToasts(r);
    }
    mount();
    return () => { stopRace(); cleanup(); offs.forEach(f => f()); AH.online?.enabled && AH.online.setPlaying(null); };
  };

  /* ==================== DUELOS ==================== */
  AH.duel = { current: null };
  const NET = () => !!AH.online?.enabled;
  const duelGames = () => AH.games.filter(g => g.duel);
  // Online: jogos de corrida e os de confronto direto que já sincronizam jogadas
  const onlineReady = g => g.playable && (g.duelType === 'race' || ['velha', 'ppt'].includes(g.id));
  const modeInfo = {
    friend: { label: 'Amigo', icon: 'user-plus', color: '#6c4cf5', title: 'Desafiar amigo', text: 'Convide um amigo online para um duelo ao vivo.' },
    casual: { label: 'Casual', icon: 'coffee', color: '#14a37f', title: 'Partida casual', text: 'Encontre alguém online. Não altera sua pontuação.' },
    ranked: { label: 'Ranqueada', icon: 'medal', color: '#ff7a45', title: 'Partida ranqueada', text: 'Vale pontos de divisão. Suba de Bronze a Mestre.' },
    private: { label: 'Privada', icon: 'key-round', color: '#2a8bd8', title: 'Sala privada', text: 'Crie uma sala ou entre com um código.' },
    cpu: { label: 'CPU', icon: 'bot', color: '#64748b', title: 'Contra a CPU', text: 'Treine sem esperar ninguém.' }
  };
  const roomCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const someone = id => S.player(id) || { id, username: 'Jogador', avatar: {}, level: 1, prestige: 0 };
  function leaveRoom() { const d = AH.duel.current; if (d?.room) { d.room.leave(); d.room = null; } }
  function newDuel(mode, game, opp) {
    leaveRoom();
    AH.duel.current = { mode, modeLabel: modeInfo[mode].label, game: game || 'velha', difficulty: AH.duelDifficulties[game || 'velha']?.def, opp: opp || null, code: roomCode(), meReady: false, oppReady: false, result: null, online: false, host: true };
    return AH.duel.current;
  }
  // Conecta o duelo atual à sala Realtime e trata as mensagens do anfitrião
  function connectRoom(d) {
    if (d.room) return;
    d.online = true;
    const pushConfig = () => { if (d.host && d.room) d.room.send('config', { game: d.game, difficulty: d.difficulty }); };
    d.pushConfig = pushConfig;
    d.room = AH.online.joinRoom(d.code, d.host, room => {
      const p = room.peerPlayer();
      if (p) {
        d.opp = { ...(S.player(p.id) || {}), ...p }; d.invited = null;
        // alguém novo na sala: o anfitrião manda o jogo escolhido; quem chegou pede, caso tenha perdido
        if (d.peerSeen !== p.id) { d.peerSeen = p.id; if (d.host) pushConfig(); else room.send('config-request'); }
      } else if (!d.invited && !room.peer && !room.timers.gone) d.opp = null;
      d.oppReady = room.peerReady;
      d.onChange?.();
    });
    d.room.on('config-request', pushConfig);
    d.room.on('peer-left', () => {
      if (!/#\/duels\/lobby/.test(location.hash)) return; // durante a partida quem trata é a tela de jogo
      d.opp = null; d.oppReady = false; d.peerSeen = null;
      // no lobby, convidado sem anfitrião não tem o que esperar
      if (!d.host) { U.toast('O anfitrião saiu da sala', 'info', 'log-out'); leaveRoom(); AH.duel.current = null; go('#/duels'); return; }
      d.onChange?.();
    });
    d.room.on('config', p => { if (!d.host) { d.game = p.game; d.difficulty = p.difficulty; d.onChange?.(); } });
    d.room.on('start', p => {
      if (d.host) return;
      Object.assign(d, { game: p.game, difficulty: p.difficulty, seed: p.seed, meReady: false, result: null });
      d.room.setReady(false);
      go(`#/play/${d.game}?duel=1`);
    });
    d.room.on('rematch', () => { if (d.result) { Object.assign(d, { meReady: false, result: null }); d.room.setReady(false); go('#/duels/lobby'); U.toast(`${esc(d.opp?.username || 'Adversário')} quer revanche!`, 'info', 'rotate-ccw'); } });
  }

  // Convite recebido de um amigo (chamado pelo AH.online)
  V.duelInvite = p => {
    const g = S.game(p.game) || S.game('velha');
    const from = someone('u_' + p.from);
    if (!from.username || from.username === 'Jogador') from.username = p.fromName;
    S.notify('swords', `${p.fromName} te desafiou para ${g.name}.`, '#/duels');
    U.modal({
      title: 'Desafio recebido!', icon: 'swords',
      body: `<div class="row" style="gap:14px">${avatar(from, 'lg')}<div><b style="font-size:1.1rem">${esc(p.fromName)}</b><p class="muted">te desafiou para <b>${esc(g.name)}</b>${diffName(g, p.difficulty)}</p></div></div>`,
      actions: [
        { label: 'Recusar', cls: 'btn-ghost', onClick: () => AH.online.declineInvite('u_' + p.from) },
        { label: 'Aceitar', cls: 'btn-primary', icon: 'check', onClick: () => {
          const d = newDuel('friend', g.id, from);
          Object.assign(d, { code: p.code, host: false, difficulty: p.difficulty });
          connectRoom(d); go('#/duels/lobby');
        } }
      ]
    });
  };

  V.duels = (el, p, q) => {
    if (AH.duel.current?.room && !AH.duel.current.result) { leaveRoom(); AH.duel.current = null; }
    const d = S.state.duels;
    const wins = d.filter(x => x.result === 'win').length;
    const div = S.divisionOf(S.user.mmr);
    const preGame = q.game && S.game(q.game)?.duel ? q.game : null;
    const onlineFriends = S.state.friends.map(S.player).filter(f => f && f.online);
    el.innerHTML = `
      <div class="page-head"><div><h1>Duelos</h1><p>Desafie amigos e jogadores em partidas 1 contra 1.</p></div>
        <div class="row-wrap"><span class="division" style="color:${div.color}"><i style="background:${div.color}"></i>${div.name} · ${S.user.mmr} pts</span></div></div>
      ${NET() ? `<div class="notice" style="margin-bottom:14px">${ic('wifi')} <span><b>Online:</b> ${onlineFriends.length ? `${onlineFriends.length} amigo(s) online agora.` : 'nenhum amigo online agora.'} Você também pode treinar contra a CPU.</span></div>`
        : `<div class="sim-banner">${ic('flask-conical')} Modo local: os adversários são simulados. Entre com uma conta para jogar online.</div>`}
      <div class="mode-grid">${Object.entries(modeInfo).map(([k, m]) => `<button class="mode-card" data-mode="${k}"><span class="mc-ic" style="background:${m.color}">${ic(m.icon)}</span><h3>${m.title}</h3><p>${m.text}</p></button>`).join('')}</div>
      <div class="grid-2 section">
        <div class="card"><div class="section-head"><h3>${ic('gamepad-2')} Jogos compatíveis</h3></div>
          <p class="faint" style="margin:-6px 0 6px">Nos de confronto direto vocês jogam um contra o outro; nos demais, vence quem fizer mais pontos ou terminar primeiro.</p>
          <div class="list">${duelGames().filter(g => g.playable).map(g => `<div class="list-item"><span class="ch-icon" style="background:${g.c1};color:#fff">${ic(g.icon)}</span><div class="li-main"><b>${esc(g.name)}</b><small>${esc(AH.duelLabel(g))}${NET() && !onlineReady(g) ? ' · só contra a CPU' : ''}</small></div>
            <button class="btn btn-sm ${preGame === g.id ? 'btn-primary' : ''}" data-quick="${g.id}">${ic(NET() && onlineReady(g) ? 'zap' : 'bot')} ${NET() && onlineReady(g) ? 'Casual' : 'CPU'}</button></div>`).join('')}</div>
        </div>
        <div class="card"><div class="section-head"><h3>${ic('history')} Confrontos recentes</h3><span class="faint">${wins}V · ${d.filter(x => x.result === 'loss').length}D · ${d.filter(x => x.result === 'draw').length}E</span></div>
          ${d.length ? `<div class="list">${d.slice(0, 8).map(x => { const o = someone(x.opp); const g = S.game(x.game); return `<div class="list-item">${avatar(o, 'sm')}<div class="li-main"><b>${esc(o.username)}</b><small>${esc(g.name)} · ${esc(x.mode)} · ${timeAgo(x.t)}</small></div><span class="tag ${x.result === 'win' ? 'tag-success' : x.result === 'loss' ? 'tag-danger' : ''}">${{ win: 'Vitória', loss: 'Derrota', draw: 'Empate' }[x.result]}</span></div>`; }).join('')}</div>`
            : U.empty('swords', 'Nenhum duelo ainda', 'Seus confrontos aparecerão aqui.')}
        </div>
      </div>`;
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]');
      if (m) startMode(m.dataset.mode, preGame);
      const qk = e.target.closest('[data-quick]');
      if (qk) { const g = S.game(qk.dataset.quick); startMode(NET() && onlineReady(g) ? 'casual' : 'cpu', g.id); }
    });
  };

  function startMode(mode, game, friendId) {
    const g0 = game && S.game(game);
    if (mode === 'cpu' || !NET()) {
      // sem conta online tudo é simulado; com conta, "CPU" é o treino
      if (mode === 'friend' && friendId) { newDuel('friend', game, S.player(friendId)); go('#/duels/lobby'); return; }
      if (mode === 'private' && !NET()) return privateModal(game);
      if (mode === 'friend' && !NET()) return friendModal(game);
      newDuel(mode === 'cpu' ? 'cpu' : mode, game); go('#/duels/search'); return;
    }
    if (g0 && !onlineReady(g0)) game = 'velha';
    if (mode === 'casual' || mode === 'ranked') { newDuel(mode, game); go('#/duels/search'); return; }
    if (mode === 'friend') {
      if (friendId) return inviteFriend(S.player(friendId), game);
      return friendModal(game);
    }
    if (mode === 'private') privateModal(game);
  }
  function inviteFriend(f, game) {
    if (!NET()) { newDuel('friend', game, f); go('#/duels/lobby'); return; }
    if (!f?.online) { U.toast(`${esc(f?.username || 'Esse amigo')} está offline agora`, 'info', 'moon'); return; }
    const d = newDuel('friend', game, null);
    d.invited = f; d.opp = null; d.host = true;
    connectRoom(d);
    AH.online.invite(f.id, { code: d.code, game: d.game, difficulty: d.difficulty }).then(ok =>
      ok ? U.toast(`Convite enviado para <b>${esc(f.username)}</b>`, 'success', 'send')
        : U.toast(`Não foi possível entregar o convite a <b>${esc(f.username)}</b>. Passe o código da sala para ele.`, 'error'));
    go('#/duels/lobby');
  }
  function friendModal(game) {
    const fr = S.state.friends.map(S.player).filter(Boolean).sort((a, b) => b.online - a.online);
    U.modal({
      title: 'Desafiar amigo', icon: 'user-plus',
      body: fr.length ? `<div class="list">${fr.map(f => `<div class="list-item">${avatar(f, 'sm', { status: true })}<div class="li-main"><b>${esc(f.username)}</b><small>${f.online ? 'Online' : 'Offline · ' + timeAgo(f.lastSeen)}</small></div><button class="btn btn-sm ${f.online ? 'btn-primary' : ''}" data-pick-friend="${f.id}" ${f.online ? '' : 'disabled'}>${ic('swords')} Desafiar</button></div>`).join('')}</div>`
        : U.empty('users', 'Sem amigos ainda', 'Adicione amigos para desafiá-los.', '<a class="btn btn-primary" href="#/friends?tab=find">Encontrar jogadores</a>'),
      onMount: m => m.addEventListener('click', e => { const b = e.target.closest('[data-pick-friend]'); if (b) { U.close(); inviteFriend(S.player(b.dataset.pickFriend), game); } })
    });
  }
  function privateModal(game) {
    U.modal({
      title: 'Sala privada', icon: 'key-round',
      body: `<div class="stack"><button class="btn btn-primary btn-block" data-create>${ic('plus')} Criar nova sala</button>
        <div class="faint" style="text-align:center">ou</div>
        <div class="field"><label for="joinCode">Código da sala</label><input class="input" id="joinCode" maxlength="6" placeholder="Ex.: K7Q2ZP" style="text-transform:uppercase;letter-spacing:.2em;font-weight:700" autocomplete="off"><span class="err" id="joinErr"></span></div>
        <button class="btn btn-block" data-join>${ic('log-in')} Entrar na sala</button></div>`,
      onMount: m => {
        m.querySelector('[data-create]').onclick = () => { U.close(); const d = newDuel('private', game); if (NET()) connectRoom(d); go('#/duels/lobby'); };
        const join = () => {
          const v = m.querySelector('#joinCode').value.trim().toUpperCase();
          if (!/^[A-Z0-9]{6}$/.test(v)) { m.querySelector('#joinErr').textContent = 'Digite um código de 6 caracteres.'; return; }
          U.close();
          if (NET()) { const d = newDuel('private', game); Object.assign(d, { code: v, host: false }); connectRoom(d); }
          else { const d = newDuel('private', game, AH.players[hash(v) % AH.players.length]); d.code = v; d.oppReady = true; }
          go('#/duels/lobby');
        };
        m.querySelector('[data-join]').onclick = join;
        m.querySelector('#joinCode').onkeydown = e => { if (e.key === 'Enter') join(); };
      }
    });
  }
  V.startDuelMode = startMode;

  const findCpu = d => {
    const near = AH.players.filter(p => !S.state.blocked.includes(p.id)).sort((a, b) => Math.abs(a.mmr - S.user.mmr) - Math.abs(b.mmr - S.user.mmr));
    d.opp = near[Math.floor(Math.random() * Math.min(5, near.length))];
    d.oppReady = true; d.online = false;
  };
  V.duelSearch = el => {
    const d = AH.duel.current;
    if (!d) return go('#/duels');
    const live = NET() && d.mode !== 'cpu';
    let secs = 0, stopMM = null, found = null;
    el.innerHTML = `<div class="card searching" style="max-width:520px;margin:20px auto">
      <div class="radar">${avatar(S.user, 'lg')}</div>
      <h2>${live ? 'Procurando jogador online…' : 'Preparando a CPU…'}</h2>
      <p class="muted" style="margin:6px 0 4px">${esc(modeInfo[d.mode].title)}${live ? '' : ` · ${esc(S.game(d.game).name)}`}</p>
      <p class="faint" aria-live="polite">Tempo de busca: <b data-secs>0s</b></p>
      <div data-fallback hidden style="margin-top:14px"><p class="muted">Ninguém procurando partida agora.</p>
        <div class="row-wrap" style="justify-content:center;margin-top:10px"><button class="btn btn-primary" data-cpu>${ic('bot')} Jogar contra a CPU</button><button class="btn" data-more>Continuar procurando</button></div></div>
      <button class="btn btn-outline" style="margin-top:18px" data-cancel>${ic('x')} Cancelar busca</button></div>`;
    const tick = setInterval(() => {
      secs++; el.querySelector('[data-secs]').textContent = secs + 's';
      if (live && secs === 20) el.querySelector('[data-fallback]').hidden = false;
    }, 1000);
    if (live) {
      stopMM = AH.online.matchmake(d.mode, m => {
        Object.assign(d, { code: m.code, host: m.host, opp: m.peer, online: true });
        connectRoom(d);
        U.toast(`Adversário encontrado: <b>${esc(m.peer?.username || 'jogador')}</b>`, 'success', 'user-check');
        go('#/duels/lobby');
      }, () => {
        // sem conexão com o servidor de partidas: mostra a saída em vez de ficar procurando para sempre
        el.querySelector('[data-fallback]').hidden = false;
        el.querySelector('[data-fallback] p').textContent = 'Não foi possível conectar à busca de partidas.';
      });
    } else {
      found = setTimeout(() => { findCpu(d); go('#/duels/lobby'); }, 1200 + Math.random() * 1200);
    }
    el.querySelector('[data-cancel]').onclick = () => { AH.duel.current = null; go('#/duels'); };
    el.querySelector('[data-cpu]').onclick = () => { stopMM?.(); stopMM = null; d.mode = 'cpu'; d.modeLabel = modeInfo.cpu.label; findCpu(d); go('#/duels/lobby'); };
    el.querySelector('[data-more]').onclick = () => { el.querySelector('[data-fallback]').hidden = true; secs = 0; };
    return () => { clearInterval(tick); clearTimeout(found); stopMM?.(); };
  };

  V.duelLobby = el => {
    const d = AH.duel.current;
    if (!d) return go('#/duels');
    const timers = [];
    const live = d.online && d.room;
    const draw = () => {
      const g = S.game(d.game);
      const opp = d.opp;
      const pCard = (p, ready, me) => p ? `<div class="lobby-player">${avatar(p, 'xl')}<h3>${esc(p.username)}${me ? ' <span class="faint">(você)</span>' : ''}</h3>
        <div class="row-wrap" style="justify-content:center">${lvlTag(p)} ${emblem(p.prestige || 0)} <span class="faint">Prestígio ${p.prestige || 0}</span></div>
        <span class="ready ${ready ? 'yes' : 'no'}">${ic(ready ? 'check-circle-2' : 'clock')} ${ready ? 'Pronto' : 'Não está pronto'}</span></div>`
        : d.invited ? `<div class="lobby-player empty">${avatar(d.invited, 'xl')}<h3>${esc(d.invited.username)}</h3><p class="faint">Convite enviado… aguardando aceitar</p></div>`
        : `<div class="lobby-player empty"><div class="avatar av-xl" style="--av:var(--surface-3);color:var(--text-3)">${ic('user-round-plus')}</div><h3>Aguardando jogador…</h3><p class="faint">Compartilhe o código da sala</p></div>`;
      const canEdit = !live || d.host;
      const rs = live ? d.room.status : 'online', blocked = live && (rs !== 'online' || d.room.full);
      const roomBanner = () => {
        if (!live) return `<div class="sim-banner">${ic('bot')} Treino contra a CPU.</div>`;
        const box = (icon, text, btns = '') => `<div class="notice" style="margin-bottom:14px;flex-wrap:wrap">${ic(icon)} <span style="flex:1;min-width:200px">${text}</span>${btns}</div>`;
        if (d.room.full) return box('users', '<b>Sala cheia.</b> Já existem dois jogadores nessa sala.', `<a class="btn btn-sm" href="#/duels" data-leave>Sair</a>`);
        if (rs === 'connecting') return box('loader-2', 'Conectando à sala…');
        if (rs === 'error') return box('wifi-off', '<b>Sem conexão com a sala.</b> Verifique sua internet e tente de novo.', `<button class="btn btn-sm btn-primary" data-retry>${ic('refresh-cw')} Tentar de novo</button>`);
        if (rs === 'nohost') return box('search-x', '<b>Sala não encontrada.</b> Confira o código com o anfitrião — ele precisa criar a sala primeiro.', `<a class="btn btn-sm" href="#/duels" data-leave>Voltar</a>`);
        return box('wifi', `Sala online ${d.host ? '— você é o anfitrião e escolhe o jogo.' : '— o anfitrião escolhe o jogo.'}`);
      };
      el.innerHTML = `
        <div class="page-head"><div><a class="link-more" href="#/duels" data-leave>${ic('arrow-left')} Sair do lobby</a><h1 style="margin-top:6px">Lobby · ${esc(modeInfo[d.mode].title)}</h1></div>
          <div style="text-align:right"><div class="faint">Código da sala</div><div class="row"><span class="room-code">${d.code}</span><button class="icon-btn" data-copy aria-label="Copiar código">${ic('copy')}</button></div></div></div>
        ${roomBanner()}
        <div class="card">
          <div class="lobby">${pCard(S.user, d.meReady, true)}<div class="lobby-vs">VS</div>${pCard(opp, d.oppReady)}</div>
          <div class="section" style="margin-top:22px">
            <h3 style="margin-bottom:10px">Jogo selecionado</h3>
            <div class="chips">${[...duelGames()].sort((a, b) => (live ? onlineReady(b) - onlineReady(a) : 0) || b.playable - a.playable).map(x => {
              const ok = x.playable && (!live || onlineReady(x));
              return `<button class="chip ${x.id === d.game ? 'active' : ''}" data-game="${x.id}" ${ok && canEdit ? '' : 'disabled'} ${!ok ? `title="${x.playable ? 'Só contra a CPU por enquanto' : 'Em desenvolvimento'}"` : ''} aria-pressed="${x.id === d.game}">${ic(x.icon)} ${esc(x.name)}${!x.playable ? ' · em breve' : !ok ? ' · só CPU' : ''}</button>`;
            }).join('')}</div>
            ${AH.duelDifficulties[g.id] ? `<h3 style="margin:16px 0 10px">Dificuldade</h3>
            <div class="chips" role="radiogroup" aria-label="Dificuldade do duelo">${AH.duelDifficulties[g.id].names.map((n, i) => `<button class="chip ${i === d.difficulty ? 'active' : ''}" role="radio" aria-checked="${i === d.difficulty}" data-diff="${i}" ${canEdit ? '' : 'disabled'}>${esc(n)}</button>`).join('')}</div>` : ''}
            <p class="row" style="gap:6px;margin-top:8px;font-weight:600">${ic(g.duelType === 'versus' ? 'swords' : 'timer')} ${esc(AH.duelLabel(g, d.difficulty))}</p>
          </div>
          <div class="row-wrap" style="justify-content:center;margin-top:20px">
            <button class="btn btn-lg ${d.meReady ? 'btn-outline' : 'btn-success'}" data-ready ${blocked ? 'disabled' : ''}>${ic(d.meReady ? 'x' : 'check')} ${d.meReady ? 'Cancelar prontidão' : 'Estou pronto'}</button>
            ${canEdit ? `<button class="btn btn-lg btn-primary" data-start ${d.meReady && d.oppReady && opp ? '' : 'disabled'}>${ic('play')} Iniciar partida</button>` : ''}
          </div>
          <p class="faint" style="text-align:center;margin-top:10px">${!opp ? (d.invited ? 'Assim que o convite for aceito, o amigo aparece aqui.' : 'Esperando alguém entrar na sala.') : !d.oppReady ? `Aguardando ${esc(opp.username)} ficar pronto…` : !d.meReady ? 'Marque que está pronto para começar.' : canEdit ? 'Tudo certo! Inicie a partida.' : 'Aguardando o anfitrião iniciar…'}</p>
        </div>
        ${opp ? `<div class="card section"><h3 style="margin-bottom:10px">${ic('history')} Histórico contra ${esc(opp.username)}</h3>
          ${(() => { const h = S.state.duels.filter(x => x.opp === opp.id); return h.length ? `<div class="list">${h.slice(0, 5).map(x => `<div class="list-item"><span class="ch-icon">${ic(S.game(x.game).icon)}</span><div class="li-main"><b>${esc(S.game(x.game).name)}</b><small>${timeAgo(x.t)}</small></div><span class="tag ${x.result === 'win' ? 'tag-success' : x.result === 'loss' ? 'tag-danger' : ''}">${{ win: 'Vitória', loss: 'Derrota', draw: 'Empate' }[x.result]}</span></div>`).join('')}</div>` : '<p class="faint">Primeiro confronto entre vocês.</p>'; })()}
        </div>` : ''}`;
      U.refreshIcons();
    };
    d.onChange = draw;
    draw();
    if (!live && d.opp && !d.oppReady) timers.push(setTimeout(() => { d.oppReady = true; draw(); }, 1200));
    if (!live && !d.opp && d.mode === 'private') timers.push(setTimeout(() => { findCpu(d); U.toast(`${d.opp.username} entrou na sala (simulação)`, 'info', 'log-in'); draw(); }, 2500));
    const pushConfig = () => { if (live && d.host) d.pushConfig?.(); };
    el.addEventListener('click', e => {
      if (e.target.closest('[data-retry]')) { d.room?.retry(); return; }
      if (e.target.closest('[data-ready]')) { d.meReady = !d.meReady; if (live) d.room.setReady(d.meReady); draw(); }
      const gb = e.target.closest('[data-game]'); if (gb && !gb.disabled) { d.game = gb.dataset.game; d.difficulty = AH.duelDifficulties[d.game]?.def; pushConfig(); draw(); }
      const db = e.target.closest('[data-diff]'); if (db && !db.disabled) { d.difficulty = +db.dataset.diff; pushConfig(); draw(); }
      if (e.target.closest('[data-start]') && d.meReady && d.oppReady && d.opp) {
        d.seed = Math.floor(Math.random() * 1e9);
        if (live) { d.room.send('start', { game: d.game, difficulty: d.difficulty, seed: d.seed }); d.meReady = false; d.room.setReady(false); }
        go(`#/play/${d.game}?duel=1`);
      }
      if (e.target.closest('[data-copy]')) { navigator.clipboard?.writeText(d.code).then(() => U.toast('Código copiado!', 'success', 'copy'), () => U.toast('Não foi possível copiar', 'error')); }
      if (e.target.closest('[data-leave]')) { leaveRoom(); AH.duel.current = null; }
    });
    // ao entrar, o anfitrião manda a configuração para quem chegar
    if (live && d.host) timers.push(setTimeout(pushConfig, 800));
    if (live && !d.host) timers.push(setTimeout(() => d.room?.send('config-request'), 900));
    return () => { timers.forEach(clearTimeout); d.onChange = null; };
  };

  V.duelResult = el => {
    const d = AH.duel.current;
    if (!d || !d.result) return go('#/duels');
    const { result, summary, rewards } = d.result;
    const map = { win: ['Vitória!', 'trophy'], loss: ['Derrota', 'shield-x'], draw: ['Empate', 'equal'] };
    if (result === 'win') U.confetti(90);
    el.innerHTML = `<div class="card" style="max-width:620px;margin:10px auto">
      <div class="result-hero ${result}">
        <div class="big">${map[result][0]}</div>
        <p class="muted">${esc(summary || '')} · ${esc(S.game(d.game).name)}${diffName(S.game(d.game), d.difficulty)} · ${esc(modeInfo[d.mode].title)}</p>
        <div class="lobby" style="margin-top:20px">
          <div class="lobby-player">${avatar(S.user, 'lg')}<b>${esc(S.user.username)}</b>${result === 'win' ? '<span class="tag tag-success">Vencedor</span>' : ''}</div>
          <div class="lobby-vs">${ic(map[result][1], 'style="width:36px;height:36px"')}</div>
          <div class="lobby-player">${avatar(d.opp, 'lg')}<b>${esc(d.opp.username)}</b>${result === 'loss' ? '<span class="tag tag-success">Vencedor</span>' : ''}</div>
        </div>
      </div>
      <h3 style="margin-bottom:10px">Recompensas</h3>
      <div class="xp-rules">${rewards.rewards.map(([l, x]) => `<div class="xp-rule"><span>${l}</span><span>+${x} XP</span></div>`).join('')}
        <div class="xp-rule"><span>Moedas</span><span style="color:var(--coin)">+${rewards.coins}</span></div>
        ${d.mode === 'ranked' ? `<div class="xp-rule"><span>Pontos de divisão</span><span style="color:${result === 'win' ? 'var(--success)' : result === 'loss' ? 'var(--danger)' : 'inherit'}">${result === 'win' ? '+24' : result === 'loss' ? '−18' : '0'}</span></div>` : ''}
      </div>
      <div class="row-wrap" style="justify-content:center;margin-top:22px">
        <a class="btn btn-lg" href="#/duels" data-back>${ic('arrow-left')} Voltar</a>
        <button class="btn btn-lg btn-primary" data-rematch>${ic('rotate-ccw')} Revanche</button>
      </div></div>`;
    el.querySelector('[data-back]').onclick = () => { leaveRoom(); AH.duel.current = null; };
    el.querySelector('[data-rematch]').onclick = () => {
      Object.assign(d, { meReady: false, oppReady: d.online ? d.oppReady : false, result: null });
      if (d.online && d.room) { d.room.setReady(false); d.room.send('rematch'); }
      U.toast(`Pedido de revanche enviado a ${esc(d.opp.username)}`, 'info', 'rotate-ccw');
      go('#/duels/lobby');
    };
  };

  /* ==================== RANKINGS ==================== */
  V.rankings = (el, p, q) => {
    let tab = q.tab || 'xp', gameId = q.game || '2048';
    const tabs = [['xp', 'XP global', 'zap'], ['prestige', 'Prestígio', 'sparkles'], ['wins', 'Vitórias', 'trophy'], ['comp', 'Competitivo', 'medal'], ['game', 'Por jogo', 'gamepad-2'], ['friends', 'Amigos', 'users']];
    const everyone = () => [...(AH.online?.enabled ? AH.online.board() : AH.players).filter(x => !S.state.blocked.includes(x.id)), S.user];
    const draw = () => {
      let list, metric;
      const lvlScore = x => x.prestige * 100 + x.level;
      if (tab === 'xp') { list = everyone().sort((a, b) => b.totalXp - a.totalXp); metric = x => fmt(x.totalXp) + ' XP'; }
      if (tab === 'prestige') { list = everyone().sort((a, b) => lvlScore(b) - lvlScore(a)); metric = x => `P${x.prestige} · Nv ${x.level}`; }
      if (tab === 'wins') { list = everyone().sort((a, b) => b.wins - a.wins); metric = x => fmt(x.wins) + ' vitórias'; }
      if (tab === 'comp') { list = everyone().sort((a, b) => b.mmr - a.mmr); metric = x => { const dv = S.divisionOf(x.mmr); return `<span class="division" style="color:${dv.color}"><i style="background:${dv.color}"></i>${dv.name}</span> · ${fmt(x.mmr)}`; }; }
      if (tab === 'friends') { list = [...S.state.friends.map(S.player).filter(Boolean), S.user].sort((a, b) => b.totalXp - a.totalXp); metric = x => fmt(x.totalXp) + ' XP'; }
      if (tab === 'game') { const g = S.game(gameId); const lb = gameLeaderboard(g); list = lb.map(x => x.p); const sc = new Map(lb.map(x => [x.p, x.score])); metric = x => `${fmt(sc.get(x))} ${g.scoreLabel.toLowerCase()}`; }
      const top = list.slice(0, 3);
      const myDiv = S.divisionOf(S.user.mmr);
      el.querySelector('#rkBody').innerHTML = `
        ${tab === 'comp' ? `<div class="div-cards">${C.divisions.map(dv => `<div class="div-card ${dv.id === myDiv.id ? 'current' : ''}"><div class="gem" style="background:${dv.color}"></div><b>${dv.name}</b><small>${dv.min}+ pts</small></div>`).join('')}</div>` : ''}
        ${tab === 'game' ? `<div class="chips" style="margin-bottom:12px">${AH.games.filter(g => g.playable).map(g => `<button class="chip ${g.id === gameId ? 'active' : ''}" data-rg="${g.id}">${ic(g.icon)} ${esc(g.name)}</button>`).join('')}</div>` : ''}
        ${top.length >= 3 ? `<div class="podium">${[1, 0, 2].map(i => `<a class="podium-col p${i + 1}" href="${top[i] === S.user ? '#/profile' : '#/user/' + top[i].id}">${avatar(top[i], i === 0 ? 'lg' : 'md')}<b>${esc(top[i].username)}</b><small class="faint">${metric(top[i])}</small><div class="podium-step">${i + 1}</div></a>`).join('')}</div>` : ''}
        <div class="card"><div class="list">${list.map((x, i) => `<a class="list-item ${x === S.user ? 'rank-me' : ''}" href="${x === S.user ? '#/profile' : '#/user/' + x.id}">
          <span class="rank-pos">${i < 3 ? ic('medal', `style="color:${['#f2b316', '#9aa5b8', '#d1834c'][i]}"`) : i + 1}</span>
          ${avatar(x, 'md')}
          <div class="li-main"><b>${esc(x.username)} ${x === S.user ? '<span class="tag tag-primary">Você</span>' : ''}</b><small>Nível ${x.level} · ${esc(S.prestigeOf(x.prestige).name)}</small></div>
          ${emblem(x.prestige)}<div style="text-align:right;font-weight:700;min-width:96px;font-size:.9rem">${metric(x)}</div></a>`).join('')}</div></div>
        ${AH.online?.enabled ? '' : `<p class="faint" style="margin-top:10px">${ic('info', 'style="width:14px;height:14px;vertical-align:-2px"')} Rankings com dados de exemplo até a conexão com o servidor.</p>`}`;
      U.refreshIcons();
    };
    el.innerHTML = `<div class="page-head"><div><h1>Rankings</h1><p>Veja quem está no topo do Arcade Hub.</p></div></div>
      <div class="tabs" role="tablist" style="margin-bottom:18px">${tabs.map(([k, l, i]) => `<button class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" data-tab="${k}">${ic(i)} ${l}</button>`).join('')}</div>
      <div id="rkBody"></div>`;
    if (AH.online?.enabled) el.querySelector('#rkBody').innerHTML = U.skeletonGrid(4);
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; el.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', x === t); }); draw(); }
      const rg = e.target.closest('[data-rg]'); if (rg) { gameId = rg.dataset.rg; draw(); }
    });
    draw();
    if (AH.online?.enabled) AH.online.loadBoard().then(() => { if (el.isConnected) draw(); });
  };

  /* ==================== AMIGOS ==================== */
  V.friends = (el, p, q) => {
    let tab = q.tab || 'list', term = '', searched = false, searchT = null;
    const draw = () => {
      const st = S.state;
      const friends = st.friends.map(S.player).filter(Boolean).sort((a, b) => b.online - a.online || a.username.localeCompare(b.username));
      const playing = friends.filter(f => f.online && f.playing && f.sharePlaying);
      const statusText = f => f.online ? (f.playing && f.sharePlaying ? `Jogando ${S.game(f.playing).name}` : 'Online') : `Visto ${timeAgo(f.lastSeen)}`;
      const tabs = [['list', `Amigos (${friends.length})`, 'users'], ['requests', `Solicitações${st.requests.length ? ` (${st.requests.length})` : ''}`, 'inbox'], ['find', 'Encontrar', 'user-search'], ['blocked', 'Bloqueados', 'ban']];
      let body = '';
      if (tab === 'list') {
        body = (playing.length ? `<div class="card" style="margin-bottom:16px"><h3 style="margin-bottom:10px">${ic('radio')} Jogando agora</h3>
          <div class="friend-activity">${playing.map(f => `<a class="fa-item" href="#/game/${f.playing}" style="background:var(--surface-2)">${avatar(f, 'sm', { status: true })}<div><b>${esc(f.username)}</b><small>${esc(S.game(f.playing).name)}</small></div></a>`).join('')}</div>
          <p class="faint" style="margin-top:8px">Só aparecem amigos que autorizaram compartilhar o que estão jogando.</p></div>` : '') +
          `<div class="card">${friends.length ? `<div class="list">${friends.map(f => `<div class="list-item">
            <a class="li-link" href="#/user/${f.id}">${avatar(f, 'md', { status: true })}<div class="li-main"><b>${esc(f.username)} ${lvlTag(f)}</b><small>${esc(statusText(f))}</small></div></a>
            <div class="li-actions">
              <button class="btn btn-sm btn-primary" data-duel="${f.id}" ${f.online ? '' : 'disabled title="Amigo offline"'}>${ic('swords')}<span class="btn-label">Duelar</span></button>
              <button class="btn btn-sm" data-remove="${f.id}" aria-label="Remover ${esc(f.username)}">${ic('user-minus')}</button>
              <button class="btn btn-sm" data-block="${f.id}" aria-label="Bloquear ${esc(f.username)}">${ic('ban')}</button>
            </div></div>`).join('')}</div>`
            : U.empty('users', 'Sua lista está vazia', 'Encontre jogadores pelo username e envie solicitações.', '<button class="btn btn-primary" data-goto="find">Encontrar jogadores</button>')}</div>`;
      }
      if (tab === 'requests') {
        const inc = st.requests.map(S.player).filter(Boolean), out = st.sent.map(S.player).filter(Boolean);
        body = `<div class="card"><h3 style="margin-bottom:6px">Recebidas</h3>${inc.length ? `<div class="list">${inc.map(f => `<div class="list-item"><a class="li-link" href="#/user/${f.id}">${avatar(f, 'md')}<div class="li-main"><b>${esc(f.username)} ${lvlTag(f)}</b><small>Quer ser seu amigo</small></div></a>
            <div class="li-actions"><button class="btn btn-sm btn-success" data-accept="${f.id}">${ic('check')}<span class="btn-label">Aceitar</span></button><button class="btn btn-sm" data-decline="${f.id}">${ic('x')}<span class="btn-label">Recusar</span></button></div></div>`).join('')}</div>`
          : U.empty('inbox', 'Nenhuma solicitação', 'Quando alguém te adicionar, aparecerá aqui.')}</div>
          <div class="card section"><h3 style="margin-bottom:6px">Enviadas</h3>${out.length ? `<div class="list">${out.map(f => `<div class="list-item">${avatar(f, 'md')}<div class="li-main"><b>${esc(f.username)}</b><small>Aguardando resposta</small></div><button class="btn btn-sm" data-cancel="${f.id}">Cancelar</button></div>`).join('')}</div>` : '<p class="faint">Nenhuma solicitação pendente.</p>'}</div>`;
      }
      if (tab === 'find') {
        const t = term.trim().toLowerCase();
        const res = AH.online?.enabled ? AH.online.results().filter(x => S.friendship(x.id) !== 'blocked' || t)
          : t ? AH.players.filter(x => x.username.toLowerCase().includes(t) || x.id.includes(t)) : AH.players.filter(x => S.friendship(x.id) === 'none').slice(0, 6);
        if (AH.online?.enabled && !searched) { searched = true; AH.online.search(term).then(() => { if (el.isConnected && tab === 'find') draw(); }); }
        body = `<div class="card"><div class="search" style="max-width:none;margin-bottom:12px">${ic('search')}<input class="input" style="border-radius:999px;padding-left:42px" id="findInput" placeholder="Buscar por username ou ID (ex.: LunaPixel)" value="${esc(term)}" aria-label="Buscar jogadores"></div>
          <p class="faint" style="margin-bottom:6px">${t ? `${res.length} resultado(s)` : 'Sugestões de jogadores'}</p>
          ${res.length ? `<div class="list">${res.map(f => { const fs = S.friendship(f.id); return `<div class="list-item"><a class="li-link" href="#/user/${f.id}">${avatar(f, 'md', { status: true })}<div class="li-main"><b>${esc(f.username)} ${lvlTag(f)}</b><small>Prestígio ${f.prestige}</small></div></a>
            <div class="li-actions">${fs === 'friend' ? '<span class="tag tag-success">Amigo</span>' : fs === 'sent' ? `<button class="btn btn-sm" data-cancel="${f.id}">Pendente</button>` : fs === 'incoming' ? `<button class="btn btn-sm btn-success" data-accept="${f.id}">Aceitar</button>` : fs === 'blocked' ? '<span class="tag tag-danger">Bloqueado</span>' : `<button class="btn btn-sm btn-primary" data-add="${f.id}">${ic('user-plus')}<span class="btn-label">Adicionar</span></button>`}</div></div>`; }).join('')}</div>`
            : U.empty('user-x', 'Ninguém encontrado', 'Confira a grafia do username.')}</div>`;
      }
      if (tab === 'blocked') {
        const bl = st.blocked.map(S.player).filter(Boolean);
        body = `<div class="card">${bl.length ? `<div class="list">${bl.map(f => `<div class="list-item">${avatar(f, 'md')}<div class="li-main"><b>${esc(f.username)}</b><small>Não pode te enviar convites ou mensagens</small></div><button class="btn btn-sm" data-unblock="${f.id}">Desbloquear</button></div>`).join('')}</div>` : U.empty('shield-check', 'Nenhum jogador bloqueado', 'Jogadores bloqueados não podem te convidar nem aparecer nos seus rankings.')}</div>`;
      }
      el.innerHTML = `<div class="page-head"><div><h1>Amigos</h1><p>${friends.filter(f => f.online).length} online agora</p></div><button class="btn btn-primary" data-goto="find">${ic('user-plus')} Adicionar amigo</button></div>
        <div class="tabs" role="tablist" style="margin-bottom:16px">${tabs.map(([k, l, i]) => `<button class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" data-goto="${k}">${ic(i)} ${l}</button>`).join('')}</div>${body}`;
      U.refreshIcons();
      const fi = el.querySelector('#findInput');
      const refocus = pos => { const n = el.querySelector('#findInput'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
      if (fi) fi.oninput = e => {
        term = e.target.value; const pos = e.target.selectionStart;
        if (AH.online?.enabled) { clearTimeout(searchT); searchT = setTimeout(() => AH.online.search(term).then(() => { if (el.isConnected) { draw(); refocus(pos); } }), 300); return; }
        draw(); refocus(pos);
      };
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-goto],button[data-add],button[data-accept],button[data-decline],button[data-cancel],button[data-remove],button[data-block],button[data-unblock],button[data-duel]');
      if (!b) return;
      const d = b.dataset, name = id => esc(S.player(id).username);
      if (d.goto) { tab = d.goto; draw(); return; }
      if (d.add) { S.sendRequest(d.add); U.toast(`Solicitação enviada para ${name(d.add)}`, 'success', 'send'); }
      if (d.accept) { S.acceptRequest(d.accept); U.toast(`Agora você e ${name(d.accept)} são amigos!`, 'success', 'user-check'); }
      if (d.decline) { S.declineRequest(d.decline); U.toast('Solicitação recusada'); }
      if (d.cancel) { S.cancelRequest(d.cancel); U.toast('Solicitação cancelada'); }
      if (d.unblock) { S.unblock(d.unblock); U.toast(`${name(d.unblock)} foi desbloqueado`); }
      if (d.duel) { startMode('friend', null, d.duel); return; }
      if (d.remove) return U.confirm({ title: 'Remover amigo?', text: `${name(d.remove)} sairá da sua lista de amigos. Vocês poderão se adicionar novamente depois.`, okLabel: 'Remover', danger: true, icon: 'user-minus', onOk: () => { S.removeFriend(d.remove); U.toast('Amigo removido'); draw(); } });
      if (d.block) return U.confirm({ title: 'Bloquear jogador?', text: `${name(d.block)} será removido dos amigos e não poderá te convidar para duelos.`, okLabel: 'Bloquear', danger: true, icon: 'ban', onOk: () => { S.block(d.block); U.toast('Jogador bloqueado'); draw(); } });
      draw();
    });
    const unsub = S.subscribe(() => { if (!document.activeElement || document.activeElement.id !== 'findInput') draw(); });
    draw();
    return unsub;
  };

  /* ==================== CONQUISTAS ==================== */
  V.achievements = el => {
    let filter = 'all';
    const draw = () => {
      const u = S.user, ch = S.challenges();
      const list = AH.achievements.map(a => { const [cur, goal] = a.check(S.state); return { a, cur: Math.min(cur, goal), goal, at: u.achievements[a.id] }; })
        .filter(x => filter === 'all' || (filter === 'on' ? x.at : !x.at))
        .sort((x, y) => (!!y.at - !!x.at) || (y.at || '').localeCompare(x.at || '') || (y.cur / y.goal - x.cur / x.goal));
      const total = Object.keys(u.achievements).length;
      el.innerHTML = `<div class="page-head"><div><h1>Conquistas e desafios</h1><p>${total} de ${AH.achievements.length} conquistas desbloqueadas</p></div></div>
        <div class="grid-2">
          <div class="card"><div class="section-head"><h3>${ic('sun')} Desafios diários</h3><span class="faint">Renovam à meia-noite</span></div>${AH.challengeTemplates.daily.map(t => challengeRow(t, ch)).join('')}</div>
          <div class="card"><div class="section-head"><h3>${ic('calendar-range')} Desafios semanais</h3><span class="faint">Renovam na segunda</span></div>${AH.challengeTemplates.weekly.map(t => challengeRow(t, ch)).join('')}</div>
        </div>
        <div class="section">
          <div class="section-head"><h2>${ic('award')} Conquistas</h2>
            <div class="tabs">${[['all', 'Todas'], ['on', 'Desbloqueadas'], ['off', 'Bloqueadas']].map(([k, l]) => `<button class="tab ${k === filter ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
          ${list.length ? `<div class="ach-grid">${list.map(({ a, cur, goal, at }) => `<div class="ach ${at ? 'unlocked' : ''}">
            <span class="ach-ic">${ic(at ? a.icon : 'lock')}</span>
            <div class="ach-main"><b>${esc(a.name)}</b><p>${esc(a.desc)}</p>
              ${at ? `<span class="tag tag-warning">${ic('calendar')} ${dateBR(at)}</span>` : `<div class="row" style="gap:8px"><div class="progress sm" style="flex:1"><span style="width:${cur / goal * 100}%"></span></div><small class="faint">${fmt(cur)}/${fmt(goal)}</small></div>`}
              <small class="faint">+${a.xp} XP</small></div></div>`).join('')}</div>`
            : U.empty('award', 'Nada por aqui', filter === 'on' ? 'Jogue partidas para desbloquear suas primeiras conquistas.' : 'Você desbloqueou tudo! Incrível.')}
        </div>`;
      U.refreshIcons();
    };
    el.addEventListener('click', e => { const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; draw(); } });
    const unsub = S.subscribe(draw);
    draw();
    return unsub;
  };

  /* ==================== PERFIL ==================== */
  function profileLayout(el, p, isMe) {
    const pr = S.prestigeOf(p.prestige);
    const theme = isMe || p.cardTheme ? p.cardTheme || 'violet' : ['violet', 'sunset', 'ocean', 'mint', 'night'][hash(p.id) % 5];
    const stats = isMe || p.real ? p.stats || {} : Object.fromEntries(AH.games.filter(g => g.playable || hash(p.id + g.id) % 3 === 0).slice(0, 6).map(g => { const h = hash(p.id + g.id); return [g.id, { played: 10 + h % 120, wins: 5 + h % 60, best: g.scoreLabel === 'Vitórias' ? null : g.scoreDir === 'low' ? 12 + h % 30 : 500 + h % 9000 }]; }));
    const matches = isMe ? p.matches : p.wins + p.losses;
    const favs = isMe || p.real ? p.favorites || [] : AH.games.filter(g => hash(p.id + g.id) % 5 === 0).slice(0, 4).map(g => g.id);
    const achCount = isMe ? Object.keys(p.achievements).length : p.real ? p.achCount || 0 : Math.min(AH.achievements.length, 3 + p.level % 10);
    const history = isMe ? p.history : p.real ? [] : [
      { t: Date.now() - 3600e3 * (1 + hash(p.id) % 8), icon: 'trophy', text: `Venceu uma partida de ${S.game(p.playing || 'velha').name}` },
      { t: Date.now() - 86400e3 * 2, icon: 'trending-up', text: `Alcançou o nível ${p.level}` },
      { t: Date.now() - 86400e3 * 9, icon: 'award', text: 'Desbloqueou “Explorador”' }];
    const li = isMe ? S.levelInfo(p) : { pct: (hash(p.id) % 90) + 5 };
    const fs = isMe ? null : S.friendship(p.id);
    const div = S.divisionOf(p.mmr);

    el.innerHTML = `
      <div class="card profile-card">
        <div class="profile-banner" style="${cardStyle(p, theme)}"></div>
        <div class="profile-body">
          ${avatar(p, 'xl', { status: !isMe })}
          <div class="profile-id">
            <h1>${esc(p.username)} ${emblem(p.prestige)}</h1>
            ${isMe && p.title ? `<span class="tag tag-primary" style="margin-top:4px">${ic('badge')} ${esc(titleName(p.title))}</span>` : ''}
            <div class="row-wrap faint" style="margin-top:4px">
              <span>${ic('calendar', 'style="width:14px;height:14px;vertical-align:-2px"')} Desde ${dateBR(p.joined)}</span>
              ${!isMe ? `<span>·</span><span>${p.online ? '<b style="color:var(--success)">Online</b>' : 'Visto ' + timeAgo(p.lastSeen)}</span>` : ''}
            </div>
            ${p.bio ? `<p class="muted" style="margin-top:6px">${esc(p.bio)}</p>` : ''}
          </div>
          <div class="profile-actions">
            ${isMe ? `<button class="btn btn-primary" data-edit>${ic('palette')} Personalizar</button><a class="btn" href="#/shop">${ic('shopping-bag')} Loja</a><a class="btn" href="#/prestige">${ic('sparkles')} Prestígio</a><a class="btn" href="#/settings" aria-label="Configurações">${ic('settings')}</a>`
              : fs === 'friend' ? `<button class="btn btn-primary" data-duel ${p.online ? '' : 'disabled'}>${ic('swords')} Duelar</button><button class="btn" data-remove>${ic('user-minus')} Remover</button><button class="btn" data-block aria-label="Bloquear">${ic('ban')}</button>`
              : fs === 'incoming' ? `<button class="btn btn-success" data-accept>${ic('check')} Aceitar pedido</button>`
              : fs === 'sent' ? `<button class="btn" data-cancel>${ic('clock')} Pedido enviado</button>`
              : fs === 'blocked' ? `<button class="btn" data-unblock>${ic('ban')} Desbloquear</button>`
              : `<button class="btn btn-primary" data-add>${ic('user-plus')} Adicionar amigo</button><button class="btn" data-block aria-label="Bloquear">${ic('ban')}</button>`}
            ${!isMe ? `<button class="btn btn-ghost" data-report aria-label="Denunciar">${ic('flag')}</button>` : ''}
          </div>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="card stack">
          <div class="row"><h3 style="flex:1">${ic('trending-up')} Progressão</h3>${isMe && S.canPrestige() ? `<a class="btn btn-sm btn-accent" href="#/prestige">Ativar prestígio</a>` : ''}</div>
          <div class="row" style="gap:16px">${emblem(p.prestige, 'lg')}<div style="flex:1"><b style="font-family:var(--font-display);font-size:1.4rem">Nível ${p.level}</b><div class="faint">Prestígio ${p.prestige} · ${esc(pr.name)}</div></div></div>
          <div><div class="progress"><span style="width:${li.pct}%"></span></div>${isMe ? `<div class="faint" style="margin-top:6px">${fmt(li.xp)} / ${fmt(li.need)} XP · faltam ${fmt(li.toNext)} XP</div>` : ''}</div>
          <div class="kv">
            <div class="stat-box"><small>XP acumulado</small><b>${fmt(p.totalXp)}</b></div>
            <div class="stat-box"><small>Partidas</small><b>${fmt(matches)}</b></div>
            <div class="stat-box"><small>Vitórias</small><b style="color:var(--success)">${fmt(p.wins)}</b></div>
            <div class="stat-box"><small>Derrotas</small><b style="color:var(--danger)">${fmt(p.losses)}</b></div>
            <div class="stat-box"><small>Conquistas</small><b>${achCount}</b></div>
            <div class="stat-box"><small>Divisão</small><b style="color:${div.color};font-size:1.1rem">${div.name}</b></div>
          </div>
        </div>
        <div class="card"><h3 style="margin-bottom:10px">${ic('history')} Atividade recente</h3>
          ${history.length ? `<div class="timeline">${history.slice(0, 7).map(h => `<div class="tl-item"><span class="tl-ic">${ic(h.icon)}</span><div class="tl-main"><div>${esc(h.text)}</div><small>${timeAgo(h.t)}</small></div></div>`).join('')}</div>` : U.empty('history', 'Sem atividade', 'Jogue uma partida para começar.')}
        </div>
      </div>

      <div class="card section"><h3 style="margin-bottom:10px">${ic('bar-chart-3')} Estatísticas por jogo</h3>
        ${Object.keys(stats).length ? `<div class="table-scroll"><table class="stat-table"><thead><tr><th>Jogo</th><th>Partidas</th><th>Vitórias</th><th>Recorde</th></tr></thead><tbody>
          ${Object.entries(stats).map(([id, s]) => { const g = S.game(id); return `<tr><td><a href="#/game/${id}" class="row" style="gap:8px"><span class="ch-icon" style="width:30px;height:30px;border-radius:9px;background:${g.c1};color:#fff">${ic(g.icon, 'style="width:16px;height:16px"')}</span>${esc(g.name)}</a></td><td>${fmt(s.played)}</td><td>${g.noWins ? '<span class="faint">—</span>' : fmt(s.wins)}</td><td>${s.best != null ? fmt(s.best) + ' <span class="faint">' + esc(g.scoreLabel.toLowerCase()) + '</span>' : '—'}</td></tr>`; }).join('')}
        </tbody></table></div>` : U.empty('bar-chart-3', 'Nenhuma estatística ainda', 'Jogue para ver seus números aqui.')}
      </div>

      <div class="section">${sectionHead('heart', 'Jogos favoritos')}
        ${favs.length ? `<div class="game-row">${favs.map(S.game).filter(Boolean).map(gameCard).join('')}</div>` : U.empty('heart', 'Nenhum favorito', isMe ? 'Toque no coração dos jogos que você mais gosta.' : 'Este jogador ainda não favoritou jogos.')}
      </div>
      ${isMe && p.prestigeHistory.length ? `<div class="card section"><h3 style="margin-bottom:10px">${ic('sparkles')} Histórico de prestígios</h3><div class="list">${p.prestigeHistory.map(h => `<div class="list-item">${emblem(h.from + 1)}<div class="li-main"><b>Prestígio ${h.from + 1}</b><small>${dateBR(h.t)} · ${fmt(h.totalXp)} XP acumulados</small></div></div>`).join('')}</div></div>` : ''}`;

    el.onclick = e => {
      if (isMe && e.target.closest('[data-edit]')) return editProfile();
      if (isMe) return;
      const t = e.target.closest('button'); if (!t) return;
      const rerender = () => profileLayout(el, p, false);
      if (t.dataset.duel !== undefined) startMode('friend', null, p.id);
      if (t.dataset.add !== undefined) { S.sendRequest(p.id); U.toast('Solicitação enviada', 'success', 'send'); rerender(); }
      if (t.dataset.accept !== undefined) { S.acceptRequest(p.id); U.toast('Agora vocês são amigos!', 'success', 'user-check'); rerender(); }
      if (t.dataset.cancel !== undefined) { S.cancelRequest(p.id); U.toast('Solicitação cancelada'); rerender(); }
      if (t.dataset.unblock !== undefined) { S.unblock(p.id); U.toast('Jogador desbloqueado'); rerender(); }
      if (t.dataset.remove !== undefined) U.confirm({ title: 'Remover amigo?', text: `${esc(p.username)} sairá da sua lista de amigos.`, okLabel: 'Remover', danger: true, icon: 'user-minus', onOk: () => { S.removeFriend(p.id); rerender(); } });
      if (t.dataset.block !== undefined) U.confirm({ title: 'Bloquear jogador?', text: `${esc(p.username)} não poderá te convidar nem enviar solicitações.`, okLabel: 'Bloquear', danger: true, icon: 'ban', onOk: () => { S.block(p.id); U.toast('Jogador bloqueado'); rerender(); } });
      if (t.dataset.report !== undefined) reportPlayer(p);
    };
  }

  function reportPlayer(p) {
    U.modal({
      title: `Denunciar ${esc(p.username)}`, icon: 'flag', iconColor: 'var(--danger)',
      body: `<div class="stack"><div class="field"><label for="repReason">Motivo</label><select class="input" id="repReason"><option>Nome ou avatar ofensivo</option><option>Trapaça / uso de programas</option><option>Comportamento abusivo</option><option>Spam</option><option>Outro</option></select></div>
        <div class="field"><label for="repText">Detalhes (opcional)</label><textarea class="input" id="repText" rows="3" maxlength="400"></textarea></div>
        <div class="notice">${ic('info')} No protótipo a denúncia fica apenas registrada localmente. Em produção, vai para a fila de moderação.</div></div>`,
      actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, { label: 'Enviar denúncia', cls: 'btn-danger', onClick: () => { S.notify('flag', `Denúncia sobre ${p.username} registrada para moderação.`); S.save(); U.toast('Denúncia registrada. Obrigado!', 'success', 'flag'); } }]
    });
  }

  // Recorta a imagem em quadrado e reduz para 256px, para caber no armazenamento local.
  // Recorta a imagem (cobrindo w×h) e reduz; vira um data URL pequeno que cabe no perfil salvo
  function resizeImage(file, w, h, q) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error('Use uma imagem PNG, JPG, WEBP ou GIF.'));
      if (file.size > 12 * 1024 * 1024) return reject(new Error('A imagem deve ter no máximo 12 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.max(w / img.width, h / img.height), sw = w / k, sh = h / k;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    });
  }
  const resizePhoto = file => resizeImage(file, 256, 256, 0.85);
  const resizeBg = file => resizeImage(file, 720, 270, 0.78);
  // fundo do cartão: imagem do jogador (se houver) com um véu para o texto continuar legível
  const cardStyle = (p, theme) => p.cardImage ? `background:linear-gradient(rgba(0,0,0,.3),rgba(0,0,0,.3)),url('${esc(p.cardImage)}') center/cover` : `background:${themeColor(theme)}`;

  function editProfile() {
    const u = S.user;
    const draft = { username: u.username, bio: u.bio, icon: u.avatar.icon, color: u.avatar.color, frame: u.avatar.frame, theme: u.cardTheme, title: u.title, photo: u.avatar.photo || null, bg: u.cardImage || null };
    const owned = kind => S.catalog(kind).filter(x => S.owns(kind, x.id));
    const draw = m => {
      m.querySelector('.modal-body').innerHTML = `<div class="stack">
        <div class="photo-edit">
          ${avatar({ username: draft.username, avatar: { icon: draft.icon, color: draft.color, frame: draft.frame, photo: draft.photo } }, 'xl')}
          <div class="stack" style="gap:8px">
            <label class="btn btn-primary btn-sm" for="edPhoto" tabindex="0">${ic('camera')} ${draft.photo ? 'Trocar foto' : 'Enviar foto'}</label>
            <input type="file" id="edPhoto" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only">
            ${draft.photo ? `<button class="btn btn-sm btn-ghost" data-nophoto>${ic('image-off')} Usar ícone</button>` : ''}
            <span class="err" id="edPhotoErr"></span>
          </div>
        </div>
        <div class="field"><label>Imagem de fundo do cartão</label>
          <div class="row" style="gap:10px;flex-wrap:wrap"><label class="btn btn-sm" for="edBg" tabindex="0">${ic('image')} ${draft.bg ? 'Trocar imagem' : 'Enviar imagem'}</label><input type="file" id="edBg" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only">${draft.bg ? `<button class="btn btn-sm btn-ghost" data-nobg>${ic('image-off')} Remover</button>` : ''}</div>
          ${draft.bg ? `<div class="bg-prev" style="background-image:url('${esc(draft.bg)}')"></div>` : ''}
          <span class="err" id="edBgErr"></span><span class="hint">Aparece no seu perfil e na tela inicial e fica salva na sua conta. Use só imagens que você tem o direito de usar.</span></div>
        <div class="field"><label for="edName">Username</label><input class="input" id="edName" maxlength="20" value="${esc(draft.username)}"><span class="hint">3–20 caracteres: letras, números, ponto, hífen ou _. Deve ser único.</span><span class="err" id="edErr"></span></div>
        <div class="field"><label for="edBio">Bio</label><input class="input" id="edBio" maxlength="80" value="${esc(draft.bio)}" placeholder="Conte algo sobre você"></div>
        <div class="field"><label for="edTitle">Título</label><select class="input" id="edTitle">${owned('titles').map(t => `<option value="${t.id}" ${t.id === draft.title ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Ícone do avatar ${draft.photo ? '<span class="faint">(usado quando não há foto)</span>' : ''}</label><div class="picker">${owned('icons').map(i => `<button class="pick" data-icon="${i.id}" aria-pressed="${i.id === draft.icon}" aria-label="Ícone ${i.id}"><span class="avatar av-sm" style="--av:${draft.color}">${ic(i.id)}</span></button>`).join('')}</div></div>
        <div class="field"><label>Cor</label><div class="picker">${C.avatarColors.map(c => `<button class="pick" data-color="${c}" aria-pressed="${c === draft.color}" aria-label="Cor ${c}"><span class="swatch" style="background:${c}"></span></button>`).join('')}</div></div>
        <div class="field"><label>Moldura</label><div class="picker">${owned('frames').map(f => `<button class="pick" data-frame="${f.id}" aria-pressed="${f.id === draft.frame}"><span class="avatar av-sm ${f.id !== 'none' ? 'frame-' + f.id : ''}" style="--av:var(--surface-3);color:var(--text-2)">${ic('user')}</span><div class="faint" style="font-size:.7rem;margin-top:4px">${f.name}</div></button>`).join('')}</div></div>
        <div class="field"><label>Tema do cartão</label><div class="picker">${owned('themes').map(t => `<button class="pick" data-theme="${t.id}" aria-pressed="${t.id === draft.theme}"><span class="theme-swatch" style="background:${t.color}"></span><div class="faint" style="font-size:.72rem;margin-top:4px">${t.name}</div></button>`).join('')}</div></div>
        <a class="notice" href="#/shop">${ic('shopping-bag')} <span>Quer mais ícones, molduras, temas e títulos? <b>Visite a loja</b>.</span></a>
      </div>`;
      U.refreshIcons();
      m.querySelector('#edName').oninput = e => { draft.username = e.target.value; };
      m.querySelector('#edBio').oninput = e => { draft.bio = e.target.value; };
      m.querySelector('#edTitle').onchange = e => { draft.title = e.target.value; };
      m.querySelector('label[for=edPhoto]').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); m.querySelector('#edPhoto').click(); } };
      m.querySelector('label[for=edBg]').onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); m.querySelector('#edBg').click(); } };
      m.querySelector('#edBg').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { draft.bg = await resizeBg(f); draw(m); }
        catch (err) { m.querySelector('#edBgErr').textContent = err.message; }
      };
      m.querySelector('#edPhoto').onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try { draft.photo = await resizePhoto(f); draw(m); }
        catch (err) { m.querySelector('#edPhotoErr').textContent = err.message; }
      };
    };
    U.modal({
      title: 'Personalizar perfil', wide: true, body: '',
      actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, {
        label: 'Salvar', cls: 'btn-primary', icon: 'check', onClick: m => {
          const n = draft.username.trim();
          const err = !/^[\w.\-]{3,20}$/.test(n) ? 'Username inválido.' : (n.toLowerCase() !== u.username.toLowerCase() && S.usernameTaken(n)) ? 'Este username já está em uso.' : '';
          if (err) { m.querySelector('#edErr').textContent = err; m.querySelector('#edName').focus(); return false; }
          const apply = photo => {
            Object.assign(u, { username: n, bio: draft.bio.trim(), cardTheme: draft.theme, title: draft.title, cardImage: draft.bg || null });
            Object.assign(u.avatar, { icon: draft.icon, color: draft.color, frame: draft.frame, photo });
            S.save(); U.toast('Perfil atualizado!', 'success', 'check');
            AH.app.render();
          };
          // No modo nuvem a foto vai para o Supabase Storage e o perfil guarda só a URL
          if (AH.cloud.enabled && draft.photo && draft.photo.startsWith('data:')) {
            const btn = m.querySelector('.modal-foot .btn-primary'); btn.disabled = true; btn.textContent = 'Enviando foto…';
            AH.cloud.uploadAvatar(draft.photo)
              .then(url => { U.close(); apply(url); })
              .catch(e2 => { console.warn('Upload da foto falhou; guardando no perfil.', e2); U.close(); apply(draft.photo); });
            return false;
          }
          apply(draft.photo);
        }
      }],
      onMount: m => {
        draw(m);
        m.addEventListener('click', e => {
          if (e.target.closest('[data-nophoto]')) { draft.photo = null; draw(m); return; }
          if (e.target.closest('[data-nobg]')) { draft.bg = null; draw(m); return; }
          const b = e.target.closest('.pick'); if (!b || b.disabled) return;
          if (b.dataset.icon) draft.icon = b.dataset.icon;
          if (b.dataset.color) draft.color = b.dataset.color;
          if (b.dataset.frame) draft.frame = b.dataset.frame;
          if (b.dataset.theme) draft.theme = b.dataset.theme;
          const sel = Object.keys(b.dataset)[0];
          draw(m);
          m.querySelector(`[data-${sel}="${b.dataset[sel]}"]`)?.focus();
        });
      }
    });
  }

  /* ==================== LOJA ==================== */
  V.shop = (el, p, q) => {
    let tab = q.tab || 'frames';
    const tabs = [['frames', 'Molduras', 'circle-dashed'], ['themes', 'Temas do cartão', 'palette'], ['colors', 'Cores do app', 'paintbrush'], ['icons', 'Ícones', 'smile'], ['titles', 'Títulos', 'badge']];
    const equipped = kind => ({ frames: S.user.avatar.frame, themes: S.user.cardTheme, icons: S.user.avatar.icon, titles: S.user.title, colors: S.user.appColor }[kind]);
    const itemName = (kind, it) => kind === 'icons' ? 'Ícone ' + it.id.replace(/-\d+$/, '').replace(/-/g, ' ') : it.name;
    const preview = (kind, it) => {
      const u = S.user;
      if (kind === 'frames') return avatar({ username: u.username, avatar: { ...u.avatar, frame: it.id } }, 'lg');
      if (kind === 'themes') return `<div class="shop-theme" style="background:${it.color}">${avatar(u, 'sm')}<span>${esc(u.username)}</span></div>`;
      if (kind === 'colors') return `<div class="shop-color" style="--c:${it.color};--d:${it.dark};--on:${it.on}"><span class="sc-btn">Botão</span><span class="sc-dot"></span><span class="sc-dot sc-dot-d"></span></div>`;
      if (kind === 'icons') return `<span class="avatar av-lg" style="--av:${u.avatar.color}">${ic(it.id)}</span>`;
      return `<span class="tag tag-primary" style="font-size:.9rem;padding:6px 12px">${ic('badge')} ${esc(it.name)}</span>`;
    };
    const draw = () => {
      const items = S.catalog(tab);
      el.innerHTML = `<div class="page-head"><div><h1>Loja</h1><p>Cosméticos para deixar seu perfil com a sua cara. Nenhum dá vantagem nos jogos.</p></div>
          <span class="coin-pill" style="height:46px;font-size:1.1rem"><span class="coin">${ic('star')}</span>${fmt(S.user.coins)} moedas</span></div>
        <div class="tabs" role="tablist" style="margin-bottom:18px">${tabs.map(([k, l, i]) => `<button class="tab ${k === tab ? 'active' : ''}" role="tab" aria-selected="${k === tab}" data-tab="${k}">${ic(i)} ${l}</button>`).join('')}</div>
        <div class="shop-grid">${items.map(it => {
          const own = S.owns(tab, it.id), on = equipped(tab) === it.id;
          const action = on ? `<span class="tag tag-success">${ic('check')} Equipado</span>`
            : own ? `<button class="btn btn-sm" data-equip="${it.id}">Equipar</button>`
            : it.prestige ? `<span class="tag">${ic('lock')} Prestígio ${it.prestige}</span>`
            : it.ach ? `<a class="tag" href="#/achievements">${ic('lock')} Conquista</a>`
            : `<button class="btn btn-sm btn-primary" data-buy="${it.id}" ${S.user.coins < it.price ? 'disabled title="Moedas insuficientes"' : ''}>${ic('star')} ${fmt(it.price)}</button>`;
          return `<div class="shop-item ${on ? 'on' : ''}"><div class="shop-prev">${preview(tab, it)}</div>
            <b>${esc(itemName(tab, it))}</b><small class="faint">${it.prestige ? 'Exclusivo de prestígio' : it.ach ? (own ? 'Conquistado' : AH.achievements.find(a => a.id === it.ach)?.desc || 'Exclusivo de conquista') : !it.price ? 'Grátis' : own ? 'Na sua coleção' : 'Cosmético'}</small>${action}</div>`;
        }).join('')}</div>
        <p class="faint" style="margin-top:14px">${ic('info', 'style="width:14px;height:14px;vertical-align:-2px"')} Ganhe moedas jogando, vencendo duelos e completando desafios. Moedas não têm valor real.</p>`;
      U.refreshIcons();
    };
    el.onclick = e => {
      const t = e.target.closest('[data-tab]');
      if (t) { tab = t.dataset.tab; history.replaceState(null, '', '#/shop?tab=' + tab); draw(); return; }
      const eq = e.target.closest('[data-equip]');
      if (eq) { S.equip(tab, eq.dataset.equip); AH.app.applyTheme(); U.toast('Item equipado!', 'success', 'check'); draw(); return; }
      const b = e.target.closest('[data-buy]');
      if (!b) return;
      const it = S.catalog(tab).find(x => x.id === b.dataset.buy);
      U.confirm({
        title: 'Confirmar compra', icon: 'shopping-bag',
        text: `Comprar <b>${esc(itemName(tab, it))}</b> por <b>${fmt(it.price)} moedas</b>? Você ficará com ${fmt(S.user.coins - it.price)}.`,
        okLabel: 'Comprar',
        onOk: () => {
          const r = S.buy(tab, it.id);
          if (!r.ok) return U.toast(r.error, 'error');
          S.equip(tab, it.id); AH.app.applyTheme();
          U.toast('Compra feita e item equipado!', 'success', 'shopping-bag'); U.confetti(30); draw();
        }
      });
    };
    draw();
  };

  /* ==================== LOJA DO JOGO ==================== */
  // Joga o próprio jogo, de verdade, com o item aplicado — nada é comprado, salvo ou contado.
  // Tema comprado na loja do jogo: variáveis CSS + classe que tinge superfícies e molduras da partida
  function applyGameTheme(wrap, gameId) {
    const vars = S.skin(gameId, 'theme').vars;
    if (!vars) return;
    Object.entries(vars).forEach(([k, val]) => wrap.style.setProperty(k, val));
    wrap.classList.add('gs-themed');
  }
  function openPreview(g, slotId, it) {
    const root = document.createElement('div');
    root.className = 'gs-preview';
    root.innerHTML = `<div class="gs-pv-head"><b>${ic('eye')} Prévia: ${esc(it.name)}</b><button class="btn btn-sm btn-primary" data-close>${ic('x')} Fechar</button><span class="faint" style="flex-basis:100%">Jogue à vontade: nada daqui é salvo nem dá recompensa.</span></div>
      <div class="play-wrap"><div id="pvEngine"></div></div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    S.setPreview({ game: g.id, slot: slotId, id: it.id });
    applyGameTheme(root.querySelector('.play-wrap'), g.id);
    const host = root.querySelector('#pvEngine');
    let cleanup = null, closed = false;
    const run = () => {
      if (closed) return;
      cleanup?.();
      const ctx = { mode: 'solo', opponent: null, chosen: true, preview: true, end: () => setTimeout(run, 900) };
      host.innerHTML = '';
      cleanup = AH.engines[g.id].mount(host, ctx) || null;
      host.querySelectorAll('[data-restart], [data-levels]').forEach(b => { b.hidden = false; });
      U.refreshIcons();
    };
    const close = () => { closed = true; cleanup?.(); S.setPreview(null); root.remove(); document.body.style.overflow = ''; };
    root.querySelector('[data-close]').onclick = close;
    window.addEventListener('hashchange', close, { once: true });
    U.refreshIcons();
    run();
  }

  V.gameShop = (el, [id], q) => {
    const g = S.game(id);
    if (!g) return V.notFound(el);
    const slots = AH.gameShop.slots(id);
    let slotId = slots.some(x => x.id === q.slot) ? q.slot : slots[0].id;
    const preview = it => `<div class="gs-prev" style="--c1:${g.c1};--c2:${g.c2}">${it.sw.slice(0, 3).map(c => `<i style="background:${c}"></i>`).join('')}</div>`;
    const draw = () => {
      const slot = slots.find(x => x.id === slotId);
      const eq = S.skin(id, slotId).id;
      el.innerHTML = `
        <a class="link-more" href="#/game/${g.id}" style="margin-bottom:12px">${ic('arrow-left')} ${esc(g.name)}</a>
        <div class="page-head"><div class="row" style="gap:14px"><span class="ch-icon" style="width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,${g.c1},${g.c2});color:#fff">${ic(g.icon)}</span>
          <div><h1>Loja · ${esc(g.name)}</h1><p>Cosméticos só para este jogo. Nenhum dá vantagem na partida.</p></div></div>
          <span class="coin-pill" style="height:46px;font-size:1.1rem"><span class="coin">${ic('star')}</span>${fmt(S.user.coins)} moedas</span></div>
        <div class="tabs" role="tablist" style="margin-bottom:18px">${slots.map(x => `<button class="tab ${x.id === slotId ? 'active' : ''}" role="tab" aria-selected="${x.id === slotId}" data-slot="${x.id}">${ic(x.icon)} ${esc(x.name)}</button>`).join('')}</div>
        <div class="shop-grid">${slot.items.map(it => {
          const own = S.gameOwns(id, slotId, it.id), on = eq === it.id;
          const action = on ? `<span class="tag tag-success">${ic('check')} Equipado</span>`
            : own ? `<button class="btn btn-sm" data-equip="${it.id}">Equipar</button>`
            : `<button class="btn btn-sm btn-primary" data-buy="${it.id}" ${S.user.coins < it.price ? 'disabled title="Moedas insuficientes"' : ''}>${ic('star')} ${fmt(it.price)}</button>`;
          return `<div class="shop-item ${on ? 'on' : ''}"><button class="gs-eye" data-eye="${it.id}" aria-label="Ver ${esc(it.name)} no jogo" title="Ver no jogo">${ic('eye')}</button><div class="shop-prev">${preview(it)}</div><b>${esc(it.name)}</b><small class="faint">${!it.price ? 'Grátis' : own ? 'Na sua coleção' : 'Cosmético'}</small>${action}</div>`;
        }).join('')}</div>
        <div class="row-wrap" style="margin-top:18px"><a class="btn btn-primary" href="#/play/${g.id}">${ic('play')} Jogar com os itens</a><a class="btn" href="#/shop">${ic('shopping-bag')} Loja do perfil</a></div>
        <p class="faint" style="margin-top:14px">${ic('info', 'style="width:14px;height:14px;vertical-align:-2px"')} Ganhe moedas jogando, vencendo duelos e completando desafios. Moedas não têm valor real.</p>`;
      U.refreshIcons();
    };
    el.onclick = e => {
      const t = e.target.closest('[data-slot]');
      if (t) { slotId = t.dataset.slot; history.replaceState(null, '', `#/gshop/${id}?slot=${slotId}`); draw(); return; }
      const eye = e.target.closest('[data-eye]');
      if (eye) return openPreview(g, slotId, AH.gameShop.item(id, slotId, eye.dataset.eye));
      const eqb = e.target.closest('[data-equip]');
      if (eqb) { S.gameEquip(id, slotId, eqb.dataset.equip); U.toast('Item equipado!', 'success', 'check'); draw(); return; }
      const b = e.target.closest('[data-buy]');
      if (!b) return;
      const it = AH.gameShop.item(id, slotId, b.dataset.buy);
      U.confirm({
        title: 'Confirmar compra', icon: 'shopping-bag',
        text: `Comprar <b>${esc(it.name)}</b> por <b>${fmt(it.price)} moedas</b>? Você ficará com ${fmt(S.user.coins - it.price)}.`, okLabel: 'Comprar',
        onOk: () => {
          const r = S.gameBuy(id, slotId, it.id);
          if (!r.ok) return U.toast(r.error, 'error');
          S.gameEquip(id, slotId, it.id);
          U.toast('Compra feita e item equipado!', 'success', 'shopping-bag'); U.confetti(30); draw();
        }
      });
    };
    draw();
  };

  V.profile = el => profileLayout(el, S.user, true);
  V.user = (el, [id]) => {
    if (id === S.user.id) return go('#/profile');
    const p = S.player(id);
    if (!p && AH.online?.enabled) {
      el.innerHTML = U.skeletonGrid(2);
      AH.online.loadProfile(id).then(pp => { if (!el.isConnected) return; pp ? profileLayout(el, pp, false) : V.notFound(el); U.refreshIcons(); });
      return;
    }
    if (!p) return V.notFound(el);
    profileLayout(el, p, false);
  };

  /* ==================== PRESTÍGIO ==================== */
  V.prestige = el => {
    const u = S.user, cur = S.prestigeOf(u.prestige), next = S.prestigeOf(u.prestige + 1);
    const can = S.canPrestige();
    const frame = C.frames.find(f => f.prestige === u.prestige + 1);
    el.innerHTML = `
      <div class="page-head"><div><a class="link-more" href="#/profile">${ic('arrow-left')} Perfil</a><h1 style="margin-top:6px">Prestígio</h1><p>Recomece do nível 1 com status e cosméticos exclusivos.</p></div></div>
      <div class="prestige-hero">
        <div class="prestige-flow">
          <div class="em-col">${emblem(u.prestige, 'xl')}<b>Atual: ${esc(cur.name)}</b><small>Prestígio ${u.prestige}</small></div>
          <span class="arrow">${ic('chevrons-right', 'style="width:40px;height:40px"')}</span>
          <div class="em-col" style="${can ? '' : 'opacity:.75'}">${emblem(u.prestige + 1, 'xl')}<b>Próximo: ${esc(next.name)}</b><small>Prestígio ${u.prestige + 1}</small></div>
        </div>
        <div style="position:relative;max-width:420px;margin:0 auto">
          <div class="progress" style="background:rgba(255,255,255,.18)"><span style="width:${Math.min(100, u.level)}%;background:#f2b316"></span></div>
          <p style="margin-top:8px;color:rgba(255,255,255,.8);font-weight:600">Nível ${u.level} de ${C.maxLevel}</p>
        </div>
      </div>
      <div class="grid-2 section">
        <div class="card"><h3 style="margin-bottom:12px">${ic('gift')} Recompensas</h3>
          <div class="reward-list">
            <div class="reward"><span class="ch-icon">${emblem(u.prestige + 1)}</span><div><b>Emblema “${esc(next.name)}”</b><div class="faint">Exibido no perfil e nos rankings</div></div></div>
            <div class="reward"><span class="ch-icon">${ic('circle-dashed')}</span><div><b>${frame ? `Moldura “${esc(frame.name)}”` : 'Moldura lendária'}</b><div class="faint">Nova moldura de avatar</div></div></div>
            <div class="reward"><span class="ch-icon">${ic('coins', 'style="color:var(--coin)"')}</span><div><b>+500 moedas cosméticas</b><div class="faint">Para personalizações futuras</div></div></div>
          </div></div>
        <div class="card"><h3 style="margin-bottom:12px">${ic('list-checks')} Requisitos e regras</h3>
          <div class="req ${can ? 'ok' : ''}">${ic(can ? 'check-circle-2' : 'circle')} Alcançar o nível ${C.maxLevel}</div>
          <div class="req ok">${ic('check-circle-2')} Seu nível volta para 1</div>
          <div class="req ok">${ic('check-circle-2')} Mantém amigos, conquistas e recordes</div>
          <div class="req ok">${ic('check-circle-2')} Mantém jogos desbloqueados e moedas</div>
          <div class="req ok">${ic('check-circle-2')} Fica registrado no seu histórico</div>
          <button class="btn btn-lg btn-accent btn-block" style="margin-top:16px" data-go ${can ? '' : 'disabled'}>${ic('sparkles')} ${can ? 'Ativar prestígio' : `Faltam ${C.maxLevel - u.level} níveis`}</button>
          ${can ? '' : '<p class="faint" style="margin-top:8px;text-align:center">O prestígio é opcional e nunca é ativado automaticamente. Para testar, use as ferramentas de demonstração em Configurações.</p>'}
        </div>
      </div>`;
    const btn = el.querySelector('[data-go]');
    btn.onclick = () => U.confirm({
      title: `Ativar Prestígio ${u.prestige + 1}?`, icon: 'sparkles',
      text: `Seu nível voltará para <b>1</b>. Você mantém amigos, conquistas, recordes e jogos. Esta ação não pode ser desfeita.`,
      okLabel: 'Sim, ativar prestígio',
      onOk: () => {
        S.doPrestige(); S.user.coins += 500; S.save();
        AH.app.render();
        U.confetti(160);
        U.modal({
          title: 'Prestígio ativado!', dismissable: true,
          body: `<div style="text-align:center"><div class="spin-in" style="display:inline-block;margin:6px 0 14px">${emblem(S.user.prestige, 'xl')}</div><h3>${esc(S.prestigeOf(S.user.prestige).name)}</h3><p class="muted" style="margin-top:6px">Você agora é Prestígio ${S.user.prestige}. Nova moldura desbloqueada e equipada!</p></div>`,
          actions: [{ label: 'Ver perfil', cls: 'btn-primary', onClick: () => go('#/profile') }]
        });
      }
    });
  };

  /* ==================== CONFIGURAÇÕES ==================== */
  V.settings = el => {
    const st = S.state.settings, u = S.user;
    const sw = (key, label, desc, obj = 'settings') => `<div class="list-item"><div class="li-main"><b>${label}</b><small>${desc}</small></div><label class="switch"><input type="checkbox" data-sw="${obj}.${key}" ${(obj === 'settings' ? st : u.privacy)[key] ? 'checked' : ''} aria-label="${label}"><span></span></label></div>`;
    el.innerHTML = `<div class="page-head"><div><h1>Configurações</h1><p>Preferências salvas neste navegador.</p></div></div>
      <div class="grid-2">
        <div class="stack">
          <div class="card"><h3 style="margin-bottom:12px">${ic('palette')} Aparência</h3>
            <div class="tabs" role="radiogroup" aria-label="Tema">${[['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']].map(([k, l, i]) => `<button class="tab ${st.theme === k ? 'active' : ''}" role="radio" aria-checked="${st.theme === k}" data-theme-set="${k}" style="flex:1;justify-content:center">${ic(i)} ${l}</button>`).join('')}</div>
          </div>
          <div class="card"><h3>${ic('bell')} Preferências</h3><div class="list">
            ${sw('sound', 'Efeitos sonoros', 'Sons de clique e vitória (em breve)')}
            ${sw('notifications', 'Notificações', 'Convites, pedidos de amizade e conquistas')}
          </div></div>
          <div class="card"><h3>${ic('shield')} Privacidade</h3><div class="list">
            ${sw('sharePlaying', 'Mostrar o que estou jogando', 'Amigos veem o jogo atual no painel deles', 'privacy')}
            ${sw('showOnline', 'Mostrar status online', 'Se desligado, você aparece como offline', 'privacy')}
          </div></div>
        </div>
        <div class="stack">
          <div class="card"><h3 style="margin-bottom:12px">${ic('user-cog')} Conta</h3>
            <div class="list">
              <div class="list-item"><div class="li-main"><b>Username</b><small>${esc(u.username)}</small></div><a class="btn btn-sm" href="#/profile">Editar</a></div>
              <div class="list-item"><div class="li-main"><b>Senha</b><small>Gerenciada pelo provedor de autenticação</small></div><button class="btn btn-sm" data-pwd>Alterar</button></div>
            </div>
            <button class="btn btn-block btn-outline" style="margin-top:12px" data-logout>${ic('log-out')} Sair da conta</button>
          </div>
          <div class="card"><h3 style="margin-bottom:4px">${ic('flask-conical')} Ferramentas de demonstração</h3>
            <p class="faint" style="margin-bottom:12px">Existem apenas no protótipo para testar a progressão. Em produção, o XP é concedido e validado pelo servidor.</p>
            <div class="row-wrap">
              <button class="btn btn-sm" data-demo="xp">${ic('zap')} +500 XP</button>
              <button class="btn btn-sm" data-demo="lvl100">${ic('chevrons-up')} Ir para nível 100</button>
              <button class="btn btn-sm btn-danger" data-demo="reset">${ic('trash-2')} Restaurar dados demo</button>
            </div>
          </div>
        </div>
      </div>`;
    if (AH.cloud.enabled) el.querySelector('[data-demo]')?.closest('.card').remove();
    el.onclick = e => {
      const t = e.target.closest('[data-theme-set]');
      if (t) { st.theme = t.dataset.themeSet; S.save(); AH.app.applyTheme(); V.settings(el); U.refreshIcons(); return; }
      if (e.target.closest('[data-pwd]') && AH.cloud.enabled) return V.newPasswordModal();
      if (e.target.closest('[data-pwd]')) U.modal({ title: 'Alterar senha', icon: 'key-round', body: `<p class="muted">No protótipo nenhuma senha é armazenada. Com o backend conectado, enviaremos um link seguro de redefinição para o seu e-mail (Supabase Auth).</p>`, actions: [{ label: 'Entendi', cls: 'btn-primary' }] });
      if (e.target.closest('[data-logout]')) U.confirm({ title: 'Sair da conta?', icon: 'log-out', text: 'Seus dados demonstrativos continuam salvos neste navegador.', okLabel: 'Sair', onOk: () => { if (AH.cloud.enabled) AH.cloud.signOut(); else { S.logout(); go('#/login'); } } });
      const d = e.target.closest('[data-demo]');
      if (d) {
        if (d.dataset.demo === 'xp') { const ev = S.addXp(500); S.checkAchievements(); S.save(); U.rewardToasts({ xp: 500, coins: 0, levelUps: ev }); }
        if (d.dataset.demo === 'lvl100') U.confirm({ title: 'Ir para o nível 100?', icon: 'chevrons-up', text: 'Ferramenta de teste: seu nível será definido como 100 para você experimentar o prestígio.', okLabel: 'Definir nível 100', onOk: () => { u.level = C.maxLevel; u.xp = 0; S.checkAchievements(); S.notify('sparkles', 'Nível 100! Você já pode ativar um novo prestígio.', '#/prestige'); S.save(); U.toast('Nível 100 alcançado! Abra a tela de prestígio.', 'success', 'sparkles'); go('#/prestige'); } });
        if (d.dataset.demo === 'reset') U.confirm({ title: 'Restaurar dados de demonstração?', danger: true, icon: 'trash-2', text: 'Todo o progresso local (XP, amigos, conquistas) será substituído pelos dados de exemplo. Isso não pode ser desfeito.', okLabel: 'Restaurar', onOk: () => { S.reset(); AH.app.applyTheme(); U.toast('Dados restaurados'); go('#/home'); } });
      }
    };
    el.onchange = e => {
      const s = e.target.dataset.sw; if (!s) return;
      const [obj, key] = s.split('.');
      (obj === 'settings' ? st : u.privacy)[key] = e.target.checked;
      S.save(); U.toast('Preferência salva', 'success', 'check');
    };
  };

  /* ==================== AUTENTICAÇÃO ==================== */
  const authShell = (title, sub, body, foot) => `<div class="auth-wrap"><div class="card auth-card">
    <div class="brand"><span class="brand-mark">${ic('gamepad-2')}</span><span class="brand-name">Arcade<b>Hub</b></span></div>
    <h1>${title}</h1><p>${sub}</p>${body}<div class="auth-foot">${foot}</div></div></div>`;
  const pwdField = (id, label, auto) => `<div class="field"><label for="${id}">${label}</label><div style="position:relative"><input class="input" type="password" id="${id}" autocomplete="${auto}" required minlength="6" style="padding-right:48px"><button type="button" class="icon-btn" data-peek="${id}" aria-label="Mostrar senha" style="position:absolute;right:4px;top:4px;width:38px;height:38px;box-shadow:none;background:none">${ic('eye')}</button></div></div>`;
  const simNotice = AH.cloud.enabled ? '' : `<div class="notice">${ic('info')} <span>Protótipo: a sessão é simulada e <b>nenhuma senha é armazenada</b>. A autenticação real será feita pelo backend.</span></div>`;
  function bindPeek(el) { el.querySelectorAll('[data-peek]').forEach(b => b.onclick = () => { const i = el.querySelector('#' + b.dataset.peek); i.type = i.type === 'password' ? 'text' : 'password'; b.setAttribute('aria-label', i.type === 'password' ? 'Mostrar senha' : 'Ocultar senha'); }); }

  V.login = el => {
    el.innerHTML = authShell('Entrar', 'Bom te ver de novo! Seus jogos estão esperando.', `
      <form class="stack" novalidate>
        <div class="field"><label for="lgUser">${AH.cloud.enabled ? 'E-mail' : 'E-mail ou username'}</label><input class="input" id="lgUser" ${AH.cloud.enabled ? 'type="email" autocomplete="email"' : 'autocomplete="username" placeholder="PlayerUm"'} required></div>
        ${pwdField('lgPass', 'Senha', 'current-password')}
        <div class="row" style="justify-content:space-between"><label class="row" style="gap:8px;font-size:.9rem"><input type="checkbox" checked> Manter conectado</label><a class="text-link" href="#/recover" style="font-size:.9rem">Esqueci a senha</a></div>
        <span class="err" id="lgErr" role="alert" style="color:var(--danger);font-size:.85rem"></span>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${ic('log-in')} Entrar</button>
        ${AH.cloud.enabled ? '' : `<button class="btn btn-block btn-outline" type="button" data-demo>${ic('play')} Entrar com conta demo</button>`}
        ${simNotice}
      </form>`, `Novo por aqui? <a href="#/register">Criar conta grátis</a>`);
    bindPeek(el);
    const form = el.querySelector('form');
    form.onsubmit = e => {
      e.preventDefault();
      const id = el.querySelector('#lgUser').value.trim(), pw = el.querySelector('#lgPass').value;
      if (!id || pw.length < 6) { el.querySelector('#lgErr').textContent = 'Informe o usuário e uma senha com pelo menos 6 caracteres.'; return; }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.innerHTML = 'Entrando…';
      if (AH.cloud.enabled) {
        AH.cloud.signIn(id, pw)
          .then(() => { U.toast(`Bem-vindo, ${esc(S.user.username)}!`, 'success', 'party-popper'); go('#/home'); })
          .catch(err => { el.querySelector('#lgErr').textContent = AH.cloud.msg(err); btn.disabled = false; btn.innerHTML = `${ic('log-in')} Entrar`; U.refreshIcons(); });
        return;
      }
      setTimeout(() => { S.login(id); U.toast(`Bem-vindo, ${esc(S.user.username)}!`, 'success', 'party-popper'); go('#/home'); }, 600);
    };
    const demoBtn = el.querySelector('[data-demo]');
    if (demoBtn) demoBtn.onclick = () => { S.login(); go('#/home'); };
  };

  V.register = el => {
    let draft = { icon: 'cat', color: '#6c4cf5' };
    el.innerHTML = authShell('Criar conta', 'Grátis, rápido e cheio de jogos.', `
      <form class="stack" novalidate>
        <div class="field"><label>Escolha um avatar</label><div class="picker" id="rgIcons">${C.avatarIcons.slice(0, 8).map(i => `<button type="button" class="pick" data-icon="${i}" aria-pressed="${i === draft.icon}" aria-label="Avatar ${i}"><span class="avatar av-sm" style="--av:${draft.color}">${ic(i)}</span></button>`).join('')}</div></div>
        <div class="field"><label for="rgUser">Username</label><input class="input" id="rgUser" maxlength="20" autocomplete="username" required><span class="hint" id="rgUserHint">3–20 caracteres. Será seu nome público e único.</span></div>
        <div class="field"><label for="rgMail">E-mail</label><input class="input" id="rgMail" type="email" autocomplete="email" required></div>
        ${pwdField('rgPass', 'Senha', 'new-password')}
        ${pwdField('rgPass2', 'Confirmar senha', 'new-password')}
        <label class="row" style="gap:8px;font-size:.88rem;align-items:flex-start"><input type="checkbox" id="rgTerms" style="margin-top:3px"> <span>Li e aceito os termos de uso e a política de privacidade.</span></label>
        <span class="err" id="rgErr" role="alert" style="color:var(--danger);font-size:.85rem"></span>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${ic('user-plus')} Criar conta</button>
        ${simNotice}
      </form>`, `Já tem conta? <a href="#/login">Entrar</a>`);
    bindPeek(el);
    const userIn = el.querySelector('#rgUser'), hint = el.querySelector('#rgUserHint');
    userIn.oninput = () => {
      const n = userIn.value.trim();
      if (!n) { hint.textContent = '3–20 caracteres. Será seu nome público e único.'; hint.style.color = ''; return; }
      const ok = /^[\w.\-]{3,20}$/.test(n) && !S.usernameTaken(n);
      hint.textContent = !/^[\w.\-]{3,20}$/.test(n) ? 'Use 3–20 letras, números, ponto, hífen ou _.' : ok ? '✓ Disponível' : 'Este username já está em uso.';
      hint.style.color = ok ? 'var(--success)' : 'var(--danger)';
    };
    el.querySelector('#rgIcons').onclick = e => { const b = e.target.closest('[data-icon]'); if (!b) return; draft.icon = b.dataset.icon; el.querySelectorAll('[data-icon]').forEach(x => x.setAttribute('aria-pressed', x === b)); };
    el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const n = userIn.value.trim(), mail = el.querySelector('#rgMail').value.trim(), p1 = el.querySelector('#rgPass').value, p2 = el.querySelector('#rgPass2').value;
      const err = !/^[\w.\-]{3,20}$/.test(n) ? 'Username inválido.' : S.usernameTaken(n) ? 'Este username já está em uso.' : !/^\S+@\S+\.\S+$/.test(mail) ? 'Informe um e-mail válido.' : p1.length < 6 ? 'A senha precisa ter ao menos 6 caracteres.' : p1 !== p2 ? 'As senhas não coincidem.' : !el.querySelector('#rgTerms').checked ? 'Você precisa aceitar os termos.' : '';
      if (err) { el.querySelector('#rgErr').textContent = err; return; }
      if (AH.cloud.enabled) {
        const btn = el.querySelector('form [type=submit]'); btn.disabled = true; btn.textContent = 'Criando conta…';
        AH.cloud.signUp(mail, p1, n, { icon: draft.icon, color: draft.color })
          .then(r => {
            if (r.needsConfirm) {
              el.querySelector('form').outerHTML = `<div class="empty" style="padding:10px 0"><div class="empty-ic" style="background:var(--success-soft);color:var(--success)">${ic('mail-check')}</div><h3>Confirme seu e-mail</h3><p>Enviamos um link para <b>${esc(mail)}</b>. Abra-o para ativar a conta e depois entre normalmente.</p></div>`;
              U.refreshIcons(); return;
            }
            U.confetti(60); U.toast(`Conta criada! Bem-vindo, ${esc(n)}`, 'success', 'party-popper'); go('#/home');
          })
          .catch(e2 => { el.querySelector('#rgErr').textContent = AH.cloud.msg(e2); btn.disabled = false; btn.innerHTML = `${ic('user-plus')} Criar conta`; U.refreshIcons(); });
        return;
      }
      U.confirm({
        title: 'Criar nova conta local?', icon: 'user-plus',
        text: 'Isso substituirá a conta demonstrativa salva neste navegador por uma conta nova, começando do nível 1.',
        okLabel: 'Criar conta',
        onOk: () => { S.register(n, draft); U.confetti(60); U.toast(`Conta criada! Bem-vindo, ${esc(n)}`, 'success', 'party-popper'); go('#/home'); }
      });
    };
  };

  V.recover = el => {
    el.innerHTML = authShell('Recuperar senha', 'Enviaremos um link para redefinir sua senha.', `
      <form class="stack" novalidate>
        <div class="field"><label for="rcMail">E-mail da conta</label><input class="input" id="rcMail" type="email" autocomplete="email" required></div>
        <span class="err" id="rcErr" role="alert" style="color:var(--danger);font-size:.85rem"></span>
        <button class="btn btn-primary btn-lg btn-block" type="submit">${ic('mail')} Enviar link</button>
      </form>`, `<a href="#/login">${ic('arrow-left', 'style="width:14px;height:14px;vertical-align:-2px"')} Voltar ao login</a>`);
    el.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const m = el.querySelector('#rcMail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(m)) { el.querySelector('#rcErr').textContent = 'Informe um e-mail válido.'; return; }
      if (AH.cloud.enabled && !el.querySelector('form').dataset.sent) {
        const form = el.querySelector('form'), btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Enviando…';
        AH.cloud.resetPassword(m)
          .then(() => { form.dataset.sent = '1'; form.requestSubmit(); })
          .catch(err => { el.querySelector('#rcErr').textContent = AH.cloud.msg(err); btn.disabled = false; btn.innerHTML = `${ic('mail')} Enviar link`; U.refreshIcons(); });
        return;
      }
      el.querySelector('form').outerHTML = `<div class="empty" style="padding:10px 0"><div class="empty-ic" style="background:var(--success-soft);color:var(--success)">${ic('mail-check')}</div><h3>Verifique seu e-mail</h3><p>Se existir uma conta para <b>${esc(m)}</b>, você receberá o link em instantes.</p>${AH.cloud.enabled ? '' : '<p class="faint" style="margin-top:8px">(Simulação: nenhum e-mail é enviado no protótipo.)</p>'}</div>`;
      U.refreshIcons();
    };
  };

  // Definir nova senha (configurações ou link de recuperação do e-mail)
  V.newPasswordModal = (fromEmail) => U.modal({
    title: fromEmail ? 'Crie uma nova senha' : 'Alterar senha', icon: 'key-round',
    body: `<div class="stack">${pwdField('np1', 'Nova senha', 'new-password')}${pwdField('np2', 'Confirmar nova senha', 'new-password')}<span class="err" id="npErr" role="alert"></span></div>`,
    onMount: m => bindPeek(m),
    actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, {
      label: 'Salvar senha', cls: 'btn-primary', icon: 'check', onClick: m => {
        const a = m.querySelector('#np1').value, b = m.querySelector('#np2').value, err = m.querySelector('#npErr');
        if (a.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; return false; }
        if (a !== b) { err.textContent = 'As senhas não coincidem.'; return false; }
        AH.cloud.updatePassword(a).then(() => { U.close(); U.toast('Senha alterada!', 'success', 'check'); }).catch(e2 => { err.textContent = AH.cloud.msg(e2); });
        return false;
      }
    }]
  });

  V.notFound = el => {
    el.innerHTML = U.empty('map-pin-off', 'Página não encontrada', 'O endereço que você abriu não existe.', '<a class="btn btn-primary" href="#/home">Voltar ao início</a>');
  };
})();
