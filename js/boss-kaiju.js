// キャラ係(第5弾): 最強の 1 体「終末竜 ムクロドン」— 恐竜の形の 超巨大怪獣(高さ 90m・鼻先から しっぽの先まで 約 150m)。
// このゲームだけの 形: くさりかけた 灰緑の肉 / むき出しの ずがい骨の頭 と 横へ はり出す 2 本の角 / 胸の あばらの中で 脈打つ 緑の心臓 /
//   背中から 外へ開いた あばら骨の列 / 体じゅうに 取りこまれた ゾンビ / 先が 二またに分かれた 骨の刃の尾 / 長い前足(かぎ爪 3 本)。
// しくみ:
//   - 設計の大きさ 1 = 10m(S = 10)。骨つきの 1 つの体(材質 5 つ = 描く回数 5 + 影 1 + 地面の影 1 + 足あと 1)
//   - 足は 地面に 置いたまま 体だけ進み、はなれすぎたら 1 歩ふみ出す(足が すべらない)。ふみ出す先に 赤い丸の予告 → ドスン(ゆれ・足あと・つぶす)
//   - しっぽは 引きずる くさりの動き(根元は 空中、先の 50m ほどが 地面)
//   - 当たり判定: 体の下の丸(e)+ 足 2 つ + しっぽの低い所 6 つ(Zombies.addPart。どの武器でも当たる)。足と しっぽは 主人公を 押し出す
//   - 見下ろしでは 画面の上(北)に立つ・カメラを 大きく引く(zoomFor)/ 霧は 弱く かかる(遠くても 影が 空に うかぶ)
//   - 技: ふみつけ / しっぽの なぎはらい / 腐れ火の息(熱線ではなく 緑の炎と 骨の つぶての 濁流)/ かみつき / 前足の たたきつけ / ほえ声の衝撃波 / ゾンビの雨
//     怒り(体力 60% / 30%): 連続ふみつけ・首をふる 腐れ火 / 全身からの 膿の爆発
// イベント: kaijuStep {x,z,d,e,heavy}(足音)/ bossAct {type:'kaiju', act}(roar・howl・breath・tail・stomp・bite・claw・rain・nova・death)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { Gore } from './zombie-gore.js';
import { Warn } from './boss-warn.js';
import { Air } from './depth-air.js';
import { KaijuCam } from './kaiju-cam.js';
import { R, sin, cos, max, min, abs, PI, TAU, clamp, lathe, skinTex, bodiesTex, canvasTex, mat, limb, limbZ, spike, horn, blob, box, sph, torus, ribs, Rig, ease, seg } from './boss-kit.js';
import { act, slam, hitHero, heroIn, heroDist, quake, pick, begin, done, lead, ringWave } from './boss-attacks.js';

const S = 10;                                   // 設計 1 = 10m
const HIP_Y = 4.6, HIP_X = 1.3, HIP_DY = -0.25, HIP_DZ = 0.1;
const L1 = 2.0, L2 = 1.9, ANK_Y = 0.95, ANK_Z = 0.5, META = Math.hypot(ANK_Y, ANK_Z), META_TILT = Math.atan2(ANK_Z, ANK_Y);
const STANCE = HIP_X * S, STEP_AT = 12, LIFT = 9;
const FOOT_R = 6.5;
const AL1 = 1.2, AL2 = 1.1;                      // 前足(上・下)の長さ
const TN = 7, TL = 1.0;                         // しっぽの節(太い所)
const TR = (i) => 1.15 - 0.65 * i / TN;         // 節 i の 太さ(設計)
const TH0 = [42, 33, 25, 17.5, 12, 8.5, 6.5, 5.2];   // 節の高さ(m。つけ根が 42m のとき)。なぎはらいの間
const TH1 = [42, 37, 31.5, 26, 20, 14.5, 10, 7];      // ふだん: 高く 持ち上げる(遠くから 長い しっぽの形が 見える)
const FK = 3, FL = 0.8;                         // 二またの先(節の数・長さ)
const GREEN = 0x9aff2a, HOT = 0xe8ff80, COOL = 0x2c8a14, BONE2 = 0xcfc4a4;

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _bk = new THREE.Vector3(0, 0, 1), _m4 = new THREE.Matrix4(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _col = new THREE.Color();
const _near = [];
const _yAxis = new THREE.Vector3(0, 1, 0);

function toLocal(e, x, y, z, out) {
  const dx = x - e.x, dz = z - e.z, f = e.face;
  return out.set((dx * cos(f) + dz * sin(f)) / S, (y - (e.y || 0)) / S, (-dx * sin(f) + dz * cos(f)) / S);
}

// ---------------------------------------------------------------
// 模様
// ---------------------------------------------------------------
function boneTex() {
  return canvasTex('kaijuBone', 128, 128, (c, W) => {
    c.fillStyle = '#d6cbab'; c.fillRect(0, 0, W, W);
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(${R(70, 120) | 0},${R(60, 90) | 0},40,${R(0.05, 0.22)})`; c.beginPath(); c.ellipse(R(0, W), R(0, W), R(2, 12), R(2, 8), R(0, 3), 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(40,28,18,0.7)'; c.lineWidth = 1.2;
    for (let i = 0; i < 22; i++) { let x = R(0, W), y = R(0, W); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += R(-9, 9); y += R(3, 12); c.lineTo(x, y); } c.stroke(); }
    for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(70,10,6,0.55)'; c.beginPath(); c.ellipse(R(0, W), R(0, W), R(3, 9), R(5, 16), 0, 0, 7); c.fill(); }
  }, 2);
}
// 地面の影(やわらかい丸)と 足あと(3 本指 + ひび)。白いほど 暗くなる(引き算で 描く)
function softTex() {
  return canvasTex('kaijuSoft', 64, 64, (c, W) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    const g = c.createRadialGradient(W / 2, W / 2, 2, W / 2, W / 2, W / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, W);
  });
}
function printTex() {
  return canvasTex('kaijuPrint', 128, 128, (c, W) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
    const el = (x, y, rx, ry, a, v) => { c.fillStyle = `rgba(255,255,255,${v})`; c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, 7); c.fill(); };
    el(64, 78, 30, 26, 0, 0.5); el(64, 78, 24, 20, 0, 0.75);                         // かかと(上 = 前)
    for (const k of [-1, 0, 1]) { el(64 + k * 26, 40 - abs(k) * -8, 10, 24, k * 0.38, 0.55); el(64 + k * 26, 40 - abs(k) * -8, 7, 20, k * 0.38, 0.8); el(64 + k * 34, 14 + abs(k) * 12, 4, 9, k * 0.4, 0.9); }
    el(64, 108, 7, 12, 0, 0.7);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.6;
    for (let i = 0; i < 14; i++) { const a = R(0, TAU); let x = 64 + cos(a) * 34, y = 70 + sin(a) * 34; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += cos(a + R(-0.6, 0.6)) * 7; y += sin(a + R(-0.6, 0.6)) * 7; c.lineTo(x, y); } c.stroke(); }
  });
}

// 霧を 弱く(遠くにいても 巨体の影が 空に うかぶ)
function weakFog(mt, k) {
  mt.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor * ${k.toFixed(2)} );
      // ふちの光(緑がかった 青白): 夕方の空・暗いビルの 前でも 形が うかび上がる
      gl_FragColor.rgb += vec3( 0.36, 0.56, 0.4 ) * pow( 1.0 - saturate( dot( normalize( vViewPosition ), normal ) ), 2.4 ) * 0.5;
      // カメラに 近い所だけ すかす(主人公とカメラの間に 入った 足・しっぽ。体が 大きいので 全身は すかさない)
      gl_FragColor.a *= mix( uKNear.z, 1.0, smoothstep( uKNear.x, uKNear.y, vFogDepth ) );
    #endif`).replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\nuniform vec3 uKNear;');
    sh.uniforms.uKNear = KNEAR;
  };
  mt.customProgramCacheKey = () => 'kaijuFogN' + k.toFixed(2);
}

// 近い所を すかす: (ここより 近くは うすい, ここから 先は ふつう, うすさ)。毎フレーム 視点に合わせて 入れる(nearFade)
const KNEAR = { value: new THREE.Vector3(0, 0.01, 1) };
function nearFade(e, dead) {
  const v = KNEAR.value, P = Engine.ctx && Engine.ctx.Player, cam = Engine.camera;
  if (dead || KaijuCam.cutting || KaijuCam.debug || !P) { v.set(0, 0.01, 1); return; }
  if (Engine.viewMode === 'fps') { v.set(0.6, 4, 0.35); return; }
  const d = Math.hypot(cam.position.x - P.pos.x, cam.position.y - P.pos.y - 1.2, cam.position.z - P.pos.z);
  if (Engine.viewMode === 'tps') v.set(d + 0.5, d + 9, 0.28);
  else v.set(d + 2, d + 16, 0.25);
}

// 取りこまれた ゾンビ 1 体(小さな 胴・頭・前へのばす腕)。色は 模様の 1 点から(1 体ずつ ちがう色)
let _mini = null;
function miniGeo() {
  if (!_mini) {
    const ps = [];
    const add = (g, x, y, z, rx = 0) => { g.rotateX(rx); g.translate(x, y, z); ps.push(g); };
    add(box(0.075, 0.1, 0.045), 0, 0, 0);
    add(box(0.045, 0.05, 0.045), 0, 0.078, -0.005);
    add(box(0.02, 0.095, 0.02), -0.05, 0.045, -0.045, -1.9);
    add(box(0.02, 0.095, 0.02), 0.05, 0.06, -0.05, -2.3);
    _mini = mergeGeometries(ps);
  }
  const g = _mini.clone(), uv = g.attributes.uv, u = Math.random(), w = Math.random();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u + (i < 24 ? 0 : 0.013), w + (i < 24 ? 0 : 0.02));
  return g;
}
// 手足(たての軸)の まわりに ゾンビを はりつける
function minis(G, bone, mt, n, r, y0, y1, s = 1.25, a0 = 0, a1 = TAU) {
  for (let i = 0; i < n; i++) {
    const a = R(a0, a1), y = R(y0, y1);
    G.add(bone, miniGeo(), mt, sin(a) * r, y, cos(a) * r, R(-0.6, 0.6), a + PI, R(-0.7, 0.7), s * R(0.9, 1.2));
  }
}

// ---------------------------------------------------------------
// 姿勢(数字の列を なめらかに 追いかけて 骨に入れる)
// ---------------------------------------------------------------
const Q = { lean: 0, spY: 1, chX: 2, chY: 3, n1: 4, n2: 5, nY: 6, hdX: 7, hdZ: 8, jaw: 9, aLx: 10, aLz: 11, fL: 12, aRx: 13, aRz: 14, fR: 15, drop: 16, pY: 17, pZ: 18 };
const NQ = 19;
// 第5弾の仕上げ: 体を 起こした(前は lean -0.62 = 鼻先が こしの 60m 前。見上げると 頭が 真上に来て 画面に 入らなかった)
const BASE = [-0.34, 0, -0.1, 0, -0.26, -0.22, 0, 0.8, 0, -0.08, 0.9, -0.2, 0.7, 0.9, 0.2, 0.7, 0, 0, 0];
const P_BITE = [-1.62, 0, -0.3, 0, -0.35, -0.3, 0, -0.1, 0, -0.95, 1.2, -0.5, 0.9, 1.2, 0.5, 0.9, 1.9, 0, 0];
const P_CLAW = [-1.3, 0, -0.2, 0, 0.1, 0.2, 0, 1.0, 0, -0.4, 1.8, -0.1, 0.15, 1.8, 0.1, 0.15, 1.6, 0, 0];
function applyPose(m, P, bob = 0) {
  const j = m.j;
  j.pelvis.position.y = HIP_Y - P[Q.drop] + bob;
  j.pelvis.rotation.set(0, P[Q.pY], P[Q.pZ]);
  j.spine.rotation.set(P[Q.lean], P[Q.spY], 0);
  j.chest.rotation.set(P[Q.chX], P[Q.chY], 0);
  j.n1.rotation.set(P[Q.n1], P[Q.nY], 0);
  j.n2.rotation.set(P[Q.n2], P[Q.nY], 0);
  j.head.rotation.set(P[Q.hdX], 0, P[Q.hdZ]);
  j.jaw.rotation.x = P[Q.jaw];
  j.armL.rotation.set(P[Q.aLx], 0, P[Q.aLz]); j.foreL.rotation.x = P[Q.fL];
  j.armR.rotation.set(P[Q.aRx], 0, P[Q.aRz]); j.foreR.rotation.x = P[Q.fR];
}

