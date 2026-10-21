// 演出係: 火花・血しぶき・煙・爆発・弾の光の線・地面の跡・剣の光の弧・光(点光源)。
// たくさん出しても軽いように:
//  - 粒・線・輪・跡は、それぞれ「板 1 枚 × 数千個」をまとめて 1 回で描く(InstancedBufferGeometry + 自作シェーダー)
//  - 入れ物(配列)は最初に作って使い回す。毎フレーム new しない
//  - 点光源は最初に決まった数だけ作り、明るさだけ変えて使い回す(数を変えると固まるため)
// 色は 0xRRGGBB。明るさ k を 1 より大きくすると、画面効果(光のにじみ)で輝く。
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Events } from './events.js';
import * as SH from './fx-shaders.js';

const _c = new THREE.Color();
const _lin = new Map();
// 0xRRGGBB → 計算用の色 [r,g,b](一度作ったら覚えておく)
function L(hex) {
  let c = _lin.get(hex);
  if (!c) { _c.setHex(hex); c = [_c.r, _c.g, _c.b]; _lin.set(hex, c); }
  return c;
}
const rnd = Math.random;
const TAU = Math.PI * 2;

// 板 1 枚(四角)を、たくさん描くための入れ物
function quadGeo(max, attrs, verts) {
  const g = new THREE.InstancedBufferGeometry();
  if (verts) { g.setIndex(verts.index); g.setAttribute('position', new THREE.Float32BufferAttribute(verts.pos, 3)); }
  else {
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  }
  for (const name in attrs) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * attrs[name]), attrs[name]);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  g.instanceCount = 0;
  return g;
}
function upload(geo, names, n) {
  geo.instanceCount = n;
  if (!n) return;
  for (const name of names) {
    const a = geo.attributes[name];
    a.clearUpdateRanges();
    a.addUpdateRange(0, n * a.itemSize);
    a.needsUpdate = true;
  }
}
function fxMesh(geo, vs, fs, blending, order, side = THREE.FrontSide) {
  const mat = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending, side });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = order;
  return m;
}

// ================= 粒(光る粒 / ふつうの粒) =================
// 1 粒 = 24 個の数字: 0 x 1 y 2 z 3 vx 4 vy 5 vz 6 age 7 life 8 s0 9 s1 10-12 色(始め) 13-15 色(終わり)
//   16 濃さ 17 重力 18 空気抵抗 19 伸ばす量 20 形 21 回転 22 回転の速さ 23 床(0 なし 1 はねる 2 くっつく)
const PS = 24;
class ParticlePool {
  constructor(max, fs, blending, order, glow) {
    this.max = max; this.n = 0; this.glow = glow;
    this.d = new Float32Array(max * PS);
    this.geo = quadGeo(max, { iPos: 4, iVel: 4, iCol: 4, iMisc: 2 });
    this.mesh = fxMesh(this.geo, SH.PARTICLE_VS, fs, blending, order);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, hex0, k0, hex1, k1, alpha, grav, drag, stretch, shape, floor) {
    if (this.n >= this.max) return -1;
    const d = this.d, o = this.n++ * PS;
    const c0 = L(hex0), c1 = L(hex1);
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = 0; d[o + 7] = life; d[o + 8] = s0; d[o + 9] = s1;
    d[o + 10] = c0[0] * k0; d[o + 11] = c0[1] * k0; d[o + 12] = c0[2] * k0;
    d[o + 13] = c1[0] * k1; d[o + 14] = c1[1] * k1; d[o + 15] = c1[2] * k1;
    d[o + 16] = alpha; d[o + 17] = grav; d[o + 18] = drag; d[o + 19] = stretch; d[o + 20] = shape;
    d[o + 21] = stretch > 0 ? 0 : rnd() * TAU; d[o + 22] = (rnd() - 0.5) * 2; d[o + 23] = floor;
    return o;
  }
  update(dt) {
    const d = this.d, A = this.geo.attributes;
    const P = A.iPos.array, V = A.iVel.array, C = A.iCol.array, M = A.iMisc.array;
    let n = this.n, w = 0, i = 0;
    const glow = this.glow;
    while (i < n) {
      const o = i * PS;
      const life = d[o + 7];
      let t = 0.5, fade = 1;
      if (life > 0) {
        const age = (d[o + 6] += dt);
        if (age >= life) { n--; if (i < n) d.copyWithin(o, n * PS, n * PS + PS); continue; }
        t = age / life;
        const k = d[o + 18] ? Math.exp(-d[o + 18] * dt) : 1;
        d[o + 3] *= k; d[o + 5] *= k; d[o + 4] = d[o + 4] * k - d[o + 17] * dt;
        d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
        d[o + 21] += d[o + 22] * dt;
        if (d[o + 23] && d[o + 1] < 0.05) {
          d[o + 1] = 0.05;
          if (d[o + 23] === 1) { d[o + 4] = -d[o + 4] * 0.3; d[o + 3] *= 0.55; d[o + 5] *= 0.55; }
          else { d[o + 3] = d[o + 4] = d[o + 5] = 0; }
        }
        if (glow) fade = Math.min(1, t * 14) * (1 - t);
        else if (d[o + 20] < 0.5) fade = Math.min(1, t * 6) * (1 - t);
        else fade = Math.min(1, (1 - t) * 4);
      }
      const j4 = w * 4;
      P[j4] = d[o]; P[j4 + 1] = d[o + 1]; P[j4 + 2] = d[o + 2]; P[j4 + 3] = d[o + 8] + (d[o + 9] - d[o + 8]) * t;
      V[j4] = d[o + 3]; V[j4 + 1] = d[o + 4]; V[j4 + 2] = d[o + 5]; V[j4 + 3] = d[o + 19];
      C[j4] = d[o + 10] + (d[o + 13] - d[o + 10]) * t;
      C[j4 + 1] = d[o + 11] + (d[o + 14] - d[o + 11]) * t;
      C[j4 + 2] = d[o + 12] + (d[o + 15] - d[o + 12]) * t;
      C[j4 + 3] = d[o + 16] * fade;
      M[w * 2] = d[o + 21]; M[w * 2 + 1] = d[o + 20];
      w++;
      if (life <= 0) { n--; if (i < n) d.copyWithin(o, n * PS, n * PS + PS); continue; }   // その場だけの粒
      i++;
    }
    this.n = n;
    upload(this.geo, ['iPos', 'iVel', 'iCol', 'iMisc'], w);
  }
}

