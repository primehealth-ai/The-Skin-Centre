export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// IST offset in ms: +05:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatISTDateLabel(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = MONTH_NAMES[d.getUTCMonth()]
  return `${day} ${month}`
}

function getISTDateKey(utcIso: string): string {
  const d = new Date(new Date(utcIso).getTime() + IST_OFFSET_MS)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = MONTH_NAMES[d.getUTCMonth()]
  return `${day} ${month}`
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth check
    const userSupabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Query params
    const { searchParams } = new URL(req.url)
    const rangeParam = searchParams.get('range') || '30d'
    const serviceParam = searchParams.get('service') || 'all'

    const days = rangeParam === '7d' ? 7 : rangeParam === '90d' ? 90 : 30

    // 3. IST Date Window Calculation (calls/page.tsx pattern)
    const now = new Date()
    const nowIST = new Date(now.getTime() + IST_OFFSET_MS)

    // Start day in IST (00:00:00 IST of (days - 1) days ago)
    const startDayIST = new Date(nowIST.getTime() - (days - 1) * 86400000)
    startDayIST.setUTCHours(0, 0, 0, 0)
    const startUTC = new Date(startDayIST.getTime() - IST_OFFSET_MS)
    const startISO = startUTC.toISOString()

    // Pre-build array of all DD MMM labels in chronological order
    const dateKeys: string[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(nowIST.getTime() - i * 86400000)
      dateKeys.push(formatISTDateLabel(d))
    }

    // 4. Supabase queries with service client
    const supabase = createServiceClient()

    let callsQuery = supabase
      .from('calls')
      .select('call_started_at, call_status, call_transfer_status, service_type, call_duration')
      .gte('call_started_at', startISO)
      .order('call_started_at', { ascending: true })
      .limit(50000)

    if (serviceParam !== 'all') {
      callsQuery = callsQuery.eq('service_type', serviceParam)
    }

    let missedCallsQuery = supabase
      .from('missed_calls')
      .select('id, missed_at, status, recovered, recovered_at, patient_replied_at, service_type')
      .gte('missed_at', startISO)
      .order('missed_at', { ascending: true })
      .limit(50000)

    if (serviceParam !== 'all') {
      missedCallsQuery = missedCallsQuery.eq('service_type', serviceParam)
    }

    const [
      callsRes,
      allCallsForBreakdownRes,
      missedRes,
      waRes,
      consentsRes,
      patientsRes,
    ] = await Promise.all([
      callsQuery,
      supabase
        .from('calls')
        .select('service_type, call_transfer_status, call_status')
        .gte('call_started_at', startISO)
        .limit(50000),
      missedCallsQuery,
      supabase
        .from('whatsapp_messages')
        .select('id, direction, delivery_status, sent_at, created_at')
        .gte('created_at', startISO)
        .limit(50000),
      supabase
        .from('patient_consents')
        .select('id, created_at, treatment')
        .gte('created_at', startISO)
        .limit(50000),
      supabase
        .from('patients')
        .select('id, created_at')
        .gte('created_at', startISO)
        .order('created_at', { ascending: true })
        .limit(50000),
    ])

    const calls = callsRes.data ?? []
    const missedCalls = missedRes.data ?? []
    const whatsappMessages = waRes.data ?? []
    const consents = consentsRes.data ?? []
    const patients = patientsRes.data ?? []

    // Helper: is call missed according to call_transfer_status or call_status
    const isCallMissed = (c: { call_transfer_status: string | null; call_status: string }) => {
      if (c.call_transfer_status) {
        return ['Missed', 'Abandoned', 'Not Connected'].includes(c.call_transfer_status)
      }
      return c.call_status === 'missed'
    }

    // ── 1. callsByDay ──────────────────────────────────────────────────────────
    const callsByDayMap = new Map<string, { answered: number; missed: number }>()
    for (const dk of dateKeys) {
      callsByDayMap.set(dk, { answered: 0, missed: 0 })
    }
    for (const c of calls) {
      const dk = getISTDateKey(c.call_started_at)
      const entry = callsByDayMap.get(dk)
      if (entry) {
        if (isCallMissed(c)) {
          entry.missed++
        } else {
          entry.answered++
        }
      }
    }
    const callsByDay = dateKeys.map((dk) => ({
      date: dk,
      answered: callsByDayMap.get(dk)?.answered ?? 0,
      missed: callsByDayMap.get(dk)?.missed ?? 0,
    }))

    // ── 2. missedFunnel ────────────────────────────────────────────────────────
    const missedFunnel: Record<string, number> = {
      pending: 0,
      whatsapp_sent: 0,
      patient_replied: 0,
      recovered: 0,
      lost: 0,
    }
    for (const mc of missedCalls) {
      if (mc.status && missedFunnel[mc.status] !== undefined) {
        missedFunnel[mc.status]++
      }
    }

    // ── 3. recoveryByDay ───────────────────────────────────────────────────────
    const recoveryByDayMap = new Map<string, { total: number; recovered: number }>()
    for (const dk of dateKeys) {
      recoveryByDayMap.set(dk, { total: 0, recovered: 0 })
    }
    for (const mc of missedCalls) {
      const dk = getISTDateKey(mc.missed_at)
      const entry = recoveryByDayMap.get(dk)
      if (entry) {
        entry.total++
        if (mc.recovered) {
          entry.recovered++
        }
      }
    }
    const recoveryByDay = dateKeys.map((dk) => {
      const entry = recoveryByDayMap.get(dk)
      const total = entry?.total ?? 0
      const rec = entry?.recovered ?? 0
      const rate = total > 0 ? Number(((rec / total) * 100).toFixed(1)) : 0
      return { date: dk, rate }
    })

    // ── 4. hourHeatmap ─────────────────────────────────────────────────────────
    // 24 hours (0-23) × 7 days of week (0=Sun to 6=Sat)
    const heatmapMap = new Map<string, { hour: number; day: number; missed: number; total: number }>()
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        heatmapMap.set(`${h}_${d}`, { hour: h, day: d, missed: 0, total: 0 })
      }
    }
    for (const c of calls) {
      const istDate = new Date(new Date(c.call_started_at).getTime() + IST_OFFSET_MS)
      const hour = istDate.getUTCHours()
      const day = istDate.getUTCDay()
      const cell = heatmapMap.get(`${hour}_${day}`)
      if (cell) {
        cell.total++
        if (isCallMissed(c)) {
          cell.missed++
        }
      }
    }
    const hourHeatmap = Array.from(heatmapMap.values())

    // ── 5. serviceBreakdown ────────────────────────────────────────────────────
    const serviceMap: Record<string, { total: number; missed: number }> = {
      'Skin Care': { total: 0, missed: 0 },
      'Hair Care': { total: 0, missed: 0 },
      'General': { total: 0, missed: 0 },
    }
    const breakdownCalls = allCallsForBreakdownRes.data ?? []
    for (const c of breakdownCalls) {
      const svc = c.service_type || 'General'
      if (!serviceMap[svc]) {
        serviceMap[svc] = { total: 0, missed: 0 }
      }
      serviceMap[svc].total++
      if (isCallMissed(c)) {
        serviceMap[svc].missed++
      }
    }
    const serviceBreakdown = Object.entries(serviceMap).map(([name, data]) => ({
      name,
      total: data.total,
      missed: data.missed,
    }))

    // ── 6. whatsappFunnel ──────────────────────────────────────────────────────
    const outboundMessages = whatsappMessages.filter((m) => m.direction === 'outbound')
    const inboundMessagesList = whatsappMessages.filter((m) => m.direction === 'inbound')
    const waSent = outboundMessages.length
    const waDelivered = outboundMessages.filter(
      (m) => m.delivery_status === 'delivered' || m.delivery_status === 'read'
    ).length
    const waRead = outboundMessages.filter((m) => m.delivery_status === 'read').length
    const waReplied = missedCalls.filter((m) => m.patient_replied_at !== null).length
    const whatsappFunnel = {
      sent: waSent,
      delivered: waDelivered,
      read: waRead,
      replied: waReplied,
    }

    // ── 7. consentActivity ─────────────────────────────────────────────────────
    const consentMap = new Map<string, number>()
    for (const dk of dateKeys) {
      consentMap.set(dk, 0)
    }
    for (const cs of consents) {
      const dk = getISTDateKey(cs.created_at)
      if (consentMap.has(dk)) {
        consentMap.set(dk, (consentMap.get(dk) ?? 0) + 1)
      }
    }
    const consentActivity = dateKeys.map((dk) => ({
      date: dk,
      count: consentMap.get(dk) ?? 0,
    }))

    // ── 8. durationBrackets ────────────────────────────────────────────────────
    const durationBrackets = [
      { range: '< 30s', count: 0, label: 'Brief / Dropped' },
      { range: '30s – 1m', count: 0, label: 'General Inquiry' },
      { range: '1m – 3m', count: 0, label: 'Booking & Consult' },
      { range: '> 3m', count: 0, label: 'In-Depth Medical' },
    ]
    let answeredDurCount = 0
    let totalDurationSec = 0
    for (const c of calls) {
      const dur = c.call_duration ?? 0
      if (!isCallMissed(c) && dur > 0) {
        answeredDurCount++
        totalDurationSec += dur
        if (dur < 30) durationBrackets[0].count++
        else if (dur <= 60) durationBrackets[1].count++
        else if (dur <= 180) durationBrackets[2].count++
        else durationBrackets[3].count++
      }
    }
    const avgDurationSec = answeredDurCount > 0 ? Math.round(totalDurationSec / answeredDurCount) : 0
    const formatDuration = (sec: number) => {
      if (sec < 60) return `${sec}s`
      const m = Math.floor(sec / 60)
      const s = sec % 60
      return s > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${m}m`
    }
    const avgDurationFormatted = formatDuration(avgDurationSec)

    // ── 9. dayOfWeekBreakdown ──────────────────────────────────────────────────
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const dayIndices = [1, 2, 3, 4, 5, 6, 0] // 1=Mon ... 0=Sun
    const dayStatsMap: Record<number, { day: string; answered: number; missed: number; total: number }> = {}
    dayIndices.forEach((idx, i) => {
      dayStatsMap[idx] = { day: dayNames[i], answered: 0, missed: 0, total: 0 }
    })
    for (const c of calls) {
      const istDate = new Date(new Date(c.call_started_at).getTime() + IST_OFFSET_MS)
      const d = istDate.getUTCDay()
      if (dayStatsMap[d]) {
        dayStatsMap[d].total++
        if (isCallMissed(c)) {
          dayStatsMap[d].missed++
        } else {
          dayStatsMap[d].answered++
        }
      }
    }
    const dayOfWeekBreakdown = dayIndices.map((idx) => {
      const s = dayStatsMap[idx]
      const missRate = s.total > 0 ? `${((s.missed / s.total) * 100).toFixed(0)}%` : '0%'
      return { ...s, missRate }
    })

    // ── 10. whatsappActivityByDay ──────────────────────────────────────────────
    const waActivityMap = new Map<string, { outbound: number; inbound: number }>()
    for (const dk of dateKeys) {
      waActivityMap.set(dk, { outbound: 0, inbound: 0 })
    }
    for (const m of whatsappMessages) {
      const timeStr = m.sent_at || m.created_at
      if (timeStr) {
        const dk = getISTDateKey(timeStr)
        const entry = waActivityMap.get(dk)
        if (entry) {
          if (m.direction === 'inbound') {
            entry.inbound++
          } else {
            entry.outbound++
          }
        }
      }
    }
    const whatsappActivityByDay = dateKeys.map((dk) => ({
      date: dk,
      outbound: waActivityMap.get(dk)?.outbound ?? 0,
      inbound: waActivityMap.get(dk)?.inbound ?? 0,
    }))

    // ── 11. topTreatments ──────────────────────────────────────────────────────
    const treatmentCounts: Record<string, number> = {}
    for (const cs of consents) {
      const t = cs.treatment?.trim()
      if (t && t !== '....' && t.length > 2) {
        treatmentCounts[t] = (treatmentCounts[t] || 0) + 1
      }
    }
    const topTreatments = Object.entries(treatmentCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }))

    // ── 12. patientGrowthByDay ─────────────────────────────────────────────────
    const patientMap = new Map<string, number>()
    for (const dk of dateKeys) {
      patientMap.set(dk, 0)
    }
    for (const p of patients) {
      const dk = getISTDateKey(p.created_at)
      if (patientMap.has(dk)) {
        patientMap.set(dk, (patientMap.get(dk) ?? 0) + 1)
      }
    }
    let runningTotal = 0
    const patientGrowthByDay = dateKeys.map((dk) => {
      const newCount = patientMap.get(dk) ?? 0
      runningTotal += newCount
      return {
        date: dk,
        newPatients: newCount,
        cumulative: runningTotal,
      }
    })

    // ── 13. topKPIs ────────────────────────────────────────────────────────────
    const totalCalls = calls.length
    const totalMissed = calls.filter((c) => isCallMissed(c)).length
    const totalAnswered = totalCalls - totalMissed
    const missRate = totalCalls > 0 ? `${((totalMissed / totalCalls) * 100).toFixed(1)}%` : '0.0%'
    const answeredRate = totalCalls > 0 ? `${((totalAnswered / totalCalls) * 100).toFixed(1)}%` : '0.0%'

    const totalMissedRows = missedCalls.length
    const recoveredRows = missedCalls.filter((m) => m.recovered).length
    const recoveryRate = totalMissedRows > 0 ? `${((recoveredRows / totalMissedRows) * 100).toFixed(1)}%` : '0.0%'

    let totalRecoveryHours = 0
    let recoveryCount = 0
    for (const mc of missedCalls) {
      if (mc.recovered && mc.recovered_at && mc.missed_at) {
        const diff = (new Date(mc.recovered_at).getTime() - new Date(mc.missed_at).getTime()) / (1000 * 60 * 60)
        if (diff >= 0) {
          totalRecoveryHours += diff
          recoveryCount++
        }
      }
    }
    const avgRecoveryHours = recoveryCount > 0 ? Number((totalRecoveryHours / recoveryCount).toFixed(1)) : 0

    // Peak Hour calculation
    let peakHour = 11
    let peakHourCount = 0
    for (let h = 0; h < 24; h++) {
      let count = 0
      for (let d = 0; d < 7; d++) {
        count += heatmapMap.get(`${h}_${d}`)?.total ?? 0
      }
      if (count > peakHourCount) {
        peakHourCount = count
        peakHour = h
      }
    }
    const formatHourDisplay = (h: number) => {
      const period = h >= 12 ? 'PM' : 'AM'
      const displayH = h % 12 === 0 ? 12 : h % 12
      return `${displayH} ${period}`
    }
    const peakHourWindow = `${formatHourDisplay(peakHour)} – ${formatHourDisplay((peakHour + 1) % 24)}`

    let busiestDayName = 'Friday'
    let maxDayCount = 0
    for (const item of dayOfWeekBreakdown) {
      if (item.total > maxDayCount) {
        maxDayCount = item.total
        busiestDayName = item.day
      }
    }

    const summaryInsights = {
      peakHour: peakHourWindow,
      busiestDay: busiestDayName,
      avgDuration: avgDurationFormatted,
      inboundReplies: inboundMessagesList.length,
      answeredRate,
      newPatientsCount: patients.length,
    }

    const topKPIs = {
      totalCalls,
      totalMissed,
      totalAnswered,
      missRate,
      answeredRate,
      avgDurationSec,
      avgDurationFormatted,
      whatsappSent: waSent,
      inboundMessages: inboundMessagesList.length,
      outboundMessages: outboundMessages.length,
      newPatients: patients.length,
      recoveryRate,
      avgRecoveryHours,
    }

    return NextResponse.json({
      callsByDay,
      missedFunnel,
      recoveryByDay,
      hourHeatmap,
      serviceBreakdown,
      whatsappFunnel,
      consentActivity,
      durationBrackets,
      dayOfWeekBreakdown,
      whatsappActivityByDay,
      topTreatments,
      patientGrowthByDay,
      summaryInsights,
      topKPIs,
    })
  } catch (err: unknown) {
    console.error('[ANALYTICS API ERROR]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
