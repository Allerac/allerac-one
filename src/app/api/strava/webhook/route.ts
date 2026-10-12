import pool from '@/app/clients/db';
import { StravaSyncService, logicalStravaActivityId } from '@/app/services/strava/strava-sync.service';

function verifyToken() {
  return process.env.STRAVA_WEBHOOK_VERIFY_TOKEN?.trim() ?? '';
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const challenge = params.get('hub.challenge');
  if (!challenge || params.get('hub.mode') !== 'subscribe' || !verifyToken()
      || params.get('hub.verify_token') !== verifyToken()) {
    return Response.json({ error: 'invalid_verification' }, { status: 403 });
  }
  return Response.json({ 'hub.challenge': challenge });
}

async function processEvent(eventId: number, userId: string, event: any) {
  try {
    await pool.query(`UPDATE strava_webhook_events SET status='processing' WHERE id=$1`, [eventId]);
    if (event.object_type === 'activity' && (event.aspect_type === 'create' || event.aspect_type === 'update')) {
      await new StravaSyncService().syncActivity(userId, String(event.object_id));
    } else if (event.object_type === 'activity' && event.aspect_type === 'delete') {
      const activityId = logicalStravaActivityId(event.object_id);
      await pool.query('DELETE FROM health_activities WHERE user_id=$1 AND activity_id=$2 AND provider=$3',
        [userId, activityId, 'strava']);
    } else if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      await pool.query(`UPDATE integration_connections SET is_connected=false,sync_enabled=false,
                        disconnected_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND provider='strava'`, [userId]);
    }
    await pool.query(`UPDATE strava_webhook_events SET status='complete',processed_at=NOW(),last_error=NULL WHERE id=$1`, [eventId]);
  } catch (error) {
    await pool.query(`UPDATE strava_webhook_events SET status='failed',last_error=$2 WHERE id=$1`,
      [eventId, (error instanceof Error ? error.message : String(error)).slice(0, 500)]);
  }
}

export async function POST(request: Request) {
  let event: any;
  try { event = await request.json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!event || !Number.isFinite(event.owner_id) || !Number.isFinite(event.object_id)
      || !Number.isFinite(event.event_time) || !['activity', 'athlete'].includes(event.object_type)
      || !['create', 'update', 'delete'].includes(event.aspect_type)) {
    return Response.json({ error: 'invalid_event' }, { status: 400 });
  }
  const credential = await pool.query('SELECT user_id FROM strava_credentials WHERE athlete_id=$1', [event.owner_id]);
  if (!credential.rows[0]) return Response.json({ received: true });
  const inserted = await pool.query(
    `INSERT INTO strava_webhook_events
     (subscription_id,owner_id,object_type,object_id,aspect_type,event_time,updates)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (subscription_id,owner_id,object_type,object_id,aspect_type,event_time) DO NOTHING
     RETURNING id`,
    [event.subscription_id ?? null, event.owner_id, event.object_type, event.object_id,
     event.aspect_type, event.event_time, JSON.stringify(event.updates ?? {})],
  );
  if (inserted.rows[0]) {
    void processEvent(inserted.rows[0].id, credential.rows[0].user_id, event);
  }
  return Response.json({ received: true });
}
