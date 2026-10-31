/* =========================================================
   Salvamento local versionado, por conta do Arcade Hub.
   O formato tem versão (`v`) e migrações em sequência, para
   permitir mudanças futuras e a sincronização com o backend.
   ========================================================= */
import { SAVE_VERSION } from './game-state.js';

const PREFIX = 'railatlas.save.';

// Cada função leva um save da versão N para N+1
const MIGRATIONS = {
  // v2: cargas passaram a ocupar vagas (slots) e viagens têm várias paradas.
  // Cargas e viagens antigas são descartadas; os trens voltam ociosos onde estavam.
  1: s => {
    s.contracts = {}; s.trips = {}; s.nextRefresh = {};
    s.trains.forEach(t => { if (t.tripId) { t.status = 'idle'; t.tripId = null; } });
    s.tutorial.done = true;
    s.v = 2;
    return s;
  },
  // v3: melhorias de estação e armazém. A sede ganha a oficina básica.
  2: s => {
    Object.values(s.stations).forEach(st => { st.upgrades ||= {}; });
    if (s.stations[s.company.home]) s.stations[s.company.home].upgrades.oficina ||= 1;
    s.v = 3;
    return s;
  },
  // v4: automação, relatórios, conquistas e maquinista em toda locomotiva
  3: s => {
    s.reports ||= { hourly: {}, lines: {} };
    s.achievements ||= {};
    Object.assign(s.stats, { special: 0, transfers: 0, onTime: 0, ...s.stats });
    s.trains.forEach(t => { t.mode ||= 'manual'; t.auto ||= null; });
    s.v = 4;
    return s;
  }
};

export const saveKey = userId => PREFIX + (userId || 'convidado');

// Leva qualquer save (local ou da nuvem) até a versão atual
export function migrateSave(s) {
  if (!s || typeof s !== 'object') return null;
  while (s.v < SAVE_VERSION && MIGRATIONS[s.v]) s = MIGRATIONS[s.v](s);
  if (s.v !== SAVE_VERSION) { console.warn('Save em versão desconhecida', s.v); return null; }
  return s;
}

export function loadSave(userId) {
  try {
    const raw = localStorage.getItem(saveKey(userId));
    return raw ? migrateSave(JSON.parse(raw)) : null;
  } catch (e) {
    console.error('Save corrompido', e);
    return null;
  }
}

export function writeSave(userId, state) {
  try {
    state.lastUpdate = Date.now();
    localStorage.setItem(saveKey(userId), JSON.stringify(state));
    return true;
  } catch (e) { return false; }
}

export function deleteSave(userId) {
  try { localStorage.removeItem(saveKey(userId)); } catch (e) { /* ignore */ }
}

/* ---------- Nuvem do Arcade Social (Supabase) ----------
   Usa a mesma sessão do Arcade Hub (mesmo site). Tabela `rail_atlas_saves`
   em supabase/schema.sql. Sem login ou sem a tabela, o jogo segue só local. */
let sb = null, uid = null;
export const CloudSync = {
  enabled: false, status: 'local', // 'local' | 'ok' | 'missing' | 'error'
  async init() {
    const B = window.AH?.config?.backend;
    if (!B || B.provider !== 'supabase' || !window.supabase) return false;
    try {
      sb = window.supabase.createClient(B.supabaseUrl, B.supabaseAnonKey);
      const { data } = await sb.auth.getSession();
      uid = data.session?.user?.id || null;
    } catch (e) { uid = null; }
    this.enabled = !!uid;
    return this.enabled;
  },
  fail(error) {
    this.status = /relation|does not exist|schema cache/i.test(error?.message || '') ? 'missing' : 'error';
    console.warn('Nuvem do Rail Atlas indisponível:', error?.message);
    return null;
  },
  async pull() {
    if (!this.enabled) return null;
    const { data, error } = await sb.from('rail_atlas_saves').select('data').eq('id', uid).maybeSingle();
    if (error) return this.fail(error);
    this.status = 'ok';
    return data?.data || null;
  },
  async push(state, summary) {
    if (!this.enabled || this.status === 'missing') return false;
    const { error } = await sb.from('rail_atlas_saves').upsert({
      id: uid, username: summary.username, company: summary.company, level: summary.level,
      deliveries: summary.deliveries, stations: summary.stations, data: state, updated_at: new Date().toISOString()
    });
    if (error) { this.fail(error); return false; }
    this.status = 'ok';
    return true;
  },
  async ranking(limit = 20) {
    if (!this.enabled || this.status === 'missing') return null;
    const { data, error } = await sb.from('rail_atlas_saves').select('id, username, company, level, deliveries, stations')
      .order('deliveries', { ascending: false }).limit(limit);
    if (error) return this.fail(error);
    return data.map(r => ({ ...r, me: r.id === uid }));
  }
};
