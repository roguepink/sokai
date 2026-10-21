// 武器係: 第2弾の 飛んでいく物 — 丸ノコ(壁ではね返る)・爆発ボウガンの矢(刺さって爆発)・戦車砲の弾・
// 空爆の爆弾・隕石・酸のかたまり・手裏剣(追いかける)・竜巻(吸いこんで 空へ放り投げる)。
// 入れ物は weapon-proj.js の Proj と共通(Proj.spawn で作り、ここで動かす)。見た目は InstancedMesh + 光の粒。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { hurt, explode, LOW } from './weapon-hit.js';

const GRAV = 24;
const rnd = Math.random;
const _tmp = [], _hits = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Euler();
const _fwd = new THREE.Vector3(0, 0, -1), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
let _frame = 0;

function wallDamage(x, z, r, amount, cause) { if (World.damage) World.damage(x, z, r, amount, { cause }); }

// 移動(壁で止まる)。壁に当たったら 0..1(当たった所)、当たらなければ 1
function move(p, dt) {
  const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
  const t = World.segmentHit(p.x, p.z, nx, nz, p.y + 0.15);
  if (t < 1) {
    const k = Math.max(0, t - 0.02);
    p.x += (nx - p.x) * k; p.z += (nz - p.z) * k; p.y += p.vy * dt * k;
    return t;
  }
  p.dist += Math.hypot(nx - p.x, nz - p.z);
  p.x = nx; p.z = nz; p.y += p.vy * dt;
  return 1;
}

