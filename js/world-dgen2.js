// マップ係(第4弾・街並み): 地区ごとの区画の中身(その2)。寺町・オフィス街・崩壊地区と、中に入れる店(パチンコ店・中華料理店)。
// 区画の番号(i = 西→東, j = 北→南)ごとに genPad が 作る物を決める。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { fbuild, faces, patch, hip, gable, torii, sode, wallSign, billboard, neon, lantern, withMatrix, quad4, beam, PAD_H } from './world-dkit.js';
import { SG, signsOf, tileUV, signUV as signUVOf } from './world-dtex.js';
import { DSTYLE } from './world-district.js';
import { ring, neonPad, chinaPad, chinaPlaza, rr, pick, facePt, patchPlain } from './world-dgen.js';
import { pool, decal } from './world-town.js';
import { placeTree, placeGlass, PROPS } from './world-props.js';
import { Bld } from './world-interiors.js';

const Y = PAD_H;
const _m = new THREE.Matrix4();

// 区画ごとの中身。作ったら true(false なら ふつうのビル)
export function genPad(ctx, i, j, x0, z0, x1, z1) {
  const k = i + ',' + j;
  switch (k) {
    case '0,0': shrine(ctx, x0, z0, x1, z1); return true;
    case '1,0': pagodaYard(ctx, x0, z0, x1, z1); return true;
    case '0,1': machiyaBlock(ctx, x0, z0, x1, z1); return true;
    case '2,0': templeHall(ctx, x0, z0, x1, z1); return true;
    case '2,1': officeSingle(ctx, x0, z0, x1, z1); return true;
    case '3,0': officeTwin(ctx, x0, z0, x1, z1); return true;
    case '4,0': officeStepped(ctx, x0, z0, x1, z1); return true;
    case '0,2': case '1,2': return true;              // 下町商店街(アーケードは まとめて作る)
    case '3,2': neonPad(ctx, x0, z0, x1, z1, 'yokocho'); return true;
    case '4,2': neonPad(ctx, x0, z0, x1, z1, 'pachinko'); pachinko(ctx); return true;
    case '4,3': neonPad(ctx, x0, z0, x1, z1, 'tower'); return true;
    case '0,3': chinaPad(ctx, x0, z0, x1, z1, 'court'); return true;
    case '0,4': chinaPad(ctx, x0, z0, x1, z1, 'temple'); return true;
    case '1,4': chinaPad(ctx, x0, z0, x1, z1, 'court'); return true;
    case '2,3': chinaPlaza(ctx, x0, z0, x1, z1); chinaRestaurant(ctx); return true;
    case '2,4': craterField(ctx, x0, z0, x1, z1); return true;
    case '3,4': collapse(ctx, x0, z0, x1, z1); return true;
    default: return false;
  }
}

