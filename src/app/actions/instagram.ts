'use server';

import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { getImageUploadService } from '@/app/services/image-upload';
import { LLMService } from '@/app/services/llm/llm.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { InstagramTool } from '@/app/tools/instagram.tool';
import pool from '@/app/clients/db';

const credService = new InstagramCredentialsService();
const igTool = new InstagramTool();
const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

const LOCALE_NAMES: Record<string, string> = { pt: 'Portuguese', es: 'Spanish', en: 'English', fr: 'French', de: 'German', it: 'Italian' };

async function resolveGithubToken(userId: string): Promise<string> {
  const [settings, sysSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  return settings?.github_token || sysSettings.github_token || process.env.GITHUB_TOKEN || '';
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

/**
 * Generate Instagram caption using LLM
 * @param imageInput - Either a public image URL (http/https) or base64-encoded image data
 */
export async function generateCaption(
  imageInput: string,
  userId: string,
  topic?: string,
  locale = 'en'
): Promise<{ success: true; caption: string } | { success: false; error: string }> {
  try {
    const [githubToken, systemPrompt] = await Promise.all([
      resolveGithubToken(userId),
      buildSocialSystemPrompt(userId, locale),
    ]);
    if (!githubToken) {
      return { success: false, error: 'GitHub token is required. Please configure it in Settings → API Keys.' };
    }
    const llmService = new LLMService('github', 'https://models.inference.ai.azure.com', { githubToken });

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
      model: 'gpt-4o-mini',
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
  locale = 'en'
): Promise<{ success: true; tags: string } | { success: false; error: string }> {
  try {
    const [githubToken, systemPrompt] = await Promise.all([
      resolveGithubToken(userId),
      buildSocialSystemPrompt(userId, locale),
    ]);
    if (!githubToken) {
      return { success: false, error: 'GitHub token is required. Please configure it in Settings → API Keys.' };
    }
    const llmService = new LLMService('github', 'https://models.inference.ai.azure.com', { githubToken });

    const prompt = caption
      ? `Generate 10-15 relevant Instagram hashtags for a post with this caption: "${caption}". Return only hashtags separated by spaces, no numbering.`
      : `Generate 10-15 relevant Instagram hashtags for general engagement. Return only hashtags separated by spaces, no numbering.`;

    const response = await llmService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      model: 'gpt-4o-mini',
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

function getJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const segLen = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + segLen;
  }
  return null;
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
    const buffer = Buffer.from(imageBase64, 'base64');

    // Validate image format — Instagram only accepts JPEG
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    if (isPng) {
      return { success: false, error: 'O Instagram só aceita imagens JPEG. Converte a imagem para JPG antes de publicar.' };
    }
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    if (!isJpeg) {
      return { success: false, error: 'Formato de imagem não suportado. O Instagram só aceita imagens JPEG.' };
    }

    // Validate image dimensions (Instagram requires min 320px)
    const dims = getJpegDimensions(buffer);
    if (dims && (dims.width < 320 || dims.height < 320)) {
      return { success: false, error: `A imagem é demasiado pequena (${dims.width}x${dims.height}px). O Instagram requer no mínimo 320x320px.` };
    }

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
