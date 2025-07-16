import { useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Puzzle, Crown, Book, Target } from "lucide-react";
import { TacticsModal, GameModal, StudyModal, GoalModal } from "@/components/lazy-components";
import InstallPrompt from "@/components/install-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrainingSession } from "@shared/schema";

interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

export default function Home() {
  const [tacticsModalOpen, setTacticsModalOpen] = useState(false);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const { data: stats, isLoading } = useQuery<Statistics>({
    queryKey: ["statistics"],
    queryFn: async () => {
      const { getStatistics } = await import("@/lib/firebase-utils");
      return await getStatistics();
    },
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const { data: weeklyGoal } = useQuery<TrainingSession | null>({
    queryKey: ["weekly-goal"],
    queryFn: async () => {
      const { getCurrentWeeklyGoal } = await import("@/lib/firebase-utils");
      return await getCurrentWeeklyGoal();
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const isGoalOld = weeklyGoal && weeklyGoal.goalWeekStart ? 
    (new Date().getTime() - new Date(weeklyGoal.goalWeekStart).getTime()) > (7 * 24 * 60 * 60 * 1000) : false;

  return (
    <div className="space-y-6">
      <InstallPrompt />
      
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Log Your Training</h2>
        <p className="text-gray-600 text-sm">Track your chess improvement journey</p>
      </div>

      {weeklyGoal ? (
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Target className="w-5 h-5 text-purple-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 mb-1">
                  {isGoalOld ? "Last week's goal" : "Your goal for this week is:"}
                </h3>
                <p className="text-gray-700 font-medium">{weeklyGoal.goalTitle}</p>
                {weeklyGoal.goalDescription && (
                  <p className="text-gray-600 text-sm mt-1">{weeklyGoal.goalDescription}</p>
                )}
                {isGoalOld && (
                  <div className="mt-2">
                    <Button
                      onClick={() => setGoalModalOpen(true)}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      Set New Goal
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-purple-50 border-purple-200 border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <Target className="w-5 h-5 text-purple-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-800 mb-1">
                  Set a weekly goal to focus your training
                </h3>
                <p className="text-gray-600 text-sm">
                  Having a specific goal helps you stay motivated and track progress
                </p>
              </div>
              <Button
                onClick={() => setGoalModalOpen(true)}
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Set Goal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <Button
          onClick={() => setTacticsModalOpen(true)}
          className="w-full bg-[#1E40AF] hover:bg-blue-800 text-white font-semibold py-6 px-6 rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 h-auto"
        >
          <div className="flex items-center justify-center space-x-3">
            <Puzzle className="w-6 h-6" />
            <div className="text-left">
              <div className="text-lg">Log Tactics</div>
              <div className="text-sm opacity-90">Practice & Score</div>
            </div>
          </div>
        </Button>

        <Button
          onClick={() => setGameModalOpen(true)}
          className="w-full bg-[#059669] hover:bg-emerald-700 text-white font-semibold py-6 px-6 rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 h-auto"
        >
          <div className="flex items-center justify-center space-x-3">
            <Crown className="w-6 h-6" />
            <div className="text-left">
              <div className="text-lg">Log Game</div>
              <div className="text-sm opacity-90">Win/Loss & Notes</div>
            </div>
          </div>
        </Button>

        <Button
          onClick={() => setStudyModalOpen(true)}
          className="w-full bg-[#F59E0B] hover:bg-amber-600 text-white font-semibold py-6 px-6 rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 h-auto"
        >
          <div className="flex items-center justify-center space-x-3">
            <Book className="w-6 h-6" />
            <div className="text-left">
              <div className="text-lg">Log Study</div>
              <div className="text-sm opacity-90">Videos & Analysis</div>
            </div>
          </div>
        </Button>

        <Button
          onClick={() => setGoalModalOpen(true)}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 px-6 rounded-xl shadow-lg transform transition-all duration-200 hover:scale-105 active:scale-95 h-auto"
        >
          <div className="flex items-center justify-center space-x-3">
            <Target className="w-6 h-6" />
            <div className="text-left">
              <div className="text-lg">Set Weekly Goal</div>
              <div className="text-sm opacity-90">Focus Area</div>
            </div>
          </div>
        </Button>
      </div>

      <Card className="bg-gray-100 rounded-xl mt-6">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Today's Progress</h3>
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
                <div className="text-sm text-gray-600">Total Time</div>
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

      <Suspense fallback={<div />}>
        <TacticsModal 
          open={tacticsModalOpen} 
          onOpenChange={setTacticsModalOpen}
        />
        <GameModal 
          open={gameModalOpen} 
          onOpenChange={setGameModalOpen}
        />
        <StudyModal 
          open={studyModalOpen} 
          onOpenChange={setStudyModalOpen}
        />
        <GoalModal 
          open={goalModalOpen} 
          onOpenChange={setGoalModalOpen}
        />
      </Suspense>
      
      {/* Version Control Note */}
      <div className="text-center mt-8 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Chess Training Logger v1.1.0 - July 16, 2025
        </p>
      </div>
    </div>
  );
}
