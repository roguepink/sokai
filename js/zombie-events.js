// 出現係: 出来事(ちょっとした変化)。ステージがない分、30〜50 秒ごとに「何か」が起きる。
//   物資投下 / 金色ゾンビ / ゾンビ大行進 / 空爆支援 / ボスラッシュ / ゾンビの津波 / 時間限定チャレンジ /
//   ゾンビが空から降ってくる / 探索ボーナス(新しい場所に初めて入った)
// 出すイベント: worldEvent {kind, text, sub, x, z}
//   kind: 'supply' 'supplyOpen' 'supplyLost' 'golden' 'goldenDown' 'goldenEscape' 'march' 'airstrike' 'airstrikeDone'
//         'bossrush' 'tsunami' 'skyfall' 'challenge' 'challengeClear' 'challengeFail' 'discover'
// 画面係は Happenings.markers(ミニマップの印)と Happenings.challenge(チャレンジの残り)を見る。
import * as THREE from 'three';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { Events } from './events.js';
import { Engine } from './engine.js';
import { FX } from './fx.js';
import { Score, jpNum } from './score.js';
import { Weapons, WEAPONS } from './weapons.js';
import { Gore } from './zombie-gore.js';

const R = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const fmt = (n) => Math.floor(n).toLocaleString();

