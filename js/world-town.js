// マップ係: ダウンタウン(碁盤の目の道路・歩道・高いビル・広場・道の小物)と、高架道路。
// 中に入れる大きな建物(モール・病院 …)は world-interiors.js。ここでは その区画をあけておく。
import * as THREE from 'three';
import { cutout } from './world-tex.js';
import { placeTree, placeGlass } from './world-props.js';
import { Builder } from './world-build.js';

const LINES = [-178, -112, -40, 40, 112, 178];      // 道路の中心線(x 一定の南北の道 / z 一定の東西の道)
const RW = 6;                                        // 道路の半分の幅(片側 2 車線)
const PADS = [[-172, -118], [-106, -46], [-34, 34], [46, 106], [118, 172]];   // 区画(歩道つきの台)
export const TOWN = { ext: [-192, -192, 192, 192], lines: LINES, pads: PADS, overZ: 178 };
const PAD_H = 0.15;

// 特別な区画(i = 西→東, j = 北→南)
const SPECIAL = {
  '2,2': 'plaza', '3,1': 'mall', '4,1': 'mall', '1,1': 'hospital', '1,3': 'police', '3,3': 'super',
  '2,0': 'church', '2,4': 'parking', '0,2': 'park', '4,4': 'gas',
};

export function decal(ctx, cell, x, z, size, rot = 0, y = 0.03, col = null) {
  const i = cell % 4, j = cell >> 2;
  ctx.B.flat(ctx.M.decal, x, y, z, size, size, { uv: [i / 4, 1 - (j + 1) / 4, (i + 1) / 4, 1 - j / 4], rot, col });
}
export function pool(ctx, x, z, r, col = [0.55, 0.38, 0.2], y = 0.04) {
  ctx.B.flat(ctx.M.pool, x, y, z, r * 2, r * 2, { uv: [0, 0, 1, 1], col });
}
// 街灯(rot: 腕の向き。0 = 東)。足もとに光のたまり
export function lamp(ctx, x, z, rot, y = 0) {
  ctx.prop('lamp', x, z, rot, { y });
  pool(ctx, x + Math.cos(rot) * 1.75, z - Math.sin(rot) * 1.75, 6, [0.3, 0.22, 0.12], y + 0.04);
}

