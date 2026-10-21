// キャラ係: 第2弾のボス 3 体(boss.js の仕組みに のる)。
//   変異ゴリラ「マッドコング」 … こぶしで歩く巨大な猿。車を持ち上げて 投げつける(落ちた所が大爆発 = まわりのゾンビも吹っとぶ)
//   女王ハイブ「クイーン」     … 光る卵の袋をかかえた 虫の女王。小鬼ゾンビを 次々に産む・酸を吐く(ゾンビが溶ける)
//   ゾンビ装甲車「デスローダー」 … とげの鋤(すき)をつけた装甲トラック。ゾンビの群れを ひきながら 突進してくる
// それぞれ BOSS_TYPES / AIS(行動)/ BUILDERS(形)/ 動き と、投げた車・酸の玉(Bosses._projs)。
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Gore } from './zombie-gore.js';
import { lathe, sstep } from './zombie-models.js';

const R = (a, b) => a + Math.random() * (b - a);
const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min;

export const EXTRA_TYPES = {
  gorilla: { boss: true, hp: 5000, speed: 3.6, r: 1.7, points: 1500, scale: 2.1, color: 0x3a3430, name: '変異ゴリラ マッドコング', anim: 'boss' },
  queen:   { boss: true, hp: 4600, speed: 1.8, r: 2.0, points: 1500, scale: 2.0, color: 0x6a7a40, name: '女王ハイブ クイーン', anim: 'boss' },
  tank:    { boss: true, hp: 6200, speed: 6.5, r: 2.2, points: 1500, scale: 1.8, color: 0x4a4a40, name: 'ゾンビ装甲車 デスローダー', anim: 'boss', vehicle: true },
};
// 倒れたときに 前へたおれる量(0 = たおれない)
export const FALL = { gorilla: 1.2, queen: 0.5, tank: 0.05 };

