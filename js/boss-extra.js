// キャラ係: 第2弾のボス 3 体(怪獣の大きさに 作りなおし)。
//   変異ゴリラ マッドコング(立つと 13m)… 車・バスを 投げる・両こぶし たたき・裏拳・胸をたたいて ほえる・大ジャンプ / 怒り: 突進・3 台 連続投げ
//   女王ハイブ クイーン(13m)… 酸の玉・卵を投げて 小鬼が わく・かまの十字ぎり・足で つきさす / 怒り: 金切り声・酸の雨
//   ゾンビ装甲車 デスローダー(長さ 16m)… 突進(ゾンビを ひく)・屋根の大砲・火炎放射 / 怒り: 地雷・回転ドリフト
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, BONE, lathe, sstep, skinTex, plateTex, furTex, chitinTex, sacTex, mat, limb, limbX, spike, blob, box, sph, cyl, torus, ribs, Rig, ease, seg } from './boss-kit.js';
import { act, slam, line, cone, step, hitHero, heroIn, throwAt, quake, pick, begin, done, lock, lead, fwd, roarBlast } from './boss-attacks.js';

const _v = new THREE.Vector3();

// 手に持つ車(骨にくっつける)
function heldCar(bone) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a4a7a, roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.3, metalness: 0.2 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.0), body); a.castShadow = true; g.add(a);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.0), dark); b.position.set(0, 0.55, 0.2); g.add(b);
  g.visible = false;
  bone.add(g);
  return g;
}

