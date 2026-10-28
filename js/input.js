// 操作係: 左のスティック(移動)・右のボタン(撃つ=押している間ずっと)・回転斬り・武器の切りかえ。
// スマホ(タッチ)と PC(キーボード WASD/矢印 + マウス)の両方。PC のスペースは 武器を順番に切りかえる(ノブさん 2026-10-28)。
// アドレスに #auto をつけると、自動で動いて撃つ(確認用・タイトル画面の見本)。
import { HASH } from './util.js';

// 指で向きを変える(肩越し・一人称)。左右だけ。上下は 決まった見やすい角度のまま
// 画面の横はばの 40% を なぞると 約 90°(ふつうの速さのとき)。速くなぞると 少し大きく回る(加速)
export const TURN = {
  WIDTH: 0.4,               // 90° 回るのに なぞる長さ(画面の横はばに対して)
  MIN_W: 560,               // 縦長の画面でも 回りすぎないように(この はばより せまい画面は この はばとして計算)
  DEAD: 8,                  // 撃つボタン: これだけ動かすまでは 回らない(押したときの ぶれ)
  ACC: 0.6,                 // 加速の強さ(0 = なし)
  EDGE: 40,                 // 画面の はしに 指が届いたら、そこで止めていても 回りつづける(はしからの px)
  EDGE_RATE: 2.2,           // そのときの いちばん速い回り方(ラジアン/秒。約 125°/秒)
  ASSIST_OFF: 0.35,         // なぞっている間 + この秒数は 武器の「吸いつき」で 向きを引っぱらない
  ASSIST_BACK: 0.6,         // そのあと この秒数で 吸いつきを もとの強さへ
};

