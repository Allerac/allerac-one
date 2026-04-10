/**
 * Image Upload Service Factory
 *
 * Configurable provider selection via env vars.
 * Env var: UPLOAD_PROVIDER (default: 'azure')
 *   - 'azure': Azure Blob Storage (recommended for Azure deployments)
 *   - 'imgur': Free, quick PoC
 *   - 's3': AWS S3 (scalable, production-grade)
 */

import { ImageUploadService } from './image-upload.interface';
import { ImgurUploadService } from './imgur-upload.service';
import { AzureStorageUploadService } from './azure-storage-upload.service';

const UPLOAD_PROVIDER = process.env.UPLOAD_PROVIDER ?? 'azure';

let uploadServiceInstance: ImageUploadService | null = null;

function createUploadService(): ImageUploadService {
  if (UPLOAD_PROVIDER === 'azure') {
    return new AzureStorageUploadService();
  }

  if (UPLOAD_PROVIDER === 'imgur') {
    return new ImgurUploadService();
  }

  if (UPLOAD_PROVIDER === 's3') {
    // TODO: Import S3UploadService when ready
    // return new S3UploadService();
    throw new Error('S3 provider not yet implemented. Set UPLOAD_PROVIDER=azure or imgur');
  }

  throw new Error(`Unknown UPLOAD_PROVIDER: ${UPLOAD_PROVIDER}`);
}

export function getImageUploadService(): ImageUploadService {
  if (!uploadServiceInstance) {
    uploadServiceInstance = createUploadService();
    console.log(`[ImageUpload] Using provider: ${UPLOAD_PROVIDER}`);
  }
  return uploadServiceInstance;
}

export type { ImageUploadService, UploadedImage } from './image-upload.interface';
