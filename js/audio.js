// 音係: 効果音と BGM を WebAudio でその場で作る(音のファイルは使わない)。最初のタップのあとに鳴らし始める。
//
// つなぎ方:  効果音 → [効果音の音量] → [コンプレッサー(大きい音をそろえる)] ─┐
//            BGM    → [音楽の音量] → [ダッキング(爆発の瞬間だけ BGM を下げる)] ─┼→ [全体の音量] → [リミッター(割れ防止)] → スピーカー
//            爆発・うなり声などの一部 → [ひびき(リバーブ)] ─────────────────────┘
// 1 秒に 18 発以上撃つ武器でも重くならないよう、音ごとに「最短の間隔」と、同時に鳴る数の上限を決めている。
import { Events } from './events.js';
import { loadSettings, saveSettings } from './engine.js';
import { Zombies } from './zombies.js';
import { Score } from './score.js';
import { Bosses } from './ui-boss.js';
import { Music } from './audio-bgm.js';

const MAX_VOICES = 36;
// 同じ音を続けて鳴らすときの最短の間隔(秒)
const MIN_GAP = {
  mg: 0.05, minigun: 0.04, pistol: 0.06, flame: 0.07, laser: 0.05, lightning: 0.08, plasma: 0.06, freeze: 0.07,
  shotgun: 0.08, sniper: 0.1, rail: 0.1, grenade: 0.08, launcher: 0.08, rocket: 0.08, missile: 0.07, blackhole: 0.3,
  hit: 0.035, bosshit: 0.08, kill: 0.04, ding: 0.055, explosion: 0.06, melee: 0.08, spin: 0.15, groan: 0.2, attack: 0.25,
  click: 0.04, weapon: 0.08, multi: 0.15,
};
// 鳴っている時間のめやす(同時の数を数える用)
const LEN = { explosion: 1.2, bossroar: 2.2, fanfare: 1.6, horn: 2.6, groan: 1.3, blackhole: 1.3, sniper: 0.7, spin: 0.6 };

