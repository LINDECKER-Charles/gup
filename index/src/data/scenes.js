// Faithful reproduction of the actual `gup` CLI output.
// Source of truth: src/commands/menu.ts, src/ui/scan-progress.ts,
// src/ui/table.ts, src/commands/list.ts, src/commands/update.ts.
//
// Line shape:
//   { t: string, c?: className }                  -- whole-line color
//   { segs: [{ t: string, c?: className }, ...] } -- inline segments
//
// Color classes map to the real chalk colors used in the CLI:
//   term-c-bold   -> chalk.bold
//   term-c-dim    -> chalk.dim       (borders, secondary text)
//   term-c-muted  -> default fg slightly subdued
//   term-c-green  -> chalk.green     (success, latest version)
//   term-c-yellow -> chalk.yellow    (current version, warnings)
//   term-c-red    -> chalk.red       (errors, FAIL)
//   term-c-cyan   -> chalk.cyan      (provider name in scan table)
//   term-c-blue   -> chalk.blue      (JSON keys)
//   term-c-accent -> highlight (inquirer pointer / selected entry)

// ora's "line" spinner — what the CLI actually uses (scan-progress.ts:31).
const LINE_SPIN = ["-", "\\", "|", "/"];
const sp = (i) => LINE_SPIN[i % LINE_SPIN.length];

const L = (t, c) => ({ t, c });
const S = (segs) => ({ segs });
const seg = (t, c) => ({ t, c });
const Empty = () => ({ t: "" });

// printHeader() — src/commands/menu.ts:117
const HEADER_LINES = [
  S([
    seg("  "),
    seg("gup", "term-c-bold"),
    seg("  "),
    seg("global updater                          ", "term-c-dim"),
    seg("v0.1.0", "term-c-dim"),
  ]),
  L("  ────────────────────────────────────────────────────────────", "term-c-dim"),
];

// printStatus() — src/commands/menu.ts:125
const statusBlock = ({ providers, updates, mode = "normal", filter = "tous" }) => [
  Empty(),
  S([
    seg("  status   ", "term-c-dim"),
    seg(`${providers} provider(s) détecté(s)  ·  `),
    updates === 0
      ? seg("à jour", "term-c-green")
      : seg(`${updates} mise(s) à jour disponible(s)`, "term-c-yellow"),
  ]),
  S([
    seg("  mode     ", "term-c-dim"),
    seg(`${mode}  ·  ${filter}`, "term-c-dim"),
  ]),
  Empty(),
];

// scan-progress spinner line — matches scan-progress.ts render().
const scanLine = (spinIdx, done, total, active = [], overflow = 0) =>
  S([
    seg(`${sp(spinIdx)} `, "term-c-accent"),
    seg(`scan [${done}/${total}]`, "term-c-dim"),
    active.length > 0
      ? seg(
          ` — ${active.join(" · ")}${overflow > 0 ? ` +${overflow}` : ""}`,
          "term-c-dim",
        )
      : seg(""),
  ]);

