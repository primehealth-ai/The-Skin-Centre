export type ConsentSection = {
  title: string
  content: string
  is_warning?: boolean
}

export type ConsentDynamicFieldType = 'text' | 'select' | 'textarea'

export type ConsentDynamicField = {
  key: string
  label: string
  type: ConsentDynamicFieldType
  options?: string[]
  required?: boolean
}

export type ConsentTemplate = {
  id: string
  name: string
  treatment_key: string
  description: string | null
  sections: ConsentSection[]
  dynamic_fields: ConsentDynamicField[]
  has_photo_consent: boolean
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export type PatientConsentStatus = 'signed' | 'pdf_generated' | 'void'

export type PatientConsent = {
  id: string
  patient_id: string
  treatment: string
  consent_text: string
  template_id: string | null
  consent_data: Record<string, string | boolean> | null
  signature_image_url: string | null
  pdf_url: string | null
  pdf_hash: string | null
  device_ip: string | null
  staff_witness_id: string | null
  staff_witness_name: string | null
  patient_name: string | null
  patient_age: string | null
  patient_gender: string | null
  photo_consent: boolean
  signed_at: string | null
  status: PatientConsentStatus
  created_by_staff_id: string | null
  created_at: string
}

export type ConsentFormState = {
  step: 1 | 2 | 3 | 4 | 5
  patientId: string | null
  templateId: string | null
  consentData: Record<string, string | boolean>
  photoConsent: boolean
  signatureDataUrl: string | null
  consentId: string | null
  submittedAt: string | null
}

export type ConsentPDFParams = {
  template: ConsentTemplate
  patient: {
    id: string
    full_name: string | null
    phone: string | null
    gender: string | null
    date_of_birth: string | null
  }
  filledFields: Record<string, string | boolean>
  staffWitness: {
    id: string
    full_name: string
  }
  signatureDataUrl: string
  deviceIp: string
  signedAt: Date
  photoConsent: boolean
  logoBase64: string
}

export type FilledConsentTemplate = {
  template: ConsentTemplate
  consentData: Record<string, string | boolean>
  photoConsent: boolean
}
