// LLM Service with automatic metrics tracking
// Supports GitHub Models, Ollama, Gemini, and Anthropic providers
import { MetricsService } from '@/app/services/infrastructure/metrics.service';
import Anthropic from '@anthropic-ai/sdk';

const metricsService = new MetricsService();

export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface LLMRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string | MessageContentPart[];
    tool_call_id?: string;
    tool_calls?: any;
  }>;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: string | { type: string; function: { name: string } };
  userId?: string;
  conversationId?: string;
}

export interface LLMResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: any[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

type LLMProvider = 'github' | 'ollama' | 'gemini' | 'anthropic';

// Converts OpenAI-format messages to Anthropic MessageParam format.
// Key differences:
//   - role:'tool' → role:'user' with content:[{type:'tool_result',...}]
//   - role:'assistant' + tool_calls → content:[{type:'tool_use',...}]
//   - Consecutive tool_result blocks are grouped into one user message
//   - content image_url parts → Anthropic image blocks
function convertImageUrlToAnthropicSource(url: string): any {
  const dataUriMatch = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (dataUriMatch) {
    return {
      type: 'base64',
      media_type: dataUriMatch[1],
      data: dataUriMatch[2],
    };
  }

  return {
    type: 'url',
    url,
  };
}

function convertContentToAnthropicContent(content: string | MessageContentPart[]): string | any[] {
  if (typeof content === 'string') return content;

  return content.flatMap(part => {
    if (part.type === 'text') {
      return part.text ? [{ type: 'text', text: part.text }] : [];
    }

    if (part.type === 'image_url' && part.image_url?.url) {
      return [{
        type: 'image',
        source: convertImageUrlToAnthropicSource(part.image_url.url),
      }];
    }

    return [];
  });
}

function convertToAnthropicMessages(
  messages: LLMRequest['messages']
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id!,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
      const last = result[result.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content)) {
        (last.content as any[]).push(block);
      } else {
        result.push({ role: 'user', content: [block] });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const content: any[] = [];
      if (msg.content && typeof msg.content === 'string' && msg.content.trim()) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        let input: any = {};
        try {
          input = typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments ?? {});
        } catch { /* keep {} */ }
        content.push({
          type: 'tool_use',
          id: tc.id || `toolu_${tc.function.name}_${Date.now()}`,
          name: tc.function.name,
          input,
        });
      }
      result.push({ role: 'assistant', content });
      continue;
    }

    result.push({
      role: msg.role as 'user' | 'assistant',
      content: convertContentToAnthropicContent(msg.content) as any,
    });
  }

  return result;
}

export class LLMService {
  private provider: LLMProvider;
  private baseUrl: string;
  private githubToken?: string;
  private geminiToken?: string;
  private anthropicToken?: string;
  private anthropicClient?: Anthropic;
  private _userId?: string;
  private _conversationId?: string;

  constructor(provider: LLMProvider, baseUrl: string, config?: { githubToken?: string; geminiToken?: string; anthropicToken?: string }) {
    this.provider = provider;
    this.baseUrl = baseUrl;
    this.githubToken = config?.githubToken;
    this.geminiToken = config?.geminiToken;
    this.anthropicToken = config?.anthropicToken;

    // Initialize Anthropic client if using anthropic provider
    if (provider === 'anthropic') {
      if (!this.anthropicToken) {
        throw new Error('Anthropic API key is required for anthropic provider');
      }
      this.anthropicClient = new Anthropic({ apiKey: this.anthropicToken });
    }

    // Validate token if required
    if (provider === 'github' && !this.githubToken) {
      throw new Error('GitHub token is required for github provider');
    }
    if (provider === 'gemini' && !this.geminiToken) {
      throw new Error('Google API key is required for gemini provider');
    }
  }

  /**
   * Call LLM API with automatic metrics tracking
   */
  async chatCompletion(request: LLMRequest): Promise<LLMResponse> {
    this._userId = request.userId;
    this._conversationId = request.conversationId;
    if (this.provider === 'github') {
      return this.githubChatCompletion(request);
    } else if (this.provider === 'gemini') {
      return this.geminiChatCompletion(request);
    } else if (this.provider === 'anthropic') {
      return this.anthropicChatCompletion(request);
    } else {
      return this.ollamaChatCompletion(request);
    }
  }

