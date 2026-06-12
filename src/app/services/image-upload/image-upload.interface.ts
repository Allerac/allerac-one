/**
 * Image Upload Service — Strategy Pattern
 *
 * Abstracts image upload implementation from its consumers.
 */

export interface UploadedImage {
  publicUrl: string;
  id?: string;
}

export interface ImageUploadService {
  /**
   * Upload an image file and return a public URL
   * @param buffer Image file buffer (JPEG, PNG, GIF, etc)
   * @param filename Original filename (optional)
   * @returns Public URL to the uploaded image
   */
  upload(buffer: Buffer, filename?: string, directory?: string): Promise<UploadedImage>;
}
