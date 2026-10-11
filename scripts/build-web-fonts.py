"""Rebuild the self-hosted brand fonts in apps/web/app/fonts/.

Usage: python scripts/build-web-fonts.py SRC_DIR REF_DIR OUT_DIR
(requires fonttools and brotli; see apps/web/app/fonts/README.md for the inputs)

The output reproduces what next/font/google used to fetch from Google Fonts for
`subsets: ['latin']`, merged into one woff2 per family:

- SRC_DIR holds the upstream variable TTFs from github.com/google/fonts (ofl/).
- REF_DIR holds the woff2 files Google Fonts serves for the `latin` and `latin-ext`
  subsets (`<Family>-latin.woff2`, `<Family>-latin-ext.woff2`). Their codepoints,
  OpenType features and wght range define the output.
- Every axis except wght is pinned where the Google Fonts API pins it when only wght
  is requested: the font default, except Fraunces opsz=14.
"""
import io
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FAMILIES = {
    'Fraunces': 'Fraunces[SOFT,WONK,opsz,wght].ttf',
    'Inter': 'Inter[opsz,wght].ttf',
    'JetBrainsMono': 'JetBrainsMono[wght].ttf',
}
# Axes the Google Fonts API pins away from the font's own default.
PINNED = {'Fraunces': {'opsz': 14}}


def feature_tags(font):
    return {
        record.FeatureTag
        for table in ('GSUB', 'GPOS') if table in font
        for record in font[table].table.FeatureList.FeatureRecord
    }


def build(src_dir, ref_dir, out_dir, family, source):
    refs = [TTFont(os.path.join(ref_dir, f'{family}-{s}.woff2')) for s in ('latin', 'latin-ext')]
    codepoints = set().union(*(ref.getBestCmap() for ref in refs))
    features = set().union(*(feature_tags(ref) for ref in refs))
    wght = next(a for a in refs[0]['fvar'].axes if a.axisTag == 'wght')

    font = TTFont(os.path.join(src_dir, source))
    limits = {a.axisTag: None for a in font['fvar'].axes if a.axisTag != 'wght'}  # None pins to default
    limits['wght'] = (wght.minValue, wght.defaultValue, wght.maxValue)
    limits.update(PINNED.get(family, {}))
    font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
    # The subsetter needs freshly compiled tables after instancing.
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)

    options = subset.Options()
    options.layout_features = sorted(features)
    options.hinting = True
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)

    font.flavor = 'woff2'
    path = os.path.join(out_dir, f'{family}-latin-wght.woff2')
    font.save(path)
    print(f'{path}: {len(codepoints)} codepoints, wght {wght.minValue:g}-{wght.maxValue:g}, '
          f'{os.path.getsize(path)} bytes')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    for family, source in FAMILIES.items():
        build(*sys.argv[1:4], family, source)
