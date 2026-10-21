// マップ係: 森(北と外まわり)・湖・山小屋・キャンプ場・公園(南)・学校。住宅街と工場地帯は world-zones.js。
import * as THREE from 'three';
import { placeTree } from './world-props.js';
import { cabin } from './world-interiors.js';
import { decal, pool, lamp, tower, TOWN } from './world-town.js';
import { genSuburb, genIndustrial } from './world-zones.js';

// 湖・池(水面。中は歩けない)
export const LAKES = [
  { x: -150, z: -292, rx: 56, rz: 32, name: '湖' },
  { x: 92, z: 334, rx: 24, rz: 14, name: '池' },
];
// 森の小道(折れ線)
const PATHS = [
  [[-40, -192], [-55, -228], [-82, -262], [-96, -280]],
  [[40, -192], [58, -236], [96, -278], [118, -294]],
  [[-330, -150], [-318, -205], [-268, -262], [-205, -290]],
  [[-300, -335], [-200, -338], [-100, -332], [0, -312], [100, -320], [200, -332], [300, -328]],
  [[250, -215], [242, -270], [200, -330]],
  [[0, -312], [0, -280]],
  [[-260, 290], [-265, 340], [-300, 380]],
  [[250, 215], [260, 280], [300, 340]],
];
const CLEARINGS = [
  { x: 0, z: -280, r: 15, kind: 'camp' },
  { x: -260, z: -350, r: 14, kind: 'heli' },
  { x: 260, z: -300, r: 12, kind: 'tower' },
  { x: 300, z: 300, r: 12, kind: 'camp' },
];

export function genNature(ctx) {
  genSuburb(ctx);
  genIndustrial(ctx);
  park(ctx);
  lakes(ctx);
  paths(ctx);
  clearings(ctx);
  cabin(ctx, 112, -306);
  forest(ctx);
  outside(ctx);
}

// 平らな楕円の板(世界の座標で模様を貼る)
function disk(ctx, mat, x, z, rx, rz, y, col, seg = 40) {
  const s = (mat.userData && mat.userData.s) || [8, 8];
  const b = ctx.B.bucket(mat, x, z), base = b.v;
  b.p.push(x, y, z); b.n.push(0, 1, 0); b.u.push(x / s[0], -z / s[1]); b.c.push(col[0], col[1], col[2]);
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, px = x + Math.cos(a) * rx, pz = z + Math.sin(a) * rz;
    b.p.push(px, y, pz); b.n.push(0, 1, 0); b.u.push(px / s[0], -pz / s[1]); b.c.push(col[0], col[1], col[2]);
  }
  for (let i = 0; i < seg; i++) b.i.push(base, base + 2 + i, base + 1 + i);
  b.v += seg + 2;
}

