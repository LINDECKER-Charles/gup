/**
 * English catalog — the source every translation derives from.
 *
 * Format (enforced by tests/i18n/catalogs.test.mjs and by the resolver):
 *   - `{name}` placeholders from a closed set: providers, version, node,
 *     nodeEngine, packageName, installCommand, year, endonym.
 *   - Plurals: `{ $count: "providers", one: "…", other: "…" }` with every
 *     category the locale uses. English never needs one for the provider
 *     count; other languages may.
 *   - Inline markup: `code` (never translated), **strong**, [[Key]].
 *     meta.*, common.* and nav.* are plain text only.
 *
 * Commands, ids and links are not here: they live once in src/data/.
 */
export default {
  meta: {
    title: "gup — update winget, brew, npm and pip in one command",
    description:
      "Free, open-source CLI that scans and updates {providers} sources — winget, scoop, " +
      "Homebrew, npm, pip, cargo, helm — from one full-screen terminal app.",
    ogTitle: "gup — one command, {providers} sources up to date",
    ogDescription:
      "One binary scans winget, scoop, Homebrew, MacPorts, npm, pip, cargo, helm, kubectl, " +
      "VS Code and JetBrains — {providers} sources in parallel — and updates what you pick " +
      "without leaving its interface.",
    ogImageAlt:
      "gup — one command, {providers} sources up to date. Open-source CLI for winget, " +
      "Homebrew, npm, pip, cargo and helm.",
    keywords:
      "update all packages, package manager, winget upgrade, brew upgrade, npm update -g, " +
      "pip outdated, cargo, helm, kubectl, cli, windows, macos, linux, topgrade alternative",
  },
  common: {
    skipLink: "Skip to content",
    home: "gup — home",
    github: "Source code on GitHub",
    install: "Install",
    copy: "Copy",
    copied: "Copied!",
    copyLabel: "Copy the install command: {installCommand}",
    copyStatus: "Command copied to the clipboard",
    copyFailed: "Copy failed — select the command and copy it",
    language: "Language",
    languageCurrent: "Language: {endonym}",
    newBadge: "New",
    noscript:
      "JavaScript is off: the page stays fully readable; only the terminal replay and the " +
      "copy buttons are inactive.",
  },
  nav: {
    label: "Page sections",
    features: "Features",
    coverage: "Coverage",
    how: "How it works",
    faq: "FAQ",
  },
  hero: {
    eyebrow: "New — updates now run inside the interface",
    title: { before: "One command.", accent: "{providers} sources", after: "up to date." },
    lead:
      "Stop chasing **winget**, **brew** and **npm**, pip, cargo and helm. gup scans them all " +
      "in parallel, shows what is outdated and updates what you pick — without ever leaving " +
      "its interface.",
    secondaryCta: "View on GitHub",
    trust: [
      "MIT · open source",
      "Node ≥ {node}",
      "Windows · macOS · Linux",
      "Zero telemetry",
      "0 daemon · opt-in scheduling",
    ],
    terminal: {
      label: "gup in action",
      tabs: { app: "Interface", update: "Update", json: "JSON" },
      caption:
        "The interface is in French. Commands, flags and JSON output are the same in every " +
        "language.",
    },
  },
  features: {
    kicker: "01 / FEATURES",
    title: "Everything happens in one interface.",
    lead:
      "Scan, choose, update, schedule and review — gup keeps you in a single full-screen " +
      "terminal app.",
    items: {
      inline: {
        title: "Updates without leaving gup",
        text:
          "Installers run in a terminal pane embedded in the interface — progress bars, " +
          "prompts and colors intact. Updated packages then leave the list, no rescan " +
          "needed. If the embedded terminal is unavailable, gup says why and updates in " +
          "your own terminal instead.",
      },
      select: {
        title: "Pick several, launch once",
        text:
          "Check packages with [[Space]], select everything with [[a]], launch with " +
          "[[Enter]]. One queue, one summary.",
      },
      schedule: {
        title: "Scheduled updates, package by package",
        text:
          "Check packages and press [[p]]: `ripgrep` goes on a weekly schedule, `node` " +
          "stays put. Schedules name packages, never a whole provider; your OS scheduler " +
          "starts gup briefly to run what is due, so nothing stays resident.",
      },
      journal: {
        title: "Activity journal",
        text:
          "Every scan and update is logged locally. Terminal charts show your activity and " +
          "which packages update most often; export the log to debug.",
      },
      report: {
        title: "HTML report",
        text:
          "`gup report`, or [[o]] in the journal, opens a clear, navigable report of your " +
          "history in the browser — a single offline file, readable by anyone, not just " +
          "terminal users.",
      },
      themes: {
        title: "Themes that stay readable",
        text:
          "Ten built-in themes or your own colors: gup checks each one against WCAG AA — " +
          "4.5:1 for text, 3:1 for borders, 7:1 if you pick AAA — and corrects what falls " +
          "short.",
      },
      os: {
        title: "Aware of your OS",
        text:
          "Providers that cannot run on your system are greyed out, not hidden: Windows-only " +
          "tools show as such on a Mac, and the other way round.",
      },
      script: {
        title: "Built for scripts and CI",
        text:
          "`gup list --json`, stable exit codes, `-y` to skip prompts, and " +
          "`provider:package` targets that bypass the scan.",
      },
    },
  },
  coverage: {
    kicker: "02 / COVERAGE",
    title: "{providers} sources. Three systems. One binary.",
    lead:
      "The same executable on Windows, macOS and Linux — same provider contract, same JSON. " +
      "What changes is the OS layer gup can drive.",
    delegated: "delegation",
    supported: "Supported providers",
    everywhere: "Same everywhere",
    allProviders: "All {providers} providers, by domain",
    catalogLink: "Browse the full provider catalog",
    platforms: {
      windows: {
        badge: "Primary target",
        foot:
          "WSL bridge: apt, dnf, pacman, Flatpak, Nix and Linuxbrew inside your distros.",
      },
      macos: {
        badge: "Native",
        foot: "Apple Silicon and Intel · brew Cellar symlinks resolved · `mas` optional.",
      },
      linux: {
        badge: "Native",
        foot:
          "A binary's owner is resolved with `dpkg -S` or `rpm -qf`, then the update goes " +
          "back to that manager.",
      },
    },
    domains: {
      os: "OS package managers",
      wsl: "WSL",
      node: "Node.js",
      python: "Python",
      "dotnet-php": ".NET and PHP",
      jvm: "JVM",
      rust: "Rust",
      "lang-other": "Other languages",
      toolchain: "Version managers",
      cloud: "Cloud CLIs",
      iac: "Infrastructure as code",
      kubernetes: "Kubernetes",
      containers: "Containers",
      security: "Security tooling",
      "dev-cli": "Developer CLIs",
      ide: "IDEs and editors",
      "editor-plugins": "Editor plugins",
      "embedded-mobile": "Embedded and mobile",
      shell: "Shell and prompt",
      self: "gup itself",
    },
  },
  how: {
    kicker: "03 / HOW IT WORKS",
    title: "An orchestrator, not another package manager.",
    lead:
      "gup runs each tool's own commands in parallel and lines the answers up. No registry, " +
      "no cache, nothing left running.",
    steps: {
      scan: {
        title: "Scan",
        text:
          "Every detected provider answers `listOutdated()`, four at a time. One that fails " +
          "only affects its own row.",
      },
      choose: {
        title: "Choose",
        text:
          "Review packages grouped by provider, filter, select — or skip the scan with " +
          "`gup update brew:fzf`.",
      },
      update: {
        title: "Update",
        text:
          "Native commands run as an argument vector, never through a shell. Every attempt " +
          "lands in the local journal.",
      },
    },
    docsLink: "Architecture in detail",
  },
  security: {
    kicker: "04 / SECURITY",
    title: "It runs privileged commands. It is built accordingly.",
    lead:
      "One shell-out point, strict argument vectors, an allowlist pinned by tests — and " +
      "every commit goes through three static analyzers.",
    items: {
      execution: {
        title: "Execution",
        text:
          "Subprocesses run as strict argv vectors, never `shell: true`, through a single " +
          "audited entry point.",
      },
      supplyChain: {
        title: "Supply chain",
        text: "HTTPS-only fetches, dependencies audited on every build, updates reviewed weekly.",
      },
      analysis: {
        title: "Static analysis",
        text:
          "CodeQL, Semgrep and eslint-plugin-security on every commit, plus a test suite " +
          "dedicated to security invariants.",
      },
    },
    links: { policy: "Security policy", contributing: "Contribute" },
  },
  faq: {
    kicker: "05 / FAQ",
    title: "Questions, answered.",
    items: {
      replace: {
        q: "Does gup replace winget, brew or npm?",
        a:
          "No. gup orchestrates each tool's native commands (`winget upgrade`, " +
          "`brew outdated`, `npm update -g`, `pip list --outdated`…) behind one interface. " +
          "No invented protocol, no version cache.",
      },
      platforms: {
        q: "Does it work on macOS and Linux?",
        a:
          "Yes. On macOS natively: Homebrew formulae and casks, MacPorts and the Mac App " +
          "Store, on Apple Silicon and Intel. On Linux, Homebrew/Linuxbrew and Nix cover the " +
          "OS level, and a binary installed by the distribution is handed back to `apt` or " +
          "`dnf`. Everything above the OS layer — npm, pip, cargo, helm, VS Code… — behaves " +
          "the same on all three systems.",
      },
      install: {
        q: "How do I install gup?",
        a:
          "`{installCommand}`, then `gup doctor` to see which providers are detected. " +
          "Requires Node.js {nodeEngine} or later.",
      },
      ci: {
        q: "Can I use gup in CI?",
        a:
          "Yes. `gup list --json --fast` gives machine-readable output and " +
          "`gup update --all -y` skips every prompt. Exit codes are stable: `0` success, " +
          "`1` partial failure, `2` invalid arguments.",
      },
      count: {
        q: "How many package managers does gup cover?",
        a:
          "{providers} providers, one isolated module each: winget, scoop, chocolatey, " +
          "Homebrew, MacPorts, npm, pnpm, pip, uv, cargo, gem, composer, dotnet tools, helm, " +
          "kubectl, terraform, VS Code extensions, JetBrains IDEs, WSL distributions and " +
          "more.",
      },
      security: {
        q: "Is it safe to run?",
        a:
          "Every subprocess goes through one entry point as a strict argument vector — never " +
          "through a shell — with an allowlist pinned by tests. CodeQL, Semgrep, gitleaks, " +
          "audit-ci and Dependabot run continuously. gup sends no telemetry.",
      },
      topgrade: {
        q: "How is it different from topgrade?",
        a:
          "topgrade runs updates; gup first answers “what is outdated, from which version to " +
          "which”. The scan is a separate step with JSON output, package-by-package " +
          "selection, `provider:package` targets, per-package schedules and a local history " +
          "you can review.",
      },
      language: {
        q: "Which language is the interface in?",
        a:
          "The interface is in French for now. Commands, flags and JSON output are " +
          "language-neutral, and this site is available in eight languages.",
      },
    },
  },
  install: {
    kicker: "06 / INSTALL",
    title: "Thirty seconds, and you know everything.",
    lead: "One npm install, one command, and the full list of what is outdated on your machine.",
    examples: {
      menu: "Full-screen interface",
      listFast: "What is outdated, fast scan",
      updateAll: "Everything, no prompt (CI)",
      target: "One package, no scan",
      doctor: "What is detected, and how to install the rest",
    },
    support: {
      title: "Useful to you?",
      text:
        "gup is free, MIT and maintained in my spare time. If it saved you time, a coffee or " +
        "a star keeps the {providers} providers moving.",
      kofi: "Ko-fi",
      sponsors: "GitHub Sponsors",
      star: "Star on GitHub",
    },
  },
  footer: {
    tagline:
      "Global Updater — one CLI for {providers} installation sources. Strict TypeScript, " +
      "ESM, Node ≥ {node}.",
    columns: { project: "Project", docs: "Documentation", technical: "Technical" },
    links: {
      repo: "Source code · GitHub",
      npm: "Package · npm",
      issues: "Issues",
      contributing: "Contributing",
      releases: "Release notes",
      installation: "Installation",
      cli: "CLI reference",
      providers: "Provider catalog",
      scope: "Scope",
      architecture: "Architecture",
      howItWorks: "How gup works",
      security: "Security",
      llms: "llms.txt",
    },
    languages: "Languages",
    legal: "© {year} Charles Lindecker · MIT",
  },
};