export const Input = {
  move: { x: 0, z: 0 },     // 移動の向き(-1..1)。x = 右, z = 下(画面の手前)
  fire: false,              // 撃つボタンを押している間 true
  spin: false,              // 回転斬り(押した瞬間だけ true。使ったら consume)
  weaponDelta: 0,           // 武器の切りかえ(+1 / -1。使ったら 0 に)
  weaponSelect: -1,         // 番号で直接えらぶ(使ったら -1 に)
  aim: null,                // PC のマウスで狙う場所 {x, z}(画面→地面に直すのは main)。なければ自動で狙う
  mouse: null,              // 画面上のマウス位置 {x, y}
  look: { x: 0, y: 0 },     // (古い約束。今は いつも 0。指の向きは turn)
  turn: 0,                  // 指で向きを変える量(ラジアン。右 = +。速さの設定は かける前)。使ったら consumeTurn
  lookMouse: { x: 0, y: 0 },// マウス(ロック中)で向きを変える量(px)
  lookT: 0,                 // 最後に 向きを変えた時刻(performance.now)。自動で向きを合わせるのは しばらく さわっていないとき
  lookHeld: false,          // 右側を さわっている / 撃つボタンを なぞっている最中(自動で向きを合わせない)
  view: false,              // 視点の切りかえボタン(押した瞬間だけ)
  viewHold: false,          // 視点ボタンの長押し(視点の設定を開く)
  dash: false,              // ダッシュ(押した瞬間だけ)。すばやく 2 回 = ジャンプ叩きつけ
  slam: false,              // ジャンプ叩きつけ(PC の G キー)
  weaponGrid: false,        // 武器を ぜんぶ ならべる画面(PC の T キー)
  digitPress: false,        // 数字キーを押した(同じ数字を もう一度で 11〜・21〜。main が見る)
  auto: HASH.has('auto'),   // 自動操作
  enabled: false,           // プレイ中だけ true
  touchUsed: false,

  el: null,
  _keys: new Set(),
  _stick: { id: null, ox: 0, oy: 0, x: 0, y: 0 },
  _firePointer: null,       // マウスで 撃つボタンを押している
  _fireTouch: null,         // 指で 撃つボタンを押している(指の番号)
  _t: null, _finishAll: null,
  _botT: 0, _botAng: 0,

  init(root) {
    this.el = buildControls(root);
    const stickZone = this.el.querySelector('.stick-zone');
    const knob = this.el.querySelector('.stick-knob');
    const base = this.el.querySelector('.stick-base');
    const fireBtn = this.el.querySelector('.btn-fire');
    const lookZone = this.el.querySelector('.look-zone');
    const R = 60; // スティックが動ける半径(px)
    const st = this._stick;

    // ===== 指の流れ(タッチ)=====
    // 指 1 本ずつに「役目」をつけて(stick / fire / look)、その指が どこへ すべって行っても 最後まで追いかける。
    // ボタンの外へ出ても・ほかのボタンの上を通っても 役目は変わらない。
    // ふつうのスマホは touch イベント(identifier で指を区別)。touch がない機械だけ pointer イベントで同じことをする。
    const T = this._t = new Map();     // 指の番号 → { role, x, y, t, sx, drag }
    const stickStart = (id, x, y) => {
      if (st.id !== null) return false;
      this.touchUsed = true;
      Object.assign(st, { id, ox: x, oy: y, x: 0, y: 0 });
      base.style.transform = `translate(${x - 70}px, ${y - 70}px)`;
      knob.style.transform = `translate(${x - 32}px, ${y - 32}px)`;
      this.el.classList.add('sticking');
      return true;
    };
    const stickMove = (x, y) => {
      let dx = x - st.ox, dy = y - st.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // 指が遠くへ行ったら、中心もついてくる(操作しやすい)
        st.ox += dx * (1 - R / d); st.oy += dy * (1 - R / d);
        dx *= R / d; dy *= R / d;
        base.style.transform = `translate(${st.ox - 70}px, ${st.oy - 70}px)`;
      }
      st.x = dx / R; st.y = dy / R;
      knob.style.transform = `translate(${st.ox + dx - 32}px, ${st.oy + dy - 32}px)`;
    };
    const stickEnd = () => { Object.assign(st, { id: null, x: 0, y: 0 }); this.el.classList.remove('sticking'); };

    const begin = (role, id, x, y, t) => {
      if (T.has(id)) return false;
      if (role === 'stick') { if (!stickStart(id, x, y)) return false; }
      else if (role === 'fire') { if (this._fireTouch !== null) return false; this._fireTouch = id; fireBtn.classList.add('down'); }
      else if (role === 'look') this.lookT = performance.now();
      this.touchUsed = true;
      T.set(id, { role, x, y, t, sx: x, drag: role === 'look' });
      this._syncHeld();
      return true;
    };
    const moveTo = (id, x, y, t) => {
      const f = T.get(id); if (!f) return;
      if (f.role === 'stick') { stickMove(x, y); return; }
      // 撃つ・右側: 左右だけ 向きを変える(上下は使わない)
      let dx = x - f.x;
      if (!f.drag) {
        // 撃つボタンは 押したときの ぶれでは回らない(8px 動いてから)
        if (Math.abs(x - f.sx) < TURN.DEAD) return;
        f.drag = true; f.x = x; f.y = y; f.t = t; this._syncHeld(); return;
      }
      this._addTurn(dx, t - f.t);
      f.x = x; f.y = y; f.t = t;
    };
    const finish = (id) => {
      const f = T.get(id); if (!f) return;
      T.delete(id);
      if (f.role === 'stick' && st.id === id) stickEnd();
      if (f.role === 'fire' && this._fireTouch === id) { this._fireTouch = null; fireBtn.classList.remove('down'); }
      if (f.drag) this.lookT = performance.now();
      this._syncHeld();
    };
    // 指が消えたのに 終わりの知らせが来なかったとき(OS の操作で横取りされた など)の そうじ
    const prune = (touches) => {
      if (!touches) return;
      const alive = new Set();
      for (let i = 0; i < touches.length; i++) alive.add(touches[i].identifier);
      for (const id of [...T.keys()]) if (typeof id === 'number' && !alive.has(id)) finish(id);
    };
    this._finishAll = () => { for (const id of [...T.keys()]) finish(id); };

    const hasTouch = 'ontouchstart' in window;
    if (hasTouch) {
      const on = (el, role) => el.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();          // 文字の選択・ダブルタップ拡大・マウスのまね を止める
        prune(e.touches);
        for (const c of e.changedTouches) begin(role, c.identifier, c.clientX, c.clientY, e.timeStamp);
      }, { passive: false });
      on(stickZone, 'stick'); on(fireBtn, 'fire'); on(lookZone, 'look');
      addEventListener('touchmove', (e) => {
        for (const c of e.changedTouches) moveTo(c.identifier, c.clientX, c.clientY, e.timeStamp);
      }, { passive: true });
      const tEnd = (e) => { for (const c of e.changedTouches) finish(c.identifier); prune(e.touches); };
      addEventListener('touchend', tEnd, { passive: true });
      addEventListener('touchcancel', tEnd, { passive: true });
    }
    // pointer: マウス(PC)と、touch イベントがない機械の指・ペン
    const ptr = (el, role) => el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0) return;
        if (role === 'fire') { e.preventDefault(); this._firePointer = e.pointerId; fireBtn.classList.add('down'); }
        else this._mouseDown = true;                  // PC は 画面のどこをクリックしても 撃つ
        return;
      }
      if (hasTouch && e.pointerType === 'touch') return;   // 指は touch イベントのほうで
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      begin(role, 'p' + e.pointerId, e.clientX, e.clientY, e.timeStamp);
    });
    ptr(stickZone, 'stick'); ptr(fireBtn, 'fire'); ptr(lookZone, 'look');
    addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') moveTo('p' + e.pointerId, e.clientX, e.clientY, e.timeStamp); });
    const pEnd = (e) => {
      if (e.pointerType === 'mouse') { if (e.pointerId === this._firePointer) { this._firePointer = null; fireBtn.classList.remove('down'); } return; }
      finish('p' + e.pointerId);
    };
    addEventListener('pointerup', pEnd); addEventListener('pointercancel', pEnd);

    tapButton(this.el.querySelector('.btn-spin'), () => { this.spin = true; });
    // 視点ボタン: 短く押す = 切りかえ / 長押し = 視点の設定
    const vb = this.el.querySelector('.btn-view');
    let vt = 0, vtimer = 0;
    vb.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); vb.classList.add('down');
      vt = performance.now(); clearTimeout(vtimer);
      vtimer = setTimeout(() => { vt = 0; vb.classList.remove('down'); this.viewHold = true; }, 480);
    });
    const vEnd = () => { clearTimeout(vtimer); vb.classList.remove('down'); if (vt) { vt = 0; this.view = true; } };
    vb.addEventListener('pointerup', vEnd);
    vb.addEventListener('pointercancel', () => { clearTimeout(vtimer); vt = 0; vb.classList.remove('down'); });
    tapButton(this.el.querySelector('.btn-dash'), () => { this.dash = true; });

    // PC: マウスを動かすと向きを変える(画面をクリックするとマウスが消える。Esc でもどる)
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) { this.lookMouse.x += e.movementX; this.lookMouse.y += e.movementY; this.lookT = performance.now(); }
    });
    tapButton(this.el.querySelector('.btn-next'), () => { this.weaponDelta = 1; });
    tapButton(this.el.querySelector('.btn-prev'), () => { this.weaponDelta = -1; });

    // --- 画面がずれたり大きくなったりしないように(2本指の拡大・長押しメニュー・引っぱって再読みこみ) ---
    const free = (t) => t && t.closest && t.closest('.overlay, .weapon-bar');
    document.addEventListener('touchmove', (e) => { if (e.cancelable && (e.touches.length > 1 || !free(e.target))) e.preventDefault(); }, { passive: false });
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
    // PC: 右クリック = ダッシュ(すばやく2回で 叩きつけ)。いちばんよく使う大技なので マウスだけで出せるように(ノブさん 2026-10-28)
    addEventListener('mousedown', (e) => { if (e.button === 2 && this.enabled !== false) { this.dash = true; e.preventDefault(); } });
    addEventListener('contextmenu', (e) => { if (!(e.target.closest && e.target.closest('input, textarea'))) e.preventDefault(); });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this._keys.add(k);
      if (k === 'shift' || k === 'e') this.spin = true;
      if (k === 'v') this.view = true;
      if (k === 'b') this.viewHold = true;
      if (k === 'f' || k === 'c') this.dash = true;
      if (k === 'g') this.slam = true;
      if (k === 'q') this.weaponDelta = -1;
      if (k === 'r' || k === 'tab') { this.weaponDelta = 1; e.preventDefault(); }
      if (k === 't') this.weaponGrid = true;
      if (/^[0-9]$/.test(k)) { this.weaponSelect = k === '0' ? 9 : +k - 1; this.digitPress = true; }
      if (k === ' ') { this.weaponDelta = 1; e.preventDefault(); }   // スペース = 次の武器(撃つのは クリック / J)
    });
    addEventListener('keyup', (e) => this._keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this._keys.clear(); this.releaseAll(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
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
    this.fire = this._fireTouch !== null || this._firePointer !== null || k.has('j') || (this._mouseDown && !this.touchUsed);
    // 画面の はしまで なぞった指: そこで止めていても 同じ向きに回りつづける(撃つボタンは 右はしに近いので)
    if (this._t) for (const f of this._t.values()) {
      if (f.role === 'stick' || !f.drag) continue;
      const W = innerWidth, toR = W - f.x, toL = f.x;
      let dir = 0, depth = 0;
      if (toR < TURN.EDGE && f.x - f.sx > 16) { dir = 1; depth = 1 - toR / TURN.EDGE; }
      else if (toL < TURN.EDGE && f.sx - f.x > 16) { dir = -1; depth = 1 - toL / TURN.EDGE; }
      if (dir) { this.turn += dir * TURN.EDGE_RATE * (0.35 + 0.65 * depth) * Math.min(dt, 0.05); this.lookT = performance.now(); }
    }
  },

  // 指で なぞった横の量(px)→ 向き(ラジアン)。ふつうの速さで 画面の 40% = 90°
  _addTurn(dx, dtMs) {
    if (!dx) return;
    const base = (Math.PI / 2) / (TURN.WIDTH * Math.max(innerWidth, TURN.MIN_W));
    const v = Math.abs(dx) / Math.max(4, dtMs);                 // px/ms
    // とても ゆっくり(0.3px/ms 未満)= 少し にぶく(細かく狙える)/ ふつう = 1 / 速い = 最大 1 + ACC 倍(大きく回る)
    const a = Math.min(1, Math.max(0, (v - 0.5) / 1.5));
    const g = 0.85 + 0.15 * Math.min(1, v / 0.3) + TURN.ACC * a * a * (3 - 2 * a);
    this.turn += dx * base * g;
    this.lookT = performance.now();
  },
  _syncHeld() {
    let held = false;
    if (this._t) for (const f of this._t.values()) if (f.role === 'look' || (f.role === 'fire' && f.drag)) held = true;
    this.lookHeld = held;
  },
  // 指で向きを変えている最中か(少し前まで なぞっていた も ふくむ)
  get turning() { return this.lookHeld && performance.now() - this.lookT < 400; },
  // 武器の「照準への吸いつき」の強さ 0..1。なぞっている間は 0(指の向きを じゃましない)、はなすと だんだん もどる
  assistScale() {
    const s = (performance.now() - this.lookT) / 1000 - TURN.ASSIST_OFF;
    return s <= 0 ? 0 : Math.min(1, s / TURN.ASSIST_BACK);
  },
  // ぜんぶの指を はなしたことにする(一時停止・画面の切りかえ・アプリの切りかえのとき)
  releaseAll() {
    if (this._finishAll) this._finishAll();
    this._firePointer = null; this._mouseDown = false; this.lookHeld = false; this.turn = 0;
  },

  consumeLook(out) { out.x = this.look.x; out.y = this.look.y; this.look.x = 0; this.look.y = 0; return out; },
  consumeTurn() { const v = this.turn; this.turn = 0; return v; },
  consumeLookMouse(out) { out.x = this.lookMouse.x; out.y = this.lookMouse.y; this.lookMouse.x = 0; this.lookMouse.y = 0; return out; },
  consumeView() { const v = this.view; this.view = false; return v; },
  consumeViewHold() { const v = this.viewHold; this.viewHold = false; return v; },
  consumeDash() { const v = this.dash; this.dash = false; return v; },
  consumeSlam() { const v = this.slam; this.slam = false; return v; },
  consumeWeaponGrid() { const v = this.weaponGrid; this.weaponGrid = false; return v; },
  consumeSpin() { const s = this.spin; this.spin = false; return s; },
  consumeWeaponDelta() { const d = this.weaponDelta; this.weaponDelta = 0; return d; },
  consumeWeaponSelect() { const s = this.weaponSelect; this.weaponSelect = -1; return s; },

  setVisible(v) { this.el.classList.toggle('hidden', !v); if (!v) this.releaseAll(); },

  // 自動操作(確認用・タイトルの見本): ぐるぐる歩きながら撃ちまくる
  _bot(dt) {
    this._botT += dt;
    this._botAng += dt * (0.35 + 0.25 * Math.sin(this._botT * 0.13));
    this.move.x = Math.cos(this._botAng); this.move.z = Math.sin(this._botAng);
    this.fire = true;
    if (Math.floor(this._botT / 5) !== Math.floor((this._botT - dt) / 5)) this.spin = true;
    if (Math.floor(this._botT / 7) !== Math.floor((this._botT - dt) / 7)) this.weaponDelta = 1;
    // ダッシュ(3 秒ごと)と ジャンプ叩きつけ(ときどき 2 回押し)を見せる
    const d0 = Math.floor((this._botT - dt) / 3.1), d1 = Math.floor(this._botT / 3.1);
    if (d1 !== d0) { this.dash = true; this._botSlam = d1 % 3 === 2 ? 0.12 : 0; }
    if (this._botSlam > 0 && (this._botSlam -= dt) <= 0) this.dash = true;
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
    <button class="btn btn-dash" type="button" aria-label="ダッシュ(2回で叩きつけ)"><span>ダッシュ</span><small>2回で叩きつけ</small></button>
    <button class="btn btn-spin" type="button" aria-label="回転斬り"><span>回転<br>斬り</span></button>
    <button class="btn btn-fire" type="button" aria-label="撃つ"><span>撃つ</span></button>`;
  root.appendChild(el);
  return el;
}
