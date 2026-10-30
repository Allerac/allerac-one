/**
 * Who may use the unified inbox (federation P4a).
 *
 * Federation is a Unit-admin feature: only admins see remote agents, and the
 * inbox is never offered inside public domains (sales, openworld).
 */
import { PUBLIC_DOMAINS } from '@/app/services/chat/public-domains';

export function canUseInbox(user: { is_admin?: boolean } | null | undefined, domain?: string | null): boolean {
  if (!user?.is_admin) return false;
  return !PUBLIC_DOMAINS.includes((domain ?? 'chat').toLowerCase());
}
