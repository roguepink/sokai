// キャラ係: ボスの攻撃の道具。地面たたき(衝撃波)・帯・扇・足音・咆哮・光線、投げる物(岩・車・バス・火の玉・ミサイル・酸・糸・卵 …)。
// 主人公に当たると Player.knock で吹っとばし、イベント heroHit {x,z,force,boss,dirX,dirZ,kind} を出す。
// まわりのゾンビ・こわせる物も まきこむ(ボス自身・ほかのボスには当たらない cause を使う = BOSS_CAUSES)。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, blob, skinTex, plateTex } from './boss-kit.js';

// ボスの攻撃の名前(zombies.js がボスに当てないために使う)
export const BOSS_CAUSES = ['slam', 'boss', 'cleaver', 'leap', 'stomp', 'car', 'acid', 'tank', 'throw', 'quake', 'club', 'breath', 'bossfire',
  'beam', 'missile', 'web', 'bite', 'swallow', 'lance', 'train', 'boulder', 'bus', 'gust', 'claw', 'sweep', 'bossfall', 'roar', 'egg', 'flesh', 'skull', 'laser'];

const _v = new THREE.Vector3();
export function act(e, a, x, z) { Events.emit('bossAct', { type: e.type, act: a, x: x ?? e.x, z: z ?? e.z, e }); }

// 主人公までの距離による 画面ゆれ
export function quake(B, x, z, amt, far = 70) {
  const p = B._player; if (!p) return;
  const d = Math.hypot(p.pos.x - x, p.pos.z - z);
  const k = clamp(1 - d / far, 0, 1);
  if (k > 0) Engine.shake(min(2, amt * (0.35 + 0.65 * k)));
}

// ---------------- 主人公に当てる ----------------
// (fx,fz) から 外へ吹っとばす。dir を渡せば その向き
export function hitHero(B, e, fx, fz, force, lift = 0, kind = 'hit', dirX = 0, dirZ = 0) {
  const P = B._player; if (!P || !P.knock) return false;
  if (!dirX && !dirZ) { dirX = P.pos.x - fx; dirZ = P.pos.z - fz; if (Math.hypot(dirX, dirZ) < 0.01) { dirX = P.pos.x - e.x; dirZ = P.pos.z - e.z; } }
  const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
  if (!P.knock(dirX, dirZ, force, lift, e)) return false;
  const x = P.pos.x, z = P.pos.z;
  FX.burst({ x, y: 1.1, z, count: 22, color: 0xffd8a0, speed: 9, up: 4, life: 0.35, size: 0.12, grav: 4, drag: 3 });
  FX.burst({ x, y: 0.4, z, count: 12, color: 0x5a5048, speed: 5, up: 3, life: 0.8, size: 0.4, drag: 2 });
  if (FX.ring) FX.ring(x, z, 0.3, 3.2, 0.3, 0xff6a3a, 0.4, 2.5, 0.9);
  Events.emit('heroHit', { x, z, force, boss: e, name: e && e.name, type: e && e.type, dirX, dirZ, kind, lift });
  return true;
}
export function heroDist(B, x, z) { const P = B._player; return P ? Math.hypot(P.pos.x - x, P.pos.z - z) : 999; }
export function heroIn(B, x, z, r) { const P = B._player; return !!P && heroDist(B, x, z) < r + P.radius && (P.pos.y || 0) < 3.5; }