// ================= 光の線 =================
// 0-2 始点 3-5 終点 6 太さ 7-9 色 10 濃さ 11 age 12 life 13 種類(0 消えていく 1 飛んでいく曳光弾) 14 速さ 15 尾の長さ
const BS = 16;
class BeamPool {
  constructor(max) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * BS);
    this.geo = quadGeo(max, { iA: 4, iB: 4, iCol: 4 });
    this.mesh = fxMesh(this.geo, SH.BEAM_VS, SH.BEAM_FS, THREE.AdditiveBlending, 6);
  }
  add(x0, y0, z0, x1, y1, z1, width, hex, k, alpha, life, mode = 0, speed = 0, streak = 0) {
    if (this.n >= this.max) return;
    const d = this.d, o = this.n++ * BS, c = L(hex);
    d[o] = x0; d[o + 1] = y0; d[o + 2] = z0; d[o + 3] = x1; d[o + 4] = y1; d[o + 5] = z1;
    d[o + 6] = width; d[o + 7] = c[0] * k; d[o + 8] = c[1] * k; d[o + 9] = c[2] * k; d[o + 10] = alpha;
    d[o + 11] = 0; d[o + 12] = life; d[o + 13] = mode; d[o + 14] = speed; d[o + 15] = streak;
  }
  update(dt) {
    const d = this.d, A = this.geo.attributes, PA = A.iA.array, PB = A.iB.array, C = A.iCol.array;
    let n = this.n, w = 0, i = 0;
    while (i < n) {
      const o = i * BS, life = d[o + 12];
      let ta = 0, tb = 1, wid = d[o + 6], al = d[o + 10];
      if (life > 0) {
        const age = (d[o + 11] += dt);
        if (d[o + 13] === 1) {
          const dx = d[o + 3] - d[o], dy = d[o + 4] - d[o + 1], dz = d[o + 5] - d[o + 2];
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          const head = age * d[o + 14];
          tb = Math.min(1, head / len); ta = Math.max(0, (head - d[o + 15]) / len);
          if (ta >= 1 || age >= life) { n--; if (i < n) d.copyWithin(o, n * BS, n * BS + BS); continue; }
          if (tb >= 1) al *= Math.max(0, 1 - (head - len) / d[o + 15]);
        } else {
          if (age >= life) { n--; if (i < n) d.copyWithin(o, n * BS, n * BS + BS); continue; }
          const t = age / life;
          al *= (1 - t) * (1 - t * 0.5); wid *= 1 - t * 0.6;
        }
      }
      const j = w * 4;
      const x0 = d[o], y0 = d[o + 1], z0 = d[o + 2], dx = d[o + 3] - x0, dy = d[o + 4] - y0, dz = d[o + 5] - z0;
      PA[j] = x0 + dx * ta; PA[j + 1] = y0 + dy * ta; PA[j + 2] = z0 + dz * ta; PA[j + 3] = wid;
      PB[j] = x0 + dx * tb; PB[j + 1] = y0 + dy * tb; PB[j + 2] = z0 + dz * tb; PB[j + 3] = 0;
      C[j] = d[o + 7]; C[j + 1] = d[o + 8]; C[j + 2] = d[o + 9]; C[j + 3] = al;
      w++;
      if (life <= 0) { n--; if (i < n) d.copyWithin(o, n * BS, n * BS + BS); continue; }
      i++;
    }
    this.n = n;
    upload(this.geo, ['iA', 'iB', 'iCol'], w);
  }
}

// ================= 地面の光る輪(衝撃波) =================
// 0-2 中心 3 始めの半径 4 終わりの半径 5 太さ 6-8 色 9 濃さ 10 age 11 life 12 中も光る
const RS = 13;
class RingPool {
  constructor(max) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * RS);
    this.geo = quadGeo(max, { iP: 4, iCol: 4, iMisc: 4 });
    this.mesh = fxMesh(this.geo, SH.GROUND_VS, SH.RING_FS, THREE.AdditiveBlending, 3, THREE.DoubleSide);
  }
  add(x, y, z, r0, r1, th, hex, k, alpha, life, fill = 0) {
    if (this.n >= this.max) return;
    const d = this.d, o = this.n++ * RS, c = L(hex);
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = r0; d[o + 4] = r1; d[o + 5] = th;
    d[o + 6] = c[0] * k; d[o + 7] = c[1] * k; d[o + 8] = c[2] * k; d[o + 9] = alpha; d[o + 10] = 0; d[o + 11] = life; d[o + 12] = fill;
  }
  update(dt) {
    const d = this.d, A = this.geo.attributes, P = A.iP.array, C = A.iCol.array, M = A.iMisc.array;
    let n = this.n, w = 0, i = 0;
    while (i < n) {
      const o = i * RS, life = d[o + 11];
      let r = d[o + 4], al = d[o + 9], th = d[o + 5];
      if (life > 0) {
        const age = (d[o + 10] += dt);
        if (age >= life) { n--; if (i < n) d.copyWithin(o, n * RS, n * RS + RS); continue; }
        const t = age / life, e = 1 - (1 - t) * (1 - t) * (1 - t);
        r = d[o + 3] + (d[o + 4] - d[o + 3]) * e;
        al *= (1 - t) * (1 - t) * Math.min(1, t * 7); th *= 1 - t * 0.5;
      }
      const j = w * 4;
      P[j] = d[o]; P[j + 1] = d[o + 1]; P[j + 2] = d[o + 2]; P[j + 3] = r;
      C[j] = d[o + 6]; C[j + 1] = d[o + 7]; C[j + 2] = d[o + 8]; C[j + 3] = al;
      M[j] = th; M[j + 1] = d[o + 12]; M[j + 2] = 0; M[j + 3] = 0;
      w++;
      if (life <= 0) { n--; if (i < n) d.copyWithin(o, n * RS, n * RS + RS); continue; }
      i++;
    }
    this.n = n;
    upload(this.geo, ['iP', 'iCol', 'iMisc'], w);
  }
}

