// Phase 3 privacy-zone redaction (docs/roadmap/health-detailed-activities.md).
// Trims samples from the start and end of a route that fall within any
// protected-location radius — "hides the beginning and end of served routes
// near protected locations," not per-point masking throughout the middle.
// Pure function, no DB access: the stored samples are never altered, this
// is a serve-time view only.

export interface RouteSample {
  latitude: number | null;
  longitude: number | null;
  [key: string]: unknown;
}

export interface ProtectedZone {
  lat: number;
  lng: number;
  radiusMeters: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function isWithinAnyZone(lat: number, lng: number, zones: ProtectedZone[]): boolean {
  return zones.some((zone) => haversineDistanceMeters(lat, lng, zone.lat, zone.lng) <= zone.radiusMeters);
}

export function redactRouteSamples<T extends RouteSample>(
  samples: T[],
  zones: ProtectedZone[],
): { samples: T[]; redacted: boolean } {
  if (zones.length === 0 || samples.length === 0) {
    return { samples, redacted: false };
  }

  // A sample without a GPS fix reveals no location, so it can't be
  // confirmed "inside" a zone — trimming stops there rather than skipping
  // past it, since we only ever trim a contiguous run from each end.
  const withinZone = (sample: T): boolean =>
    sample.latitude != null &&
    sample.longitude != null &&
    isWithinAnyZone(sample.latitude, sample.longitude, zones);

  let start = 0;
  while (start < samples.length && withinZone(samples[start])) {
    start++;
  }

  let end = samples.length - 1;
  while (end >= start && withinZone(samples[end])) {
    end--;
  }

  const redacted = start > 0 || end < samples.length - 1;
  return { samples: samples.slice(start, end + 1), redacted };
}
