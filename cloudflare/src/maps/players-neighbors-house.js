/** Event metadata transcribed from maps/PlayersNeighborsHouse.asm. The upstream repository does not contain maps/PlayersNeighborsHouse.blk, so block layout is marked as a visual fallback until the original grid is located. */
export const PLAYERS_NEIGHBORS_HOUSE=Object.freeze({
 id:'PLAYERS_NEIGHBORS_HOUSE',group:'NEW_BARK',
 dimensions:Object.freeze({blocksWide:4,blocksHigh:4,metatilesWide:8,metatilesHigh:8,blockSizeMetatiles:2}),
 warps:Object.freeze([{x:2,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:3},{x:3,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:3}]),
 coordinateEvents:Object.freeze([]),
 backgroundEvents:Object.freeze([{x:0,y:1,kind:'bookshelf',text:'A bookshelf full of books.'},{x:1,y:1,kind:'bookshelf',text:'A bookshelf full of books.'},{x:7,y:1,kind:'radio',text:'POKéMON CHANNEL…'}]),
 objects:Object.freeze([
 {id:'DAUGHTER',x:2,y:3,script:'PlayersNeighborsDaughterScript',dialogue:['PIKACHU is an evolved Pokémon.','I wish I could be a researcher like Professor Elm…']},
 {id:'NEIGHBOR',x:5,y:3,script:'PlayersNeighborScript',dialogue:["My daughter wants to become Professor Elm's assistant.","She really loves Pokémon!"]}
 ])
});
export function playersNeighborsHouseEventsAt(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=8||y>=8)return [];return [...PLAYERS_NEIGHBORS_HOUSE.warps.filter(e=>e.x===x&&e.y===y).map(e=>({type:'warp',...e})),...PLAYERS_NEIGHBORS_HOUSE.backgroundEvents.filter(e=>e.x===x&&e.y===y).map(e=>({type:'background',...e})),...PLAYERS_NEIGHBORS_HOUSE.objects.filter(e=>e.x===x&&e.y===y).map(e=>({type:'object',...e}))]}
