import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import StatCard from '@/components/dashboard/StatCard'
import Link from 'next/link'
import {
  Phone, PhoneIncoming, Activity, MessageSquare, IndianRupee,
  Clock, HeartPulse, CheckCircle2, AlertCircle, Zap, Users,
  Clipboard, Camera, ArrowRight, FileText
} from 'lucide-react'
import DashboardCharts from './DashboardCharts'
import LivePendingCalls from './LivePendingCalls'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const userSupabase = await createClient()
  const {
    data: { user },
  } = await userSupabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // --- Dates ---
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTodayISO = startOfToday.toISOString()

  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - 7)
  const startOfWeekISO = startOfWeek.toISOString()

  const startOfMonth = new Date(now)
  startOfMonth.setDate(now.getDate() - 30)
  const startOfMonthISO = startOfMonth.toISOString()

  try {
    const supabase = createServiceClient()

    // --- Data Fetching ---
    const [
      { count: totalCallsToday },
      { count: missedCallsToday },
      { count: recoveredToday },
      { count: whatsappSentToday },
      
      { count: totalCallsThisWeek },
      { count: recoveredThisWeek },
      { data: weekCallsData },

      { count: pendingMissed },
      { data: healthData },

      { data: barDataRaw },
      { data: pieDataRaw },
      { data: lineDataRaw },
      
      { data: recentMissedCalls },
      { data: recentConsents }
    ] = await Promise.all([
      // Row 1: Today
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('call_started_at', startOfTodayISO),
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('missed_at', startOfTodayISO),
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('recovered_at', startOfTodayISO).eq('recovered', true),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('sent_at', startOfTodayISO),

      // Row 2: This week
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('call_started_at', startOfWeekISO),
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('recovered_at', startOfWeekISO).eq('recovered', true),
      supabase.from('calls').select('call_started_at').gte('call_started_at', startOfWeekISO),

      // Row 3: Realtime initial
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('forwarding_health').select(`
        status, last_call_received_at,
        clinic_numbers ( display_name )
      `),

      // Charts: Bar (last 7 days calls)
      supabase.from('calls').select('call_started_at, call_status').gte('call_started_at', startOfWeekISO),
      // Charts: Pie (all time missed calls by status)
      supabase.from('missed_calls').select('status'),
      // Charts: Line (recovery rate trend last 30 days)
      supabase.from('missed_calls').select('missed_at, recovered').gte('missed_at', startOfMonthISO),

      // Recent Data for Details Sections
      supabase.from('missed_calls').select('*').eq('status', 'pending').order('missed_at', { ascending: false }).limit(5),
      supabase.from('patient_consents').select('id, treatment, created_at, otp_verified_at, patients(full_name)').order('created_at', { ascending: false }).limit(5)
    ])

    // --- Computations ---
    const recoveryRateToday = missedCallsToday ? Math.round(((recoveredToday ?? 0) / missedCallsToday) * 100) : 0
    const revenueRecoveredThisWeek = (recoveredThisWeek ?? 0) * 3000

    // Most active hour
    let mostActiveHourStr = 'N/A'
    if (weekCallsData && weekCallsData.length > 0) {
      const hourCounts: Record<number, number> = {}
      weekCallsData.forEach(c => {
        const h = new Date(c.call_started_at).getHours()
        hourCounts[h] = (hourCounts[h] || 0) + 1
      })
      const bestHour = parseInt(Object.keys(hourCounts).reduce((a, b) => hourCounts[parseInt(a)] > hourCounts[parseInt(b)] ? a : b))
      // Format to 12-hour
      const ampm = bestHour >= 12 ? 'PM' : 'AM'
      const displayHour = bestHour % 12 || 12
      mostActiveHourStr = `${displayHour}:00 ${ampm}`
    }

    // --- Chart Processing ---
    
    // Bar Chart (Last 7 Days, grouped by day)
    const barMap: Record<string, { date: string, answered: number, missed: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      barMap[dStr] = { date: dStr, answered: 0, missed: 0 }
    }
    barDataRaw?.forEach(c => {
      const dStr = new Date(c.call_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (barMap[dStr]) {
        if (c.call_status === 'answered') barMap[dStr].answered++
        else barMap[dStr].missed++
      }
    })
    const barChartData = Object.values(barMap)

    // Pie Chart
    const statusCounts: Record<string, number> = {
      pending: 0, whatsapp_sent: 0, patient_replied: 0, recovered: 0, lost: 0
    }
    pieDataRaw?.forEach(m => {
      if (m.status && statusCounts[m.status] !== undefined) {
        statusCounts[m.status]++
      }
    })
    const PIE_COLORS: Record<string, string> = {
      pending: '#f43f5e',
      whatsapp_sent: '#3b82f6',
      patient_replied: '#8b5cf6',
      recovered: '#10b981',
      lost: '#64748b'
    }
    const pieChartData = Object.entries(statusCounts).map(([key, val]) => ({
      name: key.replace('_', ' ').toUpperCase(),
      value: val,
      color: PIE_COLORS[key]
    })).filter(x => x.value > 0)

    // Line Chart (Recovery rate last 30 days)
    const lineMap: Record<string, { date: string, total: number, recovered: number }> = {}
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      lineMap[dStr] = { date: dStr, total: 0, recovered: 0 }
    }
    lineDataRaw?.forEach(m => {
      const dStr = new Date(m.missed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (lineMap[dStr]) {
        lineMap[dStr].total++
        if (m.recovered) lineMap[dStr].recovered++
      }
    })
    const lineChartData = Object.values(lineMap).map(item => ({
      date: item.date,
      rate: item.total > 0 ? Math.round((item.recovered / item.total) * 100) : 0
    }))

    return (
      <div className="space-y-8 pb-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Clinic Intelligence</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">Live analytics & recovery performance</p>
          </div>
        </div>

        {/* --- ROW 1: Today's Stats --- */}
        <div>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4">Today's Pulse</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Calls Today"
              value={totalCallsToday ?? 0}
              icon={Phone}
              color="blue"
            />
            <StatCard
              title="Missed Calls Today"
              value={missedCallsToday ?? 0}
              icon={PhoneIncoming}
              color="red"
            />
            <StatCard
              title="Recovery Rate (Today)"
              value={`${recoveryRateToday}%`}
              icon={Activity}
              color="purple"
              trend={recoveryRateToday >= 50 ? 'Excellent' : 'Needs Attention'}
              trendUp={recoveryRateToday >= 50}
            />
            <StatCard
              title="WhatsApp Sent Today"
              value={whatsappSentToday ?? 0}
              icon={MessageSquare}
              color="green"
            />
          </div>
        </div>

        {/* --- ROW 2: This Week --- */}
        <div>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4">Weekly Snapshot</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="Total Calls (7 Days)"
              value={totalCallsThisWeek ?? 0}
              icon={Phone}
              color="blue"
            />
            <StatCard
              title="Revenue Recovered (Est.)"
              value={`₹${revenueRecoveredThisWeek.toLocaleString('en-IN')}`}
              icon={IndianRupee}
              color="green"
              trend="Based on 3000 INR avg."
              trendUp={true}
            />
            <StatCard
              title="Most Active Hour"
              value={mostActiveHourStr}
              icon={Clock}
              color="orange"
            />
          </div>
        </div>

        {/* --- ROW 3: Realtime & System Health --- */}
        <div>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4">Live Control Center</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Realtime Client Component */}
            <div className="lg:col-span-1">
              <LivePendingCalls initialCount={pendingMissed ?? 0} />
            </div>

            {/* Health Badges */}
            <div className="lg:col-span-2 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4 uppercase tracking-widest">
                <HeartPulse size={16} className="text-rose-500" />
                Forwarding System Health
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {healthData?.length ? healthData.map((health: any, i: number) => {
                  const isHealthy = health.status === 'active' || health.status === 'healthy'
                  const displayName = health.clinic_numbers?.display_name || 'Unknown Line'
                  return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${isHealthy ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30' : 'bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30'}`}>
                      {isHealthy ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <AlertCircle size={18} className="text-rose-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isHealthy ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                          {displayName}
                        </p>
                        <p className={`text-[10px] font-semibold truncate ${isHealthy ? 'text-emerald-600/70 dark:text-emerald-400/70' : 'text-rose-600/70 dark:text-rose-400/70'}`}>
                          {health.last_call_received_at ? new Date(health.last_call_received_at).toLocaleTimeString() : 'No recent calls'}
                        </p>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="col-span-full text-center p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                    <p className="text-sm font-bold text-slate-400">No forwarding health data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- ROW 4: Quick Actions & Recent Details --- */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Quick Actions & Recent Consents (1/3 width) */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl p-5">
              <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                Quick Actions
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { href: '/patients', icon: <Users size={18} className="text-blue-500" />, label: 'Patients', bg: 'bg-blue-50/50 dark:bg-blue-950/20' },
                  { href: '/consents?tab=new', icon: <Clipboard size={18} className="text-indigo-500" />, label: 'New Consent', bg: 'bg-indigo-50/50 dark:bg-indigo-950/20' },
                  { href: '/photos', icon: <Camera size={18} className="text-purple-500" />, label: 'Photos', bg: 'bg-purple-50/50 dark:bg-purple-950/20' },
                  { href: '/whatsapp', icon: <MessageSquare size={18} className="text-emerald-500" />, label: 'Chat', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
                ].map((action) => (
                  <Link key={action.href} href={action.href}>
                    <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-100 dark:border-slate-800 ${action.bg} hover:-translate-y-1 hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer group`}>
                      <span className="group-hover:scale-110 group-hover:rotate-3 transition-transform duration-200">{action.icon}</span>
                      <span className="text-[10px] font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wide text-center">{action.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent Consents */}
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
                <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText size={14} className="text-indigo-500" />
                  Recent Consents
                </h2>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {recentConsents?.length === 0 ? (
                  <div className="px-5 py-8 text-center text-xs font-bold text-slate-400">No recent consents</div>
                ) : (
                  recentConsents?.map((consent: any) => (
                    <div key={consent.id} className="px-5 py-3.5 flex flex-col gap-1 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate">
                        {consent.patients?.full_name || 'Unknown Patient'}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>{consent.treatment}</span>
                        <span>{new Date(consent.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent Missed Calls Queue (2/3 width) */}
          <div className="xl:col-span-2">
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-800/80 shadow-sm rounded-2xl overflow-hidden h-full">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <PhoneIncoming size={14} className="text-rose-500" />
                    Recent Pending Missed Calls
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Needs immediate attention</p>
                </div>
                <Link href="/missed-calls" className="text-[11px] font-extrabold text-blue-600 hover:underline">
                  View All
                </Link>
              </div>
              
              <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {recentMissedCalls?.length === 0 ? (
                  <div className="px-5 py-12 text-center flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center mb-3">
                      <CheckCircle2 size={24} className="text-emerald-500" />
                    </div>
                    <p className="text-sm font-extrabold text-slate-600 dark:text-slate-300">All Clear!</p>
                    <p className="text-xs font-bold text-slate-400 mt-1">No pending missed calls right now.</p>
                  </div>
                ) : (
                  recentMissedCalls?.map((call: any) => (
                    <div key={call.id} className="px-5 py-4 flex items-center justify-between hover:bg-rose-50/20 dark:hover:bg-rose-950/10 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/30">
                          <PhoneIncoming size={16} className="text-rose-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                            {call.patient_name || call.patient_phone}
                          </p>
                          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 flex gap-2">
                            <span>{call.service_type || 'General'}</span>
                            <span>&bull;</span>
                            <span>{new Date(call.missed_at).toLocaleString()}</span>
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/whatsapp?phone=${encodeURIComponent(call.patient_phone)}`}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                      >
                        Message <ArrowRight size={12} />
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        {/* --- CHARTS --- */}
        <div>
          <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-0">Deep Analytics</h2>
          <DashboardCharts 
            barChartData={barChartData}
            pieChartData={pieChartData}
            lineChartData={lineChartData}
          />
        </div>

      </div>
    )
  } catch (err: any) {
    console.error('[DashboardPage] Failed to render dashboard:', err)
    return (
      <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 rounded-2xl max-w-2xl mx-auto my-10 text-rose-800 dark:text-rose-400">
        <h2 className="text-lg font-black tracking-tight mb-2">Dashboard Offline</h2>
        <p className="text-sm font-semibold mb-4">{err?.message || String(err)}</p>
        <p className="text-xs text-slate-500 font-medium">Please check your Vercel Environment Variables and verify that your Supabase database is online and fully migrated.</p>
      </div>
    )
  }
}