// ================= 地面の跡(焦げ・血だまり・氷) =================
// 決まった数の場所を順番に上書きしていく(古いものから消える)
const DS = 12; // 0 x 1 z 2 大きさ 3 回転 4 乱数 5 種類 6-8 色 9 濃さ 10 age 11 life
class DecalPool {
  constructor(max) {
    this.max = max; this.next = 0;
    this.d = new Float32Array(max * DS);
    this.geo = quadGeo(max, { iP: 4, iCol: 4, iMisc: 4 });
    this.mesh = fxMesh(this.geo, SH.GROUND_VS, SH.DECAL_FS, THREE.NormalBlending, 1, THREE.DoubleSide);
    this.mesh.material.polygonOffset = true;
    this.mesh.material.polygonOffsetFactor = -2;
    this.mesh.material.polygonOffsetUnits = -2;
  }
  add(x, z, size, kind, hex, alpha, life) {
    const o = this.next * DS, c = L(hex);
    this.next = (this.next + 1) % this.max;
    const d = this.d;
    d[o] = x; d[o + 1] = z; d[o + 2] = size; d[o + 3] = rnd() * TAU; d[o + 4] = rnd(); d[o + 5] = kind;
    d[o + 6] = c[0]; d[o + 7] = c[1]; d[o + 8] = c[2]; d[o + 9] = alpha; d[o + 10] = 0; d[o + 11] = life;
  }
  update(dt) {
    const d = this.d, A = this.geo.attributes, P = A.iP.array, C = A.iCol.array, M = A.iMisc.array;
    let w = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * DS;
      if (d[o + 11] <= 0) continue;
      const age = (d[o + 10] += dt), life = d[o + 11];
      if (age >= life) { d[o + 11] = 0; continue; }
      const t = age / life;
      const grow = Math.min(1, age * 8);
      const j = w * 4;
      P[j] = d[o]; P[j + 1] = 0.045 + i * 0.00002; P[j + 2] = d[o + 1]; P[j + 3] = d[o + 2] * (0.6 + 0.4 * grow);
      C[j] = d[o + 6]; C[j + 1] = d[o + 7]; C[j + 2] = d[o + 8]; C[j + 3] = d[o + 9] * Math.min(1, (1 - t) * 4);
      M[j] = 0; M[j + 1] = d[o + 5]; M[j + 2] = d[o + 4]; M[j + 3] = d[o + 3];
      w++;
    }
    upload(this.geo, ['iP', 'iCol', 'iMisc'], w);
  }
  clear() { for (let i = 0; i < this.max; i++) this.d[i * DS + 11] = 0; }
}

// ================= 剣の光の弧 =================
// 0-2 中心 3 向き 4 弧の角度 5 内の半径 6 外の半径 7 (予備) 8 age 9 life 10-12 色 13 濃さ 14 傾き 15 ふる向き 16 尾 17 高さの幅
const SS = 18;
function arcVerts(seg) {
  const pos = [], index = [];
  for (let i = 0; i <= seg; i++) { const u = i / seg; pos.push(u, 0, 0, u, 1, 0); }
  for (let i = 0; i < seg; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return { pos, index };
}
class SlashPool {
  constructor(max) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * SS);
    this.geo = quadGeo(max, { iC: 4, iS: 4, iCol: 4, iT: 4 }, arcVerts(48));
    this.mesh = fxMesh(this.geo, SH.SLASH_VS, SH.SLASH_FS, THREE.AdditiveBlending, 5, THREE.DoubleSide);
  }
  add(x, y, z, rot, arc, r0, r1, hex, k, life, tilt, dir, trail, hgt) {
    if (this.n >= this.max) return;
    const d = this.d, o = this.n++ * SS, c = L(hex);
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = rot; d[o + 4] = arc; d[o + 5] = r0; d[o + 6] = r1;
    d[o + 8] = 0; d[o + 9] = life; d[o + 10] = c[0] * k; d[o + 11] = c[1] * k; d[o + 12] = c[2] * k; d[o + 13] = 1;
    d[o + 14] = tilt; d[o + 15] = dir; d[o + 16] = trail; d[o + 17] = hgt;
  }
  update(dt) {
    const d = this.d, A = this.geo.attributes, PC = A.iC.array, PS_ = A.iS.array, C = A.iCol.array, T = A.iT.array;
    let n = this.n, w = 0, i = 0;
    while (i < n) {
      const o = i * SS;
      const age = (d[o + 8] += dt), life = d[o + 9];
      if (age >= life) { n--; if (i < n) d.copyWithin(o, n * SS, n * SS + SS); continue; }
      const t = age / life, tr = d[o + 16];
      const e = 1 - Math.pow(1 - t, 4);
      const j = w * 4;
      PC[j] = d[o]; PC[j + 1] = d[o + 1]; PC[j + 2] = d[o + 2]; PC[j + 3] = d[o + 3];
      PS_[j] = d[o + 4]; PS_[j + 1] = d[o + 5]; PS_[j + 2] = d[o + 6] * (1 + t * 0.12); PS_[j + 3] = (1 + tr) * e;
      C[j] = d[o + 10]; C[j + 1] = d[o + 11]; C[j + 2] = d[o + 12]; C[j + 3] = (1 - t * t);
      T[j] = d[o + 14]; T[j + 1] = d[o + 15]; T[j + 2] = tr; T[j + 3] = d[o + 17];
      w++; i++;
    }
    this.n = n;
    upload(this.geo, ['iC', 'iS', 'iCol', 'iT'], w);
  }
}

