import type {
  MailSettingsStore, StoredRecipient,
} from "../../src/ports/mail/mail-settings-store.js";

export class MemoryMailSettingsStore implements MailSettingsStore {
  stored: StoredRecipient | null = null;

  async notifyTo(): Promise<StoredRecipient | null> {
    return this.stored;
  }

  async setNotifyTo(recipient: StoredRecipient): Promise<void> {
    this.stored = recipient;
  }

  async clearNotifyTo(): Promise<void> {
    this.stored = null;
  }
}
