"""Title screen and main menu of the real game: frames counted from the first TitleScreenEntrance call.
Usage: python3 title.py --build DIR --out DIR   (prints nothing; writes title_<n>.png and menu_*.png). Dev-time only."""
import argparse, os
from pyboy import PyBoy
ap = argparse.ArgumentParser(); ap.add_argument('--build', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--frames', default='1,2,3,5,10,20,27,28,29,30,31,40,60,100,200', help='iterations of the title screen scenes, counted from the first entrance call (entrance: 1-29, timer: 30, main from 31)')
ap.add_argument('--ram', help='copy of a .ram file (a saved game) to boot with')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
rom = os.path.join(a.build, 'pokecrystal.gbc')
if a.ram:
    import shutil; shutil.copy(a.ram, rom + '.ram')
pb = PyBoy(rom, window='null', sound_emulated=False); pb.set_emulation_speed(0)
sym = {}
for l in open(os.path.join(a.build, 'pokecrystal.sym')):
    if l.startswith(';') or ':' not in l: continue
    try: ba, n = l.split()[:2]; b, ad = ba.split(':'); sym[n] = (int(b, 16), int(ad, 16))
    except ValueError: pass
calls = [0]
def hit(_): calls[0] += 1
for scene in ('TitleScreenEntrance', 'TitleScreenTimer', 'TitleScreenMain'): pb.hook_register(*sym[scene], hit, None)
shot = lambda path: (pb.tick(1, True), pb.screen.image.convert('RGB').save(os.path.join(a.out, path)))
want = [int(n) for n in a.frames.split(',')]
while want:
    pb.tick(1, True)
    if calls[0] in want:
        pb.screen.image.convert('RGB').save(os.path.join(a.out, f'title_{calls[0]}.png')); want.remove(calls[0])
def press(button, settle=30):
    pb.button_press(button); pb.tick(4, True); pb.screen.image; pb.tick(4, True); pb.button_release(button); pb.tick(settle, True)   # reading the screen makes input register
press('a', 60); shot('menu_1.png')
if a.ram:                                          # CONTINUE: the save-info box, then back with B
    press('a', 40); shot('continue_1.png')
    press('b', 40); shot('continue_back.png')
else:
    for i in range(2):
        press('down', 20); shot(f'menu_down{i+1}.png')

# Compare the title frames with the app's (same number of updates)
import subprocess, numpy as np
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
frames = [int(n) for n in a.frames.split(',')]
subprocess.run(['node', os.path.join(here, 'title_app.mjs'), a.out, a.frames], check=True)
for n in frames:
    rom = np.asarray(Image.open(os.path.join(a.out, f'title_{n}.png')).convert('RGB')).astype(int)
    app = np.fromfile(os.path.join(a.out, f'title_app_{n}.rgba'), dtype=np.uint8).reshape(144, 160, 4)[:, :, :3].astype(int)
    bad = np.sqrt(((rom - app) ** 2).sum(axis=2)) > 48
    print(f'title {n}: differing_pixels={int(bad.sum())}')
