import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export async function POST(req: Request) {
  const body = await req.json()

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('webhook_queue').insert({
      source: 'knowlarity',
      payload: body,
    })

    if (error) {
      await logError('webhook', error, { body })
    }
  } catch (error: unknown) {
    await logError('webhook', error, { body })
  }

  return new Response('OK', { status: 200 })
}
