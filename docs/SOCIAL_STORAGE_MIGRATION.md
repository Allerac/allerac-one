# Social Media Storage Migration

Migration completed on June 12, 2026. Social media uploads now use:

```env
AZURE_STORAGE_CONTAINER_NAME=social-posts
TIKTOK_MEDIA_URL_PREFIX=https://<storage-account>.blob.core.windows.net/social-posts/tiktok/
```

The upload service separates media with blob prefixes:

```text
social-posts/
  instagram/
  tiktok/
```

The previous `instagram-posts` container remains available for rollback and
for existing published media URLs. Do not delete it.

## Completed Checks

1. Created `social-posts` with public blob access.
2. Uploaded and publicly fetched a smoke-test image.
3. Removed the smoke-test image.
4. Updated the local container and TikTok media prefix.
5. Rebuilt and recreated the `app` service.
6. Confirmed the application is healthy and received the new environment values.

## External Checks

1. Verify this URL prefix in TikTok for Developers:

   ```text
   https://<storage-account>.blob.core.windows.net/social-posts/tiktok/
   ```

2. Restart the deployed application after updating its environment variables.
3. Publish an Instagram test image and carousel.
4. Publish a private TikTok photo post.

## Rollback

Set the previous container and restart:

```env
AZURE_STORAGE_CONTAINER_NAME=instagram-posts
TIKTOK_MEDIA_URL_PREFIX=https://<storage-account>.blob.core.windows.net/instagram-posts/tiktok/
```
