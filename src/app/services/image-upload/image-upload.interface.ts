/**
 * Image Upload Service — Strategy Pattern
 *
 * Abstracts image upload implementation.
 * Can be swapped between Imgur (PoC), S3, CloudFlare R2, etc.
 */

export interface UploadedImage {
  publicUrl: string;
  id?: string;
  deletedHash?: string; // For Imgur, in case we want to delete later
}

export interface ImageUploadService {
  /**
   * Upload an image file and return a public URL
   * @param buffer Image file buffer (JPEG, PNG, GIF, etc)
   * @param filename Original filename (optional)
   * @returns Public URL to the uploaded image
   */
  upload(buffer: Buffer, filename?: string): Promise<UploadedImage>;
}
