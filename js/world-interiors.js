// マップ係: 中に入れる大きな建物(モール・病院・警察署・スーパー・倉庫・工場・体育館・ガソリンスタンド・家・山小屋)。
// 入口は広い(4m 以上)ので、ゾンビの大群がなだれこむ。中は部屋・仕切り・家具(当たり判定あり)。
// 屋根は建物ごとのメッシュ。主人公が中に入ると World.update が消す(roofs)。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { Builder } from './world-build.js';
import { cutout } from './world-tex.js';
import { PROPS, placeTree } from './world-props.js';
import { pool, decal, lamp } from './world-town.js';

const DARKTOP = [0.12, 0.11, 0.1];
const LOW = 3.2;              // 壁の「いつも見える」高さ
const _m = new THREE.Matrix4();

export class Bld {
  constructor(ctx, o) {
    this.ctx = ctx;
    const { M } = ctx;
    Object.assign(this, { h: 6, y0: 0, t: 0.5, wall: M.plaster, wallCol: [1, 1, 1], skin: M.ribbon, skinCol: [1, 1, 1], floor: M.tile, floorCol: [1, 1, 1], roofCol: [0.8, 0.8, 0.8], small: false }, o);
    this.RB = new Builder(0);
    this.b = ctx.W.addBuildingInfo({ minX: this.x0, minZ: this.z0, maxX: this.x1, maxZ: this.z1, h: this.h, roof: null, roofs: [], name: this.name, small: this.small, zone: ctx.zoneAt((this.x0 + this.x1) / 2, (this.z0 + this.z1) / 2) });
    // 床
    ctx.B.box(this.floor, this.x0, 0, this.z0, this.x1, this.y0 + 0.05, this.z1, { skip: 'bnsew', col: this.floorCol });
    ctx.occupy(this.x0 - 2, this.z0 - 2, this.x1 + 2, this.z1 + 2);
    ctx.mapRect(this.x0, this.z0, this.x1, this.z1, this.small ? '#6a5a48' : '#7a6440');
  }

