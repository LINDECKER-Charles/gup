/**
 * The installed entry point (`bin`: `dist/cli.js`). The program is a bundle
 * of its own, `dist/main.js`, loaded from here, so that this file runs before
 * any module of the program is evaluated.
 *
 * Held in a variable typed `string` so that neither TypeScript nor the
 * bundler resolves it: bundled, the program would be inlined into this file,
 * its static imports hoisted above everything here. `tsx src/cli.ts` loads
 * `src/main.ts` the same way.
 */
const PROGRAM: string = "./main.js";

await import(PROGRAM);
