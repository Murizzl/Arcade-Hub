/* =========================================================
   Motor de partidas — independente dos gráficos.

   - Passo fixo de tempo simulado (DT). O modo instantâneo e o modo
     assistido executam exatamente o mesmo `tick()`; o renderizador só
     lê as posições. A taxa de quadros nunca altera probabilidades.
   - Gerador pseudoaleatório com semente: mesma semente + mesmas
     decisões do treinador = mesmo jogo.
   - Máquina de estados da jogada: posse → construção → passe/condução
     → disputa/interceptação → finalização → defesa → gol/fora → reinício.
   - Todas as estatísticas nascem dos acontecimentos processados aqui.
   ========================================================= */
import { RNG, clamp } from './util.js';
import { ratingAt } from './players.js';

// CLOCK: minutos do placar por minuto de jogo simulado. O relógio corre mais rápido que o
// movimento, para a partida não se arrastar e os jogadores não ficarem frenéticos ao acelerar.
export const L = 105, W = 68, DT = 0.25, CLOCK = 2.5, HALF = 2700 / CLOCK;
const GOAL_HALF = 3.66; // metade da largura do gol (7,32 m)

export const STYLES = {
  balanced:   { label: 'Equilibrado',        tempo: .85, fwd: 1,    risk: 1,   wide: 1,   long: 1,   cross: 1 },
  possession: { label: 'Posse de bola',      tempo: 1.1, fwd: .7,   risk: 1.6, wide: 1,   long: .45, cross: .8 },
  counter:    { label: 'Contra-ataque',      tempo: .62, fwd: 1.45, risk: .9,  wide: 1,   long: 1.3, cross: 1, deep: -.05 },
  direct:     { label: 'Jogo direto',        tempo: .7,  fwd: 1.55, risk: .7,  wide: .9,  long: 2.1, cross: 1.2 },
  short:      { label: 'Construção curta',   tempo: .95, fwd: .85,  risk: 1.35, wide: .9, long: .35, cross: .8 },
  wings:      { label: 'Ataque pelas laterais', tempo: .85, fwd: 1.05, risk: 1, wide: 1.5, long: 1, cross: 1.9 }
};
export const PRESS = {
  low:    { label: 'Baixa',  n: 1, r: 10, drain: .85, tackle: .7 },
  normal: { label: 'Normal', n: 2, r: 17, drain: 1,   tackle: 1 },
  high:   { label: 'Alta',   n: 3, r: 26, drain: 1.2, tackle: 1.4 }
};
export const LINES = { low: { label: 'Recuada', v: -.05 }, normal: { label: 'Normal', v: 0 }, high: { label: 'Alta', v: .055 } };
// Instruções individuais por posição (estilo FIFA). Cada uma ajusta posicionamento e decisões:
// ax/dx: deslocamento no ataque/defesa (fração do campo), inside/wide: corredor, run: infiltração,
// shoot: limiar de finalização (negativo = chuta mais), cross: cruzamentos, prog: passes verticais,
// hold: não sobe, drain: gasto de energia, box: chega na área, overlap: lateral sempre apoia
export const INSTR = {
  finisher:  { label: 'Finalizador',        short: 'FIN', roles: ['ST'], desc: 'Fica entre os zagueiros e só pensa no gol.', shoot: -0.012 },
  false9:    { label: 'Falso 9',            short: 'F9',  roles: ['ST'], desc: 'Recua para armar, puxa um zagueiro e abre espaço para pontas e meias.', ax: -0.05, shoot: 0, prog: 0.8, drop: true },
  target:    { label: 'Pivô',               short: 'PIV', roles: ['ST'], desc: 'Segura a bola de costas e ganha pelo alto; atrai cruzamentos.', ax: -0.02, aerial: true, cross: 1.4 },
  runner:    { label: 'Infiltrador',        short: 'INF', roles: ['ST', 'LW', 'RW'], desc: 'Vive nas costas da defesa (mais impedimentos, mais chances claras).', run: 0.35 },
  shadow:    { label: 'Atacante sombra',    short: 'SOM', roles: ['AM', 'ST'], desc: 'Chega de trás como segundo atacante.', ax: 0.06, box: 0.5, shoot: -0.01 },
  playmaker: { label: 'Armador',            short: 'ARM', roles: ['AM', 'CM'], desc: 'Fica atrás da bola e procura o passe decisivo.', ax: -0.03, prog: 0.8, shoot: 0.015 },
  roamer:    { label: 'Meia livre',         short: 'LIV', roles: ['AM'], desc: 'Flutua pelo campo procurando espaços.', roam: true, ax: 0.02 },
  inside:    { label: 'Ponta por dentro',   short: 'PPD', roles: ['LW', 'RW'], desc: 'Corta para o meio e finaliza com a perna boa.', inside: 0.55, shoot: -0.015, cross: 0.5 },
  wide:      { label: 'Ponta aberto',       short: 'ABE', roles: ['LW', 'RW'], desc: 'Colado na linha lateral, cruza muito.', wide: true, cross: 1.8 },
  falseWing: { label: 'Falso ponta',        short: 'FPT', roles: ['LW', 'RW'], desc: 'Começa aberto e vem para o meio armar; abre o corredor para o lateral.', inside: 0.75, ax: -0.06, prog: 0.5 },
  boxToBox:  { label: 'Box-to-box',         short: 'B2B', roles: ['CM'], desc: 'Ataca e defende o tempo todo (cansa mais).', ax: 0.06, dx: -0.03, box: 0.35, drain: 1.15 },
  holding:   { label: 'Volante que segura', short: 'SEG', roles: ['DM', 'CM'], desc: 'Não passa da linha da bola; protege a zaga.', hold: true, dx: -0.02 },
  regista:   { label: 'Regista',            short: 'REG', roles: ['DM'], desc: 'Armador recuado: lançamentos longos desde trás.', hold: true, prog: 1, long: true },
  overlap:   { label: 'Lateral que apoia',  short: 'APO', roles: ['LB', 'RB'], desc: 'Passa o ponta por fora em quase todo ataque (cansa mais).', overlap: true, drain: 1.1 },
  stayBack:  { label: 'Lateral fixo',       short: 'FIX', roles: ['LB', 'RB', 'CB'], desc: 'Não sobe; mais segurança atrás.', hold: true, dx: -0.02 },
  inverted:  { label: 'Lateral invertido',  short: 'INV', roles: ['LB', 'RB'], desc: 'Fecha no meio-campo na construção.', inside: 0.6, ax: 0.05, prog: 0.4 },
  stopper:   { label: 'Zagueiro que sai',   short: 'STP', roles: ['CB'], desc: 'Sai para pressionar o atacante; arriscado.', dx: 0.03, press: true },
  ballPlayer:{ label: 'Zagueiro construtor',short: 'CON', roles: ['CB'], desc: 'Conduz e acha passes verticais desde trás.', prog: 0.7, long: true },
  sweeperGk: { label: 'Goleiro líbero',     short: 'LIB', roles: ['GK'], desc: 'Joga adiantado e sai da área para cortar lançamentos.', gkHigh: true }
};
export const instrFor = role => Object.entries(INSTR).filter(([, v]) => v.roles.includes(role));

export const MENTALITY = { '-2': 'Muito defensiva', '-1': 'Defensiva', '0': 'Equilibrada', '1': 'Ofensiva', '2': 'Muito ofensiva' };

const ATTR_K = 0.6;
const compressAttrs = a => { const o = {}; for (const k in a) o[k] = 65 + (a[k] - 65) * ATTR_K; return o; };
const dist = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); };
const isDefRole = r => r === 'CB' || r === 'LB' || r === 'RB';
const isFwdRole = r => r === 'ST' || r === 'LW' || r === 'RW' || r === 'AM';

function segInfo(sx, sy, ex, ey, px, py) {
  const dx = ex - sx, dy = ey - sy, len2 = dx * dx + dy * dy || 1;
  const u = ((px - sx) * dx + (py - sy) * dy) / len2;
  const cx = sx + dx * u, cy = sy + dy * u;
  const qx = px - cx, qy = py - cy;
  return { u, d: Math.sqrt(qx * qx + qy * qy), cx, cy };
}

/**
 * side: { club, lineup: [11 jogadores na ordem dos slots], bench: [...], tactics, ai, formations }
 */
export class Match {
  constructor({ home, away, seed, formations, record = false, userSide = -1, assistant = true }) {
    this.rng = new RNG(seed);
    this.F = formations;
    this.record = record;
    this.userSide = userSide;
    this.assistant = assistant; // auxiliar técnico faz as trocas do time do usuário (modo instantâneo)
    this.half = 1; this.t = 0; this.total = 0;
    this.phase = 'live'; // live | HT | FT
    this.stoppage = [0, 0];
    this.events = [];
    this.log = [];
    this.replays = [];
    this.frames = [];
    this.tacticLog = [];
    this.onEvent = null;
    this.stats = [0, 1].map(() => ({ poss: 0, shots: 0, onTarget: 0, goals: 0, xg: 0, passes: 0, passesOk: 0, fouls: 0, yellows: 0, reds: 0, corners: 0, saves: 0, tackles: 0, interceptions: 0, offsides: 0 }));
    this.halfStats = null;
    this.score = [0, 0];
    this.teams = [home, away].map((s, i) => this.makeTeam(s, i));
    this.ball = { x: L / 2, y: W / 2, z: 0, owner: null, flight: null, vx: 0, vy: 0, lastSide: 0 };
    this.poss = 0; this.tickN = 0; this.lastOwner = null;
    this.lastPass = null;
    this.restart = null;
    this.pendingReplay = null;
    this.aiPrematch();
    this.kickoff(0, true);
  }

