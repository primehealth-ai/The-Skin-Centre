import { createServiceClient } from '@/lib/supabase/server'
import { processKnowlarityWebhook } from '@/lib/processors/knowlarity'
import { logError } from '@/lib/utils/logError'

export async function POST() {
  const supabase = createServiceClient() as any

  const { data: jobs, error } = await supabase
    .from('webhook_queue')
    .select('id, payload, attempts')
    .eq('status', 'pending')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    await logError('cron', error)
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 })
  }

  const queue = jobs ?? []

  for (const job of queue) {
    const nextAttempts = (job.attempts ?? 0) + 1

    await supabase
      .from('webhook_queue')
      .update({
        status: 'processing',
        attempts: nextAttempts,
      })
      .eq('id', job.id)

    try {
      await processKnowlarityWebhook(job.payload)

      await supabase
        .from('webhook_queue')
        .update({
          status: 'done',
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', job.id)
    } catch (err: unknown) {
      await supabase
        .from('webhook_queue')
        .update({
          status: nextAttempts >= 3 ? 'failed' : 'pending',
          error: String(err),
        })
        .eq('id', job.id)

      await logError('cron', err, job.payload)
    }
  }

  return new Response(JSON.stringify({ processed: queue.length }), { status: 200 })
}