// =====================================================================
// 変異ゴリラ マッドコング
// =====================================================================
const gorilla = {
  def: { name: '変異ゴリラ マッドコング', title: '車を投げる暴君', icon: '🦍', hp: 41600, speed: 4.6, r: 3.6, points: 3000, scale: 4.6, size: 13, tier: 2, S: 3.0, color: 0x3a3430 },
  stride: 0.7, feet: { w: 0.55, f: -0.2, s: 1 },
  build(m) {
    const fur = mat(m, { map: furTex('#4a3e36', 4), color: 0xffffff, roughness: 0.95 });
    const silver = mat(m, { map: furTex('#9a948a', 2), color: 0xffffff, roughness: 0.95 });
    const flesh = mat(m, { color: 0x9a4a40, roughness: 0.5, emissive: 0x2a0606 });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const eye = mat(m, { color: 0x300808, emissive: 0xff2010, emissiveIntensity: 3.2, glow: true });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 1.45, 0.4);
    G.add(hips, lathe([[0, -0.4], [0.45, -0.32], [0.62, 0], [0.55, 0.25], [0, 0.32]], 12, (p) => { p.x *= 1.25; }), fur);
    const torso = G.bone(hips, 0, 0.15, 0);
    G.add(torso, lathe([[0.55, 0], [0.75, 0.35], [0.95, 0.85], [1.08, 1.25], [0.82, 1.6], [0.35, 1.78], [0, 1.82]], 16, (p) => {
      p.x *= 1 + 0.45 * sstep(0.6, 1.4, p.y); p.z *= 0.85;
      if (p.z > 0 && p.y > 0.9) p.z += 0.38 * sstep(0.9, 1.5, p.y);
      if (p.y > 1.4) p.y -= 0.2 * min(1, (p.x / 1.1) ** 2);
    }), fur);
    // 銀色の背中 + とげ
    G.add(torso, blob(0.75, 0.15, 3, 16, 12), silver, 0, 1.25, 0.45, 0, 0, 0, 1.3, 0.8, 0.9);
    for (let i = 0; i < 9; i++) G.add(torso, spike(R(0.4, 0.85), 0.08), bone, R(-0.6, 0.6), R(1.0, 1.65), 0.8, R(0.4, 1.0), 0, R(-0.4, 0.4));
    // むき出しの胸(あばら)
    G.add(torso, lathe([[0.4, 0.4], [0.6, 0.8], [0.62, 1.15], [0.45, 1.4], [0, 1.5]], 12, (p) => { p.z = -Math.abs(p.z) * 0.55 - 0.42; p.x *= 1.1; }), flesh);
    ribs(G, torso, bone, 4, 0.75, 0.15, 0.5, 0.04, -0.15, PI * 0.7, 1.4);
    const head = G.bone(torso, 0, 1.62, -0.5);
    G.add(head, lathe([[0, -0.15], [0.22, -0.1], [0.3, 0.08], [0.3, 0.25], [0.22, 0.4], [0, 0.45]], 14, (p) => { if (p.z < 0 && p.y < 0.15) p.z *= 1.4; p.x *= 1.1; }), fur);
    G.add(head, box(0.52, 0.12, 0.2), fur, 0, 0.27, -0.24);
    for (const sx of [-1, 1]) G.add(head, sph(0.07, 8, 6), eye, sx * 0.12, 0.2, -0.33);
    for (const sx of [-1, 1]) G.add(head, spike(0.22, 0.045), bone, sx * 0.14, 0.06, -0.36, PI);
    const jaw = G.bone(head, 0, 0.0, -0.05);
    G.add(jaw, box(0.44, 0.13, 0.44), flesh, 0, -0.08, -0.2);
    for (const sx of [-1, 1]) G.add(jaw, spike(0.2, 0.04), bone, sx * 0.13, -0.03, -0.38);
    const arms = [];
    for (const sg of [-1, 1]) {
      const sh = G.bone(torso, sg * 1.18, 1.35, -0.1);
      G.add(sh, limb(1.35, 0.44, 0.35, 1.25), fur);
      const el = G.bone(sh, 0, -1.35, 0);
      G.add(el, limb(1.3, 0.4, 0.33, 1.2), fur);
      G.add(el, sph(0.45, 12, 10), flesh, 0, -1.42, 0, 0, 0, 0, 1, 0.8, 1.2);
      for (let i = 0; i < 3; i++) G.add(el, spike(0.4, 0.06), bone, sg * 0.27, -0.4 - i * 0.3, 0.1, 0, 0, -sg * 1.3);
      arms.push({ sh, el, sg });
    }
    const legs = [];
    for (const sg of [-1, 1]) {
      const lg = G.bone(hips, sg * 0.5, -0.15, 0);
      G.add(lg, limb(0.75, 0.38, 0.29), fur);
      const kn = G.bone(lg, 0, -0.75, 0);
      G.add(kn, limb(0.6, 0.29, 0.23), fur);
      G.add(kn, box(0.48, 0.2, 0.75), flesh, 0, -0.65, -0.15);
      legs.push({ lg, kn });
    }
    G.finish();
    m.car = heldCar(arms[1].el); m.car.position.set(-0.3, -1.9, 0); m.car.rotation.set(0, PI / 2, 0.3); m.car.scale.setScalar(0.55);
    m.j = { hips, torso, head, jaw, arms, legs };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, s = sin(ph), c = cos(ph), st = e.st, S = e.state;
    const k = min(1, e.spd / 2.5);
    let lean = 0.75;
    j.hips.position.y = 1.45 - 0.1 * abs(s) * k;
    for (let i = 0; i < 2; i++) { const L = j.legs[i], sg = i ? 1 : -1; L.lg.rotation.x = sg * s * 0.55 * k + 0.2; L.kn.rotation.x = -(0.3 + 0.5 * max(0, sg * c)) * k - 0.2; }
    for (let i = 0; i < 2; i++) { const A = j.arms[i], sg = i ? -1 : 1; A.sh.rotation.set(1.0 + sg * s * 0.6 * k, 0, A.sg * 0.25); A.el.rotation.set(-0.35 + 0.25 * max(0, sg * c) * k, 0, 0); }
    j.head.rotation.set(-0.6 + 0.1 * sin(t * 1.1), 0.3 * sin(t * 0.6), 0);
    j.jaw.rotation.x = -(0.15 + 0.1 * sin(t * 3));
    if (S === 'beat' || S === 'roar' || S === 'enter') {
      lean = -0.15; const b = sin(st * 18);
      for (let i = 0; i < 2; i++) { const A = j.arms[i]; A.sh.rotation.set(1.6 + (i ? b : -b) * 0.4, 0, A.sg * -0.6); A.el.rotation.set(1.9, 0, 0); }
      j.head.rotation.x = 0.4; j.jaw.rotation.x = -0.7;
    } else if (S === 'car' || S === 'barrage') {
      const T0 = S === 'barrage' ? 0.3 : 0.45, T1 = S === 'barrage' ? 0.35 : 0.6;
      const u = S === 'barrage' ? st % 0.9 : st;
      if (u < T0) { const a = ease(u / T0); lean = 0.75 + 0.35 * a; j.arms[1].sh.rotation.set(1.3 + 0.6 * a, 0, 0.2); j.arms[1].el.rotation.x = -0.2; }
      else if (u < T0 + T1) { const a = ease((u - T0) / T1); lean = 1.1 - 1.3 * a; for (const A of j.arms) { A.sh.rotation.set(1.9 + 1.1 * a, 0, A.sg * -0.3); A.el.rotation.set(0.6 * a, 0, 0); } j.jaw.rotation.x = -0.5; }
      else { const a = ease(min(1, (u - T0 - T1) / 0.2)); lean = -0.2 + 1.0 * a; for (const A of j.arms) { A.sh.rotation.set(3.0 - 2.4 * a, 0, A.sg * -0.2); A.el.rotation.set(0.2, 0, 0); } }
    } else if (S === 'pound' || S === 'leap') {
      const T = S === 'leap' ? 0.4 : 0.55;
      const a = st < T ? ease(st / T) : max(0, 1 - (st - T) * 7);
      if (S === 'leap' && e.y > 0.3) { lean = 0.1; for (const A of j.arms) { A.sh.rotation.set(2.9, 0, A.sg * -0.4); A.el.rotation.set(0.3, 0, 0); } }
      else { lean = 0.75 - 0.9 * a; for (const A of j.arms) { A.sh.rotation.set(1.0 + 2.2 * a, 0, A.sg * -0.2); A.el.rotation.set(0.4 * a, 0, 0); } }
      j.jaw.rotation.x = -0.6 * a;
    } else if (S === 'swipe') {
      const a = ease(min(1, st / 0.55)), b = ease(seg(st, 0.55, 0.75));
      const A = j.arms[0]; A.sh.rotation.set(1.4, 0, -0.3 - 1.2 * a + 2.2 * b); A.el.rotation.x = 0.2;
      lean = 0.4;
    } else if (S === 'charge' && st > 0.5) { const r = sin(e.t * 15); for (let i = 0; i < 2; i++) { const A = j.arms[i]; A.sh.rotation.set(1.0 + (i ? r : -r) * 0.9, 0, A.sg * 0.25); } lean = 0.95; }
    else if (S === 'dead') { lean = -0.4; for (const A of j.arms) A.sh.rotation.set(2.2, 0, A.sg * -0.8); j.jaw.rotation.x = -0.8; }
    j.torso.rotation.set(-lean, 0.12 * s * k, 0.06 * s * k);
    m.car.visible = (S === 'car' && st > 0.45 && st < 1.05) || (S === 'barrage' && (st % 0.9) > 0.3 && (st % 0.9) < 0.65);
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (!e.beatDone) { e.beatDone = 1; return begin(e, 'beat'); }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_G); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'beat') {
      if (st > 0.5 && !e.hitDone) { e.hitDone = 1; roarBlast(B, e, 14); }
      if (st > 1.4) done(e, 0.6, c);
      return 0;
    }
    if (S === 'car') {
      if (st > 0.45 && !e.n) { e.n = 1; const [x, z] = fwd(e, 5); FX.burst({ x, y: 0.4, z, count: 24, color: 0x5a5048, speed: 6, up: 3, life: 0.7, size: 0.4 }); }
      const [tx, tz] = lead(c, 1.3);
      if (st > 0.45 && st < 1.05) Warn.circle(tx, tz, e.phase ? 10 : 8, (st - 0.45) / 1.9);
      if (st > 1.05 && e.n === 1) {
        e.n = 2;
        m.root.updateMatrixWorld(true); m.car.getWorldPosition(_v);
        if (e.phase >= 1) throwAt(B, e, 'bus', _v.x, _v.y, _v.z, tx, tz, 1.3, { r: 10, size: 1.0, dmg: 2200, hero: 26, lift: 9 });
        else throwAt(B, e, 'car', _v.x, _v.y, _v.z, tx, tz, 1.25, { r: 8, size: 1.7, dmg: 1800, hero: 24, lift: 8 });
        act(e, 'throw');
      }
      if (st > 1.6) done(e, 1.0, c);
      return 0;
    }
    if (S === 'barrage') {
      const n = Math.floor(st / 0.9), u = st % 0.9;
      if (n < 3 && u > 0.65 && e.n <= n) {
        e.n = n + 1;
        m.root.updateMatrixWorld(true); m.car.getWorldPosition(_v);
        const [tx, tz] = lead(c, 1.1);
        throwAt(B, e, 'car', _v.x, _v.y, _v.z, tx + R(-5, 5), tz + R(-5, 5), 1.1, { r: 8, size: 1.5, dmg: 1600, hero: 22 });
        act(e, 'throw');
      }
      if (st > 2.9) done(e, 1.0, c);
      return 0;
    }
    if (S === 'pound') {
      if (st < 0.4) { const [x, z] = fwd(e, 6.5); e.tx = x; e.tz = z; } else if (!e.lockFace) lock(e, c);
      if (st < 0.55) Warn.circle(e.tx, e.tz, 9, st / 0.55);
      if (st > 0.55 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 9, { dmg: 1500, hero: 25, lift: 8, big: true, cause: 'slam' }); }
      if (st > 1.1) done(e, 0.9, c);
      return 0;
    }
    if (S === 'swipe') {
      if (st > 0.35 && !e.lockFace) lock(e, c);
      if (st < 0.55) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 14, 1.2, st / 0.55);
      if (st > 0.6 && !e.hitDone) { e.hitDone = 1; cone(B, e, e.x, e.z, e.ax, e.az, 14, 1.2, { dmg: 1100, hero: 24, lift: 5, cause: 'claw', force: 32 }); FX.slash(e.x, 3, e.z, e.face, 2.6, 4, 14, 0xffd8b0, 0.3, 1, 0.1, 2.5, 0.8, 0.5); }
      if (st > 1.1) done(e, 0.8, c);
      return 0.4;
    }
    if (S === 'leap') {
      if (st < 0.4) { const [x, z] = lead(c, 1.0); e.tx = x; e.tz = z; Warn.circle(x, z, 10, st / 1.5); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 1.05; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 16; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 10, st / 1.5);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 31 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.7 && e.y <= 0) { e.hitDone = 1; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 10, { dmg: 1800, hero: 26, lift: 9, big: true, cause: 'leap' }); }
        return -1;
      }
      if (st > 2.0) done(e, 0.9, c);
      return 0;
    }
    if (S === 'charge') {
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.5) { Warn.rect(e.x, e.z, fx, fz, 40, 8, st / 0.5); return 0; }
      if (!e.lockFace) { lock(e, c); act(e, 'charge'); }
      Warn.rect(e.x, e.z, e.ax, e.az, max(2, 40 - (st - 0.5) * 24), 8, 1);
      e.vx = e.ax * 24; e.vz = e.az * 24;
      B._Z.damageCircle(e.x + e.ax * 3, e.z + e.az * 3, 4.5, 1200, { force: 32, cause: 'tank' });
      if (!e.hitDone && heroIn(B, e.x + e.ax * 3, e.z + e.az * 3, 4.5)) { e.hitDone = 1; hitHero(B, e, e.x, e.z, 28, 9, 'charge', e.ax - e.az * 0.7, e.az + e.ax * 0.7); }
      if ((e.n += dt) > 0.22) { e.n = 0; step(B, e, e.x, e.z, 0.8); }
      if (st > 0.5 + 40 / 24) { e.vx *= 0.2; e.vz *= 0.2; return begin(e, 'pound'); }
      return -1;
    }
    return c.sp;
  },
};
const LIST_G = [['car', 12, 70, 3], ['pound', 0, 14, 3], ['swipe', 0, 14, 3], ['leap', 15, 60, 2.5], ['beat', 0, 30, 1], ['charge', 12, 45, 3, 1], ['barrage', 10, 60, 3, 2]];

