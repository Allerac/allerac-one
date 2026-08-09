export function isValidHealthActivityId(value: string): boolean {
  return /^(?:\d+|strava:\d+)$/.test(value) && value.length <= 255;
}
