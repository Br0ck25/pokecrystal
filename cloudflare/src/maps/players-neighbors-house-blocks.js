/** Temporary rendering fallback: upstream maps/PlayersNeighborsHouse.blk is absent from the checked-in source. Uses the Elm-house grid only to make the building traversable; not a source-accurate layout. */
import { PLAYERS_NEIGHBORS_HOUSE } from './players-neighbors-house.js';
import { ELMS_HOUSE_BLOCK_IDS } from './elms-house-blocks.js';
import { getJohtoMetatileCollision } from './johto-collision.js';
export const PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS=Object.freeze([...ELMS_HOUSE_BLOCK_IDS]);
export function getPlayersNeighborsHouseCollisionAtMetatile(x,y){
 const d=PLAYERS_NEIGHBORS_HOUSE.dimensions;
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=d.metatilesWide||y>=d.metatilesHigh)return null;
 const id=PLAYERS_NEIGHBORS_HOUSE_BLOCK_IDS[Math.floor(y/2)*d.blocksWide+Math.floor(x/2)];
 return getJohtoMetatileCollision(id,(y%2)*2+(x%2));
}
