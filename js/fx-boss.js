// 演出係(第4弾): ボスの 3D の演出。FX の入れ物(粒・輪・光の線・点光源)を使い回すだけ(新しい物は作らない)。
//   bossIntro(x, z, size)   登場: 地面の赤い警告の輪 + 土けむり
//   bossKillFlash(x, z, size) 撃破の瞬間: 金と白の光の柱 + 金の火花の噴水
//   coinFountain(x, z, size) お金・宝石が ばらまかれる(金・水色・桃色の光る粒)
//   novaRing(x, z, R)       衝撃波のしあげ: 地面を走る 金の大きな輪(何重にも)+ 光の粒
//   heroHit(x, z)           主人公が なぐられた所の 赤い火花
import { FX } from './fx.js';
import { Engine } from './engine.js';

const rnd = Math.random, TAU = Math.PI * 2;

export const BossFX = {
  bossIntro(x, z, size = 8) {
    const R = Math.max(4, size * 0.6);
    FX.ring(x, z, R * 0.3, R * 2.2, 0.9, 0xff2a20, R * 0.12, 2.2, 0.9);
    FX.ring(x, z, R * 0.2, R * 1.4, 0.6, 0xffa080, R * 0.08, 1.4, 0.7);
    FX.burst({ x, y: 0.4, z, count: 30, color: 0x4a4038, speed: R * 1.6, up: 3, life: 1.1, size: 0.45, drag: 2.2, glow: false });
  },

  bossKillFlash(x, z, size = 8) {
    const h = Math.max(10, size * 1.6), dim = FX.nearDim(x, size * 0.5, z, size);
    // 光の柱(太い金 + 細い白)
    FX.beam(x, 0.2, z, x, h, z, 0xffc840, Math.max(1.2, size * 0.18), 0.7, 3 * dim, 0.9);
    FX.beam(x, 0.2, z, x, h * 1.1, z, 0xffffff, Math.max(0.5, size * 0.07), 0.45, 4 * dim, 1);
    FX.ring(x, z, 0.5, size * 1.2, 0.5, 0xffffff, size * 0.12, 3 * dim, 1);
    FX.flash(x, size * 0.6, z, 0xffd060, 60 * size * dim, size * 6, 0.6);
    // 金の火花の噴水
    const n = FX.q(60);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 4 + rnd() * 12;
      FX.spark(x, size * (0.3 + rnd() * 0.5), z, Math.cos(a) * sp, 6 + rnd() * 14, Math.sin(a) * sp, 0.9 + rnd() * 0.8, 0.09, 0xffe070, 6 * dim, 0xff9a20, 2, 0.03, 14, 0.8, 1);
    }
  },

  coinFountain(x, z, size = 8) {
    const dim = FX.nearDim(x, size * 0.5, z, size);
    const n = FX.q(46);
    const C = [0xffd040, 0xffd040, 0xffd040, 0x60e8ff, 0xff70c0, 0x8aff70];
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 3 + rnd() * 8, c = C[i % C.length];
      FX.glowPool.emit(x, size * 0.5, z, Math.cos(a) * sp, 8 + rnd() * 10, Math.sin(a) * sp, 1.4 + rnd() * 0.8, 0.22, 0.16, c, 3.5 * dim, c, 1.6 * dim, 1, 16, 0.6, 0, 0, 1);
    }
  },

  // 衝撃波: 輪の大きさ R(m)。演出だけ(倒すのは ui-bossfx.js)
  novaRing(x, z, R = 40) {
    const dim = Engine.viewMode === 'top' ? 1 : 0.6;
    FX.ring(x, z, 1, R, 0.85, 0xffc030, 2.6, 3.2 * dim, 1);
    FX.ring(x, z, 0.5, R * 0.8, 0.7, 0xffffff, 1.2, 2.6 * dim, 0.9);
    FX.ring(x, z, 0.5, R * 0.55, 0.55, 0xffe080, 4, 1.4 * dim, 0.6, 1);
    FX.ring(x, z, 2, R * 1.05, 1.1, 0xff8a10, 1.0, 2 * dim, 0.7);
    FX.flash(x, 4, z, 0xffc040, 400 * dim, 60, 0.7);
    // 輪の ふちから 立ちのぼる 光の粒
    const n = FX.q(70);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r0 = 2 + rnd() * 3, sp = R * (0.9 + rnd() * 0.3);
      FX.spark(x + Math.cos(a) * r0, 0.4, z + Math.sin(a) * r0, Math.cos(a) * sp, 2 + rnd() * 6, Math.sin(a) * sp, 0.6 + rnd() * 0.4, 0.12, 0xffe080, 5 * dim, 0xff9a20, 2, 0.05, 6, 0.4, 1);
    }
    FX.burst({ x, y: 0.3, z, count: 40, color: 0x6a5a48, speed: 22, up: 2, life: 1, size: 0.6, drag: 2.5, glow: false });
  },

  heroHit(x, z) {
    const n = FX.q(14);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, sp = 5 + rnd() * 8;
      FX.spark(x, 1.2, z, Math.cos(a) * sp, 2 + rnd() * 5, Math.sin(a) * sp, 0.3 + rnd() * 0.2, 0.07, 0xffb080, 5, 0xff2010, 2, 0.04, 14, 1, 1);
    }
    FX.ring(x, z, 0.3, 3.2, 0.3, 0xff3020, 0.35, 2, 0.8);
  },
};
