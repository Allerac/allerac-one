import { SystemSettingsService } from '@/app/services/system/system-settings.service';

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech';
const DEFAULT_MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'onyx';
const DEFAULT_SPEED = 1.15;
const DEFAULT_STYLE = 'Speak naturally as a warm male robot assistant. Keep the delivery conversational, clear, and calm.';

const systemSettingsService = new SystemSettingsService();

export class SpeechConfigurationError extends Error {
  constructor() {
    super('OpenAI API key is not configured.');
    this.name = 'SpeechConfigurationError';
  }
}

export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
  model?: string;
  speed?: number;
  instructions?: string;
}): Promise<ArrayBuffer> {
  const systemSettings = await systemSettingsService.loadAll();
  const apiKey = systemSettings.openai_api_key || process.env.OPENAI_API_KEY || '';
  if (!apiKey) throw new SpeechConfigurationError();
  const storedSpeed = Number.parseFloat(systemSettings.robot_speech_speed || '');
  const speed = input.speed ?? (Number.isFinite(storedSpeed) ? storedSpeed : DEFAULT_SPEED);
  const voice = input.voice || systemSettings.robot_speech_voice || DEFAULT_VOICE;
  const instructions = input.instructions || systemSettings.robot_speech_style || DEFAULT_STYLE;

  const response = await fetch(OPENAI_SPEECH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model || DEFAULT_MODEL,
      voice,
      input: input.text,
      response_format: 'mp3',
      speed,
      instructions,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Speech provider failed: ${response.status} ${detail}`.trim());
  }

  return response.arrayBuffer();
}
