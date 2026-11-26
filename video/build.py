"""Assembles the demo video: motion scenes + site footage (re-timed, with camera moves, call-outs and
captions) + narration + music. Run from video/:  python3 build.py [--preview]

Inputs: frames/{A,G,H}/ (render-motion.mjs), site/act{1,2,3}/ (capture-site.mjs), audio/s1..s8.mp3,
audio/music1.mp3, audio/tx/s*.json (word timings). Output: out/buried-demo.mp4
"""
import bisect, json, math, os, subprocess, sys
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont

FPS = 30
W, H = 1920, 1080
HERE = os.path.dirname(os.path.abspath(__file__))
PREVIEW = '--preview' in sys.argv
os.chdir(HERE)

def load(act):
    return json.load(open(f'site/{act}/frames.json')), json.load(open(f'site/{act}/marks.json'))

F1, M1 = load('act1'); F2, M2 = load('act2'); F3, M3 = load('act3')
T1 = [f['t'] for f in F1]; T2 = [f['t'] for f in F2]; T3 = [f['t'] for f in F3]
def n_frames(scene): return len([f for f in os.listdir(f'frames/{scene}') if f.endswith('.jpg')])
DA, DG, DH = n_frames('A') / FPS, n_frames('G') / FPS, n_frames('H') / FPS

# ---- site pieces: (act, src t0, src t1, out seconds) -------------------------------------------
ACT1 = [('B1', M1['landing'], M1['field'], 5.6), ('B2', M1['field'], M1['dig-start'], 3.6), ('C', M1['dig-start'], M1['reveal'], 7.3),
        ('D', M1['reveal'], M1['compare'], 13.2), ('E1', M1['compare'], M1['photo1939'], 6.2), ('E2', M1['photo1939'], M1['imagined'], 3.3),
        ('E3', M1['imagined'], M1['postcard'], 5.5), ('E4', M1['postcard'], M1['end'] - 1.0, 3.9)]
ACT2 = [('F1', M2['provenance'], M2['notdug'], 6.7), ('F2', M2['notdug'], M2['record'], 3.7), ('F3', M2['record'], M2['end'], 3.6)]
ACT3 = [('H0', M3['landing'], M3['end'], 7.0)]

timeline = []  # (name, start, dur, kind, payload)
t = 0.0
def add(name, dur, kind, payload):
    global t
    timeline.append((name, t, dur, kind, payload)); t += dur
add('A', DA, 'motion', 'A')
for n, a, b, d in ACT1: add(n, d, 'site', ('act1', a, b))
for n, a, b, d in ACT2: add(n, d, 'site', ('act2', a, b))
add('G', DG, 'motion', 'G')
for n, a, b, d in ACT3: add(n, d, 'site', ('act3', a, b))
add('Hcard', DH, 'motion', 'H')
TOTAL = t
S = {name: start for name, start, *_ in timeline}
E = {name: start + dur for name, start, dur, *_ in timeline}
tB, tC, tD, tE, tF, tG, tH, tCard = S['B1'], S['C'], S['D'], S['E1'], S['F1'], S['G'], S['H0'], S['Hcard']

# ---- narration placement -------------------------------------------------------------------------
NARR = [('s1', 1.2), ('s2', tB + 0.7), ('s3', tC + 0.1), ('s4', tD + 1.6), ('s5', tE + 0.3), ('s6', tF + 0.4), ('s7', tG + 1.0), ('s8', tH + 0.2)]
TEXT = {
 's2': "This is Buried. A lot check, read from old fire-insurance plans. Type an address, or pick one that's lit.",
 's3': "The lantern goes down through the plans, year by year. 1935. 1911. And here it is.",
 's4': "Here stood a coal and wood yard, lettered on both plans. Six addresses stand on it today. The stamp comes from code, from the plan's own words, with the scan that proves it.",
 's5': "Drag the divider: the 1911 plan, against a real aerial photograph of today. Switch to the City's photograph from 1939. Or a view imagined from the plan. Clearly marked, and never used as evidence. And a postcard, of how it may have looked.",
 's6': "Buried screens. It doesn't certify. Every record is marked a draft until a person reviews it. Where the plans don't reach, it says: not dug yet. And one button gives you the record, on a single page.",
 's8': "Today it covers one block of Toronto. But every old city has plans like these, waiting to be read.",
}
def word_times(clip):
    d = json.load(open(f'audio/tx/{clip}.json'))
    return [(w['word'].strip(), w['start'], w['end']) for s in d['segments'] for w in s['words']]
