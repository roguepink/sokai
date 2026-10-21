// 武器係: 飛んでいく弾(手榴弾・グレネード・ロケット・ミサイル・プラズマ・ブラックホール)。
// 入れ物は最初に作って使い回す。見た目は InstancedMesh(同じ形をまとめて描く)+ 光の粒。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { hurt, explode, LOW } from './weapon-hit.js';

const MAXP = 420;
export const GRAV = 24;
const rnd = Math.random;
const _tmp = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1), _e = new THREE.Euler();
let _stamp = 1;

export const Proj = {
  live: [],
  _free: [],
  gMesh: null, rMesh: null, holes: [],

  init(scene) {
    for (let i = 0; i < MAXP; i++) this._free.push({});
    const mk = (geo, mat, max) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.castShadow = true;
      scene.add(m);
      return m;
    };
    this.gMesh = mk(new THREE.IcosahedronGeometry(0.13, 1), new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.6, metalness: 0.3 }), 220);
    // ロケット: 胴 + 先 + 羽(先が -z)
    const body = new THREE.CylinderGeometry(0.075, 0.075, 0.5, 8); body.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.075, 0.2, 8); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -0.35);
    const fin1 = new THREE.BoxGeometry(0.28, 0.02, 0.12); fin1.translate(0, 0, 0.22);
    const fin2 = new THREE.BoxGeometry(0.02, 0.28, 0.12); fin2.translate(0, 0, 0.22);
    this.rMesh = mk(mergeGeometries([body, nose, fin1, fin2]), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.4 }), 320);
    this.rMesh.setColorAt(0, new THREE.Color());
    // ブラックホールの黒い玉
    const hg = new THREE.SphereGeometry(1, 20, 14), hm = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (let i = 0; i < 5; i++) { const h = new THREE.Mesh(hg, hm); h.userData.on = false; h.position.y = -60; scene.add(h); this.holes.push(h); }
  },

  reset() {
    while (this.live.length) this._free.push(this.live.pop());
    this.gMesh.count = 0; this.rMesh.count = 0;
    for (const h of this.holes) { h.userData.on = false; h.position.y = -60; }
  },

  count(kind) { let n = 0; for (const p of this.live) if (p.kind === kind) n++; return n; },

  // 新しい弾。px,pz = 撃った人の位置(銃口が壁の向こうに出ないように)
  spawn(kind, w, x, y, z, vx, vy, vz, px, pz) {
    const p = this._free.pop();
    if (!p) return null;
    if (World.segmentHit(px, pz, x, z) < 1) { x = px; z = pz; }
    p.kind = kind; p.w = w; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.age = 0; p.fuse = 9; p.dist = 0; p.state = 0; p.target = null; p.tx = 0; p.tz = 0; p.ty = 1;
    p.stamp = _stamp++; p.seed = rnd() * 100; p.spd = Math.hypot(vx, vz); p.tick = 0; p.hole = null;
    this.live.push(p);
    return p;
  },

  _kill(i) {
    const p = this.live[i];
    if (p.hole) { p.hole.userData.on = false; p.hole.position.y = -60; p.hole = null; }
    p.target = null;
    this.live[i] = this.live[this.live.length - 1];
    this.live.pop();
    this._free.push(p);
  },

  update(dt) {
    const L = this.live;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      let dead = false;
      switch (p.kind) {
        case 'grenade': dead = this._grenade(p, dt, false); break;
        case 'launcher': dead = this._grenade(p, dt, true); break;
        case 'rocket': dead = this._rocket(p, dt); break;
        case 'missile': dead = this._missile(p, dt); break;
        case 'plasma': dead = this._plasma(p, dt); break;
        case 'blackhole': dead = this._hole(p, dt); break;
      }
      if (dead) this._kill(i);
    }
    this._draw();
  },

  // 壁に当たったら、当たった所の手前で止める。当たったら true
  _move(p, dt) {
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const t = World.segmentHit(p.x, p.z, nx, nz, p.y + 0.15);   // 弾より低い物は こえる
    if (t < 1) {
      const k = Math.max(0, t - 0.02);
      p.x += (nx - p.x) * k; p.z += (nz - p.z) * k;
      p.y += p.vy * dt * k;
      return true;
    }
    p.dist += Math.hypot(nx - p.x, nz - p.z);
    p.x = nx; p.z = nz; p.y += p.vy * dt;
    return false;
  },

  _touch(p, r) {
    if (p.y > 2.6) return false;
    return Zombies.queryCircle(p.x, p.z, r, _tmp).length > 0;
  },

  // 手榴弾(はねて、時間で爆発)/ グレネード(当たったら爆発)
  _grenade(p, dt, impact) {
    const w = p.w;
    p.vy -= GRAV * dt;
    const ox = p.x, oz = p.z;
    if (this._move(p, dt)) {
      if (impact) { explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id); return true; }
      // 壁ではね返る
      if (World.segmentHit(ox, oz, ox + p.vx * dt * 1.5, oz) < 1) p.vx = -p.vx * 0.5;
      if (World.segmentHit(ox, oz, ox, oz + p.vz * dt * 1.5) < 1) p.vz = -p.vz * 0.5;
    }
    if (p.y < 0.13) {
      p.y = 0.13;
      if (impact) { explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id); return true; }
      if (p.vy < -2) { p.vy = -p.vy * 0.42; p.vx *= 0.62; p.vz *= 0.62; FX.smoke(p.x, 0.2, p.z, 0.25, 0.5, 0x6b6050, 0, 0.5, 0, 0.4); }
      else { p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; }
    }
    if (impact && this._touch(p, 0.55)) { explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id); return true; }
    if (p.age >= p.fuse) { explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id); return true; }
    if (p.age > 4) return true;
    // 見た目: 赤く点滅 + 火花のすじ
    const blink = (p.age * (impact ? 6 : 10 + p.age * 14)) % 1 < 0.5;
    FX.glow(p.x, p.y + 0.12, p.z, blink ? 0.3 : 0.14, impact ? 0xffa040 : 0xff3020, blink ? 5 : 2);
    if (impact || rnd() < 0.6) FX.spark(p.x, p.y, p.z, -p.vx * 0.05, 0.3, -p.vz * 0.05, 0.2, 0.06, 0xffb060, 4, 0xff4010, 1, 0, 0, 2, 0);
    if (impact && rnd() < 0.5 * FX.quality) FX.smoke(p.x, p.y, p.z, 0.18, 0.6, 0x8a8580, 0, 0.3, 0, 0.35);
    return false;
  },

  // ロケット: だんだん速くなる。煙のすじ
  _rocket(p, dt) {
    const w = p.w;
    p.spd = Math.min(78, p.spd + 120 * dt);
    const wob = Math.sin(p.age * 30 + p.seed) * 0.6;
    const dx = p.tx, dz = p.tz;    // 向き
    p.vx = dx * p.spd - dz * wob; p.vz = dz * p.spd + dx * wob; p.vy = 0;
    const hitWall = this._move(p, dt);
    if (hitWall || this._touch(p, 0.75) || p.dist > w.range) { explode(p.x, p.z, w.radius, w.dmg, w.force, 'fire', w.id); return true; }
    const bx = p.x - dx * 0.4, bz = p.z - dz * 0.4;
    FX.glow(bx, p.y, bz, 0.55, 0xffa040, 5);
    FX.glow(bx, p.y, bz, 0.22, 0xffffff, 4);
    FX.flame(bx, p.y, bz, -dx * 8 + (rnd() - 0.5) * 2, (rnd() - 0.5) * 2, -dz * 8 + (rnd() - 0.5) * 2, 0.16, 0.18);
    FX.smoke(bx, p.y, bz, 0.22, 1.3 + rnd() * 0.6, 0x8a8580, (rnd() - 0.5) * 0.8, 0.4, (rnd() - 0.5) * 0.8, 0.55);
    if (rnd() < 0.5) FX.smoke(bx - dx * 0.3 * p.spd * dt, p.y, bz - dz * 0.3 * p.spd * dt, 0.2, 1.1, 0x9a9590, 0, 0.3, 0, 0.45);
    return false;
  },

  // マイクロミサイル: 一度ひろがってから、敵を追いかける
  _missile(p, dt) {
    const w = p.w;
    let tx = p.tx, tz = p.tz;
    const e = p.target;
    if (e && e.alive) { tx = p.tx = e.x; tz = p.tz = e.z; }
    else if (e) p.target = null;
    const dx = tx - p.x, dz = tz - p.z, dh = Math.hypot(dx, dz) || 0.001;
    const ty = dh > 5 ? 3.2 : 0.8;
    _d.set(dx, ty - p.y, dz).normalize();
    const spd = 22 + Math.min(1, p.age * 1.5) * 26;
    const turn = Math.min(1, (1.5 + p.age * 14) * dt);
    p.vx += (_d.x * spd - p.vx) * turn; p.vy += (_d.y * spd - p.vy) * turn; p.vz += (_d.z * spd - p.vz) * turn;
    const hitWall = this._move(p, dt);
    if (p.y < 0.15 || hitWall || (p.age > 0.18 && this._touch(p, 0.6)) || (dh < 0.9 && p.y < 2) || p.age > 3.2) {
      explode(p.x, p.z, w.radius, w.dmg, w.force, 'small', w.id);
      return true;
    }
    FX.glow(p.x, p.y, p.z, 0.22, 0xffa050, 2.5);
    if (rnd() < 0.55 * FX.quality + 0.2) FX.smoke(p.x, p.y, p.z, 0.14, 0.7 + rnd() * 0.3, 0xa8a4a0, 0, 0.2, 0, 0.5);
    return false;
  },

  // プラズマ: 敵をつらぬいて進み、壁かとどく所で はじける
  _plasma(p, dt) {
    const w = p.w;
    const hitWall = this._move(p, dt);
    Zombies.queryCircle(p.x, p.z, 0.85, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i];
      if (e._pl === p.stamp) continue;
      e._pl = p.stamp;
      const sp = p.spd || 1;
      hurt(e, w.dmg, p.vx / sp, p.vz / sp, w.force, 'plasma');
      for (let k = 0; k < 4; k++) FX.spark(e.x, 1.1, e.z, (rnd() - 0.5) * 8, rnd() * 5, (rnd() - 0.5) * 8, 0.3, 0.07, 0xd0b8ff, 6, 0x6030ff, 2, 0.03, 6, 2, 1);
    }
    if (hitWall || p.dist > w.range) { explode(p.x, p.z, w.radius, w.dmg * 0.8, w.force, 'plasma', w.id); return true; }
    const pulse = 1 + Math.sin(p.age * 40) * 0.12;
    FX.glow(p.x, p.y, p.z, 0.75 * pulse, 0x9060ff, 3.5);
    FX.glow(p.x, p.y, p.z, 0.3, 0xffffff, 4);
    if (rnd() < 0.8) FX.spark(p.x + (rnd() - 0.5) * 0.4, p.y + (rnd() - 0.5) * 0.4, p.z + (rnd() - 0.5) * 0.4, -p.vx * 0.08, 0, -p.vz * 0.08, 0.25, 0.12, 0xb090ff, 4, 0x4020c0, 1, 0, 0, 3, 0);
    return false;
  },

  // ブラックホール: 飛んで止まり、まわりの敵を吸いこんで、最後に はじける
  _hole(p, dt) {
    const w = p.w;
    if (p.state === 0) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      const sp = Math.max(6, Math.min(26, d * 5));
      p.vx = d > 0.01 ? dx / d * sp : 0; p.vz = d > 0.01 ? dz / d * sp : 0; p.vy = 0;
      const hitWall = this._move(p, dt);
      if (d < 0.4 || hitWall || p.age > 1.3) {
        p.state = 1; p.age = 0;
        for (const h of this.holes) if (!h.userData.on) { p.hole = h; h.userData.on = true; break; }
        FX.ring(p.x, p.z, 0.5, 6, 0.35, 0xc080ff, 0.5, 4, 1, 0, 0.15);
        FX.flash(p.x, 3, p.z, 0xa050ff, 60, 18, 0.3);
      }
      FX.glow(p.x, p.y, p.z, 0.6, 0xa060ff, 3);
      return false;
    }
    const R = 12, T = 1.8, a = p.age;
    // 吸いこむ
    Zombies.queryCircle(p.x, p.z, R, _tmp);
    p.tick -= dt;
    const tick = p.tick <= 0;
    if (tick) p.tick = 0.1;
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i];
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 0.001;
      // 壁の向こうの敵は 吸わない(壁をすりぬけるので)。見通しは 0.1 秒ごとに調べる
      if (tick || e._bh !== p.stamp) { e._bh = p.stamp; e._bhOk = d < 1.5 || World.segmentHit(p.x, p.z, e.x, e.z, LOW) >= 0.97; }
      if (!e._bhOk) continue;
      const bm = e.boss ? 0.25 : 1;   // ボスは重いので 少しだけ
      const pull = (8 + 22 * (1 - d / R)) * Math.min(1, a * 3) * dt * bm;
      const sw = 7 * dt * (1 - d / R) * bm;
      if (d > 0.6) { e.x += (dx / d) * Math.min(pull, d - 0.5) - (dz / d) * sw; e.z += (dz / d) * Math.min(pull, d - 0.5) + (dx / d) * sw; World.collideCircle(e, e.r); }
      e.stun = Math.max(e.stun || 0, 0.15);
      if (tick && d < 2.4) hurt(e, 70, -dx / d, -dz / d, 0, 'blackhole');
    }
    // 見た目
    const grow = Math.min(1, a * 4), pulse = 1 + Math.sin(a * 30) * 0.06;
    const r = (0.35 + 0.65 * grow) * pulse * (a > T - 0.15 ? Math.max(0.1, (T - a) / 0.15) : 1);
    if (p.hole) { p.hole.position.set(p.x, 1.5, p.z); p.hole.scale.setScalar(r * 0.9); }
    FX.glow(p.x, 1.5, p.z, r * 1.8, 0x7020ff, 0.8);
    FX.glow(p.x, 1.5, p.z, r * 1.2, 0xd0a0ff, 1.0);
    FX.ring(p.x, p.z, 0, R * (0.5 + 0.08 * Math.sin(a * 6)), -1, 0x7030ff, 0.5, 0.8, 0.5, 0, 0.1);
    FX.ring(p.x, p.z, 0, r * 1.6, -1, 0x9050ff, 0.5, 1.2, 0.8, 1, 0.12);
    const n = FX.q(5);
    for (let k = 0; k < n; k++) {
      const ang = rnd() * Math.PI * 2, rr = 4 + rnd() * 6, life = 0.45 + rnd() * 0.25;
      const sx = p.x + Math.cos(ang) * rr, sz = p.z + Math.sin(ang) * rr, sy = 0.3 + rnd() * 2.6;
      const vx = (p.x - sx) / life, vz = (p.z - sz) / life, vy = (1.5 - sy) / life;
      const tg = rr * 1.2;
      FX.spark(sx, sy, sz, vx - Math.sin(ang) * tg, vy, vz + Math.cos(ang) * tg, life, 0.07, 0xd0a0ff, 3, 0x6020ff, 2, 0.02, 0, 0, 0);
    }
    if (rnd() < 0.3 * FX.quality) FX.smoke(p.x + (rnd() - 0.5) * 8, 0.3, p.z + (rnd() - 0.5) * 8, 0.4, 0.6, 0x30283a, 0, 0.2, 0, 0.4);
    if (a >= T) {
      explode(p.x, p.z, w.radius, w.dmg, w.force, 'void', w.id);
      FX.ring(p.x, p.z, 0.5, w.radius * 1.5, 0.6, 0xc080ff, 0.8, 2, 1, 0);
      Engine.shake(1.3);
      return true;
    }
    return false;
  },

  _draw() {
    let ng = 0, nr = 0;
    const G = this.gMesh, R = this.rMesh;
    for (const p of this.live) {
      if (p.kind === 'grenade' || p.kind === 'launcher') {
        if (ng >= 220) continue;
        _q.setFromEuler(_e.set(p.age * 13 + p.seed, p.age * 7, 0));
        const s = p.kind === 'launcher' ? 0.9 : 1;
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, p.kind === 'launcher' ? 1.3 * s : 1.2, s));
        G.setMatrixAt(ng++, _m);
      } else if (p.kind === 'rocket' || p.kind === 'missile') {
        if (nr >= 320) continue;
        const l = Math.hypot(p.vx, p.vy, p.vz) || 1;
        _d.set(p.vx / l, p.vy / l, p.vz / l);
        _q.setFromUnitVectors(_fwd, _d);
        const s = p.kind === 'missile' ? 0.55 : 1.15;
        _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
        R.setMatrixAt(nr, _m);
        R.setColorAt(nr, p.kind === 'missile' ? _white : _olive);
        nr++;
      }
    }
    G.count = ng; R.count = nr;
    if (ng) G.instanceMatrix.needsUpdate = true;
    if (nr) { R.instanceMatrix.needsUpdate = true; R.instanceColor.needsUpdate = true; }
  },
};

const _white = new THREE.Color(0xdddddd), _olive = new THREE.Color(0x5a6638);
