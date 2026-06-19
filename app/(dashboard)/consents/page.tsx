'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  FileText,
  Download,
  ShieldCheck,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'
import { ConsentForm } from '@/components/consents/ConsentForm'

// ─── Types ────────────────────────────────────────────────────────────────────

type PatientConsent = Database['public']['Tables']['patient_consents']['Row']
type Patient = Database['public']['Tables']['patients']['Row']

interface ConsentWithPatient extends PatientConsent {
  patient: Pick<Patient, 'id' | 'full_name' | 'phone'> | null
}

type Tab = 'list' | 'new'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatIST(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 animate-pulse">
      <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-2.5 w-24 rounded bg-slate-100 dark:bg-slate-700" />
      </div>
      <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
      <div className="h-8 w-24 rounded-lg bg-slate-200 dark:bg-slate-800" />
    </div>
  )
}

// ─── Consent Row Card ─────────────────────────────────────────────────────────

function ConsentRow({ consent }: { consent: ConsentWithPatient }) {
  const patientName = consent.patient?.full_name ?? 'Unknown Patient'
  const patientPhone = consent.patient?.phone ?? '—'
  const isVerified = consent.verified_via_otp
  const signedAt = formatIST(consent.signed_at ?? consent.created_at)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    if (downloading) return
    try {
      setDownloading(true)
      const res = await fetch(`/api/consents/${consent.id}/pdf-url`)
      const data = (await res.json()) as { url?: string; error?: string }
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        alert(data.error || 'Failed to get signed PDF URL')
      }
    } catch (err) {
      console.error(err)
      alert('Error fetching PDF URL')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="group relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-5 py-4 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 overflow-hidden">
      {/* Gradient border accent on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-600/5 to-blue-400/5 border border-blue-500/20" />

      {/* Icon */}
      <div className="shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-sm">
        <FileText className="h-5 w-5 text-white" />
      </div>

      {/* Patient + Treatment */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">
          {patientName}
        </p>
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-0.5 truncate">
          {patientPhone} · {consent.treatment}
        </p>
      </div>

      {/* Signed date */}
      <div className="flex flex-col items-start sm:items-end shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
          Signed
        </span>
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          {signedAt}
        </span>
      </div>

      {/* OTP Verification Badge */}
      <div className="shrink-0">
        {isVerified ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 text-[11px] font-bold">
            <CheckCircle className="h-3.5 w-3.5" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 text-[11px] font-bold">
            <AlertCircle className="h-3.5 w-3.5" />
            Pending
          </span>
        )}
      </div>

      {/* Download PDF */}
      <div className="shrink-0">
        {consent.pdf_url ? (
          <button
            type="button"
            onClick={() => { void handleDownload() }}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-bold shadow-sm transition-all duration-200 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download PDF
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-semibold cursor-not-allowed select-none">
            <Download className="h-3.5 w-3.5" />
            No PDF
          </span>
        )}
      </div>
    </div>
  )
}

// ─── All Consents Tab ─────────────────────────────────────────────────────────

function AllConsentsTab() {
  const [consents, setConsents] = useState<ConsentWithPatient[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabaseRef = useRef(createClient())

  const fetchConsents = useCallback(async () => {
    try {
      setError(null)
      const { data, error: fetchError } = await supabaseRef.current
        .from('patient_consents')
        .select(
          `
          *,
          patient:patients ( id, full_name, phone )
        `
        )
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setConsents((data as ConsentWithPatient[]) ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load consents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConsents()

    // Capture ref value before the async closure to avoid stale ref warning
    const supabase = supabaseRef.current

    // Supabase Realtime: listen for new consent inserts
    const channel = supabase
      .channel('patient_consents_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'patient_consents' },
        () => {
          // Re-fetch to get the joined patient data
          void fetchConsents()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchConsents])

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl overflow-hidden"
          >
            <SkeletonRow />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center mb-4">
          <AlertCircle className="h-7 w-7 text-rose-500" />
        </div>
        <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
          Could not load consents
        </p>
        <p className="text-xs font-semibold text-slate-400 mb-5 max-w-xs">{error}</p>
        <button
          onClick={() => { setLoading(true); void fetchConsents() }}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-bold transition-all duration-200"
        >
          Retry
        </button>
      </div>
    )
  }

  if (consents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center shadow-lg mb-5">
          <ShieldCheck className="h-8 w-8 text-white" />
        </div>
        <p className="text-base font-extrabold text-slate-800 dark:text-slate-100 mb-1">
          No Consent Forms Yet
        </p>
        <p className="text-sm font-semibold text-slate-400 max-w-xs">
          Signed patient consents will appear here once collected. Use the{' '}
          <span className="text-blue-600 font-bold">New Consent Form</span> tab to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {consents.map((c) => (
        <ConsentRow key={c.id} consent={c} />
      ))}
    </div>
  )
}

// ─── New Consent Tab ──────────────────────────────────────────────────────────

function NewConsentTab({ onSuccess }: { onSuccess: () => void }) {
  return <ConsentForm onSuccess={onSuccess} />
}

// ─── Tab Navigation ───────────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  count?: number
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98]',
        active
          ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60',
      ].join(' ')}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className={[
            'ml-0.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-extrabold',
            active
              ? 'bg-white/20 text-white'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Inner Page (uses useSearchParams) ───────────────────────────────────────

function ConsentsPageInner() {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) ?? 'list'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleNewConsentSuccess = useCallback(() => {
    setActiveTab('list')
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-md shadow-blue-500/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </span>
              Patient Consents
            </h1>
            <p className="text-sm font-semibold text-slate-400 mt-1 ml-[52px]">
              Digitally signed, OTP-verified treatment consent records
            </p>
          </div>

          {/* Quick action button */}
          {activeTab === 'list' && (
            <button
              onClick={() => setActiveTab('new')}
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98] text-white text-sm font-bold shadow-sm shadow-blue-500/20 transition-all duration-300"
            >
              <Plus className="h-4 w-4" />
              New Consent
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-2 p-1 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl w-fit shadow-sm">
          <TabButton
            active={activeTab === 'list'}
            onClick={() => setActiveTab('list')}
            icon={<FileText className="h-4 w-4" />}
            label="All Consents"
          />
          <TabButton
            active={activeTab === 'new'}
            onClick={() => setActiveTab('new')}
            icon={<Plus className="h-4 w-4" />}
            label="New Consent Form"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="transition-all duration-200">
        {activeTab === 'list' && <AllConsentsTab key={refreshKey} />}
        {activeTab === 'new' && (
          <NewConsentTab onSuccess={handleNewConsentSuccess} />
        )}
      </div>
    </div>
  )
}

// ─── Default Export with Suspense boundary ────────────────────────────────────

export default function ConsentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 flex flex-col gap-4 animate-pulse">
          <div className="h-10 w-64 rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-12 w-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800" />
          <div className="flex flex-col gap-3 mt-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800"
              />
            ))}
          </div>
        </div>
      }
    >
      <ConsentsPageInner />
    </Suspense>
  )
}
