import { pgTable, text, serial, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { isoDateOptional, studyTagSchema } from './settings-schema';

export * from './settings-schema';

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
  'mistakeTags',
  'playerColor',
  'platform',
  'timeControl',
  'openingName',
  'openingEco',
] as const;
export const studyFields = [
  'studyType',
  'studyTags',
  'studyNotes',
  'quantity',
  'primaryStudyTag',
] as const;
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
  mistakeTags: text('mistake_tags'), // JSON array of user-defined mistake tags (e.g. "hung a piece")
  playerColor: text('player_color'), // 'white', 'black'
  platform: text('platform'), // 'lichess', 'chess.com', 'otb'
  timeControl: text('time_control'), // 'bullet', 'blitz', 'rapid', 'classical'
  opponentUsername: text('opponent_username'), // opponent's username for games
  openingName: text('opening_name'), // e.g. "French Defense"
  openingEco: text('opening_eco'), // e.g. "C00"
  needsReview: boolean('needs_review').notNull().default(false),
  // Study specific fields
  studyType: text('study_type'), // Legacy field - kept for backward compatibility
  studyTags: text('study_tags'), // JSON array of custom tags, replaces studyType (nullable for non-study sessions)
  studyNotes: text('study_notes'),
  quantity: integer('quantity'), // Optional study quantity for configured units
  primaryStudyTag: text('primary_study_tag'), // Selected tag that quantity applies to
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
    // Recorded on every game (not just losses) so mistake frequency can later be
    // sliced by gameResult — e.g. "which mistakes show up mostly in my losses?".
    mistakeTags: z
      .array(studyTagSchema)
      .max(10, 'Cannot select more than 10 mistake tags')
      .optional()
      .default([]),
    playerColor: z.enum(['white', 'black'], {
      required_error: 'Player colour is required',
    }),
    platform: z.enum(['lichess', 'chess.com', 'otb']).optional(),
    timeControl: z.enum(['bullet', 'blitz', 'rapid', 'classical']).optional(),
    opponentUsername: z.string().max(50, 'Opponent name cannot exceed 50 characters').optional(),
    openingName: z.string().optional(),
    openingEco: z.string().optional(),
  })
  .omit(buildOmit(tacticsFields, studyFields, goalFields, ['gameType', 'duration'] as const));

export const studySessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('study'),
    duration: z.number().min(0.01, 'Duration must be greater than 0'),
    studyTags: z
      .array(studyTagSchema)
      .max(10, 'Cannot select more than 10 tags')
      .optional()
      .default([]),
    quantity: z.preprocess(
      (val) => (val === '' || val === null || Number.isNaN(val) ? undefined : val),
      z
        .number()
        .int('Quantity must be a whole number')
        .min(1, 'Quantity must be at least 1')
        .optional(),
    ),
    primaryStudyTag: studyTagSchema.optional(),
    studyNotes: z.string().optional(),
    // Keep studyType as optional for backward compatibility
    studyType: z
      .enum(['video', 'book', 'analysis', 'chessable', 'coaching', 'online-course'])
      .optional(),
  })
  .omit(buildOmit(tacticsFields, gameFields, goalFields))
  .superRefine((data, ctx) => {
    if (data.quantity !== undefined && !data.primaryStudyTag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Primary study tag is required when quantity is set',
        path: ['primaryStudyTag'],
      });
    }

    if (data.primaryStudyTag && !data.studyTags?.includes(data.primaryStudyTag)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Primary study tag must be selected in study tags',
        path: ['primaryStudyTag'],
      });
    }
  });

export const goalSessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('goal'),
    goalTitle: z.string().min(1, 'Goal title is required'),
    goalDescription: z.string().optional(),
    goalWeekStart: isoDateOptional,
  })
  .omit(buildOmit(tacticsFields, gameFields, studyFields, ['duration'] as const));

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
/**
 * A session as the app hands it to the storage layer. The persisted schema
 * declares the tag-list fields as JSON strings, but callers (the modals, the
 * importers) still hold them as arrays at this point — createSession /
 * updateSession serialize them on the way in.
 */
export type SessionInput = Omit<InsertTrainingSession, 'studyTags' | 'mistakeTags'> & {
  studyTags?: string[] | string | null;
  mistakeTags?: string[] | string | null;
};
export type TacticsSession = z.infer<typeof tacticsSessionSchema>;
export type GameSession = z.infer<typeof gameSessionSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type GoalSession = z.infer<typeof goalSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
