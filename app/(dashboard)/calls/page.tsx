'use client'
export const dynamic = 'force-dynamic'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CallsTable } from '@/components/calls/CallsTable'
import { CallDetailModal } from '@/components/calls/CallDetailModal'
import { CallWithPatient } from '@/types/database'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import {
  Phone,
  PhoneCall,
  PhoneMissed,
  TrendingUp,
  Download,
  RefreshCw,
  Search,
  CalendarDays,
  SlidersHorizontal,
  Wifi,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Call = CallWithPatient

type DateRangeKey = 'today' | 'week' | 'month' | 'all'
type ServiceKey = 'all' | 'hair-care' | 'skin-care' | 'general'
type StatusKey = 'all' | 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed'

interface FilterState {
  dateRange: DateRangeKey
  service: ServiceKey
  status: StatusKey
  search: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRangeStart(range: DateRangeKey): Date | null {
  const now = new Date()
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'week': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'month': {
      const d = new Date(now)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'all':
    default:
      return null
  }
}

function normaliseService(serviceType: string | null | undefined): ServiceKey {
  if (!serviceType) return 'general'
  const s = serviceType.toLowerCase()
  if (s.includes('hair')) return 'hair-care'
  if (s.includes('skin')) return 'skin-care'
  return 'general'
}

function applyFilters(calls: Call[], filters: FilterState): Call[] {
  const rangeStart = getDateRangeStart(filters.dateRange)
  const searchLower = filters.search.toLowerCase().trim()

  return calls.filter((call) => {
    // Date range
    if (rangeStart && call.call_started_at) {
      const callDate = new Date(call.call_started_at)
      if (callDate < rangeStart) return false
    }

    // Service
    if (filters.service !== 'all') {
      if (normaliseService(call.service_type) !== filters.service) return false
    }

    // Status
    if (filters.status !== 'all') {
      const statusMap: Record<StatusKey, string> = {
        all: '',
        answered: 'answered',
        missed: 'missed',
        'no-answer': 'no-answer',
        busy: 'busy',
        failed: 'failed',
      }
      if (call.call_status !== statusMap[filters.status]) return false
    }

    // Search
    if (searchLower) {
      const phoneMatch = call.patient_phone?.includes(searchLower)
      const nameMatch = call.patients?.full_name?.toLowerCase().includes(searchLower)
      const serviceMatch = call.service_type?.toLowerCase().includes(searchLower)
      if (!phoneMatch && !nameMatch && !serviceMatch) return false
    }

    return true
  })
}

function computeTodayStats(calls: Call[]) {
  const start = getDateRangeStart('today')!
  const todayCalls = calls.filter((c) => {
    if (!c.call_started_at) return false
    return new Date(c.call_started_at) >= start
  })

  const total = todayCalls.length
  const answered = todayCalls.filter((c) => c.call_status === 'answered').length
  const missed = todayCalls.filter((c) => c.call_status === 'missed').length
  const recoveryRate = missed > 0 ? Math.round(((total - missed) / total) * 100) : 100

  return { total, answered, missed, recoveryRate }
}

function exportToCSV(calls: Call[]) {
  const headers = [
    'Call SID',
    'Patient Name',
    'Patient Phone',
    'Clinic Number',
    'Service',
    'Direction',
    'Status',
    'Duration (s)',
    'Staff',
    'Started At',
  ]

  const rows = calls.map((c) => [
    c.call_sid ?? '',
    c.patients?.full_name ?? '',
    c.patient_phone ?? '',
    c.incoming_number ?? '',
    c.service_type ?? '',
    c.call_direction ?? '',
    c.call_status ?? '',
    String(c.call_duration ?? 0),
    c.staff_name ?? '',
    c.call_started_at ? new Date(c.call_started_at).toLocaleString() : '',
  ])

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `calls_export_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatPillProps {
  label: string
  value: string | number
  icon: React.ReactNode
  accent: 'blue' | 'emerald' | 'rose' | 'amber'
}

function StatPill({ label, value, icon, accent }: StatPillProps) {
  const accentMap: Record<string, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400',
    emerald:
      'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    rose: 'bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/40 text-rose-600 dark:text-rose-400',
    amber:
      'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40 text-amber-600 dark:text-amber-400',
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${accentMap[accent]} transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md`}
    >
      <span className="opacity-80">{icon}</span>
      <div className="flex flex-col">
        <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-70">
          {label}
        </span>
        <span className="text-xl font-extrabold leading-tight">{value}</span>
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded-full w-full" />
        </td>
      ))}
    </tr>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  filters: FilterState
  onChange: (next: FilterState) => void
  resultCount: number
  totalCount: number
  onExport: () => void
  onRefresh: () => void
  isRefreshing: boolean
}

const DATE_RANGE_OPTIONS: { label: string; value: DateRangeKey }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time', value: 'all' },
]

const STATUS_OPTIONS: { label: string; value: StatusKey }[] = [
  { label: 'All Status', value: 'all' },
  { label: 'Answered', value: 'answered' },
  { label: 'Missed', value: 'missed' },
  { label: 'No Answer', value: 'no-answer' },
  { label: 'Busy', value: 'busy' },
  { label: 'Failed', value: 'failed' },
]

