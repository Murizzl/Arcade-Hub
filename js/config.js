/* =========================================================
   Configuração do protótipo.
   Em produção, estas regras devem viver no backend
   (ex.: tabela `xp_rules` no PostgreSQL + Edge Function),
   que valida e concede recompensas de forma autoritativa.
   Nunca coloque chaves privadas aqui.
   ========================================================= */
window.AH = window.AH || {};

AH.config = {
  storageKey: 'arcadehub.v1',
  backend: {
    // Preparado para integração futura (somente chave pública/anon).
    // 'local' | 'supabase'. Para testar offline: localStorage.setItem('arcadehub.forceLocal', '1')
    provider: (() => { try { return localStorage.getItem('arcadehub.forceLocal') ? 'local' : 'supabase'; } catch (e) { return 'supabase'; } })(),
    supabaseUrl: 'https://bvfrafyblkdpbdwoepuh.supabase.co',
    // Chave pública "anon": pode ficar no site. A segurança vem das regras RLS do banco.
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2ZnJhZnlibGtkcGJkd29lcHVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzNjYzNTYsImV4cCI6MjEwODk0MjM1Nn0.djAgLNxYuUtqfJqAvMVvGsQxiTL_tLT1yQ-fD3fObBY'
  },
  maxLevel: 100,
  // Regras genéricas de XP — cada jogo pode sobrescrever em `xpOverrides`.
  xpRules: {
    complete:  { xp: 10,  label: 'Completar uma partida válida' },
    win:       { xp: 25,  label: 'Vencer uma partida' },
    record:    { xp: 40,  label: 'Bater recorde pessoal' },
    daily:     { xp: 100, label: 'Completar desafio diário' },
    duelWin:   { xp: 50,  label: 'Vencer um duelo' }
  },
  coinRules: { complete: 2, win: 5, record: 10, duelWin: 15 },
  // XP extra proporcional ao desempenho na partida (soma às regras acima).
  // PRODUÇÃO: calcular no servidor a partir da partida validada.
  scoreXp: {
    '2048':  { label: 'Pontos na partida (1 XP a cada 25)', calc: s => Math.min(400, Math.floor(s / 25)) },
    memoria: { label: 'Eficiência (menos jogadas = mais XP)', calc: s => Math.max(5, 50 - (s - 8) * 2) },
    pocoes:  { label: 'Dificuldade da fase', calc: (s, x) => [15, 30, 50, 75, 110][x?.tier || 0] },
    porcas:  { label: 'Dificuldade da fase', calc: (s, x) => [15, 30, 50, 75, 110][x?.tier || 0] },
    carros:  { label: 'Dificuldade da fase', calc: (s, x) => [15, 35, 60, 100][x?.tier || 0] },
    helix:   { label: 'Pontos na partida (1 XP a cada 5)', calc: s => Math.min(400, Math.floor(s / 5)) },
    sudoku:  { label: 'Dificuldade do Sudoku', calc: (s, x) => [30, 60, 100, 160][x?.tier || 0] },
    labirinto:   { label: 'Dificuldade da fase', calc: (s, x) => [15, 30, 50, 80][x?.tier || 0] },
    prateleiras: { label: 'Dificuldade da fase', calc: (s, x) => [15, 30, 55, 90][x?.tier || 0] },
    copinhos:    { label: 'Dificuldade da fase', calc: (s, x) => [15, 30, 55, 90][x?.tier || 0] },
    empilhar:    { label: 'Altura da torre (2 XP por bloco)', calc: s => Math.min(300, s * 2) },
    cores:       { label: 'Território conquistado', calc: s => Math.min(120, Math.round(s)) },
    territorio:  { label: 'Área conquistada', calc: s => Math.min(300, Math.round(s / 5)) }
  },
  // XP necessário para subir do nível n para n+1 (crescente).
  xpForLevel(n) { return Math.round(80 + n * 22 + Math.pow(n, 1.45) * 3); },
  divisions: [
    { id: 'bronze',   name: 'Bronze',   min: 0,    color: '#c97f46' },
    { id: 'prata',    name: 'Prata',    min: 1000, color: '#9aa5b8' },
    { id: 'ouro',     name: 'Ouro',     min: 1300, color: '#f2b316' },
    { id: 'platina',  name: 'Platina',  min: 1600, color: '#2bb8b0' },
    { id: 'diamante', name: 'Diamante', min: 1900, color: '#4f8df5' },
    { id: 'mestre',   name: 'Mestre',   min: 2200, color: '#a24cf5' }
  ],
  prestiges: [
    { n: 0,  name: 'Recruta',   color: '#8d88a6', icon: 'shield' },
    { n: 1,  name: 'Bronze I',  color: '#c97f46', icon: 'star' },
    { n: 2,  name: 'Prata II',  color: '#7f8ba0', icon: 'stars' },
    { n: 3,  name: 'Ouro III',  color: '#e0a100', icon: 'crown' },
    { n: 4,  name: 'Esmeralda', color: '#14a37f', icon: 'gem' },
    { n: 5,  name: 'Safira',    color: '#2f6fe0', icon: 'diamond' },
    { n: 6,  name: 'Rubi',      color: '#e0365a', icon: 'flame' },
    { n: 7,  name: 'Cósmico',   color: '#7a3cf0', icon: 'sparkles' },
    { n: 8,  name: 'Lendário',  color: '#1d1a2e', icon: 'trophy' }
  ],
  // Cosméticos. price = custo em moedas (0 = grátis); prestige = exclusivo de prestígio.
  frames: [
    { id: 'none',     name: 'Sem moldura', price: 0 },
    { id: 'basic',    name: 'Simples',     price: 0 },
    { id: 'candy',    name: 'Algodão-doce', price: 150 },
    { id: 'mint',     name: 'Menta',       price: 150 },
    { id: 'sunset',   name: 'Pôr do sol',  price: 300 },
    { id: 'arcade',   name: 'Arcade',      price: 500 },
    { id: 'emerald',  name: 'Esmeralda',   prestige: 1 },
    { id: 'sapphire', name: 'Safira',      prestige: 2 },
    { id: 'gold',     name: 'Dourada',     prestige: 3 },
    { id: 'ruby',     name: 'Rubi',        prestige: 4 },
    { id: 'cosmic',   name: 'Cósmica',     prestige: 5 }
  ],
  avatarIcons: ['cat', 'dog', 'rabbit', 'bird', 'fish', 'ghost', 'rocket', 'crown', 'gamepad-2', 'star', 'zap', 'flame', 'leaf', 'skull', 'bot', 'snail'],
  freeIcons: 6, iconPrice: 80,
  avatarColors: ['#6c4cf5', '#ff7a45', '#2a8bd8', '#14a37f', '#ef4565', '#f2a516', '#a24cf5', '#232035', '#0ea5a4', '#d9468f'],
  cardThemes: [
    { id: 'violet', name: 'Violeta',    color: '#6c4cf5', price: 0 },
    { id: 'sunset', name: 'Pôr do sol', color: '#ff7a45', price: 120 },
    { id: 'ocean',  name: 'Oceano',     color: '#2a8bd8', price: 120 },
    { id: 'mint',   name: 'Menta',      color: '#14a37f', price: 120 },
    { id: 'berry',  name: 'Frutas vermelhas', color: '#d9468f', price: 200 },
    { id: 'gold',   name: 'Ouro',       color: '#d99a00', price: 350 },
    { id: 'night',  name: 'Noite',      color: '#232035', price: 250 }
  ],
  titles: [
    { id: 'novato',    name: 'Novato',           price: 0 },
    { id: 'alquimista', name: 'Alquimista',      price: 200 },
    { id: 'rei_velha', name: 'Rei da Velha',     price: 250 },
    { id: 'duelista',  name: 'Duelista',         price: 250 },
    { id: 'mestre2048', name: 'Mestre do 2048',  price: 300 },
    { id: 'lenda',     name: 'Lenda do Arcade',  price: 1000 }
  ],
  // Duelos "corrida": cada jogador joga a própria partida e comparamos o resultado.
  raceDefaults: { score: { label: 'Quem fizer mais pontos', limit: 120 }, time: { label: 'Quem terminar mais rápido', limit: 180 } }
};