export function genTown(ctx) {
  const { B, M, rnd } = ctx;
  const R = (a, b) => a + rnd() * (b - a);
  const T = TOWN.ext;

  // ---- 道路(町全体にアスファルト。区画の台がその上に乗る) ----
  for (let z = T[1]; z < T[3]; z += 32) for (let x = T[0]; x < T[2]; x += 32) {
    B.flat(M.asphalt, x + 16, 0.01, z + 16, 32, 32);
  }
  ctx.mapRect(T[0], T[1], T[2], T[3], '#4a4a50');

  // ---- 区画の台(歩道) ----
  const padRect = (i, j) => {
    let [x0, x1] = PADS[i], [z0, z1] = PADS[j];
    return [x0, z0, x1, z1];
  };
  const pads = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const kind = SPECIAL[i + ',' + j] || 'tower';
    if (kind === 'mall' && i === 4) continue;             // モールは 2 区画を 1 つに
    let r = padRect(i, j);
    if (kind === 'mall') r = [PADS[3][0], PADS[1][0], PADS[4][1], PADS[1][1]];
    pads.push({ i, j, kind, r });
  }
  // 町の外まわりの歩道
  pads.push({ kind: 'edge', r: [T[0], T[1], T[2], -184] }, { kind: 'edge', r: [T[0], 184, T[2], T[3]] },
    { kind: 'edge', r: [T[0], -184, -184, 184] }, { kind: 'edge', r: [184, -184, T[2], 184] });
  // 外へつながる道(東西の -40 / 40 / 178)を あける
  const gapsZ = [-40, 40, 178];

  for (const p of pads) {
    const [x0, z0, x1, z1] = p.r;
    if (p.kind === 'edge') {
      // 外へ出る道のところは切る
      const vertical = x1 - x0 < z1 - z0;
      if (vertical) {
        let zs = z0;
        for (const gz of gapsZ) { if (gz - RW > zs && gz - RW < z1) { padBox(ctx, x0, zs, x1, gz - RW, M.sidewalk); zs = gz + RW; } }
        padBox(ctx, x0, zs, x1, z1, M.sidewalk);
      } else {
        let xs = x0;
        for (const gx of [-40, 40]) { padBox(ctx, xs, z0, gx - RW, z1, M.sidewalk); xs = gx + RW; }
        padBox(ctx, xs, z0, x1, z1, M.sidewalk);
      }
      continue;
    }
    const mat = p.kind === 'plaza' ? M.pave : p.kind === 'parking' ? M.asphalt : p.kind === 'park' ? M.ground : M.sidewalk;
    const col = p.kind === 'park' ? [0.42, 0.55, 0.28] : p.kind === 'plaza' ? [0.86, 0.88, 0.92] : null;
    padBox(ctx, x0, z0, x1, z1, mat, col);
    ctx.mapRect(x0, z0, x1, z1, p.kind === 'park' ? '#3f5a2c' : p.kind === 'plaza' ? '#8a8070' : '#77736c');
    ctx.occupy(x0, z0, x1, z1);
  }
  // 道路も「使った」ことにする(木を生やさない)
  ctx.occupy(T[0], T[1], T[2], T[3]);

  // ---- 道路の線・横断歩道 ----
  const mallSeg = (X, za, zb) => X === 112 && za <= -100 && zb >= -52;
  const ends = [-192, ...LINES, 192];
  for (const X of LINES) {
    for (let k = 0; k < ends.length - 1; k++) {
      const za = ends[k] + (k === 0 ? 0 : RW), zb = ends[k + 1] - (k === ends.length - 2 ? 0 : RW);
      if (zb - za < 6 || mallSeg(X, za, zb)) continue;
      roadMarks(ctx, X, za, zb, true, k > 0, k < ends.length - 2);
    }
  }
  for (const Z of LINES) {
    for (let k = 0; k < ends.length - 1; k++) {
      const xa = ends[k] + (k === 0 ? 0 : RW), xb = ends[k + 1] - (k === ends.length - 2 ? 0 : RW);
      if (xb - xa < 6) continue;
      if (Z === TOWN.overZ) { /* 高架の下も線は引く */ }
      roadMarks(ctx, Z, xa, xb, false, k > 0, k < ends.length - 2);
    }
  }
  for (const X of LINES) ctx.mapLine(X, T[1], X, T[3], 12, '#2c2c30');
  for (const Z of LINES) ctx.mapLine(T[0], Z, T[2], Z, 12, '#2c2c30');

  // ---- 区画ごとの中身 ----
  for (const p of pads) {
    if (p.kind === 'edge') continue;
    const [x0, z0, x1, z1] = p.r;
    streetFurniture(ctx, p);
    if (p.kind === 'tower') towerBlock(ctx, x0, z0, x1, z1, p.i, p.j);
    else if (p.kind === 'plaza') plaza(ctx, x0, z0, x1, z1);
    else if (p.kind === 'parking') parking(ctx, x0, z0, x1, z1);
    else if (p.kind === 'park') pocketPark(ctx, x0, z0, x1, z1);
  }

  // ---- 交差点の信号 ----
  for (const X of LINES) for (const Z of LINES) {
    if (X === 112 && Z === -40 || X === 112 && Z === -112) { /* モールの角も信号はあり */ }
    if (rnd() < 0.25) continue;
    ctx.prop('tlight', X - RW - 0.8, Z - RW - 0.8, -Math.PI / 2, {});   // 北西の角から南へ腕
    ctx.prop('tlight', X + RW + 0.8, Z + RW + 0.8, Math.PI / 2, {});    // 南東の角から北へ腕
  }

  // ---- 道路の上の物(放置された車・事故・バリケード) ----
  streetStuff(ctx, R);

  // ---- 高架道路(東西 z = 178、マップの端から端まで) ----
  overpass(ctx);
}

export function padBox(ctx, x0, z0, x1, z1, mat, col = null) {
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
  // 大きい台は区画ごとに分けて描く(見えない所は描かない)
  const step = 40;
  for (let z = z0; z < z1 - 0.01; z += step) for (let x = x0; x < x1 - 0.01; x += step) {
    const xa = x, xb = Math.min(x1, x + step), za = z, zb = Math.min(z1, z + step);
    const skip = 'b' + (xa > x0 ? 'w' : '') + (xb < x1 ? 'e' : '') + (za > z0 ? 'n' : '') + (zb < z1 ? 's' : '');
    ctx.B.box(mat, xa, 0, za, xb, PAD_H, zb, { skip, col, s: [4, 0.6] });
  }
  // 縁石(ふち)
  const c = [0.62, 0.6, 0.57];
  ctx.B.box(ctx.M.plainNoCut, x0, 0, z0, x1, PAD_H + 0.01, z0 + 0.25, { col: c, skip: 'b' });
  ctx.B.box(ctx.M.plainNoCut, x0, 0, z1 - 0.25, x1, PAD_H + 0.01, z1, { col: c, skip: 'b' });
  ctx.B.box(ctx.M.plainNoCut, x0, 0, z0, x0 + 0.25, PAD_H + 0.01, z1, { col: c, skip: 'b' });
  ctx.B.box(ctx.M.plainNoCut, x1 - 0.25, 0, z0, x1, PAD_H + 0.01, z1, { col: c, skip: 'b' });
}

