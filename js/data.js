/* =========================================================
   Dados demonstrativos (seed). Em produção viriam do banco.
   ========================================================= */
(function () {
  const PAT = {
    dots: 'radial-gradient(#fff 2px, transparent 2.5px)',
    grid: 'linear-gradient(#fff 1.5px, transparent 1.5px), linear-gradient(90deg, #fff 1.5px, transparent 1.5px)',
    stripes: 'repeating-linear-gradient(45deg, #fff 0 6px, transparent 6px 18px)',
    checks: 'conic-gradient(#fff 25%, transparent 0 50%, #fff 0 75%, transparent 0)'
  };
  const PAT_SIZE = { dots: '18px 18px', grid: '24px 24px', stripes: 'auto', checks: '28px 28px' };

  AH.categories = [
    { id: 'todos', name: 'Todos', icon: 'layout-grid' },
    { id: 'puzzle', name: 'Puzzle', icon: 'puzzle' },
    { id: 'estrategia', name: 'Estratégia', icon: 'brain' },
    { id: 'arcade', name: 'Arcade', icon: 'joystick' },
    { id: 'cartas', name: 'Cartas', icon: 'spade' },
    { id: 'tabuleiro', name: 'Tabuleiro', icon: 'grid-3x3' },
    { id: 'matematica', name: 'Matemática', icon: 'calculator' },
    { id: 'multiplayer', name: 'Multiplayer', icon: 'users' }
  ];

  // playable: possui implementação jogável neste protótipo
  // duel: compatível com duelos
  const g = (id, name, cats, icon, c1, c2, pat, extra) => Object.assign({
    id, name, cats, icon, c1, c2, pat: PAT[pat], patSize: PAT_SIZE[pat],
    playable: false, duel: false, isNew: false, popularity: 50, players: 1000,
    desc: '', scoreLabel: 'Pontos', scoreDir: 'high'
  }, extra);

  AH.games = [
    g('2048', '2048', ['puzzle', 'matematica'], 'hash', '#f59e0b', '#fbbf24', 'grid',
      { playable: true, popularity: 98, players: 48210, desc: 'Deslize as peças e junte números iguais até alcançar o bloco 2048. Simples de aprender, difícil de largar.' }),
    g('velha', 'Jogo da Velha', ['tabuleiro', 'estrategia', 'multiplayer'], 'hash', '#6c4cf5', '#8f75ff', 'checks',
      { playable: true, duel: true, popularity: 92, players: 39120, desc: 'O clássico X contra O. Enfrente a CPU em três dificuldades ou desafie amigos em duelos.', scoreLabel: 'Vitórias' }),
    g('memoria', 'Memória', ['puzzle', 'cartas'], 'layers', '#ef4565', '#ff7a95', 'dots',
      { playable: true, popularity: 88, players: 27450, desc: 'Vire as cartas e encontre todos os pares com o menor número de jogadas possível.', scoreLabel: 'Jogadas', scoreDir: 'low' }),
    g('ppt', 'Pedra, Papel e Tesoura', ['arcade', 'multiplayer'], 'hand', '#14a37f', '#3fd0a6', 'stripes',
      { playable: true, duel: true, isNew: true, popularity: 80, players: 22100, desc: 'Melhor de cinco rodadas contra a CPU. Leia o adversário e garanta a vitória.', scoreLabel: 'Vitórias' }),
    g('pocoes', 'Separar Poções', ['puzzle'], 'flask-round', '#7c3aed', '#22d3ee', 'dots',
      { playable: true, isNew: true, popularity: 91, players: 17600, desc: 'Despeje as poções de um frasco para outro até cada frasco ficar com uma única cor. Centenas de fases em 5 dificuldades — do Fácil ao Extra Difícil.', scoreLabel: 'Fase', scoreDir: 'high' }),
    g('sudoku', 'Sudoku', ['puzzle', 'matematica'], 'grid-3x3', '#2a8bd8', '#5fb0f0', 'grid',
      { playable: true, popularity: 90, players: 35800, desc: 'Preencha a grade 9×9 para que cada linha, coluna e bloco contenha os números de 1 a 9. Quatro dificuldades: Fácil, Médio, Difícil e Expert.', scoreLabel: 'Tempo (s)', scoreDir: 'low' }),
    g('porcas', 'Porcas e Parafusos', ['puzzle'], 'hexagon', '#475569', '#f59e0b', 'grid',
      { playable: true, isNew: true, popularity: 93, players: 15400, desc: 'Desrosqueie as porcas e organize cada parafuso com uma única cor. Fases infinitas em 5 dificuldades.', scoreLabel: 'Fase' }),
    g('carros', 'Saia da Vaga', ['puzzle', 'estrategia'], 'car', '#ef4444', '#facc15', 'grid',
      { playable: true, isNew: true, popularity: 86, players: 12900, desc: 'Arraste os carros e caminhões para abrir caminho e tirar o carro vermelho do estacionamento.', scoreLabel: 'Fase' }),
    g('helix', 'Torre Espiral', ['arcade'], 'tornado', '#0ea5e9', '#f472b6', 'stripes',
      { playable: true, isNew: true, popularity: 95, players: 20300, desc: 'Gire a torre e faça a bolinha cair pelos buracos. Evite as partes vermelhas e encadeie quedas para quebrar plataformas.' }),
    g('snake', 'Snake', ['arcade'], 'worm', '#22a45d', '#5bd18b', 'checks',
      { popularity: 94, players: 41200, desc: 'Guie a cobrinha, coma as frutas e cresça sem bater em si mesma.' }),
    g('minado', 'Campo Minado', ['puzzle', 'estrategia'], 'bomb', '#475569', '#7b8aa0', 'grid',
      { popularity: 85, players: 26700, desc: 'Use a lógica para revelar o campo sem detonar nenhuma mina.', scoreLabel: 'Tempo', scoreDir: 'low' }),
    g('xadrez', 'Xadrez', ['tabuleiro', 'estrategia', 'multiplayer'], 'crown', '#3b2f63', '#6b5aa8', 'checks',
      { duel: true, popularity: 87, players: 30100, desc: 'O jogo dos reis. Planeje, ataque e dê xeque-mate.' }),
    g('damas', 'Damas', ['tabuleiro', 'estrategia', 'multiplayer'], 'circle-dot', '#b45309', '#e08a3c', 'checks',
      { duel: true, popularity: 76, players: 18400, desc: 'Capture todas as peças adversárias e promova suas damas.' }),
    g('conecta4', 'Conecta 4', ['tabuleiro', 'estrategia', 'multiplayer'], 'circle', '#dc2626', '#f6c23e', 'dots',
      { duel: true, popularity: 82, players: 21900, desc: 'Alinhe quatro fichas da sua cor antes do adversário.' }),
    g('pong', 'Pong', ['arcade', 'multiplayer'], 'radio', '#0f172a', '#334155', 'stripes',
      { duel: true, popularity: 70, players: 14300, desc: 'O avô dos videogames. Rebata a bola e marque pontos.' }),
    g('deslizante', 'Quebra-cabeça Deslizante', ['puzzle'], 'move', '#0ea5a4', '#4fd1c5', 'grid',
      { popularity: 66, players: 11200, desc: 'Deslize as peças até colocá-las na ordem certa.', scoreLabel: 'Movimentos', scoreDir: 'low' }),
    g('paciencia', 'Paciência', ['cartas'], 'spade', '#15803d', '#4ade80', 'dots',
      { popularity: 84, players: 25600, desc: 'O clássico jogo de cartas solitário. Organize os naipes do Ás ao Rei.' }),
    g('blackjack', 'Vinte e Um', ['cartas'], 'club', '#7f1d1d', '#c2410c', 'stripes',
      { popularity: 73, players: 16700, desc: 'Chegue o mais perto possível de 21 sem estourar.' }),
    g('tetra', 'Blocos Caindo', ['arcade', 'puzzle'], 'blocks', '#7c3aed', '#c084fc', 'grid',
      { isNew: true, popularity: 89, players: 9800, desc: 'Encaixe as peças e limpe linhas antes que a pilha chegue ao topo.' }),
    g('calculo', 'Cálculo Rápido', ['matematica', 'arcade'], 'calculator', '#db2777', '#f472b6', 'dots',
      { isNew: true, popularity: 61, players: 6200, desc: 'Resolva o máximo de contas que conseguir em 60 segundos.' }),
    g('kakuro', 'Kakuro', ['matematica', 'puzzle'], 'sigma', '#9333ea', '#d8b4fe', 'grid',
      { popularity: 48, players: 3900, desc: 'Palavras cruzadas com números: some para completar a grade.' }),
    g('batalha', 'Batalha Naval', ['tabuleiro', 'estrategia', 'multiplayer'], 'anchor', '#1e40af', '#60a5fa', 'grid',
      { isNew: true, popularity: 78, players: 12500, desc: 'Posicione sua frota e afunde os navios inimigos.' }),
    g('flappy', 'Pássaro Saltitante', ['arcade'], 'bird', '#0284c7', '#fde047', 'stripes',
      { popularity: 81, players: 19900, desc: 'Toque para voar entre os canos. Quanto mais longe, melhor.' }),
    g('domino', 'Dominó', ['tabuleiro', 'multiplayer'], 'dice-6', '#57534e', '#a8a29e', 'dots',
      { popularity: 69, players: 13400, desc: 'Combine as pedras pelas pontas e seja o primeiro a bater.' }),
    g('lights', 'Apaga Luzes', ['puzzle', 'estrategia'], 'lightbulb', '#ca8a04', '#fde68a', 'grid',
      { isNew: true, popularity: 52, players: 4100, desc: 'Cada toque inverte as luzes vizinhas. Apague todas!' }),
    g('mahjong', 'Mahjong Solitário', ['puzzle', 'cartas'], 'flower-2', '#be123c', '#fb7185', 'checks',
      { popularity: 74, players: 15200, desc: 'Remova pares de peças livres até limpar o tabuleiro.' }),
    g('labirinto', 'Pinte o Labirinto', ['puzzle', 'arcade'], 'route', '#e11d48', '#fb7185', 'grid',
      { playable: true, isNew: true, popularity: 84, players: 11300, desc: 'Deslize a bolinha: ela só para na parede e pinta tudo por onde passa. Pinte o labirinto inteiro!', scoreLabel: 'Fase' }),
    g('empilhar', 'Empilhar', ['arcade'], 'layers-3', '#ec4899', '#818cf8', 'stripes',
      { playable: true, isNew: true, popularity: 90, players: 16800, desc: 'Toque na hora certa para empilhar os blocos. O que sobrar para fora é cortado — acerte em cheio para manter a torre larga!' }),
    g('prateleiras', 'Prateleiras', ['puzzle'], 'shopping-basket', '#b45309', '#fbbf24', 'grid',
      { playable: true, isNew: true, popularity: 92, players: 21400, desc: 'Arrume os produtos: junte 3 iguais na mesma prateleira para eles sumirem. Limpe tudo antes do tempo acabar.', scoreLabel: 'Fase' }),
    g('copinhos', 'Copinhos de Cor', ['puzzle'], 'cup-soda', '#7c3aed', '#f472b6', 'dots',
      { playable: true, isNew: true, popularity: 88, players: 9600, desc: 'Mande os copinhos para a esteira e eles pintam o desenho em pixel art — de baixo para cima. Planeje a ordem para a esteira não lotar!', scoreLabel: 'Fase' }),
    g('cores', 'Batalha de Cores', ['arcade', 'estrategia', 'multiplayer'], 'paintbrush', '#2563eb', '#ef4444', 'checks',
      { playable: true, isNew: true, popularity: 94, players: 18900, desc: 'Pinte o campo com bolas, laser, serra e bomba. Quem tiver mais território quando o tempo acabar vence!', scoreLabel: '% do campo' }),
    g('territorio', 'Território', ['arcade', 'multiplayer'], 'land-plot', '#0ea5e9', '#fde047', 'grid',
      { playable: true, isNew: true, popularity: 93, players: 22700, desc: 'Saia da sua área, desenhe um rastro e volte para conquistar território. Cuidado: se cortarem seu rastro, você perde!' }),
    g('gamao', 'Gamão', ['tabuleiro', 'estrategia', 'multiplayer'], 'dices', '#92400e', '#f59e0b', 'stripes',
      { popularity: 44, players: 3100, desc: 'Um dos jogos de tabuleiro mais antigos do mundo. Corra com suas peças até a saída.' })
  ];

  // ---------- Jogos implementados em games-arcade.js e games-board.js ----------
  const byId = id => AH.games.find(g => g.id === id);
  ['snake', 'minado', 'xadrez', 'damas', 'conecta4', 'pong', 'deslizante', 'paciencia', 'blackjack', 'tetra', 'calculo', 'kakuro', 'batalha', 'flappy', 'domino', 'lights', 'mahjong', 'gamao']
    .forEach(id => { byId(id).playable = true; });
  Object.assign(byId('lights'), { scoreLabel: 'Movimentos', scoreDir: 'low' });
  ['kakuro', 'mahjong', 'paciencia'].forEach(id => Object.assign(byId(id), { scoreLabel: 'Tempo', scoreDir: 'low' }));
  ['xadrez', 'damas', 'conecta4', 'pong', 'batalha', 'domino', 'gamao', 'blackjack'].forEach(id => Object.assign(byId(id), { scoreLabel: 'Vitórias' }));

  // ---------- Modo de duelo de cada jogo ----------
  // versus: confronto direto (turnos/rodadas contra o adversário)
  // race:   cada um joga sua partida; vence quem fizer mais pontos ou terminar mais rápido
  const VERSUS = ['cores', 'velha', 'ppt', 'xadrez', 'damas', 'conecta4', 'pong', 'batalha', 'domino', 'gamao', 'blackjack'];
  const RACE = { '2048': { metric: 'score', limit: 120 }, memoria: { metric: 'time', limit: 120 }, pocoes: { metric: 'time', limit: 240 },
    porcas: { metric: 'time', limit: 240 }, carros: { metric: 'time', limit: 180 }, helix: { metric: 'score', limit: 120 }, sudoku: { metric: 'time', limit: 600 },
    labirinto: { metric: 'time', limit: 120 }, empilhar: { metric: 'score', limit: 120 }, prateleiras: { metric: 'time', limit: 180 },
    copinhos: { metric: 'time', limit: 180 }, territorio: { metric: 'score', limit: 120 },
    snake: { metric: 'score', limit: 120 }, flappy: { metric: 'score', limit: 120 }, tetra: { metric: 'score', limit: 150 }, calculo: { metric: 'score', limit: 70 },
    minado: { metric: 'time', limit: 240 }, deslizante: { metric: 'time', limit: 180 }, lights: { metric: 'time', limit: 150 }, kakuro: { metric: 'time', limit: 600 },
    mahjong: { metric: 'time', limit: 480 }, paciencia: { metric: 'time', limit: 600 } };
  AH.games.forEach(game => {
    game.duel = true;
    // jogos de pontuação infinita: não existe "vencer" fora de duelos/multiplayer
    game.noWins = ['helix', 'empilhar', 'snake', 'flappy', 'tetra', 'calculo'].includes(game.id) && !game.cats.includes('multiplayer');
    game.duelType = VERSUS.includes(game.id) ? 'versus' : 'race';
    if (game.duelType === 'race') {
      const metric = game.scoreDir === 'low' || game.scoreLabel === 'Tempo' ? 'time' : 'score';
      game.race = Object.assign({ metric, limit: AH.config.raceDefaults[metric].limit }, RACE[game.id]);
    }
  });
  // Dificuldades escolhíveis no lobby do duelo (limits = tempo da corrida em segundos por dificuldade)
  const FIVE = ['Fácil', 'Médio', 'Difícil', 'Muito difícil', 'Extra difícil'];
  AH.duelDifficulties = {
    velha:  { names: ['Fácil', 'Médio', 'Difícil'], def: 1 },
    pocoes: { names: FIVE, limits: [120, 180, 240, 300, 360], def: 1 },
    porcas: { names: FIVE, limits: [120, 180, 240, 300, 360], def: 1 },
    carros: { names: ['Fácil', 'Médio', 'Difícil', 'Expert'], limits: [90, 150, 240, 360], def: 1 },
    sudoku: { names: ['Fácil', 'Médio', 'Difícil', 'Expert'], limits: [300, 600, 900, 1200], def: 0 },
    labirinto: { names: ['Fácil', 'Médio', 'Difícil', 'Expert'], limits: [60, 90, 150, 240], def: 1 },
    prateleiras: { names: ['Fácil', 'Médio', 'Difícil', 'Expert'], limits: [90, 150, 210, 300], def: 1 },
    copinhos: { names: ['Fácil', 'Médio', 'Difícil', 'Expert'], limits: [120, 180, 240, 300], def: 1 },
    minado: { names: ['Fácil', 'Médio', 'Difícil'], limits: [120, 240, 420], def: 0 },
    deslizante: { names: ['3×3', '4×4', '5×5'], limits: [90, 180, 360], def: 1 },
    lights: { names: ['3×3', '4×4', '5×5'], limits: [60, 120, 240], def: 1 },
    kakuro: { names: ['Fácil', 'Médio', 'Difícil'], limits: [300, 600, 900], def: 0 },
    xadrez: { names: ['Fácil', 'Médio', 'Difícil'], def: 1 },
    damas: { names: ['Fácil', 'Médio', 'Difícil'], def: 1 },
    conecta4: { names: ['Fácil', 'Médio', 'Difícil'], def: 1 },
    pong: { names: ['Fácil', 'Médio', 'Difícil'], def: 1 }
  };
  AH.raceLimit = (game, diff) => AH.duelDifficulties[game.id]?.limits?.[diff] ?? game.race.limit;
  AH.duelLabel = (game, diff) => {
    if (game.duelType === 'versus') return 'Confronto direto';
    const lim = AH.raceLimit(game, diff ?? AH.duelDifficulties[game.id]?.def);
    return `${AH.config.raceDefaults[game.race.metric].label} em ${lim >= 60 ? Math.round(lim / 60) + ' min' : lim + 's'}`;
  };

  // ---------- Jogadores fictícios ----------
  const P = (id, username, icon, color, level, prestige, extra) => Object.assign({
    id, username, avatar: { icon, color, frame: prestige >= 3 ? 'gold' : prestige >= 1 ? 'emerald' : 'basic' },
    level, prestige, totalXp: (prestige * 100 + level) * 900 + username.length * 37,
    wins: 0, losses: 0, mmr: 1000, online: false, lastSeen: Date.now() - 3600e3, playing: null, sharePlaying: true,
    joined: '2025-03-12', bio: ''
  }, extra);

  AH.players = [
    P('u_1042', 'LunaPixel', 'cat', '#ef4565', 78, 3, { wins: 1840, losses: 612, mmr: 2310, online: true, playing: '2048', joined: '2024-11-02', bio: 'Caçadora de recordes no 2048.' }),
    P('u_2210', 'ReiDoTabuleiro', 'crown', '#232035', 94, 2, { wins: 2210, losses: 980, mmr: 2105, online: true, playing: 'xadrez', joined: '2024-09-18' }),
    P('u_3381', 'Bruxinha42', 'ghost', '#a24cf5', 51, 1, { wins: 930, losses: 512, mmr: 1720, online: false, lastSeen: Date.now() - 2 * 3600e3 }),
    P('u_4120', 'NeoCometa', 'rocket', '#2a8bd8', 63, 0, { wins: 702, losses: 340, mmr: 1540, online: true, playing: 'velha' }),
    P('u_5009', 'TioDamas', 'circle-dot', '#b45309', 88, 1, { wins: 1205, losses: 703, mmr: 1890, online: false, lastSeen: Date.now() - 26 * 3600e3 }),
    P('u_6611', 'Ana_Sudoku', 'leaf', '#14a37f', 45, 0, { wins: 512, losses: 220, mmr: 1380, online: true, playing: null }),
    P('u_7300', 'PedroPong', 'zap', '#f2a516', 37, 0, { wins: 410, losses: 390, mmr: 1210, online: false, lastSeen: Date.now() - 5 * 86400e3, sharePlaying: false }),
    P('u_8123', 'MaxMemória', 'bot', '#0ea5a4', 29, 0, { wins: 260, losses: 180, mmr: 1090, online: true, playing: 'memoria' }),
    P('u_9001', 'Kira.exe', 'flame', '#d9468f', 99, 5, { wins: 3120, losses: 1104, mmr: 2480, online: false, lastSeen: Date.now() - 40 * 60e3, joined: '2024-06-01' }),
    P('u_9102', 'Capivara_Pro', 'snail', '#6b8e23', 18, 0, { wins: 98, losses: 120, mmr: 940, online: false, lastSeen: Date.now() - 3 * 86400e3 }),
    P('u_9213', 'Joaninha', 'bird', '#ef4565', 22, 0, { wins: 140, losses: 101, mmr: 980, online: true, playing: 'ppt' }),
    P('u_9324', 'Zé_do_Conecta', 'circle', '#dc2626', 57, 0, { wins: 640, losses: 330, mmr: 1610, online: false, lastSeen: Date.now() - 9 * 3600e3 }),
    P('u_9435', 'Mestre_Yoda', 'star', '#16a34a', 100, 7, { wins: 4100, losses: 1320, mmr: 2650, online: true, playing: 'xadrez', joined: '2024-05-20' }),
    P('u_9546', 'Lia_Lógica', 'lightbulb', '#ca8a04', 41, 0, { wins: 380, losses: 260, mmr: 1320, online: false, lastSeen: Date.now() - 15 * 60e3 }),
    P('u_9657', 'GatoNinja', 'cat', '#475569', 70, 2, { wins: 1500, losses: 801, mmr: 1980, online: true, playing: 'snake' }),
    P('u_9768', 'Bia.Blocos', 'blocks', '#7c3aed', 12, 0, { wins: 40, losses: 52, mmr: 870, online: false, lastSeen: Date.now() - 7 * 86400e3 })
  ];

  AH.seedFriends = ['u_1042', 'u_4120', 'u_6611', 'u_8123', 'u_3381', 'u_7300'];
  AH.seedRequests = ['u_9213', 'u_9657'];

  // ---------- Conquistas ----------
  // check(state) retorna [atual, meta]
  AH.achievements = [
    { id: 'first_win', name: 'Primeira Vitória', desc: 'Vença sua primeira partida.', icon: 'trophy', xp: 50, check: s => [s.user.wins, 1] },
    { id: 'ten_games', name: 'Explorador', desc: 'Jogue 10 jogos diferentes.', icon: 'compass', xp: 150, check: s => [Object.values(s.user.stats).filter(x => x.played > 0).length, 10] },
    { id: 'three_games', name: 'Curioso', desc: 'Jogue 3 jogos diferentes.', icon: 'search', xp: 60, check: s => [Object.values(s.user.stats).filter(x => x.played > 0).length, 3] },
    { id: 'win_100', name: 'Centurião', desc: 'Vença 100 partidas.', icon: 'swords', xp: 400, check: s => [s.user.wins, 100] },
    { id: 'lvl_10', name: 'Pegando o Jeito', desc: 'Atinja o nível 10.', icon: 'trending-up', xp: 80, check: s => [s.user.level + s.user.prestige * 100, 10] },
    { id: 'lvl_50', name: 'Veterano', desc: 'Atinja o nível 50.', icon: 'medal', xp: 300, check: s => [s.user.level + s.user.prestige * 100, 50] },
    { id: 'prestige_1', name: 'Primeiro Prestígio', desc: 'Ative seu primeiro prestígio.', icon: 'sparkles', xp: 500, check: s => [s.user.prestige, 1] },
    { id: 'friends_5', name: 'Turma Formada', desc: 'Faça cinco amigos.', icon: 'users', xp: 100, check: s => [s.friends.length, 5] },
    { id: 'duels_10', name: 'Duelista', desc: 'Vença dez duelos.', icon: 'sword', xp: 250, check: s => [s.user.duelWins, 10] },
    { id: 'duel_1', name: 'Primeiro Sangue', desc: 'Vença um duelo.', icon: 'zap', xp: 60, check: s => [s.user.duelWins, 1] },
    { id: 'tile_512', name: 'Meio Caminho', desc: 'Faça o bloco 512 no 2048.', icon: 'hash', xp: 120, check: s => [Math.min(s.user.stats['2048']?.maxTile || 0, 512), 512] },
    { id: 'mem_perfect', name: 'Memória de Elefante', desc: 'Termine a Memória em até 14 jogadas.', icon: 'brain', xp: 150, check: s => [s.user.stats.memoria?.best && s.user.stats.memoria.best <= 14 ? 1 : 0, 1] },
    { id: 'favs_3', name: 'Colecionador', desc: 'Favorite 3 jogos.', icon: 'heart', xp: 40, check: s => [s.user.favorites.length, 3] },
    { id: 'daily_7', name: 'Constância', desc: 'Complete 7 desafios.', icon: 'calendar-check', xp: 200, check: s => [s.user.challengesDone, 7] }
  ];

  // ---------- Conquistas e títulos de cada jogo (gerados) ----------
  // Cada jogo ganha: "Aficionado" (partidas), "Campeão" (vitórias), um marco de recorde e um título exclusivo
  // que é liberado por uma delas (aparece na loja como bloqueado até a conquista).
  (function () {
    const HIGH = { '2048': 4000, snake: 200, flappy: 20, tetra: 3000, calculo: 200, helix: 500, empilhar: 40, territorio: 400, pocoes: 30, porcas: 30, carros: 30, labirinto: 30, prateleiras: 30, copinhos: 30 };
    const LOW = { sudoku: 600, minado: 90, kakuro: 300, mahjong: 300, paciencia: 420, deslizante: 60, lights: 20 };
    const VERSUS_GAMES = ['velha', 'ppt', 'xadrez', 'damas', 'conecta4', 'pong', 'batalha', 'domino', 'gamao', 'blackjack', 'cores'];
    const unit = id => ({ '2048': 'pontos', snake: 'pontos', flappy: 'canos', tetra: 'pontos', calculo: 'pontos', helix: 'pontos', empilhar: 'blocos', territorio: 'de área (400 = 40%)', sudoku: 'segundos', minado: 'segundos', kakuro: 'segundos', mahjong: 'segundos', paciencia: 'segundos', deslizante: 'movimentos', lights: 'toques' }[id] || 'fases vencidas');
    AH.games.filter(g => g.playable).forEach(g => {
      const st = s => s.user.stats[g.id] || {};
      const list = [];
      list.push({ id: g.id + '_play', name: `Aficionado: ${g.name}`, desc: `Jogue 10 partidas de ${g.name}.`, icon: g.icon, xp: 60, check: s => [Math.min(st(s).played || 0, 10), 10] });
      if (!g.noWins) {
        const n = VERSUS_GAMES.includes(g.id) ? 10 : 5;
        list.push({ id: g.id + '_win', name: `Campeão: ${g.name}`, desc: `Vença ${n} partidas de ${g.name}.`, icon: 'trophy', xp: 100, check: s => [Math.min(st(s).wins || 0, n), n] });
      }
      if (HIGH[g.id]) list.push({ id: g.id + '_rec', name: `Lenda: ${g.name}`, desc: `Chegue a ${HIGH[g.id]} ${unit(g.id)} em ${g.name}.`, icon: 'medal', xp: 150, check: s => [Math.min(st(s).best || 0, HIGH[g.id]), HIGH[g.id]] });
      if (LOW[g.id]) list.push({ id: g.id + '_rec', name: `Velocista: ${g.name}`, desc: `Termine ${g.name} em até ${LOW[g.id]} ${unit(g.id)}.`, icon: 'timer', xp: 150, check: s => [st(s).best != null && st(s).best <= LOW[g.id] ? 1 : 0, 1] });
      AH.achievements.push(...list);
      const unlock = list[list.length - 1];
      AH.config.titles.push({ id: 't_' + g.id, name: (HIGH[g.id] || LOW[g.id] ? 'Mestre ' : 'Craque ') + (g.name.length > 14 ? g.name.split(' ')[0] : g.name), price: 0, ach: unlock.id });
    });
  })();


  // ---------- Desafios ----------
  // metric: chave de contador no estado do desafio
  AH.challengeTemplates = {
    daily: [
      { id: 'd_play3', name: 'Jogue 3 partidas', icon: 'gamepad-2', metric: 'play', goal: 3, xp: 100, coins: 20 },
      { id: 'd_win2', name: 'Vença 2 partidas', icon: 'trophy', metric: 'win', goal: 2, xp: 100, coins: 25 },
      { id: 'd_2048', name: 'Jogue uma partida de 2048', icon: 'hash', metric: 'play:2048', goal: 1, xp: 100, coins: 15 }
    ],
    weekly: [
      { id: 'w_win15', name: 'Vença 15 partidas', icon: 'medal', metric: 'win', goal: 15, xp: 400, coins: 120 },
      { id: 'w_duel3', name: 'Vença 3 duelos', icon: 'swords', metric: 'duelWin', goal: 3, xp: 350, coins: 100 },
      { id: 'w_variety', name: 'Jogue 4 jogos diferentes', icon: 'shuffle', metric: 'variety', goal: 4, xp: 300, coins: 80 }
    ]
  };
})();
