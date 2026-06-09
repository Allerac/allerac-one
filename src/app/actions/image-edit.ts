'use server';

import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import sharp from 'sharp';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';

const sysSettings = new SystemSettingsService();
const userSettings = new UserSettingsService();

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1/models';
const MAX_IMAGE_BASE64_LENGTH = 20 * 1024 * 1024;
const IMAGE_EDIT_OPERATIONS = new Set<ImageEditOperation['type']>([
  'remove-background',
  'white-background',
  'lifestyle-scene',
  'enhance',
]);

export type ImageEditOperation =
  | { type: 'remove-background' }
  | { type: 'white-background' }
  | { type: 'lifestyle-scene'; prompt: string }
  | { type: 'enhance' };

type EditResult =
  | { success: true; resultBase64: string; mimeType: 'image/png' | 'image/jpeg' }
  | {
      success: false;
      error: string;
      code?: 'RATE_LIMITED';
      retryAfterSeconds?: number;
    };

async function getGoogleKey(userId: string): Promise<string> {
  const [settings, systemSettings] = await Promise.all([
    userSettings.loadUserSettings(userId),
    sysSettings.loadAll(),
  ]);
  const key = settings?.google_api_key || systemSettings.google_api_key;
  if (!key) throw new Error('Google API key não configurada. Adiciona em Settings → API Keys.');
  return key;
}

function detectImageMimeType(imageBase64: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  const prefix = imageBase64.slice(0, 16);
  if (prefix.startsWith('iVBORw0KGgo')) return 'image/png';
  if (prefix.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function operationPrompt(operation: ImageEditOperation): string {
  const preserveProduct = [
    'Preserve the exact product identity, shape, proportions, colors, materials, logos, text, and fine details.',
    'Do not add, remove, redesign, or hallucinate any part of the product.',
    'Return only the edited image.',
  ].join(' ');

  switch (operation.type) {
    case 'remove-background':
      return `Remove the entire background and replace it with transparency. Keep clean, accurate edges and natural fine details. ${preserveProduct}`;
    case 'white-background':
      return `Place the product on a pure white seamless studio background (#FFFFFF) with subtle natural grounding and professional catalog lighting. ${preserveProduct}`;
    case 'lifestyle-scene': {
      const scene = operation.prompt.trim()
        || 'an elegant professional lifestyle product scene with soft natural light';
      return `Place the product naturally in this scene: ${scene}. Match perspective, lighting, shadows, and depth realistically. ${preserveProduct}`;
    }
    case 'enhance':
      return `Enhance this image for professional ecommerce use. Improve sharpness, resolution, lighting, contrast, color fidelity, and noise while keeping the composition unchanged. ${preserveProduct}`;
  }
}

async function geminiImageEdit(
  imageBase64: string,
  operation: ImageEditOperation,
  googleKey: string,
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(`${GEMINI_BASE}/${GEMINI_IMAGE_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': googleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { text: operationPrompt(operation) },
          {
            inline_data: {
              mime_type: detectImageMimeType(imageBase64),
              data: imageBase64,
            },
          },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Image (${res.status}): ${text}`);
  }

  const result = await res.json();
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part: any) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const reason = result.candidates?.[0]?.finishReason;
    throw new Error(reason
      ? `Gemini não retornou uma imagem (${reason})`
      : 'Gemini não retornou uma imagem');
  }
  return imagePart.inlineData;
}

async function performImageEdit(
  imageBase64: string,
  operation: ImageEditOperation,
  googleKey: string,
): Promise<EditResult> {
  const result = await geminiImageEdit(imageBase64, operation, googleKey);
  const buffer = Buffer.from(result.data, 'base64');

  switch (operation.type) {
    case 'remove-background': {
      const png = await sharp(buffer).png().toBuffer();
      return { success: true, resultBase64: png.toString('base64'), mimeType: 'image/png' };
    }

    case 'white-background': {
      const finalBuf = await sharp(buffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95 })
        .toBuffer();
      return { success: true, resultBase64: finalBuf.toString('base64'), mimeType: 'image/jpeg' };
    }

    case 'lifestyle-scene': {
      const jpegBuf = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
      return { success: true, resultBase64: jpegBuf.toString('base64'), mimeType: 'image/jpeg' };
    }

    case 'enhance': {
      const jpegBuf = await sharp(buffer).jpeg({ quality: 95 }).toBuffer();
      return { success: true, resultBase64: jpegBuf.toString('base64'), mimeType: 'image/jpeg' };
    }
  }
}

export async function editProductImage(
  imageBase64: string,
  operation: ImageEditOperation,
): Promise<EditResult> {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'social');
    if (
      typeof imageBase64 !== 'string'
      || imageBase64.length === 0
      || imageBase64.length > MAX_IMAGE_BASE64_LENGTH
      || !operation
      || typeof operation.type !== 'string'
      || !IMAGE_EDIT_OPERATIONS.has(operation.type)
      || (
        operation.type === 'lifestyle-scene'
        && (typeof operation.prompt !== 'string' || operation.prompt.length > 2_000)
      )
    ) {
      return { success: false, error: 'Entrada de imagem inválida' };
    }

    const limitResult = acquireOperationLimit('image-edit', user.id);
    if (!limitResult.allowed) {
      return {
        success: false,
        error: limitResult.reason === 'concurrency'
          ? 'Já existe uma edição de imagem em andamento'
          : 'Limite de edições de imagem excedido',
        code: 'RATE_LIMITED',
        retryAfterSeconds: limitResult.retryAfterSeconds,
      };
    }

    try {
      const googleKey = await getGoogleKey(user.id);
      return await performImageEdit(imageBase64, operation, googleKey);
    } finally {
      limitResult.lease.release();
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
