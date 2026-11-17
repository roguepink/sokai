// 画面係: 武器の絵(アイコン)。ゲームの中の武器の 3D の形(weapon-models.js の buildModel)を、
// 起動のあと 1 回だけ 小さな絵に描いて、1 枚の画像(たて rows × よこ COLS のマス)にする。
//  - ゲームと同じ描画機(Engine.renderer)を借りて、別の描画先(レンダーターゲット)に描く。新しい WebGL は作らない(スマホで重い・数に上限がある)
//  - 材質は アイコン用の かんたんなシェーダー 1 つ(作るのが速い。くすんだ金属も 明るく はっきり)
//  - 起動を重くしない: 1 コマに 数個ずつ(BUDGET ミリ秒まで)描いて、ぜんぶ描けたら 画像にする
//  - 絵ができるまで・作れなかったとき(古い機械など)は、weapon-defs.js の icon(絵文字)を そのまま出す
// 使い方: WeaponIcons.html(i) → '<i class="wi …">'(画面のどこでも 同じ絵)。WeaponIcons.build(renderer, WEAPONS, models) を 起動のとき 1 回
import * as THREE from '../vendor/three/build/three.module.min.js';
import { buildModel } from './weapon-models.js';

const COLS = 8, CELL = 160, BUDGET = 6;

// 種類(色で分かるように): gun 銃 = 金 / blast 爆発物 = 赤だいだい / energy エネルギー = 水色 / melee 近接・刃物 = 緑 / summon 召喚 = 紫
const CAT = {
  ar: 'gun', minigun: 'gun', pistols: 'gun', shotgun: 'gun', autoshotgun: 'gun', sniper: 'gun',
  grenade: 'blast', launcher: 'blast', rocket: 'blast', missile: 'blast', crossbow: 'blast', cannon: 'blast', rocketgat: 'blast',
  rail: 'energy', flame: 'energy', laser: 'energy', lightning: 'energy', plasma: 'energy', freeze: 'energy', blackhole: 'energy', acid: 'energy', emp: 'energy',
  chainsaw: 'melee', thor: 'melee', disc: 'melee', shuriken: 'melee',
  airstrike: 'summon', orbital: 'summon', tornado: 'summon', meteor: 'summon', drone: 'summon',
};
const KIND_CAT = { bullet: 'gun', grenade: 'blast', launcher: 'blast', rocket: 'blast', missile: 'blast', cannon: 'blast' };
export const CAT_NAMES = { gun: '銃', blast: '爆発物', energy: 'エネルギー', melee: '近接', summon: '召喚' };
export const CAT_ORDER = ['gun', 'blast', 'energy', 'melee', 'summon'];
const RIM = { gun: 0xffc860, blast: 0xff7a48, energy: 0x66d8ff, melee: 0x9aff7a, summon: 0xc79aff };

// 見る向き(ラジアン): yaw = 銃口を 手前へ回す / pitch = 上から のぞく / roll = 銃口を 右上へ かたむける / zoom = 大きさ
const VIEW = { yaw: 0.42, pitch: 0.3, roll: 0.5, zoom: 1 };
const VIEWS = {
  pistols: { yaw: 0.8, pitch: 0.35, roll: 0.35 },
  grenade: { yaw: 0.5, pitch: 0.2, roll: 0.25, zoom: 0.82 },
  missile: { yaw: 1.0, pitch: 0.38, roll: 0.25 },
  shuriken: { yaw: 0.2, pitch: 1.05, roll: 0.2, zoom: 0.92 },
  thor: { yaw: 0.5, pitch: 0.3, roll: 0.78 },
  airstrike: { yaw: 0.35, pitch: 0.3, roll: -0.7, zoom: 0.95 },
  drone: { yaw: 0.6, pitch: 0.62, roll: 0.12 },
  blackhole: { yaw: 0.55, pitch: 0.3, roll: 0.45 },
  tornado: { yaw: 0.75, pitch: 0.3, roll: 0.45 },
  emp: { yaw: 0.65, pitch: 0.3, roll: 0.45 },
  orbital: { yaw: 0.45, pitch: 0.25, roll: 0.3 },
  disc: { yaw: 0.45, pitch: 0.6, roll: 0.4 },
  minigun: { yaw: 0.5, pitch: 0.34, roll: 0.5 },
  rocketgat: { yaw: 0.6, pitch: 0.34, roll: 0.45 },
};