// 出ている 大怪獣(霧と影を 少し 遠くまで: Engine.setFarBoost。立体感の係の 約束。いなくなったら 1 に もどす)
const LIVE = [];
// 第5弾の仕上げ: 前は 2 倍(霧の終わりが 350m = 町が 遠くまで 全部 描かれて 重かった)。大怪獣は 100m ほどに 立つので 1.3 倍で 足りる
// (体は 霧が 弱く かかる 材質なので かすまない。遠くのビルは かすんで 奥行きが出る)。場面カットの間だけ 2 倍(カメラが 170m ほど はなれる)
function farBoost() { if (Engine.setFarBoost) Engine.setFarBoost(!LIVE.length ? 1 : KaijuCam.cutting ? 2 : 1.3); }

// =====================================================================
// 終末竜 ムクロドン
// =====================================================================
const kaiju = {
  def: { name: '終末竜 ムクロドン', title: '万の屍をまとう 歩く墓場', icon: '🦖', hp: 240000, speed: 9, r: 7, points: 30000, scale: 25, size: 90, len: 150, h: 88, tier: 4, S, color: 0x7b7c63 },
  special: true,            // ふつうの順番には 入らない(出現係が 特別に出す)
  noStand: true, passHero: true, vehicle: true, noCollide: true, noFar: true, noFreeze: true,
  enter: 'walkin', fall: 'topple', fallT: 3.8, fallW: 34, fallAmt: 1.0, zoomDead: true, burstAt: 1.6,
  phaseAt: [0.6, 0.3], roarT: 2.5, roarAt: 0.95,
  onRoar(B, e, m) { howl(B, e, 72, 34); },

  build(m) {
    const skin = mat(m, { map: skinTex('#8a9296', { wounds: 34, veins: 90, vein: 'rgba(70,34,84,0.6)', boils: 7, boilC: '#b0a274', drips: 28, rep: 5 }), color: 0xffffff, roughness: 0.8 });
    const flesh = mat(m, { map: bodiesTex(), color: 0xe8d8d0, roughness: 0.7, shadow: false });
    const bone = mat(m, { map: boneTex(), color: 0xffffff, roughness: 0.5, shadow: false });
    const dark = mat(m, { map: skinTex('#5c1c1e', { wounds: 14, veins: 40, vein: 'rgba(20,0,0,0.6)', rep: 2 }), color: 0xffffff, roughness: 0.55, shadow: false });
    const glow = mat(m, { color: 0x1c3a06, emissive: GREEN, emissiveIntensity: 1.8, glow: true, roughness: 0.4 });
    // すかすときは ざらざら(alphaHash)でなく なめらかに(体が 画面いっぱいに なるので)。ふだんは こさ 1 = ふつうの見た目
    for (const mt of m.mats) { weakFog(mt, 0.4); mt.alphaHash = false; mt.transparent = true; mt.depthWrite = true; if (!m.glows.includes(mt)) Air.rim(mt); }      // ふちの光(alphaHash を 切ったので 自分で つける)

    const G = new Rig(m);
    // ---- こし ----
    const pelvis = G.bone(null, 0, HIP_Y, 0);
    G.add(pelvis, blob(1.2, 0.1, 3, 18, 12), skin, 0, -0.05, 0.15, 0, 0, 0, 1.3, 1.0, 1.4);
    G.add(pelvis, sph(1.25, 12, 6, PI * 1.15, PI * 0.7, PI * 0.45, PI * 0.42), flesh, 0, -0.1, 0.1, 0, 0, 0, 1.32, 1.0, 1.3);      // 下腹に ゾンビのかたまり
    // ---- はら → むね ----
    const spine = G.bone(pelvis, 0, 0.3, -0.15);
    G.add(spine, lathe([[0.95, -0.35], [1.32, 0.2], [1.44, 0.9], [1.34, 1.6], [1.15, 2.1]], 18, (p) => { p.x *= 1.12; if (p.z > 0) p.z *= 0.92; }), skin);
    G.add(spine, sph(1.5, 12, 7, PI * 1.12, PI * 0.76, PI * 0.28, PI * 0.42), flesh, 0, 0.85, 0.02, 0, 0, 0, 1.1, 1.05, 1.0);     // はらの前
    minis(G, spine, flesh, 7, 1.52, 0.2, 1.5, 1.5, PI * 0.7, PI * 1.3);
    const chest = G.bone(spine, 0, 2.0, 0);
    G.add(chest, lathe([[1.12, -0.12], [1.46, 0.35], [1.5, 0.9], [1.22, 1.45], [0.82, 1.8], [0.6, 2.0]], 18, (p) => { p.x *= 1.22; p.z *= 0.96; }), skin);
    // 胸の さけ目: 黒い肉 + あばら + 脈打つ 緑の心臓
    G.add(chest, sph(0.95, 12, 8, PI * 1.1, PI * 0.8, PI * 0.2, PI * 0.6), dark, 0, 0.75, -0.62, 0, 0, 0, 1.15, 1.0, 1.0);
    ribs(G, chest, bone, 6, 0.28, 0.19, 1.02, 0.075, -0.62, PI * 0.92, 1.22);
    const heart = G.bone(chest, 0, 0.8, -1.3);
    G.add(heart, blob(0.4, 0.22, 2, 14, 10), glow, 0, 0, 0, 0, 0, 0, 1.1, 1.2, 0.8);
    // 背中: 外へ開いた あばら骨(横へ はり出して 前へ まがる。5 組)+ 背骨の こぶ + むき出しの 赤い肉
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const len = 2.9 - abs(i - 2) * 0.45;
      G.add(i < 2 ? spine : chest, horn(len, 0.21, 0.62, 8), bone, sx * 0.62, i < 2 ? 1.05 + i * 0.7 : 0.3 + (i - 2) * 0.55, 1.0, 0.3, 0, -sx * (1.0 - i * 0.06));
    }
    for (let i = 0; i < 7; i++) G.add(i < 3 ? spine : chest, blob(0.26, 0.2, i, 8, 6), bone, 0, i < 3 ? 0.4 + i * 0.6 : 0.1 + (i - 3) * 0.48, 1.32 - (i > 4 ? (i - 4) * 0.25 : 0));
    G.add(spine, sph(1.5, 10, 6, PI * 0.2, PI * 0.6, PI * 0.25, PI * 0.5), dark, 0, 0.9, 0.0, 0, 0, 0, 1.02, 1.0, 0.95);
    for (let i = 0; i < 9; i++) { const a = R(0.4, 2.7) * (i % 2 ? 1 : -1); G.add(i % 3 ? chest : spine, sph(R(0.1, 0.2), 7, 5), glow, sin(a) * 1.72, R(0.2, 1.5), cos(a) * 1.4); }   // 光る できもの
    // 取りこまれた ゾンビの かたまり(肩・わき腹・背中に こぶ。手を のばす ゾンビつき)
    for (const [bn, x, y, z, r] of [[chest, -1.75, 1.35, -0.1, 0.62], [chest, 1.5, 0.3, 0.75, 0.55], [spine, -1.45, 0.9, 0.5, 0.6], [spine, 1.5, 1.5, -0.35, 0.5], [chest, 0.2, 1.75, 0.75, 0.5]]) {
      G.add(bn, blob(r, 0.22, x * 3 + y, 12, 8), flesh, x, y, z);
      for (let k = 0; k < 4; k++) { const a = R(0, TAU), b = R(-0.3, 0.9); G.add(bn, miniGeo(), flesh, x + sin(a) * cos(b) * r, y + sin(b) * r, z + cos(a) * cos(b) * r, R(-0.5, 0.5), a + PI, R(-0.6, 0.6), 2.1); }
    }
    // ---- 前足(長い・かぎ爪 3 本) ----
    const arms = {}, fores = {}, hands = {};
    for (const sx of [-1, 1]) {
      const a = G.bone(chest, sx * 1.65, 1.1, -0.35);
      // 第5弾の仕上げ: 前足は 小さめ(恐竜の形。前は 上 1.7 + 下 1.6 の 長いうで)
      G.add(a, blob(0.46, 0.12, sx + 5, 12, 8), skin, 0, 0.05, 0);
      G.add(a, limb(AL1, 0.36, 0.26, 1.15, 10), skin);
      G.add(a, spike(0.6, 0.13, 5), bone, sx * 0.28, 0.22, 0.1, 0.4, 0, -sx * 0.9);
      const f = G.bone(a, 0, -AL1, 0);
      G.add(f, limb(AL2, 0.27, 0.2, 1.1, 10), skin);
      minis(G, f, flesh, 2, 0.26, -0.9, -0.25, 1.2);
      const h = G.bone(f, 0, -AL2, 0);
      G.add(h, blob(0.28, 0.15, sx + 2, 10, 8), skin, 0, -0.15, 0, 0, 0, 0, 1.25, 1, 1);
      for (let k = -1; k <= 1; k++) G.add(h, spike(0.66, 0.1, 5), bone, k * 0.2, -0.3, -0.07, PI + 0.3, 0, k * 0.22);
      arms[sx] = a; fores[sx] = f; hands[sx] = h;
    }
    // ---- くび・あたま ----
    const n1 = G.bone(chest, 0, 1.95, -0.05);
    G.add(n1, lathe([[0.74, -0.1], [0.64, 1.0]], 14), skin);
    const n2 = G.bone(n1, 0, 0.95, 0);
    G.add(n2, lathe([[0.64, 0], [0.54, 1.0]], 14), skin);
    for (let i = 0; i < 4; i++) G.add(i < 2 ? n1 : n2, spike(0.5, 0.1, 5), bone, 0, 0.25 + (i % 2) * 0.45, 0.6, 1.1, 0, 0);
    const head = G.bone(n2, 0, 0.95, 0);
    // ずがい骨(前 = -z)。うしろ半分だけ 肉が のこる
    const skull = (k) => lathe([[0.001, -0.55], [0.5, -0.4], [0.68, 0.1], [0.64, 0.6], [0.48, 1.2], [0.36, 1.75], [0.22, 2.05], [0.001, 2.15]], 16, (p) => { p.x *= k; p.z *= (p.z < 0 ? 0.3 : 0.82) * k; });
    G.add(head, skull(1), bone, 0, 0, 0, -PI / 2, 0, 0);
    G.add(head, lathe([[0.001, -0.6], [0.54, -0.44], [0.73, 0.1], [0.69, 0.5], [0.6, 0.72]], 14, (p) => { p.z *= p.z < 0 ? 0.32 : 0.86; }), skin, 0, 0, 0, -PI / 2, 0, 0);
    for (const sx of [-1, 1]) {
      G.add(head, sph(0.17, 8, 6), dark, sx * 0.46, 0.2, -0.82);
      G.add(head, sph(0.13, 8, 6), glow, sx * 0.51, 0.21, -0.87);
      // 横へ はり出して 前へ まがる 大きな角(左は 折れている)
      G.add(head, horn(sx < 0 ? 1.0 : 1.7, 0.24, 0.55, 8), bone, sx * 0.55, 0.3, -0.05, 0, 0, -sx * 1.15);
      for (let i = 0; i < 8; i++) G.add(head, spike(0.3 - i * 0.012, 0.065, 4), bone, sx * (0.42 - i * 0.035), -0.1, -0.55 - i * 0.2, PI, 0, 0);     // 上の歯
    }
    for (let i = 0; i < 5; i++) G.add(head, spike(R(0.45, 0.8), 0.1, 5), bone, (i - 2) * 0.24, 0.42, 0.3, 0.7, 0, -(i - 2) * 0.28);     // 骨の かんむり
    const jaw = G.bone(head, 0, -0.2, -0.1);
    G.add(jaw, lathe([[0.001, -0.3], [0.46, -0.2], [0.58, 0.2], [0.44, 0.9], [0.32, 1.5], [0.2, 1.85], [0.001, 1.95]], 14, (p) => { p.z *= p.z > 0 ? 0.1 : 0.55; }), bone, 0, 0, 0, -PI / 2, 0, 0);
    for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) G.add(jaw, spike(0.26 - i * 0.012, 0.06, 4), bone, sx * (0.4 - i * 0.035), 0, -0.5 - i * 0.2);
    G.add(jaw, blob(0.32, 0.2, 7, 10, 8), glow, 0, -0.02, -0.25, 0, 0, 0, 1.1, 0.5, 1.6);     // のどの奥の 光
    const mouth = G.bone(head, 0, -0.2, -1.7);
    // ---- あし(もも → すね → 足の甲 → 指)----
    const legs = [];
    for (const sx of [-1, 1]) {
      const th = G.bone(pelvis, sx * HIP_X, HIP_DY, HIP_DZ);
      G.add(th, limb(L1, 0.86, 0.56, 1.18, 12), skin);
      G.add(th, sph(0.92, 8, 6, sx > 0 ? PI * 0.65 : -PI * 0.35, PI * 0.7, PI * 0.25, PI * 0.45), flesh, 0, -0.75, 0, 0, 0, 0, 1.0, 1.3, 1.0);
      minis(G, th, flesh, 5, 0.86, -1.5, -0.3, 1.5);
      const sh = G.bone(th, 0, -L1, 0);
      G.add(sh, limb(L2, 0.54, 0.34, 1.12, 12), skin);
      G.add(sh, spike(0.75, 0.16, 5), bone, 0, 0.1, -0.45, -1.35, 0, 0);      // ひざの トゲ
      G.add(sh, sph(0.5, 8, 6, sx > 0 ? PI * 1.2 : PI * 1.3, PI * 0.5, PI * 0.3, PI * 0.45), dark, 0, -0.8, 0, 0, 0, 0, 1.0, 1.6, 1.0);
      minis(G, sh, flesh, 5, 0.42, -1.6, -0.4, 1.4);
      const mt = G.bone(sh, 0, -L2, 0);
      G.add(mt, limb(META, 0.37, 0.3, 1.05, 10), skin);
      const ft = G.bone(mt, 0, -META, 0);
      G.add(ft, blob(0.52, 0.12, sx + 9, 14, 10), skin, 0, 0.24, -0.1, 0, 0, 0, 1.3, 0.5, 1.45);
      for (let k = -1; k <= 1; k++) {
        const a = k * 0.36;
        G.add(ft, limbZ(0.95, 0.27, 0.18, 1.1, 8), skin, k * 0.42, 0.22, -0.5, 0, -a, 0);
        G.add(ft, spike(0.55, 0.16, 5), bone, k * 0.42 + sin(a) * 0.9, 0.2, -0.5 - cos(a) * 0.9, -PI / 2 - 0.25, 0, -a);
      }
      G.add(ft, limbZ(0.5, 0.2, 0.1, 1.1, 6), skin, 0, 0.25, 0.4, 0, PI, 0);
      minis(G, ft, flesh, 6, 0.6, 0.25, 0.5, 1.45);
      legs.push({ sx, th, sh, mt, ft });
    }
    // ---- しっぽ(節は 体の外。世界の位置から 骨を置く)----
    const tail = [];
    for (let i = 0; i < TN; i++) {
      const b = G.bone(null, 0, HIP_Y - 0.4, 1.0 + i * TL);
      const r0 = TR(i), r1 = TR(i + 1);
      G.add(b, lathe([[r0, -0.06], [(r0 + r1) / 2 * 1.04, TL / 2], [r1, TL + 0.06]], 14), skin, 0, 0, 0, PI / 2, 0, 0);
      G.add(b, spike(0.75 - i * 0.05, 0.15, 5), bone, 0, r0 * 0.85, TL * 0.3, 0.55, 0, 0);
      G.add(b, spike(0.6 - i * 0.04, 0.12, 5), bone, 0, r0 * 0.8, TL * 0.8, 0.55, 0, 0);
      if (i % 2) G.add(b, sph(0.16, 7, 5), glow, (i % 4 === 1 ? 1 : -1) * r0 * 0.9, 0.2, TL * 0.5);
      if (i >= 3) for (let k = 0; k < 3; k++) { const a = R(0.6, TAU - 0.6); G.add(b, miniGeo(), flesh, sin(a) * r0 * 0.95, -cos(a) * r0 * 0.95, R(0.1, TL - 0.1), R(0, TAU), 0, a, 1.4); }
      tail.push(b);
    }
    // 二またの先(骨の刃)
    const forks = [];
    for (const sx of [-1, 1]) {
      let par = tail[TN - 1]; const ch = [];
      for (let k = 0; k < FK; k++) {
        const b = G.bone(par, 0, 0, k ? FL : TL);
        const r0 = 0.44 - k * 0.09, r1 = 0.35 - k * 0.09;
        G.add(b, lathe([[r0, -0.05], [r1, FL + 0.05]], 10), skin, 0, 0, 0, PI / 2, 0, 0);
        if (k === FK - 1) G.add(b, lathe([[0.2, 0], [0.42, 0.35], [0.3, 0.9], [0.001, 1.45]], 8, (p) => { p.z *= 0.3; }), bone, 0, 0, FL, PI / 2, 0, 0);
        ch.push(b); par = b;
      }
      forks.push({ sx, ch });
    }
    G.finish();
    m.j = { pelvis, spine, chest, heart, n1, n2, head, jaw, mouth, armL: arms[-1], armR: arms[1], foreL: fores[-1], foreR: fores[1], handL: hands[-1], handR: hands[1], legs, tail, forks };

    // ---- 技の とどく所を はかっておく(かみつき・前足)----
    m.root.updateMatrixWorld(true);
    const measure = (P, bone, out) => { applyPose(m, P); m.root.updateMatrixWorld(true); bone.getWorldPosition(out); return out; };
    measure(P_BITE, mouth, _v); m.cal = { bite: -_v.z * S, biteY: _v.y * S };
    measure(P_CLAW, hands[1], _v); m.cal.claw = -_v.z * S; m.cal.clawX = abs(_v.x) * S; m.cal.clawY = _v.y * S;
    applyPose(m, BASE);

    // ---- 地面の影(やわらかい丸を ならべる)と 足あと ----
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-PI / 2);
    const sub = (map) => new THREE.MeshBasicMaterial({ map, blending: THREE.SubtractiveBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.shade = new THREE.InstancedMesh(pg, sub(softTex()), 16);
    m.prints = new THREE.InstancedMesh(pg, sub(printTex()), 10);
    for (const im of [m.shade, m.prints]) {
      im.frustumCulled = false; im.renderOrder = 1; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, _m4.makeScale(0, 0, 0)); im.setColorAt(i, _col.setRGB(0, 0, 0)); }
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    m.printL = new Float32Array(10); m.printN = 0;
    m.P = new Float32Array(BASE); m.T = new Float32Array(NQ);
    m.feet = [{ side: -1 }, { side: 1 }];
    m.tp = []; for (let i = 0; i <= TN; i++) m.tp.push(new THREE.Vector3());
    m.fk = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];     // 二またの 中ほど 2 つ・先 2 つ(世界)
    m.burns = [];
  },

  // ---------- 出た ----------
  spawn(B, e, m) {
    m.B = B; m.wph = 0; m.sag = 0; m.dip = 0; m.sw = 0; m.rain = 0; m.lost = 0; m.burns.length = 0; m.rainP = null; m.deadInit = false; m.shK = 0; m.tick = 0;
    m.P.set(BASE);
    const Pl0 = B._player || (Engine.ctx && Engine.ctx.Player);      // はじめから 主人公の方を 向いて 出る(前は 1 体目が 北を向いて = 背中を見せて 出た)
    e.face = Math.atan2(Pl0 ? Pl0.pos.x - e.x : 0, Pl0 ? -(Pl0.pos.z - e.z) : 1);
    const f = e.face, rx = cos(f), rz = sin(f);
    for (const F of m.feet) { F.x = e.x + rx * F.side * STANCE; F.z = e.z + rz * F.side * STANCE; F.y = 0; F.planted = true; F.manual = false; F.t = 0; F.T = 1; F.landT = -9; F.yaw = f; F.tx = F.x; F.tz = F.z; F.sx = F.x; F.sz = F.z; F.ox = 0; F.oz = 0; }
    const bx = -sin(f), bz = cos(f);
    for (let i = 0; i <= TN; i++) m.tp[i].set(e.x + bx * (10 + i * 9), TH1[i], e.z + bz * (10 + i * 9));
    for (let k = 0; k < 4; k++) m.fk[k].set(e.x + bx * (10 + TN * 9 + (k < 2 ? 12 : 28)), 4, e.z + bz * (10 + TN * 9 + (k < 2 ? 12 : 28)));      // 二またの先(はじめの 1 コマから 正しい所に。カメラ係が 使う)
    // 体の部品(当たりの丸): 足 2 つ・しっぽの低い所 4 つ・二またの先 2 つ
    const Z = B._Z;
    m.parts = { feet: [Z.addPart(e, FOOT_R, 5), Z.addPart(e, FOOT_R, 5)], tail: [], fork: [Z.addPart(e, 3.6, 3), Z.addPart(e, 3.6, 3)], far: Z.addPart(e, 7, 20) };
    e.mode = 'far'; e.nFar = 0; e.nNear = 0; e.backT = 0;
    for (let s = 3; s < TN; s++) m.parts.tail.push(Z.addPart(e, (TR(s) + TR(s + 1)) / 2 * S * 0.9, 5));
    for (let i = 0; i < 10; i++) { m.printL[i] = 0; m.prints.setColorAt(i, _col.setRGB(0, 0, 0)); }
    m.prints.instanceColor.needsUpdate = true;
    B._scene.add(m.shade); B._scene.add(m.prints);
    if (!LIVE.includes(m)) LIVE.push(m);
    farBoost();
    e.sT = 0; e.foot = 0; e.kills = 0;
    KaijuCam.attach(e, kaijuPoints);
  },
  free(B, m) {
    if (m.shade.parent) m.shade.parent.remove(m.shade);
    if (m.prints.parent) m.prints.parent.remove(m.prints);
    const i = LIVE.indexOf(m); if (i >= 0) LIVE.splice(i, 1);
    farBoost();
    if (m.e) KaijuCam.detach(m.e);
    KNEAR.value.set(0, 0.01, 1);
    m.parts = null;
  },

  // 撃たれた: 肉片。体力が 3% へるごとに 取りこまれた ゾンビが はがれて 落ちてくる
  hit(B, e, m, amount, opts) {
    const hx = e._hx !== undefined ? e._hx : e.x, hz = e._hx !== undefined ? e._hz : e.z;
    if (Math.random() < 0.08) Gore.chunks(hx + R(-2, 2), R(3, 8), hz + R(-2, 2), 2, 7, 5, opts.dirX || 0, opts.dirZ || 0, 0x5a2a20, 1.6);
    m.lost += amount;
    const per = e.maxHp * 0.03;
    if (m.lost > per) {
      m.lost -= per;
      if (B._Z.count() < 300) for (let i = 0; i < 2; i++) {
        const z = B._Z.spawn(Math.random() < 0.7 ? 'walker' : 'runner', hx + R(-5, 5), hz + R(-5, 5));
        if (z) { z.y = R(14, 26); z.vy = 0; z.fall = 1; }
      }
    }
  },
  onPhase(B, e, m, ph) {
    FX.flash(e.x, 30, e.z, GREEN, 600, 120, 0.8);
    for (let i = 0; i < FX.q(26); i++) { const a = R(0, TAU), r = R(8, 40); FX.flame(e.x + cos(a) * r, R(1, 50), e.z + sin(a) * r, cos(a) * 8, R(4, 14), sin(a) * 8, R(3, 6), R(0.6, 1.2), HOT, COOL); }
  },
  onDeath(B, e, m) { act(e, 'death'); },
  burstFx(B, e, m, x, z) {
    for (let i = 0; i < FX.q(30); i++) { const a = R(0, TAU), r = R(4, 50); FX.flame(x + cos(a) * r, R(1, 12), z + sin(a) * r, cos(a) * 10, R(6, 18), sin(a) * 10, R(3, 7), R(0.7, 1.4), HOT, COOL); }
    if (FX.ring) { FX.ring(x, z, 4, 90, 1.1, GREEN, 3, 2.4, 0.9); FX.ring(x, z, 2, 60, 0.8, 0xffffff, 1.4, 2, 0.7); }
  },

  // 見下ろし: カメラは「怪獣戦のカメラ」(kaiju-cam.js)が 決める。ここでは 引かない
  zoomFor() { return 1; },

  // 体ぜんぶは すかさない(カメラに 近い所だけ シェーダーで すかす = nearFade)
  fade() { return 1; },

  // たおれる向き: 主人公から はなれる方へ(generic が えらぶ)。足の位置を 体の中の数字に とめる
  fallDir(B, e, m) {
    // 主人公から見て 横へ たおれる(見下ろしでは 画面を 横切って たおれる = よく見える)。少しだけ 向こうがわへ
    const P = B._player, dx = e.x - (P ? P.pos.x : e.x), dz = e.z - (P ? P.pos.z : e.z + 1), l = Math.hypot(dx, dz) || 1, sd = Math.random() < 0.5 ? 1 : -1;
    const a = sd * R(1.15, 1.4), ca = cos(a), sa = sin(a);
    m.fdx = (dx * ca - dz * sa) / l; m.fdz = (dx * sa + dz * ca) / l;
    for (const F of m.feet) { toLocal(e, F.x, 0, F.z, _a); F.lx = _a.x; F.ly = 0; F.lz = _a.z; F.manual = false; }
    m.deadInit = true;
  },

  // ---------- 見た目 ----------
  anim(m, e, dt, c) {
    const j = m.j, B = m.B, St = e.state, st = e.st, dead = St === 'dead', t = e.t;
    const P = m.P, T = m.T;
    T.set(BASE);
    let rate = 4.5;
    const breath = sin(t * 1.1), wk = min(1, e.spd / 6);
    m.wph += dt * e.spd * 0.13;
    T[Q.lean] += 0.03 * breath - 0.05 * wk;
    T[Q.spY] = 0.07 * sin(m.wph) * wk;
    T[Q.nY] = 0.1 * sin(t * 0.5);
    T[Q.hdZ] = 0.06 * sin(t * 0.7);
    T[Q.jaw] = -0.12 - 0.07 * sin(t * 1.7);
    T[Q.aLx] += 0.12 * sin(m.wph + 1) * wk + 0.05 * breath; T[Q.aRx] -= 0.12 * sin(m.wph + 1) * wk - 0.05 * breath;
    let shake = 0;
    const rear = (k) => {      // のけぞって ほえる
      T[Q.lean] = BASE[0] + 0.48 * k; T[Q.chX] = -0.12 + 0.2 * k; T[Q.n1] = BASE[4] + 0.26 * k; T[Q.n2] = BASE[5] + 0.35 * k; T[Q.hdX] = BASE[7] - 0.45 * k;
      T[Q.jaw] = -0.12 - 0.9 * k; T[Q.aLx] = 0.9 - 0.5 * k; T[Q.aRx] = 0.9 - 0.5 * k; T[Q.aLz] = -0.2 - 0.9 * k; T[Q.aRz] = 0.2 + 0.9 * k; T[Q.fL] = T[Q.fR] = 0.7 - 0.3 * k;
    };
    const crouch = (k) => { T[Q.lean] = BASE[0] - 0.3 * k; T[Q.n1] = BASE[4] - 0.2 * k; T[Q.hdX] = BASE[7] + 0.25 * k; T[Q.drop] = 0.5 * k; T[Q.jaw] = -0.02; };
    if (St === 'roar' || St === 'howl') {
      const T0 = St === 'roar' ? 0.85 : 0.95;
      if (st < T0) { crouch(ease(st / T0)); rate = 6; } else { rear(min(1, (st - T0) / 0.25) * (st < T0 + 1.3 ? 1 : max(0, 1 - (st - T0 - 1.3) * 2))); rate = 12; shake = st < T0 + 1.3 ? 0.035 : 0; }
    } else if (St === 'enter') {
      T[Q.jaw] = -0.3;
    } else if (St === 'stomp') {
      const sd = m.feet[e.foot].side;
      T[Q.lean] = -0.45; T[Q.pZ] = -sd * 0.09; T[Q.spY] = sd * 0.12; T[Q.hdX] = 1.35; T[Q.jaw] = -0.45; rate = 6;
    } else if (St === 'tail') {
      const k = e.sweepK || 0;      // -0.12(ため)→ 1(ふりきった)
      T[Q.pY] = -e.side * 0.5 * k; T[Q.spY] = e.side * 0.4 * k; T[Q.lean] = -0.7; T[Q.nY] = e.side * 0.25 * k; T[Q.jaw] = -0.5; T[Q.drop] = 0.35; rate = 7;
    } else if (St === 'breath' || St === 'breath2') {
      const T0 = e.T0 || 1.5;
      if (st < T0) { const k = ease(min(1, st / (T0 * 0.8))); rear(0.75 * k); T[Q.jaw] = -0.25 - 0.3 * k; T[Q.aLz] = -0.4; T[Q.aRz] = 0.4; rate = 5; }
      else {
        // 口を 地面の ねらう所へ
        const gx = e.bgx - e.x, gz = e.bgz - e.z, gd = Math.hypot(gx, gz) || 1;
        let yaw = Math.atan2(gx, -gz) - e.face; yaw = Math.atan2(sin(yaw), cos(yaw)); yaw = clamp(yaw, -1.2, 1.2);
        const pit = -Math.atan2(62, max(10, gd - 30));            // 口の高さ 60m くらいから 見下ろす
        T[Q.lean] = -0.66; T[Q.chX] = -0.2; T[Q.n1] = -0.5; T[Q.n2] = -0.45; T[Q.hdX] = pit + 1.81; T[Q.spY] = -yaw * 0.3; T[Q.chY] = -yaw * 0.2; T[Q.nY] = -yaw * 0.28;
        T[Q.jaw] = -0.95; T[Q.aLz] = -0.6; T[Q.aRz] = 0.6; T[Q.drop] = 0.3; rate = 9; shake = 0.02;
      }
    } else if (St === 'bite') {
      const T0 = e.T0 || 1.25;
      if (st < T0) { const k = ease(min(1, st / (T0 * 0.8))); rear(0.55 * k); T[Q.jaw] = -0.2 - 0.75 * k; T[Q.aLz] = -0.3; T[Q.aRz] = 0.3; rate = 6; }
      else if (st < T0 + 0.9) { T.set(P_BITE); if (st > T0 + 0.25) T[Q.jaw] = -0.05; rate = 20; }
      else rate = 3;
    } else if (St === 'claw') {
      const T0 = e.T0 || 1.1, a = e.arm > 0 ? Q.aRx : Q.aLx, fo = e.arm > 0 ? Q.fR : Q.fL, a2 = e.arm > 0 ? Q.aLx : Q.aRx, f2 = e.arm > 0 ? Q.fL : Q.fR;
      const up = (ai, fi, k) => { T[ai] = 0.9 + 1.9 * k; T[fi] = 0.7 - 0.4 * k; };
      T[Q.lean] = -0.75; T[Q.drop] = 0.8; T[Q.jaw] = -0.5; rate = 7;
      if (st < T0) { up(a, fo, ease(min(1, st / (T0 * 0.8)))); T[Q.spY] = e.arm * 0.25; }
      else if (st < T0 + 0.75) { T.set(P_CLAW); T[a2] = 0.9 + 1.9 * ease(min(1, (st - T0) / 0.6)); T[f2] = 0.4; T[Q.spY] = -e.arm * 0.2; rate = st < T0 + 0.25 ? 20 : 7; }
      else if (st < T0 + 1.5) { T.set(P_CLAW); T[a] = 1.5; T[fo] = 0.6; rate = st < T0 + 1.0 ? 20 : 6; }
      else rate = 3;
    } else if (St === 'rain') {
      T[Q.spY] = 0.3 * sin(t * 14); T[Q.chY] = -0.2 * sin(t * 14 + 1); T[Q.lean] = -0.6; T[Q.aLz] = -0.8; T[Q.aRz] = 0.8; T[Q.jaw] = -0.6; rate = 14;
    } else if (St === 'nova') {
      const T0 = e.T0 || 1.8;
      if (st < T0) { crouch(1); T[Q.aLz] = 0.2; T[Q.aRz] = -0.2; T[Q.aLx] = 1.5; T[Q.aRx] = 1.5; shake = 0.03 * st / T0; rate = 5; } else { rear(st < T0 + 1.2 ? 1 : 0); rate = 14; shake = 0.03; }
    } else if (dead) {
      // ひざをつく → 頭を上げて 最後の声 → うなだれる
      const k = ease(min(1, st / 1.5));
      T[Q.drop] = 2.1 * k; T[Q.lean] = BASE[0] + 0.4 * k - 0.5 * ease(seg(st, 1.9, 3.2)); T[Q.aLx] = T[Q.aRx] = 0.3; T[Q.fL] = T[Q.fR] = 0.2; T[Q.aLz] = -0.25; T[Q.aRz] = 0.25;
      const cry = st < 1.9 ? ease(min(1, st / 0.5)) : max(0, 1 - (st - 1.9) * 1.5);
      T[Q.n1] = BASE[4] + 0.4 * cry; T[Q.n2] = BASE[5] + 0.4 * cry; T[Q.hdX] = BASE[7] - 0.3 * cry + 0.5 * ease(seg(st, 2.0, 3.2)); T[Q.jaw] = -0.9 * cry - 0.25; T[Q.hdZ] = 0.2 * sin(t * 5) * cry;
      rate = 5; shake = 0.02 * cry;
    }
    const kk = min(1, dt * rate);
    for (let i = 0; i < NQ; i++) P[i] += (T[i] - P[i]) * kk;
    if (!dead) gait(B, m, e, dt);
    // こしの しずみ(足を 広げたとき・着地の しずみ)
    let spread = 0;
    if (!dead) { const f = e.face, rx = cos(f), rz = sin(f); for (const F of m.feet) spread = max(spread, Math.hypot(F.x - (e.x + rx * F.side * STANCE), F.z - (e.z + rz * F.side * STANCE))); }
    m.sag += (clamp((spread - 8) / 12, 0, 1) * 0.9 - m.sag) * min(1, dt * 5);
    m.dip *= Math.exp(-4 * dt);
    applyPose(m, P, 0.05 * breath - m.sag - m.dip);
    if (shake) { j.head.rotation.x += R(-shake, shake); j.head.rotation.z += R(-shake, shake) * 2; j.spine.rotation.z = R(-shake, shake) * 0.4; } else j.spine.rotation.z = 0;
    // 心臓の どくどく(怒るほど 速く)
    const hb = 0.5 + 0.5 * sin(t * (2.6 + e.phase * 2.2)), hs = 1 + 0.16 * hb * hb + e.phase * 0.12;
    j.heart.scale.setScalar(dead ? max(0.3, 1 - st * 0.3) : hs);
    j.chest.scale.setScalar(1 + 0.018 * breath);

    // ---- あし(足の位置から ひざを 決める)----
    _qi.copy(j.pelvis.quaternion).invert();
    for (let i = 0; i < 2; i++) {
      const F = m.feet[i], L = j.legs[i];
      if (dead) _a.set(F.lx, F.ly, F.lz); else toLocal(e, F.x, F.y, F.z, _a);
      _a.sub(j.pelvis.position).applyQuaternion(_qi);
      const tx = _a.x - F.side * HIP_X, ty = _a.y + ANK_Y - HIP_DY, tz = _a.z + ANK_Z - HIP_DZ;
      const len = Math.hypot(tx, ty, tz) || 1, d = clamp(len, 1.0, L1 + L2 - 0.03);
      const beta = Math.asin(clamp(-tz / len, -1, 1)), gamma = Math.atan2(tx, -ty);
      const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), a2 = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
      L.th.rotation.set(beta + a1, 0, gamma, 'ZYX');
      L.sh.rotation.x = -(PI - a2);
      L.mt.rotation.x = META_TILT - (beta + a1 - (PI - a2));
      const up = dead ? 0 : clamp(F.y / LIFT, 0, 1.5);
      let dy = dead ? 0 : e.face - F.yaw; dy = clamp(Math.atan2(sin(dy), cos(dy)), -0.6, 0.6);
      L.ft.rotation.set(-META_TILT + 0.45 * up, dy, 0, 'YXZ');
    }
    nearFade(e, dead);
    if (dead) { farBoost(); shadeStep(m, e, dt, true); return; }
    tailStep(B, m, e, dt);
    bodyStep(B, m, e, dt);
    shadeStep(m, e, dt, false);
  },

  // ---------- 登場: 霧の むこうから 歩いてくる ----------
  enterAI(B, e, m, dt, c) {
    const sp = 10;
    e.vx += (c.dx * sp - e.vx) * min(1, dt * 1.5); e.vz += (c.dz * sp - e.vz) * min(1, dt * 1.5);
    turnTo(e, Math.atan2(c.dx, -c.dz), dt, 0.8);
    if (e.st > 1.2 || c.d < 96) { e.state = 'roar'; e.st = 0; e.hitDone = 0; act(e, 'roar'); }
    return -1;
  },

  // ---------- 考える ----------
  ai(B, e, m, dt, c) {
    const St = e.state, st = e.st, sm = 1 + 0.18 * e.phase;      // 怒るほど 技が 速い
    const fx = sin(e.face), fz = -cos(e.face), rx = -fz, rz = fx;
    const brake = (k = 3) => { const q = Math.exp(-k * dt); e.vx *= q; e.vz *= q; };
    if (St === 'walk') {
      // 立つ所(第5弾の仕上げ): ふだんは 遠く(86〜98m)= 全身が 画面に入る。そこから 息・ほえ声・ゾンビの雨。
      //   ときどき 近づいて(こしが 46m)ふみつけ・しっぽ・かみつき・前足 を 2〜3 回 → また 下がる。主人公が 自分から 足もとへ 来たら 近くの技で むかえる。
      //   方角: 見下ろし = 主人公の 北がわ(画面の奥。主人公が 回りこんだら 北へ 回る)/ 肩越し・一人称 = 今の方角のまま
      if ((e.sT -= dt) <= 0) { e.sT = R(5, 9); e.sA = R(-0.35, 0.35); e.sD = R(86, 98); }
      const near = e.mode === 'near';
      const cur = Math.atan2(-c.dx, c.dz);           // 主人公から見た 自分の方角(0 = 北)
      let a = cur + e.sA * 0.25;
      if (Engine.viewMode === 'top') { let da = e.sA - cur; da = Math.atan2(sin(da), cos(da)); a = cur + clamp(da, -0.7, 0.7); }
      const D = near ? 46 : e.sD;
      const tx = c.px + sin(a) * D, tz = c.pz - cos(a) * D;
      const ox = tx - e.x, oz = tz - e.z, od = Math.hypot(ox, oz) || 1;
      // 下がるとき(主人公が 追ってくる)は ゆっくり = 走れば 足もとまで 行ける。技のあとに 下がる間(backT)だけ 速い
      e.backT = max(0, (e.backT || 0) - dt);
      const back = c.d < D - 4 && (ox * c.dx + oz * c.dz) < 0;
      let sp = e.def.speed * (1 + 0.15 * e.phase) * (od > 90 ? 2.2 : od > 30 ? 1.7 : 1) * clamp(od / 12, 0, 1) * (od < 3 ? 0 : 1);
      if (back) sp = min(sp, e.backT > 0 ? 13 : 6);
      e.vx += (ox / od * sp - e.vx) * min(1, dt * 1.2); e.vz += (oz / od * sp - e.vz) * min(1, dt * 1.2);
      turnTo(e, Math.atan2(c.dx, -c.dz), dt, 0.5 * sm);
      if (e.cool <= 0 && m.feet[0].planted && m.feet[1].planted) {
        let a2 = e.force || null;      // e.force = 技の名前(確認用: 次に その技を出す)
        e.force = null;
        if (!a2) {
          if (c.d < 60) {                                  // 近い: 足・しっぽ・口・前足
            a2 = pick(e, c.d, NEAR);
            if (a2) { e.nNear = (e.nNear || 0) + 1; if (near && e.nNear >= 2 + (e.phase > 0 ? 1 : 0)) { e.mode = 'far'; e.nFar = 0; e.backT = 4.5; } }
          } else if (near) { /* 歩いて 近づいている とちゅう */ }
          else if ((e.nFar || 0) >= (e.phase > 1 ? 1 : 2)) { e.mode = 'near'; e.nNear = 0; e.cool = 0.3; }      // 近づく番
          else if (od < 30 || e.st > 4) { a2 = pick(e, c.d, FAR); if (a2) e.nFar = (e.nFar || 0) + 1; }
        }
        if (a2) {
          const nm = a2;
          begin(e, nm);
          if (nm === 'stomp' || nm === 'stomp3') { e.state = 'stomp'; e.n2 = nm === 'stomp3' ? 3 + e.phase - 1 : 1; e.last = nm; startStomp(m, e, c); }
          else if (nm === 'tail') { e.side = (c.dx * rx + c.dz * rz) >= 0 ? 1 : -1; e.sweepK = 0; }
          else if (nm === 'claw') e.arm = (c.dx * rx + c.dz * rz) >= 0 ? 1 : -1;
        }
      }
      return -1;
    }
    // ---- ふみつけ(足を 高く上げて 主人公の上へ)----
    if (St === 'stomp') {
      const F = m.feet[e.foot], T1 = 1.25 / sm, T2 = T1 + 0.2;
      if (st < T1 * 0.72) { const [x, z] = lead(c, 0.5); e.tx += (x - e.tx) * min(1, dt * 5); e.tz += (z - e.tz) * min(1, dt * 5); }
      if (st < T2) Warn.circle(e.tx, e.tz, 15, st / T2);
      // 体ごと 寄る(足の つけ根が 目標の 近くへ)
      const hx = e.x + rx * F.side * STANCE, hz = e.z + rz * F.side * STANCE, ddx = e.tx - hx, ddz = e.tz - hz, dd = Math.hypot(ddx, ddz) || 1;
      if (dd > 8 && st < T1) { const v = min(16, (dd - 5) / max(0.25, T1 - st)); e.vx += (ddx / dd * v - e.vx) * min(1, dt * 4); e.vz += (ddz / dd * v - e.vz) * min(1, dt * 4); } else brake(4);
      turnTo(e, Math.atan2(c.dx, -c.dz), dt, 0.3);
      if (st < T1) { const k = ease(st / T1); F.x = F.sx + (e.tx - F.sx) * k; F.z = F.sz + (e.tz - F.sz) * k; F.y = 17 * sin(min(1, st / (T1 * 0.7)) * PI / 2); F.yaw = e.face; }
      else if (st < T2) { const k = (st - T1) / (T2 - T1); F.x = e.tx; F.z = e.tz; F.y = 17 * (1 - k * k); }
      else if (!e.hitDone) {
        e.hitDone = 1; F.x = e.tx; F.z = e.tz; F.y = 0; F.planted = true; F.manual = false; F.landT = e.t; F.yaw = e.face;
        m.dip += 0.35;
        footFx(B, m, e, F, 1.8);
        slam(B, e, e.tx, e.tz, 15, { dmg: 0, hero: 30, lift: 11, big: true, cause: 'stomp', shake: 2, world: 3000, force: 0 });
        e.kb = 18; mow(B, e, e.tx, e.tz, 15, 3200, 40, 'stomp');
        ringWave(B, e, e.tx, e.tz, { r0: 10, speed: 24, max: 46 + e.phase * 8, w: 2.6, dmg: 0, hero: 20 });
        act(e, 'stompLand', e.tx, e.tz);
      }
      if (st > T2 + 0.65 / sm && m.feet[1 - e.foot].planted) {
        if (--e.n2 > 0) { e.st = 0; e.hitDone = 0; startStomp(m, e, c); } else done(e, 1.5, c);
      }
      return -1;
    }
    // ---- しっぽの なぎはらい(体の 片がわ ぜんぶ)----
    if (St === 'tail') {
      const T0 = 1.35 / sm, T1 = T0 + 1.45;
      brake(3);
      const sx = rx * e.side, sz = rz * e.side;
      if (st < T1) Warn.cone(e.x, e.z, sx, sz, 98, PI / 2, st / T0, 0x9a2208);
      // しっぽの 角度: ため(反対へ 少し)→ 後ろから 横を通って 前まで
      if (st < dt * 1.5) e.kb = 20;
      e.sweepK = st < T0 ? -0.12 * ease(st / T0) : -0.12 + 1.12 * ease(min(1, (st - T0) / (T1 - T0)));
      m.sw = st < T1 + 0.5 ? min(1, st / 0.5) : max(0, 1 - (st - T1 - 0.5) / 0.6);
      if (st > T0 && st < T1 + 0.1) tailHit(B, m, e, dt);
      if (st > T1 + 1.1) { m.sw = 0; done(e, 1.6, c); }
      return -1;
    }
    // ---- 腐れ火の息(緑の炎と 骨の つぶての 濁流が 地面を なめる)----
    if (St === 'breath' || St === 'breath2') {
      const two = St === 'breath2', T0 = e.T0 = 1.5 / sm, T1 = two ? 4.4 : 2.8;
      brake(2.5);
      if (e.n === 0) {
        e.n = 1; e.kb = 24;
        const px = -c.dz, pz = c.dx, half = two ? 46 : 32, s = Math.random() < 0.5 ? 1 : -1;
        e.bx0 = c.px - px * half * s + c.dx * 3; e.bz0 = c.pz - pz * half * s + c.dz * 3; e.bx1 = c.px + px * half * s + c.dx * 3; e.bz1 = c.pz + pz * half * s + c.dz * 3;
        // 2 回目(怒り): 首をふって 手前を もどる
        e.cx0 = e.bx1 - c.dx * 13; e.cz0 = e.bz1 - c.dz * 13; e.cx1 = e.bx0 - c.dx * 13; e.cz1 = e.bz0 - c.dz * 13;
        e.bgx = e.bx0; e.bgz = e.bz0;
      }
      turnTo(e, Math.atan2((e.bx0 + e.bx1) / 2 - e.x, -((e.bz0 + e.bz1) / 2 - e.z)), dt, 0.5);
      const L = Math.hypot(e.bx1 - e.bx0, e.bz1 - e.bz0), W = 13;
      const k = (st - T0) / T1, k1 = two ? clamp(k * 2, 0, 1) : clamp(k, 0, 1), k2 = clamp(k * 2 - 1, 0, 1);
      if (k1 < 1) Warn.rect(e.bx0, e.bz0, e.bx1 - e.bx0, e.bz1 - e.bz0, L, W, st < T0 ? st / T0 : 1, 0xc02a0a);
      if (two && k2 < 1) Warn.rect(e.cx0, e.cz0, e.cx1 - e.cx0, e.cz1 - e.cz0, L, W, clamp(st / (T0 + T1 * 0.5), 0, 1), 0xc02a0a);
      mouthPos(m, _v);
      if (st < T0) {       // ため: 口と 胸に 緑の光が 集まる
        FX.glow(_v.x, _v.y, _v.z, 5 + 8 * st / T0, GREEN, 1.6);
        if (Math.random() < dt * 30) { const a = R(0, TAU), r = R(8, 16); FX.spark(_v.x + cos(a) * r, _v.y + R(-6, 6), _v.z + sin(a) * r, -cos(a) * r * 2, 0, -sin(a) * r * 2, 0.45, 0.5, HOT, 4, GREEN, 2, 0.06, 0, 0, 0); }
      } else if (k < 1) {
        if (!e.hitDone) { e.hitDone = 1; act(e, 'breathFire'); }
        const gx = k1 < 1 || !two ? e.bx0 + (e.bx1 - e.bx0) * k1 : e.cx0 + (e.cx1 - e.cx0) * k2, gz = k1 < 1 || !two ? e.bz0 + (e.bz1 - e.bz0) * k1 : e.cz0 + (e.cz1 - e.cz0) * k2;
        e.bgx = gx; e.bgz = gz;
        breathTick(B, m, e, _v, gx, gz, dt);
      }
      if (st > T0 + T1 + 0.6) { e.bx0 = undefined; done(e, 1.5, c); }
      return -1;
    }
    // ---- かみつき(頭が 地面まで 落ちてくる)----
    if (St === 'bite') {
      const T0 = e.T0 = 1.3 / sm, T1 = T0 + 0.2, reach = m.cal.bite;
      if (st < T0 * 0.72) {
        turnTo(e, Math.atan2(c.dx, -c.dz), dt, 1.1);
        const v = clamp((c.d - reach) * 1.6, -10, 13);
        e.vx += (c.dx * v - e.vx) * min(1, dt * 3); e.vz += (c.dz * v - e.vz) * min(1, dt * 3);
      } else brake(6);
      e.tx = e.x + fx * reach; e.tz = e.z + fz * reach;
      if (st < T1) Warn.circle(e.tx, e.tz, 12, st / T1);
      if (st > T1 && !e.hitDone) {
        e.hitDone = 1;
        slam(B, e, e.tx, e.tz, 12, { dmg: 0, hero: 28, lift: 10, big: true, cause: 'bite', shake: 1.8, world: 2500, force: 0 });
        e.kb = 14; mow(B, e, e.tx, e.tz, 12, 3000, 34, 'bite');
        Gore.splat(e.tx, e.tz, 9, 0, 0, 1, 0x3a0303, 0.8);
        act(e, 'bite', e.tx, e.tz);
      }
      if (st > T1 + 1.4 / sm) done(e, 1.4, c);
      return -1;
    }
    // ---- 前足の たたきつけ(左右 つづけて)----
    if (St === 'claw') {
      const T0 = e.T0 = 1.15 / sm, reach = m.cal.claw, sx = m.cal.clawX;
      if (st < T0 * 0.7) {
        turnTo(e, Math.atan2(c.dx, -c.dz), dt, 1.0);
        const v = clamp((c.d - reach) * 1.6, -10, 13);
        e.vx += (c.dx * v - e.vx) * min(1, dt * 3); e.vz += (c.dz * v - e.vz) * min(1, dt * 3);
      } else brake(6);
      for (let i = 0; i < 2; i++) {
        const s = i ? -e.arm : e.arm, t1 = T0 + i * 0.75, x = e.x + fx * reach + rx * s * sx, z = e.z + fz * reach + rz * s * sx;
        if (st < t1 + 0.12) Warn.circle(x, z, 11, st / (t1 + 0.12));
        else if (e.hitDone === i) {
          e.hitDone = i + 1;
          slam(B, e, x, z, 11, { dmg: 0, hero: 26, lift: 9, big: true, cause: 'claw', shake: 1.6, world: 2500, force: 0 });
          e.kb = 10; mow(B, e, x, z, 11, 2600, 34, 'claw');
          for (let k = 0; k < 3; k++) FX.decal(x + fx * (k - 1) * 5 + rx * (k - 1) * 2, z + fz * (k - 1) * 5 + rz * (k - 1) * 2, 5, 'scorch', 25);
          act(e, 'claw', x, z);
        }
      }
      if (st > T0 + 0.75 + 1.3 / sm) done(e, 1.4, c);
      return -1;
    }
    // ---- ほえ声の衝撃波(まわりの ゾンビが 全部 ころぶ)----
    if (St === 'howl') {
      const T0 = 0.95;
      brake(3);
      if (st < T0 + 0.15) Warn.circle(e.x, e.z, 80, st / (T0 + 0.15), 0x9a5a20);
      else if (!e.hitDone) {
        e.hitDone = 1;
        act(e, 'howl');
        howl(B, e, 80, 40);
      }
      if (st > T0 + 0.2 && st < T0 + 1.2 && FX.ring && (e.n += dt) > 0.22) { e.n = 0; FX.ring(e.x, e.z, 8, 80, 0.6, 0xfff0c0, 2, 1.6, 0.5); }
      if (st > T0 + 1.7) done(e, 1.2, c);
      return -1;
    }
    // ---- ゾンビの雨(体から はがれた ゾンビが ふってくる)----
    if (St === 'rain') {
      brake(3);
      const N = Math.round((14 + e.phase * 5) * (FX.quality || 1)), gap = 1.5 / N;
      if (st > 0.7) {
        const n = Math.floor((st - 0.7) / gap);
        while (e.n <= n && e.n < N) {
          e.n++;
          if (B._Z.count() > 300) break;
          const a = R(0, TAU), r = R(6, 26), x = c.px + cos(a) * r, z = c.pz + sin(a) * r;
          if (World.blockedAt(x, z, 0.7) || World.buildingAt(x, z)) continue;
          const u = Math.random(), z0 = B._Z.spawn(u < 0.55 ? 'walker' : u < 0.85 ? 'runner' : u < 0.94 ? 'brute' : 'bloater', x, z);
          if (z0) { z0.y = R(38, 60); z0.vy = R(-8, 0); z0.fall = 1; m.rainP = m.rainP || []; m.rainP.push(x, z, 2.2); }
        }
      }
      if (st > 0.7 + 1.5 + 0.8) done(e, 1.0, c);
      return -1;
    }
    // ---- 全身からの 膿の爆発(怒り 2。広がる輪は 跳べば よけられる)----
    if (St === 'nova') {
      const T0 = e.T0 = 1.8;
      brake(3);
      if (st < T0) {
        Warn.circle(e.x, e.z, 62, st / T0, 0x9a2208);
        if (Math.random() < dt * 40) { const a = R(0, TAU), r = R(20, 60); FX.spark(e.x + cos(a) * r, R(2, 40), e.z + sin(a) * r, -cos(a) * r * 1.4, 0, -sin(a) * r * 1.4, 0.6, 0.6, HOT, 4, GREEN, 2, 0.06, 0, 0, 0); }
      } else {
        const n = Math.floor((st - T0) / 0.45);
        if (e.n <= n && e.n < 3) {
          e.n++;
          if (e.n === 1) { act(e, 'nova'); e.kb = 20; mow(B, e, e.x, e.z, 62, 1600, 40, 'boss'); if (heroIn(B, e.x, e.z, 30)) hitHero(B, e, e.x, e.z, 26, 9, 'nova'); FX.flash(e.x, 30, e.z, GREEN, 800, 140, 0.7); quake(B, e.x, e.z, 2, 160); }
          ringWave(B, e, e.x, e.z, { r0: 14, speed: 30, max: 78, w: 3, dmg: 0, hero: 22, col: GREEN });
          for (let i = 0; i < 5; i++) { const a = R(0, TAU), r = R(14, 56), x = e.x + cos(a) * r, z = e.z + sin(a) * r; FX.explosion(x, z, 7, 'acid'); if (World.damage) try { World.damage(x, z, 8, 2000, { cause: 'explosion' }); } catch (err) {} }
        }
      }
      if (st > T0 + 2.1) done(e, 1.4, c);
      return -1;
    }
    return -1;
  },
};
// [名前, 最小距離, 最大距離, 重み, 怒りの段階]。NEAR = 近づいたとき(こしまで 60m より近い)/ FAR = 遠くに立っているとき(全身が 見える)
const NEAR = [['stomp', 0, 52, 4], ['tail', 0, 62, 3], ['bite', 30, 62, 3], ['claw', 14, 62, 3], ['howl', 0, 40, 1],
  ['stomp3', 0, 56, 3.5, 1], ['nova', 0, 62, 3.5, 2]];
