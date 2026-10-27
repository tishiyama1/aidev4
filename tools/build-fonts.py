#!/usr/bin/env python3
"""Subset the game's fonts to the characters it actually uses, as woff2, so the app needs no network.

usage:
  python3 tools/build-fonts.py <dir-with-source-ttfs>      # writes petri/fonts/*.woff2
  python3 tools/build-fonts.py --check                     # verify every character in the game's text is covered

Source TTFs (not committed) are named like ShipporiMincho-700.ttf and come from Google Fonts
(OFL licensed). Re-run after adding new Japanese text to the game.
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "petri" / "fonts"
SOURCES = [*(ROOT / "petri").glob("*.html"), *(ROOT / "petri" / "js").glob("*.js"), *(ROOT / "petri").glob("*.css")]

# fonts the game ships: file stem -> role
FONTS = [
    "ShipporiMincho-500", "ShipporiMincho-700", "ShipporiMincho-800",
    "ZenKakuGothicNew-400", "ZenKakuGothicNew-500", "ZenKakuGothicNew-700",
    "DMMono-400", "DMMono-500",
]


def needed_chars() -> str:
    chars = set()
    for p in SOURCES:
        chars.update(p.read_text(encoding="utf-8"))
    # all of ASCII, all kana, common CJK punctuation and full-width forms: cheap insurance for new strings
    chars.update(chr(c) for c in range(0x20, 0x7F))
    chars.update(chr(c) for c in range(0x3000, 0x3100))
    chars.update(chr(c) for c in range(0xFF01, 0xFF5F))
    chars.update("％＋－×↻▶●◎◌★")
    return "".join(sorted(c for c in chars if not c.isspace() or c == " "))


def build(src_dir: pathlib.Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    text = needed_chars()
    print(f"{len(text)} characters")
    for stem in FONTS:
        src = src_dir / f"{stem}.ttf"
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = [1, 2, 3, 4, 6]
        opts.notdef_outline = True
        font = subset.load_font(str(src), opts)
        s = subset.Subsetter(opts)
        s.populate(text=text)
        s.subset(font)
        out = OUT / f"{stem}.woff2"
        subset.save_font(font, str(out), opts)
        print(f"  {out.name}: {out.stat().st_size // 1024} KB")


def check() -> int:
    """Every non-ASCII character in the game's own text must exist in the display fonts."""
    text = set()
    for p in SOURCES:
        text.update(p.read_text(encoding="utf-8"))
    text = {c for c in text if ord(c) > 0x7F and not c.isspace()}
    missing = {}
    for stem in FONTS:
        f = OUT / f"{stem}.woff2"
        if not f.exists():
            print(f"missing font file {f}")
            return 1
        cmap = TTFont(str(f)).getBestCmap()
        # DM Mono carries only Latin; the CJK fonts must carry everything else
        if stem.startswith("DMMono"):
            continue
        lacks = sorted(c for c in text if ord(c) not in cmap)
        if lacks:
            missing[stem] = lacks
    # characters absent from the source font itself fall back to the system font; report them, don't fail
    if missing:
        for stem, lacks in missing.items():
            print(f"{stem}: not in the font, will fall back to the system font: {''.join(lacks)}")
    else:
        print(f"all {len(text)} non-ASCII characters in the game's text are covered")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        sys.exit(check())
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    build(pathlib.Path(sys.argv[1]))
