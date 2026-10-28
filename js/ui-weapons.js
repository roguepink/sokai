// 画面係: 武器を ぜんぶ ならべて えらぶ画面(31 種類あるので、上の列を 横に送るだけでは さがしにくい)。
//  - 武器の列の いちばん左の「▦ 全部」/ PC は T キーで開く。開いている間は ゲームが止まる(main が WeaponGrid.open を見る)
//  - さわった武器に すぐ切りかえて 閉じる。✕・まわりをタップ・Esc でも閉じる
import { Weapons, WEAPONS } from './weapons.js';
import { Events } from './events.js';

export const WeaponGrid = {
  open: false, el: null, _input: null, _audio: null,

  init(root, Input, Audio) {
    this._input = Input; this._audio = Audio;
    const el = this.el = document.createElement('div');
    el.id = 'weaponGrid';
    el.className = 'overlay weapon-grid hidden';
    el.innerHTML = `<div class="wg-head"><h2>武器をえらぶ <small>${WEAPONS.length}種類</small></h2><button type="button" class="wg-close" aria-label="閉じる">✕</button></div>
      <div class="wg-list"></div>
      <p class="wg-note pc-only">数字キー 1〜0。同じ数字を もう一度 押すと 11〜・21〜 / スペース・Q・R・ホイールで となり / T で この画面</p>`;
    const list = el.querySelector('.wg-list');
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wg-item' + ((w.name || '').length > 8 ? ' long' : ''); b.dataset.i = i;
      b.innerHTML = `<b>${w.icon || '🔫'}</b><span>${w.name || w.id}</span><sub>${i + 1}</sub>`;
      list.appendChild(b);
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.wg-item'); if (!b) return;
      Weapons.select(+b.dataset.i);
      this.close();
    });
    el.querySelector('.wg-close').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });   // まわりをタップ
    root.appendChild(el);
    Events.on('reset', () => this.close());
  },

  toggle() { if (this.open) this.close(); else this.show(); },
  show() {
    if (this.open || !this.el) return;
    this.open = true;
    this.el.querySelectorAll('.wg-item').forEach((b, i) => b.classList.toggle('on', i === Weapons.index));
    this.el.classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this._input.setVisible(false);
    const cur = this.el.querySelector('.wg-item.on');
    if (cur && cur.scrollIntoView) try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  },
  close() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    this._input.setVisible(true);
  },
};
