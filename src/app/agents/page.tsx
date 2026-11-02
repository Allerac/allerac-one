import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { SELF_AGENT_HREF } from '@/federation/configure-url';
import pool from '@/app/clients/db';
import AgentsIndexClient from './AgentsIndexClient';

export const dynamic = 'force-dynamic';

/** Last local chat activity of a user (ISO), used to pick the agent opened on desktop. */
export async function localLastActivity(userId: string): Promise<string | null> {
  try {
    const result = await pool.query('SELECT MAX(updated_at) AS last FROM chat_conversations WHERE user_id = $1', [userId]);
    const last = result.rows[0]?.last;
    return last ? new Date(last).toISOString() : null;
  } catch (error) {
    console.error('[AgentsIndex] Error reading local activity:', error);
    return null;
  }
}

/**
 * Home screen (`/` redirects here). Admins get the agent list: desktop opens
 * the most recently active agent, mobile shows the list. Non-admins only have
 * this Unit's agent, so they go straight to it.
 */
export default async function AgentsIndexPage() {
  const user = await requireAuthenticatedUser();
  if (!user.is_admin) redirect(SELF_AGENT_HREF);
  return <AgentsIndexClient localLastActivity={await localLastActivity(String(user.id))} />;
}
