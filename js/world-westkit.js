// マップ係(第5弾・西部の町): 西部の町を作る道具。
//  - wbuild: 木造の建物(正面だけ高い「看板建築」・切妻屋根・ひさし・つり看板・ランタン)。中に入れない
//  - WBld: 中に入れる建物(world-interiors.js の Bld に、西部の まとめ絵の壁を貼る)
//  - boardwalk 板張りの歩道 / mesa 赤い岩山 / train 蒸気機関車 / 小道具(たる・ダイナマイト・ほろ馬車・駅馬車・ランプ・馬つなぎ …)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { makeGeo } from './world-build.js';
import { PROPS } from './world-props.js';
import { quad4, beam, faces, withMatrix, tri, PAD_H } from './world-dkit.js';
import { wUV, wSignUV, WT } from './world-westex.js';
import { Bld } from './world-interiors.js';
import { pool } from './world-town.js';
import { seeded } from './util.js';

const Y = PAD_H;
const _m = new THREE.Matrix4();
const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const WOODC = [0.5, 0.36, 0.24], DARKW = [0.26, 0.18, 0.12];

// 面(P00 左下・P10 右下・P01 左上・P11 右上)を nu × nv に分けて、マス tile を 1 枚ずつ貼る
export function wpatch(bk, P00, P10, P01, P11, nu, nv, tile, col) {
  const uv = wUV(tile);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a0 = L3(P00, P10, i / nu), a1 = L3(P00, P10, (i + 1) / nu), b0 = L3(P01, P11, i / nu), b1 = L3(P01, P11, (i + 1) / nu);
    quad4(bk, L3(a0, b0, j / nv), L3(a1, b1, j / nv), L3(a1, b1, (j + 1) / nv), L3(a0, b0, (j + 1) / nv), uv, col);
  }
}
// 地面に敷く(マスを size m ごとに くり返す)
export function wfloor(ctx, x0, z0, x1, z1, y, tile, col = [1, 1, 1], size = 4) {
  const bk = ctx.B.bucket(ctx.M.west, (x0 + x1) / 2, (z0 + z1) / 2);
  wpatch(bk, [x0, y, z1], [x1, y, z1], [x0, y, z0], [x1, y, z0], Math.max(1, Math.round((x1 - x0) / size)), Math.max(1, Math.round((z1 - z0) / size)), tile, col);
}
// 壁の 1 段(外向き (nx,nz)、始まりの角 (sx,sz)、長さ L)に マスを並べる。tiles = 番号 か 番号の列
export function wwall(ctx, bk, sx, sz, nx, nz, L, y0, y1, tiles, col, bay = 3.2, seed = 0) {
  const rx = nz, rz = -nx, nb = Math.max(1, Math.round(L / bay)), bw = L / nb;
  for (let i = 0; i < nb; i++) {
    const t = typeof tiles === 'number' ? tiles : tiles[(i + seed) % tiles.length];
    if (t < 0) continue;
    const uv = wUV(t);
    ctx.B.face(bk, sx + rx * bw * i, y0, sz + rz * bw * i, rx, 0, rz, 0, 1, 0, bw, y1 - y0, uv[0], uv[1], uv[2], uv[3], col, null);
  }
}
// 箱(4 面と 上)に マスを貼る
export function wbox(ctx, x0, y0, z0, x1, y1, z1, tile, col = [1, 1, 1], topTile = null, bay = 3.2) {
  const bk = ctx.B.bucket(ctx.M.west, (x0 + x1) / 2, (z0 + z1) / 2);
  for (const [nx, nz, sx, sz, L] of faces(x0, z0, x1, z1)) wwall(ctx, bk, sx, sz, nx, nz, L, y0, y1, tile, col, bay);
  wpatch(bk, [x0, y1, z1], [x1, y1, z1], [x0, y1, z0], [x1, y1, z0], Math.max(1, Math.round((x1 - x0) / bay)), Math.max(1, Math.round((z1 - z0) / bay)), topTile ?? tile, col);
}
// 看板(中心 (cx,cz)、下の高さ y、表の向き (nx,nz))
export function wsign(ctx, cx, y, cz, nx, nz, w, h, idx, col = [1, 1, 1], off = 0.06) {
  const rx = nz, rz = -nx, uv = wSignUV(idx), bk = ctx.B.bucket(ctx.M.west, cx, cz);
  ctx.B.face(bk, cx + nx * off - rx * w / 2, y, cz + nz * off - rz * w / 2, rx, 0, rz, 0, 1, 0, w, h, uv[0], uv[1], uv[2], uv[3], col, null);
}
// 板張りの歩道
export function boardwalk(ctx, x0, z0, x1, z1) {
  ctx.B.box(ctx.M.plain, x0, 0, z0, x1, Y - 0.004, z1, { col: DARKW, skip: 'bt' });
  wfloor(ctx, x0, z0, x1, z1, Y, WT.walk, [1, 1, 1], 2.6);
  ctx.mapRect(x0, z0, x1, z1, '#b89468');
}
// 切妻屋根(棟は ridgeX なら東西)。高さを返す
export function wgable(ctx, bk, x0, z0, x1, z1, H, ridgeX, tile, rc, rise, ov = 0.45, endCol = WOODC) {
  const ridge = H + rise, ey = H - ov * (rise / Math.max(1, (ridgeX ? z1 - z0 : x1 - x0) / 2));
  const len = ridgeX ? x1 - x0 : z1 - z0, span = (ridgeX ? z1 - z0 : x1 - x0) / 2;
  const n1 = Math.max(1, Math.round(len / 3)), nv = Math.max(1, Math.round(span / 3));
  if (ridgeX) {
    const zc = (z0 + z1) / 2;
    wpatch(bk, [x0, ey, z1 + ov], [x1, ey, z1 + ov], [x0, ridge, zc], [x1, ridge, zc], n1, nv, tile, rc);
    wpatch(bk, [x1, ey, z0 - ov], [x0, ey, z0 - ov], [x1, ridge, zc], [x0, ridge, zc], n1, nv, tile, rc);
    tri(ctx, [x0, H, z0], [x0, H, z1], [x0, ridge - 0.05, zc], endCol); tri(ctx, [x1, H, z1], [x1, H, z0], [x1, ridge - 0.05, zc], endCol);
  } else {
    const xc = (x0 + x1) / 2;
    wpatch(bk, [x1 + ov, ey, z1], [x1 + ov, ey, z0], [xc, ridge, z1], [xc, ridge, z0], n1, nv, tile, rc);
    wpatch(bk, [x0 - ov, ey, z0], [x0 - ov, ey, z1], [xc, ridge, z0], [xc, ridge, z1], n1, nv, tile, rc);
    tri(ctx, [x0, H, z1], [x1, H, z1], [xc, ridge - 0.05, z1], endCol); tri(ctx, [x1, H, z0], [x0, H, z0], [xc, ridge - 0.05, z0], endCol);
  }
  return ridge;
}
// 正面だけ高い板(看板建築)。top: 'rect' | 'step' | 'peak'
export function falseFront(ctx, f, H, fh, col, top = 'rect', sign = null) {
  const { M } = ctx, [nx, nz, sx, sz, L] = f, rx = nz, rz = -nx, th = 0.24, e = 0.03;
  const bk = ctx.B.bucket(M.west, sx + rx * L / 2, sz + rz * L / 2);
  const slab = (a0, a1, y0, y1) => {
    const ax = sx + rx * a0, az = sz + rz * a0, bx = sx + rx * a1, bz = sz + rz * a1;
    ctx.B.box(M.plain, Math.min(ax, bx, ax - nx * th, bx - nx * th), y0, Math.min(az, bz, az - nz * th, bz - nz * th), Math.max(ax, bx, ax - nx * th, bx - nx * th), y1, Math.max(az, bz, az - nz * th, bz - nz * th), { col: [WOODC[0] * col[0], WOODC[1] * col[1], WOODC[2] * col[2]] });
    wwall(ctx, bk, ax + nx * e, az + nz * e, nx, nz, a1 - a0, y0, y1, WT.cornice, col, 3.2);
  };
  slab(0, L, H - 0.05, H + fh);
  let topY = H + fh;
  if (top === 'step') { slab(L * 0.22, L * 0.78, H + fh - 0.02, H + fh + 0.85); topY += 0.85; }
  else if (top === 'peak') {
    const a = [sx + nx * e, H + fh, sz + nz * e], b = [sx + rx * L + nx * e, H + fh, sz + rz * L + nz * e], c = [sx + rx * L / 2 + nx * e, H + fh + Math.min(1.5, L * 0.16), sz + rz * L / 2 + nz * e];
    const pc = [0.72 * col[0], 0.62 * col[1], 0.5 * col[2]];
    tri(ctx, a, b, c, pc); tri(ctx, [b[0] - nx * th, b[1], b[2] - nz * th], [a[0] - nx * th, a[1], a[2] - nz * th], [c[0] - nx * th, c[1], c[2] - nz * th], pc);
    topY += Math.min(1.5, L * 0.16);
  }
  if (sign != null) { const h = Math.min(fh - 0.72, L / 4.4, 1.5), w = h * 4; if (h > 0.5) wsign(ctx, sx + rx * L / 2, H + 0.1, sz + rz * L / 2, nx, nz, w, h, sign, [1.05, 1.05, 1.05], 0.07); }
  return topY;
}
// ひさし・柱・ランタン・つり看板。kind: 'slope' | 'flat' | 'balcony'
export function porch(ctx, f, o = {}) {
  const { M, rnd } = ctx, [nx, nz, sx, sz, L] = f, rx = nz, rz = -nx;
  const D = o.D ?? 2.6, kind = o.kind || 'slope', H = o.H ?? 7, col = o.col || [1, 1, 1];
  const bk = ctx.B.bucket(M.west, sx + rx * L / 2, sz + rz * L / 2);
  const P = (a, d, y) => [sx + rx * a + nx * d, y, sz + rz * a + nz * d];
  const pc = [WOODC[0] * col[0], WOODC[1] * col[1], WOODC[2] * col[2]];
  const yW = kind === 'slope' ? 3.6 : 3.4, yO = kind === 'slope' ? 3.0 : 3.4, nb = Math.max(1, Math.round(L / 3));
  const tile = o.tile ?? [WT.shingle, WT.tin, WT.canvas, WT.shingle][Math.floor(rnd() * 4)];
  const tc = tile === WT.canvas ? [[1, 0.62, 0.55], [0.7, 0.85, 0.75], [1, 0.95, 0.8]][Math.floor(rnd() * 3)] : [1, 1, 1];
  const deck = (y0, y1, t, c) => {
    wpatch(bk, P(0, D + 0.25, y1), P(L, D + 0.25, y1), P(0, 0.02, y0), P(L, 0.02, y0), nb, 1, t, c);
    wpatch(bk, P(L, D + 0.25, y1 - 0.04), P(0, D + 0.25, y1 - 0.04), P(L, 0.02, y0 - 0.04), P(0, 0.02, y0 - 0.04), nb, 1, WT.board, [0.45, 0.4, 0.36]);
  };
  deck(yW, yO, kind === 'balcony' ? WT.walk : tile, kind === 'balcony' ? [0.9, 0.9, 0.9] : tc);
  beam(ctx.B, M.plain, P(0, D + 0.2, yO - 0.1), P(L, D + 0.2, yO - 0.1), 0.16, pc);
  const np = Math.max(2, Math.round(L / 3.3) + 1), top = kind === 'balcony' ? Math.min(H - 0.5, 6.6) : yO - 0.05;
  for (let i = 0; i < np; i++) { const p = P(0.18 + i * (L - 0.36) / (np - 1), D, 0); ctx.B.box(M.plain, p[0] - 0.08, Y, p[2] - 0.08, p[0] + 0.08, top, p[2] + 0.08, { col: pc }); }
  if (kind === 'balcony') {
    for (const y of [4.3, 3.85]) beam(ctx.B, M.plain, P(0, D + 0.05, y), P(L, D + 0.05, y), 0.07, pc);
    for (const a of [0, L]) beam(ctx.B, M.plain, P(a, D + 0.05, 4.3), P(a, 0.1, 4.3), 0.07, pc);
    wpatch(bk, P(0, D + 0.3, top - 0.1), P(L, D + 0.3, top - 0.1), P(0, 0.02, top + 0.45), P(L, 0.02, top + 0.45), nb, 1, tile, tc);
    beam(ctx.B, M.plain, P(0, D + 0.2, top - 0.15), P(L, D + 0.2, top - 0.15), 0.14, pc);
  }
  // ランタン(光る材質。本物の光ではない)と 足もとの明かり
  const la = L * (0.3 + rnd() * 0.4), lp = P(la, D - 0.35, 2.45);
  ctx.B.box(M.glow, lp[0] - 0.11, lp[1], lp[2] - 0.11, lp[0] + 0.11, lp[1] + 0.3, lp[2] + 0.11, { col: [2.8, 1.7, 0.6], skip: '' });
  ctx.B.box(M.plain, lp[0] - 0.02, lp[1] + 0.3, lp[2] - 0.02, lp[0] + 0.02, yO - 0.1, lp[2] + 0.02, { col: [0.1, 0.09, 0.08] });
  pool(ctx, lp[0], lp[2], 3.6, [0.34, 0.2, 0.07], Y + 0.03);
  // つり看板(通りを歩く人から読める。南向きは 見下ろしでも読める)
  if (o.sign != null && o.blade !== false) {
    const a = Math.min(L - 0.6, Math.max(0.6, la + (la > L / 2 ? -1.6 : 1.6))), c = P(a, D - 1.05, 2.3);
    wsign(ctx, c[0], c[1], c[2], rx, rz, 1.9, 0.48, o.sign, [1.05, 1.05, 1.05], 0.03); wsign(ctx, c[0], c[1], c[2], -rx, -rz, 1.9, 0.48, o.sign, [1.05, 1.05, 1.05], 0.03);
    for (const d of [D - 1.8, D - 0.3]) { const q = P(a, d, 2.78); ctx.B.box(M.plain, q[0] - 0.015, q[1], q[2] - 0.015, q[0] + 0.015, yO, q[2] + 0.015, { col: [0.1, 0.09, 0.08] }); }
  }
}
// 木造の建物(中に入れない)。r = [x0,z0,x1,z1]、n = 正面の向き。o: { H, two(2階), fh, col, ground, up, side, sign, top, roof, roofTile, porch, D }
export function wbuild(ctx, r, n, o = {}) {
  const { M, rnd } = ctx, [x0, z0, x1, z1] = r;
  const two = !!o.two, H = o.H ?? (two ? 7.0 + rnd() * 0.5 : 3.9 + rnd() * 0.6), G = o.G ?? (two ? 3.6 : H - Y), fh = o.fh ?? (1.8 + rnd() * 0.9);
  const col = o.col || [1, 1, 1], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bk = ctx.B.bucket(M.west, cx, cz), side = o.side ?? WT.clap;
  let front = null;
  for (const f of faces(x0, z0, x1, z1)) {
    const [nx, nz, sx, sz, L] = f;
    if (nx === n[0] && nz === n[1]) {
      front = f;
      wwall(ctx, bk, sx, sz, nx, nz, L, Y, Y + G, o.ground || [WT.clapWin, WT.door, WT.clapWin], col, o.bay ?? 3.2);
      if (H - Y - G > 0.3) wwall(ctx, bk, sx, sz, nx, nz, L, Y + G, H, o.up || [WT.curtain, WT.curtainLit, WT.clapWin], col, o.bay ?? 3.2, 1);
    } else {
      const rows = Math.max(1, Math.round((H - Y) / 3.6)), rh = (H - Y) / rows;
      for (let k = 0; k < rows; k++) wwall(ctx, bk, sx, sz, nx, nz, L, Y + k * rh, Y + (k + 1) * rh, o.sideTiles || [side, k ? WT.clapWin : WT.poster, side, side, WT.clapWin], col, 3.4, k + Math.floor(rnd() * 5));
    }
  }
  const L = front[4];
  let top = H;
  if (o.fh !== 0) top = falseFront(ctx, front, H, fh, col, o.top || ['rect', 'step', 'peak', 'rect'][Math.floor(rnd() * 4)], o.sign);
  const rt = o.roofTile ?? (rnd() < 0.6 ? WT.shingle : WT.tin), rc = o.roofCol || [[1, 1, 1], [0.85, 0.8, 0.78], [1.05, 0.95, 0.85]][Math.floor(rnd() * 3)];
  if (o.roof === 'flat') wpatch(bk, [x0, H, z1], [x1, H, z1], [x0, H, z0], [x1, H, z0], Math.max(1, Math.round((x1 - x0) / 4)), Math.max(1, Math.round((z1 - z0) / 4)), WT.tin, rc);
  else top = Math.max(top, wgable(ctx, bk, x0, z0, x1, z1, H, !!n[0], rt, rc, Math.min(o.fh === 0 ? L * 0.3 : fh - 0.2, L * 0.24), 0.4, [0.74 * col[0], 0.64 * col[1], 0.52 * col[2]]));
  ctx.solid(x0, z0, x1, z1, top);
  ctx.occupy(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5);
  ctx.mapRect(x0, z0, x1, z1, '#5a3a22');
  if (o.porch !== 'none') porch(ctx, front, { D: o.D, kind: o.porch || (two ? 'balcony' : rnd() < 0.75 ? 'slope' : 'flat'), H, col, sign: o.sign, blade: o.blade, tile: o.awnTile });
  return { front, H, top };
}

