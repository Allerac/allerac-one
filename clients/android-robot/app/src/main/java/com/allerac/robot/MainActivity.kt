package com.allerac.robot

import android.Manifest
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.speech.RecognizerIntent
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        hideSystemBars()

        val preferences = getSharedPreferences("allerac_robot", MODE_PRIVATE)
        applyIntentConfiguration(preferences)

        setContent {
            MaterialTheme {
                Surface {
                    RobotApp(preferences = preferences)
                }
            }
        }
    }

    private fun applyIntentConfiguration(preferences: SharedPreferences) {
        val editor = preferences.edit()
        var changed = false

        fun copyExtra(extraName: String, preferenceName: String) {
            val value = intent.getStringExtra(extraName)?.trim()
            if (!value.isNullOrBlank()) {
                editor.putString(preferenceName, value)
                changed = true
            }
        }

        copyExtra("base_url", "base_url")
        copyExtra("api_key", "api_key")
        copyExtra("provider", "provider")
        copyExtra("model", "model")
        copyExtra("conversation_id", "conversation_id")

        if (changed) editor.apply()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }
}

@Composable
private fun RobotApp(preferences: SharedPreferences) {
    var baseUrl by remember { mutableStateOf(preferences.getString("base_url", "http://192.168.1.10:8080") ?: "") }
    var apiKey by remember { mutableStateOf(preferences.getString("api_key", "") ?: "") }
    var provider by remember { mutableStateOf(preferences.getString("provider", "ollama") ?: "ollama") }
    var model by remember { mutableStateOf(preferences.getString("model", "qwen2.5:3b") ?: "qwen2.5:3b") }
    var conversationId by remember { mutableStateOf(preferences.getString("conversation_id", "") ?: "") }
    var robotState by remember { mutableStateOf(RobotState.Idle) }
    var lastHeard by remember { mutableStateOf("") }
    var lastReply by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("Tap the face to talk.") }
    var showSettings by remember { mutableStateOf(baseUrl.isBlank() || apiKey.isBlank()) }
    var conversationActive by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val mainHandler = remember { Handler(Looper.getMainLooper()) }
    val startListeningAction = remember { arrayOfNulls<() -> Unit>(1) }

    val tts = remember {
        TextToSpeech(context) { }
    }
    val speechRecognizer = remember {
        if (SpeechRecognizer.isRecognitionAvailable(context)) SpeechRecognizer.createSpeechRecognizer(context) else null
    }

    DisposableEffect(tts) {
        tts.language = Locale.getDefault()
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                (context as ComponentActivity).runOnUiThread {
                    robotState = RobotState.Speaking
                    status = "Speaking."
                }
            }

            override fun onDone(utteranceId: String?) {
                (context as ComponentActivity).runOnUiThread {
                    if (conversationActive) {
                        robotState = RobotState.Idle
                        lastHeard = ""
                        status = "Listening again..."
                        mainHandler.postDelayed({
                            startListeningAction[0]?.invoke()
                        }, 550L)
                    } else {
                        robotState = RobotState.Paused
                        status = "Paused."
                    }
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                (context as ComponentActivity).runOnUiThread {
                    robotState = RobotState.Error
                    status = "Could not speak the reply."
                }
            }
        })
        onDispose {
            tts.stop()
            tts.shutdown()
        }
    }

    fun saveSettings() {
        preferences.edit()
            .putString("base_url", baseUrl.trim())
            .putString("api_key", apiKey.trim())
            .putString("provider", provider.trim())
            .putString("model", model.trim())
            .putString("conversation_id", conversationId.trim())
            .apply()
    }

    fun sendToAllerac(message: String) {
        saveSettings()
        scope.launch {
            robotState = RobotState.Thinking
            status = "Thinking..."
            try {
                val api = AlleracApi(baseUrl, apiKey, provider, model)
                val currentConversationId = conversationId.ifBlank {
                    api.createConversation().also {
                        conversationId = it
                        preferences.edit().putString("conversation_id", it).apply()
                    }
                }
                val reply = api.sendMessage(currentConversationId, message)
                lastReply = reply.content
                robotState = RobotState.Speaking
                status = "Speaking."
                val speechResult = tts.speak(reply.content, TextToSpeech.QUEUE_FLUSH, null, "allerac-reply")
                if (speechResult == TextToSpeech.ERROR) {
                    robotState = RobotState.Error
                    status = "Could not start speech."
                }
            } catch (error: Exception) {
                robotState = RobotState.Error
                status = error.message ?: "Request failed."
            }
        }
    }

    DisposableEffect(speechRecognizer) {
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                robotState = RobotState.Listening
                status = "Listening..."
            }

            override fun onBeginningOfSpeech() {
                robotState = RobotState.Listening
                status = "Listening..."
            }

            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() {
                if (conversationActive) {
                    robotState = RobotState.Thinking
                    status = "Thinking..."
                } else {
                    robotState = RobotState.Paused
                    status = "Paused."
                }
            }

            override fun onError(error: Int) {
                val message = speechErrorMessage(error)
                if (!conversationActive && isCancelSpeechError(error)) {
                    robotState = RobotState.Paused
                    status = "Paused."
                } else if (conversationActive && isRecoverableSpeechError(error)) {
                    robotState = RobotState.Idle
                    status = message
                    mainHandler.postDelayed({
                        startListeningAction[0]?.invoke()
                    }, 1300L)
                } else {
                    robotState = RobotState.Error
                    status = message
                }
            }

            override fun onResults(results: Bundle?) {
                val spoken = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    .orEmpty()

                if (spoken.isEmpty()) {
                    status = "I did not catch that."
                    if (conversationActive) {
                        robotState = RobotState.Idle
                        mainHandler.postDelayed({
                            startListeningAction[0]?.invoke()
                        }, 1300L)
                    } else {
                        robotState = RobotState.Paused
                    }
                    return
                }

                val command = spoken.first()
                lastHeard = command
                sendToAllerac(command)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val partial = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (partial.isNotBlank()) {
                    lastHeard = partial
                }
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        onDispose {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            startHiddenListening(speechRecognizer, mainHandler) {
                robotState = RobotState.Error
                status = it
            }
        } else {
            robotState = RobotState.Error
            status = "Microphone permission denied."
        }
    }

    fun startListening() {
        if (baseUrl.isBlank() || apiKey.isBlank()) {
            status = "Configure base URL and API key first."
            robotState = RobotState.Error
            conversationActive = false
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            status = "Listening..."
            startHiddenListening(speechRecognizer, mainHandler) {
                robotState = RobotState.Error
                status = it
            }
        } else {
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    startListeningAction[0] = {
        if (conversationActive) {
            startListening()
        }
    }

    fun toggleConversation() {
        if (conversationActive) {
            conversationActive = false
            mainHandler.removeCallbacksAndMessages(null)
            speechRecognizer?.cancel()
            tts.stop()
            robotState = RobotState.Paused
            status = "Paused."
        } else {
            conversationActive = true
            status = "Listening..."
            startListening()
        }
    }

    LaunchedEffect(baseUrl, apiKey, provider, model, conversationId) {
        saveSettings()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(baseUrl, apiKey) {
                detectTapGestures(
                    onTap = { toggleConversation() },
                    onLongPress = { showSettings = !showSettings },
                )
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
        ) {
            RobotFaceHost(
                state = robotState,
                modifier = Modifier.fillMaxSize(),
            )

            RobotSubtitle(
                state = robotState,
                status = status,
                lastHeard = lastHeard,
                lastReply = lastReply,
                conversationActive = conversationActive,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(horizontal = 48.dp, vertical = 24.dp),
            )
        }

        if (showSettings) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xEE111111))
                    .padding(16.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(onClick = { showSettings = false }) {
                        Text("Hide", color = Color(0xFFF7F2EA))
                    }
                }
                SettingsForm(
                    baseUrl = baseUrl,
                    onBaseUrlChange = { baseUrl = it },
                    apiKey = apiKey,
                    onApiKeyChange = { apiKey = it },
                    provider = provider,
                    onProviderChange = { provider = it },
                    model = model,
                    onModelChange = { model = it },
                    conversationId = conversationId,
                    onConversationIdChange = { conversationId = it },
                    onSave = {
                        saveSettings()
                        showSettings = false
                        robotState = RobotState.Idle
                        status = "Saved. Tap the face to talk."
                    },
                )
            }
        }
    }
}

