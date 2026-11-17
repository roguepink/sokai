// 演出係(第4弾): ボスの「登場 → なぐられた → 怒り → 撃破(大当たり)」の演出。ノブさんの依頼
// 「ボスは巨大で こわく。倒したときの爽快感が クセになって やめられない仕組みを」。
//
// 登場(bossSpawn・約 2 秒・操作は止めない):
//   0.0 警報の帯「⚠ 巨大ボス接近」+ 地鳴り(画面がだんだん強くゆれる)+ 上下の黒い帯 + カメラがボスへ(見下ろし = 引いて寄せる /
//       肩越し・一人称 = カメラだけ ふり向く)+ サイレンと太鼓
//   0.35 名札「第3の災厄」「巨人タイラント」二つ名・脅威度の ●●●○○(・全長 18m)
//   0.9 咆哮(ドン! と大きくゆれる)   2.0 名札が消え、体力バーが出る
// なぐられた(heroHit {x,z,force,boss}): 赤い衝撃のふち(来た向きが濃い)+ 色ずれ + 重い音 + ぶるっ(主人公は無敵。短く)
// 怒り(bossPhase {e, phase}): 「怒り状態!」「最終形態!!」+ 画面が赤く脈打つ + 咆哮 + 体力バーに ひび(ui.js)
// 撃破(score.js の bossJackpot。1 体につき 1 回):
//   0.0 一瞬止まる → スロー + 白金の光 + 光のにじみ + 上下の黒い帯 + カメラがボスへ + 光の柱
//   0.1 「BOSS 撃破!!」のハンコ   0.35 お金・宝石が飛び出して 点数へ吸いこまれる(チャリン・音がだんだん高く)
//   0.6〜 ごほうびの内わけが 1 行ずつ(瞬殺ボーナス・ボス連続撃破・コンボ・初撃破・自己ベスト)→ JACKPOT の合計が くるくる上がる
//   ボスの体が地面に落ちた(bossFall。来なければ 倒して 1.6 秒[ゲームの時間]後)= 金の衝撃波が 画面のゾンビを ぜんぶ吹きとばす
//   そのあと 無双モード(score.js)→ 演出おわり
// 第5弾: 大怪獣(kaiju)は 特別あつかい。
//   予告(kaijuOmen {sec}・9 秒): 画面のふちが 暗くなる + 「…何かが 来る」+ 遠くの 地ひびき(だんだん 近く・強く)
//   登場: 「⚠ 超巨大怪獣 出現 ⚠」「最強の災厄」+ 高さ・全長。カメラは 遠くの 低い所へ 移って 全身を 映す(kaiju-cam.js の 場面カット。3.9 秒。その間 主人公は 止まる)
//   怒り・倒れる所も 全身が入る 短い 場面カット。カットの間は HUD を 引っこめる(body.cine)
//   音: 足音(kaijuStep)・ほえ声・息・しっぽ(bossAct の type が kaiju のとき)
// 次のボス: 「👹 次のボスまで 0:24」の札(ボスがいない間)。のこり 3 秒から カウントの音
import { Events } from './events.js';
import { Engine } from './engine.js';
import { Score } from './score.js';
import { Player } from './player.js';
import { Zombies } from './zombies.js';
import { Director } from './director.js';
import { BOSS_ORDER } from './boss.js';
import { Audio } from './audio.js';
import { Bosses } from './ui-boss.js';
import { BossDex, bossLook } from './ui-bossdex.js';
import { BossFX } from './fx-boss.js';
import { flash } from './ui-fx.js';
import { KaijuCam } from './kaiju-cam.js';

// 大怪獣の 動き(bossAct の act)→ 音の名前
const KAIJU_SND = { roar: 'kaijuRoar', howl: 'kaijuHowl', breathFire: 'kaijuBreath', tailSwing: 'kaijuTail', death: 'kaijuDeath', nova: 'kaijuHowl' };

const fmt = (n) => Math.floor(n).toLocaleString();
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const NOVA_FALLBACK = 1.6;      // bossFall が来ないとき、倒して何秒(ゲームの時間)で衝撃波
const N_COINS = 40;
const KAIJU_BONUS = 1000000;    // 大怪獣の 討伐ボーナス(無双などの倍率が かかる)

