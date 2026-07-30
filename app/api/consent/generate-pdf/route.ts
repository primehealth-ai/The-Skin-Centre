import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import { generateConsentPDF } from '@/lib/consent/pdf'
import { getClinicLogoBase64 } from '@/lib/consent/logo'
import type { ConsentTemplate, PatientConsent } from '@/lib/consent/types'

export const dynamic = 'force-dynamic'

interface GeneratePdfBody {
  consent_id: string
}

async function fetchSignatureAsBase64(
  supabase: ReturnType<typeof createServiceClient>,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage.from('patient-consents').download(path)
  if (error || !data) {
    throw new Error(`Failed to download signature: ${error?.message ?? 'Unknown error'}`)
  }
  const arrayBuffer = await data.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: Partial<GeneratePdfBody> = {}
  try {
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

    payload = (await req.json()) as Partial<GeneratePdfBody>
    const { consent_id } = payload

    if (!consent_id) {
      return NextResponse.json({ error: 'consent_id is required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: consent, error: consentError } = await supabase
      .from('patient_consents')
      .select(
        `
        *,
        template:consent_templates(*),
        patient:patients(*)
      `
      )
      .eq('id', consent_id)
      .single()

    if (consentError || !consent) {
      await logError('consent', consentError ?? new Error('Consent not found'), {
        source: 'POST /api/consent/generate-pdf',
        consent_id,
      })
      return NextResponse.json({ error: 'Consent record not found' }, { status: 404 })
    }

    const typedConsent = consent as PatientConsent & {
      template: ConsentTemplate | null
      patient: {
        id: string
        full_name: string | null
        phone: string | null
        gender: string | null
        date_of_birth: string | null
      } | null
    }

    if (typedConsent.status === 'void') {
      return NextResponse.json({ error: 'Consent has been voided' }, { status: 400 })
    }

    if (!typedConsent.template) {
      return NextResponse.json({ error: 'Consent template not found' }, { status: 404 })
    }

    if (!typedConsent.patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Idempotent path
    if (typedConsent.status === 'pdf_generated' && typedConsent.pdf_url && typedConsent.pdf_hash) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('patient-consents')
        .createSignedUrl(typedConsent.pdf_url, 3600)

      if (signedError || !signedData?.signedUrl) {
        await logError('consent', signedError ?? new Error('Failed to create signed URL'), {
          source: 'POST /api/consent/generate-pdf',
          consent_id,
        })
        return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
      }

      return NextResponse.json(
        { pdf_url: signedData.signedUrl, pdf_hash: typedConsent.pdf_hash },
        { status: 200 }
      )
    }

    if (!typedConsent.signature_image_url) {
      return NextResponse.json({ error: 'Signature not found for consent' }, { status: 400 })
    }

    if (!typedConsent.staff_witness_id) {
      return NextResponse.json({ error: 'Witness not found for consent' }, { status: 400 })
    }

    const { data: witness, error: witnessError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', typedConsent.staff_witness_id)
      .single()

    if (witnessError || !witness) {
      await logError('consent', witnessError ?? new Error('Witness not found'), {
        source: 'POST /api/consent/generate-pdf',
        consent_id,
        witness_id: typedConsent.staff_witness_id,
      })
      return NextResponse.json({ error: 'Witness not found' }, { status: 404 })
    }

    const [logoBase64, signatureDataUrl] = await Promise.all([
      getClinicLogoBase64(),
      fetchSignatureAsBase64(supabase, typedConsent.signature_image_url),
    ])

    const { pdfBytes, hash } = await generateConsentPDF({
      template: typedConsent.template,
      patient: typedConsent.patient,
      filledFields: (typedConsent.consent_data as Record<string, string | boolean>) ?? {},
      staffWitness: { id: witness.id, full_name: witness.full_name || 'Unknown' },
      signatureDataUrl,
      deviceIp: typedConsent.device_ip || 'unknown',
      signedAt: typedConsent.signed_at ? new Date(typedConsent.signed_at) : new Date(),
      photoConsent: typedConsent.photo_consent,
      logoBase64,
    })

    const pdfPath = `consents/${typedConsent.patient.id}/${typedConsent.id}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('patient-consents')
      .upload(pdfPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      await logError('consent', uploadError, {
        source: 'POST /api/consent/generate-pdf',
        consent_id,
        pdfPath,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('patient_consents')
      .update({
        pdf_url: pdfPath,
        pdf_hash: hash,
        status: 'pdf_generated',
      })
      .eq('id', consent_id)

    if (updateError) {
      await logError('consent', updateError, {
        source: 'POST /api/consent/generate-pdf',
        consent_id,
        pdfPath,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('patient-consents')
      .createSignedUrl(pdfPath, 3600)

    if (signedError || !signedData?.signedUrl) {
      await logError('consent', signedError ?? new Error('Failed to create signed URL'), {
        source: 'POST /api/consent/generate-pdf',
        consent_id,
        pdfPath,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    return NextResponse.json(
      { pdf_url: signedData.signedUrl, pdf_hash: hash },
      { status: 200 }
    )
  } catch (error) {
    await logError('consent', error, {
      source: 'POST /api/consent/generate-pdf',
      payload,
    })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
