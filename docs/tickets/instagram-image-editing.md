# Instagram Image Editing — AI Product Photo Treatment

**Status:** Pending implementation  
**Domain:** Social  
**Estimated effort:** 4–6h (cloud API path) / 2–3 days (local path)

---

## Overview

Add an AI image editing step to the Instagram post studio that allows users to process product photos before publishing. Operations include background removal, background replacement with a lifestyle scene, image enhancement, and upscaling.

The feature lives inside `InstagramPostStudio.tsx` as an optional step between image upload and caption generation.

---

## Recommended Approach: fal.ai or Replicate API

Start with a cloud API for speed of implementation. Both offer the models needed and accept base64 or URL input. Migrate to local later if privacy requires it.

**fal.ai** is preferred: faster cold starts, simple REST API, good background removal and image editing models.

### Models to use

| Operation | fal.ai model | Replicate alternative |
|-----------|-------------|----------------------|
| Background removal | `fal-ai/birefnet` | `cjwbw/rembg` |
| Background replacement (lifestyle) | `fal-ai/flux/dev` with inpainting, or `fal-ai/stable-diffusion-v3-medium` img2img | `stability-ai/stable-diffusion-img2img` |
| Enhancement / upscaling | `fal-ai/esrgan` | `nightmareai/real-esrgan` |
| White background | Background removal → composite on white (Sharp, no LLM needed) | same |

---

## User Flow

```
[Upload photo]
      ↓
[✨ Edit with AI]  ← new button
      ↓
┌─────────────────────────────────┐
│  Choose operation:              │
│  ○ Remove background            │
│  ○ White background             │
│  ○ Lifestyle scene  [prompt]    │
│  ○ Enhance / upscale            │
└─────────────────────────────────┘
      ↓
[Processing... spinner]
      ↓
[Side-by-side: original | result]
      ↓
[Use this] or [Try again] or [Cancel]
      ↓
[Continue to caption + publish]
```

The result replaces the current image in state — the rest of the studio flow is unchanged.

---

## Files to Create / Change

### 1. `src/app/actions/image-edit.ts` (new)

Server action that receives base64 image + operation, calls the API, returns processed base64.

```typescript
export type ImageEditOperation =
  | { type: 'remove-background' }
  | { type: 'white-background' }
  | { type: 'lifestyle-scene'; prompt: string }
  | { type: 'enhance' }

export async function editProductImage(
  userId: string,
  imageBase64: string,       // without data URI prefix
  operation: ImageEditOperation
): Promise<{ success: true; resultBase64: string } | { success: false; error: string }>
```

**Internal flow:**
1. Load `fal_ai_api_key` from `system_settings` (new key to add to settings)
2. Upload input image to fal.ai storage (they provide a URL) or send as data URI
3. Call appropriate model endpoint based on `operation.type`
4. Poll or await result (fal.ai supports both sync and async)
5. Fetch result image, convert to base64, return

For `white-background`: run `remove-background` first, then composite onto white using Sharp (no second API call).

---

### 2. `src/app/components/instagram/ImageEditModal.tsx` (new)

Modal that handles operation selection, loading state, and before/after preview.

```typescript
interface ImageEditModalProps {
  isOpen: boolean
  onClose: () => void
  imageBase64: string
  imagePreview: string     // data URI for display
  userId: string
  isDarkMode: boolean
  onApply: (resultBase64: string, resultPreview: string) => void
}
```

**UI sections:**
- Operation selector (radio buttons or card grid)
- Prompt input (only visible when `lifestyle-scene` is selected)
- "Apply" button → shows spinner, disables controls
- Result panel: side-by-side original / result with "Use this" / "Try again" / "Cancel"

---

### 3. `src/app/components/instagram/InstagramPostStudio.tsx`

Add an "Edit with AI" button below the image upload area, visible only when an image is selected:

```tsx
{images.length > 0 && (
  <button onClick={() => setImageEditOpen(true)}>
    ✨ Edit with AI
  </button>
)}

<ImageEditModal
  isOpen={imageEditOpen}
  onClose={() => setImageEditOpen(false)}
  imageBase64={images[0].base64}
  imagePreview={images[0].preview}
  userId={userId}
  isDarkMode={isDarkMode}
  onApply={(resultBase64, resultPreview) => {
    setImages(prev => [{ base64: resultBase64, preview: resultPreview, name: prev[0].name }, ...prev.slice(1)])
    setImageEditOpen(false)
  }}
/>
```

---

### 4. Settings — new API key field

Add `fal_ai_api_key` to `system_settings` (same pattern as `google_api_key`, `github_token`).

Files to touch:
- `src/app/services/system/system-settings.service.ts` — add field to schema
- `src/app/components/system/SystemSettingsModal.tsx` — add input in API Keys tab
- `src/database/migrations/041_fal_ai_key.sql` — `ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fal_ai_api_key TEXT`

---

## Local Alternative (future / privacy mode)

If the user wants to keep images on-premise:

- **Background removal:** `rembg` Python library (runs CPU, no GPU needed) — add endpoint to `health-worker` or a new `image-worker` sidecar
- **Upscaling:** `Real-ESRGAN` — needs modest GPU or slow CPU
- **Lifestyle scene / img2img:** ComfyUI + SDXL — needs GPU (≥8GB VRAM)

The server action signature stays identical — only the implementation inside changes. Worth designing the action interface with this in mind (avoid fal.ai-specific types leaking into the component).

---

## Edge Cases

| Case | Behaviour |
|------|-----------|
| No fal.ai key configured | Show "API key not configured" with link to Settings |
| API timeout (>30s) | Show error, keep original image |
| Result image too small (< 320px) | Show warning but allow use |
| User edits, then adds more images (carousel) | Editing applies to the selected image only |
| `lifestyle-scene` with empty prompt | Use a default: `"professional product photography, clean studio, soft light"` |

---

## Implementation Order

1. Add `fal_ai_api_key` to settings (migration + UI)
2. Create `editProductImage()` server action with `remove-background` only
3. Create `ImageEditModal.tsx` (simplified — just remove-background first)
4. Wire button into `InstagramPostStudio.tsx`
5. Test end-to-end with a product photo
6. Add remaining operations (`white-background`, `enhance`, `lifestyle-scene`)

Ship remove-background first — it's the highest-value operation and validates the full pipeline.
