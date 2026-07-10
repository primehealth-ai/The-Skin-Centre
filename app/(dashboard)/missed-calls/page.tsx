'use client'

export const dynamic = 'force-dynamic'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  PhoneMissed,
  Search,
  Filter,
  Send,
  CheckCircle2,
  Clock,
  TrendingUp,
  AlertCircle,
  X,
  MessageSquare,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { useMissedCalls } from '@/hooks/useMissedCalls'
import { MissedCallsTable } from '@/components/missed-calls/MissedCallsTable'
import { MissedCallWithPatient } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────
type MissedCall = MissedCallWithPatient
type MissedCallStatus = MissedCall['status']

type StatusFilter = 'all' | MissedCallStatus
type ServiceFilter = 'all' | 'hair-care' | 'skin-care' | 'general'
type DateFilter = 'today' | 'week' | 'all'

interface ToastNotification {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'whatsapp_sent', label: 'WhatsApp Sent' },
  { value: 'patient_replied', label: 'Patient Replied' },
  { value: 'recovered', label: 'Recovered' },
  { value: 'lost', label: 'Lost' },
]

const SERVICE_OPTIONS: { value: ServiceFilter; label: string }[] = [
  { value: 'all', label: 'All Services' },
  { value: 'hair-care', label: 'Hair Care' },
  { value: 'skin-care', label: 'Skin Care' },
  { value: 'general', label: 'General' },
]

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'all', label: 'All Time' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function matchesService(mc: MissedCall, serviceFilter: ServiceFilter): boolean {
  if (serviceFilter === 'all') return true
  const svcType = (mc.service_type ?? '').toLowerCase()
  if (serviceFilter === 'hair-care') return svcType.includes('hair')
  if (serviceFilter === 'skin-care') return svcType.includes('skin')
  if (serviceFilter === 'general') return !svcType.includes('hair') && !svcType.includes('skin')
  return true
}

function matchesDate(mc: MissedCall, dateFilter: DateFilter): boolean {
  if (dateFilter === 'all') return true
  const missedAt = new Date(mc.missed_at)
  const now = new Date()
  if (dateFilter === 'today') {
    return (
      missedAt.getFullYear() === now.getFullYear() &&
      missedAt.getMonth() === now.getMonth() &&
      missedAt.getDate() === now.getDate()
    )
  }
  if (dateFilter === 'week') {
    const weekAgo = new Date(now)
    weekAgo.setDate(now.getDate() - 7)
    return missedAt >= weekAgo
  }
  return true
}

function matchesSearch(mc: MissedCall, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    (mc.patients?.full_name ?? '').toLowerCase().includes(q) ||
    mc.patient_phone.includes(q)
  )
}

