/** @jest-environment node */

import '../__mocks__/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { CreditService } from '@/app/services/credits/credit.service';
import {
  adjustUserCredits,
  assignUserCreditPlan,
  setUserUnlimitedCredits,
  updateOperationPricing,
} from '@/app/actions/admin';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentAdmin: jest.fn(),
}));

jest.mock('@/app/services/credits/credit.service', () => ({
  CreditService: jest.fn().mockImplementation(() => ({
    adjustBalance: jest.fn(),
    assignPlan: jest.fn(),
    listPlans: jest.fn(),
    listOperationPricing: jest.fn(),
    setUnlimited: jest.fn(),
    updateOperationPricing: jest.fn(),
  })),
}));

const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const creditService = jest.mocked(CreditService).mock.results[0].value;
const admin = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};
const targetUserId = '22222222-2222-4222-8222-222222222222';

describe('admin credit actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentAdmin.mockResolvedValue(admin);
    creditService.adjustBalance.mockResolvedValue({});
    creditService.assignPlan.mockResolvedValue({});
    creditService.setUnlimited.mockResolvedValue({});
    creditService.updateOperationPricing.mockResolvedValue({
      operationType: 'image_edit',
    });
  });

  it('requires an admin before changing a balance', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(adjustUserCredits(targetUserId, 100, 'Initial grant'))
      .rejects.toThrow('Unauthorized');

    expect(creditService.adjustBalance).not.toHaveBeenCalled();
  });

  it('records the authenticated administrator on a manual adjustment', async () => {
    const result = await adjustUserCredits(targetUserId, 100, 'Initial grant');

    expect(result).toEqual({ success: true });
    expect(creditService.adjustBalance).toHaveBeenCalledWith(
      targetUserId,
      100,
      admin.id,
      'Initial grant',
    );
  });

  it('requires a reason for manual adjustments', async () => {
    const result = await adjustUserCredits(targetUserId, 100, '  ');

    expect(result).toEqual({ success: false, error: 'Adjustment reason is required' });
    expect(creditService.adjustBalance).not.toHaveBeenCalled();
  });

  it('allows only administrators to toggle unlimited usage', async () => {
    const result = await setUserUnlimitedCredits(targetUserId, true);

    expect(result).toEqual({ success: true });
    expect(creditService.setUnlimited).toHaveBeenCalledWith(targetUserId, true);
  });

  it('assigns a plan using the authenticated administrator', async () => {
    const result = await assignUserCreditPlan(targetUserId, 'pro');

    expect(result).toEqual({ success: true });
    expect(creditService.assignPlan).toHaveBeenCalledWith(targetUserId, 'pro', admin.id);
  });

  it('versions operation pricing using the authenticated administrator', async () => {
    const result = await updateOperationPricing({
      operationType: 'image_edit',
      provider: 'gemini',
      model: 'gemini-cheaper-image-model',
      unit: 'image_1k',
      credits: 7,
      providerCost: 0.04,
      providerCostCurrency: 'EUR',
    });

    expect(result.success).toBe(true);
    expect(creditService.updateOperationPricing).toHaveBeenCalledWith({
      operationType: 'image_edit',
      provider: 'gemini',
      model: 'gemini-cheaper-image-model',
      unit: 'image_1k',
      credits: 7,
      providerCost: 0.04,
      providerCostCurrency: 'EUR',
      adminUserId: admin.id,
    });
  });
});
