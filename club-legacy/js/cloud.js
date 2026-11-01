/* =========================================================
   Nuvem do Arcade Social (fase 5): a carreira é salva na tabela
   `club_legacy_saves` do Supabase (supabase/schema.sql), com a
   mesma sessão do Arcade Hub (mesmo site). O save vai compactado
   (gzip + base64); as colunas públicas alimentam o ranking global.
   Sem login ou sem a tabela, o jogo segue só local.
   ========================================================= */
let sb = null, uid = null, timer = null, pushing = null;

export async function gzip(text) {
  if (!window.CompressionStream) return 'raw:' + text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return 'gz:' + btoa(bin);
}
export async function gunzip(str) {
  if (str.startsWith('raw:')) return str.slice(4);
  const bin = atob(str.slice(3)); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

export const Cloud = {
  enabled: false, status: 'local', // local | ok | missing | error
  db: () => sb, uid: () => uid,
  lastPush: null,
  async init() {
    const B = window.AH?.config?.backend;
    if (!B || B.provider !== 'supabase' || !window.supabase) return false;
    try {
      sb = window.supabase.createClient(B.supabaseUrl, B.supabaseAnonKey, { realtime: { params: { eventsPerSecond: 20 } } });
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id || null;
    } catch (e) { uid = null; }
    this.enabled = !!uid;
    return this.enabled;
  },
  fail(error) {
    this.status = /relation|does not exist|schema cache|Could not find/i.test(error?.message || '') ? 'missing' : 'error';
    console.warn('Nuvem do Club Legacy indisponível:', error?.message);
    return null;
  },
  // devolve { savedAt, state } da nuvem (ou null)
  async pull() {
    if (!this.enabled) return null;
    const { data, error } = await sb.from('club_legacy_saves').select('data, updated_at').eq('id', uid).maybeSingle();
    if (error) return this.fail(error);
    this.status = 'ok';
    if (!data) return null;
    try { return { savedAt: Date.parse(data.updated_at), state: JSON.parse(await gunzip(data.data)) }; } catch (e) { return this.fail(e); }
  },
  async push(S, summary) {
    if (!this.enabled || this.status === 'missing' || !S) return false;
    const row = {
      id: uid, username: summary.username || null, coach: summary.company, club: summary.club || null, league: summary.league || null,
      seasons: S.season, matches: S.coach.matches, wins: S.coach.w, titles: S.coach.titles.length,
      achievements: Object.keys(S.ach || {}).length, score: summary.score || 0, trophies: summary.trophies || [],
      data: await gzip(JSON.stringify(S)), updated_at: new Date(S.savedAt || Date.now()).toISOString()
    };
    const { error } = await sb.from('club_legacy_saves').upsert(row);
    if (error) { this.fail(error); return false; }
    this.status = 'ok'; this.lastPush = Date.now();
    return true;
  },
  // salva em lote: no máximo uma vez a cada 20 s (ou na saída da página)
  schedule(S, summary) {
    if (!this.enabled || this.status === 'missing') return;
    clearTimeout(timer);
    timer = setTimeout(() => { pushing = this.push(S, summary).finally(() => { pushing = null; }); }, 20000);
    this.pending = () => this.push(S, summary);
  },
  async flush() { clearTimeout(timer); if (this.pending) { const p = this.pending; this.pending = null; await p(); } },
  async ranking(limit = 30) {
    if (!this.enabled || this.status === 'missing') return null;
    const { data, error } = await sb.from('club_legacy_saves').select('id, username, coach, club, league, seasons, matches, wins, titles, achievements, score, trophies')
      .order('score', { ascending: false }).limit(limit);
    if (error) return this.fail(error);
    return data.map(r => ({ ...r, me: r.id === uid }));
  }
};
