# Mobile App and Home Robot Clients

## Status

Direction document. Not an implementation commitment for the current release cycle.

The Control API v1 resource surface and the `agent-worker` split (2026-07-14) are
the prerequisites for the first external clients, and both are done. Control API
headless mode is still future work; this document defines what the first
independent clients look like, what they can reuse today, and which platform gaps
they force us to close.

## Thesis

Allerac One stops being "a web app with an API" and becomes "a control plane with
many clients" the moment a client that is not the browser ships. Two clients are
planned, in order:

1. **Mobile app** — a thin client of `/api/v1` for chat, notes, scheduled jobs,
   finance, and agent runs.
2. **Home robot** — a repurposed Android phone running a clean OS and a kiosk app,
   acting as a voice-first ambient client *and* a provider of physical capabilities
   (camera, speaker, sensors) to the platform.

Both are private-first: they talk to the local Allerac deployment over the LAN, or to
the production Control API through the Cloudflare edge when remote. Cloudflare may
protect the deployment, but `/api/v1/*` must remain usable by scoped bearer-key
clients without interactive browser challenges. See
[ADR 0003](decisions/0003-expose-control-api-through-cloudflare-path-policy.md).

## Why a Phone as the Robot

A used Android phone is the cheapest integrated robotics platform available:

| Built in | Replaces |
|---|---|
| Camera (front + back) | USB webcam |
| Microphone array + speaker | USB audio hardware |
| Touchscreen | Display + input device |
| Battery | UPS (survives power cuts) |
| WiFi + Bluetooth | Network/peripheral dongles |
| Accelerometer, light, proximity sensors | Discrete sensor modules |

A clean Android build (e.g. LineageOS without Google services) keeps the
private-first promise: no vendor telemetry, no account requirement, and the kiosk
app can run as the device launcher so the phone boots straight into Allerac.

## What Already Exists For Clients

The Control API v1 provides everything a v1 client needs:

- Scoped bearer API keys (`alr_live_`), created and revoked per device.
- `POST /api/v1/conversations/:id/messages` — synchronous chat execution: send a
  user message, receive the final assistant message plus execution events.
- `GET /api/v1/capabilities` — lets a client discover what the deployment can do
  before rendering UI for it (`capabilities:read`).
- Agent runs (create/poll/cancel) for long-running work.
- Notes, scheduled jobs, finance, health, search, email as stable resources.
- Background execution isolated in the `agent-worker` container, so a client-created
  run survives app restarts.

## Client Phases

### Phase 1: Mobile Chat Client

Goal: the smallest real client that validates API keys and the v1 contracts outside
the browser and Bruno.

Scope:

- Pair with a deployment by entering the base URL and an API key (QR code later).
- Chat through the synchronous message endpoint, rendering execution events.
- List conversations and read history.
- Optional second screen: agent run list with polling (`agents:read`).

Explicit non-goals for phase 1: offline sync, push notifications, streaming tokens,
account management inside the app (keys are created in the web UI).

Exit criteria:

- A complete conversation works on a phone against a LAN deployment with a scoped
  API key (`chat:read`, `chat:write`; add `capabilities:read` if the app renders
  provider/integration availability).
- Revoking the key in the web UI locks the app out immediately.

### Phase 2: Streaming Decision

The synchronous send endpoint is acceptable for a chat app; it is not for voice.
The robot's voice loop wants first-token latency, not final-message latency.