// =====================================================================
// 女王ハイブ クイーン
// =====================================================================
const queen = {
  def: { name: '女王ハイブ クイーン', title: '群れを産む女王', icon: '🪲', hp: 40000, speed: 3.0, r: 3.8, points: 3000, scale: 4.2, size: 13, tier: 2, S: 3.2, color: 0x6a7a40 },
  stride: 0.9, feet: { w: 1.2, f: 0, s: 0.5 }, fall: 'collapse', fallT: 1.4,
  build(m) {
    const shell = mat(m, { map: chitinTex('#3a3a28'), color: 0xffffff, roughness: 0.35, metalness: 0.15 });
    const sacM = mat(m, { map: sacTex(), color: 0xffffff, roughness: 0.3, emissive: 0x6a7010, emissiveIntensity: 0.7, glow: true });
    const bone = mat(m, { color: BONE, roughness: 0.45 });
    const eye = mat(m, { color: 0x103010, emissive: 0x80ff30, emissiveIntensity: 2.6, glow: true });
    const wing = mat(m, { color: 0x8a9a70, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x1a2008, shadow: false });
    const G = new Rig(m);
    const body = G.bone(null, 0, 1.6, 0);
    const sac = G.bone(body, 0, 0.4, 1.7);
    const sg = new THREE.SphereGeometry(1.5, 22, 16);
    { const p = sg.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.1 * sin(v.x * 5) * sin(v.y * 4 + 1) * sin(v.z * 3); v.multiplyScalar(n); v.z *= 1.35; v.y *= 0.85; p.setXYZ(i, v.x, v.y, v.z); } sg.computeVertexNormals(); }
    G.add(sac, sg, sacM);
    for (let i = 0; i < 6; i++) G.add(sac, torus(1.2 - abs(i - 2.5) * 0.12, 0.04, 5, 16), shell, 0, 0, -1.2 + i * 0.5, 0, 0, 0, 1, 0.85, 1);
    G.add(body, sph(0.6, 14, 10), shell, 0, 0, 0.2, 0, 0, 0, 1, 0.8, 1.3);
    const torso = G.bone(body, 0, 0.35, -0.2);
    G.add(torso, lathe([[0.3, 0], [0.42, 0.3], [0.38, 0.75], [0.5, 1.05], [0.3, 1.3], [0, 1.38]], 12, (p) => { p.z *= 0.8; }), shell);
    for (let i = 0; i < 4; i++) G.add(torso, torus(0.38 - i * 0.02, 0.03, 5, 12), bone, 0, 0.25 + i * 0.18, 0, PI / 2);
    // 羽(4 枚)
    const wings = [];
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, w = G.bone(torso, sx * 0.25, 1.1 - (i >> 1) * 0.25, 0.25);
      const wg = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.6, 0.35), new THREE.Vector2(2.4, 0.4), new THREE.Vector2(2.8, 0), new THREE.Vector2(2.2, -0.35), new THREE.Vector2(0.5, -0.2)]));
      G.add(w, wg, wing, 0, 0, 0, PI / 2, 0, 0, sx, 1, 1);
      wings.push({ w, sx });
    }
    const head = G.bone(torso, 0, 1.35, -0.1);
    G.add(head, lathe([[0, -0.1], [0.18, -0.05], [0.24, 0.15], [0.2, 0.4], [0.1, 0.6], [0, 0.65]], 12, (p) => { p.z = p.z * 1.2 + (p.y > 0.2 ? (p.y - 0.2) * 0.9 : 0); }), shell);
    for (let i = 0; i < 7; i++) G.add(head, spike(R(0.4, 0.7), 0.05), bone, (i - 3) * 0.08, 0.4, 0.2 + abs(i - 3) * 0.05, 0.7, 0, (i - 3) * 0.22);
    for (const [x, y] of [[-0.09, 0.17], [0.09, 0.17], [-0.15, 0.1], [0.15, 0.1], [-0.05, 0.25], [0.05, 0.25]]) G.add(head, sph(0.045, 8, 6), eye, x, y, -0.2);
    const mand = [];
    for (const s of [-1, 1]) { const j2 = G.bone(head, s * 0.1, -0.02, -0.15); G.add(j2, spike(0.36, 0.05), bone, 0, 0, 0, -1.9, 0, s * 0.3); mand.push(j2); }
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const sg2 = i % 2 ? 1 : -1, hi = i < 2;
      const sh = G.bone(torso, sg2 * 0.45, hi ? 1.05 : 0.7, -0.05);
      G.add(sh, limb(1.1, 0.12, 0.09), shell);
      const el = G.bone(sh, 0, -1.1, 0);
      G.add(el, limb(1.0, 0.09, 0.06), shell);
      G.add(el, spike(1.2, 0.09), bone, 0, -1.0, 0, PI - 0.5);
      arms.push({ sh, el, sg: sg2, hi });
    }
    const legs = [];
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, k = i % 3;
      const base = G.bone(body, side * 0.5, 0, -0.3 + k * 0.6);
      base.rotation.y = side < 0 ? PI : 0;
      const up = G.bone(base, 0, 0, 0);
      G.add(up, limbX(1.4, 0.13, 0.1), shell);
      const kn = G.bone(up, 1.4, 0, 0);
      G.add(kn, limbX(1.7, 0.1, 0.04), shell);
      legs.push({ base, up, kn, side, k });
    }
    G.finish();
    m.sac = sac;
    m.j = { body, torso, head, mand, arms, legs, sac, wings };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state;
    j.body.position.y = 1.6 + 0.06 * sin(ph * 2);
    const puff = S === 'birth' || S === 'eggs' ? 1 + 0.25 * sin(min(1, st / 0.9) * PI) : 1 + 0.05 * sin(t * 2.4);
    j.sac.scale.set(puff, puff, puff);
    j.torso.rotation.set(0.15 + 0.08 * sin(t * 1.3) + (S === 'screech' || S === 'roar' || S === 'enter' ? 0.4 : 0), 0.3 * sin(t * 0.7), 0);
    j.head.rotation.set(0.1 * sin(t * 1.7) + (S === 'screech' || S === 'roar' ? 0.5 : 0), 0.4 * sin(t * 0.9), 0);
    for (let i = 0; i < 2; i++) j.mand[i].rotation.y = (i ? -1 : 1) * (0.2 + 0.25 * sin(t * (S === 'screech' ? 30 : 8)));
    const flap = S === 'screech' || S === 'roar' || S === 'acidrain' ? 1 : 0.15;
    for (const W of j.wings) W.w.rotation.set(0, W.sx * (0.4 + 0.5 * flap * sin(t * 40)), W.sx * 0.3);
    for (const A of j.arms) {
      const w = sin(t * 2 + (A.hi ? 0 : 1.5) + A.sg);
      A.sh.rotation.set(A.hi ? 0.9 + 0.3 * w : 0.4 + 0.2 * w, 0, A.sg * (A.hi ? -0.5 : -0.3));
      A.el.rotation.set(A.hi ? 1.3 : 0.9, 0, 0);
      if (S === 'scythe' && A.hi) { const a = ease(min(1, st / 0.6)), b = ease(seg(st, 0.6, 0.75)); A.sh.rotation.set(2.6 * a - 1.4 * b, 0, A.sg * (-1.2 * a + 1.6 * b)); A.el.rotation.x = 0.4; }
      if ((S === 'spit' || S === 'acidrain') && A.hi) { A.sh.rotation.x = 2.4; A.el.rotation.x = 0.4; }
    }
    if (S === 'spit') j.head.rotation.x = (st % 0.3) < 0.15 ? -0.4 : 0.3;
    for (const L of j.legs) {
      const g = ph * 1.4 + (L.k % 2) * PI + (L.side > 0 ? PI : 0);
      let lift = 0.7 + 0.25 * max(0, cos(g));
      if (S === 'impale' && L.k === 0) { const a = ease(min(1, st / 0.6)), b = ease(seg(st, 0.6, 0.7)); lift = 0.7 - 1.2 * a + 1.6 * b; }
      L.up.rotation.set(0, 0.35 * sin(g) * (L.side < 0 ? 1 : -1) + (L.k - 1) * 0.5 * (L.side < 0 ? -1 : 1), lift);
      L.kn.rotation.set(0, 0, -1.9);
    }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    e.birthT = (e.birthT || 0) + dt;
    if (S === 'walk') {
      if (e.birthT > (e.phase ? 6 : 8)) { e.birthT = 0; return begin(e, 'birth'); }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_Q); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'birth') {
      if (st > 0.9 && !e.hitDone) {
        e.hitDone = 1;
        m.root.updateMatrixWorld(true); m.sac.getWorldPosition(_v);
        const n = e.phase ? 14 : 10;
        for (let i = 0; i < n; i++) { const a = R(0, TAU); const z = B._Z.spawn('imp', _v.x + cos(a) * 3, _v.z + sin(a) * 3); if (z) { z.kx = cos(a) * 9; z.kz = sin(a) * 9; z.stun = 0.3; } }
        FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: 60, color: 0xb8d040, speed: 11, up: 7, life: 0.9, size: 0.25 });
        Gore.splat(_v.x, _v.z, 6, 0, 0, 1, 0x4a5a10, 0.8);
      }
      if (st > 1.4) done(e, 0.4, c);
      return 0;
    }
    if (S === 'spit') {
      const N = 3 + e.phase, n = Math.floor((st - 0.3) / 0.22);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
        const [x, z] = lead(c, 1.0);
        throwAt(B, e, 'acid', _v.x, _v.y, _v.z, x + R(-6, 6), z + R(-6, 6), 1.0, { r: 5.5, size: 2, dmg: 700, hero: 14, lift: 3 });
      }
      if (st > 0.4 + N * 0.22) done(e, 0.9, c);
      return 0;
    }
    if (S === 'eggs') {
      if (st > 0.8 && !e.hitDone) {
        e.hitDone = 1;
        m.root.updateMatrixWorld(true); m.sac.getWorldPosition(_v);
        for (let i = 0; i < 3 + e.phase; i++) { const a = R(0, TAU), r = R(2, 10); throwAt(B, e, 'egg', _v.x, _v.y + 2, _v.z, c.px + cos(a) * r, c.pz + sin(a) * r, 1.3 + i * 0.12, { r: 4.5, size: 2.2, spawn: 4, dmg: 500 }); }
        act(e, 'throw');
      }
      if (st > 1.4) done(e, 1.0, c);
      return 0;
    }
    if (S === 'scythe') {
      if (st > 0.4 && !e.lockFace) lock(e, c);
      if (st < 0.6) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 15, 0.9, st / 0.6);
      if (st > 0.65 && !e.hitDone) {
        e.hitDone = 1;
        cone(B, e, e.x, e.z, e.ax, e.az, 15, 0.9, { dmg: 1200, hero: 22, lift: 5, cause: 'claw', force: 30 });
        FX.slash(e.x, 3.5, e.z, e.face, 1.9, 3, 15, 0xc0ff80, 0.3, 1, 0.5, 2.5, 0.7, 0.4);
        FX.slash(e.x, 3.5, e.z, e.face, 1.9, 3, 15, 0xc0ff80, 0.3, -1, -0.5, 2.5, 0.7, 0.4);
      }
      if (st > 1.1) done(e, 0.8, c);
      return 0.3;
    }
    if (S === 'impale') {
      if (st > 0.45 && !e.lockFace) lock(e, c);
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.6) Warn.rect(e.x, e.z, fx, fz, 20, 4, st / 0.6);
      if (st > 0.62 && !e.hitDone) { e.hitDone = 1; line(B, e, e.x, e.z, e.ax, e.az, 20, 4, { dmg: 1300, hero: 22, lift: 7, cause: 'claw' }); }
      if (st > 1.1) done(e, 0.8, c);
      return 0;
    }
    if (S === 'screech') {
      if (st > 0.35 && !e.hitDone) { e.hitDone = 1; roarBlast(B, e, 18, true); for (const z of B._Z.queryCircle(e.x, e.z, 20, _near)) if (!z.boss) z.stun = max(z.stun, 1.2); _near.length = 0; }
      if (st > 1.2) done(e, 0.6, c);
      return 0;
    }
    if (S === 'acidrain') {
      if (!e.pts) { e.pts = []; for (let i = 0; i < 9; i++) { const a = R(0, TAU), r = i === 0 ? 0 : R(3, 14); e.pts.push([c.px + cos(a) * r, c.pz + sin(a) * r]); } }
      const n = Math.floor((st - 0.3) / 0.12);
      if (n >= 0 && e.n <= n && e.n < e.pts.length) {
        const p = e.pts[e.n++];
        m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
        throwAt(B, e, 'acid', _v.x, _v.y + 1, _v.z, p[0], p[1], 1.2, { r: 5, size: 2, dmg: 700, hero: 14, lift: 3 });
      }
      if (st > 1.8) { e.pts = null; done(e, 1.0, c); }
      return 0;
    }
    return c.sp;
  },
};
const _near = [];
const LIST_Q = [['spit', 8, 50, 3], ['eggs', 8, 50, 2], ['scythe', 0, 15, 3], ['impale', 0, 19, 2.5], ['screech', 0, 22, 2, 1], ['acidrain', 0, 50, 3, 2]];

