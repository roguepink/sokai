#!/usr/bin/env python3
"""指で さわって、武器まわりのボタンが 本当に きくかを確かめる(主人公と武器 UI の係)。画面なし・音なし。

  ~/.local/venvs/ryokoshi/bin/python3 tools/ui5_touch.py [--size 844x390]

  ▶ ◀(次・前の武器)/ 武器の列のマス / 「全部」→ 一覧のマス / ダッシュ / 回転斬り / 視点 / 一時停止 を、本物の指のタップで押して、
  ゲームの中の数字(今の武器・視点・状態)が 変わったかを見る。○ / × で出す
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", default="844x390")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    handler = functools.partial(NoCache, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    bad = 0
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        w, h = (int(x) for x in a.size.split("x"))
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path=CHROME, headless=True,
                                   args=["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, has_touch=True, is_mobile=True)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
            page.goto(f"http://127.0.0.1:{port}/index.html#play&auto")
            page.wait_for_timeout(2500)
            page.evaluate("__game.Input.auto = false; 1")       # 自動操作を止める(武器が 勝手に変わらないように)
            page.wait_for_timeout(300)
            ev = page.evaluate
            idx = lambda: ev("__game.Weapons.index")

            def tap(sel, wait=350):
                r = ev("""(sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
                         const x = r.left + r.width / 2, y = r.top + r.height / 2, t = document.elementFromPoint(x, y);
                         return { x, y, hit: !!t && (t === e || e.contains(t)) }; }""", sel)
                if not r:
                    return None
                page.touchscreen.tap(r["x"], r["y"])
                page.wait_for_timeout(wait)
                return r

            def check(name, ok, note=""):
                nonlocal bad
                bad += 0 if ok else 1
                print(("○ " if ok else "× ") + name + (f"  ({note})" if note else ""))

            i0 = idx()
            r = tap(".btn-next"); i1 = idx()
            check("▶ 次の武器", i1 == (i0 + 1) % 31 and r and r["hit"], f"{i0} → {i1}")
            r = tap(".btn-prev"); i2 = idx()
            check("◀ 前の武器", i2 == i0 and r and r["hit"], f"{i1} → {i2}")
            r = tap("#weaponBar .wbtn:nth-child(3)"); i3 = idx()
            check("武器の列の 2 つ目のマス", i3 == 1 and r and r["hit"], f"→ {i3}")
            pop = ev("document.getElementById('wpop').classList.contains('on') && document.getElementById('wpopName').textContent")
            check("武器が変わった表示が出る", bool(pop), str(pop))
            tap("#weaponBar .wbtn.wall")
            check("「全部」で 一覧が開く", ev("__game.WeaponGrid.open") is True)
            ev("document.querySelector('.wg-item[data-i=\"20\"]').scrollIntoView({ block: 'center' }); 1")
            tap('.wg-item[data-i="20"]'); i4 = idx()
            check("一覧のマスで 武器が変わって 閉じる", i4 == 20 and ev("__game.WeaponGrid.open") is False, f"→ {i4}")
            name = ev("document.getElementById('hudWeaponName').textContent")
            check("今の武器の札の名前", name == ev("__game.Weapons.current.name"), name)
            tap(".btn-dash", 60)
            check("ダッシュ", ev("__game.Player.moves.dashing || __game.Player.moves.dashCool > 0") is True)
            page.wait_for_timeout(700)
            tap(".btn-spin", 80)
            check("回転斬り", ev("__game.Weapons.spinReady < 0.9") is True)
            v0 = ev("__game.Engine.viewMode"); tap(".btn-view", 500); v1 = ev("__game.Engine.viewMode")
            check("視点ボタン", v0 != v1, f"{v0} → {v1}")
            tap("#btnPause", 500)
            check("一時停止", ev("__game.Game.state") == "paused", ev("__game.Game.state"))
            print(f"合計: × {bad} / エラー {len(errors)}")
            for e in errors[:20]:
                print("  ", e[:300])
            br.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
