export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logError } from '@/lib/utils/logError'
import type { ConsentTemplate, ConsentDynamicField } from '@/lib/consent/types'

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
    template_treatment_key: template.treatment_key,
    sections_snapshot: template.sections,
    fields_snapshot: fieldsSnapshot,
    filled_values: consentData,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: Partial<SignConsentBody> = {}
  try {
    const userSupabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()

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
      photo_consent,
      device_ip: bodyIp,
    } = payload

    if (!patient_id || !template_id || !signature_data_url) {
      return NextResponse.json(
        { error: 'Missing required fields: patient_id, template_id, signature_data_url' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

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

    // Convert base64 signature to Buffer
    const base64Data = signature_data_url.replace(/^data:image\/\w+;base64,/, '')
    const signatureBuffer = Buffer.from(base64Data, 'base64')

    if (signatureBuffer.length === 0) {
      return NextResponse.json({ error: 'Invalid signature image' }, { status: 400 })
    }

    if (signatureBuffer.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Signature image exceeds 5MB limit' },
        { status: 400 }
      )
    }

    // Upload signature
    const timestamp = Date.now()
    const signaturePath = `signatures/${patient_id}/${timestamp}.png`
    const { error: uploadError } = await supabase.storage
      .from('patient-consents')
      .upload(signaturePath, signatureBuffer, {
        contentType: 'image/png',
        upsert: false,
      })

    if (uploadError) {
      await logError('consent', uploadError, {
        source: 'POST /api/consent/sign',
        patient_id,
        template_id,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    const consentText = buildConsentTextSnapshot(template as ConsentTemplate, consent_data)
    const patientAge = calculateAge(patient.date_of_birth)
    const nowIso = new Date().toISOString()

    const { data: inserted, error: insertError } = await supabase
      .from('patient_consents')
      .insert({
        patient_id,
        treatment: template.name,
        consent_text: consentText,
        template_id,
        consent_data: consent_data as Record<string, unknown>,
        signature_image_url: signaturePath,
        device_ip: deviceIp,
        signed_by_ip: deviceIp, // backward compatibility with existing column
        staff_witness_id: staff.id,
        staff_witness_name: staff.full_name,
        patient_name: patient.full_name,
        patient_age: patientAge,
        patient_gender: patient.gender,
        photo_consent: photo_consent ?? false,
        signed_at: nowIso,
        status: 'signed',
        created_by_staff_id: staff.id,
        verified_via_otp: false,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      await logError('consent', insertError ?? new Error('Insert failed'), {
        source: 'POST /api/consent/sign',
        patient_id,
        template_id,
        signaturePath,
      })
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
    }

    return NextResponse.json(
      { consent_id: inserted.id, success: true },
      { status: 201 }
    )
  } catch (error) {
    await logError('consent', error, {
      source: 'POST /api/consent/sign',
      payload,
    })
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