@Composable
private fun RobotSubtitle(
    state: RobotState,
    status: String,
    lastHeard: String,
    lastReply: String,
    conversationActive: Boolean,
    modifier: Modifier = Modifier,
) {
    val text = when (state) {
        RobotState.Listening -> "Listening..."
        RobotState.Thinking -> lastHeard.ifBlank { "Thinking..." }
        RobotState.Speaking -> lastReply
        RobotState.Paused -> ""
        RobotState.Error -> status
        RobotState.Idle -> if (conversationActive) status else ""
    }

    if (text.isBlank()) return

    Text(
        text = text,
        modifier = modifier.fillMaxWidth(),
        color = Color(0xFFF7F2EA),
        style = MaterialTheme.typography.titleMedium,
        textAlign = TextAlign.Center,
        maxLines = 3,
    )
}

@Composable
private fun SettingsForm(
    baseUrl: String,
    onBaseUrlChange: (String) -> Unit,
    apiKey: String,
    onApiKeyChange: (String) -> Unit,
    provider: String,
    onProviderChange: (String) -> Unit,
    model: String,
    onModelChange: (String) -> Unit,
    conversationId: String,
    onConversationIdChange: (String) -> Unit,
    onSave: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        RobotTextField("Base URL", baseUrl, onBaseUrlChange)
        RobotTextField("API key", apiKey, onApiKeyChange, secret = true)
        Row(modifier = Modifier.fillMaxWidth()) {
            RobotTextField("Provider", provider, onProviderChange, modifier = Modifier.weight(1f))
            Spacer(modifier = Modifier.width(8.dp))
            RobotTextField("Model", model, onModelChange, modifier = Modifier.weight(1f))
        }
        RobotTextField("Conversation ID", conversationId, onConversationIdChange)
        Button(onClick = onSave, modifier = Modifier.fillMaxWidth()) {
            Text("Save")
        }
    }
}