const FAR = [['breath', 60, 140, 4], ['howl', 60, 140, 1.6], ['rain', 60, 140, 2.2], ['breath2', 60, 140, 3.5, 1]];

function turnTo(e, want, dt, rate) {
  let da = want - e.face; da = Math.atan2(sin(da), cos(da));
  e.face += clamp(da, -rate * dt, rate * dt);
}
function mouthPos(m, out) { m.root.updateMatrixWorld(true); return m.j.mouth.getWorldPosition(out); }

function startStomp(m, e, c) {
  // 主人公に 近い方の足(つづけるときは 左右 かわりばんこ)
  const d0 = (m.feet[0].x - c.px) ** 2 + (m.feet[0].z - c.pz) ** 2, d1 = (m.feet[1].x - c.px) ** 2 + (m.feet[1].z - c.pz) ** 2;
  e.foot = e.n2 > 1 || e.last === 'stomp3' ? (e.foot ? 0 : 1) : d0 < d1 ? 0 : 1;
  const F = m.feet[e.foot];
  F.manual = true; F.planted = false; F.sx = F.x; F.sz = F.z;
  const [x, z] = lead(c, 0.5); e.tx = x; e.tz = z;
}

// ---------------------------------------------------------------
// 歩き: 足は 地面に 置いたまま。体が はなれたら 1 歩 ふみ出す(かわりばんこ)
// ---------------------------------------------------------------
function freeSpot(x, z) {
  if (!World.buildingAt(x, z) && !World.blockedAt(x, z, 3)) return null;
  for (let k = 0; k < 10; k++) { const a = k * 2.4, r = k < 5 ? 8 : 14, qx = x + cos(a) * r, qz = z + sin(a) * r; if (!World.buildingAt(qx, qz) && !World.blockedAt(qx, qz, 3)) return [qx, qz]; }
  return null;
}
function gait(B, m, e, dt) {
  const f = e.face, rx = cos(f), rz = sin(f), sp = e.spd || 0;
  const lead = clamp(sp * 1.3, 0, 18), lx = sp > 0.5 ? e.vx / sp * lead : 0, lz = sp > 0.5 ? e.vz / sp * lead : 0;
  for (let i = 0; i < 2; i++) {
    const F = m.feet[i], O = m.feet[1 - i];
    if (F.manual) continue;
    const hx = e.x + rx * F.side * STANCE, hz = e.z + rz * F.side * STANCE;
    if (F.planted) {
      const d = Math.hypot(F.x - hx, F.z - hz);
      let dy = f - F.yaw; dy = abs(Math.atan2(sin(dy), cos(dy)));
      const need = d > STEP_AT || ((d > 4 || dy > 0.45) && e.t - F.landT > 1.4 && (sp < 1 || dy > 0.45));
      if (need && O.planted && !O.manual && e.t - O.landT > 0.22 && d >= Math.hypot(O.x - (e.x - rx * F.side * STANCE), O.z - (e.z - rz * F.side * STANCE)) - 2) {
        F.planted = false; F.t = 0; F.T = clamp(1.25 - sp * 0.035, 0.7, 1.25) / (1 + 0.12 * e.phase); F.sx = F.x; F.sz = F.z;
        F.tx = hx + lx; F.tz = hz + lz;
        const q = freeSpot(F.tx, F.tz); F.fix = !!q; if (q) { F.tx = q[0]; F.tz = q[1]; }
      }
    } else {
      F.t += dt;
      const k = min(1, F.t / F.T);
      if (k < 0.55 && !F.fix) { F.tx += (hx + lx - F.tx) * min(1, dt * 2.5); F.tz += (hz + lz - F.tz) * min(1, dt * 2.5); }
      const kk = ease(k);
      F.x = F.sx + (F.tx - F.sx) * kk; F.z = F.sz + (F.tz - F.sz) * kk; F.y = LIFT * Math.pow(sin(PI * k), 0.8);
      let dy = f - F.yaw; F.yaw += Math.atan2(sin(dy), cos(dy)) * min(1, dt * 4);
      if (e.state !== 'enter' || heroDist(B, F.tx, F.tz) < 60) Warn.circle(F.tx, F.tz, FOOT_R + 1, k);
      if (k >= 1) { F.planted = true; F.y = 0; F.landT = e.t; m.dip += 0.1; footFx(B, m, e, F, 1); }
    }
  }
}

