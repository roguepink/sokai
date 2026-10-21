// マップ係: 形をまとめて描くための道具。
//  Builder  … 動かない形(箱・板・円柱など)を「区画 × 材質」ごとに 1 つのメッシュへまとめる(描く回数を減らす)
//  Instancer … 同じ形をたくさん(木・車・街灯…)を「区画 × 種類」ごとに InstancedMesh にする
// どちらも区画(チャンク)ごとに分けるので、画面の外の区画は描かれない(視錐台カリング)。
import * as THREE from 'three';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

// 色: 0xRRGGBB(sRGB) か [r,g,b](そのままの値。1 より大きくてよい=光る)
export function col3(c, out = [1, 1, 1]) {
  if (c == null) { out[0] = out[1] = out[2] = 1; return out; }
  if (typeof c === 'number') { _c.setHex(c); out[0] = _c.r; out[1] = _c.g; out[2] = _c.b; return out; }
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out;
}

class Bucket {
  constructor(mat) { this.mat = mat; this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
}

export class Builder {
  // chunk: 区画の大きさ(m)。0 なら区画に分けない(材質ごとに 1 つ)
  constructor(chunk = 80, half = 400) { this.chunk = chunk; this.half = half; this.map = new Map(); this._col = [1, 1, 1]; }

  bucket(mat, x = 0, z = 0) {
    let key = mat ? mat.uuid : '_';
    if (this.chunk) key += '|' + Math.floor((x + this.half) / this.chunk) + '|' + Math.floor((z + this.half) / this.chunk);
    let b = this.map.get(key);
    if (!b) { b = new Bucket(mat); this.map.set(key, b); }
    return b;
  }

  // 四角形 1 枚: P0 = 左下、R = 右向き(単位)、U = 上向き(単位)、幅 w・高さ h。表は R×U の向き
  face(b, p0x, p0y, p0z, rx, ry, rz, ux, uy, uz, w, h, u0, v0, u1, v1, col, rot) {
    const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux;
    const base = b.v;
    for (let k = 0; k < 4; k++) {
      const a = k === 1 || k === 2 ? w : 0, c = k >= 2 ? h : 0;
      let x = p0x + rx * a + ux * c, y = p0y + ry * a + uy * c, z = p0z + rz * a + uz * c;
      let mx = nx, mz = nz;
      if (rot) {
        const dx = x - rot.cx, dz = z - rot.cz;
        x = rot.cx + dx * rot.c - dz * rot.s; z = rot.cz + dx * rot.s + dz * rot.c;
        mx = nx * rot.c - nz * rot.s; mz = nx * rot.s + nz * rot.c;
      }
      b.p.push(x, y, z); b.n.push(mx, ny, mz);
      b.u.push(k === 1 || k === 2 ? u1 : u0, k >= 2 ? v1 : v0);
      b.c.push(col[0], col[1], col[2]);
    }
    b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    b.v += 4;
  }

  // 箱。o: { col, s:[横,縦](模様1枚の m), uo, vo(模様のずらし), skip(面を省く: 'b'下 't'上 'n' 's' 'e' 'w' の文字), rot(Y 回転), top(上の面だけ別の材質) }
  box(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const col = col3(o.col, this._col);
    const s = o.s || (mat && mat.userData.s) || [4, 4];
    const su = s[0], sv = s[1], uo = o.uo || 0, vo = o.vo || 0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const rot = o.rot ? { cx, cz, c: Math.cos(o.rot), s: Math.sin(o.rot) } : null;
    const b = this.bucket(mat, o.bx ?? cx, o.bz ?? cz);
    const w = x1 - x0, h = y1 - y0, d = z1 - z0, skip = o.skip || 'b';
    const V0 = vo, V1 = vo + h / sv;
    if (!skip.includes('e')) this.face(b, x1, y0, z1, 0, 0, -1, 0, 1, 0, d, h, uo, V0, uo + d / su, V1, col, rot);
    if (!skip.includes('w')) this.face(b, x0, y0, z0, 0, 0, 1, 0, 1, 0, d, h, uo, V0, uo + d / su, V1, col, rot);
    if (!skip.includes('s')) this.face(b, x0, y0, z1, 1, 0, 0, 0, 1, 0, w, h, uo, V0, uo + w / su, V1, col, rot);
    if (!skip.includes('n')) this.face(b, x1, y0, z0, -1, 0, 0, 0, 1, 0, w, h, uo, V0, uo + w / su, V1, col, rot);
    if (!skip.includes('t')) {
      const tb = o.top ? this.bucket(o.top, o.bx ?? cx, o.bz ?? cz) : b;
      const ts = o.top ? (o.top.userData.s || [4, 4]) : (o.ts || s);
      const tc = o.topCol != null ? col3(o.topCol, [1, 1, 1]) : col;
      this.face(tb, x0, y1, z1, 1, 0, 0, 0, 0, -1, w, d, x0 / ts[0], -z1 / ts[1], x1 / ts[0], -z0 / ts[1], tc, rot);
    }
    if (!skip.includes('b')) this.face(b, x0, y0, z0, 1, 0, 0, 0, 0, 1, w, d, 0, 0, w / su, d / sv, col, rot);
  }

  // 地面に置く板(上向き)。中心 (cx,cz)、大きさ sx×sz、回転 rot。uv は [u0,v0,u1,v1](省くと世界座標で敷く)
  flat(mat, cx, y, cz, sx, sz, o = {}) {
    const col = col3(o.col, this._col);
    const b = this.bucket(mat, cx, cz);
    const x0 = cx - sx / 2, z1 = cz + sz / 2;
    let uv = o.uv;
    if (!uv) { const s = (mat && mat.userData.s) || [4, 4]; uv = [x0 / s[0], -z1 / s[1], (x0 + sx) / s[0], -(z1 - sz) / s[1]]; }
    const rot = o.rot ? { cx, cz, c: Math.cos(o.rot), s: Math.sin(o.rot) } : null;
    this.face(b, x0, y, z1, 1, 0, 0, 0, 0, -1, sx, sz, uv[0], uv[1], uv[2], uv[3], col, rot);
  }

