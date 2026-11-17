// 立体感の係: 接地の影(足もとの やわらかい丸い影)。
// ゾンビ・主人公・ボスの足もとと、車の下に、うすい影の板を置く。物が 地面に「乗っている」ように見える
// (太陽の影は 向きと長さ、この影は「ここに立っている」を伝える。画質 'low' は 太陽の影が ないので、これが ただ 1 つの影)。
//  - 板は ぜんぶ まとめて 1 回で描く(InstancedBufferGeometry)。前半 = 車(動かない。起動のとき 1 回だけ書く)、後半 = キャラ(毎回 書く)
//  - 跳ぶと 影は 小さく・うすくなる(高さが分かる)。遠くは うすくして消す
// 使い方: Ground.init(scene, quality) → 毎フレーム Ground.begin() / Ground.add(...) / Ground.flush(ctx)(zombie-render.js が呼ぶ)
import * as THREE from '../vendor/three/build/three.module.min.js';

const MAX_DYN = 380;          // ゾンビ 320 + 主人公 + ボス
const MAX_STATIC = 1400;      // 車など
const Y = 0.1;                // 板を置く高さ(地面は 場所で 0〜0.2m。広場・歩道・建物の床は 少し高い)

const VS = `
attribute vec4 iA;            // x, y, z, 向き
attribute vec4 iB;            // 半分の幅, 半分の長さ, こさ, 形(0 = 丸, 1 = 角の丸い四角)
uniform float uFar;
varying vec2 vUv; varying float vA; varying float vShape;
void main() {
  float cs = cos(iA.w), sn = sin(iA.w);
  vec2 l = position.xy * iB.xy;
  vec3 wp = vec3(iA.x + l.x * cs + l.y * sn, iA.y, iA.z - l.x * sn + l.y * cs);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vUv = position.xy; vShape = iB.w;
  vA = iB.z * (1.0 - smoothstep(uFar * 0.55, uFar, -mv.z));
  gl_Position = projectionMatrix * mv;
  // 奥行きだけ 0.34m 上の点のものを使う: 少し高い床(歩道・広場・建物の中)でも かくれない。画面の位置は そのまま
  vec4 hi = projectionMatrix * viewMatrix * vec4(wp.x, wp.y + 0.34, wp.z, 1.0);
  gl_Position.z = hi.z / hi.w * gl_Position.w;
}`;
const FS = `
uniform vec3 uCol;
varying vec2 vUv; varying float vA; varying float vShape;
void main() {
  float a;
  if (vShape < 0.5) { float r = length(vUv); a = 1.0 - smoothstep(0.15, 1.0, r); }
  else { vec2 q = max(abs(vUv) - 0.5, 0.0) * 2.0; a = 1.0 - smoothstep(0.0, 1.0, length(q)); }
  a *= vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uCol, a);
}`;

