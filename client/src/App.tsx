import { Switch, Route } from 'wouter';
import { lazy, Suspense } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import Navigation from '@/components/layout/navigation';
import { NetworkWarning } from '@/components/ui/network-status';
import CloudSyncStatus from '@/components/cloud-sync-status';
import { useAuthInit } from '@/hooks/useAuthInit';
import { useCacheWarming } from '@/hooks/useCacheWarming';
import { useLichessSync } from '@/hooks/useLichessSync';

// Static imports for core pages (better reliability)
import Home from '@/pages/home';
import AccountPage from '@/pages/account';

// Lazy imports for less critical pages
const Activity = lazy(() => import('@/pages/activity'));
const Info = lazy(() => import('@/pages/info'));
const NotFound = lazy(() => import('@/pages/not-found'));

function Router() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/activity" component={Activity} />
        <Route path="/account" component={AccountPage} />
        <Route path="/info" component={Info} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useAuthInit();
  useCacheWarming();
  useLichessSync();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="app-container">
            <Navigation />
            <main className="p-4">
              <Router />
            </main>
          </div>
          <NetworkWarning />
          <CloudSyncStatus />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
