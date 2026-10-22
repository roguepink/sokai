# 爽快ゾンビ無双(repo roguepink/sokai)

ノブさんの依頼(2026-10-22): 最初から最強・体力無限・絶対に死なない主人公で、押しよせる大量のゾンビを
剣・銃・必殺技(回転斬り)でなぎ倒し続ける **3D アクション**。目的は「気分が爽快になる」こと。
- 左スティックで移動、右のボタンを **押している間ずっと撃つ**(どの武器も)。近くの敵は自動で剣
- 武器はたくさん(マシンガン・ショットガン・手榴弾・ロケットランチャー …)。最初から全部使える
- ボスは必ず出る。点数がどんどん貯まり、最高記録が更新される。飽きるまで終わらない
- 町・森・中に入れる大きな建物。建物の中でも戦える。なるべく広く
- ゾンビ・ボスはなるべくリアルに。倒れる姿も爽快に

公開リポジトリ。**写真・映画素材・個人情報・API キーは置かない。**公開(GitHub Pages)はノブさんに見せて OK をもらってから。

## 作り(ビルドなし)
- `index.html`(画面の枠・タイトル/一時停止/結果)+ `css/style.css` + `js/*.js`(ES modules)
- three.js r186 は `vendor/three/`(CDN を使わず同梱。オフラインでも動く)。import は `'three'` と `'three/addons/...'`(importmap)
- 画像・音のファイルは使わない。見た目は three.js の形・canvas で描いた模様、音は WebAudio で作る
- 確認: `source ~/.local/venvs/ryokoshi/bin/activate && python3 tools/playtest.py --secs 20 --shots 3`
  → `_check/pt-*.png` を **必ず目で見る**。fps・ゾンビ数・エラーが出る。`--before "JS"` / `--eval "JS"` で状態を作れる
  (`window.__game` に各係が入っている)。音は出ない(--mute-audio)。**Mac の画面をつけない・音を出さない**(ノブさんのルール)
- ほかの確認道具: `tools/playtest_cpu.py --cpu 4`(CPU を遅くしてスマホに近づける)/ `tools/playtest_mobile.py`(タッチ・画面の流れ・オフラインなどの場面別)。
  `__stats.ms` = 1フレームの計算時間。`--before` の JS は最後に `; 1` をつける(ゾンビなどの物を返すと止まる)
- js ファイルを足したら `sw.js` の FILES に足して VERSION を上げる
- アドレスの印: `#play`(すぐ始まる)/ `#auto`(自動で動いて撃つ)/ `q=low|mid|high`(画質)。例 `#play&auto&q=low`

## 第2弾(2026-10-22 ノブさんの追加依頼)
「武器をあと10種類ほど / 視点の切りかえ(一人称も)/ 爽快になる仕組みをどんどん追加 / ステージがない分、広大なエリア・見た目の迫力・ちょっとした変化を多く」

### 視点(engine.js / input.js / main.js / player.js)
- `Engine.viewMode` = 'top'(見下ろし・いつもの)| 'tps'(肩越し)| 'fps'(一人称)。`Engine.setViewMode(mode, yaw, save)` → イベント `viewChange {mode}`
- `Engine.lookYaw`(見ている向き。facing と同じ決まり)`Engine.lookPitch`(+ = 上)`Engine.viewDir`(XZ の前向き)`Engine.look(dYaw,dPitch)`
- tps/fps: スティックの上 = 見ている向きへ進む。右半分(.look-zone)や撃つボタンをなぞると向きが変わる。PC はクリックでマウスロック。V キー / 👁ボタンで切りかえ
- fps では `Player.mesh.visible = false`。武器係が手元の武器(ビューモデル)を出す。照準は #crosshair(main が出し入れ)
- タイトルの見本プレイは いつも top。プレイ開始で保存した視点にもどる

### 第2弾の約束(新しく足すもの)
- **フィーバー(無双モード)**: `Score.fever`(0..1 のゲージ)`Score.feverActive`(true の間 強くなる)、イベント `feverStart` / `feverEnd`。
  武器係は `Score.feverActive` のとき 撃つ速さ・威力・見た目を上げる
