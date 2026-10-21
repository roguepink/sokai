// マップ係: 小道具の形(車・街灯・ドラム缶・土のう・家具・木 …)と、置く道具。
// 小道具は Builder でまとめ描き(区画ごとに 1 回で描ける)。木・岩はたくさんなので InstancedMesh。
import * as THREE from 'three';
import { makeGeo, col3 } from './world-build.js';
import { seeded } from './util.js';

export const PROPS = {};
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4();

const DARK = [0.05, 0.05, 0.055], GLASS = [0.05, 0.065, 0.085], GRAY = [0.35, 0.35, 0.36], METAL = [0.25, 0.26, 0.28];

// 円柱(Y 方向)を足す
function cyl(b, x, y, z, r, h, col, seg = 10, rx = 0, rz = 0, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg, 1);
  _m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz)); _m.setPosition(x, y, z);
  b.geom(null, g, _m, { col });
}
function bx(b, x0, y0, z0, x1, y1, z1, col, o = {}) { b.box(null, x0, y0, z0, x1, y1, z1, { col, skip: 'b', ...o }); }

function wheels(b, xs, z, r, w = 0.26) { for (const x of xs) for (const s of [-1, 1]) cyl(b, x, r, s * z, r, w, DARK, 10, Math.PI / 2); }

function sedanGeo(extra) {
  return makeGeo((b) => {
    bx(b, -2.2, 0.32, -0.88, 2.2, 0.92, 0.88, [1, 1, 1]);
    bx(b, -2.25, 0.3, -0.84, -2.15, 0.6, 0.84, GRAY); bx(b, 2.15, 0.3, -0.84, 2.25, 0.6, 0.84, GRAY);
    bx(b, -1.15, 0.92, -0.8, 0.95, 1.4, 0.8, GLASS);
    bx(b, -0.95, 1.4, -0.76, 0.75, 1.47, 0.76, [1, 1, 1]);
    for (const s of [-1, 1]) {
      bx(b, 2.2, 0.66, s * 0.78 - 0.14, 2.25, 0.82, s * 0.78 + 0.14, [2.2, 2.0, 1.6]);
      bx(b, -2.25, 0.66, s * 0.78 - 0.14, -2.2, 0.82, s * 0.78 + 0.14, [1.2, 0.06, 0.04]);
    }
    wheels(b, [-1.35, 1.35], 0.8, 0.36);
    if (extra) extra(b);
  });
}