// ================= かけら(薬きょう・がれき・氷のかけら): 光を受ける小さな箱 =================
// 0-2 位置 3-5 速さ 6-8 回転 9-11 回転の速さ 12-14 大きさ 15 age 16 life 17-19 色 20 はね返り
const CS = 21;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
class ChunkPool {
  constructor(max) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * CS);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set(0xffffff));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
  }
  add(x, y, z, vx, vy, vz, sx, sy, sz, hex, life, bounce = 0.35) {
    if (this.n >= this.max) return;
    const d = this.d, o = this.n++ * CS, c = L(hex);
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = rnd() * 6; d[o + 7] = rnd() * 6; d[o + 8] = rnd() * 6;
    d[o + 9] = (rnd() - 0.5) * 30; d[o + 10] = (rnd() - 0.5) * 30; d[o + 11] = (rnd() - 0.5) * 30;
    d[o + 12] = sx; d[o + 13] = sy; d[o + 14] = sz; d[o + 15] = 0; d[o + 16] = life;
    d[o + 17] = c[0]; d[o + 18] = c[1]; d[o + 19] = c[2]; d[o + 20] = bounce;
  }
  update(dt) {
    const d = this.d, m = this.mesh, IM = m.instanceMatrix.array, IC = m.instanceColor.array;
    let n = this.n, i = 0;
    while (i < n) {
      const o = i * CS;
      const age = (d[o + 15] += dt), life = d[o + 16];
      if (age >= life) { n--; if (i < n) d.copyWithin(o, n * CS, n * CS + CS); continue; }
      d[o + 4] -= 22 * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const floorY = d[o + 13] * 0.5;
      if (d[o + 1] < floorY) {
        d[o + 1] = floorY;
        if (d[o + 4] < -1.5) { d[o + 4] = -d[o + 4] * d[o + 20]; d[o + 3] *= 0.6; d[o + 5] *= 0.6; d[o + 9] *= 0.6; d[o + 10] *= 0.6; d[o + 11] *= 0.6; }
        else { d[o + 4] = 0; d[o + 3] *= 0.85; d[o + 5] *= 0.85; d[o + 9] *= 0.8; d[o + 10] *= 0.8; d[o + 11] *= 0.8; d[o + 6] *= 0.9; d[o + 8] *= 0.9; }
      }
      d[o + 6] += d[o + 9] * dt; d[o + 7] += d[o + 10] * dt; d[o + 8] += d[o + 11] * dt;
      const t = age / life, sh = t > 0.75 ? (1 - t) * 4 : 1;
      _q.setFromEuler(_e.set(d[o + 6], d[o + 7], d[o + 8]));
      _m4.compose(_v1.set(d[o], d[o + 1], d[o + 2]), _q, _v2.set(d[o + 12] * sh, d[o + 13] * sh, d[o + 14] * sh));
      _m4.toArray(IM, i * 16);
      IC[i * 3] = d[o + 17]; IC[i * 3 + 1] = d[o + 18]; IC[i * 3 + 2] = d[o + 19];
      i++;
    }
    this.n = n;
    m.count = n;
    if (n) {
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, n * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, n * 3); m.instanceColor.needsUpdate = true;
    }
  }
}

