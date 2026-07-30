export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface VoidConsentBody {
  consent_id: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: Partial<VoidConsentBody> = {}
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    payload = (await req.json()) as Partial<VoidConsentBody>
    const { consent_id } = payload

    if (!consent_id) {
      return NextResponse.json({ error: 'consent_id is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: existing, error: fetchError } = await supabase
      .from('patient_consents')
      .select('id, status')
      .eq('id', consent_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Consent record not found' }, { status: 404 })
    }

    if (existing.status === 'void') {
      return NextResponse.json({ error: 'Consent is already void' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('patient_consents')
      .update({ status: 'void' })
      .eq('id', consent_id)

    if (updateError) {
      await logError('consent', updateError, {
        source: 'POST /api/consent/void',
        consent_id,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    await logError('consent', error, {
      source: 'POST /api/consent/void',
      payload,
    })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
