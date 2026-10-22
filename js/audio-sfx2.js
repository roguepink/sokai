// 音係(第2弾): 新しい武器の音 16 種・出来事の合図・無双モード・新しいゾンビ/ボスの声。
// audio.js の SOUNDS に足す。A = Audio(nz = ノイズ / tn = 音程のある音 / ctx / sfx / verb / duckMusic)。
// 音量は ひかえめ(今までの音と同じくらい。Audio.SOUNDS を オフラインで鳴らして 大きさを確かめた)。
const rnd = (a, b) => a + Math.random() * (b - a);
const note = (semi) => 523.25 * Math.pow(2, semi / 12);

// 同じ音を続けて鳴らすときの最短の間隔(秒)
export const GAP2 = {
  chainsaw: 0.09, grind: 0.07, sawCut: 0.06, hammer: 0.12, crossbow: 0.1, airstrike: 0.8, cannon: 0.15, disc: 0.08, drone: 0.06, tornado: 0.3,
  meteor: 0.25, acid: 0.1, nailgun: 0.05, emp: 0.3, shuriken: 0.05, whip: 0.1, beam: 0.1, gatling: 0.035,
  dash: 0.15, slamJump: 0.3, slam: 0.2, clang: 0.08, screech: 0.25, thud: 0.06, stomp: 0.22, ignite: 0.12, gas: 0.25, coin: 0.05, sizzle: 0.15,
  fever: 1, feverend: 1, fevertick: 0.05, supply: 1, supplyOpen: 0.5, golden: 1, goldenDown: 0.5, goldenEscape: 1,
  march: 1, tsunami: 1, skyfall: 1, challenge: 1, challengeClear: 0.5, challengeFail: 1, discover: 0.8, alarm: 1,
  bossthrow: 0.3, bossgrab: 0.3, birth: 0.5, spit: 0.3, rev: 0.6, carhorn: 0.6,
};
// 鳴っている時間のめやす(同時の数を数える用)
export const LEN2 = { airstrike: 2.0, tornado: 0.7, meteor: 1.0, emp: 0.6, fever: 2.0, supply: 2.2, golden: 1.4, goldenDown: 1.0, march: 1.6, tsunami: 2.4, challengeClear: 1.6, rev: 1.0 };
export const IMPORTANT2 = ['fever', 'feverend', 'supply', 'supplyOpen', 'golden', 'goldenDown', 'challenge', 'challengeClear', 'discover', 'tsunami', 'march', 'alarm', 'airstrike'];

// 歪み(使い回す)
let _curve = null;
function shaper(A, amt = 4) {
  const ws = A.ctx.createWaveShaper();
  if (!_curve) { _curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; _curve[i] = Math.tanh(x * amt); } }
  ws.curve = _curve;
  return ws;
}
// のこぎり波などの音(フィルターつき・ゆらし)
function osc(A, t, { wave = 'sawtooth', f0 = 100, f1 = 0, dur = 0.2, gain = 0.1, a = 0.005, lp = 2000, q = 1, lfo = 0, lfoAmt = 0, dest, pan, verb = 0, dist = false }) {
  const c = A.ctx, o = c.createOscillator();
  o.type = wave; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
  let node = o;
  if (lfo) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = lfo; lg.gain.value = lfoAmt; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + a + dur + 0.05); }
  if (dist) { const ws = shaper(A); node = node.connect(ws); }
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = q;
  const g = c.createGain(); A._env(g, t, a, gain, dur);
  node.connect(f).connect(g).connect(A._out(dest, pan));
  if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v).connect(A.verb); }
  o.start(t); o.stop(t + a + dur + 0.05);
  return o;
}

