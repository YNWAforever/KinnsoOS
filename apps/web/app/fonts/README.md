# Self-hosted brand fonts

`app/fonts.ts` loads these through `next/font/local`, so `next build` and `next dev`
never fetch from Google Fonts. (Fetching at build time made CI builds fail whenever Google
returned unexpected font CSS.)

| File | Family | Weight axis | License |
| --- | --- | --- | --- |
| `Fraunces-latin-wght.woff2` | Fraunces | 100–900 | `Fraunces-OFL.txt` (SIL OFL 1.1) |
| `Inter-latin-wght.woff2` | Inter | 100–900 | `Inter-OFL.txt` (SIL OFL 1.1) |
| `JetBrainsMono-latin-wght.woff2` | JetBrains Mono | 400–800 | `JetBrainsMono-OFL.txt` (SIL OFL 1.1) |

Each file is the same font Google Fonts served to `next/font/google` (Fraunces v38,
Inter v20, JetBrains Mono v24): Google's `latin` and `latin-ext` subsets merged into one
file, with the same weight range, OpenType features and hinting. Every other axis is
pinned the way the Google Fonts API pins it (Fraunces `opsz` 14, the rest at their
defaults). Glyph outlines and advance widths match Google's files. CJK and Thai text falls
through to the system stacks in `globals.css`, as it did before.

## Rebuilding

`scripts/build-web-fonts.py` regenerates the files. It needs `fonttools` and `brotli`.

1. Put the upstream variable fonts from [google/fonts](https://github.com/google/fonts)
   in one directory: `ofl/fraunces/Fraunces[SOFT,WONK,opsz,wght].ttf`,
   `ofl/inter/Inter[opsz,wght].ttf` and `ofl/jetbrainsmono/JetBrainsMono[wght].ttf`.
2. Put Google's served subsets in another directory, named `<Family>-latin.woff2` and
   `<Family>-latin-ext.woff2` (`Family` is `Fraunces`, `Inter` or `JetBrainsMono`).
   Take the woff2 URLs from the `/* latin */` and `/* latin-ext */` blocks of
   `https://fonts.googleapis.com/css2?family=Fraunces:wght@100..900`,
   `family=Inter:wght@100..900` and `family=JetBrains+Mono:wght@400;500;700`.
3. Run `python scripts/build-web-fonts.py <sources> <subsets> apps/web/app/fonts`.
