import { z } from 'zod';
import pool from '@/app/clients/db';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import { encrypt } from '@/app/services/crypto/encryption.service';
import { queryProtectedLocations } from '@/app/services/health/health-query.service';

const bodySchema = z.object({
  label: z.string().trim().min(1).max(200).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusMeters: z.number().positive().max(50000),
});

// Coordinates are encrypted at rest — a user-level privacy setting, not
// activity-scoped (docs/roadmap/health-detailed-activities.md's privacy
// section). Backs redaction on GET .../activities/{id}/route and /series.
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:read', request);
    const locations = await queryProtectedLocations(user.id);
    return apiData({ locations });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/health/protected-locations failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('health:write', request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid protected location', 400, parsed.error.flatten());
    }
    const { label, lat, lng, radiusMeters } = parsed.data;

    const locationEncrypted = encrypt(JSON.stringify({ lat, lng }));
    const res = await pool.query(
      `INSERT INTO health_protected_locations (user_id, label, location_encrypted, radius_meters)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [user.id, label ?? null, locationEncrypted, radiusMeters],
    );

    return apiData(
      { location: { id: res.rows[0].id, label: label ?? null, lat, lng, radiusMeters } },
      { status: 201 },
    );
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/health/protected-locations failed', error);
  }
}
