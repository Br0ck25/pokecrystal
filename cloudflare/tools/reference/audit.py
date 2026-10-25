"""Diff the browser port against the real game. See README.md. Dev-time only; nothing here ships."""
import argparse, json, os, re, subprocess, sys
from pyboy import PyBoy
from PIL import Image, ImageDraw
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--build', required=True, help='scratch repo copy containing pokecrystal.gbc and pokecrystal.sym')
ap.add_argument('--out', required=True)
ap.add_argument('--cases', default=os.path.join(os.path.dirname(__file__), 'cases.json'))
ap.add_argument('--base', default='http://localhost:8765')
ap.add_argument('--quiet', action='store_true', help='print only cases with more than 8 differing 8x8 tiles, plus a total')
ap.add_argument('--threshold', type=int, default=48, help='RGB distance above which a pixel counts as different')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

def map_ids():
    ids, group = {}, 0
    for l in open(os.path.join(REPO, 'constants/map_constants.asm')):
        if re.match(r'\s*newgroup ', l): group += 1; n = 0
        m = re.match(r'\s*map_const (\w+),', l)
        if m: n += 1; ids[m.group(1)] = (group, n)
    return ids

class Ref:
    def __init__(s):
        s.pb = PyBoy(os.path.join(a.build, 'pokecrystal.gbc'), window='null', sound_emulated=False)
        s.pb.set_emulation_speed(0)
        s.sym = {}
        for l in open(os.path.join(a.build, 'pokecrystal.sym')):
            if l.startswith(';') or ':' not in l: continue
            try:
                ba, n = l.split()[:2]; b, ad = ba.split(':'); s.sym[n] = (int(b, 16), int(ad, 16))
            except ValueError: pass
    def key(s, n):
        b, ad = s.sym[n]
        return (b, ad) if 0xD000 <= ad < 0xE000 else ad
    def rd(s, n): return s.pb.memory[s.key(n)]
    def wr(s, n, v): s.pb.memory[s.key(n)] = v
    def tick(s, n=1): s.pb.tick(n, True)
    def shot(s):
        s.pb.tick(1, True); return s.pb.screen.image.convert('RGB')
    def newgame(s):
        s.tick(600)
        for i in range(3000):
            s.pb.button_press('a'); s.tick(2); s.pb.button_release('a'); s.tick(10)
            # reading the screen is what makes input register reliably in PyBoy
            if i % 20 == 0:
                s.shot()
                if (s.rd('wMapGroup'), s.rd('wMapNumber'), s.rd('wXCoord')) == (24, 7, 3): break
        s.tick(120)
        assert s.rd('wMapNumber') == 7, 'new game did not reach PlayersHouse2F'
    def warp_in(s, group, num, warp):
        """Arrive at warp number `warp` (1-based) of map (group,num) exactly as a door does (MAPSETUP_DOOR)."""
        s.wr('wNextMapGroup', group); s.wr('wNextMapNumber', num); s.wr('wNextWarp', warp)
        s.pb.memory[s.key('hMapEntryMethod')] = 0xf5
        s.wr('wMapStatus', 1)                          # MAPSTATUS_ENTER
        s.tick(300)

cases = json.load(open(a.cases))
ids = map_ids()
import io
ref = Ref(); ref.newgame()
clean = io.BytesIO(); ref.pb.save_state(clean)   # each case starts from the same fresh-game state
roms = []
for c in cases:
    clean.seek(0); ref.pb.load_state(clean)
    for var, value in c.get('ram', {}).items(): ref.wr(var, value)   # e.g. {"wElmsLabSceneID": 2} skips the intro cutscene
    group, num = ids[c['id']]
    ref.warp_in(group, num, c['warp'])
    assert (ref.rd('wMapGroup'), ref.rd('wMapNumber')) == (group, num), c
    c['x'], c['y'] = ref.rd('wXCoord'), ref.rd('wYCoord')   # the game's own arrival tile
    roms.append(ref.shot())
json.dump(cases, open(os.path.join(a.out, 'cases.json'), 'w'))
subprocess.run(['node', os.path.join(os.path.dirname(__file__), 'app_shots.cjs'), os.path.join(a.out, 'cases.json'), a.out, a.base], check=True)

total = flagged = 0
for i, c in enumerate(cases):
    rom = roms[i]
    app = Image.open(os.path.join(a.out, f'app_{i}.png')).convert('RGB')
    s = app.width // 160
    app = app.resize((160, 144), Image.NEAREST) if s == 1 else Image.fromarray(np.asarray(app)[s // 2::s, s // 2::s][:144, :160])
    r, p = np.asarray(rom).astype(int), np.asarray(app).astype(int)
    bad = np.sqrt(((r - p) ** 2).sum(axis=2)) > a.threshold
    tiles = bad.reshape(18, 8, 20, 8).sum(axis=(1, 3))
    diff_tiles = [(tx, ty, int(tiles[ty, tx])) for ty in range(18) for tx in range(20) if tiles[ty, tx] > 8]
    overlay = app.copy(); d = ImageDraw.Draw(overlay)
    for tx, ty, _ in diff_tiles: d.rectangle([tx * 8, ty * 8, tx * 8 + 7, ty * 8 + 7], outline=(255, 0, 0))
    sheet = Image.new('RGB', (480, 144)); sheet.paste(rom, (0, 0)); sheet.paste(app, (160, 0)); sheet.paste(overlay, (320, 0))
    name = f"{i:02d}_{c['id']}_warp{c['warp']}_{c['x']}_{c['y']}"
    sheet.resize((1440, 432), Image.NEAREST).save(os.path.join(a.out, name + '.png'))
    total += 1
    if not a.quiet or len(diff_tiles) > 8:
        flagged += 1
        print(f"{name}: differing_pixels={int(bad.sum())}/{160*144} differing_8x8_tiles={len(diff_tiles)}")
print(f'{total} cases, {flagged} listed')
