import { getImageUploadService } from '@/app/services/image-upload';
import type { ChatImageAttachment } from './chat-request-parser';

export async function processChatImages(
  attachments?: ChatImageAttachment[],
): Promise<ChatImageAttachment[] | undefined> {
  if (!attachments?.length) return attachments;

  try {
    const uploadService = getImageUploadService();
    const processed: ChatImageAttachment[] = [];

    for (const image of attachments) {
      const dataUri = image.url.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!dataUri) {
        processed.push(image);
        continue;
      }

      const [, mimeType, base64] = dataUri;
      const buffer = Buffer.from(base64, 'base64');
      const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
      const uploaded = await uploadService.upload(
        buffer,
        `chat-image-${Date.now()}.${extension}`,
      );
      processed.push({ url: uploaded.publicUrl });
    }

    return processed;
  } catch (error: any) {
    console.warn('[ChatImageProcessor] Image upload failed:', error.message);
    return attachments;
  }
}
