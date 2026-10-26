// 武器係: 第2弾の武器の「撃ち方」。weapons.js の _fire / _stream から呼ばれる。
// W = Weapons(狙い・銃口などの道具を持っている)、w = 武器の数字(フィーバー中は強くした写し)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Proj, GRAV } from './weapon-proj.js';
import { Summon, RAINBOW } from './weapon-summon.js';
import { VM } from './weapon-view.js';
import { hurt, area, LOW } from './weapon-hit.js';
import { sawTint } from './weapon-models.js';
import { angleDiff } from './util.js';

const rnd = Math.random;
const _list = [], _near = [], _cp = { x: 0, z: 0 };
const _r0 = new THREE.Vector3(), _r1 = new THREE.Vector3();
function wallDamage(x, z, r, amount, cause) { if (World.damage) World.damage(x, z, r, amount, { cause }); }
// 一人称・肩越しで 上下の向きから 弾の上下の速さ(下を向けば 地面へ)
function slope(W) { return W.close ? Math.max(-0.6, Math.min(0.15, Math.tan(Engine.lookPitch))) : 0; }

export const Extra = {
  orbIdle: 1, orb: { x: 0, z: 0 }, _decT: 0, _sawSfx: 0,

  reset() { this.orbIdle = 1; const S = this.saw; S.blood = 0; S.lungeT = 0; S.tgt = null; S.vic = null; S.base = 0; S.sweep = 0; },

  // 1 発ずつ撃つ武器。撃たなかったら false
  fire(W, w, player, m, dx, dz) {
    switch (w.kind) {
      case 'hammer': return this.hammer(W, w, player, m, dx, dz);
      case 'disc': return this.disc(W, w, player, m, dx, dz);
      case 'crossbow': return this.crossbow(W, w, player, m, dx, dz);
      case 'airstrike': return this.airstrike(W, w, player, m, dx, dz);
      case 'cannon': return this.cannon(W, w, player, m, dx, dz);
      case 'tornado': return this.tornado(W, w, player, m, dx, dz);
      case 'meteor': return this.meteor(W, w, player, m, dx, dz);
      case 'acid': return this.acid(W, w, player, m, dx, dz);
      case 'shuriken': return this.shuriken(W, w, player, m, dx, dz);
      case 'drone': return this.drone(W, w, player, m, dx, dz);
      case 'emp': return this.emp(W, w, player, m, dx, dz);
    }
    return true;
  },

  // 押しつづける武器
  stream(W, w, dt, player, m, dx, dz, tick) {
    if (w.kind === 'chainsaw') this.chainsaw(W, w, dt, player, m, dx, dz, tick);
    else if (w.kind === 'orbital') this.orbital(W, w, dt, player, m, dx, dz, tick);
  },

  // ================= 雷神ハンマー: 地面をたたいて衝撃波 + 空から雷がまわりの敵に落ちる =================
  hammer(W, w, player, m, dx, dz) {
    const pt = W._aimPoint(w, player, dx, dz, w.range, 2.5, 9);
    const x = pt.x, z = pt.z, R = w.radius;
    const k = area(x, z, R, w.dmg, w.force, 'slam', true, true);
    FX.explosion(x, z, R * 0.5, 'elec');
    FX.ring(x, z, 0.5, R * 1.5, 0.6, 0x9ad8ff, 0.7, 3, 1, 0);
    FX.ring(x, z, 0.3, R * 1.1, 0.35, 0xffffff, 0.25, 4, 1, 0);
    FX.debris(x, 0.3, z, 20, 13, 0x5a5048, 0.2, 2.4);
    FX.decal(x, z, 3.2, 'scorch', 22);
    const nd = FX.q(18);
    for (let i = 0; i < nd; i++) { const a = (i / nd) * Math.PI * 2; FX.smoke(x + Math.cos(a), 0.3, z + Math.sin(a), 0.5, 0.9, 0x6a6052, Math.cos(a) * 14, 0.5, Math.sin(a) * 14, 0.5); }
    // 目の前に大きな雷
    const top = FX.skyTop(x, z, 45);
    FX.bolt(x, top, z, x, 0.1, z, 0xd8f0ff, 0.35, 0.22, 2.2, 10);
    FX.bolt(x, top, z, x, 0.1, z, 0x80c0ff, 0.6, 0.15, 3, 8);
    // まわりの敵へ 雷が落ちる
    Zombies.queryCircle(x, z, w.boltRange, _list);
    const n = _list.length, step = Math.max(1, n / w.bolts);
    let b = 0;
    for (let f = rnd() * step; f < n && b < w.bolts; f += step, b++) {
      const e = _list[Math.floor(f)];
      if (!e.alive) continue;
      const tp = FX.skyTop(e.x, e.z, 40), ey = 1.1 * ((e.def && e.def.scale) || 1);
      FX.bolt(e.x + (rnd() - 0.5) * 2, tp, e.z + (rnd() - 0.5) * 2, e.x, ey, e.z, 0xc8e8ff, 0.16, 0.2, 1.4, 8);
      for (let j = 0; j < 5; j++) FX.spark(e.x, ey, e.z, (rnd() - 0.5) * 10, rnd() * 6, (rnd() - 0.5) * 10, 0.35, 0.05, 0xe0f4ff, 6, 0x4080ff, 2);
      FX.ring(e.x, e.z, 0.2, 2.2, 0.3, 0x9ad0ff, 0.25, 3, 1, 0);
      const ddx = e.x - x, ddz = e.z - z, dd = Math.hypot(ddx, ddz) || 1;
      e.shock = Math.max(e.shock || 0, 1.6);
      hurt(e, w.boltDmg, ddx / dd, ddz / dd, w.force * 0.5, 'lightning');
    }
    _list.length = 0;
    FX.flash(x, 7, z, 0xa0d0ff, 120, 34, 0.4);
    wallDamage(x, z, R, w.dmg, 'slam');
    Engine.hitStop(0.07);
    VM.chop();
    Events.emit('explosion', { x, z, radius: R, weapon: w.id, kills: k });
    Events.emit('weaponSfx', { name: 'thunder', x, z });
    return true;
  },

  // ================= EMP 衝撃波: まわりの敵を ぜんぶ しびれさせて ふき飛ばす =================
  emp(W, w, player) {
    const px = player.pos.x, pz = player.pos.z, R = w.radius;
    FX.ring(px, pz, 0.5, R * 1.15, 0.55, 0x7ab8ff, 0.9, 3.5, 1, 0, 0.3);
    FX.ring(px, pz, 0.3, R * 0.95, 0.4, 0xffffff, 0.25, 3, 1, 0, 1.2);
    FX.ring(px, pz, 0.3, R * 0.7, 0.3, 0x4a90ff, R * 0.6, 0.8, 0.5, 1, 0.15);
    const ns = FX.q(46);
    for (let i = 0; i < ns; i++) { const a = (i / ns) * Math.PI * 2, s = 18 + rnd() * 12; FX.spark(px, 1.2, pz, Math.cos(a) * s, rnd() * 2, Math.sin(a) * s, 0.45, 0.06, 0xd0e8ff, 6, 0x3a70ff, 2, 0.03, 0, 2.2, 0); }
    Zombies.queryCircle(px, pz, R, _list);
    let arcs = 0;
    for (let i = 0; i < _list.length; i++) {
      const e = _list[i];
      const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez) || 0.01, f = 1 - d / (R + 1);
      e.shock = Math.max(e.shock || 0, 2.6);
      e.stun = Math.max(e.stun || 0, e.boss ? 0.4 : 1.5);
      hurt(e, w.dmg * (0.5 + 0.5 * f), ex / d, ez / d, w.force * f + 6, 'shock');
      if (arcs < 14 && rnd() < 0.6) { arcs++; FX.bolt(px, 1.3, pz, e.x, 1.1, e.z, 0x9ad0ff, 0.07, 0.16, 0.8, 6); }
    }
    _list.length = 0;
    FX.flash(px, 3, pz, 0x80b0ff, 110, R * 2, 0.35);
    wallDamage(px, pz, R * 0.6, w.dmg, 'emp');
    Engine.hitStop(0.05);
    if (W.close) VM.spin(0x7ab8ff);
    return true;
  },

  // ================= 丸ノコ: 壁ではね返り、敵を切りきざむ =================
  disc(W, w, player, m, dx, dz) {
    const n = w.fever ? 3 : 1, y = Math.max(0.7, Math.min(1.5, m.y));
    for (let i = 0; i < n; i++) {
      const a = W.aimAngle + (i - (n - 1) / 2) * 0.2 + (rnd() - 0.5) * 0.03;
      const sp = 34;
      const p = Proj.spawn('disc', w, m.x, y, m.z, Math.sin(a) * sp, 0, -Math.cos(a) * sp, player.pos.x, player.pos.z);
      if (!p) break;
    }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xe0f0ff, 1.1);
    return true;
  },

  // ================= 爆発ボウガン: 刺さって 少しして爆発 =================
  crossbow(W, w, player, m, dx, dz) {
    const n = w.fever ? 3 : 1, sp = 78;
    let vy = slope(W) * sp;
    if (!W.close && W.target) { const d = Math.hypot(W.target.x - m.x, W.target.z - m.z) || 1; vy = (1.1 - m.y) / (d / sp); }
    for (let i = 0; i < n; i++) {
      const a = W.aimAngle + (i - (n - 1) / 2) * 0.07;
      Proj.spawn('bolt', w, m.x, m.y, m.z, Math.sin(a) * sp, vy, -Math.cos(a) * sp, player.pos.x, player.pos.z);
    }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xff8060, 0.6, false);
    return true;
  },

  // ================= 空爆要請: 戦闘機が 狙った線に爆弾を ずらっと落とす =================
  airstrike(W, w, player, m, dx, dz) {
    const pt = W._aimPoint(w, player, dx, dz, 22, 8, w.range);
    const ok = Summon.callJet(w, player.pos.x, player.pos.z, dx, dz, pt.d, bombFn);
    if (ok) { FX.ring(pt.x, pt.z, 1, 7, 0.8, 0xff3030, 0.4, 3, 1, 0); FX.muzzle(m.x, m.y, m.z, dx, dz, 0xff3030, 0.6, false); }
    return ok;
  },
  // 押している間: 赤いレーザーで目標を指す(毎フレーム)
  designate(W, w, player, m, dx, dz) {
    const pt = W._aimPoint(w, player, dx, dz, 22, 8, w.range);
    const fl = 0.8 + rnd() * 0.4;
    FX.beam(m.x, m.y, m.z, pt.x, 0.1, pt.z, 0xff2020, 0.035 * fl, -1, 4, 0.9);
    FX.glow(pt.x, 0.15, pt.z, 0.35 * fl, 0xff3030, 4, 2);
    const t = performance.now() * 0.004;
    FX.ring(pt.x, pt.z, 0, 1.6 + Math.sin(t * 3) * 0.2, -1, 0xff3030, 0.12, 2.5, 0.8, 0, 0.1);
    // 爆弾が落ちる線の目安
    const n = w.bombs, gap = 4.4, start = Math.max(6, pt.d - gap * (n - 1) / 2);
    for (let i = 0; i < n; i += 2) { const d = start + i * gap; FX.ring(player.pos.x + dx * d, player.pos.z + dz * d, 0, 0.6, -1, 0xff4040, 0.1, 1.5, 0.35, 0, 0.1); }
  },

  // ================= 戦車砲: 敵をはね飛ばしながら進む巨大な弾 → 大爆発 =================
  cannon(W, w, player, m, dx, dz) {
    const sp = 88;
    const t = W._aoeE || W.target;
    const dist = t ? Math.max(6, Math.hypot(t.x - player.pos.x, t.z - player.pos.z) + 1.5) : w.range;
    const p = Proj.spawn('shell', w, m.x, Math.max(0.9, m.y), m.z, dx * sp, slope(W) * sp, dz * sp, player.pos.x, player.pos.z);
    if (p) p.ty = dist;
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0xffb050, 3.2);
    for (let i = 0; i < FX.q(12); i++) { const a = rnd() * Math.PI * 2; FX.smoke(m.x + dx * 0.6, m.y, m.z + dz * 0.6, 0.6, 1.4 + rnd() * 0.6, 0xa09a92, dx * 6 + Math.cos(a) * 5, Math.sin(a) * 3, dz * 6 + Math.sin(a) * 5, 0.55); }
    FX.ring(player.pos.x, player.pos.z, 0.5, 6, 0.4, 0xffd0a0, 0.3, 1.5, 1, 0);
    FX.flash(m.x, 2.5, m.z, 0xffa050, 120, 22, 0.25);
    Engine.hitStop(0.03);
    return true;
  },

  // ================= 竜巻発生器 =================
  tornado(W, w, player, m, dx, dz) {
    if (Proj.count('tornado') >= w.max) return false;
    const pt = W._aimPoint(w, player, dx, dz, 12, 5, w.range);
    const px = player.pos.x, pz = player.pos.z;
    const p = Proj.spawn('tornado', w, px + dx * 3, 0, pz + dz * 3, dx * 7, 0, dz * 7, px, pz);
    if (p) { p.tx = pt.x; p.tz = pt.z; }
    FX.ring(px + dx * 3, pz + dz * 3, 0.3, 4, 0.4, 0xd0dae4, 0.3, 2, 1, 0);
    for (let i = 0; i < FX.q(10); i++) FX.smoke(m.x, m.y, m.z, 0.3, 0.6, 0xc0c8d0, dx * 8 + (rnd() - 0.5) * 4, rnd() * 2, dz * 8 + (rnd() - 0.5) * 4, 0.4);
    return true;
  },

  // ================= 隕石召喚: 空から燃える岩が いくつも落ちる =================
  meteor(W, w, player, m, dx, dz) {
    const pt = W._aimPoint(w, player, dx, dz, 18, 7, w.range);
    const n = w.count;
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? 0 : 2 + rnd() * 4, a = rnd() * Math.PI * 2;
      const tx = pt.x + Math.cos(a) * r, tz = pt.z + Math.sin(a) * r;
      const side = (rnd() - 0.5) * 16;
      const sx = tx - dx * 18 - dz * side, sz = tz - dz * 18 + dx * side, sy = 34 + rnd() * 12;
      const T = 0.75 + rnd() * 0.2;
      const p = Proj.spawn('meteor', w, sx, sy, sz, (tx - sx) / T, (0.3 - sy) / T, (tz - sz) / T, sx, sz);
      if (!p) break;
      p.tick = i * 0.16; p.ty = 0.8 + rnd() * 0.6;
      FX.ring(tx, tz, 0.5, w.radius * 0.7, T + p.tick, 0xff5020, 0.25, 2, 0.8, 0);
    }
    FX.glow(m.x, m.y, m.z, 0.5, 0xff8030, 4);
    for (let k = 0; k < 6; k++) FX.spark(m.x, m.y, m.z, (rnd() - 0.5) * 3, 3 + rnd() * 4, (rnd() - 0.5) * 3, 0.5, 0.05, 0xffc060, 5, 0xff4010, 2, 0.03, -2);
    Events.emit('weaponSfx', { name: 'meteorFall', x: pt.x, z: pt.z });
    return true;
  },

  // ================= 酸の銃: 酸を投げて、とける水たまり =================
  acid(W, w, player, m, dx, dz) {
    const n = w.fever ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const pt = W._aimPoint(w, player, dx, dz, 13, 4, w.range);
      const tx = pt.x + (rnd() - 0.5) * 2.4, tz = pt.z + (rnd() - 0.5) * 2.4;
      const d = Math.hypot(tx - m.x, tz - m.z);
      const T = 0.22 + d * 0.02;
      const vx = (tx - m.x) / T, vz = (tz - m.z) / T, vy = (0.1 - m.y + 0.5 * GRAV * T * T) / T;
      Proj.spawn('acid', w, m.x, m.y, m.z, vx, vy, vz, player.pos.x, player.pos.z);
    }
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0x8aff3a, 0.8, false);
    return true;
  },

  // ================= 手裏剣: 何枚も投げ、敵を追いかけて次々に切る =================
  shuriken(W, w, player, m, dx, dz) {
    const px = player.pos.x, pz = player.pos.z;
    Zombies.queryCircle(px, pz, w.range, _list);
    let n = 0;
    for (let i = 0; i < _list.length; i++) { const e = _list[i]; const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez) || 1; if ((ex * dx + ez * dz) / d > 0.35) _list[n++] = e; }
    _list.length = n;
    const c = w.count;
    for (let i = 0; i < c; i++) {
      let e = n ? _list[Math.floor(rnd() * Math.min(n, 24))] : null;
      if (i === 0 && W.target) e = W.target;
      if (e && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.97) e = null;
      const a = W.aimAngle + (i - (c - 1) / 2) * 0.32;
      const p = Proj.spawn('shuriken', w, m.x, Math.max(0.8, Math.min(1.5, m.y)), m.z, Math.sin(a) * 36, 0, -Math.cos(a) * 36, px, pz);
      if (!p) break;
      p.spd = 36; p.target = e; if (e) e._sht = p.stamp;
    }
    _list.length = 0;
    return true;
  },

  // ================= 攻撃ドローン =================
  drone(W, w, player, m, dx, dz) {
    Summon.summonDrone(w, m.x, m.y + 0.4, m.z);
    FX.muzzle(m.x, m.y, m.z, dx, dz, 0x5affd0, 0.5, false);
    return true;
  },

  // ================= チェーンソー: 刃に さわった敵だけを 斬る(近づいた敵を 無双する) =================
  // - 当たりは 見えている刃(手に持った形の 根元〜先、主人公から 約 0.8〜2m)だけ。さわっていない敵は 死なない
  // - 押している間: 近く(range m)の敵へ 自分から 短く飛びこむ / 刃を 敵から敵へ 大きく横にふる(sweep)
  // - 刃が さわると 食いこんで止まる(sink 秒。火花と血)→ まっぷたつ(倒れ方は zombie-gore.js の 'blade')
  // - 斬るほど 刃が血で赤黒くなる(ゆっくり もどる)。一人称では 画面に 小さな血しぶき
  // 状態は saw に まとめる(毎フレーム new しない)
  saw: {
    ph: 0, base: 0, sweep: 0, prev: 0, vicOff: 0, vic: null, lungeT: 0, lungeCool: 0, lvx: 0, lvz: 0, blood: 0, hsT: 0,
    tgt: null, tgtD: 99, contact: 0, time: 0, firing: false, log: null, nLunge: 0, r0: _r0, r1: _r1,
  },

  // 毎フレーム(撃っていなくても)weapons.js が呼ぶ: 刃のふり・血のもどり・手の武器の向き
  // 刃の向き(sweep)= 体の向きからの角度。とどく敵(vic)がいれば その敵へ すばやく ふる → 食いこんだら 細かく ふるえて けずる
  sawAnim(W, dt, firing, player, mdl) {
    const S = this.saw, fps = Engine.viewMode === 'fps';
    S.firing = firing;
    S.hsT -= dt;
    S.blood = Math.max(0, S.blood - dt * (S.blood > 0.6 ? 0.06 : 0.035));
    if (!firing) { S.lungeT = 0; S.tgt = null; S.vic = null; S.contact = 0; }
    const lim = fps ? 0.6 : (W.current.sweep || 0.85) * (Engine.viewMode === 'tps' ? 1.3 : 1.6);
    const want = firing && S.vic ? Math.max(-lim, Math.min(lim, S.vicOff)) : 0;
    const mv = (firing ? (W.fever ? 20 : 15) : 5) * dt, d = want - S.base;
    S.base += Math.max(-mv, Math.min(mv, d));
    // 食いこんでいる間は 小さく速く ふるえる / 敵がいないときは ゆっくり 小さく ふる(空ぶかし)
    S.ph += dt * (S.contact ? 30 : 7);
    const wob = !firing ? 0 : S.contact ? 0.05 : S.vic ? 0.08 : 0.3;
    S.prev = S.sweep;
    S.sweep = S.base + wob * Math.sin(S.ph);
    if (mdl) { mdl.rotation.y = -S.sweep; mdl.rotation.z = S.contact ? Math.sin(S.ph * 1.7) * 0.05 : 0; sawTint(mdl.userData, S.blood); }
    VM.sawYaw = S.sweep; VM.sawBlood = S.blood;
  },

  chainsaw(W, w, dt, player, m, dx, dz, tick) {
    const S = this.saw, px = player.pos.x, pz = player.pos.z;
    const close = W.close, fps = Engine.viewMode === 'fps';
    // ---- 刃の位置(見えている形から)。根元 r0 → 先 r1(世界の座標) ----
    const mdl = W._models[W.index];
    if (mdl && mdl.parent && player.aiming && !(player._spin > 0)) {
      mdl.updateWorldMatrix(true, false);
      _r0.set(0, 0.03, -0.12).applyMatrix4(mdl.matrixWorld);
      _r1.copy(mdl.userData.tips[0]).applyMatrix4(mdl.matrixWorld);
    } else {
      const f = player.facing, a = f + S.sweep;
      const gx = px + Math.sin(f) * 0.66 + Math.cos(f) * 0.38, gz = pz - Math.cos(f) * 0.66 + Math.sin(f) * 0.38;
      _r0.set(gx + Math.sin(a) * 0.16, 1.4, gz - Math.cos(a) * 0.16);
      _r1.set(gx + Math.sin(a) * 1.4, 1.4, gz - Math.cos(a) * 1.4);
    }
    const bx0 = _r0.x, bz0 = _r0.z;
    let ux = _r1.x - bx0, uz = _r1.z - bz0;
    const L = Math.hypot(ux, uz) || 1;
    ux /= L; uz /= L;
    const by = Math.max(0.8, Math.min(1.5, _r1.y));
    // 刃が動く向き(ふっている向き)= 斬った体が飛ぶ向き
    const sgn = S.sweep - S.prev >= 0 ? 1 : -1;
    const tx = -uz * sgn, tz = ux * sgn;
    // カメラの方(血しぶきを こちらへ)
    const cam = Engine.camera.position;

    // ---- 近くの敵(飛びこむ相手)をさがす ----
    const vx = close ? Engine.viewDir.x : dx, vz = close ? Engine.viewDir.z : dz;
    const mvx = player.vel.x, mvz = player.vel.z, mv = Math.hypot(mvx, mvz);
    Zombies.queryCircle(px, pz, w.range + 1.5, _near);
    let tgt = null, ts = 1e9, td = 99;
    S.time += dt;
    for (let i = 0; i < _near.length; i++) {
      const e = _near[i];
      if (!e.alive || (e.y || 0) > 2) continue;
      const ex = e.x - px, ez = e.z - pz, d = Math.hypot(ex, ez) || 0.01;
      if (d > w.range + e.r) continue;
      const cf = (ex * vx + ez * vz) / d;
      if (close && d > 1.5 && cf < 0.55) continue;           // 肩越し・一人称: 見ている方(照準の側)の敵だけ
      // 見下ろし: 刃が いま何にも さわっていなければ、いちばん近い敵へ すぐ向きを変える(かこまれても 次々に斬る)
      let sc = d - cf * (close ? 1.5 : S.contact ? 1 : 0.25);
      if (!close && mv > 1) sc -= 1.2 * (ex * mvx + ez * mvz) / (d * mv);   // 見下ろし: 進む方を少し優先
      if (e.boss) sc -= 1;
      if (sc < ts) { ts = sc; tgt = e; td = d; }
    }
    if (tgt && td > 1.6 && World.segmentHit(px, pz, tgt.x, tgt.z, LOW) < 0.97) { tgt = null; td = 99; }
    S.tgt = tgt; S.tgtD = td;
    // 刃でとどく敵(vic): 食いこんでいる敵は 倒すまで そのまま。いなければ 刃の今の向きから いちばん近い角度の敵へ
    {
      const f = player.facing, gx = px + Math.sin(f) * 0.66 + Math.cos(f) * 0.38, gz = pz - Math.cos(f) * 0.66 + Math.sin(f) * 0.38;
      const lim = fps ? 0.7 : 1.6;
      let best = null, bs = 1e9, bo = 0;
      for (let i = 0; i < _near.length; i++) {
        const e = _near[i];
        if (!e.alive || (e.y || 0) > 1.6) continue;
        const ex = e.x - gx, ez = e.z - gz, dg = Math.hypot(ex, ez);
        if (dg > 1.45 + e.r) continue;
        const off = angleDiff(f, Math.atan2(ex, -ez));
        if (Math.abs(off) > lim) continue;
        let sc = Math.abs(off - S.base) * 0.7 + dg * 0.25;
        if (e === S.vic) sc -= 0.25;
        if (S.time - (e._sawT || -9) < 0.06) sc -= 2;     // いま けずっている敵
        if (sc < bs) { bs = sc; best = e; bo = off; }
      }
      // 次の敵へ 大きく ふる: 刃の通り道に 赤い光の弧(一人称は出さない)
      if (best && best !== S.vic && !fps && Math.abs(bo - S.base) > 0.6) {
        const a0 = f + S.base, a1 = f + bo, dir = a1 > a0 ? 1 : -1;
        FX.slash(px, 1.35, pz, (a0 + a1) / 2, Math.abs(a1 - a0) + 0.3, 0.9, 2.1, 0xff3a1a, 0.14, dir, 0, 1.6, 0.7, 0.18);
      }
      S.vic = best; if (best) S.vicOff = bo;
    }

    // ---- 刃に さわっている敵 ----
    let hits = 0, kills = 0, bossHit = false;
    for (let i = 0; i < _near.length; i++) {
      const e = _near[i];
      if (!e.alive || (e.y || 0) > 1.6) continue;
      const ex = e.x - bx0, ez = e.z - bz0;
      const t = Math.max(0.05, Math.min(L, ex * ux + ez * uz));
      const cx = bx0 + ux * t, cz = bz0 + uz * t;
      const ox = e.x - cx, oz = e.z - cz;
      const rr = e.r + 0.14;
      if (ox * ox + oz * oz > rr * rr) continue;
      if (t > 0.9 && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.97) continue;   // 壁ごしは 斬らない
      hits++;
      // 食いこむ: さわっている時間を足していく(刃が行き来しても 0.4 秒以内なら 続き)
      if (S.time - (e._sawT || -9) > 0.4) e._sawA = 0;
      e._sawT = S.time;
      e._sawA = (e._sawA || 0) + dt;
      const sc = (e.def && e.def.scale) || 1;
      const cy = Math.min(by, 1.25 * sc);
      if (!e.boss) { e.stun = Math.max(e.stun || 0, 0.18); e.kx *= 0.4; e.kz *= 0.4; }
      else bossHit = true;
      // 火花(刃が骨に当たる)
      if (rnd() < 0.55) FX.spark(cx, cy, cz, tx * 4 + (rnd() - 0.5) * 3, 1 + rnd() * 3.5, tz * 4 + (rnd() - 0.5) * 3, 0.16 + rnd() * 0.1, 0.035, 0xffe0a0, 6, 0xff5010, 2);
      if (!tick) continue;
      // けずる(1 回分)
      // 血は カメラの側へ(一人称は 目の前が血で うまらないよう 横へ。画面には VM.splatter の小さな しぶき)
      let ccx = cam.x - cx, ccz = cam.z - cz; const cl = Math.hypot(ccx, ccz) || 1; ccx /= cl; ccz /= cl;
      if (fps) { ccx = 0; ccz = 0; }
      const dead = hurt(e, w.dmg * (e.boss ? 1.6 : 0.35), tx, tz, 0, 'chainsaw');
      FX.blood(cx, cy, cz, ccx * 0.7 + tx * 0.5, ccz * 0.7 + tz * 0.5, fps ? 0.4 : e.boss ? 0.6 : 0.8);
      S.blood = Math.min(1, S.blood + 0.012);
      if (fps && rnd() < 0.25 && cl < 3) VM.splatter(1);
      if (e.boss) {
        for (let k = 0; k < 5; k++) FX.spark(cx, cy, cz, tx * 7 + (rnd() - 0.5) * 6, 2 + rnd() * 5, tz * 7 + (rnd() - 0.5) * 6, 0.3, 0.05, 0xfff0c0, 7, 0xff6010, 2);
        Engine.shake(0.12);
        if (!dead) continue;
      }
      // まっぷたつ(食いこんで sink 秒たったら)
      if (!dead && !e.boss && e._sawA >= (w.fever ? w.sink * 0.6 : w.sink)) {
        if (!hurt(e, e.hp + 999, tx * 0.85 + ux * 0.35, tz * 0.85 + uz * 0.35, w.force, 'chainsaw')) continue;   // 盾が受けた
      } else if (!dead) continue;
      kills++;
      this._sawCut(S, e, cx, cy, cz, tx, tz, ux, uz, ccx, ccz, cl, px, pz, fps);
    }
    _near.length = 0;
    S.contact = hits;
    if (S.log) { S.dN = (S.dN || 0) + 1; S.dC = (S.dC || 0) + hits; if (S.tgtD < 2.6 && !hits) S.dZ = (S.dZ || 0) + 1; if (S.vic) S.dCr = (S.dCr || 0) + 1; }

    // ---- 飛びこみ(短いダッシュ)----
    if (S.lungeT > 0) {
      const k = Math.min(dt, S.lungeT);
      player.pos.x += S.lvx * k; player.pos.z += S.lvz * k;
      World.collideCircle(player.pos, player.radius);
      S.lungeT -= dt;
      if (hits || S.lungeT <= 0 || !tgt) { S.lungeT = 0; S.lungeCool = 0.1; }
      if (rnd() < 0.5) FX.smoke(px, 0.15, pz, 0.3, 0.5, 0x6a6052, -S.lvx * 0.15, 0.4, -S.lvz * 0.15, 0.35);
    } else if (S.lungeCool > 0) S.lungeCool -= dt;
    else if (tgt && !hits && !(player.moves && player.moves.busy)) {
      // 刃のまん中あたりで 止まる(一人称は 目の前が ふさがらないよう 少し手前)
      const need = Math.min(4.6, td - ((fps ? 1.35 : 1.15) + tgt.r));
      if (need > 0.45) {
        const T = 0.11 + need * 0.02, ex = (tgt.x - px) / td, ez = (tgt.z - pz) / td;
        S.lungeT = T; S.lvx = ex * need / T; S.lvz = ez * need / T;
        S.nLunge++;
        FX.ring(px, pz, 0.2, 1.4, 0.25, 0xc8b8a0, 0.2, 1.4, 0.7, 0);
        for (let k = 0; k < FX.q(4); k++) FX.smoke(px, 0.2, pz, 0.35, 0.6, 0x7a6e60, -ex * 4 + (rnd() - 0.5) * 3, 0.6, -ez * 4 + (rnd() - 0.5) * 3, 0.4);
        if (close) Engine.fovKick(3.5);
        VM.vibrate(1);
      }
    }

    // ---- 刃のまわりの見た目(空ぶかし)----
    if (rnd() < 0.4) FX.spark(_r1.x, by, _r1.z, tx * 2 + (rnd() - 0.5) * 3, 1 + rnd() * 2, tz * 2 + (rnd() - 0.5) * 3, 0.15, 0.03, 0xffd090, 5, 0xff5010, 2);
    if (rnd() < 0.15 * FX.quality) FX.smoke(px - dx * 0.3 - dz * 0.4, 1.3, pz - dz * 0.3 + dx * 0.4, 0.15, 0.7, 0x6a6662, 0, 0.8, 0, 0.35);
    VM.vibrate(hits ? 1.3 : 0.5);
    if (hits) {
      Engine.shake(bossHit ? 0.16 : 0.09);
      if (tick) FX.muzzleLight(_r1.x, by + 0.3, _r1.z, 0xff4020, 5);
    }
    if (kills) {
      Engine.shake(Math.min(0.5, 0.22 + kills * 0.06));
      if (S.hsT <= 0) { S.hsT = 0.13; Engine.hitStop(0.03); }
      Events.emit('melee', { x: px, z: pz, kills });
    }
    if (tick) {
      wallDamage(_r1.x, _r1.z, 0.8, w.dmg, 'chainsaw');
      if (hits && (this._sawSfx -= 1) <= 0) { this._sawSfx = 3; Events.emit('weaponSfx', { name: 'grind', x: px, z: pz, hits }); }
    }
  },

  // まっぷたつにした瞬間の 血・肉片・床の血(gore 側の倒れ方に 足す)
  _sawCut(S, e, cx, cy, cz, tx, tz, ux, uz, ccx, ccz, cl, px, pz, fps) {
    const sc = (e.def && e.def.scale) || 1, ey = 1.1 * sc;
    if (S.log) S.log.push({ d: Math.hypot(e.x - px, e.z - pz), a: e._sawA || 0 });
    FX.blood(e.x, ey, e.z, tx, tz, fps ? 1.2 : 2.2);
    if (!fps) FX.blood(cx, cy, cz, ccx, ccz, 1.1);
    // 噴き上がる血
    FX.burst({ x: e.x, y: ey + 0.2, z: e.z, count: 14, color: 0x6a0404, speed: 2.4, up: 7, life: 0.8, size: 0.1, grav: 16, drag: 0.5, glow: false });
    const nc = FX.q(3);
    for (let k = 0; k < nc; k++) FX.chunks.add(e.x, ey, e.z, tx * 6 + (rnd() - 0.5) * 3, 3 + rnd() * 4, tz * 6 + (rnd() - 0.5) * 3, 0.09, 0.07, 0.09, 0x5a0606, 1.6, 0.25);
    // 床の血: 斬った所と 主人公のまわり
    FX.decal(e.x + tx * 0.8, e.z + tz * 0.8, 0.9 + rnd() * 0.8, 'blood', 30);
    const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 1.7;
    FX.decal(px + Math.cos(a) * r, pz + Math.sin(a) * r, 0.4 + rnd() * 0.6, 'blood', 30);
    S.blood = Math.min(1, S.blood + 0.1);
    VM.vibrate(1.6);
    if (fps && cl < 3.2) VM.splatter(2 + Math.floor(rnd() * 3));
    if ((this._cutSfx = (this._cutSfx || 0) + 1) % 2) Events.emit('weaponSfx', { name: 'sawCut', x: e.x, z: e.z });
  },

  // ================= 衛星レーザー: 空から太い光が落ち、狙いを追って地面をなぞる =================
  orbital(W, w, dt, player, m, dx, dz, tick) {
    const o = this.orb;
    const pt = W._aimPoint(w, player, dx, dz, 14, 3, w.range);
    if (this.orbIdle > 0.15) { o.x = player.pos.x + dx * 6; o.z = player.pos.z + dz * 6; }
    this.orbIdle = 0;
    const tx = pt.x - o.x, tz = pt.z - o.z, td = Math.hypot(tx, tz);
    const sp = (w.fever ? 30 : 18) * dt;
    if (td > 0.01) { const k = Math.min(td, sp + td * 2.5 * dt); o.x += tx / td * k; o.z += tz / td * k; }
    // 壁の中に入らないように
    _cp.x = o.x; _cp.z = o.z; World.collideCircle(_cp, 0.5); o.x = _cp.x; o.z = _cp.z;
    const x = o.x, z = o.z, R = w.radius;
    const topV = Engine.viewMode === 'top', top = FX.skyTop(x, z, topV ? 15 : 70), fl = 0.85 + rnd() * 0.3;
    const col = w.fever ? RAINBOW[Math.floor(performance.now() / 60) % RAINBOW.length] : w.color;
    FX.beam(x, top, z, x, 0.05, z, col, (topV ? 0.9 : 1.5) * fl, -1, topV ? 1.6 : 2.6, topV ? 0.75 : 1);
    FX.beam(x, top, z, x, 0.05, z, 0xffffff, (topV ? 0.3 : 0.55) * fl, -1, topV ? 2.5 : 4);
    FX.glow(x, 0.4, z, 2.4 * fl, col, 2.5);
    FX.glow(x, 0.3, z, 1.0, 0xffffff, 3);
    FX.ring(x, z, 0, R, -1, col, R * 0.5, 1.4, 0.7, 1, 0.08);
    FX.ring(x, z, R * 0.6, R * 1.25, -1, col, 0.3, 2.5, 0.8, 0, 0.1);
    FX.beam(m.x, m.y, m.z, x, 0.3, z, col, 0.03, -1, 3, 0.6);   // 目標を指す細い光
    for (let k = 0; k < FX.q(4) + 1; k++) { const a = rnd() * Math.PI * 2, s = 5 + rnd() * 9; FX.spark(x, 0.2, z, Math.cos(a) * s, 3 + rnd() * 7, Math.sin(a) * s, 0.45, 0.05, 0xe0faff, 6, col, 2, 0.03, 18); }
    if (rnd() < 0.25 * FX.quality) FX.smoke(x + (rnd() - 0.5) * R, 0.4, z + (rnd() - 0.5) * R, 0.6, 1.4, 0x3a3a40, 0, 2, 0, 0.45);
    FX.muzzleLight(x, 2.5, z, col, 22);
    this._decT -= dt;
    if (this._decT <= 0) { this._decT = 0.12; FX.decal(x + (rnd() - 0.5), z + (rnd() - 0.5), 1.2 + rnd() * 0.8, 'scorch', 14); }
    if (!tick) return;
    Zombies.queryCircle(x, z, R, _list);
    for (let i = 0; i < _list.length; i++) {
      const e = _list[i];
      const ex = e.x - x, ez = e.z - z, d = Math.hypot(ex, ez) || 0.01;
      e.burn = Math.max(e.burn || 0, 2.5); e.burnDps = Math.max(e.burnDps || 0, 50);
      hurt(e, w.dmg, ex / d, ez / d, w.force, 'laser');
    }
    _list.length = 0;
    wallDamage(x, z, R * 0.7, w.dmg, 'laser');
    Engine.shake(w.shake);
  },
};

// 空爆: 戦闘機から爆弾を落とす(weapon-summon.js から呼ばれる)
function bombFn(w, x, y, z, vx, vy, vz) {
  Proj.spawn('bomb', w, x, y, z, vx, vy, vz, x, z);
}
