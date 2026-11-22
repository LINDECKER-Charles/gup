/** RFC 4648 base32, the encoding authenticator apps expect a TOTP secret in. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BITS_PER_CHAR = 5;
const BITS_PER_BYTE = 8;
const CHAR_MASK = 0b11111;
const BYTE_MASK = 0xff;
/** What people add when they copy a key by hand: spaces, dashes, padding. */
const IGNORED = /[\s=-]/g;

export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << BITS_PER_BYTE) | byte;
    bits += BITS_PER_BYTE;
    while (bits >= BITS_PER_CHAR) {
      bits -= BITS_PER_CHAR;
      output += ALPHABET[(buffer >>> bits) & CHAR_MASK];
    }
  }
  if (bits > 0) output += ALPHABET[(buffer << (BITS_PER_CHAR - bits)) & CHAR_MASK];
  return output;
}

/** Case-insensitive, unpadded or padded; throws on any character outside the alphabet. */
export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text.replace(IGNORED, "").toUpperCase()) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) throw new Error(`"${char}" is not a base32 character`);
    buffer = (buffer << BITS_PER_CHAR) | value;
    bits += BITS_PER_CHAR;
    if (bits >= BITS_PER_BYTE) {
      bits -= BITS_PER_BYTE;
      bytes.push((buffer >>> bits) & BYTE_MASK);
    }
  }
  return Buffer.from(bytes);
}