- **こわせる物**: `World.damage(x, z, r, amount, {cause})` — 車・ドラム缶・ガスタンク・ガラスなどに当たると こわれる/爆発する。
  爆発したら World が `FX.explosion` と `Zombies.damageCircle` を呼び、イベント `propExplode {x,z,radius,kind}` を出す。武器係は弾・爆発のたびに呼ぶ
- **時間と天気**: World が `timeOfDay`(0..1, 0.5 = 真夜中 などは World が決める)と `weather`('clear'|'rain'|'storm'|'fog'...)を持ち、変わったらイベント `worldChange {timeOfDay, weather, text}`
- **イベント(出来事)**: 出現係が起こす。イベント `worldEvent {kind, text, x, z}`(物資投下・金色ゾンビ・空爆・大行進 など)
- **新しい音の名前**(音係が作る): 'chainsaw' 'hammer' 'crossbow' 'airstrike' 'cannon' 'disc' 'drone' 'tornado' 'meteor' 'acid' 'nailgun' 'emp' 'shuriken' 'whip' 'beam' 'gatling'

### 第2弾で増えた主な API(詳しくは各ファイルの先頭のコメント)
- Engine: `fovKick(deg)` `setRoll(rad)` `landDip(a)` `settings{sens,autoTurn,invertY}`。視点のカメラは `view-camera.js`、向き操作は `view-look.js`、照準・当たった印・視点パネルは `view-hud.js`
- Player: `moves{dashing,airborne,busy,ready}`(ダッシュ・叩きつけは `hero-moves.js`)。跳ぶと `pos.y` が上がる
- Input: `consumeDash()` `consumeSlam()` `consumeViewHold()`。キー F/C = ダッシュ、G = 叩きつけ、V = 視点、B = 視点の設定
- Weapons: 31種(`weapon-defs.js` / `weapon-extra.js`)。一人称の手元の武器は `weapon-view.js`(`scene.onAfterRender` で描く。置きかえるときは つなぐこと)。`crossTarget`
- Score: `fever feverActive addFever(v) startFever(sec) boost(mult,sec) bonus(pts,x,z) stats favoriteWeapon()`
- Director: `happen(kind)`(supply golden march airstrike bossrush tsunami skyfall challenge discover)`spawnBoss(type,x,z,hpMul)` `bossTypes()`
- World: `timeOfDay`(0 = 昼, 0.25 = 夕, 0.5 = 真夜中, 0.75 = 夜明け、1周 7分)`weather` `night` `wet` `setTime(t)` `setWeather(w,instant)` `damage(x,z,r,amount,{cause})` `hitLine(...)` `explode(x,z,r,amount)` `props`。マップは 1200m(川・港・遊園地・空港・基地・墓地・農場)
- イベント(追加): `hitMarker {crit,kill}` `dash` `dashHit` `slamJump` `slam` `feverStart` `feverEnd` `worldEvent` `worldChange` `propExplode` `propBreak` `lightning` `heliPass` `distantBoom` `crows` `personalBest` `shieldBreak` `zombieLeap` `zombieLand` `giantStep` `bossAct` `weaponSfx {name}` `viewChange {mode,prev}`

### 第3弾(軽量化・操作)
- Engine: `shouldRender(now,state)`(プレイ 60 / 省エネ 30 / タイトル 30 / 停止 15。main のループの頭で呼ぶ)`setEco(on)` `eco` `level`(自動で軽くした段階)`beforeRender[]`。`#eco` で省エネ
- Input: タッチは指ごとに役目(スティック/撃つ/右側)を `changedTouches` で追う。撃つボタンを押したまま左右になぞると向きが変わる(上下は固定)。`turn` `consumeTurn()` `assistScale()` `releaseAll()`
- 自動で向く(autoTurn2)は はじめオフ。チェーンソーは刃に当たった敵だけ(`weaponSfx` grind / sawCut)

