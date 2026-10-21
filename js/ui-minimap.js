// ミニマップ(左上の丸い地図): 自分のまわり(半径 VIEW m)を北を上に。ゾンビは赤い点(間引く)・ボスは大きな印。
// 地図の絵は World.minimapImage() があればそれを使い、なければ World.boxes から 1 回だけ描く。
import { World } from './world.js';
import { Zombies } from './zombies.js';
import { Player } from './player.js';
import { Bosses } from './ui-boss.js';
import { Happenings } from './zombie-events.js';

const VIEW = 55;            // 見える半径(m)
const MAX_DOTS = 140;

export const Minimap = {
  cv: null, ctx: null, base: null, baseScale: 1, baseHalf: 300, _t: 0, size: 0, dpr: 1,

  init(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  },

  resize() {
    const r = this.cv.getBoundingClientRect();
    const s = Math.round(r.width) || 88;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = s;
    this.cv.width = Math.round(s * this.dpr); this.cv.height = Math.round(s * this.dpr);
  },

  _makeBase() {
    this.baseHalf = World.half || 300;
    let img = null;
    try { if (typeof World.minimapImage === 'function') img = World.minimapImage(); } catch (e) { img = null; }
    if (img && img.width) { this.base = img; this.baseScale = img.width / (this.baseHalf * 2); return; }
    // 自分で描く: 地面 + 壁や建物(上から見た四角)
    const N = 1024, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), k = N / (this.baseHalf * 2);
    g.fillStyle = '#26301f'; g.fillRect(0, 0, N, N);
    for (const b of World.buildings || []) {
      g.fillStyle = '#4a4038';
      g.fillRect((b.minX + this.baseHalf) * k, (b.minZ + this.baseHalf) * k, (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    for (const b of World.boxes || []) {
      g.fillStyle = b.building ? '#9a8a78' : (b.h && b.h > 4 ? '#7d7f86' : '#5a5f52');
      g.fillRect((b.minX + this.baseHalf) * k, (b.minZ + this.baseHalf) * k, Math.max(1, (b.maxX - b.minX) * k), Math.max(1, (b.maxZ - b.minZ) * k));
    }
    this.base = c; this.baseScale = k;
  },

  update(dt, force) {
    if ((this._t -= dt) > 0 && !force) return;
    this._t = 1 / 15;                                  // 1 秒に 15 回で十分
    if (!this.base) { try { this._makeBase(); } catch (e) { return; } }
    const g = this.ctx, S = this.cv.width, R = S / 2, px = Player.pos.x, pz = Player.pos.z;
    const k = S / (VIEW * 2);                          // m → 画面の点
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#111'; g.fillRect(0, 0, S, S);
    // 地図の切り出し
    const bs = this.baseScale, sx = (px - VIEW + this.baseHalf) * bs, sz = (pz - VIEW + this.baseHalf) * bs, sw = VIEW * 2 * bs;
    g.globalAlpha = 0.95;
    g.drawImage(this.base, sx, sz, sw, sw, 0, 0, S, S);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, S, S);
    // ゾンビ(多いときは間引く)
    const L = Zombies.list || [], n = L.length, step = Math.max(1, Math.ceil(n / MAX_DOTS));
    const d = Math.max(2, 2.2 * this.dpr);
    g.fillStyle = '#ff4a3a';
    for (let i = 0; i < n; i += step) {
      const e = L[i];
      const x = R + (e.x - px) * k, y = R + (e.z - pz) * k;
      if (x < 0 || y < 0 || x > S || y > S) continue;
      g.fillRect(x - d / 2, y - d / 2, d, d);
    }
    // ボス
    const t = performance.now() / 1000;
    for (const b of Bosses.list) {
      let x = R + (b.e.x - px) * k, y = R + (b.e.z - pz) * k;
      const dx = x - R, dy = y - R, l = Math.hypot(dx, dy), lim = R - 7 * this.dpr;
      if (l > lim) { x = R + dx / l * lim; y = R + dy / l * lim; }     // 遠ければ縁に
      g.beginPath(); g.arc(x, y, (4.5 + Math.sin(t * 8) * 1.2) * this.dpr, 0, Math.PI * 2);
      g.fillStyle = '#ff2050'; g.fill();
      g.lineWidth = 1.5 * this.dpr; g.strokeStyle = '#fff'; g.stroke();
    }
    // 出来事の印(物資・金色ゾンビ・空爆 …)。遠ければ縁に
    for (const m of Happenings.markers) {
      let x = R + (m.x - px) * k, y = R + (m.z - pz) * k;
      const dx = x - R, dy = y - R, l = Math.hypot(dx, dy), lim = R - 7 * this.dpr;
      if (l > lim) { x = R + dx / l * lim; y = R + dy / l * lim; }
      const s = (5 + Math.sin(t * 10) * 1.4) * this.dpr;
      g.fillStyle = m.color || '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 1.5 * this.dpr;
      if (m.kind === 'supply') { g.fillRect(x - s, y - s, s * 2, s * 2); g.strokeRect(x - s, y - s, s * 2, s * 2); }
      else if (m.kind === 'golden') { star(g, x, y, s * 1.3); g.fill(); g.stroke(); }
      else { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); g.stroke(); }
    }
    // 自分(向きのある三角)
    const f = Player.facing || 0;
    g.translate(R, R); g.rotate(f);
    g.beginPath(); g.moveTo(0, -6 * this.dpr); g.lineTo(4.5 * this.dpr, 5 * this.dpr); g.lineTo(-4.5 * this.dpr, 5 * this.dpr); g.closePath();
    g.fillStyle = '#5fe0ff'; g.fill(); g.lineWidth = 1.2 * this.dpr; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
    // 縁
    g.beginPath(); g.arc(R, R, R - 1.5 * this.dpr, 0, Math.PI * 2);
    g.lineWidth = 2 * this.dpr; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
  },

  reset() { this.base = null; },
};

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath();
}
