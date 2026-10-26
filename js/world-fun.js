// マップ係: 遊園地(南西)。観覧車・ジェットコースター・メリーゴーランド・フリーフォール・ゴーカート場・サーカスのテント・屋台。
// 動く物(観覧車・コースター・メリーゴーランド・フリーフォール)は ここで形を作り、world-life.js が動かす。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { makeGeo } from './world-build.js';
import { decal, pool, lamp } from './world-town.js';
import { OUT } from './world-outer.js';

const _m = new THREE.Matrix4();
const BRIGHT = [[0.9, 0.2, 0.2], [0.2, 0.45, 0.9], [0.95, 0.8, 0.15], [0.2, 0.7, 0.35], [0.85, 0.35, 0.8], [0.95, 0.5, 0.1]];

export function genFun(ctx) {
  const { B, M, rnd } = ctx;
  const [x0, z0, x1, z1] = OUT.fun;
  // 地面: 芝生 + 石だたみの大通り・広場
  B.flat(M.pave, -150, 0.02, (z0 + 8 + z1) / 2, 14, z1 - z0 - 8, { col: [0.85, 0.7, 0.7] });
  B.flat(M.pave, -100, 0.022, 505, 120, 12, { col: [0.85, 0.7, 0.7] });
  B.flat(M.pave, -250, 0.022, 425, 200, 10, { col: [0.85, 0.7, 0.7] });
  ctx.occupy(-157, z0 + 4, -143, z1); ctx.occupy(-160, 499, -40, 511); ctx.occupy(-350, 420, -150, 430);
  ctx.mapRect(x0, z0 + 6, x1, z1, '#4a4560');
  ctx.mapLine(-150, z0 + 6, -150, z1, 14, '#a08890'); ctx.mapLine(-160, 505, -40, 505, 12, '#a08890');
  // 入口のアーチ(光る)
  gate(ctx, -150, 412);
  // 生け垣(まわり)
  for (let x = x0 + 2; x < x1; x += 2.5) if (Math.abs(x + 150) > 12 && Math.abs(x + 40) > 8) ctx.I.add('bush', x, 0, z0 + 8, rnd() * 6, 0.7 + rnd() * 0.3);
  for (let z = z0 + 10; z < z1; z += 2.5) { ctx.I.add('bush', x0 + 2, 0, z, rnd() * 6, 0.8); ctx.I.add('bush', x1 - 2, 0, z, rnd() * 6, 0.8); }
  // 屋台の通り
  for (let z = 424; z < 496; z += 9) for (const s of [-1, 1]) {
    ctx.prop('stall', -150 + s * 11, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, { col: BRIGHT[Math.floor(rnd() * BRIGHT.length)] });
    if (rnd() < 0.3) ctx.prop('propane', -150 + s * 14.5, z + 3, 0);
  }
  for (let z = 420; z < 590; z += 14) { lamp(ctx, -157.5, z, 0); lamp(ctx, -142.5, z + 7, Math.PI); }
  // ちょうちんの列(光る点)
  for (let z = 418; z < 590; z += 2.2) B.box(M.glow, -150.15, 5.2 + Math.sin((z - 418) / 14 * Math.PI) * 0.6, z - 0.15, -149.85, 5.5 + Math.sin((z - 418) / 14 * Math.PI) * 0.6, z + 0.15, { col: BRIGHT[Math.floor(z / 2.2) % BRIGHT.length].map((v) => v * 3.2) });
  for (let k = 0; k < 16; k++) { const x = -146 + (k % 2 ? 1 : -1) * (3 + rnd() * 3), z = 510 + rnd() * 70; ctx.prop(k % 3 ? 'bench' : 'trashcan', x, z, k % 2 ? Math.PI / 2 : -Math.PI / 2); }
  for (let k = 0; k < 30; k++) decal(ctx, [2, 9, 1, 3][k % 4], x0 + 20 + rnd() * (x1 - x0 - 40), z0 + 14 + rnd() * (z1 - z0 - 20), 2 + rnd() * 2, rnd() * 6, 0.03);
  ferris(ctx, -345, 505);
  coaster(ctx);
  carousel(ctx, -60, 468);
  dropTower(ctx, -112, 575);
  bumper(ctx, -62, 542);
  circus(ctx, -26, 576);
  // 木
  for (let k = 0; k < 40; k++) { const x = x0 + 8 + rnd() * (x1 - x0 - 16), z = z0 + 14 + rnd() * (z1 - z0 - 20); if (ctx.isFree(x, z, 3)) ctx.I.add('broad', x, 0, z, rnd() * 6, 0.7 + rnd() * 0.3); }
}