## 公開のしかた
- `main` が GitHub Pages で公開中(https://roguepink.github.io/sokai/)。**`main` に入れる = 公開**。大きな更新は別の枝(例 `round2`)でまとめて、ノブさんに見せて OK をもらってから `main` へ

## 座標・単位
- 1 = 1m。x = 右(東)、z = 手前(南)、y = 上。マップの中心 (0,0)、一辺 `CONFIG.WORLD_SIZE`
- 向き(facing)は 0 = 北(-z)、PI/2 = 東(+x)。向きベクトル = (sin f, -cos f)。メッシュは rotation.y = -facing
- カメラは北が上の固定(スティックの向き = 画面の向き)。斜め上から見下ろす。建物の中では寄る・屋根が消える

## 係(ファイル)と、ほかの係が使ってよい約束(API)
**自分の係のファイルだけ直す。**ほかの係のファイルを直したいときは、その係に頼む(または最後に統合係がやる)。
約束(API)は消したり意味を変えたりしない。足すのは自由。

| ファイル | 係 | 中身 |
|---|---|---|
| `main.js` `engine.js` `input.js` `config.js` `events.js` `util.js` | 統合(リーダー) | 起動・ループ・描画・カメラ・操作 |
| `world.js`(+ `world-*.js` を足してよい) | マップ係 | 地面・町・森・建物・道具類・ぶつかり判定・道さがし地図 |
| `zombies.js` `director.js` `player.js`(+ `zombie-*.js` `boss*.js`) | キャラ係 | ゾンビ・ボス・主人公の見た目と動き、出現、倒れ方 |
| `weapons.js` `fx.js`(+ `weapon-*.js` `fx-*.js`) | 武器係 | 武器・弾・爆発・火花・血・光・跡 |
| `ui.js` `score.js` `audio.js` `css/style.css` `index.html` の画面部分 | 画面・音係 | 点数・コンボ・演出の文字・メニュー・効果音・BGM |

### Engine(engine.js)
`scene` `camera` `renderer` / `shake(0..2)` 画面ゆれ / `hitStop(sec)` 一瞬止める / `slowMo(sec, scale)` / `setZoom(mult)` カメラを引く /
`project(x,y,z)` → 画面の {x,y}(px)or null / `quality` 'low'|'mid'|'high' / `timeScale` / `fps`

### World(world.js)
`group` / `collideCircle(p{x,z}, r)` 壁から押し出す / `segmentHit(x0,z0,x1,z1)` → 0..1(弾が壁に当たる所)/
`blockedAt(x,z,r)` / `buildingAt(x,z)` → 建物 or null / `inside`(プレイヤーのいる建物)/ `spawnPoint(cx,cz,minD,maxD)` → {x,z}|null /
`nav` = { w, h, ox, oz, size, blocked: Uint8Array }(1m マスの壁地図。道さがし用)/ `addBox(minX,minZ,maxX,maxZ,{h,mat,mesh,building})` /
`update(dt, player)` / `half` / `boxes` / `buildings` / `zoneAt(x,z)` → 'town'|'forest'|... /
`minimapImage()` → 上から見た地図の canvas(北が上、マップ全体)。UI のミニマップ用(なければ UI は自分で描く)

### Player(player.js)
`pos`(Vector3)`vel` `facing` `aimDir`(XZ 単位ベクトル。武器係が決める)`aiming` `radius` `mesh` /
`swing()` 剣をふる / `spin()` 回転斬り / `recoil(s)` / `holdWeapon(obj|null)` 右手に銃の見た目 / `muzzle(out)` 銃口の位置

### Zombies(zombies.js)
`list`(生きている敵: {id,type,def,x,z,vx,vz,hp,maxHp,r,alive,boss,...})/ `spawn(type,x,z)` / `count()` /
`queryCircle(x,z,r,out)` / `nearest(x,z,maxDist,dirX,dirZ,cosMin)` / `raycast(x,z,dx,dz,maxDist,out)` → [{e,t}] 近い順 /
`damage(e, amount, {dirX,dirZ,force,cause,crit})` → 倒したら true / `damageCircle(x,z,r,amount,{force,cause,falloff})` → 倒した数 / `TYPES`

**敵の状態(武器係が入れて、キャラ係が動き・見た目・ダメージに反映する)**
- `e.stun`(秒)ひるみ / `e.frozen`(秒)凍って止まる・青白い。凍ったまま倒れたら「砕ける」倒れ方 /
  `e.burn`(秒)+ `e.burnDps` 燃える(キャラ係が `damage(e, burnDps*dt, {cause:'fire'})` と炎の粒)/ `e.shock`(秒)しびれて震える
- ボスは `e.boss = true`、`e.name`(日本語の名前)を持つ。UI は `e.hp / e.maxHp` で体力バーを出す

### Weapons(weapons.js)
`WEAPONS`(配列 {id, name(日本語), icon(絵文字), sound, ...})/ `index` / `current` / `select(i)` / `update(dt,input,player)` / `spin(player)` /
`spinReady`(0..1 回転斬りの溜まり具合。1 で使える)
`sound` は音係と共通の名前: 'mg' 'minigun' 'pistol' 'shotgun' 'sniper' 'rail' 'grenade' 'launcher' 'rocket' 'missile' 'flame' 'laser' 'lightning' 'plasma' 'freeze' 'blackhole'

### FX(fx.js)
`burst({x,y,z,count,color,speed,up,life,size,grav,drag,dirX,dirZ,spread})` / `blood(x,y,z,dirX,dirZ,amount)` / `explosion(x,z,radius)` /
`tracer(x0,y0,z0,x1,y1,z1,color,life)` / `update(dt)`

### Score / UI / Audio
Score: `score kills best combo mult newRecord active` / `save()`。UI: `show(v)` `update(dt)` `el`。Audio: `unlock()` `setMuted(m)`

### Input(input.js)
`move{x,z}` `fire`(押している間)/ `consumeSpin()` `consumeWeaponDelta()` `consumeWeaponSelect()` / `auto`(自動操作)
PC: WASD/矢印=移動、スペース/クリック=撃つ、Shift/E=回転斬り、Q/R/ホイール=武器、1〜0=武器を直接

## イベント(events.js の Events.on / emit)
| 名前 | 中身 | 出す係 |
|---|---|---|
| `kill` | {x,z,type,boss,points,cause,dirX,dirZ,force,scale} | ゾンビ |
| `hit` | {x,y,z,amount,crit,boss,cause} | ゾンビ |
| `fire` | {weapon,x,z} | 武器 |
| `melee` | {x,z,kills} | 武器 |
| `spin` | {x,z,kills} | 武器 |
| `explosion` | {x,z,radius} | 武器 |
| `weaponChange` | {weapon,index} | 武器 |
| `bossSpawn` / `bossDeath` | {name,x,z,e} | キャラ |
| `horde` | {count, text} 大群が来る | キャラ(出現係) |
| `zombieAttack` | {x,z} ゾンビが主人公をなぐった(主人公は無傷。見た目と音だけ) | キャラ |
| `score` | {points,x,z,combo,mult} | 点数 |
| `newRecord` | {best} | 点数 |
| `multiKill` | {count,points,x,z} | 点数 |
| `milestone` | {kind:'kills'|'combo'|'score',value,text,bonus} | 点数 |
| `comboEnd` | {combo} | 点数 |
| `bossDown` | {name,x,z,e}(ボス1体につき1回だけ。UI の Bosses が出す) | 画面 |
| `start` `pause` `resume` `finish` `reset` | | main |

## 順番(main.js の step、1/60 秒ごと)
Player → Weapons → Zombies → Director → FX → World → Score。描画とカメラ・UI はフレームごと。
タイトル画面の後ろでは、自動操作の見本プレイが動いている(点数は数えない)。

## 性能の目安(スマホで 60fps に近く)
- 同じ形はまとめて描く(InstancedMesh・ジオメトリの結合)。毎フレーム new しない(使い回す)
- 点光源の数を変えない(シェーダーの作り直しで固まる)。光の演出は決まった数の光を使い回す
- 影は太陽1つだけ。`Engine.quality` が 'low' のときは重い演出を減らす
- playtest の fps は Mac の数字。スマホは 1/3〜1/4 と思って余裕を持つ
