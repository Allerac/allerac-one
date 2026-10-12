import { logicalStravaActivityId, mapStravaActivity } from '@/app/services/strava/strava-sync.service';

describe('Strava activity mapping', () => {
  test('maps explicit units and keeps the provider identifier isolated', () => {
    const mapped = mapStravaActivity({
      id: 123456,
      name: 'Barcelona Running',
      sport_type: 'Run',
      start_date: '2026-08-02T14:38:00Z',
      start_date_local: '2026-08-02T16:38:00',
      timezone: '(GMT+01:00) Europe/Madrid',
      distance: 5010,
      moving_time: 2088,
      elapsed_time: 2431,
      total_elevation_gain: 40,
      average_speed: 5010 / 2096,
      max_speed: 1000 / 318,
      average_heartrate: 165,
      max_heartrate: 189,
      average_watts: 229,
      max_watts: 359,
      average_cadence: 82,
      calories: 361,
      map: { summary_polyline: 'encoded-route' },
    });

    expect(mapped).toMatchObject({
      activityId: 'strava:123456',
      providerActivityId: '123456',
      activityName: 'Barcelona Running',
      activityType: 'Run',
      date: '2026-08-02',
      distanceMeters: 5010,
      movingTimeSeconds: 2088,
      elapsedTimeSeconds: 2431,
      avgHeartRate: 165,
      averagePower: 229,
      averageCadence: 164,
      routePolyline: 'encoded-route',
    });
    expect(mapped.averagePace).toBeCloseTo(2096 / 5.01, 3);
    expect(mapped.bestPace).toBeCloseTo(318, 3);
  });

  test('does not invent unavailable metrics', () => {
    const mapped = mapStravaActivity({
      id: 7,
      name: 'Walk',
      start_date: '2026-08-02T10:00:00Z',
      start_date_local: '2026-08-02T12:00:00',
    });
    expect(mapped.averagePace).toBeNull();
    expect(mapped.avgHeartRate).toBeNull();
    expect(logicalStravaActivityId(7)).toBe('strava:7');
  });
});
