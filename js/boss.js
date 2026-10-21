// キャラ係: ボス。1 体ずつ専用の形(InstancedMesh ではない)で、ゾンビと同じ list に入る(当たり判定はそのまま使える)。
// 4 種類を順番に出す(出現係):
//   巨人タイラント … 4m の巨人。両こぶしで地面をたたき、衝撃波で まわりのゾンビまで吹きとばす
//   異形アボミネーション … 腕が 6 本・頭が 3 つの肉のかたまり。腕でなぎはらい、体から はうゾンビを産む
//   処刑人ブッチャー … 大なた を持った 大男。ときどき 猛ダッシュで突っこむ
//   大這い屍クローラー … 6m の巨大な はう屍。8 本の手足で走り、飛びかかる
// 倒すと: 大爆発のような血しぶき・体がばらばらに飛ぶ・スロー・大きな画面ゆれ。
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Flow } from './zombie-flow.js';
import { Gore } from './zombie-gore.js';
import { lathe, sstep } from './zombie-models.js';

export const BOSS_TYPES = {
  tyrant:      { boss: true, hp: 2600, speed: 2.7, r: 1.5, points: 1500, scale: 2.2, color: 0x8a6a6a, name: '巨人タイラント', anim: 'boss' },
  abomination: { boss: true, hp: 2200, speed: 3.0, r: 1.8, points: 1500, scale: 2.0, color: 0x7a5a5a, name: '異形アボミネーション', anim: 'boss' },
  butcher:     { boss: true, hp: 2400, speed: 2.5, r: 1.3, points: 1500, scale: 1.7, color: 0x6a4a3a, name: '処刑人ブッチャー', anim: 'boss' },
  crawlerKing: { boss: true, hp: 1900, speed: 5.6, r: 1.6, points: 1500, scale: 2.0, color: 0x9a9080, name: '大這い屍クローラー', anim: 'boss' },
};
export const BOSS_ORDER = ['tyrant', 'butcher', 'abomination', 'crawlerKing'];

const R = (a, b) => a + Math.random() * (b - a);
const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min;

