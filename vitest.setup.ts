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

// jsdom implements no layout, so it ships no `scrollIntoView` at all — calling it
// throws rather than no-opping. Components that keep a focused element in view are
// doing the right thing in a browser, so stub it rather than guarding every call
// site for an API that exists everywhere the app actually runs.
// (Guarded on `Element` itself: the server/API specs run in the node environment,
// where there is no DOM at all.)
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
