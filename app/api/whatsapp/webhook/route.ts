import { normalizePhone } from '@/lib/utils/phone'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60

type WhatsAppMessage = {
  from?: string
  id?: string
  type?: string
  text?: {
    body?: string
  }
  image?: { id?: string }
  video?: { id?: string }
}

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[]
        statuses?: Array<{
          id?: string
          status?: string
        }>
      }
    }>
  }>
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const mode = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge') ?? ''

  if (
    mode === 'subscribe' &&
    (verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN || verifyToken === process.env.WHATSAPP_VERIFY_TOKEN)
  ) {
    return new Response(challenge, { status: 200 })
  }

  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    let body: WhatsAppWebhookBody = {}
    try {
      body = JSON.parse(rawBody) as WhatsAppWebhookBody
    } catch {
      body = Object.fromEntries(new URLSearchParams(rawBody).entries()) as WhatsAppWebhookBody
    }

    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]?.value
    const messages = change?.messages || []
    const statuses = change?.statuses || []
    const supabase = createServiceClient()

    for (const status of statuses) {
      const eventType = status.status
      const msgId = status.id
      if (msgId) {
        await supabase
          .from('whatsapp_messages')
          .update({
            delivery_status: eventType,
            ...(eventType === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
            ...(eventType === 'read' ? { read_at: new Date().toISOString() } : {}),
          })
          .eq('whatsapp_message_id', msgId)
      }
    }

    for (const message of messages) {
      const fromPhone = normalizePhone(message.from ?? '')
      if (!fromPhone) {
        await logError('webhook', new Error(`Unrecognised WhatsApp sender phone: ${message.from ?? '(empty)'}`))
        continue
      }

      const sessionExpiry = new Date(Date.now() + 86400000).toISOString()
      await supabase
        .from('patients')
        .update({ whatsapp_session_expires_at: sessionExpiry })
        .eq('phone', fromPhone)

      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .select('id, full_name')
        .eq('phone', fromPhone)
        .maybeSingle()

      if (patientError) {
        throw patientError
      }

      let resolvedPatientId: string | null = patient?.id ?? null
      if (!patient) {
        await supabase
          .from('patients')
          .upsert(
            { phone: fromPhone, full_name: 'New Patient', whatsapp_session_expires_at: sessionExpiry },
            { onConflict: 'phone', ignoreDuplicates: true },
          )

        const { data: fetchedPatient } = await supabase
          .from('patients')
          .select('id')
          .eq('phone', fromPhone)
          .maybeSingle()

        resolvedPatientId = fetchedPatient?.id ?? null
      }

      let messageText = ''
      let mediaId: string | null = null
      switch (message.type) {
        case 'text':
          messageText = message.text?.body || ''
          break
        case 'image':
          messageText = '📷 Image'
          mediaId = message.image?.id ?? null
          break
        case 'audio':
          messageText = '🎵 Audio message'
          break
        case 'video':
          messageText = '🎬 Video message'
          mediaId = message.video?.id ?? null
          break
        case 'document':
          messageText = '📄 Document'
          break
        case 'location':
          messageText = '📍 Location shared'
          break
        case 'sticker':
          messageText = '🎉 Sticker'
          break
        default:
          messageText = '📎 Attachment'
          break
      }

      const { error: messageError } = await supabase
        .from('whatsapp_messages')
        .insert({
          patient_id: resolvedPatientId,
          patient_phone: fromPhone,
          patient_name: patient?.full_name || null,
          direction: 'inbound',
          message_text: messageText,
          media_id: mediaId,
          whatsapp_message_id: message.id ?? null,
          sent_by_automation: false,
        })

      if (messageError) {
        throw messageError
      }

      if (resolvedPatientId) {
        const { data: missedCall, error: missedCallError } = await supabase
          .from('missed_calls')
          .select('id')
          .eq('patient_id', resolvedPatientId)
          .in('status', ['pending', 'whatsapp_sent'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (missedCallError) {
          throw missedCallError
        }

        if (missedCall) {
          const now = new Date()
          const { error: updateError } = await supabase
            .from('missed_calls')
            .update({
              status: 'patient_replied',
              whatsapp_session_expires_at: sessionExpiry,
              patient_replied_at: now.toISOString(),
              patient_reply_text: messageText || null,
            })
            .eq('id', missedCall.id)

          if (updateError) {
            throw updateError
          }
        }
      }

      const keyword = messageText.trim().toLowerCase()
      if (keyword === 'stop' || keyword === 'unsubscribe') {
        const { error: optOutError } = await supabase
          .from('opted_out_numbers')
          .upsert(
            {
              phone: fromPhone,
              opted_out_at: new Date().toISOString(),
              opted_in_at: null,
              last_action: 'opted_out',
            },
            { onConflict: 'phone' },
          )

        if (optOutError) {
          throw optOutError
        }
      } else if (keyword === 'start' || keyword === 'subscribe') {
        const { error: optInError } = await supabase
          .from('opted_out_numbers')
          .delete()
          .eq('phone', fromPhone)

        if (optInError) {
          throw optInError
        }
      }
    }
  } catch (error: unknown) {
    try {
      await logError('webhook', error)
    } catch {
      // Suppress logging error to guarantee 200 status return
    }
  }

  return new Response('OK', { status: 200 })
}
