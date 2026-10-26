// キャラ係: 新しいボス(けもの・機械・列車)。
//   屍竜(つばさ 26m)… 低く飛びまわる。火を吹いて 地面を なめる・急降下・羽ばたきの突風・火の玉 / 怒り: じゅうたん爆撃・炎の輪
//   大地喰いワーム(長さ 30m)… 地中を進み(地面が割れていく)、主人公の真下から 飛び出す(ゾンビを 丸のみ)・かみつき・体を たたきつける / 怒り: 酸・2 連続の飛び出し
//   女郎ぐも(足 18m)… 糸の玉(ゾンビが からまって 止まる)・大ジャンプ・足の連続つき・子ぐもゾンビ / 怒り: 毒の霧・糸の嵐
//   メカ屍(14m)… ミサイルの雨・光線・ガトリング・ジェットで飛んで ふみつけ・爪 / 怒り: ミサイル倍・電気の衝撃波
//   暴走ゾンビ列車(長さ 50m)… 画面を横切って 突っこんでくる(長い帯の予告)・大きく回って また来る・客車から ゾンビ / 怒り: 大砲・燃える線路
import * as THREE from '../vendor/three/build/three.module.min.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, BONE, lathe, sstep, skinTex, plateTex, chitinTex, canvasTex, mat, limb, limbX, limbZ, spike, horn, blob, box, sph, cyl, torus, tube, ribs, Rig, ease, seg } from './boss-kit.js';
import { act, slam, line, cone, step, hitHero, heroIn, throwAt, quake, pick, begin, done, lock, lead, fwd, roarBlast, beamTick, ringWave } from './boss-attacks.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _fw = new THREE.Vector3(0, 0, -1), _d = new THREE.Vector3(), _near = [];

// 世界の点 → ボスの体(root)の中の点(設計の大きさ)
function toLocal(m, e, x, y, z, out) {
  const dx = x - e.x, dz = z - e.z, f = e.face, S = m.S;
  // root.rotation.y = -face。ローカル = rotY(face) * (w - p)
  out.set((dx * cos(f) + dz * sin(f)) / S, y / S, (-dx * sin(f) + dz * cos(f)) / S);
  return out;
}
function dirLocal(e, dx, dy, dz, out) {
  const f = e.face;
  out.set(dx * cos(f) + dz * sin(f), dy, -dx * sin(f) + dz * cos(f)).normalize();
  return out;
}

// ---------------- 通ったあと(頭の道すじ)に 体の節を ならべる ----------------
class Trail {
  constructor(n) { this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n); this.n = n; this.h = 0; this.len = 0; }
  reset(x, y, z, dx, dz, step) { for (let i = 0; i < this.n; i++) { this.x[i] = x - dx * i * step; this.y[i] = y; this.z[i] = z - dz * i * step; } this.h = 0; this.step = step; }
  push(x, y, z) {
    const p = (this.h + 1) % this.n, d = Math.hypot(x - this.x[p], y - this.y[p], z - this.z[p]);
    if (d >= this.step) this.h = (this.h - 1 + this.n) % this.n;     // 今の頭を 道すじに残して 新しい頭へ
    this.x[this.h] = x; this.y[this.h] = y; this.z[this.h] = z;
  }
  // 頭から k 番目(k は 小数でよい)
  at(k, out) {
    const a = Math.floor(k), t = k - a, i0 = (this.h + a) % this.n, i1 = (this.h + a + 1) % this.n;
    out.set(this.x[i0] + (this.x[i1] - this.x[i0]) * t, this.y[i0] + (this.y[i1] - this.y[i0]) * t, this.z[i0] + (this.z[i1] - this.z[i0]) * t);
    return out;
  }
}

