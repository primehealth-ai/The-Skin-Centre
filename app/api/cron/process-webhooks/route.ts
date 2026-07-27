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
        const isPermanentlyFailed = attemptsUsed >= 5

        await supabase
          .from('webhook_queue')
          .update({
            status: isPermanentlyFailed ? 'failed' : 'pending',
            attempts: attemptsUsed + 1,
            error: errMessage,
          })
          .eq('id', job.id)

        // On permanent failure: log to error_logs so ops can investigate
        if (isPermanentlyFailed) {
          try {
            await supabase.from('error_logs').insert({
              source: 'webhook_queue_failed',
              error_message: `Webhook job ${job.id} permanently failed after ${attemptsUsed} attempts: ${errMessage}`,
              stack: null,
              payload: { jobId: job.id, attempts: attemptsUsed, payload: job.payload },
            })
          } catch (logErr) {
            console.error('[process-webhooks] Failed to write to error_logs:', logErr)
          }
        }

        await logError('cron', err, job.payload)
      }
    })
  )

  return new Response(JSON.stringify({ processed: queue.length }), { status: 200 })
}
