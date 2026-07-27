import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { isValidIndianPhone, normalizePhone } from '@/lib/utils/phone'

export const dynamic = 'force-dynamic'

// ── Clinic location — embedded in every template send as msg_type=LOCATION ───
const CLINIC_LOCATION_JSON = JSON.stringify({
  longitude: '85.1512566',
  latitude: '25.6000901',
  name: 'The Skin Centre',
  address: "B-54, People's Cooperative Colony, Near Ganga Devi Mahila College, Patna - 800020",
})

/**
 * Build the wa_template_json component list.
 * Skin Care template has only a URL button (index 0).
 * Hair Care + General templates have URL (0) + call (1).
 */
function getWaTemplateJson(serviceType: string): string {
  const urlButton = { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: '' }] }
  const callButton = { type: 'button', sub_type: 'call', index: 1, parameters: [{ type: 'text', text: '' }] }
  if (serviceType === 'Skin Care') return JSON.stringify({ components: [urlButton] })
  return JSON.stringify({ components: [urlButton, callButton] })
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const { to, message, templateId, relatedMissedCallId, serviceType: bodyServiceType } = body

    // WHATSAPP_SENDING_ENABLED master gate — same as automated path
    if (process.env.WHATSAPP_SENDING_ENABLED !== 'true') {
      await supabase.from('error_logs').insert({
        source: 'whatsapp_dry_run',
        error_message: 'DRY RUN — manual template send blocked by WHATSAPP_SENDING_ENABLED=false',
        stack: null,
        payload: { to, templateId, triggeredBy: user.id, wouldSendAt: new Date().toISOString() },
      })
      return NextResponse.json(
        {
          error:
            'WhatsApp sending is disabled. Go to Vercel → Settings → Environment Variables and set WHATSAPP_SENDING_ENABLED=true, then redeploy.',
        },
        { status: 503 }
      )
    }

    if (!to || (!message && !templateId)) {
      return NextResponse.json({ error: 'Missing recipient phone or message content' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(to)
    if (!normalizedPhone || !isValidIndianPhone(normalizedPhone)) {
      return NextResponse.json({ error: 'Invalid recipient phone number format' }, { status: 400 })
    }

    if (message && message.length > 4096) {
      return NextResponse.json({ error: 'Message content exceeds maximum length of 4096 characters' }, { status: 400 })
    }

    const dbPhone = normalizedPhone

    if (!/^91\d{10}$/.test(dbPhone)) {
      return NextResponse.json({ error: 'Invalid phone format: ' + dbPhone }, { status: 400 })
    }

    // Opt-out check — fail closed
    const { data: optedOut, error: optedOutError } = await supabase
      .from('opted_out_numbers')
      .select('id')
      .eq('phone', dbPhone)
      .maybeSingle()

    if (optedOutError) {
      await logError('whatsapp', optedOutError, { route: 'manual-send', step: 'opt_out_check', phone: dbPhone })
      return NextResponse.json({ error: 'Unable to verify opt-out status. Send aborted.' }, { status: 500 })
    }

    if (optedOut) {
      return NextResponse.json(
        { error: 'Cannot send: Recipient has opted out of WhatsApp communications.' },
        { status: 400 }
      )
    }

    if (!templateId) {
      return NextResponse.json(
        { error: 'Free-form WhatsApp sends are not supported. Please select a template.' },
        { status: 400 }
      )
    }

    // Look up template — also fetches service_type as fallback when not in body
    const supabaseAny = supabase as any
    const { data: templateRow, error: templateErr } = await supabaseAny
      .from('message_templates')
      .select('id, name, message_text, gupshup_template_id, service_type')
      .eq('id', templateId)
      .eq('is_active', true)
      .maybeSingle()

    if (templateErr) {
      await logError('whatsapp', templateErr, { route: 'manual-send', templateId, step: 'template_lookup' })
      return NextResponse.json({ error: 'Failed to load template.' }, { status: 500 })
    }

    console.log('[template-lookup]', { templateId, gupshup_template_id: templateRow?.gupshup_template_id })

    if (!templateRow) {
      return NextResponse.json({ error: 'Template not found or is inactive.' }, { status: 404 })
    }

    if (!templateRow.gupshup_template_id) {
      return NextResponse.json(
        { error: 'Template not configured: gupshup_template_id is null for this template' },
        { status: 400 }
      )
    }

    // serviceType: prefer from request body (sent by frontend), fall back to DB column
    const serviceType: string = (bodyServiceType as string) || (templateRow.service_type as string) || 'General'

    const facebookTemplateId = templateRow.gupshup_template_id as string
    const messageText = (templateRow.message_text as string) || (templateRow.name as string)

    // ── Send the WhatsApp template via Gupshup ────────────────────────────────
    // msg_type=LOCATION embeds the clinic pin inside the template message.
    // wa_template_json determines which button components are included.
    const sendBody = new URLSearchParams({
      userid: process.env.GUPSHUP_USER_ID!,
      password: process.env.GUPSHUP_PASSWORD!,
      send_to: dbPhone,
      v: '1.1',
      format: 'json',
      msg_type: 'LOCATION',
      location: CLINIC_LOCATION_JSON,
      method: 'SENDMESSAGE',
      whatsAppTemplateId: facebookTemplateId,
      auth_scheme: 'plain',
      isHSM: 'true',
      isTemplate: 'true',
      wa_template_json: getWaTemplateJson(serviceType),
    })

    console.log('[gupshup-request]', sendBody.toString())

    const templateAbort = new AbortController()
    const templateTimeout = setTimeout(() => templateAbort.abort(), 10000)
    let templateRes: Response
    try {
      console.log('[final-payload]', sendBody.toString())
      templateRes = await fetch('https://mediaapi.smsgupshup.com/GatewayAPI/rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: sendBody.toString(),
        signal: templateAbort.signal,
      })
    } finally {
      clearTimeout(templateTimeout)
    }

    let templateApiResponse: Record<string, unknown> = {}
    try {
      templateApiResponse = (await templateRes.json()) as Record<string, unknown>
    } catch {
      templateApiResponse = {}
    }

    const templateInner = (templateApiResponse.response ?? templateApiResponse) as Record<string, unknown>
    const templateStatus = String(templateInner.status ?? '')
    const templateMsgId = String(templateInner.id ?? '')

    // Log raw Gupshup response on every attempt so it appears in Vercel logs
    console.log('[gupshup-http-status]', templateRes.status)
    console.info('[manual-send] Gupshup template API response:', JSON.stringify(templateApiResponse))

    if (templateStatus !== 'submitted' && templateStatus !== 'success') {
      const errorMsg = `Gupshup template send failed (status=${templateStatus}, code=${templateInner.code ?? 'n/a'})`

      // Log full Gupshup error response to error_logs for debugging
      try {
        await (supabase as any).from('error_logs').insert({
          source: 'gupshup_error',
          error_message: errorMsg,
          stack: null,
          payload: {
            phone: dbPhone,
            templateId,
            facebookTemplateId,
            serviceType,
            gupshupResponse: templateApiResponse,
          },
        })
      } catch (logErr) {
        console.error('[manual-send] Failed to log gupshup error:', logErr)
      }

      return NextResponse.json({ error: errorMsg }, { status: 502 })
    }

    // Fetch patient record for enrichment
    const { data: patient } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', dbPhone)
      .maybeSingle()

    const nowIso = new Date().toISOString()

    // Persist template message
    const { data: loggedMsg, error: insertErr } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: patient?.id || null,
        patient_phone: dbPhone,
        patient_name: patient?.full_name || null,
        whatsapp_message_id: templateMsgId || null,
        message_text: messageText,
        direction: 'outbound',
        sent_by_staff_id: user.id,
        sent_by_automation: false,
        delivery_status: 'sent',
        sent_at: nowIso,
        related_missed_call_id: relatedMissedCallId || null,
      })
      .select()
      .single()

    if (insertErr) {
      await logError('whatsapp', insertErr, {
        route: 'manual-send',
        phone: dbPhone,
        templateId,
        relatedMissedCallId: relatedMissedCallId || null,
      })
    }

    if (relatedMissedCallId) {
      const { error: updateErr } = await supabase
        .from('missed_calls')
        .update({
          status: 'whatsapp_sent',
          whatsapp_sent_at: nowIso,
          whatsapp_message_id: templateMsgId,
        })
        .eq('id', relatedMissedCallId)

      if (updateErr) {
        await logError('whatsapp', updateErr, {
          route: 'manual-send',
          missedCallId: relatedMissedCallId,
          phone: dbPhone,
          step: 'update_missed_call',
        })
      }
    }

    return NextResponse.json({ success: true, data: loggedMsg }, { status: 200 })
  } catch (err: unknown) {
    // Network / unhandled exception — log but never throw to caller
    try {
      await logError('whatsapp', err, { route: 'manual-send' })
    } catch {
      console.error('[manual-send] logError itself failed:', err)
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
