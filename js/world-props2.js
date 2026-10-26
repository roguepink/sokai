// マップ係: 第2弾の新しい小道具の形(タンクローリー・プロパン・軍用車・戦車・ヘリ・旅客機・燃料タンク・弾薬箱・屋台・ボート・墓石・干し草・トラクター …)。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { makeGeo } from './world-build.js';
import { PROPS } from './world-props.js';

const _m = new THREE.Matrix4();
const DARK = [0.05, 0.05, 0.055], GLASS = [0.05, 0.065, 0.085], METAL = [0.25, 0.26, 0.28], OLIVE = [0.3, 0.34, 0.22];
const bx = (b, x0, y0, z0, x1, y1, z1, col, o = {}) => b.box(null, x0, y0, z0, x1, y1, z1, { col, skip: 'b', ...o });
function cyl(b, x, y, z, r, h, col, seg = 10, rx = 0, rz = 0, r2 = r, ry = 0) {
  const g = new THREE.CylinderGeometry(r2, r, h, seg, 1);
  _m.makeRotationFromEuler(new THREE.Euler(rx, ry, rz)); _m.setPosition(x, y, z);
  b.geom(null, g, _m, { col });
}
function wheels(b, xs, z, r, w = 0.3) { for (const x of xs) for (const s of [-1, 1]) cyl(b, x, r, s * z, r, w, DARK, 10, Math.PI / 2); }

