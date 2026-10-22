// 音係(第4弾): ボスの演出の音。audio.js の SOUNDS に足す。A = Audio(nz = ノイズ / tn = 音程のある音 / ctx / sfx / verb / duckMusic)。
//   bossIntro   登場: 太鼓(だんだん速く)+ せり上がるうなり + 低い金管「ブワァーン」
//   heroHit     主人公が ボスに なぐられた: 重い ドスッ + ガツン(短く)
//   bossPhase   怒り: うなり声の短い咆哮 + 不気味な和音 + 太鼓
//   bossKill    撃破の瞬間: 大きな ドーン + 鐘のきらめき
//   jpCoin      お金が点数へ入る チャリン(i が大きいほど高く = だんだん上がる)
//   jpLine      ごほうびの内わけが 1 行出る(だんだん高く)
//   jpTick      合計が くるくる上がる カチカチ
//   jpTotal     合計が決まった ジャーン
//   bossFanfare ボス撃破のファンファーレ(ふつうの fanfare より大きく長い)
//   bossNova    金の衝撃波(低い ドゥン + 風 + きらきら)
//   bossTick    次のボスまで のこり 3・2・1 秒(心臓の音)
// 音量は 今までの音(explosion・fanfare)と同じくらいまで(オフラインで鳴らして 大きさを確かめた)。
const rnd = (a, b) => a + Math.random() * (b - a);
const note = (semi) => 523.25 * Math.pow(2, semi / 12);   // C5 から 半音
const PENTA = [0, 2, 4, 7, 9];

export const GAP4 = {
  bossIntro: 1, heroHit: 0.2, bossPhase: 0.8, bossKill: 0.3, jpCoin: 0.028, jpLine: 0.08, jpTick: 0.05, jpTotal: 0.3,
  bossFanfare: 1.5, bossNova: 0.3, bossTick: 0.4,
};
export const LEN4 = { bossIntro: 2.2, heroHit: 0.4, bossPhase: 1.3, bossKill: 1.6, jpTotal: 1.2, bossFanfare: 2.6, bossNova: 1.4, bossTick: 0.4 };
export const IMPORTANT4 = ['bossIntro', 'heroHit', 'bossPhase', 'bossKill', 'jpLine', 'jpTotal', 'bossFanfare', 'bossNova', 'bossTick'];

let _curve = null;
function shaper(A) {
  const ws = A.ctx.createWaveShaper();
  if (!_curve) { _curve = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; _curve[i] = Math.tanh(x * 4); } }
  ws.curve = _curve;
  return ws;
}

// 太鼓 1 発
function taiko(A, t, v = 1, f = 110) {
  A.tn(t, { dur: 0.36, gain: 0.5 * v, f0: f, f1: f * 0.42 });
  A.nz(t, { dur: 0.1, gain: 0.22 * v, type: 'lowpass', f0: 500, f1: 150, verb: 0.3 });
}

// うなり声(のこぎり波 3 つ + ゆらし + 歪み)。短め
function growl(A, t, base, dur, gain, lp) {
  const c = A.ctx, ws = shaper(A);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
  f.frequency.setValueAtTime(lp * 0.3, t); f.frequency.exponentialRampToValueAtTime(lp, t + 0.25); f.frequency.exponentialRampToValueAtTime(lp * 0.3, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.12); g.gain.setValueAtTime(gain, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  ws.connect(f).connect(g).connect(A.sfx);
  const v = c.createGain(); v.gain.value = 0.45; g.connect(v).connect(A.verb);
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 8; lg.gain.value = 7; lfo.connect(lg);
  for (const m of [1, 1.02, 1.5]) {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * m, t); o.frequency.linearRampToValueAtTime(base * m * 1.3, t + 0.2); o.frequency.exponentialRampToValueAtTime(base * m * 0.7, t + dur);
    lg.connect(o.frequency); o.connect(ws); o.start(t); o.stop(t + dur + 0.05);
  }
  lfo.start(t); lfo.stop(t + dur + 0.05);
}

