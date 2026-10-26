"""python3 timeline_compare.py OUT/timeline2.npy app_tl.json [from]: the frames (relative to the first A press at ROM frame 500) at which the screen changes,
as ranges, in the real game and in the app (timeline_app.cjs). The app side lags the ROM side by about 4 frames of input latency."""
import json, sys
import numpy as np
rom_f = np.load(sys.argv[1]).astype(int); d = json.load(open(sys.argv[2])); lo = int(sys.argv[3]) if len(sys.argv) > 3 else 0
def ranges(ev, gap=8):
    out = []; last = -99
    for i, x in ev:
        if i - last > gap: out.append([i, i, x])
        else: out[-1][1] = i
        last = i
    return out
rom = [(i - 500, int((np.abs(rom_f[i] - rom_f[i - 1]).sum(axis=2) > 48).sum())) for i in range(1, len(rom_f)) if i - 500 >= lo]
rom = [(i, x) for i, x in rom if x]
app = [(i - d['start'], x) for i, x in enumerate(d['counts']) if i - d['start'] >= lo and x]
print('ROM', ranges(rom)); print('APP', ranges(app))
