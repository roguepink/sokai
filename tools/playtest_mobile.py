#!/usr/bin/env python3
"""スマホのふりをして確認する道具(画面係の確認用)。画面なし・音なしの Chrome で動く。

  ~/.local/venvs/ryokoshi/bin/python3 tools/playtest_mobile.py [--scene play|heavy|touch|screens|loop] [--cpu 4] [--q mid]
        [--size 844x390] [--secs 20] [--shots 3] [--out _check/qb/m] [--pc]

  - --cpu N   : CPU を N 倍おそくする(スマホのかわり。4 でだいたいふつうのスマホ)
  - --q       : 画質 low / mid / high(アドレスの q=)
  - --scene
      play    : 自動で遊ばせて、fps を 1 秒ごとに記録(平均・いちばん低い値)
      heavy   : 大群とボスをすぐ出して、はげしい戦いの写真
      touch   : 本物の指のように、左スティックを動かしながら「撃つ」を押しつづける(2本指)・回転斬り・武器の列をタップ
      screens : タイトル → 一時停止 → 設定 → 結果 → もういっかい → タイトル の写真
      loop    : 遊ぶ → 一時停止 → おわる → もういっかい … を 3 回。ゾンビの数・メモリが増えつづけないか
  - --pc      : スマホのふりをしない(キーボードとマウスの確認)
"""
import argparse, functools, http.server, json, socketserver, threading, time
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
    ap.add_argument("--scene", default="play")
    ap.add_argument("--cpu", type=float, default=1)
    ap.add_argument("--q", default="")
    ap.add_argument("--size", default="844x390")
    ap.add_argument("--secs", type=float, default=20)
    ap.add_argument("--shots", type=int, default=3)
    ap.add_argument("--out", default="_check/qb/m")
    ap.add_argument("--pc", action="store_true")
    ap.add_argument("--hash", default="")
    ap.add_argument("--js", default="")
    ap.add_argument("--first", default="", help="起動してすぐに実行する JS")
    a = ap.parse_args()
    mobile = not a.pc

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
                                   args=["--mute-audio", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist",
                                         "--enable-precise-memory-info", "--js-flags=--expose-gc"])
            ua = ("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
                  if mobile else None)
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2.625 if mobile else 1,
                                 has_touch=mobile, is_mobile=mobile, user_agent=ua)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
            cdp = ctx.new_cdp_session(page)
            if a.cpu > 1:
                cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})

            parts = [x for x in a.hash.split("&") if x]
            if a.q:
                parts.append("q=" + a.q)
            if a.scene in ("play", "heavy", "hitch") and "play" not in parts:
                parts = ["play", "auto"] + parts
            url = f"http://127.0.0.1:{port}/index.html" + ("#" + "&".join(parts) if parts else "")
            t0 = time.time()
            page.goto(url)
            page.wait_for_function("window.__stats && window.__stats.state", timeout=60000)
            print(f"boot {time.time() - t0:.1f}s  url={url}")
            if a.first:
                print("first:", page.evaluate(a.first))
            S = Scenes(page, cdp, out, a, w, h)
            getattr(S, a.scene)()
            if a.js:
                print("js:", page.evaluate(a.js))
            br.close()
        srv.shutdown()
    print("errors/warnings:", len(errors))
    for e in errors[:30]:
        print("  ", e[:400])


