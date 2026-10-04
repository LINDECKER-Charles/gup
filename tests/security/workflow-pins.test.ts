import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every workflow runs with a token, so an action is code execution in CI. A
 * third-party action is pinned to a full commit SHA — a tag can be moved to
 * other code, as the tj-actions/changed-files compromise did — with the
 * release it stands for in a comment, which Dependabot keeps up to date.
 * GitHub's own actions (`actions/*`, `github/*`) keep their major tags.
 */

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const FIRST_PARTY_OWNERS: ReadonlySet<string> = new Set(["actions", "github"]);
const USES = /^\s*(?:-\s+)?uses:\s*(\S+?)@(\S+)(.*)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const RELEASE_COMMENT = /^\s+#\s+v\d+\.\d+\.\d+\s*$/;

interface ActionUse {
  readonly where: string;
  readonly action: string;
  readonly ref: string;
  readonly rest: string;
}

function actionUses(): ActionUse[] {
  const workflows = readdirSync(WORKFLOWS_DIR).filter((name) => /\.ya?ml$/.test(name));
  return workflows.flatMap((name) =>
    readFileSync(join(WORKFLOWS_DIR, name), "utf8")
      .split(/\r?\n/)
      .flatMap((line, index) => {
        const match = USES.exec(line);
        if (!match) return [];
        const [, action = "", ref = "", rest = ""] = match;
        return [{ where: `${name}:${index + 1}`, action, ref, rest }];
      }),
  );
}

const thirdParty = (use: ActionUse) => !FIRST_PARTY_OWNERS.has(use.action.split("/")[0] ?? "");

describe("workflow action pins", () => {
  it("finds the actions the workflows use", () => {
    expect(actionUses().some(thirdParty)).toBe(true);
  });

  it("pins every third-party action to a full commit SHA, its release named in a comment", () => {
    const loose = actionUses()
      .filter(thirdParty)
      .filter((use) => !FULL_SHA.test(use.ref) || !RELEASE_COMMENT.test(use.rest))
      .map((use) => `${use.where} ${use.action}@${use.ref}${use.rest}`);

    expect(loose).toEqual([]);
  });
});