export const SOUNDS2 = {
  // ================= 新しい武器 =================
  chainsaw(A, t) {           // ブィィィン(エンジン + 刃)
    osc(A, t, { wave: 'sawtooth', f0: rnd(95, 110), dur: 0.11, gain: 0.16, a: 0.01, lp: 1400, lfo: 38, lfoAmt: 22, dist: true });
    A.nz(t, { dur: 0.1, gain: 0.12, a: 0.01, type: 'bandpass', f0: rnd(1600, 2200), q: 2 });
  },
  grind(A, t) {              // 刃が食いこむ(ガリガリ・低くうなる)
    osc(A, t, { wave: 'sawtooth', f0: rnd(62, 72), dur: 0.09, gain: 0.13, a: 0.005, lp: 900, lfo: 55, lfoAmt: 14, dist: true });
    A.nz(t, { dur: 0.08, gain: 0.1, a: 0.005, type: 'bandpass', f0: rnd(700, 1000), q: 3 });
  },
  sawCut(A, t) {             // ズシャッ(肉を切る)
    A.nz(t, { dur: 0.16, gain: 0.22, a: 0.004, type: 'lowpass', f0: 2200, f1: 300 });
    A.tn(t, { dur: 0.12, gain: 0.18, f0: 140, f1: 55 });
    A.nz(t + 0.03, { dur: 0.12, gain: 0.08, type: 'bandpass', f0: 3200, f1: 1200, q: 1.5 });
  },
  hammer(A, t) {             // ブンッ … ドゴォン
    A.nz(t, { dur: 0.12, gain: 0.18, a: 0.04, type: 'bandpass', f0: 500, f1: 1400, q: 1.2 });
    A.tn(t + 0.12, { dur: 0.35, gain: 0.7, f0: 85, f1: 30 });
    A.nz(t + 0.12, { dur: 0.3, gain: 0.5, type: 'lowpass', f0: 1800, f1: 200, verb: 0.3 });
    A.tn(t + 0.12, { dur: 0.08, gain: 0.08, wave: 'square', f0: 320, lp: 2000 });
    A.duckMusic(0.6, 0.25);
  },
  crossbow(A, t) {           // ビュン(弦)+ ヒュッ
    A.tn(t, { dur: 0.12, gain: 0.3, wave: 'triangle', f0: 220, f1: 110 });
    A.nz(t, { dur: 0.02, gain: 0.2, type: 'highpass', f0: 3000 });
    A.nz(t + 0.01, { dur: 0.16, gain: 0.12, a: 0.02, type: 'bandpass', f0: 2500, f1: 900, q: 2 });
  },
  airstrike(A, t) {          // ジェット機が通りすぎる + 爆弾のヒュー
    const c = A.ctx, src = c.createBufferSource(); src.buffer = A.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1800, t + 0.9); f.frequency.exponentialRampToValueAtTime(260, t + 1.9);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.38, t + 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.95);
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + 1.9); src.connect(f).connect(g).connect(p).connect(A.sfx); } else src.connect(f).connect(g).connect(A.sfx);
    const v = c.createGain(); v.gain.value = 0.3; g.connect(v).connect(A.verb);
    src.start(t); src.stop(t + 2);
    for (let i = 0; i < 3; i++) A.tn(t + 0.7 + i * 0.18, { dur: 0.7, gain: 0.05, a: 0.05, f0: 1900 - i * 120, f1: 500 });
  },
  cannon(A, t) {             // ドカン!
    A.nz(t, { dur: 0.05, gain: 0.5, type: 'highpass', f0: 2000 });
    A.tn(t, { dur: 0.6, gain: 0.85, f0: 75, f1: 24 });
    A.nz(t, { dur: 0.7, gain: 0.55, type: 'lowpass', f0: 1500, f1: 120, verb: 0.5 });
    A.duckMusic(0.5, 0.4);
  },
  disc(A, t) {               // 回る刃が飛ぶ(シャキーン)
    A.tn(t, { dur: 0.2, gain: 0.1, wave: 'triangle', f0: 700, f1: 1500 });
    [2500, 3730].forEach((f) => A.tn(t, { dur: 0.3, gain: 0.04, f0: f * rnd(0.98, 1.02), verb: 0.4 }));
    A.nz(t, { dur: 0.15, gain: 0.12, type: 'bandpass', f0: 4000, q: 3 });
  },
  drone(A, t) {              // ピュン(小さなドローンの銃)
    A.tn(t, { dur: 0.06, gain: 0.1, wave: 'square', f0: rnd(1100, 1300), f1: 500, lp: 3000 });
    A.nz(t, { dur: 0.03, gain: 0.1, type: 'highpass', f0: 3500 });
  },
  tornado(A, t) {            // ゴォォ(風のうず)
    A.nz(t, { dur: 0.55, gain: 0.45, a: 0.15, type: 'bandpass', f0: rnd(300, 400), f1: rnd(800, 1000), q: 2.2 });
    A.nz(t, { dur: 0.6, gain: 0.18, a: 0.2, type: 'lowpass', f0: 250, verb: 0.3 });
  },
  meteor(A, t) {             // ヒュウゥゥ(落ちてくる)+ 地鳴り(爆発は 爆発の音)
    A.nz(t, { dur: 0.75, gain: 0.3, a: 0.1, type: 'bandpass', f0: 3200, f1: 300, q: 1.5 });
    A.tn(t, { dur: 0.8, gain: 0.07, a: 0.1, f0: 2400, f1: 400 });
    A.tn(t + 0.4, { dur: 0.5, gain: 0.25, a: 0.2, f0: 50, f1: 35 });
  },
  acid(A, t) {               // ゴポッ ジュワ
    osc(A, t, { wave: 'sine', f0: rnd(220, 300), f1: 140, dur: 0.14, gain: 0.25, lp: 1200, lfo: 30, lfoAmt: 60 });
    A.nz(t + 0.03, { dur: 0.25, gain: 0.12, a: 0.02, type: 'highpass', f0: 3000 });
  },
  nailgun(A, t) {            // プシュ・カン
    A.nz(t, { dur: 0.03, gain: 0.2, type: 'highpass', f0: 2800 });
    A.tn(t, { dur: 0.012, gain: 0.08, wave: 'square', f0: 2100 });
    A.tn(t, { dur: 0.06, gain: 0.25, f0: 180, f1: 80 });
  },
  emp(A, t) {                // キュイイイン → バチッ
    osc(A, t, { wave: 'sawtooth', f0: 200, f1: 2200, dur: 0.25, gain: 0.08, lp: 3500 });
    A.nz(t + 0.25, { dur: 0.3, gain: 0.45, type: 'bandpass', f0: 3000, q: 0.6, buf: A.crackle });
    A.tn(t + 0.25, { dur: 0.3, gain: 0.45, f0: 90, f1: 35 });
    A.tn(t + 0.25, { dur: 0.25, gain: 0.05, wave: 'square', f0: 60, lp: 900 });
  },
  shuriken(A, t) {           // シュッ・チン
    A.nz(t, { dur: 0.05, gain: 0.16, type: 'bandpass', f0: 4200, q: 1.5 });
    A.tn(t + 0.02, { dur: 0.12, gain: 0.035, f0: 3200 * rnd(0.97, 1.03) });
  },
  whip(A, t) {               // ヒュン → パァン
    A.nz(t, { dur: 0.1, gain: 0.12, a: 0.04, type: 'bandpass', f0: 700, f1: 3000, q: 1.2 });
    A.nz(t + 0.12, { dur: 0.025, gain: 0.5, type: 'highpass', f0: 2500 });
    A.tn(t + 0.12, { dur: 0.008, gain: 0.15, wave: 'square', f0: 1700 });
  },
  beam(A, t) {               // ブォォン(太い光線)
    osc(A, t, { wave: 'sawtooth', f0: 120, dur: 0.12, gain: 0.08, a: 0.02, lp: 1800, lfo: 14, lfoAmt: 8 });
    A.tn(t, { dur: 0.12, gain: 0.04, a: 0.02, f0: 880, f1: 860 });
    A.nz(t, { dur: 0.1, gain: 0.06, a: 0.02, type: 'bandpass', f0: 2000, q: 1 });
  },
  gatling(A, t) {            // ダダダ(ミニガンより重い)
    const p = rnd(0.94, 1.06);
    A.nz(t, { dur: 0.04, gain: 0.3, type: 'bandpass', f0: 1500 * p, q: 0.8 });
    A.nz(t, { dur: 0.06, gain: 0.2, type: 'lowpass', f0: 700 * p });
    A.tn(t, { dur: 0.05, gain: 0.32, f0: 130 * p, f1: 50 });
  },

  // ================= 主人公のダッシュ・叩きつけ =================
  dash(A, t) {               // シュバッ
    A.nz(t, { dur: 0.22, gain: 0.3, a: 0.02, type: 'bandpass', f0: 600, f1: 2600, q: 1.1 });
    A.tn(t, { dur: 0.12, gain: 0.18, f0: 140, f1: 70 });
  },
  slamJump(A, t) {           // ヒュイーン(飛び上がる)
    A.nz(t, { dur: 0.35, gain: 0.22, a: 0.05, type: 'bandpass', f0: 400, f1: 3000, q: 1.4 });
    osc(A, t, { wave: 'triangle', f0: 200, f1: 700, dur: 0.3, gain: 0.06, lp: 3000 });
  },
  slam(A, t, o) {            // ドッゴォン!(叩きつけ)
    const k = Math.min(1, 0.6 + ((o && o.kills) || 0) / 20);
    A.nz(t, { dur: 0.06, gain: 0.45, type: 'highpass', f0: 2500 });
    A.tn(t, { dur: 0.55, gain: 0.85 * k, f0: 90, f1: 26 });
    A.nz(t, { dur: 0.6, gain: 0.5 * k, type: 'lowpass', f0: 2200, f1: 150, verb: 0.5 });
    [1250, 1870].forEach((f) => A.tn(t + 0.02, { dur: 0.4, gain: 0.03, f0: f, verb: 0.5 }));
    A.duckMusic(0.5, 0.4);
  },

  // ================= 新しいゾンビ =================
  clang(A, t) {              // 盾がこわれる(金属がガシャーン)
    [523, 1347, 2211, 3120].forEach((f, i) => A.tn(t, { dur: 0.5 - i * 0.08, gain: 0.06, f0: f * rnd(0.97, 1.03), verb: 0.4 }));
    A.nz(t, { dur: 0.25, gain: 0.4, type: 'highpass', f0: 2000 });
    A.tn(t, { dur: 0.15, gain: 0.3, f0: 160, f1: 70 });
  },
  screech(A, t) {            // 跳ぶゾンビの さけび
    osc(A, t, { wave: 'sawtooth', f0: rnd(520, 640), f1: rnd(300, 380), dur: 0.35, gain: 0.1, a: 0.03, lp: 2600, q: 4, lfo: 22, lfoAmt: 40, dist: true, pan: rnd(-0.5, 0.5) });
  },
  thud(A, t) {               // 空から落ちて 地面にドサッ
    A.tn(t, { dur: 0.12, gain: 0.25, f0: 110, f1: 45, pan: rnd(-0.6, 0.6) });
    A.nz(t, { dur: 0.08, gain: 0.18, type: 'lowpass', f0: 600 });
  },
  stomp(A, t, o) {           // 巨大ゾンビの足音(近いほど大きい)
    const k = Math.max(0.15, 1 - ((o && o.d) || 10) / 30);
    A.tn(t, { dur: 0.3, gain: 0.5 * k, f0: 60, f1: 28 });
    A.nz(t, { dur: 0.15, gain: 0.15 * k, type: 'lowpass', f0: 300 });
  },
  ignite(A, t) {             // ボワッ(火がうつる)
    A.nz(t, { dur: 0.35, gain: 0.28, a: 0.03, type: 'lowpass', f0: 1200, f1: 400, q: 1.5 });
    A.nz(t, { dur: 0.3, gain: 0.08, a: 0.05, type: 'bandpass', f0: 3000, q: 1, buf: A.crackle });
  },
  gas(A, t) {                // シューッ(毒ガス)
    A.nz(t, { dur: 0.8, gain: 0.14, a: 0.05, type: 'highpass', f0: 3500, verb: 0.2 });
    A.nz(t, { dur: 0.4, gain: 0.1, type: 'bandpass', f0: 900, q: 2 });
  },
  coin(A, t) {               // チャリン
    A.tn(t, { dur: 0.15, gain: 0.05, f0: note(rnd(0, 1) < 0.5 ? 19 : 24) });
    A.tn(t + 0.05, { dur: 0.2, gain: 0.04, f0: note(28), verb: 0.3 });
  },
  sizzle(A, t) {             // 酸がジュッ
    A.nz(t, { dur: 0.5, gain: 0.18, a: 0.01, type: 'highpass', f0: 4000, buf: A.crackle, rate: 0.7 });
    A.tn(t, { dur: 0.15, gain: 0.15, f0: 160, f1: 70 });
  },

  // ================= 無双モード =================
  fever(A, t) {              // ギュイーン → ジャーン!
    A.nz(t, { dur: 0.6, gain: 0.25, a: 0.5, type: 'bandpass', f0: 300, f1: 5000, q: 1.5 });
    osc(A, t, { wave: 'sawtooth', f0: 110, f1: 880, dur: 0.6, gain: 0.05, a: 0.4, lp: 4000 });
    const t1 = t + 0.6;
    [0, 4, 7, 12, 16].forEach((s) => { osc(A, t1, { wave: 'sawtooth', f0: note(s - 12), dur: 1.3, gain: 0.04, a: 0.01, lp: 3500, verb: 0.4 }); osc(A, t1, { wave: 'sawtooth', f0: note(s - 12) * 1.006, dur: 1.3, gain: 0.03, a: 0.01, lp: 3000 }); });
    A.tn(t1, { dur: 0.5, gain: 0.7, f0: 110, f1: 35 });
    A.nz(t1, { dur: 1.2, gain: 0.18, type: 'highpass', f0: 5000, verb: 0.4 });
    A.duckMusic(0.4, 0.9);
  },
  feverend(A, t) {
    [7, 4, 0].forEach((s, i) => A.tn(t + i * 0.1, { dur: 0.3, gain: 0.05, wave: 'triangle', f0: note(s), verb: 0.3 }));
    A.nz(t, { dur: 0.6, gain: 0.1, a: 0.05, type: 'bandpass', f0: 3000, f1: 300, q: 1.2 });
  },

  // ================= 出来事の合図 =================
  supply(A, t) {             // 輸送機のブーン + 無線のピピッ
    A.nz(t, { dur: 1.8, gain: 0.22, a: 0.6, type: 'bandpass', f0: 160, f1: 260, q: 1.5, verb: 0.3 });
    osc(A, t, { wave: 'sawtooth', f0: 72, f1: 66, dur: 1.8, gain: 0.05, a: 0.6, lp: 400, lfo: 9, lfoAmt: 3 });
    [0, 0.12].forEach((d) => A.tn(t + 0.1 + d, { dur: 0.07, gain: 0.05, wave: 'square', f0: 1760, lp: 3000 }));
  },
  supplyOpen(A, t) {         // パワーアップ!(上がっていく音)
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => A.tn(t + i * 0.045, { dur: 0.16, gain: 0.04, wave: 'square', f0: note(s), lp: 4000 }));
    [12, 16, 19, 24].forEach((s) => A.tn(t + 0.32, { dur: 0.8, gain: 0.035, wave: 'triangle', f0: note(s), verb: 0.5 }));
    A.nz(t + 0.32, { dur: 0.6, gain: 0.12, type: 'highpass', f0: 6000, verb: 0.3 });
  },
  golden(A, t) {             // キラキラ(鐘のグリッサンド)
    [24, 21, 19, 16, 14, 12, 9, 7].forEach((s, i) => A.tn(t + i * 0.06, { dur: 0.6, gain: 0.04, f0: note(s), verb: 0.6 }));
    A.nz(t, { dur: 0.8, gain: 0.08, a: 0.1, type: 'highpass', f0: 7000, verb: 0.4 });
  },
  goldenDown(A, t) {         // じゃらじゃら(コインのシャワー)
    for (let i = 0; i < 14; i++) A.tn(t + rnd(0, 0.7), { dur: 0.12, gain: 0.035, f0: note([19, 24, 28, 31][(Math.random() * 4) | 0]) * rnd(0.99, 1.01), verb: 0.3 });
    [0, 4, 7, 12].forEach((s) => A.tn(t, { dur: 0.6, gain: 0.04, wave: 'triangle', f0: note(s), verb: 0.3 }));
  },
  goldenEscape(A, t) { [4, 0].forEach((s, i) => A.tn(t + i * 0.22, { dur: 0.35, gain: 0.05, wave: 'triangle', f0: note(s - 5), verb: 0.3 })); },
  march(A, t) {              // ザッザッ(行進の太鼓)+ 低いラッパ
    for (let i = 0; i < 8; i++) { A.nz(t + i * 0.18, { dur: 0.08, gain: i % 2 ? 0.14 : 0.24, type: 'bandpass', f0: 1800, q: 0.8 }); if (i % 2 === 0) A.tn(t + i * 0.18, { dur: 0.15, gain: 0.3, f0: 90, f1: 45 }); }
    [1, 1.5].forEach((m) => osc(A, t + 0.1, { wave: 'sawtooth', f0: 82 * m, dur: 1.2, gain: 0.05, a: 0.2, lp: 700, verb: 0.4 }));
  },
  tsunami(A, t) {            // ゴゴゴゴ(地鳴り)+ ラッパ
    A.nz(t, { dur: 2.0, gain: 0.35, a: 0.5, type: 'lowpass', f0: 180, verb: 0.5 });
    A.tn(t, { dur: 2.0, gain: 0.3, a: 0.5, f0: 38, f1: 32 });
    [1, 1.5, 2].forEach((m) => osc(A, t + 0.3, { wave: 'sawtooth', f0: 73 * m, dur: 1.4, gain: 0.05, a: 0.3, lp: 900, verb: 0.5 }));
    A.duckMusic(0.5, 2.0);
  },
  skyfall(A, t) {            // ヒュルルル(たくさん落ちてくる)
    for (let i = 0; i < 6; i++) A.tn(t + i * 0.15, { dur: 0.9, gain: 0.04, a: 0.05, f0: rnd(1600, 2200), f1: rnd(300, 500), pan: rnd(-0.8, 0.8) });
  },
  alarm(A, t) { for (let i = 0; i < 6; i++) A.tn(t + i * 0.18, { dur: 0.15, gain: 0.06, a: 0.01, wave: 'square', f0: i % 2 ? 660 : 880, lp: 2500 }); },
  challenge(A, t) {          // チッチッチッ … ピーッ!
    for (let i = 0; i < 4; i++) A.tn(t + i * 0.2, { dur: 0.03, gain: 0.08, wave: 'square', f0: 2000, lp: 4000 });
    A.tn(t + 0.85, { dur: 0.35, gain: 0.08, wave: 'square', f0: 1320, lp: 3500 });
    A.tn(t + 0.85, { dur: 0.3, gain: 0.3, f0: 120, f1: 50 });
  },
  challengeClear(A, t) {
    [[0, 0], [4, 0.09], [7, 0.18], [12, 0.27]].forEach(([s, d]) => A.tn(t + d, { dur: 0.14, gain: 0.07, wave: 'square', f0: note(s), lp: 3500 }));
    [0, 4, 7, 12, 16].forEach((s) => osc(A, t + 0.4, { wave: 'sawtooth', f0: note(s), dur: 1.0, gain: 0.035, a: 0.01, lp: 3500, verb: 0.4 }));
    A.tn(t + 0.4, { dur: 0.3, gain: 0.45, f0: 120, f1: 40 });
    A.duckMusic(0.5, 1.0);
  },
  challengeFail(A, t) { [0, -1, -2, -3].forEach((s, i) => A.tn(t + i * 0.16, { dur: 0.22, gain: 0.05, wave: 'triangle', f0: note(s - 5) })); },
  discover(A, t) {           // ポロン♪(新しい場所)
    [[7, 0], [12, 0.12], [16, 0.24]].forEach(([s, d]) => A.tn(t + d, { dur: 0.7, gain: 0.05, wave: 'triangle', f0: note(s), verb: 0.5 }));
  },

  // ================= 新しいボスの動き =================
  bossgrab(A, t) {           // 車をつかむ(金属がきしむ)
    osc(A, t, { wave: 'sawtooth', f0: 180, f1: 120, dur: 0.4, gain: 0.07, lp: 1500, q: 6, lfo: 30, lfoAmt: 20 });
    A.nz(t, { dur: 0.2, gain: 0.25, type: 'lowpass', f0: 800 });
  },
  bossthrow(A, t) {          // ブォン(投げる)
    A.nz(t, { dur: 0.5, gain: 0.3, a: 0.08, type: 'bandpass', f0: 250, f1: 900, q: 1.2 });
    osc(A, t, { wave: 'sawtooth', f0: 70, f1: 50, dur: 0.6, gain: 0.12, a: 0.05, lp: 500, dist: true });
  },
  birth(A, t) {              // グチュッ(産む)
    for (let i = 0; i < 4; i++) osc(A, t + i * 0.08, { wave: 'sine', f0: rnd(120, 220), f1: 70, dur: 0.18, gain: 0.25, lp: 900, lfo: 25, lfoAmt: 40 });
    A.nz(t, { dur: 0.5, gain: 0.15, a: 0.05, type: 'lowpass', f0: 900, f1: 300 });
  },
  spit(A, t) {               // ペッ!(酸を吐く)
    A.nz(t, { dur: 0.12, gain: 0.3, type: 'bandpass', f0: 1200, q: 1.5 });
    osc(A, t, { wave: 'sawtooth', f0: 400, f1: 180, dur: 0.2, gain: 0.06, lp: 2000, q: 3 });
  },
  rev(A, t) {                // ブォンブォン(エンジンをふかす)
    osc(A, t, { wave: 'sawtooth', f0: 48, f1: 110, dur: 0.85, gain: 0.16, a: 0.05, lp: 700, lfo: 24, lfoAmt: 8, dist: true });
    A.nz(t, { dur: 0.8, gain: 0.12, a: 0.1, type: 'lowpass', f0: 300 });
  },
  carhorn(A, t) {            // ブーッ!(突進のクラクション)
    [311, 370, 466].forEach((f) => osc(A, t, { wave: 'square', f0: f, dur: 0.8, gain: 0.03, a: 0.02, lp: 1600 }));
    A.duckMusic(0.6, 0.6);
  },
};

