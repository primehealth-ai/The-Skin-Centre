import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

// ── Clinic location — embedded in every location-type template send ───────────
const CLINIC_LOCATION = JSON.stringify({
  longitude: '85.1512566',
  latitude: '25.6000901',
  name: 'The Skin Centre',
  address: "B-54, People's Cooperative Colony, Near Ganga Devi Mahila College, Patna - 800020",
})

const GUPSHUP_API_URL = 'https://mediaapi.smsgupshup.com/GatewayAPI/rest'

// ── FUNCTION 1: Location-type template (our 3 approved missed-call templates) ──
// No wa_template_json. No var1/var2. msg_type=LOCATION only.
export async function sendLocationTemplate(
  phone: string,
  templateId: string,
): Promise<{ messageId: string } | { sent: false; reason: 'fetch_failed' }> {
  const body = new URLSearchParams({
    userid: process.env.GUPSHUP_USER_ID!,
    password: process.env.GUPSHUP_PASSWORD!,
    send_to: phone,
    v: '1.1',
    format: 'json',
    msg_type: 'LOCATION',
    location: CLINIC_LOCATION,
    method: 'SENDMESSAGE',
    whatsAppTemplateId: templateId,
    auth_scheme: 'plain',
    isHSM: 'true',
    isTemplate: 'true',
  })

  console.log('[sendLocationTemplate] payload:', body.toString())

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let res: Response
  try {
    res = await fetch(GUPSHUP_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (fetchErr) {
    clearTimeout(timeout)
    await createServiceClient()
      .from('patients')
      .update({ first_whatsapp_sent_at: null })
      .eq('phone', phone)
    await logError('gupshup_fetch', fetchErr, { phone })
    return { sent: false, reason: 'fetch_failed' }
  }

  let apiResponse: Record<string, unknown> = {}
  try {
    apiResponse = (await res.json()) as Record<string, unknown>
  } catch {
    apiResponse = {}
  }

  const inner = (apiResponse.response ?? apiResponse) as Record<string, unknown>
  const status = String(inner.status ?? '')
  const messageId = String(inner.id ?? '')
  const errorCode = String(inner.code ?? '')

  console.info('[sendLocationTemplate] Gupshup response:', JSON.stringify(apiResponse))

  if (status !== 'submitted' && status !== 'success') {
    throw Object.assign(
      new Error(`Gupshup location template failed — status: ${status}, code: ${errorCode}`),
      { apiResponse, errorCode },
    )
  }

  return { messageId }
}

// ── FUNCTION 2: Text-type template (e.g. test_mm — no header/buttons) ─────────
export async function sendTextTemplate(
  phone: string,
  templateId: string,
  vars?: string[],
): Promise<{ messageId: string }> {
  const params: Record<string, string> = {
    userid: process.env.GUPSHUP_USER_ID!,
    password: process.env.GUPSHUP_PASSWORD!,
    send_to: phone,
    v: '1.1',
    format: 'json',
    msg_type: 'text',
    method: 'SENDMESSAGE',
    whatsAppTemplateId: templateId,
    auth_scheme: 'plain',
    isHSM: 'true',
    isTemplate: 'false',
  }

  if (vars && vars[0] !== undefined) params.var1 = vars[0]

  const body = new URLSearchParams(params)

  console.log('[sendTextTemplate] payload:', body.toString())

  const res = await fetch(GUPSHUP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  let apiResponse: Record<string, unknown> = {}
  try {
    apiResponse = (await res.json()) as Record<string, unknown>
  } catch {
    apiResponse = {}
  }

  const inner = (apiResponse.response ?? apiResponse) as Record<string, unknown>
  const status = String(inner.status ?? '')
  const messageId = String(inner.id ?? '')
  const errorCode = String(inner.code ?? '')

  console.info('[sendTextTemplate] Gupshup response:', JSON.stringify(apiResponse))

  if (status !== 'submitted' && status !== 'success') {
    throw Object.assign(
      new Error(`Gupshup text template failed — status: ${status}, code: ${errorCode}`),
      { apiResponse, errorCode },
    )
  }

  return { messageId }
}

// ── Helper: map serviceType → template meta_template_name ────────────────────
export async function sendSessionTextMessage(
  phone: string,
  message: string,
): Promise<{ messageId: string }> {
  const body = new URLSearchParams({
    userid: process.env.GUPSHUP_USER_ID!,
    password: process.env.GUPSHUP_PASSWORD!,
    send_to: phone,
    v: '1.1',
    format: 'json',
    msg_type: 'text',
    method: 'SENDMESSAGE',
    msg: message,
    auth_scheme: 'plain',
    isHSM: 'false',
    isTemplate: 'false',
  })

  console.log('[sendSessionTextMessage] payload:', body.toString())

  const res = await fetch(GUPSHUP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  let apiResponse: Record<string, unknown> = {}
  try {
    apiResponse = (await res.json()) as Record<string, unknown>
  } catch {
    apiResponse = {}
  }

  const inner = (apiResponse.response ?? apiResponse) as Record<string, unknown>
  const status = String(inner.status ?? '')
  const messageId = String(inner.id ?? '')
  const errorCode = String(inner.code ?? '')

  console.info('[sendSessionTextMessage] Gupshup response:', JSON.stringify(apiResponse))

  if (status !== 'submitted' && status !== 'success') {
    throw Object.assign(
      new Error(`Gupshup session text failed - status: ${status}, code: ${errorCode}`),
      { apiResponse, errorCode },
    )
  }

  return { messageId }
}

function getTemplateName(serviceType: string): string {
  if (serviceType === 'Skin Care') return 'first_contact_skin_care'
  if (serviceType === 'Hair Care') return 'hair_care'
  return 'general'
}

// ── Types ──────────────────────────────────────────────────────────────────────

type GupshupSendResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: 'disabled' | 'opted_out' | 'already_sent' | 'no_template' | 'rate_limit' | 'not_on_whatsapp' | 'wallet_empty' | 'api_error' | 'exception' | 'fetch_failed' }

type GupshupApiResponse = {
  response?: {
    status?: string
    id?: string
    code?: string | number
    details?: string
  }
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
 * Always uses sendLocationTemplate — all 3 approved missed-call templates
 * (first_contact_skin_care, hair_care, general) are location-type.
 *
 * This function is the ONLY trigger point for first-contact messaging.
 * It must be called immediately after a new patient row is created so that
 * patients who missed AND answered calls both receive the info message.
 *
 * Env vars required (set in Vercel — never hardcode here):
 *   WHATSAPP_SENDING_ENABLED   — master gate; keep 'false' until ready to go live
 *   GUPSHUP_USER_ID            — Gupshup account userid
 *   GUPSHUP_PASSWORD           — Gupshup account password
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

    if (!lockedRows || lockedRows.length === 0) {
      console.info(`[sendFirstContactWhatsApp] already_sent: ${patientPhone}`)
      return { sent: false, reason: 'already_sent' }
    }

    // From here on, every early-return MUST call rollbackFirstWhatsAppSentAt.

    // ── D. TEMPLATE LOOKUP ───────────────────────────────────────────────────
    const templateName = getTemplateName(serviceType)

    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('id, name, gupshup_template_id')
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
        { patientPhone, serviceType, templateName },
      )
      await rollbackFirstWhatsAppSentAt(patientPhone)
      return { sent: false, reason: 'no_template' }
    }

    // ── E. RATE LIMIT SOFT CHECK ─────────────────────────────────────────────
    const { data: counter } = await supabase
      .from('whatsapp_send_counters')
      .select('count, warning_sent')
      .eq('send_date', new Date().toISOString().slice(0, 10))
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

    // ── F. GUPSHUP SEND — always location-type for first-contact templates ────
    let messageId = ''
    try {
      const result = await sendLocationTemplate(patientPhone, template.gupshup_template_id)
      if (!('messageId' in result)) {
        return result
      }
      messageId = result.messageId
    } catch (sendErr: unknown) {
      // Log full Gupshup error response
      const errObj = sendErr as Record<string, unknown>
      const apiResponse = (errObj?.apiResponse as GupshupApiResponse) ?? {}
      const inner = apiResponse.response ?? apiResponse
      const errorCode = String((inner as Record<string, unknown>)?.code ?? '')

      try {
        await supabase.from('error_logs').insert({
          source: 'gupshup_error',
          error_message: sendErr instanceof Error ? sendErr.message : 'sendLocationTemplate failed',
          stack: null,
          payload: { phone: patientPhone, templateId: template.id, serviceType, gupshupResponse: apiResponse },
        })
      } catch (logErr) {
        console.error('[sendFirstContactWhatsApp] Failed to log gupshup error:', logErr)
      }

      await rollbackFirstWhatsAppSentAt(patientPhone)

      if (errorCode === '1002') {
        await logError('whatsapp_send', new Error(`Phone not on WhatsApp: ${patientPhone}`), { patientPhone, serviceType })
        return { sent: false, reason: 'not_on_whatsapp' }
      }
      if (errorCode === '1003') {
        await sendTelegramAlert('🚨 CRITICAL: Gupshup wallet empty — ALL WhatsApp sends are failing. Top up immediately.')
        await logError('whatsapp_send', new Error('Gupshup wallet empty (code 1003)'), { patientPhone, serviceType })
        return { sent: false, reason: 'wallet_empty' }
      }

      await logError('whatsapp_send', sendErr, { patientPhone, serviceType })
      return { sent: false, reason: 'api_error' }
    }

    // ── G. SUCCESS — persist message + update counter ─────────────────────────
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
    try {
      const { error: rpcErr } = await supabase.rpc('increment_whatsapp_counter_today')
      if (rpcErr) {
        const todayDate = new Date().toISOString().slice(0, 10)
        await supabase
          .from('whatsapp_send_counters')
          .upsert(
            { send_date: todayDate, count: 1, warning_sent: false },
            { onConflict: 'send_date', ignoreDuplicates: true },
          )
        if (currentCount > 0) {
          await supabase
            .from('whatsapp_send_counters')
            .update({ count: currentCount + 1 })
            .eq('send_date', todayDate)
        }
      }
    } catch (counterErr) {
      console.error('[sendFirstContactWhatsApp] counter update failed:', counterErr)
    }

    console.info(`[sendFirstContactWhatsApp] sent: ${patientPhone} msgId=${messageId}`)
    return { sent: true, messageId }

  } catch (err: unknown) {
    await rollbackFirstWhatsAppSentAt(patientPhone)
    try {
      await logError('whatsapp_send', err, { patientPhone, serviceType, step: 'exception' })
    } catch {
      console.error('[sendFirstContactWhatsApp] network exception (logError also failed):', err)
    }
    return { sent: false, reason: 'exception' }
  }
}
