import { useQuery } from "@tanstack/react-query";

import { Clock, Play, Trophy, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import DataManagement from "@/components/data-management";
import WeeklyActivityChart from "@/components/weekly-activity-chart";
import { TrainingSession } from "@shared/schema";

interface Statistics {
  totalHours: number;
  totalSessions: number;
  tacticsRating: number;
  winRate: number;
  todayTotalTime: number;
  todaySessions: number;
}

interface WeeklyActivity {
  day: string;
  duration: number;
  sessions: number;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<Statistics>({
    queryKey: ["statistics"],
    queryFn: async () => {
      const { getStatistics } = await import("@/lib/firebase-utils");
      return await getStatistics();
    },
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: allSessions, isLoading: sessionsLoading } = useQuery<TrainingSession[]>({
    queryKey: ["sessions"],
    queryFn: async () => {
      const { getAllSessions } = await import("@/lib/firebase-utils");
      return await getAllSessions();
    },
    staleTime: 60000, // Cache for 1 minute
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  if (isLoading || sessionsLoading) {
    return (
      <div className="space-y-6">
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Training Statistics</h2>
        <p className="text-gray-600 text-sm">Your chess improvement overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-[#1E40AF]">
                  {stats?.totalHours || 0}
                </div>
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
                <div className="text-2xl font-bold text-[#059669]">
                  {stats?.totalSessions || 0}
                </div>
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
                <div className="text-2xl font-bold text-[#F59E0B]">
                  {stats?.tacticsRating || 0}
                </div>
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
                <div className="text-2xl font-bold text-green-600">
                  {stats?.winRate || 0}%
                </div>
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
          {allSessions && allSessions.length > 0 ? (
            <WeeklyActivityChart sessions={allSessions} />
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

      <DataManagement />
    </div>
  );
}
