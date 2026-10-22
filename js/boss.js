// キャラ係: ボス(怪獣の大きさ 9〜26m)。1 体ずつ 骨つきの体(材質ごとに 1 つの SkinnedMesh)で、ゾンビと同じ list に入る。
// 種類(各ファイル):
//   boss-classic.js … 巨人タイラント / 処刑人ブッチャー / 異形アボミネーション / 大這い屍クローラー
//   boss-extra.js   … 変異ゴリラ マッドコング / 女王ハイブ クイーン / ゾンビ装甲車 デスローダー
//   boss-giants.js  … ゾンビ巨神 / 鬼 オニ / 首なし騎士 / 合体ゾンビ レギオン
//   boss-beasts.js  … 屍竜 / 大地喰いワーム / 女郎ぐも / メカ屍 / 暴走ゾンビ列車
// しくみ:
//   - 攻撃は いつも 地面の赤い予告(boss-warn.js)のあとに来る。主人公に当たると Player.knock で 吹っとぶ(体力は減らない)
//   - 体力 50% と 20% で 怒る(吠える・光る・速くなる・新しい攻撃)。イベント bossPhase {e, phase, x, z, name}
//   - 倒すと: 巨体が 約 1.5 秒かけて たおれる → 地面に ドーン(イベント bossFall {e,x,z,size})→ はじけ飛ぶ
//   - e.size(だいたいの高さ m)/ e.bossTier(1〜3)を持つ(画面係・音係用)
//   - 見下ろしで 大きいボスが近いときは カメラを少し引く(Engine.setZoom)。主人公の前に来ると 体が すける
// イベント: bossSpawn/bossDeath {name,x,z,e} / bossAct {type, act, x, z, e} / bossPhase / bossFall / heroHit / giantStep
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Flow } from './zombie-flow.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp } from './boss-kit.js';
import { act, roarBlast, step as footStep, quake, line, slam, stepProjectiles, resetProjectiles, initProjectiles, stepWrecks, resetWrecks, BOSS_CAUSES } from './boss-attacks.js';
import { CLASSIC } from './boss-classic.js';
import { stepLater } from './boss-giants.js';
import { EXTRA } from './boss-extra.js';
import { GIANTS } from './boss-giants.js';
import { BEASTS } from './boss-beasts.js';

export { BOSS_CAUSES };
const SPECS = { ...CLASSIC, ...EXTRA, ...GIANTS, ...BEASTS };
export const BOSS_TYPES = {};
for (const k of Object.keys(SPECS)) {
  const d = SPECS[k].def;
  BOSS_TYPES[k] = Object.assign({ boss: true, anim: 'boss', points: 3000, color: 0x6a5a50 }, d);
}
// 出る順番の もと(出現係がまぜる)
export const BOSS_ORDER = ['tyrant', 'oni', 'gorilla', 'butcher', 'spider', 'titan', 'queen', 'mecha', 'abomination', 'dragon', 'tank', 'knight',
  'crawlerKing', 'worm', 'legion', 'train'].filter((k) => SPECS[k]);
for (const k of Object.keys(SPECS)) if (!BOSS_ORDER.includes(k)) BOSS_ORDER.push(k);
export const BOSS_MAX_R = Math.max(...Object.values(BOSS_TYPES).map((d) => d.r || 2));

const PHASE_AT = [0.5, 0.2];
const SPEED_MUL = [1, 1.22, 1.45];
const COOL_MUL = [1, 0.72, 0.5];

