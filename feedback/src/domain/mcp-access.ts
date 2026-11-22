/**
 * What an MCP access may do. Each permission opens a set of tools: the
 * server lists and serves those alone.
 */
export const MCP_PERMISSIONS = ["feedback:read", "feedback:triage", "journals:read"] as const;
export type McpPermission = (typeof MCP_PERMISSIONS)[number];

/** The lifetimes the back office offers, in days. */
export const MCP_ACCESS_LIFETIMES = [1, 7, 30, 90, 365] as const;
export type McpAccessLifetime = (typeof MCP_ACCESS_LIFETIMES)[number];
export const DEFAULT_MCP_ACCESS_LIFETIME: McpAccessLifetime = 30;

export const MCP_ACCESS_RULES = {
  /** In characters (code points), as the table's CHECK counts them. */
  maxNameLength: 80,
  /** An access that stopped working stays listed this long, then the daily purge takes it. */
  historyDays: 90,
  /** Access IDs are UUID v4, made by the service. */
  idPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
} as const;

export interface McpAccess {
  readonly id: string;
  /** What the maintainer called it: the tool and the machine. */
  readonly name: string;
  /** In the order of MCP_PERMISSIONS, never empty. */
  readonly permissions: readonly McpPermission[];
  /** The token's last four characters: enough to tell two apart, never to use one. */
  readonly tokenHint: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type McpAccessState = "active" | "expired" | "revoked";

export function mcpAccessState(
  access: Pick<McpAccess, "expiresAt" | "revokedAt">,
  now: Date,
): McpAccessState {
  if (access.revokedAt !== null) return "revoked";
  return access.expiresAt.getTime() <= now.getTime() ? "expired" : "active";
}

export function isMcpPermission(value: string): value is McpPermission {
  return MCP_PERMISSIONS.some((permission) => permission === value);
}

/**
 * The permissions an access is given for those chosen: triage answers with
 * the feedback it changed, so it brings reading with it. In vocabulary
 * order, each once.
 */
export function grantedPermissions(chosen: Iterable<McpPermission>): McpPermission[] {
  const set = new Set(chosen);
  if (set.has("feedback:triage")) set.add("feedback:read");
  return MCP_PERMISSIONS.filter((permission) => set.has(permission));
}
