// マップ係(第5弾・西部の町): 町の北の出口(x = 40 の道)を出てすぐの「ウエスタン通り(RUSTY SPUR)」。
//  - 場所: x = -6 〜 206、z = -294 〜 -196(world-district.js の WEST)。中央広場から 北へ 約 200m
//  - 大通り(南北・x = 40)と 駅前通り(東西・z = -252)。木の門 → 保安官事務所・銀行・雑貨屋 … → 酒場・宿屋・教会・馬小屋 → 駅と蒸気機関車
//  - 中に入れる: 酒場(サルーン)・保安官事務所(牢)・教会。まわりは 赤い岩山(メサ)・サボテン・転がる草
//  - West: 砂ぼこり・転がる草(タンブルウィード)・風車の羽(毎フレーム。町の近くにいるときだけ)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { seeded } from './util.js';
import { Engine } from './engine.js';
import { WEST, inWest, District } from './world-district.js';
import { WT, WS, wSignUV } from './world-westex.js';
import { wbuild, WBld, boardwalk, wfloor, wpatch, wwall, wbox, wsign, wgable, falseFront, porch, mesa, train, WOODC, DARKW } from './world-westkit.js';
import { beam, quad4, PAD_H } from './world-dkit.js';
import { pool } from './world-town.js';
import { placeTree, placeFence } from './world-props.js';
import { makeGeo } from './world-build.js';

const Y = PAD_H, MX = 40, CZ = -252;
const _m = new THREE.Matrix4();
const LAN = [2.8, 1.7, 0.6];

// 東西の道(わだちが 東西に のびるように マスを 90°回して敷く)
function floorX(ctx, x0, z0, x1, z1, y, tile, size) {
  const bk = ctx.B.bucket(ctx.M.west, (x0 + x1) / 2, (z0 + z1) / 2);
  wpatch(bk, [x0, y, z0], [x0, y, z1], [x1, y, z0], [x1, y, z1], Math.max(1, Math.round((z1 - z0) / size)), Math.max(1, Math.round((x1 - x0) / size)), tile, [1, 1, 1]);
}
// 道しるべ(町の中に立てる。南向き = 見下ろしで読める)
function guide(ctx, x, z, s = 1) {
  const { M } = ctx;
  ctx.B.box(M.plain, x - 0.09, Y, z - 0.09, x + 0.09, Y + 3.3 * s, z + 0.09, { col: WOODC });
  ctx.B.box(M.plain, x - 1.5 * s, Y + 2.2 * s, z + 0.09, x + 1.5 * s, Y + 3.0 * s, z + 0.15, { col: DARKW, skip: '' });
  wsign(ctx, x, Y + 2.24 * s, z + 0.15, 0, 1, 2.9 * s, 0.725 * s, WS['↑ ウエスタン通り'], [1.15, 1.15, 1.15], 0.02);
  ctx.B.box(M.glow, x - 0.1, Y + 3.3 * s, z - 0.1, x + 0.1, Y + 3.55 * s, z + 0.1, { col: LAN });
  pool(ctx, x, z + 1, 3, [0.3, 0.18, 0.06], Y + 0.03);
  ctx.solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15, 3);
}
// 地面に置いた 道しるべの板(見下ろしで読める。字の上が 北)
function groundSign(ctx, cx, cz, w, y) {
  const h = w / 4, uv = wSignUV(WS['↑ ウエスタン通り']);
  quad4(ctx.B.bucket(ctx.M.west, cx, cz), [cx - w / 2, y, cz + h / 2], [cx + w / 2, y, cz + h / 2], [cx + w / 2, y, cz - h / 2], [cx - w / 2, y, cz - h / 2], uv, [0.8, 0.8, 0.8]);
}
// 入口の門(丸太の柱・町の名前・牛の頭の骨)
function gate(ctx, cx, z) {
  const { M } = ctx, B = ctx.B, hw = 8.7;
  for (const s of [-1, 1]) {
    const x = cx + s * hw, g = new THREE.CylinderGeometry(0.4, 0.5, 8.6, 8);
    B.geom(M.plain, g, _m.makeTranslation(x, 4.3, z), { col: WOODC }); g.dispose();
    B.box(M.plain, x - 0.7, 0, z - 0.7, x + 0.7, 0.5, z + 0.7, { col: [0.5, 0.36, 0.3] });
    ctx.solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 8.6);
    B.box(M.plain, x - s * 1.3 - 0.02, 5.6, z - 0.02, x - s * 1.3 + 0.02, 7.3, z + 0.02, { col: [0.1, 0.09, 0.08] });
    B.box(M.glow, x - s * 1.3 - 0.16, 5.2, z - 0.16, x - s * 1.3 + 0.16, 5.62, z + 0.16, { col: LAN, skip: '' });
    pool(ctx, x - s * 1.3, z, 5, [0.36, 0.2, 0.07], 0.035);
    placeFence(ctx, x + s * 0.8, z, x + s * 13, z, [0.5, 0.36, 0.24]);
  }
  beam(B, M.plain, [cx - hw - 1.4, 7.7, z], [cx + hw + 1.4, 7.7, z], 0.5, WOODC);
  beam(B, M.plain, [cx - hw, 5.05, z], [cx + hw, 5.05, z], 0.3, DARKW);
  B.box(M.plain, cx - 5.4, 5.25, z - 0.1, cx + 5.4, 7.4, z + 0.1, { col: DARKW, skip: '' });
  for (const sg of [1, -1]) { wsign(ctx, cx, 5.4, z, 0, sg, 8.4, 2.1 * 0.88, WS['RUSTY SPUR'], [1.12, 1.12, 1.12], 0.12); wsign(ctx, cx, 3.85, z, 0, sg, 4.4, 1.1, WS['ウエスタン通り'], [1.12, 1.12, 1.12], 0.08); }
  B.box(M.plain, cx - 2.3, 3.8, z - 0.06, cx + 2.3, 5.0, z + 0.06, { col: DARKW, skip: '' });
  ctx.prop('skull', cx, z, -Math.PI / 2, { y: 7.95, s: 2.3, solid: false, occupy: false });
}
// 光るランタン(小さな箱)
function lanternBox(ctx, x, y, z, s = 0.14) { ctx.B.box(ctx.M.glow, x - s, y, z - s, x + s, y + s * 2.2, z + s, { col: LAN, skip: '' }); }

