"""Plays a new game in the real game up to the player's room, saves it with START > SAVE, and leaves the SRAM file
(<build>/pokecrystal.gbc.ram) for title.py --ram. Dev-time only."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
build = sys.argv[sys.argv.index('--build') + 1]
src = open(os.path.join(HERE, 'audit.py')).read().split('cases = json.load')[0]
sys.argv = ['x', '--build', build, '--out', '/tmp']
exec(src)
ref = Ref(); ref.newgame()
def press(b, settle=30):
    ref.pb.button_press(b); ref.tick(4); ref.shot(); ref.tick(4); ref.pb.button_release(b); ref.tick(settle)
press('start', 60); press('down', 20); press('down', 20); press('a', 120); press('a', 600); ref.shot()
ref.pb.stop(save=True)
print('saved', os.path.exists(os.path.join(build, 'pokecrystal.gbc.ram')))
