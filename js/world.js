// マップ係: 地面・町・森・建物 と、ぶつかり判定(壁)・道さがし用の地図。
// ぶつかり判定は「上から見た 2D」。壁はすべて「床から天井まで」の箱(AABB)として登録する。
// 見た目づくりは world-*.js に分けている:
//   world-tex.js  模様と材質 / world-build.js まとめ描きの道具 / world-props.js 小道具の形
//   world-town.js 町 / world-interiors.js 中に入れる建物 / world-nature.js 森・公園・住宅地・工場地帯
//   第4弾: 町は 地区に分かれる(world-district.js 地区の地図と空気 / world-dtex.js 壁と看板の絵 / world-dkit.js 建物の道具 /
//          world-dgen.js 繁華街・中華街・下町・門 / world-dgen2.js 寺町・オフィス街・崩壊地区・中に入れる店)
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { seeded } from './util.js';
import { Engine } from './engine.js';
import { makeMaterials, CUT } from './world-tex.js';
import { Builder, Instancer } from './world-build.js';
import { defineProps, placeProp } from './world-props.js';
import { genTown, TOWN } from './world-town.js';
import { genBuildings } from './world-interiors.js';
import { genNature, LAKES } from './world-nature.js';
import { Sky } from './world-sky.js';
import { Brk } from './world-break.js';
import { Life } from './world-life.js';
import { defineProps2 } from './world-props2.js';
import { outerZone, OUTER_NAMES, OUTER_GROUND, OUTER_MAP, OUT } from './world-outer.js';
import { Events } from './events.js';
import { makeDistrictMaterials } from './world-dtex.js';
import { defineDistrictProps } from './world-dkit.js';
import { District, districtAt, DNAME } from './world-district.js';

const CELL = 8;           // ぶつかり判定の区画の大きさ(m)
const NAV = 1;            // 道さがし地図の1マス(m)
const CHUNK = 100;        // 見た目をまとめる区画(m)
// 肩越し・一人称で 描く距離(m)。木は霧で かすむ 140m まで、草・小物は もっと近くだけ
const CLOSE_VIS = { sakura: 140, pine: 140, broad: 140, birch: 140, dead: 120, bush: 85, grass: 70, rock: 100, log: 90, grave: 100, cross: 100, hay: 110, corn: 110 };
const OCC = 2;            // 「もう何か置いた」地図の1マス(m)
const MAP_PX = 1024;       // ミニマップの大きさ

