// キャラ係: ゾンビの動き(関節の角度を毎フレーム計算する)。
// 関節: 0 腰 1 胴 2 頭 3 左肩 4 右肩 5 左ひじ 6 右ひじ 7 左股 8 右股 9 左ひざ 10 右ひざ。各 (x, y, z) の回転。
// x が + で 腕・脚は前へ上がる / 胴・頭は後ろへそる。z が + で 先が右(+x)へ。
// ルート(腰)の 高さのずれ ay・前後の傾き ap・左右の傾き ar も ここで決める。
export const J = { PELVIS: 0, TORSO: 1, HEAD: 2, SHL: 3, SHR: 4, ELL: 5, ELR: 6, HIPL: 7, HIPR: 8, KNL: 9, KNR: 10 };
export const NJ = 11;
export const HIP_H = 0.975;     // 立っているときの 腰の高さ(体の大きさ 1 のとき)

const sin = Math.sin, cos = Math.cos, max = Math.max, min = Math.min, abs = Math.abs;
const set = (P, j, x, y, z) => { P[j * 3] = x; P[j * 3 + 1] = y; P[j * 3 + 2] = z; };
const lerp = (a, b, t) => a + (b - a) * t;

// 生きているゾンビの姿勢。B.pose に入れる。B.ay/ap/ar も決める
export function poseAlive(e, B) {
  const P = B.pose, t = e.t, sd = e.seed, k = min(1.2, e.spd / (e.def.speed * 0.6 + 0.01));
  const ph = e.ph, s = sin(ph), c = cos(ph);
  B.ay = 0; B.ap = 0; B.ar = 0;
  const anim = e.def.anim;
  if (anim === 'run') run(e, P, B, s, c, k, t, sd);
  else if (anim === 'brute') brute(e, P, B, s, c, k, t, sd);
  else if (anim === 'crawl') crawl(e, P, B, s, c, k, t, sd);
  else walk(e, P, B, s, c, k, t, sd, anim === 'bloat');

  // --- 共通の上がき ---
  // 攻撃(腕をふり上げて たたきつける)
  if (e.atk > 0 && anim !== 'crawl') {
    const a = 1 - e.atk;
    const j = e.atkArm ? J.SHR : J.SHL, je = e.atkArm ? J.ELR : J.ELL, sg = e.atkArm ? 1 : -1;
    let x;
    if (a < 0.4) x = lerp(P[j * 3], 2.8, a / 0.4);
    else x = lerp(2.8, 0.5, min(1, (a - 0.4) / 0.35));
    P[j * 3] = x; P[j * 3 + 2] = sg * (0.25 - 0.45 * max(0, a - 0.4));
    P[je * 3] = a < 0.4 ? 0.9 : 0.2;
    P[J.TORSO * 3] -= 0.35 * sin(min(1, a * 1.3) * Math.PI);
    P[J.TORSO * 3 + 1] += sg * 0.3 * sin(a * Math.PI);
    P[J.HEAD * 3] += 0.3 * sin(a * Math.PI);
  }
  // 当たった(のけぞる)
  const f = e.flinch;
  if (f > 0) {
    P[J.TORSO * 3] += 0.6 * f; P[J.HEAD * 3] += 0.55 * f;
    P[J.SHL * 3] -= 0.6 * f; P[J.SHR * 3] -= 0.6 * f;
    P[J.SHL * 3 + 2] -= 0.4 * f; P[J.SHR * 3 + 2] += 0.4 * f;
    P[J.TORSO * 3 + 2] += e.flinchSide * 0.3 * f;
    B.ay -= 0.04 * f;
  }
  // ひるみ(よろける)
  if (e.stun > 0) {
    const w = min(1, e.stun * 4);
    P[J.TORSO * 3 + 2] += 0.22 * sin(t * 9 + sd) * w;
    P[J.HEAD * 3 + 2] += 0.4 * sin(t * 7 + sd) * w;
    P[J.KNL * 3] -= 0.3 * w; P[J.KNR * 3] -= 0.3 * w; B.ay -= 0.05 * w;
  }
  // 燃えている(腕をふりまわす)
  if (e.burn > 0 && anim !== 'crawl') {
    for (let i = 0; i < 2; i++) {
      const j = J.SHL + i, sg = i ? 1 : -1;
      P[j * 3] = 2.3 + 0.7 * sin(t * 11 + i * 2.1);
      P[j * 3 + 2] = sg * (0.45 + 0.35 * sin(t * 9 + i));
      P[(J.ELL + i) * 3] = 0.9 + 0.6 * sin(t * 13 + i);
    }
    P[J.HEAD * 3 + 2] += 0.4 * sin(t * 10);
    P[J.HEAD * 3] += 0.35;
  }
  // しびれ(ガクガク震える)
  if (e.shock > 0) {
    for (let i = 0; i < NJ * 3; i++) P[i] += (Math.random() - 0.5) * 0.5;
    B.ay += (Math.random() - 0.5) * 0.06;
  }
  // 地面から はい出てくる
  if (e.rise > 0) {
    const r = e.rise;
    B.ay -= r * r * 1.7;
    P[J.SHL * 3] = lerp(P[J.SHL * 3], 2.9, r); P[J.SHR * 3] = lerp(P[J.SHR * 3], 2.6, r);
    P[J.TORSO * 3] -= 0.5 * r;
  }
}

