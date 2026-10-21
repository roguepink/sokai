// 主人公: 見た目・移動・向き・動き(剣をふる・回転斬り・撃った反動)。体力は無限(死なない)。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { damp, dampAngle } from './util.js';

const P = CONFIG.PLAYER;

export const Player = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  facing: 0,                // 向き(ラジアン)。0 = 北(-z)、PI/2 = 東(+x)
  aimDir: new THREE.Vector3(0, 0, -1),   // 狙っている向き(XZ、長さ1)。武器係が毎フレーム決める
  aiming: false,            // 撃っている間 true(移動の向きではなく狙いの向きを向く)
  radius: P.RADIUS,
  mesh: null,
  parts: {},                // 体の部品(動かすため)
  _swing: 0, _spin: 0, _recoil: 0, _walk: 0,

  init(scene) {
    this.mesh = buildHero();
    this.parts = this.mesh.userData.parts;
    scene.add(this.mesh);
  },

  reset() { this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); this.facing = 0; },

  update(dt, input) {
    // 移動(壁で止まる・すべる)
    const sp = P.SPEED;
    this.vel.x = damp(this.vel.x, input.move.x * sp, 14, dt);
    this.vel.z = damp(this.vel.z, input.move.z * sp, 14, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    World.collideCircle(this.pos, this.radius);

    // 向き: 撃っている間は狙いの方、それ以外は進む方
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    let want = this.facing;
    if (this.aiming) want = Math.atan2(this.aimDir.x, -this.aimDir.z);
    else if (moving) want = Math.atan2(this.vel.x, -this.vel.z);
    this.facing = dampAngle(this.facing, want, 18, dt);

    this._animate(dt, moving);
  },

  // ---------- 動き(武器係が呼ぶ) ----------
  swing() { this._swing = 1; },            // 剣をふる(近くの敵)
  spin() { this._spin = 1; },              // 回転斬り
  recoil(s = 0.3) { this._recoil = Math.min(1, this._recoil + s); },
  // 武器の見た目をつける(武器係が作った Object3D を右手に持たせる。null で外す)
  holdWeapon(obj) {
    const hand = this.parts.gunMount;
    while (hand.children.length) hand.remove(hand.children[0]);
    if (obj) hand.add(obj);
  },
  // 銃口の位置(弾が出る所。ワールド座標)
  muzzle(out = new THREE.Vector3()) {
    const f = this.facing;
    return out.set(this.pos.x + Math.sin(f) * 0.9 + Math.cos(f) * 0.25, 1.3, this.pos.z - Math.cos(f) * 0.9 + Math.sin(f) * 0.25);
  },

  _animate(dt, moving) {
    const m = this.mesh, pr = this.parts;
    m.position.copy(this.pos);
    // 回転斬り中は くるくる回る
    let spinAng = 0;
    if (this._spin > 0) { spinAng = (1 - this._spin) * Math.PI * 4; this._spin = Math.max(0, this._spin - dt * 2.2); }
    m.rotation.y = -this.facing - spinAng;
    // 歩き
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this._walk += dt * speed * 1.4;
    const sw = moving ? Math.sin(this._walk) : 0;
    pr.legL.rotation.x = sw * 0.7; pr.legR.rotation.x = -sw * 0.7;
    pr.body.position.y = 1.0 + (moving ? Math.abs(Math.cos(this._walk)) * 0.06 : 0);
    // 剣をふる
    if (this._swing > 0) this._swing = Math.max(0, this._swing - dt * 5);
    const s = this._swing;
    // 腕の角度: rotation.x が + で前へ上がる(0 = 下, 1.57 = 前, 3.1 = 真上)
    pr.armL.rotation.x = s > 0 ? 0.2 + s * 2.7 : 0.25 + sw * 0.5;
    pr.armL.rotation.z = s > 0 ? -0.5 * Math.sin(s * Math.PI) : 0;
    if (this._spin > 0) { pr.armL.rotation.x = 0; pr.armL.rotation.z = -1.5; }
    // 撃った反動
    this._recoil = Math.max(0, this._recoil - dt * 6);
    pr.armR.rotation.x = 1.45 + this._recoil * 0.35;
  },
};

// 主人公の見た目(仮)。キャラ係が作りこむ
function buildHero() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77e, roughness: 0.7 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x1d2633, roughness: 0.6, metalness: 0.2 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.4, metalness: 0.5 });
  const blade = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x3aa0ff, emissiveIntensity: 1.6, metalness: 1, roughness: 0.2 });
  const mk = (geo, mat, x, y, z, parent) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; (parent || g).add(o); return o; };

  const body = new THREE.Group(); body.position.y = 1.0; g.add(body);
  mk(new THREE.CapsuleGeometry(0.32, 0.5, 4, 10), suit, 0, 0.25, 0, body);
  mk(new THREE.BoxGeometry(0.7, 0.3, 0.42), armor, 0, 0.5, 0, body);
  mk(new THREE.SphereGeometry(0.22, 16, 12), skin, 0, 0.92, 0, body);
  const legL = new THREE.Group(); legL.position.set(-0.15, 0.95, 0); g.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.15, 0.95, 0); g.add(legR);
  mk(new THREE.CapsuleGeometry(0.12, 0.65, 4, 8), suit, 0, -0.45, 0, legL);
  mk(new THREE.CapsuleGeometry(0.12, 0.65, 4, 8), suit, 0, -0.45, 0, legR);
  // 左手 = 剣、右手 = 銃
  const armL = new THREE.Group(); armL.position.set(-0.42, 0.55, 0); body.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.42, 0.55, 0); body.add(armR);
  mk(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), suit, 0, -0.3, 0, armL);
  mk(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), suit, 0, -0.3, 0, armR);
  const sword = mk(new THREE.BoxGeometry(0.06, 1.3, 0.14), blade, 0, -0.6, -0.65, armL);
  sword.rotation.x = Math.PI / 2;
  const gunMount = new THREE.Group(); gunMount.position.set(0, -0.6, 0); armR.add(gunMount);
  // 前は -z。mesh は rotation.y = -facing で向ける
  g.userData.parts = { body, legL, legR, armL, armR, sword, gunMount };
  return g;
}