// ---------------- 地面をたたく(衝撃波) ----------------
// o: {dmg, force, hero(吹っとばす強さ), lift, cause, col(光の色), big(大きな演出), world(こわす強さ), dust}
export function slam(B, e, x, z, r, o = {}) {
  const dmg = o.dmg ?? 600, cause = o.cause || 'stomp';
  const n = FX.q(o.big ? 34 : 22);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R(-0.1, 0.1), s = r * R(1.6, 2.6);
    FX.smoke(x + cos(a) * r * 0.25, 0.4, z + sin(a) * r * 0.25, r * 0.09 + 0.4, R(0.9, 1.5), o.dust ?? 0x6f6455, cos(a) * s, R(0.4, 2), sin(a) * s, 0.55);
  }
  FX.debris(x, 0.5, z, o.big ? 18 : 10, r * 1.3, 0x4a4038, 0.25 + r * 0.02, 2.4);
  FX.burst({ x, y: 0.5, z, count: o.big ? 40 : 24, color: o.col ?? 0xffc080, speed: r * 1.6, up: r * 0.9, life: 0.5, size: 0.18, drag: 2 });
  if (FX.ring) {
    FX.ring(x, z, r * 0.15, r * 1.25, 0.5, o.col ?? 0xffb070, 0.6 + r * 0.05, 2.4, 1);
    FX.ring(x, z, r * 0.1, r * 0.85, 0.35, 0xff5a2a, 0.4 + r * 0.06, 2.2, 0.8, 1);
  }
  FX.decal(x, z, r * 0.65, 'scorch', 30);
  Gore.splat(x, z, r * 0.45, 0, 0, 1, 0x1c1814, 0.65);
  if (o.big) FX.flash(x, 4, z, o.col ?? 0xff9a50, 40 + r * 6, r * 5, 0.35);
  quake(B, x, z, o.shake ?? (0.7 + r * 0.06));
  Engine.hitStop(o.big ? 0.05 : 0.02);
  Events.emit('explosion', { x, z, radius: r, source: 'boss' });
  B._Z.damageCircle(x, z, r, dmg, { force: o.force ?? 26, cause, falloff: true });
  if (World.damage) try { World.damage(x, z, r * 0.8, o.world ?? 900, { cause: 'explosion' }); } catch (err) {}
  if (heroIn(B, x, z, r)) hitHero(B, e, x, z, o.hero ?? 20, o.lift ?? 6, o.kind || cause);
}

// ---------------- まっすぐの帯に当てる ----------------
export function line(B, e, x, z, dx, dz, len, w, o = {}) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const step = max(1.5, w * 0.7), n = Math.ceil(len / step);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * len, px = x + dx * t, pz = z + dz * t;
    B._Z.damageCircle(px, pz, w * 0.6, o.dmg ?? 600, { force: o.force ?? 22, cause: o.cause || 'sweep', falloff: false, dirX: dx, dirZ: dz });
    if (o.fx !== false && i % 2 === 0) {
      FX.smoke(px, 0.4, pz, w * 0.18 + 0.3, R(0.7, 1.2), o.dust ?? 0x6f6455, R(-2, 2), R(1, 3), R(-2, 2), 0.5);
      FX.burst({ x: px, y: 0.5, z: pz, count: 4, color: o.col ?? 0xffb070, speed: 5, up: 4, life: 0.4, size: 0.14 });
    }
    if (World.damage && i % 2 === 0) try { World.damage(px, pz, w * 0.6, o.world ?? 600, { cause: 'explosion' }); } catch (err) {}
  }
  if (o.decal !== false) for (let i = 0; i < n; i += 2) FX.decal(x + dx * (i / n) * len, z + dz * (i / n) * len, w * 0.45, 'scorch', 20);
  quake(B, x + dx * len / 2, z + dz * len / 2, o.shake ?? 0.9);
  // 主人公: 線までの距離
  const P = B._player;
  if (P) {
    const hx = P.pos.x - x, hz = P.pos.z - z, t = clamp(hx * dx + hz * dz, 0, len);
    const qx = hx - dx * t, qz = hz - dz * t;
    if (Math.hypot(qx, qz) < w / 2 + P.radius && (P.pos.y || 0) < 3.5) {
      // 帯の横へ(+少し前へ)はじく
      const side = Math.sign(qx * -dz + qz * dx) || 1;
      const kx = o.push ? dx : -dz * side * 0.8 + dx * 0.6, kz = o.push ? dz : dx * side * 0.8 + dz * 0.6;
      hitHero(B, e, x, z, o.hero ?? 22, o.lift ?? 5, o.kind || o.cause || 'sweep', kx, kz);
    }
  }
}