// 道路の線: 中央の黄色い二重線、車線の白い点線、両端の横断歩道と停止線
function roadMarks(ctx, C, a, b, alongZ, crossA, crossB) {
  const { B, M } = ctx;
  const Y = 0.02, yel = [0.95, 0.72, 0.15], wht = [0.92, 0.92, 0.9];
  const strip = (u0, u1, v0, v1, col) => {   // u = 道の横方向(中心からのずれ)、v = 道の長さ方向
    if (alongZ) B.flat(M.paint, C + (u0 + u1) / 2, Y, (v0 + v1) / 2, u1 - u0, v1 - v0, { col });
    else B.flat(M.paint, (v0 + v1) / 2, Y, C + (u0 + u1) / 2, v1 - v0, u1 - u0, { col });
  };
  const cw = 4;   // 横断歩道の長さ
  const s0 = a + (crossA ? cw + 1.5 : 0), s1 = b - (crossB ? cw + 1.5 : 0);
  if (s1 > s0) {
    strip(-0.3, -0.15, s0, s1, yel); strip(0.15, 0.3, s0, s1, yel);
    for (const u of [-3, 3]) for (let v = s0 + 1; v < s1 - 3; v += 7) strip(u - 0.08, u + 0.08, v, v + 3.5, wht);
  }
  if (crossA) { for (let u = -RW + 0.6; u < RW - 0.5; u += 1.1) strip(u, u + 0.55, a + 0.5, a + 0.5 + cw, wht); strip(0.3, RW - 0.3, a + cw + 1, a + cw + 1.35, wht); }
  if (crossB) { for (let u = -RW + 0.6; u < RW - 0.5; u += 1.1) strip(u, u + 0.55, b - 0.5 - cw, b - 0.5, wht); strip(-RW + 0.3, -0.3, b - cw - 1.35, b - cw - 1, wht); }
}

// 歩道の小物: 街灯・木・ベンチ・消火栓・ごみ箱・バス停
function streetFurniture(ctx, p) {
  const { rnd } = ctx;
  const [x0, z0, x1, z1] = p.r, Y = PAD_H;
  const edge = (ax, az, bx, bz, nx, nz) => {      // 区画のへり(外向き n)
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    const rot = Math.atan2(-nz, nx);               // 腕を道路へ向ける
    for (let s = 8; s < L - 6; s += 12) {
      const px = ax + dx * s + nx * -0.9, pz = az + dz * s + nz * -0.9;
      const k = Math.round(s / 12) % 3;
      if (k === 0) lamp(ctx, px, pz, rot, Y);
      else if (k === 1 && p.kind !== 'plaza' && p.kind !== 'parking') {
        ctx.prop('planter', px, pz, 0, { y: Y });
        placeTree(ctx, rnd() < 0.5 ? 'broad' : 'birch', px, pz, 0.55 + rnd() * 0.15, rnd() * 6);
      } else {
        const r = rnd();
        if (r < 0.25) ctx.prop('hydrant', px, pz, 0, { y: Y });
        else if (r < 0.45) ctx.prop('trashcan', px, pz, 0, { y: Y });
        else if (r < 0.6) ctx.prop('bench', px - nx * 1.2, pz - nz * 1.2, Math.atan2(nz, -nx) + Math.PI / 2 + Math.PI, { y: Y });
        else if (r < 0.68) ctx.prop('busstop', px - nx * 1.0, pz - nz * 1.0, Math.atan2(-nz, nx) - Math.PI / 2 + Math.PI, { y: Y });
        else if (r < 0.8) ctx.prop('trashbags', px - nx * 1.0, pz - nz * 1.0, rnd() * 6, { y: Y, solid: false });
      }
      if (rnd() < 0.25) decal(ctx, rnd() < 0.5 ? 9 : 6, ax + dx * (s + 6), az + dz * (s + 6), 2.5, rnd() * 6, Y + 0.01);
    }
  };
  edge(x0, z0, x1, z0, 0, -1); edge(x1, z1, x0, z1, 0, 1); edge(x0, z1, x0, z0, -1, 0); edge(x1, z0, x1, z1, 1, 0);
}

// 色(ビルの壁の色合い)
const TINTS = [[1, 1, 1], [1, 0.95, 0.88], [0.88, 0.93, 1], [0.95, 0.88, 0.82], [0.82, 0.82, 0.8], [0.9, 0.95, 0.9], [1, 0.9, 0.9]];
const NEON = [[3, 0.4, 1.6], [0.3, 2.2, 3], [3, 1.6, 0.3], [0.5, 3, 0.8], [3, 0.3, 0.3]];