function lakes(ctx) {
  const { M, rnd } = ctx;
  for (const L of LAKES) {
    disk(ctx, M.ground, L.x, L.z, L.rx + 4, L.rz + 3, 0.015, [0.33, 0.31, 0.22]);
    disk(ctx, M.ground, L.x, L.z, L.rx + 1.2, L.rz + 1.2, 0.02, [0.24, 0.21, 0.15]);
    disk(ctx, M.water, L.x, L.z, L.rx, L.rz, 0.05, [1, 1, 1]);
    // 当たり判定: 2m ごとの横長の箱(岸から 1m は歩ける)
    for (let dz = -L.rz; dz < L.rz; dz += 2) {
      const zc = dz + 1, f = 1 - (zc / L.rz) ** 2;
      if (f <= 0) continue;
      const hw = L.rx * Math.sqrt(f) - 1.2;
      if (hw > 0.5) ctx.solid(L.x - hw, L.z + dz, L.x + hw, L.z + dz + 2, 0.5);
    }
    ctx.occupy(L.x - L.rx - 3, L.z - L.rz - 3, L.x + L.rx + 3, L.z + L.rz + 3);
    ctx.mapCircle(L.x, L.z, 1, '#2d5a70', L.rx, L.rz);
    // 岸: 岩・草・倒木
    for (let k = 0; k < 40; k++) {
      const a = rnd() * Math.PI * 2, f = 1.02 + rnd() * 0.12;
      const x = L.x + Math.cos(a) * L.rx * f, z = L.z + Math.sin(a) * L.rz * f;
      const r = rnd();
      if (r < 0.3) { ctx.I.add('rock', x, 0, z, rnd() * 6, [0.6 + rnd() * 0.8, 0.5 + rnd() * 0.6, 0.6 + rnd() * 0.8], null); }
      else ctx.I.add('grass', x, 0, z, rnd() * 6, 1 + rnd() * 0.8);
    }
  }
  // 湖の桟橋(見た目だけ)
  const L = LAKES[0];
  ctx.B.box(M.wood, L.x + L.rx - 14, 0.2, L.z - 1.2, L.x + L.rx + 2, 0.45, L.z + 1.2, { col: [0.6, 0.45, 0.3], s: [2, 2] });
  for (let x = L.x + L.rx - 13; x < L.x + L.rx; x += 3) for (const s of [-1, 1]) ctx.B.box(M.wood, x - 0.12, -0.3, L.z + s * 1.1 - 0.12, x + 0.12, 0.6, L.z + s * 1.1 + 0.12, { col: [0.4, 0.3, 0.2] });
  // ボート
  ctx.prop('sedan', L.x + L.rx - 7, L.z + 4, 0.2, { s: 0.6, col: [0.9, 0.9, 0.9], solid: false, occupy: false });
}

// 森の小道(土の道。木を生やさない)
function paths(ctx) {
  const { B, M, rnd } = ctx;
  for (const P of PATHS) {
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, z0] = P[i], [x1, z1] = P[i + 1];
      const L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(z1 - z0, x1 - x0);
      for (let s = 0; s < L; s += 6) {
        const t = (s + 3) / L, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        B.flat(M.decal, x, 0.012 + (i % 2) * 0.002, z, 9, 6, { rot, uv: [0.25, 0, 0.5, 0.25], col: [1, 1, 1] });
        ctx.occupy(x - 4, z - 4, x + 4, z + 4);
        if (rnd() < 0.25) decal(ctx, 5, x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3, 2.5, rnd() * 6, 0.02);
      }
      ctx.mapLine(x0, z0, x1, z1, 4, '#6a5638');
    }
  }
}

