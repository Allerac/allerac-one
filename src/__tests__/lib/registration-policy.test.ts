/** @jest-environment node */

import { isOpenRegistrationEnabled } from '@/app/lib/registration-policy';

describe('isOpenRegistrationEnabled', () => {
  it('is closed by default', () => {
    expect(isOpenRegistrationEnabled({})).toBe(false);
    expect(isOpenRegistrationEnabled({ ALLOW_REGISTRATION: '' })).toBe(false);
  });

  it('is closed for anything other than "true"', () => {
    for (const value of ['false', '0', 'no', 'yes', '1', 'tru']) {
      expect(isOpenRegistrationEnabled({ ALLOW_REGISTRATION: value })).toBe(false);
    }
  });

  it('opens only when ALLOW_REGISTRATION=true', () => {
    expect(isOpenRegistrationEnabled({ ALLOW_REGISTRATION: 'true' })).toBe(true);
    expect(isOpenRegistrationEnabled({ ALLOW_REGISTRATION: ' TRUE ' })).toBe(true);
  });
});