// =====================================================================
// 屍竜(低く飛ぶ)
// =====================================================================
function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(1.2, 0.35); s.lineTo(2.6, 0.5); s.lineTo(3.8, 0.2);
  s.lineTo(3.2, -0.45); s.lineTo(2.9, -0.2); s.lineTo(2.4, -0.9); s.lineTo(2.0, -0.55); s.lineTo(1.4, -1.25); s.lineTo(1.0, -0.7); s.lineTo(0.3, -1.1); s.lineTo(0, -0.35);
  return new THREE.ShapeGeometry(s, 2);
}
const dragon = {
  def: { name: '屍竜 ドラゴン', title: '空を焼く屍竜', icon: '🐉', hp: 51200, speed: 10, r: 4.8, points: 5000, scale: 4.2, size: 22, h: 12, zoom: 18, tier: 3, S: 3.4, color: 0x4a4a3a },
  noStand: true, passHero: true, vehicle: true, noCollide: true, enter: 'fly', fall: 'topple', fallT: 1.6, stride: 0.25,
  build(m) {
    const scale = mat(m, { map: skinTex('#4a4636', { scales: true, wounds: 14, rep: 2, veins: 10 }), color: 0xffffff, roughness: 0.55, metalness: 0.1 });
    const memb = mat(m, { map: skinTex('#5a3a32', { wounds: 26, veins: 70, vein: 'rgba(30,0,0,0.6)', drips: 4 }), color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
    const bone = mat(m, { color: BONE, roughness: 0.45 });
    const fire = mat(m, { color: 0x6a1004, emissive: 0xff6010, emissiveIntensity: 2.6, glow: true });
    const G = new Rig(m);
    const body = G.bone(null, 0, 0, 0);
    G.add(body, lathe([[0, -1.6], [0.45, -1.4], [0.75, -0.6], [0.8, 0.2], [0.6, 1.1], [0.3, 1.6], [0, 1.75]], 16, (p) => { p.x *= 1.1; if (p.z > 0) p.z *= 0.85; }), scale, 0, 0, 0, -PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) G.add(body, torus(0.75, 0.04, 5, 12, PI), bone, 0, -0.05, -0.8 + i * 0.3, PI / 2, 0, PI);     // 腹の あばら
    G.add(body, blob(0.35, 0.2, 3, 12, 10), fire, 0, -0.25, -0.5, 0, 0, 0, 1.4, 1, 1.6);                                          // 腹の中の火
    for (let i = 0; i < 9; i++) G.add(body, spike(R(0.3, 0.55), 0.08), bone, 0, 0.65, -1.4 + i * 0.35, -0.4);
    // 首(4 節)と 頭
    const neck = [];
    let par = body;
    for (let i = 0; i < 4; i++) {
      const n = G.bone(par, 0, i ? 0 : 0.3, i ? -0.6 : -1.5);
      G.add(n, lathe([[0.42 - i * 0.05, 0], [0.38 - i * 0.05, 0.65]], 10), scale, 0, 0, 0, -PI / 2, 0, 0);
      G.add(n, spike(0.3, 0.06), bone, 0, 0.35 - i * 0.03, -0.3, -0.5);
      neck.push(n); par = n;
    }
    const head = G.bone(par, 0, 0.05, -0.65);
    G.add(head, lathe([[0, -0.2], [0.3, -0.15], [0.36, 0.1], [0.3, 0.4], [0.18, 0.8], [0, 0.95]], 12, (p) => { p.x *= 0.95; p.z *= 0.75; }), bone, 0, 0, 0, -PI / 2, 0, 0);
    for (const sx of [-1, 1]) { G.add(head, horn(0.9, 0.09, -0.6), bone, sx * 0.22, 0.25, 0.1, -1.2, 0, -sx * 0.3); G.add(head, sph(0.07, 8, 6), fire, sx * 0.2, 0.15, -0.35); }
    for (let i = 0; i < 6; i++) G.add(head, spike(0.13, 0.025, 4), bone, -0.12 + i * 0.048, -0.08, -0.7 + abs(i - 2.5) * 0.05, PI);
    const jaw = G.bone(head, 0, -0.12, -0.1);
    G.add(jaw, box(0.42, 0.1, 0.8), bone, 0, -0.05, -0.38);
    for (let i = 0; i < 6; i++) G.add(jaw, spike(0.12, 0.025, 4), bone, -0.12 + i * 0.048, 0, -0.7 + abs(i - 2.5) * 0.05);
    // しっぽ(6 節)
    const tail = [];
    par = body;
    for (let i = 0; i < 6; i++) {
      const t = G.bone(par, 0, i ? 0 : 0.1, i ? 0.7 : 1.6);
      G.add(t, lathe([[0.4 - i * 0.06, 0], [0.34 - i * 0.06, 0.72]], 10), scale, 0, 0, 0, PI / 2, 0, 0);
      G.add(t, spike(0.28 - i * 0.03, 0.05), bone, 0, 0.32 - i * 0.05, 0.3, 0.6);
      tail.push(t); par = t;
    }
    G.add(par, spike(0.9, 0.25, 4), bone, 0, 0, 0.7, PI / 2, 0, 0);
    // つばさ(肩 → ひじ。膜は ひじの骨)
    const wings = [];
    for (const sx of [-1, 1]) {
      const sh = G.bone(body, sx * 0.55, 0.45, -0.7);
      G.add(sh, limbX(1.6, 0.13, 0.1), bone, 0, 0, 0, 0, 0, 0, sx, 1, 1);
      const el = G.bone(sh, sx * 1.6, 0, 0);
      for (let k = 0; k < 4; k++) G.add(el, limbX(2.2 + k * 0.3, 0.07, 0.03), bone, 0, 0, 0, 0, -0.35 * k * -sx * -1, 0, sx, 1, 1);
      G.add(el, wingShape(), memb, 0, 0, 0, -PI / 2, 0, 0, sx * 1.15, 1.6, 1);
      G.add(sh, new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(1.6, -1.4), new THREE.Vector2(0, -1.8)])), memb, 0, 0, 0, -PI / 2, 0, 0, sx, 1, 1);
      wings.push({ sh, el, sx });
    }
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, fr = i < 2;
      const up = G.bone(body, sx * 0.55, -0.35, fr ? -0.9 : 0.9);
      G.add(up, limb(0.9, 0.2, 0.14), scale);
      const lo = G.bone(up, 0, -0.9, 0);
      G.add(lo, limb(0.8, 0.13, 0.09), scale);
      for (let k = 0; k < 3; k++) G.add(lo, spike(0.3, 0.04), bone, (k - 1) * 0.08, -0.85, -0.1, -PI / 2 - 0.3);
      legs.push({ up, lo, fr });
    }
    G.finish();
    m.j = { body, neck, head, jaw, tail, wings, legs };
  },
  anim(m, e, dt) {
    const j = m.j, t = e.t, st = e.st, S = e.state;
    const fly = (e.y || 0) > 1.5 || S === 'enter';
    const flapSpd = S === 'gust' ? 9 : S === 'hover' || S === 'breath' || S === 'fireballs' ? 6 : 4;
    e.flap = (e.flap || 0) + dt * flapSpd;
    const f = sin(e.flap * 2);
    for (const W of j.wings) {
      if (fly) { W.sh.rotation.set(0, 0, W.sx * (0.35 * f + 0.15)); W.el.rotation.set(0, W.sx * 0.2, W.sx * (0.5 * sin(e.flap * 2 - 0.8))); }
      else { W.sh.rotation.set(0, W.sx * -0.9, W.sx * 0.9); W.el.rotation.set(0, 0, -W.sx * 2.2); }
      if (S === 'gust') W.sh.rotation.x = -0.4 * sin(e.flap * 2);
    }
    j.body.position.y = fly ? 0.15 * -f : 1.7;
    j.body.rotation.x = S === 'dive' && st > 0.5 ? -0.5 : S === 'breath' ? 0.15 : 0.05 * sin(t);
    for (let i = 0; i < j.neck.length; i++) j.neck[i].rotation.set(0.12 * sin(t * 1.3 - i * 0.6) - (S === 'breath' ? 0.12 : 0), 0.15 * sin(t * 0.9 - i * 0.5), 0);
    j.head.rotation.x = S === 'breath' || S === 'inferno' ? -0.35 : S === 'roar' || S === 'enter' ? 0.5 : 0.1 * sin(t * 2);
    j.jaw.rotation.x = S === 'breath' || S === 'fireballs' || S === 'roar' || S === 'inferno' ? 0.6 : 0.1 + 0.08 * sin(t * 3);
    for (let i = 0; i < j.tail.length; i++) j.tail[i].rotation.set(0.1 * sin(t * 1.5 - i * 0.7), 0.25 * sin(t * 1.2 - i * 0.6), 0);
    for (const L of j.legs) { L.up.rotation.x = fly ? (L.fr ? 0.9 : -0.9) : 0.2 * sin(e.ph + (L.fr ? 0 : PI)); L.lo.rotation.x = fly ? (L.fr ? -1.4 : 1.2) : -0.3; }
    // 体の かたむき(曲がるとき)
    m.tilt.rotation.z = clamp((e.bank || 0), -0.6, 0.6);
  },
  enterAI(B, e, m, dt, c) {
    if (e.st < 0.02) { e.y = 30; e.alt = 6; }
    e.y += (6 - e.y) * min(1, dt * 1.6);
    this._circle(e, c, dt, 1.2);
    if (e.st > 2.2) { e.state = 'roar'; e.st = 0; e.hitDone = 0; act(e, 'roar'); }
    return -1;
  },
  _circle(e, c, dt, mul = 1) {
    const side = e.orbit || (e.orbit = Math.random() < 0.5 ? 1 : -1);
    const want = 14, k = c.d < want - 4 ? -0.6 : c.d > want + 6 ? 0.9 : 0.1;
    const vx = -c.dz * side + c.dx * k, vz = c.dx * side + c.dz * k, l = Math.hypot(vx, vz) || 1;
    const sp = c.sp * mul;
    e.vx += (vx / l * sp - e.vx) * min(1, dt * 1.5); e.vz += (vz / l * sp - e.vz) * min(1, dt * 1.5);
    const nf = Math.atan2(e.vx, -e.vz); let da = nf - e.face; da = Math.atan2(sin(da), cos(da));
    e.face += da * min(1, dt * 3); e.bank = -da * 1.5;
  },
  _faceHero(e, c, dt) { const nf = Math.atan2(c.dx, -c.dz); let da = nf - e.face; da = Math.atan2(sin(da), cos(da)); e.face += da * min(1, dt * 4); e.bank *= 0.9; },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st, self = dragon;
    if (S === 'walk') {
      e.y += ((e.alt || 7) - e.y) * min(1, dt * 2);
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_D); if (a) return begin(e, a); }
      self._circle(e, c, dt);
      if (Math.random() < dt * 4) { m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v); FX.flame(_v.x, _v.y, _v.z, 0, 1, 0, 0.9, 0.4); }
      return -1;
    }
    if (S === 'breath' || S === 'inferno') {
      e.vx *= 0.94; e.vz *= 0.94; self._faceHero(e, c, dt);
      if (st < 0.05) { const px = -c.dz, pz = c.dx; e.bx0 = c.px - px * 13 - c.dx * 4; e.bz0 = c.pz - pz * 13 - c.dz * 4; e.bx1 = c.px + px * 13 + c.dx * 4; e.bz1 = c.pz + pz * 13 + c.dz * 4; if (Math.random() < 0.5) { let t = e.bx0; e.bx0 = e.bx1; e.bx1 = t; t = e.bz0; e.bz0 = e.bz1; e.bz1 = t; } }
      const T0 = 0.8, T1 = 2.0;
      Warn.rect(e.bx0, e.bz0, e.bx1 - e.bx0, e.bz1 - e.bz0, Math.hypot(e.bx1 - e.bx0, e.bz1 - e.bz0), 6, min(1, st / T0), 0xff5010);
      m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
      if (st > T0 && st < T0 + T1) {
        const k = (st - T0) / T1, x = e.bx0 + (e.bx1 - e.bx0) * k, z = e.bz0 + (e.bz1 - e.bz0) * k;
        for (let i = 0; i < 5; i++) { const u = R(0.2, 1); FX.flame(_v.x + (x - _v.x) * u + R(-1, 1), _v.y + (0.4 - _v.y) * u, _v.z + (z - _v.z) * u + R(-1, 1), (x - _v.x) * 0.8, (0.4 - _v.y) * 0.8, (z - _v.z) * 0.8, 1.6 + u * 1.5, 0.5); }
        for (let i = 0; i < 2; i++) FX.flame(x + R(-2.5, 2.5), 0.6, z + R(-2.5, 2.5), R(-3, 3), R(2, 5), R(-3, 3), 2.2, 0.8);
        if ((e.n += dt) > 0.12) { e.n = 0; B._Z.damageCircle(x, z, 4.5, 500, { force: 8, cause: 'bossfire' }); for (const t of B._Z.queryCircle(x, z, 4.5, _near)) if (!t.boss) { t.burn = max(t.burn, 3); t.burnDps = max(t.burnDps, 60); } _near.length = 0; FX.decal(x, z, 3, 'scorch', 20); if (World.damage) try { World.damage(x, z, 4, 600, { cause: 'fire' }); } catch (err) {} }
        if (heroIn(B, x, z, 3.6)) hitHero(B, e, x, z, 16, 4, 'breath');
        if (S === 'inferno' && Math.random() < dt * 6) FX.explosion(x + R(-3, 3), z + R(-3, 3), 4, 'meteor');
      }
      if (st > T0 + T1 + 0.3) done(e, 1.0, c);
      return -1;
    }
    if (S === 'dive') {
      if (st < 0.7) { e.vx *= 0.92; e.vz *= 0.92; self._faceHero(e, c, dt); const [x, z] = lead(c, 0.8); e.tx = x; e.tz = z; e.y += (13 - e.y) * min(1, dt * 3); Warn.circle(x, z, 9, st / 1.5); return -1; }
      Warn.circle(e.tx, e.tz, 9, st / 1.5);
      if (!e.hitDone) {
        const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1, left = max(0.05, 1.45 - st);
        e.vx = dx / left; e.vz = dz / left; e.y = max(0, e.y - (e.y / left) * dt * 1.3);
        e.face = Math.atan2(dx, -dz);
        if (st > 1.4 || (d < 2 && e.y < 2)) { e.hitDone = 1; e.y = 0.5; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 9, { dmg: 1800, hero: 26, lift: 9, big: true, cause: 'slam' }); FX.explosion(e.x, e.z, 7, 'meteor'); }
        return -1;
      }
      e.y += (7 - e.y) * min(1, dt * 1.5);
      if (st > 2.6) done(e, 0.8, c);
      return -1;
    }
    if (S === 'gust') {
      e.vx *= 0.9; e.vz *= 0.9; self._faceHero(e, c, dt);
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.6) Warn.cone(e.x, e.z, fx, fz, 26, 0.6, st / 0.6, 0xffe0a0);
      if (st > 0.6 && st < 1.4) {
        for (let i = 0; i < 4; i++) { const a = e.face + R(-0.5, 0.5), s = R(18, 30); FX.smoke(e.x + fx * 4, R(0.5, 4), e.z + fz * 4, 1.2, 0.9, 0x8a8070, sin(a) * s, R(-1, 1), -cos(a) * s, 0.4); }
        if ((e.n += dt) > 0.2) { e.n = 0; cone(B, e, e.x, e.z, fx, fz, 26, 0.6, { dmg: 300, hero: 22, lift: 5, cause: 'gust', force: 40, world: 300 }); }
      }
      if (st > 1.6) done(e, 0.8, c);
      return -1;
    }
    if (S === 'fireballs' || S === 'carpet') {
      e.vx *= 0.95; e.vz *= 0.95; self._faceHero(e, c, dt);
      const N = S === 'carpet' ? 9 : 3 + e.phase, gap = S === 'carpet' ? 0.13 : 0.3, n = Math.floor((st - 0.5) / gap);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
        let x, z;
        if (S === 'carpet') { const px = -c.dz, pz = c.dx, o = (e.n / N - 0.5) * 30; x = c.px + px * o + c.dx * R(-2, 2); z = c.pz + pz * o + c.dz * R(-2, 2); }
        else { [x, z] = lead(c, 1.0); x += R(-4, 4); z += R(-4, 4); }
        throwAt(B, e, 'fire', _v.x, _v.y, _v.z, x, z, 1.0, { r: 6, size: 1.8, dmg: 1200, hero: 22, lift: 7, g: 8 });
      }
      if (st > 0.7 + N * gap) done(e, 0.9, c);
      return -1;
    }
    return -1;
  },
};
const LIST_D = [['breath', 8, 40, 4], ['dive', 10, 50, 3], ['gust', 0, 24, 2.5], ['fireballs', 10, 60, 3], ['carpet', 0, 50, 3, 1], ['inferno', 6, 40, 4, 2]];

