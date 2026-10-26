// マップ係(第4弾・街並み): 地区の建物を作る道具。
//  - fbuild: 箱の建物(1 階の店先 + 上の階の窓)を アトラス(M.facade)の マス で貼る。屋根は 平ら / 瓦の切妻 / 中華の軒 / なし(こわれた)
//  - 看板: sode(壁から突き出た縦の看板)/ wallSign(壁に貼る)/ billboard(屋上の広告)/ neon(光る管)
//  - patch: 4 すみの点で決まる面に マスを並べる(屋根・塔)。withMatrix: 傾いた建物など(作ってから まとめて動かす)
//  - 新しい小道具(タクシー・スクーター・自転車・軽トラ・人力車・自販機・灯籠・電柱・狛犬)と 桜の木
import * as THREE from '../vendor/three/build/three.module.min.js';
import { Builder, makeGeo } from './world-build.js';
import { PROPS } from './world-props.js';
import { tileUV, signUV } from './world-dtex.js';

export const PAD_H = 0.15;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const BOX = new THREE.BoxGeometry(1, 1, 1);

// 4 つの点の面(a 左下, b 右下, c 右上, d 左上)。uv = [u0,v0,u1,v1]
export function quad4(bk, a, b, c, d, uv, col) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  const base = bk.v;
  bk.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
  bk.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
  bk.u.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
  const c0 = col || [1, 1, 1];
  bk.c.push(c0[0], c0[1], c0[2], c0[0], c0[1], c0[2], c0[0], c0[1], c0[2], c0[0], c0[1], c0[2]);
  bk.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  bk.v += 4;
}
const L3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// 面(P00 左下・P10 右下・P01 左上・P11 右上)を nu × nv に分けて、マス tile を 1 枚ずつ貼る
export function patch(bk, P00, P10, P01, P11, nu, nv, tile, col) {
  const uv = tileUV(tile);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a0 = L3(P00, P10, i / nu), a1 = L3(P00, P10, (i + 1) / nu), b0 = L3(P01, P11, i / nu), b1 = L3(P01, P11, (i + 1) / nu);
    quad4(bk, L3(a0, b0, j / nv), L3(a1, b1, j / nv), L3(a1, b1, (j + 1) / nv), L3(a0, b0, (j + 1) / nv), uv, col);
  }
}
// 点 a から 点 b までの 細い棒(電線・ひも・骨組み)
export function beam(B, mat, a, b, t, col, bx = null, bz = null) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length(); if (len < 1e-4) return;
  _q.setFromUnitVectors(_z, _v.normalize());
  _m.compose(_s.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, new THREE.Vector3(t, t, len));
  B.geom(mat, BOX, _m, { col, bx: bx ?? (a[0] + b[0]) / 2, bz: bz ?? (a[2] + b[2]) / 2 });
}
// たるんだ線(電線・ちょうちんのひも)。points を返す
export function sagLine(a, b, sag, n = 6) {
  const out = [];
  for (let k = 0; k <= n; k++) { const t = k / n, p = L3(a, b, t); p[1] -= sag * 4 * t * (1 - t); out.push(p); }
  return out;
}
// fn の中で作った物を、行列 m で動かしてから ctx.B に入れる(傾いた建物・回した門)
export function withMatrix(ctx, m, fn, bx = null, bz = null) {
  const B0 = ctx.B, T = new Builder(0);
  ctx.B = T;
  try { fn(); } finally { ctx.B = B0; }
  const px = bx ?? m.elements[12], pz = bz ?? m.elements[14];
  for (const bk of T.map.values()) { if (!bk.v) continue; const g = Builder.toGeometry(bk); B0.geom(bk.mat, g, m, { bx: px, bz: pz }); g.dispose(); }
}

// ---------- 壁にマスを貼る ----------
// 外向き (nx,nz) の面。始まりの角 (sx,sz) から 長さ L。rows = [[y0, y1, pick(col,row)]]。tops[i] = 列ごとの上の高さ(こわれた建物)
function faceTiles(ctx, bk, sx, sz, nx, nz, L, bay, rows, col, tops = null) {
  const rx = nz, rz = -nx, nb = Math.max(1, Math.round(L / bay)), bw = L / nb;
  for (let i = 0; i < nb; i++) {
    const top = tops ? tops[i % tops.length] : 1e9;
    for (let r = 0; r < rows.length; r++) {
      const [y0, y1, pick] = rows[r];
      if (y0 >= top - 0.05) break;
      const t = pick(i, r, nb);
      if (t < 0) continue;
      const yy = Math.min(y1, top), uv = tileUV(t);
      const v1 = uv[1] + (uv[3] - uv[1]) * (yy - y0) / (y1 - y0);
      ctx.B.face(bk, sx + rx * bw * i, y0, sz + rz * bw * i, rx, 0, rz, 0, 1, 0, bw, yy - y0, uv[0], uv[1], uv[2], v1, col, null);
    }
  }
  return nb;
}
// 4 つの面: [外向き, 始まりの角, 長さ]
export function faces(x0, z0, x1, z1) {
  return [[0, 1, x0, z1, x1 - x0], [0, -1, x1, z0, x1 - x0], [1, 0, x1, z1, z1 - z0], [-1, 0, x0, z0, z1 - z0]];
}
const pickOf = (rnd, list) => list[Math.floor(rnd() * list.length)];