export const Bosses = {
  _scene: null, _Z: null,
  _pool: {},             // 種類ごとに作った形(使い回す)
  _active: [],           // 生きている or 倒れている途中
  _compiled: false, _frames: 0,
  _blasts: [],

  init(scene, Z) {
    this._scene = scene; this._Z = Z;
    for (const t of Object.keys(BOSS_TYPES)) this._pool[t] = [build(t)];
  },

  reset() {
    for (const m of this._active) this._free(m);
    this._active.length = 0;
    this._blasts.length = 0;
  },

  // 最初のフレームで ボスの材質を先に準備しておく(出たときに固まらないように)
  _precompile() {
    this._compiled = true;
    try {
      const g = new THREE.Group();
      for (const t of Object.keys(this._pool)) for (const m of this._pool[t]) { m.root.position.set(0, -50, 0); g.add(m.root); }
      this._scene.add(g);
      Engine.renderer.compile(this._scene, Engine.camera);
      this._scene.remove(g);
      for (const t of Object.keys(this._pool)) for (const m of this._pool[t]) g.remove(m.root);
    } catch (e) { console.warn('boss precompile', e); }
  },

  spawn(e) {
    const type = e.type;
    let m = (this._pool[type] || []).pop();
    if (!m) m = build(type);
    m.e = e; m.dead = false; m.deadT = 0; m.debris.length = 0;
    m.root.position.set(e.x, 0, e.z);
    m.root.rotation.set(0, -e.face, 0);
    m.root.visible = true;
    this._scene.add(m.root);
    e._M = m;
    e.state = 'walk'; e.st = 0; e.cool = 3 + Math.random() * 2; e.ph = 0; e.spd = 0;
    e.vy = 0; e.y = 0; e.spawnT = 0; e.chT = 0;
    this._active.push(m);
    // 登場: 地面から ドン
    Engine.shake(0.8);
    FX.burst({ x: e.x, y: 0.5, z: e.z, count: 40, color: 0x3a3028, speed: 9, up: 5, life: 1, size: 0.25, drag: 2 });
  },

  remove(e) {
    const m = e._M;
    if (!m) return;
    const i = this._active.indexOf(m);
    if (i >= 0) this._active.splice(i, 1);
    this._free(m);
    e._M = null;
  },

  _free(m) {
    // ばらばらにした部位を 元にもどす
    for (const p of m.pieces) {
      const h = p.userData.home;
      if (p.parent !== h.parent) h.parent.add(p);
      p.position.copy(h.pos); p.quaternion.copy(h.quat); p.visible = true;
    }
    m.root.parent && m.root.parent.remove(m.root);
    m.e = null; m.debris.length = 0;
    (this._pool[m.type] || (this._pool[m.type] = [])).push(m);
  },

  hit(e, amount, opts) {
    // 大きいので少しだけ よろける
    if (e.state === 'walk' && amount > 80) e.st = -0.15;
  },

  // ---------- 毎ステップ(生きているボス 1 体ぶん) ----------
  update(dt, e, player) {
    const m = e._M;
    if (!m) return;
    const def = e.def, px = player.pos.x, pz = player.pos.z;
    let dx = px - e.x, dz = pz - e.z;
    const d = Math.hypot(dx, dz) || 0.001;
    e.dist = d;
    e.t += dt;
    if (d > 140) { this._Z._remove(e); return; }
    const frozen = e.frozen > 0;
    const slow = frozen ? 0.25 : e.shock > 0 ? 0.5 : 1;
    // 進む向き(道さがし)
    let mx = dx / d, mz = dz / d;
    if (d > 10 && !Flow.clear(e.x, e.z, px, pz) && Flow.dir(e.x, e.z, _dir)) { mx = _dir.x; mz = _dir.z; }
    e.st += dt * slow;
    e.cool -= dt * slow;
    let sp = def.speed * slow;
    const AI = AIS[e.type];
    sp = AI(this, e, m, dt * slow, d, mx, mz, sp, px, pz);
    // 動く
    if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; const k = Math.exp(-6 * dt); e.kx *= k; e.kz *= k; }
    const kk = 1 - Math.exp(-5 * dt);
    if (sp >= 0) { e.vx += (mx * sp - e.vx) * kk; e.vz += (mz * sp - e.vz) * kk; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.spd = Math.hypot(e.vx, e.vz);
    e.ph += dt * e.spd * (e.type === 'crawlerKing' ? 1.6 : 1.2) * slow;
    // 主人公を押しのけない(主人公が強い): ボスが止まる
    const minD = e.r + player.radius;
    if (d < minD) { e.x = px - dx / d * minD; e.z = pz - dz / d * minD; }
    World.collideCircle(e, e.r * 0.8);
    // 向き
    if (e.state !== 'leap' && e.state !== 'charge') {
      const want = d < 12 ? Math.atan2(dx, -dz) : (e.spd > 0.3 ? Math.atan2(e.vx, -e.vz) : e.face);
      let da = (want - e.face) % (Math.PI * 2);
      if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
      e.face += da * (1 - Math.exp(-3 * dt * slow));
    }
    // 見た目
    m.root.position.set(e.x, e.y || 0, e.z);
    m.root.rotation.y = -e.face;
    if (!frozen) m.anim(m, e, dt * slow);
    this._tint(m, e, dt);
  },

  _tint(m, e, dt) {
    const f = e.flash, fr = e.frozen > 0 ? 1 : 0, burn = e.burn > 0 ? 0.6 + 0.4 * sin(e.t * 20) : 0, sh = e.shock > 0 ? Math.random() : 0;
    for (const mt of m.mats) {
      const b = mt.userData.baseE;
      mt.emissive.setRGB(b.r + f * 0.9 + burn * 0.7 + sh * 0.2 + fr * 0.15, b.g + f * 0.85 + burn * 0.25 + sh * 0.45 + fr * 0.3, b.b + f * 0.8 + sh * 0.8 + fr * 0.5);
      if (mt.userData.baseC) mt.color.copy(mt.userData.baseC).lerp(_ice, fr * 0.6);
    }
  },

  // ---------- 倒れた ----------
  kill(e, opts) {
    const m = e._M;
    if (!m) return;
    m.dead = true; m.deadT = 0;
    const x = e.x, z = e.z, s = e.def.scale;
    let dx = opts.dirX || 0, dz = opts.dirZ || 0;
    if (!dx && !dz) { dx = sin(e.face); dz = -cos(e.face); }
    // 体の部位が はじけ飛ぶ
    m.root.updateMatrixWorld(true);
    for (const p of m.pieces) {
      if (Math.random() < 0.15) continue;
      this._scene.attach(p);
      const a = Math.random() * Math.PI * 2;
      m.debris.push({ o: p, vx: cos(a) * R(4, 12) + dx * 6, vy: R(8, 16), vz: sin(a) * R(4, 12) + dz * 6, wx: R(-8, 8), wy: R(-8, 8), wz: R(-8, 8), rest: false, r: p.userData.rad || 0.4 });
    }
    m.fallAxis = Math.random() < 0.5 ? 1 : -1;
    // 血と肉の大爆発
    for (let i = 0; i < 3; i++) Gore.chunks(x, 1.5 * s * (0.5 + i * 0.4), z, 16, 14, 9, dx * 0.4, dz * 0.4, i === 2 ? 0xd8ccb0 : 0x6a0808, i === 2 ? 1.2 : 2.2);
    FX.burst({ x, y: 2 * s, z, count: 120, color: 0x8a0a0a, speed: 16, up: 9, life: 1.1, size: 0.15, drag: 1.5 });
    FX.burst({ x, y: 2 * s, z, count: 50, color: 0x5a0404, speed: 7, up: 4, life: 1.2, size: 0.17, grav: 2, drag: 2.5 });
    FX.burst({ x, y: 1.5 * s, z, count: 40, color: 0xffd0a0, speed: 20, up: 4, life: 0.35, size: 0.18, grav: 0, drag: 3 });
    Gore.splat(x, z, 7.5, 0, 0, 1, 0x3a0202);
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r = R(3, 8); Gore.splat(x + cos(a) * r, z + sin(a) * r, R(1.5, 3), cos(a), sin(a), 2.2); }
    Engine.slowMo(1.3, 0.25);
    Engine.shake(1.8);
    Engine.hitStop(0.08);
    // 衝撃で まわりのゾンビも ふっとぶ(少しあとで)
    this._blasts.push({ x, z, t: 0.05, r: 10, dmg: 500, force: 26, cause: 'boss' });
  },

  // 倒れているボス・衝撃波の処理(zombies.js の update から毎ステップ)
  step(dt) {
    if (!this._compiled && ++this._frames > 20) this._precompile();
    for (let i = this._blasts.length - 1; i >= 0; i--) {
      const b = this._blasts[i];
      if ((b.t -= dt) > 0) continue;
      this._blasts.splice(i, 1);
      this._Z.damageCircle(b.x, b.z, b.r, b.dmg, { force: b.force, cause: b.cause, falloff: true });
    }
    for (let i = this._active.length - 1; i >= 0; i--) {
      const m = this._active[i];
      if (!m.dead) continue;
      m.deadT += dt;
      // 残った体は くずれ落ちる
      const k = min(1, m.deadT / 0.8), kk = k * k;
      m.root.rotation.x = -m.fallAxis * 0 + kk * 1.45 * (m.type === 'crawlerKing' || m.type === 'abomination' ? 0.2 : 1);
      m.root.rotation.z = kk * 0.3 * m.fallAxis;
      if (m.deadT > 6) m.root.position.y -= dt * 0.5;
      for (const d of m.debris) {
        if (d.rest) continue;
        d.vy -= 22 * dt;
        d.o.position.x += d.vx * dt; d.o.position.y += d.vy * dt; d.o.position.z += d.vz * dt;
        d.o.rotation.x += d.wx * dt; d.o.rotation.y += d.wy * dt; d.o.rotation.z += d.wz * dt;
        if (d.o.position.y < d.r) {
          d.o.position.y = d.r;
          if (d.vy < -3) { d.vy = -d.vy * 0.3; Gore.splat(d.o.position.x, d.o.position.z, R(1, 1.8), d.vx, d.vz, 1.8); }
          else d.vy = 0;
          d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
          if (d.vy === 0 && Math.abs(d.vx) + Math.abs(d.vz) < 0.3) d.rest = true;
        }
        if (Math.random() < dt * 10 && d.vy !== 0) FX.burst({ x: d.o.position.x, y: d.o.position.y, z: d.o.position.z, count: 2, color: 0x7a0606, speed: 1, up: 0.5, life: 0.5, size: 0.10 });
      }
      if (m.deadT > 6) for (const d of m.debris) d.o.position.y -= dt * 0.4;
      if (m.deadT > 8) { this._active.splice(i, 1); this._free(m); }
    }
  },

  draw() {},
};

