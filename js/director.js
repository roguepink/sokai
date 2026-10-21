// 出現係(ディレクター): 時間とともにゾンビを増やす・大群イベント・ボスを必ず出す。飽きるまで終わらない。
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { Events } from './events.js';

export const Director = {
  time: 0,
  _acc: 0,
  _nextBoss: 60,

  reset() { this.time = 0; this._acc = 0; this._nextBoss = 60; },

  // 今の時間に、まわりに何体いてほしいか
  targetCount() { return Math.min(260, 40 + this.time * 1.2); },

  update(dt, player) {
    this.time += dt;
    this._acc += dt;
    if (this._acc > 0.1) {
      this._acc = 0;
      const want = this.targetCount();
      let n = Math.min(8, Math.ceil((want - Zombies.count()) / 6));
      while (n-- > 0) {
        const p = World.spawnPoint(player.pos.x, player.pos.z, 22, 45);
        if (!p) break;
        const r = Math.random();
        Zombies.spawn(r < 0.12 ? 'runner' : r < 0.17 ? 'brute' : 'walker', p.x, p.z);
      }
    }
    if (this.time >= this._nextBoss) {
      this._nextBoss = this.time + 90;
      const p = World.spawnPoint(player.pos.x, player.pos.z, 25, 35);
      if (p) {
        Zombies.spawn('brute', p.x, p.z);
        Events.emit('bossSpawn', { name: 'ボス', x: p.x, z: p.z });
      }
    }
  },
};
