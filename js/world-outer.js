// マップ係: 第2弾で広げた外まわり(一辺 1200m)。川と橋・海と岸壁・外へのびる道・農場・墓地。
// 港は world-harbor.js、遊園地は world-fun.js、空港と軍の基地は world-air.js。
//   北(z < -440): 川の向こうに 空港(西)と 軍の基地(東)
//   東(x > 404): 港。x > 520 は海
//   南(z > 400): 遊園地(西)と 墓地(東)
//   西(x < -404): 農場
import * as THREE from '../vendor/three/build/three.module.min.js';
import { road } from './world-zones.js';
import { decal, pool, lamp, padBox } from './world-town.js';
import { placeTree, placeFence } from './world-props.js';
import { Bld, house } from './world-interiors.js';
import { genHarbor } from './world-harbor.js';
import { genFun } from './world-fun.js';
import { genAirport, genMilitary } from './world-air.js';

export const OUT = {
  river: { z0: -472, z1: -440 },            // 川(東西)。x < SEA まで
  bridges: [-330, 40, 300],                 // 橋の中心(x)
  BW: 7,                                    // 橋の半分の幅
  SEA: 520,                                 // ここより東は海
  piers: [[-306, -294], [254, 266], [554, 566]],   // 桟橋(z の範囲。x は SEA .. 592)
  airport: [-592, -598, 112, -478],
  military: [148, -598, 508, -478],
  harbor: [404, -440, 520, 598],
  fun: [-402, 404, 12, 598],
  cemetery: [64, 412, 400, 596],
  farm: [-598, -440, -404, 404],
};
const inR = (r, x, z) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

// 外まわりの場所の種類(なければ null)
export function outerZone(x, z) {
  const O = OUT;
  if (x > O.SEA) {
    for (const [a, b] of O.piers) if (z >= a && z <= b && x < 592) return 'harbor';
    return 'sea';
  }
  if (z > O.river.z0 && z < O.river.z1) {
    for (const bx of O.bridges) if (Math.abs(x - bx) < O.BW) return 'bridge';
    return 'river';
  }
  if (inR(O.airport, x, z)) return 'airport';
  if (inR(O.military, x, z)) return 'military';
  if (inR(O.harbor, x, z)) return 'harbor';
  if (inR(O.fun, x, z)) return 'fun';
  if (inR(O.cemetery, x, z)) return 'cemetery';
  if (inR(O.farm, x, z)) return 'farm';
  return null;
}
export const OUTER_NAMES = { river: '川', bridge: '橋', sea: '海', harbor: '港', airport: '空港', military: '軍の基地', fun: '遊園地', cemetery: '墓地', farm: '農場' };
export const OUTER_GROUND = { airport: [0.4, 0.44, 0.3], military: [0.46, 0.43, 0.33], fun: [0.38, 0.45, 0.28], cemetery: [0.28, 0.33, 0.2], farm: [0.42, 0.42, 0.25] };
export const OUTER_MAP = { river: '#2d5a70', bridge: '#77736c', sea: '#1d4660', harbor: '#5f5c56', airport: '#3e4c30', military: '#4a4a36', fun: '#4a4560', cemetery: '#2a3424', farm: '#5a5230' };

export function genOuter(ctx) {
  river(ctx);
  sea(ctx);
  roads(ctx);
  genHarbor(ctx);
  genFun(ctx);
  genAirport(ctx);
  genMilitary(ctx);
  cemetery(ctx);
  farm(ctx);
}