export const Bosses = {
  _scene: null, _Z: null, _player: null,
  _pool: {},
  _active: [],
  _compiled: false, _frames: 0, _time: 0,
  _blasts: [],
  _zoom: 1,

  init(scene, Z) {
    this._scene = scene; this._Z = Z;
    Warn.init(scene);
    initProjectiles(scene);
    // 最初の 1 体だけ 先に作る(ほかは 出る前に prepare で作る)
    this.prepare('tyrant');
  },

  reset() {
    for (const m of this._active.slice()) this._free(m);
    this._active.length = 0;
    this._blasts.length = 0;
    resetProjectiles(); resetWrecks();
    Warn.clear(); Warn.upload(0);
    if (this._zoom !== 1) { this._zoom = 1; Engine.setZoom(1); }
  },

  // 前もって形を作っておく(出たときに 固まらないように)
  prepare(type) {
    if (!SPECS[type]) return;
    const L = this._pool[type] || (this._pool[type] = []);
    if (!L.length) L.push(build(type));
  },

  _precompile() {
    this._compiled = true;
    try {
      const g = new THREE.Group();
      for (const t of Object.keys(this._pool)) for (const m of this._pool[t]) { m.root.position.set(0, -80, 0); g.add(m.root); }
      this._scene.add(g);
      Engine.renderer.compile(this._scene, Engine.camera);
      this._scene.remove(g);
      for (const t of Object.keys(this._pool)) for (const m of this._pool[t]) g.remove(m.root);
    } catch (err) { console.warn('boss precompile', err); }
  },

  spawn(e) {
    const type = e.type, spec = SPECS[type];
    let m = (this._pool[type] || []).pop();
    if (!m) m = build(type);
    m.e = e; m.dead = false; m.deadT = 0; m.fell = false; m.burst = false; m.fade = 1;
    m.root.position.set(e.x, 0, e.z);
    m.root.rotation.set(0, -e.face, 0);
    m.tilt.quaternion.identity(); m.tilt.position.set(0, 0, 0); m.tilt.scale.setScalar(m.S);
    for (const me of m.meshes) me.visible = true;
    for (const mt of m.mats) mt.opacity = 1;
    m.root.visible = true;
    this._scene.add(m.root);
    e._M = m;
    const def = e.def;
    e.size = def.size; e.bossTier = def.tier || 1; e.phaseHp = PHASE_AT; e.title = def.title || ''; e.icon = def.icon || '';
    e.state = 'enter'; e.st = 0; e.cool = 1.2; e.ph = 0; e.spd = 0; e.phase = 0; e.rage = 0; e.last = '';
    e.vy = 0; e.y = 0; e.kx = 0; e.kz = 0; e.spawnT = 0; e.lockFace = false; e.n = 0; e.hitDone = 0; e._stepS = 0;
    e.enter = spec.enter || 'rise';
    if (spec.spawn) spec.spawn(this, e, m);
    this._active.push(m);
    if (e.enter === 'rise') e.y = -def.size * 0.95;
    else if (e.enter === 'sky') e.y = 46;
    quake(this, e.x, e.z, 1.2, 120);
    FX.burst({ x: e.x, y: 0.5, z: e.z, count: 50, color: 0x3a3028, speed: 12, up: 6, life: 1.2, size: 0.35, drag: 2 });
    act(e, 'enter');
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
    const spec = SPECS[m.type];
    if (spec.free) spec.free(this, m);
    m.root.parent && m.root.parent.remove(m.root);
    m.e = null;
    (this._pool[m.type] || (this._pool[m.type] = [])).push(m);
  },

  hit(e, amount, opts) {
    const spec = SPECS[e.type];
    if (spec.hit) spec.hit(this, e, e._M, amount, opts);
  },

  // ---------- 毎ステップ(Zombies.update の頭で 1 回) ----------
  pre(dt) { Warn.clear(); this._time += dt; },

  // ---------- 毎ステップ(生きているボス 1 体ぶん) ----------
  update(dt, e, player) {
    const m = e._M;
    if (!m) return;
    this._player = player;
    const spec = SPECS[e.type], def = e.def;
    const px = player.pos.x, pz = player.pos.z;
    let dx = px - e.x, dz = pz - e.z;
    let d = Math.hypot(dx, dz) || 0.001;
    // 遠くへ はなれすぎたら 近くへ もどってくる(戦いが 終わらないように)
    if (d > 110 && e.state === 'walk') {
      const p = World.spawnPoint(px, pz, 40, 55);
      if (p) { e.x = p.x; e.z = p.z; dx = px - e.x; dz = pz - e.z; d = Math.hypot(dx, dz) || 0.001; e.state = 'enter'; e.enter = spec.enter || 'rise'; e.st = 0; if (e.enter === 'rise') e.y = -def.size * 0.95; else if (e.enter === 'sky') e.y = 46; }
    }
    e.dist = d;
    e.t += dt;
    const frozen = e.frozen > 0;
    const slow = frozen ? 0.3 : e.shock > 0 ? 0.6 : 1;
    const sdt = dt * slow;
    // 進む向き(道さがし)
    let mx = dx / d, mz = dz / d, arrive = 1;
    // 見下ろしでは 画面の横(横長の画面)か 上(縦長)に 回りこむ: 巨体が 画面に おさまって よく見える
    if (Engine.viewMode === 'top' && !spec.vehicle && !spec.noStand && d < 40) {
      const wide = innerWidth >= innerHeight;
      let sx, sz;
      if (wide) { const side = e.x >= px ? 1 : -1, hs = e.def.h || e.size; sx = px + side * clamp(4 + hs * 0.38, 8, 14); sz = pz - 1 - hs * 0.1; }
      else { sx = px + clamp(e.x - px, -3, 3); sz = pz - clamp(6 + (e.def.h || e.size) * 0.45, 9, 17); }
      const ox = sx - e.x, oz = sz - e.z, od = Math.hypot(ox, oz) || 0.001;
      mx = ox / od; mz = oz / od; arrive = clamp(od / 4, 0, 1);
    }
    if (!spec.noCollide && d > 12 && !Flow.clear(e.x, e.z, px, pz) && Flow.dir(e.x, e.z, _dir)) { mx = _dir.x; mz = _dir.z; arrive = 1; }
    e.st += sdt;
    e.cool -= sdt;
    // 怒る(体力 50% / 20%)
    const hp = e.hp / e.maxHp;
    if (e.phase < 2 && hp < PHASE_AT[e.phase] && e.state !== 'enter') this._enrage(e, m, spec);
    e.rage = Math.min(1, e.rage + dt * 0.5) * (e.phase > 0 ? 1 : 0);
    const c = _ctx;
    c.d = d; c.mx = mx; c.mz = mz; c.px = px; c.pz = pz; c.dx = dx / d; c.dz = dz / d;
    c.fx = sin(e.face); c.fz = -cos(e.face);
    c.sp = def.speed * SPEED_MUL[e.phase] * slow * (d > 30 ? 1.5 : 1);
    c.cm = COOL_MUL[e.phase];
    c.player = player;
    let sp;
    if (e.state === 'enter') sp = this._enter(e, m, spec, sdt, c);
    else if (e.state === 'roar') sp = this._roar(e, m, spec, sdt, c);
    else sp = spec.ai(this, e, m, sdt, c);
    // 動く
    if (e.kx || e.kz) { e.x += e.kx * dt; e.z += e.kz * dt; const k = Math.exp(-6 * dt); e.kx *= k; e.kz *= k; if (abs(e.kx) + abs(e.kz) < 0.01) e.kx = e.kz = 0; }
    const kk = 1 - Math.exp(-4 * dt);
    if (sp >= 0) { if (e.state === 'walk') sp *= arrive; e.vx += (mx * sp - e.vx) * kk; e.vz += (mz * sp - e.vz) * kk; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.spd = Math.hypot(e.vx, e.vz);
    e.ph += dt * e.spd * (spec.stride || 0.5) * slow;
    // 主人公を押しのけない: ボスが止まる
    if (!spec.passHero) {
      const minD = e.r * (spec.heroGap ?? 0.8) + player.radius;
      if (d < minD) { e.x = px - dx / d * minD; e.z = pz - dz / d * minD; }
    }
    if (!spec.noCollide) World.collideCircle(e, min(e.r * 0.8, spec.collR ?? 2.4));
    if (World.half) { const h = World.half - 3; e.x = clamp(e.x, -h, h); e.z = clamp(e.z, -h, h); }
    // 向き
    if (!e.lockFace && !spec.vehicle) {
      const want = d < 30 ? Math.atan2(dx, -dz) : (e.spd > 0.3 ? Math.atan2(e.vx, -e.vz) : e.face);
      let da = (want - e.face) % TAU;
      if (da > PI) da -= TAU; else if (da < -PI) da += TAU;
      e.face += da * (1 - Math.exp(-(spec.turn || 2.2) * sdt));
    }
    // 足音
    if (spec.feet && e.spd > 0.4 && e.state !== 'enter') {
      const s = sin(e.ph);
      if ((s >= 0) !== (e._stepS >= 0)) {
        const side = s >= 0 ? 1 : -1, f = spec.feet, S = m.S;
        const fx = sin(e.face), fz = -cos(e.face), rx = -fz, rz = fx;
        footStep(this, e, e.x + rx * side * f.w * S + fx * f.f * S, e.z + rz * side * f.w * S + fz * f.f * S, f.s || 1);
      }
      e._stepS = s;
    }
    // 見た目
    m.root.position.set(e.x, e.y || 0, e.z);
    m.root.rotation.y = -e.face;
    if (!frozen) spec.anim(m, e, sdt, c);
    this._tint(m, e, dt);
    this._fadeFor(m, e, dt);
  },

  _enrage(e, m, spec) {
    e.phase++;
    e.state = 'roar'; e.st = 0; e.lockFace = false;
    if (spec.onPhase) spec.onPhase(this, e, m, e.phase);
    act(e, 'roar');
    Events.emit('bossPhase', { e, phase: e.phase, x: e.x, z: e.z, name: e.name, type: e.type });
  },
  _roar(e, m, spec, dt, c) {
    if (e.st > 0.35 && !e.hitDone) { e.hitDone = 1; roarBlast(this, e, 10 + e.size * 0.6, true); }
    if (e.st > 0.4 && e.st < 1.3 && Math.random() < dt * 8) quake(this, e.x, e.z, 0.4);
    if (e.st > 1.5) { e.state = 'walk'; e.st = 0; e.hitDone = 0; e.cool = 0.3; }
    return 0;
  },
  _enter(e, m, spec, dt, c) {
    const kind = e.enter;
    if (spec.enterAI) { const r = spec.enterAI(this, e, m, dt, c); if (r !== undefined) return r; }
    if (kind === 'rise') {          // 地面から はい出る
      const T = 2.2, k = min(1, e.st / T);
      e.y = -e.size * 0.95 * (1 - k) * (1 - k);
      if (Math.random() < dt * 14) {
        const a = R(0, TAU), r = e.r * R(0.6, 1.5);
        FX.smoke(e.x + cos(a) * r, 0.3, e.z + sin(a) * r, 1.2 + e.size * 0.05, 1.4, 0x5a4e40, cos(a) * 3, 2, sin(a) * 3, 0.6);
        FX.debris(e.x + cos(a) * r, 0.4, e.z + sin(a) * r, 3, 9, 0x4a4038, 0.3, 2);
      }
      if (Math.random() < dt * 5) quake(this, e.x, e.z, 0.5);
      if (e.st > T) { e.y = 0; e.state = 'roar'; e.st = 0; e.hitDone = 0; act(e, 'roar'); }
      return 0;
    }
    if (kind === 'sky') {           // 空から 落ちてくる
      e.vy = (e.vy || 0) - 40 * dt; e.y = max(0, e.y + e.vy * dt);
      Warn.circle(e.x, e.z, e.r * 2.5, 1 - e.y / 46);
      if (e.y <= 0) {
        e.vy = 0; e.state = 'roar'; e.st = 0; e.hitDone = 0;
        slam(this, e, e.x, e.z, e.r * 2.5, { dmg: 1500, hero: 26, lift: 8, big: true, cause: 'slam' });
      }
      return 0;
    }
    e.state = 'walk'; e.st = 0;
    return -1;
  },

  _tint(m, e, dt) {
    const f = e.flash, fr = e.frozen > 0 ? 1 : 0, burn = e.burn > 0 ? 0.6 + 0.4 * sin(e.t * 20) : 0, sh = e.shock > 0 ? Math.random() : 0;
    const beat = e.phase > 0 ? (0.5 + 0.5 * sin(e.t * (5 + e.phase * 3))) * e.rage : 0;
    const rr = beat * 0.035 * e.phase;
    for (const mt of m.mats) {
      const b = mt.userData.baseE;
      mt.emissive.setRGB(b.r + f * 0.12 + burn * 0.35 + sh * 0.2 + fr * 0.1 + rr, b.g + f * 0.1 + burn * 0.1 + sh * 0.45 + fr * 0.2, b.b + f * 0.09 + sh * 0.8 + fr * 0.35);
      if (fr || mt.userData.iced) { mt.color.copy(mt.userData.baseC).lerp(_ice, fr * 0.6); mt.userData.iced = fr > 0; }
    }
    for (const mt of m.glows) mt.emissiveIntensity = mt.userData.baseI * (1 + e.phase * 0.9 + beat * 1.2);
  },

  // 主人公とカメラの間に 体があると すかす(見下ろしで 主人公が かくれないように)
  _fadeFor(m, e, dt) {
    let want = 1;
    const cam = Engine.camera, P = this._player;
    if (cam && P && Engine.viewMode !== 'fps') {
      const ax = P.pos.x, az = P.pos.z, ay = 1, bx = cam.position.x, bz = cam.position.z, by = cam.position.y;
      const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz || 1;
      const t = clamp(((e.x - ax) * sx + (e.z - az) * sz) / L2, 0, 1);
      const qx = ax + sx * t - e.x, qz = az + sz * t - e.z, h = ay + (by - ay) * t;
      if (t > 0.02 && Math.hypot(qx, qz) < e.r * 1.6 + 1.5 && h < (e.def.h || e.size) * 1.05 + (e.y || 0)) want = 0.3;
    }
    m.fade += (want - m.fade) * min(1, dt * 8);
    const o = Math.round(m.fade * 20) / 20;
    if (o !== m._op) { m._op = o; for (const mt of m.mats) mt.opacity = o; }
  },

  // ---------- 倒れた ----------
  kill(e, opts) {
    const m = e._M;
    if (!m) return;
    const spec = SPECS[e.type];
    m.dead = true; m.deadT = 0; m.fell = false; m.burst = false;
    e.state = 'dead'; e.st = 0;
    // たおれる向き: 主人公から はなれる向き(主人公の方へ たおれないと こわくないので 半分は 主人公の横)
    let dx = e.x - (this._player ? this._player.pos.x : e.x), dz = e.z - (this._player ? this._player.pos.z : e.z + 1);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const a = R(-0.9, 0.9), ca = cos(a), sa = sin(a);
    m.fdx = dx * ca - dz * sa; m.fdz = dx * sa + dz * ca;
    m.fallT = spec.fallT || 1.5;
    m.fallKind = spec.fall || 'topple';
    m.x0 = e.x; m.z0 = e.z; m.y0 = e.y || 0;
    // 当たった瞬間: 血しぶき
    const s = e.size;
    FX.burst({ x: e.x, y: s * 0.6, z: e.z, count: 60, color: 0x8a0a0a, speed: 12, up: 8, life: 1.1, size: 0.3, drag: 1.5 });
    Gore.chunks(e.x, s * 0.6, e.z, 12, 10, 8, m.fdx, m.fdz, 0x6a0808, 3);
    Engine.hitStop(0.1);
    quake(this, e.x, e.z, 1.2, 100);
    if (spec.onDeath) spec.onDeath(this, e, m);
  },

  // 倒れているボス・衝撃波・飛ぶ物(zombies.js の update から毎ステップ)
  step(dt) {
    if (!this._compiled && ++this._frames > 20) this._precompile();
    stepProjectiles(this, dt);
    stepLater(dt);
    stepWrecks(dt);
    for (let i = this._blasts.length - 1; i >= 0; i--) {
      const b = this._blasts[i];
      if ((b.t -= dt) > 0) continue;
      this._blasts.splice(i, 1);
      this._Z.damageCircle(b.x, b.z, b.r, b.dmg, { force: b.force, cause: b.cause, falloff: true });
    }
    let zoom = 1;
    const top = Engine.viewMode === 'top';
    for (let i = this._active.length - 1; i >= 0; i--) {
      const m = this._active[i];
      const e = m.e;
      if (e && !m.dead && top && this._player && e.state !== 'enter') {
        const d = Math.hypot(e.x - this._player.pos.x, e.z - this._player.pos.z);
        const z = 1 + clamp(((e.def.zoom || e.size) - 3) / 12, 0, 1.0) * clamp(1.5 - d / 50, 0, 1);
        zoom = max(zoom, z);
      }
      if (!m.dead) continue;
      this._deadStep(m, dt);
      if (m.deadT > m.fallT + 2.5) { this._active.splice(i, 1); this._free(m); }
    }
    // カメラを少し引く(見下ろし。大きいボスが近いとき)
    const zw = World.inside ? 1 : zoom;
    this._zoom += (zw - this._zoom) * min(1, dt * 1.5);
    if (abs(this._zoom - zw) < 0.002) this._zoom = zw;
    if (this._zoom !== this._lastZoom) { this._lastZoom = this._zoom; Engine.setZoom(this._zoom); }
    Warn.upload(this._time);
  },

  _deadStep(m, dt) {
    const e = m.e, spec = SPECS[m.type];
    m.deadT += dt;
    const T = m.fallT, k = min(1, m.deadT / T), kk = k * k * k;
    const kind = m.fallKind;
    if (!m.fell) {
      // たおれる先の予告(下じきになると 吹っとぶ)
      if (kind === 'topple') Warn.rect(m.x0, m.z0, m.fdx, m.fdz, e.size * 0.95, max(4, e.r * 2.2), k, 0xff6a20);
      else Warn.circle(m.x0, m.z0, e.r * 2.2, k, 0xff6a20);
      // ふらつき → たおれる
      const wob = sin(m.deadT * 9) * 0.06 * (1 - k);
      if (kind === 'topple') {
        // 上(+y)を たおれる向きへ: 軸 = 上 × 向き(ローカル)
        const f = e.face, lx = m.fdx * cos(f) + m.fdz * sin(f), lz = -m.fdx * sin(f) + m.fdz * cos(f);
        _ax.set(lz, 0, -lx).normalize();
        m.tilt.quaternion.setFromAxisAngle(_ax, kk * PI * 0.47 * (spec.fallAmt || 1) + wob);
        m.tilt.position.y = -kk * (spec.fallSink || 0) * m.S;
      } else if (kind === 'collapse') {
        m.tilt.scale.set(m.S * (1 + 0.25 * kk), m.S * (1 - 0.55 * kk), m.S * (1 + 0.25 * kk));
        m.tilt.position.y = -kk * 0.2 * m.S;
      } else if (kind === 'crash') {
        _ax.set(0, 0, 1);
        m.tilt.quaternion.setFromAxisAngle(_ax, kk * PI * 0.5 * (m.fdx > 0 ? 1 : -1));
      }
      if (e.y > 0) e.y = max(0, e.y - dt * (8 + e.y * 2)), m.root.position.y = e.y;
      e.t += dt; e.st += dt;
      spec.anim(m, e, dt, _ctx);
      if (Math.random() < dt * 6) FX.burst({ x: e.x + R(-2, 2), y: e.size * R(0.3, 0.8) * (1 - kk), z: e.z + R(-2, 2), count: 6, color: 0x7a0606, speed: 4, up: 2, life: 0.8, size: 0.25 });
      if (k >= 1) {
        m.fell = true;
        const L = kind === 'topple' ? e.size * 0.9 : 0, cx = m.x0 + m.fdx * L * 0.55, cz = m.z0 + m.fdz * L * 0.55;
        if (kind === 'topple') line(this, e, m.x0, m.z0, m.fdx, m.fdz, L, max(4, e.r * 2.2), { dmg: 2500, force: 30, hero: 20, lift: 7, cause: 'bossfall', shake: 1.8 });
        else line(this, e, m.x0 - m.fdx * e.r, m.z0 - m.fdz * e.r, m.fdx, m.fdz, e.r * 2, e.r * 2.4, { dmg: 2500, force: 30, hero: 18, lift: 6, cause: 'bossfall', shake: 1.6 });
        const n = FX.q(40);
        for (let i = 0; i < n; i++) {
          const a = R(0, TAU), s = R(8, 20), t = R(-0.5, 0.5) * (L || e.r * 2);
          FX.smoke(cx + m.fdx * t, 0.5, cz + m.fdz * t, 1.5 + e.size * 0.05, R(1.2, 2.2), 0x6f6455, cos(a) * s, R(0.5, 3), sin(a) * s, 0.6);
        }
        if (FX.ring) FX.ring(cx, cz, 1, e.size * 1.4, 0.9, 0xffc080, 1.2, 2, 0.9);
        Engine.hitStop(0.09);
        quake(this, cx, cz, 2, 120);
        Events.emit('bossFall', { e, x: cx, z: cz, size: e.size, type: m.type });
        m.bx = cx; m.bz = cz;
      }
      return;
    }
    // たおれたあと: 少しして はじける
    if (!m.burst && m.deadT > T + 0.35) {
      m.burst = true;
      this._burst(m, e, spec);
    }
    if (m.burst) m.tilt.position.y -= dt * 2;
  },

  // はじけ飛ぶ(血と肉の大爆発)
  _burst(m, e, spec) {
    const s = e.size, x = m.bx, z = m.bz;
    m.root.updateMatrixWorld(true);
    const bones = m.skeleton ? m.skeleton.bones : [];
    const stepB = max(1, Math.floor(bones.length / 10));
    for (let i = 0; i < bones.length; i += stepB) {
      bones[i].getWorldPosition(_v);
      Gore.chunks(_v.x, max(0.5, _v.y), _v.z, 7, 14, 10, 0, 0, i % 3 === 2 ? 0xd8ccb0 : 0x6a0808, 2.5 + s * 0.12);
      FX.burst({ x: _v.x, y: max(0.5, _v.y), z: _v.z, count: 24, color: 0x8a0a0a, speed: 12, up: 8, life: 1.1, size: 0.3, drag: 1.5 });
      Gore.splat(_v.x + R(-2, 2), _v.z + R(-2, 2), R(2, 4) + s * 0.1, R(-1, 1), R(-1, 1), 2);
    }
    FX.burst({ x, y: 2, z, count: 140, color: 0x8a0a0a, speed: 22, up: 12, life: 1.3, size: 0.3, drag: 1.4 });
    FX.burst({ x, y: 2, z, count: 50, color: 0xffd0a0, speed: 26, up: 6, life: 0.4, size: 0.25, grav: 0, drag: 3 });
    if (spec.burstFx) spec.burstFx(this, e, m, x, z);
    Gore.splat(x, z, 6 + s * 0.35, 0, 0, 1, 0x3a0202);
    for (let i = 0; i < 9; i++) { const a = R(0, TAU), r = R(4, 6 + s * 0.6); Gore.splat(x + cos(a) * r, z + sin(a) * r, R(1.5, 3.5), cos(a), sin(a), 2.2); }
    FX.flash(x, 4, z, 0xff4020, 80, 40, 0.5);
    quake(this, x, z, 1.8, 120);
    Engine.hitStop(0.06);
    for (const me of m.meshes) me.visible = false;
    this._blasts.push({ x, z, t: 0.05, r: 10 + s * 0.6, dmg: 900, force: 30, cause: 'boss' });
    act(e, 'burst', x, z);
  },

  draw() {},
};

const _dir = { x: 0, z: 0 };
const _ice = new THREE.Color(0xbfe4ff);
const _ax = new THREE.Vector3(), _v = new THREE.Vector3();
const _ctx = {};

function build(type) {
  const spec = SPECS[type];
  const m = { type, root: new THREE.Group(), tilt: new THREE.Group(), mats: [], glows: [], meshes: [], j: {}, e: null, dead: false, deadT: 0, S: spec.def.S || 1, fade: 1 };
  m.root.name = 'boss-' + type;
  m.root.add(m.tilt);
  spec.build(m);
  m.tilt.scale.setScalar(m.S);
  return m;
}
