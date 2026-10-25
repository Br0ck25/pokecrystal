import { NEW_BARK_TOWN_BLOCK_IDS } from './src/maps/new-bark-town-blocks.js';
import { JOHTO_METATILE_TILES } from './src/maps/johto-metatiles.js';
import { JOHTO_TILESET_PNG_BASE64 } from './src/assets/johto-tileset.js';
import { NEW_BARK_TOWN } from './src/maps/new-bark-town.js';
import { getNewBarkTownCollisionAtMetatile } from './src/maps/new-bark-town-blocks.js';
import { canPreviewEnter } from './src/maps/new-bark-town-movement.js';

const canvas = document.querySelector('#map');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const status = document.querySelector('#status');
const source = new Image();
source.src = 'data:image/png;base64,' + JOHTO_TILESET_PNG_BASE64;
const TILE = 16;
const map = { width: NEW_BARK_TOWN.dimensions.metatilesWide, height: NEW_BARK_TOWN.dimensions.metatilesHigh };
const state = { x: 9, y: 8, facing: 'down' };
const keys = new Set();
let lastStep = 0;

function drawMap() {
  ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let by=0; by<9; by++) for (let bx=0; bx<10; bx++) {
    const tiles = JOHTO_METATILE_TILES[NEW_BARK_TOWN_BLOCK_IDS[by*10+bx]];
    if (!tiles) continue;
    for (let ty=0; ty<4; ty++) for (let tx=0; tx<4; tx++) {
      const id=tiles[ty*4+tx], sx=(id%16)*8, sy=Math.floor(id/16)*8;
      ctx.drawImage(source,sx,sy,8,8,bx*32+tx*8,by*32+ty*8,8,8);
    }
  }
}
function drawPlayer() {
  const x=state.x*TILE, y=state.y*TILE;
  ctx.fillStyle='#111827'; ctx.fillRect(x+3,y+2,10,13);
  ctx.fillStyle='#f1c7a5'; ctx.fillRect(x+5,y+3,6,6);
  ctx.fillStyle='#7b3f21'; ctx.fillRect(x+4,y+1,8,3);
  ctx.fillStyle='#b72c38'; ctx.fillRect(x+4,y+9,8,4);
  ctx.fillStyle='#284d9b'; ctx.fillRect(x+4,y+13,3,3); ctx.fillRect(x+9,y+13,3,3);
  ctx.fillStyle='#202020';
  if(state.facing==='down'){ctx.fillRect(x+6,y+5,1,1);ctx.fillRect(x+9,y+5,1,1);}
  else if(state.facing==='left')ctx.fillRect(x+5,y+5,2,1);
  else if(state.facing==='right')ctx.fillRect(x+9,y+5,2,1);
  else ctx.fillRect(x+6,y+3,4,1);
}
function draw() { if(!source.complete||!source.naturalWidth)return; drawMap(); drawPlayer(); }
function blocked(x,y) {
  return !canPreviewEnter(x, y, map.width, map.height, getNewBarkTownCollisionAtMetatile);
}
function step(dx,dy,face) {
  state.facing=face;
  const nx=state.x+dx, ny=state.y+dy;
  if(blocked(nx,ny)) { draw(); return; }
  state.x=nx; state.y=ny; draw();
  const warp=NEW_BARK_TOWN.warps.find(w=>w.x===nx&&w.y===ny);
  if(warp) status.textContent='Door found: '+warp.destinationMap+' (map transition not implemented yet).';
  else status.textContent='New Bark Town · '+(nx+1)+', '+(ny+1)+' · Arrow keys / WASD to move';
}
function frame(now) {
  if(now-lastStep>130) {
    const dx=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0);
    const dy=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0);
    if(dx||dy){lastStep=now;step(dx,dy,Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));}
  }
  requestAnimationFrame(frame);
}
window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key);});
document.querySelectorAll('[data-move]').forEach(button => {
  const key = button.dataset.move;
  const down = event => { event.preventDefault(); keys.add(key); };
  const up = event => { event.preventDefault(); keys.delete(key); };
  button.addEventListener('pointerdown', down);
  for (const type of ['pointerup','pointercancel','pointerleave']) button.addEventListener(type, up);
});
window.addEventListener('keyup',e=>keys.delete(e.key));
window.addEventListener('blur',()=>keys.clear());
source.addEventListener('load',()=>{draw();status.textContent='Preview loaded · Arrow keys / WASD to move. Movement and collision are preliminary.';});
source.addEventListener('error',()=>status.textContent='Could not load the source tileset image.');
draw(); requestAnimationFrame(frame);
