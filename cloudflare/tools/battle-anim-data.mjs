// The battle animation engine as data: engine/battle_anims/*.asm, data/battle_anims/*.asm and data/moves/animations.asm assembled for the SM83
// interpreter (src/battle/anim/), plus the graphics its objects use. The sources are assembled by tools/sm83-asm.mjs into one flat image
// (code, tables and every move's script); calls into other parts of the game stay unresolved and become addresses the interpreter hooks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Assembler, layoutFromLink } from './sm83-asm.mjs';

const CONSTANT_FILES = [
  'macros/const.asm', 'macros/farcall.asm', 'macros/predef.asm', 'macros/data.asm', 'macros/code.asm', 'macros/gfx.asm', 'macros/coords.asm', 'macros/ram.asm',
  'macros/scripts/battle_anims.asm', 'macros/scripts/oam_anims.asm',
  'constants/hardware.inc', 'constants/ram_constants.asm', 'constants/misc_constants.asm', 'constants/gfx_constants.asm', 'constants/text_constants.asm',
  'constants/audio_constants.asm', 'constants/battle_anim_constants.asm', 'constants/battle_constants.asm', 'constants/move_constants.asm',
  'constants/move_effect_constants.asm', 'constants/item_constants.asm', 'constants/item_data_constants.asm', 'constants/pokemon_constants.asm',
  'constants/pokemon_data_constants.asm', 'constants/scgb_constants.asm', 'constants/sfx_constants.asm', 'constants/type_constants.asm',
  'constants/cry_constants.asm', 'constants/music_constants.asm', 'constants/map_object_constants.asm', 'constants/sprite_constants.asm',
  'constants/sprite_data_constants.asm', 'constants/trainer_constants.asm', 'constants/trainer_data_constants.asm', 'constants/sprite_anim_constants.asm',
  'constants/mobile_constants.asm', 'constants/battle_tower_constants.asm', 'constants/serial_constants.asm', 'constants/phone_constants.asm',
  'constants/script_constants.asm', 'constants/menu_constants.asm', 'constants/npc_trade_constants.asm', 'constants/event_flags.asm', 'constants/map_data_constants.asm',
];
const RAM_FILES = ['ram/hram.asm', 'ram/vram.asm', 'ram/wram.asm'];
const SOURCES = [
  'engine/battle_anims/anim_commands.asm', 'engine/battle_anims/core.asm', 'engine/battle_anims/functions.asm', 'engine/battle_anims/helpers.asm',
  'engine/battle_anims/bg_effects.asm', 'data/moves/animations.asm', 'engine/battle_anims/pokeball_wobble.asm',
];
const ROM_BASE = 0x0150;
// RAM the host reads or writes besides what the code itself refers to.
const HOST_RAM = ['wRequested2bppSource', 'wRequested2bppDest', 'wRequested2bppSize', 'wLYOverrides', 'wLYOverridesEnd', 'wLYOverridesBackup', 'wShadowOAM', 'wTilemap', 'wAttrmap',
  'wBGPals1', 'wBGPals2', 'wOBPals1', 'wOBPals2', 'wBGP', 'wOBP0', 'wOBP1', 'hSCX', 'hSCY', 'hLCDCPointer', 'hLYOverrideStart', 'hLYOverrideEnd', 'hBattleTurn',
  'wBattleAnimAddress', 'wBattleAnimParent', 'wBattleAnimEnd', 'wBattleAnimByte', 'wFXAnimID', 'wBattleAnimParam', 'wBattleAfterAnim', 'wActiveAnimObjects', 'wActiveBGEffects', 'hCGB'];
const RST_FARCALL = 0x08;
const KEPT_CONSTANTS = /^(ANIM_|BATTLE_ANIM_|BATTLE_BG_EFFECT_|BG_EFFECT_|PAL_BATTLE_|BATTLEANIM|NUM_BATTLE_ANIM|NUM_BG_EFFECT|BATTLE_AFTERANIMS|NUM_MOVES|FIRST_BATTLE_ANIM_CMD)/;

