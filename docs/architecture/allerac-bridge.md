# Allerac Bridge

## Proposal status

- **Status:** Draft
- **Type:** Product and architecture proposal
- **Scope:** Delegated access to third-party services
- **Initial connectors:** Spotify and Garmin

## Summary

Allerac Bridge is a private capability gateway that lets a user authorize their
own agents and applications to interact with connected services without
revealing the underlying service credentials.

```text
User-owned agent
      |
      | Allerac API credential
      v
Allerac Bridge
      |
      | OAuth/session credentials held by Allerac
      v
Spotify, Garmin, and other services
```

The Bridge is not a transparent network tunnel and not an unrestricted HTTP
proxy. It exposes a finite set of typed, authorized, and auditable
capabilities, such as:

```text
spotify.get_recently_played
spotify.create_playlist
garmin.get_activities
garmin.correct_exercise_sets
```

The external agent receives an Allerac credential. It never receives the
Spotify access token, Garmin session, password, refresh token, or other
connector secret.

## Product statement

> Allerac Bridge connects your agents to your services without sharing your
> credentials.

The Bridge turns Allerac's existing integrations into reusable private
infrastructure. A user may continue using the Allerac interface, while also
granting limited access to another agent, automation, mobile application, or
personal tool.

## Problem

Agents often need access to services that require OAuth, MFA, refresh tokens,
session renewal, provider-specific APIs, and secure credential storage.
Implementing these concerns independently in every agent creates several
problems:

- credentials are copied into multiple tools;
- broad provider tokens are exposed to agents;
- revoking one agent may require disconnecting the underlying service;
- every integration implements authentication and refresh differently;
- users cannot easily see which agent performed an operation;
- personal data may be retained unintentionally in databases, caches, logs,
  queues, or agent memory;
- unofficial integrations, such as the current Garmin connector, require
  specialized lifecycle and compatibility handling.

## Goals

Allerac Bridge should:

- keep provider credentials inside Allerac;
- expose only explicit connector capabilities;
- support read-only and write access independently;
- allow one connected account to be delegated to multiple agents;
- make each agent independently revocable;
- support short-lived and long-lived authorizations;
- avoid retaining provider data when operating in proxy mode;
- provide a consistent API over different providers;
- record security-relevant operations without recording personal payloads;
- remain useful in both self-hosted and future multi-tenant deployments;
- publish machine-readable contracts for external agents.

## Non-goals

The initial Bridge should not:

- forward arbitrary URLs, headers, or HTTP methods;
- expose raw provider access or refresh tokens;
- act as a VPN, SOCKS proxy, or general network tunnel;
- allow agents to discover capabilities not granted by the user;
- promise perfect normalization across providers;
- silently enable historical storage;
- treat logs, conversations, caches, or queues as exempt from the selected
  privacy policy.

## Core concepts

### Connection

A connection belongs to a user and represents an authenticated relationship
with a provider.

Examples:

- one Spotify account connected through OAuth;
- one Garmin Connect account authenticated through the health worker.

The connection owns the encrypted provider credentials. Agents never receive
those credentials.

### Connector

A connector implements a bounded set of provider operations. Each operation
declares:

- its capability name;
- whether it reads or changes provider state;
- required Allerac scopes;
- accepted parameters and response schema;
- applicable data modes;
- rate-limit and retry behavior;
- whether it may expose sensitive personal data.

### Agent grant

An agent grant authorizes one external client to use selected capabilities
against selected connections.

A grant should include:

- owner user or tenant;
- human-readable agent name;
- allowed connectors and capabilities;
- read/write scopes;
- creation and expiration timestamps;
- last-used timestamp;
- revocation timestamp;
- optional IP or audience restrictions;
- optional per-period operation limits.

Revoking an agent grant must not disconnect the user's Spotify or Garmin
account.

### Data mode

Every connection has an explicit data-handling mode.

