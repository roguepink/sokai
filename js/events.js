// 部品どうしの連絡帳(イベント)。送る側は相手を知らなくてよい。
// 主なイベント名と中身は CLAUDE.md の「イベント」を参照。
const handlers = new Map();

export const Events = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
    return () => Events.off(name, fn);
  },
  off(name, fn) {
    const list = handlers.get(name);
    if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
  },
  emit(name, data) {
    const list = handlers.get(name);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { console.error('[event ' + name + ']', e); }
    }
  },
};
