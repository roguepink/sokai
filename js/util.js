// 小さな道具(数学・乱数など)。three.js に依存しないものだけ。
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
// なめらかに近づける(フレームの速さに左右されない)
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
// 角度の差を -PI..PI に
export const angleDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
export const dampAngle = (a, b, rate, dt) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));

// 決まった並びの乱数(マップを毎回同じ形にするため)
export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// アドレスの印(#play&auto&q=low など)
export const HASH = new Set(location.hash.replace(/^#/, '').split('&').filter(Boolean));
export function hashValue(key) {
  for (const h of HASH) if (h.startsWith(key + '=')) return h.slice(key.length + 1);
  return null;
}
