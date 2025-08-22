import { lazy } from 'react';
import { dynamicImportWithRetry } from '@/lib/utils';

// Helper function to create lazy components with retry logic
function createLazyComponent<T extends { default: React.ComponentType<any> }>(importFn: () => Promise<T>) {
  return lazy(() => dynamicImportWithRetry(importFn));
}

// Lazy load modal components for better performance
export const TacticsModal = createLazyComponent(() => import('@/components/modals/tactics-modal'));
export const GameModal = createLazyComponent(() => import('@/components/modals/game-modal'));
export const StudyModal = createLazyComponent(() => import('@/components/modals/study-modal'));
export const GoalModal = createLazyComponent(() => import('@/components/modals/goal-modal'));

// Lazy load heavy components to reduce initial bundle size
export const WeeklyActivityChart = createLazyComponent(() => import('@/components/weekly-activity-chart'));
export const DataManagement = createLazyComponent(() => import('@/components/data-management'));
export const AccountPage = createLazyComponent(() => import('@/pages/account'));