// 手に持つ形(リモコン・無線機)では 何の武器か分かりにくいもの: アイコンだけ 分かりやすい形(ドローン本体・爆弾)を描く
const SPECIAL = {
  drone(g, F) {
    const body = F(0x2a303a, 0, 0.6), arm = F(0x4a525e, 0, 0.7), rotor = F(0x7f93aa, 0, 0.8), eye = F(0x0a1a18, 0x40ffd0), red = F(0x9a1818, 0xff2a2a);
    add(g, new THREE.BoxGeometry(0.3, 0.1, 0.36), body, 0, 0, 0);
    add(g, new THREE.BoxGeometry(0.2, 0.06, 0.2), arm, 0, 0.07, 0.02);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const a = add(g, new THREE.BoxGeometry(0.4, 0.035, 0.05), arm, sx * 0.2, 0.02, sz * 0.2); a.rotation.y = -sx * sz * Math.PI / 4;
      add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), body, sx * 0.34, 0.05, sz * 0.34);
      add(g, new THREE.CylinderGeometry(0.19, 0.19, 0.014, 20), rotor, sx * 0.34, 0.1, sz * 0.34);
    }
    add(g, new THREE.SphereGeometry(0.075, 12, 8), eye, 0, -0.01, -0.19);
    const gun = add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), arm, 0, -0.08, -0.14); gun.rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.05, 0.03, 0.05), red, 0, 0.11, 0.16);
  },
  airstrike(g, F) {
    const olive = F(0x5a6a3a, 0, 0.35), dark = F(0x23272e, 0, 0.6), red = F(0xb01818, 0xff3020), band = F(0xd8b030, 0, 0.3);
    const b = add(g, new THREE.SphereGeometry(0.15, 16, 12), olive, 0, 0, -0.05); b.scale.set(1, 1, 2.3);
    const nose = add(g, new THREE.ConeGeometry(0.075, 0.16, 12), red, 0, 0, -0.42); nose.rotation.x = -Math.PI / 2;
    const ring = add(g, new THREE.CylinderGeometry(0.153, 0.153, 0.05, 16), band, 0, 0, -0.12); ring.rotation.x = Math.PI / 2;
    const tail = add(g, new THREE.CylinderGeometry(0.05, 0.1, 0.2, 10), dark, 0, 0, 0.36); tail.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const f = add(g, new THREE.BoxGeometry(0.02, 0.3, 0.2), dark, 0, 0, 0.42); f.rotation.z = i * Math.PI / 4; }
  },
};
function add(g, geo, mat, x, y, z) { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; }

const VERT = `varying vec3 vN;
void main() { vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform vec3 uColor; uniform vec3 uEmis; uniform float uMetal; uniform vec3 uRim;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 L = normalize(vec3(-0.5, 0.78, 0.6));
  float nl = dot(n, L);
  float wrap = max(nl, 0.0) * 0.72 + 0.28 * (nl * 0.5 + 0.5);
  vec3 base = uColor * 1.6 + 0.05;
  vec3 c = base * (0.3 + 0.82 * wrap);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, H), 0.0), mix(14.0, 40.0, uMetal)) * mix(0.18, 0.75, uMetal);
  c += sp * (0.45 + base);
  float fr = pow(1.0 - max(n.z, 0.0), 2.2);
  c += uRim * fr * (0.2 + 0.25 * uMetal);
  c += uEmis;
  gl_FragColor = vec4(pow(min(c, vec3(1.0)), vec3(0.4545)), 1.0);
}`;