function walk(e, P, B, s, c, k, t, sd, bloat) {
  const limp = e.limp, a = 0.45 * min(1, k);
  const hunch = e.hunch;
  // 脚(片足を引きずる)
  set(P, J.HIPL, s * a * (1 - 0.6 * limp), 0, -0.04 - (bloat ? 0.08 : 0));
  set(P, J.HIPR, -s * a, 0, 0.04 + (bloat ? 0.08 : 0));
  set(P, J.KNL, -(0.12 + 0.8 * max(0, c) * (1 - 0.7 * limp)) * min(1, k) - 0.06, 0, 0);
  set(P, J.KNR, -(0.12 + 0.8 * max(0, -c)) * min(1, k) - 0.06, 0, 0);
  // 体の上下・よろめき
  B.ay = -0.07 * abs(s) * min(1, k) - 0.03 * limp * max(0, -c);
  B.ar = (0.05 + 0.08 * limp) * s * min(1, k) + (bloat ? 0.07 * s : 0);
  set(P, J.PELVIS, 0, 0.12 * s * k, -0.05 * s * k);
  set(P, J.TORSO, -(0.16 + 0.22 * hunch) - 0.05 * k, -0.18 * s * k, 0.1 * s * k + 0.1 * e.tilt);
  // 頭がぐらぐら
  set(P, J.HEAD, -0.1 + 0.22 * sin(t * 0.8 + sd), 0.3 * sin(t * 0.43 + sd), 0.32 * sin(t * 0.57 + sd * 2) + 0.25 * e.tilt);
  // 腕(だらんと下げる ⇔ 前へのばす)
  const near = e.dist < 6 ? 1 - e.dist / 6 : 0;
  const rL = min(1, e.reachL + near), rR = min(1, e.reachR + near * 0.7);
  const out = bloat ? 0.45 : 0.1;
  set(P, J.SHL, lerp(-s * 0.32 * k + 0.12, 1.35 + 0.12 * sin(t * 2.3 + sd), rL), 0, lerp(-out, -0.08, rL));
  set(P, J.SHR, lerp(s * 0.32 * k + 0.12, 1.25 + 0.12 * sin(t * 2.1 + sd + 1), rR), 0, lerp(out, 0.1, rR));
  set(P, J.ELL, lerp(0.3, 0.12 + 0.18 * sin(t * 3 + sd), rL), 0, 0);
  set(P, J.ELR, lerp(0.35, 0.2 + 0.18 * sin(t * 2.7 + sd), rR), 0, 0);
}

function run(e, P, B, s, c, k, t, sd) {
  const a = 0.95 * min(1, k);
  set(P, J.HIPL, s * a + 0.15, 0, -0.03);
  set(P, J.HIPR, -s * a + 0.15, 0, 0.03);
  set(P, J.KNL, -(0.3 + 1.4 * max(0, c)) * min(1, k), 0, 0);
  set(P, J.KNR, -(0.3 + 1.4 * max(0, -c)) * min(1, k), 0, 0);
  B.ay = 0.05 * abs(c) * min(1, k) - 0.08;
  B.ar = 0.06 * s;
  set(P, J.PELVIS, 0, 0.18 * s * k, 0);
  set(P, J.TORSO, -0.55 * min(1, k) - 0.1, -0.25 * s * k, 0.05 * s);
  set(P, J.HEAD, 0.35 + 0.12 * sin(t * 13 + sd), 0.15 * sin(t * 5 + sd), 0.2 * sin(t * 3 + sd));
  if (e.reachL > 0.5) {   // 腕を前へ突きだして走る(こわい)
    set(P, J.SHL, 1.5 + 0.35 * sin(t * 9 + sd), 0, -0.1);
    set(P, J.SHR, 1.4 + 0.35 * sin(t * 8.3 + sd), 0, 0.1);
    set(P, J.ELL, 0.2, 0, 0); set(P, J.ELR, 0.25, 0, 0);
  } else {                // 腕をふる
    set(P, J.SHL, -s * 1.0 * k + 0.3, 0, -0.15);
    set(P, J.SHR, s * 1.0 * k + 0.3, 0, 0.15);
    set(P, J.ELL, 1.2 + 0.3 * s, 0, 0); set(P, J.ELR, 1.2 - 0.3 * s, 0, 0);
  }
}

