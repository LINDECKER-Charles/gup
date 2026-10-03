/**
 * French strings of the embedded terminal's process side: why it is
 * unavailable (the update confirmation and `gup doctor` show the reason), the
 * line gup writes into a pane when a session cannot start, and what the
 * trampoline prints when it refuses a request. Exported so the tests assert
 * the exact wording.
 */
export const PTY_LABELS = {
  disabled: "désactivé par GUP_PTY",
  missingModule: "node-pty absent",
  missingTrampoline: "lanceur pty-exec introuvable",
  probeFailed: (detail: string): string => `échec du test du pseudo-terminal : ${detail}`,
  probeTimeout: (seconds: number): string => `pas de réponse après ${seconds} s`,
  probeExitCode: (code: number): string => `code de sortie ${code}`,
  unexpectedInternals: (pin: string): string =>
    `internes de node-pty inattendus (version ${pin} attendue)`,
  spawnHelper: (path: string): string => `spawn-helper non exécutable — chmod +x ${path}`,
  spawnFailed: (reason: string): string => `Impossible d'ouvrir le terminal intégré : ${reason}`,
  badRequest: "gup : requête de terminal invalide",
} as const;
