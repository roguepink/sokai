// キャラ係: ゾンビの「形」と「模様」。
// - 体の部位ごとの形(なめらかな回転体を手でゆがめたもの)
// - 服・顔・傷・血の模様を canvas で描いた 1 枚の絵(アトラス。8x8 マス)
// - 1 体ずつ 色・模様・光り方を変えるためのシェーダーの追加
// 絵の 1 マスの中: 横 = 体のまわり(左端 = 背中, 真ん中 = 正面), 縦 = 上が部位の上。
// 透明度(alpha)は「色のつけ方」: 0 = 肌の色をかける, 0.5 = 絵の色そのまま, 1 = 服の色をかける。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from './util.js';

const T = 128;            // 1 マスの大きさ(px)
const N = 8;              // 8 x 8 マス
const SIZE = T * N;

// ---------- マスの番号 ----------
export const TILE = {
  // 胴体(服)
  office: 0, tee: 1, hoodie: 2, scrubs: 3, police: 4, hivisY: 5, hivisO: 6, suit: 7,
  tank: 8, torn: 9, doctor: 10, flannel: 11, riot: 12, bloater: 13, sweater: 14, bare: 15,
  // ズボン(上 = もも, 下 = すね+くつ)のペア
  jeansU: 16, jeansL: 17, slacksU: 18, slacksL: 19, scrubU: 20, scrubL: 21, shortsU: 22, shortsL: 23,
  policeU: 24, policeL: 25, riotU: 26, riotL: 27, tornU: 28, tornL: 29, bootsL: 30,
  // 頭
  hShort: 32, hLong: 33, hBald: 34, hSkull: 35, hCap: 36, hHood: 37, hSurg: 38, hBloat: 39,
  // 腕(上腕 / 前腕+手)
  aSleeve: 40, aBare: 41, aShort: 42, aTorn: 43, fBare: 44, fSleeve: 45, fBloody: 46, fGlove: 47,
  helmet: 48, flesh: 49, boneCut: 50,
  // 第2弾: あご(下の歯)・ガスマスクの頭・迷彩・裂けた顔・小鬼・焦げた体・盾・マスクの部品・金色
  jaw: 51, hGas: 52, camo: 53, camoU: 54, camoL: 55, hTorn: 56, hImp: 57, burnt: 58, hBurnt: 59,
  shieldT: 60, maskT: 61, goldT: 62,
};

const SKIN = '#000000', RAW = '#808080', CLOTH = '#ffffff';

