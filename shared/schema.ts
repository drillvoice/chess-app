import { pgTable, text, serial, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

const isoDateOptional = z.preprocess((val) => {
  if (val === undefined || val === null || val === '') {
    return undefined;
  }
  if (val instanceof Date) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return val;
}, z.date().optional());

const buildOmit = <T extends ReadonlyArray<ReadonlyArray<string>>>(
  ...groups: T
): { [K in T[number][number]]: true } => {
  const acc: Partial<Record<T[number][number], true>> = {};
  groups.forEach((group) => {
    group.forEach((field) => {
      acc[field as T[number][number]] = true;
    });
  });
  return acc as { [K in T[number][number]]: true };
};

export const tacticsFields = [
  'pointsGained',
  'finalScore',
  'tacticsNotes',
  'puzzlesAttempted',
  'puzzlesCorrect',
] as const;
export const gameFields = [
  'gameResult',
  'gameType',
  'gameComments',
  'playerColor',
  'platform',
  'timeControl',
] as const;
export const studyFields = ['studyType', 'studyNotes'] as const;
export const goalFields = ['goalTitle', 'goalDescription'] as const;

export const trainingSessionsTable = pgTable('training_sessions', {
  id: serial('id').primaryKey(),
  type: text('type').notNull(), // 'tactics', 'game', 'study', 'goal'
  date: timestamp('date').notNull().defaultNow(),
  duration: integer('duration'), // in minutes
  // Tactics specific fields
  pointsGained: integer('points_gained'),
  finalScore: integer('final_score'),
  tacticsNotes: text('tactics_notes'),
  puzzlesAttempted: integer('puzzles_attempted'),
  puzzlesCorrect: integer('puzzles_correct'),
  // Game specific fields
  gameResult: text('game_result'), // 'win', 'loss', 'draw'
  gameType: text('game_type'), // 'blitz', 'rapid', 'classical', 'bullet'
  gameComments: text('game_comments'),
  playerColor: text('player_color'), // 'white', 'black'
  platform: text('platform'), // 'lichess', 'chess.com', 'otb'
  timeControl: text('time_control'), // 'bullet', 'blitz', 'rapid', 'classical'
  opponentUsername: text('opponent_username'), // opponent's username for games
  needsReview: boolean('needs_review').notNull().default(false),
  // Study specific fields
  studyType: text('study_type'), // Legacy field - kept for backward compatibility
  studyTags: text('study_tags'), // JSON array of custom tags, replaces studyType (nullable for non-study sessions)
  studyNotes: text('study_notes'),
  // Goal specific fields
  goalTitle: text('goal_title'),
  goalDescription: text('goal_description'),
  goalWeekStart: timestamp('goal_week_start'),
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable)
  .omit({
    id: true,
  })
  .extend({
    needsReview: z.boolean().optional(),
    date: isoDateOptional,
  });

export const tacticsSessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('tactics'),
    duration: z.number().min(1, 'Duration must be at least 1 minute'),
    pointsGained: z.preprocess(
      (val) => (val === '' || val === null || Number.isNaN(val) ? undefined : val),
      z.number().int('Points must be a whole number').optional(),
    ),
    finalScore: z.preprocess(
      (val) => (val === '' || val === null || Number.isNaN(val) ? undefined : val),
      z.number().min(0, 'Final score must be positive').optional(),
    ),
    tacticsNotes: z.string().optional(),
    puzzlesAttempted: z.preprocess(
      (val) => (val === '' || val === null || Number.isNaN(val) ? undefined : val),
      z
        .number()
        .int('Puzzles attempted must be a whole number')
        .min(0, 'Puzzles attempted cannot be negative')
        .optional(),
    ),
    puzzlesCorrect: z.preprocess(
      (val) => (val === '' || val === null || Number.isNaN(val) ? undefined : val),
      z
        .number()
        .int('Puzzles correct must be a whole number')
        .min(0, 'Puzzles correct cannot be negative')
        .optional(),
    ),
  })
  .omit(buildOmit(gameFields, studyFields, goalFields));

// Separate schema with cross-field validation for UI form usage
export const tacticsSessionValidationSchema = tacticsSessionSchema.superRefine((data, ctx) => {
  const attempted = (data as any).puzzlesAttempted as number | undefined;
  const correct = (data as any).puzzlesCorrect as number | undefined;
  if (typeof attempted === 'number' && typeof correct === 'number') {
    if (!(correct <= attempted)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Puzzles correct must be less than or equal to puzzles attempted',
        path: ['puzzlesCorrect'],
      });
    }
  }
});

export const gameSessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('game'),
    gameResult: z.enum(['win', 'loss', 'draw'], {
      required_error: 'Game result is required',
    }),
    gameComments: z.string().optional(),
    playerColor: z.enum(['white', 'black'], {
      required_error: 'Player colour is required',
    }),
    platform: z.enum(['lichess', 'chess.com', 'otb']).optional(),
    timeControl: z.enum(['bullet', 'blitz', 'rapid', 'classical']).optional(),
    opponentUsername: z.string().max(50, 'Opponent name cannot exceed 50 characters').optional(),
  })
  .omit(buildOmit(tacticsFields, studyFields, goalFields, ['gameType', 'duration'] as const));

// Study tag validation schema
export const studyTagSchema = z
  .string()
  .min(1, 'Tag cannot be empty')
  .max(25, 'Tag cannot exceed 25 characters')
  .refine((tag) => !/[<>&"']/.test(tag), 'Tag cannot contain special characters < > & " \'');

export const studySessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('study'),
    duration: z.number().min(1, 'Duration must be at least 1 minute'),
    studyTags: z
      .array(studyTagSchema)
      .max(10, 'Cannot select more than 10 tags')
      .optional()
      .default([]),
    studyNotes: z.string().optional(),
    // Keep studyType as optional for backward compatibility
    studyType: z
      .enum(['video', 'book', 'analysis', 'chessable', 'coaching', 'online-course'])
      .optional(),
  })
  .omit(buildOmit(tacticsFields, gameFields, goalFields));

export const goalSessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('goal'),
    goalTitle: z.string().min(1, 'Goal title is required'),
    goalDescription: z.string().optional(),
    goalWeekStart: isoDateOptional,
  })
  .omit(buildOmit(tacticsFields, gameFields, studyFields, ['duration'] as const));

// User Study Preferences Schema
export const userStudyPreferencesSchema = z.object({
  customTags: z
    .array(studyTagSchema)
    .max(10, 'Cannot have more than 10 custom tags')
    .default(['reading', 'videos', 'coaching']), // Default tags
  lastModified: isoDateOptional,
});

// Daily Goals Schema
export const dailyGoalSettingsSchema = z.object({
  tacticsMinutes: z.number().min(0).max(99).optional(),
  gamesCount: z.number().min(0).max(99).optional(),
  studyMinutes: z.number().min(0).max(99).optional(),
  isCustomized: z.boolean().default(false),
  autoTracking: z.boolean().default(false),
  lastModified: isoDateOptional,
});

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TacticsSession = z.infer<typeof tacticsSessionSchema>;
export type GameSession = z.infer<typeof gameSessionSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type GoalSession = z.infer<typeof goalSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
export type DailyGoalSettings = z.infer<typeof dailyGoalSettingsSchema>;
export type StudyTag = z.infer<typeof studyTagSchema>;
export type UserStudyPreferences = z.infer<typeof userStudyPreferencesSchema>;