export const Happenings = {
  markers: [],            // ミニマップの印 {x, z, kind, color, until}
  challenge: null,        // {kind, text, goal, count, t, dur}
  found: 0, total: 0,     // 見つけた場所の数 / 全部
  _scene: null, _D: null,
  _next: 26, _last: '', _hist: [], _t: 0,
  _crate: null, _planes: [], _bombs: [], _strike: null, _golden: null, _rush: null,
  _seen: new Set(), _discT: 0, _boostW: null, _killLog: [],

  init(scene, director) {
    this._scene = scene; this._D = director;
    this._crate = buildCrate(); scene.add(this._crate.root); this._crate.root.visible = false;
    for (let i = 0; i < 3; i++) { const p = buildPlane(); p.visible = false; scene.add(p); this._planes.push(p); }
    const bg = new THREE.CapsuleGeometry(0.16, 0.5, 3, 8), bm = new THREE.MeshStandardMaterial({ color: 0x3a4030, roughness: 0.6, metalness: 0.4 });
    for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(bg, bm); m.visible = false; scene.add(m); this._bombs.push({ m, on: false, x: 0, y: 0, z: 0, vy: 0, vx: 0, vz: 0 }); }
    Events.on('kill', (k) => this._onKill(k));
    Events.on('bossDown', (b) => this._onBossDown(b));
    this._countPlaces();
  },

  reset() {
    this._next = 26; this._last = ''; this._hist.length = 0; this._t = 0;
    this.markers.length = 0; this.challenge = null; this._strike = null; this._golden = null; this._rush = null;
    this._seen.clear(); this.found = 0; this._discT = 1.5; this._killLog.length = 0;
    if (this._crate) { this._crate.on = false; this._crate.root.visible = false; }
    for (const p of this._planes) p.visible = false;
    for (const b of this._bombs) { b.on = false; b.m.visible = false; }
    this._restoreWeapon(true);
  },

  // ---------------------------------------------------------------
  update(dt, player) {
    if (!this._scene) return;
    this._t += dt;
    const px = player.pos.x, pz = player.pos.z;
    const active = Score.active;
    this._crateUpdate(dt, px, pz);
    this._strikeUpdate(dt);
    this._goldenUpdate(dt);
    this._challengeUpdate(dt);
    this._boostWeaponUpdate(dt);
    for (let i = this.markers.length - 1; i >= 0; i--) if (this.markers[i].until < this._t) this.markers.splice(i, 1);
    if (!active) return;
    // 探索ボーナス(新しい場所に初めて入った)
    if ((this._discT -= dt) <= 0) { this._discT = 0.5; this._discover(px, pz); }
    // 次の出来事
    const T = this._D.time;
    if (T >= this._next) {
      const k = this._pick(T);
      let ok = false;
      try { ok = k && this.start(k, player); } catch (e) { console.error(e); }
      this._next = T + (ok ? R(28, 44) : 4);
    }
  },

  // 時間とともに 出来事の種類が増える。同じものが続かないように
  _pick(T) {
    let bosses = 0; for (const e of Zombies.list) if (e.boss) bosses++;
    const c = [
      ['supply', 1.2, 0], ['golden', 1, 0], ['challenge', 1, 20], ['march', 0.9, 40],
      ['airstrike', 1, 55], ['skyfall', 0.8, 70], ['tsunami', 0.8, 90], ['bossrush', 0.7, 150],
    ].filter(([k, w, from]) => T >= from && !this._hist.includes(k)
      && !(k === 'bossrush' && bosses > 0) && !(k === 'golden' && this._golden) && !(k === 'supply' && this._crate.on)
      && !(k === 'challenge' && this.challenge) && !(k === 'airstrike' && this._strike));
    if (!c.length) { this._hist.length = 0; return null; }
    let sum = 0; for (const x of c) sum += x[1];
    let r = Math.random() * sum;
    for (const x of c) { r -= x[1]; if (r <= 0) { this._remember(x[0]); return x[0]; } }
    this._remember(c[0][0]); return c[0][0];
  },
  _remember(k) { this._hist.push(k); if (this._hist.length > 3) this._hist.shift(); },

  _emit(kind, text, sub = '', x = null, z = null) { Events.emit('worldEvent', { kind, text, sub, x, z }); },
  _mark(x, z, kind, color, sec) { const m = { x, z, kind, color, until: this._t + sec }; this.markers.push(m); return m; },

  // 外から呼べる(確認用: __game.Director.happen('airstrike'))
  start(kind, player) {
    const px = player.pos.x, pz = player.pos.z;
    switch (kind) {
      case 'supply': return this._supply(px, pz);
      case 'golden': return this._goldenStart(px, pz);
      case 'march': return this._march(px, pz);
      case 'airstrike': return this._airstrike(px, pz, '空爆支援 到着!', 'ゾンビの群れを 一掃する!');
      case 'bossrush': return this._bossrush(px, pz);
      case 'tsunami': return this._tsunami(px, pz);
      case 'skyfall': return this._skyfall(px, pz);
      case 'challenge': return this._challengeStart();
    }
    return false;
  },

  // ===================== 物資投下 =====================
  _supply(px, pz) {
    const C = this._crate;
    let p = null;
    const vd = Engine.viewDir;
    for (let i = 0; i < 16 && !p; i++) {
      const a = Math.atan2(vd.z, vd.x) + R(-1.1, 1.1), d = R(9, 17);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (World.blockedAt(x, z, 1.6) || World.buildingAt(x, z) || !World.connected(x, z, px, pz)) continue;
      p = { x, z };
    }
    if (!p) return false;
    C.on = true; C.x = p.x; C.z = p.z; C.y = 26; C.landed = false; C.t = 0; C.life = 30; C.smokeT = 0;
    C.root.visible = true; C.chute.visible = true; C.chute.scale.set(1, 1, 1); C.beam.visible = true;
    C.root.position.set(C.x, C.y, C.z);
    C.marker = this._mark(C.x, C.z, 'supply', '#ffd23f', 40);
    this._emit('supply', '物資投下!', '光る箱に さわると パワーアップ!', C.x, C.z);
    return true;
  },
  _crateUpdate(dt, px, pz) {
    const C = this._crate; if (!C || !C.on) return;
    C.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(C.t * 5);
    C.beamMat.opacity = 0.16 + 0.12 * pulse;
    C.glowMat.emissiveIntensity = 0.6 + 1.2 * pulse;
    if (!C.landed) {
      C.y -= dt * 6.5;
      C.root.position.set(C.x + Math.sin(C.t * 1.7) * 0.35, Math.max(0.55, C.y), C.z + Math.cos(C.t * 1.3) * 0.25);
      C.root.rotation.set(Math.sin(C.t * 1.7) * 0.1, C.t * 0.3, Math.cos(C.t * 1.3) * 0.08);
      if (C.y <= 0.55) {
        C.landed = true; C.root.position.set(C.x, 0.55, C.z); C.root.rotation.set(0, C.root.rotation.y, 0);
        FX.burst({ x: C.x, y: 0.2, z: C.z, count: 22, color: 0x8a7a60, speed: 5, up: 2, life: 0.8, size: 0.25, drag: 2 });
        Engine.shake(0.15);
        Zombies.damageCircle(C.x, C.z, 2.2, 400, { force: 14, cause: 'explosion' });   // 箱の下じき
      }
    } else {
      C.life -= dt;
      // パラシュートが しぼんで消える
      const k = Math.max(0, 1 - (C.t - 4) * 0.5);
      if (C.chute.visible) { C.chute.scale.set(1 + (1 - k) * 0.4, Math.max(0.05, k), 1 + (1 - k) * 0.4); C.chute.position.y = 4.2 * k + 0.4; if (k <= 0.05) C.chute.visible = false; }
      if ((C.smokeT -= dt) <= 0) { C.smokeT = 0.12; FX.smoke(C.x + 0.4, 1.0, C.z + 0.3, 0.45, 1.6, 0xff4030, R(-0.3, 0.3), 1.6, R(-0.3, 0.3), 0.55); }
      const d = Math.hypot(px - C.x, pz - C.z);
      if (d < 2.4) this._openCrate(px, pz);
      else if (C.life <= 0) { this._hideCrate(); this._emit('supplyLost', '物資が 回収されてしまった…'); }
    }
  },
  _hideCrate() {
    const C = this._crate; C.on = false; C.root.visible = false;
    if (C.marker) C.marker.until = -1;
  },
  _openCrate(px, pz) {
    const C = this._crate;
    this._hideCrate();
    FX.burst({ x: C.x, y: 1, z: C.z, count: 40, color: 0xffd23f, speed: 9, up: 7, life: 0.9, size: 0.14, drag: 1.5 });
    FX.ring && FX.ring(C.x, C.z, 0.5, 9, 0.5, 0xffd23f, 0.5, 4, 1);
    if (FX.flash) FX.flash(C.x, 2, C.z, 0xffd060, 260, 18, 0.35);
    const pw = POWERS[(Math.random() * POWERS.length) | 0];
    this._emit('supplyOpen', pw.text, pw.sub, C.x, C.z);
    pw.fn(this, px, pz);
    Score.bonus(5000, C.x, C.z);
    Score.stats.events++;
  },

  // 最強の武器を しばらく持たせる(元の武器にもどす)
  _boostWeapon(sec) {
    const ids = ['gatling', 'minigun', 'meteor', 'tornado', 'rocket', 'blackhole'];
    let idx = -1;
    for (const id of ids) { const i = WEAPONS.findIndex((w) => w.id === id); if (i >= 0 && i !== Weapons.index) { idx = i; break; } }
    if (idx < 0) return false;
    const prev = this._boostW ? this._boostW.prev : Weapons.index;
    Weapons.select(idx);
    this._boostW = { prev, idx, t: sec };
    return true;
  },
  _boostWeaponUpdate(dt) {
    const b = this._boostW; if (!b) return;
    if (Weapons.index !== b.idx) { this._boostW = null; return; }   // 自分で持ちかえた
    if ((b.t -= dt) <= 0) this._restoreWeapon();
  },
  _restoreWeapon(silent) {
    const b = this._boostW; this._boostW = null;
    if (b && !silent && Weapons.index === b.idx) Weapons.select(b.prev);
  },

  // ===================== 金色ゾンビ =====================
  _goldenStart(px, pz) {
    const p = this._D._offscreenPoint(px, pz, 18, 28, false) || World.spawnPoint(px, pz, 16, 26);
    if (!p) return false;
    const e = Zombies.spawn('golden', p.x, p.z);
    if (!e) return false;
    e.goldT = 28;
    this._golden = { e, m: this._mark(e.x, e.z, 'golden', '#ffe066', 30) };
    this._emit('golden', '金色ゾンビ出現!', '逃がすな! 倒すと 大量ボーナス!', e.x, e.z);
    return true;
  },
  _goldenUpdate(dt) {
    const g = this._golden; if (!g) return;
    const e = g.e;
    if (!e.alive) { this._golden = null; g.m.until = -1; return; }
    g.m.x = e.x; g.m.z = e.z;
    if ((e.goldT -= dt) <= 0) {
      FX.burst({ x: e.x, y: 1, z: e.z, count: 40, color: 0xffe066, speed: 6, up: 8, life: 0.9, size: 0.12, grav: -2 });
      Zombies._remove(e);
      this._golden = null; g.m.until = -1;
      this._emit('goldenEscape', '金色ゾンビに 逃げられた…', '', e.x, e.z);
    }
  },

  // ===================== ゾンビ大行進 =====================
  _march(px, pz) {
    // 長く まっすぐ見通せる向きをさがす(道)
    let best = null, bl = 0;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU + R(-0.1, 0.1), dx = Math.cos(a), dz = Math.sin(a);
      let L = 0;
      for (let d = 6; d <= 80; d += 2) { if (World.blockedAt(px + dx * d, pz + dz * d, 1.4)) break; L = d; }
      if (L > bl) { bl = L; best = { dx, dz }; }
    }
    if (!best || bl < 30) return false;
    const rows = Math.min(22, Math.floor((bl - 24) / 1.25)), cols = 5;
    const free = Zombies.list.length;
    this._D._recycleFar(px, pz, Math.max(0, free + rows * cols - 300));
    const sx = -best.dz, sz = best.dx;           // 横の向き
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const d = 24 + r * 1.25, ph = r * 0.9;
      for (let c = 0; c < cols; c++) {
        const o = (c - (cols - 1) / 2) * 1.15 + R(-0.15, 0.15);
        const x = px + best.dx * d + sx * o, z = pz + best.dz * d + sz * o;
        if (World.blockedAt(x, z, 0.5)) continue;
        const type = r === 0 ? 'shield' : r < 2 ? 'riot' : Math.random() < 0.06 ? 'brute' : 'walker';
        const e = Zombies.spawn(type, x, z);
        if (!e) continue;
        e.ph = ph; e.spdMul = 1; e.reachL = e.reachR = 1; e.limp = 0; e.march = 1; e.face = Math.atan2(-best.dx, best.dz);
        n++;
      }
    }
    if (n < 20) return false;
    this._mark(px + best.dx * 30, pz + best.dz * 30, 'march', '#ff8a2a', 12);
    this._emit('march', 'ゾンビ大行進!', `${n}体が 一列に 押しよせる!`, px + best.dx * 30, pz + best.dz * 30);
    return true;
  },

  // ===================== 空爆支援 =====================
  _airstrike(px, pz, text, sub) {
    // いちばん ゾンビが集まっている所(主人公から 8〜40m)
    const L = Zombies.list;
    let bx = 0, bz = 0, bn = 0;
    for (let k = 0; k < 40; k++) {
      const e = L[(Math.random() * L.length) | 0]; if (!e || e.boss) continue;
      const d = Math.hypot(e.x - px, e.z - pz); if (d < 8 || d > 40) continue;
      let n = 0; for (let i = 0; i < L.length; i += 2) { const o = L[i]; if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 100) n++; }
      if (n > bn) { bn = n; bx = e.x; bz = e.z; }
    }
    if (!bn) { const a = Math.random() * TAU; bx = px + Math.cos(a) * 16; bz = pz + Math.sin(a) * 16; }
    const a = Math.atan2(bz - pz, bx - px) + Math.PI / 2 + R(-0.4, 0.4);
    const dx = Math.cos(a), dz = Math.sin(a);
    const len = 34;
    const s = this._strike = { cx: bx, cz: bz, dx, dz, t: 0, len, drop: [], kills: 0, planes: [] };
    for (let i = 0; i < 2; i++) {
      const pl = this._planes[i];
      pl.visible = true;
      s.planes.push({ m: pl, off: (i - 0.5) * 7, lag: i * 0.35 });
      pl.rotation.set(0, -Math.atan2(dx, -dz), 0);
    }
    // 爆弾を落とす場所(線の上に 14 発)
    for (let i = 0; i < 14; i++) {
      const u = -len / 2 + (i / 13) * len, side = (i % 2 ? 1 : -1) * R(1.5, 3.5);
      s.drop.push({ x: bx + dx * u - dz * side, z: bz + dz * u + dx * side, u, done: false });
    }
    this._mark(bx, bz, 'airstrike', '#ff4040', 8);
    this._emit('airstrike', text, sub, bx, bz);
    return true;
  },
  _strikeUpdate(dt) {
    for (const b of this._bombs) {
      if (!b.on) continue;
      b.vy -= 30 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.z += b.vz * dt;
      b.m.position.set(b.x, b.y, b.z);
      if (b.y <= 0.2) {
        b.on = false; b.m.visible = false;
        const r = 6.5;
        FX.explosion(b.x, b.z, r, 'fire');
        const k = Zombies.damageCircle(b.x, b.z, r, 1400, { force: 34, cause: 'airstrike', falloff: true });
        if (this._strike) this._strike.kills += k;
        if (typeof World.damage === 'function') try { World.damage(b.x, b.z, r, 400, { cause: 'airstrike' }); } catch (e) {}
        Events.emit('explosion', { x: b.x, z: b.z, radius: r, source: 'airstrike', kills: k });
        Engine.shake(0.7);
      }
    }
    const s = this._strike; if (!s) return;
    s.t += dt;
    const V = 62, alt = 10.5;
    let alive = false;
    for (const p of s.planes) {
      const u = -110 + (s.t - p.lag) * V;           // 線の上の位置
      p.m.position.set(s.cx + s.dx * u - s.dz * p.off, alt + Math.sin(s.t * 3 + p.off) * 0.3, s.cz + s.dz * u + s.dx * p.off);
      p.m.rotation.z = Math.sin(s.t * 2 + p.off) * 0.12;
      if (u < 120) alive = true; else p.m.visible = false;
      // 爆弾を落とす(飛行機の真下に来る少し前)
      for (const d of s.drop) {
        if (d.done || Math.abs(d.u - (u + 8)) > 1.6) continue;
        d.done = true;
        const b = this._bombs.find((x) => !x.on);
        if (!b) continue;
        b.on = true; b.m.visible = true;
        b.x = p.m.position.x; b.y = alt - 0.6; b.z = p.m.position.z;
        b.vy = -2; const T = 0.75; b.vx = (d.x - b.x) / T; b.vz = (d.z - b.z) / T;
        b.m.rotation.set(Math.PI / 2, -Math.atan2(s.dx, -s.dz), 0);
      }
    }
    if (!alive && s.t > 3) {
      this._strike = null;
      if (s.kills > 0) {
        const pts = Score.bonus(s.kills * 400);
        this._emit('airstrikeDone', `空爆で ${s.kills}体 撃破!`, pts ? '+' + fmt(pts) : '');
      }
      Score.stats.events++;
    }
  },

  // ===================== ボスラッシュ =====================
  _bossrush(px, pz) {
    const D = this._D;
    const a = Math.random() * TAU;
    let n = 0;
    const types = D.bossTypes().sort(() => Math.random() - 0.5);
    const list = [];
    for (let i = 0; i < 2; i++) {
      const aa = a + i * Math.PI;
      let p = null;
      for (let k = 0; k < 10 && !p; k++) { const q = World.spawnPoint(px + Math.cos(aa) * 26, pz + Math.sin(aa) * 26, 0, 10); if (q && !World.buildingAt(q.x, q.z) && !World.blockedAt(q.x, q.z, 2.5)) p = q; }
      if (!p) continue;
      const e = D.spawnBoss(types[i % types.length], p.x, p.z, 0.75);
      if (e) { n++; list.push(e); }
    }
    if (!n) return false;
    this._rush = { list, left: list.length };
    this._emit('bossrush', 'ボスラッシュ!', n >= 2 ? '2体 同時に来るぞ!' : '', px, pz);
    return true;
  },
  _onBossDown(b) {
    const r = this._rush; if (!r || !b) return;
    if (!r.list.includes(b.e)) return;
    if (--r.left <= 0) {
      this._rush = null;
      const pts = Score.bonus(80000, b.x, b.z);
      Score.stats.events++;
      this._emit('bossrushClear', 'ボスラッシュ 制覇!', pts ? '+' + fmt(pts) : '', b.x, b.z);
    }
  },

  // ===================== ゾンビの津波 =====================
  _tsunami(px, pz) {
    const D = this._D;
    const a = Math.random() * TAU, dx = Math.cos(a), dz = Math.sin(a);
    const N = Math.round(150 * D.perfScale());
    D._recycleFar(px, pz, Math.max(0, Zombies.list.length + N - 300));
    for (let i = 0; i < N; i++) {
      const w = R(-34, 34), d = R(30, 40) + Math.abs(w) * 0.25;
      const x = px + dx * d - dz * w, z = pz + dz * d + dx * w;
      const r = Math.random();
      D._queue.push({ type: r < 0.45 ? 'runner' : r < 0.6 ? 'imp' : r < 0.66 ? 'leaper' : 'walker', x, z, t: (i / N) * 2.2, rush: true });
    }
    this._mark(px + dx * 32, pz + dz * 32, 'tsunami', '#ff3030', 10);
    this._emit('tsunami', 'ゾンビの津波だ!!', `${N}体が 一気に 押しよせる!`, px + dx * 32, pz + dz * 32);
    return true;
  },

  // ===================== 空から降ってくる =====================
  _skyfall(px, pz) {
    const N = Math.round(46 * this._D.perfScale());
    this._D._recycleFar(px, pz, Math.max(0, Zombies.list.length + N - 300));
    let n = 0;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU, d = R(5, 22);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (World.blockedAt(x, z, 0.6) || (World.buildingAt(x, z) && !World.inside)) continue;
      const e = Zombies.spawn(Math.random() < 0.8 ? 'walker' : Math.random() < 0.5 ? 'runner' : 'brute', x, z);
      if (!e) continue;
      e.y = R(14, 34); e.vy = R(-4, 0); e.fall = 1;
      n++;
    }
    if (!n) return false;
    this._emit('skyfall', 'ゾンビが 空から降ってくる!', '見上げてみよう', px, pz);
    return true;
  },

  // ===================== 時間限定チャレンジ =====================
  _challengeStart() {
    // 最近 30 秒の倒すペースから、ちょっとがんばれば届く数
    const now = this._D.time;
    while (this._killLog.length && this._killLog[0] < now - 30) this._killLog.shift();
    const span = Math.max(6, Math.min(30, now - (this._killLog.length ? this._killLog[0] : now)));
    const rate = Math.max(1.5, this._killLog.length / span);
    const r = Math.random();
    let c;
    if (r < 0.6) {
      const dur = 30, goal = Math.max(50, Math.min(800, Math.round(rate * dur * 1.3 / 10) * 10));
      c = { kind: 'kills', text: `${dur}秒で ${goal}体 倒せ!`, goal, dur };
    } else if (r < 0.8) {
      const dur = 25, goal = Math.max(15, Math.min(60, Math.round(rate * 4 / 5) * 5));
      c = { kind: 'blade', text: `${dur}秒で 剣と回転斬りで ${goal}体!`, goal, dur };
    } else {
      const dur = 25, goal = Math.max(20, Math.min(60, Math.round(rate * 1.3)));
      c = { kind: 'multi', text: `一度に ${goal}体 まとめて倒せ!`, goal, dur };
    }
    c.count = 0; c.t = c.dur; c.best = 0;
    this.challenge = c;
    this._emit('challenge', '時間限定チャレンジ!', c.text);
    this._multiOff = Events.on('multiKill', (m) => {
      const ch = this.challenge;
      if (ch && ch.kind === 'multi' && m) { ch.best = Math.max(ch.best, m.count); ch.count = ch.best; }
    });
    return true;
  },
  _challengeUpdate(dt) {
    const c = this.challenge; if (!c) return;
    c.t -= dt;
    const done = c.count >= c.goal;
    if (done || c.t <= 0) {
      this.challenge = null;
      if (this._multiOff) { this._multiOff(); this._multiOff = null; }
      if (done) {
        const pts = Score.bonus(30000 + c.goal * 300);
        Score.addFever(0.35);
        Score.stats.challenges++; Score.stats.events++;
        this._emit('challengeClear', 'チャレンジ成功!', pts ? '+' + fmt(pts) + ' 点 & 無双ゲージ' : '');
      } else this._emit('challengeFail', `おしい! ${c.count} / ${c.goal}`, '');
    }
  },

  _onKill(k) {
    if (!k || !Score.active) return;
    this._killLog.push(this._D.time);
    if (this._killLog.length > 4000) this._killLog.splice(0, 1000);
    const c = this.challenge;
    if (c && c.kind === 'kills') c.count++;
    else if (c && c.kind === 'blade' && (k.cause === 'sword' || k.cause === 'spin')) c.count++;
    if (k.type === 'golden') {
      const pts = Score.bonus(50000, k.x, k.z);
      Score.addFever(0.3);
      Score.stats.events++;
      FX.burst({ x: k.x, y: 1.2, z: k.z, count: 60, color: 0xffe066, speed: 10, up: 9, life: 1.2, size: 0.13, drag: 1.2 });
      this._emit('goldenDown', '金色ゾンビ 撃破!', pts ? '+' + fmt(pts) + ' 点' : '', k.x, k.z);
    }
  },

  // ===================== 探索ボーナス =====================
  _countPlaces() {
    const names = new Set();
    try {
      const H = World.half || 400;
      if (typeof World.zoneName === 'function') for (let x = -H; x < H; x += 20) for (let z = -H; z < H; z += 20) { const n = World.zoneName(x, z); if (n) names.add('z:' + n); }
      for (const b of World.buildings || []) if (b.name) names.add('b:' + b.name);
    } catch (e) {}
    this.total = names.size;
  },
  _discover(px, pz) {
    let key = '', name = '';
    try {
      const b = World.inside;
      if (b && b.name) { key = 'b:' + b.name; name = b.name; }
      else if (typeof World.zoneName === 'function') { name = World.zoneName(px, pz) || ''; key = name ? 'z:' + name : ''; }
    } catch (e) { return; }
    if (!key || this._seen.has(key)) return;
    this._seen.add(key);
    if (this._seen.size === 1 && this._D.time < 5) return;     // 最初にいた場所は数えない
    this.found++;
    Score.stats.found = this.found;
    const pts = Score.bonus(5000 * (1 + this.found * 0.25), px, pz);
    Score.addFever(0.06);
    const tot = Math.max(this.total, this._seen.size);
    this._emit('discover', '新しい場所を発見!', `${name}  +${fmt(pts)}` + (tot > 1 ? `  (${this._seen.size}/${tot})` : ''), px, pz);
  },
};

