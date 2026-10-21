// 操作係: 左のスティック(移動)・右のボタン(撃つ=押している間ずっと)・回転斬り・武器の切りかえ。
// スマホ(タッチ)と PC(キーボード WASD/矢印 + マウス/スペース)の両方。
// アドレスに #auto をつけると、自動で動いて撃つ(確認用・タイトル画面の見本)。
import { HASH } from './util.js';

export const Input = {
  move: { x: 0, z: 0 },     // 移動の向き(-1..1)。x = 右, z = 下(画面の手前)
  fire: false,              // 撃つボタンを押している間 true
  spin: false,              // 回転斬り(押した瞬間だけ true。使ったら consume)
  weaponDelta: 0,           // 武器の切りかえ(+1 / -1。使ったら 0 に)
  weaponSelect: -1,         // 番号で直接えらぶ(使ったら -1 に)
  aim: null,                // PC のマウスで狙う場所 {x, z}(画面→地面に直すのは main)。なければ自動で狙う
  mouse: null,              // 画面上のマウス位置 {x, y}
  look: { x: 0, y: 0 },     // 向きを変える量(px。肩越し・一人称で使う)。使ったら consumeLook
  view: false,              // 視点の切りかえボタン(押した瞬間だけ)
  auto: HASH.has('auto'),   // 自動操作
  enabled: false,           // プレイ中だけ true
  touchUsed: false,

  el: null,
  _keys: new Set(),
  _stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  _firePointer: null,
  _botT: 0, _botAng: 0,

  init(root) {
    this.el = buildControls(root);
    const stickZone = this.el.querySelector('.stick-zone');
    const knob = this.el.querySelector('.stick-knob');
    const base = this.el.querySelector('.stick-base');
    const R = 60; // スティックが動ける半径(px)

    // --- 左: スティック(さわった所が中心になる) ---
    stickZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this._mouseDown = true; return; }   // PC はクリック = 撃つ
      if (this._stick.id !== null) return;
      e.preventDefault();
      this.touchUsed = true;
      stickZone.setPointerCapture(e.pointerId);
      Object.assign(this._stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
      base.style.transform = `translate(${e.clientX - 70}px, ${e.clientY - 70}px)`;
      knob.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 32}px)`;
      this.el.classList.add('sticking');
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stick.id) return;
      let dx = e.clientX - this._stick.ox, dy = e.clientY - this._stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // 指が遠くへ行ったら、中心もついてくる(操作しやすい)
        this._stick.ox += dx * (1 - R / d); this._stick.oy += dy * (1 - R / d);
        dx *= R / d; dy *= R / d;
        base.style.transform = `translate(${this._stick.ox - 70}px, ${this._stick.oy - 70}px)`;
      }
      this._stick.x = dx / R; this._stick.y = dy / R;
      knob.style.transform = `translate(${this._stick.ox + dx - 32}px, ${this._stick.oy + dy - 32}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== this._stick.id) return;
      Object.assign(this._stick, { id: null, x: 0, y: 0 });
      this.el.classList.remove('sticking');
    };
    stickZone.addEventListener('pointerup', endStick);
    stickZone.addEventListener('pointercancel', endStick);

    // --- 右: ボタン類 ---
    const fireBtn = this.el.querySelector('.btn-fire');
    fireBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); fireBtn.setPointerCapture(e.pointerId);
      this._firePointer = e.pointerId; fireBtn.classList.add('down');
    });
    const endFire = (e) => { if (e.pointerId === this._firePointer) { this._firePointer = null; fireBtn.classList.remove('down'); } };
    fireBtn.addEventListener('pointerup', endFire);
    fireBtn.addEventListener('pointercancel', endFire);

    tapButton(this.el.querySelector('.btn-spin'), () => { this.spin = true; });
    tapButton(this.el.querySelector('.btn-view'), () => { this.view = true; });

    // --- 右半分: なぞると向きを変える(肩越し・一人称のとき) ---
    const lookZone = this.el.querySelector('.look-zone');
    let lookId = null, lx = 0, ly = 0;
    lookZone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { if (e.button === 0) this._mouseDown = true; return; }
      if (lookId !== null) return;
      e.preventDefault(); lookZone.setPointerCapture(e.pointerId);
      lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      this.look.x += e.clientX - lx; this.look.y += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    lookZone.addEventListener('pointerup', endLook); lookZone.addEventListener('pointercancel', endLook);
    // 撃つボタンを押したまま 指をすべらせても 向きを変えられる
    const fb = this.el.querySelector('.btn-fire');
    let fx = 0, fy = 0;
    fb.addEventListener('pointerdown', (e) => { fx = e.clientX; fy = e.clientY; });
    fb.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._firePointer) return;
      this.look.x += e.clientX - fx; this.look.y += e.clientY - fy; fx = e.clientX; fy = e.clientY;
    });
    // PC: マウスを動かすと向きを変える(画面をクリックするとマウスが消える。Esc でもどる)
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
    tapButton(this.el.querySelector('.btn-next'), () => { this.weaponDelta = 1; });
    tapButton(this.el.querySelector('.btn-prev'), () => { this.weaponDelta = -1; });

    // --- 画面がずれたり大きくなったりしないように(2本指の拡大・長押しメニュー・引っぱって再読みこみ) ---
    const free = (t) => t && t.closest && t.closest('.overlay, .weapon-bar');
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !free(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- PC: キーボードとマウス ---
    // マウスだけの PC は 印をつける(武器の ◀▶ をかくし、ボタンにキーを書く)
    try {
      if (matchMedia('(hover: hover) and (pointer: fine)').matches && !(navigator.maxTouchPoints > 0)) document.body.classList.add('pc');
    } catch (e) {}
    // 画面のどこをクリックしても撃つ(ボタンの上は のぞく)
    root.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && !(e.target.closest && e.target.closest('button'))) this._mouseDown = true;
    });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this._keys.add(k);
      if (k === 'shift' || k === 'e') this.spin = true;
      if (k === 'v') this.view = true;
      if (k === 'q') this.weaponDelta = -1;
      if (k === 'r' || k === 'tab') { this.weaponDelta = 1; e.preventDefault(); }
      if (/^[0-9]$/.test(k)) this.weaponSelect = k === '0' ? 9 : +k - 1;
      if (k === ' ') e.preventDefault();
    });
    addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this._keys.clear(); this._firePointer = null; this._mouseDown = false; });
    const canvasArea = root;
    canvasArea.addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { this._mouseDown = false; });
    addEventListener('wheel', (e) => { if (this.enabled) this.weaponDelta = e.deltaY > 0 ? 1 : -1; }, { passive: true });
  },

  // フレームごとに main が呼ぶ
  update(dt) {
    if (this.auto) return this._bot(dt);
    const k = this._keys;
    let kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let kz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (kx || kz) { const l = Math.hypot(kx, kz); this.move.x = kx / l; this.move.z = kz / l; }
    else {
      // スティック: 少しだけ倒したときは無視(誤操作よけ)。倒すほど速い
      const sx = this._stick.x, sy = this._stick.y, l = Math.hypot(sx, sy);
      if (l < 0.15) { this.move.x = 0; this.move.z = 0; }
      else { const m = Math.min(1, (l - 0.15) / 0.75) / l; this.move.x = sx * m; this.move.z = sy * m; }
    }
    this.fire = this._firePointer !== null || k.has(' ') || k.has('j') || (this._mouseDown && !this.touchUsed);
  },

  consumeLook(out) { out.x = this.look.x; out.y = this.look.y; this.look.x = 0; this.look.y = 0; return out; },
  consumeView() { const v = this.view; this.view = false; return v; },
  consumeSpin() { const s = this.spin; this.spin = false; return s; },
  consumeWeaponDelta() { const d = this.weaponDelta; this.weaponDelta = 0; return d; },
  consumeWeaponSelect() { const s = this.weaponSelect; this.weaponSelect = -1; return s; },

  setVisible(v) { this.el.classList.toggle('hidden', !v); },

  // 自動操作(確認用・タイトルの見本): ぐるぐる歩きながら撃ちまくる
  _bot(dt) {
    this._botT += dt;
    this._botAng += dt * (0.35 + 0.25 * Math.sin(this._botT * 0.13));
    this.move.x = Math.cos(this._botAng); this.move.z = Math.sin(this._botAng);
    this.fire = true;
    if (Math.floor(this._botT / 5) !== Math.floor((this._botT - dt) / 5)) this.spin = true;
    if (Math.floor(this._botT / 7) !== Math.floor((this._botT - dt) / 7)) this.weaponDelta = 1;
  },
};

function tapButton(btn, fn) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    btn.classList.add('down'); fn();
    setTimeout(() => btn.classList.remove('down'), 120);
  });
}

function buildControls(root) {
  const el = document.createElement('div');
  el.id = 'controls';
  el.className = 'hidden';
  el.innerHTML = `
    <div class="look-zone"></div>
    <div class="stick-zone"></div>
    <div class="stick-base"></div>
    <div class="stick-knob"></div>
    <button class="btn btn-prev" type="button" aria-label="前の武器">◀</button>
    <button class="btn btn-next" type="button" aria-label="次の武器">▶</button>
    <button class="btn btn-view" type="button" aria-label="視点の切りかえ">👁<small>視点</small></button>
    <button class="btn btn-spin" type="button" aria-label="回転斬り"><span>回転<br>斬り</span></button>
    <button class="btn btn-fire" type="button" aria-label="撃つ"><span>撃つ</span></button>`;
  root.appendChild(el);
  return el;
}