function towerBlock(ctx, x0, z0, x1, z1, bi, bj) {
  const { rnd } = ctx;
  const ix0 = x0 + 3.5, ix1 = x1 - 3.5, iz0 = z0 + 3.5, iz1 = z1 - 3.5;
  const core = Math.max(Math.abs(bi - 2), Math.abs(bj - 2));  // 中心に近いほど高い
  const xs = (ix1 - ix0 > 36 && rnd() < 0.8) ? split(ix0, ix1, rnd) : [[ix0, ix1]];
  const zs = (iz1 - iz0 > 36 && rnd() < 0.8) ? split(iz0, iz1, rnd) : [[iz0, iz1]];
  for (const [a, b] of xs) for (const [c, d] of zs) {
    const H = core <= 1 ? 30 + rnd() * 45 : 16 + rnd() * 30;
    tower(ctx, a, c, b, d, H);
  }
  // 路地(ビルの間)にごみ箱・ごみ袋
  if (xs.length > 1) { const ax = (xs[0][1] + xs[1][0]) / 2; ctx.prop('dumpster', ax, (iz0 + iz1) / 2 + 6, Math.PI / 2, { y: PAD_H, col: [0.25, 0.45, 0.3] }); ctx.prop('trashbags', ax, (iz0 + iz1) / 2 - 4, 0, { y: PAD_H, solid: false }); }
  if (zs.length > 1) { const az = (zs[0][1] + zs[1][0]) / 2; ctx.prop('dumpster', (ix0 + ix1) / 2 - 5, az, 0, { y: PAD_H, col: [0.3, 0.35, 0.5] }); }
}
function split(a, b, rnd) {
  const m = a + (b - a) * (0.42 + rnd() * 0.16), g = 2.5;   // 路地の幅 5m
  return [[a, m - g], [m + g, b]];
}

// 中に入れない 高いビル(1 階は店先、上は窓の並ぶ壁、屋上に設備)
export function tower(ctx, x0, z0, x1, z1, H, o = {}) {
  const { B, M, rnd } = ctx;
  const style = o.style || [M.office, M.apt, M.ribbon][Math.floor(rnd() * 3)];
  const tint = TINTS[Math.floor(rnd() * TINTS.length)];
  const Y = o.y ?? PAD_H, G = 4.5;
  const uo = Math.floor(rnd() * 4) * 0.5;
  B.box(M.shop, x0, Y, z0, x1, G, z1, { skip: 'bt', uo, s: [12, G - Y] });
  if (o.glass !== false) shopGlass(ctx, x0, z0, x1, z1, Y, G, uo);
  B.box(style, x0, G, z0, x1, H, z1, { top: M.roof, uo: Math.floor(rnd() * 4) * 0.25, vo: Math.floor(rnd() * 4) * 0.25, col: tint });
  B.box(M.plain, x0 - 0.3, G - 0.1, z0 - 0.3, x1 + 0.3, G + 0.35, z1 + 0.3, { col: [0.45 * tint[0], 0.44 * tint[1], 0.42 * tint[2]], skip: '' });
  // 屋上のふち
  const pc = [0.55 * tint[0], 0.54 * tint[1], 0.52 * tint[2]];
  B.box(M.plain, x0, H, z0, x1, H + 0.9, z0 + 0.35, { col: pc }); B.box(M.plain, x0, H, z1 - 0.35, x1, H + 0.9, z1, { col: pc });
  B.box(M.plain, x0, H, z0, x0 + 0.35, H + 0.9, z1, { col: pc }); B.box(M.plain, x1 - 0.35, H, z0, x1, H + 0.9, z1, { col: pc });
  // 屋上の設備
  const w = x1 - x0, d = z1 - z0;
  let topH = H;
  if (H > 38 && w > 16 && d > 16 && rnd() < 0.6) {      // 上の段
    const ins = 3 + rnd() * 3, H2 = H + 8 + rnd() * 14;
    B.box(style, x0 + ins, H, z0 + ins, x1 - ins, H2, z1 - ins, { top: M.roof, col: tint, uo: 0.25, vo: 0.5 });
    topH = H2;
    if (rnd() < 0.5) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; B.box(M.plain, cx - 0.15, topH, cz - 0.15, cx + 0.15, topH + 9, cz + 0.15, { col: [0.3, 0.3, 0.3] }); B.box(M.glow, cx - 0.25, topH + 9, cz - 0.25, cx + 0.25, topH + 9.4, cz + 0.25, { col: [4, 0.3, 0.2] }); }
  }
  const nAC = 1 + Math.floor(rnd() * 3);
  for (let k = 0; k < nAC; k++) ctx.prop('ac', x0 + 2.5 + rnd() * Math.max(0.1, w - 5), z0 + 2.5 + rnd() * Math.max(0.1, d - 5), Math.floor(rnd() * 2) * Math.PI / 2, { y: H, solid: false, occupy: false });
  if (rnd() < 0.5 && w > 10 && d > 10) ctx.prop('watertank', x0 + w * 0.7, z0 + d * 0.3, 0, { y: H, solid: false, occupy: false });
  if (rnd() < 0.6) B.box(M.plain, x0 + 2, H, z1 - 6, x0 + 6, H + 3, z1 - 2, { col: [0.6, 0.6, 0.58] });
  // 店のひさし・ネオン看板
  const sides = [['s', z1, 0, 1], ['n', z0, 0, -1], ['e', x1, 1, 0], ['w', x0, -1, 0]];
  for (const [, c, nx, nz] of sides) {
    const along = nx ? d : w;
    if (rnd() < 0.5) {
      const col = [[0.6, 0.15, 0.12], [0.15, 0.35, 0.5], [0.2, 0.45, 0.25], [0.55, 0.45, 0.15]][Math.floor(rnd() * 4)];
      const a0 = 2 + rnd() * Math.max(0, along - 12), a1 = a0 + 6 + rnd() * 4;
      if (nx) B.box(M.plain, nx > 0 ? c : c - 1.6, 3.5, z0 + a0, nx > 0 ? c + 1.6 : c, 3.7, Math.min(z1 - 1, z0 + a1), { col, skip: '' });
      else B.box(M.plain, x0 + a0, 3.5, nz > 0 ? c : c - 1.6, Math.min(x1 - 1, x0 + a1), 3.7, nz > 0 ? c + 1.6 : c, { col, skip: '' });
    }
    if (rnd() < 0.35) {
      const nc = NEON[Math.floor(rnd() * NEON.length)], a = 2 + rnd() * Math.max(0, along - 4), y0 = 6 + rnd() * 4;
      if (nx) B.box(M.glow, nx > 0 ? c : c - 0.9, y0, z0 + a - 0.12, nx > 0 ? c + 0.9 : c, y0 + 3.5, z0 + a + 0.12, { col: nc });
      else B.box(M.glow, x0 + a - 0.12, y0, nz > 0 ? c : c - 0.9, x0 + a + 0.12, y0 + 3.5, nz > 0 ? c + 0.9 : c, { col: nc });
    }
  }
  ctx.solid(x0, z0, x1, z1, topH);
  ctx.occupy(x0, z0, x1, z1);
  ctx.mapRect(x0, z0, x1, z1, '#1d1d22');
}

