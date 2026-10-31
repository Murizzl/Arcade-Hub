/* =========================================================
   Camada de integração com o Arcade Social (Arcade Hub).

   O jogo NUNCA informa quanto XP o jogador ganha: ele só relata
   eventos com ID único. Hoje os eventos vão para uma caixa de
   entrada no localStorage, que o hub lê, valida (sem repetição,
   limite diário) e converte em XP pelas regras dele.
   PRODUÇÃO: trocar `deliver` por um POST autenticado para a API,
   que confere a entrega no banco antes de conceder qualquer XP.
   ========================================================= */

const HUB_KEY = 'arcadehub.v1';
const INBOX_KEY = 'arcadehub.inbox';
const GAME_ID = 'rail-atlas';

function readHub() {
  try { return JSON.parse(localStorage.getItem(HUB_KEY) || 'null'); } catch (e) { return null; }
}

export const ArcadeIntegration = {
  gameId: GAME_ID,

  /** Conta do Arcade Hub logada neste navegador (ou null = convidado). */
  profile() {
    const s = readHub();
    if (!s?.session || !s.user) return null;
    return { id: s.user.id, username: s.user.username, level: s.user.level, totalXp: s.user.totalXp };
  },

  /** XP já concedida pelo hub a este jogo hoje (somente leitura, para exibir). */
  grantedToday() {
    const u = readHub()?.user;
    const p = u?.persistent?.[GAME_ID];
    const today = new Date().toDateString();
    return p && p.day === today ? p.xpToday : 0;
  },

  /**
   * Relata um evento. Retorna true se foi enfileirado.
   * Exemplo: reportEvent({ eventType: 'cargo_delivered', gameId: 'rail-atlas', contractId })
   */
  reportEvent(evt) {
    const prof = this.profile();
    if (!prof || !evt?.eventType || !evt.contractId) return false;
    const item = {
      id: `${GAME_ID}:${prof.id}:${evt.eventType}:${evt.contractId}`, // idempotente
      gameId: GAME_ID, userId: prof.id, eventType: evt.eventType,
      contractId: evt.contractId, kind: evt.kind || 'common', t: evt.at || Date.now()
    };
    if (evt.seconds) item.seconds = Math.round(evt.seconds); // eventos de tempo de jogo
    return this.deliver(item);
  },

  deliver(item) {
    try {
      const inbox = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]');
      if (inbox.some(e => e.id === item.id)) return false;
      inbox.push(item);
      localStorage.setItem(INBOX_KEY, JSON.stringify(inbox.slice(-500)));
      return true;
    } catch (e) { return false; }
  },

  // Preparado para a fase social: resumo público da companhia no perfil
  publishSummary(summary) {
    try { localStorage.setItem(`arcadehub.persistent.${GAME_ID}.summary`, JSON.stringify({ ...summary, t: Date.now() })); } catch (e) { /* sem armazenamento */ }
  }
};
