import { select, input, checkbox, Separator } from "@inquirer/prompts";
import { detectAvailableProviders } from "../core/registry.js";
import {
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../core/runner.js";
import { describeFilter, dim, pad, type MenuState } from "./menu-state.js";

/**
 * The interactive menu's "Options" screen: fast mode, provider filter and
 * install timeout. Split out of `menu.ts`, which keeps the main loop and the
 * status rendering.
 */
type OptionAction = "fast" | "filter" | "timeout" | "back";

export async function runOptions(state: MenuState): Promise<void> {
  const choice = await select<OptionAction>({
    message: "Options",
    choices: optionChoices(state),
    loop: false,
  });

  if (choice === "fast") toggleFastMode(state);
  else if (choice === "filter") await editProviderFilter(state);
  else if (choice === "timeout") await editInstallTimeout();
}

function optionChoices(state: MenuState) {
  const timeout = getInstallTimeoutSeconds();
  return [
    {
      name: pad(
        `Fast mode  [${state.fast ? "ON" : "OFF"}]`,
        "skip pwsh-modules & vscode-ext",
      ),
      value: "fast" as const,
    },
    {
      name: pad("Filtre providers", describeFilter(state.filter)),
      value: "filter" as const,
    },
    {
      name: pad(
        `Timeout install  [${timeout > 0 ? `${timeout}s` : "OFF"}]`,
        "skip auto si une install bloque",
      ),
      value: "timeout" as const,
    },
    new Separator(dim("  ─")),
    { name: pad("Retour", ""), value: "back" as const },
  ];
}

function toggleFastMode(state: MenuState): void {
  state.fast = !state.fast;
  const label = state.fast ? "activé" : "désactivé";
  process.stdout.write(dim(`  fast mode ${label} — rescanne pour appliquer\n`));
}

async function editProviderFilter(state: MenuState): Promise<void> {
  const available = await detectAvailableProviders();
  state.filter = await checkbox<string>({
    message: "Providers à inclure (vide = tous)",
    choices: available.map((p) => ({
      name: `${p.displayName.padEnd(22)} ${dim(`(${p.id})`)}`,
      value: p.id,
      checked: state.filter.length === 0 ? false : state.filter.includes(p.id),
    })),
    loop: false,
    pageSize: 12,
  });
  const label = describeFilter(state.filter);
  process.stdout.write(dim(`  filtre: ${label} — rescanne pour appliquer\n`));
}

async function editInstallTimeout(): Promise<void> {
  const raw = await input({
    message: "Timeout par install en secondes (0 = désactivé)",
    default: String(getInstallTimeoutSeconds()),
    validate: (v) => {
      const n = Number(v.trim());
      return (Number.isFinite(n) && n >= 0) || "saisir un nombre de secondes >= 0";
    },
  });
  setInstallTimeoutSeconds(Number(raw.trim()));
  const next = getInstallTimeoutSeconds();
  process.stdout.write(
    dim(`  timeout install: ${next > 0 ? `${next}s` : "désactivé"}\n`),
  );
}
