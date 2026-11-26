"""Stamp, resize and index the imagined views. Run from the repo root: python3 publish_imagined.py <sites dir>"""
import json, os, sys, shutil, datetime
from PIL import Image, ImageDraw, ImageFont
S = sys.argv[1]
out = 'web/public/lotcheck/imagined/'; keep = '/Volumes/Crucial X9/Active Projects/Buried-Kiroween/archive/lotcheck-imagined-sources/'
os.makedirs(out, exist_ok=True); os.makedirs(keep, exist_ok=True)
sites = json.load(open(S + '/sites.json'))
FONT = '/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf'
PLAN = {'fip_v3_1911_229': ('the 1911 plan', 'about 1911'), 'fip_v3_1935_229': ('the 1931-35 plan', 'about 1935')}
STREET = {  # street view -> (site frame it belongs to, feature ids, caption)
 'coal-yard': ('coal-yard', None, 'The coal and wood yard of J. W. Corson & Co.'),
 'lumber-yard': ('lumber-yard', None, 'The lumber yard of R. Laidlaw & Co. Ltd.'),
 'overall-factory': ('queen-river-corner', ['bld_fip_v3_1911_229_0101'], 'The Glove & Overall Factory of Hamilton Carhartt Mfr. Ltd.'),
 'bank': ('queen-river-corner', ['bld_fip_v3_1911_229_0001'], 'The Bank of Nova Scotia at Queen and River.'),
 'machine-shop': ('machine-shop', None, 'The machine shop of Wm. R. Perrin & Co. Limited.'),
 'cork-factory': ('cork-factory', None, 'The cork factory of the Freyseng Cork Co. Ltd.'),
 'mission-hall': ('mission-hall', None, 'The Baptist Mission Hall.'),
 'street-cleaning-yard': ('street-cleaning-yard', None, 'The City of Toronto street-cleaning yard, Eastern Division.'),
 'knitting-mill': ('knitting-mill', None, 'The knitting mill of Joseph Simpson & Sons.'),
}

def stamp(im: Image.Image) -> Image.Image:
    """Set the word IMAGINED into the lower left corner on a dark plate."""
    im = im.convert('RGB'); d = ImageDraw.Draw(im, 'RGBA')
    size = max(18, im.width // 38); f = ImageFont.truetype(FONT, size)
    text = 'IMAGINED'; l, t, r, b = d.textbbox((0, 0), text, font=f); pad = size // 2
    x0, y1 = pad, im.height - pad; y0 = y1 - (b - t) - pad; x1 = x0 + (r - l) + pad * 2
    d.rectangle([x0, y0, x1, y1], fill=(18, 23, 21, 225), outline=(232, 220, 193, 255), width=max(1, size // 14))
    d.text((x0 + pad - l, y0 + pad // 2 - t), text, font=f, fill=(232, 220, 193, 255))
    return im

index = {'made': datetime.date.today().isoformat(), 'how': 'Made with an image model from the plan crop for each site and a period photograph for detail. Checked by eye against the plan outlines. Illustration, not evidence.', 'views': []}
missing = []
for slug, (site, fids, caption) in STREET.items():
    s = sites[site]; plan, about = PLAN[s['source']]
    entry = {'slug': slug, 'feature_ids': fids or s['feature_ids'], 'plan_source': s['source'], 'plan_name': plan, 'about': about}
    td = f'{S}/{site}-topdown.png'
    if os.path.exists(td):
        shutil.copy(td, f'{keep}{site}-topdown.png')
        im = Image.open(td); im.thumbnail((1100, 1100)); im = stamp(im)
        name = f'{site}-topdown.jpg'; im.save(out + name, quality=80, optimize=True, progressive=True)
        entry['topdown'] = {'file': name, 'bounds': s['bounds'], 'width_px': im.width, 'height_px': im.height}
    else: missing.append(site + ' topdown')
    st = f'{S}/{slug}-street.png'
    if os.path.exists(st):
        shutil.copy(st, f'{keep}{slug}-street.png')
        im = Image.open(st); im.thumbnail((1200, 1200)); im = stamp(im)
        name = f'{slug}-street.jpg'; im.save(out + name, quality=80, optimize=True, progressive=True)
        entry['street'] = {'file': name, 'width_px': im.width, 'height_px': im.height, 'caption': caption}
    else: missing.append(slug + ' street')
    index['views'].append(entry)
json.dump(index, open(out + 'imagined.json', 'w'), indent=1)
tot = sum(os.path.getsize(out + f) for f in os.listdir(out))
print('views', len(index['views']), 'files', len(os.listdir(out)), 'total KB', tot // 1024, 'missing', missing)
