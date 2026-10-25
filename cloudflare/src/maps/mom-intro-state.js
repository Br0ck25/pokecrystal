/** Small, testable state helpers for the opening Mom script in maps/PlayersHouse1F.asm. */
export function momChoiceField(stage) {
  if (stage === 2) return 'momDstChoiceYes';
  if (stage === 3) return 'momPhoneChoiceYes';
  return null;
}

/** Persist a yes/no movement to the choice for the active Mom prompt only. */
export function storeMomChoice(state, stage, choiceYes) {
  if (!state || typeof state !== 'object' || typeof choiceYes !== 'boolean') return false;
  const field = momChoiceField(stage);
  if (!field) return false;
  state[field] = choiceYes;
  state.momChoiceYes = choiceYes;
  return true;
}

/** Finish the daylight-saving prompt and open the independent phone tutorial choice. */
export function beginMomPhoneQuestion(state) {
  if (!state || typeof state !== 'object' || state.momIntroStage !== 2) return false;
  state.momDstChoiceYes = state.momChoiceYes;
  state.momIntroStage = 3;
  state.momPhoneChoiceYes = true;
  state.momChoiceYes = true;
  return true;
}
