/** @jest-environment node */

import { validateRuntimeConfig } from '@/lib/runtime-config';

const validEnv = {
  DATABASE_URL: 'postgresql://postgres:postgres@db:5432/allerac',
  ENCRYPTION_KEY: 'a'.repeat(64),
  TELEGRAM_TOKEN_ENCRYPTION_KEY: 'b'.repeat(64),
  EXECUTOR_URL: 'http://executor:3001',
  EXECUTOR_SECRET: 'c'.repeat(64),
};

describe('validateRuntimeConfig', () => {
  test('accepts a complete runtime configuration', () => {
    expect(() => validateRuntimeConfig(validEnv)).not.toThrow();
  });

  test('reports all missing critical values', () => {
    expect(() => validateRuntimeConfig({})).toThrow(
      /DATABASE_URL is required[\s\S]*EXECUTOR_URL is required/,
    );
  });

  test('rejects short encryption keys and service secrets', () => {
    expect(() => validateRuntimeConfig({
      ...validEnv,
      ENCRYPTION_KEY: 'short',
      EXECUTOR_SECRET: 'short',
    })).toThrow(/ENCRYPTION_KEY must contain at least 32 characters[\s\S]*EXECUTOR_SECRET/);
  });
});
