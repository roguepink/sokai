// マップ係: canvas で描く模様(テクスチャ)と、マップで使う材質(マテリアル)。
// 画像ファイルは使わない。起動時に1回だけ描く。
// 「透かし」(cutout): 主人公と カメラの間にある 壁・ビル・木 を、主人公のまわりだけ 丸く 透かして見せる。
import * as THREE from 'three';
import { seeded } from './util.js';

// 透かしの中心(主人公の位置)と 半径(画面上の大きさ。tan 単位)。World.update が毎フレーム入れる
export const CUT = { pos: { value: new THREE.Vector3(0, -999, 0) }, r: { value: 0.2 }, rf: { value: 0.32 }, near0: { value: 0 }, nearF: { value: 9.5 } };

const R = seeded(9001);
const rr = (a, b) => a + R() * (b - a);
const ri = (a, b) => Math.floor(a + R() * (b - a + 1));

function cnv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
let ANISO = 4;
function tex(c, { srgb = true, aniso = ANISO } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// 細かいザラザラ(ピクセルごとの ゆらぎ)
function grain(x, w, h, amp, mono = true) {
  const d = x.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (R() - 0.5) * amp;
    if (mono) { p[i] += n; p[i + 1] += n; p[i + 2] += n; }
    else { p[i] += (R() - 0.5) * amp; p[i + 1] += (R() - 0.5) * amp; p[i + 2] += (R() - 0.5) * amp; }
  }
  x.putImageData(d, 0, 0);
}
// ぼんやりしたシミ(つなぎ目が出ないように、はみ出た分は反対側にも描く)
function blot(x, w, h, cx, cy, r, color) {
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const X = cx + ox * w, Y = cy + oy * h;
    if (X + r < 0 || X - r > w || Y + r < 0 || Y - r > h) continue;
    const g = x.createRadialGradient(X, Y, 0, X, Y, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(X - r, Y - r, r * 2, r * 2);
  }
}
function blots(x, w, h, n, rmin, rmax, colors) {
  for (let i = 0; i < n; i++) blot(x, w, h, R() * w, R() * h, rr(rmin, rmax), colors[i % colors.length]);
}
// ひび割れ
function crack(x, x0, y0, len, width, color) {
  x.strokeStyle = color; x.lineWidth = width; x.beginPath(); x.moveTo(x0, y0);
  let a = R() * Math.PI * 2, px = x0, py = y0;
  for (let i = 0; i < len; i++) {
    a += (R() - 0.5) * 1.2; px += Math.cos(a) * 6; py += Math.sin(a) * 6; x.lineTo(px, py);
    if (R() < 0.15) { const sx = px, sy = py; x.moveTo(sx, sy); x.lineTo(sx + rr(-10, 10), sy + rr(-10, 10)); x.moveTo(px, py); }
  }
  x.stroke();
}

