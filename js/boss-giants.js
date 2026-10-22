// キャラ係: 新しいボス(巨人の なかま)。
//   ゾンビ巨神(22m)… 足ふみ・両こぶし大たたき・大なぎはらい・バス投げ / 怒り: 広がる衝撃波(跳べば よけられる)・目からの光線
//   鬼 オニ(14m)… 金棒の ふりおろし(長い帯 + 先で大爆発)・ぶんまわし・大ジャンプ・岩投げ / 怒り: 金棒の竜巻・火を吹く
//   首なし騎士(12m・巨大な骨の馬)… 槍の突撃(とても長い帯)・前足ふみつけ・燃えるドクロ投げ・槍の なぎはらい / 怒り: 走ったあとに 緑の火・ドクロ 3 連
//   合体ゾンビ レギオン(15m)… 何百ものゾンビが くっついた巨体。撃つと ゾンビが はがれて落ちる(だんだん小さくなる)
//                               のしかかり・腕の群れ・肉のかたまり投げ(ゾンビがわく)/ 怒り: ゾンビの波・体が はじける
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, BONE, lathe, sstep, skinTex, plateTex, stripeTex, bodiesTex, canvasTex, mat, limb, limbX, limbZ, spike, horn, blob, box, sph, cyl, torus, tube, ribs, Rig, walkPose, roarPose, ease, seg } from './boss-kit.js';
import { act, slam, line, cone, step, hitHero, heroIn, throwAt, quake, pick, begin, done, lock, lead, fwd, roarBlast, beamTick, ringWave } from './boss-attacks.js';

const _v = new THREE.Vector3(), _near = [];

