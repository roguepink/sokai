// 武器係: 呼び出すもの — 攻撃ドローン(まわりを飛んで勝手に撃つ)・空爆の戦闘機・酸の水たまり。
// どれも決まった数の入れ物を使い回す。見た目は InstancedMesh(まとめて 1 回で描く)+ 光の粒。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { hurt, explode, LOW } from './weapon-hit.js';

const rnd = Math.random;
const MAXD = 8, MAXJ = 3, MAXPUD = 16;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const _list = [], _on = [];

export const Summon = {
  drones: [], jets: [], puddles: [],
  dMesh: null, rMesh: null, jMesh: null,
  _sfxT: 0, _fireW: null, _boost: 0, _bombHook: null,

  init(scene) {
    for (let i = 0; i < MAXD; i++) this.drones.push({ on: false, x: 0, y: -50, z: 0, vx: 0, vz: 0, t: 0, life: 1, cool: 0, ang: 0, w: null, tilt: 0, dive: null, slot: 0 });
    for (let i = 0; i < MAXJ; i++) this.jets.push({ on: false, x: 0, z: 0, y: 13, dx: 0, dz: 1, s: 0, s0: 0, ax: 0, az: 0, marks: [], mi: 0, w: null, boomed: false });
    for (let i = 0; i < MAXPUD; i++) this.puddles.push({ on: false, x: 0, z: 0, r: 2, t: 0, life: 5, dps: 100, tick: 0, w: null });

    const mk = (geo, mat, max) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false; m.castShadow = true;
      scene.add(m);
      return m;
    };
    // ドローン: まん中の箱 + 4 本の腕 + 光る目(向きは -z が前)
    const parts = [new THREE.BoxGeometry(0.34, 0.12, 0.34)];
    for (let i = 0; i < 4; i++) { const a = new THREE.BoxGeometry(0.42, 0.04, 0.05); a.rotateY(Math.PI / 4 + i * Math.PI / 2); a.translate(Math.cos(Math.PI / 4 + i * Math.PI / 2) * 0.2, 0.02, -Math.sin(Math.PI / 4 + i * Math.PI / 2) * 0.2); parts.push(a); }
    const gun = new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6); gun.rotateX(Math.PI / 2); gun.translate(0, -0.08, -0.16); parts.push(gun);
    this.dMesh = mk(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.4, metalness: 0.7 }), MAXD);
    // プロペラ(うすく光る円盤)
    const rot = [];
    for (let i = 0; i < 4; i++) { const r = new THREE.CylinderGeometry(0.16, 0.16, 0.01, 12); const a = Math.PI / 4 + i * Math.PI / 2; r.translate(Math.cos(a) * 0.36, 0.07, -Math.sin(a) * 0.36); rot.push(r); }
    this.rMesh = mk(mergeGeometries(rot), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.35, depthWrite: false }), MAXD);
    this.rMesh.castShadow = false;
    // 戦闘機(-z が前)
    const J = [];
    const body = new THREE.CylinderGeometry(0.55, 0.75, 9, 10); body.rotateX(Math.PI / 2); J.push(body);
    const nose = new THREE.ConeGeometry(0.55, 2.6, 10); nose.rotateX(-Math.PI / 2); nose.translate(0, 0, -5.8); J.push(nose);
    const wing = new THREE.BoxGeometry(11, 0.18, 2.8); wing.translate(0, -0.1, 0.6); J.push(wing);
    const wing2 = new THREE.BoxGeometry(4.4, 0.14, 1.4); wing2.translate(0, 0, 4.0); J.push(wing2);
    const fin = new THREE.BoxGeometry(0.16, 2.2, 1.8); fin.translate(0, 1.1, 3.8); J.push(fin);
    const cock = new THREE.SphereGeometry(0.5, 10, 6); cock.scale(1, 0.7, 2); cock.translate(0, 0.5, -2.8); J.push(cock);
    this.jMesh = mk(mergeGeometries(J.map((g) => g.index ? g.toNonIndexed() : g)), new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.5, metalness: 0.6 }), MAXJ);
  },

  reset() {
    for (const d of this.drones) { d.on = false; d.dive = null; }
    for (const j of this.jets) j.on = false;
    for (const p of this.puddles) p.on = false;
    this.dMesh.count = 0; this.rMesh.count = 0; this.jMesh.count = 0;
  },

  droneCount() { let n = 0; for (const d of this.drones) if (d.on) n++; return n; },

  // ---------- 攻撃ドローン ----------
  // 撃つたびに 1 機ふえる(最大 w.max)。いっぱいなら 全機の時間をのばして「全力モード」
  summonDrone(w, x, y, z) {
    const n = this.droneCount();
    if (n >= w.max) {
      for (const d of this.drones) if (d.on) { d.life = d.t + w.life; d.w = w; }
      this._boost = 1.6;
      return false;
    }
    const d = this.drones.find((o) => !o.on);
    if (!d) return false;
    d.on = true; d.w = w; d.x = x; d.y = y; d.z = z; d.vx = d.vz = 0; d.t = 0; d.life = w.life; d.cool = 0.2 + rnd() * 0.2; d.dive = null;
    d.ang = rnd() * Math.PI * 2; d.slot = n;
    FX.ring(x, z, 0.2, 2.2, 0.35, 0x5affd0, 0.25, 3, 1, 0, y);
    for (let k = 0; k < 10; k++) FX.spark(x, y, z, (rnd() - 0.5) * 6, rnd() * 4, (rnd() - 0.5) * 6, 0.35, 0.05, 0xb0fff0, 5, 0x20c0a0, 2);
    Events.emit('weaponSfx', { name: 'droneUp', x, z });
    return true;
  },

  _drones(dt, player, firingDrone) {
    const on = _on;
    on.length = 0;
    for (const d of this.drones) if (d.on) on.push(d);
    const N = on.length;
    this._boost = Math.max(0, this._boost - dt);
    const t0 = performance.now() * 0.001;
    for (let i = 0; i < N; i++) {
      const d = on[i], w = d.w;
      d.t += dt;
      // 寿命: 最後は いちばん近い敵に つっこんで 爆発(特攻)
      if (d.t >= d.life && !d.dive) {
        const e = Zombies.nearest(d.x, d.z, 25);
        d.dive = e || { x: d.x + (rnd() - 0.5) * 6, z: d.z + (rnd() - 0.5) * 6, alive: false };
        d.diveT = 0;
      }
      if (d.dive) {
        d.diveT += dt;
        const tx = d.dive.x, tz = d.dive.z;
        const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz) || 0.01;
        const sp = 24;
        d.x += dx / dd * Math.min(dd, sp * dt); d.z += dz / dd * Math.min(dd, sp * dt);
        d.y = Math.max(0.3, d.y - dt * 9);
        FX.flame(d.x, d.y, d.z, -dx / dd * 4, 1, -dz / dd * 4, 0.25, 0.25);
        if ((dd < 0.8 && d.y < 1.6) || d.y <= 0.31 || d.diveT > 1.6) {
          explode(d.x, d.z, 4.2, 320, 26, 'small', 'drone');
          d.on = false; d.dive = null;
        }
        continue;
      }
      // 主人公のまわりを回る(ならび方は機数で等分)
      const a = t0 * 1.3 + (i / N) * Math.PI * 2;
      const R = 2.6 + 0.3 * Math.sin(t0 * 2 + i);
      const wx = player.pos.x + Math.cos(a) * R, wz = player.pos.z + Math.sin(a) * R, wy = (player.pos.y || 0) + 2.9 + 0.25 * Math.sin(t0 * 3 + i * 1.7);
      const k = Math.min(1, dt * 5);
      d.vx = (wx - d.x) / Math.max(dt, 1e-3) * k; d.vz = (wz - d.z) / Math.max(dt, 1e-3) * k;
      d.x += (wx - d.x) * k; d.z += (wz - d.z) * k; d.y += (wy - d.y) * k;
      // 撃つ
      d.cool -= dt;
      if (d.cool <= 0) {
        const fever = w.fever ? 1.5 : 1;
        const rate = w.droneRate * (firingDrone ? 1.5 : 1) * (this._boost > 0 ? 1.6 : 1) * fever;
        d.cool += 1 / rate;
        if (d.cool < -0.1) d.cool = 0;
        let e = Zombies.nearest(d.x, d.z, w.range);
        if (e && World.segmentHit(d.x, d.z, e.x, e.z, LOW) < 0.97) e = null;
        if (e) {
          const dx = e.x - d.x, dz = e.z - d.z, dd = Math.hypot(dx, dz) || 1;
          d.tilt = Math.atan2(dx, -dz);
          const ey = 1.1 * ((e.def && e.def.scale) || 1);
          hurt(e, w.dmg * (w.fever ? 1.5 : 1), dx / dd, dz / dd, w.force, 'drone', rnd() < 0.15);
          FX.tracer(d.x, d.y - 0.1, d.z, e.x, ey, e.z, w.fever ? RAINBOW[(i + (this._rb = (this._rb || 0) + 1)) % RAINBOW.length] : 0x7affe0, 0.05, 0.035);
          FX.glow(d.x + dx / dd * 0.25, d.y - 0.1, d.z + dz / dd * 0.25, 0.22, 0xb0fff0, 4, 2);
          FX.blood(e.x, ey, e.z, dx / dd, dz / dd, 0.4);
          if (this._sfxT <= 0) { this._sfxT = 0.07; Events.emit('weaponSfx', { name: 'droneShot', x: d.x, z: d.z }); }
        }
      }
    }
    on.length = 0;
    this._sfxT -= dt;
  },

  // ---------- 空爆 ----------
  // 主人公の後ろから戦闘機が飛んできて、狙った線の上に爆弾を ずらっと落とす
  callJet(w, px, pz, dx, dz, centerDist, bombFn) {
    const j = this.jets.find((o) => !o.on);
    if (!j) return false;
    j.on = true; j.w = w; j.dx = dx; j.dz = dz; j.ax = px; j.az = pz; j.boomed = false;
    j.s = -95; j.y = 13 + rnd() * 2;
    j.marks.length = 0; j.mi = 0;
    const n = w.bombs, gap = 4.4;
    const start = Math.max(6, centerDist - gap * (n - 1) / 2);
    for (let i = 0; i < n; i++) j.marks.push(start + i * gap);
    j.side = (rnd() - 0.5) * 2;
    this._bombHook = bombFn;
    Events.emit('weaponSfx', { name: 'jet', x: px, z: pz });
    return true;
  },

  _jets(dt) {
    const SPD = 78, BV = 30;   // 戦闘機の速さ・爆弾の前への速さ
    for (const j of this.jets) {
      if (!j.on) continue;
      j.s += SPD * dt;
      const sx = -j.dz, sz = j.dx;
      j.x = j.ax + j.dx * j.s + sx * j.side; j.z = j.az + j.dz * j.s + sz * j.side;
      // 爆弾: 地面に落ちるまでに前へ進む分だけ 先に落とす
      const T = Math.sqrt(2 * j.y / 24);
      while (j.mi < j.marks.length && j.s >= j.marks[j.mi] - BV * T) {
        if (this._bombHook) this._bombHook(j.w, j.x, j.y - 0.6, j.z, j.dx * BV, -1, j.dz * BV);
        j.mi++;
      }
      // 真上を通るとき ドーン(画面ゆれ)
      if (!j.boomed && j.s > 0) { j.boomed = true; Engine.shake(0.5); Events.emit('weaponSfx', { name: 'jetPass', x: j.x, z: j.z }); }
      // エンジンの火・飛行機雲
      const bx = j.x - j.dx * 5, bz = j.z - j.dz * 5;
      FX.glow(bx, j.y, bz, 0.9, 0xffa040, 4);
      FX.glow(bx, j.y, bz, 0.4, 0xffffff, 4);
      if (rnd() < 0.7) FX.smoke(bx, j.y, bz, 0.5, 1.6, 0xd8d8d8, -j.dx * 4, 0.2, -j.dz * 4, 0.35);
      FX.glow(j.x + sx * 5.4, j.y - 0.1, j.z + sz * 5.4, 0.18, 0xff3030, 4);
      FX.glow(j.x - sx * 5.4, j.y - 0.1, j.z - sz * 5.4, 0.18, 0x30ff60, 4);
      if (j.s > 140) j.on = false;
    }
  },

  // ---------- 酸の水たまり ----------
  puddle(w, x, z, r) {
    let p = this.puddles.find((o) => !o.on);
    if (!p) { p = this.puddles[0]; for (const o of this.puddles) if (o.t / o.life > p.t / p.life) p = o; }
    p.on = true; p.w = w; p.x = x; p.z = z; p.r = r; p.t = 0; p.life = w.life; p.dps = w.dps; p.tick = 0;
    FX.decals.add(x, z, r * 1.05, 1, 0x3a7a0c, 0.75, w.life + 0.5);
  },

  _puddles(dt) {
    for (const p of this.puddles) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) { p.on = false; continue; }
      const fade = Math.min(1, (p.life - p.t) * 2) * Math.min(1, p.t * 8);
      FX.ring(p.x, p.z, 0, p.r, -1, 0x6aff20, p.r * 0.9, 0.45 * fade, 0.55, 1, 0.07);
      if (rnd() < 0.5 * FX.quality + 0.15) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * p.r;
        FX.spark(p.x + Math.cos(a) * rr, 0.08, p.z + Math.sin(a) * rr, 0, 0.8 + rnd(), 0, 0.5 + rnd() * 0.4, 0.07 + rnd() * 0.06, 0xb0ff60, 2.5, 0x40a010, 1, 0, -1, 1, 0);
      }
      if (rnd() < 0.08 * FX.quality) FX.smoke(p.x + (rnd() - 0.5) * p.r, 0.3, p.z + (rnd() - 0.5) * p.r, 0.4, 1.2, 0x5a7a30, 0, 0.8, 0, 0.3);
      p.tick -= dt;
      if (p.tick > 0) continue;
      p.tick = 0.2;
      Zombies.queryCircle(p.x, p.z, p.r, _list);
      for (let i = 0; i < _list.length; i++) {
        const e = _list[i];
        e.stun = Math.max(e.stun || 0, 0.25);    // 足がとけて 動けない
        hurt(e, p.dps * 0.2 * (e.boss ? 0.6 : 1), 0, 0, 0, 'acid');
        if (rnd() < 0.5) FX.spark(e.x + (rnd() - 0.5) * 0.4, 0.3 + rnd() * 1.2, e.z + (rnd() - 0.5) * 0.4, 0, 1.5, 0, 0.4, 0.08, 0xc0ff60, 3, 0x40a010, 1, 0, -2, 1, 0);
      }
      _list.length = 0;
    }
  },

  update(dt, player, firingDrone) {
    this._drones(dt, player, firingDrone);
    this._jets(dt);
    this._puddles(dt);
    this._draw();
  },

  _draw() {
    let nd = 0;
    const t = performance.now() * 0.001;
    for (const d of this.drones) {
      if (!d.on) continue;
      _q.setFromEuler(_e.set(Math.sin(t * 3 + nd) * 0.12 + Math.min(0.4, Math.hypot(d.vx, d.vz) * 0.03), -d.tilt, Math.cos(t * 2.6 + nd) * 0.1, 'YXZ'));
      _m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(1, 1, 1));
      this.dMesh.setMatrixAt(nd, _m); this.rMesh.setMatrixAt(nd, _m);
      FX.glow(d.x, d.y - 0.02, d.z, 0.12, d.w && d.w.fever ? 0xffd040 : 0x5affd0, 5);
      FX.glow(d.x, d.y + 0.08, d.z, 0.55, 0x5affd0, 0.35);
      nd++;
    }
    this.dMesh.count = nd; this.rMesh.count = nd;
    if (nd) { this.dMesh.instanceMatrix.needsUpdate = true; this.rMesh.instanceMatrix.needsUpdate = true; }
    let nj = 0;
    for (const j of this.jets) {
      if (!j.on) continue;
      _q.setFromEuler(_e.set(0, Math.atan2(-j.dx, -j.dz), j.side * 0.15, 'YXZ'));
      _m.compose(_p.set(j.x, j.y, j.z), _q, _s.set(1, 1, 1));
      this.jMesh.setMatrixAt(nj++, _m);
    }
    this.jMesh.count = nj;
    if (nj) this.jMesh.instanceMatrix.needsUpdate = true;
  },
};

export const RAINBOW = [0xff4040, 0xff9a30, 0xffe040, 0x60ff60, 0x40d0ff, 0x6a70ff, 0xd060ff];
