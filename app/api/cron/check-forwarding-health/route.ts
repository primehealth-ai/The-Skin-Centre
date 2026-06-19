import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export async function GET() {
  return checkForwardingHealth()
}

export async function POST() {
  return checkForwardingHealth()
}

async function checkForwardingHealth() {
  try {
    const supabase = createServiceClient() as any
    const checkedAt = new Date()

    const { data: clinicNumbers, error: clinicNumbersError } = await supabase
      .from('clinic_numbers')
      .select('id, phone_number')

    if (clinicNumbersError) {
      throw clinicNumbersError
    }

    let staleCount = 0

    for (const number of clinicNumbers ?? []) {
      const { data: latestCall, error: latestCallError } = await supabase
        .from('calls')
        .select('call_started_at')
        .eq('clinic_number_id', number.id)
        .order('call_started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestCallError) {
        throw latestCallError
      }

      const lastCallReceivedAt = latestCall?.call_started_at ?? null
      const hoursAgo = lastCallReceivedAt
        ? (checkedAt.getTime() - new Date(lastCallReceivedAt).getTime()) /
          (60 * 60 * 1000)
        : 9999
      const status = hoursAgo < 48 ? 'healthy' : 'stale'

      const { error: healthError } = await supabase
        .from('forwarding_health')
        .upsert(
          {
            clinic_number_id: number.id,
            last_call_received_at: lastCallReceivedAt,
            status,
            checked_at: checkedAt.toISOString(),
          },
          {
            onConflict: 'clinic_number_id',
          }
        )

      if (healthError) {
        throw healthError
      }

      if (status === 'stale') {
        staleCount += 1
        await logError('cron', `Forwarding stale: ${number.phone_number}`)
      }
    }

    return Response.json({
      checked: clinicNumbers?.length ?? 0,
      stale: staleCount,
    })
  } catch (error: unknown) {
    await logError('cron', error)
    return Response.json({ checked: 0, stale: 0 }, { status: 500 })
  }
}