function clearings(ctx) {
  const { M, rnd } = ctx;
  for (const C of CLEARINGS) {
    ctx.occupy(C.x - C.r, C.z - C.r, C.x + C.r, C.z + C.r);
    disk(ctx, M.ground, C.x, C.z, C.r, C.r, 0.01, [0.55, 0.5, 0.33]);
    if (C.kind === 'camp') {
      // たき火・テント・丸太のいす
      ctx.B.geom(M.glow, new THREE.ConeGeometry(0.6, 0.5, 6), new THREE.Matrix4().makeTranslation(C.x, 0.25, C.z), { col: [3, 1.2, 0.3] });
      ctx.B.geom(M.flame, new THREE.PlaneGeometry(1.4, 1.8), new THREE.Matrix4().makeTranslation(C.x, 1.0, C.z));
      ctx.B.geom(M.flame, new THREE.PlaneGeometry(1.4, 1.8), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(C.x, 1.0, C.z));
      pool(ctx, C.x, C.z, 9, [0.9, 0.45, 0.12]);
      ctx.solid(C.x - 0.7, C.z - 0.7, C.x + 0.7, C.z + 0.7, 1);
      for (const a of [0.4, 2.2, 4.1]) { ctx.I.add('log', C.x + Math.cos(a) * 4, 0, C.z + Math.sin(a) * 4, -a + Math.PI / 2, 0.5); }
      ctx.prop('tent', C.x - 8, C.z - 6, 0.3); ctx.prop('tent', C.x + 8, C.z - 5, -0.4);
      decal(ctx, 7, C.x, C.z, 3, 0, 0.02);
    } else if (C.kind === 'heli') {
      // 墜落したヘリ(ボディ・尾・回転翼)
      const { B } = ctx, col = [0.3, 0.34, 0.25];
      B.box(M.plain, C.x - 3, 0, C.z - 1.6, C.x + 3, 2.6, C.z + 1.6, { col, rot: 0.4 });
      B.box(M.plain, C.x - 2.2, 1.0, C.z - 1.65, C.x + 1.6, 2.2, C.z + 1.65, { col: [0.06, 0.07, 0.08], rot: 0.4 });
      B.box(M.plain, C.x + 2.5, 1.4, C.z - 0.4, C.x + 10, 2.2, C.z + 0.4, { col, rot: 0.4, bx: C.x, bz: C.z });
      B.box(M.plain, C.x - 6, 0.05, C.z + 3, C.x + 1, 0.2, C.z + 3.4, { col: [0.15, 0.15, 0.15], rot: 1.2 });
      ctx.solid(C.x - 3.5, C.z - 3, C.x + 3.5, C.z + 3, 2.6);
      ctx.B.geom(M.flame, new THREE.PlaneGeometry(2.4, 3), new THREE.Matrix4().makeTranslation(C.x + 0.5, 3.4, C.z));
      ctx.B.geom(M.flame, new THREE.PlaneGeometry(2.4, 3), new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(C.x + 0.5, 3.4, C.z));
      pool(ctx, C.x, C.z, 10, [0.9, 0.42, 0.1]);
      decal(ctx, 7, C.x, C.z, 12, 0.5, 0.02);
      for (let k = 0; k < 4; k++) ctx.prop('rubble', C.x + (rnd() - 0.5) * 16, C.z + (rnd() - 0.5) * 16, rnd() * 6, { solid: false });
    } else if (C.kind === 'tower') {
      // 見はり台(足は当たり判定)
      const { B } = ctx, wc = [0.45, 0.32, 0.2];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box(M.wood, C.x + sx * 2 - 0.2, 0, C.z + sz * 2 - 0.2, C.x + sx * 2 + 0.2, 9, C.z + sz * 2 + 0.2, { col: wc }); ctx.solid(C.x + sx * 2 - 0.25, C.z + sz * 2 - 0.25, C.x + sx * 2 + 0.25, C.z + sz * 2 + 0.25, 9); }
      B.box(M.wood, C.x - 2.6, 9, C.z - 2.6, C.x + 2.6, 9.3, C.z + 2.6, { col: wc });
      B.box(M.wood, C.x - 2.6, 9.3, C.z - 2.6, C.x + 2.6, 10.4, C.z - 2.4, { col: wc }); B.box(M.wood, C.x - 2.6, 9.3, C.z + 2.4, C.x + 2.6, 10.4, C.z + 2.6, { col: wc });
      B.box(M.plain, C.x - 3, 12, C.z - 3, C.x + 3, 12.3, C.z + 3, { col: [0.35, 0.25, 0.18] });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M.wood, C.x + sx * 2.5 - 0.08, 9.3, C.z + sz * 2.5 - 0.08, C.x + sx * 2.5 + 0.08, 12, C.z + sz * 2.5 + 0.08, { col: wc });
      ctx.B.box(M.glow, C.x - 0.3, 10.6, C.z - 0.3, C.x + 0.3, 11.2, C.z + 0.3, { col: [3, 2, 0.8] });
    }
  }
}

