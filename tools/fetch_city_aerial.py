"""Fetch a City of Toronto map-service tile mosaic for the block and resample it to an axis-aligned
EPSG:26917 grid. Usage: fetch_tiles.py <service> <zoom> <out.jpg> <metres per pixel>"""
import sys, urllib.request
import numpy as np, cv2
from pyproj import Transformer
svc, z, out, res = sys.argv[1], int(sys.argv[2]), sys.argv[3], float(sys.argv[4])
tm = Transformer.from_crs(26917, 3857, always_xy=True)
E0, N0, E1, N1 = 632295, 4834745, 632715, 4835185
ORIGIN = 20037508.342789244
xs, ys = zip(*[tm.transform(e, n) for e in (E0, E1) for n in (N0, N1)])
size = 2 * ORIGIN / (2 ** z)
tx0, tx1 = int((min(xs) + ORIGIN) // size), int((max(xs) + ORIGIN) // size)
ty0, ty1 = int((ORIGIN - max(ys)) // size), int((ORIGIN - min(ys)) // size)
mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), dtype=np.uint8)
ok = 0
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        url = f'https://gis.toronto.ca/arcgis/rest/services/basemap/{svc}/MapServer/tile/{z}/{ty}/{tx}'
        try:
            data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'buried-lot-check/0.1'}), timeout=30).read()
            tile = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if tile is not None:
                mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = tile; ok += 1
        except Exception as e:
            print('tile fail', ty, tx, str(e)[:50])
W, H = round((E1 - E0) / res), round((N1 - N0) / res)
ee, nn = np.meshgrid(E0 + (np.arange(W) + 0.5) * res, N1 - (np.arange(H) + 0.5) * res)
mx, my = tm.transform(ee, nn)
px = ((mx + ORIGIN) / size * 256 - tx0 * 256).astype(np.float32)
py = ((ORIGIN - my) / size * 256 - ty0 * 256).astype(np.float32)
img = cv2.remap(mosaic, px, py, cv2.INTER_LINEAR)
cv2.imwrite(out, img, [cv2.IMWRITE_JPEG_QUALITY, 88])
print(svc, 'zoom', z, 'tiles', ok, 'of', (ty1 - ty0 + 1) * (tx1 - tx0 + 1), 'out', (W, H), 'metres per tile pixel at this zoom', round(size / 256 * 0.724, 3))