// ---------------- 扇(なぎはらい・息・突風) ----------------
const _near = [];
export function cone(B, e, x, z, dx, dz, len, half, o = {}) {
  const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const c0 = cos(half);
  B._Z.queryCircle(x, z, len, _near);
  const opt = { dirX: 0, dirZ: 0, force: o.force ?? 20, cause: o.cause || 'sweep' };
  for (let i = 0; i < _near.length; i++) {
    const t = _near[i]; if (!t.alive || t.boss) continue;
    const ex = t.x - x, ez = t.z - z, d = Math.hypot(ex, ez) || 1;
    if ((ex * dx + ez * dz) / d < c0) continue;
    opt.dirX = ex / d; opt.dirZ = ez / d;
    B._Z.damage(t, o.dmg ?? 500, opt);
    if (o.burn && t.alive) { t.burn = max(t.burn, 3); t.burnDps = max(t.burnDps, 60); }
  }
  _near.length = 0;
  if (World.damage && o.world !== 0) try { World.damage(x + dx * len * 0.6, z + dz * len * 0.6, len * 0.4, o.world ?? 500, { cause: o.burn ? 'fire' : 'explosion' }); } catch (err) {}
  const P = B._player;
  if (P && o.hero !== 0) {
    const hx = P.pos.x - x, hz = P.pos.z - z, d = Math.hypot(hx, hz) || 1;
    if (d < len + P.radius && (hx * dx + hz * dz) / d > c0 - 0.05 && (P.pos.y || 0) < 3.5) hitHero(B, e, x, z, o.hero ?? 18, o.lift ?? 4, o.kind || o.cause || 'sweep', hx / d, hz / d);
  }
}

// ---------------- 足音(ずしん) ----------------
export function step(B, e, x, z, s = 1) {
  const sz = e.size || 10;
  const r = 1.2 + sz * 0.12 * s;
  FX.smoke(x, 0.3, z, r * 0.5, 1.0, 0x6f6455, R(-1, 1), 0.6, R(-1, 1), 0.5);
  for (let i = 0; i < FX.q(6); i++) { const a = R(0, TAU); FX.smoke(x, 0.25, z, r * 0.3, R(0.6, 1), 0x6f6455, cos(a) * r * 2.5, 0.5, sin(a) * r * 2.5, 0.45); }
  if (FX.ring) FX.ring(x, z, 0.2, r * 1.6, 0.35, 0x9a8a70, 0.3, 1.2, 0.6);
  FX.decal(x, z, r * 0.5, 'scorch', 12);
  quake(B, x, z, 0.25 + sz * 0.025 * s, 50);
  B._Z.damageCircle(x, z, r, 400, { force: 14, cause: 'stomp', falloff: false });
  if (World.damage) try { World.damage(x, z, r, 300, { cause: 'explosion' }); } catch (err) {}
  if (heroIn(B, x, z, r * 0.8)) hitHero(B, e, x, z, 12, 3, 'stomp');
  const d = heroDist(B, x, z);
  if (d < 70) Events.emit('giantStep', { x, z, d, boss: true, size: sz, s });
}

// ---------------- 咆哮(まわりのゾンビが ひるむ・吹っとぶ) ----------------
export function roarBlast(B, e, r = 14, big = false) {
  const x = e.x, z = e.z;
  if (FX.ring) { FX.ring(x, z, 1, r * 1.4, 0.7, big ? 0xff3a1a : 0xffd0a0, 1.2, 2, 0.8); FX.ring(x, z, 0.5, r, 0.5, 0xffffff, 0.6, 1.5, 0.5); }
  B._Z.damageCircle(x, z, r, big ? 260 : 90, { force: 30, cause: 'roar', falloff: true });
  quake(B, x, z, big ? 1.4 : 0.8, 90);
  Engine.fovKick && Engine.fovKick(big ? 10 : 5);
  if (heroIn(B, x, z, r * 0.45)) hitHero(B, e, x, z, 14, 3, 'roar');
}