// =====================================================================
// ゾンビ巨神(22m)
// =====================================================================
const titan = {
  def: { name: 'ゾンビ巨神', title: '天を衝く屍の神', icon: '🗿', hp: 46000, speed: 3.6, r: 4.6, points: 5000, scale: 8.0, size: 22, tier: 3, S: 4.2, color: 0x6a7068 },
  stride: 0.5, feet: { w: 0.42, f: 0.1, s: 1.6 }, turn: 1.6, fallT: 1.8, fallSink: 0,
  build(m) {
    const skin = mat(m, { map: skinTex('#7a8478', { stitches: 6, wounds: 22, rep: 2, vein: 'rgba(255,90,20,0.55)', veins: 60 }), color: 0xffffff, roughness: 0.8 });
    const dark = mat(m, { map: skinTex('#3a3430', { wounds: 6, rep: 2 }), color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const stone = mat(m, { map: plateTex('#6a665e', { grid: 128, blood: 4 }), color: 0xffffff, roughness: 0.95 });
    const lava = mat(m, { color: 0x6a1004, emissive: 0xff5010, emissiveIntensity: 2.6, glow: true, roughness: 0.4 });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 2.3, 0);
    G.add(hips, lathe([[0, -0.45], [0.5, -0.4], [0.62, -0.1], [0.58, 0.2], [0, 0.25]], 14, (p) => { p.x *= 1.3; p.z *= 0.85; }), skin);
    // 腰の ぼろ布 と 鎖に つるされた 死体
    G.add(hips, lathe([[1.0, -1.25], [0.82, -0.6], [0.66, -0.1], [0.6, 0.1]], 18, (p) => { if (p.y < -0.8) p.y += sin(Math.atan2(p.x, p.z) * 9) * 0.2; p.z *= 0.85; }), dark);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; G.add(hips, lathe([[0.1, 0], [0.12, 0.3], [0.09, 0.5], [0, 0.55]], 6), skin, sin(a) * 0.95, -1.1, cos(a) * 0.85, PI, 0, 0); }
    const torso = G.bone(hips, 0, 0.15, 0);
    G.add(torso, lathe([[0.55, 0], [0.62, 0.35], [0.78, 0.85], [0.84, 1.3], [0.62, 1.62], [0.3, 1.75], [0, 1.78]], 18, (p) => {
      p.x *= 1 + 0.7 * sstep(0.5, 1.4, p.y); p.z *= 0.8; if (p.z > 0 && p.y > 0.7) p.z += 0.4 * sstep(0.7, 1.5, p.y);     // 猫背
      if (p.y > 1.35) p.y -= 0.3 * min(1, (p.x / 1.1) ** 2);
    }), skin);
    // 胸の裂け目: 溶岩のように光る心臓 + あばら
    G.add(torso, blob(0.42, 0.2, 2, 14, 10), lava, 0, 1.1, -0.38);
    ribs(G, torso, bone, 5, 0.75, 0.14, 0.55, 0.05, -0.1, PI * 0.95, 1.45);
    // 背中: 石の柱が 何本も 刺さっている
    for (let i = 0; i < 5; i++) G.add(torso, box(0.28, R(1.2, 2.2), 0.28), stone, R(-0.6, 0.6), R(1.0, 1.6), 0.7, R(0.3, 0.8), R(-0.4, 0.4), R(-0.5, 0.5));
    for (let i = 0; i < 6; i++) G.add(torso, spike(R(0.5, 1.0), 0.1), bone, R(-0.7, 0.7), R(0.6, 1.5), 0.6, R(0.6, 1.2), 0, R(-0.4, 0.4));
    for (const sx of [-1, 1]) G.add(torso, tube([[sx * 0.2, 1.5, -0.45], [sx * 0.55, 1.0, -0.62], [sx * 0.45, 0.4, -0.55]], 0.05, 10, 6), lava);
    const head = G.bone(torso, 0, 1.62, -0.42);
    G.add(head, lathe([[0, -0.12], [0.18, -0.08], [0.24, 0.1], [0.26, 0.3], [0.2, 0.48], [0, 0.54]], 14, (p) => { if (p.z < 0 && p.y < 0.2) p.z *= 1.3; }), skin);
    G.add(head, box(0.42, 0.08, 0.14), skin, 0, 0.34, -0.2);
    for (const sx of [-1, 1]) G.add(head, sph(0.06, 8, 6), lava, sx * 0.09, 0.28, -0.22);
    // こわれた 石の冠
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; G.add(head, box(0.08, R(0.25, 0.5), 0.08), stone, sin(a) * 0.24, 0.55, cos(a) * 0.22, R(-0.3, 0.3), 0, R(-0.3, 0.3)); }
    const jaw = G.bone(head, 0, 0.06, -0.08);
    G.add(jaw, box(0.34, 0.1, 0.3), skin, 0, -0.08, -0.12);
    for (let i = 0; i < 8; i++) G.add(jaw, spike(0.09, 0.02, 4), bone, -0.14 + i * 0.04, -0.03, -0.26);
    for (let i = 0; i < 8; i++) G.add(head, spike(0.1, 0.02, 4), bone, -0.14 + i * 0.04, 0.05, -0.25, PI);
    const arms = {}, fores = {};
    for (const sx of [-1, 1]) {
      const a = G.bone(torso, sx * 1.05, 1.3, 0);
      G.add(a, limb(1.25, 0.34, 0.28, 1.2), skin);
      G.add(a, sph(0.42, 12, 8, 0, TAU, 0, PI * 0.5), stone, 0, 0.05, 0, 0, 0, -sx * 0.3, 1.1, 0.6, 1.1);
      const f = G.bone(a, 0, -1.25, 0);
      G.add(f, limb(1.25, 0.3, 0.26, 1.25), skin);
      G.add(f, tube([[0.2, -0.1, -0.2], [0.26, -0.6, -0.25], [0.15, -1.1, -0.2]], 0.035, 8, 5), lava);
      G.add(f, blob(0.38, 0.15, sx + 3, 12, 10), skin, 0, -1.4, 0, 0, 0, 0, 1, 1.1, 1.2);
      for (let k = 0; k < 4; k++) G.add(f, spike(0.35, 0.05), bone, (k - 1.5) * 0.14, -1.7, -0.15, PI + 0.3);
      for (let k = 0; k < 6; k++) G.add(f, torus(0.1, 0.03, 4, 8), stone, sx * 0.3, -0.2 - k * 0.15, 0, 0, k % 2 ? PI / 2 : 0, 0);     // 鎖
      arms[sx] = a; fores[sx] = f;
    }
    const legs = {}, knees = {};
    for (const sx of [-1, 1]) {
      const l = G.bone(hips, sx * 0.4, -0.2, 0);
      G.add(l, limb(1.15, 0.42, 0.33), skin);
      const k = G.bone(l, 0, -1.15, 0);
      G.add(k, limb(1.0, 0.33, 0.27), skin);
      G.add(k, blob(0.4, 0.12, sx, 12, 8), skin, 0, -1.05, -0.2, 0, 0, 0, 1.1, 0.5, 1.5);
      for (let i = 0; i < 3; i++) G.add(k, spike(0.25, 0.06), bone, (i - 1) * 0.15, -1.1, -0.55, -PI / 2);
      legs[sx] = l; knees[sx] = k;
    }
    G.finish();
    m.j = { hips, torso, head, jaw, armL: arms[-1], armR: arms[1], foreL: fores[-1], foreR: fores[1], legL: legs[-1], legR: legs[1], kneeL: knees[-1], kneeR: knees[1] };
    m.bus = null;
  },
  anim(m, e, dt) {
    const j = m.j, st = e.st, S = e.state;
    walkPose(j, e, 2.3, min(1, e.spd / 2), { lean: -0.32, headX: 0.25, bob: 1.5 });
    if (S === 'enter') roarPose(j, 0.7, 0.04);
    else if (S === 'roar') roarPose(j, min(1, st / 0.3) * (st < 1.3 ? 1 : max(0, 1 - (st - 1.3) * 5)), 0.05);
    else if (S === 'smash' || S === 'wave') {
      const T = S === 'wave' ? 1.0 : 1.1;
      if (st < T) { const a = ease(min(1, st / (T * 0.85))); j.armL.rotation.set(0.2 + 2.9 * a, 0, -0.3); j.armR.rotation.set(0.2 + 2.9 * a, 0, 0.3); j.foreL.rotation.x = j.foreR.rotation.x = 0.5 * a; j.torso.rotation.x = -0.3 + 0.55 * a; j.head.rotation.x = 0.5 * a; j.jaw.rotation.x = -0.6 * a; }
      else { const a = ease(min(1, (st - T) / 0.14)); j.armL.rotation.set(3.1 - 2.7 * a, 0, -0.3); j.armR.rotation.set(3.1 - 2.7 * a, 0, 0.3); j.torso.rotation.x = 0.25 - 1.1 * a; j.hips.position.y = 2.3 - 0.6 * a; j.kneeL.rotation.x = j.kneeR.rotation.x = -0.9 * a; j.legL.rotation.x = j.legR.rotation.x = 0.5 * a; }
    } else if (S === 'stomp') {
      const up = ease(min(1, st / 0.9)), dn = ease(seg(st, 0.95, 1.08));
      const L = e.footL ? j.legL : j.legR, K = e.footL ? j.kneeL : j.kneeR;
      L.rotation.x = 1.3 * up - 1.1 * dn; K.rotation.x = -1.5 * up + 1.3 * dn;
      j.torso.rotation.x = -0.1 - 0.2 * dn; j.armL.rotation.z = -0.5; j.armR.rotation.z = 0.5;
    } else if (S === 'sweep') {
      const a = ease(min(1, st / 0.9)), b = ease(seg(st, 0.9, 1.2));
      j.armR.rotation.set(1.4, 0, 0.3 + 1.0 * a - 2.2 * b); j.foreR.rotation.x = 0.2;
      j.torso.rotation.y = 0.9 * a - 1.8 * b; j.torso.rotation.x = -0.4;
    } else if (S === 'bus') {
      if (st < 0.7) { const a = ease(st / 0.7); j.torso.rotation.x = -0.3 - 0.8 * a; j.armR.rotation.set(0.3 + 0.8 * a, 0, 0.2); j.hips.position.y = 2.3 - 0.4 * a; }
      else if (st < 1.4) { const a = ease((st - 0.7) / 0.7); j.torso.rotation.x = -1.1 + 1.4 * a; j.armR.rotation.set(1.1 + 2.0 * a, 0, 0.2); j.foreR.rotation.x = 0.3 + 0.5 * a; }
      else { const a = ease(min(1, (st - 1.4) / 0.18)); j.armR.rotation.set(3.1 - 2.4 * a, 0, 0.2); j.torso.rotation.x = 0.3 - 0.8 * a; }
    } else if (S === 'beam') {
      j.torso.rotation.x = -0.15; j.head.rotation.x = -0.3; j.jaw.rotation.x = -0.5; j.armL.rotation.z = -0.8; j.armR.rotation.z = 0.8;
    } else if (S === 'dead') { j.armL.rotation.set(2 + sin(e.t * 7) * 0.3, 0, -1); j.armR.rotation.set(1.6, 0, 1); j.head.rotation.x = 0.8; j.jaw.rotation.x = -0.8; }
    if (m.bus) m.bus.visible = S === 'bus' && st > 0.7 && st < 1.55;
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_TI); if (a) { begin(e, a); if (a === 'stomp') { e.footL = !e.footL; const [x, z] = lead(c, 1.0); e.tx = x; e.tz = z; } return 0; } }
      return c.sp;
    }
    if (S === 'stomp') {
      if (st < 0.6) { const [x, z] = lead(c, 0.5); e.tx = x; e.tz = z; }
      Warn.circle(e.tx, e.tz, 9, st / 0.98);
      // 足を 主人公の上へ 運ぶ(体ごと 少し進む)
      if (st < 0.9) { const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz) || 1; if (d > 6) { e.vx = dx / d * 6; e.vz = dz / d * 6; } }
      if (st > 1.0 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 9, { dmg: 2000, hero: 26, lift: 9, big: true, cause: 'stomp', shake: 1.5 }); }
      if (st > 1.6) done(e, 0.8, c);
      return st < 0.9 ? -1 : 0;
    }
    if (S === 'smash') {
      if (st < 0.8) { const [x, z] = fwd(e, 11); e.tx = x; e.tz = z; } else if (!e.lockFace) lock(e, c);
      if (st < 1.1) Warn.circle(e.tx, e.tz, 13, st / 1.1);
      if (st > 1.2 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 13, { dmg: 2500, hero: 28, lift: 10, big: true, cause: 'slam', shake: 1.8 }); FX.explosion(e.tx, e.tz, 9, 'meteor'); }
      if (st > 2.0) done(e, 1.0, c);
      return 0;
    }
    if (S === 'sweep') {
      if (st > 0.7 && !e.lockFace) lock(e, c);
      if (st < 1.0) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 23, 1.4, st / 1.0);
      if (st > 1.05 && !e.hitDone) { e.hitDone = 1; cone(B, e, e.x, e.z, e.ax, e.az, 23, 1.4, { dmg: 1600, hero: 26, lift: 6, cause: 'sweep', force: 34 }); FX.slash(e.x, 6, e.z, e.face, 2.9, 5, 23, 0xffb080, 0.4, -1, 0.15, 3, 0.85, 0.7); quake(B, e.x, e.z, 1); }
      if (st > 1.7) done(e, 0.9, c);
      return 0;
    }
    if (S === 'bus') {
      if (st > 0.65 && !e.n) { e.n = 1; const [x, z] = fwd(e, 5, 3); FX.debris(x, 0.5, z, 20, 10, 0x4a4038, 0.5, 2.5); FX.smoke(x, 0.5, z, 3, 1.5, 0x6f6455, 0, 2, 0, 0.6); quake(B, x, z, 0.8); }
      const [tx, tz] = lead(c, 1.5);
      if (st > 0.7 && st < 1.55) Warn.circle(tx, tz, 12, (st - 0.7) / 2.3);
      if (st > 1.55 && e.n === 1) {
        e.n = 2;
        m.root.updateMatrixWorld(true); m.j.foreR.getWorldPosition(_v);
        throwAt(B, e, 'bus', _v.x, _v.y, _v.z, tx, tz, 1.5, { r: 12, size: 1.4, dmg: 2600, hero: 28, lift: 10 });
        act(e, 'throw');
      }
      if (st > 2.1) done(e, 1.0, c);
      return 0;
    }
    if (S === 'wave') {
      if (st < 1.0) Warn.circle(e.x, e.z, 32, st / 1.0, 0xff8020);
      if (st > 1.12 && !e.hitDone) {
        e.hitDone = 1;
        slam(B, e, e.x, e.z, 8, { dmg: 2000, hero: 26, lift: 9, big: true, cause: 'slam', shake: 1.8 });
        for (let i = 0; i < 1 + e.phase; i++) setTimeout0(B, i * 0.45, () => ringWave(B, e, e.x, e.z, { r0: 6, speed: 20, max: 34, w: 2.4, dmg: 900, hero: 22 }));
      }
      if (st > 2.2) done(e, 1.0, c);
      return 0;
    }
    if (S === 'beam') {
      if (st < 0.05) { const px = -c.dz, pz = c.dx; e.bx0 = c.px - px * 16 + c.dx * 2; e.bz0 = c.pz - pz * 16 + c.dz * 2; e.bx1 = c.px + px * 16 + c.dx * 2; e.bz1 = c.pz + pz * 16 + c.dz * 2; lock(e, c); }
      const T0 = 0.9, T1 = 2.4;
      Warn.rect(e.bx0, e.bz0, e.bx1 - e.bx0, e.bz1 - e.bz0, Math.hypot(e.bx1 - e.bx0, e.bz1 - e.bz0), 5, min(1, st / T0));
      m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
      if (st < T0) { FX.glow(_v.x, _v.y, _v.z, 3 + st * 4, 0xff3010, 4); }
      else if (st < T0 + T1) {
        const k = (st - T0) / T1, x = e.bx0 + (e.bx1 - e.bx0) * k, z = e.bz0 + (e.bz1 - e.bz0) * k;
        beamTick(B, e, _v.x, _v.y, _v.z, x, z, 1.6, 2500, 0xff3010, 'beam', dt);
        if (Math.random() < dt * 12) FX.explosion(x, z, 3, 'meteor');
      }
      if (st > T0 + T1 + 0.4) done(e, 1.2, c);
      return 0;
    }
    return c.sp;
  },
};
const LIST_TI = [['stomp', 0, 18, 3], ['smash', 0, 22, 3], ['sweep', 0, 22, 3], ['bus', 16, 80, 3], ['wave', 0, 30, 3, 1], ['beam', 8, 50, 3, 2]];