// 足が 地面に ついた: ゆれ・けむり・土・足あと・ふみつぶす
function footFx(B, m, e, F, s) {
  const x = F.x, z = F.z;
  const n = FX.q(12);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + R(-0.2, 0.2), v = R(14, 24) * s; FX.smoke(x + cos(a) * 5, 0.6, z + sin(a) * 5, R(2.2, 3.6) * s, R(1.0, 1.7), 0x6f6455, cos(a) * v, R(0.5, 3), sin(a) * v, 0.5); }
  FX.debris(x, 0.8, z, 10 * s, 15, 0x4a4038, 0.55, 2.2);
  if (FX.ring) FX.ring(x, z, 4, 15 * s, 0.5, 0x9a8a70, 1.3, 1.2, 0.55);
  addPrint(m, x, z, F.yaw, s > 1 ? 30 : 19);
  if (World.buildingAt(x, z)) {      // 建物を ふみぬいた
    FX.debris(x, 3, z, 16, 20, 0x8a8478, 0.8, 2.6);
    for (let i = 0; i < FX.q(6); i++) FX.smoke(x + R(-6, 6), R(2, 8), z + R(-6, 6), R(4, 6), R(1.6, 2.4), 0x8a8478, R(-4, 4), R(3, 8), R(-4, 4), 0.55);
  }
  const d = heroDist(B, x, z);
  if (s <= 1) {
    quake(B, x, z, 0.75, 150);
    B._Z.damageCircle(x, z, FOOT_R, 3000, { force: 30, cause: 'stomp', falloff: false });
    if (World.damage) try { World.damage(x, z, FOOT_R + 2, 2500, { cause: 'explosion' }); } catch (err) {}
    if (heroIn(B, x, z, FOOT_R)) hitHero(B, e, x, z, 16, 6, 'stomp');
  }
  Events.emit('kaijuStep', { x, z, d, e, heavy: s > 1 });
}
function addPrint(m, x, z, yaw, size) {
  const i = m.printN++ % 10;
  _q.setFromAxisAngle(_yAxis, -yaw);
  m.prints.setMatrixAt(i, _m4.compose(_p3.set(x, 0.13 + i * 0.002, z), _q, _s3.set(size, 1, size)));
  m.prints.instanceMatrix.needsUpdate = true;
  m.printL[i] = 24;
}

