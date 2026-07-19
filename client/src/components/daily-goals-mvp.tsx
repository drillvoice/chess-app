import React, { useState } from 'react';
import { CheckCircle, Circle, Puzzle, Crown, Book, Target, Settings, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDailyGoals } from '@/hooks/use-daily-goals';
import { GoalSettingsModal } from '@/components/modals/goal-settings-modal';
import { GoalProgressDisplay, type GoalProgressColors } from '@/components/ui/goal-progress';
import type { ResolvedGoal } from '@/lib/daily-goals-model';

interface DailyGoalsProps {
  onGoalComplete?: (goalId: string) => void;
  autoCompleteFromSessions?: boolean;
}

interface GoalAppearance {
  icon: typeof Puzzle;
  color: string;
  progressColors: GoalProgressColors;
}

const BUILTIN_APPEARANCE: Record<'tactics' | 'study' | 'game', GoalAppearance> = {
  tactics: {
    icon: Puzzle,
    color: 'text-blue-600',
    progressColors: { bg: 'bg-blue-100', fill: 'bg-blue-500', text: 'text-blue-600' },
  },
  study: {
    icon: Book,
    color: 'text-amber-600',
    progressColors: { bg: 'bg-amber-100', fill: 'bg-amber-500', text: 'text-amber-600' },
  },
  game: {
    icon: Crown,
    color: 'text-emerald-600',
    progressColors: { bg: 'bg-emerald-100', fill: 'bg-emerald-500', text: 'text-emerald-600' },
  },
};

// Tag goals cycle through a small palette by their position in the goal list
// so each custom goal gets a stable, distinct colour.
const TAG_PALETTE: Omit<GoalAppearance, 'icon'>[] = [
  {
    color: 'text-purple-600',
    progressColors: { bg: 'bg-purple-100', fill: 'bg-purple-500', text: 'text-purple-600' },
  },
  {
    color: 'text-rose-600',
    progressColors: { bg: 'bg-rose-100', fill: 'bg-rose-500', text: 'text-rose-600' },
  },
  {
    color: 'text-cyan-600',
    progressColors: { bg: 'bg-cyan-100', fill: 'bg-cyan-500', text: 'text-cyan-600' },
  },
  {
    color: 'text-orange-600',
    progressColors: { bg: 'bg-orange-100', fill: 'bg-orange-500', text: 'text-orange-600' },
  },
];

function goalAppearance(goal: ResolvedGoal, tagIndex: number): GoalAppearance {
  if (goal.kind !== 'tag') return BUILTIN_APPEARANCE[goal.kind];
  return { icon: Tag, ...TAG_PALETTE[tagIndex % TAG_PALETTE.length] };
}

export default function DailyGoalsMVP({
  onGoalComplete,
  autoCompleteFromSessions,
}: DailyGoalsProps) {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  const {
    goals,
    checklist,
    toggleItem,
    completedCount,
    allComplete,
    progressById,
    isAutoTrackingEnabled,
  } = useDailyGoals({
    autoCompleteFromSessions,
    onGoalComplete,
  });

  // Don't render the full card if there are no active goals
  if (goals.length === 0) {
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

  let tagIndex = -1;

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
                {completedCount}/{goals.length}
              </div>
              {isAutoTrackingEnabled && (
                <div className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">
                  Auto-tracking
                </div>
              )}
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
            {goals.map((goal) => {
              if (goal.kind === 'tag') tagIndex += 1;
              const appearance = goalAppearance(goal, tagIndex);
              const IconComponent = appearance.icon;
              const isCompleted = Boolean(checklist.items[goal.id]);
              const goalProgress = progressById?.get(goal.id);

              // Render differently based on auto-tracking mode
              if (isAutoTrackingEnabled && goalProgress) {
                // Auto-tracking mode: Show progress bar
                return (
                  <div key={goal.id} className="flex items-center space-x-3 rounded-lg p-2">
                    {goalProgress.isComplete ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                    <IconComponent className={`h-4 w-4 ${appearance.color}`} />
                    <GoalProgressDisplay
                      progress={goalProgress}
                      colors={appearance.progressColors}
                      label={goal.label}
                      isManualMode={false}
                    />
                  </div>
                );
              }

              // Manual mode: Show traditional checkboxes
              return (
                <div
                  key={goal.id}
                  className="flex cursor-pointer items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-white/50"
                  onClick={() => toggleItem(goal.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleItem(goal.id);
                    }
                  }}
                  aria-label={`${isCompleted ? 'Uncheck' : 'Check'} ${goal.label}`}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-400" />
                  )}
                  <IconComponent className={`h-4 w-4 ${appearance.color}`} />
                  <span
                    className={`flex-1 ${
                      isCompleted ? 'text-green-700 line-through' : 'text-gray-700'
                    }`}
                  >
                    {goal.label}
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
