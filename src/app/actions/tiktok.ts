'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';
import { getImageUploadService } from '@/app/services/image-upload';
import {
  TikTokApiService,
  type TikTokPhotoPostInput,
  type TikTokPrivacyLevel,
  type TikTokPublishStatus,
} from '@/app/services/tiktok/tiktok-api.service';
import { TikTokCredentialsService } from '@/app/services/tiktok/tiktok-credentials.service';
import sharp from 'sharp';

const api = new TikTokApiService();
const credentials = new TikTokCredentialsService();
const MAX_PHOTOS = 35;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export interface TikTokPhotoPublishRequest {
  imagesBase64: string[];
  title: string;
  description: string;
  privacyLevel: TikTokPrivacyLevel;
  allowComment: boolean;
  autoAddMusic: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  photoCoverIndex?: number;
}

async function requireTikTokAccessToken(userId: string): Promise<string> {
  const accessToken = await credentials.getValidAccessToken(userId);
  if (!accessToken) throw new Error('tiktok_not_connected');
  return accessToken;
}

async function prepareTikTokPhoto(imageBase64: string, index: number): Promise<string> {
  const normalized = imageBase64.includes(',') ? imageBase64.split(',').pop() || '' : imageBase64;
  const rawBuffer = Buffer.from(normalized, 'base64');
  if (!rawBuffer.length || rawBuffer.length > MAX_PHOTO_BYTES) {
    throw new Error('tiktok_invalid_photo_size');
  }
  const image = sharp(rawBuffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('tiktok_invalid_photo');

  const buffer = metadata.format === 'jpeg'
    ? rawBuffer
    : await image.jpeg({ quality: 92 }).toBuffer();
  const uploaded = await getImageUploadService().upload(
    buffer,
    `photo-${index + 1}.jpg`,
    'tiktok',
  );
  const requiredPrefix = process.env.TIKTOK_MEDIA_URL_PREFIX?.trim();
  if (requiredPrefix && !uploaded.publicUrl.startsWith(requiredPrefix)) {
    throw new Error('tiktok_media_url_prefix_mismatch');
  }
  return uploaded.publicUrl;
}

export async function getTikTokStatus() {
  const user = await requireCurrentUser();
  return credentials.getStatus(user.id);
}

export async function getTikTokCreatorInfo() {
  const user = await requireCurrentUser();
  try {
    const accessToken = await requireTikTokAccessToken(user.id);
    return { success: true as const, creator: await api.getCreatorInfo(accessToken) };
  } catch (error) {
    console.error('[TikTok] Creator info failed');
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'tiktok_creator_info_failed',
    };
  }
}

export async function publishTikTokPhotos(
  request: TikTokPhotoPublishRequest,
): Promise<{ success: true; publishId: string } | { success: false; error: string }> {
  const user = await requireCurrentUser();
  try {
    if (!Array.isArray(request.imagesBase64) || request.imagesBase64.length < 1 || request.imagesBase64.length > MAX_PHOTOS) {
      return { success: false, error: 'tiktok_photo_count_invalid' };
    }
    if (!request.title.trim() || request.title.length > 90) {
      return { success: false, error: 'tiktok_title_invalid' };
    }
    if (request.description.length > 4000) {
      return { success: false, error: 'tiktok_description_invalid' };
    }
    if (request.brandedContent && request.privacyLevel === 'SELF_ONLY') {
      return { success: false, error: 'tiktok_branded_content_private' };
    }

    const accessToken = await requireTikTokAccessToken(user.id);
    const creator = await api.getCreatorInfo(accessToken);
    if (!creator.privacyLevelOptions.includes(request.privacyLevel)) {
      return { success: false, error: 'tiktok_privacy_unavailable' };
    }

    const photoImages = await Promise.all(request.imagesBase64.map(prepareTikTokPhoto));
    const input: TikTokPhotoPostInput = {
      title: request.title.trim(),
      description: request.description.trim(),
      privacyLevel: request.privacyLevel,
      disableComment: creator.commentDisabled || !request.allowComment,
      autoAddMusic: request.autoAddMusic,
      brandContentToggle: request.brandedContent,
      brandOrganicToggle: request.yourBrand,
      photoImages,
      photoCoverIndex: Math.min(
        Math.max(request.photoCoverIndex ?? 0, 0),
        photoImages.length - 1,
      ),
    };
    const result = await api.publishPhoto(accessToken, input);
    return { success: true, publishId: result.publishId };
  } catch (error) {
    console.error('[TikTok] Photo publish failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'tiktok_publish_failed',
    };
  }
}

export async function getTikTokPublishStatus(
  publishId: string,
): Promise<{ success: true; status: TikTokPublishStatus } | { success: false; error: string }> {
  const user = await requireCurrentUser();
  try {
    if (!publishId || publishId.length > 64) return { success: false, error: 'tiktok_publish_id_invalid' };
    const accessToken = await requireTikTokAccessToken(user.id);
    return { success: true, status: await api.getPublishStatus(accessToken, publishId) };
  } catch (error) {
    console.error('[TikTok] Publish status failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'tiktok_publish_status_failed',
    };
  }
}

export async function disconnectTikTok(): Promise<{ success: true } | { success: false; error: string }> {
  const user = await requireCurrentUser();
  try {
    await credentials.disconnect(user.id);
    return { success: true };
  } catch {
    console.error('[TikTok] Disconnect failed');
    return { success: false, error: 'tiktok_disconnect_failed' };
  }
}