// ボスの声(種類で変える)。bossroar の代わりに鳴らす
export function bossRoar(A, t, type) {
  const c = A.ctx;
  // 警報(ウー・ウー)は 共通
  for (let i = 0; i < 4; i++) A.tn(t + i * 0.26, { dur: 0.22, gain: 0.07, a: 0.02, wave: 'square', f0: i % 2 ? 330 : 440, lp: 1800 });
  const t0 = t + 0.9;
  const V = {
    tyrant: { f: [62, 63.5, 93], dur: 1.9, lp: 1200 },
    butcher: { f: [80, 82, 120], dur: 1.6, lp: 1100 },
    abomination: { f: [70, 105, 140], dur: 2.0, lp: 1600 },
    crawlerKing: { f: [180, 185, 270], dur: 1.3, lp: 2600 },
    gorilla: { f: [55, 56.5, 82], dur: 2.1, lp: 1000 },
    queen: { f: [330, 336, 495], dur: 1.5, lp: 3600 },
    tank: null,
  }[type] || { f: [72, 73.5, 108], dur: 1.8, lp: 1300 };
  if (type === 'tank') {      // 装甲車: エンジン + クラクション
    SOUNDS2.rev(A, t0); SOUNDS2.carhorn(A, t0 + 0.8);
    A.tn(t0, { dur: 0.5, gain: 0.5, f0: 60, f1: 30 });
    A.duckMusic(0.35, 2.0);
    return;
  }
  const dur = V.dur;
  const ws = shaper(A);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
  lp.frequency.setValueAtTime(V.lp * 0.25, t0); lp.frequency.exponentialRampToValueAtTime(V.lp, t0 + 0.4); lp.frequency.exponentialRampToValueAtTime(V.lp * 0.27, t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.2); g.gain.setValueAtTime(0.3, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  ws.connect(lp).connect(g).connect(A.sfx);
  const v = c.createGain(); v.gain.value = 0.5; g.connect(v).connect(A.verb);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = type === 'queen' ? 31 : 7; lg.gain.value = type === 'queen' ? 40 : 6; lfo.connect(lg);
  for (let i = 0; i < 3; i++) {
    const f = V.f[i], o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t0); o.frequency.linearRampToValueAtTime(f * 1.25, t0 + 0.35); o.frequency.exponentialRampToValueAtTime(f * 0.65, t0 + dur);
    o.detune.value = i * 5; lg.connect(o.frequency); o.connect(ws); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  A.nz(t0, { dur: dur * 0.9, gain: 0.22, a: 0.15, type: 'bandpass', f0: V.lp * 0.35, f1: V.lp * 0.2, q: 0.7, verb: 0.4 });
  A.tn(t0, { dur: 0.5, gain: 0.6, f0: 70, f1: 30 });
  if (type === 'gorilla') for (let i = 0; i < 6; i++) A.tn(t0 + dur + 0.1 + i * 0.13, { dur: 0.12, gain: 0.45, f0: 95, f1: 45 });   // 胸をたたく
  A.duckMusic(0.35, dur + 0.6);
}
