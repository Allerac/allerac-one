// One-off push notifications via the Telegram Bot API. Unlike
// telegram-bot.service.ts (a polling, conversational bot), this only ever
// sends — no polling, no chat state. Used for operational alerts like the
// per-domain rate limit thresholds (see domain-rate-limit-settings.service.ts).

export async function sendTelegramAlert(botToken: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Telegram alert failed (${response.status}): ${body.slice(0, 300)}`);
  }
}
