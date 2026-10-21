// 出現係(ディレクター): 時間とともにゾンビを増やす・大群イベント・ボスを必ず出す。飽きるまで終わらない。
// - ふだん: 目標の数(はじめ 90 体 → 最大 約 280 体)まで、画面の外から少しずつ出す
// - 近くの数も見る: 画面のまわりが少ないと、進む先の画面のすぐ外に出す(からっぽの画面にしない)
// - 大群: 35〜50 秒ごとに、1 つの方向から一気に押しよせる(`horde` イベント)。種類も変わる
// - 地面から はい出てくるゾンビ(画面の中でも出る。見ていて楽しい)
// - 建物の中・森からも出る
// - ボス: 最初は 40 秒、そのあと 70 秒ごと。4 種類を順番に(だんだん強くなる)
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { Events } from './events.js';
import { Engine } from './engine.js';
import { FX } from './fx.js';
import { BOSS_ORDER, BOSS_TYPES } from './boss.js';
import { CONFIG } from './config.js';

const MAX = CONFIG.ZOMBIES.MAX;
const R = (a, b) => a + Math.random() * (b - a);

const HORDES = [
  { text: '大群が来る!', mix: { walker: 0.75, runner: 0.15, crawler: 0.1 }, n: 1, from: 0 },
  { text: '走るゾンビの群れだ!', mix: { runner: 0.85, walker: 0.15 }, n: 0.7, from: 25 },
  { text: 'ふくれゾンビの群れ! 撃てば連鎖する!', mix: { bloater: 0.55, walker: 0.45 }, n: 0.7, from: 60 },
  { text: '機動隊ゾンビが来る!', mix: { riot: 0.5, walker: 0.35, runner: 0.15 }, n: 0.7, from: 90 },
  { text: '巨漢ゾンビの群れ!', mix: { brute: 0.4, walker: 0.4, runner: 0.2 }, n: 0.6, from: 120 },
  { text: '四方八方から大群が来る!', mix: { walker: 0.6, runner: 0.25, crawler: 0.08, bloater: 0.07 }, n: 1.3, from: 150, all: true },
];

