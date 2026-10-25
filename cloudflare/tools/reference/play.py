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
BUTTONS = {'left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'}
for s in steps:
    if 'hold' in s:
        ref.pb.button_press(s['hold']); ref.tick(s['frames']); ref.pb.button_release(s['hold'])
    elif 'press' in s:
        ref.pb.button_press(s['press']); ref.tick(3); ref.pb.button_release(s['press']); ref.tick(8)
    elif 'wait' in s:
        ref.tick(s['wait'])
    elif 'shot' in s:
        roms[s['shot']] = ref.shot()
json.dump(steps, open(os.path.join(a.out, 'steps.json'), 'w'))
subprocess.run(['node', os.path.join(HERE, 'play_app.cjs'), os.path.join(a.out, 'steps.json'), a.out, a.base], check=True)
for label, rom in roms.items():
    app = Image.open(os.path.join(a.out, f'play_{label}.png')).convert('RGB')
    s = app.width // 160
    app = Image.fromarray(np.asarray(app)[s // 2::s, s // 2::s][:144, :160])
    bad = np.sqrt(((np.asarray(rom).astype(int) - np.asarray(app).astype(int)) ** 2).sum(axis=2)) > a.threshold
    sheet = Image.new('RGB', (320, 144)); sheet.paste(rom, (0, 0)); sheet.paste(app, (160, 0))
    sheet.resize((960, 432), Image.NEAREST).save(os.path.join(a.out, f'play_{label}_cmp.png'))
    print(f'{label}: differing_pixels={int(bad.sum())}')
