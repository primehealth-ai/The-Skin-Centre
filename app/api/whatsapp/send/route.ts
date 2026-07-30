import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { isValidIndianPhone, normalizePhone } from '@/lib/utils/phone'
import { sendLocationTemplate, sendSessionTextMessage, sendTextTemplate } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

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
      const { data: patient, error: patientErr } = await supabase
        .from('patients')
        .select('id, full_name, whatsapp_session_expires_at')
        .eq('phone', dbPhone)
        .maybeSingle()

      if (patientErr) {
        await logError('whatsapp', patientErr, { route: 'manual-send', step: 'session_lookup', phone: dbPhone })
        return NextResponse.json({ error: 'Unable to verify WhatsApp session. Send aborted.' }, { status: 500 })
      }

      const sessionOpen = patient?.whatsapp_session_expires_at
        ? new Date(patient.whatsapp_session_expires_at) > new Date()
        : false

      if (!sessionOpen) {
        return NextResponse.json(
          { error: 'WhatsApp session is closed. Please select a template.' },
          { status: 400 }
        )
      }

      let sessionMsgId = ''
      try {
        const result = await sendSessionTextMessage(dbPhone, message)
        sessionMsgId = result.messageId
      } catch (sendErr: unknown) {
        const errObj = sendErr as Record<string, unknown>
        const apiResponse = errObj?.apiResponse ?? {}
        const errorMsg = sendErr instanceof Error ? sendErr.message : 'Gupshup send failed'

        try {
          await (supabase as any).from('error_logs').insert({
            source: 'gupshup_error',
            error_message: errorMsg,
            stack: null,
            payload: { phone: dbPhone, templateId: null, messageType: 'session_text', gupshupResponse: apiResponse },
          })
        } catch (logErr) {
          console.error('[manual-send] Failed to log gupshup error:', logErr)
        }

        return NextResponse.json({ error: errorMsg }, { status: 502 })
      }

      const nowIso = new Date().toISOString()
      const { data: loggedMsg, error: insertErr } = await supabase
        .from('whatsapp_messages')
        .insert({
          patient_id: patient?.id || null,
          patient_phone: dbPhone,
          patient_name: patient?.full_name || null,
          whatsapp_message_id: sessionMsgId || null,
          message_text: message,
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
          templateId: null,
          relatedMissedCallId: relatedMissedCallId || null,
        })
      }

      return NextResponse.json({ success: true, data: loggedMsg }, { status: 200 })
    }

    // Look up template — fetch template_type to decide which send function to use
    const supabaseAny = supabase as any
    const { data: templateRow, error: templateErr } = await supabaseAny
      .from('message_templates')
      .select('id, name, message_text, gupshup_template_id, service_type, template_type')
      .eq('id', templateId)
      .eq('is_active', true)
      .maybeSingle()

    if (templateErr) {
      await logError('whatsapp', templateErr, { route: 'manual-send', templateId, step: 'template_lookup' })
      return NextResponse.json({ error: 'Failed to load template.' }, { status: 500 })
    }

    console.log('[template-lookup]', {
      templateId,
      gupshup_template_id: templateRow?.gupshup_template_id,
      template_type: templateRow?.template_type,
    })

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

    // ── Routing: location vs text ─────────────────────────────────────────────
    // template_type column drives routing. Fallback: if service_type is one of
    // our 3 clinic services, treat as location (matches original Gupshup approval).
    const templateType: string = (templateRow.template_type as string) || 'location'

    let templateMsgId = ''

    try {
      if (templateType === 'location') {
        // sendLocationTemplate: msg_type=LOCATION, NO wa_template_json
        const result = await sendLocationTemplate(dbPhone, facebookTemplateId)
        templateMsgId = result.messageId
      } else {
        // sendTextTemplate: msg_type=text, optional var1
        const result = await sendTextTemplate(dbPhone, facebookTemplateId)
        templateMsgId = result.messageId
      }
    } catch (sendErr: unknown) {
      const errObj = sendErr as Record<string, unknown>
      const apiResponse = errObj?.apiResponse ?? {}
      const errorMsg = sendErr instanceof Error ? sendErr.message : 'Gupshup send failed'

      try {
        await (supabase as any).from('error_logs').insert({
          source: 'gupshup_error',
          error_message: errorMsg,
          stack: null,
          payload: { phone: dbPhone, templateId, facebookTemplateId, templateType, gupshupResponse: apiResponse },
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
