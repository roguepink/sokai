// 画面の演出部品: 飛び出す数字(ダメージ・+点数)/ まんなかの大きな文字(バナー)/ 画面フラッシュ / 紙ふぶき。
// どれも DOM を最初に作って使い回す(毎回 new しない)。動かすのは transform と opacity だけ(軽い)。
import { Engine } from './engine.js';

// ---------- 飛び出す数字 ----------
// 3D の場所に出して、上にふわっと上がって消える。数が多いときは間引く。
export class Popups {
  constructor(layer, size, cls) {
    this.items = [];
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'pop ' + cls;
      el.style.opacity = '0';
      layer.appendChild(el);
      this.items.push({ el, on: false, x: 0, y: 0, z: 0, age: 0, life: 1, s: 1, jx: 0, rise: 50, kind: '' });
    }
    this._next = 0;
  }

  // kind は CSS のクラス(色・大きさ)。s = 大きさの倍率
  spawn(x, y, z, text, kind, s = 1, life = 0.9, rise = 50) {
    // 空きをさがす。なければいちばん古いものを使う
    let it = null, oldest = null;
    for (const p of this.items) { if (!p.on) { it = p; break; } if (!oldest || p.age / p.life > oldest.age / oldest.life) oldest = p; }
    if (!it) it = oldest;
    it.on = true; it.x = x; it.y = y; it.z = z; it.age = 0; it.life = life; it.s = s; it.rise = rise;
    it.jx = (Math.random() - 0.5) * 30;
    if (it.kind !== kind) { it.el.className = 'pop ' + kind; it.kind = kind; }
    it.el.textContent = text;
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.on) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) { p.on = false; p.el.style.opacity = '0'; continue; }
      const sc = Engine.project(p.x, p.y, p.z, _pt);
      if (!sc) { p.el.style.opacity = '0'; continue; }
      // 肩越し・一人称: 近いほど大きく、遠いほど小さく。カメラのすぐ前・後ろは出さない
      let ds = 1;
      if (Engine.viewMode && Engine.viewMode !== 'top') {
        const c = Engine.camera.position, d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
        if (d < 1.6) { p.el.style.opacity = '0'; continue; }
        ds = Math.max(0.55, Math.min(1.5, 9 / d));
      }
      // 最初にぽんと大きく → ふつう。上に上がって最後に消える
      const pop = t < 0.12 ? 1.5 - (t / 0.12) * 0.5 : 1;
      const up = (1 - (1 - t) * (1 - t)) * p.rise * ds;
      let op = t > 0.55 ? 1 - (t - 0.55) / 0.45 : 1;
      const x = sc.x + p.jx * t, y = sc.y - up;
      // 上の点数の帯・右下のボタンの上には出さない。主人公の真上は うすく(まわりが見えるように)
      if (y < Avoid.top || (x > innerWidth - 270 && y > innerHeight - 220)) op = 0;
      else {
        const dx = x - Avoid.hx, dy = y - Avoid.hy, d2 = dx * dx + dy * dy;
        if (d2 < Avoid.r * Avoid.r) op *= 0.25 + 0.75 * Math.sqrt(d2) / Avoid.r;
      }
      p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) scale(${(pop * p.s * ds).toFixed(3)})`;
      p.el.style.opacity = op.toFixed(2);
    }
  }

  clear() { for (const p of this.items) { p.on = false; p.el.style.opacity = '0'; } }
}
const _pt = {};
// 数字をよける場所(UI が毎フレーム入れる): 主人公の画面の位置(hx, hy)と半径 r、上の帯の下はし top
export const Avoid = { hx: -999, hy: -999, r: 70, top: 70 };

// ---------- まんなかの大きな文字 ----------
// 大事なもの(ボス・記録)は割りこむ。ふつうのもの(区切りの数)は順番待ち。
export class Banner {
  constructor(el) {
    this.el = el;
    this.main = el.querySelector('b');
    this.sub = el.querySelector('small');
    this.queue = [];
    this.t = 0; this.prio = -1;
  }

  // style: 'gold' | 'red' | 'boss' | 'record' | 'horde' | 'combo' | 'kills' | 'start'
  show(text, sub = '', style = 'gold', dur = 1.6, prio = 1) {
    const item = { text, sub, style, dur, prio };
    if (this.t > 0 && prio <= this.prio) {
      // 順番待ち(同じ種類の古いものは捨てる。ためすぎない)
      this.queue = this.queue.filter((q) => q.style !== style || q.prio > 1);
      this.queue.push(item);
      if (this.queue.length > 3) this.queue.shift();
      return;
    }
    this._play(item);
  }

  _play(it) {
    this.main.textContent = it.text;
    this.sub.textContent = it.sub;
    this.sub.style.display = it.sub ? '' : 'none';
    this.el.className = 'banner ' + it.style;
    void this.el.offsetWidth;            // アニメーションを最初から
    this.el.classList.add('on');
    this.el.style.setProperty('--dur', it.dur + 's');
    this.t = it.dur; this.prio = it.prio;
    if (this.onPlay) this.onPlay(it);
  }

  update(dt) {
    if (this.t > 0) {
      this.t -= dt;
      // 待っている人がいたら、少し早めに次へ
      if (this.queue.length && this.t < it_min(this.prio)) this.t = Math.min(this.t, 0);
      if (this.t <= 0) {
        this.prio = -1;
        this.el.classList.remove('on');
        if (this.queue.length) this._play(this.queue.shift());
      }
    }
  }

  clear() { this.queue.length = 0; this.t = 0; this.prio = -1; this.el.classList.remove('on'); }
}
// 順番待ちがあるとき、今のバナーを最低どれだけ見せるか(秒の残り)
function it_min(prio) { return prio >= 2 ? 0 : 0.5; }

// ---------- 画面フラッシュ ----------
export function flash(el, color, strength = 0.5, ms = 350) {
  if (!el.animate) return;
  el.style.background = color;
  el.animate([{ opacity: strength }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
}

// ---------- 紙ふぶき ----------
const COLORS = ['#ffd23f', '#ff5a1f', '#ff3b6b', '#3fd0ff', '#7dff6b', '#ffffff', '#c77dff'];
export class Confetti {
  constructor(layer, n) {
    this.bits = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      b.className = 'confetti';
      layer.appendChild(b);
      this.bits.push(b);
    }
  }

  burst(count = this.bits.length) {
    const W = innerWidth, H = innerHeight;
    for (let i = 0; i < Math.min(count, this.bits.length); i++) {
      const b = this.bits[i];
      if (!b.animate) return;
      const x0 = W * (0.5 + (Math.random() - 0.5) * 0.3), y0 = H * 0.42;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = (0.35 + Math.random() * 0.45) * Math.max(W, H);
      const x1 = x0 + Math.cos(ang) * sp * 0.8, y1 = y0 + Math.sin(ang) * sp * 0.45;
      const x2 = x1 + (Math.random() - 0.5) * 120, y2 = H + 40;
      const r = Math.random() * 720 - 360;
      b.style.background = COLORS[i % COLORS.length];
      b.style.width = (6 + Math.random() * 6) + 'px';
      b.style.height = (10 + Math.random() * 8) + 'px';
      const dur = 1800 + Math.random() * 1200;
      b.animate([
        { transform: `translate3d(${x0}px,${y0}px,0) rotate(0deg) scale(.3)`, opacity: 1 },
        { transform: `translate3d(${x1}px,${y1}px,0) rotate(${r * 0.4}deg) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate3d(${x2}px,${y2}px,0) rotate(${r}deg) scale(1)`, opacity: 0.9 },
      ], { duration: dur, easing: 'cubic-bezier(.2,.7,.4,1)', delay: Math.random() * 150, fill: 'none' });
    }
  }
}