const _dir = { x: 0, z: 0 };
const _ice = new THREE.Color(0xbfe4ff);

// =====================================================================
// 行動(ボスごと)。戻り値 = 進む速さ(-1 なら 速さは そのまま)
// =====================================================================
const AIS = {
  // 巨人: 近づいたら 両こぶしを振り上げて 地面をたたく
  tyrant(B, e, m, dt, d, mx, mz, sp) {
    if (e.state === 'walk') {
      if (e.cool <= 0 && d < 9) { e.state = 'windup'; e.st = 0; }
      return e.st < 0 ? 0 : sp;
    }
    if (e.state === 'windup') { if (e.st > 0.75) { e.state = 'slam'; e.st = 0; } return 0; }
    if (e.state === 'slam') {
      if (e.st > 0.12 && !e.didSlam) {
        e.didSlam = true;
        const fx = e.x + sin(e.face) * 2.6, fz = e.z - cos(e.face) * 2.6;
        shockwave(B, fx, fz, 8, 'slam');
      }
      if (e.st > 0.9) { e.state = 'walk'; e.st = 0; e.cool = R(3.5, 5); e.didSlam = false; }
      return 0;
    }
    return sp;
  },
  // 処刑人: ときどき 猛ダッシュ / 近くでは 大なたで なぎはらう
  butcher(B, e, m, dt, d, mx, mz, sp) {
    if (e.state === 'walk') {
      if (e.cool <= 0 && d > 6 && d < 30) { e.state = 'aim'; e.st = 0; }
      else if (e.cool <= 0 && d < 4.5) { e.state = 'swing'; e.st = 0; e.didHit = false; }
      return sp;
    }
    if (e.state === 'aim') {
      if (e.st > 0.6) { e.state = 'charge'; e.st = 0; e.cx = mx; e.cz = mz; e.face = Math.atan2(mx, -mz); }
      return 0;
    }
    if (e.state === 'charge') {
      e.vx = e.cx * 15; e.vz = e.cz * 15;
      // 通り道のゾンビをはねとばす
      B._Z.damageCircle(e.x + e.cx * 1.5, e.z + e.cz * 1.5, 1.8, 200, { force: 20, cause: 'boss' });
      if (Math.random() < dt * 30) FX.burst({ x: e.x, y: 0.2, z: e.z, count: 3, color: 0x4a4038, speed: 3, up: 2, life: 0.6, size: 0.3 });
      if (e.st > 1.0 || d < 2.5) { e.state = 'swing'; e.st = 0; e.didHit = false; }
      return -1;
    }
    if (e.state === 'swing') {
      if (e.st > 0.35 && !e.didHit) {
        e.didHit = true;
        const fx = e.x + sin(e.face) * 2.4, fz = e.z - cos(e.face) * 2.4;
        B._Z.damageCircle(fx, fz, 3, 400, { force: 16, cause: 'cleaver' });
        Engine.shake(0.5);
        FX.burst({ x: fx, y: 1, z: fz, count: 20, color: 0xd8d8e0, speed: 8, up: 2, life: 0.25, size: 0.1, grav: 0, drag: 4 });
        if (d < 5) Events.emit('zombieAttack', { x: e.x, z: e.z, boss: true });
      }
      if (e.st > 0.9) { e.state = 'walk'; e.st = 0; e.cool = R(2.5, 4); }
      return 0.4;
    }
    return sp;
  },
  // 異形: 腕でなぎはらい、ときどき 体から はうゾンビを産む
  abomination(B, e, m, dt, d, mx, mz, sp) {
    e.spawnT = (e.spawnT || 0) + dt;
    if (e.spawnT > 7) {
      e.spawnT = 0;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.28;
        const c = B._Z.spawn('crawler', e.x + cos(a) * 2.2, e.z + sin(a) * 2.2);
        if (c) { c.kx = cos(a) * 6; c.kz = sin(a) * 6; }
      }
      FX.burst({ x: e.x, y: 1.5, z: e.z, count: 40, color: 0x7a0808, speed: 8, up: 6, life: 0.8, size: 0.14 });
      Gore.splat(e.x, e.z, 4, 0, 0, 1);
    }
    if (e.state === 'walk') {
      if (e.cool <= 0 && d < 6) { e.state = 'flurry'; e.st = 0; e.hits = 0; }
      return sp;
    }
    if (e.state === 'flurry') {
      const n = Math.floor(e.st / 0.18);
      if (n > e.hits && n <= 6) {
        e.hits = n;
        const a = e.face + (n % 2 ? 0.8 : -0.8) * Math.random();
        B._Z.damageCircle(e.x + sin(a) * 2.6, e.z - cos(a) * 2.6, 2.4, 150, { force: 14, cause: 'boss' });
        if (d < 5) Events.emit('zombieAttack', { x: e.x, z: e.z, boss: true });
        Engine.shake(0.25);
      }
      if (e.st > 1.3) { e.state = 'walk'; e.st = 0; e.cool = R(2, 3.5); }
      return 0.6;
    }
    return sp;
  },
  // 巨大はう屍: 走りまわり、飛びかかる
  crawlerKing(B, e, m, dt, d, mx, mz, sp, px, pz) {
    if (e.state === 'walk') {
      if (e.cool <= 0 && d > 5 && d < 22) {
        e.state = 'leap'; e.st = 0;
        const t = 0.9;
        e.lx = (px - e.x) / t; e.lz = (pz - e.z) / t; e.vy = 11; e.face = Math.atan2(px - e.x, -(pz - e.z));
      }
      // ジグザグに走る
      const zig = sin(e.t * 2.3) * 0.6;
      _dir.x = mx * cos(zig) - mz * sin(zig); _dir.z = mx * sin(zig) + mz * cos(zig);
      e.vx += (_dir.x * sp - e.vx) * 0.05; e.vz += (_dir.z * sp - e.vz) * 0.05;
      return -1;
    }
    if (e.state === 'leap') {
      e.vx = e.lx; e.vz = e.lz;
      e.vy -= 24 * dt; e.y = max(0, (e.y || 0) + e.vy * dt);
      if (e.st > 0.2 && e.y <= 0) {
        e.y = 0; e.state = 'walk'; e.st = 0; e.cool = R(3.5, 5.5);
        shockwave(B, e.x, e.z, 5, 'slam');
        e.vx *= 0.2; e.vz *= 0.2;
      }
      return -1;
    }
    return sp;
  },
};

