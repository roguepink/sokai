// キャラ係: はじめからいる ボス 4 体を 怪獣の大きさに 作りなおした。
//   巨人タイラント(13m)… 両こぶしの たたきつけ・つめの なぎはらい・3 連ふみつけ・大ジャンプ・岩投げ / 怒り: 地割れの列・隕石の雨
//   処刑人ブッチャー(11m)… 大なたの ふりおろし(長い帯)・なぎはらい・猛突進・かぎ投げ(主人公を引きよせる)/ 怒り: 2 連ぎり・回転ぎり
//   異形アボミネーション(10m)… 6 本腕の連打・のしかかり・はうゾンビを産む・触手の 3 方向打ち・ゲロ / 怒り: 頭がふえて光る・連打が速い
//   大這い屍クローラー(長さ 19m)… ジグザグに走る・飛びかかり・かみつき突進・しっぽ払い / 怒り: 背中から はうゾンビ・連続とびかかり
import * as THREE from '../vendor/three/build/three.module.min.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, BONE, lathe, sstep, skinTex, plateTex, stripeTex, mat, limb, limbX, spike, horn, blob, box, sph, cyl, torus, tube, ribs, Rig, walkPose, roarPose, ease, seg } from './boss-kit.js';
import { act, slam, line, cone, step, hitHero, heroIn, throwAt, quake, pick, begin, done, lock, lead, fwd, roarBlast } from './boss-attacks.js';

const _v = new THREE.Vector3();

// 手に持つ物(骨にくっつける ふつうの Mesh)
function heldRock(bone, y, s) {
  const o = new THREE.Mesh(blob(1, 0.28, 3, 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95, flatShading: true }));
  o.scale.setScalar(s); o.position.set(0, y, 0); o.visible = false; o.castShadow = true;
  bone.add(o);
  return o;
}

