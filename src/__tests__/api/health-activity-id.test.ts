import { isValidHealthActivityId } from '@/app/api/v1/health/activities/_lib/activity-id';

describe('Health activity identifiers', () => {
  test.each(['23876302278', 'strava:19628547417'])('accepts %s', (id) => {
    expect(isValidHealthActivityId(id)).toBe(true);
  });

  test.each(['', 'strava:', 'strava:abc', 'garmin:123', '../123', '123/route'])('rejects %s', (id) => {
    expect(isValidHealthActivityId(id)).toBe(false);
  });
});
