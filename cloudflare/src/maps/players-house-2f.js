export const PLAYERS_HOUSE_2F = Object.freeze({
 id:'PLAYERS_HOUSE_2F',group:'NEW_BARK',
 dimensions:Object.freeze({blocksWide:4,blocksHigh:3,metatilesWide:8,metatilesHigh:6,blockSizeMetatiles:2}),
 warps:Object.freeze([{x:7,y:0,destinationMap:'PLAYERS_HOUSE_1F',destinationWarp:3}]),
 coordinateEvents:Object.freeze([]),
 backgroundEvents:Object.freeze([
 {x:2,y:1,kind:'pc',text:'The PC is here.'},{x:3,y:1,kind:'radio',text:'POKéMON CHANNEL…'},
 {x:5,y:1,kind:'bookshelf',text:'A bookshelf full of books.'},{x:6,y:0,kind:'poster',text:'A poster on the wall.'}
 ]),
 objects:Object.freeze([
 {id:'CONSOLE',x:4,y:2,script:'PlayersHouseGameConsoleScript',dialogue:['A game console.']},
 {id:'DOLL_1',x:4,y:4,script:'PlayersHouseDoll1Script',dialogue:['A doll.']},
 {id:'DOLL_2',x:5,y:4,script:'PlayersHouseDoll2Script',dialogue:['A doll.']}
 ])
});
export function playersHouse2fEventsAt(x,y){return eventsAt(PLAYERS_HOUSE_2F,x,y)}
function eventsAt(map,x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.dimensions.metatilesWide||y>=map.dimensions.metatilesHigh)return [];return [...map.warps.filter(e=>e.x===x&&e.y===y).map(e=>({type:'warp',...e})),...map.backgroundEvents.filter(e=>e.x===x&&e.y===y).map(e=>({type:'background',...e})),...map.objects.filter(e=>e.x===x&&e.y===y).map(e=>({type:'object',...e}))]}
