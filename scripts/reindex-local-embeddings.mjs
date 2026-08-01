#!/usr/bin/env node

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const baseUrl = (
  process.env.EMBEDDING_BASE_URL
  || process.env.OLLAMA_BASE_URL
  || 'http://127.0.0.1:11434'
).replace(/\/$/, '');
const model = process.env.EMBEDDING_MODEL || 'embeddinggemma';
const dimensions = Number(process.env.EMBEDDING_DIMENSIONS || 768);
const version = process.env.EMBEDDING_VERSION || `ollama:${model}:v1`;
const batchSize = Number(process.env.EMBEDDING_REINDEX_BATCH_SIZE || 32);

async function embed(texts) {
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: texts,
      keep_alive: process.env.EMBEDDING_KEEP_ALIVE || '10m',
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  if (!Array.isArray(body.embeddings) || body.embeddings.length !== texts.length) {
    throw new Error('Ollama returned an unexpected embedding count');
  }
  for (const vector of body.embeddings) {
    if (vector.length !== dimensions) {
      throw new Error(`Expected ${dimensions} dimensions, received ${vector.length}`);
    }
  }
  return body.embeddings;
}

async function assertRuntimeState() {
  const result = await pool.query(
    'SELECT provider, model, dimensions, version FROM embedding_runtime_state WHERE singleton = true',
  );
  const state = result.rows[0];
  if (!state) throw new Error('embedding_runtime_state is missing; run migration 103 first');
  if (
    state.provider !== 'ollama'
    || state.model !== model
    || Number(state.dimensions) !== dimensions
    || state.version !== version
  ) {
    throw new Error(
      `Runtime state mismatch: database=${JSON.stringify(state)}, configured=${JSON.stringify({
        provider: 'ollama',
        model,
        dimensions,
        version,
      })}`,
    );
  }
}

async function reindexDocumentChunks() {
  let total = 0;
  while (true) {
    const result = await pool.query(
      `SELECT id, content
       FROM document_chunks
       WHERE embedding IS NULL
       ORDER BY id
       LIMIT $1`,
      [batchSize],
    );
    if (result.rows.length === 0) return total;
    const vectors = await embed(result.rows.map((row) => row.content));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < result.rows.length; index += 1) {
        await client.query(
          'UPDATE document_chunks SET embedding = $1::vector WHERE id = $2 AND embedding IS NULL',
          [`[${vectors[index].join(',')}]`, result.rows[index].id],
        );
      }
      await client.query('COMMIT');
      total += result.rows.length;
      console.log(`[Embeddings] document chunks indexed: ${total}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function reindexSpotifyTracks() {
  let total = 0;
  while (true) {
    const result = await pool.query(
      `SELECT id, name, artists, album_name, genres
       FROM spotify_tracks
       WHERE embedding IS NULL
       ORDER BY id
       LIMIT $1`,
      [batchSize],
    );
    if (result.rows.length === 0) return total;
    const texts = result.rows.map((track) => {
      const artists = (track.artists || []).map((artist) => artist.name).join(', ');
      const genres = (track.genres || []).join(', ') || 'unknown';
      return `${track.name} by ${artists} — genres: ${genres} — album: ${track.album_name || 'unknown'}`;
    });
    const vectors = await embed(texts);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < result.rows.length; index += 1) {
        await client.query(
          'UPDATE spotify_tracks SET embedding = $1::vector WHERE id = $2 AND embedding IS NULL',
          [`[${vectors[index].join(',')}]`, result.rows[index].id],
        );
      }
      await client.query('COMMIT');
      total += result.rows.length;
      console.log(`[Embeddings] Spotify tracks indexed: ${total}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

try {
  await assertRuntimeState();
  const documentChunks = await reindexDocumentChunks();
  const spotifyTracks = await reindexSpotifyTracks();
  console.log(JSON.stringify({
    ok: true,
    provider: 'ollama',
    model,
    dimensions,
    version,
    documentChunks,
    spotifyTracks,
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
} finally {
  await pool.end();
}

