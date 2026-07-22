// Computes a per-user "taste vector" from listening history embeddings and
// scores candidate tracks against it via pgvector cosine distance. This is
// the content half of the hybrid recommender: the listening-pattern half is
// expressed through the recency/frequency weights applied when building the
// taste vector (see buildTasteVector), not a separate model.

import pool from '@/app/clients/db';

const EMBEDDING_DIMENSION = 1536;
const CANDIDATE_POOL_SIZE = 150;
const RECOMMENDATION_COUNT = 30;

function parseVector(value: string | number[]): number[] {
  if (Array.isArray(value)) return value;
  return JSON.parse(value);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface HistoryRow {
  track_id: string;
  name: string;
  artists: Array<{ id: string; name: string }>;
  embedding: string;
  weight: number;
}

async function loadWeightedHistory(userId: string): Promise<HistoryRow[]> {
  const res = await pool.query(
    `SELECT
       lh.track_id,
       st.name,
       st.artists,
       st.embedding,
       CASE lh.source
         WHEN 'recently_played' THEN GREATEST(0.2, 1.0 - EXTRACT(EPOCH FROM (NOW() - lh.played_at)) / (86400.0 * 30))
         WHEN 'top_short'  THEN 1.4 * (1.0 - LEAST(COALESCE(lh.rank, 25), 50) / 50.0)
         WHEN 'top_medium' THEN 1.0 * (1.0 - LEAST(COALESCE(lh.rank, 25), 50) / 50.0)
         WHEN 'top_long'   THEN 0.7 * (1.0 - LEAST(COALESCE(lh.rank, 25), 50) / 50.0)
         ELSE 0.5
       END AS weight
     FROM spotify_listening_history lh
     JOIN spotify_tracks st ON st.id = lh.track_id
     WHERE lh.user_id = $1 AND st.embedding IS NOT NULL`,
    [userId],
  );
  return res.rows.map((r) => ({ ...r, weight: Number(r.weight) || 0.1 }));
}

function buildTasteVector(rows: HistoryRow[]): number[] | null {
  if (rows.length === 0) return null;
  const sum = new Array(EMBEDDING_DIMENSION).fill(0);
  let totalWeight = 0;
  for (const row of rows) {
    const vec = parseVector(row.embedding);
    const weight = Math.max(row.weight, 0.05);
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) sum[i] += vec[i] * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return null;
  return sum.map((v) => v / totalWeight);
}

export async function generateRecommendations(userId: string): Promise<number> {
  const history = await loadWeightedHistory(userId);
  const tasteVector = buildTasteVector(history);
  if (!tasteVector) return 0;

  const excludeIds = [...new Set(history.map((r) => r.track_id))];
  const queryEmbedding = `[${tasteVector.join(',')}]`;

  const candidates = await pool.query<{ track_id: string; distance: number }>(
    'SELECT * FROM search_similar_tracks($1, $2, $3)',
    [queryEmbedding, excludeIds, CANDIDATE_POOL_SIZE],
  );
  if (candidates.rows.length === 0) return 0;

  const candidateIds = candidates.rows.map((r) => r.track_id);
  const candidateTracksRes = await pool.query<{ id: string; name: string; artists: Array<{ name: string }>; embedding: string }>(
    `SELECT id, name, artists, embedding FROM spotify_tracks WHERE id = ANY($1)`,
    [candidateIds],
  );
  const candidateTrackById = new Map(candidateTracksRes.rows.map((t) => [t.id, t]));
  const distanceById = new Map(candidates.rows.map((r) => [r.track_id, r.distance]));

  // For each candidate, find the closest track in the user's own history to
  // use as a human-readable "because you listen to X" reason.
  const scored = candidateIds
    .map((id) => {
      const track = candidateTrackById.get(id);
      if (!track) return null;
      const distance = distanceById.get(id) ?? 1;
      const score = Math.max(0, 1 - distance);

      let closestName = '';
      let closestSim = -Infinity;
      const candidateVec = parseVector(track.embedding);
      for (const h of history) {
        const sim = cosineSimilarity(candidateVec, parseVector(h.embedding));
        if (sim > closestSim) {
          closestSim = sim;
          closestName = h.artists?.[0]?.name ? `${h.name} — ${h.artists[0].name}` : h.name;
        }
      }

      return {
        trackId: id,
        score,
        reason: closestName ? `Because you listen to ${closestName}` : 'Based on your recent listening',
      };
    })
    .filter((r): r is { trackId: string; score: number; reason: string } => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, RECOMMENDATION_COUNT);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM spotify_recommendations WHERE user_id = $1', [userId]);
    for (const rec of scored) {
      await client.query(
        `INSERT INTO spotify_recommendations (user_id, track_id, score, reason, generated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, track_id) DO UPDATE SET
           score = EXCLUDED.score, reason = EXCLUDED.reason, generated_at = NOW()`,
        [userId, rec.trackId, rec.score, rec.reason],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return scored.length;
}
