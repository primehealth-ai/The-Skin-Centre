import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { isValidIndianPhone, normalizePhone } from '@/lib/utils/phone'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth & Role check (using user session client)
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

    // 2. Parse body
    const body = await req.json()
    const { fullName, phone, email, dateOfBirth } = body

    if (!fullName || !phone) {
      return NextResponse.json({ error: 'Missing fullName or phone' }, { status: 400 })
    }

    const dbPhone = normalizePhone(phone)
    if (!dbPhone || !isValidIndianPhone(dbPhone)) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
    }

    // 3. Write record using service client.
    // Upsert on the UNIQUE phone so re-registering an existing caller (e.g. a
    // "New Patient" row auto-created by the webhook) updates instead of crashing
    // with a 23505 unique_violation. Only include optional fields when actually
    // provided, so a conflict update never overwrites existing data with empties.
    const record: Record<string, unknown> = {
      full_name: fullName.trim(),
      phone: dbPhone,
    }
    if (email) record.email = email
    if (dateOfBirth) record.date_of_birth = dateOfBirth

    const supabase = createServiceClient()
    const { data: patient, error: insertError } = await supabase
      .from('patients')
      .upsert(record, { onConflict: 'phone', ignoreDuplicates: false })
      .select('id, full_name, phone')
      .single()

    if (insertError || !patient) {
      throw insertError ?? new Error('Failed to upsert patient record')
    }

    return NextResponse.json({ success: true, patient }, { status: 201 })
  } catch (error: unknown) {
    await logError('patients', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
