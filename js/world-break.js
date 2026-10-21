// マップ係: こわせる物・爆発する物(車・バス・ドラム缶・プロパン・ガスタンク・給油機・タンクローリー・ガラス・柵・木箱 …)。
//  - 見た目は「種類 × 区画(200m)」ごとの InstancedMesh(1 つずつ消したり 焦がしたりできる)
//  - World.damage(x, z, r, amount, {cause}) で 8m マスの地図から近い物だけ さがす(弾のたびに呼んでも軽い)
//  - 爆発する物は FX.explosion・Zombies.damageCircle を呼び、イベント propExplode {x,z,radius,kind}。となりの物に 少しおくれて 燃え移る(連鎖)
//  - こわれた車は 黒こげの残骸になって燃える(ぶつかり判定は そのまま)。小さい物は消えて、通れるようになる(道さがし地図も直す)
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Events } from './events.js';

const CHUNK = 400, CELL = 8;   // 区画 400m(境目は x,z = ±200。町の中は 1 つにまとまる)
const BURNT = [0.07, 0.06, 0.055];
// 種類ごとの決まり: hp 体力 / ex 爆発(r 半径, d ダメージ)/ end 'burn' 黒こげの残骸 | 'hide' 消える / fx 破片の種類
export const KINDS = {
  sedan: { hp: 220, ex: { r: 6.5, d: 380 }, end: 'burn', fx: 'metal' },
  police: { hp: 240, ex: { r: 6.5, d: 380 }, end: 'burn', fx: 'metal' },
  van: { hp: 300, ex: { r: 7, d: 420 }, end: 'burn', fx: 'metal' },
  bus: { hp: 520, ex: { r: 9, d: 520 }, end: 'burn', fx: 'metal' },
  truck: { hp: 460, ex: { r: 8, d: 480 }, end: 'burn', fx: 'metal' },
  tanker: { hp: 300, ex: { r: 14, d: 900 }, end: 'burn', fx: 'metal', big: true },
  jeep: { hp: 220, ex: { r: 6.5, d: 380 }, end: 'burn', fx: 'metal' },
  tractor: { hp: 260, ex: { r: 6, d: 360 }, end: 'burn', fx: 'metal' },
  forklift: { hp: 180, ex: { r: 4.5, d: 250 }, end: 'burn', fx: 'metal' },
  tank: { hp: 1400, ex: { r: 10, d: 700 }, end: 'burn', fx: 'metal', big: true },
  heli: { hp: 600, ex: { r: 11, d: 650 }, end: 'burn', fx: 'metal', big: true },
  plane: { hp: 2600, ex: { r: 20, d: 1100 }, end: 'burn', fx: 'metal', big: true },
  barrel: { hp: 60, ex: { r: 5.5, d: 320 }, end: 'hide', fx: 'metal' },
  fireBarrel: { hp: 60, ex: { r: 5.5, d: 320 }, end: 'hide', fx: 'metal' },
  propane: { hp: 90, ex: { r: 8, d: 520 }, end: 'hide', fx: 'metal' },
  pump: { hp: 110, ex: { r: 8.5, d: 520 }, end: 'hide', fx: 'metal' },
  bigtank: { hp: 1300, ex: { r: 18, d: 1200 }, end: 'burn', fx: 'metal', big: true, flatten: 0.35 },
  fueltank: { hp: 700, ex: { r: 13, d: 850 }, end: 'burn', fx: 'metal', big: true, flatten: 0.4 },
  crate: { hp: 50, end: 'hide', fx: 'wood' },
  pallet: { hp: 40, end: 'hide', fx: 'wood' },
  ammo: { hp: 60, ex: { r: 6, d: 450 }, end: 'hide', fx: 'wood' },
  barricade: { hp: 70, end: 'hide', fx: 'wood' },
  fence: { hp: 45, end: 'hide', fx: 'wood' },
  cone: { hp: 15, end: 'hide', fx: 'plastic' },
  trashcan: { hp: 40, end: 'hide', fx: 'metal' },
  hydrant: { hp: 80, end: 'hide', fx: 'water' },
  glass: { hp: 12, end: 'hide', fx: 'glass' },
  tent: { hp: 60, end: 'hide', fx: 'cloth' },
  stall: { hp: 120, end: 'hide', fx: 'wood' },
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();

let FX = null, Zombies = null;

export const Brk = {
  W: null, list: [], grid: null, gw: 0, half: 0, _stamp: 0, _seen: null,
  _groups: new Map(), _queue: [], fires: [], fountains: [], _smoke: 0,

  init(W) {
    this.W = W; this.half = W.half;
    this.gw = Math.ceil(W.half * 2 / CELL);
    this.grid = new Map();
    // ほかの係の部品(読みこみの順番の関係で、あとから受けとる)
    import('./fx.js').then((m) => { FX = m.FX; }).catch(() => {});
    import('./zombies.js').then((m) => { Zombies = m.Zombies; }).catch(() => {});
  },

  // 置く(生成中)。parts: [{geo, mat, tint}]。box: ぶつかり判定(なければ null)
  add(kind, parts, x, y, z, rot, s, col, box, o = {}) {
    const def = KINDS[kind];
    const rec = { kind, def, x, y, z, rot, s, col: col ? col.slice() : null, box, hp: def.hp * (o.hpMul || 1), state: 0, inst: [], ex: o.ex || 0, ez: o.ez || 0, h: o.h || 1, sx: o.sx || 1, sy: o.sy || 1, sz: o.sz || 1, stack: o.stack || 1, stackH: o.stackH || 1.2 };
    if (o.wreck) rec.state = 1;
    const key = kind + '|' + (o.variant || '') + '|' + Math.floor((x + this.half) / CHUNK) + '|' + Math.floor((z + this.half) / CHUNK);
    let g = this._groups.get(key);
    if (!g) { g = { parts, recs: [], n: 0 }; this._groups.set(key, g); }
    g.recs.push(rec);
    rec.g = g;
    const id = this.list.push(rec) - 1;
    rec.id = id;
    // 当たり判定のマス(見た目の大きさ)
    const x0 = x - rec.ex, x1 = x + rec.ex, z0 = z - rec.ez, z1 = z + rec.ez;
    rec.minX = x0; rec.maxX = x1; rec.minZ = z0; rec.maxZ = z1;
    for (let gz = this._c(z0); gz <= this._c(z1); gz++) for (let gx = this._c(x0); gx <= this._c(x1); gx++) {
      const k = gz * this.gw + gx; let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(id);
    }
    return rec;
  },
  _c(v) { return Math.max(0, Math.min(this.gw - 1, Math.floor((v + this.half) / CELL))); },

  _matrix(rec, k, out) {
    _e.set(rec.tiltX || 0, rec.rot, rec.tiltZ || 0, 'YXZ'); _q.setFromEuler(_e);
    const f = rec.flat || 1;
    _s.set(rec.s * rec.sx, rec.s * rec.sy * f, rec.s * rec.sz);
    out.compose(_p.set(rec.x, rec.y + (rec.sink || 0) + k * rec.stackH * rec.s, rec.z), _q, _s);
    return out;
  },

  // 生成のおわりに InstancedMesh を作る
  finish(group) {
    for (const g of this._groups.values()) {
      let n = 0; for (const r of g.recs) n += r.stack;
      g.meshes = g.parts.map((p) => {
        const mesh = new THREE.InstancedMesh(p.geo, p.mat, n);
        mesh.name = 'brk:' + g.recs[0].kind;
        mesh.castShadow = !!p.mat.userData.cast && !p.mat.transparent; mesh.receiveShadow = !p.mat.transparent;
        if (p.mat.transparent) mesh.renderOrder = 2;
        mesh.matrixAutoUpdate = false; mesh.updateMatrix();
        if (p.tint) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        group.add(mesh);
        return mesh;
      });
      let i = 0;
      for (const r of g.recs) {
        r.i0 = i;
        if (r.state === 1) { this._burnLook(r, false); if (Math.random() < 0.3) this.fires.push({ x: r.x, y: r.y + r.h * r.s * 0.6, z: r.z, size: 0.8, t: 3, life: 9e9 }); }
        for (let k = 0; k < r.stack; k++, i++) {
          this._matrix(r, k, _m);
          g.meshes.forEach((mesh, pi) => {
            mesh.setMatrixAt(i, _m);
            if (mesh.instanceColor) { const c = r.state === 1 ? BURNT : r.col || [1, 1, 1]; mesh.instanceColor.setXYZ(i, c[0], c[1], c[2]); }
            void pi;
          });
        }
      }
      for (const mesh of g.meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    }
    this._seen = new Uint32Array(this.list.length + 1);
  },

  _write(rec, hide) {
    const g = rec.g;
    for (let k = 0; k < rec.stack; k++) {
      const i = rec.i0 + k;
      if (hide) _m.copy(ZERO); else this._matrix(rec, k, _m);
      for (const mesh of g.meshes) {
        mesh.setMatrixAt(i, _m);
        mesh.instanceMatrix.addUpdateRange(i * 16, 16); mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor && !hide && rec.state === 1) { mesh.instanceColor.setXYZ(i, BURNT[0], BURNT[1], BURNT[2]); mesh.instanceColor.addUpdateRange(i * 3, 3); mesh.instanceColor.needsUpdate = true; }
      }
    }
  },
  _burnLook(rec, random = true) {
    const R = random ? Math.random : () => 0.5;
    rec.tiltX = (R() - 0.5) * 0.08; rec.tiltZ = (R() - 0.5) * 0.1; rec.sink = -0.08;
    if (rec.def.flatten) rec.flat = rec.def.flatten;
    else if (rec.kind !== 'plane' && rec.kind !== 'tank') rec.flat = 0.82;
  },

  // ---------- ダメージ ----------
  // 円(x,z,r)にふれた物に amount のダメージ。こわれた数を返す
  damage(x, z, r, amount, opts = {}) {
    if (!this.grid) return 0;
    const stamp = ++this._stamp, seen = this._seen;
    let broke = 0;
    const gz0 = this._c(z - r), gz1 = this._c(z + r), gx0 = this._c(x - r), gx1 = this._c(x + r);
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const cell = this.grid.get(gz * this.gw + gx);
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k];
        if (seen[id] === stamp) continue; seen[id] = stamp;
        const rec = this.list[id];
        if (rec.state === 2) continue;
        const nx = x < rec.minX ? rec.minX : x > rec.maxX ? rec.maxX : x, nz = z < rec.minZ ? rec.minZ : z > rec.maxZ ? rec.maxZ : z;
        const dx = x - nx, dz = z - nz;
        if (dx * dx + dz * dz > r * r) continue;
        if (this.hit(rec, amount, opts, x, z)) broke++;
      }
    }
    return broke;
  },
  // 線(弾の通り道)で いちばん手前の物を さがして ダメージ。当たった所の割合 0..1(なければ 1)
  hitLine(x0, z0, x1, z1, amount, opts = {}) {
    if (!this.grid) return 1;
    const dx = x1 - x0, dz = z1 - z0, stamp = ++this._stamp, seen = this._seen;
    let best = 1, bestRec = null;
    const gz0 = this._c(Math.min(z0, z1)), gz1 = this._c(Math.max(z0, z1)), gx0 = this._c(Math.min(x0, x1)), gx1 = this._c(Math.max(x0, x1));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const cell = this.grid.get(gz * this.gw + gx);
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k];
        if (seen[id] === stamp) continue; seen[id] = stamp;
        const b = this.list[id];
        if (b.state === 2 || (b.state === 1 && !opts.wrecks)) continue;
        let tmin = 0, tmax = best;
        if (Math.abs(dx) < 1e-9) { if (x0 < b.minX || x0 > b.maxX) continue; }
        else { let a = (b.minX - x0) / dx, c = (b.maxX - x0) / dx; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (Math.abs(dz) < 1e-9) { if (z0 < b.minZ || z0 > b.maxZ) continue; }
        else { let a = (b.minZ - z0) / dz, c = (b.maxZ - z0) / dz; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (tmin < best) { best = tmin; bestRec = b; }
      }
    }
    if (bestRec) this.hit(bestRec, amount, opts, x0 + dx * best, z0 + dz * best);
    return best;
  },

  // 1 つの物に ダメージ。こわれたら true
  hit(rec, amount, opts, hx, hz) {
    if (rec.state !== 0) return false;
    const cause = opts.cause || '';
    let mul = 1;
    if (cause === 'explosion' || cause === 'lightning') mul = rec.def.big ? 1.6 : 2.2;
    else if (cause === 'fire' && rec.def.ex) mul = 2.5;
    else if (cause === 'slam' || cause === 'dash') mul = rec.def.big ? 0.8 : 1.5;
    rec.hp -= amount * mul;
    // 当たった手ごたえ(火花・ガラスのひび)
    if (FX && rec.def.fx === 'metal' && Math.random() < 0.35) FX.burst({ x: hx, y: 0.6 + Math.random() * rec.h * 0.6, z: hz, count: 3, color: 0xffd080, speed: 5, up: 3, life: 0.25, size: 0.06, grav: 14 });
    if (rec.hp > 0) {
      if (rec.def.ex && rec.hp < rec.def.hp * 0.45 && !rec.smoking) { rec.smoking = true; this.fires.push({ rec, x: rec.x, y: rec.y + rec.h * rec.s * 0.9, z: rec.z, size: 0.6, t: 0, life: 9e9, smokeOnly: true }); }
      return false;
    }
    this.destroy(rec, opts, hx, hz);
    return true;
  },

  destroy(rec, opts = {}, hx = rec.x, hz = rec.z) {
    const def = rec.def;
    if (def.end === 'burn') {
      rec.state = 1;
      this._burnLook(rec);
      this._write(rec, false);
      this.addFire(rec.x, rec.y + rec.h * rec.s * (rec.flat || 1) * 0.85, rec.z, def.big ? 2.2 : 1.1, 25 + Math.random() * 25, rec);
    } else {
      rec.state = 2;
      this._write(rec, true);
      if (rec.box) this.W._removeBox(rec.box);
    }
    this._pieces(rec, hx, hz);
    if (def.ex) this.explode(rec.x, rec.z, def.ex.r * (rec.s > 1.2 ? 1.2 : 1), def.ex.d, rec.kind);
    else Events.emit('propBreak', { x: rec.x, z: rec.z, kind: rec.kind, fx: def.fx });
    if (rec.kind === 'hydrant') this.fountains.push({ x: rec.x, z: rec.z, t: 0, life: 10 });
    if (rec.kind === 'fireBarrel' || rec.kind === 'pump' || rec.kind === 'propane') this.addFire(rec.x, rec.y + 0.1, rec.z, 0.9, 12 + Math.random() * 10);
    void opts;
  },

  // 破片(こわれ方の種類ごと)
  _pieces(rec, hx, hz) {
    if (!FX) return;
    const x = rec.x, z = rec.z, y = rec.y + 0.5, f = rec.def.fx;
    if (f === 'glass') {
      FX.burst({ x: hx, y: 1.6, z: hz, count: 26, color: 0xd8f0ff, speed: 6, up: 3, life: 0.9, size: 0.1, grav: 16, spread: 1.2, intensity: 1.4 });
      FX.burst({ x: hx, y: 1.0, z: hz, count: 14, color: 0x9fc4d8, speed: 4, up: 2, life: 1.4, size: 0.14, grav: 18, glow: false });
    } else if (f === 'wood') {
      if (FX.debris) FX.debris(x, y, z, 10, 6, 0x8a6a44, 0.18, 2.5);
      else FX.burst({ x, y, z, count: 14, color: 0x5a4028, speed: 6, up: 4, life: 1, size: 0.2, grav: 14 });
      FX.burst({ x, y, z, count: 8, color: 0x6b5a46, speed: 2, up: 1.5, life: 0.8, size: 0.5, grav: -0.5, glow: false });
    } else if (f === 'water') {
      FX.burst({ x, y: 0.6, z, count: 30, color: 0xcfe4ff, speed: 3, up: 9, life: 1.1, size: 0.15, grav: 12, intensity: 1.1 });
    } else if (f === 'plastic' || f === 'cloth') {
      FX.burst({ x, y, z, count: 8, color: f === 'cloth' ? 0x4a5030 : 0x7a3010, speed: 4, up: 4, life: 0.9, size: 0.18, grav: 12, glow: false });
    } else {
      if (FX.debris) FX.debris(x, y + 0.4, z, rec.def.big ? 18 : 9, rec.def.big ? 12 : 8, 0x2a2826, rec.def.big ? 0.35 : 0.2, 3);
    }
  },

  // 爆発(ゾンビにダメージ・画面ゆれ・焦げあと・まわりの物へ燃え移る)
  explode(x, z, R, dmg, kind = 'prop') {
    if (FX) {
      FX.explosion(x, z, R);
      if (R >= 12) FX.explosion(x + (Math.random() - 0.5) * R * 0.5, z + (Math.random() - 0.5) * R * 0.5, R * 0.6);
      if (FX.decal) FX.decal(x, z, R * 0.9, 'scorch', 40);
      if (FX.flash) FX.flash(x, 2, z, 0xff9040, 260 + R * 30, R * 3.5, 0.35);
    }
    if (Zombies) Zombies.damageCircle(x, z, R * 1.25, dmg, { force: 20 + R * 2.2, cause: 'explosion', falloff: true });
    Engine.shake(Math.min(2, 0.35 + R * 0.075));
    if (R >= 12 && Engine.hitStop) Engine.hitStop(0.06);
    Events.emit('propExplode', { x, z, radius: R, kind });
    // となりへ燃え移る(少しおくれて。つぎつぎに爆発する)
    this._queue.push({ t: 0.12 + Math.random() * 0.18 + (R >= 12 ? 0.25 : 0), x, z, r: R * (R >= 12 ? 1.25 : 0.95), d: dmg * (R >= 12 ? 1 : 0.7) });
  },

  // 雷: 主人公の近くのゾンビ(いなければ近くの地面)に落ちる
  lightningTarget(px, pz) {
    const L = Zombies && Zombies.list;
    if (L && L.length) {
      for (let i = 0; i < 12; i++) { const e = L[Math.floor(Math.random() * L.length)]; if (e.alive && !e.boss && (e.x - px) ** 2 + (e.z - pz) ** 2 < 32 * 32 && (e.x - px) ** 2 + (e.z - pz) ** 2 > 5 * 5) return { x: e.x, z: e.z }; }
    }
    const a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 15;
    return { x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d };
  },
  lightningHit(x, z) {
    if (FX) {
      if (FX.bolt) FX.bolt(x + (Math.random() - 0.5) * 6, 60, z + (Math.random() - 0.5) * 6, x, 0.2, z, 0xbfd8ff, 0.5, 0.3, 2.5, 10);
      FX.explosion(x, z, 3.5, 'plasma');
      if (FX.ring) FX.ring(x, z, 0.5, 9, 0.5, 0xbfd8ff, 0.6, 4);
      if (FX.decal) FX.decal(x, z, 3.5, 'scorch', 30);
      if (FX.flash) FX.flash(x, 3, z, 0xbfd8ff, 500, 30, 0.3);
    }
    if (Zombies) Zombies.damageCircle(x, z, 5, 900, { force: 16, cause: 'lightning', falloff: true });
    this.damage(x, z, 3, 300, { cause: 'lightning' });
    Engine.shake(0.8);
  },

  addFire(x, y, z, size, life, rec = null) {
    if (this.fires.length > 60) this.fires.shift();
    this.fires.push({ x, y, z, size, t: 0, life, rec });
  },

  // 毎フレーム: 連鎖・火・煙・水
  update(dt, px, pz) {
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const q = this._queue[i];
      if ((q.t -= dt) > 0) continue;
      this._queue.splice(i, 1);
      this.damage(q.x, q.z, q.r, q.d, { cause: 'explosion' });
    }
    if (!FX) return;
    this._smoke += dt;
    const puff = this._smoke > 0.18;
    if (puff) this._smoke = 0;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t > f.life || (f.smokeOnly && f.rec && f.rec.state !== 0)) { this.fires.splice(i, 1); continue; }
      const dx = f.x - px, dz = f.z - pz;
      if (dx * dx + dz * dz > 75 * 75) continue;
      const fade = Math.min(1, (f.life - f.t) / 6, f.t * 3);
      if (!f.smokeOnly) {
        if (Math.random() < dt * 30 * f.size) FX.flame(f.x + (Math.random() - 0.5) * f.size * 1.6, f.y, f.z + (Math.random() - 0.5) * f.size * 1.6, (Math.random() - 0.5), 2.2 + Math.random() * 2, (Math.random() - 0.5), 0.5 * f.size * fade + 0.2, 0.55 + Math.random() * 0.3);
        if (Math.random() < dt * 4) FX.ember(f.x, f.y + 0.5, f.z, (Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.08, 1.2);
      }
      if (puff && FX.smoke) FX.smoke(f.x, f.y + 1.2, f.z, 0.7 + f.size * 0.7, 2.6, f.smokeOnly ? 0x555555 : 0x2b2a2a, 0.6, 1.6 + f.size, 0.3, 0.45 * fade);
    }
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const w = this.fountains[i];
      if ((w.t += dt) > w.life) { this.fountains.splice(i, 1); continue; }
      if (Math.random() < dt * 30) FX.burst({ x: w.x, y: 0.5, z: w.z, count: 3, color: 0xcfe4ff, speed: 0.8, up: 11, life: 1.1, size: 0.13, grav: 12, intensity: 0.9 });
    }
  },
};
