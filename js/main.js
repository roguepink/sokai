// 起動とゲームの流れ: タイトル(後ろで見本プレイ) → プレイ → 一時停止 → 結果。
// 各係の update を、決まった順番で 1/60 秒ずつ呼ぶ。
import { CONFIG } from './config.js';
import { HASH } from './util.js';
import { Events } from './events.js';
import { Engine } from './engine.js';
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

export const Game = {
  state: 'title',           // 'title'(見本プレイ) | 'play' | 'paused' | 'result'
  demo: true,               // タイトルの後ろで自動プレイ中
  time: 0,
};

const $ = (id) => document.getElementById(id);

function boot() {
  const root = $('app');
  Engine.init(root);
  World.init(Engine.scene);
  Player.init(Engine.scene);
  Zombies.init(Engine.scene);
  FX.init(Engine.scene);
  Weapons.init(Engine.scene);
  Score.init();
  Input.init(root);
  UI.init(root);
  Audio.init();

  $('btnPlay').addEventListener('click', (e) => { e.currentTarget.blur(); start(e); });
  $('btnResume').addEventListener('click', (e) => { e.currentTarget.blur(); resume(); });
  $('btnQuit').addEventListener('click', (e) => { e.currentTarget.blur(); finish(); });
  $('btnAgain').addEventListener('click', (e) => { e.currentTarget.blur(); start(e); });
  $('btnTitle').addEventListener('click', (e) => { e.currentTarget.blur(); toTitle(); });
  UI.el.pause.addEventListener('click', (e) => { e.currentTarget.blur(); pause(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'p') { Game.state === 'play' ? pause() : Game.state === 'paused' && resume(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden && Game.state === 'play') pause(); });

  resetRun();
  Input.auto = true;        // タイトルの後ろは見本プレイ
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  if (HASH.has('play')) start();
  requestAnimationFrame(loop);
}

function resetRun() {
  Zombies.reset(); FX.reset(); Director.reset(); Score.reset(); Weapons.reset(); Player.reset();
  Game.time = 0;
  Events.emit('reset', {});
}

function start(ev) {
  Audio.unlock();
  resetRun();
  Game.state = 'play'; Game.demo = false; Score.active = true;
  Input.auto = HASH.has('auto');
  Input.enabled = true;
  ['title', 'pauseMenu', 'result'].forEach((id) => $(id).classList.add('hidden'));
  Input.setVisible(true); UI.show(true);
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
function toTitle() {
  $('result').classList.add('hidden');
  resetRun();
  Game.state = 'title'; Game.demo = true; Input.auto = true; Score.active = false;
  $('title').classList.remove('hidden');
}

// ---------- ループ ----------
let last = performance.now(), acc = 0, saveT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  try {
    const real = Math.min((now - last) / 1000, CONFIG.MAX_FRAME); last = now;
    const running = Game.state === 'play' || Game.state === 'title';
    Input.update(real);
    if (running) {
      Engine.stepTime(real);
      acc += real * Engine.timeScale;
      let steps = 0;
      while (acc >= CONFIG.DT && steps < 6) { step(CONFIG.DT); acc -= CONFIG.DT; steps++; }
      if (steps === 6) acc = 0;
    }
    Engine.updateCamera(real, Player.pos, !!World.inside);
    if (Game.state !== 'title') UI.update(real);
    Engine.render(real);
    if (Game.state === 'play' && (saveT += real) > 5) { saveT = 0; Score.save(); }
    stats.fps = Math.round(Engine.fps); stats.zombies = Zombies.count(); stats.kills = Score.kills; stats.score = Score.score; stats.state = Game.state;
  } catch (e) { console.error(e); }
}

function step(dt) {
  Game.time += dt;
  Player.update(dt, Input);
  Weapons.update(dt, Input, Player);
  Zombies.update(dt, Player);
  Director.update(dt, Player);
  FX.update(dt);
  World.update(dt, Player);
  if (Game.state === 'play') Score.update(dt);
}

// 確認用に外から見られる数字
const stats = window.__stats = { fps: 0, zombies: 0, kills: 0, score: 0, state: '' };
window.__game = { Game, Engine, Player, Zombies, Weapons, World, Score, Director, FX, Input, start, pause, resume, finish };

try { boot(); }
catch (e) {
  console.error(e);
  const l = $('loading'); if (l) l.textContent = 'うまく起動できませんでした。もう一度開いてください。';
}
