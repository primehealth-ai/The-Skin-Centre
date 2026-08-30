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
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// IST offset in ms: +05:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

// ─── Types ────────────────────────────────────────────────────────────────────

type Call = CallWithPatient

type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'all'
type ServiceKey = 'all' | 'hair-care' | 'skin-care' | 'general'
type StatusKey = 'all' | 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed'

interface FilterState {
  preset: PresetKey
  dateFrom: string | null   // 'YYYY-MM-DD' (local, IST)
  dateTo: string | null     // 'YYYY-MM-DD' (local, IST)
  service: ServiceKey
  status: StatusKey
  search: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns today's YYYY-MM-DD in IST */
function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return ist.toISOString().slice(0, 10)
}

/** Subtracts `days` from today's IST date */
function daysAgoIST(days: number): string {
  const now = new Date()
  const ist = new Date(now.getTime() + IST_OFFSET_MS - days * 86400000)
  return ist.toISOString().slice(0, 10)
}

/** Given a preset, returns { dateFrom, dateTo } or nulls for 'all' */
function presetToDates(preset: PresetKey): { dateFrom: string | null; dateTo: string | null } {
  const today = todayIST()
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today }
    case 'yesterday': {
      const y = daysAgoIST(1)
      return { dateFrom: y, dateTo: y }
    }
    case 'last7':
      return { dateFrom: daysAgoIST(6), dateTo: today }
    case 'last30':
      return { dateFrom: daysAgoIST(29), dateTo: today }
    case 'all':
    default:
      return { dateFrom: null, dateTo: null }
  }
}

