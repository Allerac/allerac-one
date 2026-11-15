/** Error codes returned by the /api/terminal routes; each has a terminal.errors.<code> message. */
export const TERMINAL_ERROR_CODES = [
  'reauth_required', 'invalid_password', 'signin_required', 'rate_limited', 'unlock_unavailable', 'invalid_request',
  'unknown_provider', 'unknown_operation', 'request_too_large', 'terminal_unavailable', 'connection_unavailable',
  'scope_not_allowed', 'install_failed',
] as const;
export type TerminalErrorCode = typeof TERMINAL_ERROR_CODES[number];

export class TerminalRequestError extends Error {
  constructor(readonly code: TerminalErrorCode | null, message: string, readonly status: number) {
    super(message);
    this.name = 'TerminalRequestError';
  }
}

const isCode = (value: unknown): value is TerminalErrorCode => (TERMINAL_ERROR_CODES as readonly unknown[]).includes(value);

/** Parse a terminal API response, throwing a TerminalRequestError for any failure. */
export async function readTerminalResponse<T = Record<string, unknown>>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new TerminalRequestError(isCode(data?.code) ? data.code : null, typeof data?.error === 'string' ? data.error : '', response.status);
  return data as T;
}

export const needsTerminalUnlock = (error: unknown) => error instanceof TerminalRequestError && error.code === 'reauth_required';

/**
 * Turn an error into a user-facing message: known codes are translated, other
 * server messages (already English, e.g. from the local bridge) are shown as is.
 */
export function terminalErrorMessage(error: unknown, translate: (key: string) => string, fallbackKey = 'generic'): string {
  if (error instanceof TerminalRequestError) return error.code ? translate(error.code) : error.message || translate(fallbackKey);
  return translate(fallbackKey);
}