  // 外壁(doors: [{side:'N'|'S'|'E'|'W', at, w}])
  shell(doors) {
    const { x0, x1, z0, z1, t } = this;
    const g = (side) => doors.filter((d) => d.side === side).map((d) => [d.at, d.w]);
    this.wallX(z0 + t / 2, x0, x1, g('N'), -1);
    this.wallX(z1 - t / 2, x0, x1, g('S'), 1);
    this.wallZ(x0 + t / 2, z0 + t, z1 - t, g('W'), -1);
    this.wallZ(x1 - t / 2, z0 + t, z1 - t, g('E'), 1);
    this.doors = doors;
  }
  // x 方向の壁(z の位置)。gaps: [[中心, 幅], ...]。ext: 外側の向き(-1 北 / 1 南 / 0 中の壁)
  wallX(z, xa, xb, gaps = [], ext = 0, o = {}) { this._wall(true, z, xa, xb, gaps, ext, o); }
  wallZ(x, za, zb, gaps = [], ext = 0, o = {}) { this._wall(false, x, za, zb, gaps, ext, o); }
  // 壁は「下の帯」(0〜3.2m。いつも見える)と「上の帯」(屋根といっしょに、中に入ると消える)に分ける。
  // こうすると、中に入ったとき部屋の中がよく見える(当たり判定は床から天井まで)。
  _wall(alongX, c, a, b, gaps, ext, o) {
    const { ctx, t, RB } = this, { B } = ctx;
    const h = o.h || this.h, mat = o.mat || this.wall, col = o.col || this.wallCol;
    const lo = Math.min(h, LOW);
    const gs = gaps.map(([m, w]) => [m - w / 2, m + w / 2]).sort((p, q) => p[0] - q[0]);
    const segs = []; let s = a;
    for (const [g0, g1] of gs) { if (g0 > s) segs.push([s, Math.min(g0, b)]); s = Math.max(s, g1); }
    if (s < b) segs.push([s, b]);
    const box = (bld, p0, p1, y0, y1) => {
      if (alongX) bld.box(mat, p0, y0, c - t / 2, p1, y1, c + t / 2, { col, topCol: DARKTOP, s: [4, h] });
      else bld.box(mat, c - t / 2, y0, p0, c + t / 2, y1, p1, { col, topCol: DARKTOP, s: [4, h] });
      if (ext) this._skin(bld, alongX, c, p0, p1, y0, y1, ext);
    };
    for (const [p0, p1] of segs) {
      if (p1 - p0 < 0.05) continue;
      box(B, p0, p1, 0, lo);
      if (ext && h > lo) box(RB, p0, p1, lo, h);
      if (alongX) ctx.solid(p0, c - t / 2, p1, c + t / 2, h, this.b); else ctx.solid(c - t / 2, p0, c + t / 2, p1, h, this.b);
    }
    // 外壁の出入口の上のはり(上の帯)
    if (ext) {
      const lh = Math.max(lo, Math.min(h - 0.8, 4.4));
      for (const [g0, g1] of gs) {
        const p0 = Math.max(a, g0), p1 = Math.min(b, g1);
        if (p1 - p0 > 0.1 && h - lh > 0.2) box(RB, p0, p1, lh, h);
      }
    }
  }
  _skin(bld, alongX, c, p0, p1, y0, y1, ext) {
    const t = this.t, s = this.skinS || this.skin.userData.s || [12, 14];
    const hh = y1 - y0, w = p1 - p0;
    let uv;
    if (alongX) {
      uv = ext > 0 ? [p0 / s[0], y0 / s[1], p1 / s[0], y1 / s[1]] : [-p1 / s[0], y0 / s[1], -p0 / s[0], y1 / s[1]];
      bld.wall(this.skin, (p0 + p1) / 2, y0, c + ext * (t / 2 + 0.02), 0, ext, w, hh, { uv, col: this.skinCol });
    } else {
      uv = ext > 0 ? [-p1 / s[0], y0 / s[1], -p0 / s[0], y1 / s[1]] : [p0 / s[0], y0 / s[1], p1 / s[0], y1 / s[1]];
      bld.wall(this.skin, c + ext * (t / 2 + 0.02), y0, (p0 + p1) / 2, ext, 0, w, hh, { uv, col: this.skinCol });
    }
  }
  // 柱(下は いつも見える・上は屋根といっしょに消える)
  column(x, z, r, h, col, mat = null) {
    const { B, M } = this.ctx, m = mat || M.plain, lo = Math.min(h, LOW);
    B.box(m, x - r, 0, z - r, x + r, lo, z + r, { col, topCol: DARKTOP });
    if (h > lo) this.RB.box(m, x - r, lo, z - r, x + r, h, z + r, { col, skip: 'b' });
    this.ctx.solid(x - r, z - r, x + r, z + r, h, this.b);
  }
  prop(name, x, z, rot = 0, o = {}) { this.ctx.prop(name, x, z, rot, { y: this.y0, ...o }); }
  light(x, z, r = 6, col = [0.32, 0.34, 0.38]) { pool(this.ctx, x, z, r, col, this.y0 + 0.07); (this._lights || (this._lights = [])).push([x, z, r, col]); }
  paint(x, z, sx, sz, col) { this.ctx.B.flat(this.ctx.M.paint, x, this.y0 + 0.065, z, sx, sz, { col }); }
  // 入口の上の光る看板(外側)
  sign(side, at, w, col, y = null) {
    const { M } = this.ctx, B = this.RB, { x0, x1, z0, z1, t } = this;
    const yy = y ?? Math.min(this.h - 1.2, 4.6), hh = 0.9;
    if (side === 'S') B.box(M.glow, at - w / 2, yy, z1, at + w / 2, yy + hh, z1 + 0.15, { col });
    if (side === 'N') B.box(M.glow, at - w / 2, yy, z0 - 0.15, at + w / 2, yy + hh, z0, { col });
    if (side === 'E') B.box(M.glow, x1, yy, at - w / 2, x1 + 0.15, yy + hh, at + w / 2, { col });
    if (side === 'W') B.box(M.glow, x0 - 0.15, yy, at - w / 2, x0, yy + hh, at + w / 2, { col });
    void t;
  }
  // 平らな屋根(ふち・設備つき)
  flatRoof({ ac = 3, sky = 0, mat = null } = {}) {
    const { RB, x0, x1, z0, z1, h, ctx } = this, { M } = ctx;
    RB.box(mat || M.roof, x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.4, z1 + 0.3, { col: this.roofCol, s: [8, 8] });
    const pc = [0.5, 0.49, 0.47], H = h + 0.4;
    RB.box(M.plain, x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.7, z0, { col: pc }); RB.box(M.plain, x0 - 0.3, H, z1, x1 + 0.3, H + 0.7, z1 + 0.3, { col: pc });
    RB.box(M.plain, x0 - 0.3, H, z0, x0, H + 0.7, z1, { col: pc }); RB.box(M.plain, x1, H, z0, x1 + 0.3, H + 0.7, z1, { col: pc });
    const r = ctx.rnd, w = x1 - x0, d = z1 - z0;
    for (let k = 0; k < ac; k++) this.roofProp('ac', x0 + 3 + r() * (w - 6), z0 + 3 + r() * (d - 6), Math.floor(r() * 2) * Math.PI / 2);
    for (let k = 0; k < sky; k++) {   // 天窓
      const sx = x0 + (k + 1) * w / (sky + 1);
      RB.box(M.plain, sx - 1.5, H, z0 + 4, sx + 1.5, H + 0.5, z1 - 4, { col: [0.25, 0.32, 0.38] });
    }
  }
  roofProp(name, x, z, rot = 0, y = null, s = 1) {
    const P = PROPS[name];
    _m.makeRotationY(rot); if (s !== 1) _m.multiply(new THREE.Matrix4().makeScale(s, s, s)); _m.setPosition(x, y ?? this.h + 0.4, z);
    for (const part of P.parts) this.RB.geom(part.mat, part.geo, _m);
  }
  // 切妻屋根(棟は z 方向 / alongX なら x 方向)
  gableRoof({ pitch = 0.6, col = [0.45, 0.2, 0.15], over = 0.6, alongX = false, endCol = null } = {}) {
    const { RB, x0, x1, z0, z1, h, ctx } = this, { M } = ctx;
    const span = (alongX ? z1 - z0 : x1 - x0) / 2 + over, len = (alongX ? x1 - x0 : z1 - z0) + over * 2;
    const rise = span * Math.tan(pitch), slope = span / Math.cos(pitch);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const s of [-1, 1]) {
      const g = alongX ? new THREE.BoxGeometry(len, 0.35, slope) : new THREE.BoxGeometry(slope, 0.35, len);
      const e = alongX ? new THREE.Euler(-s * pitch, 0, 0) : new THREE.Euler(0, 0, s * pitch);
      _m.makeRotationFromEuler(e);
      const off = (span / 2);
      if (alongX) _m.setPosition(cx, h + rise / 2, cz + s * off); else _m.setPosition(cx - s * off, h + rise / 2, cz);
      RB.geom(M.plain, g, _m, { col });
    }
    // 両はしの三角
    const tri = new THREE.BufferGeometry();
    const sp = span - over;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-sp, 0, 0, sp, 0, 0, 0, rise * (sp / span), 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const ec = endCol || this.skinCol;
    for (const s of [-1, 1]) {
      if (alongX) { _m.makeRotationY(s > 0 ? Math.PI / 2 : -Math.PI / 2); _m.setPosition(s > 0 ? x1 : x0, h, cz); }
      else { _m.makeRotationY(s > 0 ? 0 : Math.PI); _m.setPosition(cx, h, s > 0 ? z1 : z0); }
      RB.geom(M.plain, tri, _m, { col: ec });
    }
    return h + rise;
  }
  // 天井(中から見上げたとき。下向きの板なので上からは見えない)と、天井の照明
  ceiling() {
    const { ctx, x0, x1, z0, z1, t } = this, CB = ctx.CB, M = ctx.M;
    const y = this.ceilH || this.h;
    CB.ceil(M.ceiling, x0 + t * 0.5, y - 0.02, z0 + t * 0.5, x1 - t * 0.5, z1 - t * 0.5, { col: this.ceilCol || [0.78, 0.77, 0.74] });
    for (const [x, z, r, c] of this._lights || []) {
      const w = Math.min(2.4, r * 0.35), k = 2.2 + (c[0] - c[2]) * 3;
      const col = [Math.max(1.2, k + c[0] * 2), Math.max(1.1, k + c[1] * 2), Math.max(1.0, k - 0.3 + c[2] * 2)];
      CB.ceil(M.glow, x - w / 2, y - 0.05, z - 0.18, x + w / 2, z + 0.18, { col });
    }
  }
  finish() {
    this.ceiling();
    const meshes = this.RB.finish(this.ctx.W.group);
    for (const m of meshes) {
      const isGlow = m.material.isMeshBasicMaterial;
      m.material = isGlow ? m.material.clone() : cutout(m.material.clone());
      m.material.transparent = true;
      m.userData.op = 1;
      m.castShadow = !isGlow; m.userData.noCast = isGlow;
      m.renderOrder = 0;
      this.b.roofs.push(m);
    }
    this.b.roof = this.b.roofs[0] || null;
    return this.b;
  }
}

