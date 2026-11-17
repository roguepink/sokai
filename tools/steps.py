#!/usr/bin/env python3
"""順番どおりに「JS を実行 → 待つ → 写真」をする 確認の道具(画面なし・音なし)。大怪獣の登場などの 短い場面を こま送りで撮る。

  source ~/.local/venvs/ryokoshi/bin/activate
  python3 -u tools/steps.py --size 844x390 --out _check/kj [--hash "play&auto"] [--mobile] -- \
      "js:__game.Engine.setViewMode('tps',0); 1" wait:1 "js:__game.Director.spawnBoss('kaiju', __game.Player.pos.x+10, __game.Player.pos.z-110); 1" \
      wait:0.6 shot:in1 wait:1 shot:in2 "eval:__stats.ms"

  js:<式>    実行する(結果は出さない。最後に ; 1 を つける)
  eval:<式>  実行して 結果を表示
  wait:<秒>  待つ
  shot:<名>  <out>-<名>.png を撮る
"""
import argparse, functools, http.server, socketserver, threading
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
    ap.add_argument("--hash", default="play&auto")
    ap.add_argument("--size", default="844x390")
    ap.add_argument("--out", default="_check/st")
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--cpu", type=float, default=0, help="CPU を 何倍 遅くするか(0 = そのまま)")
    ap.add_argument("steps", nargs="*")
    a = ap.parse_args()

    from playwright.sync_api import sync_playwright

    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(NoCache, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        w, h = (int(x) for x in a.size.split("x"))
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path=CHROME, headless=True,
                                   args=["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"])
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if a.mobile else 1, has_touch=a.mobile, is_mobile=a.mobile)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
            if a.cpu:
                cdp = ctx.new_cdp_session(page)
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
            page.goto(f"http://127.0.0.1:{port}/index.html#{a.hash}")
            page.wait_for_timeout(1500)
            for s in a.steps:
                kind, _, arg = s.partition(":")
                if kind == "js":
                    page.evaluate(arg)
                elif kind == "eval":
                    print("eval:", arg[:60], "=>", page.evaluate(arg))
                elif kind == "wait":
                    page.wait_for_timeout(int(float(arg) * 1000))
                elif kind == "shot":
                    png = f"{out}-{arg}.png"
                    page.screenshot(path=png)
                    print("shot", png)
                else:
                    print("?", s)
            br.close()
        srv.shutdown()
    print("errors/warnings:", len(errors))
    for e in errors[:40]:
        print("  ", e[:400])


if __name__ == "__main__":
    main()
