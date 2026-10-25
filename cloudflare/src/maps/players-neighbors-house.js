/** Event metadata transcribed from maps/PlayersNeighborsHouse.asm. */
export const PLAYERS_NEIGHBORS_HOUSE=Object.freeze({
 id:'PLAYERS_NEIGHBORS_HOUSE',tileset:'HOUSE',group:'NEW_BARK',
 dimensions:Object.freeze({blocksWide:4,blocksHigh:4,metatilesWide:8,metatilesHigh:8,blockSizeMetatiles:2}),
 warps:Object.freeze([{x:2,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:3},{x:3,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:3}]),
 coordinateEvents:Object.freeze([]),
 backgroundEvents:Object.freeze([{x:0,y:1,kind:'bookshelf',text:'A bookshelf full of magazines.'},{x:1,y:1,kind:'bookshelf',text:'A bookshelf full of magazines.'},{x:7,y:1,kind:'radio',text:'POKéMON CHANNEL…'}]),
 objects:Object.freeze([
 {id:'DAUGHTER',x:2,y:3,script:'PlayersNeighborsDaughterScript',dialogue:['PIKACHU is an evolved POKéMON.','I was amazed by PROF. ELM’s findings.','He’s so famous for his research on POKéMON evolution.','…sigh…','I wish I could be a researcher like him…']},
 {id:'NEIGHBOR',x:5,y:3,script:'PlayersNeighborScript',dialogue:['My daughter is adamant about becoming PROF. ELM’s assistant.','She really loves POKéMON!','But then, so do I!']}
 ])
});
export function playersNeighborsHouseEventsAt(x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=8||y>=8)return [];return [...PLAYERS_NEIGHBORS_HOUSE.warps.filter(e=>e.x===x&&e.y===y).map(e=>({type:'warp',...e})),...PLAYERS_NEIGHBORS_HOUSE.backgroundEvents.filter(e=>e.x===x&&e.y===y).map(e=>({type:'background',...e})),...PLAYERS_NEIGHBORS_HOUSE.objects.filter(e=>e.x===x&&e.y===y).map(e=>({type:'object',...e}))]}
