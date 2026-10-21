// 武器係: 銃(押している間ずっと撃つ)・近くの敵は自動で剣・回転斬り(必殺技)・自動で狙う。
// 武器の数字は weapon-defs.js、見た目は weapon-models.js、飛ぶ弾は weapon-proj.js、ダメージの道具は weapon-hit.js。
import * as THREE from 'three';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { Player } from './player.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { dampAngle, angleDiff } from './util.js';
import { WEAPONS } from './weapon-defs.js';
import { buildModel } from './weapon-models.js';
import { Proj, GRAV } from './weapon-proj.js';
import { P2 } from './weapon-proj2.js';
import { hurt, area, cone, LOW, HIT } from './weapon-hit.js';
import { Extra } from './weapon-extra.js';
import { Summon, RAINBOW } from './weapon-summon.js';
import { VM } from './weapon-view.js';
import { Score } from './score.js';

export { WEAPONS };

const MELEE_R = 3.0, MELEE_COOL = 0.2, MELEE_DMG = 130;   // 剣: この距離の敵を自動で斬る
const SPIN_R = 10.5, SPIN_COOL = 1.6, SPIN_DMG = 3000;     // 回転斬り
const K = 8;                                               // 狙う候補の数
const rnd = Math.random;
const _mz = new THREE.Vector3();
const _hits = [], _near = [], _list = [], _cand = new Array(K).fill(null), _cs = new Float64Array(K);
let _stamp = 1;
const _sp = {};
const _pt = { x: 0, z: 0, d: 0 };
// フィーバー(無双モード)中の 強くした武器の写し
function boost(w) {
  const f = { ...w, fever: true };
  f.rate = w.rate * (w.continuous ? 1.35 : 1.6);
  if (w.rateMin) f.rateMin = w.rateMin * 1.6;
  for (const k of ['dmg', 'hitDmg', 'blast', 'boltDmg', 'dps']) if (w[k]) f[k] = w[k] * 1.5;
  if (w.radius) f.radius = w.radius * 1.3;
  if (w.pellets > 1) f.pellets = Math.ceil(w.pellets * 1.5);
  if (w.salvo) f.salvo = w.salvo + 4;
  if (w.count) f.count = w.count + 2;
  if (w.bombs) f.bombs = w.bombs + 5;
  if (w.bolts) f.bolts = w.bolts + 5;
  if (w.chain) f.chain = w.chain + 6;
  if (w.max) f.max = w.max + 2;
  if (w.pierce) f.pierce = w.pierce + 3;
  if (w.bounces) f.bounces = w.bounces + 3;
  if (w.hops) f.hops = w.hops + 2;
  f.color = 0xffd040;
  return f;
}
function inView(e) {
  const p = Engine.project(e.x, 1, e.z, _sp);
  return !!p && p.x > 10 && p.x < innerWidth - 10 && p.y > 10 && p.y < innerHeight - 10;
}

