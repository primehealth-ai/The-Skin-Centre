import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppTemplate } from '@/lib/whatsapp/client'
import { normalizePhone } from '@/lib/knowlarity/client'
import { isValidIndianPhone } from '@/lib/utils/phone'

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
    if (!isValidIndianPhone(normalizedPhone)) {
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

    let messageText = message
    let metaResponse

    if (templateName) {
      const { data: template } = await supabase
        .from('message_templates')
        .select('message_text, meta_template_language')
        .eq('meta_template_name', templateName)
        .eq('is_active', true)
        .maybeSingle()

      messageText = template?.message_text || templateName
      metaResponse = await sendWhatsAppTemplate(
        normalizedPhone,
        templateName,
        template?.meta_template_language || 'en'
      )
    } else {
      metaResponse = await sendWhatsAppMessage(normalizedPhone, message)
    }
    
    if (metaResponse.error) {
      console.error('Meta API Dispatch Error:', metaResponse.error)
      return NextResponse.json({ error: metaResponse.error.message || 'WhatsApp sending failed' }, { status: 500 })
    }

    const messageId = metaResponse.messages?.[0]?.id || `out_${Date.now()}`

    // Fetch patient ID if profile exists
    const { data: patient } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', normalizedPhone)
      .maybeSingle()

    // Log message as outbound
    const { data: loggedMsg, error: insertErr } = await supabase
      .from('whatsapp_messages')
      .insert({
        patient_id: patient?.id || null,
        patient_phone: normalizedPhone,
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
      console.error('Database logging error for outbound WhatsApp:', insertErr.message)
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
        console.error('Failed to update missed call record after WhatsApp recovery dispatch:', updateErr.message)
      }
    }

    return NextResponse.json({ success: true, data: loggedMsg }, { status: 200 })
  } catch (err: unknown) {
    console.error('WhatsApp send route error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 })
  }
}
