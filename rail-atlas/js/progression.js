/* =========================================================
   Progressão da companhia — níveis e desbloqueios.
   ========================================================= */
import { state, emit, log, DB } from './game-state.js';

export const xpForLevel = n => Math.round(120 * Math.pow(n, 1.55));

// O que cada nível libera (lido pelas telas e pelas regras)
export const UNLOCKS = [
  { level: 1, text: 'Linhas convencionais e locomotivas a vapor' },
  { level: 2, text: 'Linhas de montanha, rota fixa (despacho semiautomático) e 3 linhas' },
  { level: 3, text: 'Corredores expressos e despacho automático' },
  { level: 4, text: 'Túneis submarinos e a elétrica Faísca' },
  { level: 5, text: '6 linhas simultâneas e melhorias de estação nível 5' },
  { level: 8, text: 'Balsas ferroviárias entre continentes' }
];

export const maxLines = (lvl = state.company.level) => Math.min(12, 1 + lvl);
export const maxTrains = (lvl = state.company.level) => 1 + lvl;

export function levelInfo() {
  const c = state.company, need = xpForLevel(c.level);
  return { level: c.level, xp: c.xp, need, pct: Math.min(100, c.xp / need * 100) };
}

export function addCompanyXp(amount) {
  const c = state.company;
  c.xp += Math.round(amount);
  while (c.xp >= xpForLevel(c.level)) {
    c.xp -= xpForLevel(c.level);
    c.level++;
    const u = UNLOCKS.find(x => x.level === c.level);
    const models = DB.models.filter(m => m.unlockLevel === c.level).map(m => m.name);
    log('trending-up', `Companhia chegou ao nível ${c.level}!${u ? ' ' + u.text + '.' : ''}${models.length ? ' Novas locomotivas: ' + models.join(', ') + '.' : ''}`, 'success');
    emit('levelup', c.level);
  }
}

// ---------- Conquistas (data/achievements.json) ----------
export function achievementMetrics() {
  const s = state.stats;
  return {
    deliveries: s.deliveries, slots: s.tons, special: s.special || 0, international: s.international,
    transfers: s.transfers || 0, onTime: s.onTime || 0,
    stations: Object.keys(state.stations).length,
    lines: state.lines.filter(l => Object.values(state.owned).some(o => o.lineId === l.id)).length,
    trains: state.trains.length, level: state.company.level,
    upgrades: Object.values(state.stations).reduce((a, st) => a + Object.values(st.upgrades || {}).reduce((x, n) => x + n, 0), 0),
    automated: state.trains.filter(t => t.mode === 'auto').length
  };
}

/** Desbloqueia conquistas cumpridas; devolve as novas. A recompensa é paga uma única vez. */
export function checkAchievements(onUnlock) {
  const m = achievementMetrics(), got = [];
  for (const a of DB.achievements) {
    if (state.achievements[a.id] || (m[a.metric] || 0) < a.goal) continue;
    state.achievements[a.id] = Date.now();
    state.credits += a.reward; state.stats.earned += a.reward;
    log('award', `Conquista: ${a.name}! +${a.reward} cr.`, 'success');
    got.push(a);
    onUnlock?.(a);
  }
  if (got.length) emit('achievements', got);
  return got;
}
