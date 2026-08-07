# Strava Integration for Health

**Status:** Proposed

**Scope:** Strava account connection, activity synchronization, streams and
routes, webhook updates, Garmin/Strava reconciliation, provider-neutral Health
contracts, privacy, and assistant access.

**Depends on:** [Detailed Health Activities and Maps](health-detailed-activities.md),
Health domain access control, encrypted credential storage, background jobs, and
public webhook delivery.

**Official references:**

- [Strava API getting started](https://developers.strava.com/docs/getting-started/)
- [OAuth authentication](https://developers.strava.com/docs/authentication/)
- [API reference](https://developers.strava.com/docs/reference/)
- [Webhook events](https://developers.strava.com/docs/webhooks/)
- [API guidelines](https://developers.strava.com/guidelines/)

## Decision

Add Strava as a supported Health provider without creating a second, isolated
activity experience.

Garmin and Strava adapters import provider records into one provider-neutral
Health activity model:

```text
Garmin ──┐
         ├── provider adapters ── logical Health activity ── UI/API/tools
Strava ──┘
```

A logical activity can have one or more provider sources. When a Garmin-recorded
run is automatically uploaded to Strava, Allerac presents one run with Garmin
and Strava provenance instead of two duplicate activities.

The Health domain remains the user-facing source. Provider payloads remain
evidence and synchronization inputs, not public product contracts.

## Goals

- Connect and disconnect a Strava account with OAuth 2.0.
- Import historical and newly created Strava activities.
- Import detailed activities, routes, zones, and supported streams.
- Receive activity creation, update, deletion, privacy, and deauthorization
  events through Strava webhooks.
- Reconcile activities already imported from Garmin.
- Preserve provider provenance for every field.
- Keep exact location data private and out of ordinary assistant context.
- Respect Strava rate limits, privacy changes, attribution, and API terms.

## Non-goals

- Reproducing Strava's social feed, comments, kudos, clubs, or challenges.
- Replacing Strava as a social fitness application.
- Assuming Strava exposes Garmin-specific physiology such as Body Battery or
  every device-specific training metric.
- Uploading or editing Strava activities in the first delivery.
- Combining two ambiguous activities without evidence or user confirmation.
- Exposing Strava access or refresh tokens outside the server connector.

## Product experience

### Connection

Health settings show a **Connect Strava** action next to Garmin.

The connection flow:

1. Allerac creates signed OAuth state tied to the current user.
2. The user authorizes Allerac on Strava.
3. Strava redirects to the registered callback.
4. Allerac validates state and exchanges the authorization code.
5. Tokens and athlete identity are stored securely.
6. A bounded initial historical sync is queued.

The UI shows:

- connected athlete;
- granted scopes;
- last successful sync;
- current sync state and error;
- disconnect and delete-imported-data actions.

Disconnecting revokes or removes the connector authorization but does not
silently delete local activity history. Deletion is a separate explicit choice.

### Activity presentation

Provider badges appear in the activity detail:

```text
Barcelona Running
Sources: Garmin · Strava
```

The activity screen remains provider-neutral. It can display:

- normalized summary and detailed metrics;
- GPS route and synchronized charts;
- laps and zones when available;
- Strava-specific segments or achievements in a clearly attributed section;
- source and last-synchronized information.

Strava attribution must follow the current official guidelines wherever Strava
data is displayed.

## Authentication and credentials

Strava uses OAuth 2.0 with short-lived access tokens and refresh tokens.

Store a connection per Allerac user:

```text
health_provider_connections
  id
  user_id
  provider                  -- strava
  provider_account_id       -- athlete ID
  access_token_encrypted
  refresh_token_encrypted
  access_token_expires_at
  granted_scopes
  status
  last_sync_at
  last_error
  created_at
  updated_at
```

Requirements:

- encrypt access and refresh tokens at rest;
- never return tokens to the browser after the OAuth exchange;
- refresh access tokens under a per-connection lock;
- do not log authorization codes, tokens, or client secrets;
- validate OAuth state and callback ownership;
- handle denied or partially granted scopes;
- make callback processing idempotent;
- support revocation and deauthorization.

The existing provider-connection abstraction should be reused or extended when
it satisfies these properties. Do not create a parallel credential system only
for Strava.

## Provider-neutral activity model

### Logical activity

`health_activities` represents the activity the user sees. It is not keyed
directly to a single provider.

### Provider sources

Add a source table:

```text
health_activity_sources
  id
  user_id
  health_activity_id
  provider
  provider_activity_id
  provider_account_id
  external_id
  upload_id
  visibility
  source_device
  summary_raw
  details_raw
  mapper_version
  first_seen_at
  last_synced_at
  deleted_at
```

Constraints:

- unique `(user_id, provider, provider_activity_id)`;
- every source belongs to the same user as its logical activity;
- deleting a logical activity cascades to all local source projections;
- a provider deletion marks or removes only that source before deciding whether
  the logical activity still has another authoritative source.

Each normalized metric retains provenance:

```ts
interface HealthMetricValue<T> {
  value: T;
  unit: string;
  sourceId: string;
  provider: 'garmin' | 'strava';
  observedAt?: string;
  quality?: 'recorded' | 'provider_derived' | 'allerac_derived';
}
```

The database implementation may store provenance per metric family rather than
serializing this exact interface for every scalar. The API must be able to
explain the selected source.

## Strava data coverage

### Summary and details

Use the official athlete activity and activity detail endpoints to obtain fields
such as:

- activity ID and external ID;
- name, sport type, start time, and timezone;
- distance, moving time, and elapsed time;
- elevation;
- average and maximum speed;
- average and maximum heart rate when available;
- cadence and power when available;
- calories;
- device and gear;
- visibility and activity flags;
- segment efforts and achievements where permitted.

### Streams and route

Request only the streams needed for the Health activity experience. Supported
Strava streams can include:

- time;
- distance;
- latitude/longitude;
- altitude;
- velocity;
- heart rate;
- cadence;
- watts;
- temperature;
- moving state;
- grade.

Availability depends on the recorded activity, device, authorization, provider
processing, and current API contract. Missing streams are normal.

Align streams by their shared sample index and preserve:

- original sample count;
- resolution;
- series type;
- requested stream set;
- mapper version.

Generate the same simplified polyline, route bounds, privacy-safe preview, and
downsampled series used for Garmin-backed activities.

### Zones

Import activity zones when the endpoint and athlete entitlement permit them.
Zones are optional capability data; failure to fetch zones must not fail the
activity import.

## Reconciliation with Garmin

### Why reconciliation is required

Garmin commonly uploads completed activities to Strava. Importing each provider
record independently would produce duplicate runs and conflicting statistics.

### Matching evidence

Use weighted deterministic evidence:

1. exact or recognizable Strava `external_id`;
2. compatible sport type;
3. start times within a strict tolerance;
4. similar elapsed or moving duration;
5. similar distance;
6. matching route fingerprint when GPS exists;
7. device/source metadata.

Example:

```text
score =
  external ID match       + 100
  route fingerprint match + 50
  start-time match        + 30
  duration match          + 15
  distance match          + 15
  sport match             + 10
```

Actual thresholds must be validated with fixtures and real imports.

### Outcomes

- **High confidence:** automatically attach the source to the existing logical
  activity.
- **Medium confidence:** show a possible duplicate for user confirmation.
- **Low confidence:** create a separate logical activity.

Never merge solely because two activities happened on the same day.

Store reconciliation evidence, score, algorithm version, and decision. Users can
separate an incorrect merge or combine confirmed duplicates.

### Route fingerprint

Create a privacy-preserving route fingerprint from a simplified, quantized route.
Use it for local matching only. It must not be exposed as a public identifier or
treated as proof of identity by itself.

## Metric precedence and fusion

Do not blindly overwrite Garmin values with Strava values or vice versa.

Default precedence:

| Metric family | Preferred source | Reason |
|---|---|---|
| Device physiology and training metrics | Garmin | Closest to the recording device and Garmin processing |
| Running dynamics | Garmin | Often richer and device-specific |
| Raw recorded HR, power, cadence | Recording source | Preserve device provenance and sample quality |
| Strava segments and achievements | Strava | Provider-owned interpretation |
| User-edited activity title/description | Most recently explicit user edit | User intent |
| Route | Best available recorded stream | Select by completeness and quality |

Allerac may derive pace, splits, or aggregate values from selected raw samples.
Derived values are labeled `allerac_derived`; they never masquerade as a provider
measurement.

If providers materially disagree, retain both source values and show a provenance
indicator instead of silently choosing an arbitrary truth.

## Synchronization

### Initial sync

1. Import a bounded recent history with paginated activity summaries.
2. Upsert Strava sources idempotently.
3. Reconcile against existing Garmin-backed activities.
4. Queue details and streams with bounded concurrency.
5. Report partial progress in Health settings.

Historical depth should be a product/configuration decision. Avoid importing an
athlete's entire history synchronously during OAuth callback handling.

### Incremental sync

Use webhooks as the primary change signal:

- `create`: queue activity fetch and reconciliation;
- `update`: refetch the affected activity fields;
- `delete`: remove or mark the Strava source and derived Strava data;
- athlete deauthorization: disable the connection and stop synchronization.

Webhook payloads are notifications, not complete activity records. Fetch the
authorized current representation asynchronously.

Periodic reconciliation remains useful for missed or delayed events but must not
be aggressive polling.

### Idempotency and ordering

- Persist a stable webhook event identity derived from subscription, object,
  aspect, and event time.
- Acknowledge valid webhook delivery promptly and process asynchronously.
- Handle repeated and out-of-order events.
- A deletion observed after an older update remains authoritative.
- Reprocessing the same activity does not duplicate sources, laps, zones, or
  samples.

## Webhook architecture

Expose a public callback:

```text
GET  /api/integrations/strava/webhook  -- subscription verification
POST /api/integrations/strava/webhook  -- event delivery
```

The verification endpoint validates the configured verification token and echoes
the challenge according to Strava's contract.

The event endpoint:

1. validates payload shape and subscription;
2. records a minimal event without location or credentials;
3. returns success within Strava's required response window;
4. queues asynchronous processing;
5. resolves the athlete owner to an active Allerac connection.

One Strava application has one webhook subscription that receives events for its
authorized athletes. Subscription lifecycle is an operational application-level
concern, not a per-user action.

## Rate limits and reliability

Strava applies short-window and daily application limits. Exact limits and
headers must be read from the live official contract and response headers rather
than hard-coded as universal assumptions.

- Track rate-limit headers centrally.
- Budget requests across users.
- Prefer webhooks to polling.
- Fetch only required streams.
- Cache immutable historical activities.
- Use exponential backoff for retryable failures.
- Stop retries on authorization and permanent not-found errors.
- Show degraded or delayed synchronization state in Health.
- Keep summary sync useful when details, zones, or streams are unavailable.

## API surface

Existing provider-neutral endpoints continue to serve logical activities:

```text
GET /api/v1/health/activities
GET /api/v1/health/activities/{activityId}
GET /api/v1/health/activities/{activityId}/laps
GET /api/v1/health/activities/{activityId}/zones
GET /api/v1/health/activities/{activityId}/series
GET /api/v1/health/activities/{activityId}/route
```

Provider connection endpoints:

```text
GET    /api/v1/health/providers
POST   /api/v1/health/providers/strava/connect
GET    /api/v1/health/providers/strava/callback
POST   /api/v1/health/providers/strava/sync
DELETE /api/v1/health/providers/strava
```

Public webhooks are outside API-key authentication and use their own verification
contract. OAuth state and authenticated session protect connection callbacks.

List and assistant APIs do not return raw payloads, tokens, exact protected
locations, or unbounded streams.

## Assistant access

The Health assistant operates on logical activities, not duplicate provider
records.

It can:

- answer which providers contributed to an activity;
- compare activities across time;
- analyze normalized pace, heart rate, power, elevation, and training metrics;
- explain discrepancies with provider provenance;
- use Strava segments when available and relevant.

It cannot:

- receive OAuth credentials;
- access exact coordinates by default;
- post, edit, like, comment, or follow on Strava in the initial scope;
- claim a Garmin-only metric came from Strava;
- infer a medical diagnosis from activity data.

## Privacy, deletion, and compliance

- Request the minimum OAuth scopes needed for the selected experience.
- Explain why private-activity access is requested before requesting a broader
  scope.
- Respect Strava activity visibility.
- Process provider privacy changes and deletions promptly.
- Keep data user-scoped at every storage and query layer.
- Exclude exact GPS data from logs, analytics, and ordinary chat context.
- Apply the same protected-location redaction used for Garmin routes.
- Follow current Strava display attribution and branding rules.
- On deauthorization, stop all provider access immediately.
- Offer explicit local deletion of Strava-imported data.
- When a reconciled activity also has a Garmin source, deleting its Strava source
  must not delete the remaining Garmin activity.

Before production launch, review the current Strava API Agreement, guidelines,
application-review requirements, retention obligations, and permitted display
behavior.

## Observability

Record metrics without sensitive payloads:

- active Strava connections;
- OAuth success/failure;
- token refresh success/failure;
- webhook receive/process latency;
- event duplicates and out-of-order events;
- summaries/details/streams synchronized;
- reconciliation confidence and user corrections;
- rate-limit budget and throttled jobs;
- partial and failed activity imports.

Logs use internal connection and activity identifiers, not tokens or exact route
coordinates.

## Delivery phases

### Phase 1 — Provider-neutral foundation

1. Separate logical activities from provider sources.
2. Add provider provenance and source uniqueness.
3. Adapt existing Garmin rows without breaking current APIs.
4. Implement reconciliation contracts and sanitized fixtures.
5. Keep all existing Garmin activity views working.

### Phase 2 — Strava connection

1. Register and configure the Strava application.
2. Add OAuth state, callback, encrypted tokens, and refresh.
3. Add connection status, disconnect, and scope display.
4. Implement bounded recent-history summary import.
5. Test ownership, callback forgery, token leakage, and idempotency.

### Phase 3 — Details, streams, and reconciliation

1. Import activity details and supported zones.
2. Import selected streams and GPS routes.
3. Map them to the detailed Health activity contract.
4. Reconcile Strava activities with Garmin sources.
5. Add user correction for uncertain or incorrect matches.

### Phase 4 — Webhooks and reliable incremental sync

1. Add webhook verification and event ingestion.
2. Queue create, update, delete, and deauthorization processing.
3. Add replay protection and out-of-order handling.
4. Add rate-limit budgeting and degraded states.
5. Run missed-event reconciliation on a conservative schedule.

### Phase 5 — Unified product experience

1. Add provider badges and provenance explanations.
2. Show Strava segments and achievements in attributed sections.
3. Use one map/chart experience for Garmin and Strava sources.
4. Extend Health tools to reason over logical activities.
5. Validate privacy, deletion, attribution, latency, and duplicate rate.

## Definition of done

- A user can securely connect and disconnect Strava.
- New Strava activities arrive without dashboard polling.
- Historical import is paginated, bounded, resumable, and idempotent.
- Detailed metrics and available streams render in the common Health activity
  page.
- A Garmin activity uploaded to Strava normally appears once, with both sources.
- Uncertain matches require confirmation and incorrect matches can be reversed.
- Metric provenance and source discrepancies are explainable.
- Privacy changes, provider deletion, and deauthorization stop or remove Strava
  access appropriately.
- Exact route coordinates do not leak through logs, list APIs, or ordinary
  assistant context.
- Rate limiting degrades synchronization without breaking existing Health data.
- Garmin-only users and existing Health APIs remain compatible.

