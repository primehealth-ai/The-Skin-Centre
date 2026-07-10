'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import StatCard from '@/components/dashboard/StatCard'
import { Phone, PhoneIncoming, Activity, MessageSquare } from 'lucide-react'

interface LiveTodayStatsProps {
  initialTotalCalls: number
  initialMissedCalls: number
  initialRecovered: number
  initialWhatsappSent: number
  startOfTodayISO: string
}

export default function LiveTodayStats({
  initialTotalCalls,
  initialMissedCalls,
  initialRecovered,
  initialWhatsappSent,
  startOfTodayISO,
}: LiveTodayStatsProps) {
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [totalCalls, setTotalCalls] = useState(initialTotalCalls)
  const [missedCalls, setMissedCalls] = useState(initialMissedCalls)
  const [recovered, setRecovered] = useState(initialRecovered)
  const [whatsappSent, setWhatsappSent] = useState(initialWhatsappSent)

  // Re-fetch all four counters from the DB in one shot
  const refetchCounts = async () => {
    const todayISO = startOfTodayISO
    const [
      { count: tc },
      { count: mc },
      { count: rc },
      { count: ws },
    ] = await Promise.all([
      supabase.from('calls').select('id', { count: 'exact', head: true }).gte('call_started_at', todayISO),
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('missed_at', todayISO),
      supabase.from('missed_calls').select('id', { count: 'exact', head: true }).gte('recovered_at', todayISO).eq('recovered', true),
      supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('sent_at', todayISO),
    ])
    if (tc !== null) setTotalCalls(tc)
    if (mc !== null) setMissedCalls(mc)
    if (rc !== null) setRecovered(rc)
    if (ws !== null) setWhatsappSent(ws)
  }

  useEffect(() => {
    const callsChannel = supabase
      .channel('live-today-stats-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refetchCounts)
      .subscribe()

    const missedChannel = supabase
      .channel('live-today-stats-missed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missed_calls' }, refetchCounts)
      .subscribe()

    const waChannel = supabase
      .channel('live-today-stats-whatsapp')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, refetchCounts)
      .subscribe()

    return () => {
      supabase.removeChannel(callsChannel)
      supabase.removeChannel(missedChannel)
      supabase.removeChannel(waChannel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recoveryRate = missedCalls > 0 ? Math.round((recovered / missedCalls) * 100) : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Calls Today"
        value={totalCalls}
        icon={Phone}
        color="blue"
      />
      <StatCard
        title="Missed Calls Today"
        value={missedCalls}
        icon={PhoneIncoming}
        color="red"
      />
      <StatCard
        title="Recovery Rate (Today)"
        value={`${recoveryRate}%`}
        icon={Activity}
        color="purple"
        trend={recoveryRate >= 50 ? 'Excellent' : 'Needs Attention'}
        trendUp={recoveryRate >= 50}
      />
      <StatCard
        title="WhatsApp Sent Today"
        value={whatsappSent}
        icon={MessageSquare}
        color="green"
      />
    </div>
  )
}
