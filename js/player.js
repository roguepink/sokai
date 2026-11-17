// 主人公: 見た目・移動・向き・動き(剣をふる・回転斬り・撃った反動)。体力は無限(死なない)。
// 見た目: 黒い戦闘スーツ + 赤い装甲 + 光るバイザーのヘルメット + 赤いマフラー。左手に光る剣、右手に銃(武器係が持たせる)。背中に もう 1 本の剣。
// 第5弾(主人公と武器 UI の係):
//  - 体の形を 作り直した(太い手足・大きい肩当て・大きめのヘルメット・背中の剣)。全体を HERO_SCALE 倍(見下ろしでも 見つけやすく)
//  - 描く回数を へらした: 材質は 1 つ(色・光り方・つやを 頂点に持たせる)。関節ごとに 1 つの形に まとめる。
//    体 11 + 剣 1 + 剣の光 1 + マフラー 1 + 足もとの輪 1 = 15 回(前は 49 回)。影を落とすのは 大きい部品 9 つだけ(前は 12)
//  - マフラーは 1 枚の形(2 本の すそ)を 毎コマ 動かす(引っぱられて なびく・止まると たれる)
//  - 足もとに 光の輪(向きの印つき)。体の ふちが うすく光る(見下ろしの小さい表示でも「主人公はここ」と分かる)
//  - 動き: 足の ふり幅と 回す速さを 速さに合わせる(足が地面を すべらない)。手足は 反対に ふる。姿勢の切りかえは なめらかに つなぐ
import * as THREE from '../vendor/three/build/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Engine } from './engine.js';
import { damp, dampAngle } from './util.js';
import { lathe, sstep } from './zombie-models.js';
import { Moves } from './hero-moves.js';

const P = CONFIG.PLAYER;
const HERO_SCALE = 1.1;       // 主人公の大きさ(ゾンビより 少し大きく = 見つけやすい)
const LEG = 0.86 * HERO_SCALE;  // 脚の長さ(m)。足が すべらない歩幅の計算に使う
const SC_N = 6, SC_L = 0.15;  // マフラーの すそ: 点の数・点と点の間(m)