// ================= 寺町 =================
// 築地塀(白いしっくいの塀に 瓦の笠)。(ax,az) → (bx,bz) の まっすぐな塀
function tsuiji(ctx, ax, az, bx, bz, h = 2.6) {
  const { M } = ctx, t = 0.35;
  const x0 = Math.min(ax, bx) - (az === bz ? 0 : t), x1 = Math.max(ax, bx) + (az === bz ? 0 : t);
  const z0 = Math.min(az, bz) - (az === bz ? t : 0), z1 = Math.max(az, bz) + (az === bz ? t : 0);
  if (x1 - x0 < 0.5 || z1 - z0 < 0.5) return;
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2), uv = tileUV(52);
  for (const [nx, nz, sx, sz, L] of faces(x0, z0, x1, z1)) {
    const n = Math.max(1, Math.round(L / 3)), w = L / n, rx = nz, rz = -nx;
    for (let i = 0; i < n; i++) ctx.B.face(bk, sx + rx * w * i, Y, sz + rz * w * i, rx, 0, rz, 0, 1, 0, w, h, uv[0], uv[1], uv[2], uv[3], [1, 1, 1], null);
  }
  gable(ctx, x0, z0, x1, z1, Y + h, { over: 0.35, pitch: 0.55, roofTile: 56, ridgeX: x1 - x0 > z1 - z0, endCol: [0.9, 0.88, 0.82] });
  ctx.solid(x0, z0, x1, z1, h + 1);
  ctx.occupy(x0, z0, x1, z1);
  ctx.mapRect(x0, z0, x1, z1, '#d8d0c0');
}
// 箱の胴(マス 1 種類で 4 面)
function body(ctx, x0, z0, x1, z1, y0, y1, tile, bay = 3, col = [1, 1, 1], front = null, frontTile = null) {
  const bk = ctx.B.bucket(ctx.M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  for (const [nx, nz, sx, sz, L] of faces(x0, z0, x1, z1)) {
    const n = Math.max(1, Math.round(L / bay)), w = L / n, rx = nz, rz = -nx;
    const t = front && front[0] === nx && front[1] === nz && frontTile != null ? frontTile : tile, uv = tileUV(t);
    for (let i = 0; i < n; i++) ctx.B.face(bk, sx + rx * w * i, y0, sz + rz * w * i, rx, 0, rz, 0, 1, 0, w, y1 - y0, uv[0], uv[1], uv[2], uv[3], col, null);
  }
}
// 寄棟の屋根 + 軒の裏(下から見ても 屋根がある)
function roofHip(ctx, x0, z0, x1, z1, y, rise, o) {
  const ov = o.over ?? 0.8;
  ctx.B.ceil(ctx.M.plain, x0 - ov, y - (o.drop ?? 0.4) - 0.02, z0 - ov, x1 + ov, z1 + ov, { col: [0.22, 0.15, 0.1] });
  return hip(ctx, x0, z0, x1, z1, y, rise, o);
}
function gravel(ctx, x0, z0, x1, z1, col = [0.84, 0.8, 0.7]) {
  for (let z = z0; z < z1 - 0.01; z += 30) for (let x = x0; x < x1 - 0.01; x += 30) {
    const xb = Math.min(x1, x + 30), zb = Math.min(z1, z + 30);
    ctx.B.flat(ctx.M.ground, (x + xb) / 2, Y + 0.011, (z + zb) / 2, xb - x, zb - z, { col });
  }
}
function stonePath(ctx, x0, z0, x1, z1) { ctx.B.flat(ctx.M.pave, (x0 + x1) / 2, Y + 0.014, (z0 + z1) / 2, x1 - x0, z1 - z0, { col: [0.82, 0.8, 0.76] }); }

// 五重塔の庭(山門・塀・鐘楼・桜)
function pagodaYard(ctx, x0, z0, x1, z1) {
  const { M, rnd } = ctx;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 - 3, i = 2.2;
  gravel(ctx, x0 + i, z0 + i, x1 - i, z1 - i);
  stonePath(ctx, cx - 1.6, cz + 6, cx + 1.6, z1 - 1);
  // 塀(南は山門、東西は 小さな出入口)
  tsuiji(ctx, x0 + i, z0 + i, x1 - i, z0 + i);
  for (const xx of [x0 + i, x1 - i]) { tsuiji(ctx, xx, z0 + i, xx, (z0 + z1) / 2 - 2.2); tsuiji(ctx, xx, (z0 + z1) / 2 + 2.2, xx, z1 - i); }
  tsuiji(ctx, x0 + i, z1 - i, cx - 5.4, z1 - i); tsuiji(ctx, cx + 5.4, z1 - i, x1 - i, z1 - i);
  // 山門(二階建ての門)
  const gz = z1 - i;
  for (const px of [cx - 4.6, cx - 1.9, cx + 1.9, cx + 4.6]) for (const pz of [gz - 1.6, gz + 1.6]) { ctx.B.box(M.plain, px - 0.25, Y, pz - 0.25, px + 0.25, Y + 4.6, pz + 0.25, { col: [0.55, 0.16, 0.1] }); ctx.solid(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25, 7); }
  roofHip(ctx, cx - 5.2, gz - 2.1, cx + 5.2, gz + 2.1, Y + 4.7, 0.9, { roofTile: 56, over: 1.1 });
  body(ctx, cx - 4.2, gz - 1.6, cx + 4.2, gz + 1.6, Y + 5.2, Y + 7.6, 50, 2.8);
  roofHip(ctx, cx - 4.2, gz - 1.6, cx + 4.2, gz + 1.6, Y + 7.6, 2.2, { roofTile: 56, over: 1.6 });
  // 五重塔
  ctx.B.box(M.plain, cx - 5.5, Y, cz - 5.5, cx + 5.5, Y + 0.9, cz + 5.5, { col: [0.62, 0.6, 0.56] });
  let y = Y + 0.9;
  for (let k = 0; k < 5; k++) {
    const hs = 3.9 - k * 0.42, bh = k === 0 ? 3.6 : 2.5;
    body(ctx, cx - hs, cz - hs, cx + hs, cz + hs, y, y + bh, k === 0 ? 51 : 50, 2.6, [1, 1, 1]);
    ctx.B.box(M.plain, cx - hs - 0.3, y + bh - 0.35, cz - hs - 0.3, cx + hs + 0.3, y + bh, cz + hs + 0.3, { col: [0.55, 0.16, 0.1], skip: '' });
    roofHip(ctx, cx - hs, cz - hs, cx + hs, cz + hs, y + bh, 1.25, { roofTile: 56, over: 2.3 - k * 0.12, drop: 0.7, ridge: false });
    y += bh + 1.0;
  }
  // 相輪(てっぺんの柱と輪)
  const sp = new THREE.CylinderGeometry(0.16, 0.22, 7.5, 8); _m.makeTranslation(cx, y + 3.4, cz); ctx.B.geom(M.plain, sp, _m, { col: [0.35, 0.3, 0.2] }); sp.dispose();
  const ringG = new THREE.CylinderGeometry(0.5, 0.5, 0.18, 10);
  for (let k = 0; k < 9; k++) { _m.makeTranslation(cx, y + 1.0 + k * 0.6, cz); ctx.B.geom(M.plain, ringG, _m, { col: [0.55, 0.45, 0.22] }); }
  ringG.dispose();
  ctx.solid(cx - 5.5, cz - 5.5, cx + 5.5, cz + 5.5, y + 8);
  ctx.occupy(cx - 6, cz - 6, cx + 6, cz + 6);
  ctx.mapRect(cx - 5.5, cz - 5.5, cx + 5.5, cz + 5.5, '#3a3428');
  for (const [dx, dz] of [[-4, 6.5], [4, 6.5], [-6.5, 0], [6.5, 0]]) pool(ctx, cx + dx, cz + dz, 4.5, [0.32, 0.22, 0.1], Y + 0.03);
  // 鐘楼
  const bx = x0 + 11, bz = z0 + 11;
  for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) { ctx.B.box(M.plain, bx + dx - 0.2, Y, bz + dz - 0.2, bx + dx + 0.2, Y + 4, bz + dz + 0.2, { col: [0.5, 0.16, 0.1] }); ctx.solid(bx + dx - 0.2, bz + dz - 0.2, bx + dx + 0.2, bz + dz + 0.2, 4); }
  roofHip(ctx, bx - 2.1, bz - 2.1, bx + 2.1, bz + 2.1, Y + 4, 1.6, { roofTile: 56, over: 1 });
  const bell = new THREE.CylinderGeometry(0.55, 0.75, 1.6, 12); _m.makeTranslation(bx, Y + 2.9, bz); ctx.B.geom(M.plain, bell, _m, { col: [0.3, 0.32, 0.25] }); bell.dispose();
  // 参道の灯籠・桜
  for (let z = cz + 8; z < z1 - 6; z += 5) for (const s of [-1, 1]) ctx.prop('toro', cx + s * 3, z, 0, { y: Y, col: [0.62, 0.6, 0.56] });
  for (let k = 0; k < 16; k++) {
    const x = x0 + 6 + rnd() * (x1 - x0 - 12), z = z0 + 6 + rnd() * (z1 - z0 - 12);
    if (Math.abs(x - cx) < 8 && z > cz - 8) continue;
    if (ctx.isFree(x, z, 2)) placeTree(ctx, rnd() < 0.8 ? 'sakura' : 'pine', x, z, 0.75 + rnd() * 0.3, rnd() * 6);
  }
  for (let k = 0; k < 12; k++) decal(ctx, 5, x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 4 + rnd() * (z1 - z0 - 8), 2.5, rnd() * 6, Y + 0.02, [1.5, 0.85, 1.05]);
}
// 神社(千本鳥居の参道・拝殿・狛犬)
function shrine(ctx, x0, z0, x1, z1) {
  const { M, rnd } = ctx;
  const cx = (x0 + x1) / 2 + 4, i = 2.2;
  gravel(ctx, x0 + i, z0 + i, x1 - i, z1 - i, [0.8, 0.76, 0.66]);
  stonePath(ctx, cx - 1.8, z0 + 18, cx + 1.8, z1 - 0.5);
  tsuiji(ctx, x0 + i, z0 + i, x1 - i, z0 + i); tsuiji(ctx, x0 + i, z0 + i, x0 + i, z1 - 8); tsuiji(ctx, x1 - i, z0 + i, x1 - i, z1 - 8);
  // 大きな鳥居と 千本鳥居
  torii(ctx, cx, z1 - 3, false, 5.6, 6.4, { y: Y, plaque: SG['天神'] });
  for (let k = 0; k < 10; k++) torii(ctx, cx, z1 - 8 - k * 2.3, false, 3.2, 3.9, { y: Y, col: [0.9, 0.24, 0.06] });
  for (const s of [-1, 1]) ctx.prop('komainu', cx + s * 3.4, z1 - 5, s > 0 ? -Math.PI / 2 : Math.PI / 2, { y: Y, col: [0.6, 0.6, 0.58] });
  // 拝殿(銅の緑の屋根)
  const hx0 = cx - 7, hx1 = cx + 7, hz0 = z0 + 6, hz1 = z0 + 16;
  ctx.B.box(M.plain, hx0 - 1, Y, hz0 - 1, hx1 + 1, Y + 0.7, hz1 + 1.6, { col: [0.6, 0.58, 0.54] });
  body(ctx, hx0, hz0, hx1, hz1, Y + 0.7, Y + 5, 50, 2.8, [1, 1, 1], [0, 1], 51);
  for (const px of [hx0 + 0.3, cx - 2.3, cx + 2.3, hx1 - 0.3]) ctx.B.box(M.plain, px - 0.22, Y + 0.7, hz1 + 0.9, px + 0.22, Y + 5, hz1 + 1.3, { col: [0.85, 0.22, 0.08] });
  const top = roofHip(ctx, hx0, hz0, hx1, hz1 + 1.3, Y + 5, 3.4, { roofTile: 57, over: 1.6, ridgeCol: [0.15, 0.3, 0.22], ends: [0.85, 0.7, 0.3] });
  beam(ctx.B, M.plain, [cx - 4, Y + 4.6, hz1 + 1.45], [cx + 4, Y + 4.6, hz1 + 1.45], 0.4, [0.85, 0.78, 0.55]);   // しめ縄
  for (let k = -3; k <= 3; k++) ctx.B.box(M.plain, cx + k * 1.1 - 0.1, Y + 3.9, hz1 + 1.6, cx + k * 1.1 + 0.1, Y + 4.4, hz1 + 1.65, { col: [1, 1, 1], skip: '' });
  ctx.B.box(M.plain, cx - 1.2, Y + 0.7, hz1 + 2.0, cx + 1.2, Y + 1.6, hz1 + 2.9, { col: [0.45, 0.3, 0.18] });   // さいせん箱
  ctx.solid(hx0 - 1, hz0 - 1, hx1 + 1, hz1 + 2.9, top);
  ctx.mapRect(hx0, hz0, hx1, hz1, '#2c4a3a');
  lantern(ctx, cx - 3, Y + 3.8, hz1 + 1.5, 1.3, [2.4, 2.1, 1.6]); lantern(ctx, cx + 3, Y + 3.8, hz1 + 1.5, 1.3, [2.4, 2.1, 1.6]);
  pool(ctx, cx, hz1 + 3, 6, [0.32, 0.22, 0.1], Y + 0.03);
  // 絵馬かけ
  ctx.B.box(M.plain, cx + 6, Y, z0 + 22, cx + 9, Y + 1.8, z0 + 22.3, { col: [0.45, 0.3, 0.18] });
  for (let k = 0; k < 10; k++) ctx.B.box(M.plain, cx + 6.1 + (k % 5) * 0.58, Y + 0.9 + (k > 4 ? 0.45 : 0), z0 + 22.3, cx + 6.55 + (k % 5) * 0.58, Y + 1.25 + (k > 4 ? 0.45 : 0), z0 + 22.35, { col: [0.9, 0.78, 0.55], skip: '' });
  ctx.solid(cx + 6, z0 + 22, cx + 9, z0 + 22.4, 1.8);
  // 灯籠と桜
  for (let z = z0 + 20; z < z1 - 8; z += 6) for (const s of [-1, 1]) if (z < z1 - 33 || z > z1 - 7) ctx.prop('toro', cx + s * 3.6, z, 0, { y: Y, col: [0.62, 0.6, 0.56] });
  for (let k = 0; k < 18; k++) {
    const x = x0 + 5 + rnd() * (x1 - x0 - 10), z = z0 + 5 + rnd() * (z1 - z0 - 10);
    if (Math.abs(x - cx) < 6.5 || (z < z0 + 19 && Math.abs(x - cx) < 10)) continue;
    if (ctx.isFree(x, z, 2)) placeTree(ctx, rnd() < 0.85 ? 'sakura' : 'pine', x, z, 0.7 + rnd() * 0.35, rnd() * 6);
  }
}
// 町家の並ぶ一画と、中の庭(池・灯籠・桜・赤い橋)
const WA_G = [38, 32, 38, 49, 33];
function machiyaB(ctx, r, n) {
  const { rnd, M } = ctx;
  const [x0, z0, x1, z1] = r;
  const H = Y + rr(ctx, 6.6, 7.6), G = 3.3;
  fbuild(ctx, x0, z0, x1, z1, { H, G, fl: H - Y - G, bay: 2.8, ground: [pick(ctx, WA_G)], side: [48, 50], up: [48, 49, 50, 49], lit: [49], litP: 0.4, front: n, roof: 'kawara', roofTile: 56, ridgeX: !!n[1], over: 0.75, pitch: 0.48, ledge: false, mapCol: DSTYLE.temple.bmap, col: pick(ctx, [[1, 1, 1], [0.95, 0.93, 0.9], [1.05, 1.02, 0.98]]) });
  // 一階の上の ひさし(瓦)
  const [ax, az] = facePt(r, n, 0), [bx, bz] = facePt(r, n, 1);
  const bk = ctx.B.bucket(M.facade, (ax + bx) / 2, (az + bz) / 2), out = 1.0, y0 = Y + G + 0.5;
  patch(bk, [ax + n[0] * out, y0 - 0.5, az + n[1] * out], [bx + n[0] * out, y0 - 0.5, bz + n[1] * out], [ax, y0, az], [bx, y0, bz], Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.5)), 1, 56, [1, 1, 1]);
  ctx.B.ceil(M.plain, Math.min(ax, bx + n[0] * out, ax + n[0] * out), y0 - 0.52, Math.min(az, bz + n[1] * out, az + n[1] * out), Math.max(ax, bx, ax + n[0] * out, bx + n[0] * out), Math.max(az, bz, az + n[1] * out, bz + n[1] * out), { col: [0.25, 0.17, 0.1] });
  if (rnd() < 0.45) { const [px, pz] = facePt(r, n, rnd() < 0.5 ? 0.12 : 0.88); sode(ctx, px, pz, n[0], n[1], Y + 1.6, pick(ctx, signsOf('wood')), 0.5); }
  if (rnd() < 0.5) { const [px, pz] = facePt(r, n, 0.5); lantern(ctx, px + n[0] * 0.7, Y + 2.7, pz + n[1] * 0.7, 0.75, rnd() < 0.5 ? [2.3, 2.0, 1.5] : [1.9, 0.28, 0.12]); }
}
function machiyaBlock(ctx, x0, z0, x1, z1) {
  const { M, rnd } = ctx;
  const inner = ring(ctx, x0, z0, x1, z1, { inset: 2.8, d: [9, 11], w: [5.5, 8.5], gap: 0.1, gaps: { s: [[(x0 + x1) / 2 - 2, (x0 + x1) / 2 + 2]] }, make: (r, n) => machiyaB(ctx, r, n) });
  const [a, b, c, d] = inner, cx = (a + c) / 2, cz = (b + d) / 2;
  gravel(ctx, a - 3, b - 3, c + 3, d + 3, [0.78, 0.74, 0.62]);
  // 池
  const rx = (c - a) * 0.3, rz = (d - b) * 0.26;
  disk(ctx, M.water, cx, Y + 0.05, cz, rx, rz, [0.75, 0.85, 0.8], 0.15);
  for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2; ctx.I.add('rock', cx + Math.cos(t) * rx * 1.05, Y, cz + Math.sin(t) * rz * 1.08, rnd() * 6, [0.5 + rnd() * 0.4, 0.35 + rnd() * 0.3, 0.5 + rnd() * 0.4]); }
  ctx.solid(cx - rx * 0.85, cz - rz * 0.7, cx + rx * 0.85, cz + rz * 0.7, 0.5);
  // 赤い太鼓橋(見た目だけ)
  for (let k = 0; k < 8; k++) { const t = k / 7, x = cx - rx * 0.55 + t * rx * 1.1, y = Y + 0.3 + Math.sin(t * Math.PI) * 0.9; ctx.B.box(M.plain, x - 0.2, y, cz - 0.9, x + 0.2, y + 0.15, cz + 0.9, { col: [0.85, 0.2, 0.08] }); }
  for (const s of [-1, 1]) beam(ctx.B, M.plain, [cx - rx * 0.55, Y + 0.9, cz + s * 0.9], [cx + rx * 0.55, Y + 0.9, cz + s * 0.9], 0.1, [0.85, 0.2, 0.08]);
  for (const [dx, dz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) ctx.prop('toro', cx + dx * (rx + 3), cz + dz * (rz + 2), 0, { y: Y, col: [0.6, 0.58, 0.55] });
  for (let k = 0; k < 10; k++) {
    const t = rnd() * Math.PI * 2, x = cx + Math.cos(t) * (rx + 4 + rnd() * 3), z = cz + Math.sin(t) * (rz + 4 + rnd() * 3);
    if (x > a && x < c && z > b && z < d && ctx.isFree(x, z, 1.5)) placeTree(ctx, rnd() < 0.6 ? 'sakura' : 'pine', x, z, 0.55 + rnd() * 0.25, rnd() * 6);
  }
  ctx.mapCircle(cx, cz, rx, '#3d6a80', 1, rz / rx);
}

