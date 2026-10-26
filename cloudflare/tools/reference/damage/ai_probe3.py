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
def run_stub(name, frames=None):
    for k, v in enumerate(stub_for(name)): mem_set(sa + k, v)
    mem_set(DONE, 0)
    ref.pb.register_file.PC = sa
    if frames is not None: ref.tick(frames); return
    for _ in range(120):
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

def wr_arr(name, vals):
    for i, v in enumerate(vals): ref.wr(name + ('+%d' % i if i else ''), v)
def mem16(base_key, off, v):
    b, a = ref.key(base_key)
    ref.pb.memory[b, a + off] = v >> 8; ref.pb.memory[b, a + off + 1] = v & 255
def poke_battle_mon(pre, m):
    ref.wr(pre + 'Species', m['speciesId']); ref.wr(pre + 'Item', 0); ref.wr(pre + 'Level', m['level'])
    wr_arr(pre + 'Moves', m['moveIds']); wr_arr(pre + 'PP', m['pp']); wr_arr(pre + 'DVs', m['dvs'])
    ref.wr(pre + 'Status', m['status']); wr_arr(pre + 'Type1', m['types'])
    mx = m['stats']['hp']; w16(pre + 'MaxHP', mx); w16(pre + 'HP', 0 if m['hpFrac'] == 0 else max(1, int(mx * m['hpFrac'])))
    for k, name in zip(['atk', 'def', 'spd', 'sat', 'sdf'], ['Attack', 'Defense', 'Speed', 'SpclAtk', 'SpclDef']): w16(pre + name, m['stats'][k])
def poke_ot_party(mons):
    ref.wr('wOTPartyCount', len(mons)); ref.wr('wCurOTMon', 0)
    b, a = ref.key('wOTPartySpecies')
    for i, m in enumerate(mons): ref.pb.memory[b, a + i] = m['speciesId']
    ref.pb.memory[b, a + len(mons)] = 255
    ob, oa = ref.key('wOTPartyMon1Species')
    for i, m in enumerate(mons):
        o = oa + 48 * i
        ref.pb.memory[ob, o] = m['speciesId']
        for j in range(4): ref.pb.memory[ob, o + 2 + j] = m['moveIds'][j]
        ref.pb.memory[ob, o + 21] = m['dvs'][0]; ref.pb.memory[ob, o + 22] = m['dvs'][1]
        ref.pb.memory[ob, o + 31] = m['level']; ref.pb.memory[ob, o + 32] = m['status']
        mx = m['stats']['hp']; hp = 0 if m['hpFrac'] == 0 else max(1, int(mx * m['hpFrac']))
        ref.pb.memory[ob, o + 34] = hp >> 8; ref.pb.memory[ob, o + 35] = hp & 255
        ref.pb.memory[ob, o + 36] = mx >> 8; ref.pb.memory[ob, o + 37] = mx & 255
def poke_party(extra):
    ref.wr('wPartyCount', 1 + len(extra)); ref.wr('wCurBattleMon', 0)
    b, a = ref.key('wPartySpecies')
    ref.pb.memory[b, a] = ref.rd('wBattleMonSpecies')
    pb, pa = ref.key('wPartyMon1Species')
    for i, e in enumerate(extra):
        ref.pb.memory[b, a + 1 + i] = e['speciesId']
        o = pa + 48 * (i + 1)
        ref.pb.memory[pb, o] = e['speciesId']
        hp = 0 if e['hpFrac'] == 0 else 20
        ref.pb.memory[pb, o + 34] = hp >> 8; ref.pb.memory[pb, o + 35] = hp & 255; ref.pb.memory[pb, o + 36] = 0; ref.pb.memory[pb, o + 37] = 40
    ref.pb.memory[b, a + 1 + len(extra)] = 255
def apply(sc):
    poke_battle_mon('wBattleMon', sc['player']); poke_battle_mon('wEnemyMon', sc['enemy'])
    poke_ot_party(sc['otParty']); poke_party(sc['partyExtra'])
    ref.wr('wTrainerClass', sc['classId'])
    wr_arr('wPlayerStatLevels', sc['playerStages']); wr_arr('wEnemyStatLevels', sc['enemyStages'])
    wr_arr('wPlayerSubStatus1', sc['playerSub']); wr_arr('wEnemySubStatus1', sc['enemySub'])
    ref.wr('wPlayerScreens', sc['playerScreens']); ref.wr('wEnemyScreens', sc['enemyScreens'])
    ref.wr('wBattleWeather', sc['weather']); ref.wr('wWeatherCount', 3 if sc['weather'] else 0)
    ref.wr('wEnemyTurnsTaken', sc['enemyTurns']); ref.wr('wPlayerTurnsTaken', sc['playerTurns'])
    used = (sc['usedMoves'] + [0, 0, 0, 0])[:4]
    wr_arr('wPlayerUsedMoves', used)
    ref.wr('wLastPlayerMove', sc['lastPlayerMove']); ref.wr('wLastPlayerCounterMove', sc['lastPlayerCounterMove'])
    ref.wr('wEnemyProtectCount', sc['enemyProtect']); ref.wr('wPlayerFuryCutterCount', sc['playerFury']); ref.wr('wEnemyFuryCutterCount', sc['enemyFury'])
    ref.wr('wEnemyRageCounter', sc['enemyRage']); ref.wr('wPlayerWrapCount', sc['playerWrap']); ref.wr('wEnemyWrapCount', sc['enemyWrap'])
    ref.wr('wEnemyPerishCount', sc['enemyPerish']); ref.wr('wPlayerMinimized', sc['playerMinimized']); ref.wr('wPlayerRolloutCount', sc['playerRollout'])

# reach the first battle menu in Falkner's gym once; every scenario is poked into that state
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
flag['menu'] = False
press('up', 2, 8)
for i in range(600):
    press('a', 4, 20)
    if flag['menu']: break
else: raise SystemExit('no battle menu')
ref.tick(60)
menu_state = io.BytesIO(); ref.pb.save_state(menu_state)
TRIALS = int(os.environ.get('TRIALS', '100'))
FIRST = int(os.environ.get('FIRST', '0'))
results = []
for si, sc in enumerate(scen[FIRST:], FIRST):
    menu_state.seek(0); ref.pb.load_state(menu_state)
    apply(sc)
    ref.tick(1)
    snap = snapshot()
    state = io.BytesIO(); ref.pb.save_state(state)
    rnd = random.Random(si)
    picks = []
    for t in range(TRIALS):
        state.seek(0); ref.pb.load_state(state)
        ref.tick(rnd.randrange(0, 80))
        ref.wr('wCurEnemyMove', 0)
        run_stub('AIChooseMove')
        picks.append(ref.rd('wCurEnemyMove'))
    results.append({'scenario': si, 'trainer': sc['cls'], 'snapshot': snap, 'picks': picks})
    print(si, sc['cls'], sc['enemy']['species'], 'vs', sc['player']['species'], {m: picks.count(m) for m in sorted(set(picks))}, flush=True)
    if len(results) % 5 == 0: json.dump(results, open(OUT + '/aiobserved3.json', 'w'))
json.dump(results, open(OUT + '/aiobserved3.json', 'w'))
