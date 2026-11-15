import { useEffect, useState } from 'react';
import {
  getLichessConnection,
  subscribeLichessConnection,
  type LichessConnection,
} from '@/lib/lichess-auth';

/** The connected Lichess account on this device, kept in sync across tabs. */
export function useLichessConnection(): LichessConnection | null {
  const [connection, setConnection] = useState(getLichessConnection);
  useEffect(() => subscribeLichessConnection(() => setConnection(getLichessConnection())), []);
  return connection;
}
