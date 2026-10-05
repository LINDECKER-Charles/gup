import { setActiveLocale } from "./core/i18n/locale.js";
import { resolveLocale } from "./core/i18n/resolve-locale.js";
import { isSupportedNode, NODE_FLOOR_TEXT } from "./core/node-floor.js";
import { ERROR_LABELS } from "./ui/text/cli-labels.js";

/**
 * The installed entry point (`bin`: `dist/cli.js`). On a Node older than gup
 * needs, it says which one to install instead of letting the program fail
 * somewhere further: npm installs gup there, `engines` being lower on purpose
 * (see `MIN_NODE`). Otherwise it loads the program, a bundle of its own
 * (`dist/main.js`).
 *
 * So this file must run on any Node: it imports only modules that hold
 * plain text and checks, and none of the program's. The program's specifier
 * is held in a variable typed `string` so that neither TypeScript nor the
 * bundler resolves it: bundled, the program would be inlined into this file,
 * its static imports hoisted above the check. `tsx src/cli.ts` loads
 * `src/main.ts` the same way.
 */
const PROGRAM: string = "./main.js";
const FAILURE_EXIT_CODE = 1;

if (isSupportedNode(process.versions.node)) {
  await import(PROGRAM);
} else {
  // `GUP_LANG` alone picks the language, as for the elevated child: the
  // settings file belongs to the program, which does not load here.
  setActiveLocale(resolveLocale({ env: process.env }).locale);
  process.stderr.write(`${ERROR_LABELS.prefix} ${NODE_FLOOR_TEXT.refusal(process.version)}\n`);
  process.exitCode = FAILURE_EXIT_CODE;
}
