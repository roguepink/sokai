// 起動とゲームの流れ: タイトル(後ろで見本プレイ) → プレイ → 一時停止 → 結果。
// 各係の update を、決まった順番で 1/60 秒ずつ呼ぶ。
import { CONFIG } from './config.js';
import { HASH } from './util.js';
import { Events } from './events.js';
import { Engine, loadSettings } from './engine.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Zombies } from './zombies.js';
import { Director } from './director.js';
import { Weapons } from './weapons.js';
import { FX } from './fx.js';
import { Score } from './score.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Flow } from './zombie-flow.js';
import { Look } from './view-look.js';
import { ViewHud } from './view-hud.js';
import { ViewCam } from './view-camera.js';
import { WeaponGrid } from './ui-weapons.js';
import { WEAPONS } from './weapons.js';

export const Game = {
  state: 'title',           // 'title'(見本プレイ) | 'play' | 'paused' | 'result'
  demo: true,               // タイトルの後ろで自動プレイ中
  time: 0,
};

const $ = (id) => document.getElementById(id);

// 読みこみ中の帯(どこまで進んだか)。重い準備の合間に 1 フレーム返して、帯を動かす
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const bootT = window.__boot = {};
function progress(p, label) {
  const bar = $('loadBar'), txt = $('loadText');
  if (bar) bar.style.transform = `scaleX(${p.toFixed(2)})`;
  if (txt && label) txt.textContent = label;
}
async function step_(name, p, label, fn) {
  progress(p, label);
  await nextFrame();
  const t = performance.now();
  fn();
  bootT[name] = Math.round(performance.now() - t);
}

async function boot() {
  const root = $('app');
  await step_('engine', 0.05, '準備中…', () => Engine.init(root));
  await step_('world', 0.12, '町をつくっています…', () => World.init(Engine.scene));
  await step_('chars', 0.55, 'ゾンビを集めています…', () => { Player.init(Engine.scene); Zombies.init(Engine.scene); });
  await step_('weapons', 0.72, '武器をそろえています…', () => { FX.init(Engine.scene); Weapons.init(Engine.scene); });
  await step_('ui', 0.8, 'もうすぐ…', () => {
    Score.init(); Input.init(root); UI.init(root); Audio.init();
    Engine.ctx = { Player, Zombies, Weapons, Input, World };
    ViewHud.init(root, Engine.ctx);
  });

  $('btnPlay').addEventListener('click', (e) => { e.currentTarget.blur(); start(e); });
  $('btnResume').addEventListener('click', (e) => { e.currentTarget.blur(); resume(); });
  $('btnQuit').addEventListener('click', (e) => { e.currentTarget.blur(); finish(); });
  $('btnAgain').addEventListener('click', (e) => { e.currentTarget.blur(); start(e); });
  $('btnTitle').addEventListener('click', (e) => { e.currentTarget.blur(); toTitle(); });
  UI.el.pause.addEventListener('click', (e) => { e.currentTarget.blur(); pause(); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'p') {
      if (ViewHud.open) { ViewHud.closePanel(); return; }
      if (WeaponGrid.open) { WeaponGrid.close(); return; }
      Game.state === 'play' ? pause() : Game.state === 'paused' && resume();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && Game.state === 'play') pause(); });
  // 音: 最初にさわるまでは鳴らさない。さわったら(タブから戻ったあとも)目を覚ます
  const wake = () => { if (Audio.ctx) Audio.unlock(); else if (Game.state === 'play') Audio.unlock(); };
  addEventListener('pointerdown', wake, true);
  addEventListener('keydown', wake, true);

  resetRun();
  Input.auto = true;        // タイトルの後ろは見本プレイ
  // 光と材質の準備(シェーダー)を先にすませる。最初の爆発やボスで 固まらないように
  progress(0.88, '光の準備…');
  await nextFrame();
  const t = performance.now();
  try {
    step(CONFIG.DT); Engine.updateCamera(0.016, Player.pos, false, true);
    const r = Engine.renderer;
    if (r.compileAsync) await Promise.race([r.compileAsync(Engine.scene, Engine.camera), new Promise((ok) => setTimeout(ok, 4000))]);
    else r.compile(Engine.scene, Engine.camera);
    Engine.render(0.016);
  } catch (e) { console.warn('precompile', e); }
  bootT.compile = Math.round(performance.now() - t);
  progress(1, '');
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  Game.titleT = 0;
  if (HASH.has('play')) start();
  requestAnimationFrame(loop);
}

