/** RFC 5321: a path is 256 octets with its brackets, so an address is 254 at most. */
export const MAX_EMAIL_LENGTH = 254;
/**
 * One address, no display name, no list: something@domain.tld. Deliberately
 * loose on the local part; strict on what could smuggle a second recipient
 * or a header (spaces, line breaks, `<`, `>`, `,`, `;`).
 */
const ADDRESS_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function isEmailAddress(text: string): boolean {
  return text.length <= MAX_EMAIL_LENGTH && ADDRESS_PATTERN.test(text);
}