export const Audio = {
  ctx: null, master: null, sfx: null, verb: null, musicBus: null, duck: null, music: null,
  muted: false, musicOn: true,
  noise: null, crackle: null,
  _last: {}, _ends: [], _state: 'title', _groanT: 0, _timer: null, _vibT: 0, _boomN: 0, _boomT: 0,

  init() {
    const s = loadSettings();
    this.muted = !!s.muted;
    this.musicOn = s.music !== false;

    Events.on('fire', (f) => {
      const w = (f && f.weapon) || {};
      this.play(w.sound || w.id || 'mg');
    });
    Events.on('explosion', (e) => this.explosion((e && e.radius) || 4));
    Events.on('melee', (m) => this.play('melee', m));
    Events.on('spin', (m) => this.play('spin', m));
    Events.on('hit', (h) => { if (h && (h.amount >= 4 || h.crit)) this.play(h.boss ? 'bosshit' : 'hit', h); });
    Events.on('kill', (k) => this.play('kill', k));
    Events.on('score', (s) => { if (s && s.kind === 'kill') this.play('ding', s); });
    Events.on('multiKill', (m) => this.play('multi', m));
    Events.on('milestone', (m) => this.play('milestone', m));
    Events.on('weaponChange', () => this.play('weapon'));
    Events.on('zombieAttack', () => this.play('attack'));
    Events.on('bossSpawn', () => { this.play('bossroar'); this.vibrate([40, 60, 40]); });
    Events.on('bossDown', () => { if (this._state === 'play') { this.play('bossdeath'); this.vibrate([60, 40, 140]); } });
    Events.on('horde', () => this.play('horn'));
    Events.on('newRecord', () => { this.play('fanfare'); this.vibrate([30, 40, 30, 40, 90]); });

    Events.on('start', () => { this._state = 'play'; this._sfxLevel(); this.play('start'); this._musicStart('normal'); });
    Events.on('pause', () => { this._state = 'paused'; if (this.music) this.music.stop(0.3); });
    Events.on('resume', () => { this._state = 'play'; this._musicStart(); });
    Events.on('finish', (d) => {
      this._state = 'result'; if (this.music) this.music.stop(0.8);
      if (d && d.newRecord) setTimeout(() => this.play('fanfare'), 500); else this.play('end');
    });
    Events.on('reset', () => {
      // タイトルへ戻ったとき(start の直前にも来る)
      setTimeout(() => {
        if (this._state === 'result') { this._state = 'title'; this._sfxLevel(); this._musicStart('title'); }
      }, 0);
    });

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  },

  // 最初のタップで呼ぶ(ブラウザの決まり)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      // 仕上げのリミッター(音割れ防止)
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      lim.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.85; this.master.connect(lim);
      // 効果音
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
      comp.connect(this.master);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(comp);
      // ひびき
      this.verb = c.createGain(); this.verb.gain.value = 1;
      const cv = c.createConvolver(); cv.buffer = this._impulse(1.6);
      const vg = c.createGain(); vg.gain.value = 0.35;
      this.verb.connect(cv).connect(vg).connect(this.master);
      // 音楽
      this.duck = c.createGain(); this.duck.gain.value = 1; this.duck.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.duck);
      // ノイズ(使い回す)
      this.noise = this._noiseBuf(1.5, (i, n) => Math.random() * 2 - 1);
      this.crackle = this._noiseBuf(0.5, () => (Math.random() < 0.06 ? Math.random() * 2 - 1 : 0) * 1.6);
      this.music = new Music(c, this.musicBus, this.noise);
      this.music.muted = this.muted || !this.musicOn;
      // iOS: 無音を 1 回鳴らして目を覚ます
      const b = c.createBufferSource(); b.buffer = c.createBuffer(1, 1, 22050); b.connect(c.destination); b.start(0);
      if (c.state === 'suspended') c.resume().catch(() => {});
      this._timer = setInterval(() => this._ambient(0.25), 250);
    } catch (e) { this.ctx = null; }
  },

  setMuted(m) {
    this.muted = !!m;
    const s = loadSettings(); s.muted = this.muted; saveSettings(s);
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
    if (this.music) this.music.muted = this.muted || !this.musicOn;
  },

  setMusic(on) {
    this.musicOn = !!on;
    const s = loadSettings(); s.music = this.musicOn; saveSettings(s);
    if (this.music) {
      this.music.muted = this.muted || !this.musicOn;
      if (this.musicOn && (this._state === 'play' || this._state === 'title')) this._musicStart();
      else if (!this.musicOn) this.music.stop(0.3);
    }
  },

  // 振動(Android など、対応している端末だけ)
  vibrate(p, force) {
    if (this._state !== 'play' && !force) return;
    try {
      // まだ一度も画面にさわっていないときは ぶるぶるさせない(ブラウザがエラーを出す)
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const s = loadSettings();
      if (s.vibrate === false || !navigator.vibrate) return;
      const now = performance.now(); if (now - this._vibT < 150) return; this._vibT = now;
      navigator.vibrate(p);
    } catch (e) {}
  },

  click() { this.play('click'); },

  _sfxLevel() {
    // タイトルの見本プレイ中は小さめ
    if (this.sfx) this.sfx.gain.setTargetAtTime(this._state === 'play' ? 0.7 : 0.3, this.ctx.currentTime, 0.1);
  },

  _musicStart(mode) {
    if (!this.music || !this.musicOn) return;
    if (mode) this.music.setMode(mode);
    this.music.setVolume(this._state === 'title' ? 0.6 : 1);
    this.music.start(mode || this.music.wantMode);
  },

  // 盛り上がり・ボス・ゾンビのうなり声(0.25 秒ごと)
  _ambient(dt) {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const playing = this._state === 'play' || this._state === 'title';
    if (this.music && this._state === 'play') {
      const boss = Bosses.list.length > 0, combo = Score.combo, n = safeCount();
      const lv = boss || combo >= 60 ? 3 : combo >= 25 ? 2 : combo >= 5 || n >= 90 ? 1 : 0;
      this.music.setLevel(lv);
      this.music.setMode(boss ? 'boss' : 'normal');
    } else if (this.music && this._state === 'title') { this.music.setLevel(0); }
    if (playing && !this.muted) {
      const n = safeCount();
      this._groanT -= dt;
      if (n > 0 && this._groanT <= 0) {
        this.play('groan');
        this._groanT = (0.8 + Math.random() * 2.2) / (1 + n / 70);
      }
    }
  },

  // ---------------- 音を鳴らす ----------------
  play(name, o = {}) {
    const c = this.ctx;
    if (!c || this.muted || c.state !== 'running') return;
    if (this._state === 'paused' && name !== 'click') return;
    const t = c.currentTime;
    const gap = MIN_GAP[name] != null ? MIN_GAP[name] : 0.03;
    if (t - (this._last[name] || -9) < gap) return;
    // 同時に鳴っている数
    const ends = this._ends;
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] < t) ends.splice(i, 1);
    const important = IMPORTANT.has(name);
    if (ends.length >= MAX_VOICES && !important) return;
    if (ends.length >= MAX_VOICES * 0.7 && LOW.has(name)) return;
    this._last[name] = t;
    ends.push(t + (LEN[name] || 0.3));
    const fn = SOUNDS[name] || SOUNDS.mg;     // 知らない名前はふつうの銃の音
    try { fn(this, t, o); } catch (e) { /* 音で止めない */ }
  },

  explosion(r) {
    const c = this.ctx; if (!c || this.muted || c.state !== 'running') return;
    const t = c.currentTime;
    if (t - this._boomT > 0.25) this._boomN = 0;
    this._boomT = t; this._boomN++;
    if (this._boomN > 5) return;                         // まとめて爆発したら 5 つまで
    this.play('explosion', { r, quiet: this._boomN > 1 ? 0.6 : 1 });
    if (r >= 5) this.vibrate(Math.min(60, 15 + r * 4));
  },

  // ダッキング: 大きい音の間、BGM を少し下げる
  duckMusic(amount = 0.5, sec = 0.4) {
    const g = this.duck.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(amount, t + 0.03); g.setTargetAtTime(1, t + sec, 0.25);
  },

  // ---------------- 部品 ----------------
  _noiseBuf(sec, f) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = f(i, n);
    return b;
  },
  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); }
    return b;
  },
  _out(dest, pan) {
    const c = this.ctx;
    let d = dest || this.sfx;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; p.connect(d); d = p; }
    return d;
  },
  // 音量の形: a 秒で peak まで上がり、d 秒で消える
  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  },
  // ノイズ(シャー)。filter: 'lowpass' 'highpass' 'bandpass'、f0 → f1 に動かす
  nz(t, { dur = 0.1, gain = 0.3, a = 0.002, type = 'lowpass', f0 = 2000, f1 = 0, q = 0.8, rate = 1, buf, dest, pan, verb = 0 }) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = buf || this.noise; src.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    const g = c.createGain(); this._env(g, t, a, gain, dur);
    src.connect(f).connect(g).connect(this._out(dest, pan));
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v).connect(this.verb); }
    const off = Math.random() * Math.max(0, src.buffer.duration - dur - a - 0.05);
    src.start(t, off); src.stop(t + a + dur + 0.05);
    return f;
  },
  // 音程のある音。f0 → f1 に動かす
  tn(t, { dur = 0.1, gain = 0.3, a = 0.002, wave = 'sine', f0 = 440, f1 = 0, dest, pan, verb = 0, lp = 0, detune = 0 }) {
    const c = this.ctx, o = c.createOscillator();
    o.type = wave; o.frequency.setValueAtTime(f0, t); o.detune.value = detune;
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    const g = c.createGain(); this._env(g, t, a, gain, dur);
    let node = o;
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = node.connect(f); }
    node.connect(g).connect(this._out(dest, pan));
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v).connect(this.verb); }
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  },
};

