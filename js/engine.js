// 3D の描画係: レンダラー・シーン・カメラ・光・影・画面効果(光のにじみ)・画面ゆれ・ヒットストップ。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Events } from './events.js';
import { damp, hashValue, HASH } from './util.js';
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
    // 省エネモード: 設定で保存。アドレスの #eco でも(確認用。#eco=0 で切る)
    this.eco = HASH.has('eco') || (hashValue('eco') ? hashValue('eco') !== '0' : saved.eco === true);
    this.prof = PROFILE[this.quality] || PROFILE.high;

    // 軽量化: 画面効果(光のにじみ)を使うときは、絵は いったん別の紙(にじみ用)に描くので、
    // キャンバスの なめらか処理(MSAA)は 効かない(重いだけ)。だから切る(見た目は変わらない)
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
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
    // 影の地図は 自分で「今回 描きなおす」を決める(スマホは 2 回に 1 回。render() を見る)
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 200 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

    // 画面効果: 光のにじみ(爆発・銃口の光が輝く)
    if (this.quality !== 'low') {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.9);
      lightenBloom(this.bloom, this);
      this._bloomScale = this.prof.bloom >= 1 && !this.eco ? 1 : 0.5;
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.bloom.setScale(this._bloomScale);
    }

    // 自動で軽くする段(見た目の変化が小さい順に 積み上げる)
    const lv = [{ dpr: 1 }];
    const add = (o) => lv.push(Object.assign({}, lv[lv.length - 1], o));
    if (this.composer && this.prof.bloom >= 1) add({ halfBloom: true });
    if (r.shadowMap.enabled && this.prof.shadowEvery < 2) add({ shadow: 2 });
    for (const d of [0.85, 0.72, 0.62, 0.55]) add({ dpr: d });
    if (this.composer) add({ noBloom: true });
    this._levels = lv;

    addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    // 絵の細かさ(1 CSS ピクセルを 何ピクセルで描くか)。スマホ(中)は 1.25 まで(点数などの文字は HTML なので くっきりのまま)
    const maxDpr = this.eco ? Math.min(this.prof.dpr, 1) : this.prof.dpr;
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
    this._viewT = 3;            // 切りかえ直後は 影を毎回 描きなおす
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
    this._demo = demo;
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
    this._updateSun(target, close);
  },

  // 太陽(夜は月)の向きを 時間に合わせる。影は主人公のまわりだけ計算する(肩越し・一人称は 見ている方を広めに)。
  // マップ係が World.sunDir / World.moonDir を持っていれば それを使う。なければ World.timeOfDay から 空と同じ式で出す
  _updateSun(target, close) {
    const sun = this.sun; if (!sun) return;
    let t = 0.22;
    try { t = World.timeOfDay ?? 0.22; } catch (e) {}
    const sa = t * Math.PI * 2;
    if (World.sunDir && World.sunDir.isVector3) _sd.copy(World.sunDir).normalize();
    else _sd.set(-Math.sin(sa) * 0.92, Math.cos(sa) * 0.9 + 0.06, 0.38).normalize();
    if (World.moonDir && World.moonDir.isVector3) _md.copy(World.moonDir).normalize();
    else _md.set(Math.sin(sa) * 0.7 + 0.2, Math.max(0.25, -Math.cos(sa) * 0.75), -0.5).normalize();
    // 太陽が しずむ前後で 月の向きへ なめらかに うつす
    const day = Math.max(0, Math.min(1, (_sd.y + 0.02) / 0.16));
    const k = day * day * (3 - 2 * day);
    _ld.copy(_md).lerp(_sd, k);
    // 低すぎると 影が のびすぎて ちらつくので、高さは 24° 以上にする
    const MIN_Y = 0.42;
    if (_ld.y < MIN_Y) { const h = Math.hypot(_ld.x, _ld.z) || 1; const s = Math.sqrt(1 - MIN_Y * MIN_Y) / h; _ld.x *= s; _ld.z *= s; _ld.y = MIN_Y; }
    _ld.normalize();
    // 夜(月)と くもり・雨は 影を うすく
    if ('intensity' in sun.shadow) {
      let w = 'clear'; try { w = World.weather || 'clear'; } catch (e) {}
      const wk = w === 'storm' ? 0.5 : w === 'rain' || w === 'fog' || w === 'snow' || w === 'ash' ? 0.65 : 1;
      sun.shadow.intensity = (0.45 + 0.55 * k) * wk;
    }
    // 影の中心: 見下ろし = 主人公 / 肩越し・一人称 = 見ている方へ 少し先
    let cx = target.x, cz = target.z;
    if (close) { cx += this.viewDir.x * 20; cz += this.viewDir.z * 20; }
    // 影の ちらつき止め: 影の地図の 1 マスきざみに 中心をそろえる(光から見た 横・縦の向きで)
    const S = CONFIG.RENDER.SHADOW_AREA, texel = (2 * S) / sun.shadow.mapSize.x;
    _rt.set(-_ld.z, 0, _ld.x).normalize();               // 光から見た 横
    _up.crossVectors(_ld, _rt);                           // 光から見た 縦
    _c.set(cx, 0, cz);
    const a = Math.round(_c.dot(_rt) / texel) * texel, b = Math.round(_c.dot(_up) / texel) * texel, n = _c.dot(_ld);
    _c.copy(_rt).multiplyScalar(a).addScaledVector(_up, b).addScaledVector(_ld, n);
    sun.target.position.copy(_c);
    sun.position.copy(_c).addScaledVector(_ld, 90);
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
  },

  // ---------- 軽量化: 1 秒に描く回数をそろえる ----------
  // 120Hz・90Hz の画面のスマホでも 1 秒に 60 回まで(省エネモードは 30 回)。タイトルの見本は 30 回、一時停止中は 15 回。
  // ゲームの計算は main が 1/60 秒きざみで進めるので、描く回数を減らしても 速さは変わらない。
  // main のループの最初で `if (!Engine.shouldRender(now, state)) return;` と呼ぶ(呼ばれないときは render() が自分で間引く)
  // state: 'play' | 'title' | 'paused' | 'result'(省略 = 'play')
  maxFps(state) {
    const s = state || this._state || 'play';
    if (s === 'paused' || s === 'result') return 15;
    if (s === 'title') return 30;
    return this.eco ? 30 : 60;
  },
  shouldRender(now, state) {
    this._gated = true;
    return this._gate(now, state);
  },
  _gate(now, state) {
    if (state) this._state = state;
    const cap = this.maxFps();
    this._cap = cap;
    const iv = 1000 / cap;
    // 画面の切りかえの ゆらぎ(数ミリ秒)で 1 回とばさないよう、4 分の 1 だけ ゆるす
    if (now < this._nextT - iv * 0.25) return false;
    this._nextT = Math.max(this._nextT + iv, now);
    if (this._nextT > now + iv * 1.5) this._nextT = now + iv;     // 回数の上限が変わった直後(一時停止 → プレイ)に 待ちすぎない
    return true;
  },
  beforeRender: [],           // 描く直前に呼ぶ(ほかの係が足してよい。軽い処理だけ)
  _nextT: 0, _cap: 60, _state: 'play', _gated: false, _shadowN: 0,

  render(realDt) {
    // main が shouldRender を呼んでいないとき(古いループ)は、ここで間引く
    if (!this._gated && !this._gate(performance.now(), this._demo ? 'title' : 'play')) return;
    if (this.bloom) this.bloom.strength = this.viewMode === 'fps' ? 0.35 : this.viewMode === 'tps' ? 0.42 : 0.5;
    this._measureFps();
    this._shadowTick();
    for (let i = 0; i < this.beforeRender.length; i++) this.beforeRender[i]();
    if (this.composer && !this._noBloom) this.composer.render(realDt);
    else this.renderer.render(this.scene, this.camera);
  },

  // 影の地図を描きなおすか。スマホ(中)は 2 回に 1 回(影は 1 秒に 30 回。動きの小さいゾンビの影では 分からない)。
  // 主人公が ダッシュ・ジャンプ中、視点を切りかえた直後、1 秒 30 回以下で描いているときは 毎回
  _shadowTick() {
    const sm = this.renderer.shadowMap;
    if (!sm.enabled) return;
    let every = this._shadowEvery || this.prof.shadowEvery;
    if (this._cap <= 30) every = 1;
    const P = this.ctx && this.ctx.Player, mv = P && P.moves;
    if (mv && (mv.dashing || mv.airborne)) every = 1;
    if (this._viewT > 0) { this._viewT--; every = 1; }
    if (++this._shadowN >= every) { this._shadowN = 0; sm.needsUpdate = true; }
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

  // 遅いとき(スマホが熱くなって 力を落としたときも)は 自動で 少しずつ軽くする。余裕がもどったら 少しずつ戻す。
  // 段(_levels。init で作る): そのまま → 光のにじみを半分の細かさ → 影を 2 回に 1 回 → 絵の細かさ 0.85 … 0.55 → 光のにじみをやめる
  // (はじめから そうなっている段は とばす。見た目の変化が小さい順)
  // 「遅い」= 目標(1 秒 60 回。省エネ 30 回)の 4 分の 3 より少ない が 3 秒続いた。戻すのは 目標の 93% 以上が 8 秒(下げたばかりの段は もっと長く)
  _measureFps() {
    const now = performance.now(), dt = this._fpsLast ? Math.min(0.25, (now - this._fpsLast) / 1000) : 0;   // 描いた間の 本当の時間(main が間引いても 正しく)
    this._fpsLast = now;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc < 1) return;
    this.fps = this._fpsN / this._fpsAcc;
    this._fpsAcc = 0; this._fpsN = 0;
    if (document.hidden || this._state !== 'play') { this._lowFpsTime = 0; this._goodFpsTime = 0; return; }
    const cap = this._cap || 60;
    if (this.fps < cap * 0.75) { this._lowFpsTime++; this._goodFpsTime = 0; }
    else { this._lowFpsTime = Math.max(0, this._lowFpsTime - 1); this._goodFpsTime = this.fps > cap * 0.93 ? (this._goodFpsTime || 0) + 1 : 0; }
    const lv = this.level || 0;
    if (this._lowFpsTime >= 3 && lv < this._levels.length - 1) {
      this._setLevel(lv + 1);
      this._lowFpsTime = 0;
      this._upWait = Math.min(60, (this._upWait || 8) * 1.5);   // 行ったり来たり しないように、戻すのは だんだん慎重に
    } else if (lv > 0 && this._goodFpsTime >= (this._upWait || 8)) {
      this._setLevel(lv - 1);
      this._goodFpsTime = 0;
    }
  },
  level: 0,
  _setLevel(lv) {
    this.level = lv;
    const L = this._levels[lv];
    this._dprScale = L.dpr;
    this._shadowEvery = L.shadow ? Math.max(L.shadow, this.prof.shadowEvery) : 0;
    this._noBloom = !!L.noBloom;
    if (this.bloom) this.bloom.setScale(L.halfBloom || this.eco || this.prof.bloom < 1 ? 0.5 : 1);
    this.resize();
  },

  // 省エネモード(設定で えらぶ。保存される): 1 秒 30 回・絵の細かさ 1 まで・光のにじみは半分の細かさ。読みこみ直しは いらない
  setEco(on) {
    this.eco = !!on;
    const s = loadSettings(); s.eco = this.eco; saveSettings(s);
    this._setLevel(0);
    this._upWait = 8;
  },

  setQuality(q) {
    const s = loadSettings(); s.quality = q; saveSettings(s);
    location.reload();
  },
};

