/**
 * Azure Storage Blob Upload Service
 *
 * Uploads images to Azure Blob Storage using DefaultAzureCredential.
 * Works seamlessly with Managed Identity on Azure VMs — no keys needed.
 *
 * Env vars required:
 *   AZURE_STORAGE_ACCOUNT_NAME  - Name of your storage account (e.g., alleracstorage)
 *   AZURE_STORAGE_CONTAINER_NAME - Name of blob container (e.g., instagram-posts)
 *
 * Local development:
 *   - Install Azure CLI and run `az login`
 *   - DefaultAzureCredential will use your CLI credentials
 *
 * Azure VM deployment:
 *   - Assign Managed Identity to the VM
 *   - Grant "Storage Blob Data Contributor" role to the identity
 *   - No env vars or keys needed — DefaultAzureCredential handles auth
 */

import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { ImageUploadService, UploadedImage } from './image-upload.interface';

const ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME ?? '';
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME ?? '';

if (!ACCOUNT_NAME || !CONTAINER_NAME) {
  console.warn('[AzureStorageUploadService] AZURE_STORAGE_ACCOUNT_NAME or AZURE_STORAGE_CONTAINER_NAME not set. Image uploads will fail.');
}

export class AzureStorageUploadService implements ImageUploadService {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;

  constructor() {
    if (!ACCOUNT_NAME || !CONTAINER_NAME) {
      throw new Error('Azure Storage configuration missing (AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_CONTAINER_NAME)');
    }

    this.containerName = CONTAINER_NAME;

    // DefaultAzureCredential tries credentials in this order:
    // 1. EnvironmentCredential (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
    // 2. ManagedIdentityCredential (on Azure VMs)
    // 3. AzureCliCredential (local `az login`)
    // 4. VisualStudioCodeCredential (VS Code)
    const credential = new DefaultAzureCredential();

    this.blobServiceClient = new BlobServiceClient(
      `https://${ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
  }

  async upload(buffer: Buffer, filename?: string): Promise<UploadedImage> {
    try {
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);

      // Generate unique blob name: timestamp + original filename
      const timestamp = Date.now();
      const blobName = `${timestamp}-${filename || 'image.jpg'}`;

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // Upload with content type
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'image/jpeg',
        },
      });

      // Return public URL (container must have public access level: Blob)
      const publicUrl = `${blockBlobClient.url}`;

      console.log(`[AzureStorage] Uploaded to: ${publicUrl}`);

      return {
        publicUrl,
        id: blobName,
      };
    } catch (error: any) {
      throw new Error(`Image upload to Azure Storage failed: ${error.message}`);
    }
  }
}
