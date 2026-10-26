// 主人公の大技(視点係): 「ダッシュ」= 一瞬で 10m ほど突進し、通り道のゾンビを左右へ はね飛ばす。
// すばやく 2 回押す(ダッシュ中にもう一度)=「ジャンプ叩きつけ」: 高く跳んで 地面に たたきつけ、まわりを まとめて吹きとばす。
// 光の帯(走った跡)も ここで描く。Player.update から呼ばれる(Player.moves)。
// イベント: dash {x,z,dirX,dirZ} / dashHit {x,z,hits,kills} / slam {x,z,radius,kills} / slamJump {x,z}
import * as THREE from '../vendor/three/build/three.module.min.js';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Zombies } from './zombies.js';
import { FX } from './fx.js';

const M = CONFIG.MOVES;
const _near = [];
const OPT = { dirX: 0, dirZ: 0, force: 0, cause: 'dash', crit: false };
const rnd = Math.random;
const N = 26;                // 光の帯の長さ(点の数)

export const Moves = {
  dashT: 0,                 // ダッシュの残り時間
  dashCool: 0,
  dirX: 0, dirZ: -1,        // ダッシュ・跳ぶ向き
  airT: 0,                  // 空中の残り時間(叩きつけ)
  slamCool: 0,
  landT: 0,                 // 着地の かまえ(見た目)
  y: 0,                     // 主人公の高さ(跳んでいる間)
  vx: 0, vz: 0,
  _tap: 9, _buf: 0, _id: 1, _hits: 0, _kills: 0, _trailT: 0, _dustT: 0,
  get dashing() { return this.dashT > 0; },
  get airborne() { return this.airT > 0; },
  get busy() { return this.dashT > 0 || this.airT > 0; },
  // ダッシュの溜まり具合(0..1。ボタンの見た目用)
  get ready() { return Math.max(0, 1 - this.dashCool / M.DASH_COOL); },

  init(scene) {
    // 光の帯 2 本(肩の高さ = 剣の光 / ひざの高さ)。細い帯なので 画面を ふさがない
    const g = new THREE.BufferGeometry();
    this._tp = new Float32Array(N * 4 * 3);
    this._tc = new Float32Array(N * 4 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this._tp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this._tc, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let s = 0; s < 2; s++) for (let i = 0; i < N - 1; i++) { const a = s * N * 2 + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this._hist = [];
    for (let i = 0; i < N; i++) this._hist.push({ x: 0, y: 0, z: 0, t: -9 });
    this._trail = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this._trail.frustumCulled = false; this._trail.visible = false; this._trail.renderOrder = 5;
    scene.add(this._trail);
    this._time = 0;
  },

  reset() {
    this.dashT = this.dashCool = this.airT = this.slamCool = this.landT = this.y = 0;
    this._tap = 9; this._buf = 0;
    if (this._hist) for (const h of this._hist) h.t = -9;
    if (this._trail) this._trail.visible = false;
    Engine.setRoll(0);
  },

  // mx, mz = スティックの向き(世界の向き。長さ 0..1)
  update(dt, input, P, mx, mz) {
    this._time += dt;
    this.dashCool = Math.max(0, this.dashCool - dt);
    this.slamCool = Math.max(0, this.slamCool - dt);
    this.landT = Math.max(0, this.landT - dt);
    this._tap += dt;
    const press = input.consumeDash ? input.consumeDash() : false;
    const slamKey = input.consumeSlam ? input.consumeSlam() : false;
    if (press) {
      // ダッシュ中か、すぐ前に押していたら = 2 回押し → 叩きつけ
      if ((this.dashT > 0 || this._tap < M.DOUBLE_TAP) && !this.airT) this._slamStart(P, mx, mz);
      else this._buf = 0.25;
      this._tap = 0;
    }
    if (slamKey && !this.airT) this._slamStart(P, mx, mz);
    if (this._buf > 0) { this._buf -= dt; if (this.dashCool <= 0 && !this.busy) { this._buf = 0; this._dashStart(P, mx, mz); } }

    if (this.dashT > 0) this._dash(dt, P);
    else if (this.airT > 0) this._air(dt, P);
    else { this.y = 0; Engine.setRoll(0); }
    this._trailUpdate(dt, P);
  },

  _dir(P, mx, mz) {
    const l = Math.hypot(mx, mz);
    if (l > 0.2) { this.dirX = mx / l; this.dirZ = mz / l; return; }
    const f = Engine.viewMode !== 'top' ? Engine.lookYaw : P.aiming ? Math.atan2(P.aimDir.x, -P.aimDir.z) : P.facing;
    this.dirX = Math.sin(f); this.dirZ = -Math.cos(f);
  },

  // ---------- ダッシュ ----------
  _dashStart(P, mx, mz) {
    this._dir(P, mx, mz);
    this.dashT = M.DASH_TIME; this.dashCool = M.DASH_COOL + M.DASH_TIME;
    this._id++; this._hits = 0; this._kills = 0;
    const px = P.pos.x, pz = P.pos.z;
    // 踏みこみの 土けむり + 青い輪
    if (FX.ring) FX.ring(px, pz, 0.3, 2.6, 0.25, 0x6ac8ff, 0.3, 2.5, 0.8);
    for (let i = 0; i < FX.q(10); i++) {
      const a = rnd() * Math.PI * 2;
      FX.smoke(px + Math.cos(a) * 0.4, 0.25, pz + Math.sin(a) * 0.4, 0.35, 0.6 + rnd() * 0.3, 0x6a6052, -this.dirX * 4 + Math.cos(a) * 2, 0.6, -this.dirZ * 4 + Math.sin(a) * 2, 0.4);
    }
    // カメラ: 横へ走るなら そちらへ かたむける
    const y = Engine.lookYaw, side = this.dirX * Math.cos(y) + this.dirZ * Math.sin(y);
    Engine.setRoll(Engine.viewMode === 'top' ? 0 : -side * 0.07);
    Engine.shake(0.15);
    Events.emit('dash', { x: px, z: pz, dirX: this.dirX, dirZ: this.dirZ });
  },

  _dash(dt, P) {
    const u = 1 - this.dashT / M.DASH_TIME;                   // 0 → 1
    const sp = M.DASH_SPEED * (u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3 * 0.75);
    this.vx = this.dirX * sp; this.vz = this.dirZ * sp;
    this.dashT = Math.max(0, this.dashT - dt);
    this.y = 0;
    // 通り道のゾンビを 左右へ はね飛ばす(1 回のダッシュで 1 体 1 回)
    const px = P.pos.x, pz = P.pos.z;
    Zombies.queryCircle(px + this.dirX * 0.6, pz + this.dirZ * 0.6, M.DASH_R, _near);
    let newHits = 0;
    for (let i = 0; i < _near.length; i++) {
      const e = _near[i];
      if (!e.alive || e._dashId === this._id) continue;
      e._dashId = this._id;
      const dx = e.x - px, dz = e.z - pz;
      const side = Math.sign(dx * -this.dirZ + dz * this.dirX) || (rnd() < 0.5 ? -1 : 1);
      let ox = -this.dirZ * side + this.dirX * 0.65, oz = this.dirX * side + this.dirZ * 0.65;
      const ol = Math.hypot(ox, oz); ox /= ol; oz /= ol;
      OPT.dirX = ox; OPT.dirZ = oz; OPT.force = M.DASH_FORCE * (0.85 + rnd() * 0.3); OPT.cause = 'dash';
      if (Zombies.damage(e, M.DASH_DMG, OPT)) this._kills++;
      this._hits++; newHits++;
      const sx = (e.x + px) / 2, sz = (e.z + pz) / 2;
      for (let k = 0; k < 4; k++) FX.spark(sx, 1.1, sz, ox * 9 + (rnd() - 0.5) * 6, 1 + rnd() * 4, oz * 9 + (rnd() - 0.5) * 6, 0.25, 0.05, 0xd8f4ff, 6, 0x4ab0ff, 2);
      FX.blood(e.x, 1.1, e.z, ox, oz, 0.7);
    }
    _near.length = 0;
    if (newHits) Engine.shake(Math.min(0.5, 0.12 + newHits * 0.05));
    if (newHits >= 3 && this._hits >= 5 && !this._stopped) { this._stopped = true; Engine.hitStop(0.03); }
    // こわせる物(車・ドラム缶 …)も 体当たりで こわす
    if (typeof World.damage === 'function' && ((this._dustT += dt) > 0.05)) { this._dustT = 0; World.damage(px + this.dirX, pz + this.dirZ, 1.6, 300, { cause: 'dash' }); }
    // 足もとの土けむり
    if (rnd() < 0.6) FX.smoke(px - this.dirX * 0.5, 0.2, pz - this.dirZ * 0.5, 0.3, 0.5, 0x6a6052, -this.dirX * 3, 0.8, -this.dirZ * 3, 0.35);
    if (this.dashT <= 0) {
      this._stopped = false;
      Engine.setRoll(0);
      if (this._hits) Events.emit('dashHit', { x: P.pos.x, z: P.pos.z, hits: this._hits, kills: this._kills });
    }
  },

  // ---------- ジャンプ叩きつけ ----------
  _slamStart(P, mx, mz) {
    if (this.slamCool > 0) return;
    if (!this.dashT) this._dir(P, mx, mz);
    this.dashT = 0; this._stopped = false;
    this.airT = M.SLAM_AIR; this.slamCool = M.SLAM_COOL + M.SLAM_AIR;
    this.dashCool = Math.max(this.dashCool, M.SLAM_AIR + 0.15);
    Engine.setRoll(0);
    const px = P.pos.x, pz = P.pos.z;
    if (FX.ring) FX.ring(px, pz, 0.3, 2.2, 0.3, 0xffd28a, 0.3, 2, 0.8);
    Events.emit('slamJump', { x: px, z: pz });
  },

  _air(dt, P) {
    const u = 1 - this.airT / M.SLAM_AIR;                     // 0 → 1
    // 上がる(ゆっくり)→ 落ちる(速く)
    this.y = u < 0.62 ? M.SLAM_H * Math.sin((u / 0.62) * Math.PI / 2) : M.SLAM_H * (1 - ((u - 0.62) / 0.38) ** 2);
    const sp = u < 0.62 ? 9 : 4;
    this.vx = this.dirX * sp; this.vz = this.dirZ * sp;
    this.airT = Math.max(0, this.airT - dt);
    if (this.airT <= 0) this._impact(P);
  },

  _impact(P) {
    this.y = 0; this.landT = 0.42; this.vx = this.vz = 0;
    const x = P.pos.x, z = P.pos.z, R = M.SLAM_R;
    const kills = Zombies.damageCircle(x, z, R, M.SLAM_DMG, { force: M.SLAM_FORCE, cause: 'slam', falloff: true });
    if (typeof World.damage === 'function') World.damage(x, z, R * 0.6, 2500, { cause: 'slam' });
    // 見た目: 衝撃波の輪 2 つ・がれき・土けむりの輪・焦げ跡・光
    if (FX.ring) {
      FX.ring(x, z, 0.5, R * 1.25, 0.45, 0xffd28a, 0.9, 2.6, 1);
      FX.ring(x, z, 0.3, R * 0.8, 0.3, 0x8ad8ff, 0.5, 3, 1, 0.25);
    }
    // がれき: 主人公のまわり 4 か所から(一人称で 目の前を ふさがないように 少なめ・前の方だけ)
    const fps = Engine.viewMode === 'fps';
    for (let j = 0; j < 4; j++) {
      const a = Engine.lookYaw + (j - 1.5) * (fps ? 0.5 : Math.PI / 2), r = fps ? 3.2 : 2.2;
      FX.debris(x + Math.sin(a) * r, 0.3, z - Math.cos(a) * r, FX.q(fps ? 3 : 6), 12, 0x5a5048, 0.18, 2);
    }
    const n = FX.q(26);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2, s = 9 + rnd() * 7;
      FX.smoke(x + Math.cos(a) * 1.2, 0.3, z + Math.sin(a) * 1.2, 0.5, 0.9 + rnd() * 0.5, 0x6f6455, Math.cos(a) * s, 0.4 + rnd(), Math.sin(a) * s, 0.5);
    }
    const g = FX.q(30);
    for (let i = 0; i < g; i++) {
      const a = rnd() * Math.PI * 2, s = 8 + rnd() * 14;
      FX.spark(x, 0.4, z, Math.cos(a) * s, 3 + rnd() * 7, Math.sin(a) * s, 0.4 + rnd() * 0.3, 0.06, 0xffe0a0, 4, 0xff8a30, 2);
    }
    FX.decal(x, z, 4.2, 'scorch', 14);
    FX.flash(x, 2.5, z, 0xffc070, 30, 24, 0.3);
    Engine.shake(1.35);
    Engine.hitStop(0.07);
    Engine.fovKick(12);
    Engine.landDip(0.35);
    Events.emit('slam', { x, z, radius: R, kills });
  },

  // ---------- 光の帯(ダッシュ・ジャンプの跡) ----------
  _trailUpdate(dt, P) {
    if (!this._trail) return;
    const on = this.busy;
    this._trailT += dt;
    if (on && this._trailT > 1 / 60) {
      this._trailT = 0;
      const h = this._hist.pop();
      h.x = P.pos.x; h.y = this.y; h.z = P.pos.z; h.t = this._time;
      this._hist.unshift(h);
    }
    const H = this._hist, now = this._time, tp = this._tp, tc = this._tc;
    let alive = false;
    const BAND = [[1.18, 1.5], [0.42, 0.62]];
    for (let s = 0; s < 2; s++) {
      const [lo0, hi0] = BAND[s], k = s ? 0.55 : 1;
      for (let i = 0; i < N; i++) {
        const h = H[i], age = now - h.t, q = 1 - i / N;
        const a = Math.max(0, 1 - age / 0.28) * q * q * 0.75 * k;
        if (a > 0) alive = true;
        const o = (s * N * 2 + i * 2) * 3, w = (hi0 - lo0) * (0.4 + 0.6 * q) * 0.5, mid = (lo0 + hi0) * 0.5;
        tp[o] = h.x; tp[o + 1] = h.y + mid - w; tp[o + 2] = h.z;
        tp[o + 3] = h.x; tp[o + 4] = h.y + mid + w; tp[o + 5] = h.z;
        tc[o] = 0.25 * a; tc[o + 1] = 0.6 * a; tc[o + 2] = a; tc[o + 3] = 0.45 * a; tc[o + 4] = 0.8 * a; tc[o + 5] = a;
      }
    }
    this._trail.visible = alive && Engine.viewMode !== 'fps';
    if (alive) { this._trail.geometry.attributes.position.needsUpdate = true; this._trail.geometry.attributes.color.needsUpdate = true; }
  },
};
