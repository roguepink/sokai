// ゾンビ係: たくさんのゾンビ(とボス)を出す・動かす・当たり判定・倒れる。
// - 見た目: 部位ごとの InstancedMesh(zombie-render.js / zombie-models.js)、動き: zombie-anim.js
// - 倒れ方・血・ばらばら: zombie-gore.js、道さがし: zombie-flow.js、ボス: boss.js
// 約束(API)は CLAUDE.md のとおり。list / spawn / count / queryCircle / nearest / raycast / damage / damageCircle / TYPES / reset
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Events } from './events.js';
import { Engine } from './engine.js';
import { FX } from './fx.js';
import { Render, P, BIT } from './zombie-render.js';
import { Gore } from './zombie-gore.js';
import { Flow } from './zombie-flow.js';
import { poseAlive } from './zombie-anim.js';
import { OUTFITS, SKINS, HAIR, TILE } from './zombie-models.js';
import { Bosses, BOSS_TYPES } from './boss.js';

const MAX = CONFIG.ZOMBIES.MAX;
const HCELL = 3;          // 近くさがし用の区画(m)
const NB = 4096;          // 区画の入れ物の数

// 種類。hp は「マシンガン(14)で 歩く人が 2 発」くらい。主人公は圧倒的に強い
// anim: walk / run / brute / crawl / bloat、stride: 1m あたりの足の動き
export const TYPES = {
  walker:  { hp: 24, speed: 2.0, r: 0.42, points: 10, scale: 1, color: 0x6f8a5a, anim: 'walk', stride: 5.2, name: 'ゾンビ',
    outfits: ['office', 'tee', 'tee', 'hoodie', 'scrubs', 'police', 'hivis', 'suit', 'tank', 'torn', 'doctor', 'flannel', 'sweater', 'shirtless'] },
  runner:  { hp: 16, speed: 5.4, r: 0.4, points: 15, scale: 0.96, color: 0x8a7a5a, anim: 'run', stride: 3.4, name: '走るゾンビ',
    outfits: ['tee', 'tank', 'hoodie', 'torn', 'shirtless', 'scrubs', 'sweater'] },
  brute:   { hp: 140, speed: 1.7, r: 0.78, points: 50, scale: 1.55, fat: 1.3, color: 0x5a6a4a, anim: 'brute', stride: 3.0, name: '巨漢ゾンビ',
    outfits: ['tank', 'hivis', 'torn', 'flannel', 'shirtless'] },
  crawler: { hp: 14, speed: 1.7, r: 0.45, points: 12, scale: 1, color: 0x6a6a5a, anim: 'crawl', stride: 4.2, name: 'はうゾンビ',
    outfits: ['torn', 'office', 'scrubs', 'tee', 'doctor', 'shirtless'] },
  bloater: { hp: 34, speed: 1.5, r: 0.62, points: 25, scale: 1.12, fat: 1.75, color: 0x8a9a5e, anim: 'bloat', stride: 4.6, name: 'ふくれゾンビ', explode: true,
    outfits: ['bloater'] },
  riot:    { hp: 85, speed: 1.9, r: 0.46, points: 30, scale: 1.05, fat: 1.1, color: 0x1c1d22, anim: 'walk', stride: 4.8, name: '機動隊ゾンビ', helmet: true,
    outfits: ['riot'] },
  ...BOSS_TYPES,
};