const _v = new THREE.Vector3();
const _sd = new THREE.Vector3(), _md = new THREE.Vector3(), _ld = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _c = new THREE.Vector3();

// スマホ・タブレット: iPad は「Mac」と名のるので、指でさわれる Mac も タブレットとみなす
function isMobile() {
  const ua = navigator.userAgent, tp = navigator.maxTouchPoints || 0;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && tp > 1) || (tp > 1 && innerWidth < 1100);
}

// 画質ごとの重さ: dpr = 絵の細かさの上限 / bloom = 光のにじみの細かさ(1 = 半分の大きさで計算、0.5 = 4 分の 1)/ shadowEvery = 影を何回に 1 回 描きなおすか
const PROFILE = {
  high: { dpr: 2, bloom: 1, shadowEvery: 1 },
  mid: { dpr: 1.25, bloom: 0.5, shadowEvery: 2 },
  low: { dpr: 1, bloom: 0.5, shadowEvery: 2 },
};

// 光のにじみ(UnrealBloomPass)を 軽くできるようにする: pass.setScale(0.5) で 4 分の 1 の大きさで計算する。
// ぼかしの幅は 半分の点数で 同じ広さになるようにし(見た目の広がりは同じ)、明るい所を取り出すときは 4 点の平均をとる(小さな火花が ちらつかない)
function lightenBloom(pass) {
  const full = pass.separableBlurMaterials, lite = [3, 5, 7, 9, 11].map((k) => pass._getSeparableBlurMaterial(k));
  const hpFull = pass.materialHighPassFilter, U = pass.highPassUniforms;
  U.uTexel = { value: new THREE.Vector2(1 / 1024, 1 / 1024) };
  const hpLite = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: hpFull.vertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 defaultColor; uniform float defaultOpacity; uniform float luminosityThreshold; uniform float smoothWidth; uniform vec2 uTexel;
      varying vec2 vUv;
      vec4 hp(vec2 uv){ vec4 t = texture2D(tDiffuse, uv); float v = luminance(t.xyz); return mix(vec4(defaultColor, defaultOpacity), t, smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v)); }
      void main(){ gl_FragColor = 0.25 * (hp(vUv + uTexel * vec2(-1.0, -1.0)) + hp(vUv + uTexel * vec2(1.0, -1.0)) + hp(vUv + uTexel * vec2(-1.0, 1.0)) + hp(vUv + uTexel * vec2(1.0, 1.0))); }`,
  });
  const setSize = pass.setSize.bind(pass);
  pass._scale = 1; pass._w = 2; pass._h = 2;
  pass.setSize = (w, h) => {
    pass._w = w; pass._h = h;
    U.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
    setSize(Math.max(4, Math.round(w * pass._scale)), Math.max(4, Math.round(h * pass._scale)));
  };
  pass.setScale = (s) => {
    s = s < 1 ? 0.5 : 1;
    if (s === pass._scale) return;
    pass._scale = s;
    pass.separableBlurMaterials = s < 1 ? lite : full;
    pass.materialHighPassFilter = s < 1 ? hpLite : hpFull;
    pass.setSize(pass._w, pass._h);
  };
}

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY)) || {}; } catch (e) { return {}; }
}
export function saveSettings(s) {
  try { localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}
