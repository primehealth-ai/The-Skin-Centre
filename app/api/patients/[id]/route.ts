import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Missing patient id' }, { status: 400 })
    }

    // 1. Auth & role check via session-aware client
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

    if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 2. Parse + validate body
    const body = await req.json()

    // Only allow whitelisted fields — phone is NOT editable
    const allowedFields = ['full_name', 'email', 'gender', 'date_of_birth', 'tags', 'internal_notes'] as const
    type AllowedField = (typeof allowedFields)[number]

    const updates: Partial<Record<AllowedField, unknown>> = {}

    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field] === '' ? null : body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // 3. Perform DB update using service client (bypasses RLS)
    const supabase = createServiceClient()
    const { data: patient, error: updateError } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateError) {
      throw updateError
    }

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, patient }, { status: 200 })
  } catch (error: unknown) {
    await logError('patients-update', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
