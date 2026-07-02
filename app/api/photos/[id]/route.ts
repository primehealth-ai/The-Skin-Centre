import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
    }

    // 1. Auth check (using user session client)
    const userSupabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role check (staff/admin)
    const { data: profile } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createServiceClient()

    // Item 13 fix: confirm the photo exists and has NOT already been soft-deleted.
    // Without this guard, calling DELETE twice would silently succeed and update
    // deleted_at again with no feedback to the caller.
    const { data: existingPhoto, error: fetchError } = await supabase
      .from('patient_photos')
      .select('id, deleted_at')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      throw fetchError
    }

    if (!existingPhoto) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    if (existingPhoto.deleted_at !== null) {
      // Already deleted — treat as idempotent success but inform caller
      return NextResponse.json(
        { success: true, alreadyDeleted: true },
        { status: 200 }
      )
    }

    // 2. Perform soft delete using service client
    const { error: updateError } = await supabase
      .from('patient_photos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null) // extra guard — only update rows that are still active

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    await logError('photos', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
