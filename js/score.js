// 点数係: 倒すと点・連続で倒すと倍率アップ(コンボ)・まとめて倒すとボーナス・ボス撃破ボーナス・
// 区切りの数(10体・100連続 …)でボーナス・最高記録。点はどんどん大きくなるように気前よく。
// 第2弾: フィーバー(無双モード)のゲージ・出来事のごほうび・自己ベストの瞬間・結果画面の記録。
//
// 出すイベント:
//   score     {points, x, z, combo, mult, kind:'kill'|'multi'|'boss'|'milestone'|'bonus', count?}
//   newRecord {best}                      今回のプレイで、前の最高記録をこえた瞬間(1回だけ)
//   multiKill {count, points, x, z}       短い時間にまとめて倒した(3体以上)
//   milestone {kind:'kills'|'combo'|'score', value, text, bonus}
//   comboEnd  {combo}                     コンボが切れた(10以上のときだけ)
//   feverStart {dur, level, cause}        無双モード開始(ゲージが満タン / 物資の箱 など)
//   feverEnd   {kills, points, level}     無双モード終わり
//   personalBest {kind:'combo'|'kills'|'multi', value, prev}   今までの自分の記録をこえた瞬間(1回だけ)
import { Events } from './events.js';
import { CONFIG } from './config.js';

const RECORDS_KEY = 'sokai-records';     // ベスト以外の記録(最多コンボ・合計撃破数 など)
const BASE = 10;                          // 敵の points にかける数(大きい数字は気持ちいい)
const COMBO_TIME = 3.0;                   // この秒数のあいだに次を倒せばコンボが続く
const MULTI_GAP = 0.3, MULTI_MAX = 1.0;   // まとめて倒した判定(最後の撃破から 0.3 秒・最長 1 秒)
const CAUSE_BONUS = { sword: 1.2, spin: 1.5 };

