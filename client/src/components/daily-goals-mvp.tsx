import React, { useMemo } from 'react';
import { CheckCircle, Circle, Puzzle, Crown, Book, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useDailyGoals } from '@/hooks/use-daily-goals';

interface DailyGoalsProps {
  // Future props for integration with training sessions
  onGoalComplete?: (goalType: 'tactics' | 'study' | 'game') => void;
  autoCompleteFromSessions?: boolean;
}

const GOAL_TYPES = ['tactics', 'study', 'game'] as const;
type GoalType = typeof GOAL_TYPES[number];

export default function DailyGoalsMVP({ onGoalComplete, autoCompleteFromSessions }: DailyGoalsProps) {
  const { checklist, toggleItem, completedCount, allComplete } = useDailyGoals({
    autoCompleteFromSessions,
    onGoalComplete,
  });

  const goalConfig = useMemo(() => ({
    tactics: {
      icon: Puzzle,
      label: 'Practice tactics',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
    },
    game: {
      icon: Crown,
      label: 'Play a game',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-300',
    },
    study: {
      icon: Book,
      label: 'Study chess',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
    },
  }), []);

  return (
    <Card
      className={`${
        allComplete 
          ? 'border-green-300 bg-green-50' 
          : 'border-blue-300 bg-blue-50'
      } transition-colors duration-300`}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Target className={`h-5 w-5 ${allComplete ? 'text-green-600' : 'text-blue-600'}`} />
            <h3 className="font-semibold text-gray-800">
              {allComplete ? '🎉 Daily goals complete!' : "Today's training goals"}
            </h3>
          </div>
          <div className="text-sm text-gray-600">{completedCount}/3</div>
        </div>

        <div className="space-y-2">
          {GOAL_TYPES.map((goalType) => {
            const config = goalConfig[goalType];
            const IconComponent = config.icon;
            const isCompleted = checklist[goalType];

            return (
              <div
                key={goalType}
                className="flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-white/50"
                onClick={() => toggleItem(goalType)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleItem(goalType);
                  }
                }}
                aria-label={`${isCompleted ? 'Uncheck' : 'Check'} ${config.label}`}
              >
                {isCompleted ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-gray-400" />
                )}
                <IconComponent className={`h-4 w-4 ${config.color}`} />
                <span
                  className={`flex-1 ${
                    isCompleted ? 'text-green-700 line-through' : 'text-gray-700'
                  }`}
                >
                  {config.label}
                </span>
              </div>
            );
          })}
        </div>

        {allComplete && (
          <div className="mt-3 border-t border-green-200 pt-2">
            <p className="text-center text-sm font-medium text-green-700">
              Great job! You've hit all your training goals today! 🏆
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