export const Zombies = {
  list: [],               // 生きている敵 {id,type,def,x,z,vx,vz,hp,maxHp,r,alive,boss,t,...}
  _id: 0,
  _hHead: new Int32Array(NB), _hNext: new Int32Array(MAX + 64), _hEnt: new Array(MAX + 64), _hCx: new Int32Array(MAX + 64), _hCz: new Int32Array(MAX + 64),
  _stamp: 0,
  _pending: [],           // 爆発待ちのふくれゾンビ
  _atkCool: 0,
  _drawn: 0, _lastDrawn: 0, _noDraw: 0,
  _px: 0, _pz: 0,

  init(scene) {
    Render.init(scene);
    Gore.init(scene);
    Bosses.init(scene, this);
    for (let i = 0; i < 48; i++) this._pending.push({ on: false, x: 0, z: 0, t: 0, s: 1 });
    // 描画の直前に 体の位置を書きこむ(1 フレームに 1 回だけ)
    const prev = scene.onBeforeRender;
    const self = this;
    scene.onBeforeRender = function (r, s, c, t) {
      if (prev) prev.call(this, r, s, c, t);
      self._drawFrame();
    };
    this._hHead.fill(-1);
  },

  _drawFrame() {
    this._drawn++;
    try { Render.draw(); Gore.draw(); Bosses.draw(); } catch (e) { console.error(e); }
  },

  reset() {
    for (const e of this.list) { e.alive = false; if (e.boss) Bosses.remove(e); }
    this.list.length = 0;
    this._hHead.fill(-1);
    Render.reset(); Gore.reset(); Flow.reset(); Bosses.reset();
    for (const p of this._pending) p.on = false;
  },

  count() { return this.list.length; },

  spawn(type, x, z) {
    if (this.list.length >= MAX) return null;
    const def = TYPES[type] || TYPES.walker;
    if (!TYPES[type]) type = 'walker';
    const e = {
      id: ++this._id, type, def, x, z, vx: 0, vz: 0, y: 0,
      hp: def.hp, maxHp: def.hp, r: def.r, alive: true, boss: !!def.boss, name: def.name,
      t: Math.random() * 10, kx: 0, kz: 0, stun: 0, flash: 0,
      frozen: 0, burn: 0, burnDps: 0, shock: 0, _burnAcc: 0,
      face: Math.atan2(-x, z), ph: Math.random() * 6.28, spd: 0, dist: 99,
      atk: 0, atkArm: 0, atkT: 0.5 + Math.random(), flinch: 0, flinchSide: 0,
      reachL: Math.random() < 0.55 ? 1 : 0, reachR: 0, limp: Math.random() < 0.5 ? Math.random() : 0,
      hunch: Math.random(), tilt: (Math.random() - 0.5) * 2, seed: Math.random() * 100,
      spdMul: 0.85 + Math.random() * 0.3, los: false, losT: Math.random() * 0.4, rise: 0,
      _B: null,
    };
    e.reachR = e.reachL && Math.random() < 0.7 ? 1 : Math.random() < 0.3 ? 1 : 0;
    if (def.boss) {
      Bosses.spawn(e);
      Events.emit('bossSpawn', { name: e.name, x, z, e });
    } else {
      const B = Render.alloc();
      if (!B) return null;
      B.mode = 1; B.e = e; e._B = B;
      dress(B, def);
      if (def.anim === 'crawl' && Math.random() < 0.6) B.hide |= BIT(P.LLL) | BIT(P.LLR);   // 脚がない
    }
    this.list.push(e);
    return e;
  },

  // ---------- 毎ステップ ----------
  update(dt, player) {
    const px = player.pos.x, pz = player.pos.z, pr = player.radius;
    this._px = px; this._pz = pz;
    Flow.update(dt, px, pz);
    Gore.px = px; Gore.pz = pz;
    this._rebuildHash();
    this._atkCool -= dt;
    // ふくれゾンビの連鎖爆発(少しずつずらして)
    for (const p of this._pending) if (p.on && (p.t -= dt) <= 0) { p.on = false; this._bloaterBlast(p.x, p.z, p.s); }

    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      if (i >= list.length) continue;
      const e = list[i];
      if (!e.alive) continue;
      if (e.boss) { this._status(e, dt); if (e.alive) Bosses.update(dt, e, player); continue; }
      this._status(e, dt);
      if (!e.alive) continue;
      this._move(e, dt, px, pz, pr);
    }
    Gore.update(dt, px, pz);
    Bosses.step(dt);
    // 描画が呼ばれていない(念のため): ここで描く
    if (this._drawn === this._lastDrawn) { if (++this._noDraw > 20) this._drawFrame(); }
    else { this._noDraw = 0; this._lastDrawn = this._drawn; }
  },

  // 状態(当たった光・凍る・燃える・しびれ)
  _status(e, dt) {
    e.flash = Math.max(0, e.flash - dt * 9);
    e.flinch = Math.max(0, e.flinch - dt * 5);
    const B = e._B;
    let glow = 0;
    if (e.frozen > 0) e.frozen -= dt;
    if (e.shock > 0) { e.shock -= dt; glow = Math.random() < 0.5 ? -(0.15 + Math.random() * 0.5) : 0; }
    if (e.burn > 0) {
      e.burn -= dt;
      e._burnAcc += dt;
      glow = 0.3 + 0.25 * Math.sin(e.t * 25);
      if (Math.random() < dt * (e.boss ? 20 : 8)) {
        const s = e.def.scale;
        FX.burst({ x: e.x + (Math.random() - 0.5) * 0.5 * s, y: (0.6 + Math.random() * 0.9) * s, z: e.z + (Math.random() - 0.5) * 0.5 * s,
          count: 2, color: Math.random() < 0.5 ? 0xff6a10 : 0xffb030, speed: 0.6, up: 3, life: 0.45, size: 0.2 * s, grav: -4, drag: 2 });
      }
      if (e._burnAcc >= 0.25 || e.burn <= 0) {
        const amt = (e.burnDps || 10) * e._burnAcc; e._burnAcc = 0;
        if (this.damage(e, amt, { cause: 'fire', force: 0 })) return;
      }
    }
    if (B) {
      B.fx[0] = e.flash;
      B.fx[1] = e.frozen > 0 ? Math.min(1, B.fx[1] + dt * 8) : Math.max(0, B.fx[1] - dt * 2);
      B.fx[2] = e.burn > 0 ? Math.min(0.6, B.fx[2] + dt * 0.3) : B.fx[2];
      B.fx[3] = glow;
    }
  },

  _move(e, dt, px, pz, pr) {
    const def = e.def, frozen = e.frozen > 0;
    // ふっとび(ノックバック)
    if (e.kx || e.kz) {
      e.x += e.kx * dt; e.z += e.kz * dt;
      const k = Math.exp(-7 * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) e.kx = e.kz = 0;
    }
    let dx = px - e.x, dz = pz - e.z;
    const d = Math.hypot(dx, dz) || 0.001;
    e.dist = d;
    // 遠すぎるゾンビは消す(出現係が近くに出しなおす)
    if (d > 125) { this._remove(e); return; }
    if (frozen) { this._separate(e); World.collideCircle(e, e.r); return; }
    e.t += dt;
    if (e.rise > 0) e.rise = Math.max(0, e.rise - dt * 0.7);
    if (e.stun > 0) e.stun -= dt;
    // 進む向き: 近い・見通せる → まっすぐ、それ以外 → 道さがし
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.35 + Math.random() * 0.3; e.los = d < 45 && Flow.clear(e.x, e.z, px, pz); }
    let mx = dx / d, mz = dz / d;
    if (!(d < 5 || e.los) && Flow.dir(e.x, e.z, _dir)) { mx = _dir.x; mz = _dir.z; }
    // 速さ
    const contact = e.r + pr + 0.25;
    let sp = def.speed * e.spdMul;
    if (def.anim === 'walk' || def.anim === 'bloat') sp *= 0.65 + 0.5 * Math.abs(Math.sin(e.ph));   // よろよろ
    if (def.anim === 'crawl') sp *= 0.5 + 0.8 * Math.max(0, Math.sin(e.ph * 2));                  // ずるずる
    if (e.stun > 0 || e.rise > 0.25) sp = 0;
    if (e.shock > 0) sp *= 0.25;
    if (e.burn > 0) sp *= 1.25;
    if (e.atk > 0) sp *= 0.2;
    if (d < contact) sp = 0;
    const rate = def.anim === 'run' ? 7 : 4;
    const kk = 1 - Math.exp(-rate * dt);
    e.vx += (mx * sp - e.vx) * kk; e.vz += (mz * sp - e.vz) * kk;
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.spd = Math.hypot(e.vx, e.vz);
    e.ph += dt * e.spd * def.stride / def.scale;
    // 向き
    let want = e.face;
    if (d < 3.5) want = Math.atan2(dx, -dz);
    else if (e.spd > 0.2) want = Math.atan2(e.vx, -e.vz);
    let da = (want - e.face) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    e.face += da * (1 - Math.exp(-(def.anim === 'run' ? 10 : 5) * dt));
    // 仲間どうし重ならない・主人公に押しのけられる
    this._separate(e);
    const ex = e.x - px, ez = e.z - pz, ed = Math.hypot(ex, ez);
    const minD = e.r + pr + 0.05;
    if (ed < minD && ed > 1e-4) { e.x = px + ex / ed * minD; e.z = pz + ez / ed * minD; }
    World.collideCircle(e, e.r);
    // 攻撃(主人公は無傷。見た目と音だけ)
    if (e.atk > 0) e.atk = Math.max(0, e.atk - dt / 0.55);
    if (d < contact + 0.5 && e.stun <= 0 && e.rise <= 0) {
      e.atkT -= dt;
      if (e.atkT <= 0) {
        e.atkT = 1 + Math.random() * 1.2;
        e.atk = 1; e.atkArm ^= 1;
        if (this._atkCool <= 0) { this._atkCool = 0.22; Events.emit('zombieAttack', { x: e.x, z: e.z }); }
      }
    }
  },

  _separate(e) {
    const H = this._hHead, N = this._hNext, E = this._hEnt, HX = this._hCx, HZ = this._hCz;
    const cx = Math.floor(e.x / HCELL), cz = Math.floor(e.z / HCELL);
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox, gz = cz + oz;
      for (let i = H[bucket(gx, gz)]; i >= 0; i = N[i]) {
        if (HX[i] !== gx || HZ[i] !== gz) continue;
        const o = E[i];
        if (o === e || !o.alive) continue;
        const dx = e.x - o.x, dz = e.z - o.z, rr = e.r + o.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * (o.boss ? 1 : 0.5);
          e.x += (dx / d) * push; e.z += (dz / d) * push;
        }
      }
    }
  },

  _rebuildHash() {
    const H = this._hHead, N = this._hNext, E = this._hEnt, HX = this._hCx, HZ = this._hCz;
    H.fill(-1);
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const gx = Math.floor(e.x / HCELL), gz = Math.floor(e.z / HCELL), b = bucket(gx, gz);
      HX[i] = gx; HZ[i] = gz; E[i] = e; N[i] = H[b]; H[b] = i;
    }
  },

  // ---------- 当たり判定(武器係が使う) ----------
  // 円の中の敵を集める
  queryCircle(x, z, r, out = []) {
    out.length = 0;
    const H = this._hHead, N = this._hNext, E = this._hEnt, HX = this._hCx, HZ = this._hCz;
    const pad = 3;   // いちばん大きいボスの半径
    const c0x = Math.floor((x - r - pad) / HCELL), c1x = Math.floor((x + r + pad) / HCELL);
    const c0z = Math.floor((z - r - pad) / HCELL), c1z = Math.floor((z + r + pad) / HCELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      for (let i = H[bucket(cx, cz)]; i >= 0; i = N[i]) {
        if (HX[i] !== cx || HZ[i] !== cz) continue;
        const e = E[i];
        if (!e.alive) continue;
        const dx = e.x - x, dz = e.z - z, rr = r + e.r;
        if (dx * dx + dz * dz <= rr * rr) out.push(e);
      }
    }
    return out;
  },

  // いちばん近い敵(maxDist 以内)。dirX/dirZ を渡すと、その向きの前方(cosMin 以上)だけ
  nearest(x, z, maxDist, dirX = 0, dirZ = 0, cosMin = -2) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.list) {
      if (!e.alive || e.rise > 0.5) continue;
      const dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz;
      if (d2 >= bd) continue;
      if (cosMin > -1.5) { const d = Math.sqrt(d2) || 1; if ((dx * dirX + dz * dirZ) / d < cosMin) continue; }
      bd = d2; best = e;
    }
    return best;
  },

  // 線(弾)に当たる敵を近い順に。{e, t(距離)} の配列
  raycast(x, z, dx, dz, maxDist, out = []) {
    out.length = 0;
    const H = this._hHead, N = this._hNext, E = this._hEnt, HX = this._hCx, HZ = this._hCz;
    const stamp = ++this._stamp;
    const steps = Math.ceil(maxDist / HCELL) + 1;
    for (let s = 0; s <= steps; s++) {
      const px = x + dx * s * HCELL, pz = z + dz * s * HCELL;
      const cx = Math.floor(px / HCELL), cz = Math.floor(pz / HCELL);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gz = cz + oz;
        for (let i = H[bucket(gx, gz)]; i >= 0; i = N[i]) {
          if (HX[i] !== gx || HZ[i] !== gz) continue;
          const e = E[i];
          if (!e.alive || e._ray === stamp) continue;
          e._ray = stamp;
          const ex = e.x - x, ez = e.z - z;
          const t = ex * dx + ez * dz;
          if (t < 0 || t > maxDist) continue;
          const px2 = ex - dx * t, pz2 = ez - dz * t;
          if (px2 * px2 + pz2 * pz2 <= e.r * e.r * 1.4) out.push({ e, t });
        }
      }
    }
    if (out.length > 1) out.sort(byT);
    return out;
  },

  // ダメージ。opts: { dirX, dirZ, force(ふっとび), cause(武器の名前), crit }
  damage(e, amount, opts = _noOpts) {
    if (!e.alive) return false;
    e.hp -= amount;
    e.flash = e.flash > 0.5 ? 0.75 : 1;
    const cause = opts.cause;
    if (cause !== 'fire') { e.flinch = Math.min(1, e.flinch + 0.5 + amount * 0.02); e.flinchSide = Math.random() - 0.5; }
    const sc = e.def.scale;
    const f = (opts.force || 0) / (sc * sc) * (e.boss ? 0.15 : 1);
    if (f) { e.kx += (opts.dirX || 0) * f; e.kz += (opts.dirZ || 0) * f; if (!e.boss) e.stun = Math.max(e.stun, 0.12 + Math.min(0.25, f * 0.02)); }
    if (e.boss) Bosses.hit(e, amount, opts);
    Events.emit('hit', { x: e.x, y: 1.2 * sc, z: e.z, amount, crit: !!opts.crit, boss: e.boss, cause });
    if (e.hp <= 0) { this._kill(e, opts); return true; }
    // 剣・回転斬りは 当たったところから血
    if (cause === 'sword' || cause === 'spin') FX.blood(e.x, 1.2 * sc, e.z, opts.dirX || 0, opts.dirZ || 0, 0.6);
    else if (cause !== 'fire' && Math.random() < 0.07) Gore.splat(e.x + (opts.dirX || 0) * 0.8, e.z + (opts.dirZ || 0) * 0.8, 0.5 + Math.random() * 0.5, opts.dirX || 0, opts.dirZ || 0, 1.5);
    return false;
  },

  // 円の範囲にダメージ(爆発・回転斬り)。倒した数を返す(中で また呼ばれても大丈夫)
  damageCircle(x, z, r, amount, opts = _noOpts) {
    const depth = this._dcDepth = (this._dcDepth || 0) + 1;
    const st = this._dcStack || (this._dcStack = []);
    let slot = st[depth];
    if (!slot) st[depth] = slot = { hits: [], arr: [], o: {} };
    const hits = this.queryCircle(x, z, r, slot.hits);
    const arr = slot.arr, o = slot.o;
    arr.length = 0;
    for (let i = 0; i < hits.length; i++) arr.push(hits[i]);
    let kills = 0;
    try {
      for (let i = 0; i < arr.length; i++) {
        const e = arr[i];
        if (!e.alive) continue;
        const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1;
        const fall = opts.falloff ? Math.max(0.3, 1 - d / r) : 1;
        o.dirX = dx / d; o.dirZ = dz / d; o.force = (opts.force || 0) * fall; o.cause = opts.cause; o.crit = opts.crit;
        if (this.damage(e, amount * fall, o)) kills++;
      }
    } finally {
      arr.length = 0;
      this._dcDepth--;
    }
    return kills;
  },

  _remove(e) {
    e.alive = false;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    if (e._B) { Render.release(e._B); e._B = null; }
    if (e.boss) Bosses.remove(e);
  },

  _kill(e, opts) {
    e.alive = false;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    const cause = opts.cause || '';
    const dirX = opts.dirX || 0, dirZ = opts.dirZ || 0, force = opts.force || 0;
    if (e.boss) {
      Bosses.kill(e, opts);
      Events.emit('bossDeath', { name: e.name, x: e.x, z: e.z, e });
    } else if (e._B) {
      const B = e._B;
      poseAlive(e, B);
      Gore.kill(e, B, opts);
      e._B = null;
      if (e.def.explode) this._queueBlast(e.x, e.z, e.def.scale);
    }
    Events.emit('kill', {
      x: e.x, z: e.z, type: e.type, boss: e.boss, points: e.def.points,
      cause, dirX, dirZ, force, scale: e.def.scale,
    });
  },

  // ふくれゾンビ: 倒すと はじけて まわりのゾンビを巻きこむ(連鎖!)
  _queueBlast(x, z, s) {
    for (const p of this._pending) if (!p.on) { p.on = true; p.x = x; p.z = z; p.s = s; p.t = 0.08 + Math.random() * 0.12; return; }
    this._bloaterBlast(x, z, s);
  },
  _bloaterBlast(x, z, s) {
    const R = 4.8 * s;
    FX.burst({ x, y: 1, z, count: 34, color: 0x9aa830, speed: 10, up: 6, life: 0.7, size: 0.22, drag: 2 });
    FX.burst({ x, y: 1, z, count: 22, color: 0x7a0808, speed: 9, up: 5, life: 0.8, size: 0.13 });
    FX.burst({ x, y: 1, z, count: 16, color: 0x6a7020, speed: 4, up: 2, life: 1, size: 0.22, grav: -0.5, drag: 2.5 });
    Gore.chunks(x, 1, z, 14, 9, 6, 0, 0, 0x5a2a10);
    Gore.chunks(x, 1, z, 8, 8, 5, 0, 0, 0x7a7a20, 0.8);
    Gore.splat(x, z, 3.8, 0, 0, 1, 0x3a4a08, 0.8);
    Gore.splat(x, z, 2.4, 0, 0, 1, 0x4a0303);
    Engine.shake(0.45);
    Events.emit('explosion', { x, z, radius: R, source: 'bloater' });
    this.damageCircle(x, z, R, 120, { force: 18, cause: 'bloater', falloff: true });
  },
};

