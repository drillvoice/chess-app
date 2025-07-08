import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Puzzle, Crown, Book } from "lucide-react";
import TacticsModal from "@/components/modals/tactics-modal";
import GameModal from "@/components/modals/game-modal";
import StudyModal from "@/components/modals/study-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  const { data: stats, isLoading } = useQuery<Statistics>({
    queryKey: ["/api/statistics"],
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Log Your Training</h2>
        <p className="text-gray-600 text-sm">Track your chess improvement journey</p>
      </div>

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
      </div>

      <Card className="bg-gray-100 rounded-xl mt-6">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Today's Progress</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#1E40AF]">
                {isLoading ? "..." : `${stats?.todayTotalTime || 0}m`}
              </div>
              <div className="text-sm text-gray-600">Total Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#059669]">
                {isLoading ? "..." : stats?.todaySessions || 0}
              </div>
              <div className="text-sm text-gray-600">Sessions</div>
            </div>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