// 箱の建物。o: { y, H, G(1階の高さ), fl(1階分), bay, ground:[マス], up:[マス], lit:[マス], litP, band(帯のマス), col, gcol,
//   roof: 'flat'|'kawara'|'china'|'none', roofTile, parapet, tops(こわれた上), solid, mapCol, front:[nx,nz](店先の面。ほかの面は窓) }
export function fbuild(ctx, x0, z0, x1, z1, o) {
  const { M, rnd } = ctx;
  const y = o.y ?? PAD_H, H = o.H, G = Math.min(o.G ?? 4.2, H - y), fl = o.fl ?? 3.4, bay = o.bay ?? 4;
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  const col = o.col || [1, 1, 1];
  const nf = Math.max(0, Math.round((H - y - G) / fl)), fh = nf ? (H - y - G) / nf : 0;
  const litP = o.litP ?? 0.25;
  const colPick = [];   // 列ごとの「縦にそろった」マス(広告の列など)
  for (const [nx, nz, sx, sz, L] of faces(x0, z0, x1, z1)) {
    const isFront = !o.front || (o.front[0] === nx && o.front[1] === nz) || o.allFront;
    const rows = [];
    const gTiles = isFront ? o.ground : (o.side || o.ground);
    rows.push([y, y + G, (i) => gTiles.length ? pickOf(rnd, gTiles) : -1]);
    const nb = Math.max(1, Math.round(L / bay));
    for (let k = 0; k < nb; k++) colPick[k] = o.colTile && rnd() < o.colP ? o.colTile : -1;
    for (let f = 0; f < nf; f++) {
      const ya = y + G + f * fh, band = o.band != null && (o.bandEvery ? (f % o.bandEvery === o.bandEvery - 1) : f === nf - 1);
      rows.push([ya, ya + fh, (i) => {
        if (band) return o.band;
        if (colPick[i] >= 0) return colPick[i];
        return o.lit && rnd() < litP ? pickOf(rnd, o.lit) : pickOf(rnd, o.up);
      }]);
    }
    faceTiles(ctx, bk, sx, sz, nx, nz, L, bay, rows, col, o.tops ? o.tops.map((t) => y + t) : null);
  }
  // 1 階と 2 階の間の ひさし(帯)
  if (o.ledge !== false && nf > 0) {
    const lc = o.ledgeCol || [col[0] * 0.5, col[1] * 0.5, col[2] * 0.5];
    ctx.B.box(M.plain, x0 - 0.25, y + G - 0.05, z0 - 0.25, x1 + 0.25, y + G + 0.25, z1 + 0.25, { col: lc, skip: '' });
  }
  let top = H;
  const roof = o.roof || 'flat';
  if (o.tops) top = y + Math.max(...o.tops);
  else if (roof === 'flat' || roof === 'garden') {
    const rt = roof === 'garden' ? 63 : o.roofTile ?? 60;
    const nu = Math.max(1, Math.round((x1 - x0) / 5)), nv = Math.max(1, Math.round((z1 - z0) / 5));
    patch(ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2), [x0, H, z1], [x1, H, z1], [x0, H, z0], [x1, H, z0], nu, nv, rt, o.roofCol || [1, 1, 1]);
    if (o.parapet !== false) {
      const pc = o.parCol || [col[0] * 0.55, col[1] * 0.54, col[2] * 0.52], ph = o.parH ?? 0.8;
      ctx.B.box(M.plain, x0, H, z0, x1, H + ph, z0 + 0.3, { col: pc }); ctx.B.box(M.plain, x0, H, z1 - 0.3, x1, H + ph, z1, { col: pc });
      ctx.B.box(M.plain, x0, H, z0, x0 + 0.3, H + ph, z1, { col: pc }); ctx.B.box(M.plain, x1 - 0.3, H, z0, x1, H + ph, z1, { col: pc });
    }
  } else if (roof === 'kawara') top = gable(ctx, x0, z0, x1, z1, H, o);
  else if (roof === 'china') top = chinaRoof(ctx, x0, z0, x1, z1, H, o);
  if (o.solid !== false) ctx.solid(x0, z0, x1, z1, top);
  ctx.occupy(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5);
  if (o.mapCol) ctx.mapRect(x0, z0, x1, z1, o.mapCol);
  return { x0, z0, x1, z1, H, top };
}