def chunks(text, limit=64):
    out, cur = [], ''
    for part in text.replace(': ', ':| ').replace('. ', '.| ').replace(', ', ',| ').split('| '):
        if cur and len(cur) + 1 + len(part) > limit: out.append(cur); cur = part
        else: cur = (cur + ' ' + part).strip()
    if cur: out.append(cur)
    return out
CAPS = []  # (start, end, text)
for clip, at in NARR:
    if clip not in TEXT: continue
    ws = word_times(clip); total = sum(len(w[0]) for w in ws)
    cum, acc = [], 0
    for w in ws: cum.append((acc / total, w[1])); acc += len(w[0])
    cum.append((1.0, ws[-1][2]))
    limit_end = ws[-1][2] if clip != 's8' else 6.9
    def time_at(f):
        for (f0, t0), (f1, t1) in zip(cum, cum[1:]):
            if f <= f1: return t0 + (t1 - t0) * ((f - f0) / max(f1 - f0, 1e-6))
        return cum[-1][1]
    parts = chunks(TEXT[clip]); n = sum(len(p) for p in parts); pos = 0
    full = sum(len(p) for p in chunks(TEXT[clip]))
    scale = (6.9 / ws[-1][2]) if clip == 's8' else 1.0   # s8 captions cover only its first sentences
    for p in parts:
        a = time_at(pos / n * scale); pos += len(p); b = time_at(pos / n * scale)
        CAPS.append((at + a, at + max(b, a + 0.9) + 0.15, p))
# one caption at a time: each ends before the next begins
CAPS.sort()
CAPS = [(a, min(b, CAPS[i + 1][0] - 0.02) if i + 1 < len(CAPS) else b, t) for i, (a, b, t) in enumerate(CAPS)]

CALLOUTS = [
 (tB + 0.9, tB + 5.2, 'LIVE SITE', 'buried.pages.dev'),
 (tD + 2.2, tD + 7.2, 'VERDICT FROM CODE', "the plan's own lettering"),
 (tD + 7.6, tD + 12.6, 'THE PROOF', 'the scan it was read from'),
 (tE + 1.0, tE + 6.0, 'REAL 2025 AERIAL PHOTO', 'City of Toronto open data'),
 (tE + 6.4, tE + 9.3, '1939 AERIAL PHOTO', 'placed approximately'),
 (tE + 9.8, tE + 14.9, 'IMAGINED FROM THE PLAN', 'never used as evidence'),
 (tE + 15.3, tE + 18.7, 'AS IT MAY HAVE LOOKED', 'labelled, not a photograph'),
 (tF + 0.6, tF + 6.4, 'HONEST BY DESIGN', 'a draft until a person reviews it'),
 (tF + 7.0, tF + 10.2, 'NO GUESSING', 'outside the plans, it says so'),
 (tF + 10.7, tF + 13.8, 'ONE-PAGE RECORD', 'print it or share it'),
]

# ---- camera: (t, cx, cy, zoom), eased between keys ----------------------------------------------
FULL = (960, 540, 1.0)
CAM = [(tB, *FULL), (tB + 4.6, *FULL), (tB + 5.8, 560, 770, 1.36), (tC - 0.2, 560, 770, 1.36), (tC + 0.5, *FULL), (tD + 2.4, *FULL),
       (tD + 3.8, 690, 548, 1.30), (tD + 7.4, 690, 548, 1.30), (tD + 8.6, 1370, 548, 1.30), (tD + 12.2, 1370, 548, 1.30), (tE, *FULL), (tE + 0.9, *FULL),
       (tE + 2.0, 690, 600, 1.40), (tE + 14.6, 690, 600, 1.40), (tE + 15.4, *FULL), (E['E4'], *FULL),
       (tF, 680, 700, 1.32), (tF + 6.4, 680, 700, 1.32), (tF + 6.7, 660, 430, 1.25), (tF + 10.2, 660, 430, 1.25), (tF + 10.5, 960, 480, 1.0), (E['F3'], 960, 520, 1.12),
       (tH, *FULL), (E['H0'], 1250, 640, 1.14)]
