// マップ係: 住宅街(西)と 工場地帯(東)。
import * as THREE from 'three';
import { placeTree } from './world-props.js';
import { house } from './world-interiors.js';
import { decal, pool, lamp, tower } from './world-town.js';

// 道路(アスファルト + まん中の点線)。alongX: 東西の道
export function road(ctx, a, b, c, hw, alongX, { dash = true, y = null } = {}) {
  const { B, M } = ctx;
  const Y = y ?? (alongX ? 0.014 : 0.016);
  for (let s = a; s < b; s += 40) {
    const e = Math.min(b, s + 40), m = (s + e) / 2;
    if (alongX) B.flat(M.asphalt, m, Y, c, e - s, hw * 2); else B.flat(M.asphalt, c, Y, m, hw * 2, e - s);
    if (dash) for (let k = s + 2; k < e - 3; k += 7) {
      if (alongX) B.flat(M.paint, k + 1.75, Y + 0.01, c, 3.5, 0.16, { col: [0.92, 0.85, 0.5] });
      else B.flat(M.paint, c, Y + 0.01, k + 1.75, 0.16, 3.5, { col: [0.92, 0.85, 0.5] });
    }
  }
  if (alongX) { ctx.occupy(a, c - hw - 1, b, c + hw + 1); ctx.mapLine(a, c, b, c, hw * 2, '#2c2c30'); }
  else { ctx.occupy(c - hw - 1, a, c + hw + 1, b); ctx.mapLine(c, a, c, b, hw * 2, '#2c2c30'); }
}

const CAR_COLS = [[0.7, 0.1, 0.1], [0.15, 0.25, 0.5], [0.85, 0.85, 0.85], [0.1, 0.1, 0.1], [0.5, 0.5, 0.52], [0.25, 0.4, 0.25], [0.75, 0.6, 0.2]];

