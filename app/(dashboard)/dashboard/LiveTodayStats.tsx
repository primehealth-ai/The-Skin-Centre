'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
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
  // Fix 3: wrapped in useCallback with correct deps so the Realtime handler always
  // closes over the current startOfTodayISO value, not a stale first-render copy.
  const refetchCounts = useCallback(async () => {
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
  }, [supabase, startOfTodayISO])

  useEffect(() => {
    async function setup() {
      // Fix 1: Deduplicate all 3 channels on singleton — remove any existing slots
      // before subscribing, preventing channel exhaustion across page navigations.
      const channelNames = [
        'realtime:live-today-stats-calls',
        'realtime:live-today-stats-missed',
        'realtime:live-today-stats-whatsapp',
      ]
      await Promise.all(
        supabase.getChannels()
          .filter((c: RealtimeChannel) => channelNames.includes(c.topic))
          .map((c: RealtimeChannel) => supabase.removeChannel(c))
      )

      callsChannel = supabase
        .channel('live-today-stats-calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, refetchCounts)
        .subscribe()

      missedChannel = supabase
        .channel('live-today-stats-missed')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'missed_calls' }, refetchCounts)
        .subscribe()

      waChannel = supabase
        .channel('live-today-stats-whatsapp')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages' }, refetchCounts)
        .subscribe()
    }

    let callsChannel: ReturnType<typeof supabase.channel> | undefined
    let missedChannel: ReturnType<typeof supabase.channel> | undefined
    let waChannel: ReturnType<typeof supabase.channel> | undefined
    setup()

    return () => {
      if (callsChannel) supabase.removeChannel(callsChannel)
      if (missedChannel) supabase.removeChannel(missedChannel)
      if (waChannel) supabase.removeChannel(waChannel)
    }
  }, [refetchCounts])

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
