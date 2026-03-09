// ─── Base layout ─────────────────────────────────────────────────────────────

function base(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);">

          <!-- Header -->
          <tr>
            <td style="background:#0d0d0d;padding:22px 28px;">
              <span style="font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:700;color:#fff;">
                Allerac <span style="color:#39d353;">One</span>
              </span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background:#fff;padding:28px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#fff;padding:16px 28px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                Allerac Infrastructure &middot; This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Welcome email ────────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  name: string;
  appUrl: string;
  apiKey: string;
}

export function welcomeEmail({ name, appUrl, apiKey }: WelcomeEmailParams): string {
  return base(`
    <h2 style="margin:0 0 16px;font-size:22px;color:#111;">Welcome to Allerac One 👋</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${escHtml(name)},</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
      Your access to <strong>Allerac One</strong> is ready.
      Here's everything you need to get started:
    </p>

    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;">
          <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">App URL</span>
          <a href="${escHtml(appUrl)}"
            style="font-family:'Courier New',Courier,monospace;color:#39d353;font-size:14px;text-decoration:none;">
            ${escHtml(appUrl)}
          </a>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0 4px;">
          <span style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">Your Allerac API Key</span>
          <code style="font-family:'Courier New',Courier,monospace;background:#e5e7eb;
            padding:6px 10px;border-radius:4px;font-size:13px;color:#111;letter-spacing:.03em;">
            ${escHtml(apiKey)}
          </code>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Getting started:</p>
    <ol style="margin:0 0 24px;padding-left:20px;color:#374151;font-size:14px;line-height:2;">
      <li>Access the app at the URL above</li>
      <li>Create your account</li>
      <li>Go to <strong>Settings &rarr; API Key</strong> and enter your Allerac API Key</li>
      <li>Start chatting with your private AI</li>
    </ol>

    <p style="margin:0;font-size:13px;color:#6b7280;">
      Questions? Contact us at
      <a href="mailto:hello@allerac.ai" style="color:#39d353;">hello@allerac.ai</a>
    </p>
  `);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
