import { ALLERAC_DOMAINS, getDomainByKey, getDomainByPath } from '@/app/components/layout/allerac-domains';

describe('Knowledge identity compatibility', () => {
  test('uses the new product name without changing the stable memory identifier', () => {
    expect(ALLERAC_DOMAINS).toContainEqual(expect.objectContaining({
      key: 'memory',
      name: 'Knowledge',
      path: '/memory',
    }));
  });

  test('continues resolving the memory domain by key and route', () => {
    expect(getDomainByKey('memory')?.name).toBe('Knowledge');
    expect(getDomainByPath('/memory')?.key).toBe('memory');
    expect(getDomainByPath('/memory/documents')?.key).toBe('memory');
  });
});
