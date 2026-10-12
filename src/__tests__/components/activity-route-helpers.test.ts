import { filterValidPoints, findNearestPoint, RoutePoint, ValidRoutePoint } from '@/app/components/health/activity-route-hover';
import { formatPace, formatElapsed } from '@/app/components/health/ActivityCharts';

describe('filterValidPoints', () => {
  it('drops samples with a null latitude or longitude', () => {
    const points: RoutePoint[] = [
      { sample_index: 0, latitude: 10, longitude: 20 },
      { sample_index: 1, latitude: null, longitude: 21 },
      { sample_index: 2, latitude: 12, longitude: null },
      { sample_index: 3, latitude: null, longitude: null },
      { sample_index: 4, latitude: 13, longitude: 23 },
    ];

    expect(filterValidPoints(points).map((p) => p.sample_index)).toEqual([0, 4]);
  });

  it('returns an empty array when no sample has a GPS fix (never hands Leaflet a null lat/lng)', () => {
    const points: RoutePoint[] = [
      { sample_index: 0, latitude: null, longitude: null },
      { sample_index: 1, latitude: null, longitude: null },
    ];

    expect(filterValidPoints(points)).toEqual([]);
  });
});

describe('findNearestPoint', () => {
  const points: ValidRoutePoint[] = [
    { sample_index: 0, latitude: 10, longitude: 20 },
    { sample_index: 5, latitude: 11, longitude: 21 },
    { sample_index: 10, latitude: 12, longitude: 22 },
  ];

  it('returns null when sampleIndex is null/undefined', () => {
    expect(findNearestPoint(points, null)).toBeNull();
    expect(findNearestPoint(points, undefined)).toBeNull();
  });

  it('returns null for an empty points list', () => {
    expect(findNearestPoint([], 5)).toBeNull();
  });

  it('returns the exact match when sample_index is present', () => {
    expect(findNearestPoint(points, 5)).toEqual(points[1]);
  });

  it('returns the closest point when there is no exact match (route downsampled differently than series)', () => {
    expect(findNearestPoint(points, 7)).toEqual(points[1]); // |5-7|=2 < |10-7|=3
    expect(findNearestPoint(points, 8)).toEqual(points[2]); // |5-8|=3 > |10-8|=2
  });
});

describe('formatPace', () => {
  it('formats whole minutes correctly', () => {
    expect(formatPace(300)).toBe('5:00/km');
  });

  it('pads seconds under 10', () => {
    expect(formatPace(305)).toBe('5:05/km');
  });

  it('matches the Barcelona fixture pace (419s -> 6:59/km)', () => {
    expect(formatPace(419)).toBe('6:59/km');
  });
});

describe('formatElapsed', () => {
  it('formats sub-minute durations as m:ss', () => {
    expect(formatElapsed(45)).toBe('0:45');
  });

  it('formats minutes and seconds without an hour component', () => {
    expect(formatElapsed(315)).toBe('5:15');
  });

  it('pads seconds under 10', () => {
    expect(formatElapsed(305)).toBe('5:05');
  });

  it('switches to h:mm:ss once past one hour', () => {
    expect(formatElapsed(3661)).toBe('1:01:01');
  });

  it('never goes negative', () => {
    expect(formatElapsed(-5)).toBe('0:00');
  });
});