// =====================================================================
// 大地喰いワーム(長さ 30m。地中を進む)
// =====================================================================
const WN = 14;            // 節の数
const WSP = 0.75;         // 節の間(設計の大きさ)
const worm = {
  def: { name: '大地喰いワーム', title: '大地を喰らうもの', icon: '🪱', hp: 51200, speed: 9, r: 4.6, points: 5000, scale: 2.4, size: 30, h: 12, zoom: 18, tier: 3, S: 3.0, color: 0x8a6a5a },
  noStand: true, passHero: true, vehicle: true, noCollide: true, enter: 'burrow', fall: 'collapse', fallT: 1.4,
  build(m) {
    const skin = mat(m, { map: skinTex('#9a7a68', { wounds: 20, rep: 2, veins: 50, vein: 'rgba(90,20,30,0.6)' }), color: 0xffffff, roughness: 0.55 });
    const ring = mat(m, { map: chitinTex('#5a4a3a'), color: 0xffffff, roughness: 0.5 });
    const bone = mat(m, { color: BONE, roughness: 0.4 });
    const gut = mat(m, { color: 0x6a0a0a, emissive: 0xff3010, emissiveIntensity: 1.6, glow: true });
    const G = new Rig(m);
    const segs = [];
    for (let i = 0; i < WN; i++) {
      const b = G.bone(null, 0, 0, i * WSP);
      const r = 0.62 * (i < 2 ? 1 : 1 - (i / WN) * 0.45);
      G.add(b, cyl(r * 0.92, r, WSP * 1.15, 16, true), skin, 0, 0, 0, PI / 2, 0, 0);
      G.add(b, torus(r * 1.02, 0.07, 6, 16), ring, 0, 0, -WSP * 0.5);
      for (let k = 0; k < 3; k++) G.add(b, spike(0.25, 0.05), bone, sin(k * 2.1) * r * 0.8, cos(k * 2.1) * r * 0.8, 0, k * 2.1 * -1 + 0, 0, 0);
      segs.push(b);
    }
    // 頭: 花びらのように 開く あご(4 枚)+ 歯の輪 + 光る のど
    const head = segs[0];
    G.add(head, cyl(0.45, 0.62, 0.2, 16), gut, 0, 0, -0.45, PI / 2, 0, 0);
    for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU; G.add(head, spike(0.22, 0.04, 4), bone, cos(a) * 0.48, sin(a) * 0.48, -0.5, -PI / 2, 0, 0); }
    const petals = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + PI / 4;
      const p = G.bone(head, cos(a) * 0.55, sin(a) * 0.55, -0.45);
      p.rotation.z = a;
      G.add(p, lathe([[0.32, 0], [0.3, 0.5], [0.18, 1.0], [0.0, 1.25]], 8, (q) => { q.z *= 0.35; }), skin, 0, 0, 0, -PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) G.add(p, spike(0.18, 0.035, 4), bone, R(-0.1, 0.1), -0.08, -0.2 - i * 0.25, PI, 0, 0);
      petals.push(p);
    }
    G.finish();
    m.j = { segs, petals };
    m.trail = new Trail(WN * 4 + 8);
  },
  spawn(B, e, m) { e.hy = -8; m.trail.reset(e.x, -8, e.z, 0, 1, WSP * m.S * 0.5); },
  anim(m, e, dt) {
    const j = m.j, S = m.S, T = m.trail;
    if (e.state === 'dead') e.hy += (2.5 - e.hy) * min(1, dt * 4);
    T.push(e.x, e.hy ?? -8, e.z);
    // 節を 道すじに ならべる
    for (let i = 0; i < WN; i++) {
      T.at(i * 2, _v);
      toLocal(m, e, _v.x, _v.y, _v.z, j.segs[i].position);
      // 向き = 次の節 → この節
      T.at(i * 2 + 1.5, _d);
      dirLocal(e, _v.x - _d.x, _v.y - _d.y, _v.z - _d.z, _d);
      _q.setFromUnitVectors(_fw, _d);
      j.segs[i].quaternion.copy(_q);
      // ぜん動(ふくらむ)
      const sw = 1 + 0.06 * sin(e.t * 6 - i * 0.8);
      j.segs[i].scale.set(sw, sw, 1);
    }
    const open = e.state === 'erupt' || e.state === 'bite' || e.state === 'roar' || e.state === 'acid' ? 1 : 0.25 + 0.15 * sin(e.t * 3);
    for (const p of j.petals) p.rotation.x = -0.15 - 0.85 * open;
  },
  enterAI(B, e, m, dt, c) { e.state = 'walk'; e.st = 0; e.cool = 0.2; return -1; },
  // 地中を 進む(頭の位置 e.x/e.z/hy)
  _under(B, e, c, dt, tx, tz, sp) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    const nf = Math.atan2(dx, -dz); let da = nf - e.face; da = Math.atan2(sin(da), cos(da));
    e.face += clamp(da, -2.5 * dt, 2.5 * dt);
    e.vx = sin(e.face) * sp; e.vz = -cos(e.face) * sp;
    e.hy += (-7 - e.hy) * min(1, dt * 3);
    // 地面が 割れていく
    if (Math.random() < dt * 25) { FX.smoke(e.x + R(-1.5, 1.5), 0.3, e.z + R(-1.5, 1.5), 1.2, 1.1, 0x6f6455, R(-2, 2), 1.5, R(-2, 2), 0.55); FX.debris(e.x, 0.3, e.z, 2, 6, 0x4a4038, 0.3, 1.5); }
    if (Math.random() < dt * 8) { FX.decal(e.x, e.z, 2.2, 'scorch', 12); quake(B, e.x, e.z, 0.35, 40); }
    if (Math.random() < dt * 6) B._Z.damageCircle(e.x, e.z, 3, 300, { force: 18, cause: 'quake' });
    return d;
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st, self = worm;
    if (e.hy === undefined) e.hy = -8;
    if (S === 'walk') {
      // 遠いと 地中を 主人公へ。近いと 地上で 主人公のまわりを くねくね回る(よく見える)
      if (c.d > 30) self._under(B, e, c, dt, c.px, c.pz, c.sp * 1.3);
      else {
        const side = e.orbit || (e.orbit = Math.random() < 0.5 ? 1 : -1);
        const k = c.d < 11 ? -0.8 : c.d > 18 ? 0.7 : 0, wig = sin(e.t * 1.8) * 0.5;
        let vx = -c.dz * side + c.dx * k, vz = c.dx * side + c.dz * k;
        const l = Math.hypot(vx, vz) || 1; vx /= l; vz /= l;
        const nf = Math.atan2(vx, -vz) + wig; let da = nf - e.face; da = Math.atan2(sin(da), cos(da));
        e.face += clamp(da, -2 * dt, 2 * dt);
        e.vx = sin(e.face) * c.sp * 0.8; e.vz = -cos(e.face) * c.sp * 0.8;
        e.hy += (2.4 + 0.6 * sin(e.t * 2.5) - e.hy) * min(1, dt * 2);
        if (Math.random() < dt * 10) FX.smoke(e.x + R(-1, 1), 0.3, e.z + R(-1, 1), 1, 0.9, 0x6f6455, 0, 1, 0, 0.45);
        if (Math.random() < dt * 5) B._Z.damageCircle(e.x, e.z, 3.5, 400, { force: 16, cause: 'bite' });
      }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_W); if (a) return begin(e, a); }
      return -1;
    }
    if (S === 'erupt') {
      // 主人公の 真下へ もぐって進み、予告のあと 飛び出す
      if (st < 1.1) {
        if (st < 0.7) { const [x, z] = lead(c, 0.6); e.tx = x; e.tz = z; }
        Warn.circle(e.tx, e.tz, 8, st / 1.1);
        const d = self._under(B, e, c, dt, e.tx, e.tz, max(c.sp, 16));
        if (d < 3) { e.vx *= 0.5; e.vz *= 0.5; }
        if (Math.random() < dt * 12) FX.smoke(e.tx + R(-4, 4), 0.3, e.tz + R(-4, 4), 1.5, 1, 0x6f6455, 0, 3, 0, 0.6);
        return -1;
      }
      if (!e.hitDone) {
        e.hitDone = 1; e.x = e.tx; e.z = e.tz; e.hy = -3; e.vy = 30; e.face = Math.atan2(c.dx, -c.dz); act(e, 'erupt');
        const k = B._Z.damageCircle(e.x, e.z, 8, 2500, { force: 20, cause: 'swallow' });
        slam(B, e, e.x, e.z, 8, { dmg: 1500, hero: 26, lift: 11, big: true, cause: 'swallow', shake: 1.8 });
        FX.debris(e.x, 1, e.z, 30, 16, 0x4a4038, 0.6, 3);
        Gore.chunks(e.x, 3, e.z, 10, 10, 12, 0, 0, 0x6a0808, 2);
        e.ate = k;
      }
      // 空へ のびて、弧を えがいて 少し先へ もぐる
      e.vy -= 30 * dt; e.hy += e.vy * dt;
      const fx = sin(e.face), fz = -cos(e.face);
      e.vx = fx * 9; e.vz = fz * 9;
      if (e.hy < -2 && e.vy < 0 && e.hitDone === 1) {
        e.hitDone = 2;
        slam(B, e, e.x, e.z, 7, { dmg: 1400, hero: 22, lift: 8, cause: 'quake' });
        if (e.phase >= 2 && !e.again) { e.again = 1; e.state = 'erupt'; e.st = 0; e.hitDone = 0; return -1; }
        e.again = 0;
      }
      if (e.hitDone === 2 && st > 3.0) done(e, 0.6, c);
      if (e.hitDone === 2) e.hy = max(e.hy, -8);
      return -1;
    }
    if (S === 'bite' || S === 'acid' || S === 'coil') {
      // 地面から 頭を出して かまえる
      if (st < 0.6) {
        e.vx *= 0.85; e.vz *= 0.85;
        e.hy += (9 - e.hy) * min(1, dt * 4);
        const nf = Math.atan2(c.dx, -c.dz); let da = nf - e.face; da = Math.atan2(sin(da), cos(da)); e.face += da * min(1, dt * 5);
        if (S === 'bite') Warn.rect(e.x, e.z, c.dx, c.dz, 22, 7, st / 0.6);
        if (S === 'coil') Warn.rect(e.x, e.z, c.dx, c.dz, 28, 8, st / 0.6);
        e.cx = c.dx; e.cz = c.dz;
        return -1;
      }
      if (S === 'bite') {
        if (!e.hitDone) { e.hitDone = 1; act(e, 'charge'); }
        Warn.rect(e.x, e.z, e.cx, e.cz, max(2, 22 - (st - 0.6) * 40), 7, 1);
        if (st < 1.15) { e.vx = e.cx * 40; e.vz = e.cz * 40; e.hy += (1.5 - e.hy) * min(1, dt * 10); B._Z.damageCircle(e.x, e.z, 4.5, 1500, { force: 22, cause: 'bite' }); if (e.hitDone === 1 && heroIn(B, e.x, e.z, 4.2)) { e.hitDone = 2; hitHero(B, e, e.x, e.z, 26, 9, 'bite', e.cx - e.cz * 0.6, e.cz + e.cx * 0.6); } }
        else { e.vx *= 0.9; e.vz *= 0.9; e.hy += (-7 - e.hy) * min(1, dt * 2); }
        if (st > 2.0) done(e, 0.6, c);
        return -1;
      }
      if (S === 'coil') {
        // 体を たてに 持ち上げて ドーン
        if (!e.hitDone) { const fx = e.cx, fz = e.cz; e.hy += (14 - e.hy) * min(1, dt * 5); Warn.rect(e.x, e.z, fx, fz, 28, 8, 1); if (st > 1.0) { e.hitDone = 1; e.vx = fx * 20; e.vz = fz * 20; } return -1; }
        e.hy += (0.5 - e.hy) * min(1, dt * 14);
        if (e.hitDone === 1 && e.hy < 2) { e.hitDone = 2; e.vx *= 0.1; e.vz *= 0.1; line(B, e, e.x - e.cx * 6, e.z - e.cz * 6, e.cx, e.cz, 28, 8, { dmg: 2000, hero: 26, lift: 9, cause: 'slam', shake: 1.6 }); }
        if (st > 2.4) { e.hy += (-7 - e.hy) * min(1, dt * 2); }
        if (st > 3.0) done(e, 0.6, c);
        return -1;
      }
      // 酸
      const N = 5, n = Math.floor((st - 0.6) / 0.2);
      if (n >= 0 && e.n <= n && e.n < N) { e.n++; const [x, z] = lead(c, 1.0); throwAt(B, e, 'acid', e.x, e.hy + 2, e.z, x + R(-6, 6), z + R(-6, 6), 1.0, { r: 5.5, size: 2.4, dmg: 800, hero: 14 }); }
      if (st > 1.8) { e.hy += (-7 - e.hy) * min(1, dt * 2); }
      if (st > 2.3) done(e, 0.6, c);
      return -1;
    }
    return -1;
  },
  hit(B, e, m, amount) {},
};
const LIST_W = [['erupt', 0, 40, 4], ['bite', 6, 22, 3], ['coil', 6, 26, 3, 1], ['acid', 8, 40, 3, 2]];