const SERVICE_OPTIONS: { label: string; value: ServiceKey }[] = [
  { label: 'All Services', value: 'all' },
  { label: 'Hair Care', value: 'hair-care' },
  { label: 'Skin Care', value: 'skin-care' },
  { label: 'General', value: 'general' },
]

function FilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
  onExport,
  onRefresh,
  isRefreshing,
}: FilterBarProps) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value })

  const selectClass =
    'bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold cursor-pointer'

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 rounded-xl">
      {/* Row 1 — Date range tabs + action buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Date range pills */}
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1 shrink-0" />
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set('dateRange', opt.value)}
              className={`px-3 py-1.5 text-[11px] font-extrabold rounded-lg transition-all duration-200 active:scale-[0.97] ${
                filters.dateRange === opt.value
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {resultCount} / {totalCount} calls
          </span>
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-extrabold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={onExport}
            disabled={resultCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-500 border border-blue-500 rounded-lg hover:brightness-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm shadow-blue-500/20"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Row 2 — Search + Service + Status dropdowns */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search patient name or phone..."
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            className="w-full bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-4 py-2 text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold"
          />
        </div>

        {/* Service filter */}
        <div className="flex items-center gap-2 shrink-0">
          <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={filters.service}
            onChange={(e) => set('service', e.target.value as ServiceKey)}
            className={selectClass}
          >
            {SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="shrink-0">
          <select
            value={filters.status}
            onChange={(e) => set('status', e.target.value as StatusKey)}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRealtime, setIsRealtime] = useState(false)

  const [selectedCall, setSelectedCall] = useState<Call | null>(null)

  const [filters, setFilters] = useState<FilterState>({
    dateRange: 'today',
    service: 'all',
    status: 'all',
    search: '',
  })

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchCalls = useCallback(
    async (showRefreshSpinner = false) => {
      try {
        if (showRefreshSpinner) setIsRefreshing(true)
        else setLoading(true)

        setError(null)

        const { data, error: fetchErr } = await supabase
          .from('calls')
          .select('*, patients(full_name)')
          .order('call_started_at', { ascending: false })
          .limit(500)

        if (fetchErr) throw fetchErr
        setCalls(data ?? [])
      } catch (err: unknown) {
        console.error('[CallsPage] fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve call logs')
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    },
    [supabase]
  )

  // ── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchCalls()

    const channel = supabase
      .channel('calls_page_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        (payload: RealtimePostgresChangesPayload<Call>) => {
          if (payload.eventType === 'DELETE') {
            setCalls((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id))
          } else {
            // Realtime payloads don't carry embedded relations, so payload.new
            // has no patients.full_name. Refetch (silent) so the join stays
            // populated for inserted/updated rows.
            fetchCalls(true)
          }
        }
      )
      .subscribe((status: string) => {
        setIsRealtime(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchCalls])

  // ── Derived data ─────────────────────────────────────────────────────────

  const filteredCalls = applyFilters(calls, filters)
  const todayStats = computeTodayStats(calls)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-50 leading-tight">
            Call Logs
          </h1>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Inbound &amp; outbound calls routed through Airtel → Knowlarity
          </p>
        </div>

        {/* Realtime indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition-colors ${
            isRealtime
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
          }`}
        >
          <Wifi className="h-3 w-3" />
          {isRealtime ? 'Live' : 'Offline'}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-500 text-xs font-bold rounded-xl">
          ⚠ {error}
        </div>
      )}

      {/* Today stats pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatPill
          label="Today's Total"
          value={loading ? '—' : todayStats.total}
          icon={<Phone className="h-5 w-5" />}
          accent="blue"
        />
        <StatPill
          label="Answered"
          value={loading ? '—' : todayStats.answered}
          icon={<PhoneCall className="h-5 w-5" />}
          accent="emerald"
        />
        <StatPill
          label="Missed"
          value={loading ? '—' : todayStats.missed}
          icon={<PhoneMissed className="h-5 w-5" />}
          accent="rose"
        />
        <StatPill
          label="Recovery Rate"
          value={loading ? '—' : `${todayStats.recoveryRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="amber"
        />
      </div>

      {/* Main card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-50">
            All Calls
          </h2>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            Filter, search, and export your complete call history
          </p>
        </div>

        {/* Filter bar */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            resultCount={filteredCalls.length}
            totalCount={calls.length}
            onExport={() => exportToCSV(filteredCalls)}
            onRefresh={() => fetchCalls(true)}
            isRefreshing={isRefreshing}
          />
        </div>

        {/* Table content */}
        <div className="px-6 py-4">
          {loading ? (
            /* Skeleton loading state */
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 font-extrabold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      {['Type', 'Patient', 'Airtel Inbound', 'Service', 'Started At', 'Duration', 'Status', 'Recording', 'Actions'].map(
                        (h) => (
                          <th key={h} className="px-6 py-3.5">
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <CallsTable calls={filteredCalls} onViewDetails={setSelectedCall} />
          )}
        </div>
      </div>

      {/* Call detail modal */}
      <CallDetailModal
        isOpen={!!selectedCall}
        onClose={() => setSelectedCall(null)}
        call={selectedCall}
      />
    </div>
  )
}
