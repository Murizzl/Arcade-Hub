/* =========================================================
   Utilidades de interface: ícones, escape, toasts e modais.
   ========================================================= */
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const ic = (name, cls = '') => `<i data-lucide="${name}" class="${cls}"></i>`;
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let iconsQueued = false;
export function refreshIcons() {
  if (iconsQueued) return;
  iconsQueued = true;
  requestAnimationFrame(() => { iconsQueued = false; window.lucide?.createIcons({ attrs: { 'stroke-width': 2 } }); });
}

export function duration(secs) {
  secs = Math.max(0, Math.round(secs));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60), s = secs % 60;
  if (m < 60) return s ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

export function toast(html, kind = 'info', icon = 'info', ms = 3800) {
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="t-ic">${ic(icon)}</span><div class="t-body">${html}</div>`;
  box.appendChild(t);
  refreshIcons();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  while (box.children.length > 4) box.firstChild.remove();
}

export function modal({ title, body, actions = [], wide = false, onMount, dismissable = true }) {
  const root = $('#modal');
  root.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h2>${title}</h2>${dismissable ? `<button class="icon-btn" data-close aria-label="Fechar">${ic('x')}</button>` : ''}</header>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-a="${i}" ${a.disabled ? 'disabled' : ''}>${a.icon ? ic(a.icon) : ''}${a.label}</button>`).join('')}</footer>` : ''}
    </div>`;
  root.classList.add('open');
  const card = root.firstElementChild;
  root.onclick = e => {
    if ((e.target === root && dismissable) || e.target.closest('[data-close]')) return closeModal();
    const b = e.target.closest('[data-a]');
    if (b) { const a = actions[+b.dataset.a]; if (a.onClick?.(card) !== false) closeModal(); }
  };
  onMount?.(card);
  refreshIcons();
  return card;
}
export function closeModal() { const r = $('#modal'); r.classList.remove('open'); r.innerHTML = ''; }

export const COUNTRY = {
  BR: 'Brasil', AR: 'Argentina', UY: 'Uruguai', CL: 'Chile', US: 'Estados Unidos', CA: 'Canadá', MX: 'México',
  GB: 'Reino Unido', FR: 'França', BE: 'Bélgica', NL: 'Países Baixos', DE: 'Alemanha', AT: 'Áustria', PL: 'Polônia', RU: 'Rússia',
  IT: 'Itália', ES: 'Espanha', MA: 'Marrocos', EG: 'Egito', KE: 'Quênia', UG: 'Uganda', ZA: 'África do Sul',
  JP: 'Japão', KR: 'Coreia do Sul', CN: 'China', IN: 'Índia', AU: 'Austrália'
};
export const CONTINENT = { sa: 'América do Sul', na: 'América do Norte', eu: 'Europa', af: 'África', as: 'Ásia', oc: 'Oceania' };
export const flag = cc => `<span class="cc">${cc}</span>`;