// =====================================================================
// 女郎ぐも(人の上半身の 巨大なくも)
// =====================================================================
const spider = {
  def: { name: '女郎ぐも', title: '糸を張る女郎', icon: '🕷️', hp: 40000, speed: 6.5, r: 4.0, points: 4000, scale: 3.6, size: 14, h: 8, tier: 2, S: 3.2, color: 0x2a2a30 },
  stride: 0.7, feet: { w: 1.4, f: 0, s: 0.5 }, turn: 3.5, fall: 'collapse', fallT: 1.3,
  build(m) {
    const shell = mat(m, { map: chitinTex('#1e1c22'), color: 0xffffff, roughness: 0.35, metalness: 0.2 });
    const stripe = mat(m, { map: canvasTex('jorou', 256, 256, (c2, S2) => { c2.fillStyle = '#1a1a1e'; c2.fillRect(0, 0, S2, S2); for (let y = 0; y < S2; y += 40) { c2.fillStyle = '#d8b020'; c2.fillRect(0, y, S2, 12); c2.fillStyle = '#a02020'; c2.fillRect(0, y + 16, S2, 6); } }), color: 0xffffff, roughness: 0.4 });
    const skin = mat(m, { map: skinTex('#c8c0b8', { wounds: 6, veins: 40, vein: 'rgba(60,40,90,0.5)', drips: 8 }), color: 0xffffff, roughness: 0.6 });
    const hair = mat(m, { color: 0x0c0c10, roughness: 0.8, side: THREE.DoubleSide });
    const kimono = mat(m, { map: canvasTex('kimono', 128, 128, (c2, S2) => { c2.fillStyle = '#5a0a1a'; c2.fillRect(0, 0, S2, S2); for (let i = 0; i < 30; i++) { c2.fillStyle = 'rgba(230,180,60,0.6)'; c2.beginPath(); c2.arc(Math.random() * S2, Math.random() * S2, 5, 0, 7); c2.fill(); } }), color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
    const eye = mat(m, { color: 0x400808, emissive: 0xff2030, emissiveIntensity: 2.8, glow: true });
    const G = new Rig(m);
    const body = G.bone(null, 0, 2.6, 0);
    G.add(body, blob(1.2, 0.08, 2, 20, 14), stripe, 0, 0.3, 1.6, 0, 0, 0, 1.1, 0.9, 1.4);       // おなか(しま)
    G.add(body, sph(0.75, 16, 12), shell, 0, 0, -0.2, 0, 0, 0, 1, 0.7, 1.15);                     // 胸
    for (let i = 0; i < 8; i++) G.add(body, sph(0.08, 6, 6), eye, (i % 4 - 1.5) * 0.15, 0.3 + (i >> 2) * 0.1, -0.95);
    for (let i = 0; i < 2; i++) G.add(body, spike(0.5, 0.08), shell, (i ? 1 : -1) * 0.2, -0.2, -0.95, -PI / 2 - 0.4, 0, 0);
    // 人の上半身(着物・長い黒髪)
    const torso = G.bone(body, 0, 0.45, -0.55);
    G.add(torso, lathe([[0.3, 0], [0.26, 0.35], [0.3, 0.7], [0.33, 0.95], [0.2, 1.1], [0, 1.15]], 14, (p) => { p.z *= 0.75; }), skin);
    G.add(torso, cyl(0.38, 0.5, 0.75, 14, true), kimono, 0, 0.2, 0);
    const head = G.bone(torso, 0, 1.12, 0);
    G.add(head, sph(0.2, 14, 12), skin, 0, 0.18, 0, 0, 0, 0, 0.9, 1.15, 1);
    for (const sx of [-1, 1]) G.add(head, sph(0.03, 6, 6), eye, sx * 0.07, 0.2, -0.17);
    for (let i = 0; i < 12; i++) { const a = R(-1.6, 1.6); G.add(head, new THREE.PlaneGeometry(0.16, R(1.2, 2.0)), hair, sin(a) * 0.16, -0.4, cos(a) * 0.15 + 0.06, 0.15, a, 0); }
    const arms = [];
    for (const sx of [-1, 1]) {
      const a = G.bone(torso, sx * 0.32, 0.92, 0);
      G.add(a, limb(0.5, 0.07, 0.06), skin);
      G.add(a, cyl(0.12, 0.22, 0.45, 8, true), kimono, 0, -0.3, 0);
      const f = G.bone(a, 0, -0.5, 0);
      G.add(f, limb(0.5, 0.06, 0.05), skin);
      for (let k = 0; k < 4; k++) G.add(f, spike(0.18, 0.012, 4), bone0(m), (k - 1.5) * 0.025, -0.55, 0, PI);
      arms.push({ a, f, sx });
    }
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const base = G.bone(body, side * 0.6, 0, -0.6 + k * 0.35);
      base.rotation.y = (side < 0 ? PI : 0) + (k - 1.5) * 0.45 * (side < 0 ? -1 : 1);
      const up = G.bone(base, 0, 0, 0);
      G.add(up, limbX(2.2, 0.13, 0.1), shell);
      for (let s2 = 0; s2 < 3; s2++) G.add(up, spike(0.2, 0.03, 4), shell, 0.5 + s2 * 0.6, 0.12, 0);
      const kn = G.bone(up, 2.2, 0, 0);
      G.add(kn, limbX(2.8, 0.1, 0.04), stripe);
      legs.push({ base, up, kn, side, k });
    }
    G.finish();
    m.j = { body, torso, head, arms, legs };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state;
    const air = (e.y || 0) > 0.5;
    let by = 2.6 + 0.08 * sin(ph * 4);
    if (S === 'leap' && st < 0.5) by = 2.6 - 1.0 * ease(st / 0.5);
    if (S === 'dead') by = 2.6 - 1.5 * min(1, e.st);
    j.body.position.y = by;
    j.body.rotation.x = S === 'web' || S === 'poison' ? -0.25 : 0;
    j.torso.rotation.set(-0.2 + 0.1 * sin(t * 1.3) + (S === 'roar' || S === 'enter' ? 0.5 : 0), 0.3 * sin(t * 0.7), 0);
    j.head.rotation.set(0.2 * sin(t * 1.1) + (S === 'roar' ? 0.4 : 0), 0.4 * sin(t * 0.5), 0.15 * sin(t * 0.9));
    for (const A of j.arms) { A.a.rotation.set(1.0 + 0.4 * sin(t * 2 + A.sx), 0, A.sx * 0.5); A.f.rotation.x = 0.8; if (S === 'web') { A.a.rotation.set(2.6, 0, A.sx * 0.2); A.f.rotation.x = 0.1; } }
    for (const L of j.legs) {
      const g = ph * 2 + (L.k % 2 ? PI : 0) + (L.side > 0 ? PI : 0);
      let lift = 0.65 + 0.3 * max(0, cos(g)), sw = 0.3 * sin(g), kn = -1.85;
      if (air) { lift = 0.2; kn = -1.2; sw = 0; }
      if (S === 'stab' && L.k < 2) { const p = (st * 3 + L.k * 0.5 + (L.side > 0 ? 0.25 : 0)) % 1; lift = 1.3 - 1.3 * ease(p); kn = -1.3; }
      if (S === 'dead') { lift = 1.3; kn = -2.6; }
      L.up.rotation.set(0, sw * (L.side < 0 ? 1 : -1), lift);
      L.kn.rotation.set(0, 0, kn);
    }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if ((e.brood = (e.brood || 0) + dt) > (e.phase ? 7 : 10)) { e.brood = 0; return begin(e, 'brood'); }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_S); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'web' || S === 'webstorm') {
      const N = S === 'webstorm' ? 8 : 3, gap = S === 'webstorm' ? 0.12 : 0.25, n = Math.floor((st - 0.5) / gap);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.torso.getWorldPosition(_v);
        const [x, z] = lead(c, 1.0), rr = S === 'webstorm' ? 12 : 5;
        throwAt(B, e, 'web', _v.x, _v.y, _v.z, x + R(-rr, rr), z + R(-rr, rr), 1.0, { r: 6, size: 2.2, dmg: 300, hero: 12, warnCol: 0xd0d0ff });
      }
      if (st > 0.7 + N * gap) { if (S === 'webstorm') return begin(e, 'leap'); done(e, 0.9, c); }
      return 0;
    }
    if (S === 'leap') {
      if (st < 0.5) { const [x, z] = lead(c, 1.3); e.tx = x; e.tz = z; Warn.circle(x, z, 11, st / 1.9); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 1.4; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 21; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 11, st / 1.9);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 30 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.9 && e.y <= 0) { e.hitDone = 1; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 11, { dmg: 2000, hero: 27, lift: 10, big: true, cause: 'leap' }); }
        return -1;
      }
      if (st > 2.4) done(e, 0.8, c);
      return 0;
    }
    if (S === 'stab') {
      if (!e.pts) { e.pts = []; for (let i = 0; i < 7; i++) { const a = R(0, TAU), r = i === 0 ? 0 : R(2, 8); e.pts.push([c.px + cos(a) * r, c.pz + sin(a) * r]); } }
      for (let i = 0; i < e.pts.length; i++) {
        const p = e.pts[i], t0 = 0.6 + i * 0.14;
        if (st < t0) Warn.circle(p[0], p[1], 3.6, st / t0);
        else if (e.n <= i) { e.n = i + 1; slam(B, e, p[0], p[1], 3.6, { dmg: 1000, hero: 18, lift: 6, cause: 'claw', shake: 0.4 }); }
      }
      if (st > 1.8) { e.pts = null; done(e, 0.8, c); }
      return 0.5;
    }
    if (S === 'brood') {
      if (st > 0.7 && !e.hitDone) {
        e.hitDone = 1;
        for (let i = 0; i < (e.phase ? 14 : 9); i++) { const a = R(0, TAU); const z = B._Z.spawn(Math.random() < 0.7 ? 'imp' : 'leaper', e.x + cos(a) * 4, e.z + sin(a) * 4); if (z) { z.kx = cos(a) * 10; z.kz = sin(a) * 10; } }
        FX.burst({ x: e.x, y: 4, z: e.z, count: 50, color: 0x2a2a20, speed: 10, up: 6, life: 0.8, size: 0.25 });
        act(e, 'summon');
      }
      if (st > 1.2) done(e, 0.4, c);
      return 0;
    }
    if (S === 'poison') {
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.6) { Warn.cone(e.x, e.z, fx, fz, 20, 0.6, st / 0.6, 0x90ff40); return 0; }
      if (!e.lockFace) lock(e, c);
      Warn.cone(e.x, e.z, e.ax, e.az, 20, 0.6, 1, 0x90ff40);
      for (let i = 0; i < 3; i++) { const a = e.face + R(-0.5, 0.5), s = R(10, 20); FX.smoke(e.x + e.ax * 3, 3, e.z + e.az * 3, 1.5, 1.2, 0x7aa030, sin(a) * s, R(-2, 0), -cos(a) * s, 0.5); }
      if ((e.n += dt) > 0.2) { e.n = 0; cone(B, e, e.x, e.z, e.ax, e.az, 20, 0.6, { dmg: 450, hero: 12, lift: 2, cause: 'acid', force: 6 }); }
      if (st > 2.2) done(e, 0.9, c);
      return 0;
    }
    return c.sp;
  },
};
function bone0(m) { return m._bone || (m._bone = mat(m, { color: BONE, roughness: 0.45 })); }
const LIST_S = [['web', 8, 50, 3], ['leap', 12, 60, 3], ['stab', 0, 16, 3], ['poison', 0, 20, 3, 1], ['webstorm', 6, 50, 3, 2]];

