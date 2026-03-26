/**
 * Allerac System Logger — server-side only.
 *
 * Global singleton that intercepts console.log/warn/error, stores entries
 * in a circular buffer, and emits events so the /api/logs SSE endpoint can
 * stream them to the retro terminal UI in real-time.
 *
 * Usage: call installConsoleInterceptor() once at server startup (instrumentation.ts).
 * After that, every console.log/warn/error across all services is captured automatically.
 *
 * For types/constants safe to import in client components, use @/lib/logger-shared.
 */

import { EventEmitter } from 'events';
export type { LogLevel, LogEntry } from './logger-shared';
export { CONTEXT_COLORS } from './logger-shared';
import type { LogEntry } from './logger-shared';
import type { LogLevel } from './logger-shared';

class LogBuffer extends EventEmitter {
  private buffer: LogEntry[] = [];
  private counter = 0;
  private readonly MAX = 1000;

  push(entry: LogEntry) {
    this.buffer.push(entry);
    if (this.buffer.length > this.MAX) this.buffer.shift();
    this.emit('entry', entry);
  }

  getAll(): LogEntry[] {
    return [...this.buffer];
  }

  nextId(): number {
    return ++this.counter;
  }
}

// Survive hot-reloads in dev via globalThis
const g = globalThis as any;
if (!g.__allerac_log_buffer) {
  g.__allerac_log_buffer = new LogBuffer();
  // Allow many SSE clients to subscribe without Node.js warning
  g.__allerac_log_buffer.setMaxListeners(100);
}
export const logBuffer: LogBuffer = g.__allerac_log_buffer;

function parseArgs(args: any[]): { context: string; message: string } {
  const parts = args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  });
  const raw = parts.join(' ');
  const match = raw.match(/^\[([^\]]+)\]/);
  if (match) {
    return { context: match[1], message: raw.slice(match[0].length).trimStart() };
  }
  return { context: 'system', message: raw };
}

function now(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function installConsoleInterceptor() {
  // Prevent double-install across hot reloads
  if ((globalThis as any).__allerac_console_patched) return;
  (globalThis as any).__allerac_console_patched = true;

  const origLog   = console.log.bind(console);
  const origWarn  = console.warn.bind(console);
  const origError = console.error.bind(console);
  const origInfo  = console.info.bind(console);

  // Messages that are pure noise — Next.js internals with no useful content
  const NOISE = new Set(['{}', '[]', 'undefined', 'null', '']);
  const NOISE_PREFIXES = ['  ▲', '   -', ' ✓', ' ✗', ' ⚠', 'Warning: ', 'at Object.'];

  function capture(level: LogLevel, args: any[]) {
    if (!args.length) return;
    const first = String(args[0]);

    // Skip Next.js build/startup output
    if (NOISE_PREFIXES.some(p => first.startsWith(p))) return;

    const { context, message } = parseArgs(args);
    const trimmed = message.trim();

    // Skip empty or meaningless messages
    if (!trimmed || NOISE.has(trimmed)) return;

    // Skip Next.js digest-only errors (no useful info for the user)
    if (trimmed.match(/^\{"digest":"\d+"\}$/)) return;

    logBuffer.push({ id: logBuffer.nextId(), ts: now(), level, context, message: trimmed });
  }

  console.log   = (...args: any[]) => { origLog(...args);   capture('log',   args); };
  console.warn  = (...args: any[]) => { origWarn(...args);  capture('warn',  args); };
  console.error = (...args: any[]) => { origError(...args); capture('error', args); };
  console.info  = (...args: any[]) => { origInfo(...args);  capture('info',  args); };
}
