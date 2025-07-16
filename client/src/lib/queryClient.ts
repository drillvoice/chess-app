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
      refetchOnWindowFocus: false,
      staleTime: 0, // Don't cache data, always fetch fresh
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
