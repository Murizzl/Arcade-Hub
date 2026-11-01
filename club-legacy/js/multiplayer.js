/* =========================================================
   Multiplayer (fase 6): times salvos, amistosos e salas ao vivo.

   - "Foto" do time: escalação, banco, táticas, instruções e
     identidade do clube. Publicada na nuvem (club_legacy_teams)
     ou compartilhada por código de texto.
   - Amistoso: o mesmo motor da carreira, sem efeito nela (sem
     cansaço, lesões ou estatísticas).
   - Ao vivo: o anfitrião roda o motor e transmite o estado pelo
     Supabase Realtime; o convidado assiste e manda comandos
     (substituições, tática, pausa), aplicados no próximo lance.
   ========================================================= */
import { hashSeed } from './util.js';
import { Match } from './engine.js';
import { ratingAt } from './players.js';
import * as C from './career.js';
import { Cloud, gzip, gunzip } from './cloud.js';
import { Arcade } from './arcade.js';

const S = () => C.S;
const PLAYER_KEYS = ['id', 'name', 'num', 'pos', 'age', 'a', 'ovr', 'nat', 'natCode'];
const CLUB_KEYS = ['name', 'short', 'abbr', 'colors', 'away', 'kitText', 'crest', 'pattern', 'emblem', 'stadium', 'capacity', 'city'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/* ---------- foto do time ---------- */
export function snapshot() {
  const s = S(), me = C.myClub();
  const side = C.sideFor(me, true);
  const lineup = side.lineup.map(p => pick(p, PLAYER_KEYS));
  const bench = side.bench.map(p => pick(p, PLAYER_KEYS));
  const slots = C.DB.formations[side.tactics.formation];
  const rating = Math.round(side.lineup.reduce((a, p, i) => a + ratingAt(p, slots[i].r), 0) / 11);
  return { v: 1, coach: `${s.coach.first} ${s.coach.last}`, username: Arcade.profile()?.username || null, club: pick(me, CLUB_KEYS), tactics: side.tactics, lineup, bench, rating, at: Date.now() };
}

export async function toCode(snap) { return 'CL1.' + (await gzip(JSON.stringify(snap))).replace(/^gz:/, 'gz.').replace(/^raw:/, 'raw.'); }
export async function fromCode(code) {
  const c = String(code || '').trim();
  if (!c.startsWith('CL1.')) throw new Error('Código inválido.');
  const body = c.slice(4).replace(/^gz\./, 'gz:').replace(/^raw\./, 'raw:');
  const snap = JSON.parse(await gunzip(body));
  if (!snap?.lineup?.length || snap.lineup.length < 11) throw new Error('Time incompleto no código.');
  return snap;
}

/* ---------- nuvem: times publicados e histórico de desafios ---------- */
export async function publish(snap) {
  if (!Cloud.enabled) return { ok: false, msg: 'Entre no Arcade Hub para publicar seu time.' };
  const { error } = await Cloud.db().from('club_legacy_teams').upsert({ id: Cloud.uid(), username: snap.username, coach: snap.coach, club: snap.club.short, rating: snap.rating, snapshot: snap, updated_at: new Date().toISOString() });
  if (error) return { ok: false, msg: /relation|does not exist|schema cache|Could not find/i.test(error.message) ? 'Falta criar a tabela club_legacy_teams (rode supabase/schema.sql).' : 'Não foi possível publicar agora.' };
  S().mp ||= {}; S().mp.published = snap.at; C.save();
  return { ok: true };
}
// amigos vêm da sessão do Arcade Hub (mesmo navegador)
export function friendIds() {
  try { const h = JSON.parse(localStorage.getItem('arcadehub.v1') || 'null'); return (h?.friends || []).map(id => String(id).replace(/^u_/, '')); } catch (e) { return []; }
}
export async function listTeams() {
  if (!Cloud.enabled) return { friends: [], others: [] };
  const fr = friendIds();
  const cols = 'id, username, coach, club, rating, updated_at, snapshot';
  const [a, b] = await Promise.all([
    fr.length ? Cloud.db().from('club_legacy_teams').select(cols).in('id', fr) : Promise.resolve({ data: [] }),
    Cloud.db().from('club_legacy_teams').select(cols).order('updated_at', { ascending: false }).limit(20)
  ]);
  if (a.error || b.error) return { error: (a.error || b.error).message, friends: [], others: [] };
  const me = Cloud.uid();
  const friends = (a.data || []).filter(r => r.id !== me);
  const others = (b.data || []).filter(r => r.id !== me && !fr.includes(r.id));
  return { friends, others };
}
export async function challengesAgainstMe() {
  if (!Cloud.enabled) return [];
  const { data, error } = await Cloud.db().from('club_legacy_friendlies').select('*').eq('opponent', Cloud.uid()).order('created_at', { ascending: false }).limit(15);
  return error ? [] : data;
}

/* ---------- montar e registrar o amistoso ---------- */
function clubFrom(snap, id) { return { id, ...snap.club, prestige: 3, short: snap.club.short || snap.club.name }; }
function playersFrom(list, prefix) { return list.map(p => ({ ...p, id: prefix + p.id, cond: 100, morale: 75, injury: 0, suspended: 0 })); }

/**
 * home/away: fotos dos times. userSide: lado de quem assiste aqui (0/1).
 * humans: lados controlados por pessoas (o resto é IA).
 */
export function buildFriendly(home, away, { seed, userSide = 0, humans = [userSide], record = true } = {}) {
  const clubs = { 'mp-h': clubFrom(home, 'mp-h'), 'mp-a': clubFrom(away, 'mp-a') };
  const side = (snap, i) => ({ club: clubs[i ? 'mp-a' : 'mp-h'], lineup: playersFrom(snap.lineup, i ? 'a:' : 'h:'), bench: playersFrom(snap.bench, i ? 'a:' : 'h:'), tactics: { ...snap.tactics }, ai: !humans.includes(i), morale: 1 });
  const m = new Match({ home: side(home, 0), away: side(away, 1), seed, formations: C.DB.formations, record, userSide, assistant: false });
  const f = { id: `fr-${seed}`, friendly: true, home: 'mp-h', away: 'mp-a', played: false, attendance: 0 };
  return { m, f, clubs };
}

export function finishFriendly(f, m, { userSide, opp, oppId = null, live = false }) {
  const r = m.result();
  f.played = true; f.score = r.score;
  f.user = { side: userSide, stats: r.stats, ratings: r.ratings, motm: r.motm, events: r.events, tactics: r.tactics };
  const s = S();
  const gf = r.score[userSide], ga = r.score[1 - userSide];
  s.friendlies = [{ at: Date.now(), opp, oppId, score: r.score, side: userSide, live, res: gf > ga ? 'V' : gf < ga ? 'D' : 'E' }, ...(s.friendlies || [])].slice(0, 40);
  if (gf > ga) Arcade.report('friendly_win', `${oppId || opp}-${new Date().toISOString().slice(0, 10)}`);
  if (Cloud.enabled && oppId) Cloud.db().from('club_legacy_friendlies').insert({ challenger: Cloud.uid(), opponent: oppId, challenger_name: `${s.coach.first} ${s.coach.last}`, opponent_name: opp, home_goals: r.score[0], away_goals: r.score[1], challenger_side: userSide, live, seed: f.id.slice(3) }).then(() => {});
  C.save();
  return r;
}

/* =========================================================
   Sala ao vivo (Supabase Realtime, canal broadcast + presence)
   ========================================================= */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export class LiveRoom {
  constructor(code, role) {
    this.code = code.toUpperCase(); this.role = role; // 'host' | 'guest'
    this.handlers = {}; this.peer = false; this.lastState = 0; this.logSent = 0;
  }
  on(type, fn) { this.handlers[type] = fn; return this; }
  async open() {
    if (!Cloud.enabled) throw new Error('Entre no Arcade Hub para jogar ao vivo.');
    const sb = Cloud.db();
    this.ch = sb.channel(`club-legacy-live:${this.code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: `${this.role}-${Cloud.uid()}` } } });
    this.ch.on('broadcast', { event: 'm' }, ({ payload }) => this.handlers[payload.t]?.(payload.d));
    this.ch.on('presence', { event: 'sync' }, () => {
      const keys = Object.keys(this.ch.presenceState());
      const other = keys.some(k => !k.startsWith(this.role));
      if (other !== this.peer) { this.peer = other; this.handlers[other ? 'peer-join' : 'peer-leave']?.(); }
    });
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Tempo esgotado ao conectar.')), 10000);
      this.ch.subscribe(async st => {
        if (st === 'SUBSCRIBED') { clearTimeout(to); await this.ch.track({ role: this.role, at: Date.now() }); res(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(to); rej(new Error('Não foi possível abrir a sala.')); }
      });
    });
    return this;
  }
  send(t, d) { this.ch?.send({ type: 'broadcast', event: 'm', payload: { t, d } }); }
  close() { try { this.ch?.untrack(); Cloud.db()?.removeChannel(this.ch); } catch (e) { /* */ } this.ch = null; }

  /* ---------- anfitrião: transmite o estado do motor ---------- */
  stateOf(m) {
    const b = m.ball;
    const players = [];
    for (const T of m.teams) for (const p of T.on) players.push([Math.round(p.x * 10), Math.round(p.y * 10), T.side, p.p.num, p.role === 'GK' ? 1 : 0, p.dive || 0, p === b.owner ? 1 : 0]);
    const log = m.log.slice(this.logSent); this.logSent = m.log.length;
    const fl = b.flight;
    return { c: m.clock().text, x: m.stoppage[m.half - 1] || 0, ph: m.phase, sc: m.score, b: [Math.round(b.x * 10), Math.round(b.y * 10), Math.round((b.z || 0) * 10)], p: players, l: log, pass: fl && fl.kind !== 'shot' ? [fl.sx, fl.sy, fl.ex, fl.ey].map(v => Math.round(v)) : null, st: m.stats.map(s => ({ poss: Math.round(s.poss), shots: s.shots, onTarget: s.onTarget, xg: Math.round(s.xg * 100) / 100, passes: s.passes, passesOk: s.passesOk, tackles: s.tackles, interceptions: s.interceptions, corners: s.corners, offsides: s.offsides, fouls: s.fouls, yellows: s.yellows, reds: s.reds, saves: s.saves })) };
  }
  pushState(m, force = false) {
    const now = performance.now();
    if (!force && now - this.lastState < 120) return; // ~8 por segundo
    this.lastState = now;
    this.send('st', this.stateOf(m));
  }
  // painel do time do convidado: em campo, banco, trocas e táticas
  teamOf(m, side) {
    const T = m.teams[side];
    return { on: T.on.map(p => ({ id: p.p.id, name: p.p.name, num: p.p.num, role: p.role, energy: Math.round(p.energy), yellow: p.yellow, injured: p.injured })), bench: T.bench.map(p => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr })), subs: T.subs, tactics: { ...T.tactics, instr: T.instr }, off: T.off.map(x => x.p.name) };
  }
}

export const seedFor = (a, b) => hashSeed(a, b, Date.now()) >>> 0;
