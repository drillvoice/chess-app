## Summary

<!-- What does this change, and why? Link the issue if there is one (e.g. "Fixes #123"). -->

## Changes

<!-- Bullet the notable changes. Call out anything a reviewer might miss. -->

-

## Screenshots

<!-- UI changes only: before/after screenshots or a GIF, ideally at phone width. Delete otherwise. -->

## Data & compatibility

<!-- Delete the items that don't apply. -->

- [ ] Touches `shared/schema.ts` or persisted data (IndexedDB / Firestore). Migration and backward-compatibility notes:
- [ ] Persisted, synced or parsed numbers are checked with `Number.isFinite` before arithmetic or date math
- [ ] Lichess proxy changed in **both** `server/lichess.ts` and `api/index.ts` (the parity test enforces this)
- [ ] Needs a new or changed environment variable in Vercel:

## Testing

<!-- How was this verified? Unit tests, E2E, manual check on device. -->

- [ ] Added or updated colocated tests (`foo.ts` → `foo.test.ts`), with no reliance on the network
- [ ] `npm run validate` passes (type-check, lint, tests)
- [ ] `npm run format:check` passes

## Release

- [ ] User-facing change: version bumped in `package.json` and `package-lock.json`, with an entry in `CHANGELOG.md`
- [ ] No user-facing change (internal, tests, docs, CI)
