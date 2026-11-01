/* =========================================================
   Online — amigos, presença, rankings e salas de duelo
   usando Supabase (tabela friendships + Realtime).
   Só existe quando o modo nuvem está ativo; senão, o app
   continua usando os jogadores de exemplo.
   ========================================================= */
(function () {
  if (!AH.cloud?.enabled) { AH.online = { enabled: false }; return; }
  const sb = AH.cloud.client;
  const S = () => AH.store;
  const cache = new Map();      // 'u_<uuid>' -> objeto de jogador
  const onlineNow = new Map();  // uuid -> metadados de presença
  let me = null, presence = null, inbox = null, board = [], results = [], started = false;
  const uuid = id => String(id).replace(/^u_/, '');
  const pid = u => 'u_' + u;
  const COLS = 'id,username,avatar,level,prestige,total_xp,wins,mmr,created_at,updated_at,data';

  function applyPresence(p) {
    const o = onlineNow.get(uuid(p.id));
    p.online = !!o;
    p.playing = o && o.sharePlaying !== false ? o.playing || null : null;
    if (o) p.lastSeen = Date.now();
  }
  function toPlayer(row) {
    const id = pid(row.id), p = cache.get(id) || {};
    const d = row.data || {};
    Object.assign(p, {
      id, real: true, username: row.username, avatar: row.avatar || d.avatar || {}, level: row.level || 1, prestige: row.prestige || 0,
      totalXp: row.total_xp || 0, wins: row.wins || 0, losses: d.losses || 0, mmr: row.mmr || 1000,
      joined: row.created_at, bio: d.bio || '', lastSeen: Date.parse(row.updated_at) || Date.now(),
      stats: d.stats || {}, favorites: d.favorites || [], achCount: Object.keys(d.achievements || {}).length,
      title: d.title, cardTheme: d.cardTheme, cardImage: d.cardImage, sharePlaying: d.privacy?.sharePlaying !== false
    });
    applyPresence(p);
    cache.set(id, p);
    return p;
  }
  const changed = () => S().save();
  const meta = () => {
    const u = S().user;
    return { uid: me, username: u.username, avatar: u.avatar, level: u.level, prestige: u.prestige, playing: playing, sharePlaying: u.privacy?.sharePlaying !== false, at: Date.now() };
  };
  let playing = null;

  /* ---------- presença e caixa de entrada ---------- */
  function start() {
    const u = S().user;
    if (!u || started) return;
    me = uuid(u.id); started = true;
    presence = sb.channel('presence:arcade', { config: { presence: { key: me } } });
    presence.on('presence', { event: 'sync' }, () => {
      onlineNow.clear();
      const st = presence.presenceState();
      Object.keys(st).forEach(k => { if (k !== me && u.privacy?.showOnline !== false) onlineNow.set(k, st[k][0]); });
      cache.forEach(applyPresence);
      changed();
    });
    presence.subscribe(s => { if (s === 'SUBSCRIBED' && S().user?.privacy?.showOnline !== false) presence.track(meta()); });

    inbox = sb.channel('inbox:' + me);
    inbox.on('broadcast', { event: '*' }, ({ event, payload }) => onInbox(event, payload));
    inbox.subscribe();
    refreshFriends();
    loadBoard();
  }
  function stop() {
    started = false;
    [presence, inbox].forEach(ch => ch && sb.removeChannel(ch));
    presence = inbox = null; onlineNow.clear(); cache.clear();
  }
  function setPlaying(gameId) {
    playing = gameId || null;
    if (presence && S().user?.privacy?.showOnline !== false) presence.track(meta());
  }
  // Envia uma mensagem para a caixa de entrada de outro jogador. Devolve true se foi entregue ao servidor.
  // Um envio por vez para cada destinatário: dois canais com o mesmo nome no mesmo socket se derrubam.
  const sending = new Map();
  function sendTo(id, event, payload) {
    const run = async () => {
      const ch = sb.channel('inbox:' + uuid(id));
      const ok = await new Promise(res => {
        const t = setTimeout(() => res(false), 6000);
        ch.subscribe(s => {
          if (s === 'SUBSCRIBED') { clearTimeout(t); res(true); }
          else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); res(false); }
        });
      });
      let sent = false;
      if (ok) { try { sent = (await ch.send({ type: 'broadcast', event, payload: { ...payload, from: me, fromName: S().user.username } })) === 'ok'; } catch (e) { console.warn(e); } }
      setTimeout(() => sb.removeChannel(ch), 1500);
      return sent;
    };
    const next = (sending.get(id) || Promise.resolve()).then(run, run);
    sending.set(id, next.catch(() => {}));
    return next;
  }
  function onInbox(event, p) {
    const U = AH.ui;
    if (event === 'friend') { refreshFriends(); S().notify('user-plus', `${p.fromName} enviou uma solicitação de amizade.`, '#/friends?tab=requests'); U.toast(`<b>${U.esc(p.fromName)}</b> quer ser seu amigo`, 'info', 'user-plus'); }
    if (event === 'friend-accept') { refreshFriends(); S().notify('user-check', `${p.fromName} aceitou sua solicitação.`, '#/friends'); U.toast(`<b>${U.esc(p.fromName)}</b> aceitou seu pedido de amizade`, 'success', 'user-check'); }
    if (event === 'invite') AH.views.duelInvite?.(p);
    if (event === 'invite-decline') { U.toast(`${U.esc(p.fromName)} recusou o duelo`, 'info', 'x'); }
  }

  /* ---------- amigos ---------- */
  async function refreshFriends() {
    if (!me) return;
    const { data: rows, error } = await sb.from('friendships').select('*').or(`user_id.eq.${me},friend_id.eq.${me}`);
    if (error) { console.warn(error); return; }
    const st = S().state;
    const friends = [], requests = [], sent = [], blocked = [];
    rows.forEach(r => {
      const other = r.user_id === me ? r.friend_id : r.user_id;
      if (r.status === 'accepted') friends.push(pid(other));
      else if (r.status === 'pending') (r.user_id === me ? sent : requests).push(pid(other));
      else if (r.status === 'blocked' && r.user_id === me) blocked.push(pid(other));
    });
    const ids = [...new Set([...friends, ...requests, ...sent, ...blocked].map(uuid))];
    if (ids.length) {
      const { data: profs } = await sb.from('profiles').select(COLS).in('id', ids);
      (profs || []).forEach(toPlayer);
    }
    Object.assign(st, { friends, requests, sent, blocked });
    changed();
  }
  const rowOf = async (a, b) => (await sb.from('friendships').select('*').eq('user_id', a).eq('friend_id', b).maybeSingle()).data;
  async function request(id) {
    const other = uuid(id);
    const theirs = await rowOf(other, me);
    if (theirs?.status === 'pending') return accept(id); // ele já tinha pedido: vira amizade
    const { error } = await sb.from('friendships').insert({ user_id: me, friend_id: other, status: 'pending' });
    if (error) return AH.ui.toast('Não foi possível enviar o pedido.', 'error');
    sendTo(id, 'friend', {}); refreshFriends();
  }
  async function accept(id) {
    const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('user_id', uuid(id)).eq('friend_id', me);
    if (error) return AH.ui.toast('Não foi possível aceitar.', 'error');
    sendTo(id, 'friend-accept', {}); refreshFriends();
  }
  async function unlink(id) {
    const o = uuid(id);
    await sb.from('friendships').delete().eq('user_id', me).eq('friend_id', o);
    await sb.from('friendships').delete().eq('user_id', o).eq('friend_id', me).neq('status', 'blocked');
    refreshFriends();
  }
  async function block(id) {
    await unlink(id);
    await sb.from('friendships').insert({ user_id: me, friend_id: uuid(id), status: 'blocked' });
    refreshFriends();
  }
  async function unblock(id) { await sb.from('friendships').delete().eq('user_id', me).eq('friend_id', uuid(id)).eq('status', 'blocked'); refreshFriends(); }

  /* ---------- busca e rankings ---------- */
  async function search(term) {
    const t = term.trim().replace(/[%_,()]/g, '');
    if (!t) { results = board.filter(p => uuid(p.id) !== me).slice(0, 8); return results; }
    const { data } = await sb.from('profiles').select(COLS).ilike('username', `%${t}%`).neq('id', me).limit(20);
    results = (data || []).map(toPlayer);
    return results;
  }
  async function loadBoard() {
    const { data, error } = await sb.from('profiles').select(COLS).order('total_xp', { ascending: false }).limit(100);
    if (error) { console.warn(error); return board; }
    board = (data || []).filter(r => r.id !== me).map(toPlayer);
    changed();
    return board;
  }
  async function loadProfile(id) {
    const { data } = await sb.from('profiles').select(COLS).eq('id', uuid(id)).maybeSingle();
    return data ? toPlayer(data) : null;
  }

  /* ---------- salas de duelo (Realtime) ---------- */
  // Cada sala é um canal "room:CÓDIGO" com presença (quem está e se está pronto)
  // e mensagens (configuração, início, jogadas, resultado).
  //   room.status: 'connecting' | 'online' | 'error' (sem conexão) | 'nohost' (ninguém criou essa sala)
  //   room.full:   a sala já tem dois jogadores e eu sobrei
  // Mensagens que chegam antes de alguém escutar (ex.: a primeira jogada, enquanto o outro ainda carrega
  // a partida) ficam guardadas e são entregues a quem se inscrever depois.
  function joinRoom(code, host, onUpdate) {
    const room = { code, host, ch: null, peer: null, peerReady: false, ready: false, status: 'connecting', full: false, handlers: {}, backlog: {}, queue: [], joinedAt: Date.now(), timers: {} };
    const notify = () => onUpdate && onUpdate(room);
    const track = () => { if (room.ch?.state === 'joined') room.ch.track({ ...meta(), ready: room.ready, host, joined: room.joinedAt }); };
    const fire = (event, payload) => (room.handlers[event] || []).slice().forEach(f => f(payload));
    const dispatch = (event, payload) => {
      if (event === 'start') room.backlog = {}; // nova partida: mensagens antigas não valem mais
      if ((room.handlers[event] || []).length) return fire(event, payload);
      const q = room.backlog[event] = room.backlog[event] || [];
      q.push({ payload, t: Date.now() });
      if (q.length > 50) q.shift();
    };
    function connect() {
      if (room.left) return;
      if (room.ch) sb.removeChannel(room.ch);
      const ch = room.ch = sb.channel('room:' + code, { config: { presence: { key: me }, broadcast: { self: false } } });
      room.status = 'connecting';
      clearTimeout(room.timers.conn);
      room.timers.conn = setTimeout(() => { if (room.status === 'connecting') { room.status = 'error'; notify(); } }, 10000);
      ch.on('presence', { event: 'sync' }, () => {
        if (room.ch !== ch) return;
        const st = ch.presenceState();
        // os dois que entraram primeiro jogam; quem chegar depois encontra a sala cheia
        const all = Object.keys(st).map(k => ({ k, m: st[k][0] || {} })).sort((a, b) => (a.m.joined || 0) - (b.m.joined || 0) || (a.k < b.k ? -1 : 1));
        const players = all.slice(0, 2).map(x => x.k);
        room.full = all.some(x => x.k === me) && !players.includes(me);
        const other = players.find(k => k !== me);
        const had = !!room.peer;
        room.peer = other ? st[other][0] : null;
        room.peerReady = !!room.peer?.ready;
        if (room.peer) {
          clearTimeout(room.timers.gone); room.timers.gone = null;
          if (room.status === 'nohost' && (host || room.peer.host)) room.status = 'online';
        } else if (had && !room.timers.gone) {
          // pequenas quedas de rede (celular bloqueando a tela) não contam como saída: espera um pouco
          room.timers.gone = setTimeout(() => { room.timers.gone = null; if (!room.peer && !room.left) fire('peer-left'); }, 6000);
        }
        notify();
      });
      ch.on('broadcast', { event: '*' }, ({ event, payload }) => dispatch(event, payload));
      ch.subscribe(s => {
        if (room.ch !== ch || room.left) return;
        if (s === 'SUBSCRIBED') {
          clearTimeout(room.timers.conn);
          room.status = room.status === 'nohost' ? 'nohost' : 'online';
          track();
          room.queue.splice(0).forEach(m => ch.send(m));
          // quem entra por código precisa achar o anfitrião; senão a sala não existe (ou ele já saiu)
          clearTimeout(room.timers.host);
          if (!host) room.timers.host = setTimeout(() => { if (!room.left && !room.peer?.host) { room.status = 'nohost'; notify(); } }, 9000);
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { room.status = 'error'; }
        notify();
      });
    }
    // ao voltar para o app (iOS/Android suspendem a conexão em segundo plano), reconecta se preciso
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || room.left || !room.ch) return;
      if (['joined', 'joining'].includes(room.ch.state)) track(); else room.retry();
    };
    document.addEventListener('visibilitychange', onVisible);
    room.retry = () => { room.status = 'connecting'; connect(); notify(); };
    room.setReady = r => { room.ready = r; track(); };
    room.send = (event, payload = {}) => {
      if (event === 'start') room.backlog = {};
      const msg = { type: 'broadcast', event, payload };
      if (room.ch?.state === 'joined') return room.ch.send(msg);
      room.queue.push(msg);
    };
    room.on = (event, fn) => {
      (room.handlers[event] = room.handlers[event] || []).push(fn);
      const q = room.backlog[event];
      if (q?.length) { delete room.backlog[event]; q.filter(x => Date.now() - x.t < 30000).forEach(x => setTimeout(() => fn(x.payload), 0)); }
      return () => { room.handlers[event] = (room.handlers[event] || []).filter(f => f !== fn); };
    };
    room.leave = () => {
      room.left = true;
      Object.values(room.timers).forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      if (room.ch) sb.removeChannel(room.ch);
      room.ch = null;
    };
    room.peerPlayer = () => room.peer && { id: pid(room.peer.uid), username: room.peer.username, avatar: room.peer.avatar || {}, level: room.peer.level, prestige: room.peer.prestige, online: true, real: true };
    connect();
    return room;
  }
  // Busca de partida: todos que procuram ficam no canal "mm:<modo>"; os dois
  // mais antigos formam par e o de menor id cria a sala.
  function matchmake(mode, onMatch, onError) {
    const ch = sb.channel('mm:' + mode, { config: { presence: { key: me }, broadcast: { self: true } } });
    const since = Date.now();
    let done = false;
    ch.on('presence', { event: 'sync' }, () => {
      if (done) return;
      const st = ch.presenceState();
      const waiting = Object.keys(st).map(k => st[k][0]).filter(Boolean).sort((a, b) => a.since - b.since || (a.uid < b.uid ? -1 : 1));
      if (waiting.length < 2) return;
      const [a, b] = waiting;
      if (a.uid !== me && b.uid !== me) return;
      const leader = a.uid < b.uid ? a : b, other = leader === a ? b : a;
      if (leader.uid === me) {
        const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[(Math.random() * 31) | 0]).join('');
        ch.send({ type: 'broadcast', event: 'match', payload: { a: me, b: other.uid, code } });
      }
    });
    ch.on('broadcast', { event: 'match' }, ({ payload }) => {
      if (done || (payload.a !== me && payload.b !== me)) return;
      done = true;
      const host = payload.a === me;
      const peerUid = host ? payload.b : payload.a;
      const st = ch.presenceState(), peerMeta = st[peerUid]?.[0];
      setTimeout(() => sb.removeChannel(ch), 300);
      onMatch({ code: payload.code, host, peer: peerMeta ? { id: pid(peerUid), username: peerMeta.username, avatar: peerMeta.avatar || {}, level: peerMeta.level, prestige: peerMeta.prestige, real: true } : null });
    });
    ch.subscribe(s => {
      if (s === 'SUBSCRIBED') ch.track({ ...meta(), since });
      else if ((s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') && !done) onError?.();
    });
    return () => { done = true; sb.removeChannel(ch); };
  }
  const invite = (id, payload) => sendTo(id, 'invite', payload); // Promise<boolean>
  const declineInvite = id => sendTo(id, 'invite-decline', {});

  AH.online = {
    enabled: true, start, stop, setPlaying, refreshFriends, request, accept, unlink, block, unblock,
    search, loadBoard, loadProfile, joinRoom, matchmake, invite, declineInvite,
    get: id => cache.get(id), board: () => board, results: () => results,
    isOnline: id => onlineNow.has(uuid(id)), me: () => me
  };
})();