| Mode | Credentials | Provider data | Typical use |
|---|---|---|---|
| `proxy` | Encrypted and persisted | Not persisted | Default private gateway |
| `cached` | Encrypted and persisted | Persisted according to retention policy | History, trends, recommendations |
| `ephemeral` | Memory/session only | Not persisted | Maximum privacy, temporary access |

`proxy` is the proposed default for new connections. Existing installations
must not be silently migrated from cached behavior; users should be shown the
current behavior and asked to choose.

#### Proxy mode

In proxy mode:

- provider responses are returned directly to the caller;
- response bodies are not written to application tables;
- responses use `Cache-Control: no-store`;
- payloads are excluded from logs and analytics;
- provider data is not added to memory, RAG, embeddings, or conversation
  summaries;
- retry queues contain operation metadata, not response payloads;
- temporary in-process data is released after the request;
- credentials may persist, encrypted, to keep the connection usable.

#### Cached mode

Cached mode enables features that require history or aggregation. It requires:

- explicit consent;
- a documented retention period;
- deletion and export controls;
- clear identification of affected features and tables;
- tenant and user isolation;
- background-job compliance with deletion requests.

#### Ephemeral mode

Ephemeral mode retains neither credentials nor provider data after the session
expires. It may require repeated login or MFA and may not support background
jobs.

## Authorization model

The Bridge separates three identities:

```text
User or tenant  -> owns the connection
Agent           -> receives a limited grant
Provider        -> authenticates the connection
```

An Allerac API key or future OAuth client represents the agent. Provider
credentials remain an implementation detail of the connector.

Example scopes:

```text
bridge:connections:read
music:read
music:write
health:read
health:write
```

Scopes alone are not sufficient. Authorization must also verify:

- the grant belongs to the connection owner;
- the capability is included in the grant;
- the grant is active and unexpired;
- the connection is active;
- the operation is compatible with the connection's data mode;
- tenant and user context match every referenced resource.

## Proposed API

The preferred public API exposes provider-specific, typed operations rather
than a generic forwarding endpoint.

Examples:

```http
GET /api/v1/bridge/connections
GET /api/v1/bridge/spotify/recently-played
POST /api/v1/bridge/spotify/playlists
GET /api/v1/bridge/garmin/activities
PUT /api/v1/bridge/garmin/activities/{id}/exercise-sets
```

The existing domain APIs may internally reuse the same connector services.
The Bridge namespace exists to make delegated access, privacy behavior, and
auditing explicit.

Every Bridge response should include safe operational metadata:

```json
{
  "data": {},
  "meta": {
    "connector": "spotify",
    "operation": "spotify.get_recently_played",
    "dataMode": "proxy",
    "stored": false,
    "requestId": "..."
  }
}
```

The API must not return provider credentials or connector session dumps.

## Agent integration

Allerac Bridge should be easy to consume without requiring an agent to modify
the Allerac repository.

The supported integration package should include:

- an OpenAPI contract;
- scoped API-key creation;
- curl and TypeScript examples;
- a portable agent skill;
- connector capability discovery;
- clear confirmation requirements for write operations;
- error responses that distinguish authorization, provider, rate-limit, and
  connection failures.

A user who wants to customize or self-host the Bridge may provide the Allerac
repository to their coding agent. A user who only wants service access should
need only the published Bridge contract and a restricted credential.

## Proposed data model

Illustrative tables:

```text
integration_connections
  id
  tenant_id
  user_id
  provider
  display_name
  data_mode
  retention_days
  memory_allowed
  is_connected
  created_at
  disconnected_at

integration_credentials
  connection_id
  credential_type
  encrypted_value
  expires_at
  updated_at

bridge_agent_grants
  id
  tenant_id
  user_id
  agent_name
  token_hash
  scopes
  capabilities
  connection_ids
  expires_at
  last_used_at
  revoked_at

bridge_audit_events
  id
  tenant_id
  user_id
  grant_id
  connection_id
  capability
  outcome
  request_id
  occurred_at
```