// 中に入れる建物(壁の外側に 西部の まとめ絵を貼る)。o.rows = [[y0, y1, [マス]]]、o.front = 'S' など + o.frontRows(正面だけ別の並び)
export class WBld extends Bld {
  _skin(bld, alongX, c, p0, p1, y0, y1, ext) {
    const t = this.t, bay = this.bay || 3.2, side = alongX ? (ext > 0 ? 'S' : 'N') : (ext > 0 ? 'E' : 'W');
    const rows = side === this.front && this.frontRows ? this.frontRows : this.rows;
    const off = c + ext * (t / 2 + 0.02);
    const bk = bld.bucket(this.ctx.M.west, alongX ? (p0 + p1) / 2 : off, alongX ? off : (p0 + p1) / 2);
    const neg = alongX ? ext < 0 : ext > 0;
    const rx = alongX ? (neg ? -1 : 1) : 0, rz = alongX ? 0 : (neg ? -1 : 1);
    for (let ci = Math.floor(p0 / bay); ci * bay < p1; ci++) {
      const qa = Math.max(p0, ci * bay), qb = Math.min(p1, (ci + 1) * bay);
      if (qb - qa < 0.01) continue;
      for (let r = 0; r < rows.length; r++) {
        const [ra, rb, tiles] = rows[r];
        const ya = Math.max(y0, ra), yb = Math.min(y1, rb);
        if (yb - ya < 0.01) continue;
        const uv = wUV(tiles[((ci % tiles.length) + tiles.length) % tiles.length]);
        const fa = neg ? ((ci + 1) * bay - qb) / bay : (qa - ci * bay) / bay, fb = neg ? ((ci + 1) * bay - qa) / bay : (qb - ci * bay) / bay;
        const va = (ya - ra) / (rb - ra), vb = (yb - ra) / (rb - ra);
        const u0 = uv[0] + (uv[2] - uv[0]) * fa, u1 = uv[0] + (uv[2] - uv[0]) * fb, v0 = uv[1] + (uv[3] - uv[1]) * va, v1 = uv[1] + (uv[3] - uv[1]) * vb;
        const sx = alongX ? (neg ? qb : qa) : off, sz = alongX ? off : (neg ? qb : qa);
        bld.face(bk, sx, ya, sz, rx, 0, rz, 0, 1, 0, qb - qa, yb - ya, u0, v0, u1, v1, this.skinCol, null);
      }
    }
  }
  // 正面の面([外向き, 始まりの角, 長さ])
  face(side) {
    const { x0, z0, x1, z1 } = this;
    return side === 'S' ? [0, 1, x0, z1, x1 - x0] : side === 'N' ? [0, -1, x1, z0, x1 - x0] : side === 'E' ? [1, 0, x1, z1, z1 - z0] : [-1, 0, x0, z0, z1 - z0];
  }
  // 屋根のまとまり(中に入ると消える)に 作る
  onRoof(fn) { const B0 = this.ctx.B; this.ctx.B = this.RB; try { fn(); } finally { this.ctx.B = B0; } }
}

