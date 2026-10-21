// 音係(第2弾・マップの音): こわせる物(ガラス・木・金属・プラスチック・水・布)/ 雷(近い = バリッ、遠い = ゴロゴロ)/
// ヘリが通る / 遠くの爆発 / カラス / 雨と風の音(World.weather・World.wet で変わる。建物の中では こもる)。
// audio.js の SOUNDS に足す。A = Audio(nz = ノイズ / tn = 音程のある音)。音量は ひかえめ(オフラインで鳴らして確かめた)。
import { World } from './world.js';
import { Player } from './player.js';

const rnd = (a, b) => a + Math.random() * (b - a);

// 同じ音を続けて鳴らすときの最短の間隔(秒)/ 鳴っている時間のめやす(同時の数を数える用)
export const GAP3 = { glass: 0.06, wood: 0.06, metalBreak: 0.07, plastic: 0.05, water: 0.25, cloth: 0.12, thunderNear: 0.5, thunderFar: 0.8, heli: 10, distantBoom: 2, crows: 3 };
export const LEN3 = { glass: 0.6, metalBreak: 0.7, water: 0.9, thunderNear: 2.5, thunderFar: 3, heli: 3, distantBoom: 2, crows: 1.2 };

// 主人公から遠いほど小さく(0.15〜1)
function near(o) {
  if (!o || o.x == null || !Player.pos) return 1;
  const d = Math.hypot(o.x - Player.pos.x, o.z - Player.pos.z);
  return Math.max(0.15, Math.min(1, 1.15 - d / 55));
}

export const SOUNDS3 = {
  // --- こわれる物 ---
  glass(A, t, o) {
    const k = near(o);
    A.nz(t, { dur: 0.08, gain: 0.3 * k, type: 'highpass', f0: 3500 });
    for (let i = 0; i < 6; i++) A.tn(t + rnd(0, 0.18), { dur: rnd(0.05, 0.14), gain: 0.035 * k, f0: rnd(3000, 7200), pan: rnd(-0.5, 0.5) });
    A.nz(t + 0.03, { dur: 0.35, gain: 0.08 * k, type: 'bandpass', f0: 6000, q: 1.5, buf: A.crackle, verb: 0.3 });
  },
  wood(A, t, o) {
    const k = near(o);
    A.nz(t, { dur: 0.06, gain: 0.4 * k, type: 'bandpass', f0: rnd(900, 1400), q: 1.6 });
    A.tn(t, { dur: 0.09, gain: 0.3 * k, f0: rnd(150, 210), f1: 70 });
    A.nz(t + 0.05, { dur: 0.2, gain: 0.12 * k, type: 'bandpass', f0: 700, q: 2, buf: A.crackle });
  },
  metalBreak(A, t, o) {
    const k = near(o), p = rnd(0.85, 1.15);
    [430, 1130, 1870, 2650].forEach((f, i) => A.tn(t, { dur: 0.45 - i * 0.07, gain: (0.06 - i * 0.01) * k, f0: f * p, verb: 0.25 }));
    A.nz(t, { dur: 0.07, gain: 0.3 * k, type: 'bandpass', f0: 2500, q: 1 });
    A.tn(t, { dur: 0.1, gain: 0.25 * k, f0: 120, f1: 55 });
  },
  plastic(A, t, o) {
    const k = near(o);
    A.nz(t, { dur: 0.05, gain: 0.25 * k, type: 'bandpass', f0: 1600, q: 2 });
    A.tn(t, { dur: 0.06, gain: 0.12 * k, f0: 330, f1: 180 });
  },
  water(A, t, o) {
    const k = near(o);
    A.nz(t, { dur: 0.08, gain: 0.3 * k, type: 'lowpass', f0: 1500 });
    A.nz(t + 0.02, { dur: 0.9, gain: 0.16 * k, a: 0.05, type: 'highpass', f0: 1800, f1: 2600 });   // シャーッと 吹き出す
    A.tn(t, { dur: 0.25, gain: 0.08 * k, f0: 220, f1: 90 });
  },
  cloth(A, t, o) {
    const k = near(o);
    A.nz(t, { dur: 0.22, gain: 0.6 * k, a: 0.01, type: 'bandpass', f0: 600, f1: 2600, q: 1.2, buf: A.crackle, rate: 1.4 });
  },

  // --- 雷: 近い = バリバリッ + ドーン / 遠い = 少しおくれて ゴロゴロ ---
  thunderNear(A, t) {
    A.nz(t, { dur: 0.12, gain: 0.55, type: 'highpass', f0: 1800, buf: A.crackle, rate: 0.7 });
    A.nz(t + 0.02, { dur: 0.3, gain: 0.45, type: 'lowpass', f0: 5000, f1: 900 });
    A.tn(t + 0.03, { dur: 0.9, gain: 0.6, f0: 70, f1: 28 });
    A.nz(t + 0.08, { dur: 2.4, gain: 0.32, a: 0.05, type: 'lowpass', f0: 600, f1: 70, verb: 0.6 });
    A.duckMusic(0.5, 0.9);
  },
  thunderFar(A, t) {
    const d = rnd(0.5, 1.6);                     // 光ってから 音が来るまで
    A.nz(t + d, { dur: 2.6, gain: 0.2, a: 0.35, type: 'lowpass', f0: 320, f1: 60, verb: 0.5 });
    A.nz(t + d + 0.5, { dur: 1.6, gain: 0.1, a: 0.25, type: 'lowpass', f0: 220, f1: 50 });
    A.tn(t + d, { dur: 1.5, gain: 0.12, a: 0.3, f0: 48, f1: 30 });
  },

  // --- ヘリ: 遠くから近づいて 頭の上を通り、遠ざかる(バラバラ…。約 22 秒) ---
  heli(A, t) {
    const c = A.ctx, dur = 22, src = c.createBufferSource();
    src.buffer = A.noise; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 160; bp.Q.value = 0.9;
    const chop = c.createGain(); chop.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(10.5, t); lfo.frequency.linearRampToValueAtTime(11.5, t + dur * 0.5); lfo.frequency.linearRampToValueAtTime(10, t + dur);
    const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(chop.gain);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.16, t + 8); env.gain.exponentialRampToValueAtTime(0.45, t + 13);
    env.gain.exponentialRampToValueAtTime(0.2, t + 17); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = A.sfx;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + dur); p.connect(A.sfx); out = p; }
    src.connect(bp).connect(chop).connect(env).connect(out);
    src.start(t, Math.random()); src.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1);
  },

  // --- 遠くの爆発(ドゥン…。光が見えてから 少しおくれて) ---
  distantBoom(A, t) {
    const d = rnd(0.6, 1.1);
    A.nz(t + d, { dur: 1.8, gain: 0.2, a: 0.04, type: 'lowpass', f0: 380, f1: 60, verb: 0.6 });
    A.tn(t + d, { dur: 1.0, gain: 0.22, f0: 55, f1: 30 });
  },

  // --- カラス(カァ カァ。飛び立つ羽の音) ---
  crows(A, t) {
    const c = A.ctx;
    A.nz(t, { dur: 0.5, gain: 0.1, a: 0.05, type: 'bandpass', f0: 500, q: 0.8, buf: A.crackle, rate: 2 });
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const s = t + 0.1 + i * rnd(0.18, 0.32), f = rnd(560, 760), dur = rnd(0.16, 0.24);
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 0.72, s + dur);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = rnd(1100, 1500); f1.Q.value = 3;
      const g = c.createGain(); A._env(g, s, 0.015, 0.32, dur);
      o.connect(f1).connect(g).connect(A._out(A.sfx, rnd(-0.6, 0.6)));
      const v = c.createGain(); v.gain.value = 0.3; g.connect(v).connect(A.verb);
      o.start(s); o.stop(s + dur + 0.05);
    }
  },
};

