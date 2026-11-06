/** Builds the LLM call used by rolling compaction (phase 4a). */
import { LLMService } from '../llm/llm.service';
import { SEGMENT_SUMMARY_PROMPT, type Summarize } from './primary-conversation';

export function makeSegmentSummarizer(params: {
  provider: string;
  baseUrl: string;
  modelId: string;
  githubToken?: string;
  geminiToken?: string;
  anthropicToken?: string;
  openaiToken?: string;
}): Summarize {
  return async (transcript: string) => {
    const llm = new LLMService(params.provider as never, params.baseUrl, {
      githubToken: params.githubToken,
      geminiToken: params.geminiToken,
      anthropicToken: params.anthropicToken,
      openaiToken: params.openaiToken,
    });
    const data = await llm.chatCompletion({
      model: params.modelId,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: SEGMENT_SUMMARY_PROMPT },
        { role: 'user', content: transcript.slice(0, 60_000) },
      ],
    });
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  };
}
