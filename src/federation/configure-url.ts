/** Where the "Configure" item of an agent row points. Origins only: never keys. */
export const SELF_AGENT_HREF = '/agents/self/agent';
export const LOCAL_CONFIGURE_URL = '/hub/settings';

/** Validated `<origin>/hub/settings` for a peer origin; null if the origin is not http(s). */
export function peerConfigureUrl(origin: string | null | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return `${url.origin}${LOCAL_CONFIGURE_URL}`;
  } catch {
    return null;
  }
}
