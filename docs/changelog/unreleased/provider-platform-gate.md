# Fragment — `refactor/provider-platform-gate`

The platform declarations of the providers become the only gate: providers stop testing the OS
themselves, a source-level test keeps it that way, install hints nobody can see are gone, and
the seven unregistered manual-only IDE providers are deleted. Design note:
[`../../development/design/os-compat.md`](../../development/design/os-compat.md) §10.

## Fixed

- **providers:** The `self` meta-provider's `winget`, `scoop` and `choco` self-update targets are Windows-only, like the providers of the same names: on macOS/Linux a shim of those names on the `PATH` no longer lights up `self` nor gets run for its version ([`f3082d6`](https://github.com/LINDECKER-Charles/gup/commit/f3082d6))
- **providers:** `nix`'s install hint off macOS/Linux (the BSDs) was its Windows hint ("Nix s'installe dans WSL"); it is the upstream download page everywhere ([`348cbcc`](https://github.com/LINDECKER-Charles/gup/commit/348cbcc))

## Removed

- **providers/ide:** The unregistered manual-only providers `jetbrains-plugins`, `zed-ext`, `sublime-pc`, `obsidian-plugins`, `unity-hub`, `notepad-pp` and `eclipse-marketplace` — never offered by gup, every row they produced being `manual` — with their tests and lint overrides; the providers catalog lists them as candidates ([`c6058e8`](https://github.com/LINDECKER-Charles/gup/commit/c6058e8))

## Documentation

- **docs:** The catalog, CONTRIBUTING §5.3, how-gup-works and the architecture tree say a source whose every update needs a GUI gets no provider and is listed as a candidate; the catalog's platform section names the source drift test and drops the "self targets not restricted yet" caveat ([`0ce83c7`](https://github.com/LINDECKER-Charles/gup/commit/0ce83c7), [`f3082d6`](https://github.com/LINDECKER-Charles/gup/commit/f3082d6))

## Internal

- **providers:** The 19 providers that opened `isAvailable()` with a `process.platform` guard rely on the registry gate; `tests/core/platform/platform-gate-source.test.ts` (TypeScript AST) fails when a provider's `isAvailable()` reads `process.platform` or when anything but the registry calls a provider's `isAvailable()`; 24 per-provider "refuses a foreign OS" tests, superseded by the golden platform tests, are deleted ([`7c78edb`](https://github.com/LINDECKER-Charles/gup/commit/7c78edb))
- **providers:** Install hints that can never be shown are dropped — the keys of platforms outside a provider's set and the fallbacks no supported platform reaches; 32 providers are left with a plain string, and the drift test gains a rule against unreachable hints ([`348cbcc`](https://github.com/LINDECKER-Charles/gup/commit/348cbcc))
- **cli:** A test holds `gup schedule add brew:git` on Windows to exit 2 with `Provider brew indisponible sur Windows (macOS/Linux uniquement)`, through the real registry ([`8756835`](https://github.com/LINDECKER-Charles/gup/commit/8756835))
