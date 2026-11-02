import { addDays, isValidTimeZone, localDateParts, resolveTimeZone, serverTimeZone } from '@/app/lib/timezone';
import { TodayTool } from '@/app/tools/today.tool';

describe('timezone helpers', () => {
  it('validates IANA names', () => {
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('resolves user setting, then ALLERAC_TIMEZONE, then the server timezone', () => {
    expect(resolveTimeZone('Asia/Tokyo', { ALLERAC_TIMEZONE: 'America/Sao_Paulo' })).toBe('Asia/Tokyo');
    expect(resolveTimeZone(null, { ALLERAC_TIMEZONE: 'America/Sao_Paulo' })).toBe('America/Sao_Paulo');
    expect(resolveTimeZone('bogus', { ALLERAC_TIMEZONE: 'also-bogus' })).toBe(serverTimeZone());
    expect(resolveTimeZone(undefined, {})).toBe(serverTimeZone());
  });

  it('computes the local calendar date, not the UTC one', () => {
    // 23:30 UTC on Nov 1 is already Nov 2 in Madrid (UTC+1) and still Nov 1 in Sao Paulo.
    const now = new Date('2026-11-01T23:30:00Z');
    expect(localDateParts(now, 'Europe/Madrid')).toMatchObject({ date: '2026-11-02', time: '00:30:00', weekday: 'Monday' });
    expect(localDateParts(now, 'America/Sao_Paulo')).toMatchObject({ date: '2026-11-01', weekday: 'Sunday' });
  });

  it('shifts calendar dates across month and year boundaries', () => {
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('get_today_info reports the date in the given timezone', () => {
    const result = new TodayTool().execute('Europe/Madrid', new Date('2026-11-01T23:30:00Z'));
    expect(result).toMatchObject({ date: '2026-11-02', weekday: 'Monday', timezone: 'Europe/Madrid' });
  });
});
