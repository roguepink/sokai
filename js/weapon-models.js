// 武器係: 銃の見た目(three.js の形を組み合わせて作る。画像は使わない)。
// 作るときの向き: 銃口は -z、上は +y、にぎる所が (0,0,0)。最後に手の向きに合わせて回す。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 材質は 2 組: 世界に置く銃(主人公の手)と、一人称の手元の銃(別の光で描くので分ける)
const MS = { world: {}, vm: {} };
function mats(set = 'world') {
  const M = MS[set];
  if (M.metal) return M;
  const std = (color, rough, metal, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const glow = (color, k = 3) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: k, roughness: 0.4 });
  Object.assign(M, {
    metal: std(0x2c3038, 0.35, 0.8), dark: std(0x16181c, 0.6, 0.3), steel: std(0x8a9099, 0.3, 0.9),
    wood: std(0x6b4224, 0.7, 0.05), olive: std(0x4b5631, 0.7, 0.2), tan: std(0x8a7a58, 0.7, 0.1),
    white: std(0xd9dde2, 0.35, 0.3), red: std(0x9a1818, 0.5, 0.3), brass: std(0xc89a40, 0.35, 0.9), copper: std(0xb8683a, 0.35, 0.9),
    gRed: glow(0xff2a2a, 3), gCyan: glow(0x40c8ff, 2.2), gBlue: glow(0x3a8cff, 2.5), gPurple: glow(0xa050ff, 2.5),
    gOrange: glow(0xff7a20, 2.5), gIce: glow(0x9ae4ff, 1.4), gGreen: glow(0x60ff80, 3), gDim: glow(0xff7a20, 1.2), void: std(0x050308, 0.2, 0.6),
    yellow: std(0xd8a818, 0.5, 0.3), orange: std(0xd85a14, 0.5, 0.2), gold: std(0xd8b048, 0.3, 1), rubber: std(0x101012, 0.9, 0),
    gAcid: glow(0x7aff30, 2.6), gTeal: glow(0x40ffd0, 2.4), gWhite: glow(0xdff4ff, 2.2),
  });
  return M;
}

const box = (g, w, h, d, x, y, z, m, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
// 筒(-z の向き)
const tube = (g, r, len, x, y, z, m, seg = 10, r2 = r) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, seg), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
const ball = (g, r, x, y, z, m, seg = 12) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.75)), m); o.position.set(x, y, z); g.add(o); return o; };
const ring = (g, r, t, x, y, z, m, ax = 'z') => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 16), m); o.position.set(x, y, z); if (ax === 'x') o.rotation.y = Math.PI / 2; g.add(o); return o; };

