"""Builds belts.js: animated belt atlases cut from the real game sheets (yellow, red, blue from the install, space belt from the SE graphics mod).
Run from this folder:  python make_belts.py     (needs Pillow; reads runtime/windows/data/base and mods/space-exploration-graphics_*.zip)
Sheet layout (base game, transport-belts.lua): 128 px cells, one row per shape, one column per animation frame, scale 0.5 (64 px per tile).
Rows: 0 E, 1 W, 2 N, 3 S, 4-11 curves (east_to_north ... west_to_south), 12-19 start/end caps.
Each frame is cropped to 96 px (tile + the overhang and shadow the art has) and halved, so one tile = 32 px and one cell = 48 px.
8 of the 16 (yellow) or 32 (red, blue, space) frames are kept: enough for a smooth loop at the page's speed.
The artwork belongs to Wube Software / Space Exploration's authors: for your own offline use, do not redistribute the result."""
import os, io, json, base64, zipfile, glob, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('FSX_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))   # folder holding runtime/ and mods/
BASE = os.path.join(ROOT, 'runtime', 'windows', 'data', 'base', 'graphics', 'entity')
SE_ZIP = glob.glob(os.path.join(ROOT, 'mods', 'space-exploration-graphics_*.zip'))[0]
FMT = (sys.argv[1] if len(sys.argv) > 1 else 'png').lower()
CELL, CROP0, CROP1, KEEP = 48, 16, 112, 8

SHEETS = {   # tier -> (loader, frames in the sheet)
    'transport-belt': (lambda: Image.open(os.path.join(BASE, 'transport-belt', 'transport-belt.png')), 16),
    'fast-transport-belt': (lambda: Image.open(os.path.join(BASE, 'fast-transport-belt', 'fast-transport-belt.png')), 32),
    'express-transport-belt': (lambda: Image.open(os.path.join(BASE, 'express-transport-belt', 'express-transport-belt.png')), 32),
    'se-space-transport-belt': (lambda: Image.open(io.BytesIO(zipfile.ZipFile(SE_ZIP).read(
        'space-exploration-graphics_0.7.5/graphics/entity/space-transport-belt/space-transport-belt.png'))), 32),
}


def atlas(im, frames):
    im = im.convert('RGBA')
    step = frames // KEEP
    out = Image.new('RGBA', (CELL * KEEP, CELL * 20), (0, 0, 0, 0))
    for r in range(20):
        for k in range(KEEP):
            f = im.crop((k * step * 128 + CROP0, r * 128 + CROP0, k * step * 128 + CROP1, r * 128 + CROP1)).resize((CELL, CELL), Image.LANCZOS)
            out.paste(f, (k * CELL, r * CELL))
    return out


def encode(im):
    o = io.BytesIO()
    if FMT == 'webp': im.save(o, 'WEBP', quality=82, method=6, alpha_quality=90)
    else:
        im = im.quantize(colors=200, method=Image.FASTOCTREE, dither=Image.NONE); im.save(o, 'PNG', optimize=True)
    return 'data:image/%s;base64,%s' % ('webp' if FMT == 'webp' else 'png', base64.b64encode(o.getvalue()).decode())


belts = {}
for tier, (load, frames) in SHEETS.items():
    a = atlas(load(), frames)
    belts[tier] = encode(a)
    print(tier, a.size, len(belts[tier]) // 1024, 'KB')
js = 'const BELTS = ' + json.dumps(dict(cell=CELL, frames=KEEP, tile=32, off=8, atlas=belts), separators=(',', ':')) + ';\n'
open(os.path.join(HERE, 'belts.js'), 'w', encoding='utf8').write(js)
print('belts.js', len(js) // 1024, 'KB', FMT)
