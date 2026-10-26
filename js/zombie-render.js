// キャラ係: ゾンビの体を描く。
// 体(生きている・死体)は「体の記録」(使い回しの入れ物)に入っていて、関節の角度から 部位ごとの位置を計算し、
// 部位ごとの InstancedMesh(全部で 9 つ)に まとめて書きこむ。画面の外は計算も描画もしない。遠いものは間引く。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { CONFIG } from './config.js';
import { Engine } from './engine.js';
import { buildAtlas, buildGeometries, makeZombieMaterial, makePartMesh, TILE } from './zombie-models.js';
import { NJ, HIP_H, poseAlive } from './zombie-anim.js';

// 部位の番号(第2弾: 下あご・盾・ガスマスク)
export const P = { PELVIS: 0, TORSO: 1, HEAD: 2, UAL: 3, UAR: 4, LAL: 5, LAR: 6, ULL: 7, ULR: 8, LLL: 9, LLR: 10, HELMET: 11, JAW: 12, SHIELD: 13, MASK: 14 };
export const NP = 15;
export const BIT = (p) => 1 << p;
// 部位 → 形(メッシュ)の番号: 0 腰 1 胴 2 頭 3 上腕 4 前腕 5 もも 6 すね 7 ヘルメット 8 切り口 9 あご 10 盾 11 マスク
export const PART_MESH = [0, 1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 9, 10, 11];
const GEO_NAMES = ['pelvis', 'torso', 'head', 'uarm', 'larm', 'uleg', 'lleg', 'helmet', 'cap', 'jaw', 'shield', 'mask'];
export const CAP_MESH = 8;
const EYE_DIST = 30;      // 目が光って見える距離(カメラから)

export const MAX_ALIVE = CONFIG.ZOMBIES.MAX;
export const MAX_CORPSE = 150;
export const MAX_BODY = MAX_ALIVE + MAX_CORPSE;
export const MAX_GIB = 180;

function rigid() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, q: new THREE.Quaternion(), wx: 0, wy: 0, wz: 0, dn: 1, up: 1, th: 0.15, ground: false, settled: false, face: true };
}

function newBody(i) {
  return {
    i, mode: 0,               // 0 空き / 1 生きている / 2 死体
    e: null, s: 1, fat: 1, headS: 1, helmet: false, shield: false, mask: false, eye: new Float32Array(3),
    tile: new Uint8Array(NP), cloth: new Float32Array(NP * 3), skin: new Float32Array(3),
    pose: new Float32Array(NJ * 3), poseA: new Float32Array(NJ * 3), poseB: new Float32Array(NJ * 3),
    mats: new Float32Array(NP * 16),
    fx: new Float32Array(4),
    hide: 0, split: false,
    ay: 0, ap: 0, ar: 0,
    ra: rigid(), rb: rigid(),
    age: 0, life: 0, sink: 0, bleed: 0, bleedP: 0, bleedY: 0, burnT: 0, twitch: 0, landed: false, splatted: false,
    lastPose: -99, visible: false, born: 0,
  };
}

function newGib() {
  return {
    used: false, n: 1, mesh: [0, 0], rel: [new THREE.Matrix4(), new THREE.Matrix4()], capRel: new THREE.Matrix4(), cap: false,
    tile: [0, 0], cloth: new Float32Array(6), skin: new Float32Array(3), fx: new Float32Array(4),
    r: rigid(), half: 0.2, roll: false, life: 0, sink: 0, splat: false,
  };
}