  // IA monta o plano de jogo conforme a força relativa (retranca contra favoritos, domínio contra mais fracos)
  aiPrematch() {
    const str = T => T.on.reduce((s, m) => s + m.ovr, 0) / T.on.length;
    for (const T of this.teams) {
      if (!T.ai) continue;
      const O = this.teams[1 - T.side];
      const gap = str(T) - str(O) + (T.home ? 1.5 : -1.5);
      const b = T.aiBase;
      if (gap <= -4) { b.mentality = Math.max(-2, b.mentality - 1); b.line = 'low'; if (b.style === 'possession' || b.style === 'balanced') b.style = 'counter'; T.plan = 'Fechado atrás, saindo no contra-ataque'; }
      else if (gap >= 4) { b.mentality = Math.min(1, b.mentality + 1); if (b.press === 'low') b.press = 'normal'; T.plan = 'Propondo o jogo desde o início'; }
      else T.plan = 'Jogo equilibrado';
      T.tactics = { ...T.tactics, ...b };
    }
  }

  makeTeam(s, side) {
    const T = {
      side, club: s.club, tactics: { ...s.tactics }, ai: !!s.ai, home: side === 0,
      slots: this.F[s.tactics.formation], on: [], bench: s.bench.slice(), subs: 0, used: [], off: [], instr: { ...(s.tactics.instr || {}) },
      aiClock: 0, morale: s.morale ?? 1, aiBase: s.ai ? { ...s.tactics } : null
    };
    s.lineup.forEach((p, i) => T.on.push(this.mp(p, side, i, T.slots[i].r)));
    T.used = T.on.slice();
    return T;
  }

  mp(p, side, slot, role) {
    const sx = side === 0 ? L * 0.3 : L * 0.7;
    return {
      p, side, slot, role, x: sx, y: W / 2, px: sx, py: W / 2, tx: sx, ty: W / 2,
      energy: clamp(p.cond ?? 100, 30, 100), eff: 1, stun: 0, yellow: 0, off: false, injured: false,
      ovr: ratingAt(p, role), wob: (p.num || 1) * 1.37,
      a: compressAttrs(p.a), // atributos usados nas disputas: diferenças atenuadas para o favorito não atropelar sempre
      r: { passes: 0, passesOk: 0, key: 0, shots: 0, goals: 0, assists: 0, tackles: 0, ints: 0, saves: 0, conceded: 0, lost: 0, fouls: 0 },
      minIn: this.minute ? this.minute() : 0, minOut: null
    };
  }

  /* ---------- relógio ---------- */
  minute() { return (this.half - 1) * 45 + Math.min(45, Math.floor(this.t * CLOCK / 60) + 1); }
  clock() {
    const base = (this.half - 1) * 45;
    if (this.t >= HALF) { const ex = Math.floor((this.t - HALF) * CLOCK / 60) + 1; return { m: base + 45, extra: ex, text: `${base + 45}+${ex}'` }; }
    const s = Math.floor(this.t * CLOCK); return { m: base + Math.floor(s / 60), extra: 0, text: `${String(base + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` };
  }
  minuteLabel() { const ex = this.t >= HALF ? Math.floor((this.t - HALF) * CLOCK / 60) + 1 : 0; return ex ? `${(this.half) * 45}+${ex}'` : `${this.minute()}'`; }

  // instrução válida para o posto e a função atuais
  ins(p) { const k = this.teams[p.side].instr[p.slot]; const v = k && INSTR[k]; return v && v.roles.includes(p.role) ? v : null; }

  /* ---------- coordenadas relativas ao ataque de cada lado ---------- */
  fX(s, x) { return s === 0 ? x / L : 1 - x / L; }
  fY(s, y) { return s === 0 ? y / W : 1 - y / W; }
  toX(s, f) { return s === 0 ? f * L : L - f * L; }
  toY(s, f) { return s === 0 ? f * W : W - f * W; }
  goalX(s) { return s === 0 ? L : 0; } // gol que o lado `s` ataca

  emit(type, data = {}) {
    const ev = { type, min: this.minuteLabel(), minute: this.minute(), half: this.half, t: this.total, ...data };
    this.events.push(ev);
    if (this.onEvent) this.onEvent(ev);
    return ev;
  }
  say(text, side = -1, kind = 'info') { this.log.push({ min: this.minuteLabel(), text, side, kind }); }

  /* ---------- reinícios ---------- */
  kickoff(side, snap = false, celebrate = null) {
    this.ball.owner = null; this.ball.flight = null;
    if (!celebrate) { this.ball.x = L / 2; this.ball.y = W / 2; }
    this.ball.z = 0;
    const net = celebrate ? { x: this.ball.x, y: this.ball.y } : null;
    this.restart = { kind: 'kickoff', side, x: L / 2, y: W / 2, wait: snap ? 1.5 : celebrate ? 13 : 7, celebrate, net };
    this.poss = side;
    if (snap) for (const T of this.teams) for (const m of T.on) {
      const s = T.slots[m.slot]; const fx = Math.min(0.47, s.x * 0.8);
      m.x = m.px = this.toX(T.side, fx); m.y = m.py = this.toY(T.side, s.y);
    }
  }

  setRestart(kind, side, x, y, wait = 2.5) {
    this.ball.owner = null; this.ball.flight = null; this.ball.vx = this.ball.vy = 0; this.ball.z = 0;
    this.ball.x = clamp(x, 0, L); this.ball.y = clamp(y, 0, W);
    this.restart = { kind, side, x: this.ball.x, y: this.ball.y, wait };
    this.poss = side;
  }

  /* ---------- laço principal ---------- */
  tick() {
    if (this.phase !== 'live') return;
    this.t += DT; this.total += DT;
    const b = this.ball;
    for (const T of this.teams) this.updateTeam(T);

    if (this.restart) this.handleRestart();
    else if (b.flight) this.updateFlight();
    else if (b.owner) this.updateHolder();
    else this.updateLoose();

    // reposicionamento coletivo a cada 0,5 s (tempo de reação); determinístico nos dois modos
    if (++this.tickN % 2 === 0 || this.ball.owner !== this.lastOwner) { this.computeTargets(); this.lastOwner = this.ball.owner; }
    this.movePlayers();

    // posse: quem controla a bola ou a lançou por último
    const ps = b.owner ? b.owner.side : b.flight ? b.flight.from.side : this.restart ? this.restart.side : b.lastSide;
    this.stats[ps].poss += DT; this.poss = ps;

    if (this.record) this.recordFrame();

    // fim de tempo: espera a bola não estar em finalização
    const end = HALF + this.stoppage[this.half - 1] * 60 / CLOCK;
    if (this.t >= HALF && !this.stoppage[this.half - 1]) this.setStoppage();
    if (this.t >= end && !(b.flight && b.flight.kind === 'shot') && !(this.restart && (this.restart.kind === 'penalty' || this.restart.kind === 'corner'))) this.endHalf();
  }

  setStoppage() {
    const evs = this.events.filter(e => e.half === this.half);
    const n = evs.filter(e => e.type === 'goal').length * 0.5 + evs.filter(e => e.type === 'sub').length * 0.3 + evs.filter(e => e.type === 'card' || e.type === 'injury').length * 0.4;
    const base = this.half === 1 ? 1 : 2;
    this.stoppage[this.half - 1] = clamp(Math.round(base + n + this.rng.next() * 1.5), base, this.half === 1 ? 4 : 6);
    this.emit('stoppage', { extra: this.stoppage[this.half - 1] });
  }

  endHalf() {
    if (this.half === 1) {
      this.phase = 'HT';
      this.halfStats = JSON.parse(JSON.stringify(this.stats));
      this.say('Fim do primeiro tempo.', -1, 'whistle');
      this.emit('halftime');
    } else {
      this.phase = 'FT';
      this.finish();
      this.say('Fim de jogo!', -1, 'whistle');
      this.emit('fulltime');
    }
  }

  startSecondHalf() {
    if (this.phase !== 'HT') return;
    this.half = 2; this.t = 0; this.phase = 'live';
    for (const T of this.teams) for (const m of T.on) m.energy = Math.min(100, m.energy + 4); // intervalo recupera um pouco
    this.kickoff(1, true);
    this.say('Começa o segundo tempo.', -1, 'whistle');
    this.emit('secondhalf');
  }

  // simula até o fim (modo instantâneo ou "simular restante")
  runToEnd() {
    let guard = 0;
    while (this.phase !== 'FT' && guard++ < 200000) {
      if (this.phase === 'HT') this.startSecondHalf();
      this.tick();
    }
  }

  /* ---------- equipe: eficiência, IA e cansaço ---------- */
  updateTeam(T) {
    const homeB = T.home ? 1.03 : 1;
    for (const m of T.on) {
      m.eff = (0.7 + 0.3 * m.energy / 100) * homeB * (0.96 + 0.08 * T.morale) * (0.97 + 0.06 * ((m.p.morale ?? 70) - 50) / 50) * (m.injured ? 0.7 : 1);
      if (m.stun > 0) m.stun -= DT;
      // músculo cansado: risco de lesão sem contato
      if (!m.injured && m.energy < 42 && this.rng.chance(DT * CLOCK * 0.00004 * (42 - m.energy))) this.injure(m, 'muscle');
    }
    T.aiClock += DT;
    if (T.aiClock >= 180 / CLOCK) { T.aiClock = 0; if (T.ai) this.aiTactics(T); if (T.ai || (T.side === this.userSide && this.assistant)) this.aiSubs(T); }
  }

