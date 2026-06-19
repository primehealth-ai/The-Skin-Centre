import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: any = null

  try {
    body = await req.json()
    const supabase = createServiceClient()

    if (Array.isArray(body)) {
      const rows = body.map((item) => ({
        source: 'knowlarity',
        payload: item,
        status: 'pending',
        attempts: 0
      }))

      const { error } = await supabase.from('webhook_queue').insert(rows)
      if (error) {
        await logError('webhook', error, { body })
      }
    } else {
      const { error } = await supabase.from('webhook_queue').insert({
        source: 'knowlarity',
        payload: body,
        status: 'pending',
        attempts: 0
      })

      if (error) {
        await logError('webhook', error, { body })
      }
    }
  } catch (error: unknown) {
    await logError('webhook', error, { body })
  }

  return new Response('OK', { status: 200 })
}
