/**
 * Image Upload Service Factory
 *
 * Configurable provider selection via env vars.
 * Env var: UPLOAD_PROVIDER (default: 'imgur')
 *   - 'imgur': Free, quick PoC
 *   - 's3': AWS S3 (scalable, production-grade)
 */

import { ImageUploadService } from './image-upload.interface';
import { ImgurUploadService } from './imgur-upload.service';

const UPLOAD_PROVIDER = process.env.UPLOAD_PROVIDER ?? 'imgur';

let uploadServiceInstance: ImageUploadService | null = null;

function createUploadService(): ImageUploadService {
  if (UPLOAD_PROVIDER === 's3') {
    // TODO: Import S3UploadService when ready
    // return new S3UploadService();
    throw new Error('S3 provider not yet implemented. Set UPLOAD_PROVIDER=imgur');
  }

  // Default to Imgur
  return new ImgurUploadService();
}

export function getImageUploadService(): ImageUploadService {
  if (!uploadServiceInstance) {
    uploadServiceInstance = createUploadService();
    console.log(`[ImageUpload] Using provider: ${UPLOAD_PROVIDER}`);
  }
  return uploadServiceInstance;
}

export type { ImageUploadService, UploadedImage } from './image-upload.interface';
