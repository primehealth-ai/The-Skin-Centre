import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'

interface CreateConsentBody {
  patientId: string
  treatment: string
  consentText: string
  signatureImageBase64: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = createServiceClient() as any

    // ── Auth: get staff from session ────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const staffId = user.id

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = (await req.json()) as Partial<CreateConsentBody>
    const { patientId, treatment, consentText, signatureImageBase64 } = body

    if (!patientId || !treatment || !consentText || !signatureImageBase64) {
      return NextResponse.json(
        { error: 'Missing required fields: patientId, treatment, consentText, signatureImageBase64' },
        { status: 400 }
      )
    }

    // ── Client IP ───────────────────────────────────────────────────────────
    const clientIP =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    // ── Convert base64 to Buffer ────────────────────────────────────────────
    // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
    const base64Data = signatureImageBase64.replace(/^data:image\/\w+;base64,/, '')
    const signatureBuffer = Buffer.from(base64Data, 'base64')

    // ── Upload signature to Supabase Storage ────────────────────────────────
    const timestamp = Date.now()
    const storagePath = `consents/${patientId}/${timestamp}_signature.png`

    const { error: uploadError } = await supabase.storage
      .from('patient-photos')
      .upload(storagePath, signatureBuffer, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Signature upload failed: ${uploadError.message}`)
    }

    const nowIso = new Date().toISOString()

    // ── Insert into patient_consents ────────────────────────────────────────
    const { data: consent, error: insertError } = await supabase
      .from('patient_consents')
      .insert({
        patient_id: patientId,
        treatment,
        consent_text: consentText,
        verified_via_otp: false,
        signature_image_url: storagePath,
        signed_at: nowIso,
        signed_by_ip: clientIP,
        created_by_staff_id: staffId,
      })
      .select('id')
      .single()

    if (insertError || !consent) {
      throw insertError ?? new Error('Failed to insert consent record')
    }

    return NextResponse.json({ success: true, consentId: consent.id }, { status: 201 })
  } catch (error: unknown) {
    await logError('consent', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
