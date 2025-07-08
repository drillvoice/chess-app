import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Puzzle, Crown, Book, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TrainingSession } from "@shared/schema";

export default function History() {
  const [filter, setFilter] = useState<string>("all");

  const { data: sessions, isLoading } = useQuery<TrainingSession[]>({
    queryKey: ["/api/training-sessions"],
    refetchInterval: 30000,
  });

  const filteredSessions = sessions?.filter(session => 
    filter === "all" || session.type === filter
  ) || [];

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - d.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return "Today";
    if (diffDays === 2) return "Yesterday";
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
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
      default:
        return "bg-gray-100";
    }
  };

  const getSessionTitle = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return "Tactics Practice";
      case "game":
        return `${session.gameType?.charAt(0).toUpperCase()}${session.gameType?.slice(1)} Game`;
      case "study":
        return `${session.studyType?.charAt(0).toUpperCase()}${session.studyType?.slice(1)} Study`;
      default:
        return "Training Session";
    }
  };

  const getSessionSubtitle = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return `${session.pointsGained > 0 ? '+' : ''}${session.pointsGained} points • ${session.duration} min`;
      case "game":
        return `${session.gameResult?.charAt(0).toUpperCase()}${session.gameResult?.slice(1)} • ${session.gameComments || 'No comments'}`;
      case "study":
        return `${session.studyNotes || 'No notes'} • ${session.duration} min`;
      default:
        return "";
    }
  };

  const getSessionValue = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return session.finalScore?.toString() || "";
      case "game":
        return session.gameResult === "win" ? "W" : "L";
      case "study":
        return session.studyType?.charAt(0).toUpperCase() || "";
      default:
        return "";
    }
  };

  const getSessionValueColor = (session: TrainingSession) => {
    switch (session.type) {
      case "tactics":
        return "text-gray-800";
      case "game":
        return session.gameResult === "win" ? "text-green-600" : "text-red-600";
      case "study":
        return "text-gray-800";
      default:
        return "text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-4">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Training History</h2>
          <p className="text-gray-600 text-sm">Your recent training sessions</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
      </div>

      <div className="space-y-3">
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
          filteredSessions.map((session) => (
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
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