// =====================================================================
// ゾンビ装甲車 デスローダー
// =====================================================================
const tank = {
  def: { name: 'ゾンビ装甲車 デスローダー', title: 'ゾンビを轢く鉄の棺', icon: '🚚', hp: 44800, speed: 8, r: 4.6, points: 3000, scale: 2.2, size: 16, h: 7, zoom: 12, tier: 2, S: 2.6, color: 0x4a4a40 },
  vehicle: true, noStand: true, enter: 'drive', fall: 'crash', fallT: 1.0, heroGap: 0.7, collR: 3,
  build(m) {
    const plate = mat(m, { map: plateTex('#7a7866', { skull: true }), color: 0xffffff, roughness: 0.7, metalness: 0.2 });
    const dark = mat(m, { color: 0x18191b, roughness: 0.4, metalness: 0.3 });
    const steel = mat(m, { color: 0xa8a8b0, roughness: 0.35, metalness: 0.5 });
    const hazard = mat(m, { map: plateTex('#2a2a24', { hazard: true, grid: 256 }), color: 0xffffff, roughness: 0.6 });
    const tireM = mat(m, { color: 0x121212, roughness: 0.95 });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const lamp = mat(m, { color: 0x302010, emissive: 0xffd080, emissiveIntensity: 3.0, glow: true });
    const skin = mat(m, { map: skinTex('#7a8a6a', { wounds: 10 }), color: 0xffffff, roughness: 0.8 });
    const G = new Rig(m);
    const body = G.bone(null, 0, 1.15, 0);
    G.add(body, box(2.6, 1.15, 5.2), plate, 0, 0, 0.3);
    G.add(body, box(2.35, 1.0, 1.9), plate, 0, 0.98, -0.9);
    G.add(body, box(2.05, 0.42, 0.06), dark, 0, 1.1, -1.86);
    G.add(body, box(1.6, 0.08, 0.04), lamp, 0, 1.1, -1.9);
    G.add(body, box(2.7, 0.12, 5.3), steel, 0, 0.6, 0.3);
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) G.add(body, spike(0.5, 0.08), steel, s * 1.32, 0.2, -1.5 + i * 1.0, 0, 0, -s * PI / 2);
    for (const s of [-1, 1]) { G.add(body, cyl(0.12, 0.14, 1.8, 8), steel, s * 0.95, 1.5, 2.0); G.add(body, sph(0.13, 8, 6), lamp, s * 0.85, 0.35, -2.1); }
    // 荷台の 檻と ゾンビ
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) G.add(body, cyl(0.04, 0.04, 1.0, 5), steel, s * 1.1, 1.05, 0.6 + i * 0.45);
    for (let i = 0; i < 3; i++) { const x = R(-0.6, 0.6); G.add(body, lathe([[0.18, 0], [0.22, 0.3], [0.18, 0.5], [0, 0.55]], 8), skin, x, 0.6, 0.8 + i * 0.6); G.add(body, sph(0.14, 8, 6), skin, x, 1.25, 0.8 + i * 0.6); }
    // 屋根の 大砲
    const turret = G.bone(body, 0, 1.55, -0.6);
    G.add(turret, cyl(0.6, 0.7, 0.4, 12), steel, 0, 0, 0);
    G.add(turret, box(0.7, 0.4, 0.9), plate, 0, 0.3, 0);
    G.add(turret, cyl(0.12, 0.15, 2.0, 10), dark, 0, 0.35, -1.2, PI / 2);
    // 鋤(すき)+ 回る のこぎり
    const plow = G.bone(body, 0, -0.35, -2.5);
    const pg = new THREE.BoxGeometry(3.1, 1.3, 0.2, 8, 1, 1); { const p = pg.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.55 * (1 - Math.abs(p.getX(i)) / 1.55)); pg.computeVertexNormals(); }
    G.add(plow, pg, hazard);
    for (let i = 0; i < 7; i++) G.add(plow, spike(0.55, 0.09), steel, -1.3 + i * 0.43, R(-0.3, 0.3), -0.6 + abs(i - 3) * 0.12, -PI / 2);
    for (let i = 0; i < 3; i++) G.add(plow, sph(0.18, 8, 6), bone, -0.8 + i * 0.8, 0.5, -0.38, 0, 0, 0, 1, 1.1, 1.2);
    for (const s of [-1, 1]) G.add(plow, sph(0.2, 10, 8), lamp, s * 0.95, 0.8, -0.2);
    const saws = [];
    for (const s of [-1, 1]) {
      const sw = G.bone(plow, s * 1.3, 0.1, -0.5);
      G.add(sw, cyl(0.65, 0.65, 0.06, 18), steel, 0, 0, 0, 0, 0, PI / 2);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; G.add(sw, spike(0.18, 0.06, 4), steel, 0, cos(a) * 0.65, sin(a) * 0.65, a, 0, 0); }
      saws.push(sw);
    }
    // 運転手(屋根の上の ゾンビ)
    const drv = G.bone(body, 0.6, 1.5, 0.3);
    G.add(drv, lathe([[0.2, 0], [0.24, 0.3], [0.2, 0.5], [0, 0.55]], 8), skin);
    G.add(drv, sph(0.16, 8, 6), skin, 0, 0.68, 0);
    for (const s of [-1, 1]) G.add(drv, limb(0.5, 0.06, 0.05), skin, s * 0.25, 0.45, 0, 1.4, 0, 0);
    const wheels = [];
    const wg = cyl(0.65, 0.65, 0.55, 16); wg.rotateZ(PI / 2);
    const hub = cyl(0.32, 0.32, 0.57, 8); hub.rotateZ(PI / 2);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const w = G.bone(body, s * 1.35, -0.55, -1.5 + i * 1.8);
      G.add(w, wg, tireM);
      G.add(w, hub, steel);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; G.add(w, box(0.58, 0.12, 0.12), tireM, 0, cos(a) * 0.62, sin(a) * 0.62, a, 0, 0); }
      wheels.push(w);
    }
    G.finish();
    m.j = { body, wheels, plow, drv, turret, saws };
  },
  anim(m, e, dt) {
    const j = m.j, sp = Math.hypot(e.vx, e.vz);
    const fw = e.vx * sin(e.face) - e.vz * cos(e.face);
    m.wRot = (m.wRot || 0) + fw * dt / (0.65 * m.S);
    for (const w of j.wheels) w.rotation.x = -m.wRot;
    j.body.position.y = 1.15 + 0.03 * sin(e.t * 40) * min(1, sp / 4) + (e.state === 'rev' ? 0.05 * sin(e.t * 60) : 0);
    j.body.rotation.x = e.state === 'charge' ? -0.05 : e.state === 'skid' ? 0.07 : 0;
    j.body.rotation.z = e.state === 'spin' ? 0.12 : 0;
    j.drv.rotation.set(0.2 * sin(e.t * 3), 0.5 * sin(e.t * 0.8), 0);
    if (e.aim !== undefined) { let da = e.aim - e.face; da = Math.atan2(sin(da), cos(da)); j.turret.rotation.y = -da; }
    for (const s of j.saws) s.rotation.x += dt * (e.phase >= 1 ? 30 : 6);
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    e.aim = Math.atan2(c.dx, -c.dz);
    const want = Math.atan2(c.mx, -c.mz);
    let da = (want - e.face) % TAU;
    if (da > PI) da -= TAU; else if (da < -PI) da += TAU;
    const fx = sin(e.face), fz = -cos(e.face);
    e.plowT = (e.plowT || 0) - dt;
    const speed = Math.hypot(e.vx, e.vz);
    if (speed > 3 && e.plowT <= 0) {
      e.plowT = 0.1;
      const k = B._Z.damageCircle(e.x + fx * 7, e.z + fz * 7, 3.5, speed > 10 ? 1500 : 500, { force: 12 + speed * 1.5, cause: 'tank', falloff: false });
      if (k > 0 && speed > 10) Engine.shake(0.2);
      if (speed > 8 && !e.ranHero && heroIn(B, e.x + fx * 6, e.z + fz * 6, 4)) { e.ranHero = 1; hitHero(B, e, e.x, e.z, 28, 9, 'tank', fx - fz * 0.8, fz + fx * 0.8); }
    }
    if (S === 'walk') {
      e.face += clamp(da, -1, 1) * dt * 1.4;
      e.ranHero = 0;
      if (e.cool <= 0) {
        const a = pick(e, c.d, LIST_K);
        if (a && (a !== 'rev' || abs(da) < 0.3)) { begin(e, a); return -1; }
      }
      const s2 = c.sp * (abs(da) > 1 ? 0.5 : 1) * (c.d < 9 ? 0.4 : 1);
      e.vx += (fx * s2 - e.vx) * 0.08; e.vz += (fz * s2 - e.vz) * 0.08;
      return -1;
    }
    if (S === 'rev') {
      e.face += clamp(da, -1, 1) * dt * 1.8;
      e.vx *= 0.9; e.vz *= 0.9;
      Warn.rect(e.x, e.z, fx, fz, 52, 8, st / 0.9);
      if (Math.random() < dt * 30) FX.smoke(e.x - fx * 7 + R(-1, 1), 4.5, e.z - fz * 7, 1, 1.2, 0x2a2a2a, -fx * 3, 3, -fz * 3, 0.7);
      if (st > 0.9) { e.state = 'charge'; e.st = 0; e.cx = fx; e.cz = fz; e.lx = e.x; e.lz = e.z; e.ranHero = 0; act(e, 'charge'); }
      return -1;
    }
    if (S === 'charge') {
      e.vx = e.cx * 26; e.vz = e.cz * 26;
      Warn.rect(e.x, e.z, e.cx, e.cz, max(2, 52 - st * 26), 8, 1);
      if (Math.random() < dt * 30) FX.burst({ x: e.x - e.cx * 5, y: 0.5, z: e.z - e.cz * 5, count: 3, color: 0x4a4038, speed: 3, up: 2, life: 0.6, size: 0.5 });
      if (World.damage && Math.random() < dt * 15) try { World.damage(e.x + e.cx * 7, e.z + e.cz * 7, 4, 800, { cause: 'explosion' }); } catch (err) {}
      const moved = Math.hypot(e.x - e.lx, e.z - e.lz); e.lx = e.x; e.lz = e.z;
      if (st > 0.25 && moved < 26 * dt * 0.3) { slam(B, e, e.x + e.cx * 7, e.z + e.cz * 7, 8, { dmg: 1500, hero: 24, lift: 8, big: true, cause: 'tank' }); e.state = 'skid'; e.st = 0; e.vx *= -0.3; e.vz *= -0.3; }
      else if (st > 2.0) { e.state = 'skid'; e.st = 0; }
      return -1;
    }
    if (S === 'skid') {
      e.vx *= 0.93; e.vz *= 0.93;
      if (Math.random() < dt * 20) FX.smoke(e.x + R(-2, 2), 0.4, e.z + R(-2, 2), 1, 0.9, 0x6a6058, 0, 1, 0, 0.5);
      if (st > 0.7) done(e, 0.8, c);
      return -1;
    }
    if (S === 'cannon') {
      e.vx *= 0.95; e.vz *= 0.95;
      const N = 3 + e.phase, n = Math.floor((st - 0.4) / 0.35);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.turret.getWorldPosition(_v);
        const [x, z] = lead(c, 1.2);
        throwAt(B, e, 'shell', _v.x, _v.y + 1, _v.z, x + R(-5, 5), z + R(-5, 5), 1.2, { r: 6.5, dmg: 1300, hero: 22, lift: 7 });
        FX.muzzle(_v.x + sin(e.aim) * 5, _v.y + 1, _v.z - cos(e.aim) * 5, sin(e.aim), -cos(e.aim), 0xffc060, 4);
        quake(B, e.x, e.z, 0.5);
      }
      if (st > 0.6 + N * 0.35) done(e, 1.0, c);
      return -1;
    }
    if (S === 'flame') {
      e.face += clamp(da, -1, 1) * dt * 0.8;
      e.vx *= 0.9; e.vz *= 0.9;
      const ox = e.x + fx * 7, oz = e.z + fz * 7;
      Warn.cone(ox, oz, fx, fz, 18, 0.45, min(1, st / 0.6));
      if (st > 0.6) {
        for (let i = 0; i < 3; i++) { const a = e.face + R(-0.35, 0.35), s = R(16, 26); FX.flame(ox, 1.4, oz, sin(a) * s, R(0, 2), -cos(a) * s, 1.4, 0.7); }
        if ((e.n += dt) > 0.15) { e.n = 0; cone(B, e, ox, oz, fx, fz, 18, 0.45, { dmg: 450, hero: 14, lift: 3, cause: 'bossfire', burn: true, force: 8 }); }
      }
      if (st > 2.4) done(e, 1.0, c);
      return -1;
    }
    if (S === 'mines') {
      if (!e.pts) { e.pts = []; for (let i = 0; i < 7; i++) { const a = R(0, TAU), r = R(3, 13); e.pts.push([c.px + cos(a) * r, c.pz + sin(a) * r]); } }
      for (let i = 0; i < e.pts.length; i++) {
        const p = e.pts[i], t0 = 1.6 + i * 0.12;
        if (st < t0) Warn.circle(p[0], p[1], 5, st / t0);
        else if (e.n <= i) { e.n = i + 1; FX.explosion(p[0], p[1], 5, 'fire'); slam(B, e, p[0], p[1], 5, { dmg: 1100, hero: 20, lift: 7, cause: 'missile' }); }
      }
      if (st < 0.8 && Math.random() < dt * 8) FX.burst({ x: e.x, y: 3, z: e.z, count: 2, color: 0x3a3a30, speed: 10, up: 8, life: 0.8, size: 0.3 });
      if (st > 2.8) { e.pts = null; done(e, 1.0, c); }
      e.vx *= 0.95; e.vz *= 0.95;
      return -1;
    }
    if (S === 'spin') {
      e.face += dt * 5.5;
      const r = 11;
      Warn.circle(e.x, e.z, r, 1);
      e.vx += (c.dx * 7 - e.vx) * 0.05; e.vz += (c.dz * 7 - e.vz) * 0.05;
      if (Math.random() < dt * 30) FX.smoke(e.x + R(-4, 4), 0.4, e.z + R(-4, 4), 1.2, 1, 0x6a6058, R(-4, 4), 1, R(-4, 4), 0.5);
      if ((e.n += dt) > 0.2) { e.n = 0; cone(B, e, e.x, e.z, 1, 0, r, PI, { dmg: 700, hero: 20, lift: 6, cause: 'tank', force: 30 }); }
      if (st > 3) done(e, 1.2, c);
      return -1;
    }
    return -1;
  },
};
const LIST_K = [['rev', 12, 70, 4], ['cannon', 10, 70, 3], ['flame', 0, 18, 3], ['mines', 0, 40, 2, 1], ['spin', 0, 18, 3, 2]];

export const EXTRA = { gorilla, queen, tank };
