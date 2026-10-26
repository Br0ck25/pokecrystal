import sys
from PIL import Image
import numpy as np
S='/tmp/claude-0/-home-user-pokecrystal/7d7ee56f-a981-5201-8dd4-d8cf1179f61b/scratchpad/dmg/shots/'
rom,app,out=sys.argv[1:4]
r=Image.open(S+rom).convert('RGB'); a=Image.open('/tmp/claude-0/'+app).convert('RGB').crop((1,0,161,144))
d=np.abs(np.asarray(r).astype(int)-np.asarray(a).astype(int)).sum(axis=2)>48
print('differing', int(d.sum()))
dm=Image.fromarray((d*255).astype('uint8')).convert('RGB')
sheet=Image.new('RGB',(480,144)); sheet.paste(r,(0,0)); sheet.paste(a,(160,0)); sheet.paste(dm,(320,0))
sheet.resize((1440,432),Image.NEAREST).save(out)
