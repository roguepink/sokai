// 画面係: 点数・コンボ・最高記録・武器の名前・ボスの体力・ポップアップ・タイトル/ポーズ画面。
import { Events } from './events.js';
import { Score } from './score.js';
import { Weapons } from './weapons.js';

export const UI = {
  root: null, el: {},

  init(root) {
    this.root = root;
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'hidden';
    hud.innerHTML = `
      <div class="hud-score"><b id="hudScore">0</b><small id="hudBest"></small></div>
      <div class="hud-combo" id="hudCombo"></div>
      <div class="hud-weapon" id="hudWeapon"></div>
      <button class="hud-pause" id="btnPause" type="button" aria-label="一時停止">Ⅱ</button>`;
    root.appendChild(hud);
    this.el = { hud, score: hud.querySelector('#hudScore'), best: hud.querySelector('#hudBest'),
      combo: hud.querySelector('#hudCombo'), weapon: hud.querySelector('#hudWeapon'), pause: hud.querySelector('#btnPause') };
    Events.on('weaponChange', () => this._weapon());
    this._weapon();
  },

  show(v) { this.el.hud.classList.toggle('hidden', !v); },

  _weapon() { const w = Weapons.current; this.el.weapon.textContent = w.icon + ' ' + w.name; },

  update(dt) {
    this.el.score.textContent = Score.score.toLocaleString();
    this.el.best.textContent = 'ベスト ' + Score.best.toLocaleString();
    this.el.combo.textContent = Score.combo >= 5 ? Score.combo + ' COMBO ×' + Score.mult : '';
  },
};
