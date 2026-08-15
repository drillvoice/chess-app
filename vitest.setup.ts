import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// A GitHub Actions runner is several times slower than a dev machine, and the
// whole suite runs jsdom + chess.js across parallel workers. Testing Library's
// 1s default for findBy*/waitFor is comfortable locally and marginal there, so
// give CI more headroom rather than sprinkling per-call `{ timeout }` overrides.
// This only changes how long a *failing* wait keeps polling — a passing wait
// still resolves as soon as its condition holds, so the suite is no slower.
if (process.env.CI) {
  configure({ asyncUtilTimeout: 5000 });
}

// The suite runs without vitest globals (see vitest.config.ts), so React Testing
// Library never registers its automatic cleanup. Without this, rendered components
// pile up in document.body across the tests in a file and queries hit stale
// duplicates from earlier tests.
//
// Setup-file hooks are registered first and vitest's default hook order is 'stack'
// (reverse registration), so this runs *after* each file's own afterEach — any
// per-file teardown still gets to run before the unmount.
afterEach(cleanup);
