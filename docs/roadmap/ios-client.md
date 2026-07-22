# Native iOS Client Roadmap

## Status

Proposed. Not scheduled for the current release.

## Goal

Deliver a native SwiftUI client that connects an iPhone to an existing Allerac
deployment through the production Control API. The first milestone proves secure
pairing and conversation; broader mobile domains follow only after that path is
stable.

## Prerequisites

- A Mac capable of running the required Xcode toolchain.
- An iPhone enabled for development and connected to the Mac.
- An Apple ID suitable for development signing.
- A reachable Allerac deployment with `/api/v1/*` exposed through Cloudflare.
- A dedicated, revocable iOS API key.

The lack of a macOS/Xcode environment is an implementation blocker, not a backend
or Control API blocker.

## Phase 0: Project Foundation

- Create `clients/ios/` with a minimal SwiftUI application.
- Define build configurations without committing signing identities or secrets.
- Add a typed Control API client and stable JSON error decoding.
- Add Keychain-backed credential storage.
- Add unit tests for request construction, decoding, and credential redaction.

**Exit:** a signed development build opens on the physical iPhone and can validate
`/api/v1/version` without embedding credentials.

## Phase 1: Secure Pairing

- Enter the deployment URL and API key manually.
- Normalize and validate HTTPS deployment URLs.
- Store the key in Keychain and redact it from logs.
- Validate `/version`, `/me`, and `/capabilities`.
- Provide a clear reset/re-pair action.

**Exit:** the iPhone authenticates against production with its own key and reports
the deployed release and authenticated user.

## Phase 2: Text Conversations

- List conversations and load message history.
- Create a conversation when no valid identifier exists.
- Send text messages and render assistant responses and errors.
- Handle revoked keys, missing scopes, connectivity loss, and server timeouts.
- Preserve the current conversation across normal app restarts.

**Exit:** a complete production conversation works without Safari or a browser
session.

## Phase 3: Voice

- Request microphone and speech-recognition permissions contextually.
- Convert speech to text and reuse the text conversation flow.
- Call `/api/v1/speech` when server speech is available.
- Manage playback interruption, headphones, silent mode, and cancellation.
- Keep text chat available when any audio permission is denied.

**Exit:** the user can complete a spoken turn on the physical iPhone and hear the
response without weakening the text experience.

## Phase 4: Mobile Domains

Add one domain at a time, each with dedicated scopes and tests. Candidate order:

1. notes;
2. scheduled jobs;
3. agent runs;
4. health summaries;
5. finance watchlist.

Push notifications, widgets, App Intents, camera features, offline synchronization,
and background activity require separate design decisions and are not implicitly
included in this phase.

## Distribution Evolution

1. Direct installation from Xcode for development.
2. TestFlight for repeatable beta distribution when needed.
3. App Store submission only after privacy disclosures, support processes, signing
   ownership, and release operations are ready.

## Validation Matrix

| Area | Minimum validation |
|---|---|
| Build | Clean signed build on macOS/Xcode |
| Device | Physical iPhone 13 Pro launch |
| Edge | Production requests pass through Cloudflare |
| Auth | Dedicated key, scope errors, and revocation |
| API | Version, profile, capabilities, conversations, messages |
| Storage | Keychain use and log redaction |
| Network | Offline, timeout, retry, and invalid-host behavior |
| Voice | Permission granted, denied, interruption, and playback |
| Regression | Existing web and Android clients remain unaffected |

## Definition of MVP Done

- The app is installed directly on the iPhone without App Store publication.
- Production pairing uses a dedicated scoped API key.
- Text conversation is reliable across restart and reconnect.
- Voice is either validated or explicitly deferred without blocking text chat.
- Secrets and signing assets are absent from Git history and diagnostic logs.
- Setup, test, revoke, and recovery procedures are documented.
