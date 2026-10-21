// 武器係: ダメージを与える小さな道具(弾・爆発・炎の当たり)。ダメージは必ず Zombies.damage を通す。
// 凍った敵(e.frozen > 0)は もろい: ダメージ 2 倍、倒すと氷が砕ける。
import { Zombies } from './zombies.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Events } from './events.js';
import { Engine } from './engine.js';

// Zombies.damage に渡す入れ物(使い回す。受け取った側は中身をコピーして使ってください)
// 弾は これより低い物(土のう・車・机・ベンチ …)を 飛びこえる。壁(3m 以上)では止まる
export const LOW = 1.7;

const OPT = { dirX: 0, dirZ: 0, force: 0, cause: '', crit: false };

// 当たった記録(照準の「当たった印」用。weapons.js が まとめて hitMarker イベントにする)
export const HIT = { n: 0, crit: false, kill: 0, boss: false, step: 0 };
const NO_MARK = new Set(['sword', 'spin', 'fire', 'drone', 'acid']);

export function hurt(e, dmg, dirX, dirZ, force, cause, crit = false) {
  if (!e.alive) return false;
  const frozen = e.frozen > 0;
  if (frozen) dmg *= 2;
  OPT.dirX = dirX; OPT.dirZ = dirZ; OPT.force = force; OPT.cause = cause; OPT.crit = crit;
  const killed = Zombies.damage(e, dmg, OPT);
  if (killed && frozen) FX.shatter(e.x, 0.6, e.z, (e.def && e.def.scale) || 1);
  if (killed) HIT.step++;
  // 照準の「当たった印」は 弾・飛ぶ物の当たりだけ(剣・回転斬り・炎・ドローン・酸の水たまりは出さない)
  if (!NO_MARK.has(cause)) {
    HIT.n++;
    if (crit) HIT.crit = true;
    if (e.boss) HIT.boss = true;
    if (killed) HIT.kill++;
  }
  return killed;
}

// 円の中の敵にダメージ。壁の向こうには届かない(los)。倒した数を返す
const _list = [];
export function area(x, z, r, dmg, force, cause, falloff = true, los = true) {
  Zombies.queryCircle(x, z, r, _list);
  let kills = 0;
  for (let i = 0; i < _list.length; i++) {
    const e = _list[i];
    const dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    if (los && d > 1.2 && World.segmentHit(x, z, e.x, e.z, LOW) < 0.97) continue;
    const f = falloff ? Math.max(0.4, 1 - d / (r + e.r)) : 1;
    if (hurt(e, dmg * f, dx / d, dz / d, force * (0.55 + 0.45 * f), cause)) kills++;
  }
  return kills;
}

// 扇の形(炎・冷凍)の中の敵を集める
export function cone(x, z, dirX, dirZ, range, cosMin, out) {
  Zombies.queryCircle(x, z, range, out);
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    const e = out[i];
    const dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    if (d > 1.5 && (dx * dirX + dz * dirZ) / d < cosMin) continue;
    if (d > 1.5 && World.segmentHit(x, z, e.x, e.z, LOW) < 0.97) continue;
    out[n++] = e;
  }
  out.length = n;
  return out;
}

// テスト係A: こわせる物(車・ガラス・ドラム缶 …)への 弾の当たり。
// 弾は LOW より低い物(車など)を segmentHit では こえてしまうので、通り道で いちばん手前の物に ダメージを入れる。
// 当たった所の割合 0..1(なければ 1)。弾は止めない(後ろのゾンビにも当たる)
export function propLine(x0, z0, x1, z1, amount, cause) {
  return World.hitLine ? World.hitLine(x0, z0, x1, z1, amount, { cause }) : 1;
}
// 線の上の物 ぜんぶ(レールガンなど つらぬく光): step m ごとに 小さな円で ダメージ
export function propRay(x0, z0, x1, z1, amount, cause, step = 3, r = 1.1) {
  if (!World.damage) return;
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
  for (let i = 1; i <= n; i++) { const t = i / n; World.damage(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r, amount, { cause }); }
}

// 爆発(見た目 + ダメージ + 知らせ)
export function explode(x, z, radius, dmg, force, kind = 'fire', weapon = '') {
  FX.explosion(x, z, radius, kind);
  const k = area(x, z, radius, dmg, force, 'explosion', true, true);
  // こわせる物(車・ドラム缶・ガラス …)。マップ係が作る
  if (World.damage) World.damage(x, z, radius, dmg, { cause: 'explosion' });
  if (radius >= 7 || k >= 6) Engine.hitStop(0.035);
  Events.emit('explosion', { x, z, radius, weapon, kills: k });
  return k;
}
