import { requireAuthenticatedUser } from '@/app/lib/domain-access';
import { loadUserSettings } from '@/app/actions/user';
import { getUserAccessibleDomains } from '@/app/actions/domains';
import CliSettingsClient from './CliSettingsClient';

export default async function CliPage() {
  await requireAuthenticatedUser();
  const [settings, domains] = await Promise.all([
    loadUserSettings(),
    getUserAccessibleDomains(),
  ]);

  return (
    <CliSettingsClient
      domains={domains}
      cliDomainSlug={settings?.cli_domain_slug ?? null}
      cliModelId={settings?.cli_model_id ?? null}
    />
  );
}
