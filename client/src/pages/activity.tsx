import { useState, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Puzzle,
  Crown,
  Book,
  Clock,
  Target,
  Trash2,
  Edit3,
  Play,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { TrainingSession } from "@shared/schema";
import {
  TacticsModal,
  GameModal,
  StudyModal,
  GoalModal,
  WeeklyActivityChart,
} from "@/components/lazy-components";

interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

export default function Activity() {
  const [filter, setFilter] = useState<string>("all");
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<Statistics>({
    queryKey: ["statistics"],
    queryFn: async () => {
      const { getStatistics } = await import("@/lib/firebase-utils");
      return await getStatistics();
    },
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { getAllSessions } = await import("@/lib/firebase-utils");
      return await getAllSessions();
    },
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });


  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const { deleteSession } = await import("@/lib/firebase-utils");
      return await deleteSession(sessionId);
    },
    onMutate: async (sessionId: number) => {
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      const previousSessions = queryClient.getQueryData<TrainingSession[]>(["sessions"]);
      queryClient.setQueryData<TrainingSession[]>(["sessions"], (old) =>
        old?.filter((session) => session.id !== sessionId) ?? []
      );
      return { previousSessions };
    },
    onSuccess: (result) => {
      if (result) {
        toast({
          title: "Success",
          description: "Session deleted successfully",
        });
        queryClient.invalidateQueries({ queryKey: ["sessions"] });
        queryClient.invalidateQueries({ queryKey: ["statistics"] });
        queryClient.invalidateQueries({ queryKey: ["weekly-activity"] });
      }
    },
    onError: (error: any, _sessionId, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(["sessions"], context.previousSessions);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to delete session",
        variant: "destructive",
      });
    },
  });

  const filteredSessions = sessions?.filter(session => 
    filter === "all" || session.type === filter
  ) || [];

  // Group sessions by date category
  const groupSessionsByDate = (sessions: TrainingSession[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todaySessions: TrainingSession[] = [];
    const yesterdaySessions: TrainingSession[] = [];
    const earlierSessions: TrainingSession[] = [];

    sessions.forEach(session => {
      const sessionDate = new Date(session.date);
      const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      
      if (sessionDay.getTime() === today.getTime()) {
        todaySessions.push(session);
      } else if (sessionDay.getTime() === yesterday.getTime()) {
        yesterdaySessions.push(session);
      } else {
        earlierSessions.push(session);
      }
    });

    return { todaySessions, yesterdaySessions, earlierSessions };
  };

  const { todaySessions, yesterdaySessions, earlierSessions } = groupSessionsByDate(filteredSessions);

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    
    // Reset time to get accurate day comparison
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    
    const diffTime = today.getTime() - sessionDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  const getSessionIcon = (type: string) => {
    switch (type) {
      case "tactics":
        return <Puzzle className="w-5 h-5 text-[#1E40AF]" />;
      case "game":
        return <Crown className="w-5 h-5 text-[#059669]" />;
      case "study":
        return <Book className="w-5 h-5 text-[#F59E0B]" />;
      case "goal":
        return <Target className="w-5 h-5 text-purple-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSessionBgColor = (type: string) => {
    switch (type) {
      case "tactics":
        return "bg-blue-100";
      case "game":
        return "bg-emerald-100";
      case "study":
        return "bg-amber-100";
      case "goal":
        return "bg-purple-100";
      default:
        return "bg-gray-100";
    }
  };

  const getSessionTitle = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return "Tactics Practice";
      case "game":
        return "Chess Game";
      case "study":
        return `${session.studyType?.charAt(0).toUpperCase()}${session.studyType?.slice(1)} Study`;
      case "goal":
        return session.goalTitle || "Weekly Goal";
      default:
        return "Training Session";
    }
  };

  const getSessionSubtitle = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return session.pointsGained != null
          ? `${session.pointsGained > 0 ? '+' : ''}${session.pointsGained} points • ${session.duration} min`
          : `${session.duration} min`;
      case "game":
        return `${session.gameResult?.charAt(0).toUpperCase()}${session.gameResult?.slice(1)} as ${session.playerColor} • ${session.platform}${session.timeControl ? ` ${session.timeControl}` : ''}`;
      case "study":
        return session.studyNotes
          ? `${session.studyNotes} • ${session.duration} min`
          : `${session.duration} min`;
      case "goal":
        return session.goalDescription || "Weekly focus area";
      default:
        return "";
    }
  };

  const getSessionValue = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return session.finalScore?.toString() || "";
      case "game":
        return session.gameResult === "win" ? "W" : session.gameResult === "draw" ? "D" : "L";
      case "study":
        return session.studyType?.charAt(0).toUpperCase() || "";
      case "goal":
        return "🎯";
      default:
        return "";
    }
  };

  const getSessionValueColor = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return "text-gray-800";
      case "game":
        return session.gameResult === "win" ? "text-green-600" : session.gameResult === "draw" ? "text-gray-600" : "text-red-600";
      case "study":
        return "text-gray-800";
      case "goal":
        return "text-purple-600";
      default:
        return "text-gray-800";
    }
  };

  if (statsLoading || sessionsLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="text-center py-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Training Statistics</h2>
          <p className="text-gray-600 text-sm">Your chess improvement overview</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />

        <div className="text-center py-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Training History</h2>
          <p className="text-gray-600 text-sm">Your recent training sessions</p>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Training Statistics</h2>
        <p className="text-gray-600 text-sm">Your chess improvement overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[#1E40AF]">{stats?.totalHours || 0}</div>
                <div className="text-sm text-gray-600">Total Hours</div>
              </div>
              <Clock className="w-5 h-5 text-[#1E40AF]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[#059669]">{stats?.totalSessions || 0}</div>
                <div className="text-sm text-gray-600">Sessions</div>
              </div>
              <Play className="w-5 h-5 text-[#059669]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[#F59E0B]">{stats?.tacticsRating || 0}</div>
                <div className="text-sm text-gray-600">Tactics Rating</div>
              </div>
              <Trophy className="w-5 h-5 text-[#F59E0B]" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">{stats?.winRate || 0}%</div>
                <div className="text-sm text-gray-600">Win Rate</div>
              </div>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">This Week's Activity</h3>
          {sessions && sessions.length > 0 ? (
            <Suspense fallback={<div className="h-32 animate-pulse bg-gray-100 rounded"></div>}>
              <WeeklyActivityChart sessions={sessions} />
            </Suspense>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-sm">No activity this week</div>
                <div className="text-xs mt-1">Start logging sessions to see your progress</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Training History</h2>
        <p className="text-gray-600 text-sm">Your recent training sessions</p>
      </div>

      <div className="flex space-x-2 mb-4">
        <Button
          variant={filter === "all" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("all")}
          className={cn(
            filter === "all" 
              ? "bg-[#1E40AF] text-white" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          )}
        >
          All
        </Button>
        <Button
          variant={filter === "tactics" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("tactics")}
          className={cn(
            filter === "tactics" 
              ? "bg-[#1E40AF] text-white" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          )}
        >
          Tactics
        </Button>
        <Button
          variant={filter === "game" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("game")}
          className={cn(
            filter === "game" 
              ? "bg-[#1E40AF] text-white" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          )}
        >
          Games
        </Button>
        <Button
          variant={filter === "study" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("study")}
          className={cn(
            filter === "study" 
              ? "bg-[#1E40AF] text-white" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          )}
        >
          Study
        </Button>
        <Button
          variant={filter === "goal" ? "default" : "secondary"}
          size="sm"
          onClick={() => setFilter("goal")}
          className={cn(
            filter === "goal" 
              ? "bg-[#1E40AF] text-white" 
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          )}
        >
          Goals
        </Button>
      </div>

      <div className="space-y-4 md:space-y-6">
        {filteredSessions.length === 0 ? (
          <Card className="border-gray-200">
            <CardContent className="p-8 text-center">
              <div className="text-gray-500">No training sessions found</div>
              <p className="text-sm text-gray-400 mt-2">
                Start logging your training sessions to see them here
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Today Section */}
            {todaySessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">Today</h3>
                {todaySessions.map((session) => (
                  <Card key={session.id} className="border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            getSessionBgColor(session.type)
                          )}>
                            {getSessionIcon(session.type)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800">
                              {getSessionTitle(session)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {getSessionSubtitle(session)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className={cn(
                              "text-sm font-medium",
                              getSessionValueColor(session)
                            )}>
                              {getSessionValue(session)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(session.date)}
                            </div>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                              onClick={() => setEditingSession(session)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Session</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this {session.type} session? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSessionMutation.mutate(session.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Yesterday Section */}
            {yesterdaySessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">Yesterday</h3>
                {yesterdaySessions.map((session) => (
                  <Card key={session.id} className="border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            getSessionBgColor(session.type)
                          )}>
                            {getSessionIcon(session.type)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800">
                              {getSessionTitle(session)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {getSessionSubtitle(session)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className={cn(
                              "text-sm font-medium",
                              getSessionValueColor(session)
                            )}>
                              {getSessionValue(session)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(session.date)}
                            </div>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                              onClick={() => setEditingSession(session)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Session</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this {session.type} session? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSessionMutation.mutate(session.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Earlier Section */}
            {earlierSessions.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2">Earlier</h3>
                {earlierSessions.map((session) => (
                  <Card key={session.id} className="border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            getSessionBgColor(session.type)
                          )}>
                            {getSessionIcon(session.type)}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800">
                              {getSessionTitle(session)}
                            </div>
                            <div className="text-sm text-gray-600">
                              {getSessionSubtitle(session)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className={cn(
                              "text-sm font-medium",
                              getSessionValueColor(session)
                            )}>
                              {getSessionValue(session)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatDate(session.date)}
                            </div>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                              onClick={() => setEditingSession(session)}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Session</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this {session.type} session? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSessionMutation.mutate(session.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Edit Modals */}
      {editingSession && (
        <Suspense fallback={<div>Loading...</div>}>
          {editingSession.type === 'tactics' && (
            <TacticsModal
              open={true}
              onOpenChange={(open) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'game' && (
            <GameModal
              open={true}
              onOpenChange={(open) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'study' && (
            <StudyModal
              open={true}
              onOpenChange={(open) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
          {editingSession.type === 'goal' && (
            <GoalModal
              open={true}
              onOpenChange={(open) => !open && setEditingSession(null)}
              editingSession={editingSession}
              isEditMode={true}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
