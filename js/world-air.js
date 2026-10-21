// マップ係: 空港(北西)と 軍の基地(北東)。川の北。
//  空港: 滑走路(夜は光る)・誘導路・駐機場の旅客機・墜落した旅客機(燃えている)・ターミナル(中に入れる)・管制塔・格納庫(中に入れる)
//  軍の基地: 塀と門・見はり塔(サーチライト)・戦車・ジープ・ヘリ・兵舎(中に入れる)・燃料タンクと弾薬(爆発する)・レーダー
import * as THREE from 'three';
import { decal, pool, lamp } from './world-town.js';
import { Bld } from './world-interiors.js';
import { OUT } from './world-outer.js';

const _m = new THREE.Matrix4();
const OLIVE = [0.32, 0.36, 0.22], SAND = [0.62, 0.55, 0.4];

export function genAirport(ctx) {
  const { B, M, rnd, W } = ctx;
  const [x0, z0, x1, z1] = OUT.airport;
  const RW0 = -592, RW1 = -562, RX0 = -580, RX1 = 96;
  // 滑走路
  for (let x = RX0; x < RX1; x += 40) { const xb = Math.min(RX1, x + 40); B.flat(M.asphalt, (x + xb) / 2, 0.02, (RW0 + RW1) / 2, xb - x, RW1 - RW0, { col: [0.75, 0.75, 0.78] }); }
  const wh = [0.92, 0.92, 0.9];
  for (let x = RX0 + 50; x < RX1 - 50; x += 30) B.flat(M.paint, x + 7.5, 0.03, (RW0 + RW1) / 2, 15, 0.9, { col: wh });
  for (const z of [RW0 + 1.2, RW1 - 1.2]) B.flat(M.paint, (RX0 + RX1) / 2, 0.03, z, RX1 - RX0 - 4, 0.6, { col: wh });
  for (const xe of [RX0 + 6, RX1 - 30]) for (let z = RW0 + 4; z < RW1 - 4; z += 2.6) B.flat(M.paint, xe + 12, 0.03, z, 24, 1.3, { col: wh });
  // 滑走路の灯(夜に光る)・進入灯
  for (let x = RX0 + 4; x < RX1; x += 22) for (const z of [RW0 - 0.6, RW1 + 0.6]) B.box(M.glow, x - 0.2, 0, z - 0.2, x + 0.2, 0.35, z + 0.2, { col: [3, 2.6, 1.4] });
  for (let i = 0; i < 8; i++) for (const dz of [-6, 0, 6]) { const x = RX1 + 6 + i * 5; B.box(M.glow, x - 0.25, 0, (RW0 + RW1) / 2 + dz - 0.25, x + 0.25, 0.5, (RW0 + RW1) / 2 + dz + 0.25, { col: [3.5, 0.6, 0.3] }); }
  ctx.occupy(RX0, RW0 - 2, RX1, RW1 + 2);
  ctx.mapRect(RX0, RW0, RX1, RW1, '#6a6a70');
  // 誘導路・駐機場
  const TW0 = -554, TW1 = -544;
  for (let x = -560; x < 90; x += 40) B.flat(M.asphalt, x + 20, 0.022, (TW0 + TW1) / 2, 40, TW1 - TW0, { col: [0.7, 0.7, 0.72] });
  for (const x of [-540, -230, 60]) B.flat(M.asphalt, x, 0.021, (RW1 + TW0) / 2, 12, TW0 - RW1 + 0.5, { col: [0.7, 0.7, 0.72] });
  for (let x = -560; x < 90; x += 6) B.flat(M.paint, x + 1.5, 0.032, (TW0 + TW1) / 2, 3, 0.25, { col: [0.95, 0.8, 0.15] });
  for (let x = -330; x < 100; x += 40) B.flat(M.floorC, x + 20, 0.018, -527, 40, 34, { col: [0.62, 0.62, 0.6] });
  ctx.occupy(-560, TW0 - 1, 100, -510);
  ctx.mapRect(-560, TW0, 90, TW1, '#5a5a60'); ctx.mapRect(-330, -544, 100, -510, '#707070');
  // 駐機場の旅客機(こわせる・大爆発)とタンクローリー・カート
  ctx.prop('plane', -120, -527, 0.0, {});
  ctx.prop('plane', -10, -527, 0.08, {});
  for (const [x, z, r] of [[-96, -514, 0.2], [14, -515, -0.3], [-150, -540, 1.6]]) ctx.prop('tanker', x, z, r, { col: [0.9, 0.85, 0.2] });
  for (let k = 0; k < 8; k++) ctx.prop('cart', -200 + rnd() * 120, -518 + rnd() * 6, rnd() * 0.5);
  for (const x of [-140, -28]) for (let k = 0; k < 4; k++) ctx.prop('cone', x + k * 3, -520, 0, { solid: false });
  // 墜落した旅客機(滑走路の西。燃えている)
  crash(ctx, -390, -577);
  // ターミナル(中に入れる。北が ガラス)
  const T = new Bld(ctx, { name: '空港ターミナル', x0: -310, z0: -508, x1: -196, z1: -484, h: 9, y0: 0.05, skin: M.office, skinCol: [0.85, 0.92, 1], skinS: [12, 14], floor: M.tile, floorCol: [0.92, 0.92, 0.9], wallCol: [0.92, 0.93, 0.95], roofCol: [0.7, 0.72, 0.75] });
  T.shell([{ side: 'N', at: -280, w: 8 }, { side: 'N', at: -226, w: 8 }, { side: 'S', at: -253, w: 10 }, { side: 'W', at: -496, w: 5 }, { side: 'E', at: -496, w: 5 }]);
  T.sign('S', -253, 14, [0.4, 1.4, 3.2], 6.6); T.sign('N', -253, 10, [3, 2.4, 0.6], 6.6);
  for (let x = -300; x < -200; x += 10) for (const z of [-503, -489]) T.column(x, z, 0.4, 9, [0.85, 0.85, 0.88]);
  for (let x = -302; x < -205; x += 7) for (const z of [-499, -493]) { if (Math.abs(x + 253) < 7) continue; T.prop('pew', x, z, z < -496 ? 0 : Math.PI, { s: 0.75, col: [0.3, 0.3, 0.35] }); }
  for (const x of [-290, -270, -236, -216]) T.prop('counter', x, -487.5, 0, { col: [0.25, 0.4, 0.7] });
  for (let k = 0; k < 10; k++) T.prop('cart', -300 + rnd() * 95, -500 + rnd() * 12, rnd() * 3);
  for (let x = -305; x < -200; x += 10) T.light(x, -496, 6, [0.32, 0.35, 0.4]);
  for (let k = 0; k < 10; k++) decal(ctx, [1, 2, 9, 3][k % 4], -305 + rnd() * 105, -506 + rnd() * 20, 1.6 + rnd() * 2, rnd() * 6, 0.07);
  T.flatRoof({ ac: 5 });
  T.finish();
  // 管制塔
  const cx = -175, cz = -498;
  B.geom(M.concrete, new THREE.CylinderGeometry(2.6, 3.4, 32, 10), _m.makeTranslation(cx, 16, cz), { col: [0.82, 0.8, 0.76] });
  B.geom(M.plain, new THREE.CylinderGeometry(6, 4.5, 2, 10), _m.makeTranslation(cx, 33, cz), { col: [0.8, 0.8, 0.82] });
  B.geom(M.glow, new THREE.CylinderGeometry(6, 6, 3.4, 10, 1, true), _m.makeTranslation(cx, 35.7, cz), { col: [0.4, 1.2, 1.6] });
  B.geom(M.plain, new THREE.CylinderGeometry(6.4, 6.4, 0.6, 10), _m.makeTranslation(cx, 37.7, cz), { col: [0.6, 0.6, 0.62] });
  B.box(M.plain, cx - 0.12, 38, cz - 0.12, cx + 0.12, 44, cz + 0.12, { col: [0.4, 0.4, 0.4] });
  B.box(M.glow, cx - 0.3, 44, cz - 0.3, cx + 0.3, 44.6, cz + 0.3, { col: [4, 0.3, 0.2] });
  ctx.solid(cx - 3.4, cz - 3.4, cx + 3.4, cz + 3.4, 38);
  W.addSpinner({ kind: 'beacon', x: cx, y: 40, z: cz });
  ctx.mapCircle(cx, cz, 4, '#d0d0e0');
  // 格納庫(中に入れる)
  const H = new Bld(ctx, { name: '格納庫', x0: -566, z0: -534, x1: -500, z1: -486, h: 14, y0: 0.02, skin: M.metal, skinCol: [0.6, 0.64, 0.68], skinS: [6, 14], wall: M.metal, wallCol: [0.72, 0.72, 0.7], floor: M.floorC, floorCol: [0.8, 0.8, 0.78], roofCol: [0.45, 0.48, 0.52] });
  H.shell([{ side: 'N', at: -533, w: 34 }, { side: 'S', at: -520, w: 5 }, { side: 'E', at: -496, w: 5 }]);
  H.prop('heli', -540, -510, 0.4, { col: [0.85, 0.85, 0.85] });
  H.prop('jeep', -520, -496, 1.4, { col: [0.75, 0.75, 0.72] });
  H.prop('tanker', -555, -495, 0, { col: [0.9, 0.85, 0.2] });
  for (let k = 0; k < 10; k++) { const x = -562 + rnd() * 58, z = -490 + rnd() * 3; H.prop(k % 3 ? 'crate' : 'barrel', x, z, rnd() * 3, { col: [0.8, 0.65, 0.45], stack: k % 3 ? 1 + Math.floor(rnd() * 2) : 1 }); }
  for (let x = -560; x < -500; x += 12) for (const z of [-524, -504]) H.light(x, z, 7, [0.33, 0.33, 0.34]);
  H.flatRoof({ ac: 2, sky: 3, mat: M.metal });
  H.finish();
  // 吹き流し・空港の外灯
  B.box(M.plain, 80, 0, -505, 80.15, 7, -504.85, { col: [0.8, 0.8, 0.8] });
  B.geom(M.plain, new THREE.ConeGeometry(0.6, 3.5, 8, 1, true).rotateZ(Math.PI / 2), _m.makeTranslation(81.8, 6.6, -505), { col: [0.95, 0.45, 0.1] });
  for (let x = -320; x < 100; x += 40) lamp(ctx, x, -511, -Math.PI / 2);
  ctx.mapRect(-310, -508, -196, -484, '#9090a0');
  void x0; void z0; void x1; void z1; void pool;
}

