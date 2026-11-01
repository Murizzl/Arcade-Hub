"""Atualiza a versão dos arquivos dos jogos persistentes (cache do navegador).

Uso: python tools/bump_version.py            -> versão = data/hora atual
     python tools/bump_version.py 2026.12.01 -> versão escolhida

Troca APP_VERSION e todos os ?v= em club-legacy/index.html e rail-atlas/index.html,
para o navegador nunca misturar módulos novos com antigos depois de uma publicação.
"""
import re, sys, datetime, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime('%Y.%m.%d.%H%M')
for game in ('club-legacy', 'rail-atlas'):
    p = root / game / 'index.html'
    s = p.read_text(encoding='utf8')
    s = re.sub(r"\?v=[\w.\-]+", f"?v={ver}", s)
    s = re.sub(r"window\.APP_VERSION = '[^']*'", f"window.APP_VERSION = '{ver}'", s)
    p.write_text(s, encoding='utf8')
    print(f'{game}: versão {ver}')
