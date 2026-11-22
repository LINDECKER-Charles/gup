import type { Pool } from "pg";
import type { MailSettingsStore, StoredRecipient } from "../../ports/mail/mail-settings-store.js";

export class PgMailSettingsStore implements MailSettingsStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async notifyTo(): Promise<StoredRecipient | null> {
    const { rows } = await this.#pool.query<{ notify_to: string; updated_at: Date }>(
      "SELECT notify_to, updated_at FROM mail_setting");
    const row = rows[0];
    return row === undefined ? null : { address: row.notify_to, updatedAt: row.updated_at };
  }

  async setNotifyTo(recipient: StoredRecipient): Promise<void> {
    await this.#pool.query(
      `INSERT INTO mail_setting (id, notify_to, updated_at) VALUES (true, $1, $2)
       ON CONFLICT (id) DO UPDATE SET notify_to = EXCLUDED.notify_to,
         updated_at = EXCLUDED.updated_at`,
      [recipient.address, recipient.updatedAt]);
  }

  async clearNotifyTo(): Promise<void> {
    await this.#pool.query("DELETE FROM mail_setting");
  }
}
