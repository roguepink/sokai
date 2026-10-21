// ゲーム全体の設定値。調整したい数字はなるべくここに集める。
// 座標: x = 右(東), z = 手前(南), y = 上。1 = 1メートル。
export const CONFIG = {
  DT: 1 / 60,               // ゲームの計算は 1/60 秒きざみ(固定)
  MAX_FRAME: 0.1,           // 1フレームで進める最大の時間(秒)
  BEST_KEY: 'sokai-best',   // 最高記録(localStorage)
  SETTINGS_KEY: 'sokai-settings',

  WORLD_SIZE: 800,          // マップの一辺(メートル)。中心が (0,0)

  PLAYER: {
    SPEED: 9.5,             // 走る速さ (m/s)
    RADIUS: 0.55,
    HEIGHT: 1.85,
  },

  CAMERA: {
    DIST: 15,               // プレイヤーからの距離
    PITCH: 0.95,            // 見下ろす角度(ラジアン。0 = 水平, 1.57 = 真上)
    INSIDE_DIST: 10,        // 建物の中では寄る
    FOV: 50,
    LERP: 8,
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
    SHADOW_AREA: 40,        // 影を計算するプレイヤー周りの広さ
    FOG_NEAR: 40,
    FOG_FAR: 140,
  },
};