function gate(ctx, x, z) {
  const { B, M } = ctx;
  for (const s of [-1, 1]) {
    B.box(M.plain, x + s * 9 - 1, 0, z - 1, x + s * 9 + 1, 10, z + 1, { col: [0.85, 0.2, 0.25] });
    B.geom(M.plain, new THREE.ConeGeometry(1.5, 3, 8), _m.makeTranslation(x + s * 9, 11.5, z), { col: [0.95, 0.8, 0.15] });
    ctx.solid(x + s * 9 - 1, z - 1, x + s * 9 + 1, z + 1, 10);
    for (let y = 1; y < 10; y += 1.2) B.box(M.glow, x + s * 9 - 1.05, y, z - 1.05, x + s * 9 + 1.05, y + 0.25, z + 1.05, { col: [3, 2.4, 0.8], skip: 'tb' });
  }
  // アーチ
  for (let i = 0; i < 24; i++) {
    const t0 = i / 24, t1 = (i + 1) / 24, a0 = Math.PI * t0, a1 = Math.PI * t1;
    const xa = x - 9 * Math.cos(a0), ya = 9 + 4 * Math.sin(a0), xb = x - 9 * Math.cos(a1), yb = 9 + 4 * Math.sin(a1);
    const g = new THREE.BoxGeometry(Math.hypot(xb - xa, yb - ya) + 0.1, 0.9, 0.9);
    B.geom(M.plain, g, _m.makeRotationZ(Math.atan2(yb - ya, xb - xa)).setPosition((xa + xb) / 2, (ya + yb) / 2, z), { col: [0.95, 0.85, 0.3] });
    B.box(M.glow, (xa + xb) / 2 - 0.2, (ya + yb) / 2 - 0.65, z + 0.45, (xa + xb) / 2 + 0.2, (ya + yb) / 2 - 0.35, z + 0.6, { col: BRIGHT[i % BRIGHT.length].map((v) => v * 3.5) });
  }
  B.box(M.glow, x - 6, 10.2, z - 0.2, x + 6, 12.2, z + 0.25, { col: [3.2, 0.6, 1.6] });
  B.box(M.plain, x - 6.3, 10, z - 0.35, x + 6.3, 12.4, z - 0.2, { col: [0.15, 0.1, 0.2] });
}

