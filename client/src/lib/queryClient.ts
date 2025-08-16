import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
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
