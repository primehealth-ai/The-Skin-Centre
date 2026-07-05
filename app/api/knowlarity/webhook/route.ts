import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: unknown = null

  try {
    body = await req.json()
  } catch (error: unknown) {
    await logError('webhook', error, { body })
    return new Response('Invalid JSON payload', { status: 500 })
  }

  try {
    const supabase = createServiceClient()
    const insertPayload = Array.isArray(body)
      ? body.map((item) => ({
          source: 'knowlarity',
          payload: item,
          status: 'pending',
          attempts: 0,
        }))
      : {
          source: 'knowlarity',
          payload: body,
          status: 'pending',
          attempts: 0,
        }

    const { error } = await supabase.from('webhook_queue').insert(insertPayload)

    if (error) {
      await logError('webhook', error, { body })
      return new Response('Queue insert failed', { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (error: unknown) {
    await logError('webhook', error, { body })
    return new Response('Internal Server Error', { status: 500 })
  }
}
