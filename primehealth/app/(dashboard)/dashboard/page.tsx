'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database'
import {
  Phone, PhoneMissed, MessageSquare, CheckCircle,
  AlertTriangle, FileText, Camera, Users, Clipboard,
  ArrowRight, RefreshCw, TrendingUp, Zap, Activity,
  Clock, ChevronRight, WifiOff, Wifi,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type CallRow = Database['public']['Tables']['calls']['Row']
type MissedCallRow = Database['public']['Tables']['missed_calls']['Row']
type MessageRow = Database['public']['Tables']['whatsapp_messages']['Row']

interface DashboardStats {
  totalCalls: number
  missedCalls: number
  answeredCalls: number
  whatsappSent: number
  recovered: number
  totalPatients: number
  totalConsents: number
  hairCalls: number
  skinCalls: number
  generalCalls: number
}

interface TimelineItem {
  id: string
  type: 'call_answered' | 'call_missed' | 'whatsapp_inbound' | 'whatsapp_outbound' | 'consent_signed' | 'photo_uploaded'
  time: string
  title: string
  description: string
  timestamp: number
  phone?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return '—' }
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return formatTime(iso)
}

function getISTToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string
  value: number | string
  subtitle: string
  icon: React.ReactNode
  gradient: string
  iconBg: string
  loading?: boolean
  badge?: string
  badgeColor?: string
}

