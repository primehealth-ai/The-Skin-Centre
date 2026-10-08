'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import {
  Phone, PhoneIncoming, PhoneMissed, MessageSquare, Users,
  CalendarX, PieChart as PieChartIcon, MessageCircle, Clock,
  Calendar, Download, Sparkles, ShieldCheck
} from 'lucide-react'
import StatCard from '@/components/dashboard/StatCard'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  callsByDay: { date: string; answered: number; missed: number }[]
  missedFunnel: {
    pending: number
    whatsapp_sent: number
    patient_replied: number
    recovered: number
    lost: number
  }
  recoveryByDay: { date: string; rate: number }[]
  hourHeatmap: { hour: number; day: number; missed: number; total: number }[]
  serviceBreakdown: { name: string; total: number; missed: number }[]
  whatsappFunnel: {
    sent: number
    delivered: number
    read: number
    replied: number
  }
  consentActivity: { date: string; count: number }[]
  durationBrackets: { range: string; count: number; label: string }[]
  dayOfWeekBreakdown: { day: string; answered: number; missed: number; total: number; missRate: string }[]
  whatsappActivityByDay: { date: string; outbound: number; inbound: number }[]
  topTreatments: { name: string; count: number }[]
  patientGrowthByDay: { date: string; newPatients: number; cumulative: number }[]
  summaryInsights: {
    peakHour: string
    busiestDay: string
    avgDuration: string
    inboundReplies: number
    answeredRate: string
  }
  topKPIs: {
    totalCalls: number
    totalMissed: number
    totalAnswered: number
    missRate: string
    answeredRate: string
    avgDurationSec: number
    avgDurationFormatted: string
    whatsappSent: number
    inboundMessages: number
    outboundMessages: number
    newPatients: number
    recoveryRate: string
    avgRecoveryHours: number
  }
}

// ── Custom Tooltip (DashboardCharts pattern) ───────────────────────────────────

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | string
    color?: string
    fill?: string
    unit?: string
  }>
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 p-4 rounded-xl shadow-2xl z-50">
        <p className="text-slate-300 text-xs font-bold mb-2 uppercase tracking-wider">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-slate-100 font-medium text-sm">
                {entry.name}: <span className="font-bold">{entry.value}{entry.unit || ''}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

const EmptyChart = ({ message = 'No data for this period' }: { message?: string }) => (
  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-slate-400 gap-2">
    <CalendarX className="h-8 w-8 stroke-[1.5]" />
    <span className="text-sm font-semibold">{message}</span>
  </div>
)

const SERVICE_COLORS: Record<string, string> = {
  'Skin Care': '#3b82f6', // blue
  'Hair Care': '#8b5cf6', // violet
  'General': '#f59e0b',   // amber
}

const DURATION_COLORS = ['#64748b', '#3b82f6', '#8b5cf6', '#10b981']

const HEATMAP_DAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
]

