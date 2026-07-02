import { createServiceClient } from '@/lib/supabase/server'
import { processKnowlarityWebhook } from '@/lib/processors/knowlarity'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60;

export async function GET() {
  return processWebhooks()
}

export async function POST() {
  return processWebhooks()
}

async function processWebhooks() {
  const supabase = createServiceClient() as any

  // Claim up to 15 pending jobs atomically using SKIP LOCKED RPC
  const { data: jobs, error } = await supabase.rpc('claim_webhook_jobs', { limit_count: 15 })

  if (error) {
    await logError('cron', error)
    return new Response(JSON.stringify({ processed: 0, error: error.message }), { status: 500 })
  }

  const queue = jobs ?? []

  // Process all claimed jobs in parallel
  await Promise.all(
    queue.map(async (job: any) => {
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
        const attemptsUsed = job.attempts ?? 1
        // Bug 4 fix: String(err) serialises Error objects as "[object Object]".
        // Extract .message for real Error instances; JSON.stringify for anything else.
        const errMessage = err instanceof Error ? err.message : JSON.stringify(err)
        await supabase
          .from('webhook_queue')
          .update({
            status: attemptsUsed >= 3 ? 'failed' : 'pending',
            error: errMessage,
          })
          .eq('id', job.id)

        await logError('cron', err, job.payload)
      }
    })
  )

  return new Response(JSON.stringify({ processed: queue.length }), { status: 200 })
}