export function genBuildings(ctx) {
  mall(ctx); hospital(ctx); police(ctx); supermarket(ctx); gasStation(ctx);
  warehouse(ctx); factory(ctx); gym(ctx);
}

const SIGN = { red: [3, 0.35, 0.25], blue: [0.3, 1.2, 3], green: [0.4, 2.8, 0.8], yellow: [3, 2.2, 0.4], pink: [3, 0.5, 1.8], white: [2.6, 2.6, 2.4] };

// ---------------- ショッピングモール ----------------
function mall(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: 'ショッピングモール', x0: 52, z0: -100, x1: 166, z1: -52, h: 8, y0: 0.15, skin: M.office, skinCol: [1, 0.95, 0.88], skinS: [12, 14], floor: M.tile, floorCol: [0.95, 0.94, 0.92], wallCol: [0.95, 0.93, 0.9], roofCol: [0.75, 0.75, 0.72] });
  B.shell([{ side: 'S', at: 80, w: 8 }, { side: 'S', at: 138, w: 8 }, { side: 'W', at: -76, w: 8 }, { side: 'E', at: -76, w: 8 }, { side: 'N', at: 109, w: 6 }]);
  B.sign('S', 80, 10, SIGN.pink); B.sign('S', 138, 10, SIGN.blue); B.sign('W', -76, 9, SIGN.yellow); B.sign('E', -76, 9, SIGN.yellow);
  // 北の店の列 z -100..-87
  const nParts = [66, 80, 94, 106, 112, 124, 138, 152];
  for (const x of nParts) B.wallZ(x, -99.5, -87, [], 0, { h: 6 });
  const nShops = [[52, 66], [66, 80], [80, 94], [94, 106], [112, 124], [124, 138], [138, 152], [152, 166]];
  const front = (z, shops, corridors) => {
    const gaps = shops.map(([a, b]) => [(a + b) / 2, Math.min(7, b - a - 3)]);
    for (const [a, b] of corridors) gaps.push([(a + b) / 2, b - a]);
    B.wallX(z, 52.5, 165.5, gaps, 0, { h: 6 });
  };
  front(-87, nShops, [[106, 112]]);
  // 南の店の列 z -65..-52
  const sShops = [[52, 74], [86, 100], [100, 116], [116, 132], [144, 166]];
  for (const x of [74, 86, 100, 116, 132, 144]) B.wallZ(x, -65, -52.5, [], 0, { h: 6 });
  front(-65, sShops, [[74, 86], [132, 144]]);
  // 店の中身
  const shopFill = (a, b, za, zb, k, signZ) => {
    const cx = (a + b) / 2, w = b - a, type = k % 4;
    const sc = [SIGN.red, SIGN.blue, SIGN.green, SIGN.yellow, SIGN.pink][k % 5];
    ctx.B.box(M.glow, a + 0.6, 2.4, signZ < -80 ? -86.74 : -65.4, b - 0.6, 3.0, signZ < -80 ? -86.62 : -65.27, { col: sc });
    const back = za < -80 ? za + 1.2 : zb - 1.2, mid = (za + zb) / 2;
    if (type === 0) {         // 服屋・雑貨: 棚
      for (let x = a + 3.5; x < b - 3; x += 3.6) B.prop(k % 2 ? 'shelf' : 'shelf2', x, mid, Math.PI / 2, { s: 0.6 });
      B.prop('counter', cx, back, 0, { col: [0.9, 0.9, 0.9] });
    } else if (type === 1) {  // フードコート
      for (let x = a + 2.5; x < b - 2; x += 3.2) for (const dz of [-2.5, 2]) B.prop('table', x, mid + dz, 0);
      B.prop('counter', cx, back, 0, { col: [0.8, 0.3, 0.2] });
    } else if (type === 2) {  // 本屋・電気屋: 壁ぞいの棚
      if (w > 9) { B.prop('shelf', cx, back, 0, { s: Math.min(1.2, (w - 3) / 6) }); }
      B.prop('counter', cx, mid, 0, { col: [0.3, 0.35, 0.45] });
    } else {                  // 空き店舗: 段ボールと がれき
      for (let n = 0; n < 4; n++) B.prop('crate', a + 2 + rnd() * (w - 4), za + 2 + rnd() * (zb - za - 4), rnd() * 3, { col: [0.75, 0.6, 0.4] });
      ctx.prop('rubble', cx, mid, rnd() * 3, { y: 0.15, solid: false });
    }
    B.light(cx, mid, Math.min(6, w * 0.45), [0.42, 0.33, 0.22]);
  };
  nShops.forEach(([a, b], k) => shopFill(a, b, -99.5, -87, k, -87.4));
  sShops.forEach(([a, b], k) => shopFill(a, b, -65, -52.5, k + 2, -64.6));
  // 吹き抜け: 柱・エスカレーター・中央の植えこみ・ベンチ・売店
  for (let x = 60; x < 162; x += 14) for (const z of [-83.5, -68.5]) {
    if (Math.abs(x - 109) < 3) continue;
    B.column(x, z, 0.6, 8, [0.85, 0.82, 0.78]);
  }
  escalator(ctx, 90, -79.5, 12, 2.4, 0.15, 3.4);
  escalator(ctx, 116, -72.5, 12, 2.4, 0.15, 3.4, true);
  ctx.B.box(M.plain, 106, 0.15, -79, 112, 0.75, -73, { col: [0.6, 0.58, 0.55] });
  ctx.B.box(M.plain, 106.3, 0.75, -78.7, 111.7, 0.8, -73.3, { col: [0.2, 0.14, 0.08] });
  ctx.solid(106, -79, 112, -73, 1, B.b);
  for (const [dx, dz] of [[-1.5, -1], [1.4, 0.8], [0, 1.6], [1, -1.6]]) ctx.I.add('bush', 109 + dx, 0.8, -76 + dz, dx, 0.8);
  for (const [x, z, r] of [[70, -76, 0], [148, -76, 0], [128, -80, Math.PI], [92, -72, Math.PI]]) B.prop('bench', x, z, r);
  B.prop('counter', 62, -76, Math.PI / 2, { col: [0.7, 0.2, 0.3] });
  B.prop('counter', 156, -76, Math.PI / 2, { col: [0.2, 0.5, 0.7] });
  for (let x = 58; x < 164; x += 12) B.light(x, -76, 6.5, [0.3, 0.33, 0.38]);
  for (let k = 0; k < 14; k++) decal(ctx, [1, 2, 3, 9, 0][k % 5], 55 + rnd() * 108, -85 + rnd() * 18, 2 + rnd() * 2.5, rnd() * 6, 0.22);
  // 屋根: 天窓とエアコン、屋上看板
  B.flatRoof({ ac: 8, sky: 4 });
  for (let k = 0; k < 6; k++) B.RB.box(M.glow, 98 + k * 3.8, B.h + 1.1, -53.6, 100.8 + k * 3.8, B.h + 3.0, -53.3, { col: [1.6, 0.35, 1.0] });
  B.RB.box(M.plain, 96, B.h + 0.4, -53.8, 122, B.h + 3.4, -53.65, { col: [0.15, 0.15, 0.17] });
  B.finish();
  // まわり: 搬入口のトラック
  ctx.prop('truck', 60, -104, 0, { y: 0.15, col: [0.85, 0.85, 0.85] });
}

