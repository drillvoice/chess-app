import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { completeLichessLogin } from '@/lib/lichess-auth';

/** Lichess redirects here after the user approves (or declines) access. */
export default function LichessCallbackPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The code is single-use; guard against StrictMode's double effect.
    if (started.current) return;
    started.current = true;
    completeLichessLogin(window.location.search)
      .then(({ returnPath, connection }) => {
        toast({ title: `Connected to Lichess as ${connection.username}` });
        navigate(returnPath, { replace: true });
      })
      .catch((err) => {
        console.error('[Lichess auth] Callback failed', err);
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [navigate, toast]);

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="space-y-3 p-6 text-center">
        {error ? (
          <>
            <p className="font-semibold text-red-600">Couldn&apos;t connect Lichess</p>
            <p className="text-sm text-gray-700">{error}</p>
            <Link href="/focus" className="text-sm text-blue-700 underline">
              Back to Focus practice
            </Link>
          </>
        ) : (
          <p className="flex items-center justify-center gap-2 text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Connecting your Lichess account…
          </p>
        )}
      </CardContent>
    </Card>
  );
}
