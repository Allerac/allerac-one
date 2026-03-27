/**
 * /api/instagram/webhook — Real-time Instagram DM automation
 *
 * GET  — Meta webhook verification challenge
 * POST — Incoming DM events → AI reply
 *
 * Env vars:
 *   INSTAGRAM_WEBHOOK_VERIFY_TOKEN  — string you choose, configured in Meta Dev Console
 *   GITHUB_TOKEN                    — for GitHub Models (gpt-4o-mini)
 *   OLLAMA_URL                      — fallback if no GitHub token
 *   INSTAGRAM_BOT_SYSTEM_PROMPT     — optional custom persona (has default)
 */

import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';
import { LLMService } from '@/app/services/llm/llm.service';

const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? 'allerac-ig-webhook';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const OLLAMA_URL   = process.env.OLLAMA_URL ?? 'http://ollama:11434';

// Dedup: avoid processing the same message twice (Meta may retry)
const processedMids = new Set<string>();
const MAX_DEDUP = 500;

const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly Instagram DM assistant.
Reply concisely and naturally — this is a DM conversation, not an email.
Keep replies short (1-3 sentences max). Be warm, professional, and helpful.
Never reveal you are an AI unless directly asked.`;

// ── GET — webhook verification ───────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    console.log('[Instagram Webhook] Verified ✓');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[Instagram Webhook] Verification failed — wrong token or mode');
  return new Response('Forbidden', { status: 403 });
}

// ── POST — incoming events ───────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Acknowledge immediately — Meta requires a fast 200
  // Processing happens in the background (fire-and-forget)
  processEvents(body).catch(err =>
    console.error('[Instagram Webhook] Processing error:', err)
  );

  return new Response('OK', { status: 200 });
}

// ── Event processing ─────────────────────────────────────────────────────────

async function processEvents(body: any) {
  if (body.object !== 'instagram') return;

  for (const entry of body.entry ?? []) {
    const igAccountId = entry.id as string; // the receiving IG account

    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id as string;
      const mid      = event.message?.mid as string;
      const text     = event.message?.text as string;

      if (!senderId || !text || !mid) continue;

      // Skip echo (we sent this)
      if (senderId === igAccountId) continue;

      // Skip if already processed
      if (processedMids.has(mid)) continue;
      processedMids.add(mid);
      if (processedMids.size > MAX_DEDUP) {
        // Evict oldest entries
        const first = processedMids.values().next().value;
        if (first) processedMids.delete(first);
      }

      console.log(`[Instagram Webhook] DM from ${senderId}: "${text.slice(0, 80)}"`);

      await handleDM({ igAccountId, senderId, text });
    }
  }
}

async function handleDM({
  igAccountId,
  senderId,
  text,
}: {
  igAccountId: string;
  senderId: string;
  text: string;
}) {
  // 1. Find which Allerac user owns this IG account
  const creds = await credService.getByIgUserId(igAccountId);
  if (!creds) {
    console.warn(`[Instagram Webhook] No connected Allerac account for IG ${igAccountId}`);
    return;
  }

  // 2. Fetch recent conversation history for context (last 8 messages)
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  try {
    // Find the conversation with this sender
    const conversations = await instagramService.getConversations(creds.accessToken, igAccountId);
    const conv = conversations.find(c =>
      c.participants.data.some(p => p.id === senderId)
    );
    if (conv) {
      const messages = await instagramService.getMessages(creds.accessToken, conv.id, 8);
      // Messages come newest-first from the API
      history = messages
        .slice()
        .reverse()
        .slice(0, -1) // exclude the current message (we'll add it as the last user message)
        .map(m => ({
          role: m.from.id === igAccountId ? 'assistant' as const : 'user' as const,
          content: m.message,
        }));
    }
  } catch (err) {
    console.warn('[Instagram Webhook] Could not fetch history:', err);
  }

  // 3. Build LLM messages
  const systemPrompt = process.env.INSTAGRAM_BOT_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text },
  ];

  // 4. Call LLM — prefer GitHub Models (fast), fall back to Ollama
  let reply: string;
  try {
    if (GITHUB_TOKEN) {
      const llm = new LLMService('github', 'https://models.inference.ai.azure.com', { githubToken: GITHUB_TOKEN });
      const res = await llm.chatCompletion({
        model: 'gpt-4o-mini',
        messages: llmMessages,
        max_tokens: 300,
        temperature: 0.7,
      });
      reply = res.choices[0]?.message?.content?.trim() ?? '';
    } else {
      const llm = new LLMService('ollama', OLLAMA_URL);
      const res = await llm.chatCompletion({
        model: 'qwen2.5:3b',
        messages: llmMessages,
        max_tokens: 300,
        temperature: 0.7,
      });
      reply = res.choices[0]?.message?.content?.trim() ?? '';
    }
  } catch (err) {
    console.error('[Instagram Webhook] LLM error:', err);
    return;
  }

  if (!reply) {
    console.warn('[Instagram Webhook] LLM returned empty reply');
    return;
  }

  // 5. Send the reply
  try {
    await instagramService.sendMessage(creds.accessToken, igAccountId, senderId, reply);
    console.log(`[Instagram Webhook] Replied to ${senderId}: "${reply.slice(0, 80)}"`);
  } catch (err) {
    console.error('[Instagram Webhook] sendMessage error:', err);
  }
}