// 森: すき間を空けながら木を植える。マップの端は こく(自然な壁)
function forest(ctx) {
  const { rnd, half } = ctx;
  const G = 5.5;
  const kinds = ['pine', 'pine', 'pine', 'broad', 'broad', 'birch', 'dead'];
  for (let z = -half + 1; z < half - 1; z += G) for (let x = -half + 1; x < half - 1; x += G) {
    const px = x + rnd() * G, pz = z + rnd() * G;
    const zn = ctx.zoneAt(px, pz);
    const edge = Math.min(half - Math.abs(px), half - Math.abs(pz));
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    let p;
    if (edge < 14) p = 0.95;                       // 端は こい林
    else if (zn === 'forest') p = 0.4;
    else if (zn === 'park') p = 0.12;
    else if (zn === 'suburb') p = 0.06;
    else if (zn === 'industrial') p = 0.02;
    else continue;
    if (r1 > p) {
      // 木がない所: しげみ・岩・倒木・草
      if (zn === 'forest' || zn === 'park') {
        if (r2 < 0.25 && ctx.isFree(px, pz, 0.6)) ctx.I.add('bush', px, 0, pz, r3 * 6, 0.6 + r4 * 0.6);
        else if (r2 < 0.31 && zn === 'forest' && ctx.isFree(px, pz, 1.5)) { const s = 0.7 + r3 * 1.3; ctx.I.add('rock', px, 0, pz, r4 * 6, [s, s * (0.6 + r3 * 0.5), s * 1.1]); ctx.solid(px - s * 0.75, pz - s * 0.75, px + s * 0.75, pz + s * 0.75, s); ctx.occupy(px - 1.5, pz - 1.5, px + 1.5, pz + 1.5); }
        else if (r2 < 0.34 && zn === 'forest' && ctx.isFree(px, pz, 3)) { const a = r3 < 0.5 ? 0 : Math.PI / 2; ctx.I.add('log', px, 0, pz, a, 1); if (a === 0) ctx.solid(px - 2.4, pz - 0.35, px + 2.4, pz + 0.35, 0.7); else ctx.solid(px - 0.35, pz - 2.4, px + 0.35, pz + 2.4, 0.7); ctx.occupy(px - 3, pz - 3, px + 3, pz + 3); }
        else if (r2 < 0.6) ctx.I.add('grass', px, 0, pz, r3 * 6, 0.8 + r4 * 0.8);
      }
      continue;
    }
    if (!ctx.isFree(px, pz, 1.2)) continue;
    const kind = zn === 'park' ? (r2 < 0.7 ? 'broad' : 'birch') : kinds[Math.floor(r2 * kinds.length)];
    const s = edge < 14 ? 1.1 + r3 * 0.6 : 0.8 + r3 * 0.6;
    const tint = [0.85 + r4 * 0.3, 0.85 + r3 * 0.25, 0.85 + r2 * 0.2];
    placeTree(ctx, kind, px, pz, s, r4 * 6.28, tint);
    if (edge < 14 && ctx.isFree(px + 2, pz + 2, 0.5)) ctx.I.add('bush', px + 2, 0, pz + 2, r2 * 6, 1 + r3 * 0.5);
  }
}

// マップの外: 地面と こい森(見えるだけ。外へは出られない)
function outside(ctx) {
  const { B, M, rnd, half } = ctx;
  const W = 70, E = half + W;
  const col = [0.4, 0.38, 0.26];
  for (let s = -E; s < E; s += 40) {
    const L = Math.min(40, E - s);
    for (const [cx, cz, sx, sz] of [[s + L / 2, -half - W / 2, L, W], [s + L / 2, half + W / 2, L, W]]) B.flat(M.ground, cx, -0.01, cz, sx, sz, { col });
    if (s >= -half && s < half) for (const [cx, cz, sx, sz] of [[-half - W / 2, s + L / 2, W, L], [half + W / 2, s + L / 2, W, L]]) B.flat(M.ground, cx, -0.01, cz, sx, sz, { col });
  }
  const G = 6.5;
  for (let z = -E; z < E; z += G) for (const [xa, xb] of (Math.abs(z + G / 2) < half - G ? [[-E, -half], [half, E]] : [[-E, E]])) for (let x = xa; x < xb; x += G) {
    const px = x + rnd() * G, pz = z + rnd() * G;
    if (Math.abs(px) < half + 1 && Math.abs(pz) < half + 1) continue;
    const r = rnd(), s = 1.2 + rnd() * 0.7;
    ctx.I.add(r < 0.75 ? 'pine' : r < 0.9 ? 'broad' : 'dead', px, 0, pz, rnd() * 6.28, s, [0.8 + rnd() * 0.3, 0.85 + rnd() * 0.25, 0.85]);
  }
}

