import type { MailSettingsStore } from "../ports/mail/mail-settings-store.js";

/** Where feedback notifications go now, and whether the back office chose it. */
export interface Recipient {
  readonly address: string;
  /** null = FEEDBACK_NOTIFY_TO, as configured; else when the back office set it. */
  readonly changedAt: Date | null;
}

/**
 * The notification address: the one the back office set, else
 * FEEDBACK_NOTIFY_TO. Read when mails leave, never cached, so a change
 * applies to the mails still in the outbox too.
 */
export class NotifyRecipient {
  readonly #store: MailSettingsStore;
  readonly #configured: string;

  constructor(store: MailSettingsStore, configured: string) {
    this.#store = store;
    this.#configured = configured;
  }

  /** FEEDBACK_NOTIFY_TO: what "back to the default" restores. */
  get configured(): string {
    return this.#configured;
  }

  async current(): Promise<Recipient> {
    const stored = await this.#store.notifyTo();
    return stored === null
      ? { address: this.#configured, changedAt: null }
      : { address: stored.address, changedAt: stored.updatedAt };
  }

  /** Setting it to FEEDBACK_NOTIFY_TO is going back to the default: nothing stays stored. */
  async change(address: string, at: Date): Promise<void> {
    if (address === this.#configured) await this.#store.clearNotifyTo();
    else await this.#store.setNotifyTo({ address, updatedAt: at });
  }

  async reset(): Promise<void> {
    await this.#store.clearNotifyTo();
  }
}
