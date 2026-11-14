"""Window textures for the walk test corner. Run with the system Python (Pillow, numpy):

    python3 tools/blender/make_windows.py

Everything here is imagined set dressing: no source shows what was behind these windows.
Output: assets/walk/textures/windows/*.png.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "walk", "textures", "windows")
W, H = 256, 512


def noise(seed: int, w: int, h: int, scale: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    small = rng.random((h // scale + 2, w // scale + 2))
    img = Image.fromarray((small * 255).astype("uint8")).resize((w, h), Image.BICUBIC)
    return np.asarray(img, dtype=float) / 255.0


def save(arr: np.ndarray, name: str, blur: float = 0.8) -> None:
    img = Image.fromarray(arr.clip(0, 255).astype("uint8"), "RGB")
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    img.save(os.path.join(OUT, name))
    print("wrote", name)


def lit_curtains(seed: int, name: str, blind: float) -> None:
    """A lamplit room behind sheer curtains, with a roller blind pulled part way down."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    glow = 0.55 + 0.45 * np.exp(-((x - 0.5) ** 2) / 0.10 - ((y - 0.62) ** 2) / 0.18)
    base = np.stack([255 * glow, 176 * glow, 92 * glow], axis=-1)
    # Sheer curtains: lighter folds at both sides.
    folds = 0.5 + 0.5 * np.sin(x * 46 + noise(seed, W, H, 40) * 3.0)
    side = np.clip((np.abs(x - 0.5) - 0.18) / 0.32, 0, 1)
    curtain = side * (0.55 + 0.45 * folds)
    base = base * (1 - 0.35 * curtain[..., None]) + np.array([255, 226, 180]) * (0.35 * curtain[..., None])
    # Roller blind.
    b = (y < blind).astype(float)
    blind_col = np.array([236, 196, 132]) * (0.82 + 0.10 * noise(seed + 1, W, H, 6)[..., None])
    base = base * (1 - b[..., None]) + blind_col * b[..., None]
    edge = np.exp(-((y - blind) ** 2) / 0.00012)
    base *= (1 - 0.45 * edge)[..., None]
    base *= (0.9 + 0.1 * noise(seed + 2, W, H, 3))[..., None]
    save(base, name)


def lit_factory(seed: int, name: str) -> None:
    """A work floor at night: bare bulbs high up, a warm haze, the dim line of benches below."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    glow = 0.30 + 0.55 * np.exp(-((y - 0.25) ** 2) / 0.09)
    for cx in (0.3, 0.74):
        glow = glow + 0.55 * np.exp(-((x - cx) ** 2) / 0.006 - ((y - 0.17) ** 2) / 0.004)
    base = np.stack([250 * glow, 186 * glow, 100 * glow], axis=-1)
    bench = np.clip((y - 0.70) / 0.06, 0, 1)
    base *= (1 - 0.55 * bench)[..., None]
    base *= (0.9 + 0.1 * noise(seed + 3, W, H, 14))[..., None]
    save(base, name, 1.2)


def dark(seed: int, name: str) -> None:
    """An unlit window: a little sky reflected in the glass, the pale edge of a curtain."""
    y = np.linspace(0, 1, H)[:, None]
    x = np.linspace(0, 1, W)[None, :]
    refl = 0.5 + 0.5 * np.clip(1 - y * 1.2 + (x - 0.5) * 0.5, 0, 1)
    base = np.stack([10 + 14 * refl, 16 + 22 * refl, 20 + 28 * refl], axis=-1)
    side = np.clip((np.abs(x - 0.5) - 0.30) / 0.2, 0, 1)
    base += np.array([24, 24, 22]) * (side * (0.5 + 0.5 * np.sin(x * 50)))[..., None] * 0.6
    base *= (0.85 + 0.15 * noise(seed, W, H, 5))[..., None]
    save(base, name)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    lit_curtains(1, "win_lit_a.png", 0.34)
    lit_curtains(2, "win_lit_b.png", 0.62)
    lit_curtains(3, "win_lit_c.png", 0.96)
    lit_factory(4, "win_lit_factory.png")
    dark(5, "win_dark_a.png")
    dark(6, "win_dark_b.png")


if __name__ == "__main__":
    main()
