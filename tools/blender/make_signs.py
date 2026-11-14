"""Painted-sign textures for the walk test corner. Run with the system Python (needs Pillow and numpy):

    python3 tools/blender/make_signs.py

The words are the plate's own lettering (data/finds.json). The paint, the letterforms and the wear are
imagined: no source shows these signs. Output: assets/walk/textures/signs/*.png (RGBA).
"""
from __future__ import annotations

import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "walk", "textures", "signs")
FONTS = "/System/Library/Fonts/Supplemental"


def font(name: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONTS, name), size, index=index)


def wear(size: tuple[int, int], seed: int, strength: float) -> Image.Image:
    """A soft noise mask, 0..255, used to rub paint away."""
    rng = np.random.default_rng(seed)
    w, h = size
    coarse = rng.random((h // 24 + 2, w // 24 + 2))
    fine = rng.random((h // 4 + 2, w // 4 + 2))
    c = Image.fromarray((coarse * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    f = Image.fromarray((fine * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    m = (np.asarray(c, dtype=float) * 0.65 + np.asarray(f, dtype=float) * 0.35) / 255.0
    m = np.clip((m - (0.5 - strength * 0.5)) / max(strength, 1e-3), 0, 1)
    return Image.fromarray((m * 255).astype("uint8"))


def fit(draw: ImageDraw.ImageDraw, text: str, name: str, index: int, box_w: int, box_h: int) -> ImageFont.FreeTypeFont:
    size = box_h
    while size > 8:
        f = font(name, size, index)
        l, t, r, b = draw.textbbox((0, 0), text, font=f)
        if r - l <= box_w and b - t <= box_h:
            return f
        size -= 2
    return font(name, 8, index)


def painted(lines: list[str], size: tuple[int, int], fname: str, face: tuple[str, int], paint=(226, 214, 186),
            ink=(38, 34, 30), seed=1, band=True, wear_strength=0.55) -> None:
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if band:
        d.rectangle([0, 0, w, h], fill=paint + (255,))
    pad_x, pad_y = int(w * 0.03), int(h * 0.10)
    line_h = (h - pad_y * 2) // len(lines)
    for i, text in enumerate(lines):
        f = fit(d, text, face[0], face[1], w - pad_x * 2, int(line_h * 0.82))
        l, t, r, b = d.textbbox((0, 0), text, font=f)
        x = (w - (r - l)) // 2 - l
        y = pad_y + i * line_h + (line_h - (b - t)) // 2 - t
        d.text((x, y), text, font=f, fill=(ink if band else paint) + (255,))
    # Wear: rub the alpha with noise, a little more toward the bottom, and soften.
    mask = np.asarray(wear(size, seed, wear_strength), dtype=float) / 255.0
    grad = np.linspace(1.0, 0.86, h)[:, None]
    a = np.asarray(img.split()[3], dtype=float) / 255.0
    a = a * (0.80 + 0.20 * mask) * grad
    rgb = np.asarray(img.convert("RGB"), dtype=float)
    stain = np.asarray(wear(size, seed + 7, 0.9), dtype=float)[..., None] / 255.0
    rgb = rgb * (0.82 + 0.18 * stain)
    out = np.dstack([rgb, a * 255]).clip(0, 255).astype("uint8")
    Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(OUT, fname))
    print("wrote", fname, size)


def stone_fascia(text: str, size: tuple[int, int], fname: str) -> None:
    """A stone sign band with dark incised letters (the bank)."""
    w, h = size
    rng = np.random.default_rng(11)
    base = np.full((h, w, 3), (176, 168, 150), dtype=float)
    base *= (0.9 + 0.1 * np.asarray(wear(size, 3, 0.9), dtype=float)[..., None] / 255.0)
    base += rng.normal(0, 3.0, (h, w, 1))
    img = Image.fromarray(base.clip(0, 255).astype("uint8"), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img)
    f = fit(d, text, "Copperplate.ttc", 1, int(w * 0.92), int(h * 0.56))
    l, t, r, b = d.textbbox((0, 0), text, font=f)
    x, y = (w - (r - l)) // 2 - l, (h - (b - t)) // 2 - t
    d.text((x + 2, y + 2), text, font=f, fill=(226, 220, 204, 255))
    d.text((x, y), text, font=f, fill=(34, 31, 28, 255))
    img.save(os.path.join(OUT, fname))
    print("wrote", fname, size)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    random.seed(0)
    stone_fascia("BANK OF NOVA SCOTIA", (2048, 256), "sign_bank.png")
    painted(["HAMILTON CARHARTT MFR. LTD.", "GLOVE & OVERALL FACTORY"], (2048, 512), "sign_carhartt.png",
            ("Rockwell.ttc", 2), seed=5)
    painted(["WM. R. PERRIN & CO. LIMITED", "MACHINE SHOP"], (2048, 512), "sign_perrin.png",
            ("Rockwell.ttc", 2), seed=9)
    painted(["QUEEN ST. E."], (512, 128), "sign_street_queen.png", ("DIN Condensed Bold.ttf", 0),
            paint=(28, 40, 34), ink=(226, 214, 186), seed=2, wear_strength=0.2)
    painted(["RIVER ST."], (512, 128), "sign_street_river.png", ("DIN Condensed Bold.ttf", 0),
            paint=(28, 40, 34), ink=(226, 214, 186), seed=4, wear_strength=0.2)


if __name__ == "__main__":
    main()
