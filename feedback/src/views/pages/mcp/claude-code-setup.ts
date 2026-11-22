import type { AppConfig } from "../../../config/app-config.js";

/** How Claude Code reaches this service: one registration per environment, side by side. */
export interface ClaudeCodeSetup {
  readonly serverName: string;
  /** The variable that holds the token on the maintainer's machine. */
  readonly envVar: string;
  readonly url: string;
}

export function claudeCodeSetup(config: Pick<AppConfig, "env" | "publicOrigin">): ClaudeCodeSetup {
  const isProduction = config.env === "production";
  return {
    serverName: isProduction ? "gup-feedback" : "gup-feedback-dev",
    envVar: isProduction ? "GUP_FEEDBACK_MCP_TOKEN" : "GUP_FEEDBACK_DEV_MCP_TOKEN",
    url: `${config.publicOrigin}/mcp`,
  };
}

/**
 * The registration command, as the groups a reader keeps together (a flag and its
 * value), joined by single spaces. Single quotes keep `${…}` literal in sh and in
 * PowerShell alike: Claude Code expands it at each connection, so the token never
 * lands in its configuration.
 */
export function claudeMcpAddCommand(setup: ClaudeCodeSetup): readonly string[] {
  return [
    "claude mcp add", "--transport http", "--scope user", setup.serverName, setup.url,
    `--header 'Authorization: Bearer \${${setup.envVar}}'`,
  ];
}