// 観覧車(輪は x 方向の軸で回る。ゴンドラは いつも下向き)
function ferris(ctx, cx, cz) {
  const { B, M, W } = ctx, R = 30, H = R + 5;
  // 支柱(A の形)
  for (const s of [-1, 1]) for (const dz of [-1, 1]) {
    const L = Math.hypot(16, H), g = new THREE.BoxGeometry(1.2, L, 1.2);
    B.geom(M.plain, g, _m.makeRotationX(-dz * Math.atan2(16, H)).setPosition(cx + s * 3.5, H / 2, cz + dz * 8), { col: [0.92, 0.92, 0.95] });
    ctx.solid(cx + s * 3.5 - 1, cz + dz * 16 - 1, cx + s * 3.5 + 1, cz + dz * 16 + 1, 6);
  }
  B.geom(M.plain, new THREE.CylinderGeometry(1.2, 1.2, 10, 10).rotateZ(Math.PI / 2), _m.makeTranslation(cx, H, cz), { col: [0.6, 0.6, 0.62] });
  // 乗り場
  B.box(M.plain, cx - 6, 0, cz - 5, cx + 6, 1.0, cz + 5, { col: [0.75, 0.35, 0.4] });
  ctx.solid(cx - 6, cz - 5, cx + 6, cz + 5, 1.0);
  ctx.mapCircle(cx, cz, 4, '#f0c0e0'); ctx.mapRect(cx - 2, cz - R, cx + 2, cz + R, '#c8a0c0');
  // 回る輪(まとめた形)
  const wheelGeo = makeGeo((b) => {
    for (const s of [-1, 1]) {
      const ring = new THREE.TorusGeometry(R, 0.45, 6, 64); ring.rotateY(Math.PI / 2);
      b.geom(null, ring, _m.makeTranslation(s * 2.4, 0, 0), { col: [0.95, 0.95, 0.97] });
      const ring2 = new THREE.TorusGeometry(R * 0.55, 0.3, 6, 40); ring2.rotateY(Math.PI / 2);
      b.geom(null, ring2, _m.makeTranslation(s * 2.4, 0, 0), { col: [0.9, 0.3, 0.5] });
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const sp = new THREE.BoxGeometry(0.3, R, 0.3); sp.translate(0, R / 2, 0); b.geom(null, sp, _m.makeRotationX(a).setPosition(s * 2.4, 0, 0), { col: [0.85, 0.85, 0.9] }); }
    }
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const g = new THREE.BoxGeometry(5.2, 0.25, 0.25); b.geom(null, g, _m.makeTranslation(0, Math.cos(a) * R, Math.sin(a) * R), { col: [0.8, 0.8, 0.85] }); }
  });
  const lightsGeo = makeGeo((b) => {
    for (const s of [-1, 1]) for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; b.box(null, s * 2.4 - 0.35, Math.cos(a) * (R + 0.6) - 0.2, Math.sin(a) * (R + 0.6) - 0.2, s * 2.4 + 0.35, Math.cos(a) * (R + 0.6) + 0.2, Math.sin(a) * (R + 0.6) + 0.2, { col: BRIGHT[k % BRIGHT.length].map((v) => v * 3.2) }); }
  });
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(wheelGeo, M.plainNoCut), new THREE.Mesh(lightsGeo, M.glow));
  wheel.position.set(cx, H, cz);
  wheel.children[0].castShadow = true;
  W.group.add(wheel);
  // ゴンドラ
  const gGeo = makeGeo((b) => {
    b.box(null, -1.6, -3.4, -1.3, 1.6, -0.9, 1.3, { col: [1, 1, 1] });
    b.box(null, -1.65, -2.5, -1.35, 1.65, -1.5, 1.35, { col: [0.06, 0.08, 0.1], skip: 'tb' });
    b.box(null, -1.8, -0.9, -1.5, 1.8, -0.6, 1.5, { col: [0.9, 0.9, 0.9], skip: '' });
    b.box(null, -0.1, -0.6, -0.1, 0.1, 0.2, 0.1, { col: [0.4, 0.4, 0.4] });
  });
  const N = 24, gm = new THREE.InstancedMesh(gGeo, M.plainNoCut, N);
  gm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  for (let k = 0; k < N; k++) { const c = BRIGHT[k % BRIGHT.length]; gm.instanceColor.setXYZ(k, c[0], c[1], c[2]); }
  gm.frustumCulled = false; gm.castShadow = true;
  W.group.add(gm);
  W.addSpinner({ kind: 'ferris', x: cx, z: cz, y: H, R, wheel, gondolas: gm, n: N });
}