  /**
   * Stream LLM response, yielding string tokens one by one.
   * Tool-detection calls stay non-streaming; use this for the final user-facing response.
   */
  async *streamChatCompletion(request: LLMRequest): AsyncGenerator<string> {
    this._userId = request.userId;
    this._conversationId = request.conversationId;
    if (this.provider === 'github') {
      yield* this.githubStreamChatCompletion(request);
    } else if (this.provider === 'gemini') {
      yield* this.geminiStreamChatCompletion(request);
    } else if (this.provider === 'anthropic') {
      yield* this.anthropicStreamChatCompletion(request);
    } else {
      yield* this.ollamaStreamChatCompletion(request);
    }
  }

  private async *githubStreamChatCompletion(request: LLMRequest): AsyncGenerator<string> {
    const { userId: _u, conversationId: _c, ...apiRequest } = request;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.githubToken}`,
      },
      body: JSON.stringify({ ...apiRequest, stream: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
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
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip malformed lines */ }
      }
    }
  }

  private async *ollamaStreamChatCompletion(request: LLMRequest): AsyncGenerator<string> {
    // Convert multimodal messages to text-only for Ollama (doesn't support content arrays)
    const normalizedMessages = request.messages.map(msg => {
      if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        const imageParts: string[] = [];

        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            textParts.push(part.text);
          } else if (part.type === 'image_url' && part.image_url?.url) {
            imageParts.push(part.image_url.url);
          }
        }

        let content = textParts.join('\n');
        if (imageParts.length > 0) {
          content += `\n\n[Image URLs: ${imageParts.join(', ')}]`;
        }

        return { ...msg, content };
      }
      return msg;
    });

    const body = {
      model: request.model,
      messages: normalizedMessages,
      stream: true,
      tools: request.tools,
      options: {
        temperature: request.temperature,
        num_predict: request.max_tokens,
      },
    };

    let response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Ollama streaming can take a long time — allow up to 10 minutes
      signal: AbortSignal.timeout(600000),
    });

    // If model doesn't support tools, retry without them
    if (!response.ok && request.tools?.length) {
      const text = await response.text();
      if (text.includes('does not support tools')) {
        console.log('[Ollama] Model does not support tools, retrying without tools');
        response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, tools: undefined }),
          signal: AbortSignal.timeout(600000),
        });
      } else {
        throw new Error(text || response.statusText);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
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
          if (parsed.done) return;
          const content = parsed.message?.content;
          if (content) yield content;
        } catch { /* skip malformed lines */ }
      }
    }
  }

  /**
   * Call GitHub Models API
   */
  private async githubChatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    let response: Response | undefined;
    let success = true;
    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      const { userId: _u, conversationId: _c, ...apiRequest } = request;
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.githubToken}`,
        },
        body: JSON.stringify(apiRequest),
      });

      statusCode = response.status;

      if (!response.ok) {
        success = false;
        let errorData: any;
        try {
          errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.message || response.statusText;
        } catch {
          errorMessage = await response.text() || response.statusText;
        }

        // Format rate limit errors with helpful information
        if (errorMessage && errorMessage.includes('Rate limit')) {
          const match = errorMessage.match(/wait (\d+) seconds/);
          if (match) {
            const waitSeconds = parseInt(match[1]);
            const hours = Math.floor(waitSeconds / 3600);
            const minutes = Math.floor((waitSeconds % 3600) / 60);
            const waitTime = hours > 0
              ? `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes !== 1 ? 's' : ''}`
              : `${minutes} minute${minutes !== 1 ? 's' : ''}`;

            errorMessage = `⏳ **Rate Limit Exceeded for ${request.model}**\n\nYou've reached the limit of requests for this model.\n\n⏱️ Wait ${waitTime} to use this model again.`;
          } else {
            errorMessage = `⏳ **Rate Limit Exceeded for ${request.model}**\n\n${errorMessage}`;
          }
        }

        // Log error metrics
        await this.logMetrics({
          model: request.model,
          provider: 'github',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode,
          errorMessage,
          errorType: this.getErrorType(statusCode, errorMessage),
        });

        throw new Error(errorMessage);
      }

      const data: LLMResponse = await response.json();

      // Log success metrics
      await this.logMetrics({
        model: request.model,
        provider: 'github',
        responseTime: Date.now() - startTime,
        success: true,
        statusCode: 200,
        usage: data.usage,
        hasTools: request.tools && request.tools.length > 0,
        messageCount: request.messages.length,
      });

      return data;
    } catch (error: any) {
      // Ensure metrics are logged even if there's an exception
      if (success) {
        await this.logMetrics({
          model: request.model,
          provider: 'github',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode: statusCode || 500,
          errorMessage: error.message,
          errorType: error.name || 'Error',
        });
      }
      throw error;
    }
  }

  /**
   * Call Gemini API (OpenAI-compatible endpoint)
   */
  private async geminiChatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    let response: Response | undefined;
    let success = true;
    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      const { userId: _u, conversationId: _c, ...apiRequest } = request;
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.geminiToken}`,
        },
        body: JSON.stringify(apiRequest),
      });

      statusCode = response.status;

      if (!response.ok) {
        success = false;
        let errorData: any;
        try {
          errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.message || response.statusText;
        } catch {
          errorMessage = await response.text() || response.statusText;
        }

        await this.logMetrics({
          model: request.model,
          provider: 'gemini',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode,
          errorMessage,
          errorType: this.getErrorType(statusCode, errorMessage),
        });

        throw new Error(errorMessage);
      }

      const data: LLMResponse = await response.json();

      await this.logMetrics({
        model: request.model,
        provider: 'gemini',
        responseTime: Date.now() - startTime,
        success: true,
        statusCode: 200,
        usage: data.usage,
        hasTools: request.tools && request.tools.length > 0,
        messageCount: request.messages.length,
      });

      return data;
    } catch (error: any) {
      if (success) {
        await this.logMetrics({
          model: request.model,
          provider: 'gemini',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode: statusCode || 500,
          errorMessage: error.message,
          errorType: error.name || 'Error',
        });
      }
      throw error;
    }
  }

  private async *geminiStreamChatCompletion(request: LLMRequest): AsyncGenerator<string> {
    const { userId: _u, conversationId: _c, ...apiRequest } = request;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.geminiToken}`,
      },
      body: JSON.stringify({ ...apiRequest, stream: true }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
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
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch { /* skip malformed lines */ }
      }
    }
  }

  /**
   * Call Ollama API
   * Uses stream=true internally to avoid headersTimeout on slow responses,
   * but buffers the full response before returning (acts like non-streaming).
   */
  private async ollamaChatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    let success = true;
    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      // Convert multimodal messages to text-only for Ollama (doesn't support content arrays)
      const normalizedMessages = request.messages.map(msg => {
        if (Array.isArray(msg.content)) {
          // Convert content array to string with image URLs
          const textParts: string[] = [];
          const imageParts: string[] = [];

          for (const part of msg.content) {
            if (part.type === 'text' && part.text) {
              textParts.push(part.text);
            } else if (part.type === 'image_url' && part.image_url?.url) {
              imageParts.push(part.image_url.url);
            }
          }

          let content = textParts.join('\n');
          if (imageParts.length > 0) {
            content += `\n\n[Image URLs: ${imageParts.join(', ')}]`;
          }

          return { ...msg, content };
        }
        return msg;
      });

      const ollamaBody = {
        model: request.model,
        messages: normalizedMessages,
        stream: true,  // Use streaming to send headers immediately
        tools: request.tools,
        options: {
          temperature: request.temperature,
          num_predict: request.max_tokens,
        },
      };
      console.log('[Ollama] Sending tools:', JSON.stringify(request.tools?.map(t => t.function?.name)));
      let response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ollamaBody),
        signal: AbortSignal.timeout(600000),
      });

      // If model doesn't support tools, retry without them
      if (!response.ok && request.tools?.length) {
        const errorText = await response.text();
        if (errorText.includes('does not support tools')) {
          console.log('[Ollama] Model does not support tools, retrying without tools');
          response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...ollamaBody, tools: undefined }),
            signal: AbortSignal.timeout(600000),
          });
        } else {
          statusCode = response.status;
          success = false;
          errorMessage = errorText || response.statusText;
          await this.logMetrics({
            model: request.model,
            provider: 'ollama',
            responseTime: Date.now() - startTime,
            success: false,
            statusCode,
            errorMessage,
            errorType: this.getErrorType(statusCode, errorMessage),
          });
          throw new Error(errorMessage);
        }
      }

      statusCode = response.status;

      if (!response.ok) {
        success = false;
        const errorText = await response.text();
        errorMessage = errorText || response.statusText;

        await this.logMetrics({
          model: request.model,
          provider: 'ollama',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode,
          errorMessage,
          errorType: this.getErrorType(statusCode, errorMessage),
        });

        throw new Error(errorMessage);
      }

      // Read the stream and reconstruct the final response.
      // Tool calls come in intermediate chunks (done: false); the final chunk
      // (done: true) only contains usage stats and no message content.
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: any = null;
      let messageContent = '';
      let messageToolCalls: any[] | undefined;

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
              messageContent += parsed.message.content;
            }
            if (parsed.message?.tool_calls) {
              messageToolCalls = parsed.message.tool_calls;
            }
            if (parsed.done) {
              finalData = parsed;
            }
          } catch { /* skip malformed lines */ }
        }
      }

      if (!finalData) {
        throw new Error('No final response from Ollama stream');
      }

      console.log('[Ollama] tool_calls received:', JSON.stringify(messageToolCalls));
      console.log('[Ollama] finish_reason:', finalData.done_reason);

      const data = finalData;

      // Convert Ollama response to standard format
      const standardResponse: LLMResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: messageContent,
            tool_calls: messageToolCalls,
          },
          finish_reason: data.done_reason || (data.done ? 'stop' : 'length'),
        }],
        usage: {
          prompt_tokens: data.prompt_eval_count || 0,
          completion_tokens: data.eval_count || 0,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: request.model,
      };

      // Log success metrics
      await this.logMetrics({
        model: request.model,
        provider: 'ollama',
        responseTime: Date.now() - startTime,
        success: true,
        statusCode: 200,
        usage: standardResponse.usage,
        hasTools: request.tools && request.tools.length > 0,
        messageCount: request.messages.length,
      });

      return standardResponse;
    } catch (error: any) {
      // Ensure metrics are logged even if there's an exception
      if (success) {
        await this.logMetrics({
          model: request.model,
          provider: 'ollama',
          responseTime: Date.now() - startTime,
          success: false,
          statusCode: statusCode || 500,
          errorMessage: error.message,
          errorType: error.name || 'Error',
        });
      }
      throw error;
    }
  }

  /**
   * Stream Anthropic API response
   */
  private async *anthropicStreamChatCompletion(request: LLMRequest): AsyncGenerator<string> {
    const systemMsg = request.messages.find(m => m.role === 'system');
    const systemPrompt = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : '') : '';
    const messages = convertToAnthropicMessages(request.messages);

    // Convert tools from OpenAI to Anthropic format
    const tools = request.tools?.map((tool: any) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
    })) || [];

    try {
      const stream = this.anthropicClient!.messages.stream({
        model: request.model,
        max_tokens: request.max_tokens || 4096,
        system: systemPrompt || undefined,
        tools: tools.length > 0 ? tools : undefined,
        messages: messages,
        temperature: request.temperature,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (error: any) {
      throw new Error(`Anthropic streaming error: ${error.message}`);
    }
  }

  /**
   * Call Anthropic API (non-streaming)
   */
  private async anthropicChatCompletion(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    let success = true;
    let statusCode = 200;
    let errorMessage: string | undefined;

    try {
      const systemMsg = request.messages.find(m => m.role === 'system');
      const systemPrompt = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : '') : '';
      const messages = convertToAnthropicMessages(request.messages);

      // Convert tools from OpenAI to Anthropic format
      const tools = request.tools?.map((tool: any) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      })) || [];

      const response = await this.anthropicClient!.messages.create({
        model: request.model,
        max_tokens: request.max_tokens || 4096,
        system: systemPrompt || undefined,
        tools: tools.length > 0 ? tools : undefined,
        messages: messages,
        temperature: request.temperature,
      });

      // Convert Anthropic response to OpenAI format
      let content = '';
      const toolCalls: any[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      const llmResponse: LLMResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: content,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
          finish_reason: response.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
        }],
        model: request.model,
        usage: response.usage ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        } : undefined,
      };

      await this.logMetrics({
        model: request.model,
        provider: 'anthropic',
        responseTime: Date.now() - startTime,
        success: true,
        statusCode: 200,
      });

      return llmResponse;
    } catch (error: any) {
      success = false;
      statusCode = error.status || 500;
      errorMessage = error.message || error.error?.message || 'Unknown error';

      await this.logMetrics({
        model: request.model,
        provider: 'anthropic',
        responseTime: Date.now() - startTime,
        success: false,
        statusCode: statusCode,
        errorMessage: errorMessage,
        errorType: error.name || 'Error',
      });

      throw error;
    }
  }

  /**
   * Log metrics directly from the authenticated runtime context.
   */
  private async logMetrics(data: {
    model: string;
    provider: string;
    responseTime: number;
    success: boolean;
    statusCode: number;
    errorMessage?: string;
    errorType?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    hasTools?: boolean;
    messageCount?: number;
  }) {
    try {
      // Log API call metrics
      await metricsService.logApiCall({
        api_name: data.provider === 'github' ? 'github-models' : data.provider === 'gemini' ? 'gemini' : data.provider === 'anthropic' ? 'anthropic' : 'ollama',
        endpoint: '/chat/completions',
        method: 'POST',
        response_time_ms: data.responseTime,
        status_code: data.statusCode,
        success: data.success,
        error_message: data.errorMessage,
        error_type: data.errorType,
        user_id: this._userId,
        metadata: {
          model: data.model,
          has_tools: data.hasTools,
          message_count: data.messageCount,
        },
      });

      // Log token usage if successful
      if (data.success && data.usage) {
        const estimatedCost = data.provider !== 'ollama'
          ? this.calculateCost(data.model, data.usage)
          : 0;

        await metricsService.logTokenUsage({
          model: data.model,
          provider: data.provider === 'github' ? 'github-models' : data.provider === 'gemini' ? 'gemini' : data.provider === 'anthropic' ? 'anthropic' : 'ollama',
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
          estimated_cost_usd: estimatedCost,
          user_id: this._userId,
          conversation_id: this._conversationId,
          metadata: {
            has_tools: data.hasTools,
            message_count: data.messageCount,
          },
        });
      }
    } catch (error) {
      console.error('Failed to log metrics:', error);
      // Don't throw - metrics failures shouldn't break the app
    }
  }

  /**
   * Calculate estimated cost based on model and usage
   * GitHub Models is free during preview, but we track as if it was paid
   */
  private calculateCost(model: string, usage: {
    prompt_tokens: number;
    completion_tokens: number;
  }): number {
    // Prices in USD per 1M tokens (kept in sync with model_pricing DB table)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o':                    { input: 2.500000, output: 10.000000 },
      'gpt-4o-mini':               { input: 0.150000, output:  0.600000 },
      'o1-preview':                { input: 15.00000, output: 60.000000 },
      'o1-mini':                   { input: 3.000000, output: 12.000000 },
      'ministral-3b':              { input: 0.040000, output:  0.040000 },
      'gemini-2.5-flash':          { input: 0.150000, output:  0.600000 },
      'claude-haiku-4-5-20251001': { input: 0.800000, output:  4.000000 },
      'claude-sonnet-4-6':         { input: 3.000000, output: 15.000000 },
      'claude-opus-4-7':           { input: 15.00000, output: 75.000000 },
    };

    const modelPricing = pricing[model] ?? { input: 0, output: 0 };

    const inputCost = (usage.prompt_tokens / 1_000_000) * modelPricing.input;
    const outputCost = (usage.completion_tokens / 1_000_000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Determine error type from status code and message
   */
  private getErrorType(statusCode: number, message?: string): string {
    const msg = typeof message === 'string' ? message : '';
    if (msg.includes('Rate limit')) return 'RateLimitError';
    if (msg.includes('authentication')) return 'AuthenticationError';
    if (msg.includes('quota')) return 'QuotaError';

    switch (statusCode) {
      case 400: return 'BadRequestError';
      case 401: return 'AuthenticationError';
      case 403: return 'PermissionError';
      case 404: return 'NotFoundError';
      case 429: return 'RateLimitError';
      case 500: return 'ServerError';
      case 503: return 'ServiceUnavailableError';
      default: return 'APIError';
    }
  }
}