// 墜落した旅客機: 2 つに折れた胴体・ちぎれた翼・燃える火
function crash(ctx, x, z) {
  const { B, M, rnd } = ctx;
  const burnt = [0.16, 0.15, 0.15], W = [0.6, 0.6, 0.62];
  const f1 = new THREE.CylinderGeometry(2.2, 2.2, 16, 14, 1, true); f1.rotateZ(Math.PI / 2);
  B.geom(M.plain, f1, _m.makeRotationY(0.25).setPosition(x - 8, 2.0, z), { col: W });
  B.geom(M.plain, new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).scale(1.9, 1, 1), _m.makeRotationY(0.25).setPosition(x - 16, 2.0, z + 2), { col: W });
  const f2 = new THREE.CylinderGeometry(2.2, 1.0, 14, 14, 1, true); f2.rotateZ(Math.PI / 2);
  B.geom(M.plain, f2, _m.makeRotationFromEuler(new THREE.Euler(0, -0.5, 0.12)).setPosition(x + 12, 2.2, z - 3), { col: burnt });
  B.geom(M.plain, new THREE.BoxGeometry(4, 6, 0.35), _m.makeRotationFromEuler(new THREE.Euler(0.3, -0.5, -0.45)).setPosition(x + 19, 5.5, z - 6), { col: [0.15, 0.25, 0.55] });
  B.geom(M.plain, new THREE.BoxGeometry(5, 0.4, 15), _m.makeRotationFromEuler(new THREE.Euler(0.1, 0.4, 0.15)).setPosition(x - 4, 0.6, z + 10), { col: burnt });
  B.geom(M.plain, new THREE.BoxGeometry(5, 0.4, 12), _m.makeRotationFromEuler(new THREE.Euler(-0.2, -0.2, 0)).setPosition(x + 2, 0.4, z - 13), { col: W });
  B.geom(M.plain, new THREE.CylinderGeometry(0.95, 0.95, 3.6, 12).rotateZ(Math.PI / 2), _m.makeTranslation(x + 4, 0.9, z + 16), { col: burnt });
  ctx.solid(x - 17, z - 2, x + 1, z + 3, 4.2); ctx.solid(x + 5, z - 7, x + 19, z + 1, 4.2);
  for (let k = 0; k < 8; k++) ctx.prop('rubble', x - 20 + rnd() * 45, z - 14 + rnd() * 28, rnd() * 6, { solid: false });
  decal(ctx, 7, x, z, 26, 0.3, 0.035); decal(ctx, 7, x + 14, z - 4, 14, 1.3, 0.036);
  for (const [fx, fz, s] of [[x + 10, z - 3, 2.4], [x - 4, z + 9, 1.6], [x + 4, z + 16, 1.2], [x - 9, z, 1.4]]) ctx.W.addFire(fx, 0.6, fz, s, 9e9);
  pool(ctx, x, z, 22, [0.9, 0.42, 0.1]);
  ctx.mapRect(x - 18, z - 4, x + 20, z + 4, '#3a3030');
}

