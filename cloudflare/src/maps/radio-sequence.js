/** Small, testable version of Crystal's first-radio-listen event. */
export function advanceRadioSequence({ starter = null, listened = false, stage = 0 } = {}) {
  if (starter) {
    return { listened, stage: 0, text: 'POKéMON! POKéMON CHANNEL…' };
  }
  if (listened) {
    return { listened: true, stage: 0, text: 'POKéMON! POKéMON CHANNEL…' };
  }
  if (stage <= 0) return { listened: false, stage: 1, text: "PROF. OAK'S POKéMON TALK! Please tune in next time!" };
  if (stage === 1) return { listened: false, stage: 2, text: 'POKéMON CHANNEL!' };
  if (stage === 2) return { listened: false, stage: 3, text: 'This is DJ MARY, your co-host!' };
  return { listened: true, stage: 0, text: 'POKéMON! POKéMON CHANNEL…' };
}