  // 縦の板(看板・窓の光など)。p0 = 左下、向き(nx,nz) は表の向き
  wall(mat, x, y, z, nx, nz, w, h, o = {}) {
    const col = col3(o.col, this._col);
    const b = this.bucket(mat, x, z);
    // 表の向き N に対し 右 = (nz, -nx)(R×上 = N)。中心を (x,z) にする
    const rx = nz, rz = -nx;
    const p0x = x - rx * w / 2, p0z = z - rz * w / 2;
    const uv = o.uv || [0, 0, w / ((mat && mat.userData.s && mat.userData.s[0]) || 4), h / ((mat && mat.userData.s && mat.userData.s[1]) || 4)];
    this.face(b, p0x, y, p0z, rx, 0, rz, 0, 1, 0, w, h, uv[0], uv[1], uv[2], uv[3], col, null);
  }

  // three.js のジオメトリを、行列 m で動かして足す
  geom(mat, g, m, o = {}) {
    const col = col3(o.col, this._col);
    const b = this.bucket(mat, o.bx ?? m.elements[12], o.bz ?? m.elements[14]);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    _m3.getNormalMatrix(m);
    const base = b.v;
    for (let k = 0; k < P.count; k++) {
      _v.fromBufferAttribute(P, k).applyMatrix4(m);
      b.p.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, k).applyMatrix3(_m3).normalize(); b.n.push(_n.x, _n.y, _n.z); } else b.n.push(0, 1, 0);
      if (U) b.u.push(U.getX(k), U.getY(k)); else b.u.push(0, 0);
      if (C) b.c.push(C.getX(k) * col[0], C.getY(k) * col[1], C.getZ(k) * col[2]); else b.c.push(col[0], col[1], col[2]);
    }
    if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) b.i.push(base + I[k]); }
    else for (let k = 0; k < P.count; k++) b.i.push(base + k);
    b.v += P.count;
  }

  static toGeometry(b) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    g.setIndex(b.v > 65535 ? new THREE.Uint32BufferAttribute(b.i, 1) : new THREE.Uint16BufferAttribute(b.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  // 1 つのジオメトリにする(材質は無視。小道具の形づくり用)
  geometry() {
    const all = new Bucket(null);
    for (const b of this.map.values()) {
      const base = all.v;
      all.p.push(...b.p); all.n.push(...b.n); all.u.push(...b.u); all.c.push(...b.c);
      for (const i of b.i) all.i.push(base + i);
      all.v += b.v;
    }
    return Builder.toGeometry(all);
  }

  // メッシュにして group へ入れる。作ったメッシュの配列を返す
  finish(group, { cast = null, recv = true, order = null } = {}) {
    const out = [];
    for (const b of this.map.values()) {
      if (!b.v) continue;
      const mesh = new THREE.Mesh(Builder.toGeometry(b), b.mat);
      mesh.castShadow = cast != null ? cast : !!b.mat.userData.cast;
      mesh.receiveShadow = recv && !b.mat.transparent;
      if (b.mat.transparent) mesh.renderOrder = order ?? 1;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh); out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}

// 小道具の形を作る: fn(builder) で箱などを積んで、1 つのジオメトリにする
export function makeGeo(fn) {
  const b = new Builder(0);
  fn(b);
  return b.geometry();
}

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _mm = new THREE.Matrix4();

export class Instancer {
  constructor(chunk = 80, half = 400) { this.chunk = chunk; this.half = half; this.kinds = new Map(); this.thin = 1; }

  define(name, geo, mat, { cast = true, recv = true, decor = false } = {}) {
    this.kinds.set(name, { geo, mat, cast, recv, decor, chunks: new Map(), n: 0 });
  }

  // 置く: 位置・Y 回転・大きさ(数 or [x,y,z])・色。o.rx/o.rz で傾き
  add(name, x, y, z, rotY = 0, scale = 1, color = null, o = null) {
    const k = this.kinds.get(name);
    k.n++;
    if (k.decor && this.thin < 1 && ((k.n * 2654435761) >>> 0) / 4294967296 > this.thin) return;
    const key = Math.floor((x + this.half) / this.chunk) + '|' + Math.floor((z + this.half) / this.chunk);
    let c = k.chunks.get(key);
    if (!c) { c = { m: [], c: [], hasCol: false }; k.chunks.set(key, c); }
    _e.set(o?.rx || 0, rotY, o?.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
    _mm.compose(_p.set(x, y, z), _q, _s);
    c.m.push(..._mm.elements);
    if (color != null) { c.hasCol = true; const cc = col3(color, [1, 1, 1]); c.c.push(cc[0], cc[1], cc[2]); } else c.c.push(1, 1, 1);
  }

  finish(group) {
    const out = [];
    for (const k of this.kinds.values()) {
      for (const c of k.chunks.values()) {
        const n = c.m.length / 16;
        const mesh = new THREE.InstancedMesh(k.geo, k.mat, n);
        mesh.instanceMatrix.array.set(c.m);
        if (c.hasCol) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c.c), 3);
        mesh.castShadow = k.cast; mesh.receiveShadow = k.recv;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        mesh.computeBoundingSphere();
        if (k.mat.transparent) mesh.renderOrder = 2;
        group.add(mesh); out.push(mesh);
      }
    }
    return out;
  }
}
