import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { isValidIndianPhone, normalizePhone } from '@/lib/utils/phone'

export const dynamic = 'force-dynamic'

// ── Clinic location (sent as a pin after every manual template) ──────────────
const CLINIC_LOCATION = {
  latitude: '25.6000901',
  longitude: '85.1512566',
  name: 'The Skin Centre',
  address: 'Patna, Bihar',
} as const

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 })
    }

    const body = await req.json()
    const { to, message, templateId, relatedMissedCallId } = body

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

    // Look up template by DB id — gupshup_template_id holds the Facebook/Meta template ID
    // Values: 1556340389353326 (skin_care), 2534426323646745 (hair_care), 918252100559312 (general)
    const supabaseAny = supabase as any
    const { data: templateRow, error: templateErr } = await supabaseAny
      .from('message_templates')
      .select('id, name, message_text, gupshup_template_id')
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

    const facebookTemplateId = templateRow.gupshup_template_id as string
    const messageText = (templateRow.message_text as string) || (templateRow.name as string)

    // ── STEP 1: Send the WhatsApp template ───────────────────────────────────
    // send_to is 917XXXXXXXXX format (no +), which is what normalizePhone returns
    const templateBody = new URLSearchParams({
      method: 'SendMessage',
      v: '1.1',
      auth_scheme: 'plain',
      format: 'json',
      msg_type: 'text',
      isHSM: 'true',
      isTemplate: 'true',
      userid: process.env.GUPSHUP_USER_ID!,
      password: process.env.GUPSHUP_PASSWORD!,
      send_to: dbPhone,
      whatsAppTemplateId: facebookTemplateId,
    })

    console.log('[gupshup-request]', templateBody.toString())

    const templateAbort = new AbortController()
    const templateTimeout = setTimeout(() => templateAbort.abort(), 10000)
    let templateRes: Response
    try {
      templateRes = await fetch('https://mediaapi.smsgupshup.com/GatewayAPI/rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: templateBody.toString(),
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
      await logError('whatsapp', new Error(errorMsg), {
        route: 'manual-send', dbPhone, templateId, facebookTemplateId, apiResponse: templateApiResponse,
      })
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

    // ── STEP 2: Send clinic location pin (best-effort, never fails the request) ──
    // Location is sent as a follow-up after the template.
    // This succeeds when a 24-hr session is active; if not, Gupshup rejects it — that
    // is acceptable. The template message was already delivered regardless.
    try {
      const locationBody = new URLSearchParams({
        method: 'SendMessage',
        v: '1.1',
        auth_scheme: 'plain',
        format: 'json',
        msg_type: 'LOCATION',
        userid: process.env.GUPSHUP_USER_ID!,
        password: process.env.GUPSHUP_PASSWORD!,
        send_to: dbPhone,
        location: JSON.stringify({
          latitude: CLINIC_LOCATION.latitude,
          longitude: CLINIC_LOCATION.longitude,
          name: CLINIC_LOCATION.name,
          address: CLINIC_LOCATION.address,
        }),
      })

      const locationRes = await fetch('https://mediaapi.smsgupshup.com/GatewayAPI/rest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: locationBody.toString(),
      })

      let locationApiResponse: Record<string, unknown> = {}
      try {
        locationApiResponse = (await locationRes.json()) as Record<string, unknown>
      } catch {
        locationApiResponse = {}
      }

      const locationInner = (locationApiResponse.response ?? locationApiResponse) as Record<string, unknown>
      const locationStatus = String(locationInner.status ?? '')
      const locationMsgId = String(locationInner.id ?? '')

      if (locationStatus === 'submitted' || locationStatus === 'success') {
        // Log the location as a second outbound message
        await supabase.from('whatsapp_messages').insert({
          patient_id: patient?.id || null,
          patient_phone: dbPhone,
          patient_name: patient?.full_name || null,
          whatsapp_message_id: locationMsgId || null,
          message_text: `📍 ${CLINIC_LOCATION.name} — ${CLINIC_LOCATION.address}`,
          direction: 'outbound',
          sent_by_staff_id: user.id,
          sent_by_automation: false,
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          related_missed_call_id: relatedMissedCallId || null,
        })
      } else {
        // Location send failed (no open session is the most common reason) — log silently
        console.info(
          `[manual-send] Location pin skipped for ${dbPhone}: status=${locationStatus}, code=${locationInner.code ?? 'n/a'}`
        )
      }
    } catch (locationErr) {
      // Never let location failure surface to caller
      console.error('[manual-send] Location send threw unexpectedly:', locationErr)
    }

    return NextResponse.json({ success: true, data: loggedMsg }, { status: 200 })
  } catch (err: unknown) {
    await logError('whatsapp', err, { route: 'manual-send' })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
