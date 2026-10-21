// 視点係(向き): 肩越し・一人称で、指・マウスの動きを「向き」に直す。
// 速さの設定・上下反対・上下の見すぎ防止、そして「自動で向きを合わせる」(さわっていない間、ゾンビの多い方へ ゆっくり向く)。
import { CONFIG } from './config.js';
import { angleDiff, damp } from './util.js';

const V = CONFIG.VIEW;
const SECT = 16;
const _sec = new Float32Array(SECT), _sx = new Float32Array(SECT), _sz = new Float32Array(SECT);
const _t = { x: 0, y: 0 }, _m = { x: 0, y: 0 };

export const Look = {
  targetYaw: null,          // 自動で向く先(なければ null)
  turning: false,           // 自動で回っている最中
  _scanT: 0, _sector: -1,

  reset() { this.targetYaw = null; this.turning = false; this._sector = -1; },

  // フレームごと(プレイ中・肩越し/一人称のとき)
  update(dt, E, input, ctx) {
    const st = E.settings, sens = st.sens, inv = st.invertY ? -1 : 1;
    input.consumeLook(_t); input.consumeLookMouse(_m);
    const dx = _t.x * V.SENS_TOUCH * sens + _m.x * V.SENS_MOUSE * sens;
    const dy = (_t.y * V.SENS_TOUCH * 0.75 + _m.y * V.SENS_MOUSE * 0.85) * sens * inv;
    if (dx || dy) E.look(dx, -dy);

    // 自動で向きを合わせる: 右側を さわっていない・マウスで動かしていない(0.7 秒)とき
    const idle = !input.lookHeld && performance.now() - input.lookT > 700 && !document.pointerLockElement;
    this.turning = false;
    if (!(st.autoTurn || input.auto) || !idle || !ctx || !ctx.Zombies) { this.targetYaw = null; return; }
    if ((this._scanT -= dt) <= 0) { this._scanT = 0.15; this._scan(E, ctx); }
    // 上下は ふつうの高さへ もどす
    const p0 = E.viewMode === 'fps' ? V.FPS.PITCH0 : V.TPS.PITCH0;
    E.look(0, damp(E.lookPitch, p0, 1.6, dt) - E.lookPitch);
    if (this.targetYaw === null) return;
    const d = angleDiff(E.lookYaw, this.targetYaw), ad = Math.abs(d);
    if (ad < 0.05) return;
    // 近いほど ゆっくり、遠いほど 速く(でも 急には回らない)。撃っている間は 少し速く
    const rate = Math.min(V.AUTO_TURN * (input.fire ? 1.15 : 0.85), 0.6 + ad * 2.4);
    E.look(Math.sign(d) * Math.min(ad, rate * dt), 0);
    this.turning = true;
  },

  // まわりのゾンビを 16 の向きに分けて数え、いちばん「濃い」向きを えらぶ(今の向きを少しひいき = ふらふらしない)
  _scan(E, ctx) {
    const P = ctx.Player, L = ctx.Zombies.list, px = P.pos.x, pz = P.pos.z;
    _sec.fill(0); _sx.fill(0); _sz.fill(0);
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const e = L[i]; if (!e.alive) continue;
      const dx = e.x - px, dz = e.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > 30 * 30 || d2 < 0.3) continue;
      const d = Math.sqrt(d2), a = Math.atan2(dx, -dz);
      let s = Math.floor(((a + Math.PI) / (Math.PI * 2)) * SECT); if (s >= SECT) s = 0;
      const w = (e.boss ? 4 : 1) / (1 + d * 0.12);
      _sec[s] += w; _sx[s] += dx / d * w; _sz[s] += dz / d * w; n++;
    }
    if (!n) { this.targetYaw = null; this._sector = -1; return; }
    const curA = E.lookYaw;
    let cs = Math.floor(((Math.atan2(Math.sin(curA), Math.cos(curA)) + Math.PI) / (Math.PI * 2)) * SECT); if (cs >= SECT) cs = 0;
    // 正面に もう敵がいれば そのまま(撃っている相手から 目をそらさない)
    const front = _sec[cs] + 0.5 * (_sec[(cs + 1) % SECT] + _sec[(cs + SECT - 1) % SECT]);
    let best = -1, bv = 0;
    for (let s = 0; s < SECT; s++) {
      let v = _sec[s] + 0.5 * (_sec[(s + 1) % SECT] + _sec[(s + SECT - 1) % SECT]);
      if (s === this._sector) v *= 1.3;
      if (v > bv) { bv = v; best = s; }
    }
    if (front > 0.35 && front >= bv * 0.45) best = cs;
    this._sector = best;
    const sx = _sx[best] + 0.5 * (_sx[(best + 1) % SECT] + _sx[(best + SECT - 1) % SECT]);
    const sz = _sz[best] + 0.5 * (_sz[(best + 1) % SECT] + _sz[(best + SECT - 1) % SECT]);
    this.targetYaw = Math.atan2(sx, -sz);
  },
};