// ジェットコースター(閉じた道。山が 3 つ)
function coaster(ctx) {
  const { B, M, W } = ctx;
  const cx = -236, cz = 516, rx = 58, rz = 62, pts = [];
  const bump = (t, c, w) => { const d = ((t - c + Math.PI * 3) % (Math.PI * 2) - Math.PI) / w; return Math.exp(-d * d); };
  for (let i = 0; i < 72; i++) {
    const t = i / 72 * Math.PI * 2, r = 1 + 0.13 * Math.sin(t * 3 + 0.4);
    const y = 4.5 + 24 * bump(t, 1.1, 0.55) + 14 * bump(t, 3.0, 0.4) + 9 * bump(t, 4.6, 0.3) + 5 * bump(t, 5.6, 0.25);
    pts.push(new THREE.Vector3(cx + Math.cos(t) * rx * r, y, cz + Math.sin(t) * rz * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const n = 480, P = curve.getSpacedPoints(n);
  const red = [0.85, 0.15, 0.12], white = [0.92, 0.92, 0.92];
  // 線路: 2 本のレールと まくら木、柱
  const up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    tan.subVectors(b, a); const L = tan.length(); tan.normalize();
    side.crossVectors(tan, up).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(a, b, up));
    for (const s of [-0.7, 0.7]) {
      const g = new THREE.BoxGeometry(0.22, 0.22, L + 0.05);
      _m.compose(new THREE.Vector3((a.x + b.x) / 2 + side.x * s, (a.y + b.y) / 2, (a.z + b.z) / 2 + side.z * s), q, new THREE.Vector3(1, 1, 1));
      B.geom(M.plain, g, _m, { col: red, bx: cx, bz: cz });
    }
    if (i % 2 === 0) { const g = new THREE.BoxGeometry(1.8, 0.14, 0.3); _m.compose(new THREE.Vector3(a.x, a.y - 0.15, a.z), q, new THREE.Vector3(1, 1, 1)); B.geom(M.plain, g, _m, { col: [0.3, 0.3, 0.32], bx: cx, bz: cz }); }
    if (i % 8 === 0 && a.y > 1.5) {
      B.box(M.plain, a.x - 0.25, 0, a.z - 0.25, a.x + 0.25, a.y - 0.2, a.z + 0.25, { col: white, bx: cx, bz: cz });
      if (a.y > 10) B.box(M.plain, a.x - 0.25 + side.x * 1.6, 0, a.z - 0.25 + side.z * 1.6, a.x + 0.25 + side.x * 1.6, a.y - 0.2, a.z + 0.25 + side.z * 1.6, { col: white, bx: cx, bz: cz });
      ctx.solid(a.x - 0.4, a.z - 0.4, a.x + 0.4, a.z + 0.4, a.y);
    }
    if (i % 3 === 0) ctx.mapRect(a.x - 1, a.z - 1, a.x + 1, a.z + 1, '#c04040');
  }
  // 乗り場
  const st = P[0];
  B.box(M.plain, st.x - 5, 0, st.z - 8, st.x + 5, 3.2, st.z + 8, { col: [0.6, 0.25, 0.5] });
  B.box(M.plain, st.x - 6, 6, st.z - 9, st.x + 6, 6.4, st.z + 9, { col: [0.95, 0.85, 0.3], skip: '' });
  ctx.solid(st.x - 5, st.z - 8, st.x + 5, st.z + 8, 3.2);
  // 車両(5 両。world-life.js が線路にそって動かす)
  const carGeo = makeGeo((b) => {
    b.box(null, -0.85, 0.2, -1.1, 0.85, 1.0, 1.1, { col: [1, 1, 1] });
    b.box(null, -0.8, 1.0, -0.2, 0.8, 1.5, 0.15, { col: [0.1, 0.1, 0.12] });
    b.box(null, -0.9, 0, -1.0, 0.9, 0.2, 1.0, { col: [0.3, 0.3, 0.3] });
  });
  const cars = new THREE.InstancedMesh(carGeo, M.plainNoCut, 5);
  cars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(15), 3);
  for (let k = 0; k < 5; k++) { const c = BRIGHT[k % BRIGHT.length]; cars.instanceColor.setXYZ(k, c[0], c[1], c[2]); }
  cars.frustumCulled = false; cars.castShadow = true;
  W.group.add(cars);
  W.addSpinner({ kind: 'coaster', x: cx, z: cz, curve, cars, u: 0, v: 8, len: curve.getLength() });
  ctx.occupy(cx - rx * 1.15, cz - rz * 1.15, cx + rx * 1.15, cz + rz * 1.15);
}

