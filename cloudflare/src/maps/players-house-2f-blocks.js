/** Source .blk block IDs from upstream pokecrystal; blob SHA verified against GitHub. */
import { MAPS } from '../generated/maps.js';
import { PLAYERS_HOUSE_2F } from './players-house-2f.js';
import { getTilesetCollision } from './tileset-collision.js';
export const PLAYERS_HOUSE_2F_BLOCK_IDS = MAPS.PLAYERS_HOUSE_2F.blocks;
export function getPlayersHouse2fBlockAtMetatile(x,y){
 const d=PLAYERS_HOUSE_2F.dimensions;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=d.metatilesWide||y>=d.metatilesHigh)return null;
 return PLAYERS_HOUSE_2F_BLOCK_IDS[Math.floor(y/2)*d.blocksWide+Math.floor(x/2)];
}
export function getPlayersHouse2FCollisionAtMetatile(x,y){
 const blockId=getPlayersHouse2fBlockAtMetatile(x,y);
 return blockId===null?null:getTilesetCollision('PLAYERS_ROOM',blockId,(y%2)*2+(x%2));
}
