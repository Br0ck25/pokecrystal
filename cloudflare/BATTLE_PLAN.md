# Battle port plan (status notes for whoever continues)

Goal: a faithful port of `engine/battle/*.asm` (core.asm turn flow, effect_commands.asm, ai/, read_trainer_*.asm, start_battle.asm,
battle_transition.asm, trainer_huds.asm, anim_hp_bar.asm...), driven by the generated tables, verified against the ROM with `tools/reference`.

## Design
- `src/generated/battle-data.js` (from `tools/extract-browser-data.mjs`): type chart, move effect scripts (`data/moves/effects.asm`),
  effect priorities, crit tables, stat/accuracy multipliers. Never hand-edit.
- `src/battle/` — pure logic, frame-free: `BattleState` mirrors the WRAM battle variables (player/enemy mon copies, stat levels,
  substatus bits, turn flag), `commands.js` one function per `BattleCommand_*`, `turn.js` the DoBattle loop as a generator that
  yields UI requests (text, hp bar animation, menu choices) exactly like the script runner. UI panels live in `src/render/`.
- Random numbers come from an injectable `random()` so tests and ROM comparisons can pin them.
- Verify mechanics by forcing a battle in the ROM (walk into grass), reading WRAM (wEnemyMonHP etc.) and comparing with the port given the same
  DVs/levels/random values.

## Order of work
1. Data extraction + damage formula (BattleCommand_DamageStats/DamageCalc/Stab/DamageVariation/Critical/CheckHit) with tests against the ROM.
2. Turn loop for a wild battle: menus, enemy move choice, faint, EXP, level up, catching (balls).
3. Battle UI: transition, intro slide, HUDs, text.
4. Wild encounters (data/wild, step cooldown, repel) hooked into the overworld.
5. Trainers: sight, parties, AI, rewards. Remaining effects. Animations last.

## Status
Done: `src/battle/damage.js` (DamageStats, DamageCalc, Critical, Stab with weather/badges/type chart, DamageVariation), checked against 67 ROM hits with `tools/reference/damage`. `src/battle/accuracy.js` (CheckHit; unit-tested only, not yet compared with the ROM). Not ported yet: the turn loop, everything after step 1. Party Pokémon (stats, moves, exp) exist in `src/script/mon.js`.

## To investigate
- `tools/reference/damage/verify.mjs` leaves 3 of 67 ROM hits unexplained: a MAROWAK loses exactly 10 HP (wCurDamage 10, wTypeModifier 10, no STAB) while the enemy move shown is Tackle/Splash. Record the status and substatus bits at the event to see if it is a confusion hit or a harness mix-up.
