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
  const rawBody = await request.text()
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(rawBody)
  } catch {
    const params = new URLSearchParams(rawBody)
    body = Object.fromEntries(params.entries())
  }

  try {
    const message = (body as WhatsAppWebhookBody).entry?.[0]?.changes?.[0]?.value?.messages?.[0]

    if (!message) {
      return new Response('OK', { status: 200 })
    }

    // 1. Normalize inbound phone using normalizePhone() from lib/utils/phone.ts
    const normalizedPhone = normalizePhone(message.from ?? '')
    if (!normalizedPhone) {
      await logError('webhook', new Error(`Unrecognised WhatsApp sender phone: ${message.from ?? '(empty)'}`))
      return new Response('OK', { status: 200 })
    }
    const messageText = message.text?.body ?? ''
    const keyword = messageText.trim().toLowerCase()
    const isOptOutKeyword = keyword === 'stop' || keyword === 'unsubscribe'
    const isOptInKeyword = keyword === 'start' || keyword === 'subscribe'
    const supabase = createServiceClient()

    // 2. Query: SELECT id, full_name FROM patients WHERE phone = normalizedPhone
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    if (patientError) {
      throw patientError
    }

    // 3. If found: use existing patient_id — do NOT create new row
    // 4. If not found: insert new patient with full_name='New Patient' using upsert
    let resolvedPatientId: string | null = patient?.id ?? null
    if (!patient) {
      await supabase
        .from('patients')
        .upsert(
          { phone: normalizedPhone, full_name: 'New Patient' },
          { onConflict: 'phone', ignoreDuplicates: true }
        )

      const { data: fetchedPatient } = await supabase
        .from('patients')
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle()

      resolvedPatientId = fetchedPatient?.id ?? null
    }

    // 3. Update the WhatsApp session BEFORE inserting the inbound message.
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const { error: sessionUpdateError } = await supabase
      .from('patients')
      .update({ whatsapp_session_expires_at: sessionExpiry })
      .eq('phone', normalizedPhone)

    if (sessionUpdateError) {
      throw sessionUpdateError
    }

    // 4. Insert inbound message into whatsapp_messages.
    const { error: messageError } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: resolvedPatientId,
        patient_phone: normalizedPhone,
        direction: 'inbound',
        message_text: messageText,
        whatsapp_message_id: message.id ?? null,
        sent_by_automation: false,
      })

    if (messageError) {
      throw messageError
    }

    // If patient exists in DB: check missed_calls where patient_id matches and status='pending' (or 'whatsapp_sent')
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
            patient_reply_text: messageText || null,
          })
          .eq('id', missedCall.id)

        if (updateError) {
          throw updateError
        }
      }
    }

    if (isOptOutKeyword) {
      const { error: optOutError } = await supabase
        .from('opted_out_numbers')
        .upsert(
          {
            phone: normalizedPhone,
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
        .eq('phone', normalizedPhone)

      if (optInError) {
        throw optInError
      }
    }
  } catch (error: unknown) {
    try {
      await logError('webhook', error, body as object)
    } catch {
      // Suppress logging error to guarantee 200 status return
    }
  }

  return new Response('OK', { status: 200 })
}
