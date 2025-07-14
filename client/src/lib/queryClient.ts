import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Use offline API when offline
  const res = await (navigator.onLine ? fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  }) : mockOfflineRequest(method, url, data));

  await throwIfResNotOk(res);
  return res;
}

// Mock offline requests to use localStorage
async function mockOfflineRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const { localStorage } = await import("./storage");
  
  if (url === '/api/statistics') {
    return new Response(JSON.stringify(localStorage.getStatistics()), { status: 200 });
  }
  if (url === '/api/training-sessions') {
    return new Response(JSON.stringify(localStorage.getAllSessions()), { status: 200 });
  }
  if (url === '/api/weekly-goal') {
    return new Response(JSON.stringify(localStorage.getCurrentWeeklyGoal()), { status: 200 });
  }
  if (url.startsWith('/api/training-sessions/') && method === 'POST') {
    const result = localStorage.createSession(data);
    return new Response(JSON.stringify(result), { status: 200 });
  }
  if (url === '/api/export') {
    return new Response(localStorage.exportData(), { status: 200 });
  }
  if (url === '/api/import' && method === 'POST') {
    const body = data as { data: string };
    localStorage.importData(body.data);
    return new Response(JSON.stringify({ message: 'Data imported successfully' }), { status: 200 });
  }
  
  return new Response(JSON.stringify({ error: 'Endpoint not available offline' }), { status: 503 });
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await (navigator.onLine ? fetch(queryKey[0] as string, {
      credentials: "include",
    }) : mockOfflineRequest('GET', queryKey[0] as string));

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
