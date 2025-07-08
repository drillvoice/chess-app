import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const trainingSessionsTable = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'tactics', 'game', 'study'
  date: timestamp("date").notNull().defaultNow(),
  duration: integer("duration"), // in minutes
  // Tactics specific fields
  pointsGained: integer("points_gained"),
  finalScore: integer("final_score"),
  // Game specific fields
  gameResult: text("game_result"), // 'win', 'loss'
  gameType: text("game_type"), // 'blitz', 'rapid', 'classical', 'bullet'
  gameComments: text("game_comments"),
  // Study specific fields
  studyType: text("study_type"), // 'video', 'book', 'analysis', 'opening', 'endgame'
  studyNotes: text("study_notes"),
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
}).omit({
  gameResult: true,
  gameType: true,
  gameComments: true,
  studyType: true,
  studyNotes: true,
});

export const gameSessionSchema = insertTrainingSessionSchema.extend({
  type: z.literal('game'),
  gameResult: z.enum(['win', 'loss'], {
    required_error: "Game result is required",
  }),
  gameType: z.enum(['blitz', 'rapid', 'classical', 'bullet'], {
    required_error: "Game type is required",
  }),
  gameComments: z.string().optional(),
}).omit({
  duration: true,
  pointsGained: true,
  finalScore: true,
  studyType: true,
  studyNotes: true,
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
  gameResult: true,
  gameType: true,
  gameComments: true,
});

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TacticsSession = z.infer<typeof tacticsSessionSchema>;
export type GameSession = z.infer<typeof gameSessionSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
