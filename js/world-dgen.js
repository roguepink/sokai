// マップ係(第4弾・街並み): 地区ごとの区画の中身(その1)。ネオン繁華街・中華街・下町商店街・地区の入口の門・歩道の小物・道の車。
// 寺町・オフィス街・崩壊地区は world-dgen2.js。
import * as THREE from 'three';
import { fbuild, sode, wallSign, billboard, neon, lantern, lanternString, beam, sagLine, withMatrix, patch, hip, torii, gable, PAD_H, Builder } from './world-dkit.js';
import { SG, signsOf, FT, signUV as signUVOf } from './world-dtex.js';
import { DSTYLE, districtAt, cellOf, districtOfCell, EDGES } from './world-district.js';
import { pool, decal, lamp } from './world-town.js';
import { placeTree } from './world-props.js';
import { cutout } from './world-tex.js';

const Y = PAD_H;
export const rr = (ctx, a, b) => a + ctx.rnd() * (b - a);
export const pick = (ctx, l) => l[Math.floor(ctx.rnd() * l.length)];
const NEONC = [[3, 0.35, 1.7], [0.3, 2.2, 3], [3, 1.8, 0.3], [0.5, 3, 0.9], [3, 0.4, 0.35], [1.8, 0.5, 3]];
const POOLC = (c) => [c[0] * 0.13, c[1] * 0.13, c[2] * 0.13];

// 面の上の点(t = 0..1、外向き n)
export function facePt(r, n, t) {
  const [x0, z0, x1, z1] = r;
  if (n[1] > 0) return [x0 + (x1 - x0) * t, z1];
  if (n[1] < 0) return [x1 - (x1 - x0) * t, z0];
  if (n[0] > 0) return [x1, z1 - (z1 - z0) * t];
  return [x0, z0 + (z1 - z0) * t];
}
const faceLen = (r, n) => (n[1] ? r[2] - r[0] : r[3] - r[1]);

// 区画のふちに 建物を並べる(内側は空ける)。o.gaps = { n: [[a,b]], ... } は 建物を置かない所(道の続き)
export function ring(ctx, x0, z0, x1, z1, o) {
  const s = o.inset ?? 3.2, D = o.d[1], cg = o.cg ?? 3.5, gaps = o.gaps || {}, sk = o.skip || '';
  const zA = z0 + s + (sk.includes('n') ? 0 : D + cg), zB = z1 - s - (sk.includes('s') ? 0 : D + cg);
  const edges = [
    ['n', true, x0 + s, x1 - s, z0 + s, [0, -1]], ['s', true, x0 + s, x1 - s, z1 - s, [0, 1]],
    ['w', false, zA, zB, x0 + s, [-1, 0]], ['e', false, zA, zB, x1 - s, [1, 0]],
  ];
  for (const [k, alongX, a, b, outer, n] of edges) {
    if (o.skip && o.skip.includes(k)) continue;
    const gl = gaps[k] || [];
    let t = a;
    while (t < b - 3) {
      const g = gl.find(([g0, g1]) => t < g1 && t + 3 > g0);
      if (g) { t = g[1]; continue; }
      let w = rr(ctx, o.w[0], o.w[1]);
      const ng = gl.find(([g0]) => g0 > t && g0 < t + w);
      if (ng) w = ng[0] - t;
      if (b - (t + w) < o.w[0] * 0.7) w = b - t;
      if (w < 3) { t += w; continue; }
      const d = rr(ctx, o.d[0], o.d[1]), sb = ctx.rnd() < 0.3 ? rr(ctx, 0.3, 1.4) : 0;
      let r;
      if (alongX) r = n[1] < 0 ? [t, outer + sb, t + w, outer + sb + d] : [t, outer - sb - d, t + w, outer - sb];
      else r = n[0] < 0 ? [outer + sb, t, outer + sb + d, t + w] : [outer - sb - d, t, outer - sb, t + w];
      o.make(r, n, k);
      t += w;
      if (ctx.rnd() < (o.gap ?? 0.1) && b - t > 8) t += rr(ctx, 3.3, 4.4);
    }
  }
  return [x0 + s + (sk.includes('w') ? 0 : D + cg), zA, x1 - s - (sk.includes('e') ? 0 : D + cg), zB];
}

