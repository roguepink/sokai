// マップ係: 港(東の海ぞい)。コンテナ置き場・巨大なクレーン・コンテナ船・港の倉庫(中に入れる)・燃料タンク群・桟橋・灯台・砂浜。
import * as THREE from 'three';
import { road } from './world-zones.js';
import { decal, pool, lamp } from './world-town.js';
import { Bld } from './world-interiors.js';
import { OUT, OUTER_MAP } from './world-outer.js';

const CC = [[0.7, 0.2, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.85, 0.5, 0.1], [0.55, 0.55, 0.58], [0.6, 0.15, 0.4], [0.85, 0.85, 0.82], [0.3, 0.3, 0.32]];
const _m = new THREE.Matrix4();

export function genHarbor(ctx) {
  const { B, M, rnd } = ctx;
  const [X0, Z0, , Z1] = OUT.harbor, X = OUT.SEA;
  // 地面(コンクリート)。南は砂浜
  for (let z = Z0; z < Z1; z += 40) for (let x = X0 - 4; x < X; x += 40) {
    const zb = Math.min(Z1, z + 40), xb = Math.min(X, x + 40);
    const beach = z >= 440;
    B.flat(beach ? M.ground : M.floorC, (x + xb) / 2, 0.006, (z + zb) / 2, xb - x, zb - z, { col: beach ? [0.85, 0.76, 0.55] : [0.5, 0.5, 0.48] });
  }
  ctx.mapRect(X0, Z0, X, 440, OUTER_MAP.harbor); ctx.mapRect(X0, 440, X, Z1, '#8a7a58');
  road(ctx, Z0 + 4, 440, 500, 6, false);
  for (let z = Z0 + 14; z < 440; z += 30) lamp(ctx, 507.5, z, Math.PI);
  // 岸壁の係留柱・黄色い線
  for (let z = Z0 + 6; z < 440; z += 12) { if (OUT.piers.some(([a, b]) => z > a - 3 && z < b + 3)) continue; ctx.prop('bollard', X - 1.6, z, 0); }
  // コンテナ置き場(北と南)
  const yard = (za, zb) => {
    for (let z = za; z < zb - 3; z += 2.7) {
      if (Math.floor((z - za) / 2.7) % 6 === 5) continue;      // 通路
      for (const x of [418, 432, 446, 460, 474]) {
        if (rnd() < 0.22) continue;
        const n = 1 + Math.floor(rnd() * (rnd() < 0.3 ? 4 : 3));
        ctx.prop('container', x + (rnd() - 0.5) * 0.3, z, (rnd() - 0.5) * 0.03, { stack: n, col: CC[Math.floor(rnd() * CC.length)] });
      }
    }
    ctx.mapRect(411, za, 481, zb, '#7a6050');
  };
  yard(-372, -62); yard(52, 300);
  // 燃料タンク群(北のはし。大爆発する)
  for (const [x, z] of [[418, -426], [432, -426], [446, -426], [418, -404], [432, -404], [446, -404]]) ctx.prop('fueltank', x, z, Math.PI / 2, {});
  for (const [x, z, r] of [[466, -420, 0.2], [472, -398, 1.4], [462, -386, 3.0]]) ctx.prop('tanker', x, z, r, { col: [0.9, 0.9, 0.88] });
  for (let k = 0; k < 10; k++) ctx.prop(k % 3 ? 'barrel' : 'propane', 480 + rnd() * 10, -430 + rnd() * 40, rnd() * 6, { col: [0.75, 0.15, 0.1] });
  decal(ctx, 11, 440, -392, 4, 0, 0.02);
  // 港の倉庫(中に入れる)
  const W = new Bld(ctx, { name: '港の倉庫', x0: 418, z0: -28, x1: 482, z1: 28, h: 11, y0: 0, skin: M.metal, skinCol: [0.45, 0.55, 0.62], skinS: [6, 11], wall: M.metal, wallCol: [0.7, 0.72, 0.72], floor: M.floorC, floorCol: [0.85, 0.85, 0.82], roofCol: [0.5, 0.52, 0.55] });
  W.shell([{ side: 'W', at: 0, w: 10 }, { side: 'E', at: 0, w: 10 }, { side: 'N', at: 450, w: 8 }, { side: 'S', at: 450, w: 8 }]);
  W.sign('E', 0, 6, [3, 2.2, 0.4], 8.5);
  for (let x = 426; x < 480; x += 13) for (const z of [-18, 18]) W.column(x, z, 0.4, 11, [0.6, 0.38, 0.15]);
  for (const z of [-24, -11, 11, 24]) for (const x of [428, 446, 466]) W.prop('rack', x, z, 0);
  W.prop('container', 440, -2, 0, { col: CC[1] }); W.prop('container', 466, 3, 0.1, { col: CC[3] });
  W.prop('forklift', 452, 4, 0.6); W.prop('forklift', 430, -4, 2.4);
  for (let k = 0; k < 14; k++) { const x = 422 + rnd() * 56, z = -6 + rnd() * 12; if (ctx.isFree(x, z, 1)) W.prop(k % 4 ? 'crate' : 'propane', x, z, rnd() * 3, { col: [0.8, 0.65, 0.45], stack: k % 4 ? 1 + Math.floor(rnd() * 2) : 1 }); }
  for (let x = 424; x < 480; x += 12) for (const z of [-18, 0, 18]) W.light(x, z, 7, [0.32, 0.33, 0.34]);
  for (let k = 0; k < 10; k++) decal(ctx, [0, 1, 2, 10][k % 4], 420 + rnd() * 60, -26 + rnd() * 52, 2 + rnd() * 2, rnd() * 6, 0.02);
  W.flatRoof({ ac: 3, sky: 4, mat: M.metal });
  W.finish();
  // 港の車
  for (const [x, z, r] of [[490, -120, 0], [490, 120, 0.1], [440, 330, 1.57], [488, 360, 0]]) ctx.prop('truck', x, z, r, { col: CC[Math.floor(rnd() * CC.length)] });
  ctx.prop('forklift', 486, -60, 1); ctx.prop('forklift', 488, 70, 2);
  for (let k = 0; k < 14; k++) { const x = 412 + rnd() * 80, z = -440 + rnd() * 860; if (ctx.isFree(x, z, 1.5)) ctx.prop(rnd() < 0.5 ? 'barrel' : 'crate', x, z, rnd() * 6, { col: rnd() < 0.5 ? [0.3, 0.45, 0.7] : [0.8, 0.65, 0.45] }); }
  // 巨大なクレーン(岸壁にまたがる)
  for (const z of [-24, 30, 84, 138]) gantry(ctx, z);
  // コンテナ船(岸壁につけてある)
  ship(ctx, 539, -70, 150);
  // 桟橋のボート・灯台
  for (const [a, b] of OUT.piers) for (const s of [-1, 1]) for (let x = X + 10; x < 585; x += 18) if (rnd() < 0.6) ctx.prop('boat', x, s < 0 ? a - 3 : b + 3, (rnd() - 0.5) * 0.3, { y: -1.75, static: true, solid: false, occupy: false, col: [[0.9, 0.9, 0.88], [0.2, 0.35, 0.6], [0.7, 0.2, 0.15]][Math.floor(rnd() * 3)] });
  lighthouse(ctx, 586, 560);
  // 砂浜: 引きあげたボート・小屋・見はり台
  for (let k = 0; k < 7; k++) ctx.prop('boat', 450 + rnd() * 60, 470 + rnd() * 110, rnd() * 6, { col: [[0.9, 0.9, 0.88], [0.2, 0.35, 0.6], [0.7, 0.2, 0.15]][k % 3] });
  for (const [x, z] of [[420, 470], [420, 520], [430, 575]]) { B.box(M.wood, x - 4, 0, z - 3, x + 4, 3, z + 3, { col: [0.55, 0.42, 0.3] }); B.box(M.plain, x - 4.5, 3, z - 3.5, x + 4.5, 3.3, z + 3.5, { col: [0.3, 0.45, 0.6], skip: '' }); ctx.solid(x - 4, z - 3, x + 4, z + 3, 3.3); ctx.mapRect(x - 4, z - 3, x + 4, z + 3, '#6a5444'); }
  { const x = 505, z = 520, c = [0.9, 0.9, 0.88]; for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M.plain, x + sx * 1.2 - 0.1, 0, z + sz * 1.2 - 0.1, x + sx * 1.2 + 0.1, 3, z + sz * 1.2 + 0.1, { col: c }); B.box(M.plain, x - 1.5, 3, z - 1.5, x + 1.5, 4.8, z + 1.5, { col: [0.85, 0.15, 0.1] }); ctx.solid(x - 1.4, z - 1.4, x + 1.4, z + 1.4, 3); }
  for (let k = 0; k < 30; k++) ctx.I.add('grass', 410 + rnd() * 30, 0, 450 + rnd() * 140, rnd() * 6, 1 + rnd() * 0.5);
}