// 本堂(中に入れる。金色の仏さま・ろうそく・座ぶとん)。両わきに お墓
function templeHall(ctx, px0, pz0, px1, pz1) {
  const { M, rnd } = ctx;
  const x0 = -13, x1 = 13, z0 = -164, z1 = -131, h = 6.4;
  gravel(ctx, px0 + 1, pz0 + 1, px1 - 1, pz1 - 1, [0.82, 0.78, 0.68]);
  stonePath(ctx, -2, z1, 2, pz1 - 0.5);
  const B = new DBld(ctx, { name: '本堂', x0, z0, x1, z1, h, y0: Y, bay: 2.8, rows: [[0, 3.6, [51, 49, 50, 49]], [3.6, 20, [49, 50, 48]]], skinCol: [1, 1, 1], floor: M.woodFloor, floorCol: [0.86, 0.8, 0.56], wallCol: [0.82, 0.76, 0.64], wall: M.plaster });
  B.shell([{ side: 'S', at: 0, w: 8 }, { side: 'E', at: -147, w: 4 }, { side: 'W', at: -147, w: 4 }]);
  for (const x of [-8, -3, 3, 8]) for (const z of [-157, -150, -143, -137]) B.column(x, z, 0.3, h, [0.45, 0.14, 0.07]);
  // 仏さま(台・蓮・体・頭)と 祭壇
  const cx = 0, cz = -160;
  ctx.B.box(M.plain, cx - 3, Y, cz - 2.4, cx + 3, Y + 1.1, cz + 2.4, { col: [0.25, 0.12, 0.08] });
  const gold = [0.95, 0.72, 0.28], g1 = new THREE.CylinderGeometry(2.0, 1.6, 0.8, 16), g2 = new THREE.SphereGeometry(1.5, 14, 10), g3 = new THREE.SphereGeometry(0.75, 12, 9);
  _m.makeTranslation(cx, Y + 1.5, cz); ctx.B.geom(M.car, g1, _m, { col: gold });
  _m.makeScale(1.15, 1.1, 0.9).setPosition(cx, Y + 3.0, cz); ctx.B.geom(M.car, g2, _m, { col: gold });
  _m.makeTranslation(cx, Y + 4.75, cz); ctx.B.geom(M.car, g3, _m, { col: gold });
  _m.makeScale(1.6, 2.2, 0.2).setPosition(cx, Y + 4.2, cz - 1.0); ctx.B.geom(M.car, g2, _m, { col: [0.85, 0.6, 0.2] });
  g1.dispose(); g2.dispose(); g3.dispose();
  ctx.solid(cx - 3, cz - 2.4, cx + 3, cz + 2.4, 5, B.b);
  ctx.B.box(M.plain, cx - 2.5, Y, cz + 3, cx + 2.5, Y + 1.0, cz + 4.2, { col: [0.35, 0.12, 0.07] }); ctx.solid(cx - 2.5, cz + 3, cx + 2.5, cz + 4.2, 1, B.b);
  for (const x of [-2, -1, 1, 2]) { ctx.B.box(M.plain, x - 0.06, Y + 1.0, cz + 3.5, x + 0.06, Y + 1.5, cz + 3.62, { col: [0.95, 0.92, 0.85] }); ctx.B.box(M.glow, x - 0.04, Y + 1.5, cz + 3.52, x + 0.04, Y + 1.62, cz + 3.6, { col: [3, 1.8, 0.6] }); }
  B.light(cx, cz + 1, 6, [0.5, 0.35, 0.12]);
  // 座ぶとん
  for (let z = -152; z < -134; z += 2.4) for (let x = -10; x <= 10; x += 2.2) if (Math.abs(x) > 1.6 && rnd() < 0.8) ctx.B.box(M.plain, x - 0.4, Y + 0.05, z - 0.4, x + 0.4, Y + 0.17, z + 0.4, { col: [0.55, 0.12, 0.25] });
  for (const z of [-150, -141]) for (const x of [-6, 6]) B.light(x, z, 4.5, [0.42, 0.3, 0.15]);
  // 大きな屋根(寄棟。中に入ると消える)
  const B0 = ctx.B; ctx.B = B.RB;
  roofHip(ctx, x0, z0, x1, z1, h, 6.5, { roofTile: 56, over: 2.4, drop: 0.8, ends: [0.85, 0.7, 0.3] });
  ctx.B = B0;
  B.finish();
  // 正面の 大きな香炉と 灯籠
  ctx.B.box(M.plain, -1.3, Y, z1 + 6, 1.3, Y + 0.9, z1 + 8.6, { col: [0.25, 0.24, 0.22] });
  const pot = new THREE.CylinderGeometry(1.3, 1.0, 1.2, 12); _m.makeTranslation(0, Y + 1.5, z1 + 7.3); ctx.B.geom(M.plain, pot, _m, { col: [0.28, 0.27, 0.24] }); pot.dispose();
  ctx.solid(-1.3, z1 + 6, 1.3, z1 + 8.6, 2.2);
  ctx.W.addFire(0, Y + 2.1, z1 + 7.3, 0.2);
  for (const z of [z1 + 3, z1 + 11]) for (const s of [-1, 1]) ctx.prop('toro', s * 4, z, 0, { y: Y, col: [0.62, 0.6, 0.56] });
  // お墓(東と西)
  for (const side of [-1, 1]) {
    for (let x = 18; x < 31; x += 2.6) for (let z = pz0 + 4; z < pz1 - 4; z += 3.2) {
      if (rnd() < 0.18) continue;
      const px = side * x + (rnd() - 0.5) * 0.4, pz = z + (rnd() - 0.5) * 0.4, v = 0.52 + rnd() * 0.2;
      ctx.B.box(M.plain, px - 0.6, Y, pz - 0.5, px + 0.6, Y + 0.4, pz + 0.5, { col: [v * 0.9, v * 0.9, v * 0.88] });
      ctx.B.box(M.plain, px - 0.32, Y + 0.4, pz - 0.25, px + 0.32, Y + 1.7 + rnd() * 0.3, pz + 0.25, { col: [v, v, v * 0.97] });
      if (rnd() < 0.5) for (let k = 0; k < 3; k++) ctx.B.box(M.plain, px - 0.3 + k * 0.25, Y + 0.4, pz + 0.3, px - 0.26 + k * 0.25, Y + 2.0, pz + 0.33, { col: [0.75, 0.65, 0.5] });
      ctx.solid(px - 0.6, pz - 0.5, px + 0.6, pz + 0.5, 1.8);
    }
    placeTree(ctx, 'sakura', side * 24, pz0 + 10, 0.9, rnd() * 6);
    placeTree(ctx, 'pine', side * 26, pz1 - 12, 0.8, rnd() * 6);
  }
}