// ---------- 中に入れる建物 ----------
function saloon(ctx) {
  const { M } = ctx, x0 = 49.6, x1 = 73.6, z0 = -282.6, z1 = -260.6, h = 6.6, col = [1.0, 0.72, 0.62];
  const S = new WBld(ctx, { name: 'サルーン', x0, z0, x1, z1, h, y0: Y, bay: 3.0, front: 'S',
    rows: [[0, 3.7, [WT.clap, WT.clapWin, WT.poster, WT.clapLit]], [3.7, 20, [WT.clap, WT.curtain, WT.clap, WT.curtainLit]]],
    frontRows: [[0, 3.7, [WT.saloonWin]], [3.7, 20, [WT.curtainLit, WT.curtain]]],
    skinCol: col, floor: M.woodFloor, floorCol: [0.74, 0.56, 0.4], wall: M.wood, wallCol: [0.66, 0.46, 0.34], ceilCol: [0.5, 0.36, 0.26] });
  S.shell([{ side: 'S', at: 61.6, w: 4.4 }, { side: 'W', at: -271.6, w: 4 }, { side: 'E', at: -271.6, w: 3.6 }]);
  const bk = ctx.B.bucket(M.west, 61.6, -271.6), B = ctx.B;
  // カウンターと 酒のたな
  B.box(M.plain, 54, Y, -279.4, 69, Y + 1.1, -278.4, { col: [0.36, 0.2, 0.12] });
  B.box(M.plain, 53.9, Y + 1.1, -279.5, 69.1, Y + 1.18, -278.3, { col: [0.6, 0.38, 0.22], skip: '' });
  beam(B, M.plain, [54, Y + 0.25, -278.25], [69, Y + 0.25, -278.25], 0.06, [0.85, 0.62, 0.2]);
  ctx.solid(54, -279.4, 69, -278.4, 1.2, S.b);
  wwall(ctx, bk, 54, -282.07, 0, 1, 15, Y + 0.1, Y + 3.0, WT.bar, [1, 1, 1], 3);
  for (let x = 55.4; x < 68.5; x += 2.5) B.box(M.plain, x - 0.2, Y, -277.9, x + 0.2, Y + 0.72, -277.5, { col: [0.5, 0.32, 0.2] });
  // ピアノ
  wbox(ctx, 50.3, Y, -268.4, 51.3, Y + 1.35, -266.0, WT.board, [0.5, 0.33, 0.24], WT.board, 3);
  wwall(ctx, bk, 51.33, -266.0, 1, 0, 2.4, Y, Y + 1.35, WT.piano, [1, 1, 1], 2.4);
  B.box(M.plain, 51.7, Y, -267.5, 52.2, Y + 0.5, -266.9, { col: [0.5, 0.1, 0.1] });
  ctx.solid(50.3, -268.4, 51.3, -266.0, 1.4, S.b);
  // 丸テーブル・はり紙・たる
  for (const [x, z] of [[55.6, -265.2], [67.6, -265.4], [56.2, -274.4], [67.2, -274.6]]) S.prop('rtable', x, z, x + z);
  wwall(ctx, bk, 73.07, -269.4, -1, 0, 6.4, Y + 0.3, Y + 3.0, [WT.wanted, WT.paper], [1, 1, 1], 3.2);
  S.prop('wbarrel', 71.6, -280.6, 0, { col: [0.52, 0.36, 0.22] }); S.prop('wbarrel', 72.4, -279.6, 0, { col: [0.46, 0.3, 0.2] }); S.prop('wbarrel', 51, -280.8, 0, { col: [0.52, 0.36, 0.22] });
  for (const [x, z] of [[56, -266], [67, -266], [61.6, -274.5], [61.6, -268]]) S.light(x, z, 4.6, [0.5, 0.3, 0.1]);
  // スイングドア(見た目だけ。通れる)
  for (const [a, b] of [[59.5, 61.45], [61.75, 63.7]]) B.box(M.plain, a, Y + 0.45, z1 - 0.07, b, Y + 1.75, z1 - 0.01, { col: [0.56, 0.34, 0.2], skip: '' });
  S.onRoof(() => {
    wgable(ctx, ctx.B.bucket(M.west, 61.6, -271.6), x0, z0, x1, z1, h, false, WT.shingle, [0.9, 0.8, 0.76], 2.3, 0.4, [0.74 * col[0], 0.64 * col[1], 0.52 * col[2]]);
    falseFront(ctx, S.face('S'), h, 2.9, col, 'step', WS.SALOON);
    for (const [a, b] of [[60.4, 62.8], [61.6, 61.6]]) ctx.B.box(M.plain, a === b ? a - 0.05 : a, 4.3, a === b ? -272.8 : -271.65, a === b ? a + 0.05 : b, 4.4, a === b ? -270.4 : -271.55, { col: DARKW, skip: '' });
    for (const [x, z] of [[60.4, -271.6], [62.8, -271.6], [61.6, -272.8], [61.6, -270.4]]) lanternBox(ctx, x, 4.4, z, 0.1);
  });
  porch(ctx, S.face('S'), { D: 2.6, kind: 'balcony', H: h + 0.4, col, sign: WS.SALOON, blade: false, tile: WT.shingle });
  porch(ctx, S.face('W'), { D: 2.6, kind: 'slope', col, sign: WS.SALOON, tile: WT.shingle });
  S.finish();
}
function sheriff(ctx) {
  const { M } = ctx, x0 = 18.4, x1 = 30.4, z0 = -222, z1 = -208, h = 4.3, col = [0.92, 0.84, 0.7], B = ctx.B;
  const S = new WBld(ctx, { name: '保安官事務所', x0, z0, x1, z1, h, y0: Y, bay: 3.0, front: 'E',
    rows: [[0, 20, [WT.clap, WT.clapWin, WT.clap, WT.poster]]], frontRows: [[0, 20, [WT.clapWin, WT.wanted, WT.clapLit]]],
    skinCol: col, floor: M.woodFloor, floorCol: [0.7, 0.55, 0.4], wall: M.wood, wallCol: [0.7, 0.52, 0.38], ceilCol: [0.5, 0.38, 0.28], small: true });
  S.shell([{ side: 'E', at: -214, w: 4 }, { side: 'W', at: -211.5, w: 3.6 }]);
  // 牢(鉄ごうし。2 部屋。戸は あいている)
  const zc = -217.6, iron = [0.2, 0.2, 0.22];
  for (let x = 19.1; x < 29.9; x += 0.3) { if ((x > 19.6 && x < 22.4) || (x > 26.6 && x < 29.4)) continue; B.box(M.plain, x - 0.035, Y, zc - 0.035, x + 0.035, Y + 3.0, zc + 0.035, { col: iron }); }
  for (const y of [0.25, 1.5, 3.0]) B.box(M.plain, 18.9, Y + y, zc - 0.05, 29.9, Y + y + 0.07, zc + 0.05, { col: iron, skip: '' });
  for (const [a, b] of [[18.9, 19.6], [22.4, 26.6], [29.4, 29.9]]) ctx.solid(a, zc - 0.1, b, zc + 0.1, 3.2, S.b);
  for (const [x, r] of [[19.6, -1], [26.6, -1]]) B.box(M.plain, x - 0.035, Y, zc, x + 0.035, Y + 3.0, zc + 2.6, { col: iron, rot: r * 0.5 });   // あいた戸
  for (let z = -221.4; z < zc; z += 0.3) B.box(M.plain, 24.4 - 0.035, Y, z - 0.035, 24.4 + 0.035, Y + 3.0, z + 0.035, { col: iron });
  ctx.solid(24.3, -221.5, 24.5, zc, 3.2, S.b);
  for (const x of [23.6, 25.2]) B.box(M.plain, x - 0.4, Y, -221.3, x + 0.4, Y + 0.45, -219.4, { col: [0.5, 0.45, 0.36] });
  // 机・たな・はり紙
  S.prop('desk', 26.4, -210.6, Math.PI, {}); S.prop('cabinet', 19.6, -209.2, 0, {}); S.prop('wbarrel', 29.4, -209.2, 0, { col: [0.5, 0.34, 0.22] });
  wwall(ctx, B.bucket(M.west, 24.4, -215), 18.93, -217.2, 1, 0, 3.2, Y + 0.5, Y + 3.0, WT.wanted, [1, 1, 1], 3.2);
  S.light(24.4, -212.5, 4.5, [0.5, 0.32, 0.12]); S.light(24.4, -219.6, 3.5, [0.4, 0.26, 0.1]);
  wsign(ctx, 24.4, Y + 2.05, z1, 0, 1, 3.6, 0.9, WS.JAIL, [1.05, 1.05, 1.05], 0.07);
  S.onRoof(() => {
    wgable(ctx, ctx.B.bucket(M.west, 24.4, -215), x0, z0, x1, z1, h, true, WT.tin, [1, 1, 1], 1.7, 0.4, [0.74 * col[0], 0.64 * col[1], 0.52 * col[2]]);
    falseFront(ctx, S.face('E'), h, 2.3, col, 'rect', WS.SHERIFF);
  });
  porch(ctx, S.face('E'), { D: 2.6, kind: 'slope', col, sign: WS.SHERIFF, tile: WT.tin });
  S.finish();
}
function church(ctx) {
  const { M } = ctx, x0 = 99, x1 = 113, z0 = -284.6, z1 = -264.6, h = 5.6, col = [1.04, 1.17, 1.38], cx = 106;   // 白い板張り
  const S = new WBld(ctx, { name: '教会', x0, z0, x1, z1, h, y0: Y, bay: 3.4, front: 'S',
    rows: [[0, 20, [WT.clap, WT.arch]]], frontRows: [[0, 20, [WT.clap]]],
    skinCol: col, floor: M.woodFloor, floorCol: [0.72, 0.58, 0.44], wall: M.plaster, wallCol: [0.92, 0.88, 0.8], small: true });
  S.shell([{ side: 'S', at: cx, w: 4 }, { side: 'E', at: -276, w: 3.6 }]);
  for (let z = -268.4; z > -279.5; z -= 2.5) { S.prop('pew', cx - 3.9, z, 0, { s: 0.8 }); S.prop('pew', cx + 3.9, z, 0, { s: 0.8 }); }
  S.prop('altar', cx, -282.4, 0, {});
  S.light(cx, -272, 5, [0.5, 0.36, 0.16]); S.light(cx, -280.5, 4, [0.5, 0.36, 0.16]);
  S.onRoof(() => {
    const B = ctx.B;
    wgable(ctx, B.bucket(M.west, cx, -274), x0, z0, x1, z1, h, false, WT.shingle, [0.72, 0.68, 0.7], 4.4, 0.5, [0.8, 0.86, 0.96]);
    // 鐘の塔(正面の上)
    wbox(ctx, cx - 2, h - 0.2, z1 - 4.2, cx + 2, h + 5.2, z1 - 0.2, WT.clap, col, WT.shingle, 4);
    for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) B.box(M.plain, cx + nx * 2.02 - (nz ? 0.8 : 0.02), h + 3.0, z1 - 2.2 + nz * 2.02 - (nx ? 0.8 : 0.02), cx + nx * 2.02 + (nz ? 0.8 : 0.02), h + 4.6, z1 - 2.2 + nz * 2.02 + (nx ? 0.8 : 0.02), { col: [0.06, 0.05, 0.05], skip: '' });
    const bell = new THREE.CylinderGeometry(0.3, 0.6, 0.9, 10); B.geom(M.car, bell, _m.makeTranslation(cx, h + 3.7, z1 - 2.2), { col: [0.9, 0.68, 0.22] }); bell.dispose();
    const cone = new THREE.ConeGeometry(3.3, 4.2, 4); B.geom(M.plain, cone, _m.makeRotationY(Math.PI / 4).setPosition(cx, h + 7.3, z1 - 2.2), { col: [0.4, 0.34, 0.32] }); cone.dispose();
    B.box(M.plain, cx - 0.08, h + 9.3, z1 - 2.28, cx + 0.08, h + 11.1, z1 - 2.12, { col: [1.2, 1.2, 1.15] }); B.box(M.plain, cx - 0.55, h + 10.3, z1 - 2.27, cx + 0.55, h + 10.46, z1 - 2.13, { col: [1.2, 1.2, 1.15], skip: '' });
    wsign(ctx, cx, 4.35, z1, 0, 1, 4.0, 1.0, WS.CHAPEL, [1.05, 1.05, 1.05], 0.07);
  });
  wfloor(ctx, cx - 1.6, z1, cx + 1.6, -260.6, 0.03, WT.walk, [0.85, 0.85, 0.85], 2.6);
  for (const s of [-1, 1]) ctx.prop('wlamp', cx + s * 3.2, z1 + 1.6, s > 0 ? Math.PI : 0, {});
  for (const s of [-1, 1]) placeFence(ctx, cx + s * 2.4, -261.4, cx + s * 7.4, -261.4, [1.1, 1.1, 1.05]);
  S.finish();
}

