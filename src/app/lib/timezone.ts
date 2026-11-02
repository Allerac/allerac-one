/**
 * Timezone helpers for user-facing dates ("today", "yesterday").
 *
 * Resolution order: the user's own setting (user_settings.timezone), then the
 * ALLERAC_TIMEZONE env var, then the server timezone. Invalid names are skipped.
 */

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value || typeof value !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function resolveTimeZone(
  userTimeZone?: string | null,
  env: Record<string, string | undefined> = process.env,
): string {
  if (isValidTimeZone(userTimeZone?.trim())) return userTimeZone!.trim();
  const configured = env.ALLERAC_TIMEZONE?.trim();
  if (isValidTimeZone(configured)) return configured;
  return serverTimeZone();
}

export interface LocalDateParts {
  /** YYYY-MM-DD in the given timezone. */
  date: string;
  /** HH:MM:SS (24h) in the given timezone. */
  time: string;
  weekday: string;
  timeZone: string;
}

export function localDateParts(now: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'long', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    weekday: get('weekday'),
    timeZone,
  };
}

/** Shifts a YYYY-MM-DD calendar date by whole days (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
