/**
 * The README reader behind facts.js's `installCommand`: the command under
 * `## Install`, flags kept, and the README shapes it refuses rather than
 * publish a command that does not install gup.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readInstallCommand } from "../../build/facts/read-install-command.mjs";

const PACKAGE = "@scope/gup";
const FLAGGED = "npm install -g @scope/gup --allow-scripts=node-pty";

const readme = (block) =>
  `# gup\n\nIntro.\n\n## Install\n\n${block}\n\nNode ≥ 26.\n\n` +
  "## Use\n\n```bash\ngup\n```\n";
const fenced = (line) => readme(`\`\`\`bash\n${line}\n\`\`\``);

test("reads the command under ## Install, flags included", () => {
  assert.equal(readInstallCommand(fenced(FLAGGED), PACKAGE), FLAGGED);
});

test("reads a CRLF checkout the same way", () => {
  const crlf = fenced(FLAGGED).replaceAll("\n", "\r\n");
  assert.equal(readInstallCommand(crlf, PACKAGE), FLAGGED);
});

test("accepts the bare command", () => {
  const bare = "npm install -g @scope/gup";
  assert.equal(readInstallCommand(fenced(bare), PACKAGE), bare);
});

test("refuses a README without a command under ## Install", () => {
  assert.throws(() => readInstallCommand(readme("Run npm."), PACKAGE), /no command/);
  assert.throws(() => readInstallCommand("# gup\n", PACKAGE), /no command/);
});

test("refuses a command that installs something else", () => {
  for (const line of ["npx @scope/gup", "npm install -g @scope/gup-beta", "npm i -g @scope/gup"]) {
    assert.throws(() => readInstallCommand(fenced(line), PACKAGE), /does not start with/, line);
  }
});
