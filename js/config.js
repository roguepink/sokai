// ゲーム全体の設定値。調整したい数字はなるべくここに集める。
// 座標: x = 右(東), z = 手前(南), y = 上。1 = 1メートル。
export const CONFIG = {
  DT: 1 / 60,               // ゲームの計算は 1/60 秒きざみ(固定)
  MAX_FRAME: 0.1,           // 1フレームで進める最大の時間(秒)
  BEST_KEY: 'sokai-best',   // 最高記録(localStorage)
  SETTINGS_KEY: 'sokai-settings',

  WORLD_SIZE: 600,          // マップの一辺(メートル)。中心が (0,0)

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
