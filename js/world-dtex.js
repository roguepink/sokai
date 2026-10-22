// マップ係(第4弾・街並み): 地区ごとの 建物の壁・屋根・看板の模様を 2 枚の「まとめ絵」(アトラス)に描く。
//  - FAC(壁と屋根): 1024×1024 を 8×8 マス(1 マス = 窓 1 つ分の壁 / 店先 1 軒 / 屋根の瓦)。光る窓は emissive の絵
//  - SGN(看板): 縦の看板 32 枚・横の看板 16 枚・大きな広告 8 枚。日本語の文字(店の名前はすべて架空)
// 材質は 2 つだけ(M.facade / M.sign)。どの地区の建物も同じ材質なので、描く回数が ふえない。
import * as THREE from 'three';
import { seeded } from './util.js';
import { cutout, CUT } from './world-tex.js';

const R = seeded(4242);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(a + R() * (b - a + 1));
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const GOTH = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
const MIN = '"Hiragino Mincho ProN","Noto Serif JP","Noto Serif CJK JP","Yu Mincho",serif';

// ---------- 壁と屋根のマス(番号 = 段 × 8 + 列) ----------
export const FT = {
  glass: [0, 1, 2, 3, 4, 5, 6, 7],          // オフィスのガラス(5,6 = 明かり、7 = 横の帯)
  neon: [8, 9, 10, 11, 12, 13, 14, 15],     // 繁華街の上の階(8,10,13 = 明かり、11 = 光る広告)
  china: [16, 17, 18, 19, 20, 21, 22, 23],  // 中華街の上の階(18,20 = 明かり、23 = 金の飾りの帯)
  shita: [24, 25, 26, 27, 28, 29, 30, 31],  // 下町の上の階(29 = 明かり)
  frontA: [32, 33, 34, 35, 36, 37, 38, 39], // 店先: のれん・居酒屋・シャッター・八百屋・ラーメン・薬屋・格子・たばこ屋
  frontB: [40, 41, 42, 43, 44, 45, 46, 47], // 店先: ゲーム・パチンコ・カラオケ・バー・ロビー・中華料理・中華の店・明るい店
  wa: [48, 49, 50, 51, 52],                 // 和: しっくい・障子・板・大きな戸・石垣つきの塀
  ruin: [53, 54, 55],                       // こわれた壁・焼けた窓・むき出しの床
  roof: { kawara: 56, green: 57, gold: 58, red: 59, conc: 60, sky: 61, tin: 62, garden: 63 },
};
const TS = 128, N = 8, AT = 1024;
export function tileUV(t) {
  const c = t % N, r = (t / N) | 0, e = 1.5 / AT;
  return [c / N + e, 1 - (r + 1) / N + e, (c + 1) / N - e, 1 - r / N - e];
}