// エスカレーター(上の階へ行く見た目だけ。足もとは当たり判定)
function escalator(ctx, x, z, len, w, y0, rise, flip = false) {
  const { B, M } = ctx;
  const pitch = Math.atan2(rise, len);
  const g = new THREE.BoxGeometry(Math.hypot(len, rise), 0.5, w);
  _m.makeRotationZ(flip ? -pitch : pitch); _m.setPosition(x + len / 2, y0 + rise / 2, z);
  B.geom(M.plain, g, _m, { col: [0.55, 0.57, 0.6] });
  const g2 = new THREE.BoxGeometry(Math.hypot(len, rise), 0.9, 0.15);
  for (const s of [-1, 1]) { _m.makeRotationZ(flip ? -pitch : pitch); _m.setPosition(x + len / 2, y0 + rise / 2 + 0.7, z + s * (w / 2 + 0.05)); B.geom(M.plain, g2, _m, { col: [0.15, 0.15, 0.16] }); }
  ctx.solid(x, z - w / 2 - 0.15, x + len, z + w / 2 + 0.15, rise);
}

// ---------------- 病院 ----------------
function hospital(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: '病院', x0: -101, z0: -101, x1: -51, z1: -55, h: 6, y0: 0.15, skin: M.ribbon, skinCol: [1, 1, 1], floor: M.lino, floorCol: [0.9, 1, 0.95], wallCol: [0.95, 0.97, 0.96], roofCol: [0.8, 0.8, 0.78] });
  B.shell([{ side: 'S', at: -76, w: 8 }, { side: 'E', at: -82, w: 5 }, { side: 'W', at: -82, w: 5 }, { side: 'N', at: -76, w: 5 }]);
  // 南の入口の上に赤十字
  B.RB.box(M.glow, -77, 4.3, -54.85, -75, 5.9, -54.7, { col: SIGN.red }); B.RB.box(M.glow, -77.8, 4.8, -54.85, -74.2, 5.4, -54.7, { col: SIGN.red });
  // 壁
  B.wallX(-67, -100.5, -51.5, [[-90, 6], [-76, 6], [-62, 6]]);            // ロビーの北
  B.wallX(-79, -100.5, -51.5, [[-90, 6], [-97, 4], [-76, 6], [-62, 6], [-55, 4]]);  // 廊下の南
  B.wallX(-85, -100.5, -51.5, [[-94.5, 4], [-83.5, 4], [-76, 6], [-68.5, 4], [-57.5, 4]]); // 廊下の北
  for (const x of [-93, -87, -65, -59]) B.wallZ(x, -79, -67);
  for (const x of [-88, -79, -73, -64]) B.wallZ(x, -100.5, -85);
  // 病室(北): ベッド
  for (const [a, b] of [[-100.5, -88], [-88, -79], [-73, -64], [-64, -51.5]]) {
    for (let x = a + 1.6; x < b - 1.2; x += 2.6) B.prop('bed', x, -98.8, -Math.PI / 2);
    B.prop('cabinet', b - 1, -86.5, Math.PI);
    B.light((a + b) / 2, -93, 5, [0.3, 0.36, 0.36]);
  }
  // 南の部屋 A・B: ベッド / ナースステーション
  for (const [a, b] of [[-100.5, -93], [-59, -51.5]]) { B.prop('bed', (a + b) / 2 - 1.5, -70, Math.PI / 2); B.prop('bed', (a + b) / 2 + 1.8, -70, Math.PI / 2); B.light((a + b) / 2, -73, 4); }
  B.prop('counter', -80, -73, Math.PI / 2, { col: [0.85, 0.9, 0.95] }); B.prop('counter', -72, -73, Math.PI / 2, { col: [0.85, 0.9, 0.95] });
  B.prop('desk', -84, -76, 0); B.prop('desk', -68, -70, Math.PI);
  B.light(-76, -73, 6, [0.32, 0.38, 0.4]);
  // 廊下: ストレッチャー
  for (const x of [-98, -85, -66, -54]) B.prop('bed', x, -83.7, 0);
  for (let x = -98; x < -52; x += 8) B.light(x, -82, 4.5, [0.32, 0.38, 0.4]);
  // ロビー: 受付・待合いす
  B.prop('counter', -76, -64.8, 0, { col: [0.85, 0.9, 0.95] });
  for (const x of [-96, -91, -61, -56]) for (const z of [-62, -59]) B.prop('bench', x, z, Math.PI);
  B.prop('planter', -98.5, -57, 0); B.prop('planter', -53.5, -57, 0);
  B.light(-88, -61, 6); B.light(-64, -61, 6);
  for (let k = 0; k < 12; k++) decal(ctx, [1, 2, 3, 3, 9][k % 5], -99 + rnd() * 46, -99 + rnd() * 42, 1.6 + rnd() * 2.5, rnd() * 6, 0.22);
  // 屋根: ヘリポートの H
  B.flatRoof({ ac: 4 });
  const H = B.h + 0.41;
  B.RB.box(M.plain, -82, H, -84, -70, H + 0.02, -72, { col: [0.25, 0.4, 0.3] });
  B.RB.box(M.plain, -79, H + 0.02, -81, -78, H + 0.04, -75, { col: [0.95, 0.95, 0.95] }); B.RB.box(M.plain, -74, H + 0.02, -81, -73, H + 0.04, -75, { col: [0.95, 0.95, 0.95] });
  B.RB.box(M.plain, -78, H + 0.02, -78.5, -74, H + 0.04, -77.5, { col: [0.95, 0.95, 0.95] });
  B.finish();
  ctx.prop('van', -88, -50.8, 0, { y: 0.15, col: [0.95, 0.95, 0.95] });   // 救急車
  ctx.B.box(M.glow, -88.6, 2.36, -51.4, -87.4, 2.5, -50.2, { col: SIGN.red });
}

