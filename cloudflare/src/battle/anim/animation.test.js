import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleAnimation, animationId } from './animation.js';
import { Cpu } from './sm83.js';

const pic = (size, palette) => ({ size, pixels: '1'.repeat(size * size), palette, offX: 0, offY: 0 });
const green = [[31, 31, 31], [12, 25, 1], [5, 14, 0], [0, 0, 0]];

test('the SM83 interpreter loops, calls and returns', () => {
  const mem = new Uint8Array(0x10000);
  // ld a,5; ld b,3; loop: add a,b; dec b; jr nz,loop; call $0010; (stop hook at $000b); $0010: inc a; ret
  mem.set([0x3e, 0x05, 0x06, 0x03, 0x80, 0x05, 0x20, 0xfc, 0xcd, 0x10, 0x00, 0x00], 0);
  mem.set([0x3c, 0xc9], 0x10);
  const cpu = new Cpu({ read: (a) => mem[a], write: (a, v) => { mem[a] = v; } });
  cpu.hooks.set(0x0b, () => 'stop');
  cpu.run();
  assert.equal(cpu.a, 12);
});

test('ANIM_SEND_OUT_MON runs the real engine: the ball poofs, the Pokémon enters (52 frames: 47 BattleAnimDelayFrames and 5 DelayFrames)', () => {
  const id = animationId('SEND_OUT_MON');
  assert.ok(id > 0);
  const anim = new BattleAnimation({ id, user: 0, enemy: { pic: pic(56, green), shown: true }, player: { pic: pic(48, green), shown: false }, random: () => 0 });
  let frames = 0, sprites = 0, shown = 0;
  while (!anim.update()) {
    frames++;
    sprites = Math.max(sprites, anim.sprites().length);
    shown = Math.max(shown, anim.cells().filter(([x, y]) => x < 8 && y >= 6).length);
  }
  assert.equal(frames + 1, 52);
  assert.ok(sprites > 0, 'the smoke is drawn with objects');
  assert.ok(shown > 0, 'the Pokémon appears on the tilemap');
});

test('TACKLE blanks the user\'s HUD while it runs and scrolls the user forward', () => {
  const anim = new BattleAnimation({ id: animationId('TACKLE'), user: 0, enemy: { pic: pic(56, green), shown: true }, player: { pic: pic(48, green), shown: true }, random: () => 0 });
  let hudsHidden = false, scrolled = false;
  while (!anim.update()) {
    if (!anim.hud(0)) hudsHidden = true;
    const scroll = anim.scroll();
    if (scroll && scroll.x.some((v) => v !== 0)) scrolled = true;
  }
  assert.ok(hudsHidden);
  assert.ok(scrolled);
});