// ---------- 絵(アトラス) ----------
export function buildAtlas() {
  const cc = document.createElement('canvas'); cc.width = cc.height = SIZE;
  const mc = document.createElement('canvas'); mc.width = mc.height = SIZE;
  const c = cc.getContext('2d'), m = mc.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, SIZE, SIZE);
  m.fillStyle = RAW; m.fillRect(0, 0, SIZE, SIZE);
  const rnd = seeded(777);
  const R = (a, b) => a + rnd() * (b - a);

  // マス t に描く。(0,0) = マスの左上。v=1(部位の上)が上。
  const tile = (t, fn) => {
    const col = t % N, row = Math.floor(t / N);
    const x0 = col * T, y0 = (N - 1 - row) * T;
    for (const g of [c, m]) { g.save(); g.beginPath(); g.rect(x0, y0, T, T); g.clip(); g.translate(x0, y0); }
    fn();
    c.restore(); m.restore();
  };
  // 両方に同じ形を描く(色, 塗り方)
  const rect = (x, y, w, h, col, mask) => {
    c.fillStyle = col; c.fillRect(x, y, w, h);
    if (mask) { m.fillStyle = mask; m.fillRect(x, y, w, h); }
  };
  const ell = (x, y, rx, ry, col, mask, rot = 0) => {
    for (const ox of [0, -T, T]) {
      c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
      if (mask) { m.fillStyle = mask; m.beginPath(); m.ellipse(x + ox, y, rx, ry, rot, 0, Math.PI * 2); m.fill(); }
    }
  };
  const poly = (pts, col, mask) => {
    for (const g of mask ? [c, m] : [c]) {
      g.fillStyle = g === c ? col : mask;
      g.beginPath(); g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath(); g.fill();
    }
  };
  const line = (x0, y0, x1, y1, w, col, mask) => {
    for (const g of mask ? [c, m] : [c]) {
      g.strokeStyle = g === c ? col : mask; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  };
  // 布の地(白っぽい。服の色をかける)
  const fabric = (base = 225, var_ = 18, mask = CLOTH) => {
    rect(0, 0, T, T, `rgb(${base},${base},${base})`, mask);
    for (let i = 0; i < 500; i++) {
      const v = base + R(-var_, var_) | 0;
      c.fillStyle = `rgba(${v},${v},${v},0.5)`; c.fillRect(R(0, T), R(0, T), R(1, 3), R(1, 3));
    }
  };
  // 肌の地(明るいグレー + しみ・血管。肌の色をかける)
  const skin = (x = 0, y = 0, w = T, h = T) => {
    rect(x, y, w, h, '#d8d8d8', SKIN);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let i = 0; i < 40; i++) {
      const v = R(120, 200) | 0;
      c.fillStyle = `rgba(${v},${v - 10},${v},0.25)`;
      c.beginPath(); c.ellipse(R(x, x + w), R(y, y + h), R(3, 12), R(2, 9), R(0, 3), 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(70,60,110,0.35)'; c.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      let px = R(x, x + w), py = R(y, y + h);
      c.beginPath(); c.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += R(-8, 8); py += R(-8, 8); c.lineTo(px, py); }
      c.stroke();
    }
    c.restore();
  };
  // 汚れ(色だけ暗く)
  const grime = (n = 30, a = 0.18) => {
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(${R(30, 60) | 0},${R(25, 45) | 0},${R(15, 30) | 0},${a})`;
      c.beginPath(); c.ellipse(R(0, T), R(0, T), R(3, 16), R(2, 10), R(0, 3), 0, 7); c.fill();
    }
  };
  // 血(しみ + たれ)
  const blood = (n = 4, big = 1, yMin = 0, yMax = T) => {
    for (let i = 0; i < n; i++) {
      const x = R(0, T), y = R(yMin, yMax), r = R(4, 13) * big;
      const col = `rgb(${R(70, 110) | 0},${R(0, 10) | 0},${R(0, 8) | 0})`;
      ell(x, y, r, r * R(0.6, 1), col, RAW, R(0, 3));
      for (let k = 0; k < 5; k++) ell(x + R(-r * 1.5, r * 1.5), y + R(-r, r), R(1, 4), R(1, 4), col, RAW);
      for (let k = 0; k < 3; k++) { const dx = x + R(-r, r); line(dx, y, dx + R(-2, 2), y + R(8, 30) * big, R(1.5, 3.5), col, RAW); }
    }
  };
  const wound = (x, y, w, h) => {
    ell(x, y, w, h, '#3a0404', RAW, R(-0.5, 0.5));
    ell(x, y, w * 0.7, h * 0.6, '#7a1410', RAW);
    for (let i = 0; i < 4; i++) ell(x + R(-w * 0.5, w * 0.5), y + R(-h * 0.4, h * 0.4), R(1, 3), R(1, 2), '#b0402a', RAW);
  };
  const text = (s, x, y, size, col) => {
    c.fillStyle = col; c.font = `bold ${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const ox of [0, -T, T]) c.fillText(s, x + ox, y);
    m.fillStyle = RAW; m.font = c.font; m.textAlign = 'center'; m.textBaseline = 'middle';
    for (const ox of [0, -T, T]) m.fillText(s, x + ox, y);
  };
  const buttons = (x, y0, y1, col = '#e8e8e8') => { for (let y = y0; y < y1; y += 14) ell(x, y, 1.6, 1.6, col, RAW); };

  // ===== 胴体 =====(x: 0 背中, 32 右わき, 64 正面, 96 左わき / y: 0 首 → 128 腰)
  tile(TILE.office, () => {
    fabric(235, 12);
    poly([50, 0, 64, 18, 78, 0], '#f4f4f4', RAW);           // えり
    poly([60, 12, 68, 12, 70, 96, 64, 104, 58, 96], '#7a1820', RAW);   // ネクタイ
    for (let y = 22; y < 96; y += 9) line(61, y, 67, y + 4, 2, '#a83040', RAW);
    buttons(73, 20, 110, '#cccccc');
    rect(80, 34, 14, 12, 'rgba(0,0,0,0.08)');
    rect(0, 118, T, 10, '#2a2420', RAW);                    // ベルト
    grime(25); blood(5, 1, 20, 110); wound(R(40, 90), R(50, 90), 8, 5);
  });
  tile(TILE.tee, () => {
    fabric(225, 16);
    ell(64, 0, 13, 9, '#d0d0d0', SKIN); ell(0, 0, 11, 5, '#d0d0d0', SKIN);
    ell(64, 52, 16, 14, '#e8e8e8', RAW); ell(64, 52, 10, 9, '#202020', RAW); text('Z', 64, 53, 12, '#e8e8e8');
    grime(30); blood(6, 1.1, 10, 120); wound(R(30, 100), R(40, 100), 9, 6);
  });
  tile(TILE.hoodie, () => {
    fabric(210, 14);
    rect(0, 0, T, 16, '#9a9a9a', CLOTH);                    // フード(首のまわりの たまり)
    for (let x = 0; x < T; x += 6) line(x, 2, x + 3, 14, 1, 'rgba(0,0,0,0.25)');
    poly([40, 76, 88, 76, 94, 112, 34, 112], '#bdbdbd', CLOTH);   // ポケット
    line(58, 14, 56, 46, 2, '#eeeeee', RAW); line(70, 14, 72, 46, 2, '#eeeeee', RAW);
    rect(0, 120, T, 8, '#8a8a8a', CLOTH);
    grime(35); blood(5, 1, 20, 120);
  });
  tile(TILE.scrubs, () => {
    fabric(225, 10);
    poly([50, 0, 64, 26, 78, 0], '#d0d0d0', SKIN);          // V ネック
    rect(76, 36, 14, 14, 'rgba(0,0,0,0.12)');
    line(80, 36, 80, 30, 2, '#e0e0e0', RAW);
    grime(25); blood(7, 1.2, 10, 120);
  });
  tile(TILE.police, () => {
    rect(0, 0, T, T, '#1d2a45', RAW);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(255,255,255,${R(0.02, 0.06)})`; c.fillRect(R(0, T), R(0, T), 2, 2); }
    poly([52, 0, 64, 16, 76, 0], '#162036', RAW);
    buttons(64, 18, 110, '#c9b25a');
    rect(46, 30, 14, 12, '#16213a', RAW); rect(70, 30, 14, 12, '#16213a', RAW);   // ポケット
    poly([78, 24, 86, 24, 88, 30, 82, 36, 76, 30], '#d8c060', RAW);              // バッジ
    rect(24, 6, 16, 10, '#b89a40', RAW); rect(88, 6, 16, 10, '#b89a40', RAW);    // 肩の印
    rect(0, 116, T, 12, '#0c0c0e', RAW); rect(58, 116, 12, 12, '#a0a0a0', RAW);
    text('POLICE', 0, 50, 13, '#d8d8d8');
    grime(20, 0.12); blood(5, 1, 20, 110);
  });
  const vest = (col) => {
    fabric(215, 14);
    rect(0, 0, 54, 118, col, RAW); rect(74, 0, 54, 118, col, RAW);   // ベスト(前は開いている)
    for (const y of [70, 90]) { rect(0, y, 54, 7, '#d8dde0', RAW); rect(74, y, 54, 7, '#d8dde0', RAW); }
    rect(40, 0, 7, 70, '#d8dde0', RAW); rect(81, 0, 7, 70, '#d8dde0', RAW); rect(10, 0, 7, 70, '#d8dde0', RAW); rect(111, 0, 7, 70, '#d8dde0', RAW);
    rect(0, 118, T, 10, '#2a2420', RAW);
    grime(40, 0.2); blood(5, 1, 20, 115);
  };
  tile(TILE.hivisY, () => vest('#c6ee2a'));
  tile(TILE.hivisO, () => vest('#ff7418'));
  tile(TILE.suit, () => {
    fabric(200, 8);
    poly([46, 0, 64, 52, 82, 0], '#f0f0f0', RAW);           // シャツ
    poly([60, 8, 68, 8, 67, 50, 64, 54, 61, 50], '#3a1a50', RAW);   // ネクタイ
    line(46, 0, 64, 54, 3, 'rgba(0,0,0,0.35)'); line(82, 0, 64, 54, 3, 'rgba(0,0,0,0.35)');
    buttons(64, 64, 100, '#202020');
    rect(42, 82, 16, 3, 'rgba(0,0,0,0.3)'); rect(70, 82, 16, 3, 'rgba(0,0,0,0.3)');
    grime(20, 0.12); blood(5, 1, 30, 120); wound(R(30, 100), R(60, 100), 7, 5);
  });
  tile(TILE.tank, () => {
    fabric(225, 14);
    skin(0, 0, T, 14); skin(14, 0, 30, 50); skin(84, 0, 30, 50);   // 肩・わきの はだ
    ell(64, 4, 14, 14, '#d0d0d0', SKIN); ell(0, 4, 12, 10, '#d0d0d0', SKIN);
    grime(35, 0.22); blood(7, 1.2, 10, 120);
  });
  tile(TILE.torn, () => {
    fabric(215, 18);
    for (let i = 0; i < 5; i++) {        // やぶれて 肌が見える
      const x = R(10, 118), y = R(20, 110), w = R(10, 22), h = R(8, 18);
      skin(x - w, y - h, w * 2, h * 2);
      ell(x, y, w * 0.6, h * 0.5, '#5a0a08', RAW);
    }
    for (let k = 0; k < 4; k++) line(48, 54 + k * 9, 80, 54 + k * 9, 2.5, '#d8d0c0', RAW);   // あばら骨
    wound(64, 72, 16, 12);
    grime(45, 0.24); blood(8, 1.3, 0, 128);
  });
  tile(TILE.doctor, () => {
    rect(0, 0, T, T, '#e6e8e8', RAW);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${R(0.02, 0.05)})`; c.fillRect(R(0, T), R(0, T), 2, 2); }
    poly([48, 0, 64, 44, 80, 0], '#7a9ab8', RAW);           // 中のシャツ
    line(48, 0, 64, 46, 3, '#c8cccc', RAW); line(80, 0, 64, 46, 3, '#c8cccc', RAW);
    rect(76, 44, 16, 14, '#d4d6d6', RAW); line(80, 44, 80, 38, 2, '#2a5aaa', RAW);
    c.strokeStyle = '#202024'; c.lineWidth = 2.5; c.beginPath(); c.arc(64, 6, 22, 0.3, Math.PI - 0.3); c.stroke();   // 聴診器
    grime(25, 0.12); blood(9, 1.3, 10, 120);
  });
  tile(TILE.flannel, () => {
    fabric(215, 8);
    for (let x = 0; x < T; x += 16) { rect(x, 0, 6, T, 'rgba(0,0,0,0.28)'); rect(x + 9, 0, 2, T, 'rgba(255,255,255,0.25)'); }
    for (let y = 0; y < T; y += 16) { rect(0, y, T, 6, 'rgba(0,0,0,0.25)'); rect(0, y + 9, T, 2, 'rgba(255,255,255,0.2)'); }
    poly([52, 0, 64, 14, 76, 0], '#d0d0d0', SKIN);
    buttons(64, 16, 112, '#e0e0e0');
    grime(30); blood(5, 1, 10, 120);
  });
  tile(TILE.riot, () => {
    rect(0, 0, T, T, '#1c1d21', RAW);
    for (const x of [44, 72]) rect(x, 18, 14, 40, '#2a2c32', RAW);    // 胸の板
    rect(40, 62, 48, 40, '#26282d', RAW);
    for (const x of [8, 100]) rect(x, 20, 20, 60, '#25272c', RAW);
    rect(18, 0, 22, 14, '#2e3036', RAW); rect(88, 0, 22, 14, '#2e3036', RAW);   // 肩当て
    text('POLICE', 0, 46, 13, '#e8e8e8'); text('RIOT', 64, 80, 11, '#c8c8c8');
    rect(0, 114, T, 14, '#101012', RAW);
    for (let i = 0; i < 40; i++) line(R(0, T), R(0, T), R(0, T), R(0, T), 1, 'rgba(255,255,255,0.05)');
    blood(4, 0.9, 20, 110);
  });
  tile(TILE.bloater, () => {
    skin();
    for (let i = 0; i < 26; i++) {          // できもの
      const x = R(0, T), y = R(10, 120), r = R(3, 9);
      ell(x, y, r, r, '#b8b860', RAW); ell(x - r * 0.3, y - r * 0.3, r * 0.4, r * 0.4, '#e8e8a0', RAW);
    }
    for (let i = 0; i < 12; i++) line(R(0, T), R(0, T), R(0, T), R(0, T), 1.5, 'rgba(40,70,40,0.6)', SKIN);
    wound(64, 86, 12, 6); grime(30, 0.2); blood(4, 0.8, 50, 128);
    rect(0, 120, T, 8, '#3a3630', RAW);
  });
  tile(TILE.sweater, () => {
    fabric(215, 10);
    for (let x = 0; x < T; x += 4) rect(x, 0, 1.5, T, 'rgba(0,0,0,0.12)');
    rect(0, 0, T, 10, '#c8c8c8', CLOTH); rect(0, 116, T, 12, '#c0c0c0', CLOTH);
    for (let x = 0; x < T; x += 4) rect(x, 116, 1.5, 12, 'rgba(0,0,0,0.2)');
    grime(30); blood(6, 1.1, 10, 120);
  });
  tile(TILE.bare, () => {
    skin();
    for (let k = 0; k < 4; k++) line(50, 50 + k * 8, 78, 50 + k * 8, 2, 'rgba(0,0,0,0.25)');
    wound(R(30, 100), R(50, 100), 12, 8); grime(30, 0.2); blood(6, 1, 10, 120);
    rect(0, 118, T, 10, '#2a2420', RAW);
  });

  // ===== ズボン =====(上マス = もも: 上がこし / 下マス = すね: いちばん下 10px がくつ)
  const pantsU = (base, belt) => { fabric(base, 14); rect(0, 0, T, 10, belt, RAW); line(64, 10, 64, 50, 2, 'rgba(0,0,0,0.25)'); };
  const shoe = (col, sole = '#141414') => { rect(0, 112, T, 16, col, RAW); rect(0, 124, T, 4, sole, RAW); ell(64, 116, 10, 3, 'rgba(255,255,255,0.15)'); };
  tile(TILE.jeansU, () => { pantsU(205, '#3a2a1c'); for (let i = 0; i < 200; i++) rect(R(0, T), R(10, T), 4, 1, 'rgba(255,255,255,0.12)'); grime(25); blood(4, 1, 10, 120); });
  tile(TILE.jeansL, () => { fabric(205, 14); for (let i = 0; i < 200; i++) rect(R(0, T), R(0, 110), 4, 1, 'rgba(255,255,255,0.12)'); ell(64, 18, 16, 10, 'rgba(255,255,255,0.25)'); grime(30); blood(4, 1, 0, 100); shoe('#d8d8d8', '#888'); });
  tile(TILE.slacksU, () => { pantsU(200, '#141414'); grime(20, 0.12); blood(3, 1, 10, 120); });
  tile(TILE.slacksL, () => { fabric(200, 8); line(64, 0, 64, 110, 1.5, 'rgba(0,0,0,0.2)'); grime(25, 0.15); blood(3, 1, 0, 100); shoe('#1a1410', '#0a0a0a'); });
  tile(TILE.scrubU, () => { fabric(222, 10); rect(0, 0, T, 8, '#e0e0e0', CLOTH); grime(20); blood(5, 1.1, 10, 120); });
  tile(TILE.scrubL, () => { fabric(222, 10); grime(25); blood(4, 1, 0, 100); shoe('#e8e8e8', '#aaa'); });
  tile(TILE.shortsU, () => { fabric(210, 14); rect(0, 0, T, 8, '#2a2420', RAW); skin(0, 92, T, 36); rect(0, 88, T, 5, 'rgba(0,0,0,0.3)'); grime(25); blood(4, 1, 30, 128); });
  tile(TILE.shortsL, () => { skin(0, 0, T, 112); wound(R(20, 100), R(20, 90), 7, 5); grime(25, 0.2); blood(4, 1, 0, 100); rect(0, 104, T, 8, '#e0e0e0', RAW); shoe('#c03030', '#e8e8e8'); });
  tile(TILE.policeU, () => { rect(0, 0, T, T, '#1a2440', RAW); rect(0, 0, T, 10, '#0c0c0e', RAW); rect(26, 10, 4, T, '#c9b25a', RAW); rect(98, 10, 4, T, '#c9b25a', RAW); grime(15, 0.1); blood(3, 1, 10, 120); });
  tile(TILE.policeL, () => { rect(0, 0, T, T, '#1a2440', RAW); rect(26, 0, 4, 110, '#c9b25a', RAW); rect(98, 0, 4, 110, '#c9b25a', RAW); grime(20, 0.12); blood(3, 1, 0, 100); shoe('#0c0c0c', '#050505'); });
  tile(TILE.riotU, () => { rect(0, 0, T, T, '#1a1b1f', RAW); rect(0, 0, T, 12, '#0c0c0e', RAW); rect(44, 30, 40, 50, '#24262b', RAW); blood(3, 0.8, 20, 120); });
  tile(TILE.riotL, () => { rect(0, 0, T, T, '#1a1b1f', RAW); ell(64, 18, 24, 18, '#2c2e34', RAW); ell(64, 14, 12, 6, '#3a3c44', RAW); blood(2, 0.8, 30, 100); shoe('#0c0c0c', '#050505'); rect(0, 96, T, 18, '#121214', RAW); });
  tile(TILE.tornU, () => { pantsU(205, '#3a2a1c'); for (let i = 0; i < 3; i++) { const x = R(10, 118), y = R(30, 110); skin(x - 12, y - 9, 24, 18); ell(x, y, 6, 4, '#5a0a08', RAW); } grime(40, 0.24); blood(6, 1.2, 10, 128); });
  tile(TILE.tornL, () => { fabric(205, 14); for (let i = 0; i < 3; i++) { const x = R(10, 118), y = R(10, 90); skin(x - 14, y - 10, 28, 20); wound(x, y, 6, 4); } rect(0, 70, T, 42, '#d0d0d0', SKIN); skin(0, 70, T, 42); grime(40, 0.24); blood(6, 1.2, 0, 110); shoe('#3a2a1a', '#141008'); });
  tile(TILE.bootsL, () => { fabric(200, 10); grime(30, 0.2); blood(4, 1, 0, 80); rect(0, 76, T, 52, '#2a2016', RAW); rect(0, 76, T, 4, '#1a140c', RAW); rect(0, 124, T, 4, '#0a0806', RAW); });

  // ===== 頭 =====(y: 0 頭のてっぺん / 33 生えぎわ / 58 目 / 78 口 / 88 あご / 下は首。x: 64 = 顔の正面)
  const face = (eyeCol = '#e8e0a0', gore = 1) => {
    skin();
    ell(64, 60, 30, 26, 'rgba(0,0,0,0.06)');
    ell(64, 47, 26, 5, 'rgba(0,0,0,0.12)');                      // まゆの下のかげ
    for (const s of [-1, 1]) {
      ell(64 + s * 11, 58, 8, 6, '#0c0504', RAW);                 // 目のくぼみ(光る目玉が入る)
      ell(64 + s * 11, 58, 4.5, 3.6, '#2a0a06', RAW);
      ell(64 + s * 11, 58, 2.2, 1.8, eyeCol, RAW);                // にごった目(遠くで見える)
      ell(64 + s * 11, 65, 8, 3.5, 'rgba(70,20,60,0.45)');        // くま
      ell(64 + s * 15, 70, 6, 4, 'rgba(0,0,0,0.12)');             // こけたほほ
      line(64 + s * 6, 52, 64 + s * 17, 50, 2, 'rgba(40,10,10,0.35)');   // まゆ
    }
    ell(64, 68, 4, 5, 'rgba(0,0,0,0.22)');                        // 鼻
    ell(61.5, 71, 1.4, 1.2, '#1a0404', RAW); ell(66.5, 71, 1.4, 1.2, '#1a0404', RAW);   // 鼻の穴
    // 口: 上の歯(黄ばんで欠けている)+ 黒い口の中(下はあごの部品)
    ell(64, 75.5, 13, 3, '#4a1010', RAW);                         // 上くちびる(ただれている)
    rect(50, 76, 28, 16, '#120202', RAW);                         // 口の中
    for (let i = -4; i <= 4; i++) if (Math.abs(i) !== 2 || R(0, 1) < 0.5) rect(64 + i * 3 - 1.2, 76.5, 2.4, R(3, 5), i === 0 ? '#d8c8a0' : '#b8a878', RAW);
    for (const s of [-1, 1]) rect(64 + s * 13, 76, 1.5, 5, '#d0c098', RAW);   // きば
    for (let k = 0; k < 3 * gore; k++) { const x = 52 + R(0, 24); line(x, 84, x + R(-2, 2), 84 + R(10, 30), R(2, 4), '#6a0606', RAW); }
    for (const s of [-1, 1]) { ell(64 + s * 30, 62, 4, 7, 'rgba(0,0,0,0.18)'); ell(64 + s * 30, 62, 2, 4, 'rgba(60,0,0,0.25)'); }   // 耳
    wound(64 + (R(0, 1) < 0.5 ? -1 : 1) * R(14, 24), R(64, 86), R(3, 6), R(2, 4));
    grime(20, 0.12);
  };
  const hair = (yEnd, back) => {
    rect(0, 0, T, yEnd, '#c8c8c8', CLOTH);
    ell(0, yEnd, 34, back, '#c8c8c8', CLOTH);
    for (let i = 0; i < 300; i++) line(R(0, T), R(0, yEnd), R(0, T), R(0, yEnd) + R(2, 10), 1, `rgba(${R(0, 60) | 0},${R(0, 60) | 0},${R(0, 60) | 0},0.35)`);
    for (let i = 0; i < 4; i++) ell(R(0, T), R(5, yEnd), R(4, 10), R(3, 7), '#d0d0d0', SKIN);   // 抜けた所
  };
  tile(TILE.hShort, () => { face(); hair(30, 30); blood(2, 0.8, 30, 128); });
  tile(TILE.hLong, () => {
    face();
    hair(34, 70);
    for (const x of [22, 106]) rect(x - 14, 20, 28, 70, '#c0c0c0', CLOTH);   // 横に垂れる髪
    for (let i = 0; i < 120; i++) { const x = R(0, T); if (Math.abs(x - 64) > 26) line(x, 30, x + R(-3, 3), 100, 1, 'rgba(0,0,0,0.25)'); }
    blood(2, 0.8, 40, 128);
  });
  tile(TILE.hBald, () => {
    face();
    for (let i = 0; i < 6; i++) ell(R(0, T), R(0, 30), R(4, 9), R(3, 6), 'rgba(80,50,60,0.4)');
    ell(0, 34, 30, 14, '#c0c0c0', CLOTH);                         // 後ろに少し残った髪
    for (let i = 0; i < 80; i++) line(R(0, 30), R(22, 46), R(0, 30), R(30, 50), 1, 'rgba(0,0,0,0.3)');
    for (let i = 0; i < 80; i++) line(R(98, 128), R(22, 46), R(98, 128), R(30, 50), 1, 'rgba(0,0,0,0.3)');
    blood(3, 0.9, 0, 128);
  });
  tile(TILE.hSkull, () => {
    face('#f0e8b0', 2);
    hair(26, 24);
    ell(R(30, 50), 18, 18, 12, '#5a0806', RAW); ell(R(30, 50), 18, 13, 8, '#d8d0b8', RAW);   // 頭がい骨が見える
    ell(88, 70, 10, 14, '#5a0806', RAW); ell(88, 72, 6, 9, '#c8b8a0', RAW);                   // ほほの肉がない
    blood(4, 1.1, 0, 128);
  });
  tile(TILE.hCap, () => {
    face();
    rect(0, 0, T, 34, '#1a2440', RAW); rect(0, 28, T, 6, '#0c0c0e', RAW);
    rect(40, 30, 48, 8, '#101418', RAW); ell(64, 14, 6, 6, '#d8c060', RAW);
    blood(2, 0.8, 30, 128);
  });
  tile(TILE.hHood, () => {
    face();
    rect(0, 0, T, 26, '#b4b4b4', CLOTH);                           // フード(顔のまわり以外)
    rect(0, 0, 32, T, '#b0b0b0', CLOTH); rect(96, 0, 32, T, '#b0b0b0', CLOTH);
    line(32, 26, 32, 110, 5, '#909090', CLOTH); line(96, 26, 96, 110, 5, '#909090', CLOTH); line(32, 26, 96, 26, 5, '#909090', CLOTH);
    for (let i = 0; i < 6; i++) line(R(0, 30), R(0, T), R(0, 30), R(0, T), 2, 'rgba(0,0,0,0.15)');
    blood(2, 0.8, 40, 128);
  });
  tile(TILE.hSurg, () => {
    face();
    rect(0, 0, T, 32, '#dcdcdc', CLOTH);
    for (let i = 0; i < 40; i++) line(R(0, T), R(0, 32), R(0, T), R(0, 32), 1, 'rgba(0,0,0,0.08)');
    rect(40, 70, 48, 22, '#a8c8d0', RAW);                         // マスク(ずれて血まみれ)
    line(40, 74, 0, 64, 1.5, '#e0e0e0', RAW); line(88, 74, 128, 64, 1.5, '#e0e0e0', RAW);
    blood(4, 1, 60, 100);
  });
  tile(TILE.hBloat, () => {
    face('#d8e870', 2);
    for (let i = 0; i < 18; i++) { const x = R(0, T), y = R(0, 110), r = R(3, 8); ell(x, y, r, r, '#b8b860', RAW); ell(x - 1, y - 1, r * 0.4, r * 0.4, '#e8e8a0', RAW); }
    blood(3, 1, 60, 128);
  });

  // ===== 腕 =====(上腕: 上が肩 / 前腕: 下 0..46px が手)
  tile(TILE.aSleeve, () => { fabric(222, 12); line(64, 0, 64, T, 1.5, 'rgba(0,0,0,0.2)'); grime(25); blood(3, 1, 0, 128); });
  tile(TILE.aBare, () => { skin(); wound(R(30, 100), R(30, 100), 8, 6); grime(20, 0.2); blood(3, 1, 0, 128); });
  tile(TILE.aShort, () => { fabric(222, 12); skin(0, 56, T, 72); rect(0, 52, T, 5, 'rgba(0,0,0,0.25)'); wound(R(30, 100), 90, 7, 5); grime(25); blood(3, 1, 0, 128); });
  tile(TILE.aTorn, () => { fabric(215, 14); skin(0, 40, 70, 88); wound(40, 84, 12, 8); grime(35, 0.24); blood(5, 1.2, 0, 128); });
  const hand = (glove) => {
    if (glove) { rect(0, 82, T, 46, '#141416', RAW); return; }
    rect(0, 82, T, 46, '#d0d0d0', SKIN); skin(0, 82, T, 46);
    for (let k = 0; k < 4; k++) rect(0, 104 + k * 6, T, 1.5, 'rgba(0,0,0,0.2)');   // 指
    for (let i = 0; i < 6; i++) ell(R(0, T), R(110, 128), R(2, 5), R(2, 4), '#3a0404', RAW);   // 指先の血
  };
  tile(TILE.fBare, () => { skin(); hand(false); wound(R(20, 100), R(20, 70), 6, 4); grime(20, 0.2); blood(3, 1, 0, 128); });
  tile(TILE.fSleeve, () => { fabric(222, 12); rect(0, 66, T, 14, '#d4d4d4', CLOTH); line(0, 66, T, 66, 2, 'rgba(0,0,0,0.25)'); hand(false); grime(25); blood(3, 1, 0, 128); });
  tile(TILE.fBloody, () => { skin(); hand(false); blood(9, 1.4, 20, 128); for (let i = 0; i < 6; i++) wound(R(0, T), R(10, 80), R(3, 7), R(2, 5)); });
  tile(TILE.fGlove, () => { fabric(60, 10, RAW); rect(0, 0, T, 60, '#1a1b1f', RAW); ell(64, 20, 30, 16, '#2a2c32', RAW); hand(true); blood(2, 0.8, 0, 128); });

  // ===== そのほか =====
  tile(TILE.helmet, () => {
    rect(0, 0, T, T, '#16171b', RAW);
    for (let i = 0; i < 80; i++) line(R(0, T), R(0, T), R(0, T), R(0, T), 1, 'rgba(255,255,255,0.06)');
    rect(30, 52, 68, 76, '#2a3640', RAW);                         // バイザー
    rect(30, 52, 68, 6, '#0a0a0c', RAW); line(40, 62, 70, 92, 5, 'rgba(255,255,255,0.25)');
    text('POLICE', 0, 34, 12, '#e8e8e8');
    blood(2, 0.8, 0, 50);
  });
  tile(TILE.flesh, () => {
    rect(0, 0, T, T, '#6a0808', RAW);
    for (let i = 0; i < 60; i++) ell(R(0, T), R(0, T), R(3, 10), R(2, 7), `rgb(${R(90, 170) | 0},${R(10, 40) | 0},${R(10, 30) | 0})`, RAW, R(0, 3));
    for (let i = 0; i < 20; i++) ell(R(0, T), R(0, T), R(1, 3), R(1, 3), '#e0b0a0', RAW);
  });
  tile(TILE.boneCut, () => {
    rect(0, 0, T, T, '#7a0a08', RAW);
    for (let i = 0; i < 50; i++) ell(R(0, T), R(0, T), R(3, 9), R(2, 6), `rgb(${R(100, 180) | 0},${R(10, 40) | 0},${R(10, 30) | 0})`, RAW, R(0, 3));
    rect(0, 0, T, 28, '#e8dcc0', RAW); rect(0, 22, T, 6, '#b89a80', RAW);   // まん中(てっぺん)に骨
  });

  // ===== 第2弾 =====
  // あご(横 = 右ほほ → あご先 → 左ほほ / 上が 下の歯)
  tile(TILE.jaw, () => {
    skin();
    rect(0, 0, T, 30, '#120202', RAW);                            // 口の中(あごの上のふち)
    rect(0, 12, T, 6, '#5a1414', RAW);                            // 歯ぐき
    for (let x = 20; x < 108; x += 7) if (R(0, 1) < 0.85) rect(x, 2, 5, R(8, 12), R(0, 1) < 0.5 ? '#d8c8a0' : '#b8a878', RAW);   // 下の歯
    ell(64, 30, 26, 5, '#3a0808', RAW);                           // 下くちびる
    for (let k = 0; k < 5; k++) { const x = R(40, 88); line(x, 34, x + R(-2, 2), R(60, 110), R(2, 4), '#5a0404', RAW); }   // よだれと血
    ell(64, 96, 22, 16, 'rgba(0,0,0,0.18)');                      // あごの下のかげ
    for (let i = 0; i < 40; i++) rect(R(10, 118), R(40, 100), 1, 1, 'rgba(0,0,0,0.3)');   // ぶしょうひげ
    wound(R(30, 100), R(50, 90), 6, 4);
  });
  // ガスマスクの頭(ゴムのフードと ベルト)
  tile(TILE.hGas, () => {
    rect(0, 0, T, T, '#2a2c24', RAW);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(255,255,255,${R(0.02, 0.06)})`; c.fillRect(R(0, T), R(0, T), 2, 2); }
    for (const y of [30, 66]) rect(0, y, T, 6, '#181a14', RAW);  // ベルト
    for (const s of [-1, 1]) { ell(64 + s * 11, 58, 9, 8, '#0a0a08', RAW); }   // ゴーグルの穴
    rect(46, 70, 36, 26, '#1e2018', RAW);
    rect(0, 96, T, 32, '#3a3a2e', RAW);                           // 首の布
    blood(4, 1, 40, 128);
  });
  // 迷彩(兵士)の胴・もも・すね
  const camo = (boots) => {
    rect(0, 0, T, T, '#c8c8c8', CLOTH);
    for (let i = 0; i < 40; i++) ell(R(0, T), R(0, T), R(6, 18), R(4, 10), ['#8a8a8a', '#6a6a6a', '#b8b8b8', '#4a4a4a'][i % 4], CLOTH, R(0, 3));
    grime(30, 0.18);
    if (boots) { rect(0, 84, T, 44, '#1e1a14', RAW); rect(0, 84, T, 5, '#0e0c08', RAW); for (let y = 92; y < 124; y += 7) line(48, y, 80, y + 3, 1.5, '#3a3428', RAW); }
  };
  tile(TILE.camo, () => {
    camo(false);
    for (const x of [30, 70]) { rect(x, 30, 28, 24, '#3a3e2c', RAW); rect(x, 30, 28, 4, '#2a2e20', RAW); }   // 胸のポーチ
    rect(0, 110, T, 18, '#26281e', RAW);                          // ベルト
    for (let x = 6; x < T; x += 22) rect(x, 106, 12, 18, '#3a3e2c', RAW);
    line(36, 0, 84, 70, 6, '#26281e', RAW);                       // たすき
    blood(5, 1, 20, 110); wound(R(30, 100), R(60, 100), 8, 6);
  });
  tile(TILE.camoU, () => { camo(false); rect(0, 0, T, 10, '#1a1a14', RAW); rect(84, 40, 26, 30, '#3a3e2c', RAW); blood(3, 1, 10, 120); });
  tile(TILE.camoL, () => { camo(true); blood(3, 1, 0, 80); });
  // 顔が裂けた頭(ほほが ちぎれて 歯ぐきと骨が見える)
  tile(TILE.hTorn, () => {
    face('#f0e0a0', 2);
    hair(30, 30);
    ell(84, 76, 15, 13, '#4a0606', RAW); ell(84, 76, 11, 9, '#8a1a12', RAW);
    for (let i = 0; i < 4; i++) rect(76 + i * 4, 70, 3, 7, '#d8ccb0', RAW);     // むき出しの歯
    ell(90, 62, 6, 4, '#d8d0b8', RAW);                                           // ほお骨
    for (let k = 0; k < 6; k++) line(R(70, 98), 86, R(70, 98), R(96, 124), 2.5, '#5a0404', RAW);
    blood(3, 1, 30, 128);
  });
  // 小鬼(はげ頭・大きな光る目のくぼみ・とがった耳)
  tile(TILE.hImp, () => {
    face('#ff5030', 2);
    for (const s of [-1, 1]) ell(64 + s * 11, 58, 10, 8, '#060202', RAW);
    for (const s of [-1, 1]) { poly([64 + s * 28, 52, 64 + s * 40, 36, 64 + s * 32, 66], '#d0d0d0', SKIN); }
    for (let i = 0; i < 8; i++) line(R(0, T), R(0, 40), R(0, T), R(0, 40), 1.5, 'rgba(60,20,60,0.4)', SKIN);   // 血管
    blood(3, 1, 60, 128);
  });
  // 焦げた体
  tile(TILE.burnt, () => {
    skin();
    for (let i = 0; i < 60; i++) ell(R(0, T), R(0, T), R(4, 14), R(3, 10), `rgba(${R(10, 30) | 0},${R(5, 15) | 0},0,0.75)`, RAW, R(0, 3));   // 炭
    for (let i = 0; i < 26; i++) ell(R(0, T), R(0, T), R(2, 5), R(1, 3), R(0, 1) < 0.5 ? '#ff6a10' : '#ffb040', RAW);   // おき火
    for (let i = 0; i < 6; i++) { const x = R(10, 118), y = R(10, 118); rect(x - 12, y - 6, 24, 12, '#5a5048', CLOTH); }   // 焼け残った服
    rect(0, 118, T, 10, '#1a1210', RAW);
  });
  tile(TILE.hBurnt, () => {
    face('#ffa040', 2);
    for (let i = 0; i < 50; i++) ell(R(0, T), R(0, T), R(3, 12), R(2, 9), `rgba(${R(10, 30) | 0},${R(5, 15) | 0},0,0.7)`, RAW, R(0, 3));
    for (let i = 0; i < 14; i++) ell(R(0, T), R(0, 50), R(2, 4), R(1, 3), '#ff7a20', RAW);
    for (const s of [-1, 1]) ell(64 + s * 11, 58, 6, 5, '#060202', RAW);
  });
  // 機動隊の盾(くもった透明の板。POLICE の文字・きず・血)
  tile(TILE.shieldT, () => {
    rect(0, 0, T, T, '#3a4450', RAW);
    for (let i = 0; i < 30; i++) line(R(0, T), R(0, T), R(0, T), R(0, T), 1, 'rgba(255,255,255,0.12)');
    rect(0, 0, T, 6, '#16181c', RAW); rect(0, T - 6, T, 6, '#16181c', RAW); rect(0, 0, 6, T, '#16181c', RAW); rect(T - 6, 0, 6, T, '#16181c', RAW);
    rect(20, 40, 88, 22, '#e8e8e8', RAW);
    c.fillStyle = '#1a2a50'; c.font = 'bold 19px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('POLICE', 64, 52);
    line(30, 90, 60, 70, 3, 'rgba(255,255,255,0.3)');
    blood(4, 1.1, 60, 128);
  });
  // ガスマスクの部品(黒いゴム・オリーブの缶・ガラス)
  tile(TILE.maskT, () => {
    rect(0, 0, T, T, '#1c1e18', RAW);
    for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(255,255,255,${R(0.02, 0.07)})`; c.fillRect(R(0, T), R(0, T), 2, 2); }
    rect(0, 64, T, 64, '#4a5236', RAW);                           // 缶(下半分)
    for (let y = 72; y < T; y += 10) rect(0, y, T, 2, '#2a3020', RAW);
    rect(0, 0, T, 20, '#6a7a80', RAW);                            // ガラス(上のはし)
    blood(2, 0.8, 0, 128);
  });
  // 金色ゾンビの服(金ぴかのスーツ・くさり)
  tile(TILE.goldT, () => {
    fabric(240, 10);
    for (let i = 0; i < 80; i++) ell(R(0, T), R(0, T), R(1, 3), R(1, 3), '#ffffff', CLOTH);
    poly([46, 0, 64, 52, 82, 0], '#f0f0f0', RAW);
    c.strokeStyle = '#fff4a0'; c.lineWidth = 3; c.beginPath(); c.arc(64, 10, 26, 0.3, Math.PI - 0.3); c.stroke();   // 金のくさり
    m.strokeStyle = RAW; m.lineWidth = 3; m.beginPath(); m.arc(64, 10, 26, 0.3, Math.PI - 0.3); m.stroke();
    ell(64, 38, 6, 6, '#fff080', RAW);
    blood(2, 0.7, 40, 110);
  });

  // 色(canvas)とぬり方(mask)を 1 つの絵にまとめる(上下を入れかえ: v=0 が下)
  const cd = c.getImageData(0, 0, SIZE, SIZE).data, md = m.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const src = y * SIZE * 4, dst = (SIZE - 1 - y) * SIZE * 4;
    for (let x = 0; x < SIZE * 4; x += 4) {
      out[dst + x] = cd[src + x]; out[dst + x + 1] = cd[src + x + 1]; out[dst + x + 2] = cd[src + x + 2];
      out[dst + x + 3] = md[src + x];
    }
  }
  const tex = new THREE.DataTexture(out, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// ---------- 形 ----------
// 回転体(profile = [半径, 高さ] を下から上へ)。v は高さで決める(下 0 → 上 1)。deform で形をゆがめる
export function lathe(profile, segs, deform) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  const g = new THREE.LatheGeometry(pts, segs);
  const pos = g.attributes.position, uv = g.attributes.uv;
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of profile) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setY(i, (v.y - y0) / (y1 - y0));
    if (deform) deform(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 部位の形をまとめて作る(quality が low なら少し粗く)
export function buildGeometries(quality = 'high') {
  const S = quality === 'low' ? 8 : quality === 'mid' ? 10 : 12;
  const G = {};
  // 腰(根元 = 骨盤の中心)
  G.pelvis = lathe([[0, -0.15], [0.1, -0.14], [0.155, -0.09], [0.165, 0], [0.155, 0.07], [0.14, 0.1], [0, 0.11]], S, (p) => {
    p.x *= 1.15; p.z *= 0.8; if (p.z > 0 && p.y < 0) p.z *= 1.15;
  });
  // 胴(根元 = こし。上が首)
  G.torso = lathe([[0, -0.02], [0.14, 0], [0.145, 0.08], [0.15, 0.18], [0.165, 0.3], [0.175, 0.4], [0.17, 0.47], [0.13, 0.52], [0.07, 0.555], [0.055, 0.59], [0, 0.6]], S + 2, (p) => {
    const y = p.y;
    p.x *= 1 + 0.5 * sstep(0.12, 0.44, y);
    p.z *= 0.72;
    if (p.z < 0 && y > 0.25 && y < 0.48) p.z *= 1.08;        // 胸
    if (p.z > 0 && y > 0.3) p.z += 0.03 * sstep(0.3, 0.5, y);   // 背中の丸み
    if (y > 0.4) p.y -= 0.12 * Math.min(1, (p.x / 0.26) ** 2) * sstep(0.4, 0.52, y);   // なで肩
  });
  // 頭(根元 = 首のつけね)。下あごは別の部品(口が開く)なので、口から下は少し引っこめる
  const H = S + (quality === 'low' ? 2 : 6);
  const skull = lathe([[0, -0.04], [0.05, -0.03], [0.052, 0.03], [0.058, 0.065], [0.078, 0.095], [0.088, 0.14], [0.095, 0.19], [0.093, 0.23], [0.08, 0.27], [0.05, 0.295], [0, 0.305]], H, (p) => {
    const y = p.y, ax = Math.abs(p.x);
    if (y > 0.07) p.z -= 0.022 * sstep(0.06, 0.1, y);         // 顔は首より前
    if (y > 0.12 && p.z > 0) p.z *= 1.18;                     // 後頭部
    p.x *= 0.9;
    if (p.z < 0) {
      if (y > 0.06 && y < 0.108) p.z *= 1 - 0.28 * sstep(0.11, 0.085, y) * (1 - sstep(0.05, 0.075, ax));   // 口から下(あごの部品がかぶる)
      if (ax < 0.025 && y > 0.11 && y < 0.165) p.z -= 0.02 * (1 - ax / 0.025) * Math.sin((y - 0.11) / 0.055 * Math.PI);   // 鼻
      if (Math.abs(ax - 0.034) < 0.02 && Math.abs(y - 0.15) < 0.018) p.z += 0.012 * (1 - Math.abs(ax - 0.034) / 0.02) * (1 - Math.abs(y - 0.15) / 0.018);   // 目のくぼみ
      if (ax < 0.06 && y > 0.163 && y < 0.185) p.z -= 0.008 * Math.sin((y - 0.163) / 0.022 * Math.PI);   // まゆの骨
      if (Math.abs(ax - 0.05) < 0.018 && Math.abs(y - 0.128) < 0.015) p.z -= 0.005;   // ほお骨
      if (Math.abs(ax - 0.055) < 0.02 && Math.abs(y - 0.108) < 0.012) p.z += 0.006;   // こけたほほ
    }
  });
  // 耳(頭の横。絵の 肌のところを使う)
  const ear = (sg) => {
    const g = new THREE.SphereGeometry(1, 6, 5);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) * 0.012 + sg * 0.081, pos.getY(i) * 0.026 + 0.148, pos.getZ(i) * 0.017 + 0.004);
      uv.setXY(i, sg > 0 ? 0.73 : 0.27, 0.54 + pos.getY(i) * 0.1);
    }
    g.computeVertexNormals();
    return g;
  };
  G.head = quality === 'low' ? skull : mergeGeometries([skull, ear(1), ear(-1)]);
  // 下あご(根元 = 耳の前のちょうつがい。上のふちが 下の歯)
  {
    const prof = [[0, -0.068], [0.03, -0.07], [0.048, -0.06], [0.056, -0.04], [0.058, -0.022], [0.055, -0.012], [0.05, -0.006], [0.046, 0.002]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), quality === 'low' ? 6 : 10, Math.PI * 0.5, Math.PI);
    const pos = g.attributes.position, uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setY(i, (v.y + 0.07) / 0.072);
      v.x *= 0.92; v.z *= 1.55;
      if (v.z < -0.06 && v.y < -0.05) v.y -= 0.006;              // あご先
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    G.jaw = g;
  }
  // 光る目玉(2 つで 1 つの形。頭と同じ位置に置く)
  {
    // 前の極に 黒目(頂点の色)。にごった目玉が ぼんやり光る
    const a = new THREE.SphereGeometry(0.0105, 8, 6); a.rotateX(-Math.PI / 2);
    const pos = a.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i) / 0.0105; const k = z < -0.8 ? 0.12 : z < -0.55 ? 0.55 : 1; col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
    a.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const b = a.clone();
    a.translate(-0.034, 0.151, -0.093); b.translate(0.034, 0.151, -0.093);
    G.eyes = mergeGeometries([a, b]);
  }
  // 盾(胴に持つ。少し曲がった板)
  {
    const g = new THREE.BoxGeometry(0.62, 1.0, 0.035, 6, 1, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, pos.getZ(i) + 0.12 * (x / 0.31) ** 2); }
    g.computeVertexNormals();
    g.translate(0.02, 0.16, -0.36);
    G.shield = g;
  }
  // ガスマスク(頭と同じ位置。口の前の筒と缶・ゴーグルのふち)
  {
    const parts = [];
    const snout = new THREE.CylinderGeometry(0.03, 0.045, 0.06, 8); snout.rotateX(Math.PI / 2); snout.translate(0, 0.098, -0.105);
    const can = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10); can.rotateX(Math.PI / 2 - 0.5); can.translate(0, 0.07, -0.15);
    for (const g of [snout, can]) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.1 + uv.getY(i) * 0.38); }
    parts.push(snout, can);
    for (const sg of [-1, 1]) {
      const r = new THREE.TorusGeometry(0.017, 0.005, 5, 10); r.translate(sg * 0.034, 0.151, -0.104);
      const uv = r.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 0.6 + uv.getY(i) * 0.3);
      parts.push(r);
    }
    G.mask = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  }
  // 上腕(根元 = 肩)
  G.uarm = lathe([[0, 0.06], [0.05, 0.045], [0.066, 0], [0.06, -0.1], [0.052, -0.2], [0.045, -0.28], [0, -0.31]], S - 2, (p) => { p.z *= 0.9; });
  // 前腕 + 手(根元 = ひじ)。中・高画質では 指(つめを立てて つかみかかる形)
  const fore = lathe([[0, 0.02], [0.045, 0], [0.048, -0.06], [0.04, -0.18], [0.031, -0.26], [0.036, -0.29], [0.04, -0.33], [0.034, -0.37], [0.02, -0.385], [0, -0.39]], S - 2, (p) => {
    if (p.y < -0.265) { const k = sstep(-0.265, -0.3, p.y); p.x *= 1 - 0.45 * k; p.z *= 1 + 0.25 * k; }
  });
  if (quality === 'low') G.larm = fore;
  else {
    const fingers = [fore];
    const fz = [-0.034, -0.012, 0.01, 0.031];
    for (let i = 0; i < 4; i++) {
      const L = i === 0 || i === 3 ? 0.06 : 0.07;
      const f1 = new THREE.CylinderGeometry(0.0085, 0.0075, L, 5, 1); f1.translate(0, -L / 2, 0);
      const f2 = new THREE.CylinderGeometry(0.0072, 0.003, L * 0.8, 5, 1); f2.translate(0, -L * 0.4, 0); f2.rotateX(0.9); f2.translate(0, -L, 0);
      const f = mergeGeometries([f1, f2]); f.rotateX(0.35 + i * 0.04); f.rotateZ((i - 1.5) * 0.06); f.translate(0, -0.365, fz[i]);
      fingers.push(f);
    }
    const th = new THREE.CylinderGeometry(0.009, 0.004, 0.06, 5, 1); th.translate(0, -0.03, 0); th.rotateX(0.6); th.rotateZ(-0.7); th.translate(-0.012, -0.33, -0.03);
    fingers.push(th);
    for (let k = 1; k < fingers.length; k++) {
      const uv = fingers[k].attributes.uv, pos = fingers[k].attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, Math.max(0.01, Math.min(0.3, 0.35 + (pos.getY(i) + 0.33) * 2.5)));
    }
    G.larm = mergeGeometries(fingers.map((g) => g.index ? g : g));
  }
  // もも(根元 = 股関節)
  G.uleg = lathe([[0, 0.05], [0.07, 0.04], [0.09, 0], [0.086, -0.12], [0.072, -0.28], [0.058, -0.42], [0.05, -0.455], [0, -0.47]], S - 2, (p) => { if (p.z < 0 && p.y > -0.3) p.z *= 1.08; });
  // すね + 足(根元 = ひざ)
  const shin = lathe([[0, 0.03], [0.055, 0.01], [0.062, -0.08], [0.058, -0.16], [0.045, -0.3], [0.038, -0.4], [0.04, -0.43], [0, -0.445]], S - 2, (p) => {
    if (p.z > 0 && p.y < -0.04 && p.y > -0.22) p.z *= 1.15;
  });
  const foot = new THREE.SphereGeometry(1, S - 2, 6);
  {
    const pos = foot.attributes.position, uv = foot.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) * 0.052, y = pos.getY(i) * 0.045, z = pos.getZ(i) * 0.13;
      y = Math.max(y, -0.032);
      pos.setXYZ(i, x, y - 0.445, z - 0.055);
      uv.setXY(i, uv.getX(i), 0.02 + Math.max(0, pos.getY(i) + 0.48) * 0.25);
    }
    foot.computeVertexNormals();
  }
  G.lleg = mergeGeometries([shin, foot]);
  // ヘルメット(頭にかぶせる。前の下側がバイザー)
  G.helmet = lathe([[0.11, 0.04], [0.125, 0.08], [0.13, 0.17], [0.12, 0.24], [0.09, 0.3], [0.05, 0.33], [0, 0.34]], S + 2, (p) => {
    p.x *= 0.95; if (p.y > 0.07) p.z -= 0.018; if (p.z > 0) p.z *= 1.12;
  });
  // 切り口(赤い肉のふた。上が +y。半径 1)
  G.cap = lathe([[0, -0.25], [0.85, -0.12], [1, 0], [0.75, 0.22], [0.35, 0.32], [0, 0.34]], 8);
  return G;
}