const _dir = { x: 0, z: 0 };
const _noOpts = {};
const byT = (a, b) => a.t - b.t;
function bucket(gx, gz) { return ((gx * 73856093) ^ (gz * 19349663)) & (NB - 1); }

// ---------- 服を着せる(1 体ずつ ちがう見た目) ----------
const _c = new THREE.Color();
const pick = (a) => a[(Math.random() * a.length) | 0];
function lin(B, p, hex, mul = 1) { _c.setHex(hex); B.cloth[p * 3] = _c.r * mul; B.cloth[p * 3 + 1] = _c.g * mul; B.cloth[p * 3 + 2] = _c.b * mul; }
function dress(B, def) {
  const o = OUTFITS[pick(def.outfits || ['tee'])] || OUTFITS.tee;
  const scaleJ = def.anim === 'run' ? 0.06 : 0.08;
  B.s = def.scale * (1 - scaleJ + Math.random() * scaleJ * 2);
  B.fat = (def.fat || 1) * (0.92 + Math.random() * 0.25);
  if (def.anim === 'run') B.fat = Math.min(B.fat, 1.02);
  B.headS = def.explode ? 1.12 : 1;
  B.helmet = !!def.helmet;
  // 肌
  _c.setHex(pick(o.skins || SKINS));
  const v = 0.88 + Math.random() * 0.24;
  B.skin[0] = _c.r * v; B.skin[1] = _c.g * v; B.skin[2] = _c.b * v;
  // マス
  const torso = Array.isArray(o.torso) ? pick(o.torso) : o.torso;
  const legs = Array.isArray(o.legs[0]) ? pick(o.legs) : o.legs;
  const arms = pick(o.arms);
  const head = pick(o.heads);
  const t = B.tile;
  t[P.PELVIS] = legs[0]; t[P.TORSO] = torso; t[P.HEAD] = head;
  t[P.UAL] = t[P.UAR] = arms[0]; t[P.LAL] = t[P.LAR] = arms[1];
  t[P.ULL] = t[P.ULR] = legs[0]; t[P.LLL] = t[P.LLR] = legs[1];
  t[P.HELMET] = TILE.helmet;
  // 色
  const cloth = pick(o.cloth), cm = 0.85 + Math.random() * 0.25;
  const pants = o.pants === 'cloth' ? cloth : pick(o.pants);
  const sleeve = o.sleeve === 'cloth' ? cloth : o.sleeve;
  lin(B, P.TORSO, cloth, cm);
  for (const p of [P.PELVIS, P.ULL, P.ULR, P.LLL, P.LLR]) lin(B, p, pants, 0.85 + Math.random() * 0.2);
  for (const p of [P.UAL, P.UAR, P.LAL, P.LAR]) lin(B, p, sleeve, cm * (o.sleeveDark ? 0.8 : 1));
  const hair = head === TILE.hHood && o.hoodTint ? cloth : head === TILE.hSurg && o.capTint ? cloth : pick(HAIR);
  lin(B, P.HEAD, hair, 1);
  lin(B, P.HELMET, 0xffffff, 1);
}
