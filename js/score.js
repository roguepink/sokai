// 点数係: 倒すと点・連続で倒すと倍率アップ(コンボ)・まとめて倒すとボーナス・ボス撃破ボーナス・
// 区切りの数(10体・100連続 …)でボーナス・最高記録。点はどんどん大きくなるように気前よく。
//
// 出すイベント:
//   score     {points, x, z, combo, mult, kind:'kill'|'multi'|'boss'|'milestone', count?}
//   newRecord {best}                      今回のプレイで、前の最高記録をこえた瞬間(1回だけ)
//   multiKill {count, points, x, z}       短い時間にまとめて倒した(3体以上)
//   milestone {kind:'kills'|'combo'|'score', value, text, bonus}
//   comboEnd  {combo}                     コンボが切れた(10以上のときだけ)
import { Events } from './events.js';
import { CONFIG } from './config.js';

const RECORDS_KEY = 'sokai-records';     // ベスト以外の記録(最多コンボ・合計撃破数 など)
const BASE = 10;                          // 敵の points にかける数(大きい数字は気持ちいい)
const COMBO_TIME = 3.0;                   // この秒数のあいだに次を倒せばコンボが続く
const MULTI_GAP = 0.3, MULTI_MAX = 1.0;   // まとめて倒した判定(最後の撃破から 0.3 秒・最長 1 秒)
const CAUSE_BONUS = { sword: 1.2, spin: 1.5 };

const KILL_STEPS = [10, 25, 50, 100, 200, 300, 500, 750, 1000];
const COMBO_STEPS = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000];
const SCORE_STEPS = [1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9];

