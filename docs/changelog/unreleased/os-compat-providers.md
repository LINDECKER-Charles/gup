# Fragment — `feat/os-compat-providers`

Providers that only exist on another OS are greyed out instead of passing for "not installed":
the Providers view and `gup doctor` list them in their own group, and gup never probes, scans
nor updates them. Design note:
[`../../development/design/os-compat.md`](../../development/design/os-compat.md).

## Added

- **ui:** The Providers view opens on a summary (`27 détecté(s) · 112 non installé(s) · 14 incompatible(s) avec Windows`) and lists a third group, "Incompatibles avec \<OS\>", greyed, each row marked `–` with a badge saying where it runs (`macOS uniquement`) — readable without colour too. The `showIncompatibleProviders` preference hides the group; on a narrow panel the summary breaks between its parts rather than being cut ([`b523aef`](https://github.com/LINDECKER-Charles/gup/commit/b523aef), [`5305936`](https://github.com/LINDECKER-Charles/gup/commit/5305936))
- **cli:** `gup doctor` lists the same group, dimmed, after the missing providers ([`2967762`](https://github.com/LINDECKER-Charles/gup/commit/2967762))
- **cli:** `gup list` and `gup update` warn once per `--provider` id gup cannot act on here — foreign to the OS or unknown — instead of scanning nothing in silence ([`39c6d44`](https://github.com/LINDECKER-Charles/gup/commit/39c6d44))

## Changed

- **providers:** 35 providers declare the OSes gup supports them on — 21 Windows-only, 6 macOS-only, 8 everywhere but Windows. Elsewhere they are never probed, scanned nor updated: a `winget`, `scoop` or `choco` shim on a macOS/Linux `PATH` no longer lights up those providers (the `self` meta-provider's self-update targets of the same names are not restricted yet), and `gup update brew-cask:x` on Windows exits 2 with `Provider brew-cask indisponible sur Windows (macOS uniquement)` ([`c3941c0`](https://github.com/LINDECKER-Charles/gup/commit/c3941c0))

## Documentation

- **docs:** Providers catalog: a "Platform support" section with the three sets and the incompatible list of each OS; design note for the branch ([`606dfd0`](https://github.com/LINDECKER-Charles/gup/commit/606dfd0))
- **providers:** The provider template explains how to declare `platforms` ([`fc18ec0`](https://github.com/LINDECKER-Charles/gup/commit/fc18ec0))

## Internal

- **providers:** The `self` meta-provider filters its targets with the shared `isSupportedOn`; the `self:brew` target uses the `brew` provider's set ([`107c450`](https://github.com/LINDECKER-Charles/gup/commit/107c450))
