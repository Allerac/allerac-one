import pool from '@/app/clients/db';
import { domainInstructionsService } from '@/app/services/instructions/domain-instructions.service';

interface DistillerLlmConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

interface DistillInput {
  userId: string;
  domainSlug: string;
  llmConfig: DistillerLlmConfig | string;
  sourceSummaryId?: string | null;
}

function normalizeConfig(config: DistillerLlmConfig | string): DistillerLlmConfig {
  return typeof config === 'string'
    ? {
        endpoint: 'https://models.inference.ai.azure.com/chat/completions',
        apiKey: config,
        model: 'gpt-4o',
      }
    : config;
}

function parseInstructions(content: string): string[] {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.instructions)) return [];
    return parsed.instructions
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter(Boolean)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export class InstructionDistillerService {
  async distill(input: DistillInput): Promise<{ updated: boolean; conflict?: boolean }> {
    const domainSlug = input.domainSlug || 'chat';
    const currentResult = await pool.query(
      `SELECT content, revision
       FROM user_domain_instructions
       WHERE user_id = $1 AND domain_slug = $2`,
      [input.userId, domainSlug],
    );
    const currentContent = currentResult.rows[0]?.content ?? '';

    const memoriesResult = await pool.query(
      `SELECT id, summary, key_topics, importance_score, created_at
       FROM conversation_summaries
       WHERE user_id = $1 AND domain_slug = $2
       ORDER BY
         CASE WHEN key_topics && ARRAY['correction', 'preference']::text[] THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT 12`,
      [input.userId, domainSlug],
    );
    if (memoriesResult.rows.length === 0) return { updated: false };

    const memoryContext = memoriesResult.rows.map((memory, index) => (
      `${index + 1}. [importance ${memory.importance_score}; topics ${(memory.key_topics || []).join(', ')}] ${memory.summary}`
    )).join('\n');
    const config = normalizeConfig(input.llmConfig);
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Extract only durable standing instructions that should guide future conversations in the "${domainSlug}" domain.

Use explicit corrections, stable preferences, recurring constraints, and enduring personal context. Ignore one-off requests, temporary facts, completed tasks, assistant behavior, and anything already represented in the current instruction document.

Return strict JSON only:
{"instructions":["Concise imperative instruction", "..."]}

CURRENT INSTRUCTION DOCUMENT:
${currentContent || '(empty)'}

RECENT MEMORIES:
${memoryContext}`,
        }],
      }),
    });
    if (!response.ok) throw new Error(`Instruction distillation failed: ${response.status}`);
    const data = await response.json();
    const learned = parseInstructions(data.choices?.[0]?.message?.content ?? '');
    if (learned.length === 0) return { updated: false };
    const result = await domainInstructionsService.learn({
      userId: input.userId,
      domainSlug,
      instructions: learned,
      source: 'distilled',
      sourceSummaryId: input.sourceSummaryId,
    });
    return { updated: result.added.length > 0 };
  }
}

export const instructionDistillerService = new InstructionDistillerService();
