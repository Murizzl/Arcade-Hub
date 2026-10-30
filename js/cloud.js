/* =========================================================
   Cloud — integração com o Supabase (Auth, perfis e Storage).
   Ativa quando config.backend.provider === 'supabase'.
   O progresso do jogador é salvo na tabela `profiles`
   (veja supabase/schema.sql). Sem isso, o app roda em modo local.
   ========================================================= */
(function () {
  const B = AH.config.backend;
  const enabled = B.provider === 'supabase' && B.supabaseUrl && B.supabaseAnonKey && window.supabase;
  if (!enabled) { AH.cloud = { enabled: false, msg: e => e?.message || String(e) }; return; }

  const sb = window.supabase.createClient(B.supabaseUrl, B.supabaseAnonKey);
  let uid = null, saveTimer = null, lastSaved = '', saving = null;
  const here = () => location.origin + location.pathname;

  // Mensagens de erro do Supabase em português
  function msg(e) {
    const m = e?.message || String(e);
    const map = [
      [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
      [/user already registered/i, 'Já existe uma conta com esse e-mail.'],
      [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit|too many/i, 'Muitas tentativas. Espere um pouco e tente de novo.'],
      [/unable to validate email|invalid email/i, 'Informe um e-mail válido.'],
      [/new password should be different/i, 'A nova senha precisa ser diferente da atual.'],
      [/failed to fetch|network/i, 'Sem conexão com o servidor. Verifique sua internet.'],
      [/database error saving new user/i, 'Não foi possível criar a conta. O username pode já estar em uso.']
    ];
    return (map.find(([re]) => re.test(m)) || [0, m])[1];
  }

  const row = u => ({
    id: uid, username: u.username, avatar: u.avatar, level: u.level, prestige: u.prestige,
    total_xp: u.totalXp, wins: u.wins, mmr: u.mmr, data: u, updated_at: new Date().toISOString()
  });

  async function loadProfile(user) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    let u = data?.data;
    const fresh = !u;
    if (fresh) {
      u = AH.store.newUser(data?.username || user.user_metadata?.username || 'Jogador');
      Object.assign(u.avatar, data?.avatar || user.user_metadata?.avatar || {});
    }
    u.id = 'u_' + user.id;
    u.email = user.email;
    if (data?.username) u.username = data.username;
    uid = user.id;
    AH.store.setUser(u);
    lastSaved = fresh ? '' : JSON.stringify(u);
    if (fresh) await saveNow();
  }

  async function saveNow() {
    const u = AH.store.user;
    if (!uid || !u) return;
    const json = JSON.stringify(u);
    if (json === lastSaved) return;
    if (saving) await saving;
    saving = sb.from('profiles').upsert(row(u)).then(({ error }) => {
      saving = null;
      if (!error) { lastSaved = json; return; }
      if (error.code === '23505') AH.ui.toast('Esse username já está em uso. Escolha outro no perfil.', 'error');
      else AH.ui.toast('Não foi possível salvar na nuvem agora. Tentaremos de novo.', 'error');
    });
    return saving;
  }
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 1200); };

  async function init() {
    const { data: { session } } = await sb.auth.getSession();
    if (session) await loadProfile(session.user);
    else AH.store.clearSession();
    sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setTimeout(() => AH.views.newPasswordModal(true), 300);
      if (event === 'SIGNED_OUT') { uid = null; AH.store.clearSession(); location.hash = '#/login'; }
    });
    AH.store.subscribe(() => { if (uid) queueSave(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && uid) saveNow(); });
  }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await loadProfile(data.user);
  }
  async function usernameAvailable(name) {
    const { data, error } = await sb.rpc('username_available', { name });
    if (error) throw error;
    return !!data;
  }
  async function signUp(email, password, username, avatar) {
    if (!(await usernameAvailable(username))) throw new Error('Este username já está em uso.');
    const { data, error } = await sb.auth.signUp({
      email, password, options: { data: { username, avatar }, emailRedirectTo: here() }
    });
    if (error) throw error;
    if (!data.session) return { needsConfirm: true };
    await loadProfile(data.user);
    return { needsConfirm: false };
  }
  async function signOut() { await saveNow(); await sb.auth.signOut(); }
  async function resetPassword(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() });
    if (error) throw error;
  }
  async function updatePassword(password) {
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw error;
  }
  // Envia a foto (já reduzida para 256px) e devolve a URL pública
  async function uploadAvatar(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${uid}/avatar.jpg`;
    const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
  }

  AH.cloud = { enabled: true, client: sb, init, signIn, signUp, signOut, resetPassword, updatePassword, uploadAvatar, usernameAvailable, saveNow, msg };
})();
