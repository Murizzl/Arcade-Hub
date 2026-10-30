"""Gera o banco de fases do "Saia da Vaga" (js/cars-levels.js).

Para cada layout aleatório, mapeia todas as posições alcançáveis e calcula a
distância (em deslizes) até a saída; guarda a posição mais distante. Assim cada
fase tem o número mínimo de movimentos conhecido.

Uso: python tools/gen_cars.py [segundos]
"""
import json, random, sys, time
from collections import deque

N, EXIT_ROW = 6, 2
# (primeira fase, última fase, movimentos mínimos, máximo, carros no layout)
TIERS = [(1, 15, 3, 6, 8), (16, 35, 7, 11, 10), (36, 60, 12, 17, 12), (61, 120, 18, 60, 13)]


def occ(cars, skip=-1):
    g = [[-1] * N for _ in range(N)]
    for i, (r, c, ln, h) in enumerate(cars):
        if i == skip:
            continue
        for k in range(ln):
            g[r if h else r + k][c + k if h else c] = i
    return g


def neighbors(cars):
    out = []
    for i, (r, c, ln, h) in enumerate(cars):
        g = occ(cars, i)
        cur = c if h else r
        lo = hi = cur
        if h:
            while lo > 0 and g[r][lo - 1] < 0: lo -= 1
            while hi + ln < N and g[r][hi + ln] < 0: hi += 1
        else:
            while lo > 0 and g[lo - 1][c] < 0: lo -= 1
            while hi + ln < N and g[hi + ln][c] < 0: hi += 1
        for p in range(lo, hi + 1):
            if p != cur:
                ns = list(cars)
                ns[i] = (r, p, ln, h) if h else (p, c, ln, h)
                out.append(tuple(ns))
    return out


def random_layout(rnd, n_cars):
    cars = [(EXIT_ROW, rnd.randrange(5), 2, True)]
    tries = 0
    while len(cars) < n_cars and tries < 300:
        tries += 1
        h = rnd.random() < 0.42
        ln = 3 if rnd.random() < 0.3 else 2
        r = rnd.randrange(N) if h else rnd.randrange(N - ln + 1)
        c = rnd.randrange(N - ln + 1) if h else rnd.randrange(N)
        if h and r == EXIT_ROW:
            continue
        g = occ(cars)
        if all(g[r if h else r + k][c + k if h else c] < 0 for k in range(ln)):
            cars.append((r, c, ln, h))
    return tuple(cars)


def deepest(layout, cap=60000):
    seen = {layout}
    q = deque([layout])
    adj = {}
    while q and len(seen) < cap:
        s = q.popleft()
        nb = neighbors(s)
        adj[s] = nb
        for n in nb:
            if n not in seen:
                seen.add(n); q.append(n)
    if len(seen) >= cap:
        return None, -1
    dist = {s: 0 for s in seen if s[0][1] == N - 2}
    if not dist:
        return None, -1
    q = deque(dist)
    while q:
        s = q.popleft()
        for n in adj.get(s, ()):
            if n not in dist:
                dist[n] = dist[s] + 1; q.append(n)
    best = max(dist, key=dist.get)
    return best, dist[best]


def main():
    budget = float(sys.argv[1]) if len(sys.argv) > 1 else 240
    rnd = random.Random(20261030)
    pools = {t: [] for t in range(len(TIERS))}
    need = {t: TIERS[t][1] - TIERS[t][0] + 1 for t in range(len(TIERS))}
    t0 = time.time()
    while time.time() - t0 < budget and any(len(pools[t]) < need[t] for t in pools):
        t = min((t for t in pools if len(pools[t]) < need[t]), key=lambda x: len(pools[x]) / need[x])
        lo_mv, hi_mv, n_cars = TIERS[t][2], TIERS[t][3], TIERS[t][4]
        state, d = deepest(random_layout(rnd, n_cars + rnd.randrange(-1, 2)))
        if state is None:
            continue
        # aceita a fase no nível certo; serve também para níveis mais fáceis
        for tt in range(len(TIERS)):
            if TIERS[tt][2] <= d <= TIERS[tt][3] and len(pools[tt]) < need[tt]:
                pools[tt].append((d, [[r, c, ln, int(h)] for r, c, ln, h in state]))
                break
    levels = []
    for t in range(len(TIERS)):
        levels += [cars for d, cars in sorted(pools[t], key=lambda x: x[0])]
        print(f'tier {t}: {len(pools[t])}/{need[t]} fases, movimentos {[d for d, _ in sorted(pools[t])][:3]}..{max([d for d, _ in pools[t]] or [0])}')
    depths = [d for t in range(len(TIERS)) for d, _ in sorted(pools[t], key=lambda x: x[0])]
    with open('js/cars-levels.js', 'w', encoding='utf-8') as f:
        f.write('// Gerado por tools/gen_cars.py — cada fase: [linha, coluna, tamanho, horizontal]. O primeiro é o carro vermelho.\n')
        f.write('AH.carLevels = ' + json.dumps(levels, separators=(',', ':')) + ';\n')
        f.write('AH.carLevelMoves = ' + json.dumps(depths, separators=(',', ':')) + ';\n')
    print('total', len(levels), 'em', round(time.time() - t0), 's')


if __name__ == '__main__':
    main()
