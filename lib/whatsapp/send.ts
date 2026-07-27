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

// ── Clinic location — embedded in every Gupshup template send ─────────────────
const CLINIC_LOCATION_JSON = JSON.stringify({
  longitude: '85.1512566',
  latitude: '25.6000901',
  name: 'The Skin Centre',
  address: "B-54, People's Cooperative Colony, Near Ganga Devi Mahila College, Patna - 800020",
})

/**
 * Build the wa_template_json component list.
 * Skin Care: URL button only. Hair Care / General: URL + call buttons.
 */
function getWaTemplateJson(serviceType: string): string {
  const urlButton = { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: '' }] }
  const callButton = { type: 'button', sub_type: 'call', index: 1, parameters: [{ type: 'text', text: '' }] }
  if (serviceType === 'Skin Care') return JSON.stringify({ components: [urlButton] })
  return JSON.stringify({ components: [urlButton, callButton] })
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

// ---------------------------------------------------------------------------
// Gupshup first-contact send
// ---------------------------------------------------------------------------

type GupshupSendResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'disabled' | 'opted_out' | 'already_sent' | 'no_template' | 'rate_limit' | 'not_on_whatsapp' | 'wallet_empty' | 'api_error' | 'exception' }

type GupshupApiResponse = {
  response?: {
    status?: string
    id?: string
    code?: string | number
    details?: string
  }
  // Some Gupshup error responses use top-level fields
  status?: string
  id?: string
  code?: string | number
}

/**
 * Fire a Telegram alert directly. logError already does this for error sources,
 * but we need custom alert messages (rate-limit warnings, wallet alerts).
 * Never throws — alert failure must not affect call flow.
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
      console.error(`sendTelegramAlert: Telegram responded ${res.status}`)
    }
  } catch (err) {
    console.error('sendTelegramAlert: fetch failed', err)
  }
}

/**
 * Roll back patients.first_whatsapp_sent_at to NULL for a given phone.
 * Best-effort — never throws so it can be called from catch blocks safely.
 */
async function rollbackFirstWhatsAppSentAt(patientPhone: string): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase
      .from('patients')
      .update({ first_whatsapp_sent_at: null })
      .eq('phone', patientPhone)
  } catch (err) {
    console.error('rollbackFirstWhatsAppSentAt: failed to roll back', err)
  }
}

/**
 * Send a first-contact WhatsApp to a patient phone using Gupshup.
 *
 * This function is the ONLY trigger point for first-contact messaging.
 * It must be called immediately after a new patient row is created so that
 * patients who missed AND answered calls both receive the info message.
 *
 * Env vars required (set in Vercel — never hardcode here):
 *   WHATSAPP_SENDING_ENABLED   — master gate; keep 'false' until ready to go live
 *   GUPSHUP_USER_ID            — Gupshup account userid
 *   GUPSHUP_PASSWORD           — Gupshup account password
 *   GUPSHUP_WHATSAPP_NUMBER    — sender number (for reference/logging only)
 *
 * Never throws. Caller must treat all failure reasons as non-fatal.
 */
