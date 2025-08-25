import { Switch, Route } from 'wouter';
import { lazy, Suspense, useEffect } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import Navigation from '@/components/layout/navigation';
import { NetworkWarning } from '@/components/ui/network-status';
import { initializeCacheWarming, setupOnlineCacheWarming } from '@/lib/cache-warming';
import { preloadStudyPreferences } from '@/hooks/use-study-preferences';

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
  useEffect(() => {
    let stopSync: (() => void) | undefined;
    let unsub: (() => void) | undefined;
    let cleanupOnlineWarming: (() => void) | undefined;

    const init = async () => {
      try {
        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { getUserSettings, ensureAuthentication } = await import('@/lib/firebase');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        // Initialize Firebase and ensure authentication (anonymous if no Google auth)
        await ensureAuthentication();

        unsub = onAuthStateChanged(auth, async (user) => {
          if (stopSync) {
            stopSync();
            stopSync = undefined;
          }
          // Start Lichess sync for any authenticated user (including anonymous)
          if (user) {
            try {
              const settings = await getUserSettings();
              if (settings.lichessUsername) {
                stopSync = startLichessSync(settings.lichessUsername);
              }
            } catch (err) {
              console.error('Failed to start Lichess sync:', err);
            }
          }
        });
              } catch (err) {
          console.error('Lichess sync init failed:', err);
        }
      };

      // Initialize cache warming
      initializeCacheWarming();
      cleanupOnlineWarming = setupOnlineCacheWarming();

      // Preload study preferences for instant TagManager loading
      preloadStudyPreferences();

      init();

    return () => {
      if (unsub) unsub();
      if (stopSync) stopSync();
      if (cleanupOnlineWarming) cleanupOnlineWarming();
    };
  }, []);

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
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