// 地面をたたく衝撃波: 輪の土ぼこり + 画面ゆれ + まわりのゾンビが吹きとぶ
function shockwave(B, x, z, r, cause) {
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    FX.burst({ x: x + cos(a) * 0.8, y: 0.3, z: z + sin(a) * 0.8, count: 2, color: 0x6a5a48, speed: r * 2.2, up: 2.5, life: 0.7, size: 0.3, dirX: cos(a), dirZ: sin(a), spread: 0.15, grav: 2, drag: 2.5 });
  }
  FX.burst({ x, y: 0.4, z, count: 30, color: 0xffc080, speed: 10, up: 7, life: 0.4, size: 0.16, drag: 2 });
  Engine.shake(1.1);
  Gore.splat(x, z, 3.5, 0, 0, 1, 0x1c1814, 0.7);
  Events.emit('explosion', { x, z, radius: r, source: 'boss' });
  Events.emit('zombieAttack', { x, z, boss: true });
  B._Z.damageCircle(x, z, r, 300, { force: 24, cause, falloff: true });
}

// =====================================================================
// 形(ボスごと)
// =====================================================================
function skinTex(base, opt = {}) {
  const S = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const v = R(-40, 40) | 0;
    c.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 230 : 0},${v > 0 ? 230 : 0},${Math.abs(v) / 400})`;
    c.beginPath(); c.ellipse(R(0, S), R(0, S), R(4, 22), R(3, 16), R(0, 3), 0, 7); c.fill();
  }
  c.strokeStyle = opt.vein || 'rgba(60,30,80,0.45)'; c.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    let x = R(0, S), y = R(0, S); c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += R(-14, 14); y += R(-14, 14); c.lineTo(x, y); }
    c.stroke();
  }
  for (let i = 0; i < (opt.wounds ?? 10); i++) {
    const x = R(0, S), y = R(0, S), w = R(6, 22), h = R(4, 12);
    c.fillStyle = '#3a0404'; c.beginPath(); c.ellipse(x, y, w, h, R(0, 3), 0, 7); c.fill();
    c.fillStyle = '#8a1a14'; c.beginPath(); c.ellipse(x, y, w * 0.6, h * 0.5, R(0, 3), 0, 7); c.fill();
  }
  for (let i = 0; i < (opt.stitches ?? 0); i++) {
    const x = R(20, S - 20), y = R(20, S - 20), L = R(30, 80), a = R(0, 3);
    c.strokeStyle = '#2a1a14'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + cos(a) * L, y + sin(a) * L); c.stroke();
    for (let k = 0; k < L; k += 8) { const sx = x + cos(a) * k, sy = y + sin(a) * k; c.beginPath(); c.moveTo(sx - sin(a) * 5, sy + cos(a) * 5); c.lineTo(sx + sin(a) * 5, sy - cos(a) * 5); c.stroke(); }
  }
  for (let i = 0; i < (opt.boils ?? 0); i++) {
    const x = R(0, S), y = R(0, S), r = R(4, 12);
    c.fillStyle = '#a8a858'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.fillStyle = '#e0e0a0'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); c.fill();
  }
  for (let i = 0; i < 14; i++) {
    const x = R(0, S), y = R(0, S * 0.7);
    c.fillStyle = 'rgba(90,0,0,0.8)'; c.beginPath(); c.ellipse(x, y, R(4, 12), R(4, 10), 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(90,0,0,0.8)'; c.lineWidth = R(2, 4); c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(-3, 3), y + R(15, 50)); c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function newMat(m, opts) {
  const mt = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, opts));
  mt.userData.baseE = mt.emissive.clone();
  mt.userData.baseC = mt.color.clone();
  m.mats.push(mt);
  return mt;
}
function mesh(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z); o.castShadow = shadow;
  parent.add(o);
  return o;
}
function jnt(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
function piece(m, o, rad) { o.userData.home = { parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone() }; o.userData.rad = rad; m.pieces.push(o); return o; }
// 手足(上から下へ L の長さ。r0 → r1 の太さ)
function limbGeo(L, r0, r1, bulge = 1.1, segs = 10) {
  return lathe([[0, -L - r1 * 0.6], [r1, -L], [r0 * bulge * 0.9, -L * 0.45], [r0 * bulge, -L * 0.2], [r0, 0], [r0 * 0.6, r0 * 0.6], [0, r0 * 0.75]], segs);
}
function spike(len, r) { const g = new THREE.ConeGeometry(r, len, 6); g.translate(0, len / 2, 0); return g; }

function build(type) {
  const m = { type, root: new THREE.Group(), mats: [], pieces: [], debris: [], j: {}, e: null, dead: false, deadT: 0, anim: null };
  m.root.name = 'boss-' + type;
  BUILDERS[type](m);
  return m;
}

const BONE = 0xd8cdb0;
const BUILDERS = {
  // ---------------- 巨人タイラント(高さ 約 4.2m) ----------------
  tyrant(m) {
    const skin = newMat(m, { map: skinTex('#9a8a86', { stitches: 6, wounds: 14 }), color: 0xffffff });
    const coat = newMat(m, { map: skinTex('#2a2420', { wounds: 4 }), color: 0xffffff, roughness: 0.9 });
    const bone = newMat(m, { color: BONE, roughness: 0.5 });
    const heart = newMat(m, { color: 0x6a0a0a, emissive: 0xff2010, emissiveIntensity: 1.2, roughness: 0.3 });
    const hips = jnt(m.root, 0, 2.0, 0);
    mesh(hips, lathe([[0, -0.4], [0.4, -0.35], [0.5, -0.1], [0.48, 0.15], [0, 0.2]], 12, (p) => { p.x *= 1.25; p.z *= 0.85; }), coat);
    // コートのすそ(ぼろぼろ)
    mesh(hips, lathe([[0.9, -1.25], [0.75, -0.6], [0.55, -0.1], [0.5, 0.1]], 14, (p) => { if (p.y < -0.9) p.y += sin(Math.atan2(p.x, p.z) * 7) * 0.12; p.z *= 0.9; }), coat, 0, 0, 0, false).material.side = THREE.DoubleSide;
    const torso = jnt(hips, 0, 0.1, 0);
    mesh(torso, lathe([[0.45, 0], [0.5, 0.3], [0.62, 0.7], [0.66, 1.05], [0.5, 1.3], [0.25, 1.42], [0, 1.45]], 14, (p) => {
      p.x *= 1 + 0.6 * sstep(0.4, 1.1, p.y); p.z *= 0.8; if (p.z > 0 && p.y > 0.6) p.z += 0.2 * sstep(0.6, 1.2, p.y);
      if (p.y > 1.1) p.y -= 0.25 * min(1, (p.x / 0.9) ** 2);
    }), skin);
    mesh(torso, new THREE.SphereGeometry(0.2, 12, 10), heart, -0.22, 0.95, -0.45, false);
    for (let i = 0; i < 6; i++) { const s = mesh(torso, spike(R(0.3, 0.7), 0.07), bone, R(-0.5, 0.5), R(0.7, 1.3), 0.5); s.rotation.x = R(0.6, 1.2); s.rotation.z = R(-0.5, 0.5); }
    const head = piece(m, jnt(torso, 0, 1.38, -0.15), 0.3);
    mesh(head, lathe([[0, -0.1], [0.14, -0.05], [0.18, 0.1], [0.2, 0.25], [0.16, 0.4], [0, 0.45]], 12, (p) => { p.x *= 0.95; if (p.z < 0 && p.y < 0.15) p.z *= 1.25; }), skin);
    mesh(head, new THREE.SphereGeometry(0.035, 6, 6), heart, -0.07, 0.24, -0.17, false);
    mesh(head, new THREE.SphereGeometry(0.035, 6, 6), heart, 0.07, 0.24, -0.17, false);
    const armR = piece(m, jnt(torso, 0.85, 1.08, 0), 0.4), armL = piece(m, jnt(torso, -0.85, 1.08, 0), 0.5);
    mesh(armR, limbGeo(0.85, 0.24, 0.2), skin);
    const foreR = jnt(armR, 0, -0.85, 0);
    mesh(foreR, limbGeo(0.8, 0.21, 0.18), skin);
    mesh(foreR, new THREE.SphereGeometry(0.28, 10, 8), skin, 0, -0.95, 0);
    // 左腕: 化けものの腕(太い + 骨のつめ)
    mesh(armL, limbGeo(0.95, 0.34, 0.3, 1.2), skin);
    const foreL = jnt(armL, 0, -0.95, 0);
    mesh(foreL, limbGeo(1.05, 0.36, 0.3, 1.25), skin);
    for (let i = 0; i < 3; i++) { const s = mesh(foreL, spike(0.75, 0.07), bone, (i - 1) * 0.14, -1.2, -0.05); s.rotation.x = Math.PI + 0.25; }
    for (let i = 0; i < 4; i++) { const s = mesh(foreL, spike(0.3, 0.05), bone, 0.3, -0.2 - i * 0.2, 0); s.rotation.z = -1.4; }
    const legL = jnt(hips, -0.3, -0.15, 0), legR = jnt(hips, 0.3, -0.15, 0);
    const knees = [];
    for (const leg of [legL, legR]) {
      mesh(leg, limbGeo(0.9, 0.3, 0.24), coat);
      const kn = jnt(leg, 0, -0.9, 0); knees.push(kn);
      mesh(kn, limbGeo(0.85, 0.24, 0.18), skin);
      mesh(kn, new THREE.BoxGeometry(0.34, 0.2, 0.62), coat, 0, -0.92, -0.12);
    }
    m.j = { hips, torso, head, armL, armR, foreL, foreR, legL, legR, kneeL: knees[0], kneeR: knees[1] };
    m.anim = animHumanoid;
  },

  // ---------------- 処刑人ブッチャー(高さ 約 3.1m) ----------------
  butcher(m) {
    const skin = newMat(m, { map: skinTex('#a08478', { stitches: 4, wounds: 10 }), color: 0xffffff });
    const leather = newMat(m, { map: skinTex('#3a2a20', { wounds: 3 }), color: 0xffffff, roughness: 0.6 });
    const sack = newMat(m, { map: sackTex(), color: 0xffffff, roughness: 1 });
    const steel = newMat(m, { map: steelTex(), color: 0xffffff, metalness: 0.85, roughness: 0.35 });
    const wood = newMat(m, { color: 0x3a2414, roughness: 0.8 });
    const hips = jnt(m.root, 0, 1.45, 0);
    mesh(hips, lathe([[0, -0.35], [0.45, -0.3], [0.55, 0], [0.5, 0.2], [0, 0.25]], 12, (p) => { p.x *= 1.2; }), leather);
    const torso = jnt(hips, 0, 0.12, 0);
    // 大きなおなか
    mesh(torso, lathe([[0.5, 0], [0.68, 0.25], [0.72, 0.5], [0.62, 0.85], [0.5, 1.05], [0.22, 1.18], [0, 1.2]], 14, (p) => {
      p.x *= 1 + 0.25 * sstep(0.5, 1, p.y); if (p.z < 0 && p.y < 0.75) p.z *= 1.25; p.z *= 0.85;
      if (p.y > 0.9) p.y -= 0.18 * min(1, (p.x / 0.6) ** 2);
    }), skin);
    // 前かけ
    const apron = mesh(torso, new THREE.CylinderGeometry(0.78, 0.9, 1.6, 14, 4, true, Math.PI * 0.62, Math.PI * 0.76), leather, 0, -0.1, 0);
    apron.material.side = THREE.DoubleSide;
    const head = piece(m, jnt(torso, 0, 1.12, -0.1), 0.3);
    mesh(head, lathe([[0, -0.08], [0.16, -0.02], [0.2, 0.12], [0.21, 0.28], [0.15, 0.42], [0.04, 0.5], [0, 0.52]], 12, (p) => { if (p.y > 0.42) p.x += sin(p.z * 20) * 0.02; }), sack);
    mesh(head, new THREE.TorusGeometry(0.18, 0.025, 6, 14), wood, 0, 0.0, 0, false).rotation.x = Math.PI / 2;
    const armR = piece(m, jnt(torso, 0.72, 0.92, 0), 0.4), armL = piece(m, jnt(torso, -0.72, 0.92, 0), 0.4);
    const foreArr = [];
    for (const a of [armL, armR]) {
      mesh(a, limbGeo(0.7, 0.22, 0.18), skin);
      const f = jnt(a, 0, -0.7, 0); foreArr.push(f);
      mesh(f, limbGeo(0.65, 0.19, 0.16), skin);
      mesh(f, new THREE.SphereGeometry(0.17, 8, 8), skin, 0, -0.75, 0);
    }
    // 大なた
    const cleaver = jnt(foreArr[1], 0, -0.78, 0);
    mesh(cleaver, new THREE.CylinderGeometry(0.06, 0.07, 0.55, 8), wood, 0, 0, 0).rotation.x = Math.PI / 2;
    const blade = mesh(cleaver, new THREE.BoxGeometry(0.06, 0.62, 1.35), steel, 0, -0.18, -0.92);
    blade.rotation.x = -0.05;
    // かぎ
    const hook = mesh(foreArr[0], new THREE.TorusGeometry(0.22, 0.035, 6, 14, Math.PI * 1.4), steel, 0, -1.0, 0);
    hook.rotation.y = Math.PI / 2;
    const legL = jnt(hips, -0.3, -0.1, 0), legR = jnt(hips, 0.3, -0.1, 0);
    const knees = [];
    for (const leg of [legL, legR]) {
      mesh(leg, limbGeo(0.68, 0.28, 0.22), leather);
      const kn = jnt(leg, 0, -0.68, 0); knees.push(kn);
      mesh(kn, limbGeo(0.62, 0.22, 0.17), leather);
      mesh(kn, new THREE.BoxGeometry(0.3, 0.18, 0.5), leather, 0, -0.68, -0.1);
    }
    m.j = { hips, torso, head, armL, armR, foreL: foreArr[0], foreR: foreArr[1], legL, legR, kneeL: knees[0], kneeR: knees[1], cleaver };
    m.anim = animHumanoid;
  },

  // ---------------- 異形アボミネーション(高さ 約 2.8m、腕 6 本、頭 3 つ) ----------------
  abomination(m) {
    const flesh = newMat(m, { map: skinTex('#a07a70', { boils: 30, wounds: 22, stitches: 3 }), color: 0xffffff, roughness: 0.55 });
    const skin = newMat(m, { map: skinTex('#8a8a78', { wounds: 8 }), color: 0xffffff });
    const bone = newMat(m, { color: BONE, roughness: 0.5 });
    const glow = newMat(m, { color: 0x302010, emissive: 0xffd040, emissiveIntensity: 1.5 });
    const body = jnt(m.root, 0, 1.5, 0);
    const bg = new THREE.SphereGeometry(1.25, 24, 18);
    {
      const pos = bg.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = 1 + 0.16 * sin(v.x * 4.1 + 1) * sin(v.y * 3.3 + 2) * sin(v.z * 3.7) + 0.08 * sin(v.x * 9 + v.z * 7);
        v.multiplyScalar(n); v.y *= 0.85; if (v.z > 0) v.z *= 1.15;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      bg.computeVertexNormals();
    }
    mesh(body, bg, flesh);
    for (let i = 0; i < 9; i++) { const s = mesh(body, spike(R(0.35, 0.8), 0.08), bone, R(-0.8, 0.8), R(0.2, 0.9), R(0.3, 1)); s.lookAt(s.position.clone().multiplyScalar(3)); s.rotateX(Math.PI / 2); }
    // 頭が 3 つ
    const heads = [];
    for (let i = 0; i < 3; i++) {
      const h = piece(m, jnt(body, (i - 1) * 0.55, 0.7 + (i === 1 ? 0.3 : 0), -0.95), 0.25);
      mesh(h, lathe([[0, -0.15], [0.1, -0.1], [0.12, 0.05], [0.15, 0.18], [0.14, 0.3], [0.08, 0.38], [0, 0.4]], 10, (p) => { if (p.z < 0 && p.y < 0.1) p.z *= 1.3; }), skin);
      mesh(h, new THREE.SphereGeometry(0.03, 6, 6), glow, -0.05, 0.2, -0.13, false);
      mesh(h, new THREE.SphereGeometry(0.03, 6, 6), glow, 0.05, 0.2, -0.13, false);
      mesh(h, new THREE.SphereGeometry(0.07, 8, 6), newMat(m, { color: 0x140404 }), 0, 0.03, -0.14, false).scale.set(1, 1.6, 0.6);
      h.rotation.z = (i - 1) * 0.35;
      heads.push(h);
    }
    // 腕 6 本(体のまわりから生えて、地面について歩く)
    const arms = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const base = jnt(body, sin(a) * 0.95, -0.1, -cos(a) * 0.95);
      base.rotation.y = -a;                 // 外向き(base の -z が外)
      const sh = piece(m, jnt(base, 0, 0, 0), 0.3);
      mesh(sh, limbGeo(1.05, 0.17, 0.13), skin);
      const el = jnt(sh, 0, -1.05, 0);
      mesh(el, limbGeo(1.0, 0.14, 0.1), skin);
      mesh(el, new THREE.SphereGeometry(0.14, 8, 6), skin, 0, -1.05, -0.05).scale.set(1, 0.6, 1.5);
      arms.push({ base, sh, el, a });
    }
    m.j = { body, heads, arms };
    m.anim = animAbomination;
  },

  // ---------------- 大這い屍クローラー(長さ 約 6m) ----------------
  crawlerKing(m) {
    const skin = newMat(m, { map: skinTex('#b0a898', { wounds: 16, stitches: 2 }), color: 0xffffff, roughness: 0.6 });
    const bone = newMat(m, { color: BONE, roughness: 0.45 });
    const mouth = newMat(m, { color: 0x200404, roughness: 0.4 });
    const eye = newMat(m, { color: 0x302010, emissive: 0xff3a10, emissiveIntensity: 2 });
    const body = jnt(m.root, 0, 1.1, 0);
    // 長い胴(横たわった回転体)
    const tg = lathe([[0, -2.6], [0.3, -2.4], [0.55, -1.6], [0.62, -0.6], [0.7, 0.4], [0.75, 1.1], [0.55, 1.6], [0, 1.75]], 16, (p) => { p.x *= 1.25; if (p.z > 0) p.z *= 0.8; });
    tg.rotateX(-Math.PI / 2);      // +y → -z(前)
    mesh(body, tg, skin);
    // 背骨のとげ
    for (let i = 0; i < 9; i++) { const s = mesh(body, spike(R(0.3, 0.55), 0.08), bone, 0, 0.6, 2.2 - i * 0.5); s.rotation.x = 0.5; }
    // あばら
    for (let i = 0; i < 6; i++) for (const sg of [-1, 1]) {
      const r = mesh(body, new THREE.TorusGeometry(0.66, 0.035, 5, 10, Math.PI * 0.7), bone, 0, 0.05, 0.4 - i * 0.28, false);
      r.rotation.y = Math.PI / 2; r.rotation.x = sg > 0 ? 0.2 : Math.PI - 0.2;
    }
    const head = piece(m, jnt(body, 0, 0.35, -1.75), 0.4);
    mesh(head, lathe([[0, -0.2], [0.2, -0.15], [0.28, 0.05], [0.3, 0.25], [0.24, 0.42], [0, 0.48]], 12, (p) => { p.z *= 1.25; }), skin);
    const jaw = jnt(head, 0, -0.05, -0.1);
    mesh(jaw, new THREE.BoxGeometry(0.42, 0.1, 0.5), skin, 0, -0.08, -0.22);
    mesh(head, new THREE.SphereGeometry(0.2, 10, 8), mouth, 0, 0.02, -0.3, false).scale.set(1, 0.7, 0.6);
    for (let i = 0; i < 8; i++) { const t = mesh(head, spike(0.1, 0.02), bone, -0.15 + i * 0.043, -0.04, -0.42, false); t.rotation.x = Math.PI; }
    mesh(head, new THREE.SphereGeometry(0.04, 6, 6), eye, -0.11, 0.24, -0.34, false);
    mesh(head, new THREE.SphereGeometry(0.04, 6, 6), eye, 0.11, 0.24, -0.34, false);
    // 足 8 本(左右 4 本ずつ。外へ出て、ひざで下へ折れる)
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const base = jnt(body, side * 0.6, 0, -1.2 + k * 0.9);
      base.rotation.y = side < 0 ? Math.PI : 0;     // base の +x が外向き
      const up = piece(m, jnt(base, 0, 0, 0), 0.25);
      const ug = limbGeo(1.4, 0.14, 0.1); ug.rotateZ(Math.PI / 2);
      mesh(up, ug, skin);
      const kn = jnt(up, 1.4, 0, 0);
      const lg = limbGeo(1.6, 0.11, 0.06); lg.rotateZ(Math.PI / 2);
      mesh(kn, lg, skin);
      const cl = mesh(kn, spike(0.35, 0.05), bone, 1.65, 0, 0); cl.rotation.z = -Math.PI / 2;
      legs.push({ base, up, kn, side, k });
    }
    m.j = { body, head, jaw, legs };
    m.anim = animCrawlerKing;
  },
};

function sackTex() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#8a7a58'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) { c.fillStyle = `rgba(0,0,0,${R(0.05, 0.15)})`; c.fillRect(i, 0, 1, S); c.fillRect(0, i, S, 1); }
  // 目の穴(正面 = u 0.5)
  c.fillStyle = '#100604';
  c.beginPath(); c.ellipse(S * 0.46, S * 0.45, 10, 13, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(S * 0.54, S * 0.45, 10, 13, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,60,20,0.9)';
  c.beginPath(); c.arc(S * 0.46, S * 0.46, 3, 0, 7); c.fill(); c.beginPath(); c.arc(S * 0.54, S * 0.46, 3, 0, 7); c.fill();
  for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(80,0,0,0.75)'; c.beginPath(); c.ellipse(R(0, S), R(S * 0.2, S), R(6, 18), R(6, 18), 0, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function steelTex() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#9aa0a8'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(255,255,255,${R(0.05, 0.2)})`; c.beginPath(); const y = R(0, S); c.moveTo(0, y); c.lineTo(S, y + R(-4, 4)); c.stroke(); }
  for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(90,0,0,0.85)'; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(5, 20), R(4, 12), 0, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// =====================================================================
