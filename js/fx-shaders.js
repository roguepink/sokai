// 演出係: 光の粒・光の線・地面の輪や跡・剣の光の弧 のシェーダー(GPU で絵を作る小さなプログラム)。
// どれも「四角い板を 1 つ」用意して、それを何千個もまとめて描く(InstancedBufferGeometry)。
// 色は 1 より大きくしてよい(画面効果の「光のにじみ」で輝く)。

const OUT = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

// ---------- 粒(火花・炎・煙・血) ----------
// iPos: 位置 + 大きさ / iVel: 速さ + 伸ばす量(火花は速さの向きに伸びる) / iCol: 色 + 濃さ / iMisc: 回転, 形
export const PARTICLE_VS = /* glsl */`
  attribute vec4 iPos;
  attribute vec4 iVel;
  attribute vec4 iCol;
  attribute vec2 iMisc;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShape;
  void main() {
    vUv = position.xy; vCol = iCol; vShape = iMisc.y;
    vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
    float s = iPos.w;
    vec2 c = position.xy;
    vec2 off = c * s;
    if (iVel.w > 0.0) {
      vec2 v2 = (viewMatrix * vec4(iVel.xyz, 0.0)).xy;
      float vl = length(v2);
      if (vl > 1e-3) {
        vec2 d = v2 / vl, n = vec2(-d.y, d.x);
        float L = vl * iVel.w;
        off = n * c.x * s + d * (c.y * (s + L * 0.5) - L * 0.5);
      }
    } else if (iMisc.x != 0.0) {
      float cs = cos(iMisc.x), sn = sin(iMisc.x);
      off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * s;
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
  }
`;

// 光る粒(足し算で明るくなる)。形 0 = ふんわり, 1 = くっきり, 2 = 星形のきらめき
export const GLOW_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShape;
  void main() {
    float r2 = dot(vUv, vUv);
    if (r2 > 1.0) discard;
    float a;
    if (vShape < 0.5) { a = 1.0 - r2; a *= a; a += 0.6 * max(0.0, 1.0 - r2 * 6.0); }
    else if (vShape < 1.5) { a = smoothstep(1.0, 0.5, r2); }
    else {
      float x = abs(vUv.x), y = abs(vUv.y);
      a = max(0.0, 1.0 - x * 9.0 - y * 0.9) + max(0.0, 1.0 - y * 9.0 - x * 0.9);
      a += (1.0 - r2) * (1.0 - r2) * 0.8;
    }
    gl_FragColor = vec4(vCol.rgb, a * vCol.a);
    ${OUT}
  }
`;

// ふつうの粒(煙・ほこり・血)。形 0 = 煙(ふちが ゆらぐ), 1 = 血・かけら(くっきり)
export const SOLID_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vShape;
  void main() {
    float r2 = dot(vUv, vUv);
    if (r2 > 1.0) discard;
    float a;
    if (vShape < 0.5) {
      float ang = atan(vUv.y, vUv.x);
      float w = 1.0 + 0.12 * sin(ang * 5.0) + 0.08 * sin(ang * 9.0 + 1.3);
      float r = sqrt(r2) * w;
      a = smoothstep(1.0, 0.15, r) * 0.85;
    } else a = smoothstep(1.0, 0.55, r2);
    float shade = 0.78 + 0.3 * vUv.y;
    gl_FragColor = vec4(vCol.rgb * shade, a * min(1.0, vCol.a));
    ${OUT}
  }
`;

// ---------- 光の線(曳光弾・レーザー・稲妻・レールガン) ----------
// iA: 始点 + 太さ / iB: 終点 / iCol: 色 + 濃さ。端は丸い。まん中が白く輝く
export const BEAM_VS = /* glsl */`
  attribute vec4 iA;
  attribute vec4 iB;
  attribute vec4 iCol;
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vLen;
  void main() {
    vec4 a = viewMatrix * vec4(iA.xyz, 1.0);
    vec4 b = viewMatrix * vec4(iB.xyz, 1.0);
    vec2 d = b.xy - a.xy;
    float l = length(d);
    d = l > 1e-5 ? d / l : vec2(1.0, 0.0);
    vec2 n = vec2(d.y, -d.x);
    float w = iA.w;
    float t = position.y * 0.5 + 0.5;
    vec4 p = mix(a, b, t);
    p.xy += n * position.x * w + d * position.y * w;
    vUv = vec2(position.x, t * l + position.y * w);
    vLen = l / max(w, 1e-4);
    vUv.y /= max(w, 1e-4);
    vCol = iCol;
    gl_Position = projectionMatrix * p;
  }
`;
export const BEAM_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  varying float vLen;
  void main() {
    float y = vUv.y;
    float e = y < 0.0 ? -y : (y > vLen ? y - vLen : 0.0);
    float r = length(vec2(vUv.x, e));
    if (r > 1.0) discard;
    float glow = (1.0 - r) * (1.0 - r);
    float core = smoothstep(0.38, 0.0, r);
    vec3 c = vCol.rgb * glow + vec3(1.0, 0.97, 0.9) * core * (0.6 + 0.25 * max(vCol.r, max(vCol.g, vCol.b)));
    gl_FragColor = vec4(c, vCol.a);
    ${OUT}
  }
