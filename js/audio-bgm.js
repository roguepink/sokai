// BGM(音楽)を WebAudio でその場で作る: ドラム・ベース・シンセ。ファイルは使わない。
// テンポ 150、E マイナー。もり上がり(level 0〜3)はコンボやボスで上がり、小節の頭で切りかわる。
//   0: キックとハイハットだけ + うすい和音      1: 4つ打ち + スネア + 8分のベース
//   2: + 16分ハイハット + アルペジオ(ピコピコ)  3: + 速いアルペジオ + 歪んだベース + シンバル + タム
// ボスがいる間は、暗いコード進行(E → F → E → D)に変わる。
// 無双モード中(setFever(true)): 明るい長調 + 8分のキック・裏拍のシンセの和音・1 オクターブ上のアルペジオ(いちばん派手)。
// 第4弾: ボス戦(mode 'boss')は 太鼓・半音でうごめく 16分のベース・不協和の和音を足して 激しく。
//   setRage(0..2) = ボスの怒り(形態)。1: 太鼓が増える + 警報のような高い音 / 2: さらに 16分のスネア・速い警報
const BPM = 150;
const STEP = 60 / BPM / 4;                 // 16分音符 = 0.1 秒
const LOOKAHEAD = 0.18;

// コード進行(E からの半音の数, 長調/短調)
const PROG = {
  normal: [[0, 'm'], [8, 'M'], [10, 'M'], [7, 'M']],      // Em C D B
  boss: [[0, 'm'], [1, 'M'], [0, 'm'], [10, 'M']],        // Em F Em D
  title: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']],       // Em C G D
  fever: [[0, 'M'], [8, 'M'], [10, 'M'], [5, 'M']],       // E C D A(明るく 勝ちほこる)
};
const E2 = 82.41;
const hz = (semi) => E2 * Math.pow(2, semi / 12);

