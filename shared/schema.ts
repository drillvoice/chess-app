import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'tactics', 'game', 'study', 'goal'
  date: timestamp("date").notNull().defaultNow(),
  duration: integer("duration"), // in minutes
  // Tactics specific fields
  pointsGained: integer("points_gained"),
  finalScore: integer("final_score"),
  tacticsNotes: text("tactics_notes"),
  // Game specific fields
  gameResult: text("game_result"), // 'win', 'loss'
  gameType: text("game_type"), // 'blitz', 'rapid', 'classical', 'bullet'
  gameComments: text("game_comments"),
  playerColor: text("player_color"), // 'white', 'black'
  platform: text("platform"), // 'lichess', 'chess.com', 'otb'
  timeControl: text("time_control"), // '5+3', '10+5', '10', '15+10'
  // Study specific fields
  studyType: text("study_type"), // 'video', 'book', 'analysis', 'opening', 'endgame'
  studyNotes: text("study_notes"),
  // Goal specific fields
  goalTitle: text("goal_title"),
  goalDescription: text("goal_description"),
  goalWeekStart: timestamp("goal_week_start"),
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable).omit({
  id: true,
  date: true,
});

export const tacticsSessionSchema = insertTrainingSessionSchema.extend({
  type: z.literal('tactics'),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
  pointsGained: z.number().int("Points must be a whole number"),
  finalScore: z.number().min(0, "Final score must be positive"),
  tacticsNotes: z.string().optional(),
}).omit({
  gameResult: true,
  gameType: true,
  gameComments: true,
  playerColor: true,
  platform: true,
  timeControl: true,
  studyType: true,
  studyNotes: true,
  goalTitle: true,
  goalDescription: true,
});

export const gameSessionSchema = insertTrainingSessionSchema.extend({
  type: z.literal('game'),
  gameResult: z.enum(['win', 'loss'], {
    required_error: "Game result is required",
  }),
  gameComments: z.string().optional(),
  playerColor: z.enum(['white', 'black'], {
    required_error: "Player colour is required",
  }),
  platform: z.enum(['lichess', 'chess.com', 'otb'], {
    required_error: "Platform is required",
  }),
  timeControl: z.enum(['5+3', '10+5', '10', '15+10']).optional(),
}).omit({
  duration: true,
  pointsGained: true,
  finalScore: true,
  tacticsNotes: true,
  gameType: true,
  studyType: true,
  studyNotes: true,
  goalTitle: true,
  goalDescription: true,
});

export const studySessionSchema = insertTrainingSessionSchema.extend({
  type: z.literal('study'),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
  studyType: z.enum(['video', 'book', 'analysis', 'opening', 'endgame'], {
    required_error: "Study type is required",
  }),
  studyNotes: z.string().optional(),
}).omit({
  pointsGained: true,
  finalScore: true,
  tacticsNotes: true,
  gameResult: true,
  gameType: true,
  gameComments: true,
  playerColor: true,
  platform: true,
  timeControl: true,
  goalTitle: true,
  goalDescription: true,
});

export const goalSessionSchema = insertTrainingSessionSchema.extend({
  type: z.literal('goal'),
  goalTitle: z.string().min(1, "Goal title is required"),
  goalDescription: z.string().optional(),
  goalWeekStart: z.date().optional(),
}).omit({
  duration: true,
  pointsGained: true,
  finalScore: true,
  tacticsNotes: true,
  gameResult: true,
  gameType: true,
  gameComments: true,
  playerColor: true,
  platform: true,
  timeControl: true,
  studyType: true,
  studyNotes: true,
});

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TacticsSession = z.infer<typeof tacticsSessionSchema>;
export type GameSession = z.infer<typeof gameSessionSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type GoalSession = z.infer<typeof goalSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
