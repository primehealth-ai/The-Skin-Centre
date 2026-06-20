import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { generateConsentPDF } from '@/lib/utils/pdf'

interface CreateConsentBody {
  patientId: string
  treatment: string
  consentText: string
  signatureImageBase64: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
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
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (!profile || (profile.role !== 'staff' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    // ── Fetch Patient details for PDF generation ────────────────────────────
    const supabase = createServiceClient() as any
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('full_name, phone')
      .eq('id', patientId)
      .single()

    if (patientError || !patient) {
      throw new Error(`Patient not found: ${patientError?.message || 'Unknown error'}`)
    }

    // ── Client IP ───────────────────────────────────────────────────────────
    const clientIP =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown'

    // ── Convert base64 to Buffer for signature storage ──────────────────────
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

    // ── Generate PDF ────────────────────────────────────────────────────────
    const pdfBytes = await generateConsentPDF({
      patientName: patient.full_name || 'N/A',
      patientPhone: patient.phone || 'N/A',
      treatment,
      consentText,
      signatureDataUrl: signatureImageBase64,
      signedAt: nowIso,
      signedByIp: clientIP,
      staffName: profile.full_name || undefined,
    })

    // ── Upload PDF to Supabase Storage ──────────────────────────────────────
    const pdfStoragePath = `consents/${patientId}/${timestamp}_consent.pdf`
    const { error: pdfUploadError } = await supabase.storage
      .from('patient-photos')
      .upload(pdfStoragePath, Buffer.from(pdfBytes), {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (pdfUploadError) {
      throw new Error(`PDF upload failed: ${pdfUploadError.message}`)
    }

    // ── Insert into patient_consents ────────────────────────────────────────
    const { data: consent, error: insertError } = await supabase
      .from('patient_consents')
      .insert({
        patient_id: patientId,
        treatment,
        consent_text: consentText,
        verified_via_otp: false,
        signature_image_url: storagePath,
        pdf_url: pdfStoragePath,
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

