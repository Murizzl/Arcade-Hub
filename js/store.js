/* =========================================================
   Store — estado local + "serviços" de domínio.
   Cada método público corresponde a uma futura chamada de API
   (Supabase/PostgreSQL). Hoje tudo é simulado em localStorage.
   ========================================================= */
(function () {
  const C = AH.config;
  const listeners = new Set();
  const now = () => Date.now();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const weekKey = () => {
    const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  };
  const uid = () => 'u_' + Math.floor(10000 + Math.random() * 89999);

  function defaultUser(username) {
    return {
      id: uid(), username: username || 'Jogador', avatar: { icon: 'gamepad-2', color: '#6c4cf5', frame: 'basic' },
      cardTheme: 'violet', bio: '', joined: new Date().toISOString(),
      level: 1, xp: 0, totalXp: 0, prestige: 0, prestigeHistory: [],
      coins: 150, matches: 0, wins: 0, losses: 0, draws: 0, duelWins: 0, duelLosses: 0, mmr: 1000,
      favorites: [], stats: {}, recent: [], history: [], achievements: {}, challengesDone: 0,
      privacy: { sharePlaying: true, showOnline: true },
      inventory: { frames: [], themes: [], icons: [], titles: [] }, title: 'novato'
    };
  }

  function demoUser() {
    const u = defaultUser('Você');
    u.username = 'PlayerUm';
    u.id = 'u_7781';
    u.joined = '2025-08-14T12:00:00.000Z';
    u.level = 23; u.xp = 410; u.totalXp = 18950; u.coins = 640;
    u.matches = 142; u.wins = 81; u.losses = 49; u.draws = 12; u.duelWins = 6; u.duelLosses = 4; u.mmr = 1340;
    u.favorites = ['2048', 'velha'];
    u.stats = {
      '2048': { played: 34, wins: 3, best: 8420, maxTile: 1024, last: now() - 3600e3 },
      velha: { played: 51, wins: 33, best: null, last: now() - 7200e3 },
      memoria: { played: 22, wins: 22, best: 16, last: now() - 86400e3 },
      ppt: { played: 35, wins: 23, best: null, last: now() - 2 * 86400e3 }
    };
    u.recent = ['2048', 'velha', 'memoria', 'ppt'];
    u.achievements = {
      first_win: '2025-08-14T13:02:00.000Z', three_games: '2025-08-16T19:20:00.000Z',
      lvl_10: '2025-09-01T21:40:00.000Z', favs_3: null, tile_512: '2025-09-12T22:10:00.000Z', duel_1: '2025-10-02T20:00:00.000Z'
    };
    delete u.achievements.favs_3;
    u.history = [
      { t: now() - 3600e3, icon: 'hash', text: 'Fez 8.420 pontos no 2048 (novo recorde!)' },
      { t: now() - 7200e3, icon: 'trophy', text: 'Venceu LunaPixel no Jogo da Velha' },
      { t: now() - 86400e3, icon: 'trending-up', text: 'Alcançou o nível 23' },
      { t: now() - 2 * 86400e3, icon: 'user-plus', text: 'Ficou amigo de MaxMemória' },
      { t: now() - 6 * 86400e3, icon: 'award', text: 'Desbloqueou “Primeiro Sangue”' }
    ];
    u.challengesDone = 4;
    return u;
  }

  function freshState(withDemo) {
    return {
      v: 1,
      session: withDemo ? { userId: 'u_7781', since: now() } : null,
      settings: { theme: 'system', sound: true, reducedMotion: false, notifications: true },
      user: withDemo ? demoUser() : null,
      friends: [...AH.seedFriends],
      requests: [...AH.seedRequests],
      sent: [],
      blocked: [],
      notifications: [
        { id: 'n1', t: now() - 20 * 60e3, icon: 'user-plus', text: 'Joaninha enviou uma solicitação de amizade.', read: false, link: '#/friends' },
        { id: 'n2', t: now() - 50 * 60e3, icon: 'swords', text: 'LunaPixel te desafiou para Jogo da Velha.', read: false, link: '#/duels' },
        { id: 'n3', t: now() - 5 * 3600e3, icon: 'calendar-check', text: 'Novos desafios diários disponíveis!', read: false, link: '#/achievements' },
        { id: 'n4', t: now() - 2 * 86400e3, icon: 'award', text: 'Você desbloqueou “Primeiro Sangue”.', read: true, link: '#/achievements' }
      ],
      duels: [
        { id: 'd1', t: now() - 7200e3, game: 'velha', opp: 'u_1042', result: 'win', mode: 'Amigo' },
        { id: 'd2', t: now() - 26 * 3600e3, game: 'ppt', opp: 'u_4120', result: 'loss', mode: 'Casual' },
        { id: 'd3', t: now() - 3 * 86400e3, game: 'velha', opp: 'u_8123', result: 'draw', mode: 'Ranqueada' }
      ],
      challenges: { day: todayKey(), week: weekKey(), progress: { 'd_play3': 1 }, claimed: {}, seen: {} }
    };
  }

  let state;
  function load() {
    try {
      const raw = localStorage.getItem(C.storageKey);
      state = raw ? JSON.parse(raw) : freshState(true);
    } catch (e) { state = freshState(true); }
    migrate();
    rolloverChallenges();
  }
  function save() {
    try { localStorage.setItem(C.storageKey, JSON.stringify(state)); } catch (e) { /* armazenamento indisponível */ }
    listeners.forEach(fn => fn(state));
  }

  // Garante campos novos em dados salvos por versões anteriores
  // e mantém como "possuídos" os itens que já estavam equipados.
  function migrate() {
    const u = state.user; if (!u) return;
    u.inventory = Object.assign({ frames: [], themes: [], icons: [], titles: [] }, u.inventory);
    if (!u.title) u.title = 'novato';
    if (!owns('icons', u.avatar.icon)) u.inventory.icons.push(u.avatar.icon);
    if (!owns('themes', u.cardTheme)) u.inventory.themes.push(u.cardTheme);
    if (!owns('frames', u.avatar.frame)) u.inventory.frames.push(u.avatar.frame);
  }

  // ---------- Loja de cosméticos ----------
  // PRODUÇÃO: compra via RPC `buy_item` que debita moedas no servidor (transação).
  function catalog(kind) {
    if (kind === 'icons') return C.avatarIcons.map((id, i) => ({ id, name: id, price: i < C.freeIcons ? 0 : C.iconPrice }));
    return { frames: C.frames, themes: C.cardThemes, titles: C.titles }[kind];
  }
  function owns(kind, id) {
    const item = catalog(kind).find(x => x.id === id);
    if (!item) return false;
    if (item.prestige) return (state.user.prestige || 0) >= item.prestige;
    return !item.price || state.user.inventory[kind].includes(id);
  }
  function buy(kind, id) {
    const u = state.user, item = catalog(kind).find(x => x.id === id);
    if (!item || item.prestige || owns(kind, id)) return { ok: false, error: 'Item indisponível.' };
    if (u.coins < item.price) return { ok: false, error: `Faltam ${item.price - u.coins} moedas.` };
    u.coins -= item.price;
    u.inventory[kind].push(id);
    pushHistory('shopping-bag', `Comprou “${item.name}” na loja`);
    save();
    return { ok: true, item };
  }
  function equip(kind, id) {
    const u = state.user; if (!owns(kind, id)) return false;
    if (kind === 'frames') u.avatar.frame = id;
    if (kind === 'themes') u.cardTheme = id;
    if (kind === 'icons') u.avatar.icon = id;
    if (kind === 'titles') u.title = id;
    save(); return true;
  }
  // Foto já redimensionada (data URL). PRODUÇÃO: upload no Supabase Storage e salvar só a URL.
  function setPhoto(dataUrl) { state.user.avatar.photo = dataUrl || null; save(); }

  function rolloverChallenges() {
    const ch = state.challenges;
    if (ch.day !== todayKey()) {
      AH.challengeTemplates.daily.forEach(t => { delete ch.progress[t.id]; delete ch.claimed[t.id]; });
      ch.day = todayKey();
    }
    if (ch.week !== weekKey()) {
      AH.challengeTemplates.weekly.forEach(t => { delete ch.progress[t.id]; delete ch.claimed[t.id]; });
      ch.seen = {}; ch.week = weekKey();
    }
  }

  // ---------- XP / níveis ----------
  function levelInfo(u) {
    const need = C.xpForLevel(u.level);
    return { level: u.level, xp: u.xp, need, pct: u.level >= C.maxLevel ? 100 : Math.min(100, (u.xp / need) * 100), toNext: Math.max(0, need - u.xp), maxed: u.level >= C.maxLevel };
  }

  function addXp(amount, reason) {
    const u = state.user; if (!u || amount <= 0) return [];
    const events = [];
    u.totalXp += amount;
    if (u.level >= C.maxLevel) { u.xp = Math.min(u.xp + amount, C.xpForLevel(u.level)); return events; }
    u.xp += amount;
    while (u.level < C.maxLevel && u.xp >= C.xpForLevel(u.level)) {
      u.xp -= C.xpForLevel(u.level);
      u.level++;
      events.push({ type: 'levelup', level: u.level });
      pushHistory('trending-up', `Alcançou o nível ${u.level}`);
      if (u.level >= C.maxLevel) {
        u.xp = 0;
        notify('sparkles', 'Nível 100! Você já pode ativar um novo prestígio.', '#/prestige');
      }
    }
    return events;
  }

  function pushHistory(icon, text) {
    state.user.history.unshift({ t: now(), icon, text });
    state.user.history = state.user.history.slice(0, 40);
  }

  function notify(icon, text, link) {
    state.notifications.unshift({ id: 'n' + now() + Math.random().toString(36).slice(2, 5), t: now(), icon, text, read: false, link: link || '' });
    state.notifications = state.notifications.slice(0, 30);
  }

  function bumpChallenge(metric, gameId) {
    const ch = state.challenges;
    const all = [...AH.challengeTemplates.daily, ...AH.challengeTemplates.weekly];
    all.forEach(t => {
      if (ch.claimed[t.id]) return;
      if (t.metric === metric || t.metric === metric + ':' + gameId) ch.progress[t.id] = (ch.progress[t.id] || 0) + 1;
      if (t.metric === 'variety' && metric === 'play' && !ch.seen[gameId]) { ch.seen[gameId] = 1; ch.progress[t.id] = (ch.progress[t.id] || 0) + 1; }
    });
  }

  function checkAchievements() {
    const unlocked = [];
    AH.achievements.forEach(a => {
      if (state.user.achievements[a.id]) return;
      const [cur, goal] = a.check(state);
      if (cur >= goal) {
        state.user.achievements[a.id] = new Date().toISOString();
        unlocked.push(a);
        pushHistory('award', `Desbloqueou “${a.name}”`);
        notify('award', `Conquista desbloqueada: ${a.name}`, '#/achievements');
      }
    });
    unlocked.forEach(a => addXp(a.xp));
    return unlocked;
  }

  /**
   * Registra o fim de uma partida e calcula recompensas.
   * PRODUÇÃO: substituir por RPC no servidor (ex.: `submit_match`) que
   * valida a partida (replay/assinatura) antes de conceder XP.
   * result: 'win' | 'loss' | 'draw' | 'complete'
   * score: número opcional para recorde
   */
  function reportMatch({ gameId, result, score, extra, duel }) {
    const u = state.user; if (!u) return null;
    const game = AH.games.find(g => g.id === gameId);
    const s = u.stats[gameId] || (u.stats[gameId] = { played: 0, wins: 0, best: null, last: 0 });
    const rewards = []; let xp = 0; let coins = 0;
    const R = C.xpRules;

    s.played++; s.last = now(); u.matches++;
    u.recent = [gameId, ...u.recent.filter(x => x !== gameId)].slice(0, 8);
    xp += R.complete.xp; coins += C.coinRules.complete; rewards.push([R.complete.label, R.complete.xp]);
    bumpChallenge('play', gameId);

    if (result === 'win') {
      s.wins++; u.wins++;
      xp += R.win.xp; coins += C.coinRules.win; rewards.push([R.win.label, R.win.xp]);
      bumpChallenge('win', gameId);
    } else if (result === 'loss') u.losses++;
    else if (result === 'draw') u.draws++;

    if (duel) {
      if (result === 'win') {
        u.duelWins++; xp += R.duelWin.xp; coins += C.coinRules.duelWin; rewards.push([R.duelWin.label, R.duelWin.xp]);
        bumpChallenge('duelWin', gameId);
        if (duel.ranked) u.mmr += 24;
      } else if (result === 'loss') { u.duelLosses++; if (duel.ranked) u.mmr = Math.max(0, u.mmr - 18); }
      state.duels.unshift({ id: 'd' + now(), t: now(), game: gameId, opp: duel.opp, result, mode: duel.mode });
      state.duels = state.duels.slice(0, 20);
    }

    const perf = C.scoreXp[gameId];
    if (perf && typeof score === 'number' && result !== 'loss') {
      const bonus = perf.calc(score, extra);
      if (bonus > 0) { xp += bonus; coins += Math.ceil(bonus / 10); rewards.push([perf.label, bonus]); }
    }

    let record = false;
    if (typeof score === 'number' && game) {
      const better = s.best == null || (game.scoreDir === 'low' ? score < s.best : score > s.best);
      if (game.scoreDir === 'high' && result !== 'win' && score === 0) { /* não conta */ }
      else if (better) {
        const hadPrev = s.best != null;
        s.best = score; record = hadPrev;
        if (hadPrev) { xp += R.record.xp; coins += C.coinRules.record; rewards.push([R.record.label, R.record.xp]); }
      }
    }
    if (extra) Object.keys(extra).forEach(k => { if ((extra[k] || 0) > (s[k] || 0)) s[k] = extra[k]; });

    const resText = { win: 'Venceu', loss: 'Perdeu', draw: 'Empatou', complete: 'Completou' }[result];
    pushHistory(game?.icon || 'gamepad-2', `${resText} uma partida de ${game?.name || gameId}${record ? ' (novo recorde!)' : ''}`);

    u.coins += coins;
    const events = addXp(xp);
    const ach = checkAchievements();
    save();
    return { xp, coins, rewards, record, levelUps: events, achievements: ach };
  }

  function claimChallenge(id) {
    const t = [...AH.challengeTemplates.daily, ...AH.challengeTemplates.weekly].find(x => x.id === id);
    const ch = state.challenges;
    if (!t || ch.claimed[id] || (ch.progress[id] || 0) < t.goal) return null;
    ch.claimed[id] = now();
    state.user.coins += t.coins;
    state.user.challengesDone++;
    pushHistory(t.icon, `Completou o desafio “${t.name}”`);
    const ev = addXp(t.xp);
    checkAchievements();
    save();
    return { xp: t.xp, coins: t.coins, levelUps: ev };
  }

  function canPrestige() { return state.user && state.user.level >= C.maxLevel; }
  function doPrestige() {
    const u = state.user; if (!canPrestige()) return false;
    u.prestigeHistory.push({ t: now(), from: u.prestige, totalXp: u.totalXp });
    u.prestige++; u.level = 1; u.xp = 0;
    const frame = C.frames.find(f => f.prestige === u.prestige);
    if (frame) u.avatar.frame = frame.id;
    pushHistory('sparkles', `Ativou o Prestígio ${u.prestige}`);
    notify('sparkles', `Prestígio ${u.prestige} ativado! Novas molduras desbloqueadas.`, '#/profile');
    checkAchievements();
    save();
    return true;
  }

  // ---------- Social ----------
  const player = id => id === state.user?.id ? state.user : (AH.online?.enabled && AH.online.get(id)) || AH.players.find(p => p.id === id);
  function friendship(id) {
    if (state.blocked.includes(id)) return 'blocked';
    if (state.friends.includes(id)) return 'friend';
    if (state.requests.includes(id)) return 'incoming';
    if (state.sent.includes(id)) return 'sent';
    return 'none';
  }
  function sendRequest(id) {
    if (AH.online?.enabled) { if (!state.sent.includes(id)) state.sent.push(id); save(); return AH.online.request(id); }
    if (friendship(id) !== 'none') return;
    state.sent.push(id); save();
    // Simulação: alguns jogadores aceitam após alguns segundos.
    const p = player(id);
    if (p && p.online) setTimeout(() => {
      if (!state.sent.includes(id)) return;
      state.sent = state.sent.filter(x => x !== id);
      state.friends.push(id);
      notify('user-check', `${p.username} aceitou sua solicitação de amizade.`, '#/user/' + id);
      checkAchievements();
      save();
      AH.ui && AH.ui.toast(`${p.username} aceitou seu pedido de amizade (simulação)`, 'success', 'user-check');
    }, 4000);
  }
  function cancelRequest(id) { if (AH.online?.enabled) AH.online.unlink(id); state.sent = state.sent.filter(x => x !== id); save(); }
  function acceptRequest(id) {
    if (AH.online?.enabled) AH.online.accept(id);
    state.requests = state.requests.filter(x => x !== id);
    if (!state.friends.includes(id)) state.friends.push(id);
    pushHistory('user-plus', `Ficou amigo de ${player(id)?.username}`);
    checkAchievements(); save();
  }
  function declineRequest(id) { if (AH.online?.enabled) AH.online.unlink(id); state.requests = state.requests.filter(x => x !== id); save(); }
  function removeFriend(id) { if (AH.online?.enabled) AH.online.unlink(id); state.friends = state.friends.filter(x => x !== id); save(); }
  function block(id) {
    if (AH.online?.enabled) AH.online.block(id);
    state.friends = state.friends.filter(x => x !== id);
    state.requests = state.requests.filter(x => x !== id);
    state.sent = state.sent.filter(x => x !== id);
    if (!state.blocked.includes(id)) state.blocked.push(id);
    save();
  }
  function unblock(id) { if (AH.online?.enabled) AH.online.unblock(id); state.blocked = state.blocked.filter(x => x !== id); save(); }

  function toggleFavorite(gameId) {
    const f = state.user.favorites;
    const i = f.indexOf(gameId);
    if (i >= 0) f.splice(i, 1); else f.push(gameId);
    checkAchievements(); save();
    return i < 0;
  }

  // ---------- Sessão (simulada, sem senhas) ----------
  // PRODUÇÃO: supabase.auth.signInWithPassword / signUp / resetPasswordForEmail
  function login(identifier) {
    if (!state.user) { state.user = demoUser(); migrate(); }
    if (identifier && !identifier.includes('@')) state.user.username = identifier.slice(0, 20);
    state.session = { userId: state.user.id, since: now() };
    save();
  }
  function register(username, avatar) {
    state.user = defaultUser(username);
    if (avatar) Object.assign(state.user.avatar, avatar);
    migrate();
    state.user.history.unshift({ t: now(), icon: 'party-popper', text: 'Entrou no Arcade Hub' });
    state.session = { userId: state.user.id, since: now() };
    state.challenges = freshState(false).challenges;
    state.duels = [];
    save();
  }
  function logout() { state.session = null; save(); }
  function usernameTaken(name) {
    const n = name.trim().toLowerCase();
    return AH.players.some(p => p.username.toLowerCase() === n);
  }
  function reset() { state = freshState(true); migrate(); save(); }
  // Usados pelo modo nuvem (js/cloud.js)
  function newUser(username) { return defaultUser(username); }
  function setUser(u) {
    state.user = u; migrate(); state.session = { userId: u.id, since: now() };
    // no modo online, amigos e pedidos vêm do banco (AH.online.refreshFriends)
    if (AH.cloud?.enabled) Object.assign(state, { friends: [], requests: [], sent: [], blocked: [], duels: state.duels.filter(d => String(d.opp).length > 10) });
    save();
  }
  function clearSession() { state.session = null; if (AH.cloud?.enabled) state.user = null; save(); }

  load();

  AH.store = {
    get state() { return state; },
    get user() { return state.user; },
    save, subscribe: fn => (listeners.add(fn), () => listeners.delete(fn)),
    levelInfo, addXp, reportMatch, claimChallenge, canPrestige, doPrestige,
    player, friendship, sendRequest, cancelRequest, acceptRequest, declineRequest, removeFriend, block, unblock,
    catalog, owns, buy, equip, setPhoto, newUser, setUser, clearSession,
    toggleFavorite, login, register, logout, usernameTaken, reset, notify, checkAchievements,
    prestigeOf: n => C.prestiges[Math.min(n, C.prestiges.length - 1)],
    divisionOf: mmr => [...C.divisions].reverse().find(d => mmr >= d.min),
    game: id => AH.games.find(g => g.id === id)
  };
})();
