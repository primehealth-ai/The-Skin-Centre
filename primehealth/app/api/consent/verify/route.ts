import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'
import { generateConsentPDF } from '@/lib/utils/pdf'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

// In-memory brute-force protection map (persists across warm serverless executions)
const FAILED_ATTEMPTS = new Map<string, { count: number; lastAttempt: number }>()
const LIMIT_WINDOW = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      phone,
      code,
      patientId,
      treatment,
      consentText,
      signatureDataUrl,
      checkedRisks,
    } = body

    if (!phone || !patientId) {
      return NextResponse.json({ error: 'Missing phone or patient ID' }, { status: 400 })
    }

    const normalizedPhone = normalizePhone(phone)
    const supabase = createServiceClient()

    // 1. Final Submission Step (Signature provided)
    if (signatureDataUrl) {
      // Validate staff is authenticated for final logging
      const userSupabase = await createClient()
      const {
        data: { user },
      } = await userSupabase.auth.getUser()
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized: Staff authentication required' },
          { status: 401 }
        )
      }

      // Fetch patient details for the PDF
      const { data: patient } = await supabase
        .from('patients')
        .select('full_name, phone')
        .eq('id', patientId)
        .single()

      if (!patient) {
        return NextResponse.json({ error: 'Patient profile not found' }, { status: 404 })
      }

      // Get staff profile details
      const { data: staff } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()

      // A. Upload patient signature to Supabase Storage
      const rawBase64Sig = signatureDataUrl.split('base64,')[1]
      const sigBuffer = Buffer.from(rawBase64Sig, 'base64')
      const sigFilename = `signatures/${patientId}_${Date.now()}.png`

      const { error: sigUploadErr } = await supabase.storage
        .from('consent-signatures')
        .upload(sigFilename, sigBuffer, {
          contentType: 'image/png',
          cacheControl: '3600',
          upsert: true,
        })

      if (sigUploadErr) {
        console.error('Signature upload failed:', sigUploadErr.message)
        return NextResponse.json({ error: 'Failed to upload signature' }, { status: 500 })
      }

      const { data: sigUrlData } = supabase.storage
        .from('consent-signatures')
        .getPublicUrl(sigFilename)

      const signatureImageUrl = sigUrlData?.publicUrl || null

      // B. Build full consent text enriched with checked risks
      const checkedRisksArr: string[] = Array.isArray(checkedRisks) ? checkedRisks : []
      const enrichedConsentText = checkedRisksArr.length > 0
        ? `${consentText || ''}\n\nPatient Acknowledged Risks:\n${checkedRisksArr.map((r: string) => `• ${r}`).join('\n')}`
        : consentText || ''

      // C. Generate consent PDF
      const signedAt = new Date().toISOString()
      const signedByIp = req.headers.get('x-forwarded-for') || '127.0.0.1'

      const pdfBuffer = await generateConsentPDF({
        patientName: patient.full_name || 'Patient',
        patientPhone: patient.phone,
        treatment: treatment || 'General Treatment',
        consentText: enrichedConsentText,
        signatureDataUrl,
        signedAt,
        signedByIp,
        staffName: staff?.full_name || undefined,
      })

      // D. Upload PDF to Supabase Storage
      const pdfFilename = `pdfs/${patientId}_${Date.now()}.pdf`
      const { error: pdfUploadErr } = await supabase.storage
        .from('consent-signatures')
        .upload(pdfFilename, pdfBuffer, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: true,
        })

      if (pdfUploadErr) {
        console.error('PDF upload failed:', pdfUploadErr.message)
        return NextResponse.json(
          { error: 'Failed to upload generated consent PDF' },
          { status: 500 }
        )
      }

      const { data: pdfUrlData } = supabase.storage
        .from('consent-signatures')
        .getPublicUrl(pdfFilename)

      const pdfUrl = pdfUrlData?.publicUrl || null

      // E. Insert final patient consent record
      const { data: consentRecord, error: insertErr } = await supabase
        .from('patient_consents')
        .insert({
          patient_id: patientId,
          treatment: treatment || 'General Treatment',
          consent_text: enrichedConsentText,
          verified_via_otp: true,
          otp_verified_at: signedAt,
          signature_image_url: signatureImageUrl,
          pdf_url: pdfUrl,
          signed_at: signedAt,
          signed_by_ip: signedByIp,
          created_by_staff_id: user.id,
        })
        .select()
        .single()

      if (insertErr) {
        console.error('Failed to log consent record:', insertErr.message)
        return NextResponse.json(
          { error: 'Failed to save final consent record to database' },
          { status: 500 }
        )
      }

      return NextResponse.json(
        {
          success: true,
          message: 'Consent form logged successfully',
          data: consentRecord,
          pdfUrl,
        },
        { status: 200 }
      )
    }

    // 2. OTP Verification Step (No signature provided yet)
    if (!code) {
      return NextResponse.json({ error: 'Missing OTP code to verify' }, { status: 400 })
    }

    // Brute-force protection check
    const now = Date.now()
    const rateStatus = FAILED_ATTEMPTS.get(normalizedPhone)
    if (
      rateStatus &&
      rateStatus.count >= MAX_ATTEMPTS &&
      now - rateStatus.lastAttempt < LIMIT_WINDOW
    ) {
      return NextResponse.json(
        {
          error:
            'Too many failed verification attempts. Please wait 10 minutes or request a new OTP.',
        },
        { status: 429 }
      )
    }

    // Compute SHA-256 hash of submitted OTP
    const hashedCode = crypto.createHash('sha256').update(code.trim()).digest('hex')

    // Query active unused OTP
    const { data: matchedCode, error: queryErr } = await supabase
      .from('otp_codes')
      .select('id, expires_at')
      .eq('phone', normalizedPhone)
      .eq('patient_id', patientId)
      .eq('code', hashedCode)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (queryErr || !matchedCode) {
      // Increment failed attempts
      const currentCount = rateStatus ? rateStatus.count + 1 : 1
      FAILED_ATTEMPTS.set(normalizedPhone, { count: currentCount, lastAttempt: now })

      return NextResponse.json(
        { error: 'Expired or invalid OTP code. Please verify and try again.' },
        { status: 400 }
      )
    }

    // Reset failed attempts upon successful verification
    FAILED_ATTEMPTS.delete(normalizedPhone)

    // Mark OTP as used
    const { error: updateErr } = await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('id', matchedCode.id)

    if (updateErr) {
      console.error('Failed to mark OTP as used:', updateErr.message)
    }

    return NextResponse.json(
      { success: true, message: 'OTP verified successfully' },
      { status: 200 }
    )
  } catch (err: unknown) {
    console.error(
      'Consent verification route error:',
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
