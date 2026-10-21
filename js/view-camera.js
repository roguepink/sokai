// 視点係(カメラ): 肩越し(tps)・一人称(fps)のカメラ / 視点を切りかえるときの なめらかな移り /
// 画角のパンチ(爆発・回転斬り・叩きつけ・ダッシュ)/ カメラのかたむき / 視点ごとの画面ゆれ / 撃った反動 /
// タイトルの見本プレイで ときどき出す「映画のような低い角度」の見せ場。
// Engine.updateCamera から呼ばれる。見下ろし(top)のカメラは engine.js のまま。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Events } from './events.js';
import { damp, dampAngle, angleDiff } from './util.js';

const V = CONFIG.VIEW, T = V.TPS, F = V.FPS;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _box = new THREE.Box3();
const smooth = (t) => t * t * (3 - 2 * t);

// ---------- カメラ用の壁しらべ ----------
// World.segmentHit と同じ考え方。ただし 細い柱・街灯(はば 0.7m 未満)と、minH より低い物は 無視する
// (細い物でカメラが ガクッと寄ると 気持ち悪いので)。当たった所までの割合 0..1
let _seen = new Uint32Array(256), _stamp = 1;
function camRay(x0, z0, x1, z1, minH) {
  const W = World;
  if (!W.grid || !W.boxes || !W._cell) return W.segmentHit ? W.segmentHit(x0, z0, x1, z1, minH) : 1;
  if (_seen.length < W.boxes.length) _seen = new Uint32Array(W.boxes.length + 256);
  const st = ++_stamp;
  const c0 = W._cell(Math.min(x0, x1), Math.min(z0, z1)), c1 = W._cell(Math.max(x0, x1), Math.max(z0, z1));
  const dx = x1 - x0, dz = z1 - z0;
  let best = 1;
  for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
    const cell = W.grid[gz * W.gw + gx];
    if (!cell) continue;
    for (let k = 0; k < cell.length; k++) {
      const id = cell[k];
      if (_seen[id] === st) continue; _seen[id] = st;
      const b = W.boxes[id];
      if (b.h < minH) continue;
      if (b.maxX - b.minX < 0.7 && b.maxZ - b.minZ < 0.7) continue;
      let tmin = 0, tmax = best;
      if (Math.abs(dx) < 1e-9) { if (x0 < b.minX || x0 > b.maxX) continue; }
      else { let a = (b.minX - x0) / dx, c = (b.maxX - x0) / dx; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
      if (Math.abs(dz) < 1e-9) { if (z0 < b.minZ || z0 > b.maxZ) continue; }
      else { let a = (b.minZ - z0) / dz, c = (b.maxZ - z0) / dz; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
      if (tmin < best) best = tmin;
    }
  }
  return best;
}

// 建物の天井の高さ(屋根のいちばん低い所)。建物の情報に h があれば それを使う
function ceilingOf(b) {
  if (!b) return 99;
  if (b._camCeil !== undefined) return b._camCeil;
  let c = b.h || 0;
  if (!c && b.roofs && b.roofs.length) {
    c = 99;
    for (const r of b.roofs) { _box.setFromObject(r); if (_box.min.y > 1.5) c = Math.min(c, _box.min.y); }
    if (c === 99) c = 0;
  }
  b._camCeil = c || 4;
  return b._camCeil;
}

// 線分 S→C(高さ込み)を、壁の手前で止める。k(0..1)= どこまで行けるか
const MARGIN = 0.38;
function boomK(sx, sz, cx, cz, minH) {
  const dx = cx - sx, dz = cz - sz, L = Math.hypot(dx, dz);
  if (L < 0.05) return 1;
  const ex = sx + dx / L * (L + MARGIN), ez = sz + dz / L * (L + MARGIN);
  const t = camRay(sx, sz, ex, ez, minH);
  if (t >= 1) return 1;
  return Math.max(0, (t * (L + MARGIN) - MARGIN) / L);
}

export const ViewCam = {
  blend: 1, _blendDur: V.BLEND,
  _fromPos: new THREE.Vector3(), _fromQuat: new THREE.Quaternion(), _fromFov: 50,
  pivot: new THREE.Vector3(), _pivotOk: false,
  boom: 1,                  // 肩越しのカメラの伸び(壁で縮む)
  aimK: 0,                  // 撃っている間 1 へ(肩越しで寄る)
  fovKick: 0,               // 画角のパンチ(度)。爆発などで広がり、すぐもどる
  speedFov: 0,              // 走る・ダッシュで広がる画角
  roll: 0, rollWant: 0,     // カメラのかたむき(ラジアン)。ダッシュで横へ かたむく
  dip: 0, _dipV: 0,         // 着地で カメラが沈む(m)
  kickPitch: 0,             // 撃った反動で 少し上を向く(見た目だけ)
  shakeT: 0,
  hideHero: false,
  heroFade: 1,              // 主人公の こさ(カメラが近いと うすく)
  cross: { x: 0, y: 0, ok: false },   // 照準の画面の位置(px)
  shot: null, _cineClock: 0, _cineNext: 7, _cineIdx: 0, _crowdYaw: 0,

  init() {
    Events.on('explosion', (e) => { if (e) this.punchAt(e.x, e.z, Math.min(9, 2 + (e.radius || 4) * 0.9)); });
    Events.on('propExplode', (e) => { if (e) this.punchAt(e.x, e.z, Math.min(9, 2 + (e.radius || 4) * 0.9)); });
    Events.on('spin', () => this.punch(9));
    Events.on('fire', (f) => {
      const w = f && f.weapon, s = (w && w.shake) || 0;
      if (f && f.continuous) this.kickPitch = Math.min(0.03, this.kickPitch + 0.0015);
      else this.kickPitch = Math.min(0.05, this.kickPitch + (0.004 + s * 0.03) * Math.min(1, 12 / ((w && w.rate) || 10)));   // 連射が速い武器は 1 発を小さく
    });
  },

  _heroX: 0, _heroZ: 0,
  punch(deg) { this.fovKick = Math.min(16, this.fovKick + deg); },
  punchAt(x, z, deg) {
    const d = Math.hypot(x - this._heroX, z - this._heroZ);
    if (d < 40) this.punch(deg * Math.max(0.25, 1 - d / 40));
  },
  land(amount) { this._dipV += amount * 11; },

  // 今のカメラから なめらかに移る
  startBlend(cam, dur = V.BLEND) {
    this._fromPos.copy(cam.position); this._fromQuat.copy(cam.quaternion); this._fromFov = cam.fov;
    this.blend = 0; this._blendDur = dur;
  },

  // ---------- 肩越し・一人称 ----------
  close(E, dt, target) {
    const cam = E.camera, hero = E.ctx && E.ctx.Player;
    this._heroX = target.x; this._heroZ = target.z;
    const fps = E.viewMode === 'fps';
    const yaw = E.lookYaw, p = E.lookPitch + this.kickPitch;
    const fx = Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = Math.sin(yaw);
    const cp = Math.cos(p), sp = Math.sin(p);
    const aiming = !!(hero && hero.aiming);
    this.aimK = damp(this.aimK, aiming ? 1 : 0, aiming ? 7 : 3, dt);
    this._springs(dt);
    let hide = false, fade = 1;
    if (fps) {
      // 目の高さ。体の中(当たりの円の中)にいるので 壁にめりこまない。歩くと 少しゆれる
      const k = hero ? Math.min(1, (hero._speed || 0) / CONFIG.PLAYER.SPEED) : 0, w = hero ? hero._walk || 0 : 0;
      const by = Math.sin(w * 2) * F.BOB * k, bx = Math.cos(w) * F.BOB * 0.6 * k;
      cam.position.set(target.x + fx * F.FWD + rx * bx, target.y + F.EYE + by - this.dip, target.z + fz * F.FWD + rz * bx);
      this._pivotOk = false;
      hide = this.blend > 0.55;
    } else {
      // 右肩の後ろ。少しおくれて ついてくる(ばね)。壁・天井・ほかの建物には めりこまない
      const jump = !this._pivotOk || Math.abs(this.pivot.x - target.x) + Math.abs(this.pivot.z - target.z) > 8;
      if (jump) { this.pivot.copy(target); this._pivotOk = true; this.boom = 1; }
      this.pivot.x = damp(this.pivot.x, target.x, T.LAG, dt);
      this.pivot.z = damp(this.pivot.z, target.z, T.LAG, dt);
      this.pivot.y = damp(this.pivot.y, target.y * 0.5, 9, dt);   // 跳んだときは 半分だけ ついていく(高く跳んだ感じ)
      // 縦長の画面は 横はばが せまいので、肩を まんなか寄りに(主人公が 画面の左はしに 切れないように)
      const back = T.BACK * (1 - (1 - T.FIRE_BACK) * this.aimK), side = T.SIDE * (1 - 0.2 * this.aimK) * (innerWidth < innerHeight ? 0.45 : 1);
      const px = this.pivot.x, pz = this.pivot.z, py = this.pivot.y + T.PIVOT - this.dip;
      // 肩: 体の横が壁なら 肩を引っこめる
      const t1 = camRay(target.x, target.z, px + rx * (side + MARGIN), pz + rz * (side + MARGIN), 1.2);
      const sd = Math.max(0, t1 * (side + MARGIN) - MARGIN);
      const sx = px + rx * sd, sz = pz + rz * sd, sy = py + T.UP;
      let cx = sx - fx * cp * back, cz = sz - fz * cp * back, cy = sy - sp * back;
      // 地面より下へ行かない
      let k = 1;
      if (cy < 0.35) k = Math.max(0.2, (sy - 0.35) / Math.max(0.01, sy - cy));
      const kw = boomK(sx, sz, cx, cz, Math.min(cy, sy) - 0.2);
      k = Math.min(k, kw);
      // ほかの建物の中(屋根がある所)には入らない
      const inside = World.inside;
      for (let i = 0; i < 3; i++) {
        const bx = sx + (cx - sx) * k, bz = sz + (cz - sz) * k;
        const b = World.buildingAt ? World.buildingAt(bx, bz) : null;
        if (!b || b === inside) break;
        k *= 0.55;
      }
      this.boom = damp(this.boom, k, k < this.boom ? 30 : 4.5, dt);
      cx = sx + (cx - sx) * this.boom; cz = sz + (cz - sz) * this.boom; cy = sy + (cy - sy) * this.boom;
      // 壁で寄ったときは 少し上へ(主人公で 画面が ふさがらないように)
      cy += (1 - this.boom) * 0.55;
      if (inside) cy = Math.min(cy, ceilingOf(inside) - 0.45);
      cam.position.set(cx, cy, cz);
      const dh = Math.hypot(cx - target.x, cz - target.z);
      hide = dh < 0.45;
      fade = dh < 1.9 ? Math.max(0.25, (dh - 0.45) / 1.45) : 1;
    }
    this.hideHero = hide;
    this.heroFade = damp(this.heroFade, fade, 10, dt);
    // 向き(ヨー・ピッチ)+ かたむき + ゆれ(回転のゆれ。位置をゆらすと 壁にめりこむので)
    _e.set(p, -yaw, this.roll, 'YXZ');
    if (E._shake > 0) {
      const s = E._shake * E._shake * (fps ? 0.018 : 0.03);
      const t = (this.shakeT += dt * 31);
      _e.x += s * (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 4.3));
      _e.y += s * (Math.sin(t * 1.3 + 1) + 0.5 * Math.sin(t * 3.7 + 2));
      _e.z += s * 0.6 * Math.sin(t * 2.1 + 4);
      if (!fps) { const ps = E._shake * E._shake * 0.08; cam.position.y += ps * Math.sin(t * 2.9); }
      E._shake = Math.max(0, E._shake - dt * 2.2);
    }
    cam.quaternion.setFromEuler(_e);
    // 画角
    const spd = hero ? Math.min(1.2, (hero._speed || 0) / CONFIG.PLAYER.SPEED) : 0;
    const dashing = hero && hero.moves && hero.moves.dashing;
    this.speedFov = damp(this.speedFov, dashing ? 12 : spd > 0.8 ? 3 * (spd - 0.8) / 0.2 : 0, dashing ? 12 : 4, dt);
    const base = (fps ? F.FOV : T.FOV) * (innerWidth < innerHeight ? 1.25 : 1);
    this._fov = base + this.fovKick + this.speedFov + (fps ? -2 : T.FIRE_FOV) * this.aimK;
    this._near = fps ? 0.06 : 0.15;
  },

  _springs(dt) {
    this.fovKick = damp(this.fovKick, 0, 4.5, dt);
    this.roll = damp(this.roll, this.rollWant, 8, dt);
    this.kickPitch = damp(this.kickPitch, 0, 10, dt);
    // 着地の沈み: ばね
    this._dipV += (-this.dip * 90 - this._dipV * 13) * dt;
    this.dip = Math.max(-0.2, Math.min(0.6, this.dip + this._dipV * dt));
  },

  // ---------- タイトル: 映画のような見せ場 ----------
  // 見本プレイの間、ときどき 低い角度から 主人公とゾンビの大群を映す。映していれば true
  cine(E, dt, target) {
    const cam = E.camera, ctx = E.ctx || {}, hero = ctx.Player, Z = ctx.Zombies;
    this._cineClock += dt;
    if (!hero || !Z) return false;
    if (!this.shot) {
      if (this._cineClock < this._cineNext) return false;
      const n = this._crowd(target, Z);
      if (n < 10) { this._cineNext = this._cineClock + 1; return false; }
      // 壁にじゃまされない 撮り方を えらぶ(種類 × 左右)
      this.pivot.copy(target); this.pivot.y = 0;
      const kinds = ['side', 'low', 'rear', 'wide'];
      let pick = null;
      for (let j = 0; j < kinds.length && !pick; j++) {
        const kind = kinds[(this._cineIdx + j) % kinds.length];
        for (const f of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
          const sh = { kind, t: 0, flip: f };
          if (this._shotK(sh) > 0.75) { pick = sh; this._cineIdx += j + 1; break; }
        }
      }
      if (!pick) { this._cineNext = this._cineClock + 1; return false; }
      this.shot = Object.assign(pick, { dur: 5 + Math.random() * 1.5, boom: 1 });
      this.startBlend(cam, 0.8);
    }
    const s = this.shot;
    s.t += dt;
    if (s.t > s.dur) { this.shot = null; this.startBlend(cam, 0.9); this._cineNext = this._cineClock + 8 + Math.random() * 4; return false; }
    // 大群のいる向きを ゆっくり追う。主人公の位置も なめらかに(ゆれない)
    if (((s.t * 4) | 0) !== (((s.t - dt) * 4) | 0)) this._crowd(target, Z);
    this.pivot.x = damp(this.pivot.x, target.x, 5, dt); this.pivot.z = damp(this.pivot.z, target.z, 5, dt);
    this.pivot.y = damp(this.pivot.y, target.y * 0.6, 5, dt);
    const P = this.pivot;
    this._springs(dt);
    const k = this._shotK(s);
    s.boom = s.t < dt * 1.5 ? k : damp(s.boom, k, k < s.boom ? 30 : 4, dt);
    const c = this._sc;
    const cx = P.x + (c.cx - P.x) * s.boom, cz = P.z + (c.cz - P.z) * s.boom;
    cam.position.set(cx, c.cy + P.y, cz);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.lx, c.ly + P.y, c.lz);
    if (c.roll) cam.rotateZ(c.roll);
    if (E._shake > 0) {
      const sh = E._shake * E._shake * 0.03, tt = (this.shakeT += dt * 31);
      cam.rotateX(sh * Math.sin(tt * 1.7)); cam.rotateY(sh * Math.sin(tt * 1.3 + 1));
      E._shake = Math.max(0, E._shake - dt * 2.2);
    }
    this.hideHero = false; this.heroFade = 1;
    this._fov = c.fov * (innerWidth < innerHeight ? 1.3 : 1) + this.fovKick * 0.6;
    this._near = 0.15;
    return true;
  },

  // 撮り方 s の カメラの位置と見る点を this._sc に入れ、壁で どこまで行けるか(0..1)を返す
  _sc: { cx: 0, cy: 0, cz: 0, lx: 0, ly: 0, lz: 0, fov: 56, roll: 0 },
  _shotK(s) {
    const P = this.pivot, c = this._sc, cy0 = this._crowdYaw, t = s.t, f = s.flip;
    const at = (a, d) => { _p.set(P.x + Math.sin(a) * d, 0, P.z - Math.cos(a) * d); return _p; };
    // 主人公は 画面のはし(左右 1/3)に置く。まん中は タイトルの文字があるので
    let side = 0.55;
    c.roll = 0;
    if (s.kind === 'side') {               // 真横から: 主人公 と 押しよせる大群
      at(cy0 + f * Math.PI / 2, 9 - t * 0.3); c.cx = _p.x; c.cz = _p.z; c.cy = 0.9;
      at(cy0, 7); c.lx = (P.x + _p.x) / 2; c.lz = (P.z + _p.z) / 2; c.ly = 1.3; c.fov = 52; c.roll = 0.03 * f; side = 0;
    } else if (s.kind === 'low') {         // 下から見上げる(後ろに大群)
      at(cy0 + Math.PI + 0.5 * f + t * 0.06 * f, 6.2 - t * 0.2); c.cx = _p.x; c.cz = _p.z; c.cy = 0.4;
      c.lx = P.x; c.lz = P.z; c.ly = 1.7; c.fov = 56; c.roll = -0.04 * f; side = 0.8;
    } else if (s.kind === 'rear') {        // 後ろの低い所から、大群に向かう主人公
      at(cy0 + Math.PI + 0.35 * f, 7.5); c.cx = _p.x; c.cz = _p.z; c.cy = 0.6;
      at(cy0, 12); c.lx = P.x * 0.6 + _p.x * 0.4; c.lz = P.z * 0.6 + _p.z * 0.4; c.ly = 1.3; c.fov = 60; side = 0.3;
    } else {                               // 地面すれすれの 引きの絵(ゆっくり回る)
      at(cy0 + Math.PI + 1.1 * f + t * 0.14 * f, 12); c.cx = _p.x; c.cz = _p.z; c.cy = 0.3;
      c.lx = P.x; c.lz = P.z; c.ly = 2.0; c.fov = 58; side = 0.7;
    }
    if (side) {                            // 見る点を 横へずらす(主人公が はしに来る)
      const dx = c.lx - c.cx, dz = c.lz - c.cz;
      c.lx += -dz * side * f; c.lz += dx * side * f;
    }
    // 壁(2.5m 以上)の手前まで。車などの中に カメラが入るなら もう少し寄る
    let k = boomK(P.x, P.z, c.cx, c.cz, 2.5);
    for (let i = 0; i < 4 && World.blockedAt; i++) {
      if (!World.blockedAt(P.x + (c.cx - P.x) * k, P.z + (c.cz - P.z) * k, 0.3)) break;
      k *= 0.8;
    }
    return k;
  },
  endShot(cam) { if (this.shot) { this.shot = null; this.startBlend(cam, 0.6); } this._cineClock = 0; this._cineNext = 7; },

  // まわりのゾンビの数と、いちばん多い向き(_crowdYaw)
  _crowd(target, Z) {
    let n = 0, sx = 0, sz = 0;
    const L = Z.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i]; if (!e.alive) continue;
      const dx = e.x - target.x, dz = e.z - target.z, d2 = dx * dx + dz * dz;
      if (d2 > 22 * 22 || d2 < 0.5) continue;
      const d = Math.sqrt(d2); n++; sx += dx / d; sz += dz / d;
    }
    if (n) {
      const a = Math.atan2(sx, -sz);
      this._crowdYaw = this.shot && this.shot.t > 0.1 ? this._crowdYaw + angleDiff(this._crowdYaw, a) * 0.25 : a;
    }
    return n;
  },

  // ---------- しあげ(どの視点でも): なめらかな移り・画角・近くの面 ----------
  post(E, dt, mode, topFov) {
    const cam = E.camera;
    this._fovMode = mode;
    let fov = mode === 'top' ? topFov : this._fov;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this._blendDur);
      const t = smooth(this.blend);
      cam.position.lerpVectors(this._fromPos, cam.position, t);
      _q.copy(cam.quaternion);
      cam.quaternion.slerpQuaternions(this._fromQuat, _q, t);
      fov = this._fromFov + (fov - this._fromFov) * t;
    }
    const near = this._fovMode === 'top' ? 0.5 : this._near;
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== near) { cam.fov = fov; cam.near = near; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // 照準の位置: 狙っている線の 18m 先(高さ 1.3m)。画面のまん中あたりに おさめる
    const ctx = E.ctx || {}, hero = ctx.Player;
    if (hero && this._fovMode !== 'top') {
      const y = E.lookYaw;
      const r = E.project(hero.pos.x + Math.sin(y) * 18, 1.3 + hero.pos.y * 0.5, hero.pos.z - Math.cos(y) * 18, this.cross);
      this.cross.ok = !!r;
      if (!r) { this.cross.x = innerWidth / 2; this.cross.y = innerHeight / 2; }
      this.cross.y = Math.max(innerHeight * 0.36, Math.min(innerHeight * 0.6, this.cross.y));
      this.cross.x = Math.max(innerWidth * 0.4, Math.min(innerWidth * 0.6, this.cross.x));
    }
  },
};
