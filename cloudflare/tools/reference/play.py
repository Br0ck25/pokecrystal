"""Replay the same button script in the real game and in the app and diff the frames at each checkpoint.

  python3 play.py --build DIR --out DIR script.json     (npm run play -- script.json)

script.json: {"steps": [ {"hold": "left", "frames": 40}, {"press": "a"}, {"wait": 60}, {"shot": "label"} ... ]}
`hold` keeps a direction down for N frames, `press` taps a button (3 frames down, 8 up), `wait` idles, `shot` compares.
The game starts at the beginning of a new game (player's room). Timing is frame-for-frame on both sides; allow settle
waits before shots, since the two sides can differ by a few frames of input latency."""
import argparse, io, json, os, subprocess, sys
from PIL import Image
import numpy as np
sys.argv_backup = sys.argv
ap = argparse.ArgumentParser()
ap.add_argument('script'); ap.add_argument('--build', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--base', default='http://localhost:8765'); ap.add_argument('--threshold', type=int, default=48)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
steps = json.load(open(a.script))['steps']
HERE = os.path.dirname(os.path.abspath(__file__))
# reuse the emulator wrapper from audit.py without running its main
src = open(os.path.join(HERE, 'audit.py')).read().split('cases = json.load')[0]
sys.argv = ['x', '--build', a.build, '--out', a.out]
exec(src)
ref = Ref(); ref.newgame()
roms = {}
ids = map_ids()
def event_index(name):
    n = 0
    for l in open(os.path.join(REPO, 'constants/event_flags.asm')):
        m = re.match(r'\s*const (EVENT_\w+)', l)
        if m:
            if m.group(1) == name: return n
            n += 1
        elif re.match(r'\s*const_skip', l): n += 1          # unused flags still take a bit
        elif re.match(r'\s*const_next (\d+)', l): n = int(re.match(r'\s*const_next (\d+)', l).group(1))
    raise KeyError(name)
def set_event(name, on):
    i = event_index(name); addr = ref.key('wEventFlags')
    byte = ref.pb.memory[addr + i // 8] if isinstance(addr, int) else ref.pb.memory[addr[0], addr[1] + i // 8]
    byte = (byte | (1 << (i % 8))) if on else (byte & ~(1 << (i % 8)))
    if isinstance(addr, int): ref.pb.memory[addr + i // 8] = byte
    else: ref.pb.memory[addr[0], addr[1] + i // 8] = byte
BUTTONS = {'left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'}
for s in steps:
    if 'hold' in s:
        ref.pb.button_press(s['hold']); ref.tick(s['frames']); ref.pb.button_release(s['hold'])
    elif 'press' in s:
        ref.pb.button_press(s['press']); ref.tick(3); ref.pb.button_release(s['press']); ref.tick(8)
    elif 'warp' in s:                                  # {"warp": {"id": "ELMS_LAB", "warp": 1, "ram": {...}, "scene": "ElmsLab:2"}}
        c = s['warp']
        for var, value in c.get('ram', {}).items(): ref.wr(var, value)
        for ev in c.get('clear', []): set_event(ev, False)      # event flags, e.g. to show the starter Poké Balls
        for ev in c.get('set', []): set_event(ev, True)
        group, num = ids[c['id']]
        ref.warp_in(group, num, c['warp'], c.get('settle', 300))
        s['enter'] = {'map': c['id'], 'x': ref.rd('wXCoord'), 'y': ref.rd('wYCoord'), 'scene': c.get('scene', ''), 'flags': c.get('set', []), 'clearFlags': c.get('clear', []), 'prevLandmark': c.get('prevLandmark'), 'engine': c.get('engine', []), 'playerId': ref.rd('wPlayerID') << 8 | ref.rd('wPlayerID+1'), 'party': c.get('party', 0), 'items': c.get('items', {}), 'settle': c.get('settle', 0), 'tileAnim': [ref.rd('hTileAnimFrame'), ref.rd('wTileAnimationTimer')]}
    elif 'wait' in s:
        ref.tick(s['wait'])
    elif 'dump' in s:                                  # {"dump": ["wPartyMon1Species", 48]}: print RAM bytes (ROM side only)
        name, n = s['dump']
        print('  dump', name, [ref.pb.memory[ref.key(name + '+' + str(i))] for i in range(n)])
    elif 'shot' in s:
        roms[s['shot']] = ref.shot()
        print(f"  [{s['shot']}] game at ({ref.rd('wXCoord')},{ref.rd('wYCoord')}) facing {ref.rd('wPlayerDirection') >> 2 & 3} landmark prev/cur {ref.rd('wPrevLandmark')}/{ref.rd('wCurLandmark')} sign {ref.rd('wLandmarkSignTimer')}")
json.dump([x for x in steps if 'dump' not in x], open(os.path.join(a.out, 'steps.json'), 'w'))
subprocess.run(['node', os.path.join(HERE, 'play_app.cjs'), os.path.join(a.out, 'steps.json'), a.out, a.base], check=True)
for label, rom in roms.items():
    app = Image.open(os.path.join(a.out, f'play_{label}.png')).convert('RGB')
    s = app.width // 160
    app = Image.fromarray(np.asarray(app)[s // 2::s, s // 2::s][:144, :160])
    bad = np.sqrt(((np.asarray(rom).astype(int) - np.asarray(app).astype(int)) ** 2).sum(axis=2)) > a.threshold
    sheet = Image.new('RGB', (320, 144)); sheet.paste(rom, (0, 0)); sheet.paste(app, (160, 0))
    sheet.resize((960, 432), Image.NEAREST).save(os.path.join(a.out, f'play_{label}_cmp.png'))
    print(f'{label}: differing_pixels={int(bad.sum())}')