// 巨大なクレーン(門の形。足は岸壁の上、腕は海の上へ)
function gantry(ctx, z) {
  const { B, M } = ctx, c = [0.85, 0.2, 0.12], w = [0.9, 0.9, 0.88], H = 34;
  for (const x of [507, 519]) for (const dz of [-6, 6]) { B.box(M.plain, x - 0.7, 0, z + dz - 0.7, x + 0.7, H, z + dz + 0.7, { col: c }); ctx.solid(x - 0.7, z + dz - 0.7, x + 0.7, z + dz + 0.7, H); }
  for (const dz of [-6, 6]) { B.box(M.plain, 506, 1.5, z + dz - 0.5, 520, 2.5, z + dz + 0.5, { col: c, skip: '' }); B.box(M.plain, 506, H - 2, z + dz - 0.6, 520, H, z + dz + 0.6, { col: c, skip: '' }); }
  for (const x of [507, 519]) B.box(M.plain, x - 0.6, H - 2, z - 6, x + 0.6, H, z + 6, { col: c, skip: '' });
  // 腕(海へ 60m、陸へ 25m)
  B.box(M.plain, 482, H + 2, z - 1.6, 578, H + 4, z - 0.8, { col: w, skip: '' }); B.box(M.plain, 482, H + 2, z + 0.8, 578, H + 4, z + 1.6, { col: w, skip: '' });
  for (let x = 484; x < 578; x += 6) B.box(M.plain, x, H + 1.6, z - 1.6, x + 0.3, H + 4, z + 1.6, { col: w, skip: '' });
  B.box(M.plain, 504, H, z - 6, 522, H + 2, z + 6, { col: c });
  B.box(M.plain, 509, H + 4, z - 3, 517, H + 8, z + 3, { col: [0.88, 0.88, 0.85] });
  B.box(M.glow, 512, H + 8, z - 0.3, 513, H + 8.5, z + 0.3, { col: [4, 0.3, 0.2] }); B.box(M.glow, 577, H + 4, z - 0.3, 578, H + 4.5, z + 0.3, { col: [4, 0.3, 0.2] });
  // 運転室とつり具
  B.box(M.plain, 540, H - 1, z - 1.5, 544, H + 1.6, z + 1.5, { col: [0.3, 0.3, 0.32] });
  B.box(M.plain, 541.8, 14, z - 0.05, 542.2, H - 1, z + 0.05, { col: [0.15, 0.15, 0.15] });
  ctx.prop('container', 542, z, Math.PI / 2, { y: 12, static: true, solid: false, occupy: false, col: CC[(z / 10 | 0) % CC.length] });
  ctx.mapRect(505, z - 7, 521, z + 7, '#c04030');
}