function resetRun() {
  Zombies.reset(); FX.reset(); Director.reset(); Score.reset(); Weapons.reset(); Player.reset();
  Game.time = 0;
  Events.emit('reset', {});
}

function start(ev) {
  if (ev && ev.isTrusted) Audio.unlock();     // 音はさわったときだけ(#play の確認用では鳴らさない)
  resetRun();
  Game.state = 'play'; Game.demo = false; Score.active = true;
  Input.auto = HASH.has('auto');
  Input.enabled = true;
  ['title', 'pauseMenu', 'result'].forEach((id) => $(id).classList.add('hidden'));
  Input.setVisible(true); UI.show(true);
  Engine.setViewMode(loadSettings().view || 'top', Player.facing, false);
  Look.reset();
  ViewHud.onStart();
  Events.emit('start', {});
  // 最初のタップのあとに全画面(Android の Chrome。だめでもそのまま遊べる)
  if (ev && ev.isTrusted) try {
    const el = document.documentElement, fs = el.requestFullscreen || el.webkitRequestFullscreen;
    const pr = fs && fs.call(el, { navigationUI: 'hide' });
    if (pr && pr.catch) pr.catch(() => {});
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {}
}

function pause() {
  if (Game.state !== 'play') return;
  ViewHud.closePanel(); WeaponGrid.close();
  Game.state = 'paused';
  Score.save();
  $('pauseMenu').classList.remove('hidden');
  Input.setVisible(false);
  Events.emit('pause', {});
}
function resume() {
  if (Game.state !== 'paused') return;
  Game.state = 'play';
  $('pauseMenu').classList.add('hidden');
  Input.setVisible(true);
  Events.emit('resume', {});
}
function finish() {
  Game.state = 'result'; Score.active = false;
  Score.save();
  $('pauseMenu').classList.add('hidden');
  Input.setVisible(false); UI.show(false);
  $('resultScore').textContent = Score.score.toLocaleString();
  $('resultKills').textContent = Score.kills.toLocaleString();
  $('resultBest').textContent = Score.best.toLocaleString();
  $('resultNew').classList.toggle('hidden', !Score.newRecord);
  $('result').classList.remove('hidden');
  Events.emit('finish', { score: Score.score, kills: Score.kills, best: Score.best, newRecord: Score.newRecord });
}
// PC: 肩越し・一人称のときに画面をクリックすると、マウスで向きを変えられる(Esc でもどる)
addEventListener('mousedown', (e) => {
  if (Game.state === 'play' && Engine.viewMode !== 'top' && !Input.touchUsed && !ViewHud.open && !e.target.closest('button, .overlay') && !document.pointerLockElement) {
    try { const p = Engine.renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) {}
  }
});

function toTitle() {
  $('result').classList.add('hidden');
  ViewHud.closePanel();
  resetRun();
  Engine.setViewMode('top', 0, false);
  Game.state = 'title'; Game.demo = true; Input.auto = true; Score.active = false; Game.titleT = 0;
  $('title').classList.remove('hidden');
}

// ---------- ループ ----------
let last = performance.now(), acc = 0, saveT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try {
    const real = Math.min((now - last) / 1000, CONFIG.MAX_FRAME); last = now;
    const menu = ViewHud.open || WeaponGrid.open;      // 視点の設定・武器の一覧を開いている間は 止める
    const running = (Game.state === 'play' && !menu) || Game.state === 'title';
    Input.update(real);
    if (Game.state === 'play') handleWeaponKeys();
    if (Game.state === 'play' && !menu) handleView(real);
    if (running) {
      Engine.stepTime(real);
      acc += real * Engine.timeScale;
      let steps = 0;
      while (acc >= CONFIG.DT && steps < 6) { step(CONFIG.DT); acc -= CONFIG.DT; steps++; }
      if (steps === 6) acc = 0;
    }
    if ((streetT -= real) <= 0) { streetT = 0.3; Engine.street = streetCheck(Player.pos.x, Player.pos.z); }
    Engine.updateCamera(real, Player.pos, !!World.inside, Game.state === 'title');
    if (Game.state !== 'title') UI.update(real);
    ViewHud.update(real, Game.state === 'play' && !WeaponGrid.open);
    Engine.render(real);
    if (Game.state === 'play' && (saveT += real) > 5) { saveT = 0; Score.save(); }
    // 1 フレームの計算にかかった時間(ミリ秒。確認用。16 をこえるとカクつく)
    const cost = performance.now() - now;
    stats.ms = Math.round((stats.ms * 0.95 + cost * 0.05) * 10) / 10;
    stats.fps = Math.round(Engine.fps); stats.zombies = Zombies.count(); stats.kills = Score.kills; stats.score = Score.score; stats.state = Game.state;
  } catch (e) { console.error(e); }
}

