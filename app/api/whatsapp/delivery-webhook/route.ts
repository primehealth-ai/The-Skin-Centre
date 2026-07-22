import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

// TODO: add Gupshup webhook secret validation once confirmed with support.
// Gupshup will provide a shared secret header (e.g., X-Gupshup-Signature).
// Validate it here before processing any updates.

export const maxDuration = 30

type GupshupDeliveryEvent = {
  externalId?: string
  eventType?: string
  // Gupshup may also send these alternative field names
  messageId?: string
  event?: string
}

/**
 * Send a Telegram alert for delivery failures.
 * Local to this file — same pattern as send.ts sendTelegramAlert.
 * Never throws.
 */
async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    })
    if (!res.ok) {
      console.error(`[delivery-webhook] Telegram alert failed: ${res.status}`)
    }
  } catch (err) {
    console.error('[delivery-webhook] sendTelegramAlert fetch failed:', err)
  }
}

export async function POST(request: Request) {
  let body: GupshupDeliveryEvent | null = null

  try {
    body = (await request.json()) as GupshupDeliveryEvent

    // Support both field name conventions Gupshup may use
    const externalId = body.externalId ?? body.messageId ?? null
    const eventType = (body.eventType ?? body.event ?? '').toUpperCase()

    if (!externalId || !eventType) {
      console.warn('[delivery-webhook] Missing externalId or eventType in payload', body)
      return new Response('OK', { status: 200 })
    }

    const supabase = createServiceClient()

    // Lookup the whatsapp_messages row by the Gupshup message ID
    const { data: msgRow, error: lookupError } = await supabase
      .from('whatsapp_messages')
      .select('id, delivery_status')
      .eq('whatsapp_message_id', externalId)
      .maybeSingle()

    if (lookupError) {
      await logError('whatsapp_delivery', lookupError, { externalId, eventType })
      return new Response('OK', { status: 200 })
    }

    if (!msgRow) {
      // Unknown message ID — could be a test ping or a message from before tracking
      console.warn(`[delivery-webhook] No whatsapp_messages row for externalId=${externalId}`)
      return new Response('OK', { status: 200 })
    }

    const now = new Date().toISOString()
    let updatePayload: Record<string, string | null> = {}

    if (eventType === 'DELIVERED') {
      updatePayload = { delivery_status: 'delivered', delivered_at: now }
    } else if (eventType === 'READ') {
      updatePayload = { delivery_status: 'read', read_at: now }
    } else if (eventType === 'FAILED') {
      updatePayload = { delivery_status: 'failed' }

      await sendTelegramAlert(
        `⚠️ WhatsApp message delivery failed for messageId=${externalId}`
      )
    } else if (eventType === 'SENT') {
      // SENT is the initial dispatch confirmation — update status if not already further along
      if (msgRow.delivery_status !== 'delivered' && msgRow.delivery_status !== 'read') {
        updatePayload = { delivery_status: 'sent' }
      }
    } else {
      // Unknown event type — log and return
      console.warn(`[delivery-webhook] Unknown eventType=${eventType} for externalId=${externalId}`)
      return new Response('OK', { status: 200 })
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from('whatsapp_messages')
        .update(updatePayload)
        .eq('id', msgRow.id)

      if (updateError) {
        await logError('whatsapp_delivery', updateError, { externalId, eventType, msgRowId: msgRow.id })
      } else {
        console.info(`[delivery-webhook] Updated msgId=${externalId} -> ${eventType}`)
      }
    }
  } catch (err: unknown) {
    await logError('whatsapp_delivery', err, body ?? undefined)
  }

  // Always return 200 — Gupshup will retry on non-200 responses
  return new Response('OK', { status: 200 })
}
