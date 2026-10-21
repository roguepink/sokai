// マップ係: 空・遠くの景色・時間(昼と夜)・天気(雨・雷雨・霧・雪・灰)。
//  - 空はドーム 1 枚のシェーダー(夕焼け・雲・月・星・稲光)。カメラについてくる
//  - 遠くの町なみ・山なみは、カメラのまわりの「輪」1 枚(霧の色にとけこむ。世界が どこまでも続いて見える)
//  - 時間: World.timeOfDay 0..1(0 = 昼 / 0.25 = 夕方 / 0.5 = 真夜中 / 0.75 = 夜明け)。1 周 CYCLE 秒
//  - 光の数は変えない。太陽(夜は月の光)と空の光の 色と明るさだけ変える。街灯・窓・ネオンは光る色の強さで
//  - 変わったらイベント worldChange {timeOfDay, weather, text, phase}
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { seeded } from './util.js';

export const CYCLE = 420;               // 1 日の長さ(秒)
const START_T = 0.22;                    // はじまりは夕方
const WEATHERS = ['clear', 'rain', 'storm', 'fog', 'snow', 'ash'];
const W_TEXT = { clear: '空が晴れた', rain: '雨が降ってきた', storm: '雷雨だ!', fog: '霧が出てきた', snow: '雪が降ってきた', ash: '灰が降ってきた…' };

// 時間ごとの色(t, 空の上, 地平線, 霧, 空の光(上), 空の光(下), 空の光の強さ, 太陽の色, 太陽の強さ, 窓, 街灯, 光だまり, 星)
const KEYS = [
  [0.00, 0x3f6ea8, 0xb9c4cc, 0x8e959c, 0xd4dcee, 0x5b5248, 1.55, 0xfff1de, 2.9, 0.15, 0.55, 0.12, 0],
  [0.16, 0x4a6aa0, 0xd6b89a, 0x8c8682, 0xd0cce0, 0x584a40, 1.45, 0xffe2bc, 2.7, 0.3, 0.6, 0.2, 0],
  [0.24, 0x2a2550, 0xe89a5c, 0x464256, 0x9aa4d2, 0x3d3631, 1.15, 0xffd2ae, 2.25, 1.0, 1.0, 1.0, 0.1],
  [0.30, 0x101030, 0x8a4a58, 0x2c2a40, 0x7c86ba, 0x2a2630, 0.98, 0xc8a0a8, 1.45, 1.35, 1.2, 1.3, 0.5],
  [0.36, 0x05070f, 0x1c2440, 0x182030, 0x6a7cae, 0x201e26, 0.86, 0x9db0ff, 1.05, 1.6, 1.4, 1.7, 1],
  [0.64, 0x05070f, 0x1c2440, 0x182030, 0x6a7cae, 0x201e26, 0.86, 0x9db0ff, 1.05, 1.6, 1.4, 1.7, 1],
  [0.70, 0x111a3a, 0x4a4a6c, 0x2a3044, 0x8890b8, 0x2a2830, 0.96, 0xb0b8e8, 1.25, 1.4, 1.2, 1.3, 0.6],
  [0.76, 0x2a3c70, 0xf2a27a, 0x6a5c6c, 0xb0aacc, 0x3e3634, 1.2, 0xffc8a0, 2.1, 0.9, 0.9, 0.8, 0.1],
  [0.84, 0x5078b0, 0xe0c8a8, 0x8a8c90, 0xc8d0e4, 0x564c44, 1.4, 0xfff0dc, 2.6, 0.3, 0.6, 0.2, 0],
  [1.00, 0x3f6ea8, 0xb9c4cc, 0x8e959c, 0xd4dcee, 0x5b5248, 1.55, 0xfff1de, 2.9, 0.15, 0.55, 0.12, 0],
].map((k) => k.map((v, i) => (i >= 1 && i <= 5) || i === 7 ? new THREE.Color(v) : v));
const PHASES = [[0.225, 'dusk', '日が沈む…'], [0.32, 'night', '夜になった'], [0.5, 'midnight', '真夜中だ'], [0.72, 'dawn', '夜明けだ'], [0.82, 'day', '朝になった']];

const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();
const grey = (c, k) => { const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15; c.r += (l - c.r) * k; c.g += (l - c.g) * k; c.b += (l - c.b) * k; return c; };

