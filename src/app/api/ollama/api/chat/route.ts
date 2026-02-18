import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

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
  } catch (error: any) {
    console.error('Ollama proxy error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to connect to Ollama' },
      { status: 500 }
    );
  }
}
