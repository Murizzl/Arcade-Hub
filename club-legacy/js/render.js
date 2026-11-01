/* Renderização do campo 2D (Canvas). Só lê o estado do motor — nunca o altera. */
import { L, W } from './engine.js';

const MARGIN = 4; // metros ao redor do campo

export class PitchRenderer {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.highlight = null; this.labels = new Map(); this.trail = [];
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.max(10, r.width * dpr); this.c.height = Math.max(10, r.height * dpr);
    // tela em pé (celular): o campo é desenhado na vertical para aproveitar a altura
    const cw = this.c.width, ch = this.c.height;
    const sH = Math.min(cw / (L + MARGIN * 2), ch / (W + MARGIN * 2)), sV = Math.min(ch / (L + MARGIN * 2), cw / (W + MARGIN * 2));
    this.vertical = sV > sH * 1.08; // gira só quando o campo fica bem maior assim
    this.lw = this.vertical ? this.c.height : this.c.width; this.lh = this.vertical ? this.c.width : this.c.height;
    const sx = this.lw / (L + MARGIN * 2), sy = this.lh / (W + MARGIN * 2);
    this.s = Math.min(sx, sy);
    this.ox = (this.lw - L * this.s) / 2; this.oy = (this.lh - W * this.s) / 2;
    this.dpr = dpr;
  }
  // ponto da tela (clientX/Y) -> coordenadas do campo, considerando a rotação
  toPitch(cx, cy) {
    const r = this.c.getBoundingClientRect();
    let px = (cx - r.left) * this.dpr, py = (cy - r.top) * this.dpr;
    if (this.vertical) [px, py] = [py, this.c.width - px];
    return { x: (px - this.ox) / this.s, y: (py - this.oy) / this.s };
  }
  // texto e rótulos sempre de pé, mesmo com o campo girado
  upright(X, Y, fn) { const g = this.ctx; g.save(); g.translate(X, Y); if (this.vertical) g.rotate(-Math.PI / 2); fn(g); g.restore(); }
  X(x) { return this.ox + x * this.s; }
  Y(y) { return this.oy + y * this.s; }

  drawPitch() {
    const g = this.ctx, s = this.s;
    g.fillStyle = '#123d24'; g.fillRect(-2, -2, this.lw + 4, this.lh + 4);
    // faixas do gramado
    const stripes = 14;
    for (let i = 0; i < stripes; i++) { g.fillStyle = i % 2 ? '#1a5230' : '#1d5a35'; g.fillRect(this.X(i * L / stripes), this.Y(0), L / stripes * s + 1, W * s); }
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1, s * 0.14);
    g.strokeRect(this.X(0), this.Y(0), L * s, W * s);
    g.beginPath(); g.moveTo(this.X(L / 2), this.Y(0)); g.lineTo(this.X(L / 2), this.Y(W)); g.stroke();
    g.beginPath(); g.arc(this.X(L / 2), this.Y(W / 2), 9.15 * s, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath(); g.arc(this.X(L / 2), this.Y(W / 2), s * 0.35, 0, Math.PI * 2); g.fill();
    for (const side of [0, 1]) {
      const x0 = side ? L : 0, d = side ? -1 : 1;
      g.strokeRect(this.X(side ? L - 16.5 : 0), this.Y(W / 2 - 20.16), 16.5 * s, 40.32 * s);
      g.strokeRect(this.X(side ? L - 5.5 : 0), this.Y(W / 2 - 9.16), 5.5 * s, 18.32 * s);
      g.beginPath(); g.arc(this.X(x0 + d * 11), this.Y(W / 2), s * 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(this.X(x0 + d * 11), this.Y(W / 2), 9.15 * s, side ? Math.PI - 0.93 : -0.93, side ? Math.PI + 0.93 : 0.93); g.stroke();
      // gol
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(this.X(side ? L : -2), this.Y(W / 2 - 3.66), 2 * s, 7.32 * s);
      g.strokeRect(this.X(side ? L : -2), this.Y(W / 2 - 3.66), 2 * s, 7.32 * s);
      g.fillStyle = 'rgba(255,255,255,.8)';
    }
  }

  /**
   * scene: { players: [{x,y,side,num,ball,name,gk,energy}], ball:{x,y,z}, kits:[{fill,text,gk}], pass:{sx,sy,ex,ey} }
   */
  draw(scene) {
    // câmera opcional (replays): aproxima e segue um ponto do campo
    const base = [this.s, this.ox, this.oy];
    if (scene.cam) {
      this.s = base[0] * scene.cam.zoom;
      this.ox = this.lw / 2 - scene.cam.x * this.s;
      this.oy = this.lh / 2 - scene.cam.y * this.s;
    }
    const g = this.ctx;
    if (this.vertical) g.setTransform(0, 1, -1, 0, this.c.width, 0); // gira 90°: o comprimento do campo fica na vertical
    this.drawScene(scene);
    g.setTransform(1, 0, 0, 1, 0, 0);
    [this.s, this.ox, this.oy] = base;
  }
  drawScene(scene) {
    const g = this.ctx, s = this.s;
    this.drawPitch();
    if (scene.trail && scene.trail.length > 1) {
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineCap = 'round';
      for (let i = 1; i < scene.trail.length; i++) {
        g.lineWidth = s * 0.5 * i / scene.trail.length;
        g.beginPath(); g.moveTo(this.X(scene.trail[i - 1].x), this.Y(scene.trail[i - 1].y)); g.lineTo(this.X(scene.trail[i].x), this.Y(scene.trail[i].y)); g.stroke();
      }
    }
    if (scene.pass) {
      // linha do passe com seta no destino (deixa claro para onde a bola vai)
      const sx = this.X(scene.pass.sx), sy = this.Y(scene.pass.sy), ex = this.X(scene.pass.ex), ey = this.Y(scene.pass.ey);
      g.strokeStyle = 'rgba(217,249,157,.6)'; g.lineWidth = s * 0.3; g.setLineDash([s * 0.9, s * 0.6]);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
      const ang = Math.atan2(ey - sy, ex - sx), hl = s * 1.6;
      g.fillStyle = 'rgba(217,249,157,.8)'; g.beginPath(); g.moveTo(ex, ey);
      g.lineTo(ex - hl * Math.cos(ang - 0.45), ey - hl * Math.sin(ang - 0.45)); g.lineTo(ex - hl * Math.cos(ang + 0.45), ey - hl * Math.sin(ang + 0.45)); g.closePath(); g.fill();
    }
    const r = Math.max(5 * this.dpr, s * 1.25);
    for (const p of scene.players) {
      const kit = scene.kits[p.side];
      const X = this.X(p.x), Y = this.Y(p.y);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(X + r * 0.2, Y + r * 0.35, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
      if (p.ball) { g.strokeStyle = '#d9f99d'; g.lineWidth = r * 0.28; g.beginPath(); g.arc(X, Y, r * 1.45, 0, Math.PI * 2); g.stroke(); }
      if (p.target) { g.strokeStyle = 'rgba(217,249,157,.9)'; g.lineWidth = r * 0.22; g.setLineDash([r * 0.5, r * 0.35]); g.beginPath(); g.arc(X, Y, r * 1.6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
      if (p.sel) { g.strokeStyle = '#fff'; g.lineWidth = r * 0.2; g.beginPath(); g.arc(X, Y, r * 1.75, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = p.gk ? kit.gk : kit.fill;
      g.strokeStyle = kit.stroke; g.lineWidth = r * 0.22;
      // goleiro mergulhando: corpo alongado na direção do salto
      if (p.dive) { g.beginPath(); g.ellipse(X, Y + p.dive * r * 0.5, r * 0.85, r * 1.75, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
      else { g.beginPath(); g.arc(X, Y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
      this.upright(X, Y, g => {
        g.fillStyle = p.gk ? '#111827' : kit.text; g.font = `700 ${r * 1.05}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(p.num, 0, r * 0.06);
        if (p.label) {
          g.font = `600 ${Math.max(10 * this.dpr, r * 0.95)}px Inter, sans-serif`;
          const w = g.measureText(p.label).width + r;
          g.fillStyle = 'rgba(10,14,12,.85)'; roundRect(g, -w / 2, -r * 3.4, w, r * 1.7, r * 0.5); g.fill();
          g.fillStyle = '#ecfccb'; g.fillText(p.label, 0, -r * 2.55);
        }
      });
    }
    // bola (com sombra para a altura)
    const b = scene.ball; if (b) {
      const z = b.z || 0, br = Math.max(3 * this.dpr, s * 0.6) * (1 + z * 0.06);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(this.X(b.x) + z * s * 0.25, this.Y(b.y) + z * s * 0.35, br, br * 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = br * 0.3;
      g.beginPath(); g.arc(this.X(b.x), this.Y(b.y) - z * s * 0.4, br, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// cor de cada time nas barras de estatística: a camisa, ou o detalhe se a camisa for escura demais
export function teamColors(kits) {
  const lum = h => { if (!/^#[0-9a-f]{6}$/i.test(h || '')) return 128; const n = parseInt(h.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8 & 255) * 587) + ((n & 255) * 114)) / 1000; };
  return kits.map(k => lum(k.fill) < 45 ? (lum(k.text) < 45 ? '#9ca3af' : k.text) : k.fill);
}

// cores dos uniformes: o visitante usa o segundo uniforme se as cores forem parecidas
export function kitsFor(home, away) {
  const hc = home.colors[0];
  let ac = away.colors[0], at = away.kitText;
  if (colorDist(hc, ac) < 120) { ac = away.away?.[0] || away.colors[1]; at = away.away?.[1] || away.colors[0]; if (colorDist(hc, ac) < 120) { ac = '#f8fafc'; at = '#111827'; } }
  return [
    { fill: hc, text: home.kitText || '#fff', stroke: home.colors[1], gk: '#facc15' },
    { fill: ac, text: at || '#fff', stroke: 'rgba(0,0,0,.5)', gk: '#38bdf8' }
  ];
}
function colorDist(a, b) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [x, y] = [p(a), p(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
