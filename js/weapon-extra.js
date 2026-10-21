// 武器係: 第2弾の武器の「撃ち方」。weapons.js の _fire / _stream から呼ばれる。
// W = Weapons(狙い・銃口などの道具を持っている)、w = 武器の数字(フィーバー中は強くした写し)
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Proj, GRAV } from './weapon-proj.js';
import { Summon, RAINBOW } from './weapon-summon.js';
import { VM } from './weapon-view.js';
import { hurt, area, LOW } from './weapon-hit.js';

const rnd = Math.random;
const _list = [], _near = [], _cp = { x: 0, z: 0 };
function wallDamage(x, z, r, amount, cause) { if (World.damage) World.damage(x, z, r, amount, { cause }); }
// 一人称・肩越しで 上下の向きから 弾の上下の速さ(下を向けば 地面へ)
function slope(W) { return W.close ? Math.max(-0.6, Math.min(0.15, Math.tan(Engine.lookPitch))) : 0; }

export const Extra = {
  orbIdle: 1, orb: { x: 0, z: 0 }, _decT: 0, _sawSfx: 0,

  reset() { this.orbIdle = 1; },

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

  // ================= チェーンソー: 目の前の列を けずり取る =================
  chainsaw(W, w, dt, player, m, dx, dz, tick) {
    const px = player.pos.x, pz = player.pos.z;
    const nx = -dz, nz = dx;
    const L = w.range, Wd = w.width;
    const bx = m.x + dx * 0.4, bz = m.z + dz * 0.4, by = Math.max(0.6, m.y - 0.1);
    // 刃の火花・排気の煙
    if (rnd() < 0.7) FX.spark(bx, by, bz, dx * 3 + (rnd() - 0.5) * 4, 1 + rnd() * 3, dz * 3 + (rnd() - 0.5) * 4, 0.2, 0.035, 0xffd090, 6, 0xff5010, 2);
    if (rnd() < 0.15 * FX.quality) FX.smoke(px - dx * 0.3 + nx * 0.4, 1.3, pz - dz * 0.3 + nz * 0.4, 0.15, 0.7, 0x6a6662, 0, 0.8, 0, 0.35);
    VM.vibrate(0.5);
    // 吸いよせる(目の前の線へ)
    Zombies.queryCircle(px, pz, L + 4, _near);
    let hits = 0;
    for (let i = 0; i < _near.length; i++) {
      const e = _near[i];
      const ex = e.x - px, ez = e.z - pz;
      const along = ex * dx + ez * dz, side = ex * nx + ez * nz;
      if (along < -0.5) continue;
      if (!e.boss && along < L + 3 && Math.abs(side) > 0.3) {
        const k = Math.min(Math.abs(side) - 0.3, 7 * dt) * Math.sign(side);
        e.x -= nx * k; e.z -= nz * k;
      }
      if (!tick || along > L || Math.abs(side) > Wd + e.r) continue;
      if (along > 1.5 && World.segmentHit(px, pz, e.x, e.z, LOW) < 0.97) continue;
      hits++;
      const sgn = rnd() < 0.5 ? 1 : -1;
      hurt(e, w.dmg, dx * 0.6 + nx * sgn * 0.8, dz * 0.6 + nz * sgn * 0.8, w.force, 'chainsaw');
      const ey = (0.9 + rnd() * 0.5) * ((e.def && e.def.scale) || 1);
      FX.blood(e.x, ey, e.z, nx * sgn, nz * sgn, 1.3);
      FX.blood(e.x, ey, e.z, -dx, -dz, 0.6);
      if (rnd() < 0.35 * FX.quality) FX.chunks.add(e.x, ey, e.z, nx * sgn * 5 + (rnd() - 0.5) * 3, 3 + rnd() * 4, nz * sgn * 5 + (rnd() - 0.5) * 3, 0.08, 0.06, 0.08, 0x5a0606, 1.4, 0.2);
      if (rnd() < 0.2) FX.decal(e.x + nx * sgn * 1.2, e.z + nz * sgn * 1.2, 0.6 + rnd() * 0.6, 'blood', 16);
    }
    _near.length = 0;
    if (tick) {
      if (hits) { VM.vibrate(1.2); Engine.shake(0.18); FX.muzzleLight(bx, by + 0.4, bz, 0xff4020, 5); }
      wallDamage(px + dx * 2, pz + dz * 2, 1.5, w.dmg, 'chainsaw');
      if (hits && (this._sawSfx -= 1) <= 0) { this._sawSfx = 3; Events.emit('weaponSfx', { name: 'grind', x: px, z: pz, hits }); }
    }
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
