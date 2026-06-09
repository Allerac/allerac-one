const REQUIRED_SECRETS = [
  'ENCRYPTION_KEY',
  'TELEGRAM_TOKEN_ENCRYPTION_KEY',
  'EXECUTOR_SECRET',
] as const;

export function validateRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  const errors: string[] = [];

  for (const name of REQUIRED_SECRETS) {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    else if (value.length < 32) errors.push(`${name} must contain at least 32 characters`);
  }

  if (!env.DATABASE_URL?.trim()) errors.push('DATABASE_URL is required');
  if (!env.EXECUTOR_URL?.trim()) errors.push('EXECUTOR_URL is required');

  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`);
  }
}