// ---------------- 住宅街 ----------------
export function genSuburb(ctx) {
  const { rnd } = ctx;
  const X0 = -396, X1 = -192;
  const SZ = [[-110, 4.5], [-40, 6], [40, 6], [110, 4.5], [245, 4.5]];
  const SX = [-330, -250];
  for (const [Z, hw] of SZ) road(ctx, X0, X1, Z, hw, true);
  for (const X of SX) road(ctx, -150, 290, X, 4.5, false);
  // 道の街灯
  for (const [Z] of SZ) for (let x = X0 + 14; x < X1 - 4; x += 28) lamp(ctx, x, Z - 7, -Math.PI / 2);
  for (const X of SX) for (let z = -140; z < 285; z += 30) lamp(ctx, X + 6, z, 0);

  const cols = [[-392, -337], [-322, -258], [-242, -196]];
  const rowsZ = [[-150, -117], [-103, -48], [-32, 32], [48, 103], [117, 170], [187, 238], [252, 290]];
  let lot = 0;
  for (const [cx0, cx1] of cols) for (const [rz0, rz1] of rowsZ) {
    const depth = rz1 - rz0;
    const rows = depth > 40 ? ['N', 'S'] : [rz0 < -140 ? 'S' : rz1 > 280 ? 'N' : 'N'];
    for (const face of rows) {
      for (let lx = cx0 + 1; lx + 18 <= cx1; lx += 21) {
        lot++;
        const w = 10 + rnd() * 3, d = 9 + rnd() * 2;
        const hx = lx + 2 + rnd() * (18 - w - 4);
        const z0 = face === 'N' ? rz0 + 5 : rz1 - 5 - d;
        const enter = lot % 9 === 4;
        house(ctx, hx, z0, w, d, face, { enter, back: enter });
        // 庭: 車・木・しげみ
        const drX = hx + w + 2.2 > lx + 20 ? hx - 2.5 : hx + w + 2.2;
        const front = face === 'N' ? rz0 + 2.5 : rz1 - 2.5;
        ctx.B.flat(ctx.M.sidewalk, drX, 0.012, face === 'N' ? rz0 + 4.5 : rz1 - 4.5, 3, 9, { col: [0.75, 0.73, 0.7] });
        if (rnd() < 0.6) ctx.prop(rnd() < 0.3 ? 'van' : 'sedan', drX, face === 'N' ? z0 + 2 : z0 + d - 2, Math.PI / 2 + (rnd() - 0.5) * 0.1, { col: rnd() < 0.15 ? [0.12, 0.1, 0.09] : CAR_COLS[Math.floor(rnd() * CAR_COLS.length)] });
        if (rnd() < 0.5) ctx.prop('trashcan', lx + 1.5, front, 0);
        const backZ = face === 'N' ? z0 + d + 4 : z0 - 4;
        if (rnd() < 0.8 && ctx.isFree(lx + 3, backZ, 1)) placeTree(ctx, ['broad', 'birch', 'pine'][Math.floor(rnd() * 3)], lx + 3 + rnd() * 2, backZ, 0.7 + rnd() * 0.4, rnd() * 6);
        if (rnd() < 0.5 && ctx.isFree(lx + 16, backZ, 1)) placeTree(ctx, 'broad', lx + 15 + rnd() * 2, backZ + (rnd() - 0.5) * 2, 0.8 + rnd() * 0.3, rnd() * 6);
        if (rnd() < 0.15 && ctx.isFree(lx + 10, backZ, 2.5)) ctx.prop('swing', lx + 10, backZ, 0);
        for (let k = 0; k < 3; k++) ctx.I.add('bush', lx + rnd() * 18, 0, face === 'N' ? rz0 + 3.5 : rz1 - 3.5, rnd() * 6, 0.6 + rnd() * 0.4);
        // 横のしげみ(生け垣)
        for (let z = Math.min(z0, backZ); z < Math.max(z0 + d, backZ); z += 2.2) ctx.I.add('bush', lx + 19.5, 0, z, rnd() * 6, 0.55 + rnd() * 0.2);
        if (rnd() < 0.3) decal(ctx, [1, 2, 9][Math.floor(rnd() * 3)], lx + rnd() * 18, front, 2 + rnd() * 2, rnd() * 6, 0.02);
      }
      // 裏の柵(とぎれとぎれ)
      if (rows.length === 2 && face === 'N') {
        const fz = (rz0 + rz1) / 2;
        for (let x = cx0 + 2; x < cx1 - 4; x += 8) {
          if (Math.floor((x - cx0) / 8) % 3 === 2) continue;
          fence(ctx, x, fz, x + 6, fz);
        }
      }
    }
    // 道の上の放置車
    if (rnd() < 0.6) { const x = cx0 + rnd() * (cx1 - cx0); ctx.prop('sedan', x, rz0 - 2.2, (rnd() - 0.5) * 0.4, { col: CAR_COLS[Math.floor(rnd() * CAR_COLS.length)] }); }
  }
}

// 白い木の柵(x 方向 or z 方向)
export function fence(ctx, xa, za, xb, zb, col = [0.9, 0.88, 0.82]) {
  const { B, M } = ctx;
  const alongX = Math.abs(xb - xa) > Math.abs(zb - za);
  const L = alongX ? xb - xa : zb - za;
  for (let s = 0; s <= L; s += 1.5) {
    const x = alongX ? xa + s : xa, z = alongX ? za : za + s;
    B.box(M.plain, x - 0.06, 0, z - 0.06, x + 0.06, 1.1, z + 0.06, { col });
  }
  for (const y of [0.4, 0.85]) {
    if (alongX) B.box(M.plain, xa, y, za - 0.03, xb, y + 0.1, za + 0.03, { col }); else B.box(M.plain, xa - 0.03, y, za, xa + 0.03, y + 0.1, zb, { col });
  }
  if (alongX) ctx.solid(xa, za - 0.1, xb, za + 0.1, 1.1); else ctx.solid(xa - 0.1, za, xa + 0.1, zb, 1.1);
}

