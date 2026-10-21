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

export function hurt(e, dmg, dirX, dirZ, force, cause, crit = false) {
  if (!e.alive) return false;
  const frozen = e.frozen > 0;
  if (frozen) dmg *= 2;
  OPT.dirX = dirX; OPT.dirZ = dirZ; OPT.force = force; OPT.cause = cause; OPT.crit = crit;
  const killed = Zombies.damage(e, dmg, OPT);
  if (killed && frozen) FX.shatter(e.x, 0.6, e.z, (e.def && e.def.scale) || 1);
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

// 爆発(見た目 + ダメージ + 知らせ)
export function explode(x, z, radius, dmg, force, kind = 'fire', weapon = '') {
  FX.explosion(x, z, radius, kind);
  const k = area(x, z, radius, dmg, force, 'explosion', true, true);
  if (radius >= 7 || k >= 6) Engine.hitStop(0.035);
  Events.emit('explosion', { x, z, radius, weapon, kills: k });
  return k;
}
