// マップ係: 動く景色(ちょっとした変化)。本物の光は増やさない(光って見えるのは 光る色 + 画面効果)。
//  - 観覧車・ジェットコースター・メリーゴーランド・フリーフォール・風車・レーダー・灯台の光・見はり塔のサーチライト・管制塔の赤い灯
//  - ときどき: ヘリが上を飛ぶ(夜はサーチライト)/ カラスの群れ(近づく・爆発で にげる)/ 遠くの爆発 / 電線の火花 / パトカーの赤と青
//  - 近くの物だけ動かす(遠い物は止めておく)
import * as THREE from 'three';
import { Engine } from './engine.js';
import { Events } from './events.js';
import { makeGeo } from './world-build.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
let FX = null;

// 光の筋(先が細い円すい。先から遠いほど うすい)
const BEAM_VS = `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = -position.y; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(transpose(inverse(mat3(modelMatrix))) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const BEAM_FS = `uniform vec3 uCol; uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = (1.0 - vT) * (1.0 - vT) * edge * uI; gl_FragColor = vec4(uCol * a, a); }`;

export const Life = {
  W: null, spin: [], beams: [], _t: 0,
  init(W) {
    this.W = W;
    import('./fx.js').then((m) => { FX = m.FX; }).catch(() => {});
    const M = W.M, g = W.group;
    this.beamU = { uCol: { value: new THREE.Color(1, 0.95, 0.8) }, uI: { value: 0.3 } };
    this.beamMat = new THREE.ShaderMaterial({ uniforms: this.beamU, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.beamGeo = new THREE.ConeGeometry(1, 1, 16, 1, true).translate(0, -0.5, 0);   // 先が (0,0,0)、底が y = -1
    this.spotMat = new THREE.MeshBasicMaterial({ map: M._glowTex, color: new THREE.Color(1, 0.95, 0.75), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.spotGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.spin = W.spinners;
    for (const s of W.spinners) this._setup(s, g, M);
    this._heli(g, M);
    this._crows(g, M);
    this._booms(g, M);
    this._sirens(g);
    Events.on('propExplode', (e) => this.scare(e.x, e.z, 60));
    Events.on('explosion', (e) => this.scare(e.x, e.z, 45));
    Events.on('fire', (e) => { if (e && e.x !== undefined) this.scare(e.x, e.z, 14); });
  },

  beam(r, L) { const m = new THREE.Mesh(this.beamGeo, this.beamMat); m.renderOrder = 7; m.userData.r = r; m.userData.L = L; this.W.group.add(m); return m; },
  spot() { const m = new THREE.Mesh(this.spotGeo, this.spotMat); m.renderOrder = 3; this.W.group.add(m); return m; },
  // 先 a から 向き d へ 長さ L・太さ r の光の筋
  aim(m, ax, ay, az, dx, dy, dz, L, r) {
    _d.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(DOWN, _d);
    m.position.set(ax, ay, az); m.quaternion.copy(_q); m.scale.set(r, L, r);
  },

  _setup(s, g, M) {
    if (s.kind === 'search') { s.beam = this.beam(); s.spot = this.spot(); s.a = Math.random() * 6; s.sp = 0.3 + Math.random() * 0.3; }
    else if (s.kind === 'lighthouse') { s.b1 = this.beam(); s.b2 = this.beam(); }
    else if (s.kind === 'beacon') { s.obj = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2), fog: false })); s.obj.position.set(s.x, s.y + 4.9, s.z); g.add(s.obj); }
    else if (s.kind === 'windmill') {
      const geo = makeGeo((b) => { for (let k = 0; k < 4; k++) { const bl = new THREE.BoxGeometry(0.15, 9, 1.4); bl.translate(0, 5, 0); b.geom(null, bl, _m.makeRotationZ(k * Math.PI / 2), { col: [0.9, 0.9, 0.88] }); } const hub = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 8).rotateX(Math.PI / 2); b.geom(null, hub, _m.identity(), { col: [0.4, 0.4, 0.4] }); });
      s.obj = new THREE.Mesh(geo, M.plainNoCut); s.obj.position.set(s.x, s.y, s.z); s.obj.castShadow = true; g.add(s.obj);
    }
  },

  update(dt, px, pz) {
    this._t += dt;
    const t = this._t, cam = Engine.camera.position, night = this.W.night || 0, wx = this.W._sky ? this.W._sky.wx : null;
    const murk = wx ? Math.min(1, wx.fog + wx.storm * 0.6 + wx.rain * 0.3 + wx.snow * 0.3) : 0;
    const lightI = Math.min(1, 0.12 + night * 0.9 + murk * 0.4);
    this.beamU.uI.value = 0.8 * lightI;
    this.spotMat.opacity = 0.6 * lightI;
    for (const s of this.spin) {
      const dx = s.x - cam.x, dz = s.z - cam.z, far = dx * dx + dz * dz > 420 * 420;
      if (s._far !== far) { s._far = far; this._vis(s, !far); }
      if (far) continue;
      this._anim(s, dt, t, lightI);
    }
    this._heliUpdate(dt, px, pz, lightI);
    this._crowUpdate(dt, px, pz);
    this._boomUpdate(dt, px, pz);
    this._sparks(dt, px, pz);
    this._sirenUpdate(dt, px, pz);
  },
  _vis(s, v) {
    for (const k of ['wheel', 'gondolas', 'cars', 'obj', 'beam', 'spot', 'b1', 'b2']) if (s[k]) s[k].visible = v;
  },

  _anim(s, dt, t, lightI) {
    switch (s.kind) {
      case 'ferris': {
        const a = t * 0.06;
        s.wheel.rotation.x = a;
        for (let k = 0; k < s.n; k++) {
          const b = a + k / s.n * Math.PI * 2;
          _m.makeRotationZ(Math.sin(t * 0.8 + k) * 0.04).setPosition(s.x, s.y + Math.cos(b) * s.R, s.z + Math.sin(b) * s.R);
          s.gondolas.setMatrixAt(k, _m);
        }
        s.gondolas.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'coaster': {
        // 高い所は ゆっくり、低い所は 速い(位置のエネルギー)
        const p = s.curve.getPointAt(s.u);
        const v = Math.sqrt(Math.max(36, 2 * 9.8 * (30 - p.y) + 30));
        s.u = (s.u + v * dt / s.len) % 1;
        for (let k = 0; k < 5; k++) {
          const u = (s.u - k * 2.6 / s.len + 1) % 1, u2 = (u + 0.002) % 1;
          s.curve.getPointAt(u, _p); s.curve.getPointAt(u2, _v);
          _m.lookAt(_v, _p, THREE.Object3D.DEFAULT_UP); _q.setFromRotationMatrix(_m);
          _m.compose(_p, _q, _s.set(1, 1, 1));
          s.cars.setMatrixAt(k, _m);
        }
        s.cars.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'carousel': s.obj.rotation.y = t * 0.45; break;
      case 'drop': {
        // 上がる(8 秒)→ 止まる(2 秒)→ 落ちる(1.6 秒)→ 下で待つ(4 秒)
        const c = (t + s.x) % 15.6;
        let y;
        if (c < 8) y = 3 + (s.H - 8) * (c / 8);
        else if (c < 10) y = s.H - 5;
        else if (c < 11.6) { const k = (c - 10) / 1.6; y = s.H - 5 - (s.H - 8) * k * k; }
        else y = 3;
        s.obj.position.y = y;
        break;
      }
      case 'windmill': s.obj.rotation.z = -t * 0.9; break;
      case 'radar': s.obj.rotation.y = t * 1.2; break;
      case 'beacon': s.obj.visible = Math.sin(t * 3.3) > 0.2; break;
      case 'search': {
        s.a += dt * s.sp;
        const tx = s.x + Math.cos(s.a) * 20 + Math.sin(s.a * 2.3) * 8, tz = s.z + Math.sin(s.a) * 20;
        const dx = tx - s.x, dy = -s.y, dz = tz - s.z, L = Math.hypot(dx, dy, dz);
        this.aim(s.beam, s.x, s.y, s.z, dx, dy, dz, L, 3.2);
        s.spot.position.set(tx, 0.08, tz); s.spot.scale.setScalar(4.5);
        s.beam.visible = s.spot.visible = lightI > 0.2;
        break;
      }
      case 'lighthouse': {
        const a = t * 0.9;
        this.aim(s.b1, s.x, s.y, s.z, Math.cos(a), -0.04, Math.sin(a), 140, 7);
        this.aim(s.b2, s.x, s.y, s.z, -Math.cos(a), -0.04, -Math.sin(a), 140, 7);
        s.b1.visible = s.b2.visible = lightI > 0.15;
        break;
      }
    }
  },

  // ---------- ヘリが飛んでくる ----------
  _heli(g) {
    const body = makeGeo((b) => {
      const s = new THREE.SphereGeometry(1.5, 12, 8); b.geom(null, s, _m.makeScale(2.0, 1.0, 0.95).setPosition(0.5, 0, 0), { col: [0.22, 0.25, 0.18] });
      b.geom(null, new THREE.CylinderGeometry(0.45, 0.22, 6.5, 8).rotateZ(Math.PI / 2), _m.makeTranslation(-3.8, 0.3, 0), { col: [0.22, 0.25, 0.18] });
      b.box(null, -7.1, 0.2, -0.08, -6.3, 1.8, 0.08, { col: [0.22, 0.25, 0.18] });
      for (const s2 of [-1, 1]) b.box(null, -1.5, -1.8, s2 * 1.15 - 0.06, 2.6, -1.7, s2 * 1.15 + 0.06, { col: [0.05, 0.05, 0.05] });
      b.box(null, 1.6, -0.4, -0.9, 2.6, 0.6, 0.9, { col: [0.05, 0.07, 0.1] });
    });
    const rotor = new THREE.Mesh(new THREE.CircleGeometry(7.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    rotor.position.y = 1.5;
    const blades = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.4), new THREE.MeshBasicMaterial({ color: 0x151515 }));
    blades.position.y = 1.55;
    const navR = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2), fog: false })); navR.position.set(-7, 1.9, 0);
    const navW = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4), fog: false })); navW.position.set(3.4, -0.6, 0);
    const h = new THREE.Group();
    const bm = new THREE.Mesh(body, this.W.M.car); bm.castShadow = true;
    h.add(bm, rotor, blades, navR, navW);
    h.visible = false;
    g.add(h);
    this.heli = { obj: h, blades, navR, navW, t: 0, active: false, wait: 35 + Math.random() * 30, beam: this.beam(), spot: this.spot() };
    this.heli.beam.visible = this.heli.spot.visible = false;
  },
  _heliUpdate(dt, px, pz, lightI) {
    const H = this.heli;
    if (!H.active) {
      if ((H.wait -= dt) > 0) return;
      // 主人公の近くを 横切る道を えらぶ
      const a = Math.random() * Math.PI * 2, off = (Math.random() - 0.5) * 70;
      H.dx = Math.cos(a); H.dz = Math.sin(a);
      H.sx = px - H.dx * 380 - H.dz * off; H.sz = pz - H.dz * 380 + H.dx * off;
      H.alt = 32 + Math.random() * 14; H.v = 20 + Math.random() * 8; H.t = 0; H.active = true; H.obj.visible = true;
      H.hover = Math.random() < 0.5 ? 6 + Math.random() * 6 : 0;   // ときどき 上で止まって 照らす
      Events.emit('heliPass', { x: px, z: pz });
      return;
    }
    H.t += dt;
    let d = H.t * H.v;
    const mid = 380;
    if (H.hover > 0 && d > mid - 20) { if (H.hold === undefined) H.hold = 0; H.hold += dt; if (H.hold < H.hover) { d = mid - 20; H.t -= dt; } }
    const x = H.sx + H.dx * d, z = H.sz + H.dz * d, y = H.alt + Math.sin(H.t * 0.7) * 1.5;
    H.obj.position.set(x, y, z);
    H.obj.rotation.set(Math.sin(H.t) * 0.03, -Math.atan2(H.dz, H.dx), H.hold !== undefined && H.hold < H.hover ? 0 : -0.12);
    H.blades.rotation.y = H.t * 40;
    H.navR.visible = Math.sin(H.t * 9) > 0; H.navW.visible = Math.sin(H.t * 9 + 2) > 0.6;
    // サーチライト(主人公のあたりを ゆらゆら)
    const on = lightI > 0.25;
    H.beam.visible = H.spot.visible = on;
    if (on) {
      const tx = px + Math.sin(H.t * 0.9) * 8, tz = pz + Math.cos(H.t * 0.7) * 8;
      const sx = x + 2.5 * Math.cos(-H.obj.rotation.y), sz = z - 2.5 * Math.sin(-H.obj.rotation.y);
      const dx = tx - sx, dy = -(y - 1), dz = tz - sz;
      this.aim(H.beam, sx, y - 1, sz, dx, dy, dz, Math.hypot(dx, dy, dz), 4.5);
      H.spot.position.set(tx, 0.1, tz); H.spot.scale.setScalar(6);
    }
    if (d > 760) { H.active = false; H.obj.visible = false; H.beam.visible = H.spot.visible = false; H.wait = 50 + Math.random() * 50; H.hold = undefined; }
  },

  // ---------- カラス ----------
  _crows(g) {
    const N = 16;
    const geo = makeGeo((b) => {
      b.box(null, -0.08, -0.06, -0.25, 0.08, 0.08, 0.25, { col: [1, 1, 1] });
      const w = new THREE.BufferGeometry(); w.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0.6, 0.05, 0.05, 0, 0, 0.15, 0, 0, -0.12, -0.6, 0.05, 0.05, 0, 0, 0.15], 3)); w.computeVertexNormals();
      b.geom(null, w, _m.identity(), { col: [1, 1, 1] });
      b.box(null, -0.04, 0.0, 0.24, 0.04, 0.05, 0.34, { col: [0.3, 0.25, 0.1] });
    });
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.6, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(geo, mat, N);
    m.frustumCulled = false; m.castShadow = true;
    g.add(m);
    this.crow = { m, N, birds: Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fly: 0, ph: Math.random() * 6 })), state: 'off', wait: 8, t: 0 };
  },
  scare(x, z, r) {
    const C = this.crow;
    if (!C || C.state !== 'sit') return;
    if ((C.cx - x) ** 2 + (C.cz - z) ** 2 > r * r) return;
    C.state = 'fly'; C.t = 0;
    for (const b of C.birds) { const a = Math.atan2(b.z - z, b.x - x) + (Math.random() - 0.5) * 1.2; b.vx = Math.cos(a) * (5 + Math.random() * 4); b.vz = Math.sin(a) * (5 + Math.random() * 4); b.vy = 5 + Math.random() * 4; b.fly = 1; }
    Events.emit('crows', { x: C.cx, z: C.cz });
  },
  _crowUpdate(dt, px, pz) {
    const C = this.crow;
    if (C.state === 'off') {
      if ((C.wait -= dt) > 0) return;
      // 主人公の 少し先に とまる(建物の中・水の上は さける)
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, d = 18 + Math.random() * 22, x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
        if (this.W.blockedAt(x, z, 3) || this.W.buildingAt(x, z)) continue;
        C.cx = x; C.cz = z; C.state = 'sit'; C.t = 0;
        for (const b of C.birds) { b.x = x + (Math.random() - 0.5) * 7; b.z = z + (Math.random() - 0.5) * 7; b.y = 0; b.fly = 0; b.r = Math.random() * 6; }
        break;
      }
      C.wait = 5;
      return;
    }
    C.t += dt;
    const near = (C.cx - px) ** 2 + (C.cz - pz) ** 2;
    if (C.state === 'sit' && near < 9 * 9) this.scare(px, pz, 20);
    if (C.state === 'sit' && near > 120 * 120) { C.state = 'off'; C.wait = 10; }
    for (let i = 0; i < C.N; i++) {
      const b = C.birds[i];
      let flap = 0;
      if (C.state === 'fly') {
        b.vy = Math.max(-1, b.vy - dt * 1.5); b.x += b.vx * dt; b.y += Math.max(0.5, b.vy) * dt; b.z += b.vz * dt;
        b.vx += Math.sin(C.t * 2 + i) * dt * 3; b.vz += Math.cos(C.t * 1.7 + i) * dt * 3;
        flap = Math.sin(C.t * 22 + b.ph);
        b.r = Math.atan2(b.vx, b.vz);
      } else {
        // つつく・はねる
        b.ph += dt; if (Math.random() < dt * 0.6) { b.x += (Math.random() - 0.5) * 0.6; b.z += (Math.random() - 0.5) * 0.6; b.r = Math.random() * 6; }
        b.y = Math.max(0, Math.sin(b.ph * 7) * 0.08) + 0.1;
      }
      _e.set(C.state === 'sit' ? Math.sin(b.ph * 5) * 0.3 : -0.2, b.r, 0); _q.setFromEuler(_e);
      _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(2, 2 * (1 + flap * 0.9), 2));
      C.m.setMatrixAt(i, _m);
    }
    C.m.instanceMatrix.needsUpdate = true;
    if (C.state === 'fly' && C.t > 9) { C.state = 'off'; C.wait = 18 + Math.random() * 20; for (let i = 0; i < C.N; i++) { C.m.setMatrixAt(i, _m.makeScale(0, 0, 0)); } C.m.instanceMatrix.needsUpdate = true; }
  },

  // ---------- 遠くの爆発(地平線のあたりで光って、煙が上がる) ----------
  _booms(g, M) {
    const mk = (col, blend) => new THREE.Sprite(new THREE.SpriteMaterial({ map: M._glowTex, color: col, transparent: true, depthWrite: false, blending: blend, fog: false }));
    this.boom = { t: 0, wait: 25 + Math.random() * 20, fl: mk(new THREE.Color(4, 1.8, 0.6), THREE.AdditiveBlending), sm: [0, 1, 2, 3].map(() => mk(new THREE.Color(0.09, 0.08, 0.08), THREE.NormalBlending)), on: false };
    for (const s of [this.boom.fl, ...this.boom.sm]) { s.visible = false; s.renderOrder = 9; g.add(s); }
  },
  _boomUpdate(dt) {
    const B = this.boom, cam = Engine.camera.position;
    if (!B.on) {
      if ((B.wait -= dt) > 0) return;
      const R = Math.min(330, (this.W._sky ? this.W._sky.fogFar || 280 : 280) - 10);
      const a = Math.random() * Math.PI * 2;
      B.x = cam.x + Math.cos(a) * R; B.z = cam.z + Math.sin(a) * R; B.t = 0; B.on = true;
      Events.emit('distantBoom', { x: B.x, z: B.z });
      return;
    }
    B.t += dt;
    const t = B.t;
    B.fl.visible = t < 1.2;
    if (B.fl.visible) { const k = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.05); B.fl.position.set(B.x, 6 + t * 6, B.z); B.fl.scale.setScalar(25 + t * 30); B.fl.material.opacity = k; }
    B.sm.forEach((s, i) => {
      const tt = t - i * 0.6;
      s.visible = tt > 0 && tt < 9;
      if (!s.visible) return;
      s.position.set(B.x + tt * 1.5, 8 + tt * 5 + i * 3, B.z + tt * 0.8); s.scale.setScalar(16 + tt * 6);
      s.material.opacity = Math.min(1, tt * 2) * Math.max(0, 1 - tt / 9) * 0.75;
    });
    if (t > 10) { B.on = false; B.wait = 22 + Math.random() * 35; for (const s of [B.fl, ...B.sm]) s.visible = false; }
  },

  // ---------- 電線の火花 ----------
  _sparks(dt, px, pz) {
    if (!FX) return;
    const L = this.W.sparkPoints;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if ((s.x - px) ** 2 + (s.z - pz) ** 2 > 60 * 60) continue;
      if ((s.t -= dt) > 0) continue;
      s.t = 0.6 + Math.random() * 3.5;
      const n = Math.random() < 0.3 ? 14 : 5;
      FX.burst({ x: s.x, y: s.y, z: s.z, count: n, color: 0xfff0a0, speed: 4, up: 1, life: 0.6, size: 0.06, grav: 14, intensity: 3 });
      if (n > 10 && FX.glow) FX.glow(s.x, s.y, s.z, 1.2, 0xbfd8ff, 3);
    }
  },

  // ---------- パトカーの赤と青(交互に光る) ----------
  _sirens(g) {
    const recs = this.W.props.filter((p) => p.kind === 'police');
    const geo = new THREE.BoxGeometry(0.76, 0.2, 0.62);
    const mk = (c) => { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: c, fog: false }), Math.max(1, recs.length)); m.frustumCulled = false; g.add(m); return m; };
    this.sir = { recs, r: mk(new THREE.Color(6, 0.3, 0.2)), b: mk(new THREE.Color(0.3, 0.6, 7)), t: 0 };
    recs.forEach((p, i) => {
      for (const [m, oz] of [[this.sir.r, -0.31], [this.sir.b, 0.31]]) {
        _q.setFromEuler(_e.set(0, p.rot, 0));
        _v.set(0, 1.56 * p.s, oz * p.s).applyQuaternion(_q);
        _m.compose(_p.set(p.x + _v.x, p.y + _v.y, p.z + _v.z), _q, _s.setScalar(p.s));
        m.setMatrixAt(i, _m);
      }
    });
    this.sir.r.count = this.sir.b.count = recs.length;
  },
  _sirenUpdate(dt) {
    const S = this.sir;
    S.t += dt;
    const ph = Math.floor(S.t * 5) % 2;
    S.r.visible = ph === 0; S.b.visible = ph === 1;
    if ((S._chk = (S._chk || 0) - dt) <= 0) {
      S._chk = 0.5;
      S.recs.forEach((p, i) => { if (p.state !== 0 && !p._sirOff) { p._sirOff = true; S.r.setMatrixAt(i, _m.makeScale(0, 0, 0)); S.b.setMatrixAt(i, _m); S.r.instanceMatrix.needsUpdate = S.b.instanceMatrix.needsUpdate = true; } });
    }
  },
};
