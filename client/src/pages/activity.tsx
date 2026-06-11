import { useState, Suspense, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { normalizeStudyTagKey, type TrainingSession } from '@shared/schema';
import { useStudyPreferences } from '@/hooks/use-study-preferences';
import {
  TacticsModal,
  GameModal,
  StudyModal,
  GoalModal,
  WeeklyActivityChart,
} from '@/components/lazy-components';
import { SessionCard } from '@/components/activity/session-card';
import { SessionFilterBar } from '@/components/activity/session-filter-bar';
import { groupSessionsByDate } from '@/components/activity/session-display';

export { groupSessionsByDate };

interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

export default function Activity() {
  const [filter, setFilter] = useState<string>('all');
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { preferences: studyPreferences } = useStudyPreferences();
  const studyUnitLabelByTag = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(studyPreferences?.tagConfigs ?? {}).map(([key, config]) => [
          normalizeStudyTagKey(key),
          config.unitLabel,
        ]),
      ) as Record<string, string>,
    [studyPreferences?.tagConfigs],
  );

  // Listen for fresh data notifications from service worker
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FRESH_SESSIONS_AVAILABLE') {
        // Refetch sessions when service worker has fresh data
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [queryClient]);

  const { data: stats, isLoading: statsLoading } = useQuery<Statistics>({
    queryKey: ['statistics'],
    queryFn: async () => {
      const { getStatistics } = await import('@/lib/firebase');
      return await getStatistics();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { getAllSessions } = await import('@/lib/firebase');
      return await getAllSessions();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus to avoid conflicts
    refetchOnMount: false, // Don't refetch on mount if we have cached data
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const { deleteSession } = await import('@/lib/firebase');
      return await deleteSession(sessionId);
    },
    onMutate: async (sessionId: number) => {
      await queryClient.cancelQueries({ queryKey: ['sessions'] });
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(['sessions']);
      queryClient.setQueryData<TrainingSession[]>(
        ['sessions'],
        (old) => old?.filter((session) => session.id !== sessionId) ?? [],
      );
      return { previousSessions };
    },
    onSuccess: (result) => {
      if (result) {
        toast({
          title: 'Success',
          description: 'Session deleted successfully',
        });
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['weekly-activity'] });
      }
    },
    onError: (error: any, _sessionId, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(['sessions'], context.previousSessions);
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete session',
        variant: 'destructive',
      });
    },
  });

  const filteredSessions = useMemo(
    () => sessions?.filter((session) => filter === 'all' || session.type === filter) || [],
    [sessions, filter],
  );

  const {
    todaySessions,
    yesterdaySessions,
    last7DaysSessions,
    last30DaysSessions,
    earlierSessions,
  } = useMemo(() => groupSessionsByDate(filteredSessions), [filteredSessions]);

  const handleEdit = useCallback((session: TrainingSession) => setEditingSession(session), []);

  const handleDelete = useCallback(
    (sessionId: number) => deleteSessionMutation.mutate(sessionId),
    [deleteSessionMutation],
  );

  const renderSessionGroup = (value: string, title: string, groupSessions: TrainingSession[]) =>
    groupSessions.length > 0 && (
      <AccordionItem value={value} className="border-none">
        <AccordionTrigger className="border-b border-gray-200 pb-2 text-lg font-semibold text-gray-800 hover:no-underline">
          {title} ({groupSessions.length})
        </AccordionTrigger>
        <AccordionContent className="pt-3">
          <div className="space-y-2">
            {groupSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                studyUnitLabelByTag={studyUnitLabelByTag}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );

  if (statsLoading || sessionsLoading) {
    return (
      <div className="page-stack">
        <div className="py-2 text-center">
          <h2 className="mb-1 text-2xl font-bold text-gray-800">Training statistics</h2>
        </div>
        <div className="tablet-grid items-start">
          <div className="tablet-main">
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <div className="tablet-side">
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        <div className="py-2 text-center">
          <h2 className="mb-1 text-2xl font-bold text-gray-800">Training history</h2>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="py-2 text-center">
        <h2 className="mb-1 text-2xl font-bold text-gray-800">Training statistics</h2>
      </div>

      <div className="tablet-grid items-start">
        <div className="tablet-main order-2 md:order-1">
          <Card className="border-gray-200">
            <CardContent className="p-4 md:p-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-800">This week's activity</h3>
              {sessions && sessions.length > 0 ? (
                <Suspense fallback={<div className="h-32 animate-pulse rounded bg-gray-100"></div>}>
                  <WeeklyActivityChart sessions={sessions} />
                </Suspense>
              ) : (
                <div className="flex h-32 items-center justify-center text-gray-500">
                  <div className="text-center">
                    <div className="text-sm">No activity this week</div>
                    <div className="mt-1 text-xs">Start logging sessions to see your progress</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="tablet-side order-1 md:order-2">
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Card className="border-blue-100 bg-blue-50">
              <CardContent className="p-3 md:p-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#1E40AF]">{stats?.totalHours || 0}</div>
                  <div className="text-xs text-gray-600">Total hours</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-100 bg-emerald-50">
              <CardContent className="p-3 md:p-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#059669]">
                    {stats?.totalSessions || 0}
                  </div>
                  <div className="text-xs text-gray-600">Sessions</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-100 bg-amber-50">
              <CardContent className="p-3 md:p-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-[#F59E0B]">
                    {stats?.tacticsRating || 0}
                  </div>
                  <div className="text-xs text-gray-600">Tactics rating</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-100 bg-green-50">
              <CardContent className="p-3 md:p-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-green-600">{stats?.winRate || 0}%</div>
                  <div className="text-xs text-gray-600">Win rate</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="py-2 text-center">
        <h2 className="mb-1 text-2xl font-bold text-gray-800">Training history</h2>
      </div>

      <SessionFilterBar filter={filter} onFilterChange={setFilter} />

      <div className="space-y-3 md:space-y-4">
        {filteredSessions.length === 0 ? (
          <Card className="border-gray-200">
            <CardContent className="p-6 text-center">
              <div className="text-gray-500">No training sessions found</div>
              <p className="mt-2 text-sm text-gray-400">
                Start logging your training sessions to see them here
              </p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" defaultValue={['today']} className="space-y-3">
            {renderSessionGroup('today', 'Today', todaySessions)}
            {renderSessionGroup('yesterday', 'Yesterday', yesterdaySessions)}
            {renderSessionGroup('last7', 'Last 7 days', last7DaysSessions)}
            {renderSessionGroup('last30', 'Last 30 days', last30DaysSessions)}
            {renderSessionGroup('earlier', 'Earlier', earlierSessions)}
          </Accordion>
        )}
      </div>

      {/* Edit Modals */}
      {editingSession && (
        <Suspense fallback={<div>Loading...</div>}>
          {editingSession.type === 'tactics' && (
            <TacticsModal
              open={true}
              onOpenChange={(open: boolean) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'game' && (
            <GameModal
              open={true}
              onOpenChange={(open: boolean) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'study' && (
            <StudyModal
              open={true}
              onOpenChange={(open: boolean) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'goal' && (
            <GoalModal
              open={true}
              onOpenChange={(open: boolean) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
