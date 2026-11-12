import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { AuthService } from '@/app/services/auth/auth.service';
import { canUseTerminal } from '@/app/lib/claude-terminal';
import ConnectionsClient from './ConnectionsClient';

export default async function ConnectionsPage() {
  const user = await requireAuthenticatedUser();
  const auth = new AuthService();
  const [health, notes] = await Promise.all([
    auth.canAccessDomain(user.id, user.is_admin, 'health'),
    auth.canAccessDomain(user.id, user.is_admin, 'notes'),
  ]);
  return <ConnectionsClient userId={user.id} health={health} notes={notes} terminal={canUseTerminal(user, 'claude')} codexTerminal={canUseTerminal(user, 'codex')} />;
}
