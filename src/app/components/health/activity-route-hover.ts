// Pure hover-sync logic, kept out of ActivityRouteMap.tsx so it can be unit
// tested without pulling in react-leaflet (which ships ESM-only output that
// breaks under Jest's default node_modules transform ignore).

export interface RoutePoint {
  sample_index: number;
  // Not every sample has a GPS fix (brief dropout, indoor stretch, a
  // metric-only sample) — these are genuinely nullable on the wire. Use
  // filterValidPoints() before handing points to Leaflet, which crashes
  // outright on a null lat/lng.
  latitude: number | null;
  longitude: number | null;
  elevation_meters?: number | null;
}

export interface ValidRoutePoint extends RoutePoint {
  latitude: number;
  longitude: number;
}

// Drops samples without a GPS fix. Required before anything reaches
// Leaflet — it throws on a null lat/lng rather than skipping the point.
export function filterValidPoints(points: RoutePoint[]): ValidRoutePoint[] {
  return points.filter((p): p is ValidRoutePoint => p.latitude != null && p.longitude != null);
}

// Finds the route point whose sample_index is closest to the hovered chart
// sample — route and series can be downsampled to different resolutions, so
// an exact match isn't guaranteed. Expects already-filtered points (see
// filterValidPoints) so it never returns a point with a null lat/lng.
export function findNearestPoint(points: ValidRoutePoint[], sampleIndex: number | null | undefined): ValidRoutePoint | null {
  if (sampleIndex == null || points.length === 0) return null;
  let nearest = points[0];
  let nearestDist = Math.abs(points[0].sample_index - sampleIndex);
  for (const p of points) {
    const dist = Math.abs(p.sample_index - sampleIndex);
    if (dist < nearestDist) {
      nearest = p;
      nearestDist = dist;
    }
  }
  return nearest;
}
