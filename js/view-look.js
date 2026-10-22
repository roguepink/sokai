// 視点係(向き): 肩越し・一人称で、指・マウスの動きを「向き」に直す。
// 指は 左右だけ(撃つボタンを押したまま なぞる / 右側の あいている所を なぞる)。上下は 決まった見やすい角度のまま。
// PC のマウス(ロック中)だけは 上下も動かせる(はなすと ゆっくり もとの角度へ)。
// 「自動で ゾンビの方を向く」は 設定で オンにしたときだけ(はじめは オフ)。オンでも、さわった あと しばらくは 動かない。
import { CONFIG } from './config.js';
import { angleDiff, damp } from './util.js';

const V = CONFIG.VIEW;
const SECT = 16;
const _sec = new Float32Array(SECT), _sx = new Float32Array(SECT), _sz = new Float32Array(SECT);
const _m = { x: 0, y: 0 }, _t = { x: 0, y: 0 };
const AUTO_IDLE = 2500;     // 自動で向きを合わせるのは 最後に さわってから この ミリ秒 たったあと
const AUTO_RATE = 0.5;      // 自動で回る速さ(CONFIG.VIEW.AUTO_TURN に かける。前より ゆっくり)

export const Look = {
  targetYaw: null,          // 自動で向く先(なければ null)
  turning: false,           // 自動で回っている最中
  _scanT: 0, _sector: -1,

  reset() { this.targetYaw = null; this.turning = false; this._sector = -1; },

  // 「自動で ゾンビの方を向く」の設定(保存される。はじめは オフ。
  //  前の版の autoTurn は「はじめから オン」だったので、別の名前で しまう)
  autoOn(E) { return E.settings._get().autoTurn2 === 'on'; },
  setAuto(E, on) { E.settings._set('autoTurn2', on ? 'on' : 'off'); },

  // フレームごと(プレイ中・肩越し/一人称のとき)
  update(dt, E, input, ctx) {
    const st = E.settings, sens = st.sens;
    const turn = input.consumeTurn ? input.consumeTurn() : 0;
    input.consumeLook(_t); input.consumeLookMouse(_m);
    const locked = !!document.pointerLockElement;
    const dYaw = turn * sens + _m.x * V.SENS_MOUSE * sens;
    const dPitch = locked ? -_m.y * V.SENS_MOUSE * 0.85 * sens * (st.invertY ? -1 : 1) : 0;
    if (dYaw || dPitch) E.look(dYaw, dPitch);

    // 上下: 指のときは いつも 見やすい角度(マウスで動かしていないときも ゆっくり もどす)
    const p0 = E.viewMode === 'fps' ? V.FPS.PITCH0 : V.TPS.PITCH0;
    if (!locked) E.look(0, damp(E.lookPitch, p0, 6, dt) - E.lookPitch);

    // 自動で向きを合わせる(設定がオンのとき・見本プレイ)。さわっている間と、はなして しばらくは しない
    const idle = !input.lookHeld && performance.now() - input.lookT > AUTO_IDLE && !locked;
    this.turning = false;
    if (!(this.autoOn(E) || input.auto) || !idle || !ctx || !ctx.Zombies) { this.targetYaw = null; return; }
    if ((this._scanT -= dt) <= 0) { this._scanT = 0.15; this._scan(E, ctx); }
    if (this.targetYaw === null) return;
    const d = angleDiff(E.lookYaw, this.targetYaw), ad = Math.abs(d);
    if (ad < 0.05) return;
    // 近いほど ゆっくり、遠いほど 速く(でも 急には回らない)
    const rate = Math.min(V.AUTO_TURN * AUTO_RATE, 0.3 + ad * 1.4);
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
