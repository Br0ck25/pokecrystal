"""Replay the checked scripts against the real game and fail when a checkpoint differs by more pixels than regress.json allows.

  python3 tools/reference/regress.py --build DIR --out DIR [--only menu,mom]     (npm run regress -- --build DIR --out DIR)

Run it after any change to drawing, menus, text, movement or timing; it needs the ROM built locally (see README.md)."""
import argparse, json, os, re, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('--build', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--only', default='', help='comma-separated script names')
ap.add_argument('--base', default='http://localhost:8765')
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
manifest = json.load(open(os.path.join(here, 'regress.json')))
only = {n for n in a.only.split(',') if n}
failures = []
for run in manifest['runs']:
    name = run['script']
    if only and name not in only: continue
    out = os.path.join(a.out, f'regress_{name}')
    r = subprocess.run([sys.executable, os.path.join(here, 'play.py'), os.path.join(here, 'scripts', f'{name}.json'), '--build', a.build, '--out', out, '--base', a.base], capture_output=True, text=True)
    seen = {m.group(1): int(m.group(2)) for m in re.finditer(r'^(\w+): differing_pixels=(\d+)', r.stdout, re.M)}
    if r.returncode != 0 or not seen:
        failures.append(f'{name}: the replay failed\n{r.stderr[-400:]}'); continue
    for label, budget in run['budgets'].items():
        if label not in seen: failures.append(f'{name}/{label}: no such checkpoint')
        elif seen[label] > budget: failures.append(f'{name}/{label}: {seen[label]} differing pixels, allowed {budget} (see {out}/play_{label}_cmp.png)')
    print(f'{name}: {sum(1 for l in run["budgets"] if seen.get(l, 1 << 30) <= run["budgets"][l])}/{len(run["budgets"])} checkpoints within budget')
if failures:
    print('\n'.join(failures)); sys.exit(1)
print('regress: ok')