const B = {
  ar(g, m) {
    box(g, 0.08, 0.12, 0.5, 0, 0.07, -0.12, m.metal);
    tube(g, 0.02, 0.38, 0, 0.09, -0.55, m.dark);
    box(g, 0.05, 0.06, 0.12, 0, 0.09, -0.4, m.dark);           // ハンドガード先
    box(g, 0.05, 0.2, 0.08, 0, -0.06, -0.15, m.dark, 0.25);     // マガジン
    box(g, 0.06, 0.12, 0.26, 0, 0.04, 0.24, m.dark);            // ストック
    box(g, 0.04, 0.11, 0.05, 0, -0.04, 0.02, m.dark, -0.3);     // グリップ
    tube(g, 0.032, 0.2, 0, 0.17, -0.1, m.metal);                // スコープ
    ball(g, 0.012, 0, 0.17, 0.0, m.gRed, 6);
  },
  minigun(g, m) {
    box(g, 0.2, 0.2, 0.38, 0, 0.06, -0.05, m.metal);
    box(g, 0.08, 0.06, 0.25, 0, 0.2, -0.02, m.dark);            // 持ち手
    box(g, 0.16, 0.2, 0.2, 0.18, 0.0, 0.0, m.olive);           // 弾の箱
    box(g, 0.05, 0.03, 0.22, 0.1, 0.06, -0.12, m.brass);        // 弾帯
    const sp = new THREE.Group(); sp.position.set(0, 0.06, -0.25); g.add(sp);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; tube(sp, 0.022, 0.72, Math.cos(a) * 0.065, Math.sin(a) * 0.065, -0.36, m.steel, 8); }
    tube(sp, 0.1, 0.05, 0, 0, -0.1, m.dark, 12); tube(sp, 0.1, 0.04, 0, 0, -0.62, m.dark, 12);
    ring(sp, 0.1, 0.012, 0, 0, -0.72, m.gOrange);
    g.userData.spinner = sp;
  },
  pistols(g, m) {
    const one = (x) => {
      box(g, 0.045, 0.065, 0.24, x, 0.07, -0.08, m.steel);
      box(g, 0.04, 0.13, 0.055, x, -0.01, 0.02, m.dark, -0.25);
      tube(g, 0.012, 0.04, x, 0.07, -0.22, m.dark, 6);
      ball(g, 0.008, x, 0.105, -0.17, m.gGreen, 4);
    };
    one(0); one(-0.4);
  },
  shotgun(g, m) {
    tube(g, 0.028, 0.8, 0, 0.1, -0.45, m.metal);
    tube(g, 0.022, 0.62, 0, 0.05, -0.38, m.dark);
    box(g, 0.07, 0.07, 0.17, 0, 0.05, -0.42, m.wood);          // ポンプ
    box(g, 0.08, 0.11, 0.24, 0, 0.08, -0.02, m.metal);
    box(g, 0.065, 0.14, 0.3, 0, 0.02, 0.24, m.wood, 0.12);
    box(g, 0.045, 0.1, 0.05, 0, -0.03, 0.06, m.wood, -0.3);
  },
  autoshotgun(g, m) {
    box(g, 0.1, 0.15, 0.55, 0, 0.07, -0.18, m.dark);
    tube(g, 0.035, 0.3, 0, 0.1, -0.6, m.metal);
    box(g, 0.09, 0.05, 0.12, 0, 0.11, -0.72, m.metal);          // 銃口
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), m.olive);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, -0.1, -0.15); g.add(drum);
    box(g, 0.07, 0.13, 0.25, 0, 0.04, 0.22, m.dark);
    box(g, 0.012, 0.012, 0.4, 0.045, 0.15, -0.2, m.gOrange);
  },
  sniper(g, m) {
    tube(g, 0.02, 0.95, 0, 0.09, -0.65, m.metal);
    box(g, 0.05, 0.05, 0.12, 0, 0.09, -1.12, m.dark);           // 消炎器
    box(g, 0.08, 0.11, 0.42, 0, 0.07, -0.08, m.tan);
    box(g, 0.065, 0.14, 0.3, 0, 0.03, 0.28, m.tan, 0.08);
    box(g, 0.045, 0.1, 0.05, 0, -0.04, 0.03, m.dark, -0.3);
    tube(g, 0.04, 0.34, 0, 0.19, -0.1, m.dark); ball(g, 0.035, 0, 0.19, -0.27, m.gBlue, 8);
    box(g, 0.02, 0.18, 0.02, 0.05, -0.04, -0.6, m.dark, 0.5); box(g, 0.02, 0.18, 0.02, -0.05, -0.04, -0.6, m.dark, 0.5);
  },
  rail(g, m) {
    box(g, 0.12, 0.15, 0.45, 0, 0.06, -0.05, m.white);
    box(g, 0.03, 0.04, 0.9, 0.05, 0.09, -0.62, m.metal); box(g, 0.03, 0.04, 0.9, -0.05, 0.09, -0.62, m.metal);
    for (let i = 0; i < 5; i++) ring(g, 0.085, 0.014, 0, 0.09, -0.3 - i * 0.16, m.gCyan);
    box(g, 0.02, 0.02, 0.85, 0, 0.09, -0.62, m.gBlue);
    box(g, 0.08, 0.13, 0.25, 0, 0.03, 0.26, m.white);
    box(g, 0.045, 0.1, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
  },
  grenade(g, m) {
    const b = ball(g, 0.075, 0, 0.05, -0.05, m.olive, 10); b.scale.set(1, 1.25, 1);
    box(g, 0.03, 0.03, 0.03, 0, 0.15, -0.05, m.steel);
    box(g, 0.015, 0.1, 0.02, 0.035, 0.1, -0.05, m.steel, 0.3);
    ring(g, 0.022, 0.005, -0.03, 0.17, -0.05, m.steel, 'x');
  },
  launcher(g, m) {
    tube(g, 0.06, 0.45, 0, 0.1, -0.42, m.olive, 12);
    tube(g, 0.065, 0.04, 0, 0.1, -0.64, m.dark, 12);
    const cyl = tube(g, 0.11, 0.18, 0, 0.06, -0.08, m.metal, 6);
    box(g, 0.06, 0.1, 0.26, 0, 0.05, 0.2, m.dark);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
    ball(g, 0.015, 0, 0.18, -0.3, m.gOrange, 6);
    g.userData.drum = cyl;
  },
  rocket(g, m) {
    tube(g, 0.09, 1.15, 0, 0.16, -0.25, m.olive, 12);
    tube(g, 0.1, 0.08, 0, 0.16, -0.85, m.dark, 12); tube(g, 0.1, 0.08, 0, 0.16, 0.33, m.dark, 12);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 10), m.red); head.rotation.x = -Math.PI / 2; head.position.set(0, 0.16, -0.95); g.add(head);
    box(g, 0.04, 0.11, 0.05, 0, 0.03, -0.1, m.dark, -0.2);
    box(g, 0.08, 0.1, 0.1, -0.12, 0.2, -0.3, m.dark);           // 照準
    ball(g, 0.018, -0.12, 0.26, -0.3, m.gRed, 6);
  },
  missile(g, m) {
    box(g, 0.26, 0.2, 0.42, 0, 0.14, -0.15, m.dark);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ball(g, 0.028, -0.08 + i * 0.08, 0.09 + j * 0.1, -0.37, m.gRed, 6);
    box(g, 0.05, 0.11, 0.05, 0, -0.01, 0.0, m.dark, -0.3);
    box(g, 0.27, 0.012, 0.02, 0, 0.245, -0.36, m.gOrange); box(g, 0.27, 0.012, 0.02, 0, 0.245, 0.06, m.gOrange);
  },
  flame(g, m) {
    tube(g, 0.04, 0.55, 0, 0.09, -0.4, m.metal);
    tube(g, 0.06, 0.08, 0, 0.09, -0.7, m.dark, 10, 0.045);
    ball(g, 0.022, 0, 0.04, -0.72, m.gOrange, 6);               // 種火
    tube(g, 0.07, 0.36, 0, -0.04, -0.15, m.red, 12);            // 燃料タンク
    box(g, 0.08, 0.1, 0.3, 0, 0.08, 0.05, m.dark);
    box(g, 0.045, 0.11, 0.05, 0, -0.03, 0.04, m.dark, -0.3);
  },
  laser(g, m) {
    box(g, 0.1, 0.12, 0.6, 0, 0.08, -0.2, m.white);
    box(g, 0.02, 0.02, 0.56, 0.052, 0.08, -0.2, m.gRed); box(g, 0.02, 0.02, 0.56, -0.052, 0.08, -0.2, m.gRed);
    tube(g, 0.04, 0.12, 0, 0.08, -0.55, m.dark, 12); ball(g, 0.035, 0, 0.08, -0.61, m.gRed, 10);
    box(g, 0.045, 0.11, 0.05, 0, -0.03, 0.04, m.dark, -0.3);
    box(g, 0.08, 0.1, 0.2, 0, 0.06, 0.22, m.white);
  },
  lightning(g, m) {
    box(g, 0.09, 0.12, 0.35, 0, 0.06, 0, m.metal);
    tube(g, 0.018, 0.5, 0, 0.09, -0.4, m.copper, 8);
    for (let i = 0; i < 5; i++) ring(g, 0.05 - i * 0.004, 0.012, 0, 0.09, -0.22 - i * 0.08, m.copper);
    ball(g, 0.06, 0, 0.09, -0.68, m.gCyan, 12);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.05, m.dark, -0.3);
    g.userData.orb = g.children[g.children.length - 2];
  },
  plasma(g, m) {
    box(g, 0.14, 0.16, 0.5, 0, 0.07, -0.15, m.dark);
    ring(g, 0.1, 0.022, 0, 0.08, -0.45, m.metal);
    ball(g, 0.065, 0, 0.08, -0.45, m.gPurple, 12);
    box(g, 0.012, 0.05, 0.3, 0.075, 0.1, -0.12, m.gPurple);
    tube(g, 0.05, 0.15, 0, 0.08, -0.6, m.metal, 10, 0.065);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
  },
  freeze(g, m) {
    box(g, 0.1, 0.13, 0.45, 0, 0.07, -0.15, m.white);
    tube(g, 0.045, 0.3, 0, 0.08, -0.5, m.steel, 10, 0.03);
    tube(g, 0.055, 0.24, 0, 0.19, -0.05, m.gIce, 10);           // 冷たい液のびん
    ring(g, 0.06, 0.01, 0, 0.08, -0.62, m.gIce);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
  },
  blackhole(g, m) {
    box(g, 0.1, 0.12, 0.3, 0, 0.06, 0.05, m.dark);
    tube(g, 0.02, 0.2, 0.05, 0.06, -0.18, m.metal, 6); tube(g, 0.02, 0.2, -0.05, 0.06, -0.18, m.metal, 6);
    ball(g, 0.09, 0, 0.07, -0.38, m.void, 14);
    const r1 = ring(g, 0.14, 0.012, 0, 0.07, -0.38, m.gPurple); const r2 = ring(g, 0.17, 0.008, 0, 0.07, -0.38, m.gPurple);
    r2.rotation.x = 1.2;
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.06, m.dark, -0.3);
    g.userData.rings = [r1, r2];
  },
  // ---------------- 第2弾 ----------------
  chainsaw(g, m) {
    box(g, 0.16, 0.18, 0.34, 0, 0.04, 0.02, m.orange);            // エンジン
    box(g, 0.12, 0.1, 0.14, 0, 0.16, 0.08, m.dark);               // 上の取っ手
    box(g, 0.02, 0.12, 0.7, 0, 0.03, -0.5, m.steel);             // バー(刃の台)
    const ch = box(g, 0.03, 0.15, 0.72, 0, 0.03, -0.5, m.gOrange);  // チェーン(光る)
    for (let i = 0; i < 9; i++) box(g, 0.035, 0.03, 0.03, 0, 0.11, -0.2 - i * 0.075, m.steel);
    for (let i = 0; i < 9; i++) box(g, 0.035, 0.03, 0.03, 0, -0.05, -0.2 - i * 0.075, m.steel);
    box(g, 0.05, 0.05, 0.05, 0.1, 0.02, 0.1, m.metal);            // 排気
    box(g, 0.045, 0.1, 0.05, 0, -0.06, 0.12, m.dark, -0.3);
    g.userData.chain = ch;
  },
  thor(g, m) {
    tube(g, 0.025, 0.55, 0, 0.04, -0.12, m.wood, 8);              // 柄
    ring(g, 0.03, 0.008, 0, 0.04, 0.14, m.gold, 'x');
    const head = new THREE.Group(); head.position.set(0, 0.04, -0.45); g.add(head);
    box(head, 0.2, 0.2, 0.32, 0, 0, 0, m.steel);
    box(head, 0.22, 0.22, 0.05, 0, 0, -0.17, m.metal); box(head, 0.22, 0.22, 0.05, 0, 0, 0.17, m.metal);
    box(head, 0.21, 0.04, 0.2, 0, 0.0, 0, m.gCyan);                // 光る模様
    box(head, 0.04, 0.21, 0.2, 0, 0.0, 0, m.gCyan);
    g.userData.head = head;
  },
  disc(g, m) {
    box(g, 0.14, 0.12, 0.42, 0, 0.05, -0.1, m.metal);
    box(g, 0.05, 0.05, 0.3, 0.08, 0.08, -0.2, m.yellow);
    const d = new THREE.Group(); d.position.set(0, 0.15, -0.28); g.add(d);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 18), m.steel); d.add(disk);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const t = box(d, 0.04, 0.016, 0.03, Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16, m.white); t.rotation.y = -a; }
    ball(d, 0.03, 0, 0.012, 0, m.gWhite, 8);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.05, m.dark, -0.3);
    box(g, 0.08, 0.1, 0.2, 0, 0.04, 0.22, m.dark);
    g.userData.disc = d;
  },
  crossbow(g, m) {
    box(g, 0.06, 0.08, 0.7, 0, 0.06, -0.2, m.wood);
    const arm = (s) => { const a = box(g, 0.42, 0.03, 0.04, s * 0.2, 0.08, -0.48, m.metal); a.rotation.y = s * 0.28; };
    arm(1); arm(-1);
    box(g, 0.78, 0.005, 0.005, 0, 0.08, -0.38, m.white);           // 弦
    box(g, 0.02, 0.02, 0.6, 0, 0.12, -0.3, m.dark);                // 矢
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), m.gRed); tip.rotation.x = -Math.PI / 2; tip.position.set(0, 0.12, -0.64); g.add(tip);
    box(g, 0.045, 0.11, 0.05, 0, -0.03, 0.02, m.dark, -0.3);
    box(g, 0.065, 0.12, 0.22, 0, 0.03, 0.22, m.wood);
    tube(g, 0.025, 0.14, 0, 0.17, -0.05, m.dark); ball(g, 0.012, 0, 0.17, 0.03, m.gRed, 6);
  },
  airstrike(g, m) {
    box(g, 0.12, 0.16, 0.24, 0, 0.06, -0.02, m.olive);           // 無線機
    box(g, 0.1, 0.06, 0.02, 0, 0.1, -0.15, m.dark);
    ball(g, 0.012, -0.03, 0.12, -0.16, m.gRed, 6); ball(g, 0.012, 0.03, 0.12, -0.16, m.gGreen, 6);
    tube(g, 0.006, 0.4, 0.05, 0.34, 0.04, m.dark, 5).rotation.x = 0;  // アンテナ
    tube(g, 0.03, 0.22, 0, 0.04, -0.24, m.metal);                // レーザーで目標を指す筒
    ball(g, 0.022, 0, 0.04, -0.36, m.gRed, 8);
    box(g, 0.045, 0.11, 0.05, 0, -0.06, 0.04, m.dark, -0.3);
  },
  orbital(g, m) {
    box(g, 0.1, 0.12, 0.4, 0, 0.06, -0.08, m.white);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, 1.0), m.steel); dish.rotation.x = -Math.PI / 2 - 0.3; dish.position.set(0, 0.2, -0.05); g.add(dish);
    tube(g, 0.012, 0.18, 0, 0.24, -0.12, m.dark, 6);
    ball(g, 0.03, 0, 0.27, -0.2, m.gCyan, 8);
    box(g, 0.012, 0.012, 0.36, 0.055, 0.08, -0.1, m.gCyan); box(g, 0.012, 0.012, 0.36, -0.055, 0.08, -0.1, m.gCyan);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
  },
  cannon(g, m) {
    tube(g, 0.075, 1.0, 0, 0.12, -0.5, m.metal, 14, 0.065);
    tube(g, 0.11, 0.16, 0, 0.12, -1.02, m.dark, 12);               // 銃口ブレーキ
    box(g, 0.25, 0.04, 0.08, 0, 0.12, -1.02, m.dark);
    box(g, 0.22, 0.24, 0.42, 0, 0.08, 0.1, m.olive);
    tube(g, 0.09, 0.2, 0, 0.12, -0.15, m.olive, 12);
    box(g, 0.05, 0.12, 0.06, 0, -0.06, 0.02, m.dark, -0.25);
    ball(g, 0.018, 0.12, 0.22, 0.05, m.gOrange, 6);
  },
  tornado(g, m) {
    box(g, 0.13, 0.14, 0.36, 0, 0.05, 0, m.metal);
    const fan = new THREE.Group(); fan.position.set(0, 0.06, -0.32); g.add(fan);
    ring(fan, 0.15, 0.02, 0, 0, 0, m.dark);
    for (let i = 0; i < 4; i++) { const b = box(fan, 0.26, 0.02, 0.05, 0, 0, 0, m.steel); b.rotation.z = i * Math.PI / 4; }
    ball(fan, 0.035, 0, 0, -0.02, m.gWhite, 8);
    box(g, 0.045, 0.11, 0.05, 0, -0.05, 0.06, m.dark, -0.3);
    g.userData.spinner = fan;
  },
  meteor(g, m) {
    tube(g, 0.02, 0.6, 0, 0.06, -0.15, m.gold, 8);                // 杖
    const orb = ball(g, 0.09, 0, 0.06, -0.52, m.gOrange, 12);
    ring(g, 0.12, 0.012, 0, 0.06, -0.52, m.gold);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.05, m.dark, -0.3);
    g.userData.orb = orb;
  },
  acid(g, m) {
    box(g, 0.1, 0.12, 0.4, 0, 0.06, -0.12, m.dark);
    tube(g, 0.06, 0.26, 0, 0.2, -0.05, m.gAcid, 10);               // 酸のタンク
    ring(g, 0.065, 0.012, 0, 0.2, 0.08, m.metal); ring(g, 0.065, 0.012, 0, 0.2, -0.18, m.metal);
    tube(g, 0.03, 0.26, 0, 0.07, -0.44, m.metal, 8, 0.04);
    ball(g, 0.025, 0, 0.07, -0.58, m.gAcid, 8);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.04, m.dark, -0.3);
  },
  shuriken(g, m) {
    const s = new THREE.Group(); s.position.set(0, 0.06, -0.12); g.add(s);
    for (let i = 0; i < 2; i++) { const b = box(s, 0.32, 0.012, 0.06, 0, 0, 0, m.steel); b.rotation.y = i * Math.PI / 2 + Math.PI / 4; }
    ball(s, 0.03, 0, 0, 0, m.dark, 8);
    ring(s, 0.05, 0.006, 0, 0.008, 0, m.gWhite, 'x').rotation.x = Math.PI / 2;
    g.userData.star = s;
  },
  drone(g, m) {
    box(g, 0.14, 0.14, 0.3, 0, 0.06, -0.05, m.dark);              // リモコン
    box(g, 0.2, 0.02, 0.14, 0, 0.14, -0.05, m.metal);
    box(g, 0.14, 0.004, 0.09, 0, 0.152, -0.05, m.gTeal);           // 画面
    tube(g, 0.006, 0.2, 0.08, 0.2, 0.05, m.dark, 5);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.05, m.dark, -0.3);
  },
  rocketgat(g, m) {
    box(g, 0.24, 0.22, 0.35, 0, 0.08, 0.02, m.olive);
    const sp = new THREE.Group(); sp.position.set(0, 0.1, -0.2); g.add(sp);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; tube(sp, 0.04, 0.55, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.25, m.metal, 8); ball(sp, 0.025, Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.5, m.red, 6); }
    tube(sp, 0.15, 0.05, 0, 0, -0.05, m.dark, 12); tube(sp, 0.15, 0.04, 0, 0, -0.5, m.dark, 12);
    box(g, 0.05, 0.12, 0.06, 0, -0.06, 0.04, m.dark, -0.3);
    g.userData.spinner = sp;
  },
  emp(g, m) {
    box(g, 0.12, 0.14, 0.34, 0, 0.06, 0, m.white);
    for (let i = 0; i < 3; i++) ring(g, 0.08 + i * 0.03, 0.01, 0, 0.07, -0.25 - i * 0.07, m.gBlue);
    ball(g, 0.05, 0, 0.07, -0.25, m.gWhite, 10);
    box(g, 0.045, 0.11, 0.05, 0, -0.04, 0.05, m.dark, -0.3);
  },
};

