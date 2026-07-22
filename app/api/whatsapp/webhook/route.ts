import { normalizePhone } from '@/lib/utils/phone'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60

type WhatsAppMessage = {
  from?: string
  id?: string
  text?: {
    body?: string
  }
}

type WhatsAppWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppMessage[]
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
  let body: WhatsAppWebhookBody | null = null

  try {
    // Gupshup BSP: no HMAC signature — accept all incoming POSTs.
    // Header-based auth (Bearer token) will be added in the next step
    // once the webhook endpoint is confirmed working in Gupshup dashboard.
    body = (await request.json()) as WhatsAppWebhookBody
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!message) {
      return new Response('OK', { status: 200 })
    }

    // Canonical normalizer (lib/utils/phone) returns null for unrecognised input.
    // Guard here so the opt-out key we store/lookup is always canonical and we never
    // attempt a NOT NULL patient_phone insert with a null value.
    const patientPhone = normalizePhone(message.from ?? '')
    if (!patientPhone) {
      await logError('webhook', new Error(`Unrecognised WhatsApp sender phone: ${message.from ?? '(empty)'}`))
      return new Response('OK', { status: 200 })
    }
    const messageText = message.text?.body ?? ''
    const keyword = messageText.trim().toLowerCase()
    const isOptOutKeyword = keyword === 'stop' || keyword === 'unsubscribe'
    const isOptInKeyword = keyword === 'start' || keyword === 'subscribe'
    const supabase = createServiceClient()

    const { data: optedOut, error: optedOutError } = await supabase
      .from('opted_out_numbers')
      .select('id')
      .eq('phone', patientPhone)
      .maybeSingle()

    if (optedOutError) {
      throw optedOutError
    }

    if (optedOut && !isOptInKeyword) {
      return new Response('OK', { status: 200 })
    }

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', patientPhone)
      .maybeSingle()

    if (patientError) {
      throw patientError
    }

    // If this is an inbound from an unknown number, create a stub patient row
    // so the message has a valid patient_id and is queryable from the dashboard.
    let resolvedPatientId: string | null = patient?.id ?? null
    if (!patient) {
      await supabase
        .from('patients')
        .upsert(
          { phone: patientPhone, full_name: 'New Patient' },
          { onConflict: 'phone', ignoreDuplicates: true },
        )

      const { data: fetchedPatient } = await supabase
        .from('patients')
        .select('id')
        .eq('phone', patientPhone)
        .maybeSingle()

      resolvedPatientId = fetchedPatient?.id ?? null
    }

    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: resolvedPatientId,
        patient_phone: patientPhone,
        direction: 'inbound',
        message_text: messageText,
        whatsapp_message_id: message.id ?? null,
        sent_by_automation: false,
      })

    if (messageError) {
      throw messageError
    }

    if (isOptOutKeyword) {
      const { error: optOutError } = await supabase
        .from('opted_out_numbers')
        .upsert(
          {
            phone: patientPhone,
            opted_out_at: new Date().toISOString(),
            opted_in_at: null,
            last_action: 'opted_out',
          },
          {
            onConflict: 'phone',
          }
        )

      if (optOutError) {
        throw optOutError
      }
    } else if (isOptInKeyword) {
      const { error: optInError } = await supabase
        .from('opted_out_numbers')
        .delete()
        .eq('phone', patientPhone)

      if (optInError) {
        throw optInError
      }
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
            whatsapp_session_expires_at: new Date(
              now.getTime() + 24 * 60 * 60 * 1000
            ).toISOString(),
            patient_replied_at: now.toISOString(),
            // patient_reply_text stores the first reply message for staff context
            patient_reply_text: messageText || null,
          })
          .eq('id', missedCall.id)

        if (updateError) {
          throw updateError
        }
      }
    }
  } catch (error: unknown) {
    await logError('webhook', error, body ?? undefined)
  }

  return new Response('OK', { status: 200 })
}
