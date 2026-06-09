import crypto from 'crypto';
import { verifySha256WebhookSignature } from '@/app/lib/webhook-signature';

describe('verifySha256WebhookSignature', () => {
  const body = '{"object":"instagram"}';
  const secret = 'test-secret';
  const signature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex')}`;

  it('accepts a matching signature', () => {
    expect(verifySha256WebhookSignature(body, signature, secret)).toBe(true);
  });

  it('rejects a signature generated for different content', () => {
    expect(verifySha256WebhookSignature(`${body}x`, signature, secret)).toBe(false);
  });

  it('rejects missing signature or secret', () => {
    expect(verifySha256WebhookSignature(body, null, secret)).toBe(false);
    expect(verifySha256WebhookSignature(body, signature, '')).toBe(false);
  });
});