// ================= ネオン繁華街 =================
const NEON_G = [40, 41, 42, 43, 36, 33, 47, 37, 40, 42];
const NEON_UP = [9, 12, 14, 15, 9, 12, 14], NEON_LIT = [8, 10, 13];
const NEON_TINT = [[1, 1, 1], [1.1, 1, 1.08], [0.85, 0.85, 0.9], [1, 0.92, 0.85], [0.9, 0.95, 1.1]];
export function neonB(ctx, r, n, o = {}) {
  const { rnd } = ctx;
  const [x0, z0, x1, z1] = r, w = faceLen(r, n);
  const H = o.H ?? (Y + (rnd() < 0.18 ? rr(ctx, 26, 40) : rr(ctx, 9, 24)));
  const g1 = pick(ctx, NEON_G), g2 = rnd() < 0.5 ? g1 : pick(ctx, NEON_G);
  const b = fbuild(ctx, x0, z0, x1, z1, { H, G: 4.4, fl: 3.3, bay: 3.6, ground: [g1, g2], side: [34, 14, 12], up: NEON_UP, lit: NEON_LIT, litP: 0.38, colTile: 11, colP: 0.1,
    col: pick(ctx, NEON_TINT), front: n, mapCol: DSTYLE.neon.bmap, parCol: [0.2, 0.19, 0.22] });
  const nl = signsOf('neon');
  // 袖看板(1〜2 枚)
  const ns = w > 8 && rnd() < 0.7 ? 2 : 1;
  for (let k = 0; k < ns; k++) {
    const t = ns === 1 ? (rnd() < 0.5 ? 0.12 : 0.88) : (k ? 0.9 : 0.1);
    const [px, pz] = facePt(r, n, t), s = Math.min(rr(ctx, 0.9, 1.45), (H - Y - 5.5) / 4);
    if (s > 0.5) sode(ctx, px, pz, n[0], n[1], Y + 4.9 + rnd() * 1.5, pick(ctx, nl), s, [1.25, 1.25, 1.25]);
  }
  // 店先のネオン管と 歩道の光
  const nc = pick(ctx, NEONC), [ax, az] = facePt(r, n, 0.04), [bx, bz] = facePt(r, n, 0.96), off = 0.12;
  neon(ctx, [ax + n[0] * off, Y + 4.5, az + n[1] * off], [bx + n[0] * off, Y + 4.5, bz + n[1] * off], nc);
  if (rnd() < 0.5) { const nc2 = pick(ctx, NEONC); neon(ctx, [ax + n[0] * off, Y + 4.3, az + n[1] * off], [ax + n[0] * off, Y + Math.min(H - 0.5, 12), az + n[1] * off], nc2); }
  const [cx, cz] = facePt(r, n, 0.5);
  pool(ctx, cx + n[0] * 2.4, cz + n[1] * 2.4, Math.min(5, w * 0.5), POOLC(nc), Y + 0.03);
  // 屋上の広告・エアコン
  if (rnd() < 0.5 && w > 6.5) {
    const bw = Math.min(w - 1, rr(ctx, 6, 10)), bh = bw * 0.5;
    billboard(ctx, cx - n[0] * 1.2, H, cz - n[1] * 1.2, n[0], n[1], bw, bh, SG['ad:' + pick(ctx, ['live', 'cider', 'idol', 'movie', 'drink', 'led', 'h24'])], { legs: 1.4 });
  } else if (rnd() < 0.6) ctx.prop('watertank', (x0 + x1) / 2, (z0 + z1) / 2, 0, { y: H, solid: false, occupy: false });
  for (let k = 0; k < 1 + Math.floor(rnd() * 2); k++) ctx.prop('ac', x0 + 1.5 + rnd() * Math.max(0.1, x1 - x0 - 3), z0 + 1.5 + rnd() * Math.max(0.1, z1 - z0 - 3), 0, { y: H, solid: false, occupy: false });
  return b;
}
// 横丁(内側の細い路地。ちょうちんと小さな飲み屋)
function yokocho(ctx, ix0, iz0, ix1, iz1, style = 'neon') {
  const { rnd } = ctx;
  const W = ix1 - ix0, Dd = iz1 - iz0, alongX = W >= Dd, A = 3.6;
  const L0 = alongX ? ix0 : iz0, L1 = alongX ? ix1 : iz1, c = alongX ? (iz0 + iz1) / 2 : (ix0 + ix1) / 2, half = (alongX ? Dd : W) / 2;
  const dep = Math.min(9, half - A / 2 - 0.3);
  if (dep < 3.5) return lot(ctx, ix0, iz0, ix1, iz1);
  for (const side of [-1, 1]) {
    let t = L0 + 0.5;
    while (t < L1 - 3) {
      const w = Math.min(L1 - 0.5 - t, rr(ctx, 3.4, 5.2));
      if (w < 2.8) break;
      const a = c + side * A / 2, b = c + side * (A / 2 + dep);
      const r = alongX ? [t, Math.min(a, b), t + w, Math.max(a, b)] : [Math.min(a, b), t, Math.max(a, b), t + w];
      const n = alongX ? [0, -side] : [-side, 0];
      const H = Y + rr(ctx, 5.8, 8);
      fbuild(ctx, r[0], r[1], r[2], r[3], { H, G: 3.4, fl: 2.8, bay: 3.2, ground: style === 'neon' ? [43, 33, 32, 36] : [33, 32, 36, 38], side: [34], up: style === 'neon' ? [9, 14, 15] : [24, 25, 27], lit: style === 'neon' ? [8, 13] : [29], litP: 0.45, front: n, mapCol: DSTYLE[style === 'neon' ? 'neon' : 'shita'].bmap, roof: rnd() < 0.5 ? 'kawara' : 'flat', roofTile: rnd() < 0.5 ? 62 : 56, ridgeX: !alongX, over: 0.4, ledge: true });
      const [px, pz] = facePt(r, n, rnd() < 0.5 ? 0.2 : 0.8);
      if (rnd() < 0.8) sode(ctx, px, pz, n[0], n[1], Y + 3.5, pick(ctx, style === 'neon' ? signsOf('neon') : [...signsOf('box'), ...signsOf('wood')]), 0.62, [1.2, 1.2, 1.2]);
      t += w + (rnd() < 0.15 ? 1.2 : 0);
    }
  }
  // 路地の上の ちょうちん
  for (let t = L0 + 2; t < L1 - 1; t += 4.5) {
    const a = alongX ? [t, Y + 3.6, c - A / 2] : [c - A / 2, Y + 3.6, t], b = alongX ? [t + 0.3, Y + 3.6, c + A / 2] : [c + A / 2, Y + 3.6, t + 0.3];
    lanternString(ctx, a, b, 0.35, 1.2);
    pool(ctx, alongX ? t : c, alongX ? c : t, 3, [0.28, 0.08, 0.04], Y + 0.03);
  }
  for (let k = 0; k < 3; k++) decal(ctx, pick(ctx, [0, 9, 6]), alongX ? L0 + rnd() * (L1 - L0) : c, alongX ? c : L0 + rnd() * (L1 - L0), 1.6, rnd() * 6, Y + 0.012);
}
// 空き地(駐輪・ごみ・ドラム缶の火)
function lot(ctx, ix0, iz0, ix1, iz1) {
  const { rnd } = ctx;
  if (ix1 - ix0 < 4 || iz1 - iz0 < 4) return;
  ctx.B.flat(ctx.M.asphalt, (ix0 + ix1) / 2, Y + 0.01, (iz0 + iz1) / 2, ix1 - ix0, iz1 - iz0, { col: [0.55, 0.52, 0.55] });
  for (let x = ix0 + 1.2; x < ix1 - 1.5; x += 1.1) if (rnd() < 0.55) ctx.prop(rnd() < 0.6 ? 'bicycle' : 'scooter', x, iz0 + 1.2, Math.PI / 2 + (rnd() - 0.5) * 0.3, { y: Y, col: pick(ctx, [[0.8, 0.1, 0.1], [0.2, 0.3, 0.6], [0.85, 0.85, 0.85], [0.1, 0.1, 0.1], [0.9, 0.7, 0.2]]) });
  ctx.prop('dumpster', ix1 - 2, iz1 - 1.5, 0, { y: Y, col: [0.3, 0.4, 0.35] });
  ctx.prop('trashbags', ix1 - 4.5, iz1 - 1.2, rnd() * 6, { y: Y, solid: false });
  if (ix1 - ix0 > 9) { ctx.prop('fireBarrel', (ix0 + ix1) / 2, (iz0 + iz1) / 2 + 1, 0, { y: Y }); pool(ctx, (ix0 + ix1) / 2, (iz0 + iz1) / 2 + 1, 4, [0.9, 0.45, 0.12], Y + 0.03); }
}
export function neonPad(ctx, x0, z0, x1, z1, variant) {
  const zc = (z0 + z1) / 2, xc = (x0 + x1) / 2;
  const gaps = { w: [[zc - 2, zc + 2]], e: [[zc - 2, zc + 2]] };
  if (variant === 'pachinko') {
    const inner = ring(ctx, x0, z0 + 27, x1, z1, { d: [10, 12], w: [5.5, 9.5], gap: 0.1, skip: 'n', make: (r, n) => neonB(ctx, r, n) });
    lot(ctx, inner[0], inner[1], inner[2], inner[3]);
    return;
  }
  const inner = ring(ctx, x0, z0, x1, z1, { d: [10, 13], w: [5.5, 10], gap: 0.12, gaps, make: (r, n) => neonB(ctx, r, n) });
  if (variant === 'yokocho') yokocho(ctx, inner[0], inner[1], inner[2], inner[3]);
  else if (variant === 'tower') {
    const [a, b, c, d] = inner, m = 2.5;
    if (c - a > 10 && d - b > 10) {
      const bb = neonB(ctx, [a + m, b + m, c - m, d - m], [0, 1], { H: Y + rr(ctx, 34, 44) });
      for (const n of [[1, 0], [-1, 0], [0, -1]]) { const [px, pz] = facePt([a + m, b + m, c - m, d - m], n, 0.5); sode(ctx, px, pz, n[0], n[1], Y + 9, pick(ctx, signsOf('neon')), 1.6, [1.3, 1.3, 1.3]); }
      billboard(ctx, (a + c) / 2, bb.H, (b + d) / 2, 0, -1, c - a - 2 * m - 1, (c - a - 2 * m) * 0.45, SG['ad:led'], { legs: 1.6 });
    } else lot(ctx, a, b, c, d);
  } else lot(ctx, inner[0], inner[1], inner[2], inner[3]);
  void xc;
}