// フィーバー(無双モード)
const FEVER_DUR = 12;                     // 続く秒数
const FEVER_KILL = 0.0011;                // 1 体倒すとたまる量(コンボが長いほど少し多い)
const FEVER_COOL = 4;                     // 終わったあと、たまり始めるまでの秒数

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
  records: { maxCombo: 0, mostKills: 0, totalKills: 0, plays: 0, longest: 0, bestMulti: 0, fevers: 0 },

  // ---- フィーバー(無双モード) ----
  fever: 0,               // ゲージ 0..1(無双モード中は 残り時間)
  feverActive: false,     // true の間 強くなる(武器係・出現係・画面係・音係が見る)
  feverT: 0, feverDur: FEVER_DUR, feverLevel: 0, feverMult: 1,
  _feverCool: 0, _feverKills: 0, _feverPts: 0,
  // ---- 出来事のごほうび: 点数〇倍(秒) ----
  boostMult: 1, boostT: 0,

  // ---- このプレイの記録(結果画面) ----
  stats: null,

  _multi: null, _killStep: 0, _comboStep: 0, _scoreStep: 0, _savedKills: 0, _wid: '', _pb: null,

  init() {
    try { this.best = +localStorage.getItem(CONFIG.BEST_KEY) || 0; } catch (e) {}
    try { Object.assign(this.records, JSON.parse(localStorage.getItem(RECORDS_KEY)) || {}); } catch (e) {}
    this.startBest = this.best;
    this.stats = newStats();
    Events.on('kill', (k) => this.onKill(k));
    Events.on('bossDown', (b) => this.onBoss(b));
    Events.on('start', () => { this.records.plays++; });
    // いま持っている武器(倒した武器の記録用)
    Events.on('fire', (f) => { const w = f && f.weapon; if (w && w.id) { this._wid = w.id; this._wname = (w.icon || '') + ' ' + (w.name || w.id); } });
    Events.on('weaponChange', (d) => { const w = d && d.weapon; if (w && w.id) { this._wid = w.id; this._wname = (w.icon || '') + ' ' + (w.name || w.id); } });
  },

  reset() {
    this.score = 0; this.kills = 0; this.combo = 0; this.comboTime = 0; this.mult = 1; this.newRecord = false;
    this.maxCombo = 0; this.time = 0; this.bossKills = 0;
    this._multi = null; this._killStep = 0; this._comboStep = 0; this._scoreStep = 0; this._savedKills = 0;
    this.startBest = this.best;
    this.fever = 0; this.feverActive = false; this.feverT = 0; this.feverLevel = 0; this.feverMult = 1;
    this._feverCool = 0; this._feverKills = 0; this._feverPts = 0;
    this.boostMult = 1; this.boostT = 0;
    this.stats = newStats();
    // 自己ベスト: このプレイを始めたときの記録(こえた瞬間に 1 回だけ知らせる)
    const r = this.records;
    this._pb = { combo: r.maxCombo || 0, kills: r.mostKills || 0, multi: r.bestMulti || 0, done: {} };
  },

  _calcMult() { return Math.min(99, 1 + Math.floor(this.combo / 10) * 0.5); },

  // いまの点数の倍率(無双モード × 出来事のごほうび)
  get bonusMult() { return (this.feverActive ? this.feverMult : 1) * (this.boostT > 0 ? this.boostMult : 1); },

  _add(pts, x, z, kind, extra) {
    pts = Math.round(pts);
    this.score += pts;
    if (this.feverActive) this._feverPts += pts;
    Events.emit('score', Object.assign({ points: pts, x, z, combo: this.combo, mult: this.mult, kind, fever: this.feverActive }, extra));
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

  // 出来事などのごほうび(外から呼ぶ)。text があれば score イベントに入れる
  bonus(pts, x = null, z = null, extra) {
    if (!this.active || !(pts > 0)) return 0;
    const p = Math.round(pts * this.bonusMult);
    this._add(p, x, z, 'bonus', extra);
    return p;
  },

  onKill(k) {
    if (!this.active) return;
    this.kills++;
    this.combo++;
    this.comboTime = COMBO_TIME;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.mult = this._calcMult();
    const base = (k.points || 10) * BASE * (CAUSE_BONUS[k.cause] || 1);
    this._add(base * this.mult * this.bonusMult, k.x, k.z, 'kill');

    // 記録: どの武器で倒したか
    const st = this.stats;
    const wk = k.cause === 'spin' ? 'spin' : k.cause === 'sword' ? 'sword' : (this._wid || 'gun');
    const w = st.weapons[wk] || (st.weapons[wk] = { n: 0, name: wk === 'spin' ? '🌀 回転斬り' : wk === 'sword' ? '🗡️ 剣' : (this._wname || wk) });
    w.n++;
    if (k.type === 'golden') st.golden++;

    // フィーバー
    if (this.feverActive) this._feverKills++;
    else if (this._feverCool <= 0) this.addFever(FEVER_KILL * (1 + Math.min(1.5, this.combo / 120)) * (k.boss ? 0 : 1));

    // まとめて倒した
    const m = this._multi;
    if (m && m.gap > 0) { m.n++; m.gap = MULTI_GAP; m.x += (k.x - m.x) / m.n; m.z += (k.z - m.z) / m.n; }
    else this._multi = { n: 1, gap: MULTI_GAP, age: 0, x: k.x, z: k.z };

    this._steps();
    this._personal('combo', this.combo);
    this._personal('kills', this.kills);
  },

  // 今までの自分の記録をこえた瞬間(初めて遊ぶ人には出さない)
  _personal(kind, v) {
    const pb = this._pb;
    if (!pb || pb.done[kind] || !(pb[kind] > (kind === 'multi' ? 4 : 9)) || v <= pb[kind]) return;
    pb.done[kind] = true;
    Events.emit('personalBest', { kind, value: v, prev: pb[kind] });
  },

  _steps() {
    let st = nextStep(KILL_STEPS, this._killStep);
    while (this.kills >= st) {
      this._killStep++;
      const bonus = st * 100;
      const text = st >= 1000 ? st + '体 撃破! 無双!' : st + '体 撃破!';
      Events.emit('milestone', { kind: 'kills', value: st, text, bonus });
      this._add(bonus * this.bonusMult, null, null, 'milestone');
      st = nextStep(KILL_STEPS, this._killStep);
    }
    st = nextStep(COMBO_STEPS, this._comboStep);
    while (this.combo >= st) {
      this._comboStep++;
      const bonus = Math.round(st * 100 * this.mult);
      const text = st >= 500 ? '伝説の ' + st + '連続!!' : st >= 200 ? 'MASSACRE! ' + st + '連続' : st >= 100 ? st + '連続! 無双!' : st + '連続!';
      Events.emit('milestone', { kind: 'combo', value: st, text, bonus });
      this._add(bonus * this.bonusMult, null, null, 'milestone');
      if (!this.feverActive && st >= 50) this.addFever(0.04);     // 大きなコンボは ゲージも少し
      st = nextStep(COMBO_STEPS, this._comboStep);
    }
  },

  onBoss(b) {
    if (!this.active) return;
    this.bossKills++;
    this.comboTime = COMBO_TIME + 2;          // ボスを倒したらコンボが少し長持ち
    const pts = (20000 + 10000 * (this.bossKills - 1)) * Math.max(1, this.mult) * this.bonusMult;
    this._add(pts, b && b.x, b && b.z, 'boss', { name: b && b.name });
    if (!this.feverActive) this.addFever(0.3);
  },

  // ---------------- フィーバー ----------------
  addFever(v) {
    if (!this.active || this.feverActive || !(v > 0)) return;
    this.fever = Math.min(1, this.fever + v);
    if (this.fever >= 1) this.startFever();
  },
  // 無双モードを始める(物資の箱などからも呼べる)。dur 秒
  startFever(dur = FEVER_DUR, cause = 'gauge') {
    if (!this.active) return;
    if (this.feverActive) { this.feverT = Math.max(this.feverT, dur); this.feverDur = Math.max(this.feverDur, this.feverT); return; }
    this.feverActive = true;
    this.feverLevel++;
    this.feverDur = this.feverT = dur;
    this.feverMult = 2 + 0.5 * Math.min(4, this.feverLevel - 1);   // 2 回目からは もっと倍
    this.fever = 1;
    this._feverKills = 0; this._feverPts = 0;
    this.comboTime = Math.max(this.comboTime, COMBO_TIME);
    this.stats.fevers++;
    Events.emit('feverStart', { dur, level: this.feverLevel, mult: this.feverMult, cause });
  },
  _endFever() {
    this.feverActive = false; this.fever = 0; this._feverCool = FEVER_COOL;
    const st = this.stats;
    st.feverBest = Math.max(st.feverBest, this._feverKills);
    Events.emit('feverEnd', { kills: this._feverKills, points: this._feverPts, level: this.feverLevel });
  },

  // 点数〇倍 を sec 秒(出来事のごほうび)
  boost(mult, sec) { this.boostMult = Math.max(mult, this.boostT > 0 ? this.boostMult : 1); this.boostT = Math.max(this.boostT, sec); },

  update(dt) {
    if (!this.active) return;
    this.time += dt;
    if (this.boostT > 0) { this.boostT -= dt; if (this.boostT <= 0) this.boostMult = 1; }
    if (this.feverActive) {
      this.feverT -= dt;
      this.fever = Math.max(0, this.feverT / this.feverDur);
      this.comboTime = Math.max(this.comboTime, 1.2);            // 無双モード中はコンボが切れにくい
      if (this.feverT <= 0) this._endFever();
    } else if (this._feverCool > 0) this._feverCool -= dt;
    const m = this._multi;
    if (m) {
      m.gap -= dt; m.age += dt;
      if (m.gap <= 0 || m.age >= MULTI_MAX) {
        this._multi = null;
        if (m.n >= 3) {
          const pts = Math.round(m.n * m.n * 25 * this.mult * this.bonusMult);
          if (m.n > this.stats.bestMulti) this.stats.bestMulti = m.n;
          Events.emit('multiKill', { count: m.n, points: pts, x: m.x, z: m.z });
          this._add(pts, m.x, m.z, 'multi', { count: m.n });
          if (!this.feverActive && this._feverCool <= 0 && m.n >= 5) this.addFever(m.n * 0.0016);
          this._personal('multi', m.n);
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

  // いちばんたくさん倒した武器 {name, n}
  favoriteWeapon() {
    let best = null;
    for (const k in this.stats.weapons) { const w = this.stats.weapons[k]; if (!best || w.n > best.n) best = w; }
    return best;
  },

  save() {
    try { localStorage.setItem(CONFIG.BEST_KEY, String(this.best)); } catch (e) {}
    const r = this.records;
    r.maxCombo = Math.max(r.maxCombo || 0, this.maxCombo);
    r.mostKills = Math.max(r.mostKills || 0, this.kills);
    r.longest = Math.max(r.longest || 0, Math.round(this.time));
    r.bestMulti = Math.max(r.bestMulti || 0, (this.stats && this.stats.bestMulti) || 0);
    r.totalKills = (r.totalKills || 0) + (this.kills - this._savedKills);
    this._savedKills = this.kills;
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch (e) {}
  },
};

function newStats() {
  return { weapons: {}, bestMulti: 0, fevers: 0, feverBest: 0, golden: 0, events: 0, found: 0, challenges: 0 };
}

function nextStep(steps, i) { return i < steps.length ? steps[i] : steps[steps.length - 1] + 500 * (i - steps.length + 1); }

// 100000 → '10万'、123456789 → '1億2345万'
export function jpNum(n) {
  n = Math.floor(n);
  if (n >= 1e8) { const o = Math.floor(n / 1e8), m = Math.floor((n % 1e8) / 1e4); return o + '億' + (m ? m + '万' : ''); }
  if (n >= 1e4) { const m = Math.floor(n / 1e4), r = n % 1e4; return m + '万' + (r ? r : ''); }
  return String(n);
}
