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
  // XP de perfil dos jogos persistentes. O jogo só relata o evento (ex.: entrega com ID único);
  // o valor vem daqui (cada evento conta uma única vez). PRODUÇÃO: validar no servidor.
  persistentXp: {
    'rail-atlas': {
      cargo_delivered: { common: 2, medium: 4, international: 8, special: 12 },
      achievement_unlocked: { achievement: 20 },
      labels: { common: 'Entrega comum', medium: 'Entrega de média distância', international: 'Entrega internacional', special: 'Contrato especial', achievement: 'Conquista inédita' }
    },
    'club-legacy': {
      first_win: { first: 20 },
      match_win: { common: 3 },
      five_matches: { common: 10 },
      season_complete: { common: 40 },
      promotion: { common: 60 },
      league_title: { serie_b: 100, serie_a: 150, foreign: 120 },
      cup_title: { common: 80 },
      continental_title: { common: 150 },
      achievement_unlocked: { achievement: 20 },
      weekly_challenge: { common: 50 },
      friendly_win: { common: 5 },
      labels: { first_win: 'Primeira vitória da carreira', match_win: 'Vitória (até 15 por temporada)', five_matches: 'A cada 5 partidas', season_complete: 'Temporada completa', promotion: 'Acesso à Série A', league_title: 'Título da Série B / Série A / liga estrangeira', cup_title: 'Copa Nacional', continental_title: 'Copa Continental (conquista internacional)', achievement_unlocked: 'Conquista inédita', weekly_challenge: 'Desafio semanal da comunidade', friendly_win: 'Vitória em amistoso multiplayer (1x por adversário/dia)' }
    }
  },
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
    territorio:  { label: 'Área conquistada', calc: s => Math.min(300, Math.round(s / 5)) },
    snake:       { label: 'Pontos na partida (1 XP a cada 4)', calc: s => Math.min(250, Math.floor(s / 4)) },
    flappy:      { label: 'Canos ultrapassados (6 XP cada)', calc: s => Math.min(250, s * 6) },
    tetra:       { label: 'Pontos na partida (1 XP a cada 15)', calc: s => Math.min(350, Math.floor(s / 15)) },
    calculo:     { label: 'Pontos na partida (1 XP a cada 3)', calc: s => Math.min(200, Math.floor(s / 3)) },
    minado:      { label: 'Dificuldade do campo', calc: (s, x) => [20, 45, 90][x?.tier || 0] },
    deslizante:  { label: 'Tamanho do quebra-cabeça', calc: (s, x) => [15, 35, 70][x?.tier || 0] },
    lights:      { label: 'Tamanho da grade', calc: (s, x) => [15, 35, 70][x?.tier || 0] },
    kakuro:      { label: 'Dificuldade do Kakuro', calc: (s, x) => [40, 80, 140][x?.tier || 0] },
    mahjong:     { label: 'Tabuleiro limpo', calc: () => 70 },
    paciencia:   { label: 'Jogo vencido', calc: () => 60 }
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
    { id: 'ice',      name: 'Gelo',        price: 200 },
    { id: 'ocean',    name: 'Oceano',      price: 200 },
    { id: 'forest',   name: 'Floresta',    price: 250 },
    { id: 'shadow',   name: 'Sombra',      price: 300 },
    { id: 'flame',    name: 'Chamas',      price: 350 },
    { id: 'neon',     name: 'Neon',        price: 400 },
    { id: 'royal',    name: 'Realeza',     price: 600 },
    { id: 'rainbow',  name: 'Arco-íris',   price: 700 },
    { id: 'plusultra', name: 'Herói', price: 450 },
    { id: 'akame',    name: 'Assassina', price: 450 },
    { id: 'curse',    name: 'Energia Sombria', price: 500 },
    { id: 'hashira',  name: 'Caçador', price: 450 },
    { id: 'chakra',   name: 'Ninja', price: 450 },
    { id: 'sakura',   name: 'Sakura (Kawaii)', price: 300 },
    { id: 'saiyajin', name: 'Guerreiro Dourado', price: 600 },
    { id: 'emerald',  name: 'Esmeralda',   prestige: 1 },
    { id: 'sapphire', name: 'Safira',      prestige: 2 },
    { id: 'gold',     name: 'Dourada',     prestige: 3 },
    { id: 'ruby',     name: 'Rubi',        prestige: 4 },
    { id: 'cosmic',   name: 'Cósmica',     prestige: 5 }
  ],
  avatarIcons: ['cat', 'dog', 'rabbit', 'bird', 'fish', 'ghost', 'rocket', 'crown', 'gamepad-2', 'star', 'zap', 'flame', 'leaf', 'skull', 'bot', 'snail', 'sword', 'shield', 'heart', 'moon', 'sun', 'cloud', 'gem', 'trophy', 'music', 'pizza', 'coffee', 'smile', 'flower-2', 'anchor', 'car', 'plane', 'bug', 'cookie', 'candy', 'dumbbell', 'apple', 'cherry', 'carrot', 'orbit', 'sparkles', 'wand-2', 'palette', 'turtle', 'squirrel', 'origami', 'swords', 'eye', 'wind', 'droplets', 'snowflake', 'axe', 'crosshair', 'flame-kindling', 'heart-handshake', 'drama', 'ghost', 'venetian-mask', 'wand-sparkles', 'hand-metal', 'crown'],
  freeIcons: 6, iconPrice: 80,
  avatarColors: ['#6c4cf5', '#ff7a45', '#2a8bd8', '#14a37f', '#ef4565', '#f2a516', '#a24cf5', '#232035', '#0ea5a4', '#d9468f'],
  // Cores do aplicativo (loja): `color` no tema claro, `dark` no escuro, `on` = texto sobre botões da cor
  appColors: [
    { id: 'violet',     name: 'Violeta',      color: '#6c4cf5', dark: '#8b70ff', on: '#ffffff', price: 0 },
    { id: 'green-dark', name: 'Verde escuro', color: '#166534', dark: '#2fa35e', on: '#ffffff', price: 150 },
    { id: 'green-light', name: 'Verde claro', color: '#3fb950', dark: '#5ee08a', on: '#06240f', price: 150 },
    { id: 'mint',       name: 'Verde menta',  color: '#2fcf9f', dark: '#5eead4', on: '#06302a', price: 150 },
    { id: 'lime',       name: 'Limão',        color: '#84cc16', dark: '#a3e635', on: '#1a2e05', price: 150 },
    { id: 'ocean',      name: 'Azul oceano',  color: '#2563eb', dark: '#60a5fa', on: '#ffffff', price: 150 },
    { id: 'sky',        name: 'Azul céu',     color: '#0ea5e9', dark: '#38bdf8', on: '#04283d', price: 150 },
    { id: 'teal',       name: 'Turquesa',     color: '#0d9488', dark: '#2dd4bf', on: '#ffffff', price: 150 },
    { id: 'rose',       name: 'Rosa',         color: '#ec4899', dark: '#f472b6', on: '#ffffff', price: 200 },
    { id: 'red',        name: 'Vermelho',     color: '#e11d48', dark: '#fb7185', on: '#ffffff', price: 200 },
    { id: 'orange',     name: 'Laranja',      color: '#f97316', dark: '#fb923c', on: '#2b1103', price: 200 },
    { id: 'amber',      name: 'Âmbar',        color: '#d4a017', dark: '#facc15', on: '#2b2002', price: 200 },
    { id: 'purple',     name: 'Roxo escuro',  color: '#5b21b6', dark: '#a78bfa', on: '#ffffff', price: 250 },
    { id: 'lilac',      name: 'Lilás',        color: '#a855f7', dark: '#c084fc', on: '#ffffff', price: 250 },
    { id: 'slate',      name: 'Grafite',      color: '#475569', dark: '#94a3b8', on: '#ffffff', price: 250 }
  ],
  cardThemes: [
    { id: 'violet', name: 'Violeta',    color: '#6c4cf5', price: 0 },
    { id: 'sunset', name: 'Pôr do sol', color: '#ff7a45', price: 120 },
    { id: 'ocean',  name: 'Oceano',     color: '#2a8bd8', price: 120 },
    { id: 'mint',   name: 'Menta',      color: '#14a37f', price: 120 },
    { id: 'berry',  name: 'Frutas vermelhas', color: '#d9468f', price: 200 },
    { id: 'gold',   name: 'Ouro',       color: '#d99a00', price: 350 },
    { id: 'night',  name: 'Noite',      color: '#232035', price: 250 },
    { id: 'forest', name: 'Floresta',   color: '#16a34a', price: 120 },
    { id: 'rose',   name: 'Rosa',       color: '#f43f5e', price: 120 },
    { id: 'grape',  name: 'Uva',        color: '#7c3aed', price: 150 },
    { id: 'teal',   name: 'Turquesa',   color: '#0d9488', price: 150 },
    { id: 'sky',    name: 'Céu',        color: '#38bdf8', price: 150 },
    { id: 'cherry', name: 'Cereja',     color: '#be123c', price: 200 },
    { id: 'sand',   name: 'Areia',      color: '#b45309', price: 200 },
    { id: 'graphite', name: 'Grafite',  color: '#475569', price: 250 },
    { id: 'aurora', name: 'Aurora',     color: '#10b981', price: 450 },
    { id: 'bnha',   name: 'Herói Verde e Vermelho',   color: 'linear-gradient(135deg, #16a34a, #dc2626)', price: 300 },
    { id: 'akame',  name: 'Assassina da Noite',              color: 'linear-gradient(135deg, #7f1d1d, #111827)', price: 300 },
    { id: 'jjk',    name: 'Energia Sombria',              color: 'linear-gradient(135deg, #312e81, #7c3aed 60%, #0ea5e9)', price: 300 },
    { id: 'kny',    name: 'Caçador de Sombras',            color: 'linear-gradient(135deg, #0f766e, #111827)', price: 300 },
    { id: 'naruto', name: 'Ninja da Vila',    color: 'linear-gradient(135deg, #f97316, #1e3a8a)', price: 300 },
    { id: 'onepiece', name: 'Alto-mar',    color: 'linear-gradient(135deg, #0ea5e9, #fde047)', price: 300 },
    { id: 'dbz',    name: 'Guerreiro Lendário',       color: 'linear-gradient(135deg, #f59e0b, #ea580c)', price: 300 },
    { id: 'aot',    name: 'Fortaleza',  color: 'linear-gradient(135deg, #78716c, #166534)', price: 300 },
    { id: 'csm',    name: 'Demônio Vermelho',                color: 'linear-gradient(135deg, #dc2626, #1c1917)', price: 300 },
    { id: 'deathnote', name: 'Caderno Sombrio',               color: 'linear-gradient(135deg, #111827, #6b7280)', price: 300 },
    { id: 'kawaii', name: 'Kawaii · Waifu',              color: 'linear-gradient(135deg, #f472b6, #c084fc)', price: 250 },
    { id: 'sakuracard', name: 'Sakura · Primavera',      color: 'linear-gradient(135deg, #f9a8d4, #fb7185)', price: 250 },
    { id: 'shonen', name: 'Shonen · Batalha Épica',      color: 'linear-gradient(135deg, #ea580c, #facc15)', price: 250 },
    { id: 'isekai', name: 'Isekai · Outro Mundo',        color: 'linear-gradient(135deg, #2563eb, #a855f7 55%, #ec4899)', price: 350 }
  ],
  titles: [
    { id: 'novato',    name: 'Novato',           price: 0 },
    { id: 'alquimista', name: 'Alquimista',      price: 200 },
    { id: 'rei_velha', name: 'Rei da Velha',     price: 250 },
    { id: 'duelista',  name: 'Duelista',         price: 250 },
    { id: 'mestre2048', name: 'Mestre do 2048',  price: 300 },
    { id: 'lenda',     name: 'Lenda do Arcade',  price: 1000 },
    { id: 'sem_pressa', name: 'Sem Pressa',      price: 150 },
    { id: 'madrugador', name: 'Madrugador',      price: 150 },
    { id: 'insone',    name: 'Insone',           price: 200 },
    { id: 'sortudo',   name: 'Sortudo',          price: 250 },
    { id: 'cacador',   name: 'Caçador de Recordes', price: 300 },
    { id: 'estrela',   name: 'Estrela Cadente',  price: 300 },
    { id: 'estrategista', name: 'Estrategista',  price: 350 },
    { id: 'genio',     name: 'Gênio',            price: 400 },
    { id: 'rei_arcade', name: 'Rei do Arcade',   price: 500 },
    { id: 'boss',      name: 'Chefe Final',      price: 800 },
    { id: 'imbativel', name: 'Imbatível',        price: 1200 },
    { id: 'plusultra', name: 'Além do Limite',      price: 250 },
    { id: 'heroi_treino', name: 'Herói em Treinamento', price: 200 },
    { id: 'heroi_n1', name: 'Herói Número 1',    price: 600 },
    { id: 'assassino', name: 'Assassino da Noite', price: 300 },
    { id: 'exorcista', name: 'Exorcista', price: 350 },
    { id: 'maldicao',  name: 'Espírito Maldito', price: 500 },
    { id: 'cacador_dem', name: 'Caçador de Sombras', price: 350 },
    { id: 'hokage',    name: 'Mestre Ninja',           price: 500 },
    { id: 'rei_piratas', name: 'Rei dos Mares', price: 600 },
    { id: 'saiyajin',  name: 'Guerreiro Supremo',   price: 600 },
    { id: 'senpai',    name: 'Senpai',           price: 200 },
    { id: 'kouhai',    name: 'Kouhai',           price: 150 },
    { id: 'nakama',    name: 'Nakama',           price: 200 },
    { id: 'waifu',     name: 'Waifu Supremo',    price: 400 },
    { id: 'husbando',  name: 'Husbando Supremo', price: 400 },
    { id: 'otaku',     name: 'Otaku Raiz',       price: 300 },
    { id: 'protagonista', name: 'Protagonista',  price: 350 },
    { id: 'vilao',     name: 'Vilão Carismático', price: 350 },
    { id: 'arco_treino', name: 'Arco de Treino', price: 150 },
    { id: 'isekai',    name: 'Isekai\'d',       price: 300 }
  ],
  // Duelos "corrida": cada jogador joga a própria partida e comparamos o resultado.
  raceDefaults: { score: { label: 'Quem fizer mais pontos', limit: 120 }, time: { label: 'Quem terminar mais rápido', limit: 180 } }
};
AH.config.avatarIcons = [...new Set(AH.config.avatarIcons)];