// メリーゴーランド
function carousel(ctx, cx, cz) {
  const { B, M, W } = ctx;
  B.geom(M.plain, new THREE.CylinderGeometry(10, 10, 0.5, 24), _m.makeTranslation(cx, 0.25, cz), { col: [0.8, 0.7, 0.55] });
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; B.box(M.plain, cx + Math.cos(a) * 9.6 - 0.2, 0.5, cz + Math.sin(a) * 9.6 - 0.2, cx + Math.cos(a) * 9.6 + 0.2, 5.2, cz + Math.sin(a) * 9.6 + 0.2, { col: [0.95, 0.85, 0.4] }); }
  const top = makeGeo((b) => {
    const cone = new THREE.ConeGeometry(11, 4, 24); b.geom(null, cone, _m.makeTranslation(0, 7.2, 0), { col: [0.95, 0.9, 0.85] });
    const band = new THREE.CylinderGeometry(11, 11, 1, 24, 1, true); b.geom(null, band, _m.makeTranslation(0, 5.5, 0), { col: [0.85, 0.2, 0.3] });
    const under = new THREE.CircleGeometry(11, 24); under.rotateX(Math.PI / 2); b.geom(null, under, _m.makeTranslation(0, 5.0, 0), { col: [0.5, 0.2, 0.3] });
    b.box(null, -1.2, 0.5, -1.2, 1.2, 5, 1.2, { col: [0.9, 0.75, 0.4] });
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, r = k % 2 ? 7 : 5, x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.box(null, x - 0.05, 0.5, z - 0.05, x + 0.05, 5, z + 0.05, { col: [0.95, 0.85, 0.4] });
      const y = 1.6 + (k % 3) * 0.3, c = [[0.95, 0.95, 0.95], [0.4, 0.25, 0.15], [0.15, 0.15, 0.15]][k % 3];
      const h = new THREE.BoxGeometry(0.5, 0.7, 1.6); b.geom(null, h, _m.makeRotationY(-a).setPosition(x, y, z), { col: c });
      const hd = new THREE.BoxGeometry(0.35, 0.8, 0.45); b.geom(null, hd, _m.makeRotationY(-a).multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0.75)).setPosition(x + Math.cos(-a + Math.PI / 2) * 0, y + 0.5, z), { col: c });
    }
  });
  const lights = makeGeo((b) => { for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; b.box(null, Math.cos(a) * 11.05 - 0.15, 5.3, Math.sin(a) * 11.05 - 0.15, Math.cos(a) * 11.05 + 0.15, 5.6, Math.sin(a) * 11.05 + 0.15, { col: BRIGHT[k % BRIGHT.length].map((v) => v * 3.4) }); } });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(top, M.plainNoCut), new THREE.Mesh(lights, M.glow));
  g.position.set(cx, 0, cz); g.children[0].castShadow = true;
  W.group.add(g);
  W.addSpinner({ kind: 'carousel', x: cx, z: cz, obj: g });
  ctx.solid(cx - 1.4, cz - 1.4, cx + 1.4, cz + 1.4, 6);
  pool(ctx, cx, cz, 14, [0.6, 0.4, 0.25], 0.52);
  ctx.occupy(cx - 11, cz - 11, cx + 11, cz + 11);
  ctx.mapCircle(cx, cz, 10, '#d0a060');
}

// フリーフォール(高い塔。座席が上がって落ちる)
function dropTower(ctx, cx, cz) {
  const { B, M, W } = ctx, H = 62;
  B.box(M.plain, cx - 1.6, 0, cz - 1.6, cx + 1.6, H, cz + 1.6, { col: [0.9, 0.9, 0.92] });
  for (let y = 4; y < H; y += 4) B.box(M.glow, cx - 1.65, y, cz - 1.65, cx + 1.65, y + 0.3, cz + 1.65, { col: [0.5, 1.6, 3.2], skip: 'tb' });
  B.box(M.plain, cx - 3.5, H, cz - 3.5, cx + 3.5, H + 2, cz + 3.5, { col: [0.85, 0.2, 0.25] });
  B.box(M.glow, cx - 0.4, H + 2, cz - 0.4, cx + 0.4, H + 2.8, cz + 0.4, { col: [4, 0.3, 0.2] });
  B.box(M.plain, cx - 5, 0, cz - 5, cx + 5, 0.8, cz + 5, { col: [0.5, 0.5, 0.55] });
  ctx.solid(cx - 5, cz - 5, cx + 5, cz + 5, 0.8); ctx.solid(cx - 1.6, cz - 1.6, cx + 1.6, cz + 1.6, H);
  const seat = makeGeo((b) => {
    b.box(null, -3.2, 0, -3.2, 3.2, 1.2, 3.2, { col: [0.95, 0.75, 0.15], skip: '' });
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.box(null, Math.cos(a) * 3 - 0.35, -1.2, Math.sin(a) * 3 - 0.35, Math.cos(a) * 3 + 0.35, 0.2, Math.sin(a) * 3 + 0.35, { col: [0.15, 0.15, 0.18] }); }
  });
  const m = new THREE.Mesh(seat, M.plainNoCut);
  m.position.set(cx, 3, cz); m.castShadow = true;
  W.group.add(m);
  W.addSpinner({ kind: 'drop', x: cx, z: cz, obj: m, H, t: 0 });
  ctx.occupy(cx - 6, cz - 6, cx + 6, cz + 6);
  ctx.mapCircle(cx, cz, 4, '#a0c0f0');
}

