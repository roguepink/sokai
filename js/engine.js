// 3D の描画係: レンダラー・シーン・カメラ・光・影・画面効果(光のにじみ)・画面ゆれ・ヒットストップ。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Events } from './events.js';
import { damp, hashValue } from './util.js';
import { ViewCam } from './view-camera.js';

const C = CONFIG.CAMERA, V = CONFIG.VIEW;

export const Engine = {
  renderer: null, scene: null, camera: null, composer: null, bloom: null,
  sun: null, hemi: null,
  quality: 'high',          // 'low' | 'mid' | 'high'
  timeScale: 1,             // ヒットストップ・スロー演出用(ゲーム計算の速さ)
  fps: 60,
  // カメラ
  camTarget: new THREE.Vector3(),
  camDist: C.DIST,
  camDistWant: C.DIST,
  camPitch: C.PITCH,
  street: 0,               // 高い建物にはさまれた道にいる(0..1。main が入れる)
  // 視点: 'top' = 見下ろし(いつもの) / 'tps' = 肩越し(三人称) / 'fps' = 主人公の目線(一人称)
  viewMode: 'top',
  lookYaw: 0,               // tps/fps で見ている向き(facing と同じ決まり: 0 = 北)
  lookPitch: 0,             // tps/fps の上下(+ = 上を見る)
  viewDir: new THREE.Vector3(0, 0, -1),   // 見ている向き(XZ、長さ1)。top のときは北
  camYaw: 0,                // 0 = 北(-z)を上に見る。固定(スティックの向きと画面の向きをそろえるため)
  ctx: null,                // main が入れる { Player, Zombies, Weapons, Input, World }(視点係が読むだけ)
  get hideHero() { return ViewCam.hideHero && this.viewMode !== 'top'; },   // 主人公を見せない(一人称・壁ぎわ)
  get cross() { return ViewCam.cross; },
  get heroFade() { return this.viewMode === 'tps' ? ViewCam.heroFade : 1; },   // 主人公の こさ(肩越しで壁ぎわ = うすく)   // 照準の画面の位置 {x, y}(px)
  _shake: 0, _hitStop: 0, _slow: 0, _slowScale: 1,
  _fpsAcc: 0, _fpsN: 0, _lowFpsTime: 0,

  init(container) {
    const q = hashValue('q');
    const saved = loadSettings();
    this.quality = q || saved.quality || (isMobile() ? 'mid' : 'high');

    const r = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = this.quality !== 'low';
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    r.domElement.id = 'game';
    this.renderer = r;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1b22);
    scene.fog = new THREE.Fog(0x1a1b22, CONFIG.RENDER.FOG_NEAR, CONFIG.RENDER.FOG_FAR);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(C.FOV, 1, 0.5, 400);

    // 光: 空と地面の照り返し + 太陽(影つき)
    this.hemi = new THREE.HemisphereLight(0x9fb4d8, 0x3a2e24, 1.1);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2c0, 2.4);
    sun.position.set(30, 60, 20);
    sun.castShadow = r.shadowMap.enabled;
    const S = CONFIG.RENDER.SHADOW_AREA;
    sun.shadow.mapSize.set(this.quality === 'high' ? CONFIG.RENDER.SHADOW_SIZE : 1024, this.quality === 'high' ? CONFIG.RENDER.SHADOW_SIZE : 1024);
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 160 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

    // 画面効果: 光のにじみ(爆発・銃口の光が輝く)
    if (this.quality !== 'low') {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    const maxDpr = this.quality === 'high' ? 2 : this.quality === 'mid' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * (this._dprScale || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();   // 画角(fov)は カメラを動かすたびに決める(post)
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.resolution.set(w / 2, h / 2);
    }
  },

  // 画面ゆれ(大きいほど強い。0.2 = 小, 1 = 大爆発)
  shake(amount) { this._shake = Math.min(2, Math.max(this._shake, amount)); },
  // ヒットストップ(一瞬止める。気持ちよさの演出。秒)
  hitStop(sec) { this._hitStop = Math.max(this._hitStop, sec); },
  // スロー演出(scale = 0.3 なら 3割の速さ)
  slowMo(sec, scale = 0.35) { this._slow = Math.max(this._slow, sec); this._slowScale = scale; },
  // カメラの引き具合(1 = いつも, 1.5 = 引く)
  setZoom(mult) { this._zoomMult = mult; },
  // 画角のパンチ(度。爆発・叩きつけなどで 一瞬 広がる。肩越し・一人称のとき)
  fovKick(deg) { ViewCam.punch(deg); },
  // カメラのかたむき(ラジアン。ダッシュで横へ)。0 でもどる
  setRoll(rad) { ViewCam.rollWant = rad; },
  // 着地でカメラが沈む(0.1〜0.5)
  landDip(amount) { ViewCam.land(amount); },

  // ゲーム計算の速さ(フレームごとに main が呼ぶ。実時間 realDt を渡す)
  stepTime(realDt) {
    if (this._hitStop > 0) { this._hitStop -= realDt; this.timeScale = 0.05; return; }
    if (this._slow > 0) { this._slow -= realDt; this.timeScale = this._slowScale; return; }
    this.timeScale = 1;
  },

  // 視点を切りかえる(イベント viewChange {mode} を出す)。保存もする。カメラは なめらかに移る
  setViewMode(mode, yaw, save = true) {
    if (!['top', 'tps', 'fps'].includes(mode) || mode === this.viewMode) return;
    ViewCam.startBlend(this.camera, this.viewMode === 'top' || mode === 'top' ? V.BLEND : V.BLEND * 0.7);
    const prev = this.viewMode;
    this.viewMode = mode;
    if (yaw !== undefined) this.lookYaw = yaw;
    if (prev === 'top' || yaw !== undefined) this.lookPitch = mode === 'fps' ? V.FPS.PITCH0 : V.TPS.PITCH0;
    this.look(0, 0);
    if (save) { const s = loadSettings(); s.view = mode; saveSettings(s); }
    this.resize();
    Events.emit('viewChange', { mode, prev });
  },
  // tps/fps: 指やマウスで向きを変える(ラジアン)。上下は 見すぎないように かぎる
  look(dYaw, dPitch) {
    const L = this.viewMode === 'fps' ? V.FPS : V.TPS;
    this.lookYaw += dYaw;
    this.lookPitch = Math.max(L.PITCH_MIN, Math.min(L.PITCH_MAX, this.lookPitch + dPitch));
  },

  // 操作の設定(保存される): sens = 向きを変える速さ(0.5〜2)/ autoTurn = 自動で向きを合わせる / invertY = 上下を反対に
  settings: {
    _c: null,
    _get() { return this._c || (this._c = loadSettings()); },
    _set(k, v) { const s = loadSettings(); s[k] = v; saveSettings(s); this._c = s; },
    get sens() { const v = +this._get().lookSens; return v > 0 ? v : 1; },
    set sens(v) { this._set('lookSens', Math.max(0.3, Math.min(3, +v || 1))); },
    get autoTurn() { return this._get().autoTurn !== false; },
    set autoTurn(v) { this._set('autoTurn', !!v); },
    get invertY() { return this._get().invertY === true; },
    set invertY(v) { this._set('invertY', !!v); },
  },

  // カメラをプレイヤーに追従させる
  updateCamera(realDt, target, inside, demo) {
    if (!this._vcInit) { this._vcInit = true; ViewCam.init(); }
    const close = !demo && this.viewMode !== 'top';
    if (!demo && ViewCam.shot) ViewCam.endShot(this.camera);
    let mode = 'top';
    if (close || ViewCam.shot) this.camTarget.set(target.x, target.y + 1, target.z);   // 見下ろしにもどったとき とばないように
    if (close) {
      ViewCam.close(this, realDt, target);
      this.viewDir.set(Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw));
      mode = 'close';
    } else if (demo && ViewCam.cine(this, realDt, target)) mode = 'close';
    else this._topCamera(realDt, target, inside, demo);
    ViewCam.post(this, realDt, mode, innerWidth < innerHeight ? C.FOV * 1.35 : C.FOV);
  },

  // 見下ろしのカメラ(いつもの)
  _topCamera(realDt, target, inside, demo) {
    this.viewDir.set(0, 0, -1);
    // タイトルの見本プレイ: ゆっくり回りこみ、少し低い角度で 迫力を出す。プレイが始まったら北が上にもどす
    if (demo) {
      this.camYaw += realDt * 0.07;
      this.camPitch = damp(this.camPitch, 0.78, 1.5, realDt);
    } else {
      if (this.camYaw) this.camYaw = 0;             // スティックの向き = 画面の向き にするため、すぐもどす
      // 高い建物にはさまれた道では、真上に近い角度にして 壁で主人公がかくれないように(main が street を 0..1 で入れる)
      this._street = damp(this._street || 0, inside ? 0 : this.street, 2.5, realDt);
      this.camPitch = damp(this.camPitch, C.PITCH + 0.25 * this._street, 4, realDt);
    }
    const want = (inside ? C.INSIDE_DIST : C.DIST) * (this._zoomMult || 1) * (demo ? 1.12 + 0.08 * Math.sin(this.camYaw * 2.3) : 1 + 0.08 * (this._street || 0));
    this.camDist = damp(this.camDist, want, 3, realDt);
    this.camTarget.x = damp(this.camTarget.x, target.x, C.LERP, realDt);
    this.camTarget.z = damp(this.camTarget.z, target.z, C.LERP, realDt);
    this.camTarget.y = damp(this.camTarget.y, target.y + 1, C.LERP, realDt);
    const d = this.camDist, p = this.camPitch;
    const cam = this.camera;
    cam.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * Math.cos(p) * d,
      this.camTarget.y + Math.sin(p) * d,
      this.camTarget.z + Math.cos(this.camYaw) * Math.cos(p) * d,
    );
    if (this._shake > 0) {
      const s = this._shake * this._shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this._shake = Math.max(0, this._shake - realDt * 2.2);
    }
    cam.lookAt(this.camTarget);
    // 影はプレイヤーの周りだけ計算する
    this.sun.position.set(target.x + 30, 60, target.z + 20);
    this.sun.target.position.set(target.x, 0, target.z);
  },

  render(realDt) {
    this._measureFps(realDt);
    if (this.composer && !this._noBloom) this.composer.render(realDt);
    else this.renderer.render(this.scene, this.camera);
  },

  // 3D の位置 → 画面の位置(px)。画面の外・後ろなら null
  project(x, y, z, out = {}) {
    const cam = this.camera;
    _v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
    if (_v.z > -cam.near) return null;          // カメラの後ろ(肩越し・一人称で よくある)
    _v.applyMatrix4(cam.projectionMatrix);
    if (_v.z > 1) return null;
    out.x = (_v.x * 0.5 + 0.5) * innerWidth;
    out.y = (-_v.y * 0.5 + 0.5) * innerHeight;
    return out;
  },

  // 遅いときは自動で解像度を下げる(スマホで固まらないように)
  _measureFps(dt) {
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 1) {
      this.fps = this._fpsN / this._fpsAcc;
      this._fpsAcc = 0; this._fpsN = 0;
      if (document.hidden) return;
      const sc = this._dprScale || 1;
      if (this.fps < 40) { this._lowFpsTime++; this._goodFpsTime = 0; }
      else { this._lowFpsTime = Math.max(0, this._lowFpsTime - 1); this._goodFpsTime = this.fps > 56 ? (this._goodFpsTime || 0) + 1 : 0; }
      if (this._lowFpsTime >= 3 && sc > 0.55) {
        // 遅い: 解像度を下げる
        this._dprScale = Math.max(0.55, sc * 0.85);
        this._lowFpsTime = 0;
        this.resize();
      } else if (this._lowFpsTime >= 4 && sc <= 0.55 && this.composer && !this._noBloom) {
        // それでも遅い: 光のにじみをやめる(いちばん重い画面効果)
        this._noBloom = true; this._lowFpsTime = 0;
      } else if (this._goodFpsTime >= 8 && sc < 1) {
        // 余裕がもどった: 少しずつ戻す
        this._dprScale = Math.min(1, sc * 1.08);
        this._goodFpsTime = 0;
        this.resize();
      }
    }
  },

  setQuality(q) {
    const s = loadSettings(); s.quality = q; saveSettings(s);
    location.reload();
  },
};

const _v = new THREE.Vector3();

function isMobile() { return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100); }

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}
