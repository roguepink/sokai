// マップ係: 地面・町・森・建物 と、ぶつかり判定(壁)・道さがし用の地図。
// ぶつかり判定は「上から見た 2D」。壁はすべて「床から天井まで」の箱(AABB)として登録する。
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { seeded } from './util.js';

const CELL = 8;           // ぶつかり判定の区画の大きさ(m)
const NAV = 1;            // 道さがし地図の1マス(m)

export const World = {
  group: new THREE.Group(),
  half: CONFIG.WORLD_SIZE / 2,
  boxes: [],              // {minX, minZ, maxX, maxZ, h, building}
  buildings: [],          // {minX, minZ, maxX, maxZ, roof: Object3D|null, name}
  grid: null, gw: 0,
  nav: null,              // { w, h, ox, oz, size, blocked: Uint8Array }
  _cur: null,             // 今いる建物

  init(scene) {
    scene.add(this.group);
    const n = Math.ceil(CONFIG.WORLD_SIZE / CELL);
    this.gw = n;
    this.grid = Array.from({ length: n * n }, () => []);
    this.generate();
    this.buildNav();
  },

  // ---------- マップを作る(ここを大きく育てる) ----------
  generate() {
    const rnd = seeded(12345);
    const S = CONFIG.WORLD_SIZE;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(S, S),
      new THREE.MeshStandardMaterial({ color: 0x3b4a2c, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // 見本: 中に入れる建物をいくつか
    this.addBuilding(-30, -40, 24, 18, { name: '倉庫', door: 'S' });
    this.addBuilding(25, -30, 16, 16, { name: 'コンビニ', door: 'W' });
    this.addBuilding(-10, 35, 30, 20, { name: '病院', door: 'N' });
    // まわりの壁(マップの外へ出ない)
    const h = this.half;
    this.addBox(-h - 2, -h - 2, h + 2, -h, { h: 4, mesh: false });
    this.addBox(-h - 2, h, h + 2, h + 2, { h: 4, mesh: false });
    this.addBox(-h - 2, -h, -h, h, { h: 4, mesh: false });
    this.addBox(h, -h, h + 2, h, { h: 4, mesh: false });
    // 木
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x24401f, roughness: 1 });
    for (let i = 0; i < 60; i++) {
      const x = (rnd() - 0.5) * 200, z = (rnd() - 0.5) * 200;
      if (this.blockedAt(x, z, 4)) continue;
      const t = new THREE.Mesh(new THREE.ConeGeometry(2, 7, 7), treeMat);
      t.position.set(x, 3.5, z); t.castShadow = true;
      this.group.add(t);
      this.addBox(x - 0.5, z - 0.5, x + 0.5, z + 0.5, { h: 7, mesh: false });
    }
  },

  // 中に入れる建物: 4面の壁(1面にドアの穴)+ 屋根(中に入ると消える)
  addBuilding(cx, cz, w, d, { name = '', door = 'S', h = 5, color = 0x6d6a66 } = {}) {
    const minX = cx - w / 2, maxX = cx + w / 2, minZ = cz - d / 2, maxZ = cz + d / 2, t = 0.4, gap = 4;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    const b = { minX, minZ, maxX, maxZ, roof: null, name };
    const wall = (x0, z0, x1, z1) => this.addBox(x0, z0, x1, z1, { h, mat, building: b });
    const sideX = (z, hasDoor) => {
      if (!hasDoor) return wall(minX, z - t / 2, maxX, z + t / 2);
      wall(minX, z - t / 2, cx - gap / 2, z + t / 2); wall(cx + gap / 2, z - t / 2, maxX, z + t / 2);
    };
    const sideZ = (x, hasDoor) => {
      if (!hasDoor) return wall(x - t / 2, minZ, x + t / 2, maxZ);
      wall(x - t / 2, minZ, x + t / 2, cz - gap / 2); wall(x - t / 2, cz + gap / 2, x + t / 2, maxZ);
    };
    sideX(minZ, door === 'N'); sideX(maxZ, door === 'S'); sideZ(minX, door === 'W'); sideZ(maxX, door === 'E');
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.02, cz); floor.receiveShadow = true;
    this.group.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), new THREE.MeshStandardMaterial({ color: 0x3d3a38, roughness: 1, transparent: true }));
    roof.position.set(cx, h + 0.2, cz); roof.castShadow = true;
    this.group.add(roof);
    b.roof = roof;
    this.buildings.push(b);
    return b;
  },

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
    const c0 = this._cell(p.x - r, p.z - r), c1 = this._cell(p.x + r, p.z + r);
    let hit = false;
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = this.grid[gz * this.gw + gx];
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
  segmentHit(x0, z0, x1, z1) {
    const c0 = this._cell(Math.min(x0, x1), Math.min(z0, z1)), c1 = this._cell(Math.max(x0, x1), Math.max(z0, z1));
    const dx = x1 - x0, dz = z1 - z0;
    let best = 1;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = this.grid[gz * this.gw + gx];
      for (let k = 0; k < cell.length; k++) {
        const id = cell[k];
        if (seen.has(id)) continue; seen.add(id);
        const b = this.boxes[id];
        let tmin = 0, tmax = best;
        if (Math.abs(dx) < 1e-9) { if (x0 < b.minX || x0 > b.maxX) continue; }
        else { let a = (b.minX - x0) / dx, c = (b.maxX - x0) / dx; if (a > c) [a, c] = [c, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (Math.abs(dz) < 1e-9) { if (z0 < b.minZ || z0 > b.maxZ) continue; }
        else { let a = (b.minZ - z0) / dz, c = (b.maxZ - z0) / dz; if (a > c) [a, c] = [c, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
        if (tmin < best) best = tmin;
      }
    }
    return best;
  },

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
    for (const b of this.buildings) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return b;
    return null;
  },

  // ゾンビを出す場所: (cx,cz) から minD〜maxD 離れた、壁のない所
  spawnPoint(cx, cz, minD, maxD, tries = 12) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!this.blockedAt(x, z, 0.8)) return { x, z };
    }
    return null;
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
  },

  // 毎フレーム: 入っている建物の屋根を消す
  update(dt, player) {
    const b = this.buildingAt(player.pos.x, player.pos.z);
    for (const bb of this.buildings) {
      if (!bb.roof) continue;
      const want = bb === b ? 0 : 1;
      const m = bb.roof.material;
      if (m.opacity !== want) {
        m.opacity += Math.sign(want - m.opacity) * Math.min(Math.abs(want - m.opacity), dt * 5);
        bb.roof.visible = m.opacity > 0.02;
        bb.roof.castShadow = m.opacity > 0.5;
      }
    }
    this._cur = b;
  },

  get inside() { return this._cur; },
};