// 瓦の切妻屋根(棟は長い方向)。軒が出ていて、下の段は ゆるく反る
export function gable(ctx, x0, z0, x1, z1, H, o = {}) {
  const { M } = ctx;
  const ov = o.over ?? 0.7, along = o.ridgeX ?? (x1 - x0 >= z1 - z0);
  const tile = o.roofTile ?? 56, rc = o.roofCol || [1, 1, 1];
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  const span = (along ? z1 - z0 : x1 - x0) / 2, len = (along ? x1 - x0 : z1 - z0);
  const pitch = o.pitch ?? 0.5, rise = span * Math.tan(pitch);
  const n1 = Math.max(1, Math.round(len / 3)), nv = Math.max(1, Math.round(span / 3));
  const ridge = H + rise, ey = H - ov * Math.tan(pitch) * 0.6;
  if (along) {
    const zc = (z0 + z1) / 2, xa = x0 - ov, xb = x1 + ov;
    // 南の面(外 → 棟)と 北の面
    patch(bk, [xa, ey, z1 + ov], [xb, ey, z1 + ov], [xa, ridge, zc], [xb, ridge, zc], n1, nv, tile, rc);
    patch(bk, [xb, ey, z0 - ov], [xa, ey, z0 - ov], [xb, ridge, zc], [xa, ridge, zc], n1, nv, tile, rc);
    tri(ctx, [x0, H, z0], [x0, H, z1], [x0, ridge - 0.05, zc], o.endCol || [0.9, 0.88, 0.82]);
    tri(ctx, [x1, H, z1], [x1, H, z0], [x1, ridge - 0.05, zc], o.endCol || [0.9, 0.88, 0.82]);
    ctx.B.box(M.plain, xa, ridge - 0.15, zc - 0.32, xb, ridge + 0.38, zc + 0.32, { col: o.ridgeCol || [0.2, 0.21, 0.24] });
  } else {
    const xc = (x0 + x1) / 2, za = z0 - ov, zb = z1 + ov;
    patch(bk, [x1 + ov, ey, zb], [x1 + ov, ey, za], [xc, ridge, zb], [xc, ridge, za], n1, nv, tile, rc);
    patch(bk, [x0 - ov, ey, za], [x0 - ov, ey, zb], [xc, ridge, za], [xc, ridge, zb], n1, nv, tile, rc);
    tri(ctx, [x0, H, z1], [x1, H, z1], [xc, ridge - 0.05, z1], o.endCol || [0.9, 0.88, 0.82]);
    tri(ctx, [x1, H, z0], [x0, H, z0], [xc, ridge - 0.05, z0], o.endCol || [0.9, 0.88, 0.82]);
    ctx.B.box(M.plain, xc - 0.32, ridge - 0.15, za, xc + 0.32, ridge + 0.38, zb, { col: o.ridgeCol || [0.2, 0.21, 0.24] });
  }
  return ridge + 0.4;
}
// 三角(妻の壁)
export function tri(ctx, a, b, c, col, mat = null) {
  const bk = ctx.B.bucket(mat || ctx.M.plain, (a[0] + b[0]) / 2, (a[2] + b[2]) / 2);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
  const base = bk.v;
  bk.p.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { bk.n.push(nx / l, ny / l, nz / l); bk.c.push(col[0], col[1], col[2]); }
  bk.u.push(0, 0, 1, 0, 0.5, 1); bk.i.push(base, base + 1, base + 2); bk.v += 3;
}
// 寄棟(4 方向に流れる屋根)。上の棟は 長い方向に
export function hip(ctx, x0, z0, x1, z1, y, rise, o = {}) {
  const { M } = ctx;
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  const tile = o.roofTile ?? 56, rc = o.roofCol || [1, 1, 1], ov = o.over ?? 0.8;
  const xa = x0 - ov, xb = x1 + ov, za = z0 - ov, zb = z1 + ov, ey = y - (o.drop ?? 0.4);
  const w = xb - xa, d = zb - za, inset = Math.min(w, d) / 2;
  const along = w >= d;
  const r0 = along ? [xa + inset, y + rise, (za + zb) / 2] : [(xa + xb) / 2, y + rise, za + inset];
  const r1 = along ? [xb - inset, y + rise, (za + zb) / 2] : [(xa + xb) / 2, y + rise, zb - inset];
  const nu = (L) => Math.max(1, Math.round(L / 3)), nv = Math.max(1, Math.round(inset / 3));
  if (along) {
    patch(bk, [xa, ey, zb], [xb, ey, zb], r0, r1, nu(w), nv, tile, rc);
    patch(bk, [xb, ey, za], [xa, ey, za], r1, r0, nu(w), nv, tile, rc);
    patch(bk, [xb, ey, zb], [xb, ey, za], r1, r1, nu(d), nv, tile, rc);
    patch(bk, [xa, ey, za], [xa, ey, zb], r0, r0, nu(d), nv, tile, rc);
  } else {
    patch(bk, [xb, ey, zb], [xb, ey, za], r1, r0, nu(d), nv, tile, rc);
    patch(bk, [xa, ey, za], [xa, ey, zb], r0, r1, nu(d), nv, tile, rc);
    patch(bk, [xa, ey, zb], [xb, ey, zb], r1, r1, nu(w), nv, tile, rc);
    patch(bk, [xb, ey, za], [xa, ey, za], r0, r0, nu(w), nv, tile, rc);
  }
  if (o.ridge !== false) beam(ctx.B, M.plain, [r0[0] - (along ? 0.3 : 0), r0[1] + 0.12, r0[2] - (along ? 0 : 0.3)], [r1[0] + (along ? 0.3 : 0), r1[1] + 0.12, r1[2] + (along ? 0 : 0.3)], 0.45, o.ridgeCol || [0.2, 0.21, 0.24]);
  // 棟の両はしの飾り(金の しゃちほこ風)
  if (o.ends) for (const r of [r0, r1]) ctx.B.box(M.plain, r[0] - 0.25, r[1], r[2] - 0.25, r[0] + 0.25, r[1] + 1.1, r[2] + 0.25, { col: o.ends });
  return y + rise + 0.5;
}
// 中華の屋根: 平らな屋根のまわりに 色瓦の軒(緑 か 金)。ときどき 上に寄棟の小屋
function chinaRoof(ctx, x0, z0, x1, z1, H, o) {
  const { M } = ctx;
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  const tile = o.roofTile ?? 57, ov = 1.3, dr = 0.9, rc = [1, 1, 1];
  patch(bk, [x0, H + 0.6, z1], [x1, H + 0.6, z1], [x0, H + 0.6, z0], [x1, H + 0.6, z0], Math.max(1, Math.round((x1 - x0) / 5)), Math.max(1, Math.round((z1 - z0) / 5)), 60, [0.85, 0.82, 0.8]);
  const e = [[x0 - ov, z1 + ov, x1 + ov, z1 + ov, x0, z1, x1, z1], [x1 + ov, z0 - ov, x0 - ov, z0 - ov, x1, z0, x0, z0], [x1 + ov, z1 + ov, x1 + ov, z0 - ov, x1, z1, x1, z0], [x0 - ov, z0 - ov, x0 - ov, z1 + ov, x0, z0, x0, z1]];
  for (const [ax, az, bx, bz, cx, cz, dx, dz] of e) patch(bk, [ax, H + 0.6 - dr, az], [bx, H + 0.6 - dr, bz], [cx, H + 0.7, cz], [dx, H + 0.7, dz], Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 3)), 1, tile, rc);
  // 赤い軒の板
  ctx.B.box(M.plain, x0 - ov, H - 0.6, z0 - ov, x1 + ov, H - 0.3 + 0.05, z1 + ov, { col: [0.7, 0.1, 0.08], skip: 't' });
  // 角の そり(金)
  for (const [cx, cz, sx, sz] of [[x0 - ov, z0 - ov, -1, -1], [x1 + ov, z0 - ov, 1, -1], [x0 - ov, z1 + ov, -1, 1], [x1 + ov, z1 + ov, 1, 1]]) beam(ctx.B, M.plain, [cx - sx * 0.6, H - 0.2, cz - sz * 0.6], [cx + sx * 0.25, H + 0.5, cz + sz * 0.25], 0.22, [0.85, 0.65, 0.2]);
  let top = H + 0.8;
  if (o.hipTop) top = hip(ctx, x0 + 2, z0 + 2, x1 - 2, z1 - 2, H + 0.6, Math.min(x1 - x0, z1 - z0) * 0.28, { roofTile: tile, ridgeCol: [0.8, 0.6, 0.15], ends: [0.85, 0.65, 0.2] });
  return top;
}

