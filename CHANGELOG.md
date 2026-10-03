# Changelog

The changelog of `gup` lives in [`docs/changelog/`](docs/changelog/README.md):
one file per version, newest first, every commit since the first one accounted
for with its commit and pull request links. Work merged to `main` and not yet
released is in [`docs/changelog/unreleased.md`](docs/changelog/unreleased.md),
plus one fragment per merged branch under `docs/changelog/unreleased/`: each
branch writes its own `<branch-slug>.md`, so that parallel branches never edit
the same file, and the fragments are folded into `unreleased.md` before a
version is cut.

The narrative of each version (what shipped, what broke, how it was verified)
is in the [release notes](docs/releases/README.md), which are also the body of
each [GitHub Release](https://github.com/LINDECKER-Charles/gup/releases).

This file deliberately names no version: the tables it points to are the only
place that does, so nothing here can fall out of date.
