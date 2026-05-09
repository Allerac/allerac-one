import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';
import { getImageUploadService } from '@/app/services/image-upload';

const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

export class InstagramTool {
  async publishPost(userId: string, caption: string, imageUrl?: string, imageBuffer?: Buffer): Promise<object> {
    const effectiveUserId = await credService.resolveCredentialsUserId(userId);
    const status = await credService.getStatus(effectiveUserId);
    if (!status.is_connected) {
      return { error: 'Instagram not connected. Ask the admin to connect an Instagram account.' };
    }

    const accessToken = await credService.getAccessToken(effectiveUserId);
    if (!accessToken) {
      return { error: 'Could not retrieve Instagram access token.' };
    }

    let finalImageUrl = imageUrl;

    if (!finalImageUrl && imageBuffer) {
      try {
        const uploadService = getImageUploadService();
        const uploaded = await uploadService.upload(imageBuffer, 'instagram-post.jpg');
        finalImageUrl = uploaded.publicUrl;
        console.log(`[Instagram] Image auto-uploaded to: ${finalImageUrl}`);
      } catch (err: any) {
        return { error: `Failed to upload image: ${err.message}` };
      }
    }

    if (!finalImageUrl) {
      return { error: 'Instagram requires an image or video to publish a post. Please provide an image or image data.' };
    }

    try {
      const businessUserId = status.ig_business_user_id || status.ig_user_id;
      if (!businessUserId) {
        return { error: 'No Instagram user ID available for publishing' };
      }
      const result = await instagramService.publishPost(accessToken, businessUserId, finalImageUrl, caption);
      return { success: true, post_id: result.id, message: `Post published successfully! Post ID: ${result.id}` };
    } catch (err: any) {
      return { error: `Failed to publish post: ${err.message}` };
    }
  }

  async getProfile(userId: string): Promise<object> {
    const effectiveUserId = await credService.resolveCredentialsUserId(userId);
    const status = await credService.getStatus(effectiveUserId);
    if (!status.is_connected) {
      return { error: 'Instagram not connected.' };
    }

    const accessToken = await credService.getAccessToken(effectiveUserId);
    if (!accessToken) return { error: 'Could not retrieve Instagram access token.' };

    try {
      const profile = await instagramService.getMe(accessToken);
      return { success: true, ...profile };
    } catch (err: any) {
      return { error: `Failed to get profile: ${err.message}` };
    }
  }

  async getRecentMedia(userId: string, limit = 6): Promise<object> {
    const effectiveUserId = await credService.resolveCredentialsUserId(userId);
    const status = await credService.getStatus(effectiveUserId);
    if (!status.is_connected) return { error: 'Instagram not connected.' };

    const accessToken = await credService.getAccessToken(effectiveUserId);
    if (!accessToken) return { error: 'Could not retrieve Instagram access token.' };

    try {
      const media = await instagramService.getMedia(accessToken, status.ig_user_id!, limit);
      return { success: true, posts: media };
    } catch (err: any) {
      return { error: `Failed to get media: ${err.message}` };
    }
  }
}
