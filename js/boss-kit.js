// キャラ係: ボスの「部品箱」。模様(canvas)・材質・形の道具・骨つきの体(Rig)・人型の歩き。
// ボスの体は 1 体ぶんを「材質ごとに 1 つの SkinnedMesh」にまとめる(骨で動かす)。
//   → 部品が何百あっても 描く回数は 材質の数(3〜6)+ 影の分 だけ。スマホで軽い。
// 使い方(各ボスの build で):
//   const R = new Rig(m); const hips = R.bone(null, 0, 2, 0); R.add(hips, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz); … R.finish();
//   設計の大きさ(人 1 体ぶん くらい)で作り、m.S(拡大率)で 怪獣の大きさにする。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { lathe, sstep } from './zombie-models.js';

export { lathe, sstep };
export const R = (a, b) => a + Math.random() * (b - a);
export const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min, abs = Math.abs, PI = Math.PI, TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const BONE = 0xd8cdb0;

// ---------------------------------------------------------------
// 模様(作ったものは使い回す)
// ---------------------------------------------------------------
const _tex = new Map();
export function canvasTex(key, w, h, fn, rep = 1) {
  if (_tex.has(key)) return _tex.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = 2;
  _tex.set(key, t);
  return t;
}

// 腐った肌: しみ・血管・傷・縫い目・できもの・たれる血
export function skinTex(base, o = {}) {
  const key = 'skin' + base + JSON.stringify(o);
  return canvasTex(key, 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      const v = R(-40, 40) | 0;
      c.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 230 : 0},${v > 0 ? 220 : 0},${abs(v) / 380})`;
      c.beginPath(); c.ellipse(R(0, S), R(0, S), R(4, 24), R(3, 16), R(0, 3), 0, 7); c.fill();
    }
    c.strokeStyle = o.vein || 'rgba(60,20,70,0.5)'; c.lineWidth = 1.6;
    for (let i = 0; i < (o.veins ?? 40); i++) {
      let x = R(0, S), y = R(0, S); c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += R(-14, 14); y += R(-14, 14); c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < (o.wounds ?? 10); i++) {
      const x = R(0, S), y = R(0, S), w = R(6, 24), h = R(4, 12), a = R(0, 3);
      c.fillStyle = '#2a0303'; c.beginPath(); c.ellipse(x, y, w, h, a, 0, 7); c.fill();
      c.fillStyle = '#8a1a14'; c.beginPath(); c.ellipse(x, y, w * 0.62, h * 0.5, a, 0, 7); c.fill();
      c.fillStyle = 'rgba(230,200,170,0.35)'; c.beginPath(); c.ellipse(x - w * 0.15, y - h * 0.1, w * 0.2, h * 0.14, a, 0, 7); c.fill();
    }
    for (let i = 0; i < (o.stitches ?? 0); i++) {
      const x = R(20, S - 20), y = R(20, S - 20), L = R(30, 90), a = R(0, 3);
      c.strokeStyle = '#1a1210'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + cos(a) * L, y + sin(a) * L); c.stroke();
      for (let k = 0; k < L; k += 8) { const sx = x + cos(a) * k, sy = y + sin(a) * k; c.beginPath(); c.moveTo(sx - sin(a) * 5, sy + cos(a) * 5); c.lineTo(sx + sin(a) * 5, sy - cos(a) * 5); c.stroke(); }
    }
    for (let i = 0; i < (o.boils ?? 0); i++) {
      const x = R(0, S), y = R(0, S), r = R(4, 13);
      c.fillStyle = o.boilC || '#a8a858'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,200,0.6)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); c.fill();
    }
    for (let i = 0; i < (o.drips ?? 14); i++) {
      const x = R(0, S), y = R(0, S * 0.7);
      c.fillStyle = 'rgba(80,0,0,0.85)'; c.beginPath(); c.ellipse(x, y, R(4, 12), R(4, 10), 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(80,0,0,0.85)'; c.lineWidth = R(2, 4); c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(-3, 3), y + R(15, 55)); c.stroke();
    }
    if (o.scales) {      // うろこ
      for (let y = 0; y < S + 16; y += 14) for (let x = (y / 14) % 2 ? 0 : 9; x < S + 18; x += 18) {
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, 9, 0.1, PI - 0.1); c.stroke();
        c.strokeStyle = 'rgba(255,240,200,0.12)'; c.beginPath(); c.arc(x, y - 2, 8, 0.3, PI - 0.3); c.stroke();
      }
    }
    if (o.fur) {
      for (let i = 0; i < 2400; i++) {
        const x = R(0, S), y = R(0, S), v = R(-30, 30) | 0;
        c.strokeStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${abs(v) / 160})`; c.lineWidth = R(0.8, 1.8);
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(-2, 2), y + R(5, 13)); c.stroke();
      }
    }
  }, o.rep || 1);
}