// 箱を開けたときのパワー
const POWERS = [
  { text: '無双モード 発動!', sub: '12秒間 点数アップ・敵が わんさか', fn: () => Score.startFever(12, 'supply') },
  { text: '点数 3倍!', sub: '20秒間', fn: () => Score.boost(3, 20) },
  { text: '超・大爆発!', sub: 'まわりのゾンビを 一掃!', fn: (H, px, pz) => megaBlast(px, pz) },
  { text: '空爆を 呼んだ!', sub: '空から 爆弾の雨!', fn: (H, px, pz) => H._airstrike(px, pz, '空爆 要請!', '') },
  { text: '最強武器 20秒!', sub: '', fn: (H, px, pz) => { if (!H._boostWeapon(20)) Score.startFever(12, 'supply'); } },
];

function megaBlast(px, pz) {
  const r = 17;
  FX.explosion(px, pz, 9, 'fire');
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; FX.explosion(px + Math.cos(a) * 8, pz + Math.sin(a) * 8, 6, 'fire'); }
  if (FX.ring) FX.ring(px, pz, 1, r, 0.6, 0xffd060, 1.2, 5, 1);
  const k = Zombies.damageCircle(px, pz, r, 3000, { force: 46, cause: 'explosion', falloff: false });
  Gore.splat(px, pz, 5, 0, 0, 1, 0x2a1810, 0.6);
  Engine.shake(1.6); Engine.hitStop(0.06); Engine.slowMo(0.7, 0.35);
  Events.emit('explosion', { x: px, z: pz, radius: r, source: 'supply', kills: k });
}