// ---------------- 光線(1 ステップぶん)。(x0,y0,z0) → 地面 (x1,z1) ----------------
export function beamTick(B, e, x0, y0, z0, x1, z1, w, dmg, col = 0xff3010, cause = 'beam', dt = 1 / 60) {
  FX.beam(x0, y0, z0, x1, 0.3, z1, col, w, -1, 5, 1);
  FX.beam(x0, y0, z0, x1, 0.3, z1, 0xffffff, w * 0.35, -1, 4, 1);
  FX.glow(x0, y0, z0, w * 2.2, col, 4);
  FX.glow(x1, 0.4, z1, w * 3, col, 4);
  if (Math.random() < 0.7) FX.burst({ x: x1, y: 0.4, z: z1, count: 3, color: col, speed: 7, up: 5, life: 0.4, size: 0.14, grav: 9 });
  if (Math.random() < 0.35) FX.smoke(x1, 0.5, z1, 0.8, 1.2, 0x2a2420, 0, 2, 0, 0.5);
  if (Math.random() < dt * 25) FX.decal(x1, z1, w * 1.2, 'scorch', 20);
  B._Z.damageCircle(x1, z1, w * 1.6, dmg * dt, { force: 6, cause, falloff: false });
  if (World.damage && Math.random() < dt * 10) try { World.damage(x1, z1, w * 1.5, 400, { cause: 'fire' }); } catch (err) {}
  if (heroIn(B, x1, z1, w * 1.4)) hitHero(B, e, x1, z1, 16, 4, cause);
}

// =====================================================================
// 投げる物・飛ぶ物
// kind: rock / car / bus / fire / acid / missile / web / egg / flesh / skull / shell
// 落ちる所に 予告の円(Warn)を出す。T 秒で (tx,tz) に落ちる
// =====================================================================
const PROJ = [];
const MESHES = {};       // kind → [mesh ...]
let _scene = null;

function buildCar(col) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: col, roughness: 0.45, metalness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.3, metalness: 0.2 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
  add(new THREE.BoxGeometry(1.8, 0.6, 4.0), body, 0, 0, 0);
  add(new THREE.BoxGeometry(1.6, 0.55, 2.0), dark, 0, 0.55, 0.2);
  add(new THREE.BoxGeometry(1.62, 0.08, 2.02), body, 0, 0.85, 0.2);
  const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12); wg.rotateZ(PI / 2);
  for (const [x, z] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.3], [0.85, 1.3]]) add(wg, tire, x, -0.3, z);
  return g;
}
function buildBus() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ map: plateTex('#c89a20', { grid: 128, blood: 6 }), roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18202a, roughness: 0.2, metalness: 0.4 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
  add(new THREE.BoxGeometry(2.5, 2.6, 10), body, 0, 0.6, 0);
  add(new THREE.BoxGeometry(2.56, 0.8, 9.2), dark, 0, 1.2, 0.2);
  const wg = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12); wg.rotateZ(PI / 2);
  for (const [x, z] of [[-1.2, -3.4], [1.2, -3.4], [-1.2, 3.4], [1.2, 3.4]]) add(wg, tire, x, -0.75, z);
  return g;
}
function newMesh(kind) {
  let o;
  if (kind === 'rock') o = new THREE.Mesh(blob(1, 0.28, R(0, 9), 10, 8), new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95, flatShading: true }));
  else if (kind === 'car') o = buildCar([0x8a2020, 0x2a4a7a, 0xc8c8c8, 0x3a6a3a][(Math.random() * 4) | 0]);
  else if (kind === 'bus') o = buildBus();
  else if (kind === 'acid' || kind === 'egg') o = new THREE.Mesh(new THREE.SphereGeometry(kind === 'egg' ? 0.8 : 0.5, 10, 8), new THREE.MeshStandardMaterial(kind === 'egg'
    ? { map: skinTex('#d8d090', { wounds: 2, veins: 30, vein: 'rgba(140,40,40,0.6)', drips: 2 }), roughness: 0.4, emissive: 0x404010, emissiveIntensity: 0.4 }
    : { color: 0x9ad020, emissive: 0x6a9a10, emissiveIntensity: 0.9, roughness: 0.3 }));
  else if (kind === 'web') o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshStandardMaterial({ color: 0xe8e8f0, emissive: 0x606070, roughness: 0.9, transparent: true, opacity: 0.85 }));
  else if (kind === 'flesh') o = new THREE.Mesh(blob(1, 0.3, R(0, 9), 12, 9), new THREE.MeshStandardMaterial({ map: skinTex('#8a6a60', { wounds: 14 }), roughness: 0.6 }));
  else if (kind === 'missile' || kind === 'shell') {
    const g = new THREE.Group();
    const m1 = new THREE.MeshStandardMaterial({ color: kind === 'shell' ? 0x3a3a30 : 0xd8d8d0, roughness: 0.4, metalness: 0.5 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 8), m1); b.rotation.x = PI / 2; g.add(b);
    const n = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xc02010, roughness: 0.4 })); n.rotation.x = -PI / 2; n.position.z = -0.8; g.add(n);
    o = g;
  } else o = new THREE.Object3D();         // fire / skull は 光の粒だけ
  o.visible = false;
  o.traverse((c) => { if (c.isMesh) c.castShadow = kind === 'car' || kind === 'bus' || kind === 'rock' || kind === 'flesh'; });
  return o;
}
function getMesh(kind) {
  const L = MESHES[kind] || (MESHES[kind] = []);
  let o = L.find((x) => !x.userData.busy);
  if (!o) { if (L.length > 14) return null; o = newMesh(kind); L.push(o); _scene.add(o); }
  o.userData.busy = true; o.visible = true;
  return o;
}