export const Player = {
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(),
  facing: 0,                // 向き(ラジアン)。0 = 北(-z)、PI/2 = 東(+x)
  aimDir: new THREE.Vector3(0, 0, -1),   // 狙っている向き(XZ、長さ1)。武器係が毎フレーム決める
  aiming: false,            // 撃っている間 true(移動の向きではなく狙いの向きを向く)
  radius: P.RADIUS,
  mesh: null,
  extras: [],               // 主人公の外(シーン)に置いた見た目: マフラー・足もとの輪。mesh と いっしょに 出し入れする
  moves: Moves,             // 大技(ダッシュ・ジャンプ叩きつけ)。dashing / airborne / busy
  parts: {},                // 体の部品(動かすため)。gunMount = 右手の銃をつける所(-z が前、+y が上)
  _swing: 0, _swingSide: 1, _spin: 0, _recoil: 0, _walk: 0, _t: 0, _lean: 0, _speed: 0, _mf: 1, _ms: 0, _aimW: 0,
  _pose: null, _scInit: false,
  // ボスに吹っとばされた(体力は減らない。見た目と手ごたえだけ)。knocked = 吹っとび中
  _kb: { t: 0, dur: 0.3, vx: 0, vz: 0, y: 0, vy: 0, cool: 0, ang: 0, spin: 0, ax: 1, az: 0, land: 0 },
  get knocked() { return this._kb.t > 0 || this._kb.y > 0; },

  init(scene) {
    this.mesh = buildHero();
    this.parts = this.mesh.userData.parts;
    let nShadow = 0;
    this.mesh.traverse((o) => { if (o.isMesh && o.castShadow) nShadow++; });
    this.mesh.userData.shadowCasters = nShadow;
    scene.add(this.mesh);
    this.extras = [this.parts.scarfMesh, this.parts.ring];
    for (const o of this.extras) scene.add(o);
    Moves.init(scene);
  },

  reset() {
    this.pos.set(0, 0, 0); this.vel.set(0, 0, 0); this.facing = 0; this._swing = this._spin = this._recoil = 0; Moves.reset();
    const k = this._kb; k.t = k.y = k.vy = k.cool = k.ang = 0;
    this._pose = null; this._scInit = false; this._speed = 0; this._lean = 0; this._aimW = 0;
  },

  // ボスの攻撃で 吹っとぶ(キャラ係・ボス)。dir = 吹っとぶ向き(XZ)、force = 速さ(m/秒 の目安 8〜30)、lift = 上へ(m/秒)
  // 体力は減らない。0.3〜0.45 秒で 操作がもどる。続けて何度も くらわない(0.9 秒あける)。ダッシュ・叩きつけ中は 当たらない
  // 当たったら true(呼んだ側が heroHit を出す)
  knock(dirX, dirZ, force = 14, lift = 0, src = null) {
    const k = this._kb;
    if (k.cool > 0 || Moves.busy) return false;
    const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
    const f = Math.min(30, Math.max(4, force));
    lift = Math.min(12, Math.max(0, lift));
    k.vx = dirX * f; k.vz = dirZ * f;
    k.dur = k.t = 0.28 + Math.min(0.14, f * 0.004 + lift * 0.008);
    k.vy = Math.max(k.vy, lift); k.cool = 0.9;
    k.ax = dirZ; k.az = -dirX;                       // たおれる軸(上 × 向き)
    k.spin = lift > 4.5 ? 1 : 0;                     // 大きく浮いたら 宙返り、ちがえば のけぞる
    k.ang = 0; k.land = 0;
    // 見下ろしでは 当たった方を向く(後ろへ 宙返り)
    if (Engine.viewMode === 'top') this.facing = Math.atan2(-dirX, dirZ);
    this._swing = this._spin = 0;
    Engine.shake(Math.min(2, 0.8 + f / 22 + lift / 20));
    Engine.hitStop(0.045 + Math.min(0.05, f / 700));
    if (Engine.fovKick) Engine.fovKick(Engine.viewMode === 'top' ? 4 : 6 + f * 0.25);
    if (Engine.viewMode !== 'top' && Engine.setRoll) {
      const y = Engine.lookYaw, side = dirX * Math.cos(y) + dirZ * Math.sin(y);
      Engine.setRoll(side * 0.18);
    }
    return true;
  },

  // 吹っとびの動き(update の中。移動のあと・壁の判定の前)
  _knockMove(dt) {
    const k = this._kb;
    k.cool = Math.max(0, k.cool - dt);
    if (k.t > 0) {
      const w = Math.min(1, (k.t / k.dur) * 1.8);    // 最後の方は スティックの操作がもどってくる
      this.vel.x = this.vel.x * (1 - w) + k.vx * w;
      this.vel.z = this.vel.z * (1 - w) + k.vz * w;
      const d = Math.exp(-4 * dt); k.vx *= d; k.vz *= d;
      k.t = Math.max(0, k.t - dt);
      if (Engine.viewMode !== 'top' && Engine.setRoll) Engine.setRoll((Engine.camera ? 1 : 0) * 0.15 * (k.t / k.dur) * Math.sign(k.vx * Math.cos(Engine.lookYaw) + k.vz * Math.sin(Engine.lookYaw)));
    }
    if (k.y > 0 || k.vy > 0) {
      k.vy -= 32 * dt; k.y += k.vy * dt;
      if (k.y <= 0) { k.y = 0; k.vy = 0; k.land = 0.25; if (Engine.landDip) Engine.landDip(0.3); }
    }
    k.land = Math.max(0, k.land - dt);
    // 宙返り / のけぞり の角度
    const air = k.y > 0 || k.t > 0;
    if (air) k.ang = k.spin ? Math.min(Math.PI * 2, k.ang + dt * 17) : Math.min(0.55, k.ang + dt * 6);
    else k.ang = k.spin ? 0 : Math.max(0, k.ang - dt * 5);
  },
  // 見た目: 腰を中心に 回す(_animate のあと)
  _knockPose() {
    const k = this._kb, m = this.mesh;
    const yaw = m.rotation.y;
    m.rotation.set(0, yaw, 0);
    if (k.ang <= 0.001 && k.land <= 0) return;
    let a = k.ang;
    if (k.spin && a >= Math.PI * 2 - 0.01) a = 0;
    _kq.setFromAxisAngle(_kax.set(k.ax, 0, k.az), a);
    m.quaternion.premultiply(_kq);
    // 腰(高さ 0.95)を中心に回るように ずらす
    _khip.set(0, 0.95 * HERO_SCALE, 0).applyQuaternion(_kq);
    m.position.x += -_khip.x; m.position.y += 0.95 * HERO_SCALE - _khip.y; m.position.z += -_khip.z;
    if (k.land > 0) m.position.y -= 0.15 * Math.sin((k.land / 0.25) * Math.PI);
  },

  update(dt, input) {
    // 移動(壁で止まる・すべる)
    const sp = P.SPEED;
    // 肩越し・一人称: スティックの上 = 見ている向きへ進む
    let mx = input.move.x, mz = input.move.z;
    const close = Engine.viewMode !== 'top';
    if (close) {
      const y = Engine.lookYaw, fx = Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = Math.sin(y);
      const a = mx, b = -mz;
      mx = rx * a + fx * b; mz = rz * a + fz * b;
    }
    // 大技(ダッシュ・叩きつけ)の間は 大技が速さを決める
    Moves.update(dt, input, this, mx, mz);
    if (Moves.busy) { this.vel.x = Moves.vx; this.vel.z = Moves.vz; }
    else {
      this.vel.x = damp(this.vel.x, mx * sp, 14, dt);
      this.vel.z = damp(this.vel.z, mz * sp, 14, dt);
    }
    this._knockMove(dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.pos.y = Math.max(Moves.y, this._kb.y);
    World.collideCircle(this.pos, this.radius);
    if (World.half) { const h = World.half - 1; this.pos.x = Math.max(-h, Math.min(h, this.pos.x)); this.pos.z = Math.max(-h, Math.min(h, this.pos.z)); }

    // 向き: 撃っている間は狙いの方、それ以外は進む方
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    let want = this.facing;
    if (close) want = Engine.lookYaw;            // 肩越し・一人称: いつも見ている向き
    else if (Moves.busy) want = Math.atan2(Moves.dirX, -Moves.dirZ);   // 突進・ジャンプの向き
    else if (this.knocked) want = this.facing;    // 吹っとび中は 向きを変えない
    else if (this.aiming) want = Math.atan2(this.aimDir.x, -this.aimDir.z);
    else if (moving) want = Math.atan2(this.vel.x, -this.vel.z);
    this.facing = close ? want : dampAngle(this.facing, want, Moves.busy ? 30 : 18, dt);
    this.mesh.visible = !Engine.hideHero;   // 一人称(と 壁ぎわで カメラが近すぎるとき)は 自分の体を見せない(武器係が手元の武器を出す)
    this._setFade(Engine.heroFade);

    this._animate(dt, moving);
    this._knockPose();
    this._extras(dt);
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
  // (右手の位置から 前へ 0.45m。撃っている間は腕が前に出ているので だいたい 前 0.95m・高さ 1.4m)
  muzzle(out = new THREE.Vector3()) {
    const f = this.facing, gm = this.parts.gunMount;
    if (gm && this.aiming && !(this._spin > 0)) {
      gm.getWorldPosition(out);
      out.x += Math.sin(f) * 0.45; out.z -= Math.cos(f) * 0.45;
      if (Math.hypot(out.x - this.pos.x, out.z - this.pos.z) < 2 && out.y > 0.9 && out.y < 2.1) return out;
    }
    return out.set(this.pos.x + Math.sin(f) * 0.95 + Math.cos(f) * 0.24, 1.4, this.pos.z - Math.cos(f) * 0.95 + Math.sin(f) * 0.24);
  },

  // 肩越しで カメラが近いときは 体を うすくする(画面が ふさがらないように)
  _setFade(f) {
    f = Math.round(f * 20) / 20;
    if (f === this._fade) return;
    this._fade = f;
    const mats = this.mesh.userData.mats || [];
    for (const m of mats) m.opacity = f;     // alphaHash(ざらざらに 消える)なので 材質の作り直しは いらない
  },

  _animate(dt, moving) {
    const m = this.mesh, pr = this.parts;
    this._t += dt;
    const t = this._t;
    m.position.copy(this.pos);
    // 回転斬り中は くるくる回る(はじめと 終わりは なめらかに)
    let spinAng = 0;
    const sp = this._spin;
    if (sp > 0) { const u = 1 - sp; spinAng = (u * u * (3 - 2 * u) * 0.35 + u * 0.65) * Math.PI * 4; this._spin = Math.max(0, sp - dt * 2.2); }
    m.rotation.y = -this.facing - spinAng;
    // 走る速さ
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this._speed = damp(this._speed, speed, 12, dt);
    const k = Math.min(1, this._speed / P.SPEED);
    const gw = Math.min(1, this._speed / 1.4);                 // 止まっているとき 0(足を そろえる)→ 歩きだすと 1
    // 歩幅: 足の ふり幅 A(ラジアン)と 回す速さを 速さに合わせる。足が地面に ついている まんなかで「足の速さ = 体の速さ」になる(すべらない)
    const A = 0.3 + 0.55 * Math.sqrt(k);
    this._walk += dt * Math.min(15.5, this._speed / (LEG * A));
    const w = this._walk, s = Math.sin(w), c = Math.cos(w);
    // 進む向きを 体の向きで見た 前後(mf)・左右(ms)。脚は 進む向きへ ふる(横歩き・後ろ歩きも 足が合う)
    const fx = Math.sin(this.facing), fz = -Math.cos(this.facing);
    if (speed > 0.5) {
      this._mf = damp(this._mf, (this.vel.x * fx + this.vel.z * fz) / speed, 14, dt);
      this._ms = damp(this._ms, (this.vel.x * -fz + this.vel.z * fx) / speed, 14, dt);
    }
    const mf = this._mf, ms = this._ms;
    // 脚(左 = +s、右 = -s)。ひざは 足を前へ運ぶときに 曲げる
    const th = s * A * gw, kb = gw * (0.3 + 0.7 * k);
    pr.legL.rotation.set(th * mf, 0, th * ms - 0.04);
    pr.legR.rotation.set(-th * mf, 0, -th * ms + 0.04);
    pr.kneeL.rotation.x = -(0.12 + 1.3 * Math.max(0, c)) * kb - 0.05;
    pr.kneeR.rotation.x = -(0.12 + 1.3 * Math.max(0, -c)) * kb - 0.05;
    // 体(息づかい・前のめり・上下)。脚を開いた分だけ 腰が下がる(足が浮かない)
    const breath = Math.sin(t * 2.2);
    pr.hips.position.y = 0.98 - 0.86 * (1 - Math.cos(th)) * 0.32 - 0.02 * k + 0.006 * breath * (1 - k);
    this._lean = damp(this._lean, -0.3 * k * mf, 8, dt);
    pr.torso.rotation.set(this._lean + 0.02 * breath * (1 - k), -0.22 * s * gw * k, -ms * 0.1 * k);
    pr.hips.rotation.set(0, 0.18 * s * gw * k, 0);
    pr.chest.scale.set(1 + 0.012 * breath, 1 + 0.018 * breath, 1 + 0.012 * breath);
    pr.head.rotation.set(-this._lean * 0.6 + 0.04 * Math.sin(t * 0.9), 0.1 * Math.sin(t * 0.5) * (1 - k), 0);
    // 左腕(剣): ふだんは 剣を後ろ下に かまえる。走ると 脚と反対に ふる
    let lx = 0.35 - s * 0.5 * gw * k, ly = 0.25, lz = -0.28, le = 0.5 + 0.2 * k;
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
    // 大技のポーズ: ダッシュ = 深い前のめり・剣を後ろへ / 空中 = ひざを抱えて 剣をふりかぶる / 着地 = しゃがんで 剣を地面へ
    const mv = Moves;
    let pose = 0;
    if (mv.dashT > 0) {
      pose = 1;
      const d = Math.min(1, (CONFIG.MOVES.DASH_TIME - mv.dashT) / 0.06);
      pr.torso.rotation.x = -0.8 * d; pr.torso.rotation.y = 0; pr.torso.rotation.z = 0;
      pr.hips.position.y = 0.9; pr.hips.rotation.set(-0.1, 0, 0);
      pr.legL.rotation.set(1.1 * d, 0, -0.06); pr.legR.rotation.set(-0.9 * d, 0, 0.06);
      pr.kneeL.rotation.x = -0.5; pr.kneeR.rotation.x = -1.2 * d;
      lx = -0.6; ly = 0.3; lz = -0.35; le = 0.3; swordTwist = -0.2;
      pr.head.rotation.set(0.55 * d, 0, 0);
    } else if (mv.airT > 0) {
      pose = 2;
      const u = 1 - mv.airT / CONFIG.MOVES.SLAM_AIR, up = u < 0.62, f = up ? 1 : (u - 0.62) / 0.38;
      pr.hips.position.y = 0.98 - 0.12 * (up ? 1 : 1 - f);
      pr.legL.rotation.set(up ? 1.3 : 1.3 - 1.0 * f, 0, -0.15); pr.legR.rotation.set(up ? 0.6 : 0.6 - 0.5 * f, 0, 0.15);
      pr.kneeL.rotation.x = up ? -1.9 : -1.9 + 1.4 * f; pr.kneeR.rotation.x = up ? -1.5 : -1.5 + 1.1 * f;
      pr.torso.rotation.set(up ? 0.25 : 0.25 - 0.9 * f, 0, 0);
      lx = up ? 3.0 : 3.0 - 2.4 * f; ly = 0.1; lz = -0.15; le = 0.2; swordTwist = 0;
      pr.head.rotation.set(up ? -0.2 : 0.3 * f, 0, 0);
    } else if (mv.landT > 0) {
      pose = 3;
      const l = mv.landT / 0.42, c2 = Math.min(1, l * 1.6);
      pr.hips.position.y = 0.98 - 0.42 * c2;
      pr.legL.rotation.set(1.05 * c2, 0, -0.2 * c2); pr.legR.rotation.set(-0.35 * c2, 0, 0.25 * c2);
      pr.kneeL.rotation.x = -1.35 * c2; pr.kneeR.rotation.x = -1.5 * c2;
      pr.torso.rotation.set(-0.55 * c2, 0, 0);
      lx = 0.6 + 0.2 * (1 - c2); ly = 0; lz = -0.1; le = 0.1; swordTwist = 0;
    }
    pr.armL.rotation.set(lx, ly, lz, 'XYZ');
    pr.foreL.rotation.x = le;
    pr.sword.rotation.set(0, swordTwist, 0);
    // 剣の光: ふっている間・大技の間は 強く(剣だけの材質。体の光る線は 変えない)
    const big = sw > 0 || sp > 0 || pose === 2 || pose === 1;
    this._bladeK = damp(this._bladeK || 1, big ? 2.1 : 1, big ? 30 : 6, dt);
    pr.swordGlow.value = 2.3 * this._bladeK + 0.25 * Math.sin(t * 11);
    pr.glow.scale.setScalar(0.7 + 0.5 * this._bladeK);
    // 右腕(銃): 撃っている間は前へ、それ以外は 走りにあわせてふる(脚と反対)。かまえる・おろすは なめらかに
    this._recoil = Math.max(0, this._recoil - dt * 6);
    const rc = this._recoil;
    const aimOn = this.aiming || rc > 0.05;
    this._aimW = damp(this._aimW, aimOn ? 1 : 0, aimOn ? 26 : 10, dt);
    const aw = this._aimW, iw = 1 - aw;
    pr.armR.rotation.set((1.42 + rc * 0.3 - this._lean) * aw + (s * 0.6 * gw * k + 0.25) * iw, -0.12 * aw, 0.08 * aw + 0.18 * iw, 'XYZ');
    pr.foreR.rotation.x = (0.12 + rc * 0.35) * aw + (0.6 + 0.5 * k) * iw;
    pr.torso.rotation.y -= 0.12 * aw;
    pr.torso.rotation.x += rc * 0.07 * aw;                       // 撃った反動: 上体が 少し のけぞる
    if (sp > 0) { pr.armR.rotation.set(1.4, 0, 1.3); pr.foreR.rotation.x = 0.1; }
    if (pose === 1 && !this.aiming) { pr.armR.rotation.set(-0.9, 0, 0.25, 'XYZ'); pr.foreR.rotation.x = 0.5; }
    else if (pose === 2) { pr.armR.rotation.set(lx * 0.9, -0.2, 0.1, 'XYZ'); pr.foreR.rotation.x = 0.3; }
    else if (pose === 3 && !this.aiming) { pr.armR.rotation.set(0.5, 0, 0.5, 'XYZ'); pr.foreR.rotation.x = 0.4; }
    // 姿勢を なめらかに つなぐ(ダッシュの終わり・着地・かまえ などで カクッと 切りかわらない)。
    // 速い動き(剣・回転斬り・大技の入り)は ほとんど そのまま通す
    this._smooth(dt, sw > 0 || sp > 0 ? 60 : pose ? 34 : 24);
    // 銃の台座は いつも まっすぐ前・水平に(腕の角度に関係なく)
    m.updateMatrixWorld(true);
    pr.gunMount.parent.getWorldQuaternion(_pq);
    _rq.setFromAxisAngle(_yAxis, -this.facing - spinAng);
    pr.gunMount.quaternion.copy(_pq.invert()).multiply(_rq);
  },

  // 関節の角度を 前のコマから なめらかに 近づける(脚は 速く = 歩きの形を くずさない)
  _smooth(dt, rate) {
    const J = this.parts.joints, n = J.length;
    let p = this._pose;
    if (!p) {
      p = this._pose = new Float32Array(n * 3 + 1);
      for (let i = 0; i < n; i++) { const r = J[i].rotation; p[i * 3] = r.x; p[i * 3 + 1] = r.y; p[i * 3 + 2] = r.z; }
      p[n * 3] = this.parts.hips.position.y;
      return;
    }
    const ka = 1 - Math.exp(-rate * dt), kl = 1 - Math.exp(-Math.max(rate, 34) * dt);
    for (let i = 0; i < n; i++) {
      const r = J[i].rotation, o = i * 3, kk = i < 5 ? kl : ka;       // はじめの 5 つ = 腰・脚・ひざ
      p[o] += (r.x - p[o]) * kk; p[o + 1] += (r.y - p[o + 1]) * kk; p[o + 2] += (r.z - p[o + 2]) * kk;
      r.x = p[o]; r.y = p[o + 1]; r.z = p[o + 2];
    }
    const h = this.parts.hips.position;
    p[n * 3] += (h.y - p[n * 3]) * kl; h.y = p[n * 3];
  },

  // マフラー(引っぱられて なびく)と 足もとの輪。主人公の外(シーン)に置いてある
  _extras(dt) {
    const pr = this.parts, vis = this.mesh.visible, f = this.facing, t = this._t;
    const k = Math.min(1, this._speed / P.SPEED);
    // ---- 足もとの輪: 地面に置く。向きの印が 体の向きを指す。跳んでいる間は 小さく・うすく ----
    const ring = pr.ring, h = this.pos.y;
    // 見下ろしのときだけ(肩越しは 主人公が いつも 画面のまんなかなので いらない)
    ring.visible = vis && Engine.viewMode === 'top';
    if (ring.visible) {
      // 高さ: 広場・歩道の しき石は 地面より 0.15〜0.2m 高い。その上に出るように 0.23m(見下ろしでは ずれて見えない)。
      // マップ係が World.groundY(x, z) を 作ってくれたら 地面に ぴったり置く
      const gy = typeof World.groundY === 'function' ? World.groundY(this.pos.x, this.pos.z) + 0.04 : 0.23;
      ring.position.set(this.pos.x, gy, this.pos.z);
      ring.rotation.y = -f;
      ring.scale.setScalar((1 + 0.035 * Math.sin(t * 3.2)) / (1 + h * 0.18));
      const op = 0.95 / (1 + h * 0.5);
      if (op !== ring.material.opacity) ring.material.opacity = op;
    }
    // ---- マフラー ----
    const mesh = pr.scarfMesh;
    mesh.visible = vis;
    if (!vis) { this._scInit = false; return; }
    pr.scarfA.getWorldPosition(_v0);
    const rx = Math.cos(f), rz = Math.sin(f), bx = -Math.sin(f), bz = Math.cos(f);   // 右・うしろ
    const N = pr.scarfNodes, pos = mesh.geometry.attributes.position, arr = pos.array;
    const fl = 0.3 + 1.5 * k + (Moves.busy ? 1.2 : 0), L = SC_L * HERO_SCALE;
    for (let ti = 0; ti < 2; ti++) {
      const side = ti ? 1 : -1, nodes = N[ti];
      nodes[0].set(_v0.x + rx * side * 0.05, _v0.y, _v0.z + rz * side * 0.05);
      for (let i = 1; i < SC_N; i++) {
        const n = nodes[i], q = nodes[i - 1];
        if (!this._scInit) n.set(q.x + bx * L * 0.8, q.y - L * 0.6, q.z + bz * L * 0.8);
        else {
          // 力: うしろへ 少し + 下へ + ゆらぎ(走るほど 大きく)
          const ph = t * 9 + i * 0.95 + ti * 1.7, wv = Math.sin(ph) * fl * 0.5, up = Math.cos(ph * 0.8) * fl * 0.35;
          n.x += (bx * 0.9 + rx * (wv + side * 0.25)) * dt;
          n.y += (-2.4 + up + 1.0 * k) * dt;
          n.z += (bz * 0.9 + rz * (wv + side * 0.25)) * dt;
        }
        // 前の点から 決まった長さに(引っぱられる)
        let dx = n.x - q.x, dy = n.y - q.y, dz = n.z - q.z;
        const l = Math.hypot(dx, dy, dz) || 1e-6, s = L / l;
        n.set(q.x + dx * s, Math.max(0.08, q.y + dy * s), q.z + dz * s);
      }
      // 帯の形(点の左右に 幅をとる)。幅の向きは 帯に直角で、横向き と 上向き を まぜる(ねじれた布)
      // → 上から見ても 後ろから見ても 面が見える。先へ行くほど・ゆれるほど ねじれる
      for (let i = 0; i < SC_N; i++) {
        const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(SC_N - 1, i + 1)], n = nodes[i];
        let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
        let hx = -dz, hz = dx;
        const hl = Math.hypot(hx, hz);
        if (hl < 0.15) { hx = rx; hz = rz; } else { hx /= hl; hz /= hl; }       // まっすぐ たれたときは 体の左右
        const ux = -hz * dy, uy = hz * dx - hx * dz, uz = hx * dy;              // 横 × 帯の向き = 帯の「上」
        const ang = side * (0.55 + 0.16 * i) + 0.35 * Math.sin(t * 5.5 + i * 0.8 + ti * 2);
        const ca = Math.cos(ang), sa = Math.sin(ang), hw = (0.1 - 0.008 * i) * HERO_SCALE;
        const wx = (hx * ca + ux * sa) * hw, wy = uy * sa * hw, wz = (hz * ca + uz * sa) * hw;
        const o = (ti * SC_N + i) * 6;
        arr[o] = n.x - wx; arr[o + 1] = n.y - wy; arr[o + 2] = n.z - wz;
        arr[o + 3] = n.x + wx; arr[o + 4] = n.y + wy; arr[o + 5] = n.z + wz;
      }
    }
    this._scInit = true;
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  },
};

const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _yAxis = new THREE.Vector3(0, 1, 0);
const _kq = new THREE.Quaternion(), _kax = new THREE.Vector3(), _khip = new THREE.Vector3(), _v0 = new THREE.Vector3();

// ---------- 主人公の見た目 ----------
// 色(見下ろしでも はっきり分かる 3 色: 黒っぽいスーツ・赤い装甲・水色の光)
const COL = {
  suit: 0x23272f, suitD: 0x171a20, armor: 0xc21d1d, armorD: 0x8a1414, plate: 0x3d444f, plateL: 0x6c7684,
  trim: 0xcfd6de, glow: 0x35c6ff, visor: 0x2fc4ff, scarf: 0xd81f1f, blade: 0x8fd4ff,
};
// つや [ざらつき, 金属っぽさ]
const SUIT = [0.6, 0.2], ARMOR = [0.3, 0.6], PLATE = [0.34, 0.75], CLOTH = [0.85, 0];

// 主人公の材質(1 つだけ)。色・光る強さ・つや は 頂点が持つ(color / aux = [光る強さ, ざらつき, 金属っぽさ])。
// 体の ふちが うすく水色に光る(uRim)。glowK = 光る線の明るさ(剣は 別の値を持つ)
function heroMaterial(glowK, rim) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
  const uGlowK = { value: glowK }, uRim = { value: new THREE.Color(rim) };
  mat.userData.uGlowK = uGlowK;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowK = uGlowK; sh.uniforms.uRim = uRim;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aux;\nvarying vec3 vAux;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAux;\nuniform float uGlowK;\nuniform vec3 uRim;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nroughnessFactor = vAux.y;\nmetalnessFactor = vAux.z;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' +
        'totalEmissiveRadiance += vColor.rgb * vAux.x * uGlowK;\n' +
        'totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.2);');
  };
  mat.customProgramCacheKey = () => 'hero5';
  return mat;
}