function cnv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function texOf(c, aniso, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// ざらざら(小さな点を まく。getImageData より ずっと速い)
function speck(x, n, W, H, cols) { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(R() * W, R() * H, rr(1, 3), rr(1, 3)); } }
function stain(x, W, H, n, col) {
  for (let i = 0; i < n; i++) {
    const px = R() * W, py = R() * H, r = rr(8, 30);
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}
function drips(x, y0, n, col) { for (let i = 0; i < n; i++) { x.fillStyle = col; x.fillRect(R() * TS, y0, rr(2, 5), rr(8, 26)); } }
function grad(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
// 窓(ガラス・枠・明かり)
function win(x, e, X, Y, W, H, o = {}) {
  const fr = o.frame || [70, 72, 76];
  x.fillStyle = rgb(...fr); x.fillRect(X - 3, Y - 3, W + 6, H + 6);
  if (o.lit) {
    x.fillStyle = rgb(o.lit[0] * 0.8, o.lit[1] * 0.75, o.lit[2] * 0.7); x.fillRect(X, Y, W, H);
    e.fillStyle = rgb(...o.lit); e.fillRect(X, Y, W, H);
    if (o.curtain) { x.fillStyle = rgb(...o.curtain); x.fillRect(X, Y, W * 0.3, H); e.fillStyle = rgb(o.lit[0] * 0.4, o.lit[1] * 0.35, o.lit[2] * 0.3); e.fillRect(X, Y, W * 0.3, H); }
  } else {
    x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, rgb(110, 128, 145)], [0.5, rgb(45, 55, 68)], [1, rgb(22, 26, 32)]]); x.fillRect(X, Y, W, H);
    if (o.curtain) { x.fillStyle = rgb(...o.curtain); x.fillRect(X, Y, W * 0.35, H); x.fillRect(X + W * 0.7, Y, W * 0.3, H); }
  }
  if (o.split !== false) { x.fillStyle = rgb(...fr); x.fillRect(X + W / 2 - 1.5, Y, 3, H); }
}
function text(x, s, cx, cy, size, font, fill, o = {}) {
  x.font = `${o.weight || 'bold'} ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.glow) { x.shadowColor = o.glow; x.shadowBlur = o.blur || 10; }
  if (o.stroke) { x.lineWidth = o.lw || 4; x.strokeStyle = o.stroke; x.strokeText(s, cx, cy, o.max); }
  x.fillStyle = fill; x.fillText(s, cx, cy, o.max);
  x.shadowBlur = 0;
}
function vtext(x, s, cx, y0, y1, size, font, fill, o = {}) {
  const ch = [...s], n = ch.length, step = Math.min(size * 1.08, (y1 - y0) / n);
  for (let i = 0; i < n; i++) text(x, ch[i], cx, y0 + step * (i + 0.5) + (y1 - y0 - step * n) / 2, Math.min(size, step * 0.95), font, fill, o);
}
// 瓦(段ごとに丸い瓦を並べる)
function tiles(x, base, hi, lo) {
  x.fillStyle = rgb(...base); x.fillRect(0, 0, TS, TS);
  for (let row = 0; row < 8; row++) {
    const y = row * 16;
    for (let k = 0; k < 8; k++) {
      const X = k * 16 + (row % 2) * 8;
      x.fillStyle = grad(x, X, 0, X + 16, 0, [[0, rgb(...lo)], [0.45, rgb(...hi)], [1, rgb(...lo)]]);
      x.fillRect(X, y, 16, 15); if (X + 16 > TS) x.fillRect(X - TS, y, 16, 15);
    }
    x.fillStyle = rgb(lo[0] * 0.5, lo[1] * 0.5, lo[2] * 0.5, 0.8); x.fillRect(0, y + 14, TS, 2);
  }
}

// ---------- 壁・屋根のアトラス ----------
function facadeAtlas() {
  const [c, X] = cnv(AT), [ce, E] = cnv(AT);
  E.fillStyle = '#000'; E.fillRect(0, 0, AT, AT);
  const cell = (t, fn) => {
    const cx = (t % N) * TS, cy = ((t / N) | 0) * TS;
    for (const k of [X, E]) { k.save(); k.beginPath(); k.rect(cx, cy, TS, TS); k.clip(); k.translate(cx, cy); }
    fn(X, E);
    X.restore(); E.restore();
  };
  // --- 0..7 オフィスのガラス
  const GL = [[30, 62, 105], [95, 135, 180], [22, 88, 98], [26, 42, 72], [60, 140, 152], [40, 72, 125], [32, 44, 62], [150, 165, 185]];
  for (let i = 0; i < 8; i++) cell(i, (x, e) => {
    const b = GL[i];
    if (i === 7) {   // 階と階の間の帯(銀色)
      x.fillStyle = grad(x, 0, 0, 0, TS, [[0, rgb(175, 185, 200)], [1, rgb(120, 130, 145)]]); x.fillRect(0, 0, TS, TS);
      x.fillStyle = rgb(90, 98, 110); for (let k = 0; k < TS; k += 32) x.fillRect(k, 0, 2, TS);
      return;
    }
    x.fillStyle = grad(x, 0, 0, 0, TS, [[0, rgb(b[0] * 1.6, b[1] * 1.45, b[2] * 1.3)], [0.55, rgb(...b)], [1, rgb(b[0] * 0.6, b[1] * 0.6, b[2] * 0.65)]]);
    x.fillRect(0, 0, TS, TS);
    // 空や雲のうつりこみ
    x.fillStyle = 'rgba(255,255,255,0.13)'; x.beginPath(); x.moveTo(rr(0, 60), 0); x.lineTo(rr(70, 128), 0); x.lineTo(rr(0, 60), TS); x.lineTo(-30, TS); x.fill();
    if (i === 4 || i === 1) stain(x, TS, TS, 3, 'rgba(255,255,255,0.18)');
    if (i === 5 || i === 6 || i === 3) {    // 明かり(夜に光る)
      const warm = i === 6;
      for (let k = 0; k < 4; k++) {
        if (i === 3 && R() < 0.6) continue;
        const lc = warm ? [255, 225, 170] : [190, 220, 255];
        x.fillStyle = rgb(lc[0] * 0.55, lc[1] * 0.55, lc[2] * 0.6); x.fillRect(k * 32 + 2, 16, 28, TS - 18);
        e.fillStyle = rgb(...lc); e.fillRect(k * 32 + 2, 16, 28, TS - 18);
        e.fillStyle = rgb(255, 255, 255); e.fillRect(k * 32 + 4, 18, 24, 3);   // 天井の明かり
        x.fillStyle = 'rgba(20,20,25,0.7)'; x.fillRect(k * 32 + 6, TS - 34, 20, 16);   // 机と人のかげ
        e.fillStyle = 'rgba(0,0,0,0.85)'; e.fillRect(k * 32 + 6, TS - 34, 20, 16);
      }
    }
    // 枠(縦の桟 1m ごと)と 階の帯
    x.fillStyle = rgb(38, 44, 54); for (let k = 0; k <= TS; k += 32) x.fillRect(k - 1.5, 0, 3, TS);
    x.fillStyle = rgb(48, 54, 66); x.fillRect(0, 0, TS, 13); x.fillStyle = rgb(120, 130, 145); x.fillRect(0, 13, TS, 2);
  });
  // --- 8..15 繁華街の上の階(すすけた雑居ビル)
  const neonWall = [[62, 60, 66], [190, 180, 160], [120, 92, 72], [12, 12, 16], [108, 106, 102], [70, 64, 78], [18, 18, 24], [96, 92, 88]];
  for (let i = 0; i < 8; i++) cell(8 + i, (x, e) => {
    const w = neonWall[i];
    x.fillStyle = rgb(...w); x.fillRect(0, 0, TS, TS);
    if (i === 1 || i === 2) { x.fillStyle = rgb(w[0] * 0.8, w[1] * 0.8, w[2] * 0.8); for (let k = 0; k < TS; k += 8) { x.fillRect(0, k, TS, 1); x.fillRect(k, 0, 1, TS); } }
    stain(x, TS, TS, 3, 'rgba(20,18,15,0.25)');
    if (i === 3) {   // 光る広告の板
      const hue = [[255, 60, 200], [60, 220, 255], [255, 210, 60]][ri(0, 2)];
      for (let yy = 6; yy < TS - 4; yy += 6) for (let xx = 4; xx < TS - 4; xx += 6) {
        const k = 0.35 + 0.65 * Math.abs(Math.sin(xx * 0.05 + yy * 0.08));
        const col = [hue[0] * k, hue[1] * (1.2 - k), hue[2] * k];
        x.fillStyle = rgb(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5); x.fillRect(xx, yy, 4, 4);
        e.fillStyle = rgb(...col); e.fillRect(xx, yy, 4, 4);
      }
      x.fillStyle = rgb(30, 30, 34); x.fillRect(0, 0, TS, 4); x.fillRect(0, TS - 4, TS, 4);
      return;
    }
    if (i === 5) {   // カラオケの窓(色とりどりの光)
      win(x, e, 14, 22, 100, 76, { frame: [40, 36, 46], split: false });
      for (let k = 0; k < 6; k++) { const cc = [[255, 80, 200], [80, 200, 255], [255, 230, 90], [140, 255, 120]][k % 4]; const px = rr(18, 100), py = rr(26, 90); e.fillStyle = rgb(...cc); e.beginPath(); e.arc(px, py, rr(6, 14), 0, 7); e.fill(); x.fillStyle = rgb(cc[0] * 0.5, cc[1] * 0.5, cc[2] * 0.5); x.beginPath(); x.arc(px, py, 8, 0, 7); x.fill(); }
      return;
    }
    if (i === 6) { x.fillStyle = 'rgba(255,80,200,0.18)'; x.fillRect(rr(0, 80), 0, 10, TS); x.fillStyle = 'rgba(80,220,255,0.15)'; x.fillRect(rr(0, 100), 0, 6, TS); x.fillStyle = rgb(40, 40, 46); x.fillRect(0, 0, TS, 6); return; }
    if (i === 7) {   // ベランダと洗濯物
      win(x, e, 16, 18, 96, 86, { frame: [70, 70, 72], split: true });
      x.fillStyle = rgb(130, 130, 128); x.fillRect(4, 70, 120, 4); for (let k = 8; k < 124; k += 10) x.fillRect(k, 70, 2, 46); x.fillRect(4, 114, 120, 6);
      x.fillStyle = rgb(160, 160, 158); x.fillRect(10, 30, 108, 2);
      for (let k = 0; k < 5; k++) { x.fillStyle = [rgb(220, 90, 90), rgb(240, 240, 235), rgb(90, 130, 200), rgb(240, 200, 80), rgb(140, 200, 140)][k]; x.fillRect(14 + k * 21, 32, 16, rr(18, 34)); }
      return;
    }
    const lit = i === 0 ? [255, 110, 190] : i === 2 ? [255, 200, 130] : null;
    win(x, e, 22, 24, 84, 70, { frame: i === 1 ? [150, 140, 125] : [50, 48, 52], lit, curtain: i === 2 ? [200, 170, 120] : null });
    if (i === 2) { x.fillStyle = 'rgba(80,60,40,0.5)'; for (let yy = 26; yy < 70; yy += 5) x.fillRect(22, yy, 84, 2); }
    if (i === 4) { x.fillStyle = rgb(225, 225, 220); x.fillRect(70, 98, 44, 26); x.fillStyle = rgb(80, 80, 80); x.beginPath(); x.arc(84, 111, 9, 0, 7); x.fill(); }
    drips(x, 96, 4, 'rgba(30,28,25,0.25)');
  });
  // --- 16..23 中華街
  const CH = [[165, 35, 30], [195, 140, 72], [160, 32, 28], [40, 92, 72], [158, 30, 26], [222, 212, 192], [110, 24, 22], [150, 20, 18]];
  const GOLD = [214, 170, 62];
  for (let i = 0; i < 8; i++) cell(16 + i, (x, e) => {
    const w = CH[i];
    x.fillStyle = rgb(...w); x.fillRect(0, 0, TS, TS);
    stain(x, TS, TS, 2, 'rgba(40,10,10,0.25)');
    if (i === 7) {   // 金の飾り(雷文)
      x.fillStyle = rgb(...GOLD); x.fillRect(0, 10, TS, 6); x.fillRect(0, TS - 16, TS, 6);
      x.strokeStyle = rgb(...GOLD); x.lineWidth = 4;
      for (let k = 0; k < TS; k += 32) { x.beginPath(); x.moveTo(k + 4, 96); x.lineTo(k + 4, 32); x.lineTo(k + 28, 32); x.lineTo(k + 28, 80); x.lineTo(k + 12, 80); x.lineTo(k + 12, 48); x.lineTo(k + 20, 48); x.lineTo(k + 20, 64); x.stroke(); }
      return;
    }
    if (i === 0) {   // アーチの窓
      x.fillStyle = rgb(...GOLD); x.beginPath(); x.moveTo(26, 108); x.lineTo(26, 54); x.arc(64, 54, 38, Math.PI, 0); x.lineTo(102, 108); x.fill();
      x.fillStyle = grad(x, 0, 20, 0, 108, [[0, rgb(90, 70, 70)], [1, rgb(25, 18, 18)]]); x.beginPath(); x.moveTo(31, 104); x.lineTo(31, 54); x.arc(64, 54, 33, Math.PI, 0); x.lineTo(97, 104); x.fill();
      return;
    }
    if (i === 1) { win(x, e, 24, 24, 80, 76, { frame: [140, 30, 25], split: false }); x.strokeStyle = rgb(170, 40, 30); x.lineWidth = 3; for (let k = 34; k < 104; k += 12) { x.beginPath(); x.moveTo(k, 24); x.lineTo(k, 100); x.stroke(); } for (let k = 34; k < 100; k += 12) { x.beginPath(); x.moveTo(24, k); x.lineTo(104, k); x.stroke(); } return; }
    if (i === 4) {
      win(x, e, 20, 28, 88, 70, { frame: [70, 20, 18], lit: [255, 170, 110] });
      for (const lx of [38, 90]) { x.fillStyle = rgb(200, 30, 20); e.fillStyle = rgb(255, 60, 30); for (const k of [x, e]) { k.beginPath(); k.ellipse(lx, 44, 10, 13, 0, 0, 7); k.fill(); } x.fillStyle = rgb(...GOLD); x.fillRect(lx - 6, 30, 12, 3); x.fillRect(lx - 6, 56, 12, 3); }
      return;
    }
    if (i === 6) { win(x, e, 20, 18, 88, 80, { frame: [60, 14, 12] }); x.fillStyle = rgb(...GOLD); x.fillRect(8, 82, 112, 5); x.fillRect(8, 112, 112, 6); for (let k = 12; k < 120; k += 10) x.fillRect(k, 86, 3, 26); return; }
    const lit = i === 2 ? [255, 190, 120] : null;
    win(x, e, 26, 30, 76, 66, { frame: i === 5 ? [170, 30, 25] : i === 3 ? [220, 220, 210] : [60, 15, 12], lit });
    if (i === 2) { x.fillStyle = rgb(...GOLD); x.fillRect(0, 6, TS, 8); x.fillRect(0, 112, TS, 6); }
  });
  // --- 24..31 下町の上の階
  const SH = [[200, 190, 170], [112, 80, 55], [128, 140, 150], [205, 196, 178], [225, 214, 190], [196, 186, 166], [190, 182, 166], [208, 200, 182]];
  for (let i = 0; i < 8; i++) cell(24 + i, (x, e) => {
    const w = SH[i];
    x.fillStyle = rgb(...w); x.fillRect(0, 0, TS, TS);
    if (i === 1) { for (let k = 0; k < TS; k += 10) { x.fillStyle = rgb(w[0] * rr(0.8, 1.1), w[1] * rr(0.8, 1.1), w[2] * rr(0.8, 1.1)); x.fillRect(0, k, TS, 9); } }
    if (i === 2) { for (let k = 0; k < TS; k += 8) { x.fillStyle = grad(x, k, 0, k + 8, 0, [[0, rgb(100, 110, 120)], [0.5, rgb(170, 180, 190)], [1, rgb(95, 105, 115)]]); x.fillRect(k, 0, 8, TS); } stain(x, TS, TS, 5, 'rgba(140,70,30,0.5)'); }
    if (i === 4) { x.fillStyle = 'rgba(150,140,120,0.6)'; for (let k = 0; k < TS; k += 6) { x.fillRect(0, k, TS, 1); x.fillRect(k, 0, 1, TS); } }
    if (i !== 1 && i !== 2 && i !== 4) speck(x, 120, TS, TS, ['rgba(120,110,95,0.4)', 'rgba(240,235,220,0.4)']);
    stain(x, TS, TS, 2, 'rgba(70,60,45,0.25)');
    if (i === 7) { x.fillStyle = rgb(240, 236, 225); x.fillRect(14, 20, 100, 60); text(x, ['金物', '米', '酒', '布団'][ri(0, 3)], 64, 50, 40, MIN, rgb(170, 40, 30)); x.fillStyle = 'rgba(200,190,170,0.5)'; x.fillRect(14, 20, 100, 60); win(x, e, 40, 92, 48, 26, { frame: [150, 150, 150] }); return; }
    const lit = i === 5 ? [255, 205, 140] : null;
    win(x, e, 18, 30, 92, 58, { frame: [175, 178, 182], lit, curtain: i === 0 ? [215, 200, 150] : i === 5 ? [230, 190, 140] : i === 4 ? [170, 200, 220] : null });
    x.fillStyle = rgb(150, 150, 150); x.fillRect(14, 90, 100, 4);
    if (i === 3) { x.fillStyle = rgb(170, 170, 165); x.fillRect(8, 98, 112, 3); for (let k = 0; k < 5; k++) { x.fillStyle = [rgb(240, 240, 235), rgb(220, 100, 90), rgb(110, 150, 210), rgb(250, 220, 120), rgb(240, 160, 190)][k]; x.fillRect(14 + k * 21, 101, 15, rr(14, 24)); } }
    if (i === 6) { x.fillStyle = rgb(232, 230, 225); x.fillRect(74, 98, 42, 26); x.fillStyle = rgb(90, 90, 90); x.beginPath(); x.arc(87, 111, 9, 0, 7); x.fill(); }
    drips(x, 94, 3, 'rgba(60,50,40,0.25)');
  });
  // --- 32..39 店先(下町・繁華街)
  const front = (x, e, frame, lit) => {
    x.fillStyle = rgb(...frame); x.fillRect(0, 0, TS, TS);
    x.fillStyle = grad(x, 0, 30, 0, TS, [[0, rgb(lit[0] * 0.6, lit[1] * 0.55, lit[2] * 0.5)], [1, rgb(lit[0] * 0.3, lit[1] * 0.27, lit[2] * 0.25)]]); x.fillRect(8, 30, TS - 16, TS - 34);
    e.fillStyle = grad(e, 0, 30, 0, TS, [[0, rgb(lit[0] * 0.62, lit[1] * 0.62, lit[2] * 0.62)], [1, rgb(lit[0] * 0.25, lit[1] * 0.22, lit[2] * 0.2)]]); e.fillRect(8, 30, TS - 16, TS - 34);
  };
  const noren = (x, X, W, Y, H, col, t, tc) => {
    x.fillStyle = rgb(...col); const n = 3; for (let k = 0; k < n; k++) x.fillRect(X + k * W / n + 1, Y, W / n - 2, H);
    x.fillRect(X, Y, W, 6);
    if (t) text(x, t, X + W / 2, Y + H * 0.55, Math.min(H * 0.55, W / [...t].length), MIN, tc);
  };
  cell(32, (x, e) => { front(x, e, [62, 42, 28], [255, 200, 130]); noren(x, 14, 100, 30, 44, [36, 52, 96], 'めし', 'rgb(245,245,240)'); x.fillStyle = rgb(40, 28, 18); x.fillRect(0, 0, TS, 26); text(x, '食堂', 64, 14, 20, MIN, rgb(240, 225, 190)); });
  cell(33, (x, e) => {
    front(x, e, [52, 34, 22], [255, 170, 100]); noren(x, 30, 80, 30, 40, [120, 24, 20], '酒', 'rgb(250,240,230)');
    x.fillStyle = rgb(210, 40, 25); e.fillStyle = rgb(255, 80, 40); for (const k of [x, e]) { k.beginPath(); k.ellipse(16, 64, 11, 16, 0, 0, 7); k.fill(); }
    text(x, '赤', 16, 64, 12, MIN, rgb(20, 10, 10)); x.fillStyle = rgb(30, 20, 14); x.fillRect(0, 0, TS, 24);
  });
  cell(34, (x, e) => {
    x.fillStyle = rgb(80, 80, 82); x.fillRect(0, 0, TS, TS);
    x.fillStyle = rgb(158, 160, 162); x.fillRect(6, 30, TS - 12, TS - 32);
    x.fillStyle = 'rgba(80,80,80,0.6)'; for (let k = 32; k < TS; k += 5) x.fillRect(6, k, TS - 12, 1.5);
    x.fillStyle = rgb(240, 240, 235); x.fillRect(24, 6, 80, 18); text(x, 'テナント募集', 64, 15, 12, GOTH, rgb(200, 30, 30)); void e;
  });
  cell(35, (x, e) => {
    front(x, e, [70, 60, 50], [255, 235, 190]);
    for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? rgb(40, 130, 60) : rgb(240, 240, 235); x.fillRect(k * 16, 22, 16, 14); }
    for (let k = 0; k < 6; k++) { x.fillStyle = rgb(130, 95, 60); x.fillRect(8 + k * 19, 92, 17, 30); x.fillStyle = [rgb(220, 40, 30), rgb(250, 160, 30), rgb(90, 170, 50), rgb(240, 220, 60), rgb(150, 60, 140), rgb(230, 90, 40)][k]; for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(12 + k * 19 + (j % 2) * 8, 92 + (j >> 1) * 6, 4, 0, 7); x.fill(); } }
    text(x, '八百屋', 64, 10, 14, GOTH, rgb(250, 250, 245), { stroke: 'rgb(30,90,40)', lw: 3 });
  });
  cell(36, (x, e) => { front(x, e, [150, 25, 20], [255, 210, 150]); noren(x, 12, 104, 30, 42, [190, 30, 25], 'ラーメン', 'rgb(255,250,240)'); x.fillStyle = rgb(240, 200, 60); x.fillRect(0, 0, TS, 24); text(x, '中華そば', 64, 13, 18, GOTH, rgb(170, 20, 15)); });
  cell(37, (x, e) => {
    front(x, e, [235, 235, 232], [255, 255, 250]);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) { x.fillStyle = [rgb(250, 90, 120), rgb(90, 170, 240), rgb(250, 210, 60), rgb(120, 210, 120)][(k + j) % 4]; x.fillRect(16 + j * 26, 52 + k * 22, 20, 14); }
    x.fillStyle = rgb(30, 140, 70); x.fillRect(0, 0, TS, 26); e.fillStyle = rgb(60, 220, 110); e.fillRect(0, 0, TS, 26); text(x, '薬', 64, 13, 22, GOTH, rgb(255, 255, 255)); text(e, '薬', 64, 13, 22, GOTH, rgb(255, 255, 255));
  });
  cell(38, (x, e) => {
    x.fillStyle = rgb(48, 32, 20); x.fillRect(0, 0, TS, TS);
    e.fillStyle = rgb(120, 80, 40); e.fillRect(8, 20, TS - 16, TS - 24);
    x.fillStyle = rgb(150, 110, 70); x.fillRect(8, 20, TS - 16, TS - 24);
    for (let k = 8; k < TS - 8; k += 6) { x.fillStyle = rgb(58, 38, 22); x.fillRect(k, 20, 4, TS - 24); e.fillStyle = '#000'; e.fillRect(k, 20, 4, TS - 24); }
    x.fillStyle = rgb(30, 20, 12); x.fillRect(0, 14, TS, 6);
  });
  cell(39, (x, e) => {
    front(x, e, [180, 175, 168], [250, 240, 220]); x.fillStyle = rgb(200, 30, 30); x.fillRect(0, 0, TS, 26); e.fillStyle = rgb(255, 50, 50); e.fillRect(0, 0, TS, 26);
    text(x, 'たばこ', 64, 13, 18, GOTH, rgb(255, 255, 255)); text(e, 'たばこ', 64, 13, 18, GOTH, rgb(255, 255, 255));
    x.fillStyle = rgb(90, 90, 92); x.fillRect(10, 80, TS - 20, 6);
  });
  // --- 40..47 店先(繁華街・中華・オフィス)
  cell(40, (x, e) => {
    front(x, e, [30, 26, 40], [160, 120, 255]);
    for (let k = 0; k < 4; k++) { x.fillStyle = rgb(20, 20, 30); x.fillRect(12 + k * 28, 60, 20, 60); const cc = [[80, 255, 230], [255, 90, 220], [255, 240, 90], [120, 160, 255]][k]; e.fillStyle = rgb(...cc); e.fillRect(14 + k * 28, 64, 16, 12); x.fillStyle = rgb(cc[0] * 0.6, cc[1] * 0.6, cc[2] * 0.6); x.fillRect(14 + k * 28, 64, 16, 12); }
    x.fillStyle = rgb(20, 20, 26); x.fillRect(0, 0, TS, 26); text(x, 'GAME', 64, 13, 22, GOTH, rgb(120, 255, 240)); text(e, 'GAME', 64, 13, 22, GOTH, rgb(120, 255, 240), { glow: 'rgb(0,255,220)' });
  });
  cell(41, (x, e) => {
    x.fillStyle = rgb(150, 20, 30); x.fillRect(0, 0, TS, TS); front(x, e, [150, 20, 30], [255, 220, 120]);
    for (let k = 0; k < TS; k += 8) for (const yy of [4, 22, 118]) { x.fillStyle = rgb(240, 200, 80); x.fillRect(k + 2, yy, 4, 4); e.fillStyle = rgb(255, 230, 120); e.fillRect(k + 2, yy, 4, 4); }
    text(x, 'パチンコ', 64, 14, 15, GOTH, rgb(255, 240, 120)); text(e, 'パチンコ', 64, 14, 15, GOTH, rgb(255, 240, 140), { glow: 'rgb(255,120,40)' });
  });
  cell(42, (x, e) => {
    front(x, e, [40, 20, 60], [200, 110, 255]);
    x.fillStyle = rgb(30, 10, 50); x.fillRect(0, 0, TS, 28); text(x, 'カラオケ', 64, 14, 20, GOTH, rgb(255, 160, 250)); text(e, 'カラオケ', 64, 14, 20, GOTH, rgb(255, 140, 250), { glow: 'rgb(255,60,220)' });
    x.fillStyle = rgb(25, 15, 35); x.fillRect(44, 56, 40, 70);
  });
  cell(43, (x, e) => {
    x.fillStyle = rgb(22, 20, 26); x.fillRect(0, 0, TS, TS); speck(x, 80, TS, TS, ['rgba(60,55,65,0.6)']);
    x.fillStyle = rgb(60, 40, 30); x.fillRect(70, 50, 34, 76); x.fillStyle = rgb(200, 170, 80); x.fillRect(96, 88, 3, 6);
    text(x, 'BAR', 42, 60, 26, MIN, rgb(255, 120, 200), { weight: 'italic bold' }); text(e, 'BAR', 42, 60, 26, MIN, rgb(255, 110, 210), { weight: 'italic bold', glow: 'rgb(255,40,180)', blur: 12 });
    e.fillStyle = rgb(80, 220, 255); e.fillRect(14, 80, 56, 3); x.fillStyle = rgb(60, 160, 200); x.fillRect(14, 80, 56, 3);
  });
  cell(44, (x, e) => {
    x.fillStyle = rgb(60, 66, 74); x.fillRect(0, 0, TS, TS);
    x.fillStyle = grad(x, 0, 6, 0, TS, [[0, rgb(150, 170, 190)], [1, rgb(80, 90, 100)]]); x.fillRect(4, 6, TS - 8, TS - 6);
    e.fillStyle = grad(e, 0, 6, 0, TS, [[0, rgb(255, 245, 225)], [1, rgb(150, 140, 120)]]); e.fillRect(4, 6, TS - 8, TS - 6);
    x.fillStyle = rgb(40, 44, 50); for (let k = 0; k <= TS; k += 32) x.fillRect(k - 2, 0, 4, TS);
    x.fillStyle = rgb(50, 46, 40); x.fillRect(40, 92, 48, 20); e.fillStyle = '#000'; e.fillRect(40, 92, 48, 20);
  });
  cell(45, (x, e) => {
    x.fillStyle = rgb(160, 28, 24); x.fillRect(0, 0, TS, TS); front(x, e, [160, 28, 24], [255, 190, 110]);
    x.fillStyle = rgb(...GOLD); x.fillRect(0, 0, TS, 28); text(x, '飯店', 64, 14, 22, MIN, rgb(150, 20, 15));
    x.fillStyle = rgb(110, 20, 16); x.fillRect(46, 52, 36, 76); x.fillStyle = rgb(...GOLD); x.beginPath(); x.arc(64, 52, 18, Math.PI, 0); x.fill(); x.fillStyle = rgb(110, 20, 16); x.beginPath(); x.arc(64, 52, 14, Math.PI, 0); x.fill();
  });
  cell(46, (x, e) => {
    front(x, e, [130, 24, 20], [255, 200, 140]);
    for (let k = 0; k < 5; k++) { x.fillStyle = [rgb(200, 30, 25), rgb(230, 180, 50), rgb(200, 60, 40)][k % 3]; x.fillRect(12 + k * 21, 86, 18, 34); }
    for (const lx of [24, 64, 104]) { x.fillStyle = rgb(210, 30, 20); e.fillStyle = rgb(255, 70, 40); for (const k of [x, e]) { k.beginPath(); k.ellipse(lx, 44, 9, 12, 0, 0, 7); k.fill(); } }
    x.fillStyle = rgb(...GOLD); x.fillRect(0, 0, TS, 20); text(x, '物産', 64, 10, 16, MIN, rgb(140, 20, 15));
  });
  cell(47, (x, e) => {
    front(x, e, [235, 235, 238], [255, 255, 255]);
    for (let k = 0; k < 3; k++) { x.fillStyle = rgb(200, 200, 205); x.fillRect(14 + k * 36, 56, 28, 66); for (let j = 0; j < 5; j++) { x.fillStyle = [rgb(240, 90, 90), rgb(90, 160, 240), rgb(250, 210, 70)][(j + k) % 3]; x.fillRect(16 + k * 36, 58 + j * 13, 24, 8); } }
    x.fillStyle = rgb(110, 60, 170); x.fillRect(0, 0, TS, 14); x.fillStyle = rgb(250, 200, 40); x.fillRect(0, 14, TS, 10);
    text(x, '24H', 64, 7, 12, GOTH, rgb(255, 255, 255));
  });
  // --- 48..52 和(寺町)
  cell(48, (x) => { x.fillStyle = rgb(236, 232, 220); x.fillRect(0, 0, TS, TS); speck(x, 80, TS, TS, ['rgba(200,195,180,0.5)']); x.fillStyle = rgb(70, 48, 30); x.fillRect(0, 0, 10, TS); x.fillRect(TS - 10, 0, 10, TS); x.fillRect(0, 0, TS, 10); x.fillRect(0, 70, TS, 7); stain(x, TS, TS, 2, 'rgba(120,110,90,0.2)'); });
  cell(49, (x, e) => {
    x.fillStyle = rgb(240, 236, 222); x.fillRect(0, 0, TS, TS); e.fillStyle = rgb(110, 85, 50); e.fillRect(0, 0, TS, TS);
    x.fillStyle = rgb(92, 64, 40); e.fillStyle = '#000';
    for (let k = 0; k <= TS; k += 21) { x.fillRect(k - 1.5, 0, 3, TS); e.fillRect(k - 1.5, 0, 3, TS); }
    for (let k = 0; k <= TS; k += 16) { x.fillRect(0, k - 1, TS, 2); e.fillRect(0, k - 1, TS, 2); }
    x.fillRect(0, 0, TS, 6); x.fillRect(0, TS - 8, TS, 8); x.fillRect(0, 0, 6, TS); x.fillRect(TS - 6, 0, 6, TS);
  });
  cell(50, (x) => { for (let k = 0; k < TS; k += 16) { x.fillStyle = rgb(rr(60, 80), rr(42, 54), rr(28, 36)); x.fillRect(k, 0, 16, TS); x.fillStyle = 'rgba(20,12,6,0.7)'; x.fillRect(k, 0, 2, TS); } stain(x, TS, TS, 3, 'rgba(20,12,6,0.25)'); });
  cell(51, (x) => {
    x.fillStyle = rgb(60, 40, 26); x.fillRect(0, 0, TS, TS);
    for (const X of [8, 66]) { x.fillStyle = rgb(105, 70, 42); x.fillRect(X, 12, 54, TS - 12); x.fillStyle = rgb(50, 32, 20); for (let k = 0; k < 4; k++) x.fillRect(X, 12 + k * 29, 54, 3); x.fillStyle = rgb(30, 26, 22); for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) { x.beginPath(); x.arc(X + 12 + q * 15, 26 + r * 29, 3, 0, 7); x.fill(); } }
    x.fillStyle = rgb(40, 26, 16); x.fillRect(0, 0, TS, 12);
  });
  cell(52, (x) => {
    x.fillStyle = rgb(238, 234, 222); x.fillRect(0, 0, TS, 72); speck(x, 60, TS, 72, ['rgba(200,195,180,0.5)']);
    for (let r = 0; r < 4; r++) for (let k = -1; k < 5; k++) { const v = rr(105, 140); x.fillStyle = rgb(v, v - 4, v - 10); x.fillRect(k * 32 + (r % 2) * 16 + 1, 72 + r * 14 + 1, 30, 12); }
    x.fillStyle = rgb(70, 70, 76); x.fillRect(0, 68, TS, 5);
  });
  // --- 53..55 がれき
  cell(53, (x) => {
    x.fillStyle = rgb(118, 108, 98); x.fillRect(0, 0, TS, TS); speck(x, 160, TS, TS, ['rgba(70,60,55,0.6)', 'rgba(160,150,140,0.5)']);
    x.fillStyle = rgb(14, 12, 12); x.beginPath(); x.moveTo(20, 30); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; x.lineTo(64 + Math.cos(a) * rr(22, 46), 64 + Math.sin(a) * rr(18, 40)); } x.fill();
    x.strokeStyle = 'rgba(20,18,16,0.8)'; x.lineWidth = 1.5; for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(64, 64); let px = 64, py = 64; for (let s = 0; s < 6; s++) { px += rr(-14, 14); py += rr(-14, 14); x.lineTo(px, py); } x.stroke(); }
    stain(x, TS, TS, 3, 'rgba(30,20,15,0.35)');
  });
  cell(54, (x, e) => {
    x.fillStyle = rgb(80, 72, 66); x.fillRect(0, 0, TS, TS);
    x.fillStyle = grad(x, 0, 0, 0, TS, [[0, 'rgba(5,5,5,0.95)'], [0.7, 'rgba(20,15,10,0.6)'], [1, 'rgba(0,0,0,0)']]); x.fillRect(10, 0, 108, 100);
    x.fillStyle = rgb(8, 6, 6); x.fillRect(26, 34, 76, 56);
    e.fillStyle = rgb(160, 50, 10); e.fillRect(30, 80, 68, 8); x.fillStyle = rgb(140, 50, 20); x.fillRect(30, 80, 68, 8);
    x.fillStyle = rgb(30, 28, 28); x.fillRect(24, 90, 80, 5);
  });
  cell(55, (x) => {
    x.fillStyle = rgb(26, 24, 24); x.fillRect(0, 0, TS, TS);
    x.fillStyle = rgb(100, 94, 88); x.fillRect(0, 0, TS, 16); x.fillRect(0, TS - 14, TS, 14);
    x.strokeStyle = rgb(90, 50, 30); x.lineWidth = 2; for (let k = 8; k < TS; k += 14) { x.beginPath(); x.moveTo(k, 16); x.lineTo(k + rr(-8, 8), 16 + rr(10, 40)); x.stroke(); }
    for (let k = 0; k < 10; k++) { x.fillStyle = rgb(rr(60, 110), rr(55, 100), rr(50, 95)); x.fillRect(rr(0, 120), rr(80, 112), rr(6, 18), rr(4, 10)); }
  });
  // --- 56..63 屋根
  cell(56, (x) => tiles(x, [56, 62, 74], [118, 128, 145], [52, 58, 70]));
  cell(57, (x) => tiles(x, [26, 90, 60], [70, 170, 110], [24, 80, 52]));
  cell(58, (x) => tiles(x, [170, 120, 30], [250, 205, 80], [150, 100, 25]));
  cell(59, (x) => tiles(x, [140, 50, 34], [215, 100, 70], [120, 42, 30]));
  cell(60, (x) => { x.fillStyle = rgb(118, 116, 110); x.fillRect(0, 0, TS, TS); speck(x, 220, TS, TS, ['rgba(80,78,74,0.6)', 'rgba(160,158,150,0.6)']); stain(x, TS, TS, 3, 'rgba(50,48,44,0.3)'); x.fillStyle = 'rgba(70,68,64,0.6)'; x.fillRect(0, 63, TS, 2); x.fillRect(63, 0, 2, TS); });
  cell(61, (x, e) => { x.fillStyle = grad(x, 0, 0, TS, TS, [[0, rgb(120, 160, 190)], [1, rgb(50, 80, 110)]]); x.fillRect(0, 0, TS, TS); x.fillStyle = rgb(70, 76, 84); for (let k = 0; k <= TS; k += 32) { x.fillRect(k - 2, 0, 4, TS); x.fillRect(0, k - 2, TS, 4); } e.fillStyle = rgb(40, 50, 60); e.fillRect(0, 0, TS, TS); });
  cell(62, (x) => { for (let k = 0; k < TS; k += 8) { x.fillStyle = grad(x, k, 0, k + 8, 0, [[0, rgb(110, 70, 45)], [0.5, rgb(165, 110, 70)], [1, rgb(100, 62, 40)]]); x.fillRect(k, 0, 8, TS); } stain(x, TS, TS, 6, 'rgba(70,35,15,0.55)'); });
  cell(63, (x) => { x.fillStyle = rgb(70, 110, 50); x.fillRect(0, 0, TS, TS); speck(x, 300, TS, TS, ['rgba(40,80,30,0.7)', 'rgba(110,150,70,0.6)']); for (let k = 0; k < 6; k++) { x.fillStyle = rgb(34, 70, 30); x.beginPath(); x.arc(rr(10, 118), rr(10, 118), rr(8, 16), 0, 7); x.fill(); } });
  return [c, ce];
}

// ---------- 看板のアトラス ----------
// 縦: 64×256 を 16 列 × 2 段(0..31) / 横: 256×64 を 4 列 × 4 段(32..47) / 広告: 256×128 を 4 列 × 2 段(48..55)
export const SG = {};   // 名前 → 番号
const V_SIGNS = [
  ['カラオケ', 'neon'], ['BAR', 'neon'], ['スナック', 'neon'], ['ホテル', 'neon'], ['麻雀', 'neon'], ['ゲーム', 'neon'], ['居酒屋', 'neon'], ['焼肉', 'neon'],
  ['ダーツ', 'neon'], ['占い', 'neon'], ['まんが', 'neon'], ['ラーメン', 'box'], ['くすり', 'box'], ['質', 'box'], ['寿司', 'box'], ['牛丼', 'box'],
  ['たばこ', 'box'], ['ゆ', 'box'], ['理容', 'box'], ['うどん', 'wood'], ['中華料理', 'red'], ['飯店', 'red'], ['餃子', 'red'], ['点心', 'red'],
  ['龍華楼', 'red'], ['金鳳酒家', 'red'], ['茶屋', 'wood'], ['甘味処', 'wood'], ['御守', 'wood'], ['蕎麦', 'wood'], ['天神', 'shrine'], ['骨董', 'wood'],
];
const H_SIGNS = [
  ['不夜城一番街', 'neonArch'], ['中華街', 'gold'], ['ひだまり商店街', 'retro'], ['BUSINESS DISTRICT', 'corp'],
  ['ソラノ重工', 'corp'], ['NOVA BANK', 'corp'], ['ミナモ生命', 'corp'], ['KUROGANE', 'corp'],
  ['立入禁止', 'danger'], ['KEEP OUT', 'danger'], ['居酒屋 たぬき', 'shopW'], ['喫茶 ひまわり', 'shopW'],
  ['金福楼', 'gold'], ['夜鳴きカラオケ', 'neonH'], ['パチンコ 大当り', 'neonH'], ['寺町', 'woodH'],
];
const B_SIGNS = ['live', 'cider', 'idol', 'h24', 'movie', 'drink', 'led', 'estate'];

function signAtlas() {
  const [c, x] = cnv(1024);
  x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 1024);
  const NEONC = [[255, 70, 190], [70, 230, 255], [255, 230, 80], [150, 255, 120], [255, 120, 60], [190, 120, 255]];
  V_SIGNS.forEach(([t, st], i) => {
    const X = (i % 16) * 64, Y = ((i / 16) | 0) * 256;
    x.save(); x.beginPath(); x.rect(X, Y, 64, 256); x.clip();
    const n = [...t].length, sz = n > 4 ? 40 : n > 3 ? 46 : n === 1 ? 54 : 50;
    if (st === 'neon') {
      const nc = NEONC[i % NEONC.length];
      x.fillStyle = rgb(14, 12, 20); x.fillRect(X, Y, 64, 256);
      x.strokeStyle = rgb(...nc); x.lineWidth = 3; x.shadowColor = rgb(...nc); x.shadowBlur = 8; x.strokeRect(X + 5, Y + 5, 54, 246); x.shadowBlur = 0;
      if (t === 'BAR') vtext(x, t, X + 32, Y + 18, Y + 238, 52, MIN, rgb(255, 245, 250), { glow: rgb(...nc), blur: 14 });
      else vtext(x, t, X + 32, Y + 14, Y + 242, sz, GOTH, rgb(255, 250, 245), { glow: rgb(...nc), blur: 12 });
    } else if (st === 'box') {
      const bg = [[250, 248, 240], [255, 230, 80], [250, 250, 250]][i % 3];
      x.fillStyle = rgb(...bg); x.fillRect(X, Y, 64, 256);
      x.fillStyle = rgb(200, 30, 30); x.fillRect(X, Y, 64, 8); x.fillRect(X, Y + 248, 64, 8);
      vtext(x, t, X + 32, Y + 14, Y + 242, sz, GOTH, i % 2 ? rgb(200, 25, 20) : rgb(20, 40, 120));
    } else if (st === 'red') {
      x.fillStyle = rgb(170, 20, 18); x.fillRect(X, Y, 64, 256);
      x.strokeStyle = rgb(240, 200, 80); x.lineWidth = 4; x.strokeRect(X + 5, Y + 5, 54, 246);
      vtext(x, t, X + 32, Y + 16, Y + 240, sz, MIN, rgb(255, 215, 90));
    } else if (st === 'wood') {
      x.fillStyle = rgb(70, 46, 28); x.fillRect(X, Y, 64, 256);
      for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(30,18,8,0.35)'; x.fillRect(X + rr(0, 60), Y, 2, 256); }
      vtext(x, t, X + 32, Y + 16, Y + 240, sz, MIN, rgb(245, 238, 220));
    } else {   // 鳥居の額
      x.fillStyle = rgb(20, 18, 16); x.fillRect(X, Y, 64, 256);
      x.strokeStyle = rgb(220, 180, 70); x.lineWidth = 5; x.strokeRect(X + 4, Y + 4, 56, 248);
      vtext(x, t, X + 32, Y + 30, Y + 226, 54, MIN, rgb(240, 200, 80));
    }
    x.restore();
    SG[t] = i;
  });
  H_SIGNS.forEach(([t, st], i) => {
    const X = (i % 4) * 256, Y = 512 + ((i / 4) | 0) * 64;
    x.save(); x.beginPath(); x.rect(X, Y, 256, 64); x.clip();
    const n = [...t].length, sz = Math.min(44, 230 / Math.max(1, n) * (/^[A-Z ]+$/.test(t) ? 1.6 : 1));
    if (st === 'neonArch' || st === 'neonH') {
      x.fillStyle = rgb(18, 10, 24); x.fillRect(X, Y, 256, 64);
      const nc = st === 'neonArch' ? [255, 60, 90] : [255, 90, 220];
      x.strokeStyle = rgb(...nc); x.lineWidth = 3; x.shadowColor = rgb(...nc); x.shadowBlur = 10; x.strokeRect(X + 4, Y + 4, 248, 56); x.shadowBlur = 0;
      text(x, t, X + 128, Y + 33, sz, GOTH, rgb(255, 250, 240), { glow: rgb(...nc), blur: 14, max: 236 });
    } else if (st === 'gold') {
      x.fillStyle = rgb(30, 70, 50); x.fillRect(X, Y, 256, 64); x.strokeStyle = rgb(230, 190, 70); x.lineWidth = 5; x.strokeRect(X + 4, Y + 4, 248, 56);
      text(x, t, X + 128, Y + 33, Math.min(46, sz), MIN, rgb(250, 210, 80), { max: 230 });
    } else if (st === 'retro') {
      x.fillStyle = grad(x, X, Y, X, Y + 64, [[0, rgb(255, 240, 200)], [1, rgb(250, 200, 120)]]); x.fillRect(X, Y, 256, 64);
      for (let k = 0; k < 9; k++) { x.fillStyle = [rgb(240, 80, 120), rgb(80, 170, 240), rgb(250, 200, 50)][k % 3]; x.beginPath(); x.arc(X + 14 + k * 28.5, Y + 6, 5, 0, 7); x.fill(); x.beginPath(); x.arc(X + 14 + k * 28.5, Y + 58, 5, 0, 7); x.fill(); }
      text(x, t, X + 128, Y + 33, Math.min(38, sz), GOTH, rgb(200, 40, 30), { stroke: 'rgb(255,255,255)', lw: 5, max: 236 });
    } else if (st === 'corp') {
      x.fillStyle = rgb(16, 22, 34); x.fillRect(X, Y, 256, 64);
      x.fillStyle = rgb(80, 180, 255); x.fillRect(X + 10, Y + 54, 236, 3);
      text(x, t, X + 128, Y + 30, Math.min(40, sz), GOTH, rgb(235, 245, 255), { glow: 'rgb(80,180,255)', blur: 8, max: 232 });
    } else if (st === 'danger') {
      x.fillStyle = rgb(250, 210, 30); x.fillRect(X, Y, 256, 64);
      x.fillStyle = rgb(20, 20, 20); for (let k = -2; k < 18; k++) { x.beginPath(); x.moveTo(X + k * 16, Y); x.lineTo(X + k * 16 + 8, Y); x.lineTo(X + k * 16 - 4, Y + 10); x.lineTo(X + k * 16 - 12, Y + 10); x.fill(); x.beginPath(); x.moveTo(X + k * 16, Y + 54); x.lineTo(X + k * 16 + 8, Y + 54); x.lineTo(X + k * 16 - 4, Y + 64); x.lineTo(X + k * 16 - 12, Y + 64); x.fill(); }
      text(x, t, X + 128, Y + 32, Math.min(36, sz), GOTH, rgb(20, 20, 20), { max: 236 });
    } else if (st === 'shopW') {
      x.fillStyle = rgb(240, 234, 220); x.fillRect(X, Y, 256, 64); x.strokeStyle = rgb(70, 50, 30); x.lineWidth = 5; x.strokeRect(X + 3, Y + 3, 250, 58);
      text(x, t, X + 128, Y + 33, Math.min(36, sz), MIN, rgb(50, 30, 20), { max: 236 });
    } else {
      x.fillStyle = rgb(60, 40, 24); x.fillRect(X, Y, 256, 64); x.strokeStyle = rgb(30, 20, 12); x.lineWidth = 6; x.strokeRect(X + 3, Y + 3, 250, 58);
      text(x, t, X + 128, Y + 33, 42, MIN, rgb(245, 238, 220), { max: 236 });
    }
    x.restore();
    SG[t] = 32 + i;
  });
  B_SIGNS.forEach((k, i) => {
    const X = (i % 4) * 256, Y = 768 + ((i / 4) | 0) * 128;
    x.save(); x.beginPath(); x.rect(X, Y, 256, 128); x.clip(); x.translate(X, Y);
    if (k === 'live') {
      x.fillStyle = grad(x, 0, 0, 256, 128, [[0, rgb(60, 10, 90)], [1, rgb(220, 40, 120)]]); x.fillRect(0, 0, 256, 128);
      for (let s = 0; s < 6; s++) { x.fillStyle = 'rgba(255,255,255,0.2)'; x.beginPath(); x.moveTo(128, 0); x.lineTo(s * 50 - 20, 128); x.lineTo(s * 50 + 10, 128); x.fill(); }
      text(x, 'LIVE', 128, 52, 56, GOTH, rgb(255, 255, 255), { glow: 'rgb(255,80,200)', blur: 16 }); text(x, '今夜 22:00', 128, 104, 22, GOTH, rgb(255, 230, 120));
    } else if (k === 'cider') {
      x.fillStyle = grad(x, 0, 0, 0, 128, [[0, rgb(120, 220, 255)], [1, rgb(20, 120, 200)]]); x.fillRect(0, 0, 256, 128);
      for (let s = 0; s < 30; s++) { x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 2; x.beginPath(); x.arc(rr(0, 256), rr(0, 128), rr(2, 8), 0, 7); x.stroke(); }
      x.fillStyle = rgb(240, 250, 255); x.fillRect(190, 20, 40, 96); x.fillStyle = rgb(40, 160, 90); x.fillRect(190, 50, 40, 30);
      text(x, 'ネオンサイダー', 96, 50, 26, GOTH, rgb(255, 255, 255), { stroke: 'rgb(20,80,160)', lw: 5 }); text(x, 'シュワッと 爽快!', 96, 92, 20, GOTH, rgb(255, 250, 150));
    } else if (k === 'idol') {
      x.fillStyle = grad(x, 0, 0, 256, 0, [[0, rgb(255, 200, 220)], [1, rgb(255, 120, 170)]]); x.fillRect(0, 0, 256, 128);
      for (let s = 0; s < 3; s++) { const cx = 50 + s * 78; x.fillStyle = rgb(60, 40, 50); x.beginPath(); x.arc(cx, 58, 24, Math.PI, 0); x.fill(); x.fillStyle = rgb(255, 225, 205); x.beginPath(); x.arc(cx, 62, 18, 0, 7); x.fill(); x.fillStyle = [rgb(250, 80, 120), rgb(80, 160, 250), rgb(250, 200, 50)][s]; x.fillRect(cx - 22, 82, 44, 46); }
      text(x, 'ゾンビーズ★', 128, 18, 22, GOTH, rgb(255, 255, 255), { stroke: 'rgb(220,40,120)', lw: 5 });
    } else if (k === 'h24') {
      x.fillStyle = rgb(250, 250, 245); x.fillRect(0, 0, 256, 128); x.fillStyle = rgb(230, 40, 40); x.fillRect(0, 0, 256, 40);
      text(x, '24時間営業', 128, 21, 30, GOTH, rgb(255, 255, 255)); text(x, 'いつでも あいてます', 128, 84, 24, GOTH, rgb(40, 40, 40));
    } else if (k === 'movie') {
      x.fillStyle = rgb(10, 8, 8); x.fillRect(0, 0, 256, 128);
      x.fillStyle = grad(x, 0, 128, 0, 30, [[0, rgb(160, 20, 10)], [1, 'rgba(0,0,0,0)']]); x.fillRect(0, 0, 256, 128);
      for (let s = 0; s < 12; s++) { x.fillStyle = rgb(20, 14, 12); const px = rr(0, 256); x.fillRect(px, rr(70, 100), rr(6, 12), 40); x.beginPath(); x.arc(px + 5, 70, 6, 0, 7); x.fill(); }
      text(x, 'ゾンビの夜', 128, 40, 40, MIN, rgb(240, 40, 30), { glow: 'rgb(255,0,0)', blur: 10 }); text(x, '近日公開', 128, 112, 18, GOTH, rgb(230, 230, 230));
    } else if (k === 'drink') {
      x.fillStyle = grad(x, 0, 0, 256, 128, [[0, rgb(250, 160, 20)], [1, rgb(240, 60, 20)]]); x.fillRect(0, 0, 256, 128);
      x.fillStyle = rgb(30, 30, 30); x.fillRect(196, 14, 36, 100); x.fillStyle = rgb(250, 220, 40); x.fillRect(196, 50, 36, 26);
      text(x, '元気', 92, 46, 48, GOTH, rgb(255, 255, 255), { stroke: 'rgb(120,20,0)', lw: 6 }); text(x, 'ファイト一本!', 92, 100, 22, GOTH, rgb(255, 250, 200));
    } else if (k === 'led') {
      x.fillStyle = rgb(6, 6, 10); x.fillRect(0, 0, 256, 128);
      for (let yy = 4; yy < 128; yy += 6) for (let xx = 4; xx < 256; xx += 6) { const v = Math.sin(xx * 0.04) * Math.cos(yy * 0.06); x.fillStyle = rgb(120 + 130 * v, 60 + 120 * Math.abs(v), 255 - 120 * v); x.fillRect(xx, yy, 4, 4); }
      text(x, '夜光ビジョン', 128, 64, 34, GOTH, rgb(255, 255, 255), { glow: 'rgb(255,255,255)', blur: 10 });
    } else {
      x.fillStyle = rgb(240, 245, 250); x.fillRect(0, 0, 256, 128); x.fillStyle = rgb(30, 90, 170); x.fillRect(0, 88, 256, 40);
      x.fillStyle = rgb(160, 180, 200); for (let s = 0; s < 5; s++) x.fillRect(20 + s * 26, 70 - s * 10, 22, 18 + s * 10);
      text(x, '新築 分譲中', 180, 40, 28, GOTH, rgb(30, 60, 120)); text(x, '駅から 徒歩3分', 128, 108, 22, GOTH, rgb(255, 255, 255));
    }
    x.restore();
    SG['ad:' + k] = 48 + i;
  });
  return c;
}
export function signUV(i) {
  if (i < 32) { const X = (i % 16) * 64, Y = ((i / 16) | 0) * 256; return [X / 1024 + 0.001, 1 - (Y + 256) / 1024 + 0.001, (X + 64) / 1024 - 0.001, 1 - Y / 1024 - 0.001]; }
  if (i < 48) { const k = i - 32, X = (k % 4) * 256, Y = 512 + ((k / 4) | 0) * 64; return [X / 1024 + 0.001, 1 - (Y + 64) / 1024 + 0.001, (X + 256) / 1024 - 0.001, 1 - Y / 1024 - 0.001]; }
  const k = i - 48, X = (k % 4) * 256, Y = 768 + ((k / 4) | 0) * 128;
  return [X / 1024 + 0.001, 1 - (Y + 128) / 1024 + 0.001, (X + 256) / 1024 - 0.001, 1 - Y / 1024 - 0.001];
}
export const V_COUNT = V_SIGNS.length;
export function signsOf(style) { return V_SIGNS.map((s, i) => [i, s[1]]).filter((s) => s[1] === style).map((s) => s[0]); }

// 看板の材質(光る)。ネオンは ときどき ちらつく(看板の場所ごとに ちがう。動きはシェーダーの中だけ)
export const SIGN_U = { uTime: { value: 0 }, uFlick: { value: 1 } };
function signMaterial(map) {
  const m = new THREE.MeshBasicMaterial({ map, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SIGN_U.uTime; sh.uniforms.uFlick = SIGN_U.uFlick;
    sh.uniforms.uCutPos = CUT.pos; sh.uniforms.uCutR = CUT.r;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uFlick; varying float vFl; varying vec3 vVP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvVP = mvPosition.xyz;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec2 cell = floor(position.xz / 2.5);
          float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
          float f = 1.0;
          if (h < 0.16) {
            float s = sin(uTime * (6.0 + h * 60.0)) + sin(uTime * (2.3 + h * 17.0) + h * 40.0);
            float off = step(1.25, s) + step(0.97, fract(uTime * 0.13 + h * 7.0)) * 0.9;
            f = 1.0 - min(1.0, off) * 0.82 * uFlick;
          }
          vFl = f;
        }`);
    // 看板も 主人公のまわりは 透かす(見下ろし・肩越しで 主人公が かくれない)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFl; varying vec3 vVP; uniform vec3 uCutPos; uniform float uCutR;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        vec4 cpv = viewMatrix * vec4(uCutPos, 1.0);
        if (vVP.z > cpv.z + 1.0) {
          float a = length(vVP.xy / -vVP.z - cpv.xy / -cpv.z) / uCutR;
          if (a < 1.0) { float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (a < 0.7 || n > (a - 0.7) / 0.3) discard; }
        }
      }`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= vFl;');
  };
  m.customProgramCacheKey = () => 'signflick2';
  return m;
}

// 材質を足す(M.facade / M.sign / M.arcade)。起動時に 1 回
export function makeDistrictMaterials(M, renderer, quality) {
  const an = quality === 'low' ? 2 : Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  const [fc, fe] = facadeAtlas();
  const map = texOf(fc, an), em = texOf(fe, an);
  M.facade = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 1.05, vertexColors: true, roughness: 0.72, metalness: 0.06 });
  M.facade.userData.s = [4, 4]; M.facade.userData.cast = true;
  cutout(M.facade);
  M.sign = signMaterial(texOf(signAtlas(), Math.min(an, 4)));
  M.sign.userData.s = [1, 1]; M.sign.userData.vis = 210;
  // アーケードの屋根(半とうめい)
  M.arcade = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, vertexColors: true, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  M.arcade.userData.s = [4, 4];
  return M;
}
