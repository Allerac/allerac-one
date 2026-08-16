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