// =====================================================================
// 巨人タイラント
// =====================================================================
const tyrant = {
  def: { name: '巨人タイラント', title: '大地を砕く者', icon: '👹', hp: 36000, speed: 3.6, r: 3.2, points: 3000, scale: 5.2, size: 13, tier: 1, S: 3.0, color: 0x8a6a6a },
  stride: 0.75, feet: { w: 0.3, f: 0.1, s: 1 },
  build(m) {
    const skin = mat(m, { map: skinTex('#9a8a86', { stitches: 8, wounds: 16 }), color: 0xffffff });
    const coat = mat(m, { map: skinTex('#2a2420', { wounds: 4, drips: 6, veins: 0 }), color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const iron = mat(m, { map: plateTex('#5a5650', { blood: 6, grid: 128 }), color: 0xffffff, metalness: 0.6, roughness: 0.45 });
    const glow = mat(m, { color: 0x6a0a0a, emissive: 0xff2a10, emissiveIntensity: 2.4, roughness: 0.3, glow: true });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 2.0, 0);
    G.add(hips, lathe([[0, -0.4], [0.4, -0.35], [0.5, -0.1], [0.48, 0.15], [0, 0.2]], 12, (p) => { p.x *= 1.25; p.z *= 0.85; }), coat);
    // ぼろぼろの コートのすそ
    G.add(hips, lathe([[0.95, -1.35], [0.78, -0.6], [0.56, -0.1], [0.5, 0.1]], 18, (p) => { if (p.y < -0.9) p.y += sin(Math.atan2(p.x, p.z) * 7) * 0.16; p.z *= 0.9; }), coat);
    G.add(hips, torus(0.5, 0.06, 6, 16), iron, 0, 0.05, 0, PI / 2);    // ベルト
    const torso = G.bone(hips, 0, 0.1, 0);
    G.add(torso, lathe([[0.45, 0], [0.5, 0.3], [0.62, 0.7], [0.68, 1.05], [0.52, 1.3], [0.25, 1.42], [0, 1.45]], 16, (p) => {
      p.x *= 1 + 0.65 * sstep(0.4, 1.1, p.y); p.z *= 0.8; if (p.z > 0 && p.y > 0.6) p.z += 0.22 * sstep(0.6, 1.2, p.y);
      if (p.y > 1.1) p.y -= 0.25 * min(1, (p.x / 0.9) ** 2);
    }), skin);
    // 胸が裂けて あばらと 光る心臓
    G.add(torso, sph(0.26, 12, 10), glow, -0.2, 0.95, -0.42);
    ribs(G, torso, bone, 4, 0.75, 0.13, 0.42, 0.035, -0.12, PI * 0.9, 1.3);
    // 背中: 管・骨のとげ
    for (let i = 0; i < 7; i++) G.add(torso, spike(R(0.35, 0.8), 0.08), bone, R(-0.5, 0.5), R(0.6, 1.3), 0.5, R(0.6, 1.2), 0, R(-0.5, 0.5));
    for (const sx of [-1, 1]) G.add(torso, tube([[sx * 0.3, 1.2, 0.45], [sx * 0.55, 0.8, 0.65], [sx * 0.4, 0.3, 0.5]], 0.06, 10, 6), iron);
    // 鎖(胸に巻きつく)
    for (let i = 0; i < 9; i++) G.add(torso, torus(0.09, 0.025, 5, 8), iron, -0.55 + i * 0.13, 0.35 + i * 0.09, -0.5, 0, i % 2 ? PI / 2 : 0, 0.6);
    // 肩の 鉄の板
    for (const sx of [-1, 1]) G.add(torso, sph(0.36, 10, 6, 0, TAU, 0, PI * 0.5), iron, sx * 0.85, 1.2, 0, 0, 0, -sx * 0.4, 1.2, 0.5, 1.1);
    const head = G.bone(torso, 0, 1.38, -0.15);
    G.add(head, lathe([[0, -0.1], [0.14, -0.05], [0.18, 0.1], [0.2, 0.25], [0.16, 0.4], [0, 0.45]], 14, (p) => { p.x *= 0.95; if (p.z < 0 && p.y < 0.15) p.z *= 1.25; }), skin);
    for (const sx of [-1, 1]) G.add(head, sph(0.045, 8, 6), glow, sx * 0.07, 0.24, -0.17);
    G.add(head, box(0.3, 0.06, 0.12), skin, 0, 0.3, -0.13);      // まゆの骨
    const jaw = G.bone(head, 0, 0.05, -0.05);
    G.add(jaw, box(0.26, 0.08, 0.22), skin, 0, -0.06, -0.1);
    for (let i = 0; i < 6; i++) G.add(jaw, spike(0.06, 0.015, 4), bone, -0.1 + i * 0.04, -0.02, -0.2);
    for (let i = 0; i < 6; i++) G.add(head, spike(0.07, 0.016, 4), bone, -0.1 + i * 0.04, 0.06, -0.19, PI);
    // 右腕(ふつう)
    const armR = G.bone(torso, 0.85, 1.08, 0), armL = G.bone(torso, -0.88, 1.08, 0);
    G.add(armR, limb(0.85, 0.25, 0.21), skin);
    const foreR = G.bone(armR, 0, -0.85, 0);
    G.add(foreR, limb(0.8, 0.22, 0.18), skin);
    G.add(foreR, sph(0.3, 10, 8), skin, 0, -0.95, 0);
    G.add(foreR, cyl(0.24, 0.24, 0.25, 10), iron, 0, -0.55, 0);
    // 左腕: 化けもの の腕(太い・骨のつめ・光る筋)
    G.add(armL, limb(1.0, 0.36, 0.32, 1.2), skin);
    for (let i = 0; i < 4; i++) G.add(armL, spike(0.35, 0.06), bone, -0.3, -0.2 - i * 0.2, 0, 0, 0, 1.4);
    const foreL = G.bone(armL, 0, -1.0, 0);
    G.add(foreL, limb(1.1, 0.38, 0.32, 1.3), skin);
    for (let i = 0; i < 3; i++) G.add(foreL, spike(0.9, 0.08), bone, (i - 1) * 0.15, -1.25, -0.05, PI + 0.25);
    for (let i = 0; i < 5; i++) G.add(foreL, spike(0.32, 0.05), bone, -0.33, -0.15 - i * 0.18, 0, 0, 0, 1.4);
    G.add(foreL, tube([[0.2, -0.1, -0.3], [0.28, -0.5, -0.33], [0.15, -0.95, -0.3]], 0.03, 8, 5), glow);
    G.add(armL, tube([[0.15, 0, -0.3], [0.3, -0.5, -0.32], [0.2, -0.95, -0.3]], 0.03, 8, 5), glow);
    const legL = G.bone(hips, -0.3, -0.15, 0), legR = G.bone(hips, 0.3, -0.15, 0);
    const knees = [];
    for (const leg of [legL, legR]) {
      G.add(leg, limb(0.9, 0.32, 0.25), coat);
      const kn = G.bone(leg, 0, -0.9, 0); knees.push(kn);
      G.add(kn, limb(0.85, 0.25, 0.19), skin);
      G.add(kn, box(0.38, 0.24, 0.7), iron, 0, -0.92, -0.12);
      G.add(kn, cyl(0.27, 0.3, 0.3, 10), iron, 0, -0.65, 0);
    }
    G.finish();
    m.rock = heldRock(foreR, -1.4, 0.9);
    m.j = { hips, torso, head, jaw, armL, armR, foreL, foreR, legL, legR, kneeL: knees[0], kneeR: knees[1] };
  },
  anim(m, e, dt) {
    const j = m.j, st = e.st, S = e.state;
    const k = min(1, e.spd / 2.2);
    walkPose(j, e, 2.0, k, { lean: -0.22 });
    if (S === 'enter') roarPose(j, 0.6, 0.05);
    else if (S === 'roar') roarPose(j, min(1, st / 0.3) * (st < 1.3 ? 1 : max(0, 1 - (st - 1.3) * 5)), 0.06);
    else if (S === 'slam' || S === 'quakeline' || S === 'meteor') {
      const up = S === 'meteor' ? 1.0 : S === 'quakeline' ? 0.8 : 0.85;
      if (st < up) {
        const a = ease(min(1, st / (up * 0.8)));
        j.armL.rotation.set(0.2 + a * 2.8, 0, -0.25 - a * 0.25); j.armR.rotation.set(0.2 + a * 2.8, 0, 0.25 + a * 0.25);
        j.foreL.rotation.x = j.foreR.rotation.x = 0.4 + a * 0.4;
        j.torso.rotation.x = -0.2 + a * 0.45; j.head.rotation.x = 0.1 + 0.4 * a; j.jaw.rotation.x = -0.5 * a;
        j.hips.position.y = 2.0 + 0.1 * a;
      } else {
        const a = ease(min(1, (st - up) / 0.12)), b = S === 'meteor' ? 0 : 1;
        j.armL.rotation.set(3.0 - a * 2.6 * b - (1 - b) * 0, 0, -0.3); j.armR.rotation.set(3.0 - a * 2.6 * b, 0, 0.3);
        j.foreL.rotation.x = j.foreR.rotation.x = 0.2;
        j.torso.rotation.x = 0.25 - a * 1.0 * b; j.hips.position.y = 2.0 - a * 0.5 * b;
        j.kneeL.rotation.x = j.kneeR.rotation.x = -0.8 * a * b; j.legL.rotation.x = j.legR.rotation.x = 0.4 * a * b;
        j.jaw.rotation.x = -0.6;
        if (S === 'meteor') { j.head.rotation.x = 0.7; j.torso.rotation.x = 0.35; }
      }
    } else if (S === 'sweep') {
      const a = ease(min(1, st / 0.7)), b = ease(seg(st, 0.7, 0.95));
      j.armL.rotation.set(1.3 + 0.2 * a, 0, -0.4 - 1.0 * a + 2.0 * b);
      j.foreL.rotation.x = 0.3;
      j.torso.rotation.y = -0.8 * a + 1.6 * b; j.torso.rotation.x = -0.3;
    } else if (S === 'stomp') {
      const n = Math.floor(st / 0.5), u = (st % 0.5) / 0.5, L = n % 2 === 0;
      const lift = u < 0.6 ? ease(u / 0.6) : 1 - ease((u - 0.6) / 0.15);
      (L ? j.legL : j.legR).rotation.x = 1.1 * max(0, lift); (L ? j.kneeL : j.kneeR).rotation.x = -1.2 * max(0, lift);
      j.torso.rotation.x = -0.1; j.hips.position.y = 2.0 - 0.15 * (1 - lift);
      j.armL.rotation.z = -0.6; j.armR.rotation.z = 0.6;
    } else if (S === 'leap') {
      if (st < 0.5) { const a = ease(st / 0.5); j.hips.position.y = 2.0 - 0.6 * a; j.kneeL.rotation.x = j.kneeR.rotation.x = -1.4 * a; j.legL.rotation.x = j.legR.rotation.x = 0.9 * a; j.torso.rotation.x = -0.6 * a; j.armL.rotation.x = j.armR.rotation.x = -0.8 * a; }
      else if (e.y > 0.2) { j.legL.rotation.x = 0.6; j.legR.rotation.x = -0.2; j.kneeL.rotation.x = -1.2; j.kneeR.rotation.x = -0.5; j.armL.rotation.set(2.6, 0, -0.5); j.armR.rotation.set(2.6, 0, 0.5); j.torso.rotation.x = 0.1; }
      else { j.hips.position.y = 1.5; j.kneeL.rotation.x = j.kneeR.rotation.x = -1.2; j.legL.rotation.x = j.legR.rotation.x = 0.8; j.armL.rotation.set(0.8, 0, -0.6); j.armR.rotation.set(0.8, 0, 0.6); j.torso.rotation.x = -0.7; }
    } else if (S === 'rock') {
      if (st < 0.55) { const a = ease(st / 0.55); j.torso.rotation.x = -0.2 - 0.9 * a; j.armR.rotation.set(0.2 + 0.9 * a, 0, 0.1); j.hips.position.y = 2.0 - 0.3 * a; j.kneeL.rotation.x = j.kneeR.rotation.x = -0.6 * a; }
      else if (st < 1.1) { const a = ease((st - 0.55) / 0.55); j.torso.rotation.x = -1.1 + 1.4 * a; j.armR.rotation.set(1.1 + 1.9 * a, 0, 0.2); j.foreR.rotation.x = 0.3 + 0.6 * a; }
      else { const a = ease(min(1, (st - 1.1) / 0.15)); j.armR.rotation.set(3.0 - 2.2 * a, 0, 0.2); j.foreR.rotation.x = 0.2; j.torso.rotation.x = 0.3 - 0.7 * a; j.torso.rotation.y = -0.4 * a; }
    } else if (S === 'dead') {
      j.armL.rotation.set(1.2 + sin(e.t * 9) * 0.3, 0, -0.9); j.armR.rotation.set(1.5 + sin(e.t * 8) * 0.3, 0, 0.9);
      j.head.rotation.x = 0.6; j.jaw.rotation.x = -0.7; j.kneeL.rotation.x = j.kneeR.rotation.x = -0.6 * min(1, e.st);
    }
    m.rock.visible = S === 'rock' && st > 0.5 && st < 1.15;
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) {
        const a = pick(e, c.d, LIST_T);
        if (a) { begin(e, a); if (a === 'meteor') e.pts = null; return 0; }
      }
      return c.sp;
    }
    if (S === 'slam') {
      if (st < 0.6) { const [x, z] = fwd(e, 7.8); e.tx = x; e.tz = z; } else if (!e.lockFace) lock(e, c), ([e.tx, e.tz] = fwd(e, 7.8));
      if (st < 0.85) Warn.circle(e.tx, e.tz, 8.5, st / 0.85);
      if (st > 0.95 && !e.hitDone) { e.hitDone = 1; slam(B, e, e.tx, e.tz, 8.5, { dmg: 1500, hero: 25, lift: 8, big: true, cause: 'slam' }); }
      if (st > 1.6) done(e, 1.1, c);
      return 0;
    }
    if (S === 'sweep') {
      if (st > 0.5 && !e.lockFace) lock(e, c);
      if (st < 0.8) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 15, 1.15, st / 0.8);
      if (st > 0.82 && !e.hitDone) {
        e.hitDone = 1;
        cone(B, e, e.x, e.z, e.ax, e.az, 15, 1.15, { dmg: 1000, hero: 22, lift: 4, cause: 'claw', force: 30 });
        FX.slash(e.x, 3.5, e.z, e.face, 2.6, 4, 15, 0xff5030, 0.35, -1, 0.2, 3, 0.8, 0.5);
        quake(B, e.x, e.z, 0.8);
      }
      if (st > 1.4) done(e, 1.0, c);
      return 0.3;
    }
    if (S === 'stomp') {
      const n = Math.floor(st / 0.5), u = st % 0.5;
      if (n < 3) {
        const side = n % 2 === 0 ? -1 : 1;
        const [x, z] = fwd(e, 4.5, side * 2.4);
        Warn.circle(x, z, 6.5, u / 0.4);
        if (u > 0.4 && e.n <= n) { e.n = n + 1; slam(B, e, x, z, 6.5, { dmg: 900, hero: 18, lift: 5, cause: 'stomp' }); }
      }
      if (st > 1.7) done(e, 0.9, c);
      return 0.8;
    }
    if (S === 'leap') {
      if (st < 0.5) { const [x, z] = lead(c, 1.0); e.tx = x; e.tz = z; Warn.circle(x, z, 10, st / 1.6); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 1.1; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 17; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 10, st / 1.6);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 31 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.7 && e.y <= 0) { e.hitDone = 1; e.vx *= 0.1; e.vz *= 0.1; slam(B, e, e.x, e.z, 10, { dmg: 1800, hero: 26, lift: 9, big: true, cause: 'leap' }); }
        return -1;
      }
      if (st > 2.3) done(e, 1.0, c);
      return 0;
    }
    if (S === 'rock') {
      if (st > 0.5 && !e.n) { e.n = 1; const [x, z] = fwd(e, 3, 1.5); FX.debris(x, 0.5, z, 12, 8, 0x5a5048, 0.4, 2); FX.smoke(x, 0.5, z, 2, 1.2, 0x6f6455, 0, 2, 0, 0.6); }
      if (st > 1.15 && e.n === 1) {
        e.n = 2;
        m.root.updateMatrixWorld(true); m.rock.getWorldPosition(_v);
        const [x, z] = lead(c, 1.3);
        throwAt(B, e, 'rock', _v.x, _v.y, _v.z, x, z, 1.3, { r: 7, size: 2.6, dmg: 1400, hero: 24 });
        act(e, 'throw');
        if (e.phase >= 1) { for (let i = 0; i < e.phase; i++) throwAt(B, e, 'rock', _v.x, _v.y, _v.z, x + R(-9, 9), z + R(-9, 9), 1.5 + i * 0.25, { r: 5, size: 1.6, dmg: 900 }); }
      }
      if (st > 1.7) done(e, 1.0, c);
      return 0;
    }
    if (S === 'quakeline') {
      if (st < 0.8) { const [x, z] = fwd(e, 3); Warn.rect(x, z, sin(e.face), -cos(e.face), 36, 7, st / 0.8); return 0; }
      if (!e.lockFace) { lock(e, c); e.ox = e.x + e.ax * 3; e.oz = e.z + e.az * 3; }
      Warn.rect(e.ox, e.oz, e.ax, e.az, 36, 7, 1);
      const n = Math.floor((st - 0.85) / 0.09);
      while (e.n <= n && e.n < 8) {
        const t = 2 + e.n * 4.6, x = e.ox + e.ax * t, z = e.oz + e.az * t;
        slam(B, e, x, z, 4.2, { dmg: 900, hero: 22, lift: 9, cause: 'quake', shake: 0.6, col: 0xff8040 });
        FX.debris(x, 0.5, z, 10, 14, 0x4a4038, 0.5, 2.5);
        e.n++;
      }
      if (st > 2.0) done(e, 1.0, c);
      return 0;
    }
    if (S === 'meteor') {
      if (!e.pts) { e.pts = []; for (let i = 0; i < 6; i++) { const a = R(0, TAU), r = i === 0 ? 0 : R(4, 13); e.pts.push([c.px + cos(a) * r, c.pz + sin(a) * r]); } }
      for (let i = 0; i < e.pts.length; i++) {
        const t0 = 1.0 + i * 0.16, p = e.pts[i];
        if (st < t0) Warn.circle(p[0], p[1], 6, st / t0);
        else if (e.n <= i) { e.n = i + 1; FX.explosion(p[0], p[1], 6, 'meteor'); slam(B, e, p[0], p[1], 6, { dmg: 1200, hero: 22, lift: 8, cause: 'quake', col: 0xff6020 }); }
      }
      if (st > 2.4) { e.pts = null; done(e, 1.2, c); }
      return 0;
    }
    return c.sp;
  },
  onPhase(B, e, m, ph) { e.cool = 0; },
};
const LIST_T = [['slam', 0, 15, 3], ['sweep', 0, 15, 3], ['stomp', 0, 11, 2], ['leap', 16, 70, 3], ['rock', 12, 70, 3], ['quakeline', 6, 34, 3, 1], ['meteor', 0, 40, 2.5, 2]];

