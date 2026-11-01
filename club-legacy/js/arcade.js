/* =========================================================
   Integração com o Arcade Social (Arcade Hub).

   O jogo NUNCA decide quanto XP o jogador ganha: ele só relata
   eventos com ID único. Os eventos vão para a caixa de entrada do
   hub (localStorage), que confere a conta, descarta repetições e
   aplica as regras de js/config.js — ou o servidor, com a nuvem ligada.
   ========================================================= */
const HUB_KEY = 'arcadehub.v1';
const INBOX_KEY = 'arcadehub.inbox';
const GAME_ID = 'club-legacy';

function readHub() { try { return JSON.parse(localStorage.getItem(HUB_KEY) || 'null'); } catch (e) { return null; } }

export const Arcade = {
  gameId: GAME_ID,
  profile() {
    const s = readHub();
    if (!s?.session || !s.user) return null;
    return { id: s.user.id, username: s.user.username, level: s.user.level };
  },
  report(eventType, contractId, kind = 'common', extra = {}) {
    const prof = this.profile();
    if (!prof) return false;
    const item = { id: `${GAME_ID}:${prof.id}:${eventType}:${contractId}`, gameId: GAME_ID, userId: prof.id, eventType, contractId, kind, t: Date.now(), ...extra };
    try {
      const inbox = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]');
      if (inbox.some(e => e.id === item.id)) return false;
      inbox.push(item);
      localStorage.setItem(INBOX_KEY, JSON.stringify(inbox.slice(-500)));
      return true;
    } catch (e) { return false; }
  },
  playtime(seconds) {
    if (seconds >= 5) this.report('playtime', 'pt' + Date.now().toString(36), 'common', { seconds: Math.min(120, Math.round(seconds)) });
  },
  // resumo público da carreira, exibido no perfil do Arcade Social
  publish(S) {
    if (!S) return;
    const c = S.coach, club = c.clubId ? S.clubs[c.clubId] : null;
    const best = c.titles.find(t => /Continental/.test(t.name)) || c.titles.find(t => /Série A|Argentina|Portugal/.test(t.name)) || c.titles[0];
    const summary = {
      company: `${c.first} ${c.last}`, color: club?.colors[0] || '#a3e635',
      home: club ? `${club.name} · ${({ A: 'Série A', B: 'Série B', ARG: 'Liga Argentina', POR: 'Liga Portugal' })[club.division] || club.division}` : 'Sem clube',
      stats: [['Clube atual', club ? club.short : '—'], ['Temporadas', S.season], ['Partidas', c.matches], ['Vitórias', c.w], ['Troféus', c.titles.length], ['Maior conquista', best ? `${best.name} ${best.year}` : '—']],
      username: this.profile()?.username
    };
    try { localStorage.setItem(`arcadehub.persistent.${GAME_ID}.summary`, JSON.stringify({ ...summary, t: Date.now() })); } catch (e) { /* */ }
  }
};
