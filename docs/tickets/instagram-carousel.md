# Instagram Carousel — Multiple Photo Upload

**Status:** Pending implementation  
**Domain:** Social  
**Estimated effort:** 3–4h

---

## Overview

Allow users to upload and publish multiple photos (2–10) as an Instagram carousel album from the post studio.

Instagram's Graph API natively supports `CAROUSEL_ALBUM` posts. The current infrastructure (Imgur upload + Graph API publish) already handles the single-image flow; carousel is an extension of the same pipeline.

---

## Instagram API — How Carousel Works

Instagram requires a 3-step process (all via Graph API):

1. **Create a container for each image** individually (`media_type: IMAGE`), with `is_carousel_item: true`
2. **Create a carousel container** (`media_type: CAROUSEL_ALBUM`) passing the array of children container IDs
3. **Publish** the carousel container ID via `/{businessUserId}/media_publish`

```
POST /{businessUserId}/media
  image_url = "https://..."
  is_carousel_item = true
  → returns { id: "child_container_id_1" }

POST /{businessUserId}/media
  image_url = "https://..."
  is_carousel_item = true
  → returns { id: "child_container_id_2" }

POST /{businessUserId}/media
  media_type = CAROUSEL_ALBUM
  children = "child_container_id_1,child_container_id_2"
  caption = "..."
  → returns { id: "carousel_container_id" }

POST /{businessUserId}/media_publish
  creation_id = "carousel_container_id"
  → returns { id: "published_post_id" }
```

**Limits:**
- 2–10 images per carousel
- Each image must be a public URL (already handled via Imgur)
- All images must finish processing (`status = FINISHED`) before creating the carousel container
- Caption goes on the carousel container, not on individual images

---

## Files to Change

### 1. `src/app/services/instagram/instagram-graph.service.ts`

Add a `publishCarousel()` method alongside the existing `publishPost()`:

```typescript
async publishCarousel(
  userId: string,
  caption: string,
  imageUrls: string[]   // 2–10 public URLs
): Promise<string>       // returns published post ID
```

**Steps inside:**
1. For each `imageUrl`, call `POST /{businessUserId}/media` with `{ image_url, is_carousel_item: true }` → collect child container IDs
2. Poll each child container until `status = FINISHED` (reuse existing `pollMediaStatus()`)
3. Call `POST /{businessUserId}/media` with `{ media_type: 'CAROUSEL_ALBUM', children: ids.join(','), caption }`
4. Poll the carousel container until `FINISHED`
5. Call `POST /{businessUserId}/media_publish` with the carousel container ID

The existing `IGMedia` interface already includes `CAROUSEL_ALBUM` as a media type.

---

### 2. `src/app/actions/instagram.ts`

Add a new server action (keep `publishInstagramPost` intact for single-image):

```typescript
export async function publishInstagramCarousel(
  userId: string,
  imagesBase64: string[],   // array of base64 strings (without data URI prefix)
  caption: string
): Promise<{ success: true; postId: string; message: string } | { success: false; error: string }>
```

**Steps:**
1. Validate: 2–10 images
2. For each base64: convert → JPEG via Sharp (same as current single-image logic) → upload to Imgur → collect public URLs
3. Call `igService.publishCarousel(userId, caption, urls)`
4. Return result

Extract the single-image "base64 → JPEG → Imgur" logic into a shared helper `prepareImageForInstagram(base64: string): Promise<string>` so both actions reuse it.

---

### 3. `src/app/components/instagram/InstagramPostStudio.tsx`

**State changes:**
```typescript
// Replace single image state:
const [imageBase64, setImageBase64] = useState<string | null>(null)
const [imagePreview, setImagePreview] = useState<string | null>(null)
const [imageName, setImageName] = useState<string | null>(null)

// With multi-image state:
const [images, setImages] = useState<Array<{ base64: string; preview: string; name: string }>>([])
```

**UI changes:**
- `<input type="file" multiple accept="image/*">` — allow multiple selection
- Show a horizontal strip of thumbnails (with remove button on each)
- Show image count badge: "3 / 10"
- Keep the aspect ratio selector (applies to all images)
- Caption generation: use the **first image** for AI caption generation (same as today)
- Preview panel: show only the first image (carousel preview in-browser is out of scope)

**Publish logic:**
```typescript
if (images.length === 1) {
  // existing single-image flow
  await publishInstagramPost(userId, images[0].base64, fullCaption)
} else {
  // new carousel flow
  await publishInstagramCarousel(userId, images.map(i => i.base64), fullCaption)
}
```

This keeps full backward compatibility — single image = same behavior as today.

---

## What Does NOT Change

- Caption, hashtags, product reference, purchase instructions — all work the same
- AI caption generation — uses first image only
- `publishInstagramPost` — untouched, still used for single image
- `InstagramPostModal.tsx` (the older modal, used in DM flow) — single image only, no change needed

---

## Edge Cases to Handle

| Case | Behaviour |
|------|-----------|
| User selects 1 image | Single-image flow (no carousel) |
| User selects > 10 images | Truncate to 10, show warning |
| One image fails Imgur upload | Abort entire carousel, show error |
| One child container stuck in ERROR status | Abort, show which image failed |
| Carousel container creation fails | Show error, uploaded images are orphaned on Imgur (acceptable) |

---

## Implementation Order

1. Extract `prepareImageForInstagram()` helper in `instagram.ts`
2. Add `publishCarousel()` in `instagram-graph.service.ts`
3. Add `publishInstagramCarousel()` action in `instagram.ts`
4. Update `InstagramPostStudio.tsx` UI and publish logic
5. Test: 2 images, 10 images, 1 image (should still use single-image path)
