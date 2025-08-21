import {
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
  Component,
} from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  retryCount: number;
  isRetrying: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ComponentType<{ error: Error; retry: () => void }>;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, retryCount: 0, isRetrying: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, retryCount: 0, isRetrying: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Log specific dynamic import failures for debugging
    if (error.message.includes('Failed to fetch dynamically imported module')) {
      console.warn('Dynamic import failure detected. This may be due to network issues or cache problems.');
    }
  }

  handleRetry = async () => {
    const { retryCount } = this.state;
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      // After max retries, try to clear cache and reload
      this.handleHardRefresh();
      return;
    }

    this.setState({ isRetrying: true });
    
    // Wait a bit before retrying with exponential backoff
    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
    
    this.setState(prevState => ({
      hasError: false,
      error: undefined,
      retryCount: prevState.retryCount + 1,
      isRetrying: false
    }));
  };

  handleHardRefresh = () => {
    // Clear service worker cache and reload
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          registration.unregister();
        });
      });
    }
    
    // Clear browser cache for this domain
    if ('caches' in window) {
      caches.keys().then(cacheNames => {
        cacheNames.forEach(cacheName => {
          if (cacheName.includes('chess-training')) {
            caches.delete(cacheName);
          }
        });
      });
    }
    
    // Reload the page
    window.location.reload();
  };

  isNetworkError = (error: Error): boolean => {
    return error.message.includes('Failed to fetch') ||
           error.message.includes('NetworkError') ||
           error.message.includes('dynamically imported module');
  };

  isOffline = (): boolean => {
    return !navigator.onLine;
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return (
        <FallbackComponent 
          error={this.state.error!} 
          retry={this.handleRetry}
          isRetrying={this.state.isRetrying}
          retryCount={this.state.retryCount}
          isNetworkError={this.isNetworkError(this.state.error!)}
          isOffline={this.isOffline()}
        />
      );
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ 
  error, 
  retry, 
  isRetrying, 
  retryCount, 
  isNetworkError, 
  isOffline 
}: { 
  error: Error; 
  retry: () => void; 
  isRetrying: boolean;
  retryCount: number;
  isNetworkError: boolean;
  isOffline: boolean;
}) {
  const maxRetries = 3;
  const isDynamicImportError = error.message.includes('dynamically imported module');
  
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {isOffline ? 'You\'re offline' : 'Something went wrong'}
          </h2>
          
          <p className="mb-4 text-gray-600">
            {isOffline 
              ? 'Please check your internet connection and try again.'
              : isDynamicImportError
                ? 'The app is having trouble loading some components. This is usually temporary.'
                : 'The app encountered an unexpected error. This might be a temporary issue.'
            }
          </p>

          {/* Show network status */}
          <div className="mb-4 flex items-center justify-center gap-2 text-sm">
            {isOffline ? (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-red-600">No internet connection</span>
              </>
            ) : (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600">Connected</span>
              </>
            )}
          </div>

          {/* Retry count indicator */}
          {retryCount > 0 && (
            <p className="mb-4 text-sm text-gray-500">
              Attempt {retryCount} of {maxRetries}
            </p>
          )}

          <details className="mb-4 text-left">
            <summary className="cursor-pointer text-sm text-gray-500">Error details</summary>
            <code className="mt-2 block rounded bg-red-50 p-2 text-xs text-red-600">
              {error.message}
            </code>
          </details>

          <div className="flex flex-col gap-2">
            <Button 
              onClick={retry} 
              disabled={isRetrying || isOffline}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
            
            {retryCount >= maxRetries && (
              <Button 
                onClick={() => window.location.reload()} 
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorBoundary;
