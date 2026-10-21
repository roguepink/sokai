// 画面係: 点数(数字がくるくる上がる)・コンボ・最高記録・倒した数・ミニマップ・武器の列・回転斬りのたまり具合・
// ボスの体力・飛び出す数字・大きな文字の演出・タイトル/設定/一時停止/結果の画面。
// 第2弾: 無双モードのゲージと演出・出来事(worldEvent)の文字・チャレンジの残り・自己ベスト・大量撃破のスロー(キルカム)・結果の記録。
import { Events } from './events.js';
import { Score, jpNum } from './score.js';
import { Weapons, WEAPONS } from './weapons.js';
import { Engine, loadSettings, saveSettings } from './engine.js';
import { Player } from './player.js';
import { World } from './world.js';
import { Audio } from './audio.js';
import { Bosses } from './ui-boss.js';
import { Minimap } from './ui-minimap.js';
import { Popups, Banner, Confetti, flash, Avoid } from './ui-fx.js';
import { Happenings } from './zombie-events.js';
import { WeaponGrid } from './ui-weapons.js';
import { Input } from './input.js';

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
  _subT: -9999, _subPrio: 0, _multiT: -9999, _multiN: 0, _multiPts: 0,
  _zoneT: 0, _zone: '', _zoneWant: '', _zoneStable: 0, _zoneShownT: -9999, _zoneHideT: 0,
  _barFitKey: '', _rotT: 0,
  _fever: -1, _feverOn: false, _feverTxt: '', _chKey: '', _killcamT: 0, _boostTxt: '',

  init(root) {
    this.root = root;
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = 'hidden';
    hud.innerHTML = `
      <div class="fever-tint" id="feverTint"></div>
      <div class="pop-layer" id="popLayer"></div>
      <div class="vignette" id="vignette"></div>
      <div class="hud-tl">
        <canvas class="minimap" id="minimap" aria-hidden="true"></canvas>
        <div class="hud-stats"><span class="kills"><i>☠</i><b id="hudKills">0</b></span><span class="time" id="hudTime">0:00</span></div>
        <div class="hud-challenge hidden" id="hudChallenge"><small id="chText"></small><b id="chCount"></b><div class="ch-bar"><i id="chBar"></i></div><em id="chTime"></em></div>
      </div>
      <div class="hud-fever" id="hudFever"><span class="fv-label">無双</span><div class="fv-bar"><i id="fvFill"></i></div><b id="fvText"></b></div>
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
      <div class="hud-zone" id="hudZone"></div>
      <div class="banner" id="banner"><b></b><small></small></div>
      <div class="sub-banner" id="subBanner"></div>
      <div class="boss-arrow hidden" id="bossArrow"><i>▲</i><span>BOSS</span><small id="bossDist"></small></div>
      <div class="rot-hint" id="rotHint">📱 横向きにすると 大きく遊べます</div>
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
      sub: q('subBanner'), pause: q('btnPause'), zone: q('hudZone'), rot: q('rotHint'),
      fever: q('hudFever'), fvFill: q('fvFill'), fvText: q('fvText'), feverTint: q('feverTint'),
      ch: q('hudChallenge'), chText: q('chText'), chCount: q('chCount'), chBar: q('chBar'), chTime: q('chTime'),
      flash: $('flash'),
      spin: document.querySelector('.btn-spin'),
    };

    const low = Engine.quality === 'low';
    // 飛び出す数字は 少なめ(多すぎると主人公のまわりが見えない)
    this.dmg = new Popups(q('popLayer'), low ? 6 : Engine.quality === 'mid' ? 9 : 12, 'dmg');
    this.pts = new Popups(q('popLayer'), low ? 6 : Engine.quality === 'mid' ? 9 : 11, 'pts');
    this.banner = new Banner(q('banner'));
    // 大きな文字が出たら、下の 1 行は いったん引っこめる(重ならないように)。出たばかりなら あとで出しなおす
    this.banner.onPlay = () => {
      const s = this.el.sub, age = performance.now() - this._subT;
      if (!s.classList.contains('on') || age > 1300) return;
      s.classList.remove('on');
      if (age < 650 && !this._subWait) this._subWait = { html: s.innerHTML, cls: s.className.replace(/\bsub-banner\b|\bon\b/g, '').trim(), prio: this._subPrio, at: performance.now() };
    };
    this.confetti = new Confetti($('confettiLayer'), low ? 28 : 56);
    Bosses.init();
    Minimap.init(q('minimap'));

    // 回転斬りボタンに「たまり具合」の輪をつける
    if (this.el.spin) {
      const ring = document.createElement('i');
      ring.className = 'spin-ring';
      this.el.spin.appendChild(ring);
    }

    WeaponGrid.init(root, Input, Audio);
    this._buildWeaponBar();
    this._wireEvents();
    this._wireScreens();
    this._titleRecords();
  },

  show(v) {
    this.el.hud.classList.toggle('hidden', !v);
    this.el.weaponBar.classList.toggle('hidden', !v);
    if (v) { Minimap.resize(); this._buildWeaponBar(); this._barFitKey = ''; }
  },

  // ---------------- イベント ----------------
  _wireEvents() {
    Events.on('weaponChange', () => this._weapon(true));

    Events.on('hit', (h) => {
      if (!Score.active || this.paused || !h) return;
      const amt = h.amount || 0;
      if (amt < 4 && !h.crit) return;                   // 燃えている間の小さなダメージなどは出さない
      const now = performance.now();
      const gap = Engine.quality === 'low' ? 160 : Engine.quality === 'mid' ? 110 : 80;
      if (now - this._dmgT < (h.crit || h.boss ? gap * 0.5 : gap)) return;
      if (this._dmgFrame >= 2) return;
      this._dmgT = now; this._dmgFrame++;
      const big = h.crit ? 'dmg crit' : h.boss ? 'dmg boss' : 'dmg';
      this.dmg.spawn(h.x, (h.y || 1.2) + 0.4, h.z, h.crit ? fmt(amt) + '!' : fmt(amt), big, h.crit ? 1.2 : 1, h.crit ? 0.65 : 0.5, h.crit ? 44 : 30);
    });

    Events.on('score', (s) => {
      const p = s.points || 0;
      this._scoreBump = Math.min(1.45, Math.max(this._scoreBump, 1.1 + Math.min(0.35, p / 40000)));
      if (s.kind === 'boss') this._bossPts = p;
      if (s.x == null || this.paused) return;
      const now = performance.now();
      if (s.kind === 'kill') {
        this._comboBump = 1.35;
        if (now - this._ptsT < (Engine.quality === 'low' ? 150 : Engine.quality === 'mid' ? 100 : 75)) return;
        this._ptsT = now;
        const sz = p >= 10000 ? 1.35 : p >= 2000 ? 1.15 : 1;
        this.pts.spawn(s.x, 2.0, s.z, '+' + fmt(p), 'pts', sz, 0.8, 46);
      } else {
        if (s.kind === 'multi' && s.count >= 6) return;   // 大きいまとめ倒しは、まんなかの文字で見せる
        if (s.kind === 'milestone') return;
        const cls = s.kind === 'boss' ? 'pts boss' : 'pts multi';
        const txt = '+' + fmt(p);
        this.pts.spawn(s.x, 2.4, s.z, txt, cls, s.kind === 'boss' ? 2 : 1.5, s.kind === 'boss' ? 2.2 : 1.3, 80);
      }
    });

    // まとめて倒した: 続けて来たら 1 行にまとめて数を足していく(何行も重ならない)
    Events.on('multiKill', (m) => {
      if (this.paused || m.count < 6) return;
      const now = performance.now();
      if (now - this._multiT < 1000) { this._multiN += m.count; this._multiPts += m.points || 0; }
      else { this._multiN = m.count; this._multiPts = m.points || 0; }
      this._multiT = now;
      const n = this._multiN;
      const word = n >= 30 ? '大量撃破!!' : n >= 15 ? 'まとめて撃破!' : 'まとめ倒し!';
      this._sub(`<b>${n}体</b> ${word} <em>+${fmt(this._multiPts)}</em>`, n >= 15 ? 'big' : '', 1);
    });

    // 区切りの数: 小さいものは 下の 1 行、大きいものだけ 大きな文字
    Events.on('milestone', (m) => {
      const bonus = m.bonus ? ' <em>+' + fmt(m.bonus) + '</em>' : '';
      const small = (m.kind === 'kills' && m.value < 100) || (m.kind === 'combo' && m.value < 50);
      if (small) { this._sub(`<b>${m.text}</b>${bonus}`, 'ms', 2); return; }
      const style = m.kind === 'combo' ? (m.value >= 200 ? 'massacre' : 'combo') : m.kind === 'kills' ? 'kills' : 'gold';
      const sub = m.bonus ? 'ボーナス +' + fmt(m.bonus) : '';
      this.banner.show(m.text, sub, style, m.value >= 100 ? 1.7 : 1.4, 1);
      if (m.value >= 100) flash(this.el.flash, m.kind === 'combo' ? '#ff3b6b' : '#ffd23f', 0.18, 300);
    });

    Events.on('newRecord', () => {
      this.banner.show('最高記録 更新!', 'NEW RECORD', 'record', 2.4, 3);
      flash(this.el.flash, '#ffe680', 0.4, 500);
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
      flash(this.el.flash, '#fff3b0', 0.38, 450);
      if (Score.active) this.confetti.burst(Engine.quality === 'low' ? 16 : 30);
    });

    Events.on('horde', (h) => {
      this.banner.show('大群が来るぞ!', (h && h.text) || (h && h.count ? h.count + '体 接近中' : ''), 'horde', 2.2, 2);
      flash(this.el.flash, '#ff7a1f', 0.25, 500);
    });

    // ---- 無双モード ----
    Events.on('feverStart', (f) => {
      const mult = f && f.mult ? f.mult : 2;
      this.banner.show('無双モード!!', `点数 ×${mult % 1 ? mult.toFixed(1) : mult} ・ ${Math.round((f && f.dur) || 12)}秒`, 'fever', 2.2, 3);
      flash(this.el.flash, '#ffd23f', 0.45, 600);
      this.el.hud.classList.add('fever');
      if (Engine.quality !== 'low') this.confetti.burst(24);
      Engine.shake(0.5);
    });
    Events.on('feverEnd', (f) => {
      this.el.hud.classList.remove('fever');
      if (f && f.kills > 0) this._sub(`無双モード 終了 <b>${fmt(f.kills)}体</b> <em>+${fmt(f.points || 0)}</em>`, 'big', 3);
    });
    // ---- 出来事 ----
    Events.on('worldEvent', (w) => this._worldEvent(w || {}));
    Events.on('worldChange', (w) => { if (w && w.text && Score.active) this._sub(`<b>${w.text}</b>`, 'ms', 1); });
    Events.on('personalBest', (p) => {
      const what = p.kind === 'combo' ? '最大コンボ' : p.kind === 'kills' ? '倒した数' : 'まとめ倒し';
      this._sub(`🏅 自己ベスト更新! <b>${what}</b> <em>これまで ${fmt(p.prev)}</em>`, 'pb', 4);
      flash(this.el.flash, '#7dff6b', 0.15, 300);
    });
    Events.on('shieldBreak', (s) => { if (s && !this.paused) this.pts.spawn(s.x, 2.3, s.z, '盾 破壊!', 'pts shield', 1.25, 0.9, 50); });
    // 大量撃破: 一瞬スロー(キルカム)。ときどきだけ
    Events.on('multiKill', (m) => {
      if (!Score.active || this.paused || !m) return;
      const need = Score.feverActive ? 45 : 28, now = performance.now();
      if (m.count < need || now - this._killcamT < 14000) return;
      this._killcamT = now;
      Engine.slowMo(0.55, 0.3);
      flash(this.el.flash, '#ffffff', 0.18, 260);
      this.el.hud.classList.remove('killcam'); void this.el.hud.offsetWidth; this.el.hud.classList.add('killcam');
    });

    Events.on('comboEnd', (c) => {
      if (c.combo >= 30) this._sub(`コンボ <b>${fmt(c.combo)}</b> 達成!`, '', 0);
    });

    Events.on('start', () => {
      this._resetHud();
      this.banner.show('スタート!', 'ゾンビをなぎ倒せ!', 'start', 1.5, 2);
      this._zoneShownT = -9999; this._zoneT = 1.2;                // 少したってから 今いる場所を出す
      if (innerHeight > innerWidth) this._rotHint();
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
    this.el.sub.classList.remove('on'); this._subWait = null;
    this.el.hud.classList.remove('fever', 'killcam');
    this.el.ch.classList.add('hidden'); this._chKey = ''; this._fever = -1;
    this._subT = -9999; this._multiT = -9999;
    this._zone = ''; this._zoneWant = ''; this.el.zone.classList.remove('on');
    this.el.rot.classList.remove('on');
    this._weapon(false);
  },

  // 下の 1 行(まとめ倒し・小さな区切り)。いつも 1 行だけ。出ている間は、大事なほう(prio)を優先し、
  // すぐ次が来たら 文字だけ入れかえる(動きを最初からやり直さない = ちらつかない)
  _sub(html, cls, prio = 1) {
    // 大きな文字が出ている間は 順番待ち(重ならないように)。いちばん大事な 1 つだけ覚えておき、大きな文字が消えたら出す
    if (this.banner.t > 0.05) {
      const w = this._subWait;
      if (!w || prio >= w.prio || performance.now() - w.at > 1500) this._subWait = { html, cls, prio, at: performance.now() };
      return;
    }
    const s = this.el.sub, now = performance.now(), age = now - this._subT;
    if (age < 700 && prio < this._subPrio) return;
    s.innerHTML = html;
    if (age < 380) { s.className = 'sub-banner on ' + (cls || ''); }
    else {
      s.className = 'sub-banner ' + (cls || '');
      void s.offsetWidth;
      s.classList.add('on');
      this._subT = now;
    }
    this._subPrio = prio;
  },

  // 出来事の文字(大きな文字 / 下の 1 行)
  _worldEvent(w) {
    if (!Score.active) return;
    const k = w.kind, t = w.text || '', s = w.sub || '';
    const B = (style, dur, prio) => this.banner.show(t, s, style, dur, prio);
    switch (k) {
      case 'supply': B('supply', 2.2, 2); break;
      case 'supplyOpen': B('gold', 2.0, 3); flash(this.el.flash, '#ffd23f', 0.3, 400); if (Engine.quality !== 'low') this.confetti.burst(20); break;
      case 'golden': B('golden', 2.4, 2); flash(this.el.flash, '#ffe680', 0.2, 400); break;
      case 'goldenDown': B('golden', 2.2, 3); this.confetti.burst(Engine.quality === 'low' ? 16 : 36); break;
      case 'march': case 'tsunami': case 'skyfall': B('horde', 2.3, 2); flash(this.el.flash, '#ff7a1f', 0.22, 450); break;
      case 'airstrike': B('airstrike', 2.0, 2); break;
      case 'bossrush': B('boss', 2.6, 3); flash(this.el.flash, '#ff1a1a', 0.4, 600); this.el.vignette.classList.add('boss'); break;
      case 'bossrushClear': case 'challengeClear': B('gold', 2.2, 3); this.confetti.burst(Engine.quality === 'low' ? 16 : 30); flash(this.el.flash, '#ffe680', 0.3, 450); break;
      case 'challenge': B('challenge', 2.2, 2); break;
      case 'discover': B('discover', 1.9, 1); break;
      case 'airstrikeDone': this._sub(`<b>${t}</b> <em>${s}</em>`, 'big', 2); break;
      default: this._sub(`<b>${t}</b>${s ? ' ' + s : ''}`, '', 1);
    }
  },

  // 無双ゲージ・チャレンジの残り(毎フレーム)
  _updateFever() {
    const el = this.el, f = Math.round((Score.fever || 0) * 200) / 200, on = !!Score.feverActive;
    if (f !== this._fever || on !== this._feverOn) {
      this._fever = f; this._feverOn = on;
      el.fvFill.style.transform = `scaleX(${f.toFixed(3)})`;
      el.fever.classList.toggle('on', on);
      el.fever.classList.toggle('near', !on && f >= 0.8);
    }
    let txt = on ? Math.ceil(Score.feverT) + '秒' : Math.floor(f * 100) + '%';
    if (Score.boostT > 0) txt = `×${Score.boostMult} ` + Math.ceil(Score.boostT) + '秒';
    if (txt !== this._feverTxt) { this._feverTxt = txt; el.fvText.textContent = txt; }
    // チャレンジ
    const c = Happenings.challenge;
    if (!c) { if (this._chKey) { this._chKey = ''; el.ch.classList.add('hidden'); } return; }
    if (this._chKey !== c.text) { this._chKey = c.text; el.ch.classList.remove('hidden', 'done'); el.chText.textContent = c.text; }
    const cnt = Math.min(c.count, c.goal) + ' / ' + c.goal, tm = Math.max(0, Math.ceil(c.t)) + '秒';
    if (el.chCount.textContent !== cnt) el.chCount.textContent = cnt;
    if (el.chTime.textContent !== tm) el.chTime.textContent = tm;
    el.chBar.style.transform = `scaleX(${Math.min(1, c.count / c.goal).toFixed(3)})`;
    el.ch.classList.toggle('hurry', c.t < 6);
  },

  // 縦向きのとき、横向きをすすめる(数秒だけ)
  _rotHint() {
    const r = this.el.rot;
    r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
  },

  // 今いる場所の名前(変わったときだけ、少しのあいだ出す)
  _updateZone(dt) {
    if ((this._zoneT -= dt) > 0) return;
    this._zoneT = 0.3;
    let name = '';
    try { name = typeof World.zoneName === 'function' ? World.zoneName(Player.pos.x, Player.pos.z) : ''; } catch (e) { name = ''; }
    if (!name) return;
    if (name !== this._zoneWant) { this._zoneWant = name; this._zoneStable = 0; return; }
    if (name === this._zone) return;
    // 同じ場所に 0.6 秒いたら 出す(境目を行ったり来たりしても ちらつかない)
    if ((this._zoneStable += 0.3) < 0.6) return;
    const now = performance.now();
    if (now - this._zoneShownT < 2500) return;
    this._zone = name; this._zoneShownT = now;
    const z = this.el.zone;
    z.textContent = '📍 ' + name;
    z.classList.remove('on'); void z.offsetWidth; z.classList.add('on');
  },

  // 右上の武器の列が、点数とぶつからない幅にする(点数のけたが増えたときと、画面の大きさが変わったとき)
  _fitWeaponBar() {
    const bar = this.el.weaponBar, W = innerWidth, H = innerHeight;
    const key = W + 'x' + H + ':' + this._lastScoreTxt.length;
    if (key === this._barFitKey) return;
    this._barFitKey = key;
    if (H > W) { bar.style.maxWidth = ''; return; }
    const sr = this.el.score.getBoundingClientRect(), br = bar.getBoundingClientRect();
    const right = br.right || (W - 62);
    // 点数の右はし(いちばん大きくふくらんだとき)+ すきま
    const scoreRight = W / 2 + Math.max(sr.width / 2, 90) * 1.12 + 10;
    bar.style.maxWidth = Math.max(92, Math.floor(right - scoreRight)) + 'px';
  },

  // ---------------- 武器 ----------------
  _buildWeaponBar() {
    const bar = this.el.weaponBar;
    if (!bar || bar.childElementCount === WEAPONS.length + 1) { this._weapon(false); return; }
    bar.innerHTML = '';
    // いちばん左: ぜんぶ ならべて えらぶ(31 種類あるので)
    const all = document.createElement('button');
    all.type = 'button'; all.className = 'wbtn wall'; all.setAttribute('aria-label', '武器をぜんぶ見る');
    all.innerHTML = '<span>▦</span><small>全部</small>';
    all.addEventListener('click', (e) => { e.preventDefault(); Audio.click(); WeaponGrid.show(); });
    all.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.appendChild(all);
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
      [...bar.children].forEach((b, i) => b.classList.toggle('on', i - 1 === Weapons.index));
      const cur = bar.children[Weapons.index + 1];
      if (cur && bar.scrollWidth > bar.clientWidth) {
        const left = cur.offsetLeft - bar.clientWidth / 2 + cur.offsetWidth / 2 - 24;
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
    if (txt !== this._lastScoreTxt) { el.score.textContent = txt; this._lastScoreTxt = txt; this._fitWeaponBar(); }
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
    this._updateFever();
    Bosses.update(gdt);
    this._updateBoss(dt);

    // 数字をよける場所: 主人公のまわり・上の点数の帯・右下のボタン
    const hp = Engine.viewMode === 'fps' ? null : Engine.project(Player.pos.x, 1.0, Player.pos.z, _pt2);
    Avoid.hx = hp ? hp.x : -999; Avoid.hy = hp ? hp.y : -999;
    const close = Engine.viewMode !== 'top';
    if (close !== this._close) { this._close = close; el.hud.classList.toggle('close', close); this._avoidT = 0; }
    if ((this._avoidT = (this._avoidT || 0) - dt) <= 0) {        // 大きさを測るのは ときどき(重くしない)
      this._avoidT = 0.5;
      Avoid.top = (Bosses.list.length ? el.boss.getBoundingClientRect().bottom : el.scoreBox.getBoundingClientRect().bottom) + 4;
      // 肩越し・一人称: 大きな文字は 点数(ボスの体力)のすぐ下へ(照準のまわりを あける)
      const lc = Math.round(Avoid.top + 2) + 'px';
      if (lc !== this._laneC) { this._laneC = lc; el.hud.style.setProperty('--laneC', lc); }
      // 大きな文字の場所(ボスの矢印が よける)
      this._banRect = this.banner.t > 0 ? this.banner.main.getBoundingClientRect() : null;
      this._chRect = el.ch.classList.contains('hidden') ? null : el.ch.getBoundingClientRect();
    }
    this.dmg.update(gdt); this.pts.update(gdt);
    if (!this.paused) this._updateZone(dt);
    this._dmgFrame = 0;
    this.banner.update(dt);
    // 順番待ちの 下の 1 行(古すぎるものは 出さない)
    const sw = this._subWait;
    if (sw && this.banner.t <= 0.05 && !this.paused) {
      this._subWait = null;
      if (performance.now() - sw.at < 3500) this._sub(sw.html, sw.cls, sw.prio);
    }
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
    // 画面の向き: 見下ろしは 北が上。肩越し・一人称は 見ている向きが上(うしろなら下)
    let ux = dx / l, uy = dz / l;
    if (Engine.viewMode !== 'top') {
      const y = Engine.lookYaw, fx = Math.sin(y), fz = -Math.cos(y);
      const r = ux * -fz + uy * fx, f = ux * fx + uy * fz;      // 右向き(cos, sin) = (-fz, fx)
      const m = Math.hypot(r, f) || 1; ux = r / m; uy = -f / m;
    }
    const TOP = Math.max(innerHeight > innerWidth ? 200 : 120, Avoid.top + 26);      // 上は点数・ボスの体力の下まで
    const hw = W / 2 - M, hh = uy < 0 ? H / 2 - TOP : H / 2 - M - 26;   // 下は 無双ゲージの上まで
    const t = Math.min(hw / Math.abs(ux || 1e-6), hh / Math.abs(uy || 1e-6));
    let x = W / 2 + ux * t, y = H / 2 + uy * t;
    // 左上のミニマップ・右上の武器の列・右下のボタンにかぶらないように
    if (x < 130 && y < 160) { if (uy < -0.5) x = 130; else y = 160; }
    const cr = this._chRect;                              // 左上のチャレンジの札
    if (cr && x < cr.right + 30 && y < cr.bottom + 30) { if (uy < -0.5) x = cr.right + 30; else y = cr.bottom + 30; }
    if (x > W - 330 && y < 70) y = 70;
    const BW = W > H ? 360 : 250, BH = W > H ? 230 : 330;   // 右下のボタン(撃つ・回転斬り・ダッシュ・武器)の場所
    if (x > W - BW && y > H - BH) { if (ux > 0.5 && uy < 0.5) y = H - BH; else x = W - BW; }
    if (W > H && x > W - 200 && y > 50 && y < H - BH) x = W - 200;   // 右の コンボ・武器の名前 にかぶらない
    // まんなかの大きな文字に かぶらない(横へ よける)
    const br = this.banner.t > 0 ? this._banRect : null;
    if (br && y > br.top - 30 && y < br.bottom + 30 && x > br.left - 30 && x < br.right + 30) x = x < (br.left + br.right) / 2 ? br.left - 30 : br.right + 30;
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
    // 視点をえらぶ(カメラ係の ViewHud があるときだけ)
    document.querySelectorAll('.view-open').forEach((b) => b.addEventListener('click', () => {
      const vh = window.__game && window.__game.ViewHud;
      if (vh && typeof vh.openPanel === 'function') { try { vh.openPanel(); } catch (e) { console.warn(e); } }
    }));
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
    // このプレイの記録(いちばん使った武器・最大まとめ倒し・無双モード・出来事・見つけた場所)
    const ex = $('resultExtra');
    if (ex) {
      const st = Score.stats || {}, fav = Score.favoriteWeapon();
      const items = [];
      if (fav && fav.n > 0) items.push(['いちばん倒した武器', `${fav.name} <small>${fmt(fav.n)}体</small>`]);
      if (st.bestMulti) items.push(['最大まとめ倒し', fmt(st.bestMulti) + '体']);
      if (st.fevers) items.push(['無双モード', st.fevers + '回' + (st.feverBest ? ` <small>最高 ${fmt(st.feverBest)}体</small>` : '')]);
      if (st.events) items.push(['出来事クリア', st.events + '回']);
      if (st.found) items.push(['見つけた場所', st.found + 'か所']);
      if (st.golden) items.push(['金色ゾンビ', st.golden + '体']);
      ex.innerHTML = items.map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('');
      ex.classList.toggle('hidden', !items.length);
    }
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
const _pt = {}, _pt2 = {};

export { jpNum };
