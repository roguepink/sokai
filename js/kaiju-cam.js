// 大怪獣のカメラ係(第5弾の仕上げ): 高さ 90m の体が「全身 見えて でかい!」と分かるように、カメラを 助ける。
//
// (1) 場面カット(登場 3.8 秒・怒り 1.9 秒・倒れる所 5.5 秒): カメラを 遠くの 低い所へ 置きかえて、頭から しっぽまで 全身を 画面に入れる。
//     町のビルの むこうに そびえる絵に なるよう、建物に じゃまされない場所を さがす(低い所から順に。だめなら 屋根の上の高さ)。
//     その間 主人公は 動かない・撃たない(Engine.cineLock。main.js)・まわりのゾンビは すくんで止まる。おわったら なめらかに 元の視点へ。
//     どの視点でも 同じ(見下ろし・肩越し・一人称)。画面の向き(横長・たて長)で 見る角度と 画角を かえる。
// (2) 戦いの間(見下ろし): 「怪獣戦のカメラ」= 主人公の 南の 低い所から、主人公を 画面の下に置いて 北の空を 見上げる(Engine.giant)。
//     スティックの向き(上 = 北)は そのまま。南がわに 高い建物があるときは 主人公が かくれないよう 自動で 高い所へ上がる。
// (3) 戦いの間(肩越し・一人称): 大怪獣の方を 向いているとき、カメラだけ 自動で 上を向き・画角を 広げる(指で 上下を 変えなくてよい)。
//
// 使い方(boss-kaiju.js / ui-bossfx.js):
//   KaijuCam.attach(e, points)   出た(points(e, out) = 体の 目印の点を out[] に入れて 数を返す)
//   KaijuCam.detach(e)           いなくなった
//   KaijuCam.startCut(kind, sec, o)   kind = 'intro' | 'rage' | 'death'。o.extra = 画面に入れたい 追加の点 [x,y,z, …]
//   KaijuCam.onCut = (on, kind) => …  画面の係が HUD を 出し入れする
//   確認用: __game.KaijuCam.debug = { x, y, z, lx, ly, lz, fov }(カメラを そこへ 固定。null で もどす)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { Engine } from './engine.js';
import { World } from './world.js';
import { Events } from './events.js';

const { sin, cos, tan, atan, atan2, hypot, min, max, abs, PI } = Math;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const angDiff = (a, b) => { let d = (b - a) % (PI * 2); if (d > PI) d -= PI * 2; else if (d < -PI) d += PI * 2; return d; };

const _pts = []; for (let i = 0; i < 24; i++) _pts.push(new THREE.Vector3());
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _p0 = new THREE.Vector3(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _m = new THREE.Matrix4();

// (x0,y0,z0) → (x1,y1,z1) の間に 建物(壁の箱)が あるか。4m きざみで 点を しらべる(太い建物だけ 分かればよい)
function blocked(x0, y0, z0, x1, y1, z1, trees = false, pad = 0) {
  const W = World;
  if (!W.grid || !W.boxes || !W._cell) return false;
  const L = hypot(x1 - x0, y1 - y0, z1 - z0), n = Math.ceil(L / 4);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, z = z0 + (z1 - z0) * t;
    if (y > 70) continue;
    const c = W._cell(x, z), cell = W.grid[c.z * W.gw + c.x];
    if (!cell) continue;
    for (let k = 0; k < cell.length; k++) {
      const b = W.boxes[cell[k]];
      // 細い物(木の幹・街灯)は、低い所を通る線だけ・まわり 2.5m を ふさぐ物として 数える(木の葉で 体が かくれないように)
      const thin = b.maxX - b.minX <= 1.5 && b.maxZ - b.minZ <= 1.5, g = thin ? 2.5 : pad;
      if (thin && (!trees || b.h < 3.5)) continue;
      if (pad && b.h < 4) continue;      // 車・さく などの 低い物は 主人公を かくさない
      if (y < b.h + (thin ? g : pad * 0.5) && x > b.minX - g && x < b.maxX + g && z > b.minZ - g && z < b.maxZ + g) return true;
    }
  }
  return false;
}

