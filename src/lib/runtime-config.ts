const APP_REQUIRED_SECRETS = [
  'ENCRYPTION_KEY',
  'TELEGRAM_TOKEN_ENCRYPTION_KEY',
  'EXECUTOR_SECRET',
] as const;

const WORKER_REQUIRED_SECRETS = [
  'ENCRYPTION_KEY',
  'EXECUTOR_SECRET',
] as const;

function collectConfigErrors(
  env: Record<string, string | undefined>,
  requiredSecrets: readonly string[],
): string[] {
  const errors: string[] = [];

  for (const name of requiredSecrets) {
    const value = env[name]?.trim();
    if (!value) errors.push(`${name} is required`);
    else if (value.length < 32) errors.push(`${name} must contain at least 32 characters`);
  }

  if (!env.DATABASE_URL?.trim()) errors.push('DATABASE_URL is required');
  if (!env.EXECUTOR_URL?.trim()) errors.push('EXECUTOR_URL is required');

  return errors;
}

function assertValidConfig(errors: string[]): void {
  if (errors.length > 0) {
    throw new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`);
  }
}

export function validateRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  assertValidConfig(collectConfigErrors(env, APP_REQUIRED_SECRETS));
}

export function validateWorkerRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  assertValidConfig(collectConfigErrors(env, WORKER_REQUIRED_SECRETS));
}