`;

// ---------- 地面の板(衝撃波の輪・焦げ跡・血だまり) ----------
// iP: 中心 xyz + 半径 / iCol: 色 + 濃さ / iMisc: 輪の太さ, 種類, 乱数, 回転
export const GROUND_VS = /* glsl */`
  attribute vec4 iP;
  attribute vec4 iCol;
  attribute vec4 iMisc;
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vMisc;
  varying float vR;
  void main() {
    float th = iMisc.x;
    float outer = iP.w + th * 2.5;
    float cs = cos(iMisc.w), sn = sin(iMisc.w);
    vec2 c = position.xy;
    vec2 rc = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
    vec3 wp = vec3(iP.x + rc.x * outer, iP.y, iP.z + rc.y * outer);
    vUv = c * outer; vR = iP.w; vCol = iCol; vMisc = iMisc;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
// 光る輪(足し算)
export const RING_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vMisc;
  varying float vR;
  void main() {
    float d = length(vUv);
    float th = max(vMisc.x, 1e-3);
    float k = (d - vR) / th;
    float a = exp(-k * k * 2.0);
    if (vMisc.y > 0.5) a += smoothstep(vR, 0.0, d) * 0.25;      // 中も うっすら光る
    if (a < 0.01) discard;
    gl_FragColor = vec4(vCol.rgb, a * vCol.a);
    ${OUT}
  }
`;
// 地面の跡(ふつうの重ね方)。種類 0 = 焦げ, 1 = 血, 2 = 氷
export const DECAL_FS = /* glsl */`
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vMisc;
  varying float vR;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 uv = vUv / vR;
    float s = vMisc.z * 37.0;
    float ang = atan(uv.y, uv.x);
    float n = 0.16 * sin(ang * 3.0 + s) + 0.1 * sin(ang * 7.0 + s * 1.7) + 0.06 * sin(ang * 15.0 + s * 2.3);
    float r = length(uv);
    float rr = r * (1.0 - n);
    float a = smoothstep(1.0, 0.72, rr);
    // まわりの しぶき(小さな点)
    vec2 g = floor(uv * 5.0 + s);
    vec2 f = fract(uv * 5.0 + s) - 0.5;
    float dots = step(0.82, h(g)) * smoothstep(0.32, 0.18, length(f)) * step(r, 1.45) * step(0.75, r);
    a = max(a, dots);
    if (a < 0.01) discard;
    vec3 c = vCol.rgb;
    if (vMisc.y < 0.5) c *= 0.55 + 0.7 * smoothstep(0.0, 1.0, rr);        // 焦げ: まん中ほど黒い
    else if (vMisc.y < 1.5) c *= 0.75 + 0.5 * h(floor(uv * 9.0));        // 血: まだら
    else c += vec3(0.25) * smoothstep(0.5, 1.0, rr);                     // 氷: ふちが白い
    gl_FragColor = vec4(c, a * vCol.a);
    ${OUT}
  }
`;

// ---------- 剣の光の弧(三日月) ----------
// position.x = 弧にそった位置 u(0..1), position.y = 外→内 v(0..1)
// iC: 中心 xyz + 向き / iS: 弧の角度, 内の半径, 外の半径, 先頭の進み具合 / iCol: 色 + 濃さ / iT: 傾き, ふる向き, 尾の長さ, 高さの幅
export const SLASH_VS = /* glsl */`
  attribute vec4 iC;
  attribute vec4 iS;
  attribute vec4 iCol;
  attribute vec4 iT;
  varying float vU;
  varying float vV;
  varying vec4 vCol;
  varying vec2 vHT;
  void main() {
    float u = position.x, v = position.y;
    float ang = iC.w + (u - 0.5) * iS.x;
    float prof = sin(u * 3.14159265);
    float r = iS.z - (iS.z - iS.y) * v * (0.25 + 0.75 * prof);
    vec3 wp = vec3(iC.x + sin(ang) * r, iC.y + iT.x * sin(ang - iC.w) * r + iT.w * (v - 0.5) * prof, iC.z - cos(ang) * r);
    vU = iT.y > 0.0 ? u : 1.0 - u;
    vV = v;
    vCol = iCol;
    vHT = vec2(iS.w, iT.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
export const SLASH_FS = /* glsl */`
  varying float vU;
  varying float vV;
  varying vec4 vCol;
  varying vec2 vHT;
  void main() {
    float head = vHT.x, trail = vHT.y;
    if (vU > head) discard;
    float a = smoothstep(head - trail, head, vU);
    float edge = pow(1.0 - vV, 3.0);
    float inner = smoothstep(1.0, 0.6, vV);
    float k = a * inner * (0.35 + 2.2 * edge);
    if (k < 0.01) discard;
    vec3 c = vCol.rgb * k + vec3(1.0) * edge * a * 0.9;
    gl_FragColor = vec4(c, vCol.a);
    ${OUT}
  }
`;
