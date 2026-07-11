import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { normalizePhone } from '@/lib/utils/phone'

interface SendMissedCallWhatsAppParams {
  phone: string
  patientName: string | null
  serviceType: string
  missedCallId: string
}

interface SendWhatsAppTemplateParams {
  phone: string
  templateName: string
  language?: string
}

type KnowlarityTemplateResponse = {
  message?: string
  message_id?: string
}

function toProviderPhone(phone: string): string {
  if (/^91\d{10}$/.test(phone)) {
    return `+${phone}`
  }

  return phone
}

function getTemplateName(serviceType: string): string {
  if (serviceType === 'Skin Care') {
    return 'missed_call_skin_care'
  }

  if (serviceType === 'Hair Care') {
    return 'missed_call_hair_care'
  }

  return 'missed_call_general'
}

export async function sendWhatsAppTemplateViaGupshup(
  params: SendWhatsAppTemplateParams
): Promise<{ messageId: string }> {
  const { phone, templateName, language = 'en' } = params
  const providerPhone = toProviderPhone(phone)

  const response = await fetch('https://api.knowlarity.com/wa/v1/message/template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.KNOWLARITY_API_KEY || '',
    },
    // TODO: Rajesh will confirm the final Knowlarity BSP endpoint and payload contract.
    body: JSON.stringify({
      to: providerPhone,
      template_name: templateName,
      language,
    }),
  })

  const responseData = (await response.json().catch(() => ({}))) as KnowlarityTemplateResponse

  if (!response.ok) {
    throw new Error(
      typeof responseData?.message === 'string'
        ? responseData.message
        : 'Knowlarity WhatsApp template send failed'
    )
  }

  return {
    messageId:
      typeof responseData?.message_id === 'string' && responseData.message_id
        ? responseData.message_id
        : `knowlarity_${Date.now()}`,
  }
}

export async function sendMissedCallWhatsApp(
  params: SendMissedCallWhatsAppParams
): Promise<void> {
  const whatsappEnabled = process.env.WHATSAPP_SENDING_ENABLED === 'true'
  if (!whatsappEnabled) {
    console.info('WhatsApp sending disabled, skipped')
    return
  }

  const supabase = createServiceClient() as any

  try {
    const { phone, patientName, serviceType, missedCallId } = params

    // Canonicalise via the single source of truth (lib/utils/phone) so the opt-out
    // key checked here matches the key stored by the inbound WhatsApp webhook.
    // Fail closed on an unrecognised number rather than messaging the wrong person.
    const dbPhone = normalizePhone(phone)
    if (!dbPhone) {
      throw new Error(`Invalid phone number for WhatsApp send: ${phone}`)
    }

    const { data: optedOut, error: optedOutError } = await supabase
      .from('opted_out_numbers')
      .select('id')
      .eq('phone', dbPhone)
      .maybeSingle()

    if (optedOutError) {
      throw optedOutError
    }

    if (optedOut) {
      throw new Error('opted_out')
    }

    const templateName = getTemplateName(serviceType)

    const { data: missedCall, error: missedCallError } = await supabase
      .from('missed_calls')
      .select('patient_id')
      .eq('id', missedCallId)
      .single()

    if (missedCallError) {
      throw missedCallError
    }

    const { messageId } = await sendWhatsAppTemplateViaGupshup({
      phone,
      templateName,
      language: 'en',
    })

    const nowIso = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('missed_calls')
      .update({
        whatsapp_sent_at: nowIso,
        whatsapp_message_id: messageId,
        status: 'whatsapp_sent',
        whatsapp_attempt_count: 1,
      })
      .eq('id', missedCallId)

    if (updateError) {
      throw updateError
    }

    const { error: insertError } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: missedCall?.patient_id ?? null,
        patient_phone: dbPhone,
        patient_name: patientName,
        direction: 'outbound',
        message_text: templateName,
        whatsapp_message_id: messageId,
        sent_by_automation: true,
        related_missed_call_id: missedCallId,
        delivery_status: 'sent',
      })

    if (insertError) {
      throw insertError
    }
  } catch (error: unknown) {
    await logError('whatsapp', error, params)
    throw error
  }
}