// ---------------- 形 ----------------
function canvasTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function buildCrate() {
  const root = new THREE.Group();
  const tex = canvasTex(256, 256, (c, W) => {
    c.fillStyle = '#6a7a3a'; c.fillRect(0, 0, W, W);
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.05)'; c.fillRect(0, i * 32, W, 32); }
    c.strokeStyle = '#3a4420'; c.lineWidth = 14; c.strokeRect(7, 7, W - 14, W - 14);
    c.beginPath(); c.moveTo(10, 10); c.lineTo(W - 10, W - 10); c.stroke();
    c.fillStyle = '#ffd23f'; c.fillRect(40, 96, W - 80, 64);
    c.fillStyle = '#1a1a10'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★ SUPPLY', W / 2, 129);
  });
  const glowMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffa020, emissiveIntensity: 0.8, emissiveMap: tex });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), glowMat);
  box.castShadow = true; root.add(box);
  // パラシュート
  const chute = new THREE.Group(); chute.position.y = 4.2; root.add(chute);
  const ctex = canvasTex(256, 64, (c, W, H) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#f4f4f4' : '#e03020'; c.fillRect(i * W / 8, 0, W / 8, H); } });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 6, 0, TAU, 0, Math.PI * 0.42), new THREE.MeshStandardMaterial({ map: ctex, side: THREE.DoubleSide, roughness: 0.9 }));
  canopy.scale.y = 0.7; chute.add(canopy);
  const lp = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; lp.push(Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2, (i % 2 ? 0.45 : -0.45), -3.6, (i < 4 ? 0.45 : -0.45)); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  chute.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd })));
  // 光の柱(遠くからでも見える)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 40, 12, 1, true), beamMat);
  beam.position.y = 20; root.add(beam);
  return { root, chute, beam, beamMat, glowMat, on: false, x: 0, y: 0, z: 0, t: 0, landed: false, life: 0, smokeT: 0, marker: null };
}
function buildPlane() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.5, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.4, metalness: 0.6 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 9, 10), body); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 10), body); nose.rotation.x = -Math.PI / 2; nose.position.z = -5.6; g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), dark); cockpit.scale.set(1, 0.8, 2.2); cockpit.position.set(0, 0.45, -3); g.add(cockpit);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.14, 2.4), body); wing.position.z = 0.3; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 1.3), body); tail.position.z = 4; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.4), body); fin.position.set(0, 0.9, 4); g.add(fin);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.6, 8), glow); flame.rotation.x = -Math.PI / 2; flame.position.z = 5.3; g.add(flame);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.9, 2, 6), dark); b.rotation.x = Math.PI / 2; b.position.set(s * 2.6, -0.3, 0.2); g.add(b); }
  g.traverse((o) => { if (o.isMesh && o.material !== glow) o.castShadow = true; });
  return g;
}

export { jpNum };
