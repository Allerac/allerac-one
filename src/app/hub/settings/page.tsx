import { redirect } from 'next/navigation';

/** Stable "Configure" target for agent rows (local and on peers): the settings page. */
export default function HubSettingsPage() {
  redirect('/config');
}