// ---------------- 工場地帯 ----------------
export function genIndustrial(ctx) {
  const { B, M, rnd } = ctx;
  const X0 = 192, X1 = 396;
  // 地面: コンクリートの板
  for (let z = -208; z < 208; z += 40) for (let x = X0; x < 400; x += 40) {
    const z1 = Math.min(208, z + 40);
    B.flat(M.floorC, x + 20, 0.004, (z + z1) / 2, 40, z1 - z, { col: [0.52, 0.52, 0.5] });
  }
  road(ctx, X0, X1, -40, 6, true); road(ctx, X0, X1, 40, 6, true);
  road(ctx, -205, 205, 310, 6, false);
  for (const Z of [-40, 40]) for (let x = X0 + 10; x < X1; x += 26) lamp(ctx, x, Z + 7.5, Math.PI / 2);
  for (let z = -200; z < 205; z += 26) lamp(ctx, 317.5, z, Math.PI);

  // コンテナ置き場(北東)
  const cc = [[0.7, 0.2, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.85, 0.5, 0.1], [0.55, 0.55, 0.58], [0.6, 0.15, 0.4]];
  for (const cx of [331, 348, 365, 382]) {
    for (let z = -198; z < -58; z += 3.2) {
      if (((z + 198) / 3.2 | 0) % 5 === 4) continue;      // 通路
      if (rnd() < 0.18) continue;
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) ctx.prop('container', cx + (rnd() - 0.5) * 0.4, z, (rnd() - 0.5) * 0.04, { y: i * 2.6, col: cc[Math.floor(rnd() * cc.length)], solid: i === 0 });
    }
  }
  // 大きなクレーン
  const crane = [0.9, 0.62, 0.1];
  for (const x of [337, 375]) for (const z of [-140, -122]) { B.box(M.plain, x - 0.8, 0, z - 0.8, x + 0.8, 22, z + 0.8, { col: crane }); ctx.solid(x - 0.8, z - 0.8, x + 0.8, z + 0.8, 22); }
  B.box(M.plain, 335, 22, -141, 377, 24, -139, { col: crane }); B.box(M.plain, 335, 22, -123, 377, 24, -121, { col: crane });
  for (const x of [337, 375]) B.box(M.plain, x - 0.8, 20, -140, x + 0.8, 22, -122, { col: crane });
  B.box(M.plain, 352, 21, -142, 358, 25, -120, { col: [0.3, 0.3, 0.32] });
  B.box(M.glow, 354, 25, -131.5, 356, 25.3, -130.5, { col: [3, 0.3, 0.2] });
  ctx.mapRect(322, -200, 394, -55, '#5d5a52');

  // タンク群(東の真ん中)
  for (const x of [336, 358, 380]) for (const z of [-15, 15]) {
    ctx.prop('bigtank', x, z, 0, { solid: false });
    ctx.solid(x - 6, z - 6, x + 6, z + 6, 13);
    ctx.mapCircle(x, z, 7, '#9a9a96');
  }
  for (const z of [-15, 15]) B.geom(M.plain, new THREE.CylinderGeometry(0.4, 0.4, 44, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(358, 3.5, z), { col: [0.5, 0.5, 0.52] });

  // トラックの駐車場
  for (const z of [-20, -7, 7, 20]) for (let x = 212; x < 298; x += 13) {
    const r = rnd();
    if (r < 0.45) ctx.prop('truck', x, z, (rnd() - 0.5) * 0.08, { col: cc[Math.floor(rnd() * cc.length)] });
    else if (r < 0.65) { ctx.prop('pallet', x - 2, z, rnd(), { col: [0.8, 0.65, 0.45] }); ctx.prop('crate', x + 2, z, rnd(), { col: [0.8, 0.65, 0.45] }); }
  }
  ctx.prop('forklift', 230, 0, 0.6); ctx.prop('forklift', 270, 1, 2.5);
  for (let k = 0; k < 20; k++) decal(ctx, [0, 0, 10, 6, 1][k % 5], 205 + rnd() * 95, -30 + rnd() * 60, 3 + rnd() * 3, rnd() * 6, 0.02);
  for (let x = 220; x < 300; x += 30) lamp(ctx, x, 0, 0);

  // 線路(南東)
  for (const tx of [330, 342, 354, 366, 378, 390]) {
    B.flat(M.ground, tx, 0.012, 111, 3.4, 118, { col: [0.32, 0.3, 0.28] });
    for (let z = 53; z < 170; z += 0.9) B.box(M.plain, tx - 1.2, 0.02, z - 0.13, tx + 1.2, 0.12, z + 0.13, { col: [0.3, 0.22, 0.15], skip: 'b' });
    for (const s of [-0.72, 0.72]) B.box(M.plain, tx + s - 0.05, 0.12, 52, tx + s + 0.05, 0.27, 170, { col: [0.45, 0.42, 0.4], skip: 'b' });
    ctx.mapLine(tx, 52, tx, 170, 2, '#4a4038');
  }
  ctx.occupy(322, 50, 396, 172);
  for (const tx of [342, 366, 390]) {
    for (let z = 58 + rnd() * 6; z < 160; z += 15 + rnd() * 6) {
      if (rnd() < 0.25) continue;
      ctx.prop('container', tx, z + 6, Math.PI / 2, { y: 1.1, col: cc[Math.floor(rnd() * cc.length)], solid: false });
      B.box(M.plain, tx - 1.1, 0.3, z, tx + 1.1, 1.1, z + 12, { col: [0.12, 0.12, 0.12] });
      ctx.solid(tx - 1.3, z, tx + 1.3, z + 12, 3.7);
    }
  }
  // タンク車
  for (let z = 70; z < 150; z += 14) {
    B.geom(M.plain, new THREE.CylinderGeometry(1.4, 1.4, 12, 12), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(354, 2.4, z), { col: [0.15, 0.15, 0.17] });
    B.box(M.plain, 353, 0.3, z - 6, 355, 1.1, z + 6, { col: [0.1, 0.1, 0.1] });
    ctx.solid(352.6, z - 6, 355.4, z + 6, 3.8);
  }
  // 機関車
  B.box(M.plain, 328.6, 0.4, 150, 331.4, 3.6, 166, { col: [0.75, 0.2, 0.12] }); B.box(M.plain, 328.7, 3.6, 161, 331.3, 4.6, 166, { col: [0.75, 0.2, 0.12] });
  B.box(M.plain, 328.5, 3.65, 165.95, 331.5, 4.4, 166.05, { col: [0.06, 0.07, 0.09] });
  ctx.solid(328.5, 150, 331.5, 166, 4.6);

  // スクラップ置き場(高架の南)
  for (let k = 0; k < 26; k++) {
    const x = 210 + rnd() * 90, z = 192 + rnd() * 18;
    if (!ctx.isFree(x, z, 2.5)) continue;
    const st = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < st; i++) ctx.prop('sedan', x, z, rnd() * 6, { y: i * 1.45, col: [0.25 + rnd() * 0.2, 0.18 + rnd() * 0.1, 0.12], solid: i === 0 });
  }
  for (let k = 0; k < 8; k++) { const x = 210 + rnd() * 90, z = 192 + rnd() * 18; if (ctx.isFree(x, z, 1.5)) ctx.prop(rnd() < 0.5 ? 'tires' : 'rubble', x, z, rnd() * 6); }
  // 東の端の壁
  B.box(M.concrete, 396, 0, -215, 400, 4.5, 215, { col: [0.6, 0.58, 0.55] });
  for (let z = -213; z < 214; z += 3) B.box(M.plain, 396.2, 4.5, z - 0.05, 396.4, 5.6, z + 0.05, { col: [0.25, 0.25, 0.25] });
  ctx.solid(396, -215, 400, 215, 4.5);
  // 道端の小物
  for (let k = 0; k < 30; k++) {
    const x = 196 + rnd() * 196, z = -205 + rnd() * 410;
    if (!ctx.isFree(x, z, 1.5) || ctx.zoneAt(x, z) !== 'industrial') continue;
    const r = rnd();
    if (r < 0.3) { ctx.prop('fireBarrel', x, z, 0); pool(ctx, x, z, 5, [0.9, 0.45, 0.12]); }
    else if (r < 0.6) ctx.prop('barrel', x, z, rnd() * 6, { col: [[1, 1, 1], [0.3, 0.5, 0.9], [0.3, 0.7, 0.3]][Math.floor(rnd() * 3)] });
    else if (r < 0.8) ctx.prop('pallet', x, z, rnd() * 6, { col: [0.8, 0.65, 0.45] });
    else ctx.prop('tires', x, z, 0);
  }
  // 小さな事務所ビル(中に入れない)
  tower(ctx, 205, 140, 230, 165, 18, { y: 0, style: M.ribbon });
  tower(ctx, 245, 145, 270, 165, 12, { y: 0, style: M.office });
}
