import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface RouteContext {
  params: Promise<{ id: string }>
}

function getBucketName(path: string): string {
  if (path.startsWith('consents/')) {
    return 'patient-photos'
  }
  return 'consent-signatures'
}

export async function GET(
  _req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json({ error: 'Consent ID required' }, { status: 400 })
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

    // 2. Fetch path from database using service client
    const supabase = createServiceClient()
    const { data: consent, error: fetchError } = await supabase
      .from('patient_consents')
      .select('signature_image_url')
      .eq('id', id)
      .single()

    if (fetchError || !consent) {
      return NextResponse.json({ error: 'Consent record not found' }, { status: 404 })
    }

    if (!consent.signature_image_url) {
      return NextResponse.json({ error: 'Signature path not found' }, { status: 404 })
    }

    // Handle legacy public URL parsing if any
    let storagePath = consent.signature_image_url
    if (storagePath.includes('/object/public/')) {
      const parts = storagePath.split('/object/public/')
      if (parts.length > 1) {
        // Strip bucket name from start of path if present
        const pathParts = parts[1].split('/')
        pathParts.shift() // remove bucket name
        storagePath = pathParts.join('/')
      }
    }

    const bucketName = getBucketName(storagePath)

    // 3. Generate signed URL (60 seconds expiry)
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, 60)

    if (signedError || !signedData?.signedUrl) {
      throw new Error(`Failed to generate signed signature URL: ${signedError?.message ?? 'Unknown error'}`)
    }

    return NextResponse.json({ url: signedData.signedUrl }, { status: 200 })
  } catch (error: unknown) {
    await logError('consent', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
