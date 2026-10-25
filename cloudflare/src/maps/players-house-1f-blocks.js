/** Source .blk block IDs from upstream pokecrystal; blob SHA verified against GitHub. */
import { PLAYERS_HOUSE_1F } from './players-house-1f.js';
import { getTilesetCollision } from './tileset-collision.js';
export const PLAYERS_HOUSE_1F_BLOCK_IDS=Object.freeze([7,15,17,5,10,3,22,8,9,3,3,3,12,13,3,3,3,3,6,3]);
export function getPlayersHouse1fBlockAtMetatile(x,y){
 const d=PLAYERS_HOUSE_1F.dimensions;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=d.metatilesWide||y>=d.metatilesHigh)return null;
 return PLAYERS_HOUSE_1F_BLOCK_IDS[Math.floor(y/2)*d.blocksWide+Math.floor(x/2)];
}
export function getPlayersHouse1FCollisionAtMetatile(x,y){
 const blockId=getPlayersHouse1fBlockAtMetatile(x,y);
 return blockId===null?null:getTilesetCollision('PLAYERS_HOUSE',blockId,(y%2)*2+(x%2));
}
