/**
 * Terms that survive translation verbatim, in Latin script.
 *
 * When an English string contains one of these, every translation of that
 * string must contain it too (tests/i18n/catalogs.test.mjs). Product and tool
 * names are not translated: a reader searches for "winget", not for a
 * transliteration of it. Everything inside backticks is protected separately
 * (the code-span multiset must match the English one).
 *
 * `terms` match case-sensitively on Latin word boundaries: "brew" never
 * matches inside "Homebrew", but may touch a letter of another script (Arabic
 * attaches the conjunction و to the next word: "وbrew"). `nouns` are gup's own
 * vocabulary — the labels its interface prints — and match regardless of
 * case and plural ("Providers", "providers").
 *
 * The recommended renderings of common concepts (package manager, scan,
 * scheduled update…) are guidance for translators, kept in
 * docs/development/website.md rather than enforced here.
 */
export const GLOSSARY = Object.freeze({
  terms: Object.freeze([
    "gup",
    "Global Updater",
    "winget",
    "scoop",
    "chocolatey",
    "Homebrew",
    "brew",
    "Linuxbrew",
    "MacPorts",
    "Mac App Store",
    "mas",
    "npm",
    "pnpm",
    "yarn",
    "bun",
    "pip",
    "pipx",
    "uv",
    "conda",
    "cargo",
    "rustup",
    "gem",
    "composer",
    "dotnet",
    "helm",
    "kubectl",
    "krew",
    "terraform",
    "pulumi",
    "VS Code",
    "Cursor",
    "JetBrains",
    "WSL",
    "apt",
    "dnf",
    "pacman",
    "Flatpak",
    "Nix",
    "Windows",
    "macOS",
    "Linux",
    "Apple Silicon",
    "Intel",
    "Node.js",
    "Node",
    "TypeScript",
    "ESM",
    "JSON",
    "JSONL",
    "CI",
    "CodeQL",
    "Semgrep",
    "gitleaks",
    "audit-ci",
    "Dependabot",
    "eslint-plugin-security",
    "GitHub",
    "GitHub Sponsors",
    "Ko-fi",
    "MIT",
    "WCAG",
    "AA",
    "HTML",
    "topgrade",
    "llms.txt",
  ]),
  nouns: Object.freeze(["provider"]),
});
