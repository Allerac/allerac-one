import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/app/lib/domain-access';

/** Home: every signed-in user lands on the agents screen. The old hub lives at /hub. */
export default async function RootPage() {
  await requireAuthenticatedUser();
  redirect('/agents');
}
