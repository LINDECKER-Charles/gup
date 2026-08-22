# Archived working documents

Everything in this folder except this file is **gitignored** (`docs/archived/*`
with `!docs/archived/README.md` in the root `.gitignore`). It holds documents
that are useful on the machine that produced them but are not deliverable
documentation: audit snapshots, generated reports, scratch analyses. They date
quickly, they describe a commit rather than the product, and committing them
would turn every later change into a lie about what the report says.

Nothing here is referenced from tracked documentation. If a document in this
folder becomes worth keeping, rewrite it for `docs/` proper — do not un-ignore
it.

## Layout

| Subfolder | Content | Produced by |
|---|---|---|
| `reports/` | Architecture and convention audits (file sizes, DRY/SOLID/KISS, commit-convention compliance). One file per run, named `<topic>-<YYYY-MM-DD>.md`. | `/archi-report`, `/archi-refacto`, ad-hoc audits |

Add a subfolder per kind of document rather than dropping files at the root,
and keep the `<topic>-<YYYY-MM-DD>.md` naming so a folder listing reads as a
timeline.

## History

Until 2026-08-22 the audit reports lived in `docs/reports/`, which was the
gitignored path. That folder was folded into `archived/reports/` when the rest
of `docs/` was reorganised into `guide/`, `development/`, `releases/` and
`changelog/`.
