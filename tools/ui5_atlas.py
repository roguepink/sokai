#!/usr/bin/env python3
"""武器の絵(アイコン)の 1 枚画像を取り出して保存する(確認用)。画面なし・音なし。
  python3 tools/ui5_atlas.py [--out _check/ui5/atlas.png] [--mobile] [--bg "#20242c"]"""
import argparse, base64, functools, http.server, socketserver, threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


JS = """(bg) => { const I = __game.UI.icons; if (!I || !I.canvas) return null;
  const c = document.createElement('canvas'); c.width = I.canvas.width; c.height = I.canvas.height; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height); g.drawImage(I.canvas, 0, 0);
  return { ms: I.ms, t: JSON.stringify({ maxTick: +I.maxTick.toFixed(1), ticks: I.ticks, log: I.log }), url: c.toDataURL('image/png'), w: c.width, h: c.height }; }"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_check/ui5/atlas.png")
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--bg", default="#20242c")
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(NoCache, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler) as srv:
        port = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        with sync_playwright() as p:
            br = p.chromium.launch(executable_path=CHROME, headless=True,
                                   args=["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])
            ctx = br.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=2 if a.mobile else 1,
                                 has_touch=a.mobile, is_mobile=a.mobile)
            page = ctx.new_page()
            errs = []
            page.on("console", lambda m: errs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errs.append(f"[pageerror] {e}"))
            page.goto(f"http://127.0.0.1:{port}/index.html#play&auto")
            page.wait_for_timeout(3000)
            r = page.evaluate(JS, a.bg)
            if not r:
                print("絵は作られていません")
            else:
                out.write_bytes(base64.b64decode(r["url"].split(",")[1]))
                print(f"{out}  {r['w']}x{r['h']}  作る時間 {r['ms']:.1f}ms  内わけ {r['t']}")
            for e in errs[:20]:
                print("  ", e[:300])
            br.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