// ---------------- 警察署 ----------------
function police(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: '警察署', x0: -100, z0: 52, x1: -52, z1: 96, h: 5.5, y0: 0.15, skin: M.apt, skinCol: [0.85, 0.88, 1], skinS: [12, 12], floor: M.tile, floorCol: [0.78, 0.84, 0.92], wallCol: [0.9, 0.92, 0.95], roofCol: [0.6, 0.62, 0.65] });
  B.shell([{ side: 'N', at: -76, w: 6 }, { side: 'W', at: 74, w: 5 }, { side: 'E', at: 74, w: 5 }]);
  B.sign('N', -76, 8, SIGN.blue);
  B.wallX(64, -99.5, -52.5, [[-90, 4], [-76, 4], [-62, 4]]);
  B.wallX(82, -99.5, -52.5, [[-76, 4], [-60, 4], [-92, 4]]);
  // ロビー: 受付カウンター(両わきは通れる)
  B.prop('counter', -80, 60.5, 0, { col: [0.35, 0.4, 0.55] }); B.prop('counter', -72, 60.5, 0, { col: [0.35, 0.4, 0.55] });
  for (const x of [-95, -90, -62, -57]) B.prop('bench', x, 55.5, 0);
  B.light(-76, 58, 6, [0.3, 0.34, 0.42]);
  // 事務所: 机の島(z 72..76 は東西の通り道)
  for (let x = -96; x < -55; x += 4.5) for (const z of [67.5, 79]) { if (Math.abs(x + 76) < 2.5) continue; B.prop('desk', x, z, z < 70 ? 0 : Math.PI); }
  for (let x = -98; x < -54; x += 2.2) if (rnd() < 0.5) B.prop('cabinet', x, 65.2, Math.PI, { solid: true });
  for (let x = -94; x < -54; x += 10) B.light(x, 73, 5, [0.32, 0.34, 0.4]);
  // 留置場: 鉄格子の部屋
  const cells = [[-99.5, -92], [-92, -84], [-68, -60], [-60, -52.5]];
  for (const [a, b] of cells) {
    B.wallZ(a === -99.5 ? -99.25 : a, 87, 95.5, [], 0, { h: 5.5 });
    for (let x = a + 0.2; x < b; x += 0.3) ctx.B.box(M.plain, x - 0.04, 0.15, 86.9, x + 0.04, 3.2, 87.0, { col: [0.2, 0.2, 0.22] });
    ctx.B.box(M.plain, a, 3.1, 86.85, b, 3.25, 87.05, { col: [0.2, 0.2, 0.22] });
    ctx.solid(a, 86.8, b, 87.1, 3.2, B.b);
    B.prop('bench', (a + b) / 2, 94.6, Math.PI);
    B.light((a + b) / 2, 91, 3, [0.25, 0.25, 0.3]);
  }
  B.wallZ(-52, 87, 95.5, [], 0); B.wallZ(-84, 87, 95.5); B.wallZ(-68, 87, 95.5);
  // 中央は 武器庫(ロッカー)
  B.prop('locker', -76, 94.8, Math.PI); B.prop('table', -76, 90, 0);
  for (let x = -96; x < -55; x += 9) B.light(x, 84.5, 4, [0.3, 0.3, 0.36]);
  for (let k = 0; k < 8; k++) decal(ctx, [1, 2, 3, 9][k % 4], -98 + rnd() * 44, 54 + rnd() * 40, 1.6 + rnd() * 2, rnd() * 6, 0.22);
  B.flatRoof({ ac: 3 });
  B.roofProp('watertank', -60, 60);
  B.finish();
  // 外: パトカー
  ctx.prop('police', -88, 48.5, 0.15, { y: 0.15 }); ctx.prop('police', -64, 48.8, -0.1, { y: 0.15 });
  ctx.prop('barricade', -76, 47.6, 0, { y: 0.15 });
}

// ---------------- スーパー ----------------
function supermarket(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: 'スーパー', x0: 52, z0: 56, x1: 100, z1: 100, h: 6, y0: 0.15, skin: M.shop, skinCol: [1, 1, 1], skinS: [12, 6], floor: M.tile, floorCol: [0.98, 0.98, 0.95], wallCol: [0.96, 0.96, 0.93], roofCol: [0.7, 0.7, 0.68] });
  B.shell([{ side: 'N', at: 76, w: 8 }, { side: 'W', at: 78, w: 5 }, { side: 'E', at: 78, w: 5 }, { side: 'S', at: 64, w: 5 }]);
  B.sign('N', 76, 14, SIGN.green, 4.7);
  // レジ
  for (const x of [60, 66, 72, 80, 86, 92]) B.prop('counter', x, 62.5, Math.PI / 2, { col: [0.85, 0.85, 0.82] });
  // 棚の列(z 69..75 / 77..83)
  for (let x = 58; x < 97; x += 5.5) for (const z of [72, 80]) B.prop(((x + z) | 0) % 2 ? 'shelf' : 'shelf2', x, z, Math.PI / 2);
  // 青果(東)
  for (const z of [68, 74, 84]) { ctx.B.box(M.plain, 95.5, 0.15, z - 2, 98.5, 0.9, z + 2, { col: [0.45, 0.32, 0.2] }); ctx.B.box(M.plain, 95.7, 0.9, z - 1.8, 98.3, 1.05, z + 1.8, { col: [[0.8, 0.15, 0.1], [0.9, 0.6, 0.1], [0.3, 0.6, 0.15]][z % 3] }); ctx.solid(95.5, z - 2, 98.5, z + 2, 1, B.b); }
  // 冷蔵ケース(北壁ぞい・光る)
  ctx.B.box(M.plain, 53, 0.15, 87, 55.5, 2.2, 89.5, { col: [0.8, 0.82, 0.85] });
  B.wallX(90, 52.5, 99.5, [[60, 4], [76, 5], [92, 4]]);
  // 倉庫(南)
  B.prop('rack', 82, 98, 0); B.prop('forklift', 70, 95, 0.4);
  for (let k = 0; k < 8; k++) B.prop(k % 3 ? 'crate' : 'pallet', 55 + rnd() * 10, 92 + rnd() * 6, rnd() * 3, { col: [0.8, 0.65, 0.45] });
  for (let x = 58; x < 98; x += 10) for (const z of [66, 76, 86]) B.light(x, z, 5, [0.34, 0.36, 0.36]);
  for (let k = 0; k < 10; k++) decal(ctx, [1, 2, 9, 9, 0][k % 5], 54 + rnd() * 44, 58 + rnd() * 40, 1.6 + rnd() * 2, rnd() * 6, 0.22);
  B.flatRoof({ ac: 4 });
  B.finish();
  // 前の カート置き場・車
  ctx.prop('sedan', 64, 51, 0.1, { y: 0.15, col: [0.6, 0.1, 0.1] });
}

