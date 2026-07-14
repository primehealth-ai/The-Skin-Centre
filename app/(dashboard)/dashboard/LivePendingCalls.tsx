'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'
import StatCard from '@/components/dashboard/StatCard'
import { PhoneMissed } from 'lucide-react'

export default function LivePendingCalls({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount)
  // Fix 2: guard createClient() in useRef so the reference is stable across renders
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  useEffect(() => {
    // We only care about missed calls that change to 'pending' or change out of 'pending'
    // or new inserts that are 'pending'.
    // INSERT: if status === 'pending', count++
    // UPDATE: if old status was 'pending' and new is not, count--. If old wasn't and new is, count++
    // DELETE: if status === 'pending', count--
    async function setup() {
      // Fix 1: Deduplicate channel on singleton — remove any existing slot before
      // subscribing, preventing channel exhaustion across page navigations.
      const existing = supabase.getChannels().find((c: RealtimeChannel) => c.topic === 'realtime:live-pending-calls')
      if (existing) await supabase.removeChannel(existing)

      channel = supabase
        .channel('live-pending-calls')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'missed_calls' },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              if (payload.new.status === 'pending') setCount(c => c + 1)
            } else if (payload.eventType === 'UPDATE') {
              const wasPending = payload.old.status === 'pending'
              const isPending = payload.new.status === 'pending'
              if (wasPending && !isPending) setCount(c => Math.max(0, c - 1))
              if (!wasPending && isPending) setCount(c => c + 1)
            } else if (payload.eventType === 'DELETE') {
              if (payload.old.status === 'pending') setCount(c => Math.max(0, c - 1))
            }
          }
        )
        .subscribe()
    }

    let channel: ReturnType<typeof supabase.channel> | undefined
    setup()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <StatCard
      title="Live Pending Recoveries"
      value={count}
      icon={PhoneMissed}
      color="red"
      trend={count > 0 ? "Urgent Action Required" : "All Caught Up"}
      trendUp={count === 0}
    />
  )
}
