import type { ServicePrincipal } from '@/app/services/service-principals/service-principal.service';

export function servicePrincipalDto(principal: ServicePrincipal) {
  return {
    id: principal.id,
    kind: principal.kind,
    name: principal.name,
    peerUrl: principal.peerUrl,
    actingUserId: principal.actingUserId,
    disabledAt: principal.disabledAt?.toISOString() ?? null,
    createdAt: principal.createdAt.toISOString(),
  };
}
