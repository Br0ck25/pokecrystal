import os, sys, io, json, random
# usage: node ai_cases.mjs > OUT/aicases.json; python3 ai_probe.py --build DIR --out OUT   (TRIALS=n samples of AIChooseMove per snapshot)
# Walks into Falkner's gym with a planted Pokémon, fights him, and at each turn's battle menu snapshots the battle RAM and runs the ROM's
# AIChooseMove many times (a stub in WRAM calls it through FarCall_hl) so ai_verify.mjs can compare the move frequencies with src/battle/ai.
S = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(S)
OUT = sys.argv[sys.argv.index('--out') + 1]
__file__ = HERE + '/audit.py'
src = open(__file__).read().split('cases = json.load')[0]
sys.argv = ['x', '--build', sys.argv[sys.argv.index('--build') + 1], '--out', OUT]
exec(src)
scen = json.load(open(OUT + '/aiscen.json'))
cases = json.load(open(OUT + '/aicases.json'))
CLASSES = [m.group(1) for m in re.finditer(r'^\s*trainerclass (\w+)', open(os.path.join(REPO, 'constants/trainer_constants.asm')).read(), re.M)]
IDS = {}
_cur = None
for l in open(os.path.join(REPO, 'constants/trainer_constants.asm')):
    m = re.match(r'\s*trainerclass (\w+)', l)
    if m: _cur = IDS.setdefault(m.group(1), []); continue
    m = re.match(r'\s*const (\w+)', l)
    if m and _cur is not None: _cur.append(m.group(1))
TRIALS = int(os.environ.get('TRIALS', '200'))
TURNS = int(os.environ.get('TURNS', '3'))
ref = Ref(); ref.newgame()
ids = map_ids()
ids = map_ids()
base = io.BytesIO(); ref.pb.save_state(base)
def w16(name, v): ref.wr(name, v >> 8); ref.wr(name + '+1', v & 255)
def r16(name): return ref.rd(name) << 8 | ref.rd(name + '+1')
def event_index(name):
    n = 0
    for l in open(os.path.join(REPO, 'constants/event_flags.asm')):
        m = re.match(r'\s*const (EVENT_\w+)', l)
        if m:
            if m.group(1) == name: return n
            n += 1
        elif re.match(r'\s*const_skip', l): n += 1          # unused flags still take a bit
        elif re.match(r'\s*const_next (\d+)', l): n = int(re.match(r'\s*const_next (\d+)', l).group(1))
