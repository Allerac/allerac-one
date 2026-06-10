import { randomUUID } from 'node:crypto';
import pool from '@/app/clients/db';

export const MICROUSD_PER_CREDIT = 10_000;

export interface CreditBalance {
  balanceMicrousd: number;
  reservedMicrousd: number;
  availableMicrousd: number;
  balanceCredits: number;
  availableCredits: number;
  unlimited: boolean;
  blocked: boolean;
}

export interface CreditPlan {
  id: string;
  slug: string;
  name: string;
  monthlyCredits: number;
  imageEdits: number;
  monthlyPriceCents: number;
  currency: string;
  priceIncludesTax: boolean;
}

export interface OperationPricing {
  pricingId: string;
  operationType: string;
  displayName: string;
  provider: string;
  model: string;
  unit: string;
  credits: number;
  providerCost: number | null;
  providerCostCurrency: string;
  active: boolean;
}

export interface CreditReservation {
  id: string;
  reservedMicrousd: number;
  reservedCredits: number;
  providerCostMicrousd: number | null;
  unlimited: boolean;
}

interface ReserveInput {
  userId: string;
  operationType: string;
  provider: string;
  model: string;
  unit: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  ttlSeconds?: number;
}

export class InsufficientCreditsError extends Error {
  constructor(
    readonly requiredMicrousd: number,
    readonly availableMicrousd: number,
  ) {
    super('Insufficient credits');
    this.name = 'InsufficientCreditsError';
  }
}

export class CreditAccountBlockedError extends Error {
  constructor() {
    super('Credit account blocked');
    this.name = 'CreditAccountBlockedError';
  }
}

function toNumber(value: string | number | null | undefined): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number)) throw new Error('Credit value exceeds safe integer range');
  return number;
}

function toCredits(microusd: number): number {
  return microusd / MICROUSD_PER_CREDIT;
}

export class CreditService {
  async listOperationPricing(): Promise<OperationPricing[]> {
    const result = await pool.query(
      `SELECT
         r.operation_type, r.display_name, r.provider, r.model, r.unit,
         r.is_active, p.id AS pricing_id, p.customer_price_microusd,
         p.provider_cost_microusd, p.provider_cost_currency
       FROM operation_routes r
       LEFT JOIN usage_pricing p
         ON p.operation_type = r.operation_type
        AND p.provider = r.provider
        AND p.model = r.model
        AND p.unit = r.unit
        AND p.effective_from <= NOW()
        AND (p.effective_until IS NULL OR p.effective_until > NOW())
       ORDER BY r.operation_type`,
    );
    return result.rows.map(row => this.mapOperationPricing(row));
  }

  async getOperationPricing(operationType: string): Promise<OperationPricing> {
    const result = await pool.query(
      `SELECT
         r.operation_type, r.display_name, r.provider, r.model, r.unit,
         r.is_active, p.id AS pricing_id, p.customer_price_microusd,
         p.provider_cost_microusd, p.provider_cost_currency
       FROM operation_routes r
       JOIN usage_pricing p
         ON p.operation_type = r.operation_type
        AND p.provider = r.provider
        AND p.model = r.model
        AND p.unit = r.unit
        AND p.effective_from <= NOW()
        AND (p.effective_until IS NULL OR p.effective_until > NOW())
       WHERE r.operation_type = $1 AND r.is_active = true
       LIMIT 1`,
      [operationType],
    );
    if (!result.rows[0]) throw new Error('Active operation pricing not configured');
    return this.mapOperationPricing(result.rows[0]);
  }