function buildHero() {
  const g = new THREE.Group();
  g.name = 'hero';
  g.scale.setScalar(HERO_SCALE);
  const heroM = heroMaterial(1.9, 0x0f3856);
  const swordM = heroMaterial(2.3, 0x000000);
  const scarfM = new THREE.MeshStandardMaterial({ color: COL.scarf, roughness: 0.8, side: THREE.DoubleSide });
  const bladeGlow = new THREE.MeshBasicMaterial({ color: 0x3aa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const jn = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };

  // ---- 骨(関節)。場所は 動きの計算と そろえてある ----
  const hips = jn(g, 0, 0.98, 0);
  const torso = jn(hips, 0, 0.08, 0), chest = jn(torso, 0, 0, 0), head = jn(torso, 0, 0.5, 0);
  const armL = jn(torso, -0.27, 0.42, 0), armR = jn(torso, 0.27, 0.42, 0);
  const foreL = jn(armL, 0, -0.28, 0), foreR = jn(armR, 0, -0.28, 0);
  const sword = jn(foreL, 0, -0.31, 0), gunMount = jn(foreR, 0, -0.3, 0);
  const legL = jn(hips, -0.105, -0.06, 0), legR = jn(hips, 0.105, -0.06, 0);
  const kneeL = jn(legL, 0, -0.42, 0), kneeR = jn(legR, 0, -0.42, 0);
  const scarfA = jn(torso, 0, 0.5, 0.13);            // マフラーの すその つけ根(首の後ろ)

  // ---- 形を 関節ごとに ためて、最後に 1 つずつに まとめる ----
  const bins = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
  // put(関節, 形, 色, つや, {x,y,z, rx,ry,rz, sx,sy,sz, glow})
  const put = (joint, geo, color, fin, o = {}) => {
    _m.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0)), _s.set(o.sx || 1, o.sy || 1, o.sz || 1));
    geo.applyMatrix4(_m);
    const n = geo.attributes.position.count, col = new Float32Array(n * 3), aux = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      aux[i * 3] = o.glow || 0; aux[i * 3 + 1] = fin[0]; aux[i * 3 + 2] = fin[1];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aux', new THREE.BufferAttribute(aux, 3));
    geo.deleteAttribute('uv');
    if (!bins.has(joint)) bins.set(joint, []);
    bins.get(joint).push(geo);
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r0, r1, h, seg = 8) => new THREE.CylinderGeometry(r0, r1, h, seg);
  const limb = (L, r0, r1) => lathe([[0, -L - r1 * 0.5], [r1, -L], [r0 * 1.05, -L * 0.35], [r0, 0], [r0 * 0.6, r0 * 0.6], [0, r0 * 0.8]], 10);
  const GL = { glow: 1 };

  // 腰
  put(hips, lathe([[0, -0.14], [0.12, -0.13], [0.165, -0.05], [0.17, 0.04], [0.16, 0.1], [0, 0.11]], 12, (p) => { p.x *= 1.15; p.z *= 0.85; }), COL.suit, SUIT);
  put(hips, cyl(0.176, 0.176, 0.055, 14), COL.plate, PLATE, { y: 0.06, sx: 1.15, sz: 0.88 });                 // ベルト
  put(hips, box(0.1, 0.065, 0.03), COL.glow, PLATE, { y: 0.06, z: -0.16, glow: 1 });                          // バックル
  for (const sx of [-1, 1]) put(hips, box(0.055, 0.2, 0.17), COL.armor, ARMOR, { x: sx * 0.2, y: -0.06, rz: sx * 0.2 });   // 腰の装甲
  put(hips, box(0.2, 0.15, 0.04), COL.plate, PLATE, { y: -0.04, z: 0.15, rx: -0.15 });
  put(hips, box(0.1, 0.13, 0.04), COL.armorD, ARMOR, { y: -0.07, z: -0.14, rx: 0.15 });

  // 胸(息で 少し ふくらむ)
  put(chest, lathe([[0.14, 0], [0.145, 0.1], [0.16, 0.22], [0.178, 0.34], [0.182, 0.42], [0.135, 0.49], [0.06, 0.52], [0, 0.53]], 14, (p) => {
    p.x *= 1 + 0.62 * sstep(0.1, 0.4, p.y); p.z *= 0.74;
    if (p.y > 0.4) p.y -= 0.08 * Math.min(1, (p.x / 0.28) ** 2) * sstep(0.4, 0.5, p.y);
  }), COL.suit, SUIT);
  // 胸の装甲(赤)+ 光るコア + おなかの板
  put(chest, lathe([[0, 0.17], [0.2, 0.19], [0.228, 0.3], [0.218, 0.43], [0.15, 0.485], [0, 0.495]], 12, (p) => { p.x *= 1.2; p.z = p.z < 0 ? p.z * 0.82 - 0.014 : p.z * 0.72; }), COL.armor, ARMOR);
  for (const y of [0.075, 0.135]) put(chest, box(0.2, 0.048, 0.04), COL.plate, PLATE, { y, z: -0.118 });
  put(chest, cyl(0.052, 0.052, 0.026, 10), COL.glow, PLATE, { y: 0.36, z: -0.19, rx: Math.PI / 2, glow: 1 });
  for (const sx of [-1, 1]) put(chest, box(0.016, 0.016, 0.14), COL.glow, PLATE, { x: sx * 0.11, y: 0.3, z: -0.172, ry: sx * 0.5, glow: 1 });
  put(chest, cyl(0.105, 0.128, 0.07, 10), COL.plate, PLATE, { y: 0.485 });                                    // えり
  put(chest, new THREE.TorusGeometry(0.105, 0.047, 6, 12), COL.scarf, CLOTH, { y: 0.525, rx: Math.PI / 2 });   // マフラー(首に巻いた所)
  // 肩当て(大きく。見下ろしで いちばん目立つ赤)+ 光る線
  for (const sx of [-1, 1]) {
    put(chest, new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), COL.armor, ARMOR, { x: sx * 0.305, y: 0.425, sx: 1.05, sy: 0.74, sz: 1.28, rz: -sx * 0.42 });
    put(chest, box(0.14, 0.018, 0.018), COL.glow, PLATE, { x: sx * 0.315, y: 0.505, z: -0.11, rz: -sx * 0.32, glow: 1 });
    put(chest, box(0.05, 0.03, 0.26), COL.trim, PLATE, { x: sx * 0.375, y: 0.4, rz: -sx * 0.42 });
  }
  // 背中の装置 + ふき出し口(光る)
  put(chest, box(0.28, 0.3, 0.11), COL.plate, PLATE, { y: 0.31, z: 0.16 });
  for (const sx of [-1, 1]) {
    put(chest, cyl(0.04, 0.052, 0.2, 8), COL.plateL, PLATE, { x: sx * 0.1, y: 0.19, z: 0.215 });
    put(chest, cyl(0.036, 0.036, 0.014, 8), COL.glow, PLATE, { x: sx * 0.1, y: 0.085, z: 0.215, glow: 1 });
  }
  // 背中の武器: さやに入った もう 1 本の剣(ななめ。柄が 左肩の上に出る)
  put(chest, box(0.075, 0.74, 0.05), COL.suitD, PLATE, { x: 0.03, y: 0.33, z: 0.25, rz: 0.6 });
  put(chest, box(0.018, 0.6, 0.012), COL.glow, PLATE, { x: 0.03, y: 0.33, z: 0.278, rz: 0.6, glow: 0.8 });
  put(chest, box(0.05, 0.22, 0.045), COL.plateL, PLATE, { x: 0.03 - 0.565 * 0.48, y: 0.33 + 0.825 * 0.48, z: 0.25, rz: 0.6 });
  put(chest, box(0.17, 0.035, 0.06), COL.armor, ARMOR, { x: 0.03 - 0.565 * 0.375, y: 0.33 + 0.825 * 0.375, z: 0.25, rz: 0.6 });

  // 頭(ヘルメット + 光るバイザー + とさか)
  put(head, cyl(0.065, 0.075, 0.1, 8), COL.suit, SUIT, { y: 0.03 });
  put(head, lathe([[0, 0.02], [0.11, 0.03], [0.133, 0.1], [0.139, 0.18], [0.126, 0.26], [0.08, 0.318], [0, 0.335]], 14, (p) => {
    if (p.z > 0) p.z *= 1.12; p.x *= 0.94; if (p.z < 0 && p.y < 0.12) p.z *= 1.12;
  }), COL.plate, PLATE);
  put(head, new THREE.SphereGeometry(0.134, 14, 6, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.35, Math.PI * 0.23), COL.visor, [0.15, 0.9], { y: 0.165, z: -0.004, sx: 0.97, sy: 1.05, sz: 1.14, glow: 0.62 });
  put(head, box(0.032, 0.08, 0.28), COL.armor, ARMOR, { y: 0.328, z: 0.02, rx: 0.15 });                        // とさか
  for (const sx of [-1, 1]) put(head, cyl(0.046, 0.046, 0.034, 8), COL.armor, ARMOR, { x: sx * 0.128, y: 0.15, z: 0.02, rz: Math.PI / 2 });
  put(head, box(0.012, 0.15, 0.012), COL.trim, PLATE, { x: 0.142, y: 0.26, z: 0.05, rx: -0.3 });               // アンテナ
  put(head, box(0.12, 0.07, 0.06), COL.plateL, PLATE, { y: 0.068, z: -0.115 });                                // あごの装甲

  // 腕
  for (const [arm, fore, sx] of [[armL, foreL, -1], [armR, foreR, 1]]) {
    put(arm, limb(0.27, 0.073, 0.059), COL.suit, SUIT);
    put(arm, box(0.016, 0.17, 0.016), COL.glow, PLATE, { x: sx * 0.07, y: -0.15, glow: 1 });
    put(fore, limb(0.25, 0.067, 0.056), COL.plate, PLATE);                                                    // 小手
    put(fore, box(0.118, 0.15, 0.128), COL.armor, ARMOR, { y: -0.115 });
    put(fore, box(0.124, 0.022, 0.134), COL.plateL, PLATE, { y: -0.03 });
    put(fore, new THREE.SphereGeometry(0.063, 8, 6), COL.suitD, SUIT, { y: -0.3, sx: 0.9, sz: 1.1 });          // こぶし
  }
  // 左手: 光る剣(にぎり + つば + 刃)。刃は前(-z)へ。刃だけ 光る(剣の材質は 光る強さを 別に持つ)
  put(sword, cyl(0.024, 0.024, 0.22, 8), COL.plate, PLATE, { rx: Math.PI / 2 });
  put(sword, new THREE.SphereGeometry(0.032, 6, 4), COL.armor, ARMOR, { z: 0.12 });
  put(sword, box(0.2, 0.042, 0.046), COL.armor, ARMOR, { z: -0.11 });
  {
    const bg = new THREE.BoxGeometry(0.028, 0.085, 1.1, 1, 1, 6), pos = bg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), tt = (z + 0.55) / 1.1;              // 0 = 先, 1 = 根元
      pos.setY(i, pos.getY(i) * (0.3 + 0.7 * Math.min(1, tt * 1.6)) + (tt < 0.12 ? (0.12 - tt) * 0.3 : 0));
    }
    bg.computeVertexNormals();
    put(sword, bg, COL.blade, [0.15, 0.6], { z: -0.68, glow: 1 });
  }
  // 脚
  for (const [leg, kn, sx] of [[legL, kneeL, -1], [legR, kneeR, 1]]) {
    put(leg, limb(0.42, 0.098, 0.072), COL.suit, SUIT);
    put(leg, box(0.05, 0.25, 0.14), COL.armor, ARMOR, { x: sx * 0.088, y: -0.17 });                           // ももの装甲(外側)
    put(leg, box(0.112, 0.22, 0.05), COL.plate, PLATE, { y: -0.19, z: -0.082 });
    put(leg, box(0.018, 0.16, 0.012), COL.glow, PLATE, { y: -0.19, z: -0.11, glow: 1 });
    put(kn, limb(0.38, 0.076, 0.06), COL.suit, SUIT);
    put(kn, new THREE.SphereGeometry(0.074, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), COL.armor, ARMOR, { z: -0.045, rx: -Math.PI / 2 });   // ひざ当て
    put(kn, box(0.108, 0.24, 0.07), COL.plate, PLATE, { y: -0.185, z: -0.05 });                                // すね当て
    put(kn, box(0.034, 0.2, 0.012), COL.armor, ARMOR, { y: -0.185, z: -0.088 });
    put(kn, lathe([[0, -0.05], [0.062, -0.045], [0.07, 0], [0.062, 0.06], [0, 0.07]], 8, (p) => { p.z = p.z * 2.3 - 0.05; p.x *= 1.15; }), COL.plate, PLATE, { y: -0.43 });   // くつ
    put(kn, box(0.115, 0.05, 0.09), COL.armor, ARMOR, { y: -0.452, z: -0.175 });                               // つま先
    put(kn, box(0.06, 0.03, 0.02), COL.glow, PLATE, { y: -0.4, z: 0.115, glow: 1 });                           // かかとの光
  }

  // ---- まとめる(関節ごとに 1 つ)。影を落とすのは 大きい部品だけ ----
  const SHADOW = new Set([chest, head, armL, armR, foreR, legL, legR, kneeL, kneeR]);
  for (const [joint, list] of bins) {
    const geo = mergeGeometries(list, false);
    for (const x of list) x.dispose();
    const mesh = new THREE.Mesh(geo, joint === sword ? swordM : heroM);
    mesh.castShadow = SHADOW.has(joint); mesh.receiveShadow = false;
    joint.add(mesh);
  }
  // 剣の光のもや(加算)
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 1.18), bladeGlow);
  glow.position.set(0, 0, -0.68); sword.add(glow);

  // ---- マフラーの すそ(2 本を 1 つの形で。点は 毎コマ 書きかえる。シーンに置く = 世界の座標) ----
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * SC_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  sg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(2 * SC_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const idx = [];
  for (let ti = 0; ti < 2; ti++) for (let i = 0; i < SC_N - 1; i++) { const a = (ti * SC_N + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  sg.setIndex(idx);
  const scarfMesh = new THREE.Mesh(sg, scarfM);
  scarfMesh.frustumCulled = false; scarfMesh.castShadow = false; scarfMesh.name = 'heroScarf';
  const scarfNodes = [0, 1].map(() => Array.from({ length: SC_N }, () => new THREE.Vector3()));

  const ring = buildRing();

  const mats = [heroM, swordM, scarfM];
  for (const m of mats) m.alphaHash = true;
  g.userData.mats = mats;
  g.userData.parts = {
    hips, torso, chest, head, legL, legR, kneeL, kneeR, armL, armR, foreL, foreR, sword, glow, gunMount,
    blade: sword.children[0], swordGlow: swordM.userData.uGlowK,
    scarfA, scarfMesh, scarfNodes, scarf: [], ring,
    joints: [hips, legL, legR, kneeL, kneeR, torso, head, armL, foreL, sword, armR, foreR],   // はじめの 5 つは 脚まわり(_smooth)
  };
  return g;
}

// 足もとの光の輪(地面に置く 1 つの形): 黒い ふち + 水色の輪 + 向きの印(▲ が 体の向き)
function buildRing() {
  const pos = [], col = [], idx = [];
  const band = (r0, r1, c, seg = 40) => {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, cx = Math.sin(a), cz = -Math.cos(a);
      pos.push(cx * r0, 0, cz * r0, cx * r1, 0, cz * r1);
      col.push(...c, ...c);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  const tri = (pts, c) => { const base = pos.length / 3; for (const [x, z] of pts) { pos.push(x, 0, z); col.push(...c); } idx.push(base, base + 1, base + 2); };
  const DARK = [0, 0, 0, 0.45], CY = [0.16, 0.8, 1.0, 0.95], SOFT = [0.16, 0.8, 1.0, 0.2];
  band(0.6, 0.93, DARK);
  band(0.4, 0.66, SOFT);
  band(0.68, 0.84, CY);
  tri([[0, -1.24], [0.22, -0.9], [-0.22, -0.9]], DARK);
  tri([[0, -1.16], [0.15, -0.93], [-0.15, -0.93]], CY);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  m.name = 'heroRing'; m.renderOrder = 3; m.castShadow = false; m.receiveShadow = false;   // 演出の輪(3)と 同じ順番
  return m;
}
