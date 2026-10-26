"""Replay a button script from the title screen in the real game and in the app (?manual=1&intro=1); compare screenshots.
Usage: python3 intro.py --build DIR --out DIR script.json
script: {"steps": [{"press": "a"}, {"hold": "down", "frames": 3}, {"wait": 60}, {"shot": "name"}]}   (dev-time only)"""
import argparse, json, os, subprocess
import numpy as np
from PIL import Image
from pyboy import PyBoy
ap = argparse.ArgumentParser(); ap.add_argument('--build', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--base', default='http://localhost:8765'); ap.add_argument('--threshold', type=int, default=48)
ap.add_argument('--ram'); ap.add_argument('script')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
steps = json.load(open(a.script))['steps']
rom = os.path.join(a.build, 'pokecrystal.gbc')
ram = rom + '.ram'
if a.ram:
    import shutil; shutil.copy(a.ram, ram)
elif os.path.exists(ram): os.remove(ram)
pb = PyBoy(rom, window='null', sound_emulated=False); pb.set_emulation_speed(0)
sym = {}
for l in open(os.path.join(a.build, 'pokecrystal.sym')):
    if l.startswith(';') or ':' not in l: continue
    try: ba, n = l.split()[:2]; b, ad = ba.split(':'); sym[n] = (int(b, 16), int(ad, 16))
    except ValueError: pass
calls = [0]
pb.hook_register(*sym['TitleScreenMain'], lambda _: calls.__setitem__(0, calls[0] + 1), None)
marks = {}
for name in ('Intro_PrepTrainerPic', 'NamePlayer', 'ShrinkPlayer'):
    marks[name] = [0]
    pb.hook_register(*sym[name], (lambda m: lambda _: m.__setitem__(0, m[0] + 1))(marks[name]), None)
while calls[0] < 1: pb.tick(1, True)
shots = {}
for s in steps:
    if s.get('only') == 'app' or 'appUntil' in s: continue
    if 'mashUntil' in s:                    # ROM only: press A through the clock questions the app skips, until a routine has run
        m = marks[s['mashUntil']]
        while m[0] < s.get('count', 1):
            pb.button_press('a'); pb.tick(3, True); pb.screen.image; pb.button_release('a'); pb.tick(37, True)
        continue
    if 'hold' in s: pb.button_press(s['hold']); pb.tick(s['frames'], True); pb.screen.image; pb.button_release(s['hold'])
    elif 'press' in s: pb.button_press(s['press']); pb.tick(3, True); pb.screen.image; pb.button_release(s['press']); pb.tick(8, True)
    elif 'wait' in s: pb.tick(s['wait'], True)
    elif 'shot' in s: pb.tick(1, True); shots[s['shot']] = pb.screen.image.convert('RGB').copy()
json.dump([x for x in steps if x.get('only') != 'rom' and 'mashUntil' not in x], open(os.path.join(a.out, 'intro_steps.json'), 'w'))
here = os.path.dirname(os.path.abspath(__file__))
env = dict(os.environ, BASE=a.base, SAVE=a.ram or '')
subprocess.run(['node', os.path.join(here, 'intro_app.cjs'), os.path.join(a.out, 'intro_steps.json'), a.out, a.base, a.ram or ''], check=True)
for label, romshot in shots.items():
    app = Image.open(os.path.join(a.out, f'intro_{label}.png')).convert('RGB')
    s = app.width // 160
    app = Image.fromarray(np.asarray(app)[s // 2::s, s // 2::s][:144, :160])
    bad = np.sqrt(((np.asarray(romshot).astype(int) - np.asarray(app).astype(int)) ** 2).sum(axis=2)) > a.threshold
    sheet = Image.new('RGB', (320, 144)); sheet.paste(romshot, (0, 0)); sheet.paste(app, (160, 0))
    sheet.resize((960, 432), Image.NEAREST).save(os.path.join(a.out, f'intro_{label}_cmp.png'))
    print(f'{label}: differing_pixels={int(bad.sum())}')