// 教会は 第4弾で 寺町の「本堂」になった(world-dgen2.js の templeHall)

// ---------------- ガソリンスタンド ----------------
function gasStation(ctx) {
  const { M, B: CB, rnd } = ctx;
  const y0 = 0.15;
  // 屋根(キャノピー): 下に入ると消える
  const can = { minX: 124, minZ: 124, maxX: 156, maxZ: 144, h: 5.6, roofs: [], roof: null, name: 'ガソリンスタンド', small: false };
  ctx.W.addBuildingInfo(can);
  const RB = new Builder(0);
  RB.box(M.plain, 123, 5.6, 123, 157, 6.6, 145, { col: [0.92, 0.92, 0.9], skip: '' });
  for (let x = 128; x < 154; x += 6) for (const z of [128, 134, 140]) ctx.CB.ceil(M.glow, x - 1.2, 5.57, z - 0.3, x + 1.2, z + 0.3, { col: [2.6, 2.6, 2.4] });
  RB.box(M.plain, 122.9, 5.9, 122.9, 157.1, 6.4, 145.1, { col: [0.85, 0.15, 0.1], skip: 'tb' });
  RB.box(M.glow, 122.85, 6.45, 122.85, 157.15, 6.55, 145.15, { col: [3, 0.6, 0.3], skip: 'tb' });
  for (const m of RB.finish(ctx.W.group)) { const g = m.material.isMeshBasicMaterial; m.material = g ? m.material.clone() : cutout(m.material.clone()); m.material.transparent = true; m.userData.op = 1; m.userData.noCast = g; can.roofs.push(m); }
  can.roof = can.roofs[0];
  for (const [x, z] of [[126, 126], [154, 126], [126, 142], [154, 142]]) { CB.box(M.plain, x - 0.35, 0, z - 0.35, x + 0.35, 5.6, z + 0.35, { col: [0.9, 0.9, 0.88] }); ctx.solid(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 5.6); }
  for (const z of [130, 138]) {
    CB.box(M.plain, 128, y0, z - 0.7, 152, y0 + 0.2, z + 0.7, { col: [0.6, 0.6, 0.58] });
    for (const x of [132, 140, 148]) ctx.prop('pump', x, z, 0, { y: y0 + 0.2 });
    for (let x = 130; x < 152; x += 6) pool(ctx, x, z + 2, 5, [0.4, 0.42, 0.45], y0 + 0.03);
  }
  ctx.prop('sedan', 136, 134, Math.PI / 2 * 0 + 0.05, { y: y0, col: [0.13, 0.11, 0.1] });
  decal(ctx, 7, 136, 134, 8, 0.4, y0 + 0.02); decal(ctx, 0, 146, 141, 4, 0, y0 + 0.02);
  ctx.prop('van', 148, 127, 0, { y: y0, col: [0.2, 0.3, 0.6] });
  // 値段の看板(高い柱)
  CB.box(M.plain, 119.6, 0, 120.6, 120.4, 9, 121.4, { col: [0.5, 0.5, 0.5] }); ctx.solid(119.6, 120.6, 120.4, 121.4, 9);
  CB.box(M.glow, 118, 9, 120.8, 122, 12, 121.2, { col: [3, 0.7, 0.3] });
  ctx.mapRect(124, 124, 156, 144, '#8a6a4a');
  // 小さな店(中に入れる)
  const S = new Bld(ctx, { name: 'コンビニ', x0: 150, z0: 150, x1: 168, z1: 166, h: 4.5, y0, skin: M.shop, skinS: [12, 4.5], floor: M.tile, floorCol: [0.95, 0.95, 0.95], small: true, roofCol: [0.7, 0.7, 0.7] });
  S.shell([{ side: 'N', at: 159, w: 4.5 }, { side: 'W', at: 158, w: 4 }]);
  S.prop('shelf', 158, 157, Math.PI / 2, { s: 0.85 }); S.prop('shelf2', 162.5, 157, Math.PI / 2, { s: 0.85 });
  S.prop('counter', 154, 163.8, 0, { col: [0.85, 0.3, 0.2] });
  CB.box(M.plain, 166.6, 0.15, 152, 167.5, 2.1, 160, { col: [0.75, 0.78, 0.8] }); CB.box(M.glow, 166.55, 0.5, 152.2, 166.6, 1.9, 159.8, { col: [0.25, 0.45, 0.6], skip: 'tbnsew'.replace('w', '') });
  ctx.solid(166.6, 152, 167.5, 160, 2.1);
  S.light(159, 158, 5, [0.35, 0.38, 0.4]);
  S.flatRoof({ ac: 1 });
  S.finish();
  void rnd;
}

// ---------------- 倉庫 ----------------
function warehouse(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: '倉庫', x0: 205, z0: -135, x1: 300, z1: -70, h: 10, y0: 0, skin: M.metal, skinCol: [0.62, 0.68, 0.72], skinS: [6, 10], wall: M.metal, wallCol: [0.75, 0.75, 0.73], floor: M.floorC, floorCol: [0.92, 0.92, 0.9], roofCol: [0.55, 0.57, 0.6] });
  B.shell([{ side: 'S', at: 230, w: 10 }, { side: 'S', at: 275, w: 10 }, { side: 'W', at: -102, w: 10 }, { side: 'N', at: 252, w: 8 }, { side: 'E', at: -102, w: 8 }]);
  B.sign('S', 230, 4, SIGN.yellow, 7.2); B.sign('S', 275, 4, SIGN.yellow, 7.2);
  // 鉄の柱
  for (let x = 221; x < 299; x += 16) for (const z of [-119, -86]) {
    B.column(x, z, 0.4, 10, [0.55, 0.35, 0.15]);
  }
  // 北側: 棚の列(16m ごとに切れ目)
  for (const z of [-130.5, -124, -114]) for (let x = 211; x < 280; x += 17) { B.prop('rack', x + 4.2, z, 0); }
  // 南側: 積まれた箱・コンテナ・フォークリフト
  const cc = [[0.7, 0.2, 0.15], [0.15, 0.35, 0.6], [0.2, 0.5, 0.3], [0.8, 0.5, 0.1]];
  B.prop('container', 228, -94, 0, { col: cc[0] }); B.prop('container', 262, -92, Math.PI / 2, { col: cc[1] });
  B.prop('container', 228, -94, 0, { col: cc[2], y: 2.6, solid: false });
  for (let k = 0; k < 24; k++) {
    const x = 210 + rnd() * 86, z = -108 + rnd() * 34;
    if (Math.abs(z + 102) < 3.5 || Math.abs(x - 230) < 6 && z > -80 || Math.abs(x - 275) < 6 && z > -80) continue;
    if (!ctx.isFree(x, z, 1)) continue;
    const n = 1 + Math.floor(rnd() * 3);
    B.prop('crate', x, z, rnd() * 0.3, { stack: n, col: [0.85, 0.7, 0.5] });
  }
  for (let k = 0; k < 10; k++) { const x = 212 + rnd() * 80, z = -84 + rnd() * 10; if (ctx.isFree(x, z, 0.8)) B.prop('pallet', x, z, rnd() * 3, { col: [0.8, 0.65, 0.45] }); }
  B.prop('forklift', 245, -104, 0.5); B.prop('forklift', 285, -98, 2.2);
  // 事務所(北東のすみ)
  B.wallX(-120, 282, 299.5, [[288, 4]], 0, { h: 4 }); B.wallZ(282, -134.5, -120, [], 0, { h: 4 });
  B.prop('desk', 291, -130, 0); B.prop('desk', 295, -126, Math.PI); B.prop('cabinet', 298.5, -133, -Math.PI / 2);
  // 床の黄色い線
  for (const z of [-111, -97]) B.paint(252, z, 90, 0.2, [0.95, 0.75, 0.1]);
  for (let x = 212; x < 298; x += 24) decal(ctx, 11, x, -104.5, 2.5, 0, 0.07);
  for (let x = 213; x < 300; x += 16) for (const z of [-127, -102, -80]) B.light(x, z, 7, [0.3, 0.33, 0.36]);
  for (let k = 0; k < 14; k++) decal(ctx, [0, 1, 2, 10, 6][k % 5], 208 + rnd() * 88, -132 + rnd() * 58, 2 + rnd() * 2.5, rnd() * 6, 0.07);
  B.flatRoof({ ac: 4, sky: 5, mat: M.metal });
  B.finish();
}

