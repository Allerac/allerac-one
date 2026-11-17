#!/usr/bin/env node
// Moves the database to the embedding space configured in the environment
// (EMBEDDING_PROVIDER, model, EMBEDDING_DIMENSIONS, version). Vectors from the
// previous space are cleared, never mixed: source content is kept and the
// vectors are rebuilt by the background sweeps and reindex-local-embeddings.mjs.
//
// Dry run by default. Pass --apply to change the database.
// See docs/operations/embeddings.md for the full procedure.

import pg from 'pg';
import { embeddingConfig, sameSpace, spaceOf } from './embedding-config.mjs';

const { Pool } = pg;
const apply = process.argv.includes('--apply');
const config = embeddingConfig();
const target = spaceOf(config);

// Vector columns without a per-row version; they are cleared on a switch.
const VERSIONLESS_COLUMNS = [
  { table: 'document_chunks', column: 'embedding' },
  { table: 'spotify_tracks', column: 'embedding' },
  { table: 'conversation_segments', column: 'embedding', extra: ', embedding_version = NULL, embedded_at = NULL' },
];
// Derived index rows carry their version; rows from another space are removed.
const VERSIONED_TABLE = { table: 'knowledge_semantic_index', column: 'embedding' };

async function tableExists(client, table) {
  const result = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${table}`]);
  return result.rows[0].exists === true;
}

async function columnType(client, table, column) {
  const result = await client.query(
    `SELECT format_type(a.atttypid, a.atttypmod) AS type
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND a.attname = $2 AND NOT a.attisdropped`,
    [table, column],
  );
  return result.rows[0]?.type ?? null;
}

async function plan(client) {
  const steps = [];
  for (const entry of [...VERSIONLESS_COLUMNS, VERSIONED_TABLE]) {
    if (!(await tableExists(client, entry.table))) continue;
    const type = await columnType(client, entry.table, entry.column);
    if (type !== `vector(${config.dimensions})`) {
      throw new Error(
        `${entry.table}.${entry.column} is ${type ?? 'missing'}, configured dimensions are ${config.dimensions}. `
        + 'Use EMBEDDING_DIMENSIONS that match the database; this script does not change column types.',
      );
    }
    const count = entry === VERSIONED_TABLE
      ? await client.query(
        `SELECT COUNT(*)::int AS n FROM ${entry.table} WHERE embedding_version <> $1`,
        [config.version],
      )
      : await client.query(
        `SELECT COUNT(*)::int AS n FROM ${entry.table} WHERE ${entry.column} IS NOT NULL`,
      );
    steps.push({ ...entry, rows: count.rows[0].n });
  }
  return steps;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Serializes concurrent switches and blocks readers of the state until commit.
  await client.query('LOCK TABLE embedding_runtime_state IN ACCESS EXCLUSIVE MODE');
  const current = (await client.query(
    'SELECT provider, model, dimensions, version FROM embedding_runtime_state WHERE singleton = true',
  )).rows[0] ?? null;

  if (sameSpace(current, config)) {
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ ok: true, changed: false, space: target }));
  } else {
    const steps = await plan(client);
    const summary = {
      from: current,
      to: target,
      clear: steps.map(({ table, rows }) => ({ table, rows })),
    };

    if (!apply) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ ok: true, dryRun: true, ...summary }));
      console.log('Dry run only. Re-run with --apply to switch.');
    } else {
      for (const step of steps) {
        if (step.table === VERSIONED_TABLE.table) {
          await client.query(`DELETE FROM ${step.table} WHERE embedding_version <> $1`, [config.version]);
        } else {
          await client.query(
            `UPDATE ${step.table} SET ${step.column} = NULL${step.extra ?? ''} WHERE ${step.column} IS NOT NULL`,
          );
        }
      }
      await client.query(
        `INSERT INTO embedding_runtime_state (singleton, provider, model, dimensions, version, updated_at)
         VALUES (true, $1, $2, $3, $4, NOW())
         ON CONFLICT (singleton) DO UPDATE SET
           provider = EXCLUDED.provider, model = EXCLUDED.model,
           dimensions = EXCLUDED.dimensions, version = EXCLUDED.version,
           updated_at = EXCLUDED.updated_at`,
        [target.provider, target.model, target.dimensions, target.version],
      );
      await client.query('COMMIT');
      console.log(JSON.stringify({ ok: true, changed: true, ...summary }));
    }
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
