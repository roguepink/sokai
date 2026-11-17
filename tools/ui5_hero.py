#!/usr/bin/env python3
"""主人公の確認(主人公と武器 UI の係): 描く回数を数える + 主人公のアップの写真を撮る。画面なし・音なし。

  ~/.local/venvs/ryokoshi/bin/python3 tools/ui5_hero.py [--out _check/ui5/hero] [--weapon 0] [--pose run|idle|aim]

  - 数: meshes = 主人公の部品の数(= 1 コマに描く回数)/ shadow = 影を落とす部品の数(影の分 もう 1 回ずつ描く)/ tris = 三角の数
        手に持った武器(武器係の形)は 数えない。足もとの輪など 主人公の外に置いた物(Player.extras)は 数える
  - 写真: ゲームを止めて、主人公のまわりに カメラを置いて撮る(前ななめ・後ろななめ・見下ろしの大きさ)
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


COUNT = """(() => {
  const P = __game.Player, gm = P.parts.gunMount;
  let n = 0, s = 0, tris = 0;
  const count = (root) => root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (let p = o; p; p = p.parent) if (p === gm) return;
    n++; if (o.castShadow) s++;
    const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  count(P.mesh);
  for (const o of P.extras || []) count(o);
  return JSON.stringify({ meshes: n, shadow: s, draws: n + s, tris: Math.round(tris) });
})()"""

# ゲームのループを止めて、自分のカメラで 1 枚描く。az = 主人公の前から見た角度(度。0 = 正面)、el = 高さの角度、dist = 距離、fov
SHOT = """async ([az, el, dist, fov, ty]) => {
  const G = __game, E = G.Engine, P = G.Player;
  E.shouldRender = () => false;
  await new Promise((r) => setTimeout(r, 60));
  const THREE = await import('./vendor/three/build/three.module.min.js');
  const cam = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.1, 400);
  const a = P.facing + az * Math.PI / 180, e = el * Math.PI / 180;
  const fx = Math.sin(a), fz = -Math.cos(a);
  cam.position.set(P.pos.x + fx * Math.cos(e) * dist, ty + Math.sin(e) * dist, P.pos.z + fz * Math.cos(e) * dist);
  cam.lookAt(P.pos.x, ty, P.pos.z);
  cam.updateMatrixWorld(true);
  P.mesh.visible = true;
  E.renderer.setRenderTarget(null);
  E.renderer.render(E.scene, cam);
  return 1;
}"""

POSES = {
    "run": "__game.Input.auto = true; 1",
    "idle": "__game.Input.auto = false; __game.Input.move.x = 0; __game.Input.move.z = 0; 1",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_check/ui5/hero")
    ap.add_argument("--weapon", type=int, default=0)
    ap.add_argument("--pose", default="run")
    ap.add_argument("--size", default="900x900")
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
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
            page.goto(f"http://127.0.0.1:{port}/index.html#play&auto&q=high")
            page.wait_for_timeout(2500)
            page.evaluate(f"__game.Weapons.select({a.weapon}); 1")
            page.evaluate(POSES.get(a.pose, POSES["run"]))
            page.wait_for_timeout(1800)
            print("数:", page.evaluate(COUNT))
            # HUD を かくして 主人公だけ 見やすく
            page.add_style_tag(content="#hud, #controls, #weaponBar, #crosshair, #fxLayer, .speed-lines, .view-toast, .view-hint, .bs-layer { display: none !important; }")
            for tag, v in (("front", [28, 14, 4.2, 30, 1.05]), ("back", [152, 20, 4.6, 30, 1.05]), ("side", [90, 8, 4.4, 30, 1.05]), ("top", [0.1, 62, 24, 30, 0.6])):
                page.evaluate(SHOT, v)
                page.wait_for_timeout(120)
                page.screenshot(path=f"{out}-{tag}.png")
                print("shot", f"{out}-{tag}.png")
            print("errors/warnings:", len(errors))
            for e in errors[:20]:
                print("  ", e[:300])
            br.close()
        srv.shutdown()


if __name__ == "__main__":
    main()