// ---------- 雨と風の音(ずっと鳴る。0.25 秒ごとに audio.js の _ambient から) ----------
// 音のもとは 最初に 1 回だけ作る(天気が 雨/雷雨/雪/灰/霧 になったとき)。音量は ゆっくり変える
export const Weather = {
  nodes: null, _rain: 0, _wind: 0,

  _build(A) {
    const c = A.ctx;
    const out = c.createGain(); out.gain.value = 1; out.connect(A.master);
    // 雨: ザーッ(高い音を少し切る)。建物の中では こもる(lowpass を下げる)
    const rs = c.createBufferSource(); rs.buffer = A.noise; rs.loop = true;
    const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 500;
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    const rg = c.createGain(); rg.gain.value = 0;
    rs.connect(rh).connect(rl).connect(rg).connect(out);
    // 風: ヒューッ(帯の高さが ゆっくり動く)
    const ws = c.createBufferSource(); ws.buffer = A.noise; ws.loop = true; ws.playbackRate.value = 0.5;
    const wb = c.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 420; wb.Q.value = 1.4;
    const wl = c.createOscillator(); wl.frequency.value = 0.11; const wlg = c.createGain(); wlg.gain.value = 180;
    wl.connect(wlg).connect(wb.frequency);
    const wg = c.createGain(); wg.gain.value = 0;
    ws.connect(wb).connect(wg).connect(out);
    const t = c.currentTime;
    rs.start(t, Math.random()); ws.start(t, Math.random()); wl.start(t);
    this.nodes = { rg, wg, rl };
  },

  // state: 'play' | 'title' | 'paused' | 'result'
  update(A, state) {
    const c = A.ctx; if (!c) return;
    let w = 'clear', wet = 0, inside = false;
    try { w = World.weather || 'clear'; wet = World.wet || 0; inside = !!World.inside; } catch (e) { /* マップ係がまだ持っていない */ }
    const vol = state === 'play' ? 1 : state === 'title' ? 0.45 : 0;
    const rainW = w === 'storm' ? 1 : w === 'rain' ? 0.75 : 0;
    const windW = w === 'storm' ? 0.85 : w === 'snow' ? 0.6 : w === 'ash' ? 0.5 : w === 'fog' ? 0.25 : 0.06 * wet;
    // 天気が変わったら 8 秒くらいで 入れかわる(空の変わり方に合わせる)
    this._rain += (rainW - this._rain) * 0.04;
    this._wind += (windW - this._wind) * 0.04;
    if (!this.nodes) { if (this._rain + this._wind < 0.02 || vol === 0) return; this._build(A); }
    const t = c.currentTime, N = this.nodes;
    const rain = this._rain * (0.75 + 0.25 * wet) * vol * (inside ? 0.45 : 1);
    N.rg.gain.setTargetAtTime(rain * 0.055, t, 0.4);
    N.wg.gain.setTargetAtTime(this._wind * vol * (inside ? 0.4 : 1) * 0.07, t, 0.6);
    N.rl.frequency.setTargetAtTime(inside ? 1100 : 7000, t, 0.3);
  },
};