// ================= 中華街 =================
const CHINA_G = [45, 46, 36, 45, 46, 45];
const CHINA_UP = [16, 17, 19, 21, 22, 16], CHINA_LIT = [18, 20];
export function chinaB(ctx, r, n, o = {}) {
  const { rnd } = ctx;
  const [x0, z0, x1, z1] = r, w = faceLen(r, n);
  const H = o.H ?? (Y + rr(ctx, 9, 20));
  const roofT = pick(ctx, [57, 57, 58, 59]);
  const b = fbuild(ctx, x0, z0, x1, z1, { H, G: 4.4, fl: 3.3, bay: 3.4, ground: [pick(ctx, CHINA_G), pick(ctx, CHINA_G)], side: [16, 21, 22], up: CHINA_UP, lit: CHINA_LIT, litP: 0.32, band: rnd() < 0.6 ? 23 : null,
    col: pick(ctx, [[1, 1, 1], [1.05, 0.95, 0.9], [0.9, 0.88, 0.85]]), front: n, mapCol: DSTYLE.china.bmap, roof: rnd() < 0.45 ? 'china' : 'flat', roofTile: roofT, hipTop: rnd() < 0.3, parCol: [0.6, 0.1, 0.08], ledgeCol: [0.75, 0.55, 0.15] });
  // 大きな赤い縦看板
  const rl = signsOf('red');
  const [px, pz] = facePt(r, n, rnd() < 0.5 ? 0.15 : 0.85), s = Math.min(rr(ctx, 1.1, 1.7), (H - Y - 5.4) / 4);
  if (s > 0.55) sode(ctx, px, pz, n[0], n[1], Y + 4.8, pick(ctx, rl), s, [1.15, 1.15, 1.15]);
  // 店先の ちょうちん(軒下)
  for (let t = 0.12; t < 0.95; t += 2.2 / w) { const [lx, lz] = facePt(r, n, t); lantern(ctx, lx + n[0] * 0.9, Y + 3.95, lz + n[1] * 0.9, 0.85); }
  const [cx, cz] = facePt(r, n, 0.5);
  pool(ctx, cx + n[0] * 2.2, cz + n[1] * 2.2, Math.min(5, w * 0.5), [0.3, 0.07, 0.03], Y + 0.03);
  if (rnd() < 0.3 && w > 8) wallSign(ctx, cx, Y + 4.6 + 0.2, cz, n[0], n[1], Math.min(w - 1.5, 6), 1.5, SG['金福楼'], [1.1, 1.1, 1.1], 0.1);
  return b;
}
export function chinaPad(ctx, x0, z0, x1, z1, variant) {
  const { rnd } = ctx;
  const zc = (z0 + z1) / 2;
  const inner = ring(ctx, x0, z0, x1, z1, { d: [10, 13], w: [7, 12], gap: 0.12, gaps: { w: [[zc - 2, zc + 2]], e: [[zc - 2, zc + 2]] }, make: (r, n) => chinaB(ctx, r, n) });
  const [a, b, c, d] = inner;
  ctx.B.flat(ctx.M.pave, (a + c) / 2, Y + 0.012, (b + d) / 2, c - a + 6, d - b + 6, { col: [0.8, 0.5, 0.42] });
  if (variant === 'temple' && c - a > 12 && d - b > 12) {
    // 中華の お堂(金と緑の屋根・線香の炉)
    const m = 3.5, r = [a + m, b + m, c - m, d - m - 3];
    fbuild(ctx, r[0], r[1], r[2], r[3], { H: Y + 5.2, G: 5.05, ground: [45, 22], side: [22, 16], up: [16], col: [1, 1, 1], front: [0, 1], roof: 'none', ledge: false, mapCol: DSTYLE.china.bmap, solid: false });
    const top = hip(ctx, r[0], r[1], r[2], r[3], Y + 5.2, (r[3] - r[1]) * 0.35, { roofTile: 58, over: 1.4, ridgeCol: [0.75, 0.15, 0.1], ends: [0.85, 0.65, 0.2] });
    ctx.solid(r[0], r[1], r[2], r[3], top);
    for (const x of [r[0] + 1, (r[0] + r[2]) / 2 - 2, (r[0] + r[2]) / 2 + 2, r[2] - 1]) { ctx.B.box(ctx.M.plain, x - 0.25, Y, r[3] + 1.2, x + 0.25, Y + 5.2, r[3] + 1.7, { col: [0.75, 0.1, 0.08] }); ctx.solid(x - 0.25, r[3] + 1.2, x + 0.25, r[3] + 1.7, 5); }
    const cx = (r[0] + r[2]) / 2, cz = r[3] + 4.5;
    ctx.B.box(ctx.M.plain, cx - 1, Y, cz - 1, cx + 1, Y + 1.2, cz + 1, { col: [0.35, 0.3, 0.22] }); ctx.solid(cx - 1, cz - 1, cx + 1, cz + 1, 1.2);
    ctx.B.box(ctx.M.glow, cx - 0.7, Y + 1.2, cz - 0.7, cx + 0.7, Y + 1.25, cz + 0.7, { col: [2.2, 0.8, 0.2] });
    ctx.W.addFire(cx, Y + 1.25, cz, 0.25);
    lantern(ctx, cx - 4, Y + 4.6, r[3] + 1.4, 1.4); lantern(ctx, cx + 4, Y + 4.6, r[3] + 1.4, 1.4);
  } else {
    // 中庭: 丸いテーブル・屋台・頭の上に ちょうちん
    for (let k = 0; k < 5; k++) { const x = a + 2 + rnd() * (c - a - 4), z = b + 2 + rnd() * (d - b - 4); if (ctx.isFree(x, z, 1.5)) ctx.prop('table', x, z, rnd() * 3, { y: Y }); }
    if (c - a > 8) { ctx.prop('stall', a + 3, d - 2, 0, { y: Y, col: [0.95, 0.85, 0.7] }); ctx.prop('stall', c - 3, b + 2, Math.PI, { y: Y, col: [0.95, 0.85, 0.7] }); }
    lanternString(ctx, [a - 2, Y + 5.2, b - 2], [c + 2, Y + 5.2, d + 2], 0.6, 1.7);
    lanternString(ctx, [c + 2, Y + 5.2, b - 2], [a - 2, Y + 5.2, d + 2], 0.6, 1.7);
    pool(ctx, (a + c) / 2, (b + d) / 2, 6, [0.32, 0.08, 0.03], Y + 0.03);
  }
}
// 中華街の広場(中央広場の南): 店(中に入れる)・龍の像・夜市
export function chinaPlaza(ctx, x0, z0, x1, z1) {
  const { rnd, M } = ctx;
  // 東西のふちに 建物
  ring(ctx, x0, z0, x1, z1, { d: [9, 11], w: [7, 11], gap: 0.1, skip: 'ns', make: (r, n) => chinaB(ctx, r, n) });
  const cx = (x0 + x1) / 2, cz = z0 + 18;
  ctx.B.flat(M.pave, cx, Y + 0.012, (z0 + z1) / 2, 40, z1 - z0 - 4, { col: [0.82, 0.48, 0.4] });
  // 龍の像(体は波うつ緑の玉のつらなり、金のひげ)
  ctx.B.box(M.plain, cx - 3.5, Y, cz - 2, cx + 3.5, Y + 0.8, cz + 2, { col: [0.5, 0.48, 0.45] });
  ctx.solid(cx - 3.5, cz - 2, cx + 3.5, cz + 2, 4);
  const seg = new THREE.SphereGeometry(0.6, 8, 6), _m = new THREE.Matrix4();
  for (let k = 0; k < 26; k++) {
    const t = k / 25, x = cx - 3 + t * 6, y = Y + 1.4 + Math.sin(t * Math.PI * 2.2) * 1.0 + t * 1.6, z = cz + Math.cos(t * Math.PI * 2.2) * 1.0, s = 1.05 - t * 0.55;
    _m.makeScale(s, s, s).setPosition(x, y, z); ctx.B.geom(M.plain, seg, _m, { col: k % 2 ? [0.15, 0.55, 0.3] : [0.2, 0.62, 0.34] });
    if (k % 3 === 0) { _m.makeScale(0.3, 0.6, 0.3).setPosition(x, y + 0.7 * s, z); ctx.B.geom(M.plain, seg, _m, { col: [0.85, 0.62, 0.15] }); }
  }
  _m.makeScale(1.3, 1.0, 1.0).setPosition(cx - 3.6, Y + 2.0, cz + 0.8); ctx.B.geom(M.plain, seg, _m, { col: [0.2, 0.62, 0.34] });
  for (const s of [-1, 1]) { beam(ctx.B, M.plain, [cx - 4.2, Y + 2.3, cz + 0.8 + s * 0.3], [cx - 5.6, Y + 3.0, cz + 0.8 + s * 1.2], 0.08, [0.9, 0.7, 0.2]); ctx.B.box(M.glow, cx - 4.35, Y + 2.25, cz + 0.8 + s * 0.35 - 0.08, cx - 4.2, Y + 2.4, cz + 0.8 + s * 0.35 + 0.08, { col: [3, 0.5, 0.2] }); }
  pool(ctx, cx, cz, 6, [0.15, 0.3, 0.12], Y + 0.03);
  // 夜市の屋台
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) ctx.prop('stall', cx + sx * 11, cz - 8 + k * 4.4, sx * Math.PI / 2, { y: Y, col: pick(ctx, [[0.95, 0.85, 0.7], [0.9, 0.3, 0.2], [0.95, 0.75, 0.3]]) });
  for (let k = 0; k < 4; k++) lanternString(ctx, [x0 + 15, Y + 5.4, z0 + 8 + k * 7], [x1 - 15, Y + 5.4, z0 + 8 + k * 7], 0.8, 1.8);
  for (let k = 0; k < 4; k++) pool(ctx, cx + (k - 1.5) * 9, cz, 4, [0.3, 0.07, 0.03], Y + 0.03);
  // 中央広場から見える門(北のふち)
  paifang(ctx, cx, z0 + 3.5, false, 0.95);
  (ctx.noFurn || (ctx.noFurn = [])).push([cx - 9.5, z0 - 1.5, cx + 9.5, z0 + 6]);
  for (let k = 0; k < 6; k++) decal(ctx, pick(ctx, [9, 6, 0]), cx + (rnd() - 0.5) * 30, cz + (rnd() - 0.5) * 14, 1.5, rnd() * 6, Y + 0.012);
}