// ---------- 地面・道 ----------
function groundTex() {
  const S = 512, [c, x] = cnv(S);
  x.fillStyle = rgb(160, 160, 150); x.fillRect(0, 0, S, S);
  blots(x, S, S, 50, 30, 110, ['rgba(90,95,70,0.2)', 'rgba(200,195,170,0.18)', 'rgba(110,90,70,0.18)']);
  // 草・落ち葉のすじ
  for (let i = 0; i < 2600; i++) {
    const px = R() * S, py = R() * S, l = rr(2, 7), a = rr(-0.6, 0.6) - Math.PI / 2;
    x.strokeStyle = R() < 0.5 ? 'rgba(70,90,50,0.45)' : 'rgba(205,200,170,0.35)';
    x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  for (let i = 0; i < 260; i++) { x.fillStyle = R() < 0.5 ? 'rgba(120,85,55,0.5)' : 'rgba(80,80,70,0.5)'; x.beginPath(); x.ellipse(R() * S, R() * S, rr(1, 4), rr(1, 3), R() * 3, 0, 7); x.fill(); }
  grain(x, S, S, 26);
  return tex(c);
}
function asphaltTex() {
  const S = 512, [c, x] = cnv(S);
  x.fillStyle = rgb(92, 92, 96); x.fillRect(0, 0, S, S);
  blots(x, S, S, 50, 20, 90, ['rgba(60,60,64,0.45)', 'rgba(125,125,128,0.25)', 'rgba(40,38,36,0.35)']);
  // 補修の跡
  for (let i = 0; i < 5; i++) { x.fillStyle = rgb(70, 70, 74, 0.6); x.fillRect(R() * S, R() * S, rr(30, 90), rr(20, 60)); }
  for (let i = 0; i < 9; i++) crack(x, R() * S, R() * S, ri(8, 22), rr(0.8, 1.8), 'rgba(25,25,28,0.8)');
  for (let i = 0; i < 4000; i++) { x.fillStyle = R() < 0.5 ? 'rgba(150,150,150,0.5)' : 'rgba(30,30,30,0.5)'; x.fillRect(R() * S, R() * S, 1.5, 1.5); }
  grain(x, S, S, 30);
  return tex(c);
}
function sidewalkTex() {   // 4m × 4m。1m の石板
  const S = 256, [c, x] = cnv(S), n = 4, q = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = ri(165, 195); x.fillStyle = rgb(v, v - 2, v - 6); x.fillRect(i * q, j * q, q, q);
  }
  blots(x, S, S, 20, 10, 50, ['rgba(80,75,70,0.25)', 'rgba(230,225,215,0.2)']);
  x.strokeStyle = 'rgba(60,58,55,0.9)'; x.lineWidth = 2;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * q, 0); x.lineTo(i * q, S); x.stroke(); x.beginPath(); x.moveTo(0, i * q); x.lineTo(S, i * q); x.stroke(); }
  for (let i = 0; i < 4; i++) crack(x, R() * S, R() * S, ri(4, 9), 0.8, 'rgba(50,48,45,0.7)');
  grain(x, S, S, 22);
  return tex(c);
}
function paveTex() {       // 広場の石だたみ(4m)
  const S = 256, [c, x] = cnv(S), n = 8, q = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j % 2) * q / 2, v = ri(140, 175);
    x.fillStyle = rgb(v, v - 1, v - 3); x.fillRect(i * q + o, j * q, q, q); x.fillRect(i * q + o - S, j * q, q, q);
    x.strokeStyle = 'rgba(60,60,60,0.9)'; x.lineWidth = 2; x.strokeRect(i * q + o, j * q, q, q); x.strokeRect(i * q + o - S, j * q, q, q);
  }
  blots(x, S, S, 16, 10, 40, ['rgba(70,60,50,0.25)']);
  grain(x, S, S, 22);
  return tex(c);
}
function paintTex() {      // 道の白線(すり減り)
  const S = 128, [c, x] = cnv(S);
  x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(110,110,110,${rr(0.2, 0.7)})`; x.beginPath(); x.ellipse(R() * S, R() * S, rr(1, 6), rr(1, 4), R() * 3, 0, 7); x.fill(); }
  grain(x, S, S, 20);
  return tex(c);
}

// ---------- ビルの壁(窓) ----------
// 4 区画 × 4 階 = 12m × 14m。emissive は 明かりのついた窓
function officeTex() {
  const S = 512, [c, x] = cnv(S), [ce, e] = cnv(S);
  x.fillStyle = rgb(196, 196, 192); x.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  blots(x, S, S, 18, 20, 70, ['rgba(120,120,115,0.25)']);
  const bw = S / 4, bh = S / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const X = i * bw + 8, Y = j * bh + 16, W = bw - 16, H = bh - 34;
    const g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, rgb(120, 140, 160)); g.addColorStop(0.5, rgb(55, 66, 80)); g.addColorStop(1, rgb(30, 36, 44));
    x.fillStyle = g; x.fillRect(X, Y, W, H);
    const k = R();
    if (k < 0.18) {        // 明かり
      const warm = R() < 0.75;
      e.fillStyle = warm ? rgb(255, 180, 110) : rgb(120, 160, 255); e.fillRect(X, Y, W, H);
      x.fillStyle = warm ? rgb(200, 160, 110) : rgb(110, 130, 170); x.fillRect(X, Y, W, H);
    } else if (k < 0.3) {  // 割れた窓
      x.fillStyle = rgb(12, 12, 14); x.beginPath(); x.moveTo(X, Y); x.lineTo(X + W * rr(0.3, 0.9), Y);
      x.lineTo(X + W * rr(0.2, 0.6), Y + H * rr(0.3, 0.7)); x.lineTo(X + W, Y + H * rr(0.4, 1)); x.lineTo(X + W, Y + H); x.lineTo(X, Y + H); x.fill();
    } else if (k < 0.45) { // ブラインド
      x.fillStyle = rgb(170, 165, 150); x.fillRect(X, Y, W, H * rr(0.3, 0.9));
      x.strokeStyle = 'rgba(90,90,80,0.6)'; for (let yy = Y; yy < Y + H * 0.9; yy += 4) { x.beginPath(); x.moveTo(X, yy); x.lineTo(X + W, yy); x.stroke(); }
    }
    x.strokeStyle = rgb(70, 72, 76); x.lineWidth = 3; x.strokeRect(X, Y, W, H);
    x.beginPath(); x.moveTo(X + W / 2, Y); x.lineTo(X + W / 2, Y + H); x.stroke();
    x.fillStyle = rgb(150, 150, 146); x.fillRect(X - 4, Y + H, W + 8, 5);
    // 窓の下の 汚れのすじ
    for (let s = 0; s < 3; s++) { x.fillStyle = 'rgba(80,78,72,0.18)'; x.fillRect(X + R() * W, Y + H + 5, rr(2, 6), rr(8, 22)); }
  }
  grain(x, S, S, 16);
  return [tex(c), tex(ce)];
}
function aptTex() {        // れんがのアパート(12m × 12m)
  const S = 512, [c, x] = cnv(S), [ce, e] = cnv(S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) for (let i = -1; i < S / 20 + 1; i++) {
    const v = rr(0.85, 1.15); x.fillStyle = rgb(150 * v, 82 * v, 62 * v); x.fillRect(i * 20 + ((y / 8) % 2) * 10, y, 19, 7);
  }
  x.fillStyle = 'rgba(190,180,170,0.25)'; for (let y = 7; y < S; y += 8) x.fillRect(0, y, S, 1);
  blots(x, S, S, 14, 20, 80, ['rgba(60,40,30,0.25)', 'rgba(220,200,180,0.15)']);
  const bw = S / 4, bh = S / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const X = i * bw + 34, Y = j * bh + 24, W = bw - 68, H = bh - 50;
    x.fillStyle = rgb(225, 220, 210); x.fillRect(X - 5, Y - 5, W + 10, H + 10);
    const k = R();
    x.fillStyle = k < 0.2 ? rgb(190, 150, 100) : k < 0.3 ? rgb(10, 10, 12) : rgb(40, 48, 58);
    x.fillRect(X, Y, W, H);
    if (k < 0.2) { e.fillStyle = rgb(255, 170, 90); e.fillRect(X, Y, W, H); }
    if (k >= 0.3 && R() < 0.5) { x.fillStyle = [rgb(150, 60, 60), rgb(60, 90, 130), rgb(170, 150, 90)][ri(0, 2)]; x.fillRect(X, Y, W * 0.3, H); x.fillRect(X + W * 0.7, Y, W * 0.3, H); }
    x.fillStyle = rgb(230, 225, 215); x.fillRect(X + W / 2 - 1, Y, 3, H); x.fillRect(X - 8, Y + H + 4, W + 16, 6);
    if (R() < 0.3) { x.fillStyle = rgb(200, 200, 195); x.fillRect(X + W - 22, Y + H + 12, 24, 14); }  // エアコン
  }
  grain(x, S, S, 18);
  return [tex(c), tex(ce)];
}
function ribbonTex() {     // コンクリートの横長窓(12m × 14m)
  const S = 512, [c, x] = cnv(S), [ce, e] = cnv(S);
  x.fillStyle = rgb(205, 200, 188); x.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  blots(x, S, S, 20, 20, 80, ['rgba(110,105,95,0.25)']);
  const bh = S / 4;
  for (let j = 0; j < 4; j++) {
    const Y = j * bh + 22, H = bh - 48;
    const g = x.createLinearGradient(0, Y, 0, Y + H);
    g.addColorStop(0, rgb(110, 125, 135)); g.addColorStop(1, rgb(35, 40, 48));
    x.fillStyle = g; x.fillRect(0, Y, S, H);
    for (let i = 0; i < 16; i++) {
      const k = R();
      if (k < 0.16) { e.fillStyle = R() < 0.8 ? rgb(255, 200, 140) : rgb(160, 200, 255); e.fillRect(i * 32 + 2, Y, 28, H); x.fillStyle = rgb(190, 170, 140); x.fillRect(i * 32 + 2, Y, 28, H); }
      else if (k < 0.24) { x.fillStyle = rgb(10, 10, 12); x.fillRect(i * 32 + 2, Y + H * rr(0, 0.5), 28, H * 0.6); }
      x.fillStyle = rgb(60, 62, 66); x.fillRect(i * 32, Y, 3, H);
    }
    x.fillStyle = rgb(80, 80, 80); x.fillRect(0, Y - 3, S, 3); x.fillRect(0, Y + H, S, 3);
    for (let s = 0; s < 14; s++) { x.fillStyle = 'rgba(70,65,60,0.2)'; x.fillRect(R() * S, Y + H + 3, rr(2, 6), rr(10, 26)); }
  }
  grain(x, S, S, 16);
  return [tex(c), tex(ce)];
}
function shopTex() {       // 1階の店先(12m × 4.5m)
  const W = 512, H = 192, [c, x] = cnv(W, H), [ce, e] = cnv(W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  x.fillStyle = rgb(90, 88, 86); x.fillRect(0, 0, W, H);
  const shops = 2, sw = W / shops;
  const signs = [[200, 60, 50], [40, 110, 170], [60, 150, 80], [220, 170, 40], [150, 70, 160], [230, 120, 40]];
  for (let s = 0; s < shops; s++) {
    const X = s * sw;
    const col = signs[ri(0, signs.length - 1)];
    x.fillStyle = rgb(...col); x.fillRect(X + 6, 6, sw - 12, 34);
    x.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = 0; k < 5; k++) x.fillRect(X + 30 + k * 34, 14, 22, 18);
    if (R() < 0.6) { e.fillStyle = rgb(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8); e.fillRect(X + 6, 6, sw - 12, 34); }
    const shut = R() < 0.4;
    if (shut) {           // シャッター(落書き)
      x.fillStyle = rgb(150, 150, 150); x.fillRect(X + 10, 48, sw - 20, H - 52);
      x.fillStyle = 'rgba(70,70,70,0.6)'; for (let yy = 50; yy < H; yy += 5) x.fillRect(X + 10, yy, sw - 20, 1);
      for (let k = 0; k < 6; k++) { x.strokeStyle = rgb(...signs[ri(0, 5)], 0.85); x.lineWidth = rr(3, 7); x.beginPath(); x.moveTo(X + rr(20, sw - 20), rr(70, H - 10)); for (let q = 0; q < 4; q++) x.lineTo(X + rr(20, sw - 20), rr(70, H - 10)); x.stroke(); }
    } else {
      const g = x.createLinearGradient(0, 48, 0, H);
      g.addColorStop(0, rgb(90, 105, 120)); g.addColorStop(1, rgb(25, 28, 34));
      x.fillStyle = g; x.fillRect(X + 10, 48, sw - 20, H - 52);
      if (R() < 0.55) { e.fillStyle = rgb(200, 160, 110); e.fillRect(X + 12, 50, sw - 24, H - 56); x.fillStyle = rgb(150, 130, 100); x.fillRect(X + 12, 50, sw - 24, H - 56); }
      if (R() < 0.4) { x.fillStyle = rgb(8, 8, 10); x.beginPath(); x.moveTo(X + 20, H - 4); x.lineTo(X + rr(40, 120), rr(70, 120)); x.lineTo(X + rr(120, 200), H - 4); x.fill(); }
      x.fillStyle = rgb(50, 50, 52); x.fillRect(X + sw / 2 - 26, 60, 52, H - 64);
      x.strokeStyle = rgb(40, 40, 40); x.lineWidth = 4; x.strokeRect(X + 10, 48, sw - 20, H - 52);
    }
  }
  grain(x, W, H, 14);
  return [tex(c), tex(ce)];
}
function roofTex() {
  const S = 256, [c, x] = cnv(S);
  x.fillStyle = rgb(110, 108, 104); x.fillRect(0, 0, S, S);
  blots(x, S, S, 30, 10, 50, ['rgba(60,58,55,0.35)', 'rgba(150,148,140,0.25)']);
  x.strokeStyle = 'rgba(70,68,64,0.6)'; x.lineWidth = 1; for (let i = 0; i < S; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); }
  grain(x, S, S, 30);
  return tex(c);
}

// ---------- 建物の中 ----------
function plasterTex() {    // 内壁(下に幅木)
  const S = 256, [c, x] = cnv(S);
  x.fillStyle = rgb(225, 222, 212); x.fillRect(0, 0, S, S);
  blots(x, S, S, 10, 20, 70, ['rgba(150,140,120,0.08)']);
  const g = x.createLinearGradient(0, S * 0.7, 0, S);
  g.addColorStop(0, 'rgba(90,80,60,0)'); g.addColorStop(1, 'rgba(90,80,60,0.35)');
  x.fillStyle = g; x.fillRect(0, S * 0.7, S, S * 0.3);
  x.fillStyle = rgb(90, 85, 78); x.fillRect(0, S - 10, S, 10);
  grain(x, S, S, 12);
  return tex(c);
}
function tileTex() {       // 床タイル(4m に 8×8)
  const S = 256, [c, x] = cnv(S), n = 8, q = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = ri(205, 230); x.fillStyle = rgb(v, v, v - 4); x.fillRect(i * q, j * q, q, q); }
  x.strokeStyle = 'rgba(110,108,100,0.9)'; x.lineWidth = 2;
  for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * q, 0); x.lineTo(i * q, S); x.stroke(); x.beginPath(); x.moveTo(0, i * q); x.lineTo(S, i * q); x.stroke(); }
  blots(x, S, S, 6, 30, 80, ['rgba(100,90,70,0.08)']);
  grain(x, S, S, 10);
  return tex(c);
}
function linoTex() {
  const S = 256, [c, x] = cnv(S);
  x.fillStyle = rgb(200, 205, 198); x.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) { x.fillStyle = R() < 0.5 ? 'rgba(140,150,140,0.5)' : 'rgba(240,240,235,0.6)'; x.fillRect(R() * S, R() * S, 2, 2); }
  x.fillStyle = 'rgba(120,125,118,0.8)'; x.fillRect(0, 0, S, 2); x.fillRect(0, 0, 2, S);
  blots(x, S, S, 5, 30, 80, ['rgba(110,100,80,0.08)']);
  grain(x, S, S, 10);
  return tex(c);
}
function woodTex() {       // 板の床(4m)
  const S = 256, [c, x] = cnv(S), n = 8, q = S / n;
  for (let j = 0; j < n; j++) {
    let X = -R() * 120;
    while (X < S) {
      const L = rr(80, 160), v = rr(0.8, 1.15);
      x.fillStyle = rgb(150 * v, 112 * v, 80 * v); x.fillRect(X, j * q, L, q);
      for (let k = 0; k < 5; k++) { x.strokeStyle = `rgba(90,55,30,${rr(0.1, 0.3)})`; x.lineWidth = 1; const yy = j * q + R() * q; x.beginPath(); x.moveTo(X, yy); x.bezierCurveTo(X + L / 3, yy + rr(-3, 3), X + L * 2 / 3, yy + rr(-3, 3), X + L, yy); x.stroke(); }
      x.fillStyle = 'rgba(50,30,15,0.8)'; x.fillRect(X, j * q, 2, q);
      X += L;
    }
    x.fillStyle = 'rgba(50,30,15,0.8)'; x.fillRect(0, j * q, S, 2);
  }
  grain(x, S, S, 14);
  return tex(c);
}
function concreteTex() {   // 工場・倉庫の床、打ちっぱなし(8m)
  const S = 256, [c, x] = cnv(S);
  x.fillStyle = rgb(160, 160, 158); x.fillRect(0, 0, S, S);
  blots(x, S, S, 14, 30, 90, ['rgba(100,100,98,0.16)', 'rgba(200,200,195,0.14)', 'rgba(70,60,50,0.12)']);
  x.strokeStyle = 'rgba(80,80,80,0.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.stroke();
  for (let i = 0; i < 3; i++) crack(x, R() * S, R() * S, ri(4, 10), 0.8, 'rgba(60,60,60,0.6)');
  grain(x, S, S, 18);
  return tex(c);
}
function corrugatedTex() { // 波板(4m)
  const S = 256, [c, x] = cnv(S);
  for (let i = 0; i < S; i += 8) {
    const g = x.createLinearGradient(i, 0, i + 8, 0);
    g.addColorStop(0, rgb(150, 150, 150)); g.addColorStop(0.5, rgb(225, 225, 225)); g.addColorStop(1, rgb(130, 130, 130));
    x.fillStyle = g; x.fillRect(i, 0, 8, S);
  }
  blots(x, S, S, 14, 10, 50, ['rgba(120,70,30,0.35)', 'rgba(60,60,60,0.25)']);
  grain(x, S, S, 14);
  return tex(c);
}
function decalTex() {      // 4×4 の シール(シミ・血・ひび・落ち葉・紙くず)
  const S = 512, [c, x] = cnv(S), q = S / 4;
  x.clearRect(0, 0, S, S);
  const cell = (i, j, fn) => { x.save(); x.translate(i * q + q / 2, j * q + q / 2); fn(); x.restore(); };
  const splat = (col, n, r) => { for (let k = 0; k < n; k++) { const a = R() * 7, d = R() * r; x.fillStyle = col; x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, rr(2, r * 0.45) * (1 - d / r * 0.7), 0, 7); x.fill(); } };
  // 0,0 油のシミ
  cell(0, 0, () => { const g = x.createRadialGradient(0, 0, 0, 0, 0, q * 0.45); g.addColorStop(0, 'rgba(15,15,18,0.8)'); g.addColorStop(0.7, 'rgba(25,25,30,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(0, 0, q * 0.45, q * 0.32, 0.3, 0, 7); x.fill(); });
  // 1..3,0 血しぶき
  for (let i = 1; i < 4; i++) cell(i, 0, () => { splat('rgba(95,8,6,0.85)', 30, q * 0.42); splat('rgba(60,4,4,0.9)', 10, q * 0.2); });
  // 0,1 ひび
  cell(0, 1, () => { for (let k = 0; k < 5; k++) crack(x, 0, 0, ri(5, 9), 1.5, 'rgba(20,20,20,0.85)'); });
  // 1,1 落ち葉
  cell(1, 1, () => { for (let k = 0; k < 26; k++) { x.fillStyle = [rgb(140, 90, 40, 0.9), rgb(110, 60, 30, 0.9), rgb(160, 130, 50, 0.9)][k % 3]; x.beginPath(); x.ellipse(rr(-50, 50), rr(-50, 50), rr(4, 8), rr(2, 4), R() * 3, 0, 7); x.fill(); } });
  // 2,1 紙くず・ゴミ
  cell(2, 1, () => { for (let k = 0; k < 14; k++) { x.fillStyle = R() < 0.6 ? rgb(220, 215, 200, 0.95) : rgb(90, 110, 150, 0.95); x.save(); x.translate(rr(-50, 50), rr(-50, 50)); x.rotate(R() * 3); x.fillRect(-6, -4, rr(8, 16), rr(6, 10)); x.restore(); } });
  // 3,1 焦げあと
  cell(3, 1, () => { const g = x.createRadialGradient(0, 0, 0, 0, 0, q * 0.48); g.addColorStop(0, 'rgba(5,5,5,0.95)'); g.addColorStop(0.6, 'rgba(20,15,10,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(-q / 2, -q / 2, q, q); });
  // 0,2 マンホール
  cell(0, 2, () => { x.fillStyle = rgb(45, 45, 48); x.beginPath(); x.arc(0, 0, q * 0.4, 0, 7); x.fill(); x.strokeStyle = rgb(80, 80, 82); x.lineWidth = 3; for (let r = 10; r < q * 0.4; r += 9) { x.beginPath(); x.arc(0, 0, r, 0, 7); x.stroke(); } });
  // 1,2 泥のあと
  cell(1, 2, () => { for (let k = 0; k < 14; k++) { const a = R() * 7, d = R() * q * 0.3, r = rr(8, 22); const g = x.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r); g.addColorStop(0, 'rgba(60,48,30,0.45)'); g.addColorStop(1, 'rgba(60,48,30,0)'); x.fillStyle = g; x.fillRect(-q / 2, -q / 2, q, q); } });
  // 2,2 タイヤのあと
  cell(2, 2, () => { x.strokeStyle = 'rgba(15,15,15,0.7)'; x.lineWidth = 9; for (const o of [-18, 18]) { x.beginPath(); x.moveTo(-60, o); x.bezierCurveTo(-20, o - 20, 20, o + 20, 60, o); x.stroke(); } });
  // 3,2 黄色の「危険」線
  cell(3, 2, () => { for (let k = -4; k < 4; k++) { x.fillStyle = k % 2 ? rgb(230, 190, 30, 0.95) : rgb(20, 20, 20, 0.95); x.beginPath(); x.moveTo(k * 16 - 8, -20); x.lineTo(k * 16 + 8, -20); x.lineTo(k * 16 + 24, 20); x.lineTo(k * 16 + 8, 20); x.fill(); } });
  // 1,3 土の道(上下がぼける。左右はつながる)
  x.save(); x.beginPath(); x.rect(q, 3 * q, q, q); x.clip();
  for (let k = 0; k < 90; k++) {
    const px = q + R() * q, py = 3 * q + q / 2 + (R() - 0.5) * q * 0.45, r = rr(10, 26);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(125,98,66,0.55)'); g.addColorStop(1, 'rgba(125,98,66,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let k = 0; k < 140; k++) { x.fillStyle = R() < 0.5 ? 'rgba(80,62,40,0.6)' : 'rgba(170,150,115,0.5)'; x.fillRect(q + R() * q, 3 * q + q * 0.25 + R() * q * 0.5, 2, 2); }
  x.restore();
  // 0,3 草のかたまり
  for (let i = 0; i < 1; i++) cell(i, 3, () => { for (let k = 0; k < 60; k++) { x.strokeStyle = rgb(60 + R() * 40, 90 + R() * 50, 40, 0.9); x.lineWidth = 1.5; const px = rr(-50, 50), py = rr(-30, 50); x.beginPath(); x.moveTo(px, py); x.lineTo(px + rr(-6, 6), py - rr(8, 22)); x.stroke(); } });
  return tex(c, { aniso: 2 });
}
function glowTex() {
  const S = 128, [c, x] = cnv(S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = tex(c, { aniso: 1 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function waterTex() {
  const S = 256, [c, x] = cnv(S);
  x.fillStyle = rgb(40, 70, 85); x.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i++) {
    x.strokeStyle = R() < 0.5 ? 'rgba(150,190,200,0.35)' : 'rgba(10,30,40,0.4)'; x.lineWidth = rr(1, 2.5);
    const px = R() * S, py = R() * S, l = rr(8, 30);
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + l / 2, py + rr(-3, 3), px + l, py); x.stroke();
  }
  return tex(c);
}
function flameTex() {      // 炎(縦長、下が明るい)
  const W = 64, H = 128, [c, x] = cnv(W, H);
  for (let k = 0; k < 40; k++) {
    const px = W / 2 + rr(-12, 12), py = rr(H * 0.35, H * 0.95), r = rr(8, 22);
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,230,160,0.55)'); g.addColorStop(0.5, 'rgba(255,120,30,0.3)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  const t = tex(c, { aniso: 1 }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 主人公のまわりを 丸く透かす(壁・ビル・木)
// near: カメラにこれより近い所(m)を ぼかして消す(カメラの前の木の葉)
export function cutout(mat, radius = CUT.r, near = CUT.near0) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCutPos = CUT.pos; sh.uniforms.uCutR = radius; sh.uniforms.uNear = near;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCutPos;\nuniform float uCutR;\nuniform float uNear;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      {
        vec4 cpv = viewMatrix * vec4(uCutPos, 1.0);
        vec3 fpv = -vViewPosition;
        float dn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (uNear > 0.0 && -fpv.z < uNear && dn > (-fpv.z - uNear + 3.0) / 3.0) discard;
        if (fpv.z > cpv.z + 1.0) {
          vec2 dd = fpv.xy / -fpv.z - cpv.xy / -cpv.z;
          float a = length(dd) / uCutR;
          if (a < 1.0) {
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (a < 0.7 || n > (a - 0.7) / 0.3) discard;
          }
        }
      }`);
  };
  mat.customProgramCacheKey = () => 'cutout1';
  return mat;
}

