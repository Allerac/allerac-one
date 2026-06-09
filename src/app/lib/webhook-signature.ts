import crypto from 'crypto';

export function verifySha256WebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!secret || !signature?.startsWith('sha256=')) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