// ================= 下町商店街(アーケード) =================
const SHITA_G = [32, 33, 34, 35, 36, 37, 39, 38, 32, 35];
const SHITA_UP = [24, 25, 26, 27, 28, 30, 31], SHITA_LIT = [29];
export function shitaB(ctx, r, n, o = {}) {
  const { rnd } = ctx;
  const [x0, z0, x1, z1] = r, w = faceLen(r, n);
  const H = o.H ?? (Y + rr(ctx, 6.6, 10.5));
  const kawara = rnd() < (o.kawaraP ?? 0.4);
  const b = fbuild(ctx, x0, z0, x1, z1, { H, G: o.G ?? 3.6, fl: 3.0, bay: 3.4, ground: o.ground || [pick(ctx, SHITA_G)], side: [24, 26, 25], up: SHITA_UP, lit: SHITA_LIT, litP: 0.3,
    col: pick(ctx, [[1, 1, 1], [1.05, 1, 0.92], [0.92, 0.94, 0.98], [1, 0.95, 0.95]]), front: n, mapCol: DSTYLE.shita.bmap, roof: kawara ? 'kawara' : 'flat', roofTile: kawara ? pick(ctx, [56, 59, 59, 62]) : pick(ctx, [62, 62, 60, 63]), roofCol: kawara ? pick(ctx, [[1, 1, 1], [0.85, 0.9, 1.1], [1.1, 1, 0.9]]) : null, ridgeX: !!n[1], over: 0.5, parH: 0.5 });
  // 日よけ(色の布)
  if (o.awning !== false && rnd() < 0.6) {
    const [ax, az] = facePt(r, n, 0.05), [bx, bz] = facePt(r, n, 0.95), c = pick(ctx, [[0.75, 0.15, 0.12], [0.15, 0.45, 0.25], [0.2, 0.3, 0.6], [0.85, 0.6, 0.15]]);
    const out = 1.3, y0 = Y + (o.G ?? 3.6) - 0.5;
    const bk = ctx.B.bucket(ctx.M.plain, (ax + bx) / 2, (az + bz) / 2);
    patchPlain(bk, [ax + n[0] * out, y0 - 0.5, az + n[1] * out], [bx + n[0] * out, y0 - 0.5, bz + n[1] * out], [ax, y0, az], [bx, y0, bz], c);
  }
  // 小さな縦看板
  if (rnd() < 0.7) { const [px, pz] = facePt(r, n, rnd() < 0.5 ? 0.1 : 0.9); sode(ctx, px, pz, n[0], n[1], Y + 3.0, pick(ctx, [...signsOf('box'), ...signsOf('wood')]), o.signS ?? 0.7); }
  if (o.vend !== false && rnd() < 0.3 && w > 5) { const [px, pz] = facePt(r, n, 0.75); ctx.prop('vending', px + n[0] * 0.55, pz + n[1] * 0.55, Math.atan2(n[0], n[1]), { y: Y, col: pick(ctx, [[0.9, 0.15, 0.12], [0.2, 0.4, 0.8], [0.92, 0.92, 0.92]]) }); }
  return b;
}
// 色だけの 4 点の面(両面)
function patchPlain(bk, a, b, c, d, col, both = true) {
  const push = (p, q, r, s) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    const base = bk.v; bk.p.push(...p, ...q, ...r, ...s);
    for (let k = 0; k < 4; k++) { bk.n.push(nx / l, ny / l, nz / l); bk.c.push(col[0], col[1], col[2]); }
    bk.u.push(0, 0, 1, 0, 1, 1, 0, 1); bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3); bk.v += 4;
  };
  push(a, b, d, c); if (both) push(b, a, c, d);
}
// 電柱と電線(からまった線)。pts = 電柱の位置 [[x,z],...]
export function poles(ctx, pts, y = Y) {
  const { rnd, M } = ctx;
  for (const [x, z] of pts) ctx.prop('upole', x, z, Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]), { y, col: [0.62, 0.6, 0.57] });
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    if (Math.hypot(bx - ax, bz - az) > 26) continue;
    for (let w = 0; w < 4; w++) {
      const h = y + 8.7 + (w % 2) * 0.65 + (rnd() - 0.5) * 0.3, o = (w - 1.5) * 0.45;
      const dx = bz - az, dz = -(bx - ax), L = Math.hypot(dx, dz) || 1;
      const a = [ax + dx / L * o, h, az + dz / L * o], b = [bx + dx / L * o * (0.6 + rnd() * 0.8), h + (rnd() - 0.5) * 0.4, bz + dz / L * o];
      const p = sagLine(a, b, 0.5 + rnd() * 0.9, 5);
      for (let i = 0; i < p.length - 1; i++) beam(ctx.B, M.plain, p[i], p[i + 1], 0.035, [0.06, 0.06, 0.06]);
    }
  }
}
export function shitaArcade(ctx, pads) {
  const { rnd, M } = ctx;
  const ZA = 4.6;
  // 屋根は 別のまとまりに作り、下にいるときは うすくする(見下ろし)
  const B0 = ctx.B, RB = new Builder(60, ctx.half);
  const roofs = [];
  for (const [x0, x1] of pads) {
    const z0 = -34, z1 = 34;
    const pass = x0 + 10 + rnd() * (x1 - x0 - 20);
    const gap = [[pass - 1.8, pass + 1.8]];
    // 外の列(道に面した 古い建物)と 内の列(アーケードに面した 店)
    ring(ctx, x0, z0, x1, z1, { inset: 3, d: [10, 11.5], w: [5.5, 9], gap: 0.05, skip: 'we', gaps: { n: gap, s: gap }, make: (r, n) => shitaB(ctx, r, n, { H: Y + rr(ctx, 7, 12.5), awning: false, vend: true }) });
    for (const side of [-1, 1]) {
      let t = x0 + 0.6;
      while (t < x1 - 3) {
        if (t < pass + 1.8 && t + 3 > pass - 1.8) { t = pass + 1.8; continue; }
        let w = rr(ctx, 4.2, 7);
        if (t < pass - 1.8 && t + w > pass - 1.8) w = pass - 1.8 - t;
        if (x1 - 0.6 - (t + w) < 3) w = x1 - 0.6 - t;
        if (w < 2.6) { t += w; continue; }
        const r = side < 0 ? [t, -16.5, t + w, -ZA] : [t, ZA, t + w, 16.5];
        shitaB(ctx, r, [0, -side], { H: Y + rr(ctx, 6.4, 9.6), G: 3.8, kawaraP: 0.6, signS: 0.62 });
        t += w;
      }
    }
    // 道の床(色タイル)
    for (let x = x0; x < x1; x += 2) ctx.B.flat(M.paint, x + 1, Y + 0.013, 0, 2, ZA * 2 - 0.4, { col: ((x - x0) / 2) % 2 ? [0.55, 0.38, 0.3] : [0.62, 0.58, 0.5] });
    // 屋根(アーチ)と 骨組み
    ctx.B = RB;
    const yb = Y + 8.2, ya = Y + 10.2;
    const prof = [[-ZA, yb], [-ZA * 0.55, yb + 1.4], [0, ya], [ZA * 0.55, yb + 1.4], [ZA, yb]];
    for (let x = x0; x < x1 - 0.1; x += 6) {
      const xb = Math.min(x1, x + 6);
      for (let k = 0; k < prof.length - 1; k++) {
        const [za, ya0] = prof[k], [zb, ya1] = prof[k + 1];
        const bk = RB.bucket(M.arcade, (x + xb) / 2, 0);
        patchPlain(bk, [x, ya0, za], [xb, ya0, za], [x, ya1, zb], [xb, ya1, zb], [1, 1, 1], false);
      }
    }
    for (let x = x0; x <= x1 + 0.01; x += 6) {
      for (let k = 0; k < prof.length - 1; k++) beam(RB, M.plain, [x, prof[k][1], prof[k][0]], [x, prof[k + 1][1], prof[k + 1][0]], 0.18, [0.45, 0.48, 0.52]);
      for (const s of [-1, 1]) beam(RB, M.plain, [x, Y, s * (ZA - 0.15)], [x, yb, s * (ZA - 0.15)], 0.2, [0.45, 0.48, 0.52]);
    }
    beam(RB, M.plain, [x0, ya, 0], [x1, ya, 0], 0.2, [0.45, 0.48, 0.52]);
    ctx.B = B0;
    for (let x = x0; x <= x1 + 0.01; x += 6) for (const s of [-1, 1]) ctx.solid(x - 0.12, s * (ZA - 0.15) - 0.12, x + 0.12, s * (ZA - 0.15) + 0.12, 8);
    // 吊り下げの明かり・旗・花飾り
    for (let x = x0 + 3; x < x1; x += 6) {
      ctx.B.box(M.glow, x - 0.9, Y + 7.3, -0.12, x + 0.9, Y + 7.45, 0.12, { col: [1.8, 1.6, 1.3] });
      beam(ctx.B, M.plain, [x, Y + 7.45, 0], [x, Y + 8.6, 0], 0.03, [0.2, 0.2, 0.2]);
      pool(ctx, x, 0, 4.5, [0.22, 0.18, 0.13], Y + 0.03);
      if (((x - x0) / 6 | 0) % 2) for (const s of [-1, 1]) ctx.B.box(M.plain, x - 0.02, Y + 5.6, s * 2.2 - 0.5, x + 0.02, Y + 7.2, s * 2.2 + 0.5, { col: pick(ctx, [[0.9, 0.2, 0.15], [0.95, 0.75, 0.15], [0.2, 0.5, 0.85], [0.95, 0.45, 0.65]]), skip: '' });
      else for (let k = 0; k < 5; k++) ctx.B.box(M.plain, x - 0.18 + (k - 2) * 0.7, Y + 7.5, -0.18, x + 0.18 + (k - 2) * 0.7, Y + 7.86, 0.18, { col: [1, 0.55, 0.75] });
    }
    // 入口のアーチ(両はし)
    for (const [ex, nx] of [[x0, -1], [x1, 1]]) {
      ctx.B.box(M.plain, ex - 0.3, Y + 7.1, -ZA, ex + 0.3, Y + 8.3, ZA, { col: [0.95, 0.9, 0.8] });
      wallSign(ctx, ex + nx * 0.31, Y + 7.15, 0, nx, 0, 7.8, 1.1, SG['ひだまり商店街'], [1.15, 1.15, 1.15], 0);
      wallSign(ctx, ex - nx * 0.31, Y + 7.15, 0, -nx, 0, 7.8, 1.1, SG['ひだまり商店街'], [1.15, 1.15, 1.15], 0);
      for (let k = -3; k <= 3; k++) ctx.B.box(M.glow, ex + nx * 0.32 - 0.06, Y + 8.35, k * 1.25 - 0.12, ex + nx * 0.32 + 0.06, Y + 8.6, k * 1.25 + 0.12, { col: [3, 2.2, 0.8] });
      if (!ctx.noFurn) ctx.noFurn = [];
      ctx.noFurn.push([ex - 3, -ZA - 1, ex + 3, ZA + 1]);
    }
    // 店先の小物: 自転車・ベンチ・屋台
    for (let k = 0; k < 8; k++) {
      const x = x0 + 2 + rnd() * (x1 - x0 - 4), s = rnd() < 0.5 ? -1 : 1;
      if (Math.abs(x - pass) < 2.5) continue;
      ctx.prop(pick(ctx, ['bicycle', 'bicycle', 'scooter', 'bench', 'stall']), x, s * (ZA - 1.1), s > 0 ? Math.PI : 0, { y: Y, col: pick(ctx, [[0.8, 0.1, 0.1], [0.2, 0.3, 0.6], [0.85, 0.85, 0.85], [0.95, 0.8, 0.2]]) });
    }
    roofs.push([x0, x1]);
    // 電柱(外の歩道)
    for (const zz of [z0 + 1.2, z1 - 1.2]) { const pts = []; for (let x = x0 + 4; x < x1 - 2; x += rr(ctx, 13, 16)) pts.push([x, zz]); if (pts.length > 1) poles(ctx, pts); }
  }
  const meshes = RB.finish(ctx.W.group, { cast: false });
  const clones = new Map();
  for (const m of meshes) {
    let c = clones.get(m.material);
    if (!c) { c = m.material === M.arcade ? m.material.clone() : cutout(m.material.clone()); c.transparent = true; c.userData.base = c.opacity; clones.set(m.material, c); }
    m.material = c; m.renderOrder = 2;
  }
  const mats = [...clones.values()];
  ctx.W.addFader(mats, (x, z) => Math.abs(z) < ZA + 1 && roofs.some(([a, b]) => x > a - 1 && x < b + 1), 0.08);
  // アーケード屋根の材質は もともと半とうめい: 透かしの割合を もとの濃さに合わせる
  for (const c of mats) if (c.userData.base < 1) { const base = c.userData.base; Object.defineProperty(c, 'opacity', { get() { return this._op * base; }, set(v) { this._op = v; }, configurable: true }); c._op = 1; }
  ctx.mapRect(pads[0][0], -ZA, pads[pads.length - 1][1], ZA, '#c8b090');
}

