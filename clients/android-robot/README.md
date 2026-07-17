# Allerac Robot Android Client

Experimental Android robot/kiosk client for Allerac One Control API v1.

Target device for the first build:

- Redmi 9C NFC / M2006C3MNG
- Android 10 / API 29
- `armeabi-v7a`
- 720x1600 display

## MVP scope

- Pair with an Allerac deployment using base URL and `alr_live_...` API key.
- Create a chat conversation through `/api/v1/conversations`.
- Send messages through `/api/v1/conversations/:id/messages`.
- Push-to-talk using Android speech recognition.
- Speak replies using Android TextToSpeech.
- Robot-friendly face screen with idle/listening/thinking/speaking/error states.

Wake word, launcher/kiosk mode, camera, sensors, and device capabilities are out of
scope for this first client.

## Robot face asset

The app renders the robot face with Lottie Compose. The current composition is
generated in Kotlin from `RobotState`, so we can iterate on the character without
using an external editor/export step.

If Lottie fails to load, the app falls back to the original Compose Canvas face.

See [design/robot-face-lottie-brief.md](design/robot-face-lottie-brief.md) for
the face brief.

## Build

Open this directory in Android Studio, let it install the required Android SDK, then
run the `app` configuration on the connected phone.

Command-line build once JDK and Android SDK are installed:

```powershell
cd clients/android-robot
gradle :app:assembleDebug
```

Install with the local ADB downloaded in the repo root:

```powershell
..\..\android-platform-tools\platform-tools\adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```

## Local Allerac over USB

For a phone connected to this development PC, use ADB reverse so the app can reach
the local Docker deployment without opening Windows firewall ports:

```powershell
.\android-platform-tools\platform-tools\adb.exe reverse tcp:8080 tcp:8080
```

Then launch the app with configuration extras:

```powershell
$key = Get-Content .tools\redmi-robot-api-key.txt
.\android-platform-tools\platform-tools\adb.exe shell am start `
  -n com.allerac.robot/.MainActivity `
  -e base_url http://127.0.0.1:8080 `
  -e api_key $key `
  -e provider github `
  -e model gpt-4o
```
