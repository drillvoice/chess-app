import { logger } from './logger';

// One loader per lazily-split page. React.lazy and prefetchRoute share these, and the
// browser caches the dynamic import, so a prefetched page renders without a network wait.
export const routeLoaders = {
  '/activity': () => import('@/pages/activity'),
  '/openings': () => import('@/pages/openings'),
  '/otb': () => import('@/pages/otb'),
  '/account': () => import('@/pages/account'),
  '/info': () => import('@/pages/info'),
} as const;

type PrefetchablePath = keyof typeof routeLoaders;

function isPrefetchable(path: string): path is PrefetchablePath {
  return Object.prototype.hasOwnProperty.call(routeLoaders, path);
}

export function prefetchRoute(path: string): void {
  if (!isPrefetchable(path)) return;
  routeLoaders[path]().catch((error) => {
    // Best-effort: navigating to the page retries the import and surfaces any real failure.
    logger.warn(`Failed to prefetch route ${path}:`, error);
  });
}

/** Warm every page chunk once the browser is idle, unless the user asked to save data. */
export function prefetchAllRoutesWhenIdle(): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return () => {};

  const run = () => Object.keys(routeLoaders).forEach(prefetchRoute);
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout: 5000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(run, 2000);
  return () => clearTimeout(id);
}