// ================= 地区の入口の門 =================
// 道の上に立つ。alongX = 道が東西(門は南北にまたぐ)
export function paifang(ctx, cx, cz, alongX, s = 1) {
  const { M } = ctx;
  // 道が東西なら 門の幅は南北: ローカルの x が 門の幅。回して合わせる
  const m = new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0).setPosition(cx, 0, cz);
  const red = [0.72, 0.08, 0.06], P = [[-7.8 * s, 6.4], [-3.8 * s, 7.6], [3.8 * s, 7.6], [7.8 * s, 6.4]];
  withMatrix(ctx, m, () => {
    const B = ctx.B;
    for (const [x, h] of P) { B.box(M.plain, x - 0.32, 0, -0.32, x + 0.32, h, 0.32, { col: red }); B.box(M.plain, x - 0.6, 0, -0.6, x + 0.6, 0.7, 0.6, { col: [0.6, 0.58, 0.55] }); }
    B.box(M.plain, -4.2 * s, 6.2, -0.3, 4.2 * s, 7.0, 0.3, { col: red });
    B.box(M.plain, -8.2 * s, 5.2, -0.25, -3.6 * s, 5.8, 0.25, { col: red }); B.box(M.plain, 3.6 * s, 5.2, -0.25, 8.2 * s, 5.8, 0.25, { col: red });
    for (const sg of [1, -1]) B.wall(M.sign, 0, 6.25, sg * 0.31, 0, sg, 6.2 * s, 1.5, { uv: signUVOf(SG['中華街']), col: [1.2, 1.2, 1.2] });
    hip(ctx, -4.3 * s, -0.8, 4.3 * s, 0.8, 7.6, 1.3, { roofTile: 57, over: 0.9, ridgeCol: [0.8, 0.6, 0.15], ends: [0.85, 0.65, 0.2] });
    hip(ctx, -8.3 * s, -0.6, -3.4 * s, 0.6, 6.4, 0.9, { roofTile: 57, over: 0.7, ridge: true, ridgeCol: [0.8, 0.6, 0.15] });
    hip(ctx, 3.4 * s, -0.6, 8.3 * s, 0.6, 6.4, 0.9, { roofTile: 57, over: 0.7, ridgeCol: [0.8, 0.6, 0.15] });
    for (const x of [-6, -2.5, 0, 2.5, 6]) lantern(ctx, x * s, 4.9, 0, 0.8);
  }, cx, cz);
  for (const [x] of P) { const px = alongX ? cx : cx + x, pz = alongX ? cz - x : cz; ctx.solid(px - 0.35, pz - 0.35, px + 0.35, pz + 0.35, 7); }
}
function archGate(ctx, cx, cz, alongX, kind) {
  const { M } = ctx;
  const m = new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0).setPosition(cx, 0, cz);
  const W = 7.9;
  withMatrix(ctx, m, () => {
    const B = ctx.B;
    if (kind === 'neon') {
      for (const s of [-1, 1]) { B.box(M.plain, s * W - 0.35, 0, -0.35, s * W + 0.35, 8.6, 0.35, { col: [0.15, 0.14, 0.17] }); neon(ctx, [s * W + s * 0.38, 0.5, 0], [s * W + s * 0.38, 8.2, 0], [3, 0.3, 0.6], 0.07); }
      B.box(M.plain, -W - 0.6, 6.7, -0.4, W + 0.6, 8.7, 0.4, { col: [0.55, 0.06, 0.08] });
      for (const sg of [1, -1]) B.wall(M.sign, 0, 6.85, sg * 0.42, 0, sg, 12.5, 1.75, { uv: signUVOf(SG['不夜城一番街']), col: [1.4, 1.4, 1.4] });
      for (let x = -W; x <= W + 0.01; x += 0.8) for (const y of [6.62, 8.78]) B.box(M.glow, x - 0.08, y - 0.08, -0.45, x + 0.08, y + 0.08, 0.45, { col: [3, 2.4, 1.2] });
    } else if (kind === 'shita') {
      for (const s of [-1, 1]) B.box(M.plain, s * W - 0.25, 0, -0.25, s * W + 0.25, 7.6, 0.25, { col: [0.85, 0.82, 0.78] });
      B.box(M.plain, -W - 0.4, 6.2, -0.3, W + 0.4, 7.7, 0.3, { col: [0.95, 0.92, 0.85] });
      for (const sg of [1, -1]) B.wall(M.sign, 0, 6.25, sg * 0.32, 0, sg, 11, 1.4, { uv: signUVOf(SG['ひだまり商店街']), col: [1.15, 1.15, 1.15] });
      for (let x = -W; x <= W; x += 0.9) B.box(M.plain, x - 0.2, 7.7, -0.2, x + 0.2, 8.1, 0.2, { col: [1, 0.55 + 0.2 * Math.sin(x), 0.72] });
    } else if (kind === 'office') {
      for (const s of [-1, 1]) {
        B.box(M.plain, s * W - 0.6, 0, -0.6, s * W + 0.6, 11.5, 0.6, { col: [0.12, 0.16, 0.22] });
        for (const z of [-0.62, 0.62]) B.box(M.glow, s * W - 0.08, 0.4, z - 0.03, s * W + 0.08, 11.2, z + 0.03, { col: [0.4, 1.6, 3] });
      }
      B.box(M.plain, -W - 0.8, 10.2, -0.5, W + 0.8, 11.6, 0.5, { col: [0.12, 0.16, 0.22] });
      for (const sg of [1, -1]) B.wall(M.sign, 0, 10.25, sg * 0.52, 0, sg, 10.5, 1.3, { uv: signUVOf(SG['BUSINESS DISTRICT']), col: [1.3, 1.3, 1.3] });
      B.box(M.glow, -W - 0.8, 10.1, -0.52, W + 0.8, 10.18, 0.52, { col: [0.4, 1.6, 3] });
    }
  }, cx, cz);
  const r = kind === 'office' ? 0.6 : 0.35;
  for (const s of [-1, 1]) { const px = alongX ? cx : cx + s * W, pz = alongX ? cz - s * W : cz; ctx.solid(px - r, pz - r, px + r, pz + r, 8); }
}
function ruinsGate(ctx, cx, cz, alongX) {
  const { rnd } = ctx;
  const P = (u, v) => (alongX ? [cx + v, cz + u] : [cx + u, cz + v]);
  const rot = alongX ? Math.PI / 2 : 0;
  for (const u of [-5.2, -2.6, 2.6, 5.2]) { const [x, z] = P(u, (rnd() - 0.5) * 0.6); ctx.prop(rnd() < 0.5 ? 'jersey' : 'barricade', x, z, rot + (rnd() - 0.5) * 0.3, {}); }
  for (const u of [-7.4, 7.4]) {
    const [x, z] = P(u, 0);
    ctx.B.box(ctx.M.plain, x - 0.08, 0, z - 0.08, x + 0.08, 3.4, z + 0.08, { col: [0.3, 0.3, 0.3] });
    const n = alongX ? [1, 0] : [0, 1];
    wallSign(ctx, x, 2.2, z, n[0], n[1], 2.6, 0.65, SG['立入禁止'], [1.05, 1.05, 1.05], 0.1);
    wallSign(ctx, x, 2.2, z, -n[0], -n[1], 2.6, 0.65, SG['KEEP OUT'], [1.05, 1.05, 1.05], 0.1);
    ctx.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 3.4);
  }
  // 黄色いテープ
  const [ax, az] = P(-7.4, 0), [bx, bz] = P(7.4, 0);
  for (const h of [1.0, 1.25]) { const p = sagLine([ax, h, az], [bx, h, bz], 0.3, 6); for (let k = 0; k < p.length - 1; k++) if (Math.abs((k + 0.5) / (p.length - 1) - 0.5) > 0.12) beam(ctx.B, ctx.M.glow, p[k], p[k + 1], 0.05, [1.6, 1.3, 0.1]); }
  for (let k = 0; k < 3; k++) { const [x, z] = P((rnd() - 0.5) * 10, 2 + rnd() * 3); ctx.prop('cone', x, z, rnd() * 6, { solid: false }); }
  const [fx, fz] = P(rnd() < 0.5 ? -6.5 : 6.5, 3);
  ctx.prop('fireBarrel', fx, fz, 0, {}); pool(ctx, fx, fz, 5, [0.9, 0.45, 0.12]);
}
export function gate(ctx, D, cx, cz, alongX) {
  if (D === 'temple') torii(ctx, cx, cz, alongX, 15.6, 9.8, { plaque: SG['天神'] });
  else if (D === 'china') paifang(ctx, cx, cz, alongX);
  else if (D === 'neon') archGate(ctx, cx, cz, alongX, 'neon');
  else if (D === 'shita') archGate(ctx, cx, cz, alongX, 'shita');
  else if (D === 'office') archGate(ctx, cx, cz, alongX, 'office');
  else if (D === 'ruins') ruinsGate(ctx, cx, cz, alongX);
}
// 地区の中の道が、ほかの所から入ってくる場所に 門を置く
export function genGates(ctx, lines, rw) {
  const ends = [-192, ...lines, 192];
  const EXIT_X = [-40, 40], EXIT_Z = [-40, 40, 178];
  const out = [];
  for (const alongZ of [true, false]) for (const C of lines) for (let k = 0; k < ends.length - 1; k++) {
    const a = ends[k], b = ends[k + 1];
    const seg = (p, q) => { const m = (p + q) / 2; const i0 = cellOf(alongZ ? C - 1 : m), i1 = cellOf(alongZ ? C + 1 : m), j0 = cellOf(alongZ ? m : C - 1), j1 = cellOf(alongZ ? m : C + 1); const d0 = districtOfCell(i0, j0), d1 = districtOfCell(i1, j1); return d0 === d1 ? d0 : null; };
    const D = seg(a, b);
    if (!D || D === 'plaza') continue;
    if (alongZ && C === 112 && a === -112 && b === -40) continue;     // モールの所
    for (const [E, dir] of [[a, 1], [b, -1]]) {
      let enter;
      if (Math.abs(E) >= 191) enter = (alongZ ? EXIT_X : EXIT_Z).includes(C);
      else { const nb = ends[ends.indexOf(E) - dir]; enter = seg(E, nb) !== D; }
      if (!enter) continue;
      const p = E + dir * (Math.abs(E) >= 191 ? 10 : rw + 4.5);
      const cx = alongZ ? C : p, cz = alongZ ? p : C;
      if (!alongZ && C === 178 && D !== 'ruins') continue;      // 高架の下
      gate(ctx, D, cx, cz, !alongZ);
      out.push([D, cx, cz]);
      (ctx.noFurn || (ctx.noFurn = [])).push(alongZ ? [cx - 10, cz - 2.6, cx + 10, cz + 2.6] : [cx - 2.6, cz - 10, cx + 2.6, cz + 10]);
    }
  }
  return out;
}