// =====================================================================
// 処刑人ブッチャー
// =====================================================================
function sackTex() {
  return skinTexCustom('sack', (c, S) => {
    c.fillStyle = '#8a7a58'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 3) { c.fillStyle = `rgba(0,0,0,${R(0.05, 0.15)})`; c.fillRect(i, 0, 1, S); c.fillRect(0, i, S, 1); }
    c.fillStyle = '#100604';
    c.beginPath(); c.ellipse(S * 0.44, S * 0.45, 12, 15, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(S * 0.56, S * 0.45, 12, 15, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,60,20,0.95)';
    c.beginPath(); c.arc(S * 0.44, S * 0.46, 4, 0, 7); c.fill(); c.beginPath(); c.arc(S * 0.56, S * 0.46, 4, 0, 7); c.fill();
    for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(80,0,0,0.75)'; c.beginPath(); c.ellipse(R(0, S), R(S * 0.2, S), R(6, 18), R(6, 18), 0, 0, 7); c.fill(); }
  });
}
import { canvasTex } from './boss-kit.js';
function skinTexCustom(key, fn) { return canvasTex('c-' + key, 256, 256, fn); }

const butcher = {
  def: { name: '処刑人ブッチャー', title: '血まみれの処刑人', icon: '🔪', hp: 35200, speed: 3.4, r: 3.0, points: 3000, scale: 4.4, size: 11, tier: 1, S: 3.4, color: 0x6a4a3a },
  stride: 0.8, feet: { w: 0.3, f: 0.1, s: 0.9 },
  build(m) {
    const skin = mat(m, { map: skinTex('#a08478', { stitches: 5, wounds: 12 }), color: 0xffffff });
    const leather = mat(m, { map: skinTex('#3a2a20', { wounds: 3, veins: 0 }), color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
    const sack = mat(m, { map: sackTex(), color: 0xffffff, roughness: 1 });
    const steel = mat(m, { map: plateTex('#9aa0a8', { grid: 256, blood: 14 }), color: 0xffffff, metalness: 0.85, roughness: 0.3 });
    const wood = mat(m, { color: 0x3a2414, roughness: 0.8 });
    const G = new Rig(m);
    const hips = G.bone(null, 0, 1.45, 0);
    G.add(hips, lathe([[0, -0.35], [0.45, -0.3], [0.55, 0], [0.5, 0.2], [0, 0.25]], 12, (p) => { p.x *= 1.2; }), leather);
    const torso = G.bone(hips, 0, 0.12, 0);
    G.add(torso, lathe([[0.5, 0], [0.7, 0.25], [0.75, 0.5], [0.64, 0.85], [0.5, 1.05], [0.22, 1.18], [0, 1.2]], 16, (p) => {
      p.x *= 1 + 0.28 * sstep(0.5, 1, p.y); if (p.z < 0 && p.y < 0.75) p.z *= 1.3; p.z *= 0.85;
      if (p.y > 0.9) p.y -= 0.18 * min(1, (p.x / 0.6) ** 2);
    }), skin);
    G.add(torso, cyl(0.8, 0.92, 1.6, 16, true), leather, 0, -0.1, 0, 0, PI, 0, 1, 1, 1);   // 前かけ(まわり全部)
    for (let i = 0; i < 5; i++) G.add(torso, box(0.12, 0.02, 0.1), steel, -0.3 + i * 0.15, 0.25, -0.68);   // 前かけの 道具
    for (let i = 0; i < 4; i++) G.add(torso, spike(0.45, 0.04), steel, -0.3 + i * 0.2, 0.2, -0.7, PI, 0, 0);
    // 肉のかぎ(背中に何本も)
    for (let i = 0; i < 4; i++) G.add(torso, torus(0.14, 0.02, 5, 10, PI * 1.4), steel, -0.3 + i * 0.2, 0.95, 0.55, 0, PI / 2, 0);
    const head = G.bone(torso, 0, 1.12, -0.1);
    G.add(head, lathe([[0, -0.08], [0.16, -0.02], [0.2, 0.12], [0.21, 0.28], [0.15, 0.42], [0.04, 0.5], [0, 0.52]], 14, (p) => { if (p.y > 0.42) p.x += sin(p.z * 20) * 0.02; }), sack);
    G.add(head, torus(0.18, 0.03, 6, 14), wood, 0, 0, 0, PI / 2);
    const armR = G.bone(torso, 0.74, 0.92, 0), armL = G.bone(torso, -0.74, 0.92, 0);
    const fores = [];
    for (const a of [armL, armR]) {
      G.add(a, limb(0.7, 0.24, 0.19, 1.2), skin);
      const f = G.bone(a, 0, -0.7, 0); fores.push(f);
      G.add(f, limb(0.65, 0.2, 0.17, 1.2), skin);
      G.add(f, sph(0.18, 8, 8), skin, 0, -0.75, 0);
      G.add(f, cyl(0.21, 0.2, 0.3, 10), leather, 0, -0.4, 0);
    }
    // 大なた(とても大きい: 刃 2.2m)
    const cleaver = G.bone(fores[1], 0, -0.78, 0);
    G.add(cleaver, cyl(0.06, 0.07, 0.7, 8), wood, 0, 0, -0.1, PI / 2);
    G.add(cleaver, box(0.07, 0.95, 2.3), steel, 0, -0.3, -1.45);
    G.add(cleaver, box(0.09, 0.08, 2.3), steel, 0, 0.17, -1.45);
    // かぎ と 鎖
    const hook = G.bone(fores[0], 0, -0.85, 0);
    G.add(hook, torus(0.28, 0.045, 6, 14, PI * 1.4), steel, 0, -0.25, 0, 0, PI / 2, 0);
    for (let i = 0; i < 6; i++) G.add(fores[0], torus(0.06, 0.018, 4, 8), steel, 0.12, -0.1 - i * 0.11, 0, 0, i % 2 ? PI / 2 : 0, 0);
    const legL = G.bone(hips, -0.3, -0.1, 0), legR = G.bone(hips, 0.3, -0.1, 0);
    const knees = [];
    for (const leg of [legL, legR]) {
      G.add(leg, limb(0.68, 0.3, 0.23), leather);
      const kn = G.bone(leg, 0, -0.68, 0); knees.push(kn);
      G.add(kn, limb(0.62, 0.23, 0.18), leather);
      G.add(kn, box(0.32, 0.2, 0.55), leather, 0, -0.68, -0.1);
    }
    G.finish();
    m.j = { hips, torso, head, armL, armR, foreL: fores[0], foreR: fores[1], legL, legR, kneeL: knees[0], kneeR: knees[1], cleaver, hook };
  },
  anim(m, e, dt) {
    const j = m.j, st = e.st, S = e.state;
    walkPose(j, e, 1.45, min(1, e.spd / 2.2), { lean: -0.15 });
    j.cleaver.rotation.x = 0.2;
    j.armR.rotation.x += 0.3;
    if (S === 'enter' || S === 'roar') { roarPose(j, S === 'enter' ? 0.6 : min(1, st / 0.3), 0.05); j.armR.rotation.set(2.6, 0, 0.6); }
    else if (S === 'chop' || S === 'chop2') {
      const T = S === 'chop2' ? 0.55 : 0.8;
      const a = ease(min(1, st / T)), b = ease(seg(st, T, T + 0.12));
      j.armR.rotation.set(0.3 + 2.8 * a - 2.6 * b, 0, 0.2); j.foreR.rotation.x = 0.4 + 0.5 * a - 0.7 * b;
      j.torso.rotation.x = -0.15 + 0.35 * a - 0.75 * b; j.hips.position.y = 1.45 - 0.25 * b;
      j.cleaver.rotation.x = 0.2 + 0.6 * a - 0.6 * b;
      if (S === 'chop2' && st > T + 0.3) { const a2 = ease(seg(st, T + 0.3, T + 0.65)), b2 = ease(seg(st, T + 0.65, T + 0.77)); j.armR.rotation.x = 0.5 + 2.6 * a2 - 2.6 * b2; }
    } else if (S === 'sweep') {
      const a = ease(min(1, st / 0.65)), b = ease(seg(st, 0.65, 0.9));
      j.armR.rotation.set(1.3, 0, 0.3 + 1.0 * a - 1.9 * b); j.torso.rotation.y = 0.8 * a - 1.6 * b; j.cleaver.rotation.set(0.2, 0, 1.2);
    } else if (S === 'charge') {
      if (st < 0.7) { j.torso.rotation.x = -0.6; j.armR.rotation.set(2.4, 0, 0.6); j.foreR.rotation.x = 1.2; j.head.rotation.x = 0.4; j.hips.position.y = 1.3; }
      else { const r = sin(e.t * 14); j.torso.rotation.x = -0.75; j.legL.rotation.x = r * 1.0; j.legR.rotation.x = -r * 1.0; j.kneeL.rotation.x = -0.4 - 0.9 * max(0, cos(e.t * 14)); j.kneeR.rotation.x = -0.4 - 0.9 * max(0, -cos(e.t * 14)); j.armR.rotation.set(2.2, 0, 0.5); j.foreR.rotation.x = 1.0; j.armL.rotation.set(-r * 0.8, 0, -0.3); }
    } else if (S === 'hook') {
      const a = ease(min(1, st / 0.6));
      j.armL.rotation.set(0.3 + 2.2 * a - (st > 0.6 ? 1.8 * ease(seg(st, 0.6, 0.75)) : 0), 0, -0.3); j.foreL.rotation.x = 0.2;
      j.torso.rotation.y = -0.5 * a;
    } else if (S === 'spin') {
      j.armR.rotation.set(1.5, 0, 1.4); j.armL.rotation.set(1.5, 0, -1.4); j.cleaver.rotation.set(0.2, 0, 1.4);
      j.torso.rotation.y = 0; j.hips.rotation.y = 0;
    } else if (S === 'dead') { j.armR.rotation.set(1.6, 0, 1); j.armL.rotation.set(1.2, 0, -0.9); j.head.rotation.x = 0.5; }
    // 回転ぎり: 体ごと回る
    m.tilt.rotation.y = S === 'spin' ? (e.spinA || 0) : 0;
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_B); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'chop' || S === 'chop2') {
      const T = S === 'chop2' ? 0.55 : 0.8;
      if (st > T * 0.7 && !e.lockFace) lock(e, c);
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < T) Warn.rect(e.x + fx * 2, e.z + fz * 2, fx, fz, 18, 4.5, st / T);
      if (st > T + 0.1 && !e.hitDone) {
        e.hitDone = 1;
        line(B, e, e.x + e.ax * 2, e.z + e.az * 2, e.ax, e.az, 18, 4.5, { dmg: 1600, hero: 24, lift: 7, cause: 'cleaver', force: 26 });
        FX.slash(e.x + e.ax * 8, 0.6, e.z + e.az * 8, e.face, 0.5, 2, 12, 0xfff0e0, 0.3, 1, PI / 2, 3, 0.6, 0.5);
        Engine.hitStop(0.04);
      }
      if (S === 'chop2' && st > T + 0.3 && st < T + 0.65) { e.lockFace = false; const fx2 = sin(e.face), fz2 = -cos(e.face); Warn.rect(e.x + fx2 * 2, e.z + fz2 * 2, fx2, fz2, 18, 4.5, (st - T - 0.3) / 0.35); }
      if (S === 'chop2' && st > T + 0.75 && e.hitDone === 1) {
        e.hitDone = 2; lock(e, c);
        line(B, e, e.x + e.ax * 2, e.z + e.az * 2, e.ax, e.az, 18, 4.5, { dmg: 1600, hero: 24, lift: 7, cause: 'cleaver', force: 26 });
        FX.slash(e.x + e.ax * 8, 0.6, e.z + e.az * 8, e.face, 0.5, 2, 12, 0xfff0e0, 0.3, 1, PI / 2, 3, 0.6, 0.5);
      }
      if (st > (S === 'chop2' ? T + 1.3 : T + 0.7)) done(e, 0.9, c);
      return 0;
    }
    if (S === 'sweep') {
      if (st > 0.45 && !e.lockFace) lock(e, c);
      if (st < 0.7) Warn.cone(e.x, e.z, sin(e.face), -cos(e.face), 13, 1.35, st / 0.7);
      if (st > 0.72 && !e.hitDone) {
        e.hitDone = 1;
        cone(B, e, e.x, e.z, e.ax, e.az, 13, 1.35, { dmg: 1100, hero: 20, lift: 4, cause: 'cleaver', force: 28 });
        FX.slash(e.x, 3.2, e.z, e.face, 2.9, 3, 13, 0xffe8d0, 0.3, 1, 0.1, 3, 0.8, 0.6);
      }
      if (st > 1.2) done(e, 0.8, c);
      return 0.3;
    }
    if (S === 'charge') {
      if (st < 0.7) { const fx = sin(e.face), fz = -cos(e.face); Warn.rect(e.x, e.z, fx, fz, 44, 7, st / 0.7); return 0; }
      if (!e.lockFace) { lock(e, c); e.n = 0; act(e, 'charge'); }
      Warn.rect(e.x, e.z, e.ax, e.az, max(2, 44 - (st - 0.7) * 22), 7, 1);
      e.vx = e.ax * 22; e.vz = e.az * 22;
      B._Z.damageCircle(e.x + e.ax * 3, e.z + e.az * 3, 4, 900, { force: 30, cause: 'tank' });
      if (Math.random() < dt * 30) FX.smoke(e.x, 0.3, e.z, 1.2, 0.8, 0x6f6455, R(-2, 2), 1.5, R(-2, 2), 0.5);
      if (!e.hitDone && heroIn(B, e.x + e.ax * 2, e.z + e.az * 2, 4)) { e.hitDone = 1; hitHero(B, e, e.x, e.z, 26, 8, 'charge', e.ax * 0.7 - e.az * 0.7, e.az * 0.7 + e.ax * 0.7); }
      if (st > 0.7 + 44 / 22) { e.vx *= 0.2; e.vz *= 0.2; return begin(e, 'sweep'); }
      return -1;
    }
    if (S === 'hook') {
      if (st < 0.6) { Warn.rect(e.x, e.z, c.dx, c.dz, 34, 3, st / 0.6); e.hx = c.dx; e.hz = c.dz; return 0; }
      if (!e.hitDone) {
        e.hitDone = 1;
        const P = c.player;
        FX.beam(e.x, 4, e.z, e.x + e.hx * 34, 1.2, e.z + e.hx * 0 + e.hz * 34, 0xa0a0a8, 0.15, 0.35, 2, 1);
        line(B, e, e.x, e.z, e.hx, e.hz, 34, 3, { dmg: 500, hero: 0, cause: 'cleaver', force: -10, decal: false });
        // 当たったら 主人公を 引きよせる → すぐ 大なた
        const hx = P.pos.x - e.x, hz = P.pos.z - e.z, t = hx * e.hx + hz * e.hz;
        if (t > 0 && t < 34 && Math.abs(hx * -e.hz + hz * e.hx) < 2.5) { if (hitHero(B, e, e.x, e.z, 22, 3, 'hook', -e.hx, -e.hz)) { e.pulled = 1; } }
      }
      if (st > 1.0) { if (e.pulled) { e.pulled = 0; return begin(e, 'chop2'); } done(e, 0.8, c); }
      return 0;
    }
    if (S === 'spin') {
      const T = 2.6;
      e.spinA = (e.spinA || 0) + dt * 13;
      Warn.circle(e.x, e.z, 9, 1);
      if (Math.random() < dt * 20) FX.slash(e.x, 3, e.z, e.spinA, 2.0, 3, 9, 0xffe0d0, 0.18, 1, 0.1, 2, 0.6, 0.4);
      if ((e.n += dt) > 0.18) { e.n = 0; cone(B, e, e.x, e.z, 1, 0, 9, PI, { dmg: 500, hero: 18, lift: 5, cause: 'cleaver', force: 24 }); }
      if (st > T) { e.spinA = 0; done(e, 1.2, c); }
      return c.sp * 1.2;
    }
    return c.sp;
  },
};
const LIST_B = [['chop', 0, 15, 3], ['sweep', 0, 12, 3], ['charge', 12, 60, 3], ['hook', 10, 32, 2.5], ['chop2', 0, 15, 3, 1], ['spin', 0, 20, 3, 2]];