// ---------- 町を作る ----------
export function genWestern(ctx) {
  const { M } = ctx, B = ctx.B, W = WEST, rnd = ctx.rnd;
  const R = (a, b) => a + rnd() * (b - a);
  // 土の道(わだち・ひづめの跡)
  for (const [a, b, t] of [[33, 36.5, WT.hoof], [36.5, 43.5, WT.ruts], [43.5, 47, WT.hoof]]) wfloor(ctx, a, W.z0, b, W.z1, 0.02, t, [1, 1, 1], 3.5);
  for (const [a, b, t] of [[CZ - 6, CZ - 3, WT.hoof], [CZ - 3, CZ + 3, WT.ruts], [CZ + 3, CZ + 6, WT.hoof]]) floorX(ctx, 47, a, 170, b, 0.021, t, 3);
  ctx.mapRect(33, W.z0, 47, W.z1, '#cfa678'); ctx.mapRect(47, CZ - 6, 170, CZ + 6, '#cfa678');
  ctx.occupy(33, W.z0, 47, W.z1); ctx.occupy(47, CZ - 6, 170, CZ + 6);
  gate(ctx, MX, -203);
  for (const [x, z, s] of [[23.6, -33, 1.5], [47.4, -47.4, 1], [47.4, -119.4, 1], [47.4, -184.6, 1.2]]) guide(ctx, x, z, s);
  groundSign(ctx, 11, -29.6, 9, Y + 0.02); groundSign(ctx, 43, -72, 5.2, 0.034); groundSign(ctx, 43, -150, 5.2, 0.034);
  // 板張りの歩道
  boardwalk(ctx, 30.4, -292, 33, -206); boardwalk(ctx, 47, -243.4, 49.6, -206); boardwalk(ctx, 47, -294, 49.6, -258);
  boardwalk(ctx, 49.6, -260.6, 168.4, -258); boardwalk(ctx, 49.6, -246, 112, -243.4); boardwalk(ctx, 168.4, -268, 184.6, -238);

  // 西の列(東向き)
  const E = [1, 0], Wn = [-1, 0], S = [0, 1];
  sheriff(ctx);
  wbuild(ctx, [19.4, -234, 30.4, -224], E, { H: 5.0, fh: 2.3, ground: [WT.brickWin, WT.brickDoor, WT.brickWin], sideTiles: [WT.brick, WT.brickWin, WT.brick], top: 'step', sign: WS.BANK, roof: 'flat', porch: 'flat' });
  wbuild(ctx, [18.4, -247, 30.4, -236], E, { two: true, col: [1.05, 0.95, 0.68], ground: [WT.store, WT.door, WT.store], sign: WS['GENERAL STORE'], top: 'rect' });
  wbuild(ctx, [21.4, -256, 30.4, -249], E, { col: [0.82, 0.96, 1.04], ground: [WT.clapWin, WT.door], sign: WS.BARBER, top: 'peak' });
  wbuild(ctx, [20.4, -266, 30.4, -258], E, { col: [0.56, 0.55, 0.6], ground: [WT.door, WT.clapWin, WT.clap], sign: WS.UNDERTAKER, top: 'peak', porch: 'flat' });
  wbuild(ctx, [19.4, -277, 30.4, -268], E, { col: [0.98, 0.72, 0.6], ground: [WT.store, WT.door, WT.clapWin], sign: WS.GUNSMITH, top: 'step' });
  wbuild(ctx, [20.4, -289, 30.4, -279], E, { col: [0.8, 0.94, 0.76], ground: [WT.clapWin, WT.door, WT.clapLit], sign: WS.TELEGRAPH, top: 'rect' });
  // 床屋の ねじり棒・葬儀屋の ひつぎ
  for (let k = 0; k < 6; k++) B.box(M.plain, 32.5, Y + 0.5 + k * 0.28, -249.5, 32.72, Y + 0.78 + k * 0.28, -249.28, { col: k % 2 ? [0.85, 0.1, 0.1] : [1.1, 1.1, 1.1] });
  for (const z of [-258.6, -259.5]) { const g = new THREE.BoxGeometry(0.34, 1.9, 0.62); B.geom(M.plain, g, _m.makeRotationZ(0.22).setPosition(30.95, Y + 0.95, z), { col: [0.3, 0.2, 0.14] }); g.dispose(); }
  // 東の列(西向き)
  wbuild(ctx, [49.6, -219, 60.6, -208], Wn, { col: [0.62, 0.56, 0.52], side: WT.board, ground: [WT.barn, WT.board, WT.barn], sign: WS.BLACKSMITH, top: 'rect', porch: 'flat', awnTile: WT.tin });
  wbuild(ctx, [49.6, -231, 59.6, -221], Wn, { col: [0.92, 0.56, 0.46], side: WT.board, ground: [WT.barn, WT.clapWin, WT.door], sign: WS['FEED & GRAIN'], top: 'peak' });
  wbuild(ctx, [49.6, -243.4, 58.6, -233], Wn, { col: [1.08, 1.22, 1.44], ground: [WT.clapWin, WT.door, WT.clapLit], sign: WS.DOCTOR, top: 'step' });
  wbuild(ctx, [49.6, -293.4, 59.6, -285], Wn, { col: [1.0, 0.86, 0.6], ground: [WT.door, WT.clapWin, WT.clapWin], sign: WS['ASSAY OFFICE'], top: 'rect' });
  // 鍛冶屋の炉と かなとこ
  B.box(M.plain, 53.4, 0, -207.2, 55.2, 1.0, -205.8, { col: [0.36, 0.33, 0.32] }); B.box(M.glow, 53.7, 1.0, -206.9, 54.9, 1.06, -206.1, { col: [3, 1.0, 0.25] });
  ctx.solid(53.4, -207.2, 55.2, -205.8, 1.0); ctx.W.addFire(54.3, 1.05, -206.5, 0.3);
  B.box(M.plain, 56.4, 0, -206.8, 56.9, 0.6, -206.3, { col: WOODC }); B.box(M.plain, 56.2, 0.6, -206.75, 57.2, 0.85, -206.35, { col: [0.14, 0.14, 0.16], skip: '' });
  // 駅前通りの北(南向き = 見下ろしで 看板が読める)
  saloon(ctx);
  wbuild(ctx, [77, -272.6, 93, -260.6], S, { two: true, H: 7.6, col: [0.78, 0.88, 1.06], ground: [WT.clapWin, WT.clapLit, WT.door, WT.clapWin, WT.clapWin], up: [WT.curtain, WT.curtainLit], sign: WS.HOTEL, top: 'step', fh: 2.4 });
  church(ctx);
  ctx.prop('watertank', 118.4, -267.4, 0, { s: 1.7 });
  const st = wbuild(ctx, [122, -276.6, 138, -260.6], S, { H: 6.2, G: 3.7, fh: 0, col: [0.88, 0.52, 0.44], side: WT.board, ground: [WT.barn, WT.stall, WT.barn, WT.stall, WT.barn], up: [WT.board, WT.clapWin, WT.board], roofTile: WT.shingle, porch: 'none' });
  wsign(ctx, 130, 4.1, -260.6, 0, 1, 6.4, 1.6, WS['LIVERY STABLE'], [1.05, 1.05, 1.05], 0.07); void st;
  // 牧場のさく(こわせる)・干し草・水おけ
  const FC = [0.52, 0.38, 0.26];
  placeFence(ctx, 140, -281, 156, -281, FC); placeFence(ctx, 156, -281, 156, -261.6, FC); placeFence(ctx, 140, -281, 140, -261.6, FC);
  placeFence(ctx, 140, -261.6, 146, -261.6, FC); placeFence(ctx, 150.5, -261.6, 156, -261.6, FC);
  for (const [x, z, r] of [[142, -279, 0], [143.6, -279.2, 0], [142.7, -277.6, 1], [153.6, -278.6, 1], [154, -265, 0]]) { const a = r ? 0.7 : 1.4, b = r ? 1.4 : 0.7; wbox(ctx, x - a / 2, 0, z - b / 2, x + a / 2, 0.75, z + b / 2, WT.straw, [1, 1, 1], WT.straw, 2); ctx.solid(x - a / 2, z - b / 2, x + a / 2, z + b / 2, 0.75); }
  wfloor(ctx, 141, -280, 155, -263, 0.022, WT.straw, [0.8, 0.72, 0.6], 7);
  ctx.prop('trough', 148, -279.4, 0, {}); ctx.prop('wagon', 151.4, -271, 0.5, {});
  ctx.occupy(140, -281, 156, -261.6);

  // 金鉱(北の岩山に 入口。トロッコの線路)
  mesa(ctx, 167, -288.6, 15, 6.4, 10, 3);
  wbox(ctx, 160.8, 0, -287, 165.2, 3.3, -279.6, WT.board, [0.62, 0.5, 0.4], WT.board, 3.7);
  wwall(ctx, B.bucket(M.west, 163, -283), 160.8, -279.55, 0, 1, 4.4, 0, 3.3, WT.mine, [1, 1, 1], 4.4);
  for (const x of [160.8, 165.2]) B.box(M.plain, x - 0.2, 0, -279.7, x + 0.2, 3.5, -279.3, { col: DARKW });
  B.box(M.plain, 160.4, 3.3, -279.75, 165.6, 3.7, -279.25, { col: DARKW, skip: '' });
  wsign(ctx, 163, 3.85, -279.5, 0, 1, 4.4, 1.1, WS['GOLD MINE'], [1.1, 1.1, 1.1], 0.02); B.box(M.plain, 160.8, 3.8, -279.56, 165.2, 5.0, -279.5, { col: DARKW, skip: '' });
  ctx.solid(160.6, -287, 165.4, -279.4, 3.6);
  wfloor(ctx, 162, -279.4, 164, -262, 0.024, WT.rail, [1, 1, 1], 2);
  ctx.prop('minecart', 163, -275.6, Math.PI / 2, {}); ctx.prop('minecart', 163, -268.4, Math.PI / 2, {});
  ctx.prop('wlamp', 159.8, -278.6, 0, {});
  for (const [x, z] of [[166.6, -278.2], [167.8, -277.2], [166.8, -276.2]]) ctx.prop('dynamite', x, z, R(0, 3), {});
  ctx.prop('wbarrel', 168.2, -278.6, 0, { col: [0.5, 0.34, 0.22] }); ctx.prop('crate', 158.6, -276.6, 0.3, { col: [0.8, 0.64, 0.44] });
  wsign(ctx, 167.4, 1.3, -279.6, 0, 1, 2.4, 0.6, WS['DANGER  T N T'], [1.05, 1.05, 1.05], 0.02); B.box(M.plain, 167.3, 0, -279.7, 167.5, 1.9, -279.62, { col: WOODC });

  // 駅と 蒸気機関車
  wbuild(ctx, [171, -264, 181, -248], Wn, { col: [0.98, 0.84, 0.58], ground: [WT.clapWin, WT.door, WT.clapWin, WT.clapWin, WT.door], sign: WS['RUSTY SPUR STATION'], top: 'rect', fh: 2.1, porch: 'flat', D: 2.4, blade: false, roofTile: WT.tin });
  wsign(ctx, 176, 2.3, -248, 0, 1, 7.2, 1.8, WS['RUSTY SPUR STATION'], [1.05, 1.05, 1.05], 0.07);
  { const bk = B.bucket(M.west, 183, -256);   // ホームの屋根
    wpatch(bk, [181, 3.5, -246.5], [184.8, 3.2, -246.5], [181, 3.5, -265.5], [184.8, 3.2, -265.5], 1, 5, WT.tin, [1, 1, 1]);
    wpatch(bk, [184.8, 3.16, -246.5], [181, 3.46, -246.5], [184.8, 3.16, -265.5], [181, 3.46, -265.5], 1, 5, WT.board, [0.45, 0.4, 0.36]);
    for (let z = -265.2; z < -246; z += 4.6) B.box(M.plain, 184.3, Y, z - 0.08, 184.46, 3.2, z + 0.08, { col: WOODC }); }
  wfloor(ctx, 185.5, -284, 188.5, -200, 0.022, WT.rail, [1, 1, 1], 3);
  ctx.mapRect(186.3, -284, 187.7, -200, '#3a3230'); ctx.occupy(185, -284, 189, -200);
  for (const z of [-284.6, -199.4]) { B.box(M.plain, 185.6, 0, z - 0.25, 188.4, 1.1, z + 0.25, { col: [0.6, 0.12, 0.1] }); ctx.solid(185.6, z - 0.25, 188.4, z + 0.25, 1.1); }
  train(ctx, 187, -262);
  ctx.prop('watertank', 193, -278, 0, { s: 1.5 });
  ctx.prop('bench', 183.4, -242, -Math.PI / 2, { y: Y }); ctx.prop('bench', 170.6, -267, Math.PI, { y: Y });
  for (const [x, z] of [[183.2, -239.6], [182.4, -240.4], [169.6, -239.4]]) ctx.prop('crate', x, z, R(0, 1), { y: Y, col: [0.8, 0.64, 0.44] });
  ctx.prop('wbarrel', 170.4, -240.2, 0, { y: Y, col: [0.5, 0.34, 0.22] }); ctx.prop('wlamp', 169, -246.4, 0, { y: Y }); ctx.prop('wlamp', 169, -257.6, 0, { y: Y });

  // ブーツヒル(墓場)と 絞首台
  placeFence(ctx, 70, -240, 84.6, -240, FC); placeFence(ctx, 89.4, -240, 104, -240, FC); placeFence(ctx, 70, -211, 104, -211, FC); placeFence(ctx, 70, -240, 70, -211, FC); placeFence(ctx, 104, -240, 104, -226, FC); placeFence(ctx, 104, -221, 104, -211, FC);
  for (const x of [84.8, 89.2]) { B.box(M.plain, x - 0.14, 0, -240.14, x + 0.14, 3.9, -239.86, { col: WOODC }); ctx.solid(x - 0.2, -240.2, x + 0.2, -239.8, 3.9); }
  B.box(M.plain, 84.8, 2.75, -240.06, 89.2, 3.9, -239.94, { col: DARKW, skip: '' });
  for (const sg of [1, -1]) wsign(ctx, 87, 2.8, -240, 0, sg, 4.2, 1.05, WS['BOOT HILL'], [1.05, 1.05, 1.05], 0.07);
  for (let z = -235; z < -213; z += 5.2) for (let x = 73.4; x < 102; x += 3.7) {
    if (Math.abs(x - 87) < 2.2 && z < -232) continue;
    const cr = rnd() < 0.7, v = cr ? 0.75 + rnd() * 0.3 : 0.5 + rnd() * 0.2;
    ctx.I.add(cr ? 'cross' : 'grave', x + R(-0.5, 0.5), 0, z + R(-0.5, 0.5), R(-0.25, 0.25), 0.9 + rnd() * 0.3, cr ? [v * 1.3, v, v * 0.7] : [v, v, v * 0.96], { rx: R(-0.15, 0.15), rz: R(-0.18, 0.18) });
    ctx.solid(x - 0.4, z - 0.15, x + 0.4, z + 0.15, 1);
    wfloor(ctx, x - 0.55, z + 0.3, x + 0.55, z + 2.3, 0.024, WT.dirt, [0.7, 0.62, 0.58], 4);
  }
  placeTree(ctx, 'dead', 99.6, -214.6, 1.3, 1.2, [0.7, 0.6, 0.5]);
  ctx.occupy(70, -240, 104, -211); ctx.mapRect(70, -240, 104, -211, '#8a6a4a');
  { const gx = 111.5, gz = -231;   // 絞首台
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) B.box(M.plain, gx + dx - 0.12, 0, gz + dz - 0.12, gx + dx + 0.12, 1.7, gz + dz + 0.12, { col: WOODC });
    B.box(M.plain, gx - 2.3, 1.7, gz - 2.3, gx + 2.3, 1.86, gz + 2.3, { col: [0.56, 0.42, 0.3], skip: '' });
    for (let k = 0; k < 5; k++) B.box(M.plain, gx - 0.8, k * 0.34, gz + 2.3 + (4 - k) * 0.36, gx + 0.8, k * 0.34 + 0.1, gz + 2.3 + (5 - k) * 0.36, { col: WOODC, skip: '' });
    B.box(M.plain, gx + 1.7, 1.86, gz - 1.9, gx + 1.96, 5.6, gz - 1.64, { col: DARKW }); beam(B, M.plain, [gx + 1.83, 5.5, gz - 1.77], [gx - 0.6, 5.5, gz - 1.77], 0.22, DARKW);
    beam(B, M.plain, [gx + 1.83, 4.5, gz - 1.77], [gx + 0.8, 5.5, gz - 1.77], 0.14, DARKW); beam(B, M.plain, [gx - 0.3, 5.4, gz - 1.77], [gx - 0.3, 4.0, gz - 1.77], 0.05, [0.8, 0.7, 0.5]);
    const g = new THREE.TorusGeometry(0.22, 0.03, 4, 10); B.geom(M.plain, g, _m.makeTranslation(gx - 0.3, 3.8, gz - 1.77), { col: [0.8, 0.7, 0.5] }); g.dispose();
    ctx.solid(gx - 2.3, gz - 2.3, gx + 2.3, gz + 2.3, 1.86); ctx.occupy(gx - 3, gz - 3, gx + 3, gz + 5); }

  // 荷物置き場(ほろ馬車・駅馬車・たる・木箱・ダイナマイト)と 風車
  ctx.prop('coach', 124, -242, 0.12, {}); ctx.prop('wagon', 134, -236, -0.5, {}); ctx.prop('wagon', 143, -226, 1.2, {}); ctx.prop('wagon', 125, -222, 2.8, {});
  for (const [x, z, n] of [[131, -224, 2], [132.4, -224.6, 1], [150, -238, 1], [151.3, -237.4, 2], [118, -214, 1]]) ctx.prop('crate', x, z, R(0, 1.5), { col: [0.8, 0.64, 0.44], stack: n });
  for (const [x, z] of [[147.2, -229], [148.2, -228.2], [147.4, -227.4], [136, -214], [136.9, -214.6], [120, -238], [158, -240]]) ctx.prop('wbarrel', x, z, 0, { col: [0.46 + rnd() * 0.1, 0.32, 0.2] });
  for (const [x, z] of [[149.6, -229.4], [150.2, -227.8], [138.2, -214.2], [152.4, -224.6]]) ctx.prop('dynamite', x, z, R(0, 3), {});
  { const wx = 160, wz = -214;   // 風車(羽は West が回す)
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) beam(B, M.plain, [wx + dx * 1.4, 0, wz + dz * 1.4], [wx + dx * 0.3, 9, wz + dz * 0.3], 0.14, WOODC);
    for (const y of [2.6, 5.4]) { const k = 1.4 - y / 9 * 1.1; for (const [a, b] of [[[-k, -k], [k, -k]], [[k, -k], [k, k]], [[k, k], [-k, k]], [[-k, k], [-k, -k]]]) beam(B, M.plain, [wx + a[0], y, wz + a[1]], [wx + b[0], y, wz + b[1]], 0.08, WOODC); }
    B.box(M.plain, wx - 0.5, 9, wz - 0.5, wx + 0.5, 9.15, wz + 0.5, { col: DARKW, skip: '' }); B.box(M.plain, wx - 0.03, 9.4, wz - 2.6, wx + 0.03, 10.4, wz - 0.8, { col: [0.7, 0.2, 0.15], skip: '' });
    beam(B, M.plain, [wx, 9.7, wz - 0.9], [wx, 9.7, wz + 0.7], 0.1, [0.3, 0.3, 0.32]);
    ctx.solid(wx - 1.3, wz - 1.3, wx + 1.3, wz + 1.3, 9); ctx.occupy(wx - 2, wz - 2, wx + 2, wz + 2); ctx.mapCircle(wx, wz, 1.6, '#d8c8a8');
    ctx.W._westFan = { x: wx, y: 9.7, z: wz + 0.75 }; ctx.prop('trough', wx - 3.4, wz + 0.4, Math.PI / 2, {}); }

  // 通りの小物: ランプの柱・馬つなぎ・水おけ・たる・木箱
  for (let z = -212, k = 0; z > -292; z -= 13, k++) { if (Math.abs(z - CZ) < 8) continue; const s = k % 2 ? 1 : -1; ctx.prop('wlamp', MX + s * 6.6, z, s > 0 ? Math.PI : 0, {}); pool(ctx, MX + s * 6, z, 4.5, [0.34, 0.2, 0.07], 0.035); }
  for (let x = 60, k = 0; x < 166; x += 15, k++) { const s = k % 2 ? 1 : -1; ctx.prop('wlamp', x, CZ + s * 5.6, s > 0 ? Math.PI / 2 : -Math.PI / 2, {}); pool(ctx, x, CZ + s * 5, 4.5, [0.34, 0.2, 0.07], 0.035); }
  for (const [x, z, r] of [[33.6, -217, 1], [33.6, -241, 1], [33.6, -273, 1], [46.4, -226, 1], [46.4, -289, 1], [56, -257.4, 0], [67, -257.4, 0], [85, -257.4, 0], [130, -257.4, 0], [84, -246.6, 0]]) ctx.prop('hitch', x, z, r ? Math.PI / 2 : 0, {});
  ctx.prop('trough', 33.7, -245, Math.PI / 2, {}); ctx.prop('trough', 72.4, -257.4, 0, {}); ctx.prop('trough', 46.3, -214, Math.PI / 2, {});
  for (const [x, z] of [[31.2, -223], [31.6, -235.2], [31.4, -257.2], [31.3, -267.2], [48.4, -220], [48.6, -232.2], [48.3, -284.2], [75.2, -259.4], [94.4, -259.2], [120.6, -259.4], [50.4, -244.6], [96, -244.6]]) ctx.prop(rnd() < 0.7 ? 'wbarrel' : 'crate', x, z, R(0, 1.5), { y: Y, col: rnd() < 0.5 ? [0.5, 0.34, 0.22] : [0.76, 0.6, 0.42] });
  ctx.prop('wagon', 9, -216, 0.4, {}); ctx.prop('wbarrel', 52, -203.4 - 2.2, 0, { col: [0.5, 0.34, 0.22] });

  // まわりの荒野: 赤い岩山(メサ)・サボテン・岩・枯れ木・牛の骨
  for (const [x, z, rx, rz, h, sd] of [[68, -200.6, 13, 3.4, 7, 5], [98, -200.8, 15, 3.8, 9.5, 6], [131, -200.6, 14, 3.5, 6.5, 7], [164, -201, 15, 3.8, 8.5, 8], [15, -200.4, 12, 3.4, 7.5, 9],
    [200, -274, 6.5, 13, 11, 10], [200.5, -242, 6, 12, 14, 11], [200, -212, 6.5, 11, 9, 12], [190, -290, 7, 4, 8, 13], [79, -290.4, 11, 3.6, 9, 14], [98, -291.2, 7, 2.8, 6, 15], [141, -290, 8, 4, 7.5, 16],
    [3, -230, 7, 10, 12.5, 17], [1.5, -253, 5, 6.5, 6.5, 18], [-1, -207, 4.5, 5.5, 5.5, 19]]) mesa(ctx, x, z, rx, rz, h, sd);
  for (let k = 0; k < 150; k++) {
    const x = R(W.x0 + 1, W.x1 - 1), z = R(W.z0 + 1, W.z1 - 1), q = rnd();
    if (!inWest(x, z) || !ctx.isFree(x, z, 1.6) || (x > 30 && x < 50)) continue;
    if (q < 0.34) { const s = 0.7 + rnd() * 0.6; ctx.I.add('cactus', x, 0, z, R(0, 6.28), s, [0.9 + rnd() * 0.25, 1, 0.9]); ctx.solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 3 * s); ctx.occupy(x - 1, z - 1, x + 1, z + 1); }
    else if (q < 0.7) { const s = 0.5 + rnd() * 1.1; ctx.I.add('rock', x, 0, z, R(0, 6.28), [s, s * (0.6 + rnd() * 0.5), s], [1.9, 0.95, 0.66]); if (s > 0.9) ctx.solid(x - s * 0.7, z - s * 0.7, x + s * 0.7, z + s * 0.7, s); ctx.occupy(x - 1.5, z - 1.5, x + 1.5, z + 1.5); }
    else if (q < 0.78) placeTree(ctx, 'dead', x, z, 0.7 + rnd() * 0.5, R(0, 6.28), [0.8, 0.66, 0.52]);
    else if (q < 0.84) ctx.prop('skull', x, z, R(0, 6.28), { solid: false, s: 1.1 });
    else ctx.I.add('grass', x, 0, z, R(0, 6.28), 0.7 + rnd() * 0.5, [1.5, 1.15, 0.6]);
  }
  ctx.occupy(W.x0, W.z0, W.x1, W.z1);
}

