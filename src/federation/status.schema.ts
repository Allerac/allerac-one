/**
 * Control Tower status payload (federation P4d), shared by the peer that
 * serves it and the home that stores it.
 *
 * Metadata only. Every object is strict: an unexpected key fails validation
 * on both sides, so content (prompts, answers, titles, users) cannot slip in
 * by spreading a row. Bump STATUS_VERSION for any shape change.
 */
import { z } from 'zod';

export const STATUS_VERSION = 1;
export const STATUS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const STATUS_MAX_ROWS = 100;

const iso = z.string().max(40);
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const code = z.string().max(64).regex(/^[a-z0-9_.:-]+$/i);
const count = z.number().int().nonnegative();
const outcome = z.enum(['ok', 'denied', 'error']);
const direction = z.enum(['inbound', 'outbound']);

export const statusUnitSchema = z.object({
  name: slug,
  display_name: z.string().max(100).nullable(),
  emoji: z.string().max(16).nullable(),
  role: z.string().max(200).nullable(),
  app_version: z.string().max(64).nullable(),
  commit: z.string().max(64).nullable(),
}).strict();

export const statusRunSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  started_at: iso.nullable(),
  duration_ms: count.nullable(),
  tokens: count.nullable(),
  requested_by: z.enum(['local', 'unit']),
}).strict();

export const statusAskSchema = z.object({
  at: iso,
  direction,
  peer: slug.nullable(),
  agent: slug.nullable(),
  outcome,
  http_status: z.number().int().nullable(),
  duration_ms: count.nullable(),
  error_code: code.nullable(),
}).strict();

export const statusEventSchema = z.object({
  at: iso,
  direction,
  peer: slug.nullable(),
  capability: code,
  outcome,
  http_status: z.number().int().nullable(),
  error_code: code.nullable(),
}).strict();

export const statusAgentSchema = z.object({
  slug,
  asks_24h: count,
  failures_24h: count,
  last_ask_at: iso.nullable(),
}).strict();

export const federationStatusSchema = z.object({
  version: z.literal(STATUS_VERSION),
  generated_at: iso,
  unit: statusUnitSchema,
  load: z.object({
    runs_running: count,
    runs_queued: count,
    async_asks_running: count,
    async_max_running: count,
  }).strict(),
  agents: z.array(statusAgentSchema).max(STATUS_MAX_ROWS),
  runs: z.array(statusRunSchema).max(STATUS_MAX_ROWS),
  federated_asks: z.array(statusAskSchema).max(STATUS_MAX_ROWS),
  federation_events: z.array(statusEventSchema).max(STATUS_MAX_ROWS),
  /** Capabilities the calling key holds, so the home learns new grants (P4d). */
  granted_capabilities: z.array(code).max(20),
  truncated: z.boolean(),
}).strict();

export type FederationStatus = z.infer<typeof federationStatusSchema>;
export type StatusRun = z.infer<typeof statusRunSchema>;
export type StatusAsk = z.infer<typeof statusAskSchema>;
export type StatusEvent = z.infer<typeof statusEventSchema>;
