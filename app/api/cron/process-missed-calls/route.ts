import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/client'

export const dynamic = 'force-dynamic'

// CRON Endpoint triggered regularly as a backup queue processor
export async function GET(req: NextRequest) {
  try {
    // 1. CRON Secret verification (using Authorization Bearer token header)
    const cronSecret = process.env.CRON_SECRET
    const authHeader = req.headers.get('authorization')
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('Cron process-missed-calls: Unauthorized attempt.')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const whatsappEnabled = process.env.WHATSAPP_SENDING_ENABLED === 'true'
    if (!whatsappEnabled) {
      console.info('WhatsApp sending disabled, skipped')
      return NextResponse.json({ processed: 0, message: 'WhatsApp sending disabled, skipped' }, { status: 200 })
    }

    const supabase = createServiceClient()

    // 2. Fetch pending missed calls that happened more than 60 seconds ago (batch limit 20)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    
    const { data: pendingQueue, error: queueErr } = await supabase
      .from('missed_calls')
      .select('*')
      .eq('status', 'pending')
      .lt('missed_at', oneMinuteAgo)
      .order('missed_at', { ascending: true })
      .limit(20)

    if (queueErr) {
      throw new Error(queueErr.message || 'Failed to query missed calls queue')
    }

    if (!pendingQueue || pendingQueue.length === 0) {
      return NextResponse.json({ processed: 0, message: 'No pending missed calls found.' }, { status: 200 })
    }

    // Fetch missed-call message template once for the batch
    const { data: template } = await supabase
      .from('message_templates')
      .select('message_text')
      .eq('category', 'missed-call')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const defaultMessage = `Hi! 👋 We missed your call at *The Skin Centre*.

🕐 *Office Hours:* 9 AM - 6 PM (Mon-Sat)
🌐 *Website:* https://theskincentre.in

We will contact you shortly. Reply here if you need immediate assistance!`

    const baseMessageText = template?.message_text || defaultMessage
    const processedLogs: string[] = []

    // 3. Loop through pending recoveries
    for (const mc of pendingQueue) {
      try {
        const normalizedPhone = mc.patient_phone.replace(/^\+/, '').replace(/^0/, '')

        // 1. Opt-out check
        const { data: optedOut, error: optedOutError } = await supabase
          .from('opted_out_numbers')
          .select('id')
          .eq('phone', normalizedPhone)
          .maybeSingle()

        if (optedOutError) {
          console.error(`Cron opt-out check failed for ${mc.patient_phone}:`, optedOutError.message)
          continue
        }

        if (optedOut) {
          console.warn(`Cron WhatsApp send blocked: ${mc.patient_phone} has opted out.`)
          await supabase
            .from('missed_calls')
            .update({ status: 'lost', staff_notes: 'Automated send blocked: User opted out.' })
            .eq('id', mc.id)
          continue
        }

        // 2. 24h session window gate check
        const sessionExpiresAt = mc.whatsapp_session_expires_at
        const now = new Date()
        const isSessionActive = sessionExpiresAt && new Date(sessionExpiresAt) > now

        if (!isSessionActive) {
          console.warn(`Cron WhatsApp send blocked: No active 24-hour session window for ${mc.patient_phone}`)
          await supabase
            .from('missed_calls')
            .update({ status: 'lost', staff_notes: 'Automated send blocked: WhatsApp session window expired/inactive.' })
            .eq('id', mc.id)
          continue
        }

        // Personalize message text
        const textMessage = baseMessageText
          .replace(/{{patient_name}}/g, mc.patient_name || 'Patient')
          .replace(/{{service}}/g, mc.service_type || 'General')

        // Dispatch WhatsApp via Meta API
        const response = await sendWhatsAppMessage(mc.patient_phone, textMessage)
        
        if (response.error) {
          console.error(`Cron WhatsApp dispatch failed for ${mc.patient_phone}:`, response.error)
          continue
        }

        const messageId = response.messages?.[0]?.id || `auto_${Date.now()}`

        // Insert into whatsapp_messages logs
        const { error: insertErr } = await supabase.from('whatsapp_messages').insert({
          patient_id: mc.patient_id || null,
          patient_phone: mc.patient_phone,
          patient_name: mc.patient_name || 'Patient',
          whatsapp_message_id: messageId,
          message_text: textMessage,
          direction: 'outbound',
          sent_by_automation: true,
          delivery_status: 'sent',
          related_missed_call_id: mc.id
        })

        if (insertErr) {
          console.error(`Cron failed to log whatsapp message in DB for ${mc.patient_phone}:`, insertErr.message)
        }

        // Update missed calls queue status
        const { error: updateErr } = await supabase
          .from('missed_calls')
          .update({
            status: 'whatsapp_sent',
            whatsapp_sent_at: new Date().toISOString(),
            whatsapp_message_id: messageId
          })
          .eq('id', mc.id)

        if (updateErr) {
          console.error(`Cron failed to update missed call status in DB for ${mc.patient_phone}:`, updateErr.message)
        }

        processedLogs.push(`Recovered: ${mc.patient_phone}`)
      } catch (err: unknown) {
        console.error(`Failed to process recovery for missed call ${mc.id}:`, err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({
      processed: processedLogs.length,
      logs: processedLogs
    }, { status: 200 })
  } catch (err: unknown) {
    console.error('Cron process missed calls failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal Server Error' }, { status: 500 })
  }
}
