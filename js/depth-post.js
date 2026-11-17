// 立体感の係: 画面の仕上げ(ふちを少し暗く = ビネット・色のコントラスト・色のこさ)。
// もともと 最後に 1 回 通している「色の仕上げ」(OutputPass)の中に 数行 足すだけなので、画面全体をなめる回数は 増えない。
// 画質 'low' と、自動で いちばん軽くした段(光のにじみ なし)では 通らない(= 何もしない)。
import * as THREE from '../vendor/three/build/three.module.min.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';

const FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec4 uGrade;      // x = ふちの暗さ, y = コントラスト, z = 色のこさ, w = 暗い所の持ち上げ
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D( tDiffuse, vUv );
  // ふちを暗く(光の量を へらす。まん中は そのまま)
  vec2 q = vUv - 0.5;
  gl_FragColor.rgb *= 1.0 - uGrade.x * smoothstep( 0.07, 0.5, dot( q, q ) );
  #ifdef LINEAR_TONE_MAPPING
    gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
  #elif defined( REINHARD_TONE_MAPPING )
    gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
  #elif defined( CINEON_TONE_MAPPING )
    gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
  #elif defined( ACES_FILMIC_TONE_MAPPING )
    gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
  #elif defined( AGX_TONE_MAPPING )
    gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
  #elif defined( NEUTRAL_TONE_MAPPING )
    gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
  #elif defined( CUSTOM_TONE_MAPPING )
    gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
  #endif
  #ifdef SRGB_TRANSFER
    gl_FragColor = sRGBTransferOETF( gl_FragColor );
  #endif
  // コントラスト(明るい所は明るく・暗い所は暗く。S 字)と 色のこさ。暗い所は w で 少し持ち上げる(夜に つぶれないように)
  vec3 c = clamp( gl_FragColor.rgb, 0.0, 1.0 );
  c = mix( c, c * c * ( 3.0 - 2.0 * c ), uGrade.y );
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  c = mix( vec3( l ), c, uGrade.z );
  c += uGrade.w * ( 1.0 - l ) * ( 1.0 - l );
  gl_FragColor.rgb = c;
}`;

// OutputPass と同じ使い方。pass.grade(Vector4)を 変えると 見た目が変わる
export function makeFinalPass() {
  const pass = new OutputPass();
  pass.grade = new THREE.Vector4(0.34, 0.2, 1.06, 0);
  pass.uniforms.uGrade = { value: pass.grade };
  pass.material.fragmentShader = FS;
  pass.material.name = 'DepthFinal';
  return pass;
}