export const Score = {
  score: 0, kills: 0, best: 0, combo: 0, comboTime: 0, mult: 1,
  newRecord: false,
  active: false,          // プレイ中だけ数える(タイトルの見本プレイでは数えない)
  maxCombo: 0, time: 0, bossKills: 0,
  comboWindow: COMBO_TIME,
  startBest: 0,           // このプレイを始めたときのベスト
  records: { maxCombo: 0, mostKills: 0, totalKills: 0, plays: 0, longest: 0 },

  _multi: null, _killStep: 0, _comboStep: 0, _scoreStep: 0, _savedKills: 0,

  init() {
    try { this.best = +localStorage.getItem(CONFIG.BEST_KEY) || 0; } catch (e) {}
    try { Object.assign(this.records, JSON.parse(localStorage.getItem(RECORDS_KEY)) || {}); } catch (e) {}
    this.startBest = this.best;
    Events.on('kill', (k) => this.onKill(k));
    Events.on('bossDown', (b) => this.onBoss(b));
    Events.on('start', () => { this.records.plays++; });
  },

  reset() {
    this.score = 0; this.kills = 0; this.combo = 0; this.comboTime = 0; this.mult = 1; this.newRecord = false;
    this.maxCombo = 0; this.time = 0; this.bossKills = 0;
    this._multi = null; this._killStep = 0; this._comboStep = 0; this._scoreStep = 0; this._savedKills = 0;
    this.startBest = this.best;
  },

  _calcMult() { return Math.min(99, 1 + Math.floor(this.combo / 10) * 0.5); },

  _add(pts, x, z, kind, extra) {
    this.score += pts;
    Events.emit('score', Object.assign({ points: pts, x, z, combo: this.combo, mult: this.mult, kind }, extra));
    if (this.score > this.best) {
      if (!this.newRecord && this.startBest > 0) Events.emit('newRecord', { best: this.startBest });
      this.newRecord = true;
      this.best = this.score;
    }
    while (this._scoreStep < SCORE_STEPS.length && this.score >= SCORE_STEPS[this._scoreStep]) {
      const v = SCORE_STEPS[this._scoreStep++];
      Events.emit('milestone', { kind: 'score', value: v, text: jpNum(v) + '点 突破!', bonus: 0 });
    }
  },

  onKill(k) {
    if (!this.active) return;
    this.kills++;
    this.combo++;
    this.comboTime = COMBO_TIME;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.mult = this._calcMult();
    const base = (k.points || 10) * BASE * (CAUSE_BONUS[k.cause] || 1);
    this._add(Math.round(base * this.mult), k.x, k.z, 'kill');

    // まとめて倒した
    const m = this._multi;
    if (m && m.gap > 0) { m.n++; m.gap = MULTI_GAP; m.x += (k.x - m.x) / m.n; m.z += (k.z - m.z) / m.n; }
    else this._multi = { n: 1, gap: MULTI_GAP, age: 0, x: k.x, z: k.z };

    this._steps();
  },

  _steps() {
    let st = nextStep(KILL_STEPS, this._killStep);
    while (this.kills >= st) {
      this._killStep++;
      const bonus = st * 100;
      const text = st >= 1000 ? st + '体 撃破! 無双!' : st + '体 撃破!';
      Events.emit('milestone', { kind: 'kills', value: st, text, bonus });
      this._add(bonus, null, null, 'milestone');
      st = nextStep(KILL_STEPS, this._killStep);
    }
    st = nextStep(COMBO_STEPS, this._comboStep);
    while (this.combo >= st) {
      this._comboStep++;
      const bonus = Math.round(st * 100 * this.mult);
      const text = st >= 500 ? '伝説の ' + st + '連続!!' : st >= 200 ? 'MASSACRE! ' + st + '連続' : st >= 100 ? st + '連続! 無双!' : st + '連続!';
      Events.emit('milestone', { kind: 'combo', value: st, text, bonus });
      this._add(bonus, null, null, 'milestone');
      st = nextStep(COMBO_STEPS, this._comboStep);
    }
  },

  onBoss(b) {
    if (!this.active) return;
    this.bossKills++;
    this.comboTime = COMBO_TIME + 2;          // ボスを倒したらコンボが少し長持ち
    const pts = Math.round((20000 + 10000 * (this.bossKills - 1)) * Math.max(1, this.mult));
    this._add(pts, b && b.x, b && b.z, 'boss', { name: b && b.name });
  },

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    const m = this._multi;
    if (m) {
      m.gap -= dt; m.age += dt;
      if (m.gap <= 0 || m.age >= MULTI_MAX) {
        this._multi = null;
        if (m.n >= 3) {
          const pts = Math.round(m.n * m.n * 25 * this.mult);
          Events.emit('multiKill', { count: m.n, points: pts, x: m.x, z: m.z });
          this._add(pts, m.x, m.z, 'multi', { count: m.n });
        }
      }
    }
    if (this.comboTime > 0) {
      this.comboTime -= dt;
      if (this.comboTime <= 0) {
        if (this.combo >= 10) Events.emit('comboEnd', { combo: this.combo });
        this.combo = 0; this.mult = 1; this._comboStep = 0;
      }
    }
  },

  save() {
    try { localStorage.setItem(CONFIG.BEST_KEY, String(this.best)); } catch (e) {}
    const r = this.records;
    r.maxCombo = Math.max(r.maxCombo || 0, this.maxCombo);
    r.mostKills = Math.max(r.mostKills || 0, this.kills);
    r.longest = Math.max(r.longest || 0, Math.round(this.time));
    r.totalKills = (r.totalKills || 0) + (this.kills - this._savedKills);
    this._savedKills = this.kills;
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch (e) {}
  },
};

function nextStep(steps, i) { return i < steps.length ? steps[i] : steps[steps.length - 1] + 500 * (i - steps.length + 1); }

// 100000 → '10万'、123456789 → '1億2345万'
export function jpNum(n) {
  n = Math.floor(n);
  if (n >= 1e8) { const o = Math.floor(n / 1e8), m = Math.floor((n % 1e8) / 1e4); return o + '億' + (m ? m + '万' : ''); }
  if (n >= 1e4) { const m = Math.floor(n / 1e4), r = n % 1e4; return m + '万' + (r ? r : ''); }
  return String(n);
}
