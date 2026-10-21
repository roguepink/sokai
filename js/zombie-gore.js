// キャラ係: 倒れ方(いちばん大事)。
// - 死体: 当たった向きへ ふっとび・回転し、地面ではねて、力の抜けた姿勢で横たわる。しばらくして地面にしずむ
// - 武器ごとの倒れ方: 爆発 = 高く飛んで回る・手足がちぎれる / 剣 = 胴が まっぷたつ・首が飛ぶ /
//   回転斬り = 外へ大きく飛ばされる / ショットガン = 後ろへ吹っとぶ / 火 = 燃えながら くずれる / 凍る = こなごなに砕ける
// - ばらばらの部位(頭・腕・脚)が飛んで はねて 転がる / 肉片・氷のかけら / 地面の血だまり
// すべて 決まった数の入れ物を使い回す(倒すたびに new しない)。
import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Render, P, BIT, PART_MESH, MAX_CORPSE } from './zombie-render.js';
import { HIP_H, NJ, deadPose, J } from './zombie-anim.js';

const G = 22;                     // 重力(少し強め = 気持ちよく落ちる)
const MAXCH = 420;                // 肉片・氷
const MAXD = 300;                 // 血だまり

const EXPLOSIVE = new Set(['grenade', 'launcher', 'rocket', 'missile', 'explosion', 'bloater', 'mine', 'nuke', 'airstrike', 'slam', 'barrel', 'boss', 'blackhole', 'bomb', 'c4', 'cluster']);
const BLADE = new Set(['sword', 'melee', 'blade', 'katana', 'laser', 'saw', 'chainsaw', 'cleaver']);
const FIRE = new Set(['fire', 'flame', 'burn', 'napalm', 'molotov', 'inferno']);
const HEAVY = new Set(['sniper', 'rail', 'railgun', 'magnum', 'cannon']);
const ELEC = new Set(['lightning', 'shock', 'tesla', 'electric']);

export function causeKind(cause) {
  if (!cause) return 'gun';
  if (cause === 'spin') return 'spin';
  if (cause === 'shotgun') return 'shotgun';
  if (EXPLOSIVE.has(cause)) return 'boom';
  if (BLADE.has(cause)) return 'blade';
  if (FIRE.has(cause)) return 'fire';
  if (HEAVY.has(cause)) return 'heavy';
  if (ELEC.has(cause)) return 'elec';
  if (cause === 'freeze' || cause === 'ice') return 'freeze';
  return 'gun';
}

const rnd = Math.random;
const R = (a, b) => a + rnd() * (b - a);

