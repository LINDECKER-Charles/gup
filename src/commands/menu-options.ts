import { detectAvailableProviders } from "../core/registry.js";
import {
  getInstallTimeoutSeconds,
  setInstallTimeoutSeconds,
} from "../core/runner.js";
import { checkbox } from "../ui/prompts/checkbox.js";
import { input } from "../ui/prompts/input.js";
import { select, type SelectEntry } from "../ui/prompts/select.js";
import { describeFilter, dim, type MenuState } from "./menu-state.js";

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
  });

  if (choice === "fast") toggleFastMode(state);
  else if (choice === "filter") await editProviderFilter(state);
  else if (choice === "timeout") await editInstallTimeout();
}

function optionChoices(state: MenuState): SelectEntry<OptionAction>[] {
  const timeout = getInstallTimeoutSeconds();
  return [
    {
      label: `Fast mode  [${state.fast ? "ON" : "OFF"}]`,
      hint: "skip pwsh-modules & vscode-ext",
      value: "fast",
    },
    { label: "Filtre providers", hint: describeFilter(state.filter), value: "filter" },
    {
      label: `Timeout install  [${timeout > 0 ? `${timeout}s` : "OFF"}]`,
      hint: "skip auto si une install bloque",
      value: "timeout",
    },
    { separator: true },
    { label: "Retour", value: "back" },
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
    groups: [
      {
        title: "",
        choices: available.map((p) => ({
          label: p.displayName,
          hint: p.id,
          value: p.id,
          checked: state.filter.includes(p.id),
        })),
      },
    ],
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
      const n = Number(v);
      return (Number.isFinite(n) && n >= 0) || "saisir un nombre de secondes >= 0";
    },
  });
  setInstallTimeoutSeconds(Number(raw));
  const next = getInstallTimeoutSeconds();
  process.stdout.write(
    dim(`  timeout install: ${next > 0 ? `${next}s` : "désactivé"}\n`),
  );
}
