// ボスの見張り(画面係・音係で共有): 今いるボスの一覧と、倒れた瞬間を 1 回だけ知らせる。
// bossSpawn に e がなくても、Zombies.list の e.boss を見て見つける。
// 倒れたら 'bossDown' {name, x, z, e, type, time} を 1 体につき 1 回だけ出す(bossDeath / kill(boss) / 体力 0 のどれか早いもの)。
// time = 出てから倒すまでの秒(一時停止の間は数えない。clock は UI が毎フレーム進める)。
// 第4弾: このプレイで何体目のボスか(n)も覚える(登場の「第3の災厄」に使う)。
import { Events } from './events.js';
import { Zombies } from './zombies.js';

export const Bosses = {
  list: [],               // {e, name, born, bornT, n}
  _scanT: 0,
  clock: 0,               // プレイの時計(秒。一時停止は止まる)
  seen: 0,                // このプレイで出たボスの数

  init() {
    Events.on('bossSpawn', (d) => this._spawn(d || {}));
    Events.on('bossDeath', (d) => this._down(d && d.e, d));
    Events.on('kill', (k) => { if (k && k.boss) this._down(null, k); });
    Events.on('reset', () => { this.list.length = 0; this.clock = 0; this.seen = 0; });
  },

  get current() { return this.list.length ? this.list[0] : null; },

  _track(e, name) {
    if (!e || this.list.some((b) => b.e === e)) return null;
    const b = { e, name: name || e.name || 'ボス', born: performance.now(), bornT: this.clock, n: ++this.seen };
    this.list.push(b);
    return b;
  },

  _spawn(d) {
    let e = d.e;
    if (!e) {
      // 名前つきの e が来なかった: ボスの印がある敵、なければ出た場所にいちばん近い敵
      const L = Zombies.list || [];
      for (const z of L) if (z.boss && z.alive !== false && !this.list.some((b) => b.e === z)) { e = z; break; }
      if (!e && d.x != null) {
        let bd = 16;
        for (const z of L) { const dd = (z.x - d.x) ** 2 + (z.z - d.z) ** 2; if (dd < bd && !this.list.some((b) => b.e === z)) { bd = dd; e = z; } }
      }
    }
    if (e) this._track(e, d.name);
  },

  // 倒れた。e がなければ場所でさがす
  _down(e, d) {
    let i = -1;
    if (e) i = this.list.findIndex((b) => b.e === e);
    if (i < 0 && d && d.x != null) {
      let bd = 25;
      this.list.forEach((b, j) => { const dd = (b.e.x - d.x) ** 2 + (b.e.z - d.z) ** 2; if (dd < bd && !(b.e.alive && b.e.hp > 0)) { bd = dd; i = j; } });
    }
    if (i < 0) return;
    const b = this.list.splice(i, 1)[0];
    Events.emit('bossDown', { name: b.name, x: b.e.x, z: b.e.z, e: b.e, type: b.e.type, time: this.clock - b.bornT, n: b.n });
  },

  // e の見張りの記録(なければ null)
  info(e) { return this.list.find((b) => b.e === e) || null; },

  update(dt) {
    this.clock += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i].e;
      if (e.alive === false || e.hp <= 0) this._down(e, null);
    }
    // e なしで来たボスや、イベントなしのボスも拾う(0.5 秒ごと)
    if ((this._scanT -= dt) <= 0) {
      this._scanT = 0.5;
      for (const z of Zombies.list || []) if (z.boss && z.alive !== false && z.hp > 0) this._track(z, z.name);
    }
  },
};
