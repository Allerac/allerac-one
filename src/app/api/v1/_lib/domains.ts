import type { DomainSummary } from '@/app/services/domains/domain.service';

export function domainDto(domain: DomainSummary) {
  return {
    slug: domain.slug,
    displayName: domain.displayName,
    isActive: domain.isActive,
    defaultSkill: domain.defaultSkill
      ? {
          id: domain.defaultSkill.id,
          name: domain.defaultSkill.name,
          displayName: domain.defaultSkill.displayName,
        }
      : null,
  };
}

