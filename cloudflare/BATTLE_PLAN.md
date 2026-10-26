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
Done: `src/battle/damage.js` (DamageStats, DamageCalc, Critical, Stab with weather/badges/type chart, DamageVariation), checked against 67 ROM hits with `tools/reference/damage`. `src/battle/accuracy.js` (CheckHit; unit-tested only, not yet compared with the ROM). `src/battle/battle.js` (state, move order, wild move choice, CheckTurn, the NormalHit script, stat stage commands, faint, win) and `experience.js` (GiveExperiencePoints, level up, LearnMove), unit-tested only. Not ported yet: badge stat boosts, running, switching, items, catching, poison/burn/other status, most effect commands (the interpreter throws `unported battle command: X` for them), trainers/AI, all battle UI, wild encounters. Was: the turn loop, everything after step 1. Party Pokémon (stats, moves, exp) exist in `src/script/mon.js`.

## Explained
- The 3 unmatched ROM hits (a MAROWAK losing 10 HP) are BattleCommand_CheckObedience: the probe plants a Pokémon with a foreign OT ID, and with no badges it only obeys up to level 10, so a level 30 one sometimes "hurt itself in its confusion" (HitConfusion, effect_commands.asm:768). `checkobedience` is still a no-op in `battle.js`; port it (obedience levels by badge, the ignored-orders/loafing/sleep texts, HitConfusion) before traded Pokémon matter.

## Status (UI)
- `src/battle/screen.js` shows a wild battle (HUDs, text box, FIGHT/RUN menu, move list) driven by `Battle.run()`; `Game.startWildBattle` opens it and `wild.js` + `Game.checkWildEncounter` trigger it on grass. `?battle=SPECIES:LEVEL&mon=SPECIES:LEVEL` opens one directly (tools).
- Not ported: transition, sliding intro, send-out/faint animations, move animations, exp bar animation, PKMN/PACK menus, blackout after losing, layout checks against the ROM (compare with `tools/reference/damage/shots_probe.py` screenshots).

## Status (second pass)
- Ported and fuzz-checked (2000 random battles with random move sets run without errors): all move effect commands except `forceswitch` against trainers, `triplekick` damage growth, Beat Up for trainers and Present's animation order; between-turn effects; fainting and forced switching; PKMN menu; balls (POKE/GREAT/ULTRA/MASTER; other balls throw `unported ball`); capture to party or box with nickname; Pokédex seen/caught sets; whiteout.
- Verified against the ROM: damage, experience, catch rate at full HP, the menu/move list/intro frames, animation-free timings. Not verified: status effects, stat changes, switching text timing, capture animation timing.
- Not ported: move/ball/send-out animations (their time is only waited), exp bar animation, level-up stats box, evolution after battle, trainers (sight, parties, AI, rewards, `AI` scoring), Pokédex/PC screens, items other than balls in battle, badge stat boosts, held-item effects (berries), CheckObedience, Safari/Bug Contest.

## Trainer battles (status)
- Done: trainer scripts and sight, party building, enemy switching, rewards, can-lose battles (rival), AI move choice / items / switching (compared with the real game: `tools/reference/damage/ai_scen.mjs` + `ai_probe3.py` + `ai_verify.mjs`, 300 move situations and 80 item/switch situations match), spikes, Roar/Whirlwind.
- Open: ROM timing of the trainer intro/outro (battle transition, slide-ins; `trainer_timeline_probe.py` records the ROM frames), PursuitSwitch vs an AI switch, AI_Smart_Conversion2 on the first turn.