// ---------------- 工場 ----------------
function factory(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: '工場', x0: 212, z0: 62, x1: 300, z1: 130, h: 9, y0: 0, skin: M.ribbon, skinCol: [0.85, 0.78, 0.7], wall: M.concrete, wallCol: [0.8, 0.78, 0.75], floor: M.floorC, floorCol: [0.85, 0.83, 0.78], roofCol: [0.5, 0.5, 0.5] });
  B.shell([{ side: 'W', at: 96, w: 8 }, { side: 'N', at: 256, w: 10 }, { side: 'S', at: 256, w: 6 }, { side: 'E', at: 96, w: 6 }]);
  B.sign('N', 256, 6, SIGN.white, 6.5);
  // 北の大部屋: ベルトコンベアと機械
  for (const z of [72, 84]) for (let x = 222; x < 296; x += 8.5) { if (Math.abs(x - 238) < 4 || Math.abs(x - 276) < 4) continue; B.prop('conveyor', x, z, 0); }
  for (let x = 224; x < 296; x += 11) { if (Math.abs(x - 238) < 5 || Math.abs(x - 276) < 5 || Math.abs(x - 256) < 6) continue; B.prop('machine', x, 66, 0, { col: [0.6, 0.75, 0.85] }); B.prop('machine', x + 4, 78, Math.PI, { col: [0.75, 0.7, 0.5] }); }
  for (let x = 222; x < 298; x += 12) for (const z of [70, 82, 94]) B.light(x, z, 6, [0.34, 0.33, 0.3]);
  B.paint(256, 90, 84, 0.25, [0.95, 0.75, 0.1]); B.paint(256, 99, 84, 0.25, [0.95, 0.75, 0.1]);
  // 南の部屋
  B.wallX(100, 212.5, 299.5, [[228, 5], [256, 6], [286, 5]]);
  B.wallZ(240, 100, 129.5, [[115, 4]]); B.wallZ(272, 100, 129.5, [[115, 4]]);
  // A: ボイラー室
  for (const [x, z] of [[220, 108], [220, 121], [232, 114]]) B.prop('watertank', x, z, 0, { s: 1.0 });
  ctx.B.box(M.plain, 213, 5, 105, 239, 5.6, 105.6, { col: [0.5, 0.25, 0.15] });
  B.light(226, 114, 6, [0.5, 0.3, 0.15]);
  // B: 資材置き場
  B.prop('rack', 256, 127.5, 0); B.prop('rack', 256, 104, 0);
  for (let k = 0; k < 10; k++) { const x = 244 + rnd() * 24, z = 108 + rnd() * 14; if (ctx.isFree(x, z, 1)) B.prop('crate', x, z, rnd() * 3, { col: [0.8, 0.65, 0.45] }); }
  B.light(256, 115, 6);
  // C: 休けい室
  B.prop('locker', 286, 129, Math.PI); B.prop('locker', 290.5, 129, Math.PI);
  B.prop('table', 280, 112, 0); B.prop('table', 290, 118, 0); B.prop('sofa', 296, 106, -Math.PI / 2, { col: [0.5, 0.25, 0.2] });
  B.light(286, 115, 6, [0.4, 0.33, 0.22]);
  for (let k = 0; k < 14; k++) decal(ctx, [0, 1, 2, 10, 6][k % 5], 214 + rnd() * 84, 64 + rnd() * 64, 2 + rnd() * 2.5, rnd() * 6, 0.07);
  B.flatRoof({ ac: 5, sky: 4 });
  B.finish();
  // 煙突(外。中に入れない・高い目じるし)
  ctx.B.geom(M.concrete, new THREE.CylinderGeometry(1.8, 2.6, 34, 12), _m.makeTranslation(305, 17, 66), { col: [0.6, 0.55, 0.52] });
  ctx.B.box(M.glow, 302.9, 33.5, 63.9, 307.1, 33.8, 68.1, { col: [3, 0.3, 0.2] });
  ctx.solid(302.4, 63.4, 307.6, 68.6, 34);
}