// ---------------------------------------------------------------
// しっぽ: 引きずる くさり(根元ほど 体の後ろへ もどる)。なぎはらいの間は 角度を 決めて ふる
// ---------------------------------------------------------------
function tailStep(B, m, e, dt) {
  const j = m.j, P = m.tp, f = e.face, fx = sin(f), fz = -cos(f), rx = -fz, rz = fx, bx = -fx, bz = -fz;
  const by = j.pelvis.position.y * S - 4, hk = by / 42;
  P[0].set(e.x + bx * 10, by, e.z + bz * 10);
  let px = bx, pz = bz;               // ひとつ前の節の向き
  let ax = P[0].x, az = P[0].z;       // なぎはらい: 決めた角度で ならべた位置
  const sw = m.sw || 0, sk = e.sweepK || 0, t = e.t;
  for (let i = 1; i <= TN; i++) {
    const p = P[i], q = P[i - 1];
    const hy = max(TR(i) * S + 0.3, (TH1[i] + (TH0[i] - TH1[i]) * min(1, sw * 2.5)) * hk) + (sw > 0 ? 0 : 0.6 * sin(t * 0.9 - i * 0.7) * (i > 4 ? 1 : 0));
    p.y += (hy - p.y) * min(1, dt * 4);
    const dy = p.y - q.y, lh = Math.sqrt(max(4, 100 - dy * dy));
    let dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const stf = min(1, (i < 3 ? 3.2 : 1.5 - i * 0.12) * dt), wag = 0.012 * sin(t * 0.8 - i * 0.55) * i * dt * 6;
    dx += (px - dx) * stf - dz * wag; dz += (pz - dz) * stf + dx * wag; d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    let nx = q.x + dx * lh, nz = q.z + dz * lh;
    if (sw > 0) {
      // 角度 a: 0 = 真うしろ、PI/2 = 横(e.side)、PI = 真ん前。先の節ほど 少し おくれる(むち)
      const a = (clamp(sk + (sk > 0 ? -0.05 * i * (1 - sk) : 0), -0.2, 1)) * 3.2;
      const ux = bx * cos(a) + rx * e.side * sin(a), uz = bz * cos(a) + rz * e.side * sin(a);
      ax += ux * lh; az += uz * lh;
      nx += (ax - nx) * sw; nz += (az - nz) * sw;
    }
    p.x = nx; p.z = nz;
    px = dx; pz = dz;
  }
  // 骨を 置く
  for (let i = 0; i < TN; i++) {
    const b = j.tail[i], p = P[i], q = P[i + 1];
    toLocal(e, p.x, p.y, p.z, b.position);
    const wx = q.x - p.x, wy = q.y - p.y, wz = q.z - p.z;
    _d.set(wx * cos(f) + wz * sin(f), wy, -wx * sin(f) + wz * cos(f)).normalize();
    b.quaternion.setFromUnitVectors(_bk, _d);
  }
  // 二またの先(ひらいて ゆれる)
  const a0 = P[TN - 1], a1 = P[TN];
  let dx = a1.x - a0.x, dz = a1.z - a0.z, d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  for (let k = 0; k < 2; k++) {
    const F = j.forks[k], sp = 0.3 + 0.08 * sin(t * 1.3 + k * 2) + (sw > 0 ? 0.1 : 0);
    F.ch[0].rotation.set(0, F.sx * sp, 0); F.ch[1].rotation.set(0.05, F.sx * 0.12, 0); F.ch[2].rotation.set(0.08, -F.sx * 0.1, 0);
    const c0 = cos(F.sx * sp), s0 = sin(F.sx * sp), ux = dx * c0 + dz * s0, uz = -dx * s0 + dz * c0;      // 世界での 向き(Y まわりに sp)
    m.fk[k].set(a1.x + ux * 12, 4, a1.z + uz * 12); m.fk[2 + k].set(a1.x + ux * 28, 3.5, a1.z + uz * 28);
  }
}
// なぎはらい中の 当たり(地面に近い節だけ。根元の下は くぐれる・跳べば よけられる)
function tailHit(B, m, e, dt) {
  const P = m.tp, Pl = B._player;
  e.n = (e.n || 0) + 1;
  const f = e.face, sx = cos(f) * e.side, sz = sin(f) * e.side, bx = -sin(f), bz = cos(f);
  const one = (x, y, z, r, i) => {
    if (y - r > 6) return;
    if ((e.n + i) % 3 === 0) {
      mow(B, e, x, z, r + 2, 2200, 46, 'sweep');
      if ((e.n + i) % 6 === 0 && World.damage) try { World.damage(x, z, r + 2, 2500, { cause: 'explosion' }); } catch (err) {}
      if (Math.random() < 0.6) FX.smoke(x + R(-3, 3), 1, z + R(-3, 3), R(2.5, 4), R(0.8, 1.4), 0x6f6455, R(-6, 6), R(2, 6), R(-6, 6), 0.5);
    }
    if (Pl && (Pl.pos.y || 0) < 3.5) {
      const hx = Pl.pos.x - x, hz = Pl.pos.z - z;
      if (hx * hx + hz * hz < (r + 1.2) ** 2) {
        // しっぽの 進む向き(後ろ → 横 → 前へ 回る)+ 少し 外へ
        const ox = Pl.pos.x - e.x, oz = Pl.pos.z - e.z, od = Math.hypot(ox, oz) || 1;
        const a = Math.atan2(ox * sx + oz * sz, ox * bx + oz * bz);
        hitHero(B, e, x, z, 30, 10, 'sweep', -bx * sin(a) + sx * cos(a) + ox / od * 0.5, -bz * sin(a) + sz * cos(a) + oz / od * 0.5);
      }
    }
  };
  for (let i = 3; i <= TN; i++) one(P[i].x, P[i].y, P[i].z, TR(i) * S, i);
  for (let k = 0; k < 4; k++) one(m.fk[k].x, m.fk[k].y, m.fk[k].z, 4, k + 9);
  if (e.n === 1) act(e, 'tailSwing', P[TN].x, P[TN].z);
  if (e.n % 20 === 1) quake(B, P[TN].x, P[TN].z, 0.9, 120);
}

