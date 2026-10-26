import os, sys, io, json, random
# usage: python3 probe.py --build DIR --out DIR   (BATTLES=n sets the battles per case); needs `node cases.mjs > OUT/cases.json` first
S = os.path.dirname(os.path.abspath(__file__))
HERE = os.path.dirname(S)
OUT = sys.argv[sys.argv.index('--out') + 1]
__file__ = HERE + '/audit.py'
src = open(__file__).read().split('cases = json.load')[0]
sys.argv = ['x', '--build', sys.argv[sys.argv.index('--build') + 1], '--out', OUT]
exec(src)
cases = json.load(open(OUT + '/cases.json'))
BATTLES = int(os.environ.get('BATTLES', '3'))
ref = Ref(); ref.newgame()
ids = map_ids()
g, n = ids['ROUTE_29']
ref.warp_in(g, n, 1, 300)
base = io.BytesIO(); ref.pb.save_state(base)
def w16(name, v): ref.wr(name, v >> 8); ref.wr(name + '+1', v & 255)
def r16(name): return ref.rd(name) << 8 | ref.rd(name + '+1')
def plant(c):
    ref.wr('wPartyCount', 1); ref.wr('wPartySpecies', c['speciesId']); ref.wr('wPartySpecies+1', 255)
    P = 'wPartyMon1'
    for tbl in ('wPartyMonNicknames', 'wPartyMonOTs'):
        for i, ch in enumerate([0x93, 0x84, 0x92, 0x93, 0x50]): ref.wr(tbl + '+%d' % i, ch)
    ref.wr(P + 'Species', c['speciesId']); ref.wr(P + 'Item', c['itemId'])
    for i, m in enumerate(c['moveIds']): ref.wr(P + 'Moves+%d' % i, m); ref.wr(P + 'PP+%d' % i, 30 if m else 0)
    ref.wr(P + 'ID', ref.rd('wPlayerID')); ref.wr(P + 'ID+1', ref.rd('wPlayerID+1'))      # the player's own Pokémon: no disobedience
    ref.wr(P + 'DVs', c['dvs'][0]); ref.wr(P + 'DVs+1', c['dvs'][1])
    for i in range(3): ref.wr(P + 'Exp+%d' % i, (c['exp'] >> (16 - 8 * i)) & 255)
    ref.wr(P + 'Level', c['level']); ref.wr(P + 'Status', 0)
    w16(P + 'HP', c['stats']['hp']); w16(P + 'MaxHP', c['stats']['hp'])
    for k, name in zip(['atk', 'def', 'spd', 'sat', 'sdf'], ['Attack', 'Defense', 'Speed', 'SpclAtk', 'SpclDef']): w16(P + name, c['stats'][k])
    ref.wr('wJohtoBadges', c['badges'][0]); ref.wr('wKantoBadges', c['badges'][1])
    f = ref.rd('wStatusFlags'); ref.wr('wStatusFlags', f & ~(1 << 5))
def side(p):
    pre = 'wBattleMon' if p == 'player' else 'wEnemyMon'
    st = 'wPlayer' if p == 'player' else 'wEnemy'
    d = {'species': ref.rd(pre + 'Species'), 'item': ref.rd(pre + 'Item'), 'level': ref.rd(pre + 'Level'), 'types': [ref.rd(pre + 'Type1'), ref.rd(pre + 'Type2')],
         'stats': dict(zip(['atk', 'def', 'spd', 'sat', 'sdf'], [r16(pre + n) for n in ['Attack', 'Defense', 'Speed', 'SpclAtk', 'SpclDef']])),
         'base': dict(zip(['atk', 'def', 'spd', 'sat', 'sdf'], [r16(st + n) for n in ['Attack', 'Defense', 'Speed', 'SpAtk', 'SpDef']])),
         'stages': dict(zip(['atk', 'def', 'spd', 'sat', 'sdf', 'acc', 'eva'], [ref.rd(st + 'StatLevels+%d' % i) for i in range(7)])),
         'screens': ref.rd(st.replace('wPlayer', 'wPlayer') + 'Screens'), 'hp': r16(pre + 'HP')}
    return d
def move(p):
    pre = 'wPlayerMoveStruct' if p == 'player' else 'wEnemyMoveStruct'
    return {'anim': ref.rd(pre + 'Animation'), 'effect': ref.rd(pre + 'Effect'), 'power': ref.rd(pre + 'Power'), 'type': ref.rd(pre + 'Type'), 'acc': ref.rd(pre + 'Accuracy')}
out = []
def step(d, hold=8):
    ref.pb.button_press(d); ref.tick(hold); ref.shot(); ref.pb.button_release(d); ref.tick(4)
res = []
for b in range(BATTLES):
    base.seek(0); ref.pb.load_state(base); plant(cases[0])
    ref.wr('wNumBalls', 1); ref.wr('wBalls', 5); ref.wr('wBalls+1', 20); ref.wr('wBalls+2', 255)      # 20 POKE_BALLs (item 4)
    rnd = random.Random(b * 7 + 3); d = 'left'
    ref.tick(rnd.randrange(1, 200))
    for i in range(4000):
        if rnd.random() < 0.2: d = rnd.choice(['up', 'down', 'left', 'right'])
        step(d)
        if ref.rd('wBattleMode'): break
    ref.tick(500); step('a', 4); ref.tick(280)          # "appeared" is dismissed, the menu is up
    pre = {'species': ref.rd('wEnemyMonSpecies'), 'hp': r16('wEnemyMonHP'), 'max': r16('wEnemyMonMaxHP'), 'status': ref.rd('wEnemyMonStatus'), 'catch': ref.rd('wEnemyMonCatchRate')}
    ref.wr('wFinalCatchRate', 0)
    step('down', 6); ref.tick(10); step('a', 4); ref.tick(30)      # PACK
    step('right', 6); ref.tick(10); step('a', 4); ref.tick(10); step('a', 4); ref.tick(10)   # BALL pocket, the ball, USE
    for i in range(300):
        step('a' if i % 15 == 0 else 'b' if False else 'a', 2) if i % 30 == 0 else ref.tick(5)
        if ref.rd('wFinalCatchRate') : break
    pre['final'] = ref.rd('wFinalCatchRate'); pre['wild'] = ref.rd('wWildMon')
    res.append(pre); print(pre, flush=True)
json.dump(res, open(OUT + '/catch.json', 'w'))
