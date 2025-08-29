import { useNetworkStatus } from '@/hooks/use-mobile';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NetworkStatusProps {
  className?: string;
  showDetails?: boolean;
}

export function NetworkStatus({ className, showDetails = false }: NetworkStatusProps) {
  const { isOnline, connectionType } = useNetworkStatus();

  if (isOnline && !showDetails) {
    return null; // Don't show anything when online unless details are requested
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
        isOnline
          ? 'border border-green-200 bg-green-50 text-green-700'
          : 'border border-red-200 bg-red-50 text-red-700',
        className,
      )}
    >
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4" />
          <span>Connected</span>
          {showDetails && connectionType && (
            <span className="text-xs opacity-75">({connectionType})</span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Offline</span>
          {showDetails && <span className="text-xs opacity-75">Check your connection</span>}
        </>
      )}
    </div>
  );
}

export function NetworkWarning() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-50 duration-300 animate-in slide-in-from-top-2">
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700 shadow-lg">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">You're offline</span>
      </div>
    </div>
  );
}