export const BossShow = {
  ui: null, el: {},
  intro: null,               // 登場の演出中 {t, e, big}
  seq: null,                 // 撃破の演出中
  _pending: [],              // 衝撃波を待っているボス {e, x, z, size, g(ゲームの秒), r(実時間)}
  _waves: [],                // 走っている衝撃波
  _introAt: -1e9, _hitAt: -1e9, _heroHitSeen: false,
  _chipT: 0, _chipTxt: '', _chipOn: false, _tick: -1,
  _coins: [], _coinN: 0,

  init(hud, ui) {
    this.ui = ui;
    const L = document.createElement('div');
    L.className = 'bs-layer hidden';
    L.innerHTML = `
      <div id="bsOmen" style="position:absolute;inset:0;opacity:0;transition:opacity 2.5s ease;background:radial-gradient(ellipse at 50% 45%, rgba(4,10,6,.3) 0%, rgba(4,10,6,.62) 58%, rgba(2,5,3,.94) 100%)"></div>
      <div class="bs-hit" id="bsHit"></div>
      <div class="bs-chroma" id="bsChroma"></div>
      <div class="bs-rage" id="bsRage"></div>
      <div class="bs-alert" id="bsAlert"><span>⚠ 巨大ボス接近 ⚠</span></div>
      <div class="bs-card" id="bsCard"><small id="bsOrd"></small><b id="bsName"></b><em id="bsTitle"></em>
        <div class="bs-threat"><span>脅威度</span><span class="pips" id="bsPips"></span><small id="bsSize"></small></div></div>
      <div class="bs-stamp" id="bsStamp"><b>BOSS 撃破!!</b><small id="bsStampSub"></small><em id="bsSpeed"></em></div>
      <div class="bs-jack" id="bsJack"><ul id="bsLines"></ul><div class="bs-total"><span>JACKPOT</span><b id="bsTotal">0</b></div></div>
      <div class="bs-nova" id="bsNova"></div>
      <div class="bs-coins" id="bsCoins"></div>
      <div class="bs-chip hidden" id="bsChip"><i>👹</i><span id="bsChipTxt"></span><b id="bsChipT"></b><em id="bsChipNew">NEW</em><em class="chain" id="bsChipChain"></em></div>`;
    // 操作のボタン・武器の列より上(z-index 14)。HUD と いっしょに 出し入れする(UI.show)
    (hud.parentNode || document.body).appendChild(L);
    const q = (id) => L.querySelector('#' + id);
    this.el = {
      layer: L, omen: q('bsOmen'), hit: q('bsHit'), chroma: q('bsChroma'), rage: q('bsRage'), alert: q('bsAlert'), card: q('bsCard'), ord: q('bsOrd'), name: q('bsName'), title: q('bsTitle'),
      pips: q('bsPips'), size: q('bsSize'), stamp: q('bsStamp'), stampSub: q('bsStampSub'), speed: q('bsSpeed'), jack: q('bsJack'), lines: q('bsLines'), total: q('bsTotal'),
      nova: q('bsNova'), coins: q('bsCoins'), chip: q('bsChip'), chipTxt: q('bsChipTxt'), chipT: q('bsChipT'), chipNew: q('bsChipNew'), chipChain: q('bsChipChain'),
    };
    // お金・宝石(使い回す)
    const low = Engine.quality === 'low';
    const n = low ? 22 : N_COINS;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'bs-coin ' + (i % 5 === 3 ? 'gem g1' : i % 7 === 5 ? 'gem g2' : i % 9 === 7 ? 'gem g3' : 'gold');
      this.el.coins.appendChild(c);
      this._coins.push({ el: c, anim: null });
    }

    Events.on('bossSpawn', (d) => this._onSpawn(d || {}));
    Events.on('heroHit', (d) => { this._heroHitSeen = true; this._onHeroHit(d || {}); });
    // ボス係の heroHit がまだ無いとき: ボスの攻撃が近くに来たら 軽く
    Events.on('zombieAttack', (d) => { if (d && d.boss && !this._heroHitSeen) this._onHeroHit({ x: d.x, z: d.z, force: 8, light: true }); });
    Events.on('bossPhase', (d) => this._onPhase(d || {}));
    Events.on('bossJackpot', (j) => this._onJackpot(j || {}));
    Events.on('bossFall', (d) => this._onFall(d || {}));
    // ---- 大怪獣 ----
    Events.on('kaijuOmen', (d) => this._onOmen(d || {}));
    Events.on('kaijuStep', (d) => { if (!d) return; Audio.play('kaijuStep', d); if (d.d < 70) Audio.vibrate(d.heavy ? [60, 30, 60] : 35); });
    Events.on('bossAct', (d) => {
      if (!d || d.type !== 'kaiju') return;
      const snd = KAIJU_SND[d.act];
      if (snd) Audio.play(snd, d.act === 'breathFire' ? { dur: d.e && d.e.state === 'breath2' ? 4.4 : 2.8 } : d);
      if (d.act === 'roar' || d.act === 'howl') Audio.vibrate([60, 40, 60, 40, 200]);
    });
    Events.on('bossDeath', (d) => { if (d && d.e && d.e.type === 'kaiju') this._omenDark(0); });
    KaijuCam.onCut = (on) => document.body.classList.toggle('cine', !!on);
    Events.on('feverStart', () => { if (this.seq) this.seq.fever = true; });
    Events.on('pause', () => L.classList.add('paused'));
    Events.on('resume', () => L.classList.remove('paused'));
    Events.on('reset', () => this.clear());
    Events.on('start', () => this.clear());
  },

  clear() {
    this.intro = null; this.seq = null; this.omen = null; this._pending.length = 0; this._waves.length = 0;
    document.body.classList.remove('cine');
    this._omenDark(0);
    if (Score._nova) Score._nova = null;
    this._introAt = -1e9; this._tick = -1; this._chipTxt = ''; this._chipOn = false; this._chainTxt = null;
    const el = this.el; if (!el.layer) return;
    for (const k of ['alert', 'card', 'stamp', 'jack']) el[k].classList.remove('on', 'out');
    el.layer.classList.remove('paused');
    el.chip.classList.add('hidden');
    for (const c of this._coins) { if (c.anim) { c.anim.cancel(); c.anim = null; } c.el.style.opacity = '0'; }
    if (this.ui && this.ui.el.hud) this.ui.el.hud.classList.remove('bossintro', 'bosscam');
  },

  get busy() { return !!(this.intro || this.seq); },
  get introActive() { return !!this.intro; },

  // ---------------- 大怪獣の 予告 ----------------
  _omenDark(v) { const o = this.el.omen; if (o) o.style.opacity = String(v); },
  _onOmen(d) {
    if (!Score.active) return;
    this.omen = { t: 0, sec: d.sec || 9, next: 0.4, n: 0 };
    // 画面のふちを 暗く(第5弾の仕上げ: ひかえめに。夜は もっと弱く = 暗いと 見づらいので)
    let night = 0; try { night = Engine.ctx && Engine.ctx.World ? Engine.ctx.World.night || 0 : 0; } catch (err) { /* なし */ }
    this._omenDark(0.62 - 0.3 * night);
    this.ui.banner.show('…何かが 来る', '大地が ふるえている', 'boss', 3.4, 2);
    this.ui.el.vignette.classList.add('boss');
  },
  _omenStep(dt) {
    const o = this.omen; if (!o) return;
    o.t += dt;
    const k = Math.min(1, o.t / o.sec);
    // 遠くの 足音: だんだん 近く・強く・速く
    if (o.t >= o.next) {
      o.next = o.t + 1.5 - 0.6 * k; o.n++;
      Engine.shake(0.12 + 0.5 * k);
      Audio.play('kaijuOmen', { k });
      if (k > 0.4) Audio.vibrate(20 + 40 * k);
      if (o.n === 4) this.ui._sub('⚠ <b>超巨大な 何か</b>が 近づいてくる…', 'big', 3);
    }
    if (o.t > o.sec + 1) this.omen = null;      // 出たら 登場の演出へ(暗さは 登場のあとで うすく)
  },

  // ---------------- 登場 ----------------
  _onSpawn(d) {
    if (!Score.active) return;
    const e = d.e || (Bosses.list.length ? Bosses.list[Bosses.list.length - 1].e : null);
    const now = performance.now(), name = d.name || (e && e.name) || 'ボス';
    // 続けて出たとき(ボスラッシュなど)は 1 行だけ
    if (now - this._introAt < 8000 || this.seq) {
      this.ui._sub(`⚠ <b>${name}</b> も出現!`, 'big', 3);
      return;
    }
    this._introAt = now;
    const ui = this.ui, el = this.el;
    this._chipOn = false; el.chip.classList.add('hidden');
    const size = bossSize(e), info = e ? Bosses.info(e) : null, n = info ? info.n : Bosses.seen || 1;
    const look = bossLook(e && e.type, e);
    const kj = !!e && e.type === 'kaiju';
    el.alert.firstElementChild.textContent = kj ? '⚠ 超巨大怪獣 出現 ⚠' : '⚠ 巨大ボス接近 ⚠';
    // 大怪獣: まず 全身だけを 見せる(場面カット)→ 1.3 秒後に 名札(画面の下)。警報の帯は いちばん上
    const tallScr = innerWidth < innerHeight;
    const cut = kj && KaijuCam.startCut('intro', 3.9, { inT: 0.5, outT: 0.9, dolly: 0.09, bottom: tallScr ? -0.6 : -0.8, top: 0.8 });
    el.alert.style.animationDuration = kj ? '3.8s' : ''; el.alert.style.top = cut ? 'calc(var(--sat) + 6px)' : '';
    el.card.style.animationDuration = kj ? '2.4s' : ''; el.card.style.animationDelay = cut ? '1.3s' : '';
    el.ord.textContent = kj ? '最強の災厄' : `第${n}の災厄`;
    el.name.textContent = name;
    el.card.style.setProperty('--nlen', String(Math.max(6, [...name].length + 1)));
    el.title.textContent = look.title;
    const th = threat(e, size);
    el.pips.innerHTML = '<i class="on"></i>'.repeat(th) + '<i></i>'.repeat(5 - th);
    el.size.textContent = kj ? `高さ ${Math.round(e.size)}m・全長 ${e.def.len || 150}m` : e && e.size ? `全長 ${Math.round(e.size)}m` : '';
    el.size.style.letterSpacing = kj ? '0' : '';
    el.card.classList.toggle('t5', th >= 5);
    replay(el.alert); replay(el.card);
    const dur = kj ? 3.8 : 2.0;
    ui.banner.hold(dur + 0.1);
    ui.el.hud.classList.remove('bossintro'); void ui.el.hud.offsetWidth; ui.el.hud.classList.add('bossintro');
    flash(ui.el.flash, '#ff1a1a', 0.35, 600);
    ui.el.vignette.classList.add('boss');
    el.card.style.top = cut ? (tallScr ? '72%' : '63%') : '';      // 大怪獣: 名札は 下へ(全身が 上に 映る)
    if (kj) { this._omenDark(0.2); this.omen = null; if (!cut) Engine.focusOn(e.x, 60, e.z, 3.6, { weight: 1, zoom: 1, pitch: 0, inT: 0.5, outT: 0.7 }); }
    else if (e) {
      Engine.focusOn(e.x, size * 0.6, e.z, 2.0, { weight: 0.55, zoom: 1.2 + Math.min(0.35, size / 60), pitch: 0.2, inT: 0.35, outT: 0.5 });
      BossFX.bossIntro(e.x, e.z, size);
    }
    Audio.play('bossIntro', { size });
    Audio.vibrate([30, 50, 30, 50, 40, 40, 140]);
    this.intro = { t: 0, e, roared: false, dur: dur + 0.05, y: kj ? 60 : size * 0.6, kj };
  },

  _introStep(dt) {
    const it = this.intro; if (!it) return;
    it.t += dt;
    // 地鳴り: だんだん強く → 咆哮で ドン
    if (it.kj) { if (it.t < 0.9) Engine.shake(0.15 + 0.2 * it.t / 0.9); }      // 大怪獣は 足音と ほえ声で ゆれる
    else if (it.t < 0.9) Engine.shake(0.18 + 0.35 * it.t / 0.9);
    else if (!it.roared) { it.roared = true; Engine.shake(1.1); Engine.fovKick(6); }
    if (it.e && it.e.alive !== false) Engine.focusTrack(it.e.x, it.y, it.e.z);
    if (it.t >= (it.dur || 2.05)) {
      if (it.kj) this._omenDark(0.1);          // 戦いの間は ほんの少しだけ 暗いまま(暗いと 見づらいので ひかえめ)
      this.intro = null;
      this.ui.el.hud.classList.remove('bossintro');
    }
  },

  // ---------------- なぐられた ----------------
  _onHeroHit(d) {
    if (!Score.active || this.ui.paused) return;
    const now = performance.now();
    if (now - this._hitAt < (d.light ? 600 : 280)) return;
    this._hitAt = now;
    const s = Math.max(0.35, Math.min(1, (d.force || 12) / 20)) * (d.light ? 0.55 : 1);
    // 来た向き(ボスの場所、なければ当たった場所)→ 画面のふちの 濃いところ
    const src = d.boss && typeof d.boss === 'object' && d.boss.x != null ? d.boss : d.e && d.e.x != null ? d.e : d;
    let hx = 50, hy = 50;
    const dx = (src.x != null ? src.x : Player.pos.x) - Player.pos.x, dz = (src.z != null ? src.z : Player.pos.z) - Player.pos.z, l = Math.hypot(dx, dz);
    if (l > 0.5) {
      let ux = dx / l, uy = dz / l;
      if (Engine.viewMode !== 'top') {
        const y = Engine.lookYaw, fx = Math.sin(y), fz = -Math.cos(y);
        const r = ux * -fz + uy * fx, f = ux * fx + uy * fz; ux = r; uy = -f;
      }
      hx = 50 + ux * 48; hy = 50 + uy * 48;
    }
    const el = this.el;
    el.hit.style.setProperty('--hx', hx.toFixed(0) + '%'); el.hit.style.setProperty('--hy', hy.toFixed(0) + '%');
    anim(el.hit, [{ opacity: 0.95 * s }, { opacity: 0.6 * s, offset: 0.25 }, { opacity: 0 }], 560 * (0.6 + 0.4 * s));
    anim(el.chroma, [{ opacity: 0.9 * s, transform: 'translateX(-7px)' }, { opacity: 0.6 * s, transform: 'translateX(6px)', offset: 0.35 }, { opacity: 0, transform: 'translateX(0)' }], 280);
    if (!d.light) { Engine.hitStop(0.035 + 0.03 * s); Engine.fovKick(-5 * s); }
    BossFX.heroHit(Player.pos.x, Player.pos.z);
    Audio.play('heroHit', { s });
    Audio.vibrate(d.light ? 35 : [70, 30, 45]);
  },

  // ---------------- 怒り ----------------
  _onPhase(d) {
    if (!Score.active) return;
    const e = d.e, ph = d.phase || 2, name = (e && e.name) || 'ボス';
    const last = ph >= 3 || (e && e.phases && ph >= e.phases);
    this.ui.banner.show(last ? '最終形態!!' : '怒り状態!', last ? `${name} ・ とどめを刺せ!` : `${name} が 本気になった!`, 'rage', 1.9, 3);
    replay(this.el.rage);
    if (e && e.type === 'kaiju' && KaijuCam.sinceCut() > 10) KaijuCam.startCut('rage', 2.1, { inT: 0.35, outT: 0.65, dolly: 0.1, bottom: -0.8, top: 0.62 });      // 全身が入る 短い場面(文字は 上に)
    flash(this.ui.el.flash, '#ff2a00', 0.3, 500);
    Engine.shake(0.9);
    if (e) BossFX.bossIntro(e.x, e.z, bossSize(e) * 0.8);
    Audio.play('bossPhase', { last });
    Audio.vibrate([50, 40, 90]);
  },

  // ---------------- 撃破 = 大当たり ----------------
  _onJackpot(j) {
    if (!Score.active) return;
    const e = j.e, size = bossSize(e), x = j.x != null ? j.x : e ? e.x : Player.pos.x, z = j.z != null ? j.z : e ? e.z : Player.pos.z;
    const kj = !!e && e.type === 'kaiju';      // 大怪獣は たおれるのに 4 秒かかる: 地面に つくまで 衝撃波を 待つ・カメラも 長く
    this._pending.push({ e, x, z, size, g: 0, r: 0, wait: kj ? 6 : NOVA_FALLBACK });
    const lines = jackLines(j);
    // 大怪獣を 倒した: 特別の 討伐ボーナス(いちばんの ごほうび)
    if (kj) { const p = Score.bonus(KAIJU_BONUS, x, z); if (p > 0) { lines.push({ label: '🦖 大怪獣 討伐ボーナス', val: '+' + fmt(p), cls: 'new' }); j.total += p; } }
    // もう演出中(ボスを続けて倒した): 行を足して 合計を のばす
    if (this.seq && this.seq.t < 3.5) {
      const s = this.seq;
      s.lines.push({ label: `もう1体! ${j.name}`, val: '+' + fmt(j.total), cls: 'more' });
      s.total += j.total;
      if (s.rolled) { s.rolled = false; s.rollFrom = s.rollTo; s.rollT = 0; this.el.jack.classList.remove('done'); }
      s.rollTo = s.total;
      this._coinBurst(x, size * 0.55, z, 14);
      Audio.play('bossKill', { size });
      return;
    }
    const ui = this.ui, el = this.el;
    this.intro = null; ui.el.hud.classList.remove('bossintro');
    // 一瞬止まる → スロー
    Engine.hitStop(0.13);
    Engine.slowMo(1.3, 0.25);
    Engine.shake(1.6);
    Engine.bloomKick(0.6, 0.7);
    // 大怪獣: ひざをつく → 最後の声 → 横へ たおれる、を 全身が入る 場面カットで(たおれる先まで 画面に入れる)
    const KM = kj && e._M, fdx = KM ? KM.fdx || 0 : 0, fdz = KM ? KM.fdz || 0 : 0;
    if (kj && !KaijuCam.startCut('death', 6.0, { inT: 0.45, outT: 0.9, dolly: 0.04, bottom: -0.72, top: 0.8, az: [0.35, -0.35, 0.65, -0.65, 0.1, 0.9, -0.9], extra: [x + fdx * 88, 6, z + fdz * 88, x + fdx * 50, 40, z + fdz * 50] }))
      Engine.focusOn(x, 30, z, 8.6, { weight: 0.5, zoom: 1.5, pitch: 0.32, inT: 0.4, outT: 0.8 });
    else Engine.focusOn(x, size * 0.45, z, 3.4, { weight: 0.7, zoom: 1.15 + Math.min(0.4, size / 50), pitch: 0.24, inT: 0.3, outT: 0.6 });
    flash(ui.el.flash, '#fff6c8', 0.75, 380);
    setTimeout(() => flash(ui.el.flash, '#ffc83a', 0.4, 520), 120);
    ui.banner.hold(kj ? 12 : 9);
    ui.el.hud.classList.remove('bosscam'); void ui.el.hud.offsetWidth; ui.el.hud.classList.add('bosscam');
    BossFX.bossKillFlash(x, z, size);
    // ハンコ
    el.stampSub.textContent = j.name + (j.time > 0 ? ` ・ ${j.time.toFixed(1)}秒` : '');
    el.speed.textContent = j.speed ? j.speed.label : '';
    el.speed.style.display = j.speed ? '' : 'none';
    // ハンコは 点数の下から(点数・武器の列に かぶらない。UI の係の お願い)
    try { const sb = ui.el.scoreBox.getBoundingClientRect(); if (sb.height > 0) el.stamp.style.top = Math.round(sb.bottom + 6) + 'px'; } catch (err) { /* そのまま */ }
    el.stamp.classList.remove('out'); replay(el.stamp);
    el.lines.innerHTML = ''; el.total.textContent = '0';
    el.jack.classList.remove('on', 'out', 'done');
    Audio.play('bossKill', { size });
    Audio.vibrate([90, 40, 60, 40, 160]);
    ui.slowRoll(2.6);
    this.seq = { t: 0, kj, j, x, z, size, lines, shown: 0, lineT: 0.6, total: j.total, rollTo: j.total, rollFrom: 0, rollT: -1, rolled: false,
      coins: false, fever: false, nova: false, novaAt: 0, novaDone: false, rolledAt: 0, cineEnd: false, ending: false };
  },

  _seqStep(dt) {
    const s = this.seq; if (!s) return;
    s.t += dt;
    const el = this.el, ui = this.ui;
    if (!s.coins && s.t > 0.3) { s.coins = true; this._coinBurst(s.x, s.size * 0.55, s.z, Engine.quality === 'low' ? 18 : 26 + Math.min(14, s.j.chain * 3)); BossFX.coinFountain(s.x, s.z, s.size); }
    // 内わけを 1 行ずつ
    if (s.t > 0.5 && !el.jack.classList.contains('on')) el.jack.classList.add('on');
    while (s.shown < s.lines.length && s.t >= s.lineT) {
      const L = s.lines[s.shown++];
      const li = document.createElement('li');
      li.className = L.cls || '';
      li.innerHTML = `<span>${L.label}</span><b>${L.val}</b>`;
      el.lines.appendChild(li);
      Audio.play('jpLine', { i: s.shown });
      s.lineT += 0.24;
    }
    // 合計: 全部の行が出たら くるくる
    if (s.shown >= s.lines.length && s.rollT < 0 && s.t >= s.lineT) { s.rollT = 0; el.jack.classList.add('rolling'); }
    if (s.rollT >= 0 && !s.rolled) {
      s.rollT += dt;
      const k = Math.min(1, s.rollT / 0.9), v = s.rollFrom + (s.rollTo - s.rollFrom) * (1 - Math.pow(1 - k, 3));
      el.total.textContent = '+' + fmt(v);
      if (((s.rollT * 14) | 0) !== (((s.rollT - dt) * 14) | 0)) Audio.play('jpTick', { k });
      if (k >= 1) {
        s.rolled = true; s.rolledAt = s.t; el.jack.classList.remove('rolling'); el.jack.classList.add('done');
        Audio.play('jpTotal');
        if (!s.fanfare) {
          s.fanfare = true;
          Audio.play('bossFanfare');
          ui.confetti.burst(Engine.quality === 'low' ? 18 : 40);
          flash(ui.el.flash, '#ffd23f', 0.3, 420);
        }
      }
    }
    // 映画の場面おわり(黒い帯・カメラ・ハンコ): 衝撃波が出て 0.7 秒(出なければ 5 秒)
    const portrait = innerHeight > innerWidth;
    if (!s.cineEnd && ((s.nova && s.t - s.novaAt > (s.kj ? 2.2 : 0.7)) || s.t > (s.kj ? 9 : 5))) {
      s.cineEnd = true;
      el.stamp.classList.add('out');
      ui.el.hud.classList.remove('bosscam');
      Engine.focusEnd();
      if (!portrait) ui.banner.release();      // 横画面: 内わけは左なので、まんなかの文字(無双モード!!)は もう出してよい
    }
    // 内わけの札おわり: 衝撃波の一掃が 足されて 合計が出きった(出なければ 8 秒)
    if (!s.ending && s.cineEnd && ((s.novaDone && s.rolled && s.t - s.rolledAt > 1.1) || s.t > (s.kj ? 12 : 8))) {
      s.ending = true; s.endT = s.t;
      el.jack.classList.add('out');
      ui.banner.release();
    }
    if (s.ending && s.t - s.endT > 0.5) {
      el.stamp.classList.remove('on', 'out'); el.jack.classList.remove('on', 'out', 'done', 'rolling');
      this.seq = null;
      return;
    }
    if (!s.cineEnd) {
      // 大怪獣: たおれる先(体の まん中あたり)へ カメラを 寄せていく
      const M = s.kj && s.j.e && s.j.e._M, k = M ? Math.min(1, s.t / 2.5) * 30 : 0;
      if (M) Engine.focusTrack(s.x + (M.fdx || 0) * k, 30, s.z + (M.fdz || 0) * k);
      else Engine.focusTrack(s.x, s.size * 0.45, s.z);
    }
  },

  // お金・宝石が ボスから飛び出して 点数へ
  _coinBurst(x, y, z, n) {
    const p = Engine.project(x, y, z, _pt) || { x: innerWidth / 2, y: innerHeight * 0.45 };
    const sb = this.ui.el.score.getBoundingClientRect();
    const tx = sb.left + sb.width / 2, ty = sb.top + sb.height / 2;
    const sx = Math.max(20, Math.min(innerWidth - 20, p.x)), sy = Math.max(60, Math.min(innerHeight - 40, p.y));
    const W = Math.min(innerWidth, innerHeight);
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const c = this._coins[this._coinN++ % this._coins.length];
      if (!c.el.animate) return;
      if (c.anim) c.anim.cancel();
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, r = W * (0.14 + Math.random() * 0.22);
      const bx = sx + Math.cos(a) * r, by = sy + Math.sin(a) * r * 0.8;
      const rot = (Math.random() - 0.5) * 720;
      const dur = 950 + Math.random() * 450, delay = i * 28;
      c.el.style.opacity = '';
      c.anim = c.el.animate([
        { transform: `translate3d(${sx}px,${sy}px,0) scale(.3) rotate(0deg)`, opacity: 0 },
        { transform: `translate3d(${(sx + bx) / 2}px,${(sy + by) / 2 - 20}px,0) scale(1.2) rotate(${rot * 0.3}deg)`, opacity: 1, offset: 0.12, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: `translate3d(${bx}px,${by}px,0) scale(1.05) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(.55,0,.9,.4)' },
        { transform: `translate3d(${tx}px,${ty}px,0) scale(.45) rotate(${rot}deg)`, opacity: 0.85 },
      ], { duration: dur, delay, fill: 'both' });
      c.anim.onfinish = () => {
        c.el.style.opacity = '0'; c.anim = null;
        const k = arrived++;
        Audio.play('jpCoin', { i: k });
        this.ui._scoreBump = Math.min(1.6, Math.max(this.ui._scoreBump, 1.18 + k * 0.012));
        if (k === 0) this.ui.el.scoreBox.classList.add('jp');
        if (k >= n - 1) setTimeout(() => this.ui.el.scoreBox.classList.remove('jp'), 400);
      };
    }
  },

  // ---------------- 衝撃波のしあげ ----------------
  _onFall(d) {
    if (!Score.active) return;
    const i = this._pending.findIndex((p) => (d.e && p.e === d.e) || (!d.e && d.x != null && Math.hypot(p.x - d.x, p.z - d.z) < 12));
    const p = i >= 0 ? this._pending.splice(i, 1)[0] : null;
    if (!p && d.e && d.e._novaDone) return;
    this._nova(d.x != null ? d.x : p ? p.x : Player.pos.x, d.z != null ? d.z : p ? p.z : Player.pos.z, d.size || (p && p.size) || 8, d.e || (p && p.e));
  },

  _nova(x, z, size, e) {
    if (e) { if (e._novaDone) return; e._novaDone = true; }
    const hx = Player.pos.x, hz = Player.pos.z;
    const R = Math.min(75, Math.hypot(x - hx, z - hz) + (Engine.viewMode === 'top' ? 40 : 55));
    this._waves.push({ x, z, R, t: 0, dur: 0.8, r: 3 });
    Score.novaBegin();
    BossFX.novaRing(x, z, R);
    // 画面の輪(DOM)
    const p = Engine.project(x, 0.3, z, _pt) || { x: innerWidth / 2, y: innerHeight / 2 };
    const el = this.el.nova, D = Math.hypot(innerWidth, innerHeight) / 50;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    anim(el, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: `translate(-50%,-50%) scale(${(D * 0.6).toFixed(2)})`, opacity: 0.8, offset: 0.5 }, { transform: `translate(-50%,-50%) scale(${D.toFixed(2)})`, opacity: 0 }], 750);
    flash(this.ui.el.flash, '#ffc83a', 0.5, 600);
    Engine.shake(1.5);
    Engine.fovKick(14);
    Engine.bloomKick(0.4, 0.6);
    Audio.play('bossNova');
    Audio.vibrate([110, 40, 160]);
    if (this.seq && !this.seq.nova) { this.seq.nova = true; this.seq.novaAt = this.seq.t; }
  },

  // 衝撃波が広がりながら ゾンビを倒す(ボスは倒さない)。1 フレームに倒すのは 26 体まで(重くならないように)
  _waveStep(dt) {
    const W = this._waves;
    for (let i = W.length - 1; i >= 0; i--) {
      const w = W[i];
      w.t += dt;
      const k = Math.min(1, w.t / w.dur), r = 3 + (w.R - 3) * (1 - (1 - k) * (1 - k));
      const hits = Zombies.queryCircle(w.x, w.z, r, _hits);
      let n = 0;
      for (let j = 0; j < hits.length && n < 26; j++) {
        const e = hits[j];
        if (!e.alive || e.boss) continue;
        const dx = e.x - w.x, dz = e.z - w.z, d = Math.hypot(dx, dz) || 1;
        Zombies.damage(e, 1e6, { dirX: dx / d, dirZ: dz / d, force: 32, cause: 'spin' });
        n++;
      }
      if ((k >= 1 && n === 0) || w.t > w.dur + 1) W.splice(i, 1);
    }
    if (!W.length) this._novaDone();
  },

  // 衝撃波が おわった: 一掃した数と点を 内わけに足して、合計を もう一度 くるくる
  _novaDone() {
    const r = Score.novaEnd();
    const s = this.seq;
    if (s && !s.ending) {
      s.novaDone = true;
      if (r.n > 0) {
        s.lines.push({ label: `💥 衝撃波で一掃 <small>${fmt(r.n)}体</small>`, val: '+' + fmt(r.pts), cls: 'hot' });
        s.total += r.pts;
        if (s.rolled) { s.rolled = false; s.rollFrom = s.rollTo; s.rollT = 0; this.el.jack.classList.remove('done'); }
        s.rollTo = s.total;
        this.ui.slowRoll(1.2);
      }
    } else if (r.n > 0) this.ui._sub(`💥 衝撃波で一掃 <b>${fmt(r.n)}体</b> <em>+${fmt(r.pts)}</em>`, 'big', 3);
  },

  // ---------------- 次のボスまで ----------------
  _chipStep(dt) {
    const el = this.el;
    let show = Score.active && !this.ui.paused && Bosses.list.length === 0 && !this.seq;
    let left = 0;
    if (show) {
      try {
        left = typeof Director.nextBossIn === 'number' ? Director.nextBossIn : Director._nextBoss - Director.time;
        if (!(left >= 0 || left < 0)) show = false;
      } catch (e) { show = false; }
    }
    if (show !== this._chipOn) { this._chipOn = show; el.chip.classList.toggle('hidden', !show); if (show) replay(el.chip); }
    if (!show) { this._tick = -1; return; }
    left = Math.max(0, left);
    const soon = left <= 10;
    const txt = left <= 0.05 ? 'まもなく出現…' : (soon ? 'ボス接近まで ' : '次のボスまで ') + '|' + mmss(left);
    if (txt !== this._chipTxt) {
      this._chipTxt = txt;
      const [a, b] = txt.split('|');
      el.chipTxt.textContent = a; el.chipT.textContent = b || '';
      el.chip.classList.toggle('soon', soon);
      // 次のボスが まだ倒したことのない種類なら NEW
      let nt = null;
      try { nt = Director.nextBossType || BOSS_ORDER[Director._bossIdx % BOSS_ORDER.length]; } catch (e) {}
      el.chipNew.style.display = nt && !BossDex.has(nt) ? '' : 'none';
    }
    // ボス連続撃破の チャンス(前のボスから 100 秒以内に 次を倒すと ×(連続+1))
    const chainOk = Score.bossChain >= 1 && Score.time - Score._lastBossT <= 100;
    const ctxt = chainOk ? `🔥×${Math.min(10, Score.bossChain + 1)}` : '';
    if (ctxt !== this._chainTxt) { this._chainTxt = ctxt; el.chipChain.textContent = ctxt; el.chipChain.style.display = ctxt ? '' : 'none'; }
    // のこり 3・2・1 秒で カウントの音
    const sec = Math.ceil(left);
    if (sec !== this._tick) { if (sec <= 3 && sec >= 1 && this._tick > sec) Audio.play('bossTick', { n: sec }); this._tick = sec; }
  },

  // 毎フレーム(UI.update から。dt = 実時間、gdt = 一時停止なら 0)
  update(dt, gdt) {
    if (!gdt) return;
    this._omenStep(gdt);
    this._introStep(gdt);
    this._seqStep(gdt);
    // bossFall が来ないとき: ゲームの時間で 1.6 秒たったら 衝撃波
    const ts = Engine.timeScale == null ? 1 : Engine.timeScale;
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const p = this._pending[i];
      p.g += gdt * ts; p.r += gdt;
      if (p.g >= (p.wait || NOVA_FALLBACK) || p.r > (p.wait || NOVA_FALLBACK) + 3) { this._pending.splice(i, 1); this._nova(p.x, p.z, p.size, p.e); }
    }
    if (this._waves.length) this._waveStep(gdt);
    if ((this._chipT -= gdt) <= 0) { this._chipT = 0.2; this._chipStep(0.2); }
  },
};

const _pt = {}, _hits = [];

// ボスの高さ(m)。ボス係の e.size がなければ 大きさから見つもる
export function bossSize(e) {
  if (!e) return 8;
  if (e.size > 0) return e.size;
  const s = (e.def && e.def.scale) || 2;
  return Math.max(4, s * 2.2);
}
// 脅威度 1..5(bossTier があれば それ、なければ 高さから)
export function bossThreat(e) { return threat(e, bossSize(e)); }
function threat(e, size) {
  const t = e && +e.bossTier;
  if (t > 0) return Math.max(1, Math.min(5, Math.round(t + 2)));
  return Math.max(2, Math.min(5, Math.round(size / 5) + 1));
}

// ごほうびの内わけ(行)
function jackLines(j) {
  const L = [];
  const fx = (m) => '×' + (m % 1 ? m.toFixed(1) : m);
  L.push({ label: 'ボス撃破 <small class="st">' + '★'.repeat(bossThreat(j.e)) + '</small>', val: '+' + fmt(j.base) });
  if (j.speed) L.push({ label: `⚡ ${j.speed.label.replace(/!+$/, '')}ボーナス <small>${j.time.toFixed(1)}秒</small>`, val: fx(j.speed.mult), cls: 'hot' });
  if (j.chain >= 2) L.push({ label: `🔥 ボス連続撃破 <small>${j.chain}体目</small>`, val: fx(j.chain), cls: 'hot' });
  if (j.combo > 1) L.push({ label: 'コンボ', val: fx(j.combo) });
  if (j.bonusMult > 1) L.push({ label: '無双・ボーナス', val: fx(j.bonusMult) });
  if (j.first) L.push({ label: `🏅 新しいボスを撃破! <small>図鑑 ${j.medals}/${j.medalTotal}</small>`, val: '+' + fmt(j.firstPts), cls: 'new' });
  if (j.pb) L.push({ label: `⏱ 自己ベスト更新 ${j.time.toFixed(1)}秒! <small>前 ${(+j.prevBest).toFixed(1)}秒</small>`, val: '+' + fmt(j.pbPts), cls: 'new' });
  return L;
}

// CSS のアニメーションを 最初から
function replay(el) { el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
function anim(el, kf, ms) { if (el.animate) el.animate(kf, { duration: ms, easing: 'ease-out' }); }