// 店先のガラス(こわせる)。店の模様(12m に 2 軒)の窓の位置に合わせて置く
function shopGlass(ctx, x0, z0, x1, z1, Y, G, uo) {
  const y0 = Y + 0.0208 * (G - Y), hh = 0.73 * (G - Y);
  const faces = [
    [x1 - x0, (a) => [x0 + a, z1 + 0.05, 0]], [x1 - x0, (a) => [x1 - a, z0 - 0.05, 0]],
    [z1 - z0, (a) => [x1 + 0.05, z1 - a, Math.PI / 2]], [z1 - z0, (a) => [x0 - 0.05, z0 + a, Math.PI / 2]],
  ];
  for (const [L, at] of faces) {
    for (let n = Math.floor(uo); n <= Math.ceil(uo + L / 12); n++) for (const sh of [0, 0.5]) {
      const a = (n + sh + 0.0195 - uo) * 12, b = (n + sh + 0.4805 - uo) * 12;
      if (a < 0.2 || b > L - 0.2) continue;
      const [x, z, rot] = at((a + b) / 2);
      placeGlass(ctx, x, z, rot, b - a - 0.08, hh, y0);
    }
  }
}

// 中央広場: まわりを土のうで囲んだ 軍の検問所(4 方向は大きく あいている)
function plaza(ctx, x0, z0, x1, z1) {
  const { rnd } = ctx;
  const Y = PAD_H;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // 土のうの弧(各四分円の 30°〜60°)
  for (let q = 0; q < 4; q++) {
    for (let a = 28; a <= 62; a += 8.5) {
      const ang = (q * 90 + a) * Math.PI / 180, r = 24;
      const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
      ctx.prop('sandbag', x, z, -ang + Math.PI / 2, { y: Y });
    }
  }
  // 角にテント、軍の車
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.prop('tent', cx + sx * 28, cz + sz * 28, sx * sz > 0 ? 0 : Math.PI / 2, { y: Y });
    ctx.prop('fireBarrel', cx + sx * 19, cz + sz * 19, 0, { y: Y });
    pool(ctx, cx + sx * 19, cz + sz * 19, 5, [0.9, 0.45, 0.12], Y + 0.03);
  }
  ctx.prop('truck', cx - 27, cz + 6, Math.PI / 2, { y: Y, col: [0.32, 0.36, 0.24] });
  ctx.prop('van', cx + 27, cz - 8, Math.PI / 2 + 0.2, { y: Y, col: [0.32, 0.36, 0.24] });
  ctx.prop('police', cx + 8, cz + 27, 0.3, { y: Y });
  // 床の模様(白い輪と十字。主人公の出発点は広く あけたまま)
  const pc = [0.78, 0.76, 0.72];
  for (const R of [9, 16]) for (let a = 0; a < 48; a++) { const t = a / 48 * Math.PI * 2; ctx.B.flat(ctx.M.paint, cx + Math.cos(t) * R, Y + 0.012, cz + Math.sin(t) * R, R * 0.07, 0.35, { rot: t + Math.PI / 2, col: pc }); }
  for (const [dx, dz] of [[1, 0], [0, 1]]) for (let s = -1; s <= 1; s += 2) ctx.B.flat(ctx.M.paint, cx + dx * s * 12.5, Y + 0.012, cz + dz * s * 12.5, dx ? 7 : 0.35, dz ? 7 : 0.35, { col: pc });
  // 角の植えこみ
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.prop('planter', cx + sx * 31, cz + sz * 21, 0, { y: Y }); placeTree(ctx, 'broad', cx + sx * 31, cz + sz * 21, 0.7, sx + sz); ctx.prop('planter', cx + sx * 21, cz + sz * 31, 0, { y: Y }); placeTree(ctx, 'birch', cx + sx * 21, cz + sz * 31, 0.75, sx - sz); }
  // 地面に 血・焦げ・紙くず
  for (let k = 0; k < 18; k++) decal(ctx, [1, 2, 3, 7, 6, 9][k % 6], cx + (rnd() - 0.5) * 60, cz + (rnd() - 0.5) * 60, 2 + rnd() * 3, rnd() * 6, Y + 0.01);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lamp(ctx, cx + sx * 12, cz + sz * 12, Math.atan2(-sz, sx) + Math.PI, Y);
  ctx.mapCircle(cx, cz, 24, 'rgba(160,140,90,0.5)');
}