@Composable
private fun RobotTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    secret: Boolean = false,
) {
    OutlinedTextField(
        modifier = modifier.fillMaxWidth(),
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
    )
}

private fun startHiddenListening(
    speechRecognizer: SpeechRecognizer?,
    mainHandler: Handler,
    onUnavailable: (String) -> Unit,
) {
    if (speechRecognizer == null) {
        onUnavailable("Speech recognition is not available.")
        return
    }

    speechRecognizer.cancel()
    mainHandler.post {
        speechRecognizer.startListening(speechIntent())
    }
}

private fun speechIntent(): android.content.Intent {
    return android.content.Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 900L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1400L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1000L)
    }
}

private fun speechErrorMessage(error: Int): String {
    return when (error) {
        SpeechRecognizer.ERROR_AUDIO -> "Microphone error."
        SpeechRecognizer.ERROR_CLIENT -> "Speech client error."
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission denied."
        SpeechRecognizer.ERROR_NETWORK -> "Speech network error."
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech network timeout."
        SpeechRecognizer.ERROR_NO_MATCH -> "I did not catch that."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognizer is busy."
        SpeechRecognizer.ERROR_SERVER -> "Speech service error."
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I did not hear anything."
        else -> "Speech recognition failed."
    }
}

private fun isRecoverableSpeechError(error: Int): Boolean {
    return error == SpeechRecognizer.ERROR_NO_MATCH ||
        error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ||
        error == SpeechRecognizer.ERROR_CLIENT
}

private fun isCancelSpeechError(error: Int): Boolean {
    return error == SpeechRecognizer.ERROR_CLIENT ||
        error == SpeechRecognizer.ERROR_NO_MATCH ||
        error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
}

private fun isWakePhrase(text: String): Boolean {
    val normalized = text
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9 ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
    val compact = normalized.replace(" ", "")

    return normalized.contains("yo yo") ||
        normalized.contains("io io") ||
        normalized.contains("i o i o") ||
        normalized.contains("iô iô") ||
        normalized.contains("yo-yo") ||
        compact.contains("yoyo") ||
        compact.contains("ioio") ||
        compact == "yo" ||
        compact == "io" ||
        normalized.contains("hey allerac") ||
        normalized.contains("ei allerac") ||
        normalized.contains("hi allerac") ||
        normalized.contains("allerac") ||
        normalized.contains("alerac") ||
        normalized.contains("aleraque") ||
        normalized.contains("a lerac") ||
        normalized.contains("a lerak") ||
        compact.contains("heyallerac") ||
        compact.contains("eiallerac") ||
        compact.contains("eialerac") ||
        compact.contains("alerac") ||
        compact.contains("alleraque") ||
        compact.contains("aleraque") ||
        compact.contains("alerack") ||
        compact.contains("allerack")
}
