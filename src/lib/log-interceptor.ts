/**
 * Log Interceptor — Send console logs to the centralized log API
 *
 * Usage in any Node.js service (Telegram, Health Worker, etc):
 *   import { installLogInterceptor } from '@/lib/log-interceptor';
 *   installLogInterceptor('http://allerac-app:8080/api/log-submit');
 *
 * After this, all console.log/warn/error with [Context] format
 * will be automatically sent to the log API.
 *
 * Format: console.log('[ServiceName] message') → API receives {context: 'ServiceName', message: 'message', level: 'log'}
 */

export async function sendLogToAPI(
  apiUrl: string,
  context: string,
  message: string,
  level: 'log' | 'warn' | 'error' | 'info' = 'log'
): Promise<void> {
  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, message, level }),
    });
  } catch (err) {
    // Silently fail — don't log errors to avoid infinite loops
  }
}

/**
 * Install log interceptor for a service
 *
 * @param apiUrl - URL of the log API (default: http://allerac-app:8080/api/log-submit)
 * @param serviceName - Optional service name for debugging (used in error messages)
 *
 * Example:
 *   installLogInterceptor('http://allerac-app:8080/api/log-submit', 'telegram-bot');
 */
export function installLogInterceptor(
  apiUrl: string = 'http://allerac-app:8080/api/log-submit',
  serviceName: string = 'Service'
): void {
  // Prevent double installation
  if ((global as any).__log_interceptor_installed) {
    return;
  }
  (global as any).__log_interceptor_installed = true;

  const originalLog = console.log.bind(console);
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalInfo = console.info.bind(console);

  /**
   * Parse console arguments and extract [Context] from first string arg
   * Example: console.log('[Telegram] message') → context='Telegram', message='message'
   */
  function parseLogArgs(args: any[]): { context: string; message: string } | null {
    const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    const match = msg.match(/^\[([^\]]+)\]/);
    if (match) {
      const context = match[1];
      const message = msg.slice(match[0].length).trim();
      return { context, message };
    }
    return null;
  }

  console.log = (...args: any[]) => {
    originalLog(...args);
    const parsed = parseLogArgs(args);
    if (parsed) {
      sendLogToAPI(apiUrl, parsed.context, parsed.message, 'log').catch(() => {});
    }
  };

  console.error = (...args: any[]) => {
    originalError(...args);
    const parsed = parseLogArgs(args);
    if (parsed) {
      sendLogToAPI(apiUrl, parsed.context, parsed.message, 'error').catch(() => {});
    }
  };

  console.warn = (...args: any[]) => {
    originalWarn(...args);
    const parsed = parseLogArgs(args);
    if (parsed) {
      sendLogToAPI(apiUrl, parsed.context, parsed.message, 'warn').catch(() => {});
    }
  };

  console.info = (...args: any[]) => {
    originalInfo(...args);
    const parsed = parseLogArgs(args);
    if (parsed) {
      sendLogToAPI(apiUrl, parsed.context, parsed.message, 'info').catch(() => {});
    }
  };
}
