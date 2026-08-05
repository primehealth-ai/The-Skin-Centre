// Requires 'patient-photos' private bucket in Supabase Storage
// Bucket must be private — access only via signed URLs

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
    }

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

    // 2. Fetch photo record to get storage path using service client
    const supabase = createServiceClient()
    const { data: photo, error: photoError } = await supabase
      .from('patient_photos')
      .select('photo_url')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (photoError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // 3. Generate signed URL (1 hour expiry)
    const download = req.nextUrl.searchParams.get('download') === 'true'
    const { data: signedData, error: signedError } = await supabase.storage
      .from('patient-photos')
      .createSignedUrl(photo.photo_url, 3600, download ? { download: true } : undefined)

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Failed to generate signed URL: ${signedError?.message ?? 'Unknown error'}`)
    }

    return NextResponse.json(
      { url: signedData.signedUrl },
      {
        status: 200,
        headers: {
          // Cache for 55 minutes (slightly less than 1hr expiry)
          'Cache-Control': 'private, max-age=3300',
        },
      }
    )
  } catch (error: unknown) {
    await logError('photos', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
