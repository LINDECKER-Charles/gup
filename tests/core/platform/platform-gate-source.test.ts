import { readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ALL_PROVIDERS } from "../../../src/core/registry.js";

/**
 * Drift detection for the registry platform gate. A provider says where gup
 * supports it — `readonly platforms = PLATFORMS.<set>;` — and the registry
 * alone enforces it: elsewhere the provider is never probed, scanned nor
 * updated. Two rules keep that declaration the single source of truth:
 *
 *  - no provider's isAvailable() reads `process.platform`: a second gate
 *    would drift from the declaration and from the listings built on it;
 *  - nothing but the registry calls a provider's isAvailable(): providers no
 *    longer refuse a foreign OS themselves, so a direct call there may answer
 *    true.
 *
 * Platform branches elsewhere in a provider stay legitimate: helpers,
 * listOutdated() and update() guard their own contract ("never build a C:\
 * path on POSIX"), not detection.
 */

const REGISTRY = "src/core/registry.ts";

interface ParsedFile {
  readonly rel: string;
  readonly ast: ts.SourceFile;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return Promise.resolve(entry.name.endsWith(".ts") ? [full] : []);
    }),
  );
  return nested.flat();
}

async function parsedTree(tree: string): Promise<ParsedFile[]> {
  const files = await sourceFiles(join(process.cwd(), tree));
  return Promise.all(
    files.map(async (file) => {
      const content = await readFile(file, "utf8");
      const rel = relative(process.cwd(), file).split(sep).join("/");
      return { rel, ast: ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true) };
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

/** A class declared `implements Provider`. */
function isProviderClass(node: ts.Node): node is ts.ClassDeclaration {
  if (!ts.isClassDeclaration(node)) return false;
  return (node.heritageClauses ?? []).some(
    (clause) =>
      clause.token === ts.SyntaxKind.ImplementsKeyword &&
      clause.types.some((type) => type.expression.getText() === "Provider"),
  );
}

function memberName(member: ts.ClassElement): string | undefined {
  return member.name && ts.isIdentifier(member.name) ? member.name.text : undefined;
}

/** The body of `isAvailable`, a method or an arrow-function field; null when there is none. */
function isAvailableBody(providerClass: ts.ClassDeclaration): ts.Node | null {
  const member = providerClass.members.find((m) => memberName(m) === "isAvailable");
  if (member && ts.isMethodDeclaration(member)) return member.body ?? null;
  if (member && ts.isPropertyDeclaration(member)) return member.initializer ?? null;
  return null;
}

/** `process.platform` or `process["platform"]`. */
function readsPlatform(node: ts.Node): boolean {
  const isProcess = (expression: ts.Expression): boolean =>
    ts.isIdentifier(expression) && expression.text === "process";
  if (ts.isPropertyAccessExpression(node)) {
    return isProcess(node.expression) && node.name.text === "platform";
  }
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    return isProcess(node.expression) && ts.isStringLiteralLike(key) && key.text === "platform";
  }
  return false;
}

/** `x.isAvailable(…)` / `x["isAvailable"](…)`: the receiver expression, else null. */
function isAvailableReceiver(node: ts.Node): ts.Expression | null {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "isAvailable") {
    return callee.expression;
  }
  const isElementCall =
    ts.isElementAccessExpression(callee) &&
    ts.isStringLiteralLike(callee.argumentExpression) &&
    callee.argumentExpression.text === "isAvailable";
  return isElementCall ? callee.expression : null;
}

/** A class's own private helper that happens to share the name (the theme picker's). */
function isOwnNonProviderMethod(receiver: ts.Expression): boolean {
  if (receiver.kind !== ts.SyntaxKind.ThisKeyword) return false;
  let scope: ts.Node | undefined = receiver.parent;
  while (scope && !ts.isClassLike(scope)) scope = scope.parent;
  return scope !== undefined && !isProviderClass(scope);
}

describe("registry platform gate (source)", () => {
  it("finds every registered provider among the classes it checks", async () => {
    const checked = (await parsedTree("src/providers"))
      .flatMap((file) => nodesOf(file.ast).filter(isProviderClass))
      .map((providerClass) => providerClass.name?.text);
    const registered = ALL_PROVIDERS.map((provider) => provider.constructor.name);
    expect(registered.filter((name) => !checked.includes(name))).toEqual([]);
  });

  it("never reads process.platform in a provider's isAvailable()", async () => {
    const offenders = (await parsedTree("src/providers")).flatMap((file) =>
      nodesOf(file.ast)
        .filter(isProviderClass)
        .flatMap((providerClass) => {
          const name = `${file.rel}: ${providerClass.name?.text ?? "<anonymous>"}`;
          const body = isAvailableBody(providerClass);
          if (!body) return [`${name} has no isAvailable() body to check`];
          return nodesOf(body).some(readsPlatform) ? [name] : [];
        }),
    );
    expect(offenders, "declare `readonly platforms = PLATFORMS.<set>;` instead").toEqual([]);
  });

  it("calls a provider's isAvailable() from the registry only", async () => {
    const offenders = (await parsedTree("src"))
      .filter((file) => file.rel !== REGISTRY)
      .flatMap((file) =>
        nodesOf(file.ast)
          .map(isAvailableReceiver)
          .filter((receiver): receiver is ts.Expression => receiver !== null)
          .filter((receiver) => !isOwnNonProviderMethod(receiver))
          .map((receiver) => `${file.rel}: ${receiver.getText(file.ast)}.isAvailable()`),
      );
    expect(offenders, "probe through detectAvailableProviders() or lookupProvider()").toEqual([]);
  });
});