export const Render = {
  meshes: [],
  bodies: [],
  gibs: [],
  frame: 0,
  _free: [],
  _cursor: new Int32Array(16),
  _born: 0,

  init(scene) {
    const tex = buildAtlas();
    const geos = buildGeometries(Engine.quality);
    this.material = makeZombieMaterial(tex);
    this.geos = geos;
    // 部位ごとの数: 体の数 × (左右なら 2) + ばらばらの部位
    const per = [1, 1, 1, 2, 2, 2, 2, 0.3, 0, 1, 0.15, 0.2];
    for (let k = 0; k < GEO_NAMES.length; k++) {
      const cap = k === CAP_MESH ? MAX_BODY * 2 + MAX_GIB : Math.ceil(MAX_BODY * per[k]) + MAX_GIB * (k === 7 || k >= 10 ? 0.3 : 1) | 0;
      const m = makePartMesh(geos[GEO_NAMES[k]], this.material, cap);
      m.userData.cap = cap;
      const shadow = Engine.quality === 'high' ? k !== CAP_MESH && k !== 7 && k !== 9 && k !== 11 : (k === 1 || k === 5 || k === 2 || k === 10);
      m.castShadow = shadow;
      m.receiveShadow = false;
      scene.add(m);
      this.meshes.push(m);
    }
    // 光る目(生きている間だけ。近くのゾンビだけ描く)
    const em = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, vertexColors: true });
    this.eyes = new THREE.InstancedMesh(geos.eyes, em, MAX_ALIVE);
    this.eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eyes.setColorAt(0, new THREE.Color());
    this.eyes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.eyes.frustumCulled = false; this.eyes.count = 0; this.eyes.castShadow = false;
    scene.add(this.eyes);
    for (let i = 0; i < MAX_BODY; i++) this.bodies.push(newBody(i));
    for (let i = 0; i < MAX_GIB; i++) this.gibs.push(newGib());
    this.reset();
  },

  reset() {
    this._free.length = 0;
    for (let i = MAX_BODY - 1; i >= 0; i--) { this.bodies[i].mode = 0; this.bodies[i].e = null; this._free.push(this.bodies[i]); }
    for (const g of this.gibs) g.used = false;
  },

  // 体の記録を 1 つ借りる。足りなければ いちばん古い死体を消して使う
  alloc() {
    let B = this._free.pop();
    if (!B) {
      let old = null;
      for (const b of this.bodies) if (b.mode === 2 && (!old || b.born < old.born)) old = b;
      if (!old) return null;
      B = old;
    }
    B.mode = 0; B.e = null; B.hide = 0; B.split = false; B.lastPose = -99; B.born = ++this._born;
    B.fx.fill(0); B.ay = B.ap = B.ar = 0;
    B.age = 0; B.sink = 0; B.bleed = 0; B.burnT = 0; B.twitch = 0; B.landed = false; B.splatted = false;
    return B;
  },
  release(B) { if (B.mode !== 0 || !this._free.includes(B)) { B.mode = 0; B.e = null; this._free.push(B); } },
  corpseCount() { let n = 0; for (const b of this.bodies) if (b.mode === 2) n++; return n; },

  allocGib() {
    for (const g of this.gibs) if (!g.used) { g.used = true; return g; }
    // いっぱい: いちばん寿命の近いものを使う
    let best = this.gibs[0];
    for (const g of this.gibs) if (g.life < best.life) best = g;
    return best;
  },

  // ---------- 関節 → 部位の位置(体の記録 B の mats に入れる) ----------
  computeMats(B) {
    const s = B.s, fat = B.fat, P_ = B.pose;
    const fs = 1 + (fat - 1) * 0.75, fh = 1 + (fat - 1) * 0.8;
    if (B.mode === 1) {
      const e = B.e;
      _p.set(e.x, (HIP_H + B.ay) * s + e.y, e.z);
      _q.setFromEuler(_e.set(B.ap, -e.face, B.ar, 'YXZ'));
      _root.compose(_p, _q, _sv.set(s, s, s));
    } else {
      const r = B.ra;
      _root.compose(_p.set(r.x, r.y, r.z), r.q, _sv.set(s, s, s));
    }
    joint(0, _root, P_, 0, 0, 0, 0);
    if (B.split) {
      const r = B.rb;
      _rootB.compose(_p.set(r.x, r.y, r.z), r.q, _sv.set(s, s, s));
      joint(1, _rootB, P_, 1, 0, 0, 0);
    } else joint(1, JM[0], P_, 1, 0, 0.07, 0);
    joint(2, JM[1], P_, 2, 0, 0.54, 0);
    joint(3, JM[1], P_, 3, -0.175 * fs, 0.455, 0.01);
    joint(4, JM[1], P_, 4, 0.175 * fs, 0.455, 0.01);
    joint(5, JM[3], P_, 5, 0, -0.29, 0);
    joint(6, JM[4], P_, 6, 0, -0.29, 0);
    joint(7, JM[0], P_, 7, -0.095 * fh, -0.06, 0);
    joint(8, JM[0], P_, 8, 0.095 * fh, -0.06, 0);
    joint(9, JM[7], P_, 9, 0, -0.44, 0);
    joint(10, JM[8], P_, 10, 0, -0.44, 0);
    joint(11, JM[2], P_, 11, 0, 0.115, -0.012);
    const M = B.mats;
    const ta = 1 + (fat - 1) * 0.6, tb = 1 + (fat - 1) * 0.4, tl = 1 + (fat - 1) * 0.65, tm = 1 + (fat - 1) * 0.35, hs = B.headS;
    put(M, 0, JM[0], fat, 1, fat * 0.95);
    put(M, 1, JM[1], fat, 1, fat);
    put(M, 2, JM[2], hs, hs, hs);
    put(M, 3, JM[3], ta, 1, ta); put(M, 4, JM[4], ta, 1, ta);
    put(M, 5, JM[5], tb, 1, tb); put(M, 6, JM[6], tb, 1, tb);
    put(M, 7, JM[7], tl, 1, tl); put(M, 8, JM[8], tl, 1, tl);
    put(M, 9, JM[9], tm, 1, tm); put(M, 10, JM[10], tm, 1, tm);
    put(M, 11, JM[2], hs, hs, hs);
    put(M, 12, JM[11], hs, hs, hs);
    put(M, 13, JM[1], 1, 1, 1);
    put(M, 14, JM[2], hs, hs, hs);
  },

  // 部位 p の位置の行列を out に
  partMatrix(B, p, out) { return out.fromArray(B.mats, p * 16); },
  // 部位 p のローカル点 (lx, ly, lz) の世界の位置
  partLocal(B, p, lx, ly, lz, out) {
    const m = B.mats, o = p * 16;
    return out.set(m[o + 12] + m[o] * lx + m[o + 4] * ly + m[o + 8] * lz, m[o + 13] + m[o + 1] * lx + m[o + 5] * ly + m[o + 9] * lz, m[o + 14] + m[o + 2] * lx + m[o + 6] * ly + m[o + 10] * lz);
  },
  // 部位 p のローカル点 (0, ly, 0) の世界の位置
  partPoint(B, p, ly, out) {
    const m = B.mats, o = p * 16;
    return out.set(m[o + 12] + m[o + 4] * ly, m[o + 13] + m[o + 5] * ly, m[o + 14] + m[o + 6] * ly);
  },

  // ---------- 毎フレームの描画(シーンを描く直前に呼ばれる) ----------
  draw(gibFx) {
    this.frame++;
    const cam = Engine.camera;
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    const cx = Engine.camTarget.x, cz = Engine.camTarget.z;
    const cp = cam.position, close = Engine.viewMode && Engine.viewMode !== 'top';
    const lx = close ? cp.x : cx, lz = close ? cp.z : cz;          // 近い・遠いを測る場所
    const cur = this._cursor; cur.fill(0);
    const meshes = this.meshes;
    const eyes = this.eyes, eyeArr = eyes.instanceMatrix.array, eyeCol = eyes.instanceColor.array;
    let ne = 0;
    for (let bi = 0; bi < MAX_BODY; bi++) {
      const B = this.bodies[bi];
      if (B.mode === 0) continue;
      let x, y, z, rad;
      if (B.mode === 1) { x = B.e.x; y = 1 * B.s; z = B.e.z; rad = 1.4 * B.s * B.fat; }
      else { x = B.ra.x; y = B.ra.y; z = B.ra.z; rad = 1.6 * B.s; if (B.split) rad += Math.hypot(B.rb.x - x, B.rb.z - z); }
      _sph.center.set(x, y, z); _sph.radius = rad + 0.8;
      if (!_fr.intersectsSphere(_sph)) { B.visible = false; continue; }
      B.visible = true;
      if (B.mode === 1) {
        const d = Math.abs(x - lx) + Math.abs(z - lz);
        const skip = d > 50 ? 3 : d > 32 ? 2 : 1;
        if (this.frame - B.lastPose >= skip || B.e.flash > 0) {
          poseAlive(B.e, B);
          this.computeMats(B);
          B.lastPose = this.frame;
        }
      } else this.computeMats(B);
      // 部位を書く
      const hide = B.hide;
      for (let p = 0; p < NP; p++) {
        if (hide & (1 << p)) continue;
        if ((p === P.HELMET && !B.helmet) || (p === P.SHIELD && !B.shield) || (p === P.MASK && !B.mask)) continue;
        const k = PART_MESH[p], m = meshes[k];
        const n = cur[k];
        if (n >= m.userData.cap) continue;
        writeInst(m, n, B.mats, p * 16, B.cloth, p * 3, B.skin, B.tile[p], B.fx);
        cur[k] = n + 1;
      }
      // 切り口(取れた部位のあと)
      if (hide || B.split) this._caps(B, cur);
      // 光る目(生きていて、頭があって、カメラに近い)
      if (B.mode === 1 && !(hide & BIT(P.HEAD)) && B.e.frozen <= 0) {
        const dx = x - cp.x, dz = z - cp.z;
        if (dx * dx + dz * dz < EYE_DIST * EYE_DIST) {
          const o = P.HEAD * 16, mt = B.mats;
          for (let i = 0; i < 16; i++) eyeArr[ne * 16 + i] = mt[o + i];
          const fl = 1 + B.e.flash * 0.8;
          eyeCol[ne * 3] = B.eye[0] * fl; eyeCol[ne * 3 + 1] = B.eye[1] * fl; eyeCol[ne * 3 + 2] = B.eye[2] * fl;
          ne++;
        }
      }
    }
    eyes.count = ne;
    if (ne) { eyes.instanceMatrix.needsUpdate = true; eyes.instanceColor.needsUpdate = true; }
    // ばらばらの部位
    for (const g of this.gibs) {
      if (!g.used) continue;
      const r = g.r;
      _sph.center.set(r.x, r.y, r.z); _sph.radius = 1;
      if (!_fr.intersectsSphere(_sph)) continue;
      _gm.compose(_p.set(r.x, r.y - g.sink, r.z), r.q, _sv.set(1, 1, 1));
      for (let i = 0; i < g.n; i++) {
        const k = g.mesh[i], m = meshes[k], n = cur[k];
        if (n >= m.userData.cap) continue;
        _tm.multiplyMatrices(_gm, g.rel[i]);
        _tm.toArray(_arr16, 0);
        writeInst(m, n, _arr16, 0, g.cloth, i * 3, g.skin, g.tile[i], g.fx);
        cur[k] = n + 1;
      }
      if (g.cap) {
        const m = meshes[CAP_MESH], n = cur[CAP_MESH];
        if (n < m.userData.cap) {
          _tm.multiplyMatrices(_gm, g.capRel); _tm.toArray(_arr16, 0);
          writeInst(m, n, _arr16, 0, _white3, 0, g.skin, TILE.boneCut, g.fx);
          cur[CAP_MESH] = n + 1;
        }
      }
    }
    for (let k = 0; k < meshes.length; k++) {
      const m = meshes[k];
      m.count = cur[k];
      if (cur[k] > 0) {
        m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, cur[k] * 16); m.instanceMatrix.needsUpdate = true;
        const u = m.userData;
        u.cloth.clearUpdateRanges(); u.cloth.addUpdateRange(0, cur[k] * 3); u.cloth.needsUpdate = true;
        u.skin.clearUpdateRanges(); u.skin.addUpdateRange(0, cur[k] * 4); u.skin.needsUpdate = true;
        u.fx.clearUpdateRanges(); u.fx.addUpdateRange(0, cur[k] * 4); u.fx.needsUpdate = true;
      }
    }
  },

  _caps(B, cur) {
    const fat = B.fat, fs = 1 + (fat - 1) * 0.75, fh = 1 + (fat - 1) * 0.8;
    const h = B.hide;
    if (h & BIT(P.HEAD) && !(h & BIT(P.TORSO))) this._cap(B, cur, P.TORSO, 0, 0.545, 0, 0, 0.075 / fat, 0.07, 0.075 / fat);
    if (h & BIT(P.JAW) && !(h & BIT(P.HEAD))) this._cap(B, cur, P.HEAD, 0, 0.085, -0.03, Math.PI, 0.05, 0.03, 0.06);
    if (B.split) {
      if (!(h & BIT(P.TORSO))) this._cap(B, cur, P.TORSO, 0, 0.015, 0, Math.PI, 0.15, 0.09, 0.12);
      this._cap(B, cur, P.PELVIS, 0, 0.1, 0, 0, 0.15, 0.09, 0.12);
    }
    if (h & BIT(P.UAL) && !(h & BIT(P.TORSO))) this._cap(B, cur, P.TORSO, -0.175 * fs / fat, 0.455, 0, 1, 0.06, 0.05, 0.06);
    if (h & BIT(P.UAR) && !(h & BIT(P.TORSO))) this._cap(B, cur, P.TORSO, 0.175 * fs / fat, 0.455, 0, -1, 0.06, 0.05, 0.06);
    if (h & BIT(P.ULL)) this._cap(B, cur, P.PELVIS, -0.095 * fh / fat, -0.09, 0, Math.PI, 0.085, 0.06, 0.085);
    if (h & BIT(P.ULR)) this._cap(B, cur, P.PELVIS, 0.095 * fh / fat, -0.09, 0, Math.PI, 0.085, 0.06, 0.085);
    if (h & BIT(P.LAL) && !(h & BIT(P.UAL))) this._cap(B, cur, P.UAL, 0, -0.29, 0, Math.PI, 0.045, 0.04, 0.045);
    if (h & BIT(P.LAR) && !(h & BIT(P.UAR))) this._cap(B, cur, P.UAR, 0, -0.29, 0, Math.PI, 0.045, 0.04, 0.045);
    if (h & BIT(P.LLL) && !(h & BIT(P.ULL))) this._cap(B, cur, P.ULL, 0, -0.44, 0, Math.PI, 0.055, 0.045, 0.055);
    if (h & BIT(P.LLR) && !(h & BIT(P.ULR))) this._cap(B, cur, P.ULR, 0, -0.44, 0, Math.PI, 0.055, 0.045, 0.055);
  },
  // rot: 0 = 上向き, PI = 下向き, 1 = 左(-x)向き, -1 = 右向き
  _cap(B, cur, p, lx, ly, lz, rot, sx, sy, sz) {
    const m = this.meshes[CAP_MESH], n = cur[CAP_MESH];
    if (n >= m.userData.cap) return;
    _tm.fromArray(B.mats, p * 16);
    if (rot === 1 || rot === -1) _q.setFromAxisAngle(_zAxis, rot * Math.PI / 2);
    else _q.setFromAxisAngle(_xAxis, rot);
    _lm.compose(_p.set(lx, ly, lz), _q, _sv.set(sx, sy, sz));
    _tm.multiply(_lm);
    _tm.toArray(_arr16, 0);
    writeInst(m, n, _arr16, 0, _white3, 0, B.skin, TILE.boneCut, B.fx);
    cur[CAP_MESH] = n + 1;
  },
};

