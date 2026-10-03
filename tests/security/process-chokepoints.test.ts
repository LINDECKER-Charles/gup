import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PtyHandle } from "../../src/core/pty/pty-loader.js";

/**
 * Drift detection for the spawn chokepoint. Every child process gup starts
 * goes through `src/core/runner.ts`, where the command name and argv are
 * sanitised and the timeout, skip and tree-kill levers are armed. A second
 * module importing execa would be a second, unguarded way to run a command —
 * install sinks included: they receive an already-sanitised request and
 * start it through the runner's own helpers.
 *
 * The embedded terminal is the one other spawner, and a narrow one: node-pty
 * only ever starts the trampoline (node, the `pty-exec` bundle, one base64url
 * argument), which hands the request back to the runner. These rules keep it
 * that narrow, and keep node-pty's own `IPty.kill()` — which forks a
 * console-list agent that crashes onto gup's stderr on Windows — out of
 * every tree: production, tests and tooling.
 */
const EXECA_IMPORTERS = new Set(["src/core/runner.ts"]);
const NODE_PTY_NAMERS = new Set(["src/core/pty/pty-loader.ts"]);
const PTY_SPAWNERS = new Set(["src/core/pty/pty-session.ts"]);
const NODE_PTY = /^node-pty(?:\/.*)?$/;
/** Where a node-pty handle can be reached: the PTY layer, its test support, and their importers. */
const PTY_MODULE_PATH = /(?:^|\/)(?:core|support)\/pty\//;
/**
 * The only receivers of a `.kill(...)` call where a node-pty handle is
 * reachable: `process` (a signal by pid), a `session` or `child` (an install
 * process, whose kill is ptyKill's tree kill), and `_ptyNative` (ConPTY's
 * close in releaseConpty — not IPty.kill).
 */
const KILL_RECEIVERS = new Set(["process", "session", "child", "_ptyNative"]);
const SCANNED_TREES = ["src", "tests", "scripts"];
const SOURCE_FILE = /\.(?:ts|mts|mjs)$/;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return Promise.resolve(SOURCE_FILE.test(entry.name) ? [full] : []);
    }),
  );
  return nested.flat();
}

const toPosixRel = (absolute: string): string =>
  relative(process.cwd(), absolute).split(sep).join("/");

interface ParsedFile {
  readonly rel: string;
  readonly ast: ts.SourceFile;
}

async function parsedTrees(trees: readonly string[]): Promise<ParsedFile[]> {
  const roots = trees.map((tree) => sourceFiles(join(process.cwd(), tree)));
  const files = (await Promise.all(roots)).flat();
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf8");
      const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
      return { rel: toPosixRel(file), ast };
    }),
  );
}

function nodesOf(root: ts.Node): ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

/** The specifier of an `import`/`export … from`, `import()` or `require()`, if `node` is one. */
function specifierOf(node: ts.Node): string | null {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    const specifier = node.moduleSpecifier;
    return specifier && ts.isStringLiteral(specifier) ? specifier.text : null;
  }
  if (!ts.isCallExpression(node) || !isModuleLoader(node.expression)) return null;
  const [first] = node.arguments;
  return first && ts.isStringLiteralLike(first) ? first.text : null;
}

/** `import(…)` or `require(…)`. */
function isModuleLoader(callee: ts.Expression): boolean {
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
  return ts.isIdentifier(callee) && callee.text === "require";
}

function moduleSpecifiers(file: ParsedFile): string[] {
  return nodesOf(file.ast).flatMap((node) => specifierOf(node) ?? []);
}

/** Any string naming the node-pty package: an import, a specifier held in a variable, a resolve. */
function namesNodePty(file: ParsedFile): boolean {
  return nodesOf(file.ast).some((node) => ts.isStringLiteralLike(node) && NODE_PTY.test(node.text));
}

/** The receiver of `x.<method>(…)` or `x["<method>"](…)`: its last name, else its text. */
function receiverOf(node: ts.Node, method: string, file: ParsedFile): string | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = unwrapped(node.expression);
  const isMethodCall =
    (ts.isPropertyAccessExpression(callee) && callee.name.text === method) ||
    (ts.isElementAccessExpression(callee) &&
      ts.isStringLiteralLike(callee.argumentExpression) &&
      callee.argumentExpression.text === method);
  if (!isMethodCall) return null;
  const receiver = unwrapped(callee.expression);
  return ts.isPropertyAccessExpression(receiver) ? receiver.name.text : receiver.getText(file.ast);
}

/** `x!`, `(x)` → `x`: the callee behind non-null assertions and parentheses. */
function unwrapped(expression: ts.Expression): ts.Expression {
  let inner = expression;
  while (ts.isNonNullExpression(inner) || ts.isParenthesizedExpression(inner)) {
    inner = inner.expression;
  }
  return inner;
}

function receiversOf(file: ParsedFile, method: string): string[] {
  return nodesOf(file.ast).flatMap((node) => receiverOf(node, method, file) ?? []);
}

function reachesPtyHandles(file: ParsedFile): boolean {
  if (PTY_MODULE_PATH.test(file.rel)) return true;
  return moduleSpecifiers(file).some((specifier) => PTY_MODULE_PATH.test(specifier));
}

describe("process chokepoints", () => {
  it("imports execa from src/core/runner.ts only", async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(join(process.cwd(), "src"))) {
      const content = await readFile(file, "utf8");
      if (!/from\s+["']execa["']/.test(content)) continue;
      const rel = toPosixRel(file);
      if (!EXECA_IMPORTERS.has(rel)) offenders.push(rel);
    }
    expect(offenders, "spawn through src/core/runner.ts instead of importing execa").toEqual([]);
  });

  it("names the node-pty package in src/core/pty/pty-loader.ts only", async () => {
    const offenders = (await parsedTrees(["src"]))
      .filter((file) => namesNodePty(file) && !NODE_PTY_NAMERS.has(file.rel))
      .map((file) => file.rel);
    expect(offenders, "load node-pty through loadEmbeddedTerminal()").toEqual([]);
  });

  it("never imports node-pty directly from tests or tooling", async () => {
    const offenders = (await parsedTrees(["tests", "scripts"]))
      .filter((file) => moduleSpecifiers(file).some((specifier) => NODE_PTY.test(specifier)))
      .map((file) => file.rel);
    expect(offenders, "reach node-pty through detectEmbeddedTerminal() and PtyModule").toEqual([]);
  });

  it("spawns into a pseudo-terminal from PtySession only", async () => {
    const offenders = (await parsedTrees(["src"]))
      .filter((file) => receiversOf(file, "spawn").length > 0 && !PTY_SPAWNERS.has(file.rel))
      .map((file) => file.rel);
    expect(offenders, "start PTY children with PtySession.start()").toEqual([]);
  });

  it("never calls kill() on a node-pty handle, in src, tests or scripts", async () => {
    const offenders = (await parsedTrees(SCANNED_TREES))
      .filter(reachesPtyHandles)
      .flatMap((file) =>
        receiversOf(file, "kill")
          .filter((receiver) => !KILL_RECEIVERS.has(receiver))
          .map((receiver) => `${file.rel}: ${receiver}.kill()`),
      );
    expect(offenders, "kill through PtySession.kill() / ptyKill, never IPty.kill()").toEqual([]);
  });

  it("gives the node-pty handle type no kill() at all", () => {
    expectTypeOf<PtyHandle>().not.toHaveProperty("kill");
  });
});