// ---------- 看板 ----------
// 壁から突き出た 縦の看板(袖看板)。壁の点 (wx,wz)、壁の外向き (nx,nz)、下の高さ y0、大きさ s(1 = 幅 1m・高さ 4m)
export function sode(ctx, wx, wz, nx, nz, y0, idx, s = 1, col = null) {
  const { M } = ctx;
  const w = 1.0 * s, h = 4.0 * s, g = 0.25;
  const bk = ctx.B.bucket(M.sign, wx, wz), uv = signUV(idx), c = col || [1, 1, 1];
  const tx = -nz, tz = nx;   // 看板の面の向き(壁にそって)
  const e = 0.07;
  // 表(tx,tz 向き)と 裏
  for (const sg of [1, -1]) {
    const ox = wx + tx * e * sg, oz = wz + tz * e * sg;
    const p0 = sg > 0 ? [ox + nx * g, y0, oz + nz * g] : [ox + nx * (g + w), y0, oz + nz * (g + w)];
    const p1 = sg > 0 ? [ox + nx * (g + w), y0, oz + nz * (g + w)] : [ox + nx * g, y0, oz + nz * g];
    quad4(bk, p0, p1, [p1[0], y0 + h, p1[2]], [p0[0], y0 + h, p0[2]], uv, c);
  }
  // ふち(暗い金属)
  const ax = wx + nx * g, az = wz + nz * g, bx = wx + nx * (g + w), bz = wz + nz * (g + w);
  ctx.B.box(M.plain, Math.min(ax, bx) - Math.abs(tx) * 0.06 - 0.02, y0 - 0.1, Math.min(az, bz) - Math.abs(tz) * 0.06 - 0.02, Math.max(ax, bx) + Math.abs(tx) * 0.06 + 0.02, y0 + h + 0.1, Math.max(az, bz) + Math.abs(tz) * 0.06 + 0.02, { col: [0.12, 0.12, 0.13], skip: '' });
}
// 壁に貼る看板(中心 (cx,cz)、外向き (nx,nz))
export function wallSign(ctx, cx, y0, cz, nx, nz, w, h, idx, col = null, off = 0.06) {
  ctx.B.wall(ctx.M.sign, cx + nx * off, y0, cz + nz * off, nx, nz, w, h, { uv: signUV(idx), col: col || [1, 1, 1] });
}
// 屋上や柱の上の 大きな広告(表は光る絵、裏は板。脚つき)
export function billboard(ctx, cx, y, cz, nx, nz, w, h, idx, o = {}) {
  const { M } = ctx;
  const legs = o.legs ?? 2.2;
  wallSign(ctx, cx, y + legs, cz, nx, nz, w, h, idx, o.col || [1.15, 1.15, 1.15], 0.02);
  const tx = -nz, tz = nx, d = 0.25;
  const xs = [cx + tx * w / 2, cx - tx * w / 2, cx + tx * w / 2 - nx * d, cx - tx * w / 2 - nx * d];
  const zs = [cz + tz * w / 2, cz - tz * w / 2, cz + tz * w / 2 - nz * d, cz - tz * w / 2 - nz * d];
  ctx.B.box(M.plain, Math.min(...xs), y + legs, Math.min(...zs), Math.max(...xs), y + legs + h, Math.max(...zs), { col: [0.16, 0.16, 0.18], skip: nx > 0 ? 'e' : nx < 0 ? 'w' : nz > 0 ? 's' : 'n' });
  for (const k of [-0.38, 0.38]) {
    const lx = cx + tx * w * k - nx * 0.5, lz = cz + tz * w * k - nz * 0.5;
    ctx.B.box(M.plain, lx - 0.12, y, lz - 0.12, lx + 0.12, y + legs + 0.3, lz + 0.12, { col: [0.2, 0.2, 0.22] });
  }
}
// 光る管(ネオン)。a → b
export function neon(ctx, a, b, col, t = 0.09) { beam(ctx.B, ctx.M.glow, a, b, t, col); }