// 平らな楕円(池・噴水の水)。wob = ふちの ゆらぎ
function disk(ctx, mat, cx, y, cz, rx, rz, col, wob = 0) {
  const bk = ctx.B.bucket(mat, cx, cz), seg = 24, base = bk.v, s = (mat.userData && mat.userData.s) || [12, 12];
  bk.p.push(cx, y, cz); bk.n.push(0, 1, 0); bk.u.push(cx / s[0], -cz / s[1]); bk.c.push(col[0], col[1], col[2]);
  for (let k = 0; k <= seg; k++) { const t = k / seg * Math.PI * 2, px = cx + Math.cos(t) * rx * (1 + wob * Math.sin(t * 3)), pz = cz + Math.sin(t) * rz; bk.p.push(px, y, pz); bk.n.push(0, 1, 0); bk.u.push(px / s[0], -pz / s[1]); bk.c.push(col[0], col[1], col[2]); }
  for (let k = 0; k < seg; k++) bk.i.push(base, base + 2 + k, base + 1 + k);
  bk.v += seg + 2;
}

// ================= オフィス街 =================
const GLASS_STYLES = [
  { up: [0, 0, 1], band: null },
  { up: [2, 4, 2], band: 7, bandEvery: 2 },
  { up: [3, 0, 3], colTile: 7, colP: 0.3 },
  { up: [1, 5, 1], band: null },
  { up: [4, 2], band: 7, bandEvery: 3 },
];
function tower(ctx, x0, z0, x1, z1, H, o = {}) {
  const st = o.style || pick(ctx, GLASS_STYLES);
  const y = o.y ?? Y;
  const b = fbuild(ctx, x0, z0, x1, z1, { y, H, G: o.G ?? (y === Y ? 5.5 : 0), fl: 3.6, bay: 3.2, ground: y === Y ? [44] : [], up: st.up, lit: [5, 6], litP: 0.22, band: st.band, bandEvery: st.bandEvery, colTile: st.colTile, colP: st.colP, col: o.col || [1, 1, 1], allFront: true, roof: 'flat', roofTile: o.roofTile ?? pick(ctx, [60, 61, 63]), parH: 1.0, parCol: [0.32, 0.36, 0.42], mapCol: DSTYLE.office.bmap, ledge: y === Y, ledgeCol: [0.3, 0.33, 0.38] });
  // 屋上の光る帯
  if (o.crown !== false) {
    const c = o.crownCol || pick(ctx, [[0.4, 1.6, 3], [2.6, 2.6, 2.8], [0.5, 2.6, 2.2]]);
    for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z0, x0, z0], [x1, z1, x1, z0], [x0, z0, x0, z1]]) neon(ctx, [ax, H - 0.5, az], [bx, H - 0.5, bz], c, 0.16);
  }
  // 1 階のガラス(こわせる)
  if (y === Y) for (const [nx, nz, sx, sz, L] of faces(x0, z0, x1, z1)) {
    const n = Math.max(1, Math.round(L / 3.2)), w = L / n, rx = nz, rz = -nx;
    for (let i = 0; i < n; i++) placeGlass(ctx, sx + rx * w * (i + 0.5) + nx * 0.06, sz + rz * w * (i + 0.5) + nz * 0.06, nz ? 0 : Math.PI / 2, w - 0.2, 4.6, Y + 0.3);
  }
  return b;
}
function sculpture(ctx, x, z, kind) {
  const { M } = ctx;
  ctx.B.box(M.plain, x - 2, Y, z - 2, x + 2, Y + 0.6, z + 2, { col: [0.75, 0.76, 0.78] });
  if (kind === 'ring') { const g = new THREE.TorusGeometry(2.6, 0.42, 8, 28); _m.makeRotationY(0.4).setPosition(x, Y + 3.4, z); ctx.B.geom(M.plain, g, _m, { col: [0.9, 0.3, 0.12] }); g.dispose(); }
  else if (kind === 'cubes') { const g = new THREE.BoxGeometry(1.6, 1.6, 1.6); for (let k = 0; k < 3; k++) { _m.makeRotationFromEuler(new THREE.Euler(0.6, k * 0.7, 0.75)).setPosition(x, Y + 1.6 + k * 1.7, z); ctx.B.geom(M.plain, g, _m, { col: [[0.2, 0.5, 0.85], [0.85, 0.85, 0.9], [0.95, 0.75, 0.15]][k] }); } g.dispose(); }
  else { const g = new THREE.IcosahedronGeometry(1.9, 2); _m.makeTranslation(x, Y + 2.6, z); ctx.B.geom(M.car, g, _m, { col: [0.8, 0.84, 0.9] }); g.dispose(); }
  ctx.solid(x - 2, z - 2, x + 2, z + 2, 5);
  ctx.occupy(x - 2.5, z - 2.5, x + 2.5, z + 2.5);
  pool(ctx, x, z, 5, [0.15, 0.3, 0.45], Y + 0.03);
}
function fountain(ctx, x, z, r = 4.5) {
  const { M } = ctx;
  const g = new THREE.CylinderGeometry(r, r, 0.6, 24, 1, true); _m.makeTranslation(x, Y + 0.3, z); ctx.B.geom(M.plain, g, _m, { col: [0.82, 0.83, 0.86] }); g.dispose();
  disk(ctx, M.water, x, Y + 0.45, z, r * 0.97, r * 0.97, [0.7, 0.9, 1]);
  const c = new THREE.CylinderGeometry(0.5, 0.8, 2.2, 10); _m.makeTranslation(x, Y + 1.1, z); ctx.B.geom(M.plain, c, _m, { col: [0.85, 0.86, 0.9] }); c.dispose();
  ctx.B.box(M.glow, x - 0.25, Y + 2.2, z - 0.25, x + 0.25, Y + 3.2, z + 0.25, { col: [1.6, 2.2, 2.8] });
  ctx.solid(x - r, z - r, x + r, z + r, 0.7);
  ctx.occupy(x - r, z - r, x + r, z + r);
  pool(ctx, x, z, r + 2, [0.12, 0.25, 0.35], Y + 0.03);
  ctx.mapCircle(x, z, r, '#5a8ab0');
}
function plazaDeco(ctx, x0, z0, x1, z1) {
  const { M, rnd } = ctx;
  // 床の光る線(青)と 石の帯
  for (const z of [z0 + 0.6, z1 - 0.6]) ctx.B.flat(M.glow, (x0 + x1) / 2, Y + 0.02, z, x1 - x0 - 1, 0.12, { col: [0.35, 1.3, 2.4] });
  for (const x of [x0 + 0.6, x1 - 0.6]) ctx.B.flat(M.glow, x, Y + 0.02, (z0 + z1) / 2, 0.12, z1 - z0 - 1, { col: [0.35, 1.3, 2.4] });
  for (let x = x0 + 6; x < x1 - 4; x += 8) ctx.B.flat(M.paint, x, Y + 0.015, (z0 + z1) / 2, 0.7, z1 - z0 - 2, { col: [0.44, 0.46, 0.5] });
  // 両わきの並木
  for (let z = z0 + 3; z < z1 - 2; z += 6) for (const x of [x0 + 3, x1 - 3]) if (ctx.isFree(x, z, 1.2)) { ctx.prop('planter', x, z, 0, { y: Y, col: [0.75, 0.76, 0.78] }); placeTree(ctx, 'birch', x, z, 0.8, rnd() * 6); }
  // 旗(3 本)
  const fx = (x0 + x1) / 2 - 10;
  for (let k = 0; k < 3; k++) {
    const x = fx + k * 2.5, z = z0 + 2;
    if (!ctx.isFree(x, z, 0.5)) continue;
    ctx.B.box(M.plain, x - 0.07, Y, z - 0.07, x + 0.07, Y + 9, z + 0.07, { col: [0.8, 0.8, 0.82] });
    ctx.B.box(M.plain, x + 0.07, Y + 7.2, z - 0.02, x + 2.1, Y + 8.6, z + 0.02, { col: [[0.15, 0.35, 0.8], [0.9, 0.9, 0.92], [0.85, 0.2, 0.15]][k], skip: '' });
    ctx.solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 9);
  }
  // ベンチ・車止め・ごみ箱
  for (let k = 0; k < 14; k++) {
    const x = x0 + 6 + rnd() * (x1 - x0 - 12), z = z0 + 3 + rnd() * (z1 - z0 - 6);
    if (!ctx.isFree(x, z, 1.6)) continue;
    ctx.prop(pick(ctx, ['bench', 'bench', 'bollard', 'trashcan', 'vending']), x, z, rnd() < 0.5 ? 0 : Math.PI / 2, { y: Y, col: [0.85, 0.85, 0.88] });
  }
  for (let x = x0 + 4; x < x1 - 3; x += 3.2) if (ctx.isFree(x, z1 - 1.2, 0.3)) ctx.prop('bollard', x, z1 - 1.2, 0, { y: Y });
}
function officeSingle(ctx, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2;
  const t0 = [cx - 13, z0 + 4, cx + 13, z0 + 26];
  tower(ctx, ...t0, Y + 30, { style: GLASS_STYLES[1], crown: false, roofTile: 63 });
  tower(ctx, cx - 10, z0 + 7, cx + 10, z0 + 23, Y + 62, { y: Y + 30, style: GLASS_STYLES[1], crown: false });
  const top = tower(ctx, cx - 7, z0 + 9.5, cx + 7, z0 + 20.5, Y + 82, { y: Y + 62, style: GLASS_STYLES[3], crownCol: [0.4, 1.6, 3] });
  beam(ctx.B, ctx.M.plain, [cx, top.H, z0 + 15], [cx, top.H + 12, z0 + 15], 0.35, [0.7, 0.72, 0.75]);
  ctx.B.box(ctx.M.glow, cx - 0.3, top.H + 12, z0 + 14.7, cx + 0.3, top.H + 12.6, z0 + 15.3, { col: [4, 0.3, 0.2] });
  // 南の面の 大きな光る広告と 会社の名前
  wallSign(ctx, cx, Y + 14, z0 + 26, 0, 1, 16, 8, SG['ad:led'], [1.25, 1.25, 1.25], 0.08);
  wallSign(ctx, cx, Y + 56, z0 + 23, 0, 1, 14, 3.5, SG['ソラノ重工'], [1.3, 1.3, 1.3], 0.08);
  sculpture(ctx, cx - 16, z1 - 13, 'ring');
  fountain(ctx, cx + 4, z1 - 12);
  plazaDeco(ctx, x0 + 2, z0 + 28, x1 - 2, z1 - 2);
}
function officeTwin(ctx, x0, z0, x1, z1) {
  const A = [x0 + 6, z0 + 5, x0 + 21, z0 + 20], Bt = [x1 - 21, z0 + 5, x1 - 6, z0 + 20];
  const st = GLASS_STYLES[2];
  const a = tower(ctx, ...A, Y + 64, { style: st, crownCol: [2.6, 2.6, 2.8] });
  const b = tower(ctx, ...Bt, Y + 76, { style: st, crownCol: [2.6, 2.6, 2.8] });
  // 空中の渡り廊下
  ctx.B.box(ctx.M.plain, A[2], Y + 40, z0 + 10.5, Bt[0], Y + 43, z0 + 14.5, { col: [0.3, 0.38, 0.48] });
  neon(ctx, [A[2], Y + 39.9, z0 + 14.6], [Bt[0], Y + 39.9, z0 + 14.6], [0.4, 1.6, 3], 0.12);
  wallSign(ctx, (A[0] + A[2]) / 2, a.H - 6, A[3], 0, 1, 12, 3, SG['NOVA BANK'], [1.3, 1.3, 1.3], 0.08);
  wallSign(ctx, (Bt[0] + Bt[2]) / 2, b.H - 6, Bt[3], 0, 1, 12, 3, SG['ミナモ生命'], [1.3, 1.3, 1.3], 0.08);
  sculpture(ctx, (x0 + x1) / 2, z1 - 14, 'cubes');
  plazaDeco(ctx, x0 + 2, z0 + 23, x1 - 2, z1 - 2);
}
function officeStepped(ctx, x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2;
  const st = GLASS_STYLES[4];
  tower(ctx, x0 + 5, z0 + 4, x1 - 5, z0 + 28, Y + 22, { style: st, crown: false, roofTile: 63 });
  tower(ctx, cx - 13, z0 + 7, cx + 13, z0 + 25, Y + 58, { y: Y + 22, style: GLASS_STYLES[0], crown: false });
  const t = tower(ctx, cx - 7.5, z0 + 10, cx + 7.5, z0 + 22, Y + 88, { y: Y + 58, style: GLASS_STYLES[0], crownCol: [0.5, 2.6, 2.2] });
  // てっぺんの とがった飾り
  const g = new THREE.ConeGeometry(4, 14, 4); _m.makeRotationY(Math.PI / 4).setPosition(cx, t.H + 7, z0 + 16); ctx.B.geom(ctx.M.plain, g, _m, { col: [0.55, 0.62, 0.72] }); g.dispose();
  ctx.B.box(ctx.M.glow, cx - 0.25, t.H + 14, z0 + 15.75, cx + 0.25, t.H + 14.6, z0 + 16.25, { col: [4, 0.3, 0.2] });
  wallSign(ctx, cx, Y + 16, z0 + 28, 0, 1, 18, 3.2, SG['KUROGANE'], [1.3, 1.3, 1.3], 0.08);
  fountain(ctx, cx, z1 - 11, 5);
  sculpture(ctx, x0 + 9, z1 - 10, 'sphere');
  plazaDeco(ctx, x0 + 2, z0 + 30, x1 - 2, z1 - 2);
}