// =====================================================================
// 異形アボミネーション(腕 6 本・頭 3 つ。怒ると 頭が光る)
// =====================================================================
const abomination = {
  def: { name: '異形アボミネーション', title: '六本腕の悪夢', icon: '🧟', hp: 33600, speed: 3.4, r: 4.0, points: 3000, scale: 3.4, size: 10, tier: 1, S: 3.4, color: 0x7a5a5a },
  stride: 0.9, feet: { w: 0.9, f: -0.3, s: 0.7 }, fall: 'collapse', fallT: 1.3,
  build(m) {
    const flesh = mat(m, { map: skinTex('#a07a70', { boils: 34, wounds: 24, stitches: 3, rep: 2 }), color: 0xffffff, roughness: 0.5 });
    const skin = mat(m, { map: skinTex('#8a8a78', { wounds: 8 }), color: 0xffffff });
    const bone = mat(m, { color: BONE, roughness: 0.5 });
    const glow = mat(m, { color: 0x302010, emissive: 0xffd040, emissiveIntensity: 2.2, glow: true });
    const gut = mat(m, { color: 0x5a0a10, emissive: 0x8a1010, emissiveIntensity: 0.6, roughness: 0.3, glow: true });
    const G = new Rig(m);
    const body = G.bone(null, 0, 1.5, 0);
    G.add(body, blob(1.25, 0.18, 1, 26, 18), flesh, 0, 0, 0, 0, 0, 0, 1.05, 0.85, 1.15);
    G.add(body, blob(0.7, 0.2, 4, 16, 12), flesh, 0.5, 0.55, 0.4);
    G.add(body, blob(0.6, 0.2, 7, 16, 12), flesh, -0.55, 0.4, 0.5);
    // 口のような 裂け目(おなか)
    G.add(body, sph(0.45, 14, 10), gut, 0, -0.1, -1.05, 0, 0, 0, 1.3, 0.55, 0.4);
    for (let i = 0; i < 10; i++) G.add(body, spike(0.22, 0.04, 4), bone, -0.5 + i * 0.11, 0.12 * (i % 2 ? 1 : -1) - 0.1, -1.18, i % 2 ? PI : 0);
    for (let i = 0; i < 12; i++) { const a = R(0, TAU), b = R(0.2, 1.2); G.add(body, spike(R(0.4, 0.9), 0.08), bone, sin(a) * 0.9, b * 0.6, cos(a) * 0.9 + 0.2, cos(a) * 0.9 - 0.2, 0, -sin(a) * 0.9); }
    // 背中の 管
    for (let i = 0; i < 4; i++) G.add(body, tube([[R(-0.5, 0.5), 0.6, 0.6], [R(-0.8, 0.8), 1.3, 1.0], [R(-0.5, 0.5), 1.0, 1.4]], 0.07, 10, 5), gut);
    // 頭が 3 つ(怒ると あと 2 つ光る頭が ふくらむ)
    const heads = [];
    for (let i = 0; i < 5; i++) {
      const extra = i >= 3, x = extra ? (i === 3 ? -1.0 : 1.0) : (i - 1) * 0.6;
      const h = G.bone(body, x, extra ? 0.3 : 0.75 + (i === 1 ? 0.35 : 0), extra ? -0.6 : -0.95);
      G.add(h, lathe([[0, -0.15], [0.1, -0.1], [0.12, 0.05], [0.15, 0.18], [0.14, 0.3], [0.08, 0.38], [0, 0.4]], 10, (p) => { if (p.z < 0 && p.y < 0.1) p.z *= 1.3; }), skin, 0, 0, 0, 0, 0, 0, 1.3);
      for (const sx of [-1, 1]) G.add(h, sph(0.04, 6, 6), glow, sx * 0.07, 0.26, -0.17);
      G.add(h, sph(0.08, 8, 6), gut, 0, 0.04, -0.18, 0, 0, 0, 1.2, 1.6, 0.6);
      heads.push(h);
    }
    // 腕 6 本
    const arms = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + PI / 6;
      const base = G.bone(body, sin(a) * 1.0, -0.1, -cos(a) * 1.0);
      base.rotation.y = -a;
      const sh = G.bone(base, 0, 0, 0);
      G.add(sh, limb(1.2, 0.2, 0.15, 1.2), skin);
      const el = G.bone(sh, 0, -1.2, 0);
      G.add(el, limb(1.15, 0.16, 0.12, 1.2), skin);
      G.add(el, sph(0.18, 8, 6), skin, 0, -1.2, -0.05, 0, 0, 0, 1, 0.6, 1.5);
      for (let k = 0; k < 3; k++) G.add(el, spike(0.3, 0.035), bone, (k - 1) * 0.07, -1.25, -0.2, PI / 2 + 0.3);
      arms.push({ base, sh, el, a });
    }
    G.finish();
    m.j = { body, heads, arms };
  },
  onPhase(B, e, m, ph) {},
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, st = e.st, S = e.state;
    let by = 1.5 + 0.12 * sin(ph * 2);
    if (S === 'body') { if (st < 0.6) by = 1.5 - 0.5 * ease(st / 0.6); else by = 1.5 + max(0, e.y > 0 ? 1 : 0) * 0.4; }
    j.body.position.y = by;
    j.body.rotation.set(-0.1 + 0.05 * sin(ph * 2) + (S === 'vomit' ? -0.4 * ease(min(1, st / 0.5)) : 0), 0, 0.08 * sin(ph));
    const s = 1 + 0.05 * sin(t * 3.1) + (S === 'birth' ? 0.15 * sin(min(1, st / 0.8) * PI) : 0);
    j.body.scale.set(s, 2 - s, s);
    for (let i = 0; i < j.heads.length; i++) {
      const h = j.heads[i];
      h.rotation.x = 0.3 * sin(t * 1.3 + i * 2) - 0.1 + (S === 'roar' || S === 'enter' ? 0.6 : 0);
      h.rotation.z = (i - 1) * 0.3 + 0.1 * sin(t * 2 + i);
      const sc = i >= 3 ? min(1, e.phase * 0.9 + (e.phase > 0 ? e.rage * 0.1 : 0)) : 1;
      h.scale.setScalar(max(0.001, sc));
    }
    for (let i = 0; i < j.arms.length; i++) {
      const a = j.arms[i], g = ph + (i % 2) * PI;
      let x = 1.0 + 0.4 * sin(g), el = -0.85 - 0.35 * max(0, cos(g)), y = 0.35 * sin(g);
      if (S === 'flurry') { const p = (st * (e.phase > 1 ? 9 : 6) + i * 0.8) % 1; x = 2.4 - 1.8 * ease(p); el = -0.2; }
      else if (S === 'tentacle' && i < 3) { const a2 = ease(min(1, st / 0.7)); x = 1.0 + 0.8 * a2 + (st > 0.7 ? 0.6 : 0); el = -0.1 * a2; }
      else if (S === 'body' && st < 0.6) { x = 1.3; el = -1.2; }
      else if (S === 'roar' || S === 'enter') { x = 2.2 + 0.3 * sin(t * 12 + i); el = -0.3; }
      a.sh.rotation.set(x, y, 0);
      a.el.rotation.set(el, 0, 0);
    }
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    e.spawnT = (e.spawnT || 0) + dt;
    if (S === 'walk') {
      if (e.spawnT > (e.phase ? 7 : 10)) { e.spawnT = 0; return begin(e, 'birth'); }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_A); if (a) return begin(e, a); }
      return c.sp;
    }
    if (S === 'flurry') {
      const T = e.phase > 1 ? 0.14 : 0.2, n = Math.floor(st / T);
      const pts = e.fp || (e.fp = []);
      if (st < 0.01) pts.length = 0;
      while (pts.length < 10) { const a = e.face + R(-1.1, 1.1), r = R(4, 10); pts.push([e.x + sin(a) * r, e.z - cos(a) * r]); }
      for (let i = e.n; i < min(pts.length, n + 3); i++) Warn.circle(pts[i][0], pts[i][1], 3.6, (st - (i - 3) * T) / (3 * T));
      if (n >= 3 && e.n < min(8, n - 2)) {
        const p = pts[e.n]; e.n++;
        slam(B, e, p[0], p[1], 3.6, { dmg: 700, hero: 16, lift: 4, cause: 'boss', shake: 0.45 });
      }
      if (e.n >= 8) { e.fp = null; done(e, 0.9, c); }
      return 0.6;
    }
    if (S === 'body') {
      if (st < 0.6) { const [x, z] = lead(c, 0.9); e.tx = x; e.tz = z; Warn.circle(x, z, 9, st / 1.5); return 0; }
      if (!e.lockFace) { lock(e, c); const T = 0.9; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 14; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 9, st / 1.5);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 31 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.8 && e.y <= 0) { e.hitDone = 1; e.vx = e.vz = 0; slam(B, e, e.x, e.z, 9, { dmg: 1600, hero: 24, lift: 8, big: true, cause: 'slam' }); Gore.splat(e.x, e.z, 6, 0, 0, 1); }
        return -1;
      }
      if (st > 2.0) done(e, 1.0, c);
      return 0;
    }
    if (S === 'birth') {
      if (st > 0.8 && !e.hitDone) {
        e.hitDone = 1;
        const n = e.phase ? 9 : 6;
        for (let i = 0; i < n; i++) {
          const a = R(0, TAU);
          const z = B._Z.spawn(i % 3 ? 'crawler' : 'runner', e.x + cos(a) * 3.5, e.z + sin(a) * 3.5);
          if (z) { z.kx = cos(a) * 9; z.kz = sin(a) * 9; }
        }
        FX.burst({ x: e.x, y: 4, z: e.z, count: 60, color: 0x7a0808, speed: 12, up: 8, life: 0.9, size: 0.25 });
        Gore.splat(e.x, e.z, 7, 0, 0, 1);
        roarBlast(B, e, 9);
      }
      if (st > 1.3) done(e, 0.5, c);
      return 0;
    }
    if (S === 'tentacle') {
      if (!e.dirs) e.dirs = [];
      if (st < 0.7) {
        e.dirs.length = 0;
        for (let i = -1; i <= 1; i++) { const a = Math.atan2(c.dx, -c.dz) + i * 0.38 * (e.phase + 1) * 0.7; e.dirs.push([sin(a), -cos(a)]); }
        for (const d of e.dirs) Warn.rect(e.x, e.z, d[0], d[1], 24, 3.2, st / 0.7);
        return 0;
      }
      if (!e.hitDone) {
        e.hitDone = 1;
        for (const d of e.dirs) { line(B, e, e.x, e.z, d[0], d[1], 24, 3.2, { dmg: 900, hero: 20, lift: 5, cause: 'boss' }); FX.beam(e.x, 3, e.z, e.x + d[0] * 24, 0.5, e.z + d[1] * 24, 0x8a2020, 0.6, 0.25, 1.5, 1); }
      }
      if (st > 1.3) { e.dirs = null; done(e, 0.9, c); }
      return 0;
    }
    if (S === 'vomit') {
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.6) { Warn.cone(e.x, e.z, fx, fz, 18, 0.55, st / 0.6); return 0; }
      if (!e.lockFace) lock(e, c);
      Warn.cone(e.x, e.z, e.ax, e.az, 18, 0.55, 1);
      for (let i = 0; i < 4; i++) {
        const a = e.face + R(-0.5, 0.5), s = R(10, 20);
        FX.burst({ x: e.x + e.ax * 3, y: 3.5, z: e.z + e.az * 3, count: 1, color: 0x9ab030, speed: 0, up: 3, life: 0.9, size: 0.6, dirX: sin(a) * s / 6, dirZ: -cos(a) * s / 6, grav: 10, drag: 0.5 });
      }
      if ((e.n += dt) > 0.2) { e.n = 0; cone(B, e, e.x, e.z, e.ax, e.az, 18, 0.55, { dmg: 400, hero: 12, lift: 2, cause: 'acid', force: 10 }); Gore.splat(e.x + e.ax * R(5, 15), e.z + e.az * R(5, 15), 2.5, e.ax, e.az, 1.5, 0x5a7a10, 0.8); }
      if (st > 2.0) done(e, 1.0, c);
      return 0;
    }
    return c.sp;
  },
};
const LIST_A = [['flurry', 0, 11, 3], ['body', 8, 40, 3], ['tentacle', 6, 26, 3], ['vomit', 0, 18, 2, 1]];

