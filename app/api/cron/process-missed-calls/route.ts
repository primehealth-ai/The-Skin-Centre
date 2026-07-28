import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { sendLocationTemplate } from '@/lib/whatsapp/send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ClaimedMissedCallJob = {
  id: string
  patient_id: string | null
  patient_phone: string
  service_type: string | null
}

// CRON endpoint triggered regularly as a backup queue processor.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn('Cron process-missed-calls: Unauthorized attempt.')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const whatsappEnabled = process.env.WHATSAPP_SENDING_ENABLED === 'true'
    if (!whatsappEnabled) {
      console.info('WhatsApp sending disabled, skipped')
      return NextResponse.json(
        { processed: 0, message: 'WhatsApp sending disabled, skipped' },
        { status: 200 }
      )
    }

    const supabase = createServiceClient()
    const { data: pendingQueue, error: queueErr } = await supabase.rpc(
      'claim_missed_call_jobs',
      { limit_count: 15 }
    )

    if (queueErr) {
      throw new Error(queueErr.message || 'Failed to claim missed calls queue')
    }

    const claimedJobs = (pendingQueue ?? []) as ClaimedMissedCallJob[]

    if (claimedJobs.length === 0) {
      return NextResponse.json(
        { processed: 0, message: 'No pending missed calls found.' },
        { status: 200 }
      )
    }

    const processedLogs: string[] = []

    for (const mc of claimedJobs) {
      try {
        const normalizedPhone = mc.patient_phone.replace(/^\+/, '').replace(/^0/, '')

        const { data: optedOut, error: optedOutError } = await supabase
          .from('opted_out_numbers')
          .select('id')
          .eq('phone', normalizedPhone)
          .maybeSingle()

        if (optedOutError) {
          await logError('cron', optedOutError, {
            missedCallId: mc.id,
            patientPhone: mc.patient_phone,
            step: 'opt_out_check',
          })
          continue
        }

        if (optedOut) {
          console.warn(`Cron WhatsApp send blocked: ${mc.patient_phone} has opted out.`)

          const { error: updateOptOutError } = await supabase
            .from('missed_calls')
            .update({
              status: 'lost',
              staff_notes: 'Automated send blocked: User opted out.',
            })
            .eq('id', mc.id)

          if (updateOptOutError) {
            await logError('cron', updateOptOutError, {
              missedCallId: mc.id,
              patientPhone: mc.patient_phone,
              step: 'mark_opted_out_lost',
            })
          }

          continue
        }

        // Look up active location template for this service type
        const { data: template, error: templateErr } = await supabase
          .from('message_templates')
          .select('gupshup_template_id')
          .eq('service_type', mc.service_type || 'General')
          .eq('is_active', true)
          .not('gupshup_template_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (templateErr || !template?.gupshup_template_id) {
          await logError('cron', templateErr || new Error('No active template'), {
            missedCallId: mc.id,
            serviceType: mc.service_type,
            step: 'template_lookup',
          })
          continue
        }

        const { messageId } = await sendLocationTemplate(normalizedPhone, template.gupshup_template_id)

        const nowSentIso = new Date().toISOString()
        await supabase
          .from('missed_calls')
          .update({
            status: 'whatsapp_sent',
            whatsapp_sent_at: nowSentIso,
            whatsapp_message_id: messageId,
          })
          .eq('id', mc.id)

        processedLogs.push(`Recovered: ${mc.patient_phone}`)
      } catch (err: unknown) {
        await logError('cron', err, {
          missedCallId: mc.id,
          patientPhone: mc.patient_phone,
          step: 'process_missed_call',
        })
      }
    }

    return NextResponse.json(
      {
        processed: processedLogs.length,
        logs: processedLogs,
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    await logError('cron', err, { route: 'process-missed-calls' })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
