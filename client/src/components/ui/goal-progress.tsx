import React from 'react';
import { cn } from '@/lib/utils';
import type { GoalProgress } from '@/lib/daily-goals-progress';

export interface GoalProgressColors {
  bg: string;
  fill: string;
  text: string;
}

const DEFAULT_COLORS: GoalProgressColors = {
  bg: 'bg-gray-100',
  fill: 'bg-gray-500',
  text: 'text-gray-600',
};

interface GoalProgressBarProps {
  progress: GoalProgress;
  colors?: GoalProgressColors;
  className?: string;
}

export function GoalProgressBar({
  progress,
  colors = DEFAULT_COLORS,
  className,
}: GoalProgressBarProps) {
  const percentage =
    progress.target > 0
      ? Math.min(100, Math.round((progress.completed / progress.target) * 100))
      : 0;
  const isComplete = progress.isComplete;

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
          {progress.completed} {progress.unitLabel}
        </span>
        <span className={isComplete ? 'font-medium text-green-600' : ''}>{percentage}%</span>
        <span>
          {progress.target} {progress.unitLabel}
        </span>
      </div>
    </div>
  );
}

interface GoalProgressDisplayProps {
  progress: GoalProgress;
  label: string;
  colors?: GoalProgressColors;
  isManualMode?: boolean;
}

export function GoalProgressDisplay({
  progress,
  label,
  colors = DEFAULT_COLORS,
  isManualMode = false,
}: GoalProgressDisplayProps) {
  const isComplete = progress.isComplete;

  // In manual mode, show simple completion status
  if (isManualMode) {
    return (
      <span className={isComplete ? 'text-green-700 line-through' : 'text-gray-700'}>{label}</span>
    );
  }

  // In auto mode, show progress details
  const progressText = `${progress.completed}/${progress.target} ${progress.unitLabel}`;

  return (
    <div className="flex-1">
      <div className="mb-1 flex items-center justify-between">
        <span className={isComplete ? 'text-green-700' : 'text-gray-700'}>{label}</span>
        <span className={`text-xs font-medium ${isComplete ? 'text-green-600' : 'text-gray-500'}`}>
          {progressText}
        </span>
      </div>
      <GoalProgressBar progress={progress} colors={colors} className="mt-1" />
    </div>
  );
}
