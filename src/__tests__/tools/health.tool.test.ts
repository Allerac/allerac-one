import '../__mocks__/db';
import pool from '@/app/clients/db';
import { HealthTool } from '@/app/tools/health.tool';

const mockQuery = jest.mocked(pool.query);
const user = { id: 'user-a', email: 'a@example.com', name: 'User A' };

describe('HealthTool.getActivityDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-numeric activity id without querying the database', async () => {
    const tool = new HealthTool();
    const result = await tool.getActivityDetail(user, 'not-a-number');

    expect(result).toEqual({ activity_id: 'not-a-number', error: 'activityId must be numeric' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns a not-found error when the activity does not belong to the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    const tool = new HealthTool();

    const result = await tool.getActivityDetail(user, '123');

    expect(result).toEqual({ activity_id: '123', error: 'Activity not found' });
  });

  it('returns bounded stats, laps, and zones, with no route/GPS fields', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          activity_id: '123',
          activity_name: 'Morning Run',
          activity_type: 'running',
          date: '2026-08-07',
          duration_seconds: '1800',
          calories: '320',
          distance_meters: '5000',
          avg_heart_rate: '150',
          max_heart_rate: '172',
          elevation_gain: '40',
          average_pace_seconds_per_km: '360',
          average_power_watts: null,
          average_cadence_spm: '168',
          average_stride_length_meters: '1.05',
          average_vertical_oscillation_cm: '8.2',
          average_vertical_ratio_percent: '7.1',
          average_ground_contact_time_ms: '245',
          estimated_sweat_loss_ml: '450',
          beginning_stamina_percent: '95',
          ending_stamina_percent: '60',
          training_effect_aerobic: '3.2',
          training_effect_anaerobic: '1.1',
          training_benefit: 'TEMPO',
          exercise_load: '85',
          vo2_max: '47',
        }],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ lap_index: 1, duration_seconds: '365', distance_meters: '1000', pace_seconds_per_km: '365', average_heart_rate: '145', average_power_watts: null, average_cadence_spm: '167' }],
      } as never)
      .mockResolvedValueOnce({
        rows: [{ metric_type: 'heart_rate', zone_number: 3, duration_seconds: '600', percent: '33.3' }],
      } as never);

    const tool = new HealthTool();
    const result = await tool.getActivityDetail(user, '123');

    expect(result.name).toBe('Morning Run');
    expect(result.vo2_max).toBe(47);
    expect(result.laps).toEqual([
      expect.objectContaining({ lap: 1, avg_heart_rate: 145 }),
    ]);
    expect(result.zones).toEqual([
      expect.objectContaining({ metric: 'heart_rate', zone: 3, percent: 33.3 }),
    ]);
    const keys = Object.keys(result);
    expect(keys).not.toEqual(expect.arrayContaining(['route', 'coordinates', 'bounds', 'polyline', 'latitude', 'longitude']));
  });
});

describe('HealthTool sleep dates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sleep details and the wake-day note for a day with data', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ steps: 100, sleep_duration_minutes: 420, sleep_deep_minutes: 60, sleep_rem_minutes: 90, sleep_score: 80 }],
    } as never);
    const result = await new HealthTool().getDailySnapshot(user, '2026-11-02');
    expect(result).toMatchObject({ date: '2026-11-02', sleep_duration_minutes: 420, sleep_score: 80 });
    expect(result.sleep_note).toMatch(/woke up/);
  });

  it('lists the nearest dates with data when the requested day has none', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ date: '2026-11-02' }, { date: '2026-10-31' }] } as never);
    const result = await new HealthTool().getDailySnapshot(user, '2026-11-01');
    expect(result).toMatchObject({ date: '2026-11-01', error: 'No data for this date', nearest_dates_with_data: ['2026-11-02', '2026-10-31'] });
    expect(mockQuery.mock.calls[1][1]).toEqual(['user-a', '2026-11-01']);
  });

  it('computes the summary window from today in the given timezone', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T23:30:00Z'));
    try {
      const tool = new HealthTool();
      jest.spyOn(tool as never, '_isConnected' as never).mockResolvedValue(true as never);
      mockQuery.mockResolvedValueOnce({ rows: [{ days_with_data: 1 }] } as never);
      await tool.getSummary(user, 'day', 'Europe/Madrid');
      // Today is Nov 2 in Madrid, so a one-day window starts Nov 1 (UTC would give Oct 31).
      expect(mockQuery.mock.calls.at(-1)?.[1]).toEqual(['user-a', '2026-11-01']);
    } finally {
      jest.useRealTimers();
    }
  });
});
