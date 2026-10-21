'use strict';
/* オフラインでも遊べるようにする(ホーム画面に入れたあと、電波がなくても起動する)。
   ゲームの全部(index.html・js・three.js・css・アイコン)を覚えておく。
   - 開くたびに、まずネットで最新を取りにいく(つながらない・遅いときは 覚えているものを出す)
   - ゲームを直しただけなら VERSION は そのままでいい
   - FILES(覚えるファイル)を足したり消したりしたら VERSION を 1つ上げる(古い覚えを 一斉に捨てる)
   - FILES に書き忘れたファイルも、ページが「読みこんだもの一覧」を送ってくるので覚えられる(index.html) */
const VERSION = 'sokai-v3';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/view.css',
  'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png',
  'js/audio-bgm.js', 'js/audio-sfx2.js', 'js/audio-world.js', 'js/audio.js', 'js/boss-extra.js', 'js/boss.js',
  'js/config.js', 'js/director.js', 'js/engine.js', 'js/events.js', 'js/fx-shaders.js', 'js/fx.js',
  'js/hero-moves.js', 'js/input.js', 'js/main.js', 'js/player.js', 'js/score.js', 'js/ui-boss.js',
  'js/ui-fx.js', 'js/ui-minimap.js', 'js/ui-weapons.js', 'js/ui.js', 'js/util.js', 'js/view-camera.js',
  'js/view-hud.js', 'js/view-look.js', 'js/weapon-defs.js', 'js/weapon-extra.js', 'js/weapon-hit.js', 'js/weapon-models.js',
  'js/weapon-proj.js', 'js/weapon-proj2.js', 'js/weapon-summon.js', 'js/weapon-view.js', 'js/weapons.js', 'js/world-air.js',
  'js/world-break.js', 'js/world-build.js', 'js/world-fun.js', 'js/world-harbor.js', 'js/world-interiors.js', 'js/world-life.js',
  'js/world-nature.js', 'js/world-outer.js', 'js/world-props.js', 'js/world-props2.js', 'js/world-sky.js', 'js/world-tex.js',
  'js/world-town.js', 'js/world-zones.js', 'js/world.js', 'js/zombie-anim.js', 'js/zombie-events.js', 'js/zombie-flow.js',
  'js/zombie-gore.js', 'js/zombie-models.js', 'js/zombie-render.js', 'js/zombies.js',
  'vendor/three/build/three.module.min.js', 'vendor/three/build/three.core.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js', 'vendor/three/addons/math/SimplexNoise.js',
  'vendor/three/addons/postprocessing/Pass.js', 'vendor/three/addons/postprocessing/EffectComposer.js',
  'vendor/three/addons/postprocessing/RenderPass.js', 'vendor/three/addons/postprocessing/ShaderPass.js',
  'vendor/three/addons/postprocessing/MaskPass.js', 'vendor/three/addons/postprocessing/UnrealBloomPass.js',
  'vendor/three/addons/postprocessing/OutputPass.js',
  'vendor/three/addons/shaders/CopyShader.js', 'vendor/three/addons/shaders/LuminosityHighPassShader.js',
  'vendor/three/addons/shaders/OutputShader.js', 'vendor/three/addons/shaders/FXAAShader.js', 'vendor/three/addons/shaders/VignetteShader.js',
];
const WAIT = 4000;   // ネットがこれより遅ければ、覚えているものを先に出す(ミリ秒)

// 1つずつ覚える(どれか 1つが なくても、ほかは覚える)
const remember = (c, urls) => Promise.all(urls.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => remember(c, FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// ページから「読みこんだファイルの一覧」が来たら、まだ覚えていないものを覚える
self.addEventListener('message', (e) => {
  const urls = e.data && e.data.cache;
  if (!Array.isArray(urls)) return;
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    const todo = [];
    for (const u of urls.slice(0, 300)) {
      if (new URL(u).origin !== location.origin) continue;
      if (!(await c.match(u, { ignoreSearch: true }))) todo.push(u);
    }
    return remember(c, todo);
  }));
});

/* 開くときは まずネットで最新を取りにいく。つながらない(または遅すぎる)ときは 覚えているものを出す。 */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fromNet = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  });
  const fromCache = () => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      fromCache().then((hit) => { if (hit && !done) { done = true; resolve(hit); } });
    }, WAIT);
    fromNet.then((res) => { clearTimeout(timer); if (!done) { done = true; resolve(res); } })
      .catch(() => {
        clearTimeout(timer);
        fromCache().then((hit) => { if (done) return; done = true; hit ? resolve(hit) : reject(new Error('offline')); });
      });
  }));
  e.waitUntil(fromNet.then(() => {}, () => {}));
});