  aiTactics(T) {
    const diff = this.score[T.side] - this.score[1 - T.side];
    const min = this.minute();
    const base = T.aiBase;
    const O = this.teams[1 - T.side];
    let ment = base.mentality, press = base.press, style = base.style;
    // lê o esquema do adversário
    if (O.tactics.mentality >= 1 && diff >= 0) style = 'counter';
    else if (O.tactics.press === 'high' && style !== 'counter') style = 'direct';
    else if (O.tactics.mentality <= -1 && diff <= 0) style = base.style === 'counter' ? 'possession' : base.style;
    if (min >= 55 && diff <= -2) { ment = 2; press = 'high'; }
    else if (min >= 60 && diff === -1) { ment = Math.max(1, base.mentality + 1); press = base.press === 'low' ? 'normal' : 'high'; }
    else if (min >= 78 && diff >= 1) { ment = Math.min(-1, base.mentality - 1); press = 'low'; }
    else if (min >= 70 && diff >= 2) { ment = -1; }
    // superioridade / inferioridade numérica
    if (T.on.length < O.on.length && diff >= 0) { ment = Math.min(ment, -1); press = 'low'; }
    if (O.on.length < T.on.length && diff <= 0) ment = Math.max(ment, 1);
    ment = clamp(ment, -2, 2);
    if (ment !== T.tactics.mentality || press !== T.tactics.press || style !== T.tactics.style) {
      const was = T.tactics.mentality, wasStyle = T.tactics.style;
      T.tactics.mentality = ment; T.tactics.press = press; T.tactics.style = style;
      this.tacticLog.push({ side: T.side, min: this.minuteLabel(), text: `${T.club.short}: mentalidade ${MENTALITY[ment].toLowerCase()}, pressão ${PRESS[press].label.toLowerCase()}, ${STYLES[style].label.toLowerCase()}` });
      if (ment > was) this.say(`${T.club.short} se lança ao ataque.`, T.side, 'tactic');
      else if (ment < was) this.say(`${T.club.short} recua para administrar o resultado.`, T.side, 'tactic');
      if (style !== wasStyle) this.say(style === 'counter' ? `${T.club.short} espera o adversário e aposta no contra-ataque.` : style === 'direct' ? `${T.club.short} foge da pressão com bolas longas.` : `${T.club.short} passa a trabalhar mais a bola.`, T.side, 'tactic');
    }
  }

  aiSubs(T) {
    const min = this.minute();
    if (min < 55 || T.subs >= 5 || !T.bench.length) return;
    const diff = this.score[T.side] - this.score[1 - T.side];
    // pior combinação de cansaço / lesão / cartão
    const cand = T.on.filter(m => !m.off && m.role !== 'GK').map(m => ({ m, need: (m.injured ? 100 : 0) + (100 - m.energy) + (m.yellow ? 12 : 0) - m.ovr * 0.3 })).sort((a, b) => b.need - a.need);
    for (const c of cand.slice(0, min >= 75 ? 2 : 1)) {
      if (T.subs >= 5) break;
      if (!c.m.injured && c.m.energy > 66 && min < 80) continue;
      let role = c.m.role;
      if (diff < 0 && min >= 65 && (role === 'DM' || role === 'CB') && T.on.filter(x => x.role === 'CB').length > 2) role = 'ST';
      else if (diff < 0 && min >= 70 && role === 'DM') role = 'AM';
      else if (diff > 0 && min >= 75 && isFwdRole(role)) role = 'DM'; // segura o resultado
      const best = T.bench.filter(p => !p.injury).map(p => ({ p, r: ratingAt(p, role) })).sort((a, b) => b.r - a.r)[0];
      if (best && best.r >= c.m.ovr - 8) this.substitute(T.side, c.m.p.id, best.p.id);
    }
  }

  /* ---------- intervenções do treinador ---------- */
  applyTactics(side, tac) {
    const T = this.teams[side];
    const changes = [];
    for (const k of ['mentality', 'style', 'press', 'line']) if (tac[k] !== undefined && tac[k] !== T.tactics[k]) {
      changes.push(k === 'mentality' ? `mentalidade ${MENTALITY[tac[k]].toLowerCase()}` : k === 'style' ? `estilo ${STYLES[tac[k]].label.toLowerCase()}` : k === 'press' ? `pressão ${PRESS[tac[k]].label.toLowerCase()}` : `linha ${LINES[tac[k]].label.toLowerCase()}`);
      T.tactics[k] = tac[k];
    }
    if (tac.formation && tac.formation !== T.tactics.formation && this.F[tac.formation]) {
      T.tactics.formation = tac.formation; T.slots = this.F[tac.formation];
      if (tac.instr) T.instr = { ...tac.instr };
      this.reassignSlots(T);
      changes.push(`formação ${tac.formation}`);
    }
    if (changes.length) {
      this.tacticLog.push({ side, min: this.minuteLabel(), text: changes.join(', ') });
      this.say(`${T.club.short} muda: ${changes.join(', ')}.`, side, 'tactic');
      this.emit('tactic', { side, text: changes.join(', ') });
    }
    if (T.aiBase && tac.base) T.aiBase = { ...T.tactics };
  }

  // distribuição gulosa dos atletas em campo nos slots da nova formação
  reassignSlots(T) {
    const live = T.on.filter(m => !m.off);
    const slots = T.slots.map((s, i) => i);
    const order = [];
    // com expulsões, abre mão dos postos mais avançados
    const drop = slots.filter(i => i > 0).sort((a, b) => T.slots[b].x - T.slots[a].x).slice(0, Math.max(0, T.slots.length - live.length));
    const free = new Set(slots.filter(i => !drop.includes(i)));
    const gk = live.find(m => m.p.pos === 'GK') || live.find(m => m.role === 'GK');
    if (gk) { gk.slot = 0; gk.role = 'GK'; free.delete(0); }
    const rest = live.filter(m => m !== gk).sort((a, b) => b.p.ovr - a.p.ovr);
    for (const m of rest) {
      let best = -1, br = -1;
      for (const i of free) { if (i === 0) continue; const r = ratingAt(m.p, T.slots[i].r); if (r > br) { br = r; best = i; } }
      if (best < 0) best = [...free][0];
      free.delete(best); m.slot = best; m.role = T.slots[best].r; m.ovr = ratingAt(m.p, m.role); order.push(m);
    }
  }

  substitute(side, outId, inId) {
    const T = this.teams[side];
    if (T.subs >= 5) return { ok: false, msg: 'Limite de 5 substituições atingido.' };
    const out = T.on.find(m => m.p.id === outId && !m.off);
    const inP = T.bench.find(p => p.id === inId);
    if (!out || !inP) return { ok: false, msg: 'Substituição inválida.' };
    if (T.used.some(m => m.p.id === inId)) return { ok: false, msg: 'Jogador já participou da partida.' };
    if (this.ball.owner === out) { this.ball.owner = null; this.ball.vx = this.ball.vy = 0; }
    const role = T.slots[out.slot].r;
    const m = this.mp(inP, side, out.slot, role);
    m.x = m.px = out.x; m.y = m.py = side === 0 ? -1 : W + 1; m.y = m.py = out.y;
    out.minOut = this.minute();
    T.on[T.on.indexOf(out)] = m;
    T.used.push(m);
    T.bench = T.bench.filter(p => p.id !== inId);
    T.subs++;
    this.say(`Substituição no ${T.club.short}: sai ${out.p.name}, entra ${inP.name}.`, side, 'sub');
    this.emit('sub', { side, out: out.p.id, outName: out.p.name, in: inP.id, inName: inP.name });
    return { ok: true };
  }