// =====================================================================
// メカ屍(ゾンビが乗った 2 本足の機械)
// =====================================================================
const mecha = {
  def: { name: 'メカ屍', title: '鋼鉄の屍兵器', icon: '🤖', hp: 44800, speed: 4.6, r: 3.8, points: 4000, scale: 5.8, size: 14, tier: 2, S: 3.4, color: 0x5a5a60 },
  stride: 0.7, feet: { w: 0.55, f: 0.2, s: 1.2 }, fall: 'topple', fallT: 1.4, enter: 'sky',
  build(m) {
    const armor = mat(m, { map: plateTex('#6a6e74', { grid: 64, blood: 6, hazard: false }), color: 0xffffff, metalness: 0.75, roughness: 0.35 });
    const dark = mat(m, { color: 0x1a1c20, metalness: 0.6, roughness: 0.4 });
    const hazard = mat(m, { map: plateTex('#2a2a24', { hazard: true, grid: 256 }), color: 0xffffff, roughness: 0.6 });
    const glass = mat(m, { color: 0x203a30, emissive: 0x104a20, emissiveIntensity: 0.8, roughness: 0.1, metalness: 0.3, glow: true });
    const red = mat(m, { color: 0x400808, emissive: 0xff2010, emissiveIntensity: 3, glow: true });
    const skin = mat(m, { map: skinTex('#7a8a6a', { wounds: 10 }), color: 0xffffff });
    const gut = mat(m, { color: 0x6a1010, roughness: 0.4, emissive: 0x200404 });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 2.3, 0);
    G.add(hips, box(1.4, 0.5, 1.0), armor);
    G.add(hips, cyl(0.25, 0.25, 1.6, 10), dark, 0, 0, 0, 0, 0, PI / 2);
    const torso = G.bone(hips, 0, 0.3, 0);
    G.add(torso, box(1.9, 1.2, 1.5), armor, 0, 0.75, 0);
    G.add(torso, box(1.95, 0.25, 1.55), hazard, 0, 0.2, 0);
    G.add(torso, sph(0.62, 16, 12, 0, TAU, 0, PI / 2), glass, 0, 1.35, -0.1);            // 操縦席のガラス
    G.add(torso, lathe([[0.22, 0], [0.26, 0.3], [0.2, 0.45], [0, 0.5]], 10), skin, 0, 1.3, -0.1);   // 中の ゾンビ
    G.add(torso, sph(0.16, 10, 8), skin, 0, 1.9, -0.1);
    for (const sx of [-1, 1]) G.add(torso, sph(0.08, 8, 6), red, sx * 0.5, 1.0, -0.77);
    for (let i = 0; i < 5; i++) G.add(torso, tube([[R(-0.8, 0.8), 1.2, 0.75], [R(-1, 1), 0.6, 1.1], [R(-0.6, 0.6), 0.1, 0.8]], 0.06, 10, 5), i < 2 ? gut : dark);
    // 肩の ミサイルの箱
    const pods = [];
    for (const sx of [-1, 1]) {
      const p = G.bone(torso, sx * 1.2, 1.45, 0.2);
      G.add(p, box(0.7, 0.6, 0.9), armor);
      for (let i = 0; i < 6; i++) G.add(p, cyl(0.07, 0.07, 0.05, 8), red, (i % 3 - 1) * 0.2, (i < 3 ? 0.12 : -0.12), -0.46, PI / 2, 0, 0);
      pods.push(p);
    }
    // 右腕 = 光線砲 / 左腕 = 大きな爪
    const armR = G.bone(torso, 1.25, 0.9, 0), armL = G.bone(torso, -1.25, 0.9, 0);
    G.add(armR, cyl(0.3, 0.25, 0.9, 10), armor, 0, -0.45, 0);
    const foreR = G.bone(armR, 0, -0.9, 0);
    G.add(foreR, cyl(0.32, 0.32, 1.4, 12), dark, 0, -0.5, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; G.add(foreR, cyl(0.06, 0.06, 0.6, 6), armor, cos(a) * 0.18, -1.45, sin(a) * 0.18); }
    G.add(foreR, cyl(0.15, 0.15, 0.05, 10), red, 0, -1.76, 0);
    G.add(armL, cyl(0.3, 0.25, 0.9, 10), armor, 0, -0.45, 0);
    const foreL = G.bone(armL, 0, -0.9, 0);
    G.add(foreL, box(0.55, 1.1, 0.55), armor, 0, -0.5, 0);
    for (let i = 0; i < 3; i++) G.add(foreL, spike(0.8, 0.09), armor, (i - 1) * 0.18, -1.05, 0, PI, 0, (i - 1) * 0.2);
    // 逆関節の 足
    const legs = {}, knees = {}, feet = {};
    for (const sx of [-1, 1]) {
      const l = G.bone(hips, sx * 0.8, -0.1, 0);
      G.add(l, box(0.45, 1.3, 0.5), armor, 0, -0.55, -0.25, 0.5, 0, 0);
      const k = G.bone(l, 0, -1.1, -0.55);
      G.add(k, cyl(0.2, 0.2, 0.55, 10), dark, 0, 0, 0, 0, 0, PI / 2);
      G.add(k, box(0.35, 1.25, 0.4), armor, 0, -0.55, 0.3, -0.5, 0, 0);
      G.add(k, cyl(0.08, 0.08, 1.1, 6), hazard, 0.25, -0.5, 0.3, -0.5, 0, 0);
      const f = G.bone(k, 0, -1.1, 0.6);
      G.add(f, box(0.7, 0.2, 1.3), armor, 0, -0.05, -0.3);
      for (let i = 0; i < 3; i++) G.add(f, spike(0.35, 0.07), dark, (i - 1) * 0.22, -0.05, -0.95, -PI / 2);
      legs[sx] = l; knees[sx] = k; feet[sx] = f;
    }
    G.finish();
    m.j = { hips, torso, pods, armR, armL, foreR, foreL, legL: legs[-1], legR: legs[1], kneeL: knees[-1], kneeR: knees[1], footL: feet[-1], footR: feet[1] };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state, s = sin(ph), c = cos(ph);
    const k = min(1, e.spd / 2.5);
    j.legL.rotation.x = s * 0.45 * k; j.legR.rotation.x = -s * 0.45 * k;
    j.kneeL.rotation.x = (0.5 * max(0, c)) * k; j.kneeR.rotation.x = (0.5 * max(0, -c)) * k;
    j.footL.rotation.x = -j.legL.rotation.x - j.kneeL.rotation.x; j.footR.rotation.x = -j.legR.rotation.x - j.kneeR.rotation.x;
    j.hips.position.y = 2.3 - 0.12 * abs(s) * k;
    j.torso.rotation.set(0, 0.15 * s * k, 0);
    j.armR.rotation.set(0.3 + 0.1 * sin(t * 1.3), 0, 0.15); j.foreR.rotation.x = 0.6;
    j.armL.rotation.set(0.3 - 0.2 * s * k, 0, -0.15); j.foreL.rotation.x = 0.4;
    // 砲は 主人公へ
    if (S === 'laser' || S === 'gatling') { j.armR.rotation.set(1.45, 0, 0.1); j.foreR.rotation.x = 0.1; j.torso.rotation.y = e.aimY || 0; }
    if (S === 'missiles') { for (const p of j.pods) p.rotation.x = 0.5 * min(1, st * 3); } else for (const p of j.pods) p.rotation.x = 0;
    if (S === 'punch') { const a = ease(min(1, st / 0.55)), b = ease(seg(st, 0.55, 0.68)); j.armL.rotation.set(0.3 + 2.6 * a - 2.4 * b, 0, -0.2); j.torso.rotation.x = 0.3 * a - 0.6 * b; }
    if (S === 'jet' && (e.y || 0) > 0.3) { j.legL.rotation.x = j.legR.rotation.x = 0.3; j.kneeL.rotation.x = j.kneeR.rotation.x = 0.6; }
    if (S === 'roar' || S === 'enter' || S === 'overload') { j.torso.rotation.x = -0.25 + 0.05 * sin(t * 30); j.armR.rotation.z = 0.9; j.armL.rotation.z = -0.9; }
    if (S === 'dead') { j.torso.rotation.z = 0.3 * sin(t * 13); }
    // 火花・排気
    if (!m.dead && Math.random() < dt * 6) { m.root.updateMatrixWorld(true); j.torso.getWorldPosition(_v); FX.smoke(_v.x + R(-2, 2), _v.y + 3, _v.z + R(-2, 2), 0.8, 1.2, 0x3a3a3a, 0, 2, 0, 0.5); }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_M); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'missiles') {
      const N = e.phase ? 14 : 8, n = Math.floor((st - 0.5) / 0.07);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        const P = m.j.pods[e.n % 2]; m.root.updateMatrixWorld(true); P.getWorldPosition(_v);
        const a = R(0, TAU), r = e.n <= 2 ? R(0, 2) : R(3, 14);
        throwAt(B, e, 'missile', _v.x, _v.y + 1, _v.z, c.px + cos(a) * r, c.pz + sin(a) * r, R(1.3, 1.8), { r: 5, dmg: 1000, hero: 20, lift: 6, homing: e.n <= 2 ? 1.2 : 0, g: 18 });
        FX.burst({ x: _v.x, y: _v.y + 1, z: _v.z, count: 4, color: 0xffc070, speed: 4, up: 4, life: 0.3, size: 0.2 });
        if (e.n === 1) act(e, 'missiles');
      }
      if (st > 0.8 + N * 0.07) done(e, 1.0, c);
      return 0;
    }
    if (S === 'laser') {
      if (st < 0.05) { const px = -c.dz, pz = c.dx; e.bx0 = c.px - px * 15; e.bz0 = c.pz - pz * 15; e.bx1 = c.px + px * 15; e.bz1 = c.pz + pz * 15; lock(e, c); }
      const T0 = 0.9, T1 = 1.6;
      Warn.rect(e.bx0, e.bz0, e.bx1 - e.bx0, e.bz1 - e.bz0, 30, 4.5, min(1, st / T0), 0xff2050);
      m.root.updateMatrixWorld(true); m.j.foreR.getWorldPosition(_v);
      const k = clamp((st - T0) / T1, 0, 1), x = e.bx0 + (e.bx1 - e.bx0) * k, z = e.bz0 + (e.bz1 - e.bz0) * k;
      e.aimY = 0;
      if (st < T0) FX.glow(_v.x, _v.y - 3, _v.z, 1 + st * 3, 0xff2050, 5);
      else if (st < T0 + T1) beamTick(B, e, _v.x + sin(e.face) * 4, _v.y - 0.5, _v.z - cos(e.face) * 4, x, z, 1.3, 2600, 0xff2050, 'laser', dt);
      if (st > T0 + T1 + 0.3) done(e, 1.0, c);
      return 0;
    }
    if (S === 'gatling') {
      const fx = sin(e.face), fz = -cos(e.face);
      Warn.rect(e.x, e.z, fx, fz, 34, 4, min(1, st / 0.6), 0xffc040);
      if (st > 0.6) {
        m.root.updateMatrixWorld(true); m.j.foreR.getWorldPosition(_v);
        for (let i = 0; i < 2; i++) { const t2 = R(4, 34), x = e.x + fx * t2 + R(-1.5, 1.5), z = e.z + fz * t2 + R(-1.5, 1.5); FX.tracer(_v.x + fx * 3, _v.y - 1, _v.z + fz * 3, x, 0.3, z, 0xffd060, 0.06, 0.12); FX.impact(x, 0.3, z, fx, fz); }
        FX.muzzle(_v.x + fx * 3.5, _v.y - 1, _v.z + fz * 3.5, fx, fz, 0xffc060, 2.5);
        if ((e.n += dt) > 0.15) { e.n = 0; line(B, e, e.x, e.z, fx, fz, 34, 4, { dmg: 450, hero: 14, lift: 3, cause: 'missile', fx: false, decal: false, shake: 0.3 }); }
      }
      if (st > 2.4) done(e, 1.0, c);
      return 0.6;
    }
    if (S === 'jet') {
      if (st < 0.5) { const [x, z] = lead(c, 1.2); e.tx = x; e.tz = z; Warn.circle(x, z, 10, st / 1.9); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 1.3; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 20; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 10, st / 1.9);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 31 * dt; e.y = max(0, e.y + e.vy * dt);
        for (let i = 0; i < 2; i++) FX.flame(e.x + R(-1, 1), e.y + 2, e.z + R(-1, 1), R(-1, 1), -14, R(-1, 1), 1.4, 0.4, 0xa0d0ff, 0x2050ff);
        if (st > 0.8 && e.y <= 0) { e.hitDone = 1; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 10, { dmg: 1900, hero: 26, lift: 9, big: true, cause: 'leap', col: 0x80c0ff }); }
        return -1;
      }
      if (st > 2.3) done(e, 0.8, c);
      return 0;
    }
    if (S === 'punch') {
      if (st < 0.4) { const [x, z] = fwd(e, 6); e.tx = x; e.tz = z; } else if (!e.lockFace) lock(e, c);
      if (st < 0.55) Warn.circle(e.tx, e.tz, 7.5, st / 0.55);
      if (st > 0.6 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 7.5, { dmg: 1500, hero: 24, lift: 8, cause: 'claw' }); }
      if (st > 1.1) done(e, 0.7, c);
      return 0;
    }
    if (S === 'overload') {
      if (st < 0.9) { Warn.circle(e.x, e.z, 30, st / 0.9, 0x60a0ff); if (Math.random() < dt * 20) FX.bolt(e.x, 8, e.z, e.x + R(-8, 8), 0.3, e.z + R(-8, 8), 0x9ad0ff, 0.2, 0.1); }
      if (st > 0.95 && !e.hitDone) {
        e.hitDone = 1;
        slam(B, e, e.x, e.z, 7, { dmg: 1500, hero: 24, lift: 8, cause: 'beam', col: 0x80c0ff, big: true });
        ringWave(B, e, e.x, e.z, { r0: 5, speed: 22, max: 32, w: 2.4, dmg: 900, hero: 22, col: 0x80c0ff });
        for (let i = 0; i < 8; i++) { const a = R(0, TAU), r = R(4, 20); FX.bolt(e.x, 10, e.z, e.x + cos(a) * r, 0.3, e.z + sin(a) * r, 0x9ad0ff, 0.25, 0.25); }
      }
      if (st > 1.8) done(e, 1.0, c);
      return 0;
    }
    return c.sp;
  },
  burstFx(B, e, m, x, z) { for (let i = 0; i < 5; i++) FX.explosion(x + R(-6, 6), z + R(-6, 6), R(5, 8), 'fire'); },
};
const LIST_M = [['missiles', 8, 70, 3], ['laser', 8, 40, 3], ['gatling', 6, 34, 3], ['jet', 14, 60, 2.5], ['punch', 0, 12, 3], ['overload', 0, 30, 3, 2]];

