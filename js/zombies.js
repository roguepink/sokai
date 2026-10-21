// ゾンビ係: たくさんのゾンビ(とボス)を出す・動かす・当たり判定・倒れる。
// たくさん出すため、見た目は「部位ごとの InstancedMesh」で まとめて描く。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Events } from './events.js';

const MAX = CONFIG.ZOMBIES.MAX;
const HCELL = 4;          // 近くさがし用の区画(m)

// 種類(キャラ係が増やす)
export const TYPES = {
  walker: { hp: 30, speed: 2.2, r: 0.45, points: 10, scale: 1, color: 0x6f8a5a },
  runner: { hp: 20, speed: 5.2, r: 0.42, points: 15, scale: 0.95, color: 0x8a7a5a },
  brute:  { hp: 160, speed: 1.6, r: 0.8, points: 50, scale: 1.6, color: 0x5a6a4a },
};

export const Zombies = {
  list: [],               // 生きている敵 {id,type,def,x,z,vx,vz,hp,maxHp,r,alive,boss,t,...}
  _hash: new Map(),
  _mesh: null,
  _id: 0,

  init(scene) {
    const geo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 8);
    geo.translate(0, 0.85, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this._mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._mesh.castShadow = true;
    this._mesh.count = 0;
    this._mesh.frustumCulled = false;
    scene.add(this._mesh);
  },

  reset() { this.list.length = 0; this._hash.clear(); },

  count() { return this.list.length; },

  spawn(type, x, z) {
    if (this.list.length >= MAX) return null;
    const def = TYPES[type] || TYPES.walker;
    const e = {
      id: ++this._id, type, def, x, z, vx: 0, vz: 0, y: 0,
      hp: def.hp, maxHp: def.hp, r: def.r, alive: true, boss: !!def.boss,
      t: Math.random() * 10, kx: 0, kz: 0, stun: 0, flash: 0,
    };
    this.list.push(e);
    return e;
  },

  update(dt, player) {
    const px = player.pos.x, pz = player.pos.z;
    this._rebuildHash();
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      // ふっとび(ノックバック)
      if (e.kx || e.kz) {
        e.x += e.kx * dt; e.z += e.kz * dt;
        e.kx *= Math.exp(-6 * dt); e.kz *= Math.exp(-6 * dt);
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.2) e.kx = e.kz = 0;
      }
      if (e.stun > 0) { e.stun -= dt; }
      else {
        // プレイヤーへまっすぐ向かう(キャラ係が「道さがし」に置きかえる)
        let dx = px - e.x, dz = pz - e.z;
        const d = Math.hypot(dx, dz) || 1;
        const sp = e.def.speed;
        e.vx = (dx / d) * sp; e.vz = (dz / d) * sp;
        if (d > e.r + player.radius + 0.1) { e.x += e.vx * dt; e.z += e.vz * dt; }
      }
      // 仲間どうし重ならない
      this._separate(e);
      World.collideCircle(e, e.r);
    }
    this._draw();
  },

  _separate(e) {
    const cx = Math.floor(e.x / HCELL), cz = Math.floor(e.z / HCELL);
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const cell = this._hash.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
      if (!cell) continue;
      for (let k = 0; k < cell.length; k++) {
        const o = cell[k];
        if (o === e) continue;
        const dx = e.x - o.x, dz = e.z - o.z, rr = e.r + o.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          e.x += (dx / d) * push; e.z += (dz / d) * push;
        }
      }
    }
  },

  _rebuildHash() {
    const h = this._hash;
    h.clear();
    for (const e of this.list) {
      const key = Math.floor(e.x / HCELL) * 73856093 ^ Math.floor(e.z / HCELL) * 19349663;
      let cell = h.get(key);
      if (!cell) h.set(key, (cell = []));
      cell.push(e);
    }
  },

  // ---------- 当たり判定(武器係が使う) ----------
  // 円の中の敵を集める
  queryCircle(x, z, r, out = []) {
    out.length = 0;
    const c0x = Math.floor((x - r - 2) / HCELL), c1x = Math.floor((x + r + 2) / HCELL);
    const c0z = Math.floor((z - r - 2) / HCELL), c1z = Math.floor((z + r + 2) / HCELL);
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const cell = this._hash.get(cx * 73856093 ^ cz * 19349663);
      if (!cell) continue;
      for (const e of cell) {
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
      if (!e.alive) continue;
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
    const steps = Math.ceil(maxDist / HCELL) + 1;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let s = 0; s <= steps; s++) {
      const px = x + dx * s * HCELL, pz = z + dz * s * HCELL;
      const cx = Math.floor(px / HCELL), cz = Math.floor(pz / HCELL);
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const cell = this._hash.get((cx + ox) * 73856093 ^ (cz + oz) * 19349663);
        if (!cell) continue;
        for (const e of cell) {
          if (!e.alive || seen.has(e)) continue;
          seen.add(e);
          const ex = e.x - x, ez = e.z - z;
          const t = ex * dx + ez * dz;
          if (t < 0 || t > maxDist) continue;
          const px2 = ex - dx * t, pz2 = ez - dz * t;
          if (px2 * px2 + pz2 * pz2 <= e.r * e.r * 1.4) out.push({ e, t });
        }
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  },

  // ダメージ。opts: { dirX, dirZ, force(ふっとび), cause(武器の名前), crit }
  damage(e, amount, opts = {}) {
    if (!e.alive) return false;
    e.hp -= amount;
    e.flash = 1;
    const f = (opts.force || 0) / (e.def.scale * e.def.scale);
    if (f) { e.kx += (opts.dirX || 0) * f; e.kz += (opts.dirZ || 0) * f; e.stun = Math.max(e.stun, 0.15); }
    Events.emit('hit', { x: e.x, y: 1.2 * e.def.scale, z: e.z, amount, crit: !!opts.crit, boss: e.boss, cause: opts.cause });
    if (e.hp <= 0) { this._kill(e, opts); return true; }
    return false;
  },

  // 円の範囲にダメージ(爆発・回転斬り)。倒した数を返す
  damageCircle(x, z, r, amount, opts = {}) {
    const hits = this.queryCircle(x, z, r, this._tmp || (this._tmp = []));
    let kills = 0;
    for (const e of hits.slice()) {
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz) || 1;
      const fall = opts.falloff ? Math.max(0.3, 1 - d / r) : 1;
      if (this.damage(e, amount * fall, { ...opts, dirX: dx / d, dirZ: dz / d, force: (opts.force || 0) * fall })) kills++;
    }
    return kills;
  },

  _kill(e, opts) {
    e.alive = false;
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    Events.emit('kill', {
      x: e.x, z: e.z, type: e.type, boss: e.boss, points: e.def.points,
      cause: opts.cause || '', dirX: opts.dirX || 0, dirZ: opts.dirZ || 0, force: opts.force || 0, scale: e.def.scale,
    });
  },

  _draw() {
    const m = this._mesh, mat = _m, col = _c;
    let n = 0;
    for (const e of this.list) {
      const s = e.def.scale;
      const sway = Math.sin(e.t * 6) * 0.08;
      _q.setFromEuler(_e.set(0, Math.atan2(e.vx, e.vz), sway));
      mat.compose(_p.set(e.x, 0, e.z), _q, _s.set(s, s, s));
      m.setMatrixAt(n, mat);
      col.setHex(e.def.color);
      if (e.flash > 0) col.lerp(_white, e.flash);
      m.setColorAt(n, col);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  },
};

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color(), _white = new THREE.Color(0xffffff);
