import { localDateParts, resolveTimeZone } from '@/app/lib/timezone';

export class TodayTool {
  /** Current date and time in the given timezone (user setting, ALLERAC_TIMEZONE, or server). */
  execute(timeZone?: string | null, now: Date = new Date()) {
    const timezone = resolveTimeZone(timeZone);
    const { date, time, weekday } = localDateParts(now, timezone);
    return {
      date,
      time,
      datetime: now.toISOString(),
      weekday,
      timezone,
    };
  }
}