// ---------------------------------------------------------------
// 行動。戻り値 = 進む速さ(-1 なら そのまま)。B = Bosses
// ---------------------------------------------------------------
export const EXTRA_AIS = {
  gorilla(B, e, m, dt, d, mx, mz, sp, px, pz) {
    if (e.state === 'walk') {
      if (!e.beat) { e.beat = 1; e.state = 'beat'; e.st = 0; return 0; }
      if (e.cool <= 0 && d > 9 && d < 40) { e.state = 'grab'; e.st = 0; act(e, 'grab'); return 0; }
      if (e.cool <= 0 && d < 7) { e.state = 'pound'; e.st = 0; return 0; }
      return sp;
    }
    if (e.state === 'beat') {            // 胸をたたいて ほえる
      if (e.st > 1.6) { e.state = 'walk'; e.st = 0; e.cool = 1.5; }
      return 0;
    }
    if (e.state === 'grab') {            // 地面から車をつかむ
      if (e.st > 0.45 && !m.holding) { m.holding = true; m.car.visible = true; FX.burst({ x: e.x + sin(e.face) * 2, y: 0.4, z: e.z - cos(e.face) * 2, count: 20, color: 0x5a5048, speed: 5, up: 3, life: 0.7, size: 0.3 }); }
      if (e.st > 0.55) { e.state = 'lift'; e.st = 0; }
      return 0;
    }
    if (e.state === 'lift') {            // 頭の上へ持ち上げて…
      if (e.st > 0.75) {
        e.state = 'throw'; e.st = 0;
        // 投げる: 主人公の少し先(動いている向き)へ
        m.holding = false; m.car.visible = false;
        m.root.updateMatrixWorld(true);
        m.car.getWorldPosition(_v);
        const T = 1.15, tx = px + R(-1.5, 1.5), tz = pz + R(-1.5, 1.5);
        B._throwCar(_v.x, _v.y, _v.z, (tx - _v.x) / T, (0.6 - _v.y) / T + 11 * T, (tz - _v.z) / T, e.face);
        act(e, 'throw');
      }
      return 0;
    }
    if (e.state === 'throw') { if (e.st > 0.6) { e.state = 'walk'; e.st = 0; e.cool = R(3.5, 5.5); } return 0; }
    if (e.state === 'pound') {           // 両こぶしで 地面をたたく
      if (e.st > 0.55 && !e.didPound) {
        e.didPound = true;
        B._shock(e.x + sin(e.face) * 2.4, e.z - cos(e.face) * 2.4, 8.5, 'slam');
      }
      if (e.st > 1.0) { e.state = 'walk'; e.st = 0; e.cool = R(2.5, 4); e.didPound = false; }
      return 0;
    }
    return sp;
  },

  queen(B, e, m, dt, d, mx, mz, sp, px, pz) {
    e.birthT = (e.birthT || 0) + dt;
    const low = e.hp < e.maxHp * 0.5;
    if (e.state === 'walk') {
      if (e.birthT > (low ? 4 : 5.5)) { e.state = 'birth'; e.st = 0; e.birthT = 0; act(e, 'birth'); return 0; }
      if (e.cool <= 0 && d < 32) { e.state = 'spit'; e.st = 0; e.spits = 0; return 0; }
      // 近すぎると下がる・遠いと近づく・ちょうどよければ 横へ
      if (d < 11) { _o.x = -mx; _o.z = -mz; }
      else if (d > 20) { _o.x = mx; _o.z = mz; }
      else { _o.x = -mz; _o.z = mx; }
      e.vx += (_o.x * sp - e.vx) * 0.06; e.vz += (_o.z * sp - e.vz) * 0.06;
      return -1;
    }
    if (e.state === 'birth') {           // 袋がふくらんで 小鬼ゾンビを産む
      if (e.st > 0.9 && !e.born) {
        e.born = true;
        m.root.updateMatrixWorld(true);
        m.sac.getWorldPosition(_v);
        const n = low ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const c = B._Z.spawn('imp', _v.x + cos(a) * 1.5, _v.z + sin(a) * 1.5);
          if (c) { c.kx = cos(a) * 7; c.kz = sin(a) * 7; c.stun = 0.3; }
        }
        FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: 50, color: 0xb8d040, speed: 9, up: 6, life: 0.9, size: 0.16 });
        FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: 20, color: 0x7a0808, speed: 6, up: 4, life: 0.8, size: 0.14 });
        Gore.splat(_v.x, _v.z, 3.5, 0, 0, 1, 0x4a5a10, 0.8);
      }
      if (e.st > 1.4) { e.state = 'walk'; e.st = 0; e.born = false; }
      return 0;
    }
    if (e.state === 'spit') {            // 酸の玉を 3 発
      const n = Math.floor((e.st - 0.35) / 0.22);
      if (n >= 0 && n > e.spits - 1 && e.spits < 3) {
        e.spits++;
        m.root.updateMatrixWorld(true);
        m.j.head.getWorldPosition(_v);
        const T = 0.9, tx = px + R(-4, 4), tz = pz + R(-4, 4);
        B._spitAcid(_v.x, _v.y, _v.z, (tx - _v.x) / T, (0.2 - _v.y) / T + 11 * T, (tz - _v.z) / T);
        if (e.spits === 1) act(e, 'spit');
      }
      if (e.st > 1.2) { e.state = 'walk'; e.st = 0; e.cool = R(2.5, 4); }
      return 0;
    }
    return sp;
  },

  tank(B, e, m, dt, d, mx, mz, sp, px, pz) {
    // 車なので ゆっくり曲がる。前のゾンビは ひいてしまう
    const want = Math.atan2(mx, -mz);
    let da = (want - e.face) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    const fx = sin(e.face), fz = -cos(e.face);
    e.plowT = (e.plowT || 0) - dt;
    const speed = Math.hypot(e.vx, e.vz);
    if (speed > 3 && e.plowT <= 0) {
      e.plowT = 0.1;
      const k = B._Z.damageCircle(e.x + fx * 2.8, e.z + fz * 2.8, 2.4, speed > 10 ? 900 : 300, { force: 10 + speed * 1.6, cause: 'tank', falloff: false });
      if (k > 0) { e.ran = (e.ran || 0) + k; if (speed > 10) Engine.shake(0.15); }
    }
    if (e.state === 'walk') {
      e.face += Math.max(-1, Math.min(1, da)) * dt * 1.1;
      if (e.cool <= 0 && Math.abs(da) < 0.25 && d > 8 && d < 45) { e.state = 'rev'; e.st = 0; act(e, 'rev'); }
      const s = sp * (Math.abs(da) > 1 ? 0.5 : 1);
      e.vx += (fx * s - e.vx) * 0.08; e.vz += (fz * s - e.vz) * 0.08;
      return -1;
    }
    if (e.state === 'rev') {             // エンジンをふかす(煙)
      e.face += Math.max(-1, Math.min(1, da)) * dt * 1.5;
      e.vx *= 0.9; e.vz *= 0.9;
      if (Math.random() < dt * 30) FX.smoke(e.x - fx * 2.6 + R(-0.6, 0.6), 1.6, e.z - fz * 2.6, 0.6, 1.0, 0x2a2a2a, -fx * 2, 2, -fz * 2, 0.7);
      if (e.st > 0.9) { e.state = 'charge'; e.st = 0; e.cx = fx; e.cz = fz; e.lx = e.x; e.lz = e.z; act(e, 'charge'); }
      return -1;
    }
    if (e.state === 'charge') {          // 突進
      e.vx = e.cx * 19; e.vz = e.cz * 19;
      if (Math.random() < dt * 30) FX.burst({ x: e.x - e.cx * 2, y: 0.3, z: e.z - e.cz * 2, count: 3, color: 0x4a4038, speed: 3, up: 2, life: 0.6, size: 0.35 });
      // 壁にぶつかった(ほとんど進めていない)
      const moved = Math.hypot(e.x - e.lx, e.z - e.lz); e.lx = e.x; e.lz = e.z;
      if (e.st > 0.25 && moved < 19 * dt * 0.3) {
        B._shock(e.x + e.cx * 2.5, e.z + e.cz * 2.5, 6, 'tank');
        e.state = 'skid'; e.st = 0; e.vx *= -0.3; e.vz *= -0.3;
      } else if (e.st > 2.0) { e.state = 'skid'; e.st = 0; }
      return -1;
    }
    if (e.state === 'skid') {
      e.vx *= 0.92; e.vz *= 0.92;
      if (Math.random() < dt * 20) FX.smoke(e.x + R(-1, 1), 0.4, e.z + R(-1, 1), 0.6, 0.8, 0x6a6058, 0, 1, 0, 0.5);
      if (e.st > 0.7) { e.state = 'walk'; e.st = 0; e.cool = R(2.5, 4.5); }
      return -1;
    }
    return sp;
  },
};

