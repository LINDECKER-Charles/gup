export interface HealthProbe {
  /** Whether the database answers. Never throws. */
  isHealthy(): Promise<boolean>;
}