// ================= 公開する道具 =================
export const FX = {
  quality: 1,               // 粒の多さ(low 0.4 / mid 0.7 / high 1)
  killFx: false,            // 倒したときの血は zombie-gore.js が倒れ方ごとに出す(二重にならないよう、ここは出さない)
  glowPool: null, solidPool: null, beams: null, rings: null, decals: null, slashes: null, chunks: null,
  lights: [], _lt: [], _boom: 0, _bloodBudget: 80,

  init(scene) {
    const q = Engine.quality;
    this.quality = q === 'low' ? 0.4 : q === 'mid' ? 0.7 : 1;
    const big = q === 'high';
    this.solidPool = new ParticlePool(big ? 2600 : q === 'mid' ? 1800 : 900, SH.SOLID_FS, THREE.NormalBlending, 2, false);
    this.glowPool = new ParticlePool(big ? 5000 : q === 'mid' ? 3500 : 1800, SH.GLOW_FS, THREE.AdditiveBlending, 4, true);
    this.beams = new BeamPool(700);
    this.rings = new RingPool(80);
    this.decals = new DecalPool(big ? 140 : q === 'mid' ? 100 : 50);
    this.slashes = new SlashPool(24);
    this.chunks = new ChunkPool(big ? 420 : 200);
    for (const o of [this.decals, this.solidPool, this.rings, this.glowPool, this.slashes, this.beams]) scene.add(o.mesh);
    scene.add(this.chunks.mesh);

    // 点光源: 数は最初に決めて、ずっと変えない(銃口と爆発の光に使い回す)
    const nl = q === 'high' ? 6 : q === 'mid' ? 4 : 2;
    for (let i = 0; i < nl; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push(l);
      this._lt.push({ t: 0, dur: 1, i0: 0 });
    }

    Events.on('kill', (k) => this._onKill(k));
  },

  reset() {
    this.glowPool.n = 0; this.solidPool.n = 0; this.beams.n = 0; this.rings.n = 0; this.slashes.n = 0; this.chunks.n = 0;
    this.decals.clear();
    for (let i = 0; i < this.lights.length; i++) { this.lights[i].intensity = 0; this._lt[i].t = 0; }
    this.update(0);
  },

  // 量を画質に合わせる
  q(n) { const v = n * this.quality; return v < 1 ? (rnd() < v ? 1 : 0) : Math.round(v); },

  // ---------- 前からある約束(API) ----------
  // 粒をまとめて出す。暗い色なら煙・血のような ふつうの粒、明るい色なら光る粒
  burst({ x, y = 1, z, count = 10, color = 0xffaa33, speed = 6, up = 2, life = 0.5, size = 0.15, grav = 9.8, drag = 1, dirX = 0, dirZ = 0, spread = 1, glow, intensity = 2 }) {
    const c = L(color), lum = c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1;
    const isGlow = glow !== undefined ? glow : lum > 0.12;
    const pool = isGlow ? this.glowPool : this.solidPool;
    const n = this.q(count), s = size * 0.6;
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = speed * (0.3 + rnd() * 0.7);
      pool.emit(x, y, z, Math.cos(a) * sp * spread + dirX * speed, up * (0.5 + rnd()), Math.sin(a) * sp * spread + dirZ * speed,
        life * (0.6 + rnd() * 0.4), s * (0.6 + rnd() * 0.8), s * 0.3, color, isGlow ? intensity : 1, color, isGlow ? intensity * 0.6 : 0.8,
        1, grav, drag, isGlow ? 0.025 : 0, isGlow ? 0 : 1, 1);
    }
  },

  // 血しぶき(向き dirX/dirZ に飛ぶ)
  blood(x, y, z, dirX = 0, dirZ = 0, amount = 1) {
    if (this._bloodBudget <= 0) return;
    const sp = this.solidPool, n = Math.min(this._bloodBudget, this.q(3 + 6 * amount));
    this._bloodBudget -= n;
    for (let i = 0; i < n; i++) {
      const s = 2 + rnd() * 5 * Math.min(2, amount), a = rnd() * TAU, side = 1.5 + rnd() * 2;
      sp.emit(x + (rnd() - 0.5) * 0.3, y + (rnd() - 0.5) * 0.4, z + (rnd() - 0.5) * 0.3,
        dirX * s + Math.cos(a) * side, 1 + rnd() * 3.5, dirZ * s + Math.sin(a) * side,
        0.35 + rnd() * 0.35, 0.06 + rnd() * 0.08, 0.04, 0x6a0505, 1, 0x300202, 1, 1, 14, 1.2, 0, 1, 2);
    }
    // 霧のような血
    const m = this.q(1 + amount);
    for (let i = 0; i < m; i++)
      sp.emit(x, y, z, dirX * 3 + (rnd() - 0.5) * 2, 0.5 + rnd(), dirZ * 3 + (rnd() - 0.5) * 2, 0.35 + rnd() * 0.2, 0.2, 0.55 + 0.25 * amount, 0x6a0505, 1, 0x3a0303, 1, 0.55, 0, 4, 0, 0, 0);
  },

  // 爆発。kind: 'fire'(ふつう)| 'plasma'(青むらさき)| 'ice'(氷)| 'void'(ブラックホール)| 'small'(小さめ)
  explosion(x, z, radius = 5, kind = 'fire') {
    const g = this.glowPool, s = this.solidPool, R = radius;
    const pal = KIND[kind] || KIND.fire;
    const y = 0.8;
    // 爆発が重なるほど、1 つ 1 つの光を弱くする(画面が真っ白にならないように)
    const b = 1 / (1 + this._boom * 0.12);
    this._boom += R;
    // 一瞬の白い光
    g.emit(x, y + 0.3, z, 0, 0, 0, 0.12, R * 0.35, R * 0.55, 0xffffff, 0.8 * b, pal.c0, 0.45 * b, 1, 0, 0, 0, 0, 0);
    g.emit(x, y, z, 0, 0, 0, 0.09, R * 0.3, R * 0.45, 0xffffff, 2 * b, 0xffffff, 1.2 * b, 1, 0, 0, 0, 2, 0);
    // 火の玉(ふつうの重ね方で、白く飛ばない炎の かたまり)+ 中の光
    const nf = this.q(8 + R * 3);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * TAU, u = rnd(), sp = R * (1.0 + rnd() * 1.6);
      s.emit(x + Math.cos(a) * u * R * 0.3, y + rnd() * R * 0.3, z + Math.sin(a) * u * R * 0.3,
        Math.cos(a) * sp, R * (0.5 + rnd() * 1.3), Math.sin(a) * sp, 0.4 + rnd() * 0.45, R * (0.13 + rnd() * 0.08), R * (0.3 + rnd() * 0.14),
        pal.fire, 2.6, pal.c2, 0.5, 1.4, -2, 4.5, 0, 0, 0);
    }
    const nc = this.q(3 + R * 0.6);
    for (let i = 0; i < nc; i++) {
      const a = rnd() * TAU, sp = R * (0.5 + rnd());
      g.emit(x, y + 0.5, z, Math.cos(a) * sp, R * 0.6, Math.sin(a) * sp, 0.25 + rnd() * 0.15, R * 0.25, R * 0.35, pal.c0, 1.1 * b, pal.c1, 0.4 * b, 1, 0, 4, 0, 0, 0);
    }
    // 火花(すじになって飛ぶ)
    const ns = this.q(14 + R * 4);
    for (let i = 0; i < ns; i++) {
      const a = rnd() * TAU, sp = R * (3 + rnd() * 5);
      g.emit(x, y + 0.3, z, Math.cos(a) * sp, 2 + rnd() * R * 2.4, Math.sin(a) * sp, 0.4 + rnd() * 0.6, 0.07, 0.03,
        pal.spark, 8, pal.c1, 3, 1, 16, 1.4, 0.05, 1, 1);
    }
    // 煙の柱
    if (pal.smoke) {
      const nm = this.q(6 + R * 2);
      for (let i = 0; i < nm; i++) {
        const a = rnd() * TAU, u = rnd() * R * 0.5;
        s.emit(x + Math.cos(a) * u, y + rnd() * 1.5, z + Math.sin(a) * u, Math.cos(a) * R * 0.5, 1.5 + rnd() * 3.5, Math.sin(a) * R * 0.5,
          1.6 + rnd() * 1.6, R * 0.25, R * (0.5 + rnd() * 0.3), pal.smoke, 1, 0x4a4a4a, 1, 0.75, -0.6, 1.4, 0, 0, 0);
      }
      // 地面を走る土ぼこり
      const nd = this.q(8 + R * 1.5);
      for (let i = 0; i < nd; i++) {
        const a = rnd() * TAU, sp = R * (2.5 + rnd() * 1.5);
        s.emit(x + Math.cos(a) * 0.5, 0.35, z + Math.sin(a) * 0.5, Math.cos(a) * sp, 0.3 + rnd(), Math.sin(a) * sp,
          0.8 + rnd() * 0.5, R * 0.15, R * 0.35, 0x6b5f50, 1, 0x4a443c, 1, 0.6, 0, 3, 0, 0, 0);
      }
    }
    // 衝撃波の輪
    this.rings.add(x, 0.12, z, R * 0.2, R * 1.6, R * 0.09, pal.ring, 1.6 * b, 1, 0.4, 0);
    this.rings.add(x, 0.14, z, R * 0.1, R * 0.9, R * 0.22, pal.c0, 0.5 * b, 0.8, 0.25, 0);
    // がれき
    if (pal.debris) {
      const nc = this.q(4 + R * 1.2);
      for (let i = 0; i < nc; i++) {
        const a = rnd() * TAU, sp = 3 + rnd() * R * 1.4, k = 0.1 + rnd() * 0.18;
        this.chunks.add(x, 0.5, z, Math.cos(a) * sp, 6 + rnd() * R * 1.8, Math.sin(a) * sp, k, k * (0.6 + rnd()), k, pal.debris, 2 + rnd() * 1.5);
      }
    }
    // 地面の跡
    this.decals.add(x, z, R * 0.75, pal.decalKind, pal.decal, 0.9, 25);
    // 光
    this.flash(x, 3.5, z, pal.light, 5 * R * b, R * 4.5, 0.3);
    Engine.shake(Math.min(1.25, 0.25 + R / 8));
  },

  // 弾の光の線。曳光弾のように 光のすじが 飛んでいく(life は消えるまでの長さの目安)
  tracer(x0, y0, z0, x1, y1, z1, color = 0xffdd66, life = 0.06, width = 0.07) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = Math.max(220, len / Math.max(0.03, life));
    this.beams.add(x0, y0, z0, x1, y1, z1, width, color, 5, 1, 1, 1, speed, Math.min(len, 9));
    this.beams.add(x0, y0, z0, x1, y1, z1, width * 0.35, color, 2, 0.45, 0.05, 0);   // うすい残像
  },

  // ---------- 足した道具 ----------
  // 光の線(しばらく光って消える)。life < 0 ならこのフレームだけ
  beam(x0, y0, z0, x1, y1, z1, color, width = 0.15, life = 0.2, k = 4, alpha = 1) {
    this.beams.add(x0, y0, z0, x1, y1, z1, width, color, k, alpha, life, 0);
  },
  // 稲妻(ぎざぎざの線)。from → to を何回か折れ曲がる
  bolt(x0, y0, z0, x1, y1, z1, color = 0x88ccff, width = 0.12, life = 0.12, jag = 0.6, segs = 7) {
    let px = x0, py = y0, pz = z0;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      let nx = x0 + (x1 - x0) * t, ny = y0 + (y1 - y0) * t, nz = z0 + (z1 - z0) * t;
      if (i < segs) { nx += (rnd() - 0.5) * jag * 2; ny += (rnd() - 0.5) * jag; nz += (rnd() - 0.5) * jag * 2; }
      this.beams.add(px, py, pz, nx, ny, nz, width, color, 6, 1, life, 0);
      if (rnd() < 0.25 && i < segs) {   // 枝分かれ
        const bx = nx + (rnd() - 0.5) * jag * 4, bz = nz + (rnd() - 0.5) * jag * 4;
        this.beams.add(nx, ny, nz, bx, ny + (rnd() - 0.5) * jag, bz, width * 0.5, color, 4, 0.8, life * 0.8, 0);
      }
      px = nx; py = ny; pz = nz;
    }
  },
  // 光の玉(このフレームだけ)。弾・ロケットの火・ブラックホールなど、動くものの光
  glow(x, y, z, size, color, k = 3, shape = 0) {
    this.glowPool.emit(x, y, z, 0, 0, 0, -1, size, size, color, k, color, k, 1, 0, 0, 0, shape, 0);
  },
  // 光る粒 1 つ(細かい指定)
  spark(x, y, z, vx, vy, vz, life, size, color, k = 4, color2 = color, k2 = k * 0.5, stretch = 0.04, grav = 12, drag = 1, floor = 1) {
    this.glowPool.emit(x, y, z, vx, vy, vz, life, size, size * 0.4, color, k, color2, k2, 1, grav, drag, stretch, stretch > 0 ? 1 : 0, floor);
  },
  // 炎の粒(白黄 → 橙 → 赤 と変わり、ふくらむ)
  flame(x, y, z, vx, vy, vz, size = 0.4, life = 0.5, hot = 0xffb050, cool = 0xc02a06, k = 2.4) {
    this.solidPool.emit(x, y, z, vx, vy, vz, life, size * 0.45, size * 2.0, hot, k, cool, k * 0.3, 1.3, -3, 1.6, 0, 0, 0);
  },
  // 光る火の粉(炎の中の明るい所)
  ember(x, y, z, vx, vy, vz, size = 0.2, life = 0.4, color = 0xffc070, k = 2) {
    this.glowPool.emit(x, y, z, vx, vy, vz, life, size, size * 0.6, color, k, color, k * 0.4, 1, -2, 1.6, 0, 0, 0);
  },
  // 煙(ふつうの粒)
  smoke(x, y, z, size = 0.5, life = 1.2, color = 0x555555, vx = 0, vy = 1, vz = 0, alpha = 0.6) {
    this.solidPool.emit(x, y, z, vx, vy, vz, life, size * 0.6, size * 1.8, color, 1, 0x3c3c3c, 1, alpha, -0.3, 1.2, 0, 0, 0);
  },
  // 銃口の火(dir は撃つ向き)。size 1 = ふつう
  muzzle(x, y, z, dirX, dirZ, color = 0xffc060, size = 1, light = true) {
    const g = this.glowPool;
    g.emit(x, y, z, 0, 0, 0, 0.05, 0.2 * size, 0.3 * size, 0xffffff, 2.2, color, 1.6, 1, 0, 0, 0, 0, 0);
    g.emit(x + dirX * 0.25 * size, y, z + dirZ * 0.25 * size, dirX * 14 * size, 0, dirZ * 14 * size, 0.05, 0.12 * size, 0.18 * size, color, 3.5, color, 1.5, 1, 0, 6, 0.03, 0, 0);
    g.emit(x, y, z, 0, 0, 0, 0.04, 0.34 * size, 0.2 * size, color, 2.2, color, 1, 1, 0, 0, 0, 2, 0);
    const n = this.q(2 * size);
    for (let i = 0; i < n; i++) {
      const s = 8 + rnd() * 10;
      g.emit(x, y, z, dirX * s + (rnd() - 0.5) * 5, (rnd() - 0.2) * 3, dirZ * s + (rnd() - 0.5) * 5, 0.12 + rnd() * 0.1, 0.03, 0.015, color, 6, color, 2, 1, 6, 2, 0.03, 1, 0);
    }
    if (light) this.muzzleLight(x, y + 0.4, z, color, 5 * size);
  },
  // 弾が壁に当たった所: 火花 + 土ぼこり + 小さなかけら
  impact(x, y, z, dirX, dirZ, color = 0xffc070) {
    const g = this.glowPool, n = this.q(5);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, s = 3 + rnd() * 7;
      g.emit(x, y, z, -dirX * s + Math.cos(a) * 4, 1 + rnd() * 5, -dirZ * s + Math.sin(a) * 4, 0.2 + rnd() * 0.25, 0.035, 0.015, color, 8, 0xff6020, 2, 1, 18, 1, 0.035, 1, 1);
    }
    g.emit(x, y, z, 0, 0, 0, 0.06, 0.25, 0.35, 0xffffff, 3, color, 2, 1, 0, 0, 0, 2, 0);
    if (rnd() < this.quality) this.solidPool.emit(x - dirX * 0.2, y, z - dirZ * 0.2, -dirX * 1.5, 0.6, -dirZ * 1.5, 0.6 + rnd() * 0.3, 0.12, 0.45, 0x8a8070, 1, 0x5a554c, 1, 0.5, 0, 3, 0, 0, 0);
    if (rnd() < 0.3 * this.quality) this.chunks.add(x, y, z, -dirX * 3 + (rnd() - 0.5) * 3, 2 + rnd() * 3, -dirZ * 3 + (rnd() - 0.5) * 3, 0.06, 0.05, 0.06, 0x6a6560, 1.2);
  },
  // 撃った弾の薬きょう(銃の右へ はじき出される)。kind: 'brass' | 'shell'(ショットガンの赤い殻)| 'big'
  casing(x, y, z, dirX, dirZ, kind = 'brass') {
    if (rnd() > 0.35 + this.quality * 0.65) return;
    const rx = -dirZ, rz = dirX;   // 右
    const s = 2.5 + rnd() * 2;
    const big = kind === 'big', sh = kind === 'shell';
    this.chunks.add(x, y, z, rx * s - dirX * 1.5 + (rnd() - 0.5), 3 + rnd() * 2.5, rz * s - dirZ * 1.5 + (rnd() - 0.5),
      sh ? 0.07 : big ? 0.06 : 0.035, sh ? 0.16 : big ? 0.14 : 0.08, sh ? 0.07 : big ? 0.06 : 0.035, sh ? 0xb02020 : 0xd4a640, 1.6 + rnd(), 0.4);
  },
  // がれき・かけら
  debris(x, y, z, count, speed, color = 0x5a5048, size = 0.15, life = 2) {
    const n = this.q(count);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = speed * (0.3 + rnd() * 0.7), k = size * (0.5 + rnd());
      this.chunks.add(x, y, z, Math.cos(a) * sp, speed * (0.4 + rnd() * 0.8), Math.sin(a) * sp, k, k * (0.5 + rnd()), k, color, life * (0.7 + rnd() * 0.6));
    }
  },
  // 氷のかけら(凍った敵が砕けた)
  shatter(x, y, z, amount = 1) {
    const n = this.q(6 * amount);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 3 + rnd() * 6, k = 0.08 + rnd() * 0.12;
      this.chunks.add(x, y + rnd(), z, Math.cos(a) * sp, 3 + rnd() * 6, Math.sin(a) * sp, k * 0.6, k * 1.8, k * 0.6, rnd() < 0.5 ? 0xd8f4ff : 0x8fd0ff, 0.9 + rnd() * 0.5, 0.3);
    }
    const g = this.glowPool, m = this.q(8 * amount);
    for (let i = 0; i < m; i++) {
      const a = rnd() * TAU, sp = 2 + rnd() * 6;
      g.emit(x, y + 0.5, z, Math.cos(a) * sp, 1 + rnd() * 4, Math.sin(a) * sp, 0.4 + rnd() * 0.4, 0.06, 0.02, 0xcff0ff, 5, 0x60b0ff, 2, 1, 8, 2, 0.02, 2, 1);
    }
    this.solidPool.emit(x, y, z, 0, 0.8, 0, 0.6, 0.4, 1.3, 0xe0f4ff, 1, 0xa0c8e0, 1, 0.45, 0, 2, 0, 0, 0);
    if (rnd() < 0.3) this.decals.add(x, z, 0.6 * amount, 2, 0x8ab8d8, 0.4, 8);
  },
  // 地面の光る輪(衝撃波)。life < 0 なら このフレームだけ
  ring(x, z, r0, r1, life = 0.4, color = 0xffffff, thick = 0.4, k = 3, alpha = 1, fill = 0, y = 0.12) {
    this.rings.add(x, y, z, r0, r1, thick, color, k, alpha, life, fill);
  },
  // 地面の跡。kind: 'scorch'(焦げ)| 'blood'(血)| 'ice'(氷)
  decal(x, z, size, kind = 'scorch', life = 25) {
    if (kind === 'blood') this.decals.add(x, z, size, 1, 0x4a0303, 0.85, life);
    else if (kind === 'ice') this.decals.add(x, z, size, 2, 0x8ab8d8, 0.35, life);
    else this.decals.add(x, z, size, 0, 0x1a1512, 0.85, life);
  },
  // 剣の光の弧。rot = まん中の向き(facing と同じ), arc = 弧の角度, r0/r1 = 内/外の半径, dir = ふる向き(+1/-1), tilt = 傾き
  slash(x, y, z, rot, arc = 3.4, r0 = 0.8, r1 = 3, color = 0x66ccff, life = 0.22, dir = 1, tilt = 0, k = 3, trail = 0.75, hgt = 0.25) {
    this.slashes.add(x, y, z, rot, arc, r0, r1, color, k, life, tilt, dir, trail, hgt);
  },
  // 点光源をぴかっと(爆発など)。dur 秒で暗くなる
  flash(x, y, z, color = 0xffaa55, intensity = 300, distance = 20, dur = 0.25) {
    const n = this.lights.length;
    if (!n) return;
    let best = n > 3 ? 1 : 0, bv = Infinity;
    for (let i = n > 3 ? 1 : 0; i < n; i++) {
      const lt = this._lt[i], v = lt.t > 0 ? lt.i0 * (lt.t / lt.dur) : 0;
      if (v < bv) { bv = v; best = i; }
    }
    if (bv > intensity) return;
    this._setLight(best, x, y, z, color, intensity, distance, dur);
  },
  // 銃口の光(いつも同じ光を使う。光が 4 つ以上あるとき)
  muzzleLight(x, y, z, color, intensity = 14) {
    if (this.lights.length > 3) this._setLight(0, x, y, z, color, intensity, 9, 0.06);
    else this.flash(x, y, z, color, intensity, 9, 0.06);
  },
  _setLight(i, x, y, z, color, intensity, distance, dur) {
    const l = this.lights[i], lt = this._lt[i];
    l.position.set(x, y, z); l.color.setHex(color); l.distance = distance;
    lt.t = dur; lt.dur = dur; lt.i0 = intensity;
    l.intensity = intensity;
  },

  _onKill(k) {
    if (!this.killFx) return;
    const f = Math.min(3, 0.6 + (k.force || 0) / 20) * (k.scale || 1);
    const boom = k.cause === 'explosion' || k.cause === 'spin' || k.cause === 'blackhole';
    this.blood(k.x, 1.0 * (k.scale || 1), k.z, k.dirX || 0, k.dirZ || 0, boom ? 1.4 : f);
    if (k.boss || rnd() < (boom ? 0.45 : 0.3)) this.decals.add(k.x + (k.dirX || 0) * 0.8, k.z + (k.dirZ || 0) * 0.8, (0.5 + rnd() * 0.5) * (k.scale || 1) * (k.boss ? 3 : 1), 1, 0x3a0404, 0.8, 16);
  },

  // 毎ステップ(1/60 秒): 動かして、描く入れ物に書く
  update(dt) {
    this._bloodBudget = Math.round(70 * this.quality) + 10;
    this._boom *= Math.exp(-dt * 4);
    this.solidPool.update(dt);
    this.glowPool.update(dt);
    this.beams.update(dt);
    this.rings.update(dt);
    this.decals.update(dt);
    this.slashes.update(dt);
    this.chunks.update(dt);
    for (let i = 0; i < this.lights.length; i++) {
      const lt = this._lt[i];
      if (lt.t <= 0) continue;
      lt.t -= dt;
      const k = Math.max(0, lt.t / lt.dur);
      this.lights[i].intensity = lt.i0 * k * k;
    }
  },

  // 数(確認用)
  stats() {
    return { glow: this.glowPool.n, solid: this.solidPool.n, beams: this.beams.n, rings: this.rings.n, slashes: this.slashes.n, chunks: this.chunks.n };
  },
};