// ---------- 材質(1 体ずつの 色・模様・光り方) ----------
// 1 体(1 部位)ごとの値:
//   iCloth (vec3) 服の色 / iSkin (vec4) 肌の色 + マスの番号 / iFx (vec4) x 白く光る(当たった) y 凍る z 焦げる w 燃える(+)/しびれ(-)
export function makeZombieMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 iCloth; attribute vec4 iSkin; attribute vec4 iFx;
varying vec3 vCloth; varying vec3 vSkin; varying vec4 vFx;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
{ float tl = iSkin.w; vec2 tc = vec2(mod(tl, ${N}.0), floor(tl / ${N}.0 + 0.001));
  vMapUv = (clamp(uv, 0.0, 1.0) * ${(1 - 6 / T).toFixed(5)} + ${(3 / T).toFixed(5)} + tc) / ${N}.0; }
vCloth = iCloth; vSkin = iSkin.rgb; vFx = iFx;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCloth; varying vec3 vSkin; varying vec4 vFx;`)
      .replace('#include <map_fragment>', `
vec4 texelColor = texture2D( map, vMapUv );
vec3 tint = mix( vSkin, vec3(1.0), smoothstep(0.2, 0.42, texelColor.a) );
tint = mix( tint, vCloth, smoothstep(0.58, 0.8, texelColor.a) );
diffuseColor.rgb *= texelColor.rgb * tint;
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3(0.09, 0.07, 0.06), vFx.z );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3(0.45, 0.7, 0.95), vFx.y * 0.75 );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.9, 0.8) * vFx.x * 0.45;
totalEmissiveRadiance += vec3(0.12, 0.3, 0.55) * vFx.y * 0.18;
{ // 燃える: 暗いところ(焦げ・傷)が おき火のように光る / しびれ: 青白く光る
  float lum = dot(texelColor.rgb, vec3(0.3, 0.59, 0.11));
  vec2 cell = floor(vMapUv * 420.0);
  float nz = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float ember = smoothstep(0.4, 0.08, lum) * 0.8 + step(0.86, nz) * 0.7;
  totalEmissiveRadiance += vFx.w > 0.0 ? vec3(1.0, 0.3, 0.03) * vFx.w * (0.15 + ember * 1.6) : vec3(0.35, 0.6, 1.0) * (-vFx.w);
}`);
  };
  mat.customProgramCacheKey = () => 'zombie-v1';
  return mat;
}

// InstancedMesh に 1 体ごとの値の入れ物をつける
export function makePartMesh(geo, mat, cap) {
  const g = geo.clone();
  const mesh = new THREE.InstancedMesh(g, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const a = (name, n) => {
    const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
    at.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, at);
    return at;
  };
  mesh.userData.cloth = a('iCloth', 3);
  mesh.userData.skin = a('iSkin', 4);
  mesh.userData.fx = a('iFx', 4);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

// ---------- 服装(見た目のくみあわせ) ----------
// torso: 胴のマス, legs: [もも, すね], arms: [上腕, 前腕], heads: 頭のマスの候補,
// cloth: 服の色の候補, pants: ズボンの色の候補, sleeve: 'cloth'(服と同じ色)か色
const C = (hex) => hex;
export const OUTFITS = {
  office: { torso: TILE.office, legs: [TILE.slacksU, TILE.slacksL], arms: [[TILE.aSleeve, TILE.fSleeve], [TILE.aSleeve, TILE.fBare]], heads: [TILE.hShort, TILE.hBald, TILE.hLong, TILE.hSkull],
    cloth: [0xe8eef5, 0xbcd0e8, 0xe8d0d0, 0xf0ead8], pants: [0x2a2c33, 0x4a4238, 0x3a3f4a, 0x23262c], sleeve: 'cloth' },
  tee: { torso: TILE.tee, legs: [[TILE.jeansU, TILE.jeansL], [TILE.shortsU, TILE.shortsL]], arms: [[TILE.aShort, TILE.fBare], [TILE.aShort, TILE.fBloody]], heads: [TILE.hShort, TILE.hLong, TILE.hSkull, TILE.hBald],
    cloth: [0x8a2a2a, 0x2a4a7a, 0x3a3a3a, 0xd8d0b0, 0x4a6a3a, 0x9a7a2a, 0xe0e0e0, 0x6a3a6a], pants: [0x3a5a8a, 0x2a3550, 0x26282c, 0x5a7090, 0x6a6050], sleeve: 'cloth' },
  hoodie: { torso: TILE.hoodie, legs: [TILE.jeansU, TILE.jeansL], arms: [[TILE.aSleeve, TILE.fSleeve]], heads: [TILE.hHood, TILE.hHood, TILE.hShort, TILE.hLong],
    cloth: [0x60656c, 0x2a2a30, 0x6a2030, 0x2a4060, 0x4a5a3a, 0x8a8a90], pants: [0x3a5a8a, 0x26282c, 0x4a4a50], sleeve: 'cloth', hoodTint: true },
  scrubs: { torso: TILE.scrubs, legs: [TILE.scrubU, TILE.scrubL], arms: [[TILE.aShort, TILE.fBare], [TILE.aShort, TILE.fBloody]], heads: [TILE.hSurg, TILE.hSurg, TILE.hShort, TILE.hLong],
    cloth: [0x3a8a8a, 0x4a70a8, 0x5a8a5a, 0x8a6a9a, 0x2a5a7a], pants: 'cloth', sleeve: 'cloth', capTint: true },
  police: { torso: TILE.police, legs: [TILE.policeU, TILE.policeL], arms: [[TILE.aShort, TILE.fBare], [TILE.aSleeve, TILE.fSleeve]], heads: [TILE.hCap, TILE.hShort, TILE.hBald],
    cloth: [0xffffff], pants: [0xffffff], sleeve: 0x1d2a45 },
  hivis: { torso: [TILE.hivisY, TILE.hivisO], legs: [[TILE.jeansU, TILE.bootsL], [TILE.tornU, TILE.bootsL]], arms: [[TILE.aShort, TILE.fBare], [TILE.aSleeve, TILE.fSleeve], [TILE.aBare, TILE.fBloody]], heads: [TILE.hShort, TILE.hBald, TILE.hSkull],
    cloth: [0x3a3a3a, 0x5a4a3a, 0x2a3a5a, 0x6a6a6a], pants: [0x4a4a3a, 0x3a5a8a, 0x5a5040], sleeve: 'cloth' },
  suit: { torso: TILE.suit, legs: [TILE.slacksU, TILE.slacksL], arms: [[TILE.aSleeve, TILE.fSleeve]], heads: [TILE.hShort, TILE.hBald, TILE.hSkull],
    cloth: [0x30333a, 0x262c3d, 0x46464c, 0x463a32], pants: 'cloth', sleeve: 'cloth' },
  tank: { torso: TILE.tank, legs: [[TILE.jeansU, TILE.jeansL], [TILE.tornU, TILE.tornL], [TILE.shortsU, TILE.shortsL]], arms: [[TILE.aBare, TILE.fBare], [TILE.aBare, TILE.fBloody]], heads: [TILE.hShort, TILE.hBald, TILE.hSkull, TILE.hLong],
    cloth: [0xe0e0e0, 0x2a2a2a, 0x6a7a5a, 0x8a4a3a], pants: [0x3a5a8a, 0x26282c, 0x5a7090, 0x4a4a3a], sleeve: 'cloth' },
  torn: { torso: TILE.torn, legs: [[TILE.tornU, TILE.tornL]], arms: [[TILE.aTorn, TILE.fBloody], [TILE.aBare, TILE.fBloody]], heads: [TILE.hSkull, TILE.hBald, TILE.hShort, TILE.hLong],
    cloth: [0x8a2a2a, 0x2a4a7a, 0x4a4a4a, 0xb8b090, 0x4a6a3a], pants: [0x3a5a8a, 0x26282c, 0x4a4a3a], sleeve: 'cloth' },
  doctor: { torso: TILE.doctor, legs: [TILE.slacksU, TILE.slacksL], arms: [[TILE.aSleeve, TILE.fSleeve]], heads: [TILE.hShort, TILE.hBald, TILE.hLong],
    cloth: [0xffffff], pants: [0x2a2c33, 0x3a3f4a], sleeve: 0xe6e8e8 },
  flannel: { torso: TILE.flannel, legs: [[TILE.jeansU, TILE.jeansL], [TILE.jeansU, TILE.bootsL]], arms: [[TILE.aSleeve, TILE.fSleeve], [TILE.aSleeve, TILE.fBare]], heads: [TILE.hShort, TILE.hBald, TILE.hLong],
    cloth: [0x9a2a20, 0x2a4a7a, 0x3a5a3a, 0x6a5a2a], pants: [0x3a5a8a, 0x2a3550, 0x4a4a3a], sleeve: 'cloth', sleeveDark: true },
  sweater: { torso: TILE.sweater, legs: [[TILE.jeansU, TILE.jeansL], [TILE.slacksU, TILE.slacksL]], arms: [[TILE.aSleeve, TILE.fSleeve]], heads: [TILE.hLong, TILE.hShort, TILE.hBald],
    cloth: [0x7a6a5a, 0x5a6a7a, 0x8a3a3a, 0xb0a888, 0x3a4a3a], pants: [0x3a5a8a, 0x3a3f4a, 0x5a5048], sleeve: 'cloth' },
  shirtless: { torso: TILE.bare, legs: [[TILE.jeansU, TILE.jeansL], [TILE.tornU, TILE.tornL]], arms: [[TILE.aBare, TILE.fBloody]], heads: [TILE.hSkull, TILE.hBald, TILE.hShort],
    cloth: [0xffffff], pants: [0x3a5a8a, 0x26282c, 0x4a4a3a], sleeve: 'cloth' },
  riot: { torso: TILE.riot, legs: [TILE.riotU, TILE.riotL], arms: [[TILE.aSleeve, TILE.fGlove]], heads: [TILE.hShort, TILE.hBald],
    cloth: [0xffffff], pants: [0xffffff], sleeve: 0x1c1d22 },
  bloater: { torso: TILE.bloater, legs: [[TILE.tornU, TILE.tornL]], arms: [[TILE.aBare, TILE.fBloody]], heads: [TILE.hBloat],
    cloth: [0xffffff], pants: [0x4a4a4a, 0x3a5a8a, 0x5a5040], sleeve: 'cloth', skins: [0x8a9a5e, 0x9aa070, 0x7a8a50] },
  // 第2弾
  imp: { torso: TILE.bare, legs: [[TILE.tornU, TILE.tornL]], arms: [[TILE.aBare, TILE.fBloody]], heads: [TILE.hImp],
    cloth: [0xffffff], pants: [0x2a2a26, 0x3a3428], sleeve: 'cloth', skins: [0x7a8a76, 0x6e7a70, 0x8a8a7a, 0x6a7468] },
  burnt: { torso: TILE.burnt, legs: [[TILE.tornU, TILE.tornL]], arms: [[TILE.aBare, TILE.fBloody]], heads: [TILE.hBurnt],
    cloth: [0x4a4038, 0x3a3a3a, 0x5a4a3a], pants: [0x2a2420, 0x3a3028], sleeve: 'cloth', skins: [0x5a4438, 0x4a3a30, 0x64503e] },
  soldier: { torso: TILE.camo, legs: [TILE.camoU, TILE.camoL], arms: [[TILE.aSleeve, TILE.fGlove]], heads: [TILE.hGas],
    cloth: [0x6a7a50, 0x7a7a58, 0x5a6a4a, 0x8a8060], pants: 'cloth', sleeve: 'cloth' },
  gold: { torso: TILE.goldT, legs: [TILE.slacksU, TILE.slacksL], arms: [[TILE.aSleeve, TILE.fBare]], heads: [TILE.hShort, TILE.hBald],
    cloth: [0xffb000, 0xffc020], pants: [0xc08000], sleeve: 'cloth', skins: [0xf0b020, 0xffc830] },
};
// 裂けた顔は いろいろな服に まぜる
for (const k of ['office', 'tee', 'hoodie', 'tank', 'torn', 'flannel', 'shirtless', 'hivis']) OUTFITS[k].heads.push(TILE.hTorn);

// 腐った肌の色(灰色・病的な緑・あざの紫・黄ばみ・黒ずみ)
export const SKINS = [0x8f9680, 0x80905e, 0x8f7a8c, 0xa89e78, 0x6e625a, 0x8a949e, 0x9e8e7c, 0x5e544a, 0x7a8a6a, 0x94888e];
export const HAIR = [0x1a1512, 0x3a2a1c, 0x6b4a2a, 0x8a8070, 0xb0a080, 0x2a2a2a, 0x6a2a14, 0xa8a8a8];