// ================= 崩壊地区 =================
const RUIN_UP = [53, 54, 55, 12, 9, 53, 54, 55];
function ruinB(ctx, r, H, o = {}) {
  const { rnd, M } = ctx;
  const [x0, z0, x1, z1] = r, h = H - Y;
  const tops = []; for (let k = 0; k < 9; k++) tops.push(h * (0.35 + rnd() * 0.65));
  const lo = Math.min(...tops);
  fbuild(ctx, x0, z0, x1, z1, { H, G: 4, fl: 3.3, bay: 3.4, ground: [34, 53, 55, 54], up: RUIN_UP, lit: [54], litP: 0.12, col: pick(ctx, [[0.8, 0.72, 0.66], [0.7, 0.66, 0.62], [0.85, 0.78, 0.7]]), tops, roof: 'none', allFront: true, mapCol: DSTYLE.ruins.bmap, solid: o.solid, ledgeCol: [0.3, 0.27, 0.25] });
  // 中は がれきで埋まっている(上から見ると 黒い穴と がれき)
  const fy = Y + Math.max(2, lo - 1.2);
  ctx.B.box(M.plain, x0 + 0.05, Y, z0 + 0.05, x1 - 0.05, fy, z1 - 0.05, { col: [0.16, 0.14, 0.13], skip: 'b' });
  const bk = ctx.B.bucket(M.facade, (x0 + x1) / 2, (z0 + z1) / 2);
  const nu = Math.max(1, Math.round((x1 - x0) / 4)), nv = Math.max(1, Math.round((z1 - z0) / 4)), du = (x1 - x0 - 0.2) / nu, dv = (z1 - z0 - 0.2) / nv;
  for (let a = 0; a < nu; a++) for (let c = 0; c < nv; c++) { const xa = x0 + 0.1 + a * du, zb = z1 - 0.1 - c * dv, v = 0.4 + rnd() * 0.35; patch(bk, [xa, fy + 0.02, zb], [xa + du, fy + 0.02, zb], [xa, fy + 0.02, zb - dv], [xa + du, fy + 0.02, zb - dv], 1, 1, pick(ctx, [60, 60, 55, 53, 62, 54]), [v, v * 0.92, v * 0.85]); }
  // はみ出た床・鉄筋
  for (let k = 0; k < 3; k++) {
    const y = Y + 4 + rnd() * (lo - 4), s = rnd() < 0.5;
    if (s) ctx.B.box(M.plain, x0 - 1.2, y, z0 + rnd() * (z1 - z0 - 3), x0 + 2, y + 0.35, z0 + 3 + rnd() * (z1 - z0 - 3), { col: [0.5, 0.48, 0.45], skip: '' });
    for (let q = 0; q < 4; q++) beam(ctx.B, M.plain, [x0 + rnd() * (x1 - x0), y + lo * 0.3, z1], [x0 + rnd() * (x1 - x0), y + lo * 0.3 + 1.5, z1 + 0.8 + rnd()], 0.05, [0.35, 0.18, 0.1]);
  }
  for (let k = 0; k < 2; k++) ctx.prop('rubble', x0 + rnd() * (x1 - x0), fy - Y > 0 ? z1 + 1.5 : z1 + 1.5, rnd() * 6, { y: Y, solid: false, s: 1.5 });
  if (rnd() < 0.5) ctx.W.addFire(x0 + 1 + rnd() * (x1 - x0 - 2), fy + 0.1, z0 + 1 + rnd() * (z1 - z0 - 2), 0.9 + rnd() * 0.6);
}
// 大きながれき(コンクリートの塊)。big なら ぶつかる
function chunk(ctx, x, z, s, big = false) {
  const g = new THREE.BoxGeometry(s * (0.8 + ctx.rnd() * 0.6), s * (0.5 + ctx.rnd() * 0.5), s * (0.8 + ctx.rnd() * 0.6));
  _m.makeRotationFromEuler(new THREE.Euler(ctx.rnd() * 0.8, ctx.rnd() * 6, ctx.rnd() * 0.8)).setPosition(x, Y + s * 0.25, z);
  const v = 0.4 + ctx.rnd() * 0.25;
  ctx.B.geom(ctx.M.concrete, g, _m, { col: [v * 1.05, v, v * 0.92] }); g.dispose();
  if (big) ctx.solid(x - s * 0.5, z - s * 0.5, x + s * 0.5, z + s * 0.5, s);
}
// ひっくり返った車(見た目 + 箱)
function flipped(ctx, name, x, z, rot, col) {
  const P = PROPS[name]; if (!P) return;
  const m = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeRotationX(Math.PI)).setPosition(x, Y + P.h, z);
  for (const part of P.parts) ctx.B.geom(part.mat, part.geo, m, { col: part.tint ? col : null, bx: x, bz: z });
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), ex = (c * P.w + s * P.d) / 2, ez = (s * P.w + c * P.d) / 2;
  ctx.solid(x - ex, z - ez, x + ex, z + ez, P.h);
}
function craterField(ctx, x0, z0, x1, z1) {
  const { rnd } = ctx;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 2, R = 12;
  // 東西のふちに こわれた低い建物
  ring(ctx, x0, z0, x1, z1, { inset: 3, d: [8, 10], w: [7, 11], gap: 0.25, skip: 'ns', make: (r) => ruinB(ctx, r, Y + rr(ctx, 7, 15)) });
  // 大きな穴
  decal(ctx, 7, cx, cz, R * 2.6, rnd() * 6, Y + 0.02, [0.5, 0.45, 0.42]);
  decal(ctx, 3, cx, cz, R * 1.6, rnd() * 6, Y + 0.025);
  ctx.B.flat(ctx.M.decal, cx, Y + 0.03, cz, R * 1.2, R * 1.2, { uv: [0.75, 0.5, 1, 0.75], col: [0.4, 0.35, 0.3] });
  for (let k = 0; k < 46; k++) { const t = k / 46 * Math.PI * 2 + rnd() * 0.1, d = R + rnd() * 3.5; chunk(ctx, cx + Math.cos(t) * d, cz + Math.sin(t) * d, 0.6 + rnd() * 1.6, k % 4 === 0); }
  for (let k = 0; k < 8; k++) { const t = rnd() * 6.28, d = rnd() * R * 0.6; chunk(ctx, cx + Math.cos(t) * d, cz + Math.sin(t) * d, 0.5 + rnd() * 0.8); }
  ctx.W.addFire(cx, Y + 0.2, cz, 1.8); ctx.W.addFire(cx + 4, Y + 0.2, cz - 3, 0.9);
  pool(ctx, cx, cz, R, [0.55, 0.22, 0.06], Y + 0.04);
  ctx.mapCircle(cx, cz, R, '#1a100c');
  // ひっくり返ったバスと 焼けた車
  flipped(ctx, 'bus', cx - 2, z0 + 7, 0.25, [0.13, 0.11, 0.1]);
  for (let k = 0; k < 5; k++) { const t = rnd() * 6.28, d = R + 6 + rnd() * 4, x = cx + Math.cos(t) * d, z = cz + Math.sin(t) * d; if (ctx.isFree(x, z, 2.5)) ctx.prop('sedan', x, z, rnd() * 6, { y: Y, col: [0.13, 0.11, 0.1] }); }
  ctx.W.addFire(cx - 2, Y + 1.5, z0 + 7, 1.2);
}
function collapse(ctx, x0, z0, x1, z1) {
  const { rnd, M } = ctx;
  // 傾いたビル(東へ たおれかけ)
  const L = [x0 + 4, z0 + 4, x0 + 19, z0 + 21], H = Y + 36, ang = -0.17;
  const piv = new THREE.Vector3(L[2], 0, (L[1] + L[3]) / 2);
  const m = new THREE.Matrix4().makeTranslation(piv.x, 0, piv.z).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeTranslation(-piv.x, 0, -piv.z));
  withMatrix(ctx, m, () => fbuild(ctx, L[0], L[1], L[2], L[3], { H, G: 4, fl: 3.3, bay: 3.4, ground: [34, 53], up: RUIN_UP, lit: [54], litP: 0.1, col: [0.78, 0.72, 0.66], allFront: true, roof: 'flat', roofTile: 60, solid: false, mapCol: DSTYLE.ruins.bmap }), (L[0] + L[2]) / 2, (L[1] + L[3]) / 2);
  ctx.solid(L[0], L[1], L[2] + 1, L[3], H);
  for (let k = 0; k < 6; k++) chunk(ctx, L[2] + 1.5 + rnd() * 3, L[1] + rnd() * (L[3] - L[1]), 0.8 + rnd() * 1.2, true);
  // つぶれたビル(床が かさなる)
  const P = [x0 + 27, z0 + 6, x0 + 45, z0 + 20];
  for (let k = 0; k < 6; k++) {
    const y = Y + k * 0.95, dx = (rnd() - 0.5) * 1.4, dz = (rnd() - 0.5) * 1.4, r = (rnd() - 0.5) * 0.12;
    ctx.B.box(M.concrete, P[0] + dx, y, P[1] + dz, P[2] + dx, y + 0.45, P[3] + dz, { col: [0.6, 0.57, 0.53], rot: r, skip: '' });
    ctx.B.box(M.plain, P[0] + dx + 0.5, y + 0.45, P[1] + dz + 0.5, P[2] + dx - 0.5, y + 0.95, P[3] + dz - 0.5, { col: [0.12, 0.11, 0.1], rot: r, skip: 'tb' });
  }
  ctx.solid(P[0] - 0.7, P[1] - 0.7, P[2] + 0.7, P[3] + 0.7, 6);
  ctx.mapRect(P[0], P[1], P[2], P[3], DSTYLE.ruins.bmap);
  ctx.W.addFire((P[0] + P[2]) / 2, Y + 6, (P[1] + P[3]) / 2, 1.4);
  // ぎざぎざの こわれたビル
  ruinB(ctx, [x0 + 4, z1 - 26, x0 + 18, z1 - 4], Y + 24);
  ruinB(ctx, [x0 + 22, z1 - 20, x0 + 36, z1 - 4], Y + 17);
  ruinB(ctx, [x1 - 18, z1 - 24, x1 - 4, z1 - 4], Y + 28);
  ruinB(ctx, [x1 - 13, z0 + 4, x1 - 4, z0 + 22], Y + 19);
  for (let k = 0; k < 24; k++) { const x = x0 + 4 + rnd() * (x1 - x0 - 8), z = z0 + 4 + rnd() * (z1 - z0 - 8); if (ctx.isFree(x, z, 1.5)) chunk(ctx, x, z, 0.5 + rnd() * 1.3, rnd() < 0.3); }
  for (let k = 0; k < 10; k++) decal(ctx, pick(ctx, [3, 7, 0, 4]), x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 4 + rnd() * (z1 - z0 - 8), 3 + rnd() * 4, rnd() * 6, Y + 0.012);
  ctx.W.addFire(x0 + 28, Y + 0.3, z1 - 10, 1.1);
}
// 崩れた高架(高架道路の一部が 落ちている)。world-town.js の overpass から呼ぶ
export function brokenOverpass(ctx, Z, W, Y0, Y1, xa, xb) {
  const { M, rnd } = ctx;
  const mk = (x0, y0, x1, y1, tw) => {
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
    const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, Z).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeRotationX(tw));
    withMatrix(ctx, m, () => {
      ctx.B.box(M.concrete, -len / 2, -0.6, -W, len / 2, 0.6, W, { top: M.asphalt, col: [0.6, 0.58, 0.55], skip: '' });
      ctx.B.box(M.concrete, -len / 2, 0.6, W - 0.4, len / 2, 1.6, W, { col: [0.6, 0.58, 0.55] });
      ctx.B.box(M.concrete, -len / 2, 0.6, -W, len / 2, 1.6, -W + 0.4, { col: [0.6, 0.58, 0.55] });
      for (let k = 0; k < 10; k++) beam(ctx.B, M.plain, [(rnd() - 0.5) * 0.4 + (y1 < y0 ? len / 2 : -len / 2), 0, (rnd() - 0.5) * W * 2], [(y1 < y0 ? len / 2 + 1 + rnd() : -len / 2 - 1 - rnd()), rnd() * 1.5 - 0.5, (rnd() - 0.5) * W * 2], 0.06, [0.35, 0.18, 0.1]);
    }, (x0 + x1) / 2, Z);
  };
  const mid = (xa + xb) / 2;
  mk(xa, Y1 - 0.6, mid - 3, 0.9, 0.06);
  mk(xb, Y1 - 0.6, mid + 5, 2.2, -0.05);
  // 落ちた所: 当たり判定(地面に近い所)とがれき
  ctx.solid(mid - 8, Z - W, mid - 2, Z + W, 3);
  ctx.solid(mid + 4, Z - W, mid + 9, Z + W, 3);
  for (let k = 0; k < 22; k++) chunk(ctx, mid - 6 + rnd() * 14, Z + (rnd() - 0.5) * W * 2.4, 0.6 + rnd() * 1.6, rnd() < 0.25);
  ctx.W.addFire(mid + 1, Y + 0.2, Z + 2, 1.4);
  decal(ctx, 7, mid, Z, 16, 0, 0.03);
  ctx.mapRect(mid - 8, Z - W, mid + 9, Z + W, '#3a2418');
}