function StatCard({ title, value, subtitle, icon, gradient, iconBg, loading, badge, badgeColor }: StatCardProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 shadow-sm border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg group ${gradient}`}>
      {/* Glow blob */}
      <div className="absolute -right-8 -bottom-8 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none group-hover:scale-125 transition-transform duration-500" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${iconBg} shadow-sm`}>
            {icon}
          </div>
          {badge && (
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-16 rounded-lg bg-white/20 animate-pulse" />
            <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
          </div>
        ) : (
          <>
            <p className="text-3xl font-black text-white tracking-tight leading-none">{value}</p>
            <p className="text-xs font-bold text-white/70 mt-1.5">{title}</p>
            <p className="text-[10px] font-semibold text-white/50 mt-0.5">{subtitle}</p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Recovery Rate Gauge ───────────────────────────────────────────────────────

function RecoveryGauge({ rate }: { rate: number }) {
  const clampedRate = Math.min(100, Math.max(0, rate))
  const color = clampedRate >= 70 ? '#10b981' : clampedRate >= 40 ? '#f59e0b' : '#ef4444'
  const circumference = 2 * Math.PI * 40
  const offset = circumference - (clampedRate / 100) * circumference

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100 dark:text-slate-800" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-slate-800 dark:text-slate-100">{clampedRate}%</span>
        </div>
      </div>
      <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mt-1">Recovery Rate</p>
    </div>
  )
}

// ─── Timeline Icon & Color ─────────────────────────────────────────────────────

function TimelineIcon({ type }: { type: TimelineItem['type'] }) {
  const configs: Record<TimelineItem['type'], { icon: React.ReactNode; bg: string; ring: string }> = {
    call_answered: {
      icon: <Phone className="h-3.5 w-3.5 text-emerald-600" />,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      ring: 'ring-1 ring-emerald-100 dark:ring-emerald-900/40',
    },
    call_missed: {
      icon: <PhoneMissed className="h-3.5 w-3.5 text-rose-600" />,
      bg: 'bg-rose-50 dark:bg-rose-950/30',
      ring: 'ring-1 ring-rose-100 dark:ring-rose-900/40',
    },
    whatsapp_inbound: {
      icon: <MessageSquare className="h-3.5 w-3.5 text-sky-600" />,
      bg: 'bg-sky-50 dark:bg-sky-950/30',
      ring: 'ring-1 ring-sky-100 dark:ring-sky-900/40',
    },
    whatsapp_outbound: {
      icon: <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />,
      bg: 'bg-emerald-50/60 dark:bg-emerald-950/20',
      ring: 'ring-1 ring-emerald-100/80 dark:ring-emerald-900/30',
    },
    consent_signed: {
      icon: <FileText className="h-3.5 w-3.5 text-indigo-600" />,
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
      ring: 'ring-1 ring-indigo-100 dark:ring-indigo-900/40',
    },
    photo_uploaded: {
      icon: <Camera className="h-3.5 w-3.5 text-purple-600" />,
      bg: 'bg-purple-50 dark:bg-purple-950/30',
      ring: 'ring-1 ring-purple-100 dark:ring-purple-900/40',
    },
  }

  const { icon, bg, ring } = configs[type]
  return (
    <span className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${bg} ${ring}`}>
      {icon}
    </span>
  )
}

// ─── Skeleton Loaders ─────────────────────────────────────────────────────────

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 animate-pulse">
          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2.5 w-48 rounded bg-slate-50 dark:bg-slate-800/60" />
          </div>
          <div className="h-2.5 w-12 rounded bg-slate-100 dark:bg-slate-800 shrink-0" />
        </div>
      ))}
    </div>
  )
}

// ─── Main Dashboard Page ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [stats, setStats] = useState<DashboardStats>({
    totalCalls: 0, missedCalls: 0, answeredCalls: 0, whatsappSent: 0,
    recovered: 0, totalPatients: 0, totalConsents: 0,
    hairCalls: 0, skinCalls: 0, generalCalls: 0,
  })
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [pendingMissed, setPendingMissed] = useState<MissedCallRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // ── Fetch all data ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true)
    setError(null)

    try {
      const today = getISTToday()

      const [
        callsRes,
        missedRes,
        whatsappSentRes,
        recoveredRes,
        patientsRes,
        consentsCountRes,
        callsTodayRes,
        recentCallsRes,
        pendingMissedRes,
        whatsappMsgsRes,
        consentsRes,
        photosRes,
      ] = await Promise.all([
        supabase.from('calls').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('created_at', today),
        supabase.from('missed_calls').select('id', { count: 'exact', head: true }).in('status', ['whatsapp_sent', 'patient_replied', 'recovered']).gte('created_at', today),
        supabase.from('missed_calls').select('id', { count: 'exact', head: true }).eq('recovered', true).gte('created_at', today),
        supabase.from('patients').select('id', { count: 'exact', head: true }),
        supabase.from('patient_consents').select('id', { count: 'exact', head: true }),
        supabase.from('calls').select('service_type, call_status').gte('created_at', today),
        supabase.from('calls').select('*').order('call_started_at', { ascending: false }).limit(6),
        supabase.from('missed_calls').select('*').eq('status', 'pending').order('missed_at', { ascending: false }).limit(5),
        supabase.from('whatsapp_messages').select('*').order('sent_at', { ascending: false }).limit(5),
        supabase.from('patient_consents').select('id, treatment, created_at, otp_verified_at, patients(full_name)').order('created_at', { ascending: false }).limit(4),
        supabase.from('patient_photos').select('id, treatment, created_at, taken_at, patients(full_name)').order('created_at', { ascending: false }).limit(4),
      ])

      // Compute service breakdown
      let hairCalls = 0, skinCalls = 0, generalCalls = 0, answeredCalls = 0
      callsTodayRes.data?.forEach((c: { call_status: string | null; service_type: string | null }) => {
        if (c.call_status === 'answered') answeredCalls++
        if (c.service_type === 'Hair Care') hairCalls++
        else if (c.service_type === 'Skin Care') skinCalls++
        else generalCalls++
      })

      setStats({
        totalCalls: callsRes.count ?? 0,
        missedCalls: missedRes.count ?? 0,
        answeredCalls,
        whatsappSent: whatsappSentRes.count ?? 0,
        recovered: recoveredRes.count ?? 0,
        totalPatients: patientsRes.count ?? 0,
        totalConsents: consentsCountRes.count ?? 0,
        hairCalls, skinCalls, generalCalls,
      })

      setPendingMissed(pendingMissedRes.data ?? [])

      // Build unified timeline
      const items: TimelineItem[] = []

      recentCallsRes.data?.forEach((call: CallRow) => {
        items.push({
          id: `call_${call.id}`,
          type: call.call_status === 'answered' ? 'call_answered' : 'call_missed',
          time: formatRelative(call.call_started_at),
          title: call.call_status === 'answered' ? 'Call Answered' : 'Missed Call',
          description: `${call.patient_name || call.patient_phone} · ${call.service_type || 'General'} line`,
          timestamp: new Date(call.call_started_at).getTime(),
          phone: call.patient_phone,
        })
      })

      whatsappMsgsRes.data?.forEach((msg: MessageRow) => {
        const t = msg.sent_at ?? msg.created_at ?? new Date().toISOString()
        items.push({
          id: `msg_${msg.id}`,
          type: msg.direction === 'inbound' ? 'whatsapp_inbound' : 'whatsapp_outbound',
          time: formatRelative(t),
          title: msg.direction === 'inbound' ? 'Patient Replied' : 'Recovery Sent',
          description: `"${(msg.message_text ?? '').slice(0, 55)}${(msg.message_text ?? '').length > 55 ? '…' : ''}"`,
          timestamp: new Date(t).getTime(),
          phone: msg.patient_phone,
        })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      consentsRes.data?.forEach((c: any) => {
        const t = c.otp_verified_at ?? c.created_at ?? new Date().toISOString()
        items.push({
          id: `consent_${c.id}`,
          type: 'consent_signed',
          time: formatRelative(t),
          title: 'Consent Signed',
          description: `${c.patients?.full_name ?? 'Patient'} · ${c.treatment}`,
          timestamp: new Date(t).getTime(),
        })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      photosRes.data?.forEach((p: any) => {
        const t = p.taken_at ?? p.created_at ?? new Date().toISOString()
        items.push({
          id: `photo_${p.id}`,
          type: 'photo_uploaded',
          time: formatRelative(t),
          title: 'Photo Uploaded',
          description: `${p.patients?.full_name ?? 'Patient'} · ${p.treatment}`,
          timestamp: new Date(t).getTime(),
        })
      })

      setTimeline(items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10))
      setLastUpdated(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  // ── Initial fetch ───────────────────────────────────────────────────────────

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // ── Supabase Realtime subscriptions ────────────────────────────────────────

  useEffect(() => {
    // Listen to ALL relevant tables and refetch on any change
    const channel = supabase
      .channel('dashboard_realtime_v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        void fetchAll()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missed_calls' }, () => {
        void fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' }, () => {
        void fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patient_consents' }, () => {
        void fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'patient_photos' }, () => {
        void fetchAll()
      })
      .subscribe((status: string) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, fetchAll])

  // ── Computed values ─────────────────────────────────────────────────────────

  const recoveryRate = stats.missedCalls > 0
    ? Math.round((stats.recovered / stats.missedCalls) * 100)
    : 0

  const totalCategoryCalls = Math.max(1, stats.hairCalls + stats.skinCalls + stats.generalCalls)
  const skinPercent = Math.round((stats.skinCalls / totalCategoryCalls) * 100)
  const hairPercent = Math.round((stats.hairCalls / totalCategoryCalls) * 100)
  const generalPercent = Math.round((stats.generalCalls / totalCategoryCalls) * 100)

  const now = new Date()
  const hour = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })
  const greeting = parseInt(hour) < 12 ? 'Good Morning' : parseInt(hour) < 17 ? 'Good Afternoon' : 'Good Evening'

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
            {greeting}, Dr. Abhinav 👋
          </h1>
          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
            {now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}The Skin Centre, Patna
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Live status */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${
            isLive
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400'
              : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-800'
          }`}>
            {isLive
              ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /><Wifi size={11} />Live</>
              : <><WifiOff size={11} />Offline</>
            }
          </div>

          {/* Last updated */}
          {lastUpdated && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-slate-400 px-2">
              <Clock size={10} />
              Updated {formatRelative(lastUpdated.toISOString())}
            </span>
          )}

          {/* Manual refresh */}
          <button
            onClick={() => void fetchAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 active:scale-[0.97] transition-all duration-200 text-[11px] font-bold disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => void fetchAll(true)} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* ── KPI Stat Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Calls Today"
          value={stats.totalCalls}
          subtitle={`${stats.answeredCalls} answered`}
          icon={<Phone size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-blue-600 to-blue-500 border-blue-400/30"
          iconBg="bg-white/20"
          loading={loading}
          badge="Today"
          badgeColor="bg-white/20 text-white"
        />
        <StatCard
          title="Missed Calls"
          value={stats.missedCalls}
          subtitle={`${pendingMissed.length} pending recovery`}
          icon={<PhoneMissed size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-rose-600 to-rose-500 border-rose-400/30"
          iconBg="bg-white/20"
          loading={loading}
          badge={pendingMissed.length > 0 ? `${pendingMissed.length} urgent` : undefined}
          badgeColor="bg-white/20 text-white animate-pulse"
        />
        <StatCard
          title="WhatsApp Sent"
          value={stats.whatsappSent}
          subtitle="automated follow-ups"
          icon={<MessageSquare size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-emerald-600 to-emerald-500 border-emerald-400/30"
          iconBg="bg-white/20"
          loading={loading}
        />
        <StatCard
          title="Recovered Today"
          value={stats.recovered}
          subtitle={`${recoveryRate}% recovery rate`}
          icon={<CheckCircle size={16} className="text-white" />}
          gradient="bg-gradient-to-br from-violet-600 to-violet-500 border-violet-400/30"
          iconBg="bg-white/20"
          loading={loading}
          badge={recoveryRate >= 70 ? '🔥 Hot' : undefined}
          badgeColor="bg-white/20 text-white"
        />
      </div>

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* LEFT: Timeline + Service Analytics (2/3 width) */}
        <div className="xl:col-span-2 space-y-5">

          {/* Live Activity Feed */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Activity size={14} className="text-blue-500" />
                  Live Activity Feed
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Real-time clinic events
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isLive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isLive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {isLive ? 'Live' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="px-5 py-4">
              {loading ? (
                <TimelineSkeleton />
              ) : timeline.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
                    <Zap className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  </div>
                  <p className="text-sm font-extrabold text-slate-400 dark:text-slate-500">No activity yet today</p>
                  <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">Events will appear here in real-time</p>
                </div>
              ) : (
                <ul className="space-y-0 divide-y divide-slate-50 dark:divide-slate-800/50">
                  {timeline.map((item, idx) => (
                    <li key={item.id} className={`flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 -mx-1 px-1 rounded-xl transition-colors duration-150 ${idx === 0 ? 'animate-in slide-in-from-top-2 duration-300' : ''}`}>
                      <TimelineIcon type={item.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200 truncate">{item.title}</p>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">{item.time}</span>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5 truncate">{item.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Service Analytics */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <TrendingUp size={14} className="text-blue-500" />
                  Treatment Analytics
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Today's call distribution</p>
              </div>
              <RecoveryGauge rate={recoveryRate} />
            </div>

            <div className="space-y-4">
              {/* Skin Care */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Skin Care</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-500">{skinPercent}%<span className="text-slate-300 dark:text-slate-600 ml-1">({stats.skinCalls})</span></span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-700" style={{ width: `${skinPercent}%` }} />
                </div>
              </div>

              {/* Hair Care */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Hair Care</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-500">{hairPercent}%<span className="text-slate-300 dark:text-slate-600 ml-1">({stats.hairCalls})</span></span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-500 to-violet-400 h-full rounded-full transition-all duration-700" style={{ width: `${hairPercent}%` }} />
                </div>
              </div>

              {/* General */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                    <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">General</span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-500">{generalPercent}%<span className="text-slate-300 dark:text-slate-600 ml-1">({stats.generalCalls})</span></span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-400 to-slate-300 h-full rounded-full transition-all duration-700" style={{ width: `${generalPercent}%` }} />
                </div>
              </div>
            </div>

            {/* Totals row */}
            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-blue-500" />
                  <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400">Patients</span>
                </div>
                <span className="text-base font-black text-slate-800 dark:text-slate-100">{stats.totalPatients}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-indigo-500" />
                  <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400">Consents</span>
                </div>
                <span className="text-base font-black text-slate-800 dark:text-slate-100">{stats.totalConsents}</span>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT: Quick Actions + Recovery Queue (1/3 width) */}
        <div className="space-y-5">

          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl p-5">
            <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
              <Zap size={14} className="text-amber-500" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { href: '/patients', icon: <Users size={18} className="text-blue-500" />, label: 'Patients', bg: 'bg-blue-50 dark:bg-blue-950/20' },
                { href: '/consents?tab=new', icon: <Clipboard size={18} className="text-indigo-500" />, label: 'New Consent', bg: 'bg-indigo-50 dark:bg-indigo-950/20' },
                { href: '/photos', icon: <Camera size={18} className="text-purple-500" />, label: 'Photos', bg: 'bg-purple-50 dark:bg-purple-950/20' },
                { href: '/whatsapp', icon: <MessageSquare size={18} className="text-emerald-500" />, label: 'Chat', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
              ].map((action) => (
                <Link key={action.href} href={action.href}>
                  <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 ${action.bg} hover:-translate-y-0.5 hover:shadow-sm active:scale-[0.97] transition-all duration-200 cursor-pointer group`}>
                    <span className="group-hover:scale-110 transition-transform duration-200">{action.icon}</span>
                    <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">{action.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Priority Recovery Queue */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <PhoneMissed size={13} className="text-rose-500" />
                  Recovery Queue
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {pendingMissed.length} pending
                </p>
              </div>
              <Link href="/missed-calls">
                <span className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <ChevronRight size={13} />
                </span>
              </Link>
            </div>

            <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {loading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-28 rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-2.5 w-20 rounded bg-slate-50 dark:bg-slate-800/60" />
                    </div>
                  </div>
                ))
              ) : pendingMissed.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">All clear!</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">No pending missed calls</p>
                </div>
              ) : (
                pendingMissed.map((missed) => (
                  <div key={missed.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-rose-50/30 dark:hover:bg-rose-950/10 transition-colors duration-150 group">
                    {/* Status dot */}
                    <div className="h-8 w-8 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0 ring-1 ring-rose-100 dark:ring-rose-900/30">
                      <PhoneMissed size={13} className="text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">
                        {missed.patient_name || missed.patient_phone}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">
                        {missed.service_type || 'General'} · {formatRelative(missed.missed_at)}
                      </p>
                    </div>
                    <Link
                      href={`/whatsapp?phone=${encodeURIComponent(missed.patient_phone)}`}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-0.5 hover:underline"
                    >
                      Send <ArrowRight size={9} />
                    </Link>
                  </div>
                ))
              )}
            </div>

            {pendingMissed.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/60">
                <Link href="/missed-calls" className="flex items-center justify-center gap-1.5 text-[11px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline">
                  View all missed calls <ArrowRight size={10} />
                </Link>
              </div>
            )}
          </div>

          {/* Today's Summary Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/50 shadow-sm rounded-2xl p-5 text-white">
            <h2 className="text-sm font-extrabold text-white mb-4 flex items-center gap-2">
              <Activity size={14} className="text-blue-400" />
              Today at a Glance
            </h2>
            <div className="space-y-3">
              {[
                {
                  label: 'Call Answer Rate',
                  value: stats.totalCalls > 0 ? `${Math.round((stats.answeredCalls / stats.totalCalls) * 100)}%` : '—',
                  color: 'text-emerald-400',
                },
                {
                  label: 'Missed Recovery Rate',
                  value: `${recoveryRate}%`,
                  color: recoveryRate >= 70 ? 'text-emerald-400' : recoveryRate >= 40 ? 'text-amber-400' : 'text-rose-400',
                },
                {
                  label: 'WhatsApp Response Rate',
                  value: stats.whatsappSent > 0 ? `${Math.round((stats.recovered / stats.whatsappSent) * 100)}%` : '—',
                  color: 'text-blue-400',
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">{row.label}</span>
                  <span className={`text-sm font-black ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