// 動き
// =====================================================================
function animHumanoid(m, e, dt) {
  const j = m.j, ph = e.ph, s = sin(ph), c = cos(ph), t = e.t;
  const k = min(1, e.spd / (e.def.speed * 0.5));
  // 歩き
  j.legL.rotation.x = s * 0.45 * k; j.legR.rotation.x = -s * 0.45 * k;
  j.kneeL.rotation.x = -(0.1 + 0.6 * max(0, c)) * k; j.kneeR.rotation.x = -(0.1 + 0.6 * max(0, -c)) * k;
  j.hips.position.y = (m.type === 'tyrant' ? 2.0 : 1.45) - 0.12 * Math.abs(s) * k;
  j.hips.rotation.z = 0.06 * s * k;
  j.torso.rotation.set(-0.25, -0.15 * s * k, 0.08 * s * k);
  j.head.rotation.set(0.15 + 0.1 * sin(t * 0.7), 0.3 * sin(t * 0.5), 0.15 * sin(t * 0.6));
  j.armL.rotation.set(-s * 0.3 * k + 0.2, 0, -0.25);
  j.armR.rotation.set(s * 0.3 * k + 0.2, 0, 0.25);
  j.foreL.rotation.x = 0.4; j.foreR.rotation.x = 0.4;
  // 攻撃の動き
  const st = e.st;
  if (e.state === 'windup') {          // 両こぶしを振りあげる
    const a = min(1, st / 0.6);
    j.armL.rotation.set(0.2 + a * 2.7, 0, -0.25 - a * 0.2); j.armR.rotation.set(0.2 + a * 2.7, 0, 0.25 + a * 0.2);
    j.foreL.rotation.x = 0.4 + a * 0.5; j.foreR.rotation.x = 0.4 + a * 0.5;
    j.torso.rotation.x = -0.25 + a * 0.35; j.head.rotation.x = 0.4 * a;
  } else if (e.state === 'slam') {     // たたきつける
    const a = min(1, st / 0.12);
    j.armL.rotation.set(2.9 - a * 2.1, 0, -0.2); j.armR.rotation.set(2.9 - a * 2.1, 0, 0.2);
    j.foreL.rotation.x = 0.2; j.foreR.rotation.x = 0.2;
    j.torso.rotation.x = -0.25 - a * 0.55; j.hips.position.y -= a * 0.35;
    j.kneeL.rotation.x = j.kneeR.rotation.x = -0.6 * a;
  } else if (e.state === 'aim') {      // ためる
    j.torso.rotation.x = -0.5; j.armR.rotation.set(2.4, 0, 0.6); j.foreR.rotation.x = 1.2; j.head.rotation.x = 0.4;
    j.hips.position.y -= 0.15;
  } else if (e.state === 'charge') {   // 走る
    const r = sin(e.t * 16);
    j.torso.rotation.x = -0.6; j.legL.rotation.x = r * 0.9; j.legR.rotation.x = -r * 0.9;
    j.kneeL.rotation.x = -0.4 - 0.8 * max(0, cos(e.t * 16)); j.kneeR.rotation.x = -0.4 - 0.8 * max(0, -cos(e.t * 16));
    j.armR.rotation.set(2.2, 0, 0.5); j.foreR.rotation.x = 1.0; j.armL.rotation.set(-r * 0.8, 0, -0.3);
  } else if (e.state === 'swing') {    // 大なたで なぎはらう
    const a = min(1, st / 0.35), b = max(0, min(1, (st - 0.3) / 0.25));
    j.armR.rotation.set(1.2 + a * 1.4 - b * 1.6, 0, 0.3 + a * 0.9 - b * 1.6);
    j.foreR.rotation.x = 0.4 + 0.6 * a - 0.6 * b;
    j.torso.rotation.y = 0.7 * a - 1.4 * b;
  }
  if (j.cleaver) j.cleaver.rotation.x = 0.2;
}

