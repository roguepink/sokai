// ボス図鑑(画面係): ボスの種類ごとに「メダル」(1 回でも倒したら もらえる)と、いちばん速く倒した秒を覚える。
// localStorage 'sokai-bossdex' = { v:1, types: { [type]: { name, kills, best, first } } }
//   best = いちばん速く倒した秒(小数 1 けた)/ first = はじめて倒した日(ミリ秒)
// タイトル・結果の「ボス図鑑 3/7」と、撃破のときの「新しいボスを撃破!」「自己ベスト更新 12.4秒!」に使う。
import { BOSS_TYPES, BOSS_ORDER } from './boss.js';

const KEY = 'sokai-bossdex';

// 種類ごとの 二つ名(登場の名札に出す)と メダルの絵。知らない種類は 共通のもの
export const BOSS_LOOK = {
  tyrant: { title: '大地を砕く巨人', icon: '👹' },
  abomination: { title: '六腕の異形', icon: '🦑' },
  butcher: { title: '血塗れの処刑人', icon: '🔪' },
  crawlerKing: { title: '地を這う屍の王', icon: '🕷️' },
  gorilla: { title: '暴れ狂う怪腕', icon: '🦍' },
  queen: { title: '群れを産む女王', icon: '👑' },
  tank: { title: '鋼鉄の暴走車', icon: '🚚' },
};
const DEFAULT_LOOK = { title: '災厄の巨影', icon: '💀' };
export function bossLook(type, e) {
  const L = BOSS_LOOK[type] || DEFAULT_LOOK;
  // ボス係が 二つ名・絵を持っていれば そちらを使う(e.title / def.title / def.icon)
  const d = (e && e.def) || BOSS_TYPES[type] || {};
  return { title: (e && e.title) || d.title || L.title, icon: d.icon || L.icon };
}

export const BossDex = {
  data: { v: 1, types: {} },
  newThisRun: [],          // このプレイで はじめて倒した種類

  init() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.types) this.data = d; } catch (e) {}
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {} },
  resetRun() { this.newThisRun.length = 0; },

  // 図鑑にのる種類(ボス係が増やしても数えられるように、出る順番 + ボスの印がある種類)
  allTypes() {
    const s = new Set();
    try { for (const t of BOSS_ORDER || []) s.add(t); } catch (e) {}
    try { for (const k of Object.keys(BOSS_TYPES || {})) if (BOSS_TYPES[k] && BOSS_TYPES[k].boss && !BOSS_TYPES[k].noDex) s.add(k); } catch (e) {}
    return [...s];
  },
  get total() { return Math.max(1, this.allTypes().length); },
  get count() { let n = 0; for (const k in this.data.types) if (this.data.types[k].kills > 0) n++; return n; },
  has(type) { const t = this.data.types[type]; return !!(t && t.kills > 0); },
  best(type) { const t = this.data.types[type]; return t && t.best > 0 ? t.best : 0; },

  // 倒した。{ first(はじめて), pb(自己ベスト更新), prevBest } を返す
  record(type, name, time) {
    if (!type) return { first: false, pb: false, prevBest: 0 };
    const T = this.data.types;
    const t = T[type] || (T[type] = { name: '', kills: 0, best: 0, first: 0 });
    const first = !(t.kills > 0);
    const prevBest = t.best || 0;
    const tm = time > 0 ? Math.round(time * 10) / 10 : 0;
    const pb = !first && tm > 0 && (prevBest <= 0 || tm < prevBest);
    t.kills = (t.kills || 0) + 1;
    if (tm > 0 && (prevBest <= 0 || tm < prevBest)) t.best = tm;
    if (first) { t.first = Date.now(); this.newThisRun.push(type); }
    if (name) t.name = String(name).replace(/\s+(II|III|IV|V)$/, '');
    this.save();
    return { first, pb, prevBest };
  },

  // メダルの列(結果画面)。[{type, icon, name, got, isNew, best}]
  medals() {
    return this.allTypes().map((type) => {
      const t = this.data.types[type], d = BOSS_TYPES[type] || {};
      return { type, icon: bossLook(type).icon, name: (t && t.name) || d.name || type, got: !!(t && t.kills > 0), isNew: this.newThisRun.includes(type), best: (t && t.best) || 0 };
    });
  },
};