export const P2 = {
  meshes: {}, lifted: [],

  init(scene) {
    const mk = (geo, mat, max) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.visible = false;
      scene.add(m);
      return m;
    };
    const flat = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
    // 丸ノコ(歯つきの円盤。y が上)
    const D = [new THREE.CylinderGeometry(0.38, 0.38, 0.03, 20)];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const t = new THREE.BoxGeometry(0.1, 0.03, 0.07); t.rotateY(-a + 0.5); t.translate(Math.cos(a) * 0.41, 0, Math.sin(a) * 0.41); D.push(t); }
    const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10); D.push(hub);
    this.meshes.disc = mk(flat(D), new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.25, metalness: 0.95, emissive: 0x202830 }), 80);
    // 矢(-z が前)
    const shaft = new THREE.BoxGeometry(0.04, 0.04, 0.9);
    const head = new THREE.ConeGeometry(0.06, 0.18, 6); head.rotateX(-Math.PI / 2); head.translate(0, 0, -0.52);
    const f1 = new THREE.BoxGeometry(0.16, 0.01, 0.16); f1.translate(0, 0, 0.38);
    const f2 = new THREE.BoxGeometry(0.01, 0.16, 0.16); f2.translate(0, 0, 0.38);
    const charge = new THREE.CylinderGeometry(0.06, 0.06, 0.16, 8); charge.rotateX(Math.PI / 2); charge.translate(0, 0, -0.32);
    this.meshes.bolt = mk(flat([shaft, head, f1, f2, charge]), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.5, metalness: 0.4, emissive: 0x401008 }), 100);
    // 手裏剣(4 つの刃。y が上)
    const S = [];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.ConeGeometry(0.1, 0.42, 4); b.rotateZ(-Math.PI / 2); b.scale(1, 0.12, 1); b.translate(0.24, 0, 0); b.rotateY(i * Math.PI / 2); S.push(b);
    }
    S.push(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10));
    this.meshes.star = mk(flat(S), new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.2, metalness: 1, emissive: 0x18202a }), 140);
    // 隕石(ごつごつの岩。中が赤く光る)
    this.meshes.rock = mk(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9, metalness: 0.1, emissive: 0x6a1a04, flatShading: true }), 40);
    // 爆弾・砲弾(-z が前)
    const bb = new THREE.CylinderGeometry(0.18, 0.18, 0.8, 10); bb.rotateX(Math.PI / 2);
    const bn = new THREE.SphereGeometry(0.18, 10, 6); bn.translate(0, 0, -0.4);
    const bt = new THREE.ConeGeometry(0.18, 0.3, 10); bt.rotateX(Math.PI / 2); bt.translate(0, 0, 0.55);
    const bf1 = new THREE.BoxGeometry(0.5, 0.02, 0.18); bf1.translate(0, 0, 0.62);
    const bf2 = new THREE.BoxGeometry(0.02, 0.5, 0.18); bf2.translate(0, 0, 0.62);
    this.meshes.bomb = mk(flat([bb, bn, bt, bf1, bf2]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.5 }), 90);
    this.meshes.bomb.setColorAt(0, _c.set(0x2a2e26));
  },

  reset() {
    for (const k in this.meshes) { this.meshes[k].count = 0; this.meshes[k].visible = false; }
    for (const e of this.lifted) { e.y = 0; e._tl = false; }
    this.lifted.length = 0;
  },

  // 1 つ動かす。消えるなら true
  step(p, dt) {
    switch (p.kind) {
      case 'disc': return this._disc(p, dt);
      case 'bolt': return this._bolt(p, dt);
      case 'shell': return this._shell(p, dt);
      case 'bomb': return this._bomb(p, dt);
      case 'meteor': return this._meteor(p, dt);
      case 'acid': return this._acid(p, dt);
      case 'shuriken': return this._shuriken(p, dt);
      case 'tornado': return this._tornado(p, dt);
    }
    return true;
  },

  // ---------- 丸ノコ: 敵をつらぬき、壁ではね返る ----------
  _disc(p, dt) {
    const w = p.w;
    const ox = p.x, oz = p.z;
    const t = move(p, dt);
    if (t < 1) {
      // はね返る: どちらの向きで ぶつかったかを調べて 速さを反転
      const hx = World.segmentHit(ox, oz, ox + p.vx * dt * 1.5, oz, p.y + 0.15) < 1;
      const hz = World.segmentHit(ox, oz, ox, oz + p.vz * dt * 1.5, p.y + 0.15) < 1;
      if (hx) p.vx = -p.vx;
      if (hz) p.vz = -p.vz;
      if (!hx && !hz) { p.vx = -p.vx; p.vz = -p.vz; }
      p.n++;
      const sp = p.spd || 1;
      for (let k = 0; k < FX.q(10); k++) FX.spark(p.x, p.y, p.z, p.vx / sp * 6 + (rnd() - 0.5) * 8, rnd() * 5, p.vz / sp * 6 + (rnd() - 0.5) * 8, 0.3, 0.04, 0xfff0c0, 7, 0xff8020, 2);
      FX.glow(p.x, p.y, p.z, 0.4, 0xffe0a0, 4, 2);
      wallDamage(p.x, p.z, 0.6, w.dmg, 'saw');
      Events.emit('weaponSfx', { name: 'ricochet', x: p.x, z: p.z });
      if (p.n > w.bounces) return true;
    }
    // 敵: 当たったら ずっと切り続ける(同じ敵は 0.2 秒ごと)
    Zombies.queryCircle(p.x, p.z, 0.8, _tmp);
    const sp = p.spd || 1;
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i];
      if (e._dsc === p.stamp && p.age - e._dst < 0.2) continue;
      e._dsc = p.stamp; e._dst = p.age;
      const dx = p.vx / sp, dz = p.vz / sp;
      hurt(e, w.dmg, dx, dz, w.force, 'saw');
      const ey = 1.1 * ((e.def && e.def.scale) || 1);
      FX.blood(e.x, ey, e.z, -dz, dx, 1.1);
      FX.blood(e.x, ey, e.z, dz, -dx, 0.6);
      for (let k = 0; k < 3; k++) FX.spark(e.x, ey, e.z, (rnd() - 0.5) * 8, rnd() * 4, (rnd() - 0.5) * 8, 0.25, 0.04, 0xffe0c0, 5, 0xff6020, 2);
      if (e.boss) { p.vx = -p.vx * 0.9; p.vz = -p.vz * 0.9; p.n++; }
    }
    if (p.age > 3.2 || p.dist > w.range * 1.6) {
      for (let k = 0; k < 6; k++) FX.spark(p.x, p.y, p.z, (rnd() - 0.5) * 6, rnd() * 4, (rnd() - 0.5) * 6, 0.3, 0.04, 0xe0f0ff, 5, 0x6080ff, 2);
      return true;
    }
    if (rnd() < 0.5) FX.spark(p.x, p.y, p.z, -p.vx * 0.05 + (rnd() - 0.5), 0.5, -p.vz * 0.05 + (rnd() - 0.5), 0.15, 0.08, w.fever ? 0xffd040 : 0xd8ecff, 3, 0x4060ff, 1, 0, 0, 2, 0);
    return false;
  },

  // ---------- 爆発ボウガン: 刺さって、少しして爆発 ----------
  _bolt(p, dt) {
    const w = p.w;
    if (p.state === 0) {
      p.vy -= 3 * dt;
      const sp = Math.hypot(p.vx, p.vz) || 1, step = sp * dt;
      Zombies.raycast(p.x, p.z, p.vx / sp, p.vz / sp, step + 0.4, _hits);
      let hit = null;
      for (let k = 0; k < _hits.length; k++) if (_hits[k].e.alive) { hit = _hits[k].e; break; }
      _hits.length = 0;
      if (hit && p.y < 2.4 * ((hit.def && hit.def.scale) || 1)) {
        hurt(hit, w.dmg, p.vx / sp, p.vz / sp, 6, 'crossbow');
        hit.stun = Math.max(hit.stun || 0, 0.8);
        p.state = 1; p.target = hit; p.fuse = p.age + w.fuse;
        p.oy = Math.max(0.6, Math.min(1.6, p.y)) * 1;
        FX.blood(hit.x, p.oy, hit.z, p.vx / sp, p.vz / sp, 0.8);
        Events.emit('weaponSfx', { name: 'pin', x: hit.x, z: hit.z });
        return false;
      }
      const t = move(p, dt);
      if (t < 1 || p.y < 0.1) {
        p.state = 2; p.fuse = p.age + w.fuse; if (p.y < 0.1) p.y = 0.1;
        FX.impact(p.x, p.y, p.z, p.vx / sp, p.vz / sp, 0xffc070);
        Events.emit('weaponSfx', { name: 'pin', x: p.x, z: p.z });
        return false;
      }
      if (p.dist > w.range) { p.state = 2; p.fuse = p.age + 0.05; }
      FX.glow(p.x, p.y, p.z, 0.18, 0xff4030, 3);
      return false;
    }
    // 刺さっている: 敵にくっついて動く。ピカピカ速くなる
    const e = p.target;
    if (p.state === 1 && e) { p.x = e.x - p.vx * 0.006; p.z = e.z - p.vz * 0.006; p.y = p.oy + (e.y || 0); if (e.alive) e.stun = Math.max(e.stun || 0, 0.1); }
    const left = p.fuse - p.age;
    const blink = (p.age * (8 + (1 - left / w.fuse) * 30)) % 1 < 0.5;
    FX.glow(p.x, p.y, p.z, blink ? 0.45 : 0.2, 0xff3020, blink ? 6 : 2);
    if (left <= 0) {
      p.target = null;
      explode(p.x, p.z, w.radius, w.blast, w.force, 'fire', w.id);
      return true;
    }
    return false;
  },

  // ---------- 戦車砲: 一直線に 敵を はね飛ばしながら進み、大爆発 ----------
  _shell(p, dt) {
    const w = p.w;
    const sp = Math.hypot(p.vx, p.vz) || 1, step = sp * dt;
    const dx = p.vx / sp, dz = p.vz / sp;
    Zombies.raycast(p.x, p.z, dx, dz, step + 0.5, _hits);
    let boom = false;
    for (let k = 0; k < _hits.length; k++) {
      const e = _hits[k].e;
      if (!e.alive || e._shl === p.stamp) continue;
      e._shl = p.stamp;
      if (e.boss || ++p.n >= w.pierce) { boom = true; p.x = e.x - dx * 0.5; p.z = e.z - dz * 0.5; break; }
      hurt(e, w.hitDmg, dx, dz, w.force, 'cannon');
      FX.blood(e.x, 1.2, e.z, dx, dz, 1.6);
      for (let j = 0; j < 4; j++) FX.spark(e.x, 1.2, e.z, dx * 10 + (rnd() - 0.5) * 8, rnd() * 6, dz * 10 + (rnd() - 0.5) * 8, 0.35, 0.05, 0xffd090, 6, 0xff5010, 2);
    }
    _hits.length = 0;
    if (!boom) {
      const t = move(p, dt);
      boom = t < 1 || p.y < 0.15 || p.dist >= p.ty;
    }
    if (boom) {
      explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id);
      FX.ring(p.x, p.z, 0.5, w.radius * 2.2, 0.7, 0xffd0a0, 0.35, 2, 1, 0);
      FX.debris(p.x, 0.4, p.z, 22, 14, 0x4a4038, 0.22, 2.6);
      FX.decal(p.x, p.z, w.radius * 0.95, 'scorch', 30);
      for (let i = 0; i < FX.q(10); i++) { const a = rnd() * Math.PI * 2; FX.smoke(p.x + Math.cos(a) * 2, 0.5, p.z + Math.sin(a) * 2, 1.2, 2.2 + rnd(), 0x3a3632, Math.cos(a) * 9, 2 + rnd() * 3, Math.sin(a) * 9, 0.6); }
      Engine.shake(1.6); Engine.hitStop(0.06);
      return true;
    }
    FX.glow(p.x, p.y, p.z, 0.6, 0xffb060, 4);
    FX.glow(p.x, p.y, p.z, 0.25, 0xffffff, 4);
    FX.smoke(p.x - dx * 0.6, p.y, p.z - dz * 0.6, 0.35, 1.0 + rnd() * 0.5, 0x9a9590, 0, 0.3, 0, 0.5);
    if (rnd() < 0.5) FX.beam(p.x - dx * 3, p.y, p.z - dz * 3, p.x, p.y, p.z, 0xffc070, 0.12, 0.08, 3);
    return false;
  },

  // ---------- 空爆の爆弾 ----------
  _bomb(p, dt) {
    const w = p.w;
    p.vy -= GRAV * dt;
    p.vx *= Math.exp(-dt * 0.4); p.vz *= Math.exp(-dt * 0.4);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y <= 0.3 || (p.y < 3 && World.blockedAt && World.blockedAt(p.x, p.z, 0.2) && p.y < 2.5)) {
      explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id);
      FX.debris(p.x, 0.4, p.z, 8, 11, 0x4a4038, 0.2, 2);
      return true;
    }
    if (rnd() < 0.5) FX.smoke(p.x, p.y + 0.5, p.z, 0.2, 0.6, 0xb0b0b0, 0, 0, 0, 0.35);
    FX.glow(p.x, p.y + 0.6, p.z, 0.15, 0xff3020, 3);
    return false;
  },

  // ---------- 隕石 ----------
  _meteor(p, dt) {
    const w = p.w;
    if (p.age < p.tick) return false;   // 少しずつ ずらして落とす(待っている間は見えない)
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = p.ty;
    if (p.y <= 0.4 * s) {
      explode(p.x, p.z, w.radius, w.dmg, w.force, 'meteor', w.id);
      // 燃える地面・岩のかけら・大きな穴
      Zombies.queryCircle(p.x, p.z, w.radius, _tmp);
      for (let i = 0; i < _tmp.length; i++) { const e = _tmp[i]; e.burn = Math.max(e.burn || 0, 3); e.burnDps = Math.max(e.burnDps || 0, 60); }
      _tmp.length = 0;
      FX.debris(p.x, 0.5, p.z, 18, 13, 0x3a2a22, 0.26, 3);
      FX.decal(p.x, p.z, w.radius * 0.9, 'scorch', 30);
      for (let i = 0; i < FX.q(14); i++) { const a = rnd() * Math.PI * 2, r = rnd() * w.radius * 0.6; FX.ember(p.x + Math.cos(a) * r, 0.3, p.z + Math.sin(a) * r, Math.cos(a) * 2, 2 + rnd() * 5, Math.sin(a) * 2, 0.25, 1 + rnd(), 0xffa040, 3); }
      Engine.shake(1.2);
      return true;
    }
    // 火の尾
    const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
    const bx = -p.vx / sp, by = -p.vy / sp, bz = -p.vz / sp;
    FX.glow(p.x, p.y, p.z, 1.6 * s, 0xff8030, 3);
    FX.glow(p.x, p.y, p.z, 0.8 * s, 0xfff0c0, 3);
    for (let k = 0; k < FX.q(3) + 1; k++) FX.flame(p.x + (rnd() - 0.5) * s, p.y + (rnd() - 0.5) * s, p.z + (rnd() - 0.5) * s, bx * 12 + (rnd() - 0.5) * 3, by * 12, bz * 12 + (rnd() - 0.5) * 3, 0.9 * s, 0.4);
    if (rnd() < 0.7) FX.smoke(p.x + bx * 2, p.y + by * 2, p.z + bz * 2, 0.9 * s, 1.8, 0x3a3230, bx * 3, by * 3 + 1, bz * 3, 0.5);
    if (rnd() < 0.6) FX.spark(p.x, p.y, p.z, bx * 15 + (rnd() - 0.5) * 6, by * 15 + rnd() * 3, bz * 15 + (rnd() - 0.5) * 6, 0.5, 0.08, 0xffd080, 6, 0xff4010, 2, 0.04, 6);
    return false;
  },

  // ---------- 酸のかたまり: 当たった所に 酸の水たまり ----------
  _acid(p, dt) {
    const w = p.w;
    p.vy -= GRAV * dt;
    const t = move(p, dt);
    let hit = t < 1 || p.y < 0.12;
    if (!hit && p.age > 0.08 && p.y < 2.2) { Zombies.queryCircle(p.x, p.z, 0.6, _tmp); hit = _tmp.length > 0; _tmp.length = 0; }
    if (hit || p.age > 3) {
      const r = w.radius;
      Zombies.queryCircle(p.x, p.z, r, _tmp);
      for (let i = 0; i < _tmp.length; i++) { const e = _tmp[i]; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; hurt(e, w.dmg, dx / d, dz / d, w.force, 'acid'); }
      _tmp.length = 0;
      if (P2.puddle) P2.puddle(w, p.x, p.z, r);
      for (let k = 0; k < FX.q(16); k++) { const a = rnd() * Math.PI * 2, s = 2 + rnd() * 6; FX.spark(p.x, 0.3, p.z, Math.cos(a) * s, 2 + rnd() * 4, Math.sin(a) * s, 0.4 + rnd() * 0.3, 0.07, 0xc8ff60, 4, 0x40a010, 1.5, 0.02, 14); }
      FX.ring(p.x, p.z, 0.2, r * 1.3, 0.3, 0x8aff3a, 0.4, 2.5, 1, 0);
      FX.smoke(p.x, 0.4, p.z, 0.8, 1.2, 0x6a8a30, 0, 1.2, 0, 0.45);
      wallDamage(p.x, p.z, r * 0.6, w.dmg, 'acid');
      Events.emit('weaponSfx', { name: 'splash', x: p.x, z: p.z });
      return true;
    }
    FX.glow(p.x, p.y, p.z, 0.32, 0x8aff3a, 2.5);
    FX.glow(p.x, p.y, p.z, 0.14, 0xe0ffc0, 3);
    if (rnd() < 0.6) FX.spark(p.x, p.y, p.z, p.vx * 0.1, 0, p.vz * 0.1, 0.35, 0.06, 0xb0ff50, 3, 0x30a010, 1, 0, 14);
    return false;
  },

  // ---------- 手裏剣: 敵を追いかけて、当たったら 次の敵へ ----------
  _shuriken(p, dt) {
    const w = p.w;
    let e = p.target;
    if (e && !e.alive) e = p.target = this._nextStar(p);
    if (e) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 0.01;
      const sp = p.spd, turn = Math.min(1, dt * 9);
      p.vx += (dx / d * sp - p.vx) * turn; p.vz += (dz / d * sp - p.vz) * turn;
      const l = Math.hypot(p.vx, p.vz) || 1; p.vx = p.vx / l * sp; p.vz = p.vz / l * sp;
      p.vy = ((1.0 * ((e.def && e.def.scale) || 1)) - p.y) * 6;
      if (d < 0.55 + e.r * 0.6) {
        e._shk = p.stamp;
        hurt(e, w.dmg, dx / d, dz / d, w.force, 'blade', rnd() < 0.25);
        const ey = p.y;
        FX.blood(e.x, ey, e.z, dx / d, dz / d, 0.9);
        for (let k = 0; k < 4; k++) FX.spark(e.x, ey, e.z, (rnd() - 0.5) * 7, rnd() * 4, (rnd() - 0.5) * 7, 0.22, 0.04, 0xe8f4ff, 6, 0x4080ff, 2);
        if (++p.n >= w.hops) return true;
        p.target = this._nextStar(p);
      }
    }
    const t = move(p, dt);
    if (t < 1) {
      for (let k = 0; k < 6; k++) FX.spark(p.x, p.y, p.z, (rnd() - 0.5) * 8, rnd() * 5, (rnd() - 0.5) * 8, 0.25, 0.04, 0xfff0d0, 6, 0xff8030, 2);
      wallDamage(p.x, p.z, 0.4, w.dmg, 'blade');
      return true;
    }
    if (p.dist > w.range * 1.5 || p.age > 2.5) return true;
    FX.spark(p.x, p.y, p.z, 0, 0, 0, 0.12, 0.13, w.fever ? 0xffd040 : 0x9ad8ff, 2.2, 0x3060ff, 0.5, 0, 0, 0, 0);
    return false;
  },
  _nextStar(p) {
    Zombies.queryCircle(p.x, p.z, 11, _tmp);
    let best = null, bd = 1e9;
    for (let i = 0; i < _tmp.length; i++) {
      const o = _tmp[i];
      if (o._shk === p.stamp || o._sht === p.stamp) continue;
      const d2 = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
      if (d2 < bd && World.segmentHit(p.x, p.z, o.x, o.z, LOW) >= 0.97) { bd = d2; best = o; }
    }
    _tmp.length = 0;
    if (best) best._sht = p.stamp;
    return best;
  },

  // ---------- 竜巻: ゆっくり進み、まわりの敵を吸いこんで 空へ放り投げる ----------
  _tornado(p, dt) {
    const w = p.w;
    const life = w.life;
    if (p.age >= life) return true;
    // 目標(敵のかたまり)へ ふらふら進む
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    const sp = d > 1 ? 7 : 2;
    const wob = Math.sin(p.age * 2.3 + p.seed) * 3;
    p.vx = d > 0.01 ? dx / d * sp - dz / (d || 1) * wob : wob; p.vz = d > 0.01 ? dz / d * sp + dx / (d || 1) * wob : 0; p.vy = 0;
    if (move(p, dt) < 1) { p.tx = p.x - dx; p.tz = p.z - dz; }
    const grow = Math.min(1, p.age * 2) * Math.min(1, (life - p.age) * 1.5);
    const R = w.radius * grow;
    p.tick -= dt;
    const tick = p.tick <= 0;
    if (tick) p.tick = 0.15;
    Zombies.queryCircle(p.x, p.z, R + 2, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i];
      const ex = p.x - e.x, ez = p.z - e.z, ed = Math.hypot(ex, ez) || 0.01;
      if (e.boss) { if (tick && ed < 3) hurt(e, w.dmg, -ex / ed, -ez / ed, 0, 'slam'); continue; }
      const f = 1 - Math.min(1, ed / (R + 2));
      // 吸いこみ + ぐるぐる
      const pull = (6 + 16 * f) * dt, swirl = (10 + 14 * f) * dt;
      e.x += ex / ed * Math.min(pull, Math.max(0, ed - 0.8)) - ez / ed * swirl;
      e.z += ez / ed * Math.min(pull, Math.max(0, ed - 0.8)) + ex / ed * swirl;
      World.collideCircle(e, e.r);
      e.stun = Math.max(e.stun || 0, 0.2);
      // まん中近く: 空へ持ち上げる
      if (ed < 2.6) {
        if (!e._tl) { e._tl = true; e._tvy = 0; this.lifted.push(e); }
        e._tlF = _frame;
        e.y = Math.min(5.5, (e.y || 0) + dt * (4 + rnd() * 3));
        if (tick) {
          // 放り投げる(倒れたら ぐるぐる回って遠くへ)
          const tx = -ez / ed, tz = ex / ed;
          hurt(e, w.dmg * (1 + (e.y || 0) * 0.3), tx * 0.7 - ex / ed * 0.3, tz * 0.7 - ez / ed * 0.3, w.force, 'slam');
        }
      }
    }
    _tmp.length = 0;
    if (tick) wallDamage(p.x, p.z, R * 0.4, w.dmg, 'tornado');
    // 見た目: じょうごの形の輪 + 舞い上がる土ぼこり・がれき
    const H = 9 * grow;
    const col = w.fever ? 0xffd890 : 0xc8d2dc;
    for (let k = 0; k < 7; k++) {
      const h = (k / 6) * H, r = (0.5 + k * 0.62) * grow;
      const lean = Math.sin(p.age * 1.7 + k * 0.5 + p.seed) * k * 0.18;
      FX.ring(p.x + lean, p.z + lean * 0.6, r * 0.6, r, -1, col, 0.28 + k * 0.05, 0.4, 0.5, 0, 0.1 + h);
    }
    FX.ring(p.x, p.z, 0, R, -1, col, 0.6, 0.25, 0.4, 1, 0.08);
    // じょうごの表面を ぐるぐる回る ほこり(横から見ても 竜巻の形に見える)
    const n = FX.q(12) + 2;
    for (let k = 0; k < n; k++) {
      const h = rnd() * H, a = rnd() * Math.PI * 2, r0 = (0.4 + h * 0.42) * (0.8 + rnd() * 0.3);
      const lean = Math.sin(p.age * 1.7 + h * 0.4 + p.seed) * h * 0.12;
      const s = 9 + h * 1.2;
      FX.solidPool.emit(p.x + Math.cos(a) * r0 + lean, h, p.z + Math.sin(a) * r0 + lean * 0.6,
        -Math.sin(a) * s, 2.5 + rnd() * 2, Math.cos(a) * s, 0.35 + rnd() * 0.2, 0.35 + h * 0.06, 0.7 + h * 0.1,
        w.fever ? 0xc0a060 : 0x9a9284, 1, 0x6a645a, 1, 0.6, 0, 0.5, 0, 0, 0);
    }
    if (rnd() < 0.3 * FX.quality) { const a = rnd() * Math.PI * 2; FX.chunks.add(p.x + Math.cos(a) * 2, 0.5, p.z + Math.sin(a) * 2, -Math.sin(a) * 9, 10 + rnd() * 6, Math.cos(a) * 9, 0.12, 0.08, 0.12, 0x5a5048, 1.5); }
    if (rnd() < 0.08) FX.bolt(p.x, H * 0.9, p.z, p.x + (rnd() - 0.5) * 3, H * 0.4, p.z + (rnd() - 0.5) * 3, 0xc8e0ff, 0.06, 0.08, 0.6, 5);
    return false;
  },

  // 毎ステップの最後: 竜巻から外れた敵を 地面に落とす
  post(dt) {
    _frame++;
    const L = this.lifted;
    for (let i = L.length - 1; i >= 0; i--) {
      const e = L[i];
      if (!e.alive) { e._tl = false; L[i] = L[L.length - 1]; L.pop(); continue; }
      if (e._tlF === _frame - 1) continue;          // まだ竜巻の中
      e._tvy -= GRAV * dt;
      e.y = (e.y || 0) + e._tvy * dt;
      if (e.y <= 0) {
        e.y = 0; e._tl = false; e.stun = Math.max(e.stun || 0, 0.6);
        if (e._tvy < -8) { hurt(e, 40 + -e._tvy * 6, 0, 0, 0, 'slam'); FX.smoke(e.x, 0.2, e.z, 0.5, 0.7, 0x6a6052, 0, 0.6, 0, 0.45); }
        L[i] = L[L.length - 1]; L.pop();
      }
    }
  },

  // 見た目をまとめて書く(Proj._draw から呼ぶ)
  draw(live) {
    const M = this.meshes;
    let nd = 0, nb = 0, ns = 0, nr = 0, nm = 0;
    const t = performance.now() * 0.001;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      switch (p.kind) {
        case 'disc':
          if (nd >= 80) break;
          _q.setFromEuler(_e.set(0.08 * Math.sin(p.seed), p.age * 40, 0.08 * Math.cos(p.seed)));
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1)); M.disc.setMatrixAt(nd++, _m); break;
        case 'bolt': {
          if (nb >= 100) break;
          const l = Math.hypot(p.vx, p.vy, p.vz) || 1;
          _d.set(p.vx / l, p.vy / l, p.vz / l); _q.setFromUnitVectors(_fwd, _d);
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1, 1, 1)); M.bolt.setMatrixAt(nb++, _m); break;
        }
        case 'shuriken':
          if (ns >= 140) break;
          _q.setFromEuler(_e.set(0, p.age * 28, 0));
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(1.1, 1.1, 1.1)); M.star.setMatrixAt(ns++, _m); break;
        case 'meteor':
          if (p.age < p.tick || nr >= 40) break;
          _q.setFromEuler(_e.set(p.age * 3 + p.seed, p.age * 2, 0));
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.ty, p.ty * 0.85, p.ty)); M.rock.setMatrixAt(nr++, _m); break;
        case 'bomb': case 'shell': {
          if (nm >= 90) break;
          const l = Math.hypot(p.vx, p.vy, p.vz) || 1;
          _d.set(p.vx / l, p.vy / l, p.vz / l); _q.setFromUnitVectors(_fwd, _d);
          const s = p.kind === 'shell' ? 1.05 : 1.25;
          _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, p.kind === 'shell' ? 0.9 : s));
          M.bomb.setMatrixAt(nm, _m);
          M.bomb.setColorAt(nm, _c.setHex(p.kind === 'shell' ? 0xb08a3a : 0x2a2e26));
          nm++; break;
        }
      }
    }
    const set = (m, n, col) => {
      m.count = n; m.visible = n > 0;
      if (n) { m.instanceMatrix.needsUpdate = true; if (col && m.instanceColor) m.instanceColor.needsUpdate = true; }
    };
    set(M.disc, nd); set(M.bolt, nb); set(M.star, ns); set(M.rock, nr); set(M.bomb, nm, true);
  },
};
