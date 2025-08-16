import { Switch, Route } from 'wouter';
import { lazy, Suspense, useEffect } from 'react';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import Navigation from '@/components/layout/navigation';
import { AccountPage } from '@/components/lazy-components';

const Home = lazy(() => import('@/pages/home'));
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

    const init = async () => {
      try {
        const { getFirebaseAuth } = await import('@/lib/firebaseClient');
        const auth = await getFirebaseAuth();
        const { onAuthStateChanged } = await import('firebase/auth');
        const { getUserSettings } = await import('@/lib/firebase');
        const { startLichessSync } = await import('@/lib/lichess-sync');

        unsub = onAuthStateChanged(auth, async (user) => {
          if (stopSync) {
            stopSync();
            stopSync = undefined;
          }
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

    init();

    return () => {
      if (unsub) unsub();
      if (stopSync) stopSync();
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
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