export const Director = {
  time: 0,
  _acc: 0,
  _nextBoss: 40,
  _bossIdx: 0,
  _nextHorde: 26,
  _hordeIdx: 0,
  _queue: [],
  _stat: { want: 0, ok: 0 },   // 確認用: 近くに出したかった数 / 出せた数               // 大群の「これから出す」予定 {type, x, z, t}

  reset() {
    this.time = 0; this._acc = 0; this._nextBoss = 40; this._bossIdx = 0;
    this._nextHorde = 26; this._hordeIdx = 0; this._queue.length = 0;
  },

  // 今の時間に、まわりに何体いてほしいか(ゆっくり増えて、ときどき波がある)
  targetCount() {
    const t = this.time;
    const base = 90 + t * 2;
    const wave = 1 + 0.15 * Math.sin(t / 9);
    return Math.min(280, base * wave) * this.perfScale();
  },
  // スマホが重いときは数を減らす(解像度を下げても追いつかないとき)
  perfScale() {
    const E = Engine;
    if (E._noBloom || (E._dprScale || 1) <= 0.6) return E.fps < 40 ? 0.55 : 0.75;
    return 1;
  },
  // 主人公の近く(だいたい画面のまわり 26m)に いてほしい数。画面がからっぽにならないように
  nearCount() {
    const t = this.time;
    return Math.min(100, 40 + t * 0.4) * (1 + 0.2 * Math.sin(t / 7)) * this.perfScale();
  },

  // 時間とともに 種類がまざってくる
  pickType() {
    const t = this.time, r = Math.random();
    const runner = Math.min(0.24, 0.08 + t / 900);
    const crawler = 0.07;
    const brute = t > 50 ? Math.min(0.06, 0.02 + t / 4000) : 0;
    const bloater = t > 35 ? Math.min(0.08, 0.03 + t / 3000) : 0;
    const riot = t > 70 ? Math.min(0.08, 0.02 + t / 3000) : 0;
    let a = runner; if (r < a) return 'runner';
    a += crawler; if (r < a) return 'crawler';
    a += brute; if (r < a) return 'brute';
    a += bloater; if (r < a) return 'bloater';
    a += riot; if (r < a) return 'riot';
    return 'walker';
  },

  update(dt, player) {
    this.time += dt;
    const px = player.pos.x, pz = player.pos.z;

    // ---- ふだんの出現 ----
    this._acc += dt;
    if (this._acc > 0.1) {
      this._acc = 0;
      const near = countNear(px, pz, 26);
      // 近くが少ない → 進む先の、画面のすぐ外に出す(からっぽの画面はつまらない)
      let close = Math.min(8, Math.ceil((this.nearCount() - near) / 4));
      this._stat.want += Math.max(0, close);
      if (close > 0 && Zombies.count() >= MAX - 8) this._recycleFar(px, pz, close);
      while (close-- > 0) {
        const p = this._closePoint(px, pz, player.vel.x, player.vel.z);
        if (p && Zombies.spawn(this.pickType(), p.x, p.z)) this._stat.ok++;
      }
      const want = this.targetCount();
      let n = Math.min(6, Math.ceil((want - Zombies.count()) / 8));
      while (n-- > 0) {
        const r = Math.random();
        // 地面から はい出てくる(近め・画面の中でもよい)
        if (r < 0.07) {
          const p = World.spawnPoint(px, pz, 11, 18);
          if (p && !World.buildingAt(p.x, p.z)) {
            const e = Zombies.spawn(Math.random() < 0.8 ? 'walker' : 'runner', p.x, p.z);
            if (e) {
              e.rise = 1;
              FX.burst({ x: p.x, y: 0.2, z: p.z, count: 14, color: 0x3a2e22, speed: 2.5, up: 3, life: 0.9, size: 0.18 });
            }
            continue;
          }
        }
        const p = r < 0.2 ? this._buildingPoint(px, pz) : this._offscreenPoint(px, pz, 24, 46, r < 0.4);
        if (!p) continue;
        Zombies.spawn(this.pickType(), p.x, p.z);
      }
    }

    // ---- 大群 ----
    if (this.time >= this._nextHorde) {
      const t = this.time;
      const choices = HORDES.filter((h) => h.from <= t);
      const h = this._hordeIdx === 0 ? HORDES[0] : choices[(Math.random() * choices.length) | 0];
      this._hordeIdx++;
      const count = Math.round(Math.min(110, (35 + t * 0.35)) * h.n);
      const ang = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const a = h.all ? Math.random() * Math.PI * 2 : ang + R(-0.45, 0.45);
        const d = R(28, 42);
        this._queue.push({ type: pickMix(h.mix), x: px + Math.cos(a) * d, z: pz + Math.sin(a) * d, t: (i / count) * 3.5 });
      }
      Events.emit('horde', { count, text: h.text });
      this._nextHorde = t + Math.max(30, 48 - t / 30);
    }
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const q = this._queue[i];
      if ((q.t -= dt) > 0) continue;
      this._queue.splice(i, 1);
      if (Zombies.count() >= MAX - 6) continue;
      let x = q.x, z = q.z;
      // 壁の中・閉じた部屋・画面の中には出さない(少しずらす)
      if (World.blockedAt(x, z, 0.8) || !World.connected(x, z, px, pz) || onScreen(x, z)) {
        const p = World.spawnPoint(x, z, 0, 6, 8, px, pz);
        if (!p || onScreen(p.x, p.z)) continue;
        x = p.x; z = p.z;
      }
      Zombies.spawn(q.type, x, z);
    }

    // ---- ボス(必ず出る) ----
    if (this.time >= this._nextBoss) {
      let alive = 0;
      for (const e of Zombies.list) if (e.boss) alive++;
      if (alive >= 2) { this._nextBoss = this.time + 10; }
      else {
        const p = this._offscreenPoint(px, pz, 24, 34, false, 2.5) || World.spawnPoint(px, pz, 20, 34);
        if (p) {
          const type = BOSS_ORDER[this._bossIdx % BOSS_ORDER.length];
          const lap = Math.floor(this._bossIdx / BOSS_ORDER.length);
          this._bossIdx++;
          // 出す前に 体力を決める(時間とともに強く)
          const def = BOSS_TYPES[type];
          const e = Zombies.spawn(type, p.x, p.z);
          if (e) {
            e.hp = e.maxHp = Math.round(def.hp * (1 + this.time / 150) * (1 + lap * 0.3));
            if (lap > 0) e.name = def.name + ' ' + ['', 'II', 'III', 'IV', 'V'][Math.min(4, lap)];
          }
          this._nextBoss = this.time + 70;
        } else this._nextBoss = this.time + 2;
      }
    }
  },

  // 画面の外の出る場所(森を少しえらびやすく)
  _offscreenPoint(px, pz, minD, maxD, preferForest, r = 0.8) {
    let best = null;
    for (let i = 0; i < 10; i++) {
      const p = World.spawnPoint(px, pz, minD, maxD, 3);
      if (!p) continue;
      if (World.buildingAt(p.x, p.z)) continue;
      if (onScreen(p.x, p.z)) continue;
      if (r > 1 && World.blockedAt(p.x, p.z, r)) continue;
      if (preferForest && typeof World.zoneAt === 'function') {
        if (World.zoneAt(p.x, p.z) === 'forest') return p;
        best = best || p;
        continue;
      }
      return p;
    }
    return best;
  },

  // 近くの建物の中(主人公と歩いてつながっている所だけ。主人公のいる建物なら 画面の外の部屋)
  _buildingPoint(px, pz) {
    const bs = World.buildings;
    if (!bs || !bs.length) return null;
    const inside = World.inside;
    for (let k = 0; k < 6; k++) {
      const b = inside && k < 2 ? inside : bs[(Math.random() * bs.length) | 0];
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const d = Math.hypot(cx - px, cz - pz);
      if (b !== inside && (d > 70 || d < 12)) continue;
      for (let i = 0; i < 6; i++) {
        const x = R(b.minX + 1.2, b.maxX - 1.2), z = R(b.minZ + 1.2, b.maxZ - 1.2);
        if (Math.hypot(x - px, z - pz) < 14) continue;
        if (World.blockedAt(x, z, 0.5) || !World.connected(x, z, px, pz)) continue;
        if (b === inside && onScreen(x, z)) continue;
        return { x, z };
      }
    }
    return null;
  },

  // 進む先の、画面のすぐ外(19〜30m)。止まっているときは まわりのどこか
  _closePoint(px, pz, vx, vz) {
    const sp = Math.hypot(vx, vz), ins = World.inside;
    const base = sp > 1 ? Math.atan2(vz, vx) : Math.random() * Math.PI * 2;
    for (let i = 0; i < 8; i++) {
      const a = base + (sp > 1 ? R(-1.3, 1.3) : R(-Math.PI, Math.PI)), d = R(ins ? 14 : 19, ins ? 24 : 30);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      if (World.blockedAt(x, z, 0.8) || !World.connected(x, z, px, pz) || onScreen(x, z)) continue;
      const b = World.buildingAt(x, z);
      if (b && b !== ins && Math.random() < 0.6) continue;   // よその建物の中は ときどきだけ
      return { x, z };
    }
    return null;
  },

  // 数がいっぱいのときは、遠くでうろうろしているゾンビを消して 近くに出しなおす
  _recycleFar(px, pz, n) {
    const L = Zombies.list;
    for (let k = 0; k < n; k++) {
      let far = null, fd = 45 * 45;
      for (let i = 0; i < L.length; i++) {
        const e = L[i];
        if (e.boss || !e.alive) continue;
        const d2 = (e.x - px) ** 2 + (e.z - pz) ** 2;
        if (d2 > fd) { fd = d2; far = e; }
      }
      if (!far || onScreen(far.x, far.z)) return;
      Zombies._remove(far);
    }
  },
};

function countNear(x, z, r) {
  let n = 0;
  const L = Zombies.list, r2 = r * r;
  for (let i = 0; i < L.length; i++) { const e = L[i]; if ((e.x - x) ** 2 + (e.z - z) ** 2 < r2) n++; }
  return n;
}

function pickMix(mix) {
  let r = Math.random();
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return 'walker';
}

// 画面に映っているか(少し外側まで「映っている」あつかい)
const _s = {};
function onScreen(x, z) {
  const p = Engine.project(x, 1, z, _s);
  if (!p) return false;
  const m = 60;
  return p.x > -m && p.x < innerWidth + m && p.y > -m && p.y < innerHeight + m;
}
