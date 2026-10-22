// マップ係(第4弾・街並み): ダウンタウンを「地区」に分ける。地区ごとに 建物・色・地面・看板・小物・夜の明かり・空気 が ちがう。
//  - 町(±192m)を 道路の中心線で 5×5 のマスに分け、マスごとに地区を決める(GRID)
//  - World.districtAt(x,z) → 地区の id(町の外は null)。World.zoneName は 地区の名前を返す
//  - 地区に入ると イベント districtEnter {id, name, theme}(1 回の出入りに 1 回)
//  - 空気: 寺町 = 桜の花びら / 崩壊地区 = 火の粉と灰が多い・赤茶けた霧 / 繁華街 = 看板のちらつき・紫の霧(夜) など
//    霧と空の光の色を 地区ごとに少し変える(Sky.dTint)。本物の光は ふやさない
import * as THREE from 'three';
import { seeded } from './util.js';
import { Events } from './events.js';
import { Engine } from './engine.js';
import { SIGN_U } from './world-dtex.js';

// マスの境目(道路の中心線)。i = 西→東、j = 北→南
export const EDGES = [-192, -112, -40, 40, 112, 192];
export const GRID = [
  ['temple', 'temple', 'temple', 'office', 'office'],
  ['temple', 'shita', 'office', 'office', 'office'],
  ['shita', 'shita', 'plaza', 'neon', 'neon'],
  ['china', 'china', 'china', 'neon', 'neon'],
  ['china', 'china', 'ruins', 'ruins', 'ruins'],
];
export const DNAME = { plaza: '中央広場', neon: 'ネオン繁華街', china: '中華街', shita: '下町商店街', temple: '寺町', office: 'オフィス街', ruins: '崩壊地区' };
// 地区の色: map = ミニマップの地面 / bmap = ミニマップの建物 / road = 道の材質と色 / pad = 歩道の材質と色
export const DSTYLE = {
  plaza: { map: '#6e6a62', bmap: '#2a2a2e', road: ['asphalt', [1, 1, 1]], pad: ['sidewalk', null], lines: true },
  neon: { map: '#5a2e66', bmap: '#2a1030', road: ['asphalt', [0.5, 0.46, 0.6]], pad: ['sidewalk', [0.58, 0.52, 0.64]], lines: true },
  china: { map: '#8a3428', bmap: '#4a1410', road: ['pave', [0.86, 0.55, 0.47]], pad: ['sidewalk', [0.95, 0.62, 0.5]], lines: false },
  shita: { map: '#8a6a3c', bmap: '#4a3420', road: ['asphalt', [0.92, 0.85, 0.74]], pad: ['sidewalk', [1.0, 0.84, 0.66]], lines: true },
  temple: { map: '#4f6a46', bmap: '#2a3428', road: ['pave', [0.86, 0.84, 0.78]], pad: ['pave', [0.95, 0.92, 0.84]], lines: false },
  office: { map: '#355a80', bmap: '#152a40', road: ['asphalt', [0.7, 0.74, 0.82]], pad: ['pave', [1.08, 1.1, 1.14]], lines: true },
  ruins: { map: '#5a3a28', bmap: '#2a1810', road: ['asphalt', [0.7, 0.52, 0.4]], pad: ['sidewalk', [0.66, 0.52, 0.42]], lines: true },
};
// 空気の色(霧と空の光に かける数)と、火の粉の量・花びらの量
const AIR = {
  plaza: { fog: [1, 1, 1], light: [1, 1, 1], ember: 1, petal: 0 },
  neon: { fog: [1.12, 0.86, 1.32], light: [1.12, 0.9, 1.25], ember: 0.6, petal: 0 },
  china: { fog: [1.2, 0.95, 0.82], light: [1.15, 0.98, 0.85], ember: 0.7, petal: 0 },
  shita: { fog: [1.1, 1.0, 0.86], light: [1.08, 1.0, 0.9], ember: 0.7, petal: 0 },
  temple: { fog: [1.08, 0.98, 1.06], light: [1.05, 1.0, 1.03], ember: 0, petal: 1 },
  office: { fog: [0.86, 0.98, 1.16], light: [0.94, 1.0, 1.1], ember: 0.3, petal: 0 },
  ruins: { fog: [1.32, 0.92, 0.66], light: [1.2, 0.92, 0.75], ember: 2.2, petal: 0 },
};

const LO = EDGES[0], HI = EDGES[EDGES.length - 1];
export function cellOf(v) { if (v < LO || v > HI) return -1; let i = 0; while (i < 4 && v >= EDGES[i + 1]) i++; return i; }
export function districtAt(x, z) {
  const i = cellOf(x), j = cellOf(z);
  if (i < 0 || j < 0) return null;
  return GRID[j][i];
}
export function districtOfCell(i, j) { return i < 0 || j < 0 || i > 4 || j > 4 ? null : GRID[j][i]; }

