import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { canUseTerminal } from '@/app/lib/claude-terminal';
import { TERMINAL_PROVIDERS, isTerminalProvider } from './providers';
import TerminalClient from './TerminalClient';

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const user = await requireAuthenticatedUser();
  const available = TERMINAL_PROVIDERS.filter(provider => canUseTerminal(user, provider));
  const requested = (await searchParams).provider;
  const provider = requested || available[0];
  if (!isTerminalProvider(provider) || !available.includes(provider)) notFound();
  return <TerminalClient key={provider} provider={provider} available={available} />;
}