// 武器の見た目を作る。手(Player.holdWeapon)に そのまま渡せる
// 手の台(Player.parts.gunMount)は いつも水平で -z = 前。なので 回さずに そのまま持たせる。
// userData.tips = 銃口の位置(この holder の中の位置。matrixWorld をかけると世界の位置。二丁拳銃は [右, 左])
export function buildModel(id, set = 'world') {
  const m = mats(set);
  const inner = new THREE.Group();
  (B[id] || B.ar)(inner, m);
  const keep = new Set(Object.values(inner.userData).flat().filter((o) => o && o.isObject3D));
  mergeByMaterial(inner, keep);
  inner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const holder = new THREE.Group();
  holder.add(inner);
  const S = 1.3;
  holder.scale.setScalar(S);
  holder.userData = inner.userData;
  holder.userData.tips = findTips(inner, id);
  return holder;
}

// 銃口 = いちばん前(-z)にある部品の先。二丁拳銃は 左右それぞれ
function findTips(inner, id) {
  inner.updateMatrixWorld(true);
  const xs = id === 'pistols' ? [0, -0.4] : [0];
  return xs.map((x0) => {
    let best = null, bz = Infinity;
    inner.traverse((o) => {
      if (!o.isMesh || o.userData.noTip) return;
      _bb.setFromObject(o);
      if (_bb.max.x < x0 - 0.2 || _bb.min.x > x0 + 0.2) return;
      if (_bb.min.z < bz) { bz = _bb.min.z; best = new THREE.Vector3(x0, (_bb.min.y + _bb.max.y) / 2, _bb.min.z); }
    });
    return best || new THREE.Vector3(x0, 0.08, -0.6);
  });
}
const _bb = new THREE.Box3();

// 同じ親・同じ材質の 動かない部品を 1 つにまとめる(描く回数をへらす。スマホで軽く)
// keep に入っている部品(動かす・光らせる物)は そのまま
export function mergeByMaterial(root, keep = new Set()) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  for (const node of nodes) {
    const byMat = new Map();
    for (const c of node.children) {
      if (!c.isMesh || c.isInstancedMesh || keep.has(c) || c.children.length) continue;
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(c);
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue;
      const geos = list.map((o) => {
        o.updateMatrix();
        const g = o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        g.morphAttributes = {};
        g.clearGroups();
        g.applyMatrix4(o.matrix);
        return g;
      });
      const anyIdx = geos.some((g) => g.index), allIdx = geos.every((g) => g.index);
      const fixed = anyIdx && !allIdx ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      let merged = null;
      try { merged = mergeGeometries(fixed, false); } catch (e) { merged = null; }
      for (const g of fixed) if (g !== merged) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = list.some((o) => o.castShadow);
      mesh.receiveShadow = list.some((o) => o.receiveShadow);
      for (const o of list) node.remove(o);
      node.add(mesh);
    }
  }
  return root;
}