// 金属の板(さび・びょう・血)
export function plateTex(base = '#7a7866', o = {}) {
  return canvasTex('plate' + base + JSON.stringify(o), 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) { c.fillStyle = `rgba(${R(80, 150) | 0},${R(40, 80) | 0},20,${R(0.05, 0.28)})`; c.fillRect(R(0, S), R(0, S), R(2, 14), R(2, 14)); }
    for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(255,255,255,${R(0.04, 0.14)})`; c.beginPath(); const y = R(0, S); c.moveTo(R(0, S), y); c.lineTo(R(0, S), y + R(-3, 3)); c.stroke(); }
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3;
    const g = o.grid || 64;
    for (let x = 0; x < S; x += g) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
    for (let y = 0; y < S; y += g) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
    c.fillStyle = '#22221e'; for (let x = 8; x < S; x += 32) for (let y = 8; y < S; y += 32) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }
    for (let i = 0; i < (o.blood ?? 10); i++) { c.fillStyle = 'rgba(90,0,0,0.85)'; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(6, 20), R(4, 14), 0, 0, 7); c.fill(); c.fillRect(R(0, S), R(0, S), 3, R(10, 40)); }
    if (o.skull) { c.fillStyle = '#c8b020'; c.font = 'bold 30px sans-serif'; c.fillText('☠', 110, 140); }
    if (o.hazard) {
      for (let x = -64; x < S + 64; x += 40) { c.fillStyle = '#d8b020'; c.beginPath(); c.moveTo(x, S - 40); c.lineTo(x + 20, S - 40); c.lineTo(x + 0, S); c.lineTo(x - 20, S); c.closePath(); c.fill(); }
    }
  }, o.rep || 1);
}

// 毛皮(すじ)+ はげた肉
export function furTex(base = '#4a3e36', patches = 14) {
  return canvasTex('fur' + base + patches, 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    const col = new THREE.Color(base);
    for (let i = 0; i < 2800; i++) {
      const x = R(0, S), y = R(0, S), v = R(0.7, 1.5);
      c.strokeStyle = `rgba(${(col.r * 255 * v) | 0},${(col.g * 255 * v) | 0},${(col.b * 255 * v) | 0},0.7)`; c.lineWidth = R(0.8, 1.8);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(-2, 2), y + R(5, 13)); c.stroke();
    }
    for (let i = 0; i < patches; i++) {
      const x = R(0, S), y = R(0, S), w = R(10, 30), h = R(8, 22);
      c.fillStyle = '#8a3a34'; c.beginPath(); c.ellipse(x, y, w, h, R(0, 3), 0, 7); c.fill();
      c.fillStyle = '#b05a4a'; c.beginPath(); c.ellipse(x - 2, y - 2, w * 0.6, h * 0.5, R(0, 3), 0, 7); c.fill();
      c.fillStyle = 'rgba(60,0,0,0.8)'; c.beginPath(); c.ellipse(x, y + h * 0.4, w * 0.3, h * 0.2, 0, 0, 7); c.fill();
    }
  }, 2);
}

// 虫の殻(しま)
export function chitinTex(base = '#3a3a28') {
  return canvasTex('chitin' + base, 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 18) { c.fillStyle = 'rgba(0,0,0,.38)'; c.fillRect(0, y, S, 3); c.fillStyle = 'rgba(255,255,200,.09)'; c.fillRect(0, y + 3, S, 5); }
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${R(60, 140) | 0},${R(60, 110) | 0},30,.45)`; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(3, 12), R(2, 8), R(0, 3), 0, 7); c.fill(); }
    for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(160,20,10,0.5)'; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(2, 7), R(2, 5), 0, 0, 7); c.fill(); }
  }, 2);
}