// ---------- ちょうちん・灯籠 ----------
let _lanternGeo = null, _capGeo = null;
export function lantern(ctx, x, y, z, s = 1, col = [1.9, 0.28, 0.12]) {
  if (!_lanternGeo) { _lanternGeo = new THREE.SphereGeometry(0.3, 6, 4); _lanternGeo.scale(1, 1.35, 1); _capGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.95, 5, 1, true); }
  _m.makeScale(s, s, s).setPosition(x, y, z); ctx.B.geom(ctx.M.glow, _lanternGeo, _m, { col });
  if (s >= 1) { _m.makeScale(s, s, s).setPosition(x, y, z); ctx.B.geom(ctx.M.plain, _capGeo, _m, { col: [0.08, 0.06, 0.05] }); }
}
// ちょうちんの列(ひもで つなぐ)
export function lanternString(ctx, a, b, sag, step = 1.8, col = null) {
  step = Math.max(step, 2.1);
  const pts = sagLine(a, b, sag, 5);
  for (let k = 0; k < pts.length - 1; k++) beam(ctx.B, ctx.M.plain, pts[k], pts[k + 1], 0.04, [0.12, 0.1, 0.08]);
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(1, Math.floor(L / step));
  for (let k = 1; k < n; k++) {
    const t = k / n, p = L3(a, b, t); p[1] -= sag * 4 * t * (1 - t);
    lantern(ctx, p[0], p[1] - 0.55, p[2], 0.9, col || (k % 5 === 0 ? [2.2, 1.7, 0.6] : [1.9, 0.28, 0.12]));
  }
}

