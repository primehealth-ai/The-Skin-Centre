import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { isValidIndianPhone, normalizePhone } from '@/lib/utils/phone'
import { sendWhatsAppTemplateViaGupshup } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 1. Session verification check (must be signed-in staff/admin)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Staff authentication required' }, { status: 401 })
    }

    const { to, message, templateName, relatedMissedCallId } = await req.json()

    if (!to || (!message && !templateName)) {
      return NextResponse.json({ error: 'Missing recipient phone or message content' }, { status: 400 })
    }

    // 2. Validate phone and message constraints
    const normalizedPhone = normalizePhone(to)
    if (!normalizedPhone || !isValidIndianPhone(normalizedPhone)) {
      return NextResponse.json({ error: 'Invalid recipient phone number format' }, { status: 400 })
    }

    if (message && message.length > 4096) {
      return NextResponse.json({ error: 'Message content exceeds maximum length of 4096 characters' }, { status: 400 })
    }

    const allowedTemplates = new Set([
      'missed_call_skin_care',
      'missed_call_hair_care',
      'missed_call_general',
    ])

    if (templateName && !allowedTemplates.has(templateName)) {
      return NextResponse.json({ error: 'Invalid WhatsApp template name' }, { status: 400 })
    }

    const dbPhone = normalizedPhone

    // 1. Opt-out check
    const { data: optedOut, error: optedOutError } = await supabase
      .from('opted_out_numbers')
      .select('id')
      .eq('phone', dbPhone)
      .maybeSingle()

    // Fail CLOSED: if opt-out status cannot be determined, never proceed with the
    // send. Matches the automated path in lib/whatsapp/send.ts, which throws on
    // an opt-out query error rather than sending to a possibly-opted-out patient.
    if (optedOutError) {
      await logError('whatsapp', optedOutError, {
        route: 'manual-send',
        step: 'opt_out_check',
        phone: dbPhone,
      })
      return NextResponse.json(
        { error: 'Unable to verify opt-out status. Send aborted.' },
        { status: 500 }
      )
    }

    if (optedOut) {
      return NextResponse.json(
        { error: 'Cannot send WhatsApp message: Recipient has opted out of communications.' },
        { status: 400 }
      )
    }

    if (!templateName) {
      return NextResponse.json(
        { error: 'Free-form WhatsApp sends are disabled until the Knowlarity/Gupshup text endpoint is confirmed.' },
        { status: 400 }
      )
    }

    const { data: template } = await supabase
      .from('message_templates')
      .select('message_text, meta_template_language')
      .eq('meta_template_name', templateName)
      .eq('is_active', true)
      .maybeSingle()

    const messageText = template?.message_text || templateName
    const { messageId } = await sendWhatsAppTemplateViaGupshup({
      phone: dbPhone,
      templateName,
      language: template?.meta_template_language || 'en',
    })

    // Fetch patient ID if profile exists
    const { data: patient } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', dbPhone)
      .maybeSingle()

    // Log message as outbound
    const { data: loggedMsg, error: insertErr } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: patient?.id || null,
        patient_phone: dbPhone,
        patient_name: patient?.full_name || 'Patient',
        whatsapp_message_id: messageId,
        message_text: messageText,
        direction: 'outbound',
        sent_by_staff_id: user.id,
        sent_by_automation: false,
        delivery_status: 'sent',
        related_missed_call_id: relatedMissedCallId || null
      })
      .select()
      .single()

    if (insertErr) {
      await logError('whatsapp', insertErr, {
        route: 'manual-send',
        phone: dbPhone,
        templateName,
        relatedMissedCallId: relatedMissedCallId || null,
      })
    }

    // If this is sent as recovery, update missed calls tracking
    if (relatedMissedCallId) {
      const { error: updateErr } = await supabase
        .from('missed_calls')
        .update({
          status: 'whatsapp_sent',
          whatsapp_sent_at: new Date().toISOString(),
          whatsapp_message_id: messageId
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
    await logError('whatsapp', err, { route: 'manual-send' })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 })
  }
}