// コンテナ船: 船体・甲板のコンテナ・船橋・煙突
function ship(ctx, cx, za, zb) {
  const { B, M, rnd } = ctx, hw = 13, Y0 = -3, D = 9;
  const hull = [0.12, 0.18, 0.32], red = [0.5, 0.1, 0.08];
  B.box(M.plain, cx - hw, Y0, za + 14, cx + hw, D, zb, { col: hull, skip: '' });
  B.box(M.plain, cx - hw - 0.02, Y0, za + 14, cx + hw + 0.02, -0.9, zb, { col: red, skip: 'tb' });
  // 船首(とがった形)
  const g = new THREE.BufferGeometry(), y0 = Y0, y1 = D + 1.5, zt = za, zm = za + 14;
  const v = [cx - hw, y0, zm, cx + hw, y0, zm, cx, y0, zt + 4, cx - hw, y1, zm, cx + hw, y1, zm, cx, y1, zt];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 3, 3, 2, 5, 1, 4, 2, 4, 5, 2, 3, 5, 4]);
  g.computeVertexNormals();
  B.geom(M.plain, g.toNonIndexed(), new THREE.Matrix4(), { col: hull, bx: cx, bz: za + 10 });
  // 甲板のコンテナ
  for (let z = za + 16; z < zb - 34; z += 13) for (let x = cx - hw + 1.8; x < cx + hw - 1; x += 2.6) {
    if (rnd() < 0.08) continue;
    const n = 1 + Math.floor(rnd() * 5);
    ctx.prop('container', x, z + 6, Math.PI / 2, { y: D, stack: n, static: true, solid: false, occupy: false, col: CC[Math.floor(rnd() * CC.length)] });
  }
  // 船橋(うしろ)と煙突
  B.box(M.office, cx - hw + 1, D, zb - 30, cx + hw - 1, D + 22, zb - 18, { col: [0.95, 0.95, 0.92], top: M.roof });
  B.box(M.plain, cx - hw - 3, D + 19, zb - 30, cx + hw + 3, D + 19.6, zb - 22, { col: [0.9, 0.9, 0.88], skip: '' });
  B.box(M.plain, cx - 2.5, D, zb - 14, cx + 2.5, D + 26, zb - 8, { col: [0.85, 0.85, 0.82] });
  B.box(M.plain, cx - 2.55, D + 21, zb - 14.05, cx + 2.55, D + 24, zb - 7.95, { col: [0.75, 0.12, 0.1], skip: 'tb' });
  B.box(M.glow, cx - 0.4, D + 23, zb - 21, cx + 0.4, D + 23.6, zb - 20.4, { col: [4, 0.3, 0.2] });
  B.box(M.glow, cx - 0.5, D + 2, za + 3, cx + 0.5, D + 3, za + 4, { col: [0.3, 4, 0.5] });
  ctx.mapRect(cx - hw, za, cx + hw, zb, '#2a3550');
  void _m;
}

