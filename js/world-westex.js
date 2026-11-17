// マップ係(第5弾・西部の町): 西部劇の町の 壁・屋根・地面・看板の模様を 1 枚の「まとめ絵」に描く。
//  - 1024×1024。上の 5 段(128px × 8 列 = 40 マス)が 壁・屋根・地面・室内、下の 6 段(256×64 が 4 列 = 24 枚)が 看板
//  - 材質は 1 つだけ(M.west)。西部の町の建物・歩道・道・岩山は ぜんぶ この材質 = 描く回数が ふえない
//  - 看板の字は 架空の店の名前(英語の西部風の書体 + 小さい日本語)。町の名前は「SKULLDUST(ウエスタン通り)」
import * as THREE from '../vendor/three/build/three.module.min.js';
import { seeded } from './util.js';
import { cutout } from './world-tex.js';

const R = seeded(1881);
const rr = (a, b) => a + R() * (b - a);
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const SLAB = '"Rockwell","Clarendon","Bookman Old Style","Georgia","Times New Roman",serif';
const JP = '"Hiragino Mincho ProN","Noto Serif JP","Noto Serif CJK JP","Yu Mincho",serif';
const TS = 128, N = 8, AT = 1024, SY = 640;

// マスの番号
export const WT = {
  clap: 0, board: 1, clapWin: 2, clapLit: 3, boardWin: 4, door: 5, store: 6, barn: 7,
  arch: 8, brick: 9, brickWin: 10, brickDoor: 11, cornice: 12, curtain: 13, curtainLit: 14, saloonWin: 15,
  walk: 16, shingle: 17, tin: 18, ruts: 19, hoof: 20, dirt: 21, rail: 22, straw: 23,
  bar: 24, paper: 25, wanted: 26, piano: 27, vault: 28, felt: 29, strata: 30, rockTop: 31,
  mine: 32, churchDoor: 33, canvas: 34, tnt: 35, staves: 36, stall: 37, bars: 38, poster: 39,
};
export function wUV(t) {
  const c = t % N, r = (t / N) | 0, e = 1.5 / AT;
  return [c / N + e, 1 - (r + 1) / N + e, (c + 1) / N - e, 1 - r / N - e];
}
// 看板(名前 → 番号)
const SIGNS = [
  ['SALOON', '酒場', 'red'], ['SHERIFF', '保安官', 'black'], ['BANK', '銀行', 'green'], ['GENERAL STORE', '雑貨', 'cream'],
  ['HOTEL', '宿', 'blue'], ['BLACKSMITH', '鍛冶屋', 'black'], ['LIVERY STABLE', '馬屋', 'cream'], ['UNDERTAKER', '葬儀屋', 'black'],
  ['BARBER', '床屋', 'cream'], ['TELEGRAPH', '電信', 'green'], ['GUNSMITH', '鉄砲屋', 'red'], ['ASSAY OFFICE', '金の鑑定', 'mustard'],
  ['DOCTOR', '医者', 'cream'], ['BOOT HILL', '墓場', 'gray'], ['SKULLDUST STATION', '駅', 'cream'], ['SKULLDUST', '', 'gate'],
  ['ウエスタン通り', '', 'jp'], ['↑ ウエスタン通り', '', 'arrow'], ['DANGER  T N T', '火薬', 'danger'], ['GOLD MINE', '金鉱', 'mustard'],
  ['FEED & GRAIN', 'えさ屋', 'green'], ['JAIL', '牢', 'gray'], ['WANTED', 'おたずね者', 'cream'], ['CHAPEL', '教会', 'blue'],
];
export const WS = {};
SIGNS.forEach((s, i) => { WS[s[0]] = i; });
export function wSignUV(i) {
  const X = (i % 4) * 256, Y = SY + ((i / 4) | 0) * 64, e = 1 / AT;
  return [X / AT + e, 1 - (Y + 64) / AT + e, (X + 256) / AT - e, 1 - Y / AT - e];
}

