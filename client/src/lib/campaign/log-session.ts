import { queryClient } from '../queryClient';

type Toast = (options: {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}) => unknown;

/**
 * Log campaign play as a tactics session so it shows in Activity and counts
 * toward goals. A failure is reported to the user but doesn't undo the campaign
 * result, which is already saved.
 */
export async function logCampaignSession(
  entry: { startedAt: string; durationMs: number; attempted: number; clean: number; notes: string },
  toast: Toast,
): Promise<void> {
  try {
    const { createSession } = await import('../firebase');
    await createSession({
      type: 'tactics',
      date: new Date(entry.startedAt),
      duration: Math.max(1, Math.round(entry.durationMs / 60000)),
      puzzlesAttempted: entry.attempted,
      puzzlesCorrect: entry.clean,
      tacticsNotes: entry.notes,
    });
    ['sessions', 'statistics', 'weekly-goal', 'weekly-activity'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    );
  } catch (error) {
    console.error('[campaign] Result saved but tactics session not logged', { entry, error });
    toast({
      title: 'Saved, but not logged as a tactics session',
      description: error instanceof Error ? error.message : String(error),
      variant: 'destructive',
    });
  }
}