export const Weapons = {
  index: 0,
  get current() { return WEAPONS[this.index]; },
  // 回転斬りの溜まり具合(0..1。1 で使える)
  get spinReady() { return Math.max(0, Math.min(1, 1 - this._spinCool / SPIN_COOL)); },
  spinCooldown: SPIN_COOL,
  target: null,             // いま狙っている敵(UI で印を出すなど)
  crossTarget: null,        // 肩越し・一人称: 照準(画面のまん中)の下にいる敵(なければ null)
  close: false,             // 肩越し・一人称のとき true
  fever: false,             // フィーバー(無双モード)中
  _fw: [], _hmT: 0, _smCool: 0, _rb: 0, _fxT: 0,
  aimAngle: 0,              // 狙いの向き(facing と同じ決まり)
  spinUp: 0,                // ミニガンの回転(0..1)
  _cool: 0, _melee: 0, _spinCool: 0, _spinBuf: 0, _tick: 0, _evT: 0, _decT: 0, _alt: 0, _slashDir: 1,
  _aoeT: 0, _aoeE: null, _models: [],

  init(scene) {
    this._models = WEAPONS.map((w) => buildModel(w.id));
    this._fw = WEAPONS.map(boost);
    Proj.init(scene);
    Summon.init(scene);
    P2.puddle = (w, x, z, r) => Summon.puddle(w, x, z, r);
    VM.init(Engine.renderer);
    this._hold();
    Events.on('feverStart', () => this._feverNova());
  },

  reset() {
    this._cool = 0; this._melee = 0; this._spinCool = 0; this._spinBuf = 0; this.spinUp = 0; this._tick = 0;
    this.target = null; this._aoeE = null; this.aimAngle = 0; this.crossTarget = null;
    Proj.reset(); Summon.reset(); Extra.reset(); VM.reset();
    HIT.n = 0; HIT.kill = 0; HIT.step = 0; HIT.crit = false; HIT.boss = false;
    this._hold();
  },

  select(i) {
    this.index = ((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    this.spinUp = 0;
    this._cool = Math.min(this._cool, 0.05);
    this._hold();
    VM.setWeapon(this.index);
    const p = Player.pos;
    if (FX.rings) {
      FX.ring(p.x, p.z, 0.3, 1.6, 0.25, this.current.color, 0.18, 3, 1);
      for (let k = 0; k < 10; k++) FX.spark(p.x, 1.3, p.z, (rnd() - 0.5) * 5, 1 + rnd() * 3, (rnd() - 0.5) * 5, 0.35, 0.05, this.current.color, 5);
    }
    Events.emit('weaponChange', { weapon: this.current, index: this.index });
  },

  _hold() { if (Player.parts && Player.parts.gunMount) Player.holdWeapon(this._models[this.index] || null); },

  update(dt, input, player) {
    const d = input.consumeWeaponDelta(); if (d) this.select(this.index + d);
    const s = input.consumeWeaponSelect(); if (s >= 0 && s < WEAPONS.length) this.select(s);
    this.close = Engine.viewMode !== 'top';
    const fps = Engine.viewMode === 'fps';
    VM.active = fps;
    FX.muzzleScale = fps ? 0.4 : 1;
    this.fever = !!Score.feverActive;
    VM._fever = this.fever ? 1 : 0;
    const w = this.fever ? this._fw[this.index] : this.current;
    HIT.step = 0;

    this._aim(dt, input, player, w);
    this._sword(dt, player);

    // 回転斬り(少し早く押しても、使えるようになったら出る)
    this._spinCool = Math.max(0, this._spinCool - dt);
    if (input.consumeSpin()) this._spinBuf = 0.35;
    if (this._spinBuf > 0) { this._spinBuf -= dt; if (this._spinCool <= 0) { this._spinBuf = 0; this.spin(player); } }

    // 撃つ(押している間ずっと)
    const firing = input.fire;
    player.aiming = firing;
    if (w.spinUp) this.spinUp = firing ? Math.min(1, this.spinUp + dt / w.spinUp) : Math.max(0, this.spinUp - dt * 1.2);
    this._cool -= dt; this._evT -= dt; this._decT -= dt;
    Extra.orbIdle += dt;
    if (firing) {
      if (w.designator) Extra.designate(this, w, player, this._muzzle(player, w, _mz), Math.sin(this.aimAngle), -Math.cos(this.aimAngle));
      if (w.continuous) this._stream(w, dt, player);
      else {
        const rate = w.spinUp ? w.rateMin + (w.rate - w.rateMin) * this.spinUp * this.spinUp : w.rate;
        let guard = 0;
        while (this._cool <= 0 && guard++ < 8) { this._cool += 1 / rate; this._fire(w, player); }
        if (this._cool < -0.2) this._cool = 0;
      }
    } else { if (this._cool < 0) this._cool = 0; this._tick = 0; }

    Proj.update(dt);
    Summon.update(dt, player, firing && w.kind === 'drone');
    this._animModel(dt, w);
    if (this.fever) this._feverFx(dt, player);
    this._afterHits(dt);
  },

  // 当たった印(hitMarker)をまとめて出す / 一度にたくさん倒したら 少しだけスロー
  _afterHits(dt) {
    this._hmT -= dt; this._smCool -= dt;
    if (HIT.n && (HIT.kill || this._hmT <= 0)) {
      Events.emit('hitMarker', { crit: HIT.crit, kill: HIT.kill > 0, kills: HIT.kill, boss: HIT.boss });
      this._hmT = 0.06;
      HIT.n = 0; HIT.kill = 0; HIT.crit = false; HIT.boss = false;
    }
    if (HIT.step >= 14 && this._smCool <= 0) {
      this._smCool = 9;
      Engine.slowMo(0.45, 0.3);
      Events.emit('weaponSfx', { name: 'slowmo', kills: HIT.step });
    }
  },

  // フィーバー中: 足もとに金色の輪・まわりに光の粒
  _feverFx(dt, player) {
    const p = player.pos, t = performance.now() * 0.001;
    if (!this.close || Engine.viewMode === 'tps') FX.ring(p.x, p.z, 0.9, 1.25 + Math.sin(t * 8) * 0.1, -1, 0xffc840, 0.18, 2.2, 0.9, 0, 0.08);
    this._fxT -= dt;
    if (this._fxT <= 0) {
      this._fxT = 0.05;
      const a = rnd() * Math.PI * 2, r = this.close ? 1.8 + rnd() * 1.5 : 0.6 + rnd() * 0.7;
      FX.spark(p.x + Math.cos(a) * r, 0.2 + rnd() * 1.6, p.z + Math.sin(a) * r, 0, 2 + rnd() * 2, 0, 0.6, 0.06, RAINBOW[(this._rb++) % RAINBOW.length], 5, 0xffd040, 2, 0, -2, 1, 0);
    }
  },

  // フィーバーが始まった瞬間: 金色の大爆発(まわりの敵を ふき飛ばす)
  _feverNova() {
    const p = Player.pos;
    const kills = area(p.x, p.z, 14, 500, 52, 'spin', true, true);
    // 一人称・肩越しでは 目の前が真っ白にならないように、主人公の所の爆発は出さず 輪と光の粒だけ
    if (!this.close) FX.explosion(p.x, p.z, 4, 'gold');
    FX.ring(p.x, p.z, 1, 22, 0.8, 0xffd040, 1, 2, 1, 0);
    if (!this.close) FX.ring(p.x, p.z, 0.5, 16, 0.6, 0xffffff, 0.25, 1.6, 0.8, 0, 1);
    const r0 = this.close ? 2.5 : 0;
    for (let i = 0; i < FX.q(60); i++) { const a = rnd() * Math.PI * 2, s = 10 + rnd() * 18; FX.spark(p.x + Math.cos(a) * r0, 1.2, p.z + Math.sin(a) * r0, Math.cos(a) * s, 2 + rnd() * 8, Math.sin(a) * s, 0.7, 0.07, RAINBOW[i % RAINBOW.length], 6, 0xffd040, 2, 0.03, 8, 1.6); }
    FX.flash(p.x, 4, p.z, 0xffd040, 90, 40, 0.5);
    Engine.shake(1.4); Engine.slowMo(0.5, 0.3);
    if (Engine.viewMode === 'fps') VM.spin(0xffd040);
    Events.emit('spin', { x: p.x, z: p.z, kills, fever: true });
  },

  // ================= 狙い =================
  // 前(進む向き・今の狙い)にいる敵、近い敵、ボスを優先。爆発する武器は 敵のかたまりを狙う。壁の向こうは狙わない
  _aim(dt, input, player, w) {
    const px = player.pos.x, pz = player.pos.z;
    const ml = Math.hypot(input.move.x, input.move.z);
    const mx = ml > 0.2 ? input.move.x / ml : 0, mz = ml > 0.2 ? input.move.z / ml : 0;
    const ax = Math.sin(this.aimAngle), az = -Math.cos(this.aimAngle);
    const R = w.kind === 'flame' || w.kind === 'freeze' || w.near ? 17 : 36;
    const list = Zombies.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const dx = e.x - px, dz = e.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > R * R) continue;
      const dd = Math.sqrt(d2) || 0.01;
      let sc = -dd + 3 * (dx * ax + dz * az) / dd;
      if (ml > 0.2) sc += 6 * (dx * mx + dz * mz) / dd;
      if (e === this.target) sc += 4;
      if (e.boss) sc += dd < Math.min(26, w.range) ? 30 : 6;   // ボスは とどく距離なら いちばん先に
      if (dd < 4.5) sc += 5;
      if (e === this._aoeE) sc += 14;
      if (n < K || sc > _cs[n - 1]) {
        let j = n < K ? n++ : K - 1;
        while (j > 0 && _cs[j - 1] < sc) { _cs[j] = _cs[j - 1]; _cand[j] = _cand[j - 1]; j--; }
        _cs[j] = sc; _cand[j] = e;
      }
    }
    let tgt = null;
    // 画面に映っている敵だけ自動で狙う(画面の外で倒しても見えない。押しよせて来るのを画面の中で倒すほうが気持ちいい)
    for (let i = 0; i < n; i++) { const e = _cand[i]; if ((inView(e) || (e.boss && (e.x - px) ** 2 + (e.z - pz) ** 2 < w.range * w.range)) && World.segmentHit(px, pz, e.x, e.z, LOW) >= 0.98) { tgt = e; break; } }
    if (w.cluster) {
      this._aoeT -= dt;
      if (this._aoeT <= 0 || (this._aoeE && !this._aoeE.alive)) { this._aoeT = 0.25; this._aoeE = this._bestCluster(n, px, pz, w); }
    } else this._aoeE = null;
    for (let i = 0; i < K; i++) _cand[i] = null;
    this.target = tgt;

    let want = this.aimAngle;
    this.crossTarget = null;
    if (this.close) {
      // 肩越し・一人称: 照準(画面のまん中)の近くの敵に 吸いつく(ボス優先)。押している間は 視点も少し引っぱる
      want = Engine.lookYaw;
      const t2 = this._crossAssist(px, pz, w);
      this.target = t2;
      this._aoeE = null;            // 照準のある所に撃つ(かたまり狙いはしない)
      if (t2) {
        want = Math.atan2(t2.x - px, -(t2.z - pz));
        if (input.fire) {
          const k = Math.min(1, dt * (t2.boss ? 7 : 5));
          Engine.look(angleDiff(Engine.lookYaw, want) * k * 0.6, 0);
        }
      }
      this.aimAngle = want;
      player.aimDir.set(Math.sin(want), 0, -Math.cos(want));
      return;
    }
    if (tgt) want = Math.atan2(tgt.x - px, -(tgt.z - pz));
    else if (ml > 0.2) want = Math.atan2(mx, -mz);
    this.aimAngle = dampAngle(this.aimAngle, want, tgt ? 22 : 12, dt);
    player.aimDir.set(Math.sin(this.aimAngle), 0, -Math.cos(this.aimAngle));
  },

  // 照準の近くの敵(画面の上での距離で選ぶ)。crossTarget(照準の真下の敵)も ここで決める
  _crossAssist(px, pz, w) {
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, mn = Math.min(W, H);
    const cone = mn * 0.13, cam = Engine.camera;
    const focal = H / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const vx = Engine.viewDir.x, vz = Engine.viewDir.z;
    const range = Math.max(18, Math.min(70, w.range || 40));
    const list = Zombies.list;
    let best = null, bs = 1e9, cross = null, cs = 1e9;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const dx = e.x - px, dz = e.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > range * range) continue;
      const d = Math.sqrt(d2) || 0.01;
      if ((dx * vx + dz * vz) < d * 0.55) continue;      // 前にいる敵だけ
      const sc = (e.def && e.def.scale) || 1;
      const p = Engine.project(e.x, (1.1 + (e.boss ? 0.6 : 0)) * sc + (e.y || 0), e.z, _sp);
      if (!p) continue;
      const ds = Math.hypot(p.x - cx, p.y - cy);
      // 照準の真下か(敵の見かけの大きさ)
      const depth = Math.max(0.5, d + (Engine.viewMode === 'tps' ? 4 : 0));
      const rad = Math.max(12, (e.r * 1.4 + (e.boss ? 0.8 : 0)) * sc * focal / depth);
      if (ds < rad && d < cs) { cs = d; cross = e; }
      const lim = e.boss ? cone * 1.7 : cone;
      if (ds > lim) continue;
      const score = ds / cone + d * 0.012 - (e.boss ? 0.8 : 0) + (e === this.target ? -0.25 : 0);
      if (score < bs && World.segmentHit(px, pz, e.x, e.z, LOW) >= 0.97) { bs = score; best = e; }
    }
    this.crossTarget = cross || best;
    return best;
  },

  // 狙う地点: 敵のかたまり > 狙っている敵 > (肩越し・一人称)目線が地面に当たる所 > 前に def m
  _aimPoint(w, player, dx, dz, def, minD, maxD) {
    const px = player.pos.x, pz = player.pos.z;
    const t = this._aoeE || this.target;
    let d = def, ux = dx, uz = dz;
    if (t) { const ex = t.x - px, ez = t.z - pz; d = Math.hypot(ex, ez) || 1; if (!this.close) { ux = ex / d; uz = ez / d; } }
    else if (this.close) {
      const pit = Engine.lookPitch, cy = Engine.camera.position.y;
      d = pit < -0.03 ? cy / Math.tan(-pit) + (Engine.viewMode === 'tps' ? -3.5 : 0) : def + pit * 60;
    }
    d = Math.max(minD, Math.min(maxD, d));
    // 壁の手前まで
    const wt = World.segmentHit(px, pz, px + ux * d, pz + uz * d, LOW);
    if (wt < 1) d = Math.max(1.5, d * wt - 0.6);
    _pt.x = px + ux * d; _pt.z = pz + uz * d; _pt.d = d;
    return _pt;
  },

  // 一人称・肩越し: 照準の線が この距離のときの高さ(弾の光の線の終わり)
  _rayY(dist) {
    if (!this.close) return 1.2;
    const cam = Engine.camera.position;
    const back = Engine.viewMode === 'tps' ? 4 : 0;
    return Math.max(0.05, Math.min(4, cam.y + Math.tan(Engine.lookPitch) * (dist + back)));
  },
  // 下を向いているとき、弾が地面に当たるまでの距離(上を向いているときは そのまま)
  _groundRange(range) {
    if (!this.close || this.target || Engine.lookPitch > -0.04) return range;
    const back = Engine.viewMode === 'tps' ? 4 : 0;
    return Math.max(3, Math.min(range, Engine.camera.position.y / Math.tan(-Engine.lookPitch) - back));
  },

  // 候補の中で、まわりに いちばん敵が多いもの
  _bestCluster(n, px, pz, w) {
    let best = null, bs = -1e9;
    for (let i = 0; i < n; i++) {
      const e = _cand[i];
      const dd = Math.hypot(e.x - px, e.z - pz);
      if (dd < 3.5 || !(e.boss || inView(e))) continue;
      if (World.segmentHit(px, pz, e.x, e.z, LOW) < 0.98) continue;
      const c = Zombies.queryCircle(e.x, e.z, (w.radius || 5) * 0.8, _near).length;
      const sc = c * 2 - dd * 0.1 + (e.boss ? 10 : 0);
      if (c >= 3 && sc > bs) { bs = sc; best = e; }
    }
    _near.length = 0;
    return best;
  },

  // 銃口の位置(二丁拳銃は 左右こうたいに)。手に持った銃の 本当の銃口(weapon-models.js の tips)から出す
  _muzzle(player, w, out) {
    const alt = w.dual ? (this._alt ^= 1) : 0;
    if (Engine.viewMode === 'fps') return VM.muzzleWorld(out, 1.5, alt);
    const mdl = this._models[this.index], tips = mdl && mdl.userData.tips;
    if (tips && player.aiming && mdl.parent && !(player._spin > 0)) {
      mdl.updateWorldMatrix(true, false);
      out.copy(tips[Math.min(alt, tips.length - 1)]).applyMatrix4(mdl.matrixWorld);
      const dx = out.x - player.pos.x, dz = out.z - player.pos.z;
      if (dx * dx + dz * dz < 4 && out.y > 0.6 && out.y < 2.4) return out;
    }
    player.muzzle(out);
    const f = player.facing, fx = Math.sin(f), fz = -Math.cos(f);
    out.x += fx * (w.muz || 0); out.z += fz * (w.muz || 0);
    if (alt) { out.x -= Math.cos(f) * 0.5; out.z -= Math.sin(f) * 0.5; }
    return out;
  },

  _emitFire(w, m, continuous) {
    if (this._evT > 0) return;
    this._evT = continuous ? 0.12 : 0.04;
    Events.emit('fire', { weapon: w, x: m.x, z: m.z, continuous: !!continuous });
  },

  // ================= 1 発撃つ =================
  _fire(w, player) {
    const m = this._muzzle(player, w, _mz);
    const dx = Math.sin(this.aimAngle), dz = -Math.cos(this.aimAngle);
    if (w.fever) w.color = RAINBOW[(this._rb++) % RAINBOW.length];
    this._emitFire(w, m, false);
    switch (w.kind) {
      case 'bullet': this._bullets(w, player, m, dx, dz); break;
      case 'rail': this._rail(w, player, m, dx, dz); break;
      case 'grenade': this._throw(w, player, m, dx, dz, false); break;
      case 'launcher': this._throw(w, player, m, dx, dz, true); break;
      case 'rocket': this._rocket(w, player, m, dx, dz); break;
      case 'missile': this._missiles(w, player, m, dx, dz); break;
      case 'lightning': this._lightning(w, player, m, dx, dz); break;
      case 'plasma': this._plasma(w, player, m, dx, dz); break;
      case 'blackhole': this._blackhole(w, player, m, dx, dz); break;
      default: if (Extra.fire(this, w, player, m, dx, dz) === false) return;
    }
    player.recoil(w.recoil);
    if (w.shake) Engine.shake(w.shake);
    if (Engine.viewMode === 'fps') {
      VM.kick(w.recoil * 0.9);
      if (w.kind !== 'hammer' && w.kind !== 'emp' && w.kind !== 'drone' && w.kind !== 'airstrike' && w.kind !== 'meteor')
        VM.muzzleFlash(w.color, w.flash || (w.recoil > 0.8 ? 2 : 1));
    }
  },

  // 弾(マシンガン・ショットガン・スナイパーなど): すぐ当たる。敵をつらぬく(pierce)。壁で止まる
  _bullets(w, player, m, dx0, dz0) {
    const px = player.pos.x, pz = player.pos.z;
    const n = w.pellets + (w.fever && w.pellets === 1 ? 2 : 0);   // フィーバー: 左右にも 1 発ずつ
    const R0 = this._groundRange(w.range), fps = Engine.viewMode === 'fps';
    for (let i = 0; i < n; i++) {
      const side = w.pellets === 1 && i > 0 ? (i === 1 ? -0.07 : 0.07) : 0;
      const a = this.aimAngle + side + (rnd() - 0.5) * 2 * w.spread;
      const dx = Math.sin(a), dz = -Math.cos(a);
      const wt = World.segmentHit(px, pz, px + dx * R0, pz + dz * R0, LOW);
      let range = R0 * wt, wall = wt < 1, ey = -1;
      Zombies.raycast(px, pz, dx, dz, range, _hits);
      let pierced = 0;
      for (let k = 0; k < _hits.length; k++) {
        const h = _hits[k], e = h.e;
        if (!e.alive) continue;
        const crit = !!w.crit && rnd() < w.crit;
        const sc = (e.def && e.def.scale) || 1;
        hurt(e, w.dmg * (crit ? 2.5 : 1) * (pierced ? 0.85 : 1), dx, dz, w.force, w.id, crit);
        FX.blood(e.x - dx * 0.3, 1.2 * sc, e.z - dz * 0.3, dx, dz, w.pellets > 1 ? 0.35 : crit ? 1 : 0.55);
        FX.spark(e.x - dx * 0.45, 1.25 * sc, e.z - dz * 0.45, 0, 0, 0, 0.06, crit ? 0.6 : 0.35, 0xffffff, 3, w.color, 2, 0, 0, 0, 0);
        if (++pierced >= w.pierce) { range = h.t; wall = false; ey = 1.15 * sc + (e.y || 0); break; }
      }
      _hits.length = 0;
      const ex = px + dx * range, ez = pz + dz * range;
      if (ey < 0) ey = this.close ? this._rayY(range) : 1.2;
      const tw = (w.tracerW || (w.pellets > 1 ? 0.05 : 0.075)) * (w.fever ? 1.6 : 1) * (fps ? 0.7 : 1);
      FX.tracer(m.x, m.y, m.z, ex, ey, ez, w.color, 0.06, tw);
      if (wall) {
        FX.impact(ex - dx * 0.05, ey, ez - dz * 0.05, dx, dz, w.color);
        if (World.damage) World.damage(ex, ez, 0.4, w.dmg, { cause: w.id });
      } else if (this.close && range < R0 - 0.1 && pierced === 0) {
        FX.impact(ex, 0.08, ez, dx, dz, w.color);          // 下を向いて撃った: 地面に当たる
      } else if (this.close && R0 < w.range && pierced === 0) {
        FX.impact(ex, 0.08, ez, dx, dz, w.color);
      }
    }
    FX.muzzle(m.x, m.y, m.z, dx0, dz0, w.color, w.flash || 1);
    if (w.casing) {
      if (fps) { const rx = -dz0, rz = dx0; FX.casing(m.x - dx0 * 0.6 + rx * 0.1, m.y + 0.05, m.z - dz0 * 0.6 + rz * 0.1, dx0, dz0, w.casing); }
      else FX.casing(m.x - dx0 * (w.muz + 0.45), m.y + 0.05, m.z - dz0 * (w.muz + 0.45), dx0, dz0, w.casing);
    }
    if (w.pellets > 1 || w.id === 'sniper') {
      for (let k = 0; k < 2; k++) FX.smoke(m.x + dx0 * 0.5, m.y, m.z + dz0 * 0.5, 0.3, 0.7, 0xa09a92, dx0 * (3 + k * 2), 0.5, dz0 * (3 + k * 2), 0.45);
    }
  },

  // レールガン: 一直線の敵を ぜんぶ つらぬく太い光
  _rail(w, player, m, dx, dz) {
    const px = player.pos.x, pz = player.pos.z;
    const wt = World.segmentHit(px, pz, px + dx * w.range, pz + dz * w.range, LOW);
    const range = w.range * wt;
    const st = ++_stamp;
    let kills = 0;
    for (let o = -1; o <= 1; o++) {
      const ox = px - dz * o * 0.65, oz = pz + dx * o * 0.65;
      Zombies.raycast(ox, oz, dx, dz, range, _hits);
      for (let k = 0; k < _hits.length; k++) {
        const e = _hits[k].e;
        if (!e.alive || e._rs === st) continue;
        e._rs = st;
        if (hurt(e, w.dmg, dx, dz, w.force, 'rail', true)) kills++;
        FX.blood(e.x, 1.2, e.z, dx, dz, 1.2);
        FX.spark(e.x, 1.2, e.z, 0, 0, 0, 0.12, 0.8, 0xbfe6ff, 4, w.color, 2, 0, 0, 0, 0);
      }
      _hits.length = 0;
    }
    const ex = px + dx * range, ez = pz + dz * range;
    FX.beam(m.x, m.y, m.z, ex, 1.2, ez, w.color, 0.75, 0.5, 3);
    FX.beam(m.x, m.y, m.z, ex, 1.2, ez, 0xd8f0ff, 0.2, 0.32, 6);
    // まわりを回る光の粒
    const steps = Math.round(Math.min(70, range * 1.4) * FX.quality);
    const nx = -dz, nz = dx;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, L = t * range, a = L * 2.2;
      const c = Math.cos(a) * 0.4, s = Math.sin(a) * 0.4;
      const x = m.x + (ex - m.x) * t + nx * c, y = m.y + (1.2 - m.y) * t + s, z = m.z + (ez - m.z) * t + nz * c;
      FX.spark(x, y, z, nx * c * 4, s * 4, nz * c * 4, 0.4 + rnd() * 0.3, 0.07, 0x9ad8ff, 5, 0x2a60ff, 2, 0, 0, 1.5, 0);
    }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0x9ad8ff, 2.2);
    FX.ring(m.x, m.z, 0.2, 3, 0.3, 0x80c8ff, 0.3, 4, 1, 0, m.y - 0.2);
    if (wt < 1) { FX.impact(ex - dx * 0.1, 1.2, ez - dz * 0.1, dx, dz, 0xbfe6ff); FX.flash(ex - dx * 0.5, 2.5, ez - dz * 0.5, 0x80c0ff, 40, 10, 0.25); if (World.damage) World.damage(ex, ez, 1.2, w.dmg, { cause: 'rail' }); }
    FX.flash(m.x, 2.8, m.z, 0x80c0ff, 50, 14, 0.25);
    if (kills >= 4) Engine.hitStop(0.045);
  },

  // 手榴弾(山なりに投げる・はねて爆発)/ グレネードランチャー(低い山なり・当たって爆発)
  _throw(w, player, m, dx, dz, impact) {
    const px = player.pos.x, pz = player.pos.z;
    const pt = this._aimPoint(w, player, dx, dz, 14, 4, w.range);
    const dc = pt.d;
    const tx = pt.x + (rnd() - 0.5) * 2.4, tz = pt.z + (rnd() - 0.5) * 2.4;
    const f = player.facing, fps = Engine.viewMode === 'fps';
    const sx = impact || fps ? m.x : px + Math.cos(f) * 0.4, sy = impact || fps ? m.y : 1.9, sz = impact || fps ? m.z : pz + Math.sin(f) * 0.4;
    const T = impact ? 0.2 + dc * 0.016 : 0.48 + dc * 0.02;
    const vx = (tx - sx) / T, vz = (tz - sz) / T, vy = (0.13 - sy + 0.5 * GRAV * T * T) / T;
    const p = Proj.spawn(impact ? 'launcher' : 'grenade', w, sx, sy, sz, vx, vy, vz, px, pz);
    if (p && !impact) p.fuse = T + 0.22 + rnd() * 0.2;
    if (impact) {
      FX.muzzle(m.x, m.y, m.z, dx, dz, 0xffb060, 1.5);
      FX.smoke(m.x, m.y, m.z, 0.35, 0.8, 0xa09a92, dx * 3, 1, dz * 3, 0.5);
    }
  },

  // ロケット
  _rocket(w, player, m, dx, dz) {
    const px = player.pos.x, pz = player.pos.z;
    if (w.spread) { const a = this.aimAngle + (rnd() - 0.5) * 2 * w.spread; dx = Math.sin(a); dz = -Math.cos(a); }
    const p = Proj.spawn('rocket', w, m.x, m.y + (w.small ? 0 : 0.1), m.z, dx * 22, 0, dz * 22, px, pz);
    if (p) { p.tx = dx; p.tz = dz; p.spd = 22; if (this.close && !this.target) p.slope = Math.max(-0.5, Math.min(0.1, Math.tan(Engine.lookPitch))); }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xffa050, w.small ? 1.1 : 2);
    if (w.small) { FX.smoke(px - dx * 0.9, 1.5, pz - dz * 0.9, 0.3, 0.7, 0xa8a29a, -dx * 6, 0.5, -dz * 6, 0.45); return; }
    // 後ろへの噴射(バックブラスト)
    for (let k = 0; k < 4; k++) FX.smoke(px - dx * 0.9, 1.5, pz - dz * 0.9, 0.45, 0.9 + rnd() * 0.4, 0xa8a29a, -dx * (5 + rnd() * 5) + (rnd() - 0.5) * 2, 0.6, -dz * (5 + rnd() * 5) + (rnd() - 0.5) * 2, 0.55);
    FX.flame(px - dx * 0.7, 1.5, pz - dz * 0.7, -dx * 9, 0, -dz * 9, 0.5, 0.18);
  },

  // マイクロミサイル: 一度に何発も。それぞれ ちがう敵を追う
  _missiles(w, player, m, dx, dz) {
    const px = player.pos.x, pz = player.pos.z;
    Zombies.queryCircle(px, pz, w.range, _list);
    // 前にいる敵だけ残す
    let n = 0;
    for (let i = 0; i < _list.length; i++) { const e = _list[i]; const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez) || 1; if ((ex * dx + ez * dz) / d > -0.2) _list[n++] = e; }
    _list.length = n;
    for (let i = 0; i < w.salvo; i++) {
      let e = n ? _list[Math.floor(rnd() * Math.min(n, 40))] : null;
      if (i === 0 && this.target) e = this.target;
      if (e && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.98) e = null;
      const a = this.aimAngle + (i - (w.salvo - 1) / 2) * 0.38 + (rnd() - 0.5) * 0.2;
      const sp = 13 + rnd() * 4;
      const p = Proj.spawn('missile', w, m.x, m.y + 0.15, m.z, Math.sin(a) * sp, 6 + rnd() * 4, -Math.cos(a) * sp, px, pz);
      if (!p) break;
      p.target = e; p.tx = e ? e.x : px + Math.sin(a) * 20; p.tz = e ? e.z : pz - Math.cos(a) * 20;
    }
    _list.length = 0;
    FX.muzzle(m.x, m.y + 0.1, m.z, dx, dz, 0xffb060, 1.2);
  },

  // 電撃: 敵から敵へ 稲妻がとびうつる
  _lightning(w, player, m, dx, dz) {
    const px = player.pos.x, pz = player.pos.z;
    let e = this.target;
    if (e && Math.hypot(e.x - px, e.z - pz) > w.range) e = null;
    if (!e) { e = Zombies.nearest(px, pz, w.range, dx, dz, 0.5); if (e && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.98) e = null; }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0x9ad4ff, 1.1, false);
    if (!e) {
      const L = 5 + rnd() * 6, a = this.aimAngle + (rnd() - 0.5) * 0.7;
      const t = World.segmentHit(px, pz, px + Math.sin(a) * L, pz - Math.cos(a) * L);
      const ex = px + Math.sin(a) * L * t, ez = pz - Math.cos(a) * L * t;
      FX.bolt(m.x, m.y, m.z, ex, 0.15, ez, 0x8ccfff, 0.1, 0.1, 0.6, 6);
      for (let k = 0; k < 6; k++) FX.spark(ex, 0.2, ez, (rnd() - 0.5) * 8, 2 + rnd() * 4, (rnd() - 0.5) * 8, 0.3, 0.05, 0xd0f0ff, 6, 0x4080ff, 2);
      FX.decal(ex, ez, 0.5, 'scorch', 6);
      return;
    }
    const st = ++_stamp;
    let fx = m.x, fy = m.y, fz = m.z, first = e;
    for (let c = 0; c < w.chain && e; c++) {
      e._zap = st;
      FX.bolt(fx, fy, fz, e.x, 1.2, e.z, 0x8ccfff, c ? 0.09 : 0.13, 0.13, c ? 0.45 : 0.6, c ? 5 : 7);
      FX.spark(e.x, 1.2, e.z, 0, 0, 0, 0.1, 0.7, 0xd8f0ff, 4, 0x4a90ff, 2, 0, 0, 0, 0);
      for (let k = 0; k < 3; k++) FX.spark(e.x, 1.2, e.z, (rnd() - 0.5) * 9, rnd() * 5, (rnd() - 0.5) * 9, 0.25, 0.05, 0xd0f0ff, 6, 0x4080ff, 2);
      e.shock = Math.max(e.shock || 0, 0.9);
      e.stun = Math.max(e.stun || 0, 0.25);
      const ddx = e.x - fx, ddz = e.z - fz, dd = Math.hypot(ddx, ddz) || 1;
      hurt(e, w.dmg, ddx / dd, ddz / dd, w.force, 'lightning');
      fx = e.x; fy = 1.2; fz = e.z;
      // 次の敵
      Zombies.queryCircle(fx, fz, w.chainRange, _near);
      let nb = null, nd = 1e9;
      for (let k = 0; k < _near.length; k++) {
        const o = _near[k];
        if (o._zap === st || !o.alive) continue;
        const d2 = (o.x - fx) ** 2 + (o.z - fz) ** 2;
        if (d2 < nd && World.segmentHit(fx, fz, o.x, o.z, LOW) >= 0.98) { nd = d2; nb = o; }
      }
      _near.length = 0;
      e = nb;
    }
    FX.flash(first.x, 2.8, first.z, 0x80c0ff, 35, 12, 0.12);
  },

  // プラズマ砲
  _plasma(w, player, m, dx, dz) {
    const p = Proj.spawn('plasma', w, m.x, m.y, m.z, dx * 34, 0, dz * 34, player.pos.x, player.pos.z);
    if (p) p.spd = 34;
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xb090ff, 1.5);
    FX.ring(m.x, m.z, 0.1, 1.5, 0.2, 0xa080ff, 0.2, 3, 1, 0, m.y);
  },

  // ブラックホール弾(同時に 4 つまで)
  _blackhole(w, player, m, dx, dz) {
    if (Proj.count('blackhole') >= 4) return;
    const px = player.pos.x, pz = player.pos.z;
    const t = this._aoeE || this.target;
    let tx = t ? t.x : px + dx * 14, tz = t ? t.z : pz + dz * 14;
    const ddx = tx - px, ddz = tz - pz, d = Math.hypot(ddx, ddz) || 1, dc = Math.max(7, Math.min(w.range, d));
    tx = px + (ddx / d) * dc; tz = pz + (ddz / d) * dc;
    const p = Proj.spawn('blackhole', w, m.x, 1.5, m.z, dx * 20, 0, dz * 20, px, pz);
    if (p) { p.tx = tx; p.tz = tz; p.y = 1.5; }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xb070ff, 1.6);
  },

  // ================= 押しつづける武器(炎・冷凍・レーザー) =================
  _stream(w, dt, player) {
    const m = this._muzzle(player, w, _mz);
    const dx = Math.sin(this.aimAngle), dz = -Math.cos(this.aimAngle);
    this._tick -= dt;
    const tick = this._tick <= 0;
    if (tick) this._tick = Math.max(this._tick + 1 / w.rate, 0.02);
    this._emitFire(w, m, true);
    player.recoil(w.recoil);
    if (w.shake) Engine.shake(w.shake);
    if (Engine.viewMode === 'fps') { VM.kick(w.recoil * 0.6); if (w.kind === 'laser' || w.kind === 'flame' || w.kind === 'freeze') VM.muzzleFlash(w.color, 0.5); }
    if (w.kind === 'laser') this._laser(w, m, dx, dz, player, tick);
    else if (w.kind === 'chainsaw' || w.kind === 'orbital') Extra.stream(this, w, dt, player, m, dx, dz, tick);
    else this._spray(w, m, dx, dz, player, tick);
  },

  // 火炎放射器 / 冷凍銃: 扇の形に ふきつける
  _spray(w, m, dx, dz, player, tick) {
    const px = player.pos.x, pz = player.pos.z, ice = w.kind === 'freeze';
    const wt = World.segmentHit(px, pz, px + dx * w.range, pz + dz * w.range, LOW);
    const reach = Math.max(1.5, w.range * wt);
    const n = FX.q(ice ? 4 : 5);
    for (let i = 0; i < n; i++) {
      const a = this.aimAngle + (rnd() - 0.5) * 0.34, sp = 17 + rnd() * 7;
      const vx = Math.sin(a) * sp + player.vel.x * 0.6, vz = -Math.cos(a) * sp + player.vel.z * 0.6, vy = (rnd() - 0.35) * 1.6;
      const life = Math.min(0.62 + rnd() * 0.15, (reach + 0.6) / sp * 1.9);
      if (ice) {
        FX.flame(m.x, m.y, m.z, vx, vy, vz, 0.24, life, 0xe0f6ff, 0x4a90d0, 1.4);
        if (rnd() < 0.5) FX.spark(m.x, m.y, m.z, vx * 0.9, vy + 0.5, vz * 0.9, life * 0.9, 0.05, 0xe8faff, 4, 0x80c0ff, 2, 0, 0, 1.6, 0);
      } else {
        FX.flame(m.x, m.y, m.z, vx, vy, vz, 0.3, life);
        if (rnd() < 0.35) FX.ember(m.x, m.y, m.z, vx * 0.95, vy + 0.6, vz * 0.95, 0.14, life * 0.9);
      }
    }
    FX.glow(m.x + dx * 0.25, m.y, m.z + dz * 0.25, 0.45, ice ? 0xbfefff : 0xffc070, 4);
    FX.muzzleLight(m.x + dx * 2, m.y + 0.3, m.z + dz * 2, ice ? 0x80c8ff : 0xff7a30, 9 + rnd() * 5);
    if (!ice && rnd() < 0.35 * FX.quality + 0.1) {
      const k = reach * (0.6 + rnd() * 0.4);
      FX.smoke(px + dx * k, 1.4, pz + dz * k, 0.55, 1.4, 0x2e2a28, dx * 2, 1.8, dz * 2, 0.5);
    }
    if (this._decT <= 0) {
      this._decT = ice ? 0.4 : 0.25;
      const k = reach * (0.45 + rnd() * 0.5);
      FX.decal(px + dx * k + (rnd() - 0.5), pz + dz * k + (rnd() - 0.5), ice ? 0.6 + rnd() * 0.5 : 0.9 + rnd() * 0.7, ice ? 'ice' : 'scorch', 8);
    }
    if (!tick) return;
    cone(px, pz, dx, dz, reach + 0.8, w.cone, _list);
    for (let i = 0; i < _list.length; i++) {
      const e = _list[i];
      const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez) || 1;
      if (ice) {
        e.frozen = Math.max(e.frozen || 0, w.freeze);
        e.stun = Math.max(e.stun || 0, 0.35);
        e.burn = 0;
        hurt(e, w.dmg, ex / d, ez / d, w.force, 'freeze');
        if (rnd() < 0.5) FX.spark(e.x, 0.8 + rnd(), e.z, (rnd() - 0.5) * 3, 2, (rnd() - 0.5) * 3, 0.4, 0.06, 0xe8faff, 5, 0x60b0ff, 2, 0.02, 4, 1, 1);
      } else {
        e.burn = Math.max(e.burn || 0, w.burn);
        e.burnDps = Math.max(e.burnDps || 0, w.burnDps);
        e.frozen = 0;
        hurt(e, w.dmg, ex / d, ez / d, w.force, 'fire');
        if (rnd() < 0.6) FX.flame(e.x + (rnd() - 0.5) * 0.5, 0.6 + rnd(), e.z + (rnd() - 0.5) * 0.5, 0, 2.5, 0, 0.3, 0.45);
      }
    }
    _list.length = 0;
  },

  // レーザー: 押している間 太い光が のびて、線の上の敵を ぜんぶ焼く
  _laser(w, m, dx, dz, player, tick) {
    const px = player.pos.x, pz = player.pos.z;
    const wt = World.segmentHit(px, pz, px + dx * w.range, pz + dz * w.range, LOW);
    const reach = w.range * wt;
    const ex = px + dx * reach, ez = pz + dz * reach, ey = this._rayY(reach);
    const fl = 0.9 + rnd() * 0.2, lw = Engine.viewMode === 'fps' ? 0.6 : 1;
    FX.beam(m.x, m.y, m.z, ex, ey, ez, w.color, 0.42 * fl * lw, -1, 2.4);
    FX.beam(m.x, m.y, m.z, ex, ey, ez, 0xff9aa8, 0.12 * lw, -1, 5);
    if (tick && wt < 1 && World.damage) World.damage(ex, ez, 0.6, w.dmg, { cause: 'laser' });
    FX.glow(m.x, m.y, m.z, 0.55 * fl, w.color, 4);
    FX.glow(m.x, m.y, m.z, 0.22, 0xffffff, 4, 2);
    FX.muzzleLight(m.x + dx, m.y + 0.4, m.z + dz, w.color, 8);
    if (wt < 1) {
      FX.glow(ex - dx * 0.1, ey, ez - dz * 0.1, 0.9 * fl, w.color, 3);
      for (let k = 0; k < 2; k++) FX.spark(ex - dx * 0.1, 1.2, ez - dz * 0.1, -dx * 4 + (rnd() - 0.5) * 8, rnd() * 6, -dz * 4 + (rnd() - 0.5) * 8, 0.3, 0.05, 0xffd0a0, 6, 0xff3010, 2);
      if (rnd() < 0.2 * FX.quality) FX.smoke(ex - dx * 0.3, 1.3, ez - dz * 0.3, 0.3, 0.8, 0x4a4442, 0, 1.2, 0, 0.4);
    }
    if (!tick) return;
    Zombies.raycast(px, pz, dx, dz, reach, _hits);
    for (let k = 0; k < _hits.length; k++) {
      const e = _hits[k].e;
      if (!e.alive) continue;
      hurt(e, w.dmg, dx, dz, w.force, 'laser');
      for (let j = 0; j < 2; j++) FX.spark(e.x, 1.2, e.z, (rnd() - 0.5) * 7, rnd() * 5, (rnd() - 0.5) * 7, 0.25, 0.05, 0xffd0a0, 6, 0xff3010, 2);
      FX.blood(e.x, 1.2, e.z, dx, dz, 0.25);
    }
    _hits.length = 0;
  },

  // ================= 剣(近くの敵を自動で斬る) =================
  _sword(dt, player) {
    this._melee -= dt;
    if (this._melee > 0) return;
    const px = player.pos.x, pz = player.pos.z;
    Zombies.queryCircle(px, pz, MELEE_R, _near);
    if (!_near.length) return;
    let best = null, bd = 1e9;
    for (let i = 0; i < _near.length; i++) { const e = _near[i]; const d2 = (e.x - px) ** 2 + (e.z - pz) ** 2; if (d2 < bd) { bd = d2; best = e; } }
    const ang = Math.atan2(best.x - px, -(best.z - pz)), fx = Math.sin(ang), fz = -Math.cos(ang);
    this._melee = MELEE_COOL;
    player.swing();
    this._slashDir = -this._slashDir;
    let kills = 0;
    for (let i = 0; i < _near.length; i++) {
      const e = _near[i];
      const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz) || 0.01;
      if (d > 1.6 + e.r && (dx * fx + dz * fz) / d < -0.3) continue;
      if (d > 1.2 && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.97) continue;
      if (hurt(e, MELEE_DMG, dx / d, dz / d, 16, 'sword')) kills++;
      FX.spark(e.x - dx / d * 0.3, 1.2, e.z - dz / d * 0.3, 0, 0, 0, 0.07, 0.32, 0xd8f4ff, 2, 0x4ab0ff, 1, 0, 0, 0, 0);
      for (let k = 0; k < 3; k++) FX.spark(e.x, 1.2, e.z, dx / d * 6 + (rnd() - 0.5) * 6, 1 + rnd() * 4, dz / d * 6 + (rnd() - 0.5) * 6, 0.25, 0.05, 0xd8f4ff, 6, 0x4ab0ff, 2);
    }
    _near.length = 0;
    FX.slash(px, 1.15, pz, ang, 3.9, 1.7, MELEE_R + 0.6, this.fever ? 0xffc840 : 0x4ab0ff, 0.2, this._slashDir, this._slashDir * 0.2, 1.6, 0.75, 0.25);
    if (Engine.viewMode === 'fps') VM.slash(this._slashDir, this.fever ? 0xffc840 : 0x4ab0ff);
    if (kills >= 3) Engine.hitStop(0.025);
    Engine.shake(0.12);
    Events.emit('melee', { x: px, z: pz, kills });
  },

  // ================= 回転斬り(必殺技) =================
  // まわり約 10m の敵を ぜんぶ斬る。大きな光の輪・衝撃波・がれき・画面ゆれ・一瞬止まる
  spin(player) {
    if (this._spinCool > 0) return false;
    this._spinCool = SPIN_COOL;
    player.spin();
    const px = player.pos.x, pz = player.pos.z;
    const kills = area(px, pz, SPIN_R, SPIN_DMG, 46, 'spin', false, true);
    const R = SPIN_R;
    FX.slash(px, 1.1, pz, 0, Math.PI * 2.05, R * 0.42, R * 0.62, 0x48b8ff, 0.3, 1, 0, 1.0, 1.1, 0.35);
    FX.slash(px, 1.3, pz, Math.PI, Math.PI * 2.05, R * 0.78, R * 1.0, 0x9ad8ff, 0.4, 1, 0.05, 0.9, 1.1, 0.6);
    FX.ring(px, pz, 1, R * 1.2, 0.5, 0x7ac8ff, 0.6, 1.6, 1, 0);
    FX.ring(px, pz, 0.5, R * 0.9, 0.3, 0xffffff, 0.25, 2, 1, 0);
    const g = FX.q(50);
    for (let i = 0; i < g; i++) {
      const a = (i / g) * Math.PI * 2 + rnd() * 0.1, s = 16 + rnd() * 14, r0 = 1.5 + rnd() * 3;
      FX.spark(px + Math.cos(a) * r0, 1 + rnd() * 0.6, pz + Math.sin(a) * r0, Math.cos(a) * s, 1 + rnd() * 3, Math.sin(a) * s, 0.35 + rnd() * 0.25, 0.06, 0xd8f4ff, 2, 0x3a90ff, 1, 0.03, 4, 2.5, 1);
    }
    const dn = FX.q(28);
    for (let i = 0; i < dn; i++) {
      const a = rnd() * Math.PI * 2, s = 10 + rnd() * 8;
      FX.smoke(px + Math.cos(a) * 1.5, 0.3, pz + Math.sin(a) * 1.5, 0.4, 0.8 + rnd() * 0.4, 0x6a6052, Math.cos(a) * s, 0.3 + rnd(), Math.sin(a) * s, 0.45);
    }
    FX.debris(px, 0.3, pz, 16, 10, 0x5a5048, 0.16, 2);
    FX.decal(px, pz, 2.4, 'scorch', 8);
    FX.flash(px, 3.5, pz, 0x80c8ff, 22, 22, 0.35);
    if (Engine.viewMode === 'fps') VM.spin(this.fever ? 0xffc840 : 0x48b8ff);
    if (World.damage) World.damage(px, pz, R, SPIN_DMG * 0.3, { cause: 'spin' });
    Engine.shake(1.1);
    Engine.hitStop(0.09);
    Events.emit('spin', { x: px, z: pz, kills });
    return true;
  },

  _animModel(dt, w) {
    const mdl = this._models[this.index];
    if (!mdl) return;
    const u = mdl.userData;
    if (u.spinner) u.spinner.rotation.z += dt * (1 + this.spinUp * 45);
    if (u.rings) { u.rings[0].rotation.y += dt * 4; u.rings[1].rotation.z += dt * 6; }
    if (u.orb) u.orb.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.15);
    if (u.disc) u.disc.rotation.y += dt * 25;
    if (u.star) u.star.rotation.y += dt * 10;
    if (u.chain) u.chain.position.y = 0.03 + (Math.random() - 0.5) * 0.006;
  },
};
