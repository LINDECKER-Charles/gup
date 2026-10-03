# Roadmap

Changes that are already **decided** but deliberately waiting on something
outside this repo — a date, or an upstream release.

Each entry names its trigger, the exact edits, and what must *not* change. The
point is that when the trigger fires, nobody has to re-derive the decision or
rediscover why it was postponed. This is not a wish list: an idea with no
concrete trigger and no known set of edits does not belong here — that
discussion lives in [`scope.md`](../guide/scope.md).

---

## Waiting on an upstream release

### TypeScript 7 — when typescript-eslint supports TS ≥ 7.1

**Trigger:** `@typescript-eslint/*` publishes a release whose `typescript` peer
range admits 7.1 or later. Tracking issue:
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).

One command answers it — go when the upper bound clears 7.1:

```bash
npm view @typescript-eslint/eslint-plugin peerDependencies.typescript
```

**Why it is blocked.** This is not a peer-range warning that could be forced
through. The plugin refuses TS 7 at load time:

```
Error: typescript-eslint does not support TS 7.0.
```

So `npm run lint` **and** `npm run lint:security` both die — the second one
being the security gate. Upstream is skipping 7.0 entirely and targeting
7.1, so waiting for a `<7.0` peer bump would be waiting for something that is
not coming.

**State as of 2026-08-17** — measured on the TS 7.0.2 branch with peers forced:

| Check | Result |
|---|---|
| `tsc --noEmit` (tsc 7.0.2) | 0 errors |
| `tsup` build | success |
| `eslint src` | fails to load the plugin |
| `@typescript-eslint/eslint-plugin` latest (8.67.0) and canary | peer `typescript@">=4.8.4 <6.1.0"` |

The source itself is already TS 7 clean, and TS 7.1 is in the `next` dist-tag.
Nothing here needs migrating — only the flip.

**The edit** — two `devDependencies` in [`../package.json`](../../package.json):

```
typescript             ^6.0.3  →  ^7.x
@typescript-eslint/*   ^8.66.0 →  whichever release lifted the bound
```

**Verification before merging** — the lint pair is the whole point, so do not
trust a green typecheck alone:

```bash
npm ci && npm run typecheck && npm run lint && npm run lint:security \
  && npm run test:run && npm run build
```

`npm ci` must succeed without `--force`: an `ERESOLVE` means the peer bound has
not actually lifted and the upgrade is still premature.
