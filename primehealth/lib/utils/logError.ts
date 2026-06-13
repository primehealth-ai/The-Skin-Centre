import { createServiceClient } from '@/lib/supabase/server'

export async function logError(
  source: string,
  error: unknown,
  payload?: object
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const errorMessage = String(error)
    const stack = error instanceof Error ? error.stack ?? null : null

    await supabase.from('error_logs').insert({
      source,
      error_message: errorMessage,
      stack,
      payload: payload ?? null,
    })

    if (source === 'webhook' || source === 'cron') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      const chatId = process.env.TELEGRAM_CHAT_ID

      if (botToken && chatId) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🚨 PrimeHealth [${source}]: ${errorMessage}`,
          }),
        })
      }
    }
  } catch {}
}