// 前もって 少し作っておく(初めて投げたときに 固まらないように)
export function initProjectiles(scene) {
  _scene = scene;
  for (const k of ['rock', 'car', 'fire', 'missile', 'acid']) { const o = getMesh(k); if (o) { o.userData.busy = false; o.visible = false; } }
}

// 投げる。o: {r(爆発の半径), dmg, hero, lift, size(見た目の大きさ), T, onLand(fn), spin, col, homing}
export function throwAt(B, e, kind, x, y, z, tx, tz, T, o = {}) {
  const mesh = getMesh(kind);
  const p = { kind, mesh, x, y, z, tx, tz, T, t: 0, e, o, vx: (tx - x) / T, vz: (tz - z) / T, vy: 0, g: o.g ?? 22, wx: R(-3, 3), wz: R(-3, 3), trail: 0 };
  p.vy = ((o.ty ?? 0.5) - y) / T + 0.5 * p.g * T;
  if (mesh) { mesh.position.set(x, y, z); mesh.scale.setScalar(o.size || 1); mesh.rotation.set(R(0, 3), R(0, 3), 0); }
  PROJ.push(p);
  return p;
}

export function resetProjectiles() {
  WAVES.length = 0;
  for (const p of PROJ) if (p.mesh) { p.mesh.visible = false; p.mesh.userData.busy = false; }
  PROJ.length = 0;
}

// ---------------- 広がる衝撃波の輪(ジャンプで よけられる) ----------------
const WAVES = [];
const _wq = [];
export function ringWave(B, e, x, z, o = {}) {
  WAVES.push({ e, x, z, r: o.r0 ?? 2, v: o.speed ?? 18, max: o.max ?? 28, w: o.w ?? 2.2, dmg: o.dmg ?? 700, hero: o.hero ?? 20, col: o.col ?? 0xffa060, hit: false, t: 0 });
}
function stepWaves(B, dt) {
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const w = WAVES[i];
    const r0 = w.r; w.r += w.v * dt; w.t += dt;
    if (w.r > w.max) { WAVES.splice(i, 1); continue; }
    const k = 1 - w.r / w.max;
    if (FX.ring) { FX.ring(w.x, w.z, w.r, w.r, -1, w.col, w.w * 0.8, 3, 0.9 * k + 0.1); FX.ring(w.x, w.z, w.r - w.w * 0.6, w.r - w.w * 0.6, -1, 0xffffff, w.w * 0.25, 2, 0.6 * k); }
    if (Math.random() < 0.6) { const a = R(0, TAU); FX.smoke(w.x + cos(a) * w.r, 0.4, w.z + sin(a) * w.r, 1.2, 0.8, 0x6f6455, cos(a) * 4, 1.5, sin(a) * 4, 0.5); }
    // 輪の帯の中の ゾンビ
    B._Z.queryCircle(w.x, w.z, w.r + w.w, _wq);
    const opt = { dirX: 0, dirZ: 0, force: 24, cause: 'quake' };
    for (let j = 0; j < _wq.length; j++) {
      const t = _wq[j]; if (!t.alive || t.boss) continue;
      const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz) || 1;
      if (d < r0 - w.w) continue;
      opt.dirX = dx / d; opt.dirZ = dz / d;
      B._Z.damage(t, w.dmg, opt);
    }
    _wq.length = 0;
    const P = B._player;
    if (P && !w.hit) {
      const d = Math.hypot(P.pos.x - w.x, P.pos.z - w.z);
      if (d < w.r + P.radius && d > r0 - w.w - P.radius && (P.pos.y || 0) < 1.2) { w.hit = true; hitHero(B, w.e, w.x, w.z, w.hero, 6, 'quake'); }
    }
  }
}

