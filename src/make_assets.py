"""Builds assets.js (icons, entity sprites, floor tiles) and fonts.css for the single-file tool.
Run from this folder:  python make_assets.py   (needs Pillow; reads the local game install, the SE graphics mod and agent-kit/sprites)
The artwork belongs to Wube Software / Space Exploration's authors: this is for your own offline use, do not redistribute the result.
Titillium Web (SIL OFL 1.1) is embedded from the downloaded woff2 files (see FONTS)."""
import os, io, json, base64, zipfile, glob, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('FSX_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..'))   # folder holding runtime/, mods/ and agent-kit/sprites
SPR = os.path.join(ROOT, 'agent-kit', 'sprites')
BASE_ICONS = os.path.join(ROOT, 'runtime', 'windows', 'data', 'base', 'graphics', 'icons')
SE_ZIP = glob.glob(os.path.join(ROOT, 'mods', 'space-exploration-graphics_*.zip'))[0]
FONTS = {400: 'tw400.woff2', 600: 'tw600.woff2', 700: 'tw700.woff2'}
FONT_DIR = sys.argv[1] if len(sys.argv) > 1 else HERE
Z = 20                      # sprite pixels per tile in the preview

b64 = lambda b: base64.b64encode(b).decode()


def png_bytes(im):
    o = io.BytesIO(); im.save(o, 'PNG', optimize=True); return o.getvalue()


def uri(im, q=False):
    if q and im.width * im.height > 500:      # 256-colour + alpha: about a third of the size, fine at preview scale
        im = im.quantize(colors=192, method=Image.FASTOCTREE, dither=Image.NONE)
    return 'data:image/png;base64,' + b64(png_bytes(im))


se = zipfile.ZipFile(SE_ZIP)
se_names = {os.path.basename(n)[:-4]: n for n in se.namelist() if n.endswith('.png') and '/icons/' in n}


def icon(src_base=None, src_se=None, size=40):
    if src_se:
        im = Image.open(io.BytesIO(se.read(se_names[src_se]))).convert('RGBA')
    else:
        im = Image.open(os.path.join(BASE_ICONS, src_base + '.png')).convert('RGBA')
    s = min(im.height, 64)                       # icon_size 64 with a mip chain to the right: take the top-left square
    im = im.crop((0, 0, s, s)).resize((size, size), Image.LANCZOS)
    return uri(im, True)


ICONS = {
    'fuel': dict(src_base='rocket-fuel'), 'section': dict(src_se='cargo-rocket-section'), 'packed': dict(src_se='cargo-rocket-section'),
    'capsule': dict(src_se='space-capsule'), 'liquid': dict(src_se='liquid-rocket-fuel'), 'pad': dict(src_se='rocket-launch-pad'),
    'dock': dict(src_base='cargo-landing-pad'), 'refinery': dict(src_se='fuel-refinery'), 'roboport': dict(src_base='roboport'),
    'bot': dict(src_base='logistic-robot'), 'module': dict(src_base='productivity-module-3'), 'sulfur': dict(src_base='sulfur'),
    'plate': dict(src_base='iron-plate'), 'scaffold': dict(src_se='space-platform-scaffold'),
    'se-holmium-ore': dict(src_se='holmium-ore'), 'se-iridium-ore': dict(src_se='iridium-ore'), 'se-vulcanite': dict(src_se='vulcanite'),
    'se-cryonite': dict(src_se='cryonite'), 'se-beryllium-ore': dict(src_se='beryllium-ore'), 'se-naquium-ore': dict(src_se='naquium-ore'),
    'se-vitamelange': dict(src_se='vitamelange'), 'se-water-ice': dict(src_se='water-ice'), 'se-methane-ice': dict(src_se='methane-ice'),
    'iron-ore': dict(src_base='iron-ore'), 'copper-ore': dict(src_base='copper-ore'), 'coal': dict(src_base='coal'), 'stone': dict(src_base='stone'),
    'uranium-ore': dict(src_base='uranium-ore'), 'se-core-fragment-omni': dict(src_base='stone'), 'item': dict(src_base='iron-plate'),
}
icons = {k: icon(**v) for k, v in ICONS.items()}