`bridge_audit_events` must not store provider response bodies, health values,
listening history, prompts, or arbitrary request payloads. Parameters should be
omitted, redacted, or reduced to safe classifications.

Existing Spotify and Garmin credential tables can remain during the first
phase. A migration to a common connection model should happen only after the
connector abstraction is stable.

## Privacy requirements

Data-mode enforcement must cover all persistence paths:

- relational tables;
- Redis and application caches;
- background queues and dead-letter records;
- logs and exception reporting;
- metrics and traces;
- chat messages;
- agent-run prompts and results;
- conversation memory and summaries;
- RAG documents and embeddings;
- backups;
- temporary files and exports.

The implementation must fail closed. If a component cannot determine the
connection's data mode, it must not persist provider data.

Provider data included by a user in a conversation is a separate persistence
decision from connector caching. The UI and API must explain this distinction.

## Security requirements

- Encrypt persisted provider credentials at rest.
- Never expose credentials to the delegated agent.
- Use hashed Allerac API credentials.
- Require explicit write scopes for state-changing capabilities.
- Require confirmation policies for sensitive write operations.
- Apply per-user, per-agent, and per-provider rate limits.
- Prevent arbitrary target URLs and request headers.
- Validate all provider identifiers used in paths.
- Redact provider payloads and credentials from errors.
- Support immediate grant revocation and connection disconnection.
- Record the effective actor, owner, connector, operation, and outcome.
- Include tenant context in jobs, cache keys, audit records, and database
  queries before enabling multi-tenant hosting.

## Connector considerations

### Spotify

Spotify is a strong first Bridge connector because it uses official OAuth and
supports well-defined scopes. Many read operations work naturally in proxy
mode. Playlist creation and modification require explicit write grants.

### Garmin

Garmin is feasible but carries additional operational risk:

- the current integration uses internal Garmin Connect endpoints;
- authentication and session formats may change;
- MFA and residential-IP constraints affect availability;
- operations must be allowlisted and tested individually;
- the Bridge must communicate that it is not an official Garmin integration.

Garmin health data is especially sensitive. Proxy mode should be the default,
and health payloads must never appear in audit logs.

## User experience

Each integration settings screen should display:

- connected account;
- current data mode;
- what is stored in that mode;
- retention period, when applicable;
- features disabled by the selected mode;
- connected agents and their grants;
- last access and recent safe audit events;
- buttons to revoke an agent, clear cached data, or disconnect.

Creating a grant should follow:

1. Name the agent.
2. Select connections.
3. Select read/write capabilities.
4. Choose an expiration.
5. Review sensitive operations.
6. Generate the credential once.

## Operational behavior

- Read calls may use bounded in-memory request coalescing only if it does not
  outlive the active requests.
- Provider `429` responses should be propagated with safe retry metadata.
- Write retries require idempotency protection.
- Connector health should be monitored without fetching personal payloads.
- Audit-event delivery failure must not cause sensitive payloads to be logged.
- Backups must respect cached-data deletion and retention policies.

## Garmin proof of concept

Before treating Garmin as a production Bridge connector, Allerac should run a
small proof of concept against the existing Garmin integration. This PoC is
intended to validate the Bridge boundary and the real behavior of the provider,
not to establish a stable public Garmin contract.

### Scope

The PoC should expose a narrow set of allowlisted capabilities:

- verify the connected Garmin account;
- read a small activity summary for a user-selected date range;
- retrieve the details of one user-selected activity;
- attempt one supported, reversible write operation if the current Garmin
  connector offers one safely;
- revoke the agent grant without invalidating the user's Garmin connection.

If no sufficiently safe Garmin write operation is available, the PoC should
remain read-only. Updating or correcting an activity must not be presented as
supported until its behavior has been confirmed against the provider.

All calls should use proxy mode. Provider payloads may exist in memory for the
duration of the request, but must not be written to the database, cache, queue,
conversation history, agent memory, logs, or traces. The PoC may store only
redacted operational audit metadata.

