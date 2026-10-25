/** State-dependent New Bark Town dialogue translated from maps/NewBarkTown.asm. */
export function getNewBarkTownObjectDialogue(object, state = {}) {
  if (!object) return [];
  if (object.id === 'NEWBARKTOWN_TEACHER') {
    if (state.talkedToMomAfterMysteryEggQuest) {
      return ['Call your mom on your POKéGEAR to let her know how you’re doing.'];
    }
    if (state.gaveMysteryEggToElm) {
      return ['Hi, <PLAYER>! Leaving again?', 'You should tell your mom if you are leaving.'];
    }
    if (state.starter) {
      return ['Oh! Your POKéMON is adorable!', 'I wish I had one!'];
    }
  }
  return Array.isArray(object.dialogue) ? object.dialogue : [];
}
