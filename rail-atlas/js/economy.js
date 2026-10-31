/* =========================================================
   Economia — preços, recompensas e movimentação de créditos.
   Toda transação passa por spend()/earn(): nunca há saldo negativo.
   ========================================================= */
import { state, emit, DB } from './game-state.js';

export const ECONOMY = {
  startCredits: 2500,
  // segundos reais por hora de viagem simulada (ajusta o ritmo do jogo)
  secondsPerGameHour: 26,
  dwellSeconds: 4,                 // carga e descarga em cada estação
  segmentBase: 300, segmentPerKm: 5,
  rewardBase: 25, rewardPerSlotKm: 0.15,
  rarity: {
    comum:    { name: 'Comum',    mult: 1.0, weight: 72, color: '#94a3b8' },
    incomum:  { name: 'Incomum',  mult: 1.35, weight: 21, color: '#22c55e' },
    raro:     { name: 'Raro',     mult: 1.8, weight: 6, color: '#3b82f6' },
    especial: { name: 'Especial', mult: 2.6, weight: 1.2, color: '#eab308' }
  },
  internationalMult: 1.4,
  contractTtlMs: 12 * 60e3,        // contratos não aceitos expiram
  refreshMs: 75e3,                 // intervalo de reposição por estação
  contractsPerStation: 6,
  offlineCapHours: 8,
  eventMinutes: 8                  // prazo dos contratos de evento
};

export const fmt = n => Math.round(n).toLocaleString('pt-BR');

export function segmentCost(link) {
  const t = DB.linkTypes[link.type];
  return Math.round((ECONOMY.segmentBase + link.km * ECONOMY.segmentPerKm) * t.costMult / 10) * 10;
}

export function contractReward({ km, slots, cargo, rarity, international }) {
  const c = DB.cargoById[cargo];
  const base = ECONOMY.rewardBase + km * slots * c.value * ECONOMY.rewardPerSlotKm;
  return Math.round(base * ECONOMY.rarity[rarity].mult * (international ? ECONOMY.internationalMult : 1) / 5) * 5;
}

export function companyXpFor({ km, slots, rarity, international }) {
  return Math.round((3 + km * slots / 60) * ECONOMY.rarity[rarity].mult * (international ? 1.5 : 1));
}

export function tripCost(model, km) { return Math.round(km * model.costPerKm); }

export const canAfford = amount => state.credits >= amount;

export function spend(amount, reason) {
  amount = Math.round(amount);
  if (!(amount >= 0) || state.credits < amount) return false;
  state.credits -= amount;
  state.stats.spent += amount;
  emit('credits', { delta: -amount, reason });
  return true;
}

export function earn(amount, reason) {
  amount = Math.round(amount);
  if (!(amount > 0)) return;
  state.credits += amount;
  state.stats.earned += amount;
  emit('credits', { delta: amount, reason });
}