export function defineProps(ctx) {
  const { M, I } = ctx;
  const P = (name, parts, w, d, h = 1) => { PROPS[name] = { parts, w, d, h }; };
  const plain = M.plain, car = M.car;

  // ---------- 乗り物 ----------
  P('sedan', [{ geo: sedanGeo(), mat: car, tint: true }], 4.4, 1.8, 1.5);
  P('police', [{ geo: sedanGeo((b) => {
    bx(b, -1.0, 0.33, -0.89, 1.0, 0.9, 0.89, [0.03, 0.03, 0.03]);   // ドアは黒
    bx(b, -0.35, 1.47, -0.6, 0.35, 1.62, -0.02, [2.5, 0.08, 0.05]); bx(b, -0.35, 1.47, 0.02, 0.35, 1.62, 0.6, [0.1, 0.25, 2.5]);
  }), mat: car }], 4.4, 1.8, 1.6);
  P('van', [{ geo: makeGeo((b) => {
    bx(b, -2.5, 0.36, -1, 2.5, 2.2, 1, [1, 1, 1]);
    bx(b, 1.75, 1.2, -0.96, 2.52, 1.95, 0.96, GLASS); bx(b, 0.2, 1.35, -1.01, 1.7, 1.9, 1.01, GLASS);
    bx(b, 2.5, 0.36, -0.95, 2.6, 0.7, 0.95, GRAY);
    for (const s of [-1, 1]) bx(b, 2.5, 0.8, s * 0.8 - 0.12, 2.54, 0.95, s * 0.8 + 0.12, [2.2, 2, 1.6]);
    wheels(b, [-1.6, 1.6], 0.9, 0.4);
  }), mat: car, tint: true }], 5, 2, 2.2);
  P('bus', [{ geo: makeGeo((b) => {
    bx(b, -5.5, 0.45, -1.25, 5.5, 3.1, 1.25, [1, 1, 1]);
    bx(b, -5.1, 1.7, -1.27, 5.0, 2.7, 1.27, GLASS);
    bx(b, 5.45, 0.9, -1.15, 5.55, 2.8, 1.15, GLASS);
    bx(b, -5.52, 0.5, -1.2, -5.45, 1.2, 1.2, GRAY);
    bx(b, -2, 3.1, -0.8, 1, 3.4, 0.8, GRAY);
    bx(b, -5.5, 0.45, -1.26, 5.5, 0.8, 1.26, [0.3, 0.3, 0.3]);
    wheels(b, [-3.6, 3.4], 1.05, 0.52, 0.32);
  }), mat: car, tint: true }], 11, 2.5, 3.4);
  P('truck', [{ geo: makeGeo((b) => {
    bx(b, 3.0, 0.5, -1.2, 5.2, 3.0, 1.2, [1, 1, 1]);
    bx(b, 4.6, 1.8, -1.15, 5.22, 2.8, 1.15, GLASS);
    bx(b, -4.6, 0.9, -1.25, 2.9, 3.9, 1.25, [0.85, 0.85, 0.82]);
    bx(b, -4.6, 0.6, -1.0, 5.0, 0.9, 1.0, [0.2, 0.2, 0.2]);
    wheels(b, [-3.4, -2.2, 4.2], 1.05, 0.5, 0.3);
  }), mat: car, tint: true }], 10, 2.5, 3.9);
  P('forklift', [{ geo: makeGeo((b) => {
    bx(b, -1.2, 0.3, -0.6, 0.6, 1.2, 0.6, [0.95, 0.7, 0.08]);
    bx(b, -1.3, 0.3, -0.65, -0.9, 1.1, 0.65, [0.2, 0.2, 0.2]);
    for (const s of [-1, 1]) bx(b, -0.6, 1.2, s * 0.5 - 0.05, -0.5, 2.2, s * 0.5 + 0.05, DARK);
    bx(b, -0.6, 2.1, -0.55, 0.3, 2.2, 0.55, DARK);
    for (const s of [-1, 1]) bx(b, 0.6, 0.2, s * 0.45 - 0.07, 0.7, 2.4, s * 0.45 + 0.07, METAL);
    for (const s of [-1, 1]) bx(b, 0.7, 0.12, s * 0.35 - 0.06, 1.9, 0.2, s * 0.35 + 0.06, METAL);
    wheels(b, [-0.8, 0.3], 0.55, 0.3, 0.22);
  }), mat: plain }], 2.4, 1.3, 2.4);

  // ---------- 通りの道具 ----------
  P('lamp', [{ geo: makeGeo((b) => {
    bx(b, -0.22, 0, -0.22, 0.22, 0.5, 0.22, METAL);
    cyl(b, 0, 3.9, 0, 0.09, 7.6, METAL, 8, 0, 0, 0.13);
    bx(b, 0, 7.5, -0.06, 1.9, 7.62, 0.06, METAL);
    bx(b, 1.4, 7.25, -0.24, 2.15, 7.5, 0.24, DARK);
  }), mat: plain }, { geo: makeGeo((b) => bx(b, 1.45, 7.2, -0.19, 2.1, 7.25, 0.19, [3.2, 2.4, 1.5], { skip: 'tb' })), mat: M.glow }], 0.45, 0.45, 7.6);
  // 下面だけ光る板にする(上の箱の skip を見直し)
  PROPS.lamp.parts[1].geo = makeGeo((b) => b.box(null, 1.45, 7.18, -0.19, 2.1, 7.25, 0.19, { col: [3.2, 2.4, 1.5] }));
  P('tlight', [{ geo: makeGeo((b) => {
    bx(b, -0.2, 0, -0.2, 0.2, 0.4, 0.2, METAL);
    cyl(b, 0, 3, 0, 0.12, 6, [0.22, 0.24, 0.2], 8);
    bx(b, 0, 5.65, -0.07, 4.6, 5.8, 0.07, [0.22, 0.24, 0.2]);
    bx(b, 4.0, 4.55, -0.28, 4.45, 5.65, 0.28, [0.15, 0.15, 0.12]);
  }), mat: plain }, { geo: makeGeo((b) => {
    for (const s of [-1, 1]) {
      bx(b, 4.08, 5.25, s * 0.29 - 0.0, 4.37, 5.5, s * 0.29 + s * 0.03, [3, 0.25, 0.1]);
      bx(b, 4.08, 4.95, s * 0.29, 4.37, 5.2, s * 0.29 + s * 0.03, [0.25, 0.18, 0.02]);
      bx(b, 4.08, 4.65, s * 0.29, 4.37, 4.9, s * 0.29 + s * 0.03, [0.02, 0.2, 0.08]);
    }
  }), mat: M.glow }], 0.4, 0.4, 6);
  P('barrel', [{ geo: makeGeo((b) => { cyl(b, 0, 0.45, 0, 0.32, 0.9, [0.5, 0.18, 0.1], 12); cyl(b, 0, 0.3, 0, 0.33, 0.04, [0.2, 0.08, 0.05], 12); cyl(b, 0, 0.62, 0, 0.33, 0.04, [0.2, 0.08, 0.05], 12); }), mat: plain, tint: true }], 0.7, 0.7, 0.9);
  const flameGeo = makeGeo((b) => {
    for (const a of [0, Math.PI / 2]) { const g = new THREE.PlaneGeometry(0.95, 1.7); _m.makeRotationY(a); _m.setPosition(0, 1.65, 0); b.geom(null, g, _m); }
  });
  P('fireBarrel', [...PROPS.barrel.parts, { geo: makeGeo((b) => { cyl(b, 0, 0.91, 0, 0.29, 0.02, [2.5, 0.9, 0.2], 12); }), mat: M.glow }, { geo: flameGeo, mat: M.flame }], 0.7, 0.7, 0.9);
  P('dumpster', [{ geo: makeGeo((b) => {
    bx(b, -1, 0.15, -0.6, 1, 1.25, 0.6, [1, 1, 1]);
    bx(b, -1.05, 1.25, -0.66, 1.05, 1.34, 0.66, [0.6, 0.6, 0.6]);
    bx(b, -1.05, 0.9, -0.62, 1.05, 1.0, 0.62, [0.7, 0.7, 0.7]);
    for (const x of [-0.8, 0.8]) for (const z of [-0.45, 0.45]) cyl(b, x, 0.08, z, 0.08, 0.16, DARK, 6);
  }), mat: plain, tint: true }], 2.1, 1.3, 1.35);
  P('barricade', [{ geo: makeGeo((b) => {
    for (const x of [-1.05, 1.05]) for (const z of [-0.25, 0.25]) bx(b, x - 0.05, 0, z - 0.05, x + 0.05, 1.05, z + 0.05, [0.85, 0.85, 0.82], { rot: 0 });
    for (let i = 0; i < 6; i++) {
      const c = i % 2 ? [0.95, 0.95, 0.92] : [0.95, 0.38, 0.05];
      bx(b, -1.2 + i * 0.4, 0.75, -0.05, -0.8 + i * 0.4, 1.0, 0.05, c);
      bx(b, -1.2 + i * 0.4, 0.35, -0.05, -0.8 + i * 0.4, 0.55, 0.05, i % 2 ? [0.95, 0.38, 0.05] : [0.95, 0.95, 0.92]);
    }
  }), mat: plain }], 2.4, 0.6, 1.05);
  P('jersey', [{ geo: makeGeo((b) => {
    bx(b, -1.5, 0, -0.32, 1.5, 0.3, 0.32, [0.72, 0.71, 0.68]);
    bx(b, -1.5, 0.3, -0.2, 1.5, 0.55, 0.2, [0.72, 0.71, 0.68]);
    bx(b, -1.5, 0.55, -0.13, 1.5, 0.85, 0.13, [0.72, 0.71, 0.68]);
    bx(b, -1.5, 0.12, -0.33, 1.5, 0.2, 0.33, [0.85, 0.6, 0.15]);
  }), mat: plain }], 3, 0.65, 0.85);
  const rs = seeded(4242);
  P('sandbag', [{ geo: makeGeo((b) => {
    for (let row = 0; row < 3; row++) {
      const y = row * 0.32, off = (row % 2) * 0.3;
      for (let i = -1; i < 5; i++) {
        const x0 = -1.5 + i * 0.6 + off, x1 = x0 + 0.56;
        if (x1 < -1.5 || x0 > 1.5) continue;
        const v = 0.85 + rs() * 0.25;
        for (const z of [-0.22, 0.22]) bx(b, Math.max(-1.5, x0), y, z - 0.2, Math.min(1.5, x1), y + 0.3, z + 0.2, [0.6 * v, 0.53 * v, 0.38 * v]);
      }
    }
  }), mat: plain }], 3, 0.9, 0.95);
  P('bench', [{ geo: makeGeo((b) => {
    bx(b, -0.9, 0.42, -0.25, 0.9, 0.5, 0.22, [0.45, 0.28, 0.15]);
    bx(b, -0.9, 0.55, 0.18, 0.9, 0.95, 0.24, [0.45, 0.28, 0.15]);
    for (const x of [-0.75, 0.75]) { bx(b, x - 0.04, 0, -0.22, x + 0.04, 0.42, -0.15, DARK); bx(b, x - 0.04, 0, 0.15, x + 0.04, 0.95, 0.22, DARK); }
  }), mat: plain }], 1.8, 0.5, 0.95);
  P('hydrant', [{ geo: makeGeo((b) => { cyl(b, 0, 0.32, 0, 0.13, 0.64, [0.75, 0.08, 0.05], 8); cyl(b, 0, 0.68, 0, 0.1, 0.12, [0.75, 0.08, 0.05], 8, 0, 0, 0.04); cyl(b, 0, 0.45, 0, 0.06, 0.4, [0.6, 0.06, 0.04], 6, 0, Math.PI / 2); }), mat: plain }], 0.35, 0.35, 0.75);
  P('trashcan', [{ geo: makeGeo((b) => { cyl(b, 0, 0.45, 0, 0.28, 0.9, [0.25, 0.3, 0.27], 10); cyl(b, 0, 0.92, 0, 0.3, 0.05, [0.2, 0.22, 0.2], 10); }), mat: plain }], 0.6, 0.6, 0.95);
  P('cone', [{ geo: makeGeo((b) => { bx(b, -0.22, 0, -0.22, 0.22, 0.04, 0.22, [0.9, 0.35, 0.05]); const g = new THREE.ConeGeometry(0.18, 0.7, 8); _m.makeTranslation(0, 0.39, 0); b.geom(null, g, _m, { col: [0.95, 0.4, 0.05] }); cyl(b, 0, 0.42, 0, 0.115, 0.1, [0.95, 0.95, 0.95], 8, 0, 0, 0.1); }), mat: plain }], 0.4, 0.4, 0.75);
  P('crate', [{ geo: makeGeo((b) => b.box(null, -0.6, 0, -0.6, 0.6, 1.2, 0.6, { s: [1.2, 1.2], skip: 'b' })), mat: M.wood, tint: true }], 1.2, 1.2, 1.2);
  P('pallet', [{ geo: makeGeo((b) => {
    bx(b, -0.6, 0, -0.5, 0.6, 0.15, 0.5, [0.55, 0.42, 0.25]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) bx(b, -0.55 + i * 0.28, 0.15, -0.45 + j * 0.47, -0.3 + i * 0.28, 0.55, -0.02 + j * 0.47, [0.6, 0.47, 0.3]);
    bx(b, -0.58, 0.55, -0.48, 0.58, 0.95, 0.48, [0.62, 0.5, 0.33]);
  }), mat: plain, tint: true }], 1.2, 1.0, 0.95);
  P('container', [{ geo: makeGeo((b) => {
    b.box(null, -6, 0, -1.22, 6, 2.6, 1.22, { s: [3, 2.6], skip: 'b', col: [1, 1, 1] });
    for (const s of [-1, 1]) bx(b, s * 6 - 0.03, 0.1, -1.1, s * 6 + 0.03, 2.5, 1.1, [0.6, 0.6, 0.6]);
  }), mat: M.metal, tint: true }], 12, 2.44, 2.6);
  P('tires', [{ geo: makeGeo((b) => { for (let i = 0; i < 4; i++) { const g = new THREE.TorusGeometry(0.38, 0.14, 6, 12); _m.makeRotationX(Math.PI / 2); _m.setPosition(0, 0.14 + i * 0.27, 0); b.geom(null, g, _m, { col: DARK }); } }), mat: plain }], 1, 1, 1.1);
  P('busstop', [{ geo: makeGeo((b) => {
    for (const x of [-1.9, 1.9]) bx(b, x - 0.06, 0, 0.5, x + 0.06, 2.5, 0.62, METAL);
    bx(b, -2.1, 2.5, -0.5, 2.1, 2.62, 0.75, [0.3, 0.32, 0.35]);
    bx(b, -1.9, 0.2, 0.55, 1.9, 2.4, 0.58, [0.25, 0.32, 0.38]);
    bx(b, -1.5, 0.45, 0.2, 1.5, 0.52, 0.5, [0.4, 0.4, 0.42]);
    bx(b, 1.95, 0.5, 0.52, 2.0, 2.2, 0.6, [2.0, 1.9, 1.6]);
  }), mat: plain }], 4.2, 1.3, 2.6);
  P('tent', [{ geo: makeGeo((b) => {
    const g = new THREE.CylinderGeometry(1.8, 1.8, 4, 3, 1); _m.makeRotationZ(Math.PI / 2); _r.makeRotationX(Math.PI); _m.multiply(_r); _m.setPosition(0, 0.9, 0);
    _s.makeScale(1, 1, 1.15); _s.multiply(_m); b.geom(null, g, _s, { col: [0.33, 0.37, 0.22] });
  }), mat: plain }], 4, 3.6, 2.7);
  P('rubble', [{ geo: makeGeo((b) => {
    const r = seeded(77);
    for (let i = 0; i < 12; i++) { const s = 0.2 + r() * 0.5, x = (r() - 0.5) * 2.2, z = (r() - 0.5) * 1.8; const v = 0.4 + r() * 0.3; bx(b, x - s, 0, z - s * 0.7, x + s, s * (0.4 + r()), z + s * 0.7, [v, v * 0.95, v * 0.9], { rot: r() * 3 }); }
    for (let i = 0; i < 3; i++) bx(b, -1 + i * 0.7, 0.05, -0.05, 0.2 + i * 0.7, 0.12, 0.05, [0.4, 0.25, 0.15], { rot: r() * 3 });
  }), mat: plain }], 2.6, 2.0, 0.8);
  P('trashbags', [{ geo: makeGeo((b) => {
    const r = seeded(91);
    for (let i = 0; i < 6; i++) { const g = new THREE.IcosahedronGeometry(0.35 + r() * 0.15, 0); _m.makeScale(1, 0.75, 1); _m.setPosition((r() - 0.5) * 1.6, 0.25, (r() - 0.5) * 1.0); b.geom(null, g, _m, { col: r() < 0.5 ? [0.05, 0.06, 0.05] : [0.12, 0.18, 0.1] }); }
  }), mat: plain }], 1.8, 1.2, 0.6);
  P('ac', [{ geo: makeGeo((b) => { bx(b, -0.8, 0, -0.6, 0.8, 1.0, 0.6, [0.7, 0.72, 0.72]); cyl(b, 0, 1.01, 0, 0.45, 0.04, DARK, 12); }), mat: plain }], 1.6, 1.2, 1);
  P('watertank', [{ geo: makeGeo((b) => {
    for (const x of [-1, 1]) for (const z of [-1, 1]) bx(b, x - 0.08, 0, z - 0.08, x + 0.08, 1.4, z + 0.08, METAL);
    cyl(b, 0, 2.6, 0, 1.5, 2.4, [0.55, 0.45, 0.35], 12); const g = new THREE.ConeGeometry(1.55, 0.7, 12); _m.makeTranslation(0, 4.15, 0); b.geom(null, g, _m, { col: [0.4, 0.33, 0.25] });
  }), mat: plain }], 3.2, 3.2, 4.5);
  P('bigtank', [{ geo: makeGeo((b) => {
    cyl(b, 0, 6, 0, 7, 12, [0.82, 0.82, 0.8], 20); const g = new THREE.ConeGeometry(7.2, 1.6, 20); _m.makeTranslation(0, 12.8, 0); b.geom(null, g, _m, { col: [0.7, 0.7, 0.68] });
    cyl(b, 0, 3, 0, 7.05, 0.3, [0.55, 0.2, 0.15], 20); bx(b, 6.9, 0, -0.4, 7.4, 12, 0.4, METAL);
  }), mat: plain }], 14, 14, 13);
  P('machine', [{ geo: makeGeo((b) => {
    bx(b, -2, 0, -1.2, 2, 1.6, 1.2, [0.35, 0.45, 0.5]); bx(b, -1.6, 1.6, -0.9, 0.6, 2.6, 0.9, [0.4, 0.5, 0.55]);
    cyl(b, 1.2, 2.2, 0, 0.5, 1.2, [0.6, 0.6, 0.6], 10); bx(b, -2.02, 0.8, -0.5, -1.98, 1.3, 0.5, [0.1, 0.1, 0.1]);
    bx(b, -2.05, 1.0, 0.6, -2.0, 1.15, 0.75, [2.5, 0.4, 0.1]); bx(b, -2, 0, -1.25, 2, 0.15, 1.25, [0.85, 0.7, 0.1]);
  }), mat: plain, tint: true }], 4, 2.5, 2.6);
  P('conveyor', [{ geo: makeGeo((b) => {
    bx(b, -4, 0.8, -0.6, 4, 1.0, 0.6, [0.12, 0.12, 0.12]);
    for (const s of [-1, 1]) bx(b, -4, 0.75, s * 0.65 - 0.06, 4, 1.08, s * 0.65 + 0.06, [0.85, 0.7, 0.1]);
    for (let x = -3.6; x <= 3.6; x += 1.8) for (const s of [-1, 1]) bx(b, x - 0.05, 0, s * 0.6 - 0.05, x + 0.05, 0.8, s * 0.6 + 0.05, METAL);
    for (let i = 0; i < 4; i++) bx(b, -3 + i * 1.9, 1.0, -0.3, -2.4 + i * 1.9, 1.5, 0.3, [0.6, 0.45, 0.28]);
  }), mat: plain }], 8, 1.4, 1.5);
  P('rack', [{ geo: makeGeo((b) => {
    const r = seeded(55);
    for (const x of [-4, 0, 4]) for (const z of [-0.6, 0.6]) bx(b, x - 0.06, 0, z - 0.06, x + 0.06, 4.2, z + 0.06, [0.15, 0.3, 0.6]);
    for (const y of [0.15, 1.5, 2.85]) {
      for (const z of [-0.6, 0.6]) bx(b, -4, y, z - 0.05, 4, y + 0.12, z + 0.05, [0.95, 0.45, 0.08]);
      for (let x = -3.8; x < 3.6; x += 1.3) if (r() < 0.8) { const hh = 0.5 + r() * 0.7, v = 0.8 + r() * 0.3; bx(b, x, y + 0.12, -0.5, x + 1.15, y + 0.12 + hh, 0.5, [0.62 * v, 0.47 * v, 0.3 * v]); }
    }
  }), mat: plain }], 8.2, 1.4, 4.2);
  const shelfGeo = (seed) => makeGeo((b) => {
    const r = seeded(seed);
    bx(b, -3, 0, -0.5, 3, 0.15, 0.5, [0.85, 0.85, 0.85]);
    bx(b, -3, 0.15, -0.05, 3, 1.9, 0.05, [0.75, 0.75, 0.78]);
    const cols = [[0.85, 0.2, 0.15], [0.2, 0.45, 0.85], [0.95, 0.8, 0.15], [0.25, 0.7, 0.3], [0.9, 0.9, 0.85], [0.95, 0.5, 0.1], [0.6, 0.25, 0.6]];
    for (const y of [0.15, 0.6, 1.05, 1.5]) {
      bx(b, -3, y, -0.5, 3, y + 0.04, 0.5, [0.8, 0.8, 0.8]);
      for (const sd of [-1, 1]) for (let x = -2.9; x < 2.8; x += 0.38) if (r() < 0.75) {
        const c = cols[Math.floor(r() * cols.length)], hh = 0.18 + r() * 0.2;
        bx(b, x, y + 0.04, sd > 0 ? 0.08 : -0.45, x + 0.32, y + 0.04 + hh, sd > 0 ? 0.45 : -0.08, c);
      }
    }
  });
  P('shelf', [{ geo: shelfGeo(11), mat: plain }], 6, 1, 1.9);
  P('shelf2', [{ geo: shelfGeo(12), mat: plain }], 6, 1, 1.9);
  P('bed', [{ geo: makeGeo((b) => {
    bx(b, -1.05, 0.25, -0.5, 1.05, 0.45, 0.5, [0.6, 0.62, 0.65]);
    for (const x of [-1, 1]) for (const z of [-0.45, 0.45]) bx(b, x - 0.04, 0, z - 0.04, x + 0.04, 0.3, z + 0.04, METAL);
    bx(b, -1.0, 0.45, -0.46, 1.0, 0.62, 0.46, [0.85, 0.88, 0.9]);
    bx(b, -0.95, 0.62, -0.35, -0.55, 0.74, 0.35, [0.95, 0.95, 0.95]);
    bx(b, -0.2, 0.62, -0.47, 0.95, 0.68, 0.47, [0.45, 0.6, 0.75]);
    bx(b, -1.1, 0.25, -0.5, -1.04, 0.95, 0.5, METAL);
    bx(b, 0.1, 0.65, -0.3, 0.55, 0.75, 0.15, [0.5, 0.05, 0.03]);
  }), mat: plain }], 2.2, 1.0, 0.95);
  P('desk', [{ geo: makeGeo((b) => {
    bx(b, -0.8, 0.72, -0.4, 0.8, 0.78, 0.4, [0.5, 0.36, 0.22]);
    for (const x of [-0.75, 0.75]) bx(b, x - 0.04, 0, -0.38, x + 0.04, 0.72, 0.38, METAL);
    bx(b, -0.25, 0.78, -0.25, 0.25, 1.15, -0.2, [0.08, 0.08, 0.09]); bx(b, -0.22, 0.81, -0.205, 0.22, 1.12, -0.19, [0.4, 0.6, 0.9]);
    bx(b, 0.3, 0.78, 0.0, 0.6, 0.82, 0.25, [0.92, 0.92, 0.9]);
    bx(b, -0.25, 0, 0.5, 0.25, 0.45, 0.95, [0.15, 0.15, 0.18]); bx(b, -0.25, 0.45, 0.88, 0.25, 0.95, 0.95, [0.15, 0.15, 0.18]);
  }), mat: plain }], 1.6, 1.0, 1.1);
  P('pew', [{ geo: makeGeo((b) => {
    bx(b, -2.5, 0.42, -0.3, 2.5, 0.5, 0.25, [0.35, 0.2, 0.1]);
    bx(b, -2.5, 0.5, 0.2, 2.5, 1.0, 0.28, [0.35, 0.2, 0.1]);
    for (const x of [-2.5, 0, 2.45]) bx(b, x, 0, -0.3, x + 0.06, 0.9, 0.28, [0.3, 0.17, 0.08]);
  }), mat: plain }], 5, 0.6, 1);
  P('counter', [{ geo: makeGeo((b) => {
    bx(b, -2, 0, -0.4, 2, 1.0, 0.4, [1, 1, 1]); bx(b, -2.05, 1.0, -0.45, 2.05, 1.08, 0.45, [0.35, 0.3, 0.28]);
    bx(b, 1.2, 1.08, -0.2, 1.6, 1.3, 0.2, [0.15, 0.15, 0.15]);
  }), mat: plain, tint: true }], 4.1, 0.9, 1.1);
  P('table', [{ geo: makeGeo((b) => {
    bx(b, -0.9, 0.72, -0.6, 0.9, 0.78, 0.6, [0.55, 0.4, 0.25]);
    for (const x of [-0.8, 0.8]) for (const z of [-0.5, 0.5]) bx(b, x - 0.04, 0, z - 0.04, x + 0.04, 0.72, z + 0.04, [0.3, 0.2, 0.12]);
  }), mat: plain }], 1.8, 1.2, 0.8);
  P('sofa', [{ geo: makeGeo((b) => {
    bx(b, -1.1, 0, -0.45, 1.1, 0.45, 0.45, [1, 1, 1]); bx(b, -1.1, 0.45, 0.25, 1.1, 0.9, 0.45, [1, 1, 1]);
    for (const x of [-1.1, 0.9]) bx(b, x, 0.45, -0.45, x + 0.2, 0.65, 0.45, [0.9, 0.9, 0.9]);
  }), mat: plain, tint: true }], 2.2, 0.9, 0.9);
  P('bleacher', [{ geo: makeGeo((b) => {
    for (let i = 0; i < 4; i++) bx(b, -6, 0, -1.6 + i * 0.8, 6, 0.45 + i * 0.45, -0.8 + i * 0.8, i % 2 ? [0.55, 0.42, 0.28] : [0.5, 0.38, 0.25]);
  }), mat: plain }], 12, 3.2, 1.8);
  P('hoop', [{ geo: makeGeo((b) => {
    bx(b, -0.1, 0, -0.1, 0.1, 3.4, 0.1, METAL); bx(b, -0.05, 3.2, 0.1, 0.05, 3.3, 0.9, METAL);
    bx(b, -0.9, 2.9, 0.9, 0.9, 3.95, 0.95, [0.92, 0.92, 0.92]);
    const g = new THREE.TorusGeometry(0.23, 0.02, 4, 12); _m.makeRotationX(Math.PI / 2); _m.setPosition(0, 3.05, 1.2); b.geom(null, g, _m, { col: [0.95, 0.4, 0.05] });
  }), mat: plain }], 0.4, 0.4, 3.9);
  P('pump', [{ geo: makeGeo((b) => {
    bx(b, -0.5, 0, -0.35, 0.5, 0.2, 0.35, [0.5, 0.5, 0.5]);
    bx(b, -0.35, 0.2, -0.25, 0.35, 1.8, 0.25, [0.92, 0.92, 0.9]); bx(b, -0.36, 1.4, -0.26, 0.36, 1.8, 0.26, [0.8, 0.1, 0.08]);
    for (const s of [-1, 1]) bx(b, -0.2, 0.9, s * 0.255, 0.2, 1.25, s * 0.26, [0.15, 0.2, 0.15]);
    cyl(b, 0.42, 1.0, 0, 0.03, 0.8, DARK, 4);
  }), mat: plain }], 1, 0.7, 1.8);
  P('slide', [{ geo: makeGeo((b) => {
    for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) bx(b, x - 0.05, 0, z - 0.05, x + 0.05, 2.6, z + 0.05, [0.85, 0.2, 0.15]);
    bx(b, -0.55, 1.5, -0.55, 0.55, 1.6, 0.55, [0.2, 0.4, 0.8]);
    bx(b, -0.35, 0.2, 0.5, 0.35, 0.3, 3.2, [0.95, 0.75, 0.1], { rot: 0 });
    bx(b, -0.6, 2.6, -0.6, 0.6, 2.75, 0.6, [0.2, 0.6, 0.3]);
  }), mat: plain }], 1.2, 1.2, 2.8);
  P('swing', [{ geo: makeGeo((b) => {
    for (const x of [-1.8, 1.8]) for (const z of [-0.6, 0.6]) bx(b, x - 0.06, 0, z - 0.06, x + 0.06, 2.4, z + 0.06, [0.25, 0.45, 0.75]);
    bx(b, -1.9, 2.4, -0.06, 1.9, 2.5, 0.06, [0.25, 0.45, 0.75]);
    for (const x of [-0.8, 0.8]) { bx(b, x - 0.25, 0.5, -0.12, x + 0.25, 0.56, 0.12, [0.15, 0.15, 0.15]); for (const s of [-0.22, 0.22]) bx(b, x + s - 0.01, 0.56, -0.01, x + s + 0.01, 2.4, 0.01, METAL); }
  }), mat: plain }], 3.8, 1.3, 2.5);
  P('planter', [{ geo: makeGeo((b) => { bx(b, -0.8, 0, -0.8, 0.8, 0.5, 0.8, [0.55, 0.53, 0.5]); bx(b, -0.7, 0.5, -0.7, 0.7, 0.52, 0.7, [0.2, 0.14, 0.08]); }), mat: plain }], 1.6, 1.6, 0.5);
  P('acwall', PROPS.ac.parts, 1.6, 1.2, 1);
  P('locker', [{ geo: makeGeo((b) => { for (let i = 0; i < 5; i++) { bx(b, -1.5 + i * 0.6, 0, -0.25, -0.92 + i * 0.6, 1.9, 0.25, [0.45, 0.55, 0.65]); bx(b, -1.4 + i * 0.6, 1.5, 0.25, -1.0 + i * 0.6, 1.55, 0.26, DARK); } }), mat: plain }], 3, 0.5, 1.9);
  P('cabinet', [{ geo: makeGeo((b) => { bx(b, -0.5, 0, -0.3, 0.5, 1.4, 0.3, [0.75, 0.75, 0.72]); for (let y = 0.2; y < 1.4; y += 0.45) bx(b, -0.12, y + 0.2, 0.3, 0.12, y + 0.25, 0.32, DARK); }), mat: plain }], 1, 0.6, 1.4);
  P('altar', [{ geo: makeGeo((b) => {
    bx(b, -1.6, 0, -0.6, 1.6, 1.0, 0.6, [0.85, 0.82, 0.75]); bx(b, -1.7, 1.0, -0.7, 1.7, 1.08, 0.7, [0.55, 0.1, 0.1]);
    bx(b, -0.06, 1.08, -0.06, 0.06, 1.9, 0.06, [0.85, 0.7, 0.3]); bx(b, -0.3, 1.6, -0.05, 0.3, 1.7, 0.05, [0.85, 0.7, 0.3]);
  }), mat: plain }, { geo: makeGeo((b) => { for (const x of [-1.3, -0.9, 0.9, 1.3]) { cyl(b, x, 1.25, 0, 0.04, 0.35, [1.2, 1.15, 1], 6); cyl(b, x, 1.47, 0, 0.025, 0.08, [3, 1.8, 0.6], 4); } }), mat: M.glow }], 3.4, 1.4, 1.9);

  // ---------- 木・岩(InstancedMesh) ----------
  const fol = M.foliage;
  I.define('pine', makeGeo((b) => {
    cyl(b, 0, 1.6, 0, 0.22, 3.2, [0.3, 0.21, 0.14], 6, 0, 0, 0.12);
    const cones = [[1.9, 3.2, 3.6], [1.5, 2.8, 5.3], [1.05, 2.4, 6.9], [0.6, 1.7, 8.2]];
    cones.forEach(([r, h, y], i) => { const g = new THREE.ConeGeometry(r, h, 7); _m.makeRotationY(i * 0.7); _m.setPosition(0, y, 0); b.geom(null, g, _m, { col: [0.09 + i * 0.015, 0.22 + i * 0.03, 0.15 + i * 0.01] }); });
  }), fol);
  I.define('broad', makeGeo((b) => {
    cyl(b, 0, 2.1, 0, 0.26, 4.2, [0.33, 0.24, 0.16], 6, 0, 0, 0.17);
    const blobs = [[0, 5.3, 0, 1.9, [0.16, 0.32, 0.12]], [1.0, 4.8, 0.5, 1.3, [0.19, 0.36, 0.13]], [-0.9, 4.9, -0.5, 1.35, [0.14, 0.29, 0.11]], [0.2, 6.3, -0.2, 1.2, [0.21, 0.38, 0.15]]];
    for (const [x, y, z, r, c] of blobs) { const g = new THREE.IcosahedronGeometry(r, 1); _m.makeScale(1, 0.82, 1); _m.setPosition(x, y, z); b.geom(null, g, _m, { col: c }); }
  }), fol);
  I.define('dead', makeGeo((b) => {
    cyl(b, 0, 2.5, 0, 0.28, 5, [0.3, 0.27, 0.23], 6, 0, 0, 0.1);
    for (const [a, y, l] of [[0.5, 3.0, 2.0], [2.6, 3.6, 1.8], [4.3, 2.4, 1.6], [1.6, 4.3, 1.3]]) {
      const g = new THREE.CylinderGeometry(0.04, 0.1, l, 4); _m.makeRotationFromEuler(new THREE.Euler(0, a, 0.9)); _m.setPosition(Math.cos(a) * l * 0.35, y + l * 0.3, -Math.sin(a) * l * 0.35); b.geom(null, g, _m, { col: [0.3, 0.27, 0.23] });
    }
  }), fol);
  I.define('birch', makeGeo((b) => {
    cyl(b, 0, 2.6, 0, 0.16, 5.2, [0.85, 0.85, 0.8], 6, 0, 0, 0.1);
    for (let i = 0; i < 6; i++) bx(b, -0.17, 0.5 + i * 0.8, -0.17, 0.17, 0.58 + i * 0.8, 0.17, [0.15, 0.15, 0.15]);
    for (const [x, y, z, r] of [[0, 5.6, 0, 1.3], [0.5, 4.7, 0.3, 1.0], [-0.45, 4.9, -0.35, 1.0]]) { const g = new THREE.IcosahedronGeometry(r, 0); _m.makeScale(1, 1.2, 1); _m.setPosition(x, y, z); b.geom(null, g, _m, { col: [0.3, 0.46, 0.16] }); }
  }), fol);
  I.define('bush', makeGeo((b) => {
    for (const [x, z, r] of [[0, 0, 1.0], [0.7, 0.3, 0.7], [-0.6, -0.2, 0.75]]) { const g = new THREE.IcosahedronGeometry(r, 1); _m.makeScale(1, 0.7, 1); _m.setPosition(x, r * 0.45, z); b.geom(null, g, _m, { col: [0.14, 0.28, 0.11] }); }
  }), fol, { cast: false, decor: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  { const p = rockGeo.attributes.position, rr = seeded(5); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rr() * 0.4), p.getY(i) * (0.6 + rr() * 0.3), p.getZ(i) * (0.8 + rr() * 0.4)); rockGeo.computeVertexNormals(); }
  I.define('rock', makeGeo((b) => { _m.makeTranslation(0, 0.3, 0); b.geom(null, rockGeo, _m, { col: [0.36, 0.35, 0.33] }); }), M.rock);
  I.define('log', makeGeo((b) => { cyl(b, 0, 0.35, 0, 0.35, 5, [0.36, 0.26, 0.17], 8, 0, Math.PI / 2); cyl(b, 2.51, 0.35, 0, 0.3, 0.02, [0.6, 0.48, 0.32], 8, 0, Math.PI / 2); cyl(b, -2.51, 0.35, 0, 0.3, 0.02, [0.6, 0.48, 0.32], 8, 0, Math.PI / 2); }), M.rock);
  I.define('grass', makeGeo((b) => {
    for (const a of [0, 1.05, 2.1]) { const g = new THREE.PlaneGeometry(1.4, 0.7); _m.makeRotationY(a); _m.setPosition(0, 0.35, 0); b.geom(null, g, _m, { col: [0.35, 0.5, 0.22] }); }
  }), (() => { const m = M.decal.clone(); m.side = THREE.DoubleSide; m.transparent = false; m.alphaTest = 0.4; m.depthWrite = true; m.polygonOffset = false; return m; })(), { cast: false, decor: true });
  // 草の板に、シールの草のかたまり(4段目)を貼る
  { const g = I.kinds.get('grass').geo, uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25); }
}

