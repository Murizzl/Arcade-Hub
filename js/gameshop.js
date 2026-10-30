/* =========================================================
   Loja de cada jogo — cosméticos que só afetam o visual da partida.
   Cada jogo tem "espaços" (slots); cada espaço tem itens com preço em moedas.
   O primeiro item de cada espaço é o padrão (grátis, sempre disponível).
     item.vars  → variáveis CSS aplicadas na área do jogo (ex.: --primary)
     item.fx    → dados lidos pelo próprio motor do jogo (AH.store.skin(jogo, espaço))
     item.sw    → cores usadas na pré-visualização
   PRODUÇÃO: a compra deve passar por RPC no servidor que debita as moedas.
   ========================================================= */
(function () {
  const it = (id, name, price, sw, fx, vars) => ({ id, name, price, sw: [].concat(sw), fx: fx || {}, vars: vars || null });
  const accent = (id, name, price, c) => it(id, name, price, c, {}, { '--primary': c, '--primary-600': c, '--primary-soft': c + '26', '--focus': c });

  // Tema da partida: recolore botões, abas e destaques da área do jogo
  const THEME = { id: 'theme', name: 'Tema da partida', icon: 'palette', items: [
    it('padrao', 'Padrão', 0, '#6c4cf5'),
    accent('oceano', 'Oceano', 150, '#0ea5e9'),
    accent('floresta', 'Floresta', 150, '#16a34a'),
    accent('por-do-sol', 'Pôr do sol', 200, '#f97316'),
    accent('rosa', 'Algodão-doce', 200, '#ec4899'),
    accent('ouro', 'Ouro', 300, '#d99a00'),
    accent('neon', 'Neon', 350, '#06b6d4')
  ] };

  const COLORS = [['vermelha', 'Vermelha', '#ef4444'], ['dourada', 'Dourada', '#f5b524'], ['neon', 'Verde neon', '#84cc16'], ['rosa', 'Rosa', '#ec4899'], ['roxa', 'Roxa', '#8b5cf6'], ['preta', 'Preta', '#1f2937']];
  const colorSlot = (id, name, icon, base, price = 100, key = 'color', baseColor = '#94a3b8') => ({ id, name, icon, items: [it('padrao', base, 0, baseColor), ...COLORS.map(([i, n, c]) => it(i, n, price, c, { [key]: c }))] });

  const G = {
    helix: [
      colorSlot('ball', 'Bolinha', 'circle', 'Laranja clássica', 100, 'ball', '#f97316'),
      { id: 'tower', name: 'Torre', icon: 'tornado', items: [
        it('padrao', 'Cores da rodada', 0, ['#7dd3fc', '#0284c7']),
        it('oceano', 'Oceano', 200, ['#7dd3fc', '#0284c7'], { theme: { bg: ['#7dd3fc', '#e0f2fe'], pole: '#f8fafc', plat: '#0284c7', ball: '#f97316' } }),
        it('floresta', 'Floresta', 200, ['#86efac', '#16a34a'], { theme: { bg: ['#86efac', '#f0fdf4'], pole: '#fafffb', plat: '#16a34a', ball: '#e11d48' } }),
        it('doce', 'Doce', 250, ['#f9a8d4', '#db2777'], { theme: { bg: ['#f9a8d4', '#fdf2f8'], pole: '#fff7fb', plat: '#db2777', ball: '#7c3aed' } }),
        it('noite', 'Noite estrelada', 300, ['#1e1b4b', '#22d3ee'], { theme: { bg: ['#1e1b4b', '#4338ca'], pole: '#c7d2fe', plat: '#22d3ee', ball: '#facc15' } }),
        it('lava', 'Lava', 350, ['#0f172a', '#f43f5e'], { theme: { bg: ['#0f172a', '#334155'], pole: '#94a3b8', plat: '#f43f5e', ball: '#a3e635' } })
      ] },
      THEME
    ],
    labirinto: [
      { id: 'paint', name: 'Tinta', icon: 'paintbrush', items: [
        it('padrao', 'Cores variadas', 0, ['#ff5a7a', '#06b6d4', '#22c55e']),
        it('rosa', 'Rosa choque', 120, '#ff5a7a', { paint: '#ff5a7a' }),
        it('ciano', 'Ciano', 120, '#06b6d4', { paint: '#06b6d4' }),
        it('lima', 'Lima', 120, '#84cc16', { paint: '#84cc16' }),
        it('ouro', 'Ouro', 200, '#f59e0b', { paint: '#f59e0b' }),
        it('violeta', 'Violeta', 200, '#a855f7', { paint: '#a855f7' })
      ] },
      { id: 'ball', name: 'Bolinha', icon: 'circle', items: [
        it('padrao', 'Branca', 0, '#e2e8f0'),
        it('ouro', 'Ouro', 150, '#fbbf24', { mid: '#fbbf24', dark: '#b45309' }),
        it('rubi', 'Rubi', 150, '#f43f5e', { mid: '#f43f5e', dark: '#9f1239' }),
        it('safira', 'Safira', 150, '#3b82f6', { mid: '#3b82f6', dark: '#1e3a8a' }),
        it('esmeralda', 'Esmeralda', 150, '#10b981', { mid: '#10b981', dark: '#065f46' })
      ] },
      THEME
    ],
    territorio: [colorSlot('color', 'Cor do seu quadrado', 'square', 'Cor do avatar', 100), THEME],
    '2048': [
      { id: 'tiles', name: 'Peças', icon: 'hash', items: [
        it('padrao', 'Clássico', 0, ['#eee4da', '#edc53f']),
        it('pastel', 'Pastel', 150, ['#fde2e4', '#bde0fe'], { from: '#fde2e4', to: '#a78bfa', dark: false }),
        it('oceano', 'Oceano', 200, ['#cffafe', '#0369a1'], { from: '#cffafe', to: '#0c4a6e' }),
        it('floresta', 'Floresta', 200, ['#dcfce7', '#14532d'], { from: '#dcfce7', to: '#14532d' }),
        it('neon', 'Neon', 300, ['#f0abfc', '#22d3ee'], { from: '#22d3ee', to: '#e879f9' }),
        it('fogo', 'Fogo', 300, ['#fde68a', '#b91c1c'], { from: '#fde68a', to: '#b91c1c' })
      ] },
      THEME
    ],
    velha: [
      { id: 'marks', name: 'Marcas X e O', icon: 'x', items: [
        it('padrao', 'Clássico', 0, ['#6c4cf5', '#ff8a3d']),
        it('fogo-gelo', 'Fogo e gelo', 120, ['#ef4444', '#38bdf8'], { x: '#ef4444', o: '#38bdf8' }),
        it('neon', 'Neon', 150, ['#22d3ee', '#f472b6'], { x: '#22d3ee', o: '#f472b6' }),
        it('floresta', 'Floresta', 150, ['#16a34a', '#d97706'], { x: '#16a34a', o: '#d97706' }),
        it('royal', 'Real', 200, ['#7c3aed', '#f59e0b'], { x: '#7c3aed', o: '#f59e0b' })
      ] },
      THEME
    ],
    snake: [
      { id: 'skin', name: 'Cobrinha', icon: 'worm', items: [
        it('padrao', 'Verde', 0, ['#22a45d', '#5bd18b'], { a: '#22a45d', b: '#5bd18b' }),
        it('azul', 'Azul', 120, ['#2563eb', '#60a5fa'], { a: '#2563eb', b: '#60a5fa' }),
        it('roxa', 'Roxa', 120, ['#7c3aed', '#c4b5fd'], { a: '#7c3aed', b: '#c4b5fd' }),
        it('dourada', 'Dourada', 200, ['#d97706', '#fde047'], { a: '#d97706', b: '#fde047' }),
        it('arco-iris', 'Arco-íris', 350, ['#ef4444', '#3b82f6'], { rainbow: true })
      ] },
      { id: 'food', name: 'Comida', icon: 'apple', items: [
        it('padrao', 'Maçã', 0, '#ef4444', { color: '#ef4444', emoji: '🍎' }),
        it('cereja', 'Cereja', 80, '#be123c', { color: '#be123c', emoji: '🍒' }),
        it('uva', 'Uva', 80, '#7c3aed', { color: '#7c3aed', emoji: '🍇' }),
        it('laranja', 'Laranja', 80, '#f97316', { color: '#f97316', emoji: '🍊' }),
        it('estrela', 'Estrela', 150, '#facc15', { color: '#facc15', emoji: '⭐' })
      ] },
      THEME
    ],
    flappy: [
      colorSlot('bird', 'Pássaro', 'bird', 'Amarelo clássico', 100, 'color', '#fde047'),
      { id: 'sky', name: 'Céu', icon: 'sun', items: [
        it('padrao', 'Dia', 0, ['#7dd3fc', '#e0f2fe'], { bg: ['#7dd3fc', '#e0f2fe'] }),
        it('entardecer', 'Entardecer', 150, ['#fdba74', '#fde68a'], { bg: ['#fb923c', '#fde68a'] }),
        it('noite', 'Noite', 200, ['#1e1b4b', '#4338ca'], { bg: ['#1e1b4b', '#4338ca'], night: true }),
        it('rosa', 'Doce', 150, ['#f9a8d4', '#fdf2f8'], { bg: ['#f9a8d4', '#fdf2f8'] })
      ] },
      THEME
    ],
    tetra: [
      { id: 'blocks', name: 'Blocos', icon: 'blocks', items: [
        it('padrao', 'Clássico', 0, ['#06b6d4', '#a855f7', '#f59e0b']),
        it('pastel', 'Pastel', 150, ['#a5b4fc', '#fda4af', '#86efac'], { pal: ['#a5f3fc', '#a5b4fc', '#fdba74', '#fde68a', '#86efac', '#d8b4fe', '#fda4af'] }),
        it('neon', 'Neon', 250, ['#22d3ee', '#f0abfc', '#a3e635'], { pal: ['#22d3ee', '#3b82f6', '#fb923c', '#facc15', '#a3e635', '#e879f9', '#f43f5e'] }),
        it('mono', 'Monocromático', 150, ['#475569', '#cbd5e1'], { pal: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#1e293b', '#475569'] })
      ] },
      THEME
    ],
    pong: [colorSlot('paddle', 'Raquete', 'move-vertical', 'Branca', 100, 'color', '#ffffff'), colorSlot('ball', 'Bola', 'circle', 'Branca', 80, 'color', '#ffffff'), THEME],
    conecta4: [
      { id: 'discs', name: 'Fichas', icon: 'circle', items: [
        it('padrao', 'Vermelho e amarelo', 0, ['#dc2626', '#f6c23e']),
        it('azul-verde', 'Azul e verde', 120, ['#2563eb', '#22c55e'], { a: '#2563eb', b: '#22c55e' }),
        it('rosa-roxo', 'Rosa e roxo', 120, ['#ec4899', '#7c3aed'], { a: '#ec4899', b: '#7c3aed' }),
        it('preto-ouro', 'Preto e ouro', 200, ['#111827', '#f5b524'], { a: '#111827', b: '#f5b524' })
      ] },
      THEME
    ],
    memoria: [THEME],
    ppt: [THEME], pocoes: [THEME], sudoku: [THEME], porcas: [THEME], carros: [THEME], empilhar: [THEME],
    prateleiras: [THEME], copinhos: [THEME], cores: [THEME],
    minado: [THEME], deslizante: [THEME], lights: [THEME], calculo: [THEME], blackjack: [THEME], damas: [THEME], xadrez: [THEME],
    paciencia: [THEME], kakuro: [THEME], batalha: [THEME], domino: [THEME], mahjong: [THEME], gamao: [THEME]
  };

  AH.gameShop = {
    slots: gameId => G[gameId] || [THEME],
    item: (gameId, slotId, itemId) => (G[gameId] || [THEME]).find(s => s.id === slotId)?.items.find(x => x.id === itemId)
  };
})();