// 駐車場
function parking(ctx, x0, z0, x1, z1) {
  const { B, M, rnd } = ctx;
  const Y = PAD_H + 0.01, wht = [0.9, 0.9, 0.88];
  const cols = [[0.7, 0.1, 0.1], [0.15, 0.25, 0.5], [0.85, 0.85, 0.85], [0.1, 0.1, 0.1], [0.5, 0.5, 0.52], [0.25, 0.4, 0.25]];
  for (const rz of [z0 + 8, z0 + 22, z1 - 22, z1 - 8]) {
    for (let x = x0 + 4; x < x1 - 4; x += 3) {
      B.flat(M.paint, x, Y, rz, 0.12, 5, { col: wht });
      if (x + 3 < x1 - 4 && rnd() < 0.55) ctx.prop(rnd() < 0.2 ? 'van' : 'sedan', x + 1.5, rz + (rnd() - 0.5) * 0.4, Math.PI / 2 + (rnd() - 0.5) * 0.15, { y: PAD_H, col: rnd() < 0.15 ? [0.12, 0.1, 0.09] : cols[Math.floor(rnd() * cols.length)] });
    }
  }
  for (let k = 0; k < 8; k++) decal(ctx, k % 2 ? 0 : 10, x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 4 + rnd() * (z1 - z0 - 8), 2 + rnd() * 2, rnd() * 6, Y + 0.01);
  lamp(ctx, (x0 + x1) / 2, (z0 + z1) / 2 - 0.5, 0, PAD_H); lamp(ctx, (x0 + x1) / 2, (z0 + z1) / 2 + 0.5, Math.PI, PAD_H);
  ctx.prop('counter', x1 - 4, z1 - 2, 0, { y: PAD_H, col: [0.8, 0.75, 0.3] });
}

// 小さな公園(遊具・木・ベンチ)
function pocketPark(ctx, x0, z0, x1, z1) {
  const { B, M, rnd } = ctx;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, Y = PAD_H;
  B.box(M.sidewalk, cx - 2, Y, z0 + 1, cx + 2, Y + 0.02, z1 - 1, { skip: 'b', col: [0.85, 0.8, 0.7] });
  B.box(M.sidewalk, x0 + 1, Y, cz - 2, x1 - 1, Y + 0.02, cz + 2, { skip: 'b', col: [0.85, 0.8, 0.7] });
  ctx.prop('slide', cx - 12, cz - 12, 0.4, { y: Y }); ctx.prop('swing', cx + 12, cz - 12, 0, { y: Y });
  for (let k = 0; k < 14; k++) {
    const x = x0 + 4 + rnd() * (x1 - x0 - 8), z = z0 + 4 + rnd() * (z1 - z0 - 8);
    if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || (Math.abs(x - cx + 12) < 4 && Math.abs(z - cz + 12) < 4) || (Math.abs(x - cx - 12) < 4 && Math.abs(z - cz + 12) < 4)) continue;
    placeTree(ctx, rnd() < 0.7 ? 'broad' : 'birch', x, z, 0.8 + rnd() * 0.4, rnd() * 6);
  }
  for (let k = 0; k < 6; k++) ctx.I.add('bush', x0 + 3 + rnd() * (x1 - x0 - 6), Y, z0 + 3 + rnd() * (z1 - z0 - 6), rnd() * 6, 0.8 + rnd() * 0.5);
  ctx.prop('bench', cx + 4, cz + 8, 0, { y: Y }); ctx.prop('bench', cx - 4, cz - 8, Math.PI, { y: Y });
}