// 公園(町の南)と 学校
function park(ctx) {
  const { B, M, rnd } = ctx;
  const T = TOWN.ext;
  // 舗装の道
  const walk = (x0, z0, x1, z1) => { B.box(M.sidewalk, x0, 0, z0, x1, 0.08, z1, { skip: 'b', col: [0.85, 0.8, 0.7] }); ctx.occupy(x0 - 1, z0 - 1, x1 + 1, z1 + 1); ctx.mapRect(x0, z0, x1, z1, '#8a8070'); };
  walk(-42, T[3], -38, 368); walk(38, T[3], 42, 368); walk(-188, 298, 188, 302);
  walk(-38, 248, 38, 252);
  // 噴水の広場
  disk(ctx, M.pave, 0, 250, 16, 16, 0.06, [0.95, 0.9, 0.85]);
  ctx.occupy(-17, 233, 17, 267);
  ctx.B.geom(M.plain, new THREE.CylinderGeometry(5.2, 5.4, 0.8, 24, 1, true), new THREE.Matrix4().makeTranslation(0, 0.4, 250), { col: [0.7, 0.68, 0.64] });
  ctx.B.geom(M.plain, new THREE.RingGeometry(4.7, 5.2, 24).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.8, 250), { col: [0.75, 0.73, 0.69] });
  ctx.B.geom(M.plain, new THREE.CylinderGeometry(4.7, 4.7, 0.8, 24, 1, true).scale(-1, 1, 1), new THREE.Matrix4().makeTranslation(0, 0.4, 250), { col: [0.5, 0.5, 0.48] });
  disk(ctx, M.water, 0, 250, 4.8, 4.8, 0.62, [1, 1, 1], 24);
  ctx.B.geom(M.plain, new THREE.CylinderGeometry(0.6, 0.9, 3.2, 10), new THREE.Matrix4().makeTranslation(0, 1.6, 250), { col: [0.7, 0.68, 0.64] });
  ctx.B.geom(M.plain, new THREE.CylinderGeometry(1.8, 1.2, 0.4, 16), new THREE.Matrix4().makeTranslation(0, 3.0, 250), { col: [0.7, 0.68, 0.64] });
  ctx.solid(-4.2, 245.8, 4.2, 254.2, 0.8);
  for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2 + 0.39; ctx.prop('bench', Math.cos(t) * 11, 250 + Math.sin(t) * 11, -t - Math.PI / 2); }
  for (let a = 0; a < 4; a++) { const t = a / 4 * Math.PI * 2 + 0.78; lamp(ctx, Math.cos(t) * 14, 250 + Math.sin(t) * 14, -t, 0.06); }
  ctx.mapCircle(0, 250, 16, '#8a8070');
  // 遊び場
  ctx.prop('slide', -90, 262, 0.3); ctx.prop('swing', -78, 266, 0); ctx.prop('slide', -84, 276, -0.8);
  disk(ctx, M.ground, -84, 268, 12, 10, 0.012, [0.7, 0.6, 0.42]);
  // 道ぞいの街灯とベンチ
  for (let z = 200; z < 365; z += 24) { lamp(ctx, -44, z, 0); lamp(ctx, 44, z + 12, Math.PI); if (rnd() < 0.6) ctx.prop('bench', -36, z + 6, -Math.PI / 2); }
  for (let x = -180; x < 185; x += 30) lamp(ctx, x, 304, -Math.PI / 2);
  // 池のまわりの柵
  // 学校の校舎(体育館の南。中に入れない)と校庭
  tower(ctx, -178, 246, -124, 268, 13, { y: 0, style: M.ribbon });
  disk(ctx, M.ground, -150, 285, 26, 12, 0.012, [0.7, 0.58, 0.4]);
  ctx.occupy(-178, 272, -122, 298);
  for (const x of [-172, -128]) { ctx.B.box(M.plain, x - 0.1, 0, 281, x + 0.1, 2.4, 289, { col: [0.95, 0.95, 0.95] }); ctx.solid(x - 0.15, 281, x + 0.15, 289, 2.4); }
  // 落ち葉・血
  for (let k = 0; k < 40; k++) decal(ctx, [5, 5, 1, 9][k % 4], -180 + rnd() * 360, 195 + rnd() * 170, 2.5 + rnd() * 2, rnd() * 6, 0.02);
}
