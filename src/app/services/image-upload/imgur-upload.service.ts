/**
 * Imgur Upload Service
 *
 * Uploads images to Imgur (free tier).
 * Returns public CDN URL that Instagram can validate.
 *
 * Env vars required:
 *   IMGUR_CLIENT_ID  - Get from https://api.imgur.com/oauth2/addclient
 */

import { ImageUploadService, UploadedImage } from './image-upload.interface';

const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID ?? '';
const IMGUR_UPLOAD_URL = 'https://api.imgur.com/3/upload';

if (!IMGUR_CLIENT_ID) {
  console.warn('[ImgurUploadService] IMGUR_CLIENT_ID not set. Image uploads will fail.');
}

export class ImgurUploadService implements ImageUploadService {
  async upload(buffer: Buffer, filename?: string): Promise<UploadedImage> {
    if (!IMGUR_CLIENT_ID) {
      throw new Error('IMGUR_CLIENT_ID is not configured');
    }

    try {
      // Create FormData with image
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' });
      formData.append('image', blob, filename || 'image.jpg');
      formData.append('type', 'file');

      // Upload to Imgur
      const response = await fetch(IMGUR_UPLOAD_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Imgur upload failed: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        success: boolean;
        data: {
          link: string;
          deletehash: string;
          id: string;
        };
      };

      if (!data.success || !data.data.link) {
        throw new Error('Imgur upload returned invalid response');
      }

      return {
        publicUrl: data.data.link,
        id: data.data.id,
        deletedHash: data.data.deletehash,
      };
    } catch (error: any) {
      throw new Error(`Image upload to Imgur failed: ${error.message}`);
    }
  }
}
