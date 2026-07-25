export interface GarminExerciseSet {
  setType: 'ACTIVE' | 'REST';
  duration?: number | null;
  repetitionCount?: number | null;
  weight?: number | null;
  exercises: Array<{
    category: string;
    name?: string | null;
    probability?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface ActivityCorrectionRow {
  raw_data?: unknown;
  corrected_exercise_sets?: unknown;
  garmin_sync_status?: string | null;
  garmin_sync_error?: string | null;
  correction_updated_at?: string | Date | null;
}

export function summarizeExerciseSets(sets: GarminExerciseSet[]): Array<Record<string, unknown>> {
  const summaries = new Map<string, {
    category: string;
    reps: number;
    sets: number;
    maxWeight: number;
  }>();

  for (const set of sets) {
    if (set.setType !== 'ACTIVE') continue;
    const exercise = set.exercises?.[0];
    const category = exercise?.name || exercise?.category || 'UNKNOWN';
    const summary = summaries.get(category) ?? {
      category,
      reps: 0,
      sets: 0,
      maxWeight: 0,
    };
    summary.sets += 1;
    summary.reps += set.repetitionCount ?? 0;
    summary.maxWeight = Math.max(summary.maxWeight, set.weight ?? 0);
    summaries.set(category, summary);
  }

  return [...summaries.values()];
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function jsonSets(value: unknown): GarminExerciseSet[] | null {
  if (!value) return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed as GarminExerciseSet[] : null;
}

export function applyActivityCorrection(row: ActivityCorrectionRow): Record<string, unknown> {
  const rawData = jsonObject(row.raw_data);
  const correctedSets = jsonSets(row.corrected_exercise_sets);

  return {
    ...rawData,
    ...(correctedSets ? {
      exerciseSets: correctedSets,
      summarizedExerciseSets: summarizeExerciseSets(correctedSets),
      exerciseCorrection: {
        garminSyncStatus: row.garmin_sync_status,
        garminSyncError: row.garmin_sync_error,
        updatedAt: row.correction_updated_at,
      },
    } : {}),
  };
}