function computeTodayStats(calls: Call[]) {
  const total = calls.length
  const answered = calls.filter((c) => c.call_status === 'answered').length
  const missed = calls.filter((c) => c.call_status === 'missed').length
  const recoveryRate = total > 0 ? Math.round((answered / total) * 100) : 100
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
    c.call_started_at ? new Date(c.call_started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
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
  page: number
  totalCount: number
  onExport: () => void
  onRefresh: () => void
  isRefreshing: boolean
  isLoading: boolean
}

const PRESET_OPTIONS: { label: string; value: PresetKey }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 30 Days', value: 'last30' },
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
  page,
  totalCount,
  onExport,
  onRefresh,
  isRefreshing,
  isLoading,
}: FilterBarProps) {
  // Local draft state for custom date range (only committed on [Apply])
  const [draftFrom, setDraftFrom] = useState(filters.dateFrom ?? '')
  const [draftTo, setDraftTo] = useState(filters.dateTo ?? '')

  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...filters, [key]: value })

  function selectPreset(preset: PresetKey) {
    const { dateFrom, dateTo } = presetToDates(preset)
    setDraftFrom(dateFrom ?? '')
    setDraftTo(dateTo ?? '')
    onChange({ ...filters, preset, dateFrom, dateTo })
  }

  function applyCustomRange() {
    if (!draftFrom && !draftTo) return
    onChange({ ...filters, preset: 'all', dateFrom: draftFrom || null, dateTo: draftTo || null })
  }

  const selectClass =
    'bg-white dark:bg-slate-950 text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold cursor-pointer'

  const from = page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount)
  const countLabel = totalCount === 0
    ? '0 calls'
    : `${from}–${to} of ${totalCount.toLocaleString()} calls`

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800 rounded-xl">
      {/* Row 1 — Preset pills + action buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Preset pills */}
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-slate-400 ml-2 mr-1 shrink-0" />
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectPreset(opt.value)}
              className={`px-3 py-1.5 text-[11px] font-extrabold rounded-lg transition-all duration-200 active:scale-[0.97] ${
                filters.preset === opt.value && !( filters.preset === 'all' && (filters.dateFrom || filters.dateTo) && !PRESET_OPTIONS.find(p => p.value === filters.preset))
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Count + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">
            {isLoading ? '…' : countLabel}
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
            disabled={totalCount === 0 || isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-extrabold text-white bg-gradient-to-r from-blue-600 to-blue-500 border border-blue-500 rounded-lg hover:brightness-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] shadow-sm shadow-blue-500/20"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Row 2 — Custom date range picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider whitespace-nowrap">From</span>
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => {
              setDraftFrom(e.target.value)
            }}
            className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          />
          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider whitespace-nowrap">To</span>
          <input
            type="date"
            value={draftTo}
            onChange={(e) => {
              setDraftTo(e.target.value)
            }}
            className="bg-transparent text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
          />
          <button
            onClick={applyCustomRange}
            disabled={!draftFrom && !draftTo}
            className="ml-1 px-3 py-1 text-[10px] font-extrabold text-white bg-blue-600 rounded-md hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-[0.97]"
          >
            Apply
          </button>
        </div>

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

        {/* Service + Status */}
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

// ─── Pagination Bar ───────────────────────────────────────────────────────────

interface PaginationBarProps {
  page: number
  totalCount: number
  onPage: (p: number) => void
  isLoading: boolean
}

function PaginationBar({ page, totalCount, onPage, isLoading }: PaginationBarProps) {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  if (totalPages <= 1) return null

  const from = page * PAGE_SIZE + 1
  const to = Math.min((page + 1) * PAGE_SIZE, totalCount)

  return (
    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/40">
      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase">
        Showing {from}–{to} of {totalCount.toLocaleString()} calls · Page {page + 1} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 0 || isLoading}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        {/* Page number pills — show up to 5 around current */}
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let p: number
          if (totalPages <= 7) {
            p = i
          } else if (page < 4) {
            p = i
          } else if (page > totalPages - 5) {
            p = totalPages - 7 + i
          } else {
            p = page - 3 + i
          }
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              disabled={isLoading}
              className={`w-8 h-7 text-[11px] font-bold rounded-lg transition-all active:scale-[0.97] ${
                p === page
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {p + 1}
            </button>
          )
        })}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages - 1 || isLoading}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [calls, setCalls] = useState<Call[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [todayStats, setTodayStats] = useState({ total: 0, answered: 0, missed: 0, recoveryRate: 100 })
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRealtime, setIsRealtime] = useState(false)

  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [page, setPage] = useState(0)

  const [filters, setFilters] = useState<FilterState>({
    preset: 'today',
    dateFrom: todayIST(),
    dateTo: todayIST(),
    service: 'all',
    status: 'all',
    search: '',
  })

  // ── Build query (shared for data + count) ────────────────────────────────
  // We accept `any` here because Supabase's chained query builder types are
  // not composable in a generic helper — each chain call returns a different
  // generic instantiation. Using `any` is the accepted pattern for this.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyCallFilters(q: any): any {
    // Date range — applied server-side (IST +05:30)
    if (filters.dateFrom) {
      q = q.gte('call_started_at', `${filters.dateFrom}T00:00:00+05:30`)
    }
    if (filters.dateTo) {
      q = q.lte('call_started_at', `${filters.dateTo}T23:59:59+05:30`)
    }

    // Service
    if (filters.service !== 'all') {
      const serviceMap: Record<string, string> = {
        'hair-care': 'Hair Care',
        'skin-care': 'Skin Care',
        general: 'General',
      }
      q = q.ilike('service_type', `%${serviceMap[filters.service]}%`)
    }

    // Status
    if (filters.status !== 'all') {
      q = q.eq('call_status', filters.status)
    }

    // Search by patient_phone
    if (filters.search.trim()) {
      q = q.ilike('patient_phone', `%${filters.search.trim()}%`)
    }

    return q
  }

  // ── Fetch page of calls ──────────────────────────────────────────────────

  const fetchCalls = useCallback(
    async (targetPage: number, showRefreshSpinner = false) => {
      try {
        if (showRefreshSpinner) setIsRefreshing(true)
        else setLoading(true)
        setError(null)

        const rangeFrom = targetPage * PAGE_SIZE
        const rangeTo = (targetPage + 1) * PAGE_SIZE - 1

        // Data query — server-side filtered + paginated
        const dataQuery = applyCallFilters(
          supabase.from('calls').select('*, patients(full_name)')
        )
          .order('call_started_at', { ascending: false })
          .range(rangeFrom, rangeTo)

        // Count query — exact total matching same filters
        const countQuery = applyCallFilters(
          supabase.from('calls').select('*', { count: 'exact', head: true })
        )

        const [{ data, error: dataErr }, { count, error: countErr }] = await Promise.all([
          dataQuery,
          countQuery,
        ])

        if (dataErr) throw dataErr
        if (countErr) throw countErr

        setCalls((data as Call[]) ?? [])
        setTotalCount(count ?? 0)
      } catch (err: unknown) {
        console.error('[CallsPage] fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to retrieve call logs')
      } finally {
        setLoading(false)
        setIsRefreshing(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, filters]
  )

  // ── Fetch today's stats (always fixed window, no filter influence) ────────

  const fetchTodayStats = useCallback(async () => {
    try {
      const today = todayIST()
      const { data } = await supabase
        .from('calls')
        .select('call_status')
        .gte('call_started_at', `${today}T00:00:00+05:30`)
        .lte('call_started_at', `${today}T23:59:59+05:30`)

      if (data) setTodayStats(computeTodayStats(data as Call[]))
    } catch {
      // non-critical, silently ignore
    }
  }, [supabase])

  // ── Effect: re-fetch when filters change (reset page to 0) ───────────────

  useEffect(() => {
    setPage(0)
    fetchCalls(0)
    fetchTodayStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  // ── Effect: fetch when page changes (filters stay the same) ─────────────

  useEffect(() => {
    // Don't double-fire on initial mount (filters effect handles page=0)
    if (page === 0) return
    fetchCalls(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  // ── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel('calls_page_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calls' },
        (_payload: RealtimePostgresChangesPayload<Call>) => {
          // Silent refresh on any DB change — keeps count + data in sync
          fetchCalls(page, true)
          fetchTodayStats()
        }
      )
      .subscribe((status: string) => {
        setIsRealtime(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchCalls, fetchTodayStats, page])

  // ── Page change handler ───────────────────────────────────────────────────

  function handlePage(p: number) {
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Filter change handler — always resets page ───────────────────────────

  function handleFilterChange(next: FilterState) {
    setPage(0)
    setFilters(next)
  }

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
          value={loading && page === 0 ? '—' : todayStats.total}
          icon={<Phone className="h-5 w-5" />}
          accent="blue"
        />
        <StatPill
          label="Answered"
          value={loading && page === 0 ? '—' : todayStats.answered}
          icon={<PhoneCall className="h-5 w-5" />}
          accent="emerald"
        />
        <StatPill
          label="Missed"
          value={loading && page === 0 ? '—' : todayStats.missed}
          icon={<PhoneMissed className="h-5 w-5" />}
          accent="rose"
        />
        <StatPill
          label="Recovery Rate"
          value={loading && page === 0 ? '—' : `${todayStats.recoveryRate}%`}
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
            onChange={handleFilterChange}
            page={page}
            totalCount={totalCount}
            onExport={() => exportToCSV(calls)}
            onRefresh={() => { setPage(0); fetchCalls(0, true); fetchTodayStats() }}
            isRefreshing={isRefreshing}
            isLoading={loading}
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
                    {Array.from({ length: 8 }).map((_, i) => (
                      <SkeletonRow key={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !error && calls.length === 0 ? (
            /* Loaded, no error, nothing returned */
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Phone className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                No calls found for the selected filters.
              </p>
              <button
                onClick={() => { setPage(0); fetchCalls(0, true) }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white text-xs font-extrabold transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          ) : (
            <CallsTable calls={calls} onViewDetails={setSelectedCall} />
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && (
          <PaginationBar
            page={page}
            totalCount={totalCount}
            onPage={handlePage}
            isLoading={loading || isRefreshing}
          />
        )}
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