export default function AnalyticsDashboard() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d')
  const [service, setService] = useState<'all' | 'Skin Care' | 'Hair Care' | 'General'>('all')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (r: string, s: string) => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/analytics?range=${encodeURIComponent(r)}&service=${encodeURIComponent(s)}`)
      if (!res.ok) {
        throw new Error(`Failed to load analytics: ${res.statusText}`)
      }
      const json: AnalyticsData = await res.json()
      setData(json)
    } catch (err: unknown) {
      console.error('[ANALYTICS FETCH ERROR]', err)
      setError(err instanceof Error ? err.message : 'Error loading analytics data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData(range, service)
  }, [range, service, fetchData])

  const serviceBreakdownWithColor = data
    ? data.serviceBreakdown.map((s) => ({
        ...s,
        color: SERVICE_COLORS[s.name] || '#64748b',
      }))
    : []

  const totalServiceCalls = serviceBreakdownWithColor.reduce((acc, curr) => acc + curr.total, 0)
  const hasCallsData = (data?.callsByDay?.reduce((acc, curr) => acc + curr.answered + curr.missed, 0) ?? 0) > 0

  // Client-side CSV export
  const handleExportCSV = () => {
    if (!data) return
    const headers = ['Date', 'Answered Calls', 'Missed Calls', 'Total Calls', 'New Patients', 'Consents Recorded']
    const rows = data.callsByDay.map((c, i) => {
      const pg = data.patientGrowthByDay?.[i]
      const cs = data.consentActivity?.[i]
      const total = c.answered + c.missed
      return [
        c.date,
        c.answered,
        c.missed,
        total,
        pg?.newPatients ?? 0,
        cs?.count ?? 0,
      ].join(',')
    })
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `the-skin-centre-analytics-${range}-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6">
      {/* ── EXECUTIVE INSIGHTS BANNER ────────────────────────────────────────── */}
      {data?.summaryInsights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Peak Contact Window</p>
              <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{data.summaryInsights.peakHour} (Highest Traffic)</p>
            </div>
          </div>

          <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Consultation Depth</p>
              <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{data.summaryInsights.avgDuration} Avg Answered Call Duration</p>
            </div>
          </div>

          <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 rounded-2xl p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Patient Growth</p>
              <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100">+{data.topKPIs.newPatients} New Patients Registered</p>
            </div>
          </div>
        </div>
      )}

      {/* ── B) FILTER BAR & EXPORT ───────────────────────────────────────────── */}
      <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-3 mb-6 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Range Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/40 dark:border-slate-800/60">
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setRange(item.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-150 ${
                  range === item.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Service Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/40 dark:border-slate-800/60 flex-wrap">
            {(
              [
                { id: 'all', label: 'All Services' },
                { id: 'Skin Care', label: 'Skin Care' },
                { id: 'Hair Care', label: 'Hair Care' },
                { id: 'General', label: 'General' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setService(item.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all duration-150 ${
                  service === item.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live sync & Export */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold border border-emerald-200/50 dark:border-emerald-900/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            IST (UTC+5:30) Live
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors border border-slate-200/60 dark:border-slate-700/60 disabled:opacity-50"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-bold">
          {error}
        </div>
      )}

      {/* ── C) KPI ROW (Recovery Rate removed, replaced by Avg Call Duration) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          title="Total Calls"
          value={loading && !data ? '…' : data?.topKPIs.totalCalls ?? 0}
          icon={Phone}
          color="blue"
        />
        <StatCard
          title="Answered Calls"
          value={loading && !data ? '…' : data?.topKPIs.totalAnswered ?? 0}
          icon={PhoneIncoming}
          color="green"
          trend={data?.topKPIs.answeredRate ? `${data.topKPIs.answeredRate} rate` : undefined}
          trendUp={true}
        />
        <StatCard
          title="Missed Calls"
          value={loading && !data ? '…' : data?.topKPIs.totalMissed ?? 0}
          icon={PhoneMissed}
          color="red"
          trend={data?.topKPIs.missRate ? `${data.topKPIs.missRate} rate` : undefined}
          trendUp={false}
        />
        <StatCard
          title="Avg Call Duration"
          value={loading && !data ? '…' : data?.topKPIs.avgDurationFormatted ?? '0s'}
          icon={Clock}
          color="purple"
          trend="Consultation"
          trendUp={true}
        />
        <StatCard
          title="WhatsApp Sent"
          value={loading && !data ? '…' : data?.topKPIs.whatsappSent ?? 0}
          icon={MessageSquare}
          color="purple"
          trend={data?.topKPIs.inboundMessages ? `${data.topKPIs.inboundMessages} replies` : undefined}
          trendUp={true}
        />
        <StatCard
          title="New Patients"
          value={loading && !data ? '…' : data?.topKPIs.newPatients ?? 0}
          icon={Users}
          color="blue"
        />
      </div>

      {/* ── D) CHARTS ────────────────────────────────────────────────────────── */}

      {/* ROW 1: Call Volume (2/3) + Service Split (1/3) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Chart 1: Call Volume */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="xl:col-span-2 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Phone size={16} className="text-blue-500" />
                Call Volume
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Daily Answered vs Missed Breakdown
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Missed
              </span>
            </div>
          </div>

          <div className="h-[280px] w-full">
            {!hasCallsData ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.callsByDay ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="answered" name="Answered" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="missed" name="Missed" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Chart 2: Service Split */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="xl:col-span-1 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative flex flex-col justify-between"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="mb-2 relative z-10">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <PieChartIcon size={16} className="text-indigo-500" />
              Service Split
            </h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Call Distribution by Service
            </p>
          </div>

          <div className="h-[220px] w-full relative z-10">
            {totalServiceCalls === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceBreakdownWithColor}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="total"
                      nameKey="name"
                      stroke="none"
                    >
                      {serviceBreakdownWithColor.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col mt-4">
                  <span className="text-3xl font-black text-slate-800 dark:text-slate-100">
                    {totalServiceCalls}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</span>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 relative z-10">
            {serviceBreakdownWithColor.map((entry, i) => (
              <div key={i} className="flex flex-col bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate">
                    {entry.name.replace(' Care', '')}
                  </span>
                </div>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200">{entry.total}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ROW 2: Day-of-Week Call Performance + Call Duration Depth (REPLACED RECOVERY CHARTS) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Replacement Chart 1: Day of Week Performance */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-500" />
                Day-of-Week Call Distribution
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Helpline Traffic & Miss Rate Pattern (Mon–Sun)
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Missed
              </span>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {!data || data.dayOfWeekBreakdown.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dayOfWeekBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="answered" name="Answered Calls" stackId="dow" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="missed" name="Missed Calls" stackId="dow" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Replacement Chart 2: Call Duration & Consultation Depth */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Clock size={16} className="text-blue-500" />
                Call Duration & Consultation Depth
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Time Spent Per Answered Patient Call
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400">Avg Duration: </span>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400">{data?.topKPIs.avgDurationFormatted ?? '0s'}</span>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {!data || data.durationBrackets.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.durationBrackets} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <YAxis type="category" dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Calls" radius={[0, 6, 6, 0]}>
                    {data.durationBrackets.map((_, index) => (
                      <Cell key={`bracket-cell-${index}`} fill={DURATION_COLORS[index % DURATION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* ROW 3: WhatsApp 2-Way Engagement + Consented Procedures (REPLACED DELIVERY FUNNEL) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Replacement Chart 3: Patient Growth Velocity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Users size={16} className="text-emerald-500" />
                Patient Growth Velocity
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Daily New Patient Registrations Recorded
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-400">Total Added: </span>
              <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">+{data?.topKPIs.newPatients ?? 0}</span>
            </div>
          </div>

          <div className="h-[200px] w-full">
            {!data || data.patientGrowthByDay.length === 0 ? (
              <EmptyChart message="No new patient registrations in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.patientGrowthByDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="patientGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="newPatients" name="New Patients" stroke="#10b981" strokeWidth={2.5} fill="url(#patientGrowthGrad)" activeDot={{ r: 5, fill: '#10b981' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Chart 6: Top Consented Clinical Procedures */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 group relative"
        >
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          )}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck size={16} className="text-violet-500" />
                Clinical Consents by Treatment
              </h3>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Top Dermatological Procedures Documented
              </p>
            </div>
          </div>

          <div className="h-[200px] w-full">
            {!data || data.topTreatments.length === 0 ? (
              <EmptyChart message="No consented procedures recorded" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topTreatments} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={130} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Consents Signed" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {/* ROW 4: Peak Hour Heatmap (Full Width) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        className="bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 relative"
      >
        {loading && (
          <div className="absolute inset-0 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xs z-20 flex items-center justify-center rounded-3xl">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Clock size={16} className="text-rose-500" />
              Peak Hour Heatmap
            </h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Missed Call Concentration by Day & Hour (IST)
            </p>
          </div>
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <span>Low</span>
            <span className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800" />
            <span className="w-3 h-3 rounded bg-rose-200 dark:bg-rose-950/60" />
            <span className="w-3 h-3 rounded bg-rose-400 dark:bg-rose-800" />
            <span className="w-3 h-3 rounded bg-rose-600 dark:bg-rose-600" />
            <span>High Miss Rate</span>
          </div>
        </div>

        <div className="overflow-x-auto w-full pt-2">
          <div className="min-w-[620px]">
            {/* Header: Day Labels */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 mb-1">
              <div />
              {HEATMAP_DAYS.map((d) => (
                <div
                  key={d.day}
                  className="text-center text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-1"
                >
                  {d.label}
                </div>
              ))}
            </div>

            {/* Grid rows for 24 hours */}
            <div className="space-y-1">
              {Array.from({ length: 24 }).map((_, hour) => {
                // Show label every 3 hours
                const showLabel = hour % 3 === 0
                const hourFormatted =
                  hour === 0
                    ? '12 AM'
                    : hour === 12
                    ? '12 PM'
                    : hour > 12
                    ? `${hour - 12} PM`
                    : `${hour} AM`

                return (
                  <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] gap-1 items-center">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 text-right pr-2">
                      {showLabel ? hourFormatted : ''}
                    </span>

                    {HEATMAP_DAYS.map((d) => {
                      const cell = data?.hourHeatmap.find(
                        (h) => h.hour === hour && h.day === d.day
                      )
                      const total = cell?.total ?? 0
                      const missed = cell?.missed ?? 0
                      const ratio = total > 0 ? missed / total : 0

                      let bgClass = 'bg-slate-100/70 dark:bg-slate-800/40 text-slate-400'
                      if (total > 0) {
                        if (ratio === 0) {
                          bgClass = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                        } else if (ratio <= 0.33) {
                          bgClass = 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                        } else if (ratio <= 0.66) {
                          bgClass = 'bg-rose-300 dark:bg-rose-800 text-rose-900 dark:text-rose-100'
                        } else {
                          bgClass = 'bg-rose-600 text-white font-bold'
                        }
                      }

                      return (
                        <div
                          key={d.day}
                          title={`${d.label} ${hourFormatted} — Total: ${total}, Missed: ${missed} (${Math.round(ratio * 100)}%)`}
                          className={`w-full h-5 rounded flex items-center justify-center text-[9px] font-semibold transition-all hover:scale-105 cursor-default ${bgClass}`}
                        >
                          {total > 0 ? missed : ''}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
