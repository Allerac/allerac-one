import { notFound } from 'next/navigation';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import ControlTowerClient from './ControlTowerClient';

export const dynamic = 'force-dynamic';

/** Control Tower (federation P4d): admins only; everyone else gets a 404. */
export default async function ControlTowerPage() {
  try {
    await requireCurrentAdmin();
  } catch {
    notFound();
  }
  return <ControlTowerClient />;
}
