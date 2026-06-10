/** @jest-environment node */

import '../../__mocks__/db';
import pool from '@/app/clients/db';
import {
  CreditService,
  InsufficientCreditsError,
} from '@/app/services/credits/credit.service';

const mockConnect = jest.mocked(pool.connect);

function createClient(
  handler: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
) {
  return {
    query: jest.fn((sql: string, params?: unknown[]) => handler(sql, params)),
    release: jest.fn(),
  };
}

describe('CreditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('atomically reserves configured credits when balance is available', async () => {
    const client = createClient(async (sql) => {
      if (sql.includes('FROM credit_accounts WHERE user_id = $1 FOR UPDATE')) {
        return {
          rows: [{
            balance_microusd: '250000',
            reserved_microusd: '50000',
            unlimited: false,
            blocked: false,
          }],
        };
      }
      if (sql.includes('FROM usage_pricing')) {
        return {
          rows: [{
            id: 'pricing-1',
            customer_price_microusd: '100000',
            provider_cost_microusd: '67000',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    mockConnect.mockResolvedValue(client as never);

    const result = await new CreditService().reserve({
      userId: 'user-1',
      operationType: 'image_edit',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      unit: 'image_1k',
    });

    expect(result.reservedMicrousd).toBe(100_000);
    expect(result.reservedCredits).toBe(10);
    expect(result.providerCostMicrousd).toBe(67_000);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('reserved_microusd = reserved_microusd + $1'),
      [100_000, 'user-1'],
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('rejects a reservation without enough available balance', async () => {
    const client = createClient(async (sql) => {
      if (sql.includes('FROM credit_accounts WHERE user_id = $1 FOR UPDATE')) {
        return {
          rows: [{
            balance_microusd: '60000',
            reserved_microusd: '0',
            unlimited: false,
            blocked: false,
          }],
        };
      }
      if (sql.includes('FROM usage_pricing')) {
        return {
          rows: [{
            id: 'pricing-1',
            customer_price_microusd: '100000',
            provider_cost_microusd: '67000',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    mockConnect.mockResolvedValue(client as never);

    await expect(new CreditService().reserve({
      userId: 'user-1',
      operationType: 'image_edit',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      unit: 'image_1k',
    })).rejects.toEqual(expect.objectContaining<Partial<InsufficientCreditsError>>({
      requiredMicrousd: 100_000,
      availableMicrousd: 60_000,
    }));

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO usage_reservations'),
      expect.anything(),
    );
  });

  it('settles an active reservation exactly once and writes the charge ledger', async () => {
    const client = createClient(async (sql) => {
      if (sql.includes('FROM usage_reservations')) {
        return {
          rows: [{
            id: 'reservation-1',
            user_id: 'user-1',
            pricing_id: 'pricing-1',
            operation_type: 'image_edit',
            provider: 'gemini',
            model: 'gemini-3.1-flash-image',
            reserved_microusd: '100000',
            status: 'active',
            reference_type: null,
            reference_id: null,
            metadata: {},
          }],
        };
      }
      if (sql.includes('FROM credit_accounts WHERE user_id = $1 FOR UPDATE')) {
        return {
          rows: [{
            balance_microusd: '500000',
            reserved_microusd: '100000',
            unlimited: false,
            blocked: false,
          }],
        };
      }
      if (sql.includes('UPDATE credit_accounts')) {
        return {
          rows: [{
            balance_microusd: '400000',
            reserved_microusd: '0',
            unlimited: false,
            blocked: false,
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    mockConnect.mockResolvedValue(client as never);

    const balance = await new CreditService().settle('reservation-1', 67_000);

    expect(balance.availableCredits).toBe(40);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('balance_microusd = balance_microusd - $1'),
      [100_000, 'user-1'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO credit_ledger'),
      expect.arrayContaining(['user-1', -100_000, '400000']),
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('releases reserved balance after a failed operation', async () => {
    const client = createClient(async (sql) => {
      if (sql.includes('FROM usage_reservations')) {
        return {
          rows: [{
            id: 'reservation-1',
            user_id: 'user-1',
            reserved_microusd: '100000',
            status: 'active',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    mockConnect.mockResolvedValue(client as never);

    await new CreditService().release('reservation-1');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('reserved_microusd = reserved_microusd - $1'),
      [100_000, 'user-1'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'released'"),
      ['reservation-1'],
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