// ---------------- 川と橋 ----------------
function river(ctx) {
  const { B, M, half, rnd } = ctx, O = OUT, { z0, z1 } = O.river, X1 = O.SEA, WY = -1.3;
  const conc = [0.55, 0.53, 0.5];
  const gaps = O.bridges.map((b) => [b - O.BW, b + O.BW]);
  // 水面と川底
  for (let x = -half; x < X1; x += 40) {
    const xb = Math.min(X1, x + 40);
    B.flat(M.water, (x + xb) / 2, WY, (z0 + z1) / 2, xb - x, z1 - z0);
    B.flat(M.ground, (x + xb) / 2, WY - 1.2, (z0 + z1) / 2, xb - x, z1 - z0, { col: [0.12, 0.13, 0.1] });
    // 岸の壁(水面から地面まで)と ふちの石
    for (const [zz, sgn] of [[z0, 1], [z1, -1]]) {
      B.box(M.concrete, x, WY - 1.3, sgn > 0 ? zz : zz - 0.5, xb, 0.02, sgn > 0 ? zz + 0.5 : zz, { col: conc, skip: 'b' + (x > -half ? 'w' : '') + (xb < X1 ? 'e' : '') });
      B.box(M.plainNoCut, x, 0, sgn > 0 ? zz - 0.6 : zz, xb, 0.35, sgn > 0 ? zz : zz + 0.6, { col: [0.62, 0.6, 0.56], skip: 'b' });
    }
  }
  // 手すり(橋のところは あける)
  for (const [zz, off] of [[z0, -0.3], [z1, 0.3]]) {
    for (let x = -half + 1; x < X1 - 1; x += 3) {
      if (gaps.some(([a, b]) => x > a - 1 && x < b + 1)) continue;
      B.box(M.plain, x - 0.05, 0.35, zz + off - 0.05, x + 0.05, 1.3, zz + off + 0.05, { col: [0.25, 0.27, 0.28] });
    }
    let xs = -half;
    for (const [a, b] of [...gaps, [X1, X1]]) {
      if (a - 1 > xs) B.box(M.plain, xs, 1.2, zz + off - 0.04, a - 1, 1.3, zz + off + 0.04, { col: [0.25, 0.27, 0.28], skip: '' });
      xs = b + 1;
    }
  }
  // 水の中は歩けない(橋は通れる)。低いので弾は こえる
  let xs = -half;
  for (const [a, b] of [...gaps, [X1, X1]]) { if (a > xs) ctx.solid(xs, z0 - 0.3, a, z1 + 0.3, 0.5); xs = b; }
  ctx.occupy(-half, z0 - 2, X1, z1 + 2);
  ctx.mapRect(-half, z0, X1, z1, OUTER_MAP.river);
  // 橋
  for (const bx of O.bridges) bridge(ctx, bx, z0, z1, WY);
  // 岸の草・岩・流れついた物
  for (let k = 0; k < 120; k++) {
    const x = -half + rnd() * (X1 + half), side = rnd() < 0.5 ? z0 - 2.5 - rnd() * 4 : z1 + 2.5 + rnd() * 4;
    if (gaps.some(([a, b]) => x > a - 3 && x < b + 3)) continue;
    if (rnd() < 0.6) ctx.I.add('grass', x, 0, side, rnd() * 6, 1 + rnd() * 0.6); else ctx.I.add('rock', x, 0, side, rnd() * 6, [0.5 + rnd() * 0.6, 0.4 + rnd() * 0.4, 0.5 + rnd() * 0.6]);
  }
  // 沈みかけた車(見た目だけ)
  for (const [x, z, r] of [[-180, -452, 0.5], [160, -462, 2.4], [-460, -448, 1.2]]) ctx.prop('sedan', x, z, r, { y: WY - 0.7, static: true, solid: false, occupy: false, col: [0.3, 0.25, 0.2] });
}