// マップで使う材質をまとめて作る。userData.s = 模様1枚が何 m か [横, 縦]、cast = 影を落とす
export function makeMaterials(renderer, quality) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  if (quality === 'low') ANISO = Math.min(ANISO, 2);
  const std = (o, s = [4, 4], { cast = false, cut = false } = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });
    m.userData.s = s; m.userData.cast = cast;
    if (cut) cutout(m);
    return m;
  };
  const [offT, offE] = officeTex(), [aptT, aptE] = aptTex(), [ribT, ribE] = ribbonTex(), [shopT, shopE] = shopTex();
  const glowT = glowTex();
  const M = {
    ground: std({ map: groundTex(), roughness: 1 }, [16, 16]),
    asphalt: std({ map: asphaltTex(), roughness: 0.95 }, [12, 12]),
    sidewalk: std({ map: sidewalkTex(), roughness: 0.9 }, [4, 4]),
    pave: std({ map: paveTex(), roughness: 0.9 }, [7, 7]),
    paint: std({ map: paintTex(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }, [2, 2]),
    office: std({ map: offT, emissiveMap: offE, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.6, metalness: 0.1 }, [12, 14], { cast: true, cut: true }),
    apt: std({ map: aptT, emissiveMap: aptE, emissive: 0xffffff, emissiveIntensity: 1.3 }, [12, 12], { cast: true, cut: true }),
    ribbon: std({ map: ribT, emissiveMap: ribE, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.75 }, [12, 14], { cast: true, cut: true }),
    shop: std({ map: shopT, emissiveMap: shopE, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.7 }, [12, 4.5], { cast: true, cut: true }),
    roof: std({ map: roofTex(), roughness: 1 }, [8, 8], { cast: true, cut: true }),
    plaster: std({ map: plasterTex() }, [4, 5], { cast: true, cut: true }),
    tile: std({ map: tileTex(), roughness: 0.45 }, [4, 4]),
    lino: std({ map: linoTex(), roughness: 0.5 }, [4, 4]),
    wood: std({ map: woodTex(), roughness: 0.75 }, [4, 4], { cast: true, cut: true }),
    woodFloor: std({ map: woodTex(), roughness: 0.6 }, [5, 5]),
    concrete: std({ map: concreteTex(), roughness: 0.95 }, [8, 8], { cast: true, cut: true }),
    floorC: std({ map: concreteTex(), roughness: 0.8 }, [8, 8]),
    metal: std({ map: corrugatedTex(), roughness: 0.55, metalness: 0.35 }, [4, 4], { cast: true, cut: true }),
    plain: std({ roughness: 0.8 }, [4, 4], { cast: true, cut: true }),       // 色だけ(家具・道具)
    plainNoCut: std({ roughness: 0.7 }, [4, 4], { cast: true }),
    decal: std({ map: decalTex(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }, [1, 1]),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    pool: new THREE.MeshBasicMaterial({ map: glowT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    water: new THREE.MeshStandardMaterial({ map: waterTex(), color: 0x9fb8c0, roughness: 0.15, metalness: 0.2, emissive: 0x0a1820, transparent: true, opacity: 0.92 }),
    flame: new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, color: 0xffffff }),
    foliage: cutout(std({ roughness: 0.95, flatShading: true }, [4, 4], { cast: true }), CUT.rf, CUT.nearF),
    rock: std({ roughness: 1, flatShading: true }, [4, 4], { cast: true }),
    car: std({ roughness: 0.45, metalness: 0.3 }, [4, 4], { cast: true, cut: true }),
    ceiling: std({ map: plasterTex(), roughness: 0.95 }, [4, 4]),
  };
  // 遠くでは描かない距離(m)。小さい物・床・シールは近くだけ(描く回数を へらす)
  const VIS = { decal: 95, paint: 120, pool: 110, glow: 230, plain: 165, plainNoCut: 140, car: 175, tile: 85, lino: 85, woodFloor: 85, ceiling: 80, flame: 160, rock: 150, wood: 170, floorC: 150, plaster: 120 };
  for (const k in VIS) if (M[k]) M[k].userData.vis = VIS[k];
  M.glow.userData.s = [1, 1]; M.pool.userData.s = [1, 1]; M.water.userData.s = [12, 12]; M.flame.userData.s = [1, 1];
  M.water.map.repeat.set(1, 1);
  M._glowTex = glowT;
  return M;
}
