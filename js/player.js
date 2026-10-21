// 主人公: 見た目・移動・向き・動き(剣をふる・回転斬り・撃った反動)。体力は無限(死なない)。
// 見た目: 黒い戦闘スーツ + 赤い装甲 + 光るバイザーのヘルメット + 赤いマフラー。左手に光る剣、右手に銃(武器係が持たせる)。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { damp, dampAngle } from './util.js';
import { lathe, sstep } from './zombie-models.js';

const P = CONFIG.PLAYER;

export const Player = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  facing: 0,                // 向き(ラジアン)。0 = 北(-z)、PI/2 = 東(+x)
  aimDir: new THREE.Vector3(0, 0, -1),   // 狙っている向き(XZ、長さ1)。武器係が毎フレーム決める
  aiming: false,            // 撃っている間 true(移動の向きではなく狙いの向きを向く)
  radius: P.RADIUS,
  mesh: null,
  parts: {},                // 体の部品(動かすため)。gunMount = 右手の銃をつける所(-z が前、+y が上)
  _swing: 0, _swingSide: 1, _spin: 0, _recoil: 0, _walk: 0, _t: 0, _lean: 0, _speed: 0,

  init(scene) {
    this.mesh = buildHero();
    this.parts = this.mesh.userData.parts;
    scene.add(this.mesh);
  },

  reset() { this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); this.facing = 0; this._swing = this._spin = this._recoil = 0; },

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
  swing() { this._swing = 1; this._swingSide = -this._swingSide; },   // 剣をふる(近くの敵)。左右交互に
  spin() { this._spin = 1; },              // 回転斬り
  recoil(s = 0.3) { this._recoil = Math.min(1, this._recoil + s); },
  // 武器の見た目をつける(武器係が作った Object3D を右手に持たせる。null で外す)
  // gunMount の向き: -z = 銃口の向き(主人公の前)、+y = 上。原点 = 右手のにぎり
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
    this._t += dt;
    const t = this._t;
    m.position.copy(this.pos);
    // 回転斬り中は くるくる回る
    let spinAng = 0;
    const sp = this._spin;
    if (sp > 0) { spinAng = (1 - sp) * Math.PI * 4; this._spin = Math.max(0, sp - dt * 2.2); }
    m.rotation.y = -this.facing - spinAng;
    // 走る速さ
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this._speed = damp(this._speed, speed, 10, dt);
    const k = Math.min(1, this._speed / P.SPEED);
    this._walk += dt * this._speed * 1.25;
    const w = this._walk, s = Math.sin(w), c = Math.cos(w);
    // 進む向きと 体の向きの差(後ろ向きに走るとき 脚を逆に)
    const fx = Math.sin(this.facing), fz = -Math.cos(this.facing);
    const fwd = speed > 0.5 ? (this.vel.x * fx + this.vel.z * fz) / speed : 1;
    const side = speed > 0.5 ? (this.vel.x * -fz + this.vel.z * fx) / speed : 0;
    const dir = fwd >= -0.2 ? 1 : -1;
    // 脚
    pr.legL.rotation.set(s * 0.85 * k * dir, 0, -0.04 - side * 0.15 * k);
    pr.legR.rotation.set(-s * 0.85 * k * dir, 0, 0.04 - side * 0.15 * k);
    pr.kneeL.rotation.x = -(0.15 + 1.25 * Math.max(0, c * dir)) * k - 0.05;
    pr.kneeR.rotation.x = -(0.15 + 1.25 * Math.max(0, -c * dir)) * k - 0.05;
    // 体(息づかい・前のめり・上下)
    const breath = Math.sin(t * 2.2);
    pr.hips.position.y = 0.98 + 0.06 * Math.abs(c) * k - 0.03 * k + 0.006 * breath * (1 - k);
    this._lean = damp(this._lean, -0.32 * k * fwd, 8, dt);
    pr.torso.rotation.set(this._lean + 0.02 * breath * (1 - k), -0.25 * s * k, side * 0.12 * k);
    pr.hips.rotation.set(0, 0.2 * s * k, 0);
    pr.chest.scale.set(1 + 0.012 * breath, 1 + 0.018 * breath, 1 + 0.012 * breath);
    pr.head.rotation.set(-this._lean * 0.6 + 0.04 * Math.sin(t * 0.9), 0.1 * Math.sin(t * 0.5) * (1 - k), 0);
    // 左腕(剣): ふだんは 剣を後ろ下に かまえる
    let lx = 0.35 + s * 0.6 * k, ly = 0.25, lz = -0.28, le = 0.5 + 0.2 * k;
    let swordTwist = 0.3;
    // 剣をふる(大きく なぎはらう)
    if (this._swing > 0) this._swing = Math.max(0, this._swing - dt * 5);
    const sw = this._swing;
    if (sw > 0) {
      const a = 1 - sw;
      const e2 = a < 0.15 ? a / 0.15 : 1;
      const arc = a < 0.15 ? 0 : (a - 0.15) / 0.85;
      const ease = 1 - Math.pow(1 - arc, 3);
      const sd = this._swingSide;
      lx = 1.35 + 0.2 * Math.sin(arc * Math.PI); le = 0.15;
      ly = (sd > 0 ? 1.4 - 2.6 * ease : -1.1 + 2.4 * ease) * e2 + 0.25 * (1 - e2);
      lz = -0.35 - 0.25 * Math.sin(arc * Math.PI);
      swordTwist = sd > 0 ? -0.4 : 1.2;
      pr.torso.rotation.y += (sd > 0 ? 0.5 - 1.1 * ease : -0.5 + 1.1 * ease) * e2;
    }
    // 回転斬り: 両腕を広げる
    if (sp > 0) {
      lx = 1.45; ly = 0; lz = -1.35; le = 0.05; swordTwist = 1.4;
      pr.hips.position.y -= 0.18;
      pr.kneeL.rotation.x = pr.kneeR.rotation.x = -0.7;
      pr.legL.rotation.set(0.5, 0, -0.35); pr.legR.rotation.set(-0.2, 0, 0.35);
      pr.torso.rotation.set(-0.3, 0, 0);
    }
    pr.armL.rotation.set(lx, ly, lz, 'XYZ');
    pr.foreL.rotation.x = le;
    pr.sword.rotation.set(0, swordTwist, 0);
    pr.blade.material.emissiveIntensity = 2.2 + (sw > 0 || sp > 0 ? 2.5 : 0) + 0.3 * Math.sin(t * 11);
    pr.glow.scale.set(1, 1, 1).multiplyScalar(1 + (sw > 0 || sp > 0 ? 0.6 : 0));
    // 右腕(銃): 撃っている間は前へ、それ以外は 走りにあわせてふる
    this._recoil = Math.max(0, this._recoil - dt * 6);
    const rc = this._recoil;
    if (this.aiming || rc > 0.05) {
      pr.armR.rotation.set(1.42 + rc * 0.3 - this._lean, -0.12, 0.08, 'XYZ');
      pr.foreR.rotation.x = 0.12 + rc * 0.35;
      pr.torso.rotation.y -= 0.12;
    } else {
      pr.armR.rotation.set(-s * 0.7 * k + 0.25, 0, 0.18, 'XYZ');
      pr.foreR.rotation.x = 0.6 + 0.6 * k;
    }
    if (sp > 0) { pr.armR.rotation.set(1.4, 0, 1.3); pr.foreR.rotation.x = 0.1; }
    // マフラー: 走るとなびく
    for (let i = 0; i < pr.scarf.length; i++) {
      const seg = pr.scarf[i];
      const ph = t * 9 + i * 0.9 + seg.userData.off;
      seg.rotation.x = (i === 0 ? 0.55 - 0.5 * k : 0.22 - 0.14 * k) + Math.sin(ph) * (0.06 + 0.16 * k);
      seg.rotation.z = Math.sin(ph * 0.7) * 0.12 * (0.4 + k);
    }
    // 銃の台座は いつも まっすぐ前・水平に(腕の角度に関係なく)
    m.updateMatrixWorld(true);
    pr.gunMount.parent.getWorldQuaternion(_pq);
    _rq.setFromAxisAngle(_yAxis, -this.facing - spinAng);
    pr.gunMount.quaternion.copy(_pq.invert()).multiply(_rq);
  },
};

