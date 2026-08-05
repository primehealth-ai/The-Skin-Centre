import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import type { ConsentTemplate, ConsentDynamicField } from '@/lib/consent/types'

export const dynamic = 'force-dynamic'

function calculateAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return 'N/A'
  const birthDate = new Date(dateOfBirth)
  if (isNaN(birthDate.getTime())) return 'N/A'
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const m = today.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  return `${age}`
}

interface SignConsentBody {
  patient_id: string
  template_id: string
  consent_data: Record<string, string | boolean>
  signature_data_url: string
  witness_name: string
  witness_signature_data_url: string
  doctor_signature_data_url: string
  photo_consent: boolean
  device_ip?: string
}

function extractClientIp(req: NextRequest, _bodyIp?: string): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp
  return 'unknown'
}

function buildConsentTextSnapshot(
  template: ConsentTemplate,
  consentData: Record<string, string | boolean>
): string {
  const fieldsSnapshot = template.dynamic_fields.map((field: ConsentDynamicField) => ({
    key: field.key,
    label: field.label,
    value: consentData[field.key] ?? null,
  }))

  return JSON.stringify({
    template_name: template.name,
    treatment_key: template.treatment_key,
    sections: template.sections,
    filled_fields: fieldsSnapshot,
    filled_values: consentData,
    signed_at: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: Partial<SignConsentBody> = {}
  console.log('[SIGN API] handler invoked')
  try {
    const userSupabase = await createClient()
    console.log('[SIGN API] client created')
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()
    console.log('[SIGN API] auth checked', { userId: user?.id, authError: authError?.message })

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: staff } = await userSupabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', user.id)
      .single()

    if (!staff || (staff.role !== 'staff' && staff.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    payload = (await req.json()) as Partial<SignConsentBody>
    const {
      patient_id,
      template_id,
      consent_data = {},
      signature_data_url,
      witness_name,
      witness_signature_data_url,
      doctor_signature_data_url,
      photo_consent,
      device_ip: bodyIp,
    } = payload

    if (
      !patient_id ||
      !template_id ||
      !signature_data_url ||
      !witness_name ||
      !witness_signature_data_url ||
      !doctor_signature_data_url
    ) {
      return NextResponse.json(
        { error: 'Missing required fields: patient_id, template_id, signature_data_url, witness_name, witness_signature_data_url, doctor_signature_data_url' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    console.log('[SIGN API] service client created')

    // Fetch patient
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, full_name, phone, gender, date_of_birth')
      .eq('id', patient_id)
      .single()

    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
    }

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from('consent_templates')
      .select('*')
      .eq('id', template_id)
      .single()

    if (templateError || !template) {
      return NextResponse.json({ error: 'Consent template not found' }, { status: 404 })
    }

    if (!template.is_active) {
      return NextResponse.json({ error: 'Consent template is not active' }, { status: 400 })
    }

    // Validate required dynamic fields
    const missingFields: string[] = []
    for (const field of template.dynamic_fields ?? []) {
      if (field.required) {
        const value = consent_data[field.key]
        if (value === undefined || value === null || value === '') {
          missingFields.push(field.label)
        }
      }
    }

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: 'Missing required fields', fields: missingFields },
        { status: 400 }
      )
    }

    // Device IP from headers only
    const deviceIp = extractClientIp(req, bodyIp)

    // Convert base64 signatures to Buffer
    const base64Data = signature_data_url.replace(/^data:image\/\w+;base64,/, '')
    const signatureBuffer = Buffer.from(base64Data, 'base64')
    const witnessBase64Data = witness_signature_data_url.replace(/^data:image\/\w+;base64,/, '')
    const witnessSignatureBuffer = Buffer.from(witnessBase64Data, 'base64')
    const doctorBase64Data = doctor_signature_data_url.replace(/^data:image\/\w+;base64,/, '')
    const doctorSignatureBuffer = Buffer.from(doctorBase64Data, 'base64')

    if (signatureBuffer.length === 0) {
      return NextResponse.json({ error: 'Invalid patient signature image' }, { status: 400 })
    }

    if (witnessSignatureBuffer.length === 0) {
      return NextResponse.json({ error: 'Invalid witness signature image' }, { status: 400 })
    }

    if (doctorSignatureBuffer.length === 0) {
      return NextResponse.json({ error: 'Invalid doctor signature image' }, { status: 400 })
    }

    if (
      signatureBuffer.length > 5 * 1024 * 1024 ||
      witnessSignatureBuffer.length > 5 * 1024 * 1024 ||
      doctorSignatureBuffer.length > 5 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: 'Signature image exceeds 5MB limit' },
        { status: 400 }
      )
    }

    // Upload signatures
    const timestamp = Date.now()
    const signaturePath = `signatures/${patient_id}/${timestamp}.png`
    const witnessSignaturePath = `signatures/${patient_id}/witness_${timestamp}.png`
    const doctorSignaturePath = `signatures/${patient_id}/doctor_${timestamp}.png`
    console.log('[SIGN API] uploading signatures', {
      signaturePath,
      witnessSignaturePath,
      doctorSignaturePath,
      patientSize: signatureBuffer.length,
      witnessSize: witnessSignatureBuffer.length,
      doctorSize: doctorSignatureBuffer.length,
    })
    const [patientUpload, witnessUpload, doctorUpload] = await Promise.all([
      supabase.storage
        .from('consent-signatures')
        .upload(signaturePath, signatureBuffer, {
          contentType: 'image/png',
          upsert: false,
        }),
      supabase.storage
        .from('consent-signatures')
        .upload(witnessSignaturePath, witnessSignatureBuffer, {
          contentType: 'image/png',
          upsert: false,
        }),
      supabase.storage
        .from('consent-signatures')
        .upload(doctorSignaturePath, doctorSignatureBuffer, {
          contentType: 'image/png',
          upsert: false,
        }),
    ])

    if (patientUpload.error) {
      await logError('consent', patientUpload.error, {
        source: 'POST /api/consent/sign',
        patient_id,
        template_id,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    if (witnessUpload.error) {
      await logError('consent', witnessUpload.error, {
        source: 'POST /api/consent/sign',
        patient_id,
        template_id,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    if (doctorUpload.error) {
      await logError('consent', doctorUpload.error, {
        source: 'POST /api/consent/sign',
        patient_id,
        template_id,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    console.log('[SIGN API] signatures uploaded, building insert')

    const consentText = buildConsentTextSnapshot(template as ConsentTemplate, consent_data)
    const patientAge = calculateAge(patient.date_of_birth)
    const nowIso = new Date().toISOString()

    const insertPayload = {
      patient_id,
      treatment: template.name,
      consent_text: consentText,
      template_id,
      consent_data: consent_data as Record<string, unknown>,
      signature_image_url: signaturePath,
      witness_signature_url: witnessSignaturePath,
      doctor_signature_url: doctorSignaturePath,
      device_ip: deviceIp,
      signed_by_ip: deviceIp, // backward compatibility with existing column
      staff_witness_id: staff?.id ?? user.id,
      staff_witness_name: witness_name,
      patient_name: patient.full_name ?? null,
      patient_age: patientAge,
      patient_gender: patient.gender ?? null,
      photo_consent: photo_consent ?? false,
      signed_at: nowIso,
      status: 'signed',
      created_by_staff_id: staff?.id ?? user.id,
      verified_via_otp: false,
    }

    console.log('[SIGN API] inserting consent record', { patient_id, template_id })
    const { data: inserted, error: insertError } = await supabase
      .from('patient_consents')
      .insert(insertPayload)
      .select('id')
      .single()

    if (insertError || !inserted) {
      console.error('[SIGN API] insert error', insertError)
      await supabase.from('error_logs').insert({
        source: 'consent_sign_insert',
        error_message: insertError?.message ?? 'Insert failed with no error',
        payload: { patient_id, template_id, signaturePath, witnessSignaturePath, doctorSignaturePath },
      })
      return NextResponse.json(
        { error: 'Failed to save consent.' },
        { status: 500 }
      )
    }

    console.log('[SIGN API] consent inserted', { consentId: inserted.id })
    return NextResponse.json(
      { consent_id: inserted.id, success: true },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : null
    console.error('[SIGN API] unhandled error', { message, stack })
    await logError('consent', error, {
      source: 'POST /api/consent/sign',
      payload,
    })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
