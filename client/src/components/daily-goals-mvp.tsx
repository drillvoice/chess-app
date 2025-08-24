import React, { useMemo, useState } from 'react';
import { CheckCircle, Circle, Puzzle, Crown, Book, Target, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDailyGoals } from '@/hooks/use-daily-goals';
import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { GoalSettingsModal } from '@/components/modals/goal-settings-modal';

interface DailyGoalsProps {
  // Future props for integration with training sessions
  onGoalComplete?: (goalType: 'tactics' | 'study' | 'game') => void;
  autoCompleteFromSessions?: boolean;
}

const GOAL_TYPES = ['tactics', 'study', 'game'] as const;

export default function DailyGoalsMVP({ onGoalComplete, autoCompleteFromSessions }: DailyGoalsProps) {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const { checklist, toggleItem, completedCount, allComplete } = useDailyGoals({
    autoCompleteFromSessions,
    onGoalComplete,
  });

  const { settings, isCustomized, progress, isProgressLoading } = useDailyGoalsSettings();

  // Generate dynamic goal configuration based on custom settings
  const goalConfig = useMemo(() => {
    const baseConfig = {
      tactics: {
        icon: Puzzle,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300',
        progressColor: 'bg-blue-600',
      },
      game: {
        icon: Crown,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-300',
        progressColor: 'bg-emerald-600',
      },
      study: {
        icon: Book,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-300',
        progressColor: 'bg-amber-600',
      },
    };

    // If user has customized goals, use their values
    if (isCustomized && settings) {
      return {
        tactics: {
          ...baseConfig.tactics,
          label: (settings.tacticsMinutes || 0) > 0 
            ? `Practice tactics for ${settings.tacticsMinutes || 0} minutes`
            : null, // Will be filtered out
          target: settings.tacticsMinutes || 0,
        },
        game: {
          ...baseConfig.game,
          label: (settings.gamesCount || 0) > 0 
            ? `Play ${settings.gamesCount || 0} game${(settings.gamesCount || 0) !== 1 ? 's' : ''}`
            : null, // Will be filtered out
          target: settings.gamesCount || 0,
        },
        study: {
          ...baseConfig.study,
          label: (settings.studyMinutes || 0) > 0 
            ? `Study for ${settings.studyMinutes || 0} minutes`
            : null, // Will be filtered out
          target: settings.studyMinutes || 0,
        },
      };
    }

    // Default goals (simple format) - these will be hidden when no custom goals
    return {
      tactics: {
        ...baseConfig.tactics,
        label: 'Practice tactics',
        target: 0,
      },
      game: {
        ...baseConfig.game,
        label: 'Play a game',
        target: 0,
      },
      study: {
        ...baseConfig.study,
        label: 'Study chess',
        target: 0,
      },
    };
  }, [isCustomized, settings]);

  // Check if there are any active goals to show
  const activeGoals = Object.values(goalConfig).filter(config => config.label !== null && config.target > 0);
  const hasActiveGoals = activeGoals.length > 0;

  // Don't render the component if there are no active goals
  if (!hasActiveGoals) {
    return (
      <>
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-gray-400" />
                <h3 className="font-semibold text-gray-600">No active training goals</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-8 w-8 p-0 hover:bg-gray-100"
                aria-label="Customize daily goals"
              >
                <Settings className="h-4 w-4 text-gray-500" />
              </Button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Click the settings icon to set up your daily training goals.
            </p>
          </CardContent>
        </Card>

        <GoalSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      </>
    );
  }

  // Calculate overall completion status
  const overallProgress = progress.totalGoals > 0 ? (progress.totalCompleted / progress.totalGoals) * 100 : 0;
  const allGoalsComplete = progress.totalCompleted === progress.totalGoals && progress.totalGoals > 0;

  return (
    <>
      <Card
        className={`${
          allGoalsComplete 
            ? 'border-green-300 bg-green-50' 
            : 'border-blue-300 bg-blue-50'
        } transition-colors duration-300`}
      >
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className={`h-5 w-5 ${allGoalsComplete ? 'text-green-600' : 'text-blue-600'}`} />
              <h3 className="font-semibold text-gray-800">
                {allGoalsComplete ? '🎉 Daily goals complete!' : "Today's training goals"}
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-600">
                {progress.totalCompleted}/{progress.totalGoals}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-8 w-8 p-0 hover:bg-gray-100"
                aria-label="Customize daily goals"
              >
                <Settings className="h-4 w-4 text-gray-500" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {GOAL_TYPES.map((goalType) => {
              const config = goalConfig[goalType];
              
              // Skip goals that are set to 0 (null label or target)
              if (config.label === null || config.target === 0) {
                return null;
              }
              
              const IconComponent = config.icon;
              const goalProgress = progress[goalType === 'game' ? 'games' : goalType];
              const isCompleted = goalProgress.isComplete;
              const currentValue = goalProgress.current;
              const targetValue = goalProgress.target;

              return (
                <div
                  key={goalType}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <IconComponent className={`h-4 w-4 ${config.color}`} />
                      <span className="text-sm font-medium text-gray-700">
                        {config.label}
                      </span>
                      {isCompleted && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {currentValue}/{targetValue}
                    </div>
                  </div>
                  
                  <Progress 
                    value={goalProgress.percentage} 
                    className="h-2"
                  />
                  
                  {isCompleted && (
                    <p className="text-xs text-green-600 font-medium">
                      Goal completed! 🎉
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {allGoalsComplete && (
            <div className="mt-3 border-t border-green-200 pt-2">
              <p className="text-center text-sm font-medium text-green-700">
                Great job! You've hit all your training goals today! 🏆
              </p>
            </div>
          )}

          {isProgressLoading && (
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-500">Updating progress...</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Settings Modal */}
      <GoalSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </>
  );
}