class Scenes:
    def __init__(self, page, cdp, out, a, w, h):
        self.page, self.cdp, self.out, self.a, self.w, self.h = page, cdp, out, a, w, h
        self.n = 0

    def shot(self, name):
        self.n += 1
        path = f"{self.out}-{self.n}-{name}.png"
        self.page.screenshot(path=path)
        st = self.page.evaluate("JSON.stringify(window.__stats)")
        print(f"shot {path}  {st}")

    def ev(self, js):
        return self.page.evaluate(js)

    def fps_watch(self, secs):
        vals = []
        for _ in range(int(secs)):
            self.page.wait_for_timeout(1000)
            vals.append(self.ev("window.__stats.fps"))
        return vals

    def report_fps(self, vals):
        v = vals[2:] or vals
        info = self.ev("JSON.stringify({q: __game.Engine.quality, dpr: __game.Engine.renderer.getPixelRatio().toFixed(2), z: __stats.zombies})")
        print(f"FPS avg={sum(v) / len(v):.1f} min={min(v)} samples={vals}  {info}")

    # ---- 自動で遊ぶ ----
    def play(self):
        per = self.a.secs / max(1, self.a.shots)
        vals = []
        for i in range(self.a.shots):
            vals += self.fps_watch(per)
            self.shot(f"play{i + 1}")
        self.report_fps(vals)

    # ---- はげしい戦い(大群 + ボス) ----
    def heavy(self):
        self.page.wait_for_timeout(1500)
        self.ev("(() => { const D = __game.Director; D.time = 160; D._nextHorde = 160.2; D._nextBoss = 161; return 1; })()")
        vals = []
        for i in range(self.a.shots):
            vals += self.fps_watch(max(1, self.a.secs / self.a.shots))
            self.shot(f"heavy{i + 1}")
        self.report_fps(vals)

    # ---- はじめての爆発・ボスで 固まらないか(いちばん長い 1 フレームを測る) ----
    def hitch(self):
        page = self.page
        page.wait_for_timeout(2500)
        rec = """window.__ft = []; (function f(t){ if (window.__ftLast) __ft.push(t - __ftLast); window.__ftLast = t; if (__ft.length < 400) requestAnimationFrame(f); })(performance.now());"""
        self.ev(rec)
        page.wait_for_timeout(1500)
        print("normal frames: max %.0fms" % self.ev("Math.max(...__ft)"))
        self.ev("__ft.length = 0")
        self.ev("(() => { const P = __game.Player.pos; __game.FX.explosion(P.x + 4, P.z + 2, 6); return 1; })()")
        page.wait_for_timeout(1200)
        print("first explosion: max %.0fms" % self.ev("Math.max(...__ft)"))
        self.ev("__ft.length = 0")
        self.ev("(() => { const D = __game.Director; D._nextBoss = D.time; return 1; })()")
        page.wait_for_timeout(2500)
        print("first boss: max %.0fms" % self.ev("Math.max(...__ft)"), self.ev("JSON.stringify(__game.Zombies.list.filter(e => e.boss).map(e => e.name))"))
        self.ev("__ft.length = 0")
        for i in range(17):
            self.ev(f"__game.Weapons.select({i})")
            page.wait_for_timeout(250)
        print("all weapons: max %.0fms" % self.ev("Math.max(...__ft)"))
        print("boot timings:", self.ev("JSON.stringify(window.__boot || null)"))

    # ---- 電波なし(一度開いたあと、オフラインで起動できるか)。--hash sw で使う ----
    def offline(self):
        page = self.page
        page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== undefined", timeout=20000)
        page.wait_for_timeout(7000)          # ページが「読みこんだもの一覧」を送るまで待つ(4 秒後)
        n = self.ev("caches.keys().then(async ks => { let n = 0; for (const k of ks) n += (await (await caches.open(k)).keys()).length; return [ks, n]; })")
        print("cached:", n)
        page.context.set_offline(True)
        page.reload()
        page.wait_for_function("window.__stats && window.__stats.state", timeout=30000)
        page.wait_for_timeout(3000)
        print("offline boot state:", self.ev("__stats.state"), "zombies:", self.ev("__stats.zombies"))
        self.shot("offline-title")

    # ---- PC: キーボードとマウス(--pc で使う) ----
    def keys(self):
        page, kb = self.page, self.page.keyboard
        page.wait_for_timeout(1500)
        page.click("#btnPlay", force=True); page.wait_for_timeout(800)
        I = "JSON.stringify({move: __game.Input.move, fire: __game.Input.fire, w: __game.Weapons.index, spin: +__game.Weapons.spinReady.toFixed(2)})"
        kb.down("d"); kb.down("w"); page.wait_for_timeout(300)
        print("D+W:", self.ev(I))
        kb.down(" "); page.wait_for_timeout(300)
        print("+space:", self.ev(I))
        kb.up(" "); kb.up("d"); kb.up("w"); page.wait_for_timeout(200)
        print("released:", self.ev(I))
        kb.press("Shift"); page.wait_for_timeout(200)
        print("shift (spin used, ready drops):", self.ev(I))
        kb.press("3"); page.wait_for_timeout(200); print("key 3:", self.ev(I))
        kb.press("r"); page.wait_for_timeout(200); print("key r:", self.ev(I))
        kb.press("q"); page.wait_for_timeout(200); print("key q:", self.ev(I))
        page.mouse.move(self.w * 0.8, self.h * 0.4); page.mouse.down(); page.wait_for_timeout(300)
        print("mouse down on right side:", self.ev(I))
        page.mouse.up(); page.wait_for_timeout(200)
        print("mouse up:", self.ev(I))
        page.mouse.wheel(0, 120); page.wait_for_timeout(200); print("wheel:", self.ev(I))
        kb.press("Escape"); page.wait_for_timeout(300); print("esc:", self.ev("__stats.state"))
        kb.press("Escape"); page.wait_for_timeout(300); print("esc again:", self.ev("__stats.state"))
        self.shot("pc")

    # ---- 音(聞こえないので 状態だけ見る) ----
    def audio(self):
        page = self.page
        page.wait_for_timeout(3000)
        A = "JSON.stringify({ctx: __game.Audio.ctx ? __game.Audio.ctx.state : null, muted: __game.Audio.muted, gain: __game.Audio.master ? +__game.Audio.master.gain.value.toFixed(2) : null, state: __stats.state})"
        print("title, before any tap:", self.ev(A))
        self.click("#btnPlay"); page.wait_for_timeout(800)
        print("after tapping あそぶ:", self.ev(A))
        self.cdp.send("Emulation.setFocusEmulationEnabled", {"enabled": False})
        self.ev("Object.defineProperty(document, 'hidden', {value: true, configurable: true}); Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(500)
        print("tab hidden:", self.ev(A))
        self.ev("Object.defineProperty(document, 'hidden', {value: false, configurable: true}); Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        page.wait_for_timeout(500)
        print("tab back:", self.ev(A))
        self.click("#btnResume"); page.wait_for_timeout(500)
        print("resume tapped:", self.ev(A))
        self.click("#btnPause"); page.wait_for_timeout(300)
        self.click("#btnPauseSettings"); page.wait_for_timeout(300)
        self.click("#settings [data-set=sound] [data-v=off]"); page.wait_for_timeout(400)
        print("sound off:", self.ev(A))
        self.shot("settings-off")
        self.click("#settings [data-set=sound] [data-v=on]"); page.wait_for_timeout(400)
        print("sound on:", self.ev(A))

    # ---- 指で操作 ----
    def touch(self):
        page, cdp, w, h = self.page, self.cdp, self.w, self.h
        page.wait_for_timeout(800)
        # タイトルの「あそぶ」を指でタップ
        b = self.ev("(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
        self.tap(b[0], b[1])
        page.wait_for_timeout(1500)
        print("state after tap:", self.ev("__stats.state"))
        fire = self.ev("(() => { const r = document.querySelector('.btn-fire').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; })()")
        spin = self.ev("(() => { const r = document.querySelector('.btn-spin').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; })()")
        print("fire btn", fire, "spin btn", spin)
        p0 = self.ev("[__game.Player.pos.x, __game.Player.pos.z]")
        # 1本目: 左のスティック(さわって右上へ動かす)
        sx, sy = w * 0.18, h * 0.65
        touches = [{"x": sx, "y": sy, "id": 1}]
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": touches})
        for k in range(1, 8):
            touches = [{"x": sx + k * 8, "y": sy - k * 5, "id": 1}]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": touches})
            page.wait_for_timeout(16)
        # 2本目: 撃つボタンを押す(スティックはそのまま)
        both = touches + [{"x": fire[0], "y": fire[1], "id": 2}]
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": both})
        st = []
        for k in range(30):
            mv = [{"x": sx + 56 + (k % 5) * 2, "y": sy - 35, "id": 1}, {"x": fire[0] + (k % 3), "y": fire[1], "id": 2}]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": mv})
            page.wait_for_timeout(50)
            if k % 10 == 9:
                st.append(self.ev("JSON.stringify({move: __game.Input.move, fire: __game.Input.fire})"))
        print("while both held:", st)
        self.shot("touch-both")
        # 3本目: 回転斬りをタップ(ほかの2本はそのまま)
        three = mv + [{"x": spin[0], "y": spin[1], "id": 3}]
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": three})
        page.wait_for_timeout(60)
        print("after spin tap (spinReady drops to ~0 if the spin fired):", self.ev("JSON.stringify({spin: __game.Input.spin, ready: __game.Weapons.spinReady, move: __game.Input.move, fire: __game.Input.fire})"))
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [three[2]]})   # 3本目だけ離す(touchEnd に書いた指が離れる)
        page.wait_for_timeout(200)
        print("still both:", self.ev("JSON.stringify({move: __game.Input.move, fire: __game.Input.fire})"))
        # 撃つを離す → スティックだけ
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": [mv[1]]})   # 撃つだけ離す
        page.wait_for_timeout(100)
        print("fire released:", self.ev("JSON.stringify({move: __game.Input.move, fire: __game.Input.fire})"))
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(100)
        p1 = self.ev("[__game.Player.pos.x, __game.Player.pos.z]")
        print("all released:", self.ev("JSON.stringify({move: __game.Input.move, fire: __game.Input.fire})"), "moved", p0, "->", p1)
        # 撃つボタンを先に押して、あとからスティック(逆の順番)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": fire[0], "y": fire[1], "id": 5}]})
        page.wait_for_timeout(50)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": fire[0], "y": fire[1], "id": 5}, {"x": sx, "y": sy, "id": 6}]})
        for k in range(6):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": fire[0], "y": fire[1], "id": 5}, {"x": sx - k * 10, "y": sy, "id": 6}]})
            page.wait_for_timeout(30)
        print("fire first then stick:", self.ev("JSON.stringify({move: __game.Input.move, fire: __game.Input.fire})"))
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(100)
        # 武器の列をタップ
        before = self.ev("__game.Weapons.index")
        wb = self.ev("(() => { const b = document.querySelectorAll('#weaponBar .wbtn'); const r = b[Math.min(b.length - 1, 3)].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; })()")
        self.tap(wb[0], wb[1])
        page.wait_for_timeout(300)
        print(f"weapon tap at {wb}: index {before} -> {self.ev('__game.Weapons.index')}")
        # スティックの場所の右端(画面の 55%)近くで さわっても撃つボタンは盗まれないか
        print("page scroll:", self.ev("JSON.stringify([scrollX, scrollY, document.scrollingElement.scrollTop, visualViewport.scale])"))
        # 一時停止ボタン
        pb = self.ev("(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width]; })()")
        self.tap(pb[0], pb[1])
        page.wait_for_timeout(400)
        print("after pause tap:", self.ev("__stats.state"))
        self.shot("touch-paused")

    def tap(self, x, y):
        self.cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 9}]})
        self.page.wait_for_timeout(60)
        self.cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

    def click(self, sel):
        if self.a.pc:
            self.page.click(sel, force=True)
        else:
            r = self.ev(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }})()")
            self.tap(r[0], r[1])

    # ---- 画面の流れ ----
    def screens(self):
        page = self.page
        page.wait_for_timeout(4000)
        self.shot("title")
        self.click("#btnSettings"); page.wait_for_timeout(500); self.shot("settings")
        self.click("#btnSetBack"); page.wait_for_timeout(300)
        self.click("#btnPlay"); page.wait_for_timeout(500)
        self.ev("__game.Input.auto = true")
        page.wait_for_timeout(max(3000, self.a.secs * 1000))
        self.shot("play")
        self.click("#btnPause"); page.wait_for_timeout(500); self.shot("pause")
        self.click("#btnQuit"); page.wait_for_timeout(2500); self.shot("result")
        self.click("#btnTitle"); page.wait_for_timeout(1500); self.shot("title2")

    # ---- くり返し(もれがないか) ----
    def loop(self):
        page = self.page
        page.wait_for_timeout(2000)
        self.click("#btnPlay")
        page.wait_for_timeout(500)
        # 先に全部の武器を 1 回ずつ出しておく(はじめて出る形の数を、もれと まちがえないように)
        for k in range(20):
            self.ev(f"__game.Weapons.select({k % 17}); __game.Input.fire = true")
            page.wait_for_timeout(250)
        print("after all weapons: geo", self.ev("__game.Engine.renderer.info.memory.geometries"))
        for i in range(max(3, self.a.shots)):
            page.wait_for_timeout(500)
            self.ev("__game.Input.auto = true")
            page.wait_for_timeout(int(self.a.secs * 1000))
            mid = self.ev("JSON.stringify({z: __game.Zombies.count(), kills: __stats.kills})")
            self.click("#btnPause"); page.wait_for_timeout(300)
            self.click("#btnQuit"); page.wait_for_timeout(1800)
            if i == 0:
                self.shot("loop-result")
            self.click("#btnAgain"); page.wait_for_timeout(600)
            try:
                self.ev("window.gc && gc()")
            except Exception:
                pass
            page.wait_for_timeout(300)
            info = self.ev("""JSON.stringify({state: __stats.state, z: __game.Zombies.count(), kills: __stats.kills,
              heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
              geo: __game.Engine.renderer.info.memory.geometries, tex: __game.Engine.renderer.info.memory.textures,
              prog: (__game.Engine.renderer.info.programs || []).length, nodes: document.getElementsByTagName('*').length,
              children: __game.Engine.scene.children.length})""")
            print(f"loop {i + 1}: before-quit {mid}  after-again {info}")
        self.shot("loop-end")


if __name__ == "__main__":
    main()