function act(e, a) { Events.emit('bossAct', { type: e.type, act: a, x: e.x, z: e.z, e }); }
const _v = new THREE.Vector3(), _o = { x: 0, z: 0 };

// ---------------------------------------------------------------
// 投げた車・酸の玉(Bosses に足す)
// ---------------------------------------------------------------
export function installProjectiles(B) {
  B._projs = [];
  B._cars = [];
  B._acid = [];
  const am = new THREE.MeshStandardMaterial({ color: 0x9ad020, emissive: 0x6a9a10, emissiveIntensity: 0.9, roughness: 0.3 });
  const ag = new THREE.SphereGeometry(0.32, 10, 8);
  for (let i = 0; i < 12; i++) { const o = new THREE.Mesh(ag, am); o.visible = false; B._acid.push(o); }
  for (let i = 0; i < 4; i++) { const c = buildCar(); c.visible = false; B._cars.push(c); }

  B._throwCar = function (x, y, z, vx, vy, vz, face) {
    const c = this._cars.find((o) => !o.userData.busy);
    if (!c) return;
    c.userData.busy = true; c.visible = true; c.position.set(x, y, z); c.rotation.set(0, -face, 0);
    if (!c.parent) this._scene.add(c);
    this._projs.push({ kind: 'car', o: c, vx, vy, vz, wx: R(-2, 2), wz: R(1.5, 3), t: 0, landed: false, life: 0 });
  };
  B._spitAcid = function (x, y, z, vx, vy, vz) {
    const o = this._acid.find((a) => !a.visible);
    if (!o) return;
    o.visible = true; o.position.set(x, y, z);
    if (!o.parent) this._scene.add(o);
    this._projs.push({ kind: 'acid', o, vx, vy, vz, t: 0 });
  };
  B._shock = function (x, z, r, cause) {
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      FX.burst({ x: x + cos(a) * 0.8, y: 0.3, z: z + sin(a) * 0.8, count: 2, color: 0x6a5a48, speed: r * 2.2, up: 2.5, life: 0.7, size: 0.3, dirX: cos(a), dirZ: sin(a), spread: 0.15, grav: 2, drag: 2.5 });
    }
    Engine.shake(1.0);
    Gore.splat(x, z, 3.2, 0, 0, 1, 0x1c1814, 0.7);
    Events.emit('explosion', { x, z, radius: r, source: 'boss' });
    Events.emit('zombieAttack', { x, z, boss: true });
    this._Z.damageCircle(x, z, r, 320, { force: 24, cause, falloff: true });
  };
  B._stepProjs = function (dt) {
    for (let i = this._projs.length - 1; i >= 0; i--) {
      const p = this._projs[i], o = p.o;
      p.t += dt;
      if (p.kind === 'car') {
        if (!p.landed) {
          p.vy -= 22 * dt;
          o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt;
          o.rotation.x += p.wx * dt; o.rotation.z += p.wz * dt;
          if (Math.random() < dt * 20) FX.smoke(o.position.x, o.position.y, o.position.z, 0.5, 0.8, 0x3a3a3a, 0, 0.5, 0, 0.5);
          if (o.position.y <= 0.7 && p.vy < 0) {
            p.landed = true; p.life = 5;
            const x = o.position.x, z = o.position.z;
            o.position.y = 0.55; o.rotation.set(Math.PI * (Math.random() < 0.5 ? 1 : 0), o.rotation.y, R(-0.2, 0.2));
            FX.explosion(x, z, 7, 'fire');
            const k = this._Z.damageCircle(x, z, 7.5, 1500, { force: 34, cause: 'car', falloff: true });
            if (typeof World.damage === 'function') try { World.damage(x, z, 7, 500, { cause: 'explosion' }); } catch (e) {}
            Engine.shake(1.2); Engine.hitStop(0.05);
            Gore.splat(x, z, 4.5, 0, 0, 1, 0x1a1410, 0.75);
            Events.emit('explosion', { x, z, radius: 7.5, source: 'car', kills: k });
          }
        } else {
          p.life -= dt;
          if (Math.random() < dt * 14) FX.flame(o.position.x + R(-1, 1), 0.9, o.position.z + R(-1, 1), 0, 2, 0, 0.7, 0.7);
          if (p.life < 1) o.position.y -= dt * 0.8;
          if (p.life <= 0) { o.visible = false; o.userData.busy = false; this._projs.splice(i, 1); }
        }
      } else {
        p.vy -= 22 * dt;
        o.position.x += p.vx * dt; o.position.y += p.vy * dt; o.position.z += p.vz * dt;
        if (Math.random() < dt * 30) FX.burst({ x: o.position.x, y: o.position.y, z: o.position.z, count: 1, color: 0xb8e040, speed: 0.5, up: 0, life: 0.4, size: 0.14, grav: 4 });
        if (o.position.y <= 0.2) {
          const x = o.position.x, z = o.position.z;
          o.visible = false; this._projs.splice(i, 1);
          FX.burst({ x, y: 0.4, z, count: 30, color: 0xa8e030, speed: 6, up: 4, life: 0.7, size: 0.14 });
          FX.smoke(x, 0.5, z, 1.4, 1.6, 0x8ab030, 0, 0.6, 0, 0.45);
          Gore.splat(x, z, 3.2, 0, 0, 1, 0x6a8a10, 0.85);
          this._Z.damageCircle(x, z, 3.6, 420, { force: 8, cause: 'acid', falloff: true });
          Events.emit('bossAct', { type: 'queen', act: 'acidHit', x, z });
        }
      }
    }
  };
  B._resetProjs = function () {
    for (const p of this._projs) { p.o.visible = false; p.o.userData.busy = false; }
    this._projs.length = 0;
  };
}

