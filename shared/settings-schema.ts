import { z } from 'zod';

// Zod-only schemas and helpers with no drizzle dependency. Split out of schema.ts so code on
// the app's startup path (storage, sync, goals) can use them without pulling drizzle-orm and
// drizzle-zod into the main bundle. schema.ts re-exports everything here.

export const isoDateOptional = z.preprocess((val) => {
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

// Tag validation. Despite the `study` prefix (kept for backward compatibility with
// existing imports) this is the generic tag-string rule, shared by study tags and
// game mistake tags.
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
  minutesPerUnit: z
    .number()
    .positive('Minutes per unit must be greater than 0')
    .max(999, 'Minutes per unit cannot exceed 999')
    .optional(),
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

// Vocabulary size caps, shared with the sync merge and the storage-seam healer so
// they cannot drift from the schema and silently reject a preferences document.
export const MAX_CUSTOM_STUDY_TAGS = 10;
export const MAX_CUSTOM_MISTAKE_TAGS = 20;

// User Study Preferences Schema
export const userStudyPreferencesSchema = z.object({
  customTags: z
    .array(studyTagSchema)
    .max(MAX_CUSTOM_STUDY_TAGS, `Cannot have more than ${MAX_CUSTOM_STUDY_TAGS} custom tags`)
    .default(['reading', 'videos', 'coaching']), // Default tags
  tagConfigs: studyTagConfigsSchema,
  // The user's mistake-tag vocabulary for game sessions. Starts empty — unlike
  // customTags there is no seeded list, the user builds their own vocabulary.
  // Additive: docs written by older clients simply lack the field and `.default([])`
  // fills it in on read, the same pattern as `tagGoals` on dailyGoalSettingsSchema.
  customMistakeTags: z
    .array(studyTagSchema)
    .max(MAX_CUSTOM_MISTAKE_TAGS, `Cannot have more than ${MAX_CUSTOM_MISTAKE_TAGS} mistake tags`)
    .default([]),
  lastModified: isoDateOptional,
});

// Daily Goals Schema
// A custom daily goal tied to an "Other study" tag. Progress is measured in the
// tag's configured unit (sum of logged quantity) when a tag config exists,
// otherwise in sessions logged with the tag.
export const tagGoalSchema = z.object({
  // Deterministic id: `tag:${normalizeStudyTagKey(tag)}` — stable across devices
  // so sync merges and checklist state dedupe naturally.
  id: z.string().min(1).max(60),
  tag: studyTagSchema,
  target: z.number().int().min(1).max(99),
  label: z.string().min(1).max(40).optional(),
});

// `tagGoals` is additive: docs written by older clients simply lack the field,
// and old clients merge-write only the three legacy numeric fields, so they
// never clobber it in Firestore.
export const dailyGoalSettingsSchema = z.object({
  tacticsMinutes: z.number().min(0).max(99).optional(),
  gamesCount: z.number().min(0).max(99).optional(),
  studyMinutes: z.number().min(0).max(99).optional(),
  tagGoals: z.array(tagGoalSchema).max(10).optional(),
  isCustomized: z.boolean().default(false),
  autoTracking: z.boolean().default(false),
  lastModified: isoDateOptional,
});

export type DailyGoalSettings = z.infer<typeof dailyGoalSettingsSchema>;
export type TagGoal = z.infer<typeof tagGoalSchema>;
export type StudyTag = z.infer<typeof studyTagSchema>;
export type StudyTagConfig = z.infer<typeof studyTagConfigSchema>;
export type UserStudyPreferences = z.infer<typeof userStudyPreferencesSchema>;
