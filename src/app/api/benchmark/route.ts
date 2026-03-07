/**
 * /api/benchmark — SSE streaming benchmark Route Handler
 *
 * Runs 4 standardized prompts against the selected model and streams results.
 * Uses direct LLM calls (no RAG, memory, or tools) for clean timing measurements.
 *
 * SSE events:
 *   {"type":"test_start","name":"latency","label":"Latency"}
 *   {"type":"test_done","name":"latency","ttft_ms":234,"total_ms":1200,"chars":2,"tps":null}
 *   {"type":"done","runId":"uuid"}
 *   {"type":"error","message":"..."}
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import pool from '@/app/clients/db';

const authService = new AuthService();
const userSettingsService = new UserSettingsService();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

interface BenchmarkPrompt {
  name: string;
  label: string;
  prompt: string;
}

const BENCHMARK_PROMPTS: BenchmarkPrompt[] = [
  {
    name: 'latency',
    label: 'Latency',
    prompt: 'Reply with only the single word: OK',
  },
  {
    name: 'short_gen',
    label: 'Short Generation',
    prompt: 'List exactly 5 programming languages, one per line, no explanations.',
  },
  {
    name: 'reasoning',
    label: 'Reasoning',
    prompt: 'A train travels 120km in 1.5 hours. What is its average speed in km/h? Answer with just the number and unit.',
  },
  {
    name: 'long_gen',
    label: 'Long Generation',
    prompt: 'Write a 150-word introduction to artificial intelligence for complete beginners.',
  },
];

function encode(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

async function runOllamaPrompt(
  modelId: string,
  prompt: string,
  signal: AbortSignal,
): Promise<{ ttft_ms: number | null; total_ms: number; chars: number; tokens: number | null; tps: number | null }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let content = '';
  let evalCount: number | null = null;
  let evalDuration: number | null = null; // nanoseconds

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
        { role: 'user', content: prompt },
      ],
      stream: true,
      options: { temperature: 0.1, num_predict: 400 },
    }),
    signal,
  });

  if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

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
          content += parsed.message.content;
        }
        if (parsed.done) {
          evalCount = parsed.eval_count ?? null;
          evalDuration = parsed.eval_duration ?? null; // nanoseconds
        }
      } catch { /* skip */ }
    }
  }

  const totalMs = Date.now() - startTime;
  const tps = evalCount && evalDuration && evalDuration > 0
    ? parseFloat((evalCount / (evalDuration / 1e9)).toFixed(2))
    : content.length > 0
      ? parseFloat(((content.length * 0.75) / (totalMs / 1000)).toFixed(2))
      : null;

  return { ttft_ms: ttft, total_ms: totalMs, chars: content.length, tokens: evalCount, tps };
}

async function runOpenAICompatiblePrompt(
  baseUrl: string,
  token: string,
  modelId: string,
  prompt: string,
  signal: AbortSignal,
): Promise<{ ttft_ms: number | null; total_ms: number; chars: number; tokens: number | null; tps: number | null }> {
  const startTime = Date.now();
  let ttft: number | null = null;
  let content = '';
  let completionTokens: number | null = null;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Be concise.' },
        { role: 'user', content: prompt },
      ],
      stream: true,
      temperature: 0.1,
      max_tokens: 400,
    }),
    signal,
  });

  if (!response.ok) throw new Error(`API error: ${response.status}`);

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
          content += token;
        }
        if (parsed.usage?.completion_tokens) {
          completionTokens = parsed.usage.completion_tokens;
        }
      } catch { /* skip */ }
    }
  }

  const totalMs = Date.now() - startTime;
  const tokens = completionTokens ?? (content.length > 0 ? Math.round(content.length * 0.75) : null);
  const tps = tokens && totalMs > 0
    ? parseFloat((tokens / (totalMs / 1000)).toFixed(2))
    : null;

  return { ttft_ms: ttft, total_ms: totalMs, chars: content.length, tokens, tps };
}

export async function POST(request: Request) {
  // Auth and body must be read here — cookies()/headers() lose context inside ReadableStream callbacks
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
  const { model: modelId, provider } = body as { model: string; provider: string };

  const settings = await userSettingsService.loadUserSettings(user.id);
  const githubToken = settings?.github_token || '';
  const geminiToken = settings?.google_api_key || '';
  const userId = user.id;

  const stream = new ReadableStream({
    async start(controller) {
      try {

        const runId = crypto.randomUUID();
        const abortCtrl = new AbortController();

        // Warmup: silent request to load model into memory before measuring
        controller.enqueue(encode({ type: 'warmup_start' }));
        try {
          if (provider === 'ollama') {
            await runOllamaPrompt(modelId, 'Reply with only: OK', abortCtrl.signal);
          } else if (provider === 'gemini') {
            await runOpenAICompatiblePrompt(GEMINI_BASE_URL, geminiToken, modelId, 'Reply with only: OK', abortCtrl.signal);
          } else {
            await runOpenAICompatiblePrompt(GITHUB_BASE_URL, githubToken, modelId, 'Reply with only: OK', abortCtrl.signal);
          }
        } catch { /* warmup failure is non-fatal */ }
        controller.enqueue(encode({ type: 'warmup_done' }));

        for (const bench of BENCHMARK_PROMPTS) {
          controller.enqueue(encode({ type: 'test_start', name: bench.name, label: bench.label }));

          let result: { ttft_ms: number | null; total_ms: number; chars: number; tokens: number | null; tps: number | null };

          try {
            if (provider === 'ollama') {
              result = await runOllamaPrompt(modelId, bench.prompt, abortCtrl.signal);
            } else if (provider === 'gemini') {
              result = await runOpenAICompatiblePrompt(GEMINI_BASE_URL, geminiToken, modelId, bench.prompt, abortCtrl.signal);
            } else {
              result = await runOpenAICompatiblePrompt(GITHUB_BASE_URL, githubToken, modelId, bench.prompt, abortCtrl.signal);
            }
          } catch (err: any) {
            controller.enqueue(encode({ type: 'test_error', name: bench.name, message: err.message }));
            continue;
          }

          controller.enqueue(encode({
            type: 'test_done',
            name: bench.name,
            ttft_ms: result.ttft_ms,
            total_ms: result.total_ms,
            chars: result.chars,
            tokens: result.tokens,
            tps: result.tps,
          }));

          // Save to DB
          try {
            await pool.query(
              `INSERT INTO benchmark_results
                (user_id, run_id, model, provider, prompt_name, prompt_label,
                 ttft_ms, total_ms, chars_generated, tokens_generated, tokens_per_second)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [
                userId, runId, modelId, provider,
                bench.name, bench.label,
                result.ttft_ms, result.total_ms, result.chars,
                result.tokens, result.tps,
              ]
            );
          } catch (dbErr) {
            console.error('[Benchmark] DB insert failed:', dbErr);
          }
        }

        controller.enqueue(encode({ type: 'done', runId }));
        controller.close();

      } catch (err: any) {
        controller.enqueue(encode({ type: 'error', message: err.message || 'Benchmark failed' }));
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
