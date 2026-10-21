// 音係: 効果音と BGM を WebAudio で作る(音のファイルは使わない)。最初のタップのあとに鳴らし始める。
import { Events } from './events.js';

export const Audio = {
  ctx: null, master: null, muted: false,

  init() {
    Events.on('fire', () => this.shot());
  },

  // 最初のタップで呼ぶ(ブラウザの決まり)
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.6; },

  shot() {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime, len = 0.08;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(); g.gain.value = 0.25;
    src.connect(g).connect(this.master); src.start(t);
  },
};
