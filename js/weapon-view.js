// 武器係: 一人称(fps)の「手元の武器」(ビューモデル)。
// - 本編の絵を描いたあと(Engine.scene.onAfterRender)、奥行きだけ消して、手元の武器を上から重ねて描く
//   → ゾンビや壁に めりこまない。光のにじみ(bloom)も同じようにかかる
// - 手元の武器は 世界の座標に置く(カメラと同じ位置・向きの小さな舞台)。なので 銃口の位置から弾を飛ばせる
// - 歩くと上下にゆれる / 向きを変えると少し遅れてついてくる / 撃つと反動で はねる / 銃口の火 / 剣の光の弧 / 回転斬り
// 毎フレーム new しない。光の数は変えない(2 + 銃口の光 1)。
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Player } from './player.js';
import { WEAPONS } from './weapon-defs.js';
import { buildModel } from './weapon-models.js';
import { angleDiff } from './util.js';

const OUT = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
// 剣の光の弧(画面いっぱいの三日月)。uv.x = 弧にそった位置(0..1)、uv.y = 内→外
const ARC_VS = /* glsl */`
  uniform float uA0, uA1, uR0, uR1;
  varying vec2 vUv;
  void main() {
    vUv = position.xy;
    float a = mix(uA0, uA1, position.x);
    float r = mix(uR0, uR1, position.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * r, sin(a) * r, 0.0, 1.0);
  }
`;
const ARC_FS = /* glsl */`
  uniform float uHead, uAlpha;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float behind = uHead - vUv.x;
    if (behind < 0.0) discard;
    float trail = exp(-behind * 3.2);
    float v = vUv.y;
    float edge = smoothstep(0.0, 0.45, v) * smoothstep(1.0, 0.86, v);
    float core = smoothstep(0.6, 0.9, v) * smoothstep(1.0, 0.9, v);
    vec3 c = uColor * (0.55 + core * 1.4) + vec3(core * trail * 0.6);
    gl_FragColor = vec4(c, trail * edge * uAlpha);
    ${OUT}
  }
`;
// 銃口の火(星形の光)
const FLASH_FS = /* glsl */`
  uniform vec3 uColor;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float x = abs(p.x), y = abs(p.y);
    float star = max(0.0, 1.0 - x * 7.0 - y * 0.8) + max(0.0, 1.0 - y * 7.0 - x * 0.8);
    float a = (1.0 - r2) * (1.0 - r2) * 0.9 + star * 0.9;
    vec3 c = mix(uColor, vec3(1.0), smoothstep(0.35, 0.0, r2));
    gl_FragColor = vec4(c * 2.5, a * uAlpha);
    ${OUT}
  }
`;
const FLASH_VS = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function arcGeo(seg) {
  const pos = [], index = [];
  for (let i = 0; i <= seg; i++) { const u = i / seg; pos.push(u, 0, 0, u, 1, 0); }
  for (let i = 0; i < seg; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();
const BASE = new THREE.Vector3(0.17, -0.18, -0.34);      // 手の位置(カメラから見て 右下・前)

export const VM = {
  scene: null, cam: null, root: null, pivot: null, models: [], model: null, index: -1,
  arm: null, sword: null, swordPivot: null, flash: null, flashMat: null, arcs: [], light: null, sun: null, hemi: null,
  active: false, ready: false,
  // 動きの状態
  _t: 0, _bob: 0, _bobAmt: 0, _swayX: 0, _swayY: 0, _lastYaw: 0, _lastPitch: 0, _kick: 0, _kickRot: 0, _chop: 0,
  _raise: 1, _flashT: 0, _flashLife: 0.05, _flashSize: 1, _shake: 0,
  _slashT: 1, _slashDir: 1, _spinT: 1, _lastNow: 0, _vib: 0, _fever: 0,

  init(renderer) {
    const sc = this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(70, 1, 0.02, 60);
    this.hemi = new THREE.HemisphereLight(0xc8d4ec, 0x4a3e34, 1.7);
    this.sun = new THREE.DirectionalLight(0xffe8d0, 2.2);
    this.light = new THREE.PointLight(0xffaa55, 0, 3, 2);
    sc.add(this.hemi, this.sun, this.sun.target);
    const root = this.root = new THREE.Group();
    sc.add(root);
    const pivot = this.pivot = new THREE.Group();
    root.add(pivot);
    pivot.add(this.light);
    this.light.position.set(0, 0.05, -0.5);

    // 腕(黒いスーツ + 赤い装甲 + 手袋)。手首は (0,0,0)、ひじは右下の後ろ(画面の外)
    const suit = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.75, metalness: 0.2 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x8a1414, roughness: 0.45, metalness: 0.5 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.8, metalness: 0.1 });
    const arm = this.arm = new THREE.Group();
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 10), suit);
    fore.rotation.x = Math.PI / 2 - 0.35; fore.position.set(0.03, -0.1, 0.24);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.24), armor);
    plate.rotation.x = -0.35; plate.position.set(0.03, -0.05, 0.22);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), glove);
    hand.position.set(0, -0.03, 0.04);
    arm.add(fore, plate, hand);
    pivot.add(arm);

    // 左手の剣(ふるときだけ見える)
    const sp = this.swordPivot = new THREE.Group();
    root.add(sp);
    const sword = this.sword = new THREE.Group();
    const bladeM = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x4ab0ff, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0.6 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 1.0), bladeM);
    blade.position.z = -0.6;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.035), armor);
    guard.position.z = -0.09;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), glove);
    grip.rotation.x = Math.PI / 2;
    const lhand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), glove);
    sword.add(blade, guard, grip, lhand);
    lhand.scale.setScalar(0.8);
    sp.add(sword);
    sp.visible = false;

    // 銃口の火
    this.flashMat = new THREE.ShaderMaterial({
      vertexShader: FLASH_VS, fragmentShader: FLASH_FS, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(0xffc060) }, uAlpha: { value: 0 } },
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.flashMat);
    this.flash.renderOrder = 10;
    this.flash.visible = false;
    pivot.add(this.flash);

    // 剣の光の弧(2 つ。剣と回転斬り)
    const ag = arcGeo(40);
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uA0: { value: 0 }, uA1: { value: 1 }, uR0: { value: 0.5 }, uR1: { value: 1 }, uHead: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0x4ab0ff) } },
      });
      const m = new THREE.Mesh(ag, mat);
      m.frustumCulled = false; m.renderOrder = 11; m.visible = false;
      m.position.z = -1;
      root.add(m);
      this.arcs.push(m);
    }

    // 武器(手元用の材質で作る)
    this.models = WEAPONS.map((w) => {
      const g = buildModel(w.id, 'vm');
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
      g.visible = false;
      g.scale.multiplyScalar(0.5);
      pivot.add(g);
      return g;
    });
    this.setWeapon(0, true);

    // 本編を描いたあとに重ねる
    const prev = Engine.scene.onAfterRender;
    Engine.scene.onAfterRender = function (r, s, cam, t) {
      if (prev) prev.call(this, r, s, cam, t);
      if (cam === Engine.camera && VM.active) VM.render(r);
    };
    // 材質の準備を先にすませる(初めて一人称にしたとき固まらないように)
    try {
      for (const m of this.models) m.visible = true;
      sp.visible = true;
      const p = renderer.compileAsync ? renderer.compileAsync(sc, this.cam) : null;
      const done = () => { for (const m of this.models) m.visible = m === this.model; sp.visible = false; };
      if (p && p.then) p.then(done, done); else { if (!p) renderer.compile(sc, this.cam); done(); }
    } catch (e) { console.warn('vm compile', e); }
    this.ready = true;
  },

  reset() { this._kick = 0; this._kickRot = 0; this._chop = 0; this._flashT = 0; this._slashT = 1; this._spinT = 1; this._raise = 1; },

  setWeapon(i, instant) {
    if (i === this.index) return;
    this.index = i;
    for (let k = 0; k < this.models.length; k++) this.models[k].visible = k === i;
    this.model = this.models[i] || null;
    if (!instant) this._raise = 0;
    const w = WEAPONS[i];
    // 重い武器は 少し下・内側に構える
    this._heavy = w && /cannon|rocket|minigun|rocketgat|thor|chainsaw/.test(w.id) ? 1 : 0;
  },

  // ---------- 武器係が呼ぶ ----------
  // 撃った反動(0..1.5)
  kick(s = 0.3) { this._kick = Math.min(1.4, this._kick + s); this._kickRot = Math.min(1, this._kickRot + s * 0.5); },
  // ハンマーの ふりおろし
  chop() { this._chop = 1; },
  // 銃口の火
  muzzleFlash(color = 0xffc060, size = 1) {
    this._flashT = this._flashLife = 0.045 + size * 0.012;
    this._flashSize = size;
    this.flashMat.uniforms.uColor.value.setHex(color);
    this.light.color.setHex(color);
    this.flash.rotation.z = Math.random() * Math.PI;
  },
  // 剣の光の弧(画面いっぱいの三日月)。dir = +1 / -1
  slash(dir = 1, color = 0x4ab0ff) {
    if (this._slashT < 0.8) return;          // ふっている途中は 出し直さない(画面がちらつかないように)
    this._slashT = 0; this._slashDir = dir;
    const m = this.arcs[0], u = m.material.uniforms;
    // 画面の少し下を中心に、上を通って 右→左(または 左→右)へ。少し斜めに
    m.position.set(0, -0.3, -1);
    m.rotation.z = (Math.random() - 0.5) * 0.9;
    u.uA0.value = dir > 0 ? 0.1 : Math.PI - 0.1; u.uA1.value = dir > 0 ? Math.PI - 0.1 : 0.1;
    u.uR0.value = 0.5; u.uR1.value = 0.86; u.uColor.value.setHex(color);
    m.visible = true;
  },
  // 回転斬り: 画面をぐるっと一周する光
  spin(color = 0x48b8ff) {
    this._spinT = 0;
    const m = this.arcs[1], u = m.material.uniforms;
    m.position.set(0, 0, -1);
    m.rotation.z = Math.random() * Math.PI * 2;
    u.uA0.value = 0; u.uA1.value = Math.PI * 2.2; u.uR0.value = 0.3; u.uR1.value = 1.15; u.uColor.value.setHex(color);
    m.visible = true;
  },
  vibrate(s) { this._vib = Math.max(this._vib, s); },

  // 銃口の世界の位置(弾が出る所)。見えている銃口と同じ画面の位置で、カメラから dist m 先
  muzzleWorld(out, dist = 1.5, tipIndex = 0) {
    const cam = Engine.camera, mdl = this.model;
    const tips = mdl && mdl.userData.tips;
    if (!tips || !this.ready) {
      out.set(0.25, -0.2, -1).applyQuaternion(cam.quaternion).normalize().multiplyScalar(dist).add(cam.position);
      return out;
    }
    // 見えている銃口の画面の位置(手元用のカメラで)→ 本編のカメラで同じ画面の位置の 光の線 → dist m 先
    _v.copy(tips[Math.min(tipIndex, tips.length - 1)]).applyMatrix4(mdl.matrixWorld).project(this.cam);
    _v.z = 0.5;
    _v.unproject(cam).sub(cam.position).normalize();
    out.copy(cam.position).addScaledVector(_v, dist);
    return out;
  },

  // ---------- 描く(本編のあと、毎フレーム) ----------
  render(renderer) {
    const now = performance.now();
    const dt = Math.min(0.05, this._lastNow ? (now - this._lastNow) / 1000 : 0.016);
    this._lastNow = now;
    this._animate(dt);
    const cam = Engine.camera, vc = this.cam;
    // 手元の武器は 決まった画角で描く(走る・ダッシュで本編の画角が変わっても 武器はゆがまない)
    const fov = cam.aspect < 1 ? 84 : 64;
    if (vc.fov !== fov || vc.aspect !== cam.aspect) { vc.fov = fov; vc.aspect = cam.aspect; vc.updateProjectionMatrix(); }
    cam.matrixWorld.decompose(vc.position, vc.quaternion, _s);
    vc.updateMatrixWorld();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, vc);
    renderer.autoClear = ac;
  },

  _animate(dt) {
    const cam = Engine.camera;
    this._t += dt;
    const root = this.root;
    cam.matrixWorld.decompose(root.position, root.quaternion, _s);
    // 太陽はいつも同じ向きから
    this.sun.position.set(root.position.x + 30, root.position.y + 60, root.position.z + 20);
    this.sun.target.position.copy(root.position);

    // 歩くゆれ
    const sp = Math.hypot(Player.vel.x, Player.vel.z);
    this._bobAmt += (Math.min(1, sp / 7) - this._bobAmt) * Math.min(1, dt * 8);
    this._bob += dt * (4 + sp * 1.1);
    // 向きを変えたとき、少し遅れてついてくる
    const dy = angleDiff(this._lastYaw, Engine.lookYaw), dp = Engine.lookPitch - this._lastPitch;
    this._lastYaw = Engine.lookYaw; this._lastPitch = Engine.lookPitch;
    const k = Math.min(1, dt * 10);
    this._swayX += (Math.max(-0.08, Math.min(0.08, -dy * 1.6)) - this._swayX) * k;
    this._swayY += (Math.max(-0.06, Math.min(0.06, -dp * 1.2)) - this._swayY) * k;
    // 反動・持ちかえ
    this._kick *= Math.exp(-dt * 13); this._kickRot *= Math.exp(-dt * 9);
    this._chop = Math.max(0, this._chop - dt * 3.2);
    this._raise = Math.min(1, this._raise + dt * 4.5);
    this._vib *= Math.exp(-dt * 10);

    const b = this._bobAmt, ph = this._bob;
    const raise = 1 - this._raise, rz = raise * raise;
    const vib = this._vib;
    const p = this.pivot;
    p.position.set(
      BASE.x - this._heavy * 0.03 + Math.sin(ph) * 0.014 * b + this._swayX + (Math.random() - 0.5) * vib * 0.012,
      BASE.y - this._heavy * 0.04 - Math.abs(Math.cos(ph)) * 0.02 * b + this._swayY - rz * 0.35 + this._kick * 0.012 + (Math.random() - 0.5) * vib * 0.012,
      BASE.z + this._kick * 0.09,
    );
    // ハンマー: 上から ふりおろす
    const ch = this._chop, chopA = ch > 0.75 ? (1 - ch) / 0.25 * -1.1 : ch * 1.6 * -1.1 / 1.2;
    p.rotation.set(this._kickRot * 0.22 + rz * 0.6 + this._swayY * 1.5 + (ch > 0 ? -chopA * 0.8 : 0), 0.06 + this._swayX * 2, -0.04 + Math.sin(ph) * 0.02 * b);

    // 銃口の火(見えている銃口にくっつける)
    const mdl = this.model;
    if (this._flashT > 0 && mdl && mdl.userData.tips) {
      this._flashT -= dt;
      const t = Math.max(0, this._flashT / this._flashLife);
      const f = this.flash;
      f.visible = true;
      mdl.updateMatrix();
      _v.copy(mdl.userData.tips[0]).applyMatrix4(mdl.matrix);
      f.position.copy(_v); f.position.z -= 0.04;
      const s = (0.16 + 0.1 * this._flashSize) * (0.7 + 0.5 * t);
      f.scale.set(s, s, s);
      this.flashMat.uniforms.uAlpha.value = t;
      this.light.position.copy(_v);
      this.light.intensity = 6 * t * this._flashSize;
    } else { this.flash.visible = false; this.light.intensity = this._fever > 0 ? 0.6 + 0.3 * Math.sin(this._t * 9) : 0; if (this._fever > 0) this.light.color.setHex(0xffc840); }

    // 武器のこまかい動き
    if (mdl) {
      const u = mdl.userData;
      if (u.chain) u.chain.position.y = 0.03 + (Math.random() - 0.5) * 0.006;
      if (u.disc) u.disc.rotation.y += dt * 30;
      if (u.star) u.star.rotation.y += dt * 12;
      if (u.head) u.head.rotation.z = Math.sin(this._t * 3) * 0.05;
    }

    // 剣(左手): ふっている間だけ
    const sw = this.swordPivot;
    if (this._slashT < 1 || this._spinT < 1) {
      sw.visible = true;
      if (this._spinT < 1) {
        this._spinT = Math.min(1, this._spinT + dt / 0.42);
        // 右から左へ 水平に 大きく ふり抜く(体ごと回る感じ)
        const t = this._spinT, e = 1 - Math.pow(1 - t, 2);
        sw.position.set(0.5 - e * 1.0, -0.12, -0.4);
        sw.rotation.set(-0.15, 1.2 - e * 2.4, 1.35);
        this.sword.position.set(0, 0, 0); this.sword.rotation.set(0, 0, 0);
      } else {
        this._slashT = Math.min(1, this._slashT + dt / 0.16);
        const t = this._slashT, e = 1 - Math.pow(1 - t, 3), d = this._slashDir;
        // 右上 → 左下(または その逆)へ 大きくふる
        sw.position.set(d * (0.35 - e * 0.7), 0.12 - e * 0.32, -0.42);
        sw.rotation.set(-0.4, d * (0.9 - e * 1.8), d * (0.7 - e * 0.4));
        this.sword.position.set(0, 0, 0); this.sword.rotation.set(0, 0, 0);
      }
    } else sw.visible = false;
    // 光の弧
    const a0 = this.arcs[0], a1 = this.arcs[1];
    if (a0.visible) {
      const t = this._slashT, u = a0.material.uniforms;
      u.uHead.value = Math.min(1.6, t * 1.5);
      u.uAlpha.value = (t < 0.6 ? 1 : Math.max(0, (1 - t) / 0.4)) * 0.75;
      if (t >= 1) a0.visible = false;
    }
    if (a1.visible) {
      const t = this._spinT, u = a1.material.uniforms;
      u.uHead.value = Math.min(1.8, t * 1.6);
      u.uAlpha.value = (t < 0.55 ? 1 : Math.max(0, (1 - t) / 0.45)) * 0.5;
      a1.scale.setScalar(1 + t * 0.35);
      if (t >= 1) a1.visible = false;
    }
  },
};