// ================= 歩道の小物(地区ごと) =================
// k: 0 = 明かり / 1 = 木 / 2 = 小物。(px,pz) 置く所、rot 明かりの腕の向き、(nx,nz) 区画の外向き
export function dFurniture(ctx, D, px, pz, rot, k, nx, nz) {
  const { rnd } = ctx;
  if (ctx.noFurn && ctx.noFurn.some(([a, b, c, d]) => px > a && px < c && pz > b && pz < d)) return;
  const face = Math.atan2(-nx, -nz) + Math.PI;
  if (D === 'temple') {
    if (k === 0) ctx.prop('toro', px, pz, 0, { y: Y, col: [0.62, 0.6, 0.56] }), pool(ctx, px, pz, 3.2, [0.3, 0.2, 0.08], Y + 0.03);
    else if (k === 1) placeTree(ctx, rnd() < 0.75 ? 'sakura' : 'pine', px, pz, 0.55 + rnd() * 0.2, rnd() * 6);
    else if (rnd() < 0.35) ctx.prop(pick(ctx, ['bench', 'bicycle', 'rickshaw']), px - nx * 1.0, pz - nz * 1.0, face + Math.PI / 2, { y: Y, col: [0.6, 0.1, 0.08] });
    return;
  }
  if (D === 'china') {
    if (k === 0) { ctx.B.box(ctx.M.plain, px - 0.1, Y, pz - 0.1, px + 0.1, Y + 5.2, pz + 0.1, { col: [0.6, 0.08, 0.06] }); ctx.solid(px - 0.15, pz - 0.15, px + 0.15, pz + 0.15, 5); lantern(ctx, px - nz * 0.5, Y + 4.6, pz + nx * 0.5, 1); lantern(ctx, px + nz * 0.5, Y + 4.6, pz - nx * 0.5, 1); pool(ctx, px, pz, 4, [0.3, 0.07, 0.03], Y + 0.03); }
    else if (k === 1) { ctx.prop('planter', px, pz, 0, { y: Y }); placeTree(ctx, 'broad', px, pz, 0.5, rnd() * 6); }
    else if (rnd() < 0.45) ctx.prop(pick(ctx, ['stall', 'scooter', 'scooter', 'trashcan']), px - nx * 0.9, pz - nz * 0.9, face, { y: Y, col: pick(ctx, [[0.9, 0.3, 0.2], [0.95, 0.85, 0.7], [0.2, 0.3, 0.6]]) });
    return;
  }
  if (D === 'neon') {
    if (k === 0) lamp(ctx, px, pz, rot, Y);
    else if (k === 1) { if (rnd() < 0.5) ctx.prop('vending', px, pz, face, { y: Y, col: pick(ctx, [[0.9, 0.15, 0.12], [0.2, 0.4, 0.8], [0.92, 0.92, 0.92]]) }); else ctx.prop('trashbags', px, pz, rnd() * 6, { y: Y, solid: false }); }
    else if (rnd() < 0.55) ctx.prop(pick(ctx, ['scooter', 'scooter', 'bicycle', 'trashcan', 'hydrant']), px - nx * 0.8, pz - nz * 0.8, face + Math.PI / 2, { y: Y, col: pick(ctx, [[0.1, 0.1, 0.1], [0.85, 0.85, 0.85], [0.8, 0.1, 0.4]]) });
    return;
  }
  if (D === 'shita') {
    if (k === 0) { if (rnd() < 0.5) lamp(ctx, px, pz, rot, Y); else ctx.prop('vending', px, pz, face, { y: Y, col: pick(ctx, [[0.9, 0.15, 0.12], [0.2, 0.4, 0.8], [0.92, 0.92, 0.92]]) }); }
    else if (k === 1) { ctx.prop('planter', px, pz, 0, { y: Y, col: [0.6, 0.45, 0.3] }); placeTree(ctx, rnd() < 0.3 ? 'sakura' : 'broad', px, pz, 0.45, rnd() * 6); }
    else if (rnd() < 0.5) ctx.prop(pick(ctx, ['bicycle', 'bicycle', 'scooter', 'trashcan']), px - nx * 0.8, pz - nz * 0.8, face + Math.PI / 2, { y: Y, col: pick(ctx, [[0.8, 0.1, 0.1], [0.2, 0.3, 0.6], [0.85, 0.85, 0.85], [0.95, 0.8, 0.2]]) });
    return;
  }
  if (D === 'office') {
    if (k === 0) lamp(ctx, px, pz, rot, Y);
    else if (k === 1) { ctx.prop('planter', px, pz, 0, { y: Y, col: [0.75, 0.76, 0.78] }); placeTree(ctx, 'birch', px, pz, 0.7, rnd() * 6); }
    else if (rnd() < 0.5) ctx.prop(pick(ctx, ['bollard', 'bench', 'trashcan']), px - nx * 0.6, pz - nz * 0.6, face + Math.PI / 2, { y: Y });
    return;
  }
  if (D === 'ruins') {
    if (k === 0) { if (rnd() < 0.5) lamp(ctx, px, pz, rot, Y); else ctx.prop('rubble', px, pz, rnd() * 6, { y: Y, solid: false }); }
    else if (k === 1) placeTree(ctx, 'dead', px, pz, 0.6 + rnd() * 0.3, rnd() * 6, [0.5, 0.45, 0.4]);
    else if (rnd() < 0.6) { ctx.prop(pick(ctx, ['rubble', 'trashbags', 'tires', 'barrel']), px - nx * 0.8, pz - nz * 0.8, rnd() * 6, { y: Y, solid: false }); decal(ctx, 7, px, pz, 2.5, rnd() * 6, Y + 0.01); }
    return;
  }
}