export class Music {
  constructor(ctx, out, noise) {
    this.ctx = ctx; this.noise = noise;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(out);
    // アルペジオ用のこだま
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2200;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    this.delayOut = ctx.createGain(); this.delayOut.gain.value = 0.35;
    dl.connect(this.delayOut).connect(this.out);
    // 歪み(レベル 3 のベース)
    this.shaper = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * 3); }
    this.shaper.curve = c;
    this.shaperOut = ctx.createGain(); this.shaperOut.gain.value = 0.6;
    this.shaper.connect(this.shaperOut).connect(this.out);

    this.playing = false; this.level = 0; this.want = 0; this.mode = 'normal'; this.wantMode = 'normal';
    this.step = 0; this.bar = 0; this.next = 0; this.timer = null;
    this.volume = 1;
    this.fever = false; this.feverWant = false;
    this.rage = 0;
  }

  setRage(r) { this.rage = Math.max(0, Math.min(2, r | 0)); }

  setFever(f) { this.feverWant = !!f; }

  start(mode = 'normal') {
    const t = this.ctx.currentTime;
    this._gen = (this._gen || 0) + 1;          // 止める予約を取り消す
    this.wantMode = this.mode = mode;
    if (!this.playing) {
      this.playing = true; this.step = 0; this.bar = 0; this.next = t + 0.05;
      this.timer = setInterval(() => this._tick(), 25);
    }
    this._fade(this.volume, 0.6);
  }

  stop(fade = 0.5) {
    this._fade(0, fade);
    if (this.timer) {
      const gen = this._gen;
      setTimeout(() => { if (this._gen === gen && this.timer) { clearInterval(this.timer); this.timer = null; this.playing = false; } }, fade * 1000 + 100);
    }
  }

  setVolume(v) { this.volume = v; if (this.playing) this._fade(v, 0.3); }
  _fade(v, sec) {
    const g = this.out.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + sec);
  }

  setLevel(l) { this.want = Math.max(0, Math.min(3, l)); }
  setMode(m) { this.wantMode = m; }

  _tick() {
    if (!this.playing || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.next < now - 0.5) this.next = now + 0.05;   // 止まっていたら追いつく
    while (this.next < now + LOOKAHEAD) {
      // 無双モードは 拍の頭ですぐ切りかえる(小節の終わりを待たない)
      if (this.step % 4 === 0 && this.feverWant !== this.fever) {
        this.fever = this.feverWant;
        if (this.fever) { this.mode = this.wantMode = 'fever'; this.level = 3; this.bar = 0; this.crash(this.next, 1.2); }
      }
      if (this.step % 16 === 0) {
        // 小節の頭でもり上がり・曲調を切りかえる
        if (this.wantMode !== this.mode) {
          this.mode = this.wantMode; this.bar = 0;
          if (this.mode === 'boss' && !this.muted) { this.crash(this.next, 1.2); this.tom(this.next, 140); this.tom(this.next + STEP * 2, 110); }
        }
        this.level = this.want;
      }
      if (!this.muted) this._play(this.step, this.next);
      this.next += STEP;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  _play(step, t) {
    const s = step % 16, L = this.level, prog = PROG[this.mode] || PROG.normal;
    const [root, kind] = prog[this.bar % prog.length];
    const third = kind === 'm' ? 3 : 4;
    const fill = (this.bar % 4 === 3) && s >= 12;
    // --- ドラム ---
    const kickPat = L === 0 ? (s === 0 || s === 8) : L === 1 ? s % 4 === 0 : (s % 4 === 0 || s === 14);
    if (kickPat && !(fill && L >= 2)) this.kick(t, L >= 2 ? 1 : 0.85);
    if (L >= 1 && (s === 4 || s === 12) && !(fill && L >= 2)) this.snare(t, 0.7);
    if (L >= 2 && fill) this.tom(t, 220 - (s - 12) * 30);
    if (L === 0 ? s % 4 === 2 : L === 1 ? s % 2 === 0 : true) this.hat(t, s % 4 === 2 ? 0.5 : 0.28, L >= 2 && s % 8 === 6);
    if (L >= 3 && s === 0 && this.bar % 2 === 0) this.crash(t);
    if (L >= 1 && s === 0 && this.bar % 4 === 0) this.crash(t, 0.5);
    // --- ベース ---
    const bassPat = L === 0 ? (s === 0 || s === 6 || s === 8) : L === 1 ? s % 2 === 0 : (s % 2 === 0 || s % 4 === 3);
    if (bassPat) {
      const oct = (L >= 1 && (s === 6 || s === 14)) ? 12 : 0;
      this.bass(t, hz(root + oct), L);
    }
    // --- 和音(うすく、小節の頭で) ---
    if (s === 0 && L <= 1) this.pad(t, [root + 12, root + 12 + third, root + 19], STEP * 16);
    // --- 無双モードの上乗せ ---
    if (this.fever) {
      if (s % 2 === 0 && s % 4 !== 0) this.kick(t, 0.7);                        // 8分のキック
      if (s === 2 || s === 6 || s === 10 || s === 14) this.stab(t, [root + 24, root + 24 + third, root + 31]);   // 裏拍の和音
      if (s % 2 === 1) this.lead(t, hz(root + 36 + [0, 7, 12, 7][(s >> 1) % 4]), 0.03);
    }
    // --- ボス戦の上乗せ ---
    if (this.mode === 'boss' && !this.fever) {
      const R = this.rage;
      if (s === 0 || s === 6 || s === 10 || (R >= 1 && (s === 3 || s === 13))) this.tom(t, s === 0 ? 120 : 92);       // 太鼓
      if (s % 2 === 1) this.pulse(t, hz(root + 12 + ((s >> 1) % 2)), 0.045 + 0.01 * R);                              // 半音でうごめく
      if (s === 14 && this.bar % 2 === 1) this.stab(t, [root + 12, root + 13, root + 18]);                           // 不協和の和音
      if (R >= 1 && (s === 0 || s === 8)) this.lead(t, hz(root + 36 + (this.bar % 2 ? 1 : 0)) , 0.035);             // 警報のような高い音
      if (R >= 2 && s % 2 === 0 && s % 4 !== 0) this.snare(t, 0.35);
      if (R >= 2 && s % 4 === 2) this.lead(t, hz(root + 37), 0.03);
    }
    // --- アルペジオ ---
    if (L >= 2) {
      const arp = [0, third, 7, 12, 7, third, 12, 15 + (third - 3)];
      const every = L >= 3 ? 1 : 2;
      if (s % every === 0) {
        const n = arp[(s / every) % arp.length | 0];
        this.lead(t, hz(root + 24 + n), L >= 3 ? 0.055 : 0.045);
      }
    }
  }

  // ---------- 楽器 ----------
  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    this._env(g, t, 0.003, 0.55 * v, 0.22);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }

  snare(t, v) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise; n.playbackRate.value = 1;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = c.createGain(); this._env(g, t, 0.002, 0.32 * v, 0.14);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    this._env(og, t, 0.002, 0.18 * v, 0.07);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.12);
  }

  hat(t, v, open) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); this._env(g, t, 0.001, 0.12 * v, open ? 0.12 : 0.03);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
  }

  crash(t, v = 1) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4500;
    const g = c.createGain(); this._env(g, t, 0.002, 0.1 * v, 1.1);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random() * 0.3); n.stop(t + 1.2);
  }

  tom(t, f0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.15);
    this._env(g, t, 0.003, 0.35, 0.16);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.22);
  }

  bass(t, f, L) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    o2.type = 'square'; o2.frequency.value = f / 2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    const top = 300 + L * 380;
    lp.frequency.setValueAtTime(top * 2.2, t); lp.frequency.exponentialRampToValueAtTime(top * 0.6, t + 0.09);
    const g = c.createGain(); this._env(g, t, 0.004, 0.22, 0.1);
    const sg = c.createGain(); sg.gain.value = 0.5;
    o.connect(lp); o2.connect(sg).connect(lp); lp.connect(g);
    g.connect(L >= 3 ? this.shaper : this.out);
    o.start(t); o2.start(t); o.stop(t + 0.16); o2.stop(t + 0.16);
  }

  // こもった 短い 矩形波(ボス戦の うごめくベース)
  pulse(t, f, v) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
    const g = c.createGain(); this._env(g, t, 0.003, v, 0.07);
    o.connect(lp).connect(g).connect(this.out); o.start(t); o.stop(t + 0.1);
  }

  lead(t, f, v) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = c.createGain(); this._env(g, t, 0.003, v, 0.09);
    o.connect(lp).connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + 0.12);
  }

  // 短い和音(のこぎり波を少しずらして重ねる)
  stab(t, semis) {
    const c = this.ctx, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.1);
    const g = c.createGain(); this._env(g, t, 0.004, 0.05, 0.1);
    lp.connect(g).connect(this.out); g.connect(this.delay);
    for (const s of semis) for (const dt of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(s); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + 0.14);
    }
  }

  pad(t, semis, dur) {
    const c = this.ctx, lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(this.out);
    for (const s of semis) for (const dt of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(s); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  }
}
