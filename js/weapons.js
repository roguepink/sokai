// 武器係: 銃(押している間ずっと撃つ)・近くの敵は自動で剣・回転斬り(必殺技)・自動で狙う。
import * as THREE from 'three';
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';

// 武器の一覧(武器係が増やす)。rate = 1秒に撃つ数
export const WEAPONS = [
  { id: 'mg', name: 'マシンガン', icon: '🔫', rate: 18, dmg: 14, range: 45, spread: 0.06, pellets: 1, pierce: 1, force: 3, color: 0xffdd66 },
  { id: 'shotgun', name: 'ショットガン', icon: '💥', rate: 3, dmg: 16, range: 18, spread: 0.35, pellets: 12, pierce: 1, force: 14, color: 0xffaa44 },
];

const MELEE_RANGE = 2.6;   // この距離の敵は剣で斬る
const AIM_RANGE = 40;

export const Weapons = {
  index: 0,
  get current() { return WEAPONS[this.index]; },
  _cool: 0, _melee: 0, _spinCool: 0,
  _hits: [],

  init() {},
  reset() { this._cool = 0; this._melee = 0; this._spinCool = 0; },

  select(i) {
    this.index = ((i % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    Events.emit('weaponChange', { weapon: this.current, index: this.index });
  },

  update(dt, input, player) {
    const d = input.consumeWeaponDelta(); if (d) this.select(this.index + d);
    const s = input.consumeWeaponSelect(); if (s >= 0 && s < WEAPONS.length) this.select(s);

    // 狙い: いちばん近い敵へ自動で向ける
    const target = Zombies.nearest(player.pos.x, player.pos.z, AIM_RANGE);
    if (target) {
      const dx = target.x - player.pos.x, dz = target.z - player.pos.z, l = Math.hypot(dx, dz) || 1;
      player.aimDir.set(dx / l, 0, dz / l);
    } else if (Math.hypot(input.move.x, input.move.z) > 0.1) {
      player.aimDir.set(input.move.x, 0, input.move.z).normalize();
    }
    player.aiming = input.fire;

    // 近くの敵は剣で自動に斬る
    this._melee -= dt;
    if (this._melee <= 0) {
      const near = Zombies.queryCircle(player.pos.x, player.pos.z, MELEE_RANGE, this._hits);
      if (near.length) {
        this._melee = 0.28;
        player.swing();
        const k = Zombies.damageCircle(player.pos.x, player.pos.z, MELEE_RANGE + 0.4, 60, { force: 16, cause: 'sword' });
        Events.emit('melee', { x: player.pos.x, z: player.pos.z, kills: k });
      }
    }

    // 回転斬り(必殺技)
    this._spinCool -= dt;
    if (input.consumeSpin() && this._spinCool <= 0) this.spin(player);

    // 撃つ
    this._cool -= dt;
    if (input.fire) {
      const w = this.current;
      while (this._cool <= 0) {
        this._cool += 1 / w.rate;
        this._fire(w, player);
      }
    } else if (this._cool < 0) this._cool = 0;
  },

  spin(player) {
    this._spinCool = 0.6;
    player.spin();
    const R = 9;
    const k = Zombies.damageCircle(player.pos.x, player.pos.z, R, 400, { force: 30, cause: 'spin' });
    FX.burst({ x: player.pos.x, y: 1.1, z: player.pos.z, count: 80, color: 0x66ccff, speed: 18, up: 0.5, life: 0.35, size: 0.2, grav: 0, drag: 2 });
    Engine.shake(0.7);
    Engine.hitStop(0.06);
    Events.emit('spin', { x: player.pos.x, z: player.pos.z, kills: k });
  },

  _fire(w, player) {
    const m = player.muzzle(_mz);
    const base = Math.atan2(player.aimDir.x, -player.aimDir.z);
    for (let i = 0; i < w.pellets; i++) {
      const a = base + (Math.random() - 0.5) * w.spread * 2;
      const dx = Math.sin(a), dz = -Math.cos(a);
      let range = w.range * World.segmentHit(m.x, m.z, m.x + dx * w.range, m.z + dz * w.range);
      const hits = Zombies.raycast(m.x, m.z, dx, dz, range, this._hits);
      let pierced = 0;
      for (const h of hits) {
        Zombies.damage(h.e, w.dmg, { dirX: dx, dirZ: dz, force: w.force, cause: w.id });
        FX.blood(h.e.x, 1.2, h.e.z, dx, dz, 0.5);
        if (++pierced >= w.pierce) { range = h.t; break; }
      }
      FX.tracer(m.x, m.y, m.z, m.x + dx * range, 1.2, m.z + dz * range, w.color);
    }
    player.recoil(0.25);
    Events.emit('fire', { weapon: w, x: m.x, z: m.z });
  },
};

const _mz = new THREE.Vector3();
