// Draws a Game on the 160x144 canvas from the source graphics. Browser only; the data to draw comes from scene.js.
import { TILESET_IMAGES, ROOFS } from '../generated/tileset-images.js';
import { TILESETS } from '../generated/tilesets.js';
import { SPRITES } from '../generated/sprites.js';
import { FONT_PNG, FONT_EXTRA_PNG, FRAME_PNG, FONT_CODES, TEXT_PALETTE } from '../generated/font.js';
import { mapBgPalettes, tilePaletteIndex } from '../maps/map-palettes.js';
import { objectPaletteColors, recolorSprite } from '../maps/object-sprites.js';
import { GBC_VIEWPORT_WIDTH as W, GBC_VIEWPORT_HEIGHT as H } from '../maps/viewport.js';
import { describeScene } from './scene.js';
import { tiles } from '../script/text.js';
import { titleFrame } from './title-frame.js';
import { MAP_ENTRY_SIGN } from '../generated/landmarks.js';

const to8 = (c) => Math.round((c * 255) / 31);
const textColors = TEXT_PALETTE.map((rgb) => rgb.map(to8));
// home/map.asm LoadTilesetGFX: these tilesets get the map group's roof art over tile ids $0a-$12.
const ROOF_TILESETS = new Set(['JOHTO', 'JOHTO_MODERN', 'BATTLE_TOWER_OUTSIDE']);

function loadImage(base64) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('could not decode an embedded image'));
    image.src = `data:image/png;base64,${base64}`;
  });
}
const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Recolor a grayscale sheet tile by tile. `paletteFor(tileIndex)` gives four colors, or null to leave the tile blank. */
function recolorSheet(source, paletteFor) {
  const canvas = makeCanvas(source.width, source.height);
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.drawImage(source, 0, 0);
  const frame = c.getImageData(0, 0, canvas.width, canvas.height);
  const perRow = canvas.width / 8;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const palette = paletteFor(Math.floor(y / 8) * perRow + Math.floor(x / 8));
      if (!palette) { frame.data[i + 3] = 0; continue; }
      const rgb = palette[Math.max(0, Math.min(3, Math.round((255 - frame.data[i]) / 85)))];
      frame.data[i] = rgb[0]; frame.data[i + 1] = rgb[1]; frame.data[i + 2] = rgb[2]; frame.data[i + 3] = 255;
    }
  }
  c.putImageData(frame, 0, 0);
  return canvas;
}