// ================= 道の上の車(地区ごと) =================
const CARS = [[0.7, 0.1, 0.1], [0.15, 0.25, 0.5], [0.85, 0.85, 0.85], [0.1, 0.1, 0.1], [0.5, 0.5, 0.52], [0.25, 0.4, 0.25], [0.75, 0.6, 0.2], [0.35, 0.18, 0.12]];
const TAXI = [[0.95, 0.75, 0.1], [0.1, 0.1, 0.1], [0.2, 0.55, 0.3], [0.9, 0.9, 0.9]];
// 返り値: [名前, 長さ, 色, 燃えた?]
export function vehicleFor(ctx, D) {
  const r = ctx.rnd();
  switch (D) {
    case 'neon': return r < 0.45 ? ['taxi', 4.4, pick(ctx, TAXI), false] : r < 0.6 ? ['scooter', 1.6, pick(ctx, CARS), false] : r < 0.75 ? ['van', 5, [0.1, 0.1, 0.1], false] : ['sedan', 4.4, pick(ctx, [[0.1, 0.1, 0.1], [0.9, 0.9, 0.9], [0.6, 0.05, 0.3]]), r > 0.95];
    case 'office': return r < 0.4 ? ['sedan', 4.4, pick(ctx, [[0.06, 0.06, 0.07], [0.15, 0.15, 0.17], [0.85, 0.86, 0.88]]), false] : r < 0.6 ? ['taxi', 4.4, pick(ctx, TAXI), false] : r < 0.75 ? ['bus', 11, [0.2, 0.45, 0.75], false] : ['van', 5, [0.92, 0.92, 0.92], r > 0.95];
    case 'shita': return r < 0.4 ? ['kei', 3.4, pick(ctx, [[0.92, 0.92, 0.9], [0.92, 0.92, 0.9], [0.3, 0.45, 0.7]]), false] : r < 0.6 ? ['scooter', 1.6, pick(ctx, CARS), false] : r < 0.75 ? ['bicycle', 1.7, pick(ctx, CARS), false] : ['van', 5, pick(ctx, CARS), r > 0.93];
    case 'china': return r < 0.3 ? ['scooter', 1.6, pick(ctx, CARS), false] : r < 0.45 ? ['rickshaw', 2.6, [0.6, 0.08, 0.06], false] : r < 0.65 ? ['kei', 3.4, [0.92, 0.92, 0.9], false] : ['sedan', 4.4, pick(ctx, CARS), r > 0.92];
    case 'temple': return r < 0.4 ? ['rickshaw', 2.6, pick(ctx, [[0.6, 0.08, 0.06], [0.1, 0.1, 0.1]]), false] : r < 0.7 ? ['bicycle', 1.7, pick(ctx, CARS), false] : ['sedan', 4.4, pick(ctx, CARS), false];
    case 'ruins': return r < 0.12 ? ['bus', 11, [0.13, 0.11, 0.1], true] : r < 0.3 ? ['van', 5, [0.13, 0.11, 0.1], true] : r < 0.4 ? ['truck', 10, [0.13, 0.11, 0.1], true] : ['sedan', 4.4, r < 0.85 ? [0.13, 0.11, 0.1] : pick(ctx, CARS), r < 0.85];
    default: return null;
  }
}
// 道の上の飾り(中華街: ちょうちんの列が 道をまたぐ)。s = {C, a, b, z(南北の道)}
export function dStreet(ctx, D, s) {
  if (D === 'neon') {   // ぬれた道に うつる ネオンの光(すじ)
    for (let v = s.a + 2; v < s.b - 2; v += 3 + ctx.rnd() * 4) {
      const u = (ctx.rnd() - 0.5) * 9, c = pick(ctx, NEONC), L = 4 + ctx.rnd() * 5;
      ctx.B.flat(ctx.M.pool, s.z ? s.C + u : v, 0.03, s.z ? v : s.C + u, s.z ? 1.1 : L, s.z ? L : 1.1, { uv: [0, 0, 1, 1], col: [c[0] * 0.09, c[1] * 0.09, c[2] * 0.09] });
    }
    for (let k = 0; k < 4; k++) { const v = s.a + ctx.rnd() * (s.b - s.a), u = (ctx.rnd() - 0.5) * 8; decal(ctx, 0, s.z ? s.C + u : v, s.z ? v : s.C + u, 3 + ctx.rnd() * 3, ctx.rnd() * 6, 0.024, [0.5, 0.55, 0.8]); }
    return;
  }
  if (D !== 'china') return;
  for (let v = s.a + 4; v < s.b - 3; v += 8.5) {
    const A = s.z ? [s.C - 9.2, Y + 6.6, v] : [v, Y + 6.6, s.C - 9.2], Bp = s.z ? [s.C + 9.2, Y + 6.6, v + 0.4] : [v + 0.4, Y + 6.6, s.C + 9.2];
    lanternString(ctx, A, Bp, 1.0, 1.6);
    pool(ctx, s.z ? s.C : v, s.z ? v : s.C, 5, [0.26, 0.06, 0.03], 0.03);
  }
}
// 道の区間の地区(両側が同じ地区のときだけ)
export function segDistrict(C, a, b, alongZ) {
  const m = (a + b) / 2;
  const d0 = alongZ ? districtAt(C - 1, m) : districtAt(m, C - 1), d1 = alongZ ? districtAt(C + 1, m) : districtAt(m, C + 1);
  return d0 === d1 ? d0 : null;
}
export { EDGES, patchPlain, gable, FT };
