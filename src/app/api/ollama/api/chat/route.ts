import { NextRequest, NextResponse } from 'next/server';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireCurrentUser();

    const rawBody = await request.text();
    if (!rawBody || Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'Invalid request size' }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (
      typeof body.model !== 'string'
      || !MODEL_ID_PATTERN.test(body.model)
      || !Array.isArray(body.messages)
      || body.messages.length === 0
      || body.messages.length > 100
    ) {
      return NextResponse.json({ error: 'Invalid model or messages' }, { status: 400 });
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText || 'Ollama request failed' },
        { status: response.status }
      );
    }

    // Stream through instead of buffering the entire response
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (error: unknown) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    console.error('Ollama proxy error:', error);
    const message = error instanceof Error ? error.message : 'Failed to connect to Ollama';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