### Validation scenarios

The PoC should demonstrate that:

1. An external test agent can use a short-lived grant to invoke only the
   selected Garmin capabilities.
2. The agent never receives Garmin credentials, cookies, or session material.
3. Calls outside the grant are rejected before reaching Garmin.
4. Revoking the grant immediately blocks the agent while preserving the
   user's Garmin connection.
5. Sensitive response fields and health payloads do not appear in persistent
   storage or observability systems.
6. Provider authentication failures, MFA requirements, rate limits, and
   upstream changes produce safe, understandable errors.
7. Any write call is idempotent where possible and its result is verified by a
   subsequent read.

### Exit criteria

The PoC is successful when the scenarios above pass in an isolated environment
and repeated calls over an agreed observation period show acceptable
reliability. Its outcome should classify each tested capability as:

- suitable for a supported Bridge contract;
- experimental and disabled by default; or
- unsuitable because of privacy, reliability, or provider limitations.

The PoC must not be promoted to production solely because the happy path works.
Production use also requires documented operational ownership, redaction tests,
rate-limit handling, and explicit disclosure that the integration relies on
unofficial Garmin Connect endpoints.

## Rollout

### Phase 1 — Policy and connector boundary

- Approve the integration data policy.
- Add `data_mode` to Spotify and Garmin connections.
- Refactor live provider calls behind connector services.
- Make persistence conditional and centrally enforced.
- Add `no-store` response behavior and payload-redaction tests.

### Phase 2 — Proxy mode

- Implement proxy mode for read-only Spotify operations.
- Add connection settings and consent UI.
- Add safe operational metadata to responses.
- Verify database, cache, log, queue, and memory non-persistence.

### Phase 3 — Delegated agent access

- Add agent grants, expiration, revocation, and capability restrictions.
- Publish Bridge OpenAPI documentation and an agent skill.
- Add audit-event UI.
- Add selected write operations with idempotency and confirmation.

### Phase 4 — Garmin and cached features

- Run and evaluate the Garmin proof of concept.
- Enable audited Garmin read capabilities.
- Add only Garmin write capabilities approved by the PoC.
- Add explicit cached mode with retention and deletion controls.
- Document availability and unofficial-API limitations.

### Phase 5 — Multi-tenant hardening

- Introduce mandatory tenant context.
- Add cross-tenant isolation tests.
- Add tenant-level policies, quotas, keys, and audit access.
- Review backup, worker, cache, and observability isolation.

## Success criteria

The first production-ready Bridge release should demonstrate that:

- an external agent can call an allowlisted Spotify operation;
- the agent never receives Spotify credentials;
- revoking the agent does not disconnect Spotify;
- proxy-mode provider payloads do not appear in persistent storage;
- the user can identify which agent invoked which capability;
- write operations require a separate grant;
- attempts to call ungranted operations fail closed;
- automated tests detect persistence and cross-user access regressions.

## Open questions

- Should external agents authenticate only with API keys, or should Allerac
  support OAuth clients and dynamic consent?
- Should grants be bound to one connection or allow a set of connections?
- Which operations require interactive confirmation every time?
- How should conversation persistence interact with proxy-mode results?
- Should cached mode have a global default retention period?
- Which Spotify capabilities form the first public contract?
- Which Garmin operations does the PoC classify as stable enough to expose?
- What observation period and reliability threshold should the Garmin PoC use?
- When should existing provider-specific credential tables migrate to the
  common connection model?
- Should Allerac Bridge be deployable as a smaller standalone profile?

## Recommendation

Proceed with Allerac Bridge as a bounded capability gateway. Start with
read-only Spotify proxy operations, keep provider credentials inside Allerac,
make persistence behavior explicit, and delay generalized connector
abstractions until the privacy enforcement path has been proven end to end.

The name **Bridge** should always be accompanied by language that makes its
boundary clear:

> A private, authorized capability gateway — not an unrestricted network
> proxy.