export const Gore = {
  px: 0, pz: 0,
  killsThisStep: 0,
  _ch: null, _chMesh: null, _chN: 0,
  _d: null, _dMesh: null, _dHead: 0,

  init(scene) {
    // 肉片・氷のかけら
    const cg = new THREE.DodecahedronGeometry(1, 0);
    {
      const pos = cg.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * R(0.7, 1.2), pos.getY(i) * R(0.5, 0.9), pos.getZ(i) * R(0.8, 1.3));
      cg.computeVertexNormals();
    }
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
    this._chMesh = new THREE.InstancedMesh(cg, cm, MAXCH);
    this._chMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._chMesh.setColorAt(0, new THREE.Color());
    this._chMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this._chMesh.frustumCulled = false; this._chMesh.count = 0;
    this._chMesh.castShadow = false;
    scene.add(this._chMesh);
    this._ch = {
      x: new Float32Array(MAXCH), y: new Float32Array(MAXCH), z: new Float32Array(MAXCH),
      vx: new Float32Array(MAXCH), vy: new Float32Array(MAXCH), vz: new Float32Array(MAXCH),
      rx: new Float32Array(MAXCH), ry: new Float32Array(MAXCH), rz: new Float32Array(MAXCH),
      w: new Float32Array(MAXCH), s: new Float32Array(MAXCH), life: new Float32Array(MAXCH),
      r: new Float32Array(MAXCH), g: new Float32Array(MAXCH), b: new Float32Array(MAXCH), rest: new Uint8Array(MAXCH),
    };

    // 地面の血だまり
    const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2);
    const dAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAXD * 2), 2);
    dAttr.setUsage(THREE.DynamicDrawUsage);
    dg.setAttribute('iDec', dAttr);
    const dm = new THREE.MeshBasicMaterial({ map: splatTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, color: 0xffffff });
    dm.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 iDec; varying float vDecA;')
        .replace('#include <uv_vertex>', `#include <uv_vertex>
{ float tl = iDec.x; vMapUv = (uv + vec2(mod(tl, 2.0), floor(tl / 2.0 + 0.001))) * 0.5; } vDecA = iDec.y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vDecA;')
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vDecA;');
    };
    dm.customProgramCacheKey = () => 'decal-v1';
    this._dMesh = new THREE.InstancedMesh(dg, dm, MAXD);
    this._dMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._dMesh.setColorAt(0, new THREE.Color());
    this._dMesh.frustumCulled = false; this._dMesh.count = 0;
    this._dMesh.renderOrder = -1;
    this._dMesh.receiveShadow = false;
    scene.add(this._dMesh);
    this._d = {
      x: new Float32Array(MAXD), z: new Float32Array(MAXD), a: new Float32Array(MAXD), sx: new Float32Array(MAXD), sz: new Float32Array(MAXD),
      grow: new Float32Array(MAXD), gt: new Float32Array(MAXD), age: new Float32Array(MAXD), tile: new Uint8Array(MAXD),
      r: new Float32Array(MAXD), g: new Float32Array(MAXD), b: new Float32Array(MAXD), used: new Uint8Array(MAXD), y: new Float32Array(MAXD),
      alpha: new Float32Array(MAXD),
    };
  },

  reset() {
    if (!this._ch) return;
    this._ch.life.fill(0); this._chN = 0;
    this._d.used.fill(0); this._dHead = 0;
  },

  // =====================================================================
  // 倒れる(zombies.js の _kill から呼ぶ)。B は その体の記録(生きている状態)
  // =====================================================================
  kill(e, B, opts) {
    const kind = e.frozen > 0 ? 'freeze' : causeKind(opts.cause);
    let dx = opts.dirX || 0, dz = opts.dirZ || 0;
    let dl = Math.hypot(dx, dz);
    if (dl < 0.01) { dx = e.x - this.px; dz = e.z - this.pz; dl = Math.hypot(dx, dz) || 1; }
    dx /= dl; dz /= dl;
    const F = opts.force || 0;
    const many = this.killsThisStep++;
    const lite = many > 12 || Engine.quality === 'low';   // 一度にたくさん倒したら 少しひかえめに

    // 今の姿勢を最新にして、部位の位置を計算
    if (B.mode === 1 && B.e) {
      // poseAlive は zombies.js が呼ぶ(ここでは B.pose が新しい前提)
    }
    Render.computeMats(B);

    if (kind === 'freeze') { this._shatter(e, B, dx, dz, F); return; }

    // 死体にする
    const s = B.s;
    B.mode = 2; B.e = null; B.age = 0;
    const many2 = Render.corpseCount();
    B.life = many2 > MAX_CORPSE * 0.75 ? R(2.5, 4) : R(6, 9.5);
    B.poseA.set(B.pose);
    deadPose(B.poseB);
    const ra = B.ra;
    _q.setFromEuler(_e.set(B.ap, -e.face, B.ar, 'YXZ'));
    ra.q.copy(_q);
    ra.x = e.x; ra.y = (HIP_H + B.ay) * s + e.y; ra.z = e.z;
    ra.dn = HIP_H * s; ra.up = 0.88 * s; ra.th = 0.15 * s * B.fat; ra.ground = false; ra.settled = false; ra.face = true;
    ra.vx = (e.vx || 0) * 0.3 + (e.kx || 0) * 0.3; ra.vz = (e.vz || 0) * 0.3 + (e.kz || 0) * 0.3; ra.vy = 0;
    ra.wx = ra.wy = ra.wz = 0;
    B.split = false;
    const heavy = e.def.scale > 1.3 ? 1 / (e.def.scale * 0.8) : 1;   // 大きいほど 飛びにくい
    // 「上が d の方へ倒れる」回転軸 = (dz, 0, -dx)
    const tip = (mag) => { ra.wx += dz * mag; ra.wz += -dx * mag; };
    const spinR = (mag) => { ra.wx += R(-mag, mag); ra.wy += R(-mag, mag); ra.wz += R(-mag, mag); };
    const launch = (vh, vy) => { ra.vx += dx * vh * heavy; ra.vz += dz * vh * heavy; ra.vy += vy * heavy; };
    const fxy = 1.2 * s;
    const bloodAmt = lite ? 0.6 : 1;

    switch (kind) {
      case 'boom': {
        launch(Math.min(20, 5 + F * 0.45) * R(0.75, 1.2), Math.min(19, 7 + F * 0.3 + R(0, 5)));
        spinR(13);
        const total = rnd() < 0.22;
        if (total || rnd() < 0.45) this._popHead(B, dx, dz, lite);
        for (const p of [P.UAL, P.UAR, P.ULL, P.ULR]) if (total || rnd() < 0.42) this._limbOff(B, p, dx, dz, 9, 7);
        this.chunks(e.x, fxy, e.z, lite ? 5 : total ? 16 : 9, 9, 6, dx, dz);
        FX.blood(e.x, fxy, e.z, dx, dz, 2 * bloodAmt);
        this.splat(e.x + dx * 1.5, e.z + dz * 1.5, R(2.2, 3.2), dx, dz, 1.6);
        B.bleed = 0.6; B.bleedP = P.TORSO; B.bleedY = 0.5;
        break;
      }
      case 'blade': {
        const r = rnd();
        if (r < 0.55 && e.def.anim !== 'crawl') {
          this._split(B, dx, dz, Math.min(9, 4 + F * 0.25), R(3.5, 5.5), 0.8);
          B.bleed = 1.3;
        } else if (r < 0.82) {
          this._headOff(B, dx, dz, 5 + F * 0.2, R(5, 8));
          launch(1.6, 0.5); tip(2.4);
          B.bleed = 1.6; B.bleedP = P.TORSO; B.bleedY = 0.55;
        } else {
          this._limbOff(B, rnd() < 0.5 ? P.UAL : P.UAR, dx, dz, 6, 4);
          launch(2.5 + F * 0.1, 1.5); tip(3.5);
          B.bleed = 0.8; B.bleedP = P.TORSO; B.bleedY = 0.45;
        }
        FX.blood(e.x, fxy, e.z, dx, dz, 1.6 * bloodAmt);
        this.chunks(e.x, fxy, e.z, lite ? 2 : 4, 5, 3, dx, dz);
        this.splat(e.x + dx * 0.8, e.z + dz * 0.8, R(1.4, 2.2), dx, dz, 2.2);
        break;
      }
      case 'spin': {
        launch(Math.min(15, 8 + F * 0.2) * R(0.85, 1.15), R(5.5, 9));
        spinR(10); tip(R(4, 8));
        const r = rnd();
        if (r < 0.42 && e.def.anim !== 'crawl') { this._split(B, dx, dz, R(13, 18), R(7, 11), 1.3); B.bleed = 1; }
        else if (r < 0.65) { this._headOff(B, dx, dz, R(12, 16), R(8, 12)); B.bleed = 1; B.bleedP = P.TORSO; B.bleedY = 0.55; }
        if (rnd() < 0.3) this._limbOff(B, rnd() < 0.5 ? P.UAL : P.UAR, dx, dz, 14, 8);
        FX.blood(e.x, fxy, e.z, dx, dz, 1.5 * bloodAmt);
        this.chunks(e.x, fxy, e.z, lite ? 2 : 5, 8, 5, dx, dz);
        this.splat(e.x + dx * 2, e.z + dz * 2, R(1.6, 2.6), dx, dz, 2.6);
        break;
      }
      case 'shotgun': {
        launch(Math.min(16, 6 + F * 0.45) * R(0.85, 1.15), R(2, 4.5));
        tip(R(5, 9)); spinR(2);
        const r = rnd();
        if (r < 0.3) this._popHead(B, dx, dz, lite);
        else if (r < 0.55) this._limbOff(B, rnd() < 0.5 ? P.UAL : P.UAR, dx, dz, 9, 4);
        FX.blood(e.x, fxy, e.z, dx, dz, 2 * bloodAmt);
        this.chunks(e.x, fxy, e.z, lite ? 2 : 5, 10, 3, dx, dz);
        this.splat(e.x + dx * 2.2, e.z + dz * 2.2, R(1.8, 2.8), dx, dz, 2.8);
        break;
      }
      case 'heavy': {
        launch(Math.min(14, 7 + F * 0.3), R(1.5, 3));
        tip(R(4, 7));
        if (rnd() < 0.6) this._popHead(B, dx, dz, lite);
        FX.blood(e.x, fxy, e.z, dx, dz, 1.6 * bloodAmt);
        this.splat(e.x + dx * 1.5, e.z + dz * 1.5, R(1.5, 2.2), dx, dz, 2.4);
        break;
      }
      case 'fire': {
        launch(0.5, 0); tip(R(1.6, 2.6));
        B.fx[2] = 0.85; B.burnT = R(2.5, 4);
        // こぶしを握って ちぢこまる
        for (const j of [J.ELL, J.ELR]) B.poseB[j * 3] = R(1.6, 2.2);
        for (const j of [J.SHL, J.SHR]) B.poseB[j * 3] = R(0.8, 1.5);
        for (const j of [J.KNL, J.KNR]) B.poseB[j * 3] = -R(0.8, 1.5);
        this.splat(e.x, e.z, R(1.2, 1.8), dx, dz, 1, 0x1a1210);
        break;
      }
      case 'elec': {
        launch(1.2 + F * 0.3, 1); tip(R(2.5, 4));
        B.fx[2] = 0.45; B.twitch = 1.6;
        FX.burst({ x: e.x, y: fxy, z: e.z, count: lite ? 6 : 14, color: 0x9fd8ff, speed: 6, up: 3, life: 0.35, size: 0.12, grav: 0, drag: 3 });
        this.splat(e.x, e.z, R(1.2, 1.8), dx, dz, 1.2);
        break;
      }
      default: {     // 銃
        launch(Math.min(10, 1.2 + F * 0.7) * R(0.8, 1.2), 0.6 + Math.min(3, F * 0.12) + R(0, 1));
        tip(R(2.5, 4.2)); spinR(1.5);
        if (opts.crit || rnd() < 0.12) this._popHead(B, dx, dz, lite);
        else if (rnd() < 0.08) this._limbOff(B, rnd() < 0.5 ? P.UAL : P.UAR, dx, dz, 5, 3);
        FX.blood(e.x, fxy, e.z, dx, dz, 1.2 * bloodAmt);
        this.splat(e.x + dx * 0.9, e.z + dz * 0.9, R(1.3, 2), dx, dz, 1.7);
      }
    }
    if (e.burn > 0 && kind !== 'fire') { B.burnT = Math.max(B.burnT, R(1.5, 3)); B.fx[2] = Math.max(B.fx[2], 0.6); }
    if (e.def.anim === 'crawl') { ra.dn = 0.2 * s; }
  },

  // 体を腰で まっぷたつ。上半身は rb で別に飛ぶ
  _split(B, dx, dz, vUp, vyUp, spinMul) {
    const rb = B.rb, ra = B.ra, s = B.s;
    Render.partMatrix(B, P.TORSO, _m);
    _m.decompose(_v, _q, _sv);
    rb.x = _v.x; rb.y = _v.y; rb.z = _v.z; rb.q.copy(_q);
    rb.vx = ra.vx + dx * vUp; rb.vz = ra.vz + dz * vUp; rb.vy = vyUp;
    rb.wx = dz * R(3, 7) * spinMul + R(-2, 2); rb.wy = R(-3, 3) * spinMul; rb.wz = -dx * R(3, 7) * spinMul + R(-2, 2);
    rb.dn = 0.05 * s; rb.up = 0.85 * s; rb.th = 0.14 * s * B.fat; rb.ground = false; rb.settled = false; rb.face = true;
    // 下半身はその場で くずれる
    ra.vx = dx * 1.2; ra.vz = dz * 1.2; ra.vy = 0.5;
    ra.wx = dz * R(1.5, 3); ra.wz = -dx * R(1.5, 3); ra.wy = 0;
    ra.dn = HIP_H * s; ra.up = 0.12 * s;
    B.split = true;
    B.bleedP = P.PELVIS; B.bleedY = 0.1;
    // 切り口から 血が噴きだす
    FX.burst({ x: rb.x, y: rb.y, z: rb.z, count: 26, color: 0x7a0606, speed: 5, up: 4, life: 0.8, size: 0.14, dirX: dx * 0.5, dirZ: dz * 0.5 });
  },

  // 頭が飛ぶ(体から はなれて 転がる)
  _headOff(B, dx, dz, vh, vy) {
    if (B.hide & BIT(P.HEAD)) return;
    this._gibFrom(B, P.HEAD, -1, 0.13, 0.11, true, dx * vh + R(-1.5, 1.5), vy, dz * vh + R(-1.5, 1.5), 12);
    if (B.helmet && !(B.hide & BIT(P.HELMET))) this._gibFrom(B, P.HELMET, -1, 0.19, 0.13, true, dx * vh * 0.8 + R(-3, 3), vy + 2, dz * vh * 0.8 + R(-3, 3), 10);
    B.hide |= BIT(P.HEAD) | BIT(P.HELMET);
  },
  // 頭がはじける(肉片になる)
  _popHead(B, dx, dz, lite) {
    if (B.hide & BIT(P.HEAD)) return;
    Render.partPoint(B, P.HEAD, 0.15, _v);
    B.hide |= BIT(P.HEAD);
    if (B.helmet) { this._gibFrom(B, P.HELMET, -1, 0.19, 0.13, true, dx * 6 + R(-3, 3), R(6, 9), dz * 6 + R(-3, 3), 14); B.hide |= BIT(P.HELMET); }
    this.chunks(_v.x, _v.y, _v.z, lite ? 4 : 9, 7, 5, dx, dz);
    this.chunks(_v.x, _v.y, _v.z, lite ? 1 : 3, 6, 5, dx, dz, 0xd8ccb0, 0.6);
    FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: lite ? 10 : 24, color: 0x8a0a0a, speed: 7, up: 4, life: 0.6, size: 0.15, dirX: dx * 0.7, dirZ: dz * 0.7 });
    FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: lite ? 4 : 10, color: 0x5a0404, speed: 3, up: 1.5, life: 0.7, size: 0.16, grav: 2, drag: 3 });
    B.bleed = Math.max(B.bleed, 1.2); B.bleedP = P.TORSO; B.bleedY = 0.55;
  },
  // 腕・脚が ちぎれて飛ぶ(上 + 下 の 2 つで 1 本)
  _limbOff(B, p, dx, dz, vh, vy) {
    if (B.hide & BIT(p)) return;
    const lower = p + 2;            // 上腕 3,4 → 前腕 5,6 / もも 7,8 → すね 9,10
    const isArm = p === P.UAL || p === P.UAR;
    this._gibFrom(B, p, lower, isArm ? -0.33 : -0.45, isArm ? 0.36 : 0.47, false,
      dx * vh + R(-4, 4), vy * R(0.7, 1.3), dz * vh + R(-4, 4), 14);
    B.hide |= BIT(p) | BIT(lower);
    Render.partPoint(B, p, 0, _v);
    FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: 10, color: 0x7a0606, speed: 4, up: 3, life: 0.6, size: 0.12, dirX: dx * 0.5, dirZ: dz * 0.5 });
  },

  // 体の部位から ばらばらの部位を作る。cy = 中心の高さ(部位の中の座標)
  _gibFrom(B, p, p2, cy, half, roll, vx, vy, vz, spin) {
    const g = Render.allocGib();
    g.used = true; g.n = p2 >= 0 ? 2 : 1;
    Render.partMatrix(B, p, _m);
    Render.partPoint(B, p, cy, _v);
    _m.decompose(_v2, _q, _sv);
    const r = g.r;
    r.x = _v.x; r.y = _v.y; r.z = _v.z; r.q.copy(_q);
    r.vx = vx; r.vy = vy; r.vz = vz;
    r.wx = R(-spin, spin); r.wy = R(-spin, spin); r.wz = R(-spin, spin);
    r.dn = half * B.s; r.up = half * B.s; r.th = (roll ? 0.1 : 0.05) * B.s; r.ground = false; r.settled = false; r.face = false;
    _gi.compose(_v, _q, _one).invert();
    g.rel[0].multiplyMatrices(_gi, _m); g.mesh[0] = PART_MESH[p]; g.tile[0] = B.tile[p];
    g.cloth[0] = B.cloth[p * 3]; g.cloth[1] = B.cloth[p * 3 + 1]; g.cloth[2] = B.cloth[p * 3 + 2];
    if (p2 >= 0) {
      Render.partMatrix(B, p2, _m2);
      g.rel[1].multiplyMatrices(_gi, _m2); g.mesh[1] = PART_MESH[p2]; g.tile[1] = B.tile[p2];
      g.cloth[3] = B.cloth[p2 * 3]; g.cloth[4] = B.cloth[p2 * 3 + 1]; g.cloth[5] = B.cloth[p2 * 3 + 2];
    }
    g.skin[0] = B.skin[0]; g.skin[1] = B.skin[1]; g.skin[2] = B.skin[2];
    g.fx[0] = 0; g.fx[1] = B.fx[1]; g.fx[2] = B.fx[2]; g.fx[3] = 0;
    // 切り口(ちぎれた側)
    g.cap = p !== P.HELMET;
    if (g.cap) {
      const top = p === P.HEAD;
      _cm.compose(_v3.set(0, top ? -0.02 : 0.0, 0), _q2.setFromAxisAngle(_xA, top ? Math.PI : 0), _sv.set(top ? 0.055 : 0.06, 0.05, top ? 0.055 : 0.06));
      g.capRel.multiplyMatrices(g.rel[0], _cm);
      // rel[0] は部位の拡大を含むので、切り口の大きさも合う
    }
    g.roll = roll; g.life = R(7, 11); g.sink = 0; g.splat = false;
    return g;
  },

  // 凍ったまま倒れた: こなごなに砕ける
  _shatter(e, B, dx, dz, F) {
    const vh = 3 + F * 0.3;
    const parts = [[P.HEAD, -1, 0.13, 0.11, true], [P.UAL, P.LAL, -0.33, 0.36, false], [P.UAR, P.LAR, -0.33, 0.36, false], [P.ULL, P.LLL, -0.45, 0.47, false], [P.ULR, P.LLR, -0.45, 0.47, false]];
    B.fx[1] = 1;
    for (const [p, p2, cy, half, roll] of parts) {
      if (B.hide & BIT(p)) continue;
      if (rnd() < 0.35) continue;
      const g = this._gibFrom(B, p, p2, cy, half, roll, dx * vh + R(-4, 4), R(3, 7), dz * vh + R(-4, 4), 10);
      g.cap = false; g.fx[1] = 1; g.life = R(4, 6);
    }
    const y = 1 * B.s;
    this.chunks(e.x, y, e.z, 22, 8, 6, dx, dz, 0xbfe6ff, 1.1);
    this.chunks(e.x, y, e.z, 6, 6, 5, dx, dz, 0x8a1010, 0.7);
    FX.burst({ x: e.x, y, z: e.z, count: 30, color: 0xd8f4ff, speed: 8, up: 4, life: 0.6, size: 0.12, grav: 6, drag: 2 });
    FX.burst({ x: e.x, y, z: e.z, count: 12, color: 0xe8f8ff, speed: 4, up: 1, life: 0.4, size: 0.14, grav: 0, drag: 4 });
    this.splat(e.x, e.z, 1.4, dx, dz, 1, 0x9ec8e0, 0.55);
    Render.release(B);
  },

  // ---------- 肉片 ----------
  chunks(x, y, z, n, speed, up, dx = 0, dz = 0, color = 0x6a0808, size = 1) {
    const C = this._ch;
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      const k = this._chN; this._chN = (this._chN + 1) % MAXCH;
      const a = rnd() * Math.PI * 2, sp = speed * R(0.3, 1);
      C.x[k] = x; C.y[k] = y; C.z[k] = z;
      C.vx[k] = Math.cos(a) * sp * 0.7 + dx * speed * 0.6; C.vz[k] = Math.sin(a) * sp * 0.7 + dz * speed * 0.6; C.vy[k] = up * R(0.6, 1.5);
      C.rx[k] = R(0, 6); C.ry[k] = R(0, 6); C.rz[k] = R(0, 6); C.w[k] = R(5, 15);
      C.s[k] = R(0.04, 0.11) * size; C.life[k] = R(5, 9); C.rest[k] = 0;
      const v = R(0.75, 1.15);
      C.r[k] = _c.r * v; C.g[k] = _c.g * v; C.b[k] = _c.b * v;
    }
  },

  // ---------- 血だまり ----------
  // (x,z) 大きさ size(m)、向き (dx,dz) にのびる stretch 倍
  splat(x, z, size, dx = 0, dz = 0, stretch = 1, color = 0x4a0303, alpha = 0.92) {
    const D = this._d;
    size *= 0.62; stretch = 1 + (stretch - 1) * 0.55;
    const k = this._dHead; this._dHead = (this._dHead + 1) % MAXD;
    D.used[k] = 1; D.x[k] = x; D.z[k] = z;
    D.a[k] = (dx || dz) ? Math.atan2(dx, dz) : R(0, 6.28);
    D.sx[k] = size; D.sz[k] = size * stretch;
    D.grow[k] = 0; D.gt[k] = R(0.25, 0.6); D.age[k] = 0; D.tile[k] = (rnd() * 4) | 0;
    D.y[k] = 0.035 + (k % 11) * 0.0015;
    _c.setHex(color);
    const v = R(0.8, 1.15);
    D.r[k] = _c.r * v; D.g[k] = _c.g * v; D.b[k] = _c.b * v;
    D.alpha[k] = alpha;
  },

  // =====================================================================
  // 毎ステップ: 死体・部位・肉片・血だまり を動かす
  // =====================================================================
  update(dt, px, pz) {
    this.px = px; this.pz = pz;
    this.killsThisStep = 0;
    // 死体
    for (const B of Render.bodies) {
      if (B.mode !== 2) continue;
      B.age += dt;
      stepRigid(B.ra, dt);
      if (B.split) stepRigid(B.rb, dt);
      const air = B.split ? (!B.ra.settled || !B.rb.ground) : !B.ra.ground;
      // 姿勢: 生きていた姿勢 → 力の抜けた姿勢。空中では手足をばたつかせる
      const bl = Math.min(1, B.age / 0.55), k = bl * bl * (3 - 2 * bl);
      const P_ = B.pose, A = B.poseA, Bp = B.poseB;
      for (let i = 0; i < NJ * 3; i++) P_[i] = A[i] + (Bp[i] - A[i]) * k;
      if (air) {
        const fl = Math.min(1, B.age * 3) * 0.55;
        for (const j of [J.SHL, J.SHR, J.HIPL, J.HIPR, J.ELL, J.ELR, J.HEAD]) {
          P_[j * 3] += Math.sin(B.age * 14 + j * 1.7) * fl;
          P_[j * 3 + 2] += Math.cos(B.age * 11 + j) * fl * 0.6;
        }
      }
      if (B.twitch > 0) {
        B.twitch -= dt;
        for (let i = 0; i < NJ * 3; i++) P_[i] += (rnd() - 0.5) * 0.4 * Math.min(1, B.twitch);
        B.fx[3] = -(0.3 + rnd() * 0.5) * Math.min(1, B.twitch);
      } else if (B.fx[3] < 0) B.fx[3] = 0;
      // 着地: 血だまり
      if (B.ra.ground && !B.landed) {
        B.landed = true;
        const sp = Math.hypot(B.ra.vx, B.ra.vz);
        if (B.age > 0.25 && sp > 3) {
          this.splat(B.ra.x, B.ra.z, R(0.9, 1.4) * B.s, B.ra.vx / sp, B.ra.vz / sp, 1 + Math.min(1.5, sp * 0.12));
          FX.burst({ x: B.ra.x, y: 0.3, z: B.ra.z, count: 8, color: 0x6a0505, speed: 3, up: 2, life: 0.5, size: 0.12 });
        }
      }
      if (B.ra.settled && !B.splatted && B.age > 0.4) {
        B.splatted = true;
        this.splat(B.ra.x, B.ra.z, R(1.6, 2.4) * B.s * B.fat, 0, 0, 1, 0x3a0202);   // ゆっくり広がる血だまり
        const D = this._d, k = (this._dHead + MAXD - 1) % MAXD; D.gt[k] = R(2.5, 4);
      }
      // 血が噴きだす
      if (B.bleed > 0) {
        B.bleed -= dt;
        if (((B.age * 20) | 0) !== (((B.age - dt) * 20) | 0)) {
          Render.partPoint(B, B.bleedP, B.bleedY, _v);
          const m = B.mats, o = B.bleedP * 16;
          const ux = m[o + 4], uy = m[o + 5], uz = m[o + 6], ul = Math.hypot(ux, uy, uz) || 1;
          const sg = B.bleedP === P.TORSO && B.split ? -1 : 1;
          FX.burst({ x: _v.x, y: _v.y, z: _v.z, count: 3, color: 0x8a0808, speed: 2.5, up: 2 + Math.max(0, uy / ul) * 3 * sg, life: 0.6, size: 0.11, dirX: ux / ul * 4 * sg, dirZ: uz / ul * 4 * sg, spread: 0.4 });
        }
      }
      // 燃えている死体
      if (B.burnT > 0) {
        B.burnT -= dt;
        B.fx[2] = Math.min(0.92, B.fx[2] + dt * 0.4);
        B.fx[3] = 0.35 + 0.3 * Math.sin(B.age * 23) * Math.sin(B.age * 7);
        if (rnd() < dt * 9) FX.burst({ x: B.ra.x + R(-0.4, 0.4), y: B.ra.y + 0.2, z: B.ra.z + R(-0.4, 0.4), count: 2, color: rnd() < 0.5 ? 0xff6a10 : 0xffb030, speed: 0.8, up: 2.5, life: 0.5, size: 0.22, grav: -3, drag: 2 });
        if (B.burnT <= 0) B.fx[3] = 0;
      }
      // 時間がきたら 地面にしずむ
      if (B.age > B.life) {
        B.ra.settled = true; B.rb.settled = true;
        B.sink += dt * 0.32;
        B.ra.y -= dt * 0.32; if (B.split) B.rb.y -= dt * 0.32;
        if (B.sink > 0.7) Render.release(B);
      }
    }
    // ばらばらの部位
    for (const g of Render.gibs) {
      if (!g.used) continue;
      g.life -= dt;
      stepRigid(g.r, dt, g.roll);
      if (g.r.ground && !g.splat) { g.splat = true; if (g.fx[1] < 0.5) this.splat(g.r.x, g.r.z, R(0.5, 0.9), g.r.vx, g.r.vz, 1.6); }
      if (g.life < 0) { g.sink += dt * 0.3; if (g.sink > 0.4) g.used = false; }
    }
    // 肉片
    const C = this._ch;
    for (let k = 0; k < MAXCH; k++) {
      if (C.life[k] <= 0) continue;
      C.life[k] -= dt;
      if (C.rest[k]) continue;
      C.vy[k] -= G * dt;
      C.x[k] += C.vx[k] * dt; C.y[k] += C.vy[k] * dt; C.z[k] += C.vz[k] * dt;
      C.rx[k] += C.w[k] * dt; C.rz[k] += C.w[k] * 0.7 * dt;
      if (C.y[k] < C.s[k] * 0.5) {
        C.y[k] = C.s[k] * 0.5;
        C.vy[k] = -C.vy[k] * 0.3; C.vx[k] *= 0.55; C.vz[k] *= 0.55; C.w[k] *= 0.5;
        if (Math.abs(C.vy[k]) < 0.6 && Math.abs(C.vx[k]) + Math.abs(C.vz[k]) < 0.4) C.rest[k] = 1;
      }
    }
    // 血だまり
    const D = this._d;
    for (let k = 0; k < MAXD; k++) {
      if (!D.used[k]) continue;
      D.age[k] += dt;
      if (D.grow[k] < 1) D.grow[k] = Math.min(1, D.grow[k] + dt / D.gt[k]);
      if (D.age[k] > 40) D.used[k] = 0;
    }
  },

  // 描画の直前(Render.draw のあと)
  draw() {
    // 肉片
    const C = this._ch, cm = this._chMesh;
    let n = 0;
    for (let k = 0; k < MAXCH; k++) {
      const l = C.life[k];
      if (l <= 0) continue;
      const s = C.s[k] * Math.min(1, l * 1.5);
      _q.setFromEuler(_e.set(C.rx[k], C.ry[k], C.rz[k]));
      _m.compose(_v.set(C.x[k], C.y[k], C.z[k]), _q, _sv.set(s, s, s));
      cm.setMatrixAt(n, _m);
      _c.setRGB(C.r[k], C.g[k], C.b[k]);
      cm.setColorAt(n, _c);
      n++;
    }
    cm.count = n;
    if (n) { cm.instanceMatrix.needsUpdate = true; cm.instanceColor.needsUpdate = true; }
    // 血だまり
    const D = this._d, dm = this._dMesh, att = dm.geometry.attributes.iDec;
    n = 0;
    for (let k = 0; k < MAXD; k++) {
      if (!D.used[k]) continue;
      const gr = D.grow[k], g2 = 1 - (1 - gr) * (1 - gr);
      const fade = D.age[k] > 32 ? Math.max(0, 1 - (D.age[k] - 32) / 8) : 1;
      _q.setFromAxisAngle(_yA, D.a[k]);
      _m.compose(_v.set(D.x[k], D.y[k], D.z[k]), _q, _sv.set(D.sx[k] * (0.3 + 0.7 * g2), 1, D.sz[k] * (0.3 + 0.7 * g2)));
      dm.setMatrixAt(n, _m);
      _c.setRGB(D.r[k], D.g[k], D.b[k]);
      dm.setColorAt(n, _c);
      att.array[n * 2] = D.tile[k]; att.array[n * 2 + 1] = D.alpha[k] * fade;
      n++;
    }
    dm.count = n;
    if (n) { dm.instanceMatrix.needsUpdate = true; dm.instanceColor.needsUpdate = true; att.needsUpdate = true; }
  },
};

// ---------- かたい物の動き(死体・部位) ----------
function stepRigid(r, dt, roll = false) {
  if (r.settled) return;
  r.vy -= G * dt;
  r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
  const w = Math.hypot(r.wx, r.wy, r.wz);
  if (w > 1e-4) { _qa.setFromAxisAngle(_ax.set(r.wx / w, r.wy / w, r.wz / w), w * dt); r.q.premultiply(_qa); }
  // 壁にぶつかる
  if (World.collideCircle(r, 0.25)) { r.vx *= -0.25; r.vz *= -0.25; }
  // 地面
  _u.set(0, 1, 0).applyQuaternion(r.q);
  const low = r.y + Math.min(-r.dn * _u.y, r.up * _u.y) - r.th;
  if (low < 0) {
    r.y -= low;
    if (r.vy < 0) r.vy = r.vy < -2.5 ? -r.vy * 0.28 : 0;
    const fr = Math.exp(-7 * dt);
    r.vx *= fr; r.vz *= fr;
    const wd = Math.exp((roll ? -2 : -6) * dt);
    r.wx *= wd; r.wy *= wd; r.wz *= wd;
    r.ground = true;
    if (!roll) {
      // 横たわる向きへ(上の向き → 水平。死体は 正面を上か下へ)
      _h.set(_u.x, 0, _u.z);
      if (_h.lengthSq() < 0.01) _h.set(r.vx || 1, 0, r.vz);
      _h.normalize();
      _qa.setFromUnitVectors(_u, _h);
      _qt.multiplyQuaternions(_qa, r.q);
      if (r.face) {
        _f.set(0, 0, -1).applyQuaternion(_qt);
        _f.addScaledVector(_h, -_f.dot(_h));
        if (_f.lengthSq() > 1e-4) {
          _f.normalize();
          _qa.setFromUnitVectors(_f, _f.y >= 0 ? _up : _down);
          _qt.premultiply(_qa);
        }
      }
      r.q.slerp(_qt, 1 - Math.exp(-7 * dt));
      if (r.vy === 0 && Math.abs(r.vx) + Math.abs(r.vz) < 0.25 && r.q.angleTo(_qt) < 0.04) {
        r.settled = true; r.vx = r.vz = r.vy = 0; r.wx = r.wy = r.wz = 0;
      }
    } else {
      // 頭は転がる(進む向きに回る)
      if (r.vy === 0 && Math.abs(r.vx) + Math.abs(r.vz) < 0.15) { r.settled = true; r.vx = r.vz = 0; }
    }
  } else r.ground = false;
}

// 血しぶきの形(2x2 マス、白 + 透明度)
function splatTexture() {
  const S = 512, H = S / 2;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  let seed = 99;
  const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * H, oy = (t >> 1) * H, cx = ox + H / 2, cy = oy + H / 2;
    c.save(); c.beginPath(); c.rect(ox, oy, H, H); c.clip();
    // かたまり
    for (let i = 0; i < 9; i++) {
      const a = rr() * 6.28, d = rr() * H * 0.14, r = H * (0.06 + rr() * 0.13);
      c.fillStyle = `rgba(${200 + rr() * 55 | 0},${200 + rr() * 55 | 0},${200 + rr() * 55 | 0},0.95)`;
      c.beginPath(); c.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.6 + rr() * 0.4), rr() * 3, 0, 7); c.fill();
    }
    // 飛び散ったしずく(向き = 上下 に のびる)
    for (let i = 0; i < 16; i++) {
      const a = rr() * 6.28, d = H * (0.16 + rr() * 0.2), r = 2 + rr() * 5;
      c.fillStyle = 'rgba(240,240,240,0.95)';
      c.beginPath(); c.ellipse(cx + Math.cos(a) * d * 0.7, cy + Math.sin(a) * d, r, r * (1 + rr() * 1.5), a + 1.57, 0, 7); c.fill();
    }
    for (let i = 0; i < 6; i++) {
      const a = rr() * 6.28, d = H * 0.12;
      c.strokeStyle = 'rgba(240,240,240,0.9)'; c.lineWidth = 3 + rr() * 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); c.lineTo(cx + Math.cos(a) * d * 2.6, cy + Math.sin(a) * d * 3); c.stroke();
    }
    // 中は少し濃く(ぬれた感じ)
    c.fillStyle = 'rgba(160,160,160,0.25)';
    c.beginPath(); c.ellipse(cx - 6, cy - 6, H * 0.08, H * 0.06, 0.4, 0, 7); c.fill();
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _gi = new THREE.Matrix4(), _cm = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _sv = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _e = new THREE.Euler(), _c = new THREE.Color();
const _ax = new THREE.Vector3(), _u = new THREE.Vector3(), _h = new THREE.Vector3(), _f = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _down = new THREE.Vector3(0, -1, 0), _xA = new THREE.Vector3(1, 0, 0), _yA = new THREE.Vector3(0, 1, 0);
