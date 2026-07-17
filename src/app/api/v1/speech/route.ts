import { z } from 'zod';
import { requireApiUser } from '../_lib/auth';
import { apiAuthError, apiError, apiInternalError } from '../_lib/responses';
import { SpeechConfigurationError, synthesizeSpeech } from '@/app/services/speech/speech.service';

const speechSchema = z.object({
  text: z.string().trim().min(1).max(4096),
  voice: z.string().trim().min(1).max(80).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  speed: z.number().min(0.25).max(4).optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    await requireApiUser('chat:write', request);
    const parsed = speechSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid speech payload', 400, parsed.error.flatten());
    }

    const audio = await synthesizeSpeech(parsed.data);
    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof SpeechConfigurationError) {
      return apiError('speech_not_configured', error.message, 422);
    }
    return apiInternalError('POST /api/v1/speech failed', error);
  }
}