/** gfx/*.png as the 2bpp bytes the build makes of it: 16 bytes a tile, tiles in reading order. */
function bytes2bpp(grayPng, path) {
  const { width, height, pixels } = grayPng(path);
  const out = [];
  for (let ty = 0; ty < height / 8; ty++) for (let tx = 0; tx < width / 8; tx++) {
    for (let y = 0; y < 8; y++) {
      let lo = 0, hi = 0;
      for (let x = 0; x < 8; x++) { const v = Number(pixels[(ty * 8 + y) * width + tx * 8 + x]); lo = (lo << 1) | (v & 1); hi = (hi << 1) | (v >> 1); }
      out.push(lo, hi);
    }
  }
  return out;
}

export function battleAnimData({ root, grayPng, cut, rgbs, text }) {
  const sources = (setup) => {
    const a = new Assembler(root);
    if (setup) a.layout = setup;
    for (const f of CONSTANT_FILES) a.include(f);
    a.section = null;
    for (const f of RAM_FILES) a.include(f);
    return a;
  };
  const scratch = sources(null);
  const sizes = new Map();
  for (const s of scratch.sections) sizes.set(s.name, Math.max(sizes.get(s.name) ?? 0, Math.max(s.maxPc ?? 0, s.pc) - s.base));
  const a = sources(layoutFromLink(readFileSync(join(root, 'layout.link'), 'utf8'), sizes));
  a.setConst('FarCall', RST_FARCALL);
  a.setConst('sScratch', 0xa000);                          // the SRAM scratch buffer (an address of its own, unlike the other stand-ins)
  a.incbin = (path) => (/\.2bpp$/.test(path) ? bytes2bpp(grayPng, path.replace(/\.2bpp$/, '.png')) : null);
  a.defineSection(['"battle_anims"', `ROMX[$${ROM_BASE.toString(16)}]`]);
  for (const f of SOURCES) a.include(f);
  const image = a.link();
  const end = a.section.pc;

  // Labels the code and the host refer to: every global ROM label of the image, and the RAM names the image uses.
  const symbols = {}, ram = {};
  for (const [name, sym] of a.symbols) {
    if (sym.address === undefined || name.includes('.')) continue;
    if (sym.section === a.section) symbols[name] = sym.address;
    else if (a.referenced?.has(name) || HOST_RAM.includes(name)) ram[name] = sym.address;
  }
  const constants = {};
  for (const [name, sym] of a.symbols) if (sym.value !== undefined && typeof sym.value === 'number' && KEPT_CONSTANTS.test(name)) constants[name] = sym.value;
  for (const name of ['B_OAM_XFLIP', 'B_OAM_YFLIP', 'OAM_XFLIP', 'OAM_YFLIP', 'OAM_PRIO']) { const v = a.symbols.get(name)?.value; if (v !== undefined) constants[name] = v; }

  // The graphics sets (BATTLE_ANIM_GFX_*): how many tiles each loads and which png they come from.
  const labelFiles = Object.fromEntries([...text('gfx/battle_anims.asm').matchAll(/^(\w+):\s*INCBIN "gfx\/battle_anims\/(\w+)\.2bpp\.lz"/gm)].map((m) => [m[1], m[2]]));
  const gfx = [...text('data/battle_anims/object_gfx.asm').matchAll(/anim_obj_gfx\s+(\d+),\s*(\w+)/g)].map((m) => ({ tiles: Number(m[1]), label: m[2], file: labelFiles[m[2]] ?? null }));
  const sheets = {};
  for (const file of new Set(gfx.map((g) => g.file).filter(Boolean))) {
    const { width, height } = grayPng(`gfx/battle_anims/${file}.png`);
    const count = Math.max(...gfx.filter((g) => g.file === file).map((g) => g.tiles));
    sheets[file] = cut(`gfx/battle_anims/${file}.png`, width, height / 8).slice(0, count);
  }

  const rom = Buffer.from(image.bytes.subarray(ROM_BASE, end)).toString('base64');
  const externals = a.externals ? Object.fromEntries(a.externals) : {};
  const objectPalettes = [];
  const colors = rgbs(text('gfx/battle_anims/battle_anims.pal'));
  for (let i = 0; i < colors.length; i += 4) objectPalettes.push(colors.slice(i, i + 4));
  return { rom: { base: ROM_BASE, end, data: rom }, symbols, ram, externals, constants, gfx, sheets, objectPalettes };
}
