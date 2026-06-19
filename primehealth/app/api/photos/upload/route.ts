// Requires 'patient-photos' private bucket in Supabase Storage
// Bucket must be private — access only via signed URLs

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import sharp from 'sharp'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServiceClient() as any

    // ── Auth ────────────────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse multipart form ─────────────────────────────────────────────────
    const form = await req.formData()
    const file      = form.get('file')      as File   | null
    const patientId = form.get('patientId') as string | null
    const photoType = form.get('photoType') as string | null
    const treatment = form.get('treatment') as string | null
    const bodyArea  = form.get('bodyArea')  as string | null
    const notes     = form.get('notes')     as string | null

    if (!file || !patientId || !photoType || !treatment) {
      return NextResponse.json(
        { error: 'Missing required fields: file, patientId, photoType, treatment' },
        { status: 400 }
      )
    }

    if (!['before', 'after'].includes(photoType)) {
      return NextResponse.json({ error: 'photoType must be "before" or "after"' }, { status: 400 })
    }

    // ── Validate file ────────────────────────────────────────────────────────
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPG, PNG, WEBP are allowed.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 5MB limit.' }, { status: 400 })
    }

    // ── Build storage path ───────────────────────────────────────────────────
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const timestamp = Date.now()
    const storagePath = `patients/${patientId}/${photoType}/${timestamp}.${ext}`

    // ── Upload to Supabase Storage ───────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let processedBuffer: any = buffer
    if (file.type.startsWith('image/')) {
      try {
        const image = sharp(buffer)
        const metadata = await image.metadata()

        if (metadata.width && metadata.height && (metadata.width > 1600 || metadata.height > 1600)) {
          image.resize({
            width: 1600,
            height: 1600,
            fit: 'inside',
            withoutEnlargement: true,
          })
        }

        if (file.type === 'image/png') {
          image.png({ quality: 80, compressionLevel: 8 })
        } else if (file.type === 'image/webp') {
          image.webp({ quality: 80 })
        } else {
          image.jpeg({ quality: 80, progressive: true })
        }

        processedBuffer = await image.toBuffer()
      } catch (err) {
        console.warn('Image compression failed, uploading original buffer:', err)
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('patient-photos')
      .upload(storagePath, processedBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // ── Insert DB record (store storage path, never public URL) ──────────────
    const { data: photo, error: insertError } = await supabase
      .from('patient_photos')
      .insert({
        patient_id:        patientId,
        photo_url:         storagePath,   // store the path, signed URLs generated on demand
        photo_type:        photoType,
        treatment,
        body_area:         bodyArea  || null,
        notes:             notes     || null,
        taken_by_staff_id: user.id,
        taken_at:          new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !photo) {
      throw insertError ?? new Error('Failed to insert photo record')
    }

    return NextResponse.json({ success: true, photoId: photo.id }, { status: 201 })
  } catch (error: unknown) {
    await logError('photos', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