// 少しあとで 呼ぶ(ボスの中だけで使う。決まった数の入れ物)
const _later = [];
function setTimeout0(B, sec, fn) { _later.push({ t: sec, fn }); }
export function stepLater(dt) { for (let i = _later.length - 1; i >= 0; i--) { const l = _later[i]; if ((l.t -= dt) <= 0) { _later.splice(i, 1); l.fn(); } } }

// =====================================================================
// 鬼 オニ(14m)
// =====================================================================
const oni = {
  def: { name: '鬼 オニ', title: '金棒の大鬼', icon: '👺', hp: 34000, speed: 4.4, r: 3.4, points: 4000, scale: 5.6, size: 14, tier: 2, S: 3.3, color: 0xa02a1a },
  stride: 0.75, feet: { w: 0.3, f: 0.1, s: 1.1 },
  build(m) {
    const skin = mat(m, { map: skinTex('#b83a28', { wounds: 8, veins: 30, vein: 'rgba(80,0,0,0.5)', drips: 6 }), color: 0xffffff, roughness: 0.6 });
    const tiger = mat(m, { map: stripeTex('tiger', '#d8a020', '#1a1410', 16, 46), color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const hair = mat(m, { color: 0xe8e4d8, roughness: 0.95, emissive: 0x181410 });
    const horn2 = mat(m, { color: 0xe8dcc0, roughness: 0.4 });
    const iron = mat(m, { map: plateTex('#3a3a3c', { grid: 256, blood: 8 }), color: 0xffffff, metalness: 0.7, roughness: 0.4 });
    const gold = mat(m, { color: 0xd8a830, metalness: 0.8, roughness: 0.3 });
    const eye = mat(m, { color: 0x806010, emissive: 0xffd040, emissiveIntensity: 2.8, glow: true });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 1.9, 0);
    G.add(hips, lathe([[0, -0.38], [0.45, -0.32], [0.55, -0.05], [0.5, 0.2], [0, 0.25]], 14, (p) => { p.x *= 1.22; p.z *= 0.85; }), skin);
    G.add(hips, lathe([[0.75, -0.7], [0.66, -0.3], [0.58, 0.0], [0.56, 0.12]], 18, (p) => { if (p.y < -0.5) p.y += sin(Math.atan2(p.x, p.z) * 6) * 0.1; p.z *= 0.9; }), tiger);
    G.add(hips, torus(0.56, 0.06, 6, 18), tiger, 0, 0.1, 0, PI / 2);
    const torso = G.bone(hips, 0, 0.12, 0);
    G.add(torso, lathe([[0.48, 0], [0.55, 0.3], [0.7, 0.75], [0.74, 1.1], [0.56, 1.36], [0.26, 1.48], [0, 1.5]], 18, (p) => {
      p.x *= 1 + 0.6 * sstep(0.4, 1.15, p.y); p.z *= 0.78;
      if (p.z < 0 && p.y > 0.75 && p.y < 1.2) p.z -= 0.08 * sin((p.y - 0.75) / 0.45 * PI) * (0.3 + abs(p.x));    // 胸の筋肉
      if (p.z < 0 && p.y < 0.7 && p.y > 0.15) p.z -= 0.04 * abs(sin(p.y * 22));                                   // 腹筋
      if (p.y > 1.15) p.y -= 0.25 * min(1, (p.x / 0.95) ** 2);
    }), skin);
    // 大きな数珠
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; G.add(torso, sph(0.11, 8, 6), gold, sin(a) * 0.62, 1.15 - (cos(a) < 0 ? 0.35 * -cos(a) : 0), cos(a) * 0.45 - 0.05); }
    const head = G.bone(torso, 0, 1.45, -0.1);
    G.add(head, lathe([[0, -0.1], [0.17, -0.06], [0.22, 0.1], [0.23, 0.28], [0.18, 0.44], [0, 0.5]], 14, (p) => { if (p.z < 0 && p.y < 0.2) p.z *= 1.25; p.x *= 1.05; }), skin);
    G.add(head, box(0.4, 0.09, 0.14), skin, 0, 0.32, -0.18);
    for (const sx of [-1, 1]) G.add(head, sph(0.05, 8, 6), eye, sx * 0.08, 0.26, -0.2);
    // 角 2 本
    for (const sx of [-1, 1]) G.add(head, horn(0.5, 0.07, -0.3), horn2, sx * 0.13, 0.42, -0.05, -0.2, 0, -sx * 0.35);
    // ぼうぼうの 白い髪
    for (let i = 0; i < 22; i++) { const a = R(-1.9, 1.9); G.add(head, spike(R(0.4, 0.75), 0.07, 5), hair, sin(a) * 0.16, R(0.25, 0.45), cos(a) * 0.18 + 0.08, R(1.2, 2.0), 0, -sin(a) * 0.7); }
    const jaw = G.bone(head, 0, 0.06, -0.06);
    G.add(jaw, box(0.3, 0.09, 0.26), skin, 0, -0.07, -0.11);
    for (const sx of [-1, 1]) G.add(jaw, spike(0.16, 0.035), horn2, sx * 0.1, -0.02, -0.22);
    const arms = {}, fores = {};
    for (const sx of [-1, 1]) {
      const a = G.bone(torso, sx * 0.88, 1.12, 0);
      G.add(a, limb(0.95, 0.3, 0.25, 1.25), skin);
      const f = G.bone(a, 0, -0.95, 0);
      G.add(f, limb(0.9, 0.27, 0.22, 1.25), skin);
      G.add(f, sph(0.27, 10, 8), skin, 0, -1.0, 0);
      G.add(f, cyl(0.3, 0.29, 0.25, 12), gold, 0, -0.65, 0);
      arms[sx] = a; fores[sx] = f;
    }
    // 金棒(長さ 3.4m、とげ だらけ)
    const club = G.bone(fores[1], 0, -1.0, 0);
    G.add(club, cyl(0.07, 0.07, 0.6, 8), iron, 0, 0, 0, PI / 2);
    G.add(club, cyl(0.2, 0.09, 3.0, 12), iron, 0, 0, -1.7, PI / 2);
    for (let i = 0; i < 6; i++) for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + i * 0.5; G.add(club, spike(0.16, 0.04, 4), iron, cos(a) * (0.11 + i * 0.018), sin(a) * (0.11 + i * 0.018), -0.7 - i * 0.45, 0, 0, 0); }
    const legs = {}, knees = {};
    for (const sx of [-1, 1]) {
      const l = G.bone(hips, sx * 0.32, -0.15, 0);
      G.add(l, limb(0.9, 0.33, 0.26), skin);
      const k = G.bone(l, 0, -0.9, 0);
      G.add(k, limb(0.82, 0.26, 0.2), skin);
      G.add(k, box(0.34, 0.16, 0.6), skin, 0, -0.88, -0.12);
      G.add(k, cyl(0.24, 0.22, 0.18, 10), gold, 0, -0.65, 0);
      legs[sx] = l; knees[sx] = k;
    }
    G.finish();
    // 金棒は 前(-z)へ のびている。club.rotation で 振る
    m.j = { hips, torso, head, jaw, armL: arms[-1], armR: arms[1], foreL: fores[-1], foreR: fores[1], legL: legs[-1], legR: legs[1], kneeL: knees[-1], kneeR: knees[1], club };
  },
  anim(m, e, dt) {
    const j = m.j, st = e.st, S = e.state;
    walkPose(j, e, 1.9, min(1, e.spd / 2.3), { lean: -0.18 });
    j.club.rotation.set(-1.2, 0, 0);                  // ふだんは 金棒を 下へ
    j.armR.rotation.x += 0.2;
    if (S === 'enter' || S === 'roar') { roarPose(j, S === 'enter' ? 0.7 : min(1, st / 0.3), 0.05); j.club.rotation.set(-0.4, 0, 0); j.armR.rotation.set(2.6, 0, 0.5); }
    else if (S === 'club' || S === 'jump') {
      const T = S === 'jump' ? 0.5 : 0.85;
      if (S === 'jump' && e.y > 0.3) { j.armR.rotation.set(3.0, 0, 0.3); j.club.rotation.set(0.6, 0, 0); j.armL.rotation.set(2.6, 0, -0.4); j.legL.rotation.x = 0.8; j.kneeL.rotation.x = -1.4; }
      else if (st < T && S === 'club') { const a = ease(st / T); j.armR.rotation.set(0.3 + 2.9 * a, 0, 0.2); j.armL.rotation.set(0.3 + 2.6 * a, 0, -0.2); j.foreR.rotation.x = 0.4; j.club.rotation.set(-1.2 + 1.9 * a, 0, 0); j.torso.rotation.x = -0.18 + 0.4 * a; j.head.rotation.x = 0.3 * a; }
      else { const a = ease(min(1, (st - T) / 0.13)); j.armR.rotation.set(3.2 - 2.0 * a, 0, 0.2); j.armL.rotation.set(2.9 - 1.9 * a, 0, -0.2); j.club.rotation.set(0.7 - 0.7 * a, 0, 0); j.torso.rotation.x = 0.22 - 0.85 * a; j.hips.position.y = 1.9 - 0.35 * a; j.kneeL.rotation.x = j.kneeR.rotation.x = -0.7 * a; j.jaw.rotation.x = -0.6; }
    } else if (S === 'swing') {
      const a = ease(min(1, st / 0.7)), b = ease(seg(st, 0.7, 1.0));
      j.armR.rotation.set(1.5, 0, 0.3 + 1.2 * a - 2.6 * b); j.club.rotation.set(-0.1, 0, 0); j.torso.rotation.y = 1.0 * a - 2.2 * b; j.armL.rotation.z = -1.2;
    } else if (S === 'boulder') {
      if (st < 0.55) { const a = ease(st / 0.55); j.torso.rotation.x = -0.2 - 0.8 * a; j.armL.rotation.set(0.3 + 0.8 * a, 0, -0.1); j.hips.position.y = 1.9 - 0.3 * a; }
      else if (st < 1.05) { const a = ease((st - 0.55) / 0.5); j.torso.rotation.x = -1.0 + 1.3 * a; j.armL.rotation.set(1.1 + 1.9 * a, 0, -0.2); j.foreL.rotation.x = 0.3 + 0.6 * a; }
      else { const a = ease(min(1, (st - 1.05) / 0.15)); j.armL.rotation.set(3.0 - 2.2 * a, 0, -0.2); j.torso.rotation.x = 0.3 - 0.7 * a; j.torso.rotation.y = 0.4 * a; }
    } else if (S === 'spin') {
      j.armR.rotation.set(1.55, 0, 1.45); j.armL.rotation.set(1.5, 0, -1.4); j.club.rotation.set(0, 0, 0);
    } else if (S === 'fire') { j.head.rotation.x = st < 0.6 ? 0.6 * ease(st / 0.6) : -0.25; j.jaw.rotation.x = -0.8; j.torso.rotation.x = st < 0.6 ? 0.3 : -0.25; }
    else if (S === 'dead') { j.armR.rotation.set(1.8, 0, 1); j.armL.rotation.set(1.4, 0, -1); j.head.rotation.x = 0.7; j.jaw.rotation.x = -0.8; }
    m.tilt.rotation.y = S === 'spin' ? (e.spinA || 0) : 0;
    if (m.rock) m.rock.visible = S === 'boulder' && st > 0.5 && st < 1.1;
    // 怒ると 髪が 燃える
    if (e.phase > 0 && Math.random() < dt * 20 && !m.dead) { m.root.updateMatrixWorld(true); j.head.getWorldPosition(_v); FX.flame(_v.x + R(-1, 1), _v.y + 1.5, _v.z + R(-1, 1), 0, 3, 0, 1.6, 0.6); }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (!m.rock) { m.rock = new THREE.Mesh(blob(1, 0.28, 5, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95, flatShading: true })); m.rock.scale.setScalar(0.75); m.rock.position.set(0, -1.3, 0); m.rock.visible = false; m.rock.castShadow = true; m.j.foreL.add(m.rock); }
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_O); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'club') {
      if (st > 0.6 && !e.lockFace) lock(e, c);
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.85) { Warn.rect(e.x + fx * 2, e.z + fz * 2, fx, fz, 15, 4, st / 0.85); const [x, z] = fwd(e, 15); Warn.circle(x, z, 7, st / 0.85); }
      if (st > 0.95 && !e.hitDone) {
        e.hitDone = 1;
        line(B, e, e.x + e.ax * 2, e.z + e.az * 2, e.ax, e.az, 15, 4, { dmg: 1600, hero: 24, lift: 8, cause: 'club' });
        const [x, z] = fwd(e, 15);
        slam(B, e, x, z, 7, { dmg: 1800, hero: 26, lift: 9, big: true, cause: 'club' });
      }
      if (st > 1.6) done(e, 0.8, c);
      return 0;
    }
    if (S === 'swing') {
      if (st > 0.5 && !e.lockFace) lock(e, c);
      if (st < 0.7) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 17, 1.9, st / 0.7);
      if (st > 0.82 && !e.hitDone) { e.hitDone = 1; cone(B, e, e.x, e.z, e.ax, e.az, 17, 1.9, { dmg: 1400, hero: 26, lift: 6, cause: 'club', force: 34 }); FX.slash(e.x, 3.5, e.z, e.face, 3.8, 4, 17, 0xffc080, 0.35, -1, 0.1, 3, 0.85, 0.6); quake(B, e.x, e.z, 0.9); }
      if (st > 1.4) done(e, 0.8, c);
      return 0.2;
    }
    if (S === 'jump') {
      if (st < 0.5) { const [x, z] = lead(c, 1.0); e.tx = x; e.tz = z; Warn.circle(x, z, 11, st / 1.6); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 1.1; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 17; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 11, st / 1.6);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 31 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.7 && e.y <= 0) { e.hitDone = 1; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 11, { dmg: 2000, hero: 27, lift: 10, big: true, cause: 'club' }); }
        return -1;
      }
      if (st > 2.2) done(e, 0.9, c);
      return 0;
    }
    if (S === 'boulder') {
      if (st > 0.5 && !e.n) { e.n = 1; const [x, z] = fwd(e, 3, -1.5); FX.debris(x, 0.5, z, 14, 9, 0x5a5048, 0.5, 2); }
      const [tx, tz] = lead(c, 1.3);
      if (st > 0.5 && st < 1.1) Warn.circle(tx, tz, 8, (st - 0.5) / 1.9);
      if (st > 1.1 && e.n === 1) {
        e.n = 2; m.root.updateMatrixWorld(true); m.rock.getWorldPosition(_v);
        throwAt(B, e, 'rock', _v.x, _v.y, _v.z, tx, tz, 1.3, { r: 8, size: 2.5, dmg: 1600, hero: 24 }); act(e, 'throw');
      }
      if (st > 1.6) done(e, 1.0, c);
      return 0;
    }
    if (S === 'spin') {
      e.spinA = (e.spinA || 0) + dt * 12;
      Warn.circle(e.x, e.z, 13, 1);
      if (Math.random() < dt * 22) FX.slash(e.x, 3.5, e.z, e.spinA, 2.2, 4, 13, 0xffd0a0, 0.18, 1, 0.1, 2, 0.6, 0.4);
      if ((e.n += dt) > 0.2) { e.n = 0; cone(B, e, e.x, e.z, 1, 0, 13, PI, { dmg: 700, hero: 22, lift: 6, cause: 'club', force: 30 }); quake(B, e.x, e.z, 0.4); }
      if (st > 3) { e.spinA = 0; done(e, 1.2, c); }
      return c.sp * 1.3;
    }
    if (S === 'fire') {
      if (st < 0.6) { Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 24, 0.5, st / 0.6); return 0; }
      if (!e.lockFace) lock(e, c);
      // 首を ふりながら 火を吹く
      const sw = sin((st - 0.6) * 2.2) * 0.45, a0 = Math.atan2(e.ax, -e.az) + sw, dx = sin(a0), dz = -cos(a0);
      e.face = a0;
      Warn.cone(e.x, e.z, dx, dz, 24, 0.4, 1);
      m.root.updateMatrixWorld(true); m.j.head.getWorldPosition(_v);
      for (let i = 0; i < 4; i++) { const a = a0 + R(-0.3, 0.3), s = R(20, 32); FX.flame(_v.x + dx * 2, _v.y, _v.z + dz * 2, sin(a) * s, -_v.y * 1.2 + R(-2, 2), -cos(a) * s, 2.0, 0.8); }
      if ((e.n += dt) > 0.15) { e.n = 0; cone(B, e, e.x, e.z, dx, dz, 24, 0.4, { dmg: 600, hero: 16, lift: 3, cause: 'bossfire', burn: true, force: 10 }); }
      if (st > 2.8) done(e, 1.2, c);
      return 0;
    }
    return c.sp;
  },
};
const LIST_O = [['club', 0, 20, 3], ['swing', 0, 16, 3], ['jump', 14, 60, 3], ['boulder', 14, 70, 3], ['spin', 0, 22, 3, 1], ['fire', 4, 24, 3, 2]];