// ---------- 動く物(砂ぼこり・転がる草・風車の羽) ----------
const LANES = [
  { x0: 36, z0: -200, x1: 36, z1: -292, wx: 9, wz: 0 },      // 大通り(北へ)
  { x0: 168, z0: -256, x1: 50, z1: -256, wx: 0, wz: 8 },     // 駅前通り(西へ)
];
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export const West = {
  W: null, t: 0, tw: null, items: [], fan: null, pts: null, u: null,
  init(W) {
    this.W = W;
    const q = Engine.quality;
    // 転がる草(タンブルウィード)
    const g = new THREE.IcosahedronGeometry(0.55, 1), r = seeded(77), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const k = 0.72 + r() * 0.5; P.setXYZ(i, P.getX(i) * k, P.getY(i) * k, P.getZ(i) * k); }
    g.computeVertexNormals();
    const n = q === 'low' ? 5 : 9;
    const mat = new THREE.MeshStandardMaterial({ color: 0xa88a5c, roughness: 1, flatShading: true });
    const tw = this.tw = new THREE.InstancedMesh(g, mat, n);
    tw.frustumCulled = false; tw.castShadow = true; tw.visible = false; tw.name = 'west:tumble';
    for (let i = 0; i < n; i++) this.items.push({ lane: i % 3 === 2 ? 1 : 0, t: r(), off: r(), sp: 3 + r() * 3.5, s: 0.7 + r() * 0.6, ph: r() * 6 });
    W.group.add(tw);
    // 風車の羽
    if (W._westFan) {
      const geo = makeGeo((b) => {
        for (let k = 0; k < 14; k++) { const bl = new THREE.BoxGeometry(0.42, 1.7, 0.04); bl.rotateY(0.35); bl.translate(0, 1.25, 0); b.geom(null, bl, _m.makeRotationZ(k / 14 * Math.PI * 2), { col: [0.75, 0.74, 0.7] }); bl.dispose(); }
        const hub = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8).rotateX(Math.PI / 2); b.geom(null, hub, _m.identity(), { col: [0.3, 0.3, 0.32] }); hub.dispose();
        const rim = new THREE.TorusGeometry(2.05, 0.04, 4, 20); b.geom(null, rim, _m.identity(), { col: [0.5, 0.5, 0.5] }); rim.dispose();
      });
      const f = this.fan = new THREE.Mesh(geo, W.M.plainNoCut); f.position.set(W._westFan.x, W._westFan.y, W._westFan.z); f.castShadow = true; f.visible = false; W.group.add(f);
    }
    // 砂ぼこり(動きはシェーダーの中だけ)
    if (q !== 'low') {
      const cnt = q === 'high' ? 360 : 220, bg = new THREE.BufferGeometry(), pos = new Float32Array(cnt * 3), seed = new Float32Array(cnt);
      for (let i = 0; i < cnt; i++) { pos[i * 3] = r(); pos[i * 3 + 1] = r(); pos[i * 3 + 2] = r(); seed[i] = r(); }
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const u = this.u = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uScale: { value: 50 }, uAmt: { value: 0 }, uDay: { value: 1 } };
      const m = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, fog: false,
        vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float aSeed; varying float vA;
          void main() {
            vec3 B = vec3(60.0, 8.0, 60.0);
            vec3 p = position * B;
            p.y = mod(p.y * (0.3 + aSeed * 0.7) + sin(uTime * 0.7 + aSeed * 40.0) * 0.5 + uTime * 0.12, B.y);
            p.x -= uTime * (1.5 + aSeed * 2.0) * 0.4;
            p.z -= uTime * (2.5 + aSeed * 3.5) + sin(uTime * 0.5 + aSeed * 50.0) * 1.4;
            p.xz = mod(p.xz - uCenter.xz + B.xz * 0.5, B.xz) + uCenter.xz - B.xz * 0.5;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min((5.0 + aSeed * 12.0) * uScale / max(1.0, -mv.z), uScale * 0.3);
            vA = smoothstep(0.0, 0.6, p.y) * (1.0 - smoothstep(5.0, 8.0, p.y)) * smoothstep(3.0, 8.0, -mv.z) * (0.4 + 0.6 * aSeed);
          }`,
        fragmentShader: `uniform float uAmt; uniform float uDay; varying float vA;
          void main() {
            float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
            gl_FragColor = vec4(vec3(0.56, 0.4, 0.25) * mix(0.3, 1.0, uDay), a * vA * uAmt * 0.3);
          }`,
      });
      const pts = this.pts = new THREE.Points(bg, m);
      pts.frustumCulled = false; pts.renderOrder = 5; pts.visible = false;
      W.group.add(pts);
    }
  },
  update(dt, px, pz) {
    this.t += dt;
    const k = District.k.dust || 0;
    if (this.pts) {
      const on = k > 0.02; this.pts.visible = on;
      if (on) { const u = this.u; u.uTime.value = this.t % 1000; u.uCenter.value.set(px, 0, pz); u.uAmt.value = k; u.uDay.value = 1 - (this.W.night || 0) * 0.7; u.uScale.value = (Engine.renderer ? Engine.renderer.domElement.height : 400) * 0.12; }
    }
    const near = px > WEST.x0 - 110 && px < WEST.x1 + 110 && pz > WEST.z0 - 110 && pz < WEST.z1 + 110;
    if (this.fan) { this.fan.visible = near; if (near) this.fan.rotation.z = -this.t * 1.7; }
    const tw = this.tw; if (!tw) return;
    tw.visible = near; if (!near) return;
    for (let i = 0; i < this.items.length; i++) {
      const o = this.items[i], L = LANES[o.lane], len = Math.hypot(L.x1 - L.x0, L.z1 - L.z0);
      const gust = 0.6 + 0.4 * Math.sin(this.t * 0.6 + o.ph);
      o.t += dt * o.sp * gust / len; if (o.t > 1) { o.t -= 1; o.off = Math.random(); }
      const d = o.t * len, ax = (L.x1 - L.x0) / len, az = (L.z1 - L.z0) / len, r0 = 0.5 * o.s;
      const edge = Math.min(1, o.t * 12, (1 - o.t) * 12);
      _p.set(L.x0 + ax * d + L.wx * o.off, r0 * 0.9 + Math.abs(Math.sin(d * 0.55 + o.ph)) * 0.45, L.z0 + az * d + L.wz * o.off + Math.sin(d * 0.2 + o.ph) * 0.8 * Math.abs(ax));
      _e.set(az * d / r0, 0, -ax * d / r0); _q.setFromEuler(_e);
      _s.setScalar(o.s * edge);
      tw.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    tw.instanceMatrix.needsUpdate = true;
  },
};