// ─── Toast Component ──────────────────────────────────────────────────────────
function ToastBar({
  toasts,
  onDismiss,
}: {
  toasts: ToastNotification[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-xl px-4 py-3 shadow-2xl border text-sm font-semibold backdrop-blur-xl transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700/60 text-emerald-300'
              : toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-700/60 text-rose-300'
              : 'bg-slate-900/90 border-slate-700/60 text-slate-300'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-rose-400" />}
          {toast.type === 'info' && <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-blue-400" />}
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Metric Pill ─────────────────────────────────────────────────────────────
interface MetricPillProps {
  icon: React.ReactNode
  label: string
  value: string | number
  accent: 'rose' | 'amber' | 'emerald' | 'blue'
}

function MetricPill({ icon, label, value, accent }: MetricPillProps) {
  const colors: Record<MetricPillProps['accent'], string> = {
    rose: 'bg-rose-950/50 border-rose-800/50 text-rose-400',
    amber: 'bg-amber-950/50 border-amber-800/50 text-amber-400',
    emerald: 'bg-emerald-950/50 border-emerald-800/50 text-emerald-400',
    blue: 'bg-blue-950/50 border-blue-800/50 text-blue-400',
  }
  const valueColors: Record<MetricPillProps['accent'], string> = {
    rose: 'text-rose-200',
    amber: 'text-amber-200',
    emerald: 'text-emerald-200',
    blue: 'text-blue-200',
  }
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[accent]} transition-all duration-300`}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">{label}</span>
        <span className={`text-xl font-extrabold leading-tight ${valueColors[accent]}`}>{value}</span>
      </div>
    </div>
  )
}

// ─── Select Dropdown ──────────────────────────────────────────────────────────
interface SelectDropdownProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  placeholder?: string
}

function SelectDropdown<T extends string>({
  value,
  options,
  onChange,
}: SelectDropdownProps<T>) {
  const currentLabel = options.find((o) => o.value === value)?.label ?? value

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-700/60 bg-slate-900 text-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
      {/* suppress unused warning */}
      <span className="sr-only">{currentLabel}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MissedCallsPage() {
  const { missedCalls, loading, error, updateStatus } = useMissedCalls()

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [searchQuery, setSearchQuery] = useState('')

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkSending, setIsBulkSending] = useState(false)

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([])
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addToast = useCallback(
    (type: ToastNotification['type'], message: string, durationMs = 4500) => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, type, message }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        toastTimers.current.delete(id)
      }, durationMs)
      toastTimers.current.set(id, timer)
    },
    []
  )

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id)
    if (timer) clearTimeout(timer)
    toastTimers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Clear timers on unmount
  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  // Filtered data passed to table
  const filteredCalls = useMemo(() => {
    return missedCalls.filter((mc) => {
      const matchStatus = statusFilter === 'all' || mc.status === statusFilter
      return (
        matchStatus &&
        matchesService(mc, serviceFilter) &&
        matchesDate(mc, dateFilter) &&
        matchesSearch(mc, searchQuery)
      )
    })
  }, [missedCalls, statusFilter, serviceFilter, dateFilter, searchQuery])

  // Recovery Metrics (always computed from full unfiltered dataset)
  const metrics = useMemo(() => {
    const total = missedCalls.length
    const pending = missedCalls.filter(
      (mc) =>
        mc.status === 'pending' ||
        mc.status === 'whatsapp_sent' ||
        mc.status === 'patient_replied'
    ).length
    const recovered = missedCalls.filter((mc) => mc.status === 'recovered').length
    const rate = total > 0 ? Math.round((recovered / total) * 100) : 0
    return { total, pending, recovered, rate }
  }, [missedCalls])

  // Selectable calls (only pending ones in the current filtered view)
  const selectableCalls = useMemo(
    () => filteredCalls.filter((mc) => mc.status === 'pending'),
    [filteredCalls]
  )

  const allSelected =
    selectableCalls.length > 0 &&
    selectableCalls.every((mc) => selectedIds.has(mc.id))

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableCalls.map((mc) => mc.id)))
    }
  }, [allSelected, selectableCalls])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Bulk WhatsApp send
  const handleBulkSend = useCallback(async () => {
    if (selectedIds.size === 0) return
    setIsBulkSending(true)

    const selectedCalls = missedCalls.filter(
      (mc) => selectedIds.has(mc.id) && mc.status === 'pending'
    )

    let successCount = 0
    let failCount = 0

    await Promise.allSettled(
      selectedCalls.map(async (mc) => {
        try {
          const response = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: mc.patient_phone,
              message: `Hi${mc.patients?.full_name ? ` ${mc.patients.full_name}` : ''}! You recently called The Skin Centre. We're sorry we missed you. Please reply here or call us back — we'd love to help. 🌿`,
              missedCallId: mc.id,
            }),
          })

          if (!response.ok) {
            const errJson = (await response.json().catch(() => ({}))) as { error?: string }
            throw new Error(errJson.error ?? `HTTP ${response.status}`)
          }

          await updateStatus(mc.id, 'whatsapp_sent')
          successCount++
        } catch (err) {
          console.error('WhatsApp send failed for patient record:', err)
          failCount++
        }
      })
    )

    setIsBulkSending(false)
    setSelectedIds(new Set())

    if (successCount > 0) {
      addToast('success', `✅ WhatsApp sent to ${successCount} patient${successCount > 1 ? 's' : ''}.`)
    }
    if (failCount > 0) {
      addToast('error', `❌ Failed to send to ${failCount} patient${failCount > 1 ? 's' : ''}. Check logs.`)
    }
  }, [selectedIds, missedCalls, updateStatus, addToast])

  // Wrap updateStatus to show toast
  const handleUpdateStatus = useCallback(
    async (id: string, status: MissedCallStatus, notes?: string) => {
      try {
        await updateStatus(id, status, notes)
        const label =
          status === 'recovered'
            ? 'marked as Recovered ✅'
            : status === 'lost'
            ? 'marked as Lost'
            : `updated to ${status}`
        addToast('success', `Call ${label}.`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Status update failed'
        addToast('error', msg)
        throw err
      }
    },
    [updateStatus, addToast]
  )

  const clearFilters = useCallback(() => {
    setStatusFilter('all')
    setServiceFilter('all')
    setDateFilter('today')
    setSearchQuery('')
  }, [])

  const hasActiveFilters =
    statusFilter !== 'all' ||
    serviceFilter !== 'all' ||
    dateFilter !== 'today' ||
    searchQuery.trim() !== ''

  return (
    <>
      {/* Toast notifications */}
      <ToastBar toasts={toasts} onDismiss={dismissToast} />

      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-screen-2xl mx-auto px-6 py-8 space-y-6">

          {/* ── Page Header ─────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 bg-rose-900/30 border border-rose-800/40 rounded-xl">
                  <PhoneMissed className="h-5 w-5 text-rose-400" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">
                  Missed Call Recovery
                </h1>
              </div>
              <p className="text-sm text-slate-500 font-semibold ml-14">
                Real-time missed call workbench · auto-updates via Supabase Realtime
              </p>
            </div>

            {loading && (
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            )}
          </div>

          {/* ── Error Banner ─────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-rose-300 text-sm font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Recovery Metrics Banner ──────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricPill
              icon={<PhoneMissed className="h-5 w-5" />}
              label="Total Missed"
              value={metrics.total}
              accent="rose"
            />
            <MetricPill
              icon={<Clock className="h-5 w-5" />}
              label="Pending Recovery"
              value={metrics.pending}
              accent="amber"
            />
            <MetricPill
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Recovered"
              value={metrics.recovered}
              accent="emerald"
            />
            <MetricPill
              icon={<TrendingUp className="h-5 w-5" />}
              label="Recovery Rate"
              value={`${metrics.rate}%`}
              accent="blue"
            />
          </div>

          {/* ── Control Bar ──────────────────────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">

            {/* Row 1: Search + Dropdowns */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by name or phone…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700/60 rounded-lg text-xs font-semibold text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                <SelectDropdown<StatusFilter>
                  value={statusFilter}
                  options={STATUS_OPTIONS}
                  onChange={setStatusFilter}
                />
              </div>

              {/* Service filter */}
              <SelectDropdown<ServiceFilter>
                value={serviceFilter}
                options={SERVICE_OPTIONS}
                onChange={setServiceFilter}
              />

              {/* Date filter */}
              <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900 overflow-hidden">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateFilter(opt.value)}
                    className={`px-3 py-2 text-xs font-bold transition-all duration-200 ${
                      dateFilter === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-400 transition-colors px-2 py-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>

            {/* Row 2: Results summary + Bulk actions */}
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
              <div className="text-xs font-bold text-slate-500">
                Showing{' '}
                <span className="text-slate-300 font-extrabold">{filteredCalls.length}</span>{' '}
                of{' '}
                <span className="text-slate-300 font-extrabold">{missedCalls.length}</span>{' '}
                records
                {selectedIds.size > 0 && (
                  <span className="ml-2 text-blue-400">
                    · {selectedIds.size} selected
                  </span>
                )}
              </div>

              {/* Bulk action: select all + send */}
              <div className="flex items-center gap-3">
                {selectableCalls.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer group select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-600/50 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">
                      Select all pending ({selectableCalls.length})
                    </span>
                  </label>
                )}

                <button
                  onClick={handleBulkSend}
                  disabled={selectedIds.size === 0 || isBulkSending}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-extrabold transition-all duration-200 active:scale-[0.98] ${
                    selectedIds.size > 0 && !isBulkSending
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-900/40 hover:-translate-y-0.5'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {isBulkSending ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Send WhatsApp to All Selected
                      {selectedIds.size > 0 && (
                        <span className="ml-1 bg-white/20 rounded-full px-1.5 py-0.5 text-[10px]">
                          {selectedIds.size}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ── Table ────────────────────────────────────────────────────── */}
          {loading && missedCalls.length === 0 ? (
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-16 flex flex-col items-center justify-center gap-4">
              <RefreshCw className="h-8 w-8 text-slate-600 animate-spin" />
              <p className="text-sm font-bold text-slate-500">Loading missed calls…</p>
            </div>
          ) : (
            <div className="relative">
              {/* Realtime indicator dot */}
              <div className="absolute -top-3 right-4 flex items-center gap-1.5 z-10">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-500">
                  Live
                </span>
              </div>

              <MissedCallsTable
                missedCalls={filteredCalls}
                onUpdateStatus={handleUpdateStatus}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
