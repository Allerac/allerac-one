'use server';

import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { getImageUploadService } from '@/app/services/image-upload';
import { LLMService } from '@/app/services/llm/llm.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { InstagramTool } from '@/app/tools/instagram.tool';
import pool from '@/app/clients/db';
import sharp from 'sharp';

const credService = new InstagramCredentialsService();
const igTool = new InstagramTool();
const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

const LOCALE_NAMES: Record<string, string> = { pt: 'Portuguese', es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian' };

type LLMProviderType = 'github' | 'gemini' | 'anthropic' | 'ollama';

async function resolveLLMConfig(userId: string, provider: LLMProviderType): Promise<{ token: string; baseUrl: string }> {
  const [settings, sysSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  switch (provider) {
    case 'gemini':
      return {
        token: settings?.google_api_key || sysSettings.google_api_key || '',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      };
    case 'anthropic':
      return {
        token: settings?.anthropic_api_key || sysSettings.anthropic_api_key || '',
        baseUrl: 'https://api.anthropic.com',
      };
    case 'ollama':
      return { token: '', baseUrl: '/api/ollama' };
    default:
      return {
        token: settings?.github_token || sysSettings.github_token || process.env.GITHUB_TOKEN || '',
        baseUrl: 'https://models.inference.ai.azure.com',
      };
  }
}

async function buildSocialSystemPrompt(userId: string, locale: string): Promise<string> {
  const language = LOCALE_NAMES[locale] ?? 'English';
  const res = await pool.query(
    `SELECT content FROM user_domain_instructions WHERE user_id = $1 AND domain_slug = 'social'`,
    [userId]
  );
  const userInstructions = res.rows[0]?.content?.trim() || '';
  const parts = [
    `You are a social media expert. Always respond in ${language}.`,
    userInstructions,
  ].filter(Boolean);
  return parts.join('\n\n');
}

export async function getInstagramStatus(userId: string) {
  return credService.getStatus(userId);
}

export async function disconnectInstagram(userId: string) {
  await credService.disconnect(userId);
}

/** Debug: show what scopes the stored token actually has */
export async function debugTokenPermissions(userId: string): Promise<{ success: boolean; data: any }> {
  try {
    const accessToken = await credService.getAccessToken(userId);
    if (!accessToken) return { success: false, data: 'No token found' };
    const appId     = process.env.INSTAGRAM_APP_ID     ?? '';
    const appSecret = process.env.INSTAGRAM_APP_SECRET ?? '';
    const appToken  = `${appId}|${appSecret}`;
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${encodeURIComponent(appToken)}`
    );
    const data = await res.json();
    console.log('[Instagram] Token debug:', JSON.stringify(data));
    const scopes: string[] = data?.data?.scopes ?? [];
    return { success: res.ok, data: scopes.length ? scopes : data };
  } catch (err: any) {
    return { success: false, data: err.message };
  }
}

/** Re-subscribe the connected account to both messages and comments webhooks */
export async function resubscribeWebhooks(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const status = await credService.getStatus(userId);
    if (!status.is_connected) return { success: false, message: 'No connected Instagram account' };

    const accessToken = await credService.getAccessToken(userId);
    if (!accessToken) return { success: false, message: 'No access token found' };

    const igUserId = status.ig_business_user_id ?? status.ig_user_id;
    if (!igUserId) return { success: false, message: 'No Instagram user ID found' };

    const res = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ subscribed_fields: 'messages,comments' }),
      }
    );
    const data = await res.json();
    console.log('[Instagram] resubscribeWebhooks:', JSON.stringify(data));
    if (data.success) return { success: true, message: `Subscribed to messages + comments` };
    return { success: false, message: JSON.stringify(data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Generate Instagram caption using LLM
 * @param imageInput - Either a public image URL (http/https) or base64-encoded image data
 * @param modelId - Model ID from user's selection (e.g. 'gemini-2.5-flash', 'gpt-4o-mini')
 * @param provider - Provider from user's selection ('github' | 'gemini' | 'anthropic' | 'ollama')
 */
export async function generateCaption(
  imageInput: string,
  userId: string,
  topic?: string,
  locale = 'en',
  modelId = 'gpt-4o-mini',
  provider: LLMProviderType = 'github'
): Promise<{ success: true; caption: string } | { success: false; error: string }> {
  try {
    const [llmConfig, systemPrompt] = await Promise.all([
      resolveLLMConfig(userId, provider),
      buildSocialSystemPrompt(userId, locale),
    ]);
    if (provider !== 'ollama' && !llmConfig.token) {
      return { success: false, error: `API key for ${provider} not configured. Please add it in Settings → API Keys.` };
    }
    const llmService = new LLMService(provider, llmConfig.baseUrl, {
      githubToken: provider === 'github' ? llmConfig.token : undefined,
      geminiToken: provider === 'gemini' ? llmConfig.token : undefined,
      anthropicToken: provider === 'anthropic' ? llmConfig.token : undefined,
    });

    const imageMessage = topic
      ? `Generate a creative and engaging Instagram caption for a post about "${topic}". Include relevant context but keep it concise (max 150 chars for the caption itself).`
      : `Generate a creative and engaging Instagram caption for this image. Keep it concise and engaging (max 150 chars).`;

    // Detect if input is a URL, data URI, or base64
    let imageUrl: string;
    if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
      // Public URL
      imageUrl = imageInput;
    } else if (imageInput.startsWith('data:')) {
      // Already a data URI
      imageUrl = imageInput;
    } else {
      // Plain base64, add data URI prefix
      imageUrl = `data:image/jpeg;base64,${imageInput}`;
    }

    const response = await llmService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: imageMessage },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      model: modelId,
      temperature: 0.7,
      max_tokens: 200,
    });

    const caption = response.choices[0]?.message?.content || '';
    if (!caption) {
      return { success: false, error: 'Failed to generate caption' };
    }

    return { success: true, caption };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate Instagram hashtags using LLM
 */
export async function generateTags(
  userId: string,
  caption?: string,
  locale = 'en',
  modelId = 'gpt-4o-mini',
  provider: LLMProviderType = 'github'
): Promise<{ success: true; tags: string } | { success: false; error: string }> {
  try {
    const [llmConfig, systemPrompt] = await Promise.all([
      resolveLLMConfig(userId, provider),
      buildSocialSystemPrompt(userId, locale),
    ]);
    if (provider !== 'ollama' && !llmConfig.token) {
      return { success: false, error: `API key for ${provider} not configured. Please add it in Settings → API Keys.` };
    }
    const llmService = new LLMService(provider, llmConfig.baseUrl, {
      githubToken: provider === 'github' ? llmConfig.token : undefined,
      geminiToken: provider === 'gemini' ? llmConfig.token : undefined,
      anthropicToken: provider === 'anthropic' ? llmConfig.token : undefined,
    });

    const prompt = caption
      ? `Generate 10-15 relevant Instagram hashtags for a post with this caption: "${caption}". Return only hashtags separated by spaces, no numbering.`
      : `Generate 10-15 relevant Instagram hashtags for general engagement. Return only hashtags separated by spaces, no numbering.`;

    const response = await llmService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      model: modelId,
      temperature: 0.6,
      max_tokens: 150,
    });

    const tags = response.choices[0]?.message?.content || '';
    if (!tags) {
      return { success: false, error: 'Failed to generate tags' };
    }

    return { success: true, tags };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


/**
 * Publish Instagram post
 */
export async function publishInstagramPost(
  userId: string,
  imageBase64: string,
  caption: string
): Promise<{ success: true; postId: string; message: string } | { success: false; error: string }> {
  try {
    // Convert base64 to buffer
    const rawBuffer = Buffer.from(imageBase64, 'base64');

    // Convert to JPEG (handles PNG, WebP, HEIC, GIF, etc. transparently)
    const image = sharp(rawBuffer);
    const meta = await image.metadata();

    if (!meta.width || !meta.height) {
      return { success: false, error: 'Não foi possível ler a imagem. Verifica se o ficheiro está correto.' };
    }

    // Validate dimensions (Instagram requires min 320px)
    if (meta.width < 320 || meta.height < 320) {
      return { success: false, error: `A imagem é demasiado pequena (${meta.width}x${meta.height}px). O Instagram requer no mínimo 320x320px.` };
    }

    // Convert to JPEG if not already (Instagram only accepts JPEG)
    const buffer = meta.format === 'jpeg'
      ? rawBuffer
      : await image.jpeg({ quality: 92 }).toBuffer();

    // Upload to Imgur
    const uploadService = getImageUploadService();
    const uploaded = await uploadService.upload(buffer, 'instagram-post.jpg');

    // Publish via Instagram tool
    const result = await igTool.publishPost(userId, caption, uploaded.publicUrl);

    if ('error' in result) {
      return { success: false, error: (result as any).error };
    }

    return {
      success: true,
      postId: (result as any).post_id,
      message: (result as any).message,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