function brute(e, P, B, s, c, k, t, sd) {
  const a = 0.38 * min(1, k);
  set(P, J.HIPL, s * a, 0, -0.14);
  set(P, J.HIPR, -s * a, 0, 0.14);
  set(P, J.KNL, -(0.15 + 0.55 * max(0, c)) * min(1, k) - 0.1, 0, 0);
  set(P, J.KNR, -(0.15 + 0.55 * max(0, -c)) * min(1, k) - 0.1, 0, 0);
  B.ay = -0.06 - 0.1 * Math.pow(abs(s), 0.6) * min(1, k);
  B.ar = 0.1 * s * min(1, k);
  set(P, J.PELVIS, 0, 0.1 * s * k, -0.08 * s * k);
  set(P, J.TORSO, -0.2, -0.12 * s * k, 0.12 * s * k);
  set(P, J.HEAD, 0.2 + 0.1 * sin(t * 0.7 + sd), 0.25 * sin(t * 0.4 + sd), 0.15 * sin(t * 0.5 + sd));
  const near = e.dist < 7 ? 1 - e.dist / 7 : 0;
  set(P, J.SHL, lerp(-s * 0.25 * k + 0.1, 1.3, near), 0, -0.38);
  set(P, J.SHR, lerp(s * 0.25 * k + 0.1, 1.2, near), 0, 0.38);
  set(P, J.ELL, 0.45, 0, 0); set(P, J.ELR, 0.45, 0, 0);
}

function crawl(e, P, B, s, c, k, t, sd) {
  // 体を地面にふせて、腕で はいずる
  B.ap = -1.36;
  B.ay = 0.24 - HIP_H + 0.03 * abs(s);
  B.ar = 0.08 * s;
  set(P, J.PELVIS, 0, 0.1 * s, 0);
  set(P, J.TORSO, 0.08 + 0.05 * c, 0.12 * s, 0.12 * s);
  set(P, J.HEAD, 1.0 + 0.15 * sin(t * 1.3 + sd), 0.25 * sin(t * 0.7 + sd), 0.25 * sin(t * 0.9 + sd));
  set(P, J.SHL, 2.55 + 0.55 * s, 0, -0.35);
  set(P, J.SHR, 2.55 - 0.55 * s, 0, 0.35);
  set(P, J.ELL, 0.35 + 0.6 * max(0, c), 0, 0);
  set(P, J.ELR, 0.35 + 0.6 * max(0, -c), 0, 0);
  set(P, J.HIPL, -0.12 + 0.1 * s, 0, -0.18);
  set(P, J.HIPR, -0.12 - 0.1 * s, 0, 0.18);
  set(P, J.KNL, -0.35 - 0.2 * max(0, s), 0, 0);
  set(P, J.KNR, -0.35 - 0.2 * max(0, -s), 0, 0);
}

// 死体の「力が抜けた」姿勢(ランダム)
export function deadPose(P, rnd = Math.random) {
  const R = (a, b) => a + rnd() * (b - a);
  set(P, J.PELVIS, 0, R(-0.2, 0.2), R(-0.1, 0.1));
  set(P, J.TORSO, R(-0.15, 0.15), R(-0.3, 0.3), R(-0.2, 0.2));
  set(P, J.HEAD, R(-0.5, 0.4), R(-0.9, 0.9), R(-0.6, 0.6));
  for (let i = 0; i < 2; i++) {
    const sg = i ? 1 : -1;
    const up = rnd() < 0.35;
    set(P, J.SHL + i, up ? R(2.4, 3.0) : R(-0.3, 0.4), 0, sg * R(0.25, 1.4));
    set(P, J.ELL + i, R(0.05, 1.3), 0, 0);
    set(P, J.HIPL + i, R(-0.15, 0.45), 0, sg * R(0.05, 0.35));
    set(P, J.KNL + i, -R(0, 0.7), 0, 0);
  }
}
