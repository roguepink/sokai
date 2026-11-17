#!/usr/bin/env python3
"""前と後を ならべた画像を作る(持ち主に見せる用)。写真は 先に ui5_check.py / ui5_hero.py で撮っておく。

  ~/.local/venvs/ryokoshi/bin/python3 tools/ui5_compare.py <直す前のコードの置き場> [--out _check/ui5/compare]

  - <直す前のコードの置き場>/_check/ui5/ に 同じ名前の写真(直す前)、このフォルダの _check/ui5/ に 直した後の写真
  - できるもの: <out>-1-sumaho.png(スマホ横)/ -2-pc.png(パソコン)/ -3-ichiran.png(武器の一覧)/ -4-buki.png(武器の列・切りかえ)/ -5-shujinkou.png(主人公)
"""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
BG = (18, 20, 28)


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except Exception:
        return ImageFont.load_default()


def label(img, text, color):
    """左上に「前」「後」の札"""
    d = ImageDraw.Draw(img)
    f = font(max(20, img.width // 34))
    w = d.textlength(text, font=f)
    pad = f.size // 2
    d.rounded_rectangle([10, 10, 10 + w + pad * 2, 10 + f.size + pad * 1.4], radius=10, fill=color)
    d.text((10 + pad, 10 + pad * 0.5), text, font=f, fill=(255, 255, 255))
    return img


def fit(img, w):
    return img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)


def stack(pairs, out, title, w=1400, cols=1):
    """pairs = [(前の画像, 後の画像), ...] を 上下(前 → 後)に ならべる"""
    tiles = []
    for b, a in pairs:
        tiles.append(label(fit(b.convert("RGB"), w), "前", (120, 124, 136)))
        tiles.append(label(fit(a.convert("RGB"), w), "後", (226, 74, 36)))
    f = font(34)
    gap, head = 14, 64
    H = head + sum(t.height + gap for t in tiles)
    cv = Image.new("RGB", (w + gap * 2, H), BG)
    ImageDraw.Draw(cv).text((gap, 14), title, font=f, fill=(255, 255, 255))
    y = head
    for t in tiles:
        cv.paste(t, (gap, y))
        y += t.height + gap
    cv.save(out)
    print(out, cv.size)


def grid(rows, out, title, cell=520):
    """rows = [(札, 色, [画像, ...]), ...] を 行ごとに 横に ならべる"""
    f = font(34)
    gap, head = 14, 64
    n = max(len(r[2]) for r in rows)
    tiles = [[label(fit(im.convert("RGB"), cell), name, col) if i == 0 else fit(im.convert("RGB"), cell) for i, im in enumerate(ims)] for name, col, ims in rows]
    H = head + sum(max(t.height for t in row) + gap for row in tiles)
    cv = Image.new("RGB", (gap + n * (cell + gap), H), BG)
    ImageDraw.Draw(cv).text((gap, 14), title, font=f, fill=(255, 255, 255))
    y = head
    for row in tiles:
        x = gap
        for t in row:
            cv.paste(t, (x, y))
            x += cell + gap
        y += max(t.height for t in row) + gap
    cv.save(out)
    print(out, cv.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--out", default="_check/ui5/compare")
    a = ap.parse_args()
    B = Path(a.base) / "_check/ui5"
    A = ROOT / "_check/ui5"
    out = str(ROOT / a.out)
    op = lambda p: Image.open(p)
    GRAY, RED = (120, 124, 136), (226, 74, 36)

    stack([(op(B / "844x390m-top.png"), op(A / "844x390m-top.png"))], f"{out}-1-sumaho.png", "スマホ(横向き)の画面")
    stack([(op(B / "1280x720pc-top.png"), op(A / "1280x720pc-top.png"))], f"{out}-2-pc.png", "パソコンの画面(キーの案内が 重ならない)")
    stack([(op(B / "844x390m-grid.png"), op(A / "844x390m-grid.png"))], f"{out}-3-ichiran.png", "武器の一覧(絵文字 → 本物の武器の形。色 = 種類)")
    # 武器の列(右上)と 切りかえの表示: 大きく切り出す
    crop = lambda im, box: im.crop(tuple(round(v * im.width / 844) for v in box))
    bw, aw = op(B / "844x390m-wpop.png"), op(A / "844x390m-wpop.png")
    grid([("前", GRAY, [crop(bw, (540, 0, 844, 130)), crop(bw, (500, 130, 844, 390))]),
          ("後", RED, [crop(aw, (540, 0, 844, 130)), crop(aw, (180, 130, 844, 390))])],
         f"{out}-4-buki.png", "武器の列・今の武器の札・武器が変わったときの表示", cell=900)
    # 主人公
    hb = [op(B / f"hero-{t}.png") for t in ("front", "back", "top")]
    ha = [op(A / f"hero-after-{t}.png") for t in ("front", "back", "top")]
    grid([("前", GRAY, hb), ("後", RED, ha)], f"{out}-5-shujinkou.png", "主人公(前から・後ろから・見下ろし)")


if __name__ == "__main__":
    main()