function grad(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; }
function stain(x, n, col, W = TS, H = TS) {
  for (let i = 0; i < n; i++) {
    const px = R() * W, py = R() * H, r = rr(8, 28);
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}
function speck(x, n, cols, W = TS, H = TS) { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(R() * W, R() * H, rr(1, 3), rr(1, 3)); } }
// 日に焼けた板(横ばり = 下見板 / たてばり)
const WOOD = [198, 172, 140];
function clap(x, base = WOOD, step = 16) {
  for (let y = 0; y < TS; y += step) {
    const k = rr(0.88, 1.06);
    x.fillStyle = grad(x, 0, y, 0, y + step, [[0, rgb(base[0] * k * 1.06, base[1] * k * 1.05, base[2] * k * 1.03)], [0.8, rgb(base[0] * k * 0.9, base[1] * k * 0.9, base[2] * k * 0.9)], [1, rgb(base[0] * 0.45, base[1] * 0.42, base[2] * 0.4)]]);
    x.fillRect(0, y, TS, step);
    x.fillStyle = 'rgba(60,40,24,0.35)'; for (let k2 = 0; k2 < 3; k2++) x.fillRect(rr(0, TS), y + rr(2, step - 4), rr(8, 30), 1);
    x.fillStyle = 'rgba(40,26,16,0.6)'; x.fillRect(rr(0, TS), y, 1.5, step);
  }
}
function boards(x, base = WOOD, step = 16) {
  for (let px = 0; px < TS; px += step) {
    const k = rr(0.84, 1.06);
    x.fillStyle = rgb(base[0] * k, base[1] * k, base[2] * k); x.fillRect(px, 0, step, TS);
    x.fillStyle = 'rgba(60,40,24,0.3)'; for (let k2 = 0; k2 < 4; k2++) x.fillRect(px + rr(2, step - 3), rr(0, TS), 1, rr(10, 40));
    x.fillStyle = 'rgba(30,18,10,0.75)'; x.fillRect(px, 0, 2, TS);
    x.fillStyle = 'rgba(255,240,215,0.25)'; x.fillRect(px + 2, 0, 1.5, TS);
  }
}
// 窓(4 枚ガラス)。lit = 夜に光る色
function win(x, e, X, Y, W, H, lit = null, frame = [112, 84, 58]) {
  x.fillStyle = rgb(...frame); x.fillRect(X - 5, Y - 5, W + 10, H + 10);
  x.fillStyle = rgb(frame[0] * 1.3, frame[1] * 1.3, frame[2] * 1.3); x.fillRect(X - 7, Y + H + 4, W + 14, 5);
  if (lit) { x.fillStyle = rgb(lit[0] * 0.8, lit[1] * 0.72, lit[2] * 0.6); x.fillRect(X, Y, W, H); e.fillStyle = rgb(...lit); e.fillRect(X, Y, W, H); }
  else { x.fillStyle = grad(x, 0, Y, 0, Y + H, [[0, rgb(96, 108, 116)], [0.5, rgb(44, 48, 52)], [1, rgb(22, 22, 24)]]); x.fillRect(X, Y, W, H); x.fillStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.moveTo(X, Y + H * 0.7); x.lineTo(X + W * 0.6, Y); x.lineTo(X + W * 0.85, Y); x.lineTo(X, Y + H); x.fill(); }
  x.fillStyle = rgb(...frame); e.fillStyle = '#000';
  for (const k of [x, e]) { k.fillRect(X + W / 2 - 2, Y, 4, H); k.fillRect(X, Y + H / 2 - 2, W, 4); }
}
function bricks(x) {
  x.fillStyle = rgb(96, 84, 76); x.fillRect(0, 0, TS, TS);
  for (let r = 0; r < 12; r++) for (let k = -1; k < 5; k++) {
    const v = rr(0.82, 1.1); x.fillStyle = rgb(168 * v, 82 * v, 62 * v);
    x.fillRect(k * 32 + (r % 2) * 16 + 1, r * 10.67 + 1, 30, 8.8);
  }
  stain(x, 3, 'rgba(40,20,14,0.3)');
}
function text(x, s, cx, cy, size, font, fill, o = {}) {
  x.font = `${o.weight || 'bold'} ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (o.shadow) { x.fillStyle = o.shadow; x.fillText(s, cx + (o.sd || 2), cy + (o.sd || 2), o.max); }
  if (o.stroke) { x.lineWidth = o.lw || 4; x.strokeStyle = o.stroke; x.lineJoin = 'round'; x.strokeText(s, cx, cy, o.max); }
  x.fillStyle = fill; x.fillText(s, cx, cy, o.max);
}

function atlas() {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = AT; return [c, c.getContext('2d')]; };
  const [c, X] = mk(), [ce, E] = mk();
  E.fillStyle = '#000'; E.fillRect(0, 0, AT, AT);
  const cell = (t, fn) => {
    const cx = (t % N) * TS, cy = ((t / N) | 0) * TS;
    for (const k of [X, E]) { k.save(); k.beginPath(); k.rect(cx, cy, TS, TS); k.clip(); k.translate(cx, cy); }
    fn(X, E); X.restore(); E.restore();
  };
  const WARM = [255, 196, 110];
  // --- 0 段: 板の壁・窓・戸
  cell(WT.clap, (x) => { clap(x); stain(x, 2, 'rgba(70,48,30,0.22)'); });
  cell(WT.board, (x) => { boards(x); stain(x, 2, 'rgba(70,48,30,0.22)'); });
  cell(WT.clapWin, (x, e) => { clap(x); win(x, e, 34, 26, 60, 72); });
  cell(WT.clapLit, (x, e) => { clap(x); win(x, e, 34, 26, 60, 72, WARM); });
  cell(WT.boardWin, (x, e) => { boards(x); win(x, e, 30, 30, 68, 60); x.fillStyle = rgb(86, 110, 96); x.fillRect(14, 26, 12, 70); x.fillRect(102, 26, 12, 70); });
  const doorP = (x, X0, W, col) => {
    x.fillStyle = rgb(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55); x.fillRect(X0 - 5, 14, W + 10, TS - 14);
    x.fillStyle = rgb(...col); x.fillRect(X0, 20, W, TS - 20);
    x.fillStyle = rgb(col[0] * 0.72, col[1] * 0.72, col[2] * 0.72); for (const [a, b, h] of [[0.12, 0.2, 0.34], [0.12, 0.62, 0.3]]) { x.fillRect(X0 + W * a, 20 + (TS - 20) * b, W * 0.32, (TS - 20) * h); x.fillRect(X0 + W * 0.56, 20 + (TS - 20) * b, W * 0.32, (TS - 20) * h); }
    x.fillStyle = rgb(214, 170, 70); x.beginPath(); x.arc(X0 + W - 7, 80, 3, 0, 7); x.fill();
  };
  cell(WT.door, (x, e) => { clap(x); doorP(x, 40, 48, [120, 78, 48]); x.fillStyle = rgb(50, 54, 58); x.fillRect(40, 20, 48, 14); e.fillStyle = rgb(120, 90, 50); e.fillRect(40, 20, 48, 14); });
  cell(WT.store, (x, e) => {
    clap(x); x.fillStyle = rgb(96, 70, 48); x.fillRect(4, 22, 78, 80);
    x.fillStyle = grad(x, 0, 26, 0, 98, [[0, rgb(110, 104, 88)], [1, rgb(48, 40, 30)]]); x.fillRect(8, 26, 70, 72);
    e.fillStyle = rgb(110, 82, 44); e.fillRect(8, 26, 70, 72);
    for (let k = 0; k < 4; k++) { x.fillStyle = [rgb(160, 60, 40), rgb(200, 170, 90), rgb(70, 100, 120), rgb(150, 120, 80)][k]; x.fillRect(12 + k * 17, 70, 13, 26); x.fillStyle = rgb(60, 44, 30); x.fillRect(12 + k * 17, 64, 13, 5); }
    x.fillStyle = rgb(96, 70, 48); x.fillRect(42, 26, 3, 72); doorP(x, 90, 30, [112, 74, 46]);
  });
  cell(WT.barn, (x) => {
    boards(x, [150, 70, 52]); x.fillStyle = rgb(232, 222, 200);
    for (const X0 of [10, 66]) { x.fillRect(X0, 14, 52, 5); x.fillRect(X0, 14, 5, TS); x.fillRect(X0 + 47, 14, 5, TS); x.save(); x.strokeStyle = rgb(232, 222, 200); x.lineWidth = 5; x.beginPath(); x.moveTo(X0 + 3, 18); x.lineTo(X0 + 49, TS); x.moveTo(X0 + 49, 18); x.lineTo(X0 + 3, TS); x.stroke(); x.restore(); }
  });
  // --- 1 段: 教会の窓・れんが・帯・カーテンの窓
  cell(WT.arch, (x, e) => {
    clap(x); x.fillStyle = rgb(120, 92, 62); x.beginPath(); x.moveTo(40, 112); x.lineTo(40, 52); x.arc(64, 52, 24, Math.PI, 0); x.lineTo(88, 112); x.fill();
    for (const k of [x, e]) { k.save(); k.beginPath(); k.moveTo(45, 108); k.lineTo(45, 52); k.arc(64, 52, 19, Math.PI, 0); k.lineTo(83, 108); k.clip(); const cs = [[190, 60, 50], [60, 100, 180], [220, 180, 70], [70, 150, 100]]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) { const cc = cs[(i + j * 2) % 4]; k.fillStyle = k === x ? rgb(cc[0] * 0.75, cc[1] * 0.75, cc[2] * 0.75) : rgb(cc[0] * 0.8, cc[1] * 0.8, cc[2] * 0.8); k.fillRect(45 + i * 13, 30 + j * 16, 12, 15); } k.restore(); }
  });
  cell(WT.brick, (x) => bricks(x));
  cell(WT.brickWin, (x, e) => { bricks(x); win(x, e, 34, 30, 60, 64, null, [70, 62, 56]); x.fillStyle = rgb(28, 28, 30); for (let k = 40; k < 94; k += 9) x.fillRect(k, 30, 3, 64); x.fillStyle = rgb(190, 178, 160); x.fillRect(26, 20, 76, 7); });
  cell(WT.brickDoor, (x) => { bricks(x); x.fillStyle = rgb(190, 178, 160); x.fillRect(26, 6, 76, 10); doorP(x, 34, 60, [74, 50, 34]); x.fillStyle = rgb(40, 28, 18); x.fillRect(63, 20, 2, TS); });
  cell(WT.cornice, (x) => {
    clap(x); x.fillStyle = rgb(120, 92, 62); x.fillRect(0, 0, TS, 12); x.fillStyle = rgb(222, 200, 166); x.fillRect(0, 12, TS, 6);
    x.fillStyle = rgb(120, 92, 62); for (let k = 4; k < TS; k += 16) x.fillRect(k, 18, 8, 12);
  });
  const curt = (x, e, lit) => { clap(x); win(x, e, 30, 22, 68, 84, lit); for (const k of lit ? [x, e] : [x]) { k.fillStyle = k === x ? rgb(170, 60, 50) : rgb(120, 40, 30); k.beginPath(); k.moveTo(30, 22); k.lineTo(58, 22); k.quadraticCurveTo(36, 50, 30, 100); k.fill(); k.beginPath(); k.moveTo(98, 22); k.lineTo(70, 22); k.quadraticCurveTo(92, 50, 98, 100); k.fill(); } };
  cell(WT.curtain, (x, e) => curt(x, e, null));
  cell(WT.curtainLit, (x, e) => curt(x, e, WARM));
  cell(WT.saloonWin, (x, e) => {
    clap(x); x.fillStyle = rgb(104, 60, 40); x.fillRect(8, 16, 112, 92);
    x.fillStyle = rgb(196, 150, 84); x.fillRect(13, 21, 102, 82); e.fillStyle = rgb(255, 190, 100); e.fillRect(13, 21, 102, 82);
    for (const k of [x, e]) { k.strokeStyle = k === x ? rgb(240, 222, 180) : rgb(255, 240, 200); k.lineWidth = 2; k.beginPath(); k.ellipse(64, 62, 40, 30, 0, 0, 7); k.stroke(); }
    text(x, 'BEER', 64, 56, 22, SLAB, rgb(120, 40, 24)); text(e, 'BEER', 64, 56, 22, SLAB, rgb(90, 30, 16)); text(x, '5¢', 64, 78, 16, SLAB, rgb(120, 40, 24));
    x.fillStyle = rgb(104, 60, 40); x.fillRect(62, 21, 3, 14); x.fillRect(62, 92, 3, 11);
  });
  // --- 2 段: 歩道の板・屋根・土・線路・わら
  cell(WT.walk, (x) => { boards(x, [176, 150, 118], 21.33); for (let k = 0; k < 6; k++) { x.fillStyle = 'rgba(30,18,10,0.6)'; x.fillRect(0, k * 64 - 1, TS, 2); } speck(x, 40, ['rgba(40,26,14,0.5)']); });
  cell(WT.shingle, (x) => {
    x.fillStyle = rgb(92, 78, 64); x.fillRect(0, 0, TS, TS);
    for (let r = 0; r < 8; r++) for (let k = -1; k < 9; k++) { const v = rr(0.75, 1.15); x.fillStyle = rgb(124 * v, 104 * v, 84 * v); x.fillRect(k * 16 + (r % 2) * 8 + 0.5, r * 16, 15, 14); x.fillStyle = 'rgba(20,12,8,0.5)'; x.fillRect(k * 16 + (r % 2) * 8, r * 16 + 14, 16, 2); }
  });
  cell(WT.tin, (x) => { for (let k = 0; k < TS; k += 8) { x.fillStyle = grad(x, k, 0, k + 8, 0, [[0, rgb(112, 96, 86)], [0.5, rgb(176, 160, 146)], [1, rgb(104, 88, 78)]]); x.fillRect(k, 0, 8, TS); } stain(x, 7, 'rgba(150,70,30,0.55)'); });
  const dirt = (x) => { x.fillStyle = rgb(170, 118, 82); x.fillRect(0, 0, TS, TS); speck(x, 260, ['rgba(120,76,48,0.5)', 'rgba(210,160,118,0.5)', 'rgba(96,60,40,0.4)']); stain(x, 4, 'rgba(200,150,108,0.25)'); stain(x, 3, 'rgba(110,70,46,0.25)'); };
  cell(WT.ruts, (x) => {
    dirt(x);
    for (const px of [30, 46, 84, 98]) { x.fillStyle = grad(x, px - 5, 0, px + 5, 0, [[0, 'rgba(96,58,38,0)'], [0.5, 'rgba(84,50,32,0.75)'], [1, 'rgba(96,58,38,0)']]); x.fillRect(px - 5, 0, 10, TS); x.fillStyle = 'rgba(214,168,124,0.4)'; x.fillRect(px + 5, 0, 2, TS); }
  });
  cell(WT.hoof, (x) => {
    dirt(x);
    for (let k = 0; k < 9; k++) { const px = rr(14, 114), py = rr(10, 118), a = rr(-0.5, 0.5); x.save(); x.translate(px, py); x.rotate(a); x.strokeStyle = 'rgba(80,46,28,0.8)'; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 6, Math.PI * 0.15, Math.PI * 0.85, true); x.stroke(); x.restore(); }
  });
  cell(WT.dirt, (x) => dirt(x));
  cell(WT.rail, (x) => {
    x.fillStyle = rgb(128, 104, 84); x.fillRect(0, 0, TS, TS); speck(x, 300, ['rgba(80,66,56,0.7)', 'rgba(170,150,130,0.6)']);
    for (let k = 0; k < 4; k++) { x.fillStyle = rgb(74, 52, 36); x.fillRect(8, k * 32 + 9, 112, 14); x.fillStyle = 'rgba(20,12,8,0.5)'; x.fillRect(8, k * 32 + 21, 112, 2); }
    for (const px of [32, 92]) { x.fillStyle = rgb(60, 56, 56); x.fillRect(px - 4, 0, 8, TS); x.fillStyle = rgb(190, 186, 180); x.fillRect(px - 1.5, 0, 3, TS); }
  });
  cell(WT.straw, (x) => { x.fillStyle = rgb(196, 160, 84); x.fillRect(0, 0, TS, TS); for (let k = 0; k < 260; k++) { x.strokeStyle = [rgb(226, 196, 110), rgb(160, 124, 60), rgb(240, 214, 140)][k % 3]; x.lineWidth = 1.2; const px = rr(0, TS), py = rr(0, TS), a = rr(0, 3.14); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 12, py + Math.sin(a) * 12); x.stroke(); } });
  // --- 3 段: 室内・岩
  cell(WT.bar, (x, e) => {
    x.fillStyle = rgb(70, 40, 26); x.fillRect(0, 0, TS, TS);
    x.fillStyle = grad(x, 0, 12, TS, 70, [[0, rgb(150, 160, 160)], [1, rgb(80, 90, 96)]]); x.fillRect(30, 10, 68, 52); e.fillStyle = rgb(70, 60, 44); e.fillRect(30, 10, 68, 52);
    x.strokeStyle = rgb(200, 160, 70); x.lineWidth = 3; x.strokeRect(30, 10, 68, 52);
    for (const y of [64, 96]) { x.fillStyle = rgb(110, 68, 40); x.fillRect(0, y + 24, TS, 5); for (let k = 0; k < 11; k++) { const cc = [[60, 110, 60], [150, 80, 30], [190, 170, 120], [90, 40, 30], [70, 90, 130]][Math.floor(R() * 5)], h = rr(14, 22), px = 5 + k * 11; x.fillStyle = rgb(...cc); x.fillRect(px, y + 24 - h, 7, h); x.fillRect(px + 2, y + 20 - h, 3, 5); e.fillStyle = rgb(cc[0] * 0.3, cc[1] * 0.3, cc[2] * 0.3); e.fillRect(px, y + 24 - h, 7, h); } }
  });
  cell(WT.paper, (x) => {
    x.fillStyle = rgb(128, 44, 40); x.fillRect(0, 0, TS, TS);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { x.fillStyle = rgb(160, 70, 56); x.beginPath(); x.ellipse(16 + i * 32 + (j % 2) * 16, 12 + j * 22, 6, 9, 0, 0, 7); x.fill(); }
    x.fillStyle = rgb(86, 52, 32); x.fillRect(0, 84, TS, 44); x.fillStyle = rgb(60, 36, 22); x.fillRect(0, 82, TS, 4); for (let k = 0; k < TS; k += 21.33) x.fillRect(k, 86, 2, 42);
  });
  cell(WT.wanted, (x) => {
    boards(x);
    for (const [px, py, a] of [[10, 14, -0.05], [68, 22, 0.06]]) {
      x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = rgb(226, 206, 160); x.fillRect(0, 0, 50, 78);
      text(x, 'WANTED', 25, 10, 11, SLAB, rgb(50, 30, 20)); x.fillStyle = rgb(120, 130, 96); x.beginPath(); x.arc(25, 38, 13, 0, 7); x.fill();
      x.fillStyle = rgb(40, 24, 18); x.fillRect(18, 34, 5, 4); x.fillRect(27, 34, 5, 4); x.fillRect(20, 44, 10, 2);
      text(x, 'ZOMBIE', 25, 60, 9, SLAB, rgb(50, 30, 20)); text(x, '$5000', 25, 71, 10, SLAB, rgb(140, 30, 20)); x.restore();
    }
  });
  cell(WT.piano, (x) => {
    x.fillStyle = rgb(60, 34, 22); x.fillRect(0, 0, TS, TS); x.fillStyle = rgb(86, 50, 30); x.fillRect(6, 6, 116, 62);
    x.fillStyle = rgb(236, 228, 208); x.fillRect(8, 78, 112, 22); x.fillStyle = rgb(20, 16, 14); for (let k = 0; k < 28; k++) { x.fillRect(8 + k * 4, 78, 0.8, 22); if (k % 7 !== 2 && k % 7 !== 6) x.fillRect(10.5 + k * 4, 78, 2.6, 13); }
    x.fillStyle = rgb(200, 160, 70); x.fillRect(40, 30, 48, 3);
  });
  cell(WT.vault, (x) => {
    x.fillStyle = rgb(80, 84, 90); x.fillRect(0, 0, TS, TS); x.fillStyle = rgb(120, 126, 134); x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
    x.fillStyle = rgb(60, 64, 70); x.beginPath(); x.arc(64, 64, 44, 0, 7); x.fill(); x.fillStyle = rgb(150, 156, 164); x.beginPath(); x.arc(64, 64, 14, 0, 7); x.fill();
    x.strokeStyle = rgb(190, 196, 204); x.lineWidth = 5; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(k * 1.571 + 0.4) * 34, 64 + Math.sin(k * 1.571 + 0.4) * 34); x.stroke(); }
  });
  cell(WT.felt, (x) => { x.fillStyle = rgb(30, 100, 62); x.fillRect(0, 0, TS, TS); speck(x, 120, ['rgba(20,70,44,0.6)']); for (let k = 0; k < 5; k++) { x.save(); x.translate(rr(24, 104), rr(24, 104)); x.rotate(rr(0, 3)); x.fillStyle = rgb(240, 236, 224); x.fillRect(-7, -10, 14, 20); x.fillStyle = k % 2 ? rgb(190, 30, 30) : rgb(20, 20, 20); x.fillRect(-3, -4, 6, 8); x.restore(); } });
  cell(WT.strata, (x) => {
    let y = 0;
    while (y < TS) { const h = rr(6, 20), v = rr(0.78, 1.12), cc = R() < 0.25 ? [214, 160, 118] : [186, 98, 62]; x.fillStyle = rgb(cc[0] * v, cc[1] * v, cc[2] * v); x.fillRect(0, y, TS, h + 1); x.fillStyle = 'rgba(70,30,18,0.4)'; x.fillRect(0, y + h - 1.5, TS, 1.5); y += h; }
    for (let k = 0; k < 12; k++) { x.fillStyle = 'rgba(60,26,16,0.35)'; x.fillRect(rr(0, TS), rr(0, TS), rr(1.5, 3), rr(14, 50)); }
    speck(x, 160, ['rgba(120,56,34,0.5)', 'rgba(232,170,128,0.4)']);
  });
  cell(WT.rockTop, (x) => { x.fillStyle = rgb(196, 112, 74); x.fillRect(0, 0, TS, TS); speck(x, 300, ['rgba(140,70,44,0.6)', 'rgba(230,160,116,0.5)']); stain(x, 5, 'rgba(120,60,36,0.3)'); stain(x, 3, 'rgba(236,180,130,0.3)'); });
  // --- 4 段: 金鉱の入口・教会の戸・ほろ・火薬・たる・馬小屋・鉄ごうし・はり紙
  cell(WT.mine, (x, e) => {
    x.fillStyle = rgb(8, 6, 6); x.fillRect(0, 0, TS, TS);
    x.fillStyle = grad(x, 0, 60, 0, TS, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(90,60,30,0.6)']]); x.fillRect(0, 60, TS, 68);
    for (const px of [34, 64, 94]) { x.fillStyle = rgb(60, 42, 28); x.fillRect(px - 3, 30, 6, 98); }
    e.fillStyle = rgb(110, 60, 14); e.beginPath(); e.arc(64, 50, 6, 0, 7); e.fill(); x.fillStyle = rgb(220, 150, 50); x.beginPath(); x.arc(64, 50, 5, 0, 7); x.fill();
  });
  cell(WT.churchDoor, (x) => {
    clap(x); x.fillStyle = rgb(104, 70, 44); x.beginPath(); x.moveTo(22, TS); x.lineTo(22, 58); x.arc(64, 58, 42, Math.PI, 0); x.lineTo(106, TS); x.fill();
    x.fillStyle = rgb(74, 46, 28); x.beginPath(); x.moveTo(28, TS); x.lineTo(28, 58); x.arc(64, 58, 36, Math.PI, 0); x.lineTo(100, TS); x.fill();
    x.fillStyle = rgb(40, 24, 14); x.fillRect(63, 22, 2, TS); x.fillStyle = rgb(214, 170, 70); x.fillRect(56, 84, 4, 10); x.fillRect(68, 84, 4, 10);
  });
  cell(WT.canvas, (x) => { x.fillStyle = rgb(226, 214, 186); x.fillRect(0, 0, TS, TS); for (let k = 0; k < TS; k += 21.33) { x.fillStyle = grad(x, k, 0, k + 21.33, 0, [[0, 'rgba(120,100,70,0.45)'], [0.2, 'rgba(255,250,235,0.3)'], [1, 'rgba(160,140,110,0.2)']]); x.fillRect(k, 0, 21.33, TS); } stain(x, 5, 'rgba(130,100,66,0.3)'); });
  cell(WT.tnt, (x) => {
    boards(x, [176, 60, 44], 32); x.fillStyle = 'rgba(30,14,10,0.7)'; x.fillRect(0, 0, TS, 6); x.fillRect(0, TS - 6, TS, 6); x.fillRect(0, 0, 6, TS); x.fillRect(TS - 6, 0, 6, TS);
    text(x, 'TNT', 64, 56, 50, SLAB, rgb(250, 236, 200), { stroke: 'rgb(40,14,10)', lw: 6 }); text(x, 'DANGER', 64, 100, 18, SLAB, rgb(250, 220, 90));
  });
  cell(WT.staves, (x) => { boards(x, [160, 112, 70], 16); for (const y of [16, 44, 82, 110]) { x.fillStyle = rgb(58, 56, 58); x.fillRect(0, y - 4, TS, 8); x.fillStyle = 'rgba(200,200,205,0.35)'; x.fillRect(0, y - 4, TS, 2); } });
  cell(WT.stall, (x) => {
    boards(x, [150, 70, 52]); x.fillStyle = rgb(16, 12, 10); x.fillRect(24, 14, 80, 62);
    x.fillStyle = rgb(108, 70, 44); x.beginPath(); x.moveTo(52, 76); x.lineTo(56, 40); x.lineTo(62, 26); x.lineTo(66, 34); x.lineTo(72, 30); x.lineTo(80, 50); x.lineTo(92, 64); x.lineTo(88, 74); x.lineTo(76, 68); x.lineTo(74, 76); x.fill();
    x.fillStyle = rgb(20, 14, 10); x.fillRect(64, 42, 4, 4); x.fillStyle = rgb(232, 222, 200); x.fillRect(20, 76, 88, 6); x.fillRect(20, 10, 88, 5); x.fillRect(20, 10, 5, 118); x.fillRect(103, 10, 5, 118);
    x.save(); x.strokeStyle = rgb(232, 222, 200); x.lineWidth = 5; x.beginPath(); x.moveTo(24, 82); x.lineTo(104, TS); x.moveTo(104, 82); x.lineTo(24, TS); x.stroke(); x.restore();
  });
  cell(WT.bars, (x) => { x.fillStyle = rgb(26, 24, 24); x.fillRect(0, 0, TS, TS); for (let k = 8; k < TS; k += 16) { x.fillStyle = grad(x, k - 3, 0, k + 3, 0, [[0, rgb(40, 40, 44)], [0.5, rgb(150, 150, 158)], [1, rgb(40, 40, 44)]]); x.fillRect(k - 3, 0, 6, TS); } x.fillStyle = rgb(90, 90, 96); x.fillRect(0, 6, TS, 7); x.fillRect(0, 60, TS, 6); x.fillRect(0, 116, TS, 7); });
  cell(WT.poster, (x) => {
    boards(x); stain(x, 3, 'rgba(60,40,24,0.3)');
    x.save(); x.translate(30, 26); x.rotate(0.04); x.fillStyle = rgb(232, 214, 170); x.fillRect(0, 0, 66, 84); text(x, 'RODEO', 33, 14, 15, SLAB, rgb(150, 34, 24)); x.fillStyle = rgb(90, 56, 34); x.beginPath(); x.ellipse(33, 46, 18, 11, 0, 0, 7); x.fill(); x.fillRect(44, 30, 8, 14); x.fillRect(20, 52, 4, 14); x.fillRect(42, 52, 4, 14);
    text(x, 'SUNDAY', 33, 74, 11, SLAB, rgb(40, 26, 18)); x.restore();
  });

  // --- 看板(ペンキぬりの板)
  const BG = { red: [[132, 30, 24], [248, 214, 120]], black: [[30, 26, 24], [240, 226, 190]], green: [[34, 70, 50], [244, 214, 120]], cream: [[232, 216, 176], [86, 30, 20]], blue: [[40, 62, 92], [240, 230, 200]], mustard: [[206, 160, 60], [50, 28, 16]], gray: [[150, 140, 128], [34, 26, 22]], gate: [[92, 58, 34], [250, 232, 180]], jp: [[232, 216, 176], [120, 26, 18]], arrow: [[244, 228, 180], [120, 26, 18]], danger: [[214, 176, 40], [24, 20, 18]] };
  SIGNS.forEach(([t, sub, st], i) => {
    const X0 = (i % 4) * 256, Y0 = SY + ((i / 4) | 0) * 64, [bg, fg] = BG[st];
    for (const k of [X, E]) { k.save(); k.beginPath(); k.rect(X0, Y0, 256, 64); k.clip(); k.translate(X0, Y0); }
    const x = X;
    x.fillStyle = rgb(...bg); x.fillRect(0, 0, 256, 64);
    for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, k * 16 + 15, 256, 1.5); }
    for (let k = 0; k < 14; k++) { x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(rr(0, 256), rr(0, 64), rr(10, 40), 1.5); }
    x.strokeStyle = rgb(...fg); x.lineWidth = 2.5; x.strokeRect(5, 5, 246, 54);
    for (const [cx, cy] of [[5, 5], [251, 5], [5, 59], [251, 59]]) { x.fillStyle = rgb(...bg); x.beginPath(); x.arc(cx, cy, 8, 0, 7); x.fill(); x.strokeStyle = rgb(...fg); x.beginPath(); x.arc(cx, cy, 8, 0, 7); x.stroke(); }
    const jp = st === 'jp' || st === 'arrow', n = [...t].length;
    const size = jp ? Math.min(40, 232 / n) : Math.min(44, 300 / n);
    text(x, t, 128, sub ? 27 : 33, size, jp ? JP : SLAB, rgb(...fg), { shadow: 'rgba(0,0,0,0.45)', max: 232 });
    if (sub) text(x, '― ' + sub + ' ―', 128, 51, 12, JP, rgb(...fg));
    if (st === 'gate') { for (const sx of [20, 236]) { x.fillStyle = rgb(...fg); x.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 - 1.571, r2 = k % 2 ? 4 : 10; x.lineTo(sx + Math.cos(a) * r2, 32 + Math.sin(a) * r2); } x.fill(); } }
    // 夜は ランタンの明かりで うっすら読める
    E.globalAlpha = st === 'gate' || st === 'jp' ? 0.45 : st === 'arrow' ? 0.3 : 0.24; E.drawImage(c, X0, Y0, 256, 64, 0, 0, 256, 64); E.globalAlpha = 1;
    X.restore(); E.restore();
  });
  return [c, ce];
}

// 材質を足す(M.west)。起動時に 1 回
export function makeWestMaterials(M, renderer, quality) {
  const an = quality === 'low' ? 2 : Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
  const [fc, fe] = atlas();
  const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = an; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  M.west = new THREE.MeshStandardMaterial({ map: tex(fc), emissiveMap: tex(fe), emissive: 0xffffff, emissiveIntensity: 1.0, vertexColors: true, roughness: 0.86, metalness: 0.02 });
  M.west.userData.s = [4, 4]; M.west.userData.cast = true;
  cutout(M.west);
  return M;
}