export const World = {
  group: new THREE.Group(),
  half: CONFIG.WORLD_SIZE / 2,
  boxes: [],              // {minX, minZ, maxX, maxZ, h, building}
  buildings: [],          // {minX, minZ, maxX, maxZ, roof: Mesh|null, roofs: [Mesh], name, zone}
  grid: null, gw: 0,
  nav: null,              // { w, h, ox, oz, size, blocked: Uint8Array }
  comp: null,             // 道さがし地図の「つながっている広場」番号(0 = 壁)
  M: null,                // 材質
  _cur: null,             // 今いる建物
  _time: 0,

  init(scene) {
    scene.add(this.group);
    const n = Math.ceil(CONFIG.WORLD_SIZE / CELL);
    this.gw = n;
    this.grid = Array.from({ length: n * n }, () => []);
    const t0 = performance.now();
    this.generate();
    this.buildNav();
    this._buildComponents();
    this.genMs = Math.round(performance.now() - t0);
  },

  // ---------- マップを作る ----------
  generate() {
    const S = CONFIG.WORLD_SIZE, h = this.half;
    const q = Engine.quality;
    const M = this.M = makeMaterials(Engine.renderer, q);
    makeDistrictMaterials(M, Engine.renderer, q);
    const B = new Builder(CHUNK, h), I = new Instancer(CHUNK, h), CB = new Builder(CHUNK * 2, h), SB = new Builder(400, h);
    I.thin = q === 'low' ? 0.45 : q === 'mid' ? 0.8 : 1;
    // ミニマップ
    const mc = document.createElement('canvas'); mc.width = mc.height = MAP_PX;
    const mx = mc.getContext('2d');
    this._map = mc;
    const k = MAP_PX / S;
    const occ = new Uint8Array((S / OCC) * (S / OCC)), ow = S / OCC;
    const self = this;
    const ctx = {
      W: this, B, I, M, CB, SB, q, half: h, rnd: seeded(12345),
      // 壁(見た目は別に作る)
      solid(x0, z0, x1, z1, hh = 3, building = null) { return self.addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), { h: hh, mesh: false, building }); },
      mapRect(x0, z0, x1, z1, color) { mx.fillStyle = color; mx.fillRect((x0 + h) * k, (z0 + h) * k, Math.max(1, (x1 - x0) * k), Math.max(1, (z1 - z0) * k)); },
      mapCircle(x, z, r, color, sx = 1, sz = 1) { mx.fillStyle = color; mx.beginPath(); mx.ellipse((x + h) * k, (z + h) * k, r * sx * k, r * sz * k, 0, 0, 7); mx.fill(); },
      mapLine(x0, z0, x1, z1, w, color) { mx.strokeStyle = color; mx.lineWidth = Math.max(1, w * k); mx.beginPath(); mx.moveTo((x0 + h) * k, (z0 + h) * k); mx.lineTo((x1 + h) * k, (z1 + h) * k); mx.stroke(); },
      // 「ここはもう使った」(木や小物を置かない)
      occupy(x0, z0, x1, z1) {
        const a = Math.max(0, Math.floor((x0 + h) / OCC)), b = Math.min(ow - 1, Math.floor((x1 + h) / OCC));
        const c = Math.max(0, Math.floor((z0 + h) / OCC)), d = Math.min(ow - 1, Math.floor((z1 + h) / OCC));
        for (let z = c; z <= d; z++) for (let x = a; x <= b; x++) occ[z * ow + x] = 1;
      },
      isFree(x, z, r = 0) {
        const a = Math.max(0, Math.floor((x - r + h) / OCC)), b = Math.min(ow - 1, Math.floor((x + r + h) / OCC));
        const c = Math.max(0, Math.floor((z - r + h) / OCC)), d = Math.min(ow - 1, Math.floor((z + r + h) / OCC));
        for (let zz = c; zz <= d; zz++) for (let xx = a; xx <= b; xx++) if (occ[zz * ow + xx]) return false;
        return true;
      },
      prop(name, x, z, rot = 0, o) { return placeProp(ctx, name, x, z, rot, o); },
      zoneAt: (x, z) => self.zoneAt(x, z),
    };
    this._ctx = ctx;
    Brk.init(this);
    defineProps(ctx);
    defineProps2(ctx);
    defineDistrictProps(ctx);
    Sky.init(this, M);
    if (q !== 'low') this._embers(q === 'high' ? 420 : 260);
    this._ground(ctx, mx, k);
    genTown(ctx);
    genBuildings(ctx);
    genNature(ctx);
    // まわりの壁(マップの外へ出ない)
    this.addBox(-h - 2, -h - 2, h + 2, -h, { h: 4, mesh: false });
    this.addBox(-h - 2, h, h + 2, h + 2, { h: 4, mesh: false });
    this.addBox(-h - 2, -h, -h, h, { h: 4, mesh: false });
    this.addBox(h, -h, h + 2, h, { h: 4, mesh: false });
    B.finish(this.group);
    I.finish(this.group);
    CB.finish(this.group, { cast: false, recv: false });
    SB.finish(this.group, { cast: false });
    Brk.finish(this.group);
    this._sky = Sky;
    Life.init(this);
    District.init(this);
    // 建物の印をミニマップの上に
    for (const b of this.buildings) {
      if (b.small) continue;
      mx.strokeStyle = 'rgba(255,210,120,0.95)'; mx.lineWidth = 1.5;
      mx.strokeRect((b.minX + h) * k, (b.minZ + h) * k, (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    this._ctx = null;
  },

  // 空気中を舞う 火の粉と灰(動きはシェーダーの中だけ。毎フレームの計算なし)
  _embers(n) {
    const g = new THREE.BufferGeometry(), r = seeded(31337);
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); seed[i] = r(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const u = this._emberU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: 50 }, uAmt: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vA; varying float vK;
        void main() {
          vec3 B = vec3(64.0, 22.0, 64.0);
          vec3 p = position * B;
          float sp = 0.5 + aSeed * 0.9;
          p.y = mod(p.y + uTime * sp, B.y);
          p.x += uTime * (0.8 + aSeed * 0.6) + sin(uTime * 0.7 + aSeed * 40.0) * 1.2;
          p.z += cos(uTime * 0.5 + aSeed * 23.0) * 1.2;
          p.xz = mod(p.xz - uCenter.xz + B.xz * 0.5, B.xz) + uCenter.xz - B.xz * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vK = aSeed;
          gl_PointSize = min((aSeed > 0.62 ? 2.6 : 3.4) * uScale / max(1.0, -mv.z), uScale * 0.1);
          vA = smoothstep(0.0, 2.0, p.y) * (1.0 - smoothstep(14.0, 22.0, p.y)) * (0.6 + 0.4 * sin(uTime * 6.0 + aSeed * 90.0)) * smoothstep(5.0, 10.0, -mv.z);
        }`,
      fragmentShader: `uniform float uAmt; varying float vA; varying float vK;
        void main() {
          float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
          vec3 c = vK > 0.62 ? vec3(3.2, 1.3, 0.35) : vec3(0.42, 0.4, 0.4);
          gl_FragColor = vec4(c, min(1.0, a * vA * (vK > 0.62 ? 0.95 : 0.35) * uAmt));
        }`,
    });
    const pts = this._emberPts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 5;
    this.group.add(pts);
  },

  // 地面(区画ごとの板。場所によって色を変える)
  _ground(ctx, mx, k) {
    const { B, M } = ctx, h = this.half, G = 8;
    const nz = seeded(777);
    const noise = new Float32Array(101 * 101);
    for (let i = 0; i < noise.length; i++) noise[i] = nz();
    const colAt = (x, z) => {
      const zn = this.zoneAt(x, z);
      const ix = Math.round((x + h) / G) % 101, iz = Math.round((z + h) / G) % 101;
      const n = 0.82 + noise[iz * 101 + ix] * 0.36;
      if (OUTER_GROUND[zn]) { const c = OUTER_GROUND[zn]; return [c[0] * n, c[1] * n, c[2] * n]; }
      if (zn === 'forest') return [0.47 * n, 0.45 * n, 0.3 * n];
      if (zn === 'industrial') return [0.5 * n, 0.5 * n, 0.5 * n];
      if (zn === 'park' || zn === 'suburb') return [0.36 * n, 0.5 * n, 0.27 * n];
      return [0.5 * n, 0.48 * n, 0.42 * n];
    };
    const T = TOWN.ext;
    for (let z = -h; z < h; z += G) for (let x = -h; x < h; x += G) {
      if (x >= T[0] && x + G <= T[2] && z >= T[1] && z + G <= T[3]) continue;   // 町の中は道路が敷いてある
      if (x >= T[2] && x + G <= 400 && z >= -208 && z + G <= 208) continue;      // 工場地帯はコンクリート(world-zones.js)
      if (x >= OUT.SEA - 0.01 || (z >= OUT.river.z0 && z + G <= OUT.river.z1 && x < OUT.SEA)) continue;   // 海・川
      if (x >= OUT.harbor[0] - 4 && z >= OUT.harbor[1] && z + G <= OUT.harbor[3]) continue;                // 港はコンクリート
      const b = B.bucket(M.ground, x + G / 2, z + G / 2), s = M.ground.userData.s;
      const c0 = colAt(x, z + G), c1 = colAt(x + G, z + G), c2 = colAt(x + G, z), c3 = colAt(x, z);
      const base = b.v;
      b.p.push(x, 0, z + G, x + G, 0, z + G, x + G, 0, z, x, 0, z);
      b.n.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      b.u.push(x / s[0], -(z + G) / s[1], (x + G) / s[0], -(z + G) / s[1], (x + G) / s[0], -z / s[1], x / s[0], -z / s[1]);
      b.c.push(...c0, ...c1, ...c2, ...c3);
      b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
      b.v += 4;
    }
    // ミニマップの下地
    const S = CONFIG.WORLD_SIZE;
    for (let z = -h; z < h; z += 4) for (let x = -h; x < h; x += 4) {
      const zn = this.zoneAt(x + 2, z + 2);
      mx.fillStyle = OUTER_MAP[zn] ? OUTER_MAP[zn] : zn === 'forest' ? '#26361f' : zn === 'industrial' ? '#55524c' : zn === 'park' || zn === 'suburb' ? '#3f5a2c' : zn === 'lake' ? '#2d5a70' : '#3a3a3e';
      mx.fillRect((x + h) * k, (z + h) * k, 4 * k + 0.5, 4 * k + 0.5);
    }
    void S;
  },

  // 場所の種類: 'town' 町 / 'industrial' 工場地帯 / 'suburb' 住宅地 / 'park' 公園 / 'forest' 森 / 'lake' 湖
  zoneAt(x, z) {
    if (Math.abs(x) > 400 || Math.abs(z) > 400 || (z < OUT.river.z1 && z > OUT.river.z0)) { const o = outerZone(x, z); if (o) return o; }
    for (const L of LAKES) { const dx = (x - L.x) / L.rx, dz = (z - L.z) / L.rz; if (dx * dx + dz * dz < 1) return 'lake'; }
    const T = TOWN.ext;
    if (x >= T[0] && x <= T[2] && z >= T[1] && z <= T[3]) return 'town';
    if (x > T[2] && x <= 404 && z > -215 && z < 215) return 'industrial';
    if (x < T[0] && z > -150 && z < 290) return 'suburb';
    if (z > T[3] && Math.abs(x) <= T[2] && z < 372) return 'park';
    return 'forest';
  },
  // 町の中の地区: 'plaza' 中央広場 / 'neon' ネオン繁華街 / 'china' 中華街 / 'shita' 下町商店街 / 'temple' 寺町 / 'office' オフィス街 / 'ruins' 崩壊地区。町の外は null
  districtAt(x, z) { return districtAt(x, z); },
  get district() { return District.cur; },
  // 場所の名前(画面に出す用)
  zoneName(x, z) {
    const b = this.buildingAt(x, z);
    if (b && b.name) return b.name;
    const zn = this.zoneAt(x, z);
    if (zn === 'town') { const d = districtAt(x, z); if (d) return DNAME[d]; }
    return OUTER_NAMES[zn] || { town: 'ダウンタウン', industrial: '工場地帯', suburb: '住宅街', park: '公園', forest: '森', lake: '湖' }[zn] || '';
  },
  // 上から見た地図(北が上、マップ全体)。UI のミニマップ用。1px = WORLD_SIZE/512 m
  minimapImage() { return this._map; },

  // 中に入れる建物を登録する(壁・床は world-interiors.js が作る)。roofs = 中に入ると消える屋根のメッシュ
  addBuildingInfo(b) { this.buildings.push(b); return b; },
  // 主人公が test(x,z) の所にいる間、材質(mats)を うすくする(高架の下など)
  faders: [],
  // 動く景色(観覧車・サーチライト …)。world-life.js が動かす
  spinners: [],
  addSpinner(s) { this.spinners.push(s); return s; },
  // ずっと燃えている火(墜落機など)
  addFire(x, y, z, size = 1, life = 9e9) { Brk.addFire(x, y, z, size, life); },
  // その場所に ただよう霧(墓地など)
  mists: [],
  addMist(x, z, r) { this.mists.push({ x, z, r }); },
  localMist(px, pz) { let m = 0; for (const o of this.mists) { const d = Math.hypot(px - o.x, pz - o.z); if (d < o.r) m = Math.max(m, 0.6 * Math.min(1, (o.r - d) / 40)); } return m * (0.4 + 0.6 * (this.night || 0)); },
  // 電線の火花が出る所
  sparkPoints: [],
  addFader(mats, test, minOp = 0.15) { this.faders.push({ mats, test, minOp, op: 1 }); },

  // 壁(ぶつかる箱)を登録する。mesh: false なら見た目は作らない(見た目は別に作るとき)
  addBox(minX, minZ, maxX, maxZ, { h = 3, mat = null, mesh = true, building = null } = {}) {
    const box = { minX, minZ, maxX, maxZ, h, building };
    const i = this.boxes.push(box) - 1;
    const c0 = this._cell(minX, minZ), c1 = this._cell(maxX, maxZ);
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) this.grid[gz * this.gw + gx].push(i);
    if (mesh) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, h, maxZ - minZ), mat || new THREE.MeshStandardMaterial({ color: 0x777777 }));
      m.position.set((minX + maxX) / 2, h / 2, (minZ + maxZ) / 2);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
    }
    return box;
  },

  _cell(x, z) {
    const n = this.gw;
    return {
      x: Math.max(0, Math.min(n - 1, Math.floor((x + this.half) / CELL))),
      z: Math.max(0, Math.min(n - 1, Math.floor((z + this.half) / CELL))),
    };
  },

  // ---------- ぶつかり判定(ほかの係が使う) ----------
  // 円(位置 p={x,z}, 半径 r)を壁から押し出す。押し出したら true
  collideCircle(p, r) {
    const n = this.gw, hf = this.half;
    const gx0 = Math.max(0, Math.min(n - 1, Math.floor((p.x - r + hf) / CELL))), gx1 = Math.max(0, Math.min(n - 1, Math.floor((p.x + r + hf) / CELL)));
    const gz0 = Math.max(0, Math.min(n - 1, Math.floor((p.z - r + hf) / CELL))), gz1 = Math.max(0, Math.min(n - 1, Math.floor((p.z + r + hf) / CELL)));
    let hit = false;
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const cell = this.grid[gz * n + gx];
      for (let k = 0; k < cell.length; k++) {
        const b = this.boxes[cell[k]];
        const nx = p.x < b.minX ? b.minX : p.x > b.maxX ? b.maxX : p.x;
        const nz = p.z < b.minZ ? b.minZ : p.z > b.maxZ ? b.maxZ : p.z;
        let dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          p.x += (dx / d) * push; p.z += (dz / d) * push;
        } else {
          // 中心が箱の中: いちばん近い面へ出す
          const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) p.x = b.minX - r; else if (m === rr) p.x = b.maxX + r; else if (m === t) p.z = b.minZ - r; else p.z = b.maxZ + r;
        }
        hit = true;
      }
    }
    return hit;
  },

  // 線(弾の通り道)が壁に当たるか。当たった所までの割合 0..1 を返す(当たらなければ 1)
  // minH を渡すと、それより低い物(土のう・ベンチ・車など)は 飛びこえる(例: 1.6)
  segmentHit(x0, z0, x1, z1, minH = 0) {
    const c0 = this._cell(Math.min(x0, x1), Math.min(z0, z1)), c1 = this._cell(Math.max(x0, x1), Math.max(z0, z1));
    const dx = x1 - x0, dz = z1 - z0;
    let best = 1;
    const stamp = ++this._stamp;
    const seen = this._seenArr;
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = this.grid[gz * this.gw + gx];
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k];
        if (seen[id] === stamp) continue; seen[id] = stamp;
        const b = this.boxes[id];
        if (b.h < minH) continue;
        let tmin = 0, tmax = best;
        if (Math.abs(dx) < 1e-9) { if (x0 < b.minX || x0 > b.maxX) continue; }
        else { let a = (b.minX - x0) / dx, c = (b.maxX - x0) / dx; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (Math.abs(dz) < 1e-9) { if (z0 < b.minZ || z0 > b.maxZ) continue; }
        else { let a = (b.minZ - z0) / dz, c = (b.maxZ - z0) / dz; if (a > c) { const t = a; a = c; c = t; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (tmin < best) best = tmin;
      }
    }
    return best;
  },
  _stamp: 0,
  _seenArr: new Uint32Array(1),

  // その場所(半径 r)が壁にかかっているか
  blockedAt(x, z, r = 0) {
    if (Math.abs(x) > this.half - r || Math.abs(z) > this.half - r) return true;
    const c0 = this._cell(x - r, z - r), c1 = this._cell(x + r, z + r);
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = this.grid[gz * this.gw + gx];
      for (let k = 0; k < cell.length; k++) {
        const b = this.boxes[cell[k]];
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
      }
    }
    return false;
  },

  // 建物の中にいるなら、その建物を返す
  buildingAt(x, z) {
    const bs = this.buildings;
    for (let i = 0; i < bs.length; i++) { const b = bs[i]; if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b; }
    return null;
  },

  // ゾンビを出す場所: (cx,cz) から minD〜maxD 離れた、壁のない所(主人公と歩いてつながっている所だけ)
  // refX/refZ を渡すと「その場所(ふつうは主人公)と つながっている所」だけ
  spawnPoint(cx, cz, minD, maxD, tries = 12, refX = cx, refZ = cz) {
    let want = this._compAt(refX, refZ);
    if (!want) want = this._mainComp;
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.blockedAt(x, z, 0.8)) continue;
      if (this.comp && this._compAt(x, z) !== want) continue;
      return { x, z };
    }
    return null;
  },
  // 2 つの場所が 歩いてつながっているか(閉じた部屋・壁の中なら false)
  connected(x0, z0, x1, z1) {
    if (!this.comp) return true;
    const a = this._compAt(x0, z0), b = this._compAt(x1, z1);
    return a !== 0 && (a === b || b === 0);
  },
  _compAt(x, z) {
    const nv = this.nav; if (!nv || !this.comp) return 0;
    const ix = Math.floor((x - nv.ox) / nv.size), iz = Math.floor((z - nv.oz) / nv.size);
    if (ix < 0 || iz < 0 || ix >= nv.w || iz >= nv.h) return 0;
    return this.comp[iz * nv.w + ix];
  },

  // 道さがし用の地図(1m マス。壁のマスは 1)
  buildNav() {
    const w = Math.ceil(CONFIG.WORLD_SIZE / NAV);
    const blocked = new Uint8Array(w * w);
    for (const b of this.boxes) {
      const x0 = Math.max(0, Math.floor((b.minX - 0.35 + this.half) / NAV)), x1 = Math.min(w - 1, Math.floor((b.maxX + 0.35 + this.half) / NAV));
      const z0 = Math.max(0, Math.floor((b.minZ - 0.35 + this.half) / NAV)), z1 = Math.min(w - 1, Math.floor((b.maxZ + 0.35 + this.half) / NAV));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) blocked[z * w + x] = 1;
    }
    this.nav = { w, h: w, ox: -this.half, oz: -this.half, size: NAV, blocked };
    this._seenArr = new Uint32Array(this.boxes.length + 16);
  },

  // つながっている広場に番号をふる(閉じこめられた すき間に ゾンビを出さないため)
  _buildComponents() {
    const { w, blocked } = this.nav, N = w * w;
    const comp = new Int32Array(N), q = new Int32Array(N);
    let id = 0;
    for (let s = 0; s < N; s++) {
      if (blocked[s] || comp[s]) continue;
      id++; let qh = 0, qt = 0; q[qt++] = s; comp[s] = id;
      while (qh < qt) {
        const c = q[qh++], x = c % w;
        if (x > 0 && !blocked[c - 1] && !comp[c - 1]) { comp[c - 1] = id; q[qt++] = c - 1; }
        if (x < w - 1 && !blocked[c + 1] && !comp[c + 1]) { comp[c + 1] = id; q[qt++] = c + 1; }
        if (c >= w && !blocked[c - w] && !comp[c - w]) { comp[c - w] = id; q[qt++] = c - w; }
        if (c < N - w && !blocked[c + w] && !comp[c + w]) { comp[c + w] = id; q[qt++] = c + w; }
      }
    }
    this.comp = comp;
    this._mainComp = this._compAt(0, 0);
  },

  // 道さがし(流れの地図)は zombie-flow.js が nav を使って計算する(ここには持たない)

  // 毎フレーム: 入っている建物の屋根を消す(見下ろしのときだけ)・透かしの中心・水と炎のゆらぎ・空と天気・遠くの物を描かない
  update(dt, player) {
    this._time += dt;
    const px = player.pos.x, pz = player.pos.z;
    const b = this.buildingAt(px, pz);
    const top = Engine.viewMode === 'top';
    const bs = this.buildings;
    for (let i = 0; i < bs.length; i++) {
      const bb = bs[i];
      if (!bb.roofs) continue;
      // 見下ろし: 中に入ると屋根と上の壁が消える。肩越し・一人称: 屋根(天井)はそのまま。影だけ落とさない(中が暗くなりすぎないように)
      const want = bb === b && top ? 0 : 1;
      if (bb._op === undefined) bb._op = 1;
      const shadowOff = bb === b && !top;
      if (bb._op !== want || bb._sh !== shadowOff) {
        bb._op += Math.sign(want - bb._op) * Math.min(Math.abs(want - bb._op), dt * 5);
        bb._sh = shadowOff;
        for (let j = 0; j < bb.roofs.length; j++) {
          const r = bb.roofs[j];
          r.material.opacity = bb._op * (r.userData.op ?? 1);
          r.userData.off = bb._op <= 0.02;
          r.visible = !r.userData.off && !r.userData.culled;
          r.castShadow = bb._op > 0.5 && !r.userData.noCast && !shadowOff;
        }
      }
    }
    this._cur = b;
    for (let i = 0; i < this.faders.length; i++) {
      const f = this.faders[i], want = top && f.test(px, pz) ? f.minOp : 1;
      if (f.op !== want) {
        f.op += Math.sign(want - f.op) * Math.min(Math.abs(want - f.op), dt * 3);
        for (let j = 0; j < f.mats.length; j++) f.mats[j].opacity = f.op;
      }
    }
    // 透かし: 見下ろし = 主人公のまわりを丸く / 肩越し = 小さく(カメラと主人公の間だけ)/ 一人称 = なし
    const vm = Engine.viewMode;
    if (vm === 'fps') { CUT.pos.value.set(px, -9999, pz); CUT.nearF.value = 0.6; }
    else if (vm === 'tps') { CUT.pos.value.set(px, 1.2, pz); CUT.r.value = 0.13; CUT.rf.value = 0.16; CUT.nearF.value = 1.6; }
    else { CUT.pos.value.set(px, 1.0, pz); CUT.r.value = b ? 0.3 : 0.27; CUT.rf.value = 0.32; CUT.nearF.value = 9.5; }
    const M = this.M;
    if (M) {
      M.water.map.offset.x = (this._time * 0.012) % 1; M.water.map.offset.y = (this._time * 0.007) % 1;
      M.flame.opacity = 0.75 + Math.sin(this._time * 17) * 0.12 + Math.sin(this._time * 7.3) * 0.1;
    }
    if (this._emberU) {
      this._emberU.uTime.value = this._time % 1000;
      this._emberU.uCenter.value.set(px, 0, pz);
      this._emberU.uScale.value = (Engine.renderer ? Engine.renderer.domElement.height : 400) * 0.12;
    }
    Sky.update(dt, px, pz);
    Brk.update(dt, px, pz);
    Life.update(dt, px, pz);
    District.update(dt, px, pz);
    if (this._emberPts) this._emberPts.visible = this._emberU.uAmt.value > 0.02;
    if ((this._cullT -= dt) <= 0) { this._cullT = 0.15; this._cull(); }
  },

  // 霧の向こう(見えない所)の区画は描かない(描く回数を へらす)
  _cullT: 0,
  _cull() {
    const cam = Engine.camera.position, far = (Engine.scene.fog ? Engine.scene.fog.far : 300) + 6;
    const ch = this.group.children;
    if (!this._cullList) {
      this._cullList = [];
      for (const m of ch) {
        if (!m.isMesh || m.frustumCulled === false || !m.geometry || m.matrixAutoUpdate !== false) continue;   // 動く物は のぞく
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.isInstancedMesh ? (m.boundingSphere || (m.computeBoundingSphere(), m.boundingSphere)) : m.geometry.boundingSphere;
        if (!bs || bs.radius > 900) continue;
        const vis = (m.material && m.material.userData && m.material.userData.vis) || 1e9;
        // テスト係A: 肩越し・一人称では 遠くの木・草・小物の区画(霧で半分かすむ所)は描かない(描く回数を へらす)
        const nm = m.name || '', kind = nm.startsWith('inst:') ? nm.slice(5) : '';
        const cv = !kind ? vis : CLOSE_VIS[kind] || Math.min(vis, 150);
        this._cullList.push({ m, x: bs.center.x, z: bs.center.z, y: bs.center.y, r: bs.radius, hide: false, vis, cvis: Math.min(vis, cv) });
      }
    }
    const L = this._cullList, close = Engine.viewMode !== 'top';
    for (let i = 0; i < L.length; i++) {
      const o = L[i], dx = o.x - cam.x, dz = o.z - cam.z, dy = o.y - cam.y;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy) - o.r, v = close ? o.cvis : o.vis;
      const hide = d > (v < far ? v : far);
      if (hide !== o.hide) { o.hide = hide; o.m.userData.culled = hide; o.m.visible = !hide && !o.m.userData.off; }
    }
  },

  // ---------- こわせる物(武器係が 弾・爆発のたびに呼ぶ) ----------
  // 円(x,z,半径 r)にふれた 車・ドラム缶・ガラス・柵 … に amount のダメージ。opts.cause: 'explosion' などは よく効く。こわれた数を返す
  damage(x, z, r, amount, opts = {}) { return Brk.damage(x, z, r, amount, opts); },
  // 弾の通り道(線)で いちばん手前の こわせる物に当てる。当たった所の割合 0..1(なければ 1)。車など低い物にも当たる
  hitLine(x0, z0, x1, z1, amount, opts = {}) { return Brk.hitLine(x0, z0, x1, z1, amount, opts); },
  // その場所で爆発を起こす(ゾンビ・物にダメージ。イベント propExplode)
  explode(x, z, radius = 6, amount = 400, kind = 'world') { Brk.explode(x, z, radius, amount, kind); },
  get props() { return Brk.list; },
  get life() { return Life; },
  lightningTarget(px, pz) { return Brk.lightningTarget(px, pz); },
  lightningHit(x, z) { Brk.lightningHit(x, z); },

  // 壁(箱)を消す(こわれた物)。道さがし地図も その場所だけ直す
  _removeBox(box) {
    if (!box || box.dead) return;
    const { minX, minZ, maxX, maxZ } = box;
    box.dead = true; box.minX = box.maxX = box.minZ = box.maxZ = 1e7;
    const nv = this.nav; if (!nv) return;
    const w = nv.w, hf = this.half;
    const x0 = Math.max(0, Math.floor((minX - 0.35 + hf) / NAV)), x1 = Math.min(w - 1, Math.floor((maxX + 0.35 + hf) / NAV));
    const z0 = Math.max(0, Math.floor((minZ - 0.35 + hf) / NAV)), z1 = Math.min(w - 1, Math.floor((maxZ + 0.35 + hf) / NAV));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) nv.blocked[z * w + x] = 0;
    // まだ残っている壁を もう一度 書く
    const c0 = this._cell(minX - 1, minZ - 1), c1 = this._cell(maxX + 1, maxZ + 1);
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = this.grid[gz * this.gw + gx];
      for (let k = 0; k < cell.length; k++) {
        const b = this.boxes[cell[k]];
        if (b.dead) continue;
        const a0 = Math.max(x0, Math.floor((b.minX - 0.35 + hf) / NAV)), a1 = Math.min(x1, Math.floor((b.maxX + 0.35 + hf) / NAV));
        const b0 = Math.max(z0, Math.floor((b.minZ - 0.35 + hf) / NAV)), b1 = Math.min(z1, Math.floor((b.maxZ + 0.35 + hf) / NAV));
        for (let z = b0; z <= b1; z++) for (let x = a0; x <= a1; x++) nv.blocked[z * w + x] = 1;
      }
    }
    if (this.comp) { const id = this._compAt((minX + maxX) / 2 + 1.5, (minZ + maxZ) / 2) || this._mainComp; for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!nv.blocked[z * w + x] && !this.comp[z * w + x]) this.comp[z * w + x] = id; }
  },

  // ---------- 時間と天気(ほかの係も読める) ----------
  // timeOfDay: 0..1(0 = 昼 / 0.25 = 夕方 / 0.5 = 真夜中 / 0.75 = 夜明け)。weather: 'clear'|'rain'|'storm'|'fog'|'snow'|'ash'
  get timeOfDay() { return Sky.t; },
  get weather() { return Sky.weather; },
  get night() { return Sky.night; },          // 0 = 昼 … 1 = 夜
  get wet() { return Sky.wet; },
  // 太陽・月の向き(地面 → 光。長さ 1)。空の絵と同じ。engine.js が影の向きに使う
  get sunDir() { return Sky.U ? Sky.U.uSunDir.value : null; },
  get moonDir() { return Sky.U ? Sky.U.uMoonDir.value : null; },
  // 肩越し・一人称の 霧と描く距離に かける数(1 = そのまま)。スマホの 'mid' は 0.85(Sky.init で決める)
  get viewDistMul() { return Sky.viewDistMul; },
  set viewDistMul(v) { Sky.viewDistMul = Math.max(0.4, Math.min(1.5, +v || 1)); },
  setTime(t) { Sky.setTime(t); Sky.apply(0); },
  setWeather(w, instant = false) { Sky.setWeather(w, instant); },
  set timeSpeed(v) { Sky.speed = v; },
  get timeSpeed() { return Sky.speed; },
  strikeLightning(near = true) { const p = window.__game && window.__game.Player; Sky.strike(p ? p.pos.x : 0, p ? p.pos.z : 0, near); },

  get inside() { return this._cur; },
};

