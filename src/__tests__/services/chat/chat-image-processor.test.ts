jest.mock('@/app/services/image-upload', () => ({
  getImageUploadService: jest.fn(),
}));

import { getImageUploadService } from '@/app/services/image-upload';
import { processChatImages } from '@/app/services/chat/chat-image-processor';

describe('processChatImages', () => {
  test('uploads data URIs and preserves public URLs', async () => {
    const upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn/image.png' });
    (getImageUploadService as jest.Mock).mockReturnValue({ upload });

    await expect(processChatImages([
      { url: 'data:image/png;base64,aGVsbG8=' },
      { url: 'https://example.com/existing.png' },
    ])).resolves.toEqual([
      { url: 'https://cdn/image.png' },
      { url: 'https://example.com/existing.png' },
    ]);
    expect(upload).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/\.png$/));
  });

  test('falls back to original attachments when upload fails', async () => {
    (getImageUploadService as jest.Mock).mockReturnValue({
      upload: jest.fn().mockRejectedValue(new Error('offline')),
    });
    const attachments = [{ url: 'data:image/png;base64,aGVsbG8=' }];

    await expect(processChatImages(attachments)).resolves.toBe(attachments);
  });
});