// 赤い岩山(メサ)。段になった岩。上は平ら
function tri3(bk, a, b, c, ua, ub, uc, col) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
  const base = bk.v;
  bk.p.push(...a, ...b, ...c); bk.u.push(...ua, ...ub, ...uc);
  for (let k = 0; k < 3; k++) { bk.n.push(nx / l, ny / l, nz / l); bk.c.push(col[0], col[1], col[2]); }
  bk.i.push(base, base + 1, base + 2); bk.v += 3;
}
export function mesa(ctx, cx, cz, rx, rz, h, seed = 1, o = {}) {
  const rnd = seeded(seed * 977 + 13), bk = ctx.B.bucket(ctx.M.west, cx, cz);
  const n = o.n || 9, layers = o.layers || (h > 8 ? 3 : 2), su = wUV(WT.strata), tu = wUV(WT.rockTop);
  const jit = []; for (let k = 0; k < n; k++) jit.push([(rnd() - 0.5) * 0.5, 0.8 + rnd() * 0.32]);
  let y0 = 0;
  for (let l = 0; l < layers; l++) {
    const y1 = l === layers - 1 ? h : h * (l + 1) / layers * (0.8 + rnd() * 0.25), sc = 1 - l * (o.step ?? 0.2), fl = 1.1;
    const v = 0.86 + rnd() * 0.28, col = [v, v * (0.92 + rnd() * 0.1), v * 0.95];
    const pt = (k, f, y) => { const j = jit[k % n], a = (k % n + j[0]) / n * Math.PI * 2; return [cx + Math.cos(a) * rx * j[1] * sc * f, y, cz + Math.sin(a) * rz * j[1] * sc * f]; };
    for (let k = 0; k < n; k++) {
      const u0 = su[0] + (su[2] - su[0]) * ((k % 3) / 3), u1 = su[0] + (su[2] - su[0]) * ((k % 3 + 1) / 3);
      quad4(bk, pt(k + 1, fl, y0), pt(k, fl, y0), pt(k, 1, y1), pt(k + 1, 1, y1), [u1, su[1], u0, su[3]], col);
      const p = pt(k, 1, y1), q = pt(k + 1, 1, y1), uvp = (pp) => [tu[0] + (tu[2] - tu[0]) * (0.5 + (pp[0] - cx) / (rx * 2.8)), tu[1] + (tu[3] - tu[1]) * (0.5 + (pp[2] - cz) / (rz * 2.8))];
      tri3(bk, [cx, y1, cz], q, p, uvp([cx, 0, cz]), uvp(q), uvp(p), [col[0] * 1.08, col[1] * 1.08, col[2] * 1.08]);
    }
    y0 = y1;
  }
  if (o.solid !== false) ctx.solid(cx - rx * 0.76, cz - rz * 0.76, cx + rx * 0.76, cz + rz * 0.76, h);
  ctx.occupy(cx - rx * 1.1, cz - rz * 1.1, cx + rx * 1.1, cz + rz * 1.1);
  ctx.mapCircle(cx, cz, rx * 0.95, '#8a4a30', 1, rz / rx);
}

