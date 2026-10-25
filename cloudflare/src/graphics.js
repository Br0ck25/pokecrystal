/**
 * Decoder for the pokecrystal tools/lzcompress.c stream format.
 *
 * Supports literal, iterate, alternate, zero, repeat, bit-flip, reverse,
 * extended-length commands and the 0xff terminator. Input is the compressed
 * payload as a Uint8Array; output is the decoded byte stream.
 */
function reverseBits(byte) {
  let result = 0;
  for (let bit = 0; bit < 8; bit++) result |= ((byte >> bit) & 1) << (7 - bit);
  return result;
}

export function decompressCrystalLz(input, { maxOutputBytes = 16 * 1024 * 1024 } = {}) {
  if (!(input instanceof Uint8Array)) throw new TypeError('input must be a Uint8Array');
  const output = [];
  let i = 0;
  let ended = false;

  const requireBytes = count => {
    if (i + count > input.length) throw new Error('Truncated Crystal LZ command');
  };
  const append = value => {
    if (output.length >= maxOutputBytes) throw new Error('Crystal LZ output exceeds safety limit');
    output.push(value & 0xff);
  };

  while (i < input.length) {
    const header = input[i++];
    if (header === 0xff) {
      ended = true;
      break;
    }

    let command = header >> 5;
    let length = header & 0x1f;
    if (command === 7) {
      command = length >> 2;
      requireBytes(1);
      length = ((length & 3) << 8) | input[i++];
    }
    length += 1;

    switch (command) {
      case 0: // literal bytes
        requireBytes(length);
        for (let j = 0; j < length; j++) append(input[i++]);
        break;
      case 1: { // repeat one byte
        requireBytes(1);
        const value = input[i++];
        for (let j = 0; j < length; j++) append(value);
        break;
      }
      case 2: { // alternate two bytes
        requireBytes(2);
        const first = input[i++];
        const second = input[i++];
        for (let j = 0; j < length; j++) append(j & 1 ? second : first);
        break;
      }
      case 3: // zeros
        for (let j = 0; j < length; j++) append(0);
        break;
      case 4:
      case 5:
      case 6: { // lookback: repeat, bit-flip, reverse
        requireBytes(1);
        let offset = input[i++];
        if (offset & 0x80) {
          offset = -( (offset & 0x7f) + 1 );
        } else {
          requireBytes(1);
          offset = (offset << 8) | input[i++];
        }
        const base = offset < 0 ? output.length + offset : offset;
        for (let j = 0; j < length; j++) {
          const sourceIndex = command === 6 ? base - j : base + j;
          if (sourceIndex < 0 || sourceIndex >= output.length) {
            throw new Error('Crystal LZ lookback points outside decoded data');
          }
          const value = output[sourceIndex];
          append(command === 5 ? reverseBits(value) : value);
        }
        break;
      }
      default:
        throw new Error(`Unsupported Crystal LZ command: ${command}`);
    }
  }

  if (!ended) throw new Error('Crystal LZ stream has no 0xff terminator');
  return Uint8Array.from(output);
}

/**
 * Decode Game Boy 2bpp tile bytes into palette indices.
 * Each tile is 16 bytes: two bitplanes per row, most-significant bit first.
 */
export function decodeGameBoy2bppTiles(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be a Uint8Array');
  if (bytes.length % 16 !== 0) throw new Error('2bpp tile data length must be a multiple of 16');
  const tileCount = bytes.length / 16;
  const pixels = new Uint8Array(tileCount * 64);

  for (let tile = 0; tile < tileCount; tile++) {
    const tileOffset = tile * 16;
    const pixelOffset = tile * 64;
    for (let y = 0; y < 8; y++) {
      const low = bytes[tileOffset + y * 2];
      const high = bytes[tileOffset + y * 2 + 1];
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x;
        pixels[pixelOffset + y * 8 + x] = ((low >> bit) & 1) | (((high >> bit) & 1) << 1);
      }
    }
  }
  return { tileCount, pixels };
}