/** Palette-index pixels (0-3) of a tileset image plus which palette each of its tiles uses (for animated tiles). */
function tileShades(source, paletteOf) {
  const canvas = makeCanvas(source.width, source.height);
  const c = canvas.getContext('2d', { willReadFrequently: true });
  c.drawImage(source, 0, 0);
  const rgba = c.getImageData(0, 0, canvas.width, canvas.height).data;
  const shades = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < shades.length; i++) shades[i] = Math.max(0, Math.min(3, Math.round((255 - rgba[i * 4]) / 85)));
  const count = (canvas.width / 8) * (canvas.height / 8);
  const waterTiles = [];
  for (let t = 0; t < count; t++) if (paletteOf(t) === 3) waterTiles.push(t);
  return { shades, width: canvas.width, paletteOf, waterTiles };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scale = 1;
    this.sheets = new Map();       // map id -> recolored tileset sheet
    this.tileData = new Map();     // map id -> { shades, width, paletteOf } source tile pixels for animated tiles
    this.metatiles = new Map();    // `${map id}:${block id}` -> 32x32 canvas
    this.sprites = new Map();      // `${sprite}|${palette}` -> recolored sheet
    this.spriteSources = new Map();
    this.glyphs = new Map();
    this.pics = new Map();         // `${species}|side|colors` -> 56x56 canvas
    this.grayFrames = new Map();
    this.signSheets = new Map();
    this.fontReady = Promise.all([loadImage(FONT_PNG), loadImage(FONT_EXTRA_PNG), loadImage(FRAME_PNG)]).then(([font, extra, frame]) => {
      this.font = recolorSheet(font, () => textColors);
      this.fontExtra = recolorSheet(extra, () => textColors);
      this.frame = recolorSheet(frame, () => textColors);
      this.frameImage = frame;
      this.fontImages = [font, extra];
    });
  }

  setScale(scale) {
    this.scale = scale;
    this.canvas.width = W * scale;
    this.canvas.height = H * scale;
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Decode and recolor everything a map needs. Resolves when it can be drawn. */
  async prepare(world) {
    await this.fontReady;
    if (!this.sheets.has(world.id)) {
      const image = await loadImage(TILESET_IMAGES[world.tileset].png);
      let source = image;
      const roofIndex = ROOF_TILESETS.has(world.tileset) ? ROOFS.groupRoofs[world.group] : null;
      if (roofIndex !== null) {
        // LoadMapGroupRoof copies the 3x3-tile roof sheet over tile ids $0a-$12.
        const roof = await loadImage(ROOFS.png[roofIndex]);
        source = makeCanvas(image.width, image.height);
        const c = source.getContext('2d');
        c.drawImage(image, 0, 0);
        for (let t = 0; t < 9; t++) c.drawImage(roof, (t % 3) * 8, Math.floor(t / 3) * 8, 8, 8, ((0x0a + t) % 16) * 8, Math.floor((0x0a + t) / 16) * 8, 8, 8);
      }
      const palettes = mapBgPalettes(world.id);
      this.tileData.set(world.id, tileShades(source, (index) => {
        const id = index < 0x60 ? index : index - 0x60 + 0x80;
        return tilePaletteIndex(world.tileset, id);
      }));
      this.sheets.set(world.id, recolorSheet(source, (index) => {
        const id = index < 0x60 ? index : index - 0x60 + 0x80;
        const palette = tilePaletteIndex(world.tileset, id);
        return palette === null ? null : palettes[palette];
      }));
    }
    for (const sprite of new Set(Object.keys(SPRITES))) {
      if (!this.spriteSources.has(sprite)) this.spriteSources.set(sprite, null);
    }
  }

  /** Redraw the tiles the animation changed (tileset_anims.asm writes them into VRAM) and forget the blocks built from them. */
  applyTileAnimation(world, anim) {
    const data = this.tileData.get(world.id), sheet = this.sheets.get(world.id);
    if (!data || !sheet) return;
    const palettes = mapBgPalettes(world.id);
    const c = sheet.getContext('2d');
    const water = palettes[3].slice();
    water[0] = palettes[3][anim.waterColor];                       // AnimateWaterPalette
    const redraw = (index, pixels) => {
      const palette = data.paletteOf(index);
      if (palette === null) return;
      const colors = palette === 3 ? water : palettes[palette];
      const image = c.createImageData(8, 8);
      for (let i = 0; i < 64; i++) {
        const shade = pixels ? pixels.charCodeAt(i) - 48 : data.shades[(Math.floor(index / 16) * 8 + (i >> 3)) * data.width + (index % 16) * 8 + (i & 7)];
        image.data.set([...colors[shade], 255], i * 4);
      }
      c.putImageData(image, (index % 16) * 8, Math.floor(index / 16) * 8);
    };
    const drawn = new Set();
    for (const [id, pixels] of anim.tiles) { const index = id < 0x60 ? id : id >= 0x80 ? id - 0x80 + 0x60 : null; if (index !== null) { redraw(index, pixels); drawn.add(index); } }
    if (data.waterTiles) for (const index of data.waterTiles) if (!drawn.has(index)) redraw(index, null);
    for (const key of [...this.metatiles.keys()]) if (key.startsWith(`${world.id}:`)) this.metatiles.delete(key);
  }

  /** The tileset's own pixels of tile `id` as a 64-digit string (the start of a cave water scroll). */
  baseTile(world, id) {
    const data = this.tileData.get(world.id);
    const index = id < 0x60 ? id : id - 0x80 + 0x60;
    let out = '';
    for (let i = 0; i < 64; i++) out += data.shades[(Math.floor(index / 16) * 8 + (i >> 3)) * data.width + (index % 16) * 8 + (i & 7)];
    return out;
  }

  metatile(world, blockId) {
    const key = `${world.id}:${blockId}`;
    let canvas = this.metatiles.get(key);
    if (canvas) return canvas;
    canvas = makeCanvas(32, 32);
    const c = canvas.getContext('2d');
    const sheet = this.sheets.get(world.id);
    TILESETS[world.tileset].metatiles[blockId].forEach((id, i) => {
      const index = id < 0x60 ? id : id >= 0x80 && id < 0xe0 ? id - 0x80 + 0x60 : null;
      if (index === null || index >= (sheet.width / 8) * (sheet.height / 8)) return;   // tilesets such as Kanto have only the first 96 tiles
      c.drawImage(sheet, (index % 16) * 8, Math.floor(index / 16) * 8, 8, 8, (i % 4) * 8, Math.floor(i / 4) * 8, 8, 8);
    });
    this.metatiles.set(key, canvas);
    return canvas;
  }

  coloredSprite(sprite, paletteIndex) {
    const key = `${sprite}|${paletteIndex}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    let image = this.spriteSources.get(sprite);
    if (image === undefined || image === null) {
      if (image === null) {
        // First use: decode asynchronously; the sprite appears on a later frame.
        this.spriteSources.set(sprite, false);
        loadImage(SPRITES[sprite].png).then((img) => this.spriteSources.set(sprite, img));
      }
      return null;
    }
    if (image === false) return null;
    const canvas = makeCanvas(image.width, image.height);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    const frame = c.getImageData(0, 0, canvas.width, canvas.height);
    recolorSprite(frame.data, objectPaletteColors(paletteIndex));
    c.putImageData(frame, 0, 0);
    this.sprites.set(key, canvas);
    return canvas;
  }

  glyph(character, fonts = [this.font, this.fontExtra]) {
    const code = FONT_CODES[character];
    if (code === undefined) throw new Error(`no glyph for ${JSON.stringify(character)}`);
    if (code >= 0x80) return [fonts[0], code - 0x80];
    if (code >= 0x63 && code <= 0x78) return [fonts[1], code - 0x60];
    throw new Error(`character ${JSON.stringify(character)} (code ${code.toString(16)}) is not in the font sheets`);
  }

  drawText(text, tileX, tileY, fonts) {
    let x = tileX * 8;
    for (const character of tiles(text)) {
      if (character !== ' ') {
        const [sheet, index] = this.glyph(character, fonts);
        this.ctx.drawImage(sheet, (index % 16) * 8, Math.floor(index / 16) * 8, 8, 8, x, tileY * 8, 8, 8);
      }
      x += 8;
    }
  }

  /** Box with the frame border (home/text.asm TextBoxBorder): corners and edges from frames/1.png, white inside. */
  drawBox(left, top, right, bottom, colors = textColors, frame = this.frame) {
    const c = this.ctx;
    const tile = (n, tx, ty) => c.drawImage(frame, (n % 3) * 8, Math.floor(n / 3) * 8, 8, 8, tx * 8, ty * 8, 8, 8);
    c.fillStyle = `rgb(${colors[0]})`;
    c.fillRect(left * 8, top * 8, (right - left + 1) * 8, (bottom - top + 1) * 8);
    for (let x = left + 1; x < right; x++) { tile(1, x, top); tile(1, x, bottom); }
    for (let y = top + 1; y < bottom; y++) { tile(3, left, y); tile(3, right, y); }
    tile(0, left, top); tile(2, right, top); tile(4, left, bottom); tile(5, right, bottom);
  }

  /** Boxes of text (menus, save info) as scene.js and intro.js describe them. */
  drawPanels(panels) {
    const c = this.ctx;
    for (const panel of panels) {
      if (panel.clear) { const [x, y, w, h] = panel.clear; c.fillStyle = `rgb(${textColors[0]})`; c.fillRect(x * 8, y * 8, w * 8, h * 8); }
      this.drawBox(...panel.box);
      for (const [x, y, text] of panel.texts) this.drawText(text, x, y);
      if (panel.cursor) this.drawText(panel.cursor[2], panel.cursor[0], panel.cursor[1]);
    }
  }

  /** The area-name sign: a 20x4 window at the bottom of the screen in the map's TEXT palette (map_name_sign.asm PlaceMapNameFrame). */
  drawSign(name, colors) {
    const key = colors.toString();
    if (!this.signSheets.has(key)) {
      const sign = makeCanvas(56, 16), c = sign.getContext('2d'), image = c.createImageData(56, 16);
      for (let i = 0; i < 56 * 16; i++) image.data.set([...colors[MAP_ENTRY_SIGN.pixels.charCodeAt(i) - 48], 255], i * 4);
      c.putImageData(image, 0, 0);
      this.signSheets.set(key, { sign, fonts: this.fontImages.map((f) => recolorSheet(f, () => colors)) });
    }
    const { sign, fonts } = this.signSheets.get(key);
    const put = (n, x, y) => this.ctx.drawImage(sign, (n % 7) * 8, Math.floor(n / 7) * 8, 8, 8, x * 8, (14 + y) * 8, 8, 8);
    const edge = (y, tile, a, b, c2) => { put(tile, 0, y); for (let k = 0; k < 18; k++) put(k % 4 < 2 ? a : b, 1 + k, y); put(c2, 19, y); };
    edge(0, 1, 3, 2, 4);
    for (const [y, l, r] of [[1, 5, 11], [2, 6, 12]]) { put(l, 0, y); for (let k = 1; k < 19; k++) put(13, k, y); put(r, 19, y); }
    edge(3, 7, 9, 8, 10);
    this.drawText(name, (20 - tiles(name).length) >> 1, 16, fonts);
  }

  /** engine/events/pokepic.asm: a box at (x,y) 9x10 tiles with the species' front picture in its 7x7 interior, all in the map's gray palette (_CGB_Pokepic). */
  drawPokepic(species, x, y, gray) {
    const key = gray.toString();
    if (!this.grayFrames.has(key)) this.grayFrames.set(key, recolorSheet(this.frameImage, () => gray));
    this.drawBox(x, y, x + 8, y + 9, gray, this.grayFrames.get(key));
    const pic = this.picCanvas(species, 'front', gray);
    if (pic) this.ctx.drawImage(pic, (x + 1) * 8, (y + 1) * 8);
  }

  /** A species' front or back picture in a 7x7-tile canvas (PadFrontpic: smaller pictures sit at the bottom, 5x5 ones centered). */
  picCanvas(species, side, colors) {
    const key = `${species}|${side}|${colors}`;
    if (this.pics.has(key)) return this.pics.get(key);
    this.pics.set(key, null);
    import(`../generated/pokemon/${species}.js`).then(({ PIC }) => {
      const size = side === 'front' ? PIC.size : 48;
      const pixels = PIC[side];
      const canvas = makeCanvas(56, 56);
      const c = canvas.getContext('2d');
      const image = c.createImageData(size, size);
      for (let i = 0; i < size * size; i++) image.data.set([...colors[pixels.charCodeAt(i) - 48], 255], i * 4);
      const tiles = size / 8;
      c.putImageData(image, (side === 'front' && tiles < 7 ? 1 : 0) * 8, (side === 'front' ? 7 - tiles : 0) * 8);
      this.pics.set(key, canvas);
    }).catch(() => {});
    return null;
  }

  /** The title screen (software-composed, see title-frame.js) or the white main-menu screen. */
  drawIntro(intro, now = new Date()) {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (intro.stage === 'title') {
      this.titleCanvas ??= makeCanvas(W, H);
      const image = new ImageData(titleFrame(intro.titleState()), W, H);
      this.titleCanvas.getContext('2d').putImageData(image, 0, 0);
      c.drawImage(this.titleCanvas, 0, 0);
      return;
    }
    c.fillStyle = `rgb(${textColors[0]})`;
    c.fillRect(0, 0, W, H);
    this.drawPanels(intro.menuPanels(now));
  }

  draw(game) {
    const scene = describeScene(game);
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.fillStyle = '#000';
    c.fillRect(0, 0, W, H);
    const world = game.world;
    if (!this.sheets.has(world.id)) return;
    if (game.tileAnim.changed) { game.tileAnim.base = (id) => this.baseTile(world, id); this.applyTileAnimation(world, game.tileAnim); game.tileAnim.changed = false; }
    const { camera } = scene;
    // The map and, outside it, the border block.
    for (let by = Math.floor(camera.y / 32); by <= Math.floor((camera.y + H - 1) / 32); by++) {
      for (let bx = Math.floor(camera.x / 32); bx <= Math.floor((camera.x + W - 1) / 32); bx++) {
        c.drawImage(this.metatile(world, world.blockIdAt(bx * 2, by * 2)), bx * 32 - camera.x, by * 32 - camera.y);
      }
    }
    for (const s of scene.sprites) {
      const sheet = this.coloredSprite(s.sprite, s.paletteIndex);
      if (!sheet) continue;
      const x = s.x - camera.x, y = s.y - camera.y;
      c.save();
      if (s.mirror) { c.translate(x + 16, y); c.scale(-1, 1); c.drawImage(sheet, 0, s.row * 16, 16, 16, 0, 0, 16, 16); }
      else c.drawImage(sheet, 0, s.row * 16, 16, 16, x, y, 16, 16);
      c.restore();
    }
    this.drawPanels(scene.panels);
    if (scene.pokepic) this.drawPokepic(scene.pokepic, 6, 4, mapBgPalettes(world.id)[0]);
    if (scene.sign) this.drawSign(scene.sign, mapBgPalettes(world.id)[7]);
    if (scene.textbox) {
      this.drawBox(0, 12, 19, 17);
      this.drawText(scene.textbox.lines[0], 1, 14);
      this.drawText(scene.textbox.lines[1], 1, 16);
      if (scene.textbox.prompt && ((game.frame >> 4) & 1)) this.drawText('▼', 18, 17);   // on the box's bottom border row (measured)
    }
    if (scene.yesno) {
      const y = scene.yesno;
      this.drawBox(y.left, y.top, y.right, y.bottom);
      this.drawText('YES', y.left + 2, y.top + 1);
      this.drawText('NO', y.left + 2, y.top + 3);
      this.drawText('▶', y.left + 1, y.top + 1 + 2 * y.cursor);
    }
    if (scene.black > 0) { c.fillStyle = `rgba(0,0,0,${scene.black})`; c.fillRect(0, 0, W, H); }
    if (scene.fade) {
      c.fillStyle = `rgba(255,255,255,${1 - scene.fade.frame / scene.fade.frames})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
