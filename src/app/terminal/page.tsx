import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { availableTerminalProviders } from '@/app/lib/unit-terminal';
import { isTerminalProvider } from './providers';
import TerminalClient from './TerminalClient';

export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const user = await requireAuthenticatedUser();
  const available = await availableTerminalProviders(user);
  const requested = (await searchParams).provider;
  const provider = requested || available[0];
  if (!isTerminalProvider(provider) || !available.includes(provider)) notFound();
  return <TerminalClient key={provider} provider={provider} available={available} />;
}