export const Ground = {
  mesh: null, n: 0, nStatic: 0, strength: 1, _A: null, _B: null, _staticDone: false,

  init(scene, quality) {
    if (this.mesh) return;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const cap = MAX_STATIC + MAX_DYN;
    this._A = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this._B = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this._A.setUsage(THREE.DynamicDrawUsage); this._B.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iA', this._A); g.setAttribute('iB', this._B);
    g.instanceCount = 0;
    this.U = { uCol: { value: new THREE.Color(0.012, 0.014, 0.024) }, uFar: { value: 70 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const mesh = this.mesh = new THREE.Mesh(g, m);
    mesh.name = 'depth-contact';
    mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    // 太陽の影が ない画質(low)は 少し こく
    this.strength = quality === 'low' ? 1.25 : 1;
    scene.add(mesh);
  },

  // 車など 動かない物の影を 1 回だけ書く(World.props から。こわれても 残骸が残る物だけ)
  buildStatic(props) {
    if (this._staticDone || !this.mesh || !props) return;
    this._staticDone = true;
    const A = this._A.array, B = this._B.array;
    let n = 0;
    for (let i = 0; i < props.length && n < MAX_STATIC; i++) {
      const r = props[i];
      if (!r || !r.def || r.def.end !== 'burn' || !(r.ex > 0.4) || !(r.ez > 0.4) || r.y > 0.5) continue;
      // 向きを もどして 車の 幅・長さ(半分)を出す。ななめで 出せないときは 丸い影
      const c = Math.abs(Math.cos(r.rot || 0)), s = Math.abs(Math.sin(r.rot || 0));
      let hw = r.ex, hd = r.ez, rot = 0, shape = 1;
      if (s > 0.02 && c > 0.02) {
        const k = s > 0.2 && c > 0.2 ? 1 / 0.88 : 1, ex = r.ex * k, ez = r.ez * k, den = c * c - s * s;
        if (Math.abs(den) > 0.3) { hw = (c * ex - s * ez) / den; hd = (c * ez - s * ex) / den; rot = r.rot; }
        else shape = 0;
        if (!(hw > 0.3) || !(hd > 0.3)) { hw = r.ex; hd = r.ez; rot = 0; shape = 0; }
      } else if (s > c) { rot = r.rot; hw = r.ez; hd = r.ex; }
      const o = n * 4, big = r.def.big ? 0.8 : 1;
      A[o] = r.x; A[o + 1] = (r.y || 0) + Y; A[o + 2] = r.z; A[o + 3] = rot;
      B[o] = hw * 1.22 + 0.25; B[o + 1] = hd * 1.22 + 0.25; B[o + 2] = 0.55 * big * this.strength; B[o + 3] = shape;
      n++;
    }
    // (この回に もう足してあった ゾンビの分は 上書きされる。起動の 1 コマだけなので そのまま)
    this.nStatic = n;
    this.n = n;
    this._full = true;
    this.mesh.geometry.instanceCount = n;
  },

  begin() { this.n = this.nStatic; },
  // 丸い影を 1 つ足す。y = 足の高さ(跳んでいる高さ)。r = 半径(m)
  add(x, z, r, alpha, lift) {
    if (this.n >= MAX_STATIC + MAX_DYN || !this._A) return;
    const k = lift > 0 ? 1 / (1 + lift * 0.45) : 1;
    const o = this.n * 4, A = this._A.array, B = this._B.array;
    A[o] = x; A[o + 1] = Y; A[o + 2] = z; A[o + 3] = 0;
    const rr = r * (lift > 0 ? 0.75 + 0.25 * k : 1);
    B[o] = rr; B[o + 1] = rr; B[o + 2] = alpha * k * this.strength; B[o + 3] = 0;
    this.n++;
  },
  // 主人公・ボスを足して、GPU へ送る。ctx = Engine.ctx / far = 影を消す距離(m)
  flush(ctx, far, hideHero) {
    if (!this.mesh) return;
    if (ctx) {
      if (!this._staticDone && ctx.World && ctx.World.props && ctx.World.props.length) this.buildStatic(ctx.World.props);
      const P = ctx.Player;
      if (P && P.pos && !hideHero) this.add(P.pos.x, P.pos.z, 0.85, 0.5, P.pos.y);
      const L = ctx.Zombies && ctx.Zombies.list;
      if (L) for (let i = 0; i < L.length; i++) {
        const e = L[i];
        if (!e.boss || !e.alive) continue;
        const r = Math.max(1.2, (e.r || 1) * 1.7);
        this.add(e.x, e.z, r, r > 6 ? 0.36 : 0.46, e.y || 0);
      }
    }
    if (far) this.U.uFar.value = far;
    const nd = this.n - this.nStatic;
    this.mesh.geometry.instanceCount = this.n;
    if (this._full) {            // 車の影を書いた直後は ぜんぶ送る
      this._full = false;
      for (const at of [this._A, this._B]) { at.clearUpdateRanges(); at.needsUpdate = true; }
    } else if (nd > 0) {
      for (const at of [this._A, this._B]) { at.clearUpdateRanges(); at.addUpdateRange(this.nStatic * 4, nd * 4); at.needsUpdate = true; }
    }
  },
};
