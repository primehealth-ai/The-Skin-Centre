import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export const maxDuration = 60;

const decodePhone = (raw: string | undefined): string => {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw).replace(/^\+/, '')
  } catch {
    return raw.replace(/^\+/, '').replace(/^%2b/i, '')
  }
}

function sanitizePayload(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(sanitizePayload)
  if (body && typeof body === 'object') {
    const payload = body as Record<string, unknown>
    const out = { ...payload }
    if (typeof out.caller_number === 'string') out.caller_number = decodePhone(out.caller_number)
    if (typeof out.called_number === 'string') out.called_number = decodePhone(out.called_number)
    if (typeof out.agent_number  === 'string') out.agent_number  = decodePhone(out.agent_number)
    return out
  }
  return body
}

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
    const sanitized = sanitizePayload(body)
    const insertPayload = Array.isArray(sanitized)
      ? sanitized.map((item) => ({
          source: 'knowlarity',
          payload: item,
          status: 'pending',
          attempts: 0,
        }))
      : {
          source: 'knowlarity',
          payload: sanitized,
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
