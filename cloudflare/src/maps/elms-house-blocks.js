/** Source .blk block IDs from upstream pokecrystal; blob SHA verified against GitHub. */
import { ELMS_HOUSE } from './elms-house.js';
import { getTilesetCollision } from './tileset-collision.js';
export const ELMS_HOUSE_BLOCK_IDS=Object.freeze([16,1,17,27,25,8,9,3,3,12,13,3,3,6,3,3]);
export function getElmsHouseBlockAtMetatile(x,y){
 const d=ELMS_HOUSE.dimensions;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=d.metatilesWide||y>=d.metatilesHigh)return null;
 return ELMS_HOUSE_BLOCK_IDS[Math.floor(y/2)*d.blocksWide+Math.floor(x/2)];
}
export function getElmsHouseCollisionAtMetatile(x,y){
 const blockId=getElmsHouseBlockAtMetatile(x,y);
 return blockId===null?null:getTilesetCollision('PLAYERS_HOUSE',blockId,(y%2)*2+(x%2));
}