// 道路の上: 放置車・事故・バリケード・ドラム缶の火・シミ
function streetStuff(ctx, R) {
  const { rnd } = ctx;
  const cols = [[0.7, 0.1, 0.1], [0.15, 0.25, 0.5], [0.85, 0.85, 0.85], [0.1, 0.1, 0.1], [0.5, 0.5, 0.52], [0.25, 0.4, 0.25], [0.75, 0.6, 0.2], [0.35, 0.18, 0.12]];
  const burnt = [0.13, 0.11, 0.1];
  const segs = [];
  const ends = [-192, ...LINES, 192];
  for (const X of LINES) for (let k = 0; k < ends.length - 1; k++) {
    const a = ends[k] + (k ? RW + 2 : 2), b = ends[k + 1] - (k < ends.length - 2 ? RW + 2 : 2);
    if (b - a < 12 || (X === 112 && a < -60 && b > -100)) continue;
    segs.push({ C: X, a, b, z: true });
  }
  for (const Z of LINES) for (let k = 0; k < ends.length - 1; k++) {
    const a = ends[k] + (k ? RW + 2 : 2), b = ends[k + 1] - (k < ends.length - 2 ? RW + 2 : 2);
    if (b - a < 12) continue;
    segs.push({ C: Z, a, b, z: false });
  }
  const put = (s, u, v, rot, name, o) => { const x = s.z ? s.C + u : v, z = s.z ? v : s.C + u; ctx.prop(name, x, z, s.z ? rot + Math.PI / 2 : rot, o); };
  const nearPlaza = (s) => Math.abs(s.C) === 40 && Math.abs((s.a + s.b) / 2) < 50;
  for (const s of segs) {
    const L = s.b - s.a;
    // 路肩の放置車(片側ずつ)
    for (const side of [-1, 1]) {
      let v = s.a + 2 + rnd() * 6;
      while (v < s.b - 6) {
        if (rnd() < 0.42) {
          const name = rnd() < 0.08 ? 'bus' : rnd() < 0.2 ? 'van' : 'sedan';
          const len = name === 'bus' ? 11 : name === 'van' ? 5 : 4.4;
          if (v + len > s.b - 2) break;
          const isBurnt = rnd() < 0.25;
          put(s, side * 4.4, v + len / 2, (side < 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.25, name, { col: isBurnt ? burnt : name === 'bus' ? [0.95, 0.75, 0.15] : cols[Math.floor(rnd() * cols.length)] });
          if (isBurnt) { const x = s.z ? s.C + side * 4.4 : v + len / 2, z = s.z ? v + len / 2 : s.C + side * 4.4; decal(ctx, 7, x, z, 6, rnd() * 6, 0.025); }
          v += len + 1.5;
        } else v += 5 + rnd() * 6;
      }
    }
    // 道のまん中の事故(ななめの車が 2 台)
    if (rnd() < 0.35 && L > 30) {
      const v = s.a + L * (0.3 + rnd() * 0.4);
      put(s, -0.8, v, 0.6 + rnd() * 0.4, 'sedan', { col: rnd() < 0.5 ? burnt : cols[Math.floor(rnd() * cols.length)] });
      put(s, 1.6, v + 4.2, -0.5 - rnd() * 0.5, rnd() < 0.3 ? 'van' : 'sedan', { col: cols[Math.floor(rnd() * cols.length)] });
      const x = s.z ? s.C : v + 2, z = s.z ? v + 2 : s.C;
      ctx.prop('rubble', x + 2.5, z - 2.5, rnd() * 6, { solid: false });
      decal(ctx, 0, x, z, 5, rnd() * 6, 0.025);
      if (rnd() < 0.6) { ctx.prop('fireBarrel', x - 3, z + 3, 0); pool(ctx, x - 3, z + 3, 5, [0.9, 0.45, 0.12]); }
    }
    // バリケード(広場の近くは検問)
    if (nearPlaza(s) || rnd() < 0.2) {
      const v = (s.a + s.b) / 2 + (rnd() - 0.5) * 10;
      put(s, -3.2, v, 0, rnd() < 0.5 ? 'barricade' : 'jersey', {});
      put(s, 3.2, v + 1.5, 0.1, rnd() < 0.5 ? 'barricade' : 'jersey', {});
      for (let k = 0; k < 3; k++) put(s, (rnd() - 0.5) * 9, v + 3 + rnd() * 3, rnd() * 6, 'cone', { solid: false });
    }
    // 道の シミ・血・タイヤ跡・マンホール
    const n = Math.floor(L / 14);
    for (let k = 0; k < n; k++) {
      const v = s.a + rnd() * L, u = (rnd() - 0.5) * 10;
      const x = s.z ? s.C + u : v, z = s.z ? v : s.C + u;
      const c = [0, 1, 2, 3, 10, 9, 6, 0][Math.floor(rnd() * 8)];
      decal(ctx, c, x, z, 2.5 + rnd() * 3, rnd() * 6, 0.025);
    }
    if (rnd() < 0.6) { const v = s.a + rnd() * L; decal(ctx, 8, s.z ? s.C + 1.5 : v, s.z ? v : s.C + 1.5, 1.6, 0, 0.022); }
    if (rnd() < 0.15) { const v = s.a + 4 + rnd() * (L - 8), u = (rnd() < 0.5 ? -1 : 1) * 2; const x = s.z ? s.C + u : v, z = s.z ? v : s.C + u; ctx.prop('fireBarrel', x, z, 0); pool(ctx, x, z, 5, [0.9, 0.45, 0.12]); }
  }
  void R;
}

// 高架道路(高さ 9m)。柱は道のまん中。上には事故車。下を通ると透けて見える
function overpass(ctx) {
  const { M, rnd, half } = ctx;
  const Z = TOWN.overZ, W = 7.5, Y0 = 9, Y1 = 10.2;
  const deckTop = M.asphalt;
  const conc = [0.62, 0.6, 0.57];
  // 橋げたの上の部分は 別のまとまり(DB)に作る。下を歩くと うすくなる(World.addFader)
  const B0 = ctx.B, DB = new Builder(80, half);
  ctx.B = DB;
  const B = DB;
  for (let x = -half; x < half; x += 40) {
    const xb = Math.min(half, x + 40);
    B.box(M.concrete, x, Y0, Z - W, xb, Y1, Z + W, { top: deckTop, col: conc, skip: (x > -half ? 'w' : '') + (xb < half ? 'e' : '') });
    B.box(M.concrete, x, Y0 - 0.6, Z - W + 1, xb, Y0, Z + W - 1, { col: [0.5, 0.48, 0.46], skip: 't' + (x > -half ? 'w' : '') + (xb < half ? 'e' : '') });
    for (const s of [-1, 1]) B.box(M.concrete, x, Y1, s > 0 ? Z + W - 0.4 : Z - W, xb, Y1 + 1.0, s > 0 ? Z + W : Z - W + 0.4, { col: conc, skip: (x > -half ? 'w' : '') + (xb < half ? 'e' : '') });
    for (let k = 0; k < 40; k += 7) B.flat(M.paint, x + k + 2, Y1 + 0.01, Z, 3.5, 0.15, { col: [0.9, 0.9, 0.88] });
  }
  for (let x = -half + 20; x < half; x += 40) B.box(M.concrete, x - 1.4, Y0 - 1.6, Z - W + 1, x + 1.4, Y0, Z + W - 1, { col: [0.55, 0.53, 0.5], skip: '' });
  // 高架の上の事故車(当たり判定なし)
  const cols = [[0.7, 0.1, 0.1], [0.15, 0.25, 0.5], [0.85, 0.85, 0.85], [0.13, 0.11, 0.1]];
  for (let x = -half + 10; x < half - 10; x += 14 + rnd() * 20) {
    ctx.prop(rnd() < 0.15 ? 'bus' : 'sedan', x, Z + (rnd() - 0.5) * 9, (rnd() - 0.5) * 0.8, { y: Y1, solid: false, occupy: false, col: cols[Math.floor(rnd() * cols.length)] });
  }
  ctx.B = B0;
  const meshes = DB.finish(ctx.W.group), clones = new Map();
  for (const m of meshes) {
    let c = clones.get(m.material);
    if (!c) { c = m.material.isMeshBasicMaterial ? m.material.clone() : cutout(m.material.clone()); c.transparent = true; clones.set(m.material, c); }
    m.material = c;
  }
  ctx.W.addFader([...clones.values()], (x, z) => Math.abs(z - Z) < W + 4, 0.12);
  // 柱(道のまん中。40m ごと)
  for (let x = -half + 20; x < half; x += 40) {
    B0.box(M.concrete, x - 1.1, 0, Z - 1.1, x + 1.1, Y0 - 0.6, Z + 1.1, { col: conc });
    ctx.solid(x - 1.1, Z - 1.1, x + 1.1, Z + 1.1, Y0);
    ctx.prop('jersey', x - 4, Z, 0, {}); ctx.prop('jersey', x + 4, Z, 0, {});
    if (rnd() < 0.5) { const fx = x + (rnd() < 0.5 ? -9 : 9); ctx.prop('fireBarrel', fx, Z + (rnd() - 0.5) * 6, 0); pool(ctx, fx, Z, 5, [0.9, 0.45, 0.12]); }
    if (rnd() < 0.5) lamp(ctx, x + 1.6, Z, 0, 0);
  }
  // 高架の下の道(町の外へ続く)
  for (let x = -half; x < half; x += 40) {
    if (x >= TOWN.ext[0] && x + 40 <= TOWN.ext[2]) continue;
    B0.flat(M.asphalt, x + 20, 0.012, Z, 40, 12);
    for (let k = 2; k < 40; k += 7) { B0.flat(M.paint, x + k + 1.75, 0.022, Z - 3, 3.5, 0.16, { col: [0.92, 0.92, 0.9] }); B0.flat(M.paint, x + k + 1.75, 0.022, Z + 3, 3.5, 0.16, { col: [0.92, 0.92, 0.9] }); }
    ctx.occupy(x, Z - 8, x + 40, Z + 8);
  }
  ctx.mapRect(-half, Z - W, half, Z + W, '#6a6862');
  void THREE;
}
