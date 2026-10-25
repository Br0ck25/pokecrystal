import { NEW_BARK_TOWN_BLOCK_IDS } from './src/maps/new-bark-town-blocks.js';
import { JOHTO_METATILE_TILES } from './src/maps/johto-metatiles.js';
import { JOHTO_TILESET_PNG_BASE64 } from './src/assets/johto-tileset.js';

const canvas = document.querySelector('#map');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const source = new Image();
source.src = 'data:image/png;base64,' + JOHTO_TILESET_PNG_BASE64;

function render() {
  if (!source.complete || !source.naturalWidth) return;
  ctx.fillStyle = '#202020';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let by = 0; by < 9; by++) {
    for (let bx = 0; bx < 10; bx++) {
      const blockId = NEW_BARK_TOWN_BLOCK_IDS[by * 10 + bx];
      const tileIds = JOHTO_METATILE_TILES[blockId];
      if (!tileIds) continue;
      for (let ty = 0; ty < 4; ty++) {
        for (let tx = 0; tx < 4; tx++) {
          const tileId = tileIds[ty * 4 + tx];
          const sx = (tileId % 16) * 8;
          const sy = Math.floor(tileId / 16) * 8;
          ctx.drawImage(source, sx, sy, 8, 8, bx * 32 + tx * 8, by * 32 + ty * 8, 8, 8);
        }
      }
    }
  }
  document.querySelector('#status').textContent = 'Rendered from source map and tileset data (320 × 288 pixels).';
}
source.addEventListener('load', render);
source.addEventListener('error', () => {
  document.querySelector('#status').textContent = 'Could not load the source tileset image.';
});
window.addEventListener('resize', () => { /* Keep native pixel coordinates; CSS scales the canvas. */ });
render();