// ---------------------------------------------------------------
// 体の部品の 位置・主人公を 押し出す・のこり火
// ---------------------------------------------------------------
function bodyStep(B, m, e, dt) {
  const Pt = m.parts, Pl = B._player;
  if (!Pt) return;
  m.tick = (m.tick || 0) + 1;
  // 足: 壁の むこうなら、丸を 主人公の がわへ 少し ずらす(かべごしでも 狙える・当たる)
  for (let i = 0; i < 2; i++) {
    const F = m.feet[i], p = Pt.feet[i];
    if (Pl && (m.tick + i * 3) % 6 === 0) {
      F.ox = F.oz = 0;
      const dx = Pl.pos.x - F.x, dz = Pl.pos.z - F.z, d = Math.hypot(dx, dz);
      if (d > 2 && d < 60) {
        const t = World.segmentHit(Pl.pos.x, Pl.pos.z, F.x, F.z, 1.2);
        if (t < 0.985) { const s = min(FOOT_R + 2, (1 - t) * d + 0.8); F.ox = dx / d * s; F.oz = dz / d * s; }
      }
    }
    if (F.y > 7) { p.x = p.z = 1e6; } else { p.x = F.x + F.ox; p.z = F.z + F.oz; }
  }
  // しっぽ: 地面に 近い節だけ 当たる
  for (let k = 0; k < Pt.tail.length; k++) {
    const s = k + 3, a = m.tp[s], b = m.tp[s + 1], p = Pt.tail[k], y = (a.y + b.y) / 2;
    if (y - p.r > 6.5) { p.x = p.z = 1e6; } else { p.x = (a.x + b.x) / 2; p.z = (a.z + b.z) / 2; }
  }
  for (let k = 0; k < 2; k++) { Pt.fork[k].x = (m.fk[k].x + m.fk[2 + k].x) / 2; Pt.fork[k].z = (m.fk[k].z + m.fk[2 + k].z) / 2; }
  // 足が 遠い間(27m より 遠い): 主人公から 体へ向かう線の 24m 先に 当たりの丸を 置く = ふつうの銃でも とどく・自動で ねらう。
  // 当たった光の 高さは、カメラから見て むねに 重なる 高さに(弾が むねに 当たったように 見える)
  if (Pl && Pt.far) {
    const p = Pt.far, dx = e.x - Pl.pos.x, dz = e.z - Pl.pos.z, d = Math.hypot(dx, dz) || 1;
    let nearest = d;
    for (const F of m.feet) nearest = min(nearest, Math.hypot(F.x - Pl.pos.x, F.z - Pl.pos.z));
    // (見下ろしの 自動ねらいは 36m まで・ボスは 26m 以内なら いちばん先に ねらう決まり(weapons.js)。だから 24m 先に置く = 前と同じく いつも 大怪獣を ねらえる)
    if (nearest < 27 || e.state === 'enter') { p.x = p.z = 1e6; }
    else {
      const R0 = 24;
      p.x = Pl.pos.x + dx / d * R0; p.z = Pl.pos.z + dz / d * R0;
      m.j.chest.getWorldPosition(_v);
      const cam = Engine.camera.position, cd = Math.hypot(_v.x - cam.x, _v.z - cam.z) || 1, pd = Math.hypot(p.x - cam.x, p.z - cam.z);
      p.hitY = clamp(cam.y + (_v.y - cam.y) * min(1, pd / cd), 3, 60);
    }
  }
  // 主人公を 押し出す(足・しっぽの 中に めりこまない)。壁に はさまれたら 壁を 先に
  if (Pl && (Pl.pos.y || 0) < 2.5 && !Pl.knocked) {
    let moved = false;
    const push = (x, z, r) => {
      const dx = Pl.pos.x - x, dz = Pl.pos.z - z, d2 = dx * dx + dz * dz, rr = r + Pl.radius;
      if (d2 >= rr * rr || d2 < 1e-6) return;
      const d = Math.sqrt(d2), k = min(rr - d, 14 * dt + (rr - d) * 0.3);
      Pl.pos.x += dx / d * k; Pl.pos.z += dz / d * k; moved = true;
    };
    for (const F of m.feet) if (F.y < 2) push(F.x, F.z, FOOT_R - 1.2);
    if (!(m.sw > 0)) for (let i = 4; i <= TN; i++) { const p = m.tp[i], r = TR(i) * S; if (p.y - r < 2) push(p.x, p.z, r * 0.8); }
    if (moved) World.collideCircle(Pl.pos, Pl.radius);
  }
  farBoost();
  // 腐れ火の のこり火
  for (let i = m.burns.length - 3; i >= 0; i -= 3) {
    const b = m.burns;
    if ((b[i + 2] -= dt) <= 0) { b.splice(i, 3); continue; }
    if (Math.random() < dt * 5) FX.flame(b[i] + R(-4, 4), 0.5, b[i + 1] + R(-4, 4), R(-1, 1), R(3, 6), R(-1, 1), R(1.4, 2.4), R(0.5, 0.8), HOT, COOL, 0.85, 0.8);
    if (Math.random() < dt * 2) { if (heroIn(B, b[i], b[i + 1], 3.5)) hitHero(B, e, b[i], b[i + 1], 10, 3, 'breath'); }
  }
  // ゾンビの雨の 落ちる所(小さな 赤い丸)
  if (m.rainP) for (let i = m.rainP.length - 3; i >= 0; i -= 3) {
    const r = m.rainP;
    if ((r[i + 2] -= dt) <= 0) { r.splice(i, 3); continue; }
    Warn.circle(r[i], r[i + 1], 1.8, 1 - r[i + 2] / 2.2);
  }
}

