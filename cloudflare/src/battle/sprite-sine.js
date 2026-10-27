// Sprites_Sine (engine/gfx/sprites.asm): `d` * sin(a * pi / 32) from the game's 8.8 sine table; a is a 6-bit angle, the result a signed byte.
export function sine(d, a) {
  a &= 63;
  const v = Math.round(Math.sin(((a & 31) / 64) * 2 * Math.PI) * 256);
  const h = ((d * v) & 0xffff) >> 8;
  return a >= 32 ? -h : h;
}