// 爆発の色の組み合わせ
const KIND = {
  fire:   { fire: 0xff9a35, c0: 0xffc060, c1: 0xff3c0a, c2: 0x4a1606, spark: 0xffc060, ring: 0xffb060, smoke: 0x3a3632, debris: 0x4a4038, decal: 0x1a1512, decalKind: 0, light: 0xff9a40 },
  small:  { fire: 0xff9a35, c0: 0xffc060, c1: 0xff4a10, c2: 0x4a1606, spark: 0xffc060, ring: 0xffb060, smoke: 0x4a4642, debris: 0, decal: 0x1a1512, decalKind: 0, light: 0xff9a40 },
  plasma: { fire: 0x9a70ff, c0: 0xc8b0ff, c1: 0x5a20ff, c2: 0x22104a, spark: 0xb0d0ff, ring: 0x9a7aff, smoke: 0, debris: 0, decal: 0x14101e, decalKind: 0, light: 0x8a60ff },
  ice:    { fire: 0xb0e0ff, c0: 0xe8f8ff, c1: 0x4aa0ff, c2: 0x5a8ab0, spark: 0xd0f0ff, ring: 0x9ad8ff, smoke: 0, debris: 0xbfe8ff, decal: 0x9cc8e8, decalKind: 2, light: 0x80c0ff },
  void:   { fire: 0xa050ff, c0: 0xe0b0ff, c1: 0x6a10c0, c2: 0x200634, spark: 0xf0d0ff, ring: 0xc070ff, smoke: 0x1a1020, debris: 0x302838, decal: 0x0a0610, decalKind: 0, light: 0xa050ff },
};