// 腐れ火の息(1 ステップぶん): 口 (M) → 地面 (gx, gz)
function breathTick(B, m, e, M, gx, gz, dt) {
  const vx = gx - M.x, vy = 0.5 - M.y, vz = gz - M.z, L = Math.hypot(vx, vy, vz) || 1, ux = vx / L, uy = vy / L, uz = vz / L, V = 70;
  const n = FX.q(4), cam = Engine.camera.position, top = Engine.viewMode === 'top';
  for (let i = 0; i < n; i++) {
    const u = R(0.02, 0.92), w = 1.5 + u * 5;
    const x = M.x + vx * u + R(-w, w), y = M.y + vy * u + R(-w, w), z = M.z + vz * u + R(-w, w);
    // これから 進む先(0.4 秒ぶん)が カメラの近くを 通るなら 出さない
    const cx = cam.x - x, cy = cam.y - y, cz = cam.z - z, t = clamp(cx * ux + cy * uy + cz * uz, 0, V * 0.42);
    if ((cx - ux * t) ** 2 + (cy - uy * t) ** 2 + (cz - uz * t) ** 2 < (top ? 30 : 16) ** 2) continue;
    // 第5弾の仕上げ: 明るさを おさえた(前は 1.2〜1.7 で 重なると 画面が 緑白く とんだ)。濃い緑の 炎の 流れに 見える
    FX.flame(x, y, z, ux * V, uy * V, uz * V, 1.8 + u * 2.6, 0.42, HOT, COOL, 0.7, 0.5);
  }
  if (Math.random() < 0.5) FX.smoke(M.x + vx * 0.5 + R(-5, 5), M.y + vy * 0.5 + 4, M.z + vz * 0.5 + R(-5, 5), 5, 1.4, 0x2a3a1c, ux * 20, 4, uz * 20, 0.4);
  FX.glow(M.x + ux * 4, M.y + uy * 4, M.z + uz * 4, 7, GREEN, 1.2);
  // 地面: 広がる 緑の炎・土けむり・骨の つぶて(カメラの すぐ近くでは 小さく・少なく)
  const gcd = Math.hypot(cam.x - gx, cam.z - gz), gk = clamp((gcd - 6) / 14, 0.25, 1);
  for (let i = 0; i < FX.q(2); i++) { if (Math.random() > gk) continue; const a = R(0, TAU), s = R(8, 20); FX.flame(gx + R(-4, 4), 0.8, gz + R(-4, 4), cos(a) * s, R(3, 9), sin(a) * s, R(1.8, 3.0) * (0.5 + 0.5 * gk), R(0.5, 0.8), HOT, COOL, 0.8, 0.7); }
  if (gk > 0.6) FX.glow(gx, 1.5, gz, 4, GREEN, 0.5);
  if (Math.random() < 0.4) FX.debris(gx, 1, gz, 3, 16, BONE2, 0.45, 1.6);
  if (Math.random() < 0.3) FX.smoke(gx, 1, gz, 4, 1.8, 0x2a2a20, R(-3, 3), 5, R(-3, 3), 0.5);
  if ((e.bt = (e.bt || 0) + dt) > 0.1) {
    e.bt = 0;
    mow(B, e, gx, gz, 8, 900, 12, 'breath');
    if ((e.bn | 0) % 2 === 0) FX.decal(gx, gz, 4.5, 'scorch', 22);
    if (World.damage) try { World.damage(gx, gz, 8, 1600, { cause: 'fire' }); } catch (err) {}
    if (m.burns.length < 60 && (e.bn = (e.bn || 0) + 1) % 3 === 0) m.burns.push(gx, gz, R(3, 4.5));
    quake(B, gx, gz, 0.5, 60);
  }
  if (heroIn(B, gx, gz, 6.5)) hitHero(B, e, gx, gz, 18, 5, 'breath');
}

