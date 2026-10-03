import { resolveText } from "../fixtures/load.js";
import { FsTree } from "./fs-tree.js";
import { applyIdentity, fakeOs, HOST_SIM_PLATFORM } from "./os-identity.js";
import type {
  CommandAnswer,
  CommandScript,
  Fault,
  FsNode,
  HttpRoute,
  InstallAnswer,
  RequestRecord,
  SimPlatform,
  SpawnRecord,
  SystemSpec,
} from "./types.js";

/**
 * The mutable state of the fake machine, shared by the fake runner, fs and
 * network. Tests never touch it: they go through `system` (fake-system.ts).
 */

export interface ResolvedAnswer {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface ScriptSlot {
  readonly argv: readonly string[];
  readonly answers: readonly ResolvedAnswer[];
  /** Answer once an install has run (see `CommandScript.afterInstall`). */
  readonly afterInstall?: ResolvedAnswer;
  calls: number;
}

export interface ResolvedRoute {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface MachineState {
  readonly platform: SimPlatform;
  readonly bin: ReadonlyMap<string, string>;
  readonly scripts: readonly ScriptSlot[];
  readonly routes: readonly ResolvedRoute[];
  readonly fs: FsTree;
  readonly isElevated: boolean;
  readonly isPermissive: boolean;
  isExploring: boolean;
  readonly faults: Fault[];
  readonly installAnswers: InstallAnswer[];
  interrupt: { timedOut: boolean; aborted: boolean };
  readonly spawns: SpawnRecord[];
  readonly requests: RequestRecord[];
  readonly fsReads: string[];
  /** Strict-mode violations, kept until reset even if the code under test swallowed them. */
  readonly unscripted: Error[];
}

export function argvKey(argv: readonly string[]): string {
  return JSON.stringify(argv);
}

async function resolveAnswer(answer: CommandAnswer): Promise<ResolvedAnswer> {
  return {
    stdout: answer.stdout === undefined ? "" : await resolveText(answer.stdout),
    stderr: answer.stderr === undefined ? "" : await resolveText(answer.stderr),
    exitCode: answer.exitCode ?? 0,
  };
}

async function resolveScripts(scripts: readonly CommandScript[]): Promise<ScriptSlot[]> {
  const seen = new Set<string>();
  const slots: ScriptSlot[] = [];
  for (const script of scripts) {
    const key = argvKey(script.argv);
    if (seen.has(key)) throw new Error(`two command scripts for ${key}: merge them with \`then\``);
    seen.add(key);
    const answers = await Promise.all([script, ...(script.then ?? [])].map(resolveAnswer));
    const afterInstall = script.afterInstall && (await resolveAnswer(script.afterInstall));
    slots.push({ argv: script.argv, answers, ...(afterInstall && { afterInstall }), calls: 0 });
  }
  return slots;
}

async function resolveRoute(route: HttpRoute): Promise<ResolvedRoute> {
  const isJson = route.json !== undefined;
  const body = isJson ? JSON.stringify(route.json) : await resolveText(route.body ?? "");
  return {
    method: route.method ?? "GET",
    url: route.url,
    status: route.status ?? 200,
    body,
    headers: { ...(isJson && { "content-type": "application/json" }), ...route.headers },
  };
}

async function resolveRoutes(routes: readonly HttpRoute[]): Promise<ResolvedRoute[]> {
  const keys = routes.map((route) => `${route.method ?? "GET"} ${route.url}`);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) throw new Error(`two http routes for ${duplicate}`);
  return Promise.all(routes.map(resolveRoute));
}

/** Every machine has a home and a temp directory (read from the simulated env). */
function baseTree(platform: SimPlatform): FsTree {
  const tree = new FsTree(platform);
  tree.add(fakeOs.homedir(), { kind: "dir" });
  tree.add(fakeOs.tmpdir(), { kind: "dir" });
  return tree;
}

async function buildTree(spec: SystemSpec): Promise<FsTree> {
  const tree = baseTree(spec.platform);
  // Binaries on PATH exist as executable files, unless `fs` says otherwise.
  for (const path of Object.values(spec.bin ?? {})) {
    tree.add(path, { kind: "file", isExecutable: true });
  }
  for (const [path, node] of Object.entries(spec.fs ?? {})) await addNode(tree, path, node);
  return tree;
}

async function addNode(tree: FsTree, path: string, node: FsNode): Promise<void> {
  const text = node.content === undefined ? undefined : await resolveText(node.content);
  const content = text === undefined ? undefined : Buffer.from(text);
  tree.add(path, {
    kind: node.kind,
    ...(content && { content }),
    ...(node.target !== undefined && { target: node.target }),
    ...(node.executable !== undefined && { isExecutable: node.executable }),
  });
}

function emptyState(platform: SimPlatform): MachineState {
  return {
    platform,
    bin: new Map(),
    scripts: [],
    routes: [],
    fs: new FsTree(platform),
    isElevated: false,
    isPermissive: false,
    isExploring: false,
    faults: [],
    installAnswers: [],
    interrupt: { timedOut: false, aborted: false },
    spawns: [],
    requests: [],
    fsReads: [],
    unscripted: [],
  };
}

let state: MachineState = emptyState(HOST_SIM_PLATFORM);

/** The machine the fakes answer from. */
export function machine(): MachineState {
  return state;
}

/** Install `spec`: identity first, so homes and temp dirs follow the simulated env. */
export async function loadMachine(spec: SystemSpec): Promise<void> {
  applyIdentity({
    platform: spec.platform,
    ...(spec.env && { env: spec.env }),
    ...(spec.uid !== undefined && { uid: spec.uid }),
  });
  const [scripts, routes, fs] = await Promise.all([
    resolveScripts(spec.commands ?? []),
    resolveRoutes(spec.http ?? []),
    buildTree(spec),
  ]);
  state = {
    ...emptyState(spec.platform),
    bin: new Map(Object.entries(spec.bin ?? {})),
    scripts,
    routes,
    fs,
    isElevated: spec.elevated ?? false,
    isPermissive: spec.permissive ?? false,
    unscripted: state.unscripted,
  };
}

/** An empty machine of the host platform, violations forgotten. */
export function resetMachine(): void {
  applyIdentity({ platform: HOST_SIM_PLATFORM });
  state = { ...emptyState(HOST_SIM_PLATFORM), fs: baseTree(HOST_SIM_PLATFORM) };
}
