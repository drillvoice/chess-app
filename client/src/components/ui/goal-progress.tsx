import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { DailyGoalProgress } from '@/lib/daily-goals-progress';

interface GoalProgressBarProps {
  progress: DailyGoalProgress[keyof DailyGoalProgress];
  goalType: keyof DailyGoalProgress;
  className?: string;
}

export function GoalProgressBar({ progress, goalType, className }: GoalProgressBarProps) {
  const percentage = Math.min(100, Math.round((progress.completed / progress.target) * 100));
  const isComplete = progress.isComplete;

  // Color mapping for different goal types
  const colorMap = {
    tactics: {
      bg: 'bg-blue-100',
      fill: 'bg-blue-500',
      text: 'text-blue-600',
    },
    study: {
      bg: 'bg-amber-100',
      fill: 'bg-amber-500',
      text: 'text-amber-600',
    },
    game: {
      bg: 'bg-emerald-100',
      fill: 'bg-emerald-500',
      text: 'text-emerald-600',
    },
  };

  const colors = colorMap[goalType];

  return (
    <div className={cn('space-y-1', className)}>
      {/* Progress bar */}
      <div className={`relative h-2 w-full overflow-hidden rounded-full ${colors.bg}`}>
        <div
          className={`h-full transition-all duration-300 ease-out ${colors.fill} ${
            isComplete ? 'bg-green-500' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Progress text */}
      <div className={`flex justify-between text-xs ${colors.text}`}>
        <span>
          {progress.completed}
          {progress.unit === 'minutes' ? 'min' : progress.unit === 'count' ? ' games' : ''}
        </span>
        <span className={isComplete ? 'font-medium text-green-600' : ''}>{percentage}%</span>
        <span>
          {progress.target}
          {progress.unit === 'minutes' ? 'min' : progress.unit === 'count' ? ' games' : ''}
        </span>
      </div>
    </div>
  );
}

interface GoalProgressDisplayProps {
  progress: DailyGoalProgress[keyof DailyGoalProgress];
  goalType: keyof DailyGoalProgress;
  label: string;
  isManualMode?: boolean;
}

export function GoalProgressDisplay({
  progress,
  goalType,
  label,
  isManualMode = false,
}: GoalProgressDisplayProps) {
  const isComplete = progress.isComplete;
  const percentage = Math.min(100, Math.round((progress.completed / progress.target) * 100));

  // In manual mode, show simple completion status
  if (isManualMode) {
    return (
      <span className={isComplete ? 'text-green-700 line-through' : 'text-gray-700'}>{label}</span>
    );
  }

  // In auto mode, show progress details
  const progressText = `${progress.completed}/${progress.target} ${
    progress.unit === 'minutes' ? 'min' : progress.unit === 'count' ? 'games' : ''
  }`;

  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className={isComplete ? 'text-green-700' : 'text-gray-700'}>{label}</span>
        <span className={`text-xs font-medium ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
          {progressText}
        </span>
      </div>
      <GoalProgressBar progress={progress} goalType={goalType} className="mt-1" />
    </div>
  );
}