function bridge(ctx, bx, z0, z1, WY) {
  const { B, M } = ctx, W = OUT.BW, za = z0 - 3, zb = z1 + 3;
  const conc = [0.6, 0.58, 0.55];
  // 床(道)と 下のはり
  B.box(M.concrete, bx - W, -0.9, za, bx + W, 0.06, zb, { top: M.asphalt, col: conc, skip: '' });
  for (let z = za + 2; z < zb; z += 7) B.flat(M.paint, bx, 0.075, z + 1.75, 0.16, 3.5, { col: [0.92, 0.85, 0.5] });
  for (const s of [-1, 1]) {
    // 欄干(低い壁)
    B.box(M.concrete, bx + s * W - (s > 0 ? 0.5 : 0), 0.06, za, bx + s * W + (s > 0 ? 0 : 0.5), 1.1, zb, { col: conc, skip: 'b' });
    ctx.solid(bx + s * W - (s > 0 ? 0.5 : 0), za, bx + s * W + (s > 0 ? 0 : 0.5), zb, 1.1);
    // アーチの鉄骨
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, z = za + (zb - za) * t, y = 1.1 + Math.sin(t * Math.PI) * 6;
      B.box(M.plain, bx + s * (W - 0.25) - 0.15, 1.1, z - 0.15, bx + s * (W - 0.25) + 0.15, y, z + 0.15, { col: [0.55, 0.15, 0.1] });
      if (i < 8) {
        const z2 = za + (zb - za) * (i + 1) / 8, y2 = 1.1 + Math.sin((i + 1) / 8 * Math.PI) * 6;
        const g = new THREE.BoxGeometry(0.4, 0.4, Math.hypot(z2 - z, y2 - y) + 0.3);
        const m = new THREE.Matrix4().makeRotationX(-Math.atan2(y2 - y, z2 - z)).setPosition(bx + s * (W - 0.25), (y + y2) / 2, (z + z2) / 2);
        B.geom(M.plain, g, m, { col: [0.6, 0.17, 0.12] });
      }
    }
    lamp(ctx, bx + s * (W - 1), (za + zb) / 2 + s * 8, s > 0 ? Math.PI : 0, 0.06);
  }
  // 水の中の橋脚
  for (const z of [z0 + 9, z1 - 9]) B.box(M.concrete, bx - W + 1, WY - 2, z - 1.2, bx + W - 1, -0.9, z + 1.2, { col: [0.45, 0.44, 0.42] });
  ctx.mapRect(bx - W, za, bx + W, zb, OUTER_MAP.bridge);
}

// ---------------- 海と岸壁 ----------------
function sea(ctx) {
  const { M, half } = ctx, O = OUT, X = O.SEA, WY = -1.6;
  const SB = ctx.SB;      // 海は大きな板(区画 400m)
  for (let z = -1000; z < 1000; z += 400) for (let x = X; x < 1300; x += 400) {
    const xb = Math.min(1300, x + 400);
    SB.flat(M.sea, (x + xb) / 2, WY, z + 200, xb - x, 400);
  }
  // 岸壁(川の河口の南から 南の端まで)
  const conc = [0.58, 0.56, 0.52];
  for (let z = O.river.z1; z < half + 60; z += 40) {
    const zb = Math.min(half + 60, z + 40);
    ctx.B.box(M.concrete, X - 1, WY - 1.5, z, X, 0.25, zb, { col: conc, skip: 'b' + (z > O.river.z1 ? 'n' : '') + (zb < half + 60 ? 's' : '') });
    ctx.B.flat(M.paint, X - 1.6, 0.27, (z + zb) / 2, 0.25, zb - z, { col: [0.95, 0.75, 0.1] });
  }
  for (let z = -half - 60; z < O.river.z0; z += 40) {
    const zb = Math.min(O.river.z0, z + 40);
    ctx.B.box(M.concrete, X - 1, WY - 1.5, z, X, 0.25, zb, { col: conc, skip: 'b' });
  }
  ctx.mapRect(X, -half, half, half, OUTER_MAP.sea);
  // 海は入れない(桟橋は通れる)
  let zs = -half;
  for (const [a, b] of [...O.piers, [half, half]]) { if (a > zs) ctx.solid(X, zs, half + 2, a, 0.5); zs = b; }
  for (const [a, b] of O.piers) { ctx.solid(592, a, half + 2, b, 0.5); pier(ctx, X, 592, a, b); }
}