// 卵の袋・肉のかたまり
export function sacTex(base = '#b8b060') {
  return canvasTex('sac' + base, 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = R(0, S), y = R(0, S), r = R(8, 20);
      c.fillStyle = '#e8e090'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#4a5010'; c.beginPath(); c.arc(x + r * 0.15, y + r * 0.1, r * 0.45, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(120,20,40,.7)'; c.lineWidth = 2.5;
    for (let i = 0; i < 30; i++) { let x = R(0, S), y = R(0, S); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += R(-20, 20); y += R(-20, 20); c.lineTo(x, y); } c.stroke(); }
  }, 1.5);
}

// 何百もの体が くっついた肉(レギオン)
export function bodiesTex() {
  return canvasTex('bodies', 256, 256, (c, S) => {
    c.fillStyle = '#6a5048'; c.fillRect(0, 0, S, S);
    const skins = ['#8a7a6a', '#a08a78', '#7a8a6a', '#6a6a5a', '#9a7a70', '#b09080'];
    const cloth = ['#2a3a5a', '#5a2a2a', '#3a4a2a', '#5a5a5a', '#2a2a2a', '#7a6a3a'];
    for (let i = 0; i < 160; i++) {
      const x = R(0, S), y = R(0, S), a = R(0, TAU);
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = cloth[(Math.random() * cloth.length) | 0]; c.fillRect(-7, -4, 14, 18);
      c.fillStyle = skins[(Math.random() * skins.length) | 0]; c.beginPath(); c.arc(0, -9, 5.5, 0, 7); c.fill();
      c.fillRect(-11, -3, 4, 14); c.fillRect(7, -3, 4, 14);
      c.fillStyle = '#100404'; c.fillRect(-2.5, -10, 1.6, 1.6); c.fillRect(1, -10, 1.6, 1.6);
      c.restore();
    }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(80,0,0,0.75)'; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(4, 14), R(3, 10), R(0, 3), 0, 7); c.fill(); }
  }, 2.5);
}