export function stepProjectiles(B, dt) {
  stepWaves(B, dt);
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const p = PROJ[i], o = p.o;
    p.t += dt;
    const k = p.t / p.T;
    // 予告: 落ちる所に 赤い円
    if (o.warn !== false) Warn.circle(p.tx, p.tz, o.r ?? 5, k, o.warnCol);
    if (o.homing && B._player && k < 0.7) {     // 少しだけ 主人公を追う(ミサイル)
      const P = B._player, ax = P.pos.x - p.tx, az = P.pos.z - p.tz, h = min(1, dt * o.homing);
      p.tx += ax * h; p.tz += az * h;
      const left = max(0.05, p.T - p.t);
      p.vx += ((p.tx - p.x) / left - p.vx) * min(1, dt * 6); p.vz += ((p.tz - p.z) / left - p.vz) * min(1, dt * 6);
    }
    p.vy -= p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const m = p.mesh;
    if (m) {
      m.position.set(p.x, p.y, p.z);
      if (p.kind === 'missile' || p.kind === 'shell') { _v.set(p.x + p.vx, p.y + p.vy, p.z + p.vz); m.lookAt(_v); m.rotateY(PI); }
      else { m.rotation.x += p.wx * dt; m.rotation.z += p.wz * dt; }
    }
    // 飛んでいる見た目
    const kd = p.kind;
    if (kd === 'fire' || kd === 'skull') {
      const s = o.size || 1;
      FX.glow(p.x, p.y, p.z, 1.6 * s, kd === 'skull' ? 0x60ff90 : 0xff8a20, 4);
      FX.glow(p.x, p.y, p.z, 0.8 * s, 0xffffff, 3);
      if (Math.random() < 0.9) FX.flame(p.x + R(-0.3, 0.3) * s, p.y, p.z + R(-0.3, 0.3) * s, -p.vx * 0.1, 1, -p.vz * 0.1, 0.9 * s, 0.5, kd === 'skull' ? 0xa0ffb0 : 0xffb050, kd === 'skull' ? 0x108a30 : 0xc02a06);
    } else if (kd === 'missile' || kd === 'shell') {
      FX.glow(p.x - p.vx * 0.03, p.y, p.z - p.vz * 0.03, 0.5, 0xffa040, 4);
      if (Math.random() < 0.8) FX.smoke(p.x, p.y, p.z, 0.35, 0.9, 0x8a8a8a, 0, 0.3, 0, 0.5);
    } else if (kd === 'acid') {
      if (Math.random() < 0.6) FX.burst({ x: p.x, y: p.y, z: p.z, count: 1, color: 0xb8e040, speed: 0.5, up: 0, life: 0.4, size: 0.18, grav: 4 });
    } else if (kd === 'car' || kd === 'bus' || kd === 'rock' || kd === 'flesh') {
      if (Math.random() < 0.5) FX.smoke(p.x, p.y, p.z, 0.6 * (o.size || 1), 0.9, 0x3a3a3a, 0, 0.5, 0, 0.45);
    }
    if (p.y > 0.4 || p.vy > 0) continue;
    // 着地
    PROJ.splice(i, 1);
    if (m) { m.visible = false; m.userData.busy = false; }
    land(B, p);
  }
}

