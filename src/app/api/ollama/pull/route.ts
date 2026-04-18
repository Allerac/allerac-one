import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export async function POST(request: NextRequest) {
  try {
    const { modelId } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
    }

    // Create a streaming response
    const responseStream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: modelId,
              stream: true,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            controller.enqueue(`data: ${JSON.stringify({ error: errorText || 'Failed to pull model' })}\n\n`);
            controller.close();
            return;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            controller.enqueue(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`);
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(`data: ${JSON.stringify({ status: 'complete' })}\n\n`);
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const event = JSON.parse(line);
                  // Calculate progress if we have total and completed
                  if (event.total && event.completed) {
                    event.progress = Math.round((event.completed / event.total) * 100);
                  }
                  controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          }
        } catch (error: any) {
          controller.enqueue(`data: ${JSON.stringify({ error: error.message || 'Unknown error' })}\n\n`);
          controller.close();
        }
      },
    });

    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to process request' }, { status: 500 });
  }
}