const IMPORTANT = new Set(['bossroar', 'bossdeath', 'fanfare', 'horn', 'milestone', 'explosion', 'start', 'click', 'spin']);
const LOW = new Set(['hit', 'kill', 'groan', 'ding', 'attack']);
const rnd = (a, b) => a + Math.random() * (b - a);
function safeCount() { try { return Zombies.count ? Zombies.count() : (Zombies.list || []).length; } catch (e) { return 0; } }

// 和音の音程(C5 からの半音)を Hz に
const note = (semi) => 523.25 * Math.pow(2, semi / 12);
const PENTA = [0, 2, 4, 7, 9];

// ---------------- 音のレシピ ----------------
const SOUNDS = {
  // --- 銃 ---
  mg(A, t) {
    const p = rnd(0.92, 1.08);
    A.nz(t, { dur: 0.055, gain: 0.34, type: 'bandpass', f0: 1800 * p, q: 0.8 });
    A.nz(t, { dur: 0.08, gain: 0.24, type: 'lowpass', f0: 900 * p });
    A.tn(t, { dur: 0.06, gain: 0.34, f0: 150 * p, f1: 55 });
  },
  minigun(A, t) {
    const p = rnd(0.94, 1.06);
    A.nz(t, { dur: 0.035, gain: 0.32, type: 'bandpass', f0: 2400 * p, q: 0.9 });
    A.tn(t, { dur: 0.04, gain: 0.28, f0: 170 * p, f1: 70 });
  },
  pistol(A, t) {
    A.nz(t, { dur: 0.05, gain: 0.45, type: 'highpass', f0: 1200 });
    A.tn(t, { dur: 0.08, gain: 0.42, f0: 190, f1: 60 });
    A.nz(t, { dur: 0.2, gain: 0.07, type: 'bandpass', f0: 900, verb: 0.6 });
  },
  shotgun(A, t) {
    A.nz(t, { dur: 0.28, gain: 0.85, type: 'lowpass', f0: 4200, f1: 500, verb: 0.3 });
    A.tn(t, { dur: 0.2, gain: 0.8, f0: 115, f1: 38 });
    A.tn(t, { dur: 0.012, gain: 0.15, wave: 'square', f0: 2200 });
    // ガシャッ(弾をこめる音)
    A.nz(t + 0.24, { dur: 0.03, gain: 0.16, type: 'highpass', f0: 2500 });
    A.nz(t + 0.31, { dur: 0.04, gain: 0.2, type: 'bandpass', f0: 1600, q: 2 });
  },
  sniper(A, t) {
    A.nz(t, { dur: 0.04, gain: 0.8, type: 'highpass', f0: 2500 });
    A.tn(t, { dur: 0.25, gain: 0.75, f0: 95, f1: 32 });
    A.nz(t + 0.01, { dur: 0.7, gain: 0.22, type: 'lowpass', f0: 1600, f1: 180, verb: 0.8 });
  },
  rail(A, t) {
    A.tn(t, { dur: 0.18, gain: 0.2, wave: 'sawtooth', f0: 220, f1: 2600, lp: 4000 });
    A.tn(t + 0.02, { dur: 0.5, gain: 0.12, f0: 3000, f1: 1100, verb: 0.5 });
    A.nz(t, { dur: 0.1, gain: 0.3, type: 'highpass', f0: 3000 });
    A.tn(t, { dur: 0.15, gain: 0.35, f0: 120, f1: 45 });
  },
  grenade(A, t) {
    A.tn(t, { dur: 0.12, gain: 0.45, f0: 380, f1: 110 });
    A.nz(t, { dur: 0.04, gain: 0.2, type: 'bandpass', f0: 1500, q: 1.5 });
  },
  launcher(A, t) {
    A.tn(t, { dur: 0.16, gain: 0.55, f0: 260, f1: 70 });
    A.nz(t, { dur: 0.12, gain: 0.3, type: 'lowpass', f0: 700 });
  },
  rocket(A, t) {
    A.nz(t, { dur: 0.45, gain: 0.45, a: 0.02, type: 'bandpass', f0: 300, f1: 1500, q: 1.2 });
    A.tn(t, { dur: 0.2, gain: 0.45, f0: 95, f1: 45 });
  },
  missile(A, t) {
    for (let i = 0; i < 3; i++) A.nz(t + i * 0.045, { dur: 0.22, gain: 0.2, a: 0.01, type: 'bandpass', f0: 900 * rnd(0.9, 1.1), f1: 2400, q: 1.5, pan: (i - 1) * 0.4 });
    A.tn(t, { dur: 0.1, gain: 0.25, f0: 140, f1: 60 });
  },
  flame(A, t) {
    A.nz(t, { dur: 0.15, gain: 0.45, a: 0.025, type: 'lowpass', f0: rnd(600, 900), q: 1.5 });
    A.nz(t, { dur: 0.12, gain: 0.1, a: 0.02, type: 'bandpass', f0: rnd(2500, 3500), q: 1 });
    A.tn(t, { dur: 0.14, gain: 0.08, a: 0.02, f0: 60 });
  },
  laser(A, t) {
    const p = rnd(0.95, 1.05);
    A.tn(t, { dur: 0.12, gain: 0.14, wave: 'square', f0: 1700 * p, f1: 300, lp: 3200 });
    A.tn(t, { dur: 0.1, gain: 0.08, f0: 2500 * p, f1: 600 });
  },
  lightning(A, t) {
    A.nz(t, { dur: 0.24, gain: 0.55, type: 'bandpass', f0: 3200, q: 0.6, buf: A.crackle, rate: rnd(0.8, 1.2) });
    A.tn(t, { dur: 0.16, gain: 0.1, wave: 'sawtooth', f0: 60, lp: 1200 });
    A.nz(t, { dur: 0.05, gain: 0.25, type: 'highpass', f0: 4000 });
  },
  plasma(A, t) {
    const c = A.ctx, o = A.tn(t, { dur: 0.18, gain: 0.26, f0: 900, f1: 160 });
    const m = c.createOscillator(), mg = c.createGain(); m.frequency.value = 38; mg.gain.value = 180;
    m.connect(mg).connect(o.frequency); m.start(t); m.stop(t + 0.25);
    A.nz(t, { dur: 0.08, gain: 0.14, type: 'lowpass', f0: 1200 });
  },
  freeze(A, t) {
    [2093, 2637, 3136].forEach((f, i) => A.tn(t + i * 0.015, { dur: 0.25, gain: 0.05, f0: f * rnd(0.98, 1.02), verb: 0.4 }));
    A.nz(t, { dur: 0.2, gain: 0.14, type: 'highpass', f0: 6000 });
  },
  blackhole(A, t) {
    A.tn(t, { dur: 1.2, gain: 0.5, a: 0.05, f0: 130, f1: 28, verb: 0.4 });
    A.nz(t, { dur: 0.6, gain: 0.3, a: 0.4, type: 'lowpass', f0: 500, f1: 80, verb: 0.5 });
    A.duckMusic(0.6, 0.8);
  },

  // --- 爆発(大きさで変わる) ---
  explosion(A, t, o) {
    const s = Math.max(0.4, Math.min(2, (o.r || 4) / 6)), q = o.quiet || 1;
    A.nz(t, { dur: 0.08, gain: 0.5 * q, type: 'lowpass', f0: 6000, f1: 1500 });
    A.nz(t, { dur: 0.45 + 0.5 * s, gain: 0.85 * Math.min(1, s + 0.2) * q, a: 0.005, type: 'lowpass', f0: 1800 + 600 * s, f1: 110, verb: 0.45 });
    A.tn(t, { dur: 0.4 + 0.4 * s, gain: 0.9 * Math.min(1.1, s + 0.3) * q, f0: 80, f1: 26 });
    if (s > 1.2) A.nz(t + 0.05, { dur: 1.0, gain: 0.25 * q, a: 0.05, type: 'lowpass', f0: 400, f1: 60, verb: 0.6 });
    A.duckMusic(0.55, 0.3 + 0.2 * s);
  },

  // --- 剣・必殺技 ---
  melee(A, t, o) {
    A.nz(t, { dur: 0.13, gain: 0.32, a: 0.012, type: 'bandpass', f0: 2600, f1: 700, q: 1.3 });
    if (o && o.kills > 0) {
      A.nz(t + 0.03, { dur: 0.05, gain: 0.22, type: 'highpass', f0: 3800 });
      A.tn(t + 0.03, { dur: 0.07, gain: 0.32, f0: 210, f1: 80 });
    }
  },
  spin(A, t, o) {
    const c = A.ctx, src = c.createBufferSource(); src.buffer = A.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2800, t + 0.18); f.frequency.exponentialRampToValueAtTime(500, t + 0.45);
    const g = c.createGain(); A._env(g, t, 0.06, 0.6, 0.4);
    src.connect(f).connect(g).connect(A.sfx); src.start(t, Math.random() * 0.8); src.stop(t + 0.5);
    A.tn(t, { dur: 0.42, gain: 0.22, a: 0.05, f0: 90, f1: 60 });
    if (o && o.kills > 0) {
      const k = Math.min(1, 0.4 + o.kills / 15);
      A.tn(t + 0.06, { dur: 0.25, gain: 0.7 * k, f0: 130, f1: 38 });
      A.nz(t + 0.06, { dur: 0.15, gain: 0.35 * k, type: 'lowpass', f0: 2500, f1: 300 });
      [1250, 1870, 2510].forEach((fq) => A.tn(t + 0.06, { dur: 0.5, gain: 0.045 * k, f0: fq, verb: 0.5 }));
      if (o.kills >= 5) A.vibrate(25);
    }
  },

  // --- 当たった・倒した ---
  hit(A, t) {
    A.nz(t, { dur: 0.05, gain: 0.6, type: 'lowpass', f0: rnd(650, 1200), pan: rnd(-0.3, 0.3) });
  },
  bosshit(A, t) {
    A.tn(t, { dur: 0.08, gain: 0.28, f0: 110, f1: 60 });
    A.tn(t, { dur: 0.12, gain: 0.05, wave: 'square', f0: rnd(700, 900), lp: 2500 });
  },
  kill(A, t) {
    A.nz(t, { dur: 0.09, gain: 0.22, type: 'bandpass', f0: rnd(380, 620), q: 2, pan: rnd(-0.3, 0.3) });
    A.tn(t, { dur: 0.08, gain: 0.18, f0: 95, f1: 45 });
  },
  // 倒したときの「チーン」。コンボが増えるほど音が高くなる
  ding(A, t, o) {
    const combo = (o && o.combo) || 1;
    const i = Math.min(14, Math.floor(combo / 3));
    const semi = PENTA[i % 5] + 12 * Math.floor(i / 5) - 12;
    const f = note(semi);
    A.tn(t, { dur: 0.16, gain: 0.1, f0: f });
    A.tn(t, { dur: 0.1, gain: 0.03, wave: 'triangle', f0: f * 2 });
    if (combo >= 100) A.tn(t + 0.03, { dur: 0.12, gain: 0.025, f0: f * 3, verb: 0.3 });
  },
  multi(A, t, o) {
    const n = (o && o.count) || 3, notes = n >= 15 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12];
    notes.forEach((s, i) => A.tn(t + i * 0.045, { dur: 0.18, gain: 0.07, wave: 'triangle', f0: note(s + (n >= 15 ? 5 : 0)), verb: 0.25 }));
  },
  milestone(A, t, o) {
    const big = o && o.value >= 100;
    [0, 7, 12, 16].forEach((s) => A.tn(t, { dur: big ? 1.0 : 0.7, gain: 0.05, a: 0.01, wave: 'sawtooth', f0: note(s - 12), lp: 3000, verb: 0.35 }));
    A.nz(t, { dur: big ? 0.9 : 0.6, gain: 0.13, type: 'highpass', f0: 5000, verb: 0.3 });
    A.tn(t, { dur: 0.2, gain: 0.4, f0: 120, f1: 45 });
  },
  fanfare(A, t) {
    const seq = [[-5, 0], [0, 0.1], [4, 0.2], [7, 0.3]];
    seq.forEach(([s, d]) => A.tn(t + d, { dur: 0.12, gain: 0.08, wave: 'square', f0: note(s), lp: 3000 }));
    [0, 4, 7, 12].forEach((s) => A.tn(t + 0.42, { dur: 1.1, gain: 0.06, a: 0.01, wave: 'sawtooth', f0: note(s), lp: 3500, verb: 0.4 }));
    A.nz(t + 0.42, { dur: 1.1, gain: 0.16, type: 'highpass', f0: 5000, verb: 0.3 });
    A.tn(t + 0.42, { dur: 0.3, gain: 0.5, f0: 120, f1: 40 });
    A.duckMusic(0.5, 1.2);
  },

  // --- ボス ---
  bossroar(A, t) {
    const c = A.ctx;
    // 警報(ウー・ウー)
    for (let i = 0; i < 4; i++) A.tn(t + i * 0.26, { dur: 0.22, gain: 0.07, a: 0.02, wave: 'square', f0: i % 2 ? 330 : 440, lp: 1800 });
    // うなり声: のこぎり波 3 つ + ゆらし + 歪み + こもらせる
    const t0 = t + 0.9, dur = 1.8;
    const ws = c.createWaveShaper(); const cu = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; cu[i] = Math.tanh(x * 4); } ws.curve = cu;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(1300, t0 + 0.4); lp.frequency.exponentialRampToValueAtTime(350, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.2); g.gain.setValueAtTime(0.32, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    ws.connect(lp).connect(g).connect(A.sfx);
    const v = c.createGain(); v.gain.value = 0.5; g.connect(v).connect(A.verb);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 7; lg.gain.value = 6; lfo.connect(lg);
    for (const [f, dt] of [[72, 0], [73.5, 0], [108, 5]]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0); o.frequency.linearRampToValueAtTime(f * 1.25, t0 + 0.35); o.frequency.exponentialRampToValueAtTime(f * 0.65, t0 + dur);
      o.detune.value = dt; lg.connect(o.frequency); o.connect(ws); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    A.nz(t0, { dur: dur * 0.9, gain: 0.22, a: 0.15, type: 'bandpass', f0: 420, f1: 260, q: 0.7, verb: 0.4 });
    A.tn(t0, { dur: 0.5, gain: 0.6, f0: 70, f1: 30 });
    A.duckMusic(0.35, 2.4);
  },
  bossdeath(A, t) {
    SOUNDS.explosion(A, t, { r: 12 });
    A.tn(t + 0.05, { dur: 1.5, gain: 0.18, a: 0.05, wave: 'sawtooth', f0: 95, f1: 28, lp: 700, verb: 0.5 });
    setTimeout(() => A.play('fanfare'), 650);
  },
  horn(A, t) {
    for (const [d, base] of [[0, 98], [1.25, 110]]) {
      [1, 1.5, 2].forEach((m) => {
        const o = A.tn(t + d, { dur: 0.95, gain: 0.13, a: 0.25, wave: 'sawtooth', f0: base * m, lp: 900, verb: 0.5 });
        o.detune.value = rnd(-8, 8);
      });
    }
    A.duckMusic(0.5, 2.4);
  },

  // --- ゾンビ ---
  groan(A, t) {
    const c = A.ctx, f0 = rnd(68, 125), dur = rnd(0.7, 1.3), pan = rnd(-0.8, 0.8);
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * rnd(0.75, 0.9), t + dur);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = rnd(4, 7); lg.gain.value = f0 * 0.04;
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(rnd(0.06, 0.1), t + 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const out = A._out(A.sfx, pan);
    for (const [ff, q, gv] of [[rnd(380, 650), 2.5, 1], [rnd(900, 1300), 3, 0.5]]) {
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = ff; f.Q.value = q;
      const fg = c.createGain(); fg.gain.value = gv * 3;
      o.connect(f).connect(fg).connect(g);
    }
    g.connect(out);
    const v = c.createGain(); v.gain.value = 0.3; g.connect(v).connect(A.verb);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },
  attack(A, t) {
    A.nz(t, { dur: 0.1, gain: 0.45, type: 'lowpass', f0: 320 });
    A.tn(t, { dur: 0.08, gain: 0.2, f0: 90, f1: 50 });
  },

  // --- 画面・そのほか ---
  click(A, t) {
    A.tn(t, { dur: 0.05, gain: 0.08, f0: 1250, f1: 900 });
    A.tn(t, { dur: 0.03, gain: 0.03, f0: 2500 });
  },
  weapon(A, t) {
    A.nz(t, { dur: 0.02, gain: 0.22, type: 'highpass', f0: 3000 });
    A.tn(t, { dur: 0.02, gain: 0.06, wave: 'square', f0: 900 });
    A.nz(t + 0.07, { dur: 0.03, gain: 0.26, type: 'bandpass', f0: 1800, q: 2 });
  },
  start(A, t) {
    A.nz(t, { dur: 0.55, gain: 0.22, a: 0.45, type: 'bandpass', f0: 400, f1: 3200, q: 1.2 });
    [0, 7, 12].forEach((s) => A.tn(t + 0.55, { dur: 0.6, gain: 0.06, a: 0.005, wave: 'sawtooth', f0: note(s - 12), lp: 2500, verb: 0.3 }));
    A.tn(t + 0.55, { dur: 0.25, gain: 0.5, f0: 120, f1: 40 });
  },
  end(A, t) {
    [[0, 0], [3, 0.12], [7, 0.24]].forEach(([s, d]) => A.tn(t + d, { dur: 0.5, gain: 0.06, wave: 'triangle', f0: note(s - 12), verb: 0.4 }));
  },
};

Audio.SOUNDS = SOUNDS;   // 確認用(音の大きさを測るテストで使う)