// ゴーカート場(低い囲い・屋根)
function bumper(ctx, cx, cz) {
  const { B, M, rnd } = ctx, w = 13, d = 9;
  B.box(M.plain, cx - w, 0, cz - d, cx + w, 0.12, cz + d, { col: [0.12, 0.12, 0.14], skip: '' });
  for (const [a, b, c, e] of [[cx - w, cz - d, cx + w, cz - d + 0.4], [cx - w, cz + d - 0.4, cx - 3, cz + d], [cx + 3, cz + d - 0.4, cx + w, cz + d], [cx - w, cz - d, cx - w + 0.4, cz + d], [cx + w - 0.4, cz - d, cx + w, cz + d]]) {
    B.box(M.plain, a, 0, b, c, 0.9, e, { col: [0.95, 0.75, 0.15] }); ctx.solid(a, b, c, e, 0.9);
  }
  for (const x of [cx - w, cx + w]) for (const z of [cz - d, cz + d]) B.box(M.plain, x - 0.2, 0, z - 0.2, x + 0.2, 5.5, z + 0.2, { col: [0.8, 0.8, 0.85] });
  B.box(M.plain, cx - w - 0.5, 5.5, cz - d - 0.5, cx + w + 0.5, 5.9, cz + d + 0.5, { col: [0.3, 0.45, 0.85], skip: '' });
  for (let x = cx - w + 3; x < cx + w; x += 5) for (const z of [cz - 4, cz + 4]) ctx.CB.ceil(M.glow, x - 1, 5.45, z - 0.2, x + 1, z + 0.2, { col: [3, 2.6, 2] });
  for (let k = 0; k < 9; k++) {
    const x = cx - w + 3 + rnd() * (2 * w - 6), z = cz - d + 3 + rnd() * (2 * d - 6), c = BRIGHT[k % BRIGHT.length];
    B.box(M.car, x - 0.9, 0.12, z - 0.65, x + 0.9, 0.7, z + 0.65, { col: c, rot: rnd() * 6 }); B.box(M.plain, x - 0.05, 0.7, z - 0.05, x + 0.05, 2.5, z + 0.05, { col: [0.3, 0.3, 0.3] });
  }
  ctx.occupy(cx - w, cz - d, cx + w, cz + d);
  ctx.mapRect(cx - w, cz - d, cx + w, cz + d, '#30305a');
}

// サーカスのテント(しまもよう)
function circus(ctx, cx, cz) {
  const { B, M } = ctx, R = 12;
  const g = makeGeo((b) => {
    for (let k = 0; k < 16; k++) {
      const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2, c = k % 2 ? [0.95, 0.95, 0.92] : [0.85, 0.12, 0.12];
      const wall = new THREE.CylinderGeometry(R, R, 5, 2, 1, true, a0, a1 - a0); b.geom(null, wall, _m.makeTranslation(0, 2.5, 0), { col: c });
      const roof = new THREE.ConeGeometry(R + 0.5, 8, 2, 1, true, a0, a1 - a0); b.geom(null, roof, _m.makeTranslation(0, 9, 0), { col: c });
    }
    b.box(null, -0.15, 13, -0.15, 0.15, 16, 0.15, { col: [0.6, 0.6, 0.6] });
  });
  B.geom(M.plain, g, _m.makeTranslation(cx, 0, cz), { col: [1, 1, 1] });
  B.box(M.glow, cx - 0.6, 15.5, cz - 0.1, cx + 0.6, 16.3, cz + 0.1, { col: [3.5, 2.5, 0.5] });
  ctx.solid(cx - R * 0.72, cz - R * 0.72, cx + R * 0.72, cz + R * 0.72, 6);
  ctx.occupy(cx - R, cz - R, cx + R, cz + R);
  ctx.mapCircle(cx, cz, R, '#c03030');
}
