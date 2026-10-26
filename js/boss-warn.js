// キャラ係: ボスの攻撃の「予告」(地面の赤い印)。円・帯(まっすぐ)・扇。
// 1 ステップごとに出しなおす(出し続けている間だけ見える)。p = 0..1 の ため具合(中が満ちていき、1 で攻撃が来る)。
// 1 つの InstancedMesh で全部を描く(描く回数 1)。
import * as THREE from '../vendor/three/build/three.module.min.js';

const MAX = 64;
const VS = /* glsl */`
  attribute vec4 iA;   // 中心x, 中心z, 前x, 前z
  attribute vec4 iB;   // 半幅(横), 半幅(前), p, 種類(0 円 / 1 帯 / 2 扇)
  attribute vec4 iC;   // 色 rgb, 扇の半角
  varying vec2 vL; varying vec4 vB; varying vec4 vC;
  void main() {
    vec2 l = position.xy * iB.xy;
    vec2 f = iA.zw, r = vec2(-f.y, f.x);
    vec3 wp = vec3(iA.x + r.x * l.x + f.x * l.y, 0.09, iA.y + r.y * l.x + f.y * l.y);
    vL = l; vB = iB; vC = iC;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const FS = /* glsl */`
  uniform float uTime;
  varying vec2 vL; varying vec4 vB; varying vec4 vC;
  void main() {
    float p = vB.z, k = vB.w, a = 0.0;
    float blink = 0.6 + 0.4 * sin(uTime * (9.0 + 26.0 * p * p));
    if (k < 0.5) {
      float d = length(vL) / vB.x;
      if (d > 1.0) discard;
      float edge = smoothstep(0.88, 0.97, d);
      float fill = (d < p ? 0.42 : 0.1) + 0.25 * smoothstep(p - 0.06, p, d) * step(d, p);
      float rings = 0.08 * step(0.5, fract(d * 4.0 - uTime * 1.5));
      a = edge * 1.25 + fill + rings;
    } else if (k < 1.5) {
      float u = vL.y / vB.y * 0.5 + 0.5, v = abs(vL.x) / vB.x;
      float edge = smoothstep(0.82, 0.95, v) + smoothstep(0.985, 1.0, u) * 0.6;
      float fill = (u < p ? 0.42 : 0.1);
      float chev = 0.12 * step(0.55, fract((vL.y - abs(vL.x) * 0.8) * 0.18 - uTime * 2.2));
      a = edge * 1.2 + fill + chev;
    } else {
      float len = vB.x, d = length(vL) / len;
      if (d > 1.0 || vL.y < -0.5) discard;
      float ang = abs(atan(vL.x, vL.y)), h = vC.w;
      if (ang > h) discard;
      float edge = max(smoothstep(h * 0.9, h, ang), smoothstep(0.93, 1.0, d));
      float fill = (d < p ? 0.42 : 0.1);
      a = edge * 1.2 + fill;
    }
    a *= blink;
    gl_FragColor = vec4(vC.rgb * a, 1.0);
  }
`;

export const Warn = {
  mesh: null, n: 0, _a: null, _b: null, _c: null, _u: null,

  init(scene) {
    const base = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position);
    this._a = new Float32Array(MAX * 4); this._b = new Float32Array(MAX * 4); this._c = new Float32Array(MAX * 4);
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(this._a, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(this._b, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iC', new THREE.InstancedBufferAttribute(this._c, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this._u = { uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this._u, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  },

  clear() { this.n = 0; },

  _put(cx, cz, fx, fz, hx, hz, p, kind, col, extra) {
    if (this.n >= MAX) return;
    const i = this.n++ * 4, A = this._a, B = this._b, C = this._c;
    A[i] = cx; A[i + 1] = cz; A[i + 2] = fx; A[i + 3] = fz;
    B[i] = hx; B[i + 1] = hz; B[i + 2] = Math.max(0, Math.min(1, p)); B[i + 3] = kind;
    C[i] = ((col >> 16) & 255) / 255 * 1.4; C[i + 1] = ((col >> 8) & 255) / 255 * 1.4; C[i + 2] = (col & 255) / 255 * 1.4; C[i + 3] = extra;
  },
  // 円
  circle(x, z, r, p, col = 0xff2a10) { this._put(x, z, 0, -1, r, r, p, 0, col, 0); },
  // 帯: (x,z) から 向き (dx,dz) へ len、はば w
  rect(x, z, dx, dz, len, w, p, col = 0xff2a10) {
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    this._put(x + dx * len / 2, z + dz * len / 2, dx, dz, w / 2, len / 2, p, 1, col, 0);
  },
  // 扇: (x,z) から 向き (dx,dz)、長さ len、半分の角度 half
  cone(x, z, dx, dz, len, half, p, col = 0xff2a10) {
    const l = Math.hypot(dx, dz) || 1;
    this._put(x, z, dx / l, dz / l, len, len, p, 2, col, half);
  },

  upload(time) {
    const g = this.mesh.geometry;
    g.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this._u.uTime.value = time;
    if (!this.n) return;
    for (const k of ['iA', 'iB', 'iC']) { const a = g.attributes[k]; a.needsUpdate = true; a.addUpdateRange ? (a.clearUpdateRanges(), a.addUpdateRange(0, this.n * 4)) : 0; }
  },
};
