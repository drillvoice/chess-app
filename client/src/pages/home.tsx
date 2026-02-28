import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, Suspense, useEffect } from 'react';
import { Puzzle, Crown, Book, Target, Archive, X } from 'lucide-react';
import { TacticsModal, GameModal, StudyModal, GoalModal } from '@/components/lazy-components';
import DailyGoalsMVP from '@/components/daily-goals-mvp';
import InstallPrompt from '@/components/install-prompt';
import CloudBackupReminder from '@/components/cloud-backup-reminder';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TrainingSession } from '@shared/schema';
import { formatSessionDate, getGoalProperties } from '@/lib/utils';

interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

export default function Home() {
  const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';
  const [tacticsModalOpen, setTacticsModalOpen] = useState(false);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | undefined>(undefined);
  const [weeklyGoalPromptDismissed, setWeeklyGoalPromptDismissed] = useState(false);

  const { data: stats, isLoading } = useQuery<Statistics>({
    queryKey: ['statistics'],
    queryFn: async () => {
      const { getStatistics } = await import('@/lib/firebase');
      return await getStatistics();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    refetchOnWindowFocus: false, // Don't refetch on focus to avoid conflicts
  });

  const { data: weeklyGoal } = useQuery<TrainingSession | undefined>({
    queryKey: ['weekly-goal'],
    queryFn: async () => {
      const { getCurrentWeeklyGoal } = await import('@/lib/firebase');
      return await getCurrentWeeklyGoal();
    },
    staleTime: 300000, // Cache for 5 minutes (goals don't change often)
    refetchInterval: 300000,
    refetchOnWindowFocus: true,
  });

  const { data: pendingSessions } = useQuery<TrainingSession[]>({
    queryKey: ['pending-review'],
    queryFn: async () => {
      const { getSessionsNeedingReview } = await import('@/lib/firebase');
      return await getSessionsNeedingReview();
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
  });

  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      console.log('Archive mutation called for session:', sessionId);
      const { updateSession } = await import('@/lib/firebase');
      const result = await updateSession(sessionId, { needsReview: false });
      console.log('Archive mutation result:', result);
      return result;
    },
    onMutate: async (sessionId) => {
      console.log('Archive mutation onMutate for session:', sessionId);
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['pending-review'] });

      // Snapshot the previous value
      const previousPendingSessions = queryClient.getQueryData<TrainingSession[]>([
        'pending-review',
      ]);
      console.log('Previous pending sessions:', previousPendingSessions);

      // Optimistically update to new value
      queryClient.setQueryData<TrainingSession[]>(['pending-review'], (old = []) => {
        const filtered = old.filter((session) => session.id !== sessionId);
        console.log('Optimistically filtered sessions:', filtered);
        return filtered;
      });

      // Return a context object with the snapshotted value
      return { previousPendingSessions };
    },
    onError: (err, sessionId, context) => {
      console.error('Archive mutation error:', err);
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousPendingSessions) {
        queryClient.setQueryData(['pending-review'], context.previousPendingSessions);
      }
    },
    onSuccess: (data, sessionId) => {
      console.log('Archive mutation success for session:', sessionId, 'data:', data);
      // Don't invalidate queries here as it might refetch old data before background sync completes
      // The optimistic update should be sufficient for immediate UI feedback
    },
  });

  const goalProperties = weeklyGoal ? getGoalProperties(weeklyGoal) : null;
  const isGoalOld = goalProperties?.goalWeekStart
    ? new Date().getTime() - goalProperties.goalWeekStart.getTime() > 7 * 24 * 60 * 60 * 1000
    : false;

  // Load dismissal state from localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem('weeklyGoalPromptDismissed');
    if (dismissed === 'true') {
      setWeeklyGoalPromptDismissed(true);
    }
  }, []);

  const handleDismissWeeklyGoalPrompt = () => {
    setWeeklyGoalPromptDismissed(true);
    localStorage.setItem('weeklyGoalPromptDismissed', 'true');
  };

  return (
    <div className="page-stack">
      <InstallPrompt />
      <CloudBackupReminder />

      <div className="py-3 text-center md:py-4">
        <h2 className="mb-2 text-2xl font-bold text-gray-800 md:text-3xl">Log your training</h2>
        <p className="text-sm text-gray-600">Track your chess improvement journey</p>
      </div>

      <div className="tablet-grid items-start">
        <div className="tablet-side order-1 space-y-4 md:order-2 md:space-y-6">
          {weeklyGoal ? (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start space-x-3">
                  <Target className="mt-0.5 h-5 w-5 text-purple-600" />
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-gray-800">
                      {isGoalOld ? "Last week's goal" : 'Your goal for this week is:'}
                    </h3>
                    <p className="font-medium text-gray-700">
                      {goalProperties?.goalTitle || 'No title'}
                    </p>
                    {goalProperties?.goalDescription && (
                      <p className="mt-1 text-sm text-gray-600">{goalProperties.goalDescription}</p>
                    )}
                    {isGoalOld && (
                      <div className="mt-2">
                        <Button
                          onClick={() => setGoalModalOpen(true)}
                          size="sm"
                          className="bg-purple-600 text-white hover:bg-purple-700"
                        >
                          Set New Goal
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : !weeklyGoalPromptDismissed ? (
            <Card className="relative border-dashed border-purple-200 bg-purple-50">
              <CardContent className="p-4 md:p-5">
                <button
                  onClick={handleDismissWeeklyGoalPrompt}
                  className="absolute right-2 top-2 rounded-full p-1 transition-colors hover:bg-purple-100"
                  aria-label="Dismiss weekly goal prompt"
                >
                  <X className="h-4 w-4 text-purple-600" />
                </button>
                <div className="flex items-start space-x-3">
                  <Target className="mt-0.5 h-5 w-5 text-purple-600" />
                  <div className="flex-1">
                    <h3 className="mb-1 font-semibold text-gray-800">
                      Set a weekly goal to focus your training
                    </h3>
                    <p className="text-sm text-gray-600">
                      Having a specific goal helps you stay motivated and track progress
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row md:flex-col">
                      <Button
                        onClick={() => setGoalModalOpen(true)}
                        size="sm"
                        className="bg-purple-600 text-white hover:bg-purple-700"
                      >
                        Set Weekly Goal
                      </Button>
                      <Button
                        onClick={handleDismissWeeklyGoalPrompt}
                        size="sm"
                        variant="ghost"
                        className="text-purple-600 hover:bg-purple-100"
                      >
                        Maybe later
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-xl bg-gray-100">
            <CardContent className="p-4 md:p-5">
              <h3 className="mb-3 text-lg font-semibold text-gray-800">Today's progress</h3>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#1E40AF]">
                      {`${stats?.todayTotalTime || 0}m`}
                    </div>
                    <div className="text-sm text-gray-600">Total time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-[#059669]">
                      {stats?.todaySessions || 0}
                    </div>
                    <div className="text-sm text-gray-600">Sessions</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-gray-200">
            <CardContent className="p-4 md:p-5">
              <h3 className="mb-3 text-lg font-semibold text-gray-800">Overall progress</h3>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-center">
                    <div className="text-xl font-bold text-[#1E40AF]">{stats?.totalHours || 0}</div>
                    <div className="text-xs text-gray-600">Hours logged</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-center">
                    <div className="text-xl font-bold text-[#059669]">
                      {stats?.totalSessions || 0}
                    </div>
                    <div className="text-xs text-gray-600">Sessions</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="tablet-main order-2 space-y-4 md:order-1 md:space-y-6">
          <DailyGoalsMVP />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Button
              onClick={() => setTacticsModalOpen(true)}
              className="h-auto min-h-11 w-full transform rounded-xl bg-[#1E40AF] px-6 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-800 active:scale-95"
            >
              <div className="flex items-center justify-center space-x-3">
                <Puzzle className="h-8 w-8" />
                <div className="text-left">
                  <div className="text-base md:text-lg">Log tactics</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => setGameModalOpen(true)}
              className="h-auto min-h-11 w-full transform rounded-xl bg-[#059669] px-6 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-emerald-700 active:scale-95"
            >
              <div className="flex items-center justify-center space-x-3">
                <Crown className="h-8 w-8" />
                <div className="text-left">
                  <div className="text-base md:text-lg">Log game</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => setStudyModalOpen(true)}
              className="h-auto min-h-11 w-full transform rounded-xl bg-[#F59E0B] px-6 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-amber-600 active:scale-95"
            >
              <div className="flex items-center justify-center space-x-3">
                <Book className="h-8 w-8" />
                <div className="text-left">
                  <div className="text-base md:text-lg">Other study</div>
                </div>
              </div>
            </Button>

            <Button
              onClick={() => setGoalModalOpen(true)}
              className="h-auto min-h-11 w-full transform rounded-xl bg-purple-600 px-6 py-4 font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-purple-700 active:scale-95"
            >
              <div className="flex items-center justify-center space-x-3">
                <Target className="h-8 w-8" />
                <div className="text-left">
                  <div className="text-base md:text-lg">Set weekly goal</div>
                </div>
              </div>
            </Button>
          </div>

          {pendingSessions && pendingSessions.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="space-y-2 p-4 md:p-5">
                <h3 className="font-semibold text-gray-800">Games needing review</h3>
                {pendingSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <span className="text-gray-700">{formatSessionDate(session.date)}</span>
                      {session.type === 'game' && (
                        <span className="font-mono text-xs text-gray-500">
                          {session.gameResult === 'draw'
                            ? '1/2-1/2'
                            : session.gameResult === 'win'
                              ? session.playerColor === 'white'
                                ? '1-0'
                                : '0-1'
                              : session.playerColor === 'white'
                                ? '0-1'
                                : '1-0'}
                        </span>
                      )}
                      {session.opponentUsername && (
                        <span className="text-xs text-gray-500">vs {session.opponentUsername}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditingSession(session);
                          setGameModalOpen(true);
                        }}
                      >
                        Review
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => archiveMutation.mutate(session.id)}
                        aria-label="Archive game"
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Suspense fallback={<div />}>
        <TacticsModal open={tacticsModalOpen} onOpenChange={setTacticsModalOpen} />
        <GameModal
          open={gameModalOpen}
          onOpenChange={setGameModalOpen}
          editingSession={editingSession}
          isEditMode={!!editingSession}
          onClearEditingSession={() => setEditingSession(undefined)}
        />
        <StudyModal open={studyModalOpen} onOpenChange={setStudyModalOpen} />
        <GoalModal open={goalModalOpen} onOpenChange={setGoalModalOpen} />
      </Suspense>

      {/* Version Control Note */}
      <div className="mt-8 border-t border-gray-200 pt-4 text-center">
        <p className="text-xs text-gray-500">Pawn Star Chess Log v{appVersion}</p>
      </div>
    </div>
  );
}
