'use server';

import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import sharp from 'sharp';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';

const sysSettings = new SystemSettingsService();

const FAL_BASE = 'https://fal.run';
const MAX_IMAGE_BASE64_LENGTH = 20 * 1024 * 1024;

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

async function getFalKey(): Promise<string> {
  const settings = await sysSettings.loadAll();
  const key = settings.fal_ai_api_key;
  if (!key) throw new Error('fal.ai API key não configurada. Adiciona em Admin → System Settings.');
  return key;
}

async function falPost(model: string, input: object, falKey: string): Promise<any> {
  const res = await fetch(`${FAL_BASE}/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai ${model} (${res.status}): ${text}`);
  }
  return res.json();
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao obter imagem resultado: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function performImageEdit(
  imageBase64: string,
  operation: ImageEditOperation,
  falKey: string,
): Promise<EditResult> {
  const dataUri = `data:image/jpeg;base64,${imageBase64}`;

  switch (operation.type) {
    case 'remove-background': {
      const result = await falPost('fal-ai/birefnet', { image_url: dataUri }, falKey);
      const url = result.image?.url;
      if (!url) throw new Error('Sem imagem resultado do birefnet');
      const buf = await fetchAsBuffer(url);
      return { success: true, resultBase64: buf.toString('base64'), mimeType: 'image/png' };
    }

    case 'white-background': {
      const result = await falPost('fal-ai/birefnet', { image_url: dataUri }, falKey);
      const url = result.image?.url;
      if (!url) throw new Error('Sem imagem resultado do birefnet');
      const pngBuf = await fetchAsBuffer(url);
      const finalBuf = await sharp(pngBuf)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 95 })
        .toBuffer();
      return { success: true, resultBase64: finalBuf.toString('base64'), mimeType: 'image/jpeg' };
    }

    case 'lifestyle-scene': {
      const prompt = operation.prompt.trim() || 'professional product photography, clean studio, soft light, elegant background';
      const result = await falPost('fal-ai/flux/dev/image-to-image', {
        image_url: dataUri,
        prompt,
        strength: 0.85,
        image_size: 'square_hd',
        num_images: 1,
      }, falKey);
      const url = result.images?.[0]?.url;
      if (!url) throw new Error('Sem imagem resultado do FLUX img2img');
      const buf = await fetchAsBuffer(url);
      const jpegBuf = await sharp(buf).jpeg({ quality: 92 }).toBuffer();
      return { success: true, resultBase64: jpegBuf.toString('base64'), mimeType: 'image/jpeg' };
    }

    case 'enhance': {
      const result = await falPost('fal-ai/esrgan', { image_url: dataUri }, falKey);
      const url = result.image?.url;
      if (!url) throw new Error('Sem imagem resultado do ESRGAN');
      const buf = await fetchAsBuffer(url);
      const jpegBuf = await sharp(buf).jpeg({ quality: 92 }).toBuffer();
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
      || (operation.type === 'lifestyle-scene' && operation.prompt.length > 2_000)
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
      const falKey = await getFalKey();
      return await performImageEdit(imageBase64, operation, falKey);
    } finally {
      limitResult.lease.release();
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
