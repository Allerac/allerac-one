const permanentRedirect = jest.fn();
jest.mock('next/navigation', () => ({ permanentRedirect: (...args: unknown[]) => permanentRedirect(...args) }));

import LegacySalesPage from '@/app/sales/page';

describe('/sales legacy route', () => {
  it('permanently redirects to /alleracweb', () => {
    LegacySalesPage();
    expect(permanentRedirect).toHaveBeenCalledWith('/alleracweb');
  });
});
