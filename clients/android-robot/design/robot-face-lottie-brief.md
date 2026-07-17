# Allerac robot face Lottie brief

The Android robot client renders the face with Lottie Compose. The current asset is
generated in Kotlin so the app can iterate without an external design/export step.

## Screen contract

- Landscape-first face surface.
- Black background.
- Only the robot face should be visible during normal operation.
- Tap toggles listening mode.
- Long press opens or hides settings.

## States

| State | Visual direction |
|---|---|
| Idle | relaxed eyes, subtle blink, quiet scan line |
| Listening | larger alert eyes, smaller pupils, closed mouth |
| Thinking | narrower eyes, purple tint, quiet mouth |
| Speaking | active mouth animation, bright accent |
| Paused | dimmed face, sleepy eyes |
| Error | red accent, tense brows |

## Future exported asset option

If we later export a designer-made Lottie JSON, keep the same app-level state
contract and replace `robotFaceLottieJson(state)` with a raw resource loader plus
state-driven dynamic properties.
