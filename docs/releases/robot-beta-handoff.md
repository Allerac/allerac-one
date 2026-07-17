# Robot Beta Handoff

Context saved on 2026-07-17 before clearing the chat.

## Next Objective

Prepare the first Allerac beta release, deploy the current app to Azure, and point the Android robot client on the physical phone to the production VM at `https://app.allerac.ai`.

## Current State

- The Android robot client works locally through the Control API.
- The robot domain is `robot-assistant`.
- The robot client creates conversations with `domainSlug: robot-assistant`.
- The robot voice pipeline uses `/api/v1/speech` and cloud TTS when `OPENAI_API_KEY` is configured.
- Robot settings live in `/robot-assistant`.
- Robot settings API is `/api/v1/robot/settings`.
- The robot skill can use search, notes, and health tools when the corresponding environment is configured.
- Locally, `HEALTH_WORKER_SECRET` was added to `.env` so Health tools are available at runtime.

## Release Plan

1. Review `git status` and split unrelated changes if needed.
2. Run local build and targeted smoke tests.
3. Push the current code.
4. Deploy the app to Azure for `app.allerac.ai`.
5. Verify production environment variables:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `TAVILY_API_KEY`
   - `HEALTH_WORKER_SECRET`
   - `HEALTH_WORKER_URL`
   - database and auth settings
6. Use Bruno to smoke test production Control API:
   - create a `robot-assistant` conversation
   - send a basic chat message
   - call search through the LLM
   - call notes through the LLM
   - call speech synthesis
   - call health if the production worker is configured
7. Point the Android robot app to `https://app.allerac.ai` instead of local `http://127.0.0.1:8080`.
8. Test the physical phone without `adb reverse`.

## Android Production Start Reminder

The app can be launched with intent extras, so a rebuild should not be required just to change the backend URL:

```powershell
.\android-platform-tools\platform-tools\adb.exe shell am force-stop com.allerac.robot
.\android-platform-tools\platform-tools\adb.exe shell am start -n com.allerac.robot/.MainActivity -e base_url https://app.allerac.ai -e api_key <robot_api_key> -e provider anthropic -e model claude-haiku-4-5
```

Do not print or commit the real robot API key.
