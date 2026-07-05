'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SignatureCanvas } from './SignatureCanvas'
import {
  ShieldCheck,
  FileText,
  Search,
  User,
  Pen,
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Loader2,
  Phone,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { formatPhoneNumber } from '@/lib/utils/formatters'
import { normalizePhone } from '@/lib/utils/phone'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Patient {
  id: string
  full_name: string | null
  phone: string
}

// ─── Default Consent Text ─────────────────────────────────────────────────────

const DEFAULT_CONSENT_TEXT =
  'I, the patient, consent to the treatment described above at The Skin Centre, Patna. I understand the procedure and associated risks.'

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Find Patient', icon: Search },
  { id: 2, label: 'Treatment & Consent', icon: FileText },
  { id: 3, label: 'Sign & Submit', icon: Pen },
]

// ─── Step Progress Bar ────────────────────────────────────────────────────────

function StepProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCompleted = currentStep > step.id
        const isActive = currentStep === step.id
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300
                  ${isCompleted
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/25'
                    : isActive
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/30 scale-110'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                  }
                `}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={`text-[10px] font-bold whitespace-nowrap transition-colors duration-200
                  ${isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : isCompleted
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                  }
                `}
              >
                {step.label}
              </span>
            </div>

            {idx < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-2 mb-5 transition-all duration-500 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    currentStep > step.id ? 'w-full bg-emerald-400' : 'w-0'
                  }`}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ConsentFormProps {
  onSuccess?: () => void
}

