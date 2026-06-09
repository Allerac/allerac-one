/**
 * Image Upload Service Factory
 *
 * Azure Blob Storage is the supported image hosting provider.
 */

import { ImageUploadService } from './image-upload.interface';
import { AzureStorageUploadService } from './azure-storage-upload.service';

let uploadServiceInstance: ImageUploadService | null = null;

function createUploadService(): ImageUploadService {
  return new AzureStorageUploadService();
}

export function getImageUploadService(): ImageUploadService {
  if (!uploadServiceInstance) {
    uploadServiceInstance = createUploadService();
    console.log('[ImageUpload] Using provider: Azure Blob Storage');
  }
  return uploadServiceInstance;
}

export type { ImageUploadService, UploadedImage } from './image-upload.interface';