function pier(ctx, x0, x1, z0, z1) {
  const { B, M } = ctx;
  B.box(M.wood, x0 - 1, -0.3, z0, x1, 0.2, z1, { col: [0.55, 0.42, 0.3], s: [2, 2], skip: '' });
  for (let x = x0 + 2; x < x1; x += 5) for (const z of [z0 + 0.4, z1 - 0.4]) B.box(M.wood, x - 0.25, -3, z - 0.25, x + 0.25, 0.9, z + 0.25, { col: [0.35, 0.27, 0.2] });
  for (const z of [z0 + 0.15, z1 - 0.15]) { ctx.solid(x0, z - 0.15, x1, z + 0.15, 0.9); }
  ctx.mapRect(x0, z0, x1, z1, '#6a5a44');
}

// ---------------- 外へのびる道 ----------------
function roads(ctx) {
  const O = OUT, { z0, z1 } = O.river;
  road(ctx, z1 + 3, -192, 40, 6, false);           // 町の北 → 橋 → 空港
  road(ctx, -478, z0 - 3, 40, 6, false);
  road(ctx, z1 + 3, -150, -330, 4.5, false);        // 住宅街 → 橋 → 空港の西
  road(ctx, -478, z0 - 3, -330, 4.5, false);
  road(ctx, z1 + 3, -215, 300, 6, false);           // 工場地帯 → 橋 → 軍の基地
  road(ctx, -486, z0 - 3, 300, 6, false);
  road(ctx, -596, 508, -478, 4.5, true, { y: 0.018 });     // 川の北の道
  road(ctx, 396, O.SEA - 4, -40, 6, true); road(ctx, 396, O.SEA - 4, 40, 6, true);   // 工場地帯 → 港
  road(ctx, -596, -396, -40, 6, true); road(ctx, -596, -396, 40, 4.5, true);          // 住宅街 → 農場
  road(ctx, -402, O.SEA - 4, 404, 6, true);           // 南の道(遊園地・墓地・港)
  road(ctx, 368, 398, -40, 4, false); road(ctx, 368, 398, 40, 4, false);
  road(ctx, 205, 398, 310, 6, false);
  // 道ぞいの街灯
  for (let x = -580; x < 500; x += 36) lamp(ctx, x, -484.5, Math.PI / 2, 0.02);
  for (let x = -390; x < 510; x += 30) lamp(ctx, x, 411, Math.PI / 2);
  for (let z = -430; z < -200; z += 30) { lamp(ctx, 47.5, z, Math.PI); lamp(ctx, 307.5, z + 15, Math.PI); }
}

