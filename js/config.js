// ゲーム全体の設定値。調整したい数字はなるべくここに集める。
// 座標: x = 右(東), z = 手前(南), y = 上。1 = 1メートル。
export const CONFIG = {
  DT: 1 / 60,               // ゲームの計算は 1/60 秒きざみ(固定)
  MAX_FRAME: 0.1,           // 1フレームで進める最大の時間(秒)
  BEST_KEY: 'sokai-best',   // 最高記録(localStorage)
  SETTINGS_KEY: 'sokai-settings',

  WORLD_SIZE: 1200,          // マップの一辺(メートル)。中心が (0,0)

  PLAYER: {
    SPEED: 9.5,             // 走る速さ (m/s)
    RADIUS: 0.55,
    HEIGHT: 1.85,
  },

  // 第5弾(立体感): 前は DIST 15 / PITCH 0.95 / FOV 50(真上に近く・望遠ぎみで 平たく見えた)。
  // 少し寝かせて・近づいて・画角を広げた(主人公の大きさは 同じ。遠近が強くなり、奥の景色と 建物の高さが 見える)
  CAMERA: {
    DIST: 12.6,             // プレイヤーからの距離
    PITCH: 0.82,            // 見下ろす角度(ラジアン。0 = 水平, 1.57 = 真上)
    INSIDE_DIST: 8.6,       // 建物の中では寄る
    TALL_PITCH: 0.12,       // たて長の画面(スマホを立てて持つ)では 少し 上から
    INSIDE_PITCH: 0.1,      // 建物の中では 少し 上から(手前の壁で かくれにくく)
    STREET_PITCH: 0.36,     // 高い建物にはさまれた道では ここまで 真上に寄せる(前と同じ 1.18 くらい)
    FOV: 58,
    LERP: 8,
    LEAD: 1.5,              // 走ると カメラが 進む先を 少し見る(m)
  },

  // 肩越し(tps)・一人称(fps)のカメラと、指・マウスで向きを変える速さ
  VIEW: {
    BLEND: 0.38,            // 視点を切りかえるときの なめらかな移り(秒)
    TPS: { BACK: 4.1, SIDE: 1.0, UP: 0.38, PIVOT: 1.55, FOV: 66, FIRE_BACK: 0.8, FIRE_FOV: -5, LAG: 16,
      PITCH_MIN: -0.72, PITCH_MAX: 0.5, PITCH0: -0.13 },
    FPS: { EYE: 1.68, FWD: 0.12, FOV: 74, BOB: 0.045, PITCH_MIN: -1.05, PITCH_MAX: 0.8, PITCH0: -0.06 },
    SENS_TOUCH: 0.0052,     // 指で 1px なぞったときの回り方(ラジアン)。速くなぞると 加速する
    SENS_MOUSE: 0.0023,     // マウス(ロック中) 1px
    ACCEL: 1.1,             // 速くなぞったときの加速(0 = なし)
    AUTO_TURN: 2.3,         // 自動で向きを合わせる いちばん速い回り方(ラジアン/秒)
  },

  // 主人公の大技: ダッシュ(体当たり)と ジャンプ叩きつけ
  MOVES: {
    DASH_SPEED: 31, DASH_TIME: 0.3, DASH_COOL: 0.38, DASH_R: 1.8, DASH_DMG: 900, DASH_FORCE: 34,
    SLAM_AIR: 0.52, SLAM_H: 3.4, SLAM_R: 9.5, SLAM_DMG: 2200, SLAM_FORCE: 44, SLAM_COOL: 0.9, DOUBLE_TAP: 0.42,
  },

  ZOMBIES: {
    MAX: 320,               // 同時に出せる最大数(インスタンスの上限)
  },

  RENDER: {
    SHADOW_SIZE: 2048,
    SHADOW_AREA: 40,        // 影を計算するプレイヤー周りの広さ(肩越し・一人称)
    TOP_SHADOW_AREA: 30,    // 同じく 見下ろしのとき(カメラを引くと 自動で広がる)
    FOG_NEAR: 40,
    FOG_FAR: 140,
    // 第5弾(立体感)
    SUN_MAX_Y: 0.74,        // 影をつくる光の 高さの上限(sin。0.74 = 約 48°)。真昼でも 影に長さが出る
    TOP_SUN_MAX_Y: 0.6,     // 見下ろしのときの上限(約 37°。影の長さ = 高さの 1.3 倍)
    TOP_LIGHT_X: 0.3,       // 見下ろしのとき、光は いつも 西(画面の左)から当てる。その 横向きの いちばん小さい量(真昼)。影が 右へ のびて よく見える(肩越し・一人称は 空の太陽のまま)
    TOP_LIGHT_Z: 0.14,      // 同じく 手前・奥の向き(+ = 手前から。小さいほど 正面の壁が かげる)
    VIGNETTE: 0.34,         // 画面のふちの暗さ(0 = なし)
    CONTRAST: 0.2,          // 色のコントラスト(0 = なし)
  },
};
