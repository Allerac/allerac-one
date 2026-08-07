# Detailed Health Activities and Maps

**Status:** In progress — Phase 1 (lossless summaries), Phase 2 (laps + zones),
Phase 3 (route/time series, privacy-zone redaction, deletion), and Phase 4
(activity detail page: interactive map, synchronized charts, laps/zones/
running-dynamics panels, a sync action, loading/degraded states, and inline
rendering on the /health dashboard for the selected day's activity)
implemented. Deletion exists only as an API (`DELETE /api/v1/health/
activities/{activityId}`) — deliberately no UI trigger, to avoid accidental
data loss. Phase 5 (assistant intelligence) has a first slice done (activity
context auto-injected into /health chat, `get_activity_detail` tool for
other activities); the rest remains proposed.

**Scope:** Full Garmin activity ingestion, maps, time series, activity details,
Health UI, assistant access, privacy, and historical analysis.

**Depends on:** Existing Garmin connection, `health-worker`,
`health_activities`, Health Control API, and domain-scoped access control.

**Related:** [Strava Integration for Health](health-strava-integration.md), which
extends this activity model to multiple providers and reconciles Garmin
activities uploaded to Strava.

## Decision

Expand the Health domain from activity summaries into a private activity record
that preserves complete provider responses and exposes stable, provider-neutral
fields for the application. Garmin is the first detailed provider; the storage
and API contracts must also support Strava without duplicating the activity
experience.

For supported Garmin activities, Allerac should import:

1. the activity summary;
2. detailed metrics;
3. laps and time-in-zone aggregates;
4. timestamped samples;
5. the GPS route and elevation profile;
6. provider metadata needed for future reprocessing.

The map is reconstructed from route data. Allerac does not depend on or copy a
rendered Garmin map image.

## Current baseline and gap

The current Garmin flow calls `get_activities` or `get_activities_by_date` and
reduces each result before returning it from the Health Worker.

Today, `health_activities` stores:

- activity ID, name, type, and date;
- start time and duration;
- calories and distance;
- average and maximum heart rate;
- elevation gain and loss;
- a `raw_data` JSON document.

However, `raw_data` currently contains the reduced object produced by the
worker, not the original Garmin response. Pace, power, training effect, stamina,
running dynamics, hydration, laps, zones, samples, and route data are discarded.

The worker already calls `get_activity_details` in a debug endpoint. This should
become a supported, tested synchronization path rather than remaining a debug
facility.

## Product experience

### Activity list

Activity cards remain lightweight and use normalized summary fields:

- name, sport, date, and local start time;
- distance and duration;
- average pace or speed;
- calories;
- average heart rate;
- training effect or exercise load when available;
- a small privacy-safe route preview when the activity contains GPS data.

### Activity detail

Selecting an activity opens a dedicated detail view containing:

- headline summary;
- interactive route map;
- pace, heart rate, elevation, power, and stamina charts;
- running dynamics;
- training effect and exercise load;
- laps;
- time in zones;
- run, walk, and idle breakdown;
- nutrition, hydration, and estimated sweat loss;
- provider and synchronization status.

The map and charts should share the same timeline. Hovering or selecting a chart
point highlights the matching route position; selecting a route segment shows
the matching metric values.

### Map modes

The user can color the route by:

- pace or speed;
- heart rate;
- elevation;
- power;
- cadence;
- run/walk state.

The map may also show:

- start and finish;
- kilometer or mile markers;
- lap boundaries;
- pauses;
- selected segments.

Use Leaflet initially because it is already familiar to the product and does not
require a proprietary map runtime. Keep the route contract renderer-neutral so
MapLibre can be adopted later.

## Data categories

Not every device or activity exposes every category. All sport-specific fields
are optional.

| Category | Examples |
|---|---|
| Identity | provider activity ID, name, sport, sub-sport, gear |
| Timing | duration, moving time, elapsed time, run/walk/idle time |
| Distance and pace | distance, average pace, moving pace, best pace, grade-adjusted pace |
| Energy and hydration | resting/active/total calories, estimated sweat loss, fluid consumed/net |
| Heart rate | average, maximum, recovery, zones, timestamped samples |
| Elevation | ascent, descent, minimum/maximum elevation, elevation samples |
| Power | average/maximum power, power zones, timestamped samples |
| Stamina | beginning/ending potential, minimum stamina, stamina samples |
| Training | primary benefit, aerobic/anaerobic effect, exercise load, intensity minutes, VO2 max |
| Running dynamics | cadence, stride length, vertical ratio/oscillation, ground contact time |
| Impact | impact load, actual distance, impact load factor when available |
| Route | GPS samples, bounds, detailed geometry, simplified polyline |
| Structure | laps, segments, time in zones, run/walk classifications |
| Context | device, gear, source, privacy, sync and payload versions |

The first validation fixture should include the example Barcelona run:

- 5.01 km in 34:56;
- average pace 6:59/km;
- 40 m ascent;
- 165 bpm average and 189 bpm maximum heart rate;
- 229 W average power;
- stamina from 100% potential to 66%;
- aerobic training effect 3.4 and exercise load 93;
- 164 spm cadence, 0.85 m stride length, 8.2 cm vertical oscillation, and
  285 ms ground contact time;
- route, elevation, heart rate, stamina, and run/walk series.

This fixture verifies field mapping and units; it must not contain real GPS
coordinates in source control.

## Storage model

### Activity summary

Keep `health_activities` as the authoritative local activity index. Add
normalized columns for frequently displayed, filtered, or analyzed values.

Candidate fields include:

```text
provider
provider_activity_id
sport_type
sub_sport_type
timezone
moving_time_seconds
elapsed_time_seconds
average_pace_seconds_per_km
best_pace_seconds_per_km
average_power_watts
max_power_watts
min_elevation_meters
max_elevation_meters
training_effect_aerobic
training_effect_anaerobic
training_benefit
exercise_load
vo2_max
average_cadence_spm
max_cadence_spm
average_stride_length_meters
average_vertical_ratio_percent
average_vertical_oscillation_cm
average_ground_contact_time_ms
estimated_sweat_loss_ml
beginning_stamina_percent
ending_stamina_percent
minimum_stamina_percent
detail_sync_status
detail_synced_at
payload_version
```

Do not create a column for every provider field. Normalize values used by
queries, UI, or assistant analysis and preserve the rest in versioned JSONB:

- `provider_summary_raw`;
- `provider_details_raw`.

Raw payloads are provider evidence and a reprocessing source, not the public API
contract.

### Laps and zones

Use child tables rather than embedding queryable structures in the activity:

```text
health_activity_laps
  user_id, activity_id, lap_index, start_offset, duration, distance,
  pace, heart_rate, power, cadence, ascent, descent, raw_data

health_activity_zones
  user_id, activity_id, metric_type, zone_number,
  lower_bound, upper_bound, duration_seconds, percent, raw_data
```

### Time-series samples

Store samples in a dedicated table:

```text
health_activity_samples
  user_id
  activity_id
  sample_index
  timestamp
  elapsed_seconds
  latitude
  longitude
  elevation_meters
  distance_meters
  heart_rate_bpm
  pace_seconds_per_km
  speed_meters_per_second
  power_watts
  cadence_spm
  stamina_percent
  stamina_potential_percent
  ground_contact_time_ms
  stride_length_meters
  vertical_oscillation_cm
  run_walk_state
```

Use a uniqueness constraint on `(user_id, activity_id, sample_index)` and
indexes for activity/timeline reads. Bulk upserts should run in a transaction.

If measured volume becomes excessive, move cold sample blocks to compressed
JSON or object storage while retaining downsampled database series. This is a
measured optimization, not a Phase 1 requirement.

### Route representation

Keep two route forms:

- detailed coordinates in `health_activity_samples`;
- a simplified encoded polyline and route bounds on `health_activities`.

The simplified route supports list previews and fast initial rendering. The
detailed route supports the activity page, synchronized charts, and analysis.

Store coordinates at provider precision. Apply privacy redaction when serving
them; do not destructively alter the authoritative private import unless the
user explicitly requests permanent sanitization.

## Units and data quality

Normalize all stored/queryable values to explicit units:

- seconds for durations;
- meters for distance and elevation;
- meters per second for speed;
- seconds per kilometer for pace;
- watts for power;
- beats or steps per minute for rate metrics;
- milliliters for hydration;
- percentages on a 0–100 scale.

Provider payloads may use different names, scales, or missing values. The mapper
must:

- distinguish zero from unavailable;
- reject non-finite numeric values;
- record the provider field used for ambiguous mappings;
- preserve unusual values, such as cadence spikes, in raw data while allowing UI
  quality flags;
- never infer a metric merely to make the screen complete.

## Synchronization

### Two-stage import

1. Fetch activity summaries for a date range and upsert them quickly.
2. Queue detail synchronization for new or stale activities.

Detail synchronization fetches only the supported resources available for that
sport and device. One failed optional resource must not discard the activity
summary.

### Idempotency

- Key activities by `(user_id, provider, provider_activity_id)`.
- Repeated syncs update the same activity.
- Laps, zones, samples, and route data are replaced transactionally per payload
  version.
- Store detail status as `pending`, `syncing`, `complete`, `partial`, or
  `failed`.
- Record the last error without exposing credentials or full provider payloads
  in logs.

### Refresh policy

- Recent incomplete activities may be refreshed because Garmin can finish
  processing metrics after upload.
- Completed historical activities should not be refetched on every dashboard
  request.
- Manual refresh is available from the activity page.
- Background sync uses bounded concurrency and retry backoff to avoid Garmin
  rate limits.

## Service and API contracts

Add supported Health Worker operations for:

```text
GET activity summary
GET activity details
GET activity laps
GET activity zones
GET activity samples/route
```

The exact Garmin library calls remain internal to the worker. Allerac-facing
responses use versioned provider-neutral contracts.

Extend the Control API with:

```text
GET /api/v1/health/activities
GET /api/v1/health/activities/{activityId}
GET /api/v1/health/activities/{activityId}/laps
GET /api/v1/health/activities/{activityId}/zones
GET /api/v1/health/activities/{activityId}/series
GET /api/v1/health/activities/{activityId}/route
POST /api/v1/health/activities/{activityId}/sync
```

List responses never include detailed coordinates or raw provider payloads.
Series endpoints support metric selection, downsampling, and a bounded point
count.

## Assistant access

Evolve the Health tools so the assistant can:

- list and filter activities;
- retrieve one activity's normalized details;
- compare activities and training periods;
- request selected aggregate series;
- explain training effect, pacing, recovery, and running dynamics.

Tools should return bounded summaries by default. Exact coordinates and raw GPS
tracks are excluded from the assistant contract. Location descriptions require
explicit user intent and permission.

The assistant must distinguish recorded facts from interpretation. For example,
“average heart rate was 165 bpm” is a stored fact; “the effort was too hard” is
an interpretation that needs context and appropriate health-safety language.

## Privacy and security

Activity routes are sensitive location and routine data.

- Data is private and user-scoped by default.
- Every query checks activity ownership.
- List APIs omit exact route coordinates.
- Do not include GPS coordinates in logs, analytics, chat context, or error
  reporting.
- Support a privacy-zone radius that hides the beginning and end of served
  routes near protected locations.
- Route previews use redacted geometry.
- Exports clearly indicate whether detailed location data is included.
- Deleting an activity deletes its laps, zones, samples, route, cached previews,
  and derived analysis. Deletion is API-only (no UI button), a deliberate
  choice to prevent accidental data loss from a stray click.
- Disconnecting Garmin does not silently delete history; a separate,
  explicit `DELETE` call is required.

Protected locations should be stored separately and encrypted or represented in
a way that does not reveal the precise location in ordinary queries.

## Performance

- Load summary data before details.
- Use the simplified polyline for previews.
- Lazy-load the full route and chart series on the activity page.
- Downsample chart payloads to the viewport resolution.
- Fetch multiple selected series in one aligned response.
- Cache immutable historical detail responses.
- Keep raw provider JSON out of list queries.
- Measure table size and query latency before introducing object storage or
  specialized time-series infrastructure.

## Provider boundary

Garmin Connect access currently relies on unofficial/internal endpoints through
`garminconnect`. Endpoint availability and field shapes can change.

- Isolate Garmin mapping in the Health Worker.
- Save provider and mapper versions.
- Add contract fixtures with sanitized payloads.
- Treat absent provider resources as degraded capability.
- Do not expose Garmin-specific payloads as stable public contracts.
- Keep the data model capable of accepting future providers.

## Delivery phases

### Phase 1 — Lossless summaries

1. Preserve the original Garmin activity summary.
2. Correct and test units and timestamps.
3. Add provider, payload version, and detail sync state.
4. Backfill existing rows where source data is available.
5. Add sanitized running and strength fixtures.

### Phase 2 — Detailed activity import

1. Promote activity details out of the debug endpoint.
2. Add normalized detailed metrics and raw detail storage.
3. Add laps and time-in-zone ingestion.
4. Make detail synchronization asynchronous and idempotent.
5. Expose the activity-detail API.

### Phase 3 — Route and time series

1. Import GPS and timestamped metric samples.
2. Generate route bounds and simplified polylines.
3. Add bounded route/series APIs.
4. Add privacy-zone redaction.
5. Validate deletion and ownership behavior.

### Phase 4 — Activity experience

1. Add the activity detail route and summary layout.
2. Render the interactive map.
3. Add synchronized charts and route selection.
4. Add laps, zones, running dynamics, and hydration panels.
5. Add loading, partial-data, unsupported, and degraded states.

Delivered as: a single-color route line with start/finish markers and a
hover-synced position marker (chart hover moves the map marker); full
click-drag segment selection and the "Map modes" section's per-metric route
coloring (pace/HR/elevation/power/cadence/run-walk) are deferred — the route
contract already carries per-sample metrics, so adding those modes later is
additive, not a rework.

### Phase 5 — Health intelligence

1. Extend Health tools with detailed activity retrieval and comparison.
2. Add weekly and historical training analysis.
3. Provide attributable explanations using normalized metrics.
4. Add data-quality indicators and provider provenance.
5. Measure response size, latency, and usefulness.

## Definition of done

- A supported Garmin run retains its complete summary and detailed provider
  payload.
- The example Barcelona run maps correctly into normalized fields with explicit
  units.
- The activity page shows a privacy-safe interactive route.
- Route and charts are aligned along the activity timeline.
- Laps and zones are available when supplied by the provider.
- Missing sport/device metrics do not break ingestion or rendering.
- Repeat synchronization creates no duplicate activities or samples.
- APIs and tools enforce user ownership and bounded responses.
- Exact coordinates do not leak through list APIs, logs, or ordinary assistant
  context.
- Activity deletion removes all detailed and derived data.
- Existing summary-only activities remain readable throughout the migration.

## Non-goals

- Copying Garmin's rendered map tiles or screenshots.
- Guaranteeing metrics that a device did not record.
- Treating provider-specific fields as a permanent public contract.
- Sending full raw activity payloads or GPS traces to the language model.
- Diagnosing medical conditions from workout metrics.
- Introducing PostGIS, object storage, or a time-series database before measured
  scale requires them.