def ease(x): return 4 * x * x * x if x < 0.5 else 1 - pow(-2 * x + 2, 3) / 2
def cam_at(tt):
    if tt <= CAM[0][0]: return CAM[0][1:]
    for a, b in zip(CAM, CAM[1:]):
        if a[0] <= tt <= b[0]:
            if b[0] - a[0] < 1e-6: return b[1:]
            k = ease((tt - a[0]) / (b[0] - a[0]))
            return tuple(a[i] + (b[i] - a[i]) * k for i in (1, 2, 3))
    return CAM[-1][1:]

# fades to black on the site footage (global time, in/out seconds)
FADES_IN = [(tB, 0.35), (tF, 0.2), (tH, 0.35)]
FADES_OUT = [(E['E4'], 0.2), (E['F3'], 0.3), (E['H0'], 0.3)]
def fade_at(tt):
    k = 1.0
    for a, d in FADES_IN:
        if a <= tt < a + d: k = min(k, (tt - a) / d)
    for b, d in FADES_OUT:
        if b - d < tt <= b: k = min(k, (b - tt) / d)
    return max(0.0, k)

AV = '/System/Library/Fonts/Avenir Next.ttc'
def font(size, bold=True):
    for idx in ((2, 0) if bold else (7, 5, 0)):      # Avenir Next: 0 Bold, 2 Demi Bold, 5 Medium, 7 Regular
        try: return ImageFont.truetype(AV, size, index=idx)
        except Exception: pass
    return ImageFont.load_default()
_fonts = {}
def F(size, bold=True):
    key = (size, bold)
    if key not in _fonts: _fonts[key] = font(size, bold)
    return _fonts[key]

def alpha_window(tt, a, b, d=0.25):
    if tt < a or tt > b: return 0.0
    return max(0.0, min(1.0, (tt - a) / d, (b - tt) / d))

def draw_overlays(im, tt):
    layer = None
    def get():
        nonlocal layer
        if layer is None: layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
        return layer
    for a, b, head, sub in CALLOUTS:
        al = alpha_window(tt, a, b)
        if al <= 0: continue
        d = ImageDraw.Draw(get()); fh, fs = F(30), F(27, False)
        wh = d.textlength(head, font=fh); ws = d.textlength(sub, font=fs)
        x, y, pad = 60, 112 + int((1 - al) * 10), 20
        w = int(wh + ws + pad * 2 + 46)
        d.rectangle([x, y, x + w, y + 62], fill=(18, 23, 21, int(232 * al)))
        d.rectangle([x, y, x + 8, y + 62], fill=(220, 163, 75, int(255 * al)))
        d.text((x + pad + 8, y + 12), head, font=fh, fill=(220, 163, 75, int(255 * al)))
        d.text((x + pad + 8 + wh + 18, y + 14), sub, font=fs, fill=(232, 220, 193, int(255 * al)))
    for a, b, text in CAPS:
        al = alpha_window(tt, a, b, 0.12)
        if al <= 0: continue
        d = ImageDraw.Draw(get()); f = F(38)
        tw = d.textlength(text, font=f); x = (W - tw) / 2; y = 984
        d.rectangle([x - 24, y - 10, x + tw + 24, y + 56], fill=(12, 15, 14, int(205 * al)))
        d.text((x, y), text, font=f, fill=(240, 232, 212, int(255 * al)))
    if layer is not None:
        im.paste(layer, (0, 0), layer)
    return im

def site_source(act, a, b, local, dur):
    frames, times = {'act1': (F1, T1), 'act2': (F2, T2), 'act3': (F3, T3)}[act]
    st = a + (local / dur) * (b - a)
    i = max(0, bisect.bisect_right(times, st) - 1)
    return f'site/{act}/frames/{frames[i]["file"]}'

