import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// The suite runs without vitest globals (see vitest.config.ts), so React Testing
// Library never registers its automatic cleanup. Without this, rendered components
// pile up in document.body across the tests in a file and queries hit stale
// duplicates from earlier tests.
//
// Setup-file hooks are registered first and vitest's default hook order is 'stack'
// (reverse registration), so this runs *after* each file's own afterEach — any
// per-file teardown still gets to run before the unmount.
afterEach(cleanup);