// ---------- 新しい小道具 ----------
const DARK = [0.05, 0.05, 0.055], GLASS = [0.05, 0.065, 0.085], METAL = [0.25, 0.26, 0.28];
function cyl(b, x, y, z, r, h, col, seg = 8, rx = 0, rz = 0, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg, 1);
  _m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)); _m.setPosition(x, y, z);
  b.geom(null, g, _m, { col }); g.dispose();
}
const bx = (b, x0, y0, z0, x1, y1, z1, col, o = {}) => b.box(null, x0, y0, z0, x1, y1, z1, { col, skip: 'b', ...o });
function wheels(b, xs, z, r, w = 0.24) { for (const x of xs) for (const s of [-1, 1]) cyl(b, x, r, s * z, r, w, DARK, 10, Math.PI / 2); }

export function defineDistrictProps(ctx) {
  const { M, I } = ctx;
  const P = (name, parts, w, d, h = 1) => { PROPS[name] = { parts, w, d, h }; };
  // タクシー(屋根の行灯つき)
  P('taxi', [{ geo: makeGeo((b) => {
    bx(b, -2.2, 0.32, -0.86, 2.2, 0.9, 0.86, [1, 1, 1]);
    bx(b, -1.1, 0.9, -0.78, 0.9, 1.38, 0.78, GLASS); bx(b, -0.9, 1.38, -0.74, 0.7, 1.44, 0.74, [1, 1, 1]);
    bx(b, -2.25, 0.3, -0.84, -2.15, 0.6, 0.84, METAL); bx(b, 2.15, 0.3, -0.84, 2.25, 0.6, 0.84, METAL);
    bx(b, -1.0, 0.6, -0.87, 1.0, 0.68, 0.87, [0.1, 0.1, 0.1]);
    wheels(b, [-1.35, 1.35], 0.78, 0.34);
  }), mat: M.car, tint: true }, { geo: makeGeo((b) => {
    bx(b, -0.25, 1.44, -0.3, 0.25, 1.72, 0.3, [2.4, 2.1, 1.2]);
    for (const s of [-1, 1]) { bx(b, 2.2, 0.66, s * 0.76 - 0.13, 2.25, 0.8, s * 0.76 + 0.13, [2.2, 2.0, 1.6]); bx(b, -2.25, 0.66, s * 0.76 - 0.13, -2.2, 0.8, s * 0.76 + 0.13, [1.4, 0.08, 0.05]); }
  }), mat: M.glow }], 4.4, 1.75, 1.7);
  // 自動販売機(前が光る)
  P('vending', [{ geo: makeGeo((b) => {
    bx(b, -0.5, 0, -0.38, 0.5, 1.85, 0.38, [1, 1, 1]);
    bx(b, -0.42, 0.18, 0.38, 0.42, 0.42, 0.4, [0.1, 0.1, 0.1]);
  }), mat: M.plain, tint: true }, { geo: makeGeo((b) => {
    b.box(null, -0.42, 0.95, 0.38, 0.42, 1.72, 0.41, { col: [1.05, 1.12, 1.25], skip: 'b' });
    for (let k = 0; k < 6; k++) b.box(null, -0.38 + k * 0.13, 0.7, 0.38, -0.3 + k * 0.13, 0.76, 0.41, { col: [0.3, 2.2, 0.6], skip: 'b' });
  }), mat: M.glow }], 1, 0.8, 1.85);
  // スクーター
  P('scooter', [{ geo: makeGeo((b) => {
    cyl(b, -0.55, 0.22, 0, 0.22, 0.12, DARK, 10, Math.PI / 2); cyl(b, 0.6, 0.22, 0, 0.22, 0.12, DARK, 10, Math.PI / 2);
    bx(b, -0.75, 0.3, -0.18, 0.35, 0.62, 0.18, [1, 1, 1]); bx(b, -0.7, 0.62, -0.17, -0.05, 0.75, 0.17, [0.12, 0.12, 0.12]);
    bx(b, 0.35, 0.3, -0.16, 0.55, 1.0, 0.16, [1, 1, 1]); bx(b, 0.45, 1.0, -0.36, 0.55, 1.05, 0.36, DARK);
  }), mat: M.plain, tint: true }], 1.5, 0.6, 1.05);
  // 自転車
  P('bicycle', [{ geo: makeGeo((b) => {
    for (const x of [-0.55, 0.55]) { const g = new THREE.TorusGeometry(0.33, 0.035, 4, 12); _m.makeTranslation(x, 0.36, 0); b.geom(null, g, _m, { col: DARK }); g.dispose(); }
    bx(b, -0.55, 0.36, -0.03, 0.2, 0.42, 0.03, [1, 1, 1]); bx(b, -0.2, 0.36, -0.03, -0.14, 0.85, 0.03, [1, 1, 1]); bx(b, -0.25, 0.85, -0.12, -0.05, 0.9, 0.12, DARK);
    bx(b, 0.45, 0.36, -0.03, 0.51, 1.0, 0.03, [1, 1, 1]); bx(b, 0.45, 0.98, -0.28, 0.51, 1.02, 0.28, DARK); bx(b, 0.5, 0.6, -0.2, 0.85, 0.85, 0.2, [0.3, 0.3, 0.3]);
  }), mat: M.plain, tint: true }], 1.6, 0.5, 1.0);
  // 軽トラ
  P('kei', [{ geo: makeGeo((b) => {
    bx(b, 0.5, 0.3, -0.72, 1.7, 1.75, 0.72, [1, 1, 1]); bx(b, 1.2, 1.0, -0.7, 1.72, 1.6, 0.7, GLASS);
    bx(b, -1.7, 0.55, -0.74, 0.5, 0.85, 0.74, [1, 1, 1]); bx(b, -1.7, 0.85, -0.74, 0.5, 1.15, -0.68, [1, 1, 1]); bx(b, -1.7, 0.85, 0.68, 0.5, 1.15, 0.74, [1, 1, 1]); bx(b, -1.72, 0.85, -0.74, -1.66, 1.15, 0.74, [1, 1, 1]);
    bx(b, -1.7, 0.3, -0.5, 1.7, 0.55, 0.5, [0.15, 0.15, 0.15]);
    wheels(b, [-1.1, 1.1], 0.62, 0.3, 0.2);
  }), mat: M.car, tint: true }], 3.4, 1.5, 1.75);
  // 人力車
  P('rickshaw', [{ geo: makeGeo((b) => {
    for (const s of [-1, 1]) { const g = new THREE.TorusGeometry(0.62, 0.05, 4, 14); _m.makeTranslation(0, 0.65, s * 0.62); b.geom(null, g, _m, { col: DARK }); g.dispose(); }
    bx(b, -0.45, 0.75, -0.55, 0.35, 1.05, 0.55, [1, 1, 1]); bx(b, -0.5, 1.05, -0.55, -0.35, 1.7, 0.55, [1, 1, 1]);
    bx(b, -0.55, 1.65, -0.6, 0.15, 1.75, 0.6, [0.08, 0.08, 0.08]);
    for (const s of [-1, 1]) bx(b, 0.3, 0.72, s * 0.45 - 0.03, 2.1, 0.78, s * 0.45 + 0.03, [0.15, 0.1, 0.06]);
  }), mat: M.plain, tint: true }], 2.6, 1.4, 1.75);
  // 石灯籠(火袋が光る)
  P('toro', [{ geo: makeGeo((b) => {
    bx(b, -0.4, 0, -0.4, 0.4, 0.25, 0.4, [1, 1, 1]); cyl(b, 0, 0.75, 0, 0.13, 1.0, [1, 1, 1], 8); bx(b, -0.32, 1.25, -0.32, 0.32, 1.38, 0.32, [1, 1, 1]);
    for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) bx(b, x - 0.05, 1.38, z - 0.05, x + 0.05, 1.8, z + 0.05, [1, 1, 1]);
    const g = new THREE.ConeGeometry(0.62, 0.42, 4); _m.makeRotationY(Math.PI / 4); _m.setPosition(0, 2.0, 0); b.geom(null, g, _m, { col: [0.9, 0.9, 0.9] }); g.dispose();
    cyl(b, 0, 2.3, 0, 0.08, 0.2, [1, 1, 1], 6);
  }), mat: M.plain, tint: true }, { geo: makeGeo((b) => bx(b, -0.2, 1.42, -0.2, 0.2, 1.76, 0.2, [2.6, 1.7, 0.7])), mat: M.glow }], 0.8, 0.8, 2.4);
  // 電柱(上に変圧器)
  P('upole', [{ geo: makeGeo((b) => {
    cyl(b, 0, 5.0, 0, 0.17, 10, [1, 1, 1], 8, 0, 0, 0.12);
    bx(b, -1.0, 8.6, -0.06, 1.0, 8.75, 0.06, METAL); bx(b, -0.8, 9.3, -0.06, 0.8, 9.42, 0.06, METAL);
    cyl(b, 0.35, 7.3, 0.3, 0.26, 0.9, [0.55, 0.57, 0.6], 8);
    bx(b, -0.12, 2.6, 0.17, 0.12, 3.6, 0.2, [0.95, 0.9, 0.2]);
  }), mat: M.plain, tint: true }], 0.4, 0.4, 10);
  // 狛犬(石)
  P('komainu', [{ geo: makeGeo((b) => {
    bx(b, -0.45, 0, -0.35, 0.45, 0.5, 0.35, [0.8, 0.8, 0.78]);
    bx(b, -0.3, 0.5, -0.25, 0.25, 1.05, 0.25, [1, 1, 1]); bx(b, -0.22, 1.0, -0.22, 0.32, 1.42, 0.22, [1, 1, 1]); bx(b, 0.32, 1.1, -0.12, 0.45, 1.3, 0.12, [1, 1, 1]);
    bx(b, -0.35, 1.0, -0.12, -0.25, 1.35, 0.12, [0.85, 0.85, 0.85]);
  }), mat: M.plain, tint: true }], 0.9, 0.7, 1.45);
  // 桜(花の かたまりは ピンク)
  const fol = M.foliage;
  I.define('sakura', makeGeo((b) => {
    cyl(b, 0, 1.6, 0, 0.26, 3.2, [0.28, 0.2, 0.17], 6, 0, 0, 0.16);
    for (const [a, l] of [[0.4, 1.8], [2.4, 1.6], [4.3, 1.7]]) { const g = new THREE.CylinderGeometry(0.06, 0.13, l, 5); _m.makeRotationFromEuler(new THREE.Euler(0, a, 0.8)); _m.setPosition(Math.cos(a) * l * 0.35, 3.4, -Math.sin(a) * l * 0.35); b.geom(null, g, _m, { col: [0.28, 0.2, 0.17] }); g.dispose(); }
    const blobs = [[0, 4.6, 0, 2.0, [0.98, 0.72, 0.82]], [1.4, 4.0, 0.6, 1.4, [0.99, 0.8, 0.88]], [-1.3, 4.1, -0.5, 1.45, [0.95, 0.66, 0.78]], [0.3, 5.5, -0.4, 1.3, [1.0, 0.84, 0.9]], [-0.4, 4.2, 1.3, 1.2, [0.97, 0.75, 0.84]]];
    for (const [x, y, z, r, c] of blobs) { const g = new THREE.IcosahedronGeometry(r, ctx.q === 'low' ? 0 : 1); _m.makeScale(1, 0.75, 1); _m.setPosition(x, y, z); b.geom(null, g, _m, { col: c }); g.dispose(); }
  }), fol);
}

