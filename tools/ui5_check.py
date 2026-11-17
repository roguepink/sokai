#!/usr/bin/env python3
"""画面(HUD)の部品が 重なっていないかを、機械で調べる(画面係の確認用)。画面なし・音なしの Chrome で動く。

  ~/.local/venvs/ryokoshi/bin/python3 tools/ui5_check.py --size 844x390 [--mobile] [--out _check/ui5/844] [--only top,tps]

  - 場面: top(見下ろし)/ tps(肩越し)/ fps(一人称)/ wpop(武器を変えた直後)/ bosstop・bosstps・bossfps(ボス戦 + 無双モード)/
          ch(チャレンジの札)/ grid(武器の一覧)
  - 場面ごとに 写真 <out>-<場面>.png を撮り、見えている部品の四角を測って、重なっている組を出す
  - 「いつも出ている部品どうし」の重なり = ×(直す)。「一時的に出る文字」との重なり = △(目で見て判断)
  - --mobile なし = パソコン(キーの案内が出る)。--mobile = スマホ(指)
"""
import argparse, functools, http.server, json, socketserver, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


# いつも出ている部品(重なったら ×)
FIXED = {
    "ミニマップ": "#minimap", "倒した数・時間": ".hud-stats", "チャレンジ": "#hudChallenge", "無双ゲージ": "#hudFever",
    "点数": "#hudScoreBox", "ボスの体力": "#hudBoss", "コンボ": "#hudCombo", "武器の名前": "#hudWeapon", "一時停止": "#btnPause",
    "武器の列": "#weaponBar", "視点ボタン": ".btn-view", "ダッシュ": ".btn-dash", "回転斬り": ".btn-spin", "撃つ": ".btn-fire",
    "前の武器": ".btn-prev", "次の武器": ".btn-next", "次のボスまで": ".bs-chip", "キーの案内": ".keyhint",
}
# 一時的に出るもの(重なったら △)
TEMP = {
    "場所の名前": "#hudZone", "大きな文字": "#banner", "下の1行": "#subBanner", "武器が変わった表示": "#wpop", "視点の名前": "#viewToast",
    "ひとこと": "#viewHint", "ボスの矢印": "#bossArrow", "ボスの名札": ".bs-card", "ごほうび": ".bs-jack", "警報": ".bs-alert", "ハンコ": ".bs-stamp",
}

MEASURE = """([FIXED, TEMP]) => {
  // 点数・コンボの数字は 増えたとき 一瞬だけ ふくらむ(0.2 秒)。測るときは ふつうの大きさで
  for (const id of ['hudScore', 'hudComboN']) { const e = document.getElementById(id); if (e) e.style.transform = 'none'; }
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return null;
    let op = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden') return null;
      op *= parseFloat(s.opacity);
    }
    if (op < 0.12) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  // 字だけの部品は、字の四角で測る(箱が 字より大きいことがあるので)
  const tight = (el) => {
    const r0 = vis(el); if (!r0) return null;
    // 武器の列は まわりの あき(見えない 6px)を のぞいて測る
    if (el.id === 'weaponBar') { const p = parseFloat(getComputedStyle(el).paddingTop) || 0; return { x: r0.x + p, y: r0.y + p, w: r0.w - 2 * p, h: r0.h - 2 * p }; }
    if (el.matches('#banner, #subBanner, #hudScoreBox, #hudCombo, .hud-stats, #hudWeapon, #viewToast')) {
      const rg = document.createRange(); rg.selectNodeContents(el);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const r of rg.getClientRects()) { if (r.width < 1 || r.height < 1) continue; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
      if (x1 > x0) return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    return r0;
  };
  const out = [];
  const add = (map, temp) => { for (const k in map) document.querySelectorAll(map[k]).forEach((el, i) => { const r = tight(el); if (r) out.push({ name: k + (i ? '#' + (i + 1) : ''), temp, el, ...r }); }); };
  add(FIXED, false); add(TEMP, true);
  const W = innerWidth, H = innerHeight, bad = [], off = [];
  let minFont = 99, minFontWho = '';
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    // 点数・コンボは 数字が増えたとき 一瞬ふくらむので、はみ出しは 10px まで見のがす
    const m = /^(点数|コンボ)/.test(a.name) ? 10 : 1;
    if (!a.temp && (a.x < -m || a.y < -m || a.x + a.w > W + m || a.y + a.h > H + m) && !a.name.startsWith('武器の列')) off.push(a.name);
    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1.5 && oy > 1.5) bad.push({ a: a.name, b: b.name, temp: a.temp || b.temp, ox: Math.round(ox), oy: Math.round(oy) });
    }
  }
  // いちばん小さい字(見えている HUD と ボタンの中)
  const roots = ['#hud', '#controls', '#weaponBar'];
  for (const sel of roots) { const root = document.querySelector(sel); if (!root) continue;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement; if (!vis(p) || p.closest('.pop-layer')) continue;
      const fs = parseFloat(getComputedStyle(p).fontSize);
      if (fs < minFont) { minFont = fs; minFontWho = (p.className || p.id || p.tagName) + ':' + n.nodeValue.trim().slice(0, 12); }
    }
  }
  for (const el of document.querySelectorAll('#controls .btn')) { const fs = parseFloat(getComputedStyle(el, '::after').fontSize); const c = getComputedStyle(el, '::after').content; if (c && c !== 'none' && c !== 'normal' && fs < minFont) { minFont = fs; minFontWho = el.className + '::after'; } }
  return { n: out.length, names: out.map((o) => o.name), bad, off, minFont, minFontWho };
}"""

