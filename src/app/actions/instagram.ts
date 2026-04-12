'use server';

import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { getImageUploadService } from '@/app/services/image-upload';
import { LLMService } from '@/app/services/llm/llm.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { InstagramTool } from '@/app/tools/instagram.tool';

const credService = new InstagramCredentialsService();
const igTool = new InstagramTool();

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
  topic?: string
): Promise<{ success: true; caption: string } | { success: false; error: string }> {
  try {
    const userSettingsService = new UserSettingsService();
    const settings = await userSettingsService.loadUserSettings(userId);
    const githubToken = settings?.github_token || '';
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
  caption?: string
): Promise<{ success: true; tags: string } | { success: false; error: string }> {
  try {
    const userSettingsService = new UserSettingsService();
    const settings = await userSettingsService.loadUserSettings(userId);
    const githubToken = settings?.github_token || '';
    if (!githubToken) {
      return { success: false, error: 'GitHub token is required. Please configure it in Settings → API Keys.' };
    }
    const llmService = new LLMService('github', 'https://models.inference.ai.azure.com', { githubToken });

    const prompt = caption
      ? `Generate 10-15 relevant Instagram hashtags for a post with this caption: "${caption}". Return only hashtags separated by spaces, no numbering.`
      : `Generate 10-15 relevant Instagram hashtags for general engagement. Return only hashtags separated by spaces, no numbering.`;

    const response = await llmService.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
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