def set_event(name):
    i = event_index(name); b, ad = ref.key('wEventFlags')
    ref.pb.memory[b, ad + i // 8] = ref.pb.memory[b, ad + i // 8] | (1 << (i % 8))
def plant(c):
    ref.wr('wPartyCount', 1); ref.wr('wPartySpecies', c['speciesId']); ref.wr('wPartySpecies+1', 255)
    P = 'wPartyMon1'
    for tbl in ('wPartyMonNicknames', 'wPartyMonOTs'):
        for i, ch in enumerate([0x93, 0x84, 0x92, 0x93, 0x50]): ref.wr(tbl + '+%d' % i, ch)
    ref.wr(P + 'Species', c['speciesId']); ref.wr(P + 'Item', c['itemId'])
    for i, m in enumerate(c['moveIds']): ref.wr(P + 'Moves+%d' % i, m); ref.wr(P + 'PP+%d' % i, 30 if m else 0)
    ref.wr(P + 'ID', ref.rd('wPlayerID')); ref.wr(P + 'ID+1', ref.rd('wPlayerID+1'))
    ref.wr(P + 'DVs', c['dvs'][0]); ref.wr(P + 'DVs+1', c['dvs'][1])
    for i in range(3): ref.wr(P + 'Exp+%d' % i, (c['exp'] >> (16 - 8 * i)) & 255)
    ref.wr(P + 'Level', c['level']); ref.wr(P + 'Status', 0)
    w16(P + 'HP', c['stats']['hp']); w16(P + 'MaxHP', c['stats']['hp'])
    for k, name in zip(['atk', 'def', 'spd', 'sat', 'sdf'], ['Attack', 'Defense', 'Speed', 'SpclAtk', 'SpclDef']): w16(P + name, c['stats'][k])
    ref.wr('wJohtoBadges', c['badges'][0]); ref.wr('wKantoBadges', c['badges'][1])

B1 = lambda n, k=1: [ref.rd(n + ('+%d' % i if i else '')) for i in range(k)]
def snapshot():
    d = {}
    for pre in ('wBattleMon', 'wEnemyMon'):
        d[pre] = {'Species': ref.rd(pre + 'Species'), 'Item': ref.rd(pre + 'Item'), 'Level': ref.rd(pre + 'Level'), 'Status': ref.rd(pre + 'Status'),
                  'Types': B1(pre + 'Type1', 2), 'Moves': B1(pre + 'Moves', 4), 'PP': B1(pre + 'PP', 4), 'HP': r16(pre + 'HP'), 'MaxHP': r16(pre + 'MaxHP'),
                  'Stats': [r16(pre + n) for n in ['Attack', 'Defense', 'Speed', 'SpclAtk', 'SpclDef']], 'DVs': B1(pre + 'DVs', 2)}
    for who in ('Player', 'Enemy'):
        p = 'w' + who
        d[who] = {'StatLevels': B1(p + 'StatLevels', 7), 'Screens': ref.rd(p + 'Screens'), 'Sub': B1(p + 'SubStatus1', 5), 'TurnsTaken': ref.rd(p + 'TurnsTaken'),
                  'ProtectCount': ref.rd(p + 'ProtectCount'), 'FuryCutterCount': ref.rd(p + 'FuryCutterCount'), 'WrapCount': ref.rd(p + 'WrapCount'),
                  'PerishCount': ref.rd(p + 'PerishCount'), 'DisableCount': ref.rd(p + 'DisableCount'), 'RolloutCount': ref.rd(p + 'RolloutCount'),
                  'Minimized': ref.rd(p + 'Minimized'), 'Base': [r16(p + n) for n in ['Attack', 'Defense', 'Speed', 'SpAtk', 'SpDef']]}
    d['Enemy']['ToxicCount'] = ref.rd('wEnemyToxicCount'); d['TrainerItems'] = [ref.rd('wEnemyTrainerItem1'), ref.rd('wEnemyTrainerItem2')]
    d['Enemy']['RageCounter'] = ref.rd('wEnemyRageCounter'); d['Enemy']['DisabledMove'] = ref.rd('wEnemyDisabledMove')
    d['Player']['UsedMoves'] = B1('wPlayerUsedMoves', 4)
    d['LastPlayerMove'] = ref.rd('wLastPlayerMove'); d['LastPlayerCounterMove'] = ref.rd('wLastPlayerCounterMove')
    d['LastEnemyMove'] = ref.rd('wLastEnemyMove'); d['LastEnemyCounterMove'] = ref.rd('wLastEnemyCounterMove')
    d['Weather'] = ref.rd('wBattleWeather'); d['TrainerClass'] = ref.rd('wTrainerClass'); d['CurOTMon'] = ref.rd('wCurOTMon'); d['CurBattleMon'] = ref.rd('wCurBattleMon')
    d['BattleTurn'] = ref.pb.memory[ref.key('hBattleTurn')]; d['PlayerMoveType'] = ref.rd('wPlayerMoveStructType'); d['EnemyMoveType'] = ref.rd('wEnemyMoveStructType')
    d['PartyCount'] = ref.rd('wPartyCount')
    d['Party'] = [{'HP': r16('wPartyMon1HP') if i == 0 else (ref.pb.memory[ref.key('wPartyMon1HP')[0], ref.key('wPartyMon1HP')[1] + 48 * i] << 8 | ref.pb.memory[ref.key('wPartyMon1HP')[0], ref.key('wPartyMon1HP')[1] + 48 * i + 1])} for i in range(d['PartyCount'])]
    d['OTPartyCount'] = ref.rd('wOTPartyCount')
    ob, oa = ref.key('wOTPartyMon1Species')
    d['OTParty'] = []
    for i in range(d['OTPartyCount']):
        o = oa + 48 * i; m = lambda k: ref.pb.memory[ob, o + k]
        d['OTParty'].append({'Species': m(0), 'Moves': [m(2 + j) for j in range(4)], 'HP': m(34) << 8 | m(35), 'MaxHP': m(36) << 8 | m(37), 'Status': m(32), 'Level': m(31), 'DVs': [m(21), m(22)]})
    return d


# the stub calls a function through FarCall_hl and spins: ld a, BANK; ld hl, addr; call FarCall_hl; jr $
_, far = ref.sym['FarCall_hl']
sk = ref.key('wOverworldMapBlocks+600')
sa = sk[1] if isinstance(sk, tuple) else sk
DONE = sa + 40
def mem_set(addr, v):
    if isinstance(sk, tuple): ref.pb.memory[sk[0], addr] = v
    else: ref.pb.memory[addr] = v
def mem_get(addr):
    return ref.pb.memory[sk[0], addr] if isinstance(sk, tuple) else ref.pb.memory[addr]
def stub_for(name):
    bank, addr = ref.sym[name]
    # ld a, BANK; ld hl, addr; call FarCall_hl; ld a, $77; ld [DONE], a; jr $
    return [0x3E, bank, 0x21, addr & 255, addr >> 8, 0xCD, far & 255, far >> 8, 0x3E, 0x77, 0xEA, DONE & 255, DONE >> 8, 0x18, 0xFE]
def run_stub(name, frames=None, press_a=False):
    for k, v in enumerate(stub_for(name)): mem_set(sa + k, v)
    mem_set(DONE, 0)
    ref.pb.register_file.PC = sa
    if frames is not None: ref.tick(frames); return
    for i in range(900 if press_a else 120):
        if press_a and i % 4 == 0: ref.pb.button_press('a')
        if press_a and i % 4 == 2: ref.pb.button_release('a')
        ref.tick(1)
        if mem_get(DONE) == 0x77: return
    raise RuntimeError(name + ' did not return')
flag = {'menu': False}
if os.environ.get('DBG'):
    for nm in ['StartBattle', 'BattleIntro', 'InitEnemy', 'InitEnemyTrainer', 'DoBattle', 'BattleStartMessage']:
        b_, a_ = ref.sym[nm]
        ref.pb.hook_register(b_, a_, (lambda n: (lambda ctx: print('HOOK', n, flush=True)))(nm), None)
mb, ma = ref.sym['BattleMenu']
ref.pb.hook_register(mb, ma, lambda ctx: flag.__setitem__('menu', True), None)
def press(b, hold=4, wait=8):
    ref.pb.button_press(b); ref.tick(hold); ref.shot(); ref.pb.button_release(b); ref.tick(wait)
def hp_set(prefix, frac):
    mx = r16(prefix + 'MaxHP'); w16(prefix + 'HP', max(1, int(mx * frac)))
def level(side, vals):
    for i, v in enumerate(vals): ref.wr('w%sStatLevels+%d' % (side, i), v)


import numpy as np
c = cases[0]
g, n = ids['VIOLET_GYM']
ref.warp_in(g, n, 1, 300)
for ev in ('EVENT_BEAT_BIRD_KEEPER_ROD', 'EVENT_BEAT_BIRD_KEEPER_ABE'): set_event(ev)
plant(c)
path = ['up'] * 5 + ['right'] * 2 + ['up'] * 2 + ['left'] * 3 + ['up'] * 2 + ['right'] + ['up'] * 4 + ['right']
for d in path:
    before = (ref.rd('wXCoord'), ref.rd('wYCoord'))
    for tries in range(8):
        press(d, 4, 4)
        if (ref.rd('wXCoord'), ref.rd('wYCoord')) != before: break
    ref.tick(24)
press('up', 2, 8)
started = {'f': False}
bb, ba = ref.sym['BattleIntro']
ref.pb.hook_register(bb, ba, lambda ctx: started.__setitem__('f', True), None)
flag['menu'] = False
frames = []
def rec(n=1):
    for _ in range(n):
        ref.tick(1); frames.append(np.asarray(ref.pb.screen.image.convert('RGB')).copy())
mark = None
for i in range(4000):
    if i % 40 == 0: ref.pb.button_press('a')
    if i % 40 == 3: ref.pb.button_release('a')
    rec()
    if started['f'] and mark is None: mark = len(frames)
    if flag['menu']: break
print('intro frame', mark, 'menu frame', len(frames))
np.save(OUT + '/trainer_tl.npy', np.stack(frames[mark - 5:]))