// ---------------- 学校の体育館 ----------------
function gym(ctx) {
  const { M, rnd } = ctx;
  const B = new Bld(ctx, { name: '体育館', x0: -176, z0: 200, x1: -124, z1: 236, h: 9, y0: 0, skin: M.apt, skinCol: [1, 0.95, 0.9], skinS: [12, 12], floor: M.woodFloor, floorCol: [0.95, 0.82, 0.66], wallCol: [0.95, 0.92, 0.85], roofCol: [0.35, 0.45, 0.55] });
  B.shell([{ side: 'N', at: -150, w: 6 }, { side: 'E', at: 218, w: 5 }, { side: 'W', at: 218, w: 5 }, { side: 'S', at: -150, w: 5 }]);
  // コートの線
  const w = [0.95, 0.95, 0.92], cx = -150, cz = 218;
  B.paint(cx, cz - 10, 40, 0.15, w); B.paint(cx, cz + 10, 40, 0.15, w); B.paint(cx - 20, cz, 0.15, 20, w); B.paint(cx + 20, cz, 0.15, 20, w); B.paint(cx, cz, 0.15, 20, w);
  for (let a = 0; a < 24; a++) { const t = a / 24 * Math.PI * 2; B.paint(cx + Math.cos(t) * 3.6, cz + Math.sin(t) * 3.6, 0.95, 0.15, w); }
  B.prop('hoop', -173, cz, Math.PI / 2); B.prop('hoop', -127, cz, -Math.PI / 2);
  B.prop('bleacher', -163, 203, Math.PI); B.prop('bleacher', -137, 203, Math.PI);
  for (let x = -170; x < -128; x += 10) B.light(x, cz, 7, [0.36, 0.34, 0.3]);
  for (let k = 0; k < 8; k++) decal(ctx, [1, 2, 3, 9][k % 4], -172 + rnd() * 44, 204 + rnd() * 30, 1.6 + rnd() * 2, rnd() * 6, 0.07);
  B.gableRoof({ pitch: 0.35, col: [0.3, 0.42, 0.55], alongX: true });
  B.finish();
}

// ---------------- 家(住宅街) ----------------
export function house(ctx, x0, z0, w, d, door, o = {}) {
  const { M, rnd } = ctx;
  const x1 = x0 + w, z1 = z0 + d;
  const wallC = o.col || [[0.95, 0.9, 0.8], [0.8, 0.85, 0.9], [0.9, 0.8, 0.75], [0.85, 0.9, 0.8]][Math.floor(rnd() * 4)];
  const roofC = o.roofCol || [[0.45, 0.2, 0.15], [0.25, 0.28, 0.32], [0.35, 0.3, 0.25], [0.2, 0.3, 0.25]][Math.floor(rnd() * 4)];
  if (!o.enter) {   // 中に入れない家: 箱 + 切妻屋根
    const h = 5.5;
    ctx.B.box(M.apt, x0, 0, z0, x1, h, z1, { col: wallC, s: [12, 12], uo: Math.floor(rnd() * 4) * 0.25, skip: 'bt' });
    const span = (d / 2) + 0.5, pitch = 0.6, rise = span * Math.tan(pitch), slope = span / Math.cos(pitch);
    for (const s of [-1, 1]) {
      _m.makeRotationX(-s * pitch); _m.setPosition((x0 + x1) / 2, h + rise / 2, (z0 + z1) / 2 + s * span / 2);
      ctx.B.geom(M.plain, new THREE.BoxGeometry(w + 1, 0.3, slope), _m, { col: roofC });
    }
    const tri = new THREE.BufferGeometry(), sp = d / 2;
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-sp, 0, 0, sp, 0, 0, 0, rise * (sp / span), 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    for (const s of [-1, 1]) { _m.makeRotationY(s > 0 ? Math.PI / 2 : -Math.PI / 2); _m.setPosition(s > 0 ? x1 : x0, h, (z0 + z1) / 2); ctx.B.geom(M.plain, tri, _m, { col: wallC }); }
    ctx.solid(x0, z0, x1, z1, h + rise);
    ctx.occupy(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
    ctx.mapRect(x0, z0, x1, z1, '#5a4a40');
    return;
  }
  const B = new Bld(ctx, { name: '民家', x0, z0, x1, z1, h: 4, y0: 0, skin: M.apt, skinCol: wallC, skinS: [12, 12], floor: M.woodFloor, floorCol: [0.9, 0.8, 0.65], wallCol: [0.95, 0.92, 0.85], small: true });
  // 入口は左の部屋(表)と右の部屋(裏)。まん中の仕切りにも広い出入口
  const doors = [{ side: door, at: x0 + w * 0.25, w: 3.6 }];
  if (o.back) doors.push({ side: { N: 'S', S: 'N' }[door] || 'S', at: x0 + w * 0.75, w: 3.6 });
  B.shell(doors);
  const mx = x0 + w / 2, cz = (z0 + z1) / 2;
  B.wallZ(mx, z0 + 0.5, z1 - 0.5, [[cz, 3.6]]);
  B.prop('sofa', x0 + 0.9, cz, Math.PI / 2, { col: [0.5, 0.3, 0.25] }); B.prop('table', x0 + w * 0.25 + 0.3, cz, 0);
  B.prop('bed', x1 - 0.9, cz, Math.PI / 2); B.prop('cabinet', mx + 1.2, door === 'N' ? z1 - 0.9 : z0 + 0.9, 0);
  B.light(x0 + w / 4, (z0 + z1) / 2, 3.5, [0.45, 0.33, 0.2]); B.light(x1 - w / 4, (z0 + z1) / 2, 3.5, [0.45, 0.33, 0.2]);
  B.gableRoof({ pitch: 0.6, col: roofC, alongX: true });
  B.finish();
  void lamp;
}

// ---------------- 山小屋(森) ----------------
export function cabin(ctx, x0, z0) {
  const { M } = ctx;
  const B = new Bld(ctx, { name: '山小屋', x0, z0, x1: x0 + 14, z1: z0 + 10, h: 3.8, y0: 0, skin: M.wood, skinCol: [0.75, 0.55, 0.38], skinS: [4, 4], wall: M.wood, wallCol: [0.7, 0.52, 0.36], floor: M.woodFloor, floorCol: [0.8, 0.65, 0.5], small: true });
  B.shell([{ side: 'S', at: x0 + 7, w: 4 }, { side: 'E', at: z0 + 5, w: 4 }]);
  B.prop('table', x0 + 4, z0 + 5, 0); B.prop('bed', x0 + 11.5, z0 + 2, 0); B.prop('cabinet', x0 + 1, z0 + 1, 0);
  ctx.B.box(M.concrete, x0 + 0.5, 0, z0 + 7, x0 + 2.5, 2.2, z0 + 9.5, { col: [0.5, 0.48, 0.45] });
  ctx.B.box(M.glow, x0 + 2.5, 0.2, z0 + 7.6, x0 + 2.55, 0.9, z0 + 8.9, { col: [3, 1.2, 0.3] });
  ctx.solid(x0 + 0.5, z0 + 7, x0 + 2.5, z0 + 9.5, 2.2, B.b);
  B.light(x0 + 4, z0 + 8, 4, [0.6, 0.3, 0.1]);
  B.gableRoof({ pitch: 0.7, col: [0.3, 0.22, 0.16], alongX: true, endCol: [0.6, 0.45, 0.3] });
  B.finish();
}