// 蒸気機関車と 貨車(線路は南北。先頭は北向き)。(x, z) = 機関車のまん中
export function train(ctx, x, z) {
  const { M } = ctx;
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(x, 0.12, z);
  const BLK = [0.08, 0.08, 0.09], RED = [0.55, 0.1, 0.07], GOLD = [0.85, 0.62, 0.2];
  const G = (g, mm, col, mat = M.car) => { ctx.B.geom(mat, g, mm, { col }); g.dispose(); };
  withMatrix(ctx, m, () => {
    const B = ctx.B, T = (px, py, pz) => new THREE.Matrix4().makeTranslation(px, py, pz);
    const rotZ = (px, py, pz) => new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(px, py, pz), rotX = (px, py, pz) => new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(px, py, pz);
    B.box(M.plain, -4.0, 0.55, -0.95, 4.3, 0.95, 0.95, { col: BLK, skip: '' });
    G(new THREE.CylinderGeometry(0.95, 0.95, 4.7, 14), rotZ(1.1, 2.05, 0), BLK);
    G(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 14), rotZ(3.5, 2.05, 0), [0.2, 0.2, 0.22]);
    for (const px of [0.2, 2.0]) G(new THREE.CylinderGeometry(1.0, 1.0, 0.14, 14), rotZ(px, 2.05, 0), GOLD);
    G(new THREE.CylinderGeometry(0.24, 0.24, 1.0, 10), T(2.8, 3.4, 0), BLK); G(new THREE.CylinderGeometry(0.62, 0.26, 0.9, 10), T(2.8, 4.3, 0), BLK);
    G(new THREE.SphereGeometry(0.42, 10, 8), T(1.3, 3.05, 0), GOLD); G(new THREE.SphereGeometry(0.36, 10, 8), T(0.1, 3.02, 0), GOLD);
    B.box(M.car, -3.9, 0.95, -1.15, -1.6, 3.5, 1.15, { col: RED }); B.box(M.plain, -4.2, 3.5, -1.3, -1.3, 3.68, 1.3, { col: BLK, skip: '' });
    for (const s of [-1, 1]) B.box(M.plain, -3.4, 2.3, s * 1.16 - 0.02, -2.1, 3.2, s * 1.16 + 0.02, { col: [0.05, 0.06, 0.08], skip: '' });
    B.box(M.plain, 3.3, 2.9, -0.3, 3.8, 3.5, 0.3, { col: BLK }); B.box(M.glow, 3.8, 2.98, -0.22, 3.84, 3.42, 0.22, { col: [3, 2.4, 1.2], skip: '' });
    for (let k = 0; k < 5; k++) beam(B, M.plain, [4.3, 0.95, -0.9 + k * 0.45], [5.3, 0.2, -0.75 + k * 0.375], 0.09, RED);
    beam(B, M.plain, [5.3, 0.2, -0.8], [5.3, 0.2, 0.8], 0.12, RED);
    for (const s of [-1, 1]) {
      for (const px of [-0.9, 0.7, 2.3]) { G(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 14), rotX(px, 0.78, s * 1.0), RED); G(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 8), rotX(px, 0.78, s * 1.05), GOLD); }
      G(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), rotX(3.7, 0.42, s * 1.0), RED); G(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), rotX(-3.2, 0.42, s * 1.0), RED);
      beam(B, M.plain, [-0.9, 0.55, s * 1.14], [2.3, 0.55, s * 1.14], 0.1, [0.6, 0.6, 0.62]);
    }
    // 炭水車・有蓋車・無蓋車
    B.box(M.car, -8.4, 0.9, -1.1, -4.7, 2.5, 1.1, { col: [0.1, 0.22, 0.14] }); B.box(M.plain, -8.2, 2.5, -0.9, -4.9, 2.85, 0.9, { col: [0.04, 0.04, 0.04] });
    wbox(ctx, -16.6, 0.9, -1.15, -9.2, 3.4, 1.15, WT.barn, [0.9, 0.8, 0.75], WT.tin, 3.7);
    B.box(M.plain, -24.4, 0.75, -1.15, -17.4, 0.95, 1.15, { col: WOODC, skip: '' });
    for (const [px, pz, s] of [[-23, -0.3, 1], [-21.6, 0.35, 0.9], [-20.2, -0.2, 1.1], [-22.4, 0.3, 0.8]]) wbox(ctx, px - 0.55 * s, 0.95, pz - 0.55 * s, px + 0.55 * s, 0.95 + 1.1 * s, pz + 0.55 * s, WT.board, [0.95, 0.85, 0.7], WT.board, 2);
    for (const c0 of [-8.4, -16.6, -24.4]) for (const s of [-1, 1]) for (const px of [c0 + 0.9, c0 + (c0 === -8.4 ? 2.8 : 6.3)]) G(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 10), rotX(px, 0.42, s * 1.0), BLK);
    for (const px of [-4.35, -8.8, -17]) B.box(M.plain, px - 0.35, 0.6, -0.1, px + 0.35, 0.75, 0.1, { col: BLK, skip: '' });
  }, x, z);
  // 当たり判定(ローカルの x → 北向き)
  for (const [a, b, h] of [[-4.2, 5.3, 4], [-8.4, -4.7, 2.8], [-16.6, -9.2, 3.5], [-24.4, -17.4, 2.2]]) ctx.solid(x - 1.2, z - b, x + 1.2, z - a, h);
  ctx.mapRect(x - 1.2, z - 5.3, x + 1.2, z + 24.4, '#1a1a1c');
}

