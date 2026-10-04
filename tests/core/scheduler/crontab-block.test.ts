import { describe, expect, it } from "vitest";
import { ARTIFACT_ERRORS } from "../../../src/core/scheduler/artifacts/artifact-errors.js";
import {
  CRON_BLOCK_BEGIN,
  CRON_BLOCK_END,
  cronLine,
  hasGupBlock,
  removeGupBlock,
  upsertGupBlock,
} from "../../../src/core/scheduler/artifacts/crontab-block.js";
import {
  TICK_COMMAND,
  type TaskCommand,
} from "../../../src/core/scheduler/trigger/task-command.js";
import { useLocale } from "../../support/locale.js";

const command: TaskCommand = {
  node: "/usr/bin/node",
  entry: "/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js",
  args: [TICK_COMMAND],
};
const LINE =
  "*/15 * * * * '/usr/bin/node' '/usr/lib/node_modules/@charles_lindecker/gup/dist/cli.js' " +
  "__schedule-tick >/dev/null 2>&1";
const NOTE = "# Managed by gup (gup schedule uninstall to remove). Do not edit by hand.";
const BLOCK = `${CRON_BLOCK_BEGIN}\n${NOTE}\n${LINE}\n${CRON_BLOCK_END}\n`;

describe("cronLine", () => {
  it("single-quotes each path for /bin/sh", () => {
    expect(cronLine(command)).toBe(LINE);
  });

  it.each([["/home/a/it's/cli.js"], ["/home/a/100%/cli.js"], ["/home/a/x\ny/cli.js"]])(
    "refuses a path cron or the shell would re-interpret: %j",
    (entry) => {
      expect(() => cronLine({ ...command, entry })).toThrow("chemin non planifiable");
    },
  );
});

describe("upsertGupBlock / removeGupBlock", () => {
  const foreign = "MAILTO=me@example.org\n0 3 * * * /usr/local/bin/backup  # nightly\n";

  it("adds the block to an empty crontab", () => {
    expect(upsertGupBlock("", command)).toBe(BLOCK);
  });

  it("appends after foreign lines, kept byte for byte, and removes back to them", () => {
    const added = upsertGupBlock(foreign, command);
    expect(added).toBe(foreign + BLOCK);
    expect(removeGupBlock(added)).toBe(foreign);
  });

  it("adds the missing final line break before appending", () => {
    expect(upsertGupBlock("0 3 * * * x", command)).toBe(`0 3 * * * x\n${BLOCK}`);
  });

  it("replaces the block in place, and is idempotent", () => {
    const around = `# top\n${BLOCK}# bottom\n`;
    const moved = { ...command, node: "/opt/node/bin/node" };
    const replaced = upsertGupBlock(around, moved);
    expect(replaced).toBe(`# top\n${BLOCK.replace("/usr/bin/node", "/opt/node/bin/node")}# bottom\n`);
    expect(upsertGupBlock(replaced, moved)).toBe(replaced);
    expect(removeGupBlock(replaced)).toBe("# top\n# bottom\n");
    expect(removeGupBlock("# top\n# bottom\n")).toBe("# top\n# bottom\n");
  });

  it("keeps CRLF line breaks when the crontab uses them", () => {
    const crlf = "0 3 * * * x\r\n";
    const added = upsertGupBlock(crlf, command);
    expect(added).toBe(crlf + BLOCK.replaceAll("\n", "\r\n"));
    expect(removeGupBlock(added)).toBe(crlf);
  });

  it("only counts markers at the start of a line", () => {
    const quoted = `0 3 * * * echo '${CRON_BLOCK_BEGIN}'\n`;
    expect(hasGupBlock(quoted)).toBe(false);
    expect(upsertGupBlock(quoted, command)).toBe(quoted + BLOCK);
  });

  it("refuses a block missing one of its markers rather than guessing", () => {
    const broken = ARTIFACT_ERRORS.brokenBlock;
    expect(() => upsertGupBlock(`${CRON_BLOCK_BEGIN}\n${LINE}\n`, command)).toThrow(broken);
    expect(() => removeGupBlock(`${LINE}\n${CRON_BLOCK_END}\n`)).toThrow(broken);
  });
});

describe("the block written by a gup that speaks English", () => {
  useLocale("en");

  it("is the same block: a change of language never rewrites the crontab", () => {
    expect(upsertGupBlock("", command)).toBe(BLOCK);
  });
});