// =====================================================================
// 暴走ゾンビ列車(機関車 + 客車 3 両)
// =====================================================================
const TCAR = 3;
const train = {
  def: { name: '暴走ゾンビ列車', title: '止まらない屍の列車', icon: '🚂', hp: 48000, speed: 12, r: 4.2, points: 4000, scale: 2.4, size: 50, h: 12, zoom: 15, tier: 3, S: 2.6, color: 0x3a3a3a },
  noStand: true, passHero: true, vehicle: true, noCollide: true, enter: 'drive', fall: 'crash', fallT: 1.2,
  build(m) {
    const iron = mat(m, { map: plateTex('#2a2c30', { grid: 64, blood: 10 }), color: 0xffffff, metalness: 0.7, roughness: 0.4 });
    const rust = mat(m, { map: plateTex('#6a3a24', { grid: 128, blood: 14 }), color: 0xffffff, roughness: 0.7, metalness: 0.3 });
    const brass = mat(m, { color: 0xb08a40, metalness: 0.8, roughness: 0.35 });
    const lamp = mat(m, { color: 0x403010, emissive: 0xffe0a0, emissiveIntensity: 3.5, glow: true });
    const fire = mat(m, { color: 0x6a1004, emissive: 0xff5010, emissiveIntensity: 2.4, glow: true });
    const skin = mat(m, { map: skinTex('#7a8a6a', { wounds: 12 }), color: 0xffffff });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const G = new Rig(m);
    const cars = [];
    // 機関車(前 = -z)
    const loco = G.bone(null, 0, 0, 0);
    G.add(loco, cyl(1.0, 1.0, 4.2, 18), iron, 0, 1.9, -0.6, PI / 2, 0, 0);
    G.add(loco, cyl(1.04, 1.04, 0.15, 18), brass, 0, 1.9, -2.0, PI / 2, 0, 0);
    G.add(loco, cyl(0.9, 0.9, 0.3, 18), fire, 0, 1.9, -2.75, PI / 2, 0, 0);                 // 前の かま(光る)
    G.add(loco, box(2.2, 2.2, 1.9), iron, 0, 2.2, 1.9);                                    // 運転室
    G.add(loco, box(2.4, 0.15, 2.1), rust, 0, 3.35, 1.9);
    G.add(loco, cyl(0.35, 0.5, 1.6, 12), iron, 0, 3.4, -1.7);                              // 煙突
    G.add(loco, cyl(0.55, 0.35, 0.4, 12), brass, 0, 4.3, -1.7);
    G.add(loco, sph(0.3, 10, 8), lamp, 0, 2.6, -2.85);
    G.add(loco, box(2.6, 0.5, 6.6), rust, 0, 0.75, 0.1);
    // 牛よけ(とげ と どくろ)
    for (let i = 0; i < 7; i++) G.add(loco, box(0.12, 0.9, 1.1), iron, -0.9 + i * 0.3, 0.6, -3.4, 0.6, 0, 0);
    for (let i = 0; i < 5; i++) G.add(loco, spike(0.8, 0.1), iron, -0.8 + i * 0.4, 0.9, -3.6, -PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) G.add(loco, sph(0.22, 8, 6), bone, -0.6 + i * 0.6, 1.4, -3.3);
    const wg = cyl(0.62, 0.62, 0.25, 14); wg.rotateZ(PI / 2);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) G.add(loco, wg, iron, sx * 1.15, 0.62, -1.8 + i * 1.5);
    cars.push(loco);
    for (let k = 0; k < TCAR; k++) {
      const c = G.bone(null, 0, 0, 7 + k * 5.5);
      G.add(c, box(2.4, 2.4, 4.8), rust, 0, 2.0, 0);
      G.add(c, box(2.6, 0.2, 5.0), iron, 0, 3.3, 0);
      G.add(c, box(2.42, 0.6, 4.0), mat0(m), 0, 2.4, 0);                                   // 窓(黒)
      for (let i = 0; i < 4; i++) { G.add(c, lathe([[0.18, 0], [0.22, 0.3], [0.18, 0.5], [0, 0.55]], 8), skin, (i % 2 ? 1 : -1) * 1.25, 2.2, -1.5 + i * 1.0, 0, 0, (i % 2 ? -1 : 1) * 1.2); G.add(c, sph(0.14, 8, 6), skin, (i % 2 ? 1 : -1) * 1.75, 2.45, -1.5 + i * 1.0); }   // 窓から 乗り出す ゾンビ
      for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) G.add(c, wg, iron, sx * 1.15, 0.62, -1.6 + i * 3.2);
      cars.push(c);
    }
    G.finish();
    m.j = { cars };
    m.trail = new Trail(120);
  },
  spawn(B, e, m) { e.face = Math.atan2(B._Z._px - e.x, -(B._Z._pz - e.z)); m.trail.reset(e.x, 0, e.z, sin(e.face), -cos(e.face), 1.2); e.dist0 = 0; },
  anim(m, e, dt) {
    const j = m.j, T = m.trail;
    T.push(e.x, 0, e.z);
    const S = m.S, step = 1.2;
    for (let k = 0; k < j.cars.length; k++) {
      const off = k === 0 ? 0 : (7 + (k - 1) * 5.5) * S / step;
      T.at(off, _v);
      toLocal(m, e, _v.x, 0, _v.z, j.cars[k].position);
      if (k > 0) j.cars[k].position.z += 0;   // 節の中心
      T.at(off + 3, _d);
      dirLocal(e, _v.x - _d.x, 0, _v.z - _d.z, _d);
      _q.setFromUnitVectors(_fw, _d);
      j.cars[k].quaternion.copy(_q);
      j.cars[k].position.y = 0.02 * sin(e.t * 30 + k);
    }
    // 煙突の煙 と 火
    if (!m.dead && Math.random() < dt * 30) { m.root.updateMatrixWorld(true); const fx = sin(e.face), fz = -cos(e.face); FX.smoke(e.x + fx * 4.4, 11.5, e.z + fz * 4.4, 1.6, 1.8, 0x1a1a1a, -e.vx * 0.3, 3, -e.vz * 0.3, 0.7); if (e.phase >= 1) FX.flame(e.x + fx * 4.4, 11.5, e.z + fz * 4.4, 0, 6, 0, 1.6, 0.5); }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    const fx = sin(e.face), fz = -cos(e.face);
    // 先頭で ゾンビ・こわせる物を はねとばす
    const sp = Math.hypot(e.vx, e.vz);
    if (sp > 4 && (e.plowT = (e.plowT || 0) - dt) <= 0) {
      e.plowT = 0.08;
      B._Z.damageCircle(e.x + fx * 8, e.z + fz * 8, 4, sp > 12 ? 2500 : 800, { force: 14 + sp * 1.3, cause: 'train', falloff: false });
      if (World.damage && Math.random() < 0.5) try { World.damage(e.x + fx * 8, e.z + fz * 8, 4.5, 1500, { cause: 'explosion' }); } catch (err) {}
      if (!e.ranHero && sp > 8 && heroIn(B, e.x + fx * 6, e.z + fz * 6, 4.5)) { e.ranHero = 1; hitHero(B, e, e.x, e.z, 30, 10, 'train', fx - fz * 0.9, fz + fx * 0.9); }
      if (Math.random() < 0.4) quake(B, e.x, e.z, 0.3, 50);
    }
    // 燃える線路(怒り 2)
    if (e.phase >= 2 && sp > 8 && Math.random() < dt * 10) { FX.flame(e.x - fx * 30, 0.5, e.z - fz * 30, 0, 3, 0, 1.6, 1.2); B._Z.damageCircle(e.x - fx * 30, e.z - fz * 30, 3, 300, { cause: 'bossfire' }); }
    // 客車から ゾンビ
    if ((e.drop = (e.drop || 0) + dt) > 4) { e.drop = 0; for (let i = 0; i < 4; i++) { const t = R(10, 25), z = B._Z.spawn(Math.random() < 0.6 ? 'runner' : 'walker', e.x - fx * t + R(-3, 3), e.z - fz * t + R(-3, 3)); if (z) z.stun = 0.5; } }
    if (S === 'walk' || S === 'roar') {
      // 主人公の 横を ねらって 大きく回る → 向いたら 突撃の予告
      const want = Math.atan2(c.dx, -c.dz); let da = want - e.face; da = Math.atan2(sin(da), cos(da));
      e.face += clamp(da, -1, 1) * dt * 1.4;
      const s2 = c.sp * 0.7;
      e.vx += (sin(e.face) * s2 - e.vx) * 0.05; e.vz += (-cos(e.face) * s2 - e.vz) * 0.05;
      if (S === 'walk' && abs(da) < 0.25 && e.cool <= 0 && c.d > 12) { begin(e, 'line'); e.ranHero = 0; act(e, 'horn'); }
      else if (S === 'walk' && e.cool <= 0 && e.phase >= 1 && Math.random() < dt * 0.6) begin(e, 'cannon');
      return -1;
    }
    if (S === 'line') {
      // 予告 → 全速で 一直線
      if (st < 1.0) { Warn.rect(e.x, e.z, fx, fz, 60, 8, st / 1.0); e.vx *= 0.97; e.vz *= 0.97; if (Math.random() < dt * 20) FX.smoke(e.x + fx * 4.4, 11.5, e.z + fz * 4.4, 2.5, 1.5, 0xe0e0e0, 0, 5, 0, 0.6); e.cx = fx; e.cz = fz; return -1; }
      Warn.rect(e.x, e.z, e.cx, e.cz, max(4, 60 - (st - 1.0) * 30), 8, 1);
      const v = min(30 + e.phase * 4, 10 + (st - 1.0) * 30);
      e.vx = e.cx * v; e.vz = e.cz * v;
      if (st > 1.0 + 60 / 30 + 0.3) done(e, 0.5, c);
      return -1;
    }
    if (S === 'cannon') {
      const N = 3, n = Math.floor(st / 0.4);
      if (e.n <= n && e.n < N) {
        e.n++;
        const t = 7 + TCAR * 5.5;
        const [x, z] = lead(c, 1.3);
        throwAt(B, e, 'shell', e.x - fx * t * m.S * 0.4, 6, e.z - fz * t * m.S * 0.4, x + R(-4, 4), z + R(-4, 4), 1.3, { r: 6.5, dmg: 1300, hero: 22, lift: 7 });
      }
      e.vx += (fx * c.sp * 0.8 - e.vx) * 0.05; e.vz += (fz * c.sp * 0.8 - e.vz) * 0.05;
      if (st > 1.5) done(e, 1.0, c);
      return -1;
    }
    return -1;
  },
  burstFx(B, e, m, x, z) { for (let i = 0; i < 6; i++) FX.explosion(x + R(-10, 10), z + R(-10, 10), R(5, 9), 'fire'); },
};
function mat0(m) { return m._dark || (m._dark = mat(m, { color: 0x0a0a0c, roughness: 0.3 })); }

export const BEASTS = { dragon, worm, spider, mecha, train };