// ---------- 小道具 ----------
const DARK = [0.05, 0.05, 0.055], IRON = [0.16, 0.16, 0.17];
function cyl(b, x, y, z, r, h, col, seg = 8, rx = 0, rz = 0, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg, 1);
  _m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)); _m.setPosition(x, y, z);
  b.geom(null, g, _m, { col }); g.dispose();
}
const bx = (b, x0, y0, z0, x1, y1, z1, col, o = {}) => b.box(null, x0, y0, z0, x1, y1, z1, { col, skip: 'b', ...o });
// 馬車の車輪(スポークつき)
function wheel(b, x, y, z, r) {
  const g = new THREE.TorusGeometry(r, 0.055, 4, 14); _m.makeTranslation(x, y, z); b.geom(null, g, _m, { col: DARKW }); g.dispose();
  for (const a of [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75]) { const s = new THREE.BoxGeometry(r * 2, 0.05, 0.05); _m.makeRotationZ(a).setPosition(x, y, z); b.geom(null, s, _m, { col: [0.45, 0.32, 0.2] }); s.dispose(); }
}
export function defineWestProps(ctx) {
  const { M, I } = ctx;
  const P = (name, parts, w, d, h = 1) => { PROPS[name] = { parts, w, d, h }; };
  // たる(木)
  P('wbarrel', [{ geo: makeGeo((b) => { cyl(b, 0, 0.48, 0, 0.3, 0.96, [1, 1, 1], 10, 0, 0, 0.3); cyl(b, 0, 0.48, 0, 0.36, 0.5, [1, 1, 1], 10); for (const y of [0.12, 0.36, 0.6, 0.84]) cyl(b, 0, y, 0, 0.365, 0.05, [0.2, 0.2, 0.22], 10); }), mat: M.plain, tint: true }], 0.75, 0.75, 0.96);
  // ダイナマイトの箱(爆発する)
  P('dynamite', [{ geo: makeGeo((b) => {
    const bk = b.bucket(null), uv = wUV(WT.tnt), tv = wUV(WT.board);
    for (const [nx, nz, sx, sz, L] of faces(-0.5, -0.38, 0.5, 0.38)) b.face(bk, sx, 0, sz, nz, 0, -nx, 0, 1, 0, L, 0.7, uv[0], uv[1], uv[2], uv[3], [1, 1, 1], null);
    b.face(bk, -0.5, 0.7, 0.38, 1, 0, 0, 0, 0, -1, 1, 0.76, tv[0], tv[1], tv[2], tv[3], [0.9, 0.5, 0.4], null);
  }), mat: M.west }, { geo: makeGeo((b) => { for (let k = 0; k < 4; k++) cyl(b, -0.3 + k * 0.2, 0.76, 0, 0.07, 0.6, [0.75, 0.1, 0.08], 6, Math.PI / 2); cyl(b, 0, 0.9, 0.3, 0.012, 0.3, [0.9, 0.85, 0.7], 4, 0.6); }), mat: M.plain }], 1.0, 0.8, 0.85);
  // ほろ馬車
  P('wagon', [{ geo: makeGeo((b) => {
    bx(b, -1.8, 0.78, -0.72, 1.8, 1.32, 0.72, WOODC, { skip: '' }); bx(b, 1.8, 0.72, -0.05, 3.5, 0.8, 0.05, DARKW);
    const g = new THREE.CylinderGeometry(0.8, 0.8, 3.4, 10, 3); _m.makeRotationZ(Math.PI / 2); _m.multiply(new THREE.Matrix4().makeScale(1.25, 1, 1)); _m.setPosition(0, 1.6, 0); b.geom(null, g, _m, { col: [0.66, 0.61, 0.5] }); g.dispose();   // ほろ: 前は [0.88,0.82,0.68](昼に 真っ白に とんだ)
    for (const x of [-1.25, 1.25]) for (const s of [-1, 1]) wheel(b, x, x < 0 ? 0.68 : 0.56, s * 0.82, x < 0 ? 0.68 : 0.56);
  }), mat: M.plain }], 4.0, 1.9, 2.6);
  // 駅馬車
  P('coach', [{ geo: makeGeo((b) => {
    bx(b, -1.25, 0.95, -0.7, 1.25, 2.15, 0.7, [0.58, 0.12, 0.08], { skip: '' }); bx(b, -1.3, 2.15, -0.75, 1.3, 2.25, 0.75, [0.85, 0.65, 0.2], { skip: '' });
    for (const s of [-1, 1]) { bx(b, -0.9, 1.5, s * 0.71 - 0.01, -0.3, 2.0, s * 0.71 + 0.01, DARK, { skip: '' }); bx(b, 0.3, 1.5, s * 0.71 - 0.01, 0.9, 2.0, s * 0.71 + 0.01, DARK, { skip: '' }); bx(b, -1.25, 1.36, s * 0.71 - 0.012, 1.25, 1.44, s * 0.71 + 0.012, [0.85, 0.65, 0.2], { skip: '' }); }
    bx(b, 1.25, 1.55, -0.6, 1.8, 1.7, 0.6, DARKW, { skip: '' }); bx(b, 1.25, 0.95, -0.5, 1.9, 1.05, 0.5, DARKW, { skip: '' });
    bx(b, -0.9, 2.25, -0.5, -0.1, 2.6, 0.3, [0.4, 0.26, 0.16]); bx(b, 0.1, 2.25, -0.3, 0.8, 2.5, 0.5, [0.3, 0.2, 0.14]);
    bx(b, 1.9, 0.75, -0.05, 3.4, 0.83, 0.05, DARKW);
    for (const x of [-0.95, 1.15]) for (const s of [-1, 1]) wheel(b, x, x < 0 ? 0.72 : 0.56, s * 0.84, x < 0 ? 0.72 : 0.56);
  }), mat: M.plain }], 3.9, 1.9, 2.6);
  // ランプの柱(こわすと火が出る)
  P('wlamp', [{ geo: makeGeo((b) => { bx(b, -0.07, 0, -0.07, 0.07, 3.0, 0.07, WOODC); bx(b, 0, 2.86, -0.04, 0.66, 2.94, 0.04, WOODC, { skip: '' }); bx(b, 0.44, 2.76, -0.14, 0.72, 2.82, 0.14, IRON, { skip: '' }); bx(b, 0.46, 2.4, -0.12, 0.7, 2.46, 0.12, IRON, { skip: '' }); }), mat: M.plain },
    { geo: makeGeo((b) => b.box(null, 0.48, 2.46, -0.1, 0.68, 2.76, 0.1, { col: [3.0, 1.8, 0.6], skip: '' })), mat: M.glow }], 0.4, 0.4, 3.0);
  // 馬つなぎの横木・水おけ・トロッコ・丸テーブル・牛の頭の骨
  P('hitch', [{ geo: makeGeo((b) => { for (const x of [-1.25, 1.25]) bx(b, x - 0.07, 0, -0.07, x + 0.07, 1.05, 0.07, WOODC); bx(b, -1.5, 0.88, -0.06, 1.5, 1.0, 0.06, DARKW, { skip: '' }); }), mat: M.plain }], 3.0, 0.3, 1.05);
  P('trough', [{ geo: makeGeo((b) => { bx(b, -1.0, 0, -0.36, 1.0, 0.5, 0.36, WOODC); bx(b, -1.05, 0.5, -0.4, 1.05, 0.58, 0.4, DARKW); bx(b, -0.92, 0.585, -0.3, 0.92, 0.59, 0.3, [0.25, 0.42, 0.48]); }), mat: M.plain }], 2.1, 0.8, 0.6);
  P('minecart', [{ geo: makeGeo((b) => {
    bx(b, -0.7, 0.42, -0.48, 0.7, 1.1, 0.48, [0.36, 0.22, 0.16], { skip: '' }); bx(b, -0.6, 1.1, -0.4, 0.6, 1.22, 0.4, [0.3, 0.26, 0.24]);
    for (const [x, z] of [[-0.3, -0.1], [0.2, 0.15], [0.0, -0.2], [0.35, -0.15]]) { const g = new THREE.DodecahedronGeometry(0.17, 0); _m.makeTranslation(x, 1.26, z); b.geom(null, g, _m, { col: [1.3, 0.95, 0.25] }); g.dispose(); }
    for (const x of [-0.42, 0.42]) for (const s of [-1, 1]) cyl(b, x, 0.22, s * 0.44, 0.22, 0.1, IRON, 8, Math.PI / 2);
  }), mat: M.plain }], 1.5, 1.0, 1.3);
  P('rtable', [{ geo: makeGeo((b) => {
    cyl(b, 0, 0.74, 0, 0.62, 0.07, [0.42, 0.26, 0.15], 12); cyl(b, 0, 0.37, 0, 0.08, 0.72, DARKW, 6); cyl(b, 0, 0.782, 0, 0.52, 0.012, [0.14, 0.4, 0.26], 12);
    for (const a of [0.4, 2.5, 4.6]) { cyl(b, Math.cos(a) * 0.95, 0.25, Math.sin(a) * 0.95, 0.19, 0.5, [0.5, 0.33, 0.2], 8); }
    cyl(b, 0.2, 0.86, 0.1, 0.045, 0.16, [0.2, 0.34, 0.16], 6);
  }), mat: M.plain }], 1.5, 1.5, 0.8);
  P('skull', [{ geo: makeGeo((b) => {
    const W = [0.92, 0.9, 0.82];
    bx(b, -0.25, 0, -0.2, 0.3, 0.32, 0.2, W, { skip: '' }); bx(b, 0.3, 0.03, -0.12, 0.72, 0.24, 0.12, W, { skip: '' });
    for (const s of [-1, 1]) { bx(b, 0.0, 0.12, s * 0.2 - 0.01, 0.14, 0.24, s * 0.2 + 0.01, DARK, { skip: '' }); beam(b, null, [-0.12, 0.26, s * 0.18], [-0.2, 0.42, s * 0.62], 0.08, W); beam(b, null, [-0.2, 0.42, s * 0.62], [-0.05, 0.62, s * 0.78], 0.06, W); }
  }), mat: M.plain }], 1.0, 1.4, 0.6);
  // サボテン(柱サボテン)
  I.define('cactus', makeGeo((b) => {
    const G1 = [0.24, 0.42, 0.22], G2 = [0.2, 0.37, 0.2];
    cyl(b, 0, 1.7, 0, 0.27, 3.4, G1, 7, 0, 0, 0.22); const t = new THREE.SphereGeometry(0.22, 7, 4); _m.makeTranslation(0, 3.4, 0); b.geom(null, t, _m, { col: G1 }); t.dispose();
    cyl(b, 0.5, 1.5, 0, 0.15, 0.7, G2, 6, 0, Math.PI / 2); cyl(b, 0.82, 2.05, 0, 0.16, 1.2, G2, 6, 0, 0, 0.13);
    cyl(b, -0.45, 2.0, 0, 0.14, 0.6, G2, 6, 0, Math.PI / 2); cyl(b, -0.72, 2.4, 0, 0.14, 0.9, G2, 6, 0, 0, 0.12);
  }), M.foliage);
}
