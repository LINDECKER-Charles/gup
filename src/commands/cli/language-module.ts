import chalk from "chalk";
import { ADMIN_BATCH_COMMAND } from "../../core/elevation.js";
import {
  LOCALE_NAMES,
  LOCALES,
  parseLocale,
  setActiveLocale,
  type Locale,
} from "../../core/i18n/locale.js";
import { LANGUAGE_ENV, resolveLocale, type LocaleChoice } from "../../core/i18n/resolve-locale.js";
import { settingsService, type SettingsService } from "../../ui/settings/settings-service.js";
import { ERROR_LABELS } from "../../ui/text/cli-labels.js";
import { LANGUAGE_LABELS } from "../../ui/text/language-labels.js";
import { MODULE_ORDER, type CliModule, type DiagnosticLine } from "./cli-module.js";

/**
 * The interface language on the command line: chosen before commander is
 * built (`cli.ts` calls {@link applyStartupLocale}), shown and changed with
 * `gup language [code]` — the command an install line chains to pick French —
 * and reported on `gup doctor`'s "System" section.
 */

export interface LanguageModuleDeps {
  readonly settings: () => SettingsService;
  readonly env: NodeJS.ProcessEnv;
  readonly write: (text: string) => void;
  readonly writeError: (text: string) => void;
}

const DEFAULT_DEPS: LanguageModuleDeps = {
  settings: settingsService,
  env: process.env,
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
};

const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;
const CODES = LOCALES.join(", ");

/**
 * Speak the user's language from here on. The elevated child never reads
 * the user's settings — its parent's language arrives in the batch payload
 * — so it starts from `GUP_LANG` alone.
 */
export function applyStartupLocale(
  argv: readonly string[],
  deps: Pick<LanguageModuleDeps, "settings" | "env"> = DEFAULT_DEPS,
): void {
  const isElevatedChild = argv[2] === ADMIN_BATCH_COMMAND;
  const choice = isElevatedChild ? resolveLocale({ env: deps.env }) : currentChoice(deps);
  setActiveLocale(choice.locale);
}

export function createLanguageModule(deps: LanguageModuleDeps = DEFAULT_DEPS): CliModule {
  return {
    id: "language",
    order: MODULE_ORDER.commands,
    register(program) {
      program
        .command("language")
        .description(LANGUAGE_LABELS.commandDescription)
        .argument("[code]", LANGUAGE_LABELS.codeArgument)
        .action((code: string | undefined) => process.exit(languageCommand(code, deps)));
    },
    diagnostics: async () => [languageDiagnostic(currentChoice(deps))],
  };
}

export const languageModule = createLanguageModule();

/** `gup language` shows the language and where it comes from; `gup language <code>` saves it. */
export function languageCommand(code: string | undefined, deps: LanguageModuleDeps): number {
  if (code === undefined) {
    showLanguage(currentChoice(deps), deps);
    return 0;
  }
  const locale = parseLocale(code);
  if (locale === null) return fail(LANGUAGE_LABELS.unknown(code, CODES), USAGE_EXIT_CODE, deps);
  try {
    deps.settings().update("interface", { language: locale });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(LANGUAGE_LABELS.saveFailed(reason), FAILURE_EXIT_CODE, deps);
  }
  setActiveLocale(locale);
  deps.write(`${LANGUAGE_LABELS.saved}\n`);
  warnIfEnvOverrides(locale, deps);
  return 0;
}

/** The "System" line of `gup doctor`: the language and its source, and a `GUP_LANG` it ignored. */
export function languageDiagnostic(choice: LocaleChoice): DiagnosticLine {
  const value = LANGUAGE_LABELS.diagnosticValue(LANGUAGE_LABELS.sources[choice.source]);
  if (choice.ignoredEnv === undefined) {
    return { label: LANGUAGE_LABELS.diagnosticLabel, value, status: "ok" };
  }
  const ignored = LANGUAGE_LABELS.ignoredEnv(choice.ignoredEnv, CODES);
  return { label: LANGUAGE_LABELS.diagnosticLabel, value: `${value} · ${ignored}`, status: "warn" };
}

function currentChoice(deps: Pick<LanguageModuleDeps, "settings" | "env">): LocaleChoice {
  return resolveLocale({ env: deps.env, setting: () => deps.settings().get("interface").language });
}

function showLanguage(choice: LocaleChoice, deps: LanguageModuleDeps): void {
  const choices = LOCALES.map((locale) => `${locale} (${LOCALE_NAMES[locale]})`).join(", ");
  const lines = [
    LANGUAGE_LABELS.current(LANGUAGE_LABELS.sources[choice.source]),
    ...(choice.ignoredEnv === undefined
      ? []
      : [LANGUAGE_LABELS.ignoredEnv(choice.ignoredEnv, CODES)]),
    LANGUAGE_LABELS.available(choices),
    LANGUAGE_LABELS.changeHint,
  ];
  deps.write(`${lines.join("\n")}\n`);
}

/** The setting is saved, but this shell's `GUP_LANG` still decides: say so. */
function warnIfEnvOverrides(saved: Locale, deps: LanguageModuleDeps): void {
  const choice = resolveLocale({ env: deps.env, setting: () => saved });
  const raw = deps.env[LANGUAGE_ENV]?.trim();
  if (choice.source === "env" && choice.locale !== saved && raw) {
    deps.writeError(`${LANGUAGE_LABELS.envOverrides(raw)}\n`);
  }
}

function fail(message: string, code: number, deps: LanguageModuleDeps): number {
  deps.writeError(`${chalk.red(ERROR_LABELS.prefix)} ${message}\n`);
  return code;
}
