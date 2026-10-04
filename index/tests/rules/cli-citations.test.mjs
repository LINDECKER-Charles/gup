/**
 * Every gup command and flag the site cites is one the CLI registers. Cited:
 * the install examples (src/data/structure.js), the JSON tab's command, the
 * code spans of the English catalog (every translation carries the same
 * spans: tests/i18n/catalogs.test.mjs) and the code of llms.txt and
 * llms-full.txt. Registered: the commander declarations of the CLI's sources
 * (src/cli.ts and src/commands/), read as text like scenes-truth does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGS } from "../../build/i18n/load-catalogs.mjs";
import { JSON_SCENE } from "../../src/data/scenes/json-scene.js";
import { STRUCTURE } from "../../src/data/structure.js";

const SITE = fileURLToPath(new URL("../../", import.meta.url));
const CLI = join(SITE, "..");
/** Commander adds them to every program: `.version()` and the help. */
const BUILT_IN_FLAGS = ["-h", "--help", "-V", "--version"];
/** Flags of the tools gup drives, cited as theirs (Homebrew's, in llms-full.txt). */
const FOREIGN_FLAGS = new Set(["--greedy"]);

const CODE_SPAN = /`([^`\n]+)`/g;
const FENCED_BLOCK = /```[^\n]*\n([\s\S]*?)```/g;
const FLAG = /-{1,2}[a-z][\w-]*/g;

/** The commands and flags commander is told about. */
function registered() {
  const commands = join(CLI, "src", "commands");
  const files = readdirSync(commands, { recursive: true })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(commands, file));
  const sources = [join(CLI, "src", "cli.ts"), ...files]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const declared = [...sources.matchAll(/\.(?:option|requiredOption)\(\s*"([^"]+)"/g)];
  return {
    commands: new Set([...sources.matchAll(/\.command\("([\w-]+)/g)].map(([, name]) => name)),
    flags: new Set([...BUILT_IN_FLAGS, ...declared.flatMap(([, flags]) => flags.match(FLAG))]),
  };
}

const stringsOf = (value) =>
  typeof value === "string" ? [value] : Object.values(value).flatMap(stringsOf);

/** Lines of fenced blocks that run gup, without their trailing comment. */
const fencedCommands = (text) =>
  [...text.matchAll(FENCED_BLOCK)]
    .flatMap(([, block]) => block.split("\n"))
    .filter((line) => /^gup\b/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ""));

/** Every command line or code span the site shows. */
function cited() {
  const llms = ["llms.txt", "llms-full.txt"].map((file) =>
    readFileSync(join(SITE, "static", file), "utf8"),
  );
  const spans = [...stringsOf(CATALOGS.en), ...llms].flatMap((text) =>
    [...text.matchAll(CODE_SPAN)].map(([, span]) => span),
  );
  const replayed = JSON_SCENE.lines.flat().map((segment) => segment.t);
  return [
    ...STRUCTURE.examples.map((example) => example.cmd),
    ...replayed.filter((text) => /^gup\b/.test(text)),
    ...spans,
    ...llms.flatMap(fencedCommands),
  ];
}

/** What a cited text claims exists: the command of a gup line, its flags, or a bare flag. */
function claimsOf(text) {
  const words = text.trim().split(/\s+/).map((word) => word.replace(/^\[|\]$/g, ""));
  const flagsOf = (candidates) => candidates.filter((word) => /^-{1,2}[a-z]/.test(word));
  const bare = (flag) => flag.replace(/=.*$/, "");
  if (words[0] !== "gup") return { commands: [], flags: flagsOf(words.slice(0, 1)).map(bare) };
  const command = /^[a-z][\w-]*$/.test(words[1] ?? "") ? [words[1]] : [];
  return { commands: command, flags: flagsOf(words.slice(1)).map(bare) };
}

const cli = registered();
const claims = cited().map(claimsOf);
const citedCommands = new Set(claims.flatMap((claim) => claim.commands));
const citedFlags = new Set(claims.flatMap((claim) => claim.flags));

test("the site cites gup commands and flags", () => {
  assert.ok(citedCommands.has("update") && citedFlags.has("--fast"));
});

test("every gup command the site cites is registered", () => {
  assert.deepEqual([...citedCommands].filter((command) => !cli.commands.has(command)), []);
});

test("every flag the site cites is gup's, or a named flag of a tool it drives", () => {
  const unknown = [...citedFlags].filter((flag) => !cli.flags.has(flag));
  assert.deepEqual(unknown.filter((flag) => !FOREIGN_FLAGS.has(flag)), []);
  assert.deepEqual([...FOREIGN_FLAGS].filter((flag) => !citedFlags.has(flag)), [], "stale");
});