// ---------- 地区ごとの空気(花びら・霧の色・看板のちらつき)と、入ったときのイベント ----------
const _c = new THREE.Color();
export const District = {
  W: null, cur: null, _want: null, _wantT: 0, _emitted: null, _t: 0,
  k: { ember: 1, petal: 0 }, fog: new THREE.Color(1, 1, 1), light: new THREE.Color(1, 1, 1),

  init(W) {
    this.W = W;
    if (W.M && Engine.quality !== 'low') this._petals(W, Engine.quality === 'high' ? 420 : 260);
    if (W._sky) W._sky.dTint = { fog: this.fog, light: this.light };
    Events.on('start', () => { this._emitted = null; });
  },

  // 桜の花びら(動きはシェーダーの中だけ。毎フレームの計算なし)
  _petals(W, n) {
    const g = new THREE.BufferGeometry(), r = seeded(8080);
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); seed[i] = r(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const u = this._pu = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: 50 }, uAmt: { value: 0 }, uDay: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vA; varying float vS;
        void main() {
          vec3 B = vec3(56.0, 16.0, 56.0);
          vec3 p = position * B;
          float sp = 0.7 + aSeed * 0.8;
          p.y = B.y - mod(B.y - p.y + uTime * sp, B.y);
          float w = uTime * (0.9 + aSeed * 0.8) + aSeed * 60.0;
          p.x += uTime * 1.3 + sin(w) * 1.6;
          p.z += cos(w * 0.8) * 1.2 + uTime * 0.4;
          p.xz = mod(p.xz - uCenter.xz + B.xz * 0.5, B.xz) + uCenter.xz - B.xz * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vS = sin(w * 2.0) * 0.5 + 0.5;
          gl_PointSize = min((2.2 + aSeed * 1.6) * uScale / max(1.0, -mv.z), uScale * 0.09);
          vA = smoothstep(0.0, 1.5, p.y) * (1.0 - smoothstep(12.0, 16.0, p.y)) * smoothstep(3.0, 7.0, -mv.z);
        }`,
      fragmentShader: `uniform float uAmt; uniform float uDay; varying float vA; varying float vS;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          q.x *= 0.55 + vS * 0.9;
          float a = smoothstep(0.5, 0.25, length(q));
          vec3 c = mix(vec3(1.0, 0.72, 0.84), vec3(1.0, 0.9, 0.95), vS) * mix(0.55, 1.0, uDay);
          gl_FragColor = vec4(c, a * vA * uAmt * 0.95);
        }`,
    });
    const pts = this._pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 5; pts.visible = false;
    W.group.add(pts);
  },

  // その場所の「空気」(町の外は 広場と同じ)。境目では まざる
  _airAt(x, z) { const d = districtAt(x, z); return AIR[d || 'plaza']; },

  update(dt, px, pz) {
    this._t += dt;
    SIGN_U.uTime.value = this._t % 1000;
    // 地区に入った(0.4 秒 同じ地区にいたら 1 回だけ)
    const d = districtAt(px, pz);
    if (d !== this._want) { this._want = d; this._wantT = 0; }
    else if ((this._wantT += dt) > 0.4 && d !== this.cur) {
      this.cur = d;
      if (d && d !== this._emitted) { this._emitted = d; Events.emit('districtEnter', { id: d, name: DNAME[d], theme: d }); }
    }
    // 空気(ゆっくり移る)
    const a = this._airAt(px, pz), f = Math.min(1, dt * 1.2);
    this.k.ember += (a.ember - this.k.ember) * f;
    this.k.petal += (a.petal - this.k.petal) * f;
    this.fog.lerp(_c.setRGB(a.fog[0], a.fog[1], a.fog[2]), f);
    this.light.lerp(_c.setRGB(a.light[0], a.light[1], a.light[2]), f);
    const W = this.W;
    if (W._emberU && W._emberU.uAmt) W._emberU.uAmt.value = this.k.ember;
    if (this._pts) {
      const on = this.k.petal > 0.02;
      this._pts.visible = on;
      if (on) {
        const u = this._pu;
        u.uTime.value = this._t % 1000; u.uCenter.value.set(px, 0, pz); u.uAmt.value = this.k.petal;
        u.uDay.value = 1 - (W.night || 0) * 0.6;
        u.uScale.value = (Engine.renderer ? Engine.renderer.domElement.height : 400) * 0.12;
      }
    }
    // 看板のちらつきは 夜ほど目立つ
    SIGN_U.uFlick.value = 0.3 + 0.7 * (W.night || 0);
  },
};