# ---- one icon per entity name the generator can place (parts list, tabs): in-game item icons captured by the kit, else the base game's
ENT_NAMES = ['aai-signal-receiver', 'aai-signal-sender', 'aai-storehouse-active-provider', 'aai-warehouse', 'aai-warehouse-passive-provider',
             'aai-warehouse-requester', 'arithmetic-combinator', 'assembling-machine-1', 'assembling-machine-2', 'assembling-machine-3', 'bulk-inserter',
             'cargo-landing-pad', 'chemical-plant', 'constant-combinator', 'decider-combinator', 'display-panel', 'express-transport-belt', 'fast-inserter',
             'fast-transport-belt', 'long-handed-inserter', 'pipe', 'se-fuel-refinery', 'se-rocket-launch-pad', 'se-space-assembling-machine', 'se-space-pipe',
             'se-space-transport-belt', 'small-lamp', 'substation', 'transport-belt', 'zith-storage-tank-5x5', 'roboport', 'requester-chest',
             'passive-provider-chest', 'storage-chest', 'inserter']
ICON_ALIAS = {'aai-warehouse-requester': 'aai-warehouse', 'aai-warehouse-passive-provider': 'aai-warehouse', 'aai-storehouse-active-provider': 'aai-warehouse'}
for n in ENT_NAMES:
    src = ICON_ALIAS.get(n, n)
    for p in (os.path.join(SPR, 'icon_item_%s.png' % src), os.path.join(BASE_ICONS, src + '.png')):
        if os.path.exists(p):
            im = Image.open(p).convert('RGBA'); s = min(im.height, 64)
            icons['e:' + n] = uri(im.crop((0, 0, s, s)).resize((40, 40), Image.LANCZOS), True); break
    else: print('no icon for', n)

# ---- entity sprites: key "name|dir" -> {w,h,ox,oy,d} in tiles (ox, oy relative to the entity's top-left) ----
index = json.load(open(os.path.join(SPR, 'index.json')))
ents = json.load(open(os.path.join(HERE, 'ents.json')))
ALIAS = {'aai-warehouse-requester': 'aai-warehouse', 'aai-warehouse-passive-provider': 'aai-warehouse',
         'assembling-machine-1': 'assembling-machine-3', 'assembling-machine-2': 'assembling-machine-3'}
sprites = {}


imgs = {}


def add_sprite(key, src_key, scale_to=Z):
    e = index.get(src_key)
    if not e: return False
    if src_key not in imgs:
        im = Image.open(os.path.join(SPR, e['file'])).convert('RGBA')
        k = scale_to / e['ppt']
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        imgs[src_key] = dict(w=im.width, h=im.height, d=uri(im, True))
    sprites[key] = dict(i=src_key, ox=e['ox'], oy=e['oy'])
    return True


for ek in ents:
    name, d = ek.split('|')
    if name in ('pipe', 'se-space-pipe') or name.endswith('transport-belt'): continue
    src = ALIAS.get(name, name)
    ok = add_sprite(ek, f'{src}|{d}') or add_sprite(ek, f'{src}|0')
    if not ok: print('no sprite for', ek)
for n in ('pipe', 'se-space-pipe'):
    for m in range(16): add_sprite(f'{n}|m{m}', f'{n}|m{m}')
floors = {}
for f in ('refined-concrete', 'se-space-platform-scaffold'):
    im = Image.open(os.path.join(SPR, index['floor|' + f]['file'])).convert('RGBA')
    im = im.resize((64, 64), Image.LANCZOS)
    floors[f] = dict(s=64, d=uri(im, True))

js = 'const ASSETS = ' + json.dumps(dict(icons=icons, sprites=sprites, imgs=imgs, floors=floors, Z=Z), separators=(',', ':')) + ';\n'
open(os.path.join(HERE, 'assets.js'), 'w', encoding='utf8').write(js)
FONTS = {w: f for w, f in FONTS.items() if os.path.exists(os.path.join(FONT_DIR, f))}   # fonts are optional: without them the page uses the system font
css = ''.join("@font-face{font-family:'Titillium Web';font-style:normal;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}\n"
              % (w, b64(open(os.path.join(FONT_DIR, f), 'rb').read())) for w, f in FONTS.items())
open(os.path.join(HERE, 'fonts.css'), 'w', encoding='utf8').write(css)
print('assets.js', len(js) // 1024, 'KB;', len(icons), 'icons,', len(sprites), 'sprites; fonts.css', len(css) // 1024, 'KB')