This phase resolves the deferred roadmap decision ("streaming or async chat
contract") with a real client as the forcing function. Candidates: SSE on the send
endpoint, a WebSocket channel, or a poll-for-partials contract. The decision should
also consider the reverse direction (server → device), because the robot needs it
(see gaps below).

### Phase 3: Home Robot Kiosk

Goal: a phone on a stand that you talk to.

Runtime shape:

```text
Clean Android (LineageOS, no Google services)
  └─ Allerac Kiosk app (device launcher, screen always on)
       ├─ wake word engine (on-device: Porcupine or openWakeWord)
       ├─ STT (on-device Android speech, or a server STT capability)
       ├─ Control API client (same code as the mobile app)
       └─ TTS (on-device Android TTS, or a server TTS capability)
```

Voice loop: wake word → record utterance → STT → `POST
/api/v1/conversations/:id/messages` → TTS the assistant reply. On the LAN with a
local Ollama model, the whole loop stays inside the house.

The kiosk screen doubles as an ambient display (clock, next scheduled jobs, health
summary) rendered from the same v1 resources.

### Phase 4: Device as Capability Provider

The robot inverts from client to **device cell** in the
[Allerac Federation](allerac-federation.md) sense: an edge runtime that exposes
typed capabilities the platform can call.

```text
device.speak          say a sentence on the robot's speaker
device.capture_photo  take a photo, return it as an artifact
device.read_sensors   light / proximity / motion snapshot
device.show           display a card on the kiosk screen
```

This gives the deferred `tools:run` contract its concrete use case: an agent run or
scheduled job asks the home cell to execute `device.capture_photo` on a registered
device, with the result attached as an artifact. Following federation principles,
the device owns its hardware and exposes capabilities through contracts — the
platform never reaches into it.

## Platform Gaps This Roadmap Forces

| Gap | Needed by | Notes |
|---|---|---|
| Streaming chat contract | Phase 3 (voice latency) | Deferred decision; Phase 2 resolves it. |
| Server → device channel | Phase 3/4 | Scheduled job that speaks at 08:00 cannot rely on client polling alone. WebSocket or SSE subscription, or aggressive short-poll as a stopgap. |
| Device identity | Phase 1+ | Per-device API keys already work; consider a `device` metadata field on keys, and later device registration as a resource. |
| STT/TTS strategy | Phase 3 | On-device is simplest and most private; a server capability (e.g. Whisper container) would improve quality and centralize configuration. |
| `tools:run` / capability registry | Phase 4 | The tool permission model must be explicit before devices expose physical actions. |

None of these block Phase 1.

## Security Model

- Each device gets its own API key with the narrowest scopes that work; keys are
  individually revocable from the web UI.
- Production robot and mobile clients should use the HTTPS Control API hostname, not
  direct VM/IP access, except for temporary diagnostics.
- Cloudflare policy for `/api/v1/*` must pass bearer-token API requests through to
  Allerac without browser challenges or caching.
- The robot is a physical device in a shared space: physical access to it must not
  escalate beyond its key's scopes. Sensitive resources (email send, finance write)
  should not be granted to a kiosk key by default.
- Device capabilities (Phase 4) are outbound-from-platform actions on a physical
  space (speak, photograph). They require explicit per-capability grants and an
  audit trail — this is the same trust-boundary discipline federation cells demand.
- Multi-tenant note: a kiosk in a shared room is effectively a shared client. The
  conversation it writes to belongs to one user; treat "who is speaking" as an open
  question (below) rather than assuming the key owner.

## What Not To Do Yet

- Do not build offline-first sync into the mobile app before the online thin client
  proves the contracts.
- Do not add push notification infrastructure before the server → device channel is
  designed once, for all clients.
- Do not expose device capabilities before the tool permission model exists.
- Do not fork the chat pipeline for voice; the robot uses the same conversation
  contracts as every other client.

## Open Questions

- Native (Kotlin) kiosk app versus cross-platform (React Native/Flutter) sharing
  code with the mobile app?
- Speaker identification on the robot: single-owner assumption, per-user wake words,
  or voice profiles?
- Should the robot's camera feed events into Allerac (motion → agent run), and under
  which consent/retention rules?
- Is the device cell a full Allerac runtime (federation stage 3) or a lightweight
  capability shim speaking v1 contracts?
- How does a device announce its capabilities — static key metadata or a
  registration resource with heartbeats?
