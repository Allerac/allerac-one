import { z } from 'zod';

export const FEDERATION_PROTOCOL_VERSION = '1';

const publicKeySchema = z.object({
  alg: z.string().min(1),
  key: z.string().min(1),
}).strict();

export const federationManifestSchema = z.object({
  allerac: z.literal('federation'),
  protocolVersion: z.string().min(1),
  unit: z.object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/),
    displayName: z.string().min(1).max(100),
    url: z.string().url().nullable(),
  }).strict(),
  software: z.object({
    name: z.literal('allerac-one'),
    release: z.string().min(1),
  }).strict(),
  pairing: z.object({
    accepting: z.boolean(),
  }).strict(),
  capabilities: z.array(z.object({
    id: z.string().regex(/^federation\.[a-z0-9_.]+$/),
    version: z.string().min(1),
  }).strict()),
  // Placeholder until signing keys exist (later phase).
  publicKey: publicKeySchema.nullable(),
  endpoints: z.object({
    api: z.literal('/api/v1'),
  }).strict(),
}).strict();

export type FederationManifest = z.infer<typeof federationManifestSchema>;
