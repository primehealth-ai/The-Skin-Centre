import { createServiceClient } from '@/lib/supabase/server'

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    if (typeof err.message === 'string') {
      return err.message
    }
    try {
      return JSON.stringify(err)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

function isNextJsDynamicServerError(message: string): boolean {
  return (
    message.includes('DynamicServerError') ||
    message.includes('Dynamic server usage') ||
    message.includes("couldn't be rendered statically because it used")
  )
}

export async function logError(
  source: string,
  error: unknown,
  payload?: object
): Promise<void> {
  try {
    const errorMessage = extractErrorMessage(error)
    const stack = error instanceof Error ? error.stack ?? null : null

    // Skip known Next.js static-generation noise; it is not an application error
    if (isNextJsDynamicServerError(errorMessage)) {
      console.warn('[logError] ignored Next.js DynamicServerError:', errorMessage)
      return
    }

    const supabase = createServiceClient()
    await supabase.from('error_logs').insert({
      source,
      error_message: errorMessage,
      stack,
      payload: payload ?? null,
    })

    const alertSources = new Set(['webhook', 'cron', 'consent', 'photos', 'patients', 'whatsapp', 'patients-update'])
    if (alertSources.has(source)) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN
      const chatId = process.env.TELEGRAM_CHAT_ID

      if (botToken && chatId) {
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: `🚨 PrimeHealth [${source}]: ${errorMessage}`,
            }),
          })
          if (!res.ok) {
            console.error(`Telegram alert failed with status ${res.status}: ${await res.text()}`)
          }
        } catch (teleError) {
          console.error('Failed to send Telegram alert:', teleError)
        }
      }
    }
  } catch (dbError) {
    console.error('Failed to log error to DB:', dbError)
  }
}