// 灯台(光の筋は world-life.js が回す)
function lighthouse(ctx, x, z) {
  const { B, M } = ctx;
  for (let i = 0; i < 6; i++) {
    const y0 = i * 4, r0 = 2.6 - i * 0.14, r1 = 2.6 - (i + 1) * 0.14;
    B.geom(M.plain, new THREE.CylinderGeometry(r1, r0, 4, 14), new THREE.Matrix4().makeTranslation(x, y0 + 2, z), { col: i % 2 ? [0.85, 0.15, 0.1] : [0.95, 0.95, 0.92] });
  }
  B.geom(M.plain, new THREE.CylinderGeometry(2.4, 2.4, 0.4, 14), new THREE.Matrix4().makeTranslation(x, 24.2, z), { col: [0.2, 0.2, 0.2] });
  B.geom(M.glow, new THREE.CylinderGeometry(1.3, 1.3, 2.4, 12), new THREE.Matrix4().makeTranslation(x, 25.6, z), { col: [3.5, 3, 1.8] });
  B.geom(M.plain, new THREE.ConeGeometry(1.8, 1.8, 12), new THREE.Matrix4().makeTranslation(x, 27.7, z), { col: [0.85, 0.15, 0.1] });
  ctx.solid(x - 2.6, z - 2.6, x + 2.6, z + 2.6, 24);
  pool(ctx, x, z, 8, [0.6, 0.55, 0.35]);
  ctx.W.addSpinner({ x, y: 25.6, z, kind: 'lighthouse' });
  ctx.mapCircle(x, z, 3, '#f0f0e0');
}
