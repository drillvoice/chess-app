import { useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLichessConnection } from '@/hooks/use-lichess-connection';
import {
  connectWithPersonalToken,
  disconnectLichess,
  PERSONAL_TOKEN_URL,
  startLichessLogin,
} from '@/lib/lichess-auth';

interface LichessAccountConnectProps {
  /** Where to land after approving on Lichess. */
  returnPath: string;
  compact?: boolean;
}

export default function LichessAccountConnect({ returnPath, compact }: LichessAccountConnectProps) {
  const connection = useLichessConnection();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, context: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      console.error(`[Lichess auth] ${context} failed`, err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (connection) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span>
          Connected to Lichess as <strong>{connection.username}</strong>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await disconnectLichess();
              toast({ title: 'Disconnected from Lichess' });
            }, 'Disconnect')
          }
        >
          <LogOut className="mr-1 h-3.5 w-3.5" /> Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {!compact && (
        <p className="text-gray-600">
          Connect your Lichess account so Focus practice only serves puzzles you haven&apos;t seen,
          pitches difficulty to your puzzle rating, and records results on Lichess.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run(() => startLichessLogin(returnPath), 'Connect')}
        >
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Connect Lichess account
        </Button>
        <button
          type="button"
          className="text-xs text-gray-500 underline"
          onClick={() => setShowToken((v) => !v)}
        >
          Use a personal token instead
        </button>
      </div>
      {showToken && (
        <div className="space-y-2 rounded-md bg-gray-50 p-3">
          <p className="text-xs text-gray-600">
            If the sign-in redirect doesn&apos;t come back to the app (some installed-app setups),{' '}
            <a
              href={PERSONAL_TOKEN_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-700 underline"
            >
              create a token on Lichess <ExternalLink className="h-3 w-3" />
            </a>{' '}
            and paste it here. It stays on this device.
          </p>
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder="lip_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-label="Lichess personal token"
            />
            <Button
              size="sm"
              disabled={busy || !token.trim()}
              onClick={() =>
                run(async () => {
                  const c = await connectWithPersonalToken(token);
                  setToken('');
                  setShowToken(false);
                  toast({ title: `Connected to Lichess as ${c.username}` });
                }, 'Personal token connect')
              }
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
