export const PLAYERS_HOUSE_1F = Object.freeze({
 id:'PLAYERS_HOUSE_1F',tileset:'PLAYERS_HOUSE', group:'NEW_BARK',
 dimensions:Object.freeze({blocksWide:5,blocksHigh:4,metatilesWide:10,metatilesHigh:8,blockSizeMetatiles:2}),
 warps:Object.freeze([
 {x:6,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:2},
 {x:7,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:2},
 {x:9,y:0,destinationMap:'PLAYERS_HOUSE_2F',destinationWarp:1}
 ]),
 coordinateEvents:Object.freeze([]),
 backgroundEvents:Object.freeze([
 {x:0,y:1,kind:'stove',text:"Mom's specialty! CINNABAR VOLCANO BURGER."},
 {x:1,y:1,kind:'sink',text:'The sink is spotless. Mom likes it clean.'},
 {x:2,y:1,kind:'fridge',text:'Let’s see what’s in the fridge… FRESH WATER and tasty LEMONADE!'},
 {x:4,y:1,kind:'tv',text:"There's a movie on TV: Stars dot the sky as two boys ride on a train… I'd better get rolling too!"}
 ]),
 objects:Object.freeze([
 {id:'MOM',x:7,y:4,script:'MomScript',dialogue:['PROF. ELM was looking for you.','Your POKéGEAR is back from the repair shop.']},
 {id:'NEIGHBOR',x:4,y:4,sprite:'SPRITE_POKEFAN_F',script:'NeighborScript',dialogue:['Hello! I\'m visiting!','Have you heard? My daughter is adamant about becoming PROF. ELM\'s assistant. She really loves POKéMON!']}
 ])
});
export function playersHouse1fEventsAt(x,y){return eventsAt(PLAYERS_HOUSE_1F,x,y)}
function eventsAt(map,x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.dimensions.metatilesWide||y>=map.dimensions.metatilesHigh)return [];return [...map.warps.filter(e=>e.x===x&&e.y===y).map(e=>({type:'warp',...e})),...map.backgroundEvents.filter(e=>e.x===x&&e.y===y).map(e=>({type:'background',...e})),...map.objects.filter(e=>e.x===x&&e.y===y).map(e=>({type:'object',...e}))]}
