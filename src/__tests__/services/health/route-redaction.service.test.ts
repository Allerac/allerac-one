import { redactRouteSamples, ProtectedZone, RouteSample } from '@/app/services/health/route-redaction.service';

// Synthetic coordinates only — no real locations.
const HOME: ProtectedZone = { lat: 10.0, lng: 20.0, radiusMeters: 150 };

function sample(lat: number | null, lng: number | null, index: number): RouteSample {
  return { latitude: lat, longitude: lng, sample_index: index };
}

describe('redactRouteSamples', () => {
  it('is a no-op when there are no protected zones', () => {
    const samples = [sample(10.0, 20.0, 0), sample(10.01, 20.01, 1)];
    const result = redactRouteSamples(samples, []);
    expect(result).toEqual({ samples, redacted: false });
  });

  it('is a no-op when the route never enters any zone', () => {
    const samples = [sample(50.0, 60.0, 0), sample(50.01, 60.01, 1)];
    const result = redactRouteSamples(samples, [HOME]);
    expect(result.redacted).toBe(false);
    expect(result.samples).toHaveLength(2);
  });

  it('trims only the leading samples near a protected location', () => {
    const samples = [
      sample(10.0, 20.0, 0),      // ~0m from HOME — inside
      sample(10.0005, 20.0, 1),   // ~55m from HOME — inside (150m radius)
      sample(20.0, 30.0, 2),      // far away — outside
      sample(20.001, 30.001, 3),  // far away — outside
    ];
    const result = redactRouteSamples(samples, [HOME]);

    expect(result.redacted).toBe(true);
    expect(result.samples.map((s) => s.sample_index)).toEqual([2, 3]);
  });

  it('trims only the trailing samples near a protected location', () => {
    const samples = [
      sample(20.0, 30.0, 0),
      sample(20.001, 30.001, 1),
      sample(10.0005, 20.0, 2),
      sample(10.0, 20.0, 3),
    ];
    const result = redactRouteSamples(samples, [HOME]);

    expect(result.redacted).toBe(true);
    expect(result.samples.map((s) => s.sample_index)).toEqual([0, 1]);
  });

  it('trims both ends when the route starts and finishes near a protected location', () => {
    const samples = [
      sample(10.0, 20.0, 0),
      sample(20.0, 30.0, 1),
      sample(20.001, 30.001, 2),
      sample(10.0, 20.0, 3),
    ];
    const result = redactRouteSamples(samples, [HOME]);

    expect(result.redacted).toBe(true);
    expect(result.samples.map((s) => s.sample_index)).toEqual([1, 2]);
  });

  it('redacts the whole route when every sample is inside a zone', () => {
    const samples = [sample(10.0, 20.0, 0), sample(10.0001, 20.0001, 1)];
    const result = redactRouteSamples(samples, [HOME]);

    expect(result.redacted).toBe(true);
    expect(result.samples).toEqual([]);
  });

  it('does not trim past a sample with no GPS fix', () => {
    const samples = [
      sample(10.0, 20.0, 0),  // inside zone
      sample(null, null, 1),  // no fix — trimming must stop here
      sample(20.0, 30.0, 2),  // outside, but unreachable by the trim scan
    ];
    const result = redactRouteSamples(samples, [HOME]);

    expect(result.redacted).toBe(true);
    expect(result.samples.map((s) => s.sample_index)).toEqual([1, 2]);
  });

  it('is a no-op when there are no samples', () => {
    const result = redactRouteSamples([], [HOME]);
    expect(result).toEqual({ samples: [], redacted: false });
  });
});
