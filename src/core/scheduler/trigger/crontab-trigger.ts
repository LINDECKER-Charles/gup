import { localized } from "../../i18n/localized.js";
import { whichFirst } from "../../runner.js";
import { hasGupBlock, removeGupBlock, upsertGupBlock } from "../artifacts/crontab-block.js";
import {
  commandFailure,
  DEFAULT_TRIGGER_RUNNER,
  type OsTrigger,
  type TriggerRegistration,
  type TriggerRunner,
  type TriggerStatus,
} from "./os-trigger.js";

/**
 * The trigger as a managed block of the user's crontab (Linux). The crontab
 * is read with `crontab -l` and written back whole with `crontab -` on
 * stdin; a crontab that cannot be read is never overwritten — only "no
 * crontab for <user>" counts as empty. `crontab` is resolved once on PATH,
 * then called by absolute path, under `LC_ALL=C` so its messages can be
 * recognised.
 */

export const CRONTAB_ERRORS = localized({
  en: { missing: "crontab not found — install cron (or cronie) to schedule updates" },
  fr: {
    missing: "crontab introuvable — installez cron (ou cronie) pour planifier des mises à jour",
  },
});

export interface CrontabOptions {
  readonly run?: TriggerRunner;
  /** Absolute path of `crontab`, or null when absent. */
  readonly locate?: () => Promise<string | null>;
}

const C_LOCALE = { LC_ALL: "C" } as const;
const NO_CRONTAB = /no crontab for/i;

export class CrontabTrigger implements OsTrigger {
  readonly mechanism = "crontab";
  readonly #run: TriggerRunner;
  readonly #locate: () => Promise<string | null>;
  #binary: string | null = null;

  constructor(options: CrontabOptions = {}) {
    this.#run = options.run ?? DEFAULT_TRIGGER_RUNNER;
    this.#locate = options.locate ?? (() => whichFirst("crontab"));
  }

  async install(registration: TriggerRegistration): Promise<void> {
    const current = await this.#read();
    const next = upsertGupBlock(current, registration.command);
    if (next !== current) await this.#write(next);
  }

  async uninstall(): Promise<void> {
    const current = await this.#read();
    const next = removeGupBlock(current);
    if (next !== current) await this.#write(next);
  }

  async status(): Promise<TriggerStatus> {
    try {
      return { isInstalled: hasGupBlock(await this.#read()), isDisabledByUser: false };
    } catch {
      return { isInstalled: false, isDisabledByUser: false };
    }
  }

  async location(): Promise<string> {
    return "crontab";
  }

  async #read(): Promise<string> {
    const result = await this.#run(await this.#crontab(), ["-l"], { env: C_LOCALE });
    if (!result.failed) return result.stdout;
    if (NO_CRONTAB.test(result.stderr)) return "";
    throw commandFailure("crontab -l", result);
  }

  /** cron ignores a last line without a line break: always end with one. */
  async #write(text: string): Promise<void> {
    const input = text === "" || text.endsWith("\n") ? text : `${text}\n`;
    const result = await this.#run(await this.#crontab(), ["-"], { input, env: C_LOCALE });
    if (result.failed) throw commandFailure("crontab -", result);
  }

  async #crontab(): Promise<string> {
    this.#binary ??= await this.#locate();
    if (this.#binary === null) throw new Error(CRONTAB_ERRORS.missing);
    return this.#binary;
  }
}