G = "__game"
BOSS = f"(() => {{ const p = {G}.Player.pos; const t = {G}.Director.bossTypes(); {G}.Director.spawnBoss(t[0], p.x + 14, p.z - 6); {G}.Score.fever = 1; {G}.Score.startFever(40); }})(); 1"
SCENES = {
    "top": (f"{G}.Engine.setViewMode('top'); 1", 2500),
    "wpop": (f"{G}.Input.auto = true; {G}.Weapons.select(({G}.Weapons.index + 9) % 31); 1", 260),
    "tps": (f"{G}.Engine.setViewMode('tps', {G}.Player.facing); 1", 2600),
    "fps": (f"{G}.Engine.setViewMode('fps', {G}.Player.facing); 1", 2600),
    "bosstop": (f"{G}.Engine.setViewMode('top'); " + BOSS, 5200),
    "bosstps": (f"{G}.Engine.setViewMode('tps', {G}.Player.facing); 1", 2600),
    "bossfps": (f"{G}.Engine.setViewMode('fps', {G}.Player.facing); 1", 2600),
    "ch": (f"{G}.Engine.setViewMode('top'); {G}.Director.happen('challenge'); 1", 3200),
    "grid": (f"{G}.WeaponGrid.show(); 1", 500),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="844x390")
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--only", default="")
    ap.add_argument("--first", default="", help="始めてすぐに実行する JS")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    out = ROOT / (a.out or f"_check/ui5/{a.size}{'m' if a.mobile else 'pc'}")
    out.parent.mkdir(parents=True, exist_ok=True)
    only = [s for s in a.only.split(",") if s] or list(SCENES)
    handler = functools.partial(NoCache, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    total_x = total_t = 0
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        w, h = (int(x) for x in a.size.split("x"))
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path=CHROME, headless=True,
                                   args=["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if a.mobile else 1,
                                 has_touch=a.mobile, is_mobile=a.mobile)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
            page.goto(f"http://127.0.0.1:{port}/index.html#play&auto")
            page.wait_for_timeout(2500)
            if a.first:
                page.evaluate(a.first)
            print(f"== {a.size} {'スマホ' if a.mobile else 'パソコン'} ==")
            for name in only:
                js, wait = SCENES[name]
                page.evaluate(js)
                page.wait_for_timeout(wait)
                r = page.evaluate(MEASURE, [FIXED, TEMP])
                page.screenshot(path=f"{out}-{name}.png")
                x = [b for b in r["bad"] if not b["temp"]]
                t = [b for b in r["bad"] if b["temp"]]
                total_x += len(x) + len(r["off"])
                total_t += len(t)
                line = f"[{name}] 部品 {r['n']}個 / いちばん小さい字 {r['minFont']}px({r['minFontWho']})"
                line += " / ○ 重なりなし" if not x and not r["off"] else ""
                print(line)
                for b in x:
                    print(f"   × {b['a']} と {b['b']}  ({b['ox']}x{b['oy']}px)")
                for o in r["off"]:
                    print(f"   × 画面の外に出ている: {o}")
                for b in t:
                    print(f"   △ {b['a']} と {b['b']}  ({b['ox']}x{b['oy']}px)")
                if name == "grid":
                    page.evaluate(f"{G}.WeaponGrid.close(); 1")
            print(f"合計: × {total_x} / △ {total_t} / エラー {len(errors)}")
            for e in errors[:20]:
                print("  ", e[:300])
            br.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
