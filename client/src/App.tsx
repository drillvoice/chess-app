import { Switch, Route } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "@/components/ui/error-boundary";
import Navigation from "@/components/layout/navigation";
import { AccountPage } from "@/components/lazy-components";

const Home = lazy(() => import("@/pages/home"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const History = lazy(() => import("@/pages/history"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/history" component={History} />
        <Route path="/account" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
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