export function genMilitary(ctx) {
  const { B, M, rnd, W } = ctx;
  const [x0, z0, x1, z1] = OUT.military;
  const WZ = z1 - 6;          // 塀(南)
  // 地面(土と コンクリートの区画)
  for (let x = x0; x < x1; x += 40) for (let z = z0; z < WZ; z += 40) B.flat(M.ground, x + 20, 0.008, Math.min(z + 20, (z + WZ) / 2 + 10), 40, Math.min(40, WZ - z), { col: [0.55, 0.5, 0.38] });
  for (const [a, b, c, d] of [[160, -572, 292, -514], [372, -580, 500, -512], [300, -556, 360, -520]]) { B.flat(M.floorC, (a + c) / 2, 0.014, (b + d) / 2, c - a, d - b, { col: [0.55, 0.55, 0.52] }); ctx.mapRect(a, b, c, d, '#6a6a60'); }
  ctx.mapRect(x0, z0, x1, WZ, '#4a4a36');
  // 塀(有刺鉄線)と門
  const wall = (xa, za, xb, zb) => {
    const alongX = Math.abs(xb - xa) > Math.abs(zb - za);
    if (alongX) { B.box(M.concrete, xa, 0, za - 0.3, xb, 3, za + 0.3, { col: [0.55, 0.54, 0.5] }); ctx.solid(xa, za - 0.3, xb, za + 0.3, 3); for (let x = xa; x < xb; x += 3) B.box(M.plain, x - 0.03, 3, za - 0.03, x + 0.03, 3.9, za + 0.03, { col: [0.2, 0.2, 0.2] }); for (const y of [3.4, 3.8]) B.box(M.plain, xa, y, za - 0.02, xb, y + 0.03, za + 0.02, { col: [0.25, 0.25, 0.25], skip: '' }); }
    else { B.box(M.concrete, xa - 0.3, 0, za, xa + 0.3, 3, zb, { col: [0.55, 0.54, 0.5] }); ctx.solid(xa - 0.3, za, xa + 0.3, zb, 3); for (let z = za; z < zb; z += 3) B.box(M.plain, xa - 0.03, 3, z - 0.03, xa + 0.03, 3.9, z + 0.03, { col: [0.2, 0.2, 0.2] }); for (const y of [3.4, 3.8]) B.box(M.plain, xa - 0.02, y, za, xa + 0.02, y + 0.03, zb, { col: [0.25, 0.25, 0.25], skip: '' }); }
    ctx.mapLine(xa, za, xb, zb, 1.5, '#aaa498');
  };
  wall(x0, WZ, 292, WZ); wall(308, WZ, 420, WZ); wall(432, WZ, x1, WZ);
  wall(x0, z0, x0, -520); wall(x0, -508, x0, WZ); wall(x1, z0, x1, WZ);
  // 門の小屋と遮断機
  B.box(M.plain, 309, 0, WZ - 5, 313, 3, WZ - 1, { col: [0.75, 0.73, 0.66] }); B.box(M.plain, 308.6, 3, WZ - 5.4, 313.4, 3.3, WZ - 0.6, { col: [0.3, 0.32, 0.25], skip: '' });
  B.box(M.plain, 309.0, 1.3, WZ - 1.04, 313, 2.4, WZ - 0.98, { col: [0.06, 0.08, 0.1] }); ctx.solid(309, WZ - 5, 313, WZ - 1, 3.3);
  B.box(M.plain, 294, 1.0, WZ - 0.1, 307, 1.2, WZ + 0.1, { col: [0.9, 0.15, 0.1] });
  ctx.prop('sandbag', 300, WZ - 9, 0); ctx.prop('jersey', 290, WZ + 4, 0); ctx.prop('jersey', 312, WZ + 4, 0);
  // 見はり塔(サーチライト)
  for (const [x, z] of [[156, WZ - 8], [500, WZ - 8], [156, z0 + 10], [500, z0 + 10], [262, z0 + 10]]) watchtower(ctx, x, z);
  // 戦車・ジープ(こわせる)
  for (let k = 0; k < 6; k++) ctx.prop('tank', 176 + (k % 3) * 40, -556 + Math.floor(k / 3) * 26, (rnd() - 0.5) * 0.3, { col: OLIVE });
  for (let k = 0; k < 6; k++) ctx.prop('jeep', 170 + k * 20, -522, Math.PI / 2 + (rnd() - 0.5) * 0.2, { col: rnd() < 0.3 ? SAND : OLIVE });
  // ヘリポートとヘリ
  for (const [x, z] of [[392, -560], [432, -560], [472, -560]]) {
    B.flat(M.paint, x, 0.02, z, 16, 16, { col: [0.25, 0.25, 0.27] });
    for (let a = 0; a < 32; a++) { const t = a / 32 * Math.PI * 2; B.flat(M.paint, x + Math.cos(t) * 6.5, 0.024, z + Math.sin(t) * 6.5, 1.3, 0.35, { rot: -t + Math.PI / 2, col: [0.95, 0.85, 0.2] }); }
    B.flat(M.paint, x - 2, 0.026, z, 0.7, 5, { col: [0.95, 0.95, 0.95] }); B.flat(M.paint, x + 2, 0.026, z, 0.7, 5, { col: [0.95, 0.95, 0.95] }); B.flat(M.paint, x, 0.026, z, 4, 0.7, { col: [0.95, 0.95, 0.95] });
    ctx.prop('heli', x, z, rnd() * 6, { col: OLIVE });
    ctx.mapCircle(x, z, 7, '#8a8a70');
  }
  // 兵舎(中に入れる)
  const Bk = new Bld(ctx, { name: '兵舎', x0: 300, z0: -552, x1: 360, z1: -524, h: 4.5, y0: 0.05, skin: M.concrete, skinCol: [0.62, 0.62, 0.52], skinS: [6, 6], floor: M.floorC, floorCol: [0.7, 0.7, 0.65], wallCol: [0.8, 0.8, 0.72], roofCol: [0.4, 0.42, 0.32] });
  Bk.shell([{ side: 'S', at: 330, w: 5 }, { side: 'N', at: 330, w: 4 }, { side: 'W', at: -538, w: 4 }, { side: 'E', at: -538, w: 4 }]);
  Bk.wallZ(330, -551.5, -524.5, [[-538, 4]]);
  for (let x = 303; x < 357; x += 3) { if (Math.abs(x - 330) < 3) continue; Bk.prop('bed', x, -549.5, Math.PI / 2); Bk.prop('bed', x, -526.5, Math.PI / 2); }
  for (const x of [305, 318, 342, 355]) Bk.prop('locker', x, -538, 0);
  Bk.prop('ammo', 326, -530, 0); Bk.prop('ammo', 334, -546, 0);
  for (let x = 306; x < 360; x += 10) Bk.light(x, -538, 5, [0.36, 0.36, 0.3]);
  Bk.flatRoof({ ac: 2 });
  Bk.finish();
  // 燃料タンクと弾薬(大爆発)
  for (const [x, z] of [[392, -520], [412, -520], [432, -520]]) ctx.prop('fueltank', x, z, 0, {});
  for (let k = 0; k < 12; k++) ctx.prop('ammo', 452 + (k % 4) * 2.4, -524 + Math.floor(k / 4) * 1.6, 0, {});
  for (let k = 0; k < 8; k++) ctx.prop(k % 2 ? 'barrel' : 'propane', 476 + rnd() * 20, -526 + rnd() * 14, rnd() * 6, { col: OLIVE });
  ctx.prop('tanker', 470, -506, Math.PI, { col: OLIVE });
  // 土のうの陣地・テント・旗
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; ctx.prop('sandbag', 230 + Math.cos(a) * 14, -500 + Math.sin(a) * 8, -a + Math.PI / 2); }
  for (const [x, z] of [[200, -498], [262, -500], [196, -588], [240, -588]]) ctx.prop('tent', x, z, 0, { col: OLIVE });
  for (const x of [380, 386, 392]) { B.box(M.plain, x - 0.08, 0, -503, x + 0.08, 10, -502.84, { col: [0.75, 0.75, 0.75] }); B.box(M.plain, x + 0.08, 8, -502.95, x + 2.8, 9.7, -502.89, { col: [[0.2, 0.3, 0.6], [0.9, 0.9, 0.9], [0.8, 0.15, 0.1]][(x / 6 | 0) % 3] }); }
  // レーダー(回る)
  B.box(M.concrete, 324, 0, -590, 336, 8, -580, { col: [0.6, 0.6, 0.55] }); ctx.solid(324, -590, 336, -580, 8);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8, 0, Math.PI * 2, 0, 1.1).rotateX(-Math.PI / 2).scale(1, 1, 0.5), M.plainNoCut);
  dish.position.set(330, 12, -585); dish.castShadow = true;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 8), M.plainNoCut); post.position.set(330, 10, -585);
  W.group.add(dish, post);
  W.addSpinner({ kind: 'radar', x: 330, z: -585, obj: dish });
  // 照明
  for (let x = 170; x < 500; x += 40) lamp(ctx, x, -510, Math.PI / 2);
  for (let k = 0; k < 20; k++) decal(ctx, [0, 10, 6, 7][k % 4], x0 + 10 + rnd() * (x1 - x0 - 20), z0 + 10 + rnd() * (WZ - z0 - 20), 3 + rnd() * 3, rnd() * 6, 0.02);
}

