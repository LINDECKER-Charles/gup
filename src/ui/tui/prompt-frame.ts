import chalk from "chalk";
import { seg, type Line } from "./styled-lines.js";

/**
 * The shape every prompt shares: a `◆` header, the body on a rail, a key hint
 * to close it. Once answered, a prompt leaves a single `◇` line behind in the
 * scrollback, so the session reads as a log of what was decided.
 */
export function framePrompt(message: string, body: readonly Line[], hint: string): Line[] {
  return [
    [seg("◆", "accent"), seg(`  ${message}`, "strong")],
    ...body.map((line): Line => [seg("│  ", "accent"), ...line]),
    [seg("└  ", "accent"), seg(hint, "muted")],
  ];
}

/** The line a resolved prompt leaves in the scrollback. */
export function printAnswer(message: string, answer: string): void {
  process.stdout.write(`${chalk.green("◇")}  ${message} ${chalk.dim(`· ${answer}`)}\n`);
}