// ---------- 小さな計算の道具(作り置き) ----------
const JM = Array.from({ length: NJ }, () => new THREE.Matrix4());
const _l = new THREE.Matrix4(), _root = new THREE.Matrix4(), _rootB = new THREE.Matrix4();
const _gm = new THREE.Matrix4(), _tm = new THREE.Matrix4(), _lm = new THREE.Matrix4(), _pm = new THREE.Matrix4();
const _p = new THREE.Vector3(), _sv = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _fr = new THREE.Frustum(), _sph = new THREE.Sphere();
const _arr16 = new Float32Array(16), _white3 = new Float32Array([1, 1, 1]);
const _xAxis = new THREE.Vector3(1, 0, 0), _zAxis = new THREE.Vector3(0, 0, 1);

function joint(j, parent, P_, pj, tx, ty, tz) {
  _l.makeRotationFromEuler(_e.set(P_[pj * 3], P_[pj * 3 + 1], P_[pj * 3 + 2], 'XYZ'));
  _l.elements[12] = tx; _l.elements[13] = ty; _l.elements[14] = tz;
  JM[j].multiplyMatrices(parent, _l);
}
function put(M, p, jm, sx, sy, sz) {
  const e = jm.elements, o = p * 16;
  M[o] = e[0] * sx; M[o + 1] = e[1] * sx; M[o + 2] = e[2] * sx; M[o + 3] = 0;
  M[o + 4] = e[4] * sy; M[o + 5] = e[5] * sy; M[o + 6] = e[6] * sy; M[o + 7] = 0;
  M[o + 8] = e[8] * sz; M[o + 9] = e[9] * sz; M[o + 10] = e[10] * sz; M[o + 11] = 0;
  M[o + 12] = e[12]; M[o + 13] = e[13]; M[o + 14] = e[14]; M[o + 15] = 1;
}
function writeInst(m, n, mats, mo, cloth, co, skin, tile, fx) {
  const im = m.instanceMatrix.array, o = n * 16;
  for (let i = 0; i < 16; i++) im[o + i] = mats[mo + i];
  const u = m.userData;
  const c = u.cloth.array, s = u.skin.array, f = u.fx.array;
  c[n * 3] = cloth[co]; c[n * 3 + 1] = cloth[co + 1]; c[n * 3 + 2] = cloth[co + 2];
  s[n * 4] = skin[0]; s[n * 4 + 1] = skin[1]; s[n * 4 + 2] = skin[2]; s[n * 4 + 3] = tile;
  f[n * 4] = fx[0]; f[n * 4 + 1] = fx[1]; f[n * 4 + 2] = fx[2]; f[n * 4 + 3] = fx[3];
}
