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
export const studyFields = ['studyType', 'studyTags', 'studyNotes', 'quantity', 'primaryStudyTag'] as const;
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

export const normalizeStudyTagKey = (tag: string): string => tag.trim().toLowerCase();

const studyUnitLabelSchema = z
  .string()
  .trim()
  .min(1, 'Unit label cannot be empty')
  .max(20, 'Unit label cannot exceed 20 characters')
  .refine(
    (label) => !/[<>&"']/.test(label),
    'Unit label cannot contain special characters < > & " \'',
  );

export const studyTagConfigSchema = z.object({
  unitLabel: studyUnitLabelSchema,
});

const studyTagConfigsSchema = z
  .record(studyTagConfigSchema)
  .default({})
  .refine(
    (configs) =>
      Object.keys(configs).every(
        (key) => key === normalizeStudyTagKey(key) && !!key && key.length <= 25,
      ),
    'Tag config keys must use normalized lowercase tag values',
  );

export const studySessionSchema = insertTrainingSessionSchema
  .extend({
    type: z.literal('study'),
    duration: z.number().min(1, 'Duration must be at least 1 minute'),
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

// User Study Preferences Schema
export const userStudyPreferencesSchema = z.object({
  customTags: z
    .array(studyTagSchema)
    .max(10, 'Cannot have more than 10 custom tags')
    .default(['reading', 'videos', 'coaching']), // Default tags
  tagConfigs: studyTagConfigsSchema,
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
export type StudyTagConfig = z.infer<typeof studyTagConfigSchema>;
export type UserStudyPreferences = z.infer<typeof userStudyPreferencesSchema>;
