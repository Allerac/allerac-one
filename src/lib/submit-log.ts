import { logBuffer } from '@/lib/logger';

function now(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export async function submitLog(
  context: string,
  message: string,
  level: 'log' | 'warn' | 'error' | 'info' = 'log'
) {
  logBuffer.push({
    id: logBuffer.nextId(),
    ts: now(),
    level,
    context,
    message,
  });
}
