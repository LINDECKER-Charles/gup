# Fragment — `fix/package-multi-select`

Picking packages is checking them: Entrée updates the checked set and nothing else. Design note:
[`docs/development/design/package-multi-select.md`](../../development/design/package-multi-select.md).

## Added

- **ui:** Paquets ends with a selection bar — how many packages are checked out of how many, and a clickable `Entrée  Mettre à jour (n)` button once one is; clicking the bar is pressing Entrée ([`3269fcd`](https://github.com/LINDECKER-Charles/gup/commit/3269fcd))

## Changed

- **ui:** `a` is labelled by what it will do, `a tout cocher` or `a tout décocher`; the `entrée mettre à jour (n)` hint shows only when Entrée can launch ([`3269fcd`](https://github.com/LINDECKER-Charles/gup/commit/3269fcd))

## Fixed

- **ui:** Entrée with nothing checked no longer updates the package (or provider) under the cursor — the trap that made picking several packages feel like updating them one by one. It launches nothing and says how to check (`espace`, or `a` for everything); while a scan is about to replace the table it waits for it. Same rules in the `gup update` picker ([`3269fcd`](https://github.com/LINDECKER-Charles/gup/commit/3269fcd))

## Documentation

- **docs:** Design note of the package multi-select (`docs: describe the package multi-select design`)
