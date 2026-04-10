import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';
import { getImageUploadService } from '@/app/services/image-upload';

const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

export class InstagramTool {
  async publishPost(userId: string, caption: string, imageUrl?: string, imageBuffer?: Buffer): Promise<object> {
    const status = await credService.getStatus(userId);
    if (!status.is_connected) {
      return { error: 'Instagram not connected. Ask the user to connect their Instagram account in Settings → Social.' };
    }

    const accessToken = await credService.getAccessToken(userId);
    if (!accessToken) {
      return { error: 'Could not retrieve Instagram access token.' };
    }

    // Determine the final image URL — either provided or auto-upload
    let finalImageUrl = imageUrl;

    if (!finalImageUrl && imageBuffer) {
      // Auto-upload image buffer
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
      // Text-only posts are not supported by Instagram Graph API — return helpful error
      return { error: 'Instagram requires an image or video to publish a post. Please provide an image or image data.' };
    }

    try {
      const result = await instagramService.publishPost(accessToken, status.ig_user_id!, finalImageUrl, caption);
      return { success: true, post_id: result.id, message: `Post published successfully! Post ID: ${result.id}` };
    } catch (err: any) {
      return { error: `Failed to publish post: ${err.message}` };
    }
  }

  async getProfile(userId: string): Promise<object> {
    const status = await credService.getStatus(userId);
    if (!status.is_connected) {
      return { error: 'Instagram not connected.' };
    }

    const accessToken = await credService.getAccessToken(userId);
    if (!accessToken) return { error: 'Could not retrieve Instagram access token.' };

    try {
      const profile = await instagramService.getMe(accessToken);
      return { success: true, ...profile };
    } catch (err: any) {
      return { error: `Failed to get profile: ${err.message}` };
    }
  }

  async getRecentMedia(userId: string, limit = 6): Promise<object> {
    const status = await credService.getStatus(userId);
    if (!status.is_connected) return { error: 'Instagram not connected.' };

    const accessToken = await credService.getAccessToken(userId);
    if (!accessToken) return { error: 'Could not retrieve Instagram access token.' };

    try {
      const media = await instagramService.getMedia(accessToken, status.ig_user_id!, limit);
      return { success: true, posts: media };
    } catch (err: any) {
      return { error: `Failed to get media: ${err.message}` };
    }
  }
}