const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _yAxis = new THREE.Vector3(0, 1, 0);

// ---------- 主人公の見た目 ----------
function buildHero() {
  const g = new THREE.Group();
  g.name = 'hero';
  const suit = new THREE.MeshStandardMaterial({ map: suitTex(), color: 0xffffff, roughness: 0.55, metalness: 0.25 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 0.32, metalness: 0.65 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.35, metalness: 0.75 });
  const glowM = new THREE.MeshStandardMaterial({ color: 0x0a2a3a, emissive: 0x38b8ff, emissiveIntensity: 2.4, roughness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x051018, emissive: 0x30c0ff, emissiveIntensity: 1.8, roughness: 0.1, metalness: 0.9 });
  const scarfM = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.7, side: THREE.DoubleSide });
  const blade = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0x40b0ff, emissiveIntensity: 2.4, metalness: 0.6, roughness: 0.15 });
  const bladeGlow = new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mk = (geo, mat, x, y, z, parent, shadow = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = shadow; parent.add(o); return o; };
  const jn = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
  const limb = (L, r0, r1) => lathe([[0, -L - r1 * 0.5], [r1, -L], [r0 * 1.05, -L * 0.35], [r0, 0], [r0 * 0.6, r0 * 0.6], [0, r0 * 0.8]], 12);

  const hips = jn(g, 0, 0.98, 0);
  mk(lathe([[0, -0.13], [0.11, -0.12], [0.155, -0.05], [0.16, 0.04], [0.15, 0.1], [0, 0.11]], 14, (p) => { p.x *= 1.15; p.z *= 0.85; }), suit, 0, 0, 0, hips);
  mk(new THREE.TorusGeometry(0.165, 0.03, 6, 18), plate, 0, 0.06, 0, hips).rotation.x = Math.PI / 2;    // ベルト
  mk(new THREE.BoxGeometry(0.08, 0.06, 0.03), glowM, 0, 0.06, -0.16, hips, false);                      // バックル
  for (const sx of [-1, 1]) { const tp = mk(new THREE.BoxGeometry(0.06, 0.18, 0.16), armor, sx * 0.19, -0.05, 0, hips); tp.rotation.z = sx * 0.15; }   // 腰の装甲

  const torso = jn(hips, 0, 0.08, 0);
  const chest = jn(torso, 0, 0, 0);
  mk(lathe([[0.135, 0], [0.14, 0.1], [0.155, 0.22], [0.17, 0.34], [0.175, 0.42], [0.13, 0.49], [0.06, 0.52], [0, 0.53]], 16, (p) => {
    p.x *= 1 + 0.55 * sstep(0.1, 0.4, p.y); p.z *= 0.72;
    if (p.y > 0.4) p.y -= 0.08 * Math.min(1, (p.x / 0.26) ** 2) * sstep(0.4, 0.5, p.y);
  }), suit, 0, 0, 0, chest);
  // 胸の装甲(赤)+ 光るコア
  mk(lathe([[0, 0.16], [0.19, 0.18], [0.21, 0.3], [0.2, 0.42], [0.14, 0.47], [0, 0.48]], 14, (p) => { p.x *= 1.15; p.z = p.z < 0 ? p.z * 0.75 - 0.012 : p.z * 0.7; }), armor, 0, 0, 0, chest);
  mk(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), glowM, 0, 0.36, -0.165, chest, false).rotation.x = Math.PI / 2;
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.012, 0.012, 0.11), glowM, sx * 0.09, 0.29, -0.15, chest, false).rotation.y = sx * 0.5;
  // 背中の装置
  mk(new THREE.BoxGeometry(0.26, 0.28, 0.1), plate, 0, 0.32, 0.15, chest);
  for (const sx of [-1, 1]) mk(new THREE.CylinderGeometry(0.035, 0.045, 0.2, 8), plate, sx * 0.09, 0.2, 0.2, chest);
  for (const sx of [-1, 1]) mk(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), glowM, sx * 0.09, 0.095, 0.2, chest, false);
  // 肩当て
  for (const sx of [-1, 1]) {
    const pd = mk(new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.45), armor, sx * 0.25, 0.42, 0, chest);
    pd.scale.set(1.0, 0.6, 1.15); pd.rotation.z = -sx * 0.45;
    mk(new THREE.BoxGeometry(0.1, 0.012, 0.012), glowM, sx * 0.27, 0.47, -0.08, chest, false).rotation.z = -sx * 0.35;
  }
  // 頭(ヘルメット + バイザー)
  const head = jn(torso, 0, 0.5, 0);
  mk(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), suit, 0, 0.03, 0, head);
  mk(lathe([[0, 0.02], [0.1, 0.03], [0.118, 0.1], [0.122, 0.18], [0.11, 0.25], [0.07, 0.3], [0, 0.315]], 18, (p) => {
    if (p.z > 0) p.z *= 1.12; p.x *= 0.93; if (p.z < 0 && p.y < 0.12) p.z *= 1.12;
  }), plate, 0, 0, 0, head);
  const vs = mk(new THREE.SphereGeometry(0.118, 18, 8, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.38, Math.PI * 0.2), visor, 0, 0.165, -0.004, head, false);
  vs.scale.set(0.95, 1.05, 1.14);
  const crest = mk(new THREE.BoxGeometry(0.025, 0.06, 0.24), armor, 0, 0.3, 0.02, head);
  crest.rotation.x = 0.15;
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.02, 0.05, 0.08), armor, sx * 0.118, 0.14, 0.02, head);
  // マフラー(首に巻いて、2 本の すそが後ろへ なびく)
  const scarf = [];
  mk(new THREE.TorusGeometry(0.09, 0.04, 8, 16), scarfM, 0, 0.5, 0, torso).rotation.x = Math.PI / 2;
  for (const sx of [-0.05, 0.06]) {
    let parent = jn(torso, sx, 0.49, 0.1);
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Object3D(); seg.position.set(0, 0, i ? 0.13 : 0); seg.userData.off = sx * 20;
      parent.add(seg);
      const piece = mk(new THREE.PlaneGeometry(0.1 - i * 0.008, 0.14), scarfM, 0, 0, 0.065, seg);
      piece.rotation.x = -Math.PI / 2;
      scarf.push(seg); parent = seg;
    }
  }
  // 腕
  const armL = jn(torso, -0.24, 0.42, 0), armR = jn(torso, 0.24, 0.42, 0);
  const fores = [];
  for (const [arm, sx] of [[armL, -1], [armR, 1]]) {
    mk(limb(0.27, 0.062, 0.05), suit, 0, 0, 0, arm);
    mk(new THREE.BoxGeometry(0.012, 0.16, 0.012), glowM, sx * 0.062, -0.15, 0, arm, false);
    const fore = jn(arm, 0, -0.28, 0);
    mk(limb(0.25, 0.058, 0.048), plate, 0, 0, 0, fore);      // 小手
    mk(new THREE.BoxGeometry(0.1, 0.13, 0.11), armor, 0, -0.1, 0, fore);
    mk(new THREE.SphereGeometry(0.055, 10, 8), suit, 0, -0.3, 0, fore).scale.set(0.85, 1, 1.1);   // こぶし
    fores.push(fore);
  }
  const [foreL, foreR] = fores;
  // 左手: 光る剣(にぎり + つば + 刃 + 光のもや)。刃は前(-z)へ
  const sword = jn(foreL, 0, -0.31, 0);
  mk(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), plate, 0, 0, 0, sword).rotation.x = Math.PI / 2;
  mk(new THREE.BoxGeometry(0.16, 0.035, 0.04), armor, 0, 0, -0.1, sword);
  const bg = new THREE.BoxGeometry(0.025, 0.07, 1.05, 1, 1, 6);
  {
    const pos = bg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), tt = (z + 0.525) / 1.05;           // 0 = 先, 1 = 根元
      pos.setY(i, pos.getY(i) * (0.35 + 0.65 * Math.min(1, tt * 1.6)) + (tt < 0.12 ? (0.12 - tt) * 0.3 : 0));
    }
    bg.computeVertexNormals();
  }
  const bladeMesh = mk(bg, blade, 0, 0, -0.64, sword);
  const glow = mk(new THREE.BoxGeometry(0.09, 0.15, 1.12), bladeGlow, 0, 0, -0.64, sword, false);
  // 右手: 銃をつける台
  const gunMount = jn(foreR, 0, -0.3, 0);
  // 脚
  const legL = jn(hips, -0.1, -0.06, 0), legR = jn(hips, 0.1, -0.06, 0);
  const knees = [];
  for (const [leg, sx] of [[legL, -1], [legR, 1]]) {
    mk(limb(0.42, 0.082, 0.058), suit, 0, 0, 0, leg);
    mk(new THREE.BoxGeometry(0.1, 0.22, 0.05), plate, 0, -0.18, -0.07, leg);
    mk(new THREE.BoxGeometry(0.012, 0.2, 0.012), glowM, sx * 0.08, -0.2, 0, leg, false);
    const kn = jn(leg, 0, -0.42, 0);
    mk(limb(0.38, 0.06, 0.045), suit, 0, 0, 0, kn);
    mk(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), armor, 0, 0, -0.04, kn).rotation.x = -Math.PI / 2;   // ひざ当て
    mk(new THREE.BoxGeometry(0.09, 0.2, 0.06), plate, 0, -0.17, -0.045, kn);
    const boot = mk(lathe([[0, -0.04], [0.05, -0.035], [0.055, 0], [0.05, 0.05], [0, 0.06]], 10, (p) => { p.z = p.z * 2.4 - 0.05; p.x *= 1.1; }), plate, 0, -0.44, 0, kn);
    boot.castShadow = true;
    knees.push(kn);
  }
  g.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  g.userData.parts = { hips, torso, chest, head, legL, legR, kneeL: knees[0], kneeR: knees[1], armL, armR, foreL, foreR, sword, blade: bladeMesh, glow, gunMount, scarf };
  return g;
}

// スーツの模様(パネルの線)
function suitTex() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#20252d'; c.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; c.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5;
  for (let y = 16; y < S; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  for (let x = 0; x < S; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let y = 17; y < S; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
