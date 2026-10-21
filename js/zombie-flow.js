// キャラ係: 道さがし(流れの地図)。
// 主人公のマスから まわり ~72m の「主人公までの道のり」を、壁をよけて数える(0.3 秒ごと)。
// ゾンビは 道のりが へる方へ歩くので、建物をまわりこみ、ドアから中へ流れこむ。
import { World } from './world.js';

const R = 72;                  // 計算する半径(マス)
const W = R * 2 + 1;
const INF = 65535;
const ORTH = 2, DIAG = 3;      // まっすぐ 2 / ななめ 3(ほぼ √2 倍)

export const Flow = {
  dist: new Uint16Array(W * W),
  ox: 0, oz: 0,                // この窓の左上のマス(nav のマス番号)
  ready: false,
  _t: 0,
  _buckets: [new Int32Array(W * W * 2), new Int32Array(W * W * 2), new Int32Array(W * W * 2), new Int32Array(W * W * 2)],
  _blen: new Int32Array(4),

  reset() { this.ready = false; this._t = 0; },

  update(dt, px, pz) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.3;
    this.compute(px, pz);
  },

  compute(px, pz) {
    const nav = World.nav;
    if (!nav) { this.ready = false; return; }
    const cx = Math.floor((px - nav.ox) / nav.size), cz = Math.floor((pz - nav.oz) / nav.size);
    this.ox = cx - R; this.oz = cz - R;
    const dist = this.dist, B = this._buckets, BL = this._blen;
    dist.fill(INF);
    BL.fill(0);
    const nw = nav.w, nh = nav.h, blk = nav.blocked;
    const ox = this.ox, oz = this.oz;
    // 窓のマス i → nav が通れるか
    const free = (wx, wz) => {
      const gx = ox + wx, gz = oz + wz;
      if (gx < 0 || gz < 0 || gx >= nw || gz >= nh) return false;
      return blk[gz * nw + gx] === 0;
    };
    const s = R * W + R;
    dist[s] = 0; B[0][BL[0]++] = s;
    let cur = 0, pending = 1;
    while (pending > 0 && cur < 60000) {
      const bi = cur & 3, b = B[bi], n = BL[bi];
      for (let k = 0; k < n; k++) {
        const i = b[k];
        if (dist[i] !== cur) continue;
        const wx = i % W, wz = (i / W) | 0;
        const fN = wz > 0 && free(wx, wz - 1), fS = wz < W - 1 && free(wx, wz + 1);
        const fW = wx > 0 && free(wx - 1, wz), fE = wx < W - 1 && free(wx + 1, wz);
        if (fN) relax(i - W, cur + ORTH);
        if (fS) relax(i + W, cur + ORTH);
        if (fW) relax(i - 1, cur + ORTH);
        if (fE) relax(i + 1, cur + ORTH);
        // ななめは、となりの 2 マスがあいている時だけ(角をすりぬけない)
        if (fN && fW && free(wx - 1, wz - 1)) relax(i - W - 1, cur + DIAG);
        if (fN && fE && free(wx + 1, wz - 1)) relax(i - W + 1, cur + DIAG);
        if (fS && fW && free(wx - 1, wz + 1)) relax(i + W - 1, cur + DIAG);
        if (fS && fE && free(wx + 1, wz + 1)) relax(i + W + 1, cur + DIAG);
      }
      pending -= n;
      BL[bi] = 0;
      cur++;
    }
    function relax(j, d) {
      if (d < dist[j]) {
        dist[j] = d;
        const bj = d & 3;
        if (BL[bj] < B[bj].length) { B[bj][BL[bj]++] = j; pending++; }
      }
    }
    this.ready = true;
  },

  // (x,z) から主人公へ向かう向きを out {x,z} に入れる。分からなければ false
  dir(x, z, out) {
    if (!this.ready) return false;
    const nav = World.nav;
    const wx = Math.floor((x - nav.ox) / nav.size) - this.ox, wz = Math.floor((z - nav.oz) / nav.size) - this.oz;
    if (wx < 1 || wz < 1 || wx >= W - 1 || wz >= W - 1) return false;
    const dist = this.dist, i = wz * W + wx;
    const d0 = dist[i];
    let gx = 0, gz = 0;
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      const dn = dist[i + oz * W + ox];
      if (dn >= d0 || dn === INF) continue;
      const w = (d0 === INF ? 1 : d0 - dn) * (ox && oz ? 0.7071 : 1);
      gx += ox * w; gz += oz * w;
    }
    const l = Math.hypot(gx, gz);
    if (l < 1e-6) return false;
    out.x = gx / l; out.z = gz / l;
    return true;
  },

  // 道のり(m くらい)。届かないなら Infinity
  distAt(x, z) {
    if (!this.ready) return Infinity;
    const nav = World.nav;
    const wx = Math.floor((x - nav.ox) / nav.size) - this.ox, wz = Math.floor((z - nav.oz) / nav.size) - this.oz;
    if (wx < 0 || wz < 0 || wx >= W || wz >= W) return Infinity;
    const d = this.dist[wz * W + wx];
    return d === INF ? Infinity : d * 0.5;
  },

  // 2 点の間に壁がないか(nav のマスで 0.6m ずつ調べる)
  clear(x0, z0, x1, z1) {
    const nav = World.nav;
    if (!nav) return true;
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    const n = Math.ceil(L / 0.6);
    for (let k = 1; k < n; k++) {
      const x = x0 + dx * k / n, z = z0 + dz * k / n;
      const gx = Math.floor((x - nav.ox) / nav.size), gz = Math.floor((z - nav.oz) / nav.size);
      if (gx < 0 || gz < 0 || gx >= nav.w || gz >= nav.h) return false;
      if (nav.blocked[gz * nav.w + gx]) return false;
    }
    return true;
  },
};