// =====================================================================
// 首なし騎士(巨大な 骨の馬に のる)
// =====================================================================
const knight = {
  def: { name: '首なし騎士', title: '地獄の騎馬', icon: '🐎', hp: 32000, speed: 9, r: 3.4, points: 4000, scale: 4.6, size: 12, tier: 2, S: 3.0, color: 0x2a2a30 },
  stride: 0.45, feet: { w: 0.35, f: -0.5, s: 0.7 }, turn: 3, noStand: true, enter: 'rise',
  build(m) {
    const horse = mat(m, { map: skinTex('#3a3634', { wounds: 14, rep: 2, veins: 20 }), color: 0xffffff, roughness: 0.7 });
    const bone = mat(m, { color: BONE, roughness: 0.45 });
    const armor = mat(m, { map: plateTex('#2a2c34', { grid: 64, blood: 8 }), color: 0xffffff, metalness: 0.8, roughness: 0.35 });
    const cloth = mat(m, { color: 0x3a0a10, roughness: 0.9, side: THREE.DoubleSide });
    const fire = mat(m, { color: 0x104a20, emissive: 0x40ff70, emissiveIntensity: 2.8, glow: true, shadow: false });
    const G = new Rig(m);
    // 馬の体(前 = -z)
    const body = G.bone(null, 0, 2.2, 0);
    G.add(body, lathe([[0, -1.3], [0.4, -1.15], [0.6, -0.6], [0.62, 0.2], [0.55, 0.9], [0.35, 1.25], [0, 1.35]], 16, (p) => { p.x *= 0.85; if (p.z > 0) p.z *= 1.1; }), horse, 0, 0, 0, -PI / 2, 0, 0);
    for (let i = 0; i < 6; i++) G.add(body, torus(0.55, 0.035, 5, 10, PI * 0.9), bone, 0, -0.1, -0.7 + i * 0.25, 0, PI / 2, PI / 2 + 0.2);
    G.add(body, box(1.3, 0.15, 1.2), armor, 0, 0.6, 0.1);                         // くら
    G.add(body, cyl(0.62, 0.66, 1.3, 14, true), cloth, 0, 0.1, 0.1, PI / 2);       // 馬よろいの布
    const neck = G.bone(body, 0, 0.35, -1.0);
    G.add(neck, lathe([[0.32, 0], [0.28, 0.5], [0.22, 0.9], [0, 1.0]], 10), horse, 0, 0, 0, -0.55, 0, 0);
    for (let i = 0; i < 6; i++) G.add(neck, spike(0.35, 0.05), fire, 0, 0.25 + i * 0.13, 0.15 - i * 0.07, -0.3);   // 燃える たてがみ
    const head = G.bone(neck, 0, 0.85, -0.45);
    G.add(head, lathe([[0, -0.6], [0.13, -0.5], [0.17, -0.1], [0.2, 0.15], [0, 0.22]], 10, (p) => { p.x *= 0.85; }), bone, 0, 0, 0, -PI / 2 - 0.2, 0, 0);
    for (const sx of [-1, 1]) G.add(head, sph(0.06, 6, 6), fire, sx * 0.13, 0.1, -0.05);
    G.add(head, box(0.32, 0.08, 0.6), armor, 0, 0.15, -0.15);                    // 馬の かぶと
    const jaw = G.bone(head, 0, -0.08, -0.05);
    G.add(jaw, box(0.18, 0.06, 0.45), bone, 0, -0.04, -0.28);
    const tail = G.bone(body, 0, 0.3, 1.25);
    for (let i = 0; i < 5; i++) G.add(tail, spike(0.9, 0.06), fire, R(-0.15, 0.15), 0, 0.1, 2.2 + R(-0.2, 0.2), R(-0.3, 0.3), 0);
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, fr = i < 2;
      const up = G.bone(body, sx * 0.35, -0.2, fr ? -0.85 : 0.85);
      G.add(up, limb(1.0, 0.2, 0.13), horse);
      const lo = G.bone(up, 0, -1.0, 0);
      G.add(lo, limb(1.0, 0.1, 0.08), bone);
      G.add(lo, cyl(0.14, 0.17, 0.2, 8), armor, 0, -1.05, 0);
      legs.push({ up, lo, sx, fr });
    }
    // 騎士(首がなく、首から 緑の火)
    const rider = G.bone(body, 0, 0.75, 0.1);
    G.add(rider, lathe([[0.2, 0], [0.3, 0.3], [0.38, 0.75], [0.3, 1.0], [0.12, 1.08], [0, 1.1]], 12, (p) => { p.z *= 0.75; }), armor);
    G.add(rider, cyl(0.1, 0.12, 0.12, 8), horse, 0, 1.1, 0);
    G.add(rider, sph(0.13, 8, 6), fire, 0, 1.2, 0, 0, 0, 0, 1, 1.6, 1);
    for (const sx of [-1, 1]) G.add(rider, sph(0.2, 10, 6, 0, TAU, 0, PI / 2), armor, sx * 0.4, 0.95, 0, 0, 0, -sx * 0.4, 1, 0.8, 1);
    G.add(rider, cyl(0.42, 0.65, 1.3, 12, true), cloth, 0, 0.1, 0.25, 0.25, 0, 0);    // マント
    for (const sx of [-1, 1]) { G.add(rider, limb(0.6, 0.12, 0.1), armor, sx * 0.25, -0.05, 0, 0.9, 0, sx * 0.9); }    // 足(馬の横へ)
    const lanceArm = G.bone(rider, 0.38, 0.9, 0);
    G.add(lanceArm, limb(0.55, 0.11, 0.09), armor);
    const lance = G.bone(lanceArm, 0, -0.55, 0);
    G.add(lance, cyl(0.03, 0.2, 4.6, 10), armor, 0, 0, -1.6, PI / 2);
    G.add(lance, cyl(0.25, 0.04, 0.4, 10), armor, 0, 0, 0.55, PI / 2);
    const shieldArm = G.bone(rider, -0.38, 0.9, 0);
    G.add(shieldArm, limb(0.55, 0.11, 0.09), armor);
    G.add(shieldArm, cyl(0.55, 0.55, 0.08, 6), armor, -0.12, -0.5, -0.1, 0, 0, PI / 2);
    G.add(shieldArm, sph(0.1, 6, 6), bone, -0.18, -0.5, -0.1);
    G.finish();
    m.j = { body, neck, head, jaw, tail, legs, rider, lanceArm, lance, shieldArm };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state;
    const gal = min(1, e.spd / 6);
    let rear = 0;
    if (S === 'rear') rear = st < 0.6 ? ease(st / 0.6) : 1 - ease(seg(st, 0.75, 0.9));
    if (S === 'roar' || S === 'enter') rear = 0.7 + 0.1 * sin(t * 6);
    j.body.position.y = 2.2 + 0.15 * abs(sin(ph * 2)) * gal + rear * 0.8;
    j.body.rotation.x = rear * 0.75 + 0.06 * sin(ph * 2) * gal;
    j.body.position.z = rear * 0.6;
    j.neck.rotation.x = 0.2 * sin(ph * 2) * gal - rear * 0.3;
    j.head.rotation.x = 0.15 * sin(t * 2) + rear * 0.4;
    j.jaw.rotation.x = -(0.15 + 0.15 * sin(t * 4)) - rear * 0.3;
    j.tail.rotation.x = 0.3 * sin(t * 3) - 0.4 * gal;
    for (const L of j.legs) {
      const g = ph * 2 + (L.fr ? 0 : PI * 0.5) + (L.sx > 0 ? PI * 0.25 : 0);
      if (L.fr && rear > 0) { L.up.rotation.x = -1.4 * rear + 0.4 * sin(t * 14) * rear; L.lo.rotation.x = 1.6 * rear; }
      else { L.up.rotation.x = sin(g) * 0.7 * gal - (L.fr ? 0 : rear * 0.7); L.lo.rotation.x = (L.fr ? 0.9 : -0.9) * max(0, cos(g)) * gal + (L.fr ? 0 : rear * 0.4); }
    }
    j.rider.rotation.set(-rear * 0.5 + (S === 'joust' && st > 0.6 ? -0.25 : 0), 0, 0);
    // 槍: ふだん 上へ / 突撃は 前へ / なぎはらい
    let lx = 2.4, lz = 0.2;
    if (S === 'joust' || (S === 'hellride')) lx = st < 0.6 ? 2.4 - 0.9 * ease(st / 0.6) : 1.5;
    else if (S === 'sweep') { const a = ease(min(1, st / 0.55)), b = ease(seg(st, 0.55, 0.8)); lx = 1.5; lz = 0.2 + 1.0 * a - 2.2 * b; }
    else if (S === 'skull') { lx = 2.4; }
    j.lanceArm.rotation.set(lx, 0, lz); j.lance.rotation.set(-lx + 1.5, 0, 0);
    j.shieldArm.rotation.set(S === 'skull' && st < 0.8 ? 2.8 : 0.9, 0, -0.3);
    if (!m.dead && Math.random() < dt * 25) { m.root.updateMatrixWorld(true); j.rider.getWorldPosition(_v); FX.flame(_v.x + R(-0.4, 0.4), _v.y + 3.6, _v.z + R(-0.4, 0.4), 0, 4, 0, 1.2, 0.5, 0xa0ffb0, 0x108a30); }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_K2); if (a) return begin(e, a); }
      // 主人公のまわりを 円を えがいて 走る(近すぎると はなれる)
      const side = e.orbit || (e.orbit = Math.random() < 0.5 ? 1 : -1);
      const tx = -c.dz * side, tz = c.dx * side, k = c.d < 14 ? -0.7 : c.d > 24 ? 0.8 : 0;
      const vx = tx + c.dx * k, vz = tz + c.dz * k, l = Math.hypot(vx, vz) || 1;
      e.vx += (vx / l * c.sp - e.vx) * 0.05; e.vz += (vz / l * c.sp - e.vz) * 0.05;
      e.face = Math.atan2(e.vx, -e.vz); e.lockFace = true;
      return -1;
    }
    e.lockFace = S !== 'skull' && S !== 'sweep' && S !== 'rear' ? e.lockFace : false;
    if (S === 'joust' || S === 'hellride') {
      if (st < 0.6) { e.lockFace = false; e.vx *= 0.9; e.vz *= 0.9; const fx = sin(e.face), fz = -cos(e.face); Warn.rect(e.x, e.z, c.dx, c.dz, 56, 6, st / 0.6); e.cx = c.dx; e.cz = c.dz; return -1; }
      if (!e.n) { e.n = 1; e.face = Math.atan2(e.cx, -e.cz); e.lockFace = true; act(e, 'charge'); }
      Warn.rect(e.x, e.z, e.cx, e.cz, max(2, 56 - (st - 0.6) * 32), 6, 1);
      e.vx = e.cx * 32; e.vz = e.cz * 32;
      B._Z.damageCircle(e.x + e.cx * 4, e.z + e.cz * 4, 3.5, 1400, { force: 30, cause: 'lance' });
      if (!e.hitDone && heroIn(B, e.x + e.cx * 4, e.z + e.cz * 4, 3.5)) { e.hitDone = 1; hitHero(B, e, e.x, e.z, 28, 9, 'lance', e.cx - e.cz * 0.7, e.cz + e.cx * 0.7); }
      if (S === 'hellride' && (e.ft = (e.ft || 0) + dt) > 0.12) { e.ft = 0; FX.burst({ x: e.x, y: 0.5, z: e.z, count: 8, color: 0x60ff80, speed: 3, up: 4, life: 0.9, size: 0.4, grav: -2 }); e.trail = e.trail || []; e.trail.push([e.x, e.z, 2.2]); }
      if (st > 0.6 + 56 / 32) { e.vx *= 0.3; e.vz *= 0.3; done(e, 0.7, c); e.lockFace = false; }
      return -1;
    }
    if (S === 'rear') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (st < 0.8) { const [x, z] = fwd(e, 5); e.tx = x; e.tz = z; Warn.circle(x, z, 9, st / 0.8); }
      if (st > 0.82 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 9, { dmg: 1600, hero: 24, lift: 8, big: true, cause: 'stomp' }); }
      if (st > 1.3) done(e, 0.8, c);
      return -1;
    }
    if (S === 'sweep') {
      e.vx *= 0.85; e.vz *= 0.85;
      if (st > 0.4 && !e.ax0) { e.ax0 = 1; lock(e, c); }
      if (st < 0.55) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 16, 1.1, st / 0.55);
      if (st > 0.6 && !e.hitDone) { e.hitDone = 1; cone(B, e, e.x, e.z, e.ax, e.az, 16, 1.1, { dmg: 1300, hero: 24, lift: 5, cause: 'lance', force: 30 }); FX.slash(e.x, 4, e.z, e.face, 2.2, 3, 16, 0xa0ffb0, 0.3, -1, 0.1, 2.5, 0.8, 0.5); }
      if (st > 1.1) { e.ax0 = 0; done(e, 0.7, c); }
      return -1;
    }
    if (S === 'skull') {
      e.vx *= 0.9; e.vz *= 0.9;
      const N = e.phase >= 2 ? 3 : e.phase >= 1 ? 2 : 1, n = Math.floor((st - 0.7) / 0.35);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.rider.getWorldPosition(_v);
        const [x, z] = lead(c, 1.3);
        throwAt(B, e, 'skull', _v.x, _v.y + 3.5, _v.z, x + R(-3, 3), z + R(-3, 3), 1.3, { r: 6.5, size: 1.8, dmg: 1300, hero: 22, lift: 7, homing: 1.5 });
        act(e, 'throw');
      }
      if (st > 0.9 + N * 0.35) done(e, 0.8, c);
      return -1;
    }
    return -1;
  },
  step(B, e) {},
};
const LIST_K2 = [['joust', 12, 50, 4], ['rear', 0, 12, 3], ['sweep', 0, 15, 3], ['skull', 10, 60, 3], ['hellride', 12, 50, 4, 2]];