// ---------------- 墓地 ----------------
function cemetery(ctx) {
  const { B, M, rnd, I } = ctx;
  const [x0, z0, x1, z1] = OUT.cemetery;
  const iron = [0.08, 0.08, 0.09];
  // 鉄の柵(北の入口・西の入口)
  const ironFence = (xa, za, xb, zb, gap) => {
    const alongX = Math.abs(xb - xa) > Math.abs(zb - za), L = alongX ? xb - xa : zb - za;
    for (let s = 0; s <= L; s += 0.5) {
      const p = alongX ? xa + s : za + s;
      if (gap && p > gap[0] && p < gap[1]) continue;
      const x = alongX ? p : xa, z = alongX ? za : p;
      B.box(M.plain, x - 0.03, 0, z - 0.03, x + 0.03, 2.2, z + 0.03, { col: iron });
    }
    const segs = gap ? [[alongX ? xa : za, gap[0]], [gap[1], alongX ? xb : zb]] : [[alongX ? xa : za, alongX ? xb : zb]];
    for (const [a, b] of segs) {
      for (const y of [0.3, 1.9]) { if (alongX) B.box(M.plain, a, y, za - 0.04, b, y + 0.08, za + 0.04, { col: iron, skip: '' }); else B.box(M.plain, xa - 0.04, y, a, xa + 0.04, y + 0.08, b, { col: iron, skip: '' }); }
      if (alongX) ctx.solid(a, za - 0.1, b, za + 0.1, 2.2); else ctx.solid(xa - 0.1, a, xa + 0.1, b, 2.2);
    }
  };
  ironFence(x0, z0, x1, z0, [180, 196]); ironFence(x0, z1, x1, z1, [230, 240]); ironFence(x0, z0, x0, z1, [490, 500]); ironFence(x1, z0, x1, z1, [470, 486]);
  // 門柱
  for (const x of [179, 197]) { B.box(M.concrete, x - 0.6, 0, z0 - 0.6, x + 0.6, 3.4, z0 + 0.6, { col: [0.5, 0.5, 0.48] }); ctx.solid(x - 0.6, z0 - 0.6, x + 0.6, z0 + 0.6, 3.4); B.box(M.glow, x - 0.25, 3.4, z0 - 0.25, x + 0.25, 3.9, z0 + 0.25, { col: [3, 1.6, 0.5] }); }
  // 通路(石だたみ)
  B.flat(M.pave, 188, 0.02, (z0 + z1) / 2, 7, z1 - z0, { col: [0.6, 0.58, 0.55] });
  B.flat(M.pave, (x0 + x1) / 2, 0.022, 500, x1 - x0, 6, { col: [0.6, 0.58, 0.55] });
  ctx.occupy(184, z0, 192, z1); ctx.occupy(x0, 496, x1, 504);
  ctx.mapLine(188, z0, 188, z1, 6, '#5a5650'); ctx.mapLine(x0, 500, x1, 500, 6, '#5a5650');
  // 霊廟(石の小屋)
  const tombs = [[120, 450], [260, 452], [330, 540], [110, 560], [240, 560]];
  for (const [x, z] of tombs) {
    B.box(M.concrete, x - 3.5, 0, z - 4, x + 3.5, 4.2, z + 4, { col: [0.55, 0.54, 0.52] });
    B.box(M.concrete, x - 4, 4.2, z - 4.5, x + 4, 4.7, z + 4.5, { col: [0.5, 0.49, 0.47], skip: '' });
    const g = new THREE.ConeGeometry(4.2, 2.2, 4); g.rotateY(Math.PI / 4); g.scale(1, 1, 1.15);
    B.geom(M.plain, g, new THREE.Matrix4().makeTranslation(x, 5.8, z), { col: [0.36, 0.36, 0.38] });
    B.box(M.plain, x - 1.2, 0, z + 3.98, x + 1.2, 2.8, z + 4.05, { col: [0.06, 0.05, 0.05] });
    B.box(M.plain, x - 0.1, 6.9, z - 0.1, x + 0.1, 8.2, z + 0.1, { col: [0.4, 0.4, 0.4] }); B.box(M.plain, x - 0.5, 7.6, z - 0.08, x + 0.5, 7.8, z + 0.08, { col: [0.4, 0.4, 0.4] });
    ctx.solid(x - 3.5, z - 4, x + 3.5, z + 4, 4.7);
    ctx.occupy(x - 6, z - 6, x + 6, z + 8);
    ctx.mapRect(x - 3.5, z - 4, x + 3.5, z + 4, '#6a6864');
    pool(ctx, x, z + 6, 3.5, [0.5, 0.3, 0.12]);
    B.box(M.glow, x - 0.12, 0.05, z + 5.6, x + 0.12, 0.45, z + 5.85, { col: [3, 1.5, 0.4] });
  }
  // 礼拝堂(中に入れる)
  const C = new Bld(ctx, { name: '墓地の礼拝堂', x0: 300, z0: 430, x1: 324, z1: 456, h: 6.5, y0: 0.05, skin: M.concrete, skinCol: [0.72, 0.7, 0.66], skinS: [6, 6], floor: M.pave, floorCol: [0.6, 0.55, 0.5], wallCol: [0.75, 0.72, 0.66], small: true });
  C.shell([{ side: 'S', at: 312, w: 5 }, { side: 'W', at: 443, w: 4 }]);
  for (let z = 434; z < 450; z += 2.4) { C.prop('pew', 307, z, 0, { s: 0.8 }); C.prop('pew', 317, z, 0, { s: 0.8 }); }
  C.prop('altar', 312, 432.5, 0);
  C.light(312, 440, 5, [0.5, 0.35, 0.15]); C.light(312, 450, 4, [0.4, 0.3, 0.15]);
  for (const z of [436, 442, 448]) for (const x of [299.95, 324.05]) C.RB.box(M.glow, x - 0.05, 2.8, z - 0.7, x + 0.05, 5.2, z + 0.7, { col: [[2.4, 0.4, 0.3], [0.4, 0.8, 2.6], [2.4, 1.8, 0.3]][(z / 6 | 0) % 3] });
  C.gableRoof({ pitch: 0.8, col: [0.25, 0.25, 0.28] });
  C.RB.box(M.concrete, 309.5, 6.5, 452, 314.5, 14, 457, { col: [0.7, 0.68, 0.64] });
  C.RB.geom(M.plain, new THREE.ConeGeometry(3.6, 7, 4).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(312, 17.5, 454.5), { col: [0.25, 0.25, 0.28] });
  C.finish();
  // 墓石(きちんと並んで、少し かたむいている)
  for (let x = x0 + 6; x < x1 - 4; x += 4.4) for (let z = z0 + 8; z < z1 - 5; z += 5.2) {
    if (!ctx.isFree(x, z, 1.2) || rnd() < 0.2 || (((x - x0) / 40 | 0) % 3 === 2 && ((z - z0) / 30 | 0) % 2)) continue;
    const v = 0.4 + rnd() * 0.25, t = (rnd() - 0.5) * 0.25, cross = rnd() < 0.25;
    I.add(cross ? 'cross' : 'grave', x + (rnd() - 0.5) * 0.5, 0, z + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.2, 0.9 + rnd() * 0.3, [v, v, v * 0.97], { rx: t, rz: (rnd() - 0.5) * 0.2 });
    ctx.solid(x - 0.45, z - 0.15, x + 0.45, z + 0.15, 1);
    if (rnd() < 0.08) { decal(ctx, 5, x, z + 1.6, 1.8, rnd() * 6, 0.03); B.flat(M.plainNoCut, x, 0.025, z + 1.6, 0.9, 1.9, { col: [0.06, 0.05, 0.04] }); }   // 掘りかえされた墓
    else if (rnd() < 0.2) B.box(M.glow, x - 0.06, 0, z + 0.5, x + 0.06, 0.25, z + 0.62, { col: [3, 1.4, 0.4] });  // ろうそく
  }
  // 枯れ木
  for (let k = 0; k < 26; k++) { const x = x0 + 6 + rnd() * (x1 - x0 - 12), z = z0 + 6 + rnd() * (z1 - z0 - 12); if (ctx.isFree(x, z, 2)) placeTree(ctx, 'dead', x, z, 1 + rnd() * 0.5, rnd() * 6); }
  for (let k = 0; k < 40; k++) decal(ctx, [5, 5, 9, 1][k % 4], x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), 2 + rnd() * 3, rnd() * 6, 0.02);
  ctx.occupy(x0, z0, x1, z1);
  ctx.W.addMist(232, 504, 170);
}

