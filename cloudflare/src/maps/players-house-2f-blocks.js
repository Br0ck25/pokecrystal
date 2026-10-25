/** Source .blk block IDs from upstream pokecrystal; blob SHA verified against GitHub. */
import { MAPS } from '../generated/maps.js';
import { PLAYERS_HOUSE_2F } from './players-house-2f.js';
import { getTilesetCollision } from './tileset-collision.js';
export const PLAYERS_HOUSE_2F_BLOCK_IDS = MAPS.PLAYERS_HOUSE_2F.blocks;

// The room as a new game shows it. engine/overworld/decorations.asm: InitDecorations gives the player
// DECO_FEATHERY_BED and DECO_TOWN_MAP; ToggleMaptileDecorations writes their block IDs
// (data/decorations/attributes.asm: $1b and $1f) over the .blk at 16px map coordinates (0,4) and (6,0),
// i.e. blocks (0,2) and (3,0) (home/map.asm GetBlockLocation: block = coordinate / 2).
export const NEW_GAME_DECORATION_BLOCKS = Object.freeze([
  Object.freeze({ blockX: 0, blockY: 2, blockId: 0x1b }), // feathery bed
  Object.freeze({ blockX: 3, blockY: 0, blockId: 0x1f }), // town map poster
]);
export const PLAYERS_HOUSE_2F_DECORATED_BLOCK_IDS = Object.freeze(PLAYERS_HOUSE_2F_BLOCK_IDS.map((id, i) => {
  const { width: blocksWide } = MAPS.PLAYERS_HOUSE_2F;
  const deco = NEW_GAME_DECORATION_BLOCKS.find((d) => d.blockY * blocksWide + d.blockX === i);
  return deco ? deco.blockId : id;
}));
export function getPlayersHouse2fBlockAtMetatile(x,y){
 const d=PLAYERS_HOUSE_2F.dimensions;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=d.metatilesWide||y>=d.metatilesHigh)return null;
 return PLAYERS_HOUSE_2F_DECORATED_BLOCK_IDS[Math.floor(y/2)*d.blocksWide+Math.floor(x/2)];
}
export function getPlayersHouse2FCollisionAtMetatile(x,y){
 const blockId=getPlayersHouse2fBlockAtMetatile(x,y);
 return blockId===null?null:getTilesetCollision('PLAYERS_ROOM',blockId,(y%2)*2+(x%2));
}