export function defineProps2(ctx) {
  const { M, I } = ctx;
  const P = (name, parts, w, d, h = 1) => { PROPS[name] = { parts, w, d, h }; };
  const plain = M.plain, car = M.car;

  // タンクローリー(運転席は色つき・タンクは銀)
  P('tanker', [
    { geo: makeGeo((b) => { bx(b, 3.2, 0.5, -1.2, 5.3, 3.0, 1.2, [1, 1, 1]); bx(b, 4.7, 1.8, -1.15, 5.32, 2.8, 1.15, GLASS); for (const s of [-1, 1]) bx(b, 5.3, 0.8, s * 0.85 - 0.14, 5.34, 1.0, s * 0.85 + 0.14, [2.2, 2, 1.6]); }), mat: car, tint: true },
    { geo: makeGeo((b) => {
      cyl(b, -1.0, 2.0, 0, 1.25, 7.8, [0.82, 0.83, 0.85], 14, 0, Math.PI / 2);
      for (const x of [-4.9, 2.9]) cyl(b, x, 2.0, 0, 1.15, 0.12, [0.7, 0.7, 0.72], 14, 0, Math.PI / 2);
      bx(b, -5, 0.6, -1.0, 3.2, 0.9, 1.0, [0.15, 0.15, 0.15]);
      bx(b, -2.2, 1.6, 1.24, -0.6, 2.4, 1.27, [0.95, 0.55, 0.05]); bx(b, -2.2, 1.6, -1.27, -0.6, 2.4, -1.24, [0.95, 0.55, 0.05]);
      for (let x = -4; x < 2.5; x += 1.6) bx(b, x, 3.2, -0.3, x + 0.6, 3.3, 0.3, METAL);
      wheels(b, [-3.8, -2.6, 4.3], 1.1, 0.52);
    }), mat: car },
  ], 10.6, 2.5, 3.3);
  // プロパンガス(かごに 4 本)
  P('propane', [{ geo: makeGeo((b) => {
    for (const x of [-0.55, 0.55]) for (const z of [-0.3, 0.3]) { bx(b, x * 1.45 - 0.03, 0, z * 1.4 - 0.03, x * 1.45 + 0.03, 1.9, z * 1.4 + 0.03, METAL); }
    bx(b, -0.85, 1.85, -0.45, 0.85, 1.9, 0.45, METAL); bx(b, -0.85, 0, -0.45, 0.85, 0.06, 0.45, METAL);
    for (const x of [-0.6, -0.2, 0.2, 0.6]) { cyl(b, x, 0.75, 0, 0.17, 1.4, [0.92, 0.92, 0.9], 10); cyl(b, x, 1.55, 0, 0.08, 0.2, [0.8, 0.12, 0.08], 6); }
    bx(b, -0.3, 1.0, 0.46, 0.3, 1.4, 0.47, [0.9, 0.1, 0.05]);
  }), mat: plain }], 1.8, 1.0, 1.9);
  // 軍用ジープ
  P('jeep', [{ geo: makeGeo((b) => {
    bx(b, -2.0, 0.45, -0.9, 2.0, 1.25, 0.9, [1, 1, 1]); bx(b, 0.4, 1.25, -0.88, 0.5, 1.75, 0.88, GLASS);
    for (const z of [-0.85, 0.85]) bx(b, -1.9, 1.25, z - 0.03, -0.2, 1.3, z + 0.03, [0.6, 0.6, 0.6]);
    bx(b, -1.9, 1.25, -0.3, -1.4, 1.65, 0.3, [0.5, 0.5, 0.45]); cyl(b, -2.05, 0.9, 0, 0.35, 0.2, DARK, 10, 0, Math.PI / 2);
    for (const s of [-1, 1]) bx(b, 2.0, 0.85, s * 0.6 - 0.12, 2.04, 1.0, s * 0.6 + 0.12, [2, 1.9, 1.5]);
    wheels(b, [-1.3, 1.3], 0.85, 0.42);
  }), mat: car, tint: true }], 4.2, 1.9, 1.8);
  // 戦車
  P('tank', [{ geo: makeGeo((b) => {
    bx(b, -3.6, 0.35, -1.75, 3.6, 1.35, 1.75, [1, 1, 1]);
    bx(b, 3.6, 0.5, -1.6, 4.0, 1.1, 1.6, [0.9, 0.9, 0.9], { rot: 0 });
    for (const s of [-1, 1]) { bx(b, -3.8, 0, s * 1.75 - 0.5 * (s > 0 ? 0 : 1), 3.9, 0.9, s * 1.75 + 0.5 * (s > 0 ? 1 : 0), [0.12, 0.12, 0.11]); for (let x = -3.2; x <= 3.3; x += 1.08) cyl(b, x, 0.45, s * 2.0, 0.42, 0.45, [0.2, 0.2, 0.18], 10, Math.PI / 2); }
    cyl(b, -0.4, 1.75, 0, 1.45, 0.85, [0.95, 0.95, 0.95], 10);
    bx(b, -2.0, 1.35, -1.1, -0.6, 2.05, 1.1, [0.9, 0.9, 0.9]);
    cyl(b, 3.0, 1.85, 0, 0.13, 5.0, [0.85, 0.85, 0.85], 8, 0, Math.PI / 2, 0.11);
    cyl(b, 5.45, 1.85, 0, 0.2, 0.45, [0.6, 0.6, 0.6], 8, 0, Math.PI / 2);
    cyl(b, -0.8, 2.3, 0.6, 0.35, 0.25, [0.8, 0.8, 0.8], 8);
  }), mat: car, tint: true }], 7.8, 4.0, 2.4);
  // ヘリコプター(置いてある)
  P('heli', [{ geo: makeGeo((b) => {
    const g = new THREE.SphereGeometry(1.5, 12, 8); _m.makeScale(2.0, 1.0, 0.95); _m.setPosition(0.5, 1.8, 0); b.geom(null, g, _m, { col: [1, 1, 1] });
    const gw = new THREE.SphereGeometry(1.45, 10, 6, 0, Math.PI * 2, 0, 1.2); _m.makeRotationZ(-Math.PI / 2); _m.multiply(new THREE.Matrix4().makeScale(0.95, 1.6, 0.92)); _m.setPosition(1.9, 1.95, 0); b.geom(null, gw, _m, { col: GLASS });
    cyl(b, -3.8, 2.1, 0, 0.45, 6.5, [1, 1, 1], 8, 0, Math.PI / 2, 0.22);
    bx(b, -7.1, 2.0, -0.08, -6.3, 3.6, 0.08, [1, 1, 1]); bx(b, -6.9, 2.1, -1.1, -6.4, 2.2, 1.1, [1, 1, 1]);
    for (const s of [-1, 1]) { bx(b, -1.5, 0, s * 1.15 - 0.06, 2.6, 0.1, s * 1.15 + 0.06, DARK); for (const x of [-0.7, 1.7]) bx(b, x - 0.05, 0.1, s * 1.1 - 0.05, x + 0.05, 0.75, s * 1.1 + 0.05, DARK); }
    cyl(b, 0.3, 3.2, 0, 0.18, 0.5, DARK, 8);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.3; _m.makeRotationY(a); _m.setPosition(0.3, 3.45, 0); b.geom(null, new THREE.BoxGeometry(7.2, 0.05, 0.38).translate(3.6, 0, 0), _m, { col: [0.14, 0.14, 0.14] }); }
  }), mat: car, tint: true }], 9.5, 2.8, 3.4);
  // 旅客機(白い胴体・青い線・灰色の翼)
  P('plane', [{ geo: makeGeo((b) => {
    const W = [0.92, 0.93, 0.95], BL = [0.1, 0.25, 0.6], G = [0.6, 0.62, 0.65];
    cyl(b, 0, 3.2, 0, 2.2, 30, W, 16, 0, Math.PI / 2);
    const nose = new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); _m.makeRotationZ(-Math.PI / 2); _m.multiply(new THREE.Matrix4().makeScale(1, 1.9, 1)); _m.setPosition(15, 3.2, 0); b.geom(null, nose, _m, { col: W });
    cyl(b, -18, 3.6, 0, 2.2, 6, W, 16, 0, Math.PI / 2, 0.6);
    bx(b, -14.5, 3.0, -2.23, 14, 3.4, 2.23, BL);
    for (let x = -12; x < 13; x += 1.4) for (const s of [-1, 1]) bx(b, x, 4.0, s * 2.15 - 0.03, x + 0.5, 4.45, s * 2.15 + 0.03, GLASS);
    bx(b, 14.2, 4.0, -1.4, 15.2, 4.7, 1.4, GLASS);
    for (const s of [-1, 1]) {
      const wing = new THREE.BoxGeometry(5.5, 0.45, 16); wing.translate(0, 0, s * 8.6); _m.makeRotationY(s * 0.35); _m.setPosition(0, 2.4, 0); b.geom(null, wing, _m, { col: G });
      cyl(b, 1.6, 1.4, s * 6.5, 0.95, 3.6, [0.75, 0.76, 0.78], 12, 0, Math.PI / 2); cyl(b, 3.45, 1.4, s * 6.5, 0.7, 0.1, DARK, 12, 0, Math.PI / 2);
      const tw = new THREE.BoxGeometry(3.2, 0.3, 6); tw.translate(0, 0, s * 3); _m.makeRotationY(s * 0.4); _m.setPosition(-19, 4.2, 0); b.geom(null, tw, _m, { col: G });
    }
    const fin = new THREE.BoxGeometry(4.5, 7, 0.35); _m.makeRotationZ(-0.45); _m.setPosition(-19.5, 7.5, 0); b.geom(null, fin, _m, { col: BL });
    for (const [x, z] of [[11, 0], [-1, -2.6], [-1, 2.6]]) { bx(b, x - 0.1, 0, z - 0.1, x + 0.1, 1.6, z + 0.1, METAL); cyl(b, x, 0.45, z, 0.45, 0.4, DARK, 10, Math.PI / 2); }
  }), mat: car }], 38, 4.6, 6);
  // 燃料タンク(横置き)
  P('fueltank', [{ geo: makeGeo((b) => {
    cyl(b, 0, 2.1, 0, 1.8, 9, [0.9, 0.9, 0.88], 16, 0, Math.PI / 2);
    for (const x of [-4.5, 4.5]) { const g = new THREE.SphereGeometry(1.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); _m.makeRotationZ(x > 0 ? -Math.PI / 2 : Math.PI / 2); _m.multiply(new THREE.Matrix4().makeScale(1, 0.4, 1)); _m.setPosition(x, 2.1, 0); b.geom(null, g, _m, { col: [0.9, 0.9, 0.88] }); }
    for (const x of [-3, 0, 3]) bx(b, x - 0.3, 0, -1.4, x + 0.3, 1.0, 1.4, [0.45, 0.45, 0.45]);
    bx(b, -1.5, 1.8, 1.79, 1.5, 2.6, 1.82, [0.9, 0.12, 0.08]);
    bx(b, -0.2, 3.9, -0.2, 0.2, 4.2, 0.2, METAL);
  }), mat: plain }], 10, 3.6, 4);
  // 弾薬箱(積んである。爆発する)
  P('ammo', [{ geo: makeGeo((b) => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { bx(b, -0.8 + i * 0.55, j * 0.42, -0.4, -0.3 + i * 0.55, j * 0.42 + 0.4, 0.4, [0.28, 0.32, 0.18]); bx(b, -0.75 + i * 0.55, j * 0.42 + 0.15, 0.4, -0.35 + i * 0.55, j * 0.42 + 0.25, 0.41, [0.85, 0.75, 0.2]); }
  }), mat: plain }], 1.7, 0.85, 0.85);
  // 屋台(しまもようの屋根)
  P('stall', [{ geo: makeGeo((b) => {
    bx(b, -1.6, 0, -0.9, 1.6, 1.0, 0.9, [0.95, 0.9, 0.8]); bx(b, -1.65, 1.0, -0.95, 1.65, 1.06, 0.95, [0.5, 0.32, 0.2]);
    for (const x of [-1.55, 1.55]) for (const z of [-0.85, 0.85]) bx(b, x - 0.05, 1.0, z - 0.05, x + 0.05, 2.6, z + 0.05, [0.9, 0.9, 0.9]);
    for (let i = 0; i < 8; i++) bx(b, -1.9 + i * 0.475, 2.6, -1.2, -1.425 + i * 0.475, 2.75, 1.2, i % 2 ? [1, 1, 1] : [1, 1, 1], { skip: '' });
  }), mat: plain, tint: true }, { geo: makeGeo((b) => { for (let i = 0; i < 8; i += 2) bx(b, -1.9 + i * 0.475, 2.61, -1.21, -1.425 + i * 0.475, 2.76, 1.21, [0.9, 0.12, 0.1], { skip: '' }); bx(b, -1.4, 2.0, 0.95, 1.4, 2.5, 0.97, [2.6, 2.0, 0.8]); }), mat: M.glow }], 3.4, 1.9, 2.8);
  // ボート(見た目だけ)
  P('boat', [{ geo: makeGeo((b) => {
    const g = new THREE.CylinderGeometry(1.4, 0.9, 7, 8, 1); g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1); _m.makeTranslation(0, 0.45, 0); b.geom(null, g, _m, { col: [1, 1, 1] });
    bx(b, -1.5, 0.75, -0.9, 1.0, 2.2, 0.9, [0.92, 0.92, 0.9]); bx(b, -1.45, 1.6, -0.92, 0.95, 2.0, 0.92, GLASS);
    bx(b, -3.2, 0.75, -0.04, 3.2, 0.8, 0.04, [0.3, 0.3, 0.3]);
  }), mat: car, tint: true }], 7.2, 2.6, 2.2);
  // トラクター
  P('tractor', [{ geo: makeGeo((b) => {
    bx(b, -0.6, 0.7, -0.6, 1.9, 1.6, 0.6, [1, 1, 1]); bx(b, -1.3, 0.8, -0.75, -0.2, 2.6, 0.75, [1, 1, 1]); bx(b, -1.25, 1.5, -0.77, -0.25, 2.4, 0.77, GLASS);
    bx(b, -1.4, 2.6, -0.85, -0.1, 2.7, 0.85, [0.2, 0.2, 0.2]); cyl(b, 1.3, 2.1, 0.3, 0.08, 1.0, DARK, 6);
    for (const s of [-1, 1]) { cyl(b, -0.9, 0.85, s * 0.95, 0.85, 0.5, DARK, 12, Math.PI / 2); cyl(b, 1.4, 0.5, s * 0.8, 0.5, 0.35, DARK, 10, Math.PI / 2); }
  }), mat: car, tint: true }], 3.4, 2.2, 2.7);
  // 手荷物カート(空港)
  P('cart', [{ geo: makeGeo((b) => {
    bx(b, -1.4, 0.4, -0.75, 1.4, 0.5, 0.75, [0.4, 0.4, 0.42]); for (const x of [-1.4, 1.4]) bx(b, x - 0.04, 0.5, -0.75, x + 0.04, 1.5, 0.75, [0.4, 0.4, 0.42]);
    bx(b, -1.2, 0.5, -0.6, -0.3, 1.0, 0.6, [0.6, 0.2, 0.15]); bx(b, -0.2, 0.5, -0.6, 0.9, 1.2, 0.2, [0.15, 0.3, 0.55]); bx(b, 0.1, 0.5, 0.25, 1.1, 0.9, 0.65, [0.2, 0.2, 0.22]);
    wheels(b, [-1.0, 1.0], 0.7, 0.2, 0.12);
  }), mat: plain }], 2.9, 1.6, 1.5);
  // かかし
  P('scarecrow', [{ geo: makeGeo((b) => {
    bx(b, -0.05, 0, -0.05, 0.05, 2.2, 0.05, [0.4, 0.3, 0.2]); bx(b, -0.9, 1.6, -0.04, 0.9, 1.68, 0.04, [0.4, 0.3, 0.2]);
    bx(b, -0.35, 1.0, -0.15, 0.35, 1.75, 0.15, [0.35, 0.4, 0.6]); const g = new THREE.SphereGeometry(0.2, 8, 6); _m.makeTranslation(0, 1.95, 0); b.geom(null, g, _m, { col: [0.85, 0.75, 0.5] });
    const hat = new THREE.ConeGeometry(0.35, 0.3, 8); _m.makeTranslation(0, 2.2, 0); b.geom(null, hat, _m, { col: [0.75, 0.6, 0.3] });
  }), mat: plain }], 0.6, 0.6, 2.3);
  // 係留柱(港)
  P('bollard', [{ geo: makeGeo((b) => { cyl(b, 0, 0.35, 0, 0.22, 0.7, [0.15, 0.15, 0.16], 10); cyl(b, 0, 0.72, 0, 0.3, 0.08, [0.15, 0.15, 0.16], 10); }), mat: plain }], 0.6, 0.6, 0.8);
  // 墓石・十字架・干し草・とうもろこし(数が多いので InstancedMesh)
  I.define('grave', makeGeo((b) => { bx(b, -0.45, 0, -0.12, 0.45, 0.9, 0.12, [1, 1, 1]); const g = new THREE.CylinderGeometry(0.45, 0.45, 0.24, 6, 1, false, 0, Math.PI); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); _m.makeRotationY(0); _m.setPosition(0, 0.9, 0); b.geom(null, g, _m, { col: [1, 1, 1] }); bx(b, -0.55, 0, -0.5, 0.55, 0.05, 0.4, [0.35, 0.3, 0.25]); }), M.rock);
  I.define('cross', makeGeo((b) => { bx(b, -0.07, 0, -0.07, 0.07, 1.5, 0.07, [1, 1, 1]); bx(b, -0.4, 1.0, -0.06, 0.4, 1.14, 0.06, [1, 1, 1]); }), M.rock);
  I.define('hay', makeGeo((b) => { cyl(b, 0, 0.8, 0, 0.8, 1.3, [0.85, 0.7, 0.35], 12, Math.PI / 2); cyl(b, 0, 0.8, 0.66, 0.65, 0.02, [0.7, 0.55, 0.25], 12, Math.PI / 2); cyl(b, 0, 0.8, -0.66, 0.65, 0.02, [0.7, 0.55, 0.25], 12, Math.PI / 2); }), M.rock);
  I.define('corn', makeGeo((b) => {
    for (const [x, z, h] of [[0, 0, 2.2], [0.6, 0.25, 1.9], [-0.45, -0.4, 2.0]]) {
      cyl(b, x, h / 2, z, 0.05, h, [0.45, 0.55, 0.2], 3);
      for (let k = 0; k < 2; k++) { const g = new THREE.PlaneGeometry(0.9, 0.18); g.translate(0.45, 0, 0); _m.makeRotationFromEuler(new THREE.Euler(0, k * 2.1 + x * 5, -0.5)); _m.setPosition(x, h * (0.35 + k * 0.2), z); b.geom(null, g, _m, { col: [0.5, 0.6, 0.22] }); }
    }
  }), (() => { const m = M.foliage.clone(); m.side = THREE.DoubleSide; m.onBeforeCompile = M.foliage.onBeforeCompile; m.customProgramCacheKey = M.foliage.customProgramCacheKey; return m; })(), { cast: false, decor: true });
}