// === SCENARIO 1: gup (interactive menu) =================================
const SCENE_MENU = [
  {
    delay: 500,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup", "term-c-bold")]),
    ],
  },
  ...[0, 1, 2, 3].map((i) => ({
    delay: 220,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup", "term-c-bold")]),
      Empty(),
      ...HEADER_LINES,
      Empty(),
      S([
        seg(`${sp(i)} `, "term-c-accent"),
        seg("détection des providers…", "term-c-dim"),
      ]),
    ],
  })),
  ...[
    { done: 0,  active: ["Winget"] },
    { done: 3,  active: ["Winget", "npm", "pip"] },
    { done: 8,  active: ["Cargo", "Helm", "kubectl"], overflow: 2 },
    { done: 16, active: ["pwsh modules", "VSCode ext", "JetBrains Toolbox"], overflow: 5 },
    { done: 28, active: ["Krew", "Symfony CLI", "Composer global"], overflow: 3 },
    { done: 41, active: ["Self"] },
  ].map((step, i) => ({
    delay: 280,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup", "term-c-bold")]),
      Empty(),
      ...HEADER_LINES,
      Empty(),
      scanLine(i + 4, step.done, 47, step.active, step.overflow || 0),
    ],
  })),
  {
    delay: 700,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup", "term-c-bold")]),
      Empty(),
      ...HEADER_LINES,
      Empty(),
      L("· scan terminé en 4.2s — 47 provider(s), 23 mise(s) à jour", "term-c-dim"),
      ...statusBlock({ providers: 47, updates: 23 }),
      S([
        seg("? ", "term-c-green"),
        seg("Action", "term-c-bold"),
        seg(" (Use arrow keys)", "term-c-dim"),
      ]),
      S([
        seg("❯ ", "term-c-accent"),
        seg("Scan                  ", "term-c-accent"),
        seg(" rescanne tous les providers", "term-c-dim"),
      ]),
      S([
        seg("  Review                "),
        seg(" voir la liste détaillée", "term-c-dim"),
      ]),
      S([
        seg("  Update selected       "),
        seg(" choix multiple", "term-c-dim"),
      ]),
      S([
        seg("  Update all            "),
        seg(" 23 paquet(s)", "term-c-dim"),
      ]),
      L("  ──", "term-c-dim"),
      S([
        seg("  Update target         "),
        seg(" provider:package", "term-c-dim"),
      ]),
      S([
        seg("  Providers             "),
        seg(" status / install hints", "term-c-dim"),
      ]),
      S([
        seg("  Options               "),
        seg(" fast mode, filtre providers", "term-c-dim"),
      ]),
      L("  ──", "term-c-dim"),
      L("  Quit"),
    ],
  },
];

// === SCENARIO 2: gup list --json --fast =================================
const SCENE_LIST = [
  {
    delay: 500,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup list --json --fast", "term-c-bold")]),
    ],
  },
  ...[0, 1, 2].map((i) => ({
    delay: 240,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup list --json --fast", "term-c-bold")]),
      S([
        seg(`${sp(i)} `, "term-c-accent"),
        seg("détection des providers…", "term-c-dim"),
      ]),
    ],
  })),
  ...[
    { done: 6,  active: ["Winget", "npm", "pip"] },
    { done: 18, active: ["Cargo", "Helm", "kubectl"], overflow: 2 },
    { done: 30, active: ["Self"] },
  ].map((step, i) => ({
    delay: 260,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup list --json --fast", "term-c-bold")]),
      scanLine(i + 3, step.done, 38, step.active, step.overflow || 0),
    ],
  })),
  {
    delay: 0,
    lines: [
      S([seg("$ ", "term-c-green"), seg("gup list --json --fast", "term-c-bold")]),
      Empty(),
      L("["),
      L("  {"),
      S([seg("    \"providerId\""), seg(": "), seg("\"winget\"", "term-c-green"), seg(",")]),
      S([seg("    \"available\""), seg(": "), seg("true", "term-c-purple"), seg(",")]),
      L("    \"packages\": ["),
      L("      {"),
      S([seg("        \"id\""), seg(": "), seg("\"Microsoft.PowerShell\"", "term-c-green"), seg(",")]),
      S([seg("        \"name\""), seg(": "), seg("\"PowerShell\"", "term-c-green"), seg(",")]),
      S([seg("        \"current\""), seg(": "), seg("\"7.4.1\"", "term-c-green"), seg(",")]),
      S([seg("        \"latest\""), seg(": "), seg("\"7.4.6\"", "term-c-green")]),
      L("      },"),
      L("      {"),
      S([seg("        \"id\""), seg(": "), seg("\"Git.Git\"", "term-c-green"), seg(",")]),
      S([seg("        \"current\""), seg(": "), seg("\"2.43.0\"", "term-c-green"), seg(",")]),
      S([seg("        \"latest\""), seg(": "), seg("\"2.46.2\"", "term-c-green")]),
      L("      }"),
      L("    ]"),
      L("  },"),
      L("  {"),
      S([seg("    \"providerId\""), seg(": "), seg("\"npm-g\"", "term-c-green"), seg(",")]),
      S([seg("    \"available\""), seg(": "), seg("true", "term-c-purple"), seg(",")]),
      L("    \"packages\": ["),
      L("      { \"id\": \"typescript\", \"current\": \"5.4.2\", \"latest\": \"5.6.3\" },", "term-c-muted"),
      L("      { \"id\": \"pnpm\",       \"current\": \"9.4.0\", \"latest\": \"9.12.1\" }", "term-c-muted"),
      L("    ]"),
      L("  },"),
      L("  { \"providerId\": \"pip\",   \"available\": true,  \"packages\": [/* 1 */] },", "term-c-muted"),
      L("  { \"providerId\": \"cargo\", \"available\": true,  \"packages\": [/* 2 */] },", "term-c-muted"),
      L("  { \"providerId\": \"helm\",  \"available\": true,  \"packages\": [/* 1 */] }", "term-c-muted"),
      L("]"),
    ],
  },
];