// 木を置く(当たり判定つき)
const TREE_R = { pine: 0.45, broad: 0.5, dead: 0.35, birch: 0.3 };
export function placeTree(ctx, kind, x, z, s = 1, rot = 0, tint = null) {
  ctx.I.add(kind, x, 0, z, rot, s, tint);
  const r = (TREE_R[kind] || 0.4) * Math.max(0.8, s);
  ctx.solid(x - r, z - r, x + r, z + r, 8);
  ctx.occupy(x - 1, z - 1, x + 1, z + 1);
}

// 小道具を置く。o: { y, s(大きさ), col(色), solid(false で当たらない) }
export function placeProp(ctx, name, x, z, rot = 0, o = {}) {
  const P = PROPS[name];
  if (!P) return;
  const s = o.s || 1, y = o.y || 0;
  _m.makeRotationY(rot); _s.makeScale(s, s, s); _m.multiply(_s); _m.setPosition(x, y, z);
  for (const part of P.parts) ctx.B.geom(part.mat, part.geo, _m, { col: part.tint ? o.col : null, bx: x, bz: z });
  if (o.solid !== false) {
    const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hw = P.w * s / 2, hd = P.d * s / 2;
    let ex = c * hw + sn * hd, ez = sn * hw + c * hd;
    if (sn > 0.2 && c > 0.2) { ex *= 0.88; ez *= 0.88; }   // ななめの物は 少し小さめに
    ctx.solid(x - ex, z - ez, x + ex, z + ez, P.h * s);
  }
  if (o.occupy !== false) ctx.occupy(x - P.w * s / 2, z - P.w * s / 2, x + P.w * s / 2, z + P.w * s / 2);
}
export { col3 };
