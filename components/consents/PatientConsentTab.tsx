'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Download, AlertCircle, CheckCircle, Ban } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { PatientConsent, PatientConsentStatus } from '@/lib/consent/types'

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

function statusBadge(status: PatientConsentStatus) {
  switch (status) {
    case 'signed':
      return (
        <Badge variant="warning" className="text-[10px]">
          Signed
        </Badge>
      )
    case 'pdf_generated':
      return (
        <Badge variant="success" className="text-[10px]">
          <CheckCircle className="h-3 w-3 mr-1" /> PDF Ready
        </Badge>
      )
    case 'void':
      return (
        <Badge variant="danger" className="text-[10px]">
          <Ban className="h-3 w-3 mr-1" /> Void
        </Badge>
      )
    default:
      return <Badge className="text-[10px]">{status}</Badge>
  }
}

interface PatientConsentTabProps {
  consents: PatientConsent[]
  patientId: string
}

export function PatientConsentTab({ consents, patientId }: PatientConsentTabProps) {
  const router = useRouter()
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleViewPdf = async (consentId: string) => {
    setPdfLoadingId(consentId)
    setError(null)
    try {
      const res = await fetch('/api/consent/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_id: consentId }),
      })
      const json = (await res.json()) as { pdf_url?: string; error?: string }
      if (!res.ok) throw new Error(json.error || 'Failed to get PDF')
      if (json.pdf_url) window.open(json.pdf_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get PDF')
    } finally {
      setPdfLoadingId(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Consents
        </h2>
        <Button
          size="sm"
          onClick={() => router.push(`/dashboard/consent/new?patient_id=${patientId}`)}
        >
          <Plus className="h-4 w-4 mr-1" /> New Consent
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {consents.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/30">
          <FileText className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            No consent records for this patient yet.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => router.push(`/dashboard/consent/new?patient_id=${patientId}`)}
          >
            <Plus className="h-4 w-4 mr-1" /> Create First Consent
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {consents.map((consent) => (
            <div
              key={consent.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {consent.treatment}
                  </p>
                  {statusBadge(consent.status)}
                </div>
                <p className="text-xs text-slate-500 mt-1">{formatIST(consent.signed_at)}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                isLoading={pdfLoadingId === consent.id}
                disabled={pdfLoadingId === consent.id}
                onClick={() => void handleViewPdf(consent.id)}
              >
                {pdfLoadingId !== consent.id && <Download className="h-3.5 w-3.5 mr-1" />}
                View PDF
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