export const KaijuCam = {
  e: null, _points: null,
  cut: null, onCut: null, debug: null,
  _lastCut: -99, _clock: 0,
  _elev: 0.36, _elevT: 0, _stunT: 0,

  attach(e, points) { this.e = e; this._points = points; this._elev = 0.36; },
  detach(e) { if (this.e === e) { this.e = null; this._points = null; } },

  // ---------- 場面カット ----------
  startCut(kind, sec, o = {}) {
    const e = this.e;
    if (!e || !this._points) return false;
    if (this.cut && this.cut.kind === 'death') return false;
    const shot = this._pick(kind, o);
    if (!shot) return false;
    const inT = o.inT || 0.5, outT = o.outT || 0.8;
    this.cut = Object.assign(shot, { kind, t: 0, sec, inT, outT, w: 0, dolly: o.dolly == null ? 0.05 : o.dolly });
    this._lastCut = this._clock;
    Engine.cineLock = true;
    if (this.onCut) try { this.onCut(true, kind); } catch (err) { /* そのまま */ }
    return true;
  },
  endCut() { const c = this.cut; if (c && c.t < c.sec - c.outT) c.t = c.sec - c.outT; },
  get cutting() { return !!this.cut; },
  sinceCut() { return this._clock - this._lastCut; },

  // カメラの置き場所を えらぶ。目印の点が ぜんぶ 画面に入り、建物に かくれない所(低い所から 順に)
  _pick(kind, o) {
    const e = this.e, P = Engine.ctx && Engine.ctx.Player;
    let n = this._points(e, _pts);
    if (o.extra) for (let i = 0; i + 2 < o.extra.length && n < _pts.length; i += 3) _pts[n++].set(o.extra[i], o.extra[i + 1], o.extra[i + 2]);
    const tall = innerWidth < innerHeight, aspect = innerWidth / innerHeight;
    const fov = o.fov || (tall ? 60 : 46), tv = tan(fov * PI / 360), th = tv * aspect;
    // 体の まん中(地面)
    let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += _pts[i].x; cz += _pts[i].z; } cx /= n; cz /= n;
    // 主人公の いる方角(0 = 北 と同じ決まり)。ここから 左右に ふって 置く。横長 = ななめ横(しっぽまで 見える)/ たて長 = ほぼ 正面
    const hx = P ? P.pos.x - e.x : 0, hz = P ? P.pos.z - e.z : 1, base = atan2(hx, -hz);
    const offs = o.az || (tall ? [0.3, -0.3, 0.12, -0.12, 0.55, -0.55, 0.85, -0.85] : [1.0, -1.0, 0.75, -0.75, 1.25, -1.25, 0.5, -0.5, 0.25, -0.25]);
    // 画面の中で 体を 置く わく(上は 警報の帯・下は 名札と 地面の分 あける)
    const mx = 0.9, y0 = o.bottom == null ? -0.8 : o.bottom, y1 = o.top == null ? 0.8 : o.top;
    let best = null;
    for (const cy of [6, 18, 30, 46, 70]) {
      for (const off of offs) {
        const a = base + off;
        let D = 170;
        _t.set(cx, 42, cz);
        let fit = 1;
        for (let it = 0; it < 9; it++) {
          _c.set(cx + sin(a) * D, cy, cz - cos(a) * D);
          _f.copy(_t).sub(_c).normalize(); _r.crossVectors(_f, _up).normalize(); _u.crossVectors(_r, _f);
          let ax0 = 9, ax1 = -9, ay0 = 9, ay1 = -9, zc = 0;
          for (let i = 0; i < n; i++) {
            _v.copy(_pts[i]).sub(_c);
            const z = max(1, _v.dot(_f)), nx = _v.dot(_r) / (z * th), ny = _v.dot(_u) / (z * tv);
            if (nx < ax0) ax0 = nx; if (nx > ax1) ax1 = nx; if (ny < ay0) ay0 = ny; if (ny > ay1) ay1 = ny; zc += z;
          }
          zc /= n;
          fit = max((ax1 - ax0) / (2 * mx), (ay1 - ay0) / (y1 - y0));
          // 見る点を ずらして まん中へ → 距離を 合わせる
          const ox = (ax0 + ax1) / 2, oy = (ay0 + ay1) / 2 - (y0 + y1) / 2;
          _t.addScaledVector(_r, ox * th * zc).addScaledVector(_u, oy * tv * zc);
          D = clamp(D * (0.25 + 0.75 * fit), 95, 265);
        }
        _c.set(cx + sin(a) * D, cy, cz - cos(a) * D);
        // 地図の外・建物の中は だめ
        const half = (World.half || 600) - 8;
        if (abs(_c.x) > half || abs(_c.z) > half) continue;
        if (blocked(_c.x, cy, _c.z, _c.x, cy + 0.1, _c.z)) continue;
        if (cy < 12 && World.blockedAt && World.blockedAt(_c.x, _c.z, 5)) continue;
        // 見える点の数(はじめの 6 つ = 頭・口・むね・こし・足 2 つ が 大事)
        let seen = 0, key = 0;
        for (let i = 0; i < n; i++) {
          const p = _pts[i];
          if (!blocked(_c.x, _c.y, _c.z, p.x, max(p.y, 4), p.z, cy < 12)) { seen++; if (i < 4) key++; }
        }
        const score = key * 30 + seen * 6 - cy * 0.5 - abs(off) * (tall ? 6 : 0) - (fit > 1.08 ? 40 : 0) - (D > 240 ? 10 : 0);
        if (!best || score > best.score) best = { score, x: _c.x, y: _c.y, z: _c.z, lx: _t.x, ly: _t.y, lz: _t.z, fov, key, seen, n, D };
        if (key === 4 && seen >= n - 1 && fit <= 1.08) return best;      // 全部 見える: これに決める(低い所 優先)
      }
      if (best && best.key === 4 && best.seen >= n - 2) return best;
    }
    return best;
  },

  // ---------- 毎フレーム(Engine.camHook。カメラを 決めた すぐあと) ----------
  frame(dt) {
    const E = Engine, cam = E.camera, G = E.giant, e = this.e;
    const P = E.ctx && E.ctx.Player, Z = E.ctx && E.ctx.Zombies;
    this._clock += dt;
    const tall = innerWidth < innerHeight;
    // ---- 戦いの間 ----
    let k = 0, up = 0, upFov = 0;
    if (e && P && e._M) {
      const top = E.viewMode === 'top';
      if (top) {
        // 南がわの 建物で 主人公が かくれないか(0.25 秒ごと)。かくれるなら 高い所へ。どの高さでも だめ(すぐ南が 高いビル)なら いつもの 見下ろしに もどす
        if ((this._elevT -= dt) <= 0) {
          this._elevT = 0.25;
          const d = tall ? 31 : 34, px = P.pos.x, pz = P.pos.z;
          let el = 0;
          // (屋根の ひさし・看板の分、建物を 2m 大きく見て しらべる。主人公の 頭の少し上から)
          for (const a of [0.34, 0.46, 0.6, 0.78]) if (!blocked(px, 2.2, pz + 1.5, px, 2.2 + sin(a) * d, pz + cos(a) * d, false, 2)) { el = a; break; }
          this._ok = el > 0 ? min(4, (this._ok || 0) + 1) : 0;      // 開けた所に 出て 0.5 秒 たってから もどる(行ったり来たり しない)
          if (el > 0) this._elev = el;
        }
        if (!World.inside && this._ok >= 2) k = 1;
        G.dist = tall ? 31 : 34; G.fov = 74; G.fovTall = 82;
        G.elev = damp(G.elev, this._elev, this._elev > G.elev ? 4 : 1.5, dt);
        G.frac = tall ? 0.2 : 0.125;
      } else {
        // 大怪獣の方を 向いているとき だけ(横や 後ろを 向いている間は いつものカメラ)
        const M = e._M, head = M.j && M.j.head;
        let hx = e.x, hy = 80, hz = e.z;
        if (head) { head.getWorldPosition(_v); hx = _v.x; hy = _v.y; hz = _v.z; }
        const cx = cam.position.x, cz = cam.position.z, bd = hypot(e.x - cx, e.z - cz);
        const dh = max(8, hypot(hx - cx, hz - cz));
        const diff = abs(angDiff(E.lookYaw, atan2(e.x - cx, -(e.z - cz))));
        const w = smooth(1 - clamp((diff - 0.7) / 0.6, 0, 1)) * smooth(clamp((bd - 14) / 26, 0, 1)) * (e.state === 'dead' ? 0.6 : 1);
        const fps = E.viewMode === 'fps';
        const add = tall ? 4 : fps ? 10 : 13;
        const base = (fps ? 74 : 66) * (tall ? 1.25 : 1), half = (base + add) * PI / 360;
        const elev = atan2(hy + 17 - cam.position.y, dh);
        const want = min(elev + 0.04 - half, half - (fps ? 0.2 : 0.3), 0.66);
        up = w * max(0, want - E.lookPitch);
        upFov = w * add;
      }
    }
    G.k = damp(G.k, k, 2.2, dt); if (G.k < 0.002 && !k) G.k = 0;
    G.upPitch = damp(G.upPitch, up, 2.5, dt); if (G.upPitch < 0.001 && !up) G.upPitch = 0;
    G.upFov = damp(G.upFov, upFov, 2.5, dt); if (G.upFov < 0.01 && !upFov) G.upFov = 0;

    // ---- 場面カット ----
    const c = this.cut;
    if (c) {
      const paused = E._state === 'paused';
      if (!paused) c.t += dt;
      const gone = !this.e && c.kind !== 'death';
      if (c.t >= c.sec || gone) {
        this.cut = null; Engine.cineLock = false;
        if (this.onCut) try { this.onCut(false, c.kind); } catch (err) { /* そのまま */ }
      } else {
        const w = smooth(clamp(min(c.t / c.inT, (c.sec - c.t) / c.outT), 0, 1));
        if (Engine.cineLock && c.t > c.sec - c.outT * 0.6) { Engine.cineLock = false; if (this.onCut) try { this.onCut(false, c.kind); } catch (err) { /* そのまま */ } }
        // ゆっくり 寄る(止まった絵に しない)
        const dl = c.dolly * smooth(clamp(c.t / c.sec, 0, 1));
        _p0.copy(cam.position); _q0.copy(cam.quaternion);
        _c.set(c.x + (c.lx - c.x) * dl, c.y, c.z + (c.lz - c.z) * dl);
        _m.lookAt(_c, _t.set(c.lx, c.ly, c.lz), _up); _q1.setFromRotationMatrix(_m);
        cam.position.lerpVectors(_p0, _c, w);
        cam.quaternion.slerpQuaternions(_q0, _q1, w);
        const fov = cam.fov + (c.fov - cam.fov) * w;
        cam.fov = fov; cam.near = 0.5; cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
        if (w > 0.5) E.cineCam = true;
        // まわりのゾンビは すくんで止まる(主人公は 動けないので)
        if (Z && (this._stunT -= dt) <= 0) {
          this._stunT = 0.2;
          const L = Z.list;
          for (let i = 0; i < L.length; i++) { const z = L[i]; if (!z.boss && z.alive && z.stun < 0.45) z.stun = 0.45; }
        }
      }
    }
    // ---- 確認用: カメラを 固定 ----
    const dbg = this.debug;
    if (dbg) {
      cam.position.set(dbg.x, dbg.y, dbg.z); cam.lookAt(dbg.lx, dbg.ly, dbg.lz);
      if (dbg.fov) { cam.fov = dbg.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(); E.cineCam = true;
    }
  },
};

Engine.camHook = (dt) => KaijuCam.frame(dt);
// やりなおし・タイトルへ: 場面カットを やめる(主人公を 止めたままに しない)
const _reset = () => {
  KaijuCam.cut = null; KaijuCam.e = null; KaijuCam._points = null; Engine.cineLock = false; Engine.cineCam = false;
  const G = Engine.giant; G.k = 0; G.upPitch = 0; G.upFov = 0;
  if (KaijuCam.onCut) try { KaijuCam.onCut(false, ''); } catch (err) { /* そのまま */ }
};
Events.on('reset', _reset);
Events.on('finish', _reset);