// === SCENARIO 3: gup update <targets…> ==================================
const SCENE_TARGET = [
  {
    delay: 500,
    lines: [
      S([
        seg("$ ", "term-c-green"),
        seg("gup update winget:Git.Git npm-g:typescript", "term-c-bold"),
      ]),
    ],
  },
  {
    delay: 500,
    lines: [
      S([
        seg("$ ", "term-c-green"),
        seg("gup update winget:Git.Git npm-g:typescript", "term-c-bold"),
      ]),
      Empty(),
      S([seg("→ Winget: Git.Git", "term-c-bold")]),
    ],
  },
  {
    delay: 700,
    lines: [
      S([
        seg("$ ", "term-c-green"),
        seg("gup update winget:Git.Git npm-g:typescript", "term-c-bold"),
      ]),
      Empty(),
      S([seg("→ Winget: Git.Git", "term-c-bold")]),
      L("Found Git [Git.Git] Version 2.46.2", "term-c-muted"),
      L("This application is licensed to you by its owner.", "term-c-dim"),
      L("Downloading https://github.com/git-for-windows/git/releases/…", "term-c-muted"),
      L("  ██████████████████████████████  100%", "term-c-green"),
      L("Successfully installed", "term-c-green"),
    ],
  },
  {
    delay: 500,
    lines: [
      S([
        seg("$ ", "term-c-green"),
        seg("gup update winget:Git.Git npm-g:typescript", "term-c-bold"),
      ]),
      Empty(),
      S([seg("→ Winget: Git.Git", "term-c-bold")]),
      L("Successfully installed", "term-c-green"),
      Empty(),
      S([seg("→ npm: typescript", "term-c-bold")]),
      L("changed 1 package in 1.8s", "term-c-muted"),
    ],
  },
  {
    delay: 600,
    lines: [
      S([
        seg("$ ", "term-c-green"),
        seg("gup update winget:Git.Git npm-g:typescript", "term-c-bold"),
      ]),
      Empty(),
      S([seg("→ Winget: Git.Git", "term-c-bold")]),
      L("Successfully installed", "term-c-green"),
      Empty(),
      S([seg("→ npm: typescript", "term-c-bold")]),
      L("changed 1 package in 1.8s", "term-c-muted"),
      Empty(),
      L("OK   2 mise(s) à jour effectuée(s)", "term-c-green"),
    ],
  },
];

export const scenes = {
  menu:   { key: "menu",   tab: "menu",  title: "gup",                                        frames: SCENE_MENU   },
  list:   { key: "list",   tab: "list",  title: "gup list --json --fast",                     frames: SCENE_LIST   },
  target: { key: "target", tab: "ciblé", title: "gup update winget:Git.Git npm-g:typescript", frames: SCENE_TARGET },
};
