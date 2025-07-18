import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Legacy API functions - no longer used since switching to direct Firebase calls
// Kept for backwards compatibility but can be removed in future cleanup

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false, // Don't refetch on focus - trust our cache
      refetchOnMount: false, // Don't refetch when component mounts if data exists
      staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
      gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour (renamed from cacheTime in v5)
      retry: 0, // Don't retry - fail fast and use cached data
      networkMode: 'offlineFirst', // Always prioritize cached data
    },
    mutations: {
      retry: 0, // Don't retry mutations
      networkMode: 'offlineFirst',
    },
  },
});
