# Robot API

Robot endpoints expose speech synthesis and the runtime settings used by the
`robot-assistant` client.

## Authentication and access

| Endpoint | API key scope | Additional access |
|---|---|---|
| `POST /api/v1/speech` | `chat:write` | None |
| `GET /api/v1/robot/settings` | `chat:read` | Access to the `robot-assistant` domain |
| `PUT /api/v1/robot/settings` | `chat:write` | Access to the `robot-assistant` domain |

Browser sessions can call these endpoints without API key scopes. Robot settings
still require access to the `robot-assistant` domain.

## `POST /api/v1/speech`

Synthesizes speech through the configured OpenAI speech provider and returns MPEG
audio. Unlike normal Control API success responses, the response body is binary
audio rather than a JSON `data` envelope.

Request body:

| Field | Type | Required | Constraints | Default |
|---|---|---:|---|---|
| `text` | string | Yes | 1-4096 characters after trimming | — |
| `voice` | string | No | 1-80 characters | Stored robot voice or `onyx` |
| `model` | string | No | 1-120 characters | `gpt-4o-mini-tts` |
| `speed` | number | No | 0.25-4 | Stored robot speed or `1.15` |

Example:

```bash
curl -sS \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Allerac."}' \
  -o speech.mp3 \
  "https://app.allerac.ai/api/v1/speech"
```

Successful response:

```http
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Cache-Control: no-store
```

If neither system settings nor `OPENAI_API_KEY` provides an OpenAI key, the endpoint
returns `422 speech_not_configured`.

## `GET /api/v1/robot/settings`

Returns the effective speech settings, supported voices, default domain skill, and
tools enabled for that skill. `runtimeAvailable` distinguishes tools that are
configured on the skill from tools available in the current application runtime.

Example:

```bash
curl -sS \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "https://app.allerac.ai/api/v1/robot/settings"
```

Response:

```json
{
  "data": {
    "voice": "onyx",
    "speed": 1.15,
    "style": "Speak naturally as a warm male robot assistant.",
    "voices": ["alloy", "ash", "ballad", "cedar", "coral", "echo"],
    "defaultSkill": {
      "id": "skill-id",
      "name": "robot-assistant",
      "displayName": "Robot Assistant"
    },
    "tools": [
      {
        "name": "web_search",
        "label": "Web Search",
        "description": "Search the web",
        "group": "Search",
        "runtimeAvailable": true
      }
    ]
  }
}
```

`defaultSkill` is `null` when the domain has no default skill. Treat the exact
`voices` and `tools` arrays as runtime capability data rather than hard-coded client
constants.

## `PUT /api/v1/robot/settings`

Updates the system-wide robot speech settings.

Request body:

| Field | Type | Required | Constraints |
|---|---|---:|---|
| `voice` | string | Yes | One of the voices returned by the GET endpoint |
| `speed` | number | Yes | 0.25-4 |
| `style` | string | Yes | 1-1000 characters after trimming |

Example:

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"voice":"onyx","speed":1.15,"style":"Speak warmly and clearly."}' \
  "https://app.allerac.ai/api/v1/robot/settings"
```

Response:

```json
{
  "data": {
    "voice": "onyx",
    "speed": 1.15,
    "style": "Speak warmly and clearly."
  }
}
```

The supported voice values currently include `alloy`, `ash`, `ballad`, `cedar`,
`coral`, `echo`, `fable`, `marin`, `nova`, `onyx`, `sage`, `shimmer`, and `verse`.

## Bruno requests

The Bruno collection contains:

```text
Robot / Get Settings
Robot / Synthesize Speech
```

Set `baseUrl` and `apiKey` in the selected environment before running them. A Bruno
request for updating settings has not been added yet.