// ================= 中に入れる店 =================
// 壁の外側に アトラスのマスを貼る建物(世界の座標で そろえる)
class DBld extends Bld {
  _skin(bld, alongX, c, p0, p1, y0, y1, ext) {
    const t = this.t, bay = this.bay || 4, rows = this.rows;
    const off = c + ext * (t / 2 + 0.02);
    const bk = bld.bucket(this.ctx.M.facade, alongX ? (p0 + p1) / 2 : off, alongX ? off : (p0 + p1) / 2);
    const neg = alongX ? ext < 0 : ext > 0;          // 右向きが 座標の マイナス
    const rx = alongX ? (neg ? -1 : 1) : 0, rz = alongX ? 0 : (neg ? -1 : 1);
    for (let ci = Math.floor(p0 / bay); ci * bay < p1; ci++) {
      const qa = Math.max(p0, ci * bay), qb = Math.min(p1, (ci + 1) * bay);
      if (qb - qa < 0.01) continue;
      for (let r = 0; r < rows.length; r++) {
        const [ra, rb, tiles] = rows[r];
        const ya = Math.max(y0, ra), yb = Math.min(y1, rb);
        if (yb - ya < 0.01) continue;
        const h = ((ci * 73856093) ^ (r * 19349663) ^ ((alongX ? 1 : 2) * ext * 83492791)) >>> 0;
        const uv = tileUV(tiles[h % tiles.length]);
        const fa = neg ? ((ci + 1) * bay - qb) / bay : (qa - ci * bay) / bay, fb = neg ? ((ci + 1) * bay - qa) / bay : (qb - ci * bay) / bay;
        const va = (ya - ra) / (rb - ra), vb = (yb - ra) / (rb - ra);
        const u0 = uv[0] + (uv[2] - uv[0]) * fa, u1 = uv[0] + (uv[2] - uv[0]) * fb, v0 = uv[1] + (uv[3] - uv[1]) * va, v1 = uv[1] + (uv[3] - uv[1]) * vb;
        const sx = alongX ? (neg ? qb : qa) : off, sz = alongX ? off : (neg ? qb : qa);
        bld.face(bk, sx, ya, sz, rx, 0, rz, 0, 1, 0, qb - qa, yb - ya, u0, v0, u1, v1, this.skinCol, null);
      }
    }
  }
}
// パチンコ店(ネオン繁華街の北。入口は北の大通り)
function pachinko(ctx) {
  const { M, rnd } = ctx;
  const x0 = 121, x1 = 169, z0 = -31, z1 = -8, h = 6.6;
  const B = new DBld(ctx, { name: 'パチンコ店', x0, z0, x1, z1, h, y0: Y, bay: 4, rows: [[0, 4.6, [41]], [4.6, 20, [11, 8, 11]]], skinCol: [1, 1, 1], floor: M.tile, floorCol: [0.42, 0.18, 0.2], wallCol: [0.7, 0.6, 0.62], wall: M.plaster, ceilCol: [0.35, 0.3, 0.32] });
  B.shell([{ side: 'N', at: 145, w: 8 }, { side: 'W', at: -20, w: 4 }, { side: 'E', at: -20, w: 4 }, { side: 'S', at: 145, w: 5 }]);
  // 台の列(背中あわせ。前が光る)
  for (const z of [-25.5, -19.8, -14.1]) for (const [a, b] of [[125.5, 143], [147, 164.5]]) {
    ctx.B.box(M.plain, a, Y, z - 0.75, b, Y + 1.9, z + 0.75, { col: [0.55, 0.12, 0.15] });
    for (let x = a + 0.3; x < b - 0.5; x += 0.9) for (const s of [-1, 1]) ctx.B.wall(M.glow, x + 0.3, Y + 0.95, z + s * 0.77, 0, s, 0.55, 0.7, { col: pick(ctx, [[1.3, 0.9, 0.25], [1.1, 0.3, 0.9], [0.3, 1.1, 1.3]]) });
    ctx.B.box(M.plain, a, Y + 1.9, z - 0.1, b, Y + 2.0, z + 0.1, { col: [0.85, 0.7, 0.2] });
    ctx.solid(a, z - 0.75, b, z + 0.75, 1.9, B.b);
  }
  B.prop('counter', 133, -10.4, 0, { col: [0.85, 0.75, 0.3] }); B.prop('counter', 157, -10.4, 0, { col: [0.85, 0.75, 0.3] });
  for (let x = 128; x < 166; x += 12) for (const z of [-22.6, -11.4]) B.light(x, z, 4.5, [0.26, 0.16, 0.2]);
  B.flatRoof({ ac: 4 });
  // 屋上の大きな看板と 電球
  B.RB.box(M.plain, 132, h + 0.4, z0 + 0.2, 158, h + 4.4, z0 + 0.6, { col: [0.15, 0.1, 0.12] });
  B.RB.wall(M.sign, 145, h + 0.6, z0 + 0.15, 0, -1, 25, 3.6, { uv: signUVOf(SG['パチンコ 大当り']), col: [1.5, 1.5, 1.5] });
  for (let x = x0; x <= x1; x += 1.2) B.RB.box(M.glow, x - 0.1, h + 0.45, z0 - 0.15, x + 0.1, h + 0.65, z0 + 0.05, { col: rnd() < 0.5 ? [3, 2.4, 1] : [3, 0.6, 0.8] });
  B.finish();
  pool(ctx, 145, -37, 7, [0.35, 0.22, 0.1], Y + 0.03);
  for (let k = 0; k < 6; k++) ctx.prop('bicycle', 128 + k * 1.1, -33.8, Math.PI / 2, { y: Y, col: pick(ctx, [[0.8, 0.1, 0.1], [0.2, 0.3, 0.6], [0.85, 0.85, 0.85]]) });
  ctx.prop('vending', 160, -32.5, Math.PI, { y: Y, col: [0.9, 0.15, 0.12] }); ctx.prop('vending', 161.2, -32.5, Math.PI, { y: Y, col: [0.2, 0.4, 0.8] });
}
// 中華料理店(中華街の広場の南)
function chinaRestaurant(ctx) {
  const { M } = ctx;
  const x0 = -18, x1 = 18, z0 = 79, z1 = 103, h = 6;
  const B = new DBld(ctx, { name: '中華料理店', x0, z0, x1, z1, h, y0: Y, bay: 3.4, rows: [[0, 4.4, [45, 46]], [4.4, 20, [18, 16, 20]]], skinCol: [1, 1, 1], floor: M.woodFloor, floorCol: [0.65, 0.3, 0.22], wallCol: [0.9, 0.7, 0.6], wall: M.plaster });
  B.shell([{ side: 'N', at: 0, w: 6 }, { side: 'W', at: 91, w: 3.5 }, { side: 'E', at: 91, w: 3.5 }, { side: 'S', at: 0, w: 3.5 }]);
  for (const x of [-12, -6, 0, 6, 12]) for (const z of [85, 91, 97]) { if (x === 0 && z === 85) continue; B.prop('table', x, z, 0, { col: [0.6, 0.12, 0.1] }); }
  B.prop('counter', -10, 101.2, 0, { col: [0.75, 0.55, 0.2] }); B.prop('counter', 10, 101.2, 0, { col: [0.75, 0.55, 0.2] });
  for (const x of [-12, -4, 4, 12]) for (const z of [84, 92, 99]) B.light(x, z, 4, [0.5, 0.18, 0.08]);
  // 中華の屋根(屋根のまとまりに入れる = 中に入ると消える)
  const B0 = ctx.B; ctx.B = B.RB;
  hip(ctx, x0, z0, x1, z1, h, 4.2, { roofTile: 57, over: 1.6, ridgeCol: [0.8, 0.6, 0.15], ends: [0.85, 0.65, 0.2] });
  B.RB.wall(M.sign, 0, 4.5, z0 - 0.3, 0, -1, 6, 1.5, { uv: signUVOf(SG['金福楼']), col: [1.3, 1.3, 1.3] });
  ctx.B = B0;
  for (const x of [-15, -9, 9, 15]) lantern(ctx, x, Y + 4.4, z0 - 0.9, 1.1);
  B.finish();
  pool(ctx, 0, z0 - 3, 6, [0.32, 0.08, 0.03], Y + 0.03);
}
export { DBld };
