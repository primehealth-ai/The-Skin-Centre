// Requires 'patient-photos' private bucket in Supabase Storage
// Bucket must be private — access only via signed URLs

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 })
    }

    const supabase = createServiceClient() as any

    // ── Auth ────────────────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Fetch photo record to get storage path ───────────────────────────────
    const { data: photo, error: photoError } = await supabase
      .from('patient_photos')
      .select('photo_url')
      .eq('id', id)
      .single()

    if (photoError || !photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // ── Generate signed URL (1 hour expiry) ──────────────────────────────────
    const { data: signedData, error: signedError } = await supabase.storage
      .from('patient-photos')
      .createSignedUrl(photo.photo_url, 3600)

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
