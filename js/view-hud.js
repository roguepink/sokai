// 視点係(画面): 照準(撃つと広がる・敵に重なると赤)/ 当たった印(ヒットマーカー)/ 視点の名前の表示 /
// はじめての人への ひとこと / ダッシュの速さの線 / 視点の設定(👁 を長押し)。
import { Engine } from './engine.js';
import { Events } from './events.js';
import { damp } from './util.js';

const $ = (id) => document.getElementById(id);
const NAMES = { top: '見下ろし', tps: '肩越し', fps: '一人称' };
const ICONS = { top: '🗺️', tps: '🎥', fps: '👀' };
const SENS = [['0.6', 'おそい'], ['1', 'ふつう'], ['1.45', 'はやい'], ['2', 'とても']];
const MELEE = new Set(['sword', 'spin', 'dash', 'slam', 'fire', 'bloater']);
const _pt = {};

export const ViewHud = {
  open: false,              // 視点の設定を開いている(main が ゲームを止める)
  _spread: 0, _gotMarker: false, _markT: 0, _toastT: 0, _hintT: 0, _hintLook0: 0, _hintKind: '',
  ctx: null,

  init(root, ctx) {
    this.ctx = ctx;
    // 照準: 4 本の線 + まん中の点 + 当たった印(×)
    const ch = this.ch = $('crosshair') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'crosshair', className: 'hidden' });
    ch.innerHTML = '<i class="ch-t ch-u"></i><i class="ch-t ch-d"></i><i class="ch-t ch-l"></i><i class="ch-t ch-r"></i><b class="ch-dot"></b>' +
      '<div class="ch-hit"><i></i><i></i><i></i><i></i></div>';
    this.hit = ch.querySelector('.ch-hit');
    const mk = (id, cls, html = '') => { const e = document.createElement('div'); e.id = id; e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
    this.lines = mk('speedLines', 'speed-lines');
    this.toast = mk('viewToast', 'view-toast hidden');
    this.hint = mk('viewHint', 'view-hint hidden');
    this.panel = this._buildPanel(root);
    this.dashBtn = document.querySelector('#controls .btn-dash');

    Events.on('hitMarker', (h) => { this._gotMarker = true; this.mark(h && h.kill ? 'kill' : h && h.crit ? 'crit' : ''); });
    // 武器係が hitMarker を出すまでの かわり: 照準の近くに当たったら 印を出す
    Events.on('hit', (h) => {
      if (this._gotMarker || !h || Engine.viewMode === 'top' || !this._playing || MELEE.has(h.cause)) return;
      if (this._nearCross(h.x, h.y || 1.2, h.z)) this.mark(h.crit ? 'crit' : '');
    });
    Events.on('kill', (k) => {
      if (this._gotMarker || !k || Engine.viewMode === 'top' || !this._playing || MELEE.has(k.cause)) return;
      if (this._nearCross(k.x, 1.2, k.z)) this.mark('kill');
    });
    Events.on('viewChange', (v) => this._onView(v.mode));
    Events.on('dash', () => {
      const s = Engine.settings._get();
      if (this._playing && (s.hintSlam || 0) < 2 && !this._slamHinted) {
        this._slamHinted = true;
        setTimeout(() => this.showHint('slam'), 700);
      }
    });
    Events.on('slam', () => { if (this._hintKind === 'slam') this.hideHint(true); });
  },

  _nearCross(x, y, z) {
    const p = Engine.project(x, y, z, _pt), c = Engine.cross;
    if (!p) return false;
    const r = Math.max(60, innerWidth * 0.075);
    return (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < r * r;
  },

  // 当たった印。kind: '' | 'crit' | 'kill'
  mark(kind) {
    const now = performance.now();
    if (kind !== 'kill' && now - this._markT < 70) return;
    this._markT = now;
    const h = this.hit;
    h.className = 'ch-hit' + (kind ? ' ' + kind : '');
    if (h.animate) {
      if (this._anim) this._anim.cancel();
      this._anim = h.animate([
        { opacity: 1, transform: `scale(${kind === 'kill' ? 1.7 : kind === 'crit' ? 1.45 : 1.25}) rotate(${kind === 'kill' ? 0 : 0}deg)` },
        { opacity: 1, transform: 'scale(1)', offset: 0.25 },
        { opacity: 0, transform: 'scale(1)' },
      ], { duration: kind === 'kill' ? 380 : 220, easing: 'ease-out' });
    }
  },

  // プレイが始まった(保存した視点が 肩越し・一人称なら ひとこと)
  onStart() {
    this._playing = true; this._slamHinted = false;
    this.hideHint();
    if (Engine.viewMode !== 'top' && (Engine.settings._get().hintLook || 0) < 3) setTimeout(() => { if (Engine.viewMode !== 'top' && this._playing) this.showHint('look'); }, 900);
  },

  // ---------- 視点が変わった ----------
  _onView(mode) {
    if (!this._playing) return;
    this.showToast(mode);
    if (mode !== 'top') {
      const s = Engine.settings._get();
      if ((s.hintLook || 0) < 3) setTimeout(() => { if (Engine.viewMode !== 'top' && this._playing) this.showHint('look'); }, 450);
    } else if (this._hintKind === 'look') this.hideHint();
  },
  showToast(mode) {
    const t = this.toast;
    const first = (Engine.settings._get().viewToastN || 0) < 4;
    t.innerHTML = `<b>${ICONS[mode]} ${NAMES[mode]}</b>` + (first ? '<small>👁 を長押しで 細かい設定</small>' : '');
    t.classList.remove('hidden', 'go'); void t.offsetWidth; t.classList.add('go');
    this._toastT = 1.6;
    if (first) { const s = Engine.settings._get(); Engine.settings._set('viewToastN', (s.viewToastN || 0) + 1); }
  },
  showHint(kind) {
    const pc = document.body.classList.contains('pc');
    const h = this.hint;
    this._hintKind = kind;
    if (kind === 'look') {
      h.innerHTML = pc ? '<b>🖱️</b><span>画面をクリックすると<br>マウスで 向きが変わる<small>(Esc で もどる)</small></span>'
        : '<b class="swipe">👆</b><span>右側を なぞると<br>向きが変わる<small>さわらないと 自動で ゾンビの方を向く</small></span>';
      const s = Engine.settings._get(); Engine.settings._set('hintLook', (s.hintLook || 0) + 1);
      this._hintLook0 = this.ctx.Input.lookT;
      this._hintT = 7;
    } else {
      h.innerHTML = `<b>💨</b><span>ダッシュを すばやく<br>2回 押すと <em>ジャンプ叩きつけ!</em>${pc ? '<small>(F を2回 / G)</small>' : ''}</span>`;
      const s = Engine.settings._get(); Engine.settings._set('hintSlam', (s.hintSlam || 0) + 1);
      this._hintT = 4.5;
    }
    h.className = 'view-hint ' + kind;
  },
  hideHint() { this.hint.classList.add('hidden'); this._hintKind = ''; this._hintT = 0; },

  // ---------- 視点の設定(👁 を長押し・B キー) ----------
  _buildPanel(root) {
    const p = document.createElement('div');
    p.id = 'viewPanel'; p.className = 'overlay view-panel hidden';
    p.innerHTML = `<h2>👁 視点</h2>
      <div class="vp-views">${['top', 'tps', 'fps'].map((m) => `<button type="button" data-view="${m}"><b>${ICONS[m]}</b>${NAMES[m]}</button>`).join('')}</div>
      <div class="set-row"><span>向きを変える速さ</span><div class="seg" data-vset="sens">${SENS.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="set-row"><span>自動で ゾンビの方を向く</span><div class="seg" data-vset="autoTurn"><button type="button" data-v="on">オン</button><button type="button" data-v="off">オフ</button></div></div>
      <div class="set-row"><span>上下の向き</span><div class="seg" data-vset="invertY"><button type="button" data-v="off">ふつう</button><button type="button" data-v="on">反対</button></div></div>
      <p class="set-note">肩越し・一人称は、右側を なぞると 向きが変わります</p>
      <button type="button" class="big vp-close">もどる</button>`;
    root.appendChild(p);
    p.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      const P = this.ctx.Player;
      Engine.setViewMode(b.dataset.view, Engine.viewMode === 'top' ? P.facing : undefined);
      this._sync();
    }));
    p.querySelectorAll('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = seg.dataset.vset, v = b.dataset.v;
      if (k === 'sens') Engine.settings.sens = +v;
      else Engine.settings[k] = v === 'on';
      this._sync();
    }));
    p.querySelector('.vp-close').addEventListener('click', () => this.closePanel());
    return p;
  },
  _sync() {
    const st = Engine.settings, p = this.panel;
    p.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === Engine.viewMode)));
    const sens = st.sens;
    let best = SENS[0][0];
    for (const [v] of SENS) if (Math.abs(+v - sens) < Math.abs(+best - sens)) best = v;
    const vals = { sens: best, autoTurn: st.autoTurn ? 'on' : 'off', invertY: st.invertY ? 'on' : 'off' };
    p.querySelectorAll('.seg').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === vals[seg.dataset.vset]))));
  },
  openPanel() {
    if (this.open) return;
    this.open = true; this._sync();
    this.panel.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.ctx.Input.setVisible(false);
  },
  closePanel() {
    if (!this.open) return;
    this.open = false;
    this.panel.classList.add('hidden');
    if (this._playing) this.ctx.Input.setVisible(true);
  },

  // ---------- フレームごと ----------
  update(dt, playing) {
    this._playing = playing;
    const { Input, Weapons, Player } = this.ctx;
    const close = Engine.viewMode !== 'top';
    const show = playing && close && !this.open;
    this.ch.classList.toggle('hidden', !show);
    if (show) {
      const c = Engine.cross;
      // 撃つと広がる(連射ほど大きく)。敵に重なると赤
      const w = Weapons.current || {};
      const want = Input.fire ? 7 + Math.min(10, (w.spread || 0.05) * 40) : Player.moves.busy ? 9 : 0;
      this._spread = damp(this._spread, want, Input.fire ? 18 : 8, dt);
      const tgt = Weapons.crossTarget !== undefined ? Weapons.crossTarget : Weapons.target;
      this.ch.classList.toggle('on', !!tgt);
      this.ch.style.setProperty('--sp', this._spread.toFixed(1) + 'px');
      this.ch.style.transform = `translate(${(c.x - innerWidth / 2).toFixed(1)}px, ${(c.y - innerHeight / 2).toFixed(1)}px)`;
    }
    // ダッシュの速さの線
    const mv = Player.moves;
    const sl = playing && !this.open ? (mv.dashing ? (close ? 1 : 0.5) : mv.airborne ? 0.35 : 0) : 0;
    this._lines = damp(this._lines || 0, sl, sl > (this._lines || 0) ? 30 : 7, dt);
    this.lines.style.opacity = this._lines < 0.01 ? '0' : this._lines.toFixed(2);
    if (this.dashBtn) {
      this.dashBtn.classList.toggle('cool', mv.ready < 1 && !mv.busy);
      this.dashBtn.classList.toggle('air', mv.dashing);
    }
    // 表示のタイマー
    if (this._toastT > 0 && (this._toastT -= dt) <= 0) this.toast.classList.add('hidden');
    if (this._hintT > 0) {
      this._hintT -= dt;
      const looked = this._hintKind === 'look' && Input.lookT !== this._hintLook0 && this._hintT < 5.8;
      if (this._hintT <= 0 || looked || !playing || (this._hintKind === 'look' && !close)) this.hideHint();
    }
  },
};
