'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import SignatureCanvas from 'react-signature-canvas'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  User,
  X,
  AlertCircle,
  ShieldCheck,
  Download,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { normalizePhone } from '@/lib/utils/phone'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { useAuth } from '@/hooks/useAuth'
import type { ConsentTemplate, ConsentDynamicField } from '@/lib/consent/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient {
  id: string
  full_name: string | null
  phone: string | null
  gender: string | null
  date_of_birth: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPhoneLike(input: string): boolean {
  return /\d{10,}/.test(input.replace(/\D/g, ''))
}

function formatConsentDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getInitials(name: string | null): string {
  if (!name) return 'P'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Step 3 + 4 Helpers ──────────────────────────────────────────────────────

function isCanvasEmpty(sigRef: RefObject<SignatureCanvas>): boolean {
  const canvas = sigRef.current?.getCanvas()
  if (!canvas || canvas.width === 0 || canvas.height === 0) return true
  const ctx = canvas.getContext('2d')
  if (!ctx) return true
  const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  // Canvas background is white; signature is non-white
  for (let i = 0; i < pixelData.length; i += 4) {
    if (pixelData[i] !== 255 || pixelData[i + 1] !== 255 || pixelData[i + 2] !== 255) {
      return false
    }
  }
  return true
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: 'Template' },
    { label: 'Details' },
    { label: 'Consent' },
    { label: 'Sign' },
    { label: 'Done' },
  ]

  return (
    <div className="flex items-center justify-between mb-8">
      {steps.map((step, index) => {
        const stepNumber = index + 1
        const isDone = currentStep > stepNumber
        const isActive = currentStep === stepNumber
        return (
          <div key={stepNumber} className="flex flex-col items-center gap-2 flex-1">
            <div
              className={[
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 border-2',
                isDone
                  ? 'bg-black text-white border-black'
                  : isActive
                  ? 'bg-black text-white border-black scale-110'
                  : 'bg-white text-slate-400 border-slate-200',
              ].join(' ')}
            >
              {isDone ? <Check className="h-4 w-4" /> : stepNumber}
            </div>
            <span
              className={[
                'text-[10px] font-bold transition-colors duration-200',
                isActive || isDone ? 'text-slate-900' : 'text-slate-400',
              ].join(' ')}
            >
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <div className="absolute h-0.5 bg-slate-200 w-full left-1/2 top-[18px] -z-10 hidden" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── New Consent Page Inner ──────────────────────────────────────────────────

function NewConsentPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialPatientId = searchParams.get('patient_id')

  const supabase = createClient()
  const sigRef = useRef<SignatureCanvas>(null)
  const doctorCanvasRef = useRef<SignatureCanvas>(null)
  const witnessCanvasRef = useRef<SignatureCanvas>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { profile } = useAuth()

  const [step, setStep] = useState(1)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [templates, setTemplates] = useState<ConsentTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<ConsentTemplate | null>(null)
  const [consentData, setConsentData] = useState<Record<string, string | boolean>>({})
  const [photoConsent, setPhotoConsent] = useState(false)
  const [consentId, setConsentId] = useState<string | null>(null)

  const [loadingPatient, setLoadingPatient] = useState(Boolean(initialPatientId))
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Patient[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [sigEmpty, setSigEmpty] = useState(true)
  const [doctorSigEmpty, setDoctorSigEmpty] = useState(true)
  const [witnessSigEmpty, setWitnessSigEmpty] = useState(true)
  const [witnessName, setWitnessName] = useState('')

  // Pre-fill witness name once profile is loaded
  useEffect(() => {
    if (profile?.full_name) {
      setWitnessName(profile.full_name)
    }
  }, [profile])

  // Load patient from query param
  useEffect(() => {
    if (!initialPatientId) {
      setLoadingPatient(false)
      return
    }
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('patients')
          .select('id, full_name, phone, gender, date_of_birth')
          .eq('id', initialPatientId)
          .single()
        if (error) throw error
        setPatient(data as Patient)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient')
      } finally {
        setLoadingPatient(false)
      }
    })()
  }, [initialPatientId, supabase])

  // Load templates
  useEffect(() => {
    void (async () => {
      try {
        setLoadingTemplates(true)
        const res = await fetch('/api/consent/templates')
        const json = (await res.json()) as { templates?: ConsentTemplate[]; error?: string }
        if (!res.ok) throw new Error(json.error || 'Failed to load templates')
        setTemplates(json.templates ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates')
      } finally {
        setLoadingTemplates(false)
      }
    })()
  }, [])

  // Debounced patient search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(() => {
      void (async () => {
        setSearching(true)
        try {
          let query = supabase
            .from('patients')
            .select('id, full_name, phone, gender, date_of_birth')
            .limit(10)

          if (isPhoneLike(searchQuery)) {
            const normalized = normalizePhone(searchQuery)
            if (normalized) {
              query = query.ilike('phone', `%${normalized}%`)
            } else {
              query = query.ilike('phone', `%${searchQuery.replace(/\D/g, '')}%`)
            }
          } else {
            query = query.ilike('full_name', `%${searchQuery}%`)
          }

          const { data, error } = await query
          if (error) throw error
          setSearchResults((data as Patient[]) ?? [])
        } catch (err) {
          console.error(err)
        } finally {
          setSearching(false)
        }
      })()
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, supabase])

  // Reset scroll enforcement on entering Step 3; auto-enable if content fits
  useEffect(() => {
    if (step !== 3) return
    setHasScrolledToBottom(false)
    const timer = setTimeout(() => {
      const el = scrollRef.current
      if (!el) return
      if (el.scrollHeight <= el.clientHeight + 50) {
        setHasScrolledToBottom(true)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [step, selectedTemplate])

  const handleSelectTemplate = useCallback((template: ConsentTemplate) => {
    setSelectedTemplate(template)
    setHasScrolledToBottom(false)
    setSubmitError(null)
    const initialData: Record<string, string | boolean> = {}
    for (const field of template.dynamic_fields ?? []) {
      initialData[field.key] = field.type === 'select' && field.options ? field.options[0] ?? '' : ''
    }
    setConsentData(initialData)
    setStep(template.dynamic_fields && template.dynamic_fields.length > 0 ? 2 : 3)
  }, [])

  const handleFieldChange = useCallback(
    (key: string, value: string | boolean) => {
      setConsentData((prev) => ({ ...prev, [key]: value }))
    },
    [setConsentData]
  )

  const validateRequiredFields = useCallback(() => {
    if (!selectedTemplate) return false
    for (const field of selectedTemplate.dynamic_fields ?? []) {
      if (field.required) {
        const value = consentData[field.key]
        if (value === undefined || value === null || value === '') {
          return false
        }
      }
    }
    return true
  }, [selectedTemplate, consentData])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 50) {
      setHasScrolledToBottom(true)
    }
  }, [])

  const handleClearSignature = useCallback(() => {
    sigRef.current?.clear()
    setSigEmpty(true)
  }, [])

  const handleSignatureChange = useCallback(() => {
    setSigEmpty(isCanvasEmpty(sigRef))
  }, [])

  const handleClearDoctorSignature = useCallback(() => {
    doctorCanvasRef.current?.clear()
    setDoctorSigEmpty(true)
  }, [])

  const handleDoctorSignatureChange = useCallback(() => {
    setDoctorSigEmpty(isCanvasEmpty(doctorCanvasRef))
  }, [])

  const handleClearWitnessSignature = useCallback(() => {
    witnessCanvasRef.current?.clear()
    setWitnessSigEmpty(true)
  }, [])

  const handleWitnessSignatureChange = useCallback(() => {
    setWitnessSigEmpty(isCanvasEmpty(witnessCanvasRef))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!patient || !selectedTemplate) return

    setIsSubmitting(true)
    setSubmitError(null)
    setError(null)

    try {
      const trimmedWitnessName = witnessName.trim()
      if (!trimmedWitnessName) {
        setSubmitError('Please provide the staff witness name.')
        setIsSubmitting(false)
        return
      }
      if (isCanvasEmpty(sigRef)) {
        setSubmitError('Please provide the patient signature before submitting.')
        setIsSubmitting(false)
        return
      }
      if (isCanvasEmpty(doctorCanvasRef)) {
        setSubmitError('Please provide the doctor signature before submitting.')
        setIsSubmitting(false)
        return
      }
      if (isCanvasEmpty(witnessCanvasRef)) {
        setSubmitError('Please provide the staff witness signature before submitting.')
        setIsSubmitting(false)
        return
      }

      let dataUrl: string
      let doctorDataUrl: string
      let witnessDataUrl: string
      try {
        dataUrl = sigRef.current?.getCanvas().toDataURL('image/png') ?? ''
        doctorDataUrl = doctorCanvasRef.current?.getCanvas().toDataURL('image/png') ?? ''
        witnessDataUrl = witnessCanvasRef.current?.getCanvas().toDataURL('image/png') ?? ''
      } catch (canvasErr) {
        console.error('[SIGN CLIENT] canvas toDataURL error', canvasErr)
        setSubmitError('Could not read signature. Please try again.')
        setIsSubmitting(false)
        return
      }
      if (
        !dataUrl || dataUrl.length < 100 ||
        !doctorDataUrl || doctorDataUrl.length < 100 ||
        !witnessDataUrl || witnessDataUrl.length < 100
      ) {
        setSubmitError('Could not read signature. Please try again.')
        setIsSubmitting(false)
        return
      }

      console.log('[SIGN CLIENT] posting to /api/consent/sign', {
        patient_id: patient.id,
        template_id: selectedTemplate.id,
        signatureLength: dataUrl.length,
        doctorSignatureLength: doctorDataUrl.length,
        witnessSignatureLength: witnessDataUrl.length,
      })
      const res = await fetch('/api/consent/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          template_id: selectedTemplate.id,
          consent_data: consentData,
          signature_data_url: dataUrl,
          witness_name: trimmedWitnessName,
          witness_signature_data_url: witnessDataUrl,
          doctor_signature_data_url: doctorDataUrl,
          photo_consent: selectedTemplate.has_photo_consent ? photoConsent : false,
          device_ip: '',
        }),
      })
      console.log('[SIGN CLIENT] response status', res.status)
      const text = await res.text()
      console.log('[SIGN CLIENT] response body preview', text.slice(0, 200))
      const json = JSON.parse(text) as { consent_id?: string; error?: string }
      if (!res.ok) {
        setSubmitError(json.error || `Submission failed (${res.status}). Please try again.`)
        setIsSubmitting(false)
        return
      }
      setConsentId(json.consent_id ?? null)
      setStep(5)
    } catch (err) {
      console.error('[SIGN CLIENT] fetch/parse error', err)
      setSubmitError(
        err instanceof Error
          ? `Error: ${err.message}`
          : 'Network error. Please check connection and try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [patient, selectedTemplate, consentData, photoConsent, witnessName])

  const handleGeneratePdf = useCallback(async () => {
    if (!consentId) return
    setGeneratingPdf(true)
    try {
      const res = await fetch('/api/consent/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_id: consentId }),
      })
      const json = (await res.json()) as { pdf_url?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to generate PDF')
      if (json.pdf_url) window.open(json.pdf_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setGeneratingPdf(false)
    }
  }, [consentId])

  const reset = useCallback(() => {
    setStep(1)
    setSelectedTemplate(null)
    setConsentData({})
    setPhotoConsent(false)
    setConsentId(null)
    setHasScrolledToBottom(false)
    setSigEmpty(true)
    setDoctorSigEmpty(true)
    setWitnessSigEmpty(true)
    setWitnessName(profile?.full_name ?? '')
    setError(null)
    setSubmitError(null)
    sigRef.current?.clear()
    doctorCanvasRef.current?.clear()
    witnessCanvasRef.current?.clear()
  }, [profile])

  if (loadingPatient || loadingTemplates) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-semibold">Loading…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/consent')}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-50">
              New Patient Consent
            </h1>
            <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400">
              The Skin Centre — Digital consent collection
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-4 md:p-6">
          <StepIndicator currentStep={step} />

          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ── STEP 1: Select Template / Patient ───────────────────────────── */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-4">
                1. Select Patient
              </h2>

              {patient ? (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                    {getInitials(patient.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">
                      {patient.full_name ?? 'Unknown Patient'}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">
                      {patient.phone ? formatPhoneNumber(patient.phone) : 'No phone'}
                    </p>
                  </div>
                  <Badge variant="primary">Selected</Badge>
                </div>
              ) : (
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                    Search patient by name or phone
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Type name or phone number"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
                    )}
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setPatient(p)
                            setSearchResults([])
                            setSearchQuery('')
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
                        >
                          <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                            {getInitials(p.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                              {p.full_name ?? 'Unknown'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {p.phone ? formatPhoneNumber(p.phone) : 'No phone'}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-4">
                2. Choose Consent Template
              </h2>

              {templates.length === 0 ? (
                <div className="p-6 bg-slate-50 dark:bg-slate-950/40 rounded-xl text-center text-sm text-slate-500">
                  No active consent templates available.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-400 dark:hover:border-blue-700 transition-colors bg-white dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-600" />
                          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                            {template.name}
                          </h3>
                        </div>
                        {template.has_photo_consent && (
                          <Badge variant="secondary" className="text-[10px]">
                            Photo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                        {template.description}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleSelectTemplate(template)}
                        className="w-full"
                      >
                        Select
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Fill Dynamic Fields ─────────────────────────────────── */}
          {step === 2 && selectedTemplate && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="mb-4">
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                  {selectedTemplate.name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Fill in treatment details before reading the consent with the patient.
                </p>
              </div>

              <div className="space-y-4">
                {selectedTemplate.dynamic_fields.map((field: ConsentDynamicField) => (
                  <div key={field.key}>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-0.5">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={String(consentData[field.key] ?? '')}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        rows={3}
                        className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={String(consentData[field.key] ?? '')}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      >
                        {field.options?.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        value={String(consentData[field.key] ?? '')}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!validateRequiredFields()}>
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Read Consent ────────────────────────────────────────── */}
          {step === 3 && selectedTemplate && patient && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="mb-4 text-center">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-50">
                  {selectedTemplate.name}
                </h2>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Informed Consent Form
                </p>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl mb-4 text-xs">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {patient.full_name ?? 'Unknown'}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600 dark:text-slate-400">
                  {formatConsentDate(new Date())}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-600 dark:text-slate-400">Dr. Abhinav Kumar</span>
              </div>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="h-[65vh] overflow-y-auto space-y-3 pr-1 mb-4"
              >
                {selectedTemplate.sections.map((section, index) => {
                  const isWarning = section.is_warning === true
                  return (
                    <div
                      key={index}
                      className={[
                        'p-4 rounded-xl border-l-4',
                        isWarning
                          ? 'bg-red-50 border-red-500 text-red-900 dark:bg-red-950/20 dark:border-red-500 dark:text-red-200'
                          : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300',
                      ].join(' ')}
                    >
                      <h3
                        className={[
                          'text-sm font-extrabold mb-2',
                          isWarning ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-slate-100',
                        ].join(' ')}
                      >
                        {index + 1}. {section.title}
                      </h3>
                      <p className="text-xs leading-relaxed text-justify whitespace-pre-wrap">
                        {section.content}
                      </p>
                    </div>
                  )
                })}

                {selectedTemplate.has_photo_consent && (
                  <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-3">
                      Clinical Photography Consent
                    </h3>
                    <div className="flex gap-6">
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="photo_consent"
                          checked={photoConsent}
                          onChange={() => setPhotoConsent(true)}
                          className="h-4 w-4 text-blue-600"
                        />
                        Yes
                      </label>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="photo_consent"
                          checked={!photoConsent}
                          onChange={() => setPhotoConsent(false)}
                          className="h-4 w-4 text-blue-600"
                        />
                        No
                      </label>
                    </div>
                  </div>
                )}

                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 mb-2">
                    Patient Declaration
                  </h3>
                  <p className="text-xs leading-relaxed text-justify text-slate-600 dark:text-slate-400">
                    I confirm that I am above 18 years of age (or the guardian named below is
                    legally authorised to consent on my behalf), am of sound mind, and have not been
                    coerced or unduly influenced. I have read and understood this consent form in a
                    language I comprehend, or it has been explained to me in full. I have had
                    sufficient opportunity to ask questions and all my questions have been answered
                    satisfactorily. I understand that I may withdraw consent before the procedure
                    begins without affecting my right to appropriate medical care. I voluntarily
                    consent to the procedure/treatment described in this form.
                  </p>
                </div>
              </div>

              {!hasScrolledToBottom && (
                <p className="text-xs text-amber-600 font-semibold mb-3 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Please scroll to the bottom of the consent to continue.
                </p>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  disabled={!hasScrolledToBottom}
                >
                  Proceed to Signature <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Signature Capture ───────────────────────────────────── */}
          {step === 4 && patient && selectedTemplate && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                Patient Signature
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Hand tablet to patient. Ask patient to sign in the box below using their finger or
                stylus.
              </p>

              <div className="bg-white border border-gray-300 rounded-lg overflow-hidden mb-4">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="black"
                  onEnd={handleSignatureChange}
                  canvasProps={{
                    className: 'w-full h-[200px] touch-none',
                  }}
                  backgroundColor="rgba(255,255,255,1)"
                />
              </div>

              <div className="flex justify-end mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSignature}
                  disabled={sigEmpty}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>

              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                Dr. Abhinav Kumar — Treating Dermatologist
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                MBBS MD (Dermatology)
              </p>

              <div className="bg-white border border-gray-300 rounded-lg overflow-hidden mb-4">
                <SignatureCanvas
                  ref={doctorCanvasRef}
                  penColor="black"
                  onEnd={handleDoctorSignatureChange}
                  canvasProps={{
                    className: 'w-full h-[200px] touch-none',
                  }}
                  backgroundColor="rgba(255,255,255,1)"
                />
              </div>

              <div className="flex justify-end mb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearDoctorSignature}
                  disabled={doctorSigEmpty}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
                  Staff Witness Name <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={witnessName}
                  onChange={(e) => setWitnessName(e.target.value)}
                  placeholder="Enter staff witness name"
                />
              </div>

              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                Staff Witness Signature
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Ask the witnessing staff member to sign in the box below.
              </p>

              <div className="bg-white border border-gray-300 rounded-lg overflow-hidden mb-4">
                <SignatureCanvas
                  ref={witnessCanvasRef}
                  penColor="black"
                  onEnd={handleWitnessSignatureChange}
                  canvasProps={{
                    className: 'w-full h-[200px] touch-none',
                  }}
                  backgroundColor="rgba(255,255,255,1)"
                />
              </div>

              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearWitnessSignature}
                  disabled={witnessSigEmpty}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              </div>

              {submitError && (
                <p className="text-rose-600 text-sm mb-4 font-medium bg-rose-50 dark:bg-rose-950/20 p-3 rounded-lg">
                  {submitError}
                </p>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <Button
                  variant="success"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                  disabled={
                    !witnessName.trim() ||
                    isCanvasEmpty(sigRef) ||
                    isCanvasEmpty(doctorCanvasRef) ||
                    isCanvasEmpty(witnessCanvasRef) ||
                    isSubmitting
                  }
                >
                  <ShieldCheck className="h-4 w-4 mr-1" /> Submit Consent
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 5: Confirmation ────────────────────────────────────────── */}
          {step === 5 && patient && selectedTemplate && consentId && (
            <div className="animate-in fade-in zoom-in duration-300 text-center py-6">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <Check className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300 mb-1">
                Consent Recorded Successfully
              </h2>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-6">
                {patient.full_name ?? 'Patient'} — {selectedTemplate.name}
              </p>

              <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 mb-6">
                Consent ID: {consentId.slice(0, 8)}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={handleGeneratePdf}
                  isLoading={generatingPdf}
                  disabled={generatingPdf}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Generate & Download PDF
                </Button>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4 mr-1.5" /> New Consent
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                >
                  Back to Patient
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Export with Suspense ────────────────────────────────────────────────────

export default function NewConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex items-center justify-center">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-semibold">Loading…</span>
          </div>
        </div>
      }
    >
      <NewConsentPageInner />
    </Suspense>
  )
}