// =====================================================================
// 合体ゾンビ レギオン(15m)
// =====================================================================
function bodyGeo() {
  // 小さな ゾンビの体(頭・胴・腕)。何百も 体じゅうに くっつける
  const parts = [];
  const t = new THREE.CapsuleGeometry(0.12, 0.35, 2, 6); parts.push(t);
  const h = new THREE.SphereGeometry(0.1, 6, 5); h.translate(0, 0.33, 0); parts.push(h);
  const a = new THREE.CapsuleGeometry(0.04, 0.3, 2, 4); a.rotateZ(1.0); a.translate(0.16, 0.12, 0); parts.push(a);
  const b = new THREE.CapsuleGeometry(0.04, 0.3, 2, 4); b.rotateZ(-0.6); b.translate(-0.15, 0.05, 0); parts.push(b);
  for (const g of parts) { g.deleteAttribute('uv'); }
  const out = mergeSimple(parts);
  return out;
}
function mergeSimple(list) {
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < c; i++) { uv[(o + i) * 2] = Math.random(); uv[(o + i) * 2 + 1] = Math.random(); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi++] = g.index.array[i] + o;
    else for (let i = 0; i < c; i++) idx[oi++] = o + i;
    o += c;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
function scatter(G, bone, mt, BG, n, rx, ry, rz, cy = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const u = R(-1, 1), a = R(0, TAU), s = Math.sqrt(1 - u * u);
    const x = cos(a) * s * rx, y = u * ry + cy, z = sin(a) * s * rz + cz;
    G.add(bone, BG, mt, x, y, z, R(0, TAU), R(0, TAU), R(0, TAU), R(0.9, 1.4));
  }
}
const legion = {
  def: { name: '合体ゾンビ レギオン', title: '千の屍の集合体', icon: '💀', hp: 38000, speed: 3.2, r: 4.4, points: 4000, scale: 5.5, size: 15, tier: 3, S: 3.5, color: 0x7a5a50 },
  stride: 0.6, feet: { w: 0.5, f: 0, s: 1.2 }, fall: 'collapse', fallT: 1.5,
  build(m) {
    const flesh = mat(m, { map: bodiesTex(), color: 0xffffff, roughness: 0.65 });
    const skin = mat(m, { map: skinTex('#8a7a6a', { wounds: 20, rep: 3 }), color: 0xffffff, roughness: 0.7 });
    const eye = mat(m, { color: 0x401010, emissive: 0xff4020, emissiveIntensity: 2.2, glow: true });
    const BG = bodyGeo();
    const G = new Rig(m);
    const hips = G.bone(null, 0, 1.6, 0);
    G.add(hips, blob(0.75, 0.25, 2, 16, 12), flesh, 0, 0, 0, 0, 0, 0, 1.3, 0.9, 1);
    scatter(G, hips, skin, BG, 18, 0.95, 0.6, 0.75);
    const torso = G.bone(hips, 0, 0.3, 0);
    G.add(torso, blob(1.15, 0.22, 5, 22, 16), flesh, 0, 1.0, 0, 0, 0, 0, 1.2, 1.1, 0.95);
    G.add(torso, blob(0.6, 0.3, 8, 14, 10), flesh, 0.6, 1.7, 0.2);
    G.add(torso, blob(0.55, 0.3, 9, 14, 10), flesh, -0.65, 1.6, 0.1);
    scatter(G, torso, skin, BG, 70, 1.35, 1.25, 1.1, 1.0);
    // 頭(いくつも)
    const heads = [];
    for (let i = 0; i < 5; i++) {
      const h = G.bone(torso, (i - 2) * 0.38, 2.15 + (i === 2 ? 0.3 : 0) - abs(i - 2) * 0.1, -0.5 - (i === 2 ? 0.2 : 0));
      G.add(h, sph(0.26, 12, 10), skin, 0, 0.1, 0, 0, 0, 0, 1, 1.15, 1);
      for (const sx of [-1, 1]) G.add(h, sph(0.045, 6, 6), eye, sx * 0.09, 0.15, -0.23);
      G.add(h, sph(0.08, 8, 6), mat0(m), 0, 0.0, -0.22, 0, 0, 0, 1.3, 1.6, 0.5);
      heads.push(h);
    }
    // 腕(たくさん)
    const arms = [];
    for (let i = 0; i < 6; i++) {
      const sx = i % 2 ? 1 : -1, row = i >> 1;
      const a = G.bone(torso, sx * (1.15 - row * 0.1), 1.65 - row * 0.5, -0.1);
      G.add(a, limb(1.3, 0.2, 0.16, 1.2), flesh);
      scatter(G, a, skin, BG, 5, 0.25, 0.55, 0.25, -0.6);
      const f = G.bone(a, 0, -1.3, 0);
      G.add(f, limb(1.25, 0.17, 0.13), flesh);
      for (let k = 0; k < 3; k++) G.add(f, limb(0.35, 0.05, 0.03), skin, (k - 1) * 0.08, -1.3, 0, 0.2 * (k - 1), 0, 0);
      arms.push({ a, f, sx, row });
    }
    const legs = [];
    for (const sx of [-1, 1]) {
      const l = G.bone(hips, sx * 0.5, -0.2, 0);
      G.add(l, limb(0.8, 0.42, 0.36), flesh);
      scatter(G, l, skin, BG, 8, 0.45, 0.4, 0.45, -0.4);
      const k = G.bone(l, 0, -0.8, 0);
      G.add(k, limb(0.65, 0.36, 0.34), flesh);
      scatter(G, k, skin, BG, 6, 0.4, 0.35, 0.4, -0.35);
      legs.push({ l, k });
    }
    G.finish();
    m.j = { hips, torso, heads, arms, legs };
  },
  // 撃たれると ゾンビが はがれ落ちる(体力 2% ごと)
  hit(B, e, m, amount) {
    e.shed = (e.shed || 0) + amount;
    const unit = e.maxHp * 0.02;
    let n = 0;
    while (e.shed > unit && n < 3) {
      e.shed -= unit; n++;
      const a = R(0, TAU), h = R(3, 10);
      const z = B._Z.spawn(Math.random() < 0.6 ? 'walker' : 'runner', e.x + cos(a) * 3, e.z + sin(a) * 3);
      if (z) { z.kx = cos(a) * 7; z.kz = sin(a) * 7; z.stun = 0.6; z.rise = 0; }
      Gore.chunks(e.x + cos(a) * 2.5, h, e.z + sin(a) * 2.5, 4, 6, 3, cos(a), sin(a), 0x6a0808, 2);
      FX.burst({ x: e.x + cos(a) * 3, y: h, z: e.z + sin(a) * 3, count: 10, color: 0x7a0808, speed: 6, up: 2, life: 0.8, size: 0.2 });
    }
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state, s = sin(ph), c = cos(ph);
    const k = min(1, e.spd / 2);
    // 体力が へると 小さくなる
    const shrink = 0.72 + 0.28 * (e.alive ? e.hp / e.maxHp : 0);
    if (!m.dead) m.tilt.scale.setScalar(m.S * shrink);
    j.hips.position.y = 1.6 - 0.12 * abs(s) * k;
    j.hips.rotation.z = 0.08 * s * k;
    j.torso.rotation.set(-0.15 + 0.06 * sin(t * 1.5), 0.15 * s * k, 0.05 * sin(t * 2.3));
    for (const L of j.legs) { const sg = L === j.legs[0] ? 1 : -1; L.l.rotation.x = sg * s * 0.5 * k; L.k.rotation.x = -(0.1 + 0.6 * max(0, sg * c)) * k; }
    for (let i = 0; i < j.heads.length; i++) { const h = j.heads[i]; h.rotation.set(0.3 * sin(t * 1.7 + i * 2), 0.5 * sin(t * 1.1 + i), 0.3 * sin(t * 2.1 + i)); }
    for (const A of j.arms) {
      const w = sin(t * 2.5 + A.row * 1.3 + A.sx);
      A.a.rotation.set(0.3 + 0.5 * w, 0, A.sx * (0.4 + 0.2 * A.row)); A.f.rotation.x = 0.5 + 0.3 * w;
    }
    if (S === 'slam') {
      const a = st < 0.9 ? ease(st / 0.9) : 1, b = ease(seg(st, 0.9, 1.1));
      j.torso.rotation.x = 0.4 * a - 1.4 * b; for (const A of j.arms) { A.a.rotation.set(2.8 * a - 1.6 * b, 0, A.sx * 0.3); }
      j.hips.position.y = 1.6 - 0.5 * b;
    } else if (S === 'grab') {
      for (const A of j.arms) { const p = (st * 4 + A.row * 0.3 + (A.sx > 0 ? 0.5 : 0)) % 1; A.a.rotation.set(1.2 + 1.2 * sin(p * PI), 0, A.sx * 0.5); A.f.rotation.x = 0.2; }
      j.torso.rotation.x = -0.4;
    } else if (S === 'rain' || S === 'wave') {
      const p = (st * 2.2) % 1; j.arms[0].a.rotation.set(3 - 2.4 * p, 0, -0.3); j.arms[1].a.rotation.set(3 - 2.4 * ((p + 0.5) % 1), 0, 0.3);
    } else if (S === 'roar' || S === 'enter' || S === 'burst') {
      for (const A of j.arms) { A.a.rotation.set(-0.3 + 0.3 * sin(t * 20 + A.row), 0, A.sx * 1.6); A.f.rotation.x = 1; }
      j.torso.rotation.x = 0.35;
      const sw = S === 'burst' ? 1 + 0.25 * sin(min(1, st / 1.0) * PI * 0.5) : 1;
      j.torso.scale.setScalar(sw);
    } else j.torso.scale.setScalar(1);
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_L); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'slam') {
      if (st > 0.7 && !e.lockFace) lock(e, c);
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 1.0) Warn.rect(e.x, e.z, fx, fz, 20, 9, st / 1.0);
      if (st > 1.05 && !e.hitDone) {
        e.hitDone = 1;
        line(B, e, e.x, e.z, e.ax, e.az, 20, 9, { dmg: 1800, hero: 26, lift: 8, cause: 'slam', shake: 1.4 });
        for (let i = 0; i < 6; i++) { const t = R(4, 18), z = B._Z.spawn('crawler', e.x + e.ax * t + R(-3, 3), e.z + e.az * t + R(-3, 3)); if (z) z.stun = 0.8; }
        Gore.splat(e.x + e.ax * 10, e.z + e.az * 10, 8, e.ax, e.az, 2);
      }
      if (st > 1.9) done(e, 1.0, c);
      return 0;
    }
    if (S === 'grab') {
      if (!e.pts) { e.pts = []; for (let i = 0; i < 6; i++) { const a = R(0, TAU), r = i < 2 ? R(0, 3) : R(3, 9); e.pts.push([c.px + cos(a) * r, c.pz + sin(a) * r]); } }
      for (let i = 0; i < e.pts.length; i++) {
        const p = e.pts[i], t0 = 0.7 + i * 0.13;
        if (st < t0) Warn.circle(p[0], p[1], 4, st / t0);
        else if (e.n <= i) { e.n = i + 1; slam(B, e, p[0], p[1], 4, { dmg: 900, hero: 18, lift: 6, cause: 'boss', shake: 0.5 }); FX.beam(e.x, 8, e.z, p[0], 0.5, p[1], 0x7a3a30, 1.0, 0.25, 1.2, 1); Gore.splat(p[0], p[1], 2.5, 0, 0, 1); }
      }
      if (st > 1.9) { e.pts = null; done(e, 0.9, c); }
      return 0;
    }
    if (S === 'rain') {
      const N = 3 + e.phase * 2, n = Math.floor((st - 0.4) / 0.25);
      if (n >= 0 && e.n <= n && e.n < N) {
        e.n++;
        m.root.updateMatrixWorld(true); m.j.torso.getWorldPosition(_v);
        const a = R(0, TAU), r = e.n === 1 ? 0 : R(3, 12);
        throwAt(B, e, 'flesh', _v.x, _v.y + 4, _v.z, c.px + cos(a) * r, c.pz + sin(a) * r, 1.3, { r: 6, size: 1.6, spawn: 3, dmg: 900, hero: 20 });
        act(e, 'throw');
      }
      if (st > 0.6 + N * 0.25) done(e, 1.0, c);
      return 0;
    }
    if (S === 'wave') {
      if (st > 0.5 && !e.hitDone) {
        e.hitDone = 1;
        const px = -c.dz, pz = c.dx;
        for (let i = 0; i < 18; i++) {
          const o = (i / 17 - 0.5) * 20, z = B._Z.spawn('runner', e.x + c.dx * 4 + px * o, e.z + c.dz * 4 + pz * o);
          if (z) { z.kx = c.dx * 14; z.kz = c.dz * 14; z.spdMul *= 1.4; }
        }
        Gore.splat(e.x + c.dx * 4, e.z + c.dz * 4, 8, c.dx, c.dz, 2);
        FX.burst({ x: e.x, y: 6, z: e.z, count: 60, color: 0x7a0808, speed: 12, up: 6, life: 0.9, size: 0.25, dirX: c.dx, dirZ: c.dz });
        act(e, 'summon');
      }
      if (st > 1.3) done(e, 0.8, c);
      return 0;
    }
    if (S === 'burst') {
      if (st < 1.1) Warn.circle(e.x, e.z, 16, st / 1.1);
      if (st > 1.15 && !e.hitDone) {
        e.hitDone = 1;
        slam(B, e, e.x, e.z, 16, { dmg: 2200, hero: 28, lift: 10, big: true, cause: 'flesh', shake: 1.8, col: 0xff4030 });
        for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; Gore.chunks(e.x + cos(a) * 4, 6, e.z + sin(a) * 4, 12, 16, 10, cos(a), sin(a), 0x6a0808, 3); Gore.splat(e.x + cos(a) * 9, e.z + sin(a) * 9, 4, cos(a), sin(a), 2); }
        for (let i = 0; i < 10; i++) { const a = R(0, TAU); const z = B._Z.spawn('walker', e.x + cos(a) * 6, e.z + sin(a) * 6); if (z) { z.kx = cos(a) * 10; z.kz = sin(a) * 10; z.stun = 1; } }
      }
      if (st > 2.0) done(e, 1.2, c);
      return 0;
    }
    return c.sp;
  },
};
function mat0(m) { return m._mouth || (m._mouth = mat(m, { color: 0x140404, roughness: 0.6 })); }
const LIST_L = [['slam', 0, 20, 3], ['grab', 0, 30, 3], ['rain', 10, 60, 3], ['wave', 8, 40, 2, 1], ['burst', 0, 16, 3, 2]];

export const GIANTS = { titan, oni, knight, legion };
