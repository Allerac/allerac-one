/**
 * /api/benchmark/vision — Test which models support image description
 *
 * Tests different models (Ollama, GitHub, Gemini, Anthropic) with the same image
 * and shows which ones can process it + their descriptions
 *
 * SSE events:
 *   {"type":"test_start","model":"gpt-4o","provider":"github"}
 *   {"type":"test_done","model":"gpt-4o","provider":"github","success":true,"ttft_ms":234,"total_ms":1200,"description":"..."}
 *   {"type":"test_error","model":"llava","provider":"ollama","error":"Model not found"}
 *   {"type":"done"}
 */

import { cookies } from 'next/headers';
import Anthropic from '@anthropic-ai/sdk';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import * as metricActions from '@/app/actions/metrics';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

interface VisionModel {
  model: string;
  provider: 'ollama' | 'github' | 'gemini' | 'anthropic';
  label: string;
}

const VISION_MODELS: VisionModel[] = [
  { model: 'gpt-4o', provider: 'github', label: 'GPT-4o (GitHub)' },
  { model: 'gemini-2.5-flash', provider: 'gemini', label: 'Gemini 2.5 Flash' },
  { model: 'gemma4:26b', provider: 'ollama', label: 'Gemma 4 26B (Local)' },
];

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

async function testOllamaVision(
  modelId: string,
  imageUrl: string,
  signal: AbortSignal,
): Promise<{ success: boolean; ttft_ms: number | null; total_ms: number; description: string; error?: string }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let description = '';

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: 'Describe this image in detail.',
            images: [imageUrl], // Ollama accepts base64 directly
          },
        ],
        stream: true,
        options: { temperature: 0.7, num_predict: 500 },
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        ttft_ms: null,
        total_ms: Date.now() - startTime,
        description: '',
        error: `Ollama error ${response.status}: ${text.substring(0, 100)}`,
      };
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            if (ttft === null) ttft = Date.now() - startTime;
            description += parsed.message.content;
          }
        } catch {}
      }
    }

    return {
      success: true,
      ttft_ms: ttft,
      total_ms: Date.now() - startTime,
      description,
    };
  } catch (error: any) {
    return {
      success: false,
      ttft_ms: null,
      total_ms: Date.now() - startTime,
      description: '',
      error: error.message,
    };
  }
}

async function testOpenAIVision(
  baseUrl: string,
  token: string,
  modelId: string,
  imageUrl: string,
  signal: AbortSignal,
): Promise<{ success: boolean; ttft_ms: number | null; total_ms: number; description: string; error?: string }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let description = '';

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image in detail.' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        ttft_ms: null,
        total_ms: Date.now() - startTime,
        description: '',
        error: `API error ${response.status}: ${text.substring(0, 100)}`,
      };
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            if (ttft === null) ttft = Date.now() - startTime;
            description += token;
          }
        } catch {}
      }
    }

    return {
      success: true,
      ttft_ms: ttft,
      total_ms: Date.now() - startTime,
      description,
    };
  } catch (error: any) {
    return {
      success: false,
      ttft_ms: null,
      total_ms: Date.now() - startTime,
      description: '',
      error: error.message,
    };
  }
}

async function testAnthropicVision(
  token: string,
  modelId: string,
  imageUrl: string,
): Promise<{ success: boolean; ttft_ms: number | null; total_ms: number; description: string; error?: string }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let description = '';

  try {
    const client = new Anthropic({ apiKey: token });
    let firstChunk = true;

    const stream = client.messages.stream({
      model: modelId,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image in detail.' },
            { type: 'image', source: { type: 'url', url: imageUrl } },
          ],
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (firstChunk) {
          ttft = Date.now() - startTime;
          firstChunk = false;
        }
        description += event.delta.text;
      }
    }

    return {
      success: true,
      ttft_ms: ttft,
      total_ms: Date.now() - startTime,
      description,
    };
  } catch (error: any) {
    return {
      success: false,
      ttft_ms: null,
      total_ms: Date.now() - startTime,
      description: '',
      error: error.message,
    };
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const user = await authService.validateSession(sessionToken);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }

  const body = await request.json();
  const { imageUrl } = body as { imageUrl: string };

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: 'imageUrl is required' }), { status: 400 });
  }

  const settings = await userSettingsService.loadUserSettings(user.id);
  const githubToken = settings?.github_token || '';
  const geminiToken = settings?.google_api_key || '';
  const anthropicToken = settings?.anthropic_api_key || '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const abortCtrl = new AbortController();

        for (const visionModel of VISION_MODELS) {
          controller.enqueue(encode({
            type: 'test_start',
            model: visionModel.model,
            provider: visionModel.provider,
            label: visionModel.label,
          }));

          let result: {
            success: boolean;
            ttft_ms: number | null;
            total_ms: number;
            description: string;
            error?: string;
          };

          try {
            if (visionModel.provider === 'ollama') {
              result = await testOllamaVision(visionModel.model, imageUrl, abortCtrl.signal);
            } else if (visionModel.provider === 'github') {
              result = await testOpenAIVision(
                GITHUB_BASE_URL,
                githubToken,
                visionModel.model,
                imageUrl,
                abortCtrl.signal,
              );
            } else if (visionModel.provider === 'gemini') {
              result = await testOpenAIVision(
                GEMINI_BASE_URL,
                geminiToken,
                visionModel.model,
                imageUrl,
                abortCtrl.signal,
              );
            } else {
              // anthropic
              result = await testAnthropicVision(anthropicToken, visionModel.model, imageUrl);
            }
          } catch (err: any) {
            controller.enqueue(encode({
              type: 'test_error',
              model: visionModel.model,
              provider: visionModel.provider,
              error: err.message,
            }));
            continue;
          }

          controller.enqueue(encode({
            type: 'test_done',
            model: visionModel.model,
            provider: visionModel.provider,
            label: visionModel.label,
            success: result.success,
            ttft_ms: result.ttft_ms,
            total_ms: result.total_ms,
            description: result.description.substring(0, 300), // Truncate for SSE
            error: result.error,
          }));

          // Log to metrics
          try {
            await metricActions.logApiCall({
              api_name: `vision-benchmark-${visionModel.provider}`,
              endpoint: '/api/benchmark/vision',
              method: 'POST',
              response_time_ms: result.total_ms,
              status_code: result.success ? 200 : 400,
              success: result.success,
              error_message: result.error,
              metadata: {
                model: visionModel.model,
                ttft_ms: result.ttft_ms,
                description_length: result.description.length,
              },
            });
          } catch (logErr) {
            console.error('[VisionBenchmark] Log failed:', logErr);
          }
        }

        controller.enqueue(encode({ type: 'done' }));
        controller.close();
      } catch (err: any) {
        controller.enqueue(encode({ type: 'error', message: err.message || 'Vision benchmark failed' }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
