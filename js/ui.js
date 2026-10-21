// 画面係: 点数(数字がくるくる上がる)・コンボ・最高記録・倒した数・ミニマップ・武器の列・回転斬りのたまり具合・
// ボスの体力・飛び出す数字・大きな文字の演出・タイトル/設定/一時停止/結果の画面。
import { Events } from './events.js';
import { Score, jpNum } from './score.js';
import { Weapons, WEAPONS } from './weapons.js';
import { Engine, loadSettings, saveSettings } from './engine.js';
import { Player } from './player.js';
import { Audio } from './audio.js';
import { Bosses } from './ui-boss.js';
import { Minimap } from './ui-minimap.js';
import { Popups, Banner, Confetti, flash } from './ui-fx.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString();
const mmss = (s) => { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// コンボの色の段階(数が増えるほど派手に)
const COMBO_TIERS = [0, 10, 30, 60, 100, 200];

export const UI = {
  root: null, el: {},
  paused: false,
  _disp: 0, _scoreBump: 1, _comboBump: 1, _lastScoreTxt: '', _lastKills: -1, _lastTime: -1,
  _comboTier: -1, _comboShown: false, _comboEndT: 0, _lastCombo: 0,
  _dmgT: 0, _ptsT: 0, _dmgFrame: 0,
  _bossLag: 1, _bossKey: null, _bossPts: 0,
  _spinP: -1, _spinReady: false,
  _settingsFrom: null,

  init(root) {
    this.root = root;
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'hidden';
    hud.innerHTML = `
      <div class="pop-layer" id="popLayer"></div>
      <div class="vignette" id="vignette"></div>
      <div class="hud-tl">
        <canvas class="minimap" id="minimap" aria-hidden="true"></canvas>
        <div class="hud-stats"><span class="kills"><i>☠</i><b id="hudKills">0</b></span><span class="time" id="hudTime">0:00</span></div>
      </div>
      <div class="hud-score" id="hudScoreBox">
        <b id="hudScore">0</b>
        <small id="hudBest"></small>
        <div class="pace" id="hudPaceBox"><i id="hudPace"></i></div>
      </div>
      <div class="hud-boss hidden" id="hudBoss">
        <div class="boss-name"><span>BOSS</span><b id="hudBossName"></b></div>
        <div class="boss-bar"><i class="boss-lag" id="hudBossLag"></i><i class="boss-fill" id="hudBossFill"></i></div>
      </div>
      <div class="hud-combo" id="hudCombo">
        <b id="hudComboN">0</b>
        <div class="combo-label"><span>COMBO</span><em id="hudMult">×1</em></div>
        <div class="combo-bar"><i id="hudComboBar"></i></div>
      </div>
      <div class="weapon-name" id="hudWeapon"></div>
      <div class="banner" id="banner"><b></b><small></small></div>
      <div class="sub-banner" id="subBanner"></div>
      <div class="boss-arrow hidden" id="bossArrow"><i>▲</i><span>BOSS</span><small id="bossDist"></small></div>
      <button class="hud-pause" id="btnPause" type="button" aria-label="一時停止">Ⅱ</button>`;
    root.appendChild(hud);
    // 武器の列は、操作の層(スティック)より上に置く(さわれるように)
    const wbar = document.createElement('div');
    wbar.className = 'weapon-bar hidden';
    wbar.id = 'weaponBar';
    root.appendChild(wbar);

    // 画面全体の演出(結果画面の上にも出す)
    const fxl = document.createElement('div');
    fxl.id = 'fxLayer';
    fxl.innerHTML = '<div class="flash" id="flash"></div><div class="confetti-layer" id="confettiLayer"></div>';
    document.body.appendChild(fxl);

    const q = (id) => hud.querySelector('#' + id);
    this.el = {
      hud, score: q('hudScore'), scoreBox: q('hudScoreBox'), best: q('hudBest'), pace: q('hudPace'), paceBox: q('hudPaceBox'),
      kills: q('hudKills'), time: q('hudTime'),
      combo: q('hudCombo'), comboN: q('hudComboN'), mult: q('hudMult'), comboBar: q('hudComboBar'),
      weapon: q('hudWeapon'), weaponBar: wbar,
      boss: q('hudBoss'), bossName: q('hudBossName'), bossFill: q('hudBossFill'), bossLag: q('hudBossLag'),
      bossArrow: q('bossArrow'), bossDist: q('bossDist'), vignette: q('vignette'),
      sub: q('subBanner'), pause: q('btnPause'),
      flash: $('flash'),
      spin: document.querySelector('.btn-spin'),
    };

    const low = Engine.quality === 'low';
    this.dmg = new Popups(q('popLayer'), low ? 10 : 18, 'dmg');
    this.pts = new Popups(q('popLayer'), low ? 8 : 14, 'pts');
    this.banner = new Banner(q('banner'));
    this.confetti = new Confetti($('confettiLayer'), low ? 28 : 56);
    Bosses.init();
    Minimap.init(q('minimap'));

    // 回転斬りボタンに「たまり具合」の輪をつける
    if (this.el.spin) {
      const ring = document.createElement('i');
      ring.className = 'spin-ring';
      this.el.spin.appendChild(ring);
    }

    this._buildWeaponBar();
    this._wireEvents();
    this._wireScreens();
    this._titleRecords();
  },

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
    this.el.weaponBar.classList.toggle('hidden', !v);
    if (v) { Minimap.resize(); this._buildWeaponBar(); }
  },

  // ---------------- イベント ----------------
  _wireEvents() {
    Events.on('weaponChange', () => this._weapon(true));

    Events.on('hit', (h) => {
      if (!Score.active || this.paused || !h) return;
      const amt = h.amount || 0;
      if (amt < 4 && !h.crit) return;                   // 燃えている間の小さなダメージなどは出さない
      const now = performance.now();
      const gap = Engine.quality === 'low' ? 110 : Engine.quality === 'mid' ? 70 : 45;
      if (!h.crit && !h.boss && now - this._dmgT < gap) return;
      if (this._dmgFrame >= 3) return;
      this._dmgT = now; this._dmgFrame++;
      const big = h.crit ? 'dmg crit' : h.boss ? 'dmg boss' : 'dmg';
      this.dmg.spawn(h.x, (h.y || 1.2) + 0.4, h.z, h.crit ? fmt(amt) + '!' : fmt(amt), big, h.crit ? 1.35 : 1, h.crit ? 0.8 : 0.6, h.crit ? 60 : 40);
    });

    Events.on('score', (s) => {
      const p = s.points || 0;
      this._scoreBump = Math.min(1.45, Math.max(this._scoreBump, 1.1 + Math.min(0.35, p / 40000)));
      if (s.kind === 'boss') this._bossPts = p;
      if (s.x == null || this.paused) return;
      const now = performance.now();
      if (s.kind === 'kill') {
        this._comboBump = 1.35;
        if (now - this._ptsT < (Engine.quality === 'low' ? 90 : 45)) return;
        this._ptsT = now;
        const sz = p >= 10000 ? 1.5 : p >= 2000 ? 1.25 : 1;
        this.pts.spawn(s.x, 2.0, s.z, '+' + fmt(p), 'pts', sz, 0.9, 55);
      } else {
        if (s.kind === 'multi' && s.count >= 5) return;   // 大きいまとめ倒しは、まんなかの文字で見せる
        const cls = s.kind === 'boss' ? 'pts boss' : 'pts multi';
        const txt = '+' + fmt(p);
        this.pts.spawn(s.x, 2.4, s.z, txt, cls, s.kind === 'boss' ? 2 : 1.5, s.kind === 'boss' ? 2.2 : 1.3, 80);
      }
    });

    Events.on('multiKill', (m) => {
      if (this.paused || m.count < 5) return;
      const n = m.count;
      const word = n >= 30 ? '大量撃破!!' : n >= 15 ? 'まとめて撃破!' : n >= 8 ? 'まとめ倒し!' : '連続撃破!';
      this._sub(`<b>${n}体</b> ${word} <em>+${fmt(m.points)}</em>`, n >= 15 ? 'big' : '');
    });

    Events.on('milestone', (m) => {
      const style = m.kind === 'combo' ? (m.value >= 200 ? 'massacre' : 'combo') : m.kind === 'kills' ? 'kills' : 'gold';
      const sub = m.bonus ? 'ボーナス +' + fmt(m.bonus) : '';
      this.banner.show(m.text, sub, style, m.value >= 100 ? 1.9 : 1.4, 1);
      if (m.value >= 100) flash(this.el.flash, m.kind === 'combo' ? '#ff3b6b' : '#ffd23f', 0.22, 300);
    });

    Events.on('newRecord', () => {
      this.banner.show('最高記録 更新!', 'NEW RECORD', 'record', 2.4, 3);
      flash(this.el.flash, '#ffe680', 0.55, 600);
      this.confetti.burst();
      this.el.scoreBox.classList.add('record');
      this._scoreBump = 1.6;
    });

    Events.on('bossSpawn', (d) => {
      const name = (d && (d.name || (d.e && d.e.name))) || 'ボス';
      this.banner.show('⚠ ボス出現!', name, 'boss', 2.6, 3);
      flash(this.el.flash, '#ff1a1a', 0.45, 700);
      this.el.vignette.classList.add('boss');
    });

    Events.on('bossDown', (b) => {
      const pts = this._bossPts; this._bossPts = 0;
      this.banner.show('ボス撃破!', pts ? '+' + fmt(pts) + ' 点' : (b.name || ''), 'bossdown', 2.4, 3);
      flash(this.el.flash, '#fff3b0', 0.6, 700);
      if (Score.active) this.confetti.burst(Engine.quality === 'low' ? 16 : 30);
    });

    Events.on('horde', (h) => {
      this.banner.show('大群が来るぞ!', (h && h.text) || (h && h.count ? h.count + '体 接近中' : ''), 'horde', 2.2, 2);
      flash(this.el.flash, '#ff7a1f', 0.25, 500);
    });

    Events.on('comboEnd', (c) => {
      if (c.combo >= 30) this._sub(`コンボ <b>${fmt(c.combo)}</b> 達成!`, '');
    });

    Events.on('start', () => {
      this._resetHud();
      this.banner.show('スタート!', 'ゾンビをなぎ倒せ!', 'start', 1.5, 2);
    });
    Events.on('reset', () => { this._resetHud(); this._titleRecords(); });
    Events.on('pause', () => {
      this.paused = true; this.el.hud.classList.add('paused');
      const ps = $('pauseScore');
      if (ps) ps.innerHTML = `スコア <b>${fmt(Score.score)}</b> ・ ${fmt(Score.kills)}体`;
    });
    Events.on('resume', () => { this.paused = false; this.el.hud.classList.remove('paused'); });
    Events.on('finish', (d) => this._result(d || {}));
  },

  _resetHud() {
    this.paused = false; this.el.hud.classList.remove('paused');
    this._disp = 0; this._lastScoreTxt = ''; this._lastKills = -1; this._lastTime = -1;
    this._comboTier = -1; this._comboShown = false; this._bossLag = 1; this._bossKey = null;
    this.dmg.clear(); this.pts.clear(); this.banner.clear();
    this.el.scoreBox.classList.remove('record');
    this.el.combo.classList.remove('on', 'end');
    this.el.vignette.classList.remove('boss');
    this.el.boss.classList.add('hidden');
    this.el.bossArrow.classList.add('hidden');
    this.el.sub.classList.remove('on');
    this._weapon(false);
  },

  _sub(html, cls) {
    const s = this.el.sub;
    s.innerHTML = html;
    s.className = 'sub-banner ' + (cls || '');
    void s.offsetWidth;
    s.classList.add('on');
  },

  // ---------------- 武器 ----------------
  _buildWeaponBar() {
    const bar = this.el.weaponBar;
    if (!bar || bar.childElementCount === WEAPONS.length) { this._weapon(false); return; }
    bar.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wbtn';
      b.setAttribute('aria-label', w.name || w.id);
      b.innerHTML = `<span>${w.icon || '🔫'}</span>${i < 10 ? `<sub>${(i + 1) % 10}</sub>` : ''}`;
      b.addEventListener('click', (e) => { e.preventDefault(); Audio.click(); Weapons.select(i); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      bar.appendChild(b);
    });
    this._weapon(false);
  },

  _weapon(changed) {
    const w = Weapons.current || {};
    const name = (w.icon || '') + ' ' + (w.name || '');
    this.el.weapon.textContent = name;
    const bar = this.el.weaponBar;
    if (bar) {
      [...bar.children].forEach((b, i) => b.classList.toggle('on', i === Weapons.index));
      const cur = bar.children[Weapons.index];
      if (cur && bar.scrollWidth > bar.clientWidth) {
        const left = cur.offsetLeft - bar.clientWidth / 2 + cur.offsetWidth / 2;
        try { bar.scrollTo({ left, behavior: changed ? 'smooth' : 'auto' }); } catch (e) { bar.scrollLeft = left; }
      }
    }
    if (changed) {
      const el = this.el.weapon;
      el.classList.remove('wpop'); void el.offsetWidth; el.classList.add('wpop');
    }
  },

  // ---------------- 毎フレーム ----------------
  update(dt) {
    const gdt = this.paused ? 0 : dt;
    const el = this.el;

    // 点数(くるくる上がる)
    const target = Score.score;
    if (this._disp < target) {
      const diff = target - this._disp;
      this._disp += Math.max(diff * (1 - Math.exp(-9 * dt)), Math.min(diff, 60 * dt * 10));
      if (target - this._disp < 1) this._disp = target;
    } else this._disp = target;
    const txt = fmt(this._disp);
    if (txt !== this._lastScoreTxt) { el.score.textContent = txt; this._lastScoreTxt = txt; }
    this._scoreBump += (1 - this._scoreBump) * (1 - Math.exp(-10 * dt));
    el.score.style.transform = `scale(${this._scoreBump.toFixed(3)})`;

    // ベストと「記録まであと」
    if (Score.newRecord && Score.startBest > 0) {
      el.best.textContent = '最高記録 更新中!';
      el.pace.style.transform = 'scaleX(1)';
    } else {
      const sb = Score.startBest;
      el.best.textContent = sb > 0 ? 'ベスト ' + fmt(sb) : 'はじめての記録に挑戦中!';
      el.pace.style.transform = `scaleX(${sb > 0 ? Math.min(1, Score.score / sb).toFixed(3) : 0})`;
    }
    el.paceBox.style.visibility = Score.startBest > 0 ? 'visible' : 'hidden';

    if (Score.kills !== this._lastKills) { this._lastKills = Score.kills; el.kills.textContent = fmt(Score.kills); }
    const ts = Math.floor(Score.time || 0);
    if (ts !== this._lastTime) { this._lastTime = ts; el.time.textContent = mmss(ts); }

    this._updateCombo(dt);
    this._updateSpin();
    Bosses.update(gdt);
    this._updateBoss(dt);

    this.dmg.update(gdt); this.pts.update(gdt);
    this._dmgFrame = 0;
    this.banner.update(dt);
    if (!this.paused) Minimap.update(dt);
  },

  _updateCombo(dt) {
    const el = this.el, c = Score.combo;
    if (c >= 2) {
      if (!this._comboShown) { this._comboShown = true; el.combo.classList.remove('end'); el.combo.classList.add('on'); }
      if (c !== this._lastCombo) {
        el.comboN.textContent = fmt(c);
        el.mult.textContent = '×' + (Score.mult % 1 ? Score.mult.toFixed(1) : Score.mult);
        let tier = 0; for (let i = 0; i < COMBO_TIERS.length; i++) if (c >= COMBO_TIERS[i]) tier = i;
        if (tier !== this._comboTier) { el.combo.classList.remove('t' + this._comboTier); el.combo.classList.add('t' + tier); this._comboTier = tier; }
      }
      const p = Math.max(0, Math.min(1, Score.comboTime / (Score.comboWindow || 3)));
      el.comboBar.style.transform = `scaleX(${p.toFixed(3)})`;
      el.combo.classList.toggle('hurry', p < 0.3);
    } else if (this._comboShown) {
      this._comboShown = false;
      el.combo.classList.add('end');
      el.combo.classList.remove('on', 'hurry');
      this._comboTier = -1;
      el.combo.className = el.combo.className.replace(/\bt\d\b/g, '').trim();
    }
    this._lastCombo = c;
    this._comboBump += (1 - this._comboBump) * (1 - Math.exp(-14 * dt));
    el.comboN.style.transform = `scale(${this._comboBump.toFixed(3)})`;
  },

  _updateSpin() {
    const b = this.el.spin; if (!b) return;
    let p = Weapons.spinReady;
    if (typeof p !== 'number') p = 1 - Math.max(0, Weapons._spinCool || 0) / 0.6;   // 古い武器係でも動くように
    p = Math.max(0, Math.min(1, p));
    const q = Math.round(p * 60) / 60;
    if (q !== this._spinP) { this._spinP = q; b.style.setProperty('--p', q.toFixed(3)); }
    const ready = p >= 1;
    if (ready !== this._spinReady) {
      this._spinReady = ready; b.classList.toggle('ready', ready);
      if (ready && Score.active) b.classList.add('flashready'), setTimeout(() => b.classList.remove('flashready'), 400);
    }
  },

  _updateBoss(dt) {
    const el = this.el, B = Bosses.list;
    const cur = B.length ? B[0] : null;
    if (!cur) {
      if (this._bossKey) { this._bossKey = null; el.boss.classList.add('hidden'); el.bossArrow.classList.add('hidden'); el.vignette.classList.remove('boss'); }
      return;
    }
    const e = cur.e;
    if (this._bossKey !== e) {
      this._bossKey = e; this._bossLag = 1;
      el.boss.classList.remove('hidden');
      el.bossName.textContent = cur.name + (B.length > 1 ? ' ほか' + (B.length - 1) + '体' : '');
    }
    const max = e.maxHp || (e.def && e.def.hp) || 1;
    const p = Math.max(0, Math.min(1, e.hp / max));
    if (p < this._bossLag) this._bossLag = Math.max(p, this._bossLag - dt * 0.35); else this._bossLag = p;
    el.bossFill.style.transform = `scaleX(${p.toFixed(4)})`;
    el.bossLag.style.transform = `scaleX(${this._bossLag.toFixed(4)})`;

    // 画面の外なら、端に矢印
    const W = innerWidth, H = innerHeight, sc = Engine.project(e.x, 1.5, e.z, _pt);
    const M = 46;
    const onScreen = sc && sc.x > M && sc.x < W - M && sc.y > M && sc.y < H - M;
    if (onScreen) { el.bossArrow.classList.add('hidden'); return; }
    el.bossArrow.classList.remove('hidden');
    const dx = e.x - Player.pos.x, dz = e.z - Player.pos.z, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uy = dz / l;                      // カメラは北が上なので、そのまま画面の向き
    const TOP = innerHeight > innerWidth ? 200 : 120;      // 上は点数・ボスの体力の下まで
    const hw = W / 2 - M, hh = uy < 0 ? H / 2 - TOP : H / 2 - M;
    const t = Math.min(hw / Math.abs(ux || 1e-6), hh / Math.abs(uy || 1e-6));
    let x = W / 2 + ux * t, y = H / 2 + uy * t;
    // 左上のミニマップ・右上の武器の列・右下のボタンにかぶらないように
    if (x < 130 && y < 160) { if (uy < -0.5) x = 130; else y = 160; }
    if (x > W - 330 && y < 70) y = 70;
    if (x > W - 300 && y > H - 150) { if (ux > 0.5) y = H - 150; else x = W - 300; }
    el.bossArrow.style.transform = `translate3d(${x.toFixed(0)}px,${y.toFixed(0)}px,0) translate(-50%,-50%)`;
    el.bossArrow.firstChild.style.transform = `rotate(${Math.atan2(ux, -uy).toFixed(3)}rad)`;
    el.bossDist.textContent = Math.round(l) + 'm';
  },

  // ---------------- 画面(タイトル・設定・一時停止・結果) ----------------
  _wireScreens() {
    // ボタンを押したら小さな音
    document.addEventListener('pointerdown', (e) => {
      const b = e.target.closest && e.target.closest('.overlay button');
      if (b) Audio.click();
    }, true);

    const open = (from) => {
      this._settingsFrom = from;
      $(from).classList.add('hidden');
      this._syncSettings();
      $('settings').classList.remove('hidden');
    };
    const sBtn = $('btnSettings'), pBtn = $('btnPauseSettings');
    if (sBtn) sBtn.addEventListener('click', () => { Audio.unlock(); open('title'); });
    if (pBtn) pBtn.addEventListener('click', () => open('pauseMenu'));
    const back = $('btnSetBack');
    if (back) back.addEventListener('click', () => {
      $('settings').classList.add('hidden');
      $(this._settingsFrom || 'title').classList.remove('hidden');
    });

    document.querySelectorAll('#settings .seg').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const key = seg.dataset.set, v = b.dataset.v;
        Audio.unlock();
        if (key === 'sound') Audio.setMuted(v === 'off');
        else if (key === 'music') Audio.setMusic(v === 'on');
        else if (key === 'vibrate') { const s = loadSettings(); s.vibrate = v === 'on'; saveSettings(s); if (v === 'on') Audio.vibrate(40, true); }
        else if (key === 'quality' && v !== Engine.quality) { Score.save(); Engine.setQuality(v); return; }
        this._syncSettings();
      });
    });
  },

  _syncSettings() {
    const s = loadSettings();
    const vals = { sound: Audio.muted ? 'off' : 'on', music: Audio.musicOn ? 'on' : 'off', vibrate: s.vibrate === false ? 'off' : 'on', quality: Engine.quality };
    document.querySelectorAll('#settings .seg').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === vals[seg.dataset.set])));
    });
  },

  _titleRecords() {
    const t = $('titleBest'); if (!t) return;
    const r = Score.records || {};
    if (Score.best > 0) {
      t.innerHTML = `<span>ベスト <b>${fmt(Score.best)}</b></span>` +
        (r.maxCombo ? `<span>最大コンボ <b>${fmt(r.maxCombo)}</b></span>` : '') +
        (r.totalKills ? `<span>倒した合計 <b>${fmt(r.totalKills)}</b>体</span>` : '');
      t.classList.remove('hidden');
    } else t.classList.add('hidden');
  },

  _result(d) {
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('resultCombo', fmt(Score.maxCombo));
    set('resultBoss', fmt(Score.bossKills));
    set('resultTime', mmss(Score.time));
    const nw = $('resultNew'), hint = $('resultHint'), res = $('result');
    if (nw) nw.textContent = Score.startBest > 0 ? '🏆 最高記録 更新!' : '🏆 はじめての記録!';
    if (hint) {
      const left = Score.startBest - Score.score;
      hint.textContent = !Score.newRecord && left > 0 ? `ベストまで あと ${fmt(left)}点!` : '';
    }
    if (res) res.classList.toggle('rec', !!Score.newRecord);
    this._titleRecords();
    // スコアを 0 からくるくる数える
    const final = Score.score, sEl = $('resultScore'), t0 = performance.now(), dur = Math.min(1600, 500 + Math.log10(final + 1) * 180);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - t, 3);
      if (sEl) sEl.textContent = fmt(final * k);
      if (t < 1) requestAnimationFrame(tick);
      else if (Score.newRecord) { this.confetti.burst(); flash(this.el.flash, '#ffe680', 0.4, 500); }
    };
    requestAnimationFrame(tick);
  },
};
const _pt = {};

export { jpNum };
