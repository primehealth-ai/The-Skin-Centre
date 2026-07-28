import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

// TODO: add Gupshup webhook secret validation once confirmed with support.
// Gupshup will provide a shared secret header (e.g., X-Gupshup-Signature).
// Validate it here before processing any updates.

export const maxDuration = 30

// ── Gupshup Meta v3 envelope types ───────────────────────────────────────────
type MetaStatus = {
  id?: string
  status?: string   // 'sent' | 'delivered' | 'read' | 'failed'
  timestamp?: string
  errors?: Array<{ code?: number; title?: string }>
}

type MetaWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: MetaStatus[]
        messages?: unknown[]
      }
    }>
  }>
}

// Flat Gupshup delivery event (legacy / alternative format)
type GupshupFlatEvent = {
  externalId?: string
  messageId?: string
  eventType?: string
  event?: string
}

type DeliveryBody = MetaWebhookBody & GupshupFlatEvent

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

/**
 * Process a single delivery status event against whatsapp_messages.
 * externalId = Gupshup message ID (whatsapp_messages.whatsapp_message_id)
 * eventType  = SENT | DELIVERED | READ | FAILED (uppercase)
 */
async function processDeliveryEvent(
  supabase: ReturnType<typeof createServiceClient>,
  externalId: string,
  eventType: string,
): Promise<void> {
  // Lookup the whatsapp_messages row by the Gupshup message ID
  const { data: msgRow, error: lookupError } = await supabase
    .from('whatsapp_messages')
    .select('id, delivery_status')
    .eq('whatsapp_message_id', externalId)
    .maybeSingle()

  if (lookupError) {
    await logError('whatsapp_delivery', lookupError, { externalId, eventType })
    return
  }

  if (!msgRow) {
    // Unknown message ID — could be a test ping or a message from before tracking
    console.warn(`[delivery-webhook] No whatsapp_messages row for externalId=${externalId}`)
    return
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
    console.warn(`[delivery-webhook] Unknown eventType=${eventType} for externalId=${externalId}`)
    return
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
}

export async function POST(request: Request) {
  let body: DeliveryBody | null = null

  try {
    body = (await request.json()) as DeliveryBody

    const supabase = createServiceClient()

    // ── Path A: Gupshup Meta v3 envelope ─────────────────────────────────────
    // Payload: { entry:[{ changes:[{ value:{ statuses:[...], messages:[...] }}] }] }
    const metaValue = body?.entry?.[0]?.changes?.[0]?.value

    if (metaValue) {
      const statuses = metaValue.statuses ?? []
      const messages = metaValue.messages ?? []

      // If there are inbound messages in this envelope, they are already handled
      // by /api/whatsapp/webhook — skip here, always return 200.
      if (messages.length > 0) {
        console.info(`[delivery-webhook] Skipping ${messages.length} inbound message(s) — handled by /api/whatsapp/webhook`)
      }

      // Process each delivery status
      for (const status of statuses) {
        const externalId = status.id ?? null
        const rawStatus = (status.status ?? '').toUpperCase()

        if (!externalId || !rawStatus) {
          console.warn('[delivery-webhook] Meta status missing id or status field', status)
          continue
        }

        // Meta status names map directly to our event types
        await processDeliveryEvent(supabase, externalId, rawStatus)
      }

      // Always return 200 — Gupshup will retry on non-200
      return new Response('OK', { status: 200 })
    }

    // ── Path B: Flat Gupshup event format (legacy / alternative) ─────────────
    const externalId = body.externalId ?? body.messageId ?? null
    const eventType = (body.eventType ?? body.event ?? '').toUpperCase()

    if (!externalId || !eventType) {
      console.warn('[delivery-webhook] Missing externalId or eventType in payload', body)
      return new Response('OK', { status: 200 })
    }

    await processDeliveryEvent(supabase, externalId, eventType)

  } catch (err: unknown) {
    await logError('whatsapp_delivery', err, body ?? undefined)
  }

  // Always return 200 — Gupshup will retry on non-200 responses
  return new Response('OK', { status: 200 })
}