export function ConsentForm({ onSuccess }: ConsentFormProps = {}) {
  const supabase = createClient()

  // ── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [phoneQuery, setPhoneQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Inline Patient Creation State
  const [showCreateInline, setShowCreateInline] = useState(false)
  const [newPatientName, setNewPatientName] = useState('')
  const [newPatientPhone, setNewPatientPhone] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Step 2
  const [treatment, setTreatment] = useState('')
  const [consentText, setConsentText] = useState(DEFAULT_CONSENT_TEXT)

  // Step 3
  const [signatureDataUrl, setSignatureDataUrl] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [savedConsentId, setSavedConsentId] = useState<string | null>(null)

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const normalizedPhone = normalizePhone(phoneQuery)
    if (!normalizedPhone) {
      setSearchError('Please enter a phone number')
      return
    }

    setSearchLoading(true)
    setSearchError(null)
    setPatient(null)
    setShowCreateInline(false)

    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id, full_name, phone')
        .eq('phone', normalizedPhone)
        .limit(1)
        .maybeSingle()

      if (error) throw error

      if (!data) {
        setSearchError('No patient found with that phone number. You can register them below.')
        setShowCreateInline(true)
        setNewPatientPhone(normalizedPhone)
        setNewPatientName('')
        return
      }

      setPatient(data as Patient)
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleCreatePatientInline = async () => {
    if (!newPatientName.trim() || !newPatientPhone.trim()) {
      setSearchError('Please enter a name and phone number to create a new patient.')
      return
    }

    const normalizedPhone = normalizePhone(newPatientPhone)
    if (!normalizedPhone) {
      setSearchError('Please enter a valid Indian phone number to create a new patient.')
      return
    }

    setCreateLoading(true)
    setSearchError(null)

    try {
      const res = await fetch('/api/patients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newPatientName.trim(),
          phone: normalizedPhone,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create patient record')
      }

      setPatient(data.patient as Patient)
      setShowCreateInline(false)
      setStep(2) // Proceed automatically
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Creation failed')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!patient || !treatment.trim() || !consentText.trim() || !signatureDataUrl) return

    setSubmitLoading(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/consents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient.id,
          treatment: treatment.trim(),
          consentText: consentText.trim(),
          signatureImageBase64: signatureDataUrl,
        }),
      })

      const data = (await res.json()) as { success?: boolean; consentId?: string; error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? 'Consent submission failed')
      }

      setSavedConsentId(data.consentId ?? null)
      setSuccess(true)
      onSuccess?.()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleReset = useCallback(() => {
    setStep(1)
    setPhoneQuery('')
    setPatient(null)
    setSearchError(null)
    setTreatment('')
    setConsentText(DEFAULT_CONSENT_TEXT)
    setSignatureDataUrl('')
    setSubmitError(null)
    setSuccess(false)
    setSavedConsentId(null)
    setShowCreateInline(false)
    setNewPatientName('')
    setNewPatientPhone('')
  }, [])

  // ── Success Screen ────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 p-10 bg-emerald-50/80 dark:bg-emerald-950/20 backdrop-blur-xl border border-emerald-200/60 dark:border-emerald-900/30 rounded-2xl text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <ShieldCheck className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">
            Consent Saved Successfully!
          </h3>
          <p className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80 max-w-xs">
            Patient signature has been uploaded and the consent record has been saved securely.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center text-xs">
          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg">
            👤 {patient?.full_name ?? 'Patient'}
          </span>
          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg">
            💉 {treatment}
          </span>
          {savedConsentId && (
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono font-semibold px-3 py-1.5 rounded-lg text-[10px]">
              ID: {savedConsentId.slice(0, 8)}…
            </span>
          )}
        </div>
        <Button onClick={handleReset} variant="success" size="sm" className="font-bold px-6">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Create Another Consent
        </Button>
      </div>
    )
  }

  // ── Guard conditions ──────────────────────────────────────────────────────
  const canProceedStep1 = Boolean(patient)
  const canProceedStep2 = canProceedStep1 && Boolean(treatment.trim()) && Boolean(consentText.trim())
  const canSubmit = canProceedStep2 && Boolean(signatureDataUrl)

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm p-6 md:p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              Consent Form
            </h2>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              The Skin Centre — Digital Patient Consent
            </p>
          </div>
        </div>

        {/* Step Progress Bar */}
        <StepProgressBar currentStep={step} />

        {/* ── Step 1: Find Patient ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                Search Patient by Phone
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <Input
                    type="tel"
                    placeholder="Enter patient phone number"
                    value={phoneQuery}
                    onChange={(e) => {
                      setPhoneQuery(e.target.value)
                      setSearchError(null)
                      setPatient(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
                    className="pl-9 font-semibold"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSearch()}
                  disabled={searchLoading || !phoneQuery.trim()}
                  className="font-bold gap-1.5 px-5 shrink-0"
                >
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>

              {searchError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {searchError}
                </div>
              )}
            </div>

            {showCreateInline && !patient && (
              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col gap-3 animate-in fade-in duration-200">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Register New Patient
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Full Name</label>
                    <Input
                      type="text"
                      placeholder="e.g. Ayush Kumar"
                      value={newPatientName}
                      onChange={(e) => setNewPatientName(e.target.value)}
                      className="text-xs font-semibold py-1.5"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Phone Number</label>
                    <Input
                      type="tel"
                      placeholder="e.g. 9999999999"
                      value={newPatientPhone}
                      onChange={(e) => setNewPatientPhone(e.target.value)}
                      className="text-xs font-semibold py-1.5"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowCreateInline(false)
                      setSearchError(null)
                    }}
                    className="text-xs py-1.5 px-3 font-bold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => { void handleCreatePatientInline() }}
                    disabled={createLoading || !newPatientName.trim() || !newPatientPhone.trim()}
                    className="text-xs py-1.5 px-4 font-bold animate-in fade-in"
                  >
                    {createLoading && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                    Create &amp; Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Patient Card */}
            {patient && (
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 rounded-xl flex items-center gap-3 animate-in fade-in duration-200">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">
                    {patient.full_name ?? 'Unknown Name'}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400 truncate">
                    {formatPhoneNumber(patient.phone)}
                  </p>
                </div>
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-900/30">
                    <Check className="h-3 w-3" />
                    Found
                  </span>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="font-bold px-6 gap-1.5"
              >
                Next: Treatment & Consent
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Treatment & Consent ──────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Patient summary chip */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                {patient?.full_name ?? 'Unknown'} — {patient ? formatPhoneNumber(patient.phone) : ''}
              </span>
            </div>

            {/* Treatment */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                Treatment / Procedure <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Chemical Peel, Botox, Laser Therapy…"
                value={treatment}
                onChange={(e) => setTreatment(e.target.value)}
                className="font-semibold"
              />
            </div>

            {/* Consent Text */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                Consent Text <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={consentText}
                onChange={(e) => setConsentText(e.target.value)}
                rows={5}
                placeholder="Enter consent text…"
                className="w-full text-xs font-medium leading-relaxed bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
              />
              <p className="text-[10px] text-slate-400 font-medium">
                Editable. Prefilled with standard clinic consent language.
              </p>
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="font-bold gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="font-bold px-6 gap-1.5"
              >
                Next: Sign & Submit
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Signature & Submit ───────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Consent Summary */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-full mb-0.5">
                Consent Summary
              </div>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                👤 {patient?.full_name ?? 'Unknown'}
              </span>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                💉 {treatment}
              </span>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                📅 {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>

            {/* Consent text preview */}
            <div className="p-4 bg-blue-50/30 dark:bg-slate-950/40 border border-blue-100/60 dark:border-slate-800 rounded-xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Consent Text
              </p>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
                {consentText}
              </p>
            </div>

            {/* Signature Canvas */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Pen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Patient Signature <span className="text-rose-500 ml-0.5">*</span>
                </label>
              </div>

              {!signatureDataUrl ? (
                <SignatureCanvas onSave={setSignatureDataUrl} />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3 bg-emerald-50/40 dark:bg-emerald-950/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Signature Registered
                      </span>
                    </div>
                    <img
                      src={signatureDataUrl}
                      alt="Patient Signature"
                      className="h-10 max-w-[140px] object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignatureDataUrl('')}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-600 text-left flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Clear & Re-sign
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {submitError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setSubmitError(null); setStep(2) }}
                className="font-bold gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                variant="success"
                isLoading={submitLoading}
                disabled={!canSubmit || submitLoading}
                onClick={() => void handleSubmit()}
                className="font-extrabold px-8 gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <ShieldCheck className="h-4 w-4" />
                Save Consent
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
