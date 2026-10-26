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

def plant_party(mons):
    """Plant Pokémon in the ROM's party: {speciesId, level, dvs, moveIds, pp, exp, stats{hp,atk,def,spd,sat,sdf}, hp, id, item, status}; nickname and OT are TEST."""
    ref.wr('wPartyCount', len(mons))
    sb, sa = ref.key('wPartySpecies'); mb, ma = ref.key('wPartyMon1Species'); nb, na = ref.key('wPartyMonNicknames'); ob, oa = ref.key('wPartyMonOTs')
    name = [0x93, 0x84, 0x92, 0x93, 0x50]
    for i, m in enumerate(mons):
        ref.pb.memory[sb, sa + i] = m['speciesId']
        for k, ch in enumerate(name): ref.pb.memory[nb, na + 11 * i + k] = ch; ref.pb.memory[ob, oa + 11 * i + k] = ch
        o = ma + 48 * i; w = lambda off, v: ref.pb.memory.__setitem__((mb, o + off), v)
        w(0, m['speciesId']); w(1, m.get('item', 0))
        for j in range(4): w(2 + j, m['moveIds'][j] if j < len(m['moveIds']) else 0); w(23 + j, m['pp'][j] if j < len(m['pp']) else 0)
        w(6, m['id'] >> 8); w(7, m['id'] & 255)
        for j in range(3): w(8 + j, (m['exp'] >> (16 - 8 * j)) & 255)
        w(21, m['dvs'][0]); w(22, m['dvs'][1]); w(27, 70); w(31, m['level']); w(32, m.get('status', 0))
        st = m['stats']
        for off, v in [(34, m['hp']), (36, st['hp']), (38, st['atk']), (40, st['def']), (42, st['spd']), (44, st['sat']), (46, st['sdf'])]: w(off, v >> 8); w(off + 1, v & 255)
    ref.pb.memory[sb, sa + len(mons)] = 255
battle = {'started': False}
bb, ba = ref.sym['BattleIntro']
ref.pb.hook_register(bb, ba, lambda ctx: battle.__setitem__('started', True), None)
BUTTONS = {'left', 'right', 'up', 'down', 'a', 'b', 'start', 'select'}
for s in steps:
    if 'hold' in s:
        ref.pb.button_press(s['hold']); ref.tick(s['frames']); ref.pb.button_release(s['hold'])
    elif 'press' in s:
        ref.pb.button_press(s['press']); ref.tick(3); ref.pb.button_release(s['press']); ref.tick(8)
    elif 'warp' in s:                                  # {"warp": {"id": "ELMS_LAB", "warp": 1, "ram": {...}, "scene": "ElmsLab:2"}}
        c = s['warp']
        for var, value in c.get('ram', {}).items(): ref.wr(var, value)
        if c.get('plant'): plant_party(c['plant'])
        for ev in c.get('clear', []): set_event(ev, False)      # event flags, e.g. to show the starter Poké Balls
        for ev in c.get('set', []): set_event(ev, True)
        group, num = ids[c['id']]
        ref.warp_in(group, num, c['warp'], c.get('settle', 300))
        s['enter'] = {'map': c['id'], 'x': ref.rd('wXCoord'), 'y': ref.rd('wYCoord'), 'scene': c.get('scene', ''), 'flags': c.get('set', []), 'clearFlags': c.get('clear', []), 'prevLandmark': c.get('prevLandmark'), 'engine': c.get('engine', []), 'playerId': ref.rd('wPlayerID') << 8 | ref.rd('wPlayerID+1'), 'party': c.get('party', 0), 'plant': c.get('plant', []), 'items': c.get('items', {}), 'settle': c.get('settle', 0), 'enemyMonLevel': ref.rd('wEnemyMonLevel'), 'clock': c.get('clock'), 'dex': c.get('dex'), 'tileAnim': [ref.rd('hTileAnimFrame'), ref.rd('wTileAnimationTimer')]}
    elif 'sync' in s:                                  # {"sync": "battle", "tap": "a"}: tap A every 40 frames until the battle starts (BattleIntro); both sides then sit at transition frame 0
        # {"sync": "battle", "walk": ["left", "right"]}: walk a tile (16 frames) at a time in that order until a wild battle starts; the app is told the species, level and DVs
        for i in range(s.get('limit', 4000)):
            if s.get('tap') and i % 40 == 0: ref.pb.button_press(s['tap'])
            if s.get('tap') and i % 40 == 3: ref.pb.button_release(s['tap'])
            if s.get('walk') and i % 16 == 0:
                if i: ref.pb.button_release(s['walk'][(i // 16 - 1) % len(s['walk'])])
                ref.pb.button_press(s['walk'][(i // 16) % len(s['walk'])])
            ref.tick(1)
            if battle['started']: break
        else: raise RuntimeError('the battle never started')
        if s.get('tap'): ref.pb.button_release(s['tap'])
        if s.get('walk'):
            ref.pb.button_release(s['walk'][(i // 16) % len(s['walk'])])
            s['frames'] = i + 1
            species_id, level = ref.rd('wTempWildMonSpecies'), ref.rd('wCurPartyLevel')
            snap = io.BytesIO(); ref.pb.save_state(snap)                        # look ahead for the DVs the ROM rolls, then come back
            menu = {'f': False}; mb, ma = ref.sym['BattleMenu']; ref.pb.hook_register(mb, ma, lambda ctx: menu.__setitem__('f', True), None)
            for j in range(3000):
                if j % 40 == 0: ref.pb.button_press('a')
                if j % 40 == 3: ref.pb.button_release('a')
                ref.tick(1)
                if menu['f']: break
            dvs = [ref.rd('wEnemyMonDVs'), ref.rd('wEnemyMonDVs+1')]
            ref.pb.hook_deregister(mb, ma)
            snap.seek(0); ref.pb.load_state(snap)
            names = [m.group(1) for m in re.finditer(r'^\s*const (\w+)', open(os.path.join(REPO, 'constants/pokemon_constants.asm')).read().split('DEF NUM_POKEMON')[0], re.M)]
            s['force'] = {'species': names[species_id - 1], 'level': level, 'dvs': dvs}
            print('  wild', s['force'])
        ref.tick(1)
    elif 'mash' in s:                                  # {"mash": "a", "shots": {"label": frame, ...}}: tap A every 40 frames (3 down) and shoot at the given frames after this step began
        def tap_at(i):
            if i < s.get('holdFrom', 0): return
            if 'holdUntil' in s:
                if i == s.get('holdFrom', 0): ref.pb.button_press(s['mash'])
                elif i == s['holdUntil']: ref.pb.button_release(s['mash'])
                return
            if i % 40 == s.get('phase', 0): ref.pb.button_press(s['mash'])
            elif i % 40 == (s.get('phase', 0) + 3) % 40: ref.pb.button_release(s['mash'])
        i = 0
        for label, f in sorted(s['shots'].items(), key=lambda kv: kv[1]):
            while i < f: tap_at(i); ref.tick(1); i += 1
            tap_at(i); roms[label] = ref.shot(); i += 1
        ref.pb.button_release(s['mash'])
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