// 技に まきこまれた ゾンビ: 倒すのは e.kb 体まで(1 つの技で 何百体も 倒れて 点数が はね上がらないように)。のこりは 吹っとんで ころぶ
const _mo = { dirX: 0, dirZ: 0, force: 0, cause: '' };
function mow(B, e, x, z, r, dmg, force, cause) {
  const L = B._Z.queryCircle(x, z, r, _near);
  for (let i = 0; i < L.length; i++) {
    const t = L[i]; if (!t.alive || t.boss) continue;
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz) || 1;
    if (e.kb > 0) {
      _mo.dirX = dx / d; _mo.dirZ = dz / d; _mo.force = force; _mo.cause = cause;
      if (B._Z.damage(t, dmg, _mo)) e.kb--;
      else if (cause === 'breath') { t.burn = max(t.burn, 3); t.burnDps = max(t.burnDps, 70); }
    } else { t.stun = max(t.stun, 1.6); t.kx += dx / d * force * 0.6; t.kz += dz / d * force * 0.6; t.flinch = 1; t.flash = 1; }
  }
  _near.length = 0;
}

// ほえ声: まわりの ゾンビが 全部 ころぶ(しばらく 動けない)・主人公は 吹っとぶ
function howl(B, e, r, heroR = r) {
  const x = e.x, z = e.z, L = B._Z.queryCircle(x, z, r, _near);
  for (let i = 0; i < L.length; i++) {
    const t = L[i]; if (!t.alive || t.boss) continue;
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz) || 1;
    t.stun = max(t.stun, 2.4); t.kx += dx / d * 16; t.kz += dz / d * 16; t.flinch = 1; t.flash = 1;
  }
  _near.length = 0;
  if (FX.ring) { FX.ring(x, z, 6, r * 1.1, 0.8, 0xffe0b0, 3, 2, 0.8); FX.ring(x, z, 3, r * 0.7, 0.6, 0xffffff, 1.5, 1.6, 0.5); }
  quake(B, x, z, 1.7, 170);
  Engine.fovKick && Engine.fovKick(12);
  const P = B._player;
  if (P && heroDist(B, x, z) < heroR && (P.pos.y || 0) < 3.5) hitHero(B, e, x, z, 18, 5, 'roar');
}

// ---------------------------------------------------------------
// 地面の影(丸を ならべる: はら・むね・あたま・しっぽ)と 足あとの うすれ
// ---------------------------------------------------------------
function shadeStep(m, e, dt, dead) {
  const im = m.shade, sun = Engine.sun;
  let ox = 0, oz = 0, k = 0.3;
  if (sun) {
    _a.copy(sun.position).sub(sun.target.position).normalize();
    const y = max(0.5, _a.y), h = Math.hypot(_a.x, _a.z) || 1, sl = min(1.1, h / y);       // 高さ 1m あたりの ずれ(1.1 まで)
    ox = -_a.x / h * sl; oz = -_a.z / h * sl;
    try { k = 0.3 * (0.4 + 0.6 * clamp(1 - (World.night || 0), 0, 1)); } catch (err) {}
  }
  m.shK += ((dead ? 0 : 1) - m.shK) * min(1, dt * (dead ? 0.6 : 2));
  k *= m.shK;
  let n = 0;
  const put = (x, y, z, w, l, yaw, v) => {
    const h = min(y, 30);
    _q.setFromAxisAngle(_yAxis, -yaw);
    im.setMatrixAt(n, _m4.compose(_p3.set(x + ox * h, 0.1 + n * 0.0015, z + oz * h), _q, _s3.set(w, 1, l)));
    im.setColorAt(n, _col.setRGB(v * k, v * k, v * k)); n++;
  };
  const f = e.face, fx = sin(f), fz = -cos(f), hip = m.j.pelvis.position.y * S;
  put(e.x + fx * 7, hip + 6, e.z + fz * 7, 58, 84, f, 1);                         // こし・はら・むね(1 つの 大きな だ円)
  put(e.x + fx * 44, hip + 20, e.z + fz * 44, 24, 30, f, 0.8);                    // あたま
  for (let i = 2; i <= TN; i += 2) { const p = m.tp[i], r = TR(i) * S; put(p.x, p.y, p.z, r * 3.2, r * 3.2, 0, 0.85); }      // しっぽ(1 つおき)
  put((m.fk[2].x + m.fk[3].x) / 2, 3, (m.fk[2].z + m.fk[3].z) / 2, 22, 22, 0, 0.6);
  for (const F of m.feet) if (F.y > 1) put(F.x, 0, F.z, 17, 19, F.yaw || 0, 0.9 * clamp(F.y / LIFT, 0, 1));     // 上げた足の 真下(ここへ 落ちてくる)
  for (; n < im.count; n++) im.setColorAt(n, _col.setRGB(0, 0, 0));
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  // 足あと: 24 秒で うすれる
  let any = false;
  for (let i = 0; i < 10; i++) {
    if (m.printL[i] <= 0) continue;
    m.printL[i] -= dt; any = true;
    const v = clamp(m.printL[i] / 6, 0, 1) * 0.55;
    m.prints.setColorAt(i, _col.setRGB(v, v, v));
  }
  if (any) m.prints.instanceColor.needsUpdate = true;
}

// 体の 目印の点(カメラ係が 全身を 画面に入れるのに使う)。はじめの 4 つ = 頭の上・口・むね・こし、つぎに 足 2 つ、しっぽ
export function kaijuPoints(e, out) {
  const m = e._M; if (!m) return 0;
  m.root.position.set(e.x, e.y || 0, e.z); m.root.rotation.y = -e.face; m.root.updateMatrixWorld(true);
  const j = m.j, f = e.face, fx = sin(f), fz = -cos(f);
  let n = 0;
  j.head.getWorldPosition(out[n]); out[n].y += 12; n++;
  j.mouth.getWorldPosition(out[n++]);
  j.chest.getWorldPosition(out[n++]);
  j.pelvis.getWorldPosition(out[n++]);
  for (const F of m.feet) out[n++].set(F.x, 0, F.z);
  out[n++].copy(m.tp[3]); out[n++].copy(m.tp[5]); out[n++].copy(m.tp[TN]);
  out[n++].copy(m.fk[2]).setY(2); out[n++].copy(m.fk[3]).setY(2);
  // 肩はば(あばら骨の はり出し)と、少し 前へ 出たときの 頭(歩いてくる・のけぞって ほえる)
  j.chest.getWorldPosition(_v);
  out[n++].set(_v.x - fz * 24, _v.y + 8, _v.z + fx * 24); out[n++].set(_v.x + fz * 24, _v.y + 8, _v.z - fx * 24);
  out[n].copy(out[0]); out[n].x += fx * 10; out[n].z += fz * 10; out[n].y += 6; n++;
  return n;
}

export const KAIJU = { kaiju };
