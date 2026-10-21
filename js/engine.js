// 3D の描画係: レンダラー・シーン・カメラ・光・影・画面効果(光のにじみ)・画面ゆれ・ヒットストップ。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { damp, hashValue } from './util.js';

const C = CONFIG.CAMERA;

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
  camYaw: 0,                // 0 = 北(-z)を上に見る。固定(スティックの向きと画面の向きをそろえるため)
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
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.85);
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
    // 縦長の画面では広めに見せる
    this.camera.fov = w < h ? C.FOV * 1.35 : C.FOV;
    this.camera.updateProjectionMatrix();
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

  // ゲーム計算の速さ(フレームごとに main が呼ぶ。実時間 realDt を渡す)
  stepTime(realDt) {
    if (this._hitStop > 0) { this._hitStop -= realDt; this.timeScale = 0.05; return; }
    if (this._slow > 0) { this._slow -= realDt; this.timeScale = this._slowScale; return; }
    this.timeScale = 1;
  },

  // カメラをプレイヤーに追従させる
  updateCamera(realDt, target, inside) {
    const want = (inside ? C.INSIDE_DIST : C.DIST) * (this._zoomMult || 1);
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
    if (this.composer) this.composer.render(realDt);
    else this.renderer.render(this.scene, this.camera);
  },

  // 3D の位置 → 画面の位置(px)。画面の外・後ろなら null
  project(x, y, z, out = {}) {
    _v.set(x, y, z).project(this.camera);
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
      if (this.fps < 40) this._lowFpsTime++; else this._lowFpsTime = Math.max(0, this._lowFpsTime - 1);
      if (this._lowFpsTime >= 3 && (this._dprScale || 1) > 0.55) {
        this._dprScale = (this._dprScale || 1) * 0.85;
        this._lowFpsTime = 0;
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