export async function sendFirstContactWhatsApp(
  patientPhone: string,
  serviceType: string,
  relatedMissedCallId?: string | null,
): Promise<GupshupSendResult> {
  try {
    const supabase = createServiceClient()

    // ── A. MASTER GATE ────────────────────────────────────────────────────────
    if (process.env.WHATSAPP_SENDING_ENABLED !== 'true') {
      await supabase.from('error_logs').insert({
        source: 'whatsapp_dry_run',
        error_message: 'DRY RUN — would send WhatsApp',
        stack: null,
        payload: {
          patientPhone,
          serviceType,
          wouldSendAt: new Date().toISOString(),
        },
      })
      console.info(`[whatsapp_dry_run] Would send first-contact WA to ${patientPhone} (${serviceType})`)
      return { sent: false, reason: 'disabled' }
    }

    // ── B. OPT-OUT CHECK ─────────────────────────────────────────────────────
    const { data: optedOut } = await supabase
      .from('opted_out_numbers')
      .select('id')
      .eq('phone', patientPhone)
      .maybeSingle()

    if (optedOut) {
      console.info(`[sendFirstContactWhatsApp] opted_out: ${patientPhone}`)
      return { sent: false, reason: 'opted_out' }
    }

    // ── C. LIFETIME CAP — atomic, race-safe UPDATE ────────────────────────────
    // UPDATE only fires when first_whatsapp_sent_at IS NULL.
    // If another concurrent execution beat us, RETURNING returns 0 rows → skip.
    // Do NOT SELECT first — that creates a race condition.
    const { data: lockedRows, error: lockError } = await supabase
      .from('patients')
      .update({ first_whatsapp_sent_at: new Date().toISOString() })
      .eq('phone', patientPhone)
      .is('first_whatsapp_sent_at', null)
      .select('id')

    if (lockError) {
      await logError('whatsapp_send', lockError, { patientPhone, step: 'lifetime_cap_lock' })
      return { sent: false, reason: 'exception' }
    }

    // lockedRows is an array; if empty, someone else already claimed this patient
    if (!lockedRows || lockedRows.length === 0) {
      console.info(`[sendFirstContactWhatsApp] already_sent: ${patientPhone}`)
      return { sent: false, reason: 'already_sent' }
    }

    // From here on, every early-return MUST call rollbackFirstWhatsAppSentAt.

    // ── D. TEMPLATE LOOKUP ───────────────────────────────────────────────────
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('id, name, gupshup_template_id, language')
      .eq('service_type', serviceType)
      .eq('is_active', true)
      .not('gupshup_template_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (templateError) {
      await logError('whatsapp_send', templateError, { patientPhone, serviceType, step: 'template_lookup' })
      await rollbackFirstWhatsAppSentAt(patientPhone)
      return { sent: false, reason: 'no_template' }
    }

    if (!template) {
      await logError(
        'whatsapp_send',
        new Error(`No active template found for service_type: ${serviceType}`),
        { patientPhone, serviceType },
      )
      await rollbackFirstWhatsAppSentAt(patientPhone)
      return { sent: false, reason: 'no_template' }
    }

    // ── E. RATE LIMIT SOFT CHECK ─────────────────────────────────────────────
    const { data: counter } = await supabase
      .from('whatsapp_send_counters')
      .select('count, warning_sent')
      .eq('send_date', new Date().toISOString().slice(0, 10)) // YYYY-MM-DD UTC
      .maybeSingle()

    const currentCount: number = counter?.count ?? 0

    if (currentCount >= 240 && !counter?.warning_sent) {
      await sendTelegramAlert(
        `⚠️ WhatsApp daily limit warning: ${currentCount}/250 messages sent today`
      )
      await supabase
        .from('whatsapp_send_counters')
        .update({ warning_sent: true })
        .eq('send_date', new Date().toISOString().slice(0, 10))
    }

    if (currentCount >= 250) {
      await logError(
        'whatsapp_send',
        new Error('Daily rate limit reached, skipping send'),
        { patientPhone, serviceType, currentCount },
      )
      await rollbackFirstWhatsAppSentAt(patientPhone)
      return { sent: false, reason: 'rate_limit' }
    }

    // ── F. GUPSHUP SEND REQUEST ──────────────────────────────────────────────
    // msg_type=LOCATION embeds the clinic pin inside the template message.
    // wa_template_json determines which button components are included per service.
    const body = new URLSearchParams({
      userid: process.env.GUPSHUP_USER_ID!,
      password: process.env.GUPSHUP_PASSWORD!,
      send_to: patientPhone,
      v: '1.1',
      format: 'json',
      msg_type: 'LOCATION',
      location: CLINIC_LOCATION_JSON,
      method: 'SENDMESSAGE',
      whatsAppTemplateId: template.gupshup_template_id,
      auth_scheme: 'plain',
      isHSM: 'true',
      isTemplate: 'true',
      wa_template_json: getWaTemplateJson(serviceType),
    })

    const gupshupRes = await fetch('https://mediaapi.smsgupshup.com/GatewayAPI/rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    // Always parse as JSON — Gupshup returns JSON when format=json is in body
    let apiResponse: GupshupApiResponse = {}
    try {
      apiResponse = (await gupshupRes.json()) as GupshupApiResponse
    } catch {
      apiResponse = {}
    }

    // Normalise: response envelope may be top-level or nested under .response
    const inner = apiResponse.response ?? apiResponse
    const status = inner.status ?? ''
    const messageId = String(inner.id ?? '')
    const errorCode = String(inner.code ?? '')

    // ── G. RESPONSE HANDLING ─────────────────────────────────────────────────

    if (status === 'submitted') {
      // SUCCESS
      const nowIso = new Date().toISOString()

      await supabase.from('whatsapp_messages').insert({
        patient_phone: patientPhone,
        patient_name: null,
        whatsapp_message_id: messageId || null,
        message_text: template.name,
        direction: 'outbound',
        sent_by_automation: true,
        delivery_status: 'sent',
        sent_at: nowIso,
        related_missed_call_id: relatedMissedCallId ?? null,
      })

      // UPSERT counter: race-safe atomic increment.
      // Attempt Postgres-side RPC first (atomic, no read-then-write race).
      // Falls back to a safe upsert pattern if the RPC doesn't exist yet.
      try {
        const { error: rpcErr } = await supabase.rpc('increment_whatsapp_counter_today')
        if (rpcErr) {
          // RPC doesn't exist yet — fall back to upsert + update pattern
          const todayDate = new Date().toISOString().slice(0, 10)
          await supabase
            .from('whatsapp_send_counters')
            .upsert(
              { send_date: todayDate, count: 1, warning_sent: false },
              { onConflict: 'send_date', ignoreDuplicates: true },
            )
          // If row already existed (ignoreDuplicates skipped insert), increment it
          if (currentCount > 0) {
            await supabase
              .from('whatsapp_send_counters')
              .update({ count: currentCount + 1 })
              .eq('send_date', todayDate)
          }
        }
      } catch (counterErr) {
        // Counter failure is non-fatal — log and continue
        console.error('[sendFirstContactWhatsApp] counter update failed:', counterErr)
      }

      console.info(`[sendFirstContactWhatsApp] sent: ${patientPhone} msgId=${messageId}`)
      return { sent: true, messageId }
    }

    // ── Log Gupshup error response to error_logs for all failure cases ────────
    // (done before the specific error-code branches so it fires for all non-success statuses)
    try {
      await supabase.from('error_logs').insert({
        source: 'gupshup_error',
        error_message: `Gupshup send failed — status: ${status}, code: ${errorCode}`,
        stack: null,
        payload: {
          phone: patientPhone,
          templateId: template.id,
          serviceType,
          gupshupResponse: apiResponse,
        },
      })
    } catch (logErr) {
      console.error('[sendFirstContactWhatsApp] Failed to log gupshup error to error_logs:', logErr)
    }

    // ERROR 1002 — number not on WhatsApp
    if (errorCode === '1002') {
      await rollbackFirstWhatsAppSentAt(patientPhone)
      await logError(
        'whatsapp_send',
        new Error(`Phone not on WhatsApp: ${patientPhone}`),
        { patientPhone, serviceType, apiResponse },
      )
      return { sent: false, reason: 'not_on_whatsapp' }
    }

    // ERROR 1003 — wallet empty
    if (errorCode === '1003') {
      await rollbackFirstWhatsAppSentAt(patientPhone)
      await sendTelegramAlert(
        '🚨 CRITICAL: Gupshup wallet empty — ALL WhatsApp sends are failing. Top up immediately.'
      )
      await logError(
        'whatsapp_send',
        new Error('Gupshup wallet empty (code 1003)'),
        { patientPhone, serviceType, apiResponse },
      )
      return { sent: false, reason: 'wallet_empty' }
    }

    // ANY OTHER ERROR
    await rollbackFirstWhatsAppSentAt(patientPhone)
    await logError(
      'whatsapp_send',
      new Error(`Gupshup API error — status: ${status}, code: ${errorCode}`),
      { patientPhone, serviceType, apiResponse },
    )
    return { sent: false, reason: 'api_error' }

  } catch (err: unknown) {
    // NETWORK / UNHANDLED EXCEPTION — best-effort rollback, never throw
    await rollbackFirstWhatsAppSentAt(patientPhone)
    // Log to error_logs — never rethrow
    try {
      await logError('whatsapp_send', err, { patientPhone, serviceType, step: 'exception' })
    } catch {
      console.error('[sendFirstContactWhatsApp] network exception (logError also failed):', err)
    }
    return { sent: false, reason: 'exception' }
  }
}