  /* ---------- bola parada / reinícios ---------- */
  handleRestart() {
    const r = this.restart; const b = this.ball;
    // depois do gol a bola fica na rede durante a comemoração e só então volta ao centro
    if (r.net && r.wait > 6) { b.x = r.net.x; b.y = r.net.y; } else { b.x = r.x; b.y = r.y; }
    b.z = 0;
    r.wait -= DT;
    if (r.wait > 0) return;
    const T = this.teams[r.side];
    const live = T.on.filter(m => !m.off);
    let taker;
    if (r.kind === 'goalkick') taker = live.find(m => m.role === 'GK') || live[0];
    else if (r.kind === 'penalty') taker = live.filter(m => m.role !== 'GK').sort((a, c) => c.a.sho - a.a.sho)[0];
    else if (r.kind === 'fkshot' || r.kind === 'fkcross') taker = live.filter(m => m.role !== 'GK').sort((a, c) => (c.a.sho + c.a.pas) - (a.a.sho + a.a.pas))[0];
    else if (r.kind === 'kickoff') taker = live.filter(m => isFwdRole(m.role)).sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y))[0] || live[1];
    else taker = live.filter(m => r.kind === 'corner' ? m.role !== 'GK' : true).sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y))[0];
    if (!taker) { this.restart = null; return; }
    if (r.kind === 'kickoff') for (const TT of this.teams) for (const m of TT.on) { // ninguém fora do próprio campo no pontapé
      const f = this.fX(TT.side, m.x); if (f > 0.48) m.x = m.px = this.toX(TT.side, 0.48);
    }
    taker.x = taker.px = b.x - (r.side === 0 ? 0.8 : -0.8); taker.y = taker.py = b.y;
    this.restart = null;
    b.owner = taker; b.lastSide = r.side;
    if (r.kind === 'corner') return this.cross(taker, true);
    if (r.kind === 'fkcross' && this.cross(taker, false)) return;
    if (r.kind === 'fkshot' && this.rng.chance(0.75)) {
      const d = dist(b.x, b.y, this.goalX(r.side), W / 2);
      return this.shoot(taker, clamp(0.11 - (d - 17) * 0.006, 0.02, 0.1), 'freekick');
    }
    if (r.kind === 'penalty') return this.shoot(taker, 0.76, 'penalty');
    taker.decide = r.kind === 'kickoff' ? 0.3 : r.kind === 'goalkick' ? 0.8 : 0.5;
  }

  /* ---------- condutor da bola ---------- */
  updateHolder() {
    const h = this.ball.owner, b = this.ball;
    b.x = h.x + (h.side === 0 ? 0.6 : -0.6); b.y = h.y; b.z = 0; b.lastSide = h.side;
    h.decide = (h.decide ?? 0.6) - DT;
    h.blocked = false;
    h.carry = (h.carry || 0) + DT;

    // disputas: marcadores próximos tentam o desarme
    const O = this.teams[1 - h.side];
    const pr = PRESS[O.tactics.press];
    for (const o of O.on) {
      if (o.off || o.stun > 0 || o.role === 'GK') continue;
      const od = dist(o.x, o.y, h.x, h.y);
      if (od > 2.4) continue;
      // marcador entre o condutor e o gol fecha o caminho
      const front = (o.x - h.x) * (h.side === 0 ? 1 : -1) > -0.3;
      if (front) h.blocked = true;
      if (od > (front ? 2.4 : 1.6)) continue;
      if (!this.rng.chance(DT * (front ? 1.7 : 0.55) * pr.tackle)) continue;
      const foulP = (Math.abs(this.goalX(h.side) - h.x) < 16.5 ? 0.022 : 0.062) + (O.tactics.press === 'high' ? 0.035 : 0) + (o.a.def < 55 ? 0.03 : 0) + (o.energy < 50 ? 0.03 : 0);
      const careful = o.yellow ? 0.55 : 1; // já advertido, entra com mais cuidado
      if (this.rng.chance(foulP * careful)) return this.foul(o, h);
      const win = clamp(0.4 + (o.a.def * o.eff - h.a.dri * h.eff) / 240, 0.2, 0.7);
      if (this.rng.chance(win)) {
        o.r.tackles++; this.stats[o.side].tackles++; h.r.lost++;
        if (this.rng.chance(0.3)) { this.looseBall(h.x, h.y, (this.rng.next() - .5) * 8, (this.rng.next() - .5) * 8, o.side); }
        else this.gain(o);
        return;
      }
      o.stun = 1.2; // driblado
      h.decide = Math.min(h.decide, 0.4);
    }
    if (h.decide <= 0 || h.carry > 3) this.decide(h);
  }

  gain(m) {
    const prev = this.ball.owner ? this.ball.owner.side : this.ball.lastSide;
    this.ball.owner = m; this.ball.flight = null; this.ball.lastSide = m.side; m.carry = 0;
    const T = this.teams[m.side];
    m.decide = 0.4 + this.rng.next() * 0.5;
    if (prev !== m.side) { T.transition = this.total; this.lastPass = null; }
  }

  decide(h) {
    const T = this.teams[h.side], st = STYLES[T.tactics.style], m = T.tactics.mentality;
    const gx = this.goalX(h.side), gy = W / 2;
    const d = dist(h.x, h.y, gx, gy);
    const fx = this.fX(h.side, h.x), fy = this.fY(h.side, h.y);
    const press = this.nearestOpp(h);
    h.carry = 0;
    const counter = st === STYLES.counter && T.transition && this.total - T.transition < 8;
    h.decide = 0.85 * (st.tempo * (counter ? 0.6 : 1)) * (0.6 + this.rng.next() * 0.8) * (press.d < 4 ? 0.5 : 1);

    // 1) finalização
    if (h.role !== 'GK' && d < 33) {
      const xg = this.xgAt(h);
      const roleK = h.role === 'ST' ? 0.015 : (h.role === 'LW' || h.role === 'RW' || h.role === 'AM') ? -0.022 : h.role === 'CM' ? -0.01 : 0;
      const iH = this.ins(h);
      const thr = 0.07 + roleK + (iH?.shoot || 0) - m * 0.005 - (h.a.sho - 60) / 2000;
      // altruísmo: rola para um companheiro com chance claramente melhor
      if (xg > thr * 0.6) {
        const alt = this.betterPlaced(h, xg);
        if (alt && this.rng.chance(0.35 + h.a.pas / 400)) return this.pass(h, alt);
      }
      if ((xg > thr && this.rng.chance(0.45 + m * 0.05)) || (d < 27 && this.rng.chance(0.008 + h.a.sho / 8000 + m * 0.004))) return this.shoot(h, xg);
    }
    // 2) cruzamento das pontas
    if (h.role !== 'GK' && fx > 0.73 && (fy < 0.2 || fy > 0.8) && this.rng.chance(0.4 * st.cross * (this.ins(h)?.cross || 1))) {
      if (this.cross(h, false)) return;
    }
    // 3) passe
    const opt = this.choosePass(h, counter);
    const passWill = h.role === 'GK' ? 1 : st === STYLES.possession ? 0.85 : 0.68 - (h.a.dri - 60) / 300;
    if (opt && (press.d < 3.5 || this.rng.chance(passWill) || opt.score > 1.2)) return this.pass(h, opt);
    // 4) condução (continua com a bola)
    h.dribbling = true;
  }

  betterPlaced(h, myXg) {
    const T = this.teams[h.side], O = this.teams[1 - h.side];
    let best = null;
    for (const t of T.on) {
      if (t === h || t.off || t.role === 'GK') continue;
      const len = dist(h.x, h.y, t.x, t.y);
      if (len < 4 || len > 22) continue;
      const xg = this.xgAt(t);
      if (xg < myXg * 1.4 || xg < 0.06) continue;
      let lane = false;
      for (const o of O.on) { if (o.off) continue; const sg = segInfo(h.x, h.y, t.x, t.y, o.x, o.y); if (sg.u > 0.1 && sg.u < 0.95 && sg.d < 1.8) { lane = true; break; } }
      if (lane) continue;
      if (!best || xg > best.xg) best = { t, xg, len, prog: (this.fX(h.side, t.x) - this.fX(h.side, h.x)) * L, score: 2 };
    }
    return best;
  }

  nearestOpp(h) {
    let best = null, bd = 1e9;
    for (const o of this.teams[1 - h.side].on) { if (o.off) continue; const d = dist(o.x, o.y, h.x, h.y); if (d < bd) { bd = d; best = o; } }
    return { o: best, d: bd };
  }

  xgAt(h, header = false) {
    const gx = this.goalX(h.side);
    const dx = Math.abs(gx - h.x), dy = Math.abs(W / 2 - h.y);
    const d = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, Math.max(0.5, dx));
    let xg = 0.5 * Math.exp(-0.11 * Math.max(0, d - 3)) * Math.pow(Math.max(0.15, Math.cos(ang)), 1.6);
    const pr = this.nearestOpp(h).d;
    if (pr < 1.5) xg *= 0.55; else if (pr < 3) xg *= 0.8;
    if (header) xg *= 0.55;
    return clamp(xg, 0.003, 0.6);
  }

  choosePass(h, counter) {
    const T = this.teams[h.side], O = this.teams[1 - h.side];
    const st = STYLES[T.tactics.style], m = T.tactics.mentality;
    const hf = this.fX(h.side, h.x);
    const offL = this.offsideLine(h.side);
    let best = null;
    const opts = [];
    for (const t of T.on) {
      if (t === h || t.off) continue;
      const len = dist(h.x, h.y, t.x, t.y);
      if (len < 5 || len > (h.role === 'GK' ? 62 : 52)) continue;
      if (t.role === 'GK' && hf > 0.35) continue;
      const tf = this.fX(h.side, t.x), tfy = this.fY(h.side, t.y);
      const prog = (tf - hf) * L;
      let open = 14, risk = 0;
      for (const o of O.on) {
        if (o.off) continue;
        open = Math.min(open, dist(o.x, o.y, t.x, t.y));
        const s = segInfo(h.x, h.y, t.x, t.y, o.x, o.y);
        if (s.u > 0.08 && s.u < 1.05 && s.d < 3.3) risk += (1 - s.d / 3.3) * (0.6 + o.a.def / 160);
      }
      let score = prog * 0.05 * st.fwd * (1 + m * 0.15) * (counter ? 1.6 : 1) + open * 0.07 - risk * 1.1 * st.risk;
      if (len > 30) score -= (len - 30) * 0.035 / st.long;
      if (tf > 0.65 && (tfy < 0.22 || tfy > 0.78)) score += 0.35 * (st.wide - 1);
      if (h.role === 'GK' && st === STYLES.short && isDefRole(t.role)) score += 0.5;
      if (prog < -5 && st !== STYLES.possession) score -= 0.2;
      // visão: bons passadores enxergam o companheiro em impedimento
      if (tf > 0.5 && tf > offL + 0.006 && tf > hf && this.rng.chance(0.35 + h.a.pas / 300)) score -= 3;
      const iP = this.ins(h);
      if (iP?.prog && prog > 8) score += prog * 0.012 * iP.prog;
      if (iP?.long && len > 30) score += (len - 30) * 0.03;
      const iT = this.ins(t);
      if (iT?.aerial && isFwdRole(t.role) && tf > 0.7) score += 0.15;
      score += this.rng.next() * 0.35;
      opts.push({ t, score, len, prog });
    }
    if (!opts.length) return null;
    opts.sort((a, b) => b.score - a.score);
    // visão de jogo: bons passadores escolhem a melhor opção com mais frequência
    const vis = h.a.pas / 100;
    best = opts[0];
    if (opts.length > 1 && this.rng.chance(0.45 - vis * 0.35)) best = opts[1];
    return best;
  }

  pass(h, opt) {
    const t = opt.t, T = this.teams[h.side], O = this.teams[1 - h.side];
    const dir = h.side === 0 ? 1 : -1;
    let ex = t.x, ey = t.y;
    // passe em profundidade para quem ataca o espaço
    if (isFwdRole(t.role) && opt.prog > 4) { const lead = 2.5 + t.a.pac / 35; ex += dir * lead; }
    ex = clamp(ex, 1, L - 1); ey = clamp(ey, 1, W - 1);
    const len = dist(h.x, h.y, ex, ey);
    const q = h.a.pas * h.eff;
    this.stats[h.side].passes++; h.r.passes++;
    const long = len > 28;
    // interceptações ao longo da linha de passe (o primeiro no caminho tem a chance)
    const lane = [];
    for (const o of O.on) {
      if (o.off) continue;
      const s = segInfo(h.x, h.y, ex, ey, o.x, o.y);
      if (s.u > 0.1 && s.u < 1.02 && s.d < (long ? 2.4 : 3.2)) lane.push({ o, s });
    }
    lane.sort((a, b) => a.s.u - b.s.u);
    let res = { kind: 'pass', to: t };
    let endX = ex, endY = ey;
    // impedimento: receptor à frente do penúltimo adversário e da bola no momento do passe
    const tf = this.fX(h.side, t.x);
    if (tf > 0.5 && tf > this.offsideLine(h.side) + 0.006 && tf > this.fX(h.side, h.x)) res = { kind: 'offside', to: t, at: [t.x, t.y] };
    if (res.kind === 'pass') for (const { o, s } of lane) {
      const p = (1 - s.d / 3.2) * 0.17 * (0.6 + (o.a.def + o.a.pos) / 2 * o.eff / 180) * (1.15 - q / 250) * (long ? 1.15 : 1);
      if (this.rng.chance(p)) { res = { kind: 'intercept', by: o }; endX = s.cx; endY = s.cy; break; }
    }
    if (res.kind === 'pass') {
      const miss = 0.025 + Math.pow(len / 55, 2) * (1.02 - q / 200) * 0.55;
      if (this.rng.chance(miss)) {
        endX = ex + (this.rng.next() - .5) * 12; endY = ey + (this.rng.next() - .5) * 12;
        res = { kind: endX < 0 || endX > L || endY < 0 || endY > W ? 'out' : 'loose' };
      }
    }
    const D = dist(h.x, h.y, endX, endY);
    this.ball.owner = null;
    this.ball.flight = { kind: 'pass', from: h, sx: h.x, sy: h.y, ex: endX, ey: endY, t: 0, dur: 0.15 + D / (long ? 23 : 16.5), arc: long ? Math.min(6, D / 8) : 0, res };
    this.lastPass = { from: h, to: t, time: this.total };
    h.dribbling = false;
  }

  offsideLine(s) {
    let a = 0, b = 0; // as duas maiores posições adversárias (goleiro incluso), no referencial de quem ataca
    for (const o of this.teams[1 - s].on) { if (o.off) continue; const f = this.fX(s, o.x); if (f > a) { b = a; a = f; } else if (f > b) b = f; }
    return Math.max(0.5, b);
  }

  cross(h, corner) {
    const T = this.teams[h.side], O = this.teams[1 - h.side];
    const gx = this.goalX(h.side);
    const inBox = T.on.filter(m => !m.off && m !== h && m.role !== 'GK' && Math.abs(m.x - gx) < 18 && Math.abs(m.y - W / 2) < 18);
    if (!inBox.length && !corner) return false;
    if (corner) this.stats[h.side].corners++;
    // alvo do cruzamento: sorteio ponderado por físico e posicionamento (não sempre o centroavante)
    let target = null;
    if (inBox.length) {
      const wts = inBox.map(m => Math.pow((m.a.phy + m.a.pos) / 100, 3) * (this.ins(m)?.aerial ? 2.5 : 1));
      let r = this.rng.next() * wts.reduce((a, b) => a + b, 0);
      target = inBox.find((m, i) => (r -= wts[i]) <= 0) || inBox[0];
    }
    const tx = target ? target.x : gx - (h.side === 0 ? 9 : -9);
    const ty = target ? target.y : W / 2 + (this.rng.next() - .5) * 10;
    const q = h.a.pas * h.eff;
    // defensores na área disputam pelo alto
    const defs = O.on.filter(m => !m.off && Math.abs(m.x - gx) < 18 && Math.abs(m.y - W / 2) < 20);
    const defBest = defs.reduce((a, m) => Math.max(a, (m.a.def + m.a.phy) / 2 * m.eff), 0);
    const attV = target ? (target.a.phy + target.a.pos) / 2 * target.eff : 0;
    let res;
    const gk = O.on.find(m => m.role === 'GK' && !m.off);
    if (!target || this.rng.chance(clamp(0.18 + (defBest - attV) / 120 + (1 - q / 100) * 0.35 + defs.length * 0.04, 0.15, 0.82))) {
      const clearer = defs.sort((a, b) => dist(a.x, a.y, tx, ty) - dist(b.x, b.y, tx, ty))[0];
      if (gk && this.rng.chance(0.22 + gk.a.han / 400)) res = { kind: 'intercept', by: gk };
      else res = clearer ? { kind: 'clear', by: clearer } : { kind: 'loose' };
      if (clearer && res.kind === 'clear') { clearer.r.ints++; this.stats[clearer.side].interceptions++; }
    } else res = { kind: 'header', to: target };
    const D = dist(h.x, h.y, tx, ty);
    this.ball.owner = null;
    this.ball.flight = { kind: 'cross', from: h, sx: h.x, sy: h.y, ex: tx, ey: ty, t: 0, dur: 0.3 + D / 21, arc: 5, res };
    this.lastPass = { from: h, to: target, time: this.total };
    this.stats[h.side].passes++; h.r.passes++;
    return true;
  }

  shoot(h, xg, kind = 'open') {
    const T = this.teams[h.side], O = this.teams[1 - h.side];
    const gx = this.goalX(h.side);
    const gk = O.on.find(m => m.role === 'GK' && !m.off);
    const gkQ = gk ? ((gk.a.div + gk.a.ref + gk.a.han) / 3) * gk.eff : 30;
    const q = h.a.sho * h.eff;
    this.stats[h.side].shots++; this.stats[h.side].xg += xg; h.r.shots++;
    const key = this.lastPass && this.lastPass.to === h && this.total - this.lastPass.time < 6 ? this.lastPass.from : null;
    if (key) key.r.key++;
    // bloqueio por defensores na frente
    let blocked = false;
    if (kind === 'open') for (const o of O.on) {
      if (o.off || o.role === 'GK') continue;
      const s = segInfo(h.x, h.y, gx, W / 2, o.x, o.y);
      if (s.u > 0.05 && s.u < 0.9 && s.d < 1.2 && this.rng.chance(0.3 + o.a.def / 400)) { blocked = o; break; }
    }
    if (kind === 'freekick' && this.rng.chance(0.24)) blocked = O.on.filter(o => !o.off && o.role !== 'GK').sort((a, c) => dist(a.x, a.y, h.x, h.y) - dist(c.x, c.y, h.x, h.y))[0] || false;
    // finalizador e goleiro deslocam a chance, sem multiplicar a ponto de descolar do xG
    const adj = clamp(xg * 1.52 * (0.75 + q / 300) * (1.2 - gkQ / 300), 0.003, 0.9);
    const onT = clamp(0.28 + q / 210 + xg * 0.63, 0.3, 0.92);
    const r = this.rng.next();
    let outcome;
    if (blocked) outcome = 'block';
    else if (r < adj) outcome = 'goal';
    else if (r < Math.max(onT, adj + 0.05)) outcome = 'save';
    else outcome = 'off';
    let ey;
    if (outcome === 'goal') ey = W / 2 + (this.rng.next() - .5) * 2 * (GOAL_HALF - 0.4);
    else if (outcome === 'save') ey = W / 2 + (this.rng.next() - .5) * 2 * (GOAL_HALF - 0.8);
    else ey = W / 2 + (this.rng.chance(.5) ? 1 : -1) * (GOAL_HALF + 0.8 + this.rng.next() * 5);
    let ex = outcome === 'goal' ? gx + (h.side === 0 ? 1.4 : -1.4) : gx, eyy = ey;
    if (outcome === 'block') { ex = blocked.x; eyy = blocked.y; }
    if (outcome === 'save' && gk) { ex = gx + (h.side === 0 ? -0.8 : 0.8); }
    if (outcome === 'goal' || outcome === 'save') this.stats[h.side].onTarget++;
    const D = dist(h.x, h.y, ex, eyy);
    this.ball.owner = null;
    this.ball.flight = { kind: 'shot', from: h, sx: h.x, sy: h.y, ex, ey: eyy, t: 0, dur: 0.12 + D / 27, arc: outcome === 'off' && this.rng.chance(.4) ? 2.5 : 0.6, res: { outcome, gk, blocked, xg, key, shotKind: kind } };
    if (kind === 'freekick' && outcome !== 'block') this.ball.flight.arc = 2.6;
    h.dribbling = false;
    const big = xg >= 0.19;
    this.say(kind === 'penalty' ? `${h.p.name} vai para a cobrança do pênalti…` : kind === 'freekick' ? `${h.p.name} cobra a falta direto para o gol!` : big ? `Grande chance para ${h.p.name}!` : `${h.p.name} arrisca a finalização.`, h.side, big ? 'chance' : 'shot');
    this.emit('shot', { side: h.side, player: h.p.id, name: h.p.name, xg, outcome, big });
    return true;
  }

  foul(o, h) {
    const T = this.teams[o.side];
    this.stats[o.side].fouls++; o.r.fouls++;
    const gx = this.goalX(h.side);
    const inBox = Math.abs(h.x - gx) < 16.5 && Math.abs(h.y - W / 2) < 20.15;
    // cartões
    const fwdF = this.fX(h.side, h.x);
    let card = null;
    // vermelho direto é raro (falta para impedir chance clara); amarelo mais comum perto da área
    if (this.rng.chance(0.002 + (fwdF > 0.8 ? 0.006 : 0))) card = 'red';
    else if (this.rng.chance((0.13 + (fwdF > 0.7 ? 0.06 : 0)) * (o.yellow ? 0.45 : 1))) card = o.yellow ? 'red2' : 'yellow';
    this.say(`Falta de ${o.p.name} em ${h.p.name}.`, o.side, 'foul');
    if (card) {
      if (card === 'yellow') { o.yellow = 1; this.stats[o.side].yellows++; }
      else { this.stats[o.side].reds++; if (card === 'red2') this.stats[o.side].yellows++; this.sendOff(o); }
      this.say(card === 'yellow' ? `Cartão amarelo para ${o.p.name}.` : card === 'red2' ? `Segundo amarelo! ${o.p.name} expulso.` : `Cartão vermelho direto para ${o.p.name}!`, o.side, card === 'yellow' ? 'yellow' : 'red');
      const cev = this.emit('card', { side: o.side, player: o.p.id, name: o.p.name, card: card === 'yellow' ? 'yellow' : 'red', second: card === 'red2' });
      if (card !== 'yellow') this.captureReplay('red', cev);
    }
    // lesão
    if (this.rng.chance(0.03)) this.injure(h, 'contact');
    const dGoal = dist(h.x, h.y, gx, W / 2);
    if (inBox && this.rng.chance(0.12)) {
      this.say(`Pênalti para o ${this.teams[h.side].club.short}!`, h.side, 'chance');
      this.emit('penalty', { side: h.side, name: h.p.name });
      this.setRestart('penalty', h.side, h.side === 0 ? L - 11 : 11, W / 2, 4);
    } else if (!inBox && dGoal < 30 && Math.abs(h.y - W / 2) < 18) {
      this.say(`Falta perigosa para o ${this.teams[h.side].club.short}. Barreira formada.`, h.side, 'chance');
      this.emit('freekick', { side: h.side });
      this.setRestart('fkshot', h.side, h.x, h.y, 4);
    } else if (!inBox && fwdF > 0.72) this.setRestart('fkcross', h.side, h.x, h.y, 3.5);
    else this.setRestart('free', h.side, h.x, h.y, 2.5);
  }

  injure(h, kind) {
    h.injured = true;
    const days = kind === 'muscle' ? this.rng.int(6, 22) : this.rng.int(3, 40);
    h.injuryDays = days;
    this.say(kind === 'muscle' ? `${h.p.name} sente a coxa e pede para sair.` : `${h.p.name} sente a pancada e pede atendimento.`, h.side, 'injury');
    this.emit('injury', { side: h.side, player: h.p.id, name: h.p.name, days });
    const HT = this.teams[h.side];
    if (HT.ai || (h.side === this.userSide && this.assistant)) {
      const best = HT.bench.filter(p => !p.injury).map(p => ({ p, r: ratingAt(p, h.role) })).sort((a, b) => b.r - a.r)[0];
      if (best && HT.subs < 5) this.substitute(h.side, h.p.id, best.p.id);
    }
  }

  sendOff(m) {
    m.off = true; m.minOut = this.minute();
    if (this.ball.owner === m) this.ball.owner = null;
    const T = this.teams[m.side];
    T.off.push(m);
    T.on = T.on.filter(x => x !== m);
    // goleiro expulso: um jogador de linha vai para o gol
    if (m.role === 'GK' && T.on.length) {
      const sub = T.bench.find(p => p.pos === 'GK');
      const outfield = T.on.filter(x => x.role !== 'GK').sort((a, b) => a.ovr - b.ovr)[0];
      if (sub && T.subs < 5 && outfield) { this.substitute(m.side, outfield.p.id, sub.id); const n = T.on.find(x => x.p.id === sub.id); n.slot = 0; n.role = 'GK'; }
      else if (outfield) { outfield.slot = 0; outfield.role = 'GK'; }
    }
    if (T.on.length >= 7) this.reassignSlots(T);
    this.say(`${T.club.short} se reorganiza com ${T.on.length} jogadores.`, T.side, 'tactic');
  }

  /* ---------- bola em trânsito ---------- */
  updateFlight() {
    const f = this.ball.flight, b = this.ball;
    f.t += DT;
    const k = Math.min(1, f.t / f.dur);
    b.x = f.sx + (f.ex - f.sx) * k; b.y = f.sy + (f.ey - f.sy) * k;
    b.z = Math.sin(Math.PI * k) * f.arc;
    if (k < 1) return;
    b.z = 0;
    const res = f.res, from = f.from;
    if (f.kind === 'shot') return this.resolveShot(f);
    if (res.kind === 'offside') {
      this.ball.flight = null;
      this.stats[from.side].offsides++;
      this.say(`Impedimento! ${res.to.p.name} estava adiantado.`, from.side, 'foul');
      this.emit('offside', { side: from.side, name: res.to.p.name, player: res.to.p.id });
      return this.setRestart('free', 1 - from.side, res.at[0], res.at[1], 2.5);
    }
    if (res.kind === 'pass') {
      const t = res.to;
      if (t.off) return this.looseBall(b.x, b.y, 0, 0, from.side);
      // bola longa: disputa pelo alto
      if (f.arc >= 3) {
        const opp = this.nearestOpp({ x: b.x, y: b.y, side: t.side });
        if (opp.o && opp.d < 2.6 && this.rng.chance(0.35 * (opp.o.a.phy * opp.o.eff) / (opp.o.a.phy * opp.o.eff + t.a.phy * t.eff))) {
          opp.o.r.ints++; this.stats[opp.o.side].interceptions++; t.r.lost++;
          this.ball.flight = null;
          const dir = from.side === 0 ? -1 : 1;
          return this.looseBall(b.x, b.y, dir * (6 + this.rng.next() * 8), (this.rng.next() - .5) * 12, opp.o.side);
        }
      }
      // controle: marcador colado pode roubar no domínio
      const opp = this.nearestOpp({ x: b.x, y: b.y, side: t.side });
      if (opp.o && opp.d < 1.6 && this.rng.chance(0.11 * opp.o.a.def / (opp.o.a.def + t.a.dri) * 2 * opp.o.eff)) {
        opp.o.r.ints++; this.stats[opp.o.side].interceptions++; t.r.lost++;
        return this.gain(opp.o);
      }
      if (this.rng.chance(0.03 * (1.2 - t.a.dri / 100))) return this.looseBall(b.x, b.y, (this.rng.next() - .5) * 6, (this.rng.next() - .5) * 6, t.side);
      t.x = b.x; t.y = b.y;
      this.stats[from.side].passesOk++; from.r.passesOk++;
      this.ball.flight = null; this.gain(t);
      return;
    }
    if (res.kind === 'intercept') {
      const by = res.by;
      by.x = b.x; by.y = b.y;
      if (by.role !== 'GK') { by.r.ints++; this.stats[by.side].interceptions++; }
      from.r.lost++;
      this.ball.flight = null; this.gain(by);
      if (by.role === 'GK') by.decide = 1.5;
      return;
    }
    if (res.kind === 'header') {
      this.ball.flight = null;
      const h = res.to; h.x = b.x; h.y = b.y;
      this.ball.owner = h;
      this.stats[from.side].passesOk++; from.r.passesOk++;
      return this.shoot(h, this.xgAt(h, true), 'header');
    }
    if (res.kind === 'clear') {
      const dir = from.side === 0 ? -1 : 1;
      this.ball.flight = null;
      return this.looseBall(b.x, b.y, dir * (10 + this.rng.next() * 12), (this.rng.next() - .5) * 16, res.by.side);
    }
    if (res.kind === 'out') { this.ball.flight = null; return this.outOfPlay(from.side); }
    this.ball.flight = null;
    this.looseBall(b.x, b.y, (f.ex - f.sx) * 0.08, (f.ey - f.sy) * 0.08, from.side);
  }

  resolveShot(f) {
    const { outcome, gk, blocked, xg, key, shotKind } = f.res;
    const h = f.from, T = this.teams[h.side], O = this.teams[1 - h.side];
    const b = this.ball;
    this.ball.flight = null;
    if (outcome === 'goal') {
      this.score[h.side]++; this.stats[h.side].goals++; h.r.goals++;
      if (key && key !== h) key.r.assists++;
      if (gk) gk.r.conceded++;
      this.say(`GOOOL! ${h.p.name} marca para o ${T.club.short}!${key && key !== h ? ` Assistência de ${key.p.name}.` : ''}`, h.side, 'goal');
      const ev = this.emit('goal', { side: h.side, player: h.p.id, name: h.p.name, assist: key && key !== h ? key.p.id : null, assistName: key && key !== h ? key.p.name : null, score: this.score.slice(), xg, kind: shotKind });
      this.captureReplay('goal', ev);
      this.kickoff(1 - h.side, false, { side: h.side, scorer: h });
      T.transition = 0;
      return;
    }
    if (outcome === 'save') {
      this.stats[1 - h.side].saves++; if (gk) gk.r.saves++;
      const hold = gk && this.rng.chance(0.45 + gk.a.han / 250 - xg * 0.4);
      this.say(hold ? `${gk.p.name} segura firme.` : `Que defesa de ${gk ? gk.p.name : 'goleiro'}!`, 1 - h.side, 'save');
      const ev = this.emit('save', { side: 1 - h.side, player: gk?.p.id, name: gk?.p.name, shooter: h.p.name, xg });
      if (xg >= 0.16) this.captureReplay('save', ev);
      if (hold) { gk.x = b.x; gk.y = b.y; this.gain(gk); gk.decide = 1.8; return; }
      if (this.rng.chance(0.42)) return this.setRestart('corner', h.side, h.side === 0 ? L : 0, b.y < W / 2 ? 0 : W, 3);
      const dir = h.side === 0 ? -1 : 1;
      return this.looseBall(b.x, b.y, dir * (5 + this.rng.next() * 8), (this.rng.next() - .5) * 14, 1 - h.side);
    }
    if (outcome === 'block') {
      blocked.r.ints++;
      this.say(`${blocked.p.name} se joga na frente e bloqueia!`, blocked.side, 'save');
      if (this.rng.chance(0.3)) return this.setRestart('corner', h.side, h.side === 0 ? L : 0, b.y < W / 2 ? 0 : W, 3);
      return this.looseBall(b.x, b.y, (this.rng.next() - .5) * 14, (this.rng.next() - .5) * 14, blocked.side);
    }
    this.say(`Para fora. ${h.p.name} não acerta o alvo.`, h.side, 'miss');
    if (xg >= 0.22 || shotKind === 'penalty') this.captureReplay('miss', this.emit('miss', { side: h.side, name: h.p.name, xg }));
    this.setRestart('goalkick', 1 - h.side, h.side === 0 ? L - 5.5 : 5.5, W / 2 + (this.rng.next() - .5) * 10, 3);
  }

  looseBall(x, y, vx, vy, lastSide) {
    const b = this.ball;
    b.owner = null; b.flight = null; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.lastSide = lastSide;
  }

  updateLoose() {
    const b = this.ball;
    b.x += b.vx * DT; b.y += b.vy * DT;
    const fr = Math.pow(0.35, DT); b.vx *= fr; b.vy *= fr;
    if (b.x < 0 || b.x > L || b.y < 0 || b.y > W) return this.outOfPlay(b.lastSide);
    // quem chega primeiro domina
    let best = null, bd = 1.3, second = null;
    for (const T of this.teams) for (const m of T.on) {
      if (m.off || m.stun > 0) continue;
      const d = dist(m.x, m.y, b.x, b.y);
      if (d < bd) { second = best; bd = d; best = m; } else if (d < 1.3 && (!second || d < dist(second.x, second.y, b.x, b.y))) second = m;
    }
    if (!best) return;
    if (second && second.side !== best.side) {
      const pa = best.a.phy + best.a.dri, pb = second.a.phy + second.a.def;
      if (this.rng.chance(pb / (pa + pb) * 0.8)) best = second;
    }
    if (best.side !== b.lastSide && best.role !== 'GK') { best.r.ints++; this.stats[best.side].interceptions++; }
    this.gain(best);
  }

  outOfPlay(lastSide) {
    const b = this.ball;
    const other = 1 - lastSide;
    if (b.y < 0 || b.y > W) return this.setRestart('throw', other, clamp(b.x, 1, L - 1), b.y < 0 ? 0.3 : W - 0.3, 2.5);
    // linha de fundo
    const atGoalOf = b.x > L ? 1 : 0; // lado que defende esse gol
    if (lastSide === atGoalOf) return this.setRestart('corner', other, b.x > L ? L : 0, b.y < W / 2 ? 0 : W, 3);
    this.setRestart('goalkick', atGoalOf, atGoalOf === 1 ? L - 5.5 : 5.5, W / 2, 3);
  }

  /* ---------- posicionamento coletivo ---------- */
  computeTargets() {
    const b = this.ball;
    for (const T of this.teams) for (const p of T.on) p.pressing = false;
    const owner = b.owner, fl = b.flight;
    const attSide = owner ? owner.side : fl ? fl.from.side : this.restart ? this.restart.side : b.lastSide;
    for (const T of this.teams) {
      const s = T.side, att = attSide === s;
      const bx = this.fX(s, b.x), by = this.fY(s, b.y);
      const tac = T.tactics, st = STYLES[tac.style], m = tac.mentality;
      const push = m * 0.035 + (st.deep || 0);
      const lineV = LINES[tac.line].v;
      // linha do último defensor adversário (referência simples de impedimento)
      const O = this.teams[1 - s];
      const offLine = this.offsideLine(s);
      const hasF9 = T.on.some(p => !p.off && this.ins(p)?.drop);
      const wideK = Math.pow(st.wide, 0.35);
      for (const p of T.on) {
        if (p.off) continue;
        if (p === owner) {
          const dir = s === 0 ? 1 : -1;
          const pf = this.fX(s, p.x);
          p.tx = clamp(p.x + dir * 8, 1, L - 1);
          if (pf > 0.86) p.tx = this.toX(s, Math.min(pf, 0.84));
          p.ty = p.y + (W / 2 - p.y) * (pf > 0.7 ? 0.25 : 0.08);
          continue;
        }
        if (fl && fl.res && (fl.res.to === p || fl.res.by === p)) { p.tx = fl.ex; p.ty = fl.ey; continue; }
        const sl = T.slots[p.slot] || T.slots[1];
        let tx, ty;
        const wob = Math.sin(this.total * 0.35 + p.wob) * 0.012;
        p.dive = 0;
        if (p.role === 'GK') {
          tx = 0.035 + clamp((bx - 0.5) * 0.06, -0.02, 0.03) + (this.ins(p)?.gkHigh ? 0.04 + Math.max(0, bx - 0.5) * 0.1 : 0);
          ty = 0.5 + (by - 0.5) * 0.28;
          if (fl && fl.kind === 'shot' && fl.from.side !== s) { // goleiro reage à finalização (mergulho)
            const save = fl.res.outcome === 'save';
            const gyW = save ? fl.ey : (fl.ey + W / 2) / 2;
            ty = this.fY(s, gyW);
            tx = 0.012;
            if (Math.abs(gyW - p.y) > 1) p.dive = gyW > p.y ? 1 : -1;
          }
        } else if (this.restart && this.restart.kind === 'kickoff' && this.restart.celebrate && this.restart.wait > 6) {
          // comemoração: o autor corre para a bandeirinha, os companheiros vão atrás
          const c = this.restart.celebrate;
          if (c.side === s) {
            const fx = 0.96, fy = this.fY(s, c.scorer.y) < 0.5 ? 0.05 : 0.95;
            if (p === c.scorer) { tx = fx; ty = fy; }
            else { const k = (p.wob % 1); tx = fx - 0.03 - k * 0.04; ty = fy + (fy < 0.5 ? 1 : -1) * (0.03 + k * 0.06); }
          } else { tx = Math.min(0.42, sl.x * 0.8); ty = sl.y; }
        } else if (this.restart && this.restart.kind === 'kickoff') {
          tx = Math.min(0.46, sl.x * 0.78); ty = sl.y;
        } else if (att) {
          const k = sl.x < 0.3 ? 0.55 : 1;
          tx = sl.x + 0.07 * k + (bx - 0.45) * 0.42 * k + push * k + wob;
          if (isFwdRole(p.role) || p.role === 'CM') tx = Math.min(tx, offLine - 0.006);
          ty = 0.5 + (sl.y - 0.5) * 1.12 * wideK + (by - 0.5) * 0.15;
          // infiltração: atacantes alternam corridas nas costas da defesa
          if ((p.role === 'ST' || p.role === 'LW' || p.role === 'RW') && owner && owner.side === s && bx > 0.35 && Math.sin(this.total * 0.45 + p.wob * 2) > 0.7) tx = offLine + 0.04;
          // ponta do lado oposto ataca a segunda trave
          if ((p.role === 'LW' || p.role === 'RW') && bx > 0.6 && ((sl.y < 0.5 && by > 0.6) || (sl.y > 0.5 && by < 0.4))) { tx = Math.min(offLine - 0.008, 0.9); ty = sl.y < 0.5 ? 0.38 : 0.62; }
          // meias chegam de trás na área em parte das jogadas
          if ((p.role === 'CM' || p.role === 'AM') && owner && owner.side === s && bx > 0.62 && Math.sin(this.total * 0.37 + p.wob * 3) > 0.45) { tx = Math.min(offLine - 0.01, 0.86); ty = 0.5 + (sl.y - 0.5) * 0.5; }
          // laterais apoiam por fora quando a bola está no seu lado
          const iA = this.ins(p);
          if ((p.role === 'LB' || p.role === 'RB') && !iA?.hold && !iA?.inside && bx > 0.5 && (iA?.overlap || (sl.y < 0.5 && by < 0.45) || (sl.y > 0.5 && by > 0.55))) {
            tx += 0.16 * (st.wide > 1 ? 1.4 : 1); ty = sl.y < 0.5 ? 0.06 : 0.94;
          }
          // com falso 9, pontas e meias atacam o espaço que ele abre
          if (hasF9 && !iA?.drop && owner && owner.side === s && bx > 0.45 && (p.role === 'LW' || p.role === 'RW' || p.role === 'AM' || p.role === 'CM') && Math.sin(this.total * 0.4 + p.wob * 2.3) > -0.3) { tx = offLine - (p.role === 'CM' ? 0.03 : 0.005); ty = 0.5 + (sl.y - 0.5) * 0.45; }
          if (iA) {
            if (iA.hold) tx = Math.min(tx, Math.max(sl.x + 0.03, bx - 0.08));
            tx += iA.ax || 0;
            if (iA.drop) tx = Math.min(tx, offLine - 0.07);
            if (iA.inside) ty = ty * (1 - iA.inside) + (0.5 + (sl.y - 0.5) * 0.35) * iA.inside;
            if (iA.wide) ty = sl.y < 0.5 ? 0.04 : 0.96;
            if (iA.run && owner && owner.side === s && bx > 0.3 && Math.sin(this.total * 0.45 + p.wob * 2) > 0.7 - iA.run * 2) tx = offLine + 0.04;
            if (iA.box && owner && owner.side === s && bx > 0.55 && Math.sin(this.total * 0.37 + p.wob * 3) > 0.45 - iA.box) { tx = Math.min(offLine - 0.01, 0.87); ty = 0.5 + (sl.y - 0.5) * 0.4; }
            if (iA.roam) { ty += Math.sin(this.total * 0.21 + p.wob) * 0.18; tx += Math.cos(this.total * 0.17 + p.wob) * 0.05; }
          }
        } else {
          tx = sl.x * 0.9 + (bx - 0.5) * 0.38 - 0.02 + push * 0.6 + (isDefRole(p.role) ? lineV : lineV * 0.5) + wob;
          ty = 0.5 + (sl.y - 0.5) * 0.82 + (by - 0.5) * 0.3;
          tx += this.ins(p)?.dx || 0;
          tx = Math.max(tx, isDefRole(p.role) ? 0.07 : 0.13); // linha não afunda dentro do gol
          if (bx < 0.36) { // bloco baixo: fecha o corredor entre a bola e o gol
            const k = (0.36 - bx) / 0.36;
            const gyF = 0.5 + (sl.y - 0.5) * 0.45;
            tx = tx * (1 - k * 0.5) + (bx * 0.55 + 0.03) * k * 0.5;
            ty = ty * (1 - k * 0.6) + (gyF + (by - 0.5) * 0.45) * k * 0.6;
          }
        }
        p.tx = this.toX(s, clamp(tx, 0.02, 0.97));
        p.ty = this.toY(s, clamp(ty, 0.03, 0.97));
      }
      // pressão sobre a bola / disputa de bola solta
      if (!this.restart && (!att || (!owner && !fl))) {
        const pr = PRESS[tac.press];
        const tx = fl ? fl.ex : b.x, ty = fl ? fl.ey : b.y;
        const n = !owner && !fl ? 2 : pr.n;
        const picked = [];
        for (let i = 0; i < n; i++) {
          let bp = null, bd = 1e9;
          for (const p of T.on) {
            if (p.off || p.role === 'GK' || picked.includes(p) || (fl && fl.res && fl.res.by === p)) continue;
            const d = dist(p.x, p.y, tx, ty); if (d < bd) { bd = d; bp = p; }
          }
          if (!bp) break;
          picked.push(bp);
          if (i === 0 ? bd < 32 : bd < pr.r) { bp.tx = tx; bp.ty = ty; bp.pressing = true; }
        }
        for (const p of T.on) if (!p.off && !p.pressing && this.ins(p)?.press && dist(p.x, p.y, tx, ty) < 14) { p.tx = tx; p.ty = ty; p.pressing = true; }
      }
      // restante: marcação aproximada do adversário mais próximo
      if (!att && owner) for (const p of T.on) {
        if (p.off || p.role === 'GK' || p.pressing) continue;
        let near = null, nd = 12;
        for (const o of O.on) { if (o.off || o === owner) continue; const d = dist(o.x, o.y, p.tx, p.ty); if (d < nd) { nd = d; near = o; } }
        if (near) {
          const gx = this.goalX(1 - s);
          p.tx = p.tx * 0.55 + (near.x + (gx - near.x) * 0.1) * 0.45;
          p.ty = p.ty * 0.55 + near.y * 0.45;
        }
      }
      // linha defensiva única (permite a armadilha do impedimento)
      if (!att && owner && !this.restart) {
        const defs = T.on.filter(p => !p.off && isDefRole(p.role) && !p.pressing);
        if (defs.length >= 2) {
          const lx = defs.reduce((a, p) => a + this.fX(s, p.tx), 0) / defs.length;
          for (const p of defs) p.tx = this.toX(s, this.fX(s, p.tx) * 0.25 + lx * 0.75);
        }
      }
      // barreira na falta frontal
      if (this.restart && this.restart.kind === 'fkshot' && this.restart.side !== s) {
        const r = this.restart, gx = this.goalX(r.side);
        const d = dist(r.x, r.y, gx, W / 2) || 1;
        const wx = r.x + (gx - r.x) / d * 9.15, wy = r.y + (W / 2 - r.y) / d * 9.15;
        T.on.filter(p => !p.off && p.role !== 'GK').sort((a, c) => dist(a.x, a.y, wx, wy) - dist(c.x, c.y, wx, wy)).slice(0, 4)
          .forEach((p, i) => { p.tx = wx; p.ty = wy + (i - 1.5) * 0.9; });
      }
      // goleiro com a bola segura: time se abre para a reposição
      if (this.restart && this.restart.side === s && this.restart.kind === 'corner') {
        const gx = this.goalX(s);
        T.on.filter(p => !p.off && (p.role === 'CB' || isFwdRole(p.role))).forEach((p, i) => { p.tx = gx - (s === 0 ? 1 : -1) * (5 + (i % 3) * 3.5); p.ty = W / 2 + ((i % 4) - 1.5) * 4.5; });
      }
      if (this.restart && this.restart.side !== s && this.restart.kind === 'corner') {
        const gx = this.goalX(1 - s);
        T.on.filter(p => !p.off && p.role !== 'GK').slice(0, 7).forEach((p, i) => { p.tx = gx - (s === 0 ? -1 : 1) * (4 + (i % 3) * 3); p.ty = W / 2 + ((i % 4) - 1.5) * 4; });
      }
      if (this.restart && this.restart.kind === 'penalty') {
        const gx = this.goalX(this.restart.side);
        T.on.filter(p => !p.off && p.role !== 'GK').forEach((p, i) => { p.tx = gx - (this.restart.side === 0 ? 1 : -1) * (20 + (i % 3) * 2); p.ty = W / 2 + (i - 5) * 3; });
      }
    }
  }

  movePlayers() {
    for (const T of this.teams) {
      const drainK = PRESS[T.tactics.press].drain * (1 + Math.max(0, T.tactics.mentality) * 0.03);
      for (const p of T.on) {
        p.px = p.x; p.py = p.y;
        if (p.off) continue;
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
        const max = (5.9 + p.a.pac * 0.02) * p.eff * (p === this.ball.owner ? (p.blocked ? 0.3 : 0.8) : 1) * (p.dive ? 1.9 : 1);
        let sp = 0;
        if (d > 0.35) {
          sp = d > 9 || p.pressing ? max : max * (0.45 + 0.55 * d / 9);
          const step = Math.min(d, sp * DT);
          p.x += dx / d * step; p.y += dy / d * step;
        }

        const drain = DT * CLOCK * (0.0035 + 0.0013 * sp) * (1.45 - p.a.sta / 100) * drainK * (this.ins(p)?.drain || 1);
        p.energy = Math.max(20, p.energy - drain);
      }
    }
  }

  /* ---------- replays ---------- */
  recordFrame() {
    if (Math.round(this.total / DT) % 2) return; // a cada 0,5 s
    const fr = { b: [this.ball.x, this.ball.y, this.ball.z], p: [] };
    for (const T of this.teams) for (const m of T.on) fr.p.push([m.x, m.y, T.side, m.p.num]);
    this.frames.push(fr);
    if (this.frames.length > 24) this.frames.shift();
    if (this.pendingReplay) {
      this.pendingReplay.frames.push(fr);
      if (--this.pendingReplay.left <= 0) this.pendingReplay = null;
    }
  }
  captureReplay(kind, ev) {
    if (!this.record) return;
    const rp = { kind, ev, frames: this.frames.slice(-18), left: 4 };
    this.replays.push(rp);
    this.pendingReplay = rp;
  }

  /* ---------- encerramento e notas ---------- */
  rate(m, T) {
    const r = m.r, diff = this.score[T.side] - this.score[1 - T.side];
    let v = 6.0 + r.goals * 1.05 + r.assists * 0.7 + r.key * 0.18 + Math.min(1, r.passesOk * 0.025) + r.tackles * 0.14 + r.ints * 0.1 + r.saves * 0.3 - r.conceded * (m.role === 'GK' ? 0.3 : 0) - r.lost * 0.035 - r.fouls * 0.05 + diff * 0.15;
    if (isDefRole(m.role) || m.role === 'GK') v -= this.score[1 - T.side] * 0.12;
    if (m.off && m.minOut) v -= 1.2;
    return clamp(Math.round(v * 10) / 10, 3, 10);
  }
  // destaques ao vivo (aba do painel lateral)
  liveRatings() {
    const out = [];
    for (const T of this.teams) for (const m of T.used) out.push({ m, side: T.side, rating: this.rate(m, T) });
    return out.sort((a, b) => b.rating - a.rating);
  }

  finish() {
    const ratings = [];
    for (const T of this.teams) {
      for (const m of T.used) {
        const r = m.r;
        const min = (m.minOut ?? 90) - (m.minIn || 0);
        const v = this.rate(m, T);
        m.rating = v; m.mins = Math.max(1, min);
        ratings.push({ id: m.p.id, side: T.side, name: m.p.name, num: m.p.num, role: m.role, rating: v, mins: m.mins, goals: r.goals, assists: r.assists, saves: r.saves, energy: Math.round(m.energy), yellow: m.yellow, red: m.off, injured: m.injured ? m.injuryDays : 0 });
      }
    }
    ratings.sort((a, b) => b.rating - a.rating);
    this.ratings = ratings;
    this.motm = ratings[0];
  }

  // resumo serializável (vai para o save)
  result() {
    const tot = this.stats[0].poss + this.stats[1].poss || 1;
    return {
      score: this.score.slice(),
      stats: this.stats.map(s => ({ ...s, possPct: Math.round(s.poss / tot * 100), xg: Math.round(s.xg * 100) / 100 })),
      events: this.events.filter(e => ['goal', 'card', 'injury', 'sub', 'penalty'].includes(e.type)).map(e => ({ type: e.type, min: e.min, side: e.side, name: e.name, assistName: e.assistName, card: e.card, player: e.player, assist: e.assist, inName: e.inName, outName: e.outName, days: e.days })),
      ratings: this.ratings,
      motm: this.motm,
      tactics: this.tacticLog.slice()
    };
  }
}
