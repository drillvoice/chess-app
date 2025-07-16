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
  // Always use offline/local storage for Firebase Hosting (static hosting)
  // Since there's no backend server, we route all API calls to local storage
  const res = await mockOfflineRequest(method, url, data);
  await throwIfResNotOk(res);
  return res;
}

// Route all API calls to hybrid storage for Firebase Hosting (static hosting)
async function mockOfflineRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const { hybridStorage } = await import("./hybridStorage");
  
  // Ensure storage is initialized
  await hybridStorage.init();
  
  try {
    if (url === '/api/statistics') {
      const stats = await hybridStorage.getStatistics();
      return new Response(JSON.stringify(stats), { status: 200 });
    }
    if (url === '/api/training-sessions') {
      const sessions = await hybridStorage.getAllSessions();
      return new Response(JSON.stringify(sessions), { status: 200 });
    }
    if (url === '/api/weekly-goal') {
      const goal = await hybridStorage.getCurrentWeeklyGoal();
      return new Response(JSON.stringify(goal), { status: 200 });
    }
    if (url.startsWith('/api/training-sessions/') && method === 'POST') {
      const result = await hybridStorage.createSession(data);
      return new Response(JSON.stringify(result), { status: 200 });
    }
    if (url.startsWith('/api/training-sessions/') && method === 'DELETE') {
      const id = parseInt(url.split('/').pop() || '0');
      const result = await hybridStorage.deleteSession(id);
      return new Response(JSON.stringify({ success: result }), { status: 200 });
    }
    if (url === '/api/export') {
      const data = await hybridStorage.exportData();
      return new Response(data, { status: 200 });
    }
    if (url === '/api/import' && method === 'POST') {
      const body = data as { data: string };
      await hybridStorage.importData(body.data);
      return new Response(JSON.stringify({ message: 'Data imported successfully' }), { status: 200 });
    }
    
    return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404 });
  } catch (error) {
    console.error('Storage operation failed:', error);
    return new Response(JSON.stringify({ error: 'Internal storage error' }), { status: 500 });
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Always use local storage for Firebase Hosting (static hosting)
    const res = await mockOfflineRequest('GET', queryKey[0] as string);

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
