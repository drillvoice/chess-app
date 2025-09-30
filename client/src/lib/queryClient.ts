import type { QueryClient as QueryClientType } from '@tanstack/react-query';

function createFallbackQueryClient(): QueryClientType {
  const store = new Map<string, unknown>();

  const fallback: any = {
    cancelQueries: async () => {},
    invalidateQueries: async () => {},
    refetchQueries: async () => {},
    fetchQuery: async () => undefined,
    ensureQueryData: async () => undefined,
    removeQueries: () => {},
    getQueryData: (key: unknown) => store.get(JSON.stringify(key)),
    getQueriesData: () => Array.from(store.entries()).map(([key, value]) => [key, value]),
    setQueryData: (key: unknown, updater: unknown) => {
      const mapKey = JSON.stringify(key);
      const previous = store.get(mapKey);
      const nextValue = typeof updater === 'function' ? (updater as any)(previous) : updater;
      store.set(mapKey, nextValue);
      return nextValue;
    },
    getDefaultOptions: () => ({ queries: {}, mutations: {} }),
    setDefaultOptions: () => {},
    getMutationCache: () => ({ clear: () => {} }),
    getQueryCache: () => ({
      clear: () => store.clear(),
      find: () => undefined,
      getAll: () => [],
    }),
    clear: () => store.clear(),
  };

  return fallback as QueryClientType;
}

const isTestEnv = typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.MODE === 'test');

async function createRealQueryClient(): Promise<QueryClientType> {
  const module = await import('@tanstack/react-query');
  const QueryClientCtor = module.QueryClient;

  if (typeof QueryClientCtor !== 'function') {
    return createFallbackQueryClient();
  }

  return new QueryClientCtor({
    defaultOptions: {
      queries: {
        refetchInterval: false,
        refetchOnWindowFocus: false, // Don't refetch on focus - trust our cache
        refetchOnMount: false, // Don't refetch when component mounts if data exists
        staleTime: 24 * 60 * 60 * 1000, // Consider data fresh for 24 hours
        gcTime: Infinity, // Keep in cache indefinitely (renamed from cacheTime in v5)
        retry: 0, // Don't retry - fail fast and use cached data
        networkMode: 'offlineFirst', // Always prioritize cached data
      },
      mutations: {
        retry: 0, // Don't retry mutations
        networkMode: 'offlineFirst',
      },
    },
  });
}

export const queryClient: QueryClientType = isTestEnv
  ? createFallbackQueryClient()
  : await createRealQueryClient();
