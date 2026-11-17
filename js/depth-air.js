// 立体感の係: 空気の奥行き(低い所にたまる かすみ)と、ふちの光(リムライト)。
//
// しくみ: three.js の「霧」と「光る色」の部品(ShaderChunk)に 数行を足す。だから ふつうの材質(地面・建物・車・ゾンビ・主人公・ボス)
// ぜんぶに、材質を 1 つずつ直さなくても 効く。描く回数・光の数は 増えない(計算は 1 画素あたり exp を 2 回ていど)。
//  - かすみ: 高さ y が低いほど濃く、遠いほど濃い。見下ろしでは 地面が うっすら かすみ、屋根・木のてっぺん・ゾンビの頭は くっきり
//    → 高い物が 手前に浮き出て見える。肩越し・一人称では 遠くの地面が かすみ、ビルの上のほうは くっきり(近く・中間・遠くの 3 層)
//  - ふちの光: 体の りんかくが 空の色で うっすら光り、地面から浮き出る。つくのは:
//    ・ゾンビ(zombie-models.js が Air.rim(material) を呼ぶ = 印 defines.DEPTH_RIM)
//    ・主人公と ボス(材質の alphaHash = true が 印。player.js と boss-kit.js の mat() が もう入れているので、何もしなくても つく。
//      boss-kit の mat() で作った 新しいボスにも 自動で つく)
//    ほかの物に つけたいときは `Air.rim(material)` を 材質を作ったすぐあと(最初に描く前)に呼ぶ
//  - 値は 全材質で 1 つを共有(Float32Array は three が写しを作らず そのまま渡す)。Sky.apply が 毎回 Air.set で入れる
//
// 入れる順番: Engine.init の最初に Air.install()(どの材質よりも前)。
import * as THREE from '../vendor/three/build/three.module.min.js';

// uDepthAir = (濃さ, 1 / 高さの目安 m, 上限, 0) / uDepthAirC = かすみの色 / uDepthRim = ふちの光の色(rgb)と するどさ
const AIR = new Float32Array([0.016, 1 / 8, 0.6, 0]);
const AIRC = new Float32Array([0.6, 0.66, 0.74, 0]);
const RIM = new Float32Array([0.3, 0.36, 0.45, 3]);

const FOG_PARS_V = `#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogY;
#endif`;
const FOG_V = `#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogY = dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ) + cameraPosition.y;
#endif`;
const FOG_PARS_F = `#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying float vFogY;
	uniform vec4 uDepthAir;
	uniform vec4 uDepthAirC;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
const FOG_F = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	#ifndef DEPTH_NOHAZE
	{
		// 低い所にたまる かすみ: 目から その点までの「空気の濃さ」の平均 × 距離
		float hk = uDepthAir.y;
		float ya = cameraPosition.y * hk, yb = max( vFogY, 0.0 ) * hk, dy = yb - ya;
		float ea = exp( - ya ), eb = exp( - yb );
		float avg = abs( dy ) > 0.02 ? ( ea - eb ) / dy : ea;
		float haze = min( uDepthAir.z, 1.0 - exp( - uDepthAir.x * vFogDepth * avg ) );
		gl_FragColor.rgb = mix( gl_FragColor.rgb, uDepthAirC.rgb, haze );
	}
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
const RIM_F = `
#if defined( DEPTH_RIM ) || defined( USE_ALPHAHASH )
{
	// ふちの光: 目に対して 横を向いた面ほど 光る。上を向いた ふち(頭・肩)を 強く
	float rimV = 1.0 - saturate( dot( normalize( vViewPosition ), normal ) );
	float rimUp = 0.35 + 0.65 * saturate( dot( normal, viewMatrix[ 1 ].xyz ) * 0.6 + 0.5 );
	totalEmissiveRadiance += uDepthRim.rgb * pow( rimV, uDepthRim.w ) * rimUp * ( 0.35 + 0.65 * diffuseColor.rgb );
}
#endif`;

export const Air = {
  installed: false,
  air: AIR, color: AIRC, rimColor: RIM,
  enabled: true,

  // three.js の部品を さしかえる。どの材質よりも前に 1 回だけ
  install() {
    if (this.installed) return;
    this.installed = true;
    const C = THREE.ShaderChunk, L = THREE.ShaderLib;
    if (!C || !L || !C.fog_fragment || C.fog_fragment.indexOf('fogFactor') < 0) { this.enabled = false; return; }   // three の中身が変わっていたら 何もしない
    C.fog_pars_vertex = FOG_PARS_V;
    C.fog_vertex = FOG_V;
    C.fog_pars_fragment = FOG_PARS_F;
    C.fog_fragment = FOG_F;
    C.emissivemap_fragment = C.emissivemap_fragment + RIM_F;
    C.emissivemap_pars_fragment = C.emissivemap_pars_fragment + '\n#if defined( DEPTH_RIM ) || defined( USE_ALPHAHASH )\n\tuniform vec4 uDepthRim;\n#endif';
    for (const k in L) {
      const u = L[k] && L[k].uniforms;
      if (!u || !u.fogColor) continue;
      u.uDepthAir = { value: AIR }; u.uDepthAirC = { value: AIRC }; u.uDepthRim = { value: RIM };
    }
  },

  // かすみ: dens 濃さ(0 = なし)/ r,g,b 色(光の色。画面の色ではない)/ cap 上限。Sky.apply が毎回
  set(dens, r, g, b, cap) { AIR[0] = this.enabled ? dens : 0; AIRC[0] = r; AIRC[1] = g; AIRC[2] = b; if (cap !== undefined) AIR[2] = cap; },
  // ふちの光の色と するどさ(大きいほど ふちだけ)
  setRim(r, g, b, pow) { RIM[0] = r; RIM[1] = g; RIM[2] = b; if (pow !== undefined) RIM[3] = pow; },

  // 材質に ふちの光をつける(MeshStandardMaterial など 光を受ける材質)。最初に描く前に呼ぶ(あとから呼ぶと シェーダーの作り直しで 一瞬 止まる)
  rim(mat) {
    if (!mat || !this.enabled || mat.isMeshBasicMaterial || mat.isShaderMaterial || !('emissive' in mat)) return mat;
    if (mat.defines && mat.defines.DEPTH_RIM !== undefined) return mat;
    mat.defines = Object.assign({}, mat.defines, { DEPTH_RIM: '' });
    mat.needsUpdate = true;
    return mat;
  },
  // 光を足す重ね方(足し算)の材質には かすみを かけない(かすみの色が 足されて 白く浮くので)
  noHaze(mat) {
    if (!mat || mat.isShaderMaterial || (mat.defines && mat.defines.DEPTH_NOHAZE !== undefined)) return mat;
    mat.defines = Object.assign({}, mat.defines, { DEPTH_NOHAZE: '' });
    mat.needsUpdate = true;
    return mat;
  },
  // シーンの中を 1 回 見て回る(最初のコマの前): 足し算の材質 → かすみなし
  scan(root) {
    if (!this.enabled || !root) return;
    root.traverse((o) => {
      const m = o.material; if (!m) return;
      const each = (mt) => {
        if (!mt || mt.isShaderMaterial) return;
        if (mt.fog !== false && mt.blending !== THREE.NormalBlending && mt.blending !== undefined) this.noHaze(mt);
      };
      if (Array.isArray(m)) m.forEach(each); else each(m);
    });
  },
};