export const WeaponIcons = {
  ready: false,             // 絵ができた
  ms: 0, maxTick: 0, ticks: 0, log: [],   // 作るのに かかった時間の合計・いちばん長かった 1 コマ・コマの数(確認用)
  canvas: null, url: '', cols: COLS, rows: 1, ids: [], _weapons: [], _job: null,

  cat(w) { return (w && (CAT[w.id] || KIND_CAT[w.kind])) || 'energy'; },

  // 武器 i 番(または 武器そのもの)の絵の HTML。絵ができるまでは 中の絵文字が見える
  html(w, cls = '') {
    const i = typeof w === 'number' ? w : this._weapons.indexOf(w);
    const W = typeof w === 'number' ? this._weapons[w] : w;
    return `<i class="wi wc-${this.cat(W)}${cls ? ' ' + cls : ''}" style="${this.pos(i)}"><em>${(W && W.icon) || ''}</em></i>`;
  },
  // 絵の場所(1 枚の画像の中の マス)
  pos(i) {
    if (i < 0) return '';
    const cx = i % COLS, cy = Math.floor(i / COLS), rows = Math.max(2, this.rows);
    return `background-position:${(cx / (COLS - 1) * 100).toFixed(3)}% ${(cy / (rows - 1) * 100).toFixed(3)}%`;
  },
  // すでにある <i class="wi"> を 別の武器の絵に変える
  set(el, w) {
    if (!el) return;
    const i = this._weapons.indexOf(w);
    el.className = el.className.replace(/\s*\bwc-\w+/g, '') + ' wc-' + this.cat(w);
    el.style.cssText = this.pos(i);
    const em = el.firstElementChild; if (em) em.textContent = (w && w.icon) || '';
  },

  // 起動のとき 1 回。renderer = ゲームの描画機 / models = 武器係が もう作ってある形(あれば 借りる。作り直さない)
  // すぐには描かない。次のコマから 少しずつ描く(ゲームの 1 コマを 長くしない)
  build(renderer, weapons, models = []) {
    this._weapons = weapons;
    this.ids = weapons.map((w) => w.id);
    this.rows = Math.ceil(weapons.length / COLS);
    const rows = Math.max(2, this.rows);
    document.documentElement.style.setProperty('--wi-size', `${COLS * 100}% ${rows * 100}%`);
    if (this.ready || this._job || !renderer || !renderer.readRenderTargetPixels) return;
    const W = COLS * CELL, H = rows * CELL;
    const scene = new THREE.Scene(), pivot = new THREE.Group();
    scene.add(pivot); pivot.rotation.order = 'ZXY';
    this._job = {
      renderer, models, i: 0, W, H, rows, scene, pivot, mats: new Map(), box: new THREE.Box3(), col: new THREE.Color(),
      cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50), rt: null, step: 'compile',
    };
    this._next();
  },
  _next() { (window.requestAnimationFrame || setTimeout)(() => this._tick(), 16); },

  _tick() {
    const J = this._job; if (!J) return;
    const t0 = performance.now(), r = J.renderer;
    const keep = { rt: r.getRenderTarget(), auto: r.autoClear, a: r.getClearAlpha() };
    r.getClearColor(J.col);
    let ok = true, wait = null;
    try {
      if (J.step === 'compile') {
        // シェーダーを 先に(できれば 画面を止めずに)用意する
        J.step = 'draw';
        if (r.compileAsync) {
          const probe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), this._mat(J, new THREE.Color(0), new THREE.Color(0), 0, 0, 'probe'));
          J.pivot.add(probe);
          const fin = () => { J.pivot.remove(probe); probe.geometry.dispose(); };
          wait = r.compileAsync(J.scene, J.cam).then(fin, fin);
        }
      } else if (J.step === 'draw') {
        r.autoClear = false;
        r.setClearColor(0x000000, 0);
        if (!J.rt) {
          J.rt = new THREE.WebGLRenderTarget(J.W, J.H, { samples: 4, depthBuffer: true, generateMipmaps: false });
          J.rt.scissorTest = false; J.rt.viewport.set(0, 0, J.W, J.H);
          r.setRenderTarget(J.rt);
          r.clear(true, true, true);
          J.rt.scissorTest = true;
        }
        do { this._drawOne(J, J.i++); } while (J.i < this._weapons.length && performance.now() - t0 < BUDGET);
        if (J.i >= this._weapons.length) J.step = 'read';
      } else if (J.step === 'read') {
        J.px = new Uint8Array(J.W * J.H * 4);
        if (r.readRenderTargetPixelsAsync) {
          // 待たずに読む(描き終わるのを 画面を止めずに待つ)。読めたら 次のコマで 画像にする
          J.step = 'wait';
          wait = r.readRenderTargetPixelsAsync(J.rt, 0, 0, J.W, J.H, J.px).then(() => { J.step = 'image'; });
        } else {
          r.readRenderTargetPixels(J.rt, 0, 0, J.W, J.H, J.px);
          J.step = 'image';
        }
      } else if (J.step === 'image') {
        this._pixels(J);
        J.step = 'outline';
      } else {
        this._outline(J);
        J.step = 'done';
      }
    } catch (e) {
      console.warn('[icons] 武器の絵を作れませんでした(絵文字で出します)', e);
      ok = false;
    }
    // 借りた描画機を 元にもどす
    r.setRenderTarget(keep.rt);
    r.setClearColor(J.col, keep.a);
    r.autoClear = keep.auto;
    const ms = performance.now() - t0;
    this.ms += ms; this.maxTick = Math.max(this.maxTick, ms); this.ticks++; this.log.push(J.step + ' ' + ms.toFixed(1));
    const end = () => { for (const m of J.mats.values()) m.dispose(); if (J.rt) J.rt.dispose(); this._job = null; };
    if (!ok || J.step === 'done') end();
    else if (wait) wait.then(() => this._next(), (e) => { console.warn('[icons]', e); end(); });
    else this._next();
  },

  _mat(J, color, emis, metal, rim, key) {
    let m = J.mats.get(key);
    if (!m) {
      m = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
        uniforms: { uColor: { value: color }, uEmis: { value: emis }, uMetal: { value: metal }, uRim: { value: new THREE.Color(rim) } },
      });
      J.mats.set(key, m);
    }
    return m;
  },

  // 武器 1 つを 自分のマスに描く
  _drawOne(J, i) {
    const w = this._weapons[i], v = Object.assign({}, VIEW, VIEWS[w.id]), rim = RIM[this.cat(w)];
    const { pivot, cam, box, rt, renderer } = J;
    const swapped = [];
    let model = null, parent = null, own = null;
    try {
      if (SPECIAL[w.id]) {
        own = model = new THREE.Group();
        SPECIAL[w.id](model, (c, e = 0, metal = 0.3) => this._mat(J, new THREE.Color(c), new THREE.Color(e), metal, rim, `${c}/${e}/${metal}/${rim}`));
        pivot.add(model);
      } else {
        model = J.models[i] || buildModel(w.id);
        parent = model.parent;
        pivot.add(model);
        model.traverse((o) => {
          const s = o.material;
          if (!o.isMesh || !s || Array.isArray(s)) return;
          swapped.push([o, s]);
          const e = s.emissive ? s.emissive.clone().multiplyScalar(Math.min(1.5, s.emissiveIntensity || 0)) : new THREE.Color(0);
          o.material = this._mat(J, s.color ? s.color.clone() : new THREE.Color(0.5, 0.5, 0.5), e, s.metalness || 0, rim, s.uuid + rim);
        });
      }
      pivot.rotation.set(v.pitch, -Math.PI / 2 - v.yaw, v.roll);
      pivot.updateMatrixWorld(true);
      box.setFromObject(pivot, true);
      const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
      const half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 0.2) / 2 * 1.1 / v.zoom;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.position.set(cx, cy, box.max.z + 5); cam.near = 0.5; cam.far = box.max.z - box.min.z + 12;
      cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      const x = (i % COLS) * CELL, y = (J.rows - 1 - Math.floor(i / COLS)) * CELL;
      rt.viewport.set(x, y, CELL, CELL); rt.scissor.set(x, y, CELL, CELL);
      renderer.setRenderTarget(rt);
      renderer.render(J.scene, cam);
    } finally {
      for (const [o, m] of swapped) o.material = m;
      if (model) pivot.remove(model);
      if (parent) parent.add(model);                 // 主人公の手に もどす
      if (own) own.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  },

  // 画像にする(上下を もどす・ふちの色を もどす)
  _pixels(J) {
    const { W, H, px } = J;
    const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
    const rc = raw.getContext('2d'), img = rc.createImageData(W, H), d = img.data;
    let any = false;
    for (let yy = 0; yy < H; yy++) {
      const s0 = (H - 1 - yy) * W * 4, d0 = yy * W * 4;
      for (let xx = 0; xx < W * 4; xx += 4) {
        const a = px[s0 + xx + 3];
        if (!a) continue;
        any = true;
        const k = a < 255 ? 255 / a : 1;
        d[d0 + xx] = px[s0 + xx] * k; d[d0 + xx + 1] = px[s0 + xx + 1] * k; d[d0 + xx + 2] = px[s0 + xx + 2] * k; d[d0 + xx + 3] = a;
      }
    }
    J.px = null;
    if (!any) throw new Error('empty');
    rc.putImageData(img, 0, 0);
    J.raw = raw;
  },
  // 黒い かげ絵 を 8 方向に ずらして重ねる = ふちどり(ぼかしを使わない。速い)→ 1 枚の画像に
  _outline(J) {
    const { W, H, raw } = J;
    const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
    const sc = sil.getContext('2d');
    sc.drawImage(raw, 0, 0);
    sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#000'; sc.fillRect(0, 0, W, H);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), o = CELL * 0.014;
    c.globalAlpha = 0.45; c.drawImage(sil, 0, o * 2.6);
    c.globalAlpha = 0.85;
    for (let k = 0; k < 8; k++) c.drawImage(sil, Math.cos(k * Math.PI / 4) * o, Math.sin(k * Math.PI / 4) * o);
    c.globalAlpha = 1; c.drawImage(raw, 0, 0);
    this.canvas = cv;
    this.ready = true;
    const done = (url) => {
      this.url = url;
      document.documentElement.style.setProperty('--wicons', `url("${url}")`);
      document.body.classList.add('wicons');
    };
    if (cv.toBlob) cv.toBlob((b) => { try { done(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')); } catch (e) { console.warn('[icons]', e); } }, 'image/png');
    else done(cv.toDataURL('image/png'));
  },
};
