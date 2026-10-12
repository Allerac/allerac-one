export const CRON_REGEX =
  /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;

export function validateCronExpression(expr: string): string | null {
  return CRON_REGEX.test(expr.trim()) ? null : 'Invalid cron expression';
}
