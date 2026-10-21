// 演出係: 火花・血しぶき・煙・爆発・弾の線(曳光弾)・地面の跡・光(点光源)。
// たくさん出すため、粒は1つの InstancedMesh にまとめて描く。
import * as THREE from 'three';
import { Engine } from './engine.js';

const MAXP = 3000;

export const FX = {
  _p: [],                 // 粒 {x,y,z,vx,vy,vz,life,max,size,r,g,b,grav,drag}
  _mesh: null,
  _tracers: [],
  _lines: null,

  init(scene) {
    const geo = new THREE.IcosahedronGeometry(0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this._mesh = new THREE.InstancedMesh(geo, mat, MAXP);
    this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._mesh.frustumCulled = false;
    this._mesh.count = 0;
    this._mesh.setColorAt(0, new THREE.Color());
    scene.add(this._mesh);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this._lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true }));
    this._lines.frustumCulled = false;
    scene.add(this._lines);
  },

  reset() { this._p.length = 0; this._tracers.length = 0; },

  // 粒をまとめて出す
  burst({ x, y = 1, z, count = 10, color = 0xffaa33, speed = 6, up = 2, life = 0.5, size = 0.15, grav = 9.8, drag = 1, dirX = 0, dirZ = 0, spread = 1 }) {
    _c.setHex(color);
    for (let i = 0; i < count && this._p.length < MAXP; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this._p.push({
        x, y, z,
        vx: Math.cos(a) * s * spread + dirX * speed, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s * spread + dirZ * speed,
        life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.8),
        r: _c.r, g: _c.g, b: _c.b, grav, drag,
      });
    }
  },

  blood(x, y, z, dirX = 0, dirZ = 0, amount = 1) {
    this.burst({ x, y, z, count: Math.round(10 * amount), color: 0x8a0a0a, speed: 4 * amount, up: 3, life: 0.7, size: 0.13, dirX: dirX * 0.6, dirZ: dirZ * 0.6 });
  },

  explosion(x, z, radius = 5) {
    this.burst({ x, y: 1, z, count: 60, color: 0xffaa22, speed: radius * 3, up: 6, life: 0.6, size: 0.45, grav: 2, drag: 3 });
    this.burst({ x, y: 1, z, count: 30, color: 0x444444, speed: radius * 1.2, up: 4, life: 1.2, size: 0.9, grav: -1, drag: 2 });
    Engine.shake(Math.min(1.2, radius / 6));
  },

  tracer(x0, y0, z0, x1, y1, z1, color = 0xffdd66, life = 0.06) {
    if (this._tracers.length < 600) this._tracers.push({ x0, y0, z0, x1, y1, z1, color, life, max: life });
  },

  update(dt) {
    const m = this._mesh;
    let n = 0;
    for (let i = this._p.length - 1; i >= 0; i--) {
      const p = this._p[i];
      p.life -= dt;
      if (p.life <= 0) { this._p[i] = this._p[this._p.length - 1]; this._p.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
    }
    for (const p of this._p) {
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      _mat.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      m.setMatrixAt(n, _mat);
      _c.setRGB(p.r, p.g, p.b);
      m.setColorAt(n, _c);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    const pos = this._lines.geometry.attributes.position, col = this._lines.geometry.attributes.color;
    let j = 0;
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const t = this._tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this._tracers.splice(i, 1); continue; }
      _c.setHex(t.color).multiplyScalar(3 * t.life / t.max);
      pos.setXYZ(j, t.x0, t.y0, t.z0); col.setXYZ(j, _c.r, _c.g, _c.b); j++;
      pos.setXYZ(j, t.x1, t.y1, t.z1); col.setXYZ(j, _c.r, _c.g, _c.b); j++;
    }
    this._lines.geometry.setDrawRange(0, j);
    pos.needsUpdate = true; col.needsUpdate = true;
  },
};

const _c = new THREE.Color(), _mat = new THREE.Matrix4();
