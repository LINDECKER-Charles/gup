/** The notification address the back office set, overriding FEEDBACK_NOTIFY_TO. */
export interface StoredRecipient {
  readonly address: string;
  readonly updatedAt: Date;
}

export interface MailSettingsStore {
  /** null = never changed, or changed back: FEEDBACK_NOTIFY_TO applies. */
  notifyTo(): Promise<StoredRecipient | null>;
  setNotifyTo(recipient: StoredRecipient): Promise<void>;
  clearNotifyTo(): Promise<void>;
}
