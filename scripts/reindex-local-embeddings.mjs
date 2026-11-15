#!/usr/bin/env node

import pg from 'pg';
import {
  createEmbedder,
  embeddingConfig,
  resolveOpenAIKey,
  sameSpace,
  spaceOf,
} from './embedding-config.mjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const config = embeddingConfig();
const batchSize = Number(process.env.EMBEDDING_REINDEX_BATCH_SIZE || 32);
const pauseMs = Number(process.env.EMBEDDING_REINDEX_PAUSE_MS || 250);
let embed;

async function yieldToInteractiveWork() {
  if (pauseMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
}

async function assertRuntimeState() {
  const result = await pool.query(
    'SELECT provider, model, dimensions, version FROM embedding_runtime_state WHERE singleton = true',
  );
  const state = result.rows[0];
  if (!state) throw new Error('embedding_runtime_state is missing; run migration 103 first');
  if (!sameSpace(state, config)) {
    throw new Error(
      `Runtime state mismatch: database=${JSON.stringify(state)}, configured=${JSON.stringify(spaceOf(config))}. `
      + 'Run scripts/switch-embedding-space.mjs first.',
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
      await yieldToInteractiveWork();
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
      await yieldToInteractiveWork();
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
  embed = createEmbedder(
    config,
    config.provider === 'openai' ? await resolveOpenAIKey(pool) : null,
  );
  const documentChunks = await reindexDocumentChunks();
  const spotifyTracks = await reindexSpotifyTracks();
  console.log(JSON.stringify({
    ok: true,
    ...spaceOf(config),
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