// ---------- 空のドーム ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `
uniform vec3 uTop, uHor, uFog, uSunCol, uSunDir, uMoonDir, uCloudCol;
uniform float uStars, uCloud, uTime, uFlash, uSunVis, uMoonVis;
varying vec3 vDir;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.5, h));
  // 太陽のまわりの ほてり
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 60.0) * 0.6) * uSunVis;
  col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 3.0 * uSunVis;
  // 星
  if (uStars > 0.01 && h > 0.0) {
    vec3 p = d * 220.0, ip = floor(p), fp = fract(p) - 0.5;
    float r = h3(ip);
    float st = step(0.9965, r) * smoothstep(0.32, 0.0, length(fp)) * (0.6 + 0.4 * sin(uTime * (2.0 + r * 9.0) + r * 60.0));
    col += vec3(0.9, 0.95, 1.0) * st * uStars * 1.6 * smoothstep(0.02, 0.25, h);
  }
  // 月
  float md = max(dot(d, uMoonDir), 0.0);
  float disk = smoothstep(0.99935, 0.99955, md);
  float crater = 0.8 + 0.2 * n2(d.xy * 900.0);
  col = mix(col, vec3(1.0, 0.97, 0.88) * 1.6 * crater, disk * uMoonVis);
  col += vec3(0.5, 0.6, 0.9) * pow(md, 300.0) * 0.5 * uMoonVis;
  // 雲(流れる)
  vec2 uv = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
  float c = fbm(uv);
  float cov = smoothstep(1.0 - uCloud * 0.85 - 0.15, 1.15 - uCloud * 0.6, c) * smoothstep(-0.02, 0.18, h);
  vec3 cc = uCloudCol * (0.75 + 0.5 * fbm(uv * 2.0 + 3.0));
  cc += uSunCol * pow(sd, 4.0) * 0.4 * uSunVis;
  col = mix(col, cc, cov * 0.92);
  // 稲光
  col += vec3(0.75, 0.8, 1.0) * uFlash * (0.35 + cov * 1.2);
  // 地平線より下は 霧の色(地面とつながる)
  col = mix(uFog, col, smoothstep(-0.03, 0.09, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- 遠くの景色の輪 ----------
const RING_VS = `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RING_FS = `
uniform sampler2D uMap; uniform vec3 uFog, uSil, uCam; uniform float uNight, uTime, uVis, uFlash;
varying vec3 vW; varying vec2 vUv;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float near = t.r, far = t.b;
  if (max(near, far) < 0.5) discard;
  vec3 farC = mix(uSil, uFog, 0.72), nearC = mix(uSil, uFog, 0.42);
  vec3 col = near > 0.5 ? nearC : farC;
  float g = t.g;
  if (near > 0.5 && g > 0.04) {
    if (g > 0.95) col += vec3(2.2, 0.15, 0.1) * step(0.5, fract(uTime * 0.6 + vUv.x * 37.0)) * uNight;
    else col += vec3(1.0, 0.72, 0.4) * g * 1.6 * uNight;
  }
  col += vec3(0.5, 0.55, 0.7) * uFlash * 0.4;
  col = mix(uFog, col, uVis);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function ringTexture() {
  const W = 2048, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), r = seeded(4711);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  // 輪の模様の横位置 u: 南 = 0, 東 = 0.25, 北 = 0.5, 西 = 0.75(CylinderGeometry の uv)。方角 deg: 北 0 / 東 90 / 南 180 / 西 270
  const pxOf = (deg) => (((180 - deg) % 360 + 360) % 360) / 360 * W;
  const degOf = (px) => (((180 - px / W * 360) % 360) + 360) % 360;
  // 方角の範囲 → 横の範囲(南をまたぐときは 2 つに分ける)
  const span = (a0, a1) => { const p0 = pxOf(a1), p1 = pxOf(a0); return p0 <= p1 ? [[p0, p1]] : [[p0, W], [0, p1]]; };
  // 遠い山(青のチャンネル)。東(海)は低い
  x.fillStyle = 'rgb(0,0,255)';
  x.beginPath(); x.moveTo(0, H);
  for (let px = 0; px <= W; px += 4) {
    const deg = degOf(px);
    const eastLow = Math.min(1, Math.abs(((deg - 120 + 540) % 360) - 180) / 75);
    const m = (0.35 + 0.33 * Math.sin(px * 0.0061 + 1.3) + 0.15 * Math.sin(px * 0.017 + 0.4) + 0.1 * Math.sin(px * 0.051)) * eastLow;
    const big = deg > 300 || deg < 50 || (deg > 230 && deg < 300) ? 1 : 0.5;
    x.lineTo(px, H - H * (0.1 + Math.max(0, m) * 0.6) * big);
  }
  x.lineTo(W, H); x.fill();
  // 近い丘・町なみ(赤のチャンネル)+ 窓の明かり(緑。1.0 = 赤い航空灯)
  const hill = (a0, a1, hmax) => {
    for (const [p0, p1] of span(a0, a1)) {
      x.fillStyle = 'rgb(255,0,0)'; x.beginPath(); x.moveTo(p0, H);
      for (let px = p0; px <= p1; px += 4) { const t = (px - p0) / Math.max(1, p1 - p0); x.lineTo(px, H - H * hmax * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(px * 0.03))); }
      x.lineTo(p1, H); x.fill();
    }
  };
  hill(250, 330, 0.18); hill(10, 70, 0.14); hill(200, 245, 0.1);
  const city = (a0, a1, hmax, dens) => {
    for (const [p0, p1] of span(a0, a1)) {
      let px = p0;
      while (px < p1) {
        const w = 6 + r() * 16, t = (px - p0) / Math.max(1, p1 - p0), env = 0.35 + 0.65 * Math.sin(t * Math.PI);
        const hh = H * (0.06 + (0.12 + r() * 0.35) * env * hmax);
        x.fillStyle = 'rgb(255,0,0)'; x.fillRect(px, H - hh, w, hh);
        if (r() < 0.25 && hh > H * 0.2) { x.fillRect(px + w / 2 - 1, H - hh - 14, 2, 14); x.fillStyle = 'rgb(255,255,0)'; x.fillRect(px + w / 2 - 1, H - hh - 16, 2, 2); }
        for (let yy = H - hh + 4; yy < H - 4; yy += 4) for (let xx = px + 1; xx < px + w - 2; xx += 3) if (r() < dens) { x.fillStyle = `rgb(255,${Math.floor(40 + r() * 110)},0)`; x.fillRect(xx, yy, 1, 1); }
        px += w + (r() < 0.2 ? 2 + r() * 8 : 0);
      }
    }
  };
  city(150, 178, 1, 0.22); city(182, 214, 0.9, 0.22); city(300, 345, 0.7, 0.18); city(62, 84, 0.4, 0.2);
  // 東の海: 遠くの船
  for (let k = 0; k < 6; k++) { const px = pxOf(100 + r() * 60); x.fillStyle = 'rgb(255,0,0)'; x.fillRect(px, H - 8, 18, 4); x.fillStyle = 'rgb(255,200,0)'; x.fillRect(px + 4, H - 7, 1, 1); x.fillRect(px + 9, H - 7, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---------- 雨(すじ)・しぶき・雪/灰(粒)・霧のかたまり ----------
const RAIN_VS = `uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform vec2 uWind; attribute float aEnd; varying float vA;
void main(){
  vec3 s = position; vec3 p = s * uBox;
  float sp = 15.0 + s.x * 6.0;
  p.y = mod(p.y - uTime * sp, uBox.y);
  vec2 drift = uWind * (uBox.y - p.y) * 0.05;
  p.xz += drift;
  p.xz = mod(p.xz - uCenter.xz + uBox.xz * 0.5, uBox.xz) + uCenter.xz - uBox.xz * 0.5;
  p.y += uCenter.y - uBox.y * 0.5;
  if (aEnd > 0.5) { p.y += 0.9; p.xz -= uWind * 0.05; }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = smoothstep(0.5, 3.0, -mv.z) * (1.0 - smoothstep(30.0, 45.0, -mv.z));
}`;
const RAIN_FS = `uniform float uAmt; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, 0.32 * vA * uAmt); }`;
const SPLASH_VS = `uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vT;
float h(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float ph = uTime * (1.3 + aSeed) + aSeed * 17.0, k = floor(ph); vT = fract(ph);
  vec3 p = vec3(uCenter.x + (h(k * 3.1 + aSeed * 91.0) - 0.5) * 34.0, 0.06, uCenter.z + (h(k * 7.3 + aSeed * 13.0) - 0.5) * 34.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uScale * (0.18 + vT * 0.35) / max(1.0, -mv.z), 40.0);
}`;
const SPLASH_FS = `uniform float uAmt; varying float vT; void main(){ vec2 q = gl_PointCoord - 0.5; q.y *= 2.2; float d = length(q);
  float ring = smoothstep(0.08, 0.0, abs(d - 0.18 - vT * 0.25)); gl_FragColor = vec4(0.8, 0.85, 0.95, ring * (1.0 - vT) * 0.6 * uAmt); }`;
const FLAKE_VS = `uniform float uTime; uniform vec3 uCenter; uniform float uScale, uFall; uniform vec2 uWind; attribute float aSeed; varying float vA;
void main(){
  vec3 B = vec3(48.0, 26.0, 48.0); vec3 p = position * B;
  p.y = mod(p.y - uTime * uFall * (0.6 + aSeed * 0.8), B.y);
  p.x += sin(uTime * 0.8 + aSeed * 30.0) * 1.2 + uWind.x * (B.y - p.y) * 0.3;
  p.z += cos(uTime * 0.6 + aSeed * 20.0) * 1.2 + uWind.y * (B.y - p.y) * 0.3;
  p.xz = mod(p.xz - uCenter.xz + B.xz * 0.5, B.xz) + uCenter.xz - B.xz * 0.5;
  p.y += uCenter.y - B.y * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min((1.6 + aSeed * 1.6) * uScale / max(1.0, -mv.z), uScale * 0.12);
  vA = smoothstep(0.6, 3.0, -mv.z) * (1.0 - smoothstep(30.0, 42.0, -mv.z));
}`;
const FLAKE_FS = `uniform float uAmt; uniform vec3 uCol; varying float vA; void main(){ float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(uCol, a * vA * uAmt * 0.85); }`;
const MIST_VS = `uniform float uTime; uniform vec3 uCenter; attribute vec3 aSeed; attribute vec2 aCorner; varying vec2 vC; varying float vA;
void main(){
  vec3 B = vec3(90.0, 1.0, 90.0);
  vec3 c = vec3(aSeed.x * B.x + uTime * 1.1, 1.2 + aSeed.y * 3.5, aSeed.z * B.z + uTime * 0.4);
  c.xz = mod(c.xz - uCenter.xz + B.xz * 0.5, B.xz) + uCenter.xz - B.xz * 0.5;
  float s = 9.0 + aSeed.y * 9.0;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  mv.xy += aCorner * s;
  gl_Position = projectionMatrix * mv;
  vC = aCorner; vA = smoothstep(2.0, 12.0, -mv.z) * (1.0 - smoothstep(40.0, 50.0, length(c.xz - uCenter.xz)));
}`;
const MIST_FS = `uniform float uAmt; uniform vec3 uCol; varying vec2 vC; varying float vA; void main(){ float d = length(vC); float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(uCol, a * a * vA * uAmt * 0.22); }
`;

function pts(n, seedFn, extra) {
  const g = new THREE.BufferGeometry(), r = seeded(seedFn);
  const p = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[i * 3] = r(); p[i * 3 + 1] = r(); p[i * 3 + 2] = r(); s[i] = r(); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
  if (extra) extra(g, r);
  return g;
}
function shader(u, vs, fs, o = {}) {
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, fog: false, ...o });
}

export const Sky = {
  t: START_T, speed: 1, weather: 'clear', night: 0, wet: 0, fogMul: 1, flash: 0,
  wx: { rain: 0, storm: 0, fog: 0, snow: 0, ash: 0 },
  _wTimer: 70, _phase: '', _time: 0, _ltTimer: 5, _ltSeq: [], _view: 'top',
  M: null, W: null, cur: {},

  init(W, M) {
    this.W = W; this.M = M;
    const q = Engine.quality, sc = Engine.scene;
    // 空のドーム
    const U = this.U = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, 1).normalize() }, uMoonDir: { value: new THREE.Vector3(0.4, 0.55, 0.7).normalize() },
      uCloudCol: { value: new THREE.Color() }, uStars: { value: 0 }, uCloud: { value: 0.3 }, uTime: { value: 0 }, uFlash: { value: 0 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 },
    };
    const dome = this.dome = new THREE.Mesh(new THREE.SphereGeometry(370, 32, 16), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
    dome.renderOrder = -10; dome.frustumCulled = false; dome.matrixAutoUpdate = false;
    W.group.add(dome);
    // 遠くの景色の輪(霧の終わりの所に立てる)
    const RU = this.RU = { uMap: { value: ringTexture() }, uFog: U.uFog, uSil: { value: new THREE.Color(0x1a1820) }, uCam: { value: new THREE.Vector3() }, uNight: { value: 0 }, uTime: U.uTime, uVis: { value: 1 }, uFlash: U.uFlash };
    const ring = this.ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.24, 96, 1, true), new THREE.ShaderMaterial({ uniforms: RU, vertexShader: RING_VS, fragmentShader: RING_FS, side: THREE.BackSide, fog: false }));
    ring.geometry.translate(0, 0.12 - 0.008, 0);
    ring.renderOrder = 10; ring.frustumCulled = false; ring.matrixAutoUpdate = false;
    W.group.add(ring);
    // 雨
    const nR = q === 'high' ? 2600 : q === 'mid' ? 1500 : 700;
    const rg = new THREE.BufferGeometry(), rr = seeded(99), rp = new Float32Array(nR * 6), re = new Float32Array(nR * 2);
    for (let i = 0; i < nR; i++) { const a = rr(), b = rr(), c = rr(); rp.set([a, b, c, a, b, c], i * 6); re[i * 2 + 1] = 1; }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
    const PU = this.PU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(40, 24, 40) }, uWind: { value: new THREE.Vector2(2, 1) }, uAmt: { value: 0 }, uCol: { value: new THREE.Color(0.7, 0.75, 0.85) }, uScale: { value: 50 }, uFall: { value: 2 } };
    this.rain = new THREE.LineSegments(rg, shader(PU, RAIN_VS, RAIN_FS));
    const SU = this.SU = { uTime: PU.uTime, uCenter: { value: new THREE.Vector3() }, uScale: PU.uScale, uAmt: { value: 0 } };
    this.splash = new THREE.Points(pts(q === 'high' ? 420 : q === 'mid' ? 260 : 120, 7), shader(SU, SPLASH_VS, SPLASH_FS));
    const FU = this.FU = { uTime: PU.uTime, uCenter: PU.uCenter, uScale: PU.uScale, uFall: { value: 1.6 }, uWind: PU.uWind, uAmt: { value: 0 }, uCol: { value: new THREE.Color(1, 1, 1) } };
    this.flakes = new THREE.Points(pts(q === 'high' ? 1500 : q === 'mid' ? 900 : 450, 21), shader(FU, FLAKE_VS, FLAKE_FS));
    // 霧のかたまり(地面の近くを ただよう)
    const nM = q === 'high' ? 26 : q === 'mid' ? 16 : 9, mg = new THREE.BufferGeometry(), mr = seeded(5);
    const ms = new Float32Array(nM * 12), mc = new Float32Array(nM * 8), mi = [];
    for (let i = 0; i < nM; i++) {
      const a = mr(), b = mr(), c = mr();
      for (let k = 0; k < 4; k++) { ms.set([a, b, c], (i * 4 + k) * 3); mc.set([k === 1 || k === 2 ? 1 : -1, k >= 2 ? 1 : -1], (i * 4 + k) * 2); }
      mi.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nM * 12), 3)); mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 3)); mg.setAttribute('aCorner', new THREE.BufferAttribute(mc, 2)); mg.setIndex(mi);
    const MU = this.MU = { uTime: PU.uTime, uCenter: SU.uCenter, uAmt: { value: 0 }, uCol: { value: new THREE.Color(0.6, 0.6, 0.65) } };
    this.mist = new THREE.Mesh(mg, shader(MU, MIST_VS, MIST_FS));
    for (const o of [this.rain, this.splash, this.flakes, this.mist]) { o.frustumCulled = false; o.renderOrder = 6; o.visible = false; W.group.add(o); }
    // 稲妻(遠くに落ちる。ぎざぎざの帯)
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    const bi = []; for (let i = 0; i < 15; i++) bi.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    bg.setIndex(bi);
    const bm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 4), fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.bolt = new THREE.Mesh(bg, bm); this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = 11;
    W.group.add(this.bolt);
    // 材質のもとの値(時間と天気で変える)
    this.base = {};
    for (const k of ['office', 'apt', 'ribbon', 'shop']) if (M[k]) this.base[k] = M[k].emissiveIntensity;
    this.wetMats = ['asphalt', 'sidewalk', 'pave', 'floorC', 'ground', 'roof', 'car', 'concrete'].filter((k) => M[k]).map((k) => ({ m: M[k], r: M[k].roughness, c: M[k].color.clone(), dk: k === 'ground' ? 0.85 : k === 'car' ? 0.95 : 0.72, wr: k === 'ground' ? 0.7 : k === 'car' ? 0.2 : 0.32, me: M[k].metalness }));
    Events.on('viewChange', (e) => this.setView(e.mode));
    Events.on('start', () => { this.setTime(START_T); this.setWeather('clear', true, true); this._wTimer = 70; });
    this.setTime(START_T); this._phase = 'dusk';
    this.apply(0);
  },

  setTime(t) { this.t = ((t % 1) + 1) % 1; this._phase = this.phaseAt(this.t); },
  phaseAt(t) { let p = PHASES[PHASES.length - 1][1]; for (const [a, name] of PHASES) if (t >= a) p = name; return p; },
  setWeather(w, instant = false, silent = false) {
    if (!WEATHERS.includes(w)) return;
    const changed = w !== this.weather;
    this.weather = w;
    if (instant) for (const k in this.wx) this.wx[k] = k === w ? 1 : 0;
    if (instant) this.wet = w === 'rain' || w === 'storm' ? 1 : 0;
    if (changed && !silent) Events.emit('worldChange', { timeOfDay: this.t, weather: w, text: W_TEXT[w], phase: this._phase, kind: 'weather' });
    this._ltTimer = 2 + Math.random() * 3;
  },
  setView(mode) { this._view = mode; },

  // 次の天気を えらぶ(夜は 雷雨が多め)
  _nextWeather() {
    if (this.weather !== 'clear') return 'clear';
    const n = this.night > 0.5;
    const opts = [['rain', 0.26], ['storm', n ? 0.28 : 0.12], ['fog', 0.22], ['snow', 0.1], ['ash', 0.12]];
    let s = 0; for (const o of opts) s += o[1];
    let r = Math.random() * s;
    for (const [w, p] of opts) { if ((r -= p) <= 0) return w; }
    return 'rain';
  },

  update(dt, px, pz) {
    this._time += dt;
    const prevT = this.t;
    this.t = (this.t + dt * this.speed / CYCLE) % 1;
    // 時間の区切りを こえたら 知らせる
    for (const [a, name, text] of PHASES) {
      if ((prevT < a && this.t >= a) || (prevT > this.t && a < this.t)) {
        this._phase = name;
        Events.emit('worldChange', { timeOfDay: this.t, weather: this.weather, text, phase: name, kind: 'time' });
      }
    }
    if ((this._wTimer -= dt) <= 0) {
      const w = this._nextWeather();
      this._wTimer = w === 'clear' ? 50 + Math.random() * 50 : 55 + Math.random() * 45;
      this.setWeather(w);
    }
    // 天気の まざり具合を ゆっくり変える(8 秒くらい)
    for (const k in this.wx) { const want = k === this.weather ? 1 : 0; this.wx[k] += Math.sign(want - this.wx[k]) * Math.min(Math.abs(want - this.wx[k]), dt / 8); }
    const wx = this.wx, rainAmt = Math.max(wx.rain, wx.storm);
    this.wet += ((rainAmt > 0.3 ? 1 : 0) - this.wet) * Math.min(1, dt * (rainAmt > 0.3 ? 0.25 : 0.03));
    this._lightning(dt, px, pz);
    this.apply(dt, px, pz);
  },

  // 稲妻: 雷雨の間 ときどき。たまに すぐ近くのゾンビに落ちる
  _lightning(dt, px, pz) {
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    for (let i = this._ltSeq.length - 1; i >= 0; i--) { const s = this._ltSeq[i]; if ((s.t -= dt) <= 0) { this.flash = Math.max(this.flash, s.k); this._ltSeq.splice(i, 1); } }
    if (this.bolt.visible && (this._boltT -= dt) <= 0) this.bolt.visible = false;
    if (this.wx.storm < 0.6) return;
    if ((this._ltTimer -= dt) > 0) return;
    this._ltTimer = 3.5 + Math.random() * 7;
    this.strike(px, pz, Math.random() < 0.3);
  },
  strike(px, pz, near = false) {
    this.flash = 1; this._ltSeq.push({ t: 0.12, k: 0.6 }, { t: 0.26, k: 0.9 });
    const cam = Engine.camera.position;
    let x, z;
    if (near && this.W.lightningTarget) { const p = this.W.lightningTarget(px, pz); if (p) { x = p.x; z = p.z; } }
    if (x === undefined) { near = false; const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 90; x = cam.x + Math.cos(a) * d; z = cam.z + Math.sin(a) * d; }
    // 稲妻の形
    const P = this.bolt.geometry.attributes.position, top = near ? 70 : 120;
    let bx = x, bz = z;
    for (let i = 0; i < 16; i++) {
      const y = top * (1 - i / 15), w = (near ? 0.35 : 1.4) * (1 - i / 20);
      if (i > 0) { bx += (Math.random() - 0.5) * (near ? 3 : 9); bz += (Math.random() - 0.5) * (near ? 3 : 9); }
      if (i === 15) { bx = x; bz = z; }
      _v.set(bz - cam.z, 0, -(bx - cam.x)).normalize();
      P.setXYZ(i * 2, bx - _v.x * w, y, bz - _v.z * w); P.setXYZ(i * 2 + 1, bx + _v.x * w, y, bz + _v.z * w);
    }
    P.needsUpdate = true;
    this.bolt.visible = true; this._boltT = 0.22;
    Events.emit('lightning', { x, z, near });
    if (near && this.W.lightningHit) this.W.lightningHit(x, z);
  },

  // 今の時間・天気の色を 空・霧・光・材質に入れる
  apply(dt, px = 0, pz = 0) {
    const t = this.t;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const A = KEYS[i], B = KEYS[i + 1], f = (t - A[0]) / Math.max(1e-6, B[0] - A[0]);
    const lc = (k, out) => out.copy(A[k]).lerp(B[k], f);
    const ln = (k) => A[k] + (B[k] - A[k]) * f;
    const wx = this.wx;
    const ov = Math.min(1, wx.rain * 0.75 + wx.storm + wx.fog * 0.55 + wx.snow * 0.6 + wx.ash * 0.8);
    const U = this.U;
    lc(1, U.uTop.value); lc(2, U.uHor.value); lc(3, U.uFog.value);
    // 曇り: 色を うすく・暗く。灰: 茶色っぽく。雪・霧: 白っぽく
    grey(U.uTop.value, ov * 0.7).multiplyScalar(1 - ov * 0.35); grey(U.uHor.value, ov * 0.75).multiplyScalar(1 - ov * 0.3);
    grey(U.uFog.value, ov * 0.6);
    const day = 1 - ln(12) * 0.9;     // 星が見えるほど 夜
    if (wx.fog + wx.snow > 0) { _c.setRGB(0.55, 0.57, 0.6).multiplyScalar(0.25 + 0.75 * day); U.uFog.value.lerp(_c, (wx.fog * 0.7 + wx.snow * 0.5)); U.uHor.value.lerp(_c, (wx.fog * 0.6 + wx.snow * 0.4)); }
    if (wx.ash > 0) { _c.setRGB(0.42, 0.3, 0.22).multiplyScalar(0.35 + 0.65 * day); U.uFog.value.lerp(_c, wx.ash * 0.7); U.uHor.value.lerp(_c, wx.ash * 0.6); U.uTop.value.lerp(_c, wx.ash * 0.4); }
    lc(7, U.uSunCol.value);
    U.uCloudCol.value.copy(U.uHor.value).lerp(U.uTop.value, 0.5).multiplyScalar(0.9 + 0.2 * day);
    if (ov > 0) U.uCloudCol.value.lerp(_c2.setRGB(0.3, 0.31, 0.34).multiplyScalar(0.3 + 0.7 * day), ov * 0.6);
    U.uStars.value = ln(12) * (1 - ov);
    U.uCloud.value = 0.32 + ov * 0.68;
    U.uFlash.value = this.flash;
    U.uTime.value = this._time % 10000;
    // 太陽と月(見た目の位置。影の向きは engine が決めている)
    const sa = t * Math.PI * 2;                 // 0 = 真上, 0.25 = 西の地平線
    U.uSunDir.value.set(-Math.sin(sa) * 0.92, Math.cos(sa) * 0.9 + 0.06, 0.38).normalize();
    U.uSunVis.value = Math.max(0, Math.min(1, (Math.cos(sa) + 0.12) * 4)) * (1 - ov * 0.9);
    U.uMoonDir.value.set(Math.sin(sa) * 0.7 + 0.2, Math.max(0.25, -Math.cos(sa) * 0.75), -0.5).normalize();
    U.uMoonVis.value = Math.max(0, Math.min(1, -Math.cos(sa) * 3)) * (1 - ov * 0.85);
    // 光(数は変えない。色と強さだけ)
    const nightK = ln(12);
    this.night = nightK;
    const flash = this.flash;
    if (Engine.hemi) {
      lc(4, Engine.hemi.color); lc(5, Engine.hemi.groundColor);
      grey(Engine.hemi.color, ov * 0.5);
      Engine.hemi.intensity = ln(6) * (1 - ov * 0.18) + flash * 2.6;
      if (flash > 0) Engine.hemi.color.lerp(_c.setRGB(0.8, 0.85, 1), flash * 0.7);
    }
    if (Engine.sun) {
      lc(7, Engine.sun.color); grey(Engine.sun.color, ov * 0.6);
      Engine.sun.intensity = ln(8) * (1 - ov * 0.55) + flash * 1.5;
    }
    const sc = Engine.scene;
    if (sc.fog) sc.fog.color.copy(U.uFog.value);
    if (sc.background && sc.background.isColor) sc.background.copy(U.uFog.value);
    else sc.background = U.uFog.value.clone();
    // 町の明かり
    const M = this.M, win = ln(9), glow = ln(10), pl = ln(11);
    for (const k in this.base) M[k].emissiveIntensity = this.base[k] * win;
    if (M.glow) M.glow.color.setScalar(glow * (1 - ov * 0.15) + 0.1 * ov);
    if (M.pool) M.pool.color.setScalar(pl * (1 + ov * 0.3));
    if (M.flame) M.flame.color.setScalar(0.7 + nightK * 0.5);
    // ぬれた地面(つやが出て 少し暗い)
    const wet = this.wet;
    for (const w of this.wetMats) { w.m.roughness = w.r + (w.wr - w.r) * wet; w.m.color.copy(w.c).multiplyScalar(1 + (w.dk - 1) * wet); w.m.metalness = w.me + 0.12 * wet; }
    // 霧の距離(視点と天気で変える)
    const v = this._view, q = Engine.quality;
    const far0 = v === 'top' ? 140 : q === 'high' ? 290 : q === 'mid' ? 230 : 175;
    const near0 = v === 'top' ? 40 : 45;
    const fm = Math.max(0.28, 1 - wx.rain * 0.2 - wx.storm * 0.32 - wx.fog * 0.62 - wx.snow * 0.3 - wx.ash * 0.4) * (1 - nightK * 0.12);
    this.fogMul = fm;
    if (sc.fog) { sc.fog.near = near0 * (0.35 + 0.65 * fm); sc.fog.far = far0 * fm; this.fogFar = sc.fog.far; }
    // 遠くの景色(霧の終わりに立てる)
    const cam = Engine.camera.position;
    this.dome.matrix.makeTranslation(cam.x, 0, cam.z); this.dome.matrixWorld.copy(this.dome.matrix);
    const R = Math.min(355, (sc.fog ? sc.fog.far : 300) + 4);
    this.ring.visible = v !== 'top';
    this.ring.matrix.makeScale(R, R, R).setPosition(cam.x, -2.5, cam.z); this.ring.matrixWorld.copy(this.ring.matrix);
    this.RU.uCam.value.copy(cam);
    this.RU.uNight.value = Math.min(1, 0.25 + nightK * 0.9);
    this.RU.uVis.value = Math.max(0, 1 - wx.fog * 1.2 - wx.snow * 0.5 - wx.ash * 0.4);
    this.RU.uSil.value.copy(U.uFog.value).multiplyScalar(0.32);
    // 雨・雪・灰・霧
    const rainAmt = Math.max(wx.rain, wx.storm * 1.3);
    const PU = this.PU;
    PU.uTime.value = this._time % 1000;
    const mid = _v.set(px, 0, pz).lerp(cam, v === 'top' ? 0.5 : 0.25);
    PU.uCenter.value.copy(mid); PU.uCenter.value.y = Math.max(cam.y, 10) - 2;
    PU.uAmt.value = Math.min(1, rainAmt);
    PU.uScale.value = (Engine.renderer ? Engine.renderer.domElement.height : 400) * 0.12;
    PU.uCol.value.setRGB(0.55, 0.6, 0.7).multiplyScalar(0.6 + 0.6 * day + flash);
    PU.uWind.value.set(1.5 + wx.storm * 5, 0.8 + wx.storm * 2);
    this.rain.visible = rainAmt > 0.02;
    this.SU.uCenter.value.set(px, 0, pz); this.SU.uAmt.value = Math.min(1, rainAmt) * (0.5 + 0.5 * day);
    this.splash.visible = this.rain.visible;
    const fl = Math.max(wx.snow, wx.ash);
    this.FU.uAmt.value = fl;
    this.FU.uFall.value = wx.snow >= wx.ash ? 1.5 : 1.0;
    if (wx.snow >= wx.ash) this.FU.uCol.value.setRGB(1, 1, 1).multiplyScalar(0.55 + 0.45 * day); else this.FU.uCol.value.setRGB(0.5, 0.47, 0.44).multiplyScalar(0.6 + 0.4 * day);
    this.flakes.visible = fl > 0.02;
    const mist = Math.min(1, wx.fog + wx.snow * 0.3 + (this.W.localMist ? this.W.localMist(px, pz) : 0));
    this.MU.uAmt.value = mist;
    this.MU.uCol.value.copy(U.uFog.value).lerp(_c.setRGB(0.75, 0.77, 0.8), 0.25 * day);
    this.mist.visible = mist > 0.02;
    this.cur.overcast = ov; this.cur.day = day;
    void dt;
  },
};