def job_for(k):
    tt = k / FPS
    for name, start, dur, kind, payload in timeline:
        if start <= tt < start + dur or (name == timeline[-1][0] and tt >= start):
            local = tt - start
            if kind == 'motion':
                idx = min(int(round(local * FPS)), n_frames(payload) - 1)
                return (k, f'frames/{payload}/{idx:05d}.jpg', None, 1.0, tt, False)
            act, a, b = payload
            return (k, site_source(act, a, b, local, dur), cam_at(tt), fade_at(tt), tt, True)
    raise RuntimeError(k)

def process(job):
    k, src, cam, fade, tt, site = job
    dst = f'frames/final/{k:06d}.jpg'
    if not site:
        if os.path.lexists(dst): os.remove(dst)
        os.symlink(os.path.abspath(src), dst)
        return k
    im = Image.open(src).convert('RGB')
    if im.size != (W, H): im = im.resize((W, H), Image.LANCZOS)
    cx, cy, z = cam
    if z > 1.001:
        w, h = W / z, H / z
        x0 = min(max(cx - w / 2, 0), W - w); y0 = min(max(cy - h / 2, 0), H - h)
        im = im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))
    im = draw_overlays(im, tt)
    if fade < 0.999:
        im = Image.eval(im, lambda v, f=fade: int(v * f))
    im.save(dst, quality=93)
    return k

def main():
    total = int(round(TOTAL * FPS))
    print('scenes:', {n: (round(s, 2), round(d, 2)) for n, s, d, *_ in timeline})
    print('total seconds', round(TOTAL, 2), 'frames', total)
    print('narration:', [(c, round(a, 2)) for c, a in NARR])
    os.makedirs('frames/final', exist_ok=True); os.makedirs('out', exist_ok=True)
    if PREVIEW:
        picks = [tB + 2, tB + 8, tC + 4, tD + 5, tD + 10, tE + 4, tE + 8, tE + 12, tE + 17, tF + 3, tF + 8.5, tF + 12.5, tH + 4]
        sheet = Image.new('RGB', (4 * 480, 4 * 270))
        for i, tt in enumerate(picks):
            k = int(tt * FPS); process(job_for(k))
            sheet.paste(Image.open(f'frames/final/{k:06d}.jpg').resize((480, 270)), ((i % 4) * 480, (i // 4) * 270))
        sheet.save('out/preview-sheet.jpg', quality=82); print('wrote out/preview-sheet.jpg'); return
    jobs = [job_for(k) for k in range(total)]
    with Pool(8) as pool:
        for i, _ in enumerate(pool.imap_unordered(process, jobs, chunksize=24)):
            if i % 600 == 0: print('frames', i, flush=True)
    # audio
    inputs, filt, labels = [], [], []
    for i, (clip, at) in enumerate(NARR):
        inputs += ['-i', f'audio/{clip}.mp3']
        filt.append(f'[{i}:a]adelay={int(at * 1000)}:all=1[n{i}]'); labels.append(f'[n{i}]')
    m = len(NARR); inputs += ['-i', 'audio/music1.mp3']
    filt.append(''.join(labels) + f'amix=inputs={m}:normalize=0,apad=whole_dur={TOTAL:.2f},loudnorm=I=-15:TP=-1.5:LRA=7,asplit=2[narr][sc]')
    filt.append(f'[{m}:a]atrim=0:{TOTAL:.2f},afade=t=in:d=1.2,afade=t=out:st={TOTAL - 3.2:.2f}:d=3.2,volume=0.62[mus]')
    filt.append('[mus][sc]sidechaincompress=threshold=0.02:ratio=9:attack=120:release=900[duck]')
    filt.append('[narr][duck]amix=inputs=2:normalize=0,alimiter=limit=0.89[a]')
    cmd = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-framerate', str(FPS), '-i', 'frames/final/%06d.jpg'] + inputs
    # the image sequence is input 0, so shift audio indexes by one
    fc = ';'.join(filt)
    for i in range(m, -1, -1): fc = fc.replace(f'[{i}:a]', f'[{i + 1}:a]')
    cmd += ['-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
            '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{TOTAL:.2f}', 'out/buried-demo.mp4']
    subprocess.run(cmd, check=True)
    print('wrote out/buried-demo.mp4')

if __name__ == '__main__':
    main()