// 小さな鳥居(参道の千本鳥居・地区の入口の大鳥居)。中心 (cx,cz)、道の向き alongX(true = 道が東西)、幅 w・高さ h
export function torii(ctx, cx, cz, alongX, w, h, o = {}) {
  const { M } = ctx;
  const red = o.col || [0.86, 0.2, 0.07], blk = [0.08, 0.07, 0.07], r = Math.max(0.16, w * 0.032);
  const m = new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0).setPosition(cx, o.y ?? 0, cz);
  withMatrix(ctx, m, () => {
    const B = ctx.B;
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(r * 0.9, r, h, 10); _m.makeTranslation(s * w / 2, h / 2, 0); B.geom(M.plain, g, _m, { col: red }); g.dispose();
      B.box(M.plain, s * w / 2 - r * 1.3, 0, -r * 1.3, s * w / 2 + r * 1.3, h * 0.08, r * 1.3, { col: blk });
    }
    const ov = w * 0.16;
    B.box(M.plain, -w / 2 - ov * 0.5, h * 0.78, -r * 0.8, w / 2 + ov * 0.5, h * 0.78 + r * 1.6, r * 0.8, { col: red, skip: '' });   // 貫
    B.box(M.plain, -w / 2 - ov, h * 0.93, -r * 1.2, w / 2 + ov, h * 0.93 + r * 1.8, r * 1.2, { col: red, skip: '' });          // 島木
    // 笠木(両はしが そり上がる)
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(w / 2 + ov * 1.3, r * 1.6, r * 3);
      _m.makeRotationZ(s * 0.06); _m.setPosition(s * (w / 4 + ov * 0.65), h * 0.93 + r * 2.6 + 0.04, 0); B.geom(M.plain, g, _m, { col: blk }); g.dispose();
    }
    if (o.plaque != null) { B.box(M.plain, -r * 2.2, h * 0.79, -r * 0.5, r * 2.2, h * 0.93, r * 0.5, { col: blk }); B.wall(M.sign, 0, h * 0.795, r * 0.52, 0, 1, r * 3.6, h * 0.13, { uv: signUV(o.plaque), col: [1.2, 1.2, 1.2] }); B.wall(M.sign, 0, h * 0.795, -r * 0.52, 0, -1, r * 3.6, h * 0.13, { uv: signUV(o.plaque), col: [1.2, 1.2, 1.2] }); }
  }, cx, cz);
  // 柱の当たり判定
  for (const s of [-1, 1]) {
    const px = alongX ? cx : cx + s * w / 2, pz = alongX ? cz - s * w / 2 : cz;
    ctx.solid(px - r * 1.3, pz - r * 1.3, px + r * 1.3, pz + r * 1.3, h);
  }
}
export { Builder };