function land(B, p) {
  const o = p.o, x = p.x, z = p.z, r = o.r ?? 5, e = p.e, kd = p.kind;
  if (kd === 'acid') {
    FX.burst({ x, y: 0.4, z, count: 34, color: 0xa8e030, speed: 7, up: 4, life: 0.7, size: 0.16 });
    FX.smoke(x, 0.5, z, 1.6, 1.8, 0x8ab030, 0, 0.6, 0, 0.45);
    Gore.splat(x, z, r * 0.8, 0, 0, 1, 0x6a8a10, 0.85);
    if (FX.ring) FX.ring(x, z, 0.2, r, 0.4, 0x9aff30, 0.5, 2, 0.8, 1);
    B._Z.damageCircle(x, z, r, o.dmg ?? 500, { force: 8, cause: 'acid', falloff: true });
    if (heroIn(B, x, z, r * 0.8)) hitHero(B, e, x, z, o.hero ?? 10, o.lift ?? 2, 'acid');
    Events.emit('bossAct', { type: e && e.type, act: 'acidHit', x, z, e });
  } else if (kd === 'web') {
    FX.burst({ x, y: 0.5, z, count: 30, color: 0xe8e8ff, speed: 7, up: 3, life: 0.6, size: 0.12 });
    FX.decal(x, z, r * 0.9, 'ice', 18);
    if (FX.ring) FX.ring(x, z, 0.2, r, 0.5, 0xe0e0ff, 0.5, 1.5, 0.8, 1);
    B._Z.damageCircle(x, z, r, o.dmg ?? 200, { force: 0, cause: 'web' });
    const L = B._Z.queryCircle(x, z, r, _near);
    for (const t of L) if (t.alive && !t.boss) t.frozen = max(t.frozen, 2.5);
    _near.length = 0;
    if (heroIn(B, x, z, r * 0.8)) hitHero(B, e, x, z, o.hero ?? 9, 1.5, 'web');
  } else if (kd === 'egg') {
    FX.burst({ x, y: 0.6, z, count: 30, color: 0xd8d080, speed: 7, up: 5, life: 0.6, size: 0.16 });
    Gore.splat(x, z, 2.5, 0, 0, 1, 0x6a7a10, 0.8);
    for (let i = 0; i < (o.spawn || 4); i++) { const a = R(0, TAU); const c = B._Z.spawn(o.spawnType || 'imp', x + cos(a), z + sin(a)); if (c) { c.kx = cos(a) * 6; c.kz = sin(a) * 6; } }
    B._Z.damageCircle(x, z, r, o.dmg ?? 300, { force: 14, cause: 'egg', falloff: true });
    if (heroIn(B, x, z, r * 0.7)) hitHero(B, e, x, z, o.hero ?? 12, 2, 'egg');
  } else if (kd === 'flesh') {
    Gore.chunks(x, 1, z, 14, 9, 7, 0, 0, 0x6a0808, 2);
    Gore.splat(x, z, r * 0.7, 0, 0, 1);
    FX.burst({ x, y: 0.8, z, count: 30, color: 0x7a0808, speed: 8, up: 5, life: 0.8, size: 0.16 });
    for (let i = 0; i < (o.spawn || 3); i++) { const a = R(0, TAU); const c = B._Z.spawn(Math.random() < 0.5 ? 'walker' : 'runner', x + cos(a) * 1.5, z + sin(a) * 1.5); if (c) { c.kx = cos(a) * 7; c.kz = sin(a) * 7; c.stun = 0.4; } }
    slam(B, e, x, z, r, { dmg: o.dmg ?? 500, hero: o.hero ?? 18, lift: 4, cause: 'flesh', shake: 0.8 });
  } else if (kd === 'rock') {
    FX.debris(x, 0.8, z, 16, 12, 0x6a6258, 0.35 * (o.size || 1), 3);
    slam(B, e, x, z, r, { dmg: o.dmg ?? 900, hero: o.hero ?? 22, lift: 6, cause: 'boulder', big: (o.size || 1) > 1.6 });
  } else {
    // 爆発する物(車・バス・火の玉・ミサイル・砲弾・ドクロ)
    const kindFx = kd === 'skull' ? 'acid' : kd === 'fire' ? 'meteor' : 'fire';
    FX.explosion(x, z, r, kindFx);
    if (kd === 'fire' || kd === 'skull') { FX.decal(x, z, r * 0.8, 'scorch', 25); if (World.addFire && Math.random() < 0.5) try { World.addFire(x, 0.2, z, 1.2, 5); } catch (err) {} }
    const kills = B._Z.damageCircle(x, z, r, o.dmg ?? 1200, { force: 30, cause: kd === 'car' ? 'car' : kd === 'bus' ? 'bus' : kd === 'missile' || kd === 'shell' ? 'missile' : 'bossfire', falloff: true });
    if (kd === 'fire' || kd === 'skull') { const L = B._Z.queryCircle(x, z, r, _near); for (const t of L) if (t.alive && !t.boss) { t.burn = max(t.burn, 3); t.burnDps = max(t.burnDps, 50); } _near.length = 0; }
    if (World.damage) try { World.damage(x, z, r * 0.9, 900, { cause: 'explosion' }); } catch (err) {}
    quake(B, x, z, 0.6 + r * 0.08);
    Engine.hitStop(0.03);
    Gore.splat(x, z, r * 0.5, 0, 0, 1, 0x1a1410, 0.75);
    Events.emit('explosion', { x, z, radius: r, source: kd, kills });
    if (heroIn(B, x, z, r)) hitHero(B, e, x, z, o.hero ?? 22, o.lift ?? 7, kd);
    if (kd === 'car' || kd === 'bus') wreck(kd, x, z, p);
  }
  if (o.onLand) o.onLand(x, z);
}