// ---------------------------------------------------------------
// 形
// ---------------------------------------------------------------
function canvasTex(w, h, fn, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); }
  return t;
}
// 毛皮(すじ)+ むき出しの肉
function furTex() {
  return canvasTex(256, 256, (c, S) => {
    c.fillStyle = '#4a3e36'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = R(0, S), y = R(0, S), v = R(40, 100) | 0;
      c.strokeStyle = `rgba(${v + 10},${v},${v - 6},0.7)`; c.lineWidth = R(0.8, 1.8);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + R(-2, 2), y + R(5, 12)); c.stroke();
    }
    for (let i = 0; i < 14; i++) {      // はげて肉が見える
      const x = R(0, S), y = R(0, S), w = R(10, 30), h = R(8, 22);
      c.fillStyle = '#8a3a34'; c.beginPath(); c.ellipse(x, y, w, h, R(0, 3), 0, 7); c.fill();
      c.fillStyle = '#b05a4a'; c.beginPath(); c.ellipse(x - 2, y - 2, w * 0.6, h * 0.5, R(0, 3), 0, 7); c.fill();
      c.fillStyle = 'rgba(60,0,0,0.8)'; c.beginPath(); c.ellipse(x, y + h * 0.4, w * 0.3, h * 0.2, 0, 0, 7); c.fill();
    }
  }, 2);
}
function chitinTex() {
  return canvasTex(256, 256, (c, S) => {
    c.fillStyle = '#3a3a28'; c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 18) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y, S, 3); c.fillStyle = 'rgba(255,255,200,.08)'; c.fillRect(0, y + 3, S, 5); }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${R(60, 120) | 0},${R(70, 110) | 0},30,.5)`; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(3, 12), R(2, 8), R(0, 3), 0, 7); c.fill(); }
  }, 2);
}
function sacTex() {
  return canvasTex(256, 256, (c, S) => {
    c.fillStyle = '#b8b060'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {   // 卵
      const x = R(0, S), y = R(0, S), r = R(8, 20);
      c.fillStyle = '#e8e090'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#4a5010'; c.beginPath(); c.arc(x + r * 0.15, y + r * 0.1, r * 0.45, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(120,20,40,.7)'; c.lineWidth = 2.5;
    for (let i = 0; i < 30; i++) { let x = R(0, S), y = R(0, S); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += R(-20, 20); y += R(-20, 20); c.lineTo(x, y); } c.stroke(); }
  }, 1.5);
}
function plateTex() {
  return canvasTex(256, 256, (c, S) => {
    c.fillStyle = '#7a7866'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${R(80, 140) | 0},${R(50, 80) | 0},20,${R(0.05, 0.25)})`; c.fillRect(R(0, S), R(0, S), R(2, 12), R(2, 12)); }   // さび
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3;
    for (let x = 0; x < S; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
    for (let y = 0; y < S; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
    c.fillStyle = '#2a2a24'; for (let x = 8; x < S; x += 32) for (let y = 8; y < S; y += 32) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); }   // びょう
    for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(90,0,0,0.8)'; c.beginPath(); c.ellipse(R(0, S), R(0, S), R(6, 20), R(4, 14), 0, 0, 7); c.fill(); c.fillRect(R(0, S), R(0, S), 3, R(10, 40)); }
    c.fillStyle = '#c8b020'; c.font = 'bold 28px sans-serif'; c.fillText('☠', 110, 140);
  });
}
function hazardTex() {
  return canvasTex(256, 64, (c, W, H) => {
    c.fillStyle = '#d8b020'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#18181a';
    for (let x = -H; x < W + H; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 20, 0); c.lineTo(x + 20 - H, H); c.lineTo(x - H, H); c.closePath(); c.fill(); }
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${R(80, 140) | 0},${R(40, 70) | 0},10,${R(0.1, 0.4)})`; c.fillRect(R(0, W), R(0, H), R(2, 8), R(2, 8)); }
    for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(100,0,0,.85)'; c.beginPath(); c.ellipse(R(0, W), R(0, H), R(4, 14), R(3, 9), 0, 0, 7); c.fill(); }
  });
}
function mk(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o;
}
function jnt(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
function limbGeo(L, r0, r1, bulge = 1.1, segs = 10) {
  return lathe([[0, -L - r1 * 0.6], [r1, -L], [r0 * bulge * 0.9, -L * 0.45], [r0 * bulge, -L * 0.2], [r0, 0], [r0 * 0.6, r0 * 0.6], [0, r0 * 0.75]], segs);
}
function spike(len, r) { const g = new THREE.ConeGeometry(r, len, 6); g.translate(0, len / 2, 0); return g; }

// ゴリラが投げる車(ボスの数だけ使い回す)
function buildCar() {
  const g = new THREE.Group();
  const col = [0x8a2020, 0x2a4a7a, 0xc8c8c8, 0x3a6a3a][(Math.random() * 4) | 0];
  const body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.3, metalness: 0.2 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  mk(g, new THREE.BoxGeometry(1.8, 0.6, 4.0), body, 0, 0, 0);
  mk(g, new THREE.BoxGeometry(1.6, 0.55, 2.0), dark, 0, 0.55, 0.2);
  mk(g, new THREE.BoxGeometry(1.62, 0.08, 2.02), body, 0, 0.85, 0.2);
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12); wg.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) mk(g, wg, tire, x, -0.3, z);
  g.userData.busy = false;
  return g;
}

export function newMatFn(m) {
  return (opts) => {
    const mt = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.75, metalness: 0 }, opts));
    mt.userData.baseE = mt.emissive.clone(); mt.userData.baseC = mt.color.clone();
    m.mats.push(mt);
    return mt;
  };
}
function piece(m, o, rad) { o.userData.home = { parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone() }; o.userData.rad = rad; m.pieces.push(o); return o; }

const BONE = 0xd8cdb0;
export const EXTRA_BUILDERS = {
  // ---------------- 変異ゴリラ(立つと 約 4.5m。ふだんは前かがみで こぶしを地面につく) ----------------
  gorilla(m) {
    const M = newMatFn(m);
    const fur = M({ map: furTex(), color: 0xffffff, roughness: 0.95 });
    const flesh = M({ color: 0x9a4a40, roughness: 0.5 });
    const bone = M({ color: BONE, roughness: 0.5 });
    const eye = M({ color: 0x300808, emissive: 0xff2010, emissiveIntensity: 3.2 });
    const hips = jnt(m.root, 0, 1.45, 0.4);
    mk(hips, lathe([[0, -0.4], [0.45, -0.32], [0.62, 0], [0.55, 0.25], [0, 0.32]], 12, (p) => { p.x *= 1.25; }), fur);
    const torso = jnt(hips, 0, 0.15, 0);
    mk(torso, lathe([[0.55, 0], [0.75, 0.35], [0.95, 0.85], [1.05, 1.25], [0.8, 1.6], [0.35, 1.78], [0, 1.82]], 14, (p) => {
      p.x *= 1 + 0.45 * sstep(0.6, 1.4, p.y); p.z *= 0.85;
      if (p.z > 0 && p.y > 0.9) p.z += 0.35 * sstep(0.9, 1.5, p.y);           // 背中のこぶ
      if (p.y > 1.4) p.y -= 0.2 * min(1, (p.x / 1.1) ** 2);
    }), fur);
    mk(torso, lathe([[0.4, 0.4], [0.6, 0.8], [0.62, 1.15], [0.45, 1.4], [0, 1.5]], 10, (p) => { p.z = -Math.abs(p.z) * 0.55 - 0.42; p.x *= 1.1; }), flesh, 0, 0, 0, false);   // むき出しの胸
    for (let i = 0; i < 7; i++) { const s = mk(torso, spike(R(0.4, 0.8), 0.08), bone, R(-0.5, 0.5), R(1.0, 1.6), 0.75); s.rotation.x = R(0.4, 1.0); s.rotation.z = R(-0.4, 0.4); }
    const head = piece(m, jnt(torso, 0, 1.62, -0.5), 0.4);
    mk(head, lathe([[0, -0.15], [0.22, -0.1], [0.3, 0.08], [0.3, 0.25], [0.22, 0.4], [0, 0.45]], 12, (p) => { if (p.z < 0 && p.y < 0.15) p.z *= 1.4; p.x *= 1.1; }), fur);
    mk(head, new THREE.BoxGeometry(0.5, 0.1, 0.18), fur, 0, 0.27, -0.24);    // まゆの骨
    mk(head, new THREE.SphereGeometry(0.065, 8, 6), eye, -0.12, 0.2, -0.33, false);
    mk(head, new THREE.SphereGeometry(0.065, 8, 6), eye, 0.12, 0.2, -0.33, false);
    const jaw = jnt(head, 0, 0.0, -0.05);
    mk(jaw, new THREE.BoxGeometry(0.42, 0.12, 0.42), flesh, 0, -0.08, -0.2);
    for (const s of [-1, 1]) { const f = mk(jaw, spike(0.16, 0.035), bone, s * 0.13, -0.03, -0.38, false); }   // きば(下)
    for (const s of [-1, 1]) { const f = mk(head, spike(0.18, 0.04), bone, s * 0.14, 0.06, -0.36, false); f.rotation.x = Math.PI; }   // きば(上)
    const arms = [];
    for (const sg of [-1, 1]) {
      const sh = piece(m, jnt(torso, sg * 1.15, 1.35, -0.1), 0.6);
      mk(sh, limbGeo(1.35, 0.42, 0.34, 1.25), fur);
      const el = jnt(sh, 0, -1.35, 0);
      mk(el, limbGeo(1.3, 0.38, 0.32, 1.2), fur);
      mk(el, new THREE.SphereGeometry(0.42, 12, 10), flesh, 0, -1.42, 0).scale.set(1, 0.8, 1.2);   // こぶし
      for (let i = 0; i < 3; i++) { const s = mk(el, spike(0.35, 0.05), bone, sg * 0.25, -0.4 - i * 0.3, 0.1); s.rotation.z = -sg * 1.3; }
      arms.push({ sh, el, sg });
    }
    const legs = [];
    for (const sg of [-1, 1]) {
      const lg = jnt(hips, sg * 0.5, -0.15, 0);
      mk(lg, limbGeo(0.75, 0.36, 0.28), fur);
      const kn = jnt(lg, 0, -0.75, 0);
      mk(kn, limbGeo(0.6, 0.28, 0.22), fur);
      mk(kn, new THREE.BoxGeometry(0.45, 0.2, 0.7), flesh, 0, -0.65, -0.15);
      legs.push({ lg, kn });
    }
    // 投げる車(手に持つ)
    const car = buildCar(); car.visible = false; car.scale.setScalar(0.9);
    const hold = jnt(arms[1].el, 0, -1.7, 0);
    hold.add(car); car.rotation.set(0, Math.PI / 2, 0.3); car.position.set(-0.8, 0, 0);
    m.car = car; m.holding = false;
    m.j = { hips, torso, head, jaw, arms, legs };
    m.anim = animGorilla;
  },

  // ---------------- 女王ハイブ(高さ 約 4m。後ろに 大きな卵の袋) ----------------
  queen(m) {
    const M = newMatFn(m);
    const shell = M({ map: chitinTex(), color: 0xffffff, roughness: 0.4, metalness: 0.1 });
    const sacM = M({ map: sacTex(), color: 0xffffff, roughness: 0.35, emissive: 0x6a7010, emissiveIntensity: 0.45 });
    const bone = M({ color: BONE, roughness: 0.45 });
    const eye = M({ color: 0x103010, emissive: 0x80ff30, emissiveIntensity: 2.4 });
    const flesh = M({ color: 0x8a5a50, roughness: 0.55 });
    const body = jnt(m.root, 0, 1.6, 0);
    // 卵の袋
    const sac = piece(m, jnt(body, 0, 0.4, 1.7), 1.2);
    const sg = new THREE.SphereGeometry(1.5, 20, 14);
    { const p = sg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.1 * sin(v.x * 5) * sin(v.y * 4 + 1) * sin(v.z * 3); v.multiplyScalar(n); v.z *= 1.35; v.y *= 0.85; p.setXYZ(i, v.x, v.y, v.z); } sg.computeVertexNormals(); }
    mk(sac, sg, sacM);
    // 胴(腰の上に 細い上半身。少し後ろへそる)
    mk(body, new THREE.SphereGeometry(0.6, 14, 10), shell, 0, 0, 0.2).scale.set(1, 0.8, 1.3);
    const torso = jnt(body, 0, 0.35, -0.2);
    torso.rotation.x = 0.15;
    mk(torso, lathe([[0.3, 0], [0.42, 0.3], [0.38, 0.75], [0.48, 1.05], [0.3, 1.3], [0, 1.38]], 12, (p) => { p.z *= 0.8; }), shell);
    for (let i = 0; i < 4; i++) mk(torso, new THREE.TorusGeometry(0.38 - i * 0.02, 0.03, 5, 12), bone, 0, 0.25 + i * 0.18, 0, false).rotation.x = Math.PI / 2;
    const head = piece(m, jnt(torso, 0, 1.35, -0.1), 0.4);
    mk(head, lathe([[0, -0.1], [0.18, -0.05], [0.24, 0.15], [0.2, 0.4], [0.1, 0.6], [0, 0.65]], 10, (p) => { p.z = p.z * 1.2 + (p.y > 0.2 ? (p.y - 0.2) * 0.9 : 0); }), shell);   // 後ろへ長い頭
    for (let i = 0; i < 5; i++) { const s = mk(head, spike(R(0.35, 0.6), 0.05), bone, (i - 2) * 0.09, 0.4, 0.2 + Math.abs(i - 2) * 0.05); s.rotation.x = 0.7; s.rotation.z = (i - 2) * 0.25; }   // 骨の冠
    for (const [x, y] of [[-0.09, 0.17], [0.09, 0.17], [-0.15, 0.1], [0.15, 0.1]]) mk(head, new THREE.SphereGeometry(0.045, 8, 6), eye, x, y, -0.2, false);
    const mand = [];
    for (const s of [-1, 1]) { const j = jnt(head, s * 0.1, -0.02, -0.15); const f = mk(j, spike(0.3, 0.05), bone, 0, 0, 0); f.rotation.x = -1.9; f.rotation.z = s * 0.3; mand.push(j); }
    // 腕 4 本(先が かま)
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const sg2 = i % 2 ? 1 : -1, hi = i < 2;
      const sh = piece(m, jnt(torso, sg2 * 0.45, hi ? 1.05 : 0.7, -0.05), 0.3);
      mk(sh, limbGeo(1.1, 0.12, 0.09), shell);
      const el = jnt(sh, 0, -1.1, 0);
      mk(el, limbGeo(1.0, 0.09, 0.06), shell);
      const blade = mk(el, spike(0.9, 0.08), bone, 0, -1.0, 0); blade.rotation.x = Math.PI - 0.5;
      arms.push({ sh, el, sg: sg2, hi });
    }
    // 足 6 本(くも のように外へ出て 下へ)
    const legs = [];
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, k = i % 3;
      const base = jnt(body, side * 0.5, 0, -0.3 + k * 0.6);
      base.rotation.y = side < 0 ? Math.PI : 0;
      const up = piece(m, jnt(base, 0, 0, 0), 0.25);
      const ug = limbGeo(1.3, 0.12, 0.09); ug.rotateZ(Math.PI / 2); mk(up, ug, shell);
      const kn = jnt(up, 1.3, 0, 0);
      const lg = limbGeo(1.6, 0.09, 0.04); lg.rotateZ(Math.PI / 2); mk(kn, lg, shell);
      legs.push({ base, up, kn, side, k });
    }
    m.sac = sac;
    m.j = { body, torso, head, mand, arms, legs, sac };
    m.anim = animQueen;
  },

  // ---------------- ゾンビ装甲車(長さ 約 6m) ----------------
  tank(m) {
    const M = newMatFn(m);
    const plate = M({ map: plateTex(), color: 0xffffff, roughness: 0.7, metalness: 0.15 });
    const dark = M({ color: 0x18191b, roughness: 0.4, metalness: 0.3 });
    const steel = M({ color: 0xa8a8b0, roughness: 0.4, metalness: 0.35 });
    const hazard = M({ map: hazardTex(), color: 0xffffff, roughness: 0.6 });
    const tireM = M({ color: 0x121212, roughness: 0.95 });
    const bone = M({ color: BONE, roughness: 0.5 });
    const lamp = M({ color: 0x302010, emissive: 0xffd080, emissiveIntensity: 3.0 });
    const eyeR = M({ color: 0x300808, emissive: 0xff2010, emissiveIntensity: 2.5 });
    const skin = M({ color: 0x7a8a6a, roughness: 0.8 });
    const body = jnt(m.root, 0, 1.15, 0);
    mk(body, new THREE.BoxGeometry(2.5, 1.1, 5.0), plate, 0, 0, 0.3);
    mk(body, new THREE.BoxGeometry(2.3, 1.0, 1.8), plate, 0, 0.95, -0.9);                  // 運転席
    mk(body, new THREE.BoxGeometry(2.0, 0.42, 0.06), dark, 0, 1.08, -1.83, false);          // 前の窓(すき間)
    mk(body, new THREE.BoxGeometry(2.6, 0.12, 5.1), steel, 0, 0.58, 0.3);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { const sp = mk(body, spike(0.45, 0.07), steel, s * 1.28, 0.2, -1.3 + i * 1.2, false); sp.rotation.z = -s * Math.PI / 2; }
    for (const s of [-1, 1]) { mk(body, new THREE.CylinderGeometry(0.1, 0.12, 1.6, 8), steel, s * 0.9, 1.4, 1.9); mk(body, new THREE.SphereGeometry(0.12, 8, 6), lamp, s * 0.85, 0.35, -2.05, false); }   // 煙突・ライト
    // 鋤(すき): 前の くさび + とげ
    const plow = piece(m, jnt(body, 0, -0.35, -2.4), 0.8);
    const pg = new THREE.BoxGeometry(3.0, 1.2, 0.18); { const p = pg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.5 * (1 - Math.abs(p.getX(i)) / 1.5)); pg.computeVertexNormals(); }
    mk(plow, pg, hazard);
    for (const s of [-1, 1]) mk(plow, new THREE.SphereGeometry(0.2, 10, 8), lamp, s * 0.95, 0.75, -0.2, false);   // ライト(鋤の上)
    mk(body, new THREE.BoxGeometry(1.6, 0.08, 0.04), eyeR, 0, 1.08, -1.86, false);   // 窓の中の 赤い光
    for (let i = 0; i < 7; i++) { const sp = mk(plow, spike(0.5, 0.08), steel, -1.3 + i * 0.43, R(-0.3, 0.3), -0.55 + Math.abs(i - 3) * 0.12, false); sp.rotation.x = -Math.PI / 2; }
    for (let i = 0; i < 3; i++) { const sk = mk(plow, new THREE.SphereGeometry(0.17, 8, 6), bone, -0.8 + i * 0.8, 0.45, -0.35, false); sk.scale.set(1, 1.1, 1.2); }   // どくろ
    // 屋根の上のゾンビ(運転手)
    const drv = piece(m, jnt(body, 0, 1.45, -0.6), 0.3);
    mk(drv, lathe([[0.2, 0], [0.24, 0.3], [0.2, 0.5], [0, 0.55]], 8), skin);
    mk(drv, new THREE.SphereGeometry(0.15, 8, 6), skin, 0, 0.68, 0);
    for (const s of [-1, 1]) { const a = mk(drv, limbGeo(0.5, 0.06, 0.05), skin, s * 0.25, 0.45, 0); a.rotation.x = 1.4; }
    // 車輪 6 こ
    const wheels = [];
    const wg = new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14); wg.rotateZ(Math.PI / 2);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = piece(m, jnt(body, s * 1.3, -0.55, -1.4 + i * 1.75), 0.6);
      mk(w, wg, tireM);
      mk(w, new THREE.CylinderGeometry(0.3, 0.3, 0.52, 8).rotateZ(Math.PI / 2), steel, 0, 0, 0, false);
      wheels.push(w);
    }
    m.j = { body, wheels, plow, drv };
    m.anim = animTank;
  },
};

// ---------------- 動き ----------------
function animGorilla(m, e, dt) {
  const j = m.j, ph = e.ph, t = e.t, s = sin(ph), c = cos(ph), st = e.st;
  const k = min(1, e.spd / (e.def.speed * 0.5));
  // こぶし歩き: 前かがみ
  let lean = 0.75;
  j.hips.position.y = 1.45 - 0.08 * Math.abs(s) * k;
  for (let i = 0; i < 2; i++) {
    const L = j.legs[i], sg = i ? 1 : -1;
    L.lg.rotation.x = sg * s * 0.5 * k + 0.2; L.kn.rotation.x = -(0.3 + 0.5 * max(0, sg * c)) * k - 0.2;
  }
  for (let i = 0; i < 2; i++) {
    const A = j.arms[i], sg = i ? -1 : 1;
    A.sh.rotation.set(1.0 + sg * s * 0.55 * k, 0, A.sg * 0.25);
    A.el.rotation.set(-0.35 + 0.25 * max(0, sg * c) * k, 0, 0);
  }
  j.head.rotation.set(-0.6 + 0.1 * sin(t * 1.1), 0.3 * sin(t * 0.6), 0);
  j.jaw.rotation.x = 0.15 + 0.1 * sin(t * 3);
  if (e.state === 'beat') {             // 立ち上がって 胸をたたく
    lean = -0.15;
    const b = sin(st * 18);
    for (let i = 0; i < 2; i++) { const A = j.arms[i]; A.sh.rotation.set(1.6 + (i ? b : -b) * 0.35, 0, A.sg * -0.6); A.el.rotation.set(1.9, 0, 0); }
    j.head.rotation.x = 0.5; j.jaw.rotation.x = 0.6;
  } else if (e.state === 'grab') {
    const a = min(1, st / 0.45);
    lean = 0.75 + 0.35 * a; j.arms[1].sh.rotation.set(1.3 + 0.6 * a, 0, 0.2); j.arms[1].el.rotation.x = -0.2;
  } else if (e.state === 'lift') {
    const a = min(1, st / 0.6);
    lean = 1.1 - 1.3 * a;
    for (const A of j.arms) { A.sh.rotation.set(1.9 + 1.1 * a, 0, A.sg * -0.3); A.el.rotation.set(0.6 * a, 0, 0); }
    j.jaw.rotation.x = 0.5;
  } else if (e.state === 'throw') {
    const a = min(1, st / 0.25);
    lean = -0.2 + 1.0 * a;
    for (const A of j.arms) { A.sh.rotation.set(3.0 - 2.4 * a, 0, A.sg * -0.2); A.el.rotation.set(0.2, 0, 0); }
  } else if (e.state === 'pound') {
    const a = st < 0.45 ? min(1, st / 0.4) : max(0, 1 - (st - 0.45) * 8);
    lean = 0.75 - 0.9 * a;
    for (const A of j.arms) { A.sh.rotation.set(1.0 + 2.2 * a, 0, A.sg * -0.2); A.el.rotation.set(0.4 * a, 0, 0); }
    j.jaw.rotation.x = 0.6 * a;
  }
  j.torso.rotation.set(-lean, 0.12 * s * k, 0.06 * s * k);
}

function animQueen(m, e, dt) {
  const j = m.j, ph = e.ph, t = e.t, st = e.st;
  j.body.position.y = 1.6 + 0.06 * sin(ph * 2);
  const puff = e.state === 'birth' ? 1 + 0.25 * sin(min(1, st / 0.9) * Math.PI * 0.5) * (st < 0.9 ? 1 : max(0, 1 - (st - 0.9) * 3)) : 1 + 0.05 * sin(t * 2.4);
  j.sac.scale.set(puff, puff, puff);
  j.torso.rotation.set(0.15 + 0.08 * sin(t * 1.3), 0.3 * sin(t * 0.7), 0);
  j.head.rotation.set(0.1 * sin(t * 1.7), 0.4 * sin(t * 0.9), 0);
  for (let i = 0; i < 2; i++) j.mand[i].rotation.y = (i ? -1 : 1) * (0.2 + 0.2 * sin(t * 8));
  for (const A of j.arms) {
    const w = sin(t * 2 + (A.hi ? 0 : 1.5) + A.sg);
    A.sh.rotation.set(A.hi ? 0.9 + 0.3 * w : 0.4 + 0.2 * w, 0, A.sg * (A.hi ? -0.5 : -0.3));
    A.el.rotation.set(A.hi ? 1.3 : 0.9, 0, 0);
    if (e.state === 'spit' && A.hi) { A.sh.rotation.x = 2.4; A.el.rotation.x = 0.4; }
  }
  if (e.state === 'spit') { j.head.rotation.x = st < 0.35 ? -0.5 : 0.4; }
  for (const L of j.legs) {
    const g = ph * 1.4 + (L.k % 2) * Math.PI + (L.side > 0 ? Math.PI : 0);
    L.up.rotation.set(0, 0.35 * sin(g) * (L.side < 0 ? 1 : -1) + (L.k - 1) * 0.5 * (L.side < 0 ? -1 : 1), 0.7 + 0.25 * max(0, cos(g)));
    L.kn.rotation.set(0, 0, -1.9);
  }
}

function animTank(m, e, dt) {
  const j = m.j, sp = Math.hypot(e.vx, e.vz);
  const fw = e.vx * sin(e.face) - e.vz * cos(e.face);
  m.wRot = (m.wRot || 0) + fw * dt / 0.62;
  for (const w of j.wheels) w.rotation.x = -m.wRot;
  j.body.position.y = 1.15 + 0.03 * sin(e.t * 40) * min(1, sp / 4) + (e.state === 'rev' ? 0.04 * sin(e.t * 60) : 0);
  j.body.rotation.x = e.state === 'charge' ? -0.04 : e.state === 'skid' ? 0.06 : 0;
  j.drv.rotation.set(0.2 * sin(e.t * 3), 0.5 * sin(e.t * 0.8), 0);
}