// 金管の和音(のこぎり波を少しずらして重ねる・こもらせる)
function brass(A, t, semis, dur, gain, lp = 2600, a = 0.03, verb = 0.4) {
  for (const s of semis) for (const dt of [-7, 7]) A.tn(t, { dur, gain, a, wave: 'sawtooth', f0: note(s), lp, verb, detune: dt });
}

export const SOUNDS4 = {
  bossIntro(A, t) {
    // 太鼓: ドン … ドン … ドン・ドン(だんだん速く)
    [[0, 0.8], [0.34, 0.85], [0.58, 0.9], [0.76, 1]].forEach(([d, v]) => taiko(A, t + d, v, 120 - d * 30));
    // せり上がる うなり
    A.nz(t, { dur: 0.25, gain: 0.16, a: 0.7, type: 'bandpass', f0: 180, f1: 2200, q: 1.4 });
    // 低い金管 ブワァーン + 地の底の ドン
    brass(A, t + 0.9, [-36, -29, -24], 1.25, 0.05, 700, 0.06, 0.5);
    A.tn(t + 0.9, { dur: 0.9, gain: 0.6, f0: 62, f1: 26 });
    A.nz(t + 0.9, { dur: 1.0, gain: 0.2, a: 0.02, type: 'lowpass', f0: 600, f1: 90, verb: 0.5 });
    A.duckMusic(0.25, 2.0);
  },

  heroHit(A, t, o) {
    const s = (o && o.s) || 1;
    A.tn(t, { dur: 0.24, gain: 0.7 * s, f0: 98, f1: 36 });
    A.nz(t, { dur: 0.16, gain: 0.42 * s, type: 'lowpass', f0: 2000, f1: 220 });
    A.nz(t + 0.005, { dur: 0.08, gain: 0.25 * s, type: 'bandpass', f0: 1100, q: 2, buf: A.crackle });
    A.tn(t, { dur: 0.3, gain: 0.04 * s, wave: 'triangle', f0: rnd(400, 460), verb: 0.3 });
    A.duckMusic(0.6, 0.25);
  },

  bossPhase(A, t, o) {
    const last = o && o.last;
    growl(A, t, last ? 58 : 66, 1.1, 0.26, 1300);
    brass(A, t + 0.05, last ? [-24, -21, -18, -13] : [-24, -21, -18], 0.9, 0.035, 1500, 0.02, 0.5);   // 不気味な和音(減七)
    taiko(A, t, 1, 100); taiko(A, t + 0.22, 0.8, 90);
    A.duckMusic(0.4, 1.2);
  },

  bossKill(A, t, o) {
    const big = Math.min(1.2, 0.85 + ((o && o.size) || 8) / 60);
    A.nz(t, { dur: 0.08, gain: 0.5, type: 'lowpass', f0: 7000, f1: 1500 });
    A.nz(t, { dur: 1.4, gain: 0.8 * big, a: 0.004, type: 'lowpass', f0: 2600, f1: 90, verb: 0.5 });
    A.tn(t, { dur: 1.1, gain: 0.9 * big, f0: 72, f1: 24 });
    [1568, 2093, 2637, 3136].forEach((f, i) => A.tn(t + 0.05 + i * 0.03, { dur: 1.3, gain: 0.035, f0: f, verb: 0.55 }));
    A.duckMusic(0.3, 1.6);
  },

  jpCoin(A, t, o) {
    const i = Math.min(24, (o && o.i) || 0), semi = PENTA[i % 5] + 12 * Math.floor(i / 5) + 7;
    const f = note(Math.min(31, semi)), pan = rnd(-0.5, 0.5);
    A.tn(t, { dur: 0.12, gain: 0.09, f0: f, pan });
    A.tn(t, { dur: 0.07, gain: 0.035, f0: f * 2.76, pan });
    A.tn(t + 0.03, { dur: 0.1, gain: 0.03, wave: 'triangle', f0: f * 1.5, pan, verb: 0.2 });
  },

  jpLine(A, t, o) {
    const i = (o && o.i) || 1, s = [0, 4, 7, 12, 16, 19, 24][Math.min(6, i - 1)];
    A.tn(t, { dur: 0.12, gain: 0.06, wave: 'square', f0: note(s - 12), lp: 2800 });
    A.tn(t, { dur: 0.16, gain: 0.04, wave: 'triangle', f0: note(s), verb: 0.25 });
    A.tn(t, { dur: 0.1, gain: 0.3, f0: 150, f1: 55 });
  },

  jpTick(A, t, o) {
    const k = (o && o.k) || 0;
    A.tn(t, { dur: 0.03, gain: 0.05, wave: 'square', f0: 700 + 1300 * k, lp: 4000 });
  },

  jpTotal(A, t) {
    A.nz(t, { dur: 1.1, gain: 0.15, type: 'highpass', f0: 4500, verb: 0.4 });
    brass(A, t, [0, 4, 7, 12], 0.8, 0.03, 3200, 0.008, 0.35);
    A.tn(t, { dur: 0.3, gain: 0.5, f0: 120, f1: 40 });
  },

  bossFanfare(A, t) {
    // ティンパニの連打 → 3 連符で かけあがって ジャーーン
    for (let i = 0; i < 12; i++) A.tn(t + i * 0.04, { dur: 0.08, gain: 0.06 + i * 0.018, f0: 98, f1: 80 });
    [[-5, 0.0], [0, 0.09], [4, 0.18]].forEach(([s, d]) => brass(A, t + d, [s, s + 12], 0.1, 0.035, 3000, 0.005, 0.2));
    brass(A, t + 0.27, [7, 19], 0.2, 0.04, 3200, 0.005, 0.3);
    brass(A, t + 0.5, [0, 4, 7, 12, 16], 1.7, 0.026, 3400, 0.01, 0.45);
    brass(A, t + 0.5, [-24, -17, -12], 1.5, 0.04, 1100, 0.01, 0.4);
    A.tn(t + 0.5, { dur: 0.6, gain: 0.6, f0: 110, f1: 38 });
    A.nz(t + 0.5, { dur: 1.8, gain: 0.17, type: 'highpass', f0: 4500, verb: 0.4 });
    // きらきら かけあがり
    [12, 16, 19, 24, 28, 31].forEach((s, i) => A.tn(t + 1.15 + i * 0.065, { dur: 0.3, gain: 0.04, wave: 'triangle', f0: note(s), verb: 0.4 }));
    A.duckMusic(0.35, 2.4);
  },

  bossNova(A, t) {
    A.tn(t, { dur: 1.3, gain: 0.85, f0: 52, f1: 22 });
    A.nz(t, { dur: 1.2, gain: 0.6, a: 0.01, type: 'lowpass', f0: 3200, f1: 80, verb: 0.5 });
    A.nz(t + 0.02, { dur: 0.7, gain: 0.22, a: 0.08, type: 'bandpass', f0: 3000, f1: 300, q: 1.2 });
    [3951, 3136, 2637, 2093].forEach((f, i) => A.tn(t + 0.08 + i * 0.07, { dur: 0.9, gain: 0.028, f0: f, verb: 0.5 }));
    A.duckMusic(0.3, 1.2);
  },

  bossTick(A, t, o) {
    const n = (o && o.n) || 3;
    A.tn(t, { dur: 0.12, gain: 0.45, f0: 72, f1: 44 });
    A.tn(t + 0.17, { dur: 0.12, gain: 0.28, f0: 66, f1: 42 });
    A.tn(t, { dur: 0.09, gain: 0.04, wave: 'square', f0: note(n === 1 ? 7 : 0), lp: 2400 });
  },
};