  async updateOperationPricing(input: {
    operationType: string;
    provider: string;
    model: string;
    unit: string;
    credits: number;
    providerCost: number | null;
    providerCostCurrency: string;
    adminUserId: string;
  }): Promise<OperationPricing> {
    if (!Number.isFinite(input.credits) || input.credits < 0 || input.credits > 1_000_000) {
      throw new Error('Invalid operation credit price');
    }
    if (
      input.providerCost !== null
      && (!Number.isFinite(input.providerCost) || input.providerCost < 0 || input.providerCost > 10_000)
    ) {
      throw new Error('Invalid provider cost');
    }
    const customerPriceMicrousd = Math.round(input.credits * MICROUSD_PER_CREDIT);
    const providerCostMicrousd = input.providerCost === null
      ? null
      : Math.round(input.providerCost * 1_000_000);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const routeResult = await client.query(
        `SELECT display_name FROM operation_routes
         WHERE operation_type = $1 FOR UPDATE`,
        [input.operationType],
      );
      if (!routeResult.rows[0]) throw new Error('Operation route not found');

      await client.query(
        `UPDATE usage_pricing
         SET effective_until = NOW()
         WHERE operation_type = $1 AND effective_until IS NULL`,
        [input.operationType],
      );
      const pricingResult = await client.query(
        `INSERT INTO usage_pricing (
           operation_type, provider, model, unit,
           customer_price_microusd, provider_cost_microusd,
           provider_cost_currency, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          input.operationType,
          input.provider,
          input.model,
          input.unit,
          customerPriceMicrousd,
          providerCostMicrousd,
          input.providerCostCurrency,
          { changed_by: input.adminUserId },
        ],
      );
      await client.query(
        `UPDATE operation_routes
         SET provider = $1, model = $2, unit = $3, updated_at = NOW()
         WHERE operation_type = $4`,
        [input.provider, input.model, input.unit, input.operationType],
      );
      await client.query('COMMIT');
      return {
        pricingId: pricingResult.rows[0].id,
        operationType: input.operationType,
        displayName: routeResult.rows[0].display_name,
        provider: input.provider,
        model: input.model,
        unit: input.unit,
        credits: input.credits,
        providerCost: input.providerCost,
        providerCostCurrency: input.providerCostCurrency,
        active: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listPlans(): Promise<CreditPlan[]> {
    const result = await pool.query(
      `SELECT id, slug, name, monthly_credits, image_edits, monthly_price_cents,
              currency, price_includes_tax
       FROM credit_plans
       WHERE is_active = true
       ORDER BY sort_order ASC, monthly_credits ASC`,
    );
    return result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      monthlyCredits: toNumber(row.monthly_credits),
      imageEdits: toNumber(row.image_edits),
      monthlyPriceCents: toNumber(row.monthly_price_cents),
      currency: row.currency,
      priceIncludesTax: Boolean(row.price_includes_tax),
    }));
  }

  async getBalance(userId: string): Promise<CreditBalance> {
    const result = await pool.query(
      `INSERT INTO credit_accounts (
         user_id, balance_microusd, unlimited, plan_id,
         period_started_at, period_ends_at
       )
       SELECT
         u.id, p.monthly_credits::BIGINT * $2, false, p.id,
         NOW(), NOW() + INTERVAL '1 month'
       FROM users u
       JOIN credit_plans p ON p.slug = CASE WHEN u.is_admin THEN 'pro' ELSE 'free' END
       WHERE u.id = $1
       ON CONFLICT (user_id) DO UPDATE SET updated_at = credit_accounts.updated_at
       RETURNING balance_microusd, reserved_microusd, unlimited, blocked`,
      [userId, MICROUSD_PER_CREDIT],
    );
    if (!result.rows[0]) throw new Error('User not found');
    return this.mapBalance(result.rows[0]);
  }

  async reserve(input: ReserveInput): Promise<CreditReservation> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO credit_accounts (
           user_id, balance_microusd, unlimited, plan_id,
           period_started_at, period_ends_at
         )
         SELECT
           u.id, p.monthly_credits::BIGINT * $2, false, p.id,
           NOW(), NOW() + INTERVAL '1 month'
         FROM users u
         JOIN credit_plans p ON p.slug = CASE WHEN u.is_admin THEN 'pro' ELSE 'free' END
         WHERE u.id = $1
         ON CONFLICT (user_id) DO NOTHING`,
        [input.userId, MICROUSD_PER_CREDIT],
      );

      const accountResult = await client.query(
        `SELECT balance_microusd, reserved_microusd, unlimited, blocked
         FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
        [input.userId],
      );
      if (!accountResult.rows[0]) throw new Error('User not found');
      const expiredResult = await client.query(
        `UPDATE usage_reservations
         SET status = 'expired', settled_at = NOW()
         WHERE user_id = $1 AND status = 'active' AND expires_at <= NOW()
         RETURNING reserved_microusd`,
        [input.userId],
      );
      const expiredMicrousd = expiredResult.rows.reduce(
        (total, row) => total + toNumber(row.reserved_microusd),
        0,
      );
      if (expiredMicrousd > 0) {
        await client.query(
          `UPDATE credit_accounts
           SET reserved_microusd = GREATEST(0, reserved_microusd - $1), updated_at = NOW()
           WHERE user_id = $2`,
          [expiredMicrousd, input.userId],
        );
        accountResult.rows[0].reserved_microusd = Math.max(
          0,
          toNumber(accountResult.rows[0].reserved_microusd) - expiredMicrousd,
        );
      }
      const account = this.mapBalance(accountResult.rows[0]);
      if (account.blocked) throw new CreditAccountBlockedError();

      const pricingResult = await client.query(
        `SELECT id, customer_price_microusd, provider_cost_microusd
         FROM usage_pricing
         WHERE operation_type = $1
           AND provider = $2
           AND model = $3
           AND unit = $4
           AND effective_from <= NOW()
           AND (effective_until IS NULL OR effective_until > NOW())
         ORDER BY effective_from DESC
         LIMIT 1`,
        [input.operationType, input.provider, input.model, input.unit],
      );
      if (!pricingResult.rows[0]) throw new Error('Usage pricing not configured');

      const pricingId = pricingResult.rows[0].id as string;
      const providerCostMicrousd = pricingResult.rows[0].provider_cost_microusd == null
        ? null
        : toNumber(pricingResult.rows[0].provider_cost_microusd);
      const requestedMicrousd = account.unlimited
        ? 0
        : toNumber(pricingResult.rows[0].customer_price_microusd);
      if (!account.unlimited && account.availableMicrousd < requestedMicrousd) {
        throw new InsufficientCreditsError(requestedMicrousd, account.availableMicrousd);
      }

      const reservationId = randomUUID();
      const idempotencyKey = input.idempotencyKey ?? randomUUID();
      if (requestedMicrousd > 0) {
        await client.query(
          `UPDATE credit_accounts
           SET reserved_microusd = reserved_microusd + $1, updated_at = NOW()
           WHERE user_id = $2`,
          [requestedMicrousd, input.userId],
        );
      }
      await client.query(
        `INSERT INTO usage_reservations (
           id, user_id, pricing_id, operation_type, provider, model,
           reserved_microusd, idempotency_key, reference_type, reference_id,
           metadata, expires_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           NOW() + ($12 * INTERVAL '1 second')
         )`,
        [
          reservationId,
          input.userId,
          pricingId,
          input.operationType,
          input.provider,
          input.model,
          requestedMicrousd,
          idempotencyKey,
          input.referenceType ?? null,
          input.referenceId ?? null,
          input.metadata ?? {},
          input.ttlSeconds ?? 600,
        ],
      );
      await client.query('COMMIT');
      return {
        id: reservationId,
        reservedMicrousd: requestedMicrousd,
        reservedCredits: toCredits(requestedMicrousd),
        providerCostMicrousd,
        unlimited: account.unlimited,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async settle(
    reservationId: string,
    providerCostMicrousd: number | null = null,
  ): Promise<CreditBalance> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reservationResult = await client.query(
        `SELECT * FROM usage_reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
      );
      const reservation = reservationResult.rows[0];
      if (!reservation) throw new Error('Credit reservation not found');

      const accountResult = await client.query(
        `SELECT balance_microusd, reserved_microusd, unlimited, blocked
         FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
        [reservation.user_id],
      );
      if (!accountResult.rows[0]) throw new Error('Credit account not found');
      if (reservation.status !== 'active') {
        await client.query('COMMIT');
        return this.mapBalance(accountResult.rows[0]);
      }

      const reservedMicrousd = toNumber(reservation.reserved_microusd);
      const updatedResult = await client.query(
        `UPDATE credit_accounts
         SET balance_microusd = balance_microusd - $1,
             reserved_microusd = reserved_microusd - $1,
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING balance_microusd, reserved_microusd, unlimited, blocked`,
        [reservedMicrousd, reservation.user_id],
      );
      await client.query(
        `UPDATE usage_reservations
         SET status = 'settled', settled_at = NOW()
         WHERE id = $1`,
        [reservationId],
      );
      await client.query(
        `INSERT INTO credit_ledger (
           user_id, entry_type, amount_microusd, balance_after_microusd,
           operation_type, provider, model, credential_source,
           provider_cost_microusd, pricing_id, reservation_id,
           reference_type, reference_id, idempotency_key, metadata
         ) VALUES (
           $1, 'charge', $2, $3, $4, $5, $6, 'system',
           $7, $8, $9, $10, $11, $12, $13
         )`,
        [
          reservation.user_id,
          -reservedMicrousd,
          updatedResult.rows[0].balance_microusd,
          reservation.operation_type,
          reservation.provider,
          reservation.model,
          providerCostMicrousd,
          reservation.pricing_id,
          reservation.id,
          reservation.reference_type,
          reservation.reference_id,
          `settle:${reservation.id}`,
          reservation.metadata,
        ],
      );
      await client.query('COMMIT');
      return this.mapBalance(updatedResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async release(reservationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reservationResult = await client.query(
        `SELECT * FROM usage_reservations WHERE id = $1 FOR UPDATE`,
        [reservationId],
      );
      const reservation = reservationResult.rows[0];
      if (!reservation || reservation.status !== 'active') {
        await client.query('COMMIT');
        return;
      }

      const reservedMicrousd = toNumber(reservation.reserved_microusd);
      if (reservedMicrousd > 0) {
        await client.query(
          `UPDATE credit_accounts
           SET reserved_microusd = reserved_microusd - $1, updated_at = NOW()
           WHERE user_id = $2`,
          [reservedMicrousd, reservation.user_id],
        );
      }
      await client.query(
        `UPDATE usage_reservations
         SET status = 'released', settled_at = NOW()
         WHERE id = $1`,
        [reservationId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async adjustBalance(
    userId: string,
    credits: number,
    adminUserId: string,
    reason: string,
  ): Promise<CreditBalance> {
    if (!Number.isFinite(credits) || credits === 0 || Math.abs(credits) > 1_000_000) {
      throw new Error('Invalid credit adjustment');
    }
    const amountMicrousd = Math.round(credits * MICROUSD_PER_CREDIT);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO credit_accounts (
           user_id, balance_microusd, unlimited, plan_id,
           period_started_at, period_ends_at
         )
         SELECT
           u.id, p.monthly_credits::BIGINT * $2, false, p.id,
           NOW(), NOW() + INTERVAL '1 month'
         FROM users u
         JOIN credit_plans p ON p.slug = CASE WHEN u.is_admin THEN 'pro' ELSE 'free' END
         WHERE u.id = $1
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, MICROUSD_PER_CREDIT],
      );
      const accountResult = await client.query(
        `SELECT balance_microusd, reserved_microusd, unlimited, blocked
         FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (!accountResult.rows[0]) throw new Error('User not found');
      const current = this.mapBalance(accountResult.rows[0]);
      const nextBalance = current.balanceMicrousd + amountMicrousd;
      if (nextBalance < current.reservedMicrousd || nextBalance < 0) {
        throw new Error('Credit adjustment would make the balance negative');
      }

      const updatedResult = await client.query(
        `UPDATE credit_accounts
         SET balance_microusd = $1, updated_at = NOW()
         WHERE user_id = $2
         RETURNING balance_microusd, reserved_microusd, unlimited, blocked`,
        [nextBalance, userId],
      );
      await client.query(
        `INSERT INTO credit_ledger (
           user_id, entry_type, amount_microusd, balance_after_microusd,
           idempotency_key, metadata, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          amountMicrousd > 0 ? 'manual_grant' : 'manual_deduction',
          amountMicrousd,
          nextBalance,
          `admin-adjustment:${randomUUID()}`,
          { reason: reason.trim().slice(0, 500) },
          adminUserId,
        ],
      );
      await client.query('COMMIT');
      return this.mapBalance(updatedResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setUnlimited(userId: string, unlimited: boolean): Promise<CreditBalance> {
    const result = await pool.query(
      `INSERT INTO credit_accounts (user_id, unlimited)
       SELECT id, $2 FROM users WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE
       SET unlimited = EXCLUDED.unlimited, updated_at = NOW()
       RETURNING balance_microusd, reserved_microusd, unlimited, blocked`,
      [userId, unlimited],
    );
    if (!result.rows[0]) throw new Error('User not found');
    return this.mapBalance(result.rows[0]);
  }

  async assignPlan(
    userId: string,
    planSlug: string,
    adminUserId: string,
  ): Promise<CreditBalance> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const planResult = await client.query(
        `SELECT id, slug, name, monthly_credits
         FROM credit_plans
         WHERE slug = $1 AND is_active = true
         FOR UPDATE`,
        [planSlug],
      );
      const plan = planResult.rows[0];
      if (!plan) throw new Error('Credit plan not found');

      await client.query(
        `INSERT INTO credit_accounts (
           user_id, balance_microusd, unlimited, plan_id,
           period_started_at, period_ends_at
         )
         SELECT id, 0, false, $2, NOW(), NOW() + INTERVAL '1 month'
         FROM users WHERE id = $1
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, plan.id],
      );
      const accountResult = await client.query(
        `SELECT balance_microusd, reserved_microusd, unlimited, blocked
         FROM credit_accounts WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (!accountResult.rows[0]) throw new Error('User not found');

      const currentBalance = toNumber(accountResult.rows[0].balance_microusd);
      const reserved = toNumber(accountResult.rows[0].reserved_microusd);
      const planBalance = toNumber(plan.monthly_credits) * MICROUSD_PER_CREDIT;
      const nextBalance = Math.max(reserved, planBalance);
      const updatedResult = await client.query(
        `UPDATE credit_accounts
         SET plan_id = $1,
             balance_microusd = $2,
             unlimited = false,
             period_started_at = NOW(),
             period_ends_at = NOW() + INTERVAL '1 month',
             updated_at = NOW()
         WHERE user_id = $3
         RETURNING balance_microusd, reserved_microusd, unlimited, blocked`,
        [plan.id, nextBalance, userId],
      );
      await client.query(
        `INSERT INTO credit_ledger (
           user_id, entry_type, amount_microusd, balance_after_microusd,
           plan_id, idempotency_key, metadata, created_by
         ) VALUES ($1, 'adjustment', $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          nextBalance - currentBalance,
          nextBalance,
          plan.id,
          `plan-assignment:${randomUUID()}`,
          { reason: 'plan_assignment', plan_slug: plan.slug, plan_name: plan.name },
          adminUserId,
        ],
      );
      await client.query('COMMIT');
      return this.mapBalance(updatedResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private mapBalance(row: Record<string, unknown>): CreditBalance {
    const balanceMicrousd = toNumber(row.balance_microusd as string | number);
    const reservedMicrousd = toNumber(row.reserved_microusd as string | number);
    const unlimited = Boolean(row.unlimited);
    return {
      balanceMicrousd,
      reservedMicrousd,
      availableMicrousd: unlimited ? Number.MAX_SAFE_INTEGER : balanceMicrousd - reservedMicrousd,
      balanceCredits: toCredits(balanceMicrousd),
      availableCredits: unlimited ? Number.POSITIVE_INFINITY : toCredits(balanceMicrousd - reservedMicrousd),
      unlimited,
      blocked: Boolean(row.blocked),
    };
  }

  private mapOperationPricing(row: Record<string, unknown>): OperationPricing {
    const providerCostMicrousd = row.provider_cost_microusd == null
      ? null
      : toNumber(row.provider_cost_microusd as string | number);
    return {
      pricingId: String(row.pricing_id ?? ''),
      operationType: String(row.operation_type),
      displayName: String(row.display_name),
      provider: String(row.provider),
      model: String(row.model),
      unit: String(row.unit),
      credits: toCredits(toNumber(row.customer_price_microusd as string | number)),
      providerCost: providerCostMicrousd === null ? null : providerCostMicrousd / 1_000_000,
      providerCostCurrency: String(row.provider_cost_currency ?? 'EUR'),
      active: Boolean(row.is_active),
    };
  }
}
