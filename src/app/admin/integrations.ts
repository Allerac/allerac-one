/**
 * Admin Integrations tab: each integration belongs to an optional module and is
 * shown only when that module is enabled in this Unit (ALLERAC_PROFILE /
 * ALLERAC_MODULES). The tab is hidden when none is enabled.
 */
export type AdminIntegration = 'instagram' | 'tiktok';

export const ADMIN_INTEGRATION_MODULES: Record<AdminIntegration, string> = {
  instagram: 'social',
  tiktok: 'social',
};

export function getEnabledAdminIntegrations(isModuleEnabled: (moduleId: string) => boolean): AdminIntegration[] {
  return (Object.keys(ADMIN_INTEGRATION_MODULES) as AdminIntegration[])
    .filter((id) => isModuleEnabled(ADMIN_INTEGRATION_MODULES[id]));
}
