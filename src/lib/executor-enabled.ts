/**
 * Whether this Unit runs the shell executor at all.
 *
 * Lean / public Units (docker-compose.public.yml) run without the executor
 * container and set EXECUTOR_ENABLED=false. Then every executor-backed
 * feature is switched off: shell tools are never offered, the workspace
 * routes refuse, and EXECUTOR_URL is not required at startup.
 *
 * Unset (or any other value) keeps today's behaviour: enabled.
 * Kept dependency-free so runtime-config.ts can use it before anything loads.
 */
const DISABLED_VALUES = new Set(['false', '0', 'no', 'off']);

export function isExecutorEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = env.EXECUTOR_ENABLED?.trim().toLowerCase();
  return !(flag && DISABLED_VALUES.has(flag));
}
