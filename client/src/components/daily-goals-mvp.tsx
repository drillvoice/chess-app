import React, { useMemo, useState } from 'react';
import { CheckCircle, Circle, Puzzle, Crown, Book, Target, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDailyGoals } from '@/hooks/use-daily-goals';
import { useDailyGoalsSettings } from '@/hooks/use-daily-goals-settings';
import { GoalSettingsModal } from '@/components/modals/goal-settings-modal';

interface DailyGoalsProps {
  // Future props for integration with training sessions
  onGoalComplete?: (goalType: 'tactics' | 'study' | 'game') => void;
  autoCompleteFromSessions?: boolean;
}

const GOAL_TYPES = ['tactics', 'study', 'game'] as const;

export default function DailyGoalsMVP({
  onGoalComplete,
  autoCompleteFromSessions,
}: DailyGoalsProps) {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const { checklist, toggleItem, completedCount, allComplete } = useDailyGoals({
    autoCompleteFromSessions,
    onGoalComplete,
  });

  const { settings, isCustomized } = useDailyGoalsSettings();

  // Generate dynamic goal configuration based on custom settings
  const goalConfig = useMemo(() => {
    const baseConfig = {
      tactics: {
        icon: Puzzle,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-300',
      },
      game: {
        icon: Crown,
        color: 'text-emerald-600',
        bgColor: 'bg-emerald-50',
        borderColor: 'border-emerald-300',
      },
      study: {
        icon: Book,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-300',
      },
    };

    // If user has customized goals, use their values
    if (isCustomized && settings) {
      return {
        tactics: {
          ...baseConfig.tactics,
          label:
            (settings.tacticsMinutes || 0) > 0
              ? `Practice tactics for ${settings.tacticsMinutes || 0} minutes`
              : null, // Will be filtered out
        },
        game: {
          ...baseConfig.game,
          label:
            (settings.gamesCount || 0) > 0
              ? `Play ${settings.gamesCount || 0} game${(settings.gamesCount || 0) !== 1 ? 's' : ''}`
              : null, // Will be filtered out
        },
        study: {
          ...baseConfig.study,
          label:
            (settings.studyMinutes || 0) > 0
              ? `Study for ${settings.studyMinutes || 0} minutes`
              : null, // Will be filtered out
        },
      };
    }

    // Default goals (simple format)
    return {
      tactics: {
        ...baseConfig.tactics,
        label: 'Practice tactics',
      },
      game: {
        ...baseConfig.game,
        label: 'Play a game',
      },
      study: {
        ...baseConfig.study,
        label: 'Study chess',
      },
    };
  }, [isCustomized, settings]);

  // Check if there are any active goals to show
  const activeGoals = Object.values(goalConfig).filter((config) => config.label !== null);
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

  return (
    <>
      <Card
        className={`${
          allComplete ? 'border-green-300 bg-green-50' : 'border-blue-300 bg-blue-50'
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
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-600">
                {completedCount}/{activeGoals.length}
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

          <div className="space-y-2">
            {GOAL_TYPES.map((goalType) => {
              const config = goalConfig[goalType];

              // Skip goals that are set to 0 (null label)
              if (config.label === null) {
                return null;
              }

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

      {/* Goal Settings Modal */}
      <GoalSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </>
  );
}
