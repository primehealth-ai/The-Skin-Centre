import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'
import { normalizePhone } from '@/lib/utils/phone'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 1. Webhook auth check
    const webhookSecret = process.env.EXOTEL_WEBHOOK_SECRET
    const receivedSecret = req.nextUrl.searchParams.get('secret')
    if (webhookSecret && receivedSecret !== webhookSecret) {
      console.warn('Exotel Webhook: Unauthorized execution attempt.')
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const body = await req.formData()
    const callSid = body.get('CallSid') as string
    const from = body.get('From') as string
    const to = body.get('To') as string
    const status = body.get('Status') as string
    const duration = body.get('Duration') as string

    if (!callSid || !from || !to) {
      return new NextResponse('Missing required call parameters', { status: 400 })
    }

    // Use Service Role Client to bypass RLS
    const supabase = createServiceClient()

    // 2. Duplicate prevention (upsert check)
    const { data: existingCall } = await supabase
      .from('calls')
      .select('id')
      .eq('exotel_call_sid', callSid)
      .maybeSingle()

    if (existingCall) {
      console.log(`Exotel Webhook: Call SID ${callSid} already processed.`)
      return new NextResponse('Duplicate ignored', { status: 200 })
    }

    // Normalize phone number format
    const normalizedPatientPhone = normalizePhone(from)

    // Resolve mapped clinic number lines (Airtel -> Service mappings)
    const { data: clinicNumber } = await supabase
      .from('clinic_numbers')
      .select('id, service_name')
      .eq('phone_number', to)
      .maybeSingle()

    // Fetch existing patient profile or create a stub for new ones
    let patientId: string | null = null
    let patientName: string | null = null

    const { data: existingPatient } = await supabase
      .from('patients')
      .select('id, full_name')
      .eq('phone', normalizedPatientPhone)
      .maybeSingle()

    if (existingPatient) {
      patientId = existingPatient.id
      patientName = existingPatient.full_name
    } else {
      // Create patient stub automatically
      const { data: newPatient, error: newPatientErr } = await supabase
        .from('patients')
        .insert({
          phone: normalizedPatientPhone,
          full_name: 'New Patient',
          internal_notes: 'Automatically generated stub from Exotel call line.'
        })
        .select('id, full_name')
        .maybeSingle()
      
      if (newPatientErr) {
        console.error('Failed to create patient stub:', newPatientErr.message)
      } else if (newPatient) {
        patientId = newPatient.id
        patientName = newPatient.full_name
      }
    }

    // 3. Nuanced Exotel Status Mapping
    // completed -> answered, no-answer -> no-answer, busy -> busy, failed -> failed, else missed
    let mappedStatus: 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed' = 'missed'
    if (status === 'completed') {
      mappedStatus = 'answered'
    } else if (status === 'no-answer') {
      mappedStatus = 'no-answer'
    } else if (status === 'busy') {
      mappedStatus = 'busy'
    } else if (status === 'failed') {
      mappedStatus = 'failed'
    }

    // Insert call log into calls table
    const { data: newCall, error: insertErr } = await supabase
      .from('calls')
      .insert({
        exotel_call_sid: callSid,
        patient_phone: normalizedPatientPhone,
        patient_id: patientId,
        patient_name: patientName,
        incoming_number: to,
        clinic_number_id: clinicNumber?.id || null,
        service_type: clinicNumber?.service_name || 'General',
        call_status: mappedStatus,
        call_direction: 'inbound',
        call_started_at: new Date().toISOString(),
        call_duration: parseInt(duration || '0', 10)
      })
      .select('id')
      .single()

    if (insertErr) {
      console.error('Call insertion failed:', insertErr.message)
      return new NextResponse(insertErr.message, { status: 500 })
    }

    // 4. Trigger immediate WhatsApp send if missed (Vercel Free Plan bypass)
    const isMissed = ['missed', 'no-answer', 'busy'].includes(mappedStatus)
    if (isMissed && newCall) {
      try {
        // Retrieve trigger auto-created missed_calls record
        // It might take a millisecond for the trigger to run, so let's select it.
        const { data: missedCall } = await supabase
          .from('missed_calls')
          .select('id')
          .eq('call_id', newCall.id)
          .maybeSingle()

        if (missedCall) {
          // Fetch template
          const { data: template } = await supabase
            .from('message_templates')
            .select('message_text')
            .eq('category', 'missed-call')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

          let textMessage = template?.message_text || `Hi! 👋 We missed your call at *The Skin Centre*.

🕐 *Office Hours:* 9 AM - 6 PM (Mon-Sat)
🌐 *Website:* https://theskincentre.in

We will contact you shortly. Reply here if you need immediate assistance!`

          // Substitute tags if present
          textMessage = textMessage
            .replace(/{{patient_name}}/g, patientName || 'Patient')
            .replace(/{{service}}/g, clinicNumber?.service_name || 'General')

          // Send message
          const metaResponse = await sendWhatsAppMessage(normalizedPatientPhone, textMessage)

          if (!metaResponse.error) {
            const messageId = metaResponse.messages?.[0]?.id || `auto_${Date.now()}`

            // Insert into whatsapp logs
            await supabase.from('whatsapp_messages').insert({
              patient_id: patientId,
              patient_phone: normalizedPatientPhone,
              patient_name: patientName || 'Patient',
              whatsapp_message_id: messageId,
              message_text: textMessage,
              direction: 'outbound',
              sent_by_automation: true,
              delivery_status: 'sent',
              related_missed_call_id: missedCall.id
            })

            // Update missed call status
            await supabase
              .from('missed_calls')
              .update({
                status: 'whatsapp_sent',
                whatsapp_sent_at: new Date().toISOString(),
                whatsapp_message_id: messageId
              })
              .eq('id', missedCall.id)
            
            console.log(`WhatsApp recovery message sent immediately to ${normalizedPatientPhone}`)
          } else {
            console.error('WhatsApp API sending failed during immediate recovery:', metaResponse.error)
          }
        }
      } catch (recoveryErr: unknown) {
        console.error('Immediate missed call recovery dispatch failed:', recoveryErr instanceof Error ? recoveryErr.message : recoveryErr)
      }
    }

    return new NextResponse('OK', { status: 200 })
  } catch (err: unknown) {
    console.error('Exotel webhook error:', err instanceof Error ? err.message : err)
    return new NextResponse(err instanceof Error ? err.message : 'Internal Server Error', { status: 500 })
  }
}
