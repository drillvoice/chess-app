import { Switch, Route } from 'wouter';
import { lazy, Suspense, useEffect } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import Navigation from '@/components/layout/navigation';
import PageSkeleton from '@/components/layout/page-skeleton';
import { NetworkWarning } from '@/components/ui/network-status';
import { useAuthInit } from '@/hooks/useAuthInit';
import { useCacheWarming } from '@/hooks/useCacheWarming';
import { useLichessSync } from '@/hooks/useLichessSync';
import { routeLoaders, prefetchAllRoutesWhenIdle } from '@/lib/route-loaders';

// Home is the landing page, so it ships in the main bundle.
import Home from '@/pages/home';

// Everything else is split out so the Firebase SDK and chess.js stay off the critical path.
const AccountPage = lazy(routeLoaders['/account']);
const Activity = lazy(routeLoaders['/activity']);
const Info = lazy(routeLoaders['/info']);
const OtbPage = lazy(routeLoaders['/otb']);
const OpeningsPage = lazy(routeLoaders['/openings']);
const NotFound = lazy(() => import('@/pages/not-found'));

function Router() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/openings" component={OpeningsPage} />
        <Route path="/otb" component={OtbPage} />
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
  useEffect(() => prefetchAllRoutesWhenIdle(), []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="app-container">
            <Navigation />
            <main className="max-w-full p-4 md:p-6 lg:p-8">
              <Router />
            </main>
          </div>
          <NetworkWarning />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
