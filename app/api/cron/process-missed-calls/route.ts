import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { sendMissedCallWhatsApp } from '@/lib/whatsapp/send'

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

        // Resolve the live patient name from patients.full_name — missed_calls no
        // longer stores a denormalized patient_name snapshot.
        let livePatientName = 'Patient'
        if (mc.patient_id) {
          const { data: patientRow } = await supabase
            .from('patients')
            .select('full_name')
            .eq('id', mc.patient_id)
            .maybeSingle()
          livePatientName = patientRow?.full_name || 'Patient'
        }

        await sendMissedCallWhatsApp({
          phone: normalizedPhone,
          patientName: livePatientName,
          serviceType: mc.service_type || 'General',
          missedCallId: mc.id,
        })

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