function animAbomination(m, e, dt) {
  const j = m.j, ph = e.ph, t = e.t;
  j.body.position.y = 1.5 + 0.12 * sin(ph * 2);
  j.body.rotation.z = 0.08 * sin(ph);
  j.body.rotation.x = -0.1 + 0.05 * sin(ph * 2);
  const s = 1 + 0.04 * sin(t * 3.1);
  j.body.scale.set(s, 2 - s, s);
  for (let i = 0; i < j.heads.length; i++) j.heads[i].rotation.x = 0.3 * sin(t * 1.3 + i * 2) - 0.1;
  for (let i = 0; i < j.arms.length; i++) {
    const a = j.arms[i];
    const g = ph + (i % 2) * Math.PI;
    // 地面について歩く(腕を外へ広げて下へ)
    let x = 1.0 + 0.4 * sin(g), el = -0.85 - 0.35 * max(0, cos(g));
    if (e.state === 'flurry' && i < 3) {   // 前の腕で なぎはらう
      x = 1.4 + 0.9 * sin(e.st * 18 + i * 1.7); el = -0.2;
    }
    a.sh.rotation.set(x, 0.35 * sin(g), 0);
    a.el.rotation.set(el, 0, 0);
  }
}

function animCrawlerKing(m, e, dt) {
  const j = m.j, ph = e.ph, t = e.t;
  const air = e.state === 'leap' && (e.y || 0) > 0.1;
  j.body.position.y = 1.1 + 0.08 * sin(ph * 2);
  j.body.rotation.z = 0.05 * sin(ph);
  j.body.rotation.x = air ? 0.25 : 0;
  j.head.rotation.set(0.2 * sin(t * 2.1), 0.3 * sin(t * 1.3), 0);
  j.jaw.rotation.x = 0.25 + 0.25 * sin(t * 5);
  for (const L of j.legs) {
    const g = ph + (L.k % 2) * Math.PI + (L.side > 0 ? Math.PI : 0);
    const swing = air ? 0.6 : 0.4 * sin(g);
    const lift = air ? 0.7 : 0.45 + 0.35 * max(0, cos(g));
    L.up.rotation.set(0, swing * (L.side < 0 ? 1 : -1), lift);
    L.kn.rotation.set(0, 0, air ? -0.9 : -1.75);
  }
}