// =====================================================================
// 大這い屍クローラー(長さ 19m。8 本の手足)
// =====================================================================
const crawlerKing = {
  def: { name: '大這い屍クローラー', title: '地を這う巨屍', icon: '🦂', hp: 36800, speed: 7.5, r: 3.6, points: 3000, scale: 2.4, size: 19, h: 6, zoom: 12, tier: 2, S: 3.2, color: 0x9a9080 },
  stride: 0.55, feet: { w: 1.6, f: -0.6, s: 0.6 }, turn: 3, fall: 'collapse', fallT: 1.2,
  build(m) {
    const skin = mat(m, { map: skinTex('#8e8676', { wounds: 18, stitches: 3, rep: 2 }), color: 0xffffff, roughness: 0.6 });
    const bone = mat(m, { color: BONE, roughness: 0.45 });
    const mouth = mat(m, { color: 0x300404, emissive: 0x6a0a0a, emissiveIntensity: 0.8, roughness: 0.4, glow: true });
    const eye = mat(m, { color: 0x302010, emissive: 0xff3a10, emissiveIntensity: 2.6, glow: true });
    const G = new Rig(m);
    const body = G.bone(null, 0, 1.1, 0);
    const tg = lathe([[0, -2.6], [0.3, -2.4], [0.55, -1.6], [0.62, -0.6], [0.72, 0.4], [0.78, 1.1], [0.55, 1.6], [0, 1.75]], 18, (p) => { p.x *= 1.25; if (p.z > 0) p.z *= 0.8; });
    tg.rotateX(-PI / 2);
    G.add(body, tg, skin);
    for (let i = 0; i < 11; i++) G.add(body, spike(R(0.35, 0.65), 0.09), bone, 0, 0.6, 2.3 - i * 0.45, 0.5);
    for (let i = 0; i < 7; i++) for (const sg of [-1, 1]) G.add(body, torus(0.7, 0.04, 5, 10, PI * 0.7), bone, 0, 0.05, 0.6 - i * 0.3, sg > 0 ? 0.2 : PI - 0.2, PI / 2, 0);
    // 背中の 顔(苦しむ人の顔が うまっている)
    for (let i = 0; i < 4; i++) G.add(body, sph(0.16, 8, 6), skin, R(-0.4, 0.4), 0.55, 1.6 - i * 0.7, 0, 0, 0, 1, 0.7, 1);
    const tail = G.bone(body, 0, 0.1, 2.4);
    G.add(tail, lathe([[0.4, 0], [0.32, 0.8], [0.2, 1.6], [0.05, 2.4], [0, 2.5]], 10), skin, 0, 0, 0, PI / 2);
    for (let i = 0; i < 5; i++) G.add(tail, spike(0.3, 0.06), bone, 0, 0.3, 0.3 + i * 0.4, 0.5);
    const head = G.bone(body, 0, 0.35, -1.75);
    G.add(head, lathe([[0, -0.2], [0.24, -0.15], [0.32, 0.05], [0.34, 0.25], [0.26, 0.42], [0, 0.48]], 14, (p) => { p.z *= 1.3; }), skin);
    for (const [x, y] of [[-0.12, 0.26], [0.12, 0.26], [-0.2, 0.18], [0.2, 0.18]]) G.add(head, sph(0.05, 6, 6), eye, x, y, -0.36);
    G.add(head, sph(0.24, 10, 8), mouth, 0, 0.02, -0.33, 0, 0, 0, 1, 0.75, 0.6);
    for (let i = 0; i < 9; i++) G.add(head, spike(0.13, 0.025, 4), bone, -0.17 + i * 0.043, -0.02, -0.46, PI);
    const jaw = G.bone(head, 0, -0.05, -0.1);
    G.add(jaw, box(0.48, 0.12, 0.55), skin, 0, -0.09, -0.24);
    for (let i = 0; i < 9; i++) G.add(jaw, spike(0.12, 0.025, 4), bone, -0.17 + i * 0.043, -0.03, -0.48);
    const legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, k = i % 4;
      const base = G.bone(body, side * 0.65, 0, -1.3 + k * 0.95);
      base.rotation.y = side < 0 ? PI : 0;
      const up = G.bone(base, 0, 0, 0);
      G.add(up, limbX(1.5, 0.16, 0.12, 1.15), skin);
      const kn = G.bone(up, 1.5, 0, 0);
      G.add(kn, limbX(1.75, 0.12, 0.07, 1.1), skin);
      G.add(kn, spike(0.45, 0.06), bone, 1.8, 0, 0, 0, 0, -PI / 2);
      legs.push({ base, up, kn, side, k });
    }
    G.finish();
    m.j = { body, head, jaw, legs, tail };
  },
  anim(m, e, dt) {
    const j = m.j, ph = e.ph, t = e.t, S = e.state, st = e.st;
    const air = (e.y || 0) > 0.2;
    j.body.position.y = 1.1 + 0.08 * sin(ph * 2) + (S === 'pounce' && st < 0.5 ? -0.4 * ease(st / 0.5) : 0);
    j.body.rotation.set(air ? 0.25 : S === 'bite' && st < 0.5 ? -0.25 : 0, 0, 0.05 * sin(ph));
    j.head.rotation.set(0.2 * sin(t * 2.1) + (S === 'roar' || S === 'enter' ? 0.6 : 0), 0.3 * sin(t * 1.3), 0);
    j.jaw.rotation.x = -(0.25 + 0.25 * sin(t * 5)) - (S === 'bite' || S === 'roar' ? 0.5 : 0);
    j.tail.rotation.set(0.1 * sin(t * 1.5), S === 'tail' ? (st < 0.5 ? -1.2 * ease(st / 0.5) : -1.2 + 2.6 * ease(seg(st, 0.5, 0.7))) : 0.35 * sin(ph * 0.7), 0);
    for (const L of j.legs) {
      const g = ph + (L.k % 2) * PI + (L.side > 0 ? PI : 0);
      const swing = air ? 0.6 : 0.4 * sin(g);
      const lift = air ? 0.75 : 0.45 + 0.35 * max(0, cos(g));
      L.up.rotation.set(0, swing * (L.side < 0 ? 1 : -1), lift);
      L.kn.rotation.set(0, 0, air ? -0.9 : -1.75);
    }
    if (S === 'tail') m.tilt.rotation.y = st < 0.5 ? 0.4 * ease(st / 0.5) : 0.4 - 1.0 * ease(seg(st, 0.5, 0.7));
    else m.tilt.rotation.y *= 0.9;
  },
  ai(B, e, m, dt, c) {
    const S = e.state, st = e.st;
    if (S === 'walk') {
      if (e.phase > 0 && (e.spawnT = (e.spawnT || 0) + dt) > 6) { e.spawnT = 0; for (let i = 0; i < 4 + e.phase * 2; i++) { const a = R(0, TAU); const z = B._Z.spawn('crawler', e.x + cos(a) * 3, e.z + sin(a) * 3); if (z) { z.kx = cos(a) * 8; z.kz = sin(a) * 8; } } FX.burst({ x: e.x, y: 3, z: e.z, count: 30, color: 0x7a0808, speed: 9, up: 7, life: 0.8, size: 0.2 }); }
      if (e.cool <= 0) { const a = pick(e, c.d, LIST_C); if (a) return begin(e, a); }
      const zig = sin(e.t * 2.1) * 0.65;
      const dx = c.mx * cos(zig) - c.mz * sin(zig), dz = c.mx * sin(zig) + c.mz * cos(zig);
      e.vx += (dx * c.sp - e.vx) * 0.06; e.vz += (dz * c.sp - e.vz) * 0.06;
      return -1;
    }
    if (S === 'pounce') {
      if (st < 0.5) { const [x, z] = lead(c, 0.9); e.tx = x; e.tz = z; Warn.circle(x, z, 8, st / 1.4); return 0; }
      if (!e.lockFace) { e.face = Math.atan2(e.tx - e.x, -(e.tz - e.z)); lock(e, c); const T = 0.85; e.lx = (e.tx - e.x) / T; e.lz = (e.tz - e.z) / T; e.vy = 13; act(e, 'jump'); }
      Warn.circle(e.tx, e.tz, 8, st / 1.4);
      if (!e.hitDone) {
        e.vx = e.lx; e.vz = e.lz; e.vy -= 30 * dt; e.y = max(0, e.y + e.vy * dt);
        if (st > 0.7 && e.y <= 0) {
          e.hitDone = 1; e.vx *= 0.2; e.vz *= 0.2; slam(B, e, e.x, e.z, 8, { dmg: 1400, hero: 24, lift: 8, big: true, cause: 'leap' });
          if (e.phase >= 2 && (e.combo = (e.combo || 0) + 1) < 3) { e.cool = 0; e.last = ''; return begin(e, 'pounce'); }
          e.combo = 0;
        }
        return -1;
      }
      if (st > 1.8) done(e, 0.9, c);
      return 0;
    }
    if (S === 'bite') {
      const fx = sin(e.face), fz = -cos(e.face);
      if (st < 0.55) { Warn.rect(e.x, e.z, fx, fz, 26, 6, st / 0.55); return 0; }
      if (!e.lockFace) { lock(e, c); act(e, 'charge'); }
      if (st < 1.25) {
        e.vx = e.ax * 30; e.vz = e.az * 30;
        B._Z.damageCircle(e.x + e.ax * 5, e.z + e.az * 5, 4, 1000, { force: 26, cause: 'bite' });
        if (!e.hitDone && heroIn(B, e.x + e.ax * 5, e.z + e.az * 5, 4)) { e.hitDone = 1; hitHero(B, e, e.x, e.z, 24, 7, 'bite', e.ax - e.az * 0.6, e.az + e.ax * 0.6); }
        if (Math.random() < dt * 30) FX.smoke(e.x, 0.3, e.z, 1, 0.8, 0x6f6455, 0, 1.5, 0, 0.5);
        return -1;
      }
      e.vx *= 0.85; e.vz *= 0.85;
      if (st > 1.6) done(e, 0.8, c);
      return -1;
    }
    if (S === 'tail') {
      if (st < 0.5) { Warn.circle(e.x, e.z, 13, st / 0.5); return 0; }
      if (!e.hitDone) { e.hitDone = 1; cone(B, e, e.x, e.z, 1, 0, 13, PI, { dmg: 900, hero: 20, lift: 5, cause: 'sweep', force: 28 }); FX.slash(e.x, 1.5, e.z, e.face + PI, 4, 4, 13, 0xffd0a0, 0.35, -1, 0, 2, 0.8, 0.3); quake(B, e.x, e.z, 0.8); }
      if (st > 1.0) done(e, 0.7, c);
      return 0;
    }
    return c.sp;
  },
};
const LIST_C = [['pounce', 7, 34, 3], ['bite', 8, 30, 3], ['tail', 0, 12, 3]];

export const CLASSIC = { tyrant, butcher, abomination, crawlerKing };
