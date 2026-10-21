// 点数係: 倒すと点・連続で倒すと倍率アップ(コンボ)・最高記録。
import { Events } from './events.js';
import { CONFIG } from './config.js';

export const Score = {
  score: 0, kills: 0, best: 0, combo: 0, comboTime: 0, mult: 1,
  newRecord: false,
  active: false,          // プレイ中だけ数える(タイトルの見本プレイでは数えない)

  init() {
    try { this.best = +localStorage.getItem(CONFIG.BEST_KEY) || 0; } catch (e) {}
    Events.on('kill', (k) => this.onKill(k));
  },

  reset() { this.score = 0; this.kills = 0; this.combo = 0; this.comboTime = 0; this.mult = 1; this.newRecord = false; },

  onKill(k) {
    if (!this.active) return;
    this.kills++;
    this.combo++;
    this.comboTime = 2.5;
    this.mult = 1 + Math.floor(this.combo / 10) * 0.5;
    const pts = Math.round(k.points * this.mult);
    this.score += pts;
    Events.emit('score', { points: pts, x: k.x, z: k.z, combo: this.combo, mult: this.mult });
    if (this.score > this.best) {
      if (!this.newRecord && this.best > 0) Events.emit('newRecord', { best: this.best });
      this.newRecord = true;
      this.best = this.score;
    }
  },

  update(dt) {
    if (this.comboTime > 0) { this.comboTime -= dt; if (this.comboTime <= 0) { this.combo = 0; this.mult = 1; } }
  },

  save() { try { localStorage.setItem(CONFIG.BEST_KEY, String(this.best)); } catch (e) {} },
};