// 布(ぼろ)・虎の毛皮 など 単純な模様
export function stripeTex(key, base, line, w = 14, gap = 40) {
  return canvasTex('stripe' + key, 256, 256, (c, S) => {
    c.fillStyle = base; c.fillRect(0, 0, S, S);
    c.fillStyle = line;
    for (let x = -S; x < S * 2; x += gap) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w + R(-20, 20), S); c.lineTo(x + R(-20, 20), S); c.closePath(); c.fill(); }
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(0,0,0,${R(0.03, 0.15)})`; c.fillRect(R(0, S), R(0, S), R(2, 8), R(2, 8)); }
  });
}

// ---------------------------------------------------------------
// 材質(m.mats に入れる = 当たった光・燃える・凍るの色が つく)
// glow: true = 目・傷の光(怒るほど 強く光る)
// ---------------------------------------------------------------
export function mat(m, opts = {}) {
  const glow = !!opts.glow; delete opts.glow;
  const shadow = opts.shadow !== false; delete opts.shadow;
  if (!glow && opts.emissive === undefined) opts.emissive = 0x120808;      // 影でも まっ黒にならない(肉っぽい赤み)
  const mt = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, opts));
  mt.alphaHash = true;                       // 主人公の前に来たとき 体をすかす(材質を作り直さない)
  mt.userData.baseE = mt.emissive.clone();
  mt.userData.baseC = mt.color.clone();
  mt.userData.baseI = mt.emissiveIntensity;
  mt.userData.shadow = shadow && !glow;
  m.mats.push(mt);
  if (glow) m.glows.push(mt);
  return mt;
}

// ---------------------------------------------------------------
// 形の道具
// ---------------------------------------------------------------
// 手足(上 = 0 から下へ L。太さ r0 → r1)
export function limb(L, r0, r1, bulge = 1.1, segs = 10) {
  return lathe([[0, -L - r1 * 0.6], [r1, -L], [r0 * bulge * 0.9, -L * 0.45], [r0 * bulge, -L * 0.2], [r0, 0], [r0 * 0.6, r0 * 0.6], [0, r0 * 0.75]], segs);
}
// 横向きの手足(+x へ L)
export function limbX(L, r0, r1, bulge, segs) { const g = limb(L, r0, r1, bulge, segs); g.rotateZ(PI / 2); return g; }
// 前向き(-z へ L)
export function limbZ(L, r0, r1, bulge, segs) { const g = limb(L, r0, r1, bulge, segs); g.rotateX(-PI / 2); return g; }
// とげ(根元 = 0、+y へ)
export function spike(len, r, segs = 6) { const g = new THREE.ConeGeometry(r, len, segs); g.translate(0, len / 2, 0); return g; }
// 曲がった角(根元 = 0、+y へ、bend で -z へ曲がる)
export function horn(len, r, bend = 0.5, segs = 8) {
  return lathe([[r, 0], [r * 0.85, len * 0.3], [r * 0.6, len * 0.6], [r * 0.3, len * 0.85], [0.001, len]], segs, (p) => {
    const t = p.y / len; p.z -= bend * len * t * t;
  });
}
// でこぼこの球(肉のかたまり・岩)
export function blob(r, amt = 0.15, seed = 1, w = 20, h = 14) {
  const g = new THREE.SphereGeometry(r, w, h), pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + amt * sin(v.x / r * 4.1 + seed) * sin(v.y / r * 3.3 + seed * 2) * sin(v.z / r * 3.7 + seed * 0.7) + amt * 0.5 * sin(v.x / r * 9 + v.z / r * 7 + seed);
    v.multiplyScalar(n); pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function sph(r, w = 12, h = 10, p0 = 0, pl = TAU, t0 = 0, tl = PI) { return new THREE.SphereGeometry(r, w, h, p0, pl, t0, tl); }
export function cyl(r0, r1, h, s = 10, open = false) { return new THREE.CylinderGeometry(r0, r1, h, s, 1, open); }
export function torus(r, t, rs = 6, ts = 14, arc = TAU) { return new THREE.TorusGeometry(r, t, rs, ts, arc); }
// 管(points = [[x,y,z]...])
export function tube(points, r, segs = 16, rs = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs, r, rs, false);
}
// あばら(前に開いた 弓を 何本も。arc = 弓の角度)
export function ribs(rig, bone, mt, n, y0, dy, r, t = 0.04, z = 0, arc = PI * 1.2, sx = 1) {
  for (let i = 0; i < n; i++) {
    const rr = r * (1 - abs(i - (n - 1) / 2) / n * 0.5);
    rig.add(bone, torus(rr, t, 5, 12, arc), mt, 0, y0 + i * dy, z, PI / 2, 0, -PI / 2 - arc / 2, sx, 1, 1);
  }
}

// ---------------------------------------------------------------
// 骨つきの体(rigid skinning)。部品は 1 本の骨にだけ ついて動く
// ---------------------------------------------------------------
const _o = new THREE.Object3D();
export class Rig {
  constructor(m) {
    this.m = m; this.bones = []; this.parts = [];
    this.root = new THREE.Bone(); m.tilt.add(this.root); this.bones.push(this.root);
  }
  bone(parent, x = 0, y = 0, z = 0) {
    const b = new THREE.Bone(); b.position.set(x, y, z);
    (parent || this.root).add(b); this.bones.push(b);
    return b;
  }
  add(bone, geo, mt, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _o.position.set(x, y, z); _o.rotation.set(rx, ry, rz); _o.scale.set(sx, sy, sz); _o.updateMatrix();
    this.parts.push({ bone, geo, mt, mtx: _o.matrix.clone() });
    return this;
  }
  // 部品を 材質ごとに 1 つの SkinnedMesh にまとめる
  finish() {
    const m = this.m;
    m.root.updateMatrixWorld(true);
    const byMat = new Map();
    const idx = new Map(); this.bones.forEach((b, i) => idx.set(b, i));
    for (const p of this.parts) {
      let g = p.geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      g.morphAttributes = {}; g.clearGroups();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.index) { const n = g.attributes.position.count, a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
      g.applyMatrix4(p.mtx); g.applyMatrix4(p.bone.matrixWorld);
      const n = g.attributes.position.count, bi = idx.get(p.bone);
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      if (!byMat.has(p.mt)) byMat.set(p.mt, []);
      byMat.get(p.mt).push(g);
    }
    const sk = new THREE.Skeleton(this.bones);
    m.skeleton = sk; m.meshes = m.meshes || [];
    for (const [mt, list] of byMat) {
      const geo = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!geo) continue;
      const mesh = new THREE.SkinnedMesh(geo, mt);
      mesh.frustumCulled = false;
      mesh.castShadow = !!mt.userData.shadow; mesh.receiveShadow = false;
      m.root.add(mesh);
      mesh.bind(sk);
      m.meshes.push(mesh);
    }
    this.parts.length = 0;
    return sk;
  }
}

// ---------------------------------------------------------------
// 人型の歩き(重い足どり)。j = {hips, torso, head, jaw?, armL, armR, foreL, foreR, legL, legR, kneeL, kneeR}
// hipY = 腰の高さ(設計の大きさ)。k = 歩きの強さ
// ---------------------------------------------------------------
export function walkPose(j, e, hipY, k, o = {}) {
  const ph = e.ph, s = sin(ph), c = cos(ph), t = e.t;
  const breath = sin(t * 1.6);
  j.legL.rotation.set(s * 0.5 * k, 0, -0.04); j.legR.rotation.set(-s * 0.5 * k, 0, 0.04);
  j.kneeL.rotation.x = -(0.12 + 0.75 * max(0, c)) * k - 0.05; j.kneeR.rotation.x = -(0.12 + 0.75 * max(0, -c)) * k - 0.05;
  j.hips.position.y = hipY - 0.1 * abs(s) * k * (o.bob || 1) - 0.02 * breath;
  j.hips.rotation.set(0, 0.12 * s * k, 0.07 * s * k);
  j.torso.rotation.set((o.lean ?? -0.2) + 0.04 * breath, -0.18 * s * k, -0.06 * s * k);
  j.head.rotation.set((o.headX ?? 0.12) + 0.08 * sin(t * 0.7), 0.3 * sin(t * 0.45), 0.12 * sin(t * 0.6));
  j.armL.rotation.set(-s * 0.35 * k + 0.15, 0, -0.22 - 0.03 * breath);
  j.armR.rotation.set(s * 0.35 * k + 0.15, 0, 0.22 + 0.03 * breath);
  j.foreL.rotation.set(0.35 + 0.1 * k, 0, 0); j.foreR.rotation.set(0.35 + 0.1 * k, 0, 0);
  if (j.jaw) j.jaw.rotation.x = -(0.1 + 0.08 * sin(t * 2.3));      // - = 口を開く
  if (j.chest) j.chest.scale.set(1 + 0.025 * breath, 1 + 0.02 * breath, 1 + 0.025 * breath);
}

// 吠える: 頭をのけぞらせ、口を大きく開け、腕を広げる(k = 0..1)
export function roarPose(j, k, shake = 0) {
  const r = (Math.random() - 0.5) * shake;
  j.torso.rotation.x = j.torso.rotation.x * (1 - k) + 0.35 * k + r;
  j.head.rotation.set(j.head.rotation.x * (1 - k) + 0.7 * k + r, r, r);      // + = 上を向く
  if (j.jaw) j.jaw.rotation.x = j.jaw.rotation.x * (1 - k) - 0.8 * k;
  if (j.armL) { j.armL.rotation.set(-0.3 * k, 0, -0.22 - 1.1 * k); j.armR.rotation.set(-0.3 * k, 0, 0.22 + 1.1 * k); }
  if (j.foreL) { j.foreL.rotation.x = 0.35 + 0.9 * k; j.foreR.rotation.x = 0.35 + 0.9 * k; }
}

// 0..1 の なめらかな山(攻撃の ため → 打つ)
export const ease = (t) => t * t * (3 - 2 * t);
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