// 主人公とカメラの間(画面の手前 = 南)に 高い壁があるか。あれば 1(カメラを真上に近づける)
// マップが広い(壁の箱が多い)ので、World.grid(8m の区画)で 主人公の手前の区画だけ しらべる
let streetT = 0;
function streetCheck(px, pz) {
  const B = World.boxes; if (!B || World.inside) return 0;
  const x0 = px - 6, x1 = px + 6, z0 = pz + 1, z1 = pz + 11;
  const hit = (b) => !(b.h < 6 || b.maxZ < z0 || b.minZ > z1 || b.maxX < x0 || b.minX > x1) && !(b.maxX - b.minX < 2 && b.maxZ - b.minZ < 2);   // 細い柱・街灯は数えない
  if (World.grid && World._cell && World.gw) {
    const c0 = World._cell(x0, z0), c1 = World._cell(x1, z1);
    for (let gz = c0.z; gz <= c1.z; gz++) for (let gx = c0.x; gx <= c1.x; gx++) {
      const cell = World.grid[gz * World.gw + gx];
      if (cell) for (let k = 0; k < cell.length; k++) if (hit(B[cell[k]])) return 1;
    }
    return 0;
  }
  for (let i = 0; i < B.length; i++) if (hit(B[i])) return 1;
  return 0;
}

// PC: T = 武器の一覧 / 同じ数字を もう一度 = 11〜・21〜(31 種類あるので)
function handleWeaponKeys() {
  if (Input.consumeWeaponGrid()) WeaponGrid.toggle();
  if (Input.digitPress) {
    Input.digitPress = false;
    const d = Input.weaponSelect, cur = Weapons.index;
    if (d >= 0 && cur % 10 === d) Input.weaponSelect = cur + 10 < WEAPONS.length ? cur + 10 : d;
  }
}

// 視点の切りかえ(見下ろし → 肩越し → 一人称 → 見下ろし)と、指・マウスで向きを変える(view-look.js)
const VIEWS = ['top', 'tps', 'fps'];
const _look = { x: 0, y: 0 };
function handleView(real) {
  if (Input.consumeViewHold()) { ViewHud.openPanel(); return; }
  if (Input.consumeView()) {
    const next = VIEWS[(VIEWS.indexOf(Engine.viewMode) + 1) % VIEWS.length];
    Engine.setViewMode(next, Engine.viewMode === 'top' ? Player.facing : undefined);
    if (next === 'top' && document.pointerLockElement) document.exitPointerLock();
  }
  if (Engine.viewMode !== 'top') Look.update(real, Engine, Input, Engine.ctx);
  else { Input.consumeLook(_look); Input.consumeLookMouse(_look); Input.consumeTurn(); }
}

function step(dt) {
  Game.time += dt;
  Player.update(dt, Input);
  // 肩越し・一人称: 武器の「照準への吸いつき」は 指で向きを変えている間は 止める(はなすと だんだん もどる)。
  // 吸いつきが 指より強くて「前しか向けない」ことがあったため(2026-10-22 ノブさんの実機)
  const y0 = Engine.lookYaw;
  Weapons.update(dt, Input, Player);
  if (Engine.viewMode !== 'top' && Engine.lookYaw !== y0 && !Input.auto) {
    const k = Input.assistScale();
    if (k < 1) Engine.lookYaw = y0 + (Engine.lookYaw - y0) * k;
  }
  Zombies.update(dt, Player);
  Director.update(dt, Player);
  FX.update(dt);
  World.update(dt, Player);
  if (Game.state === 'play') Score.update(dt);
}

// 確認用に外から見られる数字
const stats = window.__stats = { ms: 0, fps: 0, zombies: 0, kills: 0, score: 0, state: '' };
window.__game = { Game, Engine, Look, ViewHud, ViewCam, Flow, Audio, UI, Player, Zombies, Weapons, World, Score, Director, FX, Input, WeaponGrid, start, pause, resume, finish };

boot().catch((e) => {
  console.error(e);
  const l = $('loadText'); if (l) l.textContent = 'うまく起動できませんでした。もう一度開いてください。';
});