// ---------------- 農場 ----------------
function farm(ctx) {
  const { B, M, rnd, I } = ctx;
  const [x0, z0, x1, z1] = OUT.farm;
  // 畑(とうもろこし・耕した土・麦)。柵(こわせる)で囲む
  const fields = [];
  for (let z = z0 + 14; z < z1 - 30; z += 70) for (let x = x0 + 10; x < x1 - 30; x += 66) {
    if ((z < -30 && z + 58 > -50) || (z < 50 && z + 58 > 30)) continue;     // 道
    if (x > -500 && x < -440 && z > -150 && z < -40) continue;          // 農家
    fields.push([x, z, Math.min(x1 - 8, x + 56), Math.min(z1 - 8, z + 58)]);
  }
  fields.forEach(([fx0, fz0, fx1, fz1], i) => {
    const kind = i % 3, col = kind === 0 ? [0.36, 0.3, 0.18] : kind === 1 ? [0.3, 0.22, 0.14] : [0.62, 0.52, 0.26];
    B.flat(M.ground, (fx0 + fx1) / 2, 0.012, (fz0 + fz1) / 2, fx1 - fx0, fz1 - fz0, { col });
    if (kind === 1) for (let z = fz0 + 1; z < fz1; z += 2) B.flat(M.ground, (fx0 + fx1) / 2, 0.016, z, fx1 - fx0, 0.6, { col: [0.22, 0.16, 0.1] });
    if (kind === 0) for (let z = fz0 + 2; z < fz1 - 1; z += 2.8) for (let x = fx0 + 2; x < fx1 - 1; x += 3) if (rnd() < 0.85) I.add('corn', x + (rnd() - 0.5) * 0.6, 0, z, rnd() * 6, 0.9 + rnd() * 0.4);
    if (kind === 2) for (let k = 0; k < 10; k++) { const x = fx0 + 4 + rnd() * (fx1 - fx0 - 8), z = fz0 + 4 + rnd() * (fz1 - fz0 - 8); I.add('hay', x, 0, z, rnd() * 3, 1); ctx.solid(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 1.6); }
    if (rnd() < 0.7) ctx.prop('scarecrow', (fx0 + fx1) / 2 + (rnd() - 0.5) * 10, (fz0 + fz1) / 2 + (rnd() - 0.5) * 10, rnd() * 6, { solid: false });
    // 柵(入口をあける。半分の畑だけ)
    const g = (fx0 + fx1) / 2;
    if (i % 2) { ctx.occupy(fx0, fz0, fx1, fz1); ctx.mapRect(fx0, fz0, fx1, fz1, kind === 2 ? '#7a6a38' : kind === 1 ? '#4a3a26' : '#4e5a2a'); return; }
    placeFence(ctx, fx0, fz0, g - 3, fz0, [0.55, 0.42, 0.3]); placeFence(ctx, g + 3, fz0, fx1, fz0, [0.55, 0.42, 0.3]);
    placeFence(ctx, fx0, fz1, fx1, fz1, [0.55, 0.42, 0.3]);
    placeFence(ctx, fx0, fz0, fx0, fz1, [0.55, 0.42, 0.3]); placeFence(ctx, fx1, fz0, fx1, (fz0 + fz1) / 2 - 3, [0.55, 0.42, 0.3]); placeFence(ctx, fx1, (fz0 + fz1) / 2 + 3, fx1, fz1, [0.55, 0.42, 0.3]);
    ctx.occupy(fx0, fz0, fx1, fz1);
    ctx.mapRect(fx0, fz0, fx1, fz1, kind === 2 ? '#7a6a38' : kind === 1 ? '#4a3a26' : '#4e5a2a');
  });
  // 農家・納屋・サイロ・風車・給水塔
  const bx0 = -498, bz0 = -142;
  const barn = new Bld(ctx, { name: '納屋', x0: bx0, z0: bz0, x1: bx0 + 30, z1: bz0 + 20, h: 7, y0: 0, skin: M.wood, skinCol: [0.62, 0.16, 0.12], skinS: [4, 4], wall: M.wood, wallCol: [0.55, 0.38, 0.25], floor: M.woodFloor, floorCol: [0.7, 0.58, 0.4], small: false });
  barn.shell([{ side: 'S', at: bx0 + 15, w: 7 }, { side: 'N', at: bx0 + 15, w: 5 }, { side: 'E', at: bz0 + 10, w: 4 }]);
  for (let k = 0; k < 8; k++) I.add('hay', bx0 + 3 + (k % 4) * 2.2, 0, bz0 + 3 + Math.floor(k / 4) * 2.2, 0, 1);
  ctx.solid(bx0 + 1.5, bz0 + 1.5, bx0 + 11, bz0 + 6.5, 1.6, barn.b);
  barn.prop('tractor', bx0 + 22, bz0 + 12, 0.3, { col: [0.75, 0.12, 0.08] });
  barn.prop('crate', bx0 + 26, bz0 + 3, 0.2, { col: [0.75, 0.6, 0.4] }); barn.prop('crate', bx0 + 27.5, bz0 + 4.5, 0.6, { col: [0.75, 0.6, 0.4] });
  barn.prop('propane', bx0 + 27, bz0 + 17, Math.PI / 2);
  barn.light(bx0 + 8, bz0 + 10, 5, [0.5, 0.35, 0.15]); barn.light(bx0 + 22, bz0 + 10, 5, [0.5, 0.35, 0.15]);
  barn.gableRoof({ pitch: 0.75, col: [0.3, 0.28, 0.27], alongX: true, endCol: [0.62, 0.16, 0.12] });
  barn.finish();
  // サイロ
  for (const [x, z] of [[bx0 + 36, bz0 + 4], [bx0 + 36, bz0 + 13]]) {
    B.geom(M.metal, new THREE.CylinderGeometry(3.5, 3.5, 18, 16), new THREE.Matrix4().makeTranslation(x, 9, z), { col: [0.75, 0.75, 0.72] });
    B.geom(M.plain, new THREE.SphereGeometry(3.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 18, z), { col: [0.55, 0.55, 0.52] });
    ctx.solid(x - 3.3, z - 3.3, x + 3.3, z + 3.3, 20); ctx.mapCircle(x, z, 3.5, '#8a8a84');
  }
  house(ctx, -470, -96, 12, 10, 'S', { enter: true, back: true, col: [0.92, 0.88, 0.78], roofCol: [0.25, 0.3, 0.35] });
  ctx.prop('jeep', -455, -100, 1.2, { col: [0.45, 0.4, 0.3] }); ctx.prop('tanker', -440, -128, Math.PI / 2, { col: [0.85, 0.85, 0.82] });
  for (let k = 0; k < 4; k++) ctx.prop('barrel', -444 + k * 0.8, -112 + (k % 2) * 0.8, 0, { col: [0.3, 0.45, 0.25] });
  // 風車(羽は world-life.js が回す)
  const wx = -540, wz = 200;
  B.geom(M.plain, new THREE.CylinderGeometry(0.4, 1.4, 22, 8), new THREE.Matrix4().makeTranslation(wx, 11, wz), { col: [0.85, 0.85, 0.82] });
  B.box(M.plain, wx - 1, 21.5, wz - 0.8, wx + 1, 23, wz + 1.6, { col: [0.8, 0.8, 0.78] });
  ctx.solid(wx - 1.4, wz - 1.4, wx + 1.4, wz + 1.4, 22);
  ctx.W.addSpinner({ x: wx, y: 22.3, z: wz + 1.8, kind: 'windmill' });
  ctx.mapCircle(wx, wz, 2, '#cfcfc8');
  // 給水塔
  ctx.prop('watertank', -520, -40 + 14, 0, { s: 1.8 });
  // 畑の間の土の道
  for (const z of [-250, 120, 300]) { for (let x = x0 + 8; x < x1 - 4; x += 6) B.flat(M.decal, x + 3, 0.014, z, 9, 6, { uv: [0.25, 0, 0.5, 0.25], col: [1, 1, 1] }); ctx.occupy(x0, z - 4, x1, z + 4); }
  for (let k = 0; k < 20; k++) decal(ctx, [5, 9, 1][k % 3], x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0), 2 + rnd() * 2, rnd() * 6, 0.02);
  // 道ぞいの街灯(木の電柱)
  for (let x = x0 + 10; x < x1; x += 34) { B.box(M.wood, x - 0.15, 0, -47.5, x + 0.15, 8, -47.2, { col: [0.4, 0.3, 0.2] }); B.box(M.glow, x - 0.3, 7.6, -47.5, x + 0.3, 7.8, -47.0, { col: [3, 2.2, 1.2] }); pool(ctx, x, -45, 5, [0.3, 0.22, 0.12]); ctx.solid(x - 0.2, -47.6, x + 0.2, -47.1, 8); }
  void padBox; void B;
}
