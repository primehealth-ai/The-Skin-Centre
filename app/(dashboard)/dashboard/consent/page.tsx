'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText,
  Search,
  ShieldCheck,
  Download,
  AlertCircle,
  Loader2,
  Plus,
  Ban,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import type { PatientConsent, PatientConsentStatus } from '@/lib/consent/types'

const PAGE_SIZE = 20

interface ConsentListRow extends PatientConsent {
  patient: {
    id: string
    full_name: string | null
    phone: string | null
  } | null
}

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
          PDF Ready
        </Badge>
      )
    case 'void':
      return (
        <Badge variant="danger" className="text-[10px]">
          Void
        </Badge>
      )
    default:
      return <Badge className="text-[10px]">{status}</Badge>
  }
}

function getDefaultDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 7)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

export default function ConsentHistoryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [consents, setConsents] = useState<ConsentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [searchName, setSearchName] = useState('')
  const [treatmentFilter, setTreatmentFilter] = useState('')
  const [dateRange, setDateRange] = useState(getDefaultDateRange())
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [treatments, setTreatments] = useState<string[]>([])

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (data?.role === 'admin') setIsAdmin(true)
  }, [supabase])

  const loadConsents = useCallback(
    async (pageNumber = page) => {
      try {
        setLoading(true)
        setError(null)

        const fromDate = new Date(dateRange.from)
        fromDate.setHours(0, 0, 0, 0)
        const toDate = new Date(dateRange.to)
        toDate.setHours(23, 59, 59, 999)

        let query = supabase
          .from('patient_consents')
          .select(
            `
            *,
            patient:patients(id, full_name, phone)
          `,
            { count: 'exact' }
          )
          .gte('signed_at', fromDate.toISOString())
          .lte('signed_at', toDate.toISOString())

        if (searchName.trim()) {
          query = query.ilike('patient_name', `%${searchName.trim()}%`)
        }

        if (treatmentFilter) {
          query = query.eq('treatment', treatmentFilter)
        }

        const { data, count: total, error: fetchError } = await query
          .order('signed_at', { ascending: false })
          .range(pageNumber * PAGE_SIZE, pageNumber * PAGE_SIZE + PAGE_SIZE - 1)

        if (fetchError) throw fetchError

        setConsents((data as ConsentListRow[]) ?? [])
        setCount(total ?? 0)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load consents')
      } finally {
        setLoading(false)
      }
    },
    [supabase, dateRange, searchName, treatmentFilter, page]
  )

  const loadTreatments = useCallback(async () => {
    const { data } = await supabase.from('patient_consents').select('treatment')
    const treatments = (data ?? []) as { treatment: string }[]
    const unique = Array.from(new Set(treatments.map((d) => d.treatment).filter(Boolean)))
    setTreatments(unique as string[])
  }, [supabase])

  useEffect(() => {
    void loadProfile()
    void loadTreatments()
  }, [loadProfile, loadTreatments])

  useEffect(() => {
    void loadConsents(0)
  }, [loadConsents])

  useEffect(() => {
    setPage(0)
  }, [dateRange, searchName, treatmentFilter])

  const totalPages = useMemo(() => Math.ceil(count / PAGE_SIZE), [count])

  const handleViewPdf = async (consentId: string) => {
    setPdfLoadingId(consentId)
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

  const handleVoid = async (consentId: string) => {
    if (!window.confirm('Are you sure you want to void this consent? This cannot be undone.')) {
      return
    }
    setVoidingId(consentId)
    try {
      const res = await fetch('/api/consent/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent_id: consentId }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        throw new Error(json.error || 'Failed to void consent')
      }
      await loadConsents(page)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void consent')
    } finally {
      setVoidingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 shadow-md">
                <ShieldCheck className="h-5 w-5 text-white" />
              </span>
              Consent History
            </h1>
            <p className="text-xs md:text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1 ml-[52px]">
              Digitally signed treatment consent records
            </p>
          </div>
          <Button onClick={() => router.push('/dashboard/consent/new')}>
            <Plus className="h-4 w-4 mr-1.5" /> New Consent
          </Button>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto hover:text-rose-700"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Search Patient
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Patient name"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                Treatment
              </label>
              <select
                value={treatmentFilter}
                onChange={(e) => setTreatmentFilter(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 text-sm border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">All treatments</option>
                {treatments.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                From
              </label>
              <Input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                To
              </label>
              <Input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 flex items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-semibold">Loading consents…</span>
            </div>
          ) : consents.length === 0 ? (
            <div className="p-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-md">
                <FileText className="h-7 w-7 text-white" />
              </div>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                No Consent Records
              </p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                No consents match the selected filters. Try adjusting the date range or create a new
                consent.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider">
                      Treatment
                    </th>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider">
                      Staff Witness
                    </th>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 font-extrabold text-xs text-slate-500 uppercase tracking-wider text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {consents.map((consent) => (
                    <tr
                      key={consent.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {consent.patient_name ?? consent.patient?.full_name ?? 'Unknown'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {consent.patient?.phone ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-medium">
                        {consent.treatment}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {formatIST(consent.signed_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        {consent.staff_witness_name ?? '—'}
                      </td>
                      <td className="px-4 py-3">{statusBadge(consent.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleViewPdf(consent.id)}
                            isLoading={pdfLoadingId === consent.id}
                            disabled={pdfLoadingId === consent.id || voidingId === consent.id}
                          >
                            {pdfLoadingId !== consent.id && (
                              <Download className="h-3.5 w-3.5 mr-1" />
                            )}
                            View PDF
                          </Button>
                          {isAdmin && consent.status !== 'void' && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void handleVoid(consent.id)}
                              isLoading={voidingId === consent.id}
                              disabled={voidingId === consent.id || pdfLoadingId === consent.id}
                            >
                              {voidingId !== consent.id && (
                                <Ban className="h-3.5 w-3.5 mr-1" />
                              )}
                              Void
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && consents.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, count)} of {count}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = page - 1
                    setPage(next)
                    void loadConsents(next)
                  }}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const next = page + 1
                    setPage(next)
                    void loadConsents(next)
                  }}
                  disabled={page >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