// 見はり塔(高さ 9m。屋根の上でサーチライトが まわる)
function watchtower(ctx, x, z) {
  const { B, M, W } = ctx, c = [0.42, 0.4, 0.32];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box(M.plain, x + sx * 1.8 - 0.15, 0, z + sz * 1.8 - 0.15, x + sx * 1.8 + 0.15, 9, z + sz * 1.8 + 0.15, { col: c }); ctx.solid(x + sx * 1.8 - 0.2, z + sz * 1.8 - 0.2, x + sx * 1.8 + 0.2, z + sz * 1.8 + 0.2, 9); }
  B.box(M.plain, x - 2.4, 9, z - 2.4, x + 2.4, 9.3, z + 2.4, { col: c, skip: '' });
  for (const s of [-1, 1]) { B.box(M.plain, x - 2.4, 9.3, z + s * 2.3 - 0.1, x + 2.4, 10.4, z + s * 2.3 + 0.1, { col: c }); B.box(M.plain, x + s * 2.3 - 0.1, 9.3, z - 2.4, x + s * 2.3 + 0.1, 10.4, z + 2.4, { col: c }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M.plain, x + sx * 2.2 - 0.07, 10.4, z + sz * 2.2 - 0.07, x + sx * 2.2 + 0.07, 12, z + sz * 2.2 + 0.07, { col: c });
  B.box(M.plain, x - 2.7, 12, z - 2.7, x + 2.7, 12.3, z + 2.7, { col: [0.3, 0.3, 0.26], skip: '' });
  for (let k = 0; k < 3; k++) { const y = 2.5 + k * 2.4; B.box(M.plain, x - 1.8, y, z - 1.8, x + 1.8, y + 0.12, z - 1.7, { col: c }); }
  W.addSpinner({ kind: 'search', x, y: 12.6, z });
  ctx.mapRect(x - 2.4, z - 2.4, x + 2.4, z + 2.4, '#c0b080');
}
