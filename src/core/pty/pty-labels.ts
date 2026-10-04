import { localized } from "../i18n/localized.js";

/**
 * The embedded terminal's process side, in the interface's languages: why it
 * is unavailable (the update confirmation and `gup doctor` show the reason),
 * the line gup writes into a pane when a session cannot start, and what the
 * trampoline prints when it refuses a request. Exported so the tests assert
 * the exact wording.
 */
export const PTY_LABELS = localized({
  en: {
    disabled: "turned off by GUP_PTY",
    missingModule: "node-pty missing",
    missingTrampoline: "pty-exec launcher not found",
    probeFailed: (detail: string): string => `pseudo-terminal test failed: ${detail}`,
    probeTimeout: (seconds: number): string => `no answer after ${seconds} s`,
    probeExitCode: (code: number): string => `exit code ${code}`,
    unexpectedInternals: (pin: string): string =>
      `unexpected node-pty internals (version ${pin} expected)`,
    spawnHelper: (path: string): string => `spawn-helper not executable — chmod +x ${path}`,
    spawnFailed: (reason: string): string => `Cannot open the embedded terminal: ${reason}`,
    badRequest: "gup: invalid terminal request",
  },
  fr: {
    disabled: "désactivé par GUP_PTY",
    missingModule: "node-pty absent",
    missingTrampoline: "lanceur pty-exec introuvable",
    probeFailed: (detail) => `échec du test du pseudo-terminal : ${detail}`,
    probeTimeout: (seconds) => `pas de réponse après ${seconds} s`,
    probeExitCode: (code) => `code de sortie ${code}`,
    unexpectedInternals: (pin) => `internes de node-pty inattendus (version ${pin} attendue)`,
    spawnHelper: (path) => `spawn-helper non exécutable — chmod +x ${path}`,
    spawnFailed: (reason) => `Impossible d'ouvrir le terminal intégré : ${reason}`,
    badRequest: "gup : requête de terminal invalide",
  },
});
