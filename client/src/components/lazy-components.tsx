import { lazy } from 'react';

// Lazy load modal components for better performance
export const TacticsModal = lazy(() => import('@/components/modals/tactics-modal'));
export const GameModal = lazy(() => import('@/components/modals/game-modal'));
export const StudyModal = lazy(() => import('@/components/modals/study-modal'));
export const GoalModal = lazy(() => import('@/components/modals/goal-modal'));
// Temporarily disable lazy loading for CombinedGoalModal to debug
// export const CombinedGoalModal = lazy(() => import('@/components/modals/combined-goal-modal'));

// Lazy load heavy components to reduce initial bundle size
export const WeeklyActivityChart = lazy(() => import('@/components/weekly-activity-chart'));
export const DataManagement = lazy(() => import('@/components/data-management'));
export const AccountPage = lazy(() => import('@/pages/account'));
