'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { SignatureCanvas } from './SignatureCanvas'
import {
  ShieldCheck,
  FileText,
  Send,
  Check,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  User,
  Stethoscope,
  Zap,
  Droplets,
  Layers,
  ClipboardList,
  Pen,
  Lock,
  CheckSquare,
  Square,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { Database } from '@/types/database'

// ─── Types ──────────────────────────────────────────────────────────────────

type Patient = Database['public']['Tables']['patients']['Row']

interface TreatmentConfig {
  consent: string
  risks: string[]
  icon: React.ReactNode
  color: string
}

interface ConsentFormProps {
  patients: Patient[]
  initialPatientId?: string
  onSubmit: (payload: {
    patientId: string
    treatment: string
    consentText: string
    otpCode: string
    signatureDataUrl: string
    witnessSignatureDataUrl?: string
    checkedRisks: string[]
  }) => Promise<void>
}

// ─── Treatment Data ──────────────────────────────────────────────────────────

const TREATMENT_DATA: Record<string, TreatmentConfig> = {
  'Chemical Peel': {
    consent:
      'I, {{patient_name}}, authorize Dr. Abhinav Kumar and staff at The Skin Centre to perform a Chemical Peel on {{date}}. I understand that a chemical solution is applied to the skin causing controlled exfoliation. I have been informed of all risks listed below and I provide my informed consent freely and voluntarily. For queries, contact: {{clinic_phone}}.',
    risks: [
      'Temporary redness and irritation',
      'Skin peeling/flaking for 5-7 days',
      'Sun sensitivity requiring strict SPF use for 2+ weeks',
      'Temporary skin darkening (hyperpigmentation)',
      'Risk of scarring in rare cases',
      'Allergic reaction possibility',
    ],
    icon: <Droplets className="h-4 w-4" />,
    color: 'amber',
  },
  'Laser Therapy': {
    consent:
      'I, {{patient_name}}, authorize Laser Treatment at The Skin Centre on {{date}}. I understand laser energy targets specific structures producing controlled heating. Multiple sessions may be required. I have reviewed all risks with the treating physician. Contact: {{clinic_phone}}.',
    risks: [
      'Temporary swelling and redness',
      'Blistering in rare cases',
      'Changes in skin pigmentation',
      'Sun sensitivity post-treatment',
      'Risk of scarring',
      'Eye protection is mandatory during procedure',
    ],
    icon: <Zap className="h-4 w-4" />,
    color: 'violet',
  },
  Botox: {
    consent:
      'I, {{patient_name}}, authorize Botox Cosmetic injections at The Skin Centre on {{date}}. I understand that botulinum toxin temporarily relaxes muscle contractions. Effects last 3-6 months. I have disclosed all medications, allergies, and pre-existing conditions. Contact: {{clinic_phone}}.',
    risks: [
      'Brief pain at injection site',
      'Temporary swelling or bruising',
      'Possible eyelid/brow droop (1-3% incidence)',
      'Headache post-treatment',
      'Asymmetric results possible',
      'Not suitable during pregnancy',
    ],
    icon: <Sparkles className="h-4 w-4" />,
    color: 'rose',
  },
  'PRP Hair Treatment': {
    consent:
      'I, {{patient_name}}, authorize PRP (Platelet-Rich Plasma) Hair Treatment at The Skin Centre on {{date}}. Blood is drawn, processed, and injected into the scalp to stimulate hair growth. I understand results vary and multiple sessions may be required. Contact: {{clinic_phone}}.',
    risks: [
      'Scalp soreness for 1-3 days',
      'Temporary swelling at injection sites',
      'Minor bruising',
      'No guaranteed results',
      'Multiple sessions typically required',
      'Infection risk (minimized with sterile technique)',
    ],
    icon: <Layers className="h-4 w-4" />,
    color: 'emerald',
  },
  Microneedling: {
    consent:
      'I, {{patient_name}}, authorize Microneedling treatment at The Skin Centre on {{date}}. Fine needles create micro-channels to stimulate collagen production and skin renewal. I commit to following all aftercare instructions provided by the physician. Contact: {{clinic_phone}}.',
    risks: [
      'Redness and mild swelling for 24-48 hours',
      'Skin sensitivity post-treatment',
      'Risk of infection if aftercare not followed',
      'Temporary bruising',
      'Peeling in some cases',
      'Avoid sun exposure for 1 week',
    ],
    icon: <Stethoscope className="h-4 w-4" />,
    color: 'cyan',
  },
  'General Treatment': {
    consent:
      'I, {{patient_name}}, authorize general dermatological treatment and consultation at The Skin Centre on {{date}}. I understand that all medical therapies have specific indications, benefits, and potential side effects, which have been fully explained to me. Contact: {{clinic_phone}}.',
    risks: [
      'Treatment-specific side effects as explained by physician',
      'Possible allergic reactions',
      'Need to follow all aftercare instructions',
      'Multiple visits may be required',
    ],
    icon: <ClipboardList className="h-4 w-4" />,
    color: 'blue',
  },
}

const TREATMENT_KEYS = Object.keys(TREATMENT_DATA) as (keyof typeof TREATMENT_DATA)[]
const CLINIC_PHONE = '+91 98765 43210'

// ─── Step Config ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Patient & Treatment', icon: User },
  { id: 2, label: 'Review & Risks', icon: AlertTriangle },
  { id: 3, label: 'OTP Verify', icon: Lock },
  { id: 4, label: 'Sign & Submit', icon: Pen },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function injectVars(
  text: string,
  patientName: string,
  treatment: string,
  date: string,
  clinicPhone: string
): string {
  return text
    .replace(/\{\{patient_name\}\}/g, patientName || 'Patient')
    .replace(/\{\{treatment\}\}/g, treatment)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{clinic_phone\}\}/g, clinicPhone)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function StepProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const Icon = step.icon
        const isCompleted = currentStep > step.id
        const isActive = currentStep === step.id
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step bubble */}
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
                  ${isActive ? 'text-blue-600 dark:text-blue-400' : isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
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

export function ConsentForm({ patients, initialPatientId = '', onSubmit }: ConsentFormProps) {
  // Step control
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Step 1 state
  const [patientId, setPatientId] = useState(initialPatientId)
  const [treatment, setTreatment] = useState<string>('General Treatment')

  // Step 2 state
  const [consentText, setConsentText] = useState<string>('')
  const [checkedRisks, setCheckedRisks] = useState<Set<string>>(new Set())
  const [isTextLocked, setIsTextLocked] = useState(false)

  // Step 3 state
  const [isOtpSent, setIsOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [isOtpVerified, setIsOtpVerified] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // Step 4 state
  const [patientSignatureUrl, setPatientSignatureUrl] = useState('')
  const [witnessSignatureUrl, setWitnessSignatureUrl] = useState('')

  // Global state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const today = new Date().toISOString()
  const selectedPatient = patients.find((p) => p.id === patientId)
  const currentTreatmentData = TREATMENT_DATA[treatment] ?? TREATMENT_DATA['General Treatment']
  const allRisksChecked =
    checkedRisks.size === currentTreatmentData.risks.length

  // Inject consent text whenever patient/treatment changes (only if not locked)
  useEffect(() => {
    if (isTextLocked) return
    const raw = currentTreatmentData.consent
    const injected = injectVars(
      raw,
      selectedPatient?.full_name ?? '{{patient_name}}',
      treatment,
      formatDate(today),
      CLINIC_PHONE
    )
    setConsentText(injected)
    setCheckedRisks(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatment, patientId, isTextLocked])

  // Resend OTP cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((prev) => prev - 1), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTreatmentChange = (val: string) => {
    setTreatment(val)
    setIsTextLocked(false)
    setCheckedRisks(new Set())
  }

  const handleRiskToggle = (risk: string) => {
    setCheckedRisks((prev) => {
      const next = new Set(prev)
      if (next.has(risk)) {
        next.delete(risk)
      } else {
        next.add(risk)
      }
      return next
    })
  }

  const handleSendOtp = async () => {
    if (!selectedPatient) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/consent/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedPatient.phone,
          patientId: selectedPatient.id,
          treatment,
        }),
      })
      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? 'Failed to dispatch OTP')
      }
      setIsOtpSent(true)
      setResendCooldown(60)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while sending OTP')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!selectedPatient || !otpCode) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/consent/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: selectedPatient.phone,
          code: otpCode,
          patientId: selectedPatient.id,
        }),
      })
      if (!res.ok) {
        const errData = await res.json() as { error?: string }
        throw new Error(errData.error ?? 'Invalid OTP Code')
      }
      setIsOtpVerified(true)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!patientId || !isOtpVerified || !patientSignatureUrl) return
    try {
      setLoading(true)
      setError(null)
      await onSubmit({
        patientId,
        treatment,
        consentText,
        otpCode,
        signatureDataUrl: patientSignatureUrl,
        witnessSignatureDataUrl: witnessSignatureUrl || undefined,
        checkedRisks: Array.from(checkedRisks),
      })
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to log final patient consent')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = useCallback(() => {
    setStep(1)
    setPatientId('')
    setTreatment('General Treatment')
    setConsentText('')
    setCheckedRisks(new Set())
    setIsTextLocked(false)
    setIsOtpSent(false)
    setOtpCode('')
    setIsOtpVerified(false)
    setResendCooldown(0)
    setPatientSignatureUrl('')
    setWitnessSignatureUrl('')
    setError(null)
    setSuccess(false)
  }, [])

  // ── Success Screen ───────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 p-10 bg-emerald-50/80 dark:bg-emerald-950/20 backdrop-blur-xl border border-emerald-200/60 dark:border-emerald-900/30 rounded-2xl text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <ShieldCheck className="h-9 w-9 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300">
            Consent Obtained Successfully!
          </h3>
          <p className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80 max-w-xs">
            Patient OTP verification is complete, signature registered, and a legal digital PDF has been generated and uploaded to clinic storage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center text-xs">
          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg">
            {selectedPatient?.full_name ?? 'Patient'}
          </span>
          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg">
            {treatment}
          </span>
          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold px-3 py-1.5 rounded-lg">
            {formatDate(today)}
          </span>
        </div>
        <Button onClick={handleReset} variant="success" size="sm" className="font-bold px-6">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Create Another Consent
        </Button>
      </div>
    )
  }

  // ── Main Form ────────────────────────────────────────────────────────────────

  const canProceedStep1 = Boolean(patientId && treatment)
  const canProceedStep2 = canProceedStep1 && allRisksChecked
  const canProceedStep3 = canProceedStep2 && isOtpVerified
  const canSubmitStep4 = canProceedStep3 && Boolean(patientSignatureUrl)

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Glass Card wrapper */}
      <div className="backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm p-6 md:p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <FileText className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              Dynamic Consent Constructor
            </h2>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              The Skin Centre — Legal Digital Consent
            </p>
          </div>
        </div>

        {/* Step Progress Bar */}
        <StepProgressBar currentStep={step} />

        {/* ── Step 1: Patient & Treatment ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                Select Patient
              </label>
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
              >
                <option value="">Choose Patient...</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? 'Unknown'} ({p.phone})
                  </option>
                ))}
              </select>
              {selectedPatient && (
                <div className="flex items-center gap-2 mt-1 text-[10px] font-semibold text-slate-500">
                  <User className="h-3 w-3" />
                  <span>
                    {selectedPatient.gender ?? '—'} •{' '}
                    {selectedPatient.date_of_birth
                      ? `DOB: ${selectedPatient.date_of_birth}`
                      : 'DOB not recorded'}
                  </span>
                </div>
              )}
            </div>

            {/* Treatment selector — card grid */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                Procedure / Treatment
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {TREATMENT_KEYS.map((t) => {
                  const cfg = TREATMENT_DATA[t]
                  const isSelected = treatment === t
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTreatmentChange(t)}
                      className={`
                        relative flex flex-col items-start gap-1.5 p-3.5 rounded-xl border-2 text-left transition-all duration-200 active:scale-[0.97]
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md shadow-blue-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700 hover:-translate-y-0.5 hover:shadow-sm'
                        }
                      `}
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isSelected
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {cfg.icon}
                      </div>
                      <span
                        className={`text-[11px] font-bold leading-tight ${
                          isSelected
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {t}
                      </span>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={() => { setError(null); setStep(2) }}
                disabled={!canProceedStep1}
                className="font-bold px-6 gap-1.5"
              >
                Next: Review & Risks
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review & Risks ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Consent text editor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                  Consent Text (Editable)
                </label>
                <div className="flex items-center gap-2">
                  {isTextLocked && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Locked
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsTextLocked((prev) => !prev)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-colors ${
                      isTextLocked
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isTextLocked ? 'Unlock' : 'Lock Text'}
                  </button>
                </div>
              </div>
              <textarea
                value={consentText}
                onChange={(e) => !isTextLocked && setConsentText(e.target.value)}
                readOnly={isTextLocked}
                rows={5}
                className={`w-full text-xs font-medium leading-relaxed bg-slate-50 dark:bg-slate-950/60 border rounded-xl p-4 text-slate-700 dark:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 ${
                  isTextLocked
                    ? 'border-amber-200 dark:border-amber-900/30 cursor-not-allowed opacity-80'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              />
              <p className="text-[10px] text-slate-400 font-medium">
                Variables auto-filled: <span className="font-bold text-slate-500">patient_name</span>,{' '}
                <span className="font-bold text-slate-500">treatment</span>,{' '}
                <span className="font-bold text-slate-500">date</span>,{' '}
                <span className="font-bold text-slate-500">clinic_phone</span>
              </p>
            </div>

            {/* Risk Checksheet */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">
                  Informed Risk Acknowledgement
                </label>
                <span className="text-[10px] font-bold text-slate-400">
                  {checkedRisks.size} / {currentTreatmentData.risks.length} confirmed
                </span>
              </div>

              {/* Progress bar for risks */}
              <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-emerald-500"
                  style={{
                    width: `${
                      (checkedRisks.size / currentTreatmentData.risks.length) * 100
                    }%`,
                  }}
                />
              </div>

              <div className="flex flex-col gap-2 p-4 bg-rose-50/40 dark:bg-rose-950/10 border border-rose-100/60 dark:border-rose-900/20 rounded-xl">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  Patient must acknowledge all risks to proceed
                </p>
                {currentTreatmentData.risks.map((risk) => {
                  const isChecked = checkedRisks.has(risk)
                  return (
                    <button
                      key={risk}
                      type="button"
                      onClick={() => handleRiskToggle(risk)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200 active:scale-[0.98] ${
                        isChecked
                          ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30'
                          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isChecked ? (
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold leading-snug transition-colors ${
                          isChecked
                            ? 'text-emerald-700 dark:text-emerald-400 line-through decoration-emerald-300/60'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {risk}
                      </span>
                    </button>
                  )
                })}
              </div>

              {!allRisksChecked && (
                <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Please confirm all {currentTreatmentData.risks.length} risks to continue
                </p>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setError(null); setStep(1) }}
                className="font-bold gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => { setError(null); setStep(3) }}
                disabled={!canProceedStep2}
                className="font-bold px-6 gap-1.5"
              >
                Next: OTP Verify
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: OTP Verify ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Patient phone info */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
                    {selectedPatient?.full_name ?? 'Patient'}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400">
                    {selectedPatient?.phone}
                  </p>
                </div>
              </div>
            </div>

            {/* OTP send panel */}
            {!isOtpVerified && (
              <div className="p-4 bg-blue-50/30 dark:bg-slate-950/40 rounded-xl border border-blue-100/60 dark:border-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      SMS OTP Verification
                    </span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                      {isOtpSent
                        ? resendCooldown > 0
                          ? `OTP sent. Resend in ${resendCooldown}s`
                          : 'OTP sent. You can resend now.'
                        : "Dispatches secure SMS OTP to patient's registered number."}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSendOtp}
                    isLoading={loading}
                    disabled={resendCooldown > 0}
                    className="flex-shrink-0 flex items-center gap-1.5 font-bold text-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isOtpSent ? 'Resend OTP' : 'Send OTP'}
                  </Button>
                </div>
              </div>
            )}

            {/* OTP input */}
            {isOtpSent && !isOtpVerified && (
              <div className="flex flex-col gap-3 p-4 bg-amber-50/20 dark:bg-slate-950/50 rounded-xl border border-amber-100/40 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Enter OTP Code
                </span>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit OTP"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 text-center font-bold tracking-[0.35em] text-base"
                  />
                  <Button
                    type="button"
                    onClick={handleVerifyOtp}
                    isLoading={loading}
                    disabled={otpCode.length < 4}
                    className="flex items-center gap-1.5 px-5 font-bold text-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Verify
                  </Button>
                </div>
              </div>
            )}

            {/* Verified banner */}
            {isOtpVerified && (
              <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 p-4 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-extrabold">OTP Verification Complete</p>
                  <p className="text-[10px] font-semibold opacity-80">
                    Patient identity confirmed via SMS for{' '}
                    {selectedPatient?.full_name}
                  </p>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setError(null); setStep(2) }}
                className="font-bold gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                onClick={() => { setError(null); setStep(4) }}
                disabled={!canProceedStep3}
                className="font-bold px-6 gap-1.5"
              >
                Next: Sign & Submit
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Sign & Submit ────────────────────────────────────────────── */}
        {step === 4 && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-300">

            {/* Patient Signature */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Pen className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Patient Signature{' '}
                  <span className="text-rose-500 ml-0.5">*</span>
                </label>
              </div>
              {!patientSignatureUrl ? (
                <SignatureCanvas onSave={setPatientSignatureUrl} />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3 bg-emerald-50/40 dark:bg-emerald-950/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-600" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Patient Signature Registered
                      </span>
                    </div>
                    <img
                      src={patientSignatureUrl}
                      alt="Patient Signature"
                      className="h-10 max-w-[140px] object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientSignatureUrl('')}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-600 text-left flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear & Re-sign
                  </button>
                </div>
              )}
            </div>

            {/* Doctor/Witness Signature (optional) */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  <Stethoscope className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Doctor / Witness Signature{' '}
                  <span className="text-[10px] font-medium text-slate-400 ml-1 normal-case">
                    (optional)
                  </span>
                </label>
              </div>
              {!witnessSignatureUrl ? (
                <SignatureCanvas onSave={setWitnessSignatureUrl} />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Witness Signature Registered
                      </span>
                    </div>
                    <img
                      src={witnessSignatureUrl}
                      alt="Witness Signature"
                      className="h-10 max-w-[140px] object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setWitnessSignatureUrl('')}
                    className="text-[11px] font-bold text-rose-500 hover:text-rose-600 text-left flex items-center gap-1"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear & Re-sign
                  </button>
                </div>
              )}
            </div>

            {/* Consent summary chip row */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-full mb-0.5">
                Consent Summary
              </div>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                👤 {selectedPatient?.full_name}
              </span>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                💉 {treatment}
              </span>
              <span className="text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300">
                📅 {formatDate(today)}
              </span>
              <span className="text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 px-2.5 py-1 rounded-lg text-emerald-600 dark:text-emerald-400">
                ✓ OTP Verified
              </span>
              <span className="text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 px-2.5 py-1 rounded-lg text-emerald-600 dark:text-emerald-400">
                ✓ {checkedRisks.size} Risks Acknowledged
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setError(null); setStep(3) }}
                className="font-bold gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                type="button"
                variant="success"
                isLoading={loading}
                disabled={!canSubmitStep4}
                onClick={handleSubmit}
                className="font-extrabold px-8 gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <ShieldCheck className="h-4 w-4" />
                Complete & Log Consent
              </Button>
            </div>
          </div>
        )}

        {/* Global error (steps 1-3) */}
        {error && step !== 4 && (
          <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
