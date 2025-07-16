import { lazy } from 'react';

// Lazy load modal components for better performance
export const TacticsModal = lazy(() => import('@/components/modals/tactics-modal'));
export const GameModal = lazy(() => import('@/components/modals/game-modal'));
export const StudyModal = lazy(() => import('@/components/modals/study-modal'));
export const GoalModal = lazy(() => import('@/components/modals/goal-modal'));