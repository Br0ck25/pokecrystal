export const ELMS_HOUSE = Object.freeze({
 id:'ELMS_HOUSE',tileset:'PLAYERS_HOUSE',group:'NEW_BARK',
 dimensions:Object.freeze({blocksWide:4,blocksHigh:4,metatilesWide:8,metatilesHigh:8,blockSizeMetatiles:2}),
 warps:Object.freeze([{x:2,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:4},{x:3,y:7,destinationMap:'NEW_BARK_TOWN',destinationWarp:4}]),
 coordinateEvents:Object.freeze([]),
 backgroundEvents:Object.freeze([
 {x:0,y:1,kind:'pc',text:"POKéMON. Where do they come from? Where are they going? Why has no one ever witnessed a POKéMON's birth? I want to know! I will dedicate my life to the study of POKéMON! … It's a part of PROF. ELM's research papers."},
 {x:6,y:1,kind:'bookshelf',text:'A bookshelf full of difficult books.'},{x:7,y:1,kind:'bookshelf',text:'A bookshelf full of difficult books.'}
 ]),
 objects:Object.freeze([
 {id:'ELMS_WIFE',x:1,y:5,sprite:'SPRITE_TEACHER',script:'ElmsWife',dialogue:["Hi, <PLAYER>! My husband's always so busy--I hope he's OK.","When he's caught up in his POKéMON research, he even forgets to eat."]},
 {id:'ELMS_SON',x:5,y:4,sprite:'SPRITE_BUG_CATCHER',script:'ElmsSon',dialogue:["When I grow up, I'm going to help my dad!","I'm going to be a great Pokémon professor!"]}
 ])
});
export function elmsHouseEventsAt(x,y){return eventsAt(ELMS_HOUSE,x,y)}
function eventsAt(map,x,y){if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.dimensions.metatilesWide||y>=map.dimensions.metatilesHigh)return [];return [...map.warps.filter(e=>e.x===x&&e.y===y).map(e=>({type:'warp',...e})),...map.backgroundEvents.filter(e=>e.x===x&&e.y===y).map(e=>({type:'background',...e})),...map.objects.filter(e=>e.x===x&&e.y===y).map(e=>({type:'object',...e}))]}