// 落ちた車・バスは しばらく燃えて残る
const WRECKS = [];
function wreck(kind, x, z, p) {
  const m = getMesh(kind); if (!m) return;
  m.position.set(x, kind === 'bus' ? 1.3 * (p.o.size || 1) : 0.55, z);
  m.scale.setScalar(p.o.size || 1);
  m.rotation.set(Math.random() < 0.5 ? PI : 0, R(0, TAU), R(-0.2, 0.2));
  WRECKS.push({ m, t: 6 });
}
export function stepWrecks(dt) {
  for (let i = WRECKS.length - 1; i >= 0; i--) {
    const w = WRECKS[i];
    w.t -= dt;
    if (Math.random() < dt * 12) FX.flame(w.m.position.x + R(-1, 1), 1, w.m.position.z + R(-1, 1), 0, 2, 0, 0.8, 0.7);
    if (w.t < 1) w.m.position.y -= dt * 1.2;
    if (w.t <= 0) { w.m.visible = false; w.m.userData.busy = false; WRECKS.splice(i, 1); }
  }
}
export function resetWrecks() { for (const w of WRECKS) { w.m.visible = false; w.m.userData.busy = false; } WRECKS.length = 0; }

// =====================================================================
// 行動の道具: 攻撃をえらぶ / はじめる / おわる
// list = [[名前, 最小距離, 最大距離, 重み, 怒りの段階(0..2)]]
// =====================================================================
export function pick(e, d, list) {
  let tot = 0;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (d >= a[1] && d <= a[2] && e.phase >= (a[4] || 0) && a[0] !== e.last) tot += a[3]; }
  if (tot <= 0) return null;
  let r = Math.random() * tot;
  for (let i = 0; i < list.length; i++) { const a = list[i]; if (d >= a[1] && d <= a[2] && e.phase >= (a[4] || 0) && a[0] !== e.last) { r -= a[3]; if (r <= 0) return a[0]; } }
  return null;
}
export function begin(e, name) { e.state = name; e.st = 0; e.n = 0; e.hitDone = 0; e.last = name; e.lockFace = false; act(e, name); return 0; }
export function done(e, cool, c) { e.state = 'walk'; e.st = 0; e.n = 0; e.hitDone = 0; e.lockFace = false; e.cool = cool * (c ? c.cm : 1); return 0; }
// 向きを 固定して 前の方向を覚える
export function lock(e, c) { e.lockFace = true; e.ax = sin(e.face); e.az = -cos(e.face); e.tx = c.px; e.tz = c.pz; }
// 主人公の少し先(動いている向き)
export function lead(c, sec) { const v = c.player.vel; return [c.px + v.x * sec, c.pz + v.z * sec]; }
// 前方の点
export function fwd(e, dist, side = 0) { const fx = sin(e.face), fz = -cos(e.face); return [e.x + fx * dist - fz * side, e.z + fz * dist + fx * side]; }
